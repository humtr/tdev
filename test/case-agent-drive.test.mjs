import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CaseAgentDriveAuthority,
  MemoryCaseAgentDriveStore,
  caseAgentDriveRecordDigest,
} from '../src/case-agent-drive.mjs';
import { ContractError, digest } from '../src/canonical.mjs';

function receipt(value) {
  return digest({ kind: 'drive-receipt', value });
}

function caseObservation(overrides = {}) {
  return {
    caseRevision: 1,
    terminal: false,
    ready: true,
    ...overrides,
  };
}

function agentObservation(overrides = {}) {
  return {
    available: true,
    deliveryDigest: digest({ kind: 'delivery', value: 1 }),
    ...overrides,
  };
}

function authority() {
  const store = new MemoryCaseAgentDriveStore();
  const drive = new CaseAgentDriveAuthority({ store });
  drive.initialize({ caseId: 'case-p1', driveRequestId: 'drive-1', payload: { objective: 'bounded-change' } });
  return { store, drive };
}

test('D0042 drive intent is create-once, exact-replay safe, and payload conflicts fail closed', () => {
  const { drive } = authority();
  const replay = drive.initialize({ caseId: 'case-p1', driveRequestId: 'drive-1', payload: { objective: 'bounded-change' } });
  assert.equal(replay.classification, 'exact_replay');
  assert.equal(caseAgentDriveRecordDigest(replay.record), caseAgentDriveRecordDigest(drive.read('case-p1')));
  assert.throws(
    () => drive.initialize({ caseId: 'case-p1', driveRequestId: 'drive-1', payload: { objective: 'changed' } }),
    (error) => error instanceof ContractError && error.code === 'case_agent_drive_request_conflict',
  );
});

test('D0042 drive is level-triggered and rereads Case/Agent owners on each step', async () => {
  const { drive } = authority();
  let caseReads = 0;
  let agentReads = 0;
  let dispatches = 0;
  const readCase = async () => caseObservation({ caseRevision: ++caseReads });
  const readAgent = async () => agentObservation({ deliveryDigest: digest({ kind: 'delivery', value: ++agentReads }) });
  const dispatch = async () => {
    dispatches += 1;
    return { classification: 'accepted', caseRevision: caseReads, receiptDigest: receipt(dispatches) };
  };
  const first = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase,
    readAgent,
    dispatch,
  });
  const second = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase,
    readAgent,
    dispatch,
  });
  assert.equal(first.classification, 'accepted');
  assert.equal(second.classification, 'accepted');
  assert.equal(dispatches, 2);
  assert.equal(caseReads, 2);
  assert.equal(agentReads, 2);
  assert.equal(drive.read('case-p1').lastCaseRevision, 2);
});

test('D0042 response loss enters RECONCILING, then exact owner receipt clears without blind dispatch', async () => {
  const { drive } = authority();
  let dispatches = 0;
  let caseReads = 0;
  const committedReceipt = receipt('committed');
  const readCase = async () => {
    caseReads += 1;
    return caseObservation({
      caseRevision: caseReads,
      requestId: caseReads >= 2 ? 'drive-1' : null,
      receiptDigest: caseReads >= 2 ? committedReceipt : null,
    });
  };
  const readAgent = async () => agentObservation();
  const first = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase,
    readAgent,
    dispatch: async () => {
      dispatches += 1;
      const error = new Error('response lost after owner commit');
      error.code = 'case_agent_drive_response_lost';
      throw error;
    },
  });
  assert.equal(first.classification, 'reconciling');
  assert.equal(first.record.status, 'RECONCILING');
  assert.equal(dispatches, 1);

  const reconciled = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase,
    readAgent,
    dispatch: async () => {
      dispatches += 1;
      return { classification: 'accepted', caseRevision: 99, receiptDigest: receipt('wrong-path') };
    },
  });
  assert.equal(reconciled.classification, 'exact_replay');
  assert.equal(reconciled.receiptDigest, committedReceipt);
  assert.equal(dispatches, 1);
  assert.equal(drive.read('case-p1').status, 'ACTIVE');
});

test('D0042 terminal Case quiesces the drive and cannot be resurrected', async () => {
  const { drive } = authority();
  let dispatches = 0;
  const readCase = async () => caseObservation({
    caseRevision: 7,
    terminal: true,
    ready: false,
    terminalReceiptDigest: receipt('terminal'),
  });
  const readAgent = async () => agentObservation();
  const terminal = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase,
    readAgent,
    dispatch: async () => { dispatches += 1; return { classification: 'accepted' }; },
  });
  assert.equal(terminal.classification, 'quiesced');
  assert.equal(terminal.record.status, 'QUIESCED');
  const later = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase: async () => { throw new Error('must not reread a quiesced drive'); },
    readAgent,
    dispatch: async () => { dispatches += 1; return { classification: 'accepted' }; },
  });
  assert.equal(later.classification, 'quiesced');
  assert.equal(dispatches, 0);
});

test('D0042 unavailable Agent or non-ready Case returns not_ready without dispatch', async () => {
  const { drive } = authority();
  let dispatches = 0;
  const result = await drive.drive('case-p1', {
    driveRequestId: 'drive-1',
    payload: { objective: 'bounded-change' },
    readCase: async () => caseObservation({ ready: false }),
    readAgent: async () => agentObservation({ available: false }),
    dispatch: async () => { dispatches += 1; return { classification: 'accepted' }; },
  });
  assert.equal(result.classification, 'not_ready');
  assert.equal(dispatches, 0);
});

test('D0042 corrupt or future drive records fail closed before owner callbacks', () => {
  const store = {
    load: () => ({ schemaVersion: 99 }),
    create: () => {},
    compareAndSwap: () => {},
  };
  const drive = new CaseAgentDriveAuthority({ store });
  assert.throws(
    () => drive.read('case-p1'),
    (error) => error instanceof ContractError && error.code === 'unexpected_keys',
  );
});
