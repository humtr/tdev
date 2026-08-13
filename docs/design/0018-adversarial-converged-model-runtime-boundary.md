# Design 0018 — adversarially converged model executor/runtime boundary

- Status: `verified` for the declared supported-Termux trusted-local production source/runtime qualification; the accepted contract remains frozen and provider/platform qualification stays separate
- Capability Group: E — Context delivery and model input
- Canonical authority anchor reviewed: `b048712a372b5a46fb88134690ee57f92981df11`
- Accepted predecessor: D0017 selected context delivery contract
- Prior work recovered: `tmcp/d0018-runtime-boundary-recovery@b9e260391e56c82b6ca6c9ab7965664396da1069`
- Independent Pro package reviewed: reported chain through `5adcc98ce39a99d7adf80bd39e40ffa38a76693a` (commit objects absent from the current repository; package provenance only)
- Accepted implementation scope: exact committed-Event observation, exact live-controller fencing, pre/post-publication and pre-execution authority checks, exact checkpoint-revision drain, and runtime-slot retention through predecessor cleanup/settlement; no model-process warm pool
- Production implementation: `73d404bdc24eac8337019738ba074c2a1fea4861` — bounded C1-C4 repair plus accepted checkpoint-before-live-control handshake alignment
- Executable review falsifiers: `bench/d0018-adversarial-convergence-falsifier.mjs` and `bench/d0018-warm-runtime-qualification.mjs`
- Final adversarial evidence: `docs/evidence/group-e-d0018-final-adversarial-qualification-2026-08-12.json` (`70f6fe7bdfe2554cbc79068ab55b51d31dc93bbbaf22e02eca640881fc973033`)
- Production verification evidence: `docs/evidence/group-e-d0018-production-verification-2026-08-13.json` (`2a1f53043c326ada9618d54ffc8d114b1666f2c25986226637287190948216b7`)

> Acceptance froze the bounded trusted-local runtime contract below. The separate production evidence now verifies that repair on the declared supported-Termux trusted-local source/runtime scope; it does not claim the unavailable hard-link filesystem layer, external-provider qualification, Group E checkpoint election, or Group F implementation.

## 1. Decision

Select **warm host / fresh model Attempt** for the bounded trusted-local profile: one long-lived `GitRepositoryModelExecutor` host may retain only its already-bounded immutable D0014 exact-key repository preparation/cache, while every admitted model Attempt recreates D0017 authorization/reference/carrier resolution, request state, controller/deadline/I/O state, and starts **one fresh trusted-local model process group**. This verdict is `warm-host-qualified-model-attempt-fresh`.

Preserve the accepted D0017 full-semantic-context and authorization-scoped logical-reference contract. Add an exact live-control boundary that is **non-authoritative**, coupled to exact checkpoint-revision accounting and runtime-capacity cleanup semantics. The tested same-process model-runtime candidate is not selected: W01-W08 falsify that WP profile through cross-Case global/module/prototype/environment/listener/timer/async residue and a stale late frame after reassignment.

The prior branch, independent Pro package, adversarial convergence, replacement validation, and W01-W43 qualification were treated as mutually attacking evidence rather than authority. Their surviving synthesis is the contract in this file.

Do not select same-process model/session reuse, a disposable-isolate runtime that the repository does not implement, an external provider, ContextSlice, a new executor queue, Agent semantic authority, or AgentDO semantic authority in D0018.

## 2. Authority and current state

D0018 remains an accepted Class 2 Design and its production implementation is now `verified` on the declared supported-Termux trusted-local source/runtime scope at `73d404bdc24eac8337019738ba074c2a1fea4861`. The lineage entered `implementing` under `SDD.md` before production `src/` changes; verification does not reopen the accepted lifecycle, retry, cancellation, provider, persistence, migration, rollback, warm-boundary, checkpoint or capacity contracts. The exact all-test hard-link and instrumented-coverage layers remain explicitly platform/uninstrumented-timing unqualified rather than being counted green.

CaseEngine remains the authority for Case, Task, Attempt, cancellation, retry eligibility, reconciliation, result acceptance, fences, and terminal state. The runner owns current per-Case ready scheduling, admission capacity, and live execution handles. The executor/transport owns one finite operation, process I/O bounds, transport deadline, and direct-child/descendant cleanup. Neither runner nor transport owns semantic retry.

## 3. Frozen D0017 consumption

D0018 does not reopen D0017.

Logical reference identity remains:

`repositoryCommitOid + semanticBaseDigest + contextDigest + authorizationScopeDigest`

Authorization scope remains:

`caseId + planDigest + caseContractDigest`

Attempt identity, process/session identity, provider identity, physical locator/cache identity, and provider credential are not logical-reference authority. Authorization and stale-binding validation occur before physical carrier/cache bytes are exposed. Full semantic repository context remains required. The packed/hybrid carrier remains local, ephemeral, non-shared, non-durable, and reconstructable from exact authoritative Git source when that source is available.

## 4. One Attempt semantics

One admitted model Attempt has:

1. one CaseEngine Attempt identity and fence;
2. one D0017 authorization-scoped logical resolution;
3. zero or one fresh process-group start — zero if terminal or aborted before spawn;
4. at most one model invocation;
5. one finite transport deadline;
6. one runner-visible executor outcome;
7. zero lower-layer semantic retries;
8. zero executor/provider semantic queue entries;
9. acceptance only through current CaseEngine Attempt/fence/claim/result validation.

A Task retry is a new Attempt, fence, controller, process group, deadline, and invocation. It may reuse exact immutable physical context preparation after per-invocation D0017 authorization is revalidated.

## 5. Host, process, and session lifetime

The selected host may outlive an Attempt only to retain the bounded D0014 `GitRepositoryModelExecutor` preparation cache under its existing exact `(objectFormat, commitOid, baseDigest)` key, immutable-value, single-flight, entry/byte-bound, cancellation, eviction and cold-rebuild contract. That host/cache state is derived performance state, not Task, Attempt, authorization, result, queue, or retry authority.

The model process-group lifetime is scoped to exactly one Attempt. The direct child and descendants terminate on normal response close, authoritative cancellation propagation, timeout, output limit, crash, or runtime shutdown. Every new Attempt gets a fresh model process/module/global/session boundary and a fresh runtime controller/deadline.

No model conversation/session, module-global state, model-internal state, provider SDK session, or arbitrary executable state is reused across Attempts by the selected runtime. Fresh-process selection is semantic isolation for ordinary trusted-local process state, not an OS/container sandbox, tenant-security proof, or physical/confidential memory-zeroization claim.

## 6. Warm qualification and exact reuse boundary

Warm is qualified only after separating host preparation reuse from same-model-process reuse.

Candidate F disables host preparation reuse and still starts one model process per Attempt. Candidate WH reuses one `GitRepositoryModelExecutor` host and bounded immutable D0014 preparation, but recreates D0017 logical reference/authorization/carrier, canonical request, controller, deadline/I/O and model process per Attempt. Candidate WP reuses the same model/runtime process across Attempts. WI has no current disposable-isolate substrate. PS has no selected provider/session substrate.

W01-W43 expectations were recorded before the new qualification run. Under exact current source, the F/WH differential produced equal canonical Case digest, equal model observation ignoring diagnostic PID, equal logical reference ID for the same Case/scope, equal authorization-scope digest, equal context digest, and equal request bytes. Four F samples materialized repository context four times; four WH samples materialized it once. Both started four model processes and reused zero model processes. Thus WH's structural gain is repository preparation reuse, not model-process warmth.

WP failed W01-W08: the reused process exposed prior Case global, module singleton, prototype, environment/cwd, listener, timer and delayed-async state and emitted a stale frame after reassignment. This rejects the tested same-process profile without claiming that every possible future constrained resettable runtime is impossible. WI and PS are `unavailable`, not failed or qualified.

Primary verdict: **`warm-host-qualified-model-attempt-fresh`**. Performance timing from the deterministic Node worker is wall-clock diagnostic evidence only; there is no real model inference/provider round-trip or production latency SLO in this Design.

## 7. Retry, queue, and capacity

CaseEngine/Task lifecycle is the sole semantic retry owner.

Semantic retry eligibility begins only after the predecessor Attempt is terminal. **Runtime capacity is a separate gate:** an aborted/terminal predecessor continues to occupy a runtime capacity slot until its execution handle/process group has cleaned up and settled. A retry may be semantically eligible while waiting for that slot; it must not create an `(N+1)`th live controller/process at capacity N.

Capacity 1 is N=1 of the same admission algorithm. Capacity N permits at most N live execution handles and at most N process groups. Waiting work remains in the runner-owned ready/admission mechanism. The executor, transport, provider, warm receiver, and Agent do not introduce a second semantic queue.

## 8. Stable live-control identity and accepted observation API

A stable registry key contains the fields needed to distinguish the exact live execution:

- `caseId`;
- `taskId`;
- `attemptId`;
- fencing token;
- `executorId`;
- `executorEpoch`.

The `AbortController` object is **not** serialized as part of the stable key. Its object identity is a local compare-and-delete token: unregister succeeds only when both the stable key and the currently stored controller object match. This closes stale-unregister ABA without treating an object reference as durable or semantic identity. Process ID, context digest, reference ID, cache identity, worker generation, and Attempt ordinal alone are insufficient live-control keys.

The accepted lifecycle wake surface is a transient `CaseEngine` **committed-Event observer**. Production may name the method according to repository style, but its semantic shape is frozen: a runner subscribes to immutable Event batches published only after the outer engine mutation has successfully passed incremental invariants and performance-index refresh; rolled-back Events are never observed. The observer is not persisted and is not replayed on restore. Callback invocation is best-effort/non-awaited; synchronous throw and promise rejection are contained and an unresolved callback promise is never awaited. The runner treats the Event only as a wake hint, extracts candidate `attemptId`/revision, rereads the authoritative Attempt, constructs the full stable live key from current Attempt identity, and aborts only an exact matching registered controller when the authoritative Attempt is terminal.

This uses the repository's existing semantic Event boundary instead of inventing a second command bus, durable notification log, polling scheduler, or lifecycle owner.

## 9. Cancellation contract

Cancellation ordering is:

1. CaseEngine commits the authoritative semantic transition.
2. A non-blocking local observation/wake is attempted with exact stable live-control identity and committed revision.
3. The runner rechecks current authority and aborts only the exact matching live controller.
4. The executor terminates the exact process group and descendants.
5. Any response remains subject to CaseEngine late-result fencing.

The observation/wake is not durable state and not authority. Throw, rejection, duplicate delivery, stale delivery, or no target before publication cannot mutate semantic state.

### 9.1 Registration/spawn handshake

The runner must:

1. start/admit the Attempt under CaseEngine authority;
2. checkpoint the exact `attempt_started` snapshot revision;
3. re-read Attempt authority after the awaited checkpoint;
4. create a fresh controller only for a still-live Attempt;
5. re-read authority immediately before registry publication;
6. publish the exact key/controller binding;
7. re-read authority immediately after publication;
8. re-read authority before D0017 preparation/resolution and before process spawn;
9. spawn at most once only while authority remains nonterminal and signal remains live;
10. unregister with stable-key + controller-object compare-and-delete.

A cancellation that wins before publication produces zero model process starts. A cancellation that wins after executor entry but before transport spawn produces zero process starts. Cancellation during preparation/resolution produces zero model invocations. Cancellation after child output but before result acceptance remains authoritative and the output is rejected.

### 9.2 Notification loss and reconciliation

Pre-publication missed edges are closed by level checks in the handshake. After publication, the committed-Event observation path normally wakes the matching handle, but its callback remains best-effort/non-authoritative.

Authority is rechecked after awaited hooks/checkpoints, before and after live-controller publication, before D0017 preparation/resolution and process spawn, after executor settlement, at normal scheduler/admission boundaries, and during shutdown. These are bounded checks attached to existing control flow; they must not become a hidden polling scheduler or new queue owner.

Current normative owners define no stronger post-publication lost-wake cleanup SLO than the existing finite transport deadline plus those normal reconciliation boundaries. Therefore D0018 adds **no periodic polling/timer scheduler**. Semantic safety is immediate through authoritative terminal state and late-result fencing; if a wake is genuinely lost while no other control-flow boundary occurs, the finite transport deadline is the outer cleanup bound. A future stronger cleanup SLO is a new accepted contract and must name the mechanism, timer/reconciliation owner, maximum bound, resource cost, shutdown behavior and retry interaction.

## 10. Checkpoint revision contract

The current runner bug must not survive implementation. Checkpointing remains one runner-owned serialized lane.

- capture one immutable `snapshot` and `persistedRevision = snapshot.caseRevision` together;
- build checkpoint metadata from that same revision, not from a later live engine revision;
- await persistence of that exact snapshot;
- after persistence, set `checkpointedRevision = persistedRevision` only;
- never assign `checkpointedRevision = engine.caseRevision` merely because asynchronous I/O returned;
- if `engine.caseRevision > checkpointedRevision` after I/O, loop/drain a newer exact snapshot before dispatching work that depends on the stale checkpoint and before a terminal return that would otherwise leave the newer revision unpersisted;
- multiple rapid semantic transitions may be coalesced only by actually persisting a later snapshot; no unpersisted revision may be falsely acknowledged;
- cancellation that wins during `attempt_started` persistence must be included in that drain, then the runner rereads Attempt authority and performs zero executor/model invocation.

Committed-Event observation metadata does not substitute for durable checkpointing.

## 11. Timeout, crash, shutdown, and descendant cleanup

Transport timeout kills the exact process group and returns one typed transport outcome. It does not select a semantic Task state or start a retry. A timeout cannot overwrite an already committed cancellation.

Spawn failure, crash, non-zero exit, framing failure, and output limit return one bounded transport failure; CaseEngine applies effect-class/reconciliation/retry rules.

Runtime shutdown aborts registered live transport and prevents new runtime admission. Shutdown is liveness control, not a semantic terminal label. CaseEngine remains responsible for failure/cancellation/reconciliation semantics.

On supported POSIX deployment, cleanup includes descendants, including the case where a direct child exits while a descendant retains inherited stdout/stderr pipes. Non-POSIX equivalence remains an environment-specific verification requirement.

## 12. Late-result fencing

Cancellation cleanup is not semantic safety. Semantic safety remains the existing Attempt/fence/claim/result acceptance path. A result from a terminal, stale, superseded, wrong-fence, or wrong-executor-epoch Attempt is rejected even if the process had already produced output before cleanup.

## 13. Physical cache and logical authorization

Physical dedupe and logical authority remain separate.

Identical content may occupy one derived physical cache entry across Cases, but every invocation independently validates its D0017 authorization scope before any carrier/cache read. Same content with different scope produces distinct logical reference IDs. Copied references and stale scopes fail before byte exposure. Corrupt derived cache content is rejected/evicted and cannot authorize access; a later valid request may rebuild from authoritative source.

Cache possession, digest equality, process survival, and reference possession are never authority.

## 14. Restart and D0022

With authoritative Git source available, carrier/cache loss and cold receiver restart may rebuild exact semantic bytes and the same logical reference when all D0017 identity facts are unchanged.

With authoritative source intentionally unavailable, resolution must fail closed with a typed reference/source failure and zero model invocation; there is no hidden inline fallback.

D0022 is **not activated by current correctness semantics alone** because current authority does not require offline restart, cross-worker shared availability, execution while authoritative source is unavailable, or a stronger reconstruction SLA. D0022 becomes required before a later accepted contract introduces one of those requirements or durable/shared content state/provider handoff.

## 15. ContextSlice

ContextSlice remains unselected. D0017 freezes full semantic repository context and no accepted representative completeness/quality threshold authorizes slicing.

## 16. Agent and AgentDO

A future authenticated local Agent may host the same one-Attempt/one-fresh-operation transport semantics, exact cancellation control, resource enforcement, and D0017 resolution. It does not own Task/Attempt semantic state, retry, result authority, or logical authorization.

A future AgentDO may own aggregate connection/capacity/delivery topology under later accepted Designs. It does not own Task/Attempt authority. D0018 does not preempt later aggregate scheduling contracts.

## 17. External provider and security

No external provider is selected or qualified. Trusted-local execution remains the selected security boundary.

Provider selection requires one exact provider/endpoint and accepted contracts for IAM/authentication, secret ownership/rotation, full-context egress/minimum-necessary policy, privacy, retention, residency, training use, billing/accounting, retry charging, timeout/cancellation semantics, rate/queue ownership, incident response, and rollback. Until then, repository context is not authorized for external egress by D0018.

## 18. Persistence, migration, rollout, rollback

The converged design introduces no persisted Case/Plan/Task/Attempt/result schema and no durable controller/notification/queue/cache state. Correct checkpoint revision accounting changes behavior but not snapshot schema.

The lifecycle-observation/wake boundary is observable Class 2 behavior. It must be explicitly accepted before production implementation; it is not smuggled in as a private optimization.

After owner acceptance, implementation order is:

1. failing source-level cancellation/checkpoint/capacity tests;
2. minimum production fix;
3. focused regressions;
4. exact source gate;
5. docs/evidence synchronization.

Rollback restores the previous fresh-process implementation without data migration. It reintroduces delayed cancellation cleanup, the pre-registration launch window, and the checkpoint-revision acknowledgement defect; therefore rollback is compatibility recovery, not behaviorally equivalent liveness/durability.

## 19. Accepted implementation acceptance matrix and cheapest falsifiers

The Design-acceptance evidence is executable. Before production status can become `verified`, source-level or transport-level regressions must cover at least:

- cancel before controller registration;
- cancel after registration but before executor invocation;
- cancel after executor entry but before process spawn;
- cancel during D0017 preparation;
- cancel during logical authorization before carrier access;
- cancel during pack/reference resolution;
- cancel after child output before result acceptance;
- retry only after predecessor terminal, with runtime slot reused only after predecessor handle cleanup;
- previous late response versus retry;
- stale cancellation notification versus retry;
- stale unregister ABA;
- capacity N simultaneous cancel/retry without `(N+1)` live runtime handles;
- same physical bytes/different authorization scopes;
- copied reference across Case;
- stale scope with valid physical cache;
- corrupt cache then valid rebuild;
- cache loss between retry Attempts;
- cold restart with authoritative source available;
- cold restart with source unavailable and no fallback;
- timeout versus cancellation;
- shutdown versus cancellation;
- direct child exit with descendant-held pipes;
- observation callback hangs/throws/rejects;
- blocked checkpoint while semantic revision advances;
- old snapshot persistence followed by newer revision drain;
- multiple rapid transitions while one checkpoint is outstanding.

The convergence harness implements 27 deterministic design falsifiers and reproduces C1-C3 on the exact current engine/runner blobs. The warm harness predeclares and executes W01-W43, including F/WH differential, tested-WP contamination, capacity/retry/auth/cache/restart/shutdown/observation cases and fixed randomized seeds. C4 is frozen by the runtime-slot falsifier: semantic retry eligibility does not return predecessor runtime capacity before its execution handle/process cleanup and settlement.

The production regression floor is the requested 16 fresh/runner tests: cancel-before-registration zero invocation; cancel during `attempt_started` zero invocation; cancel after registration/pre-spawn zero process; in-flight cleanup; late-result rejection; stale cancellation; stale unregister; exact persisted checkpoint revision; newer revision drained before dependent dispatch; capacity N no N+1 during cleanup; retry no inherited abort; timeout cannot overwrite cancellation; shutdown liveness-only; descendant-held inherited-pipe cleanup; observation callback throw/reject/hang isolation; D0017 authorization before physical access. Because WH is selected, retain additional tests proving fresh child/reset isolation, no reuse of poisoned same-process worker, no stale frame reassignment, ABA fencing, cancellation/timeout during cleanup boundaries, capacity while cleanup is outstanding, long-sequence isolation and cold restart/rebuild.

## 20. Unsupported environments and remaining unknowns

Unsupported/unavailable are not green:

- this connected Termux filesystem is not qualified for `ImmutableJournalSnapshotStore` hard-link publication (`link(2) EACCES`); D0018 supported-Termux validation excludes only that pre-existing adapter-specific file while exact all-test coverage remains platform-unqualified;
- WI is unavailable because no disposable-isolate runtime exists in current source;
- PS/external-provider session qualification is unavailable because no provider is selected;
- non-POSIX descendant termination equivalence remains unknown;
- future Agent/AgentDO aggregate topology and distributed capacity owner remain later Design work;
- exact external provider security/economic contract remains unknown until a provider is selected;
- real-model inference latency/memory/tokenizer/quality behavior is unmeasured;
- any future source-unavailable/offline/cross-worker availability requirement may activate D0022;
- any future accepted completeness/quality threshold may reopen ContextSlice.

## 21. Status vocabulary

- independently diagnosed: **yes**
- experimentally supported: **yes, for exact current-source defects, WH bounded-profile qualification, tested-WP falsification, prior structural measurements and declared falsifiers**
- prototype/review harness implemented: **yes, non-production only**
- draft designed: **yes, historical stage completed**
- accepted: **yes — bounded contract in this file**
- implementing: **no — requires successor/integration Task and explicit status transition before production `src/` changes**
- production implemented: **no**
- D0018 source verified: **no production repair exists yet**
- D0018 environment verified: **no; current evidence is supported-Termux source/review qualification with the explicit ImmutableJournal filesystem exclusion**
- provider verified: **no / not applicable to selected local profile**
- prior work independently reviewed: **yes, exact prior branch/commits/blobs recovered; Pro package independently reviewed as external evidence**
- Group E engineering complete: **no**
- Group E checkpoint elected: **no**

## 22. Acceptance record

Acceptance is recorded under `SDD.md` after freezing the exact runtime, lifecycle observation, checkpoint, capacity, warm, lost-wake, security, migration, rollback and provider-status contracts above. Direct evidence is `docs/evidence/group-e-d0018-final-adversarial-qualification-2026-08-12.json` with SHA-256 `70f6fe7bdfe2554cbc79068ab55b51d31dc93bbbaf22e02eca640881fc973033`; replacement validation is `docs/evidence/group-e-d0018-convergence-validation-2026-08-12.json` with SHA-256 `7bbab3ed53f5c777d6d22e0903ef0ba65959d4accf6b63448bd7b15fcca3c6ba`; warm qualification is `docs/evidence/group-e-d0018-warm-runtime-qualification-2026-08-12.json` with SHA-256 `3f1e7dec8ba803fa4601d72a49c93402f4d301b1f012369d29c9a6fed51c8027`.

Acceptance authorizes only the smallest coherent C1-C4 production repair and the transient committed-Event observation/live-control machinery required by it. It does not authorize same-model-process warm pools, provider abstraction, Agent/AgentDO implementation, ContextSlice, D0022 storage, hidden polling, a second queue, executor/provider retry, or unrelated source changes. Production implementation must first enter `implementing` on the active Group E integration lineage.
