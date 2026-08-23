import { spawn } from 'node:child_process';
import {
  ContractError,
  assertRecordShape,
  canonicalClone,
  strictJsonParse,
} from './canonical.mjs';
import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  decodeBase64Url,
  encodeBase64Url,
  installableAgentCredentialKeyId,
  installableAgentCredentialRef,
  normalizeAgentKeystoreAliasRecord,
  normalizeAndroidSourceLineageId,
  normalizeConnectPossessionContext,
  normalizeRsa3072PublicJwk,
  parseInstallableAgentCredentialRef,
  signedRecordBytes,
} from './installable-agent-security.mjs';

export const INSTALLABLE_AGENT_TERMUX_KEYSTORE_PROFILE = 'tdev.agent-termux-keystore.v1';
export const INSTALLABLE_AGENT_TERMUX_KEYSTORE_COMMAND = 'termux-keystore';
export const INSTALLABLE_AGENT_TERMUX_KEYSTORE_SIGN_ALGORITHM = 'SHA256withRSA';
export const INSTALLABLE_AGENT_TERMUX_PACKAGE = 'com.termux';
export const INSTALLABLE_AGENT_TERMUX_API_PACKAGE = 'com.termux.api';

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const RSA_MODULUS_HEX_RE = /^[0-9a-f]{768}$/;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function asBuffer(value) {
  if (value === undefined || value === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  fail('invalid_termux_keystore_input', 'Termux keystore command stdin must be bytes or text');
}

function appendBounded(chunks, chunk, counter, maxOutputBytes, stream) {
  const bytes = Buffer.from(chunk);
  counter.value += bytes.byteLength;
  if (counter.value > maxOutputBytes) {
    fail('termux_keystore_output_too_large', `Termux keystore ${stream} exceeded its byte bound`, { maxOutputBytes });
  }
  chunks.push(bytes);
}

export function createTermuxKeystoreCommandRunner({ executable = INSTALLABLE_AGENT_TERMUX_KEYSTORE_COMMAND } = {}) {
  if (typeof executable !== 'string' || executable.length === 0 || executable.includes('\0')) {
    fail('invalid_termux_keystore_command', 'Termux keystore executable is invalid');
  }
  return async ({ args, stdin = null, maxOutputBytes = MAX_COMMAND_OUTPUT_BYTES }) => {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      fail('invalid_termux_keystore_command', 'Termux keystore argv is invalid');
    }
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_COMMAND_OUTPUT_BYTES) {
      fail('invalid_termux_keystore_command', 'Termux keystore output bound is invalid');
    }
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      } catch (cause) {
        reject(new ContractError('termux_keystore_unavailable', 'Unable to start termux-keystore', {}, { cause }));
        return;
      }
      const stdout = [];
      const stderr = [];
      const stdoutBytes = { value: 0 };
      const stderrBytes = { value: 0 };
      let boundedFailure = null;
      child.stdout.on('data', (chunk) => {
        if (boundedFailure !== null) return;
        try { appendBounded(stdout, chunk, stdoutBytes, maxOutputBytes, 'stdout'); }
        catch (cause) { boundedFailure = cause; child.kill('SIGKILL'); }
      });
      child.stderr.on('data', (chunk) => {
        if (boundedFailure !== null) return;
        try { appendBounded(stderr, chunk, stderrBytes, maxOutputBytes, 'stderr'); }
        catch (cause) { boundedFailure = cause; child.kill('SIGKILL'); }
      });
      child.once('error', (cause) => reject(new ContractError('termux_keystore_unavailable', 'termux-keystore execution failed', {}, { cause })));
      child.once('close', (code, signal) => {
        if (boundedFailure !== null) { reject(boundedFailure); return; }
        const result = Object.freeze({
          exitCode: code,
          signal: signal ?? null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        });
        resolve(result);
      });
      const input = asBuffer(stdin);
      child.stdin.end(input);
    });
  };
}

function successful(result, label) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) fail('invalid_termux_keystore_runner', `${label} returned an invalid command result`);
  if (result.exitCode !== 0 || result.signal !== null) {
    fail('termux_keystore_command_failed', `${label} failed`, {
      exitCode: result.exitCode ?? null,
      signal: result.signal ?? null,
      stderr: Buffer.from(result.stderr ?? '').toString('utf8').slice(0, 2048),
    });
  }
  return Buffer.from(result.stdout ?? '');
}

function hexToBytes(hex, label) {
  if (!RSA_MODULUS_HEX_RE.test(hex)) fail('invalid_termux_keystore_key', `${label} must be exact lowercase 3072-bit hex`);
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.byteLength !== 384 || (bytes[0] & 0x80) === 0) fail('invalid_termux_keystore_key', `${label} is not an exact 3072-bit RSA modulus`);
  return bytes;
}

function normalizeDetailedKey(entry) {
  assertRecordShape(entry, [
    'alias', 'algorithm', 'size', 'modulus', 'exponent', 'inside_secure_hardware', 'user_authentication',
  ], [], 'termux-keystore detailed key');
  if (typeof entry.alias !== 'string' || !/^tdev\.a1\.[A-Za-z0-9_-]{43}$/.test(entry.alias)) fail('invalid_termux_keystore_key', 'Keystore alias is not a tdev D0039 alias');
  if (entry.algorithm !== 'RSA' || entry.size !== 3072 || entry.exponent !== '10001') fail('invalid_termux_keystore_key', 'Keystore key is not RSA-3072 with exponent 65537');
  if (typeof entry.inside_secure_hardware !== 'boolean') fail('invalid_termux_keystore_key', 'Keystore hardware evidence is invalid');
  assertRecordShape(entry.user_authentication, ['required', 'enforced_by_secure_hardware'], ['validity_duration_seconds'], 'termux-keystore user authentication');
  if (entry.user_authentication.required !== false || typeof entry.user_authentication.enforced_by_secure_hardware !== 'boolean') {
    fail('invalid_termux_keystore_key', 'D0039 unattended credential must not require per-use user authentication');
  }
  if (entry.user_authentication.validity_duration_seconds !== undefined && !Number.isSafeInteger(entry.user_authentication.validity_duration_seconds)) {
    fail('invalid_termux_keystore_key', 'Keystore user-auth validity evidence is invalid');
  }
  const modulus = hexToBytes(entry.modulus, 'RSA modulus');
  const publicJwk = normalizeRsa3072PublicJwk({ e: 'AQAB', kty: 'RSA', n: encodeBase64Url(modulus) });
  return Object.freeze({
    alias: entry.alias,
    publicJwk,
    credentialKeyId: installableAgentCredentialKeyId(publicJwk),
    insideSecureHardware: entry.inside_secure_hardware,
    userAuthenticationRequired: false,
  });
}

function normalizeLineageReadback(input, expected) {
  assertRecordShape(input, [INSTALLABLE_AGENT_TERMUX_PACKAGE, INSTALLABLE_AGENT_TERMUX_API_PACKAGE], [], 'Termux source lineage readback');
  const termux = normalizeAndroidSourceLineageId(input[INSTALLABLE_AGENT_TERMUX_PACKAGE]);
  const api = normalizeAndroidSourceLineageId(input[INSTALLABLE_AGENT_TERMUX_API_PACKAGE]);
  const pinned = normalizeAndroidSourceLineageId(expected);
  if (termux !== api || termux !== pinned) {
    fail('android_source_lineage_mismatch', 'Termux and Termux:API signing-certificate lineages must exactly match the pinned deployment lineage', {
      termux,
      termuxApi: api,
      pinned,
    });
  }
  return Object.freeze({ androidSourceLineageId: pinned });
}

export class TermuxAndroidKeyStoreCredential {
  constructor({ commandRunner = createTermuxKeystoreCommandRunner(), sourceLineageReader }) {
    if (typeof commandRunner !== 'function') fail('invalid_termux_keystore_runner', 'Termux keystore command runner must be callable');
    if (typeof sourceLineageReader !== 'function') fail('android_source_lineage_unavailable', 'Independent Termux/Termux:API source-lineage reader is required');
    this.commandRunner = commandRunner;
    this.sourceLineageReader = sourceLineageReader;
  }

  async verifySourceLineage(androidSourceLineageId) {
    const readback = await this.sourceLineageReader({ packages: [INSTALLABLE_AGENT_TERMUX_PACKAGE, INSTALLABLE_AGENT_TERMUX_API_PACKAGE] });
    return normalizeLineageReadback(readback, androidSourceLineageId);
  }

  async listDetailed() {
    const stdout = successful(await this.commandRunner({ args: ['list', '-d'] }), 'termux-keystore list -d');
    let parsed;
    try { parsed = strictJsonParse(stdout, { maxBytes: MAX_COMMAND_OUTPUT_BYTES }); }
    catch (cause) { fail('invalid_termux_keystore_readback', 'termux-keystore detailed list is not strict bounded JSON', {}, { cause }); }
    if (!Array.isArray(parsed)) fail('invalid_termux_keystore_readback', 'termux-keystore detailed list must be an array');
    return parsed;
  }

  async readPublicVerifier(credentialRef) {
    const { alias } = parseInstallableAgentCredentialRef(credentialRef);
    const entries = await this.listDetailed();
    const matches = entries.filter((entry) => entry?.alias === alias);
    if (matches.length !== 1) fail('agent_keystore_alias_unavailable', 'Exact AndroidKeyStore alias is missing or ambiguous', { alias, matches: matches.length });
    return normalizeDetailedKey(matches[0]);
  }

  async provision({ aliasRecord, androidSourceLineageId }) {
    const record = normalizeAgentKeystoreAliasRecord(aliasRecord);
    await this.verifySourceLineage(androidSourceLineageId);
    const credentialRef = installableAgentCredentialRef(record);
    const { alias } = parseInstallableAgentCredentialRef(credentialRef);
    const existing = (await this.listDetailed()).filter((entry) => entry?.alias === alias);
    if (existing.length > 1) fail('agent_keystore_alias_unavailable', 'AndroidKeyStore alias is ambiguous', { alias });
    if (existing.length === 0) {
      successful(await this.commandRunner({ args: ['generate', alias, '-a', 'RSA', '-s', '3072'] }), 'termux-keystore generate');
    }
    const verifier = await this.readPublicVerifier(credentialRef);
    return Object.freeze({
      profile: INSTALLABLE_AGENT_TERMUX_KEYSTORE_PROFILE,
      credentialRef,
      credentialKeyId: verifier.credentialKeyId,
      publicJwk: canonicalClone(verifier.publicJwk),
      insideSecureHardware: verifier.insideSecureHardware,
      userAuthenticationRequired: verifier.userAuthenticationRequired,
    });
  }

  async signPossession({ credentialRef, context, expectedCredentialKeyId, androidSourceLineageId }) {
    await this.verifySourceLineage(androidSourceLineageId);
    const verifier = await this.readPublicVerifier(credentialRef);
    if (verifier.credentialKeyId !== expectedCredentialKeyId) fail('agent_keystore_verifier_mismatch', 'AndroidKeyStore public readback no longer matches provider/current credential identity');
    const normalizedContext = normalizeConnectPossessionContext(context);
    if (normalizedContext.profile !== INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE || normalizedContext.credentialKeyId !== expectedCredentialKeyId) {
      fail('agent_keystore_possession_context_mismatch', 'Possession context does not bind the exact current AndroidKeyStore credential');
    }
    const { alias } = parseInstallableAgentCredentialRef(credentialRef);
    const signedBytes = signedRecordBytes(INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, normalizedContext);
    const signatureBytes = successful(await this.commandRunner({
      args: ['sign', alias, INSTALLABLE_AGENT_TERMUX_KEYSTORE_SIGN_ALGORITHM],
      stdin: signedBytes,
      maxOutputBytes: 4096,
    }), 'termux-keystore sign');
    if (signatureBytes.byteLength !== 384) fail('invalid_termux_keystore_signature', 'AndroidKeyStore RSA-3072 signature must be exactly 384 bytes');
    const signature = encodeBase64Url(signatureBytes);
    if (decodeBase64Url(signature).byteLength !== 384) fail('invalid_termux_keystore_signature', 'AndroidKeyStore signature encoding is not canonical');
    return Object.freeze({
      profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
      keyId: expectedCredentialKeyId,
      context: canonicalClone(normalizedContext),
      signature,
    });
  }

  async delete(credentialRef) {
    const { alias } = parseInstallableAgentCredentialRef(credentialRef);
    successful(await this.commandRunner({ args: ['delete', alias] }), 'termux-keystore delete');
    return Object.freeze({ classification: 'deleted', alias });
  }
}
