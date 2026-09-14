# Cost-efficient composition F4 live-cost falsification evidence — 2026-09-14

Status: **F4 survives**

This directory is bounded non-normative research evidence. It does not approve production H2, alter D0003/D0004 integration semantics, weaken exact-result validation, change the public MCP schema, activate a release, restart the D0007 formal superiority cohort, or convert deferred Android acceptance into PASS.

## 1. Verdict

**F4 survives.**

The bounded N=8 same-base/disjoint composition path preserved the exact validated result and materially reduced the dominant repeated-validation/publication amplification. Eight member results plus one exact composed result passed the complete current required validation. The exact composed commit then published through the existing native Git sender on one fixed disposable research ref using one exact expected-old CAS, was authoritatively read back as the intended commit/tree, and was removed with an exact leased cleanup. Canonical `dev-2` HEAD/tree remained unchanged throughout the provider experiment.

This verdict is limited to the F4 structural/live-cost falsifier. It is not D0007 statistical-superiority evidence, not a production batching Design, and not authority to implement H2 in production. The next production-facing action, if pursued, is a D0003-owned Design revision for publication ownership/recovery semantics.

## 2. Authority and exact fixture

Repository authority for the final provider run was rebound immediately before execution:

- repository: `humtr/tdev` / `github-1322208918`
- provider repository ID: `1322208918`
- canonical ref: `refs/heads/dev-2`
- authority HEAD at experiment start/end: `a4bdf6eba8de16b8d6863231ba49d11116cdac59`
- authority tree at experiment start/end: `c27c169533ee1460bb481b8caa80e5c89cf63f0b`
- binding epoch: `1`
- policy digest: `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`
- required `core`: `sha256:0f9100a8ec1ac018b37fc302851b2020d75472c900de3d79ad6966f017b5cffa`
- required `integration`: `sha256:228c3c1d07555d6b41b2200c5c2c9475d1566fdbeb0f74f496784a28e4dfdf71`

`fixture.json` freezes the exact research result:

- exact base commit: `59339e0f7960f4cb1b147d59b8f6ff61077254e8`
- exact base tree: `93c9652c74d7c398ba29a904093b966122a2df37`
- eight pairwise-disjoint `bench/f4-live-fixture/member-N.txt` additions, each 26 bytes
- exact composed tree: `d727643980d6baedab8b511f5827417f8c7d862c`
- manifest: `sha256:1be3a2e7c76c796458fd851a89c6011a6cc8326814263a1f28af9c6fd882c928`
- composed commit: `c58762df1b1124b79716a00f84ab6dc0a9b6c3f2`
- composed result ID: `366eda7baee02fd3d0a32d104ad6d03f`
- exact composed validation: `sha256:919b4ef34f7e9388eb686cc434e969696320e918408d89b4e84436df4d520b2d`

All eight exact member bytes were re-read and verified before provider mutation.

## 3. Live validation measurements

All eight member results passed both current required profiles. Exact full-validation spans were:

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

Member aggregate was **1,417.196 slot-seconds**. The exact composed tree then passed the complete current `core` + `integration` validation in **242.451 s**.

Measured composition validation path:

- full required validations: **9**
- stale-recomposition validations: **0**
- discarded validation results: **0**
- aggregate validation wall/slot proxy: **1,659.647 s**
- validation-phase wall window: **570.498 s**

The composed validation was about 36.9% slower than the mean member validation. That near-falsifier is retained; the cost conclusion does not assume equal validation durations.

## 4. Retained live baseline

The retained W4 diagnostic in `docs/evidence/cost-efficiency-diagnostic-20260914/README.md` used the same workload class: eight independent same-base disjoint-path tasks on one canonical ref under the normal per-work validation/integration algorithm.

Within its fixed 30-minute window it retained:

- initial validation PASS: 8/8
- completed full validations: **34**
- integration attempts: **34**
- successful canonical integrations: **6**
- stale `CONTENDED_REF` outcomes: **27**
- canonical completion: **6/8**
- canonical throughput: **0.200 task/min**
- completed-validation mean: about **151.17 s**

The rounded mean implies approximately **5,139.78 slot-seconds** for 34 completed validations. Against that historical workload, 9 versus 34 is a **73.5% full-validation count reduction** and 1,659.647 versus about 5,139.78 seconds is about a **67.7% aggregate proxy reduction**. Against D0003's complete N=8 structural model, 9 versus 36 is a **75% count reduction**.

The baseline is historical, not a contemporaneous same-fixture paired cohort. Those effects are descriptive and do not satisfy D0007's formal statistical-superiority gates.

## 5. Provider/publication measurement

The final trusted-UID run used `bench/f4-publication-harness.mjs` against only `refs/heads/research/f4-live-20260914-a1`. `provider-publication-measurement.json` preserves the raw output.

Measured provider path:

- pre-existing research ref: **absent**
- exact absent-ref setup to expected-old H: **2,725 ms**
- exact expected-old CAS attempts: **1**
- successful CAS effects: **1**
- stale CAS rejections: **0**
- uncertain sends: **0**
- sender wall time: **3,129 ms**
- authoritative readback/reconciliation: **1**, readback **1,086 ms**
- publication to confirmed readback: **4,216 ms**
- exact leased cleanup operations: **1**, **4,404 ms**
- total harness wall window: **12,975 ms**
- provider-facing Git operations: **9**
- total instrumented Git invocations, including local object operations: **32**
- GitHub repository-identity API operations: **9**
- GitHub API response body bytes: **42,489**
- captured Git stdout bytes: **4,589,766**
- retries: **0**
- network bytes transferred: **unknown**

The publication outcome was `integrated / commit_or_descendant`, with the observed head equal to the intended composed commit. The published tree and manifest were the exact validated values.

For a deliberately conservative mixed proxy, adding the entire 12.975 s harness wall window to the 1,659.647 s validation proxy yields **1,672.622 s**, still about **67.46% lower** than the historical approximate 5,139.78 s baseline. This mixes slot/wall and publication wall semantics and is therefore descriptive only; it is used only to show that measured publication overhead is far too small to erase the observed structural reduction.

## 6. Correctness, cleanup and non-contamination

Final provider/correctness checks:

- exact member bytes before publication: PASS
- composed commit is direct child of exact expected-old: PASS
- one exact expected-old lease used: PASS
- intended commit observed after publication: PASS
- exact intended tree observed: PASS
- all eight members preserved: PASS
- lost changes: **0**
- silent overwrites: **0**
- wrong-base admission: **0**
- canonical before/after HEAD identical: PASS
- canonical before/after tree identical: PASS
- canonical contamination: **false**
- exact leased cleanup: PASS
- residual research ref according to harness: **false**
- independent GitHub REST readback after the run: **404 / absent**

The raw measurement's `cleanup.confirmationHead` field contains the composed commit despite `succeeded:true` and `residualRef:false`. This is a reporting-only null-coalescing bug: the harness serialized `cleanupConfirmation?.head ?? observed.head`, so a confirmed null cleanup head fell back to the pre-cleanup observed head. The independent 404 readback and the raw `residualRef:false` establish actual absence. The harness source is corrected in the evidence-closing change without altering the measured provider effect.

A destructive same-fixture replay of eight separate publications against canonical was not performed. Exact final-state equality is established for the composed fixture itself and the D0003 exact-tree/manifest identity; comparison to the baseline remains workload-class/historical rather than a destructive paired canonical replay.

## 7. Remaining unknowns and interpretation

Still unknown with reliable experiment attribution:

- validation CPU time
- exact managed session/cold-start/reuse count attributable to publication
- Workers request count attributable to publication
- Durable Object operation count attributable to publication
- MCP request count attributable to publication
- network bytes transferred

No telemetry subsystem was added solely to chase those counters. None of the unknowns changes the observed facts that the exact result passed full validation, one CAS replaced the structural eight-publication path, provider overhead was seconds rather than thousands of validation-proxy seconds, cleanup was exact and confirmed, and canonical state was untouched.

Therefore the bounded falsifier no longer has a missing provider/publication measurement blocker. **Final verdict: F4 survives.**

This is enough to justify preparing a D0003-owned production-promotion Design revision. It is not enough to implement production H2 without that revision, and it does not establish D0007 statistical superiority.

## 8. Continuation history

The provider half initially stopped because the ChatGPT tool surface could not start a process under the trusted Android/Termux UID. A fixed operator-only harness was added rather than exposing arbitrary public ref mutation.

The first trusted-UID attempt failed during Node module linking because a fresh checkout lacked `jose`; no harness `main()` or provider mutation occurred. The harness was repaired to use the built-in-only private file reader.

The second attempt failed in preflight because the harness incorrectly treated the installed Git sender's historical policy field as current validation-policy authority. Repository authority and `fixture.json` still agreed on binding epoch `1` and policy digest `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`. The harness was repaired to take current authority explicitly, require the installed transport epoch to match, and project the fresh policy only onto the fixed transport binding. Again, no provider mutation occurred on that failed attempt.

The third attempt completed the intended one-shot provider experiment and exact cleanup. The historical `provider-publication-blocker.json` is retained but marked resolved. `final-verdict.json` is the machine-readable closure.
