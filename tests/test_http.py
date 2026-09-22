import http.client
import io
import json
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from pathlib import Path

from support import Repository
from tdev.core import Controller
from tdev.server import META, VERSION, make_server


class HTTPTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repository(self.tmp.name)
        self.controller = Controller(Path(self.tmp.name) / "state", self.repo.config)
        self.server = make_server(self.controller)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.controller.close()
        self.tmp.cleanup()

    def request(self, method="tools/list", args=None, headers=None, ident=1):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        params = {"_meta": {META + "protocolVersion": VERSION, META + "clientCapabilities": {}}, **(args or {})}
        h = {"Authorization": "Bearer alice-secret", "Content-Type": "application/json",
             "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": VERSION,
             "Mcp-Method": method}
        if method == "tools/call":
            h["Mcp-Name"] = params.get("name", "")
        h.update(headers or {})
        h = {k: v for k, v in h.items() if v is not None}
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        if ident is not None:
            payload["id"] = ident
        conn.request("POST", "/mcp", json.dumps(payload), h)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, json.loads(data) if data else None

    def get(self, path, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        conn.request("GET", path, headers=headers or {})
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, data

    def test_auth_before_discovery_metadata_does_not_grant(self):
        code, _ = self.request(headers={"Authorization": "Bearer wrong", "X-Openai-Subject": "full", "X-Openai-Session": "approved"})
        self.assertEqual(code, 401)
        self.assertEqual(self.request(headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request(headers={"Host": "evil.example"})[0], 403)
        code, value = self.request()
        self.assertEqual(code, 200)
        self.assertEqual(len(value["result"]["tools"]), 10)
        self.assertNotIn("$ref", json.dumps(value["result"]))

    def test_safe_http_diagnostics_cover_request_dispatch_and_response(self):
        log = io.StringIO()
        marker = "do-not-log-this-header-value"
        with redirect_stderr(log):
            code, value = self.request(
                "tools/call",
                {"name": "tdev_task", "arguments": {"action": "list"}},
                {"X-Diagnostic-Marker": marker},
            )
        self.assertEqual(code, 200)
        self.assertTrue(value["result"]["structuredContent"]["ok"])
        deadline = time.monotonic() + 1
        while '"event":"response_written"' not in log.getvalue() and time.monotonic() < deadline:
            time.sleep(.01)
        raw = log.getvalue()
        self.assertNotIn("alice-secret", raw)
        self.assertNotIn(marker, raw)
        records = [json.loads(line) for line in raw.splitlines() if line.startswith("{")]
        events = [record["event"] for record in records]
        self.assertEqual(events, ["request_received", "dispatch_started", "dispatch_finished", "response_written"])
        self.assertEqual({record["requestSequence"] for record in records}, {1})
        self.assertEqual(records[1]["rpcMethod"], "tools/call")
        self.assertEqual(records[1]["tool"], "tdev_task")
        self.assertTrue(records[2]["success"])
        self.assertEqual(records[3]["status"], 200)
        self.assertEqual(records[3]["outcome"], "written")
        self.assertGreater(records[3]["responseBytes"], 0)

    def test_oauth_well_known_is_optional_public_404(self):
        for path in (
            "/.well-known/oauth-protected-resource/mcp",
            "/.well-known/oauth-protected-resource",
        ):
            self.assertEqual(self.get(path)[0], 404)
        self.assertEqual(self.get("/mcp")[0], 401)

    def test_protocol_and_reconnect(self):
        _, discovery = self.request("server/discover")
        self.assertEqual(discovery["result"]["supportedVersions"], [VERSION])
        self.assertEqual(discovery["result"]["resultType"], "complete")
        self.assertEqual(self.request("initialize")[0], 404)
        self.assertEqual(self.request("notifications/initialized", ident=None)[0], 400)
        self.assertEqual(self.request(headers={"MCP-Protocol-Version": "bad"})[0], 400)
        args = {"name": "tdev_task", "arguments": {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head}}
        _, first = self.request("tools/call", args)
        _, second = self.request("tools/call", args)
        self.assertEqual(first["result"], second["result"])
        self.repo.config["principals"].clear()
        self.assertEqual(self.request()[0], 401)

    def test_modern_metadata_and_header_validation_before_effect(self):
        for headers in ({"MCP-Protocol-Version": None}, {"Mcp-Method": None}, {"Mcp-Method": "tools/call"}):
            code, value = self.request(headers=headers)
            self.assertEqual((code, value["error"]["code"]), (400, -32020))
        code, value = self.request(args={"_meta": {META + "protocolVersion": VERSION}})
        self.assertEqual((code, value["error"]["code"]), (400, -32602))
        code, value = self.request(args={"_meta": {META + "protocolVersion": "2025-11-25", META + "clientCapabilities": {}}}, headers={"MCP-Protocol-Version": "2025-11-25"})
        self.assertEqual((code, value["error"]["code"]), (400, -32022))
        self.assertEqual(value["error"]["data"], {"supported": [VERSION], "requested": "2025-11-25"})
        args = {"name": "tdev_task", "arguments": {"action": "list"}}
        for name in (None, "tdev_exec", "=?base64?invalid?="):
            code, value = self.request("tools/call", args, {"Mcp-Name": name})
            self.assertEqual((code, value["error"]["code"]), (400, -32020))
        code, value = self.request("tools/call", args, {"Mcp-Name": "=?base64?dGRldl90YXNr?="})
        self.assertEqual(code, 200)
        self.assertTrue(value["result"]["structuredContent"]["ok"])
        self.assertEqual(self.request(headers={"Accept": "application/json"})[0], 406)

    def test_native_full_coding_path_over_http_without_executor_config(self):
        def call(tool, args):
            status, response = self.request("tools/call", {"name": "tdev_" + tool, "arguments": args})
            self.assertEqual(status, 200)
            value = response["result"]["structuredContent"]
            self.assertTrue(value["ok"], value)
            return value["result"]
        def wait(op):
            for _ in range(100):
                result = call("operation", {"action": "status", "operationId": op["id"]})
                if result["status"] not in ("running", "unknown"):
                    self.assertEqual(result["status"], "succeeded", result)
                    return result
                time.sleep(.03)
            self.fail(result)
        w = call("task", {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head})["result"]
        e = call("edit", {"requestId": "edit", "taskId": w["taskId"], "expected": w["checkpoint"], "edits": [{"action": "replace", "path": "a.txt", "old": "hello", "text": "http"}]})["result"]
        executed = wait(call("exec", {"requestId": "exec", "taskId": w["taskId"], "expected": e["checkpoint"], "command": "printf native >> a.txt"}))
        v = wait(call("validate", {"requestId": "validate", "taskId": w["taskId"], "expected": executed["result"]["checkpoint"], "message": "native HTTP"}))
        p = call("publish", {"requestId": "publish", "validationId": v["id"], "expectedHead": self.repo.head})
        self.assertEqual(p["status"], "succeeded", p)
        self.assertEqual(p["result"]["commit"], v["result"]["candidate"])

    def test_local_project_creation_native_validation_publish_cleanup_over_http(self):
        self.repo.config['projectPolicies'] = {'local': {'kind': 'local', 'root': self.tmp.name,
            'validation': 'test -f README.md', 'managedRefNamespace': 'refs/heads/tdev-work/', 'allowCreate': True}}
        self.repo.config['principals']['alice']['projectPolicies'] = ['local']
        def call(tool, args):
            code, response = self.request('tools/call', {'name': 'tdev_' + tool, 'arguments': args})
            self.assertEqual(code, 200)
            value = response['result']['structuredContent']
            self.assertTrue(value['ok'], value)
            return value['result']
        project = call('project', {'action': 'create', 'requestId': 'create', 'policy': 'local', 'name': 'new-http-project'})
        self.assertEqual(project['status'], 'succeeded', project)
        space = call('workspace', {'action': 'create', 'requestId': 'space', 'name': 'HTTP development',
                                  'projects': [project['result']['repo']]})
        self.assertEqual(call('operation', {'action': 'status', 'lookupRequestId': 'space'}), space)
        checkout = Path(project['result']['checkout'])
        (checkout / 'local.txt').write_text('local working change')
        w = call('task', {'action': 'start', 'requestId': 'start', 'workspaceId': space['result']['workspaceId'],
                          'localChanges': True})['result']
        self.assertIn('localImport', w)
        self.assertEqual(w['repo'], project['result']['repo'])
        e = call('edit', {'requestId': 'edit', 'taskId': w['taskId'], 'expected': w['checkpoint'],
            'edits': [{'action': 'put', 'path': 'feature.txt', 'before': None, 'content': 'http task'}]})['result']
        source = call('task', {'action': 'start', 'requestId': 'source', 'workspaceId': w['workspaceId']})['result']
        changed = call('edit', {'requestId': 'source-edit', 'taskId': source['taskId'], 'expected': source['checkpoint'],
            'edits': [{'action': 'put', 'path': 'second.txt', 'before': None, 'content': 'parallel task'}]})['result']
        merged = call('task', {'action': 'integrate', 'requestId': 'merge', 'taskId': w['taskId'],
            'expected': e['checkpoint'], 'sourceTaskId': source['taskId']})['result']
        self.assertTrue(merged['applied'])
        diff = call('read', {'taskId': w['taskId'], 'queries': [{'action': 'diff', 'format': 'patch'}]})
        self.assertIn('+local working change', diff['items'][0]['text'])
        self.assertIn('+parallel task', diff['items'][0]['text'])
        call('task', {'action': 'close', 'requestId': 'close-source', 'taskId': source['taskId'],
                      'expected': changed['checkpoint']})
        v = call('validate', {'requestId': 'v', 'taskId': w['taskId'], 'expected': merged['checkpoint'], 'message': 'new project'})
        for _ in range(100):
            v = call('operation', {'action': 'status', 'operationId': v['id']})
            if v['status'] not in ('running', 'unknown'):
                break
            time.sleep(.03)
        self.assertEqual(v['status'], 'succeeded', v)
        published = call('publish', {'requestId': 'p', 'validationId': v['id']})
        self.assertEqual(published['result']['commit'], v['result']['candidate'])
        self.assertEqual(call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': w['taskId']})['status'], 'succeeded')
        self.assertEqual(call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': v['id']})['status'], 'succeeded')
        view = call('workspace', {'action': 'inspect', 'workspaceId': w['workspaceId'], 'includeClosed': True})
        self.assertEqual(view['tasks'][0]['taskId'], w['taskId'])
        closed = call('workspace', {'action': 'close', 'requestId': 'close-space', 'workspaceId': w['workspaceId'],
                                   'expectedRevision': view['workspace']['revision']})
        self.assertTrue(closed['result']['closed'])
