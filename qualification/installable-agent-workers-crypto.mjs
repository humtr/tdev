#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertDigest, strictJsonParse } from '../src/canonical.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r3.mjs';

const MAX_VECTOR_BYTES = 1024 * 1024;

function fail(code, message, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || !['--endpoint', '--agent-id', '--route-generation', '--vectors', '--expected-deployment-identity-digest'].includes(flag) || values.has(flag)) {
      fail('workers_crypto_qualification_usage', 'usage: installable-agent-workers-crypto --endpoint <https-url> --agent-id <id> --route-generation <n> --vectors <absolute-public-json> --expected-deployment-identity-digest <sha256>');
    }
    values.set(flag, value);
  }
  if (values.size !== 5) fail('workers_crypto_qualification_usage', 'all Q2 Worker crypto arguments are required');
  const endpoint = new URL(values.get('--endpoint'));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) fail('workers_crypto_qualification_usage', '--endpoint must be credential-free HTTPS');
  const routeGeneration = Number(values.get('--route-generation'));
  if (!Number.isSafeInteger(routeGeneration) || routeGeneration < 1 || String(routeGeneration) !== values.get('--route-generation')) fail('workers_crypto_qualification_usage', '--route-generation is invalid');
  const vectorsPath = values.get('--vectors');
  if (!path.isAbsolute(vectorsPath)) fail('workers_crypto_qualification_usage', '--vectors must be absolute');
  const expectedDeploymentIdentityDigest = values.get('--expected-deployment-identity-digest');
  try { assertDigest(expectedDeploymentIdentityDigest, 'expected deployment identity digest'); }
  catch (cause) { fail('workers_crypto_qualification_usage', '--expected-deployment-identity-digest is invalid', { cause }); }
  return { endpoint, agentId: values.get('--agent-id'), routeGeneration, vectorsPath, expectedDeploymentIdentityDigest };
}

async function main() {
  const { endpoint, agentId, routeGeneration, vectorsPath, expectedDeploymentIdentityDigest } = parseArgs(process.argv.slice(2));
  const token = process.env.TDEV_D0020_QUALIFICATION_TOKEN;
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32 || Buffer.byteLength(token) > 512 || token.includes('\0')) {
    fail('workers_crypto_qualification_token_unavailable', 'TDEV_D0020_QUALIFICATION_TOKEN must be supplied only through the environment');
  }
  const bytes = await readFile(vectorsPath);
  if (bytes.byteLength > MAX_VECTOR_BYTES) fail('workers_crypto_qualification_vectors_too_large', 'Q2 public vector file exceeds its byte bound');
  const vectors = strictJsonParse(bytes, { maxBytes: MAX_VECTOR_BYTES });
  endpoint.pathname = '/qualification/d0020/v2';
  endpoint.search = '';
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0039_workers_crypto_probe', agentId, routeGeneration, vectors }),
  });
  let result;
  try { result = strictJsonParse(new Uint8Array(await response.arrayBuffer()), { maxBytes: MAX_VECTOR_BYTES }); }
  catch (cause) { fail('workers_crypto_qualification_response_invalid', 'Worker returned invalid bounded JSON', { cause }); }
  if (!response.ok || result?.profile !== QUALIFICATION_RPC_PROFILE || result?.schemaVersion !== 2 || result?.ok !== true ||
      result?.result?.proofLayer !== 'deployed_workers_runtime' ||
      result.result?.negativeVectors?.mutation !== true || result.result?.negativeVectors?.domainConfusion !== true ||
      !/^[0-9a-f]{40}$/.test(result.result?.runtime?.sourceSha ?? '') ||
      result.result?.deploymentIdentityDigest !== expectedDeploymentIdentityDigest) {
    fail('workers_crypto_qualification_failed', `deployed Worker Q2 probe failed with HTTP ${response.status}`);
  }
  process.stdout.write(`${JSON.stringify({
    classification: 'observed',
    gate: 'q2_workers_crypto',
    proofLayer: 'deployed_workers_runtime_partial',
    deploymentIdentity: result.result.deploymentIdentity,
    deploymentIdentityDigest: result.result.deploymentIdentityDigest,
    sourceSha: result.result.runtime.sourceSha,
    workerVersionId: result.result.runtime.workerVersionId,
    routeBinding: result.result.runtime.routeBinding,
    algorithms: result.result.algorithms,
    keyIds: result.result.keyIds,
    negativeVectors: result.result.negativeVectors,
    secretValues: 'excluded',
  })}\n`);
}

try { await main(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'workers_crypto_qualification_failed', message: error?.message ?? 'Q2 Worker crypto qualification failed' })}\n`);
  process.exitCode = 1;
}
