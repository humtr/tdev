import { ContractError, assertIdentifier, assertRecordShape, publicJsonClone } from './canonical.mjs';
import { CaseEngine } from './engine.mjs';

function assertStore(store) {
  if (!store ||
      typeof store.create !== 'function' ||
      typeof store.load !== 'function' ||
      typeof store.compareAndSwap !== 'function') {
    throw new ContractError('invalid_snapshot_store', 'Snapshot store does not implement create/load/compareAndSwap');
  }
}

export class CaseRepository {
  constructor(store) {
    assertStore(store);
    this.store = store;
  }

  restoreSnapshot(snapshot, options = {}) {
    return CaseEngine.restore(snapshot, options);
  }

  async checkpoint(engine, expectedRevision, snapshot = engine.snapshot()) {
    if (!(engine instanceof CaseEngine)) throw new ContractError('invalid_case_engine', 'Repository checkpoint requires a CaseEngine');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new ContractError('invalid_expected_revision', 'Repository checkpoint expectedRevision must be a non-negative safe integer');
    }
    await this.store.compareAndSwap(engine.caseId, expectedRevision, snapshot);
    return snapshot;
  }

  async create(input) {
    assertRecordShape(input, ['caseId', 'plan'], ['caseContract'], 'repository create');
    const { caseId, plan, caseContract = {} } = input;
    const engine = new CaseEngine({ caseId, plan, caseContract });
    await this.store.create(engine.snapshot());
    return engine;
  }

  async load(caseId, options = {}) {
    assertRecordShape(options, [], ['reopen'], 'repository load options');
    if (Object.hasOwn(options, 'reopen') && typeof options.reopen !== 'boolean') {
      throw new ContractError('invalid_repository_option', 'repository load reopen must be boolean');
    }
    assertIdentifier(caseId, 'caseId');
    const stored = await this.store.load(caseId);
    if (stored === null) return null;
    const reopen = options.reopen === true;
    const engine = this.restoreSnapshot(stored, { reopen });
    if (engine.caseRevision !== stored.caseRevision) {
      await this.checkpoint(engine, stored.caseRevision);
    }
    return engine;
  }

  async transact(caseId, operation, options = {}) {
    assertRecordShape(options, [], ['reopen'], 'repository transaction options');
    if (Object.hasOwn(options, 'reopen') && typeof options.reopen !== 'boolean') {
      throw new ContractError('invalid_repository_option', 'repository transaction reopen must be boolean');
    }
    assertIdentifier(caseId, 'caseId');
    if (typeof operation !== 'function') throw new ContractError('invalid_transaction', 'Repository operation must be a function');
    const stored = await this.store.load(caseId);
    if (stored === null) throw new ContractError('case_not_found', `Case ${caseId} does not exist`);
    const engine = this.restoreSnapshot(stored, { reopen: options.reopen === true });
    const result = await operation(engine);
    const publicResult = publicJsonClone(result === undefined ? null : result);
    const snapshot = engine.snapshot();
    let persisted = false;
    if (snapshot.caseRevision !== stored.caseRevision) {
      await this.checkpoint(engine, stored.caseRevision, snapshot);
      persisted = true;
    }
    return {
      engine,
      result: publicResult,
      persisted,
    };
  }

  async command(caseId, commandEnvelope, options = {}) {
    assertRecordShape(options, [], ['reopen', 'claimValidator'], 'repository command options');
    const transactionOptions = Object.hasOwn(options, 'reopen') ? { reopen: options.reopen } : {};
    return this.transact(
      caseId,
      (engine) => engine.applyCommand(commandEnvelope, { claimValidator: options.claimValidator }),
      transactionOptions,
    );
  }
}
