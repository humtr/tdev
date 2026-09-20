import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from support import Repository
from tdev.core import Controller
from tdev.server import make_server


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
        h = {"Authorization": "Bearer alice-secret", "Content-Type": "application/json", **(headers or {})}
        payload = {"jsonrpc": "2.0", "method": method, "params": args or {}}
        if ident is not None:
            payload["id"] = ident
        conn.request("POST", "/mcp", json.dumps(payload), h)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, json.loads(data) if data else None

    def test_auth_before_discovery_metadata_does_not_grant(self):
        code, _ = self.request(headers={"Authorization": "Bearer wrong", "X-Openai-Subject": "full", "X-Openai-Session": "approved"})
        self.assertEqual(code, 401)
        self.assertEqual(self.request(headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request(headers={"Host": "evil.example"})[0], 403)
        code, value = self.request()
        self.assertEqual(code, 200)
        self.assertEqual(len(value["result"]["tools"]), 7)
        self.assertNotIn("$ref", json.dumps(value["result"]))

    def test_protocol_and_reconnect(self):
        _, init = self.request("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}})
        self.assertEqual(init["result"]["protocolVersion"], "2025-11-25")
        self.assertEqual(self.request("notifications/initialized", ident=None)[0], 202)
        self.assertEqual(self.request(headers={"MCP-Protocol-Version": "bad"})[0], 400)
        args = {"name": "tdev_workspace", "arguments": {"action": "open", "requestId": "open", "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head}}
        _, first = self.request("tools/call", args)
        _, second = self.request("tools/call", args)
        self.assertEqual(first["result"], second["result"])
        self.repo.config["principals"].clear()
        self.assertEqual(self.request()[0], 401)
