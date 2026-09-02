import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  CloudflareApiClient,
  collectWorkerModules,
  createWorkerUploadForm,
  loadCloudflareCredentials,
  parseCloudflareEnv,
  workerModuleDigest,
} from './cloudflare-casedo-api.mjs';
import { canonicalJson } from '../src/canonical.mjs';
import { installableAgentEvidenceAttestorKeyId } from '../src/installable-agent-security.mjs';

const repositoryRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const reuseExisting = process.argv.includes('--reuse-existing');
const scriptName = 'tdev-d0044-qualification-20260902';
const accountSubdomain = 'humtr';
const sourceSha = 'e6f790ee01918735e3541e77d84cbaa0df3c2d7c';
const deploymentEpoch = 'd0044-r1-provider-20260902';
const apiOrigin = 'https://api.cloudflare.com/client/v4';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function plain(name, text) {
  return { name, type: 'plain_text', text: String(text) };
}

function namesOf(list) {
  return Array.isArray(list) ? list.map((item) => item?.name).filter((name) => typeof name === 'string').sort() : [];
}

async function listNamespaces(client) {
  const response = await client.request('GET', client.accountPath('/workers/durable_objects/namespaces?per_page=1000'));
  if (!Array.isArray(response.result)) throw new Error('namespace list was not an array');
  return response.result;
}

async function workerSettings(client, name) {
  return client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(name)}/settings`), { allowNotFound: true });
}

async function putWorker(client, metadata, modules) {
  const response = await client.request('PUT', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}`), {
    body: createWorkerUploadForm(metadata, modules),
    timeoutMs: 120000,
  });
  return response.result;
}

async function setSecret(client, token) {
  return client.request('PUT', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/secrets`), {
    json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: token, type: 'secret_text' },
  });
}

async function setSubdomain(client, enabled) {
  return client.request('POST', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`), {
    json: { enabled, previews_enabled: false },
  });
}

function metadataFor({ deliveryNamespaceId, electionNamespaceId, moduleDigest, attestorJwk, attestorKeyId, artifactManifestDigest }) {
  const origin = `https://${scriptName}.${accountSubdomain}.workers.dev`;
  const deliveryNamespaceText = deliveryNamespaceId ?? `pending-${scriptName}-delivery`;
  const electionNamespaceText = electionNamespaceId ?? `pending-${scriptName}-election`;
  const bindings = [
    { type: 'durable_object_namespace', name: 'TDEV_AGENT_DELIVERY', class_name: 'AgentDeliveryRuntimeDO', ...(deliveryNamespaceId ? { namespace_id: deliveryNamespaceId } : {}) },
    { type: 'durable_object_namespace', name: 'TDEV_AGENT_ROUTE_ELECTION', class_name: 'AgentRouteElectionRuntimeDO', ...(electionNamespaceId ? { namespace_id: electionNamespaceId } : {}) },
    { type: 'version_metadata', name: 'TDEV_WORKER_VERSION' },
    plain('TDEV_AGENT_DELIVERY_JURISDICTION', 'global'),
    plain('TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES', '262144'),
    plain('TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES', '1048576'),
    plain('TDEV_AGENT_DELIVERY_NAMESPACE', deliveryNamespaceText),
    plain('TDEV_AGENT_ROUTE_ELECTION_MAX_SNAPSHOT_BYTES', '262144'),
    plain('TDEV_AGENT_ROUTE_ELECTION_NAMESPACE', electionNamespaceText),
    plain('TDEV_AGENT_ROUTE_MODE', 'elected_v1'),
    plain('TDEV_D0020_QUALIFICATION_MODE', 'enabled'),
    plain('TDEV_D0039_ACCOUNT_ID', process.env.__TDEV_ACCOUNT_ID),
    plain('TDEV_D0039_ARTIFACT_DIGEST', moduleDigest),
    plain('TDEV_D0039_ARTIFACT_MANIFEST_DIGEST', artifactManifestDigest),
    plain('TDEV_D0039_DEPLOYMENT_EPOCH', deploymentEpoch),
    plain('TDEV_D0039_INGRESS_KIND', 'workers_dev'),
    plain('TDEV_D0039_NAMESPACE_ID', deliveryNamespaceText),
    plain('TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN', origin),
    plain('TDEV_D0039_SERVICE_NAME', scriptName),
    plain('TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE', '100'),
    plain('TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN', accountSubdomain),
    plain('TDEV_D0039_WORKERS_DEV_ENABLED', 'true'),
    plain('TDEV_D0039_WORKERS_DEV_HOSTNAME', `${scriptName}.${accountSubdomain}.workers.dev`),
    plain('TDEV_D0039_WORKERS_DEV_PREVIEWS_ENABLED', 'false'),
    plain('TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID', attestorKeyId),
    plain('TDEV_D0040_EVIDENCE_ATTESTOR_PUBLIC_JWK', canonicalJson(attestorJwk)),
    plain('TDEV_DEPLOYMENT', scriptName),
    plain('TDEV_ENVIRONMENT', 'qualification'),
    plain('TDEV_SOURCE_SHA', sourceSha),
    plain('TDEV_WORKER_SCRIPT', scriptName),
  ];
  return {
    main_module: 'qualification/cloudflare-agent-delivery-worker.mjs',
    compatibility_date: '2026-08-15',
    compatibility_flags: ['nodejs_compat'],
    annotations: {
      'workers/message': `D0044 isolated provider qualification ${sourceSha}`,
      'workers/tag': 'tdev-d0044-r1-provider-qualification-v1',
    },
    bindings,
    exports: {
      AgentDeliveryRuntimeDO: { type: 'durable-object', storage: 'sqlite' },
      AgentRouteElectionRuntimeDO: { type: 'durable-object', storage: 'sqlite' },
    },
  };
}

async function main() {
  const { readFile } = await import('node:fs/promises');
  const envText = await readFile(envFile, 'utf8');
  const env = parseCloudflareEnv(envText);
  const credentials = loadCloudflareCredentials(envFile);
  process.env.__TDEV_ACCOUNT_ID = credentials.accountId;
  const client = new CloudflareApiClient({ ...credentials, apiOrigin });
  const existing = await workerSettings(client, scriptName);
  const namespacesBefore = await listNamespaces(client);
  const scriptMatches = existing.found ? 1 : 0;
  const namespaceMatches = namespacesBefore.filter((item) => item?.script === scriptName);
  if (!reuseExisting && (scriptMatches !== 0 || namespaceMatches.length !== 0)) {
    throw new Error(`refusing to overwrite pre-existing isolated target: script=${scriptMatches} namespaces=${namespaceMatches.length}`);
  }
  if (reuseExisting && (!existing.found || scriptMatches !== 1 || namespaceMatches.length !== 2)) {
    throw new Error(`refusing to reuse an incomplete isolated target: script=${scriptMatches} namespaces=${namespaceMatches.length}`);
  }
  const modules = collectWorkerModules(repositoryRoot, 'qualification/cloudflare-agent-delivery-worker.mjs');
  const moduleDigest = workerModuleDigest(modules);
  const moduleManifest = [...modules].map(([name, source]) => ({ name, sourceDigest: sha256(source) }));
  const artifactManifestDigest = sha256(canonicalJson({ mainModule: 'qualification/cloudflare-agent-delivery-worker.mjs', modules: moduleManifest }));
  const { publicKey } = generateKeyPairSync('ed25519');
  const attestorJwk = publicKey.export({ format: 'jwk' });
  const attestorKeyId = installableAgentEvidenceAttestorKeyId(attestorJwk);
  const qualificationToken = randomBytes(32).toString('hex');

  let delivery;
  let election;
  if (!reuseExisting) await putWorker(client, metadataFor({ moduleDigest, attestorJwk, attestorKeyId, artifactManifestDigest }), modules);
  const namespaces = await listNamespaces(client);
  const namespaceCandidates = reuseExisting ? namespaceMatches : namespaces.filter((item) => item?.script === scriptName);
  delivery = namespaceCandidates.filter((item) => item?.class === 'AgentDeliveryRuntimeDO');
  election = namespaceCandidates.filter((item) => item?.class === 'AgentRouteElectionRuntimeDO');
  if (delivery.length !== 1 || election.length !== 1 || delivery[0].use_sqlite !== true || election[0].use_sqlite !== true) {
    throw new Error(`namespace bootstrap did not produce exactly one SQLite namespace per class: delivery=${delivery.length} election=${election.length}`);
  }
  await putWorker(client, metadataFor({ deliveryNamespaceId: delivery[0].id, electionNamespaceId: election[0].id, moduleDigest, attestorJwk, attestorKeyId, artifactManifestDigest }), modules);
  await setSecret(client, qualificationToken);
  const subdomain = await setSubdomain(client, true);
  const readback = await workerSettings(client, scriptName);
  const deployments = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/deployments`));
  const secrets = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/secrets`));
  const finalNamespaces = await listNamespaces(client);
  const targetNamespaces = finalNamespaces.filter((item) => item?.script === scriptName);
  process.stdout.write(`${JSON.stringify({
    status: 'deployed',
    scriptName,
    reusedExistingTarget: reuseExisting,
    sourceSha,
    moduleCount: modules.size,
    moduleDigest,
    artifactManifestDigest,
    attestorKeyId,
    namespaces: targetNamespaces.map((item) => ({ id: item.id, name: item.name, class: item.class, useSqlite: item.use_sqlite })),
    subdomain: { enabled: subdomain.result?.enabled ?? null, previewsEnabled: subdomain.result?.previews_enabled ?? null, origin: `https://${scriptName}.${accountSubdomain}.workers.dev` },
    deployments: deployments.result,
    secretBindingNames: namesOf(secrets.result),
    settings: readback.result,
    environmentKeysUsed: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
    qualificationTokenConfigured: true,
    providerTokenKind: env.CLOUDFLARE_PROVIDER_TOKEN_KIND ?? null,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_deploy_failed', message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
