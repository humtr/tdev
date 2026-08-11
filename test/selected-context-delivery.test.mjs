import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ContractError, canonicalJson, digest, strictJsonParse, typedDigest } from '../src/canonical.mjs';
import { DEFAULT_LIMITS } from '../src/policy.mjs';
import { REPOSITORY_CONTEXT_PROFILE } from '../src/repository-model-transport.mjs';
import {
  SELECTED_CONTEXT_AUTH_SCOPE_PROFILE,
  SELECTED_CONTEXT_PACK_BOUNDS,
  SELECTED_CONTEXT_PACK_PROFILE,
  SELECTED_CONTEXT_REFERENCE_PROFILE,
  createSelectedContextReference,
  prepareSelectedContextDelivery,
  resolveSelectedContextDelivery,
} from '../src/selected-context-delivery.mjs';

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function makeContext(fileCount = 3, contentBytes = 32) {
  const files = [];
  const tree = Object.create(null);
  for (let index = 0; index < fileCount; index += 1) {
    const path = `src/f${String(index).padStart(4, '0')}.txt`;
    const prefix = `${index}:`;
    const content = `${prefix}${'x'.repeat(Math.max(0, contentBytes - Buffer.byteLength(prefix, 'utf8')))}`;
    const byteLength = Buffer.byteLength(content, 'utf8');
    tree[path] = content;
    files.push({
      path,
      mode: '100644',
      blobOid: createHash('sha1').update(content).digest('hex'),
      byteLength,
      content,
    });
  }
  const semanticBaseDigest = digest(tree);
  const identity = {
    schemaVersion: 1,
    profile: REPOSITORY_CONTEXT_PROFILE,
    objectFormat: 'sha1',
    commitOid: 'c'.repeat(40),
    treeOid: 'd'.repeat(40),
    semanticBaseDigest,
    fileCount: files.length,
    contentBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    files: files.map(({ path, mode, blobOid, byteLength }) => ({ path, mode, blobOid, byteLength })),
  };
  return {
    descriptor: {
      ...identity,
      contextDigest: typedDigest(REPOSITORY_CONTEXT_PROFILE, identity),
    },
    files,
  };
}

function invocationFor(context, overrides = {}) {
  const base = {
    caseId: 'case-d0017',
    planDigest: typedDigest('tdev.test.plan.v1', { revision: 1 }),
    caseContractDigest: typedDigest('tdev.test.case-contract.v1', { revision: 1 }),
    baseDigest: context.descriptor.semanticBaseDigest,
    attemptId: 'attempt.1',
    signal: new AbortController().signal,
    task: {
      input: {
        repositoryCommitOid: context.descriptor.commitOid,
        instruction: 'test',
      },
    },
  };
  return { ...base, ...overrides };
}

function cloneDelivery(delivery) {
  const carrier = delivery.carrier === null ? null : {
    ...delivery.carrier,
    manifestBytes: Buffer.from(delivery.carrier.manifestBytes),
    packObjects: new Map(
      [...delivery.carrier.packObjects.entries()].map(([key, value]) => [key, Buffer.from(value)]),
    ),
  };
  return {
    request: structuredClone(delivery.request),
    carrier,
  };
}

function rewriteManifest(delivery, mutate) {
  const clone = cloneDelivery(delivery);
  const manifest = strictJsonParse(clone.carrier.manifestBytes, {
    maxBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
    maxStringCodePoints: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
  });
  mutate(manifest);
  clone.carrier.manifestBytes = Buffer.from(canonicalJson(manifest), 'utf8');
  clone.carrier.manifestDigest = sha256(clone.carrier.manifestBytes);
  return clone;
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof ContractError && error.code === code,
  );
}

function referenceIdentity(reference) {
  return {
    repositoryCommitOid: reference.repositoryCommitOid,
    semanticBaseDigest: reference.semanticBaseDigest,
    contextDigest: reference.contextDigest,
    authorizationScopeDigest: reference.authorizationScopeDigest,
  };
}

test('D0017 production constants match the accepted logical and packed/hybrid contract', () => {
  assert.equal(SELECTED_CONTEXT_REFERENCE_PROFILE, 'tdev.selected-context-reference.v1');
  assert.equal(SELECTED_CONTEXT_AUTH_SCOPE_PROFILE, 'tdev.selected-context-reference-scope.v1');
  assert.equal(SELECTED_CONTEXT_PACK_PROFILE, 'tdev.context-pack.v1');
  assert.deepEqual(SELECTED_CONTEXT_PACK_BOUNDS, {
    maxFiles: 128,
    maxSemanticBytes: 2 * 1024 * 1024,
    maxStoredBytes: 3 * 1024 * 1024,
    maxManifestBytes: 512 * 1024,
    maxPacks: 790,
  });
  assert.equal(DEFAULT_LIMITS.maxPathBytes, 4096);
  assert.equal(DEFAULT_LIMITS.maxFileBytes, 2 * 1024 * 1024);
  assert.equal(DEFAULT_LIMITS.maxTreeEntries, 100000);
  assert.equal(DEFAULT_LIMITS.maxTreeBytes, 16 * 1024 * 1024);
});

test('logical reference identity binds commit/base/context/admitted scope and excludes attempt and physical state', () => {
  const context = makeContext();
  const firstInvocation = invocationFor(context, { attemptId: 'attempt.1' });
  const retryInvocation = invocationFor(context, { attemptId: 'attempt.2' });
  const first = createSelectedContextReference(context.descriptor, firstInvocation);
  const retry = createSelectedContextReference(context.descriptor, retryInvocation);

  assert.deepEqual(first, retry);
  assert.equal(first.referenceId, typedDigest(SELECTED_CONTEXT_REFERENCE_PROFILE, referenceIdentity(first)));
  assert.equal(first.repositoryCommitOid, context.descriptor.commitOid);
  assert.equal(first.semanticBaseDigest, context.descriptor.semanticBaseDigest);
  assert.equal(first.contextDigest, context.descriptor.contextDigest);
  assert.equal(Object.hasOwn(first, 'attemptId'), false);
  assert.equal(Object.hasOwn(first, 'path'), false);
  assert.equal(Object.hasOwn(first, 'locator'), false);
  assert.equal(Object.hasOwn(first, 'representation'), false);
  assert.equal(Object.hasOwn(first, 'credential'), false);
});

test('packed/hybrid resolution is byte-for-byte semantic equivalent to authoritative full context', async () => {
  const context = makeContext(257, 1024);
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);
  const resolved = await resolveSelectedContextDelivery(delivery, invocation);

  assert.deepEqual(resolved.descriptor, context.descriptor);
  assert.deepEqual(resolved.files, context.files);
  assert.equal(digest(Object.fromEntries(resolved.files.map((file) => [file.path, file.content]))), context.descriptor.semanticBaseDigest);
  assert.equal(resolved.reference.referenceId, delivery.request.contextReference.referenceId);
  assert.equal(resolved.packCount, 3);
});

test('retry and cold reconstruction preserve one logical reference identity', async () => {
  const context = makeContext(129, 64);
  const first = await prepareSelectedContextDelivery(context, invocationFor(context, { attemptId: 'attempt.1' }));
  const retry = await prepareSelectedContextDelivery(context, invocationFor(context, { attemptId: 'attempt.2' }));
  const restart = await prepareSelectedContextDelivery(structuredClone(context), invocationFor(context, { attemptId: 'attempt.restart' }));
  assert.equal(first.request.contextReference.referenceId, retry.request.contextReference.referenceId);
  assert.equal(first.request.contextReference.referenceId, restart.request.contextReference.referenceId);
  assert.notEqual(first.request.invocation.attemptId, retry.request.invocation.attemptId);
});

test('copied reference fails authorization before receiver content is touched', async () => {
  const context = makeContext();
  const admitted = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, admitted);
  let exposed = false;
  const poisonedCarrier = {
    get manifestBytes() {
      exposed = true;
      throw new Error('content must not be exposed');
    },
    get manifestDigest() {
      exposed = true;
      throw new Error('content must not be exposed');
    },
    get packObjects() {
      exposed = true;
      throw new Error('content must not be exposed');
    },
  };
  const copied = { request: delivery.request, carrier: poisonedCarrier };
  await expectCode(
    resolveSelectedContextDelivery(copied, invocationFor(context, { caseId: 'other-case' })),
    'context_reference_unauthorized',
  );
  assert.equal(exposed, false);
});

test('wrong expected base or context identity fails stale before model acceptance', async () => {
  const context = makeContext();
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);
  await expectCode(
    resolveSelectedContextDelivery(delivery, invocationFor(context, { baseDigest: 'sha256:' + '0'.repeat(64) })),
    'context_reference_stale',
  );

  const stale = cloneDelivery(delivery);
  stale.request.contextReference.contextDigest = typedDigest('tdev.test.stale-context.v1', { stale: true });
  stale.request.contextReference.referenceId = typedDigest(
    SELECTED_CONTEXT_REFERENCE_PROFILE,
    referenceIdentity(stale.request.contextReference),
  );
  await expectCode(resolveSelectedContextDelivery(stale, invocation), 'context_reference_stale');
});

test('missing manifest and required pack fail with context_reference_missing', async () => {
  const context = makeContext(129, 64);
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);

  const missingManifest = cloneDelivery(delivery);
  missingManifest.carrier.manifestBytes = null;
  await expectCode(resolveSelectedContextDelivery(missingManifest, invocation), 'context_reference_missing');

  const missingPack = cloneDelivery(delivery);
  const manifest = strictJsonParse(missingPack.carrier.manifestBytes, {
    maxBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
    maxStringCodePoints: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
  });
  missingPack.carrier.packObjects.delete(manifest.packs[0].digest);
  await expectCode(resolveSelectedContextDelivery(missingPack, invocation), 'context_reference_missing');
});

test('manifest and pack tampering fail with context_reference_corrupt', async () => {
  const context = makeContext(129, 64);
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);

  const corruptManifest = cloneDelivery(delivery);
  corruptManifest.carrier.manifestBytes[0] ^= 0xff;
  await expectCode(resolveSelectedContextDelivery(corruptManifest, invocation), 'context_reference_corrupt');

  const corruptPack = cloneDelivery(delivery);
  const manifest = strictJsonParse(corruptPack.carrier.manifestBytes, {
    maxBytes: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
    maxStringCodePoints: SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes,
  });
  const packDigest = manifest.packs[0].digest;
  corruptPack.carrier.packObjects.get(packDigest)[0] ^= 0xff;
  await expectCode(resolveSelectedContextDelivery(corruptPack, invocation), 'context_reference_corrupt');
});

test('accepted semantic and packed resource bounds fail closed with context_reference_limit_exceeded', async (t) => {
  const context = makeContext(129, 64);
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);

  await t.test('path bytes', async () => {
    const invalid = makeContext();
    invalid.files[0].path = `${'p'.repeat(DEFAULT_LIMITS.maxPathBytes + 1)}.txt`;
    invalid.descriptor.files[0].path = invalid.files[0].path;
    await expectCode(prepareSelectedContextDelivery(invalid, invocationFor(invalid)), 'context_reference_limit_exceeded');
  });
  await t.test('file bytes', async () => {
    const invalid = makeContext(1, DEFAULT_LIMITS.maxFileBytes + 1);
    await expectCode(prepareSelectedContextDelivery(invalid, invocationFor(invalid)), 'context_reference_limit_exceeded');
  });
  await t.test('tree count declaration', async () => {
    const invalid = makeContext();
    invalid.descriptor.fileCount = DEFAULT_LIMITS.maxTreeEntries + 1;
    await expectCode(prepareSelectedContextDelivery(invalid, invocationFor(invalid)), 'context_reference_limit_exceeded');
  });
  await t.test('tree semantic bytes declaration', async () => {
    const invalid = makeContext();
    invalid.descriptor.contentBytes = DEFAULT_LIMITS.maxTreeBytes + 1;
    await expectCode(prepareSelectedContextDelivery(invalid, invocationFor(invalid)), 'context_reference_limit_exceeded');
  });
  await t.test('pack file count', async () => {
    const invalid = rewriteManifest(delivery, (manifest) => { manifest.packs[0].fileCount = SELECTED_CONTEXT_PACK_BOUNDS.maxFiles + 1; });
    await expectCode(resolveSelectedContextDelivery(invalid, invocation), 'context_reference_limit_exceeded');
  });
  await t.test('pack semantic bytes', async () => {
    const invalid = rewriteManifest(delivery, (manifest) => { manifest.packs[0].contentBytes = SELECTED_CONTEXT_PACK_BOUNDS.maxSemanticBytes + 1; });
    await expectCode(resolveSelectedContextDelivery(invalid, invocation), 'context_reference_limit_exceeded');
  });
  await t.test('pack stored bytes', async () => {
    const invalid = rewriteManifest(delivery, (manifest) => { manifest.packs[0].storedBytes = SELECTED_CONTEXT_PACK_BOUNDS.maxStoredBytes + 1; });
    await expectCode(resolveSelectedContextDelivery(invalid, invocation), 'context_reference_limit_exceeded');
  });
  await t.test('manifest bytes', async () => {
    const invalid = cloneDelivery(delivery);
    invalid.carrier.manifestBytes = Buffer.alloc(SELECTED_CONTEXT_PACK_BOUNDS.maxManifestBytes + 1, 0x20);
    invalid.carrier.manifestDigest = sha256(invalid.carrier.manifestBytes);
    await expectCode(resolveSelectedContextDelivery(invalid, invocation), 'context_reference_limit_exceeded');
  });
  await t.test('pack count', async () => {
    const invalid = rewriteManifest(delivery, (manifest) => {
      const sample = manifest.packs[0];
      manifest.packs = Array.from({ length: SELECTED_CONTEXT_PACK_BOUNDS.maxPacks + 1 }, () => ({ ...sample }));
    });
    await expectCode(resolveSelectedContextDelivery(invalid, invocation), 'context_reference_limit_exceeded');
  });
});

test('cancellation during multi-pack resolution has no accepted effect and does not poison retry', async () => {
  const context = makeContext(257, 64);
  const invocation = invocationFor(context);
  const delivery = await prepareSelectedContextDelivery(context, invocation);
  const controller = new AbortController();
  const pending = resolveSelectedContextDelivery(delivery, { ...invocation, signal: controller.signal });
  queueMicrotask(() => controller.abort());
  await expectCode(pending, 'model_transport_aborted');

  const retry = await resolveSelectedContextDelivery(delivery, { ...invocation, signal: new AbortController().signal });
  assert.deepEqual(retry.files, context.files);
  assert.equal(retry.reference.referenceId, delivery.request.contextReference.referenceId);
});

test('product-visible request/reference contain no absolute path, store locator, representation, process or credential state', async () => {
  const context = makeContext();
  const invocation = invocationFor(context, {
    attemptId: 'attempt.local',
    repositoryPath: '/data/data/com.termux/files/home/private/repo',
    storePath: '/tmp/private-store',
    credential: 'secret-token',
  });
  const delivery = await prepareSelectedContextDelivery(context, invocation);
  const productBytes = canonicalJson(delivery.request);
  assert.equal(productBytes.includes('/data/data/com.termux'), false);
  assert.equal(productBytes.includes('/tmp/private-store'), false);
  assert.equal(productBytes.includes('secret-token'), false);
  assert.equal(productBytes.includes('packObjects'), false);
  assert.equal(productBytes.includes('manifestDigest'), false);
  assert.equal(Object.hasOwn(delivery.request.contextReference, 'representation'), false);
  assert.equal(delivery.carrier.retention, 'ephemeral');
  assert.equal(delivery.carrier.shared, false);
  assert.equal(delivery.carrier.durable, false);
});
