# security and trust boundaries

> Normative owner for authority, untrusted data, fencing, path safety, persistence integrity, and explicit security non-claims.

## 1. Threat model for the source slice

The implementation treats the following as untrusted:

- Plan, Task input, Case contract, command envelopes, and reconciliation decisions;
- executor identities, capabilities, results, errors, and evidence;
- claim lease values supplied across a boundary;
- JSON bytes read from the local store;
- restored snapshot fields, indexes, accepted results, Events, and receipts;
- paths and file contents proposed by ChangeSets.

The source slice assumes the Node process and loaded code are trusted. It does not implement tenant authentication, secret storage, transport encryption, sandboxing, host isolation, or provider IAM.

## 2. Authority model

A Task is authorized only when every required capability appears in all three sets:

```text
immutable Case grant
current Workspace policy snapshot
observed executor capabilities
```

Wildcard capability support is normalized by policy. Missing capabilities produce deterministic `denied` state.

Claims do not grant permission. A caller with a valid claim lease but insufficient authority is denied. Conversely, authority without a compatible claim cannot bypass concurrency exclusion.

The current Workspace policy is part of the immutable normalized Case contract for this source slice. A production system that changes policy during a Case must define policy-version ownership and re-admission semantics in a new design.

## 3. Complete fencing

Result acceptance verifies:

- Case ID;
- Plan revision ID and digest;
- Task ID;
- Attempt ID;
- executor ID and epoch;
- Attempt fencing token;
- claim lease token, generation, normalized claim set, and claim-set digest when present;
- live claim-owner validation at Attempt start and first state-changing result commit.

A stale result cannot commit merely because its Attempt ID still exists. The lease token also binds the normalized claim-set digest, so a holder cannot replace its lease with a weaker scope. Releasing and reacquiring a target increments the claim generation and changes the token, permanently fencing the old holder.

A production transport must preserve these fields end to end. It must not project away epoch, lease generation, claim-set digest, or Plan digest.

## 4. Strict JSON and canonical data

`strictJsonParse` rejects:

- invalid UTF-8;
- duplicate object members;
- malformed syntax or trailing data;
- unpaired Unicode surrogates;
- non-integral JSON numbers or values outside the safe-integer range;
- excessive bytes, depth, tokens, object members, array items, string code points, number digits, or exponent magnitude.

Parsed dictionaries use null prototypes. Canonical encoding rejects custom prototypes, symbols, `undefined`, sparse arrays, cyclic values, and unsupported scalar types.

Duplicate-member rejection occurs before ordinary JavaScript object parsing, preventing ambiguous “first wins/last wins” security behavior.

The canonical format is intentionally narrower than full JSON/JCS because the control protocol does not need floating-point values. Interoperability code must not silently substitute a generic `JSON.stringify` digest.

## 5. Path and tree safety

Canonical-tree and ChangeSet paths must be normalized relative paths and obey the Case path policy. The default policy:

- requires NFC normalization;
- rejects absolute and non-normal paths;
- rejects `.`/`..`, empty segments, backslashes, NUL/control characters, and excessive byte length;
- denies `.git` and `.tdev` prefixes;
- rejects file/descendant collisions such as both `a` and `a/b`.

Work Tasks cannot claim `canonical:` resources. Result-only work cannot claim `remote:` resources. Only the internal Promotion Task may hold `write canonical:tree`.

This prevents the source core from being used as an arbitrary Git metadata or filesystem traversal writer. A real Agent must independently enforce an OS-level root and avoid following unsafe symlinks; that adapter is not present here.

## 6. Bounded data

The normalized Case contract caps, among other values:

- Tasks and dependencies;
- claims and Attempts;
- Plan and Task-input bytes;
- Events and receipts;
- paths, file bytes, tree entries, and tree bytes;
- ChangeSet writes and bytes;
- evidence/error bytes;
- Artifact references.

Validation and Artifact results are bounded by total canonical bytes, not only member counts. Internal canonical cloning is not accidentally limited by the external 8 MiB JSON-ingress default, but all domain containers retain their own explicit limits.

Limits reduce denial-of-service exposure; they do not replace process memory/cpu quotas in a provider runtime.

Known current gap: the component-level Case limits do not by themselves prove that every combination of individually valid Plan, result, Event, receipt, and tree data will fit the separately configured materialized snapshot limit of a durable store. Until D0008 freezes and implements an aggregate durable-admission rule, source validation must not be described as a proof that every contract-valid Case transition is durably persistable under every configured store bound.

## 7. Atomic rejection

Every direct `CaseEngine` mutation runs inside an in-memory rollback boundary. If validation, an Event bound, an invariant, or a later step fails, all mutable authoritative fields revert to their prior values.

Repository persistence is compare-and-swap. A losing write does not overwrite the winner. The repository does not automatically replay transaction callbacks because replay could duplicate an external effect.

## 8. Snapshot integrity

Schema v2 validates:

- exact top-level and nested shapes;
- whole-snapshot digest;
- normalized Case-contract digest;
- recompiled Plan digest and derived indexes;
- Event sequence, revision, previous hash, and event hash chain;
- Task/Attempt linkage and legal states;
- accepted result normalization and digest;
- complete deterministic `blockedBy` evidence and restored resource limits;
- mutation receipt/commit-Event correspondence;
- canonical-tree digest;
- deterministic Promotion recomputation for succeeded Cases.

This detects accidental corruption and coherent-state inconsistencies, including an attacker who changes a nested value but forgets dependent semantics.

It is **not authenticity**. A party able to rewrite the complete snapshot, recompute every derived value, and replace the trusted store can produce a different internally consistent record. Use provider access control and trusted storage; add an externally protected MAC/signature when the storage layer itself is adversarial.

## 9. Local file-store boundary

Local adapters use mode `0600` temporary files and byte-for-byte canonical JSON reads. `FileSnapshotStore` and Design 0004 `JournalSnapshotStore` use same-directory rename and process-local per-Case serialization; multiple processes can race and those adapters remain single-process tools. Case IDs are restricted identifiers and cannot form path traversal names.

Design 0005 `ImmutableJournalSnapshotStore` does not promote its process-local mutex into cross-process authority. After an explicit cutover that quiesces legacy writers, independent v2 writers contend on one hard-link no-replace final slot per expected revision. Design 0007 does not weaken that integrity boundary: every load/CAS still strictly observes the committed namespace and rereads every retained authoritative byte; materialization reuse is allowed only when an exact current-byte fingerprint matches prior strict validation, and any mismatch forces complete replay. This is a local CAS/integrity property, not authentication, a kernel sandbox, a distributed lock, or a multi-host durability guarantee. Cross-process mixed legacy/new writers during cutover are unsupported.

Known current gap: the legacy `JournalSnapshotStore` validates recognized legacy record contents and rejects an immutable `delta-from-*` namespace, but its enumeration filters to regular files with exactly matching legacy delta names. It does not yet reject every malformed committed-looking legacy `delta-*` name or every recognized-name non-regular entry. The protocol's fail-closed rule remains the target; D0008 requires the implementation and focused security tests to rise to that boundary rather than weakening the rule.

## 10. External effects

Exactly-once execution is not promised. Safe handling is limited to:

- result-only computation with no external side effect;
- idempotent operation under the stable Task effect key;
- authoritative reconciliation before retry.

An effect receipt proves only that the configured adapter returned evidence matching the operation/effect key. The core does not independently contact the external provider. Trust in receipt contents depends on executor/Agent authentication and provider evidence, which remain adapter responsibilities.

## 10.1 Derived performance state

Entry-level mutation undo metadata, validation frontiers, Task/dependency counters, CaseEngine ready/claim-holder indexes, Plan-derived topological order, ClaimLedger overlap indexes, runner ready candidates, and journal fingerprint/materialization metadata are non-authoritative acceleration state. They must be rebuildable from validated authoritative records, excluded from security/authorization decisions except as candidate narrowing, and checked by authoritative dependency/authority/fencing/CAS state before a state-changing commit. Journal cache reuse requires a cryptographic match over the exact re-read durable files; untrusted persisted bytes never inherit the trust of an earlier in-memory value.

## 11. ClaimLedger boundary

The ClaimLedger prevents conflicting active leases and fences generations. Lease tokens are deterministic fencing identities, not bearer secrets or authorization credentials. It is not:

- an authorization service;
- a Task scheduler;
- a durable distributed lock in its in-memory form;
- a proof that the physical target obeyed the claim;
- atomically coupled to a Case store in this source slice.

A provider owner must persist the lease ledger and validate current ownership where results commit. Lease expiry alone is insufficient because a paused old holder can resume; fencing generation is mandatory.

## 12. Cancellation and stale delivery

External-effect cancellation is intent until reconciliation. This prevents a caller from receiving a false “cancelled” result while a remote mutation actually completed.

A first state-changing result after terminal cancellation, wrong executor epoch, wrong fence, or released/replaced lease is rejected. An exact replay of an already accepted result is idempotently deduplicated after lease release because it cannot mutate state.

## 13. Secrets and personal data

No special secret type is implemented. Task input, evidence, receipts, snapshots, and file stores may persist their contents in cleartext. Do not place credentials or sensitive personal data in these fields without a separate encryption/redaction design.

## 14. Explicit non-claims

The source gate does not prove:

- user or Agent authentication;
- tenant isolation;
- TLS or message signing;
- Cloudflare IAM/configuration correctness;
- secure Termux process sandboxing;
- symlink-safe filesystem application;
- Git remote authorization or protected-branch behavior;
- Artifact malware scanning;
- hostile-storage authenticity;
- resistance to all resource exhaustion;
- production incident response or key rotation.
