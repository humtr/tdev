import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
import { canonicalClone, canonicalJson, digest, isPlainRecord } from '../src/canonical.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const D0046_R5_RECOVERY_PROFILE = 'tdev.d0046.r5.recovery-read.v1';
export const D0046_R5_PREDECESSOR_SOURCE = '78f47d5002f7f0fbeb3520b7ec82dbc2a7356b61';
export const D0046_R5_PREDECESSOR_VERSION = '5fc3a517-f82d-4aa4-9f37-5e2b0586e3e9';
export const D0046_R5_RECOVERY_TOOL = 'development_execution_state_get';
export const D0046_R5_RECOVERY_CASE = 'tdev-trial-m2-20260905-r3';
const GENERATED_BASE_MODULE = 'qualification/mcp-trial-base-tree.mjs';
const CONTENT_LIMIT_BYTES = 16 * 1024 * 1024;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function moduleBundleDigest(modules) {
  const hash = createHash('sha256');
  for (const name of [...modules.keys()].sort()) {
    const value = modules.get(name);
    hash.update(name).update('\0').update(value).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function binding(settings, name) {
  const matches = (settings?.bindings ?? []).filter((item) => item?.name === name);
  if (matches.length !== 1) fail('d0046_r5_binding_invalid', 'Expected one exact Worker binding', { name, matches: matches.length });
  return matches[0];
}

function runtimeMetadata(predecessor) {
  const runtime = predecessor?.version?.resources?.script_runtime ?? predecessor?.settings?.script_runtime ?? predecessor?.settings;
  const compatibilityDate = runtime?.compatibility_date;
  const compatibilityFlags = runtime?.compatibility_flags;
  const exports = runtime?.exports;
  if (typeof compatibilityDate !== 'string' || !Array.isArray(compatibilityFlags) || !isPlainRecord(exports)) {
    fail('d0046_r5_runtime_invalid', 'Active predecessor runtime metadata is incomplete');
  }
  if (exports.CaseAgentDriveRuntimeDO?.type !== 'durable-object' || exports.CaseAgentDriveRuntimeDO?.storage !== 'sqlite') {
    fail('d0046_r5_runtime_invalid', 'Active predecessor Drive export changed');
  }
  return {
    main_module: D0046_WORKER_MAIN_MODULE,
    compatibility_date: compatibilityDate,
    compatibility_flags: canonicalClone(compatibilityFlags),
    bindings: canonicalClone(predecessor.settings.bindings),
    exports: canonicalClone(exports),
    annotations: {
      'workers/message': 'D0046 r5 ingress-only recovery read',
      'workers/tag': 'tdev-d0046-r5-recovery-read-v1',
    },
  };
}

async function contentFormData(client) {
  const apiPath = client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}/content/v2`);
  let response;
  try {
    response = await client.fetchImpl(`${client.apiOrigin}${apiPath}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${client.apiToken}` },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (cause) {
    fail('d0046_r5_content_unavailable', 'Active Worker content read failed before a response was trusted', { apiPath }, { cause });
  }
  if (!response.ok) fail('d0046_r5_content_rejected', 'Active Worker content read was rejected', { status: response.status });
  const type = response.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) fail('d0046_r5_content_invalid', 'Active Worker content was not multipart');
  return response.formData();
}

export async function downloadActiveTrialModules(client) {
  const form = await contentFormData(client);
  const modules = new Map();
  let total = 0;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') fail('d0046_r5_content_invalid', 'Active Worker content contained a non-module text part', { name });
    if (typeof name !== 'string' || name.length === 0 || modules.has(name)) fail('d0046_r5_content_invalid', 'Active Worker module name was empty or duplicated', { name });
    if (value.type !== 'application/javascript+module') fail('d0046_r5_content_invalid', 'Active Worker content contained a non-module part', { name, type: value.type });
    const bytes = new Uint8Array(await value.arrayBuffer());
    total += bytes.byteLength;
    if (total > CONTENT_LIMIT_BYTES) fail('d0046_r5_content_too_large', 'Active Worker module bundle exceeded the recovery bound');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    modules.set(name, source);
  }
  if (!modules.has(D0046_WORKER_MAIN_MODULE) || !modules.has(GENERATED_BASE_MODULE)) {
    fail('d0046_r5_content_invalid', 'Active Worker bundle omitted the fixed main or generated base module');
  }
  return modules;
}

export function verifyProviderBundleAgainstGit(modules, { repositoryPath = repositoryRoot, sourceSha = D0046_R5_PREDECESSOR_SOURCE } = {}) {
  if (!(modules instanceof Map) || modules.size === 0) fail('d0046_r5_content_invalid', 'Recovery source modules must be a nonempty Map');
  const mismatches = [];
  const missing = [];
  for (const [name, deployed] of modules) {
    if (name === GENERATED_BASE_MODULE) continue;
    let tracked;
    try {
      tracked = execFileSync('git', ['show', `${sourceSha}:${name}`], {
        cwd: repositoryPath,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      missing.push(name);
      continue;
    }
    if (tracked !== deployed) mismatches.push(name);
  }
  if (missing.length !== 0 || mismatches.length !== 0) {
    fail('d0046_r5_predecessor_source_mismatch', 'Active Worker modules did not match the declared predecessor source', { missing, mismatches });
  }
  return Object.freeze({ compared: modules.size - 1, generatedModule: GENERATED_BASE_MODULE, missing: [], mismatches: [] });
}

const RECOVERY_BLOCK = String.raw`
const D0046_R5_RECOVERY_TOOL = 'development_execution_state_get';
const D0046_R5_RECOVERY_REQUEST_BYTES = 64 * 1024;
const D0046_R5_DRIVE_STATES = new Set(['ACTIVE', 'QUIESCED', 'RECONCILING']);
const D0046_R5_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const D0046_R5_CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

const D0046_R5_RECOVERY_DESCRIPTOR = Object.freeze({
  name: D0046_R5_RECOVERY_TOOL,
  description: 'D0046 r5 temporary authenticated read-only projection of the existing trial Drive execution state.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['caseId'],
    properties: { caseId: { type: 'string', minLength: 1, maxLength: 128 } },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
});

async function d0046R5RpcHint(request) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/mcp') return null;
  let bytes;
  try { bytes = new Uint8Array(await request.clone().arrayBuffer()); } catch { return null; }
  if (bytes.byteLength === 0 || bytes.byteLength > D0046_R5_RECOVERY_REQUEST_BYTES) return null;
  let rpc;
  try { rpc = strictJsonParse(bytes, { maxBytes: D0046_R5_RECOVERY_REQUEST_BYTES, maxDepth: 16, maxTokens: 4096 }); } catch { return null; }
  if (!isPlainRecord(rpc) || rpc.jsonrpc !== '2.0' || !Object.hasOwn(rpc, 'id')) return null;
  if (rpc.method === 'tools/list') return { kind: 'list', id: rpc.id };
  if (rpc.method === 'tools/call' && isPlainRecord(rpc.params) && rpc.params.name === D0046_R5_RECOVERY_TOOL) {
    return { kind: 'call', id: rpc.id, args: rpc.params.arguments ?? {} };
  }
  return null;
}

function d0046R5Response(request, id, result) {
  const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
  const protocol = request.headers.get('mcp-protocol-version');
  if (protocol !== null) headers['mcp-protocol-version'] = protocol;
  return new Response(canonicalJson({ jsonrpc: '2.0', id, result }), { status: 200, headers });
}

function d0046R5Error(request, id, code) {
  const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
  const protocol = request.headers.get('mcp-protocol-version');
  if (protocol !== null) headers['mcp-protocol-version'] = protocol;
  return new Response(canonicalJson({
    jsonrpc: '2.0', id,
    error: { code: -32000, message: 'MCP request failed', data: { code } },
  }), { status: 400, headers });
}

async function d0046R5NormalErrorCode(response) {
  try {
    const body = JSON.parse(await response.clone().text());
    return body?.error?.data?.code ?? null;
  } catch { return null; }
}

async function d0046R5AppendTool(request, response, hint) {
  if (hint?.kind !== 'list' || response.status !== 200) return response;
  let body;
  try { body = JSON.parse(await response.clone().text()); } catch { return response; }
  if (!Array.isArray(body?.result?.tools) || body.result.tools.some((tool) => tool?.name === D0046_R5_RECOVERY_TOOL)) return response;
  body.result.tools = [...body.result.tools, D0046_R5_RECOVERY_DESCRIPTOR];
  return d0046R5Response(request, hint.id, body.result);
}

function d0046R5ProjectDrive(caseId, record) {
  if (record === null) return Object.freeze({
    caseId, status: null, revision: null, lastCaseRevision: null,
    lastDriveReceiptDigest: null, lastObservedDeliveryDigest: null,
  });
  if (!isPlainRecord(record) || record.caseId !== caseId || !D0046_R5_DRIVE_STATES.has(record.status) ||
      !Number.isSafeInteger(record.revision) || record.revision < 0 ||
      !(record.lastCaseRevision === null || (Number.isSafeInteger(record.lastCaseRevision) && record.lastCaseRevision >= 0)) ||
      !(record.lastDriveReceiptDigest === null || D0046_R5_DIGEST.test(record.lastDriveReceiptDigest)) ||
      !(record.lastObservedDeliveryDigest === null || D0046_R5_DIGEST.test(record.lastObservedDeliveryDigest))) {
    throw configError('d0046_r5_drive_projection_invalid', 'Recovered Drive record failed its bounded projection');
  }
  return Object.freeze({
    caseId,
    status: record.status,
    revision: record.revision,
    lastCaseRevision: record.lastCaseRevision,
    lastDriveReceiptDigest: record.lastDriveReceiptDigest,
    lastObservedDeliveryDigest: record.lastObservedDeliveryDigest,
  });
}

async function d0046R5Call(request, env, response, hint) {
  if (hint?.kind !== 'call') return response;
  // The ordinary surface authenticates and authorizes before it rejects the
  // temporary name.  Only that exact post-auth rejection admits the overlay.
  if (await d0046R5NormalErrorCode(response) !== 'mcp_tool_not_found') return response;
  const args = hint.args;
  if (!isPlainRecord(args) || Object.keys(args).length !== 1 || !D0046_R5_CASE_ID.test(args.caseId ?? '')) {
    return d0046R5Error(request, hint.id, 'mcp_invalid_arguments');
  }
  const composition = normalizeMcpTrialCompositionBinding(readJsonBinding(env, TRIAL_MANIFEST_BINDING));
  assertGeneratedBaseBinding(composition);
  if (!args.caseId.startsWith(composition.casePrefix)) return d0046R5Error(request, hint.id, 'mcp_trial_case_scope_denied');
  const driveNs = namespaceFor(env.TDEV_CASE_AGENT_DRIVE, composition.jurisdiction, 'Case-Agent drive');
  const id = driveNs.idFromName(args.caseId);
  if (!id || typeof id.toString !== 'function' || (id.jurisdiction ?? 'global') !== composition.jurisdiction) {
    return d0046R5Error(request, hint.id, 'mcp_owner_unavailable');
  }
  const stub = driveNs.get(id);
  if (!stub || typeof stub.readCaseAgentDrive !== 'function') return d0046R5Error(request, hint.id, 'mcp_owner_unavailable');
  let projected;
  try { projected = d0046R5ProjectDrive(args.caseId, await stub.readCaseAgentDrive({ caseId: args.caseId })); }
  catch { return d0046R5Error(request, hint.id, 'd0046_r5_drive_projection_invalid'); }
  const structuredContent = canonicalClone(projected);
  return d0046R5Response(request, hint.id, {
    content: [{ type: 'text', text: canonicalJson(structuredContent) }],
    structuredContent,
    isError: false,
  });
}
`;

const INSERT_ANCHOR = '\nlet lightApplicationPromise = null;\n';
const FETCH_ANCHOR = `      const worker = await lightApplication(env);\n      const response = await worker.fetch(request);\n      emitRequestDiagnostic('mcp', request, { status: response.status, ...(await responseDiagnosticFields(response)) });\n      return response;`;
const FETCH_REPLACEMENT = `      const worker = await lightApplication(env);\n      const recoveryHint = await d0046R5RpcHint(request);\n      const ordinaryResponse = await worker.fetch(request);\n      let response = await d0046R5AppendTool(request, ordinaryResponse, recoveryHint);\n      response = await d0046R5Call(request, env, response, recoveryHint);\n      emitRequestDiagnostic('mcp', request, { status: response.status, ...(await responseDiagnosticFields(response)) });\n      return response;`;

export function patchRecoveryIngressSource(source) {
  if (typeof source !== 'string' || source.length === 0) fail('d0046_r5_ingress_invalid', 'Predecessor ingress source is empty');
  if (source.includes(D0046_R5_RECOVERY_TOOL)) fail('d0046_r5_ingress_already_patched', 'Predecessor ingress already exposes the recovery tool');
  const insertCount = source.split(INSERT_ANCHOR).length - 1;
  const fetchCount = source.split(FETCH_ANCHOR).length - 1;
  if (insertCount !== 1 || fetchCount !== 1) fail('d0046_r5_ingress_anchor_mismatch', 'Predecessor ingress patch anchors were not exact', { insertCount, fetchCount });
  return source.replace(INSERT_ANCHOR, `\n${RECOVERY_BLOCK}${INSERT_ANCHOR}`).replace(FETCH_ANCHOR, FETCH_REPLACEMENT);
}

export function validateRecoveryModuleDelta(predecessor, recovery) {
  if (!(predecessor instanceof Map) || !(recovery instanceof Map)) fail('d0046_r5_module_delta_invalid', 'Recovery module sets must be Maps');
  if (predecessor.size !== recovery.size || predecessor.size === 0) fail('d0046_r5_module_delta_invalid', 'Recovery module count changed');
  const changed = [];
  for (const [name, source] of predecessor) {
    if (!recovery.has(name)) fail('d0046_r5_module_delta_invalid', 'Recovery module set omitted a predecessor module', { name });
    if (recovery.get(name) !== source) changed.push(name);
  }
  for (const name of recovery.keys()) if (!predecessor.has(name)) fail('d0046_r5_module_delta_invalid', 'Recovery module set added a module', { name });
  if (canonicalJson(changed) !== canonicalJson([D0046_WORKER_MAIN_MODULE])) {
    fail('d0046_r5_module_delta_invalid', 'Recovery artifact changed modules outside the ingress main module', { changed });
  }
  return Object.freeze({ moduleCount: predecessor.size, changedModules: changed });
}

export function projectRecoveryDriveState(caseId, record) {
  if (typeof caseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(caseId)) fail('d0046_r5_case_id_invalid', 'Recovery Case ID is invalid');
  if (record === null) return Object.freeze({ caseId, status: null, revision: null, lastCaseRevision: null, lastDriveReceiptDigest: null, lastObservedDeliveryDigest: null });
  if (!isPlainRecord(record) || record.caseId !== caseId || !['ACTIVE', 'QUIESCED', 'RECONCILING'].includes(record.status) ||
      !Number.isSafeInteger(record.revision) || record.revision < 0 ||
      !(record.lastCaseRevision === null || (Number.isSafeInteger(record.lastCaseRevision) && record.lastCaseRevision >= 0)) ||
      !(record.lastDriveReceiptDigest === null || DIGEST_RE.test(record.lastDriveReceiptDigest)) ||
      !(record.lastObservedDeliveryDigest === null || DIGEST_RE.test(record.lastObservedDeliveryDigest))) {
    fail('d0046_r5_drive_projection_invalid', 'Drive record cannot be safely projected');
  }
  return Object.freeze({
    caseId,
    status: record.status,
    revision: record.revision,
    lastCaseRevision: record.lastCaseRevision,
    lastDriveReceiptDigest: record.lastDriveReceiptDigest,
    lastObservedDeliveryDigest: record.lastObservedDeliveryDigest,
  });
}

export function positiveRecoveryQuiescence(projected) {
  return Boolean(projected && projected.status === 'QUIESCED' && Number.isSafeInteger(projected.lastCaseRevision) && projected.lastCaseRevision >= 0 && DIGEST_RE.test(projected.lastDriveReceiptDigest ?? ''));
}

function assertPredecessor(predecessor) {
  const version = predecessor?.deployment?.versions?.[0]?.version_id;
  if (version !== D0046_R5_PREDECESSOR_VERSION) fail('d0046_r5_predecessor_changed', 'Active trial version is not the accepted r5 recovery predecessor', { expected: D0046_R5_PREDECESSOR_VERSION, actual: version ?? null });
  const source = binding(predecessor.settings, 'TDEV_SOURCE_SHA');
  if (source.type !== 'plain_text' || source.text !== D0046_R5_PREDECESSOR_SOURCE) fail('d0046_r5_predecessor_changed', 'Active trial source marker changed');
  return predecessor;
}

function samePredecessor(a, b) {
  return canonicalJson(a.settings) === canonicalJson(b.settings) && canonicalJson(a.deployment) === canonicalJson(b.deployment);
}

export async function prepareRecoveryRead({ repositoryPath = repositoryRoot, envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env' } = {}) {
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const predecessor = assertPredecessor(await workerReadback(client));
  const deployedModules = await downloadActiveTrialModules(client);
  verifyProviderBundleAgainstGit(deployedModules, { repositoryPath, sourceSha: D0046_R5_PREDECESSOR_SOURCE });
  const afterRead = assertPredecessor(await workerReadback(client));
  if (!samePredecessor(predecessor, afterRead)) fail('d0046_r5_predecessor_changed', 'Trial predecessor changed while its active content was read');
  const recoveryModules = new Map(deployedModules);
  recoveryModules.set(D0046_WORKER_MAIN_MODULE, patchRecoveryIngressSource(deployedModules.get(D0046_WORKER_MAIN_MODULE)));
  const delta = validateRecoveryModuleDelta(deployedModules, recoveryModules);
  const metadata = runtimeMetadata(predecessor);
  const preservation = Object.freeze({
    settingsDigest: digest(predecessor.settings),
    deploymentDigest: digest(predecessor.deployment),
    predecessorBundleDigest: moduleBundleDigest(deployedModules),
    recoveryBundleDigest: moduleBundleDigest(recoveryModules),
    predecessorMainDigest: sha256(deployedModules.get(D0046_WORKER_MAIN_MODULE)),
    recoveryMainDigest: sha256(recoveryModules.get(D0046_WORKER_MAIN_MODULE)),
    driveNamespace: binding(predecessor.settings, 'TDEV_CASE_AGENT_DRIVE').namespace_id,
    caseNamespace: binding(predecessor.settings, 'TDEV_CASE_AUTHORITY').namespace_id,
    agentNamespace: binding(predecessor.settings, 'TDEV_AGENT_DELIVERY').namespace_id,
    d1DatabaseId: binding(predecessor.settings, 'TDEV_CASE_PLACEMENT').database_id,
  });
  return Object.freeze({
    profile: D0046_R5_RECOVERY_PROFILE,
    client,
    predecessor,
    deployedModules,
    recoveryModules,
    metadata,
    delta,
    preservation,
    preservationDigest: digest(preservation),
    providerMutation: false,
  });
}

async function authoritativeSnapshot(client) {
  const worker = await workerReadback(client);
  const modules = await downloadActiveTrialModules(client);
  return { worker, modules, settingsDigest: digest(worker.settings), deploymentDigest: digest(worker.deployment), bundleDigest: moduleBundleDigest(modules) };
}

function validateRecoveryReadback(snapshot, prepared) {
  if (canonicalJson(snapshot.worker.settings) !== canonicalJson(prepared.predecessor.settings)) fail('d0046_r5_recovery_config_changed', 'Recovery upload changed Worker settings');
  validateRecoveryModuleDelta(prepared.deployedModules, snapshot.modules);
  if (snapshot.bundleDigest !== prepared.preservation.recoveryBundleDigest) fail('d0046_r5_recovery_content_mismatch', 'Recovery active module bundle does not match the prepared ingress-only artifact');
  return snapshot;
}

export async function applyRecoveryRead(prepared) {
  if (prepared?.profile !== D0046_R5_RECOVERY_PROFILE || prepared?.preservationDigest !== digest(prepared.preservation)) fail('d0046_r5_preparation_invalid', 'Recovery preparation is incomplete');
  const before = await authoritativeSnapshot(prepared.client);
  if (before.settingsDigest !== prepared.preservation.settingsDigest || before.deploymentDigest !== prepared.preservation.deploymentDigest || before.bundleDigest !== prepared.preservation.predecessorBundleDigest) {
    fail('d0046_r5_predecessor_changed', 'Provider predecessor changed after recovery preparation');
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
  try { after = validateRecoveryReadback(await authoritativeSnapshot(prepared.client), prepared); }
  catch (cause) {
    fail('d0046_r5_recovery_effect_unknown', 'Recovery upload was attempted but exact ingress-only readback did not prove the desired active state', {
      uploadCode: uploadError?.code ?? null,
      predecessorVersionId: D0046_R5_PREDECESSOR_VERSION,
    }, { cause });
  }
  return Object.freeze({
    profile: D0046_R5_RECOVERY_PROFILE,
    status: uploadError === null ? 'recovery_updated' : 'recovery_reconciled_after_ambiguous_upload',
    predecessorVersionId: D0046_R5_PREDECESSOR_VERSION,
    activeVersionId: after.worker.deployment.versions[0].version_id,
    preservationDigest: prepared.preservationDigest,
    predecessorBundleDigest: prepared.preservation.predecessorBundleDigest,
    recoveryBundleDigest: prepared.preservation.recoveryBundleDigest,
    changedModules: [...prepared.delta.changedModules],
    providerMutation: true,
    uploadErrorCode: uploadError?.code ?? null,
    secretValues: 'excluded',
  });
}

export function summarizeRecoveryPreparation(prepared) {
  return Object.freeze({
    profile: D0046_R5_RECOVERY_PROFILE,
    status: 'prepared',
    predecessorSource: D0046_R5_PREDECESSOR_SOURCE,
    predecessorVersionId: D0046_R5_PREDECESSOR_VERSION,
    preservationDigest: prepared.preservationDigest,
    predecessorBundleDigest: prepared.preservation.predecessorBundleDigest,
    recoveryBundleDigest: prepared.preservation.recoveryBundleDigest,
    moduleCount: prepared.delta.moduleCount,
    changedModules: [...prepared.delta.changedModules],
    recoveryTool: D0046_R5_RECOVERY_TOOL,
    providerMutation: false,
    secretValues: 'excluded',
  });
}

async function main(argv = process.argv.slice(2)) {
  const [mode] = argv;
  if (!['--prepare', '--apply'].includes(mode)) fail('d0046_r5_cli_invalid', 'Usage: d0046-r5-recovery-read.mjs --prepare|--apply');
  const prepared = await prepareRecoveryRead();
  if (mode === '--prepare') {
    process.stdout.write(`${JSON.stringify(summarizeRecoveryPreparation(prepared), null, 2)}\n`);
    return;
  }
  const applied = await applyRecoveryRead(prepared);
  process.stdout.write(`${JSON.stringify(applied, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ code: error?.code ?? 'd0046_r5_recovery_failed', message: error?.message ?? String(error), details: error?.details ?? null })}\n`);
    process.exitCode = 1;
  });
}
