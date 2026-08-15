import { createHash } from 'node:crypto';
import {
  canonicalJson,
  isPlainRecord,
  strictJsonParse,
} from '../src/canonical.mjs';
import { definePlan } from '../src/engine.mjs';
import { D0019_QUALIFICATION_MAX_REQUEST_BYTES } from '../src/d0019-qualification-runtime.mjs';

export const D0019_LIVE_RESPONSE_MAX_BYTES = 16 * 1024 * 1024;

const QUALIFICATION_PATH = '/qualification/d0019/v1';
const textEncoder = new TextEncoder();

export class D0019LiveQualificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'D0019LiveQualificationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new D0019LiveQualificationError(code, message, details);
}

function assert(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function caseIdDigest(caseId) {
  return sha256(`tdev.d0019.qualification-case.v1\0${caseId}`);
}

function responseErrorCode(response) {
  return response?.body?.ok === false && typeof response.body?.error?.code === 'string'
    ? response.body.error.code
    : null;
}

function assertOk(response, stage) {
  assert(response?.status === 200 && response.body?.ok === true, 'qualification_unexpected_response', `${stage} did not return a successful qualification response`, {
    stage,
    status: response?.status ?? null,
    errorCode: responseErrorCode(response),
    transportError: response?.transportError ?? null,
  });
  return response.body.result;
}

function assertError(response, code, stage) {
  assert(response?.body?.ok === false && responseErrorCode(response) === code, 'qualification_unexpected_error', `${stage} did not fail with ${code}`, {
    stage,
    status: response?.status ?? null,
    errorCode: responseErrorCode(response),
    transportError: response?.transportError ?? null,
  });
}

function assertAmbiguousFailure(response, stage) {
  assert(response?.status !== 200 || response?.body?.ok !== true, 'qualification_fault_not_observed', `${stage} unexpectedly returned success`, {
    stage,
    status: response?.status ?? null,
    errorCode: responseErrorCode(response),
  });
}

async function readBoundedResponse(response, maxBytes) {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    fail('qualification_response_too_large', 'Qualification response exceeded its local byte bound', { maxBytes });
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      fail('qualification_response_too_large', 'Qualification response exceeded its local byte bound', { maxBytes });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function validateEndpointUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('invalid_qualification_endpoint', 'Qualification endpoint URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    fail('invalid_qualification_endpoint', 'Qualification endpoint must be a credential-free HTTPS origin');
  }
  url.pathname = QUALIFICATION_PATH;
  return url.toString();
}

export class D0019QualificationHttpEndpoint {
  constructor({ scriptName, origin, token, fetchImpl = globalThis.fetch, timeoutMs = 60_000, maxResponseBytes = D0019_LIVE_RESPONSE_MAX_BYTES }) {
    if (typeof scriptName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(scriptName)) {
      fail('invalid_qualification_endpoint', 'Qualification script name is invalid');
    }
    const tokenBytes = typeof token === 'string' ? textEncoder.encode(token).byteLength : 0;
    if (typeof token !== 'string' || token.includes('\0') || tokenBytes < 32 || tokenBytes > 512) {
      fail('invalid_qualification_token', 'Qualification endpoint token is invalid');
    }
    if (typeof fetchImpl !== 'function') fail('invalid_qualification_endpoint', 'Qualification endpoint requires fetch');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
      fail('invalid_qualification_endpoint', 'Qualification endpoint bounds are invalid');
    }
    this.scriptName = scriptName;
    this.url = validateEndpointUrl(origin);
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }

  async invoke(input) {
    const requestBytes = canonicalJson(input);
    if (textEncoder.encode(requestBytes).byteLength > D0019_QUALIFICATION_MAX_REQUEST_BYTES) {
      fail('qualification_request_too_large', 'Qualification request exceeded its local byte bound', {
        maxBytes: D0019_QUALIFICATION_MAX_REQUEST_BYTES,
      });
    }
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: requestBytes,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return Object.freeze({ scriptName: this.scriptName, status: null, body: null, transportError: 'request_unavailable' });
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
    let bytes;
    try {
      bytes = await readBoundedResponse(response, this.maxResponseBytes);
    } catch (error) {
      if (error instanceof D0019LiveQualificationError) throw error;
      return Object.freeze({ scriptName: this.scriptName, status: response.status, body: null, transportError: 'response_unavailable' });
    }
    if (contentType !== 'application/json') {
      return Object.freeze({ scriptName: this.scriptName, status: response.status, body: null, transportError: 'non_json_response' });
    }
    let body;
    try {
      body = strictJsonParse(bytes, { maxBytes: this.maxResponseBytes });
    } catch {
      return Object.freeze({ scriptName: this.scriptName, status: response.status, body: null, transportError: 'invalid_json_response' });
    }
    if (!isPlainRecord(body) || typeof body.ok !== 'boolean') {
      return Object.freeze({ scriptName: this.scriptName, status: response.status, body: null, transportError: 'invalid_response_shape' });
    }
    return Object.freeze({ scriptName: this.scriptName, status: response.status, body, transportError: null });
  }
}

export function buildD0019CoreQualificationPlan() {
  return definePlan({
    revisionId: 'd0019-live-core-v1',
    baseTree: { 'seed.txt': 'D0019 provider qualification fixture' },
    tasks: [
      { id: 'task-a', kind: 'work', dependencies: [], claims: [], input: {} },
      { id: 'task-b', kind: 'work', dependencies: [], claims: [], input: {} },
      { id: 'task-c', kind: 'work', dependencies: [], claims: [], input: {} },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: ['task-a', 'task-b', 'task-c'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function qualificationResultEnvelope(snapshot, plan, attemptId, content) {
  const attempt = snapshot.attempts?.[attemptId];
  assert(attempt?.state === 'running', 'qualification_state_mismatch', 'Qualification result requires one exact running Attempt');
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
    result: {
      kind: 'changeset',
      baseDigest: plan.baseDigest,
      writes: [{ path: 'qualification-output.txt', content }],
    },
  };
}

function findRunningAttempt(snapshot, taskId) {
  return Object.values(snapshot.attempts ?? {}).find((attempt) => attempt?.taskId === taskId && attempt?.state === 'running') ?? null;
}

function receiptPresent(snapshot, requestId) {
  return Object.hasOwn(snapshot.receipts ?? {}, requestId);
}

async function readCase(endpoint, caseId, { attempts = 10, delayMs = 250, sleepImpl = (duration) => new Promise((resolve) => setTimeout(resolve, duration)) } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await endpoint.invoke({ operation: 'load', caseId });
    if (last?.status === 200 && last.body?.ok === true) return last.body.result;
    if (attempt + 1 < attempts) await sleepImpl(delayMs);
  }
  assertOk(last, 'authoritative Case reread');
}

function revision(snapshot) {
  const value = snapshot?.caseRevision;
  assert(Number.isSafeInteger(value) && value >= 0, 'qualification_state_mismatch', 'Qualification snapshot revision is invalid');
  return value;
}

function assertStateUnchanged(before, after, stage) {
  assert(revision(after.snapshot) === revision(before.snapshot) && after.head?.headDigest === before.head?.headDigest,
    'qualification_unexpected_mutation', `${stage} changed authoritative state`, {
      stage,
      beforeRevision: revision(before.snapshot),
      afterRevision: revision(after.snapshot),
    });
}

function safeOutcome(response) {
  return {
    scriptName: response.scriptName,
    status: response.status,
    ok: response.body?.ok === true,
    errorCode: responseErrorCode(response),
    transportError: response.transportError,
  };
}

export async function runD0019CoreProviderProof({
  endpoints,
  caseId,
  readPlacement,
  plan = buildD0019CoreQualificationPlan(),
  readOptions = {},
}) {
  assert(Array.isArray(endpoints) && endpoints.length === 2, 'invalid_qualification_configuration', 'Core provider proof requires exactly two endpoints');
  assert(endpoints.every((endpoint) => endpoint && typeof endpoint.scriptName === 'string' && typeof endpoint.invoke === 'function'),
    'invalid_qualification_configuration', 'Core provider proof endpoints are invalid');
  assert(endpoints[0].scriptName !== endpoints[1].scriptName, 'invalid_qualification_configuration', 'Core provider proof endpoints must use different scripts');
  assert(typeof caseId === 'string' && caseId.length > 0, 'invalid_qualification_configuration', 'Core provider proof CaseId is invalid');
  assert(typeof readPlacement === 'function', 'invalid_qualification_configuration', 'Core provider proof requires D1 readback');

  const electionInput = { operation: 'elect', caseId };
  const initialElection = await Promise.all(endpoints.map((endpoint) => endpoint.invoke(electionInput)));
  assert(initialElection.filter((response) => response.status === 200 && response.body?.ok === true).length <= 1,
    'placement_multiple_winners', 'Concurrent placement election returned multiple winners');

  const reconciledElection = await Promise.all(endpoints.map((endpoint) => endpoint.invoke(electionInput)));
  const winners = reconciledElection.filter((response) => response.status === 200 && response.body?.ok === true);
  const losers = reconciledElection.filter((response) => responseErrorCode(response) === 'placement_conflict');
  assert(winners.length === 1 && losers.length === 1, 'placement_single_winner_unverified', 'Placement election did not reconcile to one exact winner and one conflict', {
    outcomes: reconciledElection.map(safeOutcome),
  });
  const winner = endpoints.find((endpoint) => endpoint.scriptName === winners[0].scriptName);
  const loser = endpoints.find((endpoint) => endpoint.scriptName === losers[0].scriptName);
  const electedPlacement = winners[0].body.result;
  const storedPlacement = await readPlacement(caseId);
  assert(canonicalJson(storedPlacement) === canonicalJson(electedPlacement), 'placement_readback_mismatch', 'D1 placement readback did not match the elected winner');

  const loserInitialization = await loser.invoke({ operation: 'initialize', caseId, plan });
  assertError(loserInitialization, 'placement_conflict', 'losing placement initialization');
  const initialized = assertOk(await winner.invoke({ operation: 'initialize', caseId, plan }), 'winning placement initialization');
  assert(initialized.snapshot?.caseId === caseId, 'qualification_state_mismatch', 'Initialized Case identity did not match');
  const initialAuthoritativeBytes = initialized.authoritativeBytes;

  const beforeRace = await readCase(winner, caseId, readOptions);
  const raceRevision = revision(beforeRace.snapshot);
  const startEnvelope = {
    requestId: 'core-race-start-a',
    expectedCaseRevision: raceRevision,
    command: { type: 'start_attempt', taskId: 'task-a', executor: 'qualification-agent' },
  };
  const cancelEnvelope = {
    requestId: 'core-race-cancel-b',
    expectedCaseRevision: raceRevision,
    command: { type: 'cancel_task', taskId: 'task-b', reason: 'qualification revision race' },
  };
  const raceResponses = await Promise.all([
    winner.invoke({ operation: 'command', caseId, envelope: startEnvelope }),
    winner.invoke({ operation: 'command', caseId, envelope: cancelEnvelope }),
  ]);
  const afterRace = await readCase(winner, caseId, readOptions);
  const raceReceipts = [startEnvelope.requestId, cancelEnvelope.requestId].filter((requestId) => receiptPresent(afterRace.snapshot, requestId));
  assert(raceReceipts.length === 1, 'revision_single_winner_unverified', 'Concurrent current-revision commands did not leave exactly one receipt');
  const winningEnvelope = raceReceipts[0] === startEnvelope.requestId ? startEnvelope : cancelEnvelope;
  const losingEnvelope = winningEnvelope === startEnvelope ? cancelEnvelope : startEnvelope;
  assert(revision(afterRace.snapshot) > raceRevision, 'qualification_state_mismatch', 'Concurrent command winner did not advance the Case revision');

  const replay = assertOk(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: { ...winningEnvelope, expectedCaseRevision: revision(afterRace.snapshot) },
  }), 'changed-revision receipt replay');
  assert(replay.deduplicated === true, 'receipt_replay_unverified', 'Changed-revision exact receipt replay was not deduplicated');
  assertError(await winner.invoke({ operation: 'command', caseId, envelope: losingEnvelope }), 'revision_conflict', 'losing revision retry');

  let running = findRunningAttempt(afterRace.snapshot, 'task-a');
  let runningState = afterRace;
  if (!running) {
    const ensured = assertOk(await winner.invoke({
      operation: 'command',
      caseId,
      envelope: {
        requestId: 'core-ensure-running-a',
        expectedCaseRevision: revision(afterRace.snapshot),
        command: { type: 'start_attempt', taskId: 'task-a', executor: 'qualification-agent' },
      },
    }), 'running-before-dispatch command');
    assert(ensured.deduplicated === false, 'running_before_dispatch_unverified', 'Running transition was unexpectedly deduplicated');
    runningState = await readCase(winner, caseId, readOptions);
    running = findRunningAttempt(runningState.snapshot, 'task-a');
  }
  assert(running !== null, 'running_before_dispatch_unverified', 'Committed running Attempt was not readable before any dispatch');

  const beforeAbort = runningState;
  const abortResponse = await winner.invoke({ operation: 'abort_instance', caseId });
  assertAmbiguousFailure(abortResponse, 'provider instance abort');
  const afterAbort = await readCase(winner, caseId, readOptions);
  assertStateUnchanged(beforeAbort, afterAbort, 'ordinary provider instance reconstruction');
  assert(findRunningAttempt(afterAbort.snapshot, 'task-a')?.id === running.id,
    'ordinary_reconstruction_reopened_attempt', 'Ordinary provider reconstruction changed the live Attempt');

  const validEnvelopeBeforeRecovery = qualificationResultEnvelope(afterAbort.snapshot, plan, running.id, 'accepted-result');
  const staleEnvelope = {
    ...validEnvelopeBeforeRecovery,
    fencingToken: `sha256:${'0'.repeat(64)}`,
  };
  const staleRequestId = 'core-stale-result';
  assertError(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: {
      requestId: staleRequestId,
      expectedCaseRevision: revision(afterAbort.snapshot),
      command: { type: 'accept_result', envelope: staleEnvelope },
    },
  }), 'stale_result', 'stale result fencing');
  const afterStale = await readCase(winner, caseId, readOptions);
  assertStateUnchanged(afterAbort, afterStale, 'stale result rejection');
  assert(!receiptPresent(afterStale.snapshot, staleRequestId), 'stale_result_mutated', 'Stale result rejection persisted a receipt');

  const responseLossEnvelope = {
    requestId: 'core-response-loss-cancel-c',
    expectedCaseRevision: revision(afterStale.snapshot),
    command: { type: 'cancel_task', taskId: 'task-c', reason: 'qualification response loss' },
  };
  const responseLoss = await winner.invoke({ operation: 'command_then_abort', caseId, envelope: responseLossEnvelope });
  assertAmbiguousFailure(responseLoss, 'postcommit response loss');
  const afterResponseLoss = await readCase(winner, caseId, readOptions);
  assert(receiptPresent(afterResponseLoss.snapshot, responseLossEnvelope.requestId),
    'response_loss_receipt_missing', 'Postcommit response loss did not leave the authoritative receipt');
  const lostRevision = revision(afterResponseLoss.snapshot);
  const responseLossReplay = assertOk(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: { ...responseLossEnvelope, expectedCaseRevision: lostRevision },
  }), 'postcommit response-loss replay');
  assert(responseLossReplay.deduplicated === true, 'response_loss_replay_unverified', 'Postcommit response-loss replay was not deduplicated');
  const afterResponseLossReplay = await readCase(winner, caseId, readOptions);
  assert(revision(afterResponseLossReplay.snapshot) === lostRevision, 'response_loss_replayed_mutation', 'Response-loss replay advanced the Case twice');

  const recoveryCause = { kind: 'execution-owner-loss', observation: 'D0019 qualification explicit recovery' };
  const recoveryId = 'core-owner-loss-1';
  const recovered = assertOk(await winner.invoke({ operation: 'recover_execution_owner_loss', caseId, recoveryId, cause: recoveryCause }), 'explicit owner-loss recovery');
  assert(recovered.deduplicated === false, 'owner_loss_recovery_unverified', 'First explicit recovery was unexpectedly deduplicated');
  const afterRecovery = await readCase(winner, caseId, readOptions);
  assert(afterRecovery.snapshot.attempts?.[running.id]?.state === 'interrupted' && afterRecovery.snapshot.taskStates?.['task-a']?.state === 'pending',
    'owner_loss_recovery_unverified', 'Explicit owner-loss recovery did not interrupt and reopen the running Task');
  const recoveryReplay = assertOk(await winner.invoke({ operation: 'recover_execution_owner_loss', caseId, recoveryId, cause: recoveryCause }), 'owner-loss recovery replay');
  assert(recoveryReplay.deduplicated === true && recoveryReplay.caseRevision === revision(afterRecovery.snapshot),
    'owner_loss_recovery_replay_unverified', 'Exact recovery replay was not stable');
  assertError(await winner.invoke({
    operation: 'recover_execution_owner_loss',
    caseId,
    recoveryId,
    cause: { kind: 'different-owner-loss' },
  }), 'recovery_conflict', 'conflicting recovery replay');

  const restarted = assertOk(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: {
      requestId: 'core-start-result-attempt',
      expectedCaseRevision: revision(afterRecovery.snapshot),
      command: { type: 'start_attempt', taskId: 'task-a', executor: 'qualification-agent' },
    },
  }), 'post-recovery Attempt start');
  const resultAttemptId = restarted.response?.id;
  const beforeAcceptedResult = await readCase(winner, caseId, readOptions);
  const acceptedResultEnvelope = qualificationResultEnvelope(beforeAcceptedResult.snapshot, plan, resultAttemptId, 'accepted-result');
  const acceptedRequest = {
    requestId: 'core-accepted-result',
    expectedCaseRevision: revision(beforeAcceptedResult.snapshot),
    command: { type: 'accept_result', envelope: acceptedResultEnvelope },
  };
  assertOk(await winner.invoke({ operation: 'command', caseId, envelope: acceptedRequest }), 'accepted result');
  const afterAcceptedResult = await readCase(winner, caseId, readOptions);
  const acceptedReplay = assertOk(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: { ...acceptedRequest, expectedCaseRevision: revision(afterAcceptedResult.snapshot) },
  }), 'accepted result replay');
  assert(acceptedReplay.deduplicated === true, 'accepted_result_replay_unverified', 'Accepted result replay was not deduplicated');
  assertError(await winner.invoke({
    operation: 'command',
    caseId,
    envelope: {
      requestId: 'core-conflicting-result',
      expectedCaseRevision: revision(afterAcceptedResult.snapshot),
      command: {
        type: 'accept_result',
        envelope: qualificationResultEnvelope(beforeAcceptedResult.snapshot, plan, resultAttemptId, 'contradictory-result'),
      },
    },
  }), 'duplicate_result_conflict', 'conflicting duplicate result');
  const finalState = await readCase(winner, caseId, readOptions);
  assert(revision(finalState.snapshot) === revision(afterAcceptedResult.snapshot), 'duplicate_result_mutated', 'Conflicting duplicate result advanced the Case');

  return Object.freeze({
    schemaVersion: 1,
    evidenceKind: 'd0019-live-core-provider-proof',
    caseIdDigest: caseIdDigest(caseId),
    planDigest: plan.planDigest,
    placement: {
      winnerScript: winner.scriptName,
      loserScript: loser.scriptName,
      placementGeneration: electedPlacement.placementGeneration,
      placementDigest: electedPlacement.placementDigest,
      d1ReadbackDigest: sha256(canonicalJson(storedPlacement)),
      initialOutcomes: initialElection.map(safeOutcome),
      reconciledOutcomes: reconciledElection.map(safeOutcome),
    },
    authority: {
      initialRevision: initialized.caseRevision,
      finalRevision: revision(finalState.snapshot),
      initialAuthoritativeBytes,
      finalAuthoritativeBytes: finalState.authoritativeBytes,
      revisionRaceWinnerRequestId: winningEnvelope.requestId,
      revisionRaceOutcomes: raceResponses.map(safeOutcome),
      runningAttemptPersistedBeforeDispatch: true,
      ordinaryAbortPreservedRunningAttempt: true,
      staleResultRejectedWithoutMutation: true,
      responseLossReceiptReconciled: true,
      explicitRecoveryCommittedOnce: true,
      acceptedResultReplayDeduplicated: true,
      conflictingResultRejectedWithoutMutation: true,
    },
  });
}
