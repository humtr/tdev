"""Explicit local stdio compatibility adapter; core HTTP stays MCP 2026-07-28.

No execution, grants, validation receipts, retries or durable state live here.
Select this command explicitly for legacy Local Codex clients; never auto-downgrade.
"""
import argparse
import http.client
import json
import os
import sys
from urllib.parse import urlsplit

from .common import Fault, canonical, private_file, require
from .server import META, VERSION

LIMIT = 2 * 1024 * 1024
LEGACY = "2025-11-25"


class Bridge:
    def __init__(self, url, token):
        target = urlsplit(url)
        require(target.scheme == "http" and target.hostname in ("127.0.0.1", "localhost")
                and target.path == "/mcp" and not target.query and not target.fragment
                and not target.username and not target.password, "BRIDGE_LOCAL_TARGET")
        self.target, self.token = target, token

    def forward(self, ident, method, params):
        params = {**params, "_meta": {META + "protocolVersion": VERSION,
                  META + "clientCapabilities": {}, META + "clientInfo": {"name": "tdev-codex-bridge", "version": "1"}}}
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   "MCP-Protocol-Version": VERSION, "Mcp-Method": method, "Authorization": "Bearer " + self.token}
        if method == "tools/call":
            name = params.get("name", "")
            require(isinstance(name, str) and name.isascii() and name.startswith("tdev_")
                    and all(c.isalnum() or c == "_" for c in name), "BRIDGE_TOOL")
            headers["Mcp-Name"] = name
        conn = http.client.HTTPConnection(self.target.hostname, self.target.port or 80, timeout=30)
        try:
            conn.request("POST", "/mcp", canonical({"jsonrpc": "2.0", "id": ident, "method": method, "params": params}), headers)
            response = conn.getresponse()
            data = response.read(4 * LIMIT + 1)
            if len(data) > 4 * LIMIT:
                raise Fault("BRIDGE_OUTPUT_LIMIT", effect="unknown")
            if response.status in (401, 403):
                raise Fault("AUTHENTICATION_REQUIRED")
            value = json.loads(data)
            if value.get("id") != ident:
                raise Fault("BRIDGE_RESPONSE_ID", effect="unknown")
            return value
        finally:
            conn.close()

    def handle(self, message):
        require(isinstance(message, dict) and message.get("jsonrpc") == "2.0", "BRIDGE_REQUEST")
        if "id" not in message:
            return None  # Transport notifications never cancel a durable operation.
        ident, method, params = message["id"], message.get("method"), message.get("params", {})
        require(type(ident) in (str, int) and isinstance(params, dict), "BRIDGE_REQUEST")
        if method == "initialize":
            value = self.forward(ident, "server/discover", {})
            if "error" in value:
                return value
            result = {"protocolVersion": LEGACY, "capabilities": {"tools": {}},
                      "serverInfo": {"name": "tdev-explicit-local-bridge", "version": "1"},
                      "instructions": "Explicit legacy stdio adapter to MCP 2026-07-28 tdev. Mutations require durable requestId; never regenerate after response loss. Inspect process status/exitCode; admission is not completion. No sandbox claim."}
            return {"jsonrpc": "2.0", "id": ident, "result": result}
        if method == "ping":
            return {"jsonrpc": "2.0", "id": ident, "result": {}}
        if method not in ("tools/list", "tools/call"):
            return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": "Method not found"}}
        value = self.forward(ident, method, params)
        if "result" in value:
            if value["result"].get("resultType") != "complete":
                raise Fault("BRIDGE_UNSUPPORTED_RESULT", effect="unknown")
            for key in ("resultType", "ttlMs", "cacheScope"):
                value["result"].pop(key, None)
        return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    auth = parser.add_mutually_exclusive_group(required=True)
    auth.add_argument("--token-file")
    auth.add_argument("--token-env")
    args = parser.parse_args()
    token = private_file(args.token_file).decode().strip() if args.token_file else os.environ[args.token_env]
    bridge = Bridge(args.url, token)
    while True:
        line = sys.stdin.buffer.readline(LIMIT + 1)
        if not line:
            break
        if len(line) > LIMIT:
            raise SystemExit("MCP stdio request exceeds limit")
        message = None
        try:
            message = json.loads(line)
            result = bridge.handle(message)
        except Exception:
            # Never disclose upstream headers, secrets or tracebacks. Never retry effects.
            result = {"jsonrpc": "2.0", "error": {"code": -32603, "message": "Adapter request failed; effect may be unknown. Observe original requestId; do not resubmit a new mutation."}}
            if isinstance(message, dict) and type(message.get("id")) in (str, int):
                result["id"] = message["id"]
        if result is not None:
            sys.stdout.buffer.write(canonical(result) + b"\n")
            sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
