# Design 0045 — tdev/tmcp MCP Development-Path Comparative Qualification

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Authority snapshot at decision: `development@bce22bca1f94b92c76e0489b0e7a96043fb3e1d8`
- Local cumulative decision base: `development@bc1776c37fa6b0dbb67cde9d28882025396d6d9d` (unpublished descendant at decision time)
- Trigger: direct user decision to add, without replacing the existing qualification methods, a paired cross-validation and improvement loop demonstrating that development work submitted through tdev MCP is materially better than equivalent work submitted through tmcp MCP in representative performance, efficiency, speed, parallel execution and stability profiles
- Acceptance evidence: `docs/evidence/group-f-d0045-r1-tdev-tmcp-comparative-qualification-acceptance-2026-09-03.json`
- Affected owners: `docs/development/PROGRAM.md`, `docs/QUALIFICATION.md`, D0035 prerequisite planning and the derived Design index
- Preserved owners: D0019 remains the only Case semantic owner; D0020/D0027 remain Agent delivery/execution owners; D0023/D0024 own the supported MCP and security surface; D0025 owns Git publication; D0042 owns Case re-drive; D0043@r2 owns bounded development operations; D0046 owns the prerequisite independently usable tdev MCP path; D0035 owns tmcp-retirement readiness
- Product/runtime semantics: no product command, schema, state, authority, retry, security or deployment behavior changes merely by accepting this comparison plan
- Explicit non-goals: no claim that tdev currently outperforms tmcp; no replacement of correctness/security/recovery qualification; no comparison between different clients as though it isolated the execution path; no production SLO; no canonical-ref race between the two paths; no tmcp shutdown; no D0044/D0039 route mutation; no implementation before later `WORKBOARD.md` routing

## 1. One-line definition

Before tdev is preferred over tmcp for normal development, run equivalent real development units through client-matched `client -> MCP -> tmcp` and `client -> MCP -> tdev` paths from the same immutable repository authority, independently verify result quality and safety, measure predeclared end-to-end performance/efficiency/parallel/recovery outcomes, and continuously correct the responsible tdev boundaries until the frozen comparative profile passes.

## 2. Evidence classes at acceptance

### Repository facts

At the decision snapshot:

- tdev already contains Case/PlanRevision/Task/Attempt/Claim/Promotion semantics, repository/model executors, local-Agent and Git-publication components, but its repository CLI exposes only `demo` and `durable-demo`; there is no current product-shaped development-unit admission path.
- `docs/development/PROGRAM.md` identifies D0042 as the provisional missing durable Case-to-Agent drive owner and D0043 as the provisional bounded repository/model/validation operation catalog.
- D0023/D0024 remain provisional owners for the supported MCP/authenticated current-client surface, and D0025 remains the provisional runtime Git-publication owner.
- `bench/control-plane.mjs` and `bench/repository-model-transport-efficiency.mjs` already observe component-level latency, throughput, capacity, Git calls/bytes and model transport, but no current executable compares complete tmcp and tdev MCP development paths.
- D0035 requires a tmcp-disabled tdev self-development proof. It establishes independence, not comparative superiority.

### Direct user decision

Comparative cross-validation is an additional required adoption method. It must not replace the existing semantic, source, provider, security, migration, recovery or self-hosting proofs. The intended end state is that Codex first, and a supported web ChatGPT client later, can submit real development work through tdev MCP and observe materially better representative outcomes than through tmcp MCP, with measured weaknesses feeding further tdev development rather than being hidden in a summary score.

### Measured evidence

No D0045 paired end-to-end measurement exists at acceptance. Existing tdev microbenchmarks and historical tmcp observations are inputs for harness design only and cannot be promoted into a D0045 result.

### Inference

Functional equivalence alone does not establish that switching development control planes is operationally beneficial. Conversely, wall-clock speed alone can reward omitted durability, validation, fencing or recovery. A valid adoption comparison therefore needs equivalent semantics, client-stratified paired trials, independent outcome verification and separate measurements for latency, throughput, work/byte cost, parallel execution and controlled-failure recovery.

### Unknowns

- the exact first real development-unit corpus after D0042/D0043 and the supported tdev MCP surface exist;
- the variance and practical noise floor of model/provider/network time on the selected Codex and web ChatGPT profiles;
- the exact numeric material-improvement thresholds to freeze after calibration and before candidate trials;
- which current tmcp version/profile remains available as the immutable comparator at each stage;
- which tdev boundary will dominate end-to-end time or failure recovery before measurement.

These unknowns control the frozen run manifest; they do not permit selecting workloads, metrics or thresholds after seeing candidate results.

## 3. Current contract and concrete problem

### Current contract

The current qualification system separates semantic correctness, source, runtime, provider, security, deployment and final-product proof. Performance claims must name their exact workload/environment, compare equivalent semantics and separate operation/byte counts from noisy wall-clock observations. D0035 separately requires one complete tdev-owned self-development run while tmcp is disabled.

### Concrete problem

Neither the existing component benchmarks nor eventual D0035 independence answers whether an MCP client receives better development service from tdev than from tmcp. Without a paired gate, tdev could become independent while being materially slower, more interaction-heavy, less parallel or harder to recover. A naive comparison could also produce the opposite false claim by comparing different clients/models, allowing one path to skip validation, or racing both paths against one canonical ref.

## 4. Decision and ownership

D0045 owns only:

- the equivalence requirements for a tmcp/tdev development-path comparison;
- the client-stratified paired/crossover measurement method;
- the required metric families and anti-cherry-picking rules;
- the comparative pass/fail boundary;
- the feedback rule that maps a measured defect to its responsible existing owner or a new/revised Design;
- the evidence boundary between an observed advantage and a production SLO.

D0045 owns no scheduler, Case state, queue, Agent state, MCP command, credential, repository mutation or Git publication effect. Measurement events are non-authoritative observations and cannot complete a Task, accept a result, perform Promotion or reconcile an external effect.

`docs/QUALIFICATION.md` owns the stable execution method. An immutable run manifest/evidence record owns the exact compared source/client/model/runtime/workload/threshold identities and observed results. `docs/development/PROGRAM.md` owns where this gate sits in the forward dependency graph. D0035 may consume a verified D0045 result but cannot reinterpret it as proof that tmcp was disabled.

## 5. Compared paths and client strata

The minimum comparison matrix is:

```text
Codex -> MCP -> tmcp
Codex -> MCP -> tdev

supported web ChatGPT -> MCP -> tmcp
supported web ChatGPT -> MCP -> tdev
```

Comparison is paired only within one client stratum. Codex-to-tdev versus ChatGPT-to-tmcp is not a path comparison because client/model/tool policy and UI/network behavior are confounded. Client strata may be reported side by side but are never silently pooled.

Each paired run binds the exact:

- client product/profile and, where observable, model/version/reasoning configuration;
- MCP server build/schema/authentication profile;
- tdev and tmcp source/release identity;
- repository, published base ref and immutable base commit;
- non-secret objective, context and acceptance manifest;
- Agent/machine/provider/network profile;
- permitted operation, resource, time and publication bounds.

If a required identity is unavailable, it remains `unknown`; the run cannot become comparative acceptance evidence.

## 6. Workload corpus and isolation

The frozen corpus contains both deterministic and real-development rows:

1. bounded serial work that exposes fixed orchestration overhead;
2. one real non-documentation-only source change with focused regression and full required validation;
3. disjoint same-base work at widths 2, 4 and 8 where parallel execution is legal;
4. dependency-chain and conflicting-claim work that must not be parallelized incorrectly;
5. cancellation, invalid result, validation failure, client disconnect, Agent reconnect, coordinator restart and response-loss rows;
6. after D0025 is supported, expected-predecessor conflict and ambiguous Git-publication reconciliation rows.

Every side starts from the same immutable base and receives the same semantic objective and bounds. Each uses a separate isolated repository/worktree/ref and separate Case/task identities. Comparative candidate trials do not let both paths mutate one canonical ref. Publication rows use separately designated disposable or qualification refs until an accepted owner authorizes a canonical successor.

A precomputed patch, documentation-only no-op, direct out-of-band edit, unrestricted shell shortcut, skipped validation or result merely recorded after another control plane performed the work is not a real development-unit row.

## 7. Metrics

Metrics remain separate; no single score may hide a failed category.

- **correctness and safety** — objective/validation success, accepted-result validity, exact-base fencing, deterministic Promotion where applicable, unauthorized canonical effects and residue;
- **speed** — MCP admission-to-durable-terminal and admission-to-validated-candidate latency, with p50/p95/p99 and phase decomposition;
- **throughput** — successfully validated development units per wall-clock interval;
- **parallel execution** — observed overlap, useful concurrency, width-specific throughput and capacity-1-relative speedup without result-order dependence;
- **efficiency** — MCP round trips and payload bytes, model calls and provider-reported tokens when available, Git calls/bytes, active compute, retained bytes and operator interventions per successful unit;
- **stability and recovery** — success rate, retries, duplicate dispatch/effect count, stale-result rejection, orphan process/worktree/claim residue and time to correct durable convergence after each controlled fault.

Provider/model token counts are recorded only when directly observed. They are never estimated into apparent precision. Server-owned monotonic phase timestamps and an independent client/observer measurement are both retained; neither compared system may be its sole authenticator.

## 8. Calibration, frozen manifest and paired execution

The comparison has three distinct phases:

1. **calibration** estimates warm-up behavior, variance and measurement resolution. Calibration results cannot close D0045.
2. **manifest freeze** fixes workloads, repetitions, randomized/counterbalanced order, warm-up exclusion, timeout/deadlock guards, exact metric formulas and numeric material-improvement thresholds before candidate results are admitted.
3. **candidate comparison** runs the frozen manifest without changing tasks, thresholds or exclusions. A changed manifest creates a new comparison generation and invalidates aggregation with the prior one.

Deterministic rows require exact expected outcomes. Real model-development rows use objective validation plus a blinded or otherwise path-independent review of the resulting diff; byte-identical tmcp/tdev outputs are not required. Failed/invalid results remain samples and cannot be silently rerun away. Environmental invalidation is allowed only by a predeclared rule and remains visible.

Wall-clock claims use repeated paired samples and report the distribution and pairwise ratios rather than one best run. Operation/byte/count evidence is reported independently from noisy time. Order alternates or is randomized so warm caches and provider drift do not consistently favor one path.

## 9. Comparative pass boundary

D0045 passes only when one frozen representative profile establishes all of the following:

1. tdev correctness, authority, security and cleanup are non-inferior, and every deterministic safety/failure invariant passes with zero unauthorized canonical effect and zero duplicate external effect;
2. representative multi-step end-to-end latency meets the predeclared material-improvement threshold, while bounded trivial-serial overhead stays within its separately frozen ceiling;
3. tdev demonstrates real parallel overlap and meets the frozen throughput/scaling improvement threshold on legal width-2/4/8 work without weakening claims or changing Promotion output;
4. successful-unit efficiency meets the frozen improvement threshold in the declared count/byte/resource/interaction measures, with no unreported metric-family regression;
5. controlled-fault completion/recovery is non-inferior in success and meets the frozen recovery-time improvement threshold, with stale/duplicate/orphan outcomes at zero where the responsible contract requires zero;
6. the Codex stratum passes first and the supported web ChatGPT stratum later repeats the same semantic profile; client-specific failures remain attributed rather than averaged away;
7. the complete applicable correctness/security/source/provider regressions remain green at their own proof layers.

Strict victory in every individual noisy trial is not required. A favorable average cannot compensate for a correctness, security, authority or cleanup regression. Passing D0045 proves only the named workload/environment/profile; it creates no general production SLO.

## 10. Continuous improvement loop

One comparison generation executes as a closed loop:

```text
freeze -> paired run -> independently validate -> phase/metric attribution
       -> correct the responsible owner -> rerun the complete frozen corpus
       -> PASS or exact blocker
```

Likely attribution includes:

- ready-work delay or restart re-drive -> D0042;
- MCP round-trip/projection overhead -> D0023;
- authentication/reconnect overhead -> D0024;
- repository preparation, model transport or validation operation cost -> D0043@r2 and the existing repository/model executor owners;
- Agent delivery/reconnect/duplicate behavior -> D0020/D0027/D0044 as applicable;
- Git publication/reconciliation -> D0025;
- an optimization that changes none of those contracts -> Class 1 at the existing owner;
- a new queue, cache authority, retry meaning, credential/path boundary, durable metric or acceptance method -> new or revised Class 2 Design before implementation.

The implementer keeps changes in small reviewable commits but does not treat each commit, test or optimization as a user-facing completion point. Work continues through the full frozen rerun. The report boundary is a whole D0045 checkpoint PASS or an exact authority/external-resource/safety blocker that cannot be resolved within the accepted scope.

## 11. Failure, cancellation, recovery and cleanup

- A client disconnect does not prove work absent or failed; each path is reread through its own supported authority before retry.
- A comparison timeout is only a deadlock guard and cannot cancel or complete semantic work by itself.
- Cancellation must be exercised through each path's supported command and independently confirm no unauthorized canonical/publication effect.
- Duplicate MCP submission and response loss retain one stable request identity per path; blind resubmission under a new identity is a failure.
- An invalid candidate or failed validation remains a terminal comparative outcome and cannot be omitted because a later manual repair succeeded.
- Every trial positively reconciles process, worktree, claim, credential exposure and external ref residue before resource reuse.
- A tmcp outage during comparison is not evidence that tdev is faster; it is a stability sample only when the fault was part of the frozen manifest.

## 12. Compatibility, migration, deployment and secret boundary

D0045 introduces no product persistence format and requires no runtime migration or rollback. Benchmark/qualification manifests and result evidence are versioned non-product records. Dropping or rebuilding measurement indexes cannot change a legal Case or Git result.

tmcp remains available as a bounded comparator until D0035 independently reaches its disablement gate. D0045 never copies tmcp credentials/state into tdev Case/Plan/evidence/model context. The two paths use their supported credentials through their existing owners, and evidence records identities/digests and permission classes without secret values.

Cloudflare Access or another selected identity mechanism is measured only after D0024 authorizes it. Repeated ad hoc web-client probing is not a substitute for a scripted bounded trial plus authoritative readback.

## 13. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| semantic equivalence | both paths receive the same objective/base/bounds and perform the same required validation/effect class |
| client isolation | Codex and web ChatGPT are separate paired strata; no cross-client path attribution |
| repository isolation | same immutable base, separate worktree/ref/Case identities, no shared canonical race |
| observer independence | exact server phase/count evidence plus independent client/observer outcome and candidate validation |
| metric coverage | correctness, latency, throughput, parallelism, efficiency, stability and recovery reported separately |
| anti-cherry-picking | calibration is non-qualifying; workload/order/repetitions/exclusions/formulas/thresholds freeze before candidate trials |
| real development | at least one non-documentation-only source change is produced and fully validated through each ordinary path |
| parallel work | widths 2/4/8 demonstrate legal overlap and deterministic accepted result/Promotion behavior |
| failure recovery | frozen disconnect/restart/response-loss/cancellation/validation failures reconcile without invented success or duplicate effect |
| improvement loop | any failing metric is attributed and corrected at the responsible owner, followed by a complete frozen-corpus rerun |
| current clients | Codex passes first; supported web ChatGPT repeats without pooling results |
| evidence scope | exact identities and remaining unknowns recorded; no production SLO or tmcp-retirement claim inferred |

Cheapest decisive falsifiers are:

1. give one path a different base, validation set, model/client profile or effect class;
2. show a tdev speed win only because validation, durable reconciliation or cleanup was skipped;
3. configure width greater than one but observe no actual legal overlap or a completion-order-dependent result;
4. lose an MCP response and observe duplicate work/effect or manual authority guessing;
5. change the workload, exclusion rule or threshold after candidate results are visible;
6. use system self-reported timing without independent candidate/outcome verification;
7. obtain a favorable aggregate while any correctness/security/authority category regresses.

Any one blocks the affected comparative claim until corrected and rerun.

## 14. Rejected alternatives and tradeoffs

### Replace existing qualification with the comparison

Rejected. Relative performance cannot establish semantic correctness, provider truth, security, migration safety or tmcp independence.

### Compare Codex-to-tdev directly with ChatGPT-to-tmcp

Rejected. Client/model/tool-policy differences prevent attribution to the MCP execution path.

### Use one fastest wall-clock run

Rejected. Warm caches, model/provider variance and omitted failure outcomes would dominate the conclusion.

### Race both paths on the active development ref

Rejected. Predecessor movement and canonical effects would couple the trials and create avoidable repository risk.

### Require tdev to win every tiny serial trial

Rejected. Durable admission/reconciliation has legitimate fixed cost. The selected boundary requires material representative improvements, a bounded serial-overhead ceiling and no correctness/stability regression.

### Fold comparative superiority into D0035

Rejected. D0035 owns tmcp-disabled self-hosting independence. A system may be independent without being faster, and may benchmark faster while still depending on tmcp. The two claims remain separately falsifiable.

## 15. Planned ordering and checkpoint integration

1. Complete D0043@r2 M0 and D0046 M1/M2/H1-H5 so one real supported web ChatGPT tdev path is independently usable and hardened at its declared single-user scope.
2. Freeze the exact D0046 source/client/model/Agent/provider/base/validation profile that becomes the tdev side of the first comparison generation.
3. Route D0045 and implement only the neutral manifest, instrumentation, tmcp/tdev adapters, independent validator and evidence writer needed for candidate-only paired trials.
4. Run the Codex stratum, attribute gaps, continuously correct authorized tdev owners and rerun the full frozen corpus until PASS.
5. Repeat the supported web ChatGPT stratum through the selected authenticated MCP paths without pooling it with Codex.
6. After D0025, extend the same comparison generation or a newly frozen successor generation to isolated Git-publication conflict/response-loss rows.
7. Let D0035 consume the verified comparison as adoption evidence, while independently proving the complete tmcp-disabled self-hosting run.

## 16. Proof boundary

Acceptance records the comparison decision and authorizes only later D0045 qualification-harness work after explicit `WORKBOARD.md` routing. It performs no implementation, benchmark run, MCP/provider/Agent/Git mutation, client configuration or tmcp shutdown. Until exact D0045 evidence passes, relative tdev superiority remains unverified. Even after D0045 passes, tmcp retirement remains unverified until D0035 independently passes.
