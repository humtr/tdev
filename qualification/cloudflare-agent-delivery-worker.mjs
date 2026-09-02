import { DurableObject } from 'cloudflare:workers';
import {
  D0020QualificationAgentDeliveryDOHost,
  D0020QualificationService,
} from './cloudflare-agent-delivery-runtime.mjs';
import { AgentRouteElectionRuntimeDOHost } from '../src/cloudflare-agent-route-election-runtime.mjs';
import { D0044ProviderQualificationService } from './cloudflare-agent-route-election-qualification.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';

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

  async d0044DiagnosticInvoke(agentId, routeGeneration) {
    if (this.qualificationConstructionFailure !== null) {
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: { constructed: false, failure: this.qualificationConstructionFailure },
      };
    }
    try {
      const response = await this.qualification.qualificationInvoke({
        profile: QUALIFICATION_RPC_PROFILE,
        operation: 'd0040_evidence_attestor_readback',
        agentId,
        routeGeneration,
      });
      if (response?.ok === true) {
        const result = response.result;
        return {
          profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
          schemaVersion: 1,
          ok: true,
          result: {
            constructed: true,
            qualificationInvoke: {
              ok: true,
              resultKeys: result && typeof result === 'object' && !Array.isArray(result) ? Object.keys(result).sort() : [],
            },
          },
        };
      }
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: {
          constructed: true,
          qualificationInvoke: {
            ok: false,
            errorCode: typeof response?.error?.code === 'string' ? response.error.code : null,
          },
        },
      };
    } catch (error) {
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: {
          constructed: true,
          qualificationInvoke: { ok: false, failure: diagnosticFailure(error) },
        },
      };
    }
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
  d0044ElectionDiagnosticInvoke(agentId) {
    try {
      const result = this.election.readAgentRouteElection(agentId);
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: { readOk: true, statePresent: result !== null },
      };
    } catch (error) {
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: { readOk: false, failure: diagnosticFailure(error) },
      };
    }
  }
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
