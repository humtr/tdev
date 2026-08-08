# Design 0006 — persistence hot-path measurement before acceleration

- Status: verified
- Class: 2 (verification-method and persistence follow-on gate)
- Baseline: `mvp-1a-3` / `52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Evidence owners affected: `docs/MVP.md`, `docs/IMPLEMENTATION_REPORT.md`, `WORKBOARD.md`
- Product behavior changed by this record: none

## 1. One-line definition

Measure the D0005 persistence hot path with production store semantics before authorizing any cache/checkpoint or authority-changing persistence implementation.

## 2. Facts, evidence, inference, unknowns

### Repository facts

- D0005 requires strict full retained-history replay for every immutable-journal load and non-create CAS.
- D0004 `JournalSnapshotStore` rereads and fingerprints exact retained bytes and may reuse a previously strictly validated materialization on an exact fingerprint match.
- Performance-only caches/indexes must be rebuildable and cannot author CAS or semantic state.
- D0005 explicitly defers checkpoint/cache acceleration to a separate Class 2 design.

### Prior measured evidence to reproduce or challenge

A prior 32-task / 4 KiB observation workload reported immutable-journal elapsed time about 3.2x the verified journal, while final cold loads of the two journal forms were close. That evidence was a hypothesis input, not a repository SLO.

### Inference under test

The leading hypothesis was that repeated prefix replay, including per-prefix snapshot validation/digest/copy work, dominates the immutable-journal gap. If materialized snapshot size grows with revision, this can create super-quadratic cumulative work in the measured workload.

### Unknowns before measurement

- exact phase attribution on the Node 22.16.0 container;
- scaling shape over the feasible range before the stop gate;
- how much of the gap remains after verified exact-byte fingerprint materialization reuse;
- filesystem publication cost relative to replay;
- transaction-capable provider viability under a different authority model.

## 3. Current contract and concrete problem

The D0005 correctness contract is not reopened by measurement. The problem was only that prior evidence did not isolate retained-byte reads, strict parse/canonical validation, replay/application, materialized snapshot digest/copy work, candidate/delta construction, and publication sufficiently to choose the next persistence design.

## 4. Decision

Use a benchmark-only research harness with production store semantics. Measure end-to-end elapsed time, successful CAS count, per-CAS/last-CAS cost, retained bytes, fresh-instance final load, and detailed immutable retained-file read/fingerprint/replay work. Vary task count and payload size and rotate store order across repeats where practical.

The research harness is evidence tooling only. It must not add production cache state or change store outcomes.

## 5. Stop gates

- No single benchmark child may run longer than 60 seconds.
- Do not advance to a larger task count after a store point exceeds 30 seconds wall time or retains more than 64 MiB.
- Do not claim an asymptotic exponent from fewer than three distinct completed task-count points.
- Wall-clock ratios are observations for this container only; operation/byte counts carry the stronger explanation.

## 6. Decision gates after measurement

### V — verified retained-history fingerprint materialization

Proceed to a separate Class 2 design if the immutable gap is materially explained by strict replay/prefix materialization while retained-byte scan/hash is substantially cheaper. V must preserve D0005 authority, filenames, publication, migration boundary, and corruption behavior: every operation still re-observes all retained authoritative bytes, and only an exact fingerprint match to a prior strict replay may reuse materialized state.

The experiment continuation target, not a correctness SLO, is at least 2x improvement over D0005 Immutable on the reproduced workload or p50 no worse than 1.25x verified Journal.

### S — transaction-capable provider prototype

Keep separate because a transactional current-head/history schema changes authority, migration, rollback, and failure handling. A feasibility prototype cannot become a promotion candidate without a separate accepted design and runtime/provider evidence.

### M-A — authoritative checkpoint/Merkle root

Deferred. It requires explicit approval of a weaker hot-path retained-history observation contract and a new anti-rollback/authority design.

## 7. Acceptance

- Baseline source gate remains green.
- Measurement tooling does not modify production store behavior.
- At least three task-count points complete for File, Journal, and Immutable or the stop gate is recorded.
- Detailed immutable phase data is retained as structured JSON.
- The next design decision names which measured phase justifies it; absence of evidence blocks implementation rather than guessing.

## 8. Non-goals

Changing D0005 semantics, setting a production SLO, distributed/provider persistence, hostile-storage authentication, history deletion/GC, or deploying a new adapter.

## 9. Verification closure

Structured evidence is retained in `docs/evidence/persistence-phase0-2026-08-08.json`. Three randomized-order repeats completed at 16, 24, and 32 tasks. The 16 -> 32 exact prefix accounting measured approximately 4x growth in one final replay byte-work and approximately 8x growth in cumulative replay byte-work across the CAS sequence, while retained-byte read/fingerprint remained a small fraction of strict replay time. The V gate opened; M-A remained deferred.
