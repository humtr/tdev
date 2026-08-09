import { spawn } from 'node:child_process';

import {
  ContractError,
  canonicalClone,
  deepFreeze,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import { GitProjectionAdapter } from './git-projection.mjs';

export const GIT_REMOTE_PUBLICATION_PROFILE = 'tdev.git.remote-existing-branch.v1';
export const GIT_REMOTE_IDENTITY_DOMAIN = 'tdev.git.remote-identity.v1';
export const GIT_REMOTE_PUBLICATION_INTENT_DOMAIN = 'tdev.git.remote-publication-intent.v1';
export const GIT_REMOTE_PUBLICATION_RECEIPT_DOMAIN = 'tdev.git.remote-publication-receipt.v1';

const OBJECT_FORMATS = Object.freeze({ sha1: 40, sha256: 64 });
const MAX_REMOTE_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_NAME_BYTES = 128;
const decoder = new TextDecoder('utf-8', { fatal: true });

function freeze(value) {
  return deepFreeze(canonicalClone(value));
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function normalizeRemoteName(value) {
  if (typeof value !== 'string'
    || value.length === 0
    || byteLength(value) > MAX_REMOTE_NAME_BYTES
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new ContractError('invalid_remote_git_name', 'Remote Git name must be a bounded simple Git remote name');
  }
  return value;
}

function normalizeGitExecutable(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_git_executable', 'Git executable must be a non-empty NUL-free string');
  }
  return value;
}

function oidLength(objectFormat) {
  const length = OBJECT_FORMATS[objectFormat];
  if (length === undefined) throw new ContractError('unsupported_git_object_format', `Unsupported Git object format: ${objectFormat}`);
  return length;
}

function assertOid(value, objectFormat, label) {
  const length = oidLength(objectFormat);
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/.test(value)) {
    throw new ContractError('invalid_git_oid', `${label} must be a lowercase ${objectFormat} Git OID`);
  }
  return value;
}

function assertTypedSha256(value, code, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError(code, `${label} must be a typed SHA-256 digest`);
  }
  return value;
}

function normalizePublicationRef(value) {
  if (typeof value !== 'string' || !value.startsWith('refs/heads/') || value.length <= 'refs/heads/'.length || value.includes('\0')) {
    throw new ContractError('invalid_remote_git_publication_ref', 'Remote publication ref must be a full refs/heads/... name');
  }
  return value;
}

function decodeUtf8(bytes, label) {
  try {
    return decoder.decode(bytes);
  } catch (cause) {
    throw new ContractError('invalid_remote_git_output', `${label} must be valid UTF-8`, {}, { cause });
  }
}

function assertSafePushUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.startsWith('-')) {
    throw new ContractError('invalid_remote_git_target', 'Remote Git push target is invalid');
  }
  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (cause) {
      throw new ContractError('invalid_remote_git_target', 'Remote HTTP(S) push URL is invalid', {}, { cause });
    }
    if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
      throw new ContractError('remote_git_embedded_credentials', 'D0012 refuses credentials or query data embedded in an HTTP(S) push URL');
    }
  }
  return value;
}

function remoteCommandFailure(args, result) {
  return new ContractError('remote_git_command_failed', `Remote Git command failed: ${args[0]}`, {
    operation: args[0],
    exitCode: result?.code ?? null,
    signal: result?.signal ?? null,
  });
}

export function runRemoteGitCommand({ gitExecutable = 'git', repositoryPath, args, input = null }) {
  const controlledEnv = Object.create(null);
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) controlledEnv[key] = value;
  }
  controlledEnv.GIT_TERMINAL_PROMPT = '0';

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
      if (kind === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > MAX_REMOTE_OUTPUT_BYTES || stderrBytes > MAX_REMOTE_OUTPUT_BYTES) {
        overflowed = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(chunk));
    };

    child.stdout.on('data', (chunk) => append(stdout, chunk, 'stdout'));
    child.stderr.on('data', (chunk) => append(stderr, chunk, 'stderr'));
    child.once('error', (cause) => reject(new ContractError('remote_git_process_failed', 'Failed to execute remote Git command', {}, { cause })));
    child.once('close', (code, signal) => {
      if (overflowed) {
        reject(new ContractError('remote_git_output_limit_exceeded', 'Remote Git command output exceeded the adapter limit'));
        return;
      }
      resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });

    if (input === null) child.stdin.end();
    else child.stdin.end(input);
  });
}

function intentIdentity(input) {
  return {
    schemaVersion: 1,
    profile: input.profile,
    candidateDigest: input.candidateDigest,
    semanticRootDigest: input.semanticRootDigest,
    objectFormat: input.objectFormat,
    remoteName: input.remoteName,
    remoteIdentityDigest: input.remoteIdentityDigest,
    publicationRef: input.publicationRef,
    predecessorOid: input.predecessorOid,
    commitOid: input.commitOid,
  };
}

function validateIntent(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_remote_git_intent', 'Remote Git publication intent must be an object');
  const expected = [...Object.keys(intentIdentity(input)), 'intentDigest'].sort().join('\0');
  if (Object.keys(input).sort().join('\0') !== expected) throw new ContractError('invalid_remote_git_intent', 'Remote Git publication intent has unexpected fields');
  if (input.schemaVersion !== 1 || input.profile !== GIT_REMOTE_PUBLICATION_PROFILE) throw new ContractError('invalid_remote_git_intent', 'Remote Git publication intent version/profile is unsupported');
  assertTypedSha256(input.candidateDigest, 'invalid_remote_git_intent', 'candidateDigest');
  assertTypedSha256(input.semanticRootDigest, 'invalid_remote_git_intent', 'semanticRootDigest');
  oidLength(input.objectFormat);
  normalizeRemoteName(input.remoteName);
  assertTypedSha256(input.remoteIdentityDigest, 'invalid_remote_git_intent', 'remoteIdentityDigest');
  normalizePublicationRef(input.publicationRef);
  assertOid(input.predecessorOid, input.objectFormat, 'predecessorOid');
  assertOid(input.commitOid, input.objectFormat, 'commitOid');
  assertTypedSha256(input.intentDigest, 'invalid_remote_git_intent', 'intentDigest');
  const identity = intentIdentity(input);
  if (typedDigest(GIT_REMOTE_PUBLICATION_INTENT_DOMAIN, identity) !== input.intentDigest) {
    throw new ContractError('remote_git_intent_digest_mismatch', 'Remote Git publication intent digest is invalid');
  }
  return freeze({ ...identity, intentDigest: input.intentDigest });
}

function receiptIdentity(input) {
  return {
    schemaVersion: 1,
    profile: input.profile,
    intentDigest: input.intentDigest,
    candidateDigest: input.candidateDigest,
    semanticRootDigest: input.semanticRootDigest,
    objectFormat: input.objectFormat,
    remoteName: input.remoteName,
    remoteIdentityDigest: input.remoteIdentityDigest,
    publicationRef: input.publicationRef,
    predecessorOid: input.predecessorOid,
    commitOid: input.commitOid,
    outcome: input.outcome,
  };
}

function validateReceipt(input) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_remote_git_receipt', 'Remote Git publication receipt must be an object');
  const expected = [...Object.keys(receiptIdentity(input)), 'receiptDigest'].sort().join('\0');
  if (Object.keys(input).sort().join('\0') !== expected) throw new ContractError('invalid_remote_git_receipt', 'Remote Git publication receipt has unexpected fields');
  if (input.schemaVersion !== 1 || input.profile !== GIT_REMOTE_PUBLICATION_PROFILE) throw new ContractError('invalid_remote_git_receipt', 'Remote Git publication receipt version/profile is unsupported');
  assertTypedSha256(input.intentDigest, 'invalid_remote_git_receipt', 'intentDigest');
  assertTypedSha256(input.candidateDigest, 'invalid_remote_git_receipt', 'candidateDigest');
  assertTypedSha256(input.semanticRootDigest, 'invalid_remote_git_receipt', 'semanticRootDigest');
  oidLength(input.objectFormat);
  normalizeRemoteName(input.remoteName);
  assertTypedSha256(input.remoteIdentityDigest, 'invalid_remote_git_receipt', 'remoteIdentityDigest');
  normalizePublicationRef(input.publicationRef);
  assertOid(input.predecessorOid, input.objectFormat, 'predecessorOid');
  assertOid(input.commitOid, input.objectFormat, 'commitOid');
  if (!['observed', 'reconciled'].includes(input.outcome)) throw new ContractError('invalid_remote_git_receipt', 'Remote Git receipt outcome is invalid');
  assertTypedSha256(input.receiptDigest, 'invalid_remote_git_receipt', 'receiptDigest');
  const identity = receiptIdentity(input);
  if (typedDigest(GIT_REMOTE_PUBLICATION_RECEIPT_DOMAIN, identity) !== input.receiptDigest) {
    throw new ContractError('remote_git_receipt_digest_mismatch', 'Remote Git publication receipt digest is invalid');
  }
  return freeze({ ...identity, receiptDigest: input.receiptDigest });
}

function assertIntentCandidate(intent, candidate) {
  const matches = intent.candidateDigest === candidate.candidateDigest
    && intent.semanticRootDigest === candidate.semanticRootDigest
    && intent.objectFormat === candidate.objectFormat
    && intent.publicationRef === candidate.publicationRef
    && intent.predecessorOid === candidate.expectedRefOid
    && intent.commitOid === candidate.commitOid;
  if (!matches) throw new ContractError('remote_git_intent_candidate_mismatch', 'Remote Git intent does not match the D0011 candidate');
}

function assertReceiptBinding(receipt, intent, candidate) {
  const matches = receipt.intentDigest === intent.intentDigest
    && receipt.candidateDigest === candidate.candidateDigest
    && receipt.semanticRootDigest === candidate.semanticRootDigest
    && receipt.objectFormat === candidate.objectFormat
    && receipt.remoteName === intent.remoteName
    && receipt.remoteIdentityDigest === intent.remoteIdentityDigest
    && receipt.publicationRef === candidate.publicationRef
    && receipt.predecessorOid === candidate.expectedRefOid
    && receipt.commitOid === candidate.commitOid;
  if (!matches) throw new ContractError('remote_git_receipt_binding_mismatch', 'Remote Git receipt does not match its intent/candidate');
}

export class GitRemotePublicationAdapter {
  #runner;
  #faultInjector;

  constructor({ projectionAdapter, remoteName, gitExecutable = 'git', runner = runRemoteGitCommand, faultInjector = null }) {
    if (!(projectionAdapter instanceof GitProjectionAdapter)) {
      throw new ContractError('invalid_git_projection_adapter', 'D0012 requires a GitProjectionAdapter');
    }
    if (typeof runner !== 'function') throw new ContractError('invalid_remote_git_runner', 'Remote Git runner must be a function');
    if (faultInjector !== null && typeof faultInjector !== 'function') throw new ContractError('invalid_remote_git_fault_injector', 'Remote Git fault injector must be a function or null');
    this.projectionAdapter = projectionAdapter;
    this.remoteName = normalizeRemoteName(remoteName);
    this.gitExecutable = normalizeGitExecutable(gitExecutable);
    this.#runner = runner;
    this.#faultInjector = faultInjector;
    Object.freeze(this);
  }

  async #run(args, { allow = [0] } = {}) {
    const result = await this.#runner({
      gitExecutable: this.gitExecutable,
      repositoryPath: this.projectionAdapter.repositoryPath,
      args,
    });
    if (!result || !Number.isInteger(result.code) || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
      throw new ContractError('invalid_remote_git_runner_result', 'Remote Git runner returned an invalid result');
    }
    if (!allow.includes(result.code)) throw remoteCommandFailure(args, result);
    return result;
  }

  async #fault(stage, details) {
    if (this.#faultInjector !== null) await this.#faultInjector(stage, freeze(details));
  }

  async #target() {
    let result;
    try {
      result = await this.#run(['remote', 'get-url', '--push', '--all', this.remoteName]);
    } catch (cause) {
      throw new ContractError('remote_git_identity_unavailable', 'Remote Git push target cannot be resolved', { remoteName: this.remoteName }, { cause });
    }
    const lines = decodeUtf8(result.stdout, 'Remote Git push URL').split(/\r?\n/u).filter((line) => line.length > 0);
    if (lines.length !== 1) throw new ContractError('remote_git_ambiguous_push_target', 'D0012 requires exactly one effective push URL', { remoteName: this.remoteName, count: lines.length });
    const pushUrl = assertSafePushUrl(lines[0]);
    const identity = { schemaVersion: 1, remoteName: this.remoteName, pushUrl };
    return { pushUrl, remoteIdentityDigest: typedDigest(GIT_REMOTE_IDENTITY_DOMAIN, identity) };
  }

  async #readRemoteRef(target, objectFormat) {
    let result;
    try {
      result = await this.#run(['ls-remote', '--exit-code', '--refs', target.pushUrl, this.projectionAdapter.publicationRef], { allow: [0, 2] });
    } catch (cause) {
      throw new ContractError('remote_git_read_failed', 'Failed to read the remote publication ref', { remoteName: this.remoteName, publicationRef: this.projectionAdapter.publicationRef }, { cause });
    }
    if (result.code === 2) return null;
    const lines = decodeUtf8(result.stdout, 'Remote Git ref result').split(/\r?\n/u).filter(Boolean);
    if (lines.length !== 1) throw new ContractError('invalid_remote_git_ref_result', 'Remote Git ref query returned an unexpected number of records');
    const tab = lines[0].indexOf('\t');
    if (tab < 0 || lines[0].slice(tab + 1) !== this.projectionAdapter.publicationRef) {
      throw new ContractError('invalid_remote_git_ref_result', 'Remote Git ref query returned an unexpected ref');
    }
    return assertOid(lines[0].slice(0, tab), objectFormat, 'remote publication ref OID');
  }

  async #boundTarget(expectedDigest) {
    const target = await this.#target();
    if (expectedDigest !== undefined && target.remoteIdentityDigest !== expectedDigest) {
      throw new ContractError('remote_git_identity_mismatch', 'Remote Git push target changed after publication intent was bound', { remoteName: this.remoteName });
    }
    return target;
  }

  async #candidate(rawCandidate) {
    const candidate = await this.projectionAdapter.validateCandidate(rawCandidate);
    if (candidate.expectedRefOid === null) {
      throw new ContractError('remote_git_existing_branch_required', 'D0012 requires a non-null D0011 predecessor');
    }
    return candidate;
  }

  async #requireLocalApplied(candidate) {
    const local = await this.projectionAdapter.reconcilePublication(candidate);
    if (local.status !== 'applied') {
      throw new ContractError('remote_git_local_candidate_not_current', 'D0012 requires the D0011 local publication to have elected the candidate', local);
    }
  }

  #intent(candidate, remoteIdentityDigest) {
    const identity = intentIdentity({
      schemaVersion: 1,
      profile: GIT_REMOTE_PUBLICATION_PROFILE,
      candidateDigest: candidate.candidateDigest,
      semanticRootDigest: candidate.semanticRootDigest,
      objectFormat: candidate.objectFormat,
      remoteName: this.remoteName,
      remoteIdentityDigest,
      publicationRef: candidate.publicationRef,
      predecessorOid: candidate.expectedRefOid,
      commitOid: candidate.commitOid,
    });
    return freeze({ ...identity, intentDigest: typedDigest(GIT_REMOTE_PUBLICATION_INTENT_DOMAIN, identity) });
  }

  #receipt(intent, candidate, outcome) {
    const identity = receiptIdentity({
      schemaVersion: 1,
      profile: GIT_REMOTE_PUBLICATION_PROFILE,
      intentDigest: intent.intentDigest,
      candidateDigest: candidate.candidateDigest,
      semanticRootDigest: candidate.semanticRootDigest,
      objectFormat: candidate.objectFormat,
      remoteName: intent.remoteName,
      remoteIdentityDigest: intent.remoteIdentityDigest,
      publicationRef: candidate.publicationRef,
      predecessorOid: candidate.expectedRefOid,
      commitOid: candidate.commitOid,
      outcome,
    });
    return freeze({ ...identity, receiptDigest: typedDigest(GIT_REMOTE_PUBLICATION_RECEIPT_DOMAIN, identity) });
  }

  async preparePublication(rawCandidate) {
    const candidate = await this.#candidate(rawCandidate);
    await this.#requireLocalApplied(candidate);
    const target = await this.#boundTarget();
    const observed = await this.#readRemoteRef(target, candidate.objectFormat);
    const targetAfterRead = await this.#boundTarget(target.remoteIdentityDigest);
    if (targetAfterRead.pushUrl !== target.pushUrl) throw new ContractError('remote_git_identity_mismatch', 'Remote Git target changed during preparation');
    if (observed === null) throw new ContractError('remote_git_branch_absent', 'D0012 refuses to create a missing remote branch');
    if (observed !== candidate.expectedRefOid) {
      throw new ContractError('remote_git_publication_conflict', 'Remote Git predecessor does not match the candidate', { observedRefOid: observed });
    }
    return this.#intent(candidate, target.remoteIdentityDigest);
  }

  async #binding(rawIntent, rawCandidate) {
    const intent = validateIntent(rawIntent);
    const candidate = await this.#candidate(rawCandidate);
    if (intent.remoteName !== this.remoteName) throw new ContractError('remote_git_intent_adapter_mismatch', 'Remote Git intent belongs to another remote name');
    assertIntentCandidate(intent, candidate);
    return { intent, candidate };
  }

  async reconcilePublication(rawIntent, rawCandidate) {
    const { intent, candidate } = await this.#binding(rawIntent, rawCandidate);
    const target = await this.#boundTarget(intent.remoteIdentityDigest);
    const observedRefOid = await this.#readRemoteRef(target, candidate.objectFormat);
    let status = 'conflict';
    if (observedRefOid === candidate.commitOid) status = 'applied';
    else if (observedRefOid === candidate.expectedRefOid) status = 'not_applied';
    return freeze({ status, observedRefOid });
  }

  async #reconcileAttempt(intent, candidate, cause, operation) {
    let reconciliation;
    try {
      reconciliation = await this.reconcilePublication(intent, candidate);
    } catch (reconcileCause) {
      if (reconcileCause instanceof ContractError && reconcileCause.code === 'remote_git_identity_mismatch') throw reconcileCause;
      throw new ContractError(`remote_git_${operation}_ambiguous`, `Remote Git ${operation} outcome is ambiguous`, {}, { cause: reconcileCause });
    }
    if (reconciliation.status === 'applied') return reconciliation;
    if (reconciliation.status === 'not_applied') {
      throw new ContractError(`remote_git_${operation}_not_applied`, `Remote Git ${operation} did not apply`, reconciliation, { cause });
    }
    throw new ContractError(`remote_git_${operation}_conflict`, `Remote Git ${operation} lost the ref fence`, reconciliation, { cause });
  }

  async publish(rawIntent, rawCandidate) {
    const { intent, candidate } = await this.#binding(rawIntent, rawCandidate);
    await this.#requireLocalApplied(candidate);
    const target = await this.#boundTarget(intent.remoteIdentityDigest);
    const before = await this.#readRemoteRef(target, candidate.objectFormat);
    if (before === candidate.commitOid) return this.#receipt(intent, candidate, 'observed');
    if (before === null) throw new ContractError('remote_git_branch_absent', 'D0012 refuses to create a missing remote branch');
    if (before !== candidate.expectedRefOid) throw new ContractError('remote_git_publication_conflict', 'Remote Git predecessor changed before publication', { observedRefOid: before });

    try {
      await this.#fault('before_remote_push', { intentDigest: intent.intentDigest });
      const args = [
        'push', '--porcelain',
        `--force-with-lease=${candidate.publicationRef}:${candidate.expectedRefOid}`,
        target.pushUrl,
        `${candidate.commitOid}:${candidate.publicationRef}`,
      ];
      const pushed = await this.#run(args, { allow: [0, 1, 128] });
      if (pushed.code !== 0) throw remoteCommandFailure(args, pushed);
      await this.#fault('after_remote_push', { intentDigest: intent.intentDigest });
      const reconciliation = await this.reconcilePublication(intent, candidate);
      if (reconciliation.status !== 'applied') throw new ContractError('remote_git_publication_conflict', 'Remote Git ref changed after publication', reconciliation);
      return this.#receipt(intent, candidate, 'observed');
    } catch (cause) {
      const reconciliation = await this.#reconcileAttempt(intent, candidate, cause, 'publication');
      return this.#receipt(intent, candidate, 'reconciled');
    }
  }

  async #reconcileRollback(intent, candidate) {
    const target = await this.#boundTarget(intent.remoteIdentityDigest);
    const observedRefOid = await this.#readRemoteRef(target, candidate.objectFormat);
    let status = 'conflict';
    if (observedRefOid === candidate.expectedRefOid) status = 'applied';
    else if (observedRefOid === candidate.commitOid) status = 'not_applied';
    return { target, reconciliation: freeze({ status, observedRefOid }) };
  }

  async rollback(rawReceipt, rawIntent, rawCandidate) {
    const receipt = validateReceipt(rawReceipt);
    const { intent, candidate } = await this.#binding(rawIntent, rawCandidate);
    assertReceiptBinding(receipt, intent, candidate);
    const { target, reconciliation: before } = await this.#reconcileRollback(intent, candidate);
    if (before.status === 'applied') return freeze({ status: 'applied', observedRefOid: before.observedRefOid, outcome: 'observed' });
    if (before.status === 'conflict') throw new ContractError('remote_git_rollback_conflict', 'Remote Git rollback lost the ref fence', before);

    try {
      await this.#fault('before_remote_rollback', { receiptDigest: receipt.receiptDigest });
      const args = [
        'push', '--porcelain',
        `--force-with-lease=${candidate.publicationRef}:${candidate.commitOid}`,
        target.pushUrl,
        `${candidate.expectedRefOid}:${candidate.publicationRef}`,
      ];
      const pushed = await this.#run(args, { allow: [0, 1, 128] });
      if (pushed.code !== 0) throw remoteCommandFailure(args, pushed);
      await this.#fault('after_remote_rollback', { receiptDigest: receipt.receiptDigest });
      const after = await this.#reconcileRollback(intent, candidate);
      if (after.reconciliation.status !== 'applied') throw new ContractError('remote_git_rollback_conflict', 'Remote Git ref changed after rollback', after.reconciliation);
      return freeze({ status: 'applied', observedRefOid: after.reconciliation.observedRefOid, outcome: 'observed' });
    } catch (cause) {
      let after;
      try {
        after = await this.#reconcileRollback(intent, candidate);
      } catch (reconcileCause) {
        if (reconcileCause instanceof ContractError && reconcileCause.code === 'remote_git_identity_mismatch') throw reconcileCause;
        throw new ContractError('remote_git_rollback_ambiguous', 'Remote Git rollback outcome is ambiguous', {}, { cause: reconcileCause });
      }
      if (after.reconciliation.status === 'applied') return freeze({ status: 'applied', observedRefOid: after.reconciliation.observedRefOid, outcome: 'reconciled' });
      if (after.reconciliation.status === 'not_applied') throw new ContractError('remote_git_rollback_not_applied', 'Remote Git rollback did not apply', after.reconciliation, { cause });
      throw new ContractError('remote_git_rollback_conflict', 'Remote Git rollback lost the ref fence', after.reconciliation, { cause });
    }
  }
}
