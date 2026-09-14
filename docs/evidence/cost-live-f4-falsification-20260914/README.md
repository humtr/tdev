# Cost-efficient composition F4 live-cost falsification evidence — 2026-09-14

Status: **F4 blocked**

This directory is bounded non-normative research evidence. It does not approve production H2, alter D0003/D0004 integration semantics, weaken exact-result validation, change the public MCP schema, activate a release, restart the D0007 formal superiority cohort, or convert deferred Android acceptance into PASS.

## 1. Verdict

**F4 blocked.**

The live validation half of the cost hypothesis remains credible: an exact current-base N=8 disjoint fixture completed eight member validations plus one complete validation of the exact composed result with no stale recomposition, and the measured validation-work proxy was materially below the retained live baseline's repeated-recomposition workload.

F4 nevertheless cannot be called `survives`. The current authorized public mutation surface cannot execute the required composition publication against a fixed disposable research ref with exact expected-old CAS. `dev_work.integrate` is bound to canonical `refs/heads/dev-2`; the available generic GitHub ref update does not accept an exact expected-old lease. Using canonical as the destructive research fixture or substituting a non-CAS update would cross the experiment's safety boundary.

Consequently live composition publication/CAS cost, provider cleanup/reconciliation cost, canonical terminal throughput and a same-fixture provider-level final-tree comparison remain unknown. Those are required evidence for the F4 survival definition.

The smallest missing capability is fixture-scoped invocation of the already-existing native exact-CAS sender for one fixed disposable research ref, with authoritative provider readback and exact cleanup. No production redesign or public schema change is required to obtain that missing evidence.

## 2. Fresh starting authority

The experiment rebound current repository authority before dependent actions:

- repository: `humtr/tdev`
- repository ID: `github-1322208918`
- provider repository ID: `1322208918`
- canonical ref: `refs/heads/dev-2`
- starting HEAD: `59339e0f7960f4cb1b147d59b8f6ff61077254e8`
- parent: `09d47cca3df131f038c5b73efdbef6a50d41121c`
- starting tree: `93c9652c74d7c398ba29a904093b966122a2df37`
- starting snapshot manifest: `sha256:1ddb9ba453d8fb7e9192c1ebecf9969f6877005a3527cd1805f97e9ed0a2874e`
- binding epoch: `1`
- policy digest: `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`
- required `core`: `sha256:0f9100a8ec1ac018b37fc302851b2020d75472c900de3d79ad6966f017b5cffa`
- required `integration`: `sha256:228c3c1d07555d6b41b2200c5c2c9475d1566fdbeb0f74f496784a28e4dfdf71`
- configured execution capacity: `8`

At the first runtime observation one attempt was already reserved, so only seven slots were immediately available to the eight-member wave. That queue/admission interference is retained rather than normalized away.

The owner-selected `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, `WORKBOARD.md`, design index, D0001, D0003, D0004, D0005, D0006 and D0007 were fresh-read. D0003's whole-result validation identity remained unchanged: no member receipt was reused as authorization for a different tree.

## 3. Exact F4 fixture

`fixture.json` freezes the machine-readable identity.

All eight works share exact base `59339e0f...` / tree `93c9652c...`. Member `N` adds only:

`bench/f4-live-fixture/member-N.txt`

with content:

`f4-live-20260914 member N\n`

Each path was absent at the base, mode `100644`, and each payload is 26 bytes. The eight paths are pairwise disjoint and deterministic order is 1..8.

The exact composed candidate is:

- tree: `d727643980d6baedab8b511f5827417f8c7d862c`
- manifest/result digest: `sha256:1be3a2e7c76c796458fd851a89c6011a6cc8326814263a1f28af9c6fd882c928`
- candidate commit: `c58762df1b1124b79716a00f84ab6dc0a9b6c3f2`
- result: `366eda7baee02fd3d0a32d104ad6d03f`
- exact composed validation: `sha256:919b4ef34f7e9388eb686cc434e969696320e918408d89b4e84436df4d520b2d`

A direct work-tree diff against the frozen base returned exactly eight additions, zero modifications and zero deletions. Direct file readback matched all eight requested payloads. No member was lost, overwritten, based on the wrong tree or admitted without its complete required validation.

## 4. Live validation measurements

All eight member results passed both current required profiles. Their exact full-validation spans were:

| member | wall s |
| --- | ---: |
| 1 | 169.368 |
| 2 | 170.407 |
| 3 | 179.762 |
| 4 | 173.798 |
| 5 | 170.851 |
| 6 | 245.059 |
| 7 | 178.501 |
| 8 | 129.450 |

Member aggregate: **1,417.196 slot-seconds**; mean **177.1495 s**; median **172.3245 s**.

Member 8 began only after capacity became available; its admission/start delay was approximately 174 seconds. The eight-member wave took about **303.770 s** from retained validation admission observation to the last member validation completion.

The exact composed tree then received the complete current required validation and passed `core` and `integration`. Its validation span was **242.451 s**.

Therefore the measured constrained validation path was:

- full required validations: **9**
- stale-recomposition validations: **0**
- discarded validation results in the measured phase: **0**
- aggregate validation wall/slot proxy: **1,659.647 s**
- pre-publication validation phase wall time from first admission through composed completion: **570.498 s**
- validation-phase equivalent source-set rate: **0.841 task/min**, but this is **not canonical throughput** because no conforming publication was executed.

The composed validation was about **36.9% slower** than the mean member validation. This was the strongest near-falsifier: composition made the exact-result validation materially more expensive. It did not erase the validation-count/slot-proxy reduction, but future evidence must not assume equal per-validation cost.

## 5. Retained live baseline

The baseline is the already-preserved one-shot live W4 diagnostic in `docs/evidence/cost-efficiency-diagnostic-20260914/README.md`. It used the same workload class—eight independent same-base disjoint-path tasks on one canonical ref—under normal current per-work validation/integration semantics.

Within its fixed 30-minute window it retained:

- initial validation PASS: 8/8
- completed full validations: **34**
- one additional validation still running and later cancelled
- integration attempts admitted: **34**
- successful canonical integrations: **6**
- stale `CONTENDED_REF` outcomes: **27**
- canonical completion: **6/8**
- canonical throughput: **0.200 task/min**
- completed validation mean: about **151.17 s**
- completed validation median: about **140.78 s**
- range: about **100.49–216.64 s**

The retained rounded mean implies approximately 5,139.78 slot-seconds for 34 completed validations, but that is an approximation, not an authoritative exact aggregate.

Against counts, the measured constrained path is 9 versus 34 completed full validations, a **73.5% reduction**. Against the complete structural N=8 model recorded by D0003, it is 9 versus 36, a **75% reduction**. Against the historical rounded-mean aggregate model, 1,659.647 s is about **67.7% lower**.

These effect sizes are descriptive only. The baseline was historical rather than a contemporaneous same-fixture paired run, and the F4 composition path did not reach canonical publication. They are not D0007 superiority evidence.

## 6. Useful versus wasted work

For the narrow live composition validation phase, all nine required validations contributed to the selected research construction: eight admitted members plus one exact composed result. Measured stale/discarded validation work was zero, so the narrow useful validation proxy is 1,659.647 slot-seconds and the narrow wasted proxy is 0.

For the retained baseline, 27 integration attempts ended `CONTENDED_REF`, demonstrating repeated stale work, but the evidence retained here does not bind every validation span to an exact final usefulness classification. Exact useful and wasted baseline slot-seconds therefore remain **unknown**.

Validation CPU time is also **unknown**; wall span is only a slot/execution proxy.

## 7. Managed execution and queue observations

The runtime was configured for capacity 8, but one attempt was already reserved at the start. Seven F4 member validations entered managed execution immediately and the eighth waited for capacity.

Runtime observations showed seven new managed sessions for the initial wave and at least two further session creations during the composed-validation interval. This establishes **at least nine observed new managed-session creations** across the retained observations, but it does not authoritatively classify cold starts or give a complete per-validation session-reuse map.

Therefore:

- exact managed-session count: **unknown**
- cold-start count: **unknown**
- session reuse savings: **unknown**
- queue/admission delay: observed for member 8; exact per-profile queue time otherwise **unknown**

No favorable session-reuse assumption is used in the verdict.

## 8. Publication/provider measurement boundary

Baseline provider behavior is live and retained: 34 integration attempts in-window, 27 stale outcomes, six canonical successes, with a seventh just after the window.

A conforming F4 composition publication was **not executed**. Current public `dev_work.integrate` is tied to canonical `dev-2`, while the available generic GitHub ref-update operation does not expose exact expected-old CAS. The experiment therefore stopped the provider mutation path rather than weaken D0003 or use canonical as a research fixture.

F3 independently demonstrated that the installed native sender can execute one exact-CAS shared publication effect against a disposable research ref and clean it up safely. F3's retained record, however, is safety/recovery evidence, not a trustworthy F4 cost timing record; its machine record does not retain a usable publication duration.

For F4 composition these remain **unknown**:

- live publication attempts
- live exact-CAS attempts
- provider publication wall time
- provider Git/API operation count
- provider readback/reconciliation cost
- provider cleanup cost for a conforming F4 ref
- canonical end-to-end completion wall time
- canonical completed tasks/minute

No F4 research ref was created, so F4 itself required no provider ref cleanup.

## 9. Data/control-plane metrics

The fixture contains 208 unique changed source bytes. Across the eight member payloads plus the exact composed payload, the logical changed-file payload sum is 416 bytes.

Those numbers are fixture bytes, not repository transfer accounting. Authoritative checkout/blob/source transfer bytes are **unknown**.

Also **unknown** because current retained evidence does not expose them with reliable experiment attribution:

- MCP runtime request/response count and bytes
- Workers request count
- Durable Object operation count
- validation CPU time
- complete Git/provider API operation count

No telemetry subsystem was added merely to obtain these counters.

## 10. Correctness and non-contamination

Composition-side correctness passed:

- same exact base for all members: PASS
- pairwise-disjoint paths: PASS
- deterministic membership: PASS
- exact union tree materialization: PASS
- full required validation of exact composed tree: PASS
- lost changes: 0
- silent overwrites: 0
- wrong-base members: 0
- invalid admitted members: 0

Provider-level exact final-tree equality between **this exact F4 fixture** under baseline publication and composition publication is **not measured**, because neither destructive canonical baseline replay nor non-CAS research publication was permitted. This incompleteness is part of the blocking verdict rather than being silently promoted to PASS.

After measurement all nine F4 research Works were explicitly cancelled; all had `currentActionId:null` and disposition `cancelled`. No F4 research ref existed. Fresh canonical readback after fixture cleanup remained exactly the starting HEAD/tree. Thus the fixture did not contaminate canonical state.

The only canonical mutation after that proof is the evidence-only integration of this directory.

## 11. Final interpretation

The dominant measured waste mechanism is strongly reduced at the validation layer: 9 live full validations with zero stale recomposition versus a retained live baseline of 34 completed validations and 27 stale integration outcomes. The exact composed validation was substantially slower than a member validation, but not enough to erase that measured validation-work reduction.

That is not sufficient to satisfy F4's definition of `survives`, because the provider/publication half of the live comparison and exact same-fixture terminal comparison could not be obtained through a safe authoritative mutation path.

**Final verdict: F4 blocked.**

Do not begin production H2 promotion from this result. The next justified research action is only to obtain fixture-scoped access to the existing exact-CAS research sender and close the missing publication/canonical-terminal measurement. D0003-owned production-promotion Design work is **not yet justified**.

## 12. Provider-publication continuation — 2026-09-14

A fresh continuation rebound canonical authority at `70d6c329d404c446df40e490c5cce8737addf41e` (parent `59339e0f7960f4cb1b147d59b8f6ff61077254e8`, tree `305842d17d2e9f9d752e348ffc2707089556b180`) with binding epoch `1` and unchanged policy digest `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`.

The retained F3 operator mechanism was recovered and a smaller F4-only operator harness was added at `bench/f4-publication-harness.mjs`. It is Android/Termux-only, hard-binds repository `github-1322208918` / provider repository `1322208918` and `refs/heads/research/f4-live-20260914-a1`, refuses a pre-existing research ref, verifies current binding/policy and all eight exact fixture bytes before mutation, creates the research ref with an absent-ref lease, invokes the existing `GitRefTransport.compareUpdate` exact expected-old lease once, performs authoritative readback/reconciliation, performs exact-leased cleanup with absence confirmation, and checks canonical HEAD/tree non-contamination. It does not add a public MCP/API capability or alter production integration semantics.

The harness required one type-only repair after its first required validation found JSDoc diagnostics. The repaired exact result passed current required `core` and `integration` validation with validation ID `sha256:d99cad8bcd7e2e7d0599d4a3049527f0ff9e9c208ac5707ba455b593166d66e6` and was integrated as `20373679b2dc813b7cfcab00a4ef1ba8049c800d`, tree `a1f83e1989c2f7759963e09894046bb9db8b78cb`, direct child of `70d6c329d404c446df40e490c5cce8737addf41e`.

Authoritative GitHub readback after that integration still returned the fixed F4 research ref as absent. Therefore no F4 provider mutation, publication timing, cleanup operation or provider cost measurement has yet occurred.

The blocker is now narrower than the original record: the exact fixture-scoped native-CAS harness exists and is validated, but the current ChatGPT-connected tool surface has no operation that starts a process in the trusted Android/Termux UID. Current `dev_work` execution profiles are hosted `network:none`; public integration remains canonical-only; the generic GitHub ref mutation surface still does not expose exact expected-old CAS. Substituting any of those would violate the experiment boundary.

Accordingly the verdict remains **F4 blocked**, with one smallest missing capability: one trusted Termux process start of the fixed integrated harness. Publication/provider/readback/cleanup metrics remain `unknown` until that single operator execution occurs. `provider-publication-blocker.json` freezes this continuation state. No production H2 promotion is justified from this blocker.
