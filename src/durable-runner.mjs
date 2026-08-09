import { ContractError, assertIdentifier, assertRecordShape, canonicalJson } from './canonical.mjs';
import { CaseEngine } from './engine.mjs';
import { runCaseWithHooks } from './runner.mjs';

const RUNNER_OPTIONS = [
  'capacity',
  'claimLedger',
  'waitForClaims',
  'globalClaimPredicate',
  'executorCapabilities',
  'executorIdentity',
  'signal',
];

function assertRepository(repository) {
  if (!repository ||
      typeof repository.load !== 'function' ||
      typeof repository.checkpoint !== 'function' ||
      typeof repository.restoreSnapshot !== 'function' ||
      !repository.store) {
    throw new ContractError(
      'invalid_case_repository',
      'Durable runner requires a repository with load(), checkpoint(), restoreSnapshot(), and store',
    );
  }
}

async function assertStoreCapacity(store, snapshot, { required = false } = {}) {
  if (typeof store.assertSnapshotCapacity !== 'function') {
    if (required) {
      throw new ContractError(
        'store_capacity_unknown',
        'External-effect dispatch requires a SnapshotStore capacity assertion',
      );
    }
    return null;
  }
  return store.assertSnapshotCapacity(snapshot);
}

function maximalEffectReceipt(engine, task, attempt) {
  const template = {
    kind: 'effect-receipt',
    effectKey: attempt.effectKey,
    operation: task.execution.operation,
    outcome: 'applied',
    receipt: '',
    evidence: null,
  };
  const overhead = Buffer.byteLength(canonicalJson(template), 'utf8');
  const payloadBytes = engine.caseContract.limits.maxEvidenceBytes - overhead;
  if (payloadBytes < 0) {
    throw new ContractError(
      'effect_receipt_limit_exceeded',
      `Task ${task.id} cannot encode even an empty effect receipt within maxEvidenceBytes`,
    );
  }
  return { ...template, receipt: 'x'.repeat(payloadBytes) };
}

function maximalReconciliationEvidence(engine) {
  const limit = engine.caseContract.limits.maxEvidenceBytes;
  if (limit < 2) return null;
  return 'x'.repeat(limit - 2);
}

async function assertExternalEffectCapacity(repository, engine, taskId, executorIdentity, claimLease, claimLedger) {
  const { store } = repository;
  if (typeof store.assertSnapshotCapacity !== 'function') {
    throw new ContractError(
      'store_capacity_unknown',
      'External-effect dispatch requires a SnapshotStore capacity assertion',
      { taskId },
    );
  }
  const task = engine.plan.tasksById[taskId];
  const sourceSnapshot = engine.snapshot();
  const errorMessage = 'x'.repeat(engine.caseContract.limits.maxErrorMessageBytes);

  async function startPreview() {
    const preview = repository.restoreSnapshot(sourceSnapshot, { reopen: false });
    const attempt = preview.startAttempt(taskId, executorIdentity, {
      claimLease,
      claimValidator: claimLedger,
    });
    await assertStoreCapacity(store, preview.snapshot(), { required: true });
    return { preview, attempt };
  }

  {
    const { preview, attempt } = await startPreview();
    const result = maximalEffectReceipt(preview, task, attempt);
    preview.acceptResult(preview.resultEnvelope(attempt.id, result), {
      claimValidator: claimLedger,
    });
    await assertStoreCapacity(store, preview.snapshot(), { required: true });
  }

  {
    const { preview, attempt } = await startPreview();
    preview.recordExecutorFailure(attempt.id, {
      code: 'capacity_preview_failure',
      message: errorMessage,
      certainty: 'unknown',
      retryable: true,
    });
    await assertStoreCapacity(store, preview.snapshot(), { required: true });
  }

  {
    const { preview, attempt } = await startPreview();
    preview.recordExecutorFailure(attempt.id, {
      code: 'capacity_preview_uncertain',
      message: errorMessage,
      certainty: 'unknown',
      retryable: false,
    });
    const reconcilingSnapshot = preview.snapshot();
    await assertStoreCapacity(store, reconcilingSnapshot, { required: true });
    if (preview.attempts[attempt.id]?.state === 'reconciling') {
      const reconciliationEvidence = maximalReconciliationEvidence(preview);
      const decisions = [
        {
          outcome: 'succeeded',
          result: maximalEffectReceipt(preview, task, attempt),
          evidence: reconciliationEvidence,
        },
        {
          outcome: 'failed',
          error: {
            code: 'capacity_reconciliation_failure',
            message: errorMessage,
            certainty: 'unknown',
            retryable: false,
          },
          retry: false,
          evidence: reconciliationEvidence,
        },
        { outcome: 'not_applied', evidence: reconciliationEvidence },
        { outcome: 'cancelled', evidence: reconciliationEvidence },
        { outcome: 'unverified', reason: errorMessage, evidence: reconciliationEvidence },
      ];
      for (const decision of decisions) {
        const reconciled = repository.restoreSnapshot(reconcilingSnapshot, { reopen: false });
        reconciled.resolveReconciliation(attempt.id, decision, {
          claimValidator: claimLedger,
        });
        await assertStoreCapacity(store, reconciled.snapshot(), { required: true });
      }
    }
  }
}

export async function runDurableCase(repository, caseId, executor, options = {}) {
  assertRepository(repository);
  assertIdentifier(caseId, 'caseId');
  assertRecordShape(options, [], RUNNER_OPTIONS, 'durable runner options');

  const engine = await repository.load(caseId, { reopen: true });
  if (engine === null) {
    throw new ContractError('case_not_found', `Case ${caseId} does not exist`);
  }

  let persistedRevision = engine.caseRevision;
  const result = await runCaseWithHooks(engine, executor, {
    ...options,
    checkpoint: async (snapshot) => {
      if (snapshot.caseRevision <= persistedRevision) {
        throw new ContractError(
          'checkpoint_revision_regression',
          'Durable checkpoint must advance the persisted Case revision',
          {
            caseId,
            persistedRevision,
            checkpointRevision: snapshot.caseRevision,
          },
        );
      }
      await assertStoreCapacity(repository.store, snapshot);
      await repository.checkpoint(engine, persistedRevision, snapshot);
      persistedRevision = snapshot.caseRevision;
    },
  }, {
    beforeAttemptStart: async ({
      engine: currentEngine,
      taskId,
      executorIdentity,
      claimLease,
    }) => {
      const task = currentEngine.plan.tasksById[taskId];
      if (task?.kind !== 'work' || task.execution.effectClass === 'result-only') return;
      await assertExternalEffectCapacity(
        repository,
        currentEngine,
        taskId,
        executorIdentity,
        claimLease,
        options.claimLedger ?? null,
      );
    },
  });

  if (result.snapshot.caseRevision !== persistedRevision) {
    throw new ContractError(
      'checkpoint_incomplete',
      'Runner returned a Case revision that was not durably checkpointed',
      {
        caseId,
        persistedRevision,
        resultRevision: result.snapshot.caseRevision,
      },
    );
  }

  return {
    ...result,
    persistedRevision,
  };
}
