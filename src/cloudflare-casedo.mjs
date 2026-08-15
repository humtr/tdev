import { DurableObject } from 'cloudflare:workers';
import { CaseRuntimeDOHost } from './cloudflare-casedo-runtime.mjs';

export class CaseRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = new CaseRuntimeDOHost(ctx, env);
  }

  initializeElectedCase(input) {
    return this.host.initializeElectedCase(input);
  }

  loadCase(input) {
    return this.host.loadCase(input);
  }

  command(input) {
    return this.host.command(input);
  }

  recoverExecutionOwnerLoss(input) {
    return this.host.recoverExecutionOwnerLoss(input);
  }
}
