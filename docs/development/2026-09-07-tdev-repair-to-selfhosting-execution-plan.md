# tdev repair-to-self-hosting execution plan — 2026-09-07

## 1. Purpose and authority boundary

This is a dated execution-continuation plan for the repair lineage currently published at `development@9a001f5474ba839bb805ebab06377f0f0d1a75d6`. It preserves the 2026-09-05 independent origin audit and detailed repair plan as the engineering baseline, incorporates the later Astra re-audit corrections, and follows the current maintained owners and `WORKBOARD.md` routing.

This file is not a second product authority. Maintained Design revisions, `WORKBOARD.md`, `docs/development/PROGRAM.md`, `docs/QUALIFICATION.md`, and their evidence owners remain authoritative. If this plan conflicts with a freshly rebound maintained owner, the owner wins and this plan is corrected before dependent mutation.

Current selected route at the start of this plan:

`D0046@r4 M1 -> D0046 M2 -> H1-H5 -> D0045 comparative adoption -> D0035 self-hosting/tmcp-retirement proof when D0035 is accepted and selected`.

D0035 is currently `draft`; this plan does not authorize tmcp retirement or a D0035 qualifying mutation before its normal SDD acceptance/selection lifecycle closes.

## 2. Fixed starting point

Repository / lineage:

- remote `development`: `9a001f5474ba839bb805ebab06377f0f0d1a75d6`
- predecessor preserving-update checkpoint: `67b1470a521375213197e6498f7b917d05b49e76`
- original audit/plan commit: `81a7ce689ff81e4d8bd071dc2c43ec6319b9820d`
- current work is performed in a tmcp-managed isolated worktree; the main checkout and the unmanaged Astra repair worktree are preserved.

Known verified lower-layer results inherited only at their exact proof layers:

- D0047/D0048 scoped lazy context, full-manifest identity, bounded reads, CP2/CP3 and full-context stress have source/local PASS evidence.
- D0043@r4 physical Termux M0 has a real Codex subprocess, full exact-base disposable candidate, fixed validation and positive cleanup evidence.
- Historical local scripts named CP1 prove prerequisites only. User CP1 remains open until the supported web ChatGPT client receives the validated result from the same durable Case path.

Open state at this starting point:

- the deployed provider context still identifies old source `78f47d5002f7f0fbeb3520b7ec82dbc2a7356b61`;
- the deployed old Case reader rejects the current scoped Plan shape with `unexpected_keys`;
- D0046@r4 therefore requires retained-state compatibility, quiescence, preserving update, installed Agent qualification, authenticated provider candidate qualification and current-client result before M2 can close;
- the historical 502 underlying cause remains `unknown`;
- current ChatGPT exposes the tdev trial Case/development tools, but that availability does not substitute for M1/M2 evidence.

## 3. Safety and preservation invariants

1. Preserve the complete repository/base identity. Scope/context/candidate digests never replace the exact base identity.
2. Preserve existing provider Case/Access/namespace identities unless a freshly accepted owner and provider readback explicitly require a different migration.
3. Do not mutate provider state or install/update the Agent until exact source, predecessor compatibility, quiescence, rollback and readback preconditions are freshly observed.
4. Do not blind-retry ambiguous provider effects. Reconcile by authoritative version/config/state readback.
5. Keep model execution, candidate materialization, validation and cleanup under their selected owners; positive cleanup evidence is required where the Design requires it.
6. Do not reinterpret historical local CP1/M0/source/package results as provider or current-client success.
7. Do not infer a root cause for the historical 502 from later quota, tunnel, provider or client failures.
8. Preserve existing user files and unmanaged worktrees; do not import unrelated untracked qualification files into this lineage.

## 4. Phase A — retained-state reader compatibility

Goal: prove that current source can safely read the exact state shapes produced by the deployed predecessor before any provider or Agent mutation.

Actions:

1. Carry forward Astra's uncommitted `qualification/case-reader-upgrade.mjs` after hash verification and source review.
2. Generate legacy snapshots with the exact predecessor writer from source `78f47d5002f7f0fbeb3520b7ec82dbc2a7356b61` and compare predecessor/current restores across pending, running, accepted, cancelled and promoted states, including semantic-object variants and reopen paths.
3. Fail closed on any snapshot, canonical-tree, semantic-object or digest drift.
4. Add focused regression coverage if the harness exposes an incompatibility.
5. Record evidence separately from live retained-Case readback; source compatibility is not proof that every live Case is quiescent.

Exit: compatibility harness PASS plus focused tests and repository source gate sufficient for the changed slice.

## 5. Phase B — live quiescence and preserving-update admission

Goal: establish that the deployed state can be updated without discarding user identity/state or colliding with a live Attempt/delivery/reservation.

Actions:

1. Freshly read deployed Worker/version/source, Case/Drive state that is safely observable, Access identity/audience, DO/D1/namespace bindings and current traffic assignment.
2. Freshly read installed Agent release identity, delivery/reservation state and local supervisor live-operation state.
3. Require positive quiescence for the exact resources whose writer/reader/runtime will change. A bounded observation that cannot prove an owner is idle remains `unknown` and blocks only the dependent mutation.
4. Prepare the preserving update from the current accepted D0046/D0048 reader and provider composition while retaining existing identity/bindings.
5. Reconcile any response loss from authoritative provider readback before retry or rollback.

Exit: exact preserving-update plan is source/provider-preflight qualified with explicit rollback/readback tuple and no unresolved live-owner conflict.

## 6. Phase C — Agent/current-source update

Goal: align the installed Agent/runtime with the repair source without claiming provider/client success.

Actions:

1. Build/verify the exact installable Agent artifact from the selected source under current package authority.
2. Revalidate quiescence immediately before installation/update.
3. Perform the owner-authorized update, then independently reread installed source/release/capabilities.
4. Run the bounded local operation/validation profile needed by D0043/D0047/D0048 and require positive cleanup.

Exit: installed Agent and repair source identities agree at the required contract boundary; local/source gates remain green.

## 7. Phase D — D0046 M1 isolated provider composition

Goal: make the supported isolated HTTPS MCP path user-ready before asking for a web ChatGPT trial.

Actions:

1. Deploy/update only the D0046 isolated trial composition under the accepted preserving-update rules.
2. Read back immutable Worker version, traffic, bindings, Case/Drive/Agent owners, D1/Access/auth metadata, discovery/resource metadata and rollback/disable state.
3. Run machine/provider MCP `initialize`, `tools/list`, bounded read/context operations and one end-to-end development candidate through the same Case/Agent path.
4. Require inspectable ChangeSet, full exact-base disposable candidate, fixed validation PASS, same-Case result readback and cleanup evidence.
5. A client-facing URL is handed off only after M1 is independently green.

Exit: D0046 M1 evidence satisfies the user-ready isolated endpoint checkpoint. Source/package/deploy success alone is insufficient.

## 8. Phase E — D0046 M2 / user CP1

Goal: switch the actual development interaction to tdev for one real production-shaped source task.

Actions:

1. In supported web ChatGPT, use the exact M1 read-back MCP URL and selected D0024 authentication path.
2. Perform one bounded current-client preflight.
3. Submit one real non-documentation source change through tdev MCP -> durable Case -> Agent -> model ChangeSet -> disposable candidate -> fixed validation.
4. Read back the validated result from the same Case and independently bind request/base/source/provider/Agent/candidate/validation identities.
5. Do not use a canned patch, documentation-only change, precomputed commit, direct out-of-band edit or tmcp result import as the M2 success object.

Exit: D0046 M2 and user CP1 PASS. At this point ordinary development can begin moving onto the independently usable tdev path; tmcp remains available only as long as later gates still require it.

## 9. Phase F — hardening, comparative adoption and self-hosting transition

1. Execute D0046 H1-H5 over the frozen successful M2 corpus, including recovery/auth lifecycle/reproducible deploy/rollback/legal parallelism/stable cutover as selected.
2. After the tdev path is independently usable, run D0045 client-stratified tmcp-vs-tdev comparative adoption without using the comparison as a substitute for tmcp-disabled proof.
3. Before D0035 implementation, require D0035 to be accepted/selected and all mandatory prerequisite owners to be at their required exits.
4. At the integrated D0035 qualifying boundary, disable the tmcp operational/control plane and independently observe its absence.
5. From that boundary through qualification completion, no bootstrap/control/execution/validation/recovery/publication step of the qualifying self-development run may use tmcp.
6. tdev N must produce, validate, promote and publish a real tdev N+1 successor through tdev-owned paths, including representative failure reconciliation and provider/remote reread.

Exit: accepted D0035 matrix proves tmcp retirement readiness. Historical tmcp state remains provenance unless a separate retention owner says otherwise.

## 10. Evidence and reporting rules

- Every mutation is preceded by fresh mutable-state readback and exact preconditions.
- Evidence records exact immutable source/release/provider/candidate identities and distinguishes source/local/provider/current-client proof layers.
- A PASS is reported only for the gate actually exercised.
- External/client/provider blockers stop only the dependent gate; independent source/local repair continues when safe.
- `WORKBOARD.md` remains the sole current routing owner; this plan is updated or superseded when routing/Design authority changes.
