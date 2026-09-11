import {failure} from '../../src/contracts/envelopes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextService } from '../../src/repository/context.mjs';
import { canonicalEntries,sourceManifest } from '../../src/repository/entries.mjs';
import { bytesDigest,canonicalJson } from '../../src/contracts/canonical.mjs';
import { Dev2Error } from '../../src/contracts/errors.mjs';
// Core injected providers. Native Git and real files are tested separately.
function world(files=[['a.txt','alpha'],['nested/b.txt','beta']]){
 const retained=new Map(),blobs=new Map(),trees=new Map();let now=1000,current;
 const hash=s=>'sha1:'+bytesDigest(Buffer.from(s)).slice(7,47);
 const binding={repositoryId:'repo',installationId:'install',provider:'fixture',providerRepositoryId:'fixture',remote:'https://fixture.invalid/repo',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:bytesDigest(Buffer.from('policy'))};
 const principal={subject:'caller',issuer:'fixture',audience:'fixture',expiresAt:999999999};
 const policy={enabled:true,denied:new Set(),onPath:null};let remoteCalls=0,blobCalls=0,offline=false;
 function source(input){const entries=canonicalEntries(input.map(([path,content])=>{const b=Buffer.isBuffer(content)?content:Buffer.from(content),blobOid=hash(b.toString('base64'));blobs.set(blobOid,b);return {path,blobOid,contentDigest:bytesDigest(b),mode:'100644',size:b.length};}));const s={treeOid:hash(canonicalJson(entries)),manifestDigest:sourceManifest(entries),entries};trees.set(s.treeOid,s);return s;}
 const start=source(files);current=hash(start.treeOid);const commits=new Map([[current,start]]);
 const repository={async checkBinding(b){if(canonicalJson(b)!==canonicalJson(binding))throw new Dev2Error('FORBIDDEN');},
  async resolve(b){await this.checkBinding(b);remoteCalls++;if(offline)throw new Dev2Error('EXECUTION_UNAVAILABLE');return {head:current,bindingEpoch:binding.bindingEpoch,observedAt:new Date(now).toISOString()};},
  async readCommit(b,commit){await this.checkBinding(b);return {commitOid:commit,parents:[],source:structuredClone(commits.get(commit))};},
  async readTree(tree){return structuredClone(trees.get(tree));},async blob(oid){blobCalls++;return Buffer.from(blobs.get(oid));}};
 const objects={async put(bytes){const d=bytesDigest(bytes);retained.set(d,Buffer.from(bytes));return d;},async get(d){if(!retained.has(d))throw Object.assign(Error('missing'),{code:'ENOENT'});return Buffer.from(retained.get(d));}};
 const authorization={async authorize(p,b,capability,paths=[]){if(!policy.enabled||paths.some(path=>[...policy.denied].some(prefix=>path===prefix||path.startsWith(prefix+'/'))))throw new Dev2Error('FORBIDDEN');if(paths.length&&policy.onPath)policy.onPath(paths);}};
 const options={repository,objects,authorization,tokenKey:Buffer.alloc(32,4),now:()=>now,ttlMs:30000,maxScanBytes:1024};
 return {binding,principal,policy,retained,options,repository,service:new ContextService(options),source,start,
  head:()=>current,remoteCalls:()=>remoteCalls,blobCalls:()=>blobCalls,tick(n=1){now+=n;},offline(value=true){offline=value;},
  advance(input){const s=source(input);current=hash(s.treeOid);commits.set(current,s);return current;}};
}
const pinned=(w,s,queries,maxReturnBytes)=>w.service.read(w.principal,w.binding,s.snapshotId,'pinned',queries,maxReturnBytes);
test('retained snapshot and cursor survive service reconstruction without client conversation or sessions',async()=>{
 const w=world(),snapshot=await w.service.current(w.principal,w.binding);assert.equal(snapshot.commitOid,w.head());assert.match(snapshot.snapshotId,/^s_[a-f0-9]{64}_[A-Za-z0-9_-]{43}$/);
 const first=await pinned(w,snapshot,[{kind:'list',path:'',limit:1}]);assert.equal(first.results[0].complete,false);w.service=new ContextService(w.options);
 const next=await pinned(w,snapshot,[{kind:'list',path:'',limit:1,cursor:first.results[0].nextCursor}]);assert.equal(next.results[0].entries[0].path,'nested');assert.equal(next.results[0].complete,true);
});
test('progressive listing is byte-sorted, bounded and hides denied entries before metadata disclosure',async()=>{
 const files=Array.from({length:300},(_,i)=>['file-'+String(i).padStart(3,'0'),'x']);files.push(['secret/hidden','do-not-disclose'],['visible/nested','allowed']);
 const w=world(files);w.policy.denied.add('secret');const snapshot=await w.service.current(w.principal,w.binding);let cursor,paths=[];
 for(let n=0;n<10;n++){const page=(await pinned(w,snapshot,[{kind:'list',path:'',limit:70,...(cursor?{cursor}:{})}])).results[0];assert.ok(page.entries.length<=70);paths.push(...page.entries.map(e=>e.path));cursor=page.nextCursor;if(page.complete)break;}
 assert.equal(cursor,null);assert.equal(paths.length,301);assert.equal(new Set(paths).size,301);assert.equal(paths.some(p=>p.includes('secret')),false);assert.deepEqual(paths,[...paths].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))));
});
test('file ranges preserve BOM and exact binary offsets and never replace split UTF-8',async()=>{
 const w=world([['utf8','\ufeffA\u03bbZ'],['binary',Buffer.from([0,255,128,3])]]),s=await w.service.current(w.principal,w.binding);
 const file=(await pinned(w,s,[{kind:'file',path:'utf8'}])).results[0];assert.equal(file.content,'\ufeffA\u03bbZ');assert.equal(file.length,7);assert.equal(file.entry.contentDigest,bytesDigest(Buffer.from(file.content)));
 await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'utf8',startByte:5,maxBytes:1}]),{code:'ENCODING_BOUNDARY'});
 const binary=(await pinned(w,s,[{kind:'file',path:'binary',startByte:1,maxBytes:2,encoding:'base64'}])).results[0];assert.equal(binary.content,Buffer.from([255,128]).toString('base64'));assert.equal(binary.offset,1);assert.equal(binary.length,2);assert.equal(binary.truncated,true);
});
test('aggregate response budget and ranges fail explicitly rather than applying silent input truncation',async()=>{
 const w=world([['large','a'.repeat(8000)]]),s=await w.service.current(w.principal,w.binding);
 const r=await pinned(w,s,[{kind:'file',path:'large',maxBytes:8000}],1024);assert.ok(r.returnedBytes<=1024);assert.equal(r.results[0].truncated,true);assert.ok(r.results[0].length>0&&r.results[0].length<8000);
 await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'large',maxBytes:1048577}]),{code:'LIMIT_EXCEEDED'});await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'large',startByte:8001}]),{code:'LIMIT_EXCEEDED'});await assert.rejects(()=>pinned(w,s,[{kind:'list',path:''}],1),{code:'LIMIT_EXCEEDED'});
});
test('search continues across scan boundaries without losing a straddling literal or folding non-ASCII',async()=>{
 const text='a'.repeat(1022)+'NEEDLE'+'a'.repeat(1100)+'needle\n\u0130\u03bb';const w=world([['large',text]]),s=await w.service.current(w.principal,w.binding);let cursor,hits=[];
 for(let n=0;n<10;n++){const r=await pinned(w,s,[{kind:'search',paths:[''],literal:'needle',caseSensitive:false,...(cursor?{cursor}:{})}]);assert.ok(r.scannedBytes<=1024);hits.push(...r.results[0].hits);cursor=r.results[0].nextCursor;if(!cursor)break;}
 assert.equal(cursor,null);assert.deepEqual(hits.map(h=>h.byteOffset),[1022,2128]);assert.equal((await pinned(w,s,[{kind:'search',paths:[''],literal:'i',caseSensitive:false}])).results[0].hits.length,0);
});
test('search file/hit limits return exact continuation including unreturned matching hit',async()=>{
 const w=world(Array.from({length:70},(_,i)=>['f'+String(i).padStart(2,'0'),'hit hit'])),s=await w.service.current(w.principal,w.binding);let cursor,all=[];
 for(let n=0;n<30;n++){const r=await pinned(w,s,[{kind:'search',paths:[''],literal:'hit',maxHits:9,...(cursor?{cursor}:{})}]);assert.ok(r.openedFiles<=64);assert.ok(r.results[0].hits.length<=9);all.push(...r.results[0].hits.map(h=>h.path+':'+h.byteOffset));cursor=r.results[0].nextCursor;if(!cursor)break;}
 assert.equal(cursor,null);assert.equal(all.length,140);assert.equal(new Set(all).size,140);
});
test('known handles and cached blob digests do not bypass subject, binding, expiry or current authorization',async()=>{
 const w=world(),s=await w.service.current(w.principal,w.binding);await assert.rejects(()=>w.service.snapshot({...w.principal,subject:'other'},w.binding,s.snapshotId,'pinned'),{code:'FORBIDDEN'});await assert.rejects(()=>w.service.snapshot(w.principal,{...w.binding,bindingEpoch:'2'},s.snapshotId,'pinned'),{code:'FORBIDDEN'});
 const count=w.blobCalls();w.policy.enabled=false;await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'a.txt'}]),{code:'FORBIDDEN'});assert.equal(w.blobCalls(),count);w.policy.enabled=true;w.tick(30000);await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'a.txt'}]),{code:'CONTEXT_EXPIRED'});
});
test('tampered MAC, missing descriptor and corrupt immutable storage cannot produce a successful read',async()=>{
 const w=world(),s=await w.service.current(w.principal,w.binding),token=s.snapshotId;await assert.rejects(()=>w.service.snapshot(w.principal,w.binding,token.slice(0,-1)+(token.endsWith('A')?'B':'A'),'pinned'),{code:'FORBIDDEN'});
 const key='sha256:'+token.slice(2,66),saved=w.retained.get(key);w.retained.set(key,Buffer.from('{}'));await assert.rejects(()=>pinned(w,s,[{kind:'list',path:''}]),{code:'INTEGRITY_FAILURE'});w.retained.set(key,saved);w.retained.delete(key);await assert.rejects(()=>pinned(w,s,[{kind:'list',path:''}]),{code:'CONTEXT_EXPIRED'});
});
test('cursor is bound to query, snapshot and work generation, not just identical tree bytes',async()=>{
 const w=world(),s=await w.service.current(w.principal,w.binding),query={kind:'list',path:'',limit:1};const r=(await pinned(w,s,[query])).results[0];await assert.rejects(()=>pinned(w,s,[{...query,path:'nested',cursor:r.nextCursor}]),{code:'STALE_CONTEXT'});
 w.tick();const s2=await w.service.current(w.principal,w.binding);assert.notEqual(s.snapshotId,s2.snapshotId);await assert.rejects(()=>pinned(w,s2,[{...query,cursor:r.nextCursor}]),{code:'STALE_CONTEXT'});
 const scope={kind:'work',workId:'work_a',generation:'0'},work=await w.service.readSource(w.principal,w.binding,s.source,scope,[query]);
 for(const changed of [{...scope,workId:'work_b'},{...scope,generation:'1'}])await assert.rejects(()=>w.service.readSource(w.principal,w.binding,s.source,changed,[{...query,cursor:work.results[0].nextCursor}]),{code:'STALE_CONTEXT'});
});
test('pinned reads remain exact during remote outage; current reads neither guess nor mix generations',async()=>{
 const w=world(),s=await w.service.current(w.principal,w.binding);w.offline();const r=await pinned(w,s,[{kind:'file',path:'a.txt'}]);assert.equal(r.results[0].content,'alpha');assert.equal(r.notCurrent,true);await assert.rejects(()=>w.service.snapshot(w.principal,w.binding,s.snapshotId,'current'),{code:'EXECUTION_UNAVAILABLE'});
 w.offline(false);w.advance([['a.txt','changed']]);await assert.rejects(()=>w.service.snapshot(w.principal,w.binding,s.snapshotId,'current'),{code:'STALE_CONTEXT'});assert.equal((await pinned(w,s,[{kind:'file',path:'a.txt'}])).results[0].content,'alpha');
});
test('negative list/search distinguish complete absence and do not leak denied metadata',async()=>{
 const w=world([['secret/name','classified']]);w.policy.denied.add('secret');const s=await w.service.current(w.principal,w.binding);const r=await pinned(w,s,[{kind:'list',path:''},{kind:'search',paths:[''],literal:'classified'}]);assert.equal(r.results[0].complete,true);assert.deepEqual(r.results[0].entries,[]);assert.deepEqual(r.results[1].hits,[]);assert.equal(r.scannedBytes,0);await assert.rejects(()=>pinned(w,s,[{kind:'file',path:'secret/does-not-exist'}]),{code:'FORBIDDEN'});
});
test('diff is exact and authorization-filtered against the requested historical snapshot',async()=>{
 const w=world([['a','old'],['secret','hidden']]),base=await w.service.current(w.principal,w.binding);w.tick();w.advance([['a','new'],['b','added'],['secret','new-secret']]);const next=await w.service.current(w.principal,w.binding);w.policy.denied.add('secret');const r=await pinned(w,next,[{kind:'diff',baseSnapshotId:base.snapshotId}]);assert.deepEqual(r.results[0].changes.map(c=>c.path),['a','b']);assert.equal(r.results[0].changes[1].before,null);assert.equal(r.results[0].complete,true);
});
test('current snapshot records the fresh observation time and stale errors expose authorized head facts',async()=>{
 const w=world(),s=await w.service.current(w.principal,w.binding);w.tick(25);const fresh=await w.service.snapshot(w.principal,w.binding,s.snapshotId,'current');assert.equal(fresh.observedAt,new Date(1025).toISOString());const newHead=w.advance([['new','changed']]);await assert.rejects(()=>w.service.snapshot(w.principal,w.binding,s.snapshotId,'current'),e=>e.code==='STALE_CONTEXT'&&e.facts.currentHead===newHead&&e.facts.expectedHead===s.commitOid);
});
test('revocation while an authorized listing is assembled prevents delivery of cached rows',async()=>{
 const w=world([['a','value']]),s=await w.service.current(w.principal,w.binding);w.policy.onPath=()=>{w.policy.enabled=false;};await assert.rejects(()=>pinned(w,s,[{kind:'list',path:''}]),{code:'FORBIDDEN'});
});

test('path-specific revocation is rechecked for a returned directory witness without revealing hidden children',async()=>{
 const w=world([['directory/allowed','value']]),s=await w.service.current(w.principal,w.binding);w.policy.onPath=paths=>{for(const path of paths)w.policy.denied.add(path);};
 await assert.rejects(()=>pinned(w,s,[{kind:'list',path:''}]),{code:'FORBIDDEN'});
});

test('safe domain facts reach failure envelopes without exposing arbitrary properties, getters or messages',()=>{
 const facts={expectedHead:'sha1:'+'a'.repeat(40),currentHead:'sha256:'+'b'.repeat(64),observedAt:'2026-09-11T00:00:00.000Z'};
 const error=new Dev2Error('STALE_CONTEXT','secret internal diagnostic',facts),out=failure(error);assert.deepEqual(out.error.facts,facts);assert.equal(out.error.message,'STALE_CONTEXT');
 assert.throws(()=>new Dev2Error('STALE_CONTEXT','x',{...facts,token:'secret'}));assert.throws(()=>new Dev2Error('STALE_CONTEXT','x',{currentHead:'credential'}));assert.throws(()=>{error.facts={token:'secret'};});
 let called=false;assert.throws(()=>new Dev2Error('STALE_CONTEXT','x',{get currentHead(){called=true;return facts.currentHead;}}));assert.equal(called,false);
 const unknown=Object.assign(Error('secret'),{facts});assert.deepEqual(failure(unknown).error.facts,{});
});
