import { ContractError, assertIdentifier, assertRecordShape } from './canonical.mjs';
import { runCase } from './runner.mjs';

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
      !repository.store ||
      typeof repository.store.compareAndSwap !== 'function') {
    throw new ContractError(
      'invalid_case_repository',
      'Durable runner requires a CaseRepository with compare-and-swap storage',
    );
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
  const result = await runCase(engine, executor, {
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
      await repository.store.compareAndSwap(caseId, persistedRevision, snapshot);
      persistedRevision = snapshot.caseRevision;
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
