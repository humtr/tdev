import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalJson,
  clone,
  compareText,
  deepFreeze,
  digest,
} from './canonical.mjs';
import { DEFAULT_LIMITS, DEFAULT_PATH_POLICY, assertContentSize, validateRelativePath, validateTreeTopology } from './policy.mjs';
import { normalizeTaskResult } from './results.mjs';

function record() {
  return Object.create(null);
}

export function validateTree(tree, context = {}) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    throw new ContractError('invalid_tree', 'Tree must be an object keyed by relative path');
  }
  const pathPolicy = context.pathPolicy ?? { requireNfc: true, deniedPrefixes: ['.git', '.tdev'] };
  const limits = { ...DEFAULT_LIMITS, ...(context.limits ?? {}) };
  const normalized = record();
  const entries = Object.entries(tree);
  if (entries.length > limits.maxTreeEntries) {
    throw new ContractError('tree_entry_limit_exceeded', `Tree exceeds ${limits.maxTreeEntries} files`);
  }
  for (const [filePath, content] of entries) {
    const path = validateRelativePath(filePath, {
      requireNfc: pathPolicy.requireNfc,
      deniedPrefixes: pathPolicy.deniedPrefixes,
      maxPathBytes: limits.maxPathBytes,
    });
    assertContentSize(content, path, limits);
    normalized[path] = content;
  }
  validateTreeTopology(Object.keys(normalized));
  const treeBytes = Buffer.byteLength(canonicalJson(normalized), 'utf8');
  if (treeBytes > limits.maxTreeBytes) {
    throw new ContractError('tree_limit_exceeded', `Tree exceeds ${limits.maxTreeBytes} bytes`, { size: treeBytes });
  }
  return normalized;
}

export { validateRelativePath } from './policy.mjs';

export function promote(baseTree, acceptedResults, expectedBaseDigest, context = {}) {
  const effectiveContext = {
    ...context,
    limits: { ...DEFAULT_LIMITS, ...(context.limits ?? {}) },
    pathPolicy: context.pathPolicy ?? DEFAULT_PATH_POLICY,
  };
  const candidate = validateTree(clone(baseTree), effectiveContext);
  if (digest(candidate) !== expectedBaseDigest) {
    throw new ContractError('base_tree_digest_mismatch', 'Promotion base tree does not match the plan digest');
  }
  if (!Array.isArray(acceptedResults)) throw new ContractError('invalid_promotion_input', 'Accepted results must be an array');

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

  const orderedWrites = [...ownership.entries()].sort(([left], [right]) => compareText(left, right));
  for (const [filePath, { content }] of orderedWrites) {
    if (content === null) delete candidate[filePath];
    else candidate[filePath] = content;
  }

  try {
    validateTree(candidate, effectiveContext);
  } catch (error) {
    if (error instanceof ContractError && error.code === 'tree_path_collision') {
      throw new ContractError('promotion_topology_conflict', 'Accepted ChangeSets produce an invalid file tree', error.details, { cause: error });
    }
    throw error;
  }

  const accepted = normalized.map(({ taskId, result, resultDigest }) => ({
    taskId,
    resultKind: result.kind,
    resultDigest,
  }));
  const acceptedTaskIds = accepted.map(({ taskId }) => taskId);
  const appliedTaskIds = normalized.filter(({ result }) => result.kind === 'changeset').map(({ taskId }) => taskId);

  return deepFreeze({
    kind: 'promotion',
    baseDigest: expectedBaseDigest,
    accepted,
    acceptedTaskIds,
    appliedTaskIds,
    tree: candidate,
    treeDigest: digest(candidate),
  });
}
