import base64
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev.executor import InputPump, arguments, capture_process, capture_tar, materialize, rpc, safe_link, save, worker, sha
from support import git


class ExecutorTest(unittest.TestCase):
    def test_stalled_capture_pipe_is_killed_before_tar_read_can_hang(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], stdout=subprocess.PIPE)
            with self.assertRaises((tarfile.ReadError, RuntimeError)):
                capture_process(proc, [], [], Path(tmp), timeout=.1)
            self.assertIsNotNone(proc.poll())
            self.assertTrue(proc.stdout.closed)

    def test_outer_worker_full_fixture_seals_real_exit_and_capture_failure(self):
        # Exercise outer control flow with authored subprocesses. This does not
        # qualify a real Podman kernel boundary or remote filesystem capture.
        original_popen = subprocess.Popen
        for copy_exit in (0, 7):
            with self.subTest(copy_exit=copy_exit), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                ident = "a" * 32
                job = root / ident
                job.mkdir()
                payload = {"id": ident, "files": [], "checkpoint": "b" * 40, "command": "authored fixture",
                           "network": "none", "timeout": 10, "readonly": False, "cwd": ".", "env": {}, "stdin": "", "capturePaths": []}
                save(job / "request.json", payload)
                running = {"value": False}
                def fake_engine(args, **kwargs):
                    if args[0] == "run":
                        running["value"] = True
                    if args[0] == "kill":
                        running["value"] = False
                    return subprocess.CompletedProcess(args, 0, b"", b"")
                def fake_inspect(*args):
                    return {"Running": running["value"], "Pid": 42 if running["value"] else 0}
                def launch(args, **kwargs):
                    if args[:2] == ["podman", "exec"]:
                        return original_popen([sys.executable, "-c", "print('candidate PASS'); raise SystemExit(9)"], **kwargs)
                    if args[:2] == ["podman", "cp"]:
                        code = "import sys,tarfile,io; t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|'); e=tarfile.TarInfo('file'); e.size=3; t.addfile(e,io.BytesIO(b'new')); t.close(); raise SystemExit(" + str(copy_exit) + ")"
                        return original_popen([sys.executable, "-c", code], **kwargs)
                    return original_popen(args, **kwargs)
                with patch("tdev.executor.preflight"), patch("tdev.executor.prepare_git"), patch("tdev.executor.engine", side_effect=fake_engine), patch("tdev.executor.inspect", side_effect=fake_inspect), patch("tdev.executor.subprocess.Popen", side_effect=launch):
                    worker(tmp, "image", ident)
                result = json.loads((job / "result.json").read_bytes())
                self.assertEqual(result["exitCode"], 9)
                self.assertTrue(result["stopped"])
                self.assertEqual(result["inputDigest"], sha(payload))
                if copy_exit:
                    self.assertIn("captureError", result)
                    self.assertNotIn("files", result)
                else:
                    self.assertEqual(result["files"][0]["data"], "bmV3")

    def test_initial_stdin_does_not_skip_next_message_and_small_writes_flush(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            readfd, writefd = os.pipe()
            stream = os.fdopen(writefd, "wb")
            os.set_blocking(writefd, False)
            try:
                save(root / "stdin-0.json", {"text": "second\n", "eof": True})
                pump = InputPump(root, "first\n")
                pump.step(stream)
                self.assertEqual(os.read(readfd, 1024), b"first\n")
                self.assertFalse((root / "delivery-0.json").exists())
                pump.step(stream)
                self.assertEqual(os.read(readfd, 1024), b"second\n")
                self.assertEqual(os.read(readfd, 1024), b"")
                self.assertEqual(json.loads((root / "delivery-0.json").read_bytes()), {"delivery": "committed"})
            finally:
                stream.close()
                os.close(readfd)

    def test_stdin_partial_write_never_duplicates_and_broken_pipe_is_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            save(root / "stdin-0.json", {"text": "abcd"})
            stream = unittest.mock.Mock()
            pump = InputPump(root, "")
            with patch("tdev.executor.os.write", side_effect=[2, BlockingIOError(), 2]) as write:
                for _ in range(3):
                    pump.step(stream)
                self.assertEqual([c.args[1] for c in write.call_args_list], [b"abcd", b"cd", b"cd"])
            self.assertEqual(pump.sequence, 1)
            save(root / "stdin-1.json", {"text": "x"})
            with patch("tdev.executor.os.write", side_effect=BrokenPipeError()):
                pump.step(stream)
            self.assertEqual(json.loads((root / "delivery-1.json").read_bytes())["delivery"], "unknown")

    def test_isolation_arguments_no_host_credentials_or_socket(self):
        p = {"network": "none", "timeout": 20}
        argv = arguments("a" * 32, p, Path("/private/source"), "test@sha256:" + "b" * 64)
        for flag in ("--read-only", "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=512m", "--cpus=1", "--userns=keep-id"):
            self.assertIn(flag, argv)
        self.assertEqual(sum("--mount=" in a for a in argv), 1)
        self.assertIn("dst=/input,ro=true", " ".join(argv))
        with self.assertRaises(ValueError):
            arguments("a" * 32, {**p, "network": "internet"}, Path("/private/source"), "image")

    def test_symlinks_and_tar_never_escape(self):
        with self.assertRaises(ValueError):
            safe_link("a", "../outside")
        with self.assertRaises(ValueError):
            safe_link("a", "/etc/passwd")
        safe_link("dir/a", "../b")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(ValueError):
                materialize([{"path": "../outside", "mode": "100644", "data": ""}], root / "bad")
            ignore = root / "ignore"
            git("init", str(ignore))
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode="w") as tar:
                entry = tarfile.TarInfo("../outside")
                entry.size = 1
                tar.addfile(entry, io.BytesIO(b"x"))
            stream.seek(0)
            with self.assertRaises(ValueError):
                capture_tar(stream, [], [], ignore)
            self.assertFalse((root.parent / "outside").exists())

    def test_starting_ignore_and_explicit_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            ignore = Path(tmp) / "ignore"
            git("init", str(ignore))
            (ignore / ".gitignore").write_text("build/\n")
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode="w") as tar:
                for name in ("build/a", "keep", ".git/config"):
                    e = tarfile.TarInfo("./" + name)
                    e.size = 1
                    tar.addfile(e, io.BytesIO(b"x"))
            stream.seek(0)
            self.assertEqual([f["path"] for f in capture_tar(stream, [], [], ignore)], ["keep"])
            stream.seek(0)
            self.assertEqual([f["path"] for f in capture_tar(stream, [], ["build"], ignore)], ["build/a", "keep"])

    def test_lost_launch_response_does_not_launch_twice(self):
        with tempfile.TemporaryDirectory() as tmp:
            request = {"action": "submit", "payload": {"id": "a" * 32, "command": "true"}}
            with patch("tdev.executor.subprocess.Popen") as start:
                first = rpc(tmp, "image", request)
                second = rpc(tmp, "image", request)
                self.assertEqual(first, second)
                self.assertEqual(start.call_count, 1)
                with self.assertRaises(ValueError):
                    rpc(tmp, "image", {"action": "submit", "payload": {"id": "a" * 32, "command": "false"}})

    def test_crash_before_worker_start_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as tmp:
            request = {"action": "submit", "payload": {"id": "a" * 32, "command": "true"}}
            with patch("tdev.executor.subprocess.Popen", side_effect=OSError("injected")):
                with self.assertRaises(OSError):
                    rpc(tmp, "image", request)
            with patch("tdev.executor.subprocess.Popen") as start:
                rpc(tmp, "image", request)
                self.assertEqual(start.call_count, 0)
            self.assertEqual(rpc(tmp, "image", {"action": "observe", "id": "a" * 32}), {"terminal": False})

    def test_retirement_preserves_dedup_after_removing_payload_and_container(self):
        with tempfile.TemporaryDirectory() as tmp:
            job = Path(tmp) / ("a" * 32)
            job.mkdir()
            payload = {"id": "a" * 32, "files": [], "command": "true"}
            save(job / "request.json", payload)
            save(job / "result.json", {"id": payload["id"], "inputDigest": sha(payload), "stopped": True, "terminal": True, "exitCode": 0, "files": []})
            (job / "source").mkdir()
            (job / "source" / "file").write_text("retire me")
            with patch("tdev.executor.inspect", return_value={"Running": False, "Pid": 0}), patch("tdev.executor.engine") as engine_call:
                retired = rpc(tmp, "image", {"action": "retire", "id": payload["id"], "controlId": "b" * 32})
                self.assertEqual(retired, {"retired": True})
                engine_call.assert_called_once_with(["rm", "tdev-" + payload["id"]])
            self.assertFalse((job / "source").exists())
            self.assertFalse((job / "request.json").exists())
            self.assertNotIn("files", json.loads((job / "result.json").read_bytes()))
            with patch("tdev.executor.subprocess.Popen") as launch:
                self.assertEqual(rpc(tmp, "image", {"action": "submit", "payload": payload}), {"accepted": True, "retired": True})
                launch.assert_not_called()
