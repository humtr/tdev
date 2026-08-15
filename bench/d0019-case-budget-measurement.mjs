import { DatabaseSync } from 'node:sqlite';
import {
  CASEDO_DEFAULT_CHUNK_BYTES,
  CaseDOAuthority,
  createCasePlacement,
  definePlan,
} from '../src/index.mjs';

// Measurement-only ceiling: prevents the adapter from rejecting the fixture before
// its own authoritativeBytes accounting can be observed. This is not a deployment
// budget, planning threshold, or qualification result.
const MEASUREMENT_ONLY_CEILING = Number.MAX_SAFE_INTEGER;
const WRITER_COMPATIBILITY_ID = 'd0019-budget-measurement-v1';

class SqlCursor {
  constructor(rows = []) {
    this.rows = rows;
  }

  toArray() {
    return this.rows.map((row) => ({ ...row }));
  }
}

class MeasurementStorage {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.sql = {
      exec: (statement, ...bindings) => {
        const prepared = this.db.prepare(statement);
        if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement)) {
          return new SqlCursor(prepared.all(...bindings));
        }
        prepared.run(...bindings);
        return new SqlCursor();
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

  close() {
    this.db.close();
  }
}

function taskId(index) {
  return `task-${String(index).padStart(5, '0')}`;
}

function widePlan(count) {
  const tasks = Array.from({ length: count }, (_, index) => ({
    id: taskId(index),
    kind: 'work',
    dependencies: [],
    claims: [],
    input: {},
  }));
  return definePlan({
    revisionId: `d0019-budget-wide-${count}`,
    baseTree: { 'seed.txt': 'x'.repeat(2048) },
    tasks: [
      ...tasks,
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: tasks.map((task) => task.id),
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function placement(caseId) {
  return createCasePlacement({
    caseId,
    placementGeneration: 1,
    deployment: 'measurement-only',
    environment: 'measurement-only',
    workerScript: 'tdev-case-runtime',
    className: 'CaseRuntimeDO',
    namespace: 'CASE_AUTHORITY',
    jurisdiction: 'measurement-only',
    durableObjectId: `do-${caseId}`,
  });
}

function makeAuthority(storage) {
  const authority = new CaseDOAuthority(storage, {
    maxAuthoritativeBytesPerCase: MEASUREMENT_ONLY_CEILING,
    writerCompatibilityId: WRITER_COMPATIBILITY_ID,
  });
  authority.initialize();
  return authority;
}

function initializeWide(count) {
  const storage = new MeasurementStorage();
  const authority = makeAuthority(storage);
  const plan = widePlan(count);
  const elected = placement(`budget-wide-${count}`);
  const created = authority.initializeElectedCase({ placement: elected, plan });
  return { storage, authority, plan, placement: elected, created };
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

function acceptOneResult(fixture, index) {
  const id = taskId(index);
  const beforeStart = fixture.authority.loadCase({ placement: fixture.placement });
  const started = fixture.authority.command({
    placement: fixture.placement,
    envelope: {
      requestId: `start-${id}`,
      expectedCaseRevision: beforeStart.snapshot.caseRevision,
      command: { type: 'start_attempt', taskId: id, executor: 'measurement-agent' },
    },
  });
  const running = fixture.authority.loadCase({ placement: fixture.placement });
  const result = {
    kind: 'changeset',
    baseDigest: fixture.plan.baseDigest,
    writes: [{ path: `${id}.txt`, content: id }],
  };
  const envelope = semanticResultEnvelope(running.snapshot, fixture.plan, started.response.id, result);
  return fixture.authority.command({
    placement: fixture.placement,
    envelope: {
      requestId: `result-${id}`,
      expectedCaseRevision: running.snapshot.caseRevision,
      command: { type: 'accept_result', envelope },
    },
  });
}

function baseEvidence(mode) {
  return {
    schemaVersion: 1,
    evidenceKind: 'd0019-case-authoritative-byte-measurement',
    measurementOnly: true,
    productionBudgetQualified: false,
    mode,
    measurementOnlyCeiling: MEASUREMENT_ONLY_CEILING,
    measurementOnlyCeilingMeaning: 'prevents local fixture rejection; not a deployment budget or planning threshold',
    adapterAccounting: 'CaseDOAuthority.authoritativeBytes',
    chunkBytes: CASEDO_DEFAULT_CHUNK_BYTES,
    fixtureBasis: {
      graphSizes: 'repository benchmark scale includes 128/512/1024/2048-task wide graphs',
      baseTree: '2 KiB seed content matches the existing CaseDO fixture scale',
      resultGrowth: 'start_attempt + accept_result with one small changeset per accepted result',
    },
  };
}

const [mode, countInput, growthInput] = process.argv.slice(2);
const count = Number(countInput);
if (!['init', 'growth'].includes(mode) || !Number.isSafeInteger(count) || count < 1) {
  throw new Error('usage: node bench/d0019-case-budget-measurement.mjs init TASK_COUNT | growth TASK_COUNT ACCEPTED_RESULTS');
}

if (mode === 'init') {
  const fixture = initializeWide(count);
  const output = {
    ...baseEvidence(mode),
    taskCount: count,
    caseRevision: fixture.created.caseRevision,
    authoritativeBytes: fixture.created.authoritativeBytes,
  };
  fixture.storage.close();
  console.log(JSON.stringify(output));
} else {
  const acceptedResults = Number(growthInput);
  if (!Number.isSafeInteger(acceptedResults) || acceptedResults < 1 || acceptedResults > count) {
    throw new Error('growth ACCEPTED_RESULTS must be a positive integer not greater than TASK_COUNT');
  }
  const fixture = initializeWide(count);
  const initialBytes = fixture.created.authoritativeBytes;
  let committed = fixture.created;
  for (let index = 0; index < acceptedResults; index += 1) {
    committed = acceptOneResult(fixture, index);
  }
  const output = {
    ...baseEvidence(mode),
    taskCount: count,
    acceptedResults,
    receipts: acceptedResults * 2,
    initialAuthoritativeBytes: initialBytes,
    finalCaseRevision: committed.caseRevision,
    finalAuthoritativeBytes: committed.authoritativeBytes,
    growthBytes: committed.authoritativeBytes - initialBytes,
  };
  fixture.storage.close();
  console.log(JSON.stringify(output));
}
