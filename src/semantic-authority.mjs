import {
  ContractError,
  canonicalClone,
  canonicalJson,
  compareText,
  deepFreeze,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  DEFAULT_LIMITS,
  DEFAULT_PATH_POLICY,
  assertContentSize,
  validateRelativePath,
} from './policy.mjs';

export const SEMANTIC_PROFILE = 'tdev.semantic.path-byte-radix.v1';
export const SEMANTIC_VALUE_DOMAIN = 'tdev.semantic.value.v1';
export const SEMANTIC_NODE_DOMAIN = 'tdev.semantic.radix-node.v1';
export const SEMANTIC_ROOT_DOMAIN = 'tdev.semantic.root.v1';
export const SEMANTIC_PLAN_BINDING_DOMAIN = 'tdev.semantic.plan-binding.v1';
export const SEMANTIC_SNAPSHOT_DOMAIN = 'tdev.case-snapshot.v3';
export const SEMANTIC_HEAD_DOMAIN = 'tdev.semantic.head.v1';

function record(entries = []) {
  return Object.assign(Object.create(null), Object.fromEntries(entries));
}

function effectiveContext(context = {}) {
  return {
    limits: { ...DEFAULT_LIMITS, ...(context.limits ?? {}) },
    pathPolicy: context.pathPolicy ?? DEFAULT_PATH_POLICY,
  };
}

function assertDigestString(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError('invalid_semantic_digest', `${label} must be a typed SHA-256 digest`);
  }
}

function assertSafeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ContractError('invalid_semantic_count', `${label} must be a non-negative safe integer`);
  }
}

function entryPayloadBytes(path, content) {
  return Buffer.byteLength(canonicalJson(record([[path, content]])), 'utf8') - 2;
}

function treeBytesAfterWrite(currentBytes, currentCount, oldEntryBytes, newEntryBytes) {
  if (oldEntryBytes === null && newEntryBytes === null) return currentBytes;
  if (oldEntryBytes === null) {
    return currentBytes + newEntryBytes + (currentCount === 0 ? 0 : 1);
  }
  if (newEntryBytes === null) {
    const nextCount = currentCount - 1;
    return currentBytes - oldEntryBytes - (nextCount === 0 ? 0 : 1);
  }
  return currentBytes - oldEntryBytes + newEntryBytes;
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new ContractError('invalid_semantic_edge', `${label} must be non-empty lowercase hex`);
  }
  return Buffer.from(value, 'hex');
}

function commonPrefixLength(left, right, rightOffset = 0) {
  const max = Math.min(left.length, right.length - rightOffset);
  let index = 0;
  while (index < max && left[index] === right[rightOffset + index]) index += 1;
  return index;
}

function compareEdges(left, right) {
  return compareText(left.edge, right.edge);
}

function freezeValue(path, content) {
  const payload = deepFreeze({ path, content });
  const digest = typedDigest(SEMANTIC_VALUE_DOMAIN, payload);
  return deepFreeze({ digest, path, content, payload });
}

function nodePayload(valueDigest, children) {
  return {
    valueDigest,
    children: children.map(({ edge, child }) => [edge, child.digest]),
  };
}

function makeNode(value, children, records, stats) {
  const sorted = [...children].sort(compareEdges);
  for (let index = 0; index < sorted.length; index += 1) {
    const child = sorted[index];
    hexToBytes(child.edge, 'radix child edge');
    if (index > 0 && sorted[index - 1].edge.slice(0, 2) === child.edge.slice(0, 2)) {
      throw new ContractError('invalid_semantic_radix', 'Radix children must have distinct first bytes');
    }
  }
  if (value !== null && sorted.length !== 0) {
    throw new ContractError('tree_path_collision', 'A file path cannot also be a directory prefix');
  }
  const payload = deepFreeze(nodePayload(value?.digest ?? null, sorted));
  const digest = typedDigest(SEMANTIC_NODE_DOMAIN, payload);
  const node = deepFreeze({ digest, value, children: sorted.map(({ edge, child }) => deepFreeze({ edge, child })), payload });
  if (records) {
    if (value !== null) records.set(value.digest, deepFreeze({ digest: value.digest, kind: 'value', payload: value.payload }));
    records.set(digest, deepFreeze({ digest, kind: 'node', payload }));
  }
  if (stats) stats.nodeWrites += 1;
  return node;
}

function replaceChild(node, childIndex, replacement, records, stats) {
  const children = [...node.children];
  if (replacement === null) children.splice(childIndex, 1);
  else children[childIndex] = replacement;
  return makeNode(node.value, children, records, stats);
}

function findChildIndex(node, firstByte) {
  const prefix = firstByte.toString(16).padStart(2, '0');
  for (let index = 0; index < node.children.length; index += 1) {
    if (node.children[index].edge.startsWith(prefix)) return index;
  }
  return -1;
}

function setValueAt(node, key, offset, value, records, stats) {
  stats.nodeReads += 1;
  if (offset === key.length) {
    if (node.children.length > 0) {
      throw new ContractError('promotion_topology_conflict', 'Write path would become an ancestor of an existing file');
    }
    return makeNode(value, [], records, stats);
  }
  if (node.value !== null) {
    throw new ContractError('promotion_topology_conflict', 'Write path descends through an existing file');
  }

  const childIndex = findChildIndex(node, key[offset]);
  if (childIndex === -1) {
    const leaf = makeNode(value, [], records, stats);
    return makeNode(node.value, [...node.children, { edge: bytesToHex(key.subarray(offset)), child: leaf }], records, stats);
  }

  const current = node.children[childIndex];
  const currentEdge = hexToBytes(current.edge, 'radix child edge');
  const common = commonPrefixLength(currentEdge, key, offset);
  if (common === currentEdge.length) {
    const child = setValueAt(current.child, key, offset + common, value, records, stats);
    return replaceChild(node, childIndex, { edge: current.edge, child }, records, stats);
  }

  const splitOffset = offset + common;
  if (splitOffset === key.length) {
    throw new ContractError('promotion_topology_conflict', 'Write path would become an ancestor of an existing file');
  }

  const existingRemainder = bytesToHex(currentEdge.subarray(common));
  const newRemainder = bytesToHex(key.subarray(splitOffset));
  const newLeaf = makeNode(value, [], records, stats);
  const branch = makeNode(null, [
    { edge: existingRemainder, child: current.child },
    { edge: newRemainder, child: newLeaf },
  ], records, stats);
  return replaceChild(node, childIndex, { edge: bytesToHex(currentEdge.subarray(0, common)), child: branch }, records, stats);
}

function compressReplacement(edge, child) {
  if (child.value === null && child.children.length === 1) {
    const only = child.children[0];
    return { edge: `${edge}${only.edge}`, child: only.child };
  }
  return { edge, child };
}

function deleteValueAt(node, key, offset, records, stats) {
  stats.nodeReads += 1;
  if (offset === key.length) {
    if (node.value === null) return { node, deleted: false };
    return { node: null, deleted: true };
  }
  if (node.value !== null) return { node, deleted: false };
  const childIndex = findChildIndex(node, key[offset]);
  if (childIndex === -1) return { node, deleted: false };
  const current = node.children[childIndex];
  const currentEdge = hexToBytes(current.edge, 'radix child edge');
  const common = commonPrefixLength(currentEdge, key, offset);
  if (common !== currentEdge.length) return { node, deleted: false };
  const deleted = deleteValueAt(current.child, key, offset + common, records, stats);
  if (!deleted.deleted) return { node, deleted: false };
  if (deleted.node === null) {
    return { node: replaceChild(node, childIndex, null, records, stats), deleted: true };
  }
  return {
    node: replaceChild(node, childIndex, compressReplacement(current.edge, deleted.node), records, stats),
    deleted: true,
  };
}

function getValueAt(node, key, offset, stats) {
  stats.nodeReads += 1;
  if (offset === key.length) return node.value;
  if (node.value !== null) return null;
  const childIndex = findChildIndex(node, key[offset]);
  if (childIndex === -1) return null;
  const current = node.children[childIndex];
  const currentEdge = hexToBytes(current.edge, 'radix child edge');
  const common = commonPrefixLength(currentEdge, key, offset);
  if (common !== currentEdge.length) return null;
  return getValueAt(current.child, key, offset + common, stats);
}

function collectEntries(node, prefix, output, stats) {
  stats.nodeReads += 1;
  if (node.value !== null) {
    output[node.value.path] = node.value.content;
    return;
  }
  for (const { edge, child } of node.children) {
    collectEntries(child, Buffer.concat([prefix, hexToBytes(edge, 'radix child edge')]), output, stats);
  }
}

function collectReachable(node, output) {
  if (output.has(node.digest)) return;
  output.add(node.digest);
  if (node.value !== null) output.add(node.value.digest);
  for (const { child } of node.children) collectReachable(child, output);
}

function makeRoot(node, entryCount, treeBytes) {
  const identity = deepFreeze({
    profile: SEMANTIC_PROFILE,
    nodeDigest: node?.digest ?? null,
    entryCount,
    treeBytes,
  });
  return deepFreeze({ ...identity, rootDigest: typedDigest(SEMANTIC_ROOT_DOMAIN, identity) });
}

export function validateSemanticRoot(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_semantic_root', 'Semantic root must be a record');
  const keys = Object.keys(input).sort(compareText);
  const expected = ['entryCount', 'nodeDigest', 'profile', 'rootDigest', 'treeBytes'].sort(compareText);
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    throw new ContractError('invalid_semantic_root', 'Semantic root fields are invalid');
  }
  if (input.profile !== SEMANTIC_PROFILE) throw new ContractError('unsupported_semantic_profile', 'Semantic root profile is unsupported');
  if (input.nodeDigest !== null) assertDigestString(input.nodeDigest, 'semantic root nodeDigest');
  assertSafeCount(input.entryCount, 'semantic root entryCount');
  assertSafeCount(input.treeBytes, 'semantic root treeBytes');
  assertDigestString(input.rootDigest, 'semantic root rootDigest');
  if ((input.entryCount === 0) !== (input.nodeDigest === null)) {
    throw new ContractError('invalid_semantic_root', 'Empty semantic root identity is inconsistent');
  }
  if (input.entryCount === 0 && input.treeBytes !== 2) {
    throw new ContractError('invalid_semantic_root', 'Empty semantic tree must have canonical size 2');
  }
  const identity = {
    profile: input.profile,
    nodeDigest: input.nodeDigest,
    entryCount: input.entryCount,
    treeBytes: input.treeBytes,
  };
  if (typedDigest(SEMANTIC_ROOT_DOMAIN, identity) !== input.rootDigest) {
    throw new ContractError('semantic_root_digest_mismatch', 'Semantic root digest is invalid');
  }
  return deepFreeze(canonicalClone(input));
}

export class SemanticRadixTree {
  #pendingRecords;

  constructor({ node = null, entryCount = 0, treeBytes = 2, pendingRecords = new Map(), stats = null } = {}) {
    this.node = node;
    this.entryCount = entryCount;
    this.treeBytes = treeBytes;
    this.#pendingRecords = new Map(pendingRecords);
    this.stats = deepFreeze(stats ?? { nodeReads: 0, nodeWrites: 0, valueWrites: 0 });
    this.root = makeRoot(node, entryCount, treeBytes);
    Object.freeze(this);
  }

  get rootDescriptor() { return this.root; }

  get(path) {
    if (this.node === null) return null;
    const stats = { nodeReads: 0, nodeWrites: 0, valueWrites: 0 };
    return getValueAt(this.node, Buffer.from(path, 'utf8'), 0, stats)?.content ?? null;
  }

  applyWrites(writes, context = {}) {
    if (!Array.isArray(writes)) throw new ContractError('invalid_semantic_writes', 'Semantic writes must be an array');
    const effective = effectiveContext(context);
    let node = this.node;
    let entryCount = this.entryCount;
    let treeBytes = this.treeBytes;
    const records = new Map();
    const stats = { nodeReads: 0, nodeWrites: 0, valueWrites: 0 };

    for (const rawWrite of writes) {
      if (!isPlainRecord(rawWrite) || Object.keys(rawWrite).sort(compareText).join('\0') !== ['content', 'path'].sort(compareText).join('\0')) {
        throw new ContractError('invalid_semantic_write', 'Semantic write must contain exactly path and content');
      }
      const path = validateRelativePath(rawWrite.path, {
        requireNfc: effective.pathPolicy.requireNfc,
        deniedPrefixes: effective.pathPolicy.deniedPrefixes,
        maxPathBytes: effective.limits.maxPathBytes,
      });
      if (rawWrite.content !== null) assertContentSize(rawWrite.content, path, effective.limits);
      const key = Buffer.from(path, 'utf8');
      const lookupStats = { nodeReads: 0, nodeWrites: 0, valueWrites: 0 };
      const oldValue = node === null ? null : getValueAt(node, key, 0, lookupStats);
      stats.nodeReads += lookupStats.nodeReads;
      const oldEntryBytes = oldValue === null ? null : entryPayloadBytes(path, oldValue.content);

      if (rawWrite.content === null) {
        if (node === null || oldValue === null) continue;
        const deleted = deleteValueAt(node, key, 0, records, stats);
        node = deleted.node;
        entryCount -= 1;
        treeBytes = treeBytesAfterWrite(treeBytes, entryCount + 1, oldEntryBytes, null);
        continue;
      }

      const value = freezeValue(path, rawWrite.content);
      records.set(value.digest, deepFreeze({ digest: value.digest, kind: 'value', payload: value.payload }));
      stats.valueWrites += 1;
      if (node === null) node = makeNode(null, [], records, stats);
      node = setValueAt(node, key, 0, value, records, stats);
      const newEntryBytes = entryPayloadBytes(path, rawWrite.content);
      if (oldValue === null) entryCount += 1;
      treeBytes = treeBytesAfterWrite(treeBytes, oldValue === null ? entryCount - 1 : entryCount, oldEntryBytes, newEntryBytes);

      if (entryCount > effective.limits.maxTreeEntries) {
        throw new ContractError('tree_entry_limit_exceeded', `Tree exceeds ${effective.limits.maxTreeEntries} files`);
      }
      if (treeBytes > effective.limits.maxTreeBytes) {
        throw new ContractError('tree_limit_exceeded', `Tree exceeds ${effective.limits.maxTreeBytes} bytes`, { size: treeBytes });
      }
    }

    return new SemanticRadixTree({ node, entryCount, treeBytes, pendingRecords: records, stats });
  }

  materialize() {
    const output = record();
    const stats = { nodeReads: 0, nodeWrites: 0, valueWrites: 0 };
    if (this.node !== null) collectEntries(this.node, Buffer.alloc(0), output, stats);
    return deepFreeze(output);
  }

  objectRecords() {
    return [...this.#pendingRecords.values()].sort((left, right) => compareText(left.digest, right.digest)).map((value) => canonicalClone(value));
  }

  reachableDigests() {
    const output = new Set();
    if (this.node !== null) collectReachable(this.node, output);
    return output;
  }
}

export function buildSemanticTree(tree, context = {}) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    throw new ContractError('invalid_tree', 'Tree must be an object keyed by relative path');
  }
  let semantic = new SemanticRadixTree();
  const writes = Object.entries(tree).sort(([left], [right]) => compareText(left, right)).map(([path, content]) => ({ path, content }));
  semantic = semantic.applyWrites(writes, context);
  return semantic;
}

export function validateSemanticObjectRecord(recordValue, expectedKind = null) {
  if (!isPlainRecord(recordValue) || !['value', 'node'].includes(recordValue.kind) || typeof recordValue.digest !== 'string' || !isPlainRecord(recordValue.payload)) {
    throw new ContractError('invalid_semantic_object', 'Semantic object record is malformed');
  }
  if (expectedKind !== null && recordValue.kind !== expectedKind) {
    throw new ContractError('invalid_semantic_object', `Semantic object kind must be ${expectedKind}`);
  }
  const domain = recordValue.kind === 'value' ? SEMANTIC_VALUE_DOMAIN : SEMANTIC_NODE_DOMAIN;
  if (typedDigest(domain, recordValue.payload) !== recordValue.digest) {
    throw new ContractError('semantic_object_digest_mismatch', `Semantic ${recordValue.kind} object ${recordValue.digest} failed digest validation`);
  }
  return deepFreeze(canonicalClone(recordValue));
}

function loadRecord(resolver, digest, expectedKind) {
  const recordValue = resolver(digest);
  if (recordValue === null || recordValue === undefined) {
    throw new ContractError('semantic_object_missing', `Semantic ${expectedKind} object ${digest} is missing`);
  }
  const validated = validateSemanticObjectRecord(recordValue, expectedKind);
  if (validated.digest !== digest) {
    throw new ContractError('semantic_object_digest_mismatch', `Semantic ${expectedKind} object does not match requested digest ${digest}`);
  }
  return validated;
}

export function hydrateSemanticTree(rootInput, resolver, context = {}) {
  if (typeof resolver !== 'function') throw new ContractError('invalid_semantic_resolver', 'Semantic object resolver must be a function');
  const root = validateSemanticRoot(rootInput);
  if (root.nodeDigest === null) return new SemanticRadixTree();
  const visiting = new Set();

  function loadNode(digest) {
    if (visiting.has(digest)) throw new ContractError('semantic_object_cycle', 'Semantic radix contains a cycle');
    visiting.add(digest);
    const raw = loadRecord(resolver, digest, 'node');
    const payload = raw.payload;
    const keys = Object.keys(payload).sort(compareText);
    if (keys.join('\0') !== ['children', 'valueDigest'].sort(compareText).join('\0') || !Array.isArray(payload.children)) {
      throw new ContractError('invalid_semantic_node', 'Semantic radix node shape is invalid');
    }
    let value = null;
    if (payload.valueDigest !== null) {
      assertDigestString(payload.valueDigest, 'semantic node valueDigest');
      const valueRecord = loadRecord(resolver, payload.valueDigest, 'value');
      const valueKeys = Object.keys(valueRecord.payload).sort(compareText);
      if (valueKeys.join('\0') !== ['content', 'path'].sort(compareText).join('\0') || typeof valueRecord.payload.path !== 'string' || typeof valueRecord.payload.content !== 'string') {
        throw new ContractError('invalid_semantic_value', 'Semantic value shape is invalid');
      }
      value = freezeValue(valueRecord.payload.path, valueRecord.payload.content);
    }
    const children = [];
    const seenFirstBytes = new Set();
    for (const entry of payload.children) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new ContractError('invalid_semantic_node', 'Semantic child entry is invalid');
      const edge = hexToBytes(entry[0], 'semantic child edge');
      assertDigestString(entry[1], 'semantic child digest');
      if (seenFirstBytes.has(edge[0])) throw new ContractError('invalid_semantic_radix', 'Semantic children share a first byte');
      seenFirstBytes.add(edge[0]);
      children.push({ edge: entry[0], child: loadNode(entry[1]) });
    }
    children.sort(compareEdges);
    const node = makeNode(value, children, null, null);
    if (node.digest !== digest) throw new ContractError('semantic_object_digest_mismatch', 'Semantic node reconstruction changed its digest');
    visiting.delete(digest);
    return node;
  }

  const node = loadNode(root.nodeDigest);
  const semantic = new SemanticRadixTree({ node, entryCount: root.entryCount, treeBytes: root.treeBytes });
  if (semantic.root.rootDigest !== root.rootDigest) throw new ContractError('semantic_root_digest_mismatch', 'Semantic root reconstruction changed its digest');
  const materialized = semantic.materialize();
  const rebuilt = buildSemanticTree(materialized, context);
  if (rebuilt.root.rootDigest !== root.rootDigest || rebuilt.entryCount !== root.entryCount || rebuilt.treeBytes !== root.treeBytes) {
    throw new ContractError('semantic_root_content_mismatch', 'Semantic root counts or canonical content are inconsistent');
  }
  return semantic;
}

export function semanticPlanBinding(plan, baseRootInput) {
  const baseRoot = validateSemanticRoot(baseRootInput);
  const identity = {
    revisionId: plan.revisionId,
    baseDigest: plan.baseDigest,
    planDigest: plan.planDigest,
    tasks: plan.taskOrder.map((taskId) => canonicalClone(plan.tasksById[taskId])),
    baseRoot,
  };
  return deepFreeze({ ...identity, planBindingDigest: typedDigest(SEMANTIC_PLAN_BINDING_DOMAIN, identity) });
}

export function validateSemanticPlanBinding(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_semantic_plan_binding', 'Semantic Plan binding must be a record');
  const expected = ['revisionId', 'baseDigest', 'planDigest', 'tasks', 'baseRoot', 'planBindingDigest'].sort(compareText);
  const actual = Object.keys(input).sort(compareText);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    throw new ContractError('invalid_semantic_plan_binding', 'Semantic Plan binding fields are invalid');
  }
  assertDigestString(input.baseDigest, 'semantic plan baseDigest');
  assertDigestString(input.planDigest, 'semantic plan planDigest');
  assertDigestString(input.planBindingDigest, 'semantic plan planBindingDigest');
  if (typeof input.revisionId !== 'string' || !Array.isArray(input.tasks)) throw new ContractError('invalid_semantic_plan_binding', 'Semantic Plan binding identity is invalid');
  const baseRoot = validateSemanticRoot(input.baseRoot);
  const identity = {
    revisionId: input.revisionId,
    baseDigest: input.baseDigest,
    planDigest: input.planDigest,
    tasks: canonicalClone(input.tasks),
    baseRoot,
  };
  if (typedDigest(SEMANTIC_PLAN_BINDING_DOMAIN, identity) !== input.planBindingDigest) {
    throw new ContractError('semantic_plan_binding_digest_mismatch', 'Semantic Plan binding digest is invalid');
  }
  return deepFreeze(canonicalClone(input));
}
