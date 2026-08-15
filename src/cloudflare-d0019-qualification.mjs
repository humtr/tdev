import { DurableObject } from 'cloudflare:workers';
import {
  D0019QualificationCaseDOHost,
  D0019QualificationService,
} from './d0019-qualification-runtime.mjs';

export class CaseRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.qualification = new D0019QualificationCaseDOHost(ctx, env);
  }

  initializeElectedCase(input) {
    return this.qualification.initializeElectedCase(input);
  }

  loadCase(input) {
    return this.qualification.loadCase(input);
  }

  command(input) {
    return this.qualification.command(input);
  }

  recoverExecutionOwnerLoss(input) {
    return this.qualification.recoverExecutionOwnerLoss(input);
  }

  qualificationAbortInstance(input) {
    return this.qualification.qualificationAbortInstance(input);
  }

  qualificationCommandThenAbort(input) {
    return this.qualification.qualificationCommandThenAbort(input);
  }
}

export default {
  fetch(request, env) {
    return new D0019QualificationService(env).fetch(request);
  },
};
