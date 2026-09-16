import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { success, failure } from '../contracts/envelopes.mjs';
import { requireThat,Dev2Error } from '../contracts/errors.mjs';
import { validateInput, validateWorkItem, admitWorkBatch } from '../mcp/input-schemas.mjs';
import { validateOutput, TOOL_DESCRIPTORS } from '../mcp/outputs.mjs';
import { workInput } from './engine.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @param {unknown} value @returns {RecordValue} */
function record(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ARGUMENT');return /** @type {RecordValue} */(value);}
/** @param {unknown} value @returns {Json} */
function json(value){return /** @type {Json} */(parseRecord(canonicalJson(value),2097152));}
/** Installation-level public router. Each DevelopmentApplication remains a
 * binding-scoped durable owner; this layer selects one before lookup/admission.
 */
export class BindingRouterApplication {
 /** @param {{applications:readonly import('./application.mjs').DevelopmentApplication[],primaryRepositoryId:string,now?:()=>number}} options */
 constructor(options){
  requireThat(options.applications.length>0,'INTEGRITY_FAILURE','At least one binding application is required');
  /** @type {Map<string,import('./application.mjs').DevelopmentApplication>} */this.apps=new Map();
  for(const app of options.applications){const id=app.engine.binding.repositoryId;requireThat(!this.apps.has(id),'INTEGRITY_FAILURE','Duplicate repository binding');this.apps.set(id,app);}
  requireThat(this.apps.has(options.primaryRepositoryId),'INTEGRITY_FAILURE','Primary repository binding is missing');
  this.primaryRepositoryId=options.primaryRepositoryId;this.primary=/** @type {import('./application.mjs').DevelopmentApplication} */(this.apps.get(options.primaryRepositoryId));this.now=options.now??Date.now;
 }
 /** @param {unknown} repository */
 application(repository){const selected=repository===undefined||repository==='self'?this.primaryRepositoryId:String(repository);const app=this.apps.get(selected);requireThat(app,'FORBIDDEN','Repository binding is not authorized');return app;}
 /** @param {RecordValue} item @param {import('./application.mjs').DevelopmentApplication} app */
 primaryOnly(item,app){if(item.op==='policy.adopt'||String(item.op).startsWith('release.'))requireThat(app===this.primary,'FORBIDDEN','Operation is primary binding only');}
 /** Discovery is authorization-filtered installation data, never proof for a later call. @param {Principal} principal */
 async repositories(principal){const rows=[];for(const app of this.apps.values()){const b=app.engine.binding;try{await app.engine.o.authorization.authorize(principal,b,'repository.read');rows.push({repositoryId:b.repositoryId,provider:b.provider,providerRepositoryId:b.providerRepositoryId,ref:b.ref,bindingEpoch:b.bindingEpoch,policyDigest:b.policyDigest,primary:b.repositoryId===this.primaryRepositoryId});}catch(error){if(error instanceof Dev2Error&&['FORBIDDEN','UNAUTHORIZED'].includes(error.code))continue;throw error;}}return rows.sort((a,b)=>a.primary===b.primary?Buffer.compare(Buffer.from(a.repositoryId),Buffer.from(b.repositoryId)):a.primary?-1:1);}
 /** @param {Principal} principal @param {string} name @param {unknown} input @param {AbortSignal} [signal] */
 async invoke(principal,name,input,signal){
  requireThat(TOOL_DESCRIPTORS.some(tool=>tool.name===name),'INVALID_ARGUMENT','Unknown tool');
  if(name!=='dev_work'){
   try{const value=validateInput(/** @type {'dev_context'|'dev_read'|'dev_observe'} */(name),input),app=this.application(value.repository);let output=await app.invoke(principal,name,input,signal);if(output.ok!==true)return output;
    if(name==='dev_context'){const data=record(output.data);output={...output,data:{...data,repositories:await this.repositories(principal),primaryRepositoryId:this.primaryRepositoryId}};}
    else if(name==='dev_observe'&&record(value.selector).runtime===true){const data=record(output.data),runtime=record(data.runtime);output={...output,data:{...data,runtime:{...runtime,reservedAttempts:[...this.apps.values()].reduce((n,a)=>n+a.engine.ledger.transact(tx=>tx.reservations().length),0),executingActions:[...this.apps.values()].reduce((n,a)=>n+a.engine.running.size,0)}}};}
    return validateOutput(name,output);}catch(error){return validateOutput(name,failure(error));}
  }
  try{
   const source=record(input);const rawItems=/** @type {Json[]} */(source.items);
   const outcomes=await admitWorkBatch(principal,input,async(p,item)=>{const app=this.application(item.repository);this.primaryOnly(item,app);await app.engine.authorize(p,workInput(item));},async(p,item)=>{const app=this.application(item.repository);return json(await app.engine.admit(p,item));});
   /** @type {Map<import('./application.mjs').DevelopmentApplication,{items:RecordValue[],outcomes:RecordValue[],actionIds:string[]}>} */const groups=new Map();
   for(let index=0;index<outcomes.length;index++){
    const outcome=record(outcomes[index]);if(outcome.ok!==true)continue;
    const item=validateWorkItem(rawItems[index]),app=this.application(item.repository);let group=groups.get(app);if(!group){group={items:[],outcomes:[],actionIds:[]};groups.set(app,group);}group.items.push(item);group.outcomes.push(outcome);group.actionIds.push(String(record(outcome.receipt).actionId));
   }
   for(const [app,group] of groups){await app.engine.h2.selectEnvelope(principal,{apiVersion:1,items:group.items,waitMs:0},group.outcomes);app.engine.pump();}
   const waitMs=Number(source.waitMs??0);if(waitMs>0)await Promise.all([...groups].map(([app,group])=>app.wait(principal,group.actionIds,waitMs,signal)));
   const runtime={...this.primary.runtime,releaseId:this.primary.o.currentReleaseId?.()??this.primary.runtime.releaseId};
   return validateOutput('dev_work',success({items:outcomes},runtime,new Date(this.now()).toISOString()));
  }catch(error){return validateOutput('dev_work',failure(error));}
 }
}
