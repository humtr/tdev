# Campaign route map

Status: non-authoritative navigation

This file is the thin route map for issued development campaign identities. `RULE.md` owns campaign mechanics and identity rules. `WORKBOARD.md` owns current execution state and routing. Current Designs own bounded product and architectural semantics. Per-campaign files in this directory are non-authoritative execution aids.

Campaign IDs and checkpoint IDs are durable trace identities. This map may retain completed campaign identities and their nominal routes for navigation, but it does not make historical plans current authority, does not own mutable progress, and does not prevent completed detailed plans from being pruned when their lasting facts have been absorbed by the proper owners. Git remains the full history.

## C1 — final tdev product convergence and main promotion

Detailed plan: [C1-final-tdev-convergence.md](C1-final-tdev-convergence.md)

Purpose: finish managed-session cost/reliability repairs, add single-runtime multi-repository/ref capability, converge final `tdev` identity, reduce repository-aware transfer waste, then perform final convergence and exact-state `main` promotion.

Nominal route:

`C1-1` -> `C1-2` -> `C1-3` -> `C1-4` -> `C1-5` -> `C1-6`

- `C1-1` — managed-session terminal reconciliation and lifecycle truth
- `C1-2` — managed-session `UNAUTHORIZED` retry amplification
- `C1-3` — single-runtime multi-repository/ref capability
- `C1-4` — final `tdev` identity cleanup and migration
- `C1-5` — repository-aware source/context transfer deduplication
- `C1-6` — final convergence, bounded cost acceptance, exact-state `main` promotion and self-development acceptance

Execution order may be revised when evidence requires it without renumbering issued identities. `WORKBOARD.md` is the owner of the current active campaign/checkpoint and current routing.
