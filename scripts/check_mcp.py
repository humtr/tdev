"""Pinned official MCP SDK interoperability on loopback; no ChatGPT host claim."""
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from support import Repository
from tdev.core import Controller
from tdev.server import make_server


PROGRAM = r"""
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {Client, StreamableHTTPClientTransport} = await import(pathToFileURL(process.argv[1]));
const client = new Client({name:'tdev-probe',version:'1'},
  {versionNegotiation:{mode:{pin:'2026-07-28'}}});
const transport = new StreamableHTTPClientTransport(new URL(process.argv[2]),
  {requestInit:{headers:{Authorization:'Bearer alice-secret'}}});
try {
  await client.connect(transport);
  assert.equal(client.getProtocolEra(), 'modern');
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 7);
  const called = await client.callTool({name:'tdev_workspace',arguments:{action:'list'}});
  assert.equal(called.isError, false);
  assert.equal(called.structuredContent.ok, true);
  console.log(JSON.stringify({sdk:'@modelcontextprotocol/client@2.0.0',
    protocol:'2026-07-28',era:client.getProtocolEra(),tools:listed.tools.length,call:true}));
} finally { await client.close(); }
"""


def main():
    root = Path(__file__).resolve().parents[1]
    sdk = root / ".tdev-mcp-client/node_modules/@modelcontextprotocol/client/dist/index.mjs"
    if not sdk.is_file():
        raise SystemExit("Install probe dependency: npm install --prefix .tdev-mcp-client --ignore-scripts @modelcontextprotocol/client@2.0.0")
    with tempfile.TemporaryDirectory() as tmp:
        repo = Repository(tmp)
        controller = Controller(Path(tmp) / "state", repo.config)
        server = make_server(controller)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            subprocess.run(["node", "--input-type=module", "-e", PROGRAM, str(sdk),
                            f"http://127.0.0.1:{server.server_port}/mcp"], check=True, timeout=30)
        finally:
            server.shutdown()
            thread.join()
            server.server_close()
            controller.close()


if __name__ == "__main__":
    main()
