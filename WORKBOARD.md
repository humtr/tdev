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

## D0003 H2 production implementation frontier

The owner separately authorized production-source implementation of the accepted
D0003 H2 contract. The current implementation Work is closing the source/test
lane through required validation and canonical integration; F3/F4 are retained
research evidence and are not being rerun.

The candidate now includes versioned H2 durable references and reader gating,
deterministic composition identities, same-envelope internal selection, exact
composed full validation, leader-only publication, final authorization fencing,
tuple-aware recovery/cancellation, atomic all-member settlement, ordinary fallback,
follower observation and release-authority all-member checks. Focused core and
integration suites include H2 identity/storage/fault cases and have reached PASS
on the current implementation line.

Production selection remains explicitly disabled in native installation source.
This lane does not authorize `release.stage`, `release.activate`, public runtime
deployment, device replacement or default-on H2. After canonical source integration,
remaining work is bounded production-path acceptance and a separate activation/
release review under D0003/D0006. D0007 formal superiority cohorts remain outside
this implementation claim.
