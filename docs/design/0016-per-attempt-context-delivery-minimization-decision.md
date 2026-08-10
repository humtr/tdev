# Design 0016: per-Attempt context delivery minimization decision

- Status: `draft`
- Capability Group: E — Context delivery and model input
- Work lane: `group/e-context-delivery`
- Work-lane creation base: exact `mvp-1a-7@83e9610d79b4ad70858e4dd7fe3625052336a92c`
- Production-source baseline: unchanged D0014/D0015 integrated source at the creation base; current Group E commits before this Design are documentation/self-development preparation only
- Authority owners retained unless this Design explicitly proves otherwise: D0010 Case head, semantic root and Plan `baseDigest`; existing Task/Attempt/result/Promotion owners
- Affected product owners if a later implementation is selected: `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md` as applicable
- Program owners: `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `docs/development/GROUP_E_CONTEXT_DELIVERY.md`

> This draft does **not** authorize Class 2 source changes. It defines the measurement and decision gate required before selecting a context-delivery mechanism.

## 1. One-line definition

Remeasure the post-D0014 per-Attempt context/model boundary, compare semantic-preserving and semantic-reducing delivery/execution candidates on equivalent workloads, and select the smallest mechanism that removes the verified remaining bottleneck without silently changing authority or model-visible input.

## 2. Repository facts already verified

The following are retained facts from D0013/D0014/D0015 and are not hypotheses to rediscover:

- D0013 intentionally used one full supported repository context and one fresh trusted-local subprocess per Attempt.
- D0014 removed a structural exact-base repository-preparation amplification axis through bounded process-local preparation reuse and singleflight.
- Same-base-eight Git calls changed from `48 -> 5` in the accepted D0014 evidence while eight full model requests/process starts remained.
- Retry preparation amplification changed from `1/2/3/4x -> 1x` for zero through three retries; full request/process amplification still follows Attempt count.
- The D0014 post-review confirmed that retained cache entry/byte bounds do not bound all simultaneously pending different-base live work.
- D0014 cache/preparation state remains derived, optional, restart-cold and non-authoritative.
- D0010 Case head/semantic root and Plan `baseDigest` remain semantic/current-state authority.
- The current local transport is trusted-local and does not qualify external-provider token, billing, network, privacy/residency or model-quality behavior.

## 3. Current problem

After D0014, each Attempt still crosses a boundary shaped approximately as:

```text
verified immutable repository preparation
  -> per-Attempt invocation canonicalization
  -> complete canonical repository request assembly/copy
  -> complete request transfer
  -> receiver full-body parse/materialization
  -> one model/executor invocation/start
  -> response parse/result-only acceptance
```

Same-base preparation is no longer multiplied by every Attempt in the verified local case, but request bytes, receiver parse and executor/model invocation remain Attempt-count dependent.

The next product decision must identify which of those remaining stages actually dominates the accepted final execution profile. It must not assume that the mechanism with the largest theoretical byte reduction is the safest or highest-ROI first change.

## 4. Evidence, inference and unknowns

### Measured / retained evidence

- historical D0014 same-base, multibase, retry, process, scale, duplicate-blob, oversize and cancellation measurements;
- exact full request bytes still proportional to Attempt count after D0014;
- one process start per Attempt in the current local profile;
- local parent/runtime benchmark CPU and sampled memory limitations documented by D0014/D0015.

### Reasonable inference requiring fresh measurement

- removing repeated full-body copy/transfer/parse may now have higher ROI than further repository-preparation optimization;
- a semantic-preserving reference layer may be lower correctness risk than ContextSlice and may usefully precede it;
- an external provider may change the relative dominance of transfer, tokenization, provider latency, startup and billing.

These are hypotheses, not accepted decisions.

### Unknown

- exact post-D0014 allocation/copy counts by stage;
- complete child/process-tree CPU attribution;
- production provider tokenization, latency, retry charging and privacy behavior;
- whether ContextSlice can preserve task quality/completeness on representative work;
- whether durable shared content storage is necessary for the selected transport;
- whether warm execution materially helps after request/delivery costs are isolated;
- deployed fleet locality and sustained production throughput.

## 5. Candidate set

All candidates remain live until measured evidence rejects or stages them.

### A. Full-context immutable reference transport

Preserve the complete model-visible repository semantics but replace repeated inline byte bodies with immutable references resolvable by the receiver/runtime.

Potential benefit:

- lower parent request copy/assembly;
- lower repeated transport bytes;
- lower receiver full JSON parse/copy;
- lower semantic risk because complete context remains visible.

Required new contracts include reference identity, authorization, missing/corrupt behavior, retry/restart and retention/GC if references outlive one request.

### B. Immutable manifest + content references

Separate ordered repository metadata/identity from content bytes and allow content addressing/reference resolution.

Potentially useful when receiver needs deterministic repository structure while bytes can be reused or fetched separately.

### C. Deterministic ContextSlice

Reduce model-visible repository content according to an explicit deterministic selection/dependency contract.

Potential benefit:

- lower input bytes, disclosure and provider token/attention cost.

Higher semantic burden:

- completeness/quality;
- deterministic instruction binding and dependency expansion;
- fallback/fail behavior;
- full-context comparison evidence.

### D. Warm executor/process

Reuse process/runtime initialization while preserving request semantics.

This is only high priority if fresh post-D0014 measurement shows startup/initialization is material after request-delivery costs are separated.

### E. Streaming/lazy delivery

Reduce peak copies/backpressure and permit staged consumption while preserving an exact deterministic input contract.

Partial delivery cannot silently become partial semantic context.

### F. Hybrid/staged sequence

A leading candidate sequence to test, not a selected decision:

```text
semantic-preserving full-context reference transport
-> remeasure
-> add deterministic ContextSlice only if content volume/disclosure remains a material product bottleneck
```

This treats reference transport and ContextSlice as complementary layers rather than mutually exclusive alternatives.

## 6. Measurement contract

The decision matrix must separate at least these quantities:

- repository preparation materializations;
- Git command/input/stdout bytes;
- parent canonicalization/request-construction wall and CPU where isolatable;
- bytes allocated/copied where instrumentable without invalidating the workload;
- bytes transferred across the model/provider boundary;
- receiver parse/materialization duration;
- process/provider startup/initialization duration;
- model/provider invocation count;
- retry amplification;
- sampled parent memory and clearly scoped receiver/child observations;
- model-visible context bytes/disclosure;
- provider tokens/cost only when measured against the actual selected provider.

Do not infer whole-machine CPU from parent `process.cpuUsage()`. Do not call bounded batch completion sustained production throughput. Do not treat small p95/p99 samples as production SLOs.

## 7. Required workload matrix

At minimum:

| Axis | Workloads |
| --- | --- |
| same exact base | 1 / 2 / 4 / 8 Attempts |
| distinct bases | 2 / 4 / 8 bases |
| retry | 0 / 1 / 2 / 3 retries plus success/failure as applicable |
| lifecycle | cancel before work; cancel during delivery; timeout/overflow where applicable |
| restart | cold process/cache/reference resolver restart |
| repository shape | actual repository; many-small; few-large; deep; wide where mechanism-sensitive |
| locality boundary | capacity+1 cyclic working set as a bounded stress observation |
| malformed/stale identity | wrong commit/baseDigest/reference/slice identity |

For any external-provider claim, include at least one real provider/receiver path. Fixture-only measurements cannot qualify provider latency/token/billing/security behavior.

## 8. Semantic-equivalence gate

Candidates A/B/D/E that claim unchanged model-visible full context must prove equivalence to the current canonical full-context input for identical invocation/base identity.

The falsifier is byte/semantic mismatch in the reconstructed receiver-visible context, stale identity acceptance, or restart/retry producing a different legal input.

ContextSlice is exempt from byte equality only because it explicitly changes model-visible input; it therefore inherits the stronger section 9 contract.

## 9. ContextSlice gate if candidate C survives

Before selection, define and falsify:

- commit, authoritative `baseDigest` and instruction/purpose binding;
- deterministic seed selection;
- dependency/reference expansion;
- ordering;
- source/generated/large/unsupported file policy;
- limits and overflow;
- empty selection;
- slice profile/version/digest;
- retry/restart/cache equality;
- stale base/slice rejection;
- explicit full-context fallback or explicit fail-closed behavior;
- auditable include/exclude reasoning;
- representative full-context versus slice correctness/quality test.

A lower token count is not sufficient evidence if representative correctness degrades or completeness cannot be bounded.

## 10. Security/data-minimization gate

If an external provider is introduced during measurement or selected by the follow-on runtime Design, explicitly separate:

- authentication;
- repository data egress;
- minimum-necessary disclosure;
- secret/redaction policy;
- provider retention/privacy/residency;
- request limits/rate limits;
- tokenizer/accounting/billing;
- retry charging and ambiguous provider errors.

Do not put raw credentials in source, Plan input, Case snapshot, semantic Event, evidence, observation or clear remote intent.

## 11. Failure, cancellation, recovery and cleanup

Every candidate comparison must state:

- what work can be cancelled and at which boundary;
- how partial reference/stream resolution fails;
- whether receiver/provider work may continue after caller cancellation;
- what state survives restart;
- how failed/aborted derived state is discarded;
- whether another reader/request can join doomed work;
- how resource bounds apply to retained versus live work;
- how retry reproduces the same input identity or explicitly selects a new one.

No candidate may hide an automatic retry outside the existing Task retry contract without a separate accepted semantic/effect decision.

## 12. Compatibility, migration and rollback

D0016 itself is a decision/measurement gate and should not require product migration.

Any selected D0017 implementation must prefer a bounded opt-in/reversible path where practical:

- old full-context request remains the oracle/fallback if compatibility requires it;
- new derived caches/references remain rebuildable unless a separate durable-storage Design explicitly promotes them;
- no existing Case/Task/Attempt/result/Promotion semantics change implicitly;
- rollback returns to the verified D0014 full-context path without corrupting semantic authority.

An external provider/runtime change belongs in D0018 or a superseding accepted Design rather than being smuggled into a local benchmark.

## 13. Acceptance matrix / cheapest falsifiers

D0016 may move from `draft` to `accepted` only when the decision evidence covers at least:

1. exact current integration/source identity and Group E work-lane ancestry;
2. equivalent post-D0014 baseline rerun or validated retained baseline with enough fresh instrumentation to compare candidates;
3. candidate measurements on same-base, multibase and retry axes;
4. request/transfer/receiver/startup costs separated sufficiently to identify the next bottleneck;
5. semantic-equivalence proof for candidates claiming unchanged full context;
6. explicit ContextSlice completeness/quality gate if ContextSlice is selected;
7. restart/retry/stale identity behavior;
8. cancellation/resource behavior;
9. security/provider boundaries for any external path;
10. implementation/operational complexity and rollback comparison;
11. rejected alternatives and why they lost on this workload;
12. a selected staged plan with a falsifiable follow-on gate.

## 14. Decision rule

Prefer the candidate or staged sequence that:

1. removes the largest verified remaining product cost/risk;
2. preserves product semantics unless evidence justifies changing them;
3. introduces the fewest new authoritative/durable owners;
4. has the cheapest strong falsifiers and rollback;
5. remains compatible with the required Cloudflare/local-Agent/MCP final MVP;
6. avoids solving speculative fleet/provider problems before they are observed.

No Design number or previous conversation preference outranks measured evidence.

## 15. Non-goals

D0016 does not itself:

- implement ContextSlice;
- implement a persistent CAS/content store;
- implement a warm process pool;
- choose an external provider;
- migrate D0010 authority;
- implement CaseDO/AgentDO;
- implement MCP/auth;
- implement runtime Git publication;
- claim production SLO/token/cost/security outcomes from local fixtures;
- change tmcp logic.

## 16. Follow-on gates

Expected follow-on after the decision:

- D0017 if a new context-delivery contract is selected;
- D0018 for the accepted model executor/provider runtime boundary;
- D0022 only if the selected reference/content architecture actually requires durable/shared content storage;
- Group E exit review before integration to `mvp-1a-7`.

A later accepted Design may merge/split/reorder these planning labels if one coherent authority decision makes the current decomposition artificial.
