import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareApiClient,
  D0019_WORKER_COMPATIBILITY_DATE,
  D0019_WORKER_MAIN_MODULE,
  D0019_WORKER_OWNERSHIP_TAG,
  assertQualificationWorkerSettings,
  buildQualificationWorkerMetadata,
  collectWorkerModules,
  createWorkerUploadForm,
  ensureD1Database,
  ensureD1PlacementSchema,
  parseCloudflareEnv,
  provisionD0019QualificationResources,
  workerModuleDigest,
} from '../tools/d0019-cloudflare-api.mjs';

function apiResponse(result, { status = 200, success = true, errors = [] } = {}) {
  return new Response(JSON.stringify({ success, errors, messages: [], result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function queryResult(rows = []) {
  return { success: true, results: rows, meta: {} };
}

test('D0019 Cloudflare env parser accepts inert assignments and rejects duplicates or shell-like whitespace', () => {
  const parsed = parseCloudflareEnv([
    '# credentials',
    'export CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef',
    'CLOUDFLARE_API_TOKEN="token-value-with-dash"',
    "SINGLE='literal value'",
  ].join('\n'));
  assert.equal(parsed.CLOUDFLARE_ACCOUNT_ID, '0123456789abcdef0123456789abcdef');
  assert.equal(parsed.CLOUDFLARE_API_TOKEN, 'token-value-with-dash');
  assert.equal(parsed.SINGLE, 'literal value');
  assert.throws(
    () => parseCloudflareEnv('A=one\nA=two\n'),
    (error) => error?.code === 'invalid_cloudflare_env_file',
  );
  assert.throws(
    () => parseCloudflareEnv('A=$(unsafe value)\n'),
    (error) => error?.code === 'invalid_cloudflare_env_file',
  );
});

test('D0019 Cloudflare API client keeps credentials in the authorization header and bounds error output', async () => {
  const requests = [];
  const client = new CloudflareApiClient({
    accountId: '0123456789abcdef0123456789abcdef',
    apiToken: 'api-token-value-that-is-long-enough',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return apiResponse({ status: 'active' });
    },
  });
  const response = await client.request('GET', client.accountPath('/tokens/verify'));
  assert.equal(response.result.status, 'active');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.includes('api-token-value'), false);
  assert.equal(requests[0].init.headers.authorization, 'Bearer api-token-value-that-is-long-enough');
  assert.equal(requests[0].init.body, undefined);

  const rejecting = new CloudflareApiClient({
    accountId: '0123456789abcdef0123456789abcdef',
    apiToken: 'api-token-value-that-is-long-enough',
    fetchImpl: async () => apiResponse(null, {
      status: 403,
      success: false,
      errors: [{ code: 10000, message: 'permission denied' }],
    }),
  });
  await assert.rejects(
    rejecting.request('GET', rejecting.accountPath('/workers/scripts')),
    (error) => error?.code === 'cloudflare_api_rejected' && error.details?.errors?.[0]?.code === 10000,
  );

  const oversized = new CloudflareApiClient({
    accountId: '0123456789abcdef0123456789abcdef',
    apiToken: 'api-token-value-that-is-long-enough',
    fetchImpl: async () => new Response('{}', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }),
  });
  await assert.rejects(
    oversized.request('GET', oversized.accountPath('/workers/scripts')),
    (error) => error?.code === 'cloudflare_api_response_too_large' && error.details?.apiPath.endsWith('/workers/scripts'),
  );
});

test('D0019 Worker module collector closes only the static qualification dependency graph', () => {
  const modules = collectWorkerModules(process.cwd());
  assert.equal(modules.has(D0019_WORKER_MAIN_MODULE), true);
  assert.equal(modules.has('src/d0019-qualification-runtime.mjs'), true);
  assert.equal(modules.has('src/casedo-authority.mjs'), true);
  assert.equal(modules.has('src/d1-case-placement.mjs'), true);
  assert.equal(modules.has('src/store.mjs'), false);
  assert.equal(modules.size, 16);
  assert.match(workerModuleDigest(modules), /^sha256:[0-9a-f]{64}$/);
});

function metadataFixture(overrides = {}) {
  return buildQualificationWorkerMetadata({
    scriptName: 'tdev-d0019-qualification-a',
    databaseId: 'database-uuid',
    namespaceId: 'namespace-id',
    jurisdiction: 'eu',
    maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
    writerCompatibilityId: 'writer-v1',
    sourceSha: '1'.repeat(40),
    ...overrides,
  });
}

test('D0019 Worker metadata uses declarative SQLite exports, exact bindings, and no embedded secret', async () => {
  const metadata = metadataFixture();
  assert.equal(metadata.main_module, D0019_WORKER_MAIN_MODULE);
  assert.equal(metadata.compatibility_date, D0019_WORKER_COMPATIBILITY_DATE);
  assert.deepEqual(metadata.compatibility_flags, ['nodejs_compat']);
  assert.equal(metadata.annotations['workers/tag'], D0019_WORKER_OWNERSHIP_TAG);
  assert.deepEqual(metadata.exports.CaseRuntimeDO, { type: 'durable-object', storage: 'sqlite' });
  assert.equal(metadata.bindings.some((binding) => binding.type === 'secret_text'), false);
  assert.equal(metadata.bindings.find((binding) => binding.name === 'TDEV_CASE_PLACEMENT').database_id, 'database-uuid');
  assert.equal(metadata.bindings.find((binding) => binding.name === 'TDEV_CASE_AUTHORITY').class_name, 'CaseRuntimeDO');
  assert.equal(metadata.bindings.find((binding) => binding.name === 'TDEV_CASEDO_NAMESPACE').text, 'namespace-id');

  const modules = new Map([[D0019_WORKER_MAIN_MODULE, 'export default {};']]);
  const form = createWorkerUploadForm(metadata, modules);
  const decodedMetadata = JSON.parse(await form.get('metadata').text());
  assert.deepEqual(decodedMetadata, metadata);
  assert.equal(await form.get(D0019_WORKER_MAIN_MODULE).text(), 'export default {};');
});

test('D0019 Worker readback requires exact namespace, D1, runtime, writer, budget, and secret types', () => {
  const metadata = metadataFixture();
  const settings = {
    ...metadata,
    bindings: [
      ...metadata.bindings.map((binding) => binding.name === 'TDEV_CASE_AUTHORITY'
        ? { ...binding, namespace_id: 'namespace-id' }
        : binding),
      { type: 'secret_text', name: 'TDEV_D0019_QUALIFICATION_TOKEN' },
    ],
  };
  assert.equal(assertQualificationWorkerSettings(settings, {
    scriptName: 'tdev-d0019-qualification-a',
    databaseId: 'database-uuid',
    namespaceId: 'namespace-id',
    jurisdiction: 'eu',
    maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
    writerCompatibilityId: 'writer-v1',
  }), true);
  const wrongNamespace = structuredClone(settings);
  wrongNamespace.bindings.find((binding) => binding.name === 'TDEV_CASE_AUTHORITY').namespace_id = 'other-namespace';
  assert.throws(
    () => assertQualificationWorkerSettings(wrongNamespace, {
      scriptName: 'tdev-d0019-qualification-a',
      databaseId: 'database-uuid',
      namespaceId: 'namespace-id',
      jurisdiction: 'eu',
      maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
      writerCompatibilityId: 'writer-v1',
    }),
    (error) => error?.code === 'worker_settings_mismatch',
  );
});

class SequencedClient {
  constructor(sequence) {
    this.sequence = [...sequence];
  }

  accountPath(suffix) {
    return `/accounts/account${suffix}`;
  }

  async request(method, apiPath, options) {
    const next = this.sequence.shift();
    assert.ok(next, `unexpected request ${method} ${apiPath}`);
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next({ method, apiPath, options });
    return next;
  }
}

test('D0019 D1 creation never retries the write and tolerates bounded readback propagation', async () => {
  let writes = 0;
  let reads = 0;
  const client = {
    accountPath(suffix) {
      return `/accounts/account${suffix}`;
    },
    async request(method) {
      if (method === 'POST') {
        writes += 1;
        return { result: { uuid: 'database-uuid' } };
      }
      reads += 1;
      return {
        result: reads < 3 ? [] : [{ name: 'tdev-d0019-placement', uuid: 'database-uuid', jurisdiction: 'eu' }],
      };
    },
  };
  const result = await ensureD1Database(client, { databases: [] }, { jurisdiction: 'eu', allowCreate: true });
  assert.equal(result.uuid, 'database-uuid');
  assert.equal(writes, 1);
  assert.equal(reads, 3);
});

function queryEnvelope(rows) {
  return { result: [queryResult(rows)] };
}

function compatibleSchemaSequence() {
  return [
    queryEnvelope([
      {
        name: 'tdev_case_placement_meta',
        type: 'table',
        sql: "CREATE TABLE tdev_case_placement_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), profile TEXT NOT NULL CHECK (profile = 'tdev.case-placement.d1.v1'), schema_version INTEGER NOT NULL CHECK (schema_version = 1))",
      },
      {
        name: 'tdev_case_placements',
        type: 'table',
        sql: 'CREATE TABLE tdev_case_placements (case_id TEXT PRIMARY KEY NOT NULL, placement_generation INTEGER NOT NULL CHECK (placement_generation > 0), placement_digest TEXT NOT NULL, placement_json TEXT NOT NULL)',
      },
    ]),
    queryEnvelope([{ singleton: 1, profile: 'tdev.case-placement.d1.v1', schema_version: 1 }]),
    queryEnvelope([
      { name: 'singleton', type: 'INTEGER', notnull: 0, pk: 1 },
      { name: 'profile', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'schema_version', type: 'INTEGER', notnull: 1, pk: 0 },
    ]),
    queryEnvelope([
      { name: 'case_id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'placement_generation', type: 'INTEGER', notnull: 1, pk: 0 },
      { name: 'placement_digest', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'placement_json', type: 'TEXT', notnull: 1, pk: 0 },
    ]),
    queryEnvelope([{ count: 0 }]),
  ];
}

function compatibleSchemaResponse(sql) {
  const sequence = compatibleSchemaSequence();
  if (sql.includes('sqlite_schema')) return sequence[0];
  if (sql.includes('SELECT singleton')) return sequence[1];
  if (sql.includes("PRAGMA table_info('tdev_case_placement_meta')")) return sequence[2];
  if (sql.includes("PRAGMA table_info('tdev_case_placements')")) return sequence[3];
  if (sql.includes('SELECT COUNT(*)')) return sequence[4];
  assert.fail(`unexpected D1 SQL: ${sql}`);
}

class FakeQualificationProvider {
  constructor({ failFinalUploadFor = null } = {}) {
    this.records = new Map();
    this.namespaces = [];
    this.uploadCounts = new Map();
    this.subdomainEvents = [];
    this.failFinalUploadFor = failFinalUploadFor;
  }

  accountPath(suffix) {
    return `/accounts/account${suffix}`;
  }

  async request(method, apiPath, options = {}) {
    if (method === 'POST' && apiPath.endsWith('/d1/database/database-uuid/query')) {
      return compatibleSchemaResponse(options.json.sql);
    }
    if (method === 'GET' && apiPath.includes('/workers/durable_objects/namespaces')) {
      return { result: structuredClone(this.namespaces) };
    }
    const settingsMatch = /\/workers\/scripts\/([^/]+)\/settings$/.exec(apiPath);
    if (method === 'GET' && settingsMatch) {
      const record = this.records.get(settingsMatch[1]);
      if (!record && options.allowNotFound) return { found: false, result: null };
      assert.ok(record, `missing fake Worker ${settingsMatch[1]}`);
      return { found: true, result: structuredClone(record.settings) };
    }
    const secretMatch = /\/workers\/scripts\/([^/]+)\/secrets$/.exec(apiPath);
    if (method === 'PUT' && secretMatch) {
      const record = this.records.get(secretMatch[1]);
      assert.ok(record);
      assert.equal(options.json.name, 'TDEV_D0019_QUALIFICATION_TOKEN');
      assert.equal(options.json.type, 'secret_text');
      record.secretLength = options.json.text.length;
      record.settings.bindings = record.settings.bindings.filter((binding) => binding.name !== options.json.name);
      record.settings.bindings.push({ type: 'secret_text', name: options.json.name });
      return { result: {} };
    }
    const subdomainMatch = /\/workers\/scripts\/([^/]+)\/subdomain$/.exec(apiPath);
    if (method === 'POST' && subdomainMatch) {
      const record = this.records.get(subdomainMatch[1]);
      assert.ok(record);
      record.subdomainEnabled = options.json.enabled;
      this.subdomainEvents.push([subdomainMatch[1], options.json.enabled]);
      return { result: { enabled: options.json.enabled } };
    }
    const uploadMatch = /\/workers\/scripts\/([^/]+)$/.exec(apiPath);
    if (method === 'PUT' && uploadMatch) {
      const scriptName = uploadMatch[1];
      const count = (this.uploadCounts.get(scriptName) ?? 0) + 1;
      this.uploadCounts.set(scriptName, count);
      if (scriptName === this.failFinalUploadFor && count === 2) {
        const error = new Error('simulated final upload failure');
        error.code = 'simulated_upload_failure';
        throw error;
      }
      const metadata = JSON.parse(await options.body.get('metadata').text());
      assert.equal(metadata.bindings.some((binding) => binding.type === 'secret_text'), false);
      let namespace = this.namespaces.find((item) => item.script === scriptName);
      if (!namespace) {
        namespace = { id: `namespace-${scriptName.slice(-1)}`, script: scriptName, class: 'CaseRuntimeDO', use_sqlite: true };
        this.namespaces.push(namespace);
      }
      const previous = this.records.get(scriptName);
      const bindings = metadata.bindings.map((binding) => binding.name === 'TDEV_CASE_AUTHORITY'
        ? { ...binding, namespace_id: namespace.id }
        : binding);
      if (previous?.secretLength) bindings.push({ type: 'secret_text', name: 'TDEV_D0019_QUALIFICATION_TOKEN' });
      this.records.set(scriptName, {
        settings: { ...metadata, bindings },
        secretLength: previous?.secretLength ?? null,
        subdomainEnabled: previous?.subdomainEnabled ?? false,
      });
      return { result: { id: `version-${scriptName}-${count}` } };
    }
    assert.fail(`unexpected provider request ${method} ${apiPath}`);
  }
}

function existingD1Discovery() {
  return {
    databases: [{ name: 'tdev-d0019-placement', uuid: 'database-uuid', jurisdiction: 'eu' }],
  };
}

test('D0019 provisioning creates two isolated SQLite namespaces and leaves their public routes disabled', async () => {
  const client = new FakeQualificationProvider();
  const result = await provisionD0019QualificationResources({
    client,
    repositoryRoot: process.cwd(),
    discovery: existingD1Discovery(),
    jurisdiction: 'eu',
    maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
    writerCompatibilityId: 'writer-v1',
    sourceSha: '1'.repeat(40),
    qualificationToken: 'q'.repeat(64),
    allowCreate: true,
    enableSubdomain: false,
  });
  assert.equal(result.workers.length, 2);
  assert.deepEqual(result.workers.map((worker) => worker.namespaceId), ['namespace-a', 'namespace-b']);
  assert.equal(new Set(result.workers.map((worker) => worker.moduleDigest)).size, 1);
  assert.equal(client.records.get('tdev-d0019-qualification-a').secretLength, 64);
  assert.equal(client.records.get('tdev-d0019-qualification-b').secretLength, 64);
  assert.equal([...client.records.values()].every((record) => record.subdomainEnabled === false), true);
  assert.equal([...client.uploadCounts.values()].every((count) => count === 2), true);
});

test('D0019 provisioning failure closes every owned public qualification route', async () => {
  const client = new FakeQualificationProvider({ failFinalUploadFor: 'tdev-d0019-qualification-b' });
  await assert.rejects(
    provisionD0019QualificationResources({
      client,
      repositoryRoot: process.cwd(),
      discovery: existingD1Discovery(),
      jurisdiction: 'eu',
      maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
      writerCompatibilityId: 'writer-v1',
      sourceSha: '1'.repeat(40),
      qualificationToken: 'q'.repeat(64),
      allowCreate: true,
      enableSubdomain: true,
    }),
    (error) => error?.code === 'qualification_provision_failed' &&
      error.details?.causeCode === 'simulated_upload_failure' &&
      error.details?.safetyClosureFailures?.length === 0,
  );
  assert.equal([...client.records.values()].every((record) => record.subdomainEnabled === false), true);
  assert.deepEqual(client.subdomainEvents.slice(-2), [
    ['tdev-d0019-qualification-a', false],
    ['tdev-d0019-qualification-b', false],
  ]);
});

test('D0019 D1 migration runs only from total absence and verifies the exact readback schema', async () => {
  const client = new SequencedClient([
    queryEnvelope([]),
    ({ options }) => {
      assert.match(options.json.sql, /CREATE TABLE tdev_case_placement_meta/);
      return { result: [queryResult([])] };
    },
    ...compatibleSchemaSequence(),
  ]);
  const result = await ensureD1PlacementSchema(client, 'database-uuid', 'CREATE TABLE tdev_case_placement_meta(x);');
  assert.equal(result.status, 'compatible');
  assert.equal(result.applied, true);
  assert.equal(result.reconciledAfterError, false);
  assert.equal(client.sequence.length, 0);
});

test('D0019 D1 migration reconciles an ambiguous write only through compatible readback', async () => {
  const ambiguous = new Error('response lost');
  ambiguous.code = 'cloudflare_api_unavailable';
  const client = new SequencedClient([
    queryEnvelope([]),
    ambiguous,
    ...compatibleSchemaSequence(),
  ]);
  const result = await ensureD1PlacementSchema(client, 'database-uuid', 'CREATE TABLE migration_fixture(x);');
  assert.equal(result.status, 'compatible');
  assert.equal(result.applied, false);
  assert.equal(result.reconciledAfterError, true);
  assert.equal(client.sequence.length, 0);
});

test('D0019 D1 migration fails closed on a partial pre-existing schema without writing', async () => {
  const client = new SequencedClient([
    queryEnvelope([{ name: 'tdev_case_placement_meta', type: 'table' }]),
  ]);
  await assert.rejects(
    ensureD1PlacementSchema(client, 'database-uuid', 'CREATE TABLE should_not_run(x);'),
    (error) => error?.code === 'incompatible_d1_schema',
  );
  assert.equal(client.sequence.length, 0);
});

test('D0019 D1 readback rejects a shape-compatible table with weakened constraints', async () => {
  const sequence = compatibleSchemaSequence();
  sequence[0].result[0].results[1].sql = 'CREATE TABLE tdev_case_placements (case_id TEXT PRIMARY KEY NOT NULL, placement_generation INTEGER NOT NULL, placement_digest TEXT NOT NULL, placement_json TEXT NOT NULL)';
  const client = new SequencedClient(sequence);
  await assert.rejects(
    ensureD1PlacementSchema(client, 'database-uuid', 'CREATE TABLE should_not_run(x);'),
    (error) => error?.code === 'incompatible_d1_schema',
  );
  assert.equal(client.sequence.length, sequence.length - 1);
});
