import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gitWorld} from '../fixtures/git-world.mjs';
import {Ledger} from '../../src/storage/ledger.mjs';
import {DurableGitSender} from '../../src/integration/sender.mjs';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
const python=execFileSync('which',['python3'],{encoding:'utf8'}).trim();
async function fixture(){
 const w=await gitWorld();await w.repository.readCommit(w.binding,w.baseHead);
 const ledger=new Ledger(join(w.root,'ledger.sqlite'),w.binding),root=join(w.root,'senders'),config=join(w.root,'sender.json');await mkdir(root);
 await writeFile(config,JSON.stringify({schemaVersion:1,...w.binding,stateDirectory:root,repositoryDirectory:w.repository.directory,gitExecutable:w.repository.options.executable,environment:w.repository.options.environment,allowLocalFixture:true,timeoutMs:10000}),{mode:0o600});
 const sender=new DurableGitSender({ledger,stateDirectory:root,configurationPath:config,pythonExecutable:python,helperPath:resolve('tools/git-sender.py'),environment:{PATH:process.env.PATH??'',HOME:w.root,TMPDIR:w.root}});
 const newCommit=async(label='new')=>{const blob=await w.repository.putBlob(Buffer.from(label+'\n'));const tree=await w.repository.writeTree([...w.source.entries,{path:label+'.txt',mode:'100644',...blob}]);return w.repository.freezeCommit(w.baseHead,tree,{author:'Fixture <fixture@example.invalid>',committer:'Fixture <fixture@example.invalid>',timestamp:1700000001000,message:'Exact sender '+label},'sender_'+label);};
 return {...w,ledger,root,config,sender,newCommit,async close(){ledger.close();await w.close();}};
}
function effect(w,commit){return {effectId:'effect',workId:'work',actionId:'action',repositoryId:w.binding.repositoryId,bindingEpoch:w.binding.bindingEpoch,ref:w.binding.ref,expectedHead:w.baseHead,commitOid:commit,preparedResultId:'prepared',validationId:bytesDigest(Buffer.from('fixture')),policyDigest:w.binding.policyDigest};}
test('fixed sender publishes an exact direct-child Git CAS and does not resend it',async()=>{const w=await fixture();try{
 const c=await w.newCommit(),e=effect(w,c);assert.equal((await w.repository.resolve(w.binding)).head,w.baseHead);
 assert.equal((await w.sender.compareUpdate(e)).kind,'sent');assert.equal((await w.repository.resolve(w.binding)).head,c);
 const invocation=w.sender.current(e);assert.equal(await w.sender.stopped(e),true);assert.equal((await w.sender.compareUpdate(e)).kind,'sent');assert.deepEqual(w.sender.current(e),invocation);
 const result=JSON.parse(await readFile(join(w.root,invocation.invocationId,'state.json'),'utf8'));assert.equal(result.stopped,true);assert.equal(result.delivery,'sent');
 }finally{await w.close();}});
test('inspection before launch durably fences a delayed helper instead of guessing it cannot start',async()=>{const w=await fixture();try{
 const invocation='delayed';await mkdir(join(w.root,invocation));const seen=JSON.parse(execFileSync(python,[resolve('tools/git-sender.py'),'inspect',w.config,invocation],{encoding:'utf8'}));assert.equal(seen.stopped,true);assert.equal(seen.delivery,'not_sent');
 const c=await w.newCommit();await writeFile(join(w.root,invocation,'intent.json'),JSON.stringify({invocationId:invocation,effect:effect(w,c)}),{mode:0o600});
 const delayed=JSON.parse(execFileSync(python,[resolve('tools/git-sender.py'),'run',w.config,invocation],{encoding:'utf8'}));assert.equal(delayed.state,'fenced');assert.equal((await w.repository.resolve(w.binding)).head,w.baseHead);
 }finally{await w.close();}});
test('a lost stdout response is recovered from the same sender invocation, without a second Git effect',async()=>{const w=await fixture();try{
 const command=w.sender.command;let first=true;w.sender.command=async(...args)=>{const result=await command(...args);if(first&&args[1][1]==='run'){first=false;return {...result,stdout:Buffer.alloc(0),exitCode:1};}return result;};
 const c=await w.newCommit(),e=effect(w,c);assert.equal((await w.sender.compareUpdate(e)).kind,'uncertain');const original=w.sender.current(e);assert.equal((await w.sender.compareUpdate(e)).kind,'sent');assert.deepEqual(w.sender.current(e),original);assert.equal((await w.repository.resolve(w.binding)).head,c);
 }finally{await w.close();}});
test('a contending canonical child is never overwritten by a stale sender',async()=>{const w=await fixture();try{
 const c=await w.newCommit(),other=await w.commit(w.source);assert.notEqual(c,other);
 assert.equal((await w.sender.compareUpdate(effect(w,c))).kind,'uncertain');assert.equal(await w.sender.stopped(effect(w,c)),true);assert.equal((await w.repository.resolve(w.binding)).head,other);
 }finally{await w.close();}});
