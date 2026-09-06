#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CaseRepository,
  CaseAgentDriveAuthority,
  ContractError,
  DevelopmentUnitRunner,
  GitRepositoryModelExecutor,
  LocalDevelopmentOperationRuntime,
  MemoryCaseAgentDriveStore,
  MemorySnapshotStore,
  createLocalDevelopmentAgent,
  createMcpAuthManifest,
  createMcpSurfaceManifest,
  createTdevMcpSurface,
  developmentOperationCapabilityId,
  digest,
  normalizeDevelopmentOperationManifest,
  strictJsonParse,
} from '../src/index.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_EXECUTABLE = '/data/data/com.termux/files/usr/bin/codex';
const NPM_EXECUTABLE = '/data/data/com.termux/files/usr/bin/npm';
const CODEX_HOME = process.env.CODEX_HOME ?? null;
const WORKSPACE_ROOT = '/data/data/com.termux/files/usr/tmp';
const PROFILE_PATH = path.join(ROOT, 'config', 'development-operation-profiles.json');
const OUTPUT_SCHEMA_PATH = path.join(ROOT, 'config', 'codex-changeset-output.schema.json');

function fail(code, message, details = undefined) { throw new ContractError(code, message, details); }

async function git(repositoryPath, args, input = null) {
  const result = await runGitCommand({ repositoryPath, args, input });
  if (result.code !== 0) fail('cp1_git_failed', `Git ${args[0]} failed`, { exitCode: result.code });
  return result.stdout;
}

async function fixtureRepository() {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-cp1-repository-'));
  const files = {
    'package.json': `${JSON.stringify({ name: 'tdev-cp1-fixture', private: true, scripts: { check: 'node --test test/mini.test.mjs' } }, null, 2)}\n`,
    'src/mini.mjs': 'export const value = 1;\n',
    'test/mini.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { value } from '../src/mini.mjs';\ntest('mini value', () => assert.equal(value, 1));\n",
  };
  try {
    for (const [filePath, content] of Object.entries(files)) {
      const target = path.join(repositoryPath, ...filePath.split('/'));
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, content, { mode: 0o600 });
    }
    await git(repositoryPath, ['init', '-q']);
    await git(repositoryPath, ['config', 'user.name', 'tdev-cp1']);
    await git(repositoryPath, ['config', 'user.email', 'tdev-cp1@example.invalid']);
    await git(repositoryPath, ['add', '-A']);
    await git(repositoryPath, ['commit', '-qm', 'cp1 base']);
    const commitOid = (await git(repositoryPath, ['rev-parse', 'HEAD'])).toString('ascii').trim();
    return { repositoryPath, files, commitOid, baseDigest: digest(files) };
  } catch (cause) {
    await rm(repositoryPath, { recursive: true, force: true });
    throw cause;
  }
}

async function request(surface, id, method, params, headers = {}) {
  const response = await surface.fetch(new Request('https://tdev-cp1.invalid/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }));
  const body = strictJsonParse(await response.text());
  if (response.status !== 200) fail('cp1_mcp_request_failed', `MCP ${method} failed`, { status: response.status, body });
  if (body.error) fail('cp1_mcp_rpc_error', `MCP ${method} returned an error`, body.error);
  return body.result;
}

async function main() {
  if (CODEX_HOME === null) fail('cp1_codex_home_missing', 'CODEX_HOME is required for the local CP1 run');
  const fixture = await fixtureRepository();
  const workspaceBefore = new Set((await readdir(WORKSPACE_ROOT).catch(() => [])).filter((entry) => entry.startsWith('tdev-development-')));
  const operationManifest = normalizeDevelopmentOperationManifest(strictJsonParse(await readFile(PROFILE_PATH)));
  const capabilities = Object.keys(operationManifest.profiles).map((profile) => developmentOperationCapabilityId(operationManifest, profile)).sort();
  const contextProfile = 'tdev.repository.context.prepare.v1';
  const contextCapabilityId = developmentOperationCapabilityId(operationManifest, contextProfile);
  const modelCapabilityId = developmentOperationCapabilityId(operationManifest, 'tdev.model.repository.execute.v1');
  const validationCapabilityId = developmentOperationCapabilityId(operationManifest, 'tdev.repository.validate.v1');
  const lazyAdapter = new GitRepositoryModelExecutor({ repositoryPath: fixture.repositoryPath, modelExecutable: CODEX_EXECUTABLE, timeoutMs: 300_000 });
  const scope = { paths: Object.keys(fixture.files).sort(), maxFiles: 8, maxBytes: 16 * 1024 };
  const lazyContext = await lazyAdapter.prepareLazyContext(fixture.commitOid, fixture.baseDigest, { scope });
  const scopedContextAdapter = {
    materializeContext: (commitOid, baseDigest, options = {}) => lazyAdapter.materializeScopedContext(commitOid, baseDigest, { ...options, scope }),
  };
  const contextReference = `cp1-context-${fixture.commitOid.slice(0, 12)}`;
  const identity = { principalId: 'cp1-principal', tenantId: 'cp1-tenant' };
  const authManifest = createMcpAuthManifest({
    mcpResource: 'https://tdev-cp1.invalid/mcp',
    authorizationServerIssuer: 'https://tdev-cp1.invalid/oauth',
    jwksUri: 'https://tdev-cp1.invalid/oauth/jwks',
    accessApplicationAudience: 'cp1-audience',
  });
  const auth = {
    manifest: authManifest,
    discovery: () => ({ protectedResource: { resource: authManifest.mcpResource, authorization_servers: [authManifest.authorizationServerIssuer] }, authorizationServer: null }),
    authenticate: async () => identity,
  };
  const repository = new CaseRepository(new MemorySnapshotStore());
  const driveAuthority = new CaseAgentDriveAuthority({ store: new MemoryCaseAgentDriveStore() });
  const operationRuntime = new LocalDevelopmentOperationRuntime({
    manifest: operationManifest,
    repositoryPath: fixture.repositoryPath,
    codexExecutable: CODEX_EXECUTABLE,
    codexHome: CODEX_HOME,
    outputSchemaPath: OUTPUT_SCHEMA_PATH,
    npmExecutable: NPM_EXECUTABLE,
    workspaceRoot: WORKSPACE_ROOT,
    contextAdapter: scopedContextAdapter,
  });
  const agent = createLocalDevelopmentAgent({ operationRuntime, agentId: 'agent-cp1', executorId: 'executor-cp1' });
  const runner = new DevelopmentUnitRunner({
    repository,
    driveAuthority,
    agent,
    operationManifest,
    caseContract: { caseGrant: capabilities, workspacePolicy: capabilities },
    capacity: 1,
  });
  const context = {
    revisionId: `cp1-${fixture.commitOid.slice(0, 12)}`,
    baseTree: fixture.files,
    repositoryCommitOid: fixture.commitOid,
    objectFormat: 'sha1',
    contextReferenceId: contextReference,
    contextCapabilityId,
    modelCapabilityId,
    validationCapabilityId,
    writePaths: ['src/mini.mjs', 'test/mini.test.mjs'],
    caseContract: { caseGrant: capabilities, workspacePolicy: capabilities },
  };
  const surface = createTdevMcpSurface({
    manifest: createMcpSurfaceManifest({ buildDigest: digest({ profile: 'cp1', commitOid: fixture.commitOid }) }),
    auth,
    repository,
    developmentUnitRunner: runner,
    authorize: async () => true,
    owners: {
      developmentContextGet: async ({ selector }) => {
        if (selector !== null && selector !== contextReference) fail('cp1_context_reference_mismatch', 'Unknown CP1 context reference');
        return context;
      },
      developmentContextList: async ({ contextReference: selected, cursor, limit }) => {
        if (selected !== contextReference) fail('cp1_context_reference_mismatch', 'Unknown CP1 context reference');
        return lazyAdapter.listLazyContext(lazyContext, { cursor, limit });
      },
      developmentContextSearch: async ({ contextReference: selected, pattern, cursor, limit }) => {
        if (selected !== contextReference) fail('cp1_context_reference_mismatch', 'Unknown CP1 context reference');
        return lazyAdapter.searchLazyContext(lazyContext, { pattern, cursor, limit });
      },
      developmentContextRead: async ({ contextReference: selected, path: filePath, startByte, maxBytes }) => {
        if (selected !== contextReference) fail('cp1_context_reference_mismatch', 'Unknown CP1 context reference');
        return lazyAdapter.readLazyContext(lazyContext, { path: filePath, startByte, ...(maxBytes === undefined ? {} : { maxBytes }) });
      },
    },
  });
  const beforeHead = (await git(fixture.repositoryPath, ['rev-parse', 'HEAD'])).toString('ascii').trim();
  const beforeStatus = (await git(fixture.repositoryPath, ['status', '--porcelain=v1'])).toString('utf8');
  try {
    const initialize = await request(surface, 'init', 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'cp1-harness', version: '1' } });
    const tools = await request(surface, 'tools', 'tools/list', {}, { 'mcp-protocol-version': initialize.protocolVersion });
    if (!tools.tools.some((tool) => tool.name === 'development_context_read')) fail('cp1_lazy_tool_missing', 'Lazy context read tool is not exposed');
    const listed = await request(surface, 'list', 'tools/call', { name: 'development_context_list', arguments: { contextReference, limit: 8 } }, { 'mcp-protocol-version': initialize.protocolVersion });
    const listedValue = strictJsonParse(listed.content[0].text);
    if (listedValue.complete !== true || listedValue.entries.length !== 3) fail('cp1_manifest_incomplete', 'CP1 manifest projection was not complete');
    const read = await request(surface, 'read', 'tools/call', { name: 'development_context_read', arguments: { contextReference, path: 'src/mini.mjs' } }, { 'mcp-protocol-version': initialize.protocolVersion });
    const readValue = strictJsonParse(read.content[0].text);
    if (readValue.content !== fixture.files['src/mini.mjs']) fail('cp1_read_mismatch', 'CP1 lazy read did not return the bound blob');
    const started = await request(surface, 'start', 'tools/call', { name: 'development_unit_start', arguments: {
      requestId: 'cp1-request',
      caseId: 'cp1-case',
      driveRequestId: 'cp1-drive',
      contextReference,
      instruction: 'In src/mini.mjs change value from 1 to 2 and update test/mini.test.mjs to assert 2. Do not modify package.json or any other path. Return complete replacements in the result-only ChangeSet.',
      validationProfile: 'tdev.validation.npm-check.v1',
    } }, { 'mcp-protocol-version': initialize.protocolVersion });
    const candidate = await request(surface, 'candidate', 'tools/call', { name: 'development_unit_get', arguments: { caseId: 'cp1-case' } }, { 'mcp-protocol-version': initialize.protocolVersion });
    const candidateValue = strictJsonParse(candidate.content[0].text);
    if (candidateValue.caseState !== 'succeeded') fail('cp1_candidate_not_succeeded', 'CP1 candidate did not reach succeeded state', { started, candidate: candidateValue });
    const changed = candidateValue.canonicalTree['src/mini.mjs']?.includes('value = 2') && candidateValue.canonicalTree['test/mini.test.mjs']?.includes('equal(value, 2)');
    if (!changed) fail('cp1_objective_missing', 'CP1 candidate does not contain the requested source change');
    const afterHead = (await git(fixture.repositoryPath, ['rev-parse', 'HEAD'])).toString('ascii').trim();
    const afterStatus = (await git(fixture.repositoryPath, ['status', '--porcelain=v1'])).toString('utf8');
    if (afterHead !== beforeHead || afterStatus !== beforeStatus) fail('cp1_canonical_mutated', 'CP1 changed the fixture canonical checkout or ref');
    await operationRuntime.dispose();
    const workspaceAfter = new Set((await readdir(WORKSPACE_ROOT).catch(() => [])).filter((entry) => entry.startsWith('tdev-development-')));
    for (const entry of workspaceAfter) if (!workspaceBefore.has(entry)) fail('cp1_workspace_leaked', 'CP1 left a disposable workspace behind', { entry });
    process.stdout.write(`${JSON.stringify({ profile: 'tdev.d0047.cp1-scoped-context.v1', status: 'PASS', repositoryCommitOid: fixture.commitOid, baseDigest: fixture.baseDigest, manifestDigest: lazyContext.descriptor.manifestDigest, scopeDigest: lazyContext.descriptor.scopeDigest, contextReference, candidateState: candidateValue.caseState, canonicalUnchanged: true, workspaceCleaned: true })}\n`);
  } finally {
    await operationRuntime.dispose().catch(() => {});
    await rm(fixture.repositoryPath, { recursive: true, force: true });
  }
}

main().catch((cause) => {
  process.stderr.write(`${JSON.stringify({ profile: 'tdev.d0047.cp1-scoped-context.v1', status: 'FAIL', code: cause?.code ?? 'cp1_failed', message: cause?.message ?? String(cause), details: cause?.details ?? null })}\n`);
  process.exitCode = 1;
});
