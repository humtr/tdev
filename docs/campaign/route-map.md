# Campaign route map

Status: non-authoritative navigation

This file is the thin route map for issued development campaign identities. `RULE.md` owns campaign mechanics and identity rules. `WORKBOARD.md` owns current execution state and routing. Current Designs own bounded product and architectural semantics. Per-campaign files in this directory are non-authoritative execution aids.

Campaign IDs and checkpoint IDs are durable trace identities. This map may retain completed, redirected or superseded route identities for navigation, but it does not make historical plans current authority, does not own mutable progress, and does not prevent completed detailed plans from being pruned when their lasting facts have been absorbed by the proper owners. Git remains the full history.

## C1 — managed-execution lifecycle and operational-ref convergence

Detailed plan: [C1-managed-execution-lifecycle-convergence.md](C1-managed-execution-lifecycle-convergence.md)

Purpose: converge the managed execution resource lifecycle before broader product work: provider-terminal/session truth, exact operational execution-ref retirement and historical namespace cleanup, never-assigned replacement churn, and directly coupled `UNAUTHORIZED`/retry amplification.

Current nominal route:

`C1-1` -> `C1-2`

- `C1-1` — terminal/session truth, execution-ref retirement, fixed lifecycle repair and bounded backlog cleanup
- `C1-2` — never-assigned replacement churn, authorization/retry amplification, measured live acceptance and C1 closeout

### Previously issued C1 identities redirected to C2

The following IDs were issued under the earlier broad C1 route and are retained permanently for trace navigation. They are not reused and are no longer active C1 checkpoints.

- `C1-3` — former single-runtime multi-repository/ref capability -> substantive successor `C2-1`
- `C1-4` — former final `tdev` identity cleanup/migration -> substantive successor `C2-2`
- `C1-5` — former repository-aware source/context transfer deduplication -> substantive successor `C2-3`
- `C1-6` — former final convergence/main promotion -> substantive successor `C2-4`

## C3 — bounded ad-hoc development execution

Detailed draft: [C3-bounded-ad-hoc-development-execution.md](C3-bounded-ad-hoc-development-execution.md)

Status: issued draft, not active. C3 must begin with a fresh go/no-go/scope revalidation; the draft does not authorize implementation by existence.

Purpose: evaluate and, only if freshly justified, add a typed-first candidate-scoped bounded development execution capability for one-off diagnostics/codemods/tool invocations without exposing an unrestricted operator shell or making tmcp a product dependency.

Provisional nominal route if activated:

`C3-1` -> `C3-2` -> `C3-3` -> `C3-4` -> `C3-5` -> `C3-6`

Current provisional placement is after C1 and before C2 so a surviving capability can be exercised during broader convergence. At the post-C1 routing gate, revalidate need, security, ownership, exact scope and ordering; WORKBOARD may defer/close C3 and advance directly to C2 without renumbering anything.

## C2 — remaining final tdev convergence and main promotion

Detailed plan: [C2-final-tdev-convergence.md](C2-final-tdev-convergence.md)

Purpose: after preceding campaigns selected by current WORKBOARD routing have converged, finish single-runtime multi-repository/ref capability, final `tdev` identity convergence, repository-aware transfer optimization, then final convergence and exact-state `main` promotion.

Nominal route:

`C2-1` -> `C2-2` -> `C2-3` -> `C2-4`

- `C2-1` — single-runtime multi-repository/ref capability
- `C2-2` — final `tdev` identity cleanup and migration
- `C2-3` — repository-aware source/context transfer deduplication
- `C2-4` — final convergence, bounded cost acceptance, exact-state `main` promotion and self-development acceptance

## C5 — P0 controller convergence and durable-frontier discipline

Detailed draft: [C5-p0-controller-convergence.md](C5-p0-controller-convergence.md)

Status: issued post-C2 candidate, not active during C2. C5 must begin with a fresh go/no-go/scope revalidation on the verified post-C2 product; the P0 label records urgency, while `C5` is the permanent RULE-compliant campaign identity.

Purpose: determine why the conversational development controller can lose or misclassify an already-retained durable tdev/TMCP frontier across response loss, transient unavailability, long-running work, historical backlog and bounded parallel lanes, then apply only owner-correct repairs needed to make exact rebind/reconcile/join behavior reliable from fresh sessions.

Provisional nominal route if activated:

`C5-1` -> `C5-2` -> `C5-3` -> `C5-4` -> `C5-5` -> `C5-6`

Provisional placement is after C2 and before C4. At C2 closeout, WORKBOARD freshly revalidates whether C5 remains independently necessary. If no-go/deferred, route directly to C4; if activated, close C5 before auditing the final public contract in C4. Issuance does not make C5 a C2 dependency.

## C4 — public tool-contract ergonomics and misuse-resistance audit

Detailed plan: [C4-tool-contract-ergonomics-audit.md](C4-tool-contract-ergonomics-audit.md)

Status: issued post-C2 campaign, not active before C2 completion or any C5 selected by post-C2 routing.

Purpose: after C2 has converged the product and promoted/accepted canonical `main`, and after C5 if fresh post-C2 routing activates it, comprehensively audit the actual final four-tool public contract for hidden constraints, identity handoff ambiguity, error actionability, async/retry usability, multi-repository/ref ergonomics, invalid-call cost and misuse resistance. Repair only evidence-backed defects through the then-current owner-authorized development workflow.

Nominal route:

`C4-1` -> `C4-2` -> `C4-3` -> `C4-4` -> `C4-5` -> `C4-6`

C4 is post-convergence quality work. It does not delay C2 completion and must not mutate a verified `main` ad hoc; substantive fixes follow whatever development/promotion workflow is authoritative when C4 runs.

Execution order may be revised when evidence requires it without renumbering issued identities. `WORKBOARD.md` is the owner of the current active campaign/checkpoint and current routing.
