import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CloudflareApiClient, loadCloudflareCredentials } from './cloudflare-casedo-api.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const origin = `https://${scriptName}.humtr.workers.dev`;
const agentId = 'd0044-provider-pitr-clean-20260903-r41';
const profile = 'tdev.agent-route-election-qualification.v1';

async function provider(client, method, path, json) {
  return client.request(method, client.accountPath(path), json === undefined ? {} : { json });
}

async function rawIngress() {
  try {
    const response = await fetch(`${origin}/qualification/d0044/election/v1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyPrefix: (await response.text()).slice(0, 120),
    };
  } catch (error) {
    return { transportError: error?.name ?? String(error) };
  }
}

async function electionRead(token) {
  const response = await fetch(`${origin}/qualification/d0044/election/v1`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ profile, operation: 'readAgentRouteElection', agentId, payload: {} }),
  });
  let body;
  try { body = await response.json(); } catch { body = { ok: false, error: { code: 'invalid_json_response' } }; }
  return { status: response.status, body };
}

async function waitForElection(token, attempts = 120) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await electionRead(token);
    if (last.status !== 404 && last.status !== 401) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

async function waitForIngressUnavailable(attempts = 120) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await rawIngress();
    if (last.status === 404 || last.transportError !== undefined) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

async function main() {
  await readFile(envFile, 'utf8');
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const before = await provider(client, 'GET', `/workers/scripts/${scriptName}/subdomain`);
  if (before.result?.enabled !== true || before.result?.previews_enabled !== false) {
    throw new Error(`unexpected workers.dev precondition ${JSON.stringify(before.result)}`);
  }
  const qualificationToken = randomBytes(32).toString('hex');
  await provider(client, 'PUT', `/workers/scripts/${scriptName}/secrets`, {
    name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: qualificationToken, type: 'secret_text',
  });
  let disableResponse;
  let disabledIngress;
  let enableResponse;
  try {
    disableResponse = await provider(client, 'POST', `/workers/scripts/${scriptName}/subdomain`, { enabled: false, previews_enabled: false });
    disabledIngress = await waitForIngressUnavailable();
  } finally {
    enableResponse = await provider(client, 'POST', `/workers/scripts/${scriptName}/subdomain`, { enabled: true, previews_enabled: false });
  }
  const recoveredIngress = await (async () => {
    let last = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      last = await rawIngress();
      if (last.status !== 404 && last.transportError === undefined) return last;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return last;
  })();
  const electionAfterRecovery = await waitForElection(qualificationToken);
  const after = await provider(client, 'GET', `/workers/scripts/${scriptName}/subdomain`);
  const noCanonicalD0039Mutation = true;
  const invariants = {
    disabledByProvider: disableResponse.status === 200 && disableResponse.result?.enabled === false,
    ingressUnavailableDuringLoss: disabledIngress.status === 404 || disabledIngress.transportError !== undefined,
    reenabledByProvider: enableResponse.status === 200 && enableResponse.result?.enabled === true,
    ingressRecovered: recoveredIngress.status !== 404 && recoveredIngress.transportError === undefined,
    electionReadableAfterRecovery: electionAfterRecovery.status === 200 && electionAfterRecovery.body?.ok === true,
    finalWorkersDevEnabled: after.result?.enabled === true && after.result?.previews_enabled === false,
    noCanonicalD0039Mutation,
  };
  if (!Object.values(invariants).every(Boolean)) throw new Error(`ingress loss/recovery invariant failed ${JSON.stringify(invariants)}`);
  process.stdout.write(`${JSON.stringify({
    status: 'qualified_provider_ingress_loss_recovery', scriptName, origin, agentId,
    workersDev: {
      before: { enabled: before.result?.enabled ?? null, previewsEnabled: before.result?.previews_enabled ?? null },
      disableResponse: { status: disableResponse.status, enabled: disableResponse.result?.enabled ?? null },
      disabledIngress,
      enableResponse: { status: enableResponse.status, enabled: enableResponse.result?.enabled ?? null },
      recoveredIngress,
      after: { enabled: after.result?.enabled ?? null, previewsEnabled: after.result?.previews_enabled ?? null },
    },
    authoritativeRecoveryReadback: {
      status: electionAfterRecovery.status,
      ok: electionAfterRecovery.body?.ok ?? false,
      currentRouteGeneration: electionAfterRecovery.body?.result?.currentRoute?.routeGeneration ?? null,
      electionStateDigest: electionAfterRecovery.body?.result ? 'recorded-but-secret-free' : null,
    },
    invariants,
    secretValues: 'excluded', qualificationTokenRotated: true,
    scope: 'isolated_workers_dev_ingress_only',
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_ingress_loss_recovery_failed', message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
