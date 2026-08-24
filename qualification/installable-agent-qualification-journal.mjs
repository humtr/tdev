import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  compareText,
  publicJsonClone,
  strictJsonParse,
  typedDigest,
} from '../src/canonical.mjs';
import {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_RUN_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  normalizeQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
  resourceClaimKey,
} from './installable-agent-qualification-r3.mjs';

export const QUALIFICATION_STORE_PROFILE = 'tdev.installable-agent-qualification-store.v1';
export const QUALIFICATION_CONTROLLER_PROFILE = 'tdev.installable-agent-qualification-controller.v1';
const CLAIM_BUCKET_PROFILE = 'tdev.installable-agent-qualification-claim-bucket.v1';
const TOMBSTONE_PROFILE = 'tdev.installable-agent-qualification-tombstone.v1';
const STORE_MAX_BYTES = 8 * 1024 * 1024;

const RUN_STATES = Object.freeze([
  'PREPARED', 'DISPATCHED', 'RECONCILING', 'TERMINAL_NOT_ADMITTED', 'TERMINAL_APPLIED',
  'TERMINAL_CONFLICT', 'CLEANUP_PENDING', 'CLEAN',
]);
const TERMINAL_STATES = new Set(['TERMINAL_NOT_ADMITTED', 'TERMINAL_APPLIED', 'TERMINAL_CONFLICT']);
const LEGAL_TRANSITIONS = new Map([
  ['PREPARED', new Set(['DISPATCHED'])],
  ['DISPATCHED', new Set(['RECONCILING'])],
  ['RECONCILING', new Set(['RECONCILING', 'TERMINAL_NOT_ADMITTED', 'TERMINAL_APPLIED', 'TERMINAL_CONFLICT'])],
  ['TERMINAL_NOT_ADMITTED', new Set(['CLEANUP_PENDING'])],
  ['TERMINAL_APPLIED', new Set(['CLEANUP_PENDING'])],
  ['TERMINAL_CONFLICT', new Set(['CLEANUP_PENDING'])],
  ['CLEANUP_PENDING', new Set(['CLEAN'])],
  ['CLEAN', new Set()],
]);
const TERMINAL_OUTCOME = Object.freeze({
  TERMINAL_NOT_ADMITTED: 'POSITIVE_NOT_ADMITTED',
  TERMINAL_APPLIED: 'POSITIVE_APPLIED',
  TERMINAL_CONFLICT: 'POSITIVE_CONFLICT',
});
const NONTERMINAL_RECONCILIATION = new Set(['ADMITTED_IN_PROGRESS', 'STILL_AMBIGUOUS']);

function runKey(runId, generation) { return `${runId}:${generation}`; }
function boundedString(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new ContractError('invalid_qualification_journal', `${label} is invalid`);
  }
  return value;
}
function assertMode(mode) {
  if (mode !== 'shared_read' && mode !== 'exclusive_mutation') {
    throw new ContractError('invalid_qualification_claim', 'Claim mode must be shared_read or exclusive_mutation');
  }
  return mode;
}
function assertState(state) {
  if (!RUN_STATES.includes(state)) throw new ContractError('invalid_qualification_run', 'Unknown qualification run state');
  return state;
}
function runRecordDigest(run) { return typedDigest(QUALIFICATION_RUN_PROFILE, run); }
export function qualificationRunRecordDigest(run) { validateRun(run); return runRecordDigest(run); }

function freshStore(genesisEvidenceDigest) {
  return {
    profile: QUALIFICATION_STORE_PROFILE,
    schemaVersion: 1,
    genesisEvidenceDigest,
    revision: 1,
    journalSequence: 0,
    mutationController: null,
    controllerHighWater: 0,
    runs: {},
    claims: {},
    claimHighWater: {},
    tombstones: {},
  };
}

function validateController(value) {
  assertRecordShape(value, [
    'profile', 'controllerIdentityDigest', 'controllerGeneration', 'predecessorControllerIdentityDigest',
    'predecessorExclusionEvidenceDigest', 'journalSequence',
  ], [], 'qualification mutation controller');
  if (value.profile !== QUALIFICATION_CONTROLLER_PROFILE) throw new ContractError('corrupt_qualification_store', 'Unsupported controller profile');
  assertDigest(value.controllerIdentityDigest, 'controllerIdentityDigest');
  assertSafeInteger(value.controllerGeneration, 'controllerGeneration', { min: 1 });
  if (value.predecessorControllerIdentityDigest !== null) assertDigest(value.predecessorControllerIdentityDigest, 'predecessorControllerIdentityDigest');
  if (value.predecessorExclusionEvidenceDigest !== null) assertDigest(value.predecessorExclusionEvidenceDigest, 'predecessorExclusionEvidenceDigest');
  assertSafeInteger(value.journalSequence, 'controller.journalSequence', { min: 0 });
}

function validateClaimRecord(value, resourceKeyValue) {
  assertRecordShape(value, [
    'profile', 'resourceKey', 'resourceType', 'resourceIdentity', 'mode', 'claimGeneration',
    'qualificationRunId', 'runGeneration', 'controllerIdentityDigest',
  ], [], 'qualification claim');
  if (value.profile !== QUALIFICATION_CLAIM_PROFILE) throw new ContractError('corrupt_qualification_store', 'Unsupported claim profile');
  assertDigest(value.resourceKey, 'claim.resourceKey');
  if (value.resourceKey !== resourceKeyValue || resourceClaimKey(value.resourceType, value.resourceIdentity) !== value.resourceKey) {
    throw new ContractError('corrupt_qualification_store', 'Claim resource identity does not match its key');
  }
  assertMode(value.mode);
  assertSafeInteger(value.claimGeneration, 'claimGeneration', { min: 1 });
  assertIdentifier(value.qualificationRunId, 'qualificationRunId');
  assertSafeInteger(value.runGeneration, 'runGeneration', { min: 1 });
  assertDigest(value.controllerIdentityDigest, 'claim.controllerIdentityDigest');
}

function validateClaimBucket(value, resourceKeyValue) {
  assertRecordShape(value, ['profile', 'resourceKey', 'holders'], [], 'qualification claim bucket');
  if (value.profile !== CLAIM_BUCKET_PROFILE || value.resourceKey !== resourceKeyValue) {
    throw new ContractError('corrupt_qualification_store', 'Claim bucket identity mismatch');
  }
  assertDigest(value.resourceKey, 'claim bucket resourceKey');
  if (!Array.isArray(value.holders) || value.holders.length === 0) throw new ContractError('corrupt_qualification_store', 'Claim bucket must have holders');
  let previous = 0;
  let exclusive = 0;
  for (const holder of value.holders) {
    validateClaimRecord(holder, resourceKeyValue);
    if (holder.claimGeneration <= previous) throw new ContractError('corrupt_qualification_store', 'Claim holders must be ordered by unique generation');
    previous = holder.claimGeneration;
    if (holder.mode === 'exclusive_mutation') exclusive += 1;
  }
  if (exclusive > 1 || (exclusive === 1 && value.holders.length !== 1)) {
    throw new ContractError('corrupt_qualification_store', 'Exclusive claim must be the sole resource holder');
  }
}

function validateRun(value) {
  assertRecordShape(value, [
    'profile', 'qualificationRunId', 'runGeneration', 'controllerIdentityDigest', 'journalSequence', 'state',
    'target', 'targetDigest', 'stableMutationIdentityDigest', 'intendedOperation', 'authoritativeRereadDigest',
    'predecessorRecordDigest', 'reconciliationOutcome', 'cleanupEvidenceDigest', 'predecessorExclusionEvidenceDigest', 'claims',
  ], [], 'qualification run');
  if (value.profile !== QUALIFICATION_RUN_PROFILE) throw new ContractError('corrupt_qualification_store', 'Unsupported qualification run profile');
  assertIdentifier(value.qualificationRunId, 'qualificationRunId');
  assertSafeInteger(value.runGeneration, 'runGeneration', { min: 1 });
  assertDigest(value.controllerIdentityDigest, 'run.controllerIdentityDigest');
  assertSafeInteger(value.journalSequence, 'run.journalSequence', { min: 0 });
  assertState(value.state);
  const target = normalizeQualificationDeploymentIdentity(value.target);
  assertDigest(value.targetDigest, 'targetDigest');
  if (qualificationDeploymentIdentityDigest(target) !== value.targetDigest) throw new ContractError('corrupt_qualification_store', 'Run target digest mismatch');
  assertDigest(value.stableMutationIdentityDigest, 'stableMutationIdentityDigest');
  boundedString(value.intendedOperation, 'intendedOperation', 256);
  assertDigest(value.authoritativeRereadDigest, 'authoritativeRereadDigest');
  if (value.predecessorRecordDigest !== null) assertDigest(value.predecessorRecordDigest, 'predecessorRecordDigest');
  if (value.cleanupEvidenceDigest !== null) assertDigest(value.cleanupEvidenceDigest, 'cleanupEvidenceDigest');
  if (value.predecessorExclusionEvidenceDigest !== null) assertDigest(value.predecessorExclusionEvidenceDigest, 'predecessorExclusionEvidenceDigest');
  if (value.reconciliationOutcome !== null && typeof value.reconciliationOutcome !== 'string') throw new ContractError('corrupt_qualification_store', 'Invalid reconciliation outcome');
  if (!Array.isArray(value.claims) || value.claims.length === 0) throw new ContractError('corrupt_qualification_store', 'Run must retain claims');
  let previous = '';
  for (const claim of value.claims) {
    assertRecordShape(claim, ['resourceKey', 'claimGeneration', 'mode'], [], 'run claim reference');
    assertDigest(claim.resourceKey, 'run claim resourceKey');
    assertSafeInteger(claim.claimGeneration, 'run claimGeneration', { min: 1 });
    assertMode(claim.mode);
    const key = `${claim.resourceKey}:${String(claim.claimGeneration).padStart(16, '0')}`;
    if (previous !== '' && compareText(previous, key) >= 0) throw new ContractError('corrupt_qualification_store', 'Run claim references must be sorted and unique');
    previous = key;
  }
}

function validateTombstone(value, key) {
  assertRecordShape(value, [
    'profile', 'qualificationRunId', 'runGeneration', 'targetDigest', 'stableMutationIdentityDigest',
    'terminalOutcome', 'finalRecordDigest', 'journalSequenceHighWater', 'claimGenerations',
  ], [], 'qualification tombstone');
  if (value.profile !== TOMBSTONE_PROFILE || runKey(value.qualificationRunId, value.runGeneration) !== key) {
    throw new ContractError('corrupt_qualification_store', 'Qualification tombstone identity mismatch');
  }
  assertIdentifier(value.qualificationRunId, 'tombstone.qualificationRunId');
  assertSafeInteger(value.runGeneration, 'tombstone.runGeneration', { min: 1 });
  assertDigest(value.targetDigest, 'tombstone.targetDigest');
  assertDigest(value.stableMutationIdentityDigest, 'tombstone.stableMutationIdentityDigest');
  boundedString(value.terminalOutcome, 'tombstone.terminalOutcome', 128);
  assertDigest(value.finalRecordDigest, 'tombstone.finalRecordDigest');
  assertSafeInteger(value.journalSequenceHighWater, 'tombstone.journalSequenceHighWater', { min: 1 });
  if (!Array.isArray(value.claimGenerations)) throw new ContractError('corrupt_qualification_store', 'Tombstone claimGenerations must be an array');
  for (const item of value.claimGenerations) {
    assertRecordShape(item, ['resourceKey', 'claimGeneration'], [], 'tombstone claim generation');
    assertDigest(item.resourceKey, 'tombstone resourceKey');
    assertSafeInteger(item.claimGeneration, 'tombstone claimGeneration', { min: 1 });
  }
}

function validateStore(store) {
  assertRecordShape(store, [
    'profile', 'schemaVersion', 'genesisEvidenceDigest', 'revision', 'journalSequence', 'mutationController',
    'controllerHighWater', 'runs', 'claims', 'claimHighWater', 'tombstones',
  ], [], 'qualification store');
  if (store.profile !== QUALIFICATION_STORE_PROFILE || store.schemaVersion !== 1) throw new ContractError('unsupported_qualification_store', 'Unsupported qualification store profile/version');
  assertDigest(store.genesisEvidenceDigest, 'genesisEvidenceDigest');
  assertSafeInteger(store.revision, 'store.revision', { min: 1 });
  assertSafeInteger(store.journalSequence, 'store.journalSequence', { min: 0 });
  assertSafeInteger(store.controllerHighWater, 'store.controllerHighWater', { min: 0 });
  if (store.mutationController !== null) validateController(store.mutationController);
  for (const field of ['runs', 'claims', 'claimHighWater', 'tombstones']) {
    if (store[field] === null || typeof store[field] !== 'object' || Array.isArray(store[field])) throw new ContractError('corrupt_qualification_store', `${field} must be a record`);
  }
  for (const [key, run] of Object.entries(store.runs)) {
    validateRun(run);
    if (runKey(run.qualificationRunId, run.runGeneration) !== key) throw new ContractError('corrupt_qualification_store', 'Run map key mismatch');
  }
  let exclusiveController = null;
  for (const [resourceKeyValue, bucket] of Object.entries(store.claims)) {
    validateClaimBucket(bucket, resourceKeyValue);
    const highWater = store.claimHighWater[resourceKeyValue];
    assertSafeInteger(highWater, `claimHighWater.${resourceKeyValue}`, { min: 1 });
    for (const holder of bucket.holders) {
      if (holder.claimGeneration > highWater) throw new ContractError('corrupt_qualification_store', 'Claim generation exceeds high-water');
      const run = store.runs[runKey(holder.qualificationRunId, holder.runGeneration)];
      if (!run || run.controllerIdentityDigest !== holder.controllerIdentityDigest || !run.claims.some((item) => item.resourceKey === resourceKeyValue && item.claimGeneration === holder.claimGeneration && item.mode === holder.mode)) {
        throw new ContractError('corrupt_qualification_store', 'Live claim is not owned by its run');
      }
      if (holder.mode === 'exclusive_mutation') {
        exclusiveController ??= holder.controllerIdentityDigest;
        if (exclusiveController !== holder.controllerIdentityDigest) throw new ContractError('corrupt_qualification_store', 'Exclusive claims have multiple mutation controllers');
      }
    }
  }
  for (const [resourceKeyValue, highWater] of Object.entries(store.claimHighWater)) {
    assertDigest(resourceKeyValue, 'claimHighWater resourceKey');
    assertSafeInteger(highWater, `claimHighWater.${resourceKeyValue}`, { min: 1 });
  }
  for (const [key, tombstone] of Object.entries(store.tombstones)) validateTombstone(tombstone, key);
  if (exclusiveController !== null) {
    if (store.mutationController === null || store.mutationController.controllerIdentityDigest !== exclusiveController) {
      throw new ContractError('corrupt_qualification_store', 'Exclusive claim exists without its exact live mutation controller');
    }
  }
  if (store.mutationController !== null && store.mutationController.controllerGeneration > store.controllerHighWater) {
    throw new ContractError('corrupt_qualification_store', 'Controller generation exceeds high-water');
  }
  return store;
}

function normalizeClaims(claims) {
  if (!Array.isArray(claims) || claims.length === 0) throw new ContractError('invalid_qualification_claim', 'claims must be a non-empty array');
  const normalized = claims.map((claim, index) => {
    assertRecordShape(claim, ['resourceType', 'resourceIdentity', 'mode'], [], `claims[${index}]`);
    assertMode(claim.mode);
    const resourceKeyValue = resourceClaimKey(claim.resourceType, claim.resourceIdentity);
    return { ...publicJsonClone(claim), resourceKey: resourceKeyValue };
  }).sort((left, right) => compareText(left.resourceKey, right.resourceKey));
  if (new Set(normalized.map((claim) => claim.resourceKey)).size !== normalized.length) throw new ContractError('invalid_qualification_claim', 'Duplicate resource claim');
  return normalized;
}

function runHasExclusiveClaim(run) { return run.claims.some((claim) => claim.mode === 'exclusive_mutation'); }

export class FileQualificationJournal {
  constructor(root) {
    if (typeof root !== 'string' || root.length === 0 || root.includes('\0')) throw new ContractError('invalid_qualification_store', 'Journal root is invalid');
    this.root = path.resolve(root);
    this.statePath = path.join(this.root, 'state.json');
    this.lockPath = path.join(this.root, 'mutation.lock');
  }

  async createGenesis({ genesisEvidenceDigest }) {
    assertDigest(genesisEvidenceDigest, 'genesisEvidenceDigest');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    let lock;
    try { lock = await fs.open(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error?.code === 'EEXIST') throw new ContractError('qualification_controller_busy', 'Qualification journal mutation lock exists; no automatic takeover is allowed');
      throw error;
    }
    try {
      const store = freshStore(genesisEvidenceDigest);
      validateStore(store);
      await this.#writeExclusive(this.statePath, store);
      await this.#syncRoot();
      return publicJsonClone(store);
    } catch (error) {
      if (error?.code === 'EEXIST') throw new ContractError('qualification_store_already_exists', 'Qualification store already exists');
      throw error;
    } finally {
      await lock.close();
      await fs.unlink(this.lockPath).catch(() => {});
      await this.#syncRoot().catch(() => {});
    }
  }

  async read() {
    let bytes;
    try { bytes = await fs.readFile(this.statePath); }
    catch (error) { throw new ContractError('qualification_store_unavailable', 'Qualification store is missing or unreadable', {}, { cause: error }); }
    let store;
    try { store = strictJsonParse(bytes, { maxBytes: STORE_MAX_BYTES }); }
    catch (error) { throw new ContractError('corrupt_qualification_store', 'Qualification store JSON is invalid', {}, { cause: error }); }
    validateStore(store);
    if (`${canonicalJson(store)}\n` !== bytes.toString('utf8')) throw new ContractError('noncanonical_qualification_store', 'Qualification store bytes are not canonical');
    return publicJsonClone(store);
  }

  async clearRetainedWriterLock({ expectedStoreRevision, predecessorExclusionEvidenceDigest }) {
    assertSafeInteger(expectedStoreRevision, 'expectedStoreRevision', { min: 1 });
    assertDigest(predecessorExclusionEvidenceDigest, 'predecessorExclusionEvidenceDigest');
    const store = await this.read();
    if (store.revision !== expectedStoreRevision) {
      throw new ContractError('qualification_store_conflict', 'Qualification store revision CAS mismatch before explicit retained-lock recovery', {
        expectedStoreRevision,
        actualStoreRevision: store.revision,
      });
    }
    let stat;
    try { stat = await fs.lstat(this.lockPath); }
    catch (error) {
      if (error?.code === 'ENOENT') throw new ContractError('qualification_writer_lock_missing', 'No retained qualification writer lock exists');
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ContractError('qualification_writer_lock_invalid', 'Retained qualification writer lock is not a regular file');
    await fs.unlink(this.lockPath);
    await this.#syncRoot();
    return Object.freeze({
      classification: 'retained_writer_lock_cleared_after_positive_exclusion',
      storeRevision: store.revision,
      predecessorExclusionEvidenceDigest,
    });
  }

  async acquireMutationController({ controllerIdentityDigest, expectedStoreRevision }) {
    assertDigest(controllerIdentityDigest, 'controllerIdentityDigest');
    return this.#withMutation(expectedStoreRevision, (store) => {
      if (store.mutationController !== null) throw new ContractError('qualification_controller_busy', 'A mutation controller already owns the qualification lane');
      const controllerGeneration = store.controllerHighWater + 1;
      store.controllerHighWater = controllerGeneration;
      store.journalSequence += 1;
      store.mutationController = {
        profile: QUALIFICATION_CONTROLLER_PROFILE,
        controllerIdentityDigest,
        controllerGeneration,
        predecessorControllerIdentityDigest: null,
        predecessorExclusionEvidenceDigest: null,
        journalSequence: store.journalSequence,
      };
      return store;
    });
  }

  async admitSuccessorMutationController({
    expectedStoreRevision,
    expectedControllerIdentityDigest,
    successorControllerIdentityDigest,
    predecessorExclusionEvidenceDigest,
    predecessorRuns,
  }) {
    assertDigest(expectedControllerIdentityDigest, 'expectedControllerIdentityDigest');
    assertDigest(successorControllerIdentityDigest, 'successorControllerIdentityDigest');
    assertDigest(predecessorExclusionEvidenceDigest, 'predecessorExclusionEvidenceDigest');
    if (successorControllerIdentityDigest === expectedControllerIdentityDigest) throw new ContractError('qualification_controller_conflict', 'Successor controller must have a distinct identity');
    if (!Array.isArray(predecessorRuns)) throw new ContractError('qualification_predecessor_exclusion_incomplete', 'predecessorRuns must enumerate exact mutation obligations');
    return this.#withMutation(expectedStoreRevision, (store) => {
      const current = store.mutationController;
      if (current === null || current.controllerIdentityDigest !== expectedControllerIdentityDigest) throw new ContractError('qualification_controller_conflict', 'Mutation controller predecessor mismatch');
      const actual = Object.entries(store.runs)
        .filter(([, run]) => run.controllerIdentityDigest === expectedControllerIdentityDigest && runHasExclusiveClaim(run))
        .map(([key, run]) => ({ runKey: key, runRecordDigest: runRecordDigest(run) }))
        .sort((left, right) => compareText(left.runKey, right.runKey));
      const supplied = predecessorRuns.map((item, index) => {
        assertRecordShape(item, ['runKey', 'runRecordDigest'], [], `predecessorRuns[${index}]`);
        boundedString(item.runKey, `predecessorRuns[${index}].runKey`, 256);
        assertDigest(item.runRecordDigest, `predecessorRuns[${index}].runRecordDigest`);
        return publicJsonClone(item);
      }).sort((left, right) => compareText(left.runKey, right.runKey));
      if (canonicalJson(actual) !== canonicalJson(supplied)) throw new ContractError('qualification_predecessor_exclusion_incomplete', 'Positive predecessor exclusion is not bound to every exact live mutation run');
      const controllerGeneration = store.controllerHighWater + 1;
      store.controllerHighWater = controllerGeneration;
      store.journalSequence += 1;
      store.mutationController = {
        profile: QUALIFICATION_CONTROLLER_PROFILE,
        controllerIdentityDigest: successorControllerIdentityDigest,
        controllerGeneration,
        predecessorControllerIdentityDigest: expectedControllerIdentityDigest,
        predecessorExclusionEvidenceDigest,
        journalSequence: store.journalSequence,
      };
      for (const { runKey: key } of actual) {
        const run = store.runs[key];
        const predecessorRecordDigest = runRecordDigest(run);
        store.runs[key] = {
          ...run,
          controllerIdentityDigest: successorControllerIdentityDigest,
          journalSequence: store.journalSequence,
          predecessorRecordDigest,
          predecessorExclusionEvidenceDigest,
        };
      }
      for (const bucket of Object.values(store.claims)) {
        bucket.holders = bucket.holders.map((holder) => holder.controllerIdentityDigest === expectedControllerIdentityDigest && holder.mode === 'exclusive_mutation'
          ? { ...holder, controllerIdentityDigest: successorControllerIdentityDigest }
          : holder);
      }
      return store;
    });
  }

  async releaseMutationController({ controllerIdentityDigest, expectedStoreRevision }) {
    assertDigest(controllerIdentityDigest, 'controllerIdentityDigest');
    return this.#withMutation(expectedStoreRevision, (store) => {
      if (store.mutationController === null || store.mutationController.controllerIdentityDigest !== controllerIdentityDigest) {
        throw new ContractError('qualification_controller_conflict', 'Mutation controller identity mismatch');
      }
      const liveExclusive = Object.values(store.runs).some((run) => runHasExclusiveClaim(run));
      if (liveExclusive) throw new ContractError('qualification_controller_busy', 'Mutation controller cannot be released while exclusive qualification obligations survive');
      store.journalSequence += 1;
      store.mutationController = null;
      return store;
    });
  }

  async prepareRun({
    expectedStoreRevision,
    qualificationRunId,
    runGeneration,
    controllerIdentityDigest,
    target,
    stableMutationIdentityDigest,
    intendedOperation,
    authoritativeRereadDigest,
    claims,
  }) {
    assertIdentifier(qualificationRunId, 'qualificationRunId');
    assertSafeInteger(runGeneration, 'runGeneration', { min: 1 });
    assertDigest(controllerIdentityDigest, 'controllerIdentityDigest');
    assertDigest(stableMutationIdentityDigest, 'stableMutationIdentityDigest');
    boundedString(intendedOperation, 'intendedOperation', 256);
    assertDigest(authoritativeRereadDigest, 'authoritativeRereadDigest');
    const normalizedTarget = normalizeQualificationDeploymentIdentity(target);
    const targetDigest = qualificationDeploymentIdentityDigest(normalizedTarget);
    const normalizedClaims = normalizeClaims(claims);
    const mutationRequired = !READ_ONLY_QUALIFICATION_OPERATIONS.has(intendedOperation) || normalizedClaims.some((claim) => claim.mode === 'exclusive_mutation');
    if (mutationRequired && !normalizedClaims.some((claim) => claim.resourceType === QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE && claim.resourceIdentity === QUALIFICATION_GLOBAL_MUTATION_RESOURCE && claim.mode === 'exclusive_mutation')) {
      throw new ContractError('qualification_mutation_lane_missing', 'Mutation run must claim the global qualification mutation lane exclusively');
    }
    return this.#withMutation(expectedStoreRevision, (store) => {
      const key = runKey(qualificationRunId, runGeneration);
      if (store.runs[key] !== undefined || store.tombstones[key] !== undefined) throw new ContractError('qualification_run_conflict', 'Qualification run identity is already retained');
      if (mutationRequired && (store.mutationController === null || store.mutationController.controllerIdentityDigest !== controllerIdentityDigest)) {
        throw new ContractError('qualification_controller_conflict', 'Exact live mutation controller is required before PREPARED');
      }
      for (const claim of normalizedClaims) {
        const bucket = store.claims[claim.resourceKey];
        if (bucket !== undefined && (claim.mode === 'exclusive_mutation' || bucket.holders.some((holder) => holder.mode === 'exclusive_mutation'))) {
          throw new ContractError('qualification_claim_conflict', 'Requested resource conflicts with a live claim', { resourceKey: claim.resourceKey });
        }
      }
      const claimRecords = [];
      for (const claim of normalizedClaims) {
        const claimGeneration = (store.claimHighWater[claim.resourceKey] ?? 0) + 1;
        store.claimHighWater[claim.resourceKey] = claimGeneration;
        const record = {
          profile: QUALIFICATION_CLAIM_PROFILE,
          resourceKey: claim.resourceKey,
          resourceType: claim.resourceType,
          resourceIdentity: claim.resourceIdentity,
          mode: claim.mode,
          claimGeneration,
          qualificationRunId,
          runGeneration,
          controllerIdentityDigest,
        };
        const bucket = store.claims[claim.resourceKey] ?? { profile: CLAIM_BUCKET_PROFILE, resourceKey: claim.resourceKey, holders: [] };
        bucket.holders.push(record);
        bucket.holders.sort((left, right) => left.claimGeneration - right.claimGeneration);
        store.claims[claim.resourceKey] = bucket;
        claimRecords.push(record);
      }
      store.journalSequence += 1;
      store.runs[key] = {
        profile: QUALIFICATION_RUN_PROFILE,
        qualificationRunId,
        runGeneration,
        controllerIdentityDigest,
        journalSequence: store.journalSequence,
        state: 'PREPARED',
        target: publicJsonClone(normalizedTarget),
        targetDigest,
        stableMutationIdentityDigest,
        intendedOperation,
        authoritativeRereadDigest,
        predecessorRecordDigest: null,
        reconciliationOutcome: null,
        cleanupEvidenceDigest: null,
        predecessorExclusionEvidenceDigest: null,
        claims: claimRecords
          .map((record) => ({ resourceKey: record.resourceKey, claimGeneration: record.claimGeneration, mode: record.mode }))
          .sort((left, right) => compareText(left.resourceKey, right.resourceKey) || left.claimGeneration - right.claimGeneration),
      };
      return store;
    });
  }

  async transitionRun({
    expectedStoreRevision,
    qualificationRunId,
    runGeneration,
    controllerIdentityDigest,
    expectedRunRecordDigest,
    nextState,
    reconciliationOutcome = null,
    cleanupEvidenceDigest = null,
  }) {
    assertIdentifier(qualificationRunId, 'qualificationRunId');
    assertSafeInteger(runGeneration, 'runGeneration', { min: 1 });
    assertDigest(controllerIdentityDigest, 'controllerIdentityDigest');
    assertDigest(expectedRunRecordDigest, 'expectedRunRecordDigest');
    assertState(nextState);
    if (cleanupEvidenceDigest !== null) assertDigest(cleanupEvidenceDigest, 'cleanupEvidenceDigest');
    return this.#withMutation(expectedStoreRevision, (store) => {
      const key = runKey(qualificationRunId, runGeneration);
      const current = store.runs[key];
      if (current === undefined) throw new ContractError('qualification_run_missing', 'Qualification run is not live');
      if (current.controllerIdentityDigest !== controllerIdentityDigest) throw new ContractError('qualification_controller_conflict', 'Run controller identity mismatch');
      if (runHasExclusiveClaim(current) && (store.mutationController === null || store.mutationController.controllerIdentityDigest !== controllerIdentityDigest)) {
        throw new ContractError('qualification_controller_conflict', 'Stale controller cannot mutate an exclusive qualification run');
      }
      if (runRecordDigest(current) !== expectedRunRecordDigest) throw new ContractError('qualification_run_conflict', 'Run record predecessor digest mismatch');
      if (!LEGAL_TRANSITIONS.get(current.state)?.has(nextState)) throw new ContractError('qualification_transition_invalid', `Illegal qualification transition ${current.state} -> ${nextState}`);
      if (current.state === 'DISPATCHED' && nextState === 'RECONCILING') {
        if (!NONTERMINAL_RECONCILIATION.has(reconciliationOutcome)) throw new ContractError('qualification_reconciliation_incomplete', 'DISPATCHED must enter RECONCILING with an explicit nonterminal outcome');
      } else if (current.state === 'RECONCILING' && nextState === 'RECONCILING') {
        if (!NONTERMINAL_RECONCILIATION.has(reconciliationOutcome)) throw new ContractError('qualification_reconciliation_incomplete', 'Ambiguous reconciliation must remain explicitly nonterminal');
      } else if (TERMINAL_STATES.has(nextState)) {
        if (reconciliationOutcome !== TERMINAL_OUTCOME[nextState]) throw new ContractError('qualification_reconciliation_incomplete', 'Terminal qualification state requires its positive authoritative outcome');
      } else if (reconciliationOutcome !== null) {
        throw new ContractError('qualification_transition_invalid', 'Reconciliation outcome is not legal for this transition');
      }
      if (nextState === 'CLEAN' && cleanupEvidenceDigest === null) throw new ContractError('qualification_cleanup_unproven', 'CLEAN requires positive cleanup evidence');
      if (nextState !== 'CLEAN' && cleanupEvidenceDigest !== null) throw new ContractError('qualification_transition_invalid', 'Cleanup evidence is accepted only on CLEAN');
      store.journalSequence += 1;
      const next = {
        ...current,
        journalSequence: store.journalSequence,
        state: nextState,
        predecessorRecordDigest: expectedRunRecordDigest,
        reconciliationOutcome: TERMINAL_STATES.has(nextState) || nextState === 'RECONCILING' ? reconciliationOutcome : current.reconciliationOutcome,
        cleanupEvidenceDigest: nextState === 'CLEAN' ? cleanupEvidenceDigest : current.cleanupEvidenceDigest,
      };
      validateRun(next);
      if (nextState !== 'CLEAN') {
        store.runs[key] = next;
        return store;
      }
      for (const claim of current.claims) {
        const bucket = store.claims[claim.resourceKey];
        if (bucket === undefined) throw new ContractError('qualification_claim_conflict', 'Claim disappeared before CLEAN');
        const index = bucket.holders.findIndex((holder) => holder.qualificationRunId === qualificationRunId && holder.runGeneration === runGeneration && holder.claimGeneration === claim.claimGeneration && holder.controllerIdentityDigest === controllerIdentityDigest);
        if (index < 0) throw new ContractError('qualification_claim_conflict', 'Claim owner/generation changed before CLEAN');
        bucket.holders.splice(index, 1);
        if (bucket.holders.length === 0) delete store.claims[claim.resourceKey];
      }
      store.tombstones[key] = {
        profile: TOMBSTONE_PROFILE,
        qualificationRunId,
        runGeneration,
        targetDigest: current.targetDigest,
        stableMutationIdentityDigest: current.stableMutationIdentityDigest,
        terminalOutcome: current.reconciliationOutcome,
        finalRecordDigest: runRecordDigest(next),
        journalSequenceHighWater: store.journalSequence,
        claimGenerations: current.claims.map((claim) => ({ resourceKey: claim.resourceKey, claimGeneration: claim.claimGeneration })),
      };
      delete store.runs[key];
      return store;
    });
  }

  async listObligations() {
    const store = await this.read();
    return Object.values(store.runs)
      .sort((left, right) => compareText(left.qualificationRunId, right.qualificationRunId) || left.runGeneration - right.runGeneration)
      .map((run) => publicJsonClone(run));
  }

  async #withMutation(expectedStoreRevision, callback) {
    assertSafeInteger(expectedStoreRevision, 'expectedStoreRevision', { min: 1 });
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    let lock;
    try { lock = await fs.open(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error?.code === 'EEXIST') throw new ContractError('qualification_controller_busy', 'Qualification journal mutation lock exists; no automatic takeover is allowed');
      throw error;
    }
    try {
      const store = await this.read();
      if (store.revision !== expectedStoreRevision) throw new ContractError('qualification_store_conflict', 'Qualification store revision CAS mismatch', { expectedStoreRevision, actualStoreRevision: store.revision });
      const next = await callback(structuredClone(store));
      next.revision = store.revision + 1;
      validateStore(next);
      await this.#replace(next);
      return publicJsonClone(next);
    } finally {
      await lock.close();
      await fs.unlink(this.lockPath).catch(() => {});
      await this.#syncRoot().catch(() => {});
    }
  }

  async #writeExclusive(file, value) {
    const handle = await fs.open(file, 'wx', 0o600);
    try { await handle.writeFile(`${canonicalJson(value)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
  }

  async #replace(store) {
    const temp = path.join(this.root, `.state.tmp.${process.pid}.${Date.now()}`);
    try {
      await this.#writeExclusive(temp, store);
      await fs.rename(temp, this.statePath);
      await this.#syncRoot();
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }

  async #syncRoot() {
    const directory = await fs.open(this.root, 'r');
    try { await directory.sync(); }
    finally { await directory.close(); }
  }
}
