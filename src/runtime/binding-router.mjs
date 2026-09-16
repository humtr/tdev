import {requireThat} from '../contracts/errors.mjs';
/** Same-public-schema bootstrap release. Public routing remains primary-only.
 * The final C2 release replaces this static source; no runtime selector flag exists.
 */
export class BindingRouterApplication {
 /** @param {{applications:readonly import('./application.mjs').DevelopmentApplication[],primaryRepositoryId:string,now?:()=>number}} options */
 constructor(options){
  const primary=options.applications.find(app=>app.engine.binding.repositoryId===options.primaryRepositoryId);
  requireThat(primary,'INTEGRITY_FAILURE','Primary binding missing');this.primary=primary;
 }
 /** @param {import('../contracts/ports.js').Principal} principal @param {string} name @param {unknown} input @param {AbortSignal} [signal] */
 invoke(principal,name,input,signal){return this.primary.invoke(principal,name,input,signal);}
}
