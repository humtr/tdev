#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA,
  INSTALLABLE_AGENT_PACKAGE_MANIFEST_SCHEMA_VERSION,
  INSTALLABLE_AGENT_PACKAGE_PROFILE,
  INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION,
  INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_SCHEMA_VERSION,
  INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
} from '../src/installable-agent-package.mjs';
import { AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION } from '../src/agent-delivery-authority.mjs';
import { AGENT_DELIVERY_WEBSOCKET_PROTOCOL } from '../src/cloudflare-agent-delivery-runtime.mjs';
import {
  INSTALLABLE_AGENT_SUPERVISOR_PROFILE,
  INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION,
} from '../src/installable-agent-supervisor.mjs';
import { INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL } from '../src/installable-agent-supervisor-service.mjs';
import { INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE } from '../src/installable-agent-termux-service.mjs';
import {
  INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION,
  INSTALLABLE_AGENT_TOOL_PROFILES_RELATIVE_PATH,
} from '../src/installable-agent-control.mjs';
import { canonicalJson, digest } from '../src/canonical.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_REVISION_RE = /^[0-9a-f]{40}$/;
const SOURCE_FILES = [
  ['src/canonical.mjs', 'runtime'],
  ['src/installable-agent-admission.mjs', 'runtime'],
  ['src/installable-agent-security.mjs', 'runtime-security'],
  ['src/installable-agent-keystore.mjs', 'android-keystore-adapter'],
  ['src/installable-agent-android-source.mjs', 'android-source-lineage-reader'],
  ['src/installable-agent-challenge.mjs', 'agent-challenge-client'],
  ['src/agent-delivery-authority.mjs', 'runtime'],
  ['src/cloudflare-agent-delivery-runtime.mjs', 'runtime'],
  ['src/local-agent-runtime.mjs', 'runtime'],
  ['src/installable-agent-supervisor.mjs', 'runtime'],
  ['src/installable-agent-warden.mjs', 'runtime'],
  ['src/installable-agent-supervisor-service.mjs', 'package-service'],
  ['src/installable-agent-termux-service.mjs', 'package-service-management'],
  ['src/installable-agent-package.mjs', 'package-management'],
  ['src/installable-agent-package-cli.mjs', 'package-management-cli'],
  ['src/installable-agent-control.mjs', 'agent-control'],
  [INSTALLABLE_AGENT_TOOL_PROFILES_RELATIVE_PATH, 'package-tool-profiles'],
  ['native/installable-agent-supervisor/manifest.json', 'native-helper-manifest'],
];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBytes(revision, relativePath) {
  const result = spawnSync('git', ['show', `${revision}:${relativePath}`], { cwd: root, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
    fail(`cannot materialize ${relativePath} from ${revision}: ${stderr.trim()}`);
  }
  return Buffer.from(result.stdout);
}

function assertCommit(revision) {
  const result = spawnSync('git', ['cat-file', '-e', `${revision}^{commit}`], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(`source revision is not an available Git commit: ${revision}`);
}

function parseArgs(argv) {
  let sourceRevision = null;
  let outputDirectory = null;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--source-revision', '--output-directory'].includes(flag)) fail(`unsupported option: ${flag}`);
    if (index + 1 >= argv.length) fail(`missing value for ${flag}`);
    const value = argv[index + 1];
    index += 1;
    if (flag === '--source-revision') sourceRevision = value;
    else outputDirectory = path.resolve(value);
  }
  if (!SOURCE_REVISION_RE.test(sourceRevision ?? '')) fail('--source-revision must be an exact lowercase 40-hex Git SHA');
  return { sourceRevision, outputDirectory };
}

async function writeMaterialized(stageRoot, relativePath, bytes, mode = 0o644) {
  const fullPath = path.join(stageRoot, ...relativePath.split('/'));
  await mkdir(path.dirname(fullPath), { recursive: true, mode: 0o755 });
  await writeFile(fullPath, bytes, { mode });
  await chmod(fullPath, mode);
}

async function fileEntry(stageRoot, relativePath, role) {
  const fullPath = path.join(stageRoot, ...relativePath.split('/'));
  const fileStat = await stat(fullPath);
  if (!fileStat.isFile()) fail(`staged package payload is not a regular file: ${relativePath}`);
  const bytes = await readFile(fullPath);
  return { sha256: sha256(bytes), bytes: bytes.byteLength, role };
}

async function main() {
  const { sourceRevision, outputDirectory: requestedOutput } = parseArgs(process.argv.slice(2));
  assertCommit(sourceRevision);
  const nativeManifestBytes = gitBytes(sourceRevision, 'native/installable-agent-supervisor/manifest.json');
  let nativeManifest;
  try { nativeManifest = JSON.parse(nativeManifestBytes.toString('utf8')); }
  catch { fail('source revision contains invalid installable-agent-supervisor native manifest'); }
  if (nativeManifest?.schemaVersion !== 1 || nativeManifest?.abiVersion !== 1 || nativeManifest?.profile !== INSTALLABLE_AGENT_SUPERVISOR_PROFILE) {
    fail('source revision contains incompatible installable-agent-supervisor native manifest');
  }
  const targetKey = 'android-arm64';
  const helper = nativeManifest.helpers?.[targetKey];
  if (!helper || helper.platform !== 'android' || helper.arch !== 'arm64' || typeof helper.relativePath !== 'string' || typeof helper.sha256 !== 'string') {
    fail('source revision does not contain the required Android/arm64 pidfd helper');
  }
  const helperBytes = gitBytes(sourceRevision, helper.relativePath);
  if (sha256(helperBytes) !== helper.sha256) fail('source revision native helper digest mismatches its manifest');

  const outputDirectory = requestedOutput ?? path.join(root, 'native', 'installable-agent-package', targetKey);
  await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tdev-installable-agent-package-'));
  const stageRoot = path.join(temporaryRoot, 'package');
  await mkdir(stageRoot, { recursive: true, mode: 0o755 });
  try {
    const roles = new Map();
    for (const [relativePath, role] of SOURCE_FILES) {
      const bytes = relativePath === 'native/installable-agent-supervisor/manifest.json'
        ? nativeManifestBytes
        : gitBytes(sourceRevision, relativePath);
      await writeMaterialized(stageRoot, relativePath, bytes, relativePath.endsWith('installable-agent-package-cli.mjs') || relativePath.endsWith('installable-agent-control.mjs') || relativePath.endsWith('installable-agent-warden.mjs') || relativePath.endsWith('installable-agent-supervisor-service.mjs') ? 0o755 : 0o644);
      roles.set(relativePath, role);
    }
    await writeMaterialized(stageRoot, helper.relativePath, helperBytes, 0o755);
    roles.set(helper.relativePath, 'native-pidfd-helper');

    const packageJson = {
      name: '@tdev/installable-agent',
      version: '0.0.0-d0027-r1',
      private: true,
      type: 'module',
      engines: { node: '>=22' },
      bin: {
        'tdev-agent': 'src/installable-agent-package-cli.mjs',
        'tdev-agent-control': 'src/installable-agent-control.mjs',
      },
    };
    await writeMaterialized(stageRoot, 'package.json', Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`), 0o644);
    roles.set('package.json', 'package-metadata');

    const files = {};
    for (const relativePath of [...roles.keys()].sort()) files[relativePath] = await fileEntry(stageRoot, relativePath, roles.get(relativePath));
    const manifest = {
      schemaVersion: INSTALLABLE_AGENT_PACKAGE_MANIFEST_SCHEMA_VERSION,
      profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
      sourceRevision,
      target: { platform: 'android', arch: 'arm64' },
      runtime: { nodeMajorMinimum: 22 },
      stateSchemas: {
        agentDeliverySnapshot: AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION,
        supervisorJournal: INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION,
        packageState: INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION,
        managementJournal: INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_SCHEMA_VERSION,
        controlConnection: INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION,
      },
      protocols: {
        agentWebSocket: AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
        management: INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
        supervisorService: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
      },
      capabilityProfile: INSTALLABLE_AGENT_SUPERVISOR_PROFILE,
      serviceHostProfile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
      configurationSchemaDigest: digest(INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA),
      toolProfiles: {
        relativePath: INSTALLABLE_AGENT_TOOL_PROFILES_RELATIVE_PATH,
        sha256: files[INSTALLABLE_AGENT_TOOL_PROFILES_RELATIVE_PATH].sha256,
      },
      helperAbi: {
        profile: nativeManifest.profile,
        abiVersion: nativeManifest.abiVersion,
        relativePath: helper.relativePath,
        sha256: helper.sha256,
      },
      files,
    };
    await writeMaterialized(stageRoot, 'release-manifest.json', Buffer.from(`${canonicalJson(manifest)}\n`), 0o644);

    const archiveName = `tdev-installable-agent-${targetKey}-${sourceRevision}.tgz`;
    const archivePath = path.join(outputDirectory, archiveName);
    await rm(archivePath, { force: true });
    const tarArguments = [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--format=ustar',
      '--mode=u+rwX,go+rX,go-w',
      '-czf', archivePath,
      '-C', stageRoot,
      '.',
    ];
    const tarResult = spawnSync('tar', tarArguments, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    });
    if (tarResult.error || tarResult.status !== 0) fail(`tar package build failed: ${(tarResult.stderr ?? '').trim()}`);
    const archiveBytes = await readFile(archivePath);
    const artifact = {
      schemaVersion: 1,
      profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
      sourceRevision,
      target: { platform: 'android', arch: 'arm64' },
      archive: { file: archiveName, sha256: sha256(archiveBytes), bytes: archiveBytes.byteLength },
      releaseManifestDigest: digest(manifest),
    };
    await writeFile(path.join(outputDirectory, 'artifact.json'), `${canonicalJson(artifact)}\n`, { mode: 0o644 });
    await writeFile(path.join(outputDirectory, 'release-manifest.json'), `${canonicalJson(manifest)}\n`, { mode: 0o644 });
    process.stdout.write(`${canonicalJson({ outputDirectory, artifact })}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
