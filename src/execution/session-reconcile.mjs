import {parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Managed provider truth must converge even when no work poll is waiting. This
 * bounded reader observes every sent physical session, including warm nonterminal
 * runs and closed legacy sessions whose operational ref still lacks retirement
 * evidence. Observation never launches, reassigns or invents a receipt; exact ref
 * retirement remains inside the authenticated provider adapter after terminal.
 */
export class SessionReconciler {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,provider:Pick<import('./github-sessions.mjs').GitHubSessions,'refresh'>,now?:()=>number}} options */
 constructor(options){this.o=options;this.sessions=options.sessions;this.ledger=this.sessions.ledger;this.epoch=this.ledger.ownerEpoch;this.now=options.now??Date.now;this.lastAt=-Infinity;this.cursor='';/** @type {Promise<number>|null} */this.pending=null;/** @type {NodeJS.Timeout|null} */this.timer=null;}
 assert(){requireThat(!this.ledger.closed&&this.ledger.ownerEpoch===this.epoch,'STALE_REVISION','Provider reconciliation owner changed');}
 /** @returns {Promise<number>} */
 whenFull(){this.assert();const full=this.ledger.transact(tx=>Number(tx.get("SELECT count(*) n FROM managed_session WHERE state<>'closed'")?.n)>=this.sessions.limit);return full?this.refresh():Promise.resolve(0);}
 /** Long-lived native ownership schedules provider observation independently from
  * admission pressure. The timer is unrefed and stops itself after ledger close. */
 start(intervalMs=10000){requireThat(Number.isSafeInteger(intervalMs)&&intervalMs>=1000&&intervalMs<=60000,'INVALID_ARGUMENT');if(this.timer||this.ledger.closed)return;const tick=async()=>{this.timer=null;if(this.ledger.closed)return;try{await this.refresh();}catch{}if(this.ledger.closed)return;this.timer=setTimeout(()=>{void tick();},intervalMs);this.timer.unref();};void tick();}
 /** One bounded page and four concurrent exact reads; failures are scoped to the
  * individual resource. A still-running/unknown job is preserved. The cursor
  * progresses through historical sent sessions without turning ref cleanup into
  * per-ref manual provenance work.
  * @returns {Promise<number>} */
 refresh(){this.assert();if(this.pending)return this.pending;if(this.now()-this.lastAt<10000)return Promise.resolve(0);this.lastAt=this.now();
  const operation=this.once().finally(()=>{this.pending=null;});this.pending=operation;return operation;
 }
 async once(){this.assert();
  const read=()=>this.ledger.transact(tx=>tx.all("SELECT record FROM managed_session WHERE session_id>? ORDER BY session_id LIMIT 128",this.cursor).map(row=>/** @type {import('./session-types.js').Session} */(parseRecord(String(row.record),2097152))));
  let page=read();if(!page.length&&this.cursor){this.cursor='';page=read();}if(!page.length)return 0;this.cursor=page[page.length-1].intent.sessionId;
  const selected=page.filter(s=>s.launch==='sent').slice(0,16);if(selected.length===16)this.cursor=selected[15].intent.sessionId;let offset=0,closed=0;
  const worker=async()=>{for(;;){this.assert();const index=offset++;if(index>=selected.length)return;const before=selected[index];try{const current=await this.o.provider.refresh(before.intent.sessionId,true);this.assert();if(before.state!=='closed'&&current.state==='closed')closed++;}catch{this.assert();/* Unknown stop/retirement remains retained; unrelated observations continue. */}}};
  await Promise.all(Array.from({length:Math.min(4,selected.length)},worker));this.assert();return closed;
 }
}
