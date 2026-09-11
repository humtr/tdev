import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, parseRecord, recordDigest } from '../../src/contracts/canonical.mjs';
import { revision, nextRevision, oid, digest, capacity, newId } from '../../src/contracts/identity.mjs';
import { failure } from '../../src/contracts/envelopes.mjs';
import { Dev2Error } from '../../src/contracts/errors.mjs';
import { fixture, fakeRef } from '../fixtures/deterministic.mjs';

test('canonical vectors: lexical integer keys, -0 and domain separation', () => {
  const v = {'2':2,z:'x',a:[true,null,-0],'10':10};
  assert.equal(canonicalJson(v), '{"10":10,"2":2,"a":[true,null,0],"z":"x"}');
  assert.equal(recordDigest('dev2.fixture.v1',v),'sha256:4416ef94d22e649e6a2b1cda29ddbd9c0925ba2382eea4d344b8448fbe879dd0');
  assert.notEqual(recordDigest('dev2.request.v1',v),recordDigest('dev2.fixture.v1',v));
});
test('canonical scalar strings, no normalization, escaping and integer boundaries', () => {
  const v={c:'\u00e9',b:'e\u0301',a:'\ud55c\uae00'};
  assert.equal(recordDigest('dev2.fixture.v1',v),'sha256:a05d69110e0e93703f177404a616543422a82946df3289d7c087492e2a239644');
  assert.equal(canonicalJson([Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER,'\n\\"']), '[9007199254740991,-9007199254740991,"\\n\\\\\\\""]');
  assert.equal(canonicalJson({'\ue000':1,'\ud83d\ude00':2}),'{"\ud83d\ude00":2,"\ue000":1}');
});
test('canonical rejects non-JSON, sparse/accessor properties and cycles without evaluating getters', () => {
  const cycle={}; cycle.self=cycle; let called=false;
  const getter=Object.defineProperty({},'x',{enumerable:true,get(){called=true;return 1;}});
  for (const v of [undefined,NaN,Infinity,0.1,9007199254740992,1n,new Date(),[ , ],cycle,getter,'\ud800',{['\udfff']:0},Symbol(),()=>0])
    assert.throws(()=>canonicalJson(v));
  assert.equal(called,false);
});
test('strict parser rejects duplicate escaped/nested keys, malformed UTF8 and syntax', () => {
  for (const s of ['{"x":1,"x":2}','{"x":1,"\\u0078":2}','{"a":{"x":1,"x":2}}','[1,]','01','true false','{"__proto__":0,"__proto__":1}','"\\ud800"','1e999','0.5','9007199254740992'])
    assert.throws(()=>parseRecord(s),s);
  assert.throws(()=>parseRecord(Uint8Array.from([0xff])));
  assert.throws(()=>parseRecord('[]',1));
  assert.throws(()=>parseRecord('['.repeat(130)+']'.repeat(130)));
  const parsed=parseRecord('{"__proto__":{"polluted":true},"a":[1,true,null,"a\\\"b"]}');
  assert.equal(Object.getPrototypeOf(parsed),null);
  assert.equal({}.polluted,undefined);
  assert.equal(canonicalJson(parsed),'{"__proto__":{"polluted":true},"a":[1,true,null,"a\\\"b"]}');
});
test('unsigned revisions are exact across Number precision boundary and overflow fails', () => {
  assert.equal(nextRevision('9007199254740991'),'9007199254740992');
  assert.equal(revision('18446744073709551615'),'18446744073709551615');
  for (const v of ['01','-1','18446744073709551616',1,'1.0']) assert.throws(()=>revision(v));
  assert.throws(()=>nextRevision('18446744073709551615'));
});
test('tagged object identities and scalable capacity do not encode eight slots', () => {
  assert.equal(capacity(),8);
  for (const c of [1,8,16,32,1024]) assert.equal(capacity(c),c);
  for (const c of [0,-1,1.5,NaN,'8']) assert.throws(()=>capacity(c));
  for (const v of ['sha1:'+'a'.repeat(40),'sha256:'+'a'.repeat(64)]) assert.equal(oid(v),v);
  assert.throws(()=>oid('a'.repeat(40))); assert.throws(()=>digest('sha1:'+'a'.repeat(40)));
  const ids=Array.from({length:32},newId); assert.equal(new Set(ids).size,32);
  for (const id of ids) assert.match(id,/^[a-f0-9]{32}$/);
});
test('deterministic independent fixtures and CAS test adapter', async () => {
  const a=fixture(),b=fixture(); assert.equal(a.nextId(),b.nextId()); a.advance(10); assert.equal(b.clock.now(),0);
  const ref=fakeRef('base'); assert.equal(await ref.cas('base','next'),true); assert.equal(await ref.cas('base','other'),false);
  assert.equal(await ref.read(),'next');
});
test('failure envelope never leaks provider exception text', () => {
  const f=failure(new Error('secret-token-value')); assert.ok(!JSON.stringify(f).includes('secret-token-value'));
  assert.equal(failure(new Dev2Error('STALE_BASE')).error.code,'STALE_BASE');
});

test('wire numbers cannot round fractional or underflowed input into an integer', () => {
  for(const raw of ['1.00000000000000001','1e-999','9007199254740990.1','1e99999','-1e-999']) assert.throws(()=>parseRecord(raw));
  for(const [raw,value] of [['1.0',1],['10e-1',1],['1e3',1000],['-0.0e999',0],['9007199254740991.0',9007199254740991]]) assert.equal(parseRecord(raw),value);
});
