import { DurableObject } from 'cloudflare:workers';
import { CaseAgentDriveRuntimeDOHost } from '../src/cloudflare-case-agent-drive-runtime.mjs';
import { canonicalClone, isPlainRecord, publicJsonClone } from '../src/canonical.mjs';
import { createTrialApplication, createTrialDriveApplication, createTrialExecutionApplication } from './cloudflare-mcp-trial-worker.mjs';
import { namespaceFor } from '../src/mcp-trial-composition.mjs';

const TRIAL_EXECUTION_OPERATIONS = new Set([
  'repository.create',
  'repository.load',
  'repository.command',
  'runner.create',
  'runner.drive',
  'runner.candidate',
  'developmentContextGet',
  'developmentContextResolve',
  'developmentContextList',
  'developmentContextSearch',
  'developmentContextRead',
  'developmentUnitStart',
  'developmentStart',
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

function readContextRoute(env) {
  const raw = env?.TDEV_MCP_RUNTIME_MANIFEST_JSON ?? env?.TDEV_MCP_TRIAL_MANIFEST_JSON;
  if (typeof raw !== 'string' || raw.length === 0) fail('mcp_config_unavailable', 'Runtime composition binding is unavailable');
  let composition;
  try { composition = JSON.parse(raw); }
  catch { fail('mcp_config_unavailable', 'Runtime composition binding cannot be parsed'); }
  const reference = composition?.repository?.contextReference;
  const jurisdiction = composition?.jurisdiction;
  if (typeof reference !== 'string' || reference.length === 0 || typeof jurisdiction !== 'string' || jurisdiction.length === 0) {
    fail('mcp_config_unavailable', 'Runtime context route is unavailable');
  }
  return { reference, jurisdiction };
}

function contextResolver(env) {
  const { reference, jurisdiction } = readContextRoute(env);
  const namespace = namespaceFor(env.TDEV_CASE_AGENT_DRIVE, jurisdiction, 'Case-Agent drive');
  const id = namespace.idFromName(`context:${reference}`);
  const stub = namespace.get(id);
  if (!stub || typeof stub.executeMcpTrial !== 'function') fail('mcp_owner_unavailable', 'Context registry RPC is unavailable');
  return async ({ selector = null, contextReference = null } = {}) => {
    if (selector !== null && contextReference !== null && selector !== contextReference) {
      fail('mcp_trial_context_scope_denied', 'Context resolver selector and contextReference disagree');
    }
    return publicJsonClone(await stub.executeMcpTrial({
      operation: 'developmentContextResolve',
      input: { selector: contextReference ?? selector },
    }));
  };
}

// D0046's trial-only Durable Object. It exposes only the D0042 intent/cursor
// boundary; Case, Agent delivery and process truth remain in their owners.
export class CaseAgentDriveRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.host = new CaseAgentDriveRuntimeDOHost(ctx, env);
    this.trialApplicationPromise = null;
    this.trialDriveApplicationPromise = null;
    this.trialExecutionApplicationPromise = null;
    this.trialContextApplicationPromise = null;
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
    let result;
    if (request.operation === 'developmentUnitStart' || request.operation === 'developmentStart') {
      if (this.trialApplicationPromise === null) {
        this.trialApplicationPromise = createTrialApplication(this.env, {
          driveOwnerOverride: this.host,
          developmentContextResolveOverride: contextResolver(this.env),
        });
      }
      const worker = await this.trialApplicationPromise;
      switch (request.operation) {
        case 'developmentUnitStart': result = await worker.surface.owners.developmentUnitStart(request.input); break;
        case 'developmentStart': result = await worker.surface.owners.developmentStart(request.input); break;
        default: fail('mcp_trial_execution_invalid', 'Trial execution operation is not admitted');
      }
    } else if (request.operation === 'runner.drive') {
      if (this.trialDriveApplicationPromise === null) {
        this.trialDriveApplicationPromise = createTrialDriveApplication(this.env, { driveOwnerOverride: this.host, resolveContext: contextResolver(this.env) });
      }
      const execution = await this.trialDriveApplicationPromise;
      result = await execution.runner.drive(request.input);
    } else if (request.operation.startsWith('developmentContext')) {
      if (this.trialContextApplicationPromise === null) {
        const registry = Object.freeze({
          get: (key) => this.ctx.storage.get(key),
          put: (key, value) => this.ctx.storage.put(key, value),
        });
        this.trialContextApplicationPromise = createTrialExecutionApplication(this.env, {
          driveOwnerOverride: this.host,
          contextRegistry: registry,
        });
      }
      const execution = await this.trialContextApplicationPromise;
      switch (request.operation) {
        case 'developmentContextGet': result = await execution.facades.contextOwner.developmentContextGet(request.input); break;
        case 'developmentContextResolve': result = await execution.facades.contextOwner.developmentContextResolve(request.input); break;
        case 'developmentContextList': result = await execution.facades.contextOwner.developmentContextList(request.input); break;
        case 'developmentContextSearch': result = await execution.facades.contextOwner.developmentContextSearch(request.input); break;
        case 'developmentContextRead': result = await execution.facades.contextOwner.developmentContextRead(request.input); break;
        default: fail('mcp_trial_execution_invalid', 'Trial context execution operation is not admitted');
      }
    } else {
      if (this.trialExecutionApplicationPromise === null) {
        this.trialExecutionApplicationPromise = createTrialExecutionApplication(this.env, {
          driveOwnerOverride: this.host,
          resolveContext: contextResolver(this.env),
        });
      }
      const execution = await this.trialExecutionApplicationPromise;
      switch (request.operation) {
        case 'repository.create': result = await execution.facades.repository.create(request.input); break;
        case 'repository.load': result = await execution.facades.repository.load(request.input.caseId); break;
        case 'repository.command': result = await execution.facades.repository.command(request.input.caseId, request.input.envelope); break;
        case 'runner.create': result = await execution.runner.create(request.input); break;
        case 'runner.candidate': result = await execution.runner.candidate(request.input.caseId); break;
        default: fail('mcp_trial_execution_invalid', 'Trial execution operation is not admitted');
      }
    }
    return publicJsonClone(plainOwnerResult(result));
  }

}
