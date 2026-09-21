"""Installed Codex app-server MCP smoke. No model run, live runtime or config rewrite."""
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import Repository
from tdev.core import Controller
from tdev.server import make_server


class Codex:
    def __init__(self, url, direct=False):
        self.serial = 0
        self.queue = queue.Queue()
        env = {**os.environ, "TDEV_CODEX_SMOKE_TOKEN": "alice-secret"}
        config = ('{url=' + json.dumps(url) + ',bearer_token_env_var="TDEV_CODEX_SMOKE_TOKEN"}') if direct else (
            '{command=' + json.dumps(sys.executable) + ',args=' + json.dumps(["-m", "tdev.codex_bridge", "--url", url, "--token-env", "TDEV_CODEX_SMOKE_TOKEN"]) +
            ',env={PYTHONPATH=' + json.dumps(os.pathsep.join(str(Path(__file__).resolve().parents[1] / p) for p in ("src", ".tdev-deps"))) + ',TDEV_CODEX_SMOKE_TOKEN="alice-secret"}}')
        self.proc = subprocess.Popen(["codex", "app-server", "--stdio", "-c", 'mcp_servers.tdev_smoke=' + config],
            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        def reader():
            for line in self.proc.stdout:
                self.queue.put(json.loads(line))
            self.queue.put({"error": "app-server exited"})
        self.reader = threading.Thread(target=reader, daemon=True)
        self.reader.start()
        try:
            self.rpc("initialize", {"clientInfo": {"name": "tdev-acceptance", "version": "1"}, "capabilities": {"experimentalApi": True}})
            self.send({"method": "initialized"})
            self.thread = self.rpc("thread/start", {"cwd": str(Path(__file__).resolve().parents[1]), "ephemeral": True})["thread"]["id"]
        except Exception:
            self.close()
            raise

    def send(self, value):
        self.proc.stdin.write(json.dumps(value) + "\n")
        self.proc.stdin.flush()

    def rpc(self, method, params):
        self.serial += 1
        self.send({"id": self.serial, "method": method, "params": params})
        deadline = time.monotonic() + 45
        while True:
            value = self.queue.get(timeout=max(.1, deadline - time.monotonic()))
            if value.get("id") == self.serial and "method" not in value:
                if "error" in value:
                    raise RuntimeError(value["error"])
                return value["result"]
            if "method" in value and "id" in value:
                self.send({"id": value["id"], "error": {"code": -32601, "message": "No interactive approval in local fixture"}})
            if time.monotonic() >= deadline:
                raise TimeoutError(method)

    def call(self, tool, args):
        value = self.rpc("mcpServer/tool/call", {"threadId": self.thread, "server": "tdev_smoke", "tool": "tdev_" + tool, "arguments": args})
        result = value["structuredContent"]
        assert result["ok"], result
        return result["result"]

    def wait(self, op):
        for _ in range(30):
            value = self.call("operation", {"action": "status", "operationId": op["id"], "since": ""})
            if value["status"] not in ("running", "unknown"):
                assert value["status"] == "succeeded", value
                return value
            time.sleep(.25)
        raise TimeoutError("Retained operation " + op["id"])

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.proc.stdin.close()
        self.reader.join(timeout=2)
        self.proc.stdout.close()


def main():
    with tempfile.TemporaryDirectory(prefix="tdev-codex-smoke-") as tmp:
        repo = Repository(tmp)
        controller = Controller(Path(tmp) / "state", repo.config)
        server = make_server(controller)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = None
        try:
            client = Codex(f"http://127.0.0.1:{server.server_port}/mcp", "--direct" in sys.argv)
            status = client.rpc("mcpServerStatus/list", {"threadId": client.thread})
            names = []
            plugin = "not installed"
            for item in status["data"]:
                if item["name"] == "tdev_smoke":
                    names = list(item.get("tools", {}))
                if item["name"] == "tunnelMcp" and "list_runtime_aliases" in item.get("tools", {}):
                    value = client.rpc("mcpServer/tool/call", {"threadId": client.thread, "server": "tunnelMcp",
                                       "tool": "list_runtime_aliases", "arguments": {}})
                    assert not value.get("isError"), "Installed Tunnel plugin read-only listing failed"
                    plugin = "discovered and read-only list called"
            if "--direct" in sys.argv:
                client.call("task", {"action": "list"})
            assert len(names) == 9, names
            listing = client.call("task", {"action": "list"})
            assert listing["repositories"][0]["head"] == repo.head
            space = client.call("workspace", {"action": "create", "requestId": "codex-space", "name": "Client qualification", "projects": ["test"]})["result"]
            w = client.call("task", {"action": "open", "requestId": "codex-open", "workspaceId": space["workspaceId"], "repo": "test", "ref": "refs/heads/main", "expectedHead": repo.head})["result"]
            client.call("read", {"taskId": w["taskId"], "checkpoint": w["checkpoint"], "queries": [{"action": "file", "path": "a.txt"}]})
            e = client.call("edit", {"requestId": "codex-edit", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "codex"}]})["result"]
            args = {"requestId": "codex-exec", "taskId": w["taskId"], "expected": e["checkpoint"], "command": "printf ready; read value; printf '%s' \"$value\" >> a.txt", "timeout": 60}
            op = client.call("exec", args)
            client.close()
            client = Codex(f"http://127.0.0.1:{server.server_port}/mcp")
            assert client.call("exec", args)["id"] == op["id"]
            assert client.call("workspace", {"action": "inspect", "workspaceId": space["workspaceId"]})["tasks"][0]["taskId"] == w["taskId"]
            client.call("task", {"action": "inspect", "taskId": w["taskId"]})
            stdin = {"action": "stdin", "requestId": "codex-input", "operationId": op["id"], "sequence": 0, "text": "once\n", "eof": True}
            assert client.call("operation", stdin) == client.call("operation", stdin)
            done = client.wait(op)
            va = {"requestId": "codex-validation", "taskId": w["taskId"], "expected": done["result"]["checkpoint"], "message": "Codex fixture acceptance"}
            v = client.wait(client.call("validate", va))
            assert client.call("validate", va)["id"] == v["id"]
            pub = client.call("publish", {"requestId": "codex-publish", "validationId": v["id"], "expectedHead": repo.head})
            assert pub["status"] == "succeeded" and pub["result"]["commit"] == v["result"]["candidate"], pub
            for completed in (op, v):
                client.call("operation", {"action": "retire", "requestId": "retire-" + completed["id"], "operationId": completed["id"]})
            final = client.call("task", {"action": "inspect", "taskId": w["taskId"]})
            assert final["task"]["closed"] == 1
            assert all(o["cleanup"] == "retired" for o in final["operations"] if o["kind"] in ("exec", "validate"))
            assert client.call("workspace", {"action": "close", "requestId": "codex-close-space", "workspaceId": space["workspaceId"], "expectedRevision": space["revision"]})["result"]["closed"]
            print(json.dumps({"client": "installed Codex app-server", "path": "explicit stdio adapter -> local HTTP 2026-07-28",
                              "tools": names, "nativeCodingPath": True, "reconnectReplay": True,
                              "exactLocalPublication": True, "workspaceComposition": True, "cleanup": True, "productionTouched": False,
                              "tunnelPlugin": plugin}))
        finally:
            if client:
                client.close()
            server.shutdown()
            thread.join()
            server.server_close()
            controller.close()


if __name__ == "__main__":
    main()
