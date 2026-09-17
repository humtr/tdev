import {boundedProviderJson} from './provider-json.mjs';
import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {requireThat,TdevError} from '../contracts/errors.mjs';
import {id,revision} from '../contracts/identity.mjs';
/** @typedef {import('./session-types.js').Session} Session */
/** @typedef {import('./session-types.js').ProviderRun} ProviderRun */
/** @typedef {{[key:string]:unknown}} RecordValue */
/** @param {unknown} value @returns {RecordValue} */
function object(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'EXECUTION_UNAVAILABLE','Malformed GitHub response');return /** @type {RecordValue} */(value);}
/** @param {unknown} value */
function numericId(value){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>0,'EXECUTION_UNAVAILABLE','Invalid provider numeric identity');return String(value);}
const CURRENT_WORKFLOW='.github/workflows/tdev-executor.yml',LEGACY_WORKFLOW='.github/workflows/dev2-executor.yml';
/** @param {Session} session */
function intentShape(session){const i=session.intent,current='refs/heads/tdev-exec/'+i.sessionId,legacy='refs/heads/dev2-exec/'+i.sessionId,path=i.ref===current?CURRENT_WORKFLOW:i.ref===legacy?LEGACY_WORKFLOW:'';requireThat(path&&i.workflowRef===i.repositoryFullName+'/'+path+'@'+i.ref,'INTEGRITY_FAILURE','Managed workflow/ref identity mismatch');return {workflowPath:path,prefix:path===CURRENT_WORKFLOW?'tdev-exec':'dev2-exec',namespace:path===CURRENT_WORKFLOW?'tdev':'dev2'};}
/** Provider observations are projected from authenticated HTTPS, never executor
 * input. No URL from a response is followed and no candidate ref can be launched.
 * Operational deletion is restricted to the exact immutable retained session ref
 * after authenticated terminal observation; canonical refs are never constructed.
 * Sources: GitHub REST refs and workflow-runs, API version 2026-03-10.
 */
export class GitHubSessions {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,token:()=>Promise<string>,fetcher?:typeof fetch,now?:()=>number,cacheMs?:number}} options */
 constructor(options){this.sessions=options.sessions;this.token=options.token;this.fetcher=options.fetcher??fetch;this.now=options.now??Date.now;this.cacheMs=options.cacheMs??10000;requireThat(Number.isSafeInteger(this.cacheMs)&&this.cacheMs>=0&&this.cacheMs<=10000,'INVALID_ARGUMENT');
  this.root='/repos/'+this.sessions.config.repositoryFullName;this.repositoryId=this.sessions.ledger.binding.providerRepositoryId;this.ownerId=this.sessions.config.repositoryOwnerId;
  /** @type {Map<string,{at:number,runs:ProviderRun[]}>} */this.cache=new Map();
  /** @type {Map<string,Promise<ProviderRun[]>>} */this.inflight=new Map();
  this.repositoryObservedAt=-Infinity;this.metrics={requests:0,reads:0,writes:0,uncertain:0};
 }
 /** @param {string} sessionId @returns {Session} */
 retained(sessionId){return this.sessions.ledger.transact(tx=>this.sessions.session(tx,id(sessionId)));}
 /** @param {'GET'|'POST'|'DELETE'} method @param {string} path @param {unknown} [body] @param {number[]} [allowed] */
 async request(method,path,body,allowed=[200]){
  requireThat(path.startsWith(this.root+'/')||path===this.root,'FORBIDDEN');const url=new URL(path,'https://api.github.com');requireThat(url.origin==='https://api.github.com'&&url.pathname.startsWith(this.root)&&!url.hash&&!url.username&&!url.password,'FORBIDDEN');
  const token=await this.token();requireThat(typeof token==='string'&&token.length>=16&&token.length<=4096&&!/\s/.test(token),'UNAUTHORIZED');
  this.metrics.requests++;this.metrics[method==='GET'?'reads':'writes']++;
  let response;try{response=await this.fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2026-03-10','user-agent':'tdev-managed-controller','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch{this.metrics.uncertain++;throw new TdevError(method==='GET'?'EXECUTION_UNAVAILABLE':'EFFECT_UNCERTAIN','GitHub response unavailable');}
  requireThat(allowed.includes(response.status),'EXECUTION_UNAVAILABLE','GitHub operation unavailable (HTTP '+response.status+')');
  const limit=2097152,length=response.headers.get('content-length');requireThat(length===null||/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)<=limit,'LIMIT_EXCEEDED');
  const reader=response.body?.getReader(),chunks=[];let size=0;
  if(reader)try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw new TdevError('LIMIT_EXCEEDED');}chunks.push(Buffer.from(part.value));}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);return {status:response.status,data:bytes.length?boundedProviderJson(bytes,limit):null};
 }
 /** Provider identity is rebound before every effect and periodically for reads. */
 async repository(force=false){if(!force&&this.now()-this.repositoryObservedAt<10000)return;const r=object((await this.request('GET',this.root)).data);requireThat(numericId(r.id)===this.repositoryId&&numericId(object(r.owner).id)===this.ownerId&&r.full_name===this.sessions.config.repositoryFullName&&r.archived===false,'FORBIDDEN','Repository binding changed');this.repositoryObservedAt=this.now();}
 /** @param {Session} session */
 async reference(session){const shape=intentShape(session);requireThat(session.intent.ref==='refs/heads/'+shape.prefix+'/'+session.intent.sessionId,'INTEGRITY_FAILURE','Execution ref namespace changed');const response=await this.request('GET',this.root+'/git/ref/heads/'+shape.prefix+'/'+session.intent.sessionId,undefined,[200,404]);if(response.status===404)return null;const r=object(response.data),target=object(r.object);requireThat(r.ref===session.intent.ref&&target.type==='commit'&&target.sha===session.intent.launchCommit,'INTEGRITY_FAILURE','Execution ref changed');return session.intent.launchCommit;}
 /** @param {string} sessionId */
 retirement(sessionId){const s=this.retained(sessionId),shape=intentShape(s),row=this.sessions.ledger.transact(tx=>tx.get('SELECT value FROM meta WHERE key=?','managed.ref-retired:'+id(sessionId)));if(!row)return null;const r=/** @type {RecordValue} */(parseRecord(String(row.value),65536));requireThat(r.schemaVersion===1&&r.kind===shape.namespace+'.managed-ref-retirement'&&r.sessionId===s.intent.sessionId&&r.intentDigest===s.intentDigest&&r.ref===s.intent.ref&&r.launchCommit===s.intent.launchCommit&&typeof r.runId==='string'&&typeof r.runAttempt==='string'&&typeof r.terminalObservedAt==='number'&&Number.isSafeInteger(r.terminalObservedAt)&&typeof r.retiredAt==='number'&&Number.isSafeInteger(r.retiredAt),'INTEGRITY_FAILURE','Retained execution-ref retirement changed');revision(r.runId);return r;}
 /** @param {string} sessionId @param {ProviderRun} terminal */
 retainRetirement(sessionId,terminal){let s=this.retained(sessionId),shape=intentShape(s);this.sessions.matchingRun(s,terminal);requireThat(s.state==='closed'&&s.launch==='sent'&&s.stoppedAt!==null&&terminal.status==='completed','EFFECT_UNCERTAIN','Execution ref retirement requires retained terminal session truth');const key='managed.ref-retired:'+id(sessionId);return this.sessions.ledger.transact(tx=>{s=this.sessions.session(tx,sessionId);shape=intentShape(s);requireThat(s.state==='closed'&&s.intent.ref==='refs/heads/'+shape.prefix+'/'+sessionId,'INTEGRITY_FAILURE');const existing=tx.get('SELECT value FROM meta WHERE key=?',key);if(existing){const r=/** @type {RecordValue} */(parseRecord(String(existing.value),65536));requireThat(r.kind===shape.namespace+'.managed-ref-retirement'&&r.sessionId===sessionId&&r.intentDigest===s.intentDigest&&r.ref===s.intent.ref&&r.launchCommit===s.intent.launchCommit&&r.runId===terminal.runId,'INTEGRITY_FAILURE');return r;}if(s.run)requireThat(s.run.runId===terminal.runId&&s.run.status==='completed','EFFECT_UNCERTAIN');else requireThat(!tx.get('SELECT assignment_id FROM managed_assignment WHERE session_id=? LIMIT 1',sessionId),'EFFECT_UNCERTAIN');const record={schemaVersion:1,kind:shape.namespace+'.managed-ref-retirement',sessionId,intentDigest:s.intentDigest,ref:s.intent.ref,launchCommit:s.intent.launchCommit,runId:terminal.runId,runAttempt:terminal.runAttempt,terminalObservedAt:terminal.observedAt,retiredAt:this.now()};tx.run('INSERT INTO meta VALUES(?,?)',key,canonicalJson(record));return record;});}
 /** Exact session-only retirement. Delete response loss is reconciled by an exact
  * absence readback before durable retirement evidence is recorded.
  * @param {string} sessionId @param {ProviderRun} terminal */
 async retireReference(sessionId,terminal){const s=this.retained(sessionId),shape=intentShape(s);if(this.retirement(sessionId))return s;this.sessions.matchingRun(s,terminal);requireThat(terminal.status==='completed'&&s.state==='closed'&&s.launch==='sent','EFFECT_UNCERTAIN');await this.repository(true);const present=await this.reference(s);let deletionError=null;if(present){try{await this.request('DELETE',this.root+'/git/refs/heads/'+shape.prefix+'/'+s.intent.sessionId,undefined,[204]);}catch(error){deletionError=error;}}
  const after=await this.reference(s);if(after!==null){this.metrics.uncertain++;if(deletionError)throw deletionError;throw new TdevError('EFFECT_UNCERTAIN','Execution ref retirement remains unconfirmed');}this.retainRetirement(sessionId,terminal);return this.retained(sessionId);
 }
 /** A response-loss retry reuses the exact immutable create-only ref. Concurrent
  * creates cannot emit a second ref effect, and retirement cannot force-update it.
  * Even duplicate provider runs can only obtain one selected native assignment.
  * @param {string} sessionId */
 async launch(sessionId){let s=this.retained(sessionId);requireThat(s.state!=='closed'&&!s.cancelRequested&&this.now()<s.intent.deadline,'STALE_RESULT');await this.repository(true);
  const present=await this.reference(s);if(present){requireThat(s.launch==='sent','INTEGRITY_FAILURE','Unowned execution ref');return {state:'present',session:s};}
  s=this.sessions.markLaunchSent(sessionId);let error;
  try{await this.request('POST',this.root+'/git/refs',{ref:s.intent.ref,sha:s.intent.launchCommit},[201,409,422]);}catch(cause){error=cause;}
  const observed=await this.reference(s).catch(()=>null);if(observed)return {state:'present',session:this.retained(sessionId)};
  this.metrics.uncertain++;if(error instanceof TdevError&&error.code==='EXECUTION_UNAVAILABLE')throw error;
  throw new TdevError('EFFECT_UNCERTAIN','Execution ref creation remains unconfirmed; recover the same session');
 }
 /** @param {Session} session @param {unknown} value @returns {ProviderRun} */
 project(session,value){const r=object(value),repo=object(r.repository),headRepo=object(r.head_repository),i=session.intent,shape=intentShape(session);
  requireThat(numericId(repo.id)===i.providerRepositoryId&&numericId(headRepo.id)===i.providerRepositoryId&&numericId(object(repo.owner).id)===i.repositoryOwnerId,'UNAUTHORIZED');
  requireThat(r.head_sha===i.launchCommit&&r.head_branch===i.ref.slice(11)&&r.event==='push'&&r.path===shape.workflowPath&&r.run_attempt===1,'UNAUTHORIZED');
  const status=String(r.status);requireThat(['queued','requested','waiting','pending','in_progress','completed'].includes(status),'EXECUTION_UNAVAILABLE');
  return {repositoryId:i.providerRepositoryId,repositoryOwnerId:i.repositoryOwnerId,runId:numericId(r.id),runAttempt:'1',headSha:i.launchCommit,headBranch:i.ref.slice(11),event:'push',workflowPath:shape.workflowPath,status:status==='completed'?'completed':status==='in_progress'?'in_progress':'queued',observedAt:this.now()};
 }
 /** @param {Session} session @returns {Promise<ProviderRun[]>} */
 async fetchRuns(session){await this.repository();const shape=intentShape(session),query=new URLSearchParams({branch:session.intent.ref.slice(11),event:'push',head_sha:session.intent.launchCommit,per_page:'100'});
  const r=object((await this.request('GET',this.root+'/actions/runs?'+query)).data);requireThat(Array.isArray(r.workflow_runs)&&typeof r.total_count==='number'&&Number.isSafeInteger(r.total_count)&&r.total_count>=0&&r.total_count<=100&&r.workflow_runs.length===r.total_count,'EXECUTION_UNAVAILABLE','Run observation must be complete');
  return r.workflow_runs.filter(v=>object(v).path===shape.workflowPath).map(v=>this.project(session,v)).sort((a,b)=>BigInt(a.runId)<BigInt(b.runId)?-1:BigInt(a.runId)>BigInt(b.runId)?1:0);
 }
 /** At most a ten-second provider observation is reused, with one in-flight read
  * per session. Cancellation forces a new observation; no cached terminal is forged.
  * @param {string} sessionId @param {boolean} [force] */
 async runs(sessionId,force=false){const s=this.retained(sessionId),cached=this.cache.get(sessionId);if(!force&&cached&&this.now()>=cached.at&&this.now()-cached.at<this.cacheMs)return cached.runs;
  const pending=this.inflight.get(sessionId);if(pending)return pending;
  const operation=this.fetchRuns(s).then(runs=>{this.cache.set(sessionId,{at:this.now(),runs});return runs;});this.inflight.set(sessionId,operation);try{return await operation;}finally{this.inflight.delete(sessionId);}
 }
 /** Reconcile logical state, provider terminal truth and exact operational ref.
  * Closed legacy sessions are re-observed until their ref absence is durable.
  * @param {string} sessionId @param {boolean} [force] */
 async refresh(sessionId,force=false){let s=this.retained(sessionId);if(s.launch!=='sent')return s;if(s.state==='closed'&&this.retirement(sessionId))return s;const runs=await this.runs(sessionId,force);
  if(s.state==='closed'){let terminal=null;if(s.run){terminal=runs.find(p=>p.runId===s.run?.runId)??null;requireThat(terminal,'EFFECT_UNCERTAIN','Selected provider run is not in a complete observation');if(terminal.status!=='completed')return s;}else if(runs.length&&runs.every(p=>p.status==='completed'))terminal=runs[0];if(!terminal)return s;await this.retireReference(sessionId,terminal);return this.retained(sessionId);}
  if(s.run){const selected=runs.find(p=>p.runId===s.run?.runId);requireThat(selected,'EFFECT_UNCERTAIN','Selected provider run is not in a complete observation');
   if(selected.status==='completed'){s=this.sessions.providerStopped(sessionId,selected);await this.retireReference(sessionId,selected);return this.retained(sessionId);}
   if(selected.status==='in_progress'&&!s.cancelRequested&&this.now()<s.intent.deadline){if(s.run.observedAt!==selected.observedAt)s=this.sessions.selectRun(sessionId,selected);}return s;
  }
  const ready=runs.find(p=>p.status==='in_progress');if(ready&&!s.cancelRequested&&this.now()<s.intent.deadline)return this.sessions.selectRun(sessionId,ready);
  if(runs.length&&runs.every(p=>p.status==='completed')){s=this.sessions.stopBeforeAssignment(sessionId,runs[0]);await this.retireReference(sessionId,runs[0]);return this.retained(sessionId);}
  return s;
 }
 /** ReadLaunch port for githubExecutorVerifier; the JWT is verified before this
  * is called. Every returned provider run was fetched via the bound provider API.
  * @param {string} sessionId */
 async authorization(sessionId){await this.refresh(sessionId);return this.sessions.launchAuthorization(sessionId);}
 /** Cancellation is durable before any provider call. HTTP 202 is admission,
  * never proof of stop. Only a fresh exact completed run releases session state.
  * @param {string} sessionId */
 async cancel(sessionId){let s=this.sessions.cancelSession(sessionId);if(s.state==='closed')return this.refresh(sessionId,true);
  if(s.launch==='reserved')return this.sessions.closeUnlaunched(sessionId);
  await this.repository(true);const runs=await this.runs(sessionId,true);
  for(const p of runs){if(p.status==='completed')continue;await this.request('POST',this.root+'/actions/runs/'+p.runId+'/cancel',undefined,[202,409]);}
  this.cache.delete(sessionId);s=await this.refresh(sessionId,true);return s;
 }
 /** Cancel only verified additional runs of this exact session/approved source.
  * A run ID supplied by an executor can never enter this effect path.
  * @param {string} sessionId */
 async cancelDuplicates(sessionId){const s=this.retained(sessionId);requireThat(s.run,'EFFECT_UNCERTAIN');await this.repository(true);const runs=await this.runs(sessionId,true),cancelled=[];
  for(const p of runs)if(p.runId!==s.run.runId&&p.status!=='completed'){revision(p.runId);await this.request('POST',this.root+'/actions/runs/'+p.runId+'/cancel',undefined,[202,409]);cancelled.push(p.runId);}this.cache.delete(sessionId);return cancelled;
 }
}
