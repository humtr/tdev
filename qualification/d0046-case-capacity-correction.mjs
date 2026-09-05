import { pathToFileURL } from 'node:url';

import {
  CloudflareApiClient,
  loadCloudflareCredentials,
} from './cloudflare-casedo-api.mjs';
import {
  D0046_CASE_NAMESPACE,
  D0046_CASE_PLACEMENT_DATABASE,
  D0046_CASE_SCRIPT,
  D0046_MIN_CASE_AUTHORITATIVE_BYTES,
  D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
} from './d0046-mcp-trial-deploy.mjs';

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const CASE_SOURCE_SHA = 'e4420cb776bf8f6a4bde4d636aef7bc4bb2b2626';
const CASE_WRITER_COMPATIBILITY_ID = 'd0020-composition-r1';
const CASE_SECRET_BINDING = 'TDEV_D0019_QUALIFICATION_TOKEN';
const CASE_CAPACITY_BINDING = 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE';
const CASE_CAPACITY_FROM = 8 * 1024 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function bindingsOf(settings) {
  const bindings = settings?.bindings ?? settings?.version?.resources?.bindings ?? settings?.resources?.bindings;
  if (!Array.isArray(bindings) || bindings.length === 0) fail('d0046_case_settings_invalid', 'Case Worker settings did not contain a non-empty bindings array');
  const names = bindings.map((binding) => binding?.name);
  if (names.some((name) => typeof name !== 'string' || name.length === 0) || new Set(names).size !== names.length) {
    fail('d0046_case_settings_invalid', 'Case Worker settings contained an unnamed or duplicate binding');
  }
  return bindings;
}

function oneBinding(settings, name) {
  const matches = bindingsOf(settings).filter((binding) => binding.name === name);
  if (matches.length !== 1) fail('d0046_case_settings_invalid', `Case Worker binding ${name} was absent or duplicated`, { matches: matches.length });
  return matches[0];
}

function positiveVersionId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.length > 128) {
    fail('d0046_case_version_invalid', 'Case Worker latest version identity was invalid');
  }
  return value;
}

function canonicalCapacity(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function assertExactOwner(settings) {
  for (const [name, expected] of [
    ['TDEV_DEPLOYMENT', D0046_CASE_SCRIPT],
    ['TDEV_ENVIRONMENT', 'qualification'],
    ['TDEV_WORKER_SCRIPT', D0046_CASE_SCRIPT],
    ['TDEV_CASEDO_WRITER_COMPATIBILITY_ID', CASE_WRITER_COMPATIBILITY_ID],
    ['TDEV_SOURCE_SHA', CASE_SOURCE_SHA],
    ['TDEV_CASEDO_NAMESPACE', D0046_CASE_NAMESPACE],
    ['TDEV_CASEDO_JURISDICTION', 'global'],
    ['TDEV_D0019_QUALIFICATION_MODE', 'enabled'],
  ]) {
    const binding = oneBinding(settings, name);
    if (binding.type !== 'plain_text' || binding.text !== expected) {
      fail('d0046_case_owner_mismatch', `Case Worker binding ${name} was not the fixed owner value`);
    }
  }
  const authority = oneBinding(settings, 'TDEV_CASE_AUTHORITY');
  if (authority.type !== 'durable_object_namespace' || authority.class_name !== 'CaseRuntimeDO' || authority.namespace_id !== D0046_CASE_NAMESPACE) {
    fail('d0046_case_owner_mismatch', 'Case Worker authority binding was not the exact CaseRuntimeDO namespace');
  }
  const placement = oneBinding(settings, 'TDEV_CASE_PLACEMENT');
  if (placement.type !== 'd1' || placement.database_id !== D0046_CASE_PLACEMENT_DATABASE) {
    fail('d0046_case_owner_mismatch', 'Case Worker placement binding was not the exact D1 database');
  }
  const secret = oneBinding(settings, CASE_SECRET_BINDING);
  if (secret.type !== 'secret_text') fail('d0046_case_owner_mismatch', 'Case Worker qualification secret binding was absent');
  return true;
}

export function caseCapacity(settings) {
  const binding = oneBinding(settings, CASE_CAPACITY_BINDING);
  if (binding.type !== 'plain_text') fail('d0046_case_capacity_mismatch', 'Case Worker capacity binding was not plain_text');
  const value = canonicalCapacity(binding.text);
  if (value === null) fail('d0046_case_capacity_mismatch', 'Case Worker capacity binding was not a canonical positive integer');
  return value;
}

export function redactedBindings(settings) {
  return bindingsOf(settings).map((binding) => {
    if (binding.name === CASE_SECRET_BINDING || binding.type === 'secret_text') return { name: binding.name, type: 'secret_text' };
    return structuredClone(binding);
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function assertCaseCapacityPrecondition(settings, { allowTarget = true } = {}) {
  assertExactOwner(settings);
  const configuredBytes = caseCapacity(settings);
  if (configuredBytes === D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES && allowTarget) {
    return { state: 'already-correct', configuredBytes };
  }
  if (configuredBytes !== CASE_CAPACITY_FROM) {
    fail('d0046_case_capacity_precondition', 'Case Worker capacity changed outside the guarded correction range', {
      expectedBytes: CASE_CAPACITY_FROM,
      configuredBytes,
      requiredBytes: D0046_MIN_CASE_AUTHORITATIVE_BYTES,
    });
  }
  return { state: 'ready', configuredBytes };
}

export function buildCaseCapacityPatchSettings(settings, latestVersionId) {
  const precondition = assertCaseCapacityPrecondition(settings);
  if (precondition.state === 'already-correct') return null;
  const versionId = positiveVersionId(latestVersionId);
  return {
    bindings: bindingsOf(settings).map((binding) => {
      if (binding.name === CASE_CAPACITY_BINDING) {
        return { name: CASE_CAPACITY_BINDING, type: 'plain_text', text: String(D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES) };
      }
      if (binding.name === CASE_SECRET_BINDING) {
        return { name: CASE_SECRET_BINDING, type: 'inherit', version_id: versionId };
      }
      return structuredClone(binding);
    }),
  };
}

export function assertCaseCapacityReadback(settings, expectedBindings = undefined) {
  assertExactOwner(settings);
  const configuredBytes = caseCapacity(settings);
  if (configuredBytes !== D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES) {
    fail('d0046_case_capacity_readback', 'Case Worker capacity readback did not reach the qualified 16 MiB value', { configuredBytes });
  }
  if (expectedBindings !== undefined) {
    const actual = JSON.stringify(redactedBindings(settings));
    const expected = JSON.stringify(expectedBindings);
    if (actual !== expected) fail('d0046_case_bindings_readback', 'Case Worker binding readback changed more than the guarded capacity binding');
  }
  return { configuredBytes, bindings: redactedBindings(settings) };
}

function settingsPath(client, scriptName) {
  return client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/settings`);
}

async function readSettings(client, scriptName) {
  return (await client.request('GET', settingsPath(client, scriptName))).result;
}

async function latestDeployedVersionId(client) {
  const versions = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_CASE_SCRIPT)}/versions?per_page=100`));
  const items = versions.result?.items;
  if (!Array.isArray(items) || items.length === 0) fail('d0046_case_version_invalid', 'Case Worker version list was empty');
  const highestNumber = Math.max(...items.map((item) => Number(item?.number)));
  const matches = items.filter((item) => Number(item?.number) === highestNumber);
  if (matches.length !== 1) fail('d0046_case_version_invalid', 'Case Worker latest version was ambiguous');
  const versionId = positiveVersionId(matches[0].id);
  const deployments = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_CASE_SCRIPT)}/deployments`));
  const active = (deployments.result?.deployments ?? []).filter((deployment) => Array.isArray(deployment.versions) && deployment.versions.length === 1 && deployment.versions[0]?.version_id === versionId && deployment.versions[0]?.percentage === 100);
  if (active.length !== 1) fail('d0046_case_deployment_precondition', 'Case Worker latest version was not uniquely deployed at 100%', { versionId, activeDeployments: active.length });
  return versionId;
}

function patchForm(settings) {
  const form = new FormData();
  form.set('settings', new Blob([JSON.stringify(settings)], { type: 'application/json' }), 'settings.json');
  return form;
}

export async function correctCaseCapacity({ envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env' } = {}) {
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient({ ...credentials, apiOrigin: API_ORIGIN });
  const before = await readSettings(client, D0046_CASE_SCRIPT);
  const precondition = assertCaseCapacityPrecondition(before);
  if (precondition.state === 'already-correct') {
    const readback = assertCaseCapacityReadback(before, redactedBindings(before));
    return { status: 'already-correct', scriptName: D0046_CASE_SCRIPT, precondition, readback };
  }
  const latestVersionId = await latestDeployedVersionId(client);
  const patch = buildCaseCapacityPatchSettings(before, latestVersionId);
  const expectedBindings = redactedBindings({ bindings: patch.bindings });
  await client.request('PATCH', settingsPath(client, D0046_CASE_SCRIPT), { body: patchForm(patch) });
  const after = await readSettings(client, D0046_CASE_SCRIPT);
  const readback = assertCaseCapacityReadback(after, expectedBindings);
  return {
    status: 'corrected',
    scriptName: D0046_CASE_SCRIPT,
    precondition: { ...precondition, latestDeployedVersionId: latestVersionId },
    readback,
    secretValues: 'excluded',
  };
}

async function main() {
  const args = process.argv.slice(2);
  let envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--apply') {
      if (apply) fail('d0046_cli_invalid', '--apply was repeated');
      apply = true;
    } else if (args[index] === '--env-file') {
      if (index + 1 >= args.length || args[index + 1].startsWith('--')) fail('d0046_cli_invalid', '--env-file requires a path');
      envFile = args[++index];
    } else {
      fail('d0046_cli_invalid', `Unsupported argument: ${args[index]}`);
    }
  }
  if (!apply) fail('d0046_mutation_not_authorized', 'D0046 Case capacity correction requires --apply');
  const result = await correctCaseCapacity({ envFile });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0046_case_capacity_correction_failed', message: error?.message ?? String(error), details: error?.details ?? undefined }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
