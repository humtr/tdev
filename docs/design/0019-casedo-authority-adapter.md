# Design 0019 — CaseDO Authority Adapter

- Status: `accepted`
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
- Inherited authority: D0010 semantic/current-state authority; D0018 runtime boundary remains closed; D0030 accepted publication portability remains separate
- Affected normative owners after acceptance: `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, `docs/design/README.md`
- `docs/SPEC.md`: unchanged; product scope did not change

> D0019 selects a runtime authority model. It does **not** contain the production CaseDO adapter, does not implement D0020 AgentDO delivery/connection ownership, does not implement D0030 publication portability, and does not migrate an existing locally authoritative Case.

## 1. One-line definition

For every Case placed on the Cloudflare runtime, route the Case to exactly one SQLite-backed `CaseDO` and make that object's durable SQLite transaction state the **single host of the existing D0010/CaseEngine semantic authority**, preserving command receipts, expected-revision fencing, lifecycle/result fencing, restart/reopen semantics, ambiguity reconciliation, and running-before-dispatch ordering; do not create a new CaseDO-native semantic model and do not maintain a writable local co-owner.

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

- `CaseEngine.applyCommand()` durably models idempotent mutation receipts: the same `requestId` and same command digest replay the exact prior response, while reuse with different command content conflicts.
- `expectedCaseRevision` is checked before the semantic command mutation. A stale revision rejects without changing the Case.
- result acceptance is fenced by Case/plan/Task/Attempt/executor epoch/fencing token and result/effect identity; a stale result cannot become accepted state.
- accepted-result replay deduplicates, while a contradictory replay conflicts.
- `CaseRepository` exposes a durable load/compare-and-swap transaction boundary and persists a semantic reopen transition when reopen advances the Case revision.
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

### 4.6 Identity/routing

A canonical Case identifier may be mapped to a name-derived Durable Object identity. That gives a routing identity inside the configured namespace/jurisdiction; it does not prove semantic ownership. The Case identity must also be validated from the object's durable Case metadata before mutation.

Primary sources:

- <https://developers.cloudflare.com/durable-objects/api/namespace/>
- <https://developers.cloudflare.com/durable-objects/api/id/>

### 4.7 SQLite limits

Current SQLite-backed limits include bounded per-object storage and, critically, a 2 MiB maximum string/BLOB/table-row size, a 100 KiB SQL statement limit, and 100 bound parameters per query. A D0019 production adapter therefore may not assume that one unbounded serialized Case snapshot fits in one row/BLOB. The authoritative representation must be normalized or safely chunked while keeping one semantic transaction boundary.

Primary source: <https://developers.cloudflare.com/durable-objects/platform/limits/> (last updated 2026-06-01).

### 4.8 Deployment lifecycle

Current Cloudflare `exports` configuration is the declarative class-lifecycle path; new namespaces use SQLite. A Worker that has adopted `exports` cannot return to the legacy `migrations` array, and a provisioned namespace's storage backend cannot be changed in place. Those facts constrain deployment/rollback but do not authorize a tdev Case-authority migration.

Primary source: <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/> (last updated 2026-07-15).

## 5. Candidate models

### 5.1 Candidate A — CaseDO hosts/adapts existing authority

Candidate A preserves the current semantic engine and changes only placement/persistence adaptation:

```text
CaseId
  -> deterministic CaseDO route
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

For a Case placed in the Cloudflare runtime, its one SQLite-backed CaseDO is the physical host of the D0010/CaseEngine semantic authority. The semantic meaning remains the D0010/CaseEngine state machine; CaseDO storage is the authority adapter and durable transaction substrate.

The selection is conditional on production preserving every frozen boundary in this Design. A production implementation that cannot do so fails qualification; it does not weaken this Design into eventual consistency or a second owner.

In-memory state may cache validated durable rows for one instance only if the cache is disposable, has no independent revision/head meaning, and is invalidated/reconstructed on instance replacement. A cache hit may never bypass the authoritative receipt/revision/fencing transaction.

## 8. Transaction boundary

One admitted semantic mutation has this indivisible authoritative shape:

1. resolve the routed object and validate durable `CaseId`/schema identity;
2. look up `requestId` and its immutable command/request digest;
3. if the receipt exists and digest matches, return its exact durable response without mutation;
4. if the receipt exists with a different digest, fail `request_conflict`;
5. compare `expectedCaseRevision` with the current durable revision; stale input fails before semantic mutation or external effect;
6. reconstruct/validate the relevant current Case semantic state;
7. apply exactly one existing CaseEngine semantic transition;
8. validate resulting invariants, lifecycle and result fences;
9. atomically persist every changed authoritative row together with the new Case revision, semantic head/root and exact command receipt;
10. commit the transaction;
11. only after commit may a response be returned or a D0020 delivery/effect crossing begin.

No external fetch, Agent RPC, Git operation, OS/process operation, D1/R2 projection write, model execution, alarm scheduling dependency or other effect may be required to complete this transaction.

The production adapter may use explicit `transactionSync()` or an equivalently documented atomic synchronous SQLite sequence, but it must have one testable semantic commit point. It may not depend on undocumented transaction callback replay behavior.

## 9. Command / receipt protocol

`requestId` identifies one semantic command attempt across transport retries. The request digest covers the immutable command content and the applicable command envelope fields required by the accepted protocol.

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

A caller that loses a response reuses the **same** request identity and content. It does not invent a new request merely because a stub/RPC failed.

Receipt retention/compaction in production may change physical representation only if it preserves the replay horizon required by the public command contract and cannot make a previously ambiguous committed command indistinguishable from a never-admitted command. Any new bounded-retention policy with observable meaning requires its own owner decision.

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

Durable Object eviction, deployment replacement and reconstruction are treated as semantic cold restart of the **instance**, not loss of Case authority.

A new instance must rebuild its authority view from SQLite. Initialization may use a short `blockConcurrencyWhile()` boundary for schema/invariant setup. The Case semantic reopen transition must be applied exactly once under a durable transaction when the stored state requires it, and its successor must commit before new commands are admitted.

The production implementation must preserve the current oracle distinctions. For example, interrupted result-only work may become retryable according to current reopen semantics, while reconcilable external uncertainty must remain reconciling and cannot be guessed into a new effect attempt.

Corrupt, unsupported or internally inconsistent durable state fails closed before serving mutations. Constructor failure is not permission to synthesize a replacement Case from a projection.

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
| Case identity | CaseDO durable Case metadata | deterministic routing must agree with durable identity |
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

After the production CaseDO adapter is independently qualified, a new Case may be born directly in CaseDO. Such a Case must never have a writable local semantic co-owner.

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
- Case routing input is validated against durable Case identity; a caller cannot choose another Case's semantic storage by smuggling an arbitrary storage key.
- no external network/Agent/Git/process call occurs inside the authoritative SQLite transaction;
- projection stores do not become fallback authority during CaseDO failure;
- corrupt/incompatible durable state fails closed rather than rebuilding from untrusted projection input;
- D0020 connection/capacity metadata remains separated from Case semantics to limit authority amplification;
- provider lifecycle/config changes that could delete/transfer authority require the repository's deployment/security owner and separate production evidence.

Production must bound row counts/bytes, receipts, events, evidence and command/result payloads consistently with existing Case contracts and current provider limits.

## 20. Falsifier matrix

The executable artifact `test/d0019-casedo-authority-model.test.mjs` uses the real local `CaseEngine`, `CaseRepository`, store model and durable runner; it is a semantic falsifier, **not** production Cloudflare code. Together with existing durability/reconciliation tests, the acceptance run was `41/41` passing.

| # | Adversarial case | Local oracle | Selected CaseDO model | Evidence/result |
| --- | --- | --- | --- | --- |
| 1 | duplicate command | exact receipt replay, no revision advance | same receipt is durable in authority transaction | pass |
| 2 | same command after response loss | outcome unknown until receipt reread | same request replay after reconstructed adapter returns committed receipt | pass |
| 3 | stale expected revision | reject, no mutation | revision checked before mutation | pass |
| 4 | concurrent commands | one current-revision winner | serialized transaction + revision fence | pass |
| 5 | restart before admission | no receipt/mutation | proven precommit failure leaves store unchanged | pass |
| 6 | restart after durable admission | durable state controls reopen | reconstruct solely from SQLite authority | pass |
| 7 | restart after mutation before response | receipt reread, no second mutation | lost-response model | pass |
| 8 | ambiguous transaction/result | reread / reconcile | receipt/state reread mandatory | pass |
| 9 | running-before-dispatch crash point | running fence durable first | commit before D0020 crossing | pass |
| 10 | duplicate dispatch | fence/effect semantics arbitrate | D0020 carries Attempt fence; CaseDO result acceptance wins | pass at D0019 boundary |
| 11 | stale Attempt result | reject with no change | same result fences | pass |
| 12 | late result after cancellation/terminal | no resurrection | same state machine | pass |
| 13 | accepted result replay | dedupe; contradiction conflicts | same accepted-result identity/digest | pass |
| 14 | Case reopen after eviction | validate + defined reopen transition | reconstruct/reopen from durable storage | pass |
| 15 | corrupt/invalid state | fail closed | initialization fails closed | pass |
| 16 | migration boundary | never two semantic owners | existing Cases not migrated; future cutover requires exclusive durable fence | pass by prohibition; naive Candidate B falsified |

The migration falsifier specifically demonstrated that two stores copied from the same revision can each successfully admit a different command if both remain writable. That is a hard rejection of an unfenced `copy then switch` plan.

## 21. Unverified limits

These are deliberately **not** promoted to accepted facts:

- no production CaseDO source was implemented or deployed in this Design task;
- no live Cloudflare eviction/network-partition/response-loss injection was run against a production adapter;
- the normalized SQLite table/chunk schema is not yet implemented or performance-qualified;
- the repository's exact future Wrangler `exports` versus inherited lifecycle configuration must be resolved from then-current deployment authority during implementation; the two lifecycle mechanisms must not be mixed;
- actual provider account/plan limits are not inferred from generic documentation;
- transaction callback automatic retry behavior is not documented in the located current primary source and is not relied upon;
- D0020 delivery mechanics remain a separate Design/implementation lane;
- D0030 production implementation remains separate;
- current tmcp validation profiles contain known registry drift (`verify:sandbox` / `verify:termux` references not present in current package scripts); validation evidence must report commands actually executed rather than claim a profile is green.

These are production qualification gates, not unresolved public/persistent/security migration questions in the accepted authority model.

## 22. Production implementation gate

Acceptance authorizes a **separate bounded D0019 production implementation Root Task** only if it preserves this contract.

That Task must, at minimum:

1. re-read then-current repository/deployment authority and current Cloudflare primary docs;
2. implement one SQLite-backed CaseDO adapter without creating a local co-owner;
3. define a normalized/chunked bounded SQLite schema compatible with current provider limits;
4. prove atomic receipt + revision + semantic-head + lifecycle mutation;
5. prove duplicate command, stale revision and concurrent-admission parity;
6. inject precommit failure and postcommit response loss and reconcile by authoritative receipt reread;
7. prove eviction/reconstruction/reopen equivalence and corruption fail-closed behavior;
8. prove running-before-D0020-dispatch ordering;
9. prove stale/duplicate result fencing and reconciliation behavior;
10. fail closed on unknown placement/schema/lifecycle state;
11. create no migration path for existing local Cases unless a separate migration/cutover Design has first been accepted;
12. keep D0020 and D0030 production work outside this implementation unless a separately authorized prerequisite is explicitly invoked;
13. independently verify the requested Cloudflare/runtime/deployment layers before calling production verified.

Acceptance is not production verification.

## 23. Acceptance conclusion

D0019 is `accepted` as **Candidate A: CaseDO hosts/adapts the existing D0010/CaseEngine authority**.

The accepted meaning is not “Durable Objects are authoritative.” It is narrower: one SQLite-backed CaseDO may become the physical single owner for a placed Case only when it preserves the existing semantic oracle inside one durable transaction and keeps all competing ownership/projection/effect facts outside that authority.

Candidate B's unfenced migration form is falsified; existing local Cases are not migrated by D0019. Candidate C is unnecessary on present evidence. Duplicate/restart/response-loss/revision/running-before-dispatch/ambiguity behavior, migration prohibition, rollback boundary, D0020 separation and D0030 relationship are frozen tightly enough for a separate production implementation Task.
