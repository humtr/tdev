import base64
import json
import os
import shlex
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

    def test_configured_working_bytes_reaches_native_commands_processes_and_validation(self):
        selected = 512 * 1024 * 1024
        self.repo.config['artifactLimits'] = {'workingBytes': selected}
        script = """import os,resource
from pathlib import Path
assert resource.getrlimit(resource.RLIMIT_FSIZE) == (536870912,536870912)
p=Path(os.environ['TMPDIR'])/'large-rollout'
with p.open('wb') as f: f.truncate(173101495)
assert p.is_file() and p.stat().st_size == 173101495
p.unlink()
print('large-file-ok')
"""
        command = 'python -c ' + shlex.quote(script)
        self.repo.config['repositories']['test']['validation'] = command
        for kind in ('command', 'process', 'validate'):
            with self.subTest(kind=kind):
                w = self.open()
                args = {'requestId':'budget-'+kind, 'taskId':w['taskId'], 'expected':w['checkpoint']}
                if kind == 'validate':
                    args['message'] = 'configured native budget'
                    op = self.call('validate', args)
                else:
                    args.update(command=command, mode=kind)
                    op = self.call('exec', args)
                done = self.wait(op['id'])
                self.assertEqual('succeeded', done['status'], done)
                payload = json.loads((self.root/'state/native'/op['id']/'request.json').read_bytes())
                self.assertEqual({'workingBytes':selected}, payload['artifactLimits'])
                intent = json.loads(self.c.operation('alice',op['id'])['intent'])
                self.assertEqual(payload['artifactLimits'], intent['execution']['artifactLimits'])

    def test_default_file_limit_is_preserved_and_over_limit_write_fails(self):
        w = self.open()
        script = """import errno,os,resource,signal
from pathlib import Path
assert resource.getrlimit(resource.RLIMIT_FSIZE) == (134217728,134217728)
signal.signal(signal.SIGXFSZ,signal.SIG_IGN)
p=Path(os.environ['TMPDIR'])/'too-large'
try:
    with p.open('wb') as f: f.truncate(173101495)
except OSError as e:
    assert e.errno == errno.EFBIG
else:
    raise AssertionError('file limit was not enforced')
p.unlink()
"""
        done = self.wait(self.execute(w,'python -c '+shlex.quote(script))['id'])
        self.assertEqual('succeeded',done['status'],done)

    def test_working_budget_is_frozen_across_config_change_and_reconnect(self):
        selected = 512 * 1024 * 1024
        self.repo.config['artifactLimits'] = {'workingBytes': selected}
        w = self.open()
        command = "read value; python -c 'import resource; print(resource.getrlimit(resource.RLIMIT_FSIZE)[0])'"
        args = {'requestId':'frozen-budget', 'taskId':w['taskId'], 'expected':w['checkpoint'], 'command':command}
        op = self.call('exec',args)
        self.repo.config['artifactLimits']['workingBytes'] = 128 * 1024 * 1024
        self.c.close(); self.c = Controller(self.root/'state', self.repo.config)
        self.assertEqual(op['id'],self.call('exec',args)['id'])
        self.call('operation',{'action':'stdin','requestId':'release-budget','operationId':op['id'],
                               'sequence':0,'text':'done\n','eof':True})
        done = self.wait(op['id'])
        self.assertEqual('succeeded',done['status'],done)
        self.assertEqual(str(selected),base64.b64decode(done['output']['data']).decode().strip())

    def test_configured_aggregate_budget_still_rejects_multiple_smaller_files(self):
        self.repo.config['artifactLimits'] = {'workingBytes': 2 * 1024 * 1024}
        w = self.open()
        # Individually below RLIMIT_FSIZE, jointly above the configured working budget.
        script = """import os
from pathlib import Path
for name in ('one','two'):
    with (Path(os.environ['TMPDIR'])/name).open('wb') as f: f.truncate(1500000)
"""
        done = self.wait(self.execute(w,'python -c '+shlex.quote(script))['id'])
        self.assertEqual('failed',done['status'],done)
        self.assertEqual('DISK_LIMIT',done['result']['captureError'])

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

    def test_validation_explicit_deadline_stops_without_success(self):
        self.repo.config['repositories']['test']['validation'] = 'sleep 5'
        w = self.open()
        op = self.call('validate', {'requestId': 'deadline', 'taskId': w['taskId'],
                                  'expected': w['checkpoint'], 'message': 'deadline', 'timeout': 1})
        done = self.wait(op['id'])
        self.assertEqual(done['status'], 'failed', done)
        self.assertTrue(done['result']['timedOut'])
        self.assertTrue(done['result']['stopped'])
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], w['checkpoint'])
        self.assertEqual(self.call('validate', {'requestId': 'deadline', 'taskId': w['taskId'],
                         'expected': w['checkpoint'], 'message': 'deadline', 'timeout': 1})['id'], op['id'])

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
