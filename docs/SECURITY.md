# security and trust boundaries

> Normative owner for authority, untrusted data, fencing, path safety, persistence integrity, and explicit security non-claims.

## 1. Threat model for the source slice

The implementation treats the following as untrusted:

- Plan, Task input, Case contract, command envelopes, and reconciliation decisions;
- executor identities, capabilities, results, errors, and evidence;
- claim lease values supplied across a boundary;
- JSON bytes read from the local store;
- schema-v3 snapshot bytes, semantic object payloads, and transactional-head rows read from the local semantic SQLite store;
- Git tree/blob/commit bytes and the publication-ref value reread by D0011 from the selected local repository;
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

This prevents the source core from being used as an arbitrary Git metadata or filesystem traversal writer. D0011 is a separate post-Promotion adapter that projects only validated semantic paths as `100644` Git blobs/trees/commits and one fenced local branch ref; it does not apply an arbitrary index/worktree. A real Agent must still independently enforce an OS-level root and avoid unsafe symlink/filesystem behavior for general effects.

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

Component-level Case limits still do not imply universal fit under every configured durable-store bound. D0008 closes the unsafe admission gap by keeping the concrete store as capacity owner: every durable checkpoint candidate is checked against that store's exact materialized-snapshot capacity when exposed. External-effect work additionally fails closed before executor invocation when the store cannot prove capacity for the running and contract-bounded post-effect states. Result-only settlement may still discover an oversized successor after execution, but the previously durable running snapshot remains authoritative rather than committing a partial/oversized successor.

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

### 8.1 Semantic-v3 integrity

Schema v3 validates the compact snapshot digest, compact Plan binding, versioned root descriptors, every reachable typed semantic object and its canonical digest/shape, exact entry/byte totals, lifecycle linkage, and successful Promotion root identity. Missing objects, malformed radix edges, cycles, impossible totals, or digest mismatch fail closed. A cached compatibility materialization cannot hide those failures.

As with schema v2, these self-digests are integrity checks rather than hostile-storage authentication. An attacker able to rewrite the SQLite database and recompute all digests can forge a different internally consistent history unless an external trust mechanism protects the authority.
## 9. Local file-store boundary

Local adapters use mode `0600` temporary files and byte-for-byte canonical JSON reads. `FileSnapshotStore` and Design 0004 `JournalSnapshotStore` use same-directory rename and process-local per-Case serialization; multiple processes can race and those adapters remain single-process tools. Case IDs are restricted identifiers and cannot form path traversal names.

Design 0005 `ImmutableJournalSnapshotStore` does not promote its process-local mutex into cross-process authority. After an explicit cutover that quiesces legacy writers, independent v2 writers contend on one hard-link no-replace final slot per expected revision. Design 0007 does not weaken that integrity boundary: every load/CAS still strictly observes the committed namespace and rereads every retained authoritative byte; materialization reuse is allowed only when an exact current-byte fingerprint matches prior strict validation, and any mismatch forces complete replay. This is a local CAS/integrity property, not authentication, a kernel sandbox, a distributed lock, or a multi-host durability guarantee. Cross-process mixed legacy/new writers during cutover are unsupported.

D0008 brings the legacy `JournalSnapshotStore` committed namespace up to the existing fail-closed protocol: dot-temporary files remain non-authoritative; `delta-from-*` retains the explicit format-upgrade failure; an exact legacy `delta-<16 digits>.json` name on a non-regular entry fails `store_journal_file_type`; other non-temporary committed-looking `delta-*` names fail `store_journal_filename`. Immutable publication fault tests also distinguish pre-publication known failure from post-publication directory-sync ambiguity without weakening the no-replace hard-link CAS primitive.

The no-replace ImmutableJournal claim remains conditional on a compatible local filesystem and an independently qualified publication backend. On 2026-08-09 the connected tmcp/Termux environment denied hard-link creation on every writable mount probed, so that environment remains **not** qualified for the current production hard-link publication path. D0030 acceptance separately qualified same-directory `RENAME_NOREPLACE` on the exact connected Termux/Android/aarch64/F2FS acceptance profile and on an independent Debian/x86_64/ext4 plane without weakening the D0005 publication contract. This is profile-scoped deployment evidence, not a universal Android, F2FS, Linux, network-filesystem, or power-loss guarantee.

D0030 selects a package-owned fd-relative standalone helper rather than an in-process Node-API addon for the rename backend. JS opens the already-authoritative Case directory; the helper receives only that inherited directory fd and generated single-component contender/final basenames, rejects empty names, slash-containing names, `.` and `..`, and owns exactly one `renameat2(..., RENAME_NOREPLACE)` primitive. It must not receive an absolute Case path, invoke a shell, discover directories, access network/configuration/secrets, interpret semantic records, copy data, choose a fallback, or own cleanup/reconciliation authority. Stdout/stderr are diagnostics only; a dedicated begin/result fd is the semantic native-status channel. The measured Node-API comparator recovered normal errno results but a post-syscall abort killed the host Node process, so it is not the accepted route.

The helper executable is trusted deployment code, not a sandbox. Its identity must be package-owned and bound into the capability validity key; resolution through ambient `PATH`, runtime compilation/download, missing/mismatched binaries, or failed capability probes fail closed as `store_publication_unsupported`. Loss of helper status after the begin marker is not proof of failure: the parent must return `store_commit_ambiguous` and perform authoritative reread/reconciliation without blind retry. A preexisting destination—including an adversarial regular file, symlink, or directory—is never overwritten and is not trusted merely because the syscall reported conflict. Mixed hard-link/rename writers are permitted only on a validity key where both backends are independently qualified; otherwise deployment must be homogeneous or quiesced/fenced. The current `src/store.mjs` still uses hard-link publication until the separate post-acceptance production implementation Task.

### 9.1 Semantic SQLite authority boundary

`SemanticSqliteStore` is a trusted-local, single-transaction authority adapter, not a distributed lock or authentication service. Immutable objects and snapshots do not become current merely because their bytes exist; only the expected-predecessor Case head elects authority. Commit ambiguity is reconciled by rereading the durable head, never by assuming failure or replaying an external-effect callback.

Repair is content-only: it may restore bytes that reproduce an already named exact digest and may not move the head. Reference-aware GC is an explicit expected-state transaction over current heads plus pins. Digests do not authorize callers, and the SQLite profile adds no tenant isolation, secret protection, provider IAM, or hostile-storage authenticity.

### 9.2 Local Git projection boundary

`GitProjectionAdapter` assumes its configured local Git executable and repository path are trusted deployment inputs. It does not trust inherited `GIT_*` routing/configuration overrides: the runner strips them, reinstalls only bounded internal Git settings and explicit commit metadata, disables replacement refs, and disables repository hooks for its plumbing commands. The publication ref is restricted to a direct `refs/heads/...` ref and every forward/reverse mutation uses an exact old-OID fence.

Before publication, reconciliation, or rollback relies on candidate/receipt bindings only after rereading the repository: Git tree/blob bytes must rebuild the expected tdev semantic root and commit bytes must match the bound tree/parent/metadata as applicable. This prevents a recomputed typed digest from hiding a different local Git projection. Candidate/receipt digests remain integrity checks, not credentials or signatures.

The adapter does not authenticate a hostile repository owner, protect an object database from replacement, prove the Git executable itself is trustworthy, authorize a remote, enforce protected-branch policy, or supply signed commits/refs. Those remain separate from D0011 local projection.

### 9.3 Remote Git publication boundary

D0012 treats authentication as deployment-owned context rather than semantic data. `GitRemotePublicationAdapter` accepts no raw token/password/key parameter, forces non-interactive Git prompting off, strips inherited `GIT_*` routing overrides, disables hooks, rejects HTTP(S) push URLs containing embedded credentials/query data, and excludes the clear push target and Git stderr from canonical intents/receipts. An immutable digest binds the selected remote target so restart reconciliation cannot silently follow changed Git configuration.

Remote intent/receipt digests are integrity/fencing records, not authentication credentials or signatures. Exact predecessor leases and remote reread prevent a stale publisher from overwriting an observed third winner and prevent blind replay after uncertain transport outcomes. Provider rejection is not bypassed; a protected-branch rollback rejection that leaves the candidate current is safe `not_applied`.

The checked source tests plus GitHub push dry-run prove only the generic boundary and that the current deployment can negotiate authenticated push with interactive prompts disabled. They do not prove provider IAM correctness, protected-branch/ruleset semantics, secret rotation, signed refs/commits, hostile-provider authenticity, or actual D0012 provider-ref integration/restart behavior.

### 9.4 Repository context and model subprocess boundary

D0013 assumes the configured local Git executable/repository and local model subprocess executable are trusted deployment components; it is not a sandbox or hostile-code execution boundary. Repository context is read from one exact immutable commit through hardened read-only Git plumbing, not the mutable index/worktree, and inherited `GIT_*` routing cannot redirect that scan. Only regular UTF-8 text blobs within current tdev path/tree limits are admitted, and the complete path-to-text digest must equal the authoritative Attempt `baseDigest` before the subprocess starts.

Task input cannot choose the repository path, executable, argv, environment or working directory. The subprocess does not inherit caller environment by default, and raw stderr, deployment paths/environment and file contents are excluded from canonical observations/errors. Request-digest echoing prevents a stale/cross-Attempt response from being accepted at the transport boundary, while the returned result remains untrusted and must still pass existing result/Plan/fencing/Claim/Promotion validation.

The verified D0013 security boundary covers only trusted-local full-context transfer. It does not authorize sending repository contents to an external model provider, define credential/secret handling for such a provider, prove data-egress/redaction policy, hostile-model authenticity, provider billing/retry semantics or tokenizer/token accounting. Those require a separate Class 2 provider/security contract.

D0014's preparation reuse is a bounded in-memory derived optimization, not a new trust or authority boundary. Values are internally constructed only after exact commit/object-format/base-digest verification, are deeply frozen, are scoped to one normalized repository executor instance, and have no external publication or cache-injection API. A miss, eviction, restart or disabled cache rebuilds from authoritative inputs; malformed Git data, wrong base binding, producer failure or cancellation is not retained; an all-reader-cancelled pending entry is removed before producer abort so a fresh reader cannot inherit the doomed producer. POSIX model processes run in a separate process group, and cleanup begins on abort, timeout, output overflow and direct-child exit so descendants cannot retain inherited descriptors after the Attempt completes. Persistent cross-repository CAS permissions, poisoning, partial writes, GC and disk-pressure contracts remain intentionally absent because D0014 introduces no persistent CAS.

D0017 makes context-reference possession explicitly non-authoritative. Before receiver-local carrier bytes are accessed, the receiver recomputes an authorization-scope digest from the already-admitted `caseId`, `planDigest`, and `caseContractDigest` and requires it to match the logical reference. The logical product reference excludes raw repository/worktree/cache/store paths, representation locators, process identity and credentials. Wrong authorization fails closed as `context_reference_unauthorized`; stale, missing, corrupt and bound-violating references likewise terminate before model admission, without partial acceptance or silent full-inline fallback. The bounded packed/hybrid carrier exists only in executor memory as derived/rebuildable state and introduces no persistent/shared permission, poisoning, publication or GC surface. D0017 therefore narrows the trusted-local authorization/integrity boundary without claiming external-provider authentication or privacy qualification.

D0018 keeps this trusted-local boundary and selects no external provider. The accepted warm profile reuses only the trusted host's bounded immutable D0014 preparation; every model process/module/session boundary is fresh per Attempt. Tested same-process model reuse leaked cross-Case process state and is not qualified. This is a semantic-isolation claim for the bounded trusted-local profile, not physical memory zeroization, hostile-code sandboxing, tenant isolation or a provider confidentiality claim. Committed-Event wake callbacks and live-controller registries are transient liveness state and cannot authorize access, retry, acceptance or lifecycle transitions.

Full-context transfer remains a data-minimization gap because D0017 deliberately preserves the complete semantic repository context. Before any external provider is admitted, a separate contract must define minimum-necessary deterministic selection or an explicit full-context disclosure policy, auditability, redaction and secret handling, authentication, request/token limits, retry billing, hostile-provider assumptions, privacy, residency and data-egress policy. No D0014/D0017/D0018 local-runtime measurement is represented as provider token, billing, privacy or model-quality evidence.

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

## 14. Final-MVP security gates

The final MVP must close, with deployed evidence, the security boundaries that the local source deliberately leaves open: authenticated Case/Agent/MCP principals, tenant and Case authorization, minimum-necessary repository disclosure to any external model/provider, secret injection and rotation, Agent registration/revocation, provider/GitHub least privilege, replay/reconnect behavior, payload/rate/resource bounds, auditability, and migration/rollback of security configuration. Authentication, Task capability admission, Claims and fencing remain distinct checks; possession of a request/fence/lease identifier is never authentication. User-performed credential issuance or provider consent is permitted, but the required permission, verification and revocation procedure remains part of final-MVP acceptance.

## 14.1 D0019 CaseDO authority trust boundary

D0019 selects one **durably elected** SQLite-backed CaseDO as the host of the existing D0010/CaseEngine semantic authority for a Case placed on Cloudflare. The placement generation binds the Case to the exact deployment/environment/class/namespace/jurisdiction/Durable-Object identity; a competing tuple must fail closed. This does not make the Durable Object name, Worker route, in-memory instance, D1/R2 record or provider response an authorization credential or competing semantic owner.

Ingress authentication/tenant authorization remains a separate owner and must complete before command admission. Case routing input must agree with the elected placement generation and durable Case/profile/schema identity before mutation. Command/result payloads remain strictly parsed and bounded, and no Agent/Git/process/network call may run inside the authoritative Case transaction. A provider exception or response loss is not proof of command failure; reconciliation rereads the same durable authority under the original request identity and D0010 command digest.

Agent connection epoch/current connection/delivery/capacity/reconnect truth remains D0020 scope. Therefore CaseDO eviction, constructor rerun or stub failure cannot itself claim that execution ownership was lost or authorize semantic reopen. The local Agent remains the owner of actual OS/Git/process effect truth. Corrupt, incompatible, unknown-placement or over-budget CaseDO state fails closed instead of being reconstructed from projections or allowed to cross into an external effect. Provider lifecycle/configuration capable of deleting, transferring or making the Case authority unreadable requires the deployment/security owner and independent production evidence; incompatible old/new schema writers are forbidden during rollout.

D0019 authorizes no existing-Case migration. New authority birth requires successful placement election plus the qualified `tdev.casedo.sqlite-authority.v1` profile and capacity budget. Any future move from a local owner to CaseDO requires a separately accepted cutover design that fences the old writer before destination activation and preserves receipts, in-flight ambiguity, restart and rollback semantics. A writable copied Case is not a backup authority.

## 15. Current source non-claims

The current source gate does not prove:

- user or Agent authentication;
- tenant isolation;
- TLS or message signing;
- Cloudflare IAM/configuration correctness;
- secure Termux process sandboxing;
- symlink-safe filesystem application;
- provider-specific Git authorization/IAM correctness, protected-branch/ruleset behavior, or actual D0012 provider-ref integration qualification;
- Artifact malware scanning;
- hostile-storage authenticity;
- resistance to all resource exhaustion;
- production incident response or key rotation.
