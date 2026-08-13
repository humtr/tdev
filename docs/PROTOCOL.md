# state, identity, result, and persistence protocol

> Normative owner for state vocabulary, transitions, envelopes, receipts, snapshots, and reconciliation meaning.

## 1. Data model

All durable protocol values are canonical data:

- `null`, booleans, strings, safe integers, arrays, and plain records only;
- no floating-point fraction, unsafe integer, `undefined`, sparse array, symbol key, custom prototype, cycle, or unpaired surrogate;
- record keys ordered by stable JavaScript code-unit comparison for encoding;
- SHA-256 digests formatted as `sha256:<64 lowercase hex>`;
- important identities use domain-separated digests.

The implementation is a deliberately narrower safe-integer canonical JSON profile. It is inspired by deterministic JSON principles but does not claim byte-for-byte RFC 8785 compatibility for the full JCS number domain.

## 2. Stable identities

| Identity | Derivation or source |
| --- | --- |
| Case | caller-provided `caseId` |
| PlanRevision | caller `revisionId` plus domain-separated `planDigest` |
| Task | immutable `task.id` inside the Plan |
| Attempt | `<taskId>.<ordinal>` within a Case |
| Task effect key | digest of Case ID, Plan digest, and Task ID; stable across retries |
| Attempt fence | digest over complete Attempt/executor/lease identity |
| claim lease | holder plus normalized claim set/digest, monotonically increasing generation, and domain-separated token |
| result | canonical result kind plus canonical result digest |
| mutation command | domain-separated digest of canonical command |
| snapshot | domain-separated digest of the complete snapshot excluding `snapshotDigest` |
| v3 semantic root | `tdev.semantic.root.v1` digest over profile, node digest, entry count, and exact `treeBytes` byte-count value |
| v3 transactional head | `tdev.semantic.head.v1` digest over Case/epoch/generation/revision/snapshot/root/predecessor identity |
| D0011 Git projection candidate | `tdev.git.projection-candidate.v1` digest over semantic root, object format, local publication ref, predecessor, Git tree/commit OIDs, and explicit commit metadata |
| D0011 Git publication receipt | `tdev.git.publication-receipt.v1` digest over the candidate binding plus elected predecessor/tree/commit and observed-vs-reconciled outcome |

An Attempt fence binds:

```text
caseId
planDigest
taskId
attemptId
executorId
executorEpoch
claimLeaseToken or null
claimLeaseGeneration or null
claimLeaseClaimsDigest or null
```

A result that matches only `attemptId` is insufficient.

## 3. Case states

| State | Meaning |
| --- | --- |
| `active` | runnable/running graph work may exist |
| `reconciling` | at least one external-effect Attempt is uncertain or cancellation is unresolved |
| `succeeded` | Promotion succeeded and canonical replacement committed |
| `failed` | a Task failed/was denied, or the graph became terminally blocked |
| `cancelled` | cancellation terminally won and no stronger uncertainty exists |
| `unverified` | an external effect cannot be authoritatively classified |

Terminal Case states are `succeeded`, `failed`, `cancelled`, and `unverified`. A terminal Case is not silently reopened.

Case outcome precedence during reconciliation is:

```text
reconciling
  > active work
  > unverified
  > failed or denied
  > cancelled
  > blocked graph failure
  > succeeded Promotion
```

This prevents a dependency-derived `blocked` state from overwriting a more specific cancellation or uncertainty outcome.

## 4. Task states

| State | Meaning |
| --- | --- |
| `pending` | not running; may become ready and admissible |
| `running` | owns one nonterminal Attempt |
| `reconciling` | external-effect Attempt requires an authoritative decision |
| `succeeded` | exactly one accepted result identity exists |
| `failed` | terminal execution/result/reconciliation failure |
| `cancelled` | terminally cancelled |
| `denied` | authority intersection rejected admission |
| `unverified` | external effect remains unknowable |
| `blocked` | a dependency terminated without success |

Terminal Task states are `succeeded`, `failed`, `cancelled`, `denied`, `unverified`, and `blocked`.

Readiness is not a Task state. A Task is ready when it is `pending` and every declared dependency is `succeeded`.

## 5. Attempt states

| State | Meaning |
| --- | --- |
| `dispatch_pending` | admitted and ready for durable dispatch handoff |
| `queued` | acknowledged by a delivery queue but not yet running |
| `running` | executor may be applying work |
| `reconciling` | outcome/effect application is uncertain |
| `cancel_requested` | cancellation intent exists, but effect outcome is uncertain |
| `succeeded` | result accepted and digested |
| `failed` | terminal known failure |
| `cancelled` | terminal known cancellation |
| `interrupted` | Attempt ended without an accepted result; retry eligibility is Task/effect dependent |
| `rejected` | reserved terminal rejection state for a delivery/admission adapter |
| `unverified` | terminal uncertainty |

A Task may have many historical Attempts but at most one nonterminal Attempt. Attempt ordinals are monotonic within the Task.

Execution-state transitions are guarded. Nonterminal states may move through dispatch/queue/run/reconcile/cancel intent and then to a terminal state. A terminal Attempt is immutable except that an exact duplicate accepted result is recognized idempotently.

## 6. Error record

A normalized error is:

```json
{
  "code": "identifier",
  "message": "bounded scalar string",
  "certainty": "not_applied | unknown",
  "retryable": false
}
```

`certainty: not_applied` means the effect is known not to have occurred. `certainty: unknown` forbids inference that retry is safe. `retryable` is advisory inside the effect-class and Attempt-budget rules; it never overrides uncertainty.

## 7. Executor invocation

For a work Task, the runner calls the injected executor with:

```text
caseId
planRevisionId
planDigest
baseDigest
effectKey
fencingToken
claimLease
signal
task
attempt
acceptedResults of dependencies
```

The executor returns only the Task's declared isolated result. Promotion is internal and is never delegated to an external executor.

## 8. Result envelope

A result commit envelope has exactly:

```json
{
  "caseId": "...",
  "planRevisionId": "...",
  "planDigest": "sha256:...",
  "taskId": "...",
  "attemptId": "...",
  "executorId": "...",
  "executorEpoch": 1,
  "fencingToken": "sha256:...",
  "claimLeaseToken": null,
  "claimLeaseGeneration": null,
  "claimLeaseClaimsDigest": null,
  "result": {}
}
```

Acceptance validates all identity fields, the expected result kind, result-specific invariants, and the claim lease bound to the Attempt. The lease must still be current for the first state-changing commit. A stale epoch, Plan, Task, fence, lease generation, or claim-set digest fails without state change.

An exact duplicate normalized result for an already succeeded Attempt returns a deduplicated response even after its lease was released; this path performs no mutation. A different duplicate is a conflict.

## 9. Result variants

### ChangeSet

```json
{
  "kind": "changeset",
  "baseDigest": "sha256:...",
  "writes": [{ "path": "relative/path", "content": "text or null" }],
  "evidence": null
}
```

Writes are path-sorted. `null` deletes a path. The result is bound to the Plan base digest and cannot contain duplicate paths.

### Observation

```json
{
  "kind": "observation",
  "subject": "bounded subject",
  "value": {},
  "evidence": null
}
```

### Validation

```json
{
  "kind": "validation",
  "passed": true,
  "checks": [{ "id": "check-id", "passed": true, "message": null }],
  "evidence": null
}
```

Checks are ID-sorted and unique. `passed` must equal the conjunction of all checks. `requirePassed` converts a failed validation into a deterministic result rejection.

### ArtifactSet

```json
{
  "kind": "artifact-set",
  "artifacts": [
    {
      "id": "artifact-id",
      "digest": "sha256:...",
      "mediaType": "application/octet-stream",
      "size": 123,
      "locator": null
    }
  ],
  "evidence": null
}
```

The source slice stores only metadata references, not Artifact bytes.

### EffectReceipt

```json
{
  "kind": "effect-receipt",
  "effectKey": "sha256:...",
  "operation": "typed.operation",
  "outcome": "applied",
  "receipt": {},
  "evidence": null
}
```

The effect key and operation must exactly match the immutable Task execution contract.

## 10. Promotion result

Promotion returns:

```json
{
  "kind": "promotion",
  "baseDigest": "sha256:...",
  "accepted": [
    { "taskId": "...", "resultKind": "changeset", "resultDigest": "sha256:..." }
  ],
  "acceptedTaskIds": ["..."],
  "appliedTaskIds": ["..."],
  "tree": {},
  "treeDigest": "sha256:..."
}
```

`accepted` is sorted by Task ID. ChangeSet ownership is evaluated in that order; identical writes coalesce; differing writes to one path produce a stable conflict report. Candidate topology and all bounds are validated before the Case canonical tree changes. This object shape is the legacy/schema-v2 Promotion result. For an opt-in semantic-v3 Case, the accepted Promotion result preserves the same deterministic accepted/applied Task identity but replaces `tree`/`treeDigest` with the final semantic root descriptor; the complete final tree is not persisted in the accepted result.

## 11. Reconciliation protocol

A reconciling Attempt accepts one of:

| Decision | Required data | Result |
| --- | --- | --- |
| `succeeded` | validated Task result, optional evidence | normal result acceptance, then reconciliation evidence |
| `not_applied` | optional evidence | interrupted Attempt; pending/cancelled/failed according to intent and budget |
| `failed` | optional error/evidence/retry flag | pending only when retry is explicit and budget remains; otherwise failed |
| `cancelled` | optional evidence | cancelled |
| `unverified` | optional evidence/reason | terminal unverified |

For `succeeded`, result validation and fencing finish before reconciliation state is written. Thus an invalid claimed success cannot partially convert uncertainty into success.

## 12. Command protocol

A command envelope contains exact fields:

```json
{
  "requestId": "stable-request-id",
  "expectedCaseRevision": 12,
  "command": { "type": "..." }
}
```

Supported commands:

- `start_attempt`;
- `mark_attempt_queued`;
- `mark_attempt_running`;
- `mark_attempt_reconciling`;
- `accept_result`;
- `fail_attempt`;
- `cancel_task`;
- `deny_task`;
- `resolve_reconciliation`.

Unknown fields and unknown command types fail closed. Successful execution writes `command_committed` and a receipt in the same in-memory mutation boundary.

## 13. Event protocol

Each Event has a monotonic semantic sequence, Case revision, type, detail, previous event hash, and event hash. Event detail is canonical and bounded. Events contain no timestamp, executor duration, locale, or other nondeterministic semantic input.

A failed mutation restores Case state, revision, event sequence, events, canonical tree, Task states, Attempts, and receipts to the pre-call value.

## 14. Snapshot schema v2

The exact top-level shape is:

```text
schemaVersion
caseId
caseState
caseRevision
eventSequence
plan
caseContract
events
canonicalTree
canonicalDigest
taskStates
attempts
receipts
snapshotDigest
```

Restore does not trust stored derived fields. It recompiles Plan indexes, re-normalizes contracts and accepted results, verifies digest/linkage/state invariants, and recomputes successful Promotion.
Task-state counters, unsatisfied-dependency counters, ready/claim-holder sets, topological traversal order, validation frontiers, Claim overlap tries, runner candidates, and journal cache metadata are intentionally absent from the snapshot schema. They are rebuilt from authoritative records and cannot change the snapshot digest or legal transition result.

Schema v1 is accepted only through the deterministic migration path. Unknown future versions fail closed. No downgrade is implicit.

### 14.1 Materialized durable-admission protocol

Materialized-snapshot capacity belongs to the concrete SnapshotStore deployment, not to Plan, CaseContract, snapshot schema, or semantic digests. A store that exposes a capacity assertion evaluates the exact canonical materialized snapshot bytes, and `runDurableCase` invokes that assertion immediately before every durable CAS checkpoint.

For result-only work, executor execution may precede a later settlement-capacity rejection because no irreversible external effect is introduced by the executor contract. If that settlement checkpoint cannot fit, the already durable running predecessor remains authoritative and is the state observed on restart.

For external-effect work, dispatch is stricter: before mutating the real Case or invoking the executor, the durable runner must establish that the concrete store can fit the proposed running Attempt and every contract-bounded success/failure/reconciliation successor reachable without another external dispatch. Unknown capacity fails `store_capacity_unknown`; insufficient capacity fails `store_snapshot_too_large`. In either case the executor is not invoked and any newly acquired cross-Case Claim is released.

If in-memory settlement succeeds but its durable checkpoint throws, that in-memory successor is not authority and the Attempt lease is not released. A later owner loads the durable predecessor with `reopen:true`; any reopen/reconciliation revision is CAS-persisted before the engine is returned. A terminally recovered Attempt may then release its lease and retry when the existing effect-class/budget rules allow it. An Attempt reopened as `reconciling` retains the lease until a fenced reconciliation reaches a terminal state and that successor is durably checkpointed.

## 15. Immutable journal record protocol

Design 0005 adds an opt-in storage-record format without changing Case snapshot schema v2. The authoritative journal is `base.json` plus every reachable retained committed delta under strict semantic replay.

Legacy delta records use schema `1` and `delta-<toRevision>.json`. New immutable records use schema `2` and `delta-from-<fromRevision>.json`, and additionally bind `sourceSnapshotDigest` and `targetSnapshotDigest`. The v2 `deltaDigest` covers the complete canonical record except itself under domain `tdev.snapshot-journal-delta.v2`.

Revision continuity is predecessor continuity, not `+1`: a record must satisfy `fromRevision == current.caseRevision`, `toRevision > fromRevision`, `eventSequence == toRevision`, and the appended Event count must exactly bridge the revision difference. One repository CAS may therefore advance several semantic Event revisions.

Format migration is one-way inside one retained chain: zero or more legacy records may be followed by zero or more v2 records. The first v2 publication requires all legacy writer processes for the affected Case/directory to be quiesced; rolling cross-process legacy/new writers are unsupported because their distinct final-slot names cannot elect one cross-format winner. A legacy record after the first reachable v2 record, two records for the same predecessor, an unsupported schema, malformed committed filename, missing/gapped predecessor, or unreachable committed record fails closed. No precedence rule chooses between duplicate representations.

A v2 CAS winner is the writer that publishes the one immutable final slot for the expected revision without replacement. D0030 freezes that election as a backend-neutral publication protocol: write the complete canonical bytes to one unique same-directory regular contender, `fsync` the contender, perform exactly one atomic no-replace regular-file publication operation, then `fsync` the Case directory before reporting success. Temporary dot-files are non-authoritative. The existing hard-link primitive and the accepted same-directory `renameat2(..., RENAME_NOREPLACE)` primitive are equivalent only on deployment validity keys where the selected backend is independently qualified; there is no fallback to plain rename, copy, check-then-rename, direct-final creation, `O_TMPFILE`+link, or symlink publication.

For the accepted rename backend, the publication syscall is owned by a package-selected fd-relative standalone helper that receives only an inherited Case-directory fd and generated single-component contender/final basenames. A dedicated begin/result channel marks the boundary immediately before the syscall and returns a typed status plus native errno. Failure known before that begin marker is a no-successor failure. After the begin marker, timeout, kill, abnormal exit, missing/malformed result, result loss, or controller uncertainty is `store_commit_ambiguous`; a successful publication followed by failed/unknown Case-directory `fsync` is also `store_commit_ambiguous`. Reconciliation must reread authority and distinguish the predecessor, the complete intended successor, or an invalid/conflicting third state. Blind retry is forbidden.

Existing destination conflict never proves that the existing bytes are a valid winner; the committed slot must be reread and validated under the normal journal protocol. `store_publication_unsupported` is the fail-closed outcome for an explicitly selected but unqualified/missing/mismatched publication backend. Hard-link and rename writers may share one journal namespace only when both are independently qualified for the same deployment validity key; otherwise writers must be homogeneous or switch under quiescence/fencing. Backend choice changes no committed filename, canonical bytes, schema, replay, migration, or downgrade semantics.

This protocol does not authenticate against a writer that can replace the complete retained history and recompute all self-digests.

## 16. ClaimLedger protocol

The ledger snapshot contains schema version, monotonically increasing generation, revision, active leases ordered by generation, and snapshot digest.

A lease exposes the complete fencing record:

```text
token
generation
caseId
taskId
attemptId
claims
claimsDigest
```

The token is derived from generation, holder identity, and the normalized claim-set digest. Acquisition by the same holder and same claim set deduplicates; the same holder cannot substitute a weaker or different claim scope. Conflicting holders receive a deterministic conflict list. Release is identity-checked and idempotent. A replaced generation never becomes valid again.

## 17. Semantic authority v3 protocol

D0010 adds one opt-in profile, `tdev.semantic.path-byte-radix.v1`. Paths are the existing normalized relative NFC text paths encoded as UTF-8 bytes. Values bind normalized path plus UTF-8 text content. Radix edges are canonical non-empty byte strings in unsigned byte-lexicographic order, maximal single-child nonterminal runs are compressed, and a valid terminal file node has no descendants. Equal final trees produce equal roots independent of input, write, batch, or scheduling history.

A semantic root descriptor contains exactly `profile`, `nodeDigest | null`, `entryCount`, `treeBytes`, and `rootDigest`. `entryCount` and `treeBytes` are maintained incrementally under existing Case limits. `rootDigest` uses domain `tdev.semantic.root.v1`. Semantic values and radix nodes use distinct domains `tdev.semantic.value.v1` and `tdev.semantic.radix-node.v1`.

Schema v3 contains Case identity/state/revision/event sequence, a compact Plan binding, the Case contract, Events, `semanticAuthority`, Task states, Attempts, receipts, and `snapshotDigest`. `semanticAuthority` binds profile, authority epoch, optional v2 migration-source identity, base root, and canonical root. It contains no full `plan.baseTree`, `canonicalTree`, or successful Promotion full tree. Unknown versions fail closed; v1/v2 remain on their legacy restore path.

The local semantic store persists immutable typed objects and immutable v3 snapshots plus one mutable Case head. A head binds `caseId`, `authorityEpoch`, monotonically increasing `generation`, `caseRevision`, `snapshotDigest`, `baseRootDigest`, `canonicalRootDigest`, `previousHeadDigest | null`, and `headDigest`. One SQLite write transaction checks the expected predecessor, inserts immutable objects/snapshot, and updates the head. Same-digest/different-payload storage is corruption.

If a database commit outcome is unknown, the result is `store_commit_ambiguous`. Recovery reopens and compares the durable head with the intended successor and predecessor: successor means committed, predecessor means not committed, and any third head is a conflict/corruption requiring operator reconciliation. Blind retry is forbidden.

Forward migration is limited to a quiesced schema-v2 Case before successful Promotion whose canonical tree still equals the immutable Plan base. Legacy writers and live Claim ownership must be quiesced. The migrator captures and rechecks the source snapshot digest/revision immediately before first v3 head publication. There is no rolling mixed-writer mode. After any post-migration v3 head commits, automatic downgrade to a v2 writer is forbidden.

Reachable object corruption fails closed. Repair may insert only canonical content reproducing the exact already-authoritative expected digest and never moves the head. Reference-aware GC starts from all current heads plus explicit pins; apply requires an exact expected head/pin-set digest and deletes only unreachable immutable objects/snapshots.

## 18. Local Git projection and fenced-ref protocol

D0011 adds opt-in local projection profile `tdev.git.text-tree.v1`. It consumes a validated `SemanticRadixTree`; materializes the current normalized path/text map for this first correctness-oriented slice; writes exact UTF-8 Git blobs with mode `100644`; builds directory trees bottom-up; and creates a Git commit under explicit author/committer identity, timestamp/timezone, message, and optional exact predecessor commit. Git SHA-1 or SHA-256 object format is observed from the target repository and is part of projection identity. The tdev semantic root is unchanged.

A projection candidate contains exactly `schemaVersion`, `profile`, `semanticRootDigest`, `objectFormat`, `publicationRef`, `expectedRefOid | null`, `treeOid`, `commitOid`, `commitMetadata`, and `candidateDigest`. `publicationRef` is restricted to a direct full `refs/heads/...` ref. Before a state-changing ref operation, the adapter rereads the Git tree/blob graph, rebuilds the existing tdev semantic root, and verifies the raw commit bytes against the candidate tree, parent, and commit metadata. Recomputing a candidate digest cannot make a mismatched Git tree or commit authoritative.

Publication uses one expected-predecessor ref CAS. A non-null predecessor executes `update-ref <ref> <candidate> <predecessor>`; creation from absence uses the repository-format all-zero OID as the expected old value. Immutable candidate objects may exist without being elected. If publication response is lost or a ref update errors, durable reread classifies the ref as `applied` when it names the candidate, `not_applied` when it still names the predecessor or remains absent for a null predecessor, and `conflict` for any third OID. Blind replay is forbidden.

A successful publication receipt contains exactly `schemaVersion`, `profile`, `candidateDigest`, `semanticRootDigest`, `objectFormat`, `publicationRef`, `predecessorOid | null`, `treeOid`, `commitOid`, `outcome`, and `receiptDigest`; outcome is `observed` or `reconciled`. Rollback is another fenced ref mutation: candidate -> predecessor for an existing predecessor, or conditional ref deletion for a create-from-absence. A third/ref-newer OID fences stale rollback. Neither forward publication nor rollback changes semantic Case authority or deletes Git objects.

Candidate and receipt digests are integrity bindings, not authorization or hostile-repository authentication. D0011 scrubs inherited `GIT_*` process overrides, disables replacement refs and repository hooks for its plumbing, and supports bare repositories without index/worktree authority. Provider-specific authorization/protected-branch semantics, signing, multi-host ownership, provider transactions, and Git-object garbage collection remain outside this local protocol.

## 19. Authenticated remote Git publication protocol

D0012 adds profile `tdev.git.remote-existing-branch.v1` over a validated, locally elected D0011 candidate with a non-null predecessor. Remote identity uses domain `tdev.git.remote-identity.v1`; immutable publication intents use `tdev.git.remote-publication-intent.v1`; successful receipts use `tdev.git.remote-publication-receipt.v1`. The intent binds candidate/semantic identity, object format, remote name, a digest of the single effective push target, full branch ref, predecessor, and candidate commit without persisting a clear push URL or credential.

`preparePublication(candidate)` requires the local D0011 publication to be current and the existing remote branch to equal the exact candidate predecessor. `publish(intent, candidate)` revalidates those bindings immediately before mutation and performs one explicit expected-predecessor remote lease update. D0012 does not support missing-branch creation or branch deletion. Push exit status is not authority: remote reread classifies candidate as `applied`, predecessor as `not_applied`, any third OID as `conflict`, and an unreadable authoritative state as `ambiguous`; blind replay is forbidden.

`reconcilePublication(intent, candidate)` is restart-safe and read-only and refuses a changed remote-identity digest. A receipt binds the immutable intent plus candidate/root/remote/ref/predecessor/commit and an `observed | reconciled` outcome. Rollback is a separate exact candidate-to-predecessor lease; provider rejection that leaves the candidate current is safe `not_applied`, and an intervening OID fences stale rollback. D0012 does not bypass provider protection and does not make remote refs or Git OIDs tdev semantic authority.

The generic source protocol strips inherited `GIT_*` routing, disables interactive prompts and hooks, accepts no raw credential argument, and rejects HTTP(S) push URLs containing embedded credentials/query data. Authentication remains deployment-owned. The checked GitHub dry-run proves non-interactive authenticated push negotiation only; actual provider-ref integration, protected-branch behavior, provider-rule introspection, signing, and hostile-provider authentication remain separate qualification.

## 20. Repository-context and local model subprocess protocol

D0013 adds result-only work operation `tdev.model.repository` with repository profile `tdev.repository-context.git-full-text.v1` and model profile `tdev.model.subprocess-json.v1`. Task input is exactly `{ repositoryCommitOid, instruction }`; repository path, Git executable, subprocess executable/argv/environment/cwd and timeout are deployment configuration rather than Task/Case data.

For each Attempt, `GitRepositoryModelExecutor` observes repository object format, requires a full SHA-1/SHA-256 commit OID, reads the exact commit/tree/blobs without index or worktree authority, accepts only `100644`/`100755` regular blobs, validates paths/limits/fatal UTF-8, and rebuilds the existing tdev path-to-text digest. The observed digest must equal invocation `baseDigest` before subprocess admission. A context descriptor binds object format, commit/tree OIDs, semantic base digest, ordered file path/mode/blob OID/byte-length metadata, file count and content bytes; `contextDigest` uses domain `tdev.repository-context.git-full-text.v1`. File contents are transported in the request but are not duplicated inside the descriptor.

The subprocess request contains schema/profile, the repository descriptor and full supported file contents, plus Case ID, Plan revision/digest/base digest, effect key, fencing token, Claim lease, Task, Attempt and accepted results. `requestDigest` uses domain `tdev.model.repository-request.v1` over the request identity before the digest field is added. A successful subprocess must exit zero and emit one bounded strict JSON object with schema version 1, profile `tdev.model.subprocess-json.v1`, the exact echoed `requestDigest`, and `result`. The adapter returns only `result`; normal runner/engine result normalization, Plan/fencing/lease validation and Promotion remain authoritative.

There is no hidden transport retry. Repository observation, base mismatch, spawn/timeout/abort/non-zero exit, bounded-output failure, invalid UTF-8/JSON/response or request-digest mismatch yields no accepted result; the existing Task `retry.maxAttempts` budget owns any later Attempt. D0013 reconstructs the full context/process for every Attempt. D0014 may reuse only a previously verified immutable preparation under the exact executor-local key `(object format, commit OID, baseDigest)`; it still constructs and sends the complete canonical request and starts one process per Attempt. Same-key cold misses single-flight, different keys remain concurrent, producer failure is not retained, reader cancellation cannot poison other readers, and all-reader cancellation removes the doomed entry before aborting the Git producer so a fresh reader starts a replacement producer. Cache-disabled, cold-rebuild and cache-hit paths must generate identical request semantic content.

D0017 adds an internal selected-context delivery boundary before that unchanged subprocess request. The runner supplies the already-authoritative Case contract digest from `engine.caseContract.contractDigest`; together with admitted `caseId` and `planDigest` it forms `tdev.selected-context-reference-scope.v1`. `tdev.selected-context-reference.v1` binds exact immutable repository commit, semantic `baseDigest`, repository `contextDigest` and that scope digest; `attemptId` and all physical representation/locator/process/provider facts are excluded. The selected `tdev.context-pack.v1` receiver representation is bounded to 128 files / 2 MiB semantic / 3 MiB stored per pack, 512 KiB manifest and 790 packs, plus existing 4096-byte path, 2 MiB file, 100000-entry and 16 MiB semantic-tree limits. The receiver recomputes authorization before any carrier access; mismatched authority, expected base/context, missing material, corrupt binding/content, or exceeded limits map respectively to `context_reference_unauthorized`, `context_reference_stale`, `context_reference_missing`, `context_reference_corrupt`, and `context_reference_limit_exceeded`. Cancellation uses the existing AbortSignal/transport abort boundary and produces no accepted partial result. Successful resolution must reproduce the complete descriptor/files and their canonical bytes before the existing `tdev.model.repository-request.v1` subprocess request is admitted. The carrier is in-memory derived state, not a persisted/shared protocol owner, and there is no per-request fallback to inline on a typed reference failure.

Non-authoritative observations may record bounded context/request/response bytes, cache/materialization/Git work, selected-reference/pack counts and bytes, process starts/reuse and durations, but those values never participate in semantic/result identity. Observation exceptions and unresolved asynchronous observation promises cannot change or block transport completion. D0017 still implements no deterministic ContextSlice, persistent/shared CAS, locality scheduler or external provider/tokenizer contract.

D0018 accepts a separate transient live-runtime protocol without changing durable Attempt/result identity. A committed semantic Event may wake a runner only after the engine mutation has successfully committed; the runner must reread authoritative Attempt state and match `caseId + taskId + attemptId + fencingToken + executorId + executorEpoch` plus local controller object identity before abort/unregister. Rolled-back Events, observer delivery, process identity, host/cache warmth and worker generation are not authority. Checkpoint bookkeeping acknowledges only the exact persisted snapshot revision and drains a newer revision before dependent dispatch. Semantic terminality does not return runtime capacity until the predecessor execution handle/process cleanup and settlement boundary completes. The selected warm profile reuses only the bounded D0014 host preparation; it never reassigns a model process across Attempts. This protocol is accepted but not yet production-implemented at the current checkpoint.
