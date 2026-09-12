import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRequiredTests,requiredTypecheck} from '../../src/validation/selection.mjs';
import {controllerDefinition,CONTROLLER_FILES} from '../../src/validation/controller.mjs';
import {sourceManifest} from '../../src/repository/entries.mjs';
const D='sha256:'+'1'.repeat(64),O='sha1:'+'2'.repeat(40);
test('installed selectors reject missing mandatory regression files and always include new tests',()=>{
 const known=['test/core/a.test.mjs'];assert.deepEqual(selectRequiredTests('core',known,[...known,'test/core/new.test.mjs']),[...known,'test/core/new.test.mjs']);
 for(const candidate of [[],['test/core/new.test.mjs'],[...known,'test/core/../outside.test.mjs'],[...known,...known],['test/integration/a.test.mjs']])assert.throws(()=>selectRequiredTests('core',known,candidate));
 assert.throws(()=>selectRequiredTests('integration',[],['test/integration/a.test.mjs']));
});
test('installed compiler covers exact candidate source and ignores candidate include/exclude controls',()=>{
 const installed={compilerOptions:{module:'NodeNext',moduleResolution:'NodeNext',strict:false,checkJs:false}};
 const result=requiredTypecheck('/source',['src/a.mjs','src/contracts/ports.d.ts','tools/check.mjs','test/fixtures/f.mjs','test/core/spec.test.mjs','README.md'],installed);
 assert.equal(result.compilerOptions.strict,true);assert.equal(result.compilerOptions.checkJs,true);assert.equal(result.compilerOptions.noEmit,true);assert.deepEqual(result.files,['/source/src/a.mjs','/source/src/contracts/ports.d.ts','/source/test/fixtures/f.mjs','/source/tools/check.mjs']);assert.deepEqual(result.compilerOptions.typeRoots,['/source/node_modules/@types']);assert.equal(Object.hasOwn(result,'exclude'),false);assert.throws(()=>requiredTypecheck('/source',['src/../escape.mjs'],installed));
});
test('controller identity freezes code and mandatory selector floor separately from candidate test contents',()=>{
 const entries=[...CONTROLLER_FILES,'test/core/a.test.mjs','test/integration/a.test.mjs'].map(path=>({path,mode:'100644',blobOid:O,contentDigest:D,size:1}));const source={treeOid:O,entries,manifestDigest:sourceManifest(entries)},first=controllerDefinition(source);
 const changed=entries.map(e=>e.path==='test/core/a.test.mjs'?{...e,contentDigest:'sha256:'+'3'.repeat(64)}:e);assert.equal(controllerDefinition({...source,entries:changed,manifestDigest:sourceManifest(changed)}).digest,first.digest);
 const removed=entries.filter(e=>e.path!=='tools/validate.mjs');assert.throws(()=>controllerDefinition({...source,entries:removed,manifestDigest:sourceManifest(removed)}));
 const added=[...entries,{path:'test/core/b.test.mjs',mode:'100644',blobOid:O,contentDigest:D,size:1}];assert.notEqual(controllerDefinition({...source,entries:added,manifestDigest:sourceManifest(added)}).digest,first.digest);
});
