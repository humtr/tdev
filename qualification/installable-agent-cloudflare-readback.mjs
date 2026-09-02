#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDigest, strictJsonParse } from '../src/canonical.mjs';
import {
  QUALIFICATION_RPC_PROFILE,
  createQualificationDeploymentBindingPlan,
  normalizeQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
} from './installable-agent-qualification-r4.mjs';
import { qualificationRouteAuthoritativeReadbackDigest } from './installable-agent-qualification-r8.mjs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TOKEN_KINDS = Object.freeze(new Set(['account', 'user']));
const ROUTE_READBACK_MODES = Object.freeze(new Set(['current', 'unregistered']));

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function parseArgs(argv) {
  const required = new Set(['--account-id', '--script-name', '--namespace-name', '--class-name', '--agent-id', '--route-generation', '--expected-source-sha', '--expected-artifact-digest', '--expected-artifact-manifest-digest', '--expected-deployment-epoch', '--expected-deployment', '--expected-environment', '--expected-jurisdiction', '--provider-token-kind']);
  const allowed = new Set([...required, '--route-readback-mode', '--expected-runtime-namespace']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || values.has(flag)) fail('cloudflare_readback_usage', 'Cloudflare readback arguments are missing, duplicated, or unknown');
    values.set(flag, value);
  }
  if ([...required].some((flag) => !values.has(flag))) fail('cloudflare_readback_usage', 'all required Cloudflare readback arguments must be supplied');
  const routeGeneration = Number(values.get('--route-generation'));
  if (!Number.isSafeInteger(routeGeneration) || routeGeneration < 1 || String(routeGeneration) !== values.get('--route-generation')) fail('cloudflare_readback_usage', 'route generation is invalid');
  if (!/^[0-9a-f]{40}$/.test(values.get('--expected-source-sha'))) fail('cloudflare_readback_usage', 'expected source SHA is invalid');
  try {
    assertDigest(values.get('--expected-artifact-digest'), 'expected artifact digest');
    assertDigest(values.get('--expected-artifact-manifest-digest'), 'expected artifact manifest digest');
  } catch (cause) { fail('cloudflare_readback_usage', 'expected artifact digests are invalid', {}, { cause }); }
  if (!TOKEN_KINDS.has(values.get('--provider-token-kind'))) fail('cloudflare_readback_usage', 'provider token kind must be account or user');
  const routeReadbackMode = values.get('--route-readback-mode') ?? 'current';
  if (!ROUTE_READBACK_MODES.has(routeReadbackMode)) fail('cloudflare_readback_usage', 'route readback mode must be current or unregistered');
  const parsed = Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replaceAll('-', '_'), value]));
  parsed.route_generation = routeGeneration;
  parsed.route_readback_mode = routeReadbackMode;
  parsed.expected_runtime_namespace = values.get('--expected-runtime-namespace') ?? values.get('--namespace-name');
  return parsed;
}

async function boundedJson(response, label) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail('cloudflare_readback_response_too_large', `${label} response exceeds its byte bound`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) fail('cloudflare_readback_response_too_large', `${label} response exceeds its byte bound`);
  try { return strictJsonParse(bytes, { maxBytes: MAX_RESPONSE_BYTES }); }
  catch (cause) { fail('cloudflare_readback_response_invalid', `${label} returned invalid bounded JSON`, {}, { cause }); }
}

async function cloudflareGet(apiToken, pathname, label) {
  const response = await fetch(`${API_ROOT}${pathname}`, { headers: { authorization: `Bearer ${apiToken}` }, redirect: 'error' });
  const body = await boundedJson(response, label);
  if (!response.ok || body?.success !== true) fail('cloudflare_readback_api_failed', `${label} failed with HTTP ${response.status}`, { status: response.status });
  return body.result;
}

function containsNamedExport(value, className) {
  if (Array.isArray(value)) return value.some((entry) => containsNamedExport(entry, className));
  if (value === null || typeof value !== 'object') return false;
  if (value.name === className || Object.hasOwn(value, className)) return true;
  return Object.values(value).some((entry) => containsNamedExport(entry, className));
}

function publicBinding(binding) {
  if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) return null;
  const result = {};
  for (const name of ['name', 'type', 'namespace_id', 'class_name', 'script_name']) {
    if (typeof binding[name] === 'string') result[name] = binding[name];
  }
  if (binding.type === 'plain_text' && typeof binding.text === 'string') result.text = binding.text;
  return result;
}

function expectedRuntimeNamespace(options) {
  return options.expected_runtime_namespace ?? options.namespace_name;
}

function validateRuntimeNamespaceBinding({ options, providerBindings }) {
  if (!Array.isArray(providerBindings)) fail('cloudflare_readback_runtime_binding_invalid', 'provider Worker bindings are unavailable');
  const matches = providerBindings.filter((binding) =>
    binding?.name === 'TDEV_AGENT_DELIVERY_NAMESPACE' && binding?.type === 'plain_text' && typeof binding?.text === 'string');
  const expected = expectedRuntimeNamespace(options);
  if (matches.length !== 1 || matches[0].text !== expected) {
    fail('cloudflare_readback_runtime_binding_invalid', 'provider Worker runtime namespace binding mismatch', {
      expected,
      observed: matches.length === 1 ? matches[0].text : null,
      matches: matches.length,
    });
  }
}

export function normalizeD0039WorkersDevIngress({ scriptName, accountSubdomainResult, workerSubdomainResult }) {
  if (typeof scriptName !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(scriptName)) {
    fail('cloudflare_readback_workers_dev_invalid', 'Worker script name is not one workers.dev-compatible DNS label');
  }
  const accountSubdomain = accountSubdomainResult?.subdomain;
  if (typeof accountSubdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(accountSubdomain)) {
    fail('cloudflare_readback_workers_dev_invalid', 'Cloudflare account workers.dev subdomain readback is invalid');
  }
  if (workerSubdomainResult?.enabled !== true || workerSubdomainResult?.previews_enabled !== false) {
    fail('cloudflare_readback_workers_dev_invalid', 'D0039 Revision-4 requires workers.dev enabled and preview URLs disabled', {
      enabled: workerSubdomainResult?.enabled ?? null,
      previewsEnabled: workerSubdomainResult?.previews_enabled ?? null,
    });
  }
  const hostname = `${scriptName}.${accountSubdomain}.workers.dev`;
  return Object.freeze({
    ingressKind: 'workers_dev',
    accountSubdomain,
    hostname,
    enabled: true,
    previewsEnabled: false,
    origin: `https://${hostname}`,
  });
}

async function routeOwnerRpc(options, qualificationToken, qualificationOrigin, operation) {
  const endpoint = new URL(qualificationOrigin);
  endpoint.pathname = '/qualification/d0020/v2';
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${qualificationToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ profile: QUALIFICATION_RPC_PROFILE, operation, agentId: options.agent_id, routeGeneration: options.route_generation }),
  });
  const body = await boundedJson(response, 'route-owner readback');
  if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body) || body.ok !== true || !Object.hasOwn(body, 'result')) {
    fail('cloudflare_route_owner_readback_failed', 'route-owner readback failed', { status: response.status, operation });
  }
  return body.result;
}

async function routeOwnerReadback(options, qualificationToken, qualificationOrigin) {
  if (options.route_readback_mode === 'current') {
    const result = await routeOwnerRpc(options, qualificationToken, qualificationOrigin, 'd0039_security_readback');
    if (result?.secretValues !== 'excluded') fail('cloudflare_route_owner_readback_failed', 'route-owner security readback did not exclude secret values');
    return result;
  }
  const routeBinding = { agentId: options.agent_id, routeGeneration: options.route_generation };
  const first = await routeOwnerRpc(options, qualificationToken, qualificationOrigin, 'read_installable_agent');
  const firstDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: first });
  const second = await routeOwnerRpc(options, qualificationToken, qualificationOrigin, 'read_installable_agent');
  const secondDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: second });
  if (firstDigest !== secondDigest) fail('cloudflare_route_owner_readback_unstable', 'UNREGISTERED route-owner reread changed between authoritative observations');
  return Object.freeze({ first, second, routeAuthoritativeRereadDigest: firstDigest });
}

export function validateD0039CloudflareProviderPrincipal({ tokenKind, verification }) {
  if (!TOKEN_KINDS.has(tokenKind)) fail('cloudflare_readback_provider_principal_invalid', 'provider token kind must be account or user');
  if (verification === null || typeof verification !== 'object' || Array.isArray(verification) ||
      typeof verification.id !== 'string' || verification.id.length === 0 || verification.id.length > 128 || verification.id.includes('\0') || verification.status !== 'active') {
    fail('cloudflare_readback_provider_principal_invalid', 'provider Cloudflare principal must be one active API token');
  }
  return Object.freeze({ tokenKind, tokenId: verification.id, tokenStatus: verification.status });
}

function validateProviderBindings({ options, namespace, workersDev, providerBindings }) {
  if (!Array.isArray(providerBindings)) fail('cloudflare_readback_runtime_binding_invalid', 'provider Worker bindings are unavailable');
  const expectedBindingPlan = createQualificationDeploymentBindingPlan({
    sourceSha: options.expected_source_sha,
    artifactDigest: options.expected_artifact_digest,
    artifactManifestDigest: options.expected_artifact_manifest_digest,
    accountId: options.account_id,
    serviceName: options.script_name,
    deploymentEpoch: options.expected_deployment_epoch,
    qualificationEndpointOrigin: workersDev.origin,
    workersDevAccountSubdomain: workersDev.accountSubdomain,
    namespaceId: namespace?.id,
  });
  const plainText = new Map(providerBindings
    .filter((binding) => binding?.type === 'plain_text' && typeof binding?.name === 'string' && typeof binding?.text === 'string')
    .map((binding) => [binding.name, binding.text]));
  for (const { name, text } of expectedBindingPlan.cloudflarePlainTextBindings) {
    if (plainText.get(name) !== text) fail('cloudflare_readback_runtime_binding_invalid', `provider Worker plain-text binding mismatch at ${name}`, { name });
  }
}

export function validateD0039CloudflareIdentityJoin({ options, activeVersionId, namespace, workersDev, owner, providerBindings }) {
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) fail('cloudflare_readback_route_owner_mismatch', 'route-owner readback is invalid');
  if (!workersDev || workersDev.ingressKind !== 'workers_dev' || workersDev.enabled !== true || workersDev.previewsEnabled !== false) {
    fail('cloudflare_readback_workers_dev_invalid', 'workers.dev provider ingress observation is invalid');
  }
  const identity = normalizeQualificationDeploymentIdentity(owner.deploymentIdentity);
  const digest = qualificationDeploymentIdentityDigest(identity);
  if (owner.deploymentIdentityDigest !== digest) fail('cloudflare_readback_route_owner_mismatch', 'route-owner deployment identity digest is invalid');
  const expected = {
    sourceSha: options.expected_source_sha,
    artifactDigest: options.expected_artifact_digest,
    artifactManifestDigest: options.expected_artifact_manifest_digest,
    workerVersionId: activeVersionId,
    accountId: options.account_id,
    serviceName: options.script_name,
    deployment: options.expected_deployment,
    environment: options.expected_environment,
    deploymentEpoch: options.expected_deployment_epoch,
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: workersDev.origin,
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: workersDev.accountSubdomain,
    workersDevHostname: workersDev.hostname,
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: options.script_name,
    namespaceId: namespace?.id,
    namespace: expectedRuntimeNamespace(options),
    className: options.class_name,
    jurisdiction: options.expected_jurisdiction,
    agentId: options.agent_id,
    routeGeneration: options.route_generation,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (identity[name] !== value) fail('cloudflare_readback_route_owner_mismatch', `provider/readback S/A/V/R mismatch at ${name}`, { name, expected: value, actual: identity[name] });
  }
  validateProviderBindings({ options, namespace, workersDev, providerBindings });
  validateRuntimeNamespaceBinding({ options, providerBindings });
  const runtime = owner.runtime;
  if (runtime?.sourceSha !== identity.sourceSha || runtime?.workerVersionId !== identity.workerVersionId ||
      runtime?.workersDevHostname !== identity.workersDevHostname || runtime?.qualificationEndpointOrigin !== identity.qualificationEndpointOrigin ||
      runtime?.routeCurrentTupleDigest !== identity.routeCurrentTupleDigest || runtime?.routeVerifierDigest !== identity.routeVerifierDigest ||
      runtime?.routeBinding?.agentId !== identity.agentId || runtime?.routeBinding?.routeGeneration !== identity.routeGeneration ||
      runtime?.routeBinding?.durableObjectId !== identity.durableObjectId) {
    fail('cloudflare_readback_route_owner_mismatch', 'route-owner runtime facts disagree with its deployment identity');
  }
  return Object.freeze({ identity, digest });
}

export function validateD0039CloudflareRouteBootstrapJoin({ options, activeVersionId, namespace, workersDev, owner, providerBindings }) {
  if (typeof activeVersionId !== 'string' || activeVersionId.length === 0 || activeVersionId.includes('\0')) {
    fail('cloudflare_readback_deployment_invalid', 'active Worker version identity is invalid');
  }
  if (!owner || typeof owner !== 'object' || Array.isArray(owner) || !owner.first || !owner.second) {
    fail('cloudflare_readback_route_owner_mismatch', 'UNREGISTERED route-owner readback is invalid');
  }
  if (!workersDev || workersDev.ingressKind !== 'workers_dev' || workersDev.enabled !== true || workersDev.previewsEnabled !== false) {
    fail('cloudflare_readback_workers_dev_invalid', 'workers.dev provider ingress observation is invalid');
  }
  validateProviderBindings({ options, namespace, workersDev, providerBindings });
  validateRuntimeNamespaceBinding({ options, providerBindings });
  const routeBinding = { agentId: options.agent_id, routeGeneration: options.route_generation };
  const firstDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: owner.first });
  const secondDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: owner.second });
  if (firstDigest !== secondDigest || owner.routeAuthoritativeRereadDigest !== firstDigest) {
    fail('cloudflare_route_owner_readback_unstable', 'UNREGISTERED route-owner observations do not share one canonical reread digest');
  }
  return Object.freeze({ activeVersionId, routeAuthoritativeRereadDigest: firstDigest, routeRead: owner.first, twoReadsStable: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const qualificationToken = process.env.TDEV_D0020_QUALIFICATION_TOKEN;
  if (typeof apiToken !== 'string' || apiToken.length < 20 || apiToken.includes('\0') || typeof qualificationToken !== 'string' || Buffer.byteLength(qualificationToken) < 32) {
    fail('cloudflare_readback_credentials_unavailable', 'Cloudflare and qualification tokens must be supplied only through environment variables');
  }
  const account = encodeURIComponent(options.account_id);
  const script = encodeURIComponent(options.script_name);
  const providerVerifyPath = options.provider_token_kind === 'account' ? `/accounts/${account}/tokens/verify` : '/user/tokens/verify';
  const [providerVerification, deploymentsResult, namespaces, secrets, accountSubdomainResult, workerSubdomainResult] = await Promise.all([
    cloudflareGet(apiToken, providerVerifyPath, 'provider API-token verification'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/deployments`, 'Worker deployments'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/durable_objects/namespaces?per_page=1000`, 'Durable Object namespaces'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/secrets`, 'Worker secret inventory'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/subdomain`, 'account workers.dev subdomain'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/subdomain`, 'Worker workers.dev configuration'),
  ]);
  const providerPrincipal = validateD0039CloudflareProviderPrincipal({ tokenKind: options.provider_token_kind, verification: providerVerification });
  const workersDev = normalizeD0039WorkersDevIngress({ scriptName: options.script_name, accountSubdomainResult, workerSubdomainResult });
  const deployments = deploymentsResult?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) fail('cloudflare_readback_deployment_invalid', 'Worker has no deployment readback');
  const deployment = deployments[0];
  if (!Array.isArray(deployment.versions) || deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100) {
    fail('cloudflare_readback_mixed_writers', 'Active Worker deployment is not one 100-percent version');
  }
  const versionId = deployment.versions[0].version_id;
  const [version, owner] = await Promise.all([
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/versions/${encodeURIComponent(versionId)}`, 'Worker version'),
    routeOwnerReadback(options, qualificationToken, workersDev.origin),
  ]);
  const bindings = Array.isArray(version?.resources?.bindings) ? version.resources.bindings.map(publicBinding).filter(Boolean) : [];
  const doBinding = bindings.filter((binding) => binding.name === 'TDEV_AGENT_DELIVERY' && /durable_object/i.test(binding.type ?? ''));
  if (doBinding.length !== 1 || !containsNamedExport(version?.resources?.script_runtime?.exports ?? version?.resources?.script?.exports ?? {}, options.class_name)) {
    fail('cloudflare_readback_runtime_binding_invalid', 'Worker version does not expose the exact AgentDeliveryRuntimeDO binding/class');
  }
  const namespaceMatches = Array.isArray(namespaces)
    ? namespaces.filter((entry) => entry?.name === options.namespace_name && entry?.class === options.class_name && entry?.script === options.script_name)
    : [];
  if (namespaceMatches.length !== 1) fail('cloudflare_readback_namespace_ambiguous', 'Exact Durable Object namespace readback is missing or ambiguous');
  const namespace = namespaceMatches[0];
  const secretNames = Array.isArray(secrets) ? secrets.map((entry) => entry?.name).filter((name) => typeof name === 'string').sort() : [];
  if (options.route_readback_mode === 'unregistered') {
    const joined = validateD0039CloudflareRouteBootstrapJoin({ options, activeVersionId: versionId, namespace, workersDev, owner, providerBindings: bindings });
    const security = joined.routeRead.installableAgent;
    process.stdout.write(`${JSON.stringify({
      classification: 'observed',
      gate: 'q6b_route_bootstrap_predecessor_readback',
      proofLayer: 'live_provider_route_owner_pre_current',
      readbackMode: 'unregistered',
      accountId: options.account_id,
      providerPrincipal,
      workerScript: options.script_name,
      deploymentId: deployment.id,
      activeVersionId: versionId,
      activeTrafficPercentage: 100,
      activeSourceSha: options.expected_source_sha,
      artifactDigest: options.expected_artifact_digest,
      artifactManifestDigest: options.expected_artifact_manifest_digest,
      deploymentEpoch: options.expected_deployment_epoch,
      exportedClass: options.class_name,
      durableObjectBinding: doBinding[0],
      namespace: { id: namespace.id, name: namespace.name, class: namespace.class, script: namespace.script, useSqlite: namespace.use_sqlite },
      jurisdiction: options.expected_jurisdiction,
      ingress: workersDev,
      routeBinding: { agentId: options.agent_id, routeGeneration: options.route_generation },
      routeOwner: {
        operation: 'read_installable_agent',
        state: security.state,
        predecessorDigest: joined.routeRead.predecessorDigest,
        currentTuplePresent: joined.routeRead.currentTuple !== null,
        currentTupleDigest: joined.routeRead.currentTupleDigest,
        managementKeyId: security.managementKeyId ?? null,
        releaseRootKeyId: security.releaseRootKeyId ?? null,
        currentCredentialKeyId: security.currentCredentialKeyId ?? null,
        managementRequestSequenceHighWater: security.managementRequestSequenceHighWater,
        routeAuthoritativeRereadDigest: joined.routeAuthoritativeRereadDigest,
        twoReadsStable: joined.twoReadsStable,
      },
      secretBindingNames: secretNames,
      q4IndependentOperatorChannel: 'unverified',
      q6bMutationExecuted: false,
      terminalQ5: false,
      secretValues: 'excluded',
    })}\n`);
    return;
  }
  const deploymentJoin = validateD0039CloudflareIdentityJoin({ options, activeVersionId: versionId, namespace, workersDev, owner, providerBindings: bindings });
  process.stdout.write(`${JSON.stringify({
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_provider_control_plane_partial',
    accountId: options.account_id,
    providerPrincipal,
    workerScript: options.script_name,
    deploymentId: deployment.id,
    activeVersionId: versionId,
    activeTrafficPercentage: 100,
    activeSourceSha: owner.runtime.sourceSha,
    deploymentIdentity: deploymentJoin.identity,
    deploymentIdentityDigest: deploymentJoin.digest,
    exportedClass: options.class_name,
    durableObjectBinding: doBinding[0],
    namespace: { id: namespace.id, name: namespace.name, class: namespace.class, script: namespace.script, useSqlite: namespace.use_sqlite },
    jurisdiction: owner.runtime.jurisdiction,
    ingress: workersDev,
    routeBinding: owner.runtime.routeBinding,
    publicVerifierFingerprints: { managementKeyId: owner.managementKeyId, releaseRootKeyId: owner.releaseRootKeyId, currentCredentialKeyId: owner.currentCredentialKeyId },
    legacyHmac: { runtimePresent: owner.legacyHmacPresent, bindingNamePresent: secretNames.includes('TDEV_AGENT_DELIVERY_AUTH_KEY') },
    secretBindingNames: secretNames,
    iamSeparation: 'requires_cross_principal_token_policy_readback',
    authoritySeparation: 'unverified',
    privateKeyCustody: 'unverified',
    terminalQ5: false,
    secretValues: 'excluded',
  })}\n`);
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'cloudflare_readback_failed', message: error?.message ?? 'Q5 Cloudflare readback failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
