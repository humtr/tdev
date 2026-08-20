import { DurableObject } from 'cloudflare:workers';
import {
  D0020QualificationAgentDeliveryDOHost,
  D0020QualificationService,
} from './cloudflare-agent-delivery-runtime.mjs';

export class AgentDeliveryRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.qualification = new D0020QualificationAgentDeliveryDOHost(ctx, env);
  }

  fetch(request) {
    return this.qualification.fetch(request);
  }

  qualificationInvoke(input) {
    return this.qualification.qualificationInvoke(input);
  }

  webSocketMessage(socket, message) {
    return this.qualification.webSocketMessage(socket, message);
  }

  webSocketClose(socket, code, reason, wasClean) {
    return this.qualification.webSocketClose(socket, code, reason, wasClean);
  }

  webSocketError(socket, error) {
    return this.qualification.webSocketError(socket, error);
  }
}

export default {
  fetch(request, env) {
    return new D0020QualificationService(env).fetch(request);
  },
};
