import { ContractError } from './canonical.mjs';
import {
  CaseDOAuthority,
  validateCasePlacement,
} from './casedo-authority.mjs';
import { D1CasePlacementAuthority } from './d1-case-placement.mjs';

const textEncoder = new TextEncoder();
const MAX_BINDING_BYTES = 2048;

function requiredTextBinding(env, name, maxBytes = MAX_BINDING_BYTES) {
  const value = env?.[name];
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_casedo_deployment_config', `${name} must be a non-empty text binding without NUL`);
  }
  if (textEncoder.encode(value).byteLength > maxBytes) {
    throw new ContractError('invalid_casedo_deployment_config', `${name} exceeds its byte limit`, { maxBytes });
  }
  return value;
}

function positiveIntegerBinding(env, name) {
  const value = requiredTextBinding(env, name, 64);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new ContractError('invalid_casedo_deployment_config', `${name} must be a positive base-10 integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ContractError('invalid_casedo_deployment_config', `${name} exceeds the supported integer range`);
  }
  return parsed;
}

function runtimeConfig(env) {
  return Object.freeze({
    maxAuthoritativeBytesPerCase: positiveIntegerBinding(env, 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE'),
    writerCompatibilityId: requiredTextBinding(env, 'TDEV_CASEDO_WRITER_COMPATIBILITY_ID'),
    placement: Object.freeze({
      deployment: requiredTextBinding(env, 'TDEV_DEPLOYMENT'),
      environment: requiredTextBinding(env, 'TDEV_ENVIRONMENT'),
      workerScript: requiredTextBinding(env, 'TDEV_WORKER_SCRIPT'),
      className: 'CaseRuntimeDO',
      namespace: requiredTextBinding(env, 'TDEV_CASEDO_NAMESPACE'),
      jurisdiction: requiredTextBinding(env, 'TDEV_CASEDO_JURISDICTION'),
    }),
  });
}

function assertRuntimePlacement(input, config, durableObjectId) {
  const placement = validateCasePlacement(input);
  const expected = {
    ...config.placement,
    durableObjectId,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (placement[key] !== value) {
      throw new ContractError('placement_conflict', `CaseDO provider host rejected placement.${key}`, {
        expected: value,
        actual: placement[key],
      });
    }
  }
  return placement;
}

export class CaseRuntimeDOHost {
  constructor(ctx, env) {
    this.config = runtimeConfig(env);
    this.durableObjectId = ctx.id.toString();
    this.authority = new CaseDOAuthority(ctx.storage, {
      maxAuthoritativeBytesPerCase: this.config.maxAuthoritativeBytesPerCase,
      writerCompatibilityId: this.config.writerCompatibilityId,
    });
    this.placementAuthority = new D1CasePlacementAuthority(env?.TDEV_CASE_PLACEMENT);
    ctx.blockConcurrencyWhile(async () => {
      this.authority.initialize();
    });
  }

  #placement(input) {
    return assertRuntimePlacement(input, this.config, this.durableObjectId);
  }

  async #requireElected(input) {
    const placement = this.#placement(input);
    await this.placementAuthority.requireElected({ placement });
    return placement;
  }

  async initializeElectedCase(input) {
    const placement = await this.#requireElected(input.placement);
    return this.authority.initializeElectedCase({ ...input, placement });
  }

  async loadCase(input) {
    const placement = await this.#requireElected(input.placement);
    return this.authority.loadCase({ ...input, placement });
  }

  async command(input) {
    const placement = await this.#requireElected(input.placement);
    return this.authority.command({ ...input, placement });
  }

  async recoverExecutionOwnerLoss(input) {
    const placement = await this.#requireElected(input.placement);
    return this.authority.recoverExecutionOwnerLoss({ ...input, placement });
  }
}
