# Design 0038 — Default Executor Capacity Policy

- Status: `verified`
- Revision: 1
- Class: 2
- Decision date: 2026-08-23
- Acceptance base: `development@9b78b5487591730754d9708e205d41367f510afc`
- Trigger: user-directed application of ACR campaign `tdev-20260823-d0027-deployment-realization-design-01`, convergence `acr/tdev-20260823-d0027-deployment-realization-design-01/convergence`
- Acceptance evidence: `docs/evidence/group-f-d0038-r1-default-executor-capacity-policy-acceptance-2026-08-23.json`
- Source verification evidence: `docs/evidence/group-f-d0038-r1-default-executor-capacity-policy-source-verification-2026-08-23.json`
- Scope: direct/local runner executor-capacity default policy, same-model capacity-1 degeneration, qualification of the default change, and compatibility with D0020 aggregate Agent capacity
- Affected owners: `docs/OPERATIONS.md`, `docs/QUALIFICATION.md`, `src/runner.mjs`, focused/permanent runner tests
- Explicit non-goals: no adaptive/autotuned capacity; no second Task/Attempt scheduler; no D0018/D0020/D0027 owner change; no provider-capacity promise or production SLO; no implicit Agent oversubscription

## 1. One-line definition

Change the normal omitted executor-capacity policy from `1` to `8` while preserving explicit positive overrides, keeping explicit capacity `1` as the same parallel admission model's normal degeneration, and leaving D0018/D0020/D0027 ownership and lifecycle semantics unchanged.

## 2. Why this is Class 2

The source already supports a generic positive capacity `N`, but the normal default is a product/runtime policy. Changing the omitted value changes concurrency/admission behavior and therefore acceptance, resource pressure, cancellation/retry interleavings, and deployment expectations. `SDD.md` classifies those concerns as Class 2.

This Design does not repair a falsified D0018 rule. D0018 already establishes capacity-N semantics and capacity-1 degeneration; the numeric normal default is a separately decidable runtime policy. It likewise does not change D0020 aggregate capacity ownership or D0027 installation/security fencing.

## 3. Repository and review facts

At the acceptance base:

- `src/runner.mjs` normalizes omitted `capacity` to `1` and accepts any positive safe integer;
- `docs/OPERATIONS.md` declares the same default `1`;
- D0018 treats capacity one as `N=1` of the same admission algorithm, not a separate scheduler;
- D0020 owns route-wide accepted/effective Agent aggregate capacity, reservation, freshness and positive capacity release independently of direct/local per-Case demand;
- D0027 consumes D0020 delivery/capacity authority but does not own a direct/local runner default;
- current `WORKBOARD.md` has no runnable gate before this application.

The ACR campaign independently concluded `CAP8_SEPARABLE_RUNTIME_POLICY`: the user-selected normal default `8` fits a new narrow Class-2 policy boundary and must not be smuggled into D0027.

The campaign's bounded benchmark is supporting source/local evidence only: Android/arm64, Node v26.4.0, 63 work Tasks, dependency depth 6, maximum frontier width 32, 67 Attempts with four planned retries, canonical-equivalent valid outcomes, requested physical concurrency reached, and median wall times of 21423.689 ms at cap4, 13668.650 ms at cap8, 14167.706 ms at cap12, and 14479.113 ms at cap16. This supports the fixed user policy but is not a universal optimum, safety threshold or production SLO.

## 4. Decision

### 4.1 Default and overrides

After implementation:

- omitted `capacity` means exactly `8`;
- an explicit positive safe integer remains a supported override;
- invalid, zero, negative or non-safe-integer values continue to fail closed;
- explicit `capacity: 1` remains the normal `N=1` degeneration of the same parallel executor model.

Capacity one is not a legacy scheduler, compatibility fallback, error recovery mode or different state machine.

### 4.2 Owner boundary

The numeric default belongs to this Design and its synchronized runtime owner surfaces: `docs/OPERATIONS.md` and the runner implementation.

It does not become an invariant owned by D0018, D0020 or D0027:

- D0018 continues to own capacity-N executor/runtime semantics, slot lifecycle, retry/cancellation interaction and capacity-1 degeneration;
- Case/Task/Attempt readiness and lifecycle remain CaseEngine-owned;
- D0020 continues to own Agent-wide accepted/effective aggregate capacity, reservations, delivery authorization and positive release;
- D0027 may consume a separately accepted default of 8 but does not originate, persist or reinterpret that number.

### 4.3 Agent aggregate interaction

A per-Case/direct-local normal demand of 8 never manufactures Agent capacity. If the current D0020 effective route capacity is lower than the demand, D0020 admission rules remain authoritative. Saturation does not create a second durable semantic queue, silently oversubscribe the Agent, or change Case lifecycle meaning.

### 4.4 No adaptive policy

This revision intentionally selects a fixed normal default. CPU/load/provider/memory-driven auto-tuning would introduce sensing, control, fallback and stability semantics and requires its own Class-2 decision if pursued later.

## 5. Failure and compatibility behavior

- A cap8 execution may interleave independent Tasks differently, but accepted results and deterministic Promotion must remain legal and semantically equivalent to other capacities for equivalent workloads.
- Retry N+1 cannot overlap a predecessor execution merely because additional capacity is available.
- Cancellation and stale-identity fences remain exact; spare capacity cannot admit work that the semantic owner denies.
- Conflicting claims continue to serialize; disjoint claims may overlap up to selected capacity.
- Ready-but-not-admitted work remains transient runner readiness, not a new provider/Agent queue.
- Resource exhaustion must surface through existing fail-closed process/admission behavior; it does not justify silently lowering the semantic default through a hidden adaptive controller.

## 6. Implementation ordering

1. Route D0038@r1 in `WORKBOARD.md`.
2. Change `src/runner.mjs` omitted-capacity normalization from 1 to 8 without changing explicit-positive validation or the capacity-N algorithm.
3. Synchronize `docs/OPERATIONS.md` and permanent tests.
4. Add/maintain `docs/QUALIFICATION.md` coverage for the default-selection and degeneration matrix without duplicating current result facts.
5. Run the required source gate plus focused capacity tests.
6. Record exact source evidence and publish by non-force fast-forward.
7. Only then may an initially integrated D0039/D0027 product rely on omitted capacity selecting 8.

## 7. Acceptance matrix and cheapest falsifiers

| Area | Required acceptance / falsifier |
| --- | --- |
| default selection | omitted capacity selects exactly 8; invalid values still fail closed; explicit positive override remains supported |
| degeneration | explicit cap1 and cap8 use the same state model and produce the same legal canonical result for equivalent work |
| ready width | widths 1, exactly 8 and greater than 8 pipeline correctly; live runner controls never exceed selected capacity |
| claims | conflicting claims serialize; disjoint claims overlap up to the selected cap |
| retry | retries never overlap an unreleased predecessor slot and Attempt/effect semantics remain unchanged |
| cancellation/fencing | cancel-before-dispatch, active cancel, late completion, stale identity and checkpoint failure preserve existing no-extra-invocation rules |
| result/Promotion | differing completion order and cap1/cap8 do not change legal accepted result/canonical Promotion semantics |
| Android/Termux | exact supported profile exercises process/FD/memory/CPU pressure, cleanup, restart and cancellation at cap8 before that layer is claimed |
| Agent aggregate | route capacities below/equal/above demand preserve D0020 saturation/freshness/cleanup with no second queue |
| provider/deployed | selected provider/D0027 composition proves resource compatibility only when that later proof layer is actually executed |

A direct correctness violation at cap8 that cannot be handled under existing D0018/D0020 semantics falsifies this decision and reopens the responsible owner. Pure throughput differences do not.

## 8. Non-goals and proof boundaries

The accepted Design authorizes source implementation only after current routing selects D0038@r1. It does not claim the source change, Android resource pressure, Agent-provider interaction or deployed composition has already passed.

The ACR review and benchmark are evidence for selecting the policy, not implementation or production qualification.

## 9. Verification closure

D0038@r1 is verified at the source/runtime-policy layer on 2026-08-23. `src/runner.mjs` now selects capacity 8 only when the option is omitted; explicit positive safe-integer overrides, including `capacity: 1`, retain the existing capacity-N admission algorithm. The focused capacity gate passed 21/21 tests and directly observed omitted/default max concurrency 8, explicit capacity 1 max concurrency 1, explicit capacity 8 max concurrency 8, and identical canonical output. The complete `portable` source gate then passed 478/478 tests plus syntax, documentation authority, demo and durable-demo.

This verification does not claim the separate physical Android resource-pressure profile, live D0020 provider aggregate interaction or D0039 deployed composition. Those later layers remain independent and cannot be inferred from this source closure.
