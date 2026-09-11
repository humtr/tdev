import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,chmod,lstat,symlink,mkdir,rm,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { GitRepository } from '../../src/repository/git.mjs';
import { sourceManifest,gitlinkDigest } from '../../src/repository/entries.mjs';
import { editTree,composeTrees,contentBytes } from '../../src/candidate/tree.mjs';
import { materialize,inspectMaterialization } from '../../src/candidate/materialize.mjs';
import { gitWorld } from '../fixtures/git-world.mjs';
const expected=e=>({blobDigest:e.contentDigest,mode:e.mode});
const put=(path,content,expectedEntry='absent',mode='100644')=>({kind:'put',path,expectedEntry,mode,content,encoding:'utf8'});
for(const format of ['sha1','sha256'])test('real '+format+' bare Git object roundtrip, cache isolation, exact child freeze and fresh ref',async()=>{
 const w=await gitWorld(undefined,format);try{
  assert.equal((await w.repository.resolve(w.binding)).head,w.baseHead);
  const base=await w.repository.readCommit(w.binding,w.baseHead);assert.deepEqual(base.source,w.source);assert.deepEqual(base.parents,[]);
  const value=await w.repository.readBlob(w.binding,base.source.entries[0].blobOid);assert.equal(value.toString(),'alpha\n');value[0]=0;
  assert.equal((await w.repository.readBlob(w.binding,base.source.entries[0].blobOid)).toString(),'alpha\n');
  const meta={author:'Fixture <fixture@example.invalid>',committer:'Fixture <fixture@example.invalid>',timestamp:1700000012345,message:'exact source'};
  const next=await w.repository.freezeCommit(w.baseHead,w.source,meta,'result1');assert.equal(await w.repository.freezeCommit(w.baseHead,w.source,meta,'result1'),next);
  const commit=await w.repository.readCommit(w.binding,next);assert.deepEqual(commit.parents,[w.baseHead]);assert.equal(commit.source.treeOid,w.source.treeOid);
  assert.equal(await w.repository.isAncestor(w.binding,w.baseHead,next),true);assert.equal(await w.repository.isAncestor(w.binding,next,w.baseHead),false);
  await assert.rejects(()=>w.repository.readTree(next),{code:'INTEGRITY_FAILURE'});
  assert.equal((await w.repository.command(['fsck','--strict','--no-reflogs'])).code,0);
  assert.equal((await w.repository.resolve(w.binding)).head,w.baseHead,'freezing is not integration');
 }finally{await w.close();}
});
test('safe raw filename ordering, executable modes, binary bytes, no index/hooks/filter side effects',async()=>{
 const w=await gitWorld([{path:'dir.x',content:'dot'},{path:'dir/file',content:Buffer.from([0,255,1])},{path:'odd\tname\n',content:'name'},{path:'run.sh',mode:'100755',content:'#!/bin/sh\n'},{path:'\u00e9.txt',content:'unicode'}]);try{
  const source=(await w.repository.readCommit(w.binding,w.baseHead)).source;assert.deepEqual(source,w.source);
  const rebuilt=await w.repository.writeTree([...source.entries].reverse());assert.equal(rebuilt.treeOid,source.treeOid);
  await assert.rejects(()=>lstat(join(w.repository.directory,'index')),{code:'ENOENT'});
  const broken={...source.entries[0],contentDigest:'sha256:'+'0'.repeat(64)};await assert.rejects(()=>w.repository.writeTree([broken]),{code:'INTEGRITY_FAILURE'});
  const changed=await editTree(w.repository,source,[put('new\tfile','bytes')]);assert.notEqual(changed.treeOid,source.treeOid);
 }finally{await w.close();}
});
test('all edits are atomic against one generation; invalid sibling writes no candidate object',async()=>{
 const w=await gitWorld();try{const source=(await w.repository.readCommit(w.binding,w.baseHead)).source;let puts=0;
  const objects={blob:n=>w.repository.blob(n),writeTree:e=>w.repository.writeTree(e),putBlob:b=>{puts++;return w.repository.putBlob(b);}};
  await assert.rejects(()=>editTree(objects,source,[put('new','ok'),{kind:'delete',path:'absent',expectedEntry:'absent'}]),{code:'ENTRY_CONFLICT'});assert.equal(puts,0);
  await assert.rejects(()=>editTree(objects,source,[put('a.txt','wrong','absent')]),{code:'ENTRY_CONFLICT'});
  await assert.rejects(()=>editTree(objects,source,[put('nested','file')]),{code:'ENTRY_CONFLICT'});
  await assert.rejects(()=>editTree(objects,source,[put('new','one'),put('new','two')]),{code:'ENTRY_CONFLICT'});
  for(const path of ['../escape','/escape','dir/../x','a//b','.git/config','dir/.Git/config','a\\b','e\u0301.txt'])await assert.rejects(()=>editTree(objects,source,[put(path,'x')]));
  assert.equal(puts,0);assert.equal(sourceManifest(source.entries),source.manifestDigest);
 }finally{await w.close();}
});
test('put, move, delete and unique exact edit preserve exact old entry expectations',async()=>{
 const w=await gitWorld();try{const source=(await w.repository.readCommit(w.binding,w.baseHead)).source;const a=source.entries.find(e=>e.path==='a.txt'),b=source.entries.find(e=>e.path==='nested/b.txt');
  const next=await editTree(w.repository,source,[{kind:'exact_edit',path:'a.txt',expectedEntry:expected(a),oldText:'alpha',newText:'ALPHA'},{kind:'move',from:b.path,to:'moved.txt',expectedEntry:expected(b),expectedDestination:'absent'},put('new.bin',Buffer.from([0,255]).toString('base64'))].map(e=>e.path==='new.bin'?{...e,encoding:'base64'}:e));
  assert.equal((await w.repository.blob(next.entries.find(e=>e.path==='a.txt').blobOid)).toString(),'ALPHA\n');assert.ok(next.entries.some(e=>e.path==='moved.txt'));assert.ok(!next.entries.some(e=>e.path===b.path));
  const deleted=await editTree(w.repository,next,[{kind:'delete',path:'moved.txt',expectedEntry:expected(b)}]);assert.equal(deleted.entries.length,2);
  const repeated=await editTree(w.repository,source,[put('a.txt','xx',expected(a))]);await assert.rejects(()=>editTree(w.repository,repeated,[{kind:'exact_edit',path:'a.txt',expectedEntry:expected(repeated.entries[0]),oldText:'x',newText:'y'}]),{code:'ENTRY_CONFLICT'});
  assert.throws(()=>contentBytes('Zg=','base64'));assert.throws(()=>contentBytes('Zh==','base64'));assert.equal(contentBytes('Zg==','base64').toString(),'f');
 }finally{await w.close();}
});
test('eight independent candidates and private materializations have no shared writable checkout',async()=>{
 const w=await gitWorld();try{const source=(await w.repository.readCommit(w.binding,w.baseHead)).source;
  const candidates=await Promise.all(Array.from({length:8},(_,i)=>editTree(w.repository,source,[put('task-'+i+'.txt','value-'+i)])));
  assert.equal(new Set(candidates.map(c=>c.treeOid)).size,8);assert.equal(source.entries.length,2);
  const roots=await Promise.all(candidates.map((c,i)=>materialize(w.repository,c,join(w.root,'attempt-'+i,'source'))));
  const stats=await Promise.all(roots.map(p=>lstat(join(p,'a.txt'))));assert.equal(new Set(stats.map(s=>s.ino)).size,8);assert.ok(stats.every(s=>s.nlink===1));
  await writeFile(join(roots[0],'a.txt'),'changed');await assert.rejects(()=>inspectMaterialization(candidates[0],roots[0]),{code:'INTEGRITY_FAILURE'});
  for(let i=1;i<8;i++)assert.equal(await inspectMaterialization(candidates[i],roots[i]),candidates[i].manifestDigest);
  for(const root of roots)await assert.rejects(()=>lstat(join(root,'.git')),{code:'ENOENT'});
  await assert.rejects(()=>materialize(w.repository,candidates[1],roots[1]),{code:'ENTRY_CONFLICT'});
 }finally{await w.close();}
});
test('disjoint stale recomposition preserves newer entries; touched content/mode and topology conflict',async()=>{
 const w=await gitWorld();try{const base=(await w.repository.readCommit(w.binding,w.baseHead)).source,a=base.entries[0];
  const left=await editTree(w.repository,base,[put('left','L')]),right=await editTree(w.repository,base,[put('right','R')]);
  const result=await w.repository.writeTree(composeTrees(base,left,right));assert.ok(result.entries.some(e=>e.path==='left'));assert.ok(result.entries.some(e=>e.path==='right'));
  const changed=await editTree(w.repository,base,[put(a.path,'mine',expected(a))]),conflict=await editTree(w.repository,base,[put(a.path,'theirs',expected(a))]);
  assert.throws(()=>composeTrees(base,changed,conflict),{code:'INTEGRATION_CONFLICT'});
  const modeChange=await editTree(w.repository,base,[put(a.path,'alpha\n',expected(a),'100755')]);assert.throws(()=>composeTrees(base,changed,modeChange),{code:'INTEGRATION_CONFLICT'});
  const leaf=await editTree(w.repository,base,[put('newdir','leaf')]),nested=await editTree(w.repository,base,[put('newdir/child','nested')]);assert.throws(()=>composeTrees(base,leaf,nested),{code:'INTEGRATION_CONFLICT'});
 }finally{await w.close();}
});
test('internal symlinks remain typed; escaping, cyclic, metadata and prefix aliases never materialize',async()=>{
 const w=await gitWorld();try{const base=(await w.repository.readCommit(w.binding,w.baseHead)).source;
  const safe=await editTree(w.repository,base,[put('link','nested/b.txt','absent','120000')]);const path=await materialize(w.repository,safe,join(w.root,'safe','source'));assert.equal((await readFile(join(path,'link'))).toString(),'beta\n');assert.equal(await inspectMaterialization(safe,path),safe.manifestDigest);
  for(const target of ['../outside','/etc/passwd','.git/config','x/../../outside','link']){const bad=await editTree(w.repository,base,[put('link',target,'absent','120000')]);await assert.rejects(()=>materialize(w.repository,bad,join(w.root,'bad','source')),{code:'FORBIDDEN'});}
  const cycle=await editTree(w.repository,base,[put('x','y','absent','120000'),put('y','x','absent','120000')]);await assert.rejects(()=>materialize(w.repository,cycle,join(w.root,'cycle','source')),{code:'FORBIDDEN'});
  await mkdir(join(w.root,'real'));await symlink(join(w.root,'real'),join(w.root,'alias'));await assert.rejects(()=>materialize(w.repository,base,join(w.root,'alias','source')),{code:'FORBIDDEN'});
  await chmod(join(path,'a.txt'),0o755);await assert.rejects(()=>inspectMaterialization(safe,path),{code:'INTEGRITY_FAILURE'});
 }finally{await w.close();}
});
test('gitlink metadata is inspectable without pretending a commit is a blob; unresolved execution fails',async()=>{
 const w=await gitWorld();try{const base=(await w.repository.readCommit(w.binding,w.baseHead)).source;
  const link={path:'submodule',mode:'160000',blobOid:w.baseHead,contentDigest:gitlinkDigest(w.baseHead),size:0};
  const tree=await w.repository.writeTree([...base.entries,link]);w.repository.trees.clear();const read=await w.repository.readTree(tree.treeOid);assert.deepEqual(read.entries.find(e=>e.path==='submodule'),link);
  await assert.rejects(()=>materialize(w.repository,read,join(w.root,'sub','source')),{code:'UNSUPPORTED_REPOSITORY_FEATURE'});
  const lfs=await editTree(w.repository,base,[put('large','version https://git-lfs.github.com/spec/v1\noid sha256:'+'0'.repeat(64)+'\nsize 1\n')]);await assert.rejects(()=>materialize(w.repository,lfs,join(w.root,'lfs','source')),{code:'UNSUPPORTED_REPOSITORY_FEATURE'});
 }finally{await w.close();}
});
test('pinned object reads survive provider outage, but current resolve and unapproved bindings fail',async()=>{
 const w=await gitWorld();try{await w.repository.readCommit(w.binding,w.baseHead);w.repository.options.verifyRemote=async()=>{throw Error('provider unavailable');};
  assert.equal((await w.repository.readBlob(w.binding,w.source.entries[0].blobOid)).toString(),'alpha\n');await assert.rejects(()=>w.repository.resolve(w.binding),/provider unavailable/);
  await assert.rejects(()=>w.repository.readBlob({...w.binding,remote:'/unapproved'},w.source.entries[0].blobOid),{code:'FORBIDDEN'});
  const noFixture=new GitRepository({...w.options(join(w.root,'production.git')),allowLocalFixture:false});await assert.rejects(()=>noFixture.resolve(w.binding),{code:'FORBIDDEN'});
 }finally{await w.close();}
});

test('UTF-8 BOM in a Git filename is identity, never decoder metadata',async()=>{
 const w=await gitWorld([{path:'\ufeffname.txt',content:'BOM path'}]);try{const actual=(await w.repository.readCommit(w.binding,w.baseHead)).source;assert.deepEqual(actual,w.source);}finally{await w.close();}
});
test('nested tree corruption is rejected even if root tree and leaf blob bytes remain intact',async()=>{
 const w=await gitWorld();try{
  const listing=await w.remote.command(['ls-tree',w.remote.raw(w.source.treeOid),'nested']);const raw=listing.stdout.toString().split(/\s+/)[2];
  const [nested]=await w.remote.readObjects([w.remote.tagged(raw)]);const changed=Buffer.from(nested.bytes);changed[changed.indexOf(Buffer.from('b.txt'))]=99;
  const {deflateSync}=await import('node:zlib');await chmod(join(w.remote.directory,'objects',raw.slice(0,2),raw.slice(2)),0o600);await writeFile(join(w.remote.directory,'objects',raw.slice(0,2),raw.slice(2)),deflateSync(Buffer.concat([Buffer.from('tree '+changed.length+'\0'),changed])));
  w.remote.objects.clear();w.remote.cacheBytes=0;w.remote.trees.clear();await assert.rejects(()=>w.remote.readTree(w.source.treeOid),{code:'INTEGRITY_FAILURE'});
 }finally{await w.close();}
});
test('two empty candidates cannot replace the same reserved destination; stopped scratch rebuild is exact',async()=>{
 const w=await gitWorld([]);try{
  const path=join(w.root,'attempt','source');const outcomes=await Promise.allSettled([materialize(w.remote,w.source,path),materialize(w.remote,w.source,path)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'ENTRY_CONFLICT');
  assert.equal(await inspectMaterialization(w.source,path),w.source.manifestDigest);await rm(path,{recursive:true});await materialize(w.remote,w.source,path);assert.equal(await inspectMaterialization(w.source,path),w.source.manifestDigest);
 }finally{await w.close();}
});
