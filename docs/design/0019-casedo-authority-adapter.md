# Design 0019 — CaseDO Authority Adapter

- Status: `implementing`
- Revision: 2
- Revision predecessor: revision 1 acceptance is identified by `docs/evidence/group-f-d0019-casedo-authority-adapter-acceptance-2026-08-13.json`; revision 2 is identified by `docs/evidence/group-f-d0019-authority-amendment-2026-08-13.json`
- Revision 2 reason: adversarial re-review required durable cross-placement election, exact command-only receipt digest/replay ordering, ordinary reconstruction without implicit semantic reopen, explicit owner-loss recovery, and schema/capacity/rollout gates while preserving the same CaseDO authority-adapter problem and selected owner family
- Revision 2 downstream revalidation: production D0019 implementation/provider qualification must implement the amended boundaries; D0020 and D0030 remain separate; no previously verified Group E source meaning is reopened by this revision
- Class: 2
- Capability Groups: B/F — semantic authority / Cloudflare runtime authority
- Active cumulative lineage: `group/f-cloudflare-runtime`
- Acceptance starting authority: `group/f-cloudflare-runtime@a7199f7b1f21e0ddddce02ad8574b621c290d331`
- Retained completed predecessor: Group E `151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`
- Evidence Task: `task_6w6_c42c688364`
- Evidence worktree: `wt_eccba31ac43e5a20`
- Falsifier/evidence commit: `6c08082269c9dab6c17feccd2d90f4619c8a8577`
- Acceptance evidence: `docs/evidence/group-f-d0019-casedo-authority-adapter-acceptance-2026-08-13.json`
- Acceptance evidence SHA-256: `6e196ff1cae6c9ef993bcebf112405234fccc7c682a4563811c16ab2e41e7daa`
- Amendment/re-review Task: `task_71o_8f0c6154f2`
- Amendment worktree: `wt_4f877e54f9398fe0`
- Amendment base: `group/f-cloudflare-runtime@fbd2807cf72cf6d076687c8455bb569a99f03e91`
- Amendment evidence: `docs/evidence/group-f-d0019-authority-amendment-2026-08-13.json`
- Amendment evidence SHA-256: `79470299245e617147976b7f806c0e23dc78dfc2a47ca867cb80f984a73dd623`
- Production implementation Task: `task_7y8_8713101d9d`
- Production implementation worktree: `wt_6576e87729fafc50`
- Production implementation base: `group/f-cloudflare-runtime@c8dc8875b454d77c86928b3c1d4d2392be4644e4`
- Production implementation commits: `5280710309c3a4f4cfe0c33a52694ba0be544da8`, `20834157c0049bf6ef515885971adf7c57042f7e`, `26fe927af4e835ebcb1c06c8fcf3def2eb5c9587`
- Production implementation evidence: `docs/evidence/group-f-d0019-casedo-production-implementation-2026-08-15.json`
- Production implementation evidence SHA-256: `1bbb1939b263db4d2a2690fab604ccd87d38043c8ef1791326c2c02b383f6ea4`
- Inherited authority: D0010 semantic/current-state authority; D0018 runtime boundary remains closed; D0030 accepted publication portability remains separate
- Affected normative owners after acceptance: `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, `docs/design/README.md`
- `docs/SPEC.md`: unchanged; product scope did not change

> **Revision-2 acceptance boundary (as of 2026-08-13):** D0019 selected a runtime authority model; that acceptance task itself did **not** contain the production CaseDO adapter, D0020 Agent delivery/connection ownership, D0030 publication portability, or an existing-Case migration. Current production implementation progress is recorded in Section 24 and does not change the accepted r2 semantics.

## 1. One-line definition

For every Case whose durable placement generation elects the Cloudflare runtime, bind that Case to exactly one deployment/environment/class/namespace/jurisdiction/Durable-Object identity and make the elected SQLite-backed `CaseDO` the **single host of the existing D0010/CaseEngine semantic authority**, preserving exact command-receipt identity, expected-revision fencing, lifecycle/result fencing, ordinary reconstruction without semantic reopen, explicit recovery-triggered reopen, ambiguity reconciliation, and running-before-dispatch ordering; do not create a new CaseDO-native semantic model and do not maintain a writable local co-owner.

## 2. Authority inputs

D0019 inherits rather than redefines these contracts:

1. **D0010** owns the meaning of semantic/current-state authority: one current semantic head, expected-revision fencing, transactional mutation, explicit migration barriers, and no mixed writers.
2. The current `CaseEngine` / `CaseRepository` behavior is the executable local oracle for command receipts, Case/Task/Attempt transitions, result fences, terminal state, snapshot integrity, reopen and reconciliation.
3. **D0018** is closed. Its supported-Termux trusted-local runtime profile, warm host / fresh Attempt/model process boundary, and no-external-provider conclusion are ancestry; D0019 does not reopen them.
4. **D0030** is accepted but its production implementation is separate. Its immutable-journal publication route is not the Case semantic owner and is not needed to select the D0019 authority model.
5. D0020 remains the owner-design lane for Agent connection epoch, current connection, delivery ownership/queue, capacity and reconnect state.

The architecture diagram's `CaseDO` label was only a hypothesis before this Design. Provider storage convenience is not itself semantic authority.

## 3. Current repository facts

At the acceptance anchor:

- `CaseEngine.applyCommand()` durably models idempotent mutation receipts. Its exact receipt digest domain is `typedDigest('tdev.case-command.v1', canonicalClone(command))`: `requestId` addresses the receipt, while `expectedCaseRevision` is validated envelope metadata and is **not** part of the digest. After envelope validation, an existing matching receipt is replayed before expected-revision equality is checked; reuse with different command content conflicts.
- `expectedCaseRevision` is checked before a new semantic command mutation. A stale revision with no matching receipt rejects without changing the Case; a valid same-request/same-command replay returns the durable receipt even when the supplied valid integer revision metadata differs from the original request.
- result acceptance is fenced by Case/plan/Task/Attempt/executor epoch/fencing token and result/effect identity; a stale result cannot become accepted state.
- accepted-result replay deduplicates, while a contradictory replay conflicts.
- `CaseRepository` exposes a durable load/compare-and-swap transaction boundary. Ordinary `load(caseId)` restores with semantic reopen disabled; only an explicit `load(caseId, { reopen: true })` applies the current process-recovery transition and checkpoints it when it advances the Case revision. `runDurableCase()` uses the explicit reopen path because its local runner restart means execution ownership was lost; ordinary data reconstruction does not imply that fact.
- `runDurableCase()` checkpoints the `running` Attempt and its fencing token before invoking the executor. A checkpoint CAS conflict prevents dispatch.
- uncertain external effects use the existing reconciliation states and evidence rules rather than converting an ambiguous outcome into guessed success/failure or blind retry.
- snapshot and invariant corruption fail closed.

The production repository has no D0019 Cloudflare adapter at acceptance time. D0019 evidence added only a model-level falsifier under `test/` and a bounded evidence artifact under `docs/evidence/`; no `src/` file changed before acceptance.

Repository branch authority is the cumulative `group/f-cloudflare-runtime`. The canonical checkout remaining on completed Group E is recorded `CHECKOUT_ALIGNMENT_DEBT`; the acceptance work used an exact-F isolated worktree, as authorized by the current branch-lineage owner.

A separate metadata-only commit `95deaacc81bd3cdc053beaa3ca3c64e3f3058bb4` corrected the stale D0030 status in `docs/ROADMAP.md`; it did not alter D0030 semantics and is not part of the D0019 authority decision.

## 4. Current Cloudflare provider facts

These are **provider facts**, not tdev semantic decisions. They were reverified on 2026-08-13 from current Cloudflare primary documentation.

### 4.1 Storage and transaction primitives

Cloudflare documents SQLite-backed Durable Object storage as transactional, strongly consistent, and private to the object. `transactionSync()` wraps a synchronous callback in a transaction and rolls it back when that callback throws. The asynchronous `transaction()` API commits or aborts the included storage operations; SQLite direct storage operations participate in the transaction. Current documentation also notes that synchronous SQLite operations do not yield the event loop.

Primary source: <https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/> (last updated 2026-05-27).

D0019 found no current primary-source statement that an explicit transaction callback is automatically replayed. The accepted protocol therefore **does not depend** on callback-retry behavior and forbids external side effects inside the authoritative transaction.

### 4.2 Concurrency, uniqueness and initialization

`blockConcurrencyWhile()` blocks other events and is appropriate for constructor/schema initialization; a throwing callback resets the object and the callback has a 30-second timeout. It is not the normal D0019 command transaction boundary.

Primary source: <https://developers.cloudflare.com/durable-objects/api/state/>.

Cloudflare's global-uniqueness documentation includes an important limitation: a long-running event that never accesses storage may cease to be current during object replacement/network partition/software update; later storage access then throws. D0019 therefore does not rely on a merely in-memory singleton. Every semantic mutation must reach the durable storage authority.

Primary source: <https://developers.cloudflare.com/durable-objects/platform/known-issues/> (last updated 2026-07-03).

### 4.3 Eviction and reconstruction

Durable Object instances may be evicted and reconstructed. In-memory fields are not a durable owner and constructor initialization runs again on a new instance. D0019 consequently requires all authoritative semantic facts and receipts to be reconstructible from SQLite, with caches treated as disposable projections only.

Primary source: <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/> (last updated 2026-07-03).

### 4.4 Request/RPC failure ambiguity

Cloudflare propagates object and infrastructure exceptions to the caller. Its retry guidance explicitly conditions retryable errors on the application request being idempotent/safely repeatable, advises against retrying overload errors, and advises recreating a broken stub after an exception. Same-stub E-ordering is not an exactly-once result guarantee.

Primary sources:

- <https://developers.cloudflare.com/durable-objects/best-practices/error-handling/> (last updated 2026-04-21)
- <https://developers.cloudflare.com/durable-objects/api/stub/> (last updated 2026-04-21)

D0019 treats a transport/RPC exception as **unknown semantic outcome** unless the failure is proven before commit. The authoritative answer comes from the durable receipt/state reread.

### 4.5 Alarms

Alarm handlers are at-least-once and are automatically retried after uncaught failure with exponential backoff for up to six retries. D0019 does not use alarms as command-admission authority. If later scheduling uses alarms, the receiving operation must already satisfy the same idempotency/receipt rules.

Primary source: <https://developers.cloudflare.com/durable-objects/api/alarms/> (last updated 2026-04-21).

### 4.6 Identity/routing and placement scope

A canonical Case identifier may be mapped to a name-derived Durable Object identity, but provider identity is scoped by the configured class/namespace and placement context. Current Cloudflare documentation explicitly shows that the same name can produce different Durable Object IDs in different jurisdictions, and Wrangler environment bindings are configured per environment rather than inherited automatically. Therefore a deterministic name alone does **not** prove application-level one-Case/one-authority uniqueness across deployments, environments or jurisdictions.

D0019 consequently requires a separate durable placement election/generation before a new CaseDO authority is initialized. The elected record binds at least `CaseId + placementGeneration` to the exact deployment/environment identity, Worker script, class/namespace, jurisdiction and Durable Object ID. Only that elected tuple may initialize or mutate the Case; retry after initialization failure targets the same elected destination and may not fall back to a second namespace/jurisdiction/object. The CaseDO must validate the elected placement identity together with its durable Case metadata before mutation.

This placement record is a narrow **meta-authority for physical ownership**, not a second semantic Case head. It elects which one CaseDO may host D0010 semantics; it does not own Case revision, Task/Attempt lifecycle or accepted results.

Primary sources:

- <https://developers.cloudflare.com/durable-objects/api/namespace/>
- <https://developers.cloudflare.com/durable-objects/api/id/>
- <https://developers.cloudflare.com/durable-objects/reference/data-location/>
- <https://developers.cloudflare.com/durable-objects/reference/environments/>

### 4.7 SQLite limits

Current SQLite-backed limits include bounded per-object storage and, critically, a 2 MiB maximum string/BLOB/table-row size, a 100 KiB SQL statement limit, and 100 bound parameters per query. A D0019 production adapter therefore may not assume that one unbounded serialized Case snapshot fits in one row/BLOB. The authoritative representation must be normalized or safely chunked while keeping one semantic transaction boundary. The production profile must also derive a finite **total authoritative Case budget** from the actual qualified account/provider profile and fail admission before a mutation or external-effect crossing could exceed that budget; generic documentation is not evidence for the deployed account's usable capacity.

Primary source: <https://developers.cloudflare.com/durable-objects/platform/limits/> (last updated 2026-06-01).

### 4.8 Deployment lifecycle

Current Cloudflare `exports` configuration is the declarative class-lifecycle path; new namespaces use SQLite. A Worker that has adopted `exports` cannot return to the legacy `migrations` array, and a provisioned namespace's storage backend cannot be changed in place. Current known-issues guidance also warns that code rollout is eventually consistent, so a newly deployed Worker may communicate with the previous Durable Object code for seconds or minutes. Those facts constrain deployment/rollback and require a compatible old/new API+schema overlap or a fail-closed deployment barrier; they do not authorize a tdev Case-authority migration.

Primary source: <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/> (last updated 2026-07-15).

## 5. Candidate models

### 5.1 Candidate A — CaseDO hosts/adapts existing authority

Candidate A preserves the current semantic engine and changes only placement/persistence adaptation:

```text
CaseId
  -> durable placement election/generation
  -> exact deployment/environment/class/namespace/jurisdiction/DO identity
  -> durable SQLite authoritative rows
       - Case identity / schema
       - current Case revision
       - semantic head/root
       - command receipts
       - Task state
       - Attempt state/fences
       - accepted result/reconciliation state
       - terminal state
  -> same CaseEngine semantic transition
  -> one atomic authoritative transaction
```

This survives only under the transaction and crossing rules in sections 8-13. A CaseDO implementation that keeps the semantic head, receipts or current lifecycle only in memory is **not** Candidate A.

### 5.2 Candidate B — explicit migration to CaseDO-native durable state

Candidate B would replace the existing authority with a newly defined CaseDO-native semantic representation and migrate Cases from a prior owner. It carries two independent risks:

1. a semantic rewrite can change duplicate/revision/result/restart behavior even when both backends are individually durable;
2. a source/destination cutover can create two current heads unless an independent placement/writer fence prevents both owners from accepting commands.

The D0019 migration falsifier copied the same starting Case snapshot into two stores and allowed both to remain writable. From the same expected revision, the source accepted `start_attempt` while the destination accepted `cancel_task`; both advanced and produced different authoritative digests. `copy then switch` without an old-writer fence is therefore falsified.

Candidate B is rejected for the current MVP D0019 slice.

### 5.3 Candidate C — another single-owner equivalent

No current repository/provider evidence requires a different owner primitive. Candidate C remains a future escape hatch only if production qualification later falsifies the bounded CaseDO adapter. It is not selected by this Design.

## 6. Rejected models

The following are explicitly invalid:

- CaseDO is authoritative merely because the architecture diagram says `CaseDO`.
- a Worker, MCP endpoint, D1 projection, R2 object, Git ref, in-memory DO field or cache is accepted as the semantic current head.
- a local Case store and CaseDO are both writable for the same Case.
- a provider exception is treated as proof that the command failed.
- a retry creates a new request identity when the original outcome is unknown.
- external Agent/Git/process I/O occurs inside the Case authority transaction.
- alarm delivery is used as exactly-once Case command admission.
- D0020 Agent connection/capacity facts are stored as authoritative Case semantics for convenience.
- an existing local Case is copied to CaseDO and the route is switched without a separately durable old-writer fence/cutover barrier.
- D0030 RENAME_NOREPLACE/helper selection is treated as the Cloudflare Case semantic owner.

## 7. Selected authority model

**Selected: Candidate A.**

For a Case placed in the Cloudflare runtime, its elected SQLite-backed CaseDO is the physical host of the D0010/CaseEngine semantic authority. The semantic meaning remains the D0010/CaseEngine state machine; CaseDO storage is the authority adapter and durable transaction substrate.

Before authority birth, one durable placement election must bind the Case to an exact placement generation and provider tuple. An absent placement record cannot be synthesized independently by multiple environments. An exact retry may reuse the elected tuple; a competing tuple for the same Case/generation must fail closed. The placement owner is not a semantic co-owner: after election, Case revision/head/receipts/lifecycle remain exclusively inside the elected CaseDO.

The selection is conditional on production preserving every frozen boundary in this Design. A production implementation that cannot do so fails qualification; it does not weaken this Design into eventual consistency or a second owner.

In-memory state may cache validated durable rows for one instance only if the cache is disposable, has no independent revision/head meaning, and is invalidated/reconstructed on instance replacement. A cache hit may never bypass the authoritative receipt/revision/fencing transaction.

## 8. Transaction boundary

One admitted semantic mutation has this indivisible authoritative shape:

1. resolve the elected placement record and validate `CaseId`, placement generation, exact provider placement identity, storage profile and schema identity;
2. resolve the elected object and validate the same durable `CaseId`/placement/schema metadata inside CaseDO;
3. look up `requestId` and its exact D0010 command digest;
4. if the receipt exists and digest matches, return its exact durable semantic response without mutation;
5. if the receipt exists with a different digest, fail `request_conflict`;
6. compare `expectedCaseRevision` with the current durable revision only when no matching receipt exists; stale input fails before semantic mutation or external effect;
7. reconstruct/validate the relevant current Case semantic state;
8. apply exactly one existing CaseEngine semantic transition;
9. validate resulting invariants, lifecycle/result fences and the deployment-qualified capacity budget;
10. atomically persist every changed authoritative row together with the new Case revision, semantic head/root and exact command receipt;
11. commit the transaction;
12. only after commit may a response be returned or a D0020 delivery/effect crossing begin.

No external fetch, Agent RPC, Git operation, OS/process operation, D1/R2 projection write, model execution, alarm scheduling dependency or other effect may be required to complete this transaction.

The production adapter may use explicit `transactionSync()` or an equivalently documented atomic synchronous SQLite sequence, but it must have one testable semantic commit point. It may not depend on undocumented transaction callback replay behavior.

## 9. Command / receipt protocol

`requestId` identifies one semantic command attempt across transport retries and addresses one durable receipt. D0019 freezes the receipt identity to the existing D0010 oracle exactly:

```text
commandDigest = typedDigest('tdev.case-command.v1', canonicalClone(command))
```

`requestId` and `expectedCaseRevision` are **excluded** from that digest. The envelope still validates `requestId`, the optional revision integer and the command before receipt lookup. Once the envelope is valid, an existing same-request/same-command receipt is replayed before expected-revision equality is evaluated. Therefore a valid retry may carry different revision metadata and still return the original receipt; changing the command under the same `requestId` is `request_conflict`.

Outcome rules:

```text
receipt exists + same digest
  -> exact receipt response
  -> deduplicated
  -> no new Case revision

receipt exists + different digest
  -> request_conflict
  -> no mutation

no receipt + stale expected revision
  -> revision_conflict
  -> no mutation

no receipt + current expected revision
  -> apply one semantic transition
  -> atomically persist successor + receipt
```

A caller that loses a response reuses the **same** request identity and command content. It does not invent a new request merely because a stub/RPC failed. The durable receipt owns the canonical **semantic response** produced by the CaseEngine transition; transport/stub metadata is not part of the replay identity or stored semantic response.

Receipt retention/compaction or schema evolution may change physical representation only if it losslessly preserves `requestId`, the `tdev.case-command.v1` command digest, canonical semantic response, response digest and committed-revision meaning across the required replay horizon. It cannot make a previously ambiguous committed command indistinguishable from a never-admitted command. Any new bounded-retention policy with observable meaning requires its own owner decision.

## 10. Revision and result fencing

The D0010/CaseEngine revision fence remains authoritative. Object serialization is an additional provider property, not a substitute for `expectedCaseRevision`.

Stale revision rejection occurs before mutation and before external side effects.

Result acceptance preserves the existing fences, including as applicable:

- Case identity;
- plan revision/digest;
- Task identity;
- Attempt identity;
- executor/Agent epoch supplied by the accepted crossing contract;
- fencing token;
- effect key and accepted result digest/identity;
- terminal/cancellation/reconciliation state.

A stale or contradictory result cannot create a new current head. Accepted-result replay remains deduplicated.

## 11. Restart / reopen

Durable Object eviction, deployment replacement and reconstruction are cold restart of the **instance only**. They are not evidence that the Agent/executor or D0020 delivery owner lost execution ownership, and they do not by themselves authorize a semantic process-recovery transition.

A new CaseDO instance must rebuild its authority view from SQLite with semantic reopen **disabled**, equivalent to ordinary `CaseRepository.load(caseId)`. Initialization may use a short `blockConcurrencyWhile()` boundary for schema/invariant setup, but constructor rerun, cache loss, stub failure, eviction or deployment alone may not change a running Attempt into interrupted/pending or authorize a new Attempt.

Semantic reopen is a separate recovery action. It may use the current `reopen:true` oracle only after an explicit durable recovery cause proves or conservatively records that the relevant execution/delivery ownership was lost or became uncertain under the accepted D0019/D0020 crossing. That cause and its resulting semantic transition must be fenced and committed exactly once before new work is admitted. Result-only work then follows the existing interrupted/retry rules; uncertain external work follows the existing reconciliation rules and cannot be guessed into a duplicate effect attempt.

Until D0020 defines the distributed delivery/liveness owner, D0019 production code must not synthesize such a recovery cause from CaseDO lifecycle events. Corrupt, unsupported or internally inconsistent durable state fails closed before serving mutations. Constructor failure is not permission to synthesize a replacement Case from a projection.

## 12. Response loss and ambiguity

Transport/RPC errors divide into only two semantic categories:

- **proven pre-commit failure**: no authoritative successor/receipt exists; the same request may be admitted normally later if its expected revision remains current;
- **commit may have occurred**: semantic outcome is unknown until authoritative reread.

The normal reconciliation path after an ambiguous CaseDO call is:

1. recreate the stub when provider guidance requires it;
2. route to the same CaseDO identity;
3. replay/reread with the same immutable `requestId` and command digest;
4. if the durable receipt exists, return the committed exact response;
5. if no receipt exists, evaluate the current revision/state before deciding whether the original request remains admissible;
6. never infer failure from the transport exception alone.

For an external Agent/Git/process effect, CaseDO receipt ambiguity and effect ambiguity remain distinct. Once an external effect might have occurred, the existing effect-class reconciliation rules govern; CaseDO does not blindly dispatch again merely because the caller lost an acknowledgement.

## 13. Running-before-dispatch

The accepted crossing is:

```text
CaseDO transaction:
  pending Task
    -> running Attempt
    + Attempt identity
    + fencing token / effect key as applicable
    + advanced Case revision
    + durable command receipt
  COMMIT

only then:
  D0020 delivery owner / local Agent crossing
```

If the running transaction fails or is ambiguous, no external delivery begins until the Case authority is reread and proves the running Attempt. This preserves the existing durable-runner invariant.

The converse is prohibited: dispatch first and write `running` afterward.

Duplicate delivery is not solved by pretending the transport is exactly once. D0020 must carry the committed Attempt identity/fence; CaseDO result acceptance remains the semantic arbiter. OS/Git/process effect idempotency or reconciliation remains owned by the local effect boundary.

## 14. Authority map

| Fact | Authoritative owner after D0019 selection | Notes |
| --- | --- | --- |
| Case placement / authority generation | durable placement election owner | binds CaseId to exact deployment/environment/class/namespace/jurisdiction/DO identity; not semantic Case state |
| Case identity | elected CaseDO durable Case metadata | must agree with the elected placement generation and identity |
| Case current revision | CaseDO SQLite | semantic command fence |
| semantic head/root | CaseDO SQLite | D0010 meaning preserved |
| command admission | CaseDO SQLite transaction | Worker/MCP are ingress only |
| command receipt | same CaseDO transaction | exact duplicate replay |
| Task lifecycle | CaseDO SQLite | semantic authority |
| Attempt lifecycle | CaseDO SQLite | semantic authority |
| accepted result | CaseDO SQLite | after result fencing |
| terminal Case status | CaseDO SQLite | no projection may override |
| running-before-dispatch record | CaseDO SQLite | must commit before D0020 crossing |
| delivery intent / queue | D0020 AgentDO/equivalent candidate | not D0019 semantic authority |
| Agent current connection / epoch | D0020 AgentDO/equivalent candidate | not stored as Case truth |
| Agent capacity | D0020 AgentDO/equivalent candidate | scheduling/delivery fact |
| OS/Git/process effect truth | local Agent/effect boundary | Case stores only fenced accepted evidence/result |
| remote Git ref | remote derived publication | not semantic current head |
| immutable artifact bytes | artifact/journal storage lane (D0022/D0030 as applicable) | existence alone is not Case authority |
| projections/query indexes | Worker/D1/R2/equivalent projection | disposable/derived from authority |

D1 or R2 may later provide useful indexes/artifact storage, but existence in either service never elects the Case semantic head.

## 15. Migration / cutover

D0019 freezes **no migration of an already locally authoritative Case in the initial implementation**.

After the production CaseDO adapter and placement protocol are independently qualified, a new Case may be born only after an atomic durable placement election has selected its exact CaseDO tuple. Initialization retries the same elected destination; failure must not create a fallback CaseDO in another environment, namespace or jurisdiction. Such a Case must never have a writable local semantic co-owner.

An existing local Case remains writable only by its existing authority and must not be exposed through a writable CaseDO copy until a separate accepted migration/cutover Design closes all of the following together:

- authoritative placement record and generation;
- exact source authority identity;
- exact destination authority identity;
- old-writer fencing before destination activation;
- source quiescence/cutover barrier;
- read ownership while cutover is pending;
- in-flight command treatment;
- transfer/preservation of duplicate-command receipts;
- response-loss treatment across the barrier;
- restart during migration;
- idempotent migration retry;
- partial-copy detection and cleanup ownership;
- destination activation proof;
- migration completion evidence;
- rollback/downgrade boundary.

At no time may both source and destination accept semantic commands. The D0019 dual-writer falsifier proves why a simple copy followed by a routing switch is insufficient.

## 16. Rollback / downgrade

Before any authoritative Case is created in the CaseDO namespace, an unused D0019 adapter can be removed by ordinary code/config rollback if the provider lifecycle itself permits that rollback.

After an authoritative Case exists in CaseDO:

- rollout and rollback may deploy only code/API/schema that is compatible with the existing authority during the provider's possible old/new code overlap, or must establish a fail-closed barrier that prevents incompatible mixed writers;
- rollback may deploy only code/schema compatible with that existing authority;
- rollback must not route the Case back to local authority;
- a CaseDO namespace may not be deleted/reprovisioned as a substitute for semantic rollback;
- a provisioned storage backend may not be silently changed;
- an incompatible schema or owner transition requires a separately accepted migration/rollback Design and positive evidence;
- deployment lifecycle must respect the then-current Cloudflare `exports`/legacy-migrations rules rather than guessing a downgrade path.

This freezes enough rollback behavior for the bounded production adapter without claiming an implementation-specific database schema before that implementation exists.

## 17. D0020 boundary

D0019 owns semantic Case/current-state authority only.

D0020 owns or selects the durable owner for:

- Agent connection epoch;
- current connection;
- delivery owner and delivery queue/intent;
- capacity;
- reconnect state.

The crossing contract is one-way at dispatch time: D0019 commits `running` plus the Attempt fence, then D0020 may take delivery responsibility. D0020 can report connection/delivery facts back as inputs/evidence, but those facts do not replace the Case current revision/head.

D0019 does not require D0020 production implementation to accept this Design; D0019 production qualification that exercises remote dispatch will require the accepted D0020 crossing contract.

## 18. D0030 relationship

D0030 remains accepted and closed for this task.

Its backend-neutral immutable-journal no-replace publication contract and selected qualified `RENAME_NOREPLACE` helper are not Cloudflare Case semantic authority. D0019 does not implement or require D0030 production code merely to choose CaseDO.

If a later D0019 production verification route exercises the Termux `ImmutableJournalSnapshotStore` as an authoritative local write path, then the already-accepted D0030 production implementation/qualification is a prerequisite for **that verification route**. It is not a prerequisite for the CaseDO authority Design itself.

## 19. Security boundary

CaseDO authority does not widen trust by convenience.

- Worker/MCP ingress authenticates/authorizes before semantic command admission according to their owners, but authorization input is not a second semantic state owner.
- All command/result envelopes are strictly parsed and bounded before mutation.
- Case routing input is validated against the durable placement generation and CaseDO identity/schema; a caller cannot choose another Case's semantic storage by smuggling an arbitrary storage key, environment, namespace, jurisdiction or object ID.
- no external network/Agent/Git/process call occurs inside the authoritative SQLite transaction;
- projection stores do not become fallback authority during CaseDO failure;
- corrupt/incompatible durable state fails closed rather than rebuilding from untrusted projection input;
- D0020 connection/capacity metadata remains separated from Case semantics to limit authority amplification;
- provider lifecycle/config changes that could delete/transfer authority require the repository's deployment/security owner and separate production evidence.

Production must bound row counts/bytes, receipts, events, evidence and command/result payloads consistently with existing Case contracts and current provider limits.

### 19.1 Initial CaseDO storage profile, capacity and rollout

The first production adapter must declare one durable logical storage profile, `tdev.casedo.sqlite-authority.v1`, with `storageSchemaVersion = 1`. Durable Case metadata must bind at least the Case identity, placement generation/identity, profile ID, schema version and the semantic schema/head identity required to reconstruct the D0010 state. The authoritative state must be normalized or safely chunked; exact SQL table names, indexes and chunk sizes remain implementation details as long as they preserve the one semantic transaction and provider limits.

Before an authoritative Case is created or a mutation is allowed to grow it, the deployed profile must have a finite, positively qualified `maxAuthoritativeBytesPerCase` (or equivalently strict aggregate budget) derived from the actual account/provider configuration with explicit safety headroom. Admission must conservatively account for the successor authoritative rows plus receipt/event/evidence growth before commit or external-effect crossing. Unknown, incompatible or exceeded capacity fails closed; storage exhaustion is not allowed to become an ambiguous post-effect authority failure.

Schema/code rollout must preserve receipts and semantic state losslessly. During provider old/new code overlap, either both versions are read/write compatible for the active profile or a durable/fail-closed deployment barrier prevents the incompatible version from admitting mutation. No code rollout may create two schema writers with different receipt, reopen, placement or lifecycle meaning.

## 20. Falsifier matrix

The executable artifact `test/d0019-casedo-authority-model.test.mjs` uses the real local `CaseEngine`, `CaseRepository`, store model and durable runner; it is a semantic falsifier, **not** production Cloudflare code. The original acceptance run was `41/41`; this amendment adds receipt-envelope, placement, ordinary-eviction and explicit-recovery cases. Fresh amendment counts are recorded in the amendment evidence artifact rather than retroactively rewriting the original acceptance evidence.

| # | Adversarial case | Local oracle | Selected CaseDO model | Evidence/result |
| --- | --- | --- | --- | --- |
| 1 | duplicate command | exact receipt replay, no revision advance | same receipt is durable in authority transaction | pass |
| 2 | same command after response loss | outcome unknown until receipt reread | same request replay after reconstructed adapter returns committed receipt | pass |
| 3 | same request/command with changed valid revision metadata | receipt lookup precedes revision equality; digest is command-only | replay exact semantic response; no revision advance | amendment falsifier |
| 4 | stale expected revision without receipt | reject, no mutation | revision checked before new mutation | pass |
| 5 | concurrent commands | one current-revision winner | serialized transaction + revision fence | pass |
| 6 | restart before admission | no receipt/mutation | proven precommit failure leaves store unchanged | pass |
| 7 | ordinary CaseDO eviction while Attempt may remain live | ordinary load preserves running Attempt | reconstruct from SQLite with semantic reopen disabled | amendment falsifier |
| 8 | explicit execution-owner-loss recovery | `reopen:true` applies process-recovery semantics | only a separate durable recovery cause may invoke it; repeated recovery is idempotent | amendment falsifier |
| 9 | restart after mutation before response | receipt reread, no second mutation | lost-response model | pass |
| 10 | ambiguous transaction/result | reread / reconcile | receipt/state reread mandatory | pass |
| 11 | running-before-dispatch crash point | running fence durable first | commit before D0020 crossing | pass |
| 12 | duplicate dispatch | fence/effect semantics arbitrate | D0020 carries Attempt fence; CaseDO result acceptance wins | pass at D0019 boundary |
| 13 | stale Attempt result | reject with no change | same result fences | pass |
| 14 | late result after cancellation/terminal | no resurrection | same state machine | pass |
| 15 | accepted result replay | dedupe; contradiction conflicts | same accepted-result identity/digest | pass |
| 16 | same CaseId proposed in two placement contexts | no local analogue; single semantic owner invariant applies | elected generation accepts one exact tuple and rejects a competing environment/namespace/jurisdiction/DO | amendment falsifier |
| 17 | corrupt/invalid state | fail closed | initialization fails closed | pass |
| 18 | migration boundary | never two semantic owners | existing Cases not migrated; future cutover requires exclusive durable fence | pass by prohibition; naive Candidate B falsified |
| 19 | incompatible schema/code rollout or total-capacity overflow | no weakening of durable owner allowed | fail closed / qualification gate before authority birth or growth | production qualification required |

The migration falsifier specifically demonstrated that two stores copied from the same revision can each successfully admit a different command if both remain writable. That is a hard rejection of an unfenced `copy then switch` plan.

## 21. Revision-2 acceptance-boundary unverified limits (as of 2026-08-13)

At the r2 acceptance boundary, the following were deliberately **not** promoted to accepted facts. Current implementation evidence is recorded separately in Section 24:

- no production CaseDO source was implemented or deployed in this Design task;
- no live Cloudflare eviction/network-partition/response-loss injection was run against a production adapter;
- the normalized SQLite table/chunk schema, durable placement-store mechanism and `tdev.casedo.sqlite-authority.v1` implementation are not yet implemented or performance-qualified;
- the repository's exact future Wrangler `exports` versus inherited lifecycle configuration must be resolved from then-current deployment authority during implementation; the two lifecycle mechanisms must not be mixed;
- actual provider account/plan limits and the deployment-qualified total Case budget are not inferred from generic documentation;
- transaction callback automatic retry behavior is not documented in the located current primary source and is not relied upon;
- D0020 delivery mechanics remain a separate Design/implementation lane;
- D0030 production implementation remains separate;
- current tmcp validation profiles contain known registry drift (`verify:sandbox` / `verify:termux` references not present in current package scripts); validation evidence must report commands actually executed rather than claim a profile is green.

These are production qualification gates, not unresolved public/persistent/security migration questions in the accepted authority model.

## 22. Production implementation gate

The r2 acceptance authorized a **separate bounded D0019 production implementation Root Task** only if it preserves this contract. Current satisfaction of this gate is recorded in Section 24; this list remains the accepted implementation contract rather than a current completion claim.

That Task must, at minimum:

1. re-read then-current repository/deployment authority and current Cloudflare primary docs;
2. implement or bind to one durable atomic placement-election/generation path for new Cases, and prove that the same CaseId cannot initialize competing environment/namespace/jurisdiction/DO destinations;
3. implement one elected SQLite-backed CaseDO adapter without creating a local co-owner;
4. implement `tdev.casedo.sqlite-authority.v1` / `storageSchemaVersion = 1` with a normalized/chunked bounded representation and a deployment-qualified total Case capacity budget;
5. prove atomic receipt + revision + semantic-head + lifecycle mutation;
6. prove the exact `tdev.case-command.v1(canonical command)` receipt identity, including same-request/same-command replay under changed valid revision metadata, plus stale revision and concurrent-admission parity;
7. inject precommit failure and postcommit response loss and reconcile by authoritative receipt reread;
8. prove ordinary eviction/reconstruction with semantic reopen disabled while a live Attempt remains unchanged; separately inject an explicit execution-owner-loss recovery cause and prove the current reopen transition commits exactly once;
9. prove running-before-D0020-dispatch ordering;
10. prove stale/duplicate result fencing and reconciliation behavior;
11. prove storage-profile capacity admission and corrupt/unknown/incompatible placement/schema/lifecycle state fail closed before external effects;
12. prove old/new code and schema rollout compatibility or a fail-closed deployment barrier under provider rollout overlap;
13. create no migration path for existing local Cases unless a separate migration/cutover Design has first been accepted;
14. keep D0020 and D0030 production work outside this implementation unless a separately authorized prerequisite is explicitly invoked;
15. independently verify the requested Cloudflare/runtime/deployment layers before calling production verified.

Acceptance is not production verification.

## 23. Revision-2 acceptance conclusion (as of 2026-08-13)

At the revision-2 acceptance boundary, D0019 r2 was `accepted` as **Candidate A: one durably elected CaseDO hosts/adapts the existing D0010/CaseEngine authority**.

The accepted meaning is not “Durable Objects are authoritative.” It is narrower: one SQLite-backed CaseDO may become the physical single owner for a placed Case only after a durable placement generation elects its exact provider identity, and only when it preserves the existing semantic oracle inside one durable transaction, reconstructs without inventing semantic reopen, preserves the exact D0010 receipt domain, respects the qualified storage/rollout profile, and keeps all competing ownership/projection/effect facts outside that authority.

At that acceptance boundary, Candidate B's unfenced migration form was falsified; existing local Cases were not migrated by D0019, and Candidate C was unnecessary on the available evidence. Placement uniqueness, exact receipt identity/replay, ordinary reconstruction versus explicit recovery reopen, response-loss/revision/running-before-dispatch/ambiguity behavior, initial storage/capacity/rollout profile, migration prohibition, rollback boundary, D0020 separation and D0030 relationship were frozen tightly enough for a separate production implementation Task. The amendment removed the prior implementation-authorization blocker; the acceptance task itself did not implement or production-verify the adapter.

## 24. Production implementation status (as of 2026-08-15)

The maintained lifecycle status is now `implementing`. Revision 2 and its accepted product/runtime semantics are unchanged.

Implemented source evidence:

- `src/casedo-authority.mjs` implements `tdev.casedo.sqlite-authority.v1` / `storageSchemaVersion = 1` as a bounded SQLite host for the existing D0010 semantic-v3 authority. Snapshot authority and content-addressed semantic objects are safely chunked; the adapter does not define a second Case state machine.
- `src/engine.mjs` exposes the existing command-envelope inspection needed by the adapter so the receipt identity remains exactly `typedDigest('tdev.case-command.v1', canonicalClone(command))` and receipt replay remains before expected-revision rejection.
- one synchronous storage transaction validates placement/profile/schema/writer compatibility, restores `CaseEngine` with `reopen:false`, applies exactly one semantic command, capacity-checks the successor, and atomically persists semantic objects, snapshot, head and metadata. Injected precommit writes roll back; postcommit response loss reconciles by durable receipt reread.
- ordinary reconstruction preserves a live `running` Attempt. `reopen:true` is confined to a separate durable, idempotent execution-owner-loss recovery action; its cause remains opaque and does not define D0020 delivery/epoch/reconnect meaning.
- `src/cloudflare-casedo.mjs` provides the provider host for an **already elected** Case placement and checks deployment/environment/Worker/class/namespace/jurisdiction/current Durable Object identity before authoritative operations. No Cloudflare authority-birth RPC is exposed.
- a positive finite `maxAuthoritativeBytesPerCase` and writer compatibility identity are mandatory deployment inputs; no generic production capacity default is supplied.

The implementation deliberately does **not** guess the still-unselected durable placement meta-authority substrate. An earlier local candidate that could have made separate placement Durable Objects independent registry owners was removed before publication. `initializeElectedCase()` therefore has an explicit precondition that a separately owned durable placement election already selected the exact record. Production gate item 2 remains pending until current deployment authority selects or binds one durable atomic placement path and proves competing destinations cannot initialize one CaseId.

Validation at this status:

- focused final CaseDO adapter plus D0019 model falsifiers: `19/19` passed;
- supported non-hard-link source suite: `286/286` passed together with syntax, documentation validation, demo, durable demo and `git diff --check`;
- supported non-hard-link coverage: `286/286` passed, all-files line/branch/function coverage `86.10% / 77.54% / 93.68%`, and `src/casedo-authority.mjs` `90.59% / 74.62% / 100%`;
- exact `npm run check`: **not green** in this Termux environment because `immutable-journal.test.mjs` hard-link publication reaches `link(2)` `EACCES`;
- exact full coverage command: **not green** for the same inherited hard-link qualification reason;
- live Cloudflare/provider qualification: unavailable in this task environment; no repository Wrangler config, Wrangler executable or bounded `CLOUDFLARE_*` environment names were observed, so account limits, deployment-qualified capacity, provider fault injection and rollout overlap were not guessed green.

The exact machine-readable evidence is `docs/evidence/group-f-d0019-casedo-production-implementation-2026-08-15.json`. D0019 is therefore **source-implemented and locally adapter-qualified, but provider/placement qualification-pending**. It is not production `verified`, WORKBOARD remains on D0019@r2, and D0020 is not activated by this evidence.
