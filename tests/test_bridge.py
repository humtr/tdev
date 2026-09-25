from unittest.mock import patch
import unittest

import test_http
from tdev.codex_bridge import Bridge
from tdev.common import Fault


class BridgeTest(unittest.TestCase):
    setUp = test_http.HTTPTest.setUp
    tearDown = test_http.HTTPTest.tearDown
    def test_bridge_keeps_annotations_and_authority_at_core(self):
        bridge = Bridge(f"http://127.0.0.1:{self.server.server_port}/mcp", "alice-secret")
        def call(method, params):
            return bridge.handle({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        init = call("initialize", {"protocolVersion": "2025-11-25"})
        self.assertEqual(init["result"]["protocolVersion"], "2025-11-25")
        tools = call("tools/list", {})["result"]["tools"]
        self.assertEqual(len(tools), 12)
        expected_annotations = {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": False,
        }
        self.assertTrue(all(t["annotations"] == expected_annotations for t in tools))
        args = {"name": "tdev_task", "arguments": {"action": "open", "requestId": "bridge-open", "repo": "test", "ref": "refs/heads/main", "expectedHead": self.repo.head}}
        first = call("tools/call", args)
        self.assertEqual(call("tools/call", args), first)
        self.repo.config["principals"].clear()
        with self.assertRaises(Fault):
            call("tools/call", args)  # auth still precedes replay at the core

    def test_bridge_no_retry_no_cancellation_or_remote_secret_forward(self):
        with self.assertRaises(Fault):
            Bridge("http://example.com/mcp", "fixture")
        bridge = Bridge(f"http://127.0.0.1:{self.server.server_port}/mcp", "alice-secret")
        with patch.object(bridge, "forward", side_effect=TimeoutError()) as upstream:
            with self.assertRaises(TimeoutError):
                bridge.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "tdev_exec", "arguments": {"requestId": "same"}}})
            self.assertEqual(upstream.call_count, 1)
            self.assertIsNone(bridge.handle({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1}}))
            self.assertEqual(upstream.call_count, 1)
