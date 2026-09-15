# C1 — managed-execution lifecycle and operational-ref convergence

Status: active execution aid

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. Mutable repository/runtime/provider IDs, counts and workflow states written in chat or old evidence are never authority. Revise this plan when current evidence changes the best execution path; do not revise authority merely to preserve this plan.

## 1. Campaign outcome and boundary

C1 has one bounded purpose: make the managed execution resource lifecycle correct, bounded and observable before broader product convergence continues.

Required end state:

- provider-terminal managed sessions converge to correct retained tdev terminal/session state without relying on pool pressure, elapsed age or blind timeout assumptions;
- operational execution refs under the currently selected managed-execution namespace are retired automatically after owner-authorized terminal evidence is sufficient, as D0006 already requires;
- the historical operational-ref backlog is removed with a prefix-locked procedure that cannot target canonical `dev-2` or unrelated refs, after current executor activity is positively quiescent;
- cleanup readback proves the canonical `dev-2` ref remains exactly unchanged and the targeted stale operational namespace is absent except for refs justified by currently active execution;
- a never-assigned logical validation assignment cannot create unexplained or runaway replacement-session/ref churn; replacement remains a resource recovery mechanism rather than normal retry amplification;
- the historical managed-session `UNAUTHORIZED` failure is localized and either repaired if it participates in replacement/full-validation amplification, or explicitly falsified as unrelated/currently absent;
- required validation semantics, assignment identity, OIDC/run fencing, exact source/result identity and canonical integration remain at least as strict as before; and
- a bounded live acceptance demonstrates justified session creation, terminal convergence and ref retirement without a growing operational branch residue.

C1 does **not** implement multi-repository/ref support, broad `dev-2`/`dev2` -> `tdev` identity migration, source/context payload deduplication, final whole-product convergence or `main` promotion. Those are C2.

## 2. Existing semantic owners

C1 starts from existing ownership rather than creating a campaign-specific Design.

- D0006 owns managed execution topology, auxiliary execution refs, terminal ref retirement, idle retirement and never-assigned resource replacement.
- D0005 owns managed executor trust, authorization and credential boundaries.
- D0001/D0003 are consulted only where durable work/recovery or required-validation identity actually changes.

D0006 already states that operational execution refs are deleted after the exact selected run is terminal and retained session evidence is sufficient. The current absence of provider ref deletion is therefore initially treated as an implementation mismatch, not a reason to invent a new ref-lifecycle owner. D0006 also records a 64-entry replacement-history bound; that bound is storage/retry policy, not evidence that dozens of replacements are acceptable normal behavior.

If fresh evidence shows the accepted lifecycle/replacement semantics themselves are wrong, revise the existing owner before dependent implementation. Do not create a new Design solely because C1 discovered the defect.

## 3. Durable execution and resume rules

Campaign identity is `C1`. Active route identities are `C1-1` and `C1-2`; detailed identities use `C1-1.<k>` and `C1-2.<k>`. Previously issued `C1-3` through `C1-6` remain historical trace identities redirected to C2 and are never reused.

For every fresh session:

1. bind current repository authority with `dev_context`;
2. read `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, `WORKBOARD.md`, `docs/campaign/route-map.md`, then this plan;
3. read current D0005/D0006 and any other existing owner selected by the active checkpoint;
4. freshly observe provider workflow runs, managed sessions, operational refs, runtime identity and open Work/Action/request/effect state;
5. reconcile those durable states before admitting new mutations or replacement operations; and
6. continue through subsequent C1 checkpoints when safe instead of stopping after a local diagnosis or one repaired test.

Do not store mutable HEAD, ref counts, release IDs, provider run IDs, session IDs, Work IDs or Action IDs here as current truth.

## 4. Global invariants and stop conditions

Across C1:

- canonical `refs/heads/dev-2` must never be an argument or match target of operational-ref cleanup; record its exact current SHA immediately before destructive cleanup and verify the same SHA immediately after;
- cleanup is namespace-locked to the exact managed-execution operational prefix selected by current D0006/runtime configuration; never expose a generic arbitrary-branch deletion capability merely to implement C1;
- do not bulk-delete while any matching executor run is queued, waiting, pending or in progress, or while current ownership of launch effects is uncertain;
- do not infer terminality from ref age, session age, missing UI activity, timeout expiry or branch ahead/behind values;
- do not create replacement sessions for offered/running/uncertain assignments or after ownership/deadline changed;
- do not hide `UNAUTHORIZED` or provider-stop defects with blind retries, longer timeouts or repeated whole-validation replays;
- do not reduce required validation or weaken exact source/result/run/assignment fencing to obtain fewer refs or lower cost;
- do not expand into C2 work merely because a touched file contains `dev2` naming; C1 may preserve current operational names while repairing their lifecycle;
- use bounded falsifiers before expensive repeated validation; and
- stop only for a genuine external permission/provider/user-action blocker, a safety boundary current authority cannot resolve, or completed C1.

## 5. C1-1 — terminal/session truth and operational-ref lifecycle

Purpose: make physical provider termination, retained session state and operational execution refs converge under one owner-correct lifecycle, then remove the accumulated stale operational namespace safely.

### C1-1.1 Fresh baseline and exact inventory

- Rebind current repository/runtime/provider state and exact canonical `dev-2` SHA.
- Observe current managed-session states and current executor workflow runs, separating terminal from queued/waiting/pending/in-progress states.
- Enumerate the current managed-execution operational ref namespace by prefix and group refs by target commit when useful; do not perform per-ref historical forensics merely because the backlog is large.
- Reproduce or falsify provider-terminal sessions remaining logically retained and identify whether stale refs correlate with the same missing terminal lifecycle path.
- Measure only the bounded facts needed for C1 decisions: current matching ref count, active matching run count, terminal/session mismatch count if observable, provider calls and lifecycle timing.

Exit: current lifecycle shape and the safe preconditions for mutation are known.

### C1-1.2 Owner and trigger localization

- Trace session close/providerStopped/stop-before-assignment, idle retirement, reconciliation triggers and current provider ref operations.
- Confirm whether ref creation is immutable/create-only while terminal deletion is simply absent from implementation despite D0006 requiring it.
- Determine when retained terminal evidence becomes sufficient to delete the exact operational ref and how response loss on deletion is reconciled.
- Test whether terminal reconciliation currently depends on pool pressure or another narrow trigger that can leave stale capacity/session projections.

Exit: first-order implementation gaps and existing-owner invariants are explicit.

### C1-1.3 Lifecycle repair design classification

- Treat missing behavior already required by D0006/D0005 as Direct repair where semantics remain unchanged.
- If deletion certainty, terminal ownership or lifecycle state meaning must change, revise D0006/D0005 as applicable before code.
- The deletion primitive must be exact-repository, exact-prefix and exact-session/ref fenced; it must not become a general Git branch deletion surface.
- Define retry semantics so already-absent exact operational refs are idempotent cleanup success only when the retained intent proves the caller owns that exact ref lifecycle.

### C1-1.4 Minimal repair and focused tests

Implement the smallest owner-correct repair and tests covering at least:

- provider-terminal -> retained terminal/session convergence;
- selected-run terminal ref retirement;
- terminal-before-assignment ref retirement;
- idle retirement with no pending dispatch;
- deletion response loss followed by exact absence readback;
- repeated cleanup of the same exact owned ref;
- wrong prefix, wrong session, wrong target/repository and canonical `dev-2` deletion rejection;
- concurrent dispatch versus retirement ordering; and
- no provider polling amplification that costs more than the resource leak it repairs.

### C1-1.5 Required validation, integration and runtime acceptance

- Run focused diagnostics first where cheaper.
- Run complete required validation for the exact final candidate.
- Integrate the exact validated result and read back canonical completion.
- Stage/activate only if current release ownership requires runtime activation before the fixed managed path can be exercised.
- Prove with a bounded live managed execution that a newly created operational ref is retired after terminal convergence and does not leave a permanent branch.

### C1-1.6 Historical operational-ref backlog cleanup

After the fixed lifecycle path is current and current executor activity is positively quiescent:

1. record exact canonical `dev-2` SHA and exact operational prefix;
2. prevent or fence new managed launches for the cleanup window through the current owner-defined mechanism;
3. freshly confirm zero queued/waiting/pending/in-progress workflow runs for the targeted executor namespace;
4. delete the entire stale operational-ref prefix as a namespace operation or bounded exact enumeration, without individual provenance review;
5. read back that the targeted stale namespace is empty;
6. read back that canonical `dev-2` is present at the exact pre-cleanup SHA; and
7. restore normal managed admission and exercise one bounded launch/terminal/retirement cycle.

Do not include `dev2-containment/*`, review branches, canonical branches or any namespace not explicitly owned as C1 operational execution refs.

Exit: current lifecycle is repaired and the historical execution-ref residue is gone without canonical-ref movement.

## 6. C1-2 — replacement churn and authorization/retry amplification

Purpose: ensure a logical validation assignment consumes only justified physical execution resources and cannot amplify provider/session/ref operations through a hidden replacement or authorization loop.

### C1-2.1 Bounded fresh reproduction and accounting

- Run the smallest representative validation that exercises required managed profiles after C1-1 repair.
- Correlate logical assignments with physical session IDs, operational refs, provider workflow runs, replacements and terminal outcomes.
- Establish the expected normal ratio for the exercised shape rather than assuming one session per profile or accepting the 64-entry history limit as normal churn.
- Reproduce or falsify the historical `UNAUTHORIZED` failure and determine whether it occurs before assignment, after provider run selection, during OIDC/native join, lease/assignment authorization or another exact stage.

### C1-2.2 Replacement-loop root cause

- Trace every condition that can close a selected provider session before assignment and trigger `replaceUnassigned()`.
- Verify that an immutable logical assignment is preserved across replacement and that replacement cannot occur after offer/run/uncertainty.
- Identify why repeated never-assigned sessions are created when churn occurs: provider startup/termination, authorization mismatch, lifecycle projection, remaining-lifetime mismatch, cancellation race or another first-order cause.
- Falsify competing hypotheses with bounded negative/positive probes instead of repeatedly running the full suite.

### C1-2.3 Existing-owner decision

- If D0005/D0006 already require the correct behavior, make a Direct bug repair.
- If accepted replacement or authorization semantics themselves permit harmful amplification, minimally revise the existing owner; do not add a churn/cost Design for chronology.
- Preserve bounded response-loss recovery. Reducing churn must not convert uncertain prior execution into unsafe replay.

### C1-2.4 Repair and regression protection

Add deterministic coverage appropriate to the localized cause, including:

- exact failing authorization stage and successful counterpart;
- expiry/replay/wrong-run/wrong-session negative cases where relevant;
- provider stop before first assignment followed by one justified replacement;
- repeated pre-assignment failure bounded by explicit policy and original action/input deadline;
- no replacement after an assignment was offered/running/stopped or provider state is uncertain;
- replacement-history retention without treating its maximum bound as a target retry count; and
- cancellation/terminal cleanup retiring every operational ref created by the tested replacement chain.

### C1-2.5 Required validation and live measured acceptance

- Run complete required validation for the exact repaired candidate and integrate/read back the exact result.
- Perform a bounded live managed validation and report logical assignments, physical sessions, replacements, workflow runs, operational refs created/retired, retries, wall time and remaining uncertainty.
- Acceptance requires no unexplained session/ref amplification, no historical whole-validation replay caused by the targeted `UNAUTHORIZED` path in the tested shape, and no retained operational refs after all matching live executor runs are terminal.

### C1-2.6 C1 closeout and C2 handoff

- Confirm permanent lifecycle facts live in existing Designs/source/config/tests rather than only in this campaign plan/evidence.
- Verify a fresh session can understand and safely operate the repaired managed lifecycle without historical C1 evidence.
- Prune redundant C1-only evidence when it has no continuing value.
- Update `WORKBOARD.md` to active campaign `C2` and its first current checkpoint only after C1 acceptance is complete.

C1 completion does not claim multi-repository support, final product naming convergence, payload deduplication, broad final cost superiority or `main` promotion.

## 7. Reporting contract

At each material checkpoint report current facts only: lifecycle defect or falsifier, exact owner/implementation changed, operational-ref effect, managed-session/ref/run counts for the bounded exercised shape, validation/live layer actually proven, remaining unknowns and the next C1 checkpoint identity. At C1 completion report the exact canonical branch readback, whether the stale execution-ref namespace is empty, measured replacement/ref churn in the accepted live shape and any explicitly deferred managed-execution unknowns before C2 begins.
