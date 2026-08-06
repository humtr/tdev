import path from 'node:path';
import { ContractError, clone, digest } from './canonical.mjs';

export function validateTree(tree) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    throw new ContractError('invalid_tree', 'Tree must be an object keyed by relative path');
  }
  const normalized = {};
  for (const [filePath, content] of Object.entries(tree)) {
    validateRelativePath(filePath);
    if (typeof content !== 'string') {
      throw new ContractError('invalid_tree_content', `Tree content must be text: ${filePath}`);
    }
    normalized[filePath] = content;
  }
  return normalized;
}

export function validateRelativePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.includes('\\')) {
    throw new ContractError('invalid_path', `Invalid relative path: ${String(filePath)}`);
  }
  if (path.posix.isAbsolute(filePath)) {
    throw new ContractError('invalid_path', `Absolute path is forbidden: ${filePath}`);
  }
  const normalized = path.posix.normalize(filePath);
  if (normalized !== filePath || normalized === '..' || normalized.startsWith('../')) {
    throw new ContractError('invalid_path', `Path traversal or non-normal path is forbidden: ${filePath}`);
  }
  return filePath;
}

export function normalizeChangeSet(taskId, result, expectedBaseDigest) {
  if (!result || typeof result !== 'object' || result.kind !== 'changeset') {
    throw new ContractError('invalid_result', `Task ${taskId} must return a changeset`);
  }
  if (result.baseDigest !== expectedBaseDigest) {
    throw new ContractError('base_digest_mismatch', `Task ${taskId} result is bound to a different base`, {
      expectedBaseDigest,
      actualBaseDigest: result.baseDigest,
    });
  }
  if (!Array.isArray(result.writes)) {
    throw new ContractError('invalid_result', `Task ${taskId} writes must be an array`);
  }
  const seen = new Set();
  const writes = result.writes.map((write) => {
    if (!write || typeof write !== 'object') {
      throw new ContractError('invalid_write', `Task ${taskId} contains a non-object write`);
    }
    const filePath = validateRelativePath(write.path);
    if (seen.has(filePath)) {
      throw new ContractError('duplicate_write', `Task ${taskId} writes ${filePath} more than once`);
    }
    seen.add(filePath);
    if (write.content !== null && typeof write.content !== 'string') {
      throw new ContractError('invalid_write', `Task ${taskId} write content must be text or null: ${filePath}`);
    }
    return { path: filePath, content: write.content };
  });
  writes.sort((left, right) => left.path.localeCompare(right.path));
  return {
    kind: 'changeset',
    baseDigest: expectedBaseDigest,
    writes,
    evidence: result.evidence === undefined ? null : clone(result.evidence),
  };
}

export function promote(baseTree, acceptedResults, expectedBaseDigest) {
  const candidate = validateTree(clone(baseTree));
  if (digest(candidate) !== expectedBaseDigest) {
    throw new ContractError('base_tree_digest_mismatch', 'Promotion base tree does not match the plan digest');
  }

  const normalized = acceptedResults
    .map(({ taskId, result }) => ({ taskId, result: normalizeChangeSet(taskId, result, expectedBaseDigest) }))
    .sort((left, right) => left.taskId.localeCompare(right.taskId));

  const ownership = new Map();
  const conflicts = [];
  for (const { taskId, result } of normalized) {
    for (const write of result.writes) {
      const prior = ownership.get(write.path);
      if (!prior) {
        ownership.set(write.path, { taskId, content: write.content });
        continue;
      }
      if (prior.content !== write.content) {
        conflicts.push({
          path: write.path,
          firstTaskId: prior.taskId,
          secondTaskId: taskId,
        });
      }
    }
  }

  if (conflicts.length > 0) {
    conflicts.sort((left, right) =>
      left.path.localeCompare(right.path) ||
      left.firstTaskId.localeCompare(right.firstTaskId) ||
      left.secondTaskId.localeCompare(right.secondTaskId),
    );
    throw new ContractError('promotion_conflict', 'Accepted ChangeSets conflict', { conflicts });
  }

  const orderedWrites = [...ownership.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [filePath, { content }] of orderedWrites) {
    if (content === null) {
      delete candidate[filePath];
    } else {
      candidate[filePath] = content;
    }
  }

  return {
    kind: 'promotion',
    baseDigest: expectedBaseDigest,
    acceptedTaskIds: normalized.map(({ taskId }) => taskId),
    tree: candidate,
    treeDigest: digest(candidate),
  };
}
