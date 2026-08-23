#!/usr/bin/env node
import { strictJsonParse } from '../src/canonical.mjs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function parseArgs(argv) {
  const allowed = new Set(['--account-id', '--script-name', '--namespace-name', '--class-name', '--zone-id', '--route-id', '--qualification-endpoint', '--agent-id', '--route-generation', '--expected-source-sha', '--expected-jurisdiction']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || values.has(flag)) fail('cloudflare_readback_usage', 'Q5 readback arguments are missing, duplicated, or unknown');
    values.set(flag, value);
  }
  if ([...allowed].some((flag) => !values.has(flag))) fail('cloudflare_readback_usage', 'all Q5 Cloudflare readback arguments are required');
  const routeGeneration = Number(values.get('--route-generation'));
  if (!Number.isSafeInteger(routeGeneration) || routeGeneration < 1 || String(routeGeneration) !== values.get('--route-generation')) fail('cloudflare_readback_usage', 'route generation is invalid');
  const endpoint = new URL(values.get('--qualification-endpoint'));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) fail('cloudflare_readback_usage', 'qualification endpoint must be credential-free HTTPS');
  if (!/^[0-9a-f]{40}$/.test(values.get('--expected-source-sha'))) fail('cloudflare_readback_usage', 'expected source SHA is invalid');
  return Object.fromEntries([...values].map(([key, value]) => [key.slice(2).replaceAll('-', '_'), value]).concat([['route_generation', routeGeneration], ['qualification_endpoint', endpoint]]));
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
  return result;
}

async function routeOwnerReadback(options, qualificationToken) {
  const endpoint = new URL(options.qualification_endpoint);
  endpoint.pathname = '/qualification/d0020/v1';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${qualificationToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'd0039_security_readback', agentId: options.agent_id, routeGeneration: options.route_generation }),
  });
  const body = await boundedJson(response, 'route-owner readback');
  if (!response.ok || body?.ok !== true || body?.result?.secretValues !== 'excluded') fail('cloudflare_route_owner_readback_failed', 'route-owner security readback failed', { status: response.status });
  return body.result;
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
  const [deploymentsResult, namespaces, secrets, route, owner] = await Promise.all([
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/deployments`, 'Worker deployments'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/durable_objects/namespaces?per_page=1000`, 'Durable Object namespaces'),
    cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/secrets`, 'Worker secret inventory'),
    cloudflareGet(apiToken, `/zones/${encodeURIComponent(options.zone_id)}/workers/routes/${encodeURIComponent(options.route_id)}`, 'Worker route'),
    routeOwnerReadback(options, qualificationToken),
  ]);
  const deployments = deploymentsResult?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) fail('cloudflare_readback_deployment_invalid', 'Worker has no deployment readback');
  const deployment = deployments[0];
  if (!Array.isArray(deployment.versions) || deployment.versions.length !== 1 || deployment.versions[0]?.percentage !== 100) {
    fail('cloudflare_readback_mixed_writers', 'Active Worker deployment is not one 100-percent version');
  }
  const versionId = deployment.versions[0].version_id;
  const version = await cloudflareGet(apiToken, `/accounts/${account}/workers/scripts/${script}/versions/${encodeURIComponent(versionId)}`, 'Worker version');
  const bindings = Array.isArray(version?.resources?.bindings) ? version.resources.bindings.map(publicBinding).filter(Boolean) : [];
  const doBinding = bindings.filter((binding) => binding.name === 'TDEV_AGENT_DELIVERY' && /durable_object/i.test(binding.type ?? ''));
  if (doBinding.length !== 1 || !containsNamedExport(version?.resources?.script_runtime?.exports ?? version?.resources?.script?.exports ?? {}, options.class_name)) {
    fail('cloudflare_readback_runtime_binding_invalid', 'Worker version does not expose the exact AgentDeliveryRuntimeDO binding/class');
  }
  const namespaceMatches = Array.isArray(namespaces)
    ? namespaces.filter((entry) => entry?.name === options.namespace_name && entry?.class === options.class_name && entry?.script === options.script_name)
    : [];
  if (namespaceMatches.length !== 1) fail('cloudflare_readback_namespace_ambiguous', 'Exact Durable Object namespace readback is missing or ambiguous');
  if (owner?.runtime?.sourceSha !== options.expected_source_sha || owner?.runtime?.workerScript !== options.script_name ||
      owner?.runtime?.namespace !== options.namespace_name || owner?.runtime?.jurisdiction !== options.expected_jurisdiction ||
      owner?.runtime?.routeBinding?.agentId !== options.agent_id || owner?.runtime?.routeBinding?.routeGeneration !== options.route_generation) {
    fail('cloudflare_readback_route_owner_mismatch', 'Provider control-plane and route-owner readbacks disagree');
  }
  const secretNames = Array.isArray(secrets) ? secrets.map((entry) => entry?.name).filter((name) => typeof name === 'string').sort() : [];
  process.stdout.write(`${JSON.stringify({
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_provider_control_plane_partial',
    accountId: options.account_id,
    workerScript: options.script_name,
    deploymentId: deployment.id,
    activeVersionId: versionId,
    activeTrafficPercentage: 100,
    activeSourceSha: owner.runtime.sourceSha,
    exportedClass: options.class_name,
    durableObjectBinding: doBinding[0],
    namespace: { id: namespaceMatches[0].id, name: namespaceMatches[0].name, class: namespaceMatches[0].class, script: namespaceMatches[0].script, useSqlite: namespaceMatches[0].use_sqlite },
    jurisdiction: owner.runtime.jurisdiction,
    route: { id: options.route_id, pattern: route?.pattern ?? null, script: route?.script ?? null },
    routeBinding: owner.runtime.routeBinding,
    ingress: options.qualification_endpoint.origin,
    publicVerifierFingerprints: { managementKeyId: owner.managementKeyId, releaseRootKeyId: owner.releaseRootKeyId, currentCredentialKeyId: owner.currentCredentialKeyId },
    legacyHmac: { runtimePresent: owner.legacyHmacPresent, bindingNamePresent: secretNames.includes('TDEV_AGENT_DELIVERY_AUTH_KEY') },
    secretBindingNames: secretNames,
    iamSeparation: 'requires_controller_cross_principal_readback',
    secretValues: 'excluded',
  })}\n`);
}

try { await main(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'cloudflare_readback_failed', message: error?.message ?? 'Q5 Cloudflare readback failed', details: error?.details ?? {} })}\n`);
  process.exitCode = 1;
}
