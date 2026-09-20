"""Exercise the actual staged bundle on loopback; no live service changes."""
import http.client
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from tdev.admin import check, init_config, point, stage
from tdev.common import atomic_write, canonical
from tdev.server import META, VERSION

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import Repository, git


def main():
    source = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix=".tdev-rehearsal-", dir=source) as temporary:
        root = Path(temporary)
        bundle = stage(root, source)
        init_config(root)
        repo = Repository(root)
        config = json.loads((root / "config.json").read_bytes())
        config["repositories"] = repo.config["repositories"]
        for principal in config["principals"].values():
            principal["repos"] = {"test": ["refs/heads/main"]}
        atomic_write(root / "config.json", canonical(config))
        point(root, bundle["bundle"])
        checked = check(root)
        token = (root / "connector.secret").read_text()
        env = {k: os.environ[k] for k in ("PATH", "HOME", "PREFIX", "TMPDIR") if k in os.environ}
        env["PYTHONPATH"] = str(root / "active/src") + ":" + str(root / "active/.tdev-deps")
        program = """import sys
from tdev.core import Controller
from tdev.server import make_server
c=Controller(sys.argv[1],sys.argv[2]); s=make_server(c)
print(s.server_port,flush=True); s.serve_forever()
"""
        observations = []
        for iteration in range(2):
            proc = subprocess.Popen([sys.executable, "-c", program, str(root / "state"), str(root / "config.json")],
                                    env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                port_line = proc.stdout.readline()
                if not port_line:
                    raise RuntimeError("Staged startup failed: " + proc.stderr.read(4096))
                port = int(port_line)
                def request(method, params, secret=token):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + secret,
                               "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": VERSION,
                               "Mcp-Method": method}
                    if method == "tools/call":
                        headers["Mcp-Name"] = params["name"]
                    params = {**params, "_meta": {META + "protocolVersion": VERSION, META + "clientCapabilities": {}}}
                    conn.request("POST", "/mcp", json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}), headers)
                    response = conn.getresponse()
                    data = response.read()
                    conn.close()
                    return response.status, json.loads(data) if data else None
                def call(tool, args):
                    status, value = request("tools/call", {"name": "tdev_" + tool, "arguments": args})
                    assert status == 200, (status, value)
                    value = value["result"]["structuredContent"]
                    assert value["ok"], value
                    return value["result"]
                def wait(op):
                    deadline = time.monotonic() + 20
                    while True:
                        result = call("process", {"action": "status", "operationId": op["id"]})
                        if result["status"] not in ("running", "unknown"):
                            assert result["status"] == "succeeded", result
                            return result
                        assert time.monotonic() < deadline, result
                        time.sleep(.03)
                for secret, expected in (("wrong", 401), (token, 200)):
                    status, data = request("tools/list", {}, secret)
                    assert status == expected, status
                    if expected == 200:
                        assert len(data["result"]["tools"]) == 7
                if iteration == 0:
                    w = call("workspace", {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": repo.head})["result"]
                    e = call("edit", {"requestId": "edit", "workspaceId": w["workspaceId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "packaged"}]})["result"]
                    exec_args = {"requestId": "exec", "workspaceId": w["workspaceId"], "expected": e["checkpoint"], "command": "printf ready; read value; printf '%s' \"$value\" >> a.txt", "timeout": 30}
                    op = call("exec", exec_args)
                    deadline = time.monotonic() + 10
                    while not (root / "state/native" / op["id"] / "output").exists():
                        assert time.monotonic() < deadline
                        time.sleep(.03)
                else:
                    assert call("exec", exec_args)["id"] == op["id"]
                    stdin = {"action": "stdin", "requestId": "input", "operationId": op["id"], "sequence": 0, "text": "once\n", "eof": True}
                    assert call("process", stdin) == call("process", stdin)
                    done = wait(op)
                    v = wait(call("validate", {"requestId": "validate", "workspaceId": w["workspaceId"], "expected": done["result"]["checkpoint"], "message": "installed native crash recovery"}))
                    pub = call("publish", {"requestId": "publish", "validationId": v["id"], "expectedHead": repo.head})
                    assert pub["status"] == "succeeded", pub
                    assert git("--git-dir=" + str(repo.remote), "rev-parse", "refs/heads/main") == v["result"]["candidate"]
                    assert git("--git-dir=" + str(repo.remote), "show", "refs/heads/main:a.txt") == "packaged\nonce"
                    for completed in (op, v):
                        call("process", {"action": "retire", "requestId": "retire-" + completed["id"], "operationId": completed["id"]})
                observations.append({"restart": iteration, "wrongBearer": 401, "authorizedTools": 7})
            finally:
                if proc.poll() is None:
                    os.kill(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
                proc.stdout.close()
                proc.stderr.close()
        for service in ("tdev", "tdev-oai-tunnel"):
            assert (root / "services" / service / "down").exists()
            for filename in ("run", "log/run"):
                subprocess.run(["sh", "-n", str(root / "services" / service / filename)], check=True)
        tunnel_run = (root / "services/tdev-oai-tunnel/run").read_text()
        assert "envdir" not in tunnel_run
        assert "CONTROL_PLANE_API_KEY" in tunnel_run
        assert "--health.listen-addr 127.0.0.1:0" in tunnel_run
        prefix = os.environ.get("PREFIX")
        if prefix and not Path("/etc/resolv.conf").is_file():
            assert "proot" in tunnel_run
            assert f"{prefix}/etc/resolv.conf:/etc/resolv.conf" in tunnel_run
            assert f"{prefix}/etc/tls/cert.pem:/etc/ssl/cert.pem" in tunnel_run
        assert (root / "tunnel-env").stat().st_mode & 0o777 == 0o700
        print(json.dumps({"bundle": checked["bundle"], "source": str(source),
                          "inactiveInstall": True, "productionServicesTouched": False,
                          "protocol": VERSION, "nativeSigkillRecoveryAndExactPublication": True,
                          "bundleHttpAndRestart": observations}, indent=2))


if __name__ == "__main__":
    main()
