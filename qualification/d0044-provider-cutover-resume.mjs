import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CloudflareApiClient, loadCloudflareCredentials, parseCloudflareEnv } from './cloudflare-casedo-api.mjs';
import { agentRouteHostKey, agentRouteElectionDigest } from '../src/agent-route-election.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const origin = `https://${scriptName}.humtr.workers.dev`;
const agentId = 'd0044-provider-import-20260902-r20';
const profile = 'tdev.agent-route-election-qualification.v1';

async function invoke(token, path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let parsed; try { parsed = await response.json(); } catch { parsed = { ok: false, error: { code: 'invalid_json_response' } }; }
  return { status: response.status, body: parsed };
}
async function invokeWithAuthPropagation(token, path, body, label) {
  let response = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    response = await invoke(token, path, body);
    if (response.status !== 401) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed`);
}
function assertOk(label, response) {
  if (response.status !== 200 || response.body?.ok !== true) throw new Error(`${label} failed: ${response.body?.error?.code ?? `http_${response.status}`}`);
  return response.body.result;
}
async function main() {
  const env = parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const token = randomBytes(32).toString('hex');
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), { json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: token, type: 'secret_text' } });
  const election = assertOk('read committed election', await invokeWithAuthPropagation(token, '/qualification/d0044/election/v1', { profile, operation: 'readAgentRouteElection', agentId, payload: {} }, 'read committed election'));
  const successorHostKey = agentRouteHostKey({ agentId, routeGeneration: 2 });
  const successorBefore = assertOk('read successor before activation', await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: successorHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration: 2 },
  }));
  const activated = successorBefore.disposition === 'ACTIVE' ? { classification: 'already_active' } : assertOk('activate successor', await invoke(token, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey: successorHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'activate_route', agentId, routeGeneration: 2, electionState: election },
  }));
  const successor = assertOk('read successor generation', await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: successorHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration: 2 },
  }));
  const predecessorHostKey = agentId;
  const stale = await invoke(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: predecessorHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'activate_route', agentId, routeGeneration: 1, electionState: election },
  });
  const predecessor = assertOk('read predecessor generation after stale activation', await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: predecessorHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration: 1 },
  }));
  process.stdout.write(`${JSON.stringify({ status: 'resume_activation_complete', agentId, successorHostKey, electionDigest: agentRouteElectionDigest(election), electionCurrentRoute: election.currentRoute, activated, successorDisposition: successor.disposition, successorStateDigest: successor.stateDigest ?? null, predecessorDisposition: predecessor.disposition, predecessorStateDigest: predecessor.stateDigest ?? null, staleActivation: { status: stale.status, code: stale.body?.error?.code ?? null }, secretValues: 'excluded', qualificationTokenRotated: true }, null, 2)}\n`);
}
main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_cutover_resume_failed', message: error?.message ?? String(error) })}\n`); process.exitCode = 1; });
