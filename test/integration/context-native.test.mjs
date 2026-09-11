import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { gitWorld } from '../fixtures/git-world.mjs';
import { ContextService } from '../../src/repository/context.mjs';
import { bytesDigest } from '../../src/contracts/canonical.mjs';
import { editTree } from '../../src/candidate/tree.mjs';

// Actual native Git + bounded context + edits. Immutable descriptor storage and
// authorization are explicit test ports; this is not OAuth or broker admission.
test('10,000 native Git files support progressive unknown-context discovery and exact isolated change', {timeout:120000}, async t=>{
 const w=await gitWorld([]);try{
  const count=10000,parts=[Buffer.from('commit '+w.binding.ref+'\ncommitter Fixture <fixture@example.invalid> 1700000000 +0000\ndata 14\nmedium fixture\nfrom '+w.remote.raw(w.baseHead)+'\n')];
  let sourceBytes=0;
  for(let i=0;i<count;i++){
   const path='group-'+String(Math.floor(i/100)).padStart(3,'0')+'/file-'+String(i).padStart(5,'0')+'.mjs';
   const body=Buffer.from('export const id = '+i+'; // '+(i===7312?'unique_marker_c819e5':'ordinary module')+'\n');sourceBytes+=body.length;
   parts.push(Buffer.from('M 100644 inline '+path+'\ndata '+body.length+'\n'),body,Buffer.from('\n'));
  }
  parts.push(Buffer.from('\ndone\n'));
  const imported=await w.remote.command(['fast-import','--quiet','--date-format=raw','--done'],Buffer.concat(parts),4096);assert.equal(imported.code,0);
  const retained=new Map();
  const objects={async put(bytes){const key=bytesDigest(bytes);retained.set(key,Buffer.from(bytes));return key;},async get(key){assert.ok(retained.has(key));return Buffer.from(retained.get(key));}};
  const principal={subject:'fixture',issuer:'fixture',audience:'fixture',expiresAt:4102444800000};
  const authorization={async authorize(p,b,capability,paths=[]){assert.equal(p.subject,'fixture');assert.equal(b.repositoryId,w.binding.repositoryId);assert.ok(paths.every(path=>!path.includes('.git')));}};
  const options={repository:w.repository,objects,authorization,tokenKey:Buffer.alloc(32,9),now:()=>1700000000000};
  const context=new ContextService(options),start=performance.now(),snapshot=await context.current(principal,w.binding),coldMs=performance.now()-start;
  assert.equal(snapshot.source.entries.length,count);assert.equal(snapshot.notCurrent,false);
  let calls=0,returned=0;
  const read=async queries=>{calls++;const r=await context.read(principal,w.binding,snapshot.snapshotId,'pinned',queries);assert.ok(r.returnedBytes<=262144);returned+=r.returnedBytes;return r;};
  const root=await read([{kind:'list',path:'',limit:128}]);assert.equal(root.results[0].entries.length,100);assert.ok(root.results[0].entries.every(e=>e.kind==='directory'));
  const found=await read([{kind:'search',paths:['group-073'],literal:'unique_marker_c819e5',maxHits:1}]);assert.equal(found.results[0].hits.length,1);
  const path=found.results[0].hits[0].path,old=(await read([{kind:'file',path}])).results[0];assert.equal(path,'group-073/file-07312.mjs');
  const changed=await editTree(w.repository,snapshot.source,[{kind:'exact_edit',path,expectedEntry:{blobDigest:old.entry.contentDigest,mode:old.entry.mode},oldText:'id = 7312',newText:'id = 7313'}]);
  assert.notEqual(changed.treeOid,snapshot.source.treeOid);assert.equal(changed.entries.length,count);
  const changedEntry=changed.entries.find(e=>e.path===path);assert.equal((await w.repository.blob(changedEntry.blobOid)).toString().includes('id = 7313'),true);
  const other=changed.entries.filter(e=>e.path!==path);assert.deepEqual(other,snapshot.source.entries.filter(e=>e.path!==path));
  const newContext=new ContextService(options);
  const resumed=await newContext.snapshot(principal,w.binding,snapshot.snapshotId,'pinned');assert.equal(resumed.source.manifestDigest,snapshot.source.manifestDigest);
  const fresh=await context.snapshot(principal,w.binding,snapshot.snapshotId,'current');assert.equal(fresh.commitOid,snapshot.commitOid);
  assert.ok(returned<sourceBytes/2,'Progressive returned context must remain below the full source fixture');
  t.diagnostic(JSON.stringify({scope:'one native module integration observation; not baseline superiority or ChatGPT evidence',files:count,sourceBytes,contextCalls:calls,returnedBytes:returned,coldContextMs:Math.round(coldMs),gitCommands:w.repository.commandCount,changedTree:changed.treeOid,base:snapshot.commitOid}));
 }finally{await w.close();}
});
