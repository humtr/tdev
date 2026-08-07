import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  compareText,
  createRecord,
  deepFreeze,
  exactKeys,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  claimLeaseToken,
  claimSetDigest,
  normalizeClaims,
} from './claims.mjs';

const CLAIM_LEDGER_SCHEMA_VERSION = 1;

function holderKey({ caseId, taskId, attemptId }) {
  return `${caseId}\0${taskId}\0${attemptId}`;
}

function ledgerSnapshotDigest(snapshotWithoutDigest) {
  return typedDigest('tdev.claim-ledger-snapshot.v1', snapshotWithoutDigest);
}

function normalizeHolder(input, optionalKeys = []) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_claim_holder', 'Claim holder must be a record');
  assertRecordShape(input, ['caseId', 'taskId', 'attemptId'], optionalKeys, 'claim holder');
  for (const field of ['caseId', 'taskId', 'attemptId']) assertIdentifier(input[field], `claim holder ${field}`);
  return {
    caseId: input.caseId,
    taskId: input.taskId,
    attemptId: input.attemptId,
  };
}

function publicLease(record) {
  return deepFreeze({
    token: record.token,
    generation: record.generation,
    caseId: record.caseId,
    taskId: record.taskId,
    attemptId: record.attemptId,
    claims: canonicalClone(record.claims),
    claimsDigest: record.claimsDigest,
  });
}


function claimIndexNode() {
  return {
    children: new Map(),
    exact: { read: new Set(), write: new Set(), execute: new Set() },
    prefix: { read: new Set(), write: new Set(), execute: new Set() },
  };
}

function indexedResource(resource) {
  const wildcard = resource.endsWith('/**');
  const exactResource = wildcard ? resource.slice(0, -3) : resource;
  const separator = exactResource.indexOf(':');
  return {
    wildcard,
    segments: [exactResource.slice(0, separator), ...exactResource.slice(separator + 1).split('/')],
  };
}

function conflictingModes(mode) {
  return mode === 'read' ? ['write', 'execute'] : ['read', 'write', 'execute'];
}

class ClaimOverlapIndex {
  constructor() {
    this.root = claimIndexNode();
  }

  add(token, claims) {
    for (const claim of claims) {
      const { wildcard, segments } = indexedResource(claim.resource);
      let node = this.root;
      for (const segment of segments) {
        let child = node.children.get(segment);
        if (!child) {
          child = claimIndexNode();
          node.children.set(segment, child);
        }
        node = child;
      }
      node[wildcard ? 'prefix' : 'exact'][claim.mode].add(token);
    }
  }

  remove(token, claims) {
    for (const claim of claims) {
      const { wildcard, segments } = indexedResource(claim.resource);
      let node = this.root;
      let missing = false;
      for (const segment of segments) {
        node = node.children.get(segment);
        if (!node) {
          missing = true;
          break;
        }
      }
      if (!missing) node[wildcard ? 'prefix' : 'exact'][claim.mode].delete(token);
    }
  }

  conflicts(claims) {
    const tokens = new Set();
    for (const claim of claims) this.#collectClaimConflicts(claim, tokens);
    return tokens;
  }

  #collectModes(bucket, mode, tokens) {
    for (const conflictingMode of conflictingModes(mode)) {
      for (const token of bucket[conflictingMode]) tokens.add(token);
    }
  }

  #collectSubtree(node, mode, tokens) {
    this.#collectModes(node.exact, mode, tokens);
    this.#collectModes(node.prefix, mode, tokens);
    for (const child of node.children.values()) this.#collectSubtree(child, mode, tokens);
  }

  #collectClaimConflicts(claim, tokens) {
    const { wildcard, segments } = indexedResource(claim.resource);
    let node = this.root;
    for (const segment of segments) {
      node = node.children.get(segment);
      if (!node) return;
      // A prefix claim at any ancestor overlaps the queried exact or subtree claim.
      this.#collectModes(node.prefix, claim.mode, tokens);
    }
    if (wildcard) {
      // A subtree claim overlaps exact and subtree claims rooted at or below its prefix.
      this.#collectSubtree(node, claim.mode, tokens);
    } else {
      this.#collectModes(node.exact, claim.mode, tokens);
    }
  }
}

function normalizeStoredLease(input, maxClaims) {
  if (!isPlainRecord(input)) throw new ContractError('invalid_claim_lease', 'Stored claim lease must be a record');
  exactKeys(input, [
    'token', 'generation', 'caseId', 'taskId', 'attemptId', 'claims', 'claimsDigest',
  ], 'claimLedger.lease');
  assertDigest(input.token, 'claim lease token');
  assertSafeInteger(input.generation, 'claim lease generation', { min: 1 });
  const holder = normalizeHolder(input, ['token', 'generation', 'claims', 'claimsDigest']);
  const claims = normalizeClaims(input.claims, { maxClaims });
  const claimsDigest = claimSetDigest(claims, { maxClaims });
  if (input.claimsDigest !== claimsDigest) {
    throw new ContractError('claim_lease_digest_mismatch', 'Stored claim lease claim digest is invalid');
  }
  const expectedToken = claimLeaseToken({
    generation: input.generation,
    ...holder,
    claimsDigest,
  });
  if (input.token !== expectedToken) {
    throw new ContractError('claim_lease_token_mismatch', 'Stored claim lease token is invalid');
  }
  return deepFreeze({
    token: input.token,
    generation: input.generation,
    ...holder,
    claims,
    claimsDigest,
  });
}

export class ClaimLedger {
  constructor(options = {}) {
    assertRecordShape(options, [], ['maxLeases', 'maxClaimsPerLease'], 'ClaimLedger options');
    const maxLeases = options.maxLeases ?? 100_000;
    const maxClaimsPerLease = options.maxClaimsPerLease ?? 128;
    assertSafeInteger(maxLeases, 'maxLeases', { min: 1 });
    assertSafeInteger(maxClaimsPerLease, 'maxClaimsPerLease', { min: 1 });
    this.maxLeases = maxLeases;
    this.maxClaimsPerLease = maxClaimsPerLease;
    this.generation = 0;
    this.revision = 0;
    this.leasesByToken = createRecord();
    this.tokenByHolder = createRecord();
    this.activeLeaseCount = 0;
    this.claimIndex = new ClaimOverlapIndex();
    this.waiters = new Set();
  }

  static restore(snapshot, options = {}) {
    assertRecordShape(options, [], ['maxLeases', 'maxClaimsPerLease'], 'ClaimLedger restore options');
    if (!isPlainRecord(snapshot)) throw new ContractError('invalid_claim_ledger_snapshot', 'Claim ledger snapshot must be a record');
    exactKeys(snapshot, ['schemaVersion', 'generation', 'revision', 'leases', 'snapshotDigest'], 'claimLedger.snapshot');
    if (snapshot.schemaVersion !== CLAIM_LEDGER_SCHEMA_VERSION) {
      throw new ContractError('claim_ledger_version_unsupported', `Unsupported ClaimLedger snapshot version ${String(snapshot.schemaVersion)}`);
    }
    const withoutDigest = canonicalClone(snapshot);
    delete withoutDigest.snapshotDigest;
    if (snapshot.snapshotDigest !== ledgerSnapshotDigest(withoutDigest)) {
      throw new ContractError('claim_ledger_snapshot_digest', 'ClaimLedger snapshot digest is invalid');
    }
    assertSafeInteger(snapshot.generation, 'claimLedger.generation', { min: 0 });
    assertSafeInteger(snapshot.revision, 'claimLedger.revision', { min: 0 });
    if (snapshot.revision < snapshot.generation) {
      throw new ContractError('claim_ledger_revision', 'ClaimLedger revision cannot be behind its generation');
    }
    if (!Array.isArray(snapshot.leases)) throw new ContractError('invalid_claim_ledger_snapshot', 'ClaimLedger leases must be an array');

    const ledger = new ClaimLedger(options);
    ledger.generation = snapshot.generation;
    ledger.revision = snapshot.revision;
    let highestGeneration = 0;
    let previousGeneration = 0;
    for (const item of snapshot.leases) {
      const lease = normalizeStoredLease(item, ledger.maxClaimsPerLease);
      if (lease.generation <= previousGeneration) {
        throw new ContractError('claim_ledger_order', 'Stored ClaimLedger leases must be strictly ordered by generation');
      }
      previousGeneration = lease.generation;
      if (Object.hasOwn(ledger.leasesByToken, lease.token)) {
        throw new ContractError('duplicate_claim_lease', `Duplicate lease token ${lease.token}`);
      }
      const key = holderKey(lease);
      if (Object.hasOwn(ledger.tokenByHolder, key)) {
        throw new ContractError('duplicate_claim_holder', 'A claim holder has multiple active leases');
      }
      const conflictingTokens = [...ledger.claimIndex.conflicts(lease.claims)];
      if (conflictingTokens.length > 0) {
        throw new ContractError('claim_ledger_conflict', 'Stored ClaimLedger contains conflicting active leases', {
          leftToken: conflictingTokens[0],
          rightToken: lease.token,
        });
      }
      ledger.leasesByToken[lease.token] = lease;
      ledger.tokenByHolder[key] = lease.token;
      ledger.activeLeaseCount += 1;
      ledger.claimIndex.add(lease.token, lease.claims);
      highestGeneration = Math.max(highestGeneration, lease.generation);
    }
    if (highestGeneration > ledger.generation) {
      throw new ContractError('claim_ledger_generation', 'ClaimLedger generation is behind an active lease');
    }
    if (ledger.activeLeaseCount > ledger.maxLeases) {
      throw new ContractError('claim_ledger_limit', 'ClaimLedger snapshot exceeds the configured lease limit');
    }
    return ledger;
  }

  tryAcquire(input) {
    const holder = normalizeHolder(input, ['claims']);
    const claims = normalizeClaims(input.claims ?? [], { maxClaims: this.maxClaimsPerLease });
    const claimsDigest = claimSetDigest(claims, { maxClaims: this.maxClaimsPerLease });
    const key = holderKey(holder);
    const existingToken = this.tokenByHolder[key];
    if (existingToken) {
      const existing = this.leasesByToken[existingToken];
      if (existing.claimsDigest !== claimsDigest) {
        throw new ContractError('claim_holder_conflict', 'The same holder attempted to acquire a different claim set');
      }
      return deepFreeze({
        acquired: true,
        deduplicated: true,
        revision: this.revision,
        lease: publicLease(existing),
      });
    }

    const conflicts = [...this.claimIndex.conflicts(claims)]
      .map((token) => this.leasesByToken[token])
      .filter(Boolean)
      .map((lease) => ({
        token: lease.token,
        generation: lease.generation,
        caseId: lease.caseId,
        taskId: lease.taskId,
        attemptId: lease.attemptId,
      }))
      .sort((left, right) =>
        compareText(left.caseId, right.caseId) ||
        compareText(left.taskId, right.taskId) ||
        compareText(left.attemptId, right.attemptId));
    if (conflicts.length > 0) {
      return deepFreeze({ acquired: false, revision: this.revision, conflicts });
    }
    if (this.activeLeaseCount >= this.maxLeases) {
      throw new ContractError('claim_ledger_limit', 'ClaimLedger active lease limit exceeded');
    }

    this.generation += 1;
    const token = claimLeaseToken({ generation: this.generation, ...holder, claimsDigest });
    const record = deepFreeze({
      token,
      generation: this.generation,
      ...holder,
      claims,
      claimsDigest,
    });
    this.leasesByToken[token] = record;
    this.tokenByHolder[key] = token;
    this.activeLeaseCount += 1;
    this.claimIndex.add(token, record.claims);
    this.#advanceRevision();
    return deepFreeze({
      acquired: true,
      deduplicated: false,
      revision: this.revision,
      lease: publicLease(record),
    });
  }

  validate(lease) {
    try {
      const normalized = normalizeStoredLease(lease, this.maxClaimsPerLease);
      const record = this.leasesByToken[normalized.token];
      if (!record) return false;
      return record.generation === normalized.generation &&
        record.caseId === normalized.caseId &&
        record.taskId === normalized.taskId &&
        record.attemptId === normalized.attemptId &&
        record.claimsDigest === normalized.claimsDigest;
    } catch {
      return false;
    }
  }

  release(leaseOrToken) {
    if (isPlainRecord(leaseOrToken)) {
      if (!this.validate(leaseOrToken)) return false;
    }
    const token = typeof leaseOrToken === 'string' ? leaseOrToken : leaseOrToken?.token;
    if (typeof token !== 'string') throw new ContractError('invalid_claim_lease', 'Claim lease token is required');
    const record = this.leasesByToken[token];
    if (!record) return false;
    this.claimIndex.remove(token, record.claims);
    delete this.leasesByToken[token];
    delete this.tokenByHolder[holderKey(record)];
    this.activeLeaseCount -= 1;
    this.#advanceRevision();
    return true;
  }

  activeLeases() {
    return Object.values(this.leasesByToken)
      .sort((left, right) => left.generation - right.generation)
      .map(publicLease);
  }

  waitForChange(observedRevision, options = {}) {
    assertRecordShape(options, [], ['signal'], 'ClaimLedger wait options');
    assertSafeInteger(observedRevision, 'observed claim ledger revision', { min: 0 });
    if (observedRevision > this.revision) {
      throw new ContractError('claim_ledger_revision_ahead', 'Observed ClaimLedger revision is ahead of the current revision');
    }
    if (this.revision !== observedRevision) return Promise.resolve(this.revision);
    if (options.signal?.aborted) {
      return Promise.reject(options.signal.reason ?? new ContractError('wait_aborted', 'Claim ledger wait aborted'));
    }
    return new Promise((resolve, reject) => {
      const waiter = { observedRevision, resolve, reject, signal: options.signal, onAbort: null };
      if (options.signal) {
        waiter.onAbort = () => {
          this.waiters.delete(waiter);
          reject(options.signal.reason ?? new ContractError('wait_aborted', 'Claim ledger wait aborted'));
        };
        options.signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.add(waiter);
    });
  }

  snapshot() {
    const leases = Object.values(this.leasesByToken)
      .sort((left, right) => left.generation - right.generation)
      .map((lease) => canonicalClone(lease));
    const base = {
      schemaVersion: CLAIM_LEDGER_SCHEMA_VERSION,
      generation: this.generation,
      revision: this.revision,
      leases,
    };
    return canonicalClone({ ...base, snapshotDigest: ledgerSnapshotDigest(base) });
  }

  #advanceRevision() {
    this.revision += 1;
    for (const waiter of [...this.waiters]) {
      if (waiter.observedRevision === this.revision) continue;
      this.waiters.delete(waiter);
      if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
      waiter.resolve(this.revision);
    }
  }
}
