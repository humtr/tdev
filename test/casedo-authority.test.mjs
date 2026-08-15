import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  CASEDO_STORAGE_PROFILE,
  CASEDO_STORAGE_SCHEMA_VERSION,
  CaseDOAuthority,
  createCasePlacement,
} from '../src/casedo-authority.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

class TestSqlCursor {
  constructor(rows = []) {
    this.rows = rows;
  }

  toArray() {
    return this.rows.map((row) => ({ ...row }));
  }
}

class TestDurableObjectStorage {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.sql = {
      exec: (statement, ...bindings) => {
        const prepared = this.db.prepare(statement);
        if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement)) {
          return new TestSqlCursor(prepared.all(...bindings));
        }
        prepared.run(...bindings);
        return new TestSqlCursor();
      },
    };
  }

  transactionSync(operation) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  rows(statement, ...bindings) {
    return this.db.prepare(statement).all(...bindings).map((row) => ({ ...row }));
  }

  run(statement, ...bindings) {
    return this.db.prepare(statement).run(...bindings);
  }

  close() {
    this.db.close();
  }
}

function placementInput(caseId, overrides = {}) {
  return {
    caseId,
    placementGeneration: 1,
    deployment: 'prod-deployment',
    environment: 'production',
    workerScript: 'tdev-case-runtime',
    className: 'CaseRuntimeDO',
    namespace: 'CASE_AUTHORITY',
    jurisdiction: 'eu',
    durableObjectId: `do-${caseId}`,
    ...overrides,
  };
}

function makeAuthority(storage, overrides = {}) {
  const authority = new CaseDOAuthority(storage, {
    maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
    writerCompatibilityId: 'writer-v1',
    chunkBytes: 256,
    ...overrides,
  });
  authority.initialize();
  return authority;
}

function createFixture(caseId, options = {}) {
  const storage = new TestDurableObjectStorage();
  const authority = makeAuthority(storage, options.authority);
  const placement = createCasePlacement(placementInput(caseId, options.placement));
  const plan = planWithWork(options.tasks ?? [{ id: 'a' }], options.baseTree ?? {
    'seed.txt': 'x'.repeat(2048),
  });
  const created = authority.initializeElectedCase({ placement, plan });
  return { storage, authority, placement, plan, created };
}

function assertCode(code) {
  return (error) => error?.code === code;
}

function semanticResultEnvelope(snapshot, plan, attemptId, result) {
  const attempt = snapshot.attempts[attemptId];
  return {
    caseId: snapshot.caseId,
    planRevisionId: plan.revisionId,
    planDigest: plan.planDigest,
    taskId: attempt.taskId,
    attemptId: attempt.id,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
    claimLeaseToken: attempt.claimLease?.token ?? null,
    claimLeaseGeneration: attempt.claimLease?.generation ?? null,
    claimLeaseClaimsDigest: attempt.claimLease?.claimsDigest ?? null,
    result,
  };
}

test('CaseDO requires a finite deployment budget and initializes elected native semantic-v3 state in chunks', () => {
  const storage = new TestDurableObjectStorage();
  assert.throws(
    () => new CaseDOAuthority(storage, { writerCompatibilityId: 'writer-v1' }),
  );

  const authority = makeAuthority(storage, { chunkBytes: 128 });
  const placement = createCasePlacement(placementInput('native-v3-case'));
  const plan = planWithWork([{ id: 'a' }], { 'large.txt': 'z'.repeat(4096) });
  const created = authority.initializeElectedCase({ placement, plan });

  assert.equal(created.snapshot.schemaVersion, 3);
  assert.equal(created.snapshot.caseId, placement.caseId);
  assert.ok(storage.rows('SELECT * FROM casedo_snapshot_chunks').length > 1);
  assert.ok(storage.rows('SELECT * FROM casedo_object_chunks').length > storage.rows('SELECT * FROM casedo_objects').length);
  const meta = storage.rows('SELECT * FROM casedo_meta')[0];
  assert.equal(meta.storage_profile, CASEDO_STORAGE_PROFILE);
  assert.equal(Number(meta.storage_schema_version), CASEDO_STORAGE_SCHEMA_VERSION);
  assert.ok(Number(meta.authoritative_bytes) > 0);

  const reconstructed = makeAuthority(storage, { chunkBytes: 128 }).loadCase({ placement });
  assert.equal(reconstructed.snapshot.snapshotDigest, created.snapshot.snapshotDigest);
  assert.equal(reconstructed.snapshot.caseRevision, created.snapshot.caseRevision);
  storage.close();
});

test('CaseDO receipt replay wins over revision metadata and conflicting requests or stale revisions lose', () => {
  const { storage, authority, placement } = createFixture('receipt-case', { tasks: [{ id: 'a' }, { id: 'b' }] });
  const before = authority.loadCase({ placement });
  const command = { type: 'start_attempt', taskId: 'a', executor: 'agent-a' };
  const first = authority.command({
    placement,
    envelope: { requestId: 'request-1', expectedCaseRevision: before.snapshot.caseRevision, command },
  });
  const committed = authority.loadCase({ placement });
  assert.ok(committed.snapshot.caseRevision > before.snapshot.caseRevision);

  const replay = authority.command({
    placement,
    envelope: { requestId: 'request-1', expectedCaseRevision: committed.snapshot.caseRevision, command },
  });
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.response, first.response);
  assert.equal(authority.loadCase({ placement }).snapshot.caseRevision, committed.snapshot.caseRevision);

  assert.throws(
    () => authority.command({
      placement,
      envelope: {
        requestId: 'request-1',
        expectedCaseRevision: committed.snapshot.caseRevision,
        command: { type: 'cancel_task', taskId: 'b', reason: 'different command' },
      },
    }),
    assertCode('request_conflict'),
  );
  assert.throws(
    () => authority.command({
      placement,
      envelope: {
        requestId: 'request-stale',
        expectedCaseRevision: before.snapshot.caseRevision,
        command: { type: 'cancel_task', taskId: 'b', reason: 'stale revision' },
      },
    }),
    assertCode('revision_conflict'),
  );
  storage.close();
});

test('CaseDO serial transaction gives one winner for one expected revision', () => {
  const { storage, authority, placement } = createFixture('one-winner-case', { tasks: [{ id: 'a' }, { id: 'b' }] });
  const revision = authority.loadCase({ placement }).snapshot.caseRevision;
  authority.command({
    placement,
    envelope: {
      requestId: 'winner',
      expectedCaseRevision: revision,
      command: { type: 'start_attempt', taskId: 'a', executor: 'agent-a' },
    },
  });
  assert.throws(
    () => authority.command({
      placement,
      envelope: {
        requestId: 'loser',
        expectedCaseRevision: revision,
        command: { type: 'cancel_task', taskId: 'b', reason: 'same revision race' },
      },
    }),
    assertCode('revision_conflict'),
  );
  const snapshot = authority.loadCase({ placement }).snapshot;
  assert.ok(snapshot.receipts.winner);
  assert.equal(snapshot.receipts.loser, undefined);
  storage.close();
});

test('CaseDO transaction rolls back writes on pre-commit failure', () => {
  const { storage, authority, placement } = createFixture('rollback-case');
  const before = authority.loadCase({ placement });
  const failing = makeAuthority(storage, {
    faultInjector(stage, details) {
      if (stage === 'before_commit' && details.operation === 'command') {
        const error = new Error('injected pre-commit failure');
        error.code = 'injected_precommit_failure';
        throw error;
      }
    },
  });
  assert.throws(
    () => failing.command({
      placement,
      envelope: {
        requestId: 'rollback-request',
        expectedCaseRevision: before.snapshot.caseRevision,
        command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
      },
    }),
    assertCode('injected_precommit_failure'),
  );
  const untouched = authority.loadCase({ placement }).snapshot;
  assert.equal(untouched.caseRevision, before.snapshot.caseRevision);
  assert.equal(untouched.receipts['rollback-request'], undefined);
  storage.close();
});

test('CaseDO response loss after commit reconciles by authoritative receipt replay', () => {
  const { storage, authority, placement } = createFixture('response-loss-case');
  const before = authority.loadCase({ placement });
  const command = { type: 'start_attempt', taskId: 'a', executor: 'agent' };
  const lossy = makeAuthority(storage, {
    faultInjector(stage, details) {
      if (stage === 'after_commit' && details.operation === 'command') {
        const error = new Error('response lost after commit');
        error.code = 'response_lost';
        throw error;
      }
    },
  });
  assert.throws(
    () => lossy.command({
      placement,
      envelope: { requestId: 'lost-request', expectedCaseRevision: before.snapshot.caseRevision, command },
    }),
    assertCode('response_lost'),
  );
  const committed = authority.loadCase({ placement });
  assert.ok(committed.snapshot.receipts['lost-request']);
  const replay = makeAuthority(storage).command({
    placement,
    envelope: { requestId: 'lost-request', expectedCaseRevision: committed.snapshot.caseRevision, command },
  });
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.response, committed.snapshot.receipts['lost-request'].response);
  storage.close();
});

test('CaseDO reconstruction preserves live Attempt; explicit owner-loss recovery is durable and idempotent', () => {
  const { storage, authority, placement } = createFixture('recovery-case');
  const before = authority.loadCase({ placement });
  const started = authority.command({
    placement,
    envelope: {
      requestId: 'start-live',
      expectedCaseRevision: before.snapshot.caseRevision,
      command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
    },
  });
  const attemptId = started.response.id;
  const reconstructed = makeAuthority(storage).loadCase({ placement });
  assert.equal(reconstructed.snapshot.attempts[attemptId].state, 'running');
  const runningRevision = reconstructed.snapshot.caseRevision;

  const recovery = makeAuthority(storage).recoverExecutionOwnerLoss({
    placement,
    recoveryId: 'owner-loss-1',
    cause: { kind: 'execution-owner-loss', observation: 'external-owner-reported' },
  });
  assert.equal(recovery.deduplicated, false);
  const recovered = makeAuthority(storage).loadCase({ placement }).snapshot;
  assert.equal(recovered.attempts[attemptId].state, 'interrupted');
  assert.equal(recovered.taskStates.a.state, 'pending');
  assert.ok(recovered.caseRevision > runningRevision);

  const replay = makeAuthority(storage).recoverExecutionOwnerLoss({
    placement,
    recoveryId: 'owner-loss-1',
    cause: { kind: 'execution-owner-loss', observation: 'external-owner-reported' },
  });
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.caseRevision, recovered.caseRevision);
  assert.throws(
    () => makeAuthority(storage).recoverExecutionOwnerLoss({
      placement,
      recoveryId: 'owner-loss-1',
      cause: { kind: 'different-owner-loss' },
    }),
    assertCode('recovery_conflict'),
  );
  storage.close();
});

test('CaseDO preserves result fencing and at-most-one accepted semantic result', () => {
  const { storage, authority, placement, plan } = createFixture('result-fence-case');
  const initial = authority.loadCase({ placement });
  const started = authority.command({
    placement,
    envelope: {
      requestId: 'start-result',
      expectedCaseRevision: initial.snapshot.caseRevision,
      command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
    },
  });
  const attemptId = started.response.id;
  const running = authority.loadCase({ placement });
  const result = resultFor(plan.baseDigest, plan.tasksById.a, 'accepted');
  const validEnvelope = semanticResultEnvelope(running.snapshot, plan, attemptId, result);
  const staleEnvelope = { ...validEnvelope, fencingToken: `sha256:${'0'.repeat(64)}` };

  assert.throws(
    () => authority.command({
      placement,
      envelope: {
        requestId: 'stale-result',
        expectedCaseRevision: running.snapshot.caseRevision,
        command: { type: 'accept_result', envelope: staleEnvelope },
      },
    }),
    assertCode('stale_result'),
  );
  const accepted = authority.command({
    placement,
    envelope: {
      requestId: 'accepted-result',
      expectedCaseRevision: running.snapshot.caseRevision,
      command: { type: 'accept_result', envelope: validEnvelope },
    },
  });
  assert.equal(accepted.response.deduplicated, false);
  const after = authority.loadCase({ placement });
  const conflictingEnvelope = semanticResultEnvelope(
    after.snapshot,
    plan,
    attemptId,
    resultFor(plan.baseDigest, plan.tasksById.a, 'contradictory'),
  );
  assert.throws(
    () => authority.command({
      placement,
      envelope: {
        requestId: 'conflicting-result',
        expectedCaseRevision: after.snapshot.caseRevision,
        command: { type: 'accept_result', envelope: conflictingEnvelope },
      },
    }),
    assertCode('duplicate_result_conflict'),
  );
  storage.close();
});

test('CaseDO fails closed on corrupt chunks, incompatible schema/writer, and mismatched placement', () => {
  {
    const { storage, authority, placement } = createFixture('corrupt-chunk-case');
    storage.run('DELETE FROM casedo_snapshot_chunks WHERE chunk_index = (SELECT MAX(chunk_index) FROM casedo_snapshot_chunks)');
    assert.throws(() => authority.loadCase({ placement }), assertCode('casedo_store_corrupt'));
    storage.close();
  }
  {
    const { storage, authority, placement } = createFixture('schema-case');
    storage.run('UPDATE casedo_meta SET storage_schema_version = ?', 999);
    assert.throws(() => authority.loadCase({ placement }), assertCode('incompatible_casedo_schema'));
    storage.close();
  }
  {
    const { storage, placement } = createFixture('writer-case');
    const incompatible = makeAuthority(storage, { writerCompatibilityId: 'writer-v2' });
    assert.throws(() => incompatible.loadCase({ placement }), assertCode('incompatible_casedo_writer'));
    storage.close();
  }
  {
    const { storage, authority, placement } = createFixture('placement-mismatch-case');
    const wrongPlacement = createCasePlacement(placementInput(placement.caseId, { durableObjectId: 'do-wrong-owner' }));
    assert.throws(() => authority.loadCase({ placement: wrongPlacement }), assertCode('placement_conflict'));
    storage.close();
  }
});

test('incompatible rollout writer cannot mutate and the compatible writer retains authority', () => {
  const { storage, authority, placement } = createFixture('writer-rollout-case');
  const before = authority.loadCase({ placement });
  const incompatible = makeAuthority(storage, { writerCompatibilityId: 'writer-v2' });

  assert.throws(
    () => incompatible.command({
      placement,
      envelope: {
        requestId: 'new-writer-command',
        expectedCaseRevision: before.snapshot.caseRevision,
        command: { type: 'start_attempt', taskId: 'a', executor: 'new-writer-agent' },
      },
    }),
    assertCode('incompatible_casedo_writer'),
  );

  const afterRejected = authority.loadCase({ placement });
  assert.equal(afterRejected.snapshot.caseRevision, before.snapshot.caseRevision);
  assert.equal(afterRejected.snapshot.receipts['new-writer-command'], undefined);

  const committed = authority.command({
    placement,
    envelope: {
      requestId: 'old-writer-command',
      expectedCaseRevision: before.snapshot.caseRevision,
      command: { type: 'start_attempt', taskId: 'a', executor: 'compatible-agent' },
    },
  });
  assert.equal(committed.deduplicated, false);
  assert.ok(committed.caseRevision > before.snapshot.caseRevision);
  storage.close();
});

test('CaseDO capacity exhaustion fails before Case authority is created', () => {
  const storage = new TestDurableObjectStorage();
  const authority = makeAuthority(storage, { maxAuthoritativeBytesPerCase: 1 });
  const placement = createCasePlacement(placementInput('capacity-case'));
  const plan = planWithWork([{ id: 'a' }]);
  assert.throws(() => authority.initializeElectedCase({ placement, plan }), assertCode('casedo_capacity_exceeded'));
  assert.equal(storage.rows('SELECT * FROM casedo_meta').length, 0);
  storage.close();
});
