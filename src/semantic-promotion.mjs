import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  compareText,
  deepFreeze,
  digest,
} from './canonical.mjs';
import { DEFAULT_LIMITS, DEFAULT_PATH_POLICY } from './policy.mjs';
import { normalizeTaskResult } from './results.mjs';
import { SEMANTIC_PROFILE, SemanticRadixTree } from './semantic-authority.mjs';

export function promoteSemantic(baseSemanticTree, acceptedResults, expectedBaseDigest, context = {}) {
  if (!(baseSemanticTree instanceof SemanticRadixTree)) {
    throw new ContractError('invalid_semantic_base', 'Semantic Promotion requires a SemanticRadixTree base');
  }
  if (!Array.isArray(acceptedResults)) throw new ContractError('invalid_promotion_input', 'Accepted results must be an array');
  const effectiveContext = {
    ...context,
    limits: { ...DEFAULT_LIMITS, ...(context.limits ?? {}) },
    pathPolicy: context.pathPolicy ?? DEFAULT_PATH_POLICY,
  };

  const normalized = acceptedResults.map((entry) => {
    if (entry?.task !== undefined) {
      assertRecordShape(entry, ['task', 'result'], ['taskId', 'effectKey'], 'Promotion result entry');
      assertIdentifier(entry.task?.id, 'Promotion result entry.task.id');
      if (entry.taskId !== undefined && entry.taskId !== entry.task.id) {
        throw new ContractError('promotion_task_mismatch', 'Promotion result taskId does not match task.id', {
          taskId: entry.taskId,
          taskObjectId: entry.task.id,
        });
      }
    } else {
      assertRecordShape(entry, ['taskId', 'result'], ['resultKind', 'effectKey'], 'Promotion result entry');
      assertIdentifier(entry.taskId, 'Promotion result entry.taskId');
    }
    const task = entry.task ?? {
      id: entry.taskId,
      kind: 'work',
      execution: {
        resultKind: entry.resultKind ?? entry.result?.kind ?? 'changeset',
        effectClass: 'result-only',
        operation: 'legacy.work',
        requirePassed: false,
      },
    };
    const result = normalizeTaskResult(task, entry.result, {
      ...effectiveContext,
      baseDigest: expectedBaseDigest,
      effectKey: entry.effectKey ?? null,
    });
    return { task, taskId: task.id, result, resultDigest: digest(result) };
  }).sort((left, right) => compareText(left.taskId, right.taskId));

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].taskId === normalized[index - 1].taskId) {
      throw new ContractError('duplicate_promotion_result', `Promotion received Task ${normalized[index].taskId} more than once`);
    }
  }

  const ownership = new Map();
  const conflicts = [];
  for (const { taskId, result } of normalized) {
    if (result.kind !== 'changeset') continue;
    for (const write of result.writes) {
      const prior = ownership.get(write.path);
      if (!prior) {
        ownership.set(write.path, { taskId, content: write.content });
        continue;
      }
      if (prior.content !== write.content) {
        conflicts.push({ path: write.path, firstTaskId: prior.taskId, secondTaskId: taskId });
      }
    }
  }
  if (conflicts.length > 0) {
    conflicts.sort((left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.firstTaskId, right.firstTaskId) ||
      compareText(left.secondTaskId, right.secondTaskId));
    throw new ContractError('promotion_conflict', 'Accepted ChangeSets conflict', { conflicts });
  }

  const writes = [...ownership.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([path, { content }]) => ({ path, content }));
  const semanticTree = baseSemanticTree.applyWrites(writes, effectiveContext);
  const accepted = normalized.map(({ taskId, result, resultDigest }) => ({
    taskId,
    resultKind: result.kind,
    resultDigest,
  }));
  const acceptedTaskIds = accepted.map(({ taskId }) => taskId);
  const appliedTaskIds = normalized.filter(({ result }) => result.kind === 'changeset').map(({ taskId }) => taskId);
  const result = deepFreeze({
    kind: 'promotion',
    baseDigest: expectedBaseDigest,
    accepted,
    acceptedTaskIds,
    appliedTaskIds,
    semanticProfile: SEMANTIC_PROFILE,
    semanticRoot: semanticTree.rootDescriptor,
  });
  return deepFreeze({ result, semanticTree });
}
