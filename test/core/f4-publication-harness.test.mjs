import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {F4_SCOPE,researchBinding,classifyPublication} from '../../bench/f4-publication-harness.mjs';

const binding={installationId:'i',repositoryId:'github-1322208918',providerRepositoryId:'1322208918',bindingEpoch:'1',provider:'github',remote:'https://github.com/humtr/tdev.git',ref:'refs/heads/dev-2',policyDigest:'sha256:'+'a'.repeat(64)};

test('F4 scope is fixed off canonical and current policy is projected',()=>{const policy='sha256:'+'b'.repeat(64),value=researchBinding(binding,policy);assert.equal(value.ref,'refs/heads/research/f4-live-20260914-a1');assert.equal(value.policyDigest,policy);assert.notEqual(value.ref,binding.ref);assert.ok(!value.ref.startsWith('refs/heads/dev2-exec/'));assert.throws(()=>researchBinding({...binding,providerRepositoryId:'1'},policy),{code:'FORBIDDEN'});});

test('F4 publication reconciliation distinguishes success, no-effect, stale and foreign',()=>{const H='sha1:'+'1'.repeat(40),C='sha1:'+'2'.repeat(40),D='sha1:'+'3'.repeat(40);assert.deepEqual(classifyPublication({sendKind:'sent',head:C,expectedHead:H,commitOid:C}),{kind:'integrated',relation:'commit_or_descendant'});assert.deepEqual(classifyPublication({sendKind:'uncertain',head:H,expectedHead:H,commitOid:C}),{kind:'no_effect_after_uncertain',relation:'expected_head'});assert.deepEqual(classifyPublication({sendKind:'sent',head:H,expectedHead:H,commitOid:C}),{kind:'no_effect_after_sent',relation:'expected_head'});assert.deepEqual(classifyPublication({sendKind:'uncertain',head:D,expectedHead:H,commitOid:C,expectedAncestor:true}),{kind:'stale',relation:'other_expected_descendant'});assert.deepEqual(classifyPublication({sendKind:'uncertain',head:D,expectedHead:H,commitOid:C,commitAncestor:true,expectedAncestor:true}),{kind:'integrated',relation:'commit_or_descendant'});assert.deepEqual(classifyPublication({sendKind:'uncertain',head:D,expectedHead:H,commitOid:C}),{kind:'foreign',relation:'foreign'});});

test('F4 fixed identity cannot be caller-selected',()=>{assert.equal(F4_SCOPE.repositoryId,'github-1322208918');assert.equal(F4_SCOPE.providerRepositoryId,'1322208918');assert.equal(F4_SCOPE.canonicalRef,'refs/heads/dev-2');assert.equal(F4_SCOPE.ref,'refs/heads/research/f4-live-20260914-a1');});

test('F4 operator harness does not require runtime/native or jose bootstrap',()=>{const source=readFileSync(new URL('../../bench/f4-publication-harness.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/runtime\/native\.mjs/);assert.doesNotMatch(source,/from ['\"]jose['\"]/);assert.match(source,/privateBytes/);});

test('F4 operator separates fresh policy authority from installed transport policy',()=>{const source=readFileSync(new URL('../../bench/f4-publication-harness.mjs',import.meta.url),'utf8');assert.match(source,/authority-policy-digest/);assert.match(source,/authority-binding-epoch/);assert.match(source,/Installed binding epoch differs from current authority/);assert.doesNotMatch(source,/currentPolicyDigest=binding\.policyDigest/);});

test('F4 cleanup confirmation preserves an authoritative null head',()=>{const source=readFileSync(new URL('../../bench/f4-publication-harness.mjs',import.meta.url),'utf8');assert.match(source,/confirmationHead:cleanupConfirmation\?cleanupConfirmation\.head:observed\.head/);assert.doesNotMatch(source,/cleanupConfirmation\?\.head\?\?observed\.head/);});
