import {parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Expired retained ready sessions can outlive every work poll and occupy physical
 * capacity after a process restart. Expiry selects an observation, never a close.
 * This bounded, coalesced reader uses the existing authenticated provider adapter
 * and existing terminal CAS. It cannot cancel, launch, reassign or invent a receipt.
 */
export class SessionReconciler {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,provider:Pick<import('./github-sessions.mjs').GitHubSessions,'refresh'>,now?:()=>number}} options */
 constructor(options){this.o=options;this.sessions=options.sessions;this.ledger=this.sessions.ledger;this.epoch=this.ledger.ownerEpoch;this.now=options.now??Date.now;this.lastAt=-Infinity;this.cursor='';/** @type {Promise<number>|null} */this.pending=null;}
 assert(){requireThat(!this.ledger.closed&&this.ledger.ownerEpoch===this.epoch,'STALE_REVISION','Provider reconciliation owner changed');}
 /** @returns {Promise<number>} */
 whenFull(){this.assert();const full=this.ledger.transact(tx=>Number(tx.get("SELECT count(*) n FROM managed_session WHERE state<>'closed'")?.n)>=this.sessions.limit);return full?this.refresh():Promise.resolve(0);}
 /** One bounded page and four concurrent exact reads; failures are scoped to the
  * individual resource. A selected still-running/unknown job continues occupying
  * capacity. The cursor provides progress beyond eight/sixteen configurations.
  * @returns {Promise<number>} */
 refresh(){this.assert();if(this.pending)return this.pending;if(this.now()-this.lastAt<10000)return Promise.resolve(0);this.lastAt=this.now();
  const operation=this.once().finally(()=>{this.pending=null;});this.pending=operation;return operation;
 }
 async once(){this.assert();const now=this.now();
  const read=()=>this.ledger.transact(tx=>tx.all("SELECT record FROM managed_session WHERE state<>'closed' AND session_id>? ORDER BY session_id LIMIT 128",this.cursor).map(row=>/** @type {import('./session-types.js').Session} */(parseRecord(String(row.record),2097152))));
  let page=read();if(!page.length&&this.cursor){this.cursor='';page=read();}if(!page.length)return 0;this.cursor=page[page.length-1].intent.sessionId;
  const selected=page.filter(s=>s.launch==='sent'&&(s.intent.deadline<=now||s.cancelRequested||s.observerEpoch!==this.epoch)).slice(0,16);if(selected.length===16)this.cursor=selected[15].intent.sessionId;let offset=0,closed=0;
  const worker=async()=>{for(;;){this.assert();const index=offset++;if(index>=selected.length)return;const s=selected[index];try{const current=await this.o.provider.refresh(s.intent.sessionId,true);this.assert();if(current.state==='closed')closed++;}catch{this.assert();/* Unknown stop remains occupied; unrelated observations continue. */}}};
  await Promise.all(Array.from({length:Math.min(4,selected.length)},worker));this.assert();return closed;
 }
}
