import test from 'node:test';
import assert from 'node:assert/strict';
import {schemaFootprint,executionDiagnostics} from '../../bench/diagnostics.mjs';
function tools(){return ['dev_context','dev_read','dev_work','dev_observe'].map(name=>({name,inputSchema:{type:'object',additionalProperties:false,properties:{items:{type:'array',items:{oneOf:[{type:'object',additionalProperties:false,properties:{op:{const:'create'}}},{type:'object',additionalProperties:false,properties:{op:{const:'validate'}}}]}}}}}));}
function trace(){return {runId:'fixture-1',layer:'core',ref:'refs/heads/dev-2',capacity:8,fromUs:0,toUs:1000000,workIds:['a','b'],validations:[],terminals:[],mcpCalls:3,modelToolRounds:2,manualInterventions:0,externalBootstrapSteps:0};}
test('schema shape reports bytes, union width and open objects without pretending to measure ChatGPT',()=>{
 const t=tools(),r=schemaFootprint(t);assert.equal(r.tools.length,4);assert.equal(r.tools[2].maximumUnionWidth,2);assert.equal(r.tools[2].openObjectPaths.length,0);assert.equal(r.actualChatGPTUsability,'not_run');assert.equal(r.tokenCount,null);
 t[2].inputSchema.additionalProperties=true;const changed=schemaFootprint(t);assert.ok(changed.tools[2].openObjectPaths.includes(''));assert.notEqual(r.schemaDigest,changed.schemaDigest);
 assert.throws(()=>schemaFootprint(t.slice(0,3)));assert.throws(()=>schemaFootprint([t[0],t[0],t[2],t[3]]));
});
test('failed attempts and response-observation overhead remain in the measurement window',()=>{
 const t=trace();t.validations=[{runId:'v1',workId:'a',resultId:'r1',validationId:'id1',fromUs:0,toUs:200000,status:'failed'},
 {runId:'v2',workId:'a',resultId:'r1',validationId:'id1',fromUs:200000,toUs:400000,status:'passed'},
 {runId:'v3',workId:'b',resultId:'r2',validationId:'id2',fromUs:100000,toUs:500000,status:'cancelled'}];
 t.terminals=[{workId:'a',status:'succeeded',fromUs:0,toUs:900000,resultId:'r1'},{workId:'b',status:'cancelled',fromUs:0,toUs:600000,resultId:null}];
 const r=executionDiagnostics(t);assert.equal(r.executedValidationRuns,3);assert.equal(r.repeatedExactValidationRuns,1);assert.equal(r.totalValidationUs,800000);assert.equal(r.successfulThroughputPerSecond,1);assert.equal(r.validationRunsPerSuccessfulWork,3);assert.equal(r.peakConcurrentValidations,2);assert.equal(r.observedValidationSlotUtilization,.1);assert.equal(r.superiorityEstablished,false);
});
test('missing terminals and not-run validations are not converted to success or zero-cost speedups',()=>{
 const t=trace();t.validations=[{runId:'v1',workId:'a',resultId:'r1',validationId:'id1',fromUs:0,toUs:0,status:'not_run'}];
 const r=executionDiagnostics(t);assert.equal(r.executedValidationRuns,0);assert.equal(r.notRunValidationRequests,1);assert.equal(r.validationRunsPerSuccessfulWork,null);assert.equal(r.unfinished,2);assert.equal(r.completionRate,0);
});
test('duplicate rows, unknown work, reversed time and empty windows fail explicitly',()=>{
 const v={runId:'v',workId:'a',resultId:'r',validationId:'id',fromUs:0,toUs:100,status:'passed'};
 for(const changes of [{validations:[v,v]},{validations:[{...v,workId:'unknown'}]},{validations:[{...v,fromUs:200}]},{toUs:0},{capacity:0},{mcpCalls:-1},{workIds:['a','a']},{terminals:[{workId:'a',status:'succeeded',fromUs:0,toUs:1,resultId:null}]}])assert.throws(()=>executionDiagnostics({...trace(),...changes}));
});
test('simultaneous end/start does not inflate overlap; capacity is a configurable policy, not eight identities',()=>{
 for(const capacity of [1,8,16,32]){
  const t=trace();t.capacity=capacity;t.validations=[{runId:'a1',workId:'a',resultId:'a',validationId:'a',fromUs:0,toUs:100,status:'passed'},{runId:'b1',workId:'b',resultId:'b',validationId:'b',fromUs:100,toUs:200,status:'passed'}];
  const r=executionDiagnostics(t);assert.equal(r.peakConcurrentValidations,1);assert.equal(r.capacityExceeded,false);
 }
});
test('eight-way fixture demonstrates how to count 36 full validations without claiming this fixture is measured product performance',()=>{
 const t=trace();t.workIds=Array.from({length:8},(_,i)=>'w'+i);let run=0;
 for(let round=0;round<8;round++)for(let work=round;work<8;work++)t.validations.push({runId:'v'+run++,workId:'w'+work,resultId:'r'+round+'-'+work,validationId:'id'+round+'-'+work,fromUs:round*10000,toUs:(round+1)*10000,status:'passed'});
 t.terminals=t.workIds.map((workId,i)=>({workId,status:'succeeded',resultId:'r'+i+'-'+i,fromUs:0,toUs:100000}));
 const r=executionDiagnostics(t);assert.equal(r.executedValidationRuns,36);assert.equal(r.validationRunsPerSuccessfulWork,4.5);assert.equal(r.peakConcurrentValidations,8);assert.equal(r.receiptAuthenticityChecked,false);assert.equal(r.superiorityEstablished,false);
});

test('canonical input seal changes when a checked benchmark input changes',async()=>{
 const {mkdtemp,cp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const root=await mkdtemp(join(tmpdir(),'dev2-input-seal-'));
 try{
  const copy=join(root,'source');await mkdir(copy);
  for(const path of ['src/contracts','src/runtime','tools','config','AGENTS.md','DIRECTIVE.md','RULE.md','WORKBOARD.md','package.json','package-lock.json','jsconfig.json'])await cp(path,join(copy,path),{recursive:true});
  await mkdir(join(copy,'bench'));await writeFile(join(copy,'bench','observed.mjs'),'export const observed=1;\n');
  async function check(label){const out=join(root,label);const r=spawnSync(process.execPath,[join(copy,'tools/validate.mjs'),'--profile','integration','--output',out],{encoding:'utf8',timeout:5000});assert.equal(r.status,2,r.stderr||r.stdout);return JSON.parse(await readFile(join(out,'result.json'),'utf8'));}
  const before=await check('before');await writeFile(join(copy,'bench','observed.mjs'),'export const observed=2;\n');const after=await check('after');
  assert.notEqual(before.inputDigest,after.inputDigest);
 }finally{await rm(root,{recursive:true,force:true});}
});
