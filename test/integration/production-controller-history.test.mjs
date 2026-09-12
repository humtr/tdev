import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTROLLER_FILES,PRODUCTION_CONTROLLER_FILES,controllerDefinition} from '../../src/validation/controller.mjs';
import {sourceManifest} from '../../src/repository/entries.mjs';
import {recordDigest} from '../../src/contracts/canonical.mjs';
const D='sha256:'+'1'.repeat(64),O='sha1:'+'2'.repeat(40);
function source(paths){const entries=[...new Set([...paths,'test/core/required.test.mjs','test/integration/required.test.mjs'])].sort().map(path=>({path,mode:'100644',blobOid:O,contentDigest:D,size:1}));return {treeOid:O,entries,manifestDigest:sourceManifest(entries)};}
test('legacy approved controller digest is stable; production adds finite build inputs without relabeling history',()=>{const legacy=controllerDefinition(source(CONTROLLER_FILES));assert.deepEqual(legacy.definition.files.map(e=>e.path),CONTROLLER_FILES);assert.equal(legacy.digest,recordDigest('dev2.trusted-controller.v1',{schemaVersion:1,files:CONTROLLER_FILES.map(path=>({path,contentDigest:D,size:1})),tests:{core:['test/core/required.test.mjs'],integration:['test/integration/required.test.mjs']}}));const production=controllerDefinition(source([...PRODUCTION_CONTROLLER_FILES,'src/execution/production-runner.mjs']));assert.deepEqual(production.definition.files.map(e=>e.path),PRODUCTION_CONTROLLER_FILES);assert.notEqual(production.digest,legacy.digest);assert.throws(()=>controllerDefinition(source([...CONTROLLER_FILES,'src/execution/production-runner.mjs'])),{code:'INTEGRITY_FAILURE'});});
