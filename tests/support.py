"""Authored local fixtures only. Never import this into the production server."""
import base64
import json
import os
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from tdev.common import canonical, digest, atomic_write, Fault


def git(*args, cwd=None, data=None):
    return subprocess.check_output(["git", *args], cwd=cwd, input=data, stderr=subprocess.DEVNULL).decode().strip()


class Repository:
    def __init__(self, root, object_format="sha1"):
        self.work = Path(root) / "authored"
        self.work.mkdir()
        git("init", "--object-format=" + object_format, "-b", "main", str(self.work))
        git("config", "user.name", "Fixture", cwd=self.work)
        git("config", "user.email", "fixture@localhost", cwd=self.work)
        (self.work / "a.txt").write_text("hello\n")
        (self.work / "b.txt").write_text("world\n")
        git("add", ".", cwd=self.work)
        git("commit", "-m", "base", cwd=self.work)
        self.head = git("rev-parse", "HEAD", cwd=self.work)
        self.remote = Path(root) / "remote.git"
        git("init", "--object-format=" + object_format, "--bare", str(self.remote))
        git("push", str(self.remote), "HEAD:refs/heads/main", cwd=self.work)
        st = self.remote.stat()
        self.config = {"version": 1, "principals": {"alice": {"tokenHash": digest(b"alice-secret"), "repos": {"test": ["refs/heads/main"]}}},
                       "repositories": {"test": {"kind": "local", "remote": str(self.remote),
                                                  "identity": f"local:{st.st_dev}:{st.st_ino}",
                                                  "refs": ["refs/heads/main"], "validation": "test -f a.txt"}}}


class TrustedFixtureExecutor:
    """Not a sandbox. Tests supply only authored commands; stores never contain secrets."""
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir()
        self.jobs = {}
        self.launches = 0
        self.mutex = threading.RLock()

    def submit(self, payload):
        with self.mutex:
            if payload["id"] in self.jobs:
                return {}
            self.launches += 1
            p = self.root / payload["id"]
            p.mkdir()
            for f in payload["files"]:
                dest = p / f["path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                data = base64.b64decode(f["data"])
                if f["mode"] == "120000":
                    dest.symlink_to(data.decode())
                else:
                    dest.write_bytes(data)
                    dest.chmod(0o755 if f["mode"] == "100755" else 0o644)
            log = tempfile.TemporaryFile()
            if "gitPack" in payload:
                from tdev.executor import prepare_git
                prepare_git(p, payload)
            proc = subprocess.Popen(["sh", "-c", payload["command"]], cwd=p / payload["cwd"],
                                    env={"PATH": os.environ["PATH"], **payload["env"]},
                                    stdin=subprocess.PIPE, stdout=log, stderr=log, start_new_session=True)
            if payload["stdin"]:
                proc.stdin.write(payload["stdin"].encode())
                proc.stdin.flush()
            self.jobs[payload["id"]] = {"payload": payload, "proc": proc, "log": log, "path": p, "sequence": 0, "controls": {}, "cancelled": False}

    def observe(self, ident):
        job = self.jobs[ident]
        code = job["proc"].poll()
        if code is None:
            return {"terminal": False}
        files = []
        for p in sorted(job["path"].rglob("*")):
            if ".git" in p.relative_to(job["path"]).parts:
                continue
            if p.is_symlink():
                data, mode = os.readlink(p).encode(), "120000"
            elif p.is_file():
                data, mode = p.read_bytes(), "100755" if p.stat().st_mode & 0o111 else "100644"
            else:
                continue
            files.append({"path": str(p.relative_to(job["path"])), "mode": mode, "data": base64.b64encode(data).decode()})
        return {"id": ident, "inputDigest": digest(job["payload"]), "terminal": True,
                "stopped": True, "exitCode": code, "files": files, "cancelled": job["cancelled"]}

    def logs(self, ident, offset, limit):
        log = self.jobs[ident]["log"]
        data = os.pread(log.fileno(), min(limit, 65536), offset)
        return {"offset": offset, "nextOffset": offset + len(data), "data": base64.b64encode(data).decode(), "encoding": "base64"}

    def control(self, ident, args, control_id):
        j = self.jobs[ident]
        if control_id in j["controls"]:
            return j["controls"][control_id]
        if args["action"] == "cancel":
            j["cancelled"] = True
            os.killpg(j["proc"].pid, signal.SIGKILL)
            result = {"cancelRequested": True}
        else:
            if args["sequence"] != j["sequence"]:
                raise Fault("STDIN_SEQUENCE")
            j["sequence"] += 1
            j["proc"].stdin.write(args["text"].encode())
            j["proc"].stdin.flush()
            if args.get("eof"):
                j["proc"].stdin.close()
            result = {"delivery": "committed", "nextSequence": j["sequence"]}
        j["controls"][control_id] = result
        return result

    def close(self):
        for job in self.jobs.values():
            if job["proc"].poll() is None:
                os.killpg(job["proc"].pid, signal.SIGKILL)
            job["proc"].wait()
            if not job["proc"].stdin.closed:
                job["proc"].stdin.close()
            job["log"].close()

    def control_status(self, ident, control_id):
        result = self.jobs[ident]["controls"].get(control_id)
        return {"known": True, "result": result} if result else {"known": False}

    def retire(self, ident, control_id):
        if self.jobs[ident]["proc"].poll() is None:
            raise Fault("STOP_PROOF_REQUIRED")
        result = {"retired": True}
        self.jobs[ident]["controls"][control_id] = result
        return result
