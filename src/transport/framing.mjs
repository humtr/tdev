import { randomUUID } from 'node:crypto';
import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** D0006 wire chunks remain <=64 KiB, including UTF-8/base64/JSON overhead. */
export const MAX_FRAME_BYTES=65536;
const CHUNK_BYTES=32768;
/** @param {string} encoded @param {(frame:string)=>void} send @param {number} maxMessageBytes */
export function sendFrames(encoded,send,maxMessageBytes){
 const bytes=Buffer.from(encoded);requireThat(bytes.length<=maxMessageBytes,'LIMIT_EXCEEDED','Transport message bound');
 if(bytes.length<=MAX_FRAME_BYTES){send(encoded);return;}
 const messageId=randomUUID(),total=Math.ceil(bytes.length/CHUNK_BYTES);
 for(let seq=0;seq<total;seq++)send(canonicalJson({v:1,kind:'chunk',messageId,seq,total,data:bytes.subarray(seq*CHUNK_BYTES,(seq+1)*CHUNK_BYTES).toString('base64')}));
}
/** Ephemeral bounded assemblies. No user work survives here. Socket replacement
 * discards them; same request-ID recovery belongs to the native ledger.
 */
export class FrameAssembler {
 /** @param {{maxMessageBytes:number,maxRetainedBytes?:number,maxPending?:number,deadlineMs?:number}} options */
 constructor(options){this.o={maxRetainedBytes:8388608,maxPending:128,deadlineMs:30000,...options};
 /** @type {Map<string,{total:number,next:number,bytes:number,chunks:Buffer[],timer:ReturnType<typeof setTimeout>}>} */this.pending=new Map();this.bytes=0;}
 /** @param {string} id */
 remove(id){const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.bytes-=p.bytes;this.pending.delete(id);}return p;}
 /** @param {string} encoded @returns {string|null} */
 feed(encoded){requireThat(Buffer.byteLength(encoded)<=MAX_FRAME_BYTES,'LIMIT_EXCEEDED','Transport frame bound');
 const frame=/** @type {{[key:string]:import('../contracts/ports.js').Json}} */(parseRecord(encoded,MAX_FRAME_BYTES));
 requireThat(frame!==null&&typeof frame==='object'&&!Array.isArray(frame),'INVALID_ARGUMENT');
 if(frame.kind!=='chunk'){requireThat(Buffer.byteLength(encoded)<=this.o.maxMessageBytes,'LIMIT_EXCEEDED');return encoded;}
 requireThat(frame.v===1&&Object.keys(frame).length===6&&typeof frame.messageId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(frame.messageId)&&
  typeof frame.seq==='number'&&Number.isInteger(frame.seq)&&typeof frame.total==='number'&&Number.isInteger(frame.total)&&frame.total>=2&&frame.total<=Math.ceil(this.o.maxMessageBytes/CHUNK_BYTES)&&
  frame.seq>=0&&frame.seq<frame.total&&typeof frame.data==='string'&&frame.data.length<=43692,'INVALID_ARGUMENT','Invalid chunk');
 const data=Buffer.from(frame.data,'base64');requireThat(data.length>0&&data.length<=CHUNK_BYTES&&data.toString('base64')===frame.data,'INVALID_ARGUMENT');
 let p=this.pending.get(frame.messageId);
 if(!p){requireThat(frame.seq===0&&this.pending.size<this.o.maxPending,'CAPACITY_REJECTED');const id=frame.messageId;
  p={total:frame.total,next:0,bytes:0,chunks:[],timer:setTimeout(()=>this.remove(id),this.o.deadlineMs)};this.pending.set(id,p);}
 requireThat(p.total===frame.total&&p.next===frame.seq,'INVALID_ARGUMENT','Out-of-order transport chunk');
 requireThat(p.bytes+data.length<=this.o.maxMessageBytes&&this.bytes+data.length<=this.o.maxRetainedBytes,'LIMIT_EXCEEDED','Assembly bound');
 p.chunks.push(data);p.bytes+=data.length;this.bytes+=data.length;p.next++;
 if(p.next!==p.total)return null;
 this.remove(frame.messageId);return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(p.chunks));
 }
 dispose(){for(const id of this.pending.keys())this.remove(id);}
}
