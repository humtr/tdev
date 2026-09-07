import { DurableObject } from 'cloudflare:workers';
import { CaseAgentDriveRuntimeDOHost } from '../src/cloudflare-case-agent-drive-runtime.mjs';
import { canonicalClone, canonicalJson, isPlainRecord, publicJsonClone } from '../src/canonical.mjs';
import { createCasePlacement } from '../src/casedo-authority.mjs';
import { defineDevelopmentUnitPlan } from '../src/development-unit.mjs';
import { namespaceFor, normalizeMcpTrialCompositionBinding } from '../src/mcp-trial-composition.mjs';
import { createTrialApplication } from './cloudflare-mcp-trial-worker.mjs';

const TRIAL_EXECUTION_OPERATIONS = new Set([
  'repository.create',
  'repository.load',
  'repository.command',
  'runner.create',
  'runner.drive',
  'runner.candidate',
  'developmentUnitStart',
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertExecutionInput(input) {
  if (!isPlainRecord(input) || !TRIAL_EXECUTION_OPERATIONS.has(input.operation) || !isPlainRecord(input.input)) {
    fail('mcp_trial_execution_invalid', 'Trial execution RPC request is outside the fixed operation allowlist');
  }
  return { operation: input.operation, input: canonicalClone(input.input) };
}

function plainOwnerResult(value) {
  if (value && typeof value.snapshot === 'function') return value.snapshot();
  if (value && typeof value === 'object' && value.engine && typeof value.engine.snapshot === 'function') {
    return { ...value, engine: value.engine.snapshot() };
  }
  return value;
}

// D0046's trial-only Durable Object. It exposes only the D0042 intent/cursor
// boundary; Case, Agent delivery and process truth remain in their owners.
export class CaseAgentDriveRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = new CaseAgentDriveRuntimeDOHost(ctx, env);
    this.trialApplicationPromise = null;
  }

  initializeCaseAgentDrive(input) {
    return this.host.initializeCaseAgentDrive(input);
  }

  readCaseAgentDrive(input) {
    return this.host.readCaseAgentDrive(input);
  }

  quiesceCaseAgentDrive(input) {
    return this.host.quiesceCaseAgentDrive(input);
  }

  advanceCaseAgentDrive(input) {
    return this.host.advanceCaseAgentDrive(input);
  }

  snapshotCaseAgentDrive(input) {
    return this.host.snapshotCaseAgentDrive(input);
  }

  /**
   * Execute one fixed tree-heavy trial owner operation from this Drive object.
   * The HTTP ingress calls this method instead of decoding the generated
   * repository tree under the Workers Free 10 ms request budget.  D0042 drive
   * calls use the local host adapter, so the object never recursively invokes
   * its own namespace RPC.
   */
  async executeMcpTrial(input) {
    const request = assertExecutionInput(input);
    if (this.trialApplicationPromise === null) {
      this.trialApplicationPromise = createTrialApplication(this.env, { driveOwnerOverride: this.host });
    }
    const worker = await this.trialApplicationPromise;
    let result;
    switch (request.operation) {
      case 'repository.create': result = await worker.surface.repository.create(request.input); break;
      case 'repository.load': result = await worker.surface.repository.load(request.input.caseId); break;
      case 'repository.command': result = await worker.surface.repository.command(request.input.caseId, request.input.envelope); break;
      case 'runner.create': result = await worker.surface.developmentUnitRunner.create(request.input); break;
      case 'runner.drive': result = await worker.surface.developmentUnitRunner.drive(request.input); break;
      case 'runner.candidate': result = await worker.surface.developmentUnitRunner.candidate(request.input.caseId); break;
      case 'developmentUnitStart': result = await worker.surface.owners.developmentUnitStart(request.input); break;
      default: fail('mcp_trial_execution_invalid', 'Trial execution operation is not admitted');
    }
    return publicJsonClone(plainOwnerResult(result));
  }

  diagnoseDrivePing() {
    return { ok: true, phase: 'drive_ping' };
  }

  async diagnoseCaseLoadDirect(input) {
    try {
      const caseId = input?.caseId;
      if (typeof caseId !== 'string' || caseId.length === 0) fail('mcp_trial_execution_invalid', 'Direct Case probe requires caseId');
      const configured = normalizeMcpTrialCompositionBinding(JSON.parse(this.env.TDEV_MCP_TRIAL_MANIFEST_JSON));
      const caseNs = namespaceFor(this.env.TDEV_CASE_AUTHORITY, configured.jurisdiction, 'Case');
      const id = caseNs.idFromName(caseId);
      const placement = createCasePlacement({
        caseId,
        placementGeneration: 1,
        ...configured.caseOwner.placement,
        durableObjectId: id.toString(),
      });
      const stub = caseNs.get(id);
      if (!stub || typeof stub.qualificationInvoke !== 'function') fail('mcp_trial_owner_unavailable', 'Direct Case RPC is unavailable');
      const response = await stub.qualificationInvoke({ operation: 'load', placement });
      return {
        ok: true,
        phase: 'case_load_direct',
        response: response?.ok === true
          ? { schemaVersion: response.schemaVersion, ok: true, caseId: response.result?.snapshot?.caseId ?? null, caseRevision: response.result?.snapshot?.caseRevision ?? null }
          : response,
      };
    } catch (error) {
      return {
        ok: false,
        phase: 'case_load_direct',
        error: {
          name: typeof error?.name === 'string' ? error.name : null,
          code: typeof error?.code === 'string' ? error.code : null,
          message: typeof error?.message === 'string' ? error.message : String(error),
        },
      };
    }
  }

  async diagnoseStartPhase(input) {
    let phase = 'application';
    try {
      const caseId = input?.caseId;
      const requestedPhase = input?.phase;
      if (typeof caseId !== 'string' || !['context', 'plan', 'create'].includes(requestedPhase)) {
        fail('mcp_trial_execution_invalid', 'Start phase probe input is invalid');
      }
      if (this.trialApplicationPromise === null) {
        this.trialApplicationPromise = createTrialApplication(this.env, { driveOwnerOverride: this.host });
      }
      const worker = await this.trialApplicationPromise;
      phase = 'context';
      const context = await worker.surface.owners.developmentContextResolve({ selector: input.contextReference });
      if (requestedPhase === 'context') {
        return { ok: true, phase, revisionId: context.revisionId, repositoryCommitOid: context.repositoryCommitOid, baseTreeEntries: Object.keys(context.baseTree ?? {}).length };
      }
      phase = 'plan';
      const plan = defineDevelopmentUnitPlan({
        revisionId: context.revisionId,
        baseTree: context.baseTree,
        repositoryCommitOid: context.repositoryCommitOid,
        objectFormat: context.objectFormat ?? 'sha1',
        contextCapabilityId: context.contextCapabilityId ?? null,
        instruction: input.instruction,
        validationProfile: input.validationProfile,
        modelCapabilityId: context.modelCapabilityId ?? null,
        validationCapabilityId: context.validationCapabilityId ?? null,
        caseContract: context.caseContract,
      });
      if (requestedPhase === 'plan') {
        return { ok: true, phase, planDigest: plan.planDigest, baseDigest: plan.baseDigest, planBytes: new TextEncoder().encode(canonicalJson(plan)).byteLength };
      }
      phase = 'create';
      const created = await worker.surface.repository.create({ caseId, plan, caseContract: context.caseContract ?? {} });
      return { ok: true, phase, caseId: created?.caseId ?? caseId, caseRevision: created?.caseRevision ?? null, caseState: created?.caseState ?? null };
    } catch (error) {
      return { ok: false, phase, error: { name: typeof error?.name === 'string' ? error.name : null, code: typeof error?.code === 'string' ? error.code : null, message: typeof error?.message === 'string' ? error.message : String(error) } };
    }
  }

  async diagnoseAgentRead() {
    try {
      if (this.trialApplicationPromise === null) {
        this.trialApplicationPromise = createTrialApplication(this.env, { driveOwnerOverride: this.host });
      }
      const worker = await this.trialApplicationPromise;
      const snapshot = await worker.surface.owners.diagnosticAgentRead();
      return { ok: true, result: publicJsonClone(snapshot) };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: typeof error?.name === 'string' ? error.name : null,
          code: typeof error?.code === 'string' ? error.code : null,
          message: typeof error?.message === 'string' ? error.message : String(error),
        },
      };
    }
  }

  async diagnoseMcpTrial(input) {
    try {
      return { ok: true, result: await this.executeMcpTrial(input) };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: typeof error?.name === 'string' ? error.name : null,
          code: typeof error?.code === 'string' ? error.code : null,
          message: typeof error?.message === 'string' ? error.message : String(error),
        },
      };
    }
  }
}
