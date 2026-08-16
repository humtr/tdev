import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import {
  CASEDO_DEFAULT_CHUNK_BYTES,
  CaseDOAuthority,
  createCasePlacement,
  definePlan,
} from '../src/index.mjs';
import { canonicalJson } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { SEMANTIC_PROFILE, validateSemanticObjectRecord } from '../src/semantic-authority.mjs';
import { validateSemanticSnapshot } from '../src/semantic-snapshot.mjs';

// Measurement-only ceiling: prevents the adapter from rejecting the fixture before
// its own authoritativeBytes accounting can be observed. This is not a deployment
// budget, planning threshold, or qualification result.
const MEASUREMENT_ONLY_CEILING = Number.MAX_SAFE_INTEGER;
const WRITER_COMPATIBILITY_ID = 'd0019-budget-measurement-v1';
const ROW_OVERHEAD_BYTES = 256;
const META_OVERHEAD_BYTES = 4096;
const textEncoder = new TextEncoder();

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

function utf8Bytes(value) {
  return textEncoder.encode(value).byteLength;
}

function chunkCount(text, maxBytes) {
  let chunks = 0;
  let bytes = 0;
  let hasContent = false;
  for (const character of text) {
    const characterBytes = utf8Bytes(character);
    if (characterBytes > maxBytes) throw new Error('configured chunk size cannot hold one Unicode scalar');
    if (bytes + characterBytes > maxBytes && hasContent) {
      chunks += 1;
      bytes = 0;
      hasContent = false;
    }
    bytes += characterBytes;
    hasContent = true;
  }
  return chunks + 1;
}

// This is a benchmark-only mirror of the fresh-state byte formula in
// CaseDOAuthority.#prepareState. It deliberately does not become a production API.
// The automated calibration test compares it with real CaseDOAuthority accounting so
// storage/accounting drift fails closed instead of silently changing benchmark output.
function measureFreshAuthoritativeState(snapshotInput, semanticObjectInputs) {
  const snapshot = validateSemanticSnapshot(snapshotInput);
  const snapshotText = canonicalJson(snapshot);
  const snapshotBytes = utf8Bytes(snapshotText);
  const snapshotChunks = chunkCount(snapshotText, CASEDO_DEFAULT_CHUNK_BYTES);
  let objectBytes = 0;
  let semanticObjectRecords = 0;
  for (const raw of semanticObjectInputs) {
    const record = validateSemanticObjectRecord(raw);
    const text = canonicalJson(record);
    objectBytes += utf8Bytes(text) + (chunkCount(text, CASEDO_DEFAULT_CHUNK_BYTES) + 1) * ROW_OVERHEAD_BYTES;
    semanticObjectRecords += 1;
  }
  return {
    authoritativeBytes: META_OVERHEAD_BYTES + snapshotBytes + snapshotChunks * ROW_OVERHEAD_BYTES + objectBytes,
    snapshotBytes,
    snapshotChunks,
    semanticObjectRecords,
  };
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

function initializeWideEngine(count) {
  const plan = widePlan(count);
  const elected = placement(`budget-wide-${count}`);
  const engine = new CaseEngine({
    caseId: elected.caseId,
    plan,
    caseContract: {},
    semanticAuthority: { profile: SEMANTIC_PROFILE },
  });
  return { engine, plan, placement: elected };
}

function semanticResultEnvelopeFromAttempt(caseId, plan, attempt, result) {
  return {
    caseId,
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

function semanticResultEnvelope(snapshot, plan, attemptId, result) {
  return semanticResultEnvelopeFromAttempt(snapshot.caseId, plan, snapshot.attempts[attemptId], result);
}

function changesetResult(plan, id) {
  return {
    kind: 'changeset',
    baseDigest: plan.baseDigest,
    writes: [{ path: `${id}.txt`, content: id }],
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
  const envelope = semanticResultEnvelope(running.snapshot, fixture.plan, started.response.id, changesetResult(fixture.plan, id));
  return fixture.authority.command({
    placement: fixture.placement,
    envelope: {
      requestId: `result-${id}`,
      expectedCaseRevision: running.snapshot.caseRevision,
      command: { type: 'accept_result', envelope },
    },
  });
}

function acceptOneEngineResult(fixture, index) {
  const id = taskId(index);
  const started = fixture.engine.applyCommand({
    requestId: `start-${id}`,
    expectedCaseRevision: fixture.engine.caseRevision,
    command: { type: 'start_attempt', taskId: id, executor: 'measurement-agent' },
  });
  const envelope = semanticResultEnvelopeFromAttempt(
    fixture.engine.caseId,
    fixture.plan,
    started.response,
    changesetResult(fixture.plan, id),
  );
  return fixture.engine.applyCommand({
    requestId: `result-${id}`,
    expectedCaseRevision: fixture.engine.caseRevision,
    command: { type: 'accept_result', envelope },
  });
}

function baseEvidence(mode) {
  return {
    schemaVersion: 2,
    evidenceKind: 'd0019-case-authoritative-byte-measurement',
    measurementOnly: true,
    productionBudgetQualified: false,
    mode,
    measurementPath: mode === 'final-state'
      ? 'persistent-case-engine-plus-calibrated-fresh-state-accounting'
      : 'case-do-authority-round-trip',
    measurementOnlyCeiling: MEASUREMENT_ONLY_CEILING,
    measurementOnlyCeilingMeaning: 'prevents local fixture rejection; not a deployment budget or planning threshold',
    adapterAccounting: 'CaseDOAuthority.authoritativeBytes',
    chunkBytes: CASEDO_DEFAULT_CHUNK_BYTES,
    fixtureBasis: {
      graphSizes: 'repository benchmark scale includes 128/512/1024/2048-task wide graphs',
      baseTree: '2 KiB seed content matches the existing CaseDO fixture scale',
      resultGrowth: 'start_attempt + accept_result with one small changeset per accepted result',
    },
    ...(mode === 'final-state'
      ? {
          accountingMirrorScope: 'fresh final authoritative state only',
          calibrationRequired: true,
          omitsRepeatedRoundTrips: true,
        }
      : {
          includesRepeatedRoundTrips: true,
        }),
  };
}

function progressReporter(mode, total) {
  const startedAt = performance.now();
  const cpuStarted = process.cpuUsage();
  const interval = Math.max(1, Math.min(16, total));
  return (completed, caseRevision, phase = 'results') => {
    if (completed !== total && completed % interval !== 0) return;
    const cpu = process.cpuUsage(cpuStarted);
    process.stderr.write(`${JSON.stringify({
      event: 'd0019-case-budget-progress',
      mode,
      phase,
      completedResults: completed,
      totalResults: total,
      caseRevision,
      wallMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      cpuMs: Math.round(((cpu.user + cpu.system) / 1000) * 1000) / 1000,
    })}\n`);
  };
}

const [mode, countInput, growthInput] = process.argv.slice(2);
const count = Number(countInput);
if (!['init', 'growth', 'final-state'].includes(mode) || !Number.isSafeInteger(count) || count < 1) {
  throw new Error('usage: node bench/d0019-case-budget-measurement.mjs init TASK_COUNT | growth TASK_COUNT ACCEPTED_RESULTS | final-state TASK_COUNT ACCEPTED_RESULTS');
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
    throw new Error(`${mode} ACCEPTED_RESULTS must be a positive integer not greater than TASK_COUNT`);
  }
  const progress = progressReporter(mode, acceptedResults);
  if (mode === 'growth') {
    const fixture = initializeWide(count);
    const initialBytes = fixture.created.authoritativeBytes;
    let committed = fixture.created;
    progress(0, fixture.created.caseRevision, 'initialized');
    for (let index = 0; index < acceptedResults; index += 1) {
      committed = acceptOneResult(fixture, index);
      progress(index + 1, committed.caseRevision);
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
  } else {
    const fixture = initializeWideEngine(count);
    const initial = measureFreshAuthoritativeState(fixture.engine.snapshot(), fixture.engine.semanticObjectRecords());
    progress(0, fixture.engine.caseRevision, 'initialized');
    for (let index = 0; index < acceptedResults; index += 1) {
      acceptOneEngineResult(fixture, index);
      progress(index + 1, fixture.engine.caseRevision);
    }
    const final = measureFreshAuthoritativeState(fixture.engine.snapshot(), fixture.engine.semanticObjectRecords());
    const output = {
      ...baseEvidence(mode),
      taskCount: count,
      acceptedResults,
      receipts: acceptedResults * 2,
      initialAuthoritativeBytes: initial.authoritativeBytes,
      finalCaseRevision: fixture.engine.caseRevision,
      finalAuthoritativeBytes: final.authoritativeBytes,
      growthBytes: final.authoritativeBytes - initial.authoritativeBytes,
      snapshotBytes: final.snapshotBytes,
      snapshotChunks: final.snapshotChunks,
      semanticObjectRecords: final.semanticObjectRecords,
    };
    console.log(JSON.stringify(output));
  }
}
