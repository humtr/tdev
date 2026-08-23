import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  digest,
  typedDigest,
} from './canonical.mjs';

export const INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE = 'tdev.agent-management-envelope.v1';
export const INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE = 'tdev.agent-connect-possession.v1';
export const INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE = 'tdev.agent-connect-possession-envelope.v1';
export const INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE = 'tdev.release-delegation.v1';
export const INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE = 'tdev.installable-agent-release-statement.v1';
export const INSTALLABLE_AGENT_BOOTSTRAP_CAPSULE_PROFILE = 'tdev.agent-bootstrap-trust-capsule.v1';
export const INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE = 'tdev.agent-keystore-alias.v1';
export const INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE = 'tdev.d0039-route-security.v1';
export const INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX = 'androidkeystore://com.termux.api/';
export const INSTALLABLE_AGENT_MANAGEMENT_KEY_DOMAIN = 'tdev.agent-management-public-key.v1';
export const INSTALLABLE_AGENT_CREDENTIAL_KEY_DOMAIN = 'tdev.agent-credential-public-key.v1';
export const INSTALLABLE_AGENT_RELEASE_ROOT_KEY_DOMAIN = 'tdev.release-root-public-key.v1';
export const INSTALLABLE_AGENT_RELEASE_SIGNER_KEY_DOMAIN = 'tdev.release-signer-public-key.v1';
export const INSTALLABLE_AGENT_CONNECT_POSSESSION_TTL_MS = 120000;
export const INSTALLABLE_AGENT_CONNECT_POSSESSION_NONCE_BYTES = 32;
export const INSTALLABLE_AGENT_RSA_SIGNATURE_BYTES = 384;
export const INSTALLABLE_AGENT_ED25519_SIGNATURE_BYTES = 64;
export const INSTALLABLE_AGENT_MAX_DELEGATED_SIGNERS = 4;
export const INSTALLABLE_AGENT_MAX_ACTIVE_SIGNERS = 2;

const RAW_SHA256_RE = /^[0-9a-f]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function hexBytes(value) {
  if (typeof value !== 'string' || !RAW_SHA256_RE.test(value)) fail('invalid_sha256', 'SHA-256 hex is not canonical');
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function asBytes(value, label) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return textEncoder.encode(value);
  fail('invalid_security_bytes', `${label} must be bytes or text`);
}

export function encodeBase64Url(value) {
  const bytes = asBytes(value, 'base64url value');
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(value, label = 'base64url value') {
  if (typeof value !== 'string' || !BASE64URL_RE.test(value) || value.includes('=') || value.length % 4 === 1) {
    fail('invalid_base64url', `${label} is not canonical unpadded base64url`);
  }
  let bytes;
  try {
    if (typeof Buffer !== 'undefined') bytes = new Uint8Array(Buffer.from(value, 'base64url'));
    else {
      const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - (value.length % 4)) % 4)}`;
      const binary = atob(padded);
      bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    }
  } catch (cause) {
    fail('invalid_base64url', `${label} cannot be decoded`, {}, { cause });
  }
  if (encodeBase64Url(bytes) !== value) fail('invalid_base64url', `${label} has a non-shortest or alternate encoding`);
  return bytes;
}

export function signedRecordBytes(domain, record) {
  if (typeof domain !== 'string' || domain.length === 0 || domain.includes('\0')) fail('invalid_signature_domain', 'Signature domain is invalid');
  const domainBytes = textEncoder.encode(domain);
  const recordBytes = textEncoder.encode(canonicalJson(record));
  const bytes = new Uint8Array(domainBytes.byteLength + 1 + recordBytes.byteLength);
  bytes.set(domainBytes, 0);
  bytes[domainBytes.byteLength] = 0;
  bytes.set(recordBytes, domainBytes.byteLength + 1);
  return bytes;
}

function subtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('crypto_unavailable', 'WebCrypto subtle API is unavailable');
  return subtle;
}

export async function rawSha256Hex(value, label = 'value') {
  const bytes = asBytes(value, label);
  const hash = new Uint8Array(await subtleCrypto().digest('SHA-256', bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeRsa3072PublicJwk(input) {
  assertRecordShape(input, ['e', 'kty', 'n'], [], 'RSA-3072 public JWK');
  if (input.kty !== 'RSA' || input.e !== 'AQAB') fail('invalid_agent_credential_key', 'Agent credential JWK must be RSA with exponent 65537');
  const modulus = decodeBase64Url(input.n, 'RSA modulus');
  if (modulus.byteLength !== 384 || (modulus[0] & 0x80) === 0) {
    fail('invalid_agent_credential_key', 'Agent credential modulus must be exactly 3072 bits with its high bit set');
  }
  return Object.freeze(canonicalClone({ e: input.e, kty: input.kty, n: input.n }));
}

export function normalizeEd25519PublicJwk(input, label = 'Ed25519 public JWK') {
  assertRecordShape(input, ['crv', 'kty', 'x'], [], label);
  if (input.kty !== 'OKP' || input.crv !== 'Ed25519') fail('invalid_ed25519_public_key', `${label} must be Ed25519 OKP`);
  const raw = decodeBase64Url(input.x, `${label}.x`);
  if (raw.byteLength !== 32 || input.x.length !== 43) fail('invalid_ed25519_public_key', `${label}.x must encode exactly 32 bytes`);
  return Object.freeze(canonicalClone({ crv: input.crv, kty: input.kty, x: input.x }));
}

export function installableAgentCredentialKeyId(publicJwk) {
  return typedDigest(INSTALLABLE_AGENT_CREDENTIAL_KEY_DOMAIN, normalizeRsa3072PublicJwk(publicJwk));
}

export function installableAgentManagementKeyId(publicJwk) {
  return typedDigest(INSTALLABLE_AGENT_MANAGEMENT_KEY_DOMAIN, normalizeEd25519PublicJwk(publicJwk, 'management public JWK'));
}

export function installableAgentReleaseRootKeyId(publicJwk) {
  return typedDigest(INSTALLABLE_AGENT_RELEASE_ROOT_KEY_DOMAIN, normalizeEd25519PublicJwk(publicJwk, 'release-root public JWK'));
}

export function installableAgentReleaseSignerKeyId(publicJwk) {
  return typedDigest(INSTALLABLE_AGENT_RELEASE_SIGNER_KEY_DOMAIN, normalizeEd25519PublicJwk(publicJwk, 'release-signer public JWK'));
}

export function normalizeInstallableAgentRouteSecurity(input) {
  assertRecordShape(input, ['profile', 'managementPublicKey', 'releaseRootPublicKey'], [], 'D0039 route security');
  if (input.profile !== INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE) fail('invalid_route_security', 'D0039 route security profile is unsupported');
  const managementPublicKey = normalizeEd25519PublicJwk(input.managementPublicKey, 'management public JWK');
  const releaseRootPublicKey = normalizeEd25519PublicJwk(input.releaseRootPublicKey, 'release-root public JWK');
  return Object.freeze({
    profile: INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE,
    managementKeyId: installableAgentManagementKeyId(managementPublicKey),
    managementPublicKey,
    releaseRootKeyId: installableAgentReleaseRootKeyId(releaseRootPublicKey),
    releaseRootPublicKey,
  });
}

async function importEd25519PublicKey(publicJwk) {
  const jwk = normalizeEd25519PublicJwk(publicJwk);
  try {
    return await subtleCrypto().importKey('jwk', { ...jwk, ext: true }, { name: 'Ed25519' }, false, ['verify']);
  } catch (cause) {
    fail('invalid_ed25519_public_key', 'Ed25519 public key could not be imported', {}, { cause });
  }
}

async function importRsa3072PublicKey(publicJwk) {
  const jwk = normalizeRsa3072PublicJwk(publicJwk);
  try {
    return await subtleCrypto().importKey('jwk', { ...jwk, ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch (cause) {
    fail('invalid_agent_credential_key', 'RSA-3072 public key could not be imported', {}, { cause });
  }
}

export async function verifyEd25519SignedRecord({ domain, record, signature, publicJwk }) {
  const signatureBytes = decodeBase64Url(signature, 'Ed25519 signature');
  if (signatureBytes.byteLength !== INSTALLABLE_AGENT_ED25519_SIGNATURE_BYTES || signature.length !== 86) {
    fail('invalid_ed25519_signature', 'Ed25519 signature must be exactly 64 bytes');
  }
  const key = await importEd25519PublicKey(publicJwk);
  const valid = await subtleCrypto().verify({ name: 'Ed25519' }, key, signatureBytes, signedRecordBytes(domain, record));
  if (!valid) fail('signature_verification_failed', 'Ed25519 signature verification failed');
  return true;
}

export async function verifyRsa3072SignedRecord({ domain, record, signature, publicJwk }) {
  const signatureBytes = decodeBase64Url(signature, 'RSA signature');
  if (signatureBytes.byteLength !== INSTALLABLE_AGENT_RSA_SIGNATURE_BYTES) fail('invalid_rsa_signature', 'RSA signature must be exactly 384 bytes');
  const key = await importRsa3072PublicKey(publicJwk);
  const valid = await subtleCrypto().verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signatureBytes, signedRecordBytes(domain, record));
  if (!valid) fail('signature_verification_failed', 'RSA-3072 signature verification failed');
  return true;
}

export function normalizeManagementEnvelope(input, expectedContext, managementPublicJwk) {
  assertRecordShape(input, ['profile', 'keyId', 'context', 'signature'], [], 'management envelope');
  if (input.profile !== INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE) fail('invalid_management_envelope', 'Management envelope profile is unsupported');
  const keyId = installableAgentManagementKeyId(managementPublicJwk);
  if (input.keyId !== keyId || canonicalJson(input.context) !== canonicalJson(expectedContext)) {
    fail('management_proof_mismatch', 'Management envelope key/context does not match the requested mutation');
  }
  const signature = encodeBase64Url(decodeBase64Url(input.signature, 'management signature'));
  if (decodeBase64Url(signature).byteLength !== INSTALLABLE_AGENT_ED25519_SIGNATURE_BYTES) fail('invalid_ed25519_signature', 'Management signature is not 64 bytes');
  return Object.freeze({ profile: input.profile, keyId, context: canonicalClone(input.context), signature });
}

export async function verifyInstallableAgentManagementEnvelope({ envelope, context, managementPublicJwk }) {
  const normalized = normalizeManagementEnvelope(envelope, context, managementPublicJwk);
  await verifyEd25519SignedRecord({
    domain: 'tdev.agent-management.v1',
    record: normalized.context,
    signature: normalized.signature,
    publicJwk: managementPublicJwk,
  });
  return Object.freeze({ keyId: normalized.keyId, context: canonicalClone(normalized.context) });
}

export function parseInstallableAgentConnectRequestId(requestId) {
  if (typeof requestId !== 'string' || !/^c1:[1-9][0-9]*$/.test(requestId)) {
    fail('invalid_connect_request_id', 'Fresh D0027 connect request identity must use canonical c1:<seq>');
  }
  const sequence = Number(requestId.slice(3));
  if (!Number.isSafeInteger(sequence) || sequence < 1 || `c1:${sequence}` !== requestId) {
    fail('invalid_connect_request_id', 'Connect request sequence is outside the canonical safe-integer range');
  }
  return sequence;
}

export function normalizeConnectPossessionContext(input) {
  assertRecordShape(input, [
    'profile', 'agentId', 'routeGeneration', 'challengeGeneration', 'nonce', 'credentialGeneration', 'credentialKeyId',
    'connectRequestDigest', 'issuedAtMs', 'expiresAtMs',
  ], [], 'connect possession context');
  if (input.profile !== INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE) fail('invalid_agent_possession_context', 'Connect possession profile is unsupported');
  assertIdentifier(input.agentId, 'possession.agentId');
  assertSafeInteger(input.routeGeneration, 'possession.routeGeneration', { min: 1 });
  assertSafeInteger(input.challengeGeneration, 'possession.challengeGeneration', { min: 1 });
  if (decodeBase64Url(input.nonce, 'possession nonce').byteLength !== INSTALLABLE_AGENT_CONNECT_POSSESSION_NONCE_BYTES) {
    fail('invalid_agent_possession_context', 'Possession nonce must be exactly 32 bytes');
  }
  assertSafeInteger(input.credentialGeneration, 'possession.credentialGeneration', { min: 1 });
  assertDigest(input.credentialKeyId, 'possession.credentialKeyId');
  assertDigest(input.connectRequestDigest, 'possession.connectRequestDigest');
  assertSafeInteger(input.issuedAtMs, 'possession.issuedAtMs', { min: 0 });
  assertSafeInteger(input.expiresAtMs, 'possession.expiresAtMs', { min: input.issuedAtMs + 1 });
  if (input.expiresAtMs - input.issuedAtMs !== INSTALLABLE_AGENT_CONNECT_POSSESSION_TTL_MS) {
    fail('invalid_agent_possession_context', 'Possession challenge TTL must be exactly 120000 ms');
  }
  return Object.freeze(canonicalClone(input));
}

export function normalizeConnectPossessionEnvelope(input, expectedContext, credentialPublicJwk) {
  assertRecordShape(input, ['profile', 'keyId', 'context', 'signature'], [], 'connect possession envelope');
  if (input.profile !== INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE) fail('invalid_agent_possession_envelope', 'Connect possession envelope profile is unsupported');
  const context = normalizeConnectPossessionContext(input.context);
  if (canonicalJson(context) !== canonicalJson(normalizeConnectPossessionContext(expectedContext))) {
    fail('agent_possession_mismatch', 'Connect possession context does not match the live challenge');
  }
  const keyId = installableAgentCredentialKeyId(credentialPublicJwk);
  if (input.keyId !== keyId || context.credentialKeyId !== keyId) fail('agent_possession_mismatch', 'Connect possession key identity is not current');
  const signature = encodeBase64Url(decodeBase64Url(input.signature, 'possession signature'));
  if (decodeBase64Url(signature).byteLength !== INSTALLABLE_AGENT_RSA_SIGNATURE_BYTES) fail('invalid_rsa_signature', 'Possession signature is not 384 bytes');
  return Object.freeze({ profile: input.profile, keyId, context, signature });
}

export async function verifyInstallableAgentConnectPossessionEnvelope({ envelope, context, credentialPublicJwk }) {
  const normalized = normalizeConnectPossessionEnvelope(envelope, context, credentialPublicJwk);
  await verifyRsa3072SignedRecord({
    domain: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    record: normalized.context,
    signature: normalized.signature,
    publicJwk: credentialPublicJwk,
  });
  return Object.freeze({ keyId: normalized.keyId, context: canonicalClone(normalized.context) });
}

function normalizeReleaseSubject(input) {
  assertRecordShape(input, ['packageProfile', 'capabilityProfile', 'serviceHostProfile', 'targetPlatform', 'targetArch'], [], 'release authorization subject');
  for (const field of ['packageProfile', 'capabilityProfile', 'serviceHostProfile', 'targetPlatform', 'targetArch']) {
    if (typeof input[field] !== 'string' || input[field].length === 0 || input[field].includes('\0')) fail('invalid_release_subject', `Release subject ${field} is invalid`);
  }
  return canonicalClone(input);
}

export function normalizeReleaseDelegation(input, releaseRootPublicJwk = null) {
  assertRecordShape(input, ['profile', 'agentId', 'routeGeneration', 'trustPolicyGeneration', 'rootKeyId', 'signers'], [], 'release delegation');
  if (input.profile !== INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE) fail('invalid_release_delegation', 'Release delegation profile is unsupported');
  assertIdentifier(input.agentId, 'release delegation agentId');
  assertSafeInteger(input.routeGeneration, 'release delegation routeGeneration', { min: 1 });
  assertSafeInteger(input.trustPolicyGeneration, 'release delegation trustPolicyGeneration', { min: 1 });
  assertDigest(input.rootKeyId, 'release delegation rootKeyId');
  if (releaseRootPublicJwk !== null && input.rootKeyId !== installableAgentReleaseRootKeyId(releaseRootPublicJwk)) {
    fail('release_root_mismatch', 'Release delegation root identity does not match the pinned root');
  }
  if (!Array.isArray(input.signers) || input.signers.length === 0 || input.signers.length > INSTALLABLE_AGENT_MAX_DELEGATED_SIGNERS) {
    fail('invalid_release_delegation', 'Release delegation signer set is empty or exceeds its lifetime bound');
  }
  let activeCount = 0;
  let previousKeyId = null;
  const signers = input.signers.map((signer) => {
    assertRecordShape(signer, ['keyId', 'publicKey', 'disposition', 'subjects'], [], 'release delegated signer');
    const publicKey = normalizeEd25519PublicJwk(signer.publicKey, 'release-signer public JWK');
    const keyId = installableAgentReleaseSignerKeyId(publicKey);
    if (signer.keyId !== keyId) fail('release_signer_identity_mismatch', 'Release signer key ID does not match its public key');
    if (!['active', 'retired', 'revoked'].includes(signer.disposition)) fail('invalid_release_delegation', 'Release signer disposition is invalid');
    if (signer.disposition === 'active') activeCount += 1;
    if (!Array.isArray(signer.subjects) || signer.subjects.length === 0) fail('invalid_release_delegation', 'Release signer must authorize at least one subject');
    const subjects = signer.subjects.map(normalizeReleaseSubject);
    for (let index = 1; index < subjects.length; index += 1) {
      if (canonicalJson(subjects[index - 1]) >= canonicalJson(subjects[index])) fail('invalid_release_delegation', 'Release signer subjects must be unique and canonically sorted');
    }
    if (previousKeyId !== null && previousKeyId >= keyId) fail('invalid_release_delegation', 'Release signers must be unique and sorted by key ID');
    previousKeyId = keyId;
    return { keyId, publicKey, disposition: signer.disposition, subjects };
  });
  if (activeCount > INSTALLABLE_AGENT_MAX_ACTIVE_SIGNERS) fail('invalid_release_delegation', 'Too many delegated release signers are active');
  return Object.freeze(canonicalClone({ ...input, signers }));
}

export async function verifyReleaseDelegation({ delegation, signature, releaseRootPublicJwk }) {
  const normalized = normalizeReleaseDelegation(delegation, releaseRootPublicJwk);
  await verifyEd25519SignedRecord({
    domain: INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
    record: normalized,
    signature,
    publicJwk: releaseRootPublicJwk,
  });
  return normalized;
}

export function normalizeReleaseStatement(input) {
  assertRecordShape(input, ['profile', 'releaseManifestDigest', 'archiveSha256', 'signerKeyId'], [], 'release statement');
  if (input.profile !== INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE) fail('invalid_release_statement', 'Release statement profile is unsupported');
  assertDigest(input.releaseManifestDigest, 'release statement manifest digest');
  if (typeof input.archiveSha256 !== 'string' || !RAW_SHA256_RE.test(input.archiveSha256)) fail('invalid_release_statement', 'release statement archiveSha256 must be raw lowercase SHA-256');
  assertDigest(input.signerKeyId, 'release statement signerKeyId');
  return Object.freeze(canonicalClone(input));
}

export function releaseSubjectFromManifest(manifest) {
  return Object.freeze(normalizeReleaseSubject({
    packageProfile: manifest.profile,
    capabilityProfile: manifest.capabilityProfile,
    serviceHostProfile: manifest.serviceHostProfile,
    targetPlatform: manifest.target?.platform,
    targetArch: manifest.target?.arch,
  }));
}

export async function verifyInstallableAgentReleaseStatement({ delegation, statement, signature, archiveBytes, manifest, releaseManifestDigest }) {
  const normalizedDelegation = normalizeReleaseDelegation(delegation);
  const normalizedStatement = normalizeReleaseStatement(statement);
  const signer = normalizedDelegation.signers.find((entry) => entry.keyId === normalizedStatement.signerKeyId);
  if (!signer || signer.disposition !== 'active') fail('release_signer_not_active', 'Release statement signer is not currently active');
  assertDigest(releaseManifestDigest, 'release manifest digest');
  if (normalizedStatement.releaseManifestDigest !== releaseManifestDigest) fail('release_manifest_mismatch', 'Release statement does not identify the supplied manifest');
  const archiveDigest = await rawSha256Hex(archiveBytes, 'release archive');
  if (normalizedStatement.archiveSha256 !== archiveDigest) fail('release_archive_mismatch', 'Release archive digest does not match its signed statement');
  const wantedSubject = canonicalJson(releaseSubjectFromManifest(manifest));
  if (!signer.subjects.some((subject) => canonicalJson(subject) === wantedSubject)) fail('release_subject_denied', 'Release signer is not authorized for the package subject');
  await verifyEd25519SignedRecord({
    domain: INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
    record: normalizedStatement,
    signature,
    publicJwk: signer.publicKey,
  });
  return Object.freeze({ signerKeyId: signer.keyId, statement: normalizedStatement, archiveSha256: archiveDigest });
}

export function normalizeBootstrapTrustCapsule(input) {
  assertRecordShape(input, [
    'profile', 'routeBinding', 'managementKeyId', 'managementPublicKey', 'releaseRootKeyId', 'releaseRootPublicKey',
    'initialTrustPolicyGeneration', 'initialDelegationDigest', 'bootstrapVerifierProfile', 'bootstrapVerifierSha256',
  ], [], 'bootstrap trust capsule');
  if (input.profile !== INSTALLABLE_AGENT_BOOTSTRAP_CAPSULE_PROFILE) fail('invalid_bootstrap_capsule', 'Bootstrap capsule profile is unsupported');
  assertRecordShape(input.routeBinding, ['provider', 'namespace', 'durableObjectId', 'agentId', 'routeGeneration', 'jurisdiction'], [], 'bootstrap route binding');
  for (const field of ['provider', 'namespace', 'durableObjectId', 'agentId', 'jurisdiction']) {
    if (typeof input.routeBinding[field] !== 'string' || input.routeBinding[field].length === 0 || input.routeBinding[field].includes('\0')) fail('invalid_bootstrap_capsule', `Bootstrap route ${field} is invalid`);
  }
  assertIdentifier(input.routeBinding.agentId, 'bootstrap route agentId');
  assertSafeInteger(input.routeBinding.routeGeneration, 'bootstrap route routeGeneration', { min: 1 });
  const managementPublicKey = normalizeEd25519PublicJwk(input.managementPublicKey, 'management public JWK');
  const releaseRootPublicKey = normalizeEd25519PublicJwk(input.releaseRootPublicKey, 'release-root public JWK');
  const managementKeyId = installableAgentManagementKeyId(managementPublicKey);
  const releaseRootKeyId = installableAgentReleaseRootKeyId(releaseRootPublicKey);
  if (input.managementKeyId !== managementKeyId || input.releaseRootKeyId !== releaseRootKeyId) fail('bootstrap_key_identity_mismatch', 'Bootstrap key identity does not match the supplied public verifier');
  assertSafeInteger(input.initialTrustPolicyGeneration, 'bootstrap initialTrustPolicyGeneration', { min: 1 });
  assertDigest(input.initialDelegationDigest, 'bootstrap initialDelegationDigest');
  if (typeof input.bootstrapVerifierProfile !== 'string' || input.bootstrapVerifierProfile.length === 0 || input.bootstrapVerifierProfile.includes('\0')) fail('invalid_bootstrap_capsule', 'Bootstrap verifier profile is invalid');
  if (typeof input.bootstrapVerifierSha256 !== 'string' || !RAW_SHA256_RE.test(input.bootstrapVerifierSha256)) fail('invalid_bootstrap_capsule', 'Bootstrap verifier SHA-256 is invalid');
  return Object.freeze(canonicalClone({ ...input, managementKeyId, managementPublicKey, releaseRootKeyId, releaseRootPublicKey }));
}

export function bootstrapTrustCapsuleBytes(input) {
  return textEncoder.encode(canonicalJson(normalizeBootstrapTrustCapsule(input)));
}

export async function bootstrapTrustCapsuleSha256(input) {
  return rawSha256Hex(bootstrapTrustCapsuleBytes(input), 'bootstrap trust capsule');
}

export async function verifyBootstrapTrustCapsule({ capsule, expectedCapsuleSha256, bootstrapVerifierBytes }) {
  if (typeof expectedCapsuleSha256 !== 'string' || !RAW_SHA256_RE.test(expectedCapsuleSha256)) fail('invalid_bootstrap_capsule_digest', 'Expected bootstrap capsule digest must be raw lowercase SHA-256');
  const normalized = normalizeBootstrapTrustCapsule(capsule);
  if (await bootstrapTrustCapsuleSha256(normalized) !== expectedCapsuleSha256) fail('bootstrap_capsule_digest_mismatch', 'Bootstrap capsule bytes do not match the independently authenticated digest');
  const verifierDigest = await rawSha256Hex(bootstrapVerifierBytes, 'bootstrap verifier');
  if (verifierDigest !== normalized.bootstrapVerifierSha256) fail('bootstrap_verifier_mismatch', 'Bootstrap verifier bytes do not match the capsule');
  return normalized;
}

export function normalizeAndroidSourceLineageId(value) {
  if (typeof value !== 'string' || !RAW_SHA256_RE.test(value)) fail('invalid_android_source_lineage', 'Android source lineage ID must be a lowercase SHA-256 fingerprint');
  return value;
}

export function normalizeAgentKeystoreAliasRecord(input) {
  assertRecordShape(input, ['profile', 'agentId', 'routeGeneration', 'installationGeneration', 'credentialGeneration'], [], 'Agent keystore alias record');
  if (input.profile !== INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE) fail('invalid_agent_keystore_alias', 'Agent keystore alias profile is unsupported');
  assertIdentifier(input.agentId, 'keystore alias agentId');
  for (const field of ['routeGeneration', 'installationGeneration', 'credentialGeneration']) assertSafeInteger(input[field], `keystore alias ${field}`, { min: 1 });
  return Object.freeze(canonicalClone(input));
}

export function installableAgentKeystoreAlias(input) {
  const record = normalizeAgentKeystoreAliasRecord(input);
  const hashHex = digest(record).slice('sha256:'.length);
  return `tdev.a1.${encodeBase64Url(hexBytes(hashHex))}`;
}

export function installableAgentCredentialRef(input) {
  return `${INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX}${installableAgentKeystoreAlias(input)}`;
}

export function parseInstallableAgentCredentialRef(value) {
  if (typeof value !== 'string' || !value.startsWith(INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX)) fail('invalid_agent_credential_ref', 'Credential reference must use the Termux:API AndroidKeyStore URI');
  const alias = value.slice(INSTALLABLE_AGENT_KEYSTORE_CREDENTIAL_REF_PREFIX.length);
  if (!/^tdev\.a1\.[A-Za-z0-9_-]{43}$/.test(alias)) fail('invalid_agent_credential_ref', 'Credential reference contains a noncanonical keystore alias');
  return Object.freeze({ packageName: 'com.termux.api', alias });
}
