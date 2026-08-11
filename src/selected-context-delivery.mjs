import { createHash } from 'node:crypto';

import {
  ContractError,
  canonicalJson,
  digest,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { DEFAULT_LIMITS, validateRelativePath } from './policy.mjs';

export const SELECTED_CONTEXT_REFERENCE_PROFILE = 'tdev.selected-context-reference.v1';
export const SELECTED_CONTEXT_AUTH_SCOPE_PROFILE = 'tdev.selected-context-reference-scope.v1';
export const SELECTED_CONTEXT_PACK_PROFILE = 'tdev.context-pack.v1';
export const SELECTED_CONTEXT_PACK_BOUNDS = Object.freeze({
  maxFiles: 128,
  maxSemanticBytes: 2 * 1024 * 1024,
  maxStoredBytes: 3 * 1024 * 1024,
  maxManifestBytes: 512 * 1024,
  maxPacks: 790,
});

const REPOSITORY_CONTEXT_PROFILE = 'tdev.repository-context.git-full-text.v1';
const PACK_MAGIC = Buffer.from('TD17PK1\0', 'ascii');
const MAX_PACK_HEADER_BYTES = DEFAULT_LIMITS.maxPathBytes + 1024;
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

function fail(code, message, details = {}) {
  throw new ContractError(code, message, details);
}

function abortError(message) {
  return new ContractError('model_transport_aborted', message);
}

function assertSignal(signal) {
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function') {
    throw new ContractError('invalid_model_signal', 'selected context delivery signal must implement AbortSignal');
  }
  return signal;
}

function throwIfAborted(signal, message) {
  if (signal.aborted) throw abortError(message);
}

function scalarString(value, label, code = 'context_reference_corrupt') {
  if (typeof value !== 'string' || value.includes('\0')) fail(code, `${label} must be a string`);
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function decodeUtf8(bytes, label) {
  try {
    return fatalDecoder.decode(bytes);
  } catch (cause) {
    throw new ContractError('context_reference_corrupt', `${label} is not valid UTF-8`, {}, { cause });
  }
}

function authorizationScope(invocation) {
  const scope = {
    caseId: scalarString(invocation?.caseId, 'caseId'),
    planDigest: scalarString(invocation?.planDigest, 'planDigest'),
    caseContractDigest: scalarString(invocation?.caseContractDigest, 'caseContractDigest'),
  };
  return {
    ...scope,
    authorizationScopeDigest: typedDigest(SELECTED_CONTEXT_AUTH_SCOPE_PROFILE, scope),
  };
}

function attemptId(invocation) {
  const value = invocation?.attempt?.id ?? invocation?.attemptId;
  return scalarString(value, 'attemptId');
}

function referenceIdentity(reference) {
  return {
    repositoryCommitOid: reference.repositoryCommitOid,
    semanticBaseDigest: reference.semanticBaseDigest,
    contextDigest: reference.contextDigest,
    authorizationScopeDigest: reference.authorizationScopeDigest,
  };
}

function validateDescriptorBounds(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('context_reference_corrupt', 'Repository context descriptor is missing or malformed');
  }
  if (!Number.isSafeInteger(descriptor.fileCount) || descriptor.fileCount < 0) {
    fail('context_reference_corrupt', 'Repository context file count is malformed');
  }
  if (descriptor.fileCount > DEFAULT_LIMITS.maxTreeEntries) {
    fail('context_reference_limit_exceeded', 'Repository context file count exceeds its bound');
  }
  if (!Number.isSafeInteger(descriptor.contentBytes) || descriptor.contentBytes < 0) {
    fail('context_reference_corrupt', 'Repository context semantic byte count is malformed');
  }
  if (descriptor.contentBytes > DEFAULT_LIMITS.maxTreeBytes) {
    fail('context_reference_limit_exceeded', 'Repository context semantic bytes exceed their bound');
  }
}

function descriptorIdentity(descriptor) {
  const { contextDigest, ...identity } = descriptor;
  return identity;
}

function validateDescriptorDigest(descriptor) {
  if (descriptor.profile !== REPOSITORY_CONTEXT_PROFILE || descriptor.schemaVersion !== 1) {
    fail('context_reference_corrupt', 'Repository context descriptor profile is unsupported');
  }
  scalarString(descriptor.commitOid, 'repositoryCommitOid');
  scalarString(descriptor.semanticBaseDigest, 'semanticBaseDigest');
  scalarString(descriptor.contextDigest, 'contextDigest');
  if (typedDigest(REPOSITORY_CONTEXT_PROFILE, descriptorIdentity(descriptor)) !== descriptor.contextDigest) {
    fail('context_reference_corrupt', 'Repository context descriptor digest does not match');
  }
}

function validateFilePath(filePath) {
  if (typeof filePath !== 'string') fail('context_reference_corrupt', 'Repository path is malformed');
  if (Buffer.byteLength(filePath, 'utf8') > DEFAULT_LIMITS.maxPathBytes) {
    fail('context_reference_limit_exceeded', 'Repository path exceeds its byte bound');
  }
  try {
    return validateRelativePath(filePath);
  } catch (cause) {
    if (cause?.code === 'path_limit_exceeded' || cause?.code === 'invalid_path_length') {
      fail('context_reference_limit_exceeded', 'Repository path exceeds its bound');
    }
    throw new ContractError('context_reference_corrupt', 'Repository path is invalid', {}, { cause });
  }
}

function validatePreparedContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    fail('context_reference_corrupt', 'Prepared repository context is malformed');
  }
  const { descriptor, files } = context;
  validateDescriptorBounds(descriptor);
  if (!Array.isArray(files)) fail('context_reference_corrupt', 'Prepared repository files are missing');
  if (files.length > DEFAULT_LIMITS.maxTreeEntries) {
    fail('context_reference_limit_exceeded', 'Prepared repository file count exceeds its bound');
  }
  if (files.length !== descriptor.fileCount) {
    fail('context_reference_corrupt', 'Prepared repository file count does not match descriptor');
  }
  if (!Array.isArray(descriptor.files) || descriptor.files.length !== files.length) {
    fail('context_reference_corrupt', 'Repository descriptor file manifest is malformed');
  }

  const tree = Object.create(null);
  let contentBytes = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      fail('context_reference_corrupt', 'Prepared repository file is malformed');
    }
    const filePath = validateFilePath(file.path);
    scalarString(file.mode, 'Repository file mode');
    scalarString(file.blobOid, 'Repository blob OID');
    if (typeof file.content !== 'string') fail('context_reference_corrupt', 'Repository file content must be text');
    const byteLength = Buffer.byteLength(file.content, 'utf8');
    if (byteLength > DEFAULT_LIMITS.maxFileBytes ||
        (Number.isSafeInteger(file.byteLength) && file.byteLength > DEFAULT_LIMITS.maxFileBytes)) {
      fail('context_reference_limit_exceeded', 'Repository file exceeds its byte bound');
    }
    if (!Number.isSafeInteger(file.byteLength) || file.byteLength < 0 || file.byteLength !== byteLength) {
      fail('context_reference_corrupt', 'Repository file byte length does not match content');
    }
    contentBytes += byteLength;
    if (contentBytes > DEFAULT_LIMITS.maxTreeBytes) {
      fail('context_reference_limit_exceeded', 'Repository context exceeds its semantic byte bound');
    }
    const metadata = descriptor.files[index];
    if (!metadata || metadata.path !== filePath || metadata.mode !== file.mode ||
        metadata.blobOid !== file.blobOid || metadata.byteLength !== file.byteLength) {
      fail('context_reference_corrupt', 'Repository descriptor file metadata does not match content');
    }
    if (Object.hasOwn(tree, filePath)) fail('context_reference_corrupt', 'Repository context contains a duplicate path');
    tree[filePath] = file.content;
  }
  if (contentBytes !== descriptor.contentBytes) {
    fail('context_reference_corrupt', 'Repository semantic byte count does not match descriptor');
  }
  if (digest(tree) !== descriptor.semanticBaseDigest) {
    fail('context_reference_corrupt', 'Repository semantic content does not match its base digest');
  }
  validateDescriptorDigest(descriptor);
  return { descriptor, files, contentBytes };
}

export function createSelectedContextReference(descriptor, invocation) {
  validateDescriptorBounds(descriptor);
  scalarString(descriptor.commitOid, 'repositoryCommitOid');
  scalarString(descriptor.semanticBaseDigest, 'semanticBaseDigest');
  scalarString(descriptor.contextDigest, 'contextDigest');
  const scope = authorizationScope(invocation);
  const identity = {
    repositoryCommitOid: descriptor.commitOid,
    semanticBaseDigest: descriptor.semanticBaseDigest,
    contextDigest: descriptor.contextDigest,
    authorizationScopeDigest: scope.authorizationScopeDigest,
  };
  return Object.freeze({
    schemaVersion: 1,
    profile: SELECTED_CONTEXT_REFERENCE_PROFILE,
    ...identity,
    referenceId: typedDigest(SELECTED_CONTEXT_REFERENCE_PROFILE, identity),
  });
}

function productRequest(contextReference, invocation) {
  return Object.freeze({
    schemaVersion: 1,
    invocation: Object.freeze({
      caseId: scalarString(invocation?.caseId, 'caseId'),
      planDigest: scalarString(invocation?.planDigest, 'planDigest'),
      caseContractDigest: scalarString(invocation?.caseContractDigest, 'caseContractDigest'),
      baseDigest: scalarString(invocation?.baseDigest, 'baseDigest'),
      attemptId: attemptId(invocation),
    }),
    contextReference,
  });
}

function encodePack(files) {
  if (files.length < 1 || files.length > SELECTED_CONTEXT_PACK_BOUNDS.maxFiles) {
    fail('context_reference_limit_exceeded', 'Context pack file count exceeds its bound');
  }
  const chunks = [PACK_MAGIC];
  let semanticBytes = 0;
  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8');
    semanticBytes += content.length;
    if (semanticBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes) {
      fail('context_reference_limit_exceeded', 'Context pack semantic bytes exceed their bound');
    }
    const header = Buffer.from(canonicalJson({
      path: file.path,
      mode: file.mode,
      blobOid: file.blobOid,
      byteLength: file.byteLength,
      contentDigest: sha256(content),
    }), 'utf8');
    if (header.length > MAX_PACK_HEADER_BYTES) {
      fail('context_reference_limit_exceeded', 'Context pack header exceeds its bound');
    }
    const headerLength = Buffer.allocUnsafe(4);
    headerLength.writeUInt32BE(header.length);
    const contentLength = Buffer.allocUnsafe(4);
    contentLength.writeUInt32BE(content.length);
    chunks.push(headerLength, header, contentLength, content);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length > SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes) {
    fail('context_reference_limit_exceeded', 'Context pack stored bytes exceed their bound');
  }
  return { bytes, semanticBytes };
}

function partitionFiles(files) {
  const partitions = [];
  let current = [];
  let semanticBytes = 0;
  const flush = () => {
    if (current.length === 0) return;
    partitions.push(current);
    current = [];
    semanticBytes = 0;
  };
  for (const file of files) {
    if (current.length > 0 && (
      current.length >= SELECTED_CONTEXT_PACK_BOUNDS.maxFiles ||
      semanticBytes + file.byteLength > SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes
    )) flush();
    current.push(file);
    semanticBytes += file.byteLength;
  }
  flush();
  return partitions;
}

export async function prepareSelectedContextDelivery(context, invocation) {
  const signal = assertSignal(invocation?.signal);
  throwIfAborted(signal, 'Model transport was aborted before selected context preparation');
  const validated = validatePreparedContext(context);
  if (invocation?.baseDigest !== validated.descriptor.semanticBaseDigest ||
      invocation?.task?.input?.repositoryCommitOid !== validated.descriptor.commitOid) {
    fail('context_reference_stale', 'Prepared context does not match the admitted invocation');
  }
  const reference = createSelectedContextReference(validated.descriptor, invocation);
  const packObjects = new Map();
  const packs = [];
  for (const partition of partitionFiles(validated.files)) {
    throwIfAborted(signal, 'Model transport was aborted during selected context packing');
    const encoded = encodePack(partition);
    const packDigest = sha256(encoded.bytes);
    packObjects.set(packDigest, encoded.bytes);
    packs.push({
      digest: packDigest,
      fileCount: partition.length,
      contentBytes: encoded.semanticBytes,
      storedBytes: encoded.bytes.length,
      firstPath: partition[0].path,
      lastPath: partition.at(-1).path,
    });
    if (packs.length > SELECTED_CONTEXT_PACK_BOUNDS.maxPacks) {
      fail('context_reference_limit_exceeded', 'Selected context pack count exceeds its bound');
    }
    await Promise.resolve();
    throwIfAborted(signal, 'Model transport was aborted during selected context packing');
  }
  const manifestBytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    profile: SELECTED_CONTEXT_PACK_PROFILE,
    descriptor: validated.descriptor,
    packBounds: {
      maxPackFiles: SELECTED_CONTEXT_PACK_BOUNDS.maxFiles,
      maxPackContentBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes,
      maxPackStoredBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes,
      maxPackCount: SELECTED_CONTEXT_PACK_BOUNDS.maxPacks,
    },
    packs,
  }), 'utf8');
  if (manifestBytes.length > SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes) {
    fail('context_reference_limit_exceeded', 'Selected context pack manifest exceeds its bound');
  }
  throwIfAborted(signal, 'Model transport was aborted after selected context packing');
  return {
    request: productRequest(reference, invocation),
    carrier: {
      representation: 'bounded-packed-hybrid',
      retention: 'ephemeral',
      shared: false,
      durable: false,
      manifestDigest: sha256(manifestBytes),
      manifestBytes,
      packObjects,
    },
  };
}

function validateReferenceRequest(delivery, admittedInvocation) {
  const request = delivery?.request;
  const reference = request?.contextReference;
  if (!request || request.schemaVersion !== 1 || !reference ||
      reference.schemaVersion !== 1 || reference.profile !== SELECTED_CONTEXT_REFERENCE_PROFILE) {
    fail('context_reference_corrupt', 'Selected context reference envelope is malformed');
  }
  scalarString(reference.repositoryCommitOid, 'reference.repositoryCommitOid');
  scalarString(reference.semanticBaseDigest, 'reference.semanticBaseDigest');
  scalarString(reference.contextDigest, 'reference.contextDigest');
  scalarString(reference.authorizationScopeDigest, 'reference.authorizationScopeDigest');
  scalarString(reference.referenceId, 'reference.referenceId');

  const admittedScope = authorizationScope(admittedInvocation);
  if (admittedScope.authorizationScopeDigest !== reference.authorizationScopeDigest) {
    fail('context_reference_unauthorized', 'Selected context reference is outside the admitted Case/Plan authorization scope');
  }
  if (admittedInvocation?.baseDigest !== reference.semanticBaseDigest ||
      admittedInvocation?.task?.input?.repositoryCommitOid !== reference.repositoryCommitOid) {
    fail('context_reference_stale', 'Selected context reference is stale for the admitted invocation');
  }
  if (typedDigest(SELECTED_CONTEXT_REFERENCE_PROFILE, referenceIdentity(reference)) !== reference.referenceId) {
    fail('context_reference_corrupt', 'Selected context logical reference digest does not match');
  }
  return reference;
}

function parseManifest(bytes) {
  try {
    return strictJsonParse(bytes, {
      maxBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
      maxStringCodePoints: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
    });
  } catch (cause) {
    throw new ContractError('context_reference_corrupt', 'Selected context pack manifest is malformed', {}, { cause });
  }
}

function decodePack(bytes) {
  if (bytes.length > SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes) {
    fail('context_reference_limit_exceeded', 'Selected context pack stored bytes exceed their bound');
  }
  if (bytes.length < PACK_MAGIC.length || !bytes.subarray(0, PACK_MAGIC.length).equals(PACK_MAGIC)) {
    fail('context_reference_corrupt', 'Selected context pack framing is invalid');
  }
  const files = [];
  let semanticBytes = 0;
  let offset = PACK_MAGIC.length;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) fail('context_reference_corrupt', 'Selected context pack header length is truncated');
    const headerLength = bytes.readUInt32BE(offset);
    offset += 4;
    if (headerLength < 2) fail('context_reference_corrupt', 'Selected context pack header is malformed');
    if (headerLength > MAX_PACK_HEADER_BYTES) fail('context_reference_limit_exceeded', 'Selected context pack header exceeds its bound');
    if (offset + headerLength + 4 > bytes.length) fail('context_reference_corrupt', 'Selected context pack header is truncated');
    let header;
    try {
      header = strictJsonParse(bytes.subarray(offset, offset + headerLength), {
        maxBytes: MAX_PACK_HEADER_BYTES,
        maxStringCodePoints: MAX_PACK_HEADER_BYTES,
      });
    } catch (cause) {
      throw new ContractError('context_reference_corrupt', 'Selected context pack header is malformed', {}, { cause });
    }
    offset += headerLength;
    const contentLength = bytes.readUInt32BE(offset);
    offset += 4;
    if (contentLength > DEFAULT_LIMITS.maxFileBytes) fail('context_reference_limit_exceeded', 'Selected context file exceeds its byte bound');
    if (offset + contentLength > bytes.length) fail('context_reference_corrupt', 'Selected context pack content is truncated');
    const contentBytes = bytes.subarray(offset, offset + contentLength);
    offset += contentLength;
    const filePath = validateFilePath(header.path);
    if (!Number.isSafeInteger(header.byteLength) || header.byteLength < 0 ||
        header.byteLength !== contentLength || sha256(contentBytes) !== header.contentDigest) {
      fail('context_reference_corrupt', 'Selected context pack content binding does not match');
    }
    semanticBytes += contentLength;
    if (semanticBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes) {
      fail('context_reference_limit_exceeded', 'Selected context pack semantic bytes exceed their bound');
    }
    files.push({
      path: filePath,
      mode: scalarString(header.mode, 'Repository file mode'),
      blobOid: scalarString(header.blobOid, 'Repository blob OID'),
      byteLength: header.byteLength,
      content: decodeUtf8(contentBytes, `Repository file ${filePath}`),
    });
    if (files.length > SELECTED_CONTEXT_PACK_BOUNDS.maxFiles) {
      fail('context_reference_limit_exceeded', 'Selected context pack file count exceeds its bound');
    }
  }
  return { files, semanticBytes };
}

function verifyResolvedContext(descriptor, files, reference) {
  validateDescriptorBounds(descriptor);
  if (descriptor.commitOid !== reference.repositoryCommitOid ||
      descriptor.semanticBaseDigest !== reference.semanticBaseDigest ||
      descriptor.contextDigest !== reference.contextDigest) {
    fail('context_reference_stale', 'Resolved repository descriptor does not match the selected context reference');
  }
  validateDescriptorDigest(descriptor);
  if (!Array.isArray(files) || files.length > DEFAULT_LIMITS.maxTreeEntries) {
    fail('context_reference_limit_exceeded', 'Resolved repository file count exceeds its bound');
  }
  if (files.length !== descriptor.fileCount || !Array.isArray(descriptor.files) || descriptor.files.length !== files.length) {
    fail('context_reference_corrupt', 'Resolved repository file count does not match descriptor');
  }
  const tree = Object.create(null);
  let contentBytes = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filePath = validateFilePath(file.path);
    const byteLength = Buffer.byteLength(file.content, 'utf8');
    if (byteLength > DEFAULT_LIMITS.maxFileBytes) fail('context_reference_limit_exceeded', 'Resolved repository file exceeds its byte bound');
    if (byteLength !== file.byteLength) fail('context_reference_corrupt', 'Resolved repository file length does not match');
    contentBytes += byteLength;
    if (contentBytes > DEFAULT_LIMITS.maxTreeBytes) fail('context_reference_limit_exceeded', 'Resolved repository tree exceeds its semantic byte bound');
    const metadata = descriptor.files[index];
    if (!metadata || metadata.path !== filePath || metadata.mode !== file.mode ||
        metadata.blobOid !== file.blobOid || metadata.byteLength !== file.byteLength) {
      fail('context_reference_corrupt', 'Resolved repository file metadata does not match descriptor');
    }
    if (Object.hasOwn(tree, filePath)) fail('context_reference_corrupt', 'Resolved repository contains a duplicate path');
    tree[filePath] = file.content;
  }
  if (contentBytes !== descriptor.contentBytes || digest(tree) !== reference.semanticBaseDigest) {
    fail('context_reference_corrupt', 'Resolved repository context is not semantically equivalent');
  }
}

export async function resolveSelectedContextDelivery(delivery, admittedInvocation) {
  const signal = assertSignal(admittedInvocation?.signal);
  throwIfAborted(signal, 'Model transport was aborted before selected context resolution');

  // Authorization and stale checks intentionally precede all carrier access: possession is not authority.
  const reference = validateReferenceRequest(delivery, admittedInvocation);

  const carrier = delivery?.carrier;
  if (!carrier || carrier.manifestBytes === null || carrier.manifestBytes === undefined ||
      carrier.manifestDigest === null || carrier.manifestDigest === undefined ||
      carrier.packObjects === null || carrier.packObjects === undefined) {
    fail('context_reference_missing', 'Selected context carrier material is missing');
  }
  if (!Buffer.isBuffer(carrier.manifestBytes)) fail('context_reference_corrupt', 'Selected context manifest material is malformed');
  if (carrier.manifestBytes.length > SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes) {
    fail('context_reference_limit_exceeded', 'Selected context pack manifest exceeds its bound');
  }
  if (typeof carrier.manifestDigest !== 'string') fail('context_reference_corrupt', 'Selected context manifest digest is malformed');
  if (sha256(carrier.manifestBytes) !== carrier.manifestDigest) {
    fail('context_reference_corrupt', 'Selected context pack manifest digest does not match');
  }
  if (!(carrier.packObjects instanceof Map)) fail('context_reference_corrupt', 'Selected context pack material is malformed');

  const manifest = parseManifest(carrier.manifestBytes);
  if (!manifest || manifest.schemaVersion !== 1 || manifest.profile !== SELECTED_CONTEXT_PACK_PROFILE || !Array.isArray(manifest.packs)) {
    fail('context_reference_corrupt', 'Selected context pack manifest profile is unsupported');
  }
  if (manifest.packs.length > SELECTED_CONTEXT_PACK_BOUNDS.maxPacks) {
    fail('context_reference_limit_exceeded', 'Selected context pack count exceeds its bound');
  }
  const bounds = manifest.packBounds;
  if (!bounds || typeof bounds !== 'object') fail('context_reference_corrupt', 'Selected context pack bounds are missing');
  if (bounds.maxPackFiles > SELECTED_CONTEXT_PACK_BOUNDS.maxFiles ||
      bounds.maxPackContentBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes ||
      bounds.maxPackStoredBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes ||
      bounds.maxPackCount > SELECTED_CONTEXT_PACK_BOUNDS.maxPacks) {
    fail('context_reference_limit_exceeded', 'Selected context manifest declares bounds above the accepted contract');
  }
  if (bounds.maxPackFiles !== SELECTED_CONTEXT_PACK_BOUNDS.maxFiles ||
      bounds.maxPackContentBytes !== SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes ||
      bounds.maxPackStoredBytes !== SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes ||
      bounds.maxPackCount !== SELECTED_CONTEXT_PACK_BOUNDS.maxPacks) {
    fail('context_reference_corrupt', 'Selected context manifest bounds do not match the accepted contract');
  }

  const descriptor = manifest.descriptor;
  validateDescriptorBounds(descriptor);
  if (descriptor.commitOid !== reference.repositoryCommitOid ||
      descriptor.semanticBaseDigest !== reference.semanticBaseDigest ||
      descriptor.contextDigest !== reference.contextDigest) {
    fail('context_reference_stale', 'Selected context manifest is stale for the logical reference');
  }

  const files = [];
  let storedBytes = carrier.manifestBytes.length;
  for (const pack of manifest.packs) {
    throwIfAborted(signal, 'Model transport was aborted during selected context resolution');
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) fail('context_reference_corrupt', 'Selected context pack declaration is malformed');
    if (!Number.isSafeInteger(pack.fileCount) || pack.fileCount < 1 ||
        !Number.isSafeInteger(pack.contentBytes) || pack.contentBytes < 0 ||
        !Number.isSafeInteger(pack.storedBytes) || pack.storedBytes < 0) {
      fail('context_reference_corrupt', 'Selected context pack declaration is malformed');
    }
    if (pack.fileCount > SELECTED_CONTEXT_PACK_BOUNDS.maxFiles ||
        pack.contentBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes ||
        pack.storedBytes > SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes) {
      fail('context_reference_limit_exceeded', 'Selected context pack declaration exceeds accepted bounds');
    }
    scalarString(pack.digest, 'Selected context pack digest');
    if (!carrier.packObjects.has(pack.digest)) fail('context_reference_missing', 'Required selected context pack is missing');
    const packBytes = carrier.packObjects.get(pack.digest);
    if (!Buffer.isBuffer(packBytes)) fail('context_reference_corrupt', 'Selected context pack material is malformed');
    if (packBytes.length > SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes) {
      fail('context_reference_limit_exceeded', 'Selected context pack stored bytes exceed their bound');
    }
    if (sha256(packBytes) !== pack.digest) fail('context_reference_corrupt', 'Selected context pack digest does not match');
    const decoded = decodePack(packBytes);
    if (decoded.files.length !== pack.fileCount || decoded.semanticBytes !== pack.contentBytes || packBytes.length !== pack.storedBytes) {
      fail('context_reference_corrupt', 'Selected context pack declaration does not match its content');
    }
    files.push(...decoded.files);
    if (files.length > DEFAULT_LIMITS.maxTreeEntries) fail('context_reference_limit_exceeded', 'Resolved repository file count exceeds its bound');
    storedBytes += packBytes.length;
    await Promise.resolve();
    throwIfAborted(signal, 'Model transport was aborted during selected context resolution');
  }

  verifyResolvedContext(descriptor, files, reference);
  throwIfAborted(signal, 'Model transport was aborted after selected context resolution');
  const resolvedDescriptor = {
    ...descriptor,
    files: descriptor.files.map((file) => ({ ...file })),
  };
  return {
    descriptor: resolvedDescriptor,
    files,
    reference,
    packCount: manifest.packs.length,
    manifestBytes: carrier.manifestBytes.length,
    storedBytes,
  };
}
