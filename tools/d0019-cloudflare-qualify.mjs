import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASEDO_DEFAULT_CHUNK_BYTES } from '../src/casedo-authority.mjs';
import {
  CloudflareApiClient,
  CloudflareQualificationError,
  D0019_CAPACITY_QUALIFICATION_SCRIPT,
  D0019_QUALIFICATION_SCRIPTS,
  discoverCloudflareAccount,
  loadCloudflareCredentials,
  provisionD0019QualificationResources,
  qualificationWorkerOrigin,
  readCleanSourceSha,
  readD1PlacementRecord,
  setD0019QualificationSubdomains,
} from './d0019-cloudflare-api.mjs';
import {
  D0019LiveQualificationError,
  D0019QualificationHttpEndpoint,
  qualifyD0019CapacityEnvelope,
  runD0019CoreProviderProof,
  runD0019LiveCapacityRejectionProof,
  runD0019LiveCapacityWorkloadProof,
  runD0019LiveWriterRolloutProof,
} from './d0019-live-qualification.mjs';

const PROVIDER_LIMIT_SOURCE = 'https://developers.cloudflare.com/durable-objects/platform/limits/';
const COMPATIBLE_WRITER_ID = 'tdev-casedo-writer-v1';
const INCOMPATIBLE_WRITER_ID = 'tdev-casedo-writer-incompatible-probe';
const ALL_SCRIPTS = Object.freeze([...D0019_QUALIFICATION_SCRIPTS, D0019_CAPACITY_QUALIFICATION_SCRIPT]);

export class D0019CloudflareQualificationRunError extends Error {
  constructor(code, message, details = {}, options = undefined) {
    super(message, options);
    this.name = 'D0019CloudflareQualificationRunError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}, options = undefined) {
  throw new D0019CloudflareQualificationRunError(code, message, details, options);
}

function positiveInteger(value, label) {
  const parsed = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail('invalid_qualification_configuration', `${label} must be a positive safe integer`);
  return parsed;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function ceilRatio(value, numerator, denominator) {
  const result = (BigInt(value) * BigInt(numerator) + BigInt(denominator) - 1n) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid_qualification_configuration', 'Derived budget exceeds the safe integer range');
  return Number(result);
}

function nextPowerOfTwo(value) {
  let result = 1n;
  const target = BigInt(value);
  while (result < target) result *= 2n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid_qualification_configuration', 'Derived budget exceeds the safe integer range');
  return Number(result);
}

export function deriveD0019Budget({ measuredHighWaterBytes, safetyNumerator, safetyDenominator }) {
  const measured = positiveInteger(measuredHighWaterBytes, 'measuredHighWaterBytes');
  const numerator = positiveInteger(safetyNumerator, 'safetyNumerator');
  const denominator = positiveInteger(safetyDenominator, 'safetyDenominator');
  if (numerator <= denominator) fail('invalid_qualification_configuration', 'Safety factor must be greater than one');
  const minimum = ceilRatio(measured, numerator, denominator);
  return Object.freeze({ minimumBudgetBytes: minimum, maxAuthoritativeBytesPerCase: nextPowerOfTwo(minimum) });
}

function measurementEvidence({ mode, taskCount, authoritativeBytes, acceptedResults }) {
  return {
    schemaVersion: 1,
    evidenceKind: 'd0019-case-authoritative-byte-measurement',
    measurementOnly: true,
    productionBudgetQualified: false,
    mode,
    adapterAccounting: 'CaseDOAuthority.authoritativeBytes',
    chunkBytes: CASEDO_DEFAULT_CHUNK_BYTES,
    taskCount,
    ...(mode === 'init'
      ? { authoritativeBytes }
      : { acceptedResults, receipts: acceptedResults * 2, finalAuthoritativeBytes: authoritativeBytes }),
  };
}

function qualificationCaseId(sourceSha, nonce, purpose) {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(nonce)) fail('invalid_qualification_configuration', 'Qualification nonce is invalid');
  return `d0019-${sourceSha.slice(0, 12)}-${nonce}-${purpose}`;
}

async function waitForIngress(endpoint, { attempts = 40, delayMs = 500, sleepImpl = (duration) => new Promise((resolve) => setTimeout(resolve, duration)) } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await endpoint.invoke({ operation: 'qualification_readiness_probe', caseId: 'readiness-only' });
    if (last?.body?.ok === false && last.body.error?.code === 'qualification_unknown_operation') return true;
    if (attempt + 1 < attempts) await sleepImpl(delayMs);
  }
  fail('qualification_ingress_unavailable', 'Qualification Worker ingress was not ready within the bounded propagation window', {
    scriptName: endpoint.scriptName,
    status: last?.status ?? null,
    transportError: last?.transportError ?? null,
  });
}

function updatedDiscovery(discovery, database) {
  return { ...discovery, databases: [database] };
}

export async function runD0019CloudflareQualification({
  client,
  repositoryRoot,
  discovery,
  sourceSha,
  jurisdiction,
  qualificationToken,
  nonce,
  maxTaskInitialBytes,
  resultFixtureFinalAuthoritativeBytes,
  safetyNumerator,
  safetyDenominator,
  providerMinimumPerObjectBytes,
  providerMaximumRowBytes,
  providerLimitsCheckedAt,
  localCapacityInitialBytes,
  localCapacityFinalBytes,
  maxIdentityDriftBytes,
  timing = {},
}, dependencies = {}) {
  const provision = dependencies.provision ?? provisionD0019QualificationResources;
  const setSubdomains = dependencies.setSubdomains ?? setD0019QualificationSubdomains;
  const endpointFactory = dependencies.endpointFactory ?? ((input) => new D0019QualificationHttpEndpoint(input));
  const coreProof = dependencies.coreProof ?? runD0019CoreProviderProof;
  const capacityWorkloadProof = dependencies.capacityWorkloadProof ?? runD0019LiveCapacityWorkloadProof;
  const capacityRejectionProof = dependencies.capacityRejectionProof ?? runD0019LiveCapacityRejectionProof;
  const writerRolloutProof = dependencies.writerRolloutProof ?? runD0019LiveWriterRolloutProof;
  const capacityQualifier = dependencies.capacityQualifier ?? qualifyD0019CapacityEnvelope;
  const readPlacementImpl = dependencies.readPlacement ?? ((databaseId, caseId) => readD1PlacementRecord(client, databaseId, caseId));

  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) fail('invalid_qualification_configuration', 'Qualification source SHA is invalid');
  const tokenBytes = typeof qualificationToken === 'string' ? new TextEncoder().encode(qualificationToken).byteLength : 0;
  if (typeof qualificationToken !== 'string' || qualificationToken.includes('\0') || tokenBytes < 32 || tokenBytes > 512) {
    fail('invalid_qualification_configuration', 'Qualification token is invalid');
  }
  if (!['global', 'eu', 'us', 'fedramp'].includes(jurisdiction)) fail('invalid_qualification_configuration', 'Qualification jurisdiction is invalid');
  if (discovery?.tokenStatus !== 'active' || !/^sha256:[0-9a-f]{64}$/.test(discovery?.accountIdDigest ?? '')) {
    fail('invalid_qualification_configuration', 'Fresh active account discovery evidence is missing');
  }
  if (!discovery.workerSubdomain) fail('workers_subdomain_unavailable', 'Cloudflare account has no configured workers.dev subdomain');
  for (const scriptName of ALL_SCRIPTS) qualificationWorkerOrigin(scriptName, discovery.workerSubdomain);
  const maximumTaskInitial = positiveInteger(maxTaskInitialBytes, 'maxTaskInitialBytes');
  const resultFixtureFinal = positiveInteger(resultFixtureFinalAuthoritativeBytes, 'resultFixtureFinalAuthoritativeBytes');
  const numerator = positiveInteger(safetyNumerator, 'safetyNumerator');
  const denominator = positiveInteger(safetyDenominator, 'safetyDenominator');
  const minimumPerObjectBytes = positiveInteger(providerMinimumPerObjectBytes, 'providerMinimumPerObjectBytes');
  const maximumRowBytes = positiveInteger(providerMaximumRowBytes, 'providerMaximumRowBytes');
  const capacityInitialBytes = positiveInteger(localCapacityInitialBytes, 'localCapacityInitialBytes');
  const capacityFinalBytes = positiveInteger(localCapacityFinalBytes, 'localCapacityFinalBytes');
  const identityDriftBytes = positiveInteger(maxIdentityDriftBytes, 'maxIdentityDriftBytes');
  if (typeof providerLimitsCheckedAt !== 'string' || Number.isNaN(Date.parse(providerLimitsCheckedAt))) {
    fail('invalid_qualification_configuration', 'Provider limit observation time is invalid');
  }
  const measurements = [
    measurementEvidence({ mode: 'init', taskCount: 9999, authoritativeBytes: maximumTaskInitial }),
    measurementEvidence({ mode: 'growth', taskCount: 2048, acceptedResults: 128, authoritativeBytes: resultFixtureFinal }),
  ];
  const measuredHighWaterBytes = Math.max(...measurements.map((measurement) => measurement.authoritativeBytes ?? measurement.finalAuthoritativeBytes));
  const derivedBudget = deriveD0019Budget({ measuredHighWaterBytes, safetyNumerator: numerator, safetyDenominator: denominator });
  if (derivedBudget.maxAuthoritativeBytesPerCase > minimumPerObjectBytes || CASEDO_DEFAULT_CHUNK_BYTES >= maximumRowBytes) {
    fail('invalid_qualification_configuration', 'Derived Case budget or chunk profile is incompatible with the supplied provider limits');
  }
  const safetyRationale = `The deployment budget is the next power of two at or above ${numerator}/${denominator} times the measured maximum-total-Task initial Case, retaining a separately measured receipt/result growth fixture.`;
  const common = {
    client,
    repositoryRoot,
    discovery,
    jurisdiction,
    sourceSha,
    qualificationToken,
    allowCreate: true,
    enableSubdomain: false,
  };
  let resourcesReady = false;
  let primaryError = null;
  let result = null;
  let closureError = null;
  try {
    const primary = await provision({
      ...common,
      maxAuthoritativeBytesPerCase: derivedBudget.maxAuthoritativeBytesPerCase,
      writerCompatibilityId: COMPATIBLE_WRITER_ID,
      scriptNames: D0019_QUALIFICATION_SCRIPTS,
    });
    const currentDiscovery = updatedDiscovery(discovery, primary.database);
    const capacity = await provision({
      ...common,
      discovery: currentDiscovery,
      maxAuthoritativeBytesPerCase: 1,
      writerCompatibilityId: COMPATIBLE_WRITER_ID,
      scriptNames: [D0019_CAPACITY_QUALIFICATION_SCRIPT],
    });
    resourcesReady = true;
    await setSubdomains(client, { scriptNames: ALL_SCRIPTS, enabled: true });

    const endpoints = new Map(ALL_SCRIPTS.map((scriptName) => [scriptName, endpointFactory({
      scriptName,
      origin: qualificationWorkerOrigin(scriptName, discovery.workerSubdomain),
      token: qualificationToken,
    })]));
    await Promise.all([...endpoints.values()].map((endpoint) => waitForIngress(endpoint, timing)));
    const readPlacement = (caseId) => readPlacementImpl(primary.database.uuid, caseId);
    const core = await coreProof({
      endpoints: D0019_QUALIFICATION_SCRIPTS.map((scriptName) => endpoints.get(scriptName)),
      caseId: qualificationCaseId(sourceSha, nonce, 'core'),
      readPlacement,
      readOptions: timing,
    });
    const winnerEndpoint = endpoints.get(core.placement.winnerScript);
    if (!winnerEndpoint) fail('qualification_winner_invalid', 'Core proof returned an unknown winning Worker');
    const capacityWorkload = await capacityWorkloadProof({
      endpoint: winnerEndpoint,
      caseId: qualificationCaseId(sourceSha, nonce, 'capacity-live'),
      readPlacement,
      localInitialMeasurementBytes: capacityInitialBytes,
      localFinalMeasurementBytes: capacityFinalBytes,
      maxIdentityDriftBytes: identityDriftBytes,
      readOptions: timing,
    });
    const competingEndpoint = D0019_QUALIFICATION_SCRIPTS
      .map((scriptName) => endpoints.get(scriptName))
      .find((endpoint) => endpoint.scriptName !== D0019_CAPACITY_QUALIFICATION_SCRIPT);
    const capacityRejection = await capacityRejectionProof({
      endpoint: endpoints.get(D0019_CAPACITY_QUALIFICATION_SCRIPT),
      competingEndpoint,
      caseId: qualificationCaseId(sourceSha, nonce, 'capacity-reject'),
      readPlacement,
    });
    const rollout = await writerRolloutProof({
      endpoint: winnerEndpoint,
      caseId: qualificationCaseId(sourceSha, nonce, 'rollout'),
      readPlacement,
      sourceSha,
      compatibleWriterCompatibilityId: COMPATIBLE_WRITER_ID,
      incompatibleWriterCompatibilityId: INCOMPATIBLE_WRITER_ID,
      rolloutOptions: timing,
      deployWriter: async (writerCompatibilityId) => provision({
        ...common,
        discovery: currentDiscovery,
        maxAuthoritativeBytesPerCase: derivedBudget.maxAuthoritativeBytesPerCase,
        writerCompatibilityId,
        scriptNames: [winnerEndpoint.scriptName],
        allowCreate: false,
        enableSubdomain: true,
      }),
    });
    const namespaceIds = [...primary.workers, ...capacity.workers].map((worker) => worker.namespaceId);
    const namespaceObserved = namespaceIds.length === ALL_SCRIPTS.length && new Set(namespaceIds).size === namespaceIds.length;
    const capacityEnvelope = capacityQualifier({
      maxAuthoritativeBytesPerCase: derivedBudget.maxAuthoritativeBytesPerCase,
      chunkBytes: CASEDO_DEFAULT_CHUNK_BYTES,
      measurements,
      safetyHeadroom: {
        numerator,
        denominator,
        rationale: safetyRationale,
      },
      providerLimits: {
        minimumPerObjectBytes,
        maximumRowBytes,
        source: PROVIDER_LIMIT_SOURCE,
        checkedAt: providerLimitsCheckedAt,
      },
      accountProviderEvidence: {
        accountIdDigest: discovery.accountIdDigest,
        accountType: discovery.accountType,
        tokenStatus: discovery.tokenStatus,
        sqliteNamespaceObserved: namespaceObserved,
        liveRepresentativeAuthoritativeBytes: capacityWorkload.finalAuthoritativeBytes,
        liveRepresentativeRestartVerified: capacityWorkload.providerRestartVerified,
        liveCapacityRejectionVerified: capacityRejection.rejectedBeforeAuthorityBirth && capacityRejection.competingFallbackRejected,
      },
    });
    result = {
      schemaVersion: 1,
      evidenceKind: 'd0019-cloudflare-production-qualification-run',
      sourceSha,
      accountIdDigest: discovery.accountIdDigest,
      accountType: discovery.accountType,
      jurisdiction,
      resources: {
        databaseName: primary.database.name,
        databaseIdDigest: sha256(primary.database.uuid),
        schema: primary.schema,
        workers: [...primary.workers, ...capacity.workers].map((worker) => ({
          scriptName: worker.scriptName,
          namespaceIdDigest: sha256(worker.namespaceId),
          moduleDigest: worker.moduleDigest,
        })),
      },
      core,
      capacityWorkload,
      capacityRejection,
      rollout,
      capacityEnvelope,
      qualificationTokenPersistedLocally: false,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (resourcesReady) {
      try {
        await setSubdomains(client, { scriptNames: ALL_SCRIPTS, enabled: false });
      } catch (error) {
        closureError = error;
      }
    }
  }
  if (primaryError || closureError) {
    throw new D0019CloudflareQualificationRunError(
      'd0019_cloudflare_qualification_failed',
      'D0019 Cloudflare qualification did not complete with every public route disabled',
      {
        causeCode: primaryError?.code ?? null,
        causeStage: typeof primaryError?.details?.stage === 'string' ? primaryError.details.stage : null,
        causeStatus: Number.isSafeInteger(primaryError?.details?.status) ? primaryError.details.status : null,
        causeErrorCode: typeof primaryError?.details?.errorCode === 'string' ? primaryError.details.errorCode : null,
        causeTransportError: typeof primaryError?.details?.transportError === 'string' ? primaryError.details.transportError : null,
        routeClosureCode: closureError?.code ?? null,
      },
      { cause: primaryError ?? closureError },
    );
  }
  return Object.freeze({ ...result, publicQualificationRoutesDisabledAfterRun: true });
}

function parseArgs(argv) {
  const values = Object.create(null);
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      if (apply) fail('invalid_cli_arguments', 'Duplicate --apply flag');
      apply = true;
      continue;
    }
    if (!arg.startsWith('--') || index + 1 >= argv.length) fail('invalid_cli_arguments', `Invalid CLI argument: ${arg}`);
    const name = arg.slice(2);
    if (Object.hasOwn(values, name)) fail('invalid_cli_arguments', `Duplicate CLI option: ${arg}`);
    values[name] = argv[index + 1];
    index += 1;
  }
  const allowed = new Set([
    'env-file', 'jurisdiction', 'max-task-initial-bytes', 'result-fixture-final-authoritative-bytes', 'safety-numerator', 'safety-denominator',
    'provider-minimum-per-object-bytes', 'provider-maximum-row-bytes', 'provider-limits-checked-at',
    'local-capacity-initial-bytes', 'local-capacity-final-bytes', 'max-identity-drift-bytes',
  ]);
  const unknown = Object.keys(values).filter((name) => !allowed.has(name));
  if (!apply || unknown.length !== 0 || [...allowed].some((name) => !Object.hasOwn(values, name))) {
    fail('invalid_cli_arguments', 'Qualification requires --apply and every exact bounded input', { unknown });
  }
  return values;
}

async function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const values = parseArgs(process.argv.slice(2));
  const credentials = loadCloudflareCredentials(path.resolve(values['env-file']));
  const client = new CloudflareApiClient(credentials);
  const discovery = await discoverCloudflareAccount(client);
  const result = await runD0019CloudflareQualification({
    client,
    repositoryRoot,
    discovery,
    sourceSha: readCleanSourceSha(repositoryRoot),
    jurisdiction: values.jurisdiction,
    qualificationToken: randomBytes(32).toString('hex'),
    nonce: randomBytes(8).toString('hex'),
    maxTaskInitialBytes: positiveInteger(values['max-task-initial-bytes'], 'maxTaskInitialBytes'),
    resultFixtureFinalAuthoritativeBytes: positiveInteger(values['result-fixture-final-authoritative-bytes'], 'resultFixtureFinalAuthoritativeBytes'),
    safetyNumerator: positiveInteger(values['safety-numerator'], 'safetyNumerator'),
    safetyDenominator: positiveInteger(values['safety-denominator'], 'safetyDenominator'),
    providerMinimumPerObjectBytes: positiveInteger(values['provider-minimum-per-object-bytes'], 'providerMinimumPerObjectBytes'),
    providerMaximumRowBytes: positiveInteger(values['provider-maximum-row-bytes'], 'providerMaximumRowBytes'),
    providerLimitsCheckedAt: values['provider-limits-checked-at'],
    localCapacityInitialBytes: positiveInteger(values['local-capacity-initial-bytes'], 'localCapacityInitialBytes'),
    localCapacityFinalBytes: positiveInteger(values['local-capacity-final-bytes'], 'localCapacityFinalBytes'),
    maxIdentityDriftBytes: positiveInteger(values['max-identity-drift-bytes'], 'maxIdentityDriftBytes'),
  });
  process.stdout.write(`${JSON.stringify({ status: 'provider_qualification_verified', result })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    const allowedError = error instanceof D0019CloudflareQualificationRunError ||
      error instanceof CloudflareQualificationError || error instanceof D0019LiveQualificationError;
    const safeDetails = error instanceof D0019CloudflareQualificationRunError
      ? error.details
      : error instanceof CloudflareQualificationError
        ? {
            status: error.details?.status ?? null,
            causeCode: error.details?.causeCode ?? null,
            failures: error.details?.failures ?? [],
            safetyClosureFailures: error.details?.safetyClosureFailures ?? [],
          }
        : error instanceof D0019LiveQualificationError
          ? {
              stage: error.details?.stage ?? null,
              status: error.details?.status ?? null,
              errorCode: error.details?.errorCode ?? null,
              transportError: error.details?.transportError ?? null,
            }
          : {};
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      error: {
        code: allowedError ? error.code : 'd0019_cloudflare_qualification_failed',
        details: safeDetails,
      },
    })}\n`);
    process.exitCode = 1;
  });
}
