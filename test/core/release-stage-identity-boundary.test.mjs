import test from 'node:test';
import assert from 'node:assert/strict';
import {stagedReleaseId,releaseIdFromStage} from '../../src/release/manifest.mjs';
test('activation stage identity round trips only canonical lowercase 64-hex values',()=>{const id='sha256:'+'ab'.repeat(32);assert.equal(releaseIdFromStage(stagedReleaseId(id)),id);for(const wrong of [id,'AB'.repeat(32),'a'.repeat(63),'a'.repeat(65),'g'.repeat(64),' '+'a'.repeat(64)])assert.throws(()=>releaseIdFromStage(wrong),{code:'INVALID_ARGUMENT'});});
