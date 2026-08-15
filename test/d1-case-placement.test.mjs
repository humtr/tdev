import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson } from '../src/canonical.mjs';
import { createCasePlacement } from '../src/casedo-authority.mjs';
import {
  D1_CASE_PLACEMENT_PROFILE,
  D1_CASE_PLACEMENT_SCHEMA_VERSION,
  D1CasePlacementAuthority,
} from '../src/d1-case-placement.mjs';

const migrationSql = await readFile(
  new URL('../cloudflare/d1/migrations/0001-case-placement.sql', import.meta.url),
  'utf8',
);

class FakeD1PreparedStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new FakeD1PreparedStatement(this.database, this.sql, bindings);
  }
}

class FakeD1Database {
  constructor({ migrate = true } = {}) {
    this.sqlite = new DatabaseSync(':memory:');
    if (migrate) this.sqlite.exec(migrationSql);
  }

  prepare(sql) {
    return new FakeD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        assert.ok(statement instanceof FakeD1PreparedStatement);
        assert.equal(statement.database, this);
        const prepared = this.sqlite.prepare(statement.sql);
        if (/^\s*(SELECT|WITH)\b/i.test(statement.sql)) {
          return {
            success: true,
            results: prepared.all(...statement.bindings).map((row) => ({ ...row })),
            meta: { changes: 0 },
          };
        }
        const result = prepared.run(...statement.bindings);
        return {
          success: true,
          results: [],
          meta: { changes: Number(result.changes) },
        };
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  run(sql, ...bindings) {
    return this.sqlite.prepare(sql).run(...bindings);
  }

  rows(sql, ...bindings) {
    return this.sqlite.prepare(sql).all(...bindings).map((row) => ({ ...row }));
  }

  close() {
    this.sqlite.close();
  }
}

function placementInput(caseId, overrides = {}) {
  return {
    caseId,
    placementGeneration: 1,
    deployment: 'deployment-a',
    environment: 'production',
    workerScript: 'tdev-case-runtime',
    className: 'CaseRuntimeDO',
    namespace: 'CASE_AUTHORITY',
    jurisdiction: 'eu',
    durableObjectId: `do-${caseId}-a`,
    ...overrides,
  };
}

function assertCode(code) {
  return (error) => error?.code === code;
}

test('D1 placement migration declares one versioned narrow meta-authority profile', () => {
  const database = new FakeD1Database();
  const meta = database.rows('SELECT singleton, profile, schema_version FROM tdev_case_placement_meta');
  assert.deepEqual(meta, [{
    singleton: 1,
    profile: D1_CASE_PLACEMENT_PROFILE,
    schema_version: D1_CASE_PLACEMENT_SCHEMA_VERSION,
  }]);
  assert.equal(database.rows('SELECT * FROM tdev_case_placements').length, 0);
  database.close();
});

test('D1 placement election is write-once and exact retry reuses the same durable record', async () => {
  const database = new FakeD1Database();
  const firstClient = new D1CasePlacementAuthority(database);
  const retryClient = new D1CasePlacementAuthority(database);
  const placement = createCasePlacement(placementInput('retry-case'));

  assert.equal(canonicalJson(await firstClient.elect({ placement })), canonicalJson(placement));
  assert.equal(canonicalJson(await retryClient.elect({ placement })), canonicalJson(placement));
  assert.equal(canonicalJson(await retryClient.requireElected({ placement })), canonicalJson(placement));
  assert.equal(canonicalJson(await firstClient.get(placement.caseId)), canonicalJson(placement));
  assert.equal(database.rows('SELECT * FROM tdev_case_placements').length, 1);
  database.close();
});

test('two independent placement clients sharing one D1 database produce one winner for one CaseId', async () => {
  const database = new FakeD1Database();
  const environmentA = new D1CasePlacementAuthority(database);
  const environmentB = new D1CasePlacementAuthority(database);
  const proposalA = createCasePlacement(placementInput('race-case'));
  const proposalB = createCasePlacement(placementInput('race-case', {
    placementGeneration: 2,
    deployment: 'deployment-b',
    environment: 'staging',
    namespace: 'CASE_AUTHORITY_B',
    jurisdiction: 'fedramp',
    durableObjectId: 'do-race-case-b',
  }));

  const outcomes = await Promise.allSettled([
    environmentA.elect({ placement: proposalA }),
    environmentB.elect({ placement: proposalB }),
  ]);
  const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
  const losers = outcomes.filter((outcome) => outcome.status === 'rejected');
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason?.code, 'placement_conflict');

  const stored = await environmentA.get('race-case');
  assert.equal(canonicalJson(stored), canonicalJson(winners[0].value));
  assert.equal(database.rows('SELECT * FROM tdev_case_placements').length, 1);
  const losingProposal = stored.placementDigest === proposalA.placementDigest ? proposalB : proposalA;
  await assert.rejects(
    environmentB.requireElected({ placement: losingProposal }),
    assertCode('placement_conflict'),
  );
  database.close();
});

test('D1 placement store fails closed when schema metadata is absent and does not elect a Case', async () => {
  const database = new FakeD1Database();
  database.run('DELETE FROM tdev_case_placement_meta WHERE singleton = 1');
  const authority = new D1CasePlacementAuthority(database);
  const placement = createCasePlacement(placementInput('missing-meta-case'));

  await assert.rejects(authority.elect({ placement }), assertCode('incompatible_placement_store'));
  assert.equal(database.rows('SELECT * FROM tdev_case_placements').length, 0);
  database.close();
});

test('D1 placement store fails closed on corrupt canonical placement bytes', async () => {
  const database = new FakeD1Database();
  const authority = new D1CasePlacementAuthority(database);
  const placement = createCasePlacement(placementInput('corrupt-row-case'));
  await authority.elect({ placement });
  database.run(
    'UPDATE tdev_case_placements SET placement_json = ? WHERE case_id = ?',
    '{}',
    placement.caseId,
  );

  await assert.rejects(authority.get(placement.caseId), assertCode('placement_store_corrupt'));
  database.close();
});

test('D1 placement authority treats an unmigrated binding as unavailable rather than creating schema at runtime', async () => {
  const database = new FakeD1Database({ migrate: false });
  const authority = new D1CasePlacementAuthority(database);
  const placement = createCasePlacement(placementInput('unmigrated-case'));

  await assert.rejects(authority.elect({ placement }), assertCode('placement_store_unavailable'));
  database.close();
});
