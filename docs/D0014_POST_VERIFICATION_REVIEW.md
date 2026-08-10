# D0014 independent post-verification review

- Review date: 2026-08-10
- Historical D0014 final identity: `9786e6e834abe0807de341ee22ffa3908d51036a`
- Independently validated D0014 source: `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0`
- D0014 product evidence SHA-256: `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`
- Post-review evidence: `docs/evidence/mvp-1a-7-d0014-postreview-2026-08-10.json` (SHA-256 `469e9832affe98a52e7fa2c2c2a7908afd34f7c035c1497593294d6871c7d5fc`)
- Product-source changes from this review: none
- Test-only changes from this review: inherited-pipe lifecycle falsifier timing/fixture robustness; no production transport behavior change

This review was initiated after canonical D0014 publication. Handoff observations were treated as hypotheses, not authority. The review therefore distinguishes a source correctness defect from a provenance/documentation discrepancy, a bounded measurement limitation, and a future product-resource contract.

## 1. Confirmed D0014 strengths

D0014 remains a strong verified vertical slice.

1. **Preparation amplification was structurally removed for exact same bases.** The independent D0014 evidence retains eight same-base Attempts at `48 -> 5` Git commands and one through four Attempts of retry preparation at `1/2/3/4x -> 1x`. Full request bytes and model-process starts remain proportional to Attempts.
2. **The 75% interpretation is correctly separated.** Four identical full-context requests predict `(4 - 1) / 4 = 75%`; D0013's real contribution was absolute repository/context/Git/request/process/retry measurement.
3. **The rejected candidate is meaningful correctness evidence.** `0ce867...` passed an earlier gate but was rejected before canonical publication after the all-reader-cancelled handoff race was reproduced. `bb5e665...` removes the doomed pending entry before abort and protects a replacement producer by entry identity.
4. **Lifecycle correctness improved with efficiency.** POSIX process-group cleanup, inherited-pipe false-timeout prevention, Git cancellation and observation-sink decoupling close availability/failure boundaries in addition to reducing work.
5. **Authority is unchanged.** D0010 Case head/semantic root and Plan `baseDigest` remain authority. Cache/preparation/encodings/observations are derived and disposable.
6. **Source-to-final provenance is clean.** `9786e6...` is one documentation/evidence commit above `bb5e665...`; there is no post-validation source/test/benchmark/package mutation.

## 2. Confirmed corrections needed

### 2.1 Final artifact outer-ZIP digest

GitHub Actions artifact `9048558724` currently reports:

`sha256:7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`

A fresh download of the artifact ZIP hashes to the same value. The D0014 Issue #7 completion comment instead recorded:

`sha256:7578976e5bea19ef1b8efbb757a19f3c46c9337e06c9b7d7e589d4f595c434a6`

The old value must not be reused as the outer-ZIP digest. The archive contents themselves remain intact: every internal `SHA256SUMS` entry rehashes correctly after basename normalization, and the embedded product-evidence file hashes to the canonical `ca22551d...f610` value.

The retained evidence is sufficient to correct the digest record but **not sufficient to prove why the historical value differed**. The cause is therefore recorded as unresolved rather than guessed.

### 2.2 Retained-cache wording

The default `4 entries / 32 MiB` and configured maxima are retained-complete-state limits. They are not an aggregate memory/RSS ceiling for simultaneously active cold preparations. Summary documents must state this explicitly.

### 2.3 Performance terminology

Historical raw evidence keys such as `throughputPerSecond` remain unchanged. Human-facing summaries should call the value a **bounded/effective batch completion rate** and not sustained production throughput. CPU measurements must identify the benchmark-parent scope unless children are explicitly aggregated. Repeated p50/p95/p99 values remain bounded comparative samples, not production SLO percentiles.

## 3. Additional risks verified or ruled out

### 3.1 In-flight different-base memory/resource bound — verified as a separate boundary

The cache eviction loop applies `maxEntries/maxBytes` only to `state === 'complete'` retained entries. Pending producer records are live work. A post-review probe with approximately 512 KiB semantic content per distinct base and a `4 / 32 MiB` retained cache observed:

| Concurrent distinct cold bases | Git calls | max active batch producers | sampled peak heap |
| ---: | ---: | ---: | ---: |
| 1 | 5 | 1 | 6.69 MiB |
| 4 | 20 | 3 observed | 14.66 MiB |
| 8 | 40 | 8 | 29.47 MiB |

The exact memory values are environment/sample observations, not a capacity formula. The important falsifier is structural: eight different keys can remain pending concurrently even though the retained cache has `maxEntries: 4`.

`runCase` bounds active Attempts by its configured capacity **within one runner invocation**. Direct executor calls or multiple Cases sharing one executor are not covered by an executor-global D0014 memory budget. This is a deployed scheduling/resource-ownership question for the future AgentDO/executor layer, not a D0014 semantic correctness failure.

### 3.2 LRU capacity-plus-one churn — correctness stable, locality cost exposed

The source suite already tests eviction and revisit correctness. The post-review bounded soak used five distinct bases with a four-entry cache in the repeating order `A B C D E` for 20 cycles (100 accesses).

Observed:

- 500 Git calls total = five cold preparations per cycle;
- 100 batch blob reads = every access cold under this cyclic LRU pattern;
- semantic/context identity stable across every revisit;
- forced-GC heap after cycle 5: 6,066,400 bytes;
- forced-GC heap after cycle 20: 6,147,000 bytes;
- RSS moved from 68,554,752 to 76,984,320 bytes over the same observation window.

The heap observation does not indicate monotonic retained-state growth in this short soak; RSS is allocator/process high-water evidence and cannot prove absence or presence of a production leak. Throughput for this locality pattern predictably falls back toward repeated cold materialization. That is a cache-locality limitation, not stale-entry or semantic corruption evidence.

### 3.3 Causal attribution — bounded structurally, exact percentage decomposition not claimed

A local same-base-eight ablation against the exact final source compared D0014 with cache enabled versus `contextCache: false`:

| Metric | cache enabled | cache disabled |
| --- | ---: | ---: |
| context materializations | 1 | 8 |
| Git calls | 5 | 40 |
| Git stdout | 1,803,395 | 14,427,160 bytes |
| model calls | 8 | 8 |
| model input | 15,071,128 | 15,071,128 bytes |
| local wall | 3,225.5 ms | 5,731.4 ms |

The local timings are not substituted for the independent Ubuntu benchmark. The structural counts isolate exact-base reuse: request/model amplification is unchanged while preparation amplification disappears. The independent D0014 same-base-one result separately captures cold-path/request-construction improvements without cross-Attempt reuse. Because concurrent stages interact nonlinearly, the historical `-80.6%` wall reduction is not decomposed into invented additive percentages.

### 3.4 Existing measurement scope — mostly sound, summaries tightened

The full D0014 audit already documents warm cache effects, light fixture-model limitations, missing physical disk-byte evidence, parent-only CPU attribution, sampled RSS/heap limits, missing exact allocation/GC/child peak memory and small tail samples. The post-review change is therefore wording discipline in owner summaries, not a new benchmark claim.

## 4. Unresolved / evidence-insufficient observations

- The retained evidence does not reconstruct the origin of the old outer-ZIP digest.
- The bounded LRU soak is not a production memory-leak or sustained-throughput qualification.
- The in-flight probe does not define an exact bytes-per-preparation memory formula; allocator, Git child and intermediate representations vary.
- Provider token, billing, latency, model-quality and data-residency effects remain unmeasured because D0014 uses a trusted local subprocess.
- Cross-process/fleet context reuse ROI remains unknown.
- A safe deterministic ContextSlice completeness/quality contract is not yet accepted.

### Verification-harness correction

A fresh-checkout rerun exposed a test-only issue after the initial 32/32 post-review pass. The inherited-descendant-pipe falsifier used a 200 ms model timeout. On the unchanged D0014 production source in this review host, isolated repetition failed 9/10 times because normal Node child startup could exceed that budget. This does **not** show a production lifecycle defect: the executor correctly timed out at its configured limit. It shows the test used timeout as a startup-performance assertion rather than only a deadlock guard.

The focused fixture/test is therefore minimally corrected: the transport guard is 2 seconds, while an un-killed grandchild writes a marker at 500 ms and keeps inherited pipes alive for 5 seconds. Broken direct-child-exit cleanup still fails deterministically, but healthy execution no longer requires a sub-200 ms child startup. Eighteen completed isolated repetitions and the full focused file (32/32) passed after the correction. `src/repository-model-transport.mjs` remains unchanged.

## 5. Next-gate decision

D0014 moved the bottleneck. Same-base repository preparation is no longer multiplied by every Attempt in the validated executor-local case, but each Attempt still carries a complete canonical repository request and starts a model process.

The next Class 2 gate must therefore compare post-D0014 delivery/execution alternatives rather than preselect ContextSlice:

- full-context immutable reference transport;
- immutable manifest plus content references;
- deterministic ContextSlice;
- warm executor/process;
- streaming/lazy delivery;
- a hybrid sequence such as full-context references first, then remeasure before reducing model-visible semantics.

A reference-based full-context layer deserves first-class consideration because it may reduce copy/transport/parse cost without changing the repository content visible to the model. ContextSlice remains valuable for input/disclosure minimization, especially before an external provider, but it is a semantic-input change and requires a stronger correctness/quality contract.

## 6. Answers to review questions A-J

**A — Are `48 -> 5` Git calls and retry `4x -> 1x` still valid?**
Yes. They remain in the canonical evidence and match the final source's one-producer/exact-base behavior. The post-review cache on/off ablation independently reproduces the structural preparation reduction.

**B — Does the finite cache bound include concurrent pending preparation memory?**
No. `maxEntries/maxBytes` bounds retained complete entries. Pending different-key producers are live work. Runner capacity is a caller-side concurrency bound for one run; D0014 has no executor-global aggregate memory budget.

**C — Is capacity-plus-one LRU churn stable?**
Correctness was stable in the bounded 100-access probe and the existing eviction regression remains green. The `A B C D E`/capacity-4 pattern intentionally thrashes to cold materialization; no production memory or sustained-throughput conclusion is claimed.

**D — Are CPU/throughput/tail metrics accurately scoped?**
The full audit already contains the necessary limitations. Summary wording is tightened so throughput is a bounded batch completion rate, CPU is not represented as whole-system CPU, and small tail samples are not SLO percentiles.

**E — What is the correct outer ZIP SHA-256 and why did it differ?**
The correct currently downloadable outer ZIP SHA-256 is `7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`. GitHub API metadata and re-downloaded bytes agree. The old Issue value is incorrect for that ZIP; the retained evidence does not prove its historical origin.

**F — What is the largest remaining cost after D0014?**
The remaining repeated boundary is per-Attempt full repository request construction/copy/transport/receiver parsing plus one model/executor invocation/start per Attempt. Which substage dominates in the final provider/runtime must be remeasured after integration.

**G — Must ContextSlice be the first way to remove it?**
No. The next gate is decision-neutral.

**H — Is full-context reference transport worth evaluating before or with ContextSlice?**
Yes. It may preserve model-visible semantics while removing a lower-risk layer of byte/copy/parse duplication and may be staged before ContextSlice.

**I — Is the ContextSlice correctness contract currently closed?**
No. If selected, it must define commit/`baseDigest`/instruction binding, deterministic selection and dependency expansion, ordering and limits, slice identity, retry/restart/cold-hit equivalence, stale-base rejection, explicit fallback/fail behavior, auditability, and a representative correctness/quality falsifier against full context.

**J — Should D0014 remain verified?**
Yes. No production-source correctness defect was found. The confirmed changes are provenance correction, resource-envelope clarification, measurement wording, one timing-sensitive focused-test correction, and future-gate rebaselining. `src/repository-model-transport.mjs` is not rewritten.

## 7. Program consequence

The product target has separately been rebaselined by Design 0015. Cloudflare CaseDO/AgentDO, authenticated local Agent execution, deployed Git integration, secured MCP, user/provider setup and final deployed qualification are final-MVP requirements rather than permanent non-goals. See `docs/ROADMAP.md` for the capability-group program and provisional follow-on Designs.
