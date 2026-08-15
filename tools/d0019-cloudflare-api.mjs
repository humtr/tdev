import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse } from '../src/canonical.mjs';
import { validateCasePlacement } from '../src/casedo-authority.mjs';

export const D0019_D1_DATABASE_NAME = 'tdev-d0019-placement';
export const D0019_QUALIFICATION_SCRIPTS = Object.freeze([
  'tdev-d0019-qualification-a',
  'tdev-d0019-qualification-b',
]);
export const D0019_CAPACITY_QUALIFICATION_SCRIPT = 'tdev-d0019-qualification-capacity';
const D0019_ALL_QUALIFICATION_SCRIPTS = new Set([
  ...D0019_QUALIFICATION_SCRIPTS,
  D0019_CAPACITY_QUALIFICATION_SCRIPT,
]);
export const D0019_WORKER_OWNERSHIP_TAG = 'tdev-d0019-qualification-v1';
export const D0019_WORKER_COMPATIBILITY_DATE = '2026-08-15';
export const D0019_WORKER_MAIN_MODULE = 'src/cloudflare-d0019-qualification.mjs';

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const MAX_API_RESPONSE_BYTES = 8 * 1024 * 1024;
const PLACEMENT_PROFILE = 'tdev.case-placement.d1.v1';
const PLACEMENT_SCHEMA_VERSION = 1;
const QUALIFICATION_SECRET_BINDING = 'TDEV_D0019_QUALIFICATION_TOKEN';
const EXPECTED_TABLES = Object.freeze([
  'tdev_case_placement_meta',
  'tdev_case_placements',
]);
const EXPECTED_COLUMNS = Object.freeze({
  tdev_case_placement_meta: [
    ['singleton', 'INTEGER', 0, 1],
    ['profile', 'TEXT', 1, 0],
    ['schema_version', 'INTEGER', 1, 0],
  ],
  tdev_case_placements: [
    ['case_id', 'TEXT', 1, 1],
    ['placement_generation', 'INTEGER', 1, 0],
    ['placement_digest', 'TEXT', 1, 0],
    ['placement_json', 'TEXT', 1, 0],
  ],
});
const MODULE_SPECIFIER_PATTERN = /(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;

export class CloudflareQualificationError extends Error {
  constructor(code, message, details = {}, options = undefined) {
    super(message, options);
    this.name = 'CloudflareQualificationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}, options = undefined) {
  throw new CloudflareQualificationError(code, message, details, options);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function assertAccountId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/i.test(value)) {
    fail('invalid_cloudflare_account_id', 'Cloudflare account ID must be a 32-digit hexadecimal identifier');
  }
  return value.toLowerCase();
}

function assertApiToken(value) {
  if (typeof value !== 'string' || value.length < 20 || value.includes('\0')) {
    fail('invalid_cloudflare_api_token', 'Cloudflare API token is missing or malformed');
  }
  return value;
}

function assertScriptName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    fail('invalid_cloudflare_script_name', 'Cloudflare Worker script name is invalid');
  }
  return value;
}

function assertJurisdiction(value) {
  if (!['global', 'eu', 'us', 'fedramp'].includes(value)) {
    fail('invalid_cloudflare_jurisdiction', 'Qualification jurisdiction must be global, eu, us, or fedramp');
  }
  return value;
}

function assertPositiveSafeInteger(value, label) {
  const parsed = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail('invalid_qualification_integer', `${label} must be a positive safe integer`);
  return parsed;
}

function assertWriterCompatibilityId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    fail('invalid_writer_compatibility_id', 'Writer compatibility ID is invalid');
  }
  return value;
}

function assertQualificationScripts(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > D0019_ALL_QUALIFICATION_SCRIPTS.size) {
    fail('invalid_qualification_scripts', 'Qualification script selection is invalid');
  }
  const scripts = values.map(assertScriptName);
  if (new Set(scripts).size !== scripts.length || scripts.some((script) => !D0019_ALL_QUALIFICATION_SCRIPTS.has(script))) {
    fail('invalid_qualification_scripts', 'Qualification script selection is duplicated or outside the fixed allowlist');
  }
  return scripts;
}

function unquoteEnvValue(value, lineNumber) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (cause) {
      fail('invalid_cloudflare_env_file', `Invalid double-quoted value on line ${lineNumber}`, {}, { cause });
    }
  }
  if (/\s/.test(value)) fail('invalid_cloudflare_env_file', `Unquoted whitespace is not allowed on line ${lineNumber}`);
  return value;
}

export function parseCloudflareEnv(text) {
  if (typeof text !== 'string') fail('invalid_cloudflare_env_file', 'Cloudflare environment file must be text');
  const values = Object.create(null);
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) fail('invalid_cloudflare_env_file', `Malformed environment assignment on line ${lineNumber}`);
    if (Object.hasOwn(values, match[1])) fail('invalid_cloudflare_env_file', `Duplicate environment key on line ${lineNumber}`);
    values[match[1]] = unquoteEnvValue(match[2], lineNumber);
  }
  return values;
}

export function loadCloudflareCredentials(envFile) {
  const stat = fs.statSync(envFile);
  if (!stat.isFile()) fail('invalid_cloudflare_env_file', 'Cloudflare environment path is not a regular file');
  if ((stat.mode & 0o077) !== 0) fail('insecure_cloudflare_env_file', 'Cloudflare environment file must not be group/world accessible');
  const values = parseCloudflareEnv(fs.readFileSync(envFile, 'utf8'));
  return Object.freeze({
    accountId: assertAccountId(values.CLOUDFLARE_ACCOUNT_ID),
    apiToken: assertApiToken(values.CLOUDFLARE_API_TOKEN),
  });
}

function responseErrors(envelope) {
  if (!Array.isArray(envelope?.errors)) return [];
  return envelope.errors.slice(0, 8).map((error) => ({
    code: typeof error?.code === 'number' || typeof error?.code === 'string' ? error.code : 'unknown',
    message: typeof error?.message === 'string' ? error.message.slice(0, 512) : 'Cloudflare API error',
  }));
}

async function readBoundedResponseBytes(response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_API_RESPONSE_BYTES) {
    fail('cloudflare_api_response_too_large', 'Cloudflare API response exceeded its local bound');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_API_RESPONSE_BYTES) {
      await reader.cancel();
      fail('cloudflare_api_response_too_large', 'Cloudflare API response exceeded its local bound');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class CloudflareApiClient {
  constructor({ accountId, apiToken, fetchImpl = globalThis.fetch, apiOrigin = API_ORIGIN }) {
    this.accountId = assertAccountId(accountId);
    this.apiToken = assertApiToken(apiToken);
    if (typeof fetchImpl !== 'function') fail('invalid_cloudflare_fetch', 'Cloudflare API client requires fetch');
    if (apiOrigin !== API_ORIGIN) {
      fail('invalid_cloudflare_api_origin', 'Cloudflare credentials may only be sent to the official API origin');
    }
    this.fetchImpl = fetchImpl;
    this.apiOrigin = API_ORIGIN;
  }

  accountPath(suffix = '') {
    if (typeof suffix !== 'string' || (suffix !== '' && !suffix.startsWith('/'))) {
      fail('invalid_cloudflare_api_path', 'Cloudflare account API suffix must be empty or start with /');
    }
    return `/accounts/${encodeURIComponent(this.accountId)}${suffix}`;
  }

  async request(method, apiPath, { json, body, allowNotFound = false, timeoutMs = 60_000 } = {}) {
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/') || apiPath.includes('://')) {
      fail('invalid_cloudflare_api_path', 'Cloudflare API path must be an origin-relative path');
    }
    if (json !== undefined && body !== undefined) fail('invalid_cloudflare_request', 'Cloudflare API request cannot contain both json and body');
    const headers = { authorization: `Bearer ${this.apiToken}` };
    let requestBody = body;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      requestBody = JSON.stringify(json);
    }

    let response;
    try {
      response = await this.fetchImpl(`${this.apiOrigin}${apiPath}`, {
        method,
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new CloudflareQualificationError(
        'cloudflare_api_unavailable',
        'Cloudflare API request failed before a response could be trusted',
        { method, apiPath },
        { cause },
      );
    }

    let bytes;
    try {
      bytes = await readBoundedResponseBytes(response);
    } catch (cause) {
      if (cause instanceof CloudflareQualificationError) {
        cause.details = { ...cause.details, method, apiPath };
      }
      throw cause;
    }
    let envelope;
    try {
      envelope = JSON.parse(new TextDecoder().decode(bytes));
    } catch (cause) {
      throw new CloudflareQualificationError(
        'invalid_cloudflare_api_response',
        'Cloudflare API response was not JSON',
        { method, apiPath, status: response.status },
        { cause },
      );
    }
    if (allowNotFound && response.status === 404) return { found: false, status: 404, result: null, resultInfo: null };
    if (!response.ok || envelope?.success !== true) {
      fail('cloudflare_api_rejected', 'Cloudflare API rejected the request', {
        method,
        apiPath,
        status: response.status,
        errors: responseErrors(envelope),
      });
    }
    return {
      found: true,
      status: response.status,
      result: envelope.result,
      resultInfo: envelope.result_info ?? null,
    };
  }
}

async function listResult(client, apiPath) {
  const response = await client.request('GET', apiPath);
  if (!Array.isArray(response.result)) fail('invalid_cloudflare_api_response', 'Cloudflare list response did not contain an array', { apiPath });
  const totalPages = Number(response.resultInfo?.total_pages ?? 1);
  const totalCount = Number(response.resultInfo?.total_count ?? response.result.length);
  if (!Number.isSafeInteger(totalPages) || totalPages < 1 || !Number.isSafeInteger(totalCount) || totalCount < response.result.length ||
      totalPages > 1 || totalCount > response.result.length) {
    fail('cloudflare_list_incomplete', 'Cloudflare list response was paginated or internally inconsistent', {
      returned: response.result.length,
      totalPages: Number.isSafeInteger(totalPages) ? totalPages : null,
      totalCount: Number.isSafeInteger(totalCount) ? totalCount : null,
    });
  }
  return response.result;
}

export async function discoverCloudflareAccount(client) {
  const encodedAccount = encodeURIComponent(client.accountId);
  const [token, account, databases, namespaces, scripts, workerSettings, workerSubdomain] = await Promise.all([
    client.request('GET', `/accounts/${encodedAccount}/tokens/verify`),
    client.request('GET', `/accounts/${encodedAccount}`),
    listResult(client, client.accountPath('/d1/database?per_page=1000')),
    listResult(client, client.accountPath('/workers/durable_objects/namespaces?per_page=1000')),
    listResult(client, client.accountPath('/workers/scripts')),
    client.request('GET', client.accountPath('/workers/account-settings')),
    client.request('GET', client.accountPath('/workers/subdomain')),
  ]);
  if (token.result?.status !== 'active') fail('cloudflare_token_inactive', 'Cloudflare account token is not active');
  if (account.result?.id !== client.accountId) fail('cloudflare_account_mismatch', 'Cloudflare account response did not match configured account');
  return Object.freeze({
    accountIdDigest: sha256(client.accountId),
    accountType: account.result?.type ?? null,
    tokenStatus: token.result.status,
    databases,
    namespaces,
    scripts,
    workerSettings: workerSettings.result,
    workerSubdomain: workerSubdomain.result?.subdomain ?? null,
  });
}

function normalizedJurisdiction(value) {
  return value === null || value === undefined || value === '' ? 'global' : value;
}

function matchingNamedResources(resources, name) {
  return resources.filter((resource) => resource?.name === name);
}

async function waitForD1Database(client, expectedJurisdiction) {
  let lastCount = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const databases = await listResult(client, client.accountPath(`/d1/database?name=${encodeURIComponent(D0019_D1_DATABASE_NAME)}&per_page=100`));
    const matches = matchingNamedResources(databases, D0019_D1_DATABASE_NAME);
    lastCount = matches.length;
    if (matches.length > 1) fail('ambiguous_d1_resource', 'Multiple D1 databases use the qualification name');
    if (matches.length === 1) {
      const actualJurisdiction = normalizedJurisdiction(matches[0].jurisdiction);
      if (actualJurisdiction !== expectedJurisdiction) {
        fail('d1_jurisdiction_conflict', 'Existing D1 database jurisdiction does not match qualification configuration', {
          expected: expectedJurisdiction,
          actual: actualJurisdiction,
        });
      }
      return matches[0];
    }
    if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail('d1_creation_unverified', 'D1 database creation was not visible after bounded readback', { matches: lastCount });
}

export async function ensureD1Database(client, discovery, { jurisdiction, allowCreate }) {
  const expectedJurisdiction = assertJurisdiction(jurisdiction);
  let matches = matchingNamedResources(discovery.databases, D0019_D1_DATABASE_NAME);
  if (matches.length > 1) fail('ambiguous_d1_resource', 'Multiple D1 databases use the qualification name');
  if (matches.length === 0) {
    if (!allowCreate) fail('missing_d1_resource', 'D0019 qualification D1 database does not exist');
    const body = { name: D0019_D1_DATABASE_NAME };
    if (expectedJurisdiction !== 'global') body.jurisdiction = expectedJurisdiction;
    let createError = null;
    try {
      await client.request('POST', client.accountPath('/d1/database'), { json: body });
    } catch (cause) {
      createError = cause;
    }
    try {
      matches = [await waitForD1Database(client, expectedJurisdiction)];
    } catch (readbackError) {
      if (createError) throw createError;
      throw readbackError;
    }
  }
  if (matches.length !== 1) fail('d1_creation_unverified', 'D1 database creation did not produce one exact named resource');
  const database = matches[0];
  if (normalizedJurisdiction(database.jurisdiction) !== expectedJurisdiction) {
    fail('d1_jurisdiction_conflict', 'Existing D1 database jurisdiction does not match qualification configuration', {
      expected: expectedJurisdiction,
      actual: normalizedJurisdiction(database.jurisdiction),
    });
  }
  if (typeof database.uuid !== 'string' || database.uuid.length === 0) fail('invalid_d1_resource', 'D1 database has no stable UUID');
  return database;
}

async function d1Query(client, databaseId, sql, params = []) {
  const response = await client.request('POST', client.accountPath(`/d1/database/${encodeURIComponent(databaseId)}/query`), {
    json: { sql, params },
  });
  if (!Array.isArray(response.result) || response.result.length === 0 || response.result.some((item) => item?.success !== true)) {
    fail('invalid_d1_query_response', 'D1 query did not return successful statement results');
  }
  return response.result;
}

function rowsFromSingleQuery(results, label) {
  if (results.length !== 1 || !Array.isArray(results[0].results)) fail('invalid_d1_query_response', `${label} did not return one row set`);
  return results[0].results;
}

function assertColumns(rows, table) {
  const actual = rows.map((row) => [
    row?.name,
    typeof row?.type === 'string' ? row.type.toUpperCase() : row?.type,
    Number(row?.notnull),
    Number(row?.pk),
  ]);
  const expected = EXPECTED_COLUMNS[table];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('incompatible_d1_schema', `D1 table ${table} columns do not match schema version 1`, { actual, expected });
  }
}

function assertTableConstraints(tableRows) {
  const sqlByName = new Map(tableRows.map((row) => [row?.name, typeof row?.sql === 'string' ? row.sql : '']));
  const metaSql = sqlByName.get('tdev_case_placement_meta') ?? '';
  const placementSql = sqlByName.get('tdev_case_placements') ?? '';
  const requiredMetaChecks = [
    /CHECK\s*\(\s*singleton\s*=\s*1\s*\)/i,
    /CHECK\s*\(\s*profile\s*=\s*'tdev\.case-placement\.d1\.v1'\s*\)/i,
    /CHECK\s*\(\s*schema_version\s*=\s*1\s*\)/i,
  ];
  if (requiredMetaChecks.some((pattern) => !pattern.test(metaSql)) ||
      !/CHECK\s*\(\s*placement_generation\s*>\s*0\s*\)/i.test(placementSql)) {
    fail('incompatible_d1_schema', 'D1 placement schema constraints do not match schema version 1');
  }
}

export async function inspectD1PlacementSchema(client, databaseId) {
  const tableRows = rowsFromSingleQuery(await d1Query(
    client,
    databaseId,
    `SELECT name, type, sql FROM sqlite_schema
       WHERE type = 'table' AND name IN ('tdev_case_placement_meta', 'tdev_case_placements')
       ORDER BY name ASC`,
  ), 'D1 placement table lookup');
  const names = tableRows.map((row) => row?.name);
  if (names.length === 0) return Object.freeze({ status: 'absent', profile: null, schemaVersion: null, placementRows: null });
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TABLES)) {
    fail('incompatible_d1_schema', 'D1 placement schema is partial or ambiguous', { names });
  }
  assertTableConstraints(tableRows);
  const metaRows = rowsFromSingleQuery(await d1Query(
    client,
    databaseId,
    'SELECT singleton, profile, schema_version FROM tdev_case_placement_meta ORDER BY singleton ASC',
  ), 'D1 placement metadata lookup');
  if (metaRows.length !== 1 || Number(metaRows[0]?.singleton) !== 1 || metaRows[0]?.profile !== PLACEMENT_PROFILE || Number(metaRows[0]?.schema_version) !== PLACEMENT_SCHEMA_VERSION) {
    fail('incompatible_d1_schema', 'D1 placement metadata does not match the required profile');
  }
  for (const table of EXPECTED_TABLES) {
    const columns = rowsFromSingleQuery(await d1Query(client, databaseId, `PRAGMA table_info('${table}')`), `${table} column lookup`);
    assertColumns(columns, table);
  }
  const countRows = rowsFromSingleQuery(await d1Query(client, databaseId, 'SELECT COUNT(*) AS count FROM tdev_case_placements'), 'D1 placement row count');
  const placementRows = Number(countRows[0]?.count);
  if (!Number.isSafeInteger(placementRows) || placementRows < 0) fail('invalid_d1_query_response', 'D1 placement row count is invalid');
  return Object.freeze({
    status: 'compatible',
    profile: PLACEMENT_PROFILE,
    schemaVersion: PLACEMENT_SCHEMA_VERSION,
    placementRows,
  });
}

export async function ensureD1PlacementSchema(client, databaseId, migrationSql) {
  const before = await inspectD1PlacementSchema(client, databaseId);
  if (before.status === 'compatible') return Object.freeze({ ...before, applied: false, reconciledAfterError: false });
  if (typeof migrationSql !== 'string' || migrationSql.length === 0) fail('invalid_d1_migration', 'D1 migration SQL is empty');
  let migrationError = null;
  try {
    await d1Query(client, databaseId, migrationSql);
  } catch (cause) {
    migrationError = cause;
  }
  let after;
  try {
    after = await inspectD1PlacementSchema(client, databaseId);
  } catch (cause) {
    if (migrationError) throw migrationError;
    throw cause;
  }
  if (after.status !== 'compatible') {
    if (migrationError) throw migrationError;
    fail('d1_migration_unverified', 'D1 migration returned without a compatible schema');
  }
  return Object.freeze({ ...after, applied: migrationError === null, reconciledAfterError: migrationError !== null });
}

export async function readD1PlacementRecord(client, databaseId, caseId) {
  if (typeof caseId !== 'string' || caseId.length === 0 || caseId.length > 512 || caseId.includes('\0')) {
    fail('invalid_qualification_case_id', 'D1 placement readback CaseId is invalid');
  }
  const rows = rowsFromSingleQuery(await d1Query(
    client,
    databaseId,
    `SELECT case_id, placement_generation, placement_digest, placement_json
       FROM tdev_case_placements WHERE case_id = ?`,
    [caseId],
  ), 'D1 exact placement readback');
  if (rows.length === 0) return null;
  if (rows.length !== 1) fail('placement_readback_ambiguous', 'D1 placement readback returned multiple rows');
  const row = rows[0];
  let placement;
  try {
    placement = validateCasePlacement(strictJsonParse(new TextEncoder().encode(row?.placement_json), { maxBytes: 64 * 1024 }));
  } catch (cause) {
    throw new CloudflareQualificationError('placement_readback_corrupt', 'D1 placement readback was invalid', {}, { cause });
  }
  if (row.case_id !== caseId || Number(row.placement_generation) !== placement.placementGeneration ||
      row.placement_digest !== placement.placementDigest || canonicalJson(placement) !== row.placement_json) {
    fail('placement_readback_corrupt', 'D1 placement readback fields did not match canonical placement bytes');
  }
  return placement;
}

function relativeModuleSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(MODULE_SPECIFIER_PATTERN)) specifiers.push(match[1]);
  return specifiers;
}

export function collectWorkerModules(repositoryRoot, mainModule = D0019_WORKER_MAIN_MODULE) {
  const root = path.resolve(repositoryRoot);
  const pending = [mainModule];
  const modules = new Map();
  while (pending.length > 0) {
    const moduleName = pending.pop();
    if (modules.has(moduleName)) continue;
    if (!moduleName.endsWith('.mjs') || path.isAbsolute(moduleName)) fail('invalid_worker_module', `Worker module path is invalid: ${moduleName}`);
    const absolute = path.resolve(root, moduleName);
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('worker_module_escape', `Worker module escapes repository: ${moduleName}`);
    const source = fs.readFileSync(absolute, 'utf8');
    modules.set(moduleName.split(path.sep).join('/'), source);
    for (const specifier of relativeModuleSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(moduleName), specifier));
        pending.push(dependency);
      } else if (!specifier.startsWith('node:') && specifier !== 'cloudflare:workers') {
        fail('unsupported_worker_dependency', `Worker module uses unsupported bare dependency: ${specifier}`);
      }
    }
  }
  return new Map([...modules.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function workerModuleDigest(modules) {
  const hash = createHash('sha256');
  for (const [name, source] of modules) hash.update(name).update('\0').update(source).update('\0');
  return `sha256:${hash.digest('hex')}`;
}

function plainTextBinding(name, text) {
  return { type: 'plain_text', name, text: String(text) };
}

export function buildQualificationWorkerMetadata({
  scriptName,
  databaseId,
  namespaceId,
  jurisdiction,
  maxAuthoritativeBytesPerCase,
  writerCompatibilityId,
  sourceSha,
}) {
  const script = assertScriptName(scriptName);
  const providerJurisdiction = assertJurisdiction(jurisdiction);
  const maxBytes = assertPositiveSafeInteger(maxAuthoritativeBytesPerCase, 'maxAuthoritativeBytesPerCase');
  const writer = assertWriterCompatibilityId(writerCompatibilityId);
  if (typeof databaseId !== 'string' || databaseId.length === 0) fail('invalid_d1_resource', 'D1 database ID is required for Worker metadata');
  if (typeof namespaceId !== 'string' || namespaceId.length === 0) fail('invalid_do_namespace', 'Durable Object namespace ID is required for Worker metadata');
  if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceSha)) fail('invalid_source_sha', 'Worker deployment requires an exact 40-digit source SHA');
  return {
    main_module: D0019_WORKER_MAIN_MODULE,
    compatibility_date: D0019_WORKER_COMPATIBILITY_DATE,
    compatibility_flags: ['nodejs_compat'],
    annotations: {
      'workers/message': `D0019 qualification ${sourceSha.toLowerCase()}`,
      'workers/tag': D0019_WORKER_OWNERSHIP_TAG,
    },
    bindings: [
      { type: 'd1', name: 'TDEV_CASE_PLACEMENT', database_id: databaseId },
      { type: 'durable_object_namespace', name: 'TDEV_CASE_AUTHORITY', class_name: 'CaseRuntimeDO' },
      { type: 'version_metadata', name: 'TDEV_WORKER_VERSION' },
      plainTextBinding('TDEV_D0019_QUALIFICATION_MODE', 'enabled'),
      plainTextBinding('TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', maxBytes),
      plainTextBinding('TDEV_CASEDO_WRITER_COMPATIBILITY_ID', writer),
      plainTextBinding('TDEV_DEPLOYMENT', script),
      plainTextBinding('TDEV_ENVIRONMENT', 'qualification'),
      plainTextBinding('TDEV_WORKER_SCRIPT', script),
      plainTextBinding('TDEV_CASEDO_NAMESPACE', namespaceId),
      plainTextBinding('TDEV_CASEDO_JURISDICTION', providerJurisdiction),
      plainTextBinding('TDEV_SOURCE_SHA', sourceSha.toLowerCase()),
    ],
    exports: {
      CaseRuntimeDO: { type: 'durable-object', storage: 'sqlite' },
    },
  };
}

export function createWorkerUploadForm(metadata, modules) {
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  for (const [name, source] of modules) {
    form.set(name, new Blob([source], { type: 'application/javascript+module' }), name);
  }
  return form;
}

function bindingByName(readback, name) {
  const bindings = readback?.version?.resources?.bindings ?? readback?.settings?.bindings ?? readback?.bindings;
  return Array.isArray(bindings) ? bindings.find((binding) => binding?.name === name) : undefined;
}

function runtimeSettings(readback) {
  return readback?.version?.resources?.script_runtime ??
    readback?.settings?.script_runtime ??
    readback?.script_runtime ??
    readback?.settings ??
    readback;
}

function workerAnnotations(readback) {
  return readback?.version?.annotations ?? readback?.settings?.annotations ?? readback?.annotations ?? {};
}

function assertWorkerOwned(readback, scriptName) {
  const runtime = runtimeSettings(readback);
  const markerBindings = [
    ['TDEV_D0019_QUALIFICATION_MODE', 'enabled'],
    ['TDEV_DEPLOYMENT', scriptName],
    ['TDEV_ENVIRONMENT', 'qualification'],
    ['TDEV_WORKER_SCRIPT', scriptName],
  ];
  for (const [name, value] of markerBindings) {
    const binding = bindingByName(readback, name);
    if (binding?.type !== 'plain_text' || binding?.text !== value) {
      fail('worker_ownership_conflict', `Worker ${scriptName} does not carry the exact D0019 qualification ownership markers`);
    }
  }
  const source = bindingByName(readback, 'TDEV_SOURCE_SHA');
  const d1 = bindingByName(readback, 'TDEV_CASE_PLACEMENT');
  const durableObject = bindingByName(readback, 'TDEV_CASE_AUTHORITY');
  if (source?.type !== 'plain_text' || !/^[0-9a-f]{40}$/.test(source?.text ?? '') ||
      d1?.type !== 'd1' || durableObject?.type !== 'durable_object_namespace' || durableObject?.class_name !== 'CaseRuntimeDO') {
    fail('worker_ownership_conflict', `Worker ${scriptName} does not carry the exact D0019 qualification ownership bindings`);
  }
  const tag = workerAnnotations(readback)?.['workers/tag'];
  if (tag !== undefined && tag !== D0019_WORKER_OWNERSHIP_TAG) {
    fail('worker_ownership_conflict', `Worker ${scriptName} carries a conflicting Worker ownership tag`);
  }
  const exported = runtime?.exports?.CaseRuntimeDO;
  if (exported?.type !== 'durable-object' || exported?.storage !== 'sqlite') {
    fail('worker_ownership_conflict', `Worker ${scriptName} does not own the expected SQLite CaseRuntimeDO export`);
  }
}

export function assertQualificationWorkerSettings(settings, expected) {
  assertWorkerOwned(settings, expected.scriptName);
  const runtime = runtimeSettings(settings);
  if (runtime.compatibility_date !== D0019_WORKER_COMPATIBILITY_DATE || !runtime.compatibility_flags?.includes('nodejs_compat')) {
    fail('worker_settings_mismatch', `Worker ${expected.scriptName} runtime compatibility does not match qualification profile`);
  }
  const required = new Map([
    ['TDEV_CASE_PLACEMENT', ['d1', 'database_id', expected.databaseId]],
    ['TDEV_CASE_AUTHORITY', ['durable_object_namespace', null, null]],
    ['TDEV_WORKER_VERSION', ['version_metadata', null, null]],
    ['TDEV_D0019_QUALIFICATION_MODE', ['plain_text', 'text', 'enabled']],
    ['TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', ['plain_text', 'text', String(expected.maxAuthoritativeBytesPerCase)]],
    ['TDEV_CASEDO_WRITER_COMPATIBILITY_ID', ['plain_text', 'text', expected.writerCompatibilityId]],
    ['TDEV_DEPLOYMENT', ['plain_text', 'text', expected.scriptName]],
    ['TDEV_ENVIRONMENT', ['plain_text', 'text', 'qualification']],
    ['TDEV_WORKER_SCRIPT', ['plain_text', 'text', expected.scriptName]],
    ['TDEV_CASEDO_NAMESPACE', ['plain_text', 'text', expected.namespaceId]],
    ['TDEV_CASEDO_JURISDICTION', ['plain_text', 'text', expected.jurisdiction]],
    ['TDEV_SOURCE_SHA', ['plain_text', 'text', expected.sourceSha]],
  ]);
  for (const [name, [type, field, value]] of required) {
    const binding = bindingByName(settings, name);
    if (binding?.type !== type || (field !== null && binding?.[field] !== value)) {
      fail('worker_settings_mismatch', `Worker ${expected.scriptName} binding ${name} does not match qualification profile`);
    }
  }
  const durableObjectBinding = bindingByName(settings, 'TDEV_CASE_AUTHORITY');
  if (durableObjectBinding?.class_name !== 'CaseRuntimeDO' || durableObjectBinding?.namespace_id !== expected.namespaceId) {
    fail('worker_settings_mismatch', `Worker ${expected.scriptName} Durable Object binding does not resolve to its exact namespace`);
  }
  const secret = bindingByName(settings, QUALIFICATION_SECRET_BINDING);
  if (secret?.type !== 'secret_text') fail('worker_settings_mismatch', `Worker ${expected.scriptName} qualification secret is absent`);
  return true;
}

async function latestWorkerVersion(client, scriptName) {
  const response = await client.request(
    'GET',
    client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/versions?per_page=100`),
  );
  const items = response.result?.items;
  if (!Array.isArray(items) || items.length === 0 || items.some((item) =>
    typeof item?.id !== 'string' || item.id.length === 0 || !Number.isSafeInteger(item?.number) || item.number < 1)) {
    fail('worker_version_unverified', `Worker ${scriptName} version list was invalid`);
  }
  const totalCount = Number(response.resultInfo?.total_count ?? items.length);
  if (!Number.isSafeInteger(totalCount) || totalCount !== items.length) {
    fail('worker_version_unverified', `Worker ${scriptName} version list was incomplete`, {
      returned: items.length,
      totalCount: Number.isSafeInteger(totalCount) ? totalCount : null,
    });
  }
  const highestNumber = Math.max(...items.map((item) => item.number));
  const matches = items.filter((item) => item.number === highestNumber);
  if (matches.length !== 1) fail('worker_version_unverified', `Worker ${scriptName} latest version was ambiguous`);
  const detail = await client.request(
    'GET',
    client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/versions/${encodeURIComponent(matches[0].id)}`),
  );
  if (detail.result?.id !== matches[0].id || detail.result?.number !== highestNumber) {
    fail('worker_version_unverified', `Worker ${scriptName} latest version detail did not match its list entry`);
  }
  return detail.result;
}

async function workerSettings(client, scriptName, { allowNotFound = false } = {}) {
  const settings = await client.request(
    'GET',
    client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/settings`),
    { allowNotFound },
  );
  if (!settings.found) return settings;
  return { ...settings, result: { settings: settings.result, version: await latestWorkerVersion(client, scriptName) } };
}

async function setWorkerSubdomain(client, scriptName, enabled) {
  const response = await client.request('POST', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`), {
    json: { enabled, previews_enabled: false },
  });
  if (response.result?.enabled !== enabled) fail('worker_subdomain_mismatch', `Worker ${scriptName} subdomain state did not match request`);
  return response.result;
}

export async function setD0019QualificationSubdomains(client, { scriptNames = D0019_QUALIFICATION_SCRIPTS, enabled }) {
  const scripts = assertQualificationScripts(scriptNames);
  if (typeof enabled !== 'boolean') fail('invalid_subdomain_state', 'Qualification subdomain state must be boolean');
  const outcomes = [];
  const failures = [];
  for (const scriptName of scripts) {
    try {
      const settings = await workerSettings(client, scriptName);
      assertWorkerOwned(settings.result, scriptName);
      await setWorkerSubdomain(client, scriptName, enabled);
      outcomes.push({ scriptName, enabled });
    } catch (error) {
      failures.push({ scriptName, code: error?.code ?? 'subdomain_state_failed' });
    }
  }
  const safetyClosureFailures = [];
  if (failures.length !== 0 && enabled) {
    for (const scriptName of scripts) {
      try {
        const settings = await workerSettings(client, scriptName, { allowNotFound: true });
        if (settings.found) {
          assertWorkerOwned(settings.result, scriptName);
          await setWorkerSubdomain(client, scriptName, false);
        }
      } catch (error) {
        safetyClosureFailures.push({ scriptName, code: error?.code ?? 'subdomain_disable_failed' });
      }
    }
  }
  if (failures.length !== 0) {
    fail('qualification_subdomain_state_failed', 'Qualification subdomain state could not be established for every selected Worker', {
      failures,
      safetyClosureFailures,
    });
  }
  return outcomes;
}

export function qualificationWorkerOrigin(scriptName, workerSubdomain) {
  const script = assertScriptName(scriptName);
  if (typeof workerSubdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workerSubdomain)) {
    fail('invalid_workers_subdomain', 'Cloudflare Workers subdomain is invalid');
  }
  return `https://${script}.${workerSubdomain}.workers.dev`;
}

async function uploadWorker(client, scriptName, metadata, modules) {
  const response = await client.request('PUT', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}`), {
    body: createWorkerUploadForm(metadata, modules),
    timeoutMs: 120_000,
  });
  return response.result;
}

async function setWorkerSecret(client, scriptName, token) {
  await client.request('PUT', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/secrets`), {
    json: { name: QUALIFICATION_SECRET_BINDING, text: token, type: 'secret_text' },
  });
}

async function readNamespaces(client) {
  return listResult(client, client.accountPath('/workers/durable_objects/namespaces?per_page=1000'));
}

function exactWorkerNamespace(namespaces, scriptName) {
  const matches = namespaces.filter((namespace) => namespace?.script === scriptName && namespace?.class === 'CaseRuntimeDO');
  if (matches.length !== 1) fail('do_namespace_unverified', `Worker ${scriptName} does not have exactly one CaseRuntimeDO namespace`, { matches: matches.length });
  if (matches[0].use_sqlite !== true || typeof matches[0].id !== 'string' || matches[0].id.length === 0) {
    fail('do_namespace_unverified', `Worker ${scriptName} namespace is not a stable SQLite namespace`);
  }
  return matches[0];
}

async function waitForNamespace(client, scriptName) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return exactWorkerNamespace(await readNamespaces(client), scriptName);
    } catch (cause) {
      lastError = cause;
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function waitForWorkerReadback(client, scriptName, expected) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const readback = await workerSettings(client, scriptName);
      assertQualificationWorkerSettings(readback.result, expected);
      return readback;
    } catch (cause) {
      lastError = cause;
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function provisionWorker(client, modules, config, qualificationToken, allowCreate, enableSubdomain) {
  const existing = await workerSettings(client, config.scriptName, { allowNotFound: true });
  if (!existing.found && !allowCreate) fail('missing_worker_resource', `Worker ${config.scriptName} does not exist`);
  if (existing.found) assertWorkerOwned(existing.result, config.scriptName);

  let namespace;
  const knownNamespaces = await readNamespaces(client);
  const matches = knownNamespaces.filter((item) => item?.script === config.scriptName && item?.class === 'CaseRuntimeDO');
  if (matches.length > 1) fail('do_namespace_unverified', `Worker ${config.scriptName} has ambiguous CaseRuntimeDO namespaces`);
  if (matches.length === 1) namespace = exactWorkerNamespace(knownNamespaces, config.scriptName);
  if (!namespace) {
    const bootstrapMetadata = buildQualificationWorkerMetadata({
      ...config,
      namespaceId: `pending-${config.scriptName}`,
    });
    await uploadWorker(client, config.scriptName, bootstrapMetadata, modules);
    await setWorkerSubdomain(client, config.scriptName, false);
    namespace = await waitForNamespace(client, config.scriptName);
  }

  const finalConfig = { ...config, namespaceId: namespace.id };
  const metadata = buildQualificationWorkerMetadata(finalConfig);
  await uploadWorker(client, config.scriptName, metadata, modules);
  await setWorkerSecret(client, config.scriptName, qualificationToken);
  await setWorkerSubdomain(client, config.scriptName, enableSubdomain);
  await waitForWorkerReadback(client, config.scriptName, finalConfig);
  return Object.freeze({
    scriptName: config.scriptName,
    namespaceId: namespace.id,
    moduleDigest: workerModuleDigest(modules),
    subdomainEnabled: enableSubdomain,
  });
}

export async function provisionD0019QualificationResources({
  client,
  repositoryRoot,
  discovery,
  jurisdiction,
  maxAuthoritativeBytesPerCase,
  writerCompatibilityId,
  sourceSha,
  qualificationToken,
  allowCreate = false,
  enableSubdomain = false,
  scriptNames = D0019_QUALIFICATION_SCRIPTS,
}) {
  const providerJurisdiction = assertJurisdiction(jurisdiction);
  const maxBytes = assertPositiveSafeInteger(maxAuthoritativeBytesPerCase, 'maxAuthoritativeBytesPerCase');
  const writer = assertWriterCompatibilityId(writerCompatibilityId);
  const scripts = assertQualificationScripts(scriptNames);
  const qualificationTokenBytes = typeof qualificationToken === 'string'
    ? new TextEncoder().encode(qualificationToken).byteLength
    : 0;
  if (typeof qualificationToken !== 'string' || qualificationToken.includes('\0') ||
      qualificationTokenBytes < 32 || qualificationTokenBytes > 512) {
    fail('invalid_qualification_token', 'Ephemeral qualification token is invalid');
  }
  const database = await ensureD1Database(client, discovery, { jurisdiction: providerJurisdiction, allowCreate });
  const migrationSql = fs.readFileSync(path.join(repositoryRoot, 'cloudflare/d1/migrations/0001-case-placement.sql'), 'utf8');
  const schema = await ensureD1PlacementSchema(client, database.uuid, migrationSql);
  const modules = collectWorkerModules(repositoryRoot);
  const workers = [];
  try {
    for (const scriptName of scripts) {
      workers.push(await provisionWorker(client, modules, {
        scriptName,
        databaseId: database.uuid,
        jurisdiction: providerJurisdiction,
        maxAuthoritativeBytesPerCase: maxBytes,
        writerCompatibilityId: writer,
        sourceSha,
      }, qualificationToken, allowCreate, enableSubdomain));
    }
  } catch (cause) {
    const safetyClosureFailures = [];
    for (const scriptName of scripts) {
      try {
        const settings = await workerSettings(client, scriptName, { allowNotFound: true });
        if (settings.found) {
          assertWorkerOwned(settings.result, scriptName);
          await setWorkerSubdomain(client, scriptName, false);
        }
      } catch (closureError) {
        safetyClosureFailures.push({ scriptName, code: closureError?.code ?? 'subdomain_disable_failed' });
      }
    }
    throw new CloudflareQualificationError(
      'qualification_provision_failed',
      'D0019 qualification provisioning failed',
      {
        causeCode: cause?.code ?? 'unknown',
        safetyClosureFailures,
      },
      { cause },
    );
  }
  return Object.freeze({
    database: { name: database.name, uuid: database.uuid, jurisdiction: normalizedJurisdiction(database.jurisdiction) },
    schema,
    workers,
    qualificationTokenConfigured: true,
  });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = Object.create(null);
  const flags = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--apply') {
      if (flags.has(arg)) fail('invalid_cli_arguments', `Duplicate CLI flag: ${arg}`);
      flags.add(arg);
      continue;
    }
    if (!arg.startsWith('--') || index + 1 >= rest.length) fail('invalid_cli_arguments', `Invalid CLI argument: ${arg}`);
    const name = arg.slice(2);
    if (Object.hasOwn(values, name)) fail('invalid_cli_arguments', `Duplicate CLI option: ${arg}`);
    values[name] = rest[index + 1];
    index += 1;
  }
  return { command, values, flags };
}

function assertCliShape(command, values, flags) {
  const allowed = command === 'discover'
    ? new Set(['env-file'])
    : new Set(['env-file', 'jurisdiction', 'max-authoritative-bytes', 'writer-compatibility-id']);
  const unknown = Object.keys(values).filter((name) => !allowed.has(name));
  if (unknown.length !== 0 || (command === 'discover' && flags.size !== 0)) {
    fail('invalid_cli_arguments', 'CLI arguments do not match the selected command', { unknown });
  }
}

export function readCleanSourceSha(repositoryRoot) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (dirty.length !== 0) fail('source_worktree_dirty', 'Worker deployment requires a clean source worktree');
  const value = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) fail('invalid_source_sha', 'Current repository HEAD is not a full Git SHA');
  return value;
}

function safeDiscoverySummary(discovery) {
  return {
    accountIdDigest: discovery.accountIdDigest,
    accountType: discovery.accountType,
    tokenStatus: discovery.tokenStatus,
    counts: {
      d1Databases: discovery.databases.length,
      durableObjectNamespaces: discovery.namespaces.length,
      workerScripts: discovery.scripts.length,
    },
    intended: {
      databaseMatches: matchingNamedResources(discovery.databases, D0019_D1_DATABASE_NAME).length,
      workerMatches: D0019_QUALIFICATION_SCRIPTS.filter((name) => discovery.scripts.some((script) => script?.id === name)).length,
    },
    workersSubdomainConfigured: typeof discovery.workerSubdomain === 'string' && discovery.workerSubdomain.length > 0,
    workerUsageModel: discovery.workerSettings?.default_usage_model ?? null,
  };
}

async function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { command, values, flags } = parseArgs(process.argv.slice(2));
  if (!['discover', 'provision'].includes(command)) fail('invalid_cli_command', 'Command must be discover or provision');
  assertCliShape(command, values, flags);
  if (typeof values['env-file'] !== 'string') fail('invalid_cli_arguments', '--env-file is required');
  const credentials = loadCloudflareCredentials(path.resolve(values['env-file']));
  const client = new CloudflareApiClient(credentials);
  const discovery = await discoverCloudflareAccount(client);
  if (command === 'discover') {
    process.stdout.write(`${JSON.stringify({ status: 'verified', discovery: safeDiscoverySummary(discovery) })}\n`);
    return;
  }
  if (!flags.has('--apply')) fail('mutation_not_authorized', 'provision requires --apply');
  const jurisdiction = assertJurisdiction(values.jurisdiction);
  const maxAuthoritativeBytesPerCase = assertPositiveSafeInteger(values['max-authoritative-bytes'], 'maxAuthoritativeBytesPerCase');
  const writerCompatibilityId = assertWriterCompatibilityId(values['writer-compatibility-id']);
  const qualificationToken = randomBytes(32).toString('hex');
  const result = await provisionD0019QualificationResources({
    client,
    repositoryRoot,
    discovery,
    jurisdiction,
    maxAuthoritativeBytesPerCase,
    writerCompatibilityId,
    sourceSha: readCleanSourceSha(repositoryRoot),
    qualificationToken,
    allowCreate: true,
    enableSubdomain: false,
  });
  process.stdout.write(`${JSON.stringify({
    status: 'provisioned_disabled',
    accountIdDigest: discovery.accountIdDigest,
    database: {
      name: result.database.name,
      jurisdiction: result.database.jurisdiction,
      uuidDigest: sha256(result.database.uuid),
    },
    schema: result.schema,
    workers: result.workers.map((worker) => ({
      scriptName: worker.scriptName,
      namespaceIdDigest: sha256(worker.namespaceId),
      moduleDigest: worker.moduleDigest,
      subdomainEnabled: worker.subdomainEnabled,
    })),
    qualificationTokenPersisted: false,
  })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    const code = error?.code ?? 'd0019_cloudflare_tool_failed';
    const details = error instanceof CloudflareQualificationError
      ? {
          status: error.details?.status ?? null,
          causeCode: error.details?.causeCode ?? null,
          failures: error.details?.failures ?? [],
          safetyClosureFailures: error.details?.safetyClosureFailures ?? [],
        }
      : {};
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: { code, details } })}\n`);
    process.exitCode = 1;
  });
}
