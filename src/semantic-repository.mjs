import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalJson,
  digest,
  publicJsonClone,
} from './canonical.mjs';
import { CaseEngine } from './engine.mjs';
import {
  SEMANTIC_PROFILE,
  buildSemanticTree,
  semanticPlanBinding,
} from './semantic-authority.mjs';
import { createSemanticSnapshot } from './semantic-snapshot.mjs';

function assertSemanticStore(store) {
  if (!store || typeof store.commit !== 'function' || typeof store.load !== 'function' ||
      typeof store.loadHead !== 'function' || typeof store.getObject !== 'function') {
    throw new ContractError('invalid_semantic_store', 'Semantic repository requires commit/load/loadHead/getObject');
  }
}

function assertQuiescence(input) {
  assertRecordShape(input, ['writersQuiesced', 'claimsQuiesced'], [], 'semantic migration quiescence');
  if (input.writersQuiesced !== true || input.claimsQuiesced !== true) {
    throw new ContractError('migration_not_quiesced', 'Semantic migration requires legacy writers and Claim ownership to be quiesced');
  }
}

function dangerousAttemptState(state) {
  return ['running', 'queued', 'dispatch_pending', 'cancel_requested', 'reconciling'].includes(state);
}

export class SemanticCaseRepository {
  constructor(store) {
    assertSemanticStore(store);
    this.store = store;
  }

  restoreSnapshot(snapshot, options = {}) {
    return CaseEngine.restore(snapshot, {
      ...options,
      semanticResolver: (objectDigest) => this.store.getObject(objectDigest),
    });
  }

  async create(input) {
    assertRecordShape(input, ['caseId', 'plan'], ['caseContract'], 'semantic repository create');
    const { caseId, plan, caseContract = {} } = input;
    const engine = new CaseEngine({
      caseId,
      plan,
      caseContract,
      semanticAuthority: { profile: SEMANTIC_PROFILE },
    });
    const snapshot = engine.snapshot();
    if (typeof this.store.assertSnapshotCapacity === 'function') this.store.assertSnapshotCapacity(snapshot);
    this.store.commit({ snapshot, semanticObjects: engine.semanticObjectRecords() });
    engine.markSemanticObjectsPersisted();
    return engine;
  }

  async checkpoint(engine, expectedRevision, snapshot = engine.snapshot()) {
    if (!(engine instanceof CaseEngine) || engine.isSemanticV3 !== true) {
      throw new ContractError('invalid_case_engine', 'Semantic checkpoint requires a v3 CaseEngine');
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new ContractError('invalid_expected_revision', 'Semantic checkpoint expectedRevision must be non-negative');
    }
    const current = this.store.loadHead(engine.caseId);
    if (current === null || current.caseRevision !== expectedRevision) {
      throw new ContractError('store_cas_mismatch', 'Semantic repository predecessor revision does not match', {
        expectedRevision,
        actualRevision: current?.caseRevision ?? null,
      });
    }
    if (typeof this.store.assertSnapshotCapacity === 'function') this.store.assertSnapshotCapacity(snapshot);
    const head = this.store.commit({
      snapshot,
      semanticObjects: engine.semanticObjectRecords(),
      expectedHeadDigest: current.headDigest,
      expectedCaseRevision: expectedRevision,
    });
    engine.markSemanticObjectsPersisted();
    return head;
  }

  async load(caseId, options = {}) {
    assertRecordShape(options, [], ['reopen'], 'semantic repository load options');
    assertIdentifier(caseId, 'caseId');
    const stored = this.store.load(caseId, { hydrate: false });
    if (stored === null) return null;
    const engine = this.restoreSnapshot(stored.snapshot, { reopen: options.reopen === true });
    if (engine.caseRevision !== stored.head.caseRevision) {
      await this.checkpoint(engine, stored.head.caseRevision);
    }
    return engine;
  }

  async transact(caseId, operation, options = {}) {
    assertRecordShape(options, [], ['reopen'], 'semantic repository transaction options');
    assertIdentifier(caseId, 'caseId');
    if (typeof operation !== 'function') throw new ContractError('invalid_transaction', 'Repository operation must be a function');
    const stored = this.store.load(caseId, { hydrate: false });
    if (stored === null) throw new ContractError('case_not_found', `Case ${caseId} does not exist`);
    const engine = this.restoreSnapshot(stored.snapshot, { reopen: options.reopen === true });
    const result = await operation(engine);
    const snapshot = engine.snapshot();
    let persisted = false;
    if (snapshot.caseRevision !== stored.head.caseRevision) {
      await this.checkpoint(engine, stored.head.caseRevision, snapshot);
      persisted = true;
    }
    return { engine, result: publicJsonClone(result === undefined ? null : result), persisted };
  }

  async command(caseId, commandEnvelope, options = {}) {
    assertRecordShape(options, [], ['reopen', 'claimValidator'], 'semantic repository command options');
    const transactionOptions = Object.hasOwn(options, 'reopen') ? { reopen: options.reopen } : {};
    return this.transact(
      caseId,
      (engine) => engine.applyCommand(commandEnvelope, { claimValidator: options.claimValidator }),
      transactionOptions,
    );
  }
}

export async function migrateV2CaseToSemantic({
  sourceStore,
  targetStore,
  caseId,
  quiescence,
  beforeTargetCommit = null,
}) {
  if (!sourceStore || typeof sourceStore.load !== 'function') {
    throw new ContractError('invalid_migration_source_store', 'Migration source must implement load(caseId)');
  }
  assertSemanticStore(targetStore);
  assertIdentifier(caseId, 'caseId');
  assertQuiescence(quiescence);
  if (beforeTargetCommit !== null && typeof beforeTargetCommit !== 'function') {
    throw new ContractError('invalid_migration_hook', 'beforeTargetCommit must be a function or null');
  }
  if (targetStore.loadHead(caseId) !== null) throw new ContractError('migration_target_exists', `Semantic Case ${caseId} already exists`);

  const source = await sourceStore.load(caseId);
  if (source === null) throw new ContractError('case_not_found', `Legacy Case ${caseId} does not exist`);
  if (source.schemaVersion !== 2) throw new ContractError('migration_source_version', 'D0010 migration accepts only schema-v2 snapshots');
  const capturedDigest = source.snapshotDigest;
  const capturedRevision = source.caseRevision;
  const engine = CaseEngine.restore(source, { reopen: true });
  if (engine.caseState === 'succeeded' || engine.taskStates[engine.plan.promotionTaskId]?.state === 'succeeded') {
    throw new ContractError('migration_after_promotion', 'D0010 does not migrate a Case after successful Promotion');
  }
  if (digest(engine.canonicalTree) !== engine.plan.baseDigest || canonicalJson(engine.canonicalTree) !== canonicalJson(engine.plan.baseTree)) {
    throw new ContractError('migration_canonical_changed', 'Legacy canonical tree must still equal the immutable Plan base');
  }
  for (const attempt of Object.values(engine.attempts)) {
    if (dangerousAttemptState(attempt.state)) {
      throw new ContractError('migration_attempt_active', `Attempt ${attempt.id} remains ${attempt.state} after reopen`);
    }
  }

  const baseSemantic = buildSemanticTree(engine.plan.baseTree, engine.caseContract);
  const snapshot = createSemanticSnapshot({
    schemaVersion: 3,
    caseId: engine.caseId,
    caseState: engine.caseState,
    caseRevision: engine.caseRevision,
    eventSequence: engine.eventSequence,
    plan: semanticPlanBinding(engine.plan, baseSemantic.rootDescriptor),
    caseContract: engine.caseContract,
    events: engine.events,
    semanticAuthority: {
      profile: SEMANTIC_PROFILE,
      authorityEpoch: 1,
      migrationSource: {
        schemaVersion: 2,
        snapshotDigest: capturedDigest,
        caseRevision: capturedRevision,
      },
      baseRoot: baseSemantic.rootDescriptor,
      canonicalRoot: baseSemantic.rootDescriptor,
    },
    taskStates: engine.taskStates,
    attempts: engine.attempts,
    receipts: engine.receipts,
  });
  if (beforeTargetCommit) await beforeTargetCommit({ source, engine, snapshot });
  const rechecked = await sourceStore.load(caseId);
  if (rechecked === null || rechecked.snapshotDigest !== capturedDigest || rechecked.caseRevision !== capturedRevision) {
    throw new ContractError('migration_source_changed', 'Legacy source changed after migration capture');
  }
  if (typeof targetStore.assertSnapshotCapacity === 'function') targetStore.assertSnapshotCapacity(snapshot);
  const head = targetStore.commit({ snapshot, semanticObjects: baseSemantic.objectRecords() });
  return { head, snapshot, sourceSnapshotDigest: capturedDigest, sourceCaseRevision: capturedRevision };
}

export function semanticMigrationRollbackStatus(store, caseId) {
  assertSemanticStore(store);
  assertIdentifier(caseId, 'caseId');
  const head = store.loadHead(caseId);
  if (head === null) return { allowed: true, reason: 'no_v3_head' };
  const snapshot = store.getSnapshot(head.snapshotDigest);
  if (snapshot === null) throw new ContractError('store_corrupt', 'Semantic head references a missing snapshot');
  if (head.generation === 1 && snapshot.semanticAuthority.migrationSource !== null) {
    return {
      allowed: true,
      reason: 'unadvanced_migration',
      source: publicJsonClone(snapshot.semanticAuthority.migrationSource),
      headDigest: head.headDigest,
    };
  }
  return { allowed: false, reason: 'post_migration_v3_write', headDigest: head.headDigest, generation: head.generation };
}
