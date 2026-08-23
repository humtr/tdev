#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX,
  TermuxAndroidKeyStoreCredential,
  createTermuxAndroidSourceLineageReader,
  encodeBase64Url,
  installableAgentCredentialRef,
  verifyRsa3072SignedRecord,
} from '../src/index.mjs';
import { canonicalJson, strictJsonParse } from '../src/canonical.mjs';

const RESULT_MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 60_000;

function fail(code, message, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  throw error;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function parseCoordinatorArgs(argv) {
  let expectedLineage = null;
  let credentialRef = null;
  let cleanupCredentialKeyId = null;
  let provisionEphemeral = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--provision-ephemeral') {
      if (provisionEphemeral) fail('termux_keystore_qualification_usage', 'duplicate --provision-ephemeral');
      provisionEphemeral = true;
      continue;
    }
    if (!['--expected-lineage', '--credential-ref', '--cleanup-credential-key-id'].includes(flag) || argv[index + 1] === undefined) {
      fail('termux_keystore_qualification_usage', 'usage: installable-agent-termux-keystore --expected-lineage <sha256> [--credential-ref <androidkeystore-uri> | --provision-ephemeral | --cleanup-credential-key-id <public-fingerprint>]');
    }
    const value = argv[index + 1];
    index += 1;
    if (flag === '--expected-lineage') {
      if (expectedLineage !== null) fail('termux_keystore_qualification_usage', 'duplicate --expected-lineage');
      expectedLineage = value;
    } else if (flag === '--credential-ref') {
      if (credentialRef !== null) fail('termux_keystore_qualification_usage', 'duplicate --credential-ref');
      credentialRef = value;
    } else {
      if (cleanupCredentialKeyId !== null) fail('termux_keystore_qualification_usage', 'duplicate --cleanup-credential-key-id');
      cleanupCredentialKeyId = value;
    }
  }
  const credentialModes = Number(credentialRef !== null) + Number(provisionEphemeral) + Number(cleanupCredentialKeyId !== null);
  if (!/^[0-9a-f]{64}$/.test(expectedLineage ?? '') || (cleanupCredentialKeyId !== null && !/^sha256:[0-9a-f]{64}$/.test(cleanupCredentialKeyId)) || credentialModes > 1) {
    fail('termux_keystore_qualification_usage', 'exact lineage is required and credential modes are mutually exclusive');
  }
  return { expectedLineage, credentialRef, provisionEphemeral, cleanupCredentialKeyId };
}

function run(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', maxBuffer: RESULT_MAX_BYTES });
  if (result.error || result.status !== 0) fail('termux_keystore_qualification_command_failed', `${path.basename(executable)} failed: ${(result.stderr ?? '').trim().slice(0, 2048)}`);
  return result;
}

async function serviceProbe(inputPath, outputPath) {
  const bytes = await readFile(inputPath);
  if (bytes.byteLength > RESULT_MAX_BYTES) fail('termux_keystore_qualification_input_invalid', 'Q3 service input exceeds its bound');
  const input = strictJsonParse(bytes, { maxBytes: RESULT_MAX_BYTES });
  const sourceLineageReader = createTermuxAndroidSourceLineageReader();
  const credential = new TermuxAndroidKeyStoreCredential({ sourceLineageReader });
  const lineage = await credential.verifySourceLineage(input.expectedLineage);
  const initialKeys = await credential.listDetailed();
  let credentialRef = input.credentialRef;
  let ephemeral = false;
  let deleted = false;
  let cleanup = 'not_requested';
  let verifier = null;
  try {
    if (input.provisionEphemeral === true) {
      const randomId = randomBytes(12).toString('hex');
      const aliasRecord = {
        profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
        agentId: `qualification-agent-${randomId}`,
        routeGeneration: 1,
        installationGeneration: 1,
        credentialGeneration: 1,
      };
      credentialRef = installableAgentCredentialRef(aliasRecord);
      const provisioned = await credential.provision({ aliasRecord, androidSourceLineageId: input.expectedLineage });
      verifier = { credentialKeyId: provisioned.credentialKeyId, publicJwk: provisioned.publicJwk };
      ephemeral = true;
    } else if (credentialRef !== null) {
      verifier = await credential.readPublicVerifier(credentialRef);
    } else if (input.cleanupCredentialKeyId !== null) {
      const matches = [];
      for (const entry of initialKeys) {
        if (typeof entry?.alias !== 'string' || !/^tdev\.a1\.[A-Za-z0-9_-]{43}$/.test(entry.alias)) continue;
        const candidateRef = `${INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX}${entry.alias}`;
        const candidate = await credential.readPublicVerifier(candidateRef);
        if (candidate.credentialKeyId === input.cleanupCredentialKeyId) matches.push(candidateRef);
      }
      if (matches.length !== 1) fail('termux_keystore_qualification_cleanup_ambiguous', 'cleanup fingerprint must resolve exactly one D0039 alias');
      await credential.delete(matches[0]);
      cleanup = 'exact_public_fingerprint_deleted';
    }
    let unattendedSign = 'not_requested';
    if (verifier !== null) {
      const context = {
        profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
        agentId: 'qualification-agent',
        routeGeneration: 1,
        challengeGeneration: 1,
        nonce: encodeBase64Url(randomBytes(32)),
        credentialGeneration: 1,
        credentialKeyId: verifier.credentialKeyId,
        connectRequestDigest: `sha256:${randomBytes(32).toString('hex')}`,
        issuedAtMs: 1,
        expiresAtMs: 120001,
      };
      const envelope = await credential.signPossession({
        credentialRef,
        context,
        expectedCredentialKeyId: verifier.credentialKeyId,
        androidSourceLineageId: input.expectedLineage,
      });
      await verifyRsa3072SignedRecord({
        domain: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
        record: context,
        signature: envelope.signature,
        publicJwk: verifier.publicJwk,
      });
      unattendedSign = 'rsa3072_sha256withrsa_interoperable';
    }
    if (ephemeral && credentialRef !== null) {
      await credential.delete(credentialRef);
      deleted = true;
    }
    await writeFile(outputPath, `${canonicalJson({
      classification: 'qualified',
      gate: 'q3_physical_android_termux',
      proofLayer: 'physical_android_termux_service',
      androidSourceLineageId: lineage.androidSourceLineageId,
      termuxApi: 'available_through_runit_service',
      keyInventory: 'readable_without_private_export',
      keyInventoryCount: initialKeys.length,
      credentialKeyId: verifier?.credentialKeyId ?? null,
      unattendedSign,
      cleanup,
      privateKeyExport: 'absent',
      fileKeyFallback: 'absent',
      ephemeralCredentialDeletedBeforeResult: ephemeral ? deleted : false,
    })}\n`, { mode: 0o600 });
  } finally {
    if (ephemeral && !deleted && credentialRef !== null) await credential.delete(credentialRef);
  }
}

async function waitForResult(outputPath) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { return await readFile(outputPath); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail('termux_keystore_qualification_timeout', 'Q3 runit service did not produce a result before timeout');
}

async function waitForSupervisor(servicePath) {
  const endpoint = path.join(servicePath, 'supervise', 'ok');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const endpointStat = await stat(endpoint);
      if (endpointStat.isFIFO()) return;
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail('termux_keystore_qualification_supervisor_timeout', 'runit did not discover the Q3 one-shot service');
}

async function coordinate() {
  const options = parseCoordinatorArgs(process.argv.slice(2));
  if (process.platform !== 'android' || process.arch !== 'arm64') fail('installable_agent_profile_unsupported', 'Q3 requires Android/arm64 Termux');
  const prefix = process.env.PREFIX;
  if (typeof prefix !== 'string' || !path.isAbsolute(prefix)) fail('installable_agent_profile_unsupported', 'Termux PREFIX is unavailable');
  const staging = await mkdtemp(path.join(os.tmpdir(), 'tdev-agent-q3-service-'));
  const serviceName = `tdev-agent-q3-${randomBytes(8).toString('hex')}`;
  const servicePath = path.join(staging, serviceName);
  const inputPath = path.join(staging, 'input.json');
  const outputPath = path.join(staging, 'result.json');
  const svPath = path.join(prefix, 'bin', 'sv');
  await mkdir(servicePath, { mode: 0o700 });
  await writeFile(inputPath, `${canonicalJson(options)}\n`, { mode: 0o600 });
  const self = fileURLToPath(import.meta.url);
  await writeFile(path.join(servicePath, 'run'), `#!/data/data/com.termux/files/usr/bin/bash\nexec ${shellQuote(process.execPath)} ${shellQuote(self)} --service-probe ${shellQuote(inputPath)} ${shellQuote(outputPath)}\n`, { mode: 0o700 });
  await writeFile(path.join(servicePath, 'finish'), `#!/data/data/com.termux/files/usr/bin/bash\nexec ${shellQuote(svPath)} down ${shellQuote(servicePath)}\n`, { mode: 0o700 });
  await writeFile(path.join(servicePath, 'down'), '', { mode: 0o600 });
  await chmod(path.join(servicePath, 'run'), 0o700);
  await chmod(path.join(servicePath, 'finish'), 0o700);
  const runsv = spawn(path.join(prefix, 'bin', 'runsv'), [servicePath], { stdio: 'ignore', shell: false });
  try {
    await waitForSupervisor(servicePath);
    run(svPath, ['up', servicePath]);
    const resultBytes = await waitForResult(outputPath);
    if (resultBytes.byteLength > RESULT_MAX_BYTES) fail('termux_keystore_qualification_result_invalid', 'Q3 service result exceeds its bound');
    const result = strictJsonParse(resultBytes, { maxBytes: RESULT_MAX_BYTES });
    if (result?.classification !== 'qualified' || result?.proofLayer !== 'physical_android_termux_service' || result?.androidSourceLineageId !== options.expectedLineage) {
      fail('termux_keystore_qualification_result_invalid', 'Q3 service result did not prove the requested source lineage');
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    try { spawnSync(svPath, ['down', servicePath], { encoding: 'utf8' }); } catch {}
    runsv.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => runsv.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await rm(staging, { recursive: true, force: true });
  }
}

try {
  if (process.argv[2] === '--service-probe') {
    if (process.argv.length !== 5 || !path.isAbsolute(process.argv[3]) || !path.isAbsolute(process.argv[4])) fail('termux_keystore_qualification_usage', 'invalid Q3 service-probe invocation');
    await serviceProbe(process.argv[3], process.argv[4]);
  } else {
    await coordinate();
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'termux_keystore_qualification_failed', message: error?.message ?? 'Q3 Termux qualification failed' })}\n`);
  process.exitCode = 1;
}
