import copy
import json
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tdev.common import Fault, digest, load_contract
from tdev.core import Controller
from support import Repository, TrustedFixtureExecutor, git


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.repo = Repository(self.root)
        self.executor = TrustedFixtureExecutor(self.root / "executor")
        self.c = Controller(self.root / "state", self.repo.config, self.executor)
        self.counter = 0

    def tearDown(self):
        self.c.close()
        self.executor.close()
        self.tmp.cleanup()

    def call(self, tool, args, principal="alice"):
        result = self.c.call(principal, "tdev_" + tool, args)
        from jsonschema import Draft202012Validator
        Draft202012Validator({**self.c.schema, "oneOf": self.c.schema["$defs"]["Output"]["oneOf"]}).validate(result)
        from tdev.server import expanded
        tool_schema = next(t["outputSchema"] for t in self.c.schema["x-tools"] if t["name"] == "tdev_" + tool)
        Draft202012Validator(expanded(self.c.schema, tool_schema)).validate(result)
        self.assertTrue(result["ok"], result)
        return result["result"]

    def open(self):
        self.counter += 1
        result = self.call("task", {"action": "open", "requestId": "open" + str(self.counter), "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head})
        self.assertEqual(result["status"], "succeeded", result)
        return result["result"]

    def wait(self, ident):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            result = self.call("operation", {"action": "status", "operationId": ident})
            if result["status"] not in ("running", "unknown"):
                return result
            time.sleep(.01)
        self.fail(result)


class CoreTest(Base):
    def test_parallel_first_open_observes_complete_git_store(self):
        def opening(i):
            return self.c.call("alice", "tdev_task", {"action": "open", "requestId": "first" + str(i),
                "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head})
        with ThreadPoolExecutor(4) as pool:
            results = list(pool.map(opening, range(4)))
        self.assertTrue(all(r["ok"] and r["result"]["status"] == "succeeded" for r in results), results)
        self.assertEqual(len({r["result"]["result"]["taskId"] for r in results}), 4)

    def test_atomic_edit_replay_stale_and_restart(self):
        w = self.open()
        a = {"requestId": "e1", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "hi"}, {"action": "replace", "path": "b.txt", "old": "missing", "text": "bad"}]}
        failed = self.call("edit", a)
        self.assertEqual(failed["effect"], "none")
        self.assertEqual(self.c.task("alice", w["taskId"])["checkpoint"], w["checkpoint"])
        a["requestId"] = "e2"
        a["edits"].pop()
        edited = self.call("edit", a)
        self.assertEqual(edited["status"], "succeeded", edited)
        self.assertEqual(self.call("edit", a), edited)
        a2 = {**a, "requestId": "stale"}
        self.assertEqual(self.c.call("alice", "tdev_edit", a2)["error"]["code"], "STALE_CHECKPOINT")
        self.c.close()
        self.c = Controller(self.root / "state", self.repo.config, self.executor)
        self.assertEqual(self.call("edit", a), edited)
        a["edits"][0]["text"] = "different"
        self.assertEqual(self.c.call("alice", "tdev_edit", a)["error"]["code"], "IDEMPOTENCY_MISMATCH")
        self.assertEqual((self.repo.work / "a.txt").read_text(), "hello\n")

    def test_racing_writers_one_wins(self):
        w = self.open()
        def change(i):
            return self.c.call("alice", "tdev_edit", {"requestId": "race" + str(i), "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": str(i)}]})
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(change, range(2)))
        self.assertEqual(sum(r["ok"] and r["result"]["status"] == "succeeded" for r in results), 1, results)

    def test_complete_path_nonzero_capture_exact_publication(self):
        w = self.open()
        command = {"requestId": "exec", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "printf changed > a.txt; printf PASS; exit 7"}
        op = self.call("exec", command)
        done = self.wait(op["id"])
        self.assertEqual(done["result"]["exitCode"], 7)
        self.assertEqual(done["status"], "failed")
        self.assertEqual(self.call("exec", command)["id"], op["id"])
        self.assertEqual(self.executor.launches, 1)
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": done["result"]["checkpoint"], "message": "change"})
        validated = self.wait(v["id"])
        self.assertEqual(validated["status"], "succeeded", validated)
        publish = {"requestId": "p", "validationId": v["id"], "expectedHead": self.repo.head}
        p = self.call("publish", publish)
        self.assertEqual(p["status"], "succeeded", p)
        head = git("--git-dir=" + str(self.repo.remote), "rev-parse", "refs/heads/main")
        self.assertEqual(head, validated["result"]["candidate"])
        self.assertEqual(self.call("publish", publish)["id"], p["id"])
        self.assertEqual(self.call("publish", {**publish, "requestId": "p2"})["id"], p["id"])

    def test_failure_stdout_is_not_receipt(self):
        self.repo.config["repositories"]["test"]["validation"] = "printf '{\"exitCode\":0,\"stopped\":true}'; exit 3"
        w = self.open()
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": w["checkpoint"], "message": "bad"})
        self.assertEqual(self.wait(v["id"])["status"], "failed")
        p = self.call("publish", {"requestId": "p", "validationId": v["id"], "expectedHead": self.repo.head})
        self.assertEqual(p["error"]["code"], "VALIDATION_REQUIRED")

    def test_stale_process_does_not_block_other_task_and_restart_no_relaunch(self):
        w, w2 = self.open(), self.open()
        op = self.call("exec", {"requestId": "sleep", "taskId": w["taskId"], "expected": w["checkpoint"], "command": "sleep 30"})
        self.c.close()
        self.c = Controller(self.root / "state", self.repo.config, self.executor)
        edit = self.call("edit", {"requestId": "edit-other", "taskId": w2["taskId"], "expected": w2["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "other"}]})
        self.assertEqual(edit["status"], "succeeded")
        self.call("operation", {"action": "cancel", "requestId": "cancel", "operationId": op["id"]})
        self.assertEqual(self.wait(op["id"])["status"], "failed")
        self.assertEqual(self.executor.launches, 1)

    def test_schema_path_scope_and_single_controller(self):
        schema, validator = load_contract()
        for example in schema["x-examples"]:
            validator.validate(example)
        self.assertFalse(validator.is_valid({"tool": "tdev_exec", "input": {"command": "x"}}))
        with self.assertRaises(Fault):
            Controller(self.root / "state", self.repo.config, self.executor)
        w = self.open()
        r = self.call("edit", {"requestId": "bad", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "put", "path": "../escape", "content": "bad", "before": None}]})
        self.assertEqual(r["error"]["code"], "PATH")
        self.assertFalse(self.c.call("bob", "tdev_task", {"action": "list"})["ok"])
        self.repo.config["principals"]["alice"]["repos"] = {}
        self.assertFalse(self.c.call("alice", "tdev_edit", {"requestId": "bad", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "put", "path": "../escape", "content": "bad", "before": None}]})["ok"])


if __name__ == "__main__":
    unittest.main()
