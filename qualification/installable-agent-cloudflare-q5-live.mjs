#!/usr/bin/env node
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { strictJsonParse, typedDigest } from '../src/canonical.mjs';
import {
  QUALIFICATION_EVIDENCE_PROFILE,
  qualificationDeploymentIdentityDigest,
  validateTerminalQualificationEvidence,
} from './installable-agent-qualification-r3.mjs';

const execFileAsync = promisify(execFile);
const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER_SCRIPT = path.join(HERE, 'installable-agent-cloudflare-readback.mjs');
const IAM_SCRIPT = path.join(HERE, 'installable-agent-cloudflare-iam-readback.mjs');

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function boundedString(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) fail('cloudflare_q5_join_invalid', `${label} is invalid`);
  return value;
}

function safeGeneration(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('cloudflare_q5_join_invalid', 'run generation is invalid');
  return value;
}

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('cloudflare_q5_join_invalid', `${label} is invalid`);
  return value;
}

function sameProviderPrincipal(provider, iam) {
  const left = assertRecord(provider.providerPrincipal, 'provider principal');
  const right = assertRecord(iam.providerPrincipal, 'IAM-observed provider principal');
  for (const key of ['tokenKind', 'tokenId', 'tokenStatus']) {
    if (left[key] !== right[key]) fail('cloudflare_q5_principal_mismatch', `provider/IAM principal mismatch at ${key}`);
  }
  if (left.tokenStatus !== 'active') fail('cloudflare_q5_principal_mismatch', 'provider principal is not active');
  return left;
}

function principalObservation(principal, identity, freshness, evidence) {
  return Object.freeze({
    principal,
    identityDigest: typedDigest(`tdev.d0039.q5.${principal}.identity.v1`, identity),
    freshnessDigest: typedDigest(`tdev.d0039.q5.${principal}.freshness.v1`, freshness),
    evidenceDigest: typedDigest(`tdev.d0039.q5.${principal}.evidence.v1`, evidence),
  });
}

export function createD0039CloudflareQ5TerminalEvidence({ qualificationRunId, runGeneration, providerReadback, iamReadback }) {
  boundedString(qualificationRunId, 'qualification run id', 256);
  safeGeneration(runGeneration);
  const provider = assertRecord(providerReadback, 'provider readback');
  const iam = assertRecord(iamReadback, 'IAM readback');
  if (provider.classification !== 'observed' || provider.gate !== 'q5_live_provider_iam' || provider.proofLayer !== 'live_provider_control_plane_partial' || provider.secretValues !== 'excluded') {
    fail('cloudflare_q5_provider_invalid', 'provider readback is not an admitted Q5 provider observation');
  }
  if (iam.classification !== 'observed' || iam.gate !== 'q5_live_provider_iam' || iam.proofLayer !== 'live_iam_control_plane' || iam.separation !== 'distinct_api_token_principals' || iam.secretValues !== 'excluded') {
    fail('cloudflare_q5_iam_invalid', 'IAM readback is not an admitted Q5 IAM observation');
  }
  if (provider.accountId !== iam.accountId || provider.zoneId !== iam.zoneId) fail('cloudflare_q5_target_mismatch', 'provider and IAM observations do not bind the same account/zone');
  if (provider.activeTrafficPercentage !== 100) fail('cloudflare_q5_target_mismatch', 'provider observation is not one 100-percent writer');
  const providerPrincipal = sameProviderPrincipal(provider, iam);
  const target = assertRecord(provider.deploymentIdentity, 'deployment identity');
  const targetDigest = qualificationDeploymentIdentityDigest(target);
  if (provider.deploymentIdentityDigest !== targetDigest) fail('cloudflare_q5_target_mismatch', 'provider deployment identity digest is invalid');
  if (target.accountId !== provider.accountId || target.workerVersionId !== provider.activeVersionId || target.sourceSha !== provider.activeSourceSha || target.routeId !== provider.route?.id || target.namespaceId !== provider.namespace?.id || target.jurisdiction !== provider.jurisdiction || target.qualificationEndpointOrigin !== provider.ingress) {
    fail('cloudflare_q5_target_mismatch', 'provider control-plane facts do not equal the exact S/A/V/R target');
  }
  if (provider.iamSeparation !== 'requires_cross_principal_token_policy_readback') fail('cloudflare_q5_iam_invalid', 'provider observation did not require independent IAM policy readback');
  if (iam.providerPrincipal?.policyDigest === undefined || iam.observationDigest === undefined || iam.iamPrincipalDigest === undefined) fail('cloudflare_q5_iam_invalid', 'IAM observation digests are incomplete');

  const observations = [
    principalObservation('iam_control_plane',
      { accountId: iam.accountId, zoneId: iam.zoneId, iamPrincipalDigest: iam.iamPrincipalDigest },
      { providerPolicyDigest: iam.providerPrincipal.policyDigest, modifiedOn: iam.providerPrincipal.modifiedOn, observedReadPermission: iam.iamPrincipal?.observedReadPermission },
      { observationDigest: iam.observationDigest, providerPrincipal: iam.providerPrincipal, iamPrincipal: iam.iamPrincipal }),
    principalObservation('provider_control_plane',
      { accountId: provider.accountId, providerPrincipal },
      { deploymentId: provider.deploymentId, activeVersionId: provider.activeVersionId, deploymentEpoch: target.deploymentEpoch },
      { activeTrafficPercentage: provider.activeTrafficPercentage, route: provider.route, namespace: provider.namespace, durableObjectBinding: provider.durableObjectBinding, secretBindingNames: provider.secretBindingNames }),
    principalObservation('route_owner_runtime',
      { accountId: target.accountId, serviceName: target.serviceName, routeId: target.routeId, durableObjectId: target.durableObjectId, routeVerifierDigest: target.routeVerifierDigest },
      { deploymentEpoch: target.deploymentEpoch, routeCurrentTupleDigest: target.routeCurrentTupleDigest, routeGeneration: target.routeGeneration },
      { routeBinding: provider.routeBinding, publicVerifierFingerprints: provider.publicVerifierFingerprints, legacyHmac: provider.legacyHmac, deploymentIdentityDigest: targetDigest }),
  ].sort((left, right) => left.principal < right.principal ? -1 : left.principal > right.principal ? 1 : 0);

  const readSet = [
    `cloudflare:account:${provider.accountId}:worker:${target.serviceName}:deployment:${provider.deploymentId}`,
    `cloudflare:account:${provider.accountId}:worker-version:${provider.activeVersionId}`,
    `cloudflare:account:${provider.accountId}:namespace:${provider.namespace.id}`,
    `cloudflare:token:${providerPrincipal.tokenKind}:${providerPrincipal.tokenId}:policy`,
    `cloudflare:zone:${provider.zoneId}:route:${provider.route.id}`,
    `route-owner:${target.agentId}:${target.routeGeneration}`,
  ].sort();

  const evidence = {
    schemaVersion: 2,
    profile: QUALIFICATION_EVIDENCE_PROFILE,
    qualificationRunId,
    runGeneration,
    gate: 'q5_live_provider_iam',
    target,
    targetDigest,
    deploymentIdentityDigest: targetDigest,
    principalObservations: observations,
    readSet,
    writeSet: [],
    invalidationSet: [],
    secretValues: 'excluded',
  };
  return validateTerminalQualificationEvidence(evidence, { expectedGate: 'q5_live_provider_iam', expectedDeploymentIdentityDigest: targetDigest });
}

function parseArgs(argv) {
  const providerFlags = [
    '--account-id', '--script-name', '--namespace-name', '--class-name', '--zone-id', '--route-id', '--qualification-endpoint', '--agent-id', '--route-generation',
    '--expected-source-sha', '--expected-artifact-digest', '--expected-artifact-manifest-digest', '--expected-deployment-epoch', '--expected-deployment', '--expected-environment', '--expected-jurisdiction', '--provider-token-kind',
  ];
  const allFlags = new Set([...providerFlags, '--iam-token-kind', '--qualification-run-id', '--run-generation']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allFlags.has(flag) || value === undefined || values.has(flag)) fail('cloudflare_q5_usage', 'Q5 live arguments are missing, duplicated, or unknown');
    values.set(flag, value);
  }
  if ([...allFlags].some((flag) => !values.has(flag))) fail('cloudflare_q5_usage', 'all Q5 live arguments are required');
  const runGeneration = Number(values.get('--run-generation'));
  if (!Number.isSafeInteger(runGeneration) || runGeneration < 1 || String(runGeneration) !== values.get('--run-generation')) fail('cloudflare_q5_usage', 'run generation is invalid');
  return {
    providerArgs: providerFlags.flatMap((flag) => [flag, values.get(flag)]),
    accountId: values.get('--account-id'),
    zoneId: values.get('--zone-id'),
    providerTokenKind: values.get('--provider-token-kind'),
    iamTokenKind: values.get('--iam-token-kind'),
    qualificationRunId: values.get('--qualification-run-id'),
    runGeneration,
  };
}

async function runChild(script, args, env, label) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(process.execPath, [script, ...args], {
      env,
      encoding: 'utf8',
      maxBuffer: MAX_CHILD_OUTPUT_BYTES,
      timeout: 120_000,
      windowsHide: true,
    }));
  } catch (cause) {
    fail('cloudflare_q5_observer_failed', `${label} failed`, {}, { cause });
  }
  if (Buffer.byteLength(stdout) > MAX_CHILD_OUTPUT_BYTES) fail('cloudflare_q5_observer_failed', `${label} output exceeds its byte bound`);
  try { return strictJsonParse(stdout, { maxBytes: MAX_CHILD_OUTPUT_BYTES }); }
  catch (cause) { fail('cloudflare_q5_observer_failed', `${label} returned invalid JSON`, {}, { cause }); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const provider = await runChild(PROVIDER_SCRIPT, options.providerArgs, process.env, 'provider/route-owner observer');
  const providerPrincipal = assertRecord(provider.providerPrincipal, 'provider principal');
  const iam = await runChild(IAM_SCRIPT, [
    '--account-id', options.accountId,
    '--zone-id', options.zoneId,
    '--provider-token-id', providerPrincipal.tokenId,
    '--provider-token-kind', options.providerTokenKind,
    '--iam-token-kind', options.iamTokenKind,
  ], process.env, 'IAM observer');
  const evidence = createD0039CloudflareQ5TerminalEvidence({
    qualificationRunId: options.qualificationRunId,
    runGeneration: options.runGeneration,
    providerReadback: provider,
    iamReadback: iam,
  });
  process.stdout.write(`${JSON.stringify({ classification: 'qualified', evidence })}\n`);
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'cloudflare_q5_failed', message: error?.message ?? 'Q5 live qualification failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
