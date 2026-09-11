import { requireThat } from '../contracts/errors.mjs';
/** Fixed installation binding. Canonical publication has only expected-old Git CAS;
 * a transport failure is uncertain until authoritative readback classifies it.
 */
export class GitRefTransport {
 /** @param {import('../repository/git.mjs').GitRepository} repository @param {import('../contracts/ports.js').Binding} binding */
 constructor(repository,binding){this.repository=repository;this.binding=binding;}
 resolve(){return this.repository.resolve(this.binding);}
 /** @param {string} head */
 fetch(head){return this.repository.fetch(this.binding,head);}
 /** @param {import('../contracts/ports.js').Effect} effect */
 async compareUpdate(effect){
 const b=this.binding,r=this.repository;await r.checkBinding(b,true);
 requireThat(effect.repositoryId===b.repositoryId&&effect.bindingEpoch===b.bindingEpoch&&effect.ref===b.ref,'FORBIDDEN');
 const c=await r.readCommit(b,effect.commitOid);requireThat(c.parents.length===1&&c.parents[0]===effect.expectedHead,'INTEGRITY_FAILURE','Ref CAS requires a direct child');
 const result=await r.command(['push','--porcelain','--force-with-lease='+b.ref+':'+r.raw(effect.expectedHead),'--',b.remote,r.raw(effect.commitOid)+':'+b.ref],undefined,16384);
 return {kind:/** @type {'sent'|'uncertain'} */(result.code===0?'sent':'uncertain')};
 }
}
