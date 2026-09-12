import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,lstatSync,realpathSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {nextRevision,id} from '../contracts/identity.mjs';
import {Dev2Error,requireThat} from '../contracts/errors.mjs';
import {activationIntent} from './manifest.mjs';
/** @typedef {import('./types.js').ActivationIntent} Intent */
/** @typedef {import('./types.js').ActivationRecord} Record */
/** Fixed-helper journal is separate from the replaceable broker's exclusive
 * work connection. It is not another development queue or cloud ledger. One OS
 * owner retains one activation fence until exact active/rolled-back readback.
 */
export class ActivationJournal {
 /** @param {string} filename @param {string} installationId */
 constructor(filename,installationId){
  id(installationId);this.installationId=installationId;this.closed=false;this.inTransaction=false;
  if(filename!==':memory:'){
   const parent=dirname(resolve(filename));mkdirSync(parent,{recursive:true,mode:0o700});
   requireThat(realpathSync(parent)===parent&&(lstatSync(parent).mode&0o077)===0,'FORBIDDEN','Helper journal must be app-private');
   try{const s=lstatSync(filename);requireThat(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'FORBIDDEN');}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
  }
  this.db=new DatabaseSync(filename,{allowExtension:false});
  try{
   if(filename!==':memory:')chmodSync(filename,0o600);
   this.db.exec('PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN EXCLUSIVE');
   const version=this.db.prepare('PRAGMA user_version').get()?.user_version;requireThat(version===0||version===1,'INTEGRITY_FAILURE');
   if(version===0){requireThat(this.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get()?.n===0,'INTEGRITY_FAILURE');this.db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE activation(id TEXT PRIMARY KEY,revision TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),record TEXT NOT NULL); CREATE UNIQUE INDEX one_active ON activation(active) WHERE active=1; PRAGMA user_version=1;');}
   const installed=this.db.prepare("SELECT value FROM meta WHERE key='installation'").get()?.value;
   if(installed!==undefined)requireThat(installed===installationId,'FORBIDDEN');else this.db.prepare('INSERT INTO meta VALUES(?,?)').run('installation',installationId);
   const epoch=this.db.prepare("SELECT value FROM meta WHERE key='epoch'").get()?.value;this.ownerEpoch=nextRevision(typeof epoch==='string'?epoch:'0');this.db.prepare("INSERT INTO meta VALUES('epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.ownerEpoch);
   this.db.exec('COMMIT');
  }catch(error){try{this.db.exec('ROLLBACK');}catch{}this.db.close();this.closed=true;if(error instanceof Dev2Error)throw error;throw new Dev2Error('EXECUTION_UNAVAILABLE','Activation helper is locked or unavailable');}
 }
 /** @template T @param {()=>T} fn @returns {T} */
 transact(fn){requireThat(!this.closed&&!this.inTransaction,'INTEGRITY_FAILURE');this.inTransaction=true;try{this.db.exec('BEGIN IMMEDIATE');const result=fn();requireThat(!(result&&typeof result==='object'&&'then'in result),'INVALID_ARGUMENT');this.db.exec('COMMIT');return result;}catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}finally{this.inTransaction=false;}}
 /** @param {string} activationId @returns {Record|null} */
 read(activationId){id(activationId);requireThat(!this.closed,'INTEGRITY_FAILURE');const row=this.db.prepare('SELECT record FROM activation WHERE id=?').get(activationId);return row?/** @type {Record} */(parseRecord(String(row.record),262144)):null;}
 /** @returns {Record|null} */
 active(){requireThat(!this.closed,'INTEGRITY_FAILURE');const row=this.db.prepare('SELECT record FROM activation WHERE active=1').get();return row?/** @type {Record} */(parseRecord(String(row.record),262144)):null;}
 /** Intent durability precedes any provider/launcher effect. @param {Intent} input @returns {Record} */
 begin(input){const intent=activationIntent(input);requireThat(intent.installationId===this.installationId,'FORBIDDEN');const intentDigest=recordDigest('dev2.activation-intent.v1',intent);
  return this.transact(()=>{const old=this.read(intent.activationId);if(old){requireThat(old.intentDigest===intentDigest,'IDEMPOTENCY_MISMATCH');return old;}
   requireThat(this.active()===null,'CAPACITY_REJECTED','Another activation owns this installation; unrelated source work is not blocked');
   /** @type {Record} */const record={intent,intentDigest,revision:'0',direction:'forward',cursor:0,phase:'prepared',pending:null,receipts:[],reason:null,observedPair:null};
   this.db.prepare('INSERT INTO activation VALUES(?,?,1,?)').run(intent.activationId,record.revision,canonicalJson(record));return record;
  });
 }
 /** @param {string} expectedRevision @param {Record} replacement @param {string} ownerEpoch @returns {Record} */
 replace(expectedRevision,replacement,ownerEpoch){return this.transact(()=>{
  requireThat(ownerEpoch===this.ownerEpoch,'STALE_REVISION','Stale helper continuation');const old=this.read(replacement.intent.activationId);requireThat(old&&old.revision===expectedRevision,'STALE_REVISION');
  requireThat(old.intentDigest===replacement.intentDigest&&canonicalJson(old.intent)===canonicalJson(replacement.intent),'INTEGRITY_FAILURE');
  requireThat(!['active','rolled_back'].includes(old.phase),'INTEGRITY_FAILURE','Terminal activation is immutable');
  const record={...structuredClone(replacement),revision:nextRevision(expectedRevision)},text=canonicalJson(record);requireThat(Buffer.byteLength(text)<=262144,'LIMIT_EXCEEDED');
  const active=['active','rolled_back'].includes(record.phase)?0:1;
  requireThat(this.db.prepare('UPDATE activation SET revision=?,active=?,record=? WHERE id=? AND revision=?').run(record.revision,active,text,record.intent.activationId,expectedRevision).changes===1,'STALE_REVISION');return record;
 });}
 close(){requireThat(!this.inTransaction,'INTEGRITY_FAILURE');if(!this.closed){this.db.close();this.closed=true;}}
}
