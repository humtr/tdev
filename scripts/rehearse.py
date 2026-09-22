"""Exercise the actual staged bundle on loopback; no live service changes."""
import http.client
import json
import os
import signal
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from tdev.admin import check, init_config, point, stage
from tdev.common import atomic_write, canonical, digest
from tdev.artifact_build import host_platform
from tdev.server import META, VERSION

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import Repository, git


def main():
    source = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix=".tdev-rehearsal-", dir=source) as temporary:
        root = Path(temporary)
        (root / "bin").mkdir()
        native_tunnel = root / "bin/tunnel-client"
        native_tunnel.write_text("#!/bin/sh\nprintf '0.0.14\\n'\n")
        native_tunnel.chmod(0o700)
        bundle = stage(root, source)
        assert bundle["tunnelMode"] == "native-cgo"
        init_config(root)
        repo = Repository(root)
        config = json.loads((root / "config.json").read_bytes())
        config["repositories"] = repo.config["repositories"]
        config['repositories']['test']['artifactValidation'] = 'test -s dist/output.txt'
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
                        result = call("operation", {"action": "status", "operationId": op["id"]})
                        if result["status"] not in ("running", "unknown"):
                            assert result["status"] == "succeeded", result
                            return result
                        assert time.monotonic() < deadline, result
                        time.sleep(.03)
                for secret, expected in (("wrong", 401), (token, 200)):
                    status, data = request("tools/list", {}, secret)
                    assert status == expected, status
                    if expected == 200:
                        assert len(data["result"]["tools"]) == 11
                if iteration == 0:
                    w = call("task", {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": repo.head})["result"]
                    recipe = {'format': 1, 'kind': 'files', 'inputs': ['a.txt'], 'dependencies': [],
                              'build': {'command': 'mkdir dist; cp a.txt dist/output.txt', 'platform': host_platform(),
                                        'tools': [{'name': 'sh', 'sha256': digest(Path(shutil.which('sh')).resolve().read_bytes())}]},
                              'target': host_platform(), 'exports': ['dist']}
                    e = call("edit", {"requestId": "edit", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [
                        {"action": "replace", "path": "a.txt", "old": "hello", "text": "packaged"},
                        {'action': 'put', 'path': 'tdev-package.json', 'before': None, 'content': json.dumps(recipe)}]})["result"]
                    exec_args = {"requestId": "exec", "taskId": w["taskId"], "expected": e["checkpoint"], "command": "printf ready; read value; printf '%s' \"$value\" >> a.txt", "timeout": 30}
                    op = call("exec", exec_args)
                    deadline = time.monotonic() + 10
                    while not (root / "state/native" / op["id"] / "output").exists():
                        assert time.monotonic() < deadline
                        time.sleep(.03)
                else:
                    assert call("exec", exec_args)["id"] == op["id"]
                    stdin = {"action": "stdin", "requestId": "input", "operationId": op["id"], "sequence": 0, "text": "once\n", "eof": True}
                    assert call("operation", stdin) == call("operation", stdin)
                    done = wait(op)
                    v = wait(call("validate", {"requestId": "validate", "taskId": w["taskId"], "expected": done["result"]["checkpoint"], "message": "installed native crash recovery"}))
                    pub = call("publish", {"requestId": "publish", "validationId": v["id"], "expectedHead": repo.head})
                    assert pub["status"] == "succeeded", pub
                    assert git("--git-dir=" + str(repo.remote), "rev-parse", "refs/heads/main") == v["result"]["candidate"]
                    assert git("--git-dir=" + str(repo.remote), "show", "refs/heads/main:a.txt") == "packaged\nonce"
                    built = wait(call('artifact', {'action': 'prepare', 'requestId': 'package', 'validationId': v['id']}))
                    retained = call('artifact', {'action': 'inspect', 'artifactId': built['id']})
                    assert retained['manifest']['files']['dist/output.txt']['sha256'] == digest(b'packaged\nonce')
                    verified = wait(call('validate', {'subject': 'artifact', 'requestId': 'package-check', 'artifactId': built['id']}))
                    assert verified['result']['artifactChecked'] is True
                    retained = call('artifact', {'action': 'inspect', 'artifactId': built['id']})
                    assert retained['artifactValidated'] and retained['artifactValidationId'] == verified['id']
                    for completed in (op, v, built, verified):
                        call("operation", {"action": "retire", "requestId": "retire-" + completed["id"], "operationId": completed["id"]})
                    assert call('artifact', {'action': 'inspect', 'artifactId': built['id']}) == retained
                    exported = call('artifact', {'action': 'export', 'artifactId': built['id'], 'path': 'dist/output.txt'})
                    assert exported['sha256'] == digest(b'packaged\nonce') and exported['eof']
                    preview = call('artifact', {'action': 'prunePreview', 'artifactId': built['id']})
                    pruned = call('artifact', {'action': 'prune', 'artifactId': built['id'], 'requestId': 'prune-package',
                                               'expectedPreview': preview['previewToken']})
                    assert pruned['status'] == 'succeeded'
                    assert call('operation', {'action': 'status', 'operationId': built['id']})['artifactStorage']['state'] == 'pruned'
                observations.append({"restart": iteration, "wrongBearer": 401, "authorizedTools": 11})
            finally:
                if proc.poll() is None:
                    os.kill(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
                proc.stdout.close()
                proc.stderr.close()
        for service in ("tdev", "tdev-tunnel"):
            assert (root / "services" / service / "down").exists()
            for filename in ("run", "log/run"):
                subprocess.run(["sh", "-n", str(root / "services" / service / filename)], check=True)
        tunnel_run = (root / "services/tdev-tunnel/run").read_text()
        assert "envdir" not in tunnel_run
        assert "tdev.resident" in tunnel_run and "--role tunnel" in tunnel_run
        # Templates now delegate argv/profile handling to the verified resident launcher.
        # Exercise that installed code with synthetic settings; never launch a real tunnel.
        profile = b'fixture: true\n'
        atomic_write(root / 'tunnel-profiles/tdev.yaml', profile)
        atomic_write(root / 'resident.json', canonical({
            'home': str(root), 'port': 18080, 'profileDigest': digest(profile),
            'runtime': {'binary': str(native_tunnel), 'digest': digest(native_tunnel.read_bytes()),
                        'mode': 'native-cgo'}}))
        launcher_probe = """import sys
from pathlib import Path
from unittest.mock import patch
from tdev.resident import run_service
root = Path(sys.argv[1])
with patch('tdev.resident.get_health', return_value={'bundle': root.joinpath('active').resolve().name}), \\
     patch('tdev.resident.os.execve') as execute:
    run_service(root, 'tunnel')
    execute.assert_called_once()
    binary, argv, env = execute.call_args.args
    assert binary == str(root / 'bin/tunnel-client')
    assert argv == [binary, 'run', '--profile-dir', str(root / 'tunnel-profiles'), '--profile', 'tdev',
                    '--health.listen-addr', '127.0.0.1:0', '--health.url-file', str(root / 'tunnel-health.url')]
    assert env['HOME'] == str(root)
"""
        subprocess.run([sys.executable, '-c', launcher_probe, str(root)], env=env, check=True, timeout=20)
        assert (root / "tunnel-env").stat().st_mode & 0o777 == 0o700
        assert "tdev.installer" in (source / "install.sh").read_text()
        print(json.dumps({"bundle": checked["bundle"], "source": str(source),
                          "inactiveInstall": True, "productionServicesTouched": False,
                          "protocol": VERSION, "nativeSigkillRecoveryAndExactPublication": True,
                          "retainedNativeArtifactAfterScratchRetirement": True,
                          "artifactValidationAfterInstalledBuild": True,
                          "artifactExportAndExplicitPrune": True,
                          "bundleHttpAndRestart": observations}, indent=2))


if __name__ == "__main__":
    main()
