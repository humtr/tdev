import {capacity} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Installation-wide execution budget across binding-local durable owners.
 * Ledgers remain independent; the arbiter only observes held reservations and
 * schedules pumps. No cross-ledger transaction or work/effect ownership is added.
 */
export class InstallationExecutionArbiter {
 /** @param {number} executionCapacity */
 constructor(executionCapacity){this.executionCapacity=capacity(executionCapacity);this.installationId=null;/** @type {Set<import('./engine.mjs').DevelopmentEngine>} */this.engines=new Set();}
 /** @param {import('./engine.mjs').DevelopmentEngine} engine */
 register(engine){
  requireThat(engine.coordinator.executionCapacity===this.executionCapacity,'INTEGRITY_FAILURE','Engine capacity differs from installation budget');
  const installationId=engine.binding.installationId;if(this.installationId===null)this.installationId=installationId;else requireThat(this.installationId===installationId,'INTEGRITY_FAILURE','Execution arbiter cannot span installations');
  this.engines.add(engine);return this;
 }
 held(){let total=0;for(const engine of this.engines)if(!engine.ledger.closed)total+=engine.ledger.transact((/** @type {import('../storage/ledger.mjs').Transaction} */ tx)=>tx.reservations().length);return total;}
 available(){return this.held()<this.executionCapacity;}
 wake(){for(const engine of this.engines)queueMicrotask(()=>engine.pump());}
}
