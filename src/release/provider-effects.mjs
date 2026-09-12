import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {id,digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {{effectId:string,inputDigest:string,requestDigest:string,operation:'version.upload'|'deployment.activate',state:'planned'|'sent'|'confirmed',ownerEpoch:string,response:import('../contracts/ports.js').Json|null}} ProviderEffect */
/** Operational provider effects live in the fixed helper's existing SQLite
 * journal, not another work queue. A helper restart fences the old HTTP sender;
 * it does not prove a sent provider request was rejected. Such requests reconcile
 * by exact provider identity and are NEVER implicitly reset to planned.
 */
export class ProviderEffects {
 /** @param {import('./journal.mjs').ActivationJournal} journal */
 constructor(journal){this.journal=journal;this.ownerEpoch=journal.ownerEpoch;/** @type {Map<string,Promise<unknown>>} */this.running=new Map();}
 assert(){requireThat(!this.journal.closed&&this.journal.ownerEpoch===this.ownerEpoch,'STALE_REVISION','Stale fixed helper provider continuation');}
 /** @param {string} effectId @returns {ProviderEffect|null} */
 read(effectId){id(effectId);this.assert();const row=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get('provider.effect:'+effectId);return row?/** @type {ProviderEffect} */(parseRecord(String(row.value),1048576)):null;}
 /** @param {Pick<ProviderEffect,'effectId'|'inputDigest'|'requestDigest'|'operation'>} input */
 plan(input){id(input.effectId);digest(input.inputDigest);digest(input.requestDigest);requireThat(['version.upload','deployment.activate'].includes(input.operation),'INVALID_ARGUMENT');this.assert();return this.journal.transact(()=>{this.assert();const old=this.read(input.effectId);if(old){requireThat(old.inputDigest===input.inputDigest&&old.requestDigest===input.requestDigest&&old.operation===input.operation,'IDEMPOTENCY_MISMATCH');return old;}
  /** @type {ProviderEffect} */const record={...input,state:'planned',ownerEpoch:this.ownerEpoch,response:null};this.journal.db.prepare('INSERT INTO meta VALUES(?,?)').run('provider.effect:'+input.effectId,canonicalJson(record));return record;
 });}
 /** This compare-and-set is the only permission to send the HTTP mutation.
  * A false return means observe the already retained effect, never send again.
  * @param {string} effectId */
 markSent(effectId){this.assert();return this.journal.transact(()=>{this.assert();const old=this.read(effectId);requireThat(old,'INTEGRITY_FAILURE');if(old.state!=='planned')return false;const record={...old,state:'sent',ownerEpoch:this.ownerEpoch};this.journal.db.prepare('UPDATE meta SET value=? WHERE key=?').run(canonicalJson(record),'provider.effect:'+effectId);return true;});}
 /** @param {string} effectId @param {string} inputDigest @param {import('../contracts/ports.js').Json} response */
 confirm(effectId,inputDigest,response){digest(inputDigest);const bytes=canonicalJson(response);requireThat(Buffer.byteLength(bytes)<=262144,'LIMIT_EXCEEDED');this.assert();return this.journal.transact(()=>{this.assert();const old=this.read(effectId);requireThat(old&&old.inputDigest===inputDigest&&old.state!=='planned','INTEGRITY_FAILURE');if(old.state==='confirmed')requireThat(canonicalJson(old.response)===bytes,'INTEGRITY_FAILURE','Provider identity changed');const record={...old,state:/** @type {const} */('confirmed'),response};this.journal.db.prepare('UPDATE meta SET value=? WHERE key=?').run(canonicalJson(record),'provider.effect:'+effectId);return record;});}
 /** @template T @param {string} effectId @param {()=>Promise<T>} operation @returns {Promise<T>} */
 once(effectId,operation){this.assert();const prior=this.running.get(effectId);if(prior)return /** @type {Promise<T>} */(prior);const run=operation().finally(()=>this.running.delete(effectId));this.running.set(effectId,run);return run;}
}
