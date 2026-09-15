# C2 — remaining final tdev convergence and main promotion

Status: pending execution aid

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. C2 does not become active until WORKBOARD routes to it after completed C1 and any intervening campaign that the fresh post-C1 routing decision actually activates. The issued C3 draft is currently only a provisional candidate, not a mandatory predecessor.

## 1. Campaign outcome and dependency

C2 contains the broader product-convergence work removed from the original C1 route so C1 can focus exclusively on managed-execution lifecycle/ref/session-churn correctness.

Entry condition: C1 is complete and managed execution has trustworthy terminal/session/ref lifecycle behavior, no unexplained replacement amplification in the accepted live shape, and no stale operational execution-ref backlog. If the post-C1 routing gate activates C3, C3 must also reach its accepted closeout before C2; if C3 is deferred/no-go, this additional condition does not apply.

Required C2 end state:

- one canonical `tdev` installation/runtime/public MCP service can work concurrently with multiple explicitly authorized repository/ref bindings without per-repository runtime fragmentation;
- branch/codename-derived `dev-2`, `dev2` and `DEV2` product/protocol/internal/deployment naming is removed or migrated to `tdev` wherever it is not truthful historical branch/evidence text;
- repeated source/context bytes across required validation assignments are reduced only after repository-aware authorization/isolation semantics are available;
- required correctness/security/validation/recovery invariants remain unchanged or are explicitly revised through their existing Design owner;
- a bounded post-change cost observation records material remaining waste without constructing a new qualification subsystem; and
- the exact final validated product state is promoted to `main`, canonical self-development moves to the verified `main` binding, and ordinary self-development smoke acceptance succeeds there.

Substantive unfinished development stays on the current development line. `main` promotion is a final exact-state transition, not the start of another development phase.

## 2. Identity mapping from the earlier C1 route

The original broad C1 issued `C1-3` through `C1-6`. Those IDs remain permanent historical trace identities and are not reused. Their substantive successors are:

- `C1-3` -> `C2-1` single-runtime multi-repository/ref capability
- `C1-4` -> `C2-2` final `tdev` identity cleanup/migration
- `C1-5` -> `C2-3` repository-aware source/context transfer deduplication
- `C1-6` -> `C2-4` final convergence, bounded cost acceptance, `main` promotion and self-development acceptance

This mapping preserves traceability without making an issued ID change meaning.

## 3. Durable execution, Design and documentation policy

When C2 becomes active, every fresh session follows current `AGENTS.md` -> `DIRECTIVE.md` -> `RULE.md` -> `WORKBOARD.md` -> campaign route map -> this plan, then reads only the current Designs selected by the active checkpoint and freshly reconciles runtime/provider/Work/Action state.

Before any Designed implementation, locate the existing bounded semantic owner and revise it when the decision remains within its natural scope. Add a Design only if a genuinely independent owner cannot be represented by revision.

The `dev-2` -> `tdev` correction does not receive its own naming Design. Pure labels are Direct. If a protocol tag, digest domain, durable record, endpoint, configuration binding or provider resource name has migration semantics, revise the Design that already owns that contract or state meaning.

Permanent facts discovered during C2 must converge into Directive/Rule/current Designs/source/types/config/tests as appropriate. C2 evidence and this plan remain non-authoritative.

## 4. Global invariants

- never weaken required validation, exact-state identity, authorization, candidate isolation, retry/idempotency, stale/conflict handling or exact canonical integration to claim a cost win;
- preserve the C1 managed-execution lifecycle guarantees rather than reintroducing permanent operational refs or replacement churn while generalizing repository bindings;
- do not create a per-repository local runtime, installation, Worker or public endpoint as the normal solution to multi-repository support;
- do not run a large benchmark cohort when a bounded falsifier answers the current decision;
- do not publish a candidate lacking required validation for its exact result;
- after response loss or interruption, reconcile the original durable action/effect before retrying or replacing it; and
- stop only for a genuine external permission/provider/user-action blocker, a safety boundary current authority cannot resolve, or completed C2.

## 5. C2-1 — single-runtime multi-repository/ref capability

Purpose: remove the current one-binding-per-runtime product limitation without fragmenting the installation.

### C2-1.1 Fresh contract/binding audit

- Re-read D0001-D0006 ownership relevant to repository identity, public repository selection, authorization, validation/integration identity, managed execution and runtime topology.
- Confirm current implementation points that assume one engine binding, one repository/ref, one authorization scope or one repository object.
- Include a pre-change scan of branch-derived naming where it intersects repository/binding identity; full naming cleanup remains C2-2.

### C2-1.2 Existing Design revisions

Decide without duplicate owners:

- how one installation enumerates/selects authorized repository/ref bindings;
- exact binding identity and epoch semantics;
- repository/ref-scoped grants and request deduplication;
- Work/Action/result/receipt/effect fencing across repositories/refs;
- object/cache sharing rules for immutable bytes;
- provider credential scope and Git remote/ref safety;
- observation/open-work scoping; and
- administration of adding/removing/changing authorized bindings without ordinary development depending on runtime redeploy/manual source scoping.

### C2-1.3 Implementation

- Preserve one canonical public endpoint and one native installation/runtime topology.
- Replace singleton binding assumptions with explicit selected-binding context at admission and carry immutable binding identity through durable work/effect records.
- Prevent cross-repository/ref IDs, cursors, snapshots, prepared results, receipts or effects from authorizing another binding.
- Keep independent repositories/refs concurrently usable subject to configured capacity.
- Preserve C1 managed-session lifecycle/ref retirement across each selected repository binding.

### C2-1.4 Isolation/security validation

Required negatives include wrong repository, wrong ref, stale binding epoch, cross-repository work/result/effect substitution, cross-binding request-ID collision, revoked binding/grant behavior and cross-binding managed-execution resource substitution.

### C2-1.5 Required validation/integration/live acceptance

- Complete required validation and canonical integration on the self-development binding.
- Stage/activate only if current release owner requires it for live capability acceptance.
- Prove current `humtr/tdev` self-development remains intact while an independently authorized second repository/ref can be discovered/read/worked without creating another tdev runtime.
- Exercise interruption/retry and concurrent work across at least two bindings sufficiently to prove scoped recovery and no cross-binding canonical effect.

Advance WORKBOARD to C2-2 only after this acceptance.

## 6. C2-2 — final tdev identity cleanup and migration

Purpose: remove development-branch codename leakage from the final product identity.

### C2-2.1 Exhaustive current-tree inventory

Search product source, tests, config, deployment, authority/Design docs and provider-facing metadata for `dev-2`, `dev2`, `DEV2` and equivalent branch-derived identifiers. Classify every hit as final product/public identity, internal protocol/digest/durable identity, truthful development branch/ref, truthful historical evidence/history or obsolete residue.

### C2-2.2 Direct naming corrections

Change semantic-preserving server names, user agents, generated commit messages, product labels and similar literals directly. Do not create a naming Design.

### C2-2.3 Owner-correct identity migration

For digest domains, private routes, bindings, durable record tags, workflow/execution prefixes, release/config identifiers or provider resources, determine whether changing the value affects retained state, C1 cleanup semantics or compatibility. Revise only the existing owner governing that meaning, then migrate with explicit fencing/readback. Do not preserve a wrong permanent product name solely because it was previously deployed.

### C2-2.4 Residual scan and acceptance

- Re-run the inventory after changes.
- Any remaining current-product branch-codename token must have an explicit truthful reason.
- Run focused compatibility/migration tests plus complete required validation/integration and live readback required by affected layers.
- Reconfirm managed operational refs still retire under the final selected `tdev` naming.

Advance WORKBOARD to C2-3.

## 7. C2-3 — repository-aware source/context transfer deduplication

Purpose: reduce repeated full source/context transfer only after repository/binding authorization semantics are stable.

### C2-3.1 Fresh measurement

Measure assignment count, sent/received bytes, source/blob contribution, warm reuse and wall/managed compute for a bounded representative validation. Reconfirm whether full source blobs are still transferred per required profile assignment.

### C2-3.2 Security/design classification

Prefer immutable content-addressed sharing/caching only if authorization remains repository/binding/assignment safe. If transfer authorization, cache ownership or trust semantics change, revise the existing D0005/D0003/D0006 owner as applicable. Do not create a cost Design solely for implementation chronology.

### C2-3.3 Implementation and adversarial isolation

- Separate reusable immutable source bytes from assignment-specific lease/profile authorization where safe.
- Never let possession of a cached digest authorize source from another repository/ref/principal/binding epoch.
- Test cold/warm paths, revoked access, cross-binding digest equality, incomplete cache, corruption and interrupted transfer.
- Preserve C1 session/ref lifecycle and avoid exchanging transfer savings for increased physical-session churn.

### C2-3.4 Required validation and measured acceptance

Run complete required validation/integration, repeat the bounded comparable measurement and report actual byte/request/compute reduction plus remaining unknowns. Advance WORKBOARD to C2-4.

## 8. C2-4 — final convergence, cost acceptance and main promotion

### C2-4.1 Final authority/product convergence

- Freshly bind repository/runtime/provider state.
- Confirm C1 and C2-1..C2-3 completion from canonical source, Designs, tests, durable receipts and live acceptance rather than campaign narrative.
- Ensure permanent facts discovered during both campaigns are in their proper current owner.

### C2-4.2 Non-authority dependency and documentation pruning

Evaluate ordinary future development while ignoring completed campaign plans, historical evidence, research/history and handoffs. `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, current WORKBOARD, selected current Designs and executable source/types/config/tests must be sufficient to understand and safely change the product. Prune obsolete/redundant non-authority material when it has no continuing provenance value.

### C2-4.3 Bounded final cost observation

Measure the smallest comparable workload needed to summarize post-C1/C2 validation executions, retries/waste, managed compute/session/ref behavior, provider/infrastructure operations, source/context bytes, wall time and manual intervention. Preserve unknowns and do not claim D0007 statistical PASS without its methodology.

### C2-4.4 Exact-state main promotion and self-development acceptance

- Freeze the exact final development-line commit/tree that passed required validation and applicable live acceptance.
- Promote that exact state to `main` without introducing new product-code differences on `main`.
- Verify remote `main` exact identity/readback.
- Transition canonical tdev self-development to the authorized `main` repository/ref binding through the current owner-defined mechanism.
- Stage/activate the corresponding final release when required and verify edge/device/runtime identity.
- From `main`, perform a bounded ordinary context -> read -> Work -> required validation/integration/readback self-development smoke acceptance.
- Mark C2 complete only after `main` is the verified canonical product/self-development line and WORKBOARD is reset to the next frontier or idle state.

## 9. Reporting contract

At each material C2 checkpoint report current facts only: exact owner/implementation changed, layer validated, remaining unknowns/blockers and next checkpoint identity. At C2 completion report final `main` identity, active runtime/release identity, second-repository/ref acceptance scope, naming residuals if any, managed lifecycle/ref residuals, bounded cost result and explicitly deferred unknowns.
