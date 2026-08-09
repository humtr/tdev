import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { canonicalJson, compareText, typedDigest } from '../src/canonical.mjs';

const encoder = new TextEncoder();

const VALUE_DOMAIN = 'tdev.research.semantic-value.v1';
const DIRECTORY_NODE_DOMAIN = 'tdev.research.semantic-directory-node.v1';
const DIRECTORY_ROOT_DOMAIN = 'tdev.research.semantic-directory-root.v1';
const RADIX_NODE_DOMAIN = 'tdev.research.semantic-radix-node.v1';
const RADIX_ROOT_DOMAIN = 'tdev.research.semantic-radix-root.v1';
const HASH_TRIE_NODE_DOMAIN = 'tdev.research.semantic-hashtrie-node.v1';
const HASH_TRIE_ROOT_DOMAIN = 'tdev.research.semantic-hashtrie-root.v1';
const PATH_KEY_DOMAIN = 'tdev.research.semantic-path-key.v1';

export const RESEARCH_MODEL_NAMES = Object.freeze([
  'directory-merkle',
  'byte-radix',
  'hash-trie',
]);

function metrics() {
  return {
    hashOperations: 0,
    bytesHashed: 0,
    valuesWritten: 0,
    nodesWritten: 0,
    nodesRead: 0,
    existingNodesReplaced: 0,
    existingValuesReplaced: 0,
    childRefsCopied: 0,
    childRefsHashed: 0,
    bucketEntriesCopied: 0,
    bucketEntriesHashed: 0,
    pathSteps: 0,
    maxFanout: 0,
    maxHeight: 0,
    maxBucket: 0,
  };
}

function trackedTypedDigest(domain, value, outputMetrics) {
  const encoded = canonicalJson(value);
  outputMetrics.hashOperations += 1;
  outputMetrics.bytesHashed += Buffer.byteLength(encoded, 'utf8');
  return typedDigest(domain, value);
}

function makeValue(filePath, content, outputMetrics) {
  outputMetrics.valuesWritten += 1;
  const payload = { path: filePath, content };
  return {
    path: filePath,
    content,
    digest: trackedTypedDigest(VALUE_DOMAIN, payload, outputMetrics),
  };
}

function normalizeWrites(writes) {
  if (!Array.isArray(writes)) throw new TypeError('writes must be an array');
  const normalized = writes.map((write) => {
    if (!write || typeof write !== 'object' || Array.isArray(write)) throw new TypeError('write must be a record');
    if (typeof write.path !== 'string' || write.path.length === 0) throw new TypeError('write.path must be a non-empty string');
    if (!(typeof write.content === 'string' || write.content === null)) throw new TypeError('write.content must be string or null');
    return { path: write.path, content: write.content };
  }).sort((left, right) => compareText(left.path, right.path));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].path === normalized[index].path) {
      throw new Error(`duplicate research write path: ${normalized[index].path}`);
    }
  }
  return normalized;
}

function treeWrites(tree) {
  return Object.entries(tree)
    .sort(([left], [right]) => compareText(left, right))
    .map(([filePath, content]) => ({ path: filePath, content }));
}

function sameValue(value, path, content) {
  return value !== null && value !== undefined && value.path === path && value.content === content;
}

function rootDigest(domain, node, outputMetrics) {
  return trackedTypedDigest(domain, { nodeDigest: node?.digest ?? null }, outputMetrics);
}

function rootOnlyDigest(domain, node) {
  return typedDigest(domain, { nodeDigest: node?.digest ?? null });
}

function computeReuse(model, outputMetrics) {
  return {
    reusedNodes: Math.max(0, model.nodeCount - outputMetrics.existingNodesReplaced),
    reusedValues: Math.max(0, model.valueCount - outputMetrics.existingValuesReplaced),
  };
}

// ---------------------------------------------------------------------------
// C1: directory Merkle reference model.
// ---------------------------------------------------------------------------

function directoryDigest(children, outputMetrics, height) {
  const ordered = [...children.entries()].sort(([left], [right]) => compareText(left, right));
  outputMetrics.childRefsHashed += ordered.length;
  outputMetrics.maxFanout = Math.max(outputMetrics.maxFanout, ordered.length);
  outputMetrics.maxHeight = Math.max(outputMetrics.maxHeight, height);
  const payload = {
    children: ordered.map(([name, child]) => [name, child.kind, child.digest]),
  };
  return trackedTypedDigest(DIRECTORY_NODE_DOMAIN, payload, outputMetrics);
}

function updateDirectoryNode(node, items, depth, outputMetrics) {
  outputMetrics.pathSteps += items.length;
  if (node) {
    outputMetrics.nodesRead += 1;
    outputMetrics.existingNodesReplaced += 1;
    outputMetrics.childRefsCopied += node.children.size;
  }
  const children = new Map(node?.children ?? []);
  const groups = new Map();
  for (const item of items) {
    const segment = item.segments[depth];
    const list = groups.get(segment) ?? [];
    list.push(item);
    groups.set(segment, list);
  }

  for (const [segment, group] of groups.entries()) {
    const atFile = group.every((item) => depth === item.segments.length - 1);
    if (atFile) {
      const item = group[group.length - 1];
      const prior = children.get(segment);
      if (prior?.kind === 'value') {
        if (item.content === null) outputMetrics.existingValuesReplaced += 1;
        else if (!sameValue(prior.value, item.path, item.content)) outputMetrics.existingValuesReplaced += 1;
      }
      if (item.content === null) {
        children.delete(segment);
      } else if (prior?.kind === 'value' && sameValue(prior.value, item.path, item.content)) {
        // Preserve exact immutable value identity.
      } else {
        const value = makeValue(item.path, item.content, outputMetrics);
        children.set(segment, { kind: 'value', value, digest: value.digest });
      }
      continue;
    }

    const prior = children.get(segment);
    if (prior?.kind === 'value') throw new Error(`research directory topology collision at ${segment}`);
    const next = updateDirectoryNode(prior?.kind === 'directory' ? prior.node : null, group, depth + 1, outputMetrics);
    if (next === null) children.delete(segment);
    else children.set(segment, { kind: 'directory', node: next, digest: next.digest });
  }

  if (children.size === 0) return null;
  const digest = directoryDigest(children, outputMetrics, depth + 1);
  outputMetrics.nodesWritten += 1;
  return { kind: 'directory-node', children, digest };
}

function buildDirectory(tree) {
  const outputMetrics = metrics();
  const writes = treeWrites(tree).map((item) => ({ ...item, segments: item.path.split('/') }));
  const root = writes.length === 0 ? null : updateDirectoryNode(null, writes, 0, outputMetrics);
  const model = {
    kind: 'directory-merkle',
    root,
    rootDigest: rootDigest(DIRECTORY_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: outputMetrics.nodesWritten,
    valueCount: outputMetrics.valuesWritten,
  };
  return { model, metrics: outputMetrics };
}

function updateDirectory(model, writes) {
  const outputMetrics = metrics();
  const normalized = normalizeWrites(writes).map((item) => ({ ...item, segments: item.path.split('/') }));
  const root = normalized.length === 0 ? model.root : updateDirectoryNode(model.root, normalized, 0, outputMetrics);
  const next = {
    ...model,
    root,
    rootDigest: rootDigest(DIRECTORY_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: model.nodeCount + outputMetrics.nodesWritten - outputMetrics.existingNodesReplaced,
    valueCount: model.valueCount + outputMetrics.valuesWritten - outputMetrics.existingValuesReplaced,
  };
  Object.assign(outputMetrics, computeReuse(model, outputMetrics));
  return { model: next, metrics: outputMetrics };
}

function materializeDirectory(model) {
  const outputMetrics = { nodesRead: 0, valuesRead: 0, outputEntries: 0 };
  const tree = Object.create(null);
  function visit(node) {
    if (!node) return;
    outputMetrics.nodesRead += 1;
    for (const child of node.children.values()) {
      if (child.kind === 'value') {
        outputMetrics.valuesRead += 1;
        outputMetrics.outputEntries += 1;
        tree[child.value.path] = child.value.content;
      } else visit(child.node);
    }
  }
  visit(model.root);
  return { tree, metrics: outputMetrics };
}

// ---------------------------------------------------------------------------
// C2: bounded-fanout UTF-8 path-byte radix CAS.
// ---------------------------------------------------------------------------

function radixNodeDigest(terminal, children, outputMetrics, height) {
  const ordered = [...children.entries()].sort(([left], [right]) => left - right);
  outputMetrics.childRefsHashed += ordered.length;
  outputMetrics.maxFanout = Math.max(outputMetrics.maxFanout, ordered.length);
  outputMetrics.maxHeight = Math.max(outputMetrics.maxHeight, height);
  const payload = {
    terminalDigest: terminal?.digest ?? null,
    children: ordered.map(([byte, child]) => [byte, child.digest]),
  };
  return trackedTypedDigest(RADIX_NODE_DOMAIN, payload, outputMetrics);
}

function updateRadixNode(node, items, depth, outputMetrics) {
  outputMetrics.pathSteps += items.length;
  if (node) {
    outputMetrics.nodesRead += 1;
    outputMetrics.existingNodesReplaced += 1;
    outputMetrics.childRefsCopied += node.children.size;
  }
  let terminal = node?.terminal ?? null;
  const children = new Map(node?.children ?? []);
  const groups = new Map();

  for (const item of items) {
    if (depth === item.bytes.length) {
      if (terminal) {
        if (item.content === null) outputMetrics.existingValuesReplaced += 1;
        else if (!sameValue(terminal, item.path, item.content)) outputMetrics.existingValuesReplaced += 1;
      }
      if (item.content === null) terminal = null;
      else if (!sameValue(terminal, item.path, item.content)) terminal = makeValue(item.path, item.content, outputMetrics);
      continue;
    }
    const byte = item.bytes[depth];
    const list = groups.get(byte) ?? [];
    list.push(item);
    groups.set(byte, list);
  }

  for (const [byte, group] of groups.entries()) {
    const next = updateRadixNode(children.get(byte) ?? null, group, depth + 1, outputMetrics);
    if (next === null) children.delete(byte);
    else children.set(byte, next);
  }

  if (!terminal && children.size === 0) return null;
  const digest = radixNodeDigest(terminal, children, outputMetrics, depth + 1);
  outputMetrics.nodesWritten += 1;
  return { kind: 'radix-node', terminal, children, digest };
}

function radixItems(writes) {
  return normalizeWrites(writes).map((item) => ({ ...item, bytes: encoder.encode(item.path) }));
}

function buildRadix(tree) {
  const outputMetrics = metrics();
  const items = treeWrites(tree).map((item) => ({ ...item, bytes: encoder.encode(item.path) }));
  const root = items.length === 0 ? null : updateRadixNode(null, items, 0, outputMetrics);
  const model = {
    kind: 'byte-radix',
    root,
    rootDigest: rootDigest(RADIX_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: outputMetrics.nodesWritten,
    valueCount: outputMetrics.valuesWritten,
  };
  return { model, metrics: outputMetrics };
}

function updateRadix(model, writes) {
  const outputMetrics = metrics();
  const items = radixItems(writes);
  const root = items.length === 0 ? model.root : updateRadixNode(model.root, items, 0, outputMetrics);
  const next = {
    ...model,
    root,
    rootDigest: rootDigest(RADIX_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: model.nodeCount + outputMetrics.nodesWritten - outputMetrics.existingNodesReplaced,
    valueCount: model.valueCount + outputMetrics.valuesWritten - outputMetrics.existingValuesReplaced,
  };
  Object.assign(outputMetrics, computeReuse(model, outputMetrics));
  return { model: next, metrics: outputMetrics };
}

function materializeRadix(model) {
  const outputMetrics = { nodesRead: 0, valuesRead: 0, outputEntries: 0 };
  const tree = Object.create(null);
  function visit(node) {
    if (!node) return;
    outputMetrics.nodesRead += 1;
    if (node.terminal) {
      outputMetrics.valuesRead += 1;
      outputMetrics.outputEntries += 1;
      tree[node.terminal.path] = node.terminal.content;
    }
    for (const [, child] of [...node.children.entries()].sort(([left], [right]) => left - right)) visit(child);
  }
  visit(model.root);
  return { tree, metrics: outputMetrics };
}

// ---------------------------------------------------------------------------
// C3: canonical compressed hash trie (Patricia-like) with collision buckets.
// ---------------------------------------------------------------------------

function defaultPathKey(filePath) {
  return createHash('sha256')
    .update(PATH_KEY_DOMAIN, 'utf8')
    .update(Buffer.from([0]))
    .update(Buffer.from(filePath, 'utf8'))
    .digest('hex');
}

function firstDifferentNibble(left, right, start) {
  for (let index = start; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
}

function immutableLeaf(hash, bucket, outputMetrics) {
  const values = [...bucket.values()].sort((left, right) => compareText(left.path, right.path));
  outputMetrics.bucketEntriesHashed += values.length;
  outputMetrics.maxBucket = Math.max(outputMetrics.maxBucket, values.length);
  const payload = { hash, bucket: values.map((value) => [value.path, value.digest]) };
  const digest = trackedTypedDigest(HASH_TRIE_NODE_DOMAIN, payload, outputMetrics);
  outputMetrics.nodesWritten += 1;
  return { kind: 'hash-leaf', hash, bucket: values, digest };
}

function immutableBranch(depth, prefix, children, outputMetrics) {
  const ordered = [...children.entries()].sort(([left], [right]) => compareText(left, right));
  outputMetrics.childRefsHashed += ordered.length;
  outputMetrics.maxFanout = Math.max(outputMetrics.maxFanout, ordered.length);
  outputMetrics.maxHeight = Math.max(outputMetrics.maxHeight, depth + 1);
  const payload = { depth, prefix, children: ordered.map(([nibble, child]) => [nibble, child.digest]) };
  const digest = trackedTypedDigest(HASH_TRIE_NODE_DOMAIN, payload, outputMetrics);
  outputMetrics.nodesWritten += 1;
  return { kind: 'hash-branch', depth, prefix, children, digest };
}

function mutableClone(node, outputMetrics, clones) {
  if (node?._mutable) return node;
  const prior = clones.get(node);
  if (prior) return prior;
  outputMetrics.nodesRead += 1;
  outputMetrics.existingNodesReplaced += 1;
  let clone;
  if (node.kind === 'hash-branch') {
    outputMetrics.childRefsCopied += node.children.size;
    clone = { kind: 'hash-branch', depth: node.depth, prefix: node.prefix, children: new Map(node.children), _mutable: true };
  } else {
    outputMetrics.bucketEntriesCopied += node.bucket.length;
    clone = {
      kind: 'hash-leaf',
      hash: node.hash,
      bucket: new Map(node.bucket.map((value) => [value.path, value])),
      _mutable: true,
    };
  }
  clones.set(node, clone);
  return clone;
}

function newMutableLeaf(item, outputMetrics) {
  const bucket = new Map();
  if (item.content !== null) bucket.set(item.path, makeValue(item.path, item.content, outputMetrics));
  return { kind: 'hash-leaf', hash: item.key, bucket, _mutable: true };
}

function mutateHashNode(node, item, minDepth, outputMetrics, clones) {
  outputMetrics.pathSteps += 1;
  if (!node) return item.content === null ? null : newMutableLeaf(item, outputMetrics);

  if (node.kind === 'hash-leaf') {
    if (node.hash === item.key) {
      const existing = node._mutable ? node.bucket.get(item.path) : node.bucket.find((value) => value.path === item.path);
      if (item.content === null && !existing) return node;
      if (item.content !== null && existing && sameValue(existing, item.path, item.content)) return node;
      const leaf = mutableClone(node, outputMetrics, clones);
      if (existing) outputMetrics.existingValuesReplaced += 1;
      if (item.content === null) leaf.bucket.delete(item.path);
      else leaf.bucket.set(item.path, makeValue(item.path, item.content, outputMetrics));
      return leaf;
    }
    if (item.content === null) return node;
    const depth = firstDifferentNibble(node.hash, item.key, minDepth);
    if (depth < 0) throw new Error('hash trie key mismatch without differing nibble');
    const incoming = newMutableLeaf(item, outputMetrics);
    const children = new Map([
      [node.hash[depth], node],
      [item.key[depth], incoming],
    ]);
    return { kind: 'hash-branch', depth, prefix: item.key.slice(0, depth), children, _mutable: true };
  }

  const prefixDifference = firstDifferentNibble(node.prefix, item.key, minDepth);
  if (prefixDifference >= 0) {
    if (item.content === null) return node;
    const incoming = newMutableLeaf(item, outputMetrics);
    const children = new Map([
      [node.prefix[prefixDifference], node],
      [item.key[prefixDifference], incoming],
    ]);
    return {
      kind: 'hash-branch',
      depth: prefixDifference,
      prefix: item.key.slice(0, prefixDifference),
      children,
      _mutable: true,
    };
  }

  const nibble = item.key[node.depth];
  const child = node.children.get(nibble) ?? null;
  if (!child && item.content === null) return node;
  const branch = mutableClone(node, outputMetrics, clones);
  const next = mutateHashNode(child, item, node.depth + 1, outputMetrics, clones);
  if (next === null) branch.children.delete(nibble);
  else branch.children.set(nibble, next);
  return branch;
}

function finalizeHashNode(node, outputMetrics) {
  if (!node) return null;
  if (!node._mutable) return node;
  if (node.kind === 'hash-leaf') {
    if (node.bucket.size === 0) return null;
    return immutableLeaf(node.hash, node.bucket, outputMetrics);
  }

  const children = new Map();
  for (const [nibble, child] of node.children.entries()) {
    const finalized = finalizeHashNode(child, outputMetrics);
    if (finalized) children.set(nibble, finalized);
  }
  if (children.size === 0) return null;
  if (children.size === 1) return children.values().next().value;
  return immutableBranch(node.depth, node.prefix, children, outputMetrics);
}

function hashItems(writes, keyFn) {
  return normalizeWrites(writes).map((item) => {
    const key = keyFn(item.path);
    if (typeof key !== 'string' || key.length === 0) throw new Error('hash trie key must be a non-empty string');
    return { ...item, key };
  });
}

function updateHashRoot(root, items, outputMetrics) {
  const clones = new WeakMap();
  let current = root;
  for (const item of items) current = mutateHashNode(current, item, 0, outputMetrics, clones);
  return finalizeHashNode(current, outputMetrics);
}

function buildHashTrie(tree, options = {}) {
  const outputMetrics = metrics();
  const keyFn = options.keyFn ?? defaultPathKey;
  const items = treeWrites(tree).map((item) => ({ ...item, key: keyFn(item.path) }));
  const root = updateHashRoot(null, items, outputMetrics);
  const model = {
    kind: 'hash-trie',
    root,
    rootDigest: rootDigest(HASH_TRIE_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: outputMetrics.nodesWritten,
    valueCount: outputMetrics.valuesWritten,
    keyFn,
  };
  return { model, metrics: outputMetrics };
}

function updateHashTrie(model, writes, options = {}) {
  const outputMetrics = metrics();
  const keyFn = options.keyFn ?? model.keyFn ?? defaultPathKey;
  const items = hashItems(writes, keyFn);
  const root = updateHashRoot(model.root, items, outputMetrics);
  const next = {
    ...model,
    root,
    rootDigest: rootDigest(HASH_TRIE_ROOT_DOMAIN, root, outputMetrics),
    nodeCount: model.nodeCount + outputMetrics.nodesWritten - outputMetrics.existingNodesReplaced,
    valueCount: model.valueCount + outputMetrics.valuesWritten - outputMetrics.existingValuesReplaced,
    keyFn,
  };
  Object.assign(outputMetrics, computeReuse(model, outputMetrics));
  return { model: next, metrics: outputMetrics };
}

function materializeHashTrie(model) {
  const outputMetrics = { nodesRead: 0, valuesRead: 0, outputEntries: 0, maxBucket: 0 };
  const tree = Object.create(null);
  function visit(node) {
    if (!node) return;
    outputMetrics.nodesRead += 1;
    if (node.kind === 'hash-leaf') {
      outputMetrics.maxBucket = Math.max(outputMetrics.maxBucket, node.bucket.length);
      for (const value of node.bucket) {
        outputMetrics.valuesRead += 1;
        outputMetrics.outputEntries += 1;
        tree[value.path] = value.content;
      }
      return;
    }
    for (const [, child] of [...node.children.entries()].sort(([left], [right]) => compareText(left, right))) visit(child);
  }
  visit(model.root);
  return { tree, metrics: outputMetrics };
}

// ---------------------------------------------------------------------------
// Public research harness API.
// ---------------------------------------------------------------------------

export function buildResearchModel(name, tree, options = {}) {
  if (name === 'directory-merkle') return buildDirectory(tree);
  if (name === 'byte-radix') return buildRadix(tree);
  if (name === 'hash-trie') return buildHashTrie(tree, options);
  throw new Error(`unknown research model: ${name}`);
}

export function updateResearchModel(name, model, writes, options = {}) {
  if (name !== model.kind) throw new Error(`research model kind mismatch: ${name} != ${model.kind}`);
  if (name === 'directory-merkle') return updateDirectory(model, writes);
  if (name === 'byte-radix') return updateRadix(model, writes);
  if (name === 'hash-trie') return updateHashTrie(model, writes, options);
  throw new Error(`unknown research model: ${name}`);
}

export function materializeResearchModel(name, model) {
  if (name !== model.kind) throw new Error(`research model kind mismatch: ${name} != ${model.kind}`);
  if (name === 'directory-merkle') return materializeDirectory(model);
  if (name === 'byte-radix') return materializeRadix(model);
  if (name === 'hash-trie') return materializeHashTrie(model);
  throw new Error(`unknown research model: ${name}`);
}

export function hypotheticalHeadBytes(name, previousRootDigest, nextRootDigest) {
  const head = {
    schema: 'tdev.research.semantic-head.v1',
    representation: name,
    migrationEpoch: 'research-only',
    generation: 1,
    previousRootDigest,
    nextRootDigest,
  };
  return Buffer.byteLength(canonicalJson(head), 'utf8');
}

export function researchRootDigest(name, model) {
  if (name === 'directory-merkle') return rootOnlyDigest(DIRECTORY_ROOT_DOMAIN, model.root);
  if (name === 'byte-radix') return rootOnlyDigest(RADIX_ROOT_DOMAIN, model.root);
  if (name === 'hash-trie') return rootOnlyDigest(HASH_TRIE_ROOT_DOMAIN, model.root);
  throw new Error(`unknown research model: ${name}`);
}

export const RESEARCH_DIGEST_DOMAINS = Object.freeze({
  value: VALUE_DOMAIN,
  directoryNode: DIRECTORY_NODE_DOMAIN,
  directoryRoot: DIRECTORY_ROOT_DOMAIN,
  radixNode: RADIX_NODE_DOMAIN,
  radixRoot: RADIX_ROOT_DOMAIN,
  hashTrieNode: HASH_TRIE_NODE_DOMAIN,
  hashTrieRoot: HASH_TRIE_ROOT_DOMAIN,
  pathKey: PATH_KEY_DOMAIN,
});
