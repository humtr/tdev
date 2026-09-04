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
import { CaseEngine } from './engine.mjs';
import { definePlan } from './plan.mjs';
import { promote } from './promotion.mjs';
import { promoteSemantic } from './semantic-promotion.mjs';
import { buildSemanticTree } from './semantic-authority.mjs';
import {
  computeAgentActivationRequestDigest,
  computeAgentDeliveryId,
  computeAgentReservationRequestDigest,
} from './agent-delivery-authority.mjs';
import {
  DEVELOPMENT_OPERATION_PROFILE,
  developmentOperationCapabilityId,
  normalizeDevelopmentOperationManifest,
} from './development-operation-profile.mjs';
import {
  MCP_TRIAL_AGENT_RPC_PROFILE,
  normalizeMcpTrialCompositionManifest,
} from './mcp-trial-composition.mjs';
import { normalizeCaseContract } from './policy.mjs';

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024;
const AGENT_PROTOCOL_VERSION = 'tdev-agent-v1';
const TERMINAL_CASE_STATES = new Set(['succeeded', 'failed', 'cancelled', 'unverified']);
const TERMINAL_ATTEMPT_STATES = new Set(['succeeded', 'failed', 'cancelled', 'unverified']);

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function boundedIdentifier(value, label) {
  assertIdentifier(value, label);
  return value;
}

function requestId(label, input) {
  const suffix = digest({ profile: 'tdev.mcp.trial-request.v1', label, input }).slice('sha256:'.length);
  return `trial-${label}-${suffix}`;
}

function snapshotFromOwner(value, label) {
  if (value && typeof value.snapshot === 'function') return canonicalClone(value.snapshot());
  if (isPlainRecord(value)) return canonicalClone(value);
  fail('mcp_trial_owner_invalid_response', `${label} did not return a Case snapshot`);
}

function fixedBaseTree(manifest) {
  return canonicalClone(manifest.repository.context.baseTree);
}

function taskPlan(snapshot, manifest, caseContract) {
  if (!isPlainRecord(snapshot?.plan)) fail('mcp_trial_case_snapshot_invalid', 'Case snapshot has no Plan binding');
  const baseTree = fixedBaseTree(manifest);
  if (snapshot.plan.baseDigest !== manifest.repository.baseDigest || digest(baseTree) !== snapshot.plan.baseDigest) {
    fail('mcp_trial_context_mismatch', 'Case snapshot Plan does not bind the fixed repository base');
  }
  const plan = definePlan({
    revisionId: snapshot.plan.revisionId,
    baseTree,
    tasks: Array.isArray(snapshot.plan.tasks)
      ? snapshot.plan.tasks
      : snapshot.plan.taskOrder?.map((taskId) => snapshot.plan.tasksById?.[taskId]),
  }, { caseContract });
  if (plan.planDigest !== snapshot.plan.planDigest || plan.baseDigest !== manifest.repository.baseDigest) {
    fail('mcp_trial_case_snapshot_invalid', 'Case snapshot Plan digest does not match the fixed trial Plan');
  }
  return plan;
}

function caseContractFrom(snapshot, fallback) {
  if (isPlainRecord(snapshot?.caseContract) && snapshot.caseContract.contractDigest) {
    return normalizeCaseContract({
      caseGrant: snapshot.caseContract.caseGrant,
      workspacePolicy: snapshot.caseContract.workspacePolicy,
      pathPolicy: snapshot.caseContract.pathPolicy,
      limits: snapshot.caseContract.limits,
    });
  }
  return fallback;
}

function caseView(snapshot, manifest, fallbackContract) {
  const caseContract = caseContractFrom(snapshot, fallbackContract);
  const plan = taskPlan(snapshot, manifest, caseContract);
  return { snapshot, plan, caseContract };
}

function readyTaskIds(view, capabilities) {
  if (!isPlainRecord(view.snapshot.taskStates) || view.snapshot.caseState !== 'active') return [];
  return view.plan.taskOrder.filter((taskId) => {
    const task = view.plan.tasksById[taskId];
    const state = view.snapshot.taskStates[taskId];
    if (!task || !state || state.state !== 'pending') return false;
    if (Array.isArray(state.attemptIds) && state.attemptIds.length >= task.execution.retry.maxAttempts) return false;
    if (task.dependencies.some((dependency) => view.snapshot.taskStates[dependency]?.state !== 'succeeded')) return false;
    if (task.kind === 'work' && (task.requiredCapabilities ?? []).some((capability) => !capabilities.includes(capability))) return false;
    return true;
  });
}

function nonterminalAttempts(snapshot, caseId) {
  return Object.values(snapshot.attempts ?? {})
    .filter((attempt) => attempt && !TERMINAL_ATTEMPT_STATES.has(attempt.state) && attempt.id && attempt.taskId)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function occupiedSlots(agentSnapshot) {
  let occupied = 0;
  for (const reservation of Object.values(agentSnapshot?.reservations ?? {})) {
    if (reservation?.status === 'reserved') occupied += reservation.requestedSlots ?? 0;
  }
  for (const delivery of Object.values(agentSnapshot?.deliveries ?? {})) {
    if (delivery?.slotHeld === true) occupied += delivery.requestedSlots ?? 0;
  }
  return occupied;
}

function boundedAgentSummary(agentSnapshot) {
  const connection = agentSnapshot?.connection ?? null;
  const executor = agentSnapshot?.executor ?? null;
  const capacity = agentSnapshot?.capacity ?? null;
  const reservations = Object.values(agentSnapshot?.reservations ?? {})
    .map((entry) => ({ id: entry.reservationRequestId, status: entry.status, caseId: entry.caseId, taskId: entry.taskId, slotGeneration: entry.slotGeneration }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .slice(0, 256);
  const deliveries = Object.values(agentSnapshot?.deliveries ?? {})
    .map((entry) => ({ id: entry.deliveryId, caseId: entry.caseId, taskId: entry.taskId, attemptId: entry.attemptId, slotHeld: entry.slotHeld === true, dispatchCount: Object.keys(entry.dispatches ?? {}).length, terminal: entry.terminalCaseReceipt !== null }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .slice(0, 256);
  return {
    revision: agentSnapshot?.revision ?? null,
    connection: connection === null ? null : { id: connection.id, epoch: connection.epoch, socketIncarnationId: connection.socketIncarnationId ?? null },
    executor: executor === null ? null : { id: executor.id, epoch: executor.epoch },
    capacity: capacity === null ? null : { revision: capacity.revision, effectiveCapacity: capacity.effectiveCapacity },
    reservations,
    deliveries,
  };
}

function agentObservation(agentSnapshot) {
  const capacity = agentSnapshot?.capacity;
  const connection = agentSnapshot?.connection;
  const executor = agentSnapshot?.executor;
  const installableState = agentSnapshot?.installableAgent?.state;
  const routeUsable = installableState === undefined || installableState === 'CURRENT' || installableState === 'LEGACY_D0020_ONLY';
  const available = routeUsable && connection !== null && executor !== null && capacity !== null &&
    Number.isSafeInteger(capacity.effectiveCapacity) && capacity.effectiveCapacity > occupiedSlots(agentSnapshot);
  return {
    available,
    deliveryDigest: digest(boundedAgentSummary(agentSnapshot)),
  };
}

function caseObservation(view, capabilities = []) {
  const terminal = TERMINAL_CASE_STATES.has(view.snapshot.caseState);
  return {
    caseRevision: view.snapshot.caseRevision,
    terminal,
    ready: !terminal && readyTaskIds(view, capabilities).length > 0,
    terminalReceiptDigest: terminal
      ? digest({ caseId: view.snapshot.caseId, caseRevision: view.snapshot.caseRevision, caseState: view.snapshot.caseState })
      : null,
  };
}

function resultForTask(view, taskId) {
  const state = view.snapshot.taskStates?.[taskId];
  return state?.acceptedResult ?? null;
}

function candidateTree(view) {
  const acceptedResults = view.plan.taskOrder
    .filter((taskId) => view.snapshot.taskStates?.[taskId]?.state === 'succeeded' && view.snapshot.taskStates?.[taskId]?.acceptedResult !== null)
    .filter((taskId) => view.plan.tasksById[taskId]?.kind === 'work')
    .map((taskId) => ({ task: view.plan.tasksById[taskId], taskId, result: resultForTask(view, taskId), effectKey: effectKey(view, taskId) }));
  return promote(view.plan.baseTree, acceptedResults, view.plan.baseDigest, { caseContract: view.caseContract }).tree;
}

function effectKey(view, taskId) {
  const engine = new CaseEngine({ caseId: view.snapshot.caseId, plan: view.plan, caseContract: view.caseContract });
  return engine.effectKey(taskId);
}

function promotionResult(view) {
  const task = view.plan.tasksById[view.plan.promotionTaskId];
  const acceptedResults = task.dependencies.map((taskId) => ({
    task: view.plan.tasksById[taskId],
    taskId,
    result: resultForTask(view, taskId),
    effectKey: effectKey(view, taskId),
  }));
  if (view.snapshot.schemaVersion === 3) {
    return promoteSemantic(buildSemanticTree(view.plan.baseTree, view.caseContract), acceptedResults, view.plan.baseDigest, view.caseContract).result;
  }
  return promote(view.plan.baseTree, acceptedResults, view.plan.baseDigest, view.caseContract);
}

function acceptedResultEnvelope(handoff) {
  if (!isPlainRecord(handoff) || !isPlainRecord(handoff.command) || handoff.command.type !== 'accept_result') {
    fail('mcp_trial_result_handoff_invalid', 'Agent result handoff does not contain an accept_result command');
  }
  if (!isPlainRecord(handoff.command.envelope)) fail('mcp_trial_result_handoff_invalid', 'Agent result handoff envelope is invalid');
  return handoff.command;
}

function deliveryForAttempt(agentSnapshot, caseId, attemptId) {
  return Object.values(agentSnapshot?.deliveries ?? {})
    .filter((delivery) => delivery?.caseId === caseId && delivery?.attemptId === attemptId)
    .sort((left, right) => String(left.deliveryId).localeCompare(String(right.deliveryId)))[0] ?? null;
}

function reservationForTask(agentSnapshot, { caseId, taskId, predictedAttemptOrdinal }) {
  return Object.values(agentSnapshot?.reservations ?? {})
    .filter((reservation) => reservation?.caseId === caseId && reservation?.taskId === taskId &&
      reservation?.predictedAttemptOrdinal === predictedAttemptOrdinal && reservation?.status === 'reserved')
    .sort((left, right) => String(left.reservationRequestId).localeCompare(String(right.reservationRequestId)))[0] ?? null;
}

function operationRequest(view, taskId, payload) {
  const task = view.plan.tasksById[taskId];
  if (taskId === 'context') {
    return {
      profile: task.input.profile,
      input: {
        repositoryCommitOid: task.input.repositoryCommitOid,
        baseDigest: task.input.baseDigest,
        objectFormat: task.input.objectFormat,
      },
    };
  }
  if (taskId === 'model') {
    const context = resultForTask(view, 'context');
    const contextReferenceId = context?.value?.referenceId;
    assertIdentifier(contextReferenceId, 'contextReferenceId');
    return {
      profile: task.input.profile,
      input: {
        repositoryCommitOid: task.input.repositoryCommitOid,
        baseDigest: task.input.baseDigest,
        instruction: task.input.instruction,
        contextReferenceId,
      },
    };
  }
  if (taskId === 'validate') {
    const tree = candidateTree(view);
    return {
      profile: task.input.profile,
      input: { candidateTreeDigest: digest(tree), validationProfile: task.input.validationProfile },
    };
  }
  fail('mcp_trial_task_unsupported', `Unsupported development Task ${taskId}`);
}

function executableBody(view, taskId, payload, { predictedAttemptOrdinal, executor } = {}) {
  const operation = operationRequest(view, taskId, payload);
  if (!Number.isSafeInteger(predictedAttemptOrdinal) || predictedAttemptOrdinal < 1) {
    fail('mcp_trial_attempt_identity_invalid', 'Executable body requires a positive predicted Attempt ordinal');
  }
  if (!isPlainRecord(executor) || typeof executor.id !== 'string' || !Number.isSafeInteger(executor.epoch)) {
    fail('mcp_trial_agent_snapshot_invalid', 'Executable body requires the current executor identity');
  }
  return {
    profile: DEVELOPMENT_OPERATION_PROFILE,
    operationRequest: operation,
    // The operation result itself is opaque to the Agent.  This fixed template
    // binds the eventual Case receipt to the Plan/Attempt; the Agent fills only
    // the activated fencing token from the dispatch envelope.
    resultEnvelopeTemplate: {
      caseId: view.snapshot.caseId,
      planRevisionId: view.plan.revisionId,
      planDigest: view.plan.planDigest,
      taskId,
      attemptId: `${taskId}.${predictedAttemptOrdinal}`,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      claimLeaseToken: null,
      claimLeaseGeneration: null,
      claimLeaseClaimsDigest: null,
    },
  };
}

function preflightDescriptor(body, agentSnapshot, taskId) {
  const executableBodyBytes = new TextEncoder().encode(canonicalJson(body)).byteLength;
  const configured = agentSnapshot?.limits?.maxEnvelopeBytes;
  const maxEnvelopeBytes = Number.isSafeInteger(configured) ? configured : MAX_ENVELOPE_BYTES;
  if (executableBodyBytes > maxEnvelopeBytes) fail('mcp_trial_envelope_limit', 'Development operation exceeds the Agent envelope bound');
  return {
    profileId: taskId,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    executableBodyDigest: digest(body),
    executableBodyBytes,
    resourceDimensions: { processSlots: 1 },
    maxEnvelopeBytes,
  };
}

function executorCapabilities(manifest, operationManifest) {
  const profiles = [manifest.operation.contextProfile, manifest.operation.modelProfile, manifest.operation.validationProfile];
  const ids = profiles.map((profile) => developmentOperationCapabilityId(operationManifest, profile));
  for (const field of ['contextCapabilityId', 'modelCapabilityId', 'validationCapabilityId']) {
    const value = manifest.repository.context[field];
    if (value !== undefined && value !== null) ids.push(value);
  }
  return [...new Set(ids)].sort();
}

function routeIdentity(agentOwner) {
  const binding = agentOwner.routeBinding();
  return { agentId: binding.agentId, routeGeneration: binding.routeGeneration };
}

export class McpTrialDevelopmentUnitRunner {
  constructor({ repository, driveOwner, agentOwner, manifest, operationManifest, caseContract = undefined, now = () => Date.now() } = {}) {
    if (!repository || typeof repository.create !== 'function' || typeof repository.load !== 'function' || typeof repository.command !== 'function') {
      fail('mcp_trial_owner_unavailable', 'Trial runner requires Case repository create/load/command');
    }
    if (!driveOwner || typeof driveOwner.initialize !== 'function' || typeof driveOwner.advance !== 'function') {
      fail('mcp_trial_owner_unavailable', 'Trial runner requires Case-Agent drive initialize/advance');
    }
    if (!agentOwner || typeof agentOwner.invoke !== 'function' || typeof agentOwner.readRoute !== 'function' || typeof agentOwner.readResultHandoff !== 'function') {
      fail('mcp_trial_owner_unavailable', 'Trial runner requires Agent RPC/readResultHandoff');
    }
    this.repository = repository;
    this.driveOwner = driveOwner;
    this.agentOwner = agentOwner;
    this.manifest = normalizeMcpTrialCompositionManifest(manifest);
    this.operationManifest = normalizeDevelopmentOperationManifest(operationManifest);
    if (this.operationManifest.profile !== DEVELOPMENT_OPERATION_PROFILE) fail('mcp_trial_manifest_invalid', 'Trial operation manifest profile is invalid');
    if (this.manifest.operation.manifestDigest !== digest(this.operationManifest)) {
      fail('mcp_trial_manifest_mismatch', 'Trial manifest does not bind the supplied development-operation manifest');
    }
    if (typeof now !== 'function') fail('mcp_trial_runner_invalid', 'Trial runner clock must be callable');
    this.now = now;
    this.caseContract = caseContract === undefined
      ? (isPlainRecord(this.manifest.repository.context.caseContract) ? normalizeCaseContract(this.manifest.repository.context.caseContract) : normalizeCaseContract({}))
      : normalizeCaseContract(caseContract);
    this.capabilities = executorCapabilities(this.manifest, this.operationManifest);
    Object.freeze(this);
  }

  async create({ caseId, plan, driveRequestId, payload = {} } = {}) {
    boundedIdentifier(caseId, 'caseId');
    boundedIdentifier(driveRequestId, 'driveRequestId');
    if (!isPlainRecord(plan)) fail('mcp_trial_plan_invalid', 'Trial runner requires a compiled Plan record');
    const created = await this.repository.create({ caseId, plan, caseContract: this.caseContract });
    const drive = await this.driveOwner.initialize({ caseId, driveRequestId, payload });
    return deepFreeze({ caseId, planDigest: plan.planDigest, drive: canonicalClone(drive), created: canonicalClone(created?.snapshot?.() ?? created) });
  }

  async #load(caseId) {
    const loaded = await this.repository.load(caseId);
    if (loaded === null) fail('case_not_found', `Case ${caseId} does not exist`);
    const snapshot = snapshotFromOwner(loaded, 'Case owner');
    return caseView(snapshot, this.manifest, this.caseContract);
  }

  async #readAgent() {
    const snapshot = canonicalClone(await this.agentOwner.readRoute());
    if (!isPlainRecord(snapshot) || !isPlainRecord(snapshot.routeBinding)) fail('mcp_trial_agent_snapshot_invalid', 'Agent owner returned an invalid route snapshot');
    const binding = this.agentOwner.routeBinding();
    if (snapshot.routeBinding.agentId !== binding.agentId || snapshot.routeBinding.routeGeneration !== binding.routeGeneration) {
      fail('mcp_trial_agent_route_mismatch', 'Agent owner read crossed the fixed route identity');
    }
    return snapshot;
  }

  async #advance({ caseId, driveRequestId, payload, view, agentSnapshot, dispatchResult = undefined }) {
    const observation = caseObservation(view, this.capabilities);
    // The drive authority is a cursor owner, not a second Case state owner.  It
    // receives only the fresh bounded observations gathered above.
    const input = {
      caseId,
      driveRequestId,
      payload,
      caseObservation: observation,
      agentObservation: agentObservation(agentSnapshot),
      ...(dispatchResult === undefined ? {} : { dispatchResult }),
    };
    return this.driveOwner.advance(input);
  }

  async #bindHandoff(view, agentSnapshot, delivery, handoff) {
    const command = acceptedResultEnvelope(handoff);
    let currentView = view;
    let caseResponse = null;
    const attempt = currentView.snapshot.attempts?.[delivery.attemptId];
    const taskState = currentView.snapshot.taskStates?.[delivery.taskId];
    if (attempt?.state !== 'succeeded' || taskState?.state !== 'succeeded') {
      const envelope = {
        requestId: handoff.requestId,
        expectedCaseRevision: currentView.snapshot.caseRevision,
        command,
      };
      const transaction = await this.repository.command(currentView.snapshot.caseId, envelope);
      caseResponse = canonicalClone(transaction.result);
      currentView = await this.#load(currentView.snapshot.caseId);
    }
    const refreshedAgent = await this.#readAgent();
    const refreshedDelivery = deliveryForAttempt(refreshedAgent, currentView.snapshot.caseId, delivery.attemptId) ?? delivery;
    if (refreshedDelivery.slotHeld === true) {
      return { view: currentView, agentSnapshot: refreshedAgent, status: 'awaiting_cleanup', caseResponse, command };
    }
    const committedRevision = currentView.snapshot.caseRevision;
    const storedReceipt = currentView.snapshot.receipts?.[handoff.requestId] ?? null;
    if (caseResponse === null && (!isPlainRecord(storedReceipt) || storedReceipt.requestId !== handoff.requestId)) {
      // A succeeded Attempt without the exact Case receipt cannot be bound to
      // the Agent delivery.  Do not synthesize a response: that would create a
      // second, non-authoritative receipt contract across the two owners.
      fail('mcp_trial_case_receipt_missing', 'Accepted result has no matching authoritative Case receipt');
    }
    const response = caseResponse ?? storedReceipt.response;
    const caseReceipt = {
      requestId: handoff.requestId,
      commandDigest: typedDigest('tdev.case-command.v1', command),
      response,
      responseDigest: digest(response),
      committedRevision,
    };
    const bound = await this.agentOwner.invoke('bind_terminal_case_receipt', {
      request: { deliveryId: delivery.deliveryId, command, caseReceipt },
      nowMs: this.now(),
    });
    return { view: currentView, agentSnapshot: await this.#readAgent(), status: 'result_accepted', caseResponse, command, bound };
  }

  async #resumeExisting(view, agentSnapshot, attempt, { caseId } = {}) {
    const delivery = deliveryForAttempt(agentSnapshot, caseId, attempt.id);
    if (delivery === null) {
      return { view, agentSnapshot, status: 'awaiting_delivery', taskId: attempt.taskId, attemptId: attempt.id };
    }
    const handoff = await this.agentOwner.readResultHandoff(delivery.deliveryId);
    if (handoff === null) {
      return { view, agentSnapshot, status: 'awaiting_result', taskId: attempt.taskId, attemptId: attempt.id, deliveryId: delivery.deliveryId };
    }
    return this.#bindHandoff(view, agentSnapshot, delivery, handoff);
  }

  async #dispatchWork(view, agentSnapshot, taskId, { caseId, driveRequestId, payload } = {}) {
    const task = view.plan.tasksById[taskId];
    const route = routeIdentity(this.agentOwner);
    const executor = agentSnapshot.executor;
    if (!isPlainRecord(executor) || typeof executor.id !== 'string' || !Number.isSafeInteger(executor.epoch)) {
      fail('mcp_trial_agent_snapshot_invalid', 'Agent snapshot has no current executor identity');
    }
    const predictedAttemptOrdinal = (view.snapshot.taskStates?.[taskId]?.attemptIds?.length ?? 0) + 1;
    const body = executableBody(view, taskId, payload, {
      predictedAttemptOrdinal,
      executor,
    });
    const descriptor = preflightDescriptor(body, agentSnapshot, taskId);
    const reservationRequestId = requestId('reserve', { driveRequestId, taskId, predictedAttemptOrdinal });
    const reservationRequest = {
      agentId: route.agentId,
      routeGeneration: route.routeGeneration,
      reservationWindowGeneration: agentSnapshot.reservationWindowGeneration,
      reservationRequestId,
      reservationRequestDigest: null,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      capacityRevision: agentSnapshot.capacity?.revision,
      caseId,
      taskId,
      expectedCaseRevision: view.snapshot.caseRevision,
      predictedAttemptOrdinal,
      requestedSlots: 1,
      expiresAtMs: this.now() + Math.min(30_000, agentSnapshot.limits?.maxReservationLifetimeMs ?? 30_000),
      preflightDescriptor: descriptor,
    };
    reservationRequest.reservationRequestDigest = computeAgentReservationRequestDigest(reservationRequest, agentSnapshot.limits);
    let reservation = reservationForTask(agentSnapshot, { caseId, taskId, predictedAttemptOrdinal });
    if (reservation === null) {
      const admitted = await this.agentOwner.invoke('reserve', { request: reservationRequest, nowMs: this.now() });
      reservation = admitted?.reservation ?? null;
      if (reservation === null) {
        return { view, agentSnapshot: await this.#readAgent(), status: 'not_ready', taskId, dispatchResult: { classification: 'not_ready' } };
      }
    }

    let latestView = view;
    let attempt = Object.values(latestView.snapshot.attempts ?? {}).find((entry) => entry.id === `${taskId}.${predictedAttemptOrdinal}`) ?? null;
    if (attempt === null) {
      const startRequestId = requestId('start', { driveRequestId, taskId, predictedAttemptOrdinal });
      const started = await this.repository.command(caseId, {
        requestId: startRequestId,
        expectedCaseRevision: latestView.snapshot.caseRevision,
        command: {
          type: 'start_attempt',
          taskId,
          executor: { id: executor.id, epoch: executor.epoch, capabilities: this.capabilities },
        },
      });
      attempt = canonicalClone(started.result);
      latestView = await this.#load(caseId);
    }
    if (!attempt || attempt.id !== `${taskId}.${predictedAttemptOrdinal}`) fail('mcp_trial_attempt_identity_invalid', 'Case owner returned a different Attempt identity');

    const activationRequestId = requestId('activate', { driveRequestId, taskId, attemptId: attempt.id });
    const deliveryId = computeAgentDeliveryId({
      agentId: route.agentId,
      routeGeneration: route.routeGeneration,
      caseId,
      taskId,
      attemptId: attempt.id,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
    });
    const existingDelivery = deliveryForAttempt(agentSnapshot, caseId, attempt.id);
    if (existingDelivery === null) {
      const activationRequest = {
        agentId: route.agentId,
        routeGeneration: route.routeGeneration,
        activationRequestId,
        activationRequestDigest: null,
        reservationWindowGeneration: reservation.windowGeneration,
        reservationRequestId: reservation.reservationRequestId,
        reservationRequestDigest: reservation.reservationRequestDigest,
        slotToken: reservation.slotToken,
        slotGeneration: reservation.slotGeneration,
        deliveryId,
        caseId,
        taskId,
        attemptId: attempt.id,
        attemptOrdinal: attempt.ordinal,
        executorId: attempt.executorId,
        executorEpoch: attempt.executorEpoch,
        fencingToken: attempt.fencingToken,
        sourceCaseRevision: latestView.snapshot.caseRevision,
        executableBodyDigest: descriptor.executableBodyDigest,
        executableBodyBytes: descriptor.executableBodyBytes,
        envelopeBytes: descriptor.maxEnvelopeBytes,
        protocolVersion: descriptor.protocolVersion,
        effectKey: attempt.effectKey,
      };
      activationRequest.activationRequestDigest = computeAgentActivationRequestDigest(activationRequest);
      await this.agentOwner.invoke('activate_delivery', { request: activationRequest, nowMs: this.now() });
    }
    const activatedAgent = await this.#readAgent();
    const delivery = deliveryForAttempt(activatedAgent, caseId, attempt.id);
    if (delivery === null) fail('mcp_trial_delivery_missing', 'Agent did not retain the activated delivery');

    const grantCommand = await this.agentOwner.invoke('grant_command', { deliveryId: delivery.deliveryId });
    const grantRequestId = requestId('grant', { driveRequestId, taskId, attemptId: attempt.id, deliveryId: delivery.deliveryId });
    const grantTransaction = await this.repository.command(caseId, {
      requestId: grantRequestId,
      expectedCaseRevision: latestView.snapshot.caseRevision,
      command: grantCommand,
    });
    const grantReceipt = grantTransaction.result;
    const send = await this.agentOwner.invoke('send_dispatch', {
      authorization: {
        grantRequestId,
        command: grantCommand,
        dispatchGrantId: grantReceipt.dispatchGrantId,
        committedCaseRevision: grantReceipt.committedCaseRevision,
        event: grantReceipt.event,
      },
      executableBody: body,
    });
    const afterView = await this.#load(caseId);
    const afterAgent = await this.#readAgent();
    const sendClassification = send?.classification === 'sent' || send?.classification === 'exact_replay' ? 'accepted' : 'not_ready';
    const advanced = await this.#advance({
      caseId,
      driveRequestId,
      payload,
      view: afterView,
      agentSnapshot: afterAgent,
      dispatchResult: { classification: sendClassification, caseRevision: afterView.snapshot.caseRevision, deliveryDigest: agentObservation(afterAgent).deliveryDigest },
    });
    return {
      view: afterView,
      agentSnapshot: afterAgent,
      status: sendClassification === 'accepted' ? 'dispatched' : 'awaiting_agent',
      taskId,
      attemptId: attempt.id,
      deliveryId: delivery.deliveryId,
      send: { classification: send?.classification ?? null, sent: send?.sent === true },
      drive: advanced,
    };
  }

  async #promote(view, { caseId, driveRequestId, payload } = {}) {
    const taskId = view.plan.promotionTaskId;
    const taskState = view.snapshot.taskStates?.[taskId];
    const ordinal = (taskState?.attemptIds?.length ?? 0) + 1;
    const executor = { id: 'tdev-trial-promotion', epoch: 1, capabilities: [] };
    const started = await this.repository.command(caseId, {
      requestId: requestId('promotion-start', { driveRequestId, taskId, ordinal }),
      expectedCaseRevision: view.snapshot.caseRevision,
      command: { type: 'start_attempt', taskId, executor },
    });
    const attempt = started.result;
    const latest = await this.#load(caseId);
    const result = promotionResult(latest);
    const promotionEnvelope = {
      caseId,
      planRevisionId: latest.plan.revisionId,
      planDigest: latest.plan.planDigest,
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
    // The attempt identity/fence comes from the authoritative remote Case
    // read.  Do not infer or mint a new fence locally.
    const accepted = await this.repository.command(caseId, {
      requestId: requestId('promotion-accept', { driveRequestId, attemptId: attempt.id }),
      expectedCaseRevision: latest.snapshot.caseRevision,
      command: { type: 'accept_result', envelope: promotionEnvelope },
    });
    const finalView = await this.#load(caseId);
    const finalAgent = await this.#readAgent();
    const advanced = await this.#advance({
      caseId,
      driveRequestId,
      payload,
      view: finalView,
      agentSnapshot: finalAgent,
      dispatchResult: { classification: 'accepted', caseRevision: finalView.snapshot.caseRevision },
    });
    return { view: finalView, agentSnapshot: finalAgent, status: 'promoted', taskId, attemptId: attempt.id, accepted: canonicalClone(accepted.result), drive: advanced };
  }

  async drive({ caseId, driveRequestId, payload = {} } = {}) {
    boundedIdentifier(caseId, 'caseId');
    boundedIdentifier(driveRequestId, 'driveRequestId');
    const initial = await this.#load(caseId);
    let view = initial;
    let agentSnapshot = await this.#readAgent();
    const attempts = nonterminalAttempts(view.snapshot, caseId);
    let action = null;
    if (attempts.length > 0) {
      action = await this.#resumeExisting(view, agentSnapshot, attempts[0], { caseId });
      view = action.view;
      agentSnapshot = action.agentSnapshot;
      if (action.status === 'result_accepted') {
        // One bounded drive call may consume a completed handoff and immediately
        // admit the next ready Task; it never creates more than one physical send.
        const next = readyTaskIds(view, this.capabilities)[0];
        if (next !== undefined) {
          action = view.plan.tasksById[next].kind === 'promotion'
            ? await this.#promote(view, { caseId, driveRequestId, payload })
            : await this.#dispatchWork(view, agentSnapshot, next, { caseId, driveRequestId, payload });
          view = action.view;
          agentSnapshot = action.agentSnapshot;
        }
      }
    } else {
      const next = readyTaskIds(view, this.capabilities)[0];
      if (next === undefined) {
        const drive = await this.#advance({ caseId, driveRequestId, payload, view, agentSnapshot });
        action = { status: TERMINAL_CASE_STATES.has(view.snapshot.caseState) ? 'quiesced' : 'not_ready', drive };
      } else if (view.plan.tasksById[next].kind === 'promotion') {
        action = await this.#promote(view, { caseId, driveRequestId, payload });
        view = action.view;
        agentSnapshot = action.agentSnapshot;
      } else if (!agentObservation(agentSnapshot).available) {
        const drive = await this.#advance({ caseId, driveRequestId, payload, view, agentSnapshot });
        action = { status: 'not_ready', drive };
      } else {
        action = await this.#dispatchWork(view, agentSnapshot, next, { caseId, driveRequestId, payload });
        view = action.view;
        agentSnapshot = action.agentSnapshot;
      }
    }
    const finalView = await this.#load(caseId);
    if (action?.drive === undefined) {
      action.drive = await this.#advance({
        caseId,
        driveRequestId,
        payload,
        view: finalView,
        agentSnapshot,
        dispatchResult: caseObservation(finalView, this.capabilities).ready && agentObservation(agentSnapshot).available
          ? { classification: 'not_ready' }
          : undefined,
      });
    }
    const result = {
      caseId,
      caseState: finalView.snapshot.caseState,
      caseRevision: finalView.snapshot.caseRevision,
      status: action?.status ?? 'not_ready',
      ...(action?.taskId === undefined ? {} : { taskId: action.taskId }),
      ...(action?.attemptId === undefined ? {} : { attemptId: action.attemptId }),
      ...(action?.deliveryId === undefined ? {} : { deliveryId: action.deliveryId }),
      ...(action?.send === undefined ? {} : { send: action.send }),
      ...(action?.bound === undefined ? {} : { bound: canonicalClone(action.bound) }),
      drive: action?.drive === undefined ? null : canonicalClone(action.drive),
    };
    return deepFreeze(result);
  }

  async candidate(caseId) {
    const view = await this.#load(caseId);
    return deepFreeze({
      caseId,
      caseState: view.snapshot.caseState,
      caseRevision: view.snapshot.caseRevision,
      canonicalTree: candidateTree(view),
      canonicalDigest: view.snapshot.semanticAuthority?.canonicalRoot?.rootDigest ?? digest(candidateTree(view)),
      planDigest: view.plan.planDigest,
    });
  }
}

export function createMcpTrialDevelopmentUnitRunner(options) {
  return new McpTrialDevelopmentUnitRunner(options);
}
