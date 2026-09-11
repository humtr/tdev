import test from 'node:test';
import assert from 'node:assert/strict';
import {GitRepository} from '../../src/repository/git.mjs';
// Deterministic command port injection: no filesystem or Git executable required.
test('independent cache eviction cannot invalidate a bounded in-flight object read',async()=>{
 const repository=new GitRepository({directory:'/virtual/dev2-objects',executable:'/virtual/git',environment:{},bindings:()=>[],verifyRemote:async()=>{},maxBlobBytes:2048,maxSourceBytes:2048});
 repository.init=async()=>{};
 const first=Buffer.alloc(512,1),second=Buffer.alloc(512,2),other=Buffer.alloc(1900,3);
 const a=repository.objectOid('blob',first),b=repository.objectOid('blob',second),c=repository.objectOid('blob',other);
 repository.cache(a,{type:'blob',bytes:first});
 const entered=Promise.withResolvers(),release=Promise.withResolvers();
 repository.command=async()=>{entered.resolve();await release.promise;return {code:0,stdout:Buffer.concat([Buffer.from(repository.raw(b)+' blob '+second.length+'\n'),second,Buffer.from('\n')])};};
 const reading=repository.readObjects([a,b]);await entered.promise;
 repository.cache(c,{type:'blob',bytes:other});assert.equal(repository.objects.has(a),false);release.resolve();
 const objects=await reading;assert.deepEqual(objects.map(v=>v.bytes),[first,second]);
 objects[1].bytes[0]=9;assert.equal(repository.objects.get(b).bytes[0],2);
});
