import base64
import json
import os
import time
from unittest.mock import patch

from test_core import Base
from tdev.common import Fault
from tdev.core import Controller
from tdev.native import NativeExecutor, identity
from support import git


class NativeTest(Base):
    def setUp(self):
        super().setUp()
        self.c.executor_override = None

    def execute(self, w, command, **extra):
        return self.call("exec", {"requestId": "exec", "taskId": w["taskId"],
                                "expected": w["checkpoint"], "command": command, **extra})

    def test_default_complete_path_and_clean_environment(self):
        w = self.open()
        with patch.dict(os.environ, {"TDEV_TEST_SECRET": "fixture-only", "GH_TOKEN": "fixture-only", "SSH_AUTH_SOCK": "/fixture/agent"}):
            op = self.execute(w, "test -z \"${GH_TOKEN-}${SSH_AUTH_SOCK-}${TDEV_TEST_SECRET-}\" && git rev-parse HEAD && python -c 'print(2+2)' && node -e 'console.log(3)' && rg hello a.txt && printf native > a.txt")
        done = self.wait(op["id"])
        self.assertEqual(done["status"], "succeeded", done)
        self.assertIn(w["checkpoint"], base64.b64decode(done["output"]["data"]).decode())
        self.assertEqual((self.repo.work / "a.txt").read_text(), "hello\n")
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": done["result"]["checkpoint"], "message": "native"})
        validated = self.wait(v["id"])
        self.assertEqual(validated["status"], "succeeded", validated)
        p = self.call("publish", {"requestId": "p", "validationId": v["id"], "expectedHead": self.repo.head})
        self.assertEqual(p["status"], "succeeded", p)
        self.assertEqual(git("--git-dir=" + str(self.repo.remote), "rev-parse", "refs/heads/main"), validated["result"]["candidate"])
        retired = self.call("operation", {"action": "retire", "requestId": "retire", "operationId": op["id"]})
        self.assertEqual(retired["result"], {"retired": True})

    def test_operator_tooling_environment_reused_and_policy_bound(self):
        tooling = self.root / "operator-tooling"
        tooling.mkdir()
        (tooling / "fixturetool.py").write_text("VALUE = 'shared-tooling'\n")
        repo = self.repo.config["repositories"]["test"]
        repo["toolingEnvironment"] = {"PYTHONPATH": str(tooling)}
        repo["validation"] = "python -c \"import fixturetool; assert fixturetool.VALUE == 'shared-tooling'\""
        w = self.open()
        op = self.execute(w, "python -c \"import fixturetool; print(fixturetool.VALUE)\"")
        done = self.wait(op["id"])
        self.assertEqual(done["status"], "succeeded", done)
        self.assertEqual(base64.b64decode(done["output"]["data"]).decode().strip(), "shared-tooling")
        v = self.call("validate", {"requestId": "tooling-v", "taskId": w["taskId"],
                                  "expected": done["result"]["checkpoint"], "message": "tooling"})
        validated = self.wait(v["id"])
        self.assertEqual(validated["status"], "succeeded", validated)
        repo["toolingEnvironment"] = {"PYTHONPATH": str(self.root / "different-tooling")}
        p = self.call("publish", {"requestId": "tooling-p", "validationId": v["id"],
                                 "expectedHead": self.repo.head})
        self.assertEqual(p["effect"], "none")
        self.assertEqual(p["error"]["code"], "POLICY_CHANGED")

    def test_warm_tooling_does_not_replace_candidate_or_private_environment(self):
        tooling = self.root / "tooling"
        tooling.mkdir()
        (tooling / "dependency.py").write_text("VALUE = 'dependency'\n")
        (tooling / "candidate.py").write_text("VALUE = 'wrong-source'\n")
        repo = self.repo.config["repositories"]["test"]
        repo["toolingEnvironment"] = {"PYTHONPATH": str(tooling)}
        repo["validation"] = "python -c \"import candidate,dependency,os; assert candidate.VALUE == 'exact'; assert dependency.VALUE == 'dependency'; assert not os.getenv('GH_TOKEN')\""
        w = self.open()
        edited = self.call("edit", {"requestId": "candidate", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "put", "path": "candidate.py", "before": None, "content": "VALUE = 'exact'\n"}]})
        with patch.dict(os.environ, {"GH_TOKEN": "sentinel-not-a-secret"}):
            v = self.call("validate", {"requestId": "source-first", "taskId": w["taskId"], "expected": edited["result"]["checkpoint"], "message": "source-first"})
        self.assertEqual(self.wait(v["id"])["status"], "succeeded")
        # The same warm environment never exempts candidate source from integrity checks.
        repo["validation"] = "printf changed > candidate.py"
        bad = self.call("validate", {"requestId": "source-change", "taskId": w["taskId"], "expected": edited["result"]["checkpoint"], "message": "reject"})
        self.assertEqual(self.wait(bad["id"])["result"]["captureError"], "VALIDATION_SOURCE_CHANGED")

    def test_stdin_replay_and_controller_restart(self):
        w = self.open()
        op = self.execute(w, "read value; printf '%s' \"$value\" > a.txt; printf '%s' \"$value\"")
        self.c.close()
        self.c = Controller(self.root / "state", self.repo.config)
        args = {"action": "stdin", "requestId": "stdin", "operationId": op["id"], "sequence": 0, "text": "once\n", "eof": True}
        first = self.call("operation", args)
        self.assertEqual(self.call("operation", args), first)
        done = self.wait(op["id"])
        self.assertEqual(done["status"], "succeeded", done)
        self.assertEqual(base64.b64decode(done["output"]["data"]), b"once")

    def test_validation_cannot_change_source_or_pass_by_stdout(self):
        for command, expected in (("printf changed > a.txt; printf PASS", "VALIDATION_SOURCE_CHANGED"),
                                  ("printf '{\"exitCode\":0}'; exit 9", None)):
            with self.subTest(command=command):
                self.repo.config["repositories"]["test"]["validation"] = command
                w = self.open()
                v = self.call("validate", {"requestId": "v" + str(self.counter), "taskId": w["taskId"], "expected": w["checkpoint"], "message": "reject"})
                result = self.wait(v["id"])
                self.assertEqual(result["status"], "failed", result)
                if expected:
                    self.assertEqual(result["result"]["captureError"], expected)
                p = self.call("publish", {"requestId": "p" + str(self.counter), "validationId": v["id"], "expectedHead": self.repo.head})
                self.assertEqual(p["error"]["code"], "VALIDATION_REQUIRED")

    def test_timeout_and_bounded_output_keep_captured_edits(self):
        w = self.open()
        op = self.execute(w, "printf partial > a.txt; sleep 30", timeout=1)
        result = self.wait(op["id"])
        self.assertTrue(result["result"]["timedOut"])
        self.assertNotEqual(result["result"]["checkpoint"], w["checkpoint"])
        w = self.open()
        op = self.call("exec", {"requestId": "output", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "python -c 'print(\"x\"*1200000)'"})
        result = self.wait(op["id"])
        self.assertEqual(result["status"], "succeeded", result)
        self.assertGreater(result["result"]["discardedBytes"], 0)
        self.assertEqual((self.root / "state/native" / op["id"] / "output").stat().st_size, 1048576)

    def test_cancellation_reaps_detached_descendant(self):
        w = self.open()
        op = self.execute(w, "python -c 'import subprocess,time; p=subprocess.Popen([\"sleep\",\"30\"],start_new_session=True); print(p.pid,flush=True); time.sleep(30)'")
        child_pid = None
        for _ in range(100):
            value = self.call("operation", {"action": "status", "operationId": op["id"]})
            output = base64.b64decode(value.get("output", {}).get("data", ""))
            if output:
                child_pid = int(output.strip())
                break
            time.sleep(.02)
        self.assertIsNotNone(child_pid)
        self.call("operation", {"action": "cancel", "requestId": "cancel", "operationId": op["id"]})
        result = self.wait(op["id"])
        self.assertTrue(result["result"]["cancelled"])
        self.assertIsNone(identity(child_pid))

    def test_native_network_and_symlink_claims_are_honest(self):
        w = self.open()
        denied = self.execute(w, "true", network="none")
        self.assertEqual(denied["effect"], "none")
        self.assertEqual(denied["error"]["code"], "NETWORK_DENIED")
        op = self.call("exec", {"requestId": "link", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "ln -s /outside escape"})
        result = self.wait(op["id"])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.c.task("alice", w["taskId"])["checkpoint"], w["checkpoint"])

    def test_lost_dispatch_reply_does_not_launch_twice(self):
        w = self.open()
        original = NativeExecutor.submit
        def lost(executor, payload):
            original(executor, payload)
            raise Fault("LOST_REPLY", effect="unknown")
        args = {"requestId": "lost", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "printf once >> a.txt"}
        with patch.object(NativeExecutor, "submit", lost):
            op = self.call("exec", args)
        self.assertEqual(op["effect"], "unknown")
        self.assertEqual(self.call("exec", args)["id"], op["id"])
        result = self.wait(op["id"])
        self.assertEqual(result["status"], "succeeded", result)
        g = self.c.git("test")
        self.assertEqual(g.blob(g.entries(result["result"]["checkpoint"])["a.txt"][1]), b"hello\nonce")

    def test_explicit_ssh_failure_and_legacy_intent_never_fall_back(self):
        w = self.open()
        remote = {"target": "fixture", "script": "/runner", "digest": "a" * 64,
                  "spool": "/spool", "image": "fixture@sha256:" + "a" * 64,
                  "knownHosts": "/hosts", "identityFile": "/key"}
        self.repo.config["repositories"]["test"]["executor"] = remote
        with patch("tdev.remote.SSHExecutor") as ssh, patch.object(NativeExecutor, "submit") as native:
            ssh.return_value.submit.side_effect = Fault("EXECUTOR_TRANSPORT", effect="unknown")
            op = self.execute(w, "printf must-not-fallback > a.txt")
            self.assertEqual(op["effect"], "unknown")
            native.assert_not_called()
            ssh.assert_called_with(remote)
        with self.assertRaises(Fault) as error:
            self.c.backend({"executor": None})
        self.assertEqual(error.exception.value["code"], "EXECUTOR_IDENTITY_MISSING")

    def test_missing_supervisor_identity_fences_only_affected_task(self):
        w = self.open()
        op = self.execute(w, "read value; printf '%s' \"$value\" >> a.txt", timeout=10)
        job = self.root / "state/native" / op["id"]
        deadline = time.monotonic() + 5
        while not (job / "worker.json").exists():
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.02)
        # Inject loss of OS process identity, not a fabricated successful receipt.
        with patch("tdev.native.identity", return_value=None):
            unknown = self.call("operation", {"action": "status", "operationId": op["id"]})
        self.assertEqual(unknown["effect"], "unknown")
        self.assertEqual(unknown["error"]["code"], "NATIVE_SUPERVISOR_LOST")
        other = self.open()
        edited = self.call("edit", {"requestId": "other-edit", "taskId": other["taskId"], "expected": other["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "independent"}]})
        self.assertEqual(edited["status"], "succeeded")
        self.assertEqual(self.c.task("alice", w["taskId"])["busy"], op["id"])
        self.call("operation", {"action": "stdin", "requestId": "recover-input", "operationId": op["id"], "sequence": 0, "text": "recovered\n", "eof": True})
        self.assertEqual(self.wait(op["id"])["status"], "succeeded")
