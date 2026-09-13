import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameAssembler} from '../../src/transport/framing.mjs';
test('invalid UTF-8 chunk completion has typed rejection and releases retained bytes',()=>{
 const a=new FrameAssembler({maxMessageBytes:100000});
 const frame=(seq,data)=>JSON.stringify({v:1,kind:'chunk',messageId:'invalid_utf8',seq,total:2,data});
 try{assert.equal(a.feed(frame(0,'/w==')),null);assert.throws(()=>a.feed(frame(1,'YQ==')),{code:'INVALID_ARGUMENT'});assert.equal(a.pending.size,0);assert.equal(a.bytes,0);assert.equal(a.feed('{"ok":true}'),'{"ok":true}');}finally{a.dispose();}
});
