import { mkdtemp, rm, realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { GitRepository } from '../../src/repository/git.mjs';
import { bytesDigest } from '../../src/contracts/canonical.mjs';
/** @typedef {import('../../src/contracts/ports.js').Binding} Binding */
/** @typedef {import('../../src/contracts/ports.js').SourceTree} SourceTree */
/** @typedef {{path:string,content:string|Uint8Array,mode?:string}} FixtureEntry */
/** Test-only executable resolution. The product takes a sealed absolute path. */
export async function gitExecutable(){for(const directory of (process.env.PATH??'').split(delimiter)){try{const p=join(directory,'git');await access(p,constants.X_OK);return await realpath(p);}catch{}}throw Error('Git fixture capability missing');}
/** Real disposable bare repositories; no remote credentials or product canonical state.
 * @param {FixtureEntry[]} [files] @param {'sha1'|'sha256'} [format] */
export async function gitWorld(files=[{path:'a.txt',content:'alpha\n'},{path:'nested/b.txt',content:'beta\n'}],format='sha1'){
 const root=await realpath(await mkdtemp(join(tmpdir(),'dev2-git-'))),executable=await gitExecutable();
 /** @type {Binding} */const binding={repositoryId:'fixture',installationId:'fixture-install',provider:'fixture',providerRepositoryId:'fixture-repo',remote:join(root,'remote.git'),ref:'refs/heads/dev-2',bindingEpoch:'epoch1',policyDigest:bytesDigest(Buffer.from('fixture-policy'))};
 /** @param {string} directory */
 const options=directory=>({directory,executable,environment:{PATH:process.env.PATH??'',HOME:root},bindings:()=>[binding],verifyRemote:async()=>{},objectFormat:format,allowLocalFixture:true});
 const remote=new GitRepository(options(binding.remote));await remote.init();
 const entries=await Promise.all(files.map(async e=>({path:e.path,mode:e.mode??'100644',...await remote.putBlob(typeof e.content==='string'?Buffer.from(e.content):e.content)})));
 const source=await remote.writeTree(entries);
 const baseHead=await remote.putObject('commit',Buffer.from(`tree ${remote.raw(source.treeOid)}\nauthor Fixture <fixture@example.invalid> 1700000000 +0000\ncommitter Fixture <fixture@example.invalid> 1700000000 +0000\n\nFixture root\n`));
 const update=await remote.command(['update-ref',binding.ref,remote.raw(baseHead)]);if(update.code!==0)throw Error('Fixture ref setup failed');
 const repository=new GitRepository(options(join(root,'cache.git')));
 /** @param {SourceTree} tree @param {string} [parent] */
 const commit=async(tree,parent=baseHead)=>{const head=await remote.freezeCommit(parent,tree,{author:'Fixture <fixture@example.invalid>',committer:'Fixture <fixture@example.invalid>',timestamp:1700000001000,message:'Fixture change'},'fixture_result');const r=await remote.command(['update-ref',binding.ref,remote.raw(head),remote.raw(parent)]);if(r.code!==0)throw Error('Fixture ref CAS failed');return head;};
 return {root,binding,remote,repository,baseHead,source,options,commit,close:()=>rm(root,{recursive:true,force:true})};
}
