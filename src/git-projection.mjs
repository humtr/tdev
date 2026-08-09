import { spawn } from 'node:child_process';

import {
  ContractError,
  canonicalClone,
  compareText,
  deepFreeze,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  SemanticRadixTree,
  buildSemanticTree,
  validateSemanticRoot,
} from './semantic-authority.mjs';

export const GIT_PROJECTION_PROFILE = 'tdev.git.text-tree.v1';
export const GIT_PROJECTION_CANDIDATE_DOMAIN = 'tdev.git.projection-candidate.v1';
export const GIT_PUBLICATION_RECEIPT_DOMAIN = 'tdev.git.publication-receipt.v1';

const OBJECT_FORMATS = Object.freeze({ sha1: 40, sha256: 64 });
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const ALLOWED_GIT_METADATA_ENV = new Set([
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_DATE',
]);
const MAX_NAME_BYTES = 256;
const MAX_EMAIL_BYTES = 320;
const MAX_MESSAGE_BYTES = 64 * 1024;

function freeze(value) {
  return deepFreeze(canonicalClone(value));
}

function assertString(value, code, message) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new ContractError(code, message);
  }
  return value;
}

function normalizeRepositoryPath(value) {
  return assertString(value, 'invalid_git_repository_path', 'Git repository path must be a non-empty NUL-free string');
}

function normalizeGitExecutable(value) {
  return assertString(value, 'invalid_git_executable', 'Git executable must be a non-empty NUL-free string');
}

function oidLength(objectFormat) {
  const length = OBJECT_FORMATS[objectFormat];
  if (length === undefined) {
    throw new ContractError('unsupported_git_object_format', `Unsupported Git object format: ${objectFormat}`);
  }
  return length;
}

function assertOid(value, objectFormat, label) {
  const length = oidLength(objectFormat);
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/.test(value)) {
    throw new ContractError('invalid_git_oid', `${label} must be a lowercase ${objectFormat} Git OID`);
  }
  return value;
}

function zeroOid(objectFormat) {
  return '0'.repeat(oidLength(objectFormat));
}

function assertTypedSha256(value, code, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError(code, `${label} must be a typed SHA-256 digest`);
  }
  return value;
}

function assertSemanticDigest(value) {
  return assertTypedSha256(value, 'invalid_git_semantic_root', 'Git projection semanticRootDigest');
}

function normalizePublicationRef(value) {
  assertString(value, 'invalid_git_publication_ref', 'Git publication ref must be a non-empty NUL-free string');
  if (!value.startsWith('refs/heads/') || value.length <= 'refs/heads/'.length) {
    throw new ContractError('invalid_git_publication_ref', 'D0011 publication ref must be a full refs/heads/... name');
  }
  return value;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function normalizeIdentityPart(value, label, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || byteLength(value) > maxBytes || /[\0\r\n<>]/.test(value)) {
    throw new ContractError('invalid_git_commit_metadata', `${label} is invalid`);
  }
  return value;
}

function normalizeTimezone(value) {
  if (typeof value !== 'string' || !/^[+-][0-9]{4}$/.test(value)) {
    throw new ContractError('invalid_git_commit_metadata', 'timezoneOffset must be explicit +HHMM or -HHMM');
  }
  const hours = Number.parseInt(value.slice(1, 3), 10);
  const minutes = Number.parseInt(value.slice(3, 5), 10);
  if (hours > 23 || minutes > 59) {
    throw new ContractError('invalid_git_commit_metadata', 'timezoneOffset has an invalid hour or minute');
  }
  return value;
}

function normalizeMessage(value) {
  if (typeof value !== 'string' || value.includes('\0') || byteLength(value) > MAX_MESSAGE_BYTES) {
    throw new ContractError('invalid_git_commit_metadata', 'Git projection message is invalid or too large');
  }
  return `${value.replace(/\n+$/u, '')}\n`;
}

function normalizeCommitMetadata(input) {
  if (!isPlainRecord(input)) {
    throw new ContractError('invalid_git_commit_metadata', 'Git commit metadata must be an object');
  }
  const keys = Object.keys(input).sort().join('\0');
  if (keys !== ['authorEmail', 'authorName', 'message', 'timestampSeconds', 'timezoneOffset'].sort().join('\0')) {
    throw new ContractError('invalid_git_commit_metadata', 'Git commit metadata has unexpected fields');
  }
  if (!Number.isSafeInteger(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new ContractError('invalid_git_commit_metadata', 'timestampSeconds must be a non-negative safe integer');
  }
  return freeze({
    authorName: normalizeIdentityPart(input.authorName, 'authorName', MAX_NAME_BYTES),
    authorEmail: normalizeIdentityPart(input.authorEmail, 'authorEmail', MAX_EMAIL_BYTES),
    timestampSeconds: input.timestampSeconds,
    timezoneOffset: normalizeTimezone(input.timezoneOffset),
    message: normalizeMessage(input.message),
  });
}

function resultRecord(schema) {
  return freeze(schema);
}

function gitFailure(args, result) {
  const stderr = result?.stderr?.toString('utf8').trim() ?? '';
  return new ContractError('git_command_failed', `Git command failed: ${args[0]}`, {
    args,
    exitCode: result?.code ?? null,
    stderr: stderr.slice(0, 4096),
  });
}

export function runGitCommand({ gitExecutable = 'git', repositoryPath, args, input = null, env = {} }) {
  const controlledEnv = Object.create(null);
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) controlledEnv[key] = value;
  }
  controlledEnv.GIT_CONFIG_NOSYSTEM = '1';
  controlledEnv.GIT_CONFIG_GLOBAL = '/dev/null';
  controlledEnv.GIT_TERMINAL_PROMPT = '0';
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('GIT_') && !ALLOWED_GIT_METADATA_ENV.has(key)) {
      throw new ContractError('invalid_git_environment', `Git environment override ${key} is not allowed`);
    }
    controlledEnv[key] = value;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(gitExecutable, [
      '--no-replace-objects',
      '-c', 'core.hooksPath=/dev/null',
      '-C', repositoryPath,
      ...args,
    ], {
      env: controlledEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflowed = false;

    const append = (chunks, chunk, kind) => {
      const size = chunk.length;
      if (kind === 'stdout') stdoutBytes += size;
      else stderrBytes += size;
      if (stdoutBytes > MAX_GIT_OUTPUT_BYTES || stderrBytes > MAX_GIT_OUTPUT_BYTES) {
        overflowed = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(chunk));
    };

    child.stdout.on('data', (chunk) => append(stdout, chunk, 'stdout'));
    child.stderr.on('data', (chunk) => append(stderr, chunk, 'stderr'));
    child.once('error', (error) => reject(new ContractError('git_process_failed', 'Failed to execute Git', {}, { cause: error })));
    child.once('close', (code, signal) => {
      if (overflowed) {
        reject(new ContractError('git_output_limit_exceeded', 'Git command output exceeded the adapter limit'));
        return;
      }
      resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });

    if (input === null) child.stdin.end();
    else child.stdin.end(input);
  });
}

function candidateIdentity(input) {
  return {
    schemaVersion: 1,
    profile: input.profile,
    semanticRootDigest: input.semanticRootDigest,
    objectFormat: input.objectFormat,
    publicationRef: input.publicationRef,
    expectedRefOid: input.expectedRefOid,
    treeOid: input.treeOid,
    commitOid: input.commitOid,
    commitMetadata: input.commitMetadata,
  };
}

function validateCandidate(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_git_projection_candidate', 'Git projection candidate must be an object');
  const expectedKeys = [...Object.keys(candidateIdentity(input)), 'candidateDigest'].sort().join('\0');
  if (Object.keys(input).sort().join('\0') !== expectedKeys) {
    throw new ContractError('invalid_git_projection_candidate', 'Git projection candidate has unexpected fields');
  }
  if (input.schemaVersion !== 1 || input.profile !== GIT_PROJECTION_PROFILE) {
    throw new ContractError('invalid_git_projection_candidate', 'Git projection candidate version/profile is unsupported');
  }
  assertSemanticDigest(input.semanticRootDigest);
  oidLength(input.objectFormat);
  normalizePublicationRef(input.publicationRef);
  if (input.expectedRefOid !== null) assertOid(input.expectedRefOid, input.objectFormat, 'expectedRefOid');
  assertOid(input.treeOid, input.objectFormat, 'treeOid');
  assertOid(input.commitOid, input.objectFormat, 'commitOid');
  const metadata = normalizeCommitMetadata(input.commitMetadata);
  assertTypedSha256(input.candidateDigest, 'invalid_git_projection_candidate', 'candidateDigest');
  const identity = candidateIdentity({ ...input, commitMetadata: metadata });
  if (typedDigest(GIT_PROJECTION_CANDIDATE_DOMAIN, identity) !== input.candidateDigest) {
    throw new ContractError('git_projection_candidate_digest_mismatch', 'Git projection candidate digest is invalid');
  }
  return freeze({ ...identity, candidateDigest: input.candidateDigest });
}

function receiptIdentity(input) {
  return {
    schemaVersion: 1,
    profile: input.profile,
    candidateDigest: input.candidateDigest,
    semanticRootDigest: input.semanticRootDigest,
    objectFormat: input.objectFormat,
    publicationRef: input.publicationRef,
    predecessorOid: input.predecessorOid,
    treeOid: input.treeOid,
    commitOid: input.commitOid,
    outcome: input.outcome,
  };
}

function validateReceipt(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_git_publication_receipt', 'Git publication receipt must be an object');
  const expectedKeys = [...Object.keys(receiptIdentity(input)), 'receiptDigest'].sort().join('\0');
  if (Object.keys(input).sort().join('\0') !== expectedKeys) {
    throw new ContractError('invalid_git_publication_receipt', 'Git publication receipt has unexpected fields');
  }
  if (input.schemaVersion !== 1 || input.profile !== GIT_PROJECTION_PROFILE) {
    throw new ContractError('invalid_git_publication_receipt', 'Git publication receipt version/profile is unsupported');
  }
  assertSemanticDigest(input.semanticRootDigest);
  oidLength(input.objectFormat);
  normalizePublicationRef(input.publicationRef);
  if (input.predecessorOid !== null) assertOid(input.predecessorOid, input.objectFormat, 'predecessorOid');
  assertOid(input.treeOid, input.objectFormat, 'treeOid');
  assertOid(input.commitOid, input.objectFormat, 'commitOid');
  if (!['observed', 'reconciled'].includes(input.outcome)) {
    throw new ContractError('invalid_git_publication_receipt', 'Git publication receipt outcome is invalid');
  }
  assertTypedSha256(input.receiptDigest, 'invalid_git_publication_receipt', 'receiptDigest');
  assertTypedSha256(input.candidateDigest, 'invalid_git_publication_receipt', 'candidateDigest');
  const identity = receiptIdentity(input);
  if (typedDigest(GIT_PUBLICATION_RECEIPT_DOMAIN, identity) !== input.receiptDigest) {
    throw new ContractError('git_publication_receipt_digest_mismatch', 'Git publication receipt digest is invalid');
  }
  return freeze({ ...identity, receiptDigest: input.receiptDigest });
}

function makeTreeNode() {
  return { directories: new Map(), files: new Map() };
}

function decodeUtf8(bytes, label) {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new ContractError('invalid_git_projection_bytes', `${label} must be valid UTF-8`, {}, { cause: error });
  }
}

function expectedCommitBody(treeOid, expectedRefOid, metadata) {
  const parent = expectedRefOid === null ? '' : `parent ${expectedRefOid}\n`;
  const identity = `${metadata.authorName} <${metadata.authorEmail}> ${metadata.timestampSeconds} ${metadata.timezoneOffset}`;
  return `tree ${treeOid}\n${parent}author ${identity}\ncommitter ${identity}\n\n${metadata.message}`;
}

function parseCommitBinding(raw, objectFormat) {
  const separator = raw.indexOf('\n\n');
  if (separator < 0) throw new ContractError('invalid_git_projection_commit', 'Git commit object is malformed');
  const headers = raw.slice(0, separator).split('\n');
  const treeLines = headers.filter((line) => line.startsWith('tree '));
  const parentLines = headers.filter((line) => line.startsWith('parent '));
  if (treeLines.length !== 1 || parentLines.length > 1) {
    throw new ContractError('invalid_git_projection_commit', 'D0011 commit must have exactly one tree and at most one parent');
  }
  const treeOid = assertOid(treeLines[0].slice(5), objectFormat, 'commit tree OID');
  const parentOid = parentLines.length === 0 ? null : assertOid(parentLines[0].slice(7), objectFormat, 'commit parent OID');
  return { treeOid, parentOid };
}

function addTreeEntry(root, path, content) {
  const parts = path.split('/');
  let node = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    let child = node.directories.get(part);
    if (child === undefined) {
      child = makeTreeNode();
      node.directories.set(part, child);
    }
    node = child;
  }
  node.files.set(parts.at(-1), content);
}

export class GitProjectionAdapter {
  #runner;
  #faultInjector;

  constructor({ repositoryPath, publicationRef, gitExecutable = 'git', runner = runGitCommand, faultInjector = null }) {
    this.repositoryPath = normalizeRepositoryPath(repositoryPath);
    this.publicationRef = normalizePublicationRef(publicationRef);
    this.gitExecutable = normalizeGitExecutable(gitExecutable);
    if (typeof runner !== 'function') throw new ContractError('invalid_git_runner', 'Git runner must be a function');
    if (faultInjector !== null && typeof faultInjector !== 'function') {
      throw new ContractError('invalid_git_fault_injector', 'Git fault injector must be a function or null');
    }
    this.#runner = runner;
    this.#faultInjector = faultInjector;
    Object.freeze(this);
  }

  async #run(args, { input = null, env = {}, allow = [0] } = {}) {
    const result = await this.#runner({
      gitExecutable: this.gitExecutable,
      repositoryPath: this.repositoryPath,
      args,
      input,
      env,
    });
    if (!result || !Number.isInteger(result.code) || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
      throw new ContractError('invalid_git_runner_result', 'Git runner returned an invalid result');
    }
    if (!allow.includes(result.code)) throw gitFailure(args, result);
    return result;
  }

  async #fault(stage, details) {
    if (this.#faultInjector !== null) await this.#faultInjector(stage, freeze(details));
  }

  async #readRef(objectFormat) {
    const result = await this.#run(['rev-parse', '--verify', '--quiet', this.publicationRef], { allow: [0, 1] });
    if (result.code === 1) return null;
    const oid = result.stdout.toString('utf8').trim();
    return assertOid(oid, objectFormat, 'publication ref OID');
  }

  async #assertDirectRef() {
    const result = await this.#run(['symbolic-ref', '-q', this.publicationRef], { allow: [0, 1] });
    if (result.code === 0) {
      throw new ContractError('git_symbolic_publication_ref', 'D0011 refuses a symbolic publication ref');
    }
  }

  async #assertRefFormat() {
    await this.#run(['check-ref-format', this.publicationRef]);
  }

  async inspect() {
    const formatResult = await this.#run(['rev-parse', '--show-object-format']);
    const objectFormat = formatResult.stdout.toString('utf8').trim();
    const length = oidLength(objectFormat);
    await this.#assertRefFormat();
    await this.#assertDirectRef();
    const currentRefOid = await this.#readRef(objectFormat);
    return resultRecord({
      schemaVersion: 1,
      profile: GIT_PROJECTION_PROFILE,
      objectFormat,
      oidLength: length,
      publicationRef: this.publicationRef,
      currentRefOid,
    });
  }

  async #assertCommit(oid) {
    const result = await this.#run(['cat-file', '-e', `${oid}^{commit}`], { allow: [0, 1, 128] });
    if (result.code !== 0) {
      throw new ContractError('invalid_git_predecessor', 'Expected Git predecessor must exist and be a commit', { oid });
    }
  }

  async #writeTree(node, objectFormat) {
    const records = [];
    for (const [name, content] of [...node.files.entries()].sort(([a], [b]) => compareText(a, b))) {
      const blob = await this.#run(['hash-object', '-w', '--stdin'], { input: Buffer.from(content, 'utf8') });
      const oid = assertOid(blob.stdout.toString('utf8').trim(), objectFormat, `blob ${name}`);
      records.push(`100644 blob ${oid}\t${name}\0`);
    }
    for (const [name, child] of [...node.directories.entries()].sort(([a], [b]) => compareText(a, b))) {
      const oid = await this.#writeTree(child, objectFormat);
      records.push(`040000 tree ${oid}\t${name}\0`);
    }
    const tree = await this.#run(['mktree', '-z'], { input: Buffer.from(records.join(''), 'utf8') });
    return assertOid(tree.stdout.toString('utf8').trim(), objectFormat, 'tree OID');
  }

  async #commitTree(treeOid, expectedRefOid, metadata, objectFormat) {
    const args = ['commit-tree', treeOid];
    if (expectedRefOid !== null) args.push('-p', expectedRefOid);
    const date = `@${metadata.timestampSeconds} ${metadata.timezoneOffset}`;
    const commit = await this.#run(args, {
      input: Buffer.from(metadata.message, 'utf8'),
      env: {
        GIT_AUTHOR_NAME: metadata.authorName,
        GIT_AUTHOR_EMAIL: metadata.authorEmail,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: metadata.authorName,
        GIT_COMMITTER_EMAIL: metadata.authorEmail,
        GIT_COMMITTER_DATE: date,
      },
    });
    return assertOid(commit.stdout.toString('utf8').trim(), objectFormat, 'commit OID');
  }

  async project({ semanticTree, expectedRefOid = null, commitMetadata }) {
    if (!(semanticTree instanceof SemanticRadixTree)) {
      throw new ContractError('invalid_git_semantic_tree', 'Git projection requires a SemanticRadixTree');
    }
    const semanticRoot = validateSemanticRoot(semanticTree.rootDescriptor);
    const inspected = await this.inspect();
    if (expectedRefOid !== null) {
      assertOid(expectedRefOid, inspected.objectFormat, 'expectedRefOid');
      await this.#assertCommit(expectedRefOid);
    }
    const metadata = normalizeCommitMetadata(commitMetadata);
    const materialized = semanticTree.materialize();
    const entries = Object.entries(materialized);
    if (entries.length !== semanticRoot.entryCount) {
      throw new ContractError('git_semantic_entry_count_mismatch', 'Semantic materialization count does not match its root descriptor');
    }
    const root = makeTreeNode();
    for (const [path, content] of entries) addTreeEntry(root, path, content);
    const treeOid = await this.#writeTree(root, inspected.objectFormat);
    const commitOid = await this.#commitTree(treeOid, expectedRefOid, metadata, inspected.objectFormat);
    const identity = candidateIdentity({
      schemaVersion: 1,
      profile: GIT_PROJECTION_PROFILE,
      semanticRootDigest: semanticRoot.rootDigest,
      objectFormat: inspected.objectFormat,
      publicationRef: this.publicationRef,
      expectedRefOid,
      treeOid,
      commitOid,
      commitMetadata: metadata,
    });
    return resultRecord({ ...identity, candidateDigest: typedDigest(GIT_PROJECTION_CANDIDATE_DOMAIN, identity) });
  }

  async #readCommit(commitOid, objectFormat) {
    const result = await this.#run(['cat-file', 'commit', commitOid], { allow: [0, 1, 128] });
    if (result.code !== 0) {
      throw new ContractError('git_projection_object_missing', 'Projection commit object is missing', { commitOid });
    }
    const raw = decodeUtf8(result.stdout, 'Git commit object');
    return { raw, ...parseCommitBinding(raw, objectFormat) };
  }

  async #materializeGitTree(treeOid, objectFormat, prefix = '', output = Object.create(null), visiting = new Set()) {
    assertOid(treeOid, objectFormat, 'tree OID');
    if (visiting.has(treeOid)) throw new ContractError('invalid_git_projection_tree', 'Git projection tree contains a cycle');
    visiting.add(treeOid);
    try {
      const listing = await this.#run(['ls-tree', '-z', treeOid], { allow: [0, 1, 128] });
      if (listing.code !== 0) throw new ContractError('git_projection_object_missing', 'Projection tree object is missing', { treeOid });
      let offset = 0;
      while (offset < listing.stdout.length) {
        const end = listing.stdout.indexOf(0, offset);
        if (end < 0) throw new ContractError('invalid_git_projection_tree', 'Git tree listing is not NUL terminated');
        const record = listing.stdout.subarray(offset, end);
        offset = end + 1;
        if (record.length === 0) continue;
        const tab = record.indexOf(9);
        if (tab < 0) throw new ContractError('invalid_git_projection_tree', 'Git tree entry is malformed');
        const header = record.subarray(0, tab).toString('ascii').split(' ');
        if (header.length !== 3) throw new ContractError('invalid_git_projection_tree', 'Git tree entry header is malformed');
        const [mode, type, oid] = header;
        assertOid(oid, objectFormat, 'Git tree entry OID');
        const name = decodeUtf8(record.subarray(tab + 1), 'Git tree entry name');
        if (name.length === 0 || name.includes('/') || name.includes('\0')) {
          throw new ContractError('invalid_git_projection_tree', 'Git tree entry name is invalid');
        }
        const path = prefix === '' ? name : `${prefix}/${name}`;
        if (mode === '040000' && type === 'tree') {
          await this.#materializeGitTree(oid, objectFormat, path, output, visiting);
          continue;
        }
        if (mode !== '100644' || type !== 'blob') {
          throw new ContractError('invalid_git_projection_mode', 'D0011 Git projection accepts only 100644 blobs and 040000 trees', { path, mode, type });
        }
        if (Object.hasOwn(output, path)) throw new ContractError('invalid_git_projection_tree', `Duplicate Git projection path ${path}`);
        const blob = await this.#run(['cat-file', 'blob', oid], { allow: [0, 1, 128] });
        if (blob.code !== 0) throw new ContractError('git_projection_object_missing', 'Projection blob object is missing', { path, oid });
        output[path] = decodeUtf8(blob.stdout, `Git blob ${path}`);
      }
      return output;
    } finally {
      visiting.delete(treeOid);
    }
  }

  async #assertSemanticBinding(treeOid, semanticRootDigest, objectFormat) {
    const materialized = await this.#materializeGitTree(treeOid, objectFormat);
    const rebuilt = buildSemanticTree(materialized);
    if (rebuilt.rootDescriptor.rootDigest !== semanticRootDigest) {
      throw new ContractError('git_projection_semantic_mismatch', 'Git tree does not reproduce the candidate semantic root', {
        expectedSemanticRootDigest: semanticRootDigest,
        observedSemanticRootDigest: rebuilt.rootDescriptor.rootDigest,
      });
    }
  }

  async #assertCandidateRepository(candidate) {
    const inspected = await this.inspect();
    if (inspected.objectFormat !== candidate.objectFormat || inspected.publicationRef !== candidate.publicationRef) {
      throw new ContractError('git_projection_repository_mismatch', 'Git projection candidate does not match this repository profile');
    }
    if (candidate.expectedRefOid !== null) await this.#assertCommit(candidate.expectedRefOid);
    await this.#assertSemanticBinding(candidate.treeOid, candidate.semanticRootDigest, candidate.objectFormat);
    const commit = await this.#readCommit(candidate.commitOid, candidate.objectFormat);
    const expected = expectedCommitBody(candidate.treeOid, candidate.expectedRefOid, candidate.commitMetadata);
    if (commit.raw !== expected) {
      throw new ContractError('git_projection_commit_mismatch', 'Candidate commit bytes do not match the bound projection inputs');
    }
    return inspected;
  }

  async #assertReceiptRepository(receipt) {
    const inspected = await this.inspect();
    if (inspected.objectFormat !== receipt.objectFormat || inspected.publicationRef !== receipt.publicationRef) {
      throw new ContractError('git_projection_repository_mismatch', 'Git publication receipt does not match this repository profile');
    }
    await this.#assertSemanticBinding(receipt.treeOid, receipt.semanticRootDigest, receipt.objectFormat);
    const commit = await this.#readCommit(receipt.commitOid, receipt.objectFormat);
    if (commit.treeOid !== receipt.treeOid || commit.parentOid !== receipt.predecessorOid) {
      throw new ContractError('git_projection_commit_mismatch', 'Publication receipt commit does not match its tree/predecessor binding');
    }
    return inspected;
  }

  async validateCandidate(rawCandidate) {
    const candidate = validateCandidate(rawCandidate);
    await this.#assertCandidateRepository(candidate);
    return candidate;
  }

  async reconcilePublication(rawCandidate) {
    const candidate = validateCandidate(rawCandidate);
    await this.#assertCandidateRepository(candidate);
    const observedRefOid = await this.#readRef(candidate.objectFormat);
    let status = 'conflict';
    if (observedRefOid === candidate.commitOid) status = 'applied';
    else if (observedRefOid === candidate.expectedRefOid) status = 'not_applied';
    else if (observedRefOid === null && candidate.expectedRefOid === null) status = 'not_applied';
    return resultRecord({ status, observedRefOid });
  }

  #receipt(candidate, outcome) {
    const identity = receiptIdentity({
      schemaVersion: 1,
      profile: GIT_PROJECTION_PROFILE,
      candidateDigest: candidate.candidateDigest,
      semanticRootDigest: candidate.semanticRootDigest,
      objectFormat: candidate.objectFormat,
      publicationRef: candidate.publicationRef,
      predecessorOid: candidate.expectedRefOid,
      treeOid: candidate.treeOid,
      commitOid: candidate.commitOid,
      outcome,
    });
    return resultRecord({ ...identity, receiptDigest: typedDigest(GIT_PUBLICATION_RECEIPT_DOMAIN, identity) });
  }

  async publish(rawCandidate) {
    const candidate = validateCandidate(rawCandidate);
    await this.#assertCandidateRepository(candidate);
    try {
      await this.#fault('before_ref_update', { candidateDigest: candidate.candidateDigest });
      await this.#run(candidate.expectedRefOid === null
        ? ['update-ref', candidate.publicationRef, candidate.commitOid, zeroOid(candidate.objectFormat)]
        : ['update-ref', candidate.publicationRef, candidate.commitOid, candidate.expectedRefOid]);
      await this.#fault('after_ref_update', { candidateDigest: candidate.candidateDigest });
      const reconciliation = await this.reconcilePublication(candidate);
      if (reconciliation.status !== 'applied') {
        throw new ContractError('git_publication_conflict', 'Git ref changed after publication update', reconciliation);
      }
      return this.#receipt(candidate, 'observed');
    } catch (error) {
      const reconciliation = await this.reconcilePublication(candidate);
      if (reconciliation.status === 'applied') return this.#receipt(candidate, 'reconciled');
      if (reconciliation.status === 'not_applied') {
        throw new ContractError('git_publication_not_applied', 'Git publication did not apply', reconciliation, { cause: error });
      }
      throw new ContractError('git_publication_conflict', 'Git publication lost the ref fence', reconciliation, { cause: error });
    }
  }

  async #rollbackBinding(input) {
    if (isPlainRecord(input) && Object.hasOwn(input, 'receiptDigest')) {
      const receipt = validateReceipt(input);
      await this.#assertReceiptRepository(receipt);
      return freeze({
        objectFormat: receipt.objectFormat,
        publicationRef: receipt.publicationRef,
        predecessorOid: receipt.predecessorOid,
        commitOid: receipt.commitOid,
      });
    }
    const candidate = validateCandidate(input);
    await this.#assertCandidateRepository(candidate);
    return freeze({
      objectFormat: candidate.objectFormat,
      publicationRef: candidate.publicationRef,
      predecessorOid: candidate.expectedRefOid,
      commitOid: candidate.commitOid,
    });
  }

  async #reconcileRollback(binding) {
    const observedRefOid = await this.#readRef(binding.objectFormat);
    let status = 'conflict';
    if (observedRefOid === binding.predecessorOid) status = 'applied';
    else if (observedRefOid === null && binding.predecessorOid === null) status = 'applied';
    else if (observedRefOid === binding.commitOid) status = 'not_applied';
    return resultRecord({ status, observedRefOid });
  }

  async rollback(receiptOrCandidate) {
    const binding = await this.#rollbackBinding(receiptOrCandidate);
    const inspected = await this.inspect();
    if (inspected.objectFormat !== binding.objectFormat || inspected.publicationRef !== binding.publicationRef) {
      throw new ContractError('git_projection_repository_mismatch', 'Rollback binding does not match this repository profile');
    }
    try {
      await this.#fault('before_ref_rollback', binding);
      if (binding.predecessorOid === null) {
        await this.#run(['update-ref', '-d', binding.publicationRef, binding.commitOid]);
      } else {
        await this.#run(['update-ref', binding.publicationRef, binding.predecessorOid, binding.commitOid]);
      }
      await this.#fault('after_ref_rollback', binding);
      const reconciliation = await this.#reconcileRollback(binding);
      if (reconciliation.status !== 'applied') {
        throw new ContractError('git_rollback_conflict', 'Git rollback lost the ref fence', reconciliation);
      }
      return resultRecord({ status: 'applied', observedRefOid: reconciliation.observedRefOid, outcome: 'observed' });
    } catch (error) {
      const reconciliation = await this.#reconcileRollback(binding);
      if (reconciliation.status === 'applied') {
        return resultRecord({ status: 'applied', observedRefOid: reconciliation.observedRefOid, outcome: 'reconciled' });
      }
      if (reconciliation.status === 'not_applied') {
        throw new ContractError('git_rollback_not_applied', 'Git rollback did not apply', reconciliation, { cause: error });
      }
      throw new ContractError('git_rollback_conflict', 'Git rollback lost the ref fence', reconciliation, { cause: error });
    }
  }
}
