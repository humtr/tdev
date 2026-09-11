import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical, parseRecord, recordDigest, bytesDigest, frozen } from '../../src/contracts/canonical.mjs';
import { revision, nextRevision, capacity, newId, gitOid } from '../../src/contracts/identity.mjs';
import { validationIdentity, assertResultReusable } from '../../src/contracts/results.mjs';
import { failure, Dev2Error } from '../../src/contracts/errors.mjs';
import { fixtureIds, fakeClock, fakeRef } from '../fixtures/deterministic.mjs';
const vectors = [
    [{ z: 1, a: true }, '{"a":true,"z":1}'], [{ 2: 'two', 10: 'ten' }, '{"10":"ten","2":"two"}'], [{ a: -0 }, '{"a":0}'],
    [[null, true, false, 9007199254740991, -9007199254740991], '[null,true,false,9007199254740991,-9007199254740991]'],
    [{ '\ue000': 1, '\ud83d\ude00': 2 }, '{"\ud83d\ude00":2,"\ue000":1}'], ['\u00e9e\u0301\n"\\', '"\u00e9e\u0301\\n\\"\\\\"'],
];
for (const [input, expected] of vectors)
    test('canonical golden ' + expected, () => { assert.equal(canonical(input), expected); assert.equal(canonical(parseRecord(expected)), expected); assert.equal(recordDigest('dev2.fixture.v1', input), 'sha256:' + createHash('sha256').update('dev2.fixture.v1\0' + expected).digest('hex')); });
for (const input of [NaN, Infinity, 1.5, 9007199254740992, undefined, () => 0, Symbol('x'), 1n, new Date(), new Map(), Buffer.from('x'), '\ud800', new Array(1)])
    test('reject noncanonical ' + String(input), () => assert.throws(() => canonical(input)));
test('cycle, getter, symbol, hidden property and extended array fail without evaluating accessors', () => { const cycle = {}; cycle.a = cycle; assert.throws(() => canonical(cycle)); let ran = false; const getter = { get a() { ran = true; return 1; } }; assert.throws(() => canonical(getter)); assert.equal(ran, false); assert.throws(() => canonical({ [Symbol('k')]: 1 })); assert.throws(() => canonical(Object.defineProperty({}, 'a', { value: 1 }))); const a = [1]; a.extra = 2; assert.throws(() => canonical(a)); });
for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[1,]', '{"a":1,}', '01', 'true false', '"\\ud800"', '9007199254740991.1', '1e-100', '1e100', '9007199254740992', '{"x":undefined}'])
    test('strict parse rejects ' + text, () => assert.throws(() => parseRecord(text)));
test('numeric spelling, parser bounds and pollution-safe keys', () => { for (const text of ['1.0', '1e3', '1000e-3', '-0', '0e9999'])
    assert.equal(parseRecord(text), Number(text) || 0); const x = parseRecord('{"__proto__":{"p":true}}'); assert.equal(Object.getPrototypeOf(x), null); assert.equal({}.p, undefined); assert.throws(() => parseRecord(' '.repeat(1025), 1024)); assert.throws(() => parseRecord('['.repeat(130) + '0' + ']'.repeat(130))); });
test('domain separation and immutable detached records', () => { assert.notEqual(recordDigest('dev2.request.v1', { a: 1 }), recordDigest('dev2.source-manifest.v1', { a: 1 })); const x = { a: [1] }, y = frozen(x); x.a[0] = 2; assert.equal(y.a[0], 1); assert.throws(() => y.a.push(2)); });
test('uint64 revisions exceed Number and SQLite signed range without loss', () => { assert.equal(nextRevision('9007199254740991'), '9007199254740992'); assert.equal(nextRevision('9223372036854775807'), '9223372036854775808'); assert.equal(revision('18446744073709551615'), '18446744073709551615'); for (const x of [1, '-1', '01', '18446744073709551616'])
    assert.throws(() => revision(x)); assert.throws(() => nextRevision('18446744073709551615')); });
test('capacity is not an identity ceiling', () => { assert.equal(capacity(), 8); for (const n of [1, 8, 12, 16, 32, 1024])
    assert.equal(capacity(n), n); for (const n of [0, -1, 1.1, NaN])
    assert.throws(() => capacity(n)); const ids = new Set(Array.from({ length: 64 }, () => newId('work'))); assert.equal(ids.size, 64); for (const id of ids)
    assert.match(id, /^work-[a-f0-9]{32}$/); assert.equal(gitOid('sha256:' + 'a'.repeat(64)), 'sha256:' + 'a'.repeat(64)); assert.throws(() => gitOid('a'.repeat(40))); });
test('deterministic clock, ref and seed', () => { const a = fixtureIds(), b = fixtureIds(); for (let i = 0; i < 32; i++)
    assert.equal(a(), b()); assert.notEqual(fixtureIds('a')(), fixtureIds('b')()); const clock = fakeClock(); clock.advance(9); assert.equal(clock.monotonic(), 9); const ref = fakeRef('H'); assert.equal(ref.compareUpdate('H', 'A'), true); assert.equal(ref.compareUpdate('H', 'B'), false); assert.equal(ref.read(), 'A'); });
test('prepared-result identity excludes action IDs and rejects stale reuse', () => { const d = bytesDigest('x'), h = 'sha1:' + '1'.repeat(40), c = 'sha1:' + '2'.repeat(40), t = 'sha1:' + '3'.repeat(40); const r = { resultId: 'result-1', repositoryId: 'self', bindingEpoch: 'epoch-1', workId: 'work-1', generation: '1', originalBaseHead: h, originalBaseTree: t, candidateTree: t, baseHead: h, commitOid: c, resultTreeOid: t, resultTreeSha256: d, policyDigest: d, metadata: { name: 'fixture', email: 'fixture@example.invalid', timestamp: 1, message: 'change' } }; const required = { policyDigest: d, profileDigests: [d], trustedRunnerDigest: d, toolchainDigest: d, environmentClass: 'core', dependencyLockDigest: d }; const id = validationIdentity(r, required); assert.equal(id, validationIdentity({ ...r, actionId: 'another' }, required)); assert.notEqual(id, validationIdentity({ ...r, commitOid: h }, required)); assertResultReusable(r, { workId: r.workId, generation: '1', baseHead: h, policyDigest: d }); assert.throws(() => assertResultReusable(r, { workId: r.workId, generation: '2', baseHead: h, policyDigest: d }), { code: 'STALE_RESULT' }); assert.throws(() => validationIdentity(r, { ...required, profileDigests: [] })); });
test('error envelope does not expose unknown error secrets', () => { assert.equal(JSON.stringify(failure(new Error('secret-token'))).includes('secret-token'), false); assert.equal(failure(new Dev2Error('STALE_BASE', 'Base moved')).error.retry.sameRequest, false); });

test('shared work/action records retain objective and queued input through restart encoding',async()=>{
 const {work,action}=await import('../fixtures/records.mjs');
 const a=action({input:{profileId:'core',expectedGeneration:'9007199254740992'}});
 assert.equal(parseRecord(canonical(a)).input.expectedGeneration,'9007199254740992');
 assert.equal(parseRecord(canonical(work())).objective,'Fixture change');
});
test('success envelope fixes runtime identity without accepting invalid observation times',async()=>{
 const {success}=await import('../../src/contracts/envelope.mjs');const d=bytesDigest('runtime'),runtime={releaseId:d,schemaDigest:d};
 assert.deepEqual(success({workId:'work-1'},runtime,1),{apiVersion:1,ok:true,data:{workId:'work-1'},observedAt:1,runtime});
 assert.throws(()=>success(null,runtime,1.5));
});
