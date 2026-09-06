#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CaseAgentDriveAuthority,
  CaseRepository,
  ContractError,
  DevelopmentUnitRunner,
  GitRepositoryModelExecutor,
  LocalDevelopmentOperationRuntime,
  MemoryCaseAgentDriveStore,
  MemorySnapshotStore,
  createLocalDevelopmentAgent,
  defineDevelopmentUnitPlan,
  developmentOperationCapabilityId,
  digest,
  strictJsonParse,
} from '../src/index.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = '/data/data/com.termux/files/usr/tmp';
const CODEX_EXECUTABLE = '/data/data/com.termux/files/usr/bin/codex';
const NPM_EXECUTABLE = '/data/data/com.termux/files/usr/bin/npm';
const CODEX_HOME = process.env.CODEX_HOME ?? null;
const PRESERVED_PATHS = [
  'qualification/d0044-provider-response-loss-r22-resume.mjs',
  'qualification/d0044-provider-response-loss-r23-resume.mjs',
];

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

async function git(args, input = null) {
  const result = await runGitCommand({ repositoryPath: ROOT, args, input });
  if (result.code !== 0) fail('m0_git_failed', `Git ${args[0]} failed`, { exitCode: result.code, stderr: result.stderr.toString('utf8').slice(0, 4096) });
  return result.stdout;
}

async function gitState() {
  const head = (await git(['rev-parse', 'HEAD'])).toString('ascii').trim();
  const status = (await git(['status', '--porcelain=v1', '-z'])).toString('utf8');
  const trackedDiff = (await git(['diff', '--name-status'])).toString('utf8');
  const stagedDiff = (await git(['diff', '--cached', '--name-status'])).toString('utf8');
  return { head, status, trackedDiff, stagedDiff };
}

function parseStatus(status) {
  return status.split('\0').filter(Boolean).map((entry) => ({ code: entry.slice(0, 2), path: entry.slice(3) }));
}

async function assertM0Checkout() {
  const state = await gitState();
  const allowed = new Set(PRESERVED_PATHS.map((filePath) => `??:${filePath}`));
  for (const entry of parseStatus(state.status)) {
    if (entry.code !== '??' || !allowed.has(`??:${entry.path}`)) fail('m0_checkout_dirty', 'M0 requires no tracked/index mutation outside the preserved user files', { entry });
  }
  if (state.trackedDiff !== '' || state.stagedDiff !== '') fail('m0_checkout_dirty', 'M0 requires a clean tracked and index state');
  return state;
}

async function preservedFiles() {
  const result = {};
  for (const filePath of PRESERVED_PATHS) {
    const bytes = await readFile(path.join(ROOT, ...filePath.split('/')));
    result[filePath] = { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return result;
}

async function assertExecutable(filePath, label) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) fail('m0_executable_invalid', `${label} is not a regular file`);
  } catch (cause) { fail('m0_executable_missing', `${label} is unavailable`, {}, { cause }); }
}

async function assertDirectory(directoryPath, label) {
  try {
    const directoryStat = await stat(directoryPath);
    if (!directoryStat.isDirectory()) fail('m0_directory_invalid', `${label} is not a directory`);
  } catch (cause) { fail('m0_directory_missing', `${label} is unavailable`, {}, { cause }); }
}

async function workspaceEntries() {
  await mkdir(WORKSPACE_ROOT, { recursive: true, mode: 0o700 });
  return new Set((await readdir(WORKSPACE_ROOT)).filter((entry) => entry.startsWith('tdev-development-')));
}

async function main() {
  await assertExecutable(CODEX_EXECUTABLE, 'Codex executable');
  await assertExecutable(NPM_EXECUTABLE, 'npm executable');
  if (CODEX_HOME === null) fail('m0_codex_home_missing', 'CODEX_HOME must identify the saved-auth root for the physical M0 run');
  await assertDirectory(CODEX_HOME, 'Codex saved-auth root');
  const beforeCheckout = await assertM0Checkout();
  const preservedBefore = await preservedFiles();
  const commitOid = beforeCheckout.head;
  const manifest = strictJsonParse(await readFile(path.join(ROOT, 'config', 'development-operation-profiles.json')));
  const profileNames = {
    context: 'tdev.repository.context.prepare.v1',
    model: 'tdev.model.repository.execute.v1',
    validation: 'tdev.repository.validate.v1',
  };
  const capabilityByProfile = Object.fromEntries(Object.values(profileNames).map((profile) => [profile, developmentOperationCapabilityId(manifest, profile)]));
  const contextScope = {
    paths: [
      'config/codex-changeset-output.schema.json',
      'package.json',
      'src/lazy-plan-reference.mjs',
      'test/lazy-plan-reference.test.mjs',
    ],
    maxFiles: 8,
    maxBytes: 4 * 1024 * 1024,
    maxSearchResults: 16,
  };
  const lazyAdapter = new GitRepositoryModelExecutor({
    repositoryPath: ROOT,
    modelExecutable: CODEX_EXECUTABLE,
    timeoutMs: 300_000,
  });
  // The first manifest pass binds the complete exact repository without reading
  // any blob. The selected pass then decodes only the owner-issued text scope.
  const probe = await lazyAdapter.prepareLazyContext(commitOid, digest({ profile: 'tdev.m0.lazy-probe.v1', commitOid }), { scope: contextScope });
  const probeScoped = await lazyAdapter.materializeScopedContext(commitOid, digest({ profile: 'tdev.m0.lazy-probe.v1', commitOid }), { scope: contextScope });
  const repositoryBaseIdentity = probe.descriptor.repositoryBaseIdentity;
  const baseDigest = probeScoped.scopedBaseDigest;
  const lazyContext = await lazyAdapter.prepareLazyContext(commitOid, baseDigest, { scope: contextScope, repositoryBaseIdentity });
  const scopedContext = await lazyAdapter.materializeScopedContext(commitOid, baseDigest, { scope: contextScope, repositoryBaseIdentity });
  const baseTree = Object.fromEntries(scopedContext.files.map((file) => [file.path, file.content]));
  if (scopedContext.descriptor.baseDigest !== baseDigest) fail('m0_lazy_identity_invalid', 'Scoped context did not rebind its semantic base digest');
  const scopedContextAdapter = {
    materializeContext: (boundCommit, boundDigest, options = {}) => lazyAdapter.materializeScopedContext(boundCommit, boundDigest, {
      ...options,
      scope: contextScope,
      repositoryBaseIdentity,
    }),
  };
  const capabilities = Object.values(capabilityByProfile).sort();
  const caseContract = { caseGrant: capabilities, workspacePolicy: capabilities };
  const workspaceBefore = await workspaceEntries();
  const operationRuntime = new LocalDevelopmentOperationRuntime({
    manifest,
    repositoryPath: ROOT,
    codexExecutable: CODEX_EXECUTABLE,
    codexHome: CODEX_HOME,
    outputSchemaPath: path.join(ROOT, 'config', 'codex-changeset-output.schema.json'),
    npmExecutable: NPM_EXECUTABLE,
    workspaceRoot: WORKSPACE_ROOT,
    contextAdapter: scopedContextAdapter,
  });
  const agent = createLocalDevelopmentAgent({ operationRuntime, agentId: 'agent-tdev-m0', executorId: 'executor-tdev-m0' });
  const repository = new CaseRepository(new MemorySnapshotStore());
  const driveAuthority = new CaseAgentDriveAuthority({ store: new MemoryCaseAgentDriveStore() });
  const runner = new DevelopmentUnitRunner({ repository, driveAuthority, agent, operationManifest: manifest, caseContract, capacity: 1 });
  const caseId = `case-m0-${commitOid.slice(0, 12)}`;
  const driveRequestId = `drive-m0-${commitOid.slice(0, 12)}`;
  const plan = defineDevelopmentUnitPlan({
    revisionId: `m0-physical-${commitOid.slice(0, 12)}`,
    baseTree,
    repositoryCommitOid: commitOid,
    objectFormat: 'sha1',
    contextProfile: 'tdev.repository.context.prepare.lazy.v1',
    contextScope,
    baseIdentity: scopedContext.descriptor.baseIdentity,
    repositoryBaseIdentity,
    instruction: 'Implement one minimal non-documentation source objective. In src/lazy-plan-reference.mjs export a new constant named M0_PHYSICAL_EXECUTION_PROFILE with the exact value tdev.m0.physical-execution.v1, and add a focused node:test in test/lazy-plan-reference.test.mjs asserting that exact value. Do not modify docs, config, WORKBOARD, package metadata, user files, or existing behavior. Return only complete relative-path replacements in the supplied ChangeSet schema.',
    contextCapabilityId: capabilityByProfile[profileNames.context],
    modelCapabilityId: capabilityByProfile[profileNames.model],
    validationCapabilityId: capabilityByProfile[profileNames.validation],
    writePaths: ['src/lazy-plan-reference.mjs', 'test/lazy-plan-reference.test.mjs'],
    caseContract,
  });
  let candidate = null;
  try {
    await runner.create({ caseId, plan, driveRequestId, payload: { objective: 'm0-physical-source-change' } });
    const driven = await runner.drive({ caseId, driveRequestId, payload: { objective: 'm0-physical-source-change' } });
    if (driven.classification !== 'accepted') {
      const failedSnapshot = await repository.store.load(caseId);
      const taskOutcomes = Object.fromEntries(Object.entries(failedSnapshot.taskStates).map(([taskId, state]) => [taskId, {
        state: state.state,
        errorCode: state.error?.code ?? null,
        errorCertainty: state.error?.certainty ?? null,
      }]));
      fail('m0_case_not_accepted', 'M0 development unit did not reach accepted terminal state', {
        classification: driven.classification,
        caseState: failedSnapshot.caseState,
        caseRevision: failedSnapshot.caseRevision,
        taskOutcomes,
      });
    }
    candidate = await runner.candidate(caseId);
    const snapshot = await repository.store.load(caseId);
    const modelResult = snapshot.taskStates.model.acceptedResult;
    const validationResult = snapshot.taskStates.validate.acceptedResult;
    if (candidate.caseState !== 'succeeded' || validationResult?.passed !== true) fail('m0_validation_failed', 'M0 candidate did not pass fixed npm validation', { caseState: candidate.caseState, validation: validationResult });
    if (candidate.repositoryBaseIdentity?.baseDigest !== repositoryBaseIdentity.baseDigest || candidate.repositoryBaseIdentity?.manifestDigest !== repositoryBaseIdentity.manifestDigest) {
      fail('m0_repository_identity_missing', 'M0 candidate did not retain the complete repository base identity');
    }
    if (modelResult?.evidence?.processStarts !== 1 || modelResult?.evidence?.processReuses !== 0) fail('m0_process_identity_invalid', 'M0 must record one fresh outer Codex process', { evidence: modelResult?.evidence ?? null });
    if (!candidate.canonicalTree['src/lazy-plan-reference.mjs']?.includes('M0_PHYSICAL_EXECUTION_PROFILE') || !candidate.canonicalTree['test/lazy-plan-reference.test.mjs']?.includes('tdev.m0.physical-execution.v1')) fail('m0_objective_missing', 'M0 candidate does not contain the requested source objective');
    for (const filePath of new Set([...Object.keys(baseTree), ...Object.keys(candidate.canonicalTree)])) {
      if (filePath.startsWith('docs/') && candidate.canonicalTree[filePath] !== baseTree[filePath]) fail('m0_documentation_only_or_leak', 'M0 candidate unexpectedly writes documentation', { filePath });
    }
    const runtimeCandidateDigest = modelResult?.evidence?.candidateTreeDigest ?? candidate.canonicalDigest;
    if (candidate.candidateCleanup?.cleanupComplete !== true || candidate.candidateCleanup?.positiveAbsence !== true) {
      fail('m0_candidate_cleanup_missing', 'M0 candidate cleanup did not return a positive absence receipt', { candidateCleanup: candidate.candidateCleanup ?? null });
    }
    if (operationRuntime.candidate(runtimeCandidateDigest) !== null) fail('m0_candidate_cleanup_missing', 'M0 runtime retained a candidate after validation');
    await operationRuntime.dispose();
    try { await stat(runtimeCandidate.candidateRoot); fail('m0_candidate_cleanup_missing', 'M0 candidate workspace remained after disposal'); }
    catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
    const workspaceAfter = await workspaceEntries();
    for (const entry of workspaceAfter) if (!workspaceBefore.has(entry)) fail('m0_workspace_cleanup_missing', 'M0 left a disposable workspace behind', { entry });
    const afterCheckout = await assertM0Checkout();
    if (JSON.stringify(afterCheckout) !== JSON.stringify(beforeCheckout)) fail('m0_canonical_checkout_mutated', 'M0 changed the canonical checkout, index or ref');
    const preservedAfter = await preservedFiles();
    if (JSON.stringify(preservedAfter) !== JSON.stringify(preservedBefore)) fail('m0_user_files_changed', 'M0 changed a preserved user file');
    const serializedFrames = JSON.stringify(agent.emitted);
    if (serializedFrames.includes(CODEX_HOME) || /Bearer\s+[A-Za-z0-9._-]{8,}/iu.test(serializedFrames) || /sk-[A-Za-z0-9]{20,}/u.test(serializedFrames)) fail('m0_credential_leak', 'M0 emitted evidence contains credential material or auth root');
    process.stdout.write(`${JSON.stringify({ profile: 'tdev.d0043.m0-physical-termux.v1', status: 'PASS', repositoryCommitOid: commitOid, baseDigest, repositoryBaseDigest: repositoryBaseIdentity.baseDigest, manifestDigest: repositoryBaseIdentity.manifestDigest, scopeDigest: scopedContext.descriptor.scopeDigest, caseId, candidateDigest: candidate.canonicalDigest, modelProcessStarts: modelResult.evidence.processStarts, validationPassed: validationResult.passed, emittedFrames: agent.emitted.length })}\n`);
  } finally {
    await operationRuntime.dispose().catch(() => {});
  }
}

main().catch((cause) => {
  process.stderr.write(`${JSON.stringify({ profile: 'tdev.d0043.m0-physical-termux.v1', status: 'FAIL', code: cause?.code ?? 'm0_failed', message: cause?.message ?? String(cause), details: cause?.details ?? null })}\n`);
  process.exitCode = 1;
});
