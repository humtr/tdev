const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../examples/chatgpt/run-cell.js'), 'utf8');
const fresh = () => vm.runInNewContext(source + '\nrunTdevCell;');
const freshMonitor = () => vm.runInNewContext(source + '\nrunTdevOperationCell;');
const plan = n => Array.from({length:n}, (_, i) => ({id:`s${i}`, tool:'work', args:{requestId:`r${i}`}}));
const witness = {tool:'mark', instance:'a'.repeat(16), runId:'b'.repeat(32), cellId:'c'.repeat(32), sequence:0};
const options = (n, tools) => ({steps:plan(n), tools, now:()=>0,
  classify:()=> 'continue', onReply:()=>{}});

test('fresh cells execute 40 unique steps with 16/16/8 total calls', async () => {
  const seen = [], attempts = [], steps = plan(40);
  let nextIndex = 0;
  do {
    const result = await fresh()({...options(0, {work:async a=>seen.push(a.requestId)}), steps, nextIndex});
    attempts.push(result.attempted); nextIndex = result.nextIndex;
    assert.equal(result.status, nextIndex === 40 ? 'complete' : 'rollover');
  } while (nextIndex < 40);
  assert.deepEqual(attempts, [16,16,8]);
  assert.deepEqual(seen, steps.map(s=>s.args.requestId));
});

test('witnesses consume budget, reserve closing probes, preserve generation and sequence', async () => {
  const calls = [];
  const tools = {work:async args => {calls.push(args); return {_meta:{'io.tdev/diagnosticReceipt':{instance:witness.instance, request:77}}};},
    mark:async args=>{calls.push(args); return {eventId:calls.length};}};
  const result = await fresh()({...options(20,tools), witness});
  assert.equal(result.status,'rollover'); assert.equal(result.nextIndex,13);
  assert.equal(result.attempted,16); assert.equal(calls.length,16);
  assert.equal(calls[0].phase,'cell_enter');
  assert.equal(calls[14].phase,'tool_return'); assert.equal(calls[14].callOrdinal,13);
  assert.equal(calls[14].afterRequest,77); assert.equal(calls[15].phase,'cell_exit');
  const next = await fresh()({...options(20,tools), nextIndex:result.nextIndex,
    witness:{...witness, sequence:result.sequence, cellId:'d'.repeat(32)}});
  assert.equal(next.status,'complete'); assert.equal(next.sequence,6);
  assert.equal(calls[16].sequence,4); assert.equal(calls[16].cellId,'d'.repeat(32));
});

test('probe throws or structured errors do not retry/cancel work and still cost calls', async () => {
  let work = 0, marks = 0;
  const result = await fresh()({...options(20,{work:async()=>++work,
    mark:async()=>{if (++marks === 1) throw Error('secret'); return {isError:true};}}),witness});
  assert.equal(work,13); assert.equal(marks,3); assert.equal(result.attempted,16);
  assert.equal(result.witnesses[0].unavailable,true);
  assert.equal(result.witnesses[1].reply.isError,true);
  assert(!JSON.stringify(result).includes('secret'));
});

test('lost operational reply stops successors without retry or false success', async () => {
  const seen = [], marks = [];
  const steps = plan(3);
  const result = await fresh()({...options(0,{work:async args=>{
    seen.push(args.requestId); if(seen.length === 2) throw Error('private transport text'); return {};
  },mark:async args=>{marks.push(args);return {};}}),steps,witness});
  assert.equal(result.status,'reconcile'); assert.equal(result.nextIndex,1);
  assert.equal(result.pending.id,'s1'); assert.deepEqual(seen,['r0','r1']);
  assert.equal(marks[1].callOrdinal,1); // No tool_return for the rejected await.
  assert(!JSON.stringify(result).includes('private transport text'));
});

test('structured error, pending operation, or decoder failure stop for review', async () => {
  for (const classify of [()=> 'review', ()=>undefined, ()=>{throw Error('decode');}]) {
    let calls = 0;
    const result = await fresh()({...options(3,{work:async()=>{calls++;return {isError:true};}}),classify});
    assert.equal(calls,1); assert.equal(result.status,'review');
    assert.equal(result.nextIndex,1); assert.equal(result.pending.index,0);
  }
});

test('caller output failure cannot replay the fulfilled effect', async () => {
  let calls=0;
  const result = await fresh()({...options(3,{work:async()=>++calls}),onReply:()=>{throw Error('output');}});
  assert.equal(calls,1); assert.equal(result.status,'review'); assert.equal(result.nextIndex,1);
});

test('elapsed budget checked between awaits; no overlapping or detached work', async () => {
  let clock=0, active=0;
  const result = await fresh()({...options(3,{work:async()=>{
    assert.equal(active++,0); await Promise.resolve(); clock+=100; active--; return {};
  }}),now:()=>clock,maxElapsedMs:50});
  assert.equal(result.attempted,1); assert.equal(result.status,'rollover'); assert.equal(active,0);
});

test('slow entry probe yields review instead of an infinite empty rollover', async () => {
  let clock=0, work=0;
  const result = await fresh()({...options(1,{work:async()=>++work,mark:async()=>{clock+=100;}}),
    witness,now:()=>clock,maxElapsedMs:50});
  assert.equal(work,0); assert.equal(result.status,'review'); assert.equal(result.attempted,2);
});

test('no work emits no probes; invalid plan/budget fails before any invocation', async () => {
  let calls=0;
  const opts = {...options(1,{work:async()=>++calls,mark:async()=>++calls}),witness};
  for (const patch of [{maxCalls:3},{nextIndex:-1},{steps:[...plan(1),...plan(1)]},
    {maxElapsedMs:0},{witness:{...witness,sequence:Number.MAX_SAFE_INTEGER}}]) {
    await assert.rejects(fresh()({...opts,...patch}));
  }
  const result = await fresh()({...opts,steps:[]});
  assert.equal(result.status,'complete'); assert.equal(calls,0);
});

test('lower host budget works without server policy; absent metadata is not invented', async () => {
  const marks=[];
  const result=await fresh()({...options(3,{work:async()=>({}),mark:async a=>{marks.push(a);}}),
    witness,maxCalls:4});
  assert.equal(result.attempted,4); assert.equal(result.nextIndex,1);
  assert.equal(marks[1].afterRequest,undefined);
});

test('operation monitor stays in one cell until terminal failure is observed', async () => {
  let clock=0, calls=0, active=0;
  const seen=[];
  const states=[
    {id:'op1',status:'running',effect:'unknown',result:null,error:null,output:{availableBytes:3,nextOffset:3}},
    {id:'op1',status:'running',effect:'unknown',result:null,error:null,output:{availableBytes:3,nextOffset:3}},
    {id:'op1',status:'failed',effect:'committed',result:{exitCode:7,terminal:true},error:null,output:{availableBytes:9,nextOffset:9}}
  ];
  const tools={status:async()=>{assert.equal(active++,0); const value=states[calls++]; active--; return {structuredContent:{ok:true,result:value}};}};
  const result=await freshMonitor()({tools,tool:'status',operationId:'op1',maxCalls:5,maxElapsedMs:10000,
    pollAfterMs:1000,now:()=>clock,sleep:async ms=>{clock+=ms;},onStatus:op=>seen.push(op.status)});
  assert.equal(result.status,'terminal'); assert.equal(result.operationStatus,'failed');
  assert.equal(result.operation.result.exitCode,7); assert.equal(result.attempted,3); assert.equal(active,0);
  assert.deepEqual(seen,['running','failed']); assert.equal(result.nextArgs.offset,9);
});

test('operation monitor default performs one bounded wait per physical cell before rollover', async () => {
  let clock=0, calls=0; const offsets=[];
  const waits=[];
  const tools={status:async args=>{offsets.push(args.offset); waits.push(args.waitMs); calls++; return {ok:true,result:{id:'op1',status:'running',effect:'unknown',result:null,error:null,
    output:{availableBytes:calls,nextOffset:args.offset+1}}};}};
  const result=await freshMonitor()({tools,tool:'status',operationId:'op1',
    statusWaitMs:3000,pollAfterMs:1000,now:()=>clock,sleep:async ms=>{clock+=ms;}});
  assert.equal(result.status,'rollover'); assert.equal(result.reason,'call_budget');
  assert.equal(result.attempted,1); assert.deepEqual(offsets,[0]); assert.deepEqual(waits,[3000]);
  assert.equal(result.nextArgs.offset,1); assert.equal(result.nextArgs.waitMs,3000);
});

test('operation monitor stops safely on unknown or unavailable status', async () => {
  const unknown=await freshMonitor()({tools:{status:async()=>({ok:true,result:{status:'unknown'}})},tool:'status',operationId:'op1'});
  assert.equal(unknown.status,'review'); assert.equal(unknown.reason,'operation_unknown'); assert.equal(unknown.attempted,1);
  const unavailable=await freshMonitor()({tools:{status:async()=>{throw Error('transport');}},tool:'status',lookupRequestId:'req1'});
  assert.equal(unavailable.status,'review'); assert.equal(unavailable.reason,'status_reply_unavailable'); assert.equal(unavailable.attempted,1);
  assert.equal(unavailable.nextArgs.lookupRequestId,'req1');
});
