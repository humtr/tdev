# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-4`
- **Architecture generation:** MVP generation 1
- **Direct code parent / implementation origin:** `mvp-1a-3` at remote commit `52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- **Baseline knowledge input:** verified `mvp-1a-3`, Design 0006 persistence profiling, and independently verified Design 0007 V research
- **Latest verified implementation design:** Design 0007 — Verified Immutable-Journal Materialization Reuse
- **Next planning record:** Design 0008 — Authority-Boundary Verification and Durability Admission (`draft`; `mvp-1a-5` candidate only)
- **Superseded active identity:** `mvp-1a-3`

`mvp-1a-4` directly retains the verified `mvp-1a-3` Work Graph, lifecycle, Promotion, snapshot schema, immutable journal record format, no-replace expected-revision publication, migration boundary, and cross-process local-filesystem winner semantics. Its narrow designed change adds a disposable instance-local materialization cache that is usable only after the current committed namespace is strictly checked and every retained authoritative byte has been reread and matched by an exact ordered fingerprint.

## Why this is `mvp-1a-4`

The deciding fact is architecture and durable-code origin, not benchmark size.

- The implementation starts from the exact GitHub `mvp-1a-3` source state and preserves all D0005 durable bytes and publication slots.
- No new durable head, checkpoint, schema, compaction, history deletion, migration path, or canonical owner is added.
- The optimization is performance-only state. A cache miss, process restart, namespace change, file-type change, or byte change returns to complete D0005 strict validation/replay.
- Design 0006 measured repeated prefix replay as the dominant local immutable-journal cost; Design 0007 removes only that redundant replay when exact current bytes prove the predecessor is unchanged.

Therefore the next revision stays on lineage `1a` and advances the direct revision rather than creating a sibling lineage or architecture-generation restart.

## Relationship to prior and legacy lineages

- `mvp-1` is the current MVP generation's baseline source state.
- `mvp-1a-2` remains the verified incremental-transition and verified-journal-cache foundation.
- `mvp-1a-3` is the direct parent that introduced D0005 immutable expected-revision journal CAS and remains the durable-format regression baseline.
- `legacy/mvp-parallel` names the earlier TMCP-to-parallel experimental lineage. It is research history only and is not an active naming or implementation parent of `mvp-1a-4`.
- Historical `xh-*`, `parallel-*`, research branch names, and similar strings retained inside evidence do not define the current identity.

## Knowledge lineage and code lineage

Code revisions remain narrow while validated knowledge accumulates. Current accumulated knowledge includes:

- capacity 1 and capacity N as one execution model;
- isolated ordinary results and one deterministic Promotion/canonical mutation lane;
- complete Attempt fencing, CAS, durable-before-dispatch, and accepted-result durability;
- rebuildable derived state that cannot become semantic authority;
- counterexamples for root-level COW amplification, stale journal caches, Claim trie path retention, candidate-set loss, duplicate blocker propagation, journal corruption after cache warm-up, and unsafe mixed-format cross-process cutover;
- D0005 no-replace commit-slot winner semantics with strict retained-history validation;
- D0006 evidence that repeated prefix replay, not retained-byte observation itself, dominated the measured immutable-journal hot path;
- D0007 evidence that exact-byte-gated materialization reuse removes that replay cost without changing durable authority.

## Next planning gate

Design 0008 is opened from exact `mvp-1a-4@1ff7c5d321958df725497d4e3a2649e210b029db` as a Class 2 `draft`. While it remains draft:

- `mvp-1a-4` remains the active verified development identity;
- D0007 remains the latest verified implementation design;
- `mvp-1a-5` is only the candidate identity named by the planning record, not a published or implemented source state;
- no semantic tree/root, snapshot schema, migration, rollback, Git OID authority, or provider contract changes are authorized.

The planning gate reorders the next work because new source and real-Git counterexamples show that whole-tree Promotion is only one part of the current boundary. The Case snapshot packages the compiled Plan/full base tree, accepted results, canonical tree, Attempts, Events, and receipts; component limits do not yet prove aggregate durable-store fit; legacy journal committed-namespace validation is weaker than the protocol; `store_commit_ambiguous` lacks deterministic fault injection; and settlement-checkpoint/Claim liveness after a checkpoint exception is not yet closed.

If D0008 is later accepted and implemented, the development identity may advance within lineage `1a` only after the resulting source state and exact ancestry are independently verified. The managed `tmcp/` scratch branch used by tooling is transport bookkeeping and does not define tdev development-lineage naming.

## Naming rule

Use:

```text
mvp-<generation><lineage>-<revision>
```

The generation changes only for an intentional architecture-foundation restart. The lineage letter distinguishes sibling implementations in one generation. The revision advances within one direct code line. Exact ancestry belongs here rather than in an ever-growing name.
