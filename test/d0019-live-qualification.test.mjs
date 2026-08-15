import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson } from '../src/canonical.mjs';
import {
  D0019QualificationCaseDOHost,
  D0019QualificationService,
} from '../src/d0019-qualification-runtime.mjs';
import { D1CasePlacementAuthority } from '../src/d1-case-placement.mjs';
import {
  D0019QualificationHttpEndpoint,
  runD0019CoreProviderProof,
} from '../tools/d0019-live-qualification.mjs';

const migrationSql = await readFile(new URL('../cloudflare/d1/migrations/0001-case-placement.sql', import.meta.url), 'utf8');
const qualificationToken = 'local-qualification-secret-token-00000001';

class SqlCursor {
  constructor(rows = []) {
    this.rows = rows;
  }

  toArray() {
    return this.rows.map((row) => ({ ...row }));
  }
}

class DurableStorage {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.sql = {
      exec: (statement, ...bindings) => {
        const prepared = this.database.prepare(statement);
        if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement)) return new SqlCursor(prepared.all(...bindings));
        prepared.run(...bindings);
        return new SqlCursor();
      },
    };
  }

  transactionSync(operation) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

class D1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new D1Statement(this.database, this.sql, bindings);
  }
}

class SharedD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(migrationSql);
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        const prepared = this.database.prepare(statement.sql);
        if (/^\s*(SELECT|WITH)\b/i.test(statement.sql)) {
          return { success: true, results: prepared.all(...statement.bindings).map((row) => ({ ...row })), meta: { changes: 0 } };
        }
        const result = prepared.run(...statement.bindings);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      });
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

class LocalNamespace {
  constructor(scriptName, env) {
    this.scriptName = scriptName;
    this.env = env;
    this.objects = new Map();
  }

  jurisdiction(value) {
    assert.equal(value, 'eu');
    return this;
  }

  idFromName(caseId) {
    return {
      caseId,
      jurisdiction: 'eu',
      toString: () => `do:${this.scriptName}:${caseId}`,
    };
  }

  get(id) {
    let record = this.objects.get(id.caseId);
    if (!record) {
      record = { storage: new DurableStorage(), host: null };
      this.objects.set(id.caseId, record);
    }
    const host = () => {
      if (!record.host) {
        const context = {
          id,
          storage: record.storage,
          blockConcurrencyWhile(operation) {
            this.initialization = operation();
          },
          abort() {
            record.host = null;
            throw new Error('simulated provider object abort');
          },
        };
        record.host = new D0019QualificationCaseDOHost(context, this.env);
      }
      return record.host;
    };
    return {
      initializeElectedCase: (input) => host().initializeElectedCase(input),
      loadCase: (input) => host().loadCase(input),
      command: (input) => host().command(input),
      recoverExecutionOwnerLoss: (input) => host().recoverExecutionOwnerLoss(input),
      qualificationAbortInstance: (input) => host().qualificationAbortInstance(input),
      qualificationCommandThenAbort: (input) => host().qualificationCommandThenAbort(input),
      qualificationRuntimeProbe: (input) => host().qualificationRuntimeProbe(input),
      qualificationWriterBarrierProbe: (input) => host().qualificationWriterBarrierProbe(input),
    };
  }

  close() {
    for (const record of this.objects.values()) record.storage.close();
  }
}

function localEndpoint(scriptName, d1) {
  const env = {
    TDEV_D0019_QUALIFICATION_MODE: 'enabled',
    TDEV_D0019_QUALIFICATION_TOKEN: qualificationToken,
    TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE: String(8 * 1024 * 1024),
    TDEV_CASEDO_WRITER_COMPATIBILITY_ID: 'writer-v1',
    TDEV_DEPLOYMENT: scriptName,
    TDEV_ENVIRONMENT: 'qualification',
    TDEV_WORKER_SCRIPT: scriptName,
    TDEV_CASEDO_NAMESPACE: `namespace-${scriptName}`,
    TDEV_CASEDO_JURISDICTION: 'eu',
    TDEV_SOURCE_SHA: '1'.repeat(40),
    TDEV_WORKER_VERSION: { id: `version-${scriptName}` },
    TDEV_CASE_PLACEMENT: d1,
  };
  const namespace = new LocalNamespace(scriptName, env);
  env.TDEV_CASE_AUTHORITY = namespace;
  const service = new D0019QualificationService(env);
  return {
    scriptName,
    namespace,
    async invoke(input) {
      const response = await service.fetch(new Request('https://qualification.invalid/qualification/d0019/v1', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${qualificationToken}`,
          'content-type': 'application/json',
        },
        body: canonicalJson(input),
      }));
      return {
        scriptName,
        status: response.status,
        body: JSON.parse(await response.text()),
        transportError: null,
      };
    },
  };
}

test('D0019 live proof runner exercises the actual local D1 and CaseDO adapters through provider-shaped ingress', async (t) => {
  const d1 = new SharedD1();
  const endpointA = localEndpoint('tdev-d0019-qualification-a', d1);
  const endpointB = localEndpoint('tdev-d0019-qualification-b', d1);
  t.after(() => {
    endpointA.namespace.close();
    endpointB.namespace.close();
    d1.close();
  });
  const placement = new D1CasePlacementAuthority(d1);
  const evidence = await runD0019CoreProviderProof({
    endpoints: [endpointA, endpointB],
    caseId: 'local-core-provider-proof',
    readPlacement: (caseId) => placement.get(caseId),
    readOptions: { attempts: 1, delayMs: 0 },
  });
  assert.equal(evidence.evidenceKind, 'd0019-live-core-provider-proof');
  assert.equal(evidence.placement.reconciledOutcomes.filter((outcome) => outcome.ok).length, 1);
  assert.equal(evidence.authority.runningAttemptPersistedBeforeDispatch, true);
  assert.equal(evidence.authority.ordinaryAbortPreservedRunningAttempt, true);
  assert.equal(evidence.authority.responseLossReceiptReconciled, true);
  assert.equal(evidence.authority.explicitRecoveryCommittedOnce, true);
  assert.equal(evidence.authority.conflictingResultRejectedWithoutMutation, true);
});

test('D0019 qualification HTTP endpoint keeps bearer credentials out of URL and returned diagnostics', async () => {
  const calls = [];
  const endpoint = new D0019QualificationHttpEndpoint({
    scriptName: 'tdev-d0019-qualification-a',
    origin: 'https://qualification-a.example',
    token: qualificationToken,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: false, error: { code: 'placement_conflict', details: {} } }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const response = await endpoint.invoke({ operation: 'elect', caseId: 'credential-boundary' });
  assert.equal(calls[0].url.includes(qualificationToken), false);
  assert.equal(calls[0].init.headers.authorization, `Bearer ${qualificationToken}`);
  assert.equal(response.body.error.code, 'placement_conflict');
  assert.equal(JSON.stringify(response).includes(qualificationToken), false);
});

test('D0019 qualification HTTP endpoint rejects unsafe origins, tokens, and oversized requests before fetch', async () => {
  assert.throws(
    () => new D0019QualificationHttpEndpoint({
      scriptName: 'tdev-d0019-qualification-a',
      origin: 'http://qualification.example',
      token: qualificationToken,
    }),
    (error) => error?.code === 'invalid_qualification_endpoint',
  );
  assert.throws(
    () => new D0019QualificationHttpEndpoint({
      scriptName: 'tdev-d0019-qualification-a',
      origin: 'https://qualification.example',
      token: 'short',
    }),
    (error) => error?.code === 'invalid_qualification_token',
  );
  let fetchCalls = 0;
  const endpoint = new D0019QualificationHttpEndpoint({
    scriptName: 'tdev-d0019-qualification-a',
    origin: 'https://qualification.example',
    token: qualificationToken,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('{}');
    },
  });
  await assert.rejects(
    endpoint.invoke({ operation: 'initialize', caseId: 'oversized', plan: { value: 'x'.repeat(1024 * 1024) } }),
    (error) => error?.code === 'qualification_request_too_large',
  );
  assert.equal(fetchCalls, 0);
});
