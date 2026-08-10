# D0014 repository/model transport product-efficiency audit

- Date: 2026-08-10
- Repository: `humtr/tdev`
- Development direction: `mvp-1a-7` (unchanged)
- Audited D0013 baseline: `3baa86a133b12b5f433b4d4a053528dd559f5371`
- Accepted design commit: `74ebcd3e70de052225fb34ae15037bf8a5f10c04`
- Independently validated source candidate: `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0`
- Root Task: GitHub issue `humtr/tdev#7`
- Checked evidence: `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json`
- Evidence SHA-256: `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`

This report distinguishes structural predictions, measured absolute costs, newly discovered failure/scalability risks, unresolved hypotheses, and ruled-out claims. Percentages are not treated as sufficient priority evidence without absolute cost, frequency, scaling, correctness, and implementation-complexity context.

## 1. Current authority

Remote inspection identified `mvp-1a-7@3baa86a133b12b5f433b4d4a053528dd559f5371` as the latest active `mvp-*` development line at audit start. `mvp-1a-7` is an architectural direction, not a revision label. D0014 changes no semantic owner or fundamental execution family, so the implementation remains on and will fast-forward that same branch.

Authority continuity is:

```text
D0010 Case head
  -> D0010 semantic root
  -> Plan baseDigest
  -> derived D0013/D0014 repository context and model transport
  -> existing result acceptance / fencing / Claim validation
  -> Promotion
  -> derived D0011 Git projection
  -> derived D0012 remote publication
```

The cache, in-flight producer record, immutable preparation, canonical encodings, locality facts, and observations are disposable derived state. They cannot elect current state, authorize an Attempt, satisfy a Claim, accept a result, move the Case head, or publish a Git ref.

### Authority-document state before mutation

| Document or input | State | Resolution |
| --- | --- | --- |
| root `AGENTS.md` | present/readable | applied; no closer nested `AGENTS.md` exists |
| `RULE.md`, `SDD.md`, `WORKBOARD.md`, `LINEAGE.md` | present/readable | no unresolved ownership conflict |
| `docs/SPEC.md`, `ARCHITECTURE.md`, `PROTOCOL.md`, `SECURITY.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `MVP.md`, `MCP.md`, `IMPLEMENTATION_REPORT.md` | present/readable | affected owners identified |
| D0013 design/source/tests/benchmark/evidence | present/readable | baseline reproduced and re-instrumented |
| D0010/D0011/D0012 continuity designs | present/readable | semantic and publication boundaries preserved |
| public contract, persistence, migration, rollback ambiguity | none requiring invention | D0014 is additive, process-local, and schema-free |
| historical 75% interpretation | semantically misleading in current prose, not a data conflict | historical values retained; interpretation corrected |

### Frozen scope and acceptance

In scope are repository commit resolution, tree/blob preparation, decode/validation/hash/encoding, request construction, process lifecycle, retry/cancellation, same-base and multi-base parallel behavior, memory/CPU/I/O observations, failure paths, security boundaries, owner documents, evidence, and exact remote publication.

Non-goals remain external commercial LLM integration, tokenizer/accounting, provider billing, Cloudflare deployment, distributed Claim redesign, locality scheduling, unrelated MCP/persistence/publication redesign, semantic authority migration, persistent Context CAS, and automatic relevance inference.

Migration is empty because no durable semantic or cache schema is introduced. Rollback is `contextCache: false` or source revert; restart/cache loss performs a cold rebuild. Verification is exact-source Ubuntu/POSIX regression, coverage, focused correctness/failure tests, benchmark integrity, evidence hashing, clean diff, and independent remote SHA verification.

## 2. What was predictable

D0013 deliberately defined a full-repository/process-per-Attempt baseline. The following costs were available from design inspection before any benchmark:

- every Attempt traverses/materializes the complete supported repository context;
- every Attempt constructs and sends a complete full-context request;
- if the same context is sent exactly `N` times, repeated context after the first copy is `(N - 1) / N`;
- at `N = 4`, that repeated fraction is exactly 75%;
- Task retry repeats the same repository/context/process execution path;
- one process starts per Attempt and there is no process reuse;
- context scope follows repository size rather than task-specific relevance;
- same-base parallel Tasks can duplicate identical preparation approximately linearly;
- request/provider exposure remains full-repository unless a separate slice/reference contract exists.

The 75% ratio was therefore not a new experimental finding and is not, by itself, a reason to select CAS or ContextSlice. It is a property of the selected execution shape.

## 3. What D0013 actually measured

Historical D0013 evidence remains unchanged. It measured one real source candidate at 101 files and 1,757,785 context bytes. Four Attempts requested 7,031,140 context bytes; 5,273,355 were repeated; one retry reconstructed 1,757,785 bytes; four processes started with zero reuse. Those absolute values and the observed Git/process durations were new information.

The D0014 audit used the exact active audit-start commit, which had 102 files and 1,788,423 content bytes. Its canonical request was 1,883,891 bytes per same-base Attempt. This is a different exact source identity from the historical D0013 probe, so the 101-file and 102-file measurements are not conflated.

The exact baseline benchmark confirmed that executor preparation is more strongly coupled to whole-repository size and Attempt count than to useful Task complexity. At eight same-base Tasks, baseline Git plumbing ran 48 commands, delivered 14,420,672 stdout bytes, constructed 15,071,128 request bytes, and took 5,287.2 ms. The useful instruction did not cause eight distinct repository contexts; execution shape caused eight complete preparations.

## 4. Previously known product problems

The known A-X set was audited against code, tests, benchmarks, and failure injection rather than treated as a predetermined implementation plan.

| Area | Finding | Classification after audit | D0014 action |
| --- | --- | --- | --- |
| A. Full repository O(N) materialization | cold execution traverses all supported files regardless of Task relevance | confirmed | cold path remains O(N); repeated exact-base preparation is reused |
| B. Repeated scan/hash/serialization | Git, decode, validation, semantic hash, descriptor and canonical repository encoding repeat per Attempt | confirmed | preparation/encoding reused; per-Attempt invocation/request assembly remains |
| C. Retry amplification | preparation, request and process work repeated with Attempt count | confirmed | preparation amplification collapses to 1 per exact base; request/process amplification remains |
| D. Parallel-first same-base duplication | identical preparation grows nearly linearly with concurrency | confirmed, core product problem | exact-key single-flight plus bounded reuse |
| E. Multi-base behavior | savings depend on base locality | confirmed | one producer per distinct base; no global serialization |
| F. Irrelevant context transfer | full repository is sent independent of instruction relevance | confirmed | not solved; no token/provider claims |
| G. Process-per-Attempt cold start | fresh process per Attempt | confirmed but lower current ROI | measured and deferred |
| H. Memory amplification | Git buffers, decoded strings, file records, canonical encodings, request buffers and child parse coexist | confirmed | reduced preparation copies/heap; full request copies remain |
| I. Backpressure/streaming absence | request is materialized as one body; child parses full JSON | confirmed | deferred; early preflight added |
| J. Cancellation waste | Git preparation continued after cancellation | confirmed | AbortSignal propagated to Git; stage-boundary checks added |
| K. Executor capacity pressure | full-context copies reduce effective concurrency | confirmed | same-base preparation pressure reduced; request/process capacity remains |
| L. Tail latency | same-base contention and repeated preparation drive tail | confirmed | repeated p50/p95 measured and reduced |
| M. Throughput | single-Attempt latency alone hid capacity loss | confirmed | throughput made an acceptance metric |
| N. Benchmark distortion | warm caches, fixture model, order effects and sample counts can bias results | confirmed limitation | explicitly recorded; no production SLO claim |
| O. Instrumentation blind spots | disk bytes, allocations, GC events and child CPU were not directly attributable | confirmed limitation | Git/request/stage/cache metrics added; residual unknowns retained |
| P. External provider scalability | full-context bytes could become network/token/billing/residency cost | plausible, unverified | provider contract deferred; no quantified savings |
| Q. Data minimization/security | full context violates future minimum-necessary disclosure goals | confirmed architectural gap | explicitly documented as next provider/slice boundary |
| R. Cache stampede | a new cache could duplicate cold production or hand a fresh reader to a doomed producer | design-introduced risk, including one newly discovered handoff race | one producer/many readers; failed/aborting producers are removed before replacement admission |
| S. CAS corruption/poisoning | persistent CAS would require atomicity/corruption recovery | not applicable to selected process-local design | no persistent CAS or injection API; exact binding/fail-closed admission |
| T. GC/eviction/growth | cache could grow without bound | design-introduced risk | finite LRU by entries and conservative bytes; restart cold |
| U. Shared-state contention | reuse could serialize unrelated bases | design-introduced risk | per-key in-flight state; different-base concurrency test |
| V. Retry storm | parallel failures multiply preparation/process/provider work | partially confirmed | preparation storm reduced; process/provider request storm remains |
| W. Large-response path | stdout/stderr and parsing can amplify memory/retry | bounded but not fully scaled | byte bounds retained; large-response cliff remains unverified |
| X. Result-only boundary | direct repository mutation would weaken correctness | valuable and retained | model returns result only; no mutable shared worktree |

### End-to-end code path

| Stage | Owner | Repeated or blocking cost found | Current state |
| --- | --- | --- | --- |
| Task admission -> Plan -> Attempt | existing engine/runner | no D0014 authority change | retained |
| base identity | Plan `baseDigest` + Task commit OID | exact identity required | retained and included in cache key |
| object format/commit/tree resolution | Git transport | repeated process calls | once per cold exact-base preparation |
| tree enumeration | Git `ls-tree -r -z -l` | O(files), previously lacked byte preflight | still O(files); bounds checked before blob body reads |
| blob read | Git batch | O(logical blobs), duplicate OID rereads | one read per unique blob OID per cold preparation |
| path/UTF-8/mode/tree validation | transport/policy/Promotion validators | repeated per Attempt | once per preparation; failures never retained |
| semantic/context digest | D0010 digest + D0013 descriptor | repeated per Attempt | once per preparation |
| request construction | D0013 transport | repeated clone/escape/hash/copy of repository portion | immutable canonical repository chunks reused; invocation remains per Attempt |
| process admission/spawn | transport | one process per Attempt | unchanged |
| stdin/response/parse | transport | full request and full-body response buffer | unchanged except bounded lifecycle cleanup |
| retry/cancellation | Task retry + AbortSignal | full reconstruction and uncancelled Git | exact-base preparation reused; Git cancellable; no hidden retry |
| acceptance/Promotion | engine | isolation/correctness boundary | unchanged |
| D0011/D0012 publication | publication adapters | unrelated derived path | unchanged |

## 5. Newly discovered problems

The audit found nine issues that were not represented by the historical repeated-byte ratio. The ninth was found during independent pre-publication review of the first verification candidate, so that candidate was rejected before the canonical branch moved.

1. **Canonical request construction was larger than current local process startup.** D0013 repeatedly cloned, canonicalized, hashed, escaped, parsed/copied and buffered the complete context. The real-process fixture measured baseline aggregate scan at 1,824 ms and model process time at 439 ms across ten Attempts; a large remainder was request/context preparation. After repository encoding reuse, process time was essentially unchanged while total wall time fell sharply.
2. **Repository size limits were enforced after blob buffering.** The baseline could read a complete oversized batch response before rejecting semantic tree size. Early `ls-tree -l` preflight is both a performance and resource-exhaustion fix.
3. **Duplicate blob OIDs were loaded and decoded repeatedly inside one materialization.** One thousand paths to one 10,000-byte blob produced about 10.123 MB Git stdout in the baseline. Candidate Git stdout was 0.088 MB while the logical 10.247 MB request remained unchanged.
4. **Model descendants could survive direct-child cleanup.** Timeout/error cleanup targeted only the direct process, allowing descendant CPU/I/O/descriptors to continue after an Attempt was unacceptable.
5. **Git preparation lacked cancellation.** A pre-aborted invocation and an abort during batch preparation could still spend nearly a complete materialization before returning.
6. **Request-size rejection occurred after complete context preparation/serialization.** The transport could perform expensive work whose final request was already guaranteed to exceed the configured bound.
7. **Inherited descendant pipes could convert a valid result into a false timeout.** Node's `close` waits for inherited stdout/stderr handles. Cleanup only on timeout/close was too late; group cleanup must begin at direct-child `exit`.
8. **A non-authoritative asynchronous observation sink could block completion indefinitely.** Awaiting a never-settling observer made instrumentation an accidental availability owner while its delay was not represented in the transport duration metric.
9. **Cancelled-producer handoff could poison a fresh reader.** When all current readers cancelled, the shared Git producer was aborted but its pending entry remained discoverable until the producer rejection settled. A new healthy reader arriving in that window joined the doomed producer and inherited `git_process_aborted`. The fix removes that exact pending entry from lookup before aborting it, marks it `aborting`, and relies on entry-object identity checks so the old producer cannot delete or overwrite a replacement producer.

Bounded local failure probes made the final three lifecycle issues explicit. D0013 returned `model_transport_timeout` after 1,218.4 ms and left the descendant alive; the intermediate candidate killed the descendant but still returned a false timeout after 323.6 ms; the final source returned the valid result in 146.4 ms and left no descendant. A never-settling observer changed from a 313.0/301.8 ms probe timeout to a successful result in 71.7 ms. For cancellation handoff, source `0ce86773f4b9a66607dd0d86b9833338279db2d2` produced `model_transport_aborted`, `model_transport_aborted`, then `git_process_aborted` for the fresh third reader with only one producer start; source `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` produced the same two caller cancellations followed by a successful third reader with two producer starts. These are failure-injection observations, not production latency claims.

## 6. Ruled-out / unverified

### Ruled out or not applicable

- **75% as a novel discovery:** ruled out; it follows directly from `(N - 1) / N` at four identical requests.
- **Warm process as the highest-ROI current fix:** ruled out for this fixture. Ten real process starts consumed an aggregate 439 ms baseline and 451 ms candidate, while repeated local preparation dominated the removable work.
- **A global cache-lock regression:** ruled out by the different-base concurrency test and per-key implementation.
- **Successful 100 MiB context operation:** contractually unavailable under the current 16 MiB semantic tree limit. The relevant audit target was early rejection, not extrapolated success.
- **Persistent CAS partial-write/corruption/GC risk in this change:** not applicable because D0014 adds no persistent CAS, manifest file, temp publication or disk schema.
- **Semantic-authority change:** ruled out by exact code path, optional disablement, restart-cold behavior and unchanged acceptance/Promotion/publication owners.

### Suspected but unverified

- physical filesystem bytes, block-cache misses and truly cold page-cache behavior;
- exact allocation counts, copy counts and per-stage GC pauses;
- Windows process-tree cleanup semantics;
- production model/provider latency, tokens, billing, retry charges, network egress, privacy/residency and quality;
- cross-process/cross-worker cache economics and persistent CAS operational cost;
- deterministic task-relevance/dependency expansion sufficient for a safe ContextSlice;
- large-response scaling and child parser memory below the existing byte ceiling;
- production scheduler interaction, locality value and resource admission at larger executor fleets.

“Unknown due to instrumentation” is not treated as “no problem.”

## 7. Product-level highest-risk bottleneck

The highest current product-level bottleneck was not the 75% fraction. It was the multiplicative combination:

```text
whole-repository preparation cost
  x Attempt count
  x retry count
  x same-base parallel concurrency
  + full request copy/transport per Attempt
  + failure paths that could continue or falsely retry work
```

At the current actual repository, eight same-base Tasks caused 48 Git calls and 14.421 MB of Git stdout for one immutable base, while process/request behavior was otherwise identical. Under retry, the preparation amplification factor was exactly the number of Attempts. This directly reduces executor throughput and effective parallel capacity and creates a larger product risk than the percentage label alone.

The next highest unresolved risk is different: the complete repository is still copied into every model request. That does not dominate the selected local fixture after preparation reuse, but it becomes the primary scalability, data-minimization and future provider-egress boundary.

## 8. Alternatives considered

| Candidate | Cost removed | Cost retained/new risk | Decision |
| --- | --- | --- | --- |
| immutable manifest only | some tree metadata derivation | blob/decode/validation/request work remains | insufficient first slice |
| per-commit materialization cache | same-process preparation | exact semantic binding and bounds required | included with stronger key |
| persistent content-addressed store | cross-process rebuild | atomic publication, corruption, permissions, GC, disk pressure, migration | deferred |
| deterministic ContextSlice | irrelevant request bytes/disclosure | selection/dependency correctness not defined by free-form instruction | next contract, not guessed |
| request manifest + content references | provider/network repetition | provider fetch/reference/auth semantics absent | deferred |
| incremental context delta | unchanged bytes across related commits | receiver state, lineage and recovery complexity | deferred |
| same-base shared preparation | Git/decode/validation/hash/encoding duplication | full request/process remains | selected |
| warm executor/process pool | process startup/init | dominant current preparation and request cost remains; lifecycle complexity | lower ROI now |
| streaming/lazy retrieval | some peak memory/backpressure | canonical one-body protocol and relevance still unresolved | deferred |
| mmap/file-backed representation | some heap copies | portability/lifecycle complexity; does not minimize egress | deferred |
| bounded reuse + preflight + lifecycle cleanup | dominant repeated local work and high-risk failure waste | full request/process remains | selected vertical slice |

## 9. Chosen fix

D0014 implements an optional bounded executor-local immutable preparation cache with exact identity and single-flight behavior:

- key scope: normalized repository executor instance, context profile, object format, exact immutable commit OID and expected `baseDigest`;
- default finite LRU: four entries / 32 MiB conservative retained estimate;
- maximum configuration: 64 entries / 256 MiB;
- one producer for a cold exact key; concurrent readers share the result;
- different keys prepare concurrently;
- producer failure is removed and never cached;
- one reader may cancel without poisoning peers; all-reader cancellation aborts Git;
- oversized preparations can be shared in flight but are not retained;
- eviction removes only the cache reference; active immutable readers remain safe;
- restart or `contextCache: false` performs the D0013 cold path.

The producer preflights modes, paths, entry count, per-file size and logical tree bytes from `ls-tree -l`, reads each unique blob OID once, validates exact OID/type/size/UTF-8/tree semantics, proves the observed semantic digest equals the authoritative `baseDigest`, and only then admits a frozen preparation.

The canonical repository descriptor and file-array encodings are retained. Each Attempt still canonicalizes its invocation, computes the exact request digest and constructs one final stdin body. Request semantics and bytes are unchanged.

## 10. Why

This fix had the best evidence-weighted ROI:

- **impact/frequency:** every Attempt used the path; parallel-first and retry multiplied it;
- **absolute cost:** same-base 8 took 5.638 s and 48 Git calls at the exact baseline;
- **scaling severity:** preparation grew with repository size, concurrency and retry count;
- **throughput/memory:** candidate throughput and heap improved materially while full result semantics stayed identical;
- **correctness:** immutable exact-base work is safely reusable after one complete verification;
- **complexity:** process-local state avoids persistent publication, corruption, migration, GC and cross-repository permission contracts;
- **reversibility:** disablement restores the cold path; no data downgrade exists;
- **future usefulness:** exact identity/manifest-like preparation boundaries support later deterministic slices or provider references without becoming authority;
- **evidence confidence:** actual repository, synthetic shape, retry, concurrency, cancellation and independent POSIX tests all support the decision.

A persistent CAS or automatic ContextSlice might eventually yield larger cross-worker or egress savings, but implementing either before its corruption/GC or relevance/security contract would trade a measured local problem for a larger correctness/operational risk.

## 11. Implementation

Source changes are bounded to transport/benchmark/test surfaces:

- `src/repository-model-transport.mjs`
  - exact-key `ContextPreparationCache` with finite LRU and single-flight;
  - immutable prepared descriptor/files/canonical encodings;
  - early `ls-tree -l` size/path/mode preflight;
  - unique-blob batch loading and exact response binding;
  - stage/cache/Git/request/process observations;
  - request chunk hashing/assembly without re-canonicalizing repository data;
  - POSIX process-group creation and cleanup on abort, timeout, overflow and direct-child exit;
  - non-blocking non-authoritative observation completion.
- `src/git-projection.mjs`
  - optional validated AbortSignal for read-only Git commands;
  - bounded abort/error/close settlement.
- `bench/repository-model-transport-efficiency.mjs`
  - 22 actual/synthetic/retry/failure scenarios and resource observations.
- `test/repository-model-transport.test.mjs`
  - exact identity, single-flight, multi-base concurrency, cancellation, eviction/restart, size preflight, duplicate blobs, retry, process descendants and observation failure tests.
- `test/model-subprocess-fixture.mjs`
  - process-tree and inherited-pipe failure fixtures.
- owner documents and checked evidence
  - predictable versus measured interpretation, operations/security/rollback/provider boundaries and next gate.

No hidden retry, model mutation, shared mutable worktree, provider call, semantic store or new `mvp-*` branch was introduced.

## 12. Correctness preservation

The optimization cannot create success from stale or wrong context:

- commit OID alone is insufficient; a cold producer must rebuild the semantic path-to-text tree and match `baseDigest` before admission;
- object format, commit, tree rows, blob OID/type/size, modes, paths, UTF-8 and tree policy are verified;
- changed commit plus same semantic content is a different cache key and is rebuilt;
- wrong `baseDigest`, malformed Git output, unsupported mode, invalid UTF-8, producer abort/failure and oversized input fail closed and are not retained;
- cold/no-cache/cache-hit execution produces identical canonical request semantic content for identical invocation input;
- request digest still binds exact repository and Attempt/Plan/fencing identity;
- model output remains result-only and passes existing result, Claim, fencing, Plan and Promotion validation;
- cache loss/restart/eviction reconstructs from the immutable Git commit and authoritative `baseDigest`;
- observations are non-authoritative and cannot block or change completion.

There is no semantic migration and no rollback data transformation.

## 13. Performance result

All values below are from independent Ubuntu 24.04.4 / Node v22.23.1 / Git 2.54.0 validation of exact baseline and exact candidate. They are local benchmark evidence, not production SLOs.

### Same immutable base

| Tasks / one base | Wall ms baseline | Candidate | Change | Throughput baseline | Candidate | Git calls | Git stdout | Request bytes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 672.6 | 206.2 | -69.3% | 1.487/s | 4.850/s (+226.2%) | 6 -> 5 | 1.803 MB -> 1.803 MB | 1,883,891 -> 1,883,891 (0.0%) |
| 2 | 1,429.5 | 346.9 | -75.7% | 1.399/s | 5.766/s (+312.1%) | 12 -> 5 | 3.605 MB -> 1.803 MB | 3,767,782 -> 3,767,782 (0.0%) |
| 4 | 2,647.4 | 537.1 | -79.7% | 1.511/s | 7.447/s (+392.9%) | 24 -> 5 | 7.210 MB -> 1.803 MB | 7,535,564 -> 7,535,564 (0.0%) |
| 8 | 5,287.2 | 1,027.2 | -80.6% | 1.513/s | 7.788/s (+414.7%) | 48 -> 5 | 14.421 MB -> 1.803 MB | 15,071,128 -> 15,071,128 (0.0%) |

The candidate improves local preparation and request-encoding efficiency but deliberately does **not** reduce model stdin bytes.

### Real Node subprocess, ten serial Attempts

| Metric | D0013 baseline | D0014 candidate | Change |
|---|---:|---:|---:|
| Wall time | 6,331.2 ms | 569.4 ms | -91.0% |
| Throughput | 1.579/s | 17.563/s | +1012.0% |
| p50 Attempt latency | 629.4 ms | 47.5 ms | -92.5% |
| p95/max Attempt latency | 658.1 ms | 138.7 ms | -78.9% |
| CPU user | 6,497.1 ms | 114.4 ms | -98.2% |
| CPU system | 441.0 ms | 49.1 ms | -88.9% |
| Peak RSS | 416.37 MiB | 400.61 MiB | -3.8% |
| Peak heap | 261.33 MiB | 33.60 MiB | -87.1% |
| Git calls | 60 | 5 | -91.7% |
| Git stdout | 18.026 MB | 1.803 MB | -90.0% |
| Request bytes | 18,839,030 | 18,839,030 | 0.0% |
| Process starts | 10 | 10 | 0.0% |
| Aggregated scan time | 1,848 ms | 87 ms | -95.3% |
| Aggregated process time | 441 ms | 429 ms | -2.7% |

Parent CPU observation does not fully attribute child CPU. The unchanged process-start count and similar aggregated process time are the important comparison: warm-process work would not have removed the dominant measured local cost.

### Bounded scaling/failure workloads

| Workload | Baseline wall ms | Candidate | Change | Git stdout | Request bytes | Peak RSS |
|---|---:|---:|---:|---:|---:|---:|
| 1 MiB / 128 files | 539.7 | 128.8 | -76.1% | 1.064 -> 1.065 MB | 1,081,029 unchanged | 201.71 -> 196.68 MiB (-2.5%) |
| 10 MiB / 160 files | 4,610.1 | 992.2 | -78.5% | 10.505 -> 10.507 MB | 10,526,249 unchanged | 1255.98 -> 839.82 MiB (-33.1%) |
| 5,000 small files | 850.0 | 293.7 | -65.4% | 1.605 -> 1.645 MB | 2,206,847 unchanged | 300.34 -> 209.04 MiB (-30.4%) |
| eight 1 MiB files | 2,918.0 | 831.4 | -71.5% | 8.390 -> 8.390 MB | 8,392,393 unchanged | 1017.54 -> 671.25 MiB (-34.0%) |
| deep 1 MiB tree | 516.7 | 133.8 | -74.1% | 1.087 -> 1.088 MB | 1,126,088 unchanged | 216.39 -> 194.38 MiB (-10.2%) |
| wide 5,000-file tree | 856.9 | 290.2 | -66.1% | 1.605 -> 1.645 MB | 2,206,829 unchanged | 300.59 -> 208.82 MiB (-30.5%) |
| 1,000 paths / one 10 KB blob | 5,524.9 | 1,346.1 | -75.6% | 10.123 -> 0.088 MB | 10,246,622 unchanged | 1232.55 -> 725.38 MiB (-41.1%) |
| oversize rejection | 22.0 | 17.2 | -21.9% | 1.639 -> 0.000 MB | no model request | 212.52 -> 231.38 MiB (+8.9%) |
| cancellation during blob prep | 850.5 | 21.6 | -97.5% | 1.803 -> 0.010 MB | no model request | 279.23 -> 202.80 MiB (-27.4%) |

The 100 MiB success case was not executed because the current semantic tree limit is 16 MiB. Any 100 MiB success estimate would be extrapolation and would contradict the current contract.

## 14. Parallel-first result

Same-base parallelism now shares one verified preparation without sharing mutable Task/Attempt state. In the eight-Task actual-repository workload:

- context materializations: eight baseline-equivalent preparations -> one candidate producer;
- Git calls: 48 -> 5 (-89.6%);
- Git stdout: 14.421 -> 1.803 MB (-87.5%);
- wall time: 5,287.2 -> 1,027.2 ms (-80.6%);
- throughput: 1.513 -> 7.788 results/s (+414.7%);
- request bytes and process starts: unchanged at 15,071,128 bytes and eight starts.

Multi-base behavior confirms that reuse follows actual base locality rather than globally serializing work:

| 8 Tasks / bases | Wall baseline | Candidate | Change | Git calls | Peak RSS | Peak heap |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 199.6 ms | 51.9 ms | -74.0% | 48 -> 10 | -17.5% | -12.3% |
| 4 | 202.4 ms | 80.0 ms | -60.5% | 48 -> 20 | -10.8% | +56.7% |
| 8 | 197.8 ms | 127.0 ms | -35.8% | 48 -> 40 | +0.1% | +0.6% |

The four-base heap increase is a noisy small-fixture observation and is not hidden. The eight-base case has little reuse, incurs extra `ls-tree -l` metadata, and still improves wall time. This is evidence for per-key concurrency, not for a locality scheduler.

## 15. Retry result

`retry amplification factor` is defined here as:

```text
total executor preparation materializations / one successful-result preparation
```

For D0013, the factor equals Attempt count. For D0014 within one exact-base executor lifetime, it remains 1.0 because retries reuse the verified preparation. Full request bytes and process starts still equal Attempt count; retry ownership remains the existing Task contract.

| Retries / Attempts | Wall baseline | Candidate | Change | Git calls | Git stdout | Request bytes | Process starts | Preparation factor |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 / 1 | 1,602.9 ms | 1,068.1 ms | -33.4% | 6 -> 5 | 1.803 -> 1.803 MB | 1,883,877 unchanged | 1 -> 1 | 1.0x -> 1.0x |
| 1 / 2 | 2,193.0 ms | 1,119.2 ms | -49.0% | 12 -> 5 | 3.605 -> 1.803 MB | 3,767,754 unchanged | 2 -> 2 | 2.0x -> 1.0x |
| 2 / 3 | 2,805.5 ms | 1,118.4 ms | -60.1% | 18 -> 5 | 5.408 -> 1.803 MB | 5,651,631 unchanged | 3 -> 3 | 3.0x -> 1.0x |
| 3 / 4 | 3,323.6 ms | 1,081.5 ms | -67.5% | 24 -> 5 | 7.210 -> 1.803 MB | 7,535,508 unchanged | 4 -> 4 | 4.0x -> 1.0x |

No hidden transport retry was added. A future provider failure can still produce request/process/billing storms even though local preparation no longer multiplies.

## 16. Memory / throughput / tail latency

The baseline held several representations simultaneously: Git stdout buffers, decoded strings, per-file objects, validated tree maps, context descriptor, canonical repository arrays, request identity, final JSON/stdin Buffer and child-side parsed JSON. D0014 removes repeated same-base preparation/encoding representations but cannot remove per-Attempt full request and child parse memory.

At same-base 8, sampled peak RSS changed 411.98 -> 386.92 MiB (-6.1%) and sampled peak heap 282.93 -> 129.62 MiB (-54.2%). At 10 MiB single-context scale, peak RSS changed 1255.98 -> 839.82 MiB (-33.1%). These are sampled process observations and allocator/GC noise remains.

Repeated tail measurements were run separately from the single all-scenario pass:

| Workload | n | Baseline p50 | Candidate p50 | Change | Baseline p95/p99/max | Candidate p95/p99/max | Change |
|---|---:|---:|---:|---:|---:|---:|---:|
| same-base 8 | 5 | 5,422.2 ms | 1,047.2 ms | -80.7% | 5,521.3 ms | 1,062.3 ms | -80.8% |
| multi-base 8 | 10 | 194.0 ms | 121.8 ms | -37.2% | 202.9 ms | 129.2 ms | -36.3% |

With only five same-base repeats, p95 and p99 collapse to the maximum. The result demonstrates no observed tail regression, not a production percentile guarantee.

## 17. Security/data-minimization implications

Current local security properties remain:

- repository path, Git executable and model command/environment are deployment configuration, not Task input;
- inherited `GIT_*` routing is removed;
- context reads exact immutable Git objects, not the mutable worktree/index;
- only supported regular UTF-8 blobs within path/tree limits are admitted;
- exact semantic `baseDigest` and request digest binding fail closed;
- raw stderr, environment and repository contents are not persisted into canonical errors/observations;
- result-only isolation prevents the subprocess from directly mutating canonical repository/current state;
- process-local cache values have no external injection/publication API;
- POSIX descendant cleanup reduces leaked descriptors, CPU/I/O and secret-environment lifetime after terminal outcomes.

D0014 does not solve future provider disclosure. A deterministic ContextSlice is also a security/minimum-necessary-data boundary, not merely a speed feature. Before external provider transport, the contract must cover authentication, egress allow/deny policy, deterministic selection/dependency expansion, auditability, redaction, accidentally committed secrets, tokenizer/accounting, request limits, billing/retry semantics, hostile-provider assumptions, privacy and residency. No byte result in this audit is represented as token, billing, latency or quality savings.

## 18. Verification

Independent validation reconstructed exact source `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` on Ubuntu 24.04.4 LTS, Node v22.23.1, npm 10.9.8 and Git 2.54.0.

- GitHub Actions run: `31348795334`
- job: `93335641224`
- source-validation artifact: `d0014-cancellation-handoff-source-validation` / id `9048309325` / SHA-256 `cb56cc46e57dc71107361bd5ccb4111eb1f610700dbc166e9184842539ba3be0`;
- complete `npm run check`: 232/232 passed;
- complete coverage run: 232/232 passed;
- coverage: 93.10% lines / 82.16% branches / 96.30% functions;
- repository transport module: 92.14% lines / 77.04% branches / 97.26% functions;
- focused D0014 correctness/failure suite: 32/32 passed;
- exact baseline and candidate benchmark: 22/22 scenarios each;
- repeated same-base and multi-base tail runs: passed;
- source bundle/archive/evidence internal hashes: verified;
- independent source ref: `research/d0014-final-source-candidate@bb5e665e9d6c28b130d4e25dc373e8fce2053ff0`.

Focused falsifiers cover exact request equality across no-cache/hit, wrong commit/base, unsupported mode, invalid UTF-8, producer failure, same/different-base concurrency, one/all-reader cancellation, fresh-reader replacement after all-reader cancellation, eviction/restart, oversized non-retention, early size/request rejection, duplicate blobs, retry ownership, POSIX descendant cleanup, inherited-pipe false timeout, observer exception and unresolved observer completion.

Benchmark limitations are explicit: warm OS/Git cache, sequential baseline/candidate order, light fixture model, small synthetic multi-base fixtures, no physical disk-byte counter, incomplete child CPU attribution, noisy 1 ms memory sampling, no direct allocation/GC event counter, no provider/tokenizer/network, and no Windows process-tree qualification.

## 19. Remaining problems

The implementation intentionally leaves these product costs:

- every Attempt still contains the complete repository context in the canonical request;
- model stdin bytes, provider-facing egress and child JSON parse memory still scale with context size x Attempt count;
- one process still starts per Attempt;
- cross-process/cross-worker reuse does not exist;
- cold preparation remains O(repository files + unique blob bytes);
- synchronous decode/hash/request assembly is cancellable only at stage boundaries;
- command-driven runner cancellation is not automatically wired to every active Attempt signal;
- response parsing remains full-body within byte bounds;
- a cache hit cannot help 8 Tasks/8 unrelated bases materially;
- persistent manifest/CAS atomicity, corruption, permissions, GC, eviction and disk-pressure contracts remain unopened;
- deterministic relevance/dependency selection is unresolved;
- provider authentication, data minimization, tokenizer, billing, retry and privacy contracts remain absent;
- page-cache-cold and production fleet behavior remain unmeasured.

## 20. Next highest-ROI gate

At D0014 verification time, deterministic minimum-context/ContextSlice was the leading follow-on hypothesis. The post-publication review in Design 0015 **does not preserve that hypothesis as a preselected implementation**. D0014 changed the cost profile enough that the next Class 2 gate must compare:

- full-context immutable reference transport;
- immutable manifest plus content references;
- deterministic ContextSlice;
- warm executor/process behavior under the new profile;
- streaming/lazy delivery;
- staged hybrids, including semantic-preserving reference transport before any model-visible slicing.

If ContextSlice wins, it must define versioned selection inputs and exact task/instruction binding; immutable commit/`baseDigest`/manifest/Slice identity; deterministic path selection and dependency expansion; ordering and byte/file/large-file/empty/overflow behavior; Slice/request digests; cold/restart/cache equivalence; explicit fallback or fail-closed behavior; auditability; minimum-necessary disclosure; and a representative correctness/quality falsifier against full context.

Persistent manifest/CAS should be added only if measured cross-worker reuse or provider content references justify its publication, corruption, GC and disk-pressure complexity. External provider authentication, redaction, secrets, tokenizer/accounting, request limits, retry billing, privacy/residency and hostile-provider assumptions remain separate provider gates.

### Evidence-based answers to the seven core questions

1. **Does cost follow Task work or repository/Attempts/retries/concurrency?** D0013 cost followed whole-repository size multiplied by Attempt, retry and parallel concurrency much more strongly than useful Task complexity. D0014 removes repeated exact-base preparation but full request/process cost still follows Attempt count.
2. **Can parallel Tasks share preparation safely?** Yes, inside one executor for an exact immutable commit/object-format/`baseDigest` key. One complete verifier produces a deeply frozen derived value; correctness and different-base concurrency tests passed.
3. **Can each Task receive only deterministic minimum context?** Architecturally yes, but not safely from the current free-form instruction alone. No minimum-context implementation is claimed until a deterministic selection/dependency contract exists.
4. **Can optimization remain derived under D0010?** Yes. Cache deletion, disablement, eviction and restart rebuild from Git plus authoritative `baseDigest`; acceptance, Promotion and Case head ownership are unchanged.
5. **Is there a more dangerous bottleneck than the 75% ratio?** Yes: absolute repeated canonical/Git preparation multiplied by parallelism/retry, full request copies, late rejection/cancellation waste, cancelled-producer handoff poisoning, descendant lifecycle leakage/false timeouts, and observer-induced stalls.
6. **Did this audit find it?** Yes. Nine previously unrepresented issues were isolated. The ninth invalidated the first verification candidate before publication; the corrected bounded high-ROI subset was then revalidated, while provider/data-minimization and full-request costs remain explicit.
7. **What is the highest-ROI current fix?** Exact-key bounded same-base preparation/canonical-encoding reuse plus early preflight, unique-blob reads, Git cancellation, safe cancelled-producer replacement, and process/observation lifecycle hardening. Actual repository, retry, concurrency, scale, memory and failure evidence supports that choice.


## Post-publication precision review

`docs/D0014_POST_VERIFICATION_REVIEW.md` rechecks D0014 after canonical publication. It retains the verified source and measured operation-count results, corrects the final artifact outer-ZIP provenance record, distinguishes retained cache bounds from concurrent pending live-work bounds, validates bounded capacity-plus-one LRU churn, and tightens human-facing benchmark terminology. Raw historical evidence is not rewritten. The next context-delivery gate is decision-neutral rather than a preselected ContextSlice implementation.
