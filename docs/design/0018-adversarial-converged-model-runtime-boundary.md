# Design 0018 — adversarially converged model executor/runtime boundary

- Status: `draft` (**not accepted**)
- Capability Group: E — Context delivery and model input
- Canonical authority anchor reviewed: `b048712a372b5a46fb88134690ee57f92981df11`
- Accepted predecessor: D0017 selected context delivery contract
- Prior work recovered: `tmcp/d0018-runtime-boundary-recovery@b9e260391e56c82b6ca6c9ab7965664396da1069`
- Independent Pro package reviewed: reported chain through `5adcc98ce39a99d7adf80bd39e40ffa38a76693a` (commit objects absent from the current repository; package provenance only)
- Production-source change authorized by this document: **none**
- Production implementation in this review: **none**
- Executable review falsifier: `bench/d0018-adversarial-convergence-falsifier.mjs`

> This draft is the result of adversarial comparison, not owner acceptance. It does not claim D0018 accepted, production implemented, provider verified, Group E complete, or full source gate green.

## 1. Decision

Select **one fresh trusted-local process group per admitted model Attempt**. Preserve the accepted D0017 full-semantic-context and authorization-scoped logical-reference contract. Add an exact live-control boundary that is **non-authoritative**, coupled to exact checkpoint-revision accounting and explicit runtime-capacity cleanup semantics.

The prior draft and Pro draft each contain necessary semantics, but neither is sufficient unchanged. This draft therefore records a `hybrid-required` convergence.

Do not select a warm model/session process, external provider, ContextSlice, new executor queue, Agent semantic authority, or AgentDO semantic authority in D0018.

## 2. Authority and current state

D0018 is currently planned/required and has no accepted/implementing owner Design. Under `SDD.md`, the lifecycle, retry, cancellation, provider, persistence, migration, and rollback behavior here is Class 2. Production `src/` implementation is prohibited until the owner accepts the Design and explicitly authorizes implementation.

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

## 5. Process and session lifetime

Fresh trusted-local process-group lifetime is scoped to one Attempt. The direct child and descendants terminate on normal response close, authoritative cancellation propagation, timeout, output limit, crash, or runtime shutdown.

No model conversation/session, module-global state, model-internal state, provider SDK session, or arbitrary executable state is reused across Attempts by the selected runtime.

Fresh-process selection is an isolation/reset boundary for ordinary process state, not an OS/container sandbox or tenant-security proof.

## 6. Warm candidate

Warm receives a fair but conditional result.

Prior exact-source reruns preserve the structural advantage: four fresh retries start four processes; the experimental warm receiver starts one and reuses it three times while preserving the same model-visible semantic bytes. The prior benchmark also reports approximately 67.69% lower amortized boundary bytes after one prime. Pro fixture measurements show large process-start latency savings.

Those measurements do not prove semantic eligibility. Cross-Case process-global state was observed in the Pro warm receiver, and neither prior nor Pro proves reset of model internal state, conversation/session state, provider SDK state, module globals, or arbitrary model executable state. Therefore warm is **not production-selected**. A future constrained warm runtime may be reconsidered only under an accepted reset/isolation contract with direct falsifiers for all required reset domains.

## 7. Retry, queue, and capacity

CaseEngine/Task lifecycle is the sole semantic retry owner.

Semantic retry eligibility begins only after the predecessor Attempt is terminal. **Runtime capacity is a separate gate:** an aborted/terminal predecessor continues to occupy a runtime capacity slot until its execution handle/process group has cleaned up and settled. A retry may be semantically eligible while waiting for that slot; it must not create an `(N+1)`th live controller/process at capacity N.

Capacity 1 is N=1 of the same admission algorithm. Capacity N permits at most N live execution handles and at most N process groups. Waiting work remains in the runner-owned ready/admission mechanism. The executor, transport, provider, warm receiver, and Agent do not introduce a second semantic queue.

## 8. Stable live-control identity

A stable registry key contains the fields needed to distinguish the exact live execution:

- `caseId`;
- `taskId`;
- `attemptId`;
- fencing token;
- `executorId`;
- `executorEpoch`.

The `AbortController` object is **not** serialized as part of the stable key. Its object identity is a local compare-and-delete token: unregister succeeds only when both the stable key and the currently stored controller object match. This closes stale-unregister ABA without treating an object reference as durable or semantic identity.

Process ID, context digest, reference ID, cache identity, and Attempt ordinal alone are insufficient live-control keys.

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

Pre-publication missed edges are closed by level checks in the handshake. After publication, the normal in-process observation path is expected to wake the matching handle, but its callback remains best-effort/non-authoritative.

Authority is rechecked at scheduler/admission wakes, after awaited hooks/checkpoints, before preparation/resolution/spawn, after executor settlement, and during shutdown. These are bounded authority checks attached to existing control flow; they must not become a hidden polling scheduler or new queue owner.

If the owner requires a prompt cleanup bound even when a post-publication observation is actually dropped and no other scheduler wake occurs, that requires an explicit accepted cancellation-latency/SLO mechanism (for example a bounded reconciliation timer). This draft does not invent an interval or new scheduler owner. Without that additional SLO, semantic safety remains immediate while the existing finite transport deadline is the outer liveness bound for a lost post-publication wake.

## 10. Checkpoint revision contract

The current runner bug must not survive implementation.

- capture one immutable snapshot and its `caseRevision` together;
- persist that exact snapshot;
- after persistence, set `checkpointedRevision` only to the revision that was actually persisted;
- never assign `checkpointedRevision = engine.caseRevision` merely because asynchronous I/O returned;
- if CaseEngine advanced while persistence was outstanding, drain/reconcile a newer snapshot before dispatching work that depends on the stale checkpoint and before a terminal return that would otherwise leave the newer revision unpersisted;
- multiple rapid semantic transitions may be coalesced by persisting a latest snapshot, but no unpersisted revision may be falsely acknowledged.

Notification metadata does not substitute for durable checkpointing.

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

## 19. Acceptance falsifiers

Before this Design can be accepted for implementation, at least the following must be source-level or transport-level tests where applicable:

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

The review harness implements all 27 as deterministic non-production design falsifiers and separately reproduces the two current-source failures on exact canonical engine/runner blobs.

## 20. Remaining unknowns

- exact accepted shape/visibility of the lifecycle-observation API;
- whether a post-publication lost-observation cleanup SLO stronger than the finite transport timeout is required, and if so its bound/mechanism;
- production cancellation cleanup latency SLO;
- non-POSIX descendant termination equivalence;
- future Agent/AgentDO aggregate topology;
- exact external provider and security/economic contract;
- real-model latency/memory/tokenizer/reset behavior;
- any future source-unavailable/offline/cross-worker availability requirement that activates D0022;
- any accepted quality threshold that could reopen ContextSlice.

## 21. Status vocabulary

- independently diagnosed: **yes**
- experimentally supported: **yes, for the exact current-source failures, prior structural benchmark, and declared non-production falsifiers**
- prototype implemented: **yes, non-production review falsifier only**
- draft designed: **yes**
- accepted: **no**
- production implemented: **no**
- source verified for a D0018 production change: **no production change exists**
- provider verified: **no**
- prior work independently reviewed: **yes, exact branch/commits/blobs recovered**
