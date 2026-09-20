import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from support import Repository
from tdev.common import Fault, run
from tdev.core import Controller


class CrashTest(unittest.TestCase):
    def test_native_inflight_survives_sigkill_and_replays_without_relaunch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repository(root)
            config = root / "config.json"
            config.write_text(json.dumps(repo.config))
            config.chmod(0o600)
            program = """import json,sys,time
from tdev.core import Controller
c=Controller(sys.argv[1],sys.argv[2])
w=c.call('alice','tdev_workspace',{'action':'open','requestId':'open','repo':'test','ref':'refs/heads/main','expectedHead':sys.argv[3]})['result']['result']
a={'requestId':'exec','workspaceId':w['workspaceId'],'expected':w['checkpoint'],'command':'read value; printf %s "$value" >> a.txt','timeout':15}
r=c.call('alice','tdev_exec',a)
print(json.dumps([a,r]),flush=True)
time.sleep(60)
"""
            proc = subprocess.Popen([sys.executable, "-c", program, str(root / "state"), str(config), repo.head], stdout=subprocess.PIPE)
            try:
                args, launched = json.loads(proc.stdout.readline())
                self.assertTrue(launched["ok"], launched)
                op = launched["result"]
                deadline = time.monotonic() + 10
                while not (root / "state/native" / op["id"] / "dispatch.json").exists():
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(.02)
                proc.kill()
                proc.wait(timeout=5)
                c = Controller(root / "state", str(config))
                try:
                    self.assertEqual(c.call("alice", "tdev_exec", args)["result"]["id"], op["id"])
                    stdin = {"action": "stdin", "requestId": "input", "operationId": op["id"], "sequence": 0, "text": "once\n", "eof": True}
                    first = c.call("alice", "tdev_process", stdin)
                    self.assertTrue(first["ok"], first)
                    self.assertEqual(c.call("alice", "tdev_process", stdin), first)
                    while True:
                        result = c.call("alice", "tdev_process", {"action": "status", "operationId": op["id"]})["result"]
                        if result["status"] not in ("running", "unknown"):
                            break
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.02)
                    self.assertEqual(result["status"], "succeeded", result)
                    g = c.git("test")
                    self.assertEqual(g.blob(g.entries(result["result"]["checkpoint"])["a.txt"][1]), b"hello\nonce")
                    self.assertEqual(len(list((root / "state/native").glob("*/request.json"))), 1)
                finally:
                    c.close()
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
                proc.stdout.close()

    def test_pre_dispatch_crash_has_no_effect_and_no_stale_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repository(root)
            config = root / "config.json"
            config.write_text(json.dumps(repo.config))
            config.chmod(0o600)
            program = """import os,sys
from tdev.core import Controller
c=Controller(sys.argv[1],sys.argv[2])
w=c.call('alice','tdev_workspace',{'action':'open','requestId':'open','repo':'test','ref':'refs/heads/main','expectedHead':sys.argv[3]})['result']['result']
c.launch=lambda *args: os._exit(77)
c.call('alice','tdev_exec',{'requestId':'exec','workspaceId':w['workspaceId'],'expected':w['checkpoint'],'command':'true'})
"""
            p = subprocess.run([sys.executable, "-c", program, str(root / "state"), str(config), repo.head], timeout=10)
            self.assertEqual(p.returncode, 77)
            c = Controller(root / "state", str(config))
            try:
                result = c.call("alice", "tdev_process", {"action": "status", "lookupRequestId": "exec"})["result"]
                self.assertEqual(result["effect"], "none")
                self.assertEqual(result["status"], "failed")
                self.assertIsNone(c.workspace("alice", result["workspace"])["busy"])
            finally:
                c.close()

    def test_sha256_repository_retains_exact_object_format(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repository(root, "sha256")
            c = Controller(root / "state", repo.config)
            try:
                w = c.call("alice", "tdev_workspace", {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": repo.head})["result"]["result"]
                self.assertEqual(len(w["checkpoint"]), 64)
                e = c.call("alice", "tdev_edit", {"requestId": "edit", "workspaceId": w["workspaceId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "sha256"}]})
                self.assertEqual(e["result"]["status"], "succeeded")
                self.assertEqual(len(e["result"]["result"]["checkpoint"]), 64)
            finally:
                c.close()

    def test_sigkill_releases_controller_lock_and_wal_preserves_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = Repository(root)
            config = root / "config.json"
            config.write_text(json.dumps(repo.config))
            config.chmod(0o600)
            program = """import json,sys,time
from tdev.core import Controller
c=Controller(sys.argv[1],sys.argv[2])
a=c.call('alice','tdev_workspace',{'action':'open','requestId':'open','repo':'test','ref':'refs/heads/main','expectedHead':sys.argv[3]})['result']['result']
r=c.call('alice','tdev_edit',{'requestId':'edit','workspaceId':a['workspaceId'],'expected':a['checkpoint'],'edits':[{'action':'replace','path':'a.txt','old':'hello','text':'durable'}]})
print(json.dumps(r),flush=True)
time.sleep(60)
"""
            p = subprocess.Popen([sys.executable, "-c", program, str(root / "state"), str(config), repo.head], stdout=subprocess.PIPE)
            try:
                result = json.loads(p.stdout.readline())
                self.assertEqual(result["result"]["status"], "succeeded")
                os.kill(p.pid, signal.SIGKILL)
                p.wait(timeout=5)
                c = Controller(root / "state", str(config))
                try:
                    observed = c.call("alice", "tdev_process", {"action": "status", "lookupRequestId": "edit"})
                    self.assertEqual(observed, result)
                finally:
                    c.close()
            finally:
                if p.poll() is None:
                    p.kill()
                    p.wait()
                p.stdout.close()

    def test_fixed_utility_output_and_timeout_are_bounded(self):
        with self.assertRaises(Fault) as error:
            run([sys.executable, "-c", "print('x'*100000)"], limit=1000)
        self.assertEqual(error.exception.value["code"], "OUTPUT_LIMIT")
        with self.assertRaises(Fault) as error:
            run([sys.executable, "-c", "import time; time.sleep(5)"], timeout=.05)
        self.assertEqual(error.exception.value["effect"], "unknown")
