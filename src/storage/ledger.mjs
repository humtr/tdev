import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,realpathSync,lstatSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { canonicalJson,parseRecord } from '../contracts/canonical.mjs';
import { nextRevision,capacity,id } from '../contracts/identity.mjs';
import { requireThat,Dev2Error } from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').PreparedResult} PreparedResult */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} ValidationReceipt */
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {{attempt:Attempt,observerEpoch:string}} Reservation */
/** @param {unknown} row @returns {unknown|null} */
function decode(row) {return row&&typeof row==='object'&&'record'in row&&typeof row.record==='string'?parseRecord(row.record):null;}
const SCHEMA=`
CREATE TABLE binding(singleton INTEGER PRIMARY KEY CHECK(singleton=1),record TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE work(seq INTEGER PRIMARY KEY AUTOINCREMENT,work_id TEXT UNIQUE NOT NULL,principal TEXT NOT NULL,revision TEXT NOT NULL,disposition TEXT NOT NULL,record TEXT NOT NULL);
CREATE TABLE action(seq INTEGER PRIMARY KEY AUTOINCREMENT,action_id TEXT UNIQUE NOT NULL,principal TEXT NOT NULL,epoch TEXT NOT NULL,request_id TEXT NOT NULL,work_id TEXT REFERENCES work(work_id),status TEXT NOT NULL,record TEXT NOT NULL,intent TEXT NOT NULL,UNIQUE(principal,epoch,request_id));
CREATE INDEX action_ready ON action(status,principal,seq);
CREATE TABLE attempt(attempt_id TEXT PRIMARY KEY,action_id TEXT UNIQUE NOT NULL REFERENCES action(action_id),observer_epoch TEXT NOT NULL,record TEXT NOT NULL);
CREATE TABLE prepared(result_id TEXT PRIMARY KEY,work_id TEXT NOT NULL REFERENCES work(work_id),record TEXT NOT NULL);
CREATE TABLE validation(run_id TEXT PRIMARY KEY,result_id TEXT NOT NULL REFERENCES prepared(result_id),validation_id TEXT NOT NULL,record TEXT NOT NULL);
CREATE TABLE effect(effect_id TEXT PRIMARY KEY,action_id TEXT UNIQUE NOT NULL REFERENCES action(action_id),record TEXT NOT NULL);
PRAGMA user_version=1;
`;

/** One OS-locked SQLite connection per repository. No network, materialization or process wait in transactions. */
export class Ledger {
  /** @param {string} filename @param {Binding} binding */
  constructor(filename,binding) {
    this.inTransaction=false;this.closed=false;this.maxTransactionMs=0;
    if(filename!==':memory:') {const directory=dirname(resolve(filename));mkdirSync(directory,{recursive:true,mode:0o700});
      requireThat(realpathSync(directory)===directory,'INTEGRITY_FAILURE');
      try{requireThat(!lstatSync(filename).isSymbolicLink(),'INTEGRITY_FAILURE');}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}}
    this.db=new DatabaseSync(filename);
    try {
      this.db.exec('PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
      this.db.exec('BEGIN EXCLUSIVE');
      const version=this.db.prepare('PRAGMA user_version').get()?.user_version;
      requireThat(version===0||version===1,'INTEGRITY_FAILURE','Unsupported ledger version');
      if(version===0){requireThat(this.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get()?.n===0,'INTEGRITY_FAILURE');this.db.exec(SCHEMA);}
      const retained=decode(this.db.prepare('SELECT record FROM binding WHERE singleton=1').get());
      if(retained)requireThat(canonicalJson(retained)===canonicalJson(binding),'FORBIDDEN','Binding epoch mismatch');
      else this.db.prepare('INSERT INTO binding VALUES(1,?)').run(canonicalJson(binding));
      const previous=this.db.prepare("SELECT value FROM meta WHERE key='ownerEpoch'").get()?.value;
      this.ownerEpoch=nextRevision(typeof previous==='string'?previous:'0');
      this.db.prepare("INSERT INTO meta(key,value) VALUES('ownerEpoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.ownerEpoch);
      this.db.exec('COMMIT');this.binding=structuredClone(binding);
    } catch(e) {try{this.db.exec('ROLLBACK');}catch{}this.db.close();this.closed=true;
      if(e instanceof Dev2Error)throw e;throw new Dev2Error('EXECUTION_UNAVAILABLE','Ledger is locked or unavailable');}
  }
  /** @template T @param {(tx:Transaction)=>T} fn @returns {T} */
  transact(fn) {
    requireThat(!this.closed&&!this.inTransaction,'INTEGRITY_FAILURE','Nested/closed transaction');
    this.inTransaction=true;const started=performance.now();const tx=new Transaction(this);
    try {this.db.exec('BEGIN IMMEDIATE');const result=fn(tx);
      requireThat(!(result&&['object','function'].includes(typeof result)&&'then'in Object(result)),'INVALID_ARGUMENT','Transaction callback must be synchronous');
      this.db.exec('COMMIT');return result;
    }catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}
    finally{tx.active=false;this.inTransaction=false;this.maxTransactionMs=Math.max(this.maxTransactionMs,performance.now()-started);}
  }
  close(){requireThat(!this.inTransaction,'INTEGRITY_FAILURE');if(!this.closed){this.db.close();this.closed=true;}}
}

export class Transaction {
  /** @param {Ledger} ledger */
  constructor(ledger){this.ledger=ledger;this.active=true;}
  check(){requireThat(this.active&&this.ledger.inTransaction,'INTEGRITY_FAILURE','Escaped transaction');}
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} params */
  run(sql,...params){this.check();return this.ledger.db.prepare(sql).run(...params);}
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} params */
  get(sql,...params){this.check();return this.ledger.db.prepare(sql).get(...params);}
  /** @param {string} sql @param {...import('node:sqlite').SQLInputValue} params */
  all(sql,...params){this.check();return this.ledger.db.prepare(sql).all(...params);}
  /** @param {string} workId @returns {Work|null} */
  getWork(workId){return /** @type {Work|null} */(decode(this.get('SELECT record FROM work WHERE work_id=?',workId)));}
  /** @param {string} actionId @returns {Action|null} */
  getAction(actionId){return /** @type {Action|null} */(decode(this.get('SELECT record FROM action WHERE action_id=?',actionId)));}
  /** @param {string} principal @param {string} epoch @param {string} requestId @returns {Action|null} */
  lookupRequest(principal,epoch,requestId){return /** @type {Action|null} */(decode(this.get('SELECT record FROM action WHERE principal=? AND epoch=? AND request_id=?',principal,epoch,requestId)));}
  /** @param {Work} work */
  insertWork(work){id(work.workId);requireThat(work.repositoryId===this.ledger.binding.repositoryId&&work.bindingEpoch===this.ledger.binding.bindingEpoch,'FORBIDDEN');
    this.run('INSERT INTO work(work_id,principal,revision,disposition,record) VALUES(?,?,?,?,?)',work.workId,work.principal,work.revision,work.disposition,canonicalJson(work));}
  /** @param {Action} action @param {unknown} [intent] */
  insertAction(action,intent=null){id(action.actionId);this.run('INSERT INTO action(action_id,principal,epoch,request_id,work_id,status,record,intent) VALUES(?,?,?,?,?,?,?,?)',action.actionId,action.principal,action.bindingEpoch,action.requestId,action.workId,action.status,canonicalJson(action),canonicalJson(intent));this.run('INSERT INTO meta(key,value) VALUES(?,?)','actionRevision:'+action.actionId,'0');}
  /** @param {string} expected @param {Work} replacement */
  compareWork(expected,replacement){const old=this.getWork(replacement.workId);if(!old||old.revision!==expected)return false;
    requireThat(old.disposition==='open'&&replacement.revision===nextRevision(expected)&&old.principal===replacement.principal&&old.repositoryId===replacement.repositoryId&&old.bindingEpoch===replacement.bindingEpoch&&old.baseCommitOid===replacement.baseCommitOid&&old.baseTreeOid===replacement.baseTreeOid,'INTEGRITY_FAILURE');
    return this.run('UPDATE work SET revision=?,disposition=?,record=? WHERE work_id=? AND revision=?',replacement.revision,replacement.disposition,canonicalJson(replacement),replacement.workId,expected).changes===1;}
  /** @param {Action} action */
  updateAction(action){const old=this.getAction(action.actionId);requireThat(old,'INTEGRITY_FAILURE');
    requireThat(old.intentDigest===action.intentDigest&&old.requestId===action.requestId&&old.principal===action.principal&&old.bindingEpoch===action.bindingEpoch&&old.operation===action.operation&&old.workId===action.workId,'INTEGRITY_FAILURE');
    if(['succeeded','failed','cancelled'].includes(old.status)){requireThat(canonicalJson(old)===canonicalJson(action),'INTEGRITY_FAILURE','Terminal receipt is immutable');return;}
    const transitions={queued:['queued','running','cancelled'],running:['running','blocked','succeeded','failed','cancelled'],blocked:['blocked','queued','succeeded','failed','cancelled']};
    requireThat(transitions[/** @type {'queued'|'running'|'blocked'} */(old.status)]?.includes(action.status),'INTEGRITY_FAILURE','Action transition');
    this.run('UPDATE action SET status=?,record=? WHERE action_id=?',action.status,canonicalJson(action),action.actionId);const revision=String(this.get('SELECT value FROM meta WHERE key=?','actionRevision:'+action.actionId)?.value??'0');this.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','actionRevision:'+action.actionId,nextRevision(revision));}
  /** @param {Attempt} attempt @param {number} limit */
  reserveAttempt(attempt,limit){capacity(limit);const old=this.get('SELECT record FROM attempt WHERE attempt_id=?',attempt.attemptId);
    if(old){requireThat(canonicalJson(decode(old))===canonicalJson(attempt),'IDEMPOTENCY_MISMATCH');return true;}
    if(Number(this.get('SELECT count(*) n FROM attempt')?.n)>=limit)return false;
    requireThat(attempt.repositoryId===this.ledger.binding.repositoryId&&attempt.ownerEpoch===this.ledger.ownerEpoch,'FORBIDDEN');
    this.run('INSERT INTO attempt VALUES(?,?,?,?)',attempt.attemptId,attempt.actionId,this.ledger.ownerEpoch,canonicalJson(attempt));return true;}
  /** Called only after verified stopped/absent state by the work coordinator. @param {string} attemptId */
  releaseAttempt(attemptId){this.run('DELETE FROM attempt WHERE attempt_id=?',attemptId);}
  /** @returns {Reservation[]} */
  reservations(){return this.all('SELECT record,observer_epoch FROM attempt ORDER BY action_id').map(r=>({attempt:/** @type {Attempt} */(decode(r)),observerEpoch:String(r.observer_epoch)}));}
  /** Adoption changes callback authority, never the immutable launch/container identity. @param {string} attemptId */
  adoptAttempt(attemptId){this.run('UPDATE attempt SET observer_epoch=? WHERE attempt_id=?',this.ledger.ownerEpoch,attemptId);}
  /** @param {PreparedResult} result */
  putPrepared(result){const old=this.getPrepared(result.resultId);if(old){requireThat(canonicalJson(old)===canonicalJson(result),'INTEGRITY_FAILURE');return;}
    this.run('INSERT INTO prepared VALUES(?,?,?)',result.resultId,result.workId,canonicalJson(result));}
  /** @param {string} resultId @returns {PreparedResult|null} */
  getPrepared(resultId){return /** @type {PreparedResult|null} */(decode(this.get('SELECT record FROM prepared WHERE result_id=?',resultId)));}
  /** @param {ValidationReceipt} receipt */
  putReceipt(receipt){const old=this.get('SELECT record FROM validation WHERE run_id=?',receipt.runId);if(old){requireThat(canonicalJson(decode(old))===canonicalJson(receipt),'INTEGRITY_FAILURE');return;}
    this.run('INSERT INTO validation VALUES(?,?,?,?)',receipt.runId,receipt.resultId,receipt.validationId,canonicalJson(receipt));}
  /** @param {Effect} effect */
  putEffect(effect){const old=decode(this.get('SELECT record FROM effect WHERE effect_id=?',effect.effectId));if(old){requireThat(canonicalJson(old)===canonicalJson(effect),'INTEGRITY_FAILURE');return;}
    this.run('INSERT INTO effect VALUES(?,?,?)',effect.effectId,effect.actionId,canonicalJson(effect));}
  /** @param {string} actionId @returns {Effect|null} */
  getEffect(actionId){return /** @type {Effect|null} */(decode(this.get('SELECT record FROM effect WHERE action_id=?',actionId)));}
  /** @param {string} actionId */
  intent(actionId){const row=this.get('SELECT intent FROM action WHERE action_id=?',actionId);requireThat(typeof row?.intent==='string','INTEGRITY_FAILURE');return parseRecord(row.intent);}
  /** @param {string} principal @param {number} [after] @param {number} [limit] */
  listOpen(principal,after=0,limit=32){requireThat(Number.isSafeInteger(after)&&after>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=128,'INVALID_ARGUMENT');
    return this.all("SELECT seq,record FROM work WHERE principal=? AND disposition='open' AND seq>? ORDER BY seq LIMIT ?",principal,after,limit).map(r=>({sequence:Number(r.seq),work:/** @type {Work} */(decode(r))}));}
}
