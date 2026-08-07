# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-2`
- **Architecture generation:** MVP generation 1
- **Direct code parent / implementation origin:** `mvp-1a-1`
- **Baseline knowledge input:** `mvp-1`
- **Additional knowledge input:** the implementation, tests, benchmark evidence, failed assumptions, and counterexamples found while independently auditing `mvp-1a-1`
- **Superseded active identity:** `mvp-1a-1`

`mvp-1a-2` directly retains the generation-1 Work Graph, Case/Task/Attempt ownership model, typed result algebra, deterministic Promotion path, snapshot schema v2, store interface, and most of the `mvp-1a-1` implementation. It rewrites the mutation transaction, incremental derived-state maintenance, blocker propagation, Claim trie cleanup, and journal-cache/CAS behavior where independent testing disproved the candidate's safety or scaling claims.

## Why this is `mvp-1a-2`

The deciding fact is architecture and code origin, not change size.

- The final repository was developed directly from the supplied `mvp-1a-1` source tree.
- The authoritative state owners, execution model, persistence protocol, public source API, and snapshot generation remain the same architecture foundation.
- Substantial subsystem rewrites are corrections within that foundation rather than a sibling implementation from `mvp-1` or a new architecture generation.
- `mvp-1a-1` remains a knowledge input even where its implementation was replaced: its COW experiment, ready candidates, Claim index, journal layout, benchmarks, and failure cases guided the next implementation.

Therefore:

- `mvp-1b-1` was rejected because the implementation did not restart from `mvp-1`;
- `mvp-2a-1` was rejected because the Work Graph ontology, ownership model, execution model, durable protocol, and Promotion foundation were not restarted.

## Relationship to prior and legacy lineages

- `mvp-1` is the current MVP generation's baseline source state.
- `mvp-1a-1` is the directly superseded candidate and remains historical evidence, not the active development identity.
- `legacy/mvp-parallel` names the earlier TMCP-to-parallel experimental lineage. It is research history only and is not an active naming or implementation parent of `mvp-1a-2`.
- Historical `xh-*`, `parallel-*`, branch names, and similar strings retained inside supplied evidence do not define the current identity.

## Knowledge lineage and code lineage

Code may be replaced while validated knowledge accumulates. For this development state, accumulated knowledge includes:

- capacity 1 and capacity N as one execution model;
- isolated ordinary results and one deterministic Promotion/canonical mutation lane;
- complete Attempt fencing, CAS, durable-before-dispatch, and accepted-result durability;
- rebuildable derived state that cannot become semantic authority;
- counterexamples for root-level COW amplification, stale journal caches, Claim trie path retention, candidate-set loss, duplicate blocker propagation, and journal corruption after cache warm-up;
- wide/deep scaling, persistence-byte, GC, Claim, and Promotion measurements retained under `docs/evidence/`.

## Naming rule

Use:

```text
mvp-<generation><lineage>-<revision>
```

The generation changes only for an intentional architecture-foundation restart. The lineage letter distinguishes sibling implementations in one generation. The revision advances within one direct code line. Exact ancestry belongs here rather than in an ever-growing name.
