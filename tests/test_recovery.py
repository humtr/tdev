import base64
import copy
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from test_core import Base
from tdev.common import Fault, digest
from support import Repository, git


class RecoveryTest(Base):
    def test_parallel_refs_have_no_shared_fetch_head(self):
        self.open()
        (self.repo.work / "b.txt").write_text("other ref")
        git("add", ".", cwd=self.repo.work)
        git("commit", "-m", "other ref", cwd=self.repo.work)
        other = git("rev-parse", "HEAD", cwd=self.repo.work)
        git("push", str(self.repo.remote), "HEAD:refs/heads/other", cwd=self.repo.work)
        self.repo.config["repositories"]["test"]["refs"].append("refs/heads/other")
        self.repo.config["principals"]["alice"]["repos"]["test"].append("refs/heads/other")
        self.c.config = self.c.load_config()
        g = self.c.git("test")
        (g.root / "FETCH_HEAD").write_text("unrelated observation\n")
        with ThreadPoolExecutor(2) as pool:
            futures = [pool.submit(g.fetch, ref, oid) for ref, oid in
                       (("refs/heads/main", self.repo.head), ("refs/heads/other", other))]
            for future in futures:
                future.result(timeout=10)
        self.assertEqual((g.root / "FETCH_HEAD").read_text(), "unrelated observation\n")
        self.assertEqual(g.call("cat-file", "-t", other).stdout.strip(), b"commit")

    def test_lost_publish_response_readback_no_second_effect(self):
        w = self.open()
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": w["checkpoint"], "message": "exact"})
        self.wait(v["id"])
        g = self.c.git("test")
        original = g.publish
        def lost(*args):
            original(*args)
            raise Fault("LOST_RESPONSE", effect="unknown")
        with patch.object(g, "publish", side_effect=lost) as sender:
            a = {"requestId": "p", "validationId": v["id"], "expectedHead": self.repo.head}
            p = self.call("publish", a)
            self.assertEqual(p["effect"], "unknown")
            self.assertEqual(self.wait(p["id"])["status"], "succeeded")
            self.call("publish", a)
            self.assertEqual(sender.call_count, 1)

    def test_remote_head_changes_after_validation(self):
        w = self.open()
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": w["checkpoint"], "message": "exact"})
        self.wait(v["id"])
        (self.repo.work / "b.txt").write_text("other writer")
        git("add", ".", cwd=self.repo.work)
        git("commit", "-m", "other", cwd=self.repo.work)
        git("push", str(self.repo.remote), "HEAD:refs/heads/main", cwd=self.repo.work)
        p = self.call("publish", {"requestId": "p", "validationId": v["id"], "expectedHead": self.repo.head})
        self.assertEqual(p["effect"], "none")
        self.assertEqual(p["error"]["code"], "STALE_HEAD")

    def test_stdin_sequence_replay_and_output_cursor(self):
        w = self.open()
        op = self.call("exec", {"requestId": "input", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "read x; printf '%s' \"$x\" > a.txt; printf '%s' \"$x\""})
        args = {"action": "stdin", "requestId": "stdin", "operationId": op["id"], "sequence": 0, "text": "hi\n"}
        sent = self.call("operation", args)
        self.assertEqual(self.call("operation", args), sent)
        done = self.wait(op["id"])
        output = done["output"]
        self.assertEqual(base64.b64decode(output["data"]), b"hi")
        next_read = self.call("operation", {"action": "status", "operationId": op["id"], "offset": 1, "limit": 1})
        self.assertEqual(base64.b64decode(next_read["output"]["data"]), b"i")

    def test_forged_outer_identity_never_releases_writer(self):
        w = self.open()
        op = self.call("exec", {"requestId": "forged", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "true"})
        with patch.object(self.executor, "observe", return_value={"id": op["id"], "inputDigest": "forged", "terminal": True, "stopped": True, "exitCode": 0, "files": []}):
            result = self.call("operation", {"action": "status", "operationId": op["id"]})
        self.assertEqual(result["effect"], "unknown")
        self.assertEqual(self.c.task("alice", w["taskId"])["busy"], op["id"])
        self.assertEqual(self.wait(op["id"])["status"], "succeeded")

    def test_aba_and_composition(self):
        w1, w2 = self.open(), self.open()
        edits = []
        for i, (w, filename) in enumerate(((w1, "a.txt"), (w2, "b.txt"))):
            old = "hello" if i == 0 else "world"
            op = self.call("edit", {"requestId": "compose" + str(i), "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": filename, "old": old, "text": "changed"}]})
            edits.append(op["result"])
        combined = self.call("task", {"action": "compose", "requestId": "combine", "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head, "sources": [{"taskId": e["taskId"], "checkpoint": e["checkpoint"]} for e in edits]})
        self.assertEqual(combined["status"], "succeeded")
        revert = self.call("edit", {"requestId": "revert", "taskId": w1["taskId"], "expected": edits[0]["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "changed", "text": "hello"}]})
        self.assertNotEqual(revert["result"]["checkpoint"], w1["checkpoint"])
        self.assertEqual(self.c.git("test").tree(revert["result"]["checkpoint"]), self.c.git("test").tree(w1["checkpoint"]))

    def test_second_repo_and_principal(self):
        other_root = self.root / "other"
        other_root.mkdir()
        other = Repository(other_root)
        self.repo.config["repositories"]["other"] = other.config["repositories"]["test"]
        self.repo.config["principals"]["bob"] = {"tokenHash": digest(b"bob-secret"), "repos": {"other": ["refs/heads/main"]}}
        w = self.open()
        other_w = self.call("task", {"action": "open", "requestId": "bobopen", "repo": "other", "ref": "refs/heads/main", "expectedHead": other.head}, "bob")
        self.assertEqual(other_w["status"], "succeeded")
        denied = self.c.call("bob", "tdev_read", {"taskId": w["taskId"], "checkpoint": w["checkpoint"], "queries": [{"action": "list"}]})
        self.assertFalse(denied["ok"])

    def test_no_executor_config_uses_real_native_runner(self):
        w = self.open()
        self.c.executor_override = None
        op = self.call("exec", {"requestId": "native", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "printf native > a.txt"})
        done = self.wait(op["id"])
        self.assertEqual(done["status"], "succeeded", done)
        self.assertEqual(self.executor.launches, 0)

    def test_git_and_installed_cli_are_normal_commands(self):
        w = self.open()
        command = "git rev-parse HEAD; git status --porcelain; python -c 'print(2+2)'; node -e 'process.stdout.write(\"node\\n\")'; rg hello a.txt"
        op = self.call("exec", {"requestId": "cli", "taskId": w["taskId"], "expected": w["checkpoint"], "command": command})
        result = self.wait(op["id"])
        self.assertEqual(result["status"], "succeeded", result)
        output = base64.b64decode(result["output"]["data"]).decode()
        self.assertIn(w["checkpoint"], output)
        self.assertIn("4\nnode\nhello", output)

    def test_stopped_capture_failure_releases_only_its_writer(self):
        w = self.open()
        op = self.call("exec", {"requestId": "capture-loss", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "true"})
        row = self.c.store.one("SELECT intent FROM operation WHERE id=?", (op["id"],))
        expected = json.loads(row["intent"])["inputDigest"]
        with patch.object(self.executor, "observe", return_value={"id": op["id"], "inputDigest": expected, "terminal": True, "stopped": True, "exitCode": None, "cancelled": True, "captureError": "WORKER_INTERRUPTED"}):
            result = self.wait(op["id"])
        self.assertEqual(result["status"], "failed")
        current = self.c.task("alice", w["taskId"])
        self.assertIsNone(current["busy"])
        self.assertEqual(current["checkpoint"], w["checkpoint"])

    def test_nonforce_push_checks_advertised_old_even_after_admin_rewind(self):
        first = self.repo.head
        (self.repo.work / "b.txt").write_text("second")
        git("add", ".", cwd=self.repo.work)
        git("commit", "-m", "second", cwd=self.repo.work)
        second = git("rev-parse", "HEAD", cwd=self.repo.work)
        git("push", str(self.repo.remote), "HEAD:refs/heads/main", cwd=self.repo.work)
        self.repo.head = second
        w = self.open()
        g = self.c.git("test")
        candidate = g.commit(g.tree(second), second, "candidate")
        # Disposable bare fixture simulates an administrator violating enrollment.
        git("--git-dir=" + str(self.repo.remote), "update-ref", "refs/heads/main", first, second)
        with self.assertRaises(Fault):
            g.push_ref("refs/heads/main", second, candidate)
        self.assertEqual(g.head("refs/heads/main"), first)
        git("--git-dir=" + str(self.repo.remote), "update-ref", "refs/heads/main", second, first)
        g.push_ref("refs/heads/main", second, candidate)
        self.assertEqual(g.head("refs/heads/main"), candidate)

    def test_validation_git_head_is_the_exact_published_commit(self):
        self.repo.config["repositories"]["test"]["validation"] = "git rev-parse HEAD"
        w = self.open()
        v = self.call("validate", {"requestId": "head", "taskId": w["taskId"], "expected": w["checkpoint"], "message": "head"})
        result = self.wait(v["id"])
        self.assertEqual(base64.b64decode(result["output"]["data"]).decode().strip(), result["result"]["candidate"])

    def test_slow_reconcile_does_not_block_unrelated_operation(self):
        w1, w2 = self.open(), self.open()
        ops = [self.call("exec", {"requestId": "parallel" + str(i), "taskId": w["taskId"], "expected": w["checkpoint"], "command": "true"})
               for i, w in enumerate((w1, w2))]
        entered, release = threading.Event(), threading.Event()
        original = self.executor.observe
        def observe(ident):
            if ident == ops[0]["id"]:
                entered.set()
                release.wait(5)
            return original(ident)
        with patch.object(self.executor, "observe", side_effect=observe), ThreadPoolExecutor(2) as pool:
            slow = pool.submit(self.call, "operation", {"action": "status", "operationId": ops[0]["id"]})
            try:
                self.assertTrue(entered.wait(2))
                fast = pool.submit(self.call, "operation", {"action": "status", "operationId": ops[1]["id"]})
                self.assertEqual(fast.result(timeout=2)["status"], "succeeded")
            finally:
                release.set()
            slow.result(timeout=3)

    def test_capture_error_with_partial_files_never_imports(self):
        w = self.open()
        op = self.call("exec", {"requestId": "partial", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "true"})
        intent = json.loads(self.c.store.one("SELECT intent FROM operation WHERE id=?", (op["id"],))["intent"])
        receipt = {"id": op["id"], "inputDigest": intent["inputDigest"], "terminal": True, "stopped": True,
                   "exitCode": 0, "captureError": "TRANSFER_FAILED", "files": []}
        with patch.object(self.executor, "observe", return_value=receipt):
            result = self.wait(op["id"])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.c.task("alice", w["taskId"])["checkpoint"], w["checkpoint"])

    def test_terminal_creator_does_not_prevent_resource_retirement(self):
        w = self.open()
        op = self.call("exec", {"requestId": "finish", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "true"})
        self.wait(op["id"])
        args = {"action": "retire", "requestId": "retire", "operationId": op["id"]}
        retired = self.call("operation", args)
        self.assertEqual(retired["result"], {"retired": True})
        self.assertEqual(self.call("operation", args), retired)

    def test_stdin_lost_ack_is_observed_without_redelivery(self):
        w = self.open()
        op = self.call("exec", {"requestId": "read", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "read x; printf '%s' \"$x\""})
        original = self.executor.control
        def lost(*args):
            original(*args)
            raise Fault("LOST_ACK", effect="unknown")
        args = {"action": "stdin", "requestId": "input", "operationId": op["id"], "sequence": 0, "text": "once\n"}
        with patch.object(self.executor, "control", side_effect=lost) as send:
            sent = self.call("operation", args)
            self.assertEqual(sent["effect"], "unknown")
            self.assertEqual(self.wait(sent["id"])["status"], "succeeded")
            self.call("operation", args)
            self.assertEqual(send.call_count, 1)
        result = self.wait(op["id"])
        self.assertEqual(base64.b64decode(result["output"]["data"]), b"once")
