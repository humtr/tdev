import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDigest,canonicalJson} from '../../src/contracts/canonical.mjs';
test('same payload cannot cross canonical record-purpose domains',()=>{const value={path:'\u00e9',count:8};assert.notEqual(recordDigest('dev2.request.v1',value),recordDigest('dev2.release-manifest.v1',value));assert.equal(recordDigest('dev2.request.v1',value),recordDigest('dev2.request.v1',{count:8,path:'\u00e9'}));assert.notEqual(canonicalJson(value),canonicalJson({path:'e\u0301',count:8}));});
