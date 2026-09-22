import argparse
import base64
import itertools
import json
import os
import sys
import threading
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__
from .common import Fault, canonical
from .core import Controller

VERSION = "2026-07-28"
META = "io.modelcontextprotocol/"
SOURCE_ROOT = Path(__file__).resolve().parents[2]
_DIAGNOSTIC_SEQUENCE = itertools.count(1)
_DIAGNOSTIC_LOCK = threading.Lock()


def _diagnostic_event(event, sequence, method, **fields):
    value = {"event": event, "timeNs": time.time_ns(), "monotonicNs": time.monotonic_ns(),
             "pid": os.getpid(), "sequence": sequence, "method": method}
    value.update(fields)
    with _DIAGNOSTIC_LOCK:
        sys.stderr.write(json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n")
        sys.stderr.flush()


def expanded(schema, value):
    if isinstance(value, list):
        return [expanded(schema, v) for v in value]
    if isinstance(value, dict):
        if "$ref" in value:
            return expanded(schema, schema["$defs"][value["$ref"].split("/")[-1]])
        return {k: expanded(schema, v) for k, v in value.items()}
    return value


def make_server(controller, port=0):
    manifest = SOURCE_ROOT / "manifest.json"
    bundle = json.loads(manifest.read_bytes())["id"] if manifest.is_file() else None
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass  # Never log auth headers, arguments or candidate output.

        def rpc_error(self, status, ident, code, message, data=None):
            error = {"code": code, "message": message}
            if data is not None:
                error["data"] = data
            value = {"jsonrpc": "2.0", "error": error}
            if type(ident) in (str, int):
                value["id"] = ident
            self.send(status, value)

        def send(self, status, value=None):
            data = canonical(value) if value is not None else b""
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if status == 405:
                self.send_header("Allow", "POST")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                self.wfile.write(data)
                self.wfile.flush()
            except BrokenPipeError:
                if getattr(self, "_diagnostic_sequence", None) is not None:
                    _diagnostic_event("response_write_failed", self._diagnostic_sequence,
                                      getattr(self, "_diagnostic_method", None), status=status,
                                      responseBytes=len(data), writeOutcome="broken_pipe")
                pass  # Durable operation outlives HTTP response.
            except ConnectionResetError:
                if getattr(self, "_diagnostic_sequence", None) is not None:
                    _diagnostic_event("response_write_failed", self._diagnostic_sequence,
                                      getattr(self, "_diagnostic_method", None), status=status,
                                      responseBytes=len(data), writeOutcome="connection_reset")
                pass  # Durable operation outlives HTTP response.
            else:
                if getattr(self, "_diagnostic_sequence", None) is not None:
                    _diagnostic_event("response_written", self._diagnostic_sequence,
                                      getattr(self, "_diagnostic_method", None), status=status,
                                      responseBytes=len(data), writeOutcome="success")
            self.close_connection = True

        def ingress(self):
            host = self.headers.get("Host", "")
            if host not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"):
                self.send(403)
                return None
            origin = self.headers.get("Origin")
            if origin and origin not in ("http://" + host,):
                self.send(403)
                return None
            authorization = self.headers.get("Authorization", "")
            if not authorization.startswith("Bearer ") or len(authorization) > 4096:
                self.send(401)
                return None
            try:
                return controller.authenticate(authorization[7:])
            except Fault:
                self.send(401)
                return None

        def do_GET(self):
            if self.path == "/healthz":
                self.send(200, {"status": "up", "version": __version__, "pid": os.getpid(), "bundle": bundle})
            elif self.path in (
                "/.well-known/oauth-protected-resource/mcp",
                "/.well-known/oauth-protected-resource",
            ):
                # This server uses the configured bearer directly, not OAuth/DCR.
                # Returning public 404s lets tunnel clients treat OAuth discovery as optional.
                self.send(404)
            elif self.ingress():
                self.send(405)

        def do_DELETE(self):
            if self.ingress():
                self.send(405)

        def do_POST(self):
            self.connection.settimeout(10)
            principal = self.ingress()
            if principal is None:
                return
            if self.path != "/mcp":
                self.send(404)
                return
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self.send(415)
                return
            accepted = self.headers.get("Accept", "")
            if not all(v in accepted for v in ("application/json", "text/event-stream")):
                self.send(406)
                return
            try:
                length = int(self.headers.get("Content-Length", "-1"))
                if not 0 < length <= 2 * 1024 * 1024 or self.headers.get("Transfer-Encoding"):
                    self.send(413)
                    return
                message = json.loads(self.rfile.read(length))
            except (ValueError, TimeoutError):
                self.rpc_error(400, None, -32700, "Parse error")
                return
            if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
                self.rpc_error(400, None, -32600, "Invalid request")
                return
            ident, method = message.get("id"), message["method"]
            if "id" not in message:
                # No client notification is supported by this HTTP profile.
                self.send(400)
                return
            if type(ident) not in (str, int):
                self.rpc_error(400, None, -32600, "Invalid request ID")
                return
            params = message.get("params", {})
            if not isinstance(params, dict):
                self.rpc_error(400, ident, -32602, "Invalid params")
                return
            known_tools = {t["name"] for t in controller.schema["x-tools"]}
            tool = params.get("name") if method == "tools/call" and params.get("name") in known_tools else None
            self._diagnostic_sequence = next(_DIAGNOSTIC_SEQUENCE)
            self._diagnostic_method = method
            self._diagnostic_tool = tool
            _diagnostic_event("request_received", self._diagnostic_sequence, method, **({"tool": tool} if tool else {}))
            meta = params.get("_meta", {})
            version = self.headers.get("MCP-Protocol-Version")
            if not version or not self.headers.get("Mcp-Method"):
                self.rpc_error(400, ident, -32020, "Required request headers missing")
                return
            if not isinstance(meta, dict) or not isinstance(meta.get(META + "protocolVersion"), str) or not isinstance(meta.get(META + "clientCapabilities"), dict):
                self.rpc_error(400, ident, -32602, "Required per-request metadata missing or malformed")
                return
            expected_headers = {"MCP-Protocol-Version": meta[META + "protocolVersion"], "Mcp-Method": method}
            if method in ("tools/call", "resources/read", "prompts/get"):
                expected_headers["Mcp-Name"] = params.get("uri" if method == "resources/read" else "name")
            try:
                for key, expected in expected_headers.items():
                    values = self.headers.get_all(key, [])
                    if len(values) != 1 or not isinstance(expected, str):
                        raise ValueError()
                    actual = values[0]
                    if any(ord(c) < 32 and c != "\t" or ord(c) > 126 for c in actual):
                        raise ValueError()
                    if key == "Mcp-Name" and actual.startswith("=?base64?") and actual.endswith("?="):
                        actual = base64.b64decode(actual[9:-2], validate=True).decode("utf-8")
                    if actual != expected:
                        raise ValueError()
            except (ValueError, UnicodeError):
                self.rpc_error(400, ident, -32020, "Request header/body mismatch")
                return
            if version != VERSION:
                self.rpc_error(400, ident, -32022, "Unsupported protocol version", {"supported": [VERSION], "requested": version})
                return
            error = None
            try:
                if method == "server/discover":
                    result = {"supportedVersions": [VERSION], "capabilities": {"tools": {}}, "ttlMs": 0, "cacheScope": "private"}
                elif method == "tools/list":
                    result = {"tools": expanded(controller.schema, controller.schema["x-tools"]), "ttlMs": 0, "cacheScope": "private"}
                elif method == "tools/call":
                    if params.get("name") not in {t["name"] for t in controller.schema["x-tools"]} or not isinstance(params.get("arguments", {}), dict):
                        self.rpc_error(400, ident, -32602, "Unknown tool or invalid arguments")
                        return
                    dispatch_started = time.monotonic_ns()
                    _diagnostic_event("dispatch_started", self._diagnostic_sequence, method, **({"tool": tool} if tool else {}))
                    try:
                        value = controller.call(principal, params.get("name", ""), params.get("arguments", {}))
                    finally:
                        _diagnostic_event("dispatch_finished", self._diagnostic_sequence, method,
                                          **({"tool": tool, "durationNs": time.monotonic_ns() - dispatch_started}
                                             if tool else {"durationNs": time.monotonic_ns() - dispatch_started}))
                    result = {"content": [{"type": "text", "text": canonical(value).decode()}],
                              "structuredContent": value, "isError": not value["ok"]}
                else:
                    self.rpc_error(404, ident, -32601, "Method not found")
                    return
            except Exception:
                error = {"code": -32603, "message": "Internal error; observe retained request identity before retry"}
            if not error:
                result.update({"resultType": "complete", "_meta": {META + "serverInfo": {"name": "tdev", "version": __version__}}})
            self.send(200, {"jsonrpc": "2.0", "id": ident, **({"error": error} if error else {"result": result})})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    controller = Controller(args.state, args.config)
    server = make_server(controller, args.port)
    try:
        server.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        controller.close()


if __name__ == "__main__":
    main()
