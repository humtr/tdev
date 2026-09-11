# D0007 - Verification and superiority contract

- Design: `D0007`
- Title: `Verification and superiority contract`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003, D0004, D0005, D0006]`
- Supersedes: `[]`
- Directive: `r2`
- Owns: `test-environments, benchmark-methodology, superiority-gates`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

A cleaner diagram is not proof that dev-2 is faster, safer or self-developing. Define reproducible validation layers and falsifiable comparisons against both current predecessors without turning benchmark machinery into a second product.

## Required outcome

Every claim identifies its exercised layer, exact bytes and environment. Local, CI and runtime validation invoke equivalent contracts. First-release completion requires actual canonical-MCP self-development and convincing measured improvement against both tdev and tmcp, never LOC, tool-count or historical-PASS substitution.

## Facts / assumptions / unknowns

The operating environment is DIRECTIVE Section13. Observations are in
`docs/evidence/environment-correction-2026-09-11/README.md`. Existing source and
module tests do not establish a deployed dev-2 runtime. Baseline source/runtime
identities, resource policies and provider budgets must be rebound at measurement
registration; earlier archived counts are not current baselines. Superiority is
unproven until the scored cohorts below run in the selected actual topology.

## Decision: canonical validation contract

The implementation creates `tools/validate.mjs` as the single entrypoint. Its closed contract is `node tools/validate.mjs --profile <core|integration|release|live|benchmark> --output <artifact-directory>` with optional fixture/config parameters defined by each profile. It emits a JSON result with an explicit layer status: exit 0 means all requested required checks passed, 1 means failure, 2 means a required capability was unavailable/not run, and 3 means interrupted/cancelled execution. A parent process exit without the required trusted result is failure/unavailable, never implicit success. A skipped optional layer is not PASS. `npm run check` aliases core plus integration; CI and broker profiles invoke the same entrypoint with the same profile/policy/toolchain digest, not locally reinterpreted scripts.

The trusted runner records entrypoint source digest, exact tree/manifest, adopted policy, environment seal, profile list, start/end monotonic times, exit status, diagnostics and artifact SHA-256s. Candidate scripts cannot self-sign a result. The broker additionally verifies source pre/post integrity and sandbox completion. Per-change integration validation is owned by D0003; this document defines the layer contents and measurement, not an alternate integration authority.

| Layer | Required capability | Required exercises |
| --- | --- | --- |
| `core` | Pinned Node toolchain and Python documentation checker; no network, credentials, Docker/Podman or provider | Pure state transitions, revisions/dedup, scheduler fairness, context/candidate identities, schema negatives, simulated fault schedules, documentation index/ownership checks. |
| `integration` | Node, Git, writable disposable temp filesystem; no credentials/network | Real SQLite/WAL reopen/crash, real Git object/ref fixtures, exact tree composition, local-process lost-response simulation, cache/source integrity, same contracts at C=1/8/16/32. No production sandbox claim. |
| `release` | Native Termux device, sealed managed execution job, actual workers.dev fixture, fixed activation helper | Native control compatibility/restart, hosted hostile-code containment and eight isolated attempts, outbound reconnect, exact edge/device artifact activation, partial failure/rollback. Missing any required environment is NOT RUN. |
| `live` | Explicit disposable provider repo/ref, OAuth test client, canonical MCP, runtime installation | Actual authenticated Git/network CAS and response loss, real ChatGPT source change, context expansion without deploy, own runtime activation and authoritative public readback. |
| `benchmark` | Declared layer plus same prepared fixture/resource budgets for all compared systems | Repeated paired workloads, instrumentation and fixed statistical aggregation below. |

Core runs on an explicitly pinned supported execution variant, including **native
Termux**, without provider credentials/network. Native Git/SQLite integration tests
run on the actual device as well as Linux CI. A Linux/PRoot PASS is not a native
Android PASS; each report records platform/architecture, binary digest, dependency
lock and execution variant. Local and CI run the same profile semantics, not an
exception that skips failed checks. An unknown variant returns NOT RUN.

Production candidate validation runs only inside D0005's sealed managed containment.
Bootstrap operators may run reviewed implementation tests on the authorized device;
that is not permission for ordinary untrusted `dev_work run` in the operator UID.
A real release check explicitly exercises the device's approved-release native code
and the public provider boundary. Native activation probes have explicit activation
authority and disposable state; candidate validation does not borrow that authority.

The current integration module suite can be run as focused implementation evidence
without claiming J1/J2 completion. The canonical integration profile remains NOT RUN
until the full required joined cases are implemented. Once joined, the same profile
must execute on the selected required environments; it cannot silently downgrade to
unit tests. Missing capabilities, quotas or deployment authorization stay unavailable.
Dependency fetching is a separate recorded preparation using the locked dependency
set with lifecycle scripts disabled. It is not a timed test or a candidate hook.

Environment names: `DEV2_STATE_DIR`, `DEV2_PUBLIC_ORIGIN`, `DEV2_OAUTH_ISSUER`, `DEV2_OAUTH_AUDIENCE`, `DEV2_BINDINGS_FILE`, `DEV2_POLICY_FILE`, `DEV2_EXECUTION_CAPACITY` (default 8), and `DEV2_SECRET_STORE_REF`. Live fixture configuration uses `DEV2_TEST_CONFIG` with an explicit disposable repository ID/ref and installation ID. Never infer a production target from a developer's HOME or current branch. Secrets themselves are not environment examples or checked-in files. Preflight reports missing named capabilities without dumping environment values. No placeholder credential produces a green result.

## Benchmark registration and workload

Before any timed run, freeze a benchmark manifest: methodology/fixture digest, baseline observed source commits and release digests, dev-2 exact commit/release, protocol/schema, machine CPU/memory/storage, OS/runtime/toolchain/image, region/network, profile requirements, execution capacity, cache state, client/model settings, input source/tree, seed and trial order. Reobserve live versions at end; changed versions invalidate or split the affected block. Keep both default-deployment comparison and resource-matched comparison. Increasing dev-2 CPU, lowering tests, removing predecessor network hops from only one clock or adding more human assistance is not a fair speed win.

Each system receives the same user-level goal, repository fixture, logical patch target and correctness postconditions. Use each predecessor's best documented currently usable normal path, not an artificially slow route. Pin actual deployed code for the live baseline and separately note newer source-only docs. Mandatory internal models, UI approvals, warmup/bootstrap, extra calls and recovery are included in the end-to-end measurement, not hidden. Do not add a second model to dev-2 for matching architecture. Controlled trace replay measures infrastructure overhead separately from real ChatGPT sessions; it cannot satisfy the experiential gate.

Required workload families:

| ID | Fixture and terminal postcondition |
| --- | --- |
| W1 | Known single-file non-documentation change; required tests and exact canonical commit. |
| W2 | Unknown-path single-file task in a multi-directory repository; progressive discovery, no task-specific redeploy. |
| W3 | Multi-file interface change with tests; atomic candidate edits and complete validation. |
| W4 | Eight independent same-base tasks on disjoint paths **on the same canonical ref**; all complete, including stale recomposition costs. |
| W5 | C=1,8,16,32 independent tasks on separate fixtures/refs; execution overlap and throughput scaling, no identity/schema change. |
| W6 | Two conflicting same-file writes plus independent work; explicit conflict, no overwrite, independent completion. |
| W7 | Validation failure, exact corrective edit and revalidation; no invalid canonical bytes. |
| W8 | Canonical head moves before and during integration; stale rejection/recomposition and no lost newer edits. |
| W9 | Lose create/admission response and Git publication response separately; same request recovers one work/effect. |
| W10 | Restart broker during eight executions and after effect dispatch; recover stable identities and unaffected work. |
| W11 | Integration conflict, cancellation before/after commit, and release activation failure/rollback. |

Fixtures include small and medium repositories (e.g. 100 and 10,000 files) with fixed byte distributions and required test durations. Freeze exact generated fixtures before trials. Real source tasks supplement synthetic timing; a sleep-only concurrency test proves overlap, not development throughput. Same-ref W4 is mandatory to expose D0003's possible repeated-validation cost. Independent-ref W5 cannot replace it.

## Measurement and statistics

Record end-to-end wall time from the first goal/context action to exact terminal readback; source-generation, queue, context, materialization, execution, validation, Git effect and recovery spans; successful completions per elapsed second; useful execution slot-seconds/(capacity times observation-window); MCP calls, model/tool rounds, full request/response/source bytes, unique vs repeated blob bytes; retries, discarded generations, duplicate validations, stale/wasted CPU-seconds; manual interventions/approval turns, external bootstrap steps and provider/runtime operations. Publish both controller-visible and server-side clocks with correlation IDs; compare durations, not unsynchronized wall timestamps.

For W1-W4 and each C=1/8/16 W5 cell, run at least **30 paired measured trials per system and cold/warm condition**, after three explicitly excluded warmups for warm cells. Cold means reset process and fixture/object/dependency cache according to the frozen manifest; distinguish dependency-install cold from process-only cold. Interleave randomized system order within matched blocks. W6-W11 require at least 30 deterministic seeded fault schedules per system where supported; live destructive faults run only against disposable targets. C=32 correctness/overlap is required; performance uses at least ten batches. Any p95 superiority or non-regression gate requires at least 100 measured trials per compared cell; smaller-sample p95 values are descriptive only. Include at least ten complete actual-ChatGPT source-development trials per system for the experiential cohort, report its median/range and uncertainty separately, and never substitute replay timing for those sessions.

Report median, p95 with sample count, empirical completion rate, total elapsed time including failures, and paired bootstrap 95% confidence intervals for median-latency/throughput ratios (10,000 resamples, fixed published seed). Thirty observations are a minimum for the paired median analysis, not precision assurance for the tail: satisfy the 100-trial tail minimum and collect additional preregistered blocks when confidence intervals still prevent a decision. Failed/time-limited trials are not discarded; report censored latency and successful throughput over the full reserved window. A baseline unsupported workload is `unsupported`, not zero milliseconds or infinite speedup. It contributes to capability reporting but cannot alone prove latency superiority.

Each family has a preregistered timeout equal across systems, initially 10 minutes for W1-W3, 30 minutes for W4/W5 and 10 minutes after fault injection for W6-W11. Resource-specific extensions are fixed before runs and explained. Baseline repair outside its normal path is measured as intervention, not silently performed inside a timed block. No optional stopping after a favorable trial, cherry-picked workloads or unexplained outlier removal.

## Hard superiority gates

All must pass; none alters the Directive:

1. **Actual self-development:** a real ChatGPT session makes a real dev-2 source change, validates, integrates, observes, then stages/activates that source through canonical dev-2 MCP. Zero tmcp/direct GitHub/manual deploy/scope bootstrap and zero required second-model invocation in that ordinary path.
2. **Capacity:** default configured 8; eight independent executions demonstrably overlap; C=1 works unchanged and C=16/32 pass state/identity/conflict tests. No eight-slot identity, maximum constant or public eight-item ceiling. Count running execution, not merely queued admissions.
3. **Correctness:** no authorization/isolation/identity/validation/dedup/integration violations in any scored run. All deterministic fault schedules pass; ordinary successful completion at least 99% across the aggregate scored normal trials and no more than one percentage point below either baseline. Missing live/provider proof is unknown, not a waiver.
4. **Latency and throughput against each baseline separately:** equal-weight geometric-mean median latency across comparable W1-W4 cells is at most **0.80** of baseline, with upper paired 95% confidence bound below 1.00; successful W4 eight-way throughput is at least **1.25x** baseline, lower confidence bound above 1.00. No representative cell's median regresses more than 10%; p95 must not regress more than 10% without a demonstrated measurement uncertainty requiring more trials. Both default and matched-resource tables are published; the matched-resource comparison must support the speed claim.
5. **Efficiency/operations:** normal external bootstrap and manual repair count is zero, required approval turns do not exceed either baseline; aggregate human intervention burden including recovery is at least 25% lower when baseline is nonzero, and remains zero when baseline is zero. Reduce either model/tool rounds or redundant context bytes by at least 25% against each baseline, without a >10% increase in the other. Publish provider operations, retries and repeated validation; apparent latency wins purchased by hidden extra computation/cost must be explained and cannot be called overall efficiency superiority without resource-normalized improvement.
6. **Recovery and simplicity:** response loss/restart creates no duplicate effect, independent witness work progresses, and recovery overhead is not worse than either baseline's comparable median by >10%. Normal path has no mandatory qualification round trip or legacy controller. Inventory shows one work ledger per repo, one external canonical ref, one temporary activation-record owner, routing-only installation connection state, and bounded managed-session intents in the existing ledger; no independent cloud work owner or hidden durable queue. Count auxiliary Git refs, provider-run selection, reconnect and cleanup effects as operational cost. Recovery logic is exercised by the same state machine, not a parallel recovery product. Review the actual component/effect count; LOC and four tools are not performance proof.

These numeric thresholds operationalize 'materially better' before measurement. Failing them blocks the first-release superiority claim and triggers bounded Design revision, not weakened validation or a retrospective threshold change. Unsupported baselines need additional comparable workloads or an explicit narrower result; the Directive's claim against both remains unproven until evidence suffices.

## Evidence contract

Store redacted `manifest.json`, append-only per-trial `trials.jsonl`, raw trace/log artifact hashes, `summary.json`, failure/censoring counts and a human-readable interpretation under `docs/evidence/<run-id>/` or an immutable external artifact reference with digest. Trial fields include run/trial/work/request IDs, source and release identities, fixture/profile/environment digests, capacity, cold/warm class, timing spans, counters, status, canonical old/new/tree IDs, validation identity, fault injection and intervention records. Never store OAuth/provider tokens or opaque raw environment dumps.

The benchmark driver is test-only and cannot authorize source integration or become an MCP runtime dependency. A baseline adapter translates fixture commands but never supplies missing safety checks without recording a distinct assisted baseline. Required equivalent checks may be added symmetrically to all systems, with cost included; an unsafe fast baseline is not treated as equivalent completion.

## Alternatives, failure and acceptance

A one-off demo, archived predecessor PASS or microbenchmark alone misses actual round trips and failures. Reject those as release proof. Requiring the entire benchmark for every edit would slow development and make qualification dominate normal work; run it at release/performance-decision boundaries while focused contracts run per change. Accept this Design as methodology now; mark verified only after the named layers and data exist. The first cheap falsifiers are an eight-way overlap trace, same-ref W4 with full validation, and create/push response-loss tests. Include D0003 prepared-result reuse across distinct validate/integrate actions, stale-result rejection, foreign-writer denial, and a lost-response A whose same-ref independent B progresses before A finalizes. Golden identity-codec vectors and UTF-8 range-boundary tests belong to core; real Git CAS/receipt reuse and sender-race schedules belong to integration; provider writer-boundary enforcement belongs to live. Any hidden external bootstrap or changed-byte validation instantly fails regardless of speed.

## Implementation consequences

Put layer tests under `test/core/`, `test/integration/`, `test/release/`, `test/live/` and test-only comparisons under `bench/`. Toolchain/profile descriptors are consumed identically by local, CI and the broker. No benchmark service, qualification owner or predecessor runtime is introduced into dev-2 core.

## Environment-specific early falsifiers and workload accounting

Before repeated release cohorts, run one diagnostic same-ref W4 with real complete
validation and one actual ChatGPT typed-union transcript. Record runner queue/start,
idle session amortization, network/object bytes, Worker/DO calls, reconnect, GitHub
operational refs and all stale revalidation. Never hide a cold session start in an
unmeasured setup phase unless that cell is explicitly the separately reported warm
condition. Provider plan/limits and resource-matched comparisons apply to both systems.

Include native process restart and the distinct Android sleep/force-stop/reboot
cases, device-offline admission before/after send, Worker/DO restart, missing hosted
receipt, session expiry, wrong OIDC/run, and partial edge/device activation. Run
potentially disruptive device tests only when authorized isolated execution will
not kill unrelated user work. Until performed, those specific cases remain NOT RUN.

No evidence currently justifies lowering the numeric superiority or trial gates.
They apply at release/performance decisions, not every edit or every resumed chat.
The early diagnostics reject an unsuitable architecture cheaply; they do not replace
the eventual comparable cohorts or convert a fixture into actual performance proof.
