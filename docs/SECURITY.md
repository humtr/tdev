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

The no-replace ImmutableJournal claim remains conditional on a compatible filesystem/runtime and an independently qualified publication backend. A backend that is denied, unsupported, mismatched, or unqualified on the actual writable Case filesystem fails closed; qualification from one runtime/filesystem profile never becomes a universal Android, F2FS, Linux, network-filesystem, object-store, or power-loss guarantee. Exact profile observations belong to D0030 evidence.

D0030 selects a package-owned fd-relative standalone helper rather than an in-process Node-API addon for the rename backend. JS opens the already-authoritative Case directory; the helper receives only that inherited directory fd and generated single-component contender/final basenames, rejects empty names, slash-containing names, `.` and `..`, and owns exactly one `renameat2(..., RENAME_NOREPLACE)` primitive. It must not receive an absolute Case path, invoke a shell, discover directories, access network/configuration/secrets, interpret semantic records, copy data, choose a fallback, or own cleanup/reconciliation authority. Stdout/stderr are diagnostics only; a dedicated begin/result fd is the semantic native-status channel. Comparator measurements and rejection evidence for alternative native integration routes belong to the D0030 Design/evidence record.

The helper executable is trusted deployment code, not a sandbox. Its identity must be package-owned and bound into the capability validity key; resolution through ambient `PATH`, runtime compilation/download, missing/mismatched binaries, or failed capability probes fail closed as `store_publication_unsupported`. Loss of helper status after the begin marker is not proof of failure: the parent must return `store_commit_ambiguous` and perform authoritative reread/reconciliation without blind retry. A preexisting destination—including an adversarial regular file, symlink, or directory—is never overwritten and is not trusted merely because the syscall reported conflict. Mixed hard-link/rename writers are permitted only on a validity key where both backends are independently qualified; otherwise deployment must be homogeneous or quiesced/fenced. Current source/profile status belongs to the maintained D0030 record and evidence.

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

Accepted D0020 places Agent route/connection generations, aggregate capacity, non-executable reservation/delivery admission, Agent-side dispatch authorization and accepted delivery evidence in one durable `AgentDeliveryAuthority` per stable Agent route. Therefore CaseDO eviction, constructor rerun or stub failure cannot itself claim that execution ownership was lost, advance a connection generation, authorize delivery or trigger semantic reopen. CaseDO contributes only the exact `grant_attempt_dispatch` receipt/Event that serializes cancellation against dispatch permission; that grant is neither authentication nor delivery ownership. The local Agent remains the owner of actual OS/Git/process effect truth. Corrupt, incompatible, unknown-placement or over-budget CaseDO state fails closed instead of being reconstructed from projections or allowed to cross into an external effect. Provider lifecycle/configuration capable of deleting, transferring or making the Case authority unreadable requires the deployment/security owner and independent production evidence; incompatible old/new schema writers are forbidden during rollout.

D0019 authorizes no existing-Case migration. New authority birth requires successful placement election plus the qualified `tdev.casedo.sqlite-authority.v1` profile and capacity budget. Any future move from a local owner to CaseDO requires a separately accepted cutover design that fences the old writer before destination activation and preserves receipts, in-flight ambiguity, restart and rollback semantics. A writable copied Case is not a backup authority.

## 14.2 D0020 Agent delivery trust boundary

D0020 identifiers and fences are authorization inputs, not bearer credentials. `agentId`, route generation, logical connection ID/epoch, physical socket-incarnation token, executor ID/epoch, reservation/delivery IDs, terminal replay fences, `dispatchGrantId`, dispatch ordinal and Attempt fence cannot authenticate a caller merely because they are known. Every externally reachable Agent connect/message/evidence/result path must authenticate the Agent principal first and bind that principal to the one supported stable Agent route/generation before consulting delivery state.

Before first connection admission, the deployment owner establishes one immutable `AgentRouteBinding` containing the stable `agentId`, a positive non-reused route generation and the exact deployment/environment/Worker/class/namespace/jurisdiction/Durable-Object identity. A competing writable binding conflicts and fails closed. D0020 does not authorize live route migration, storage recreation under a new writable identity or name-based re-election; those operations require their own fenced cutover contract.

`AgentDeliveryAuthority` is the sole durable accepter/writer of effective capacity and delivery dispositions. The local Agent/executor may report monotonic capacity/evidence revisions and physical start/cleanup/effect observations, but a stale route generation, superseded logical connection or physical socket incarnation, replaced executor, wrong Attempt fence, wrong delivery/grant/ordinal or cross-Agent identity cannot mutate accepted state. Exact replay of one lost connect response retains the logical connection receipt/epoch while durably replacing only the physical socket incarnation; a predecessor incarnation's close/message/error is stale. A real reconnect installs a new logical connection generation and an aggregate-capacity freshness barrier; delayed predecessor capacity or socket traffic cannot restore authority. Ordinary owner reconstruction of the same healthy logical connection does not synthesize a reconnect or reset fences.

The Case `grant_attempt_dispatch` receipt proves only that cancellation lost the Case serialization race for that exact immutable crossing. It does not authenticate the Agent, prove a physical send/start/effect, or authorize a different delivery/ordinal. `AgentDeliveryAuthority` must still validate the authenticated route and current connection/executor fences and commit a grant-bound Agent authorization before first send. Lost responses are reconciled through exact receipt/state reread; a new request identity, reconnect or timeout cannot create permission by itself.

Delivery evidence is untrusted until authenticated, bounded, identity-matched and monotonically assimilated. Contradictory cross-axis evidence is durably quarantined as conflict and blocks new executable crossing/replay while preserving already-started observation/control/cleanup; the Agent owner does not choose the semantic Task result. Historical `no_handle` may release capacity only when it positively proves the selected resource was never created; any post-creation failure retains the physical slot until positive `cleanup_complete`. Safe terminal-detail retirement preserves bounded replay identity/tombstone high-water until the reservation-generation floor plus replay grace can permanently fence ancient observations. None of those replay/fencing identifiers authenticates a caller or erases effect/result uncertainty, which remains subject to Case reconciliation.

Cross-Agent and cross-Case authority injection must fail before mutation: a principal bound to one stable Agent route cannot select another Agent route, Case placement, reservation, delivery or grant merely by supplying its identifiers. Provider secrets and Agent credentials stay outside Task input, Plan/result/evidence, Case receipts, delivery payloads and durable semantic records. Concrete credential enrollment, rotation and revocation remain downstream security/deployment work and must satisfy this boundary rather than weaken it.

## 14.3 D0027 installation, management and release-trust boundary

Accepted D0027 keeps one route-current security/admission owner: the existing per-route `AgentDeliveryAuthority`. Its non-secret D0027 substate owns the current `installationGeneration`, `credentialGeneration`, `packageActivationGeneration`, positive non-reused `trustPolicyGeneration` plus trust disposition, route lifecycle disposition plus positive non-reused `lifecycleGeneration`, route-scoped genesis state/high-water and stable management receipts. Local package/service files, credential possession, package bytes, timestamps and cached state are subordinate evidence only and cannot elect any of those facts current.

Agent management mutation is independently authenticated and domain-separated from D0020 data-plane authority. A data-plane Agent credential, D0020 route/delivery/grant/fence identifier, incumbent socket, local service possession or D0024 MCP user/client identity cannot by itself authorize `register`, replacement, credential rotation/revocation, package/trust mutation, product `stop`/`start`, uninstall or equivalent management transition. Exact stable-request replay returns the existing result; changed intent or predecessor conflicts, and bounded receipt GC must retain generation/request fences that make ancient input stale rather than creating new authority.

The concrete D0027 deployment realization preserves the existing `tdev.agent-management.v1` signature domain while separating management transaction identity from every product generation. Fresh mutation uses canonical route-generation-scoped `m2:<seq>` with a positive safe-integer sequence and one owner-local monotonic `managementRequestSequenceHighWater`; possession of an `m2` value is never authentication authority. The same independently authenticated request identity, operation, intent digest and original predecessor binding remain fixed through every internal multi-phase lifecycle step. Exact retained replay wins first, changed binding conflicts, a compacted/absent sequence at or below the durable high-water is permanently stale/non-creating, and a future gap is rejected. Receipt compaction or storage pressure may not erase or lower that replay floor.

A route intended for later authenticated management mutation must retain its private management capability for at least the lifetime of that route identity. Persisting only the public management identity while generating the private key as process-local non-emitted qualification material creates an unusable route; process exit, missing private bytes or a public key ID alone never authorizes key reconstruction, substitution, in-place rotation or management bypass. D0039 Revision 12 preserves such a lost-key qualification route as predecessor evidence and permits only a separately initialized fresh qualification route whose private management bytes are durably held by the deployment/operator plane and exposed to qualification code solely through an opaque `tdev.agent-management.v1` domain-limited signer. This custody realization adds no second route-current owner or generic signing authority.

`docs/SECURITY.md` owns the abstract management-proof, credential-lifecycle and release-trust/disposition policy. `docs/DEPLOYMENT.md` owns concrete credential/trust/package material provisioning and provider/operator wiring. Secret bytes never belong in `AgentDeliveryAuthority`, repository/evidence records, package manifests, Task/Plan/result state or model-visible context. Every non-replay trust mutation advances `trustPolicyGeneration`; rollback cannot restore an older trust generation. Active/retired/revoked trust meaning, package activation, connect/reattach, lifecycle activation and Agent dispatch must serialize against the same route-current owner so a losing transaction rereads and fails stale/conflicting rather than silently rebinding.

D0027 also closes the D0020 authorization-to-physical-send gap with one non-transferable one-shot first-emission admission/authorization-consumption fact at that same `AgentDeliveryAuthority`. It binds the exact current installation, credential, package activation/manifest, trust, lifecycle, connection/socket-incarnation, executor, delivery ordinal, Case grant and Agent authorization. If a relevant current-state fence wins first, predecessor authorization is permanently non-emitting. If first-emission admission wins first, at most one immediate physical-send initiation may consume it and the ordinal remains conservatively possible execution; the serialization/exclusion boundary cannot hand out a cached permit that is used after a later fence. Crash, response loss or ambiguous send after admission never yields another `maySend`, and a later fence cannot fabricate `positively_not_sent`, `not_started`, `no_handle` or capacity release.

Product `stop`/`start`/uninstall and other lifecycle mutations use positive non-reused `lifecycleGeneration` with exact predecessor/current tuple matching. Base `start` is restart-only from a completed restart-eligible `base_stop` drain; first installation activation is the distinct D0027 `initial_activate` transition after non-executable genesis staging. Physical quiescence remains positive evidence: timeout, disconnect, disappearance, reboot without the admitted proof scope, missing files or a security fence never proves cleanup. These accepted rules are Design authority only; actual credential mechanisms, package realization, provider wiring, Android/Termux behavior and deployed security remain separately qualified layers.

## 14.4 D0039 Revision-3 qualification trust and controller-fencing boundary

Accepted D0039@r3 keeps the existing D0027 product-security owner and adds a qualification trust boundary; it does not create another product authority. The exact `tdev.agent-bootstrap-trust-capsule.v2` digest, delivered through an authenticated operator channel independent of the release transport under test, is the sole product bootstrap trust anchor for Revision-3 Q4. The exact OS/executor/runtime profile is declared environmental TCB. Q4 authenticates the bytes actually executed — runtime, verifier, permitted builtin closure and admitted environment — rather than trusting an entry-file hash or candidate-generated digest.

Terminal D0039 evidence is authenticated by the gate-specific independent principals and identity epochs selected by the Design. A candidate, adapter, driver or evidence producer cannot self-authenticate its own observation, and fencing identities such as run IDs, generations, claims, route IDs or deployment digests are not credentials. State-changing qualification RPC authentication and the mutation-bound S/A/V/R deployment-identity fence are separate checks. A deployment-identity mismatch is classified as zero product effect only when the mismatch is positively rejected before every product mutation on that request.

The qualification run journal and resource-claim ledger are coordination fences only. They cannot authenticate a management principal, sign or authorize D0027 mutation, elect route-current state, repair product state, revoke product credentials or become a fallback authority. Exactly one qualification mutation controller owns a live mutation lane. Lease timeout/expiry, disconnect, process disappearance, failed CAS, a new request identity or a higher run/claim generation does **not** prove the predecessor unable to act. A successor may perform external/product/provider/device effects, cleanup, claim release or resource reuse only after the QUALIFICATION-owned protocol durably records positive predecessor exclusion/quiescence for the exact prior run and resource scope. If exclusion cannot be proven, the lane remains blocked.

Corrupt or lost qualification coordination state fails closed for the affected lane and does not authorize recreation or takeover. If safe recovery requires an independently durable/public effect-admission authority, a second route-current registry, a new credential/trust owner or another independently decidable security/cutover authority, implementation must return through `SDD.md` for a new Design.

## 14.5 D0039 Revision-4 workers.dev ingress trust boundary

D0039@r4 preserves the Revision-3 trust/controller boundary while replacing only the unavailable Zone-route ingress identity for the isolated non-production qualification substrate. R is one exact `workers.dev` production hostname derived from fresh account-subdomain readback plus the exact Worker service name. It is a provider locator, never a credential, signer, product-current owner, recovery authority or evidence authenticator.

Before qualification authority is sent to the route owner, provider readback must establish the account workers.dev subdomain, target Worker `enabled=true`, `previews_enabled=false`, and the exact origin `https://<worker>.<account-subdomain>.workers.dev`. Alternate origins, redirects, preview URLs, Zone routes and Custom Domains cannot substitute. The mutation fence uses `tdev.installable-agent-qualification-deployment.v2`; the authenticated qualification RPC remains v2 and identity mismatch still fails before product mutation.

Revision-4 provider IAM minimum authority is `Workers Scripts Write` on the exact account. Zone-route authority is not required or credited. A distinct IAM observer reads provider-token policy, but Cloudflare token policy does not prove management/release private-key custody or signer absence of provider privilege; terminal Q5 retains those independent separation proofs.

## 14.6 D0039 Revision-7 executed bootstrap closure

D0039@r7 makes the already-required Revision-3 Q4 executed-closure meaning exact. Terminal R7 Q4 accepts only canonical `tdev.agent-bootstrap-trust-capsule.v2` with one nested `tdev.agent-bootstrap-execution.v1` record binding complete runtime executable bytes, exact Android/arm64 execution identity, exact self-contained verifier bytes, sorted exact permitted `node:` builtin closure, `networkAllowed=false`, `environmentInheritance=false` and `workingDirectoryProfile=private-empty-v1`. The current verifier closure is limited to `node:crypto`, `node:fs`, `node:path` and `node:zlib`. Empty inheritance means exactly zero child environment variables, not a candidate-defined allowlist.

The capsule-v2 raw SHA-256 remains the sole product bootstrap trust anchor and must arrive through an authenticated operator channel independent of every release/candidate transport value. Capsule v1 is historical only and cannot be reinterpreted, migrated or downgraded into terminal R7 Q4. Changing runtime/verifier/builtin/platform/architecture/execution policy requires a new v2 capsule identity and new independently authenticated digest.

The OS/filesystem/process primitives and exact bootstrap executor are declared environmental TCB and are identified in terminal evidence. The executor must prove verified bytes equal executed bytes using a stable-handle/immutable-staging primitive; path check-then-exec is insufficient. It launches the authenticated runtime without inherited environment or ambient cwd, in a new private empty cwd, with no network/runtime download/compiler/package resolution/ambient repository imports or candidate-selected helper authority. Only the authenticated verifier running under that closure may make the capsule/release/archive/file decision; orchestration code and evidence producers cannot self-authenticate it.

## 15. Source-layer non-claims

A source-layer qualification does not by itself prove:

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

### D0039 Revision-6 route-bootstrap security boundary

The R6 route-bootstrap qualification target grants no product-current authority. The existing per-route D0020/D0027 `AgentDeliveryAuthority` remains the only owner that can elect CURRENT. Qualification may fence only an exact authenticated fresh-route genesis transaction from a positively observed UNREGISTERED predecessor; caller-invented CURRENT tuples/generations are forbidden. Ordinary management, credential, package, trust, replacement, uninstall and higher-route recovery operations require the latest admitted deployment, not the bootstrap target. Ambiguous bootstrap retains claims and blocks retry/takeover. Re-admission after Q7-Q9 identity changes is readback/evidence, not a second authority. Secret/private-key values remain excluded.

### D0039 Revision-8 route-bootstrap and evidence-verifier boundary

R8 permits a qualification pre-admission target only for the six bounded D0027 genesis operations. It requires an authoritative `UNREGISTERED` predecessor, null current tuple/digest, exact predecessor/high-water/readback digests and exact runtime/provider binding. A route-bootstrap target cannot authorize ordinary management, credential, package, trust, replacement, uninstall or recovery operations; those still require the latest admitted deployment identity. `AgentDeliveryAuthority` remains the sole route-current/effect authority.

The genesis-evidence envelope is `tdev.installable-agent-evidence-envelope.v1`. Its canonical context includes the route, evidence type/digest and the persisted release-root public key/ID; the verifier recomputes the ID and verifies Ed25519 under `tdev.installable-agent-evidence.v1`. Missing verifier configuration, missing release-root state, malformed context or signature failure denies the operation. The verifier is asynchronous and runs before CAS; no proof or private key is persisted as a new authority. The qualification source cannot satisfy the independent Q4 operator-channel trust anchor, and no source pass promotes deployed/provider/device/product evidence.

### D0039 Revision-9 pending-state security boundary

R9 adds no qualification-owned state machine. Its v2 route-bootstrap target is a readback projection of the D0027 authoritative `GENESIS_PENDING` identity and is valid only when a fresh route read proves null CURRENT state plus the exact pending digest, generation, management request, intent, original `UNREGISTERED` predecessor and pending readback digest. Qualification must not mint a candidate tuple, allocate a generation, assign a pending digest or elect CURRENT.

The phase-P operation set is limited to exact original `register_installable_agent` replay/reconciliation, genesis evidence, predecessor quiescence, initial activation and fail-genesis. Register replay requires the original management request/intent/predecessor and complete request digest; a changed or competing register is denied. All other stale, unrelated, failed, current-state or caller-invented identities fail before host dispatch. D0027 remains the sole state/effect authority and its own management-proof, readiness, replay and CAS predicates remain authoritative.

The owner-preserving phase-driver adapter is permitted to compose this boundary
only through injected opaque capabilities. Its signer callbacks receive public
key IDs, signature domains and canonical public records, and its RPC callback
is supplied by the authorized deployment/operator plane. It cannot inspect or
persist private-key/token bytes, mint pending/current identity, authenticate a
provider, elect route state, retry an ambiguous effect or take over recovery.
Adding a signer-custody owner, trust registry, route authority or durable effect
authority remains an SDD/new-Design decision rather than an adapter change.
The optional qualification transport helper is likewise endpoint-bound: it
accepts only the R9 operation set, obtains the qualification token through an
injected secret-preserving provider, sends it only to the exact workers.dev
origin, and never exposes the token or retries an effect.

### D0039 Revision-10 owner-corrected evidence and qualification boundary

R10 preserves the D0027 route-current owner, R7 executed-bootstrap closure, R8 pre-CURRENT admission and R9 pending-continuation/replay semantics, but corrects two ownership expansions from the qualification path.

First, genesis evidence remains untrusted until an injected asynchronous verifier positively authenticates the exact canonical D0027 route/pending/evidence context before CAS. Missing verifier configuration, missing proof, malformed proof, context mismatch or authentication failure denies the mutation with zero durable effect. D0039 no longer defines the route-persisted **offline release-root private key** as the universal live signer for those evidence records. The release root retains its release-trust role of signing delegation; delegated release signers retain their release-statement role. A concrete genesis-evidence proof mechanism must be authorized by the responsible SECURITY/DEPLOYMENT owner and must not let an evidence producer self-authenticate, leak private bytes, or acquire management/provider/route authority by implication. A new signer-custody owner, trust registry or effect-admission authority requires a separate Class-2 decision.

Second, qualification run/store/claim/controller state and the R9 phase-driver/transport are non-product proof machinery. They cannot become authentication credentials, product readiness, route-current state, recovery authority or a generic durable mutation lane merely because historical D0039 revisions used them. `docs/QUALIFICATION.md` owns the method; D0037's `qualification/` boundary owns executable placement only. Existing historical bytes/evidence remain preserved and are not automatically migrated or promoted. If reusable durable qualification-control ownership is later required, return through `SDD.md` instead of re-expanding D0039.

### D0040 Revision-1 installable-Agent evidence-attestation boundary

D0040 resolves R10's deliberately unselected concrete evidence authenticator with one dedicated Ed25519 evidence-attestation identity. Its public-key identity domain is `tdev.installable-agent-evidence-attestor-public-key.v1`; signatures use `tdev.installable-agent-evidence-attestation.v1` over exactly the canonical receiver-constructed `tdev.installable-agent-evidence.v1` context. The strict public proof profile is `tdev.installable-agent-evidence-envelope.v2` with only `profile`, `keyId`, `context` and `signature`. Historical release-root-signed v1 envelopes are not aliases or migration input for v2.

This attestor is a separate least-privilege role. Management, offline release-root, delegated release-signer, Agent RSA credential, Q4 operator-anchor and provider/IAM/qualification credentials do not inherit evidence-attestation authority and cannot substitute merely because their signing/authentication capability is available. The attestor likewise gains no management, release, provider-deploy, route-current, recovery, Agent-possession or Q4-anchor authority. Its private bytes remain in a dedicated secret-preserving deployment/operator capability and never enter Worker/DO or Agent durable state, repository/evidence, Task/Plan/result data, logs, command lines or model-visible context.

The signing boundary is not a generic oracle. A caller-selected evidence digest alone cannot obtain a signature. The responsible evidence-specific owner must first establish the observation through its authoritative reader/method; the D0040 producer authenticates that admitted observation and binds the exact D0027 context. Evidence type semantics, sufficiency, D0027 readiness/state/CAS and D0039 Q sequencing remain with their existing owners.

The verifier public identity is deployment/runtime configuration, not D0027 route-current state. Missing/wrong identity, malformed profile, key mismatch, context/type substitution or invalid signature denies before CAS with zero product mutation. Key rotation changes deployment configuration identity and requires fresh provider/runtime admission; it does not add a D0027 trust generation, rewrite accepted readiness or create a second route-current owner. D0040 never substitutes for the independent Q4 capsule-v2 operator anchor.

### D0041 Revision-1 pre-genesis material-binding boundary

D0041 adds no credential, route, generation or release authority. Its `tdev.agent-credential-provisioning.v1` record is a non-authoritative projection of one exact `UNREGISTERED` D0027 predecessor: the canonical `m2` management-request identity and next installation/credential generations are read as high-water plus one, the credential reference is the existing deterministic AndroidKeyStore alias, and `cp1.<64hex>` is the SHA-256 identity of the exact typed preparation record. A changed predecessor invalidates the projection rather than reserving or advancing durable state.

The candidate RSA-3072 key remains private inside AndroidKeyStore and remains non-authoritative until D0027 commits the corresponding register CAS. Provisioning must reread the exact public verifier. A missing/ambiguous alias, verifier substitution, changed route predecessor, release-root change or trust-generation change fails closed into reconciliation; ambiguity does not authorize blind deletion because the candidate may already have been consumed by an unobserved authoritative transition.

Release trust is projected only from the existing route-scoped release root and normalized `tdev.release-delegation.v1` bytes. Every delegated signer key ID maps to its exact `active|retired|revoked` disposition in `trustSubjects`; the verified active signer of the exact release statement becomes `packageTrustSubjectDigest`; and the typed digest of the exact verified delegation becomes `trustStateDigest`. D0041 creates no second trust registry or signing role and gives the bounded preparer no D0027 dispatch capability.

### D0044 Revision-1 route-recovery and election boundary

One immutable offline Ed25519 route-recovery root authorizes D0044 genesis, explicit legacy import and strictly next-generation cutover. Its public identity uses `tdev.agent-route-recovery-public-key.v1`. Management, release-root, delegated release, Agent HMAC/RSA, provider, D0040 and qualification credentials neither substitute for nor inherit this authority. Private recovery bytes remain outside the Agent, repository, package, Worker secrets, per-route state, evidence and model-visible inputs. Loss leaves the elected route usable but makes later cutover unavailable; compromise cannot rotate this root in place.

Every participating route binds an immutable `tdev.agent-route-election-attachment.v1`. A legacy generation-1 attachment requires both its still-healthy management authority and the recovery root over the exact import record. Elected ingress accepts only the generation in a positive `tdev.agent-route-election.v1` record before selecting a physical host. Missing/corrupt election state, PITR, same-name recreation, stale generation or provider possession never restores route authority. Cutover requires positive predecessor quiescence plus retirement, or both positive physical quiescence and provider exclusion for a lost owner; ambiguity produces an availability gap, never dual current writers or rollback.
