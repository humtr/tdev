import {
  ContractError,
  assertRecordShape,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
} from './canonical.mjs';
import { computeAgentConnectRequestDigest } from './agent-delivery-authority.mjs';

export const INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES = 8192;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function validateRequest(input) {
  assertRecordShape(input, [
    'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'connectionId',
    'executorId', 'executorEpoch', 'protocolMetadataDigest', 'installableAgentTuple',
  ], [], 'installable Agent connect challenge request');
  computeAgentConnectRequestDigest(input);
  return canonicalClone(input);
}

function challengeUrl(endpoint, request) {
  const url = new URL(endpoint);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    fail('invalid_installable_agent_challenge_endpoint', 'Challenge endpoint must derive from a credential-free ws/wss Agent delivery URL');
  }
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.search = '';
  url.searchParams.set('agentId', request.agentId);
  url.searchParams.set('routeGeneration', String(request.routeGeneration));
  return url;
}

async function readBoundedResponse(response) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES)) {
    fail('installable_agent_challenge_response_too_large', 'Challenge response exceeds its byte bound');
  }
  if (response.body === null || typeof response.body.getReader !== 'function') {
    fail('installable_agent_challenge_response_invalid', 'Challenge response has no readable body');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = Buffer.from(value);
      total += bytes.byteLength;
      if (total > INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES) {
        await reader.cancel();
        fail('installable_agent_challenge_response_too_large', 'Challenge response exceeds its byte bound');
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock?.();
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail('installable_agent_challenge_response_invalid', 'Challenge response must be application/json');
  try { return strictJsonParse(Buffer.concat(chunks), { maxBytes: INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES }); }
  catch (cause) { fail('installable_agent_challenge_response_invalid', 'Challenge response is not strict bounded JSON', {}, { cause }); }
}

export class InstallableAgentConnectChallengeClient {
  constructor({ endpoint, fetchImpl = globalThis.fetch } = {}) {
    challengeUrl(endpoint, { agentId: 'probe', routeGeneration: 1 });
    if (typeof fetchImpl !== 'function') fail('installable_agent_challenge_transport_unavailable', 'Challenge transport requires fetch');
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
  }

  async issue(input) {
    const request = validateRequest(input);
    const body = canonicalJson(request);
    if (Buffer.byteLength(body) > INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES) {
      fail('agent_connect_request_too_large', 'D0039 connect challenge request exceeds 8192 bytes');
    }
    let response;
    try {
      response = await this.fetchImpl(challengeUrl(this.endpoint, request), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
        body,
        redirect: 'error',
      });
    } catch (cause) {
      fail('installable_agent_challenge_transport_failed', 'Possession challenge transport failed', {}, { cause });
    }
    if (response === null || typeof response !== 'object' || typeof response.ok !== 'boolean' || !response.headers) {
      fail('installable_agent_challenge_response_invalid', 'Challenge transport returned an invalid response');
    }
    const value = await readBoundedResponse(response);
    if (!response.ok) {
      const providerCode = typeof value?.error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(value.error.code)
        ? value.error.code
        : 'unknown';
      fail('installable_agent_challenge_rejected', 'Possession challenge request was rejected', { status: response.status, providerCode });
    }
    assertRecordShape(value, ['classification', 'challenge'], [], 'installable Agent challenge response');
    if (!['accepted', 'exact_replay'].includes(value.classification)) {
      fail('installable_agent_challenge_response_invalid', 'Challenge response classification is invalid');
    }
    return Object.freeze({ classification: value.classification, challenge: canonicalClone(value.challenge) });
  }
}

export function createInstallableAgentConnectChallengeClient(options) {
  return new InstallableAgentConnectChallengeClient(options);
}
