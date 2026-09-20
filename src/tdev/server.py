import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import __version__
from .common import Fault, canonical
from .core import Controller

VERSION = "2025-11-25"


def expanded(schema, value):
    if isinstance(value, list):
        return [expanded(schema, v) for v in value]
    if isinstance(value, dict):
        if "$ref" in value:
            return expanded(schema, schema["$defs"][value["$ref"].split("/")[-1]])
        return {k: expanded(schema, v) for k, v in value.items()}
    return value


def make_server(controller, port=0):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass  # Never log auth headers, arguments or candidate output.

        def send(self, status, value=None):
            data = canonical(value) if value is not None else b""
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # Durable operation outlives HTTP response.
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
                self.send(200, {"status": "up", "version": __version__})
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
            accepted = self.headers.get("Accept", "*/*")
            if not any(v in accepted for v in ("application/json", "*/*")):
                self.send(406)
                return
            try:
                length = int(self.headers.get("Content-Length", "-1"))
                if not 0 < length <= 2 * 1024 * 1024 or self.headers.get("Transfer-Encoding"):
                    self.send(413)
                    return
                message = json.loads(self.rfile.read(length))
            except (ValueError, TimeoutError):
                self.send(400)
                return
            if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
                self.send(400)
                return
            ident, method = message.get("id"), message["method"]
            if "id" not in message:
                self.send(202)
                return
            version = self.headers.get("MCP-Protocol-Version")
            if version is not None and version not in (VERSION, "2025-06-18", "2025-03-26"):
                self.send(400)
                return
            params = message.get("params", {})
            if not isinstance(params, dict):
                self.send(400)
                return
            error = None
            try:
                if method == "initialize":
                    requested = params.get("protocolVersion")
                    result = {"protocolVersion": requested if requested in (VERSION, "2025-06-18", "2025-03-26") else VERSION,
                              "capabilities": {"tools": {"listChanged": False}},
                              "serverInfo": {"name": "tdev", "version": __version__}}
                elif method == "ping":
                    result = {}
                elif method == "tools/list":
                    result = {"tools": expanded(controller.schema, controller.schema["x-tools"])}
                elif method == "tools/call":
                    value = controller.call(principal, params.get("name", ""), params.get("arguments", {}))
                    result = {"content": [{"type": "text", "text": canonical(value).decode()}],
                              "structuredContent": value, "isError": not value["ok"]}
                else:
                    error = {"code": -32601, "message": "Method not found"}
            except Exception:
                error = {"code": -32603, "message": "Internal error; observe retained request identity before retry"}
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
