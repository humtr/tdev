import {canonicalJson} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest,id} from '../contracts/identity.mjs';
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('./session-types.js').AssignedInput} AssignedInput */
/** Exact non-secret target identity carried by every new managed assignment. The
 * controller repository remains the provider-launch authority; this tuple selects
 * only the target binding whose durable Attempt/result is being executed.
 * @param {Binding} binding */
export function managedTarget(binding){return {installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,provider:binding.provider,providerRepositoryId:binding.providerRepositoryId,ref:binding.ref,policyDigest:binding.policyDigest};}
/** Registry of binding-local durable Attempt owners used by one managed controller.
 * It never mutates target ledgers and never creates a cross-ledger transaction.
 */
export class ManagedTargets {
 /** @param {Binding} controllerBinding @param {import('../storage/ledger.mjs').Ledger} controllerLedger */
 constructor(controllerBinding,controllerLedger){this.controllerBinding=structuredClone(controllerBinding);/** @type {Map<string,{binding:Binding,ledger:import('../storage/ledger.mjs').Ledger}>} */this.owners=new Map();this.register(controllerBinding,controllerLedger);}
 /** @param {Binding} binding @param {import('../storage/ledger.mjs').Ledger} ledger */
 register(binding,ledger){requireThat(binding.installationId===this.controllerBinding.installationId&&canonicalJson(ledger.binding)===canonicalJson(binding),'INTEGRITY_FAILURE','Managed target ledger binding differs');const prior=this.owners.get(binding.repositoryId);if(prior){requireThat(prior.ledger===ledger&&canonicalJson(prior.binding)===canonicalJson(binding),'INTEGRITY_FAILURE','Managed target binding changed without a new registry');return this;}this.owners.set(binding.repositoryId,{binding:structuredClone(binding),ledger});return this;}
 /** Project only the installation-wide active policy register into managed runtime
  * views. Repository/ref/epoch identity remains the cloned registry identity and
  * each Ledger's durable binding row remains the original enrollment record.
  * @param {string} value */
 projectPolicyDigest(value){const next=digest(value);this.controllerBinding.policyDigest=next;for(const owner of this.owners.values()){owner.binding.policyDigest=next;owner.ledger.binding.policyDigest=next;}return next;}
 /** @param {string} repositoryId */
 owner(repositoryId){id(repositoryId);const owner=this.owners.get(repositoryId);requireThat(owner,'FORBIDDEN','Managed target binding is not installed');return owner;}
 /** @param {AssignedInput} input */
 ownerForInput(input){const requested=input.target??(input.attempt.repositoryId===this.controllerBinding.repositoryId?managedTarget(this.controllerBinding):null);requireThat(requested,'FORBIDDEN','Legacy managed assignment is not controller-bound');const owner=this.owner(requested.repositoryId),expected=managedTarget(owner.binding);requireThat(canonicalJson(requested)===canonicalJson(expected),'FORBIDDEN','Managed target binding identity changed');return owner;}
 /** Recheck only the immutable held reservation. This is the pre-C2 compatibility
 * fence for retained controller-binding assignments whose input has no target tuple.
 * New assignments always carry `target` and use current() below.
 * @param {Attempt} attempt */
 retained(attempt){const owner=this.owner(attempt.repositoryId),b=owner.binding;requireThat(attempt.installationId===b.installationId,'FORBIDDEN','Managed target installation differs');return owner.ledger.transact((/** @type {import('../storage/ledger.mjs').Transaction} */ tx)=>{const held=tx.retainedAttempt(attempt.attemptId);requireThat(held?.held&&canonicalJson(held.attempt)===canonicalJson(attempt),'STALE_REVISION','Managed target reservation changed');return {owner,action:tx.getAction(attempt.actionId),cancelRequested:!!tx.get('SELECT value FROM meta WHERE key=?','cancel:'+attempt.actionId)};});}
 /** Recheck the exact binding-local durable current owner for every new C2 target.
 * This read transaction is complete before any controller-ledger transaction starts;
 * JavaScript performs no await between this fence and the caller's following
 * synchronous controller mutation. @param {Attempt} attempt */
 current(attempt){const owner=this.owner(attempt.repositoryId),b=owner.binding;requireThat(attempt.installationId===b.installationId,'FORBIDDEN','Managed target installation differs');return owner.ledger.transact((/** @type {import('../storage/ledger.mjs').Transaction} */ tx)=>{const held=tx.retainedAttempt(attempt.attemptId),action=tx.getAction(attempt.actionId),work=tx.getWork(attempt.workId),release=action?.operation==='release.stage'&&action.workId===null&&attempt.workId===action.actionId&&action.attempt===attempt.attempt&&!tx.get('SELECT value FROM meta WHERE key=?','cancel:'+action.actionId),cancelRequested=!!tx.get('SELECT value FROM meta WHERE key=?','cancel:'+attempt.actionId);requireThat(held?.held&&held.observerEpoch===owner.ledger.ownerEpoch&&canonicalJson(held.attempt)===canonicalJson(attempt)&&action&&action.ownerEpoch===owner.ledger.ownerEpoch&&action.status==='running'&&(release||work?.disposition==='open'&&work.currentActionId===action.actionId),'STALE_REVISION','Managed target work owner changed');return {owner,action,cancelRequested};});}
 /** @param {AssignedInput} input */
 checkInput(input){const owner=this.ownerForInput(input);requireThat(input.attempt.installationId===owner.binding.installationId&&input.attempt.repositoryId===owner.binding.repositoryId,'FORBIDDEN','Managed assignment target differs');return input.target?this.current(input.attempt):this.retained(input.attempt);}
}
