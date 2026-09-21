"""Small authored local workload; not a ChatGPT/tunnel/remote benchmark."""
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import Repository
from tdev.common import canonical, load_contract
from tdev.core import Controller
from tdev.server import expanded


def main():
    s, _ = load_contract()
    results = []
    for trial in range(3):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repository(tmp)
            c = Controller(Path(tmp) / "state", repo.config)
            calls, polls = 0, 0
            start = time.monotonic()
            def call(tool, args):
                nonlocal calls
                calls += 1
                value = c.call("alice", "tdev_" + tool, args)
                assert value["ok"], value
                return value["result"]
            try:
                w = call("task", {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": repo.head})["result"]
                call("read", {"taskId": w["taskId"], "checkpoint": w["checkpoint"], "queries": [{"action": "file", "path": "a.txt"}, {"action": "search", "text": "world"}]})
                e = call("edit", {"requestId": "edit", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "hi"}, {"action": "replace", "path": "b.txt", "old": "world", "text": "earth"}]})["result"]
                v = call("validate", {"requestId": "validate", "taskId": w["taskId"], "expected": e["checkpoint"], "message": "measured fixture"})
                deadline = time.monotonic() + 10
                while True:
                    observed = call("operation", {"action": "status", "operationId": v["id"]})
                    polls += 1
                    if observed["status"] == "succeeded":
                        break
                    assert time.monotonic() < deadline, observed
                    time.sleep(.01)
                p = call("publish", {"requestId": "publish", "validationId": v["id"], "expectedHead": repo.head})
                assert p["status"] == "succeeded", p
                results.append({"trial": trial + 1, "seconds": round(time.monotonic() - start, 3), "calls": calls,
                                "polls": polls, "validations": 1, "executorStarts": len(list((Path(tmp) / "state/native").glob("*/request.json"))),
                                "exactPublication": p["result"]["commit"] == observed["result"]["candidate"]})
            finally:
                c.close()
    print(json.dumps({"scope": "real default native runner, authored local repository; no Tunnel/provider latency inference", "advertisedSchemaBytes": len(canonical(expanded(s, s["x-tools"]))), "trials": results}, indent=2))


if __name__ == "__main__":
    main()
