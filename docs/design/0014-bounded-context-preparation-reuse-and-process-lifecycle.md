# Design 0014: bounded repository-context preparation reuse and process lifecycle

- Status: `verified`
- Root Task: GitHub issue `humtr/tdev#7`
- Baseline: exact `mvp-1a-7@3baa86a133b12b5f433b4d4a053528dd559f5371`
- Development direction: unchanged; implementation continues by fast-forwarding `mvp-1a-7`
- Authority owners: D0010 Case head, semantic root, and Plan `baseDigest`
- Execution owner: `src/repository-model-transport.mjs`
- Runner/cancellation owner: `docs/OPERATIONS.md` and `src/runner.mjs`

## 1. Decision summary

D0013 deliberately established a full-repository, process-per-Attempt baseline. The repeated-context fraction for exactly `N` identical full-context requests is structurally `(N - 1) / N`; therefore the historical four-Attempt value of 75% is not a newly discovered experimental ratio. D0013's new evidence was the absolute repository, Git, request, process, and retry cost on a real source candidate.

The highest-ROI bounded vertical slice is not a persistent CAS and is not an automatic ContextSlice. It is an instance-local, exact-identity, bounded immutable preparation cache that:

1. single-flights cold preparation for concurrent Attempts using the same immutable repository commit and semantic `baseDigest`;
2. retains a small LRU of verified immutable context preparations for later retries and nearby same-base Tasks;
3. reuses canonical context encodings so request construction does not repeatedly clone and re-escape the complete file set;
4. preflights file and tree byte limits from `git ls-tree -l` before reading blob bodies, and reads each unique blob object only once per cold preparation;
5. propagates cancellation to Git preparation while preserving one-producer/many-reader semantics and removing a doomed all-reader-cancelled producer from lookup before admitting a fresh reader;
6. kills the complete POSIX model process group on abort, timeout, output overflow, and direct-child exit rather than only the direct child, so inherited descendant pipes cannot turn a valid response into a false timeout;
7. adds non-authoritative stage/cache/resource observations sufficient to distinguish Git, preparation wait, request construction, process, and response parsing work, without awaiting asynchronous observation-sink completion.

This slice keeps the D0013 full-context request profile. It removes repeated local preparation and canonical-encoding work, but it does not claim to remove model/provider input bytes. Deterministic ContextSlice and provider-facing content references remain separate contracts.

## 2. Authority and ownership

The following remain authoritative and unchanged:

- the current Case head;
- the D0010 semantic root selected by that head;
- the Plan `baseDigest`;
- Task/Attempt lifecycle, retry budget, Claim/fencing checks, result validation, Promotion, and canonical publication.

The following are derived execution state:

- the exact immutable Git commit used to materialize context;
- context descriptors and full-text file arrays;
- canonical context encodings;
- in-flight single-flight records;
- retained LRU entries and cache metadata;
- observation and benchmark metrics.

Deleting all D0014 cache state, disabling it, restarting the worker, or losing the process must produce a cold rebuild from the exact Git commit and must not change legal model-request semantic content. A cache entry can accelerate a request but cannot authorize one.

D0011 and D0012 Git projection/publication remain derived and are not redesigned. The model subprocess remains result-only and may not mutate the canonical repository, share a mutable worktree, or become a semantic owner.

## 3. Scope

In scope:

- D0013 repository commit resolution, tree enumeration, blob loading, UTF-8 decode, tree validation, semantic digest, context descriptor, request digest/encoding, subprocess lifecycle, response parsing, retry reuse, same-base parallel reuse, bounded cache eviction, cancellation, and non-authoritative instrumentation;
- actual-repository, bounded synthetic, concurrency, retry, failure, corruption-equivalent identity, restart, no-cache, and POSIX process-tree tests;
- correction of D0013 evidence interpretation without changing historical measured values.

Non-goals:

- external commercial LLM/provider integration;
- tokenizer or provider billing/token-savings claims;
- provider request/reference protocol;
- automatic relevance inference or dependency-aware ContextSlice;
- persistent context manifest/CAS;
- cross-worker/distributed cache;
- warm model process or process pool;
- locality scheduling;
- distributed Claim, MCP, persistence, D0011, or D0012 redesign;
- semantic/current-state authority migration.

## 4. Baseline decision evidence

### 4.1 Predictable structural costs

The D0013 design alone predicts:

- one complete repository traversal/materialization per Attempt;
- one complete full-context request per Attempt;
- repeated bytes `(N - 1) / N` for `N` identical full-context requests;
- full reconstruction after Task-level retry;
- one new model process per Attempt;
- no same-base preparation sharing;
- work proportional to repository scope rather than task-specific relevance.

### 4.2 Measured absolute costs

Historical D0013 evidence recorded 101 files and 1,757,785 content bytes. Four Attempts requested 7,031,140 context bytes, of which 5,273,355 were repeated. The ratio is structurally predictable; the byte counts, Git/process timings, and repository shape are the measured facts.

At the exact accepted baseline HEAD used for this design, a local probe measured 102 files and 1,788,423 content bytes, with a 1,883,877-byte request. Ten serial real-subprocess samples measured:

| Stage | p50 | p95/max |
| --- | ---: | ---: |
| repository scan/materialization | 182 ms | 227 ms |
| model process | 42 ms | 47 ms |
| total Attempt transport | 664 ms | 791 ms |

About 440 ms at p50 remained outside the measured scan and process stages. Code inspection and controlled in-process response tests localize the dominant remainder to repeated canonical cloning, request digesting, full context serialization, buffer construction, and response-side parsing. On this workload request construction is materially larger than cold Node process startup.

Same-base direct execution over the exact repository showed near-linear preparation replication:

| Tasks / one base | Git calls | Git stdout bytes | model input bytes | wall time | throughput |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6 | 1,802,584 | 1,883,880 | 752 ms | 1.33/s |
| 2 | 12 | 3,605,168 | 3,767,760 | 1,312 ms | 1.52/s |
| 4 | 24 | 7,210,336 | 7,535,520 | 2,716 ms | 1.47/s |
| 8 | 48 | 14,420,672 | 15,071,040 | 5,676 ms | 1.41/s |

Task-level retry amplified preparation linearly. Zero through three retries caused 6, 12, 18, and 24 Git commands and 1.80, 3.61, 5.41, and 7.21 MB of Git stdout respectively. The preparation amplification factor was exactly the number of Attempts.

### 4.3 Newly discovered risks

The audit found additional problems not represented by the historical 75% ratio:

1. **Canonical request construction dominates the current local subprocess startup.** Three full-context canonical passes and clone/parse copies occur after materialization; the unsegmented p50 remainder is about 440 ms versus 42 ms process time.
2. **Semantic size limits are enforced after expensive buffering.** The baseline reads the full `cat-file --batch` output before enforcing per-file/tree limits. A 17 MiB synthetic tree produced 17,826,727 blob-response bytes and only then failed the 16 MiB tree limit. In the same probe, process maximum RSS rose from a previously observed 279,352 KiB to 338,516 KiB; this is a non-isolated indication, not an accepted standalone delta.
3. **Repeated blob identities are reread and decoded within one materialization.** One hundred paths bound to one 10,000-byte blob caused about 1,005,300 batch stdout bytes rather than one blob body plus headers. Request text still must repeat per path under D0013, but Git I/O and decode do not.
4. **Model descendants survive failure cleanup.** A timeout killed the direct child while a spawned grandchild remained alive and completed a delayed write. This can leak CPU, I/O, inherited descriptors, or credentials after the Attempt is no longer acceptable.
5. **A pre-aborted invocation performs a Git object-format process before rejecting.** Cancellation during Git preparation is not delivered to the Git child, so completed work can be discarded before model spawn.
6. **Request byte bounds are checked after final full serialization.** A 1 KiB request limit still caused a complete 1.01 MB repository read and full context construction before rejection in a bounded fixture.
7. **A successful direct child can be misclassified as timed out when a descendant inherits its pipes.** Node's `close` event waits for inherited stdout/stderr handles. A fixture that returned a valid bound result and exited still reached the transport timeout because its grandchild retained those handles. Cleanup must begin at direct-child `exit`, not only at `close` or failure.
8. **An unresolved asynchronous observation sink can stall an otherwise complete Attempt indefinitely.** Observation exceptions were swallowed, but the baseline candidate awaited the returned promise. Non-authoritative instrumentation therefore remained capable of controlling transport completion while its delay was also absent from `totalDurationMs`.
9. **An all-reader-cancelled producer can poison a fresh reader during abort handoff.** The first verification candidate aborted the producer but left its pending entry in lookup until rejection settled. A new reader could join that doomed entry and inherit `git_process_aborted`. Independent pre-publication review rejected that candidate; the corrected source removes the exact entry before abort and uses entry-object identity so old completion cannot remove a replacement.

The existing operations contract already documents that `runCase(..., { signal })` cancels only ClaimLedger waits and that command-driven cancellation is not wired to active per-Attempt signals. That is a previously known product limitation, not a D0014 discovery. D0014 improves behavior once the per-Attempt signal is delivered; it does not silently redefine runner cancellation ownership.

### 4.4 Ruled out or bounded at design time

- A 100 MiB context cannot be accepted under the current 16 MiB semantic tree limit. The relevant risk is failure-path buffering before rejection, not successful 100 MiB operation.
- Current Git and model environments are explicitly filtered; inherited `GIT_*` routing and arbitrary caller secrets are not passed by the D0013 adapter.
- Symlink, submodule, unsupported mode, and invalid UTF-8 entries fail closed.
- Response and stderr bytes are bounded, although response buffering and child-side parsing remain full-body operations.
- The current implementation has no shared-state lock or cache stampede because it has no cache; D0014 must avoid introducing a global lock.

## 5. Candidate comparison

| Candidate | Removes | Does not remove | Decision |
| --- | --- | --- | --- |
| immutable manifest only | repeated tree metadata derivation if reused | blob read, decode, request encoding, transport | insufficient first slice |
| persistent per-commit CAS | cross-process blob/context rebuild | request encoding/transport; adds publication, corruption, GC, disk pressure | defer until cross-worker/provider evidence |
| deterministic ContextSlice | irrelevant request bytes and disclosure | requires explicit selection/dependency correctness contract | valuable, but not safely derivable from current free-form instruction |
| request manifest + content references | provider/network repeated bytes | needs provider protocol and content-fetch semantics | defer to external-provider design |
| incremental context delta | repeated unchanged bytes across related commits | needs receiver state and exact delta lineage | defer |
| same-base immutable preparation reuse | Git scan, blob read/decode, validation/hash, descriptor and canonical context encoding | full D0013 request bytes and process start | selected |
| warm executor/process pool | process startup/initialization | dominant current request preparation and full transport | lower current ROI; process p50 is 42 ms |
| streaming/lazy/mmap | some peak copies and backpressure | canonical one-body provider contract, relevance | defer after reuse evidence |
| combined bounded preparation reuse + preflight + process-tree cleanup | dominant repeated local work plus two high-risk failure paths | task-specific context minimization and provider egress | selected bounded vertical slice |

## 6. Exact context-preparation identity

A reusable preparation is bound to:

- instance-fixed normalized repository path;
- `REPOSITORY_CONTEXT_PROFILE`;
- inferred and then Git-verified object format;
- complete immutable repository commit OID;
- expected semantic Plan `baseDigest`.

A cold producer additionally derives and verifies:

- commit object type;
- exact tree OID;
- ordered path/mode/blob identity;
- byte sizes;
- supported regular-file modes;
- valid normalized paths;
- fatal UTF-8 content;
- validated semantic tree;
- observed semantic digest equal to the expected `baseDigest`;
- context descriptor and `contextDigest`.

The cache key does not claim that the commit OID proves semantic equality. Reuse is admitted only after the cold producer has independently proved the semantic `baseDigest`. A changed commit, wrong `baseDigest`, object-format mismatch, or distinct repository executor cannot hit the entry.

Identity meanings remain separate:

- `baseDigest`: semantic path-to-text equality under D0010/Plan policy;
- repository commit OID: immutable Git object identity in one repository object format;
- `contextDigest`: D0013 descriptor identity including commit/tree/file metadata and semantic digest;
- future Slice digest: not introduced here;
- request digest: exact invocation plus repository descriptor/files for one model request.

## 7. Cache and single-flight contract

The constructor accepts:

- `contextCache: false` for exact no-reuse rollback behavior; or
- a bounded configuration with `maxEntries` and conservative `maxBytes`.

The default is a small finite LRU. Completed values are retained only when both bounds permit. A value larger than the byte bound is shared by concurrent waiters while in flight but is not retained after completion.

Concurrency rules:

1. The first exact-key caller is the producer.
2. Concurrent exact-key callers await the same immutable producer result.
3. Different keys produce concurrently; there is no global cache lock.
4. Producer failure removes the entry. A later call performs a cold authoritative rebuild.
5. One reader cancellation stops that reader without poisoning other readers.
6. When all readers cancel before production completes, the pending entry is removed from lookup before the producer AbortSignal fires and the Git process is terminated.
7. A fresh reader arriving during the old producer's abort/rejection window starts a replacement producer; the old producer cannot delete or overwrite it because completion paths compare exact entry identity.
8. LRU eviction removes only the cache reference. Active readers retain their immutable value safely.
9. Restart/cache loss begins cold. There is no durable cache migration.

Retained-byte accounting conservatively includes canonical encoded buffers and UTF-16-sized text/path estimates. It is an admission bound, not a promise about V8 allocator/RSS overhead. Active in-flight work remains bounded by executor admission/capacity rather than by pretending cache eviction can remove live work.

## 8. Cold materialization changes

`git ls-tree -r -z -l` supplies blob sizes with tree metadata. D0014 validates entry count, mode/type, path, per-file size, and logical tree bytes before reading any blob body. The subsequent batch requests each unique blob OID once. The response is bound to expected OID/type/size, decoded once per unique blob, then mapped to every ordered path. Logical semantic tree bytes still count every path, including duplicate-content paths.

The producer checks cancellation before spawn and between Git/stage boundaries. Synchronous JavaScript decode, semantic canonical hashing, and final request buffer construction are not fully preemptible in the middle of one event-loop turn; D0014 does not misrepresent stage-boundary checks as arbitrary instruction-level cancellation.

## 9. Canonical request encoding

The public D0013 request profile and request digest remain byte-for-byte canonical.

A verified preparation retains canonical encodings of the immutable repository descriptor and file array. Each Attempt canonicalizes only its invocation portion, computes the typed request digest incrementally across the exact canonical chunks, computes the exact final byte length before allocation, and constructs one final stdin buffer. Cold/no-cache execution and cache-hit execution must produce identical request bytes for an identical invocation.

The request still contains the complete repository text. Therefore D0014 may claim reduced local CPU/allocation and Git work, but not reduced provider input tokens, network egress, billing, attention noise, or disclosure percentage.

## 10. Process lifecycle

On POSIX, the model child starts as the leader of a separate process group. Abort, timeout, stdout overflow, stderr overflow, and startup cleanup target that process group with a direct-child fallback. A natural direct-child `exit` also triggers group cleanup before the transport waits for `close`; otherwise a descendant that inherited stdout/stderr can keep those pipes open, cause a false timeout, and amplify retry work even though the direct child returned a valid response. Focused falsifiers must prove that a descendant cannot outlive terminal cleanup and that inherited descendant pipes cannot delay a successful result until timeout.

Non-POSIX process-tree semantics remain unqualified by this design; direct-child fallback remains. Independent acceptance is Ubuntu/POSIX.

Git preparation receives AbortSignal delivery and terminates its direct plumbing process. D0014 does not change the runner's documented command-delivery limitation.

## 11. Observability

Non-authoritative observations add enough data to separate:

- cache status (`disabled`, `miss`, `shared`, `hit`, or produced-but-not-retained);
- materialization producer count;
- wait duration;
- Git command/input/stdout bytes for the producing Attempt;
- logical versus unique blob counts/bytes;
- scan/materialization duration;
- canonical context encoding bytes;
- request-build duration and final stdin bytes;
- process starts/reuses and process duration;
- response bytes and parse duration;
- total duration and outcome.

Observation callback failure remains unable to change transport success/failure. The callback may return a promise, but transport completion does not await that promise; asynchronous sink rejection is consumed outside the authoritative path. Synchronous callback execution is still expected to be bounded by the caller. Metrics do not become lifecycle or acceptance evidence.

## 12. Failure, recovery, corruption, and security

- Wrong commit/base binding fails closed before a cache value is admitted.
- Producer failure, abort, invalid UTF-8, unsupported mode, malformed Git output, wrong blob binding, or digest mismatch is never retained.
- In-memory values are constructed internally and deeply frozen; callers cannot publish cache objects.
- There is no persistent object publication, temp file, partial write, disk CAS, stale manifest, or cache-poisoning API in D0014.
- Cache loss and restart rebuild from the immutable Git commit and reverify semantic equality.
- Exact request digest binding and result-only isolation remain unchanged.
- Repository data remains local to the configured trusted subprocess. External egress, redaction, residency, authentication, hostile-provider, and secret-minimization contracts remain unresolved and must precede an external provider.

## 13. Migration and rollback

There is no semantic or durable-data migration.

Migration behavior:

- existing constructor calls receive the bounded default cache;
- existing request/response profiles and result contracts are unchanged;
- mixed worker versions can execute because no shared cache schema or persistent state exists;
- a restart ignores all previous derived state and rebuilds.

Rollback behavior:

- set `contextCache: false` to use the cold D0013 path;
- revert the source commit without transforming Case, Plan, semantic, Git, or publication data;
- delete/restart all workers without data loss;
- no persistent cache downgrade is needed.

## 14. Acceptance and falsifiers

Correctness:

- same exact key produces one cold materialization for concurrent readers;
- same base and identical invocation produce identical cold/cache-hit request bytes;
- changed commit or wrong `baseDigest` cannot reuse stale context;
- malformed/wrong blob content, invalid UTF-8, unsupported mode, and object-format mismatch fail closed;
- producer failure is not cached and a later attempt rebuilds;
- cache disabled and restart cold rebuilds remain semantically equal;
- result-only boundary, request digest, retry ownership, fencing, and Promotion remain unchanged.

Concurrency and lifecycle:

- 1/2/4/8 same-base Tasks produce one materialization while retaining per-Attempt process/request behavior;
- 8 Tasks over 2/4/8 bases produce exactly one cold preparation per distinct base and do not serialize unrelated bases;
- one-reader cancellation does not fail other readers;
- all-reader cancellation stops Git preparation;
- a fresh reader after all-reader cancellation starts a replacement producer rather than joining the doomed producer;
- timeout/abort/output overflow leaves no POSIX descendant;
- a successful child whose descendant inherited stdout/stderr returns before timeout and leaves no descendant;
- a never-settling asynchronous observation sink cannot block success or failure delivery;
- bounded eviction does not invalidate active readers and later cold rebuild succeeds.

Performance:

- compare exact D0013 baseline and candidate on the same immutable repository commit;
- report absolute and percentage changes for Git calls/bytes, materializations, unique/logical blob bytes, request bytes, process starts, CPU, RSS, p50/p95/p99/max latency, and bounded batch completion rate;
- retry 0/1/2/3 must reduce reconstruction amplification while retaining one process and one full request per Attempt;
- same-base improvement must not cause material multi-base regression;
- cold and warm/cache-hit states are reported separately;
- bounded synthetic 1 MiB/10 MiB, many-small, few-large, deep, wide, duplicate-blob, and oversize-rejection cases distinguish actual measurement from extrapolation.

Complete verification:

- focused repository transport/cache/process tests;
- full `npm run check`;
- full coverage command;
- `git diff --check`;
- independent Ubuntu/POSIX source/coverage/focused/benchmark validation;
- exact source/evidence SHA and independent remote ref verification.

## 15. Deferred gates

1. A deterministic ContextSlice requires explicit, versioned selection input, dependency expansion, limits, ordering, failure behavior, and Slice identity. Free-form instruction alone is not a correctness authority.
2. A persistent manifest/CAS becomes justified when cross-process/cross-worker reuse or provider references outweigh corruption, atomic publication, GC, eviction, disk-pressure, and migration complexity.
3. Warm executors/process pools should be reconsidered after request preparation is removed from the dominant path and against a representative real model runtime.
4. Runner command-driven cancellation must be designed at its existing lifecycle owner; transport changes cannot infer semantic cancellation from an unrelated signal.
5. External provider transport requires authentication, minimum-necessary egress policy, redaction/secret handling, tokenizer/accounting, request limits, retry billing/semantics, hostile-provider assumptions, privacy, residency, and reconciliation.

## 16. Direction decision

D0014 changes no semantic source of truth, current-state owner, persistence authority, execution result boundary, or publication authority. Its state is derived, bounded, rebuildable, restart-safe, and optional. It is therefore the same `mvp-1a-7` architectural line; creating a new `mvp-*` branch would misrepresent a Design revision as a direction change.

## 17. Verification record

D0014 became `verified` on 2026-08-10 without changing the active `mvp-1a-7` development direction. Exact source candidate `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` passed independent Ubuntu/POSIX GitHub Actions run `31348795334`, job `93335641224`, on Ubuntu 24.04.4 LTS / Node `v22.23.1` / Git `2.54.0`:

- **232/232** complete source tests;
- **93.10% line / 82.16% branch / 96.30% function coverage**;
- `repository-model-transport.mjs`: **92.14% line / 77.04% branch / 97.26% function coverage**;
- **32/32** focused repository/cache/process/cancellation/failure-path tests;
- 22 baseline plus 22 candidate benchmark scenarios;
- repeated same-base-8 and multi-base-8 tail workloads;
- clean effective diff and exact source bundle/archive integrity.

Checked evidence is `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json`, SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`. The full product decision is recorded in `docs/history/d0014-product-efficiency-audit.md`.

The actual-repository eight-same-base workload changed from 48 to 5 Git commands, 14.421 to 1.803 MB Git stdout, 5,287.2 to 1,027.2 ms wall time and 1.513 to 7.788/s bounded batch completion rate. Full model input remained 15,071,128 bytes and process starts remained eight. Retry preparation amplification changed from 1/2/3/4x to 1x for zero through three retries, while full request/process amplification remained Attempt-count dependent. Repeated same-base-8 p50/p95 changed from 5,422.2/5,521.3 to 1,047.2/1,062.3 ms; repeated multi-base-8 p50/p95 changed from 194.0/202.9 to 121.8/129.2 ms.

Verification also closes the direct-child inherited-pipe falsifier, unresolved asynchronous observation falsifier, and cancelled-producer fresh-reader handoff falsifier. It does not qualify Windows process-tree behavior, deterministic ContextSlice, persistent/cross-worker CAS, external provider/tokenizer/billing semantics, warm process reuse, locality scheduling or production SLOs.


## Post-verification review addendum — 2026-08-10

Design 0015 and `docs/history/d0014-post-verification-review.md` independently rechecked this verified source after publication. No production-source correctness defect was found and D0014 remains `verified`. The review makes three precision points without changing this contract:

1. `maxEntries/maxBytes` bound retained complete cache values; pending different-key preparations are live work and are not an executor-global memory/RSS ceiling. Caller/runner admission currently bounds live work, and the future AgentDO/executor layer must own aggregate deployed resource admission.
2. Historical `throughputPerSecond` benchmark fields mean bounded batch completion rate, not sustained production throughput. CPU/tail numbers retain the measurement limitations in the audit report.
3. The next gate is no longer preselected as ContextSlice. Full-context references, manifest/content references, ContextSlice, warm execution, streaming and staged hybrids must be compared against the post-D0014 profile.
4. Fresh-checkout repetition exposed a timing-sensitive **test harness** guard, not a production transport defect: the inherited-pipe falsifier's 200 ms timeout could expire during ordinary Node startup. Design 0015 corrects only that test/fixture to use a 2-second deadlock guard while an un-killed grandchild remains observable for 5 seconds. The D0014 production module is unchanged.

Artifact `9048558724` also has a corrected currently downloadable outer-ZIP SHA-256 of `7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`; the earlier Issue #7 comment recorded a different outer-ZIP value. Internal artifact manifest entries and the canonical product-evidence hash remain intact. The historical cause of the old digest value is unresolved rather than inferred.
