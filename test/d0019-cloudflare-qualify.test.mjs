import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveD0019Budget,
  runD0019CloudflareQualification,
} from '../tools/d0019-cloudflare-qualify.mjs';

function configuration() {
  return {
    client: {},
    repositoryRoot: process.cwd(),
    discovery: {
      accountIdDigest: `sha256:${'1'.repeat(64)}`,
      accountType: 'standard',
      tokenStatus: 'active',
      workerSubdomain: 'account-subdomain',
      databases: [],
    },
    sourceSha: '1'.repeat(40),
    jurisdiction: 'eu',
    qualificationToken: 'q'.repeat(64),
    nonce: 'a'.repeat(16),
    maxTaskInitialBytes: 3915402,
    growthFinalBytes: 1281193,
    safetyNumerator: 4,
    safetyDenominator: 1,
    providerMinimumPerObjectBytes: 1024 * 1024 * 1024,
    providerMaximumRowBytes: 2 * 1024 * 1024,
    providerLimitsCheckedAt: '2026-08-15T00:00:00.000Z',
    localCapacityInitialBytes: 62125,
    localCapacityFinalBytes: 120633,
    maxIdentityDriftBytes: 4096,
    timing: { attempts: 1, delayMs: 0, sleepImpl: async () => {} },
  };
}

function dependencies({ failCore = false, failDisable = false } = {}) {
  const events = [];
  let namespaceIndex = 0;
  const provision = async (input) => {
    events.push(['provision', [...input.scriptNames], input.writerCompatibilityId, input.maxAuthoritativeBytesPerCase, input.enableSubdomain]);
    return {
      database: { name: 'tdev-d0019-placement', uuid: 'database-uuid', jurisdiction: 'eu' },
      schema: { status: 'compatible', placementRows: 0 },
      workers: input.scriptNames.map((scriptName) => ({
        scriptName,
        namespaceId: `namespace-${namespaceIndex += 1}`,
        moduleDigest: `sha256:${'2'.repeat(64)}`,
      })),
    };
  };
  const setSubdomains = async (_client, input) => {
    events.push(['subdomains', input.enabled, [...input.scriptNames]]);
    if (!input.enabled && failDisable) {
      const error = new Error('simulated route closure failure');
      error.code = 'simulated_route_closure_failure';
      throw error;
    }
  };
  const endpointFactory = ({ scriptName }) => ({
    scriptName,
    async invoke(input) {
      if (input.operation === 'qualification_readiness_probe') {
        return { scriptName, status: 400, body: { ok: false, error: { code: 'qualification_unknown_operation', details: {} } }, transportError: null };
      }
      throw new Error(`unexpected fake invocation ${input.operation}`);
    },
  });
  return {
    events,
    value: {
      provision,
      setSubdomains,
      endpointFactory,
      readPlacement: async () => ({}),
      coreProof: async () => {
        events.push(['core']);
        if (failCore) {
          const error = new Error('simulated core failure');
          error.code = 'simulated_core_failure';
          error.details = {
            stage: 'simulated core stage',
            status: 409,
            errorCode: 'simulated_provider_code',
            transportError: null,
          };
          throw error;
        }
        return { placement: { winnerScript: 'tdev-d0019-qualification-a' } };
      },
      capacityWorkloadProof: async () => ({ finalAuthoritativeBytes: 120641, providerRestartVerified: true }),
      capacityRejectionProof: async () => ({ rejectedBeforeAuthorityBirth: true, competingFallbackRejected: true }),
      writerRolloutProof: async ({ deployWriter }) => {
        await deployWriter('tdev-casedo-writer-incompatible-probe');
        await deployWriter('tdev-casedo-writer-v1');
        return { incompatibleMutationRejected: true, rollbackPreservedAuthority: true, compatibleWriterContinued: true };
      },
    },
  };
}

test('D0019 budget derivation applies the explicit factor and rounds upward to a power of two', () => {
  assert.deepEqual(deriveD0019Budget({ measuredHighWaterBytes: 3915402, safetyNumerator: 4, safetyDenominator: 1 }), {
    minimumBudgetBytes: 15661608,
    maxAuthoritativeBytesPerCase: 16777216,
  });
});

test('D0019 Cloudflare qualification orchestration provisions bounded profiles, composes proofs, and always closes routes', async () => {
  const fake = dependencies();
  const result = await runD0019CloudflareQualification(configuration(), fake.value);
  assert.equal(result.capacityEnvelope.maxAuthoritativeBytesPerCase, 16 * 1024 * 1024);
  assert.equal(result.publicQualificationRoutesDisabledAfterRun, true);
  assert.deepEqual(fake.events.filter(([kind]) => kind === 'subdomains').map((event) => event[1]), [true, false]);
  const provisionEvents = fake.events.filter(([kind]) => kind === 'provision');
  assert.deepEqual(provisionEvents[0][1], ['tdev-d0019-qualification-a', 'tdev-d0019-qualification-b']);
  assert.deepEqual(provisionEvents[1][1], ['tdev-d0019-qualification-capacity']);
  assert.deepEqual(provisionEvents.slice(2).map((event) => event[2]), [
    'tdev-casedo-writer-incompatible-probe',
    'tdev-casedo-writer-v1',
  ]);
  assert.equal(JSON.stringify(result).includes('q'.repeat(64)), false);
});

test('D0019 Cloudflare qualification orchestration closes routes when a proof fails', async () => {
  const fake = dependencies({ failCore: true });
  await assert.rejects(
    runD0019CloudflareQualification(configuration(), fake.value),
    (error) => error?.code === 'd0019_cloudflare_qualification_failed' &&
      error.details?.causeCode === 'simulated_core_failure' &&
      error.details?.causeStage === 'simulated core stage' &&
      error.details?.causeStatus === 409 &&
      error.details?.causeErrorCode === 'simulated_provider_code' &&
      error.details?.causeTransportError === null,
  );
  assert.deepEqual(fake.events.filter(([kind]) => kind === 'subdomains').map((event) => event[1]), [true, false]);
});

test('D0019 Cloudflare qualification rejects incomplete account evidence before any mutation', async () => {
  const fake = dependencies();
  const input = configuration();
  input.discovery.tokenStatus = 'inactive';
  await assert.rejects(
    runD0019CloudflareQualification(input, fake.value),
    (error) => error?.code === 'invalid_qualification_configuration',
  );
  assert.deepEqual(fake.events, []);
});

test('D0019 Cloudflare qualification fails closed when public route closure cannot be verified', async () => {
  const fake = dependencies({ failDisable: true });
  await assert.rejects(
    runD0019CloudflareQualification(configuration(), fake.value),
    (error) => error?.code === 'd0019_cloudflare_qualification_failed' &&
      error.details?.causeCode === null &&
      error.details?.routeClosureCode === 'simulated_route_closure_failure',
  );
  assert.deepEqual(fake.events.filter(([kind]) => kind === 'subdomains').map((event) => event[1]), [true, false]);
});
