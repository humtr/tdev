/** Test-only observations for D0004/D0007. No timers, runner, durable owner,
 * provider access or authorization. These summaries cannot establish a release gate.
 */
import { canonicalJson, bytesDigest } from '../src/contracts/canonical.mjs';
import { requireThat } from '../src/contracts/errors.mjs';
/** @typedef {import('../src/contracts/ports.js').Json} Json */
/** @typedef {{name:string,inputSchema:Json}} Tool */
/** @param {readonly Tool[]} tools */
export function schemaFootprint(tools) {
  requireThat(tools.length===4 && new Set(tools.map(t=>t.name)).size===4 &&
    ['dev_context','dev_read','dev_work','dev_observe'].every(n=>tools.some(t=>t.name===n)),
    'INVALID_ARGUMENT','Expected the four canonical tool schemas');
  const encoded=canonicalJson(tools);
  const summaries=tools.map(tool=>{
    let nodes=0, maximumDepth=0, maximumUnionWidth=0, propertyDeclarations=0, references=0;
    /** @type {string[]} */ const openObjectPaths=[];
    /** @param {Json} value @param {string} path @param {number} depth */
    function walk(value,path,depth) {
      nodes++; maximumDepth=Math.max(maximumDepth,depth);
      if(value===null || typeof value!=='object')return;
      if(Array.isArray(value)){value.forEach((v,i)=>walk(v,path+'/'+i,depth+1));return;}
      if(value.type==='object' && value.additionalProperties!==false && !value.$ref && !value.oneOf && !value.anyOf)
        openObjectPaths.push(path);
      for(const union of [value.oneOf,value.anyOf])if(Array.isArray(union))maximumUnionWidth=Math.max(maximumUnionWidth,union.length);
      if(value.properties && typeof value.properties==='object' && !Array.isArray(value.properties))propertyDeclarations+=Object.keys(value.properties).length;
      if(typeof value.$ref==='string')references++;
      for(const [key,v] of Object.entries(value))walk(v,path+'/'+key,depth+1);
    }
    walk(tool.inputSchema,'',0);
    return {name:tool.name,bytes:Buffer.byteLength(canonicalJson(tool.inputSchema)),nodes,maximumDepth,maximumUnionWidth,propertyDeclarations,references,openObjectPaths};
  });
  return {scope:'schema-shape-only',schemaDigest:bytesDigest(Buffer.from(encoded)),bytes:Buffer.byteLength(encoded),tools:summaries,
    actualChatGPTUsability:'not_run',tokenCount:null,superiorityEstablished:false};
}
/** @typedef {{runId:string,workId:string,resultId:string,validationId:string,fromUs:number,toUs:number,status:'passed'|'failed'|'cancelled'|'not_run'}} ValidationSpan */
/** @typedef {{workId:string,status:'succeeded'|'failed'|'cancelled'|'not_run',fromUs:number,toUs:number,resultId:string|null}} Terminal */
/** @typedef {{runId:string,layer:'core'|'integration'|'release'|'live',ref:string,capacity:number,fromUs:number,toUs:number,
 * workIds:readonly string[],validations:readonly ValidationSpan[],terminals:readonly Terminal[],mcpCalls:number,modelToolRounds:number,
 * manualInterventions:number,externalBootstrapSteps:number}} Trace */
/** @param {unknown} n @returns {asserts n is number} */
function natural(n){requireThat(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0,'INVALID_ARGUMENT','Expected nonnegative integer microseconds/counter');}
/** @param {unknown} s @returns {asserts s is string} */
function identifier(s){requireThat(typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(s),'INVALID_ARGUMENT','Expected non-secret observation identity');}
/** Counts all attempts, including failed and cancelled validation. A reused receipt has
 * no new execution span. Duplicate observation rows are rejected, never counted twice.
 * This analyzes a caller-supplied trace; it does not authenticate that trace or receipts.
 * @param {Trace} trace
 */
export function executionDiagnostics(trace) {
  identifier(trace.runId);
  requireThat(['core','integration','release','live'].includes(trace.layer),'INVALID_ARGUMENT');
  requireThat(/^refs\/heads\/[^\s]+$/.test(trace.ref),'INVALID_ARGUMENT','One declared canonical ref is required');
  for(const n of [trace.capacity,trace.fromUs,trace.toUs,trace.mcpCalls,trace.modelToolRounds,trace.manualInterventions,trace.externalBootstrapSteps])natural(n);
  requireThat(trace.capacity>0&&trace.toUs>trace.fromUs&&trace.workIds.length>0,'INVALID_ARGUMENT','Empty observation window/workload');
  const works=new Set(trace.workIds);requireThat(works.size===trace.workIds.length,'INVALID_ARGUMENT','Duplicate logical work');
  trace.workIds.forEach(identifier);
  const runIds=new Set(),validationKeys=new Set();
  /** @type {Array<[number,number]>} */ const events=[];
  let validationUs=0,executed=0,notRun=0;
  /** @param {{workId:string,fromUs:number,toUs:number}} span */
  function span(span){natural(span.fromUs);natural(span.toUs);requireThat(works.has(span.workId)&&span.fromUs>=trace.fromUs&&span.toUs<=trace.toUs&&span.toUs>=span.fromUs,'INVALID_ARGUMENT','Unknown work or invalid observation span');}
  for(const v of trace.validations){
    span(v);for(const s of [v.runId,v.resultId,v.validationId])identifier(s);
    requireThat(!runIds.has(v.runId),'INVALID_ARGUMENT','Duplicate validation execution observation');runIds.add(v.runId);
    requireThat(['passed','failed','cancelled','not_run'].includes(v.status),'INVALID_ARGUMENT');
    if(v.status==='not_run'){notRun++;continue;}
    requireThat(v.toUs>v.fromUs,'INVALID_ARGUMENT','Executed validation needs a nonempty monotonic span');
    executed++;validationKeys.add(v.workId+'\0'+v.resultId+'\0'+v.validationId);
    const duration=v.toUs-v.fromUs;natural(validationUs+duration);validationUs+=duration;
    events.push([v.fromUs,1],[v.toUs,-1]);
  }
  events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  let running=0,peak=0;for(const [,delta] of events){running+=delta;peak=Math.max(peak,running);}
  const terminalIds=new Set();let succeeded=0,failed=0,cancelled=0,unavailable=0;
  for(const terminal of trace.terminals){
    span(terminal);requireThat(!terminalIds.has(terminal.workId),'INVALID_ARGUMENT','Duplicate terminal observation');terminalIds.add(terminal.workId);
    requireThat(['succeeded','failed','cancelled','not_run'].includes(terminal.status),'INVALID_ARGUMENT');
    if(terminal.status==='succeeded'){requireThat(terminal.resultId!==null,'INVALID_ARGUMENT','Successful terminal requires exact result identity');identifier(terminal.resultId);succeeded++;}
    else if(terminal.status==='failed')failed++;else if(terminal.status==='cancelled')cancelled++;else unavailable++;
  }
  const elapsedUs=trace.toUs-trace.fromUs;
  return {scope:'untrusted-trace-diagnostic-only',runId:trace.runId,layer:trace.layer,ref:trace.ref,capacity:trace.capacity,
    elapsedUs,declaredWorks:works.size,succeeded,failed,cancelled,unavailable,unfinished:works.size-terminalIds.size,
    completionRate:succeeded/works.size,successfulThroughputPerSecond:succeeded/(elapsedUs/1000000),
    executedValidationRuns:executed,notRunValidationRequests:notRun,repeatedExactValidationRuns:executed-validationKeys.size,
    validationRunsPerSuccessfulWork:succeeded===0?null:executed/succeeded,totalValidationUs:validationUs,
    peakConcurrentValidations:peak,capacityExceeded:peak>trace.capacity,observedValidationSlotUtilization:validationUs/(trace.capacity*elapsedUs),
    mcpCalls:trace.mcpCalls,modelToolRounds:trace.modelToolRounds,manualInterventions:trace.manualInterventions,externalBootstrapSteps:trace.externalBootstrapSteps,
    actualChatGPTUsability:'not_run',superiorityEstablished:false,receiptAuthenticityChecked:false};
}
