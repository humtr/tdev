import { DurableObject } from 'cloudflare:workers';
import {
  D0020QualificationAgentDeliveryDOHost,
  D0020QualificationService,
} from './cloudflare-agent-delivery-runtime.mjs';
import { AgentRouteElectionRuntimeDOHost } from '../src/cloudflare-agent-route-election-runtime.mjs';
import { D0044ProviderQualificationService } from './cloudflare-agent-route-election-qualification.mjs';

const D0044_PROVIDER_DIAGNOSTIC_PROFILE = 'tdev.d0044-provider-diagnostic.v1';

function diagnosticFailure(error) {
  const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_$]{0,63}$/.test(error.name) ? error.name : 'unknown';
  const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(error.code) ? error.code : null;
  return Object.freeze({ name, code });
}

export class AgentDeliveryRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.qualification = null;
    this.qualificationConstructionFailure = null;
    try {
      this.qualification = new D0020QualificationAgentDeliveryDOHost(ctx, env);
    } catch (error) {
      this.qualificationConstructionFailure = diagnosticFailure(error);
    }
  }

  fetch(request) {
    return this.qualification.fetch(request);
  }

  qualificationInvoke(input) {
    return this.qualification.qualificationInvoke(input);
  }

  d0044DiagnosticInvoke() {
    return {
      profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
      schemaVersion: 1,
      ok: true,
      result: this.qualificationConstructionFailure === null
        ? { constructed: true }
        : { constructed: false, failure: this.qualificationConstructionFailure },
    };
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

export class AgentRouteElectionRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.election = new AgentRouteElectionRuntimeDOHost(ctx, env);
  }
  readAgentRouteElection(agentId) { return this.election.readAgentRouteElection(agentId); }
  createAgentRouteGenesis(agentId, input) { return this.election.createAgentRouteGenesis(agentId, input); }
  importLegacyAgentRoute(agentId, input) { return this.election.importLegacyAgentRoute(agentId, input); }
  prepareAgentRouteCutover(agentId, input) { return this.election.prepareAgentRouteCutover(agentId, input); }
  recordAgentRoutePredecessorExclusion(agentId, input) { return this.election.recordAgentRoutePredecessorExclusion(agentId, input); }
  recordAgentRouteSuccessorStandby(agentId, input) { return this.election.recordAgentRouteSuccessorStandby(agentId, input); }
  commitAgentRouteCutover(agentId, input) { return this.election.commitAgentRouteCutover(agentId, input); }
}

export default {
  fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/qualification/d0044/election/v1' || pathname === '/qualification/d0044/delivery/v1') {
      return new D0044ProviderQualificationService(env).fetch(request);
    }
    return new D0020QualificationService(env).fetch(request);
  },
};
