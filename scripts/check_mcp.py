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
from tdev.diagnostic_policy import DiagnosticsPolicy


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
  assert.equal(listed.tools.length, 13);
  const call = (value, ...options) => client.callTool({...value, arguments:{request:value.arguments}}, ...options);
  const diagnostic = await call({name:'tdev_diagnostics',
    arguments:{action:'activate',requestId:'sdk-diagnostics',seconds:1}});
  assert.equal(diagnostic.isError, false);
  const alert = diagnostic._meta['io.tdev/diagnostics'][0];
  assert(diagnostic.content.some(c => c.type === 'text' && c.text.includes(alert.id)));
  const acknowledged = await call({name:'tdev_diagnostics',
    arguments:{action:'acknowledge',incidentId:alert.id}});
  assert.equal(acknowledged.structuredContent.result.incidents[0].delivery, 'acknowledged');
  const report = await call({name:'tdev_diagnostics',
    arguments:{action:'report',requestId:'sdk-report',category:'transport_error'}});
  assert.equal(report.isError, false);
  assert.equal(report.structuredContent.result.summary.reported.transport_error, 1);
  const reportReplay = await call({name:'tdev_diagnostics',
    arguments:{action:'report',requestId:'sdk-report',category:'transport_error'}});
  assert.equal(reportReplay.structuredContent.result.summary.reported.transport_error, 1);
  const summary = await call({name:'tdev_diagnostics',
    arguments:{action:'inspect',view:'summary'}});
  assert.deepEqual(summary.structuredContent.result.incidents, []);
  assert.equal(summary.structuredContent.result.summary.reported.transport_error, 1);
  const witness = {action:'mark', instance:summary.structuredContent.result.witness.instance,
    runId:'a'.repeat(32), cellId:'b'.repeat(32), sequence:1, phase:'cell_enter'};
  const entered = await call({name:'tdev_diagnostics', arguments:witness});
  assert.equal(entered.isError, false);
  const receipt = summary._meta['io.tdev/diagnosticReceipt'];
  assert.equal(receipt.instance, witness.instance);
  const returned = await call({name:'tdev_diagnostics', arguments:{...witness,
    sequence:2, phase:'tool_return', callOrdinal:1, afterRequest:receipt.request}});
  assert.equal(returned.isError, false);
  assert.equal(returned.structuredContent.result.afterRequest, receipt.request);
  const markReplay = await call({name:'tdev_diagnostics', arguments:witness});
  assert.deepEqual(markReplay.structuredContent, entered.structuredContent);
  const artifactSchema = listed.tools.find(t => t.name === 'tdev_artifact').inputSchema.properties.request;
  assert.deepEqual(artifactSchema.oneOf.map(s => s.properties.action.const), ['inspectRecipe','prepare','inspect','list','usage','export','prunePreview','prune']);
  const artifact = await call({name:'tdev_artifact',
    arguments:{action:'inspectRecipe',validationId:'not-a-validation'}});
  assert.equal(artifact.isError, true);
  assert.equal(artifact.structuredContent.error.code, 'OPERATION_NOT_FOUND');
  const validateSchema = listed.tools.find(t => t.name === 'tdev_validate').inputSchema.properties.request;
  assert(validateSchema.oneOf.some(s => s.properties.subject?.const === 'artifact'));
  const check = await call({name:'tdev_validate', arguments:{subject:'artifact',requestId:'missing-artifact',artifactId:'missing'}});
  assert.equal(check.isError, true);
  assert.equal(check.structuredContent.error.code, 'OPERATION_NOT_FOUND');
  const usage = await call({name:'tdev_artifact',arguments:{action:'usage'}});
  assert.equal(usage.isError, false);
  assert.equal(usage.structuredContent.result.retainedArtifacts, 0);
  const execSchema = listed.tools.find(t => t.name === 'tdev_exec').inputSchema.properties.request;
  assert(execSchema.oneOf.some(s => s.properties.mode.const === 'process' && s.required.includes('mode')));
  assert(execSchema.oneOf.every(s => s.properties.environment.enum.includes('task')));
  const taskSchema = listed.tools.find(t => t.name === 'tdev_task').inputSchema.properties.request;
  assert(taskSchema.oneOf.some(s => s.properties?.action?.const === 'resetEnvironment'));
  const called = await call({name:'tdev_task',arguments:{action:'list'}});
  assert.equal(called.isError, false);
  assert.equal(called.structuredContent.ok, true);
  const repoHead = called.structuredContent.result.repositories.find(
    r => r.repo === 'test' && r.ref === 'refs/heads/main').head;
  const opened = await call({name:'tdev_task',arguments:{action:'open',
    requestId:'sdk-stream-open',repo:'test',ref:'refs/heads/main',expectedHead:repoHead}});
  assert.equal(opened.isError, false);
  const task = opened.structuredContent.result.result;
  const progress = [];
  const waited = await call({name:'tdev_exec',arguments:{
    requestId:'sdk-stream-exec',taskId:task.taskId,expected:task.checkpoint,
    command:'sleep 1.3; printf sdk-stream',timeout:5,waitMs:5000}}, {
      onprogress: update => progress.push(update),
      timeout: 10000
    });
  assert(progress.length >= 1, 'official SDK did not receive notifications/progress');
  assert(progress.some(update => update.progress >= 1));
  assert.equal(waited.isError, false);
  assert.equal(waited.structuredContent.result.status, 'succeeded');
  assert.equal(waited.structuredContent.result.result.exitCode, 0);
  const replay = await call({name:'tdev_exec',arguments:{
    requestId:'sdk-stream-exec',taskId:task.taskId,expected:task.checkpoint,
    command:'sleep 1.3; printf sdk-stream',timeout:5,waitMs:0}});
  assert.equal(replay.structuredContent.result.id, waited.structuredContent.result.id);
  const workspace = await call({name:'tdev_workspace',arguments:{action:'list'}});
  assert.equal(workspace.isError, false);
  assert.equal(workspace.structuredContent.ok, true);
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
        repo.config['principals']['alice']['diagnostics'] = True
        controller = Controller(Path(tmp) / "state", repo.config)
        diagnostics = DiagnosticsPolicy(Path(tmp) / 'diagnostics', root)
        server = make_server(controller, diagnostics=diagnostics.recorder)
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
            diagnostics.close()


if __name__ == "__main__":
    main()
