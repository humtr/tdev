import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/canonical.mjs';
import { createCasePlacement } from '../src/casedo-authority.mjs';
import { CaseRuntimeDOHost } from '../src/cloudflare-casedo-runtime.mjs';

function deploymentEnvironment() {
  return {
    TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE: String(8 * 1024 * 1024),
    TDEV_CASEDO_WRITER_COMPATIBILITY_ID: 'writer-v1',
    TDEV_DEPLOYMENT: 'qualification-a',
    TDEV_ENVIRONMENT: 'qualification',
    TDEV_WORKER_SCRIPT: 'tdev-d0019-qualification-a',
    TDEV_CASEDO_NAMESPACE: 'CASE_AUTHORITY',
    TDEV_CASEDO_JURISDICTION: 'eu',
    TDEV_CASE_PLACEMENT: {
      prepare() {
        return {};
      },
      async batch() {
        return [];
      },
    },
  };
}

function providerContext(durableObjectId = 'do-provider-case') {
  return {
    id: { toString: () => durableObjectId },
    storage: {
      transactionSync(operation) {
        return operation();
      },
      sql: {
        exec() {
          return { toArray: () => [] };
        },
      },
    },
    blockConcurrencyWhile(operation) {
      this.initialization = operation;
    },
  };
}

function placement(caseId = 'provider-case', overrides = {}) {
  return createCasePlacement({
    caseId,
    placementGeneration: 1,
    deployment: 'qualification-a',
    environment: 'qualification',
    workerScript: 'tdev-d0019-qualification-a',
    className: 'CaseRuntimeDO',
    namespace: 'CASE_AUTHORITY',
    jurisdiction: 'eu',
    durableObjectId: 'do-provider-case',
    ...overrides,
  });
}

function hostFixture() {
  return new CaseRuntimeDOHost(providerContext(), deploymentEnvironment());
}

test('Cloudflare CaseDO host revalidates the exact D1 election before every authority operation', async () => {
  const host = hostFixture();
  const elected = placement();
  const events = [];
  host.placementAuthority = {
    async requireElected({ placement: candidate }) {
      events.push(`placement:${candidate.caseId}`);
      return candidate;
    },
  };
  host.authority = {
    initializeElectedCase(input) {
      events.push(`initialize:${input.placement.caseId}`);
      return 'initialized';
    },
    loadCase(input) {
      events.push(`load:${input.placement.caseId}`);
      return 'loaded';
    },
    command(input) {
      events.push(`command:${input.placement.caseId}`);
      return 'commanded';
    },
    recoverExecutionOwnerLoss(input) {
      events.push(`recovery:${input.placement.caseId}`);
      return 'recovered';
    },
  };

  assert.equal(await host.initializeElectedCase({ placement: elected, plan: {} }), 'initialized');
  assert.equal(await host.loadCase({ placement: elected }), 'loaded');
  assert.equal(await host.command({ placement: elected, envelope: {} }), 'commanded');
  assert.equal(await host.recoverExecutionOwnerLoss({ placement: elected, recoveryId: 'loss-1', cause: {} }), 'recovered');
  assert.deepEqual(events, [
    'placement:provider-case', 'initialize:provider-case',
    'placement:provider-case', 'load:provider-case',
    'placement:provider-case', 'command:provider-case',
    'placement:provider-case', 'recovery:provider-case',
  ]);
});

test('Cloudflare CaseDO host fails closed without delegating when D1 rejects the elected placement', async () => {
  const host = hostFixture();
  let delegated = false;
  host.placementAuthority = {
    async requireElected() {
      throw new ContractError('placement_conflict', 'competing elected placement');
    },
  };
  host.authority = {
    command() {
      delegated = true;
    },
  };

  await assert.rejects(
    host.command({ placement: placement(), envelope: {} }),
    (error) => error?.code === 'placement_conflict',
  );
  assert.equal(delegated, false);
});

test('Cloudflare CaseDO host rejects a mismatched provider identity before consulting D1', async () => {
  const host = hostFixture();
  let placementLookups = 0;
  host.placementAuthority = {
    async requireElected() {
      placementLookups += 1;
    },
  };
  host.authority = { loadCase() {} };

  await assert.rejects(
    host.loadCase({ placement: placement('provider-case', { durableObjectId: 'do-other-owner' }) }),
    (error) => error?.code === 'placement_conflict',
  );
  assert.equal(placementLookups, 0);
});
