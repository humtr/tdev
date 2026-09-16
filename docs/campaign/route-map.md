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

Detailed plan: [C5-p0-controller-convergence.md](C5-p0-controller-convergence.md)

Status: issued mandatory post-C2 campaign, not active during C2. Fresh entry revalidation scopes/localizes the problem; it is not a go/no-go gate.

Purpose: close the observed P0 durable-frontier/control failure class without assuming in advance whether the first-order defect is controller procedure, public observation contract, durable substrate, effect-specific recovery, provider/client behavior or a mixture. C5 has its own hard acceptance and does not depend on an unvalidated C6 method.

Nominal route:

`C5-1` -> `C5-2` -> `C5-3` -> `C5-4` -> `C5-5` -> `C5-6`

Placement is after C2. C5 must execute; a no-product-change result is allowed only after the campaign's bounded investigation and acceptance, not by pre-entry defer/no-go.

## C6 — conversational retry/re-entry evaluation methodology

Detailed plan: [C6-conversational-retry-reentry-methodology.md](C6-conversational-retry-reentry-methodology.md)

Status: issued mandatory post-C2 methodology campaign, not active during C2. Its methodology verdict is independent of C5's correctness verdict.

Purpose: test rather than assume the proposed `gate -> benign success -> intentional retry/re-entry -> serial baseline -> actual separate role=user reinjection -> retry/re-entry -> diversified repetition` process; distinguish intentional re-entry from failure recovery/effect retry, validate the test harness with positive/negative controls, and classify its relationship to C5 as causal, diagnostic, auxiliary, unrelated or unknown.

Nominal route:

`C6-1` -> `C6-2` -> `C6-3` -> `C6-4` -> `C6-5` -> `C6-6`

C6 may be interleaved with C5 at bounded pre/post evidence points, but neither campaign substitutes for the other. C5 can repair/close on its own hard evidence; C6 remains mandatory until its own methodology/applicability verdict is recorded.

## C4 — public tool-contract ergonomics and misuse-resistance audit

Detailed plan: [C4-tool-contract-ergonomics-audit.md](C4-tool-contract-ergonomics-audit.md)

Status: issued post-C2 campaign, not active before C2 and mandatory C5/C6 closeout.

Purpose: after C2 has converged/promoted the product and the mandatory C5/C6 campaigns have closed, comprehensively audit the actual final four-tool public contract for hidden constraints, identity handoff ambiguity, error actionability, async/retry usability, multi-repository/ref ergonomics, invalid-call cost and misuse resistance. Repair only evidence-backed defects through the then-current owner-authorized development workflow.

Nominal route:

`C4-1` -> `C4-2` -> `C4-3` -> `C4-4` -> `C4-5` -> `C4-6`

C4 is post-convergence quality work. It does not delay C2 completion and must not mutate a verified `main` ad hoc; substantive fixes follow whatever development/promotion workflow is authoritative when C4 runs.

Execution order may be revised when evidence requires it without renumbering issued identities. `WORKBOARD.md` is the owner of the current active campaign/checkpoint and current routing.
