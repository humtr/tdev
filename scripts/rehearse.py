"""Exercise the actual staged bundle on loopback; no live service changes."""
import http.client
import json
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

from tdev.admin import check, init_config, point, stage


def main():
    source = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix=".tdev-rehearsal-", dir=source) as temporary:
        root = Path(temporary)
        bundle = stage(root, source)
        init_config(root)
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
                for secret, expected in (("wrong", 401), (token, 200)):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request("POST", "/mcp", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
                                 {"Content-Type": "application/json", "Authorization": "Bearer " + secret})
                    response = conn.getresponse()
                    data = response.read()
                    assert response.status == expected, response.status
                    if expected == 200:
                        assert len(json.loads(data)["result"]["tools"]) == 7
                    conn.close()
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
        print(json.dumps({"bundle": checked["bundle"], "source": str(source),
                          "inactiveInstall": True, "productionServicesTouched": False,
                          "bundleHttpAndRestart": observations}, indent=2))


if __name__ == "__main__":
    main()
