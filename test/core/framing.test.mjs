import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {FrameAssembler,sendFrames,MAX_FRAME_BYTES} from '../../src/transport/framing.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {UINT64_PATTERN} from '../../src/contracts/schema-primitives.mjs';
test('transport chunks round-trip Unicode at <=64 KiB with independent assemblies',()=>{
 const value=canonicalJson({tool:'dev_work',content:'\uac00\ud83d\ude80'.repeat(65000)}),frames=[];
 sendFrames(value,x=>frames.push(x),1048576);assert.ok(frames.length>2);assert.ok(frames.every(x=>Buffer.byteLength(x)<=MAX_FRAME_BYTES));
 const assembler=new FrameAssembler({maxMessageBytes:1048576});try{let result=null;for(const f of frames)result=assembler.feed(f);assert.equal(result,value);assert.equal(assembler.bytes,0);assert.equal(assembler.pending.size,0);}finally{assembler.dispose();}
});
test('chunks reject oversized, unordered, repeated and noncanonical data and expire',async()=>{
 const frames=[];sendFrames(canonicalJson({text:'x'.repeat(100000)}),x=>frames.push(x),200000);
 const assembler=new FrameAssembler({maxMessageBytes:200000,deadlineMs:5});try{
  assert.throws(()=>assembler.feed(frames[1]),{code:'CAPACITY_REJECTED'});assembler.feed(frames[0]);
  assert.throws(()=>assembler.feed(frames[0]),{code:'INVALID_ARGUMENT'});await delay(15);assert.equal(assembler.bytes,0);
  assert.throws(()=>assembler.feed('x'.repeat(MAX_FRAME_BYTES+1)),{code:'LIMIT_EXCEEDED'});
  const bad=JSON.parse(frames[0]);bad.data='not-valid-base64!';assert.throws(()=>assembler.feed(JSON.stringify(bad)),{code:'INVALID_ARGUMENT'});
 }finally{assembler.dispose();}
});
test('portable uint64 revision pattern is exact at every decimal boundary',()=>{
 const pattern=new RegExp(UINT64_PATTERN),maximum=18446744073709551615n;
 for(let power=0;power<21;power++)for(const offset of [-1n,0n,1n]){const v=10n**BigInt(power)+offset;assert.equal(pattern.test(String(v)),v>=0n&&v<=maximum,String(v));}
 for(let offset=-100n;offset<=100n;offset++)assert.equal(pattern.test(String(maximum+offset)),offset<=0n);
 for(const value of ['','00','01','-0','-1','1e3','1.0',' 1','1 '])assert.equal(pattern.test(value),false);
});
