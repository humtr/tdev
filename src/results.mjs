import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  compareText,
  deepFreeze,
  digest,
  exactKeys,
  isPlainRecord,
} from './canonical.mjs';
import { assertContentSize, validateRelativePath } from './policy.mjs';

export const WORK_RESULT_KINDS = deepFreeze([
  'changeset',
  'observation',
  'validation',
  'artifact-set',
  'effect-receipt',
]);

function byteLength(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function normalizeEvidence(evidence, limits) {
  if (evidence === undefined || evidence === null) return null;
  const normalized = canonicalClone(evidence);
  const size = byteLength(normalized);
  if (size > limits.maxEvidenceBytes) {
    throw new ContractError('evidence_limit_exceeded', `Evidence exceeds ${limits.maxEvidenceBytes} bytes`, { size });
  }
  return normalized;
}

function assertResultRecord(result, taskId, expectedKind, allowedKeys) {
  if (!isPlainRecord(result)) throw new ContractError('invalid_result', `Task ${taskId} result must be a record`);
  exactKeys(result, allowedKeys, `result:${taskId}`);
  if (result.kind !== expectedKind) {
    throw new ContractError('result_kind_mismatch', `Task ${taskId} must return ${expectedKind}, got ${String(result.kind)}`);
  }
}

export function normalizeChangeSet(taskId, result, context) {
  assertResultRecord(result, taskId, 'changeset', ['kind', 'baseDigest', 'writes', ...(Object.hasOwn(result, 'evidence') ? ['evidence'] : [])]);
  if (result.baseDigest !== context.baseDigest) {
    throw new ContractError('base_digest_mismatch', `Task ${taskId} result is bound to a different base`, {
      expectedBaseDigest: context.baseDigest,
      actualBaseDigest: result.baseDigest,
    });
  }
  if (!Array.isArray(result.writes)) throw new ContractError('invalid_result', `Task ${taskId} writes must be an array`);
  if (result.writes.length > context.limits.maxWritesPerChangeSet) {
    throw new ContractError('write_limit_exceeded', `Task ${taskId} exceeds ${context.limits.maxWritesPerChangeSet} writes`);
  }

  const seen = new Set();
  const writes = result.writes.map((write, index) => {
    if (!isPlainRecord(write)) throw new ContractError('invalid_write', `Task ${taskId} write ${index} must be a record`);
    exactKeys(write, ['path', 'content'], `result:${taskId}.writes[${index}]`);
    const filePath = validateRelativePath(write.path, {
      requireNfc: context.pathPolicy.requireNfc,
      deniedPrefixes: context.pathPolicy.deniedPrefixes,
      maxPathBytes: context.limits.maxPathBytes,
    });
    if (seen.has(filePath)) throw new ContractError('duplicate_write', `Task ${taskId} writes ${filePath} more than once`);
    seen.add(filePath);
    if (write.content !== null && typeof write.content !== 'string') {
      throw new ContractError('invalid_write', `Task ${taskId} write content must be text or null: ${filePath}`);
    }
    if (write.content !== null) assertContentSize(write.content, filePath, context.limits);
    return { path: filePath, content: write.content };
  });
  writes.sort((left, right) => compareText(left.path, right.path));
  const evidence = normalizeEvidence(result.evidence, context.limits);
  const normalized = { kind: 'changeset', baseDigest: context.baseDigest, writes, evidence };
  const totalBytes = byteLength(normalized);
  if (totalBytes > context.limits.maxChangeSetBytes) {
    throw new ContractError('changeset_limit_exceeded', `Task ${taskId} ChangeSet exceeds ${context.limits.maxChangeSetBytes} bytes`, {
      size: totalBytes,
    });
  }
  return deepFreeze(normalized);
}

function normalizeObservation(taskId, result, context) {
  assertResultRecord(result, taskId, 'observation', ['kind', 'subject', 'value', ...(Object.hasOwn(result, 'evidence') ? ['evidence'] : [])]);
  assertScalarString(result.subject, `result:${taskId}.subject`);
  if (result.subject.length === 0 || result.subject.length > 512) {
    throw new ContractError('invalid_observation', `Task ${taskId} observation subject is invalid`);
  }
  const normalized = {
    kind: 'observation',
    subject: result.subject,
    value: canonicalClone(result.value),
    evidence: normalizeEvidence(result.evidence, context.limits),
  };
  if (byteLength(normalized) > context.limits.maxEvidenceBytes) {
    throw new ContractError('observation_limit_exceeded', `Task ${taskId} observation is too large`);
  }
  return deepFreeze(normalized);
}

function normalizeValidation(taskId, result, context, task) {
  assertResultRecord(result, taskId, 'validation', ['kind', 'passed', 'checks', ...(Object.hasOwn(result, 'evidence') ? ['evidence'] : [])]);
  if (typeof result.passed !== 'boolean' || !Array.isArray(result.checks)) {
    throw new ContractError('invalid_validation', `Task ${taskId} validation result is invalid`);
  }
  if (result.checks.length > 10_000) throw new ContractError('validation_limit_exceeded', `Task ${taskId} has too many checks`);
  const checks = result.checks.map((check, index) => {
    if (!isPlainRecord(check)) throw new ContractError('invalid_validation', `Task ${taskId} check ${index} must be a record`);
    const keys = ['id', 'passed'];
    if (Object.hasOwn(check, 'message')) keys.push('message');
    exactKeys(check, keys, `result:${taskId}.checks[${index}]`);
    assertIdentifier(check.id, `validation check id for ${taskId}`);
    if (typeof check.passed !== 'boolean') throw new ContractError('invalid_validation', `Task ${taskId} check ${check.id} passed must be boolean`);
    let message = null;
    if (Object.hasOwn(check, 'message') && check.message !== null) {
      assertScalarString(check.message, `validation message:${check.id}`);
      if (check.message.length > 4_096) throw new ContractError('validation_limit_exceeded', `Task ${taskId} check message is too long`);
      message = check.message;
    }
    return { id: check.id, passed: check.passed, message };
  }).sort((left, right) => compareText(left.id, right.id));
  for (let index = 1; index < checks.length; index += 1) {
    if (checks[index].id === checks[index - 1].id) {
      throw new ContractError('duplicate_validation_check', `Task ${taskId} repeats check ${checks[index].id}`);
    }
  }
  const derivedPassed = checks.every((check) => check.passed);
  if (derivedPassed !== result.passed) {
    throw new ContractError('validation_summary_mismatch', `Task ${taskId} validation summary does not match checks`);
  }
  const normalized = {
    kind: 'validation',
    passed: result.passed,
    checks,
    evidence: normalizeEvidence(result.evidence, context.limits),
  };
  if (task.execution.requirePassed && !normalized.passed) {
    throw new ContractError('validation_failed', `Task ${taskId} did not pass required validation`, {
      failedCheckIds: checks.filter((check) => !check.passed).map((check) => check.id),
    });
  }
  if (byteLength(normalized) > context.limits.maxEvidenceBytes) {
    throw new ContractError('validation_limit_exceeded', `Task ${taskId} validation result is too large`);
  }
  return deepFreeze(normalized);
}

function normalizeArtifactSet(taskId, result, context) {
  assertResultRecord(result, taskId, 'artifact-set', ['kind', 'artifacts', ...(Object.hasOwn(result, 'evidence') ? ['evidence'] : [])]);
  if (!Array.isArray(result.artifacts)) throw new ContractError('invalid_artifact_set', `Task ${taskId} artifacts must be an array`);
  if (result.artifacts.length > context.limits.maxArtifactsPerResult) {
    throw new ContractError('artifact_limit_exceeded', `Task ${taskId} has too many Artifact references`);
  }
  const artifacts = result.artifacts.map((artifact, index) => {
    if (!isPlainRecord(artifact)) throw new ContractError('invalid_artifact', `Task ${taskId} artifact ${index} must be a record`);
    const keys = ['id', 'digest', 'mediaType', 'size'];
    if (Object.hasOwn(artifact, 'locator')) keys.push('locator');
    exactKeys(artifact, keys, `result:${taskId}.artifacts[${index}]`);
    assertIdentifier(artifact.id, `artifact id for ${taskId}`);
    assertDigest(artifact.digest, `artifact digest for ${taskId}`);
    assertScalarString(artifact.mediaType, `artifact mediaType for ${taskId}`);
    if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(artifact.mediaType)) {
      throw new ContractError('invalid_artifact', `Task ${taskId} artifact ${artifact.id} mediaType is invalid`);
    }
    assertSafeInteger(artifact.size, `artifact size for ${taskId}`, { min: 0 });
    let locator = null;
    if (Object.hasOwn(artifact, 'locator') && artifact.locator !== null) {
      assertScalarString(artifact.locator, `artifact locator for ${taskId}`);
      if (artifact.locator.length === 0 || artifact.locator.length > 2_048) {
        throw new ContractError('invalid_artifact', `Task ${taskId} artifact ${artifact.id} locator is invalid`);
      }
      locator = artifact.locator;
    }
    return { id: artifact.id, digest: artifact.digest, mediaType: artifact.mediaType, size: artifact.size, locator };
  }).sort((left, right) => compareText(left.id, right.id));
  for (let index = 1; index < artifacts.length; index += 1) {
    if (artifacts[index].id === artifacts[index - 1].id) {
      throw new ContractError('duplicate_artifact', `Task ${taskId} repeats Artifact ${artifacts[index].id}`);
    }
  }
  const normalized = {
    kind: 'artifact-set',
    artifacts,
    evidence: normalizeEvidence(result.evidence, context.limits),
  };
  if (byteLength(normalized) > context.limits.maxEvidenceBytes) {
    throw new ContractError('artifact_set_limit_exceeded', `Task ${taskId} Artifact set is too large`);
  }
  return deepFreeze(normalized);
}

function normalizeEffectReceipt(taskId, result, context, task) {
  assertResultRecord(result, taskId, 'effect-receipt', ['kind', 'effectKey', 'operation', 'outcome', 'receipt', ...(Object.hasOwn(result, 'evidence') ? ['evidence'] : [])]);
  if (task.execution.effectClass === 'result-only') {
    throw new ContractError('effect_receipt_forbidden', `Result-only Task ${taskId} cannot return an effect receipt`);
  }
  if (result.effectKey !== context.effectKey || result.operation !== task.execution.operation || result.outcome !== 'applied') {
    throw new ContractError('effect_receipt_mismatch', `Task ${taskId} effect receipt does not match its execution contract`, {
      expectedEffectKey: context.effectKey,
      actualEffectKey: result.effectKey,
    });
  }
  const receipt = canonicalClone(result.receipt);
  const normalized = {
    kind: 'effect-receipt',
    effectKey: context.effectKey,
    operation: task.execution.operation,
    outcome: 'applied',
    receipt,
    evidence: normalizeEvidence(result.evidence, context.limits),
  };
  if (byteLength(normalized) > context.limits.maxEvidenceBytes) {
    throw new ContractError('effect_receipt_limit_exceeded', `Task ${taskId} effect receipt is too large`);
  }
  return deepFreeze(normalized);
}

export function normalizeTaskResult(task, result, context) {
  if (!task || task.kind !== 'work') throw new ContractError('invalid_result_task', 'Only work Tasks have external results');
  switch (task.execution.resultKind) {
    case 'changeset': return normalizeChangeSet(task.id, result, context);
    case 'observation': return normalizeObservation(task.id, result, context);
    case 'validation': return normalizeValidation(task.id, result, context, task);
    case 'artifact-set': return normalizeArtifactSet(task.id, result, context);
    case 'effect-receipt': return normalizeEffectReceipt(task.id, result, context, task);
    default: throw new ContractError('unsupported_result_kind', `Unsupported result kind: ${task.execution.resultKind}`);
  }
}

export function resultIdentity(result) {
  return deepFreeze({ kind: result.kind, digest: digest(result) });
}
