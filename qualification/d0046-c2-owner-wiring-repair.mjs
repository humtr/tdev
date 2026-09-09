import { readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, value) {
  writeFileSync(path, value, 'utf8');
}

function replaceOnce(path, before, after) {
  const source = read(path);
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected one exact replacement target, found ${first < 0 ? 0 : 'multiple'}`);
  }
  write(path, source.slice(0, first) + after + source.slice(first + before.length));
}

function insertAfterOnce(path, marker, addition) {
  replaceOnce(path, marker, marker + addition);
}

const runner = 'src/mcp-trial-runner.mjs';
replaceOnce(
  runner,
  `import {\n  DEVELOPMENT_OPERATION_PROFILE,\n  developmentOperationCapabilityId,\n  normalizeDevelopmentOperationManifest,\n} from './development-operation-profile.mjs';\n`,
  `import {\n  DEVELOPMENT_OPERATION_PROFILE,\n  developmentOperationCapabilityId as legacyDevelopmentOperationCapabilityId,\n  normalizeDevelopmentOperationManifest,\n} from './development-operation-profile.mjs';\nimport {\n  DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,\n  DEVELOPMENT_OPERATION_CATALOG_PROFILE,\n  developmentOperationCapabilityId as semanticDevelopmentOperationCapabilityId,\n  normalizeDevelopmentOperationCatalog,\n} from './development-operation-catalog.mjs';\n`,
);
replaceOnce(
  runner,
  `function executorCapabilities(manifest, operationManifest) {\n  const profiles = [manifest.operation.contextProfile, manifest.operation.modelProfile, manifest.operation.validationProfile];\n  const ids = profiles.map((profile) => developmentOperationCapabilityId(operationManifest, profile));\n  for (const field of ['contextCapabilityId', 'modelCapabilityId', 'validationCapabilityId']) {\n    const value = manifest.repository.context[field];\n    if (value !== undefined && value !== null) ids.push(value);\n  }\n  return [...new Set(ids)].sort();\n}\n`,
  `function executorCapabilities(manifest, operationManifest, operationCatalog = null) {\n  const profiles = [manifest.operation.contextProfile, manifest.operation.modelProfile, manifest.operation.validationProfile];\n  const ids = profiles.map((profile) => legacyDevelopmentOperationCapabilityId(operationManifest, profile));\n  for (const field of ['contextCapabilityId', 'modelCapabilityId', 'validationCapabilityId']) {\n    const value = manifest.repository.context[field];\n    if (value !== undefined && value !== null) ids.push(value);\n  }\n  if (operationCatalog !== null) {\n    const compose = operationCatalog.operations[DEVELOPMENT_CHANGESET_COMPOSE_OPERATION];\n    const validation = operationCatalog.policies.requiredValidation;\n    ids.push(semanticDevelopmentOperationCapabilityId(operationCatalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, compose.version));\n    ids.push(semanticDevelopmentOperationCapabilityId(operationCatalog, validation.operationId, validation.operationVersion));\n  }\n  return [...new Set(ids)].sort();\n}\n`,
);
replaceOnce(
  runner,
  `export function createMcpTrialOperationRequest(view, taskId, payload, operationManifest) {\n  const task = view.plan.tasksById[taskId];\n`,
  `export function createMcpTrialOperationRequest(view, taskId, payload, operationManifest, operationCatalog = null) {\n  const task = view.plan.tasksById[taskId];\n  if (taskId === 'change') {\n    if (operationCatalog === null) fail('mcp_trial_manifest_invalid', 'Semantic change Task requires the release operation catalog');\n    return {\n      operation: canonicalClone(task.input.operation),\n      repositoryCommitOid: task.input.repositoryCommitOid,\n      baseDigest: task.input.baseDigest,\n      contextReferenceId: task.input.contextReferenceId,\n      ...(task.input.writePaths === undefined ? {} : { writePaths: canonicalClone(task.input.writePaths) }),\n      caseContract: canonicalClone(view.caseContract),\n      ...(task.input.repositoryBaseIdentity === undefined ? {} : { repositoryBaseIdentity: canonicalClone(task.input.repositoryBaseIdentity) }),\n    };\n  }\n  if (taskId === 'validate' && isPlainRecord(task.input.operation)) {\n    if (operationCatalog === null) fail('mcp_trial_manifest_invalid', 'Semantic validation Task requires the release operation catalog');\n    const change = resultForTask(view, 'change');\n    const candidateTreeDigest = change?.evidence?.candidateTreeDigest;\n    assertDigest(candidateTreeDigest, 'candidateTreeDigest');\n    return {\n      operation: canonicalClone(task.input.operation),\n      policyId: task.input.policyId,\n      bindingId: task.input.bindingId,\n      candidateTreeDigest,\n    };\n  }\n`,
);
replaceOnce(
  runner,
  `function executableBody(view, taskId, payload, { predictedAttemptOrdinal, executor, operationManifest } = {}) {\n  const operation = createMcpTrialOperationRequest(view, taskId, payload, operationManifest);\n`,
  `function executableBody(view, taskId, payload, { predictedAttemptOrdinal, executor, operationManifest, operationCatalog } = {}) {\n  const semantic = taskId === 'change' || (taskId === 'validate' && isPlainRecord(view.plan.tasksById[taskId]?.input?.operation));\n  const operation = createMcpTrialOperationRequest(view, taskId, payload, operationManifest, operationCatalog);\n`,
);
replaceOnce(
  runner,
  `  return {\n    profile: DEVELOPMENT_OPERATION_PROFILE,\n    operationRequest: operation,\n`,
  `  return {\n    profile: semantic ? DEVELOPMENT_OPERATION_CATALOG_PROFILE : DEVELOPMENT_OPERATION_PROFILE,\n    operationRequest: operation,\n`,
);
replaceOnce(
  runner,
  `  constructor({ repository, driveOwner, agentOwner, manifest, operationManifest, caseContract = undefined, now = () => Date.now() } = {}) {\n`,
  `  constructor({ repository, driveOwner, agentOwner, manifest, operationManifest, operationCatalog = null, caseContract = undefined, now = () => Date.now() } = {}) {\n`,
);
replaceOnce(
  runner,
  `    this.operationManifest = normalizeDevelopmentOperationManifest(operationManifest);\n    if (this.operationManifest.profile !== DEVELOPMENT_OPERATION_PROFILE) fail('mcp_trial_manifest_invalid', 'Trial operation manifest profile is invalid');\n`,
  `    this.operationManifest = normalizeDevelopmentOperationManifest(operationManifest);\n    this.operationCatalog = operationCatalog === null ? null : normalizeDevelopmentOperationCatalog(operationCatalog);\n    if (this.operationManifest.profile !== DEVELOPMENT_OPERATION_PROFILE) fail('mcp_trial_manifest_invalid', 'Trial operation manifest profile is invalid');\n`,
);
replaceOnce(
  runner,
  `    this.capabilities = executorCapabilities(this.manifest, this.operationManifest);\n`,
  `    this.capabilities = executorCapabilities(this.manifest, this.operationManifest, this.operationCatalog);\n`,
);
replaceOnce(
  runner,
  `      executor,\n      operationManifest: this.operationManifest,\n    });\n`,
  `      executor,\n      operationManifest: this.operationManifest,\n      operationCatalog: this.operationCatalog,\n    });\n`,
);

const helper = `const PROFILE = 'tdev.repository-context.git-scoped-lazy.v1';\nconst MAX_READ_SCAN_BYTES = 32 * 1024 * 1024;\nconst encoder = new TextEncoder();\nconst decoder = new TextDecoder('utf-8', { fatal: true });\n\nfunction fail(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  throw error;\n}\n\nfunction integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {\n  if (!Number.isSafeInteger(value) || value < min || value > max) fail('mcp_owner_input_invalid', \\`\\${label} is outside its bound\\`);\n  return value;\n}\n\nfunction selected(path, scope) {\n  return scope.paths.includes(path) || scope.prefixes.some((prefix) => path === prefix || path.startsWith(\\`\\${prefix}/\\`));\n}\n\nfunction freeze(value) {\n  if (Array.isArray(value)) return Object.freeze(value.map(freeze));\n  if (value && typeof value === 'object') {\n    for (const key of Object.keys(value)) value[key] = freeze(value[key]);\n    return Object.freeze(value);\n  }\n  return value;\n}\n\nexport function createMcpTrialLazyContextOwner({ contextReference, loadLazyContext } = {}) {\n  if (typeof contextReference !== 'string' || contextReference.length === 0 || typeof loadLazyContext !== 'function') {\n    fail('mcp_owner_unavailable', 'Lazy context owner is not configured');\n  }\n  let prepared = null;\n  const context = async () => {\n    if (prepared !== null) return prepared;\n    const value = await loadLazyContext();\n    if (!value || typeof value !== 'object' || !Array.isArray(value.manifest) || !value.scope || typeof value.tree !== 'object') {\n      fail('mcp_owner_unavailable', 'Generated lazy context is invalid');\n    }\n    const rows = value.manifest.filter((row) => selected(row.path, value.scope));\n    if (rows.length > value.scope.maxFiles) fail('mcp_owner_unavailable', 'Generated lazy context exceeds maxFiles');\n    prepared = freeze({ ...value, rows });\n    return prepared;\n  };\n  const assertReference = (value) => {\n    if (value !== contextReference) fail('mcp_trial_context_scope_denied', 'Context reference is outside the fixed trial reference');\n  };\n  return Object.freeze({\n    developmentContextList: async ({ contextReference: reference, cursor = 0, limit = 128 } = {}) => {\n      assertReference(reference);\n      const value = await context();\n      integer(cursor, 'cursor', { max: value.rows.length });\n      integer(limit, 'limit', { min: 1, max: 128 });\n      const entries = value.rows.slice(cursor, cursor + limit).map((row) => ({ ...row }));\n      const nextCursor = cursor + entries.length < value.rows.length ? cursor + entries.length : null;\n      return freeze({ profile: PROFILE, manifestDigest: value.manifestDigest, scopeDigest: value.scopeDigest, entries, nextCursor, complete: nextCursor === null });\n    },\n    developmentContextRead: async ({ contextReference: reference, path, startByte = 0, maxBytes = undefined } = {}) => {\n      assertReference(reference);\n      const value = await context();\n      const row = value.rows.find((entry) => entry.path === path);\n      if (!row) fail('lazy_scope_denied', \\`Path is outside the owner-issued lazy scope: \\${String(path)}\\`);\n      if (row.type !== 'blob' || !['100644', '100755'].includes(row.mode) || !Number.isSafeInteger(row.byteLength)) fail('lazy_entry_read_unsupported', 'Lazy entry is not readable');\n      integer(startByte, 'startByte', { max: row.byteLength });\n      const bound = maxBytes === undefined ? value.scope.maxBytes : integer(maxBytes, 'maxBytes', { min: 1, max: value.scope.maxBytes });\n      const endByte = Math.min(row.byteLength, startByte + bound);\n      if (endByte > MAX_READ_SCAN_BYTES) fail('lazy_read_limit_exceeded', 'Lazy read range exceeds its bound');\n      const bytes = encoder.encode(value.tree[path]);\n      if (bytes.byteLength !== row.byteLength) fail('mcp_owner_unavailable', 'Generated lazy content length does not match its manifest');\n      let content;\n      try { content = decoder.decode(bytes.subarray(startByte, endByte)); }\n      catch { fail('lazy_read_range_not_utf8', 'Lazy read range is not a complete UTF-8 sequence'); }\n      return freeze({ profile: PROFILE, path, mode: row.mode, type: row.type, blobOid: row.blobOid, byteLength: row.byteLength, startByte, endByte, complete: endByte === row.byteLength, content });\n    },\n    developmentContextSearch: async ({ contextReference: reference, pattern, cursor = 0, limit = undefined } = {}) => {\n      assertReference(reference);\n      if (typeof pattern !== 'string' || pattern.length === 0 || encoder.encode(pattern).byteLength > 4096) fail('mcp_owner_input_invalid', 'Search pattern is outside its bound');\n      const value = await context();\n      integer(cursor, 'cursor', { max: value.rows.length });\n      const bound = limit === undefined ? Math.min(value.scope.maxSearchResults, 64) : integer(limit, 'limit', { min: 1, max: value.scope.maxSearchResults });\n      let visitedFiles = 0;\n      let visitedBytes = 0;\n      let index = cursor;\n      let complete = true;\n      const matches = [];\n      for (; index < value.rows.length && matches.length < bound; index += 1) {\n        const row = value.rows[index];\n        if (row.type !== 'blob' || !['100644', '100755'].includes(row.mode) || !Number.isSafeInteger(row.byteLength)) continue;\n        if (visitedBytes + row.byteLength > value.scope.maxBytes) { complete = false; break; }\n        const content = value.tree[row.path];\n        if (typeof content !== 'string') fail('mcp_owner_unavailable', 'Generated lazy context is missing selected content');\n        visitedFiles += 1;\n        visitedBytes += row.byteLength;\n        if (content.includes(pattern)) matches.push(row.path);\n      }\n      if (index < value.rows.length && matches.length >= bound) complete = false;\n      return freeze({ profile: PROFILE, manifestDigest: value.manifestDigest, scopeDigest: value.scopeDigest, matches, nextCursor: complete ? null : index, complete, visitedFiles, visitedBytes });\n    },\n  });\n}\n`;
write('qualification/mcp-trial-lazy-context-owner.mjs', helper);

const worker = 'qualification/cloudflare-mcp-trial-worker.mjs';
replaceOnce(
  worker,
  `import {\n  normalizeDevelopmentOperationManifest,\n} from '../src/development-operation-profile.mjs';\n`,
  `import {\n  normalizeDevelopmentOperationManifest,\n} from '../src/development-operation-profile.mjs';\nimport { normalizeDevelopmentOperationCatalog } from '../src/development-operation-catalog.mjs';\nimport { createMcpTrialLazyContextOwner } from './mcp-trial-lazy-context-owner.mjs';\n`,
);
replaceOnce(
  worker,
  `  loadMcpTrialBaseTree,\n  MCP_TRIAL_BASE_COMMIT_OID,\n`,
  `  loadMcpTrialBaseTree,\n  loadMcpTrialLazyContext,\n  MCP_TRIAL_BASE_COMMIT_OID,\n`,
);
insertAfterOnce(worker, `const OPERATION_MANIFEST_BINDING = 'TDEV_MCP_OPERATION_MANIFEST_JSON';\n`, `const OPERATION_CATALOG_BINDING = 'TDEV_MCP_OPERATION_CATALOG_JSON';\n`);
replaceOnce(
  worker,
  `  const operationManifest = normalizeDevelopmentOperationManifest(readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024));\n`,
  `  const operationManifest = normalizeDevelopmentOperationManifest(readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024));\n  const operationCatalog = normalizeDevelopmentOperationCatalog(readJsonBinding(env, OPERATION_CATALOG_BINDING, 512 * 1024));\n`,
);
replaceOnce(
  worker,
  `    manifest: composition,\n    operationManifest,\n  });\n`,
  `    manifest: composition,\n    operationManifest,\n    operationCatalog,\n  });\n`,
);
replaceOnce(
  worker,
  `      operationManifestDigest: digest(operationManifest),\n`,
  `      operationManifestDigest: digest(operationManifest),\n      operationCatalogDigest: digest(operationCatalog),\n`,
);
replaceOnce(
  worker,
  `      developmentContextGet: facades.contextOwner.developmentContextGet,\n      developmentContextResolve: facades.contextOwner.developmentContextResolve,\n      authorize: facades.authorize,\n`,
  `      developmentContextGet: facades.contextOwner.developmentContextGet,\n      developmentContextResolve: facades.contextOwner.developmentContextResolve,\n      ...createMcpTrialLazyContextOwner({ contextReference: composition.repository.contextReference, loadLazyContext: loadMcpTrialLazyContext }),\n      operationCatalog,\n      authorize: facades.authorize,\n`,
);
replaceOnce(
  worker,
  `  const operationManifest = normalizeDevelopmentOperationManifest(\n    readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024),\n  );\n`,
  `  const operationManifest = normalizeDevelopmentOperationManifest(\n    readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024),\n  );\n  const operationCatalog = normalizeDevelopmentOperationCatalog(\n    readJsonBinding(env, OPERATION_CATALOG_BINDING, 512 * 1024),\n  );\n`,
);
replaceOnce(
  worker,
  `    operationManifestDigest: digest(operationManifest),\n  });\n`,
  `    operationManifestDigest: digest(operationManifest),\n    operationCatalogDigest: digest(operationCatalog),\n  });\n`,
);
insertAfterOnce(
  worker,
  `  const context = compactContext(configuredComposition);\n`,
  `  const lazyContextOwner = createMcpTrialLazyContextOwner({\n    contextReference: configuredComposition.repository.contextReference,\n    loadLazyContext: loadMcpTrialLazyContext,\n  });\n`,
);
insertAfterOnce(
  worker,
  `    developmentUnitRunner: runner,\n`,
  `    operationCatalog,\n    developmentStart: async (input = {}) => {\n      assertTrialCaseId(input?.caseId);\n      return invokeExecution(input.caseId, 'developmentStart', input);\n    },\n`,
);
insertAfterOnce(
  worker,
  `    developmentContextGet: async ({ selector = null } = {}) => {\n      assertContextSelector(selector);\n      return context;\n    },\n`,
  `    developmentContextList: lazyContextOwner.developmentContextList,\n    developmentContextSearch: lazyContextOwner.developmentContextSearch,\n    developmentContextRead: lazyContextOwner.developmentContextRead,\n`,
);

const driveWorker = 'qualification/cloudflare-case-agent-drive-worker.mjs';
insertAfterOnce(driveWorker, `  'developmentUnitStart',\n`, `  'developmentStart',\n`);
insertAfterOnce(
  driveWorker,
  `      case 'developmentUnitStart': result = await worker.surface.owners.developmentUnitStart(request.input); break;\n`,
  `      case 'developmentStart': result = await worker.surface.owners.developmentStart(request.input); break;\n`,
);

const deployer = 'qualification/d0046-mcp-trial-deploy.mjs';
insertAfterOnce(
  deployer,
  `import { normalizeDevelopmentOperationManifest } from '../src/development-operation-profile.mjs';\n`,
  `import { normalizeDevelopmentOperationCatalog } from '../src/development-operation-catalog.mjs';\n`,
);
insertAfterOnce(deployer, `export const D0046_OPERATION_CONFIG = 'config/development-operation-profiles.json';\n`, `export const D0046_OPERATION_CATALOG_CONFIG = 'config/development-operation-catalog.json';\n`);
insertAfterOnce(
  deployer,
  `function normalizedOperationManifest(raw) {\n  return normalizeDevelopmentOperationManifest(raw);\n}\n`,
  `\nfunction normalizedOperationCatalog(raw) {\n  return normalizeDevelopmentOperationCatalog(raw);\n}\n`,
);
replaceOnce(
  deployer,
  `export function buildTrialManifests({ sourceSha, baseDigest, baseTree, repositoryBaseIdentity = null, scope = null, scopeDigest: suppliedScopeDigest = null, operationManifest, driveNamespace = \\`pending-\\${D0046_MCP_TRIAL_SCRIPT}-drive\\`, accessAudience = 'pending-access-audience', identity = identityManifest(), includeBaseTree = true } = {}) {\n  if (!/^[0-9a-f]{40}$/u.test(sourceSha ?? '')) fail('d0046_source_sha_invalid', 'sourceSha must be a full Git SHA');\n  const normalizedOperation = normalizedOperationManifest(operationManifest);\n`,
  `export function buildTrialManifests({ sourceSha, baseDigest, baseTree, repositoryBaseIdentity = null, scope = null, scopeDigest: suppliedScopeDigest = null, operationManifest, operationCatalog, driveNamespace = \\`pending-\\${D0046_MCP_TRIAL_SCRIPT}-drive\\`, accessAudience = 'pending-access-audience', identity = identityManifest(), includeBaseTree = true } = {}) {\n  if (!/^[0-9a-f]{40}$/u.test(sourceSha ?? '')) fail('d0046_source_sha_invalid', 'sourceSha must be a full Git SHA');\n  const normalizedOperation = normalizedOperationManifest(operationManifest);\n  const normalizedCatalog = normalizedOperationCatalog(operationCatalog);\n`,
);
replaceOnce(
  deployer,
  `    operationManifestDigest: digest(normalizedOperation),\n  });\n`,
  `    operationManifestDigest: digest(normalizedOperation),\n    operationCatalogDigest: digest(normalizedCatalog),\n  });\n`,
);
replaceOnce(
  deployer,
  `    operation: normalizedOperation,\n    operationDigest: digest(normalizedOperation),\n`,
  `    operation: normalizedOperation,\n    operationDigest: digest(normalizedOperation),\n    operationCatalog: normalizedCatalog,\n    operationCatalogDigest: digest(normalizedCatalog),\n`,
);
replaceOnce(
  deployer,
  `    operation: canonicalJson(manifests.operation),\n`,
  `    operation: canonicalJson(manifests.operation),\n    operationCatalog: canonicalJson(manifests.operationCatalog),\n`,
);
replaceOnce(
  deployer,
  `  if (!manifests?.composition || !manifests?.auth || !manifests?.operation) fail('d0046_metadata_invalid', 'Worker metadata requires all trial manifests');\n`,
  `  if (!manifests?.composition || !manifests?.auth || !manifests?.operation || !manifests?.operationCatalog) fail('d0046_metadata_invalid', 'Worker metadata requires all trial manifests');\n`,
);
insertAfterOnce(
  deployer,
  `    plain('TDEV_MCP_OPERATION_MANIFEST_JSON', config.operation),\n`,
  `    plain('TDEV_MCP_OPERATION_CATALOG_JSON', config.operationCatalog),\n`,
);
replaceOnce(
  deployer,
  `  const operationManifest = normalizedOperationManifest(rawOperation);\n  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid: sourceSha, scope: D0046_MCP_CONTEXT_SCOPE });\n`,
  `  const operationManifest = normalizedOperationManifest(rawOperation);\n  const rawOperationCatalog = JSON.parse(await readFile(path.join(repositoryPath, D0046_OPERATION_CATALOG_CONFIG), 'utf8'));\n  const operationCatalog = normalizedOperationCatalog(rawOperationCatalog);\n  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid: sourceSha, scope: D0046_MCP_CONTEXT_SCOPE });\n`,
);
replaceOnce(
  deployer,
  `  const operationManifest = normalizedOperationManifest(rawOperation);\n  const base = await buildMcpTrialBaseTreeModule({\n`,
  `  const operationManifest = normalizedOperationManifest(rawOperation);\n  const rawOperationCatalog = JSON.parse(await readFile(path.join(repositoryPath, D0046_OPERATION_CATALOG_CONFIG), 'utf8'));\n  const operationCatalog = normalizedOperationCatalog(rawOperationCatalog);\n  const base = await buildMcpTrialBaseTreeModule({\n`,
);
// Every deploy/resume manifest construction already passes operationManifest on its own line.
// Add the catalog beside it; exact count is asserted to keep this repair source-bound.
{
  const source = read(deployer);
  const marker = `    operationManifest,\n`;
  const count = source.split(marker).length - 1;
  if (count !== 3) throw new Error(`${deployer}: expected 3 buildTrialManifests operationManifest sites, found ${count}`);
  write(deployer, source.split(marker).join(`    operationManifest,\n    operationCatalog,\n`));
}

const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nimport { digest } from '../src/canonical.mjs';\nimport { CaseEngine } from '../src/engine.mjs';\nimport { defineSemanticDevelopmentUnitPlan } from '../src/development-unit.mjs';\nimport {\n  DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,\n  developmentOperationDescriptor,\n  normalizeDevelopmentOperationCatalog,\n} from '../src/development-operation-catalog.mjs';\nimport { createMcpTrialOperationRequest } from '../src/mcp-trial-runner.mjs';\nimport { createMcpTrialLazyContextOwner } from '../qualification/mcp-trial-lazy-context-owner.mjs';\n\nconst catalog = normalizeDevelopmentOperationCatalog(JSON.parse(readFileSync(new URL('../config/development-operation-catalog.json', import.meta.url), 'utf8')));\nconst baseTree = { 'src/base.mjs': 'export const base = 1;\\n' };\nconst baseDigest = digest(baseTree);\nconst descriptor = developmentOperationDescriptor(catalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);\n\ntest('D0046 semantic runner request binds ChatGPT-authored compose and required validation', () => {\n  const plan = defineSemanticDevelopmentUnitPlan({\n    revisionId: 'repair-semantic-request',\n    baseTree,\n    repositoryCommitOid: 'a'.repeat(40),\n    contextReferenceId: 'ctx-repair',\n    operationCatalog: catalog,\n    operation: {\n      id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,\n      version: 1,\n      contractDigest: descriptor.contractDigest,\n      input: { baseDigest, writes: [{ path: 'src/base.mjs', content: 'export const base = 2;\\n' }] },\n    },\n  });\n  const engine = new CaseEngine({ caseId: 'repair-semantic-case', plan });\n  const view = { plan, caseContract: engine.caseContract, snapshot: engine.snapshot() };\n  const change = createMcpTrialOperationRequest(view, 'change', {}, null, catalog);\n  assert.equal(change.operation.id, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION);\n  assert.equal(change.baseDigest, baseDigest);\n  assert.equal(change.contextReferenceId, 'ctx-repair');\n  assert.equal(change.caseContract.contractDigest, engine.caseContract.contractDigest);\n\n  const candidateTreeDigest = digest({ candidate: 'repair-semantic' });\n  view.snapshot.taskStates.change = { state: 'succeeded', acceptedResult: { kind: 'changeset', baseDigest, writes: [], evidence: { candidateTreeDigest } } };\n  const validate = createMcpTrialOperationRequest(view, 'validate', {}, null, catalog);\n  assert.equal(validate.operation.id, catalog.policies.requiredValidation.operationId);\n  assert.equal(validate.policyId, catalog.policies.requiredValidation.policyId);\n  assert.equal(validate.bindingId, catalog.policies.requiredValidation.bindingId);\n  assert.equal(validate.candidateTreeDigest, candidateTreeDigest);\n});\n\ntest('D0046 generated lazy-context owner preserves bounded list/read/search shapes', async () => {\n  const content = 'alpha beta\\n';\n  const bytes = new TextEncoder().encode(content);\n  const lazy = {\n    tree: { 'src/base.mjs': content },\n    manifest: [{ path: 'src/base.mjs', mode: '100644', type: 'blob', blobOid: 'b'.repeat(40), byteLength: bytes.byteLength }],\n    manifestDigest: digest({ manifest: 'repair' }),\n    scopeDigest: digest({ scope: 'repair' }),\n    scope: { paths: ['src/base.mjs'], prefixes: [], maxFiles: 4, maxBytes: 4096, maxSearchResults: 4 },\n  };\n  const owner = createMcpTrialLazyContextOwner({ contextReference: 'ctx-repair', loadLazyContext: async () => lazy });\n  const listed = await owner.developmentContextList({ contextReference: 'ctx-repair' });\n  assert.equal(listed.entries.length, 1);\n  assert.equal(listed.complete, true);\n  const read = await owner.developmentContextRead({ contextReference: 'ctx-repair', path: 'src/base.mjs' });\n  assert.equal(read.content, content);\n  assert.equal(read.complete, true);\n  const searched = await owner.developmentContextSearch({ contextReference: 'ctx-repair', pattern: 'beta' });\n  assert.deepEqual(searched.matches, ['src/base.mjs']);\n  assert.equal(searched.complete, true);\n});\n`;
write('test/d0046-c2-owner-wiring.test.mjs', test);

console.log('D0046 C2 owner-wiring repair staged successfully');
