import {
  X509Certificate,
  constants as cryptoConstants,
  createHash,
  verify as verifySignature,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { ContractError } from './canonical.mjs';

export const INSTALLABLE_AGENT_ANDROID_PACKAGE_MANAGER_COMMAND = '/system/bin/pm';
export const INSTALLABLE_AGENT_ANDROID_SOURCE_PACKAGES = Object.freeze(['com.termux', 'com.termux.api']);

const APK_SIGNATURE_SCHEME_V2_BLOCK_ID = 0x7109871a;
const APK_SIGNATURE_SCHEME_V3_BLOCK_ID = 0xf05368c0;
const APK_SIGNATURE_SCHEME_V31_BLOCK_ID = 0x1b93ad61;
const APK_SIGNATURE_SCHEME_V32_BLOCK_ID = 0x70e1c89f;
const APK_SIGNING_BLOCK_MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const MAX_ZIP_EOCD_BYTES = 65_557;
const MAX_APK_SIGNING_BLOCK_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGE_MANAGER_OUTPUT_BYTES = 64 * 1024;
const MAX_PACKAGE_APKS = 64;
const DEFAULT_PACKAGE_MANAGER_TIMEOUT_MS = 10_000;
const PACKAGE_NAME_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

const SIGNATURE_ALGORITHMS = new Map([
  [0x0101, Object.freeze({ hash: 'sha256', digestBytes: 32, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })],
  [0x0102, Object.freeze({ hash: 'sha512', digestBytes: 64, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 64 })],
  [0x0103, Object.freeze({ hash: 'sha256', digestBytes: 32, padding: cryptoConstants.RSA_PKCS1_PADDING })],
  [0x0104, Object.freeze({ hash: 'sha512', digestBytes: 64, padding: cryptoConstants.RSA_PKCS1_PADDING })],
  [0x0201, Object.freeze({ hash: 'sha256', digestBytes: 32 })],
  [0x0202, Object.freeze({ hash: 'sha512', digestBytes: 64 })],
  [0x0301, Object.freeze({ hash: 'sha256', digestBytes: 32 })],
]);

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeUint64(buffer, offset, label) {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('android_apk_signing_block_invalid', `${label} exceeds the supported integer range`);
  }
  return Number(value);
}

class LittleEndianCursor {
  constructor(buffer, label) {
    this.buffer = buffer;
    this.label = label;
    this.offset = 0;
  }

  remaining() { return this.buffer.byteLength - this.offset; }

  uint32(label) {
    if (this.remaining() < 4) fail('android_apk_signing_block_invalid', `${this.label}.${label} is truncated`);
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  lengthPrefixed(label) {
    const length = this.uint32(`${label}.length`);
    if (length > this.remaining()) fail('android_apk_signing_block_invalid', `${this.label}.${label} exceeds its container`);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  end() {
    if (this.remaining() !== 0) fail('android_apk_signing_block_invalid', `${this.label} contains trailing bytes`, { remainingBytes: this.remaining() });
  }
}

function lengthPrefixedItems(buffer, label, { allowEmpty = false } = {}) {
  const cursor = new LittleEndianCursor(buffer, label);
  const items = [];
  while (cursor.remaining() > 0) items.push(cursor.lengthPrefixed(`item[${items.length}]`));
  if (!allowEmpty && items.length === 0) fail('android_apk_signing_block_invalid', `${label} must not be empty`);
  return items;
}

function parseAlgorithmRecords(buffer, label, valueLabel) {
  return lengthPrefixedItems(buffer, label).map((entry, index) => {
    const cursor = new LittleEndianCursor(entry, `${label}[${index}]`);
    const algorithmId = cursor.uint32('algorithmId');
    const value = cursor.lengthPrefixed(valueLabel);
    cursor.end();
    return Object.freeze({ algorithmId, value });
  });
}

function verifySignedData({ signedData, publicKey, digests, signatures, label }) {
  const digestIds = digests.map((entry) => entry.algorithmId);
  const signatureIds = signatures.map((entry) => entry.algorithmId);
  if (digestIds.length !== signatureIds.length || digestIds.some((id, index) => id !== signatureIds[index])) {
    fail('android_apk_signing_block_invalid', `${label} digest/signature algorithm lists disagree`);
  }
  let supported = false;
  for (let index = 0; index < signatures.length; index += 1) {
    const signature = signatures[index];
    const algorithm = SIGNATURE_ALGORITHMS.get(signature.algorithmId);
    if (algorithm === undefined) continue;
    supported = true;
    if (digests[index].value.byteLength !== algorithm.digestBytes) {
      fail('android_apk_signing_block_invalid', `${label} content digest length is invalid`);
    }
    const key = algorithm.padding === undefined
      ? publicKey
      : {
          key: publicKey,
          padding: algorithm.padding,
          ...(algorithm.saltLength === undefined ? {} : { saltLength: algorithm.saltLength }),
        };
    let valid = false;
    try { valid = verifySignature(algorithm.hash, signedData, key, signature.value); }
    catch (cause) {
      fail('android_apk_signing_block_invalid', `${label} signature verification failed`, {}, { cause });
    }
    if (valid) return;
  }
  if (!supported) fail('android_apk_signing_algorithm_unsupported', `${label} exposes no supported signing algorithm`);
  fail('android_apk_signing_block_invalid', `${label} contains no valid signature over its signed data`);
}

function parseSigner(signer, schemeVersion, label) {
  const cursor = new LittleEndianCursor(signer, label);
  const signedData = cursor.lengthPrefixed('signedData');
  let outerMinSdk = null;
  let outerMaxSdk = null;
  if (schemeVersion === 3) {
    outerMinSdk = cursor.uint32('minSdk');
    outerMaxSdk = cursor.uint32('maxSdk');
    if (outerMinSdk > outerMaxSdk) fail('android_apk_signing_block_invalid', `${label} SDK range is invalid`);
  }
  const signaturesBytes = cursor.lengthPrefixed('signatures');
  const publicKeyBytes = cursor.lengthPrefixed('publicKey');
  cursor.end();

  const signed = new LittleEndianCursor(signedData, `${label}.signedData`);
  const digestsBytes = signed.lengthPrefixed('digests');
  const certificatesBytes = signed.lengthPrefixed('certificates');
  if (schemeVersion === 3) {
    const innerMinSdk = signed.uint32('minSdk');
    const innerMaxSdk = signed.uint32('maxSdk');
    if (innerMinSdk !== outerMinSdk || innerMaxSdk !== outerMaxSdk) {
      fail('android_apk_signing_block_invalid', `${label} signed and outer SDK ranges disagree`);
    }
  }
  signed.lengthPrefixed('additionalAttributes');
  if (schemeVersion === 2 && signed.remaining() === 4) {
    const reserved = signed.lengthPrefixed('reserved');
    if (reserved.byteLength !== 0) fail('android_apk_signing_block_invalid', `${label} v2 reserved field must be empty`);
  }
  signed.end();

  const certificates = lengthPrefixedItems(certificatesBytes, `${label}.certificates`);
  let certificate;
  try { certificate = new X509Certificate(certificates[0]); }
  catch (cause) { fail('android_apk_signing_certificate_invalid', `${label} signing certificate is not X.509 DER`, {}, { cause }); }
  let certificatePublicKey;
  try { certificatePublicKey = Buffer.from(certificate.publicKey.export({ format: 'der', type: 'spki' })); }
  catch (cause) { fail('android_apk_signing_certificate_invalid', `${label} signing certificate public key is unreadable`, {}, { cause }); }
  if (!certificatePublicKey.equals(publicKeyBytes)) {
    fail('android_apk_signing_certificate_invalid', `${label} signing certificate does not bind the signer public key`);
  }

  const digests = parseAlgorithmRecords(digestsBytes, `${label}.digests`, 'digest');
  const signatures = parseAlgorithmRecords(signaturesBytes, `${label}.signatures`, 'signature');
  verifySignedData({ signedData, publicKey: certificate.publicKey, digests, signatures, label });
  return Object.freeze({
    androidSourceLineageId: sha256(certificates[0]),
    certificateDer: Buffer.from(certificates[0]),
  });
}

function parseScheme(value, schemeVersion, label) {
  const outer = new LittleEndianCursor(value, label);
  const signersBytes = outer.lengthPrefixed('signers');
  outer.end();
  const signers = lengthPrefixedItems(signersBytes, `${label}.signers`);
  if (signers.length !== 1) {
    fail('android_apk_signing_identity_ambiguous', `${label} must contain exactly one signer`, { signers: signers.length });
  }
  return parseSigner(signers[0], schemeVersion, `${label}.signer[0]`);
}

async function readExactly(handle, bytes, position, label) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, position + offset);
    if (bytesRead === 0) fail('android_apk_read_failed', `${label} is truncated`);
    offset += bytesRead;
  }
  return bytes;
}

async function locateApkSigningBlock(handle, size) {
  if (!Number.isSafeInteger(size) || size < 22) fail('android_apk_read_failed', 'Installed APK size is invalid');
  const tailLength = Math.min(size, MAX_ZIP_EOCD_BYTES);
  const tail = await readExactly(handle, Buffer.alloc(tailLength), size - tailLength, 'APK ZIP tail');
  let eocdOffsetInTail = -1;
  for (let index = tail.byteLength - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = tail.readUInt16LE(index + 20);
    if (index + 22 + commentLength === tail.byteLength) { eocdOffsetInTail = index; break; }
  }
  if (eocdOffsetInTail < 0) fail('android_apk_zip_invalid', 'Installed APK has no terminal ZIP EOCD');
  if (tail.readUInt16LE(eocdOffsetInTail + 4) !== 0 || tail.readUInt16LE(eocdOffsetInTail + 6) !== 0 ||
      tail.readUInt16LE(eocdOffsetInTail + 8) !== tail.readUInt16LE(eocdOffsetInTail + 10)) {
    fail('android_apk_zip_invalid', 'Installed APK uses an unsupported split ZIP container');
  }
  const centralDirectorySize = tail.readUInt32LE(eocdOffsetInTail + 12);
  const centralDirectoryOffset = tail.readUInt32LE(eocdOffsetInTail + 16);
  if (centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    fail('android_apk_zip_invalid', 'ZIP64 installed APKs are unsupported by the lineage reader');
  }
  const eocdAbsoluteOffset = size - tailLength + eocdOffsetInTail;
  if (centralDirectoryOffset + centralDirectorySize !== eocdAbsoluteOffset || centralDirectoryOffset < 24) {
    fail('android_apk_zip_invalid', 'Installed APK central directory bounds are inconsistent');
  }

  const footer = await readExactly(handle, Buffer.alloc(24), centralDirectoryOffset - 24, 'APK signing block footer');
  if (!footer.subarray(8).equals(APK_SIGNING_BLOCK_MAGIC)) {
    fail('android_apk_signing_scheme_unsupported', 'Installed APK has no v2/v3 APK Signing Block');
  }
  const encodedSize = safeUint64(footer, 0, 'APK signing block size');
  const totalSize = encodedSize + 8;
  if (encodedSize < 24 || totalSize > MAX_APK_SIGNING_BLOCK_BYTES || totalSize > centralDirectoryOffset) {
    fail('android_apk_signing_block_invalid', 'APK signing block size is invalid');
  }
  const blockStart = centralDirectoryOffset - totalSize;
  const header = await readExactly(handle, Buffer.alloc(8), blockStart, 'APK signing block header');
  if (safeUint64(header, 0, 'APK signing block header size') !== encodedSize) {
    fail('android_apk_signing_block_invalid', 'APK signing block size fields disagree');
  }
  const pairsLength = encodedSize - 24;
  return readExactly(handle, Buffer.alloc(pairsLength), blockStart + 8, 'APK signing block pairs');
}

function parseSigningBlockPairs(pairs) {
  const values = new Map();
  let offset = 0;
  while (offset < pairs.byteLength) {
    if (pairs.byteLength - offset < 12) fail('android_apk_signing_block_invalid', 'APK signing block pair header is truncated');
    const pairSize = safeUint64(pairs, offset, 'APK signing pair size');
    if (pairSize < 4 || pairSize > pairs.byteLength - offset - 8) {
      fail('android_apk_signing_block_invalid', 'APK signing block pair size is invalid');
    }
    const id = pairs.readUInt32LE(offset + 8);
    if (values.has(id)) fail('android_apk_signing_block_invalid', 'APK signing block contains a duplicate ID', { id });
    values.set(id, pairs.subarray(offset + 12, offset + 8 + pairSize));
    offset += 8 + pairSize;
  }
  if (offset !== pairs.byteLength) fail('android_apk_signing_block_invalid', 'APK signing block pairs do not consume the block');
  return values;
}

export async function readAndroidApkSigningCertificate(apkPath) {
  if (typeof apkPath !== 'string' || !path.isAbsolute(apkPath) || apkPath.includes('\0') || path.normalize(apkPath) !== apkPath) {
    fail('android_apk_path_invalid', 'Installed APK path must be normalized absolute text');
  }
  let handle;
  try { handle = await open(apkPath, 'r'); }
  catch (cause) { fail('android_apk_read_failed', 'Installed APK is unreadable', {}, { cause }); }
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile() || !Number.isSafeInteger(fileStat.size)) fail('android_apk_read_failed', 'Installed APK is not a bounded regular file');
    const values = parseSigningBlockPairs(await locateApkSigningBlock(handle, fileStat.size));
    if (values.has(APK_SIGNATURE_SCHEME_V31_BLOCK_ID) || values.has(APK_SIGNATURE_SCHEME_V32_BLOCK_ID)) {
      fail('android_apk_signing_family_unsupported', 'Installed APK uses a newer signing family requiring an explicit lineage-reader update');
    }
    const identities = [];
    if (values.has(APK_SIGNATURE_SCHEME_V3_BLOCK_ID)) {
      identities.push(Object.freeze({ schemeVersion: 3, ...parseScheme(values.get(APK_SIGNATURE_SCHEME_V3_BLOCK_ID), 3, 'APK v3 signer block') }));
    }
    if (values.has(APK_SIGNATURE_SCHEME_V2_BLOCK_ID)) {
      identities.push(Object.freeze({ schemeVersion: 2, ...parseScheme(values.get(APK_SIGNATURE_SCHEME_V2_BLOCK_ID), 2, 'APK v2 signer block') }));
    }
    if (identities.length === 0) fail('android_apk_signing_scheme_unsupported', 'Installed APK has no supported v2/v3 signer identity');
    const selected = identities[0];
    if (identities.some((identity) => identity.androidSourceLineageId !== selected.androidSourceLineageId)) {
      fail('android_apk_signing_identity_ambiguous', 'Installed APK signing schemes expose different signer identities');
    }
    return Object.freeze({
      schemeVersion: selected.schemeVersion,
      androidSourceLineageId: selected.androidSourceLineageId,
    });
  } finally {
    await handle.close();
  }
}

function appendBounded(chunks, chunk, counter, maxBytes, stream) {
  const bytes = Buffer.from(chunk);
  counter.value += bytes.byteLength;
  if (counter.value > maxBytes) fail('android_package_manager_output_too_large', `Android package manager ${stream} exceeded its byte bound`, { maxBytes });
  chunks.push(bytes);
}

export function createAndroidPackageManagerPathRunner({
  executable = INSTALLABLE_AGENT_ANDROID_PACKAGE_MANAGER_COMMAND,
  timeoutMs = DEFAULT_PACKAGE_MANAGER_TIMEOUT_MS,
} = {}) {
  if (typeof executable !== 'string' || !path.isAbsolute(executable) || executable.includes('\0')) {
    fail('android_package_manager_unavailable', 'Android package-manager executable must be an absolute path');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    fail('android_package_manager_unavailable', 'Android package-manager timeout is invalid');
  }
  return async (packageName) => {
    if (typeof packageName !== 'string' || !PACKAGE_NAME_RE.test(packageName)) fail('android_package_name_invalid', 'Android package name is invalid');
    return new Promise((resolve, reject) => {
      let child;
      try { child = spawn(executable, ['path', packageName], { stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
      catch (cause) { reject(new ContractError('android_package_manager_unavailable', 'Unable to start Android package manager', {}, { cause })); return; }
      const stdout = [];
      const stderr = [];
      const stdoutBytes = { value: 0 };
      const stderrBytes = { value: 0 };
      let failure = null;
      let settled = false;
      const timer = setTimeout(() => {
        failure = new ContractError('android_package_manager_timeout', 'Android package-manager path readback timed out');
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        if (failure !== null) return;
        try { appendBounded(stdout, chunk, stdoutBytes, MAX_PACKAGE_MANAGER_OUTPUT_BYTES, 'stdout'); }
        catch (cause) { failure = cause; child.kill('SIGKILL'); }
      });
      child.stderr.on('data', (chunk) => {
        if (failure !== null) return;
        try { appendBounded(stderr, chunk, stderrBytes, MAX_PACKAGE_MANAGER_OUTPUT_BYTES, 'stderr'); }
        catch (cause) { failure = cause; child.kill('SIGKILL'); }
      });
      child.once('error', (cause) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new ContractError('android_package_manager_unavailable', 'Android package-manager execution failed', {}, { cause }));
      });
      child.once('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (failure !== null) { reject(failure); return; }
        resolve(Object.freeze({
          exitCode,
          signal: signal ?? null,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        }));
      });
    });
  };
}

function parsePackagePaths(result, packageName) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) fail('android_package_manager_invalid', 'Android package-manager runner returned an invalid result');
  if (result.exitCode !== 0 || result.signal !== null || Buffer.from(result.stderr ?? '').byteLength !== 0) {
    fail('android_package_unavailable', 'Installed Android package path readback failed', { packageName, exitCode: result.exitCode ?? null, signal: result.signal ?? null });
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(result.stdout ?? '')); }
  catch (cause) { fail('android_package_manager_invalid', 'Android package-manager output is not valid UTF-8', {}, { cause }); }
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (lines.length < 1 || lines.length > MAX_PACKAGE_APKS || lines.some((line) => line.length === 0 || !line.startsWith('package:'))) {
    fail('android_package_manager_invalid', 'Android package-manager output has an invalid path set', { packageName });
  }
  const paths = lines.map((line) => line.slice('package:'.length));
  if (new Set(paths).size !== paths.length || paths.some((apkPath) => !path.isAbsolute(apkPath) || apkPath.includes('\0') || path.normalize(apkPath) !== apkPath || !apkPath.endsWith('.apk'))) {
    fail('android_package_manager_invalid', 'Android package-manager returned an unsafe or duplicate APK path', { packageName });
  }
  if (paths.filter((apkPath) => path.basename(apkPath) === 'base.apk').length !== 1) {
    fail('android_package_manager_invalid', 'Installed Android package must expose exactly one base.apk', { packageName });
  }
  return paths;
}

export function createTermuxAndroidSourceLineageReader({
  packagePathRunner = createAndroidPackageManagerPathRunner(),
  signingCertificateReader = readAndroidApkSigningCertificate,
} = {}) {
  if (typeof packagePathRunner !== 'function' || typeof signingCertificateReader !== 'function') {
    fail('android_source_lineage_unavailable', 'Android source-lineage dependencies must be callable');
  }
  return async ({ packages }) => {
    if (!Array.isArray(packages) || packages.length !== INSTALLABLE_AGENT_ANDROID_SOURCE_PACKAGES.length ||
        packages.some((packageName, index) => packageName !== INSTALLABLE_AGENT_ANDROID_SOURCE_PACKAGES[index])) {
      fail('android_source_lineage_unavailable', 'D0039 source-lineage reader accepts only the exact Termux/Termux:API package pair');
    }
    const readback = {};
    for (const packageName of packages) {
      const apkPaths = parsePackagePaths(await packagePathRunner(packageName), packageName);
      let lineage = null;
      for (const apkPath of apkPaths) {
        const identity = await signingCertificateReader(apkPath);
        if (identity === null || typeof identity !== 'object' || !/^[0-9a-f]{64}$/.test(identity.androidSourceLineageId ?? '')) {
          fail('android_source_lineage_unavailable', 'Installed APK signer readback is invalid', { packageName });
        }
        if (lineage === null) lineage = identity.androidSourceLineageId;
        else if (lineage !== identity.androidSourceLineageId) {
          fail('android_source_lineage_ambiguous', 'Installed package APK splits expose different signer identities', { packageName });
        }
      }
      readback[packageName] = lineage;
    }
    return Object.freeze(readback);
  };
}
