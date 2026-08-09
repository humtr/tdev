import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runDurableCase } from '../src/durable-runner.mjs';
import { CaseRepository } from '../src/repository.mjs';
import {
  SemanticCaseRepository,
  migrateV2CaseToSemantic,
  semanticMigrationRollbackStatus,
} from '../src/semantic-repository.mjs';
import { openSemanticSqliteStore } from '../src/semantic-store.mjs';
import { MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

async function withSemanticStore(fn) {
  const root = await mkdtemp(join(tmpdir(), 'tdev-semantic-repository-'));
  const path = join(root, 'semantic.sqlite');
  const store = await openSemanticSqliteStore(path);
  try { await fn({ store, path }); } finally {
    try { store.close(); } catch {}
    await rm(root, { recursive: true, force: true });
  }
}

async function legacyFixture(caseId = 'legacy-migrate') {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }], { 'base.txt': 'base' });
  const engine = await repository.create({ caseId, plan });
  return { store, repository, plan, engine };
}

test('SemanticCaseRepository checkpoints v3 heads and clears persisted object deltas only after success', async () => {
  await withSemanticStore(async ({ store }) => {
    const repository = new SemanticCaseRepository(store);
    const plan = planWithWork([{ id: 'a' }], { 'base.txt': 'base' });
    const engine = await repository.create({ caseId: 'native-v3', plan });
    assert.equal(engine.isSemanticV3, true);
    assert.equal(engine.semanticObjectRecords().length, 0);
    const firstHead = store.loadHead('native-v3');
    assert.equal(firstHead.generation, 1);

    const tx = await repository.transact('native-v3', (current) => current.startAttempt('a', 'worker'));
    assert.equal(tx.persisted, true);
    assert.equal(store.loadHead('native-v3').generation, 2);
    assert.equal(tx.engine.semanticObjectRecords().length, 0);
  });
});

test('quiesced pre-Promotion v2 Case migrates to v3 without changing Plan/base identity', async () => {
  await withSemanticStore(async ({ store }) => {
    const legacy = await legacyFixture('migrate-ok');
    const before = await legacy.store.load('migrate-ok');
    const result = await migrateV2CaseToSemantic({
      sourceStore: legacy.store,
      targetStore: store,
      caseId: 'migrate-ok',
      quiescence: { writersQuiesced: true, claimsQuiesced: true },
    });
    assert.equal(result.sourceSnapshotDigest, before.snapshotDigest);
    assert.equal(result.sourceCaseRevision, before.caseRevision);
    assert.equal(result.head.generation, 1);

    const repository = new SemanticCaseRepository(store);
    const migrated = await repository.load('migrate-ok', { reopen: false });
    assert.equal(migrated.isSemanticV3, true);
    assert.equal(migrated.plan.planDigest, legacy.plan.planDigest);
    assert.equal(migrated.plan.baseDigest, legacy.plan.baseDigest);
    assert.equal(migrated.semanticAuthority.migrationSource.snapshotDigest, before.snapshotDigest);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.canonicalTree)), JSON.parse(JSON.stringify(legacy.plan.baseTree)));
  });
});

test('v2 migration rejects missing quiescence and catches a legacy source write before target publication', async () => {
  await withSemanticStore(async ({ store }) => {
    const legacy = await legacyFixture('migrate-race');
    await assert.rejects(
      migrateV2CaseToSemantic({
        sourceStore: legacy.store,
        targetStore: store,
        caseId: 'migrate-race',
        quiescence: { writersQuiesced: false, claimsQuiesced: true },
      }),
      (error) => error?.code === 'migration_not_quiesced',
    );

    await assert.rejects(
      migrateV2CaseToSemantic({
        sourceStore: legacy.store,
        targetStore: store,
        caseId: 'migrate-race',
        quiescence: { writersQuiesced: true, claimsQuiesced: true },
        beforeTargetCommit: async () => {
          await legacy.repository.transact('migrate-race', (engine) => engine.startAttempt('a', 'racer'));
        },
      }),
      (error) => error?.code === 'migration_source_changed',
    );
    assert.equal(store.loadHead('migrate-race'), null);
  });
});

test('v2 migration rejects a source after successful Promotion', async () => {
  await withSemanticStore(async ({ store }) => {
    const legacy = await legacyFixture('migrate-succeeded');
    await runDurableCase(legacy.repository, 'migrate-succeeded', async ({ baseDigest, task }) => resultFor(baseDigest, task, 'done'));
    await assert.rejects(
      migrateV2CaseToSemantic({
        sourceStore: legacy.store,
        targetStore: store,
        caseId: 'migrate-succeeded',
        quiescence: { writersQuiesced: true, claimsQuiesced: true },
      }),
      (error) => error?.code === 'migration_after_promotion',
    );
    assert.equal(store.loadHead('migrate-succeeded'), null);
  });
});

test('unadvanced migration rollback is allowed but automatic downgrade is forbidden after a v3 write', async () => {
  await withSemanticStore(async ({ store }) => {
    const legacy = await legacyFixture('rollback-case');
    const migrated = await migrateV2CaseToSemantic({
      sourceStore: legacy.store,
      targetStore: store,
      caseId: 'rollback-case',
      quiescence: { writersQuiesced: true, claimsQuiesced: true },
    });
    assert.equal(semanticMigrationRollbackStatus(store, 'rollback-case').allowed, true);
    const source = store.abandonUnadvancedMigration('rollback-case', migrated.head.headDigest);
    assert.equal(source.snapshotDigest, migrated.sourceSnapshotDigest);
    assert.equal(store.loadHead('rollback-case'), null);

    const remigrated = await migrateV2CaseToSemantic({
      sourceStore: legacy.store,
      targetStore: store,
      caseId: 'rollback-case',
      quiescence: { writersQuiesced: true, claimsQuiesced: true },
    });
    const repository = new SemanticCaseRepository(store);
    await repository.transact('rollback-case', (engine) => engine.startAttempt('a', 'worker'));
    const advanced = store.loadHead('rollback-case');
    assert.equal(advanced.generation, remigrated.head.generation + 1);
    assert.equal(semanticMigrationRollbackStatus(store, 'rollback-case').allowed, false);
    assert.throws(
      () => store.abandonUnadvancedMigration('rollback-case', advanced.headDigest),
      (error) => error?.code === 'semantic_downgrade_forbidden',
    );
  });
});

test('reference-aware GC preserves heads and pins and deletes only unreachable abandoned migration state', async () => {
  await withSemanticStore(async ({ store }) => {
    const legacy = await legacyFixture('gc-case');
    const migrated = await migrateV2CaseToSemantic({
      sourceStore: legacy.store,
      targetStore: store,
      caseId: 'gc-case',
      quiescence: { writersQuiesced: true, claimsQuiesced: true },
    });
    store.pin('keep-old-snapshot', 'snapshot', migrated.snapshot.snapshotDigest);
    store.abandonUnadvancedMigration('gc-case', migrated.head.headDigest);
    const pinned = store.gc();
    assert.equal(pinned.snapshotCandidates.includes(migrated.snapshot.snapshotDigest), false);

    store.unpin('keep-old-snapshot');
    const dryRun = store.gc();
    assert.equal(dryRun.snapshotCandidates.includes(migrated.snapshot.snapshotDigest), true);
    assert.ok(dryRun.objectCandidates.length > 0);
    store.pin('temporary-change', 'snapshot', migrated.snapshot.snapshotDigest);
    assert.throws(
      () => store.gc({ apply: true, expectedAuthorityDigest: dryRun.authorityDigest }),
      (error) => error?.code === 'store_cas_mismatch',
    );
    store.unpin('temporary-change');
    const refreshed = store.gc();
    const applied = store.gc({ apply: true, expectedAuthorityDigest: refreshed.authorityDigest });
    assert.equal(applied.applied, true);
    assert.equal(store.getSnapshot(migrated.snapshot.snapshotDigest), null);
    assert.equal(store.loadHead('gc-case'), null);
  });
});

test('durable runner uses the same lifecycle path with SemanticCaseRepository', async () => {
  await withSemanticStore(async ({ store }) => {
    const repository = new SemanticCaseRepository(store);
    const plan = planWithWork([{ id: 'a' }], { 'base.txt': 'base' });
    await repository.create({ caseId: 'durable-v3', plan });
    const result = await runDurableCase(repository, 'durable-v3', async ({ baseDigest, task }) => resultFor(baseDigest, task, 'v3'));
    assert.equal(result.caseState, 'succeeded');
    assert.equal(result.snapshot.schemaVersion, 3);
    assert.equal(result.snapshot.caseRevision, result.persistedRevision);
    const loaded = await repository.load('durable-v3', { reopen: false });
    assert.equal(loaded.caseState, 'succeeded');
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.canonicalTree)), { 'a.txt': 'v3', 'base.txt': 'base' });
    assert.ok(store.loadHead('durable-v3').generation > 1);
  });
});
