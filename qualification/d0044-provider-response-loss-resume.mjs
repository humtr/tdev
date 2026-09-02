import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CloudflareApiClient, loadCloudflareCredentials, parseCloudflareEnv } from './cloudflare-casedo-api.mjs';
import { agentRouteHostKey, agentRouteElectionDigest } from '../src/agent-route-election.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const origin = `https://${scriptName}.humtr.workers.dev`;
const agentId = 'd0044-provider-response-loss-20260903-r21';
const profile = 'tdev.agent-route-election-qualification.v1';

async function invoke(token, path, body) {
  try {
    const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let parsed; try { parsed = await response.json(); } catch { parsed = { ok: false, error: { code: 'invalid_json_response' } }; }
    return { status: response.status, body: parsed };
  } catch (error) { return { status: null, transportError: { name: error?.name ?? 'Error', code: error?.code ?? null } }; }
}
async function authInvoke(token, path, body, label) {
  let response = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    response = await invoke(token, path, body);
    if (response.status !== 401) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed`);
}
function ok(label, response) {
  if (response.status !== 200 || response.body?.ok !== true) throw new Error(`${label} failed: ${response.body?.error?.code ?? `http_${response.status}`}`);
  return response.body.result;
}
async function main() {
  parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const token = randomBytes(32).toString('hex');
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), { json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: token, type: 'secret_text' } });
  const election = ok('read election', await authInvoke(token, '/qualification/d0044/election/v1', { profile, operation: 'readAgentRouteElection', agentId, payload: {} }, 'read election'));
  const successorHostKey = agentRouteHostKey({ agentId, routeGeneration: 2 });
  const predecessorHostKey = agentId;
  const replay = await authInvoke(token, '/qualification/d0044/election/v1', { profile, operation: 'commitAgentRouteCutover', agentId, payload: { cutoverRequestId: 'rc1:1' } }, 'replay commit');
  const successor = await authInvoke(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: successorHostKey, rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration: 2 } }, 'read successor');
  const predecessor = await authInvoke(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: predecessorHostKey, rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration: 1 } }, 'read predecessor');
  const activation = await authInvoke(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: successorHostKey, rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'activate_route', agentId, routeGeneration: 2, electionState: election } }, 'activate successor');
  process.stdout.write(`${JSON.stringify({ status: 'response_loss_resume_diagnostic', agentId, electionDigest: agentRouteElectionDigest(election), replay: { status: replay.status, code: replay.body?.error?.code ?? null, classification: replay.body?.result?.classification ?? null }, election, successor: { status: successor.status, code: successor.body?.error?.code ?? null, result: successor.body?.result ?? null }, predecessor: { status: predecessor.status, code: predecessor.body?.error?.code ?? null, result: predecessor.body?.result ?? null }, activation: { status: activation.status, code: activation.body?.error?.code ?? null, result: activation.body?.result ?? null }, secretValues: 'excluded', qualificationTokenRotated: true }, null, 2)}\n`);
}
main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_response_loss_resume_failed', message: error?.message ?? String(error) })}\n`); process.exitCode = 1; });
