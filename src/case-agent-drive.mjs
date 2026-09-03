import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';

export const CASE_AGENT_DRIVE_PROFILE = 'tdev.case-agent-drive.v1';
export const CASE_AGENT_DRIVE_SCHEMA_VERSION = 1;
export const CASE_AGENT_DRIVE_REQUEST_DOMAIN = 'tdev.case-agent-drive-request.v1';
export const CASE_AGENT_DRIVE_MAX_PAYLOAD_BYTES = 256 * 1024;

const DRIVE_STATES = new Set(['ACTIVE', 'QUIESCED', 'RECONCILING']);
const DRIVE_ACTION = 'run_or_resume';

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function normalizePayload(value) {
  if (!isPlainRecord(value)) fail('invalid_case_agent_drive_payload', 'Drive payload must be a plain record');
  const payload = canonicalClone(value);
  const bytes = Buffer.byteLength(canonicalJson(payload), 'utf8');
  if (bytes > CASE_AGENT_DRIVE_MAX_PAYLOAD_BYTES) {
    fail('case_agent_drive_payload_limit_exceeded', 'Drive payload exceeds its byte bound', {
      bytes,
      maxBytes: CASE_AGENT_DRIVE_MAX_PAYLOAD_BYTES,
    });
  }
  return deepFreeze(payload);
}

function requestDigest(caseId, driveRequestId, payload) {
  return typedDigest(CASE_AGENT_DRIVE_REQUEST_DOMAIN, {
    caseId,
    driveRequestId,
    desiredAction: DRIVE_ACTION,
    payload,
  });
}

function normalizeRecord(input, label = 'Case-Agent drive record') {
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'caseId', 'driveRequestId', 'driveRequestDigest',
    'desiredAction', 'status', 'lastCaseRevision', 'lastDriveReceiptDigest',
    'lastObservedDeliveryDigest', 'revision',
  ], [], label);
  if (input.schemaVersion !== CASE_AGENT_DRIVE_SCHEMA_VERSION || input.profile !== CASE_AGENT_DRIVE_PROFILE) {
    fail('case_agent_drive_schema_unsupported', 'Case-Agent drive record profile/schema is unsupported');
  }
  assertIdentifier(input.caseId, `${label}.caseId`);
  assertIdentifier(input.driveRequestId, `${label}.driveRequestId`);
  assertDigest(input.driveRequestDigest, `${label}.driveRequestDigest`);
  if (input.desiredAction !== DRIVE_ACTION) fail('case_agent_drive_action_unsupported', 'Case-Agent drive action is unsupported');
  if (!DRIVE_STATES.has(input.status)) fail('case_agent_drive_state_invalid', 'Case-Agent drive status is invalid');
  if (input.lastCaseRevision !== null) assertSafeInteger(input.lastCaseRevision, `${label}.lastCaseRevision`, { min: 0 });
  for (const field of ['lastDriveReceiptDigest', 'lastObservedDeliveryDigest']) {
    if (input[field] !== null) assertDigest(input[field], `${label}.${field}`);
  }
  assertSafeInteger(input.revision, `${label}.revision`, { min: 0 });
  return deepFreeze(canonicalClone(input));
}

function createRecord({ caseId, driveRequestId, payload }) {
  assertIdentifier(caseId, 'caseId');
  assertIdentifier(driveRequestId, 'driveRequestId');
  const normalizedPayload = normalizePayload(payload);
  return normalizeRecord({
    schemaVersion: CASE_AGENT_DRIVE_SCHEMA_VERSION,
    profile: CASE_AGENT_DRIVE_PROFILE,
    caseId,
    driveRequestId,
    driveRequestDigest: requestDigest(caseId, driveRequestId, normalizedPayload),
    desiredAction: DRIVE_ACTION,
    status: 'ACTIVE',
    lastCaseRevision: null,
    lastDriveReceiptDigest: null,
    lastObservedDeliveryDigest: null,
    revision: 0,
  });
}

function normalizeCaseObservation(input) {
  if (!isPlainRecord(input)) fail('invalid_case_agent_drive_case_observation', 'Case observation must be a record');
  assertRecordShape(input, ['caseRevision', 'terminal', 'ready'], [
    'terminalReceiptDigest', 'requestId', 'receiptDigest',
  ], 'Case observation');
  assertSafeInteger(input.caseRevision, 'Case observation.caseRevision', { min: 0 });
  if (typeof input.terminal !== 'boolean' || typeof input.ready !== 'boolean') {
    fail('invalid_case_agent_drive_case_observation', 'Case observation terminal/ready must be boolean');
  }
  const terminalReceiptDigest = input.terminalReceiptDigest ?? null;
  if (terminalReceiptDigest !== null) assertDigest(terminalReceiptDigest, 'Case observation.terminalReceiptDigest');
  const requestId = input.requestId ?? null;
  if (requestId !== null) assertIdentifier(requestId, 'Case observation.requestId');
  const receiptDigest = input.receiptDigest ?? null;
  if (receiptDigest !== null) assertDigest(receiptDigest, 'Case observation.receiptDigest');
  if ((requestId === null) !== (receiptDigest === null)) {
    fail('invalid_case_agent_drive_case_observation', 'Case observation requestId/receiptDigest must be paired');
  }
  return deepFreeze({
    caseRevision: input.caseRevision,
    terminal: input.terminal,
    ready: input.ready,
    terminalReceiptDigest,
    requestId,
    receiptDigest,
  });
}

function normalizeAgentObservation(input) {
  if (!isPlainRecord(input)) fail('invalid_case_agent_drive_agent_observation', 'Agent observation must be a record');
  assertRecordShape(input, ['available'], ['deliveryDigest'], 'Agent observation');
  if (typeof input.available !== 'boolean') fail('invalid_case_agent_drive_agent_observation', 'Agent observation.available must be boolean');
  const deliveryDigest = input.deliveryDigest ?? null;
  if (deliveryDigest !== null) assertDigest(deliveryDigest, 'Agent observation.deliveryDigest');
  return deepFreeze({ available: input.available, deliveryDigest });
}

function normalizeDispatchResult(input) {
  if (!isPlainRecord(input)) fail('invalid_case_agent_drive_dispatch_result', 'Drive dispatch result must be a record');
  assertRecordShape(input, ['classification'], ['caseRevision', 'receiptDigest', 'deliveryDigest'], 'Drive dispatch result');
  if (!['accepted', 'exact_replay', 'reconciling', 'not_ready'].includes(input.classification)) {
    fail('invalid_case_agent_drive_dispatch_result', 'Drive dispatch classification is unsupported');
  }
  const caseRevision = input.caseRevision ?? null;
  if (caseRevision !== null) assertSafeInteger(caseRevision, 'Drive dispatch result.caseRevision', { min: 0 });
  const receiptDigest = input.receiptDigest ?? null;
  if (receiptDigest !== null) assertDigest(receiptDigest, 'Drive dispatch result.receiptDigest');
  const deliveryDigest = input.deliveryDigest ?? null;
  if (deliveryDigest !== null) assertDigest(deliveryDigest, 'Drive dispatch result.deliveryDigest');
  if (input.classification === 'reconciling' && receiptDigest !== null) {
    fail('invalid_case_agent_drive_dispatch_result', 'Reconciling dispatch cannot claim a receipt');
  }
  return deepFreeze({ classification: input.classification, caseRevision, receiptDigest, deliveryDigest });
}

function publicResult(input) {
  return deepFreeze(canonicalClone(input));
}

export class MemoryCaseAgentDriveStore {
  #snapshots = new Map();

  load(caseId) {
    assertIdentifier(caseId, 'caseId');
    const snapshot = this.#snapshots.get(caseId);
    return snapshot === undefined ? null : canonicalClone(snapshot);
  }

  create(snapshot) {
    const normalized = normalizeRecord(snapshot);
    if (this.#snapshots.has(normalized.caseId)) fail('case_agent_drive_exists', `Drive record for ${normalized.caseId} already exists`);
    this.#snapshots.set(normalized.caseId, canonicalClone(normalized));
    return true;
  }

  compareAndSwap(caseId, expectedRevision, nextSnapshot) {
    assertIdentifier(caseId, 'caseId');
    assertSafeInteger(expectedRevision, 'expectedRevision', { min: 0 });
    const current = this.#snapshots.get(caseId);
    if (current === undefined || current.revision !== expectedRevision) {
      fail('case_agent_drive_revision_conflict', 'Case-Agent drive store revision changed', {
        caseId,
        expectedRevision,
        actualRevision: current?.revision ?? null,
      });
    }
    const normalized = normalizeRecord(nextSnapshot);
    if (normalized.caseId !== caseId || normalized.revision !== expectedRevision + 1) {
      fail('case_agent_drive_revision_invalid', 'Case-Agent drive CAS successor revision is invalid');
    }
    this.#snapshots.set(caseId, canonicalClone(normalized));
    return true;
  }
}

export class CaseAgentDriveAuthority {
  constructor({ store }) {
    if (!store || typeof store.load !== 'function' || typeof store.create !== 'function' || typeof store.compareAndSwap !== 'function') {
      fail('invalid_case_agent_drive_store', 'Case-Agent drive store must expose load/create/compareAndSwap');
    }
    this.store = store;
  }

  initialize({ caseId, driveRequestId, payload }) {
    const record = createRecord({ caseId, driveRequestId, payload });
    const existing = this.store.load(caseId);
    if (existing !== null) {
      const current = normalizeRecord(existing);
      if (current.driveRequestId !== record.driveRequestId || current.driveRequestDigest !== record.driveRequestDigest) {
        fail('case_agent_drive_request_conflict', 'Drive request identity was reused with changed payload');
      }
      return publicResult({ classification: 'exact_replay', record: current });
    }
    this.store.create(record);
    return publicResult({ classification: 'accepted', record });
  }

  read(caseId) {
    const snapshot = this.store.load(caseId);
    if (snapshot === null) fail('case_agent_drive_not_found', `Drive record for ${caseId} does not exist`);
    return normalizeRecord(snapshot);
  }

  #save(current, mutate) {
    const next = normalizeRecord({ ...canonicalClone(current), ...mutate, revision: current.revision + 1 });
    this.store.compareAndSwap(current.caseId, current.revision, next);
    return next;
  }

  #requestMatches(record, driveRequestId, payload) {
    assertIdentifier(driveRequestId, 'driveRequestId');
    const normalizedPayload = normalizePayload(payload);
    const expected = requestDigest(record.caseId, driveRequestId, normalizedPayload);
    if (record.driveRequestId !== driveRequestId || record.driveRequestDigest !== expected) {
      fail('case_agent_drive_request_conflict', 'Drive request identity or payload does not match the durable intent');
    }
    return normalizedPayload;
  }

  async #readOwners(readCase, readAgent) {
    if (typeof readCase !== 'function' || typeof readAgent !== 'function') {
      fail('invalid_case_agent_drive_reader', 'Drive requires readCase and readAgent callbacks');
    }
    const caseObservation = normalizeCaseObservation(await readCase());
    const agentObservation = normalizeAgentObservation(await readAgent());
    return { caseObservation, agentObservation };
  }

  async reconcile(caseId, { readCase, readAgent } = {}) {
    let record = this.read(caseId);
    const { caseObservation, agentObservation } = await this.#readOwners(readCase, readAgent);
    const ownerReceipt = caseObservation.requestId === record.driveRequestId ? caseObservation.receiptDigest : null;
    const nextStatus = caseObservation.terminal ? 'QUIESCED' : (ownerReceipt === null ? 'RECONCILING' : 'ACTIVE');
    record = this.#save(record, {
      status: nextStatus,
      lastCaseRevision: caseObservation.caseRevision,
      lastDriveReceiptDigest: ownerReceipt ?? record.lastDriveReceiptDigest,
      lastObservedDeliveryDigest: agentObservation.deliveryDigest,
    });
    return publicResult({
      classification: caseObservation.terminal ? 'quiesced' : (ownerReceipt === null ? 'reconciling' : 'exact_replay'),
      record,
      caseObservation,
      agentObservation,
      receiptDigest: ownerReceipt,
    });
  }

  async drive(caseId, { driveRequestId, payload, readCase, readAgent, dispatch } = {}) {
    let record = this.read(caseId);
    const normalizedPayload = this.#requestMatches(record, driveRequestId, payload);
    if (record.status === 'RECONCILING') return this.reconcile(caseId, { readCase, readAgent });
    if (record.status === 'QUIESCED') return publicResult({ classification: 'quiesced', record });
    const { caseObservation, agentObservation } = await this.#readOwners(readCase, readAgent);
    record = this.#save(record, {
      lastCaseRevision: caseObservation.caseRevision,
      lastObservedDeliveryDigest: agentObservation.deliveryDigest,
    });
    if (caseObservation.terminal) {
      record = this.#save(record, {
        status: 'QUIESCED',
        lastDriveReceiptDigest: caseObservation.terminalReceiptDigest ?? record.lastDriveReceiptDigest,
      });
      return publicResult({ classification: 'quiesced', record, caseObservation, agentObservation });
    }
    if (!caseObservation.ready || !agentObservation.available) {
      return publicResult({ classification: 'not_ready', record, caseObservation, agentObservation });
    }
    if (typeof dispatch !== 'function') fail('invalid_case_agent_drive_dispatch', 'Drive requires a dispatch callback when work is ready');
    let outcome;
    try {
      outcome = normalizeDispatchResult(await dispatch(deepFreeze({
        caseId,
        driveRequestId,
        payload: normalizedPayload,
        caseObservation,
        agentObservation,
      })));
    } catch (cause) {
      if (cause?.code !== 'case_agent_drive_response_lost' && cause?.reconcilable !== true) throw cause;
      record = this.#save(record, { status: 'RECONCILING' });
      return publicResult({ classification: 'reconciling', record, caseObservation, agentObservation });
    }
    record = this.#save(record, {
      status: outcome.classification === 'reconciling' ? 'RECONCILING' : 'ACTIVE',
      lastCaseRevision: outcome.caseRevision ?? record.lastCaseRevision,
      lastDriveReceiptDigest: outcome.receiptDigest ?? record.lastDriveReceiptDigest,
      lastObservedDeliveryDigest: outcome.deliveryDigest ?? record.lastObservedDeliveryDigest,
    });
    return publicResult({ classification: outcome.classification, record, caseObservation, agentObservation, outcome });
  }

  quiesce(caseId, { caseRevision, terminalReceiptDigest } = {}) {
    assertSafeInteger(caseRevision, 'caseRevision', { min: 0 });
    assertDigest(terminalReceiptDigest, 'terminalReceiptDigest');
    const record = this.read(caseId);
    const next = this.#save(record, {
      status: 'QUIESCED',
      lastCaseRevision: caseRevision,
      lastDriveReceiptDigest: terminalReceiptDigest,
    });
    return publicResult({ classification: 'quiesced', record: next });
  }

  snapshot(caseId) {
    return this.read(caseId);
  }
}

export function computeCaseAgentDriveRequestDigest({ caseId, driveRequestId, payload }) {
  assertIdentifier(caseId, 'caseId');
  assertIdentifier(driveRequestId, 'driveRequestId');
  return requestDigest(caseId, driveRequestId, normalizePayload(payload));
}

export function caseAgentDriveRecordDigest(record) {
  return digest(normalizeRecord(record));
}
