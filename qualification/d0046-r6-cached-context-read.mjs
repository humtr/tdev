import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  CloudflareApiClient,
  createWorkerUploadForm,
  loadCloudflareCredentials,
} from './cloudflare-casedo-api.mjs';
import {
  D0046_MCP_TRIAL_SCRIPT,
  D0046_WORKER_MAIN_MODULE,
  workerReadback,
} from './d0046-mcp-trial-deploy.mjs';
import {
  D0046_R5_RECOVERY_TOOL,
  downloadActiveTrialModules,
} from './d0046-r5-recovery-read.mjs';
import { canonicalClone, canonicalJson, digest, isPlainRecord } from '../src/canonical.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const D0046_R6_PROFILE = 'tdev.d0046.r6.cached-context-recovery.v1';
export const D0046_R6_PREDECESSOR_VERSION = '90eca433-9ab4-4ab5-8d8f-62ce86a6a6c5';
export const D0046_R6_PREDECESSOR_SOURCE = '78f47d5002f7f0fbeb3520b7ec82dbc2a7356b61';
export const D0046_R6_PREDECESSOR_BUNDLE = 'sha256:b5e2eac9001aa43a97050bf952d62ef558ad1f075b0b217968a5768f1ff4fc64';
export const D0046_R6_SELECTOR = 'd0046-r6-execution-state.tdev-trial-m2-20260905-r3';
export const D0046_R6_CASE = 'tdev-trial-m2-20260905-r3';
const EXPECTED_MODULE_COUNT = 34;

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function bundleDigest(modules) {
  const hash = createHash('sha256');
  for (const name of [...modules.keys()].sort()) {
    hash.update(name).update('\0').update(modules.get(name)).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function binding(settings, name) {
  const found = (settings?.bindings ?? []).filter((item) => item?.name === name);
  if (found.length !== 1) fail('d0046_r6_binding_invalid', 'Expected one exact Worker binding', { name, count: found.length });
  return found[0];
}

function runtimeMetadata(predecessor) {
  const runtime = predecessor?.version?.resources?.script_runtime ?? predecessor?.settings?.script_runtime ?? predecessor?.settings;
  const compatibilityDate = runtime?.compatibility_date;
  const compatibilityFlags = runtime?.compatibility_flags;
  const exports = runtime?.exports;
  if (typeof compatibilityDate !== 'string' || !Array.isArray(compatibilityFlags) || !isPlainRecord(exports)) {
    fail('d0046_r6_runtime_invalid', 'Active predecessor runtime metadata is incomplete');
  }
  if (exports.CaseAgentDriveRuntimeDO?.type !== 'durable-object' || exports.CaseAgentDriveRuntimeDO?.storage !== 'sqlite') {
    fail('d0046_r6_runtime_invalid', 'Active predecessor Drive export changed');
  }
  return {
    main_module: D0046_WORKER_MAIN_MODULE,
    compatibility_date: compatibilityDate,
    compatibility_flags: canonicalClone(compatibilityFlags),
    bindings: canonicalClone(predecessor.settings.bindings),
    exports: canonicalClone(exports),
    annotations: {
      'workers/message': 'D0046 r6 cached-context recovery read',
      'workers/tag': 'tdev-d0046-r6-cached-context-read-v1',
    },
  };
}

const R6_BLOCK = String.raw`
const D0046_R6_CONTEXT_SELECTOR = 'd0046-r6-execution-state.tdev-trial-m2-20260905-r3';
const D0046_R6_CASE_ID = 'tdev-trial-m2-20260905-r3';

async function d0046R6ContextHint(request) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/mcp') return null;
  let bytes;
  try { bytes = new Uint8Array(await request.clone().arrayBuffer()); } catch { return null; }
  if (bytes.byteLength === 0 || bytes.byteLength > D0046_R5_RECOVERY_REQUEST_BYTES) return null;
  let rpc;
  try { rpc = strictJsonParse(bytes, { maxBytes: D0046_R5_RECOVERY_REQUEST_BYTES, maxDepth: 16, maxTokens: 4096 }); } catch { return null; }
  if (!isPlainRecord(rpc) || rpc.jsonrpc !== '2.0' || !Object.hasOwn(rpc, 'id') || rpc.method !== 'tools/call') return null;
  if (!isPlainRecord(rpc.params) || rpc.params.name !== 'development_context_get') return null;
  const args = rpc.params.arguments ?? {};
  if (!isPlainRecord(args) || Object.keys(args).length !== 1 || args.selector !== D0046_R6_CONTEXT_SELECTOR) return null;
  return { id: rpc.id };
}

async function d0046R6ContextCall(request, env, response, hint) {
  if (hint === null) return response;
  // Never bypass the ordinary D0024/D0023 path.  The bridge is admitted only
  // after the authenticated normal surface rejects the reserved selector as
  // outside the fixed repository-context scope.
  if (await d0046R5NormalErrorCode(response) !== 'mcp_trial_context_scope_denied') return response;
  const caseId = D0046_R6_CASE_ID;
  const composition = normalizeMcpTrialCompositionBinding(readJsonBinding(env, TRIAL_MANIFEST_BINDING));
  assertGeneratedBaseBinding(composition);
  if (!caseId.startsWith(composition.casePrefix)) return d0046R5Error(request, hint.id, 'mcp_trial_case_scope_denied');
  const driveNs = namespaceFor(env.TDEV_CASE_AGENT_DRIVE, composition.jurisdiction, 'Case-Agent drive');
  const id = driveNs.idFromName(caseId);
  if (!id || typeof id.toString !== 'function' || (id.jurisdiction ?? 'global') !== composition.jurisdiction) {
    return d0046R5Error(request, hint.id, 'mcp_owner_unavailable');
  }
  const stub = driveNs.get(id);
  if (!stub || typeof stub.readCaseAgentDrive !== 'function') return d0046R5Error(request, hint.id, 'mcp_owner_unavailable');
  let projected;
  try { projected = d0046R5ProjectDrive(caseId, await stub.readCaseAgentDrive({ caseId })); }
  catch { return d0046R5Error(request, hint.id, 'd0046_r6_drive_projection_invalid'); }
  const structuredContent = canonicalClone(projected);
  return d0046R5Response(request, hint.id, {
    content: [{ type: 'text', text: canonicalJson(structuredContent) }],
    structuredContent,
    isError: false,
  });
}
`;

const INSERT_ANCHOR = '\nasync function d0046R5Call(request, env, response, hint) {';
const FETCH_ANCHOR = `      const worker = await lightApplication(env);\n      const recoveryHint = await d0046R5RpcHint(request);\n      const ordinaryResponse = await worker.fetch(request);\n      let response = await d0046R5AppendTool(request, ordinaryResponse, recoveryHint);\n      response = await d0046R5Call(request, env, response, recoveryHint);\n      emitRequestDiagnostic('mcp', request, { status: response.status, ...(await responseDiagnosticFields(response)) });\n      return response;`;
const FETCH_REPLACEMENT = `      const worker = await lightApplication(env);\n      const recoveryHint = await d0046R5RpcHint(request);\n      const r6ContextHint = await d0046R6ContextHint(request);\n      const ordinaryResponse = await worker.fetch(request);\n      let response = await d0046R5AppendTool(request, ordinaryResponse, recoveryHint);\n      response = await d0046R5Call(request, env, response, recoveryHint);\n      response = await d0046R6ContextCall(request, env, response, r6ContextHint);\n      emitRequestDiagnostic('mcp', request, { status: response.status, ...(await responseDiagnosticFields(response)) });\n      return response;`;

export function patchCachedContextRecoveryIngressSource(source) {
  if (typeof source !== 'string' || source.length === 0) fail('d0046_r6_ingress_invalid', 'Active recovery ingress source is empty');
  if (!source.includes(D0046_R5_RECOVERY_TOOL) || !source.includes('d0046R5Call')) {
    fail('d0046_r6_predecessor_not_r5', 'Active ingress is not the accepted r5 recovery source');
  }
  if (source.includes(D0046_R6_SELECTOR) || source.includes('d0046R6ContextCall')) {
    fail('d0046_r6_ingress_already_patched', 'Active ingress already contains the r6 cached-context bridge');
  }
  const insertCount = source.split(INSERT_ANCHOR).length - 1;
  const fetchCount = source.split(FETCH_ANCHOR).length - 1;
  if (insertCount !== 1 || fetchCount !== 1) {
    fail('d0046_r6_ingress_anchor_mismatch', 'r5 ingress patch anchors were not exact', { insertCount, fetchCount });
  }
  return source.replace(INSERT_ANCHOR, `\n${R6_BLOCK}${INSERT_ANCHOR}`).replace(FETCH_ANCHOR, FETCH_REPLACEMENT);
}

export function validateR6ModuleDelta(predecessor, recovery) {
  if (!(predecessor instanceof Map) || !(recovery instanceof Map) || predecessor.size !== recovery.size || predecessor.size !== EXPECTED_MODULE_COUNT) {
    fail('d0046_r6_module_delta_invalid', 'r6 module sets are incomplete');
  }
  const changed = [];
  for (const [name, source] of predecessor) {
    if (!recovery.has(name)) fail('d0046_r6_module_delta_invalid', 'r6 omitted a predecessor module', { name });
    if (recovery.get(name) !== source) changed.push(name);
  }
  for (const name of recovery.keys()) if (!predecessor.has(name)) fail('d0046_r6_module_delta_invalid', 'r6 added a module', { name });
  if (canonicalJson(changed) !== canonicalJson([D0046_WORKER_MAIN_MODULE])) {
    fail('d0046_r6_module_delta_invalid', 'r6 changed modules outside the ingress main module', { changed });
  }
  return Object.freeze({ moduleCount: predecessor.size, changedModules: changed });
}

function assertPredecessor(worker, modules) {
  const version = worker?.deployment?.versions?.[0]?.version_id;
  if (version !== D0046_R6_PREDECESSOR_VERSION) {
    fail('d0046_r6_predecessor_changed', 'Active trial version is not the accepted r6 predecessor', { expected: D0046_R6_PREDECESSOR_VERSION, actual: version ?? null });
  }
  const source = binding(worker.settings, 'TDEV_SOURCE_SHA');
  if (source.type !== 'plain_text' || source.text !== D0046_R6_PREDECESSOR_SOURCE) fail('d0046_r6_predecessor_changed', 'Active trial source marker changed');
  const actualBundle = bundleDigest(modules);
  if (modules.size !== EXPECTED_MODULE_COUNT || actualBundle !== D0046_R6_PREDECESSOR_BUNDLE) {
    fail('d0046_r6_predecessor_changed', 'Active trial bundle is not the reconciled r5 recovery artifact', { moduleCount: modules.size, bundleDigest: actualBundle });
  }
  const main = modules.get(D0046_WORKER_MAIN_MODULE) ?? '';
  if (!main.includes(D0046_R5_RECOVERY_TOOL) || !main.includes('readCaseAgentDrive')) fail('d0046_r6_predecessor_changed', 'Active r5 recovery ingress is incomplete');
  return worker;
}

function sameWorkerState(a, b) {
  return canonicalJson(a.settings) === canonicalJson(b.settings) && canonicalJson(a.deployment) === canonicalJson(b.deployment);
}

export async function prepareCachedContextRecovery({ envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env' } = {}) {
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const predecessor = await workerReadback(client);
  const deployedModules = await downloadActiveTrialModules(client);
  assertPredecessor(predecessor, deployedModules);
  const afterRead = await workerReadback(client);
  if (!sameWorkerState(predecessor, afterRead)) fail('d0046_r6_predecessor_changed', 'Trial predecessor changed while its active content was read');

  const recoveryModules = new Map(deployedModules);
  recoveryModules.set(D0046_WORKER_MAIN_MODULE, patchCachedContextRecoveryIngressSource(deployedModules.get(D0046_WORKER_MAIN_MODULE)));
  const delta = validateR6ModuleDelta(deployedModules, recoveryModules);
  const metadata = runtimeMetadata(predecessor);
  const preservation = Object.freeze({
    settingsDigest: digest(predecessor.settings),
    deploymentDigest: digest(predecessor.deployment),
    predecessorBundleDigest: bundleDigest(deployedModules),
    recoveryBundleDigest: bundleDigest(recoveryModules),
    driveNamespace: binding(predecessor.settings, 'TDEV_CASE_AGENT_DRIVE').namespace_id,
    caseNamespace: binding(predecessor.settings, 'TDEV_CASE_AUTHORITY').namespace_id,
    agentNamespace: binding(predecessor.settings, 'TDEV_AGENT_DELIVERY').namespace_id,
    d1DatabaseId: binding(predecessor.settings, 'TDEV_CASE_PLACEMENT').database_id,
  });
  return Object.freeze({
    profile: D0046_R6_PROFILE,
    client,
    predecessor,
    deployedModules,
    recoveryModules,
    delta,
    metadata,
    preservation,
    preservationDigest: digest(preservation),
    providerMutation: false,
  });
}

async function authoritativeSnapshot(client) {
  const worker = await workerReadback(client);
  const modules = await downloadActiveTrialModules(client);
  return { worker, modules, settingsDigest: digest(worker.settings), deploymentDigest: digest(worker.deployment), bundleDigest: bundleDigest(modules) };
}

function validateReadback(snapshot, prepared) {
  if (canonicalJson(snapshot.worker.settings) !== canonicalJson(prepared.predecessor.settings)) fail('d0046_r6_config_changed', 'r6 upload changed Worker settings');
  validateR6ModuleDelta(prepared.deployedModules, snapshot.modules);
  if (snapshot.bundleDigest !== prepared.preservation.recoveryBundleDigest) fail('d0046_r6_content_mismatch', 'r6 active bundle does not match the prepared artifact');
  const main = snapshot.modules.get(D0046_WORKER_MAIN_MODULE) ?? '';
  if (!main.includes(D0046_R6_SELECTOR) || !main.includes('d0046R6ContextCall')) fail('d0046_r6_content_mismatch', 'r6 bridge is absent from active ingress');
  return snapshot;
}

export async function applyCachedContextRecovery(prepared) {
  if (prepared?.profile !== D0046_R6_PROFILE || prepared?.preservationDigest !== digest(prepared.preservation)) fail('d0046_r6_preparation_invalid', 'r6 preparation is incomplete');
  const before = await authoritativeSnapshot(prepared.client);
  if (before.settingsDigest !== prepared.preservation.settingsDigest || before.deploymentDigest !== prepared.preservation.deploymentDigest || before.bundleDigest !== prepared.preservation.predecessorBundleDigest) {
    fail('d0046_r6_predecessor_changed', 'Provider predecessor changed after r6 preparation');
  }
  let uploadError = null;
  try {
    await prepared.client.request('PUT', prepared.client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}`), {
      body: createWorkerUploadForm(prepared.metadata, prepared.recoveryModules),
      timeoutMs: 120_000,
    });
  } catch (cause) {
    uploadError = cause;
  }
  let after;
  try { after = validateReadback(await authoritativeSnapshot(prepared.client), prepared); }
  catch (cause) {
    fail('d0046_r6_effect_unknown', 'r6 upload was attempted but exact readback did not prove the desired active state', { uploadCode: uploadError?.code ?? null }, { cause });
  }
  return Object.freeze({
    profile: D0046_R6_PROFILE,
    status: uploadError === null ? 'recovery_updated' : 'recovery_reconciled_after_ambiguous_upload',
    predecessorVersionId: D0046_R6_PREDECESSOR_VERSION,
    activeVersionId: after.worker.deployment.versions[0].version_id,
    preservationDigest: prepared.preservationDigest,
    predecessorBundleDigest: prepared.preservation.predecessorBundleDigest,
    recoveryBundleDigest: prepared.preservation.recoveryBundleDigest,
    changedModules: [...prepared.delta.changedModules],
    selector: D0046_R6_SELECTOR,
    caseId: D0046_R6_CASE,
    providerMutation: true,
    uploadErrorCode: uploadError?.code ?? null,
    secrets: 'excluded',
  });
}

export function summarizeCachedContextRecovery(prepared) {
  return Object.freeze({
    profile: D0046_R6_PROFILE,
    status: 'prepared',
    predecessorVersionId: D0046_R6_PREDECESSOR_VERSION,
    predecessorBundleDigest: prepared.preservation.predecessorBundleDigest,
    recoveryBundleDigest: prepared.preservation.recoveryBundleDigest,
    changedModules: [...prepared.delta.changedModules],
    selector: D0046_R6_SELECTOR,
    fixedCaseId: D0046_R6_CASE,
    providerMutation: false,
    secrets: 'excluded',
  });
}

async function main(argv = process.argv.slice(2)) {
  const [mode] = argv;
  if (!['--prepare', '--apply'].includes(mode)) fail('d0046_r6_cli_invalid', 'Usage: d0046-r6-cached-context-read.mjs --prepare|--apply');
  const prepared = await prepareCachedContextRecovery();
  if (mode === '--prepare') {
    process.stdout.write(`${JSON.stringify(summarizeCachedContextRecovery(prepared), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await applyCachedContextRecovery(prepared), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ code: error?.code ?? 'd0046_r6_failed', message: error?.message ?? String(error), details: error?.details ?? null })}\n`);
    process.exitCode = 1;
  });
}
