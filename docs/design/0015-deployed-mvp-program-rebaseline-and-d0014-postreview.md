# Design 0015: deployed MVP program rebaseline and D0014 post-verification review

- Status: `verified`
- Owner decision date: 2026-08-10
- Development direction: unchanged `mvp-1a-7`; no new `mvp-*` branch
- D0014 historical final identity: `9786e6e834abe0807de341ee22ffa3908d51036a`
- D0014 independently validated source: `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0`
- Affected owners: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `docs/MCP.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`, `WORKBOARD.md`, `LINEAGE.md`, `docs/ROADMAP.md`
- Production source behavior: unchanged; one D0014 focused-test fixture/timing guard is corrected without changing `src/`
- Post-review evidence: `docs/evidence/mvp-1a-7-d0014-postreview-2026-08-10.json` (SHA-256 `469e9832affe98a52e7fa2c2c2a7908afd34f7c035c1497593294d6871c7d5fc`)

## 1. One-line definition

Reclassify the final MVP as a deployed Cloudflare/Agent/Git/MCP product-qualification program, while preserving the verified D0014 production source and closing its post-publication provenance, resource-envelope, measurement-language and verification-harness review with bounded evidence.

## 2. Repository facts and owner decision

D0014 remains the verified local repository/model execution efficiency slice. The final D0014 commit is one documentation/evidence commit above the independently validated source; no source, test, benchmark or package file changed between `bb5e665e...` and `9786e6e...`. The post-review keeps `src/repository-model-transport.mjs` byte-for-byte unchanged. A separate test-only correction described below removes a timing-sensitive false negative from the focused lifecycle falsifier.

The owner has now made the final MVP target explicit. Completion must include the Cloudflare/local-Agent object topology, real runtime deployment, Git publication integration, MCP with security configuration, required user/provider setup procedures, and final deployed end-to-end qualification. Those layers were previously documented as future/non-goal boundaries for the **then-current source slice**. They are no longer final-product non-goals. Their current implementation status remains unverified until their own Designs and provider evidence exist.

This scope change is Class 2 because it changes product acceptance, deployment, security and verification requirements. It does not itself authorize implementation of any provisional future Design.

## 3. D0014 post-verification findings

The review treats every handoff finding as a hypothesis and checks source/evidence before changing claims.

### 3.1 Confirmed strengths

- Same-base preparation reuse remains structurally valid: the independent D0014 evidence records 48 -> 5 Git calls for eight same-base Attempts and retry preparation amplification 4x -> 1x for three retries plus success.
- The rejected `0ce867...` candidate and corrected cancelled-producer handoff remain represented in the final source and focused tests.
- D0014 preserves full model-visible context, request count, process count, D0010 authority and Task retry ownership.
- POSIX descendant cleanup, Git cancellation and non-blocking observations remain lifecycle/availability improvements, not merely cache performance changes.

### 3.2 Confirmed provenance correction

Artifact `9048558724` currently reports GitHub API digest and downloaded outer-ZIP SHA-256:

`7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`

The D0014 Issue #7 completion comment recorded a different outer-ZIP value. Re-downloaded archive inspection verifies every internal `SHA256SUMS` entry by basename and verifies the embedded product-evidence SHA-256 remains:

`ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`

Therefore the supported classification is: source/product evidence intact; internal artifact manifest intact; historical outer-ZIP digest record incorrect for the currently downloadable artifact. Retained evidence does not establish why the historical value was produced, so no cause is invented.

### 3.3 Retained cache versus in-flight resource envelope

`ContextPreparationCache.maxEntries/maxBytes` bounds retained **complete** entries. Pending producers are live work and are not evicted by those retained-state limits. A bounded post-review probe with different cold bases observed concurrent pending producers scale with caller concurrency. The current local runner's `capacity` bounds the number of running Attempts within one `runCase` invocation, but the executor does not itself own a process-global preparation-memory budget across independent callers/Cases.

This does not reopen D0014 correctness: cache state is derived, restart-cold and non-authoritative, and the D0014 design already states retained bytes are not a V8/RSS guarantee. Documentation must nevertheless avoid implying that a 32 MiB retained cache is a 32 MiB total preparation-memory ceiling. The deployed AgentDO/executor design must make aggregate live-work admission/resource ownership explicit.

### 3.4 LRU capacity-plus-one review

The existing test suite already contains a bounded LRU eviction/revisit correctness falsifier. A separate 20-cycle, five-base workload with a four-entry cache produced stable semantic identity over 100 accesses. It also demonstrated the expected classic LRU churn: all five bases were cold on every cycle and repeated materialization continued. Short-soak heap after forced GC stayed approximately stable; this is not a production leak or sustained-throughput claim.

The result is a locality-dependent performance boundary, not a correctness bug. A future scheduler/persistent cache must not be selected solely to improve this synthetic pattern without evidence that deployed workload locality justifies its complexity.

### 3.5 Performance attribution and terminology

Existing evidence can separate structural causes better than exact wall-clock percentages:

- D0013 baseline -> one cold D0014 preparation isolates early preflight/unique-blob/request-construction/lifecycle changes without cross-Attempt reuse;
- D0014 cache-disabled -> cache-enabled same-base comparison isolates exact-base preparation/singleflight reuse structurally: eight materializations -> one and 40 -> 5 candidate Git calls in the post-review local probe, while eight model requests and full input bytes remain unchanged.

The independent historical `-80.6%` wall-time result is retained, but no exact percentage decomposition among subfeatures is claimed. `throughputPerSecond` in historical evidence is a bounded batch-completion calculation, not a sustained production throughput SLO. CPU observations are benchmark-parent observations unless a measurement explicitly includes children. Small repeated tail samples are comparative development evidence, not production percentile guarantees.

### 3.6 Verification-harness timing correction

Fresh-checkout repetition found one problem in the D0014 **test harness**, not in the production transport. The focused test `POSIX successful child exit closes inherited descendant pipes without a false timeout` used `timeoutMs: 200`. On the unchanged exact D0014 source in the review host, repeated isolated execution failed 9/10 times because ordinary Node child startup/parse/exit could consume that 200 ms budget before the lifecycle property was decided. The transport was correctly enforcing its configured timeout; the test had accidentally turned a deadlock guard into a startup-speed assertion, contrary to `SDD.md`.

The minimum correction changes only `test/repository-model-transport.test.mjs` and `test/model-subprocess-fixture.mjs`:

- transport timeout/deadlock guard: `200 ms -> 2,000 ms`;
- inherited-pipe grandchild writes its survival marker after 500 ms and remains alive for 5 seconds if not killed;
- the passing test waits 700 ms and requires the marker to remain absent.

With broken direct-child-exit group cleanup the grandchild survives long enough to write the marker and hold inherited pipes beyond the 2-second guard; with the D0014 implementation it is killed on direct-child exit. Thus the falsifier no longer depends on sub-200 ms Node startup while still detecting the lifecycle regression. Eighteen completed isolated repetitions after the correction passed, and the complete focused transport file passed 32/32. No `src/`, benchmark, protocol or semantic behavior changes.

## 4. Product-program decision

Add `docs/ROADMAP.md` as the normative owner for final-MVP capability decomposition, program sequencing and exit criteria. The hierarchy is:

```text
MVP Program -> Capability Group -> Design -> Verification Gate
```

The final program is divided into eight durable groups:

A. parallel execution and durable core;
B. semantic authority and persistence;
C. Git and publication;
D. repository and model execution;
E. context delivery and model input;
F. Cloudflare runtime and local Agent topology;
G. MCP, authentication and security;
H. deployment, operations and final qualification.

“MVP complete” means the deployed Level-4 qualification defined in `docs/ROADMAP.md`, not merely the current source gate.

## 5. Next decision gate

The next context/model gate is **decision-neutral**. It must remeasure D0014's post-optimization profile and compare at least full-context references, manifest/content references, deterministic ContextSlice, warm execution, streaming/lazy delivery, and hybrid staging.

ContextSlice is not preselected. It changes model-visible semantic input and therefore requires completeness, dependency expansion, deterministic identity/order/bounds, restart/retry equivalence, stale-base rejection, explicit full-context fallback or fail-closed behavior, audit evidence, and a representative quality/correctness falsifier before adoption.

A semantic-preserving full-context reference layer may be preferable first if it removes request-copy/transfer/parse duplication with lower semantic risk. Persistent CAS remains evidence-gated.

## 6. Cloudflare and MCP direction

The current architecture mapping becomes a **required final-MVP target**, not an implementation claim:

- D0010 Case authority -> CaseDO or an explicitly designed equivalent/migration;
- Agent connection epoch/delivery/capacity -> AgentDO;
- OS/Git/process/model truth -> authenticated local Agent;
- Git projection/publication -> separate fenced runtime lane;
- MCP/Worker -> authenticated/authorized ingress and projection, never Case lifecycle authority;
- R2/D1/equivalents -> conditional byte/query owners only when the selected architecture needs them.

Actual Cloudflare, MCP and provider behavior must be checked against current official provider contracts when those Designs begin. Local Node evidence does not qualify them.

## 7. Compatibility and rollback

There is no source, schema, durable-data or semantic-authority migration in D0015. Existing D0001-D0014 verified behavior is unchanged.

Documentation rollback is possible, but reverting the final-MVP scope after this owner decision would itself be another explicit product-scope decision. Provisional roadmap IDs can change without migration because they are planning labels, not data or public protocol identifiers.

## 8. Acceptance and cheapest falsifiers

D0015 is verified when all of the following are true:

1. current `mvp-1a-7` is re-read before publication and remains on the same development direction;
2. D0014 source/final identity and independent CI completion are rechecked;
3. artifact `9048558724` outer digest is independently recomputed/compared and internal manifest/product evidence are verified;
4. exact D0014 focused transport behavior remains green without production-source modification, and the timing-sensitive inherited-pipe falsifier is corrected so timeout remains only a deadlock guard;
5. a bounded capacity-plus-one LRU revisit and different-base pending-concurrency probe distinguish retained and live-work bounds;
6. summary documentation does not call bounded batch rates production throughput or parent CPU whole-system CPU;
7. `SPEC.md` no longer treats Cloudflare/Agent/MCP/deployed Git as final-MVP non-goals;
8. `ROADMAP.md` names capability groups, completion levels, user configuration gate, provisional future Designs and final deployed qualification;
9. future Design IDs are explicitly non-authorizing until accepted under `SDD.md`;
10. effective documentation diff and source status are reviewed.

## 9. Non-goals

D0015 does not:

- alter D0014 production source or benchmark implementation; the only test change is the bounded inherited-pipe falsifier timing correction in section 3.6;
- implement D0016 or any provisional roadmap Design;
- change Case/Task/Attempt/result/Claim/Promotion semantics;
- migrate D0010 authority into Cloudflare;
- implement CaseDO, AgentDO, local Agent, MCP, R2, D1 or an external model provider;
- modify tmcp logic or resolve tmcp task-visibility behavior;
- claim provider token/cost/security/deployment outcomes that were not executed.

## 10. Follow-on gate

The immediate engineering decision is D0016's per-Attempt context-delivery/model-execution comparison under the new post-D0014 cost profile. Cloudflare authority/topology and MCP threat-model research may proceed in parallel where they do not preempt that decision. The exact next implementation is selected by evidence, not by the provisional Design number.
