# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-6` — verified D0009 non-authoritative semantic-representation comparison lineage
- **Architecture generation:** MVP generation 1
- **Direct code parent / implementation origin:** `mvp-1a-5` at remote commit `aaf7ec9258fb776443dd70345a1acea33ed22d78`
- **Baseline knowledge input:** verified `mvp-1a-5` / Design 0008 plus the checked D0009 representation matrix
- **Latest verified design:** Design 0009 — Semantic-Authority Representation Comparison
- **Active design:** none; the next production-affecting authority change requires a separate Class 2 migration/transactional-head record
- **Superseded active identity:** `mvp-1a-5`

`mvp-1a-6` keeps the exact `mvp-1a-5` production authority model. Its new executable surface is confined to `bench/` research models/harnesses plus focused tests and checked evidence. Current `CaseEngine` canonical state, full-tree `treeDigest`, snapshot v2, journal formats, migration/rollback rules, Git-OID status, and provider/distributed ownership are unchanged.

`mvp-1a-4` directly retains the verified `mvp-1a-3` Work Graph, lifecycle, Promotion, snapshot schema, immutable journal record format, no-replace expected-revision publication, migration boundary, and cross-process local-filesystem winner semantics. Its narrow designed change adds a disposable instance-local materialization cache that is usable only after the current committed namespace is strictly checked and every retained authoritative byte has been reread and matched by an exact ordered fingerprint.

## Historical rationale — why `mvp-1a-4` stayed on lineage 1a

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
- D0007 evidence that exact-byte-gated materialization reuse removes that replay cost without changing durable authority;
- D0008 evidence that aggregate durable admission, legacy committed-namespace fail-closed parity, deterministic local publication-fault classification, and settlement-checkpoint/Claim reopen behavior can be closed without changing snapshot schema or semantic tree identity;
- D0008 authority-path evidence that 24 completed 1k/5k/20k samples preserve Promotion/cold-restore equality while all eight 100k samples hit declared time/RSS stop gates, including sparse writes;
- D0009 evidence that simple directory Merkle retains O(N) sibling-metadata work in wide directories, while bounded path-byte radix and collision-safe path-hash trie models can derive sparse roots without changing current semantic output;
- D0009 evidence preferring the C3 path-hash trie for the next migration design on checked operation/byte counts, with C2 radix retained as fallback/reference and the current full-tree digest tax explicitly preserved until migration.

## Verified D0008 gate

D0008 is verified on the `mvp-1a-5` lineage in the declared Node 22 source and compatible POSIX-local-filesystem scope. Source candidate `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f` passed the complete Ubuntu/POSIX source gate, coverage command, diff check, and authority-harness smoke; focused local durable/store tests also passed. The checked matrix is `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json`.

Verification does **not** promote Git OIDs, provider storage, distributed Claims, current tmcp/Termux hard-link support, or a new semantic root to authority. The connected Termux filesystem failed the required hard-link primitive and remains unqualified for ImmutableJournal publication. D0009 subsequently performs the separate representation comparison without altering those boundaries.

## Verified D0009 comparison gate

D0009 is verified on the `mvp-1a-6` lineage as a non-authoritative comparison. Final comparison candidate `7ba03082ac94fe75242c22a7b31ca76d933aeb0c` passed independent Ubuntu/POSIX run `31306276819` / job `93227063683`: 152/152 source tests, 92.57% line / 83.10% branch / 95.99% function coverage, clean effective diff, and the full 144-model matrix. Raw checked evidence is `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` with SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`.

C1 directory Merkle is rejected by its 100k-wide sparse-update sibling fanout. C2 radix and C3 collision-safe hash trie survive structurally; C3 is preferred for the next migration design because the checked broad-update operation/byte work is materially lower even after path-key hashing is explicitly counted. The three stopped model samples stopped only during current full-tree compatibility materialization/digest after their candidate-root update completed. Consequently `mvp-1a-6` still uses the existing full text-tree semantic identity and persistence.

The managed `tmcp/` scratch branch used by tooling remains transport bookkeeping and does not define tdev development-lineage naming.

## Naming rule

Use:

```text
mvp-<generation><lineage>-<revision>
```

The generation changes only for an intentional architecture-foundation restart. The lineage letter distinguishes sibling implementations in one generation. The revision advances within one direct code line. Exact ancestry belongs here rather than in an ever-growing name.
