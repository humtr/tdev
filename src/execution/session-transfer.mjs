import {bytesDigest,canonicalJson} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('./session-types.js').SessionAuthorization} Authorization */
const CHUNK_BYTES=65536;
/** Bounded immutable transport, authorized by exact selected run + assignment +
 * lease. Knowing an object digest grants no access to control or another work.
 * Partial uploads stay private ledger references until their full digest verifies.
 */
export class AssignmentTransfer {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,objects:import('../contracts/ports.js').ObjectStorePort,maxArtifactBytes?:number,maxTotalBytes?:number}} options */
 constructor(options){this.sessions=options.sessions;this.objects=options.objects;this.maxArtifactBytes=options.maxArtifactBytes??16777216;this.maxTotalBytes=options.maxTotalBytes??67108864;for(const n of [this.maxArtifactBytes,this.maxTotalBytes])requireThat(Number.isSafeInteger(n)&&n>0,'INVALID_ARGUMENT');this.sessions.ledger.transact(tx=>{
  tx.run("CREATE TABLE IF NOT EXISTS managed_artifact(assignment_id TEXT NOT NULL REFERENCES managed_assignment(assignment_id),digest TEXT NOT NULL,size INTEGER NOT NULL,state TEXT NOT NULL,PRIMARY KEY(assignment_id,digest))");
  tx.run("CREATE TABLE IF NOT EXISTS managed_chunk(assignment_id TEXT NOT NULL,digest TEXT NOT NULL,offset INTEGER NOT NULL,chunk_digest TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(assignment_id,digest,offset),FOREIGN KEY(assignment_id,digest) REFERENCES managed_artifact(assignment_id,digest))");
 });}
 /** @param {Authorization} auth @param {boolean} [write] */
 check(auth,write=false){return this.sessions.ledger.transact(tx=>{const a=this.sessions.authorizeAssignment(tx,auth.identity,auth.assignmentId,auth.leaseId);requireThat(write?a.state==='running':['offered','running'].includes(a.state),'STALE_RESULT');const s=this.sessions.session(tx,a.sessionId);requireThat(!a.cancelRequested&&!s.cancelRequested,'STALE_RESULT');return a;});}
 /** @param {Authorization} auth @param {{digest:string,offset:number,maxBytes:number}} request */
 async read(auth,request){this.check(auth);digest(request.digest);requireThat(Number.isSafeInteger(request.offset)&&request.offset>=0&&Number.isSafeInteger(request.maxBytes)&&request.maxBytes>0&&request.maxBytes<=CHUNK_BYTES,'INVALID_ARGUMENT');
  const size=this.sessions.ledger.transact(tx=>{const row=tx.get('SELECT size FROM managed_object WHERE assignment_id=? AND digest=?',auth.assignmentId,request.digest);requireThat(row,'FORBIDDEN','Object is outside this assignment');return Number(row.size);});requireThat(request.offset<=size,'INVALID_ARGUMENT');
  const bytes=await this.objects.get(request.digest);requireThat(bytes.byteLength===size&&bytesDigest(bytes)===request.digest,'INTEGRITY_FAILURE');this.check(auth);
  const chunk=Buffer.from(bytes.subarray(request.offset,Math.min(size,request.offset+request.maxBytes)));
  return {digest:request.digest,size,offset:request.offset,chunkDigest:bytesDigest(chunk),data:chunk.toString('base64'),complete:request.offset+chunk.length===size};
 }
 /** @param {Authorization} auth @param {{digest:string,size:number,offset:number,data:string}} request */
 async upload(auth,request){this.check(auth,true);digest(request.digest);requireThat(Number.isSafeInteger(request.size)&&request.size>=0&&request.size<=this.maxArtifactBytes&&Number.isSafeInteger(request.offset)&&request.offset>=0&&request.offset%CHUNK_BYTES===0&&request.offset<=request.size,'INVALID_ARGUMENT');
  requireThat(typeof request.data==='string'&&request.data.length<=4*Math.ceil(CHUNK_BYTES/3),'LIMIT_EXCEEDED');const bytes=Buffer.from(request.data,'base64');requireThat(bytes.toString('base64')===request.data&&bytes.length===Math.min(CHUNK_BYTES,request.size-request.offset),'INVALID_ARGUMENT','Canonical complete chunk required');
  const chunkDigest=bytesDigest(bytes);
  this.sessions.ledger.transact(tx=>{this.sessions.authorizeAssignment(tx,auth.identity,auth.assignmentId,auth.leaseId);const retained=tx.get('SELECT size FROM managed_artifact WHERE assignment_id=? AND digest=?',auth.assignmentId,request.digest);
   if(retained)requireThat(Number(retained.size)===request.size,'IDEMPOTENCY_MISMATCH');else{const totals=tx.get('SELECT count(*) n,coalesce(sum(size),0) total FROM managed_artifact WHERE assignment_id=?',auth.assignmentId);requireThat(Number(totals?.n)<32&&Number(totals?.total)+request.size<=this.maxTotalBytes,'LIMIT_EXCEEDED');tx.run("INSERT INTO managed_artifact VALUES(?,?,?,'partial')",auth.assignmentId,request.digest,request.size);}
   const old=tx.get('SELECT chunk_digest,size FROM managed_chunk WHERE assignment_id=? AND digest=? AND offset=?',auth.assignmentId,request.digest,request.offset);if(old)requireThat(old.chunk_digest===chunkDigest&&Number(old.size)===bytes.length,'IDEMPOTENCY_MISMATCH');
   else{const end=Number(tx.get('SELECT coalesce(max(offset+size),0) n FROM managed_chunk WHERE assignment_id=? AND digest=?',auth.assignmentId,request.digest)?.n);requireThat(end===request.offset,'INVALID_ARGUMENT','Upload must resume at the retained offset');}
  });
  requireThat(await this.objects.put(bytes)===chunkDigest,'INTEGRITY_FAILURE');this.check(auth,true);
  const chunks=this.sessions.ledger.transact(tx=>{const old=tx.get('SELECT chunk_digest,size FROM managed_chunk WHERE assignment_id=? AND digest=? AND offset=?',auth.assignmentId,request.digest,request.offset);if(old)requireThat(old.chunk_digest===chunkDigest&&Number(old.size)===bytes.length,'IDEMPOTENCY_MISMATCH');else tx.run('INSERT INTO managed_chunk VALUES(?,?,?,?,?)',auth.assignmentId,request.digest,request.offset,chunkDigest,bytes.length);return tx.all('SELECT offset,chunk_digest,size FROM managed_chunk WHERE assignment_id=? AND digest=? ORDER BY offset',auth.assignmentId,request.digest);});
  let end=0;for(const c of chunks){requireThat(Number(c.offset)===end,'INTEGRITY_FAILURE');end+=Number(c.size);}if(end<request.size)return {digest:request.digest,received:end,complete:false};
  const parts=[];for(const c of chunks){const part=await this.objects.get(String(c.chunk_digest));requireThat(part.byteLength===Number(c.size),'INTEGRITY_FAILURE');parts.push(Buffer.from(part));}const assembled=Buffer.concat(parts);requireThat(assembled.length===request.size&&bytesDigest(assembled)===request.digest,'INTEGRITY_FAILURE','Final artifact digest mismatch');
  requireThat(await this.objects.put(assembled)===request.digest,'INTEGRITY_FAILURE');this.check(auth,true);
  this.sessions.ledger.transact(tx=>tx.run("UPDATE managed_artifact SET state='ready' WHERE assignment_id=? AND digest=? AND size=?",auth.assignmentId,request.digest,request.size));return {digest:request.digest,received:end,complete:true};
 }
}
