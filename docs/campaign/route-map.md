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

Execution order may be revised when evidence requires it without renumbering issued identities. `WORKBOARD.md` is the owner of the current active campaign/checkpoint and current routing.
