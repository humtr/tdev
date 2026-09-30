"""Actual Codex MCP loader/bridge check; no model inference or product effects.

Reuse the existing explicit bridge acceptance client with an effect-free controller.
This does NOT capture model-injected TypeScript or qualify ChatGPT rendering.
"""
import argparse
import json
from pathlib import Path
import threading

from check_codex import Codex
from probe_surface import CANDIDATES, Comparison, Product, Surface
from tdev.common import require
from tdev.server import make_server


class ProbeController:
    def __init__(self, surface):
        self.surface = surface
        self.schema = {"x-tools": list(surface.tools.values())}

    def authenticate(self, token):
        require(token == "alice-secret", "AUTHENTICATION_REQUIRED")
        return "probe"

    def call(self, principal, tool, arguments):
        require(principal == "probe", "AUTHENTICATION_REQUIRED")
        return self.surface.call(tool, arguments)


def check(candidate, out):
    surface = Product() if candidate == 'product' else Comparison() if candidate == "compare" else Surface(candidate)
    server = make_server(ProbeController(surface))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    client = None
    try:
        client = Codex(f"http://127.0.0.1:{server.server_port}/mcp")
        status = client.rpc("mcpServerStatus/list", {"threadId": client.thread})
        item = next(s for s in status["data"] if s["name"] == "tdev_smoke")
        tools = item["tools"]
        assert set(tools) == set(surface.tools), set(tools)
        for name, tool in tools.items():
            assert tool["inputSchema"] == surface.tools[name]["inputSchema"], name
        calls = []
        for original, value in (("tdev_task", {"action": "list"}),
                                ("tdev_task", {"action": "start", "requestId": "probe-start"})):
            encoder = Surface("B2") if candidate == "compare" else surface
            name, args = encoder.encode(original, value)
            result = client.rpc("mcpServer/tool/call", {"threadId": client.thread,
                                "server": "tdev_smoke", "tool": name, "arguments": args})
            receipt = result["structuredContent"]
            assert receipt["ok"] and receipt["probeOnly"] and receipt["effect"] == "none", receipt
            calls.append({"tool": name, "arguments": args, "receipt": receipt})
        out.mkdir(parents=True, exist_ok=True)
        (out / (candidate + ".codex-tools.json")).write_text(json.dumps(tools, indent=2) + "\n")
        result = {"candidate": candidate, "loaderSchemaEqual": True, "tools": len(tools),
                  "calls": calls, "modelRun": False, "chatgptAcceptance": False}
        (out / (candidate + ".codex-result.json")).write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({k: v for k, v in result.items() if k != "calls"}), flush=True)
    finally:
        if client is not None:
            client.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", choices=(*CANDIDATES, "compare", "product", "all"), default="B")
    parser.add_argument("--out", type=Path, default=Path("examples/surface-probe/evidence"))
    args = parser.parse_args()
    for candidate in CANDIDATES if args.candidate == "all" else (args.candidate,):
        check(candidate, args.out)
