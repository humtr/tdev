import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { runGitCommand } from '../src/git-projection.mjs';
import { canonicalJson, digest, isPlainRecord } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { defineDevelopmentUnitPlan } from '../src/development-unit.mjs';
import { CASEDO_DEFAULT_CHUNK_BYTES } from '../src/casedo-authority.mjs';
import { SEMANTIC_PROFILE } from '../src/semantic-authority.mjs';
import { normalizeDevelopmentOperationManifest } from '../src/development-operation-profile.mjs';
import {
  CloudflareApiClient,
  loadCloudflareCredentials,
} from './cloudflare-casedo-api.mjs';
import {
  D0046_CASE_NAMESPACE,
  D0046_CASE_PLACEMENT_DATABASE,
  D0046_CASE_SCRIPT,
  D0046_MIN_CASE_AUTHORITATIVE_BYTES,
  D0046_MCP_TRIAL_ORIGIN,
  D0046_MCP_TRIAL_SCRIPT,
  D0046_MCP_CONTEXT_SCOPE,
  D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
  assertCaseOwnerCapacity,
} from './d0046-mcp-trial-deploy.mjs';
import { buildMcpTrialBaseTreeModule } from './mcp-trial-base-tree-builder.mjs';

const DEFAULT_ENV_FILE = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const DEFAULT_REVISION_ID = 'tdev-mcp-preflight';
const DEFAULT_REPOSITORY_COMMIT_OID = '0'.repeat(40);
const MODEL_PROFILE = 'tdev.model.repository.execute.v1';
const VALIDATION_OPERATION_PROFILE = 'tdev.repository.validate.v1';
const VALIDATION_PROFILE = 'tdev.validation.npm-check.v1';
const MAX_INSTRUCTION_BYTES = 64 * 1024;
const MAX_CASE_ID_BYTES = 128;
const WORST_CASE_ID = 'tdev-trial-' + 'x'.repeat(MAX_CASE_ID_BYTES - 'tdev-trial-'.length);

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function chunkCount(text, chunkBytes = CASEDO_DEFAULT_CHUNK_BYTES) {
  let chunks = 0;
  let current = 0;
  for (const character of text) {
    const size = bytes(character);
    if (size > chunkBytes) fail('d0046_preflight_chunk_invalid', 'A scalar cannot fit the CaseDO chunk bound');
    if (current > 0 && current + size > chunkBytes) {
      chunks += 1;
      current = 0;
    }
    current += size;
  }
  return chunks + 1;
}

/**
 * Compute the fresh semantic Case admission size without writing a Case.
 * The formula mirrors CaseDOAuthority.#prepareState and is intentionally kept
 * as a preflight-only helper; the provider remains the authoritative admission
 * owner at execution time.
 */
export function measureFreshCaseAuthoritativeBytes({
  caseId = WORST_CASE_ID,
  revisionId = DEFAULT_REVISION_ID,
  baseTree,
  repositoryCommitOid = DEFAULT_REPOSITORY_COMMIT_OID,
  instruction = 'x'.repeat(MAX_INSTRUCTION_BYTES),
  validationProfile = VALIDATION_PROFILE,
  objectFormat = 'sha1',
  caseContract = {},
} = {}) {
  if (!isPlainRecord(baseTree) || Object.keys(baseTree).length === 0) fail('d0046_preflight_base_invalid', 'Preflight requires a non-empty immutable base tree');
  const plan = defineDevelopmentUnitPlan({
    revisionId,
    baseTree,
    repositoryCommitOid,
    objectFormat,
    instruction,
    validationProfile,
    caseContract,
  });
  const engine = new CaseEngine({
    caseId,
    plan,
    caseContract,
    semanticAuthority: { profile: SEMANTIC_PROFILE },
  });
  const snapshotText = canonicalJson(engine.snapshot());
  let semanticObjectBytesIncludingRowOverhead = 0;
  let semanticObjectCount = 0;
  for (const record of engine.semanticObjectRecords()) {
    const recordText = canonicalJson(record);
    semanticObjectBytesIncludingRowOverhead += bytes(recordText) + (chunkCount(recordText) + 1) * 256;
    semanticObjectCount += 1;
  }
  const snapshotBytes = bytes(snapshotText);
  const snapshotChunks = chunkCount(snapshotText);
  const requiredAuthoritativeBytes = 4096 + snapshotBytes + snapshotChunks * 256 + semanticObjectBytesIncludingRowOverhead;
  return Object.freeze({
    caseId,
    revisionId,
    instructionBytes: bytes(instruction),
    baseDigest: digest(baseTree),
    snapshotBytes,
    snapshotChunks,
    semanticObjectCount,
    semanticObjectBytesIncludingRowOverhead,
    requiredAuthoritativeBytes,
    formula: {
      metadataOverheadBytes: 4096,
      rowOverheadBytes: 256,
      chunkBytes: CASEDO_DEFAULT_CHUNK_BYTES,
      owner: 'src/casedo-authority.mjs::CaseDOAuthority.#prepareState',
    },
  });
}

export function assertCapacityPreflight({ requiredAuthoritativeBytes, configuredBytes } = {}) {
  if (!Number.isSafeInteger(requiredAuthoritativeBytes) || requiredAuthoritativeBytes < D0046_MIN_CASE_AUTHORITATIVE_BYTES) {
    fail('d0046_preflight_requirement_invalid', 'Source-bound Case admission requirement was below the accepted measured minimum', {
      requiredAuthoritativeBytes,
      minimumBytes: D0046_MIN_CASE_AUTHORITATIVE_BYTES,
    });
  }
  if (!Number.isSafeInteger(configuredBytes) || configuredBytes < requiredAuthoritativeBytes) {
    fail('d0046_preflight_capacity_insufficient', 'Read-back Case owner budget is absent or below the source-bound requirement', {
      requiredAuthoritativeBytes,
      configuredBytes: Number.isSafeInteger(configuredBytes) ? configuredBytes : null,
    });
  }
  if (configuredBytes < D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES) {
    fail('d0046_preflight_budget_not_qualified', 'Case owner budget is below the accepted D0019-qualified 16 MiB value', {
      configuredBytes,
      qualifiedBytes: D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
    });
  }
  return Object.freeze({ requiredAuthoritativeBytes, configuredBytes, headroomBytes: configuredBytes - requiredAuthoritativeBytes });
}

function bindingsOf(settings) {
  const bindings = settings?.bindings ?? settings?.resources?.bindings ?? settings?.version?.resources?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) fail('d0046_preflight_bindings_invalid', 'Provider Worker settings did not contain bindings');
  return bindings;
}

function binding(settings, name) {
  const matches = bindingsOf(settings).filter((entry) => entry?.name === name);
  if (matches.length !== 1) fail('d0046_preflight_binding_invalid', `Expected exactly one ${name} binding`, { matches: matches.length });
  return matches[0];
}

function textBinding(settings, name) {
  const entry = binding(settings, name);
  if (entry.type !== 'plain_text' || typeof entry.text !== 'string' || entry.text.length === 0) {
    fail('d0046_preflight_binding_invalid', `${name} was not a non-empty plain-text binding`);
  }
  return entry.text;
}

function secretPresent(settings, name) {
  return binding(settings, name).type === 'secret_text';
}

function assertText(settings, name, expected) {
  if (textBinding(settings, name) !== expected) fail('d0046_preflight_binding_mismatch', `${name} did not match the fixed trial owner`, { expected, actual: textBinding(settings, name) });
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) fail('d0046_preflight_binding_invalid', `${label} was not a full Git SHA`);
  return value;
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail('d0046_preflight_binding_invalid', `${label} was not a sha256 digest`);
  return value;
}

function parseCanonicalBindingJson(settings, name) {
  const text = textBinding(settings, name);
  let value;
  try { value = JSON.parse(text); } catch (cause) { fail('d0046_preflight_binding_invalid', `${name} was not JSON`, undefined, { cause }); }
  if (!isPlainRecord(value) || canonicalJson(value) !== text) fail('d0046_preflight_binding_invalid', `${name} was not canonical JSON`);
  return value;
}

async function scriptSettings(client, scriptName) {
  return (await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/settings`))).result;
}

async function scriptDeployment(client, scriptName) {
  const encoded = encodeURIComponent(scriptName);
  const versions = (await client.request('GET', client.accountPath(`/workers/scripts/${encoded}/versions?per_page=100`))).result?.items;
  if (!Array.isArray(versions) || versions.length === 0) fail('d0046_preflight_version_missing', `${scriptName} had no versions`);
  const highestNumber = Math.max(...versions.map((entry) => Number(entry?.number)));
  const latest = versions.filter((entry) => Number(entry?.number) === highestNumber);
  if (latest.length !== 1 || typeof latest[0]?.id !== 'string') fail('d0046_preflight_version_ambiguous', `${scriptName} latest version was ambiguous`);
  const deployments = (await client.request('GET', client.accountPath(`/workers/scripts/${encoded}/deployments`))).result?.deployments;
  const active = (deployments ?? []).filter((entry) => Array.isArray(entry?.versions) && entry.versions.length === 1 && entry.versions[0]?.version_id === latest[0].id && entry.versions[0]?.percentage === 100);
  if (active.length !== 1) fail('d0046_preflight_traffic_invalid', `${scriptName} was not uniquely active at 100%`, { matches: active.length });
  return Object.freeze({
    versionId: latest[0].id,
    versionNumber: highestNumber,
    activeDeploymentId: active[0].id,
    traffic: active[0].versions,
    version: latest[0],
    deployment: active[0],
  });
}

async function readExactFile(repositoryPath, commitOid, filePath) {
  const result = await runGitCommand({ repositoryPath, args: ['show', `${commitOid}:${filePath}`] });
  if (result.code !== 0) fail('d0046_preflight_source_missing', `Git could not read ${filePath} from the bound source`, { exitCode: result.code });
  return result.stdout.toString('utf8');
}

function assertTrialSettings(settings) {
  assertText(settings, 'TDEV_WORKER_SCRIPT', D0046_MCP_TRIAL_SCRIPT);
  assertText(settings, 'TDEV_DEPLOYMENT', D0046_MCP_TRIAL_SCRIPT);
  assertText(settings, 'TDEV_ENVIRONMENT', 'qualification');
  const sourceSha = assertSha(textBinding(settings, 'TDEV_SOURCE_SHA'), 'TDEV_SOURCE_SHA');
  assertText(settings, 'TDEV_MCP_REPOSITORY_COMMIT', sourceSha);
  const baseDigest = assertDigest(textBinding(settings, 'TDEV_MCP_BASE_DIGEST'), 'TDEV_MCP_BASE_DIGEST');
  assertText(settings, 'TDEV_MCP_TRIAL_RESOURCE', `${D0046_MCP_TRIAL_ORIGIN}/mcp`);
  assertText(settings, 'TDEV_MCP_CANONICAL_WRITER_ENABLED', 'false');
  assertText(settings, 'TDEV_MCP_PREVIEW_WRITERS_ENABLED', 'false');
  const drive = binding(settings, 'TDEV_CASE_AGENT_DRIVE');
  if (drive.type !== 'durable_object_namespace' || drive.class_name !== 'CaseAgentDriveRuntimeDO' || typeof drive.namespace_id !== 'string') fail('d0046_preflight_binding_mismatch', 'Trial Drive binding was not the fixed SQLite owner');
  const caseAuthority = binding(settings, 'TDEV_CASE_AUTHORITY');
  if (caseAuthority.type !== 'durable_object_namespace' || caseAuthority.class_name !== 'CaseRuntimeDO' || caseAuthority.namespace_id !== D0046_CASE_NAMESPACE) fail('d0046_preflight_binding_mismatch', 'Trial Case binding was not the fixed Case owner');
  const placement = binding(settings, 'TDEV_CASE_PLACEMENT');
  if (placement.type !== 'd1' || placement.database_id !== D0046_CASE_PLACEMENT_DATABASE) fail('d0046_preflight_binding_mismatch', 'Trial D1 placement was not the fixed database');
  const composition = parseCanonicalBindingJson(settings, 'TDEV_MCP_TRIAL_MANIFEST_JSON');
  if (composition.repository?.context?.contextProfile !== 'tdev.repository.context.prepare.lazy.v1' ||
      composition.repository?.scopeDigest !== composition.repository?.context?.scopeDigest ||
      JSON.stringify(composition.repository?.scope) !== JSON.stringify(D0046_MCP_CONTEXT_SCOPE) ||
      composition.repository?.repositoryBaseIdentity?.manifestDigest === undefined) {
    fail('d0046_preflight_manifest_mismatch', 'Trial composition did not bind the accepted lazy repository identity and scope');
  }
  return { sourceSha, baseDigest, driveNamespace: drive.namespace_id, composition };
}

function assertCaseSettings(settings) {
  const configuredBytes = assertCaseOwnerCapacity(settings, D0046_MIN_CASE_AUTHORITATIVE_BYTES);
  assertText(settings, 'TDEV_WORKER_SCRIPT', D0046_CASE_SCRIPT);
  assertText(settings, 'TDEV_DEPLOYMENT', D0046_CASE_SCRIPT);
  assertText(settings, 'TDEV_ENVIRONMENT', 'qualification');
  assertText(settings, 'TDEV_SOURCE_SHA', 'e4420cb776bf8f6a4bde4d636aef7bc4bb2b2626');
  assertText(settings, 'TDEV_CASEDO_NAMESPACE', D0046_CASE_NAMESPACE);
  assertText(settings, 'TDEV_CASEDO_WRITER_COMPATIBILITY_ID', 'd0020-composition-r1');
  const authority = binding(settings, 'TDEV_CASE_AUTHORITY');
  if (authority.type !== 'durable_object_namespace' || authority.class_name !== 'CaseRuntimeDO' || authority.namespace_id !== D0046_CASE_NAMESPACE) fail('d0046_preflight_binding_mismatch', 'Case authority was not the fixed CaseRuntimeDO namespace');
  const placement = binding(settings, 'TDEV_CASE_PLACEMENT');
  if (placement.type !== 'd1' || placement.database_id !== D0046_CASE_PLACEMENT_DATABASE) fail('d0046_preflight_binding_mismatch', 'Case D1 placement was not the fixed database');
  if (!secretPresent(settings, 'TDEV_D0019_QUALIFICATION_TOKEN')) fail('d0046_preflight_secret_missing', 'Case qualification secret binding was absent');
  return configuredBytes;
}

export async function runM1CapacityPreflight({
  repositoryPath = path.resolve(new URL('..', import.meta.url).pathname),
  envFile = DEFAULT_ENV_FILE,
} = {}) {
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient({ ...credentials, apiOrigin: API_ORIGIN });
  const [trialSettings, caseSettings, trialDeployment, caseDeployment] = await Promise.all([
    scriptSettings(client, D0046_MCP_TRIAL_SCRIPT),
    scriptSettings(client, D0046_CASE_SCRIPT),
    scriptDeployment(client, D0046_MCP_TRIAL_SCRIPT),
    scriptDeployment(client, D0046_CASE_SCRIPT),
  ]);
  const trial = assertTrialSettings(trialSettings);
  const configuredBytes = assertCaseSettings(caseSettings);
  const head = await runGitCommand({ repositoryPath, args: ['rev-parse', 'HEAD'] });
  if (head.code !== 0) fail('d0046_preflight_source_missing', 'Git could not resolve the local source HEAD', { exitCode: head.code });
  const localSourceSha = head.stdout.toString('utf8').trim();
  if (localSourceSha !== trial.sourceSha) fail('d0046_preflight_source_mismatch', 'Local checkout was not the exact source bound to the trial Worker', { provider: trial.sourceSha, local: localSourceSha });
  const expectedContextReference = `tdev-context-${trial.sourceSha.slice(0, 12)}`;
  const expectedContextRevision = `tdev-mcp-${trial.sourceSha.slice(0, 12)}`;
  const composition = trial.composition;
  if (composition.repository?.commitOid !== trial.sourceSha || composition.repository?.baseDigest !== trial.baseDigest || composition.repository?.contextReference !== expectedContextReference || composition.repository?.context?.repositoryCommitOid !== trial.sourceSha || composition.repository?.context?.revisionId !== expectedContextRevision || composition.repository?.context?.contextReferenceId !== expectedContextReference) {
    fail('d0046_preflight_manifest_mismatch', 'Trial composition manifest did not match the provider-bound source/base/context');
  }
  const operationText = await readExactFile(repositoryPath, trial.sourceSha, 'config/development-operation-profiles.json');
  let operation;
  try { operation = normalizeDevelopmentOperationManifest(JSON.parse(operationText)); } catch (cause) { fail('d0046_preflight_operation_invalid', 'Bound source operation manifest was invalid', undefined, { cause }); }
  if (!operation.profiles[MODEL_PROFILE] || !operation.profiles[VALIDATION_OPERATION_PROFILE] || operation.profiles[VALIDATION_OPERATION_PROFILE].binding?.profile !== VALIDATION_PROFILE) fail('d0046_preflight_operation_invalid', 'Bound source operation manifest omitted the required model or validation profile');
  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid: trial.sourceSha, scope: composition.repository.scope });
  if (base.baseDigest !== trial.baseDigest) fail('d0046_preflight_base_mismatch', 'Recomputed source-bound base digest differed from provider binding', { expected: trial.baseDigest, actual: base.baseDigest });
  if (base.repositoryBaseIdentity.baseDigest !== composition.repository.repositoryBaseIdentity.baseDigest || base.manifestDigest !== composition.repository.repositoryBaseIdentity.manifestDigest || base.scopeDigest !== composition.repository.scopeDigest) {
    fail('d0046_preflight_identity_mismatch', 'Recomputed source-bound complete identity differed from provider binding');
  }
  const measurement = measureFreshCaseAuthoritativeBytes({
    baseTree: base.tree,
    repositoryCommitOid: trial.sourceSha,
    revisionId: composition.repository.context.revisionId,
    caseContract: composition.repository.context.caseContract ?? {},
  });
  const capacity = assertCapacityPreflight({ requiredAuthoritativeBytes: measurement.requiredAuthoritativeBytes, configuredBytes });
  return Object.freeze({
    status: 'pass',
    source: { commitOid: trial.sourceSha, treeOid: base.treeOid, objectFormat: base.objectFormat, baseDigest: base.baseDigest, repositoryBaseDigest: base.repositoryBaseIdentity.baseDigest, manifestDigest: base.manifestDigest, scopeDigest: base.scopeDigest, scope: base.scope, manifestEntryCount: base.manifestEntryCount, fileCount: base.fileCount, semanticBytes: base.semanticBytes, selectedBytes: base.selectedBytes, compressedBytes: base.compressedBytes },
    composition: { contextReference: expectedContextReference, driveNamespace: trial.driveNamespace },
    provider: {
      trial: { scriptName: D0046_MCP_TRIAL_SCRIPT, versionId: trialDeployment.versionId, versionNumber: trialDeployment.versionNumber, activeDeploymentId: trialDeployment.activeDeploymentId, traffic: trialDeployment.traffic },
      case: { scriptName: D0046_CASE_SCRIPT, versionId: caseDeployment.versionId, versionNumber: caseDeployment.versionNumber, activeDeploymentId: caseDeployment.activeDeploymentId, traffic: caseDeployment.traffic, configuredBytes },
    },
    measurement,
    capacity,
    effects: { caseCreated: false, canonicalTreeMutation: false, gitRefMutation: false, trialWorkerMutation: false, caseWorkerMutation: false, secretValuesRead: false },
    next: 'One fresh authenticated web ChatGPT M2 development attempt; no additional ad hoc refresh probes.',
  });
}

async function main() {
  const args = process.argv.slice(2);
  let envFile = DEFAULT_ENV_FILE;
  let repositoryPath = path.resolve(new URL('..', import.meta.url).pathname);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--env-file' && index + 1 < args.length) envFile = args[++index];
    else if (args[index] === '--repository-path' && index + 1 < args.length) repositoryPath = path.resolve(args[++index]);
    else fail('d0046_preflight_cli_invalid', `Unsupported or incomplete argument: ${args[index]}`);
  }
  process.stdout.write(`${JSON.stringify(await runM1CapacityPreflight({ repositoryPath, envFile }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0046_preflight_failed', message: error?.message ?? String(error), details: error?.details ?? undefined }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
