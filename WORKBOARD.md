# dev-2 workboard

Authority: DIRECTIVE r5 -> RULE -> selected D0001-D0008.
This file is current execution status only; mutable repository/runtime/provider facts require fresh observation.

## First release: owner closed

By explicit owner instruction on 2026-09-14, the first public `dev-2` release is closed under DIRECTIVE r5. This is an owner product/release decision from the accumulated current evidence and one-shot comparison diagnostics. It is **not** a claim that D0007's repeated statistical cohorts, p95 sample requirements or hard superiority gates passed, and it does not relabel unperformed physical Android sleep/Doze/reboot acceptance as PASS.

Do not resume 30/100-trial D0007 performance cohorts or disruptive physical acceptance merely to satisfy the former r4 release blocker unless the owner explicitly reopens that work or a later correctness/regression question requires it. D0007 remains authoritative for any future formal statistical-superiority claim.

The retained first-release evidence continues to prove only the layers actually exercised. Missing or unsupported cells remain unknown/deferred rather than fabricated success.

## Current canonical/runtime observation

Fresh public observation on 2026-09-14 after the one-shot W4 diagnostic and current research-boundary integration showed canonical `dev-2` source `c5fb68ad102bb8798214d3bfaded64b08b3d7286`, tree `9987f39bd02caad3fc7ba37d8a1afc161b8e4c7f`. The public runtime was accepting, sealed and qualified with configured capacity 8, `executingActions: 0` and `reservedAttempts: 0`. The active runtime release was `sha256:3bcde63d0124f1193ab46eac974dc89e7403c05586093b4d454f538d0981cc17`; edge/device source was `1ad5d13fb74b0a316b17a0d5139ed193826bc6a6`, owner epoch 42.

The W4 diagnostic previously advanced canonical source through seven test-only marker integrations. `bench/one-shot-w4/` retains lanes 1, 3, 4, 5, 6, 7 and 8; lane 2 did not integrate. This is an explicit benchmark side effect, not production behavior. Do not spend additional validation/provider budget on cosmetic cleanup unless cleanup is useful to later work or the owner requests it.

The bounded one-shot measurements and their comparability limits are retained in [cost-efficiency diagnostic evidence](docs/evidence/cost-efficiency-diagnostic-20260914/README.md).

## Active post-release research boundary

Current D0003 contains the accepted **cost-efficient composition research boundary**. It does not change the production integration algorithm. Under the current whole-result validation identity it rejects cross-tree receipt reuse (H1) as unsound without a future smaller dependency identity, and selects a bounded H2 off-path deterministic composition falsifier.

`bench/cost-efficient-composition.mjs` is the current test-only research primitive. It grants no validation or publication authority and performs no provider operation. Structurally, for N=8 it compares the current triangular model of 36 full validations / 28 stale-recomposition validations / 8 publications against the research model of 9 full validations / 0 stale-recomposition validations / 1 publication. Those are protocol-structure counts, not live performance or cost measurements.

## Post-release frontier

1. **Run the cheap H2 falsifier first.** Establish exact final-tree equality and deterministic composition behavior on the bounded same-base/disjoint fixture. A failing falsifier ends this route without changing production semantics.
2. **Waste accounting.** Measure validation executions/CPU, stale recompositions, managed sessions/cold starts, CAS/publication attempts, Git/provider operations, Workers/DO requests where available, redundant bytes, wall time and useful versus wasted slot-seconds per completed task. Keep instrumentation smaller than the behavior being measured.
3. **No H1 shortcut under current policy.** Current D0003 whole-result validation evidence cannot be reused across a changed composed tree merely because paths are disjoint. Any future dependency-sliced validation identity is separate Designed work and must remain evaluable by the old trusted policy.
4. **Production promotion only after a Design revision.** Any batch/multi-candidate canonical publication, changed stale semantics, incremental required validation or new durable ownership must be explicitly accepted in the D0003-owned boundary before product implementation. Existing per-work full recomposition/full validation remains the correctness-preserving fallback.
5. **Runtime/provider optimization later.** After structural validation amplification is addressed or falsified, optimize managed-session lifecycle, dependency/object caching, Git operations, MCP polling and Workers/DO traffic where cost accounting shows meaningful residual waste.

## Stop conditions for this research lane

Stop or reject an optimization if it weakens exact validated-result integration, authorization, isolation, stale/conflict detection, response-loss/restart deduplication or canonical source authority; if it requires a new durable owner/queue whose complexity exceeds the measured savings; or if a cheap deterministic falsifier shows the proposed structure cannot preserve exact final-tree and failure/recovery semantics.
