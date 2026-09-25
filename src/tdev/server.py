import argparse
import base64
import json
import os
import time
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__
from .common import Fault, canonical
from .core import Controller

VERSION = "2026-07-28"
META = "io.modelcontextprotocol/"
SOURCE_ROOT = Path(__file__).resolve().parents[2]


def expanded(schema, value):
    if isinstance(value, list):
        return [expanded(schema, v) for v in value]
    if isinstance(value, dict):
        if "$ref" in value:
            return expanded(schema, schema["$defs"][value["$ref"].split("/")[-1]])
        return {k: expanded(schema, v) for k, v in value.items()}
    return value


def make_server(controller, port=0, diagnostics=None, diagnostic_factory=None):
    trace = diagnostics
    activation_lock = threading.Lock()

    def diagnostic_call(principal, args):
        nonlocal trace
        if trace is None and args['action'] == 'activate' and diagnostic_factory:
            with activation_lock:
                if trace is None:
                    try:
                        trace = diagnostic_factory()
                        server.diagnostics = trace
                    except Exception:
                        raise Fault('DIAGNOSTICS_UNAVAILABLE') from None
        policy = getattr(trace, 'policy', None)
        if policy is not None:
            return policy.tool(principal, args)
        if args['action'] == 'inspect':
            return dict(mode='off', expiresAt=None, incidents=[], storagePending=False,
                        storageErrors=0, evicted=0)
        raise Fault('DIAGNOSTICS_UNAVAILABLE')

    if controller is not None:
        controller.diagnostic_handler = diagnostic_call
    manifest = SOURCE_ROOT / "manifest.json"
    bundle = json.loads(manifest.read_bytes())["id"] if manifest.is_file() else None
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def handle_one_request(self):
            self._trace_enabled = trace is not None
            self._trace_request = self._observe('request')
            self._emit('http_parse_started')
            try:
                return super().handle_one_request()
            finally:
                self._emit('http_finished')

        def _emit(self, event, **fields):
            self._observe('emit', self._trace_request, event, **fields)

        def _observe(self, method, /, *args, **kwargs):
            if trace is None or not getattr(self, '_trace_enabled', True):
                return None
            try:
                return getattr(trace, method)(*args, **kwargs)
            except Exception:
                # Optional instrumentation must not change admission or delivery.
                # Disable it for this request; never log recursively on this path.
                self._trace_enabled = False
                return None

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
            stage = 'serialization'
            self._emit('serialization_started', httpStatus=status)
            try:
                data = canonical(value) if value is not None else b""
                self._emit('serialization_finished', bytes=len(data), responseTag=self._observe('payload_tag', data))
                stage = 'headers'
                self._emit('socket_headers_started')
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                if status == 405:
                    self.send_header("Allow", "POST")
                self.send_header("Connection", "close")
                self.end_headers()
                self._emit('socket_headers_written')
                stage = 'body'
                self._emit('socket_body_started')
                self.wfile.write(data)
                self._emit('socket_body_written', bytes=len(data), httpStatus=status)
            except Exception as error:
                failure = ('broken_pipe' if isinstance(error, BrokenPipeError) else
                           'connection_reset' if isinstance(error, ConnectionResetError) else
                           'timeout' if isinstance(error, TimeoutError) else 'other')
                self._emit('response_failed', stage=stage, failureClass=failure, httpStatus=status)
                # Preserve existing body disconnect semantics; header/other failures still propagate.
                if stage != 'body' or not isinstance(error, (BrokenPipeError, ConnectionResetError)):
                    raise
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
                policy = getattr(trace, 'policy', None)
                mode = policy.mode if policy is not None else self.server.diagnostic_state
                self.send(200, {"status": "up", "version": __version__, "pid": os.getpid(),
                                "bundle": bundle, "diagnostics": mode})
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
            self._emit('http_headers_ready')
            self.connection.settimeout(10)
            self._emit('ingress_started')
            principal = self.ingress()
            self._emit('ingress_finished', authenticated=principal is not None)
            if principal is None:
                return
            if hasattr(trace, 'bind'):
                self._observe('bind', self._trace_request, principal)
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
                self._emit('body_read_started', bytes=length)
                raw = self.rfile.read(length)
                self._emit('body_read_finished', bytes=len(raw))
                message = json.loads(raw)
            except (ValueError, TimeoutError):
                self.rpc_error(400, None, -32700, "Parse error")
                return
            if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
                self.rpc_error(400, None, -32600, "Invalid request")
                return
            if trace is not None:
                tags = self._observe('identity', message, {t['name'] for t in controller.schema['x-tools']})
                self._emit('rpc_parsed', **(tags or {}))
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
                    started = time.monotonic_ns() if trace is not None else 0
                    self._emit('dispatch_started')
                    try:
                        value = controller.call(principal, params.get("name", ""), params.get("arguments", {}))
                    except Exception:
                        if trace is not None:
                            self._emit('dispatch_failed', durationNs=time.monotonic_ns()-started)
                        raise
                    if trace is not None:
                        self._emit('dispatch_finished', durationNs=time.monotonic_ns()-started,
                                   **(self._observe('outcome', value) or {}))
                        if hasattr(trace, 'tool_result'):
                            self._observe('tool_result', self._trace_request, value)
                    result = {"content": [{"type": "text", "text": canonical(value).decode()}],
                              "structuredContent": value, "isError": not value["ok"]}
                else:
                    self.rpc_error(404, ident, -32601, "Method not found")
                    return
            except Exception:
                error = {"code": -32603, "message": "Internal error; observe retained request identity before retry"}
            if not error:
                result.update({"resultType": "complete", "_meta": {META + "serverInfo": {"name": "tdev", "version": __version__}}})
                if method == 'tools/call' and hasattr(trace, 'offers'):
                    # Offer is not a delivery acknowledgement; disconnects leave it pending.
                    try:
                        alerts = trace.offers(principal)
                    except Exception:
                        alerts = []
                    if alerts:
                        result['_meta']['io.tdev/diagnostics'] = alerts
                        result['content'].append({'type': 'text', 'text':
                            'tdev diagnostic incident(s): ' + canonical(alerts).decode() +
                            '. Use tdev_diagnostics inspect for state; acknowledge an incidentId after receipt. '
                            'This does not prove user-visible delivery. Existing work is not cancelled or retried.'})
            self.send(200, {"jsonrpc": "2.0", "id": ident, **({"error": error} if error else {"result": result})})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.diagnostics = trace
    server.diagnostic_state = 'trace' if trace is not None else 'off'
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument('--diagnostics', choices=('off', 'watch', 'trace'), default=None,
                        help='Optional local diagnostics; off does not import/start the collector')
    args = parser.parse_args()
    controller = Controller(args.state, args.config)
    runtimes = []
    def factory():
        from .diagnostic_policy import DiagnosticsPolicy
        runtime = DiagnosticsPolicy(Path(args.state) / 'diagnostics', SOURCE_ROOT,
                                    {**controller.config.get('diagnostics', {}),
                                     'mode': 'watch' if selected in ('watch', 'trace') else 'off'})
        runtimes.append(runtime)
        return runtime.recorder
    trace = None
    diagnostic_state = 'off'
    selected = args.diagnostics or controller.config.get('diagnostics', {}).get('mode', 'off')
    if selected != 'off':
        try:
            trace = factory()
            if selected == 'trace':
                trace.policy.tool('@local-operator', {'action': 'activate', 'requestId': 'startup-' + trace.instance})
            diagnostic_state = selected
        except Exception:
            # Report through health; even a failure notice must not wait on stderr.
            diagnostic_state = 'unavailable'
    server = make_server(controller, args.port, trace, factory)
    server.diagnostic_state = diagnostic_state
    try:
        server.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        controller.close()
        for runtime in runtimes:
            try:
                runtime.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
