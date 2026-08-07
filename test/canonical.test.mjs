import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalClone,
  canonicalJson,
  digest,
  strictJsonParse,
} from '../src/canonical.mjs';

function errorCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('strict JSON rejects duplicate members, unsafe numbers, malformed UTF-8, and bounds', () => {
  errorCode(() => strictJsonParse('{"a":1,"a":2}'), 'duplicate_json_member');
  errorCode(() => strictJsonParse('{"n":9007199254740992}'), 'unsafe_json_number');
  errorCode(() => strictJsonParse('{"n":1.5}'), 'unsafe_json_number');
  errorCode(() => strictJsonParse(Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])), 'invalid_utf8');
  errorCode(() => strictJsonParse('[[[0]]]', { maxDepth: 2 }), 'json_limit_exceeded');
});

test('strict JSON creates pollution-safe dictionaries and canonical JSON is stable', () => {
  const parsed = strictJsonParse('{"__proto__":{"polluted":true},"b":2,"a":1}');
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.hasOwn(parsed, '__proto__'), true);
  assert.equal({}.polluted, undefined);
  assert.equal(canonicalJson(parsed), '{"__proto__":{"polluted":true},"a":1,"b":2}');
  assert.equal(digest(parsed), digest(strictJsonParse('{"a":1,"b":2,"__proto__":{"polluted":true}}')));
});

test('canonical JSON rejects unsupported or ambiguous values', () => {
  errorCode(() => canonicalJson({ value: undefined }), 'undefined_value');
  errorCode(() => canonicalJson({ value: 1.25 }), 'unsafe_number');
  errorCode(() => canonicalJson([, 1]), 'sparse_array');
  errorCode(() => canonicalJson({ value: '\ud800' }), 'unpaired_surrogate');
});

test('strict JSON options fail closed and internal canonical cloning is not capped by ingress bytes', () => {
  errorCode(() => strictJsonParse('{}', { ignored: 1 }), 'unexpected_keys');
  errorCode(() => strictJsonParse('{}', { maxDepth: 0 }), 'invalid_integer');
  errorCode(() => strictJsonParse('{"value":"\ud800"}'), 'unpaired_surrogate');

  const value = { payload: 'x'.repeat((8 * 1024 * 1024) + 1) };
  const cloned = canonicalClone(value);
  assert.equal(Object.getPrototypeOf(cloned), null);
  assert.equal(cloned.payload, value.payload);
});
