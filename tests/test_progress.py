import base64
import time

from test_core import Base
from tdev.core import Controller


class ProgressTest(Base):
    def setUp(self):
        super().setUp()
        self.c.executor_override = None

    def test_live_no_change_completion_and_fresh_resume(self):
        w = self.open()
        args = {"requestId": "progress", "taskId": w["taskId"], "expected": w["checkpoint"],
                "command": "printf phase1; read value; printf phase2; read value; printf captured > a.txt", "timeout": 15}
        op = self.call("exec", args)
        deadline = time.monotonic() + 10
        while True:
            first = self.call("operation", {"action": "status", "operationId": op["id"], "since": ""})
            if base64.b64decode(first["output"]["data"]) == b"phase1":
                break
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.02)
        again = self.call("operation", {"action": "status", "operationId": op["id"], "since": first["observation"]["cursor"]})
        self.assertFalse(again["observation"]["changed"])
        self.assertGreater(again["observation"]["observedAtNs"], first["observation"]["observedAtNs"])
        frontier = self.call("task", {"action": "inspect", "taskId": w["taskId"]})
        self.assertFalse(frontier["mutationReady"])
        self.assertEqual(frontier["active"]["id"], op["id"])
        self.call("operation", {"action": "stdin", "operationId": op["id"], "requestId": "advance", "sequence": 0, "text": "go\n"})
        while True:
            growing = self.call("task", {"action": "inspect", "taskId": w["taskId"], "since": frontier["observation"]["cursor"]})
            if growing["active"]["output"]["availableBytes"] == 12:
                break
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.02)
        # Even a one-byte log summary must notice output growth beyond its page.
        self.assertTrue(growing["observation"]["changed"])
        self.assertEqual(growing["active"]["output"]["nextOffset"], 1)
        self.call("operation", {"action": "stdin", "operationId": op["id"], "requestId": "finish", "sequence": 1, "text": "go\n", "eof": True})
        # Completion occurs with no controller observation. Replay must reconcile it.
        while not (self.root / "state/native" / op["id"] / "result.json").exists():
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.02)
        replay = self.call("exec", args)
        self.assertEqual(replay["status"], "succeeded", replay)
        self.c.close()
        self.c = Controller(self.root / "state", self.repo.config)
        resumed = self.call("task", {"action": "inspect", "taskId": w["taskId"], "since": frontier["observation"]["cursor"]})
        self.assertTrue(resumed["observation"]["changed"])
        self.assertTrue(resumed["mutationReady"])
        self.assertEqual(resumed["remote"]["head"], self.repo.head)
        completed = next(x for x in resumed["operations"] if x["id"] == op["id"])
        self.assertEqual((completed["status"], completed["cleanup"]), ("succeeded", "retire"))
        v = self.call("validate", {"requestId": "next", "taskId": w["taskId"], "expected": resumed["task"]["checkpoint"], "message": "forward"})
        self.assertEqual(self.wait(v["id"])["status"], "succeeded")
        self.call("operation", {"action": "retire", "requestId": "cleanup", "operationId": op["id"]})
        self.call("task", {"action": "close", "requestId": "close", "taskId": w["taskId"], "expected": resumed["task"]["checkpoint"]})
        listing = self.call("task", {"action": "list", "includeClosed": True, "limit": 1})
        self.assertEqual(listing["tasks"][0]["id"], w["taskId"])
        final = self.call("task", {"action": "inspect", "taskId": w["taskId"]})
        self.assertFalse(final["mutationReady"])
        self.assertEqual(next(x for x in final["operations"] if x["id"] == op["id"])["cleanup"], "retired")
        same = self.call("task", {"action": "inspect", "taskId": w["taskId"], "since": final["observation"]["cursor"]})
        self.assertFalse(same["observation"]["changed"])

    def test_status_wait_returns_terminal_failure_and_bounds_nonterminal_wait(self):
        w = self.open()
        op = self.call("exec", {"requestId": "wait-fail", "taskId": w["taskId"], "expected": w["checkpoint"],
                                "command": "printf phase; sleep .2; exit 7", "timeout": 5})
        waited = self.call("operation", {"action": "status", "operationId": op["id"], "offset": 0,
                                         "limit": 1000, "waitMs": 3000})
        self.assertEqual(waited["status"], "failed", waited)
        self.assertEqual(waited["result"]["exitCode"], 7)
        self.assertEqual(base64.b64decode(waited["output"]["data"]), b"phase")

        op2 = self.call("exec", {"requestId": "wait-running", "taskId": w["taskId"],
                                 "expected": waited["result"]["checkpoint"], "command": "sleep 2", "timeout": 5})
        started = time.monotonic()
        running = self.call("operation", {"action": "status", "operationId": op2["id"], "waitMs": 100})
        elapsed = time.monotonic() - started
        self.assertEqual(running["status"], "running", running)
        self.assertGreaterEqual(elapsed, .05)
        self.assertLess(elapsed, 1.0)
        self.call("operation", {"action": "cancel", "requestId": "wait-cleanup", "operationId": op2["id"]})
        self.assertEqual(self.wait(op2["id"])["status"], "failed")

    def test_frontier_pagination_and_scope(self):
        w = self.open()
        self.open()
        first = self.call("task", {"action": "list", "limit": 1})
        second = self.call("task", {"action": "list", "limit": 1, "after": first["nextAfter"]})
        self.assertNotEqual(first["tasks"][0]["id"], second["tasks"][0]["id"])
        self.assertIsNone(second["nextAfter"])
        bad = self.c.call("bob", "tdev_task", {"action": "inspect", "taskId": w["taskId"]})
        self.assertFalse(bad["ok"])
        invalid = self.c.call("alice", "tdev_task", {"action": "list", "after": 2**64})
        self.assertEqual(invalid["error"]["code"], "SCHEMA")
        self.call("edit", {"requestId": "page-edit", "taskId": w["taskId"], "expected": w["checkpoint"],
                           "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "paged"}]})
        newest = self.call("task", {"action": "inspect", "taskId": w["taskId"], "limit": 1})
        seen = newest["operations"][0]["id"]
        self.assertIsNotNone(newest["nextBefore"])
        older = self.call("task", {"action": "inspect", "taskId": w["taskId"], "limit": 1, "before": newest["nextBefore"]})
        self.assertNotIn(seen, [o["id"] for o in older["operations"]])
        self.assertIsNone(older["nextBefore"])
