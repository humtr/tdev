import json
import shlex
from pathlib import Path

from test_core import Base


class AdapterTest(Base):
    def test_external_cli_capture_exit_and_no_authority(self):
        self.c.executor_override = None
        w = self.open()
        adapter = Path(__file__).resolve().parent / "fixtures/cli_adapter.py"
        op = self.call("exec", {"requestId": "adapter", "taskId": w["taskId"], "expected": w["checkpoint"],
                               "command": "python " + shlex.quote(str(adapter)), "stdin": '{"value":21,"exit":7}'})
        self.call("operation", {"action": "stdin", "requestId": "eof", "operationId": op["id"], "sequence": 0, "text": "", "eof": True})
        result = self.wait(op["id"])
        self.assertEqual((result["status"], result["result"]["exitCode"]), ("failed", 7))
        g = self.c.git("test")
        output = g.blob(g.entries(result["result"]["checkpoint"])["adapter-output.json"][1])
        self.assertEqual(json.loads(output), {"doubled": 42})
        denied = self.c.call("alice", "tdev_publish", {"requestId": "fake", "validationId": op["id"], "expectedHead": self.repo.head})
        self.assertEqual(denied["error"]["code"], "VALIDATION_REQUIRED")
        # Mandatory validation is still chosen by owner config, never adapter stdout.
        self.repo.config["repositories"]["test"]["validation"] = "exit 9"
        v = self.call("validate", {"requestId": "v", "taskId": w["taskId"], "expected": result["result"]["checkpoint"], "message": "adapter"})
        self.assertEqual(self.wait(v["id"])["status"], "failed")
        self.assertEqual(len(self.c.schema["x-tools"]), 12)
        for completed in (op, v):
            self.call("operation", {"action": "retire", "requestId": "retire-" + completed["id"], "operationId": completed["id"]})
