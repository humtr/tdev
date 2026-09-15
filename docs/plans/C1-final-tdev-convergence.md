# C1 — final tdev product convergence and main promotion

Status: active execution aid

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. Mutable repository/runtime/provider IDs written in chat or old evidence are never authority. Revise this plan when current evidence changes the best execution path; do not revise authority merely to preserve this plan.

## 1. Campaign outcome

C1 converges the current development line into the final `tdev` product before promotion to `main`.

Required end state:

- managed-session lifecycle truth is reconciled without blind age-based cleanup;
- the observed managed-session `UNAUTHORIZED` retry amplification has a localized, repaired and live-accepted first-order cause, or a current falsifier proves the old observation no longer represents a product defect;
- one canonical `tdev` installation/runtime/public MCP service can work concurrently with multiple explicitly authorized repository/ref bindings without per-repository runtime fragmentation;
- branch/codename-derived `dev-2`, `dev2` and `DEV2` product/protocol/internal/deployment naming is removed or migrated to `tdev` wherever it is not truthful historical branch/evidence text;
- repeated source/context bytes across required validation assignments are reduced only after repository-aware authorization/isolation semantics are available;
- required correctness/security/validation/recovery invariants remain unchanged or are explicitly revised through their existing Design owner;
- a bounded post-change cost observation records material remaining waste without constructing a new qualification subsystem; and
- the exact final validated product state is promoted to `main`, canonical self-development is moved to the verified `main` binding, and ordinary self-development smoke acceptance succeeds there.

Substantive unfinished development stays on the current development line. `main` promotion is a final exact-state transition, not the start of another development phase.

## 2. Durable execution and resume rules

Campaign identity is `C1`. Checkpoints use `C1-<n>` and detailed checkpoints use `C1-<n>.<k>`. Issued identities are never renumbered or reused. If a later discovery adds work, give it a new unused identity and let WORKBOARD record execution order.

For every fresh session:

1. bind current repository authority with `dev_context`;
2. read `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, `WORKBOARD.md`, then this plan;
3. read only existing Designs relevant to the active checkpoint;
4. observe current runtime/provider/open Work/Action/request/effect state;
5. reconcile that durable state with WORKBOARD before admitting new mutations;
6. reuse a stable request identity only for retry/recovery of the same logical intent; and
7. continue through subsequent checkpoints when safe instead of stopping after one local success.

Do not store mutable HEAD, release, provider version, session, Work or Action IDs here as current truth. If a session ends mid-action, the next session observes the retained request/action before creating a replacement.

## 3. Design and documentation policy for C1

Before any Designed implementation, locate the current bounded owner among existing Designs. Revise the existing owner when the decision remains within its natural scope. Add a Design only if an independently falsifiable new semantic owner truly cannot be represented by revision. Design numbering is never a work sequence.

The `dev-2` -> `tdev` correction does not receive its own naming Design. Pure labels are Direct. If a protocol tag, digest domain, durable record, endpoint, configuration binding or provider resource name has migration semantics, revise the Design that already owns that contract or state meaning.

WORKBOARD owns only the current C1 location. This plan owns only execution procedure. Evidence owns only observation/provenance. At C1 convergence, permanent facts must already live in Directive/Rule/current Designs/source/types/config/tests as appropriate. The final product must remain safely understandable and changeable without reading this plan or completed evidence/history.

## 4. Global invariants and stop conditions

Across all checkpoints:

- never weaken required validation, exact-state identity, authorization, candidate isolation, retry/idempotency, stale/conflict handling or exact canonical integration to claim a cost win;
- do not redesign H2 merely because cost work continues; current production H2 behavior is an input unless fresh evidence falsifies its owner;
- do not delete retained sessions, ledger state, provider resources, credentials or historical evidence merely because they look old;
- do not create a per-repository local runtime, installation, Worker or public endpoint as the normal solution to multi-repository support;
- do not run a large benchmark cohort when a bounded falsifier answers the current decision;
- do not publish a candidate lacking the required validation for its exact result;
- after response loss or interruption, reconcile the original durable action/effect before retrying or replacing it; and
- stop only for a genuine external permission/provider/user-action blocker, a safety boundary that current authority cannot resolve, or completed C1. A failed hypothesis, test or checkpoint is a reason to localize/repair/revalidate, not a default session stop.

## 5. C1-1 — managed-session terminal reconciliation

Purpose: remove misleading or capacity-distorting managed-session lifecycle state before investigating authorization retries.

### C1-1.1 Fresh baseline and reproduction

- Rebind current repository/runtime/provider state.
- Observe managed sessions, executing actions, reservations and relevant provider run terminal states with the cheapest available read paths.
- Attempt to reproduce or falsify the historical shape: provider run terminal while tdev still projects the session as logically ready/active.
- Record only the bounded evidence needed to establish whether the defect still exists and whether it has material cost/capacity effect.

Exit: the mismatch is reproduced with attributable identities, or current evidence falsifies it and gives a reason to close/redirect C1-1.

### C1-1.2 Owner and trigger localization

- Trace the existing session-state owner, reconciliation triggers, idle/lifetime transitions and provider-terminal readback.
- Test the historical hypothesis that reconciliation occurs only under pool pressure or another narrow trigger.
- Distinguish a stale projection from a still-valid reusable session; do not infer waste solely from age.

Exit: first-order lifecycle cause and required invariant are explicit.

### C1-1.3 Change classification

- If behavior already required by current D0005/D0006 or another existing owner is merely missing/buggy, treat the repair as Direct.
- If lifecycle ownership/recovery semantics must change, revise the existing Design owner before code. Do not create a lifecycle Design solely for C1 chronology.

### C1-1.4 Minimal repair and focused falsification

- Implement the smallest owner-correct repair.
- Add focused tests covering provider-terminal convergence, idempotent repeated reconciliation, nonterminal reuse and isolation across unrelated sessions/attempts.
- Bound provider read amplification; a fix that continuously polls away savings is not accepted.

### C1-1.5 Required validation and canonical integration

- Run focused diagnostics first when cheaper.
- Run complete required validation for the exact final candidate.
- Integrate the exact validated result and read back canonical completion.

### C1-1.6 Live acceptance and transition

- Exercise the live managed layer sufficiently to prove provider-terminal -> tdev terminal convergence and absence of incorrect capacity retention.
- Update WORKBOARD to C1-2 in the same integration as the final C1-1 convergence record when practical.

## 6. C1-2 — managed-session UNAUTHORIZED retry amplification

Purpose: eliminate expensive whole-validation replay caused by managed-session authorization failure before adding repository-selection dimensions.

### C1-2.1 Fresh reproduction/falsification

- Re-establish whether the historical `UNAUTHORIZED` managed-session failure can still occur under current source/release/provider state.
- Attribute failure to exact authentication stage: session intent, OIDC/run identity, lease/assignment, assertion expiry, installation/binding identity, request transfer or native join.
- Do not mask the defect with retries or longer timeouts.

### C1-2.2 Root-cause localization

- Falsify competing hypotheses using the smallest negative/positive probes.
- Compare failing and successful sessions without leaking credentials into evidence.
- Separate provider authorization failure from stale lifecycle artifacts fixed in C1-1.

### C1-2.3 Existing-owner decision

- Prefer Direct repair when current D0005/D0006 semantics already require the correct behavior.
- If security/trust/recovery semantics actually change, revise those existing owners before implementation. A new Design is not the default.

### C1-2.4 Repair and regression protection

- Implement the minimal first-order fix.
- Add deterministic tests for the exact failure plus expiry/replay/duplicate/wrong-run negative cases relevant to the cause.

### C1-2.5 Required validation and integration

- Validate the exact candidate under all required profiles, integrate it and read back completion.

### C1-2.6 Live managed acceptance

- Exercise enough real managed execution to show the repaired authorization path and absence of the previous whole-validation retry amplification in the tested shape.
- Advance WORKBOARD to C1-3.

## 7. C1-3 — single-runtime multi-repository/ref capability

Purpose: remove the current one-binding-per-runtime product limitation without fragmenting the installation.

### C1-3.1 Fresh contract/binding audit

- Re-read D0001-D0006 ownership relevant to repository identity, public repository selection, authorization, validation/integration identity and runtime topology.
- Confirm current implementation points that assume one `engine.binding`, one repository/ref, one authorization scope or one repository object.
- Include a pre-change scan of branch-derived naming where it intersects repository/binding identity; full naming cleanup remains C1-4.

### C1-3.2 Existing Design revisions

Expected owners are primarily repository/context, controller contract, security boundary and runtime topology; validation/integration or work-state owners are revised only if their semantics actually change.

Decide, without creating duplicate owners:

- how one installation enumerates/selects authorized repository/ref bindings;
- exact binding identity and epoch semantics;
- repository/ref-scoped grants and request deduplication;
- Work/Action/result/receipt/effect fencing across repositories/refs;
- object/cache sharing rules for immutable bytes;
- provider credential scope and Git remote/ref safety;
- observation/open-work scoping; and
- administration of adding/removing/changing authorized bindings without making ordinary development depend on runtime redeploy/manual source scoping.

### C1-3.3 Implementation

- Preserve one canonical public endpoint and one native installation/runtime topology.
- Replace singleton binding assumptions with explicit selected-binding context at admission and carry immutable binding identity through durable work/effect records.
- Prevent cross-repository/ref IDs, cursors, snapshots, prepared results, receipts or effects from authorizing another binding.
- Keep independent repositories/refs concurrently usable subject to configured capacity.

### C1-3.4 Focused isolation/security validation

Required negative cases include wrong repository, wrong ref, stale binding epoch, cross-repository work/result/effect substitution, cross-binding request-ID collision and revoked binding/grant behavior.

### C1-3.5 Required validation/integration/release acceptance

- Complete required validation and canonical integration on the self-development binding.
- Stage/activate only if current release owner requires it for live capability acceptance.
- Prove current `humtr/tdev` self-development remains intact while an independently authorized second repository/ref can be discovered/read/worked without creating another tdev runtime. When authorized/current, `humtr/codex` and `rewrite/rust-core` are the preferred real second-binding acceptance target; otherwise keep that target explicitly unavailable rather than fabricating proof.

### C1-3.6 Recovery and concurrency acceptance

- Exercise interruption/retry and concurrent work across at least two bindings sufficiently to prove scoped recovery and no cross-binding canonical effect.
- Advance WORKBOARD to C1-4.

## 8. C1-4 — final tdev identity cleanup and migration

Purpose: remove development-branch codename leakage from the final product identity.

### C1-4.1 Exhaustive current-tree inventory

Search current product source, tests, config, deployment, authority/Design docs and provider-facing metadata for at least `dev-2`, `dev2`, `DEV2` and equivalent branch-derived identifiers. Classify every hit as one of:

- final product/public identity -> must become `tdev`;
- internal protocol/digest/durable identity -> must become `tdev` with owner-correct migration if semantics are affected;
- development branch/ref truth -> may remain until C1-6 promotion;
- truthful historical evidence/history -> may remain; or
- obsolete residue -> remove if removal has concrete value.

### C1-4.2 Direct naming corrections

Change semantic-preserving server names, user agents, generated commit messages, product labels and similar literals directly. Do not create a naming Design.

### C1-4.3 Owner-correct identity migration

For `dev2.*` digest domains, `/__dev2/*` routes, `DEV2_*` bindings, durable record tags, release/config identifiers or provider resources, determine whether changing the value affects compatibility or retained state. Revise only the existing owner that governs that meaning, then migrate with explicit readback/fencing. Do not preserve a wrong permanent name solely because it was previously deployed.

### C1-4.4 Exhaustive residual scan and validation

- Re-run the inventory after changes.
- Any remaining current-product `dev-2`/`dev2` token must have an explicit truthful reason.
- Run focused compatibility/migration tests plus complete required validation/integration and live readback required by affected layers.
- Advance WORKBOARD to C1-5.

## 9. C1-5 — repository-aware source/context transfer deduplication

Purpose: reduce repeated full source/context transfer only after repository/binding authorization semantics are stable.

### C1-5.1 Fresh measurement

- Measure assignment count, sent/received bytes, source/blob contribution, warm reuse and wall/managed compute for a bounded representative validation.
- Reconfirm whether full source blobs are still transferred per required profile assignment.

### C1-5.2 Security/design classification

- Prefer immutable content-addressed sharing/caching only if authorization remains repository/binding/assignment safe.
- If transfer authorization, cache ownership or trust semantics change, revise the existing D0005/D0003/D0006 owner as applicable. Do not create a cost Design just to document implementation.

### C1-5.3 Implementation and adversarial isolation

- Separate reusable immutable source bytes from assignment-specific lease/profile authorization where safe.
- Never let possession of a cached digest authorize source from another repository/ref/principal/binding epoch.
- Test cold/warm paths, revoked access, cross-binding digest equality, incomplete cache, corruption and interrupted transfer.

### C1-5.4 Required validation and measured acceptance

- Run complete required validation/integration.
- Repeat the bounded comparable measurement and report actual byte/request/compute reduction plus remaining unknowns.
- Advance WORKBOARD to C1-6.

## 10. C1-6 — final convergence, cost acceptance and main promotion

### C1-6.1 Final authority/product convergence

- Freshly bind repository/runtime/provider state.
- Confirm C1-1..C1-5 completion from canonical source, Designs, tests, durable receipts and live acceptance rather than from this plan.
- Ensure any permanent facts discovered during C1 are in their proper current owner.

### C1-6.2 Non-authority dependency and documentation pruning

Evaluate ordinary future development while ignoring completed `docs/plans`, historical evidence, research/history and handoffs. `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, current WORKBOARD, selected current Designs and executable source/types/config/tests must be sufficient to understand and safely change the product.

Prune obsolete/redundant non-authority material when it has no continuing provenance value. Do not retain files merely to avoid using Git history. Do not delete material required by an explicit legal/audit/user requirement.

### C1-6.3 Bounded final cost observation

Measure the smallest comparable workload needed to summarize post-C1 validation executions, retries/waste, managed compute/session behavior, provider/infrastructure operations, source/context bytes, wall time and manual intervention. Preserve unknowns. Do not claim D0007 statistical PASS without its required methodology.

### C1-6.4 Exact-state main promotion and self-development acceptance

- Freeze the exact final development-line commit/tree that passed required validation and applicable live acceptance.
- Promote that exact state to `main` without introducing new product-code differences on `main`.
- Verify remote `main` exact identity/readback.
- Transition canonical tdev self-development to the authorized `main` repository/ref binding through the current owner-defined mechanism; do not use ad hoc manual rebinding as the normal product solution.
- Stage/activate the corresponding final release when required and verify edge/device/runtime identity.
- From `main`, perform a bounded ordinary `dev_context` -> read -> Work -> required validation/integration/readback self-development smoke acceptance, using a no-op-safe or deliberately bounded real change chosen at that time.
- Mark C1 complete only after `main` is the verified canonical product/self-development line and WORKBOARD is reset to the next current frontier or idle state.

## 11. Reporting contract

At each material checkpoint report only current facts: what changed, exact layer validated, remaining unknowns/blockers, and the next checkpoint identity. Do not repeat stale commit/release/session IDs as current authority. At C1 completion report the final `main` identity, active runtime/release identity, second-repository/ref acceptance scope, naming residuals if any, bounded cost result and any explicitly deferred unknowns.
