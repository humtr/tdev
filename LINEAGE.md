# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-3`
- **Architecture generation:** MVP generation 1
- **Direct code parent / implementation origin:** `mvp-1a-2` at remote commit `ee02845c8947b69f810308fd957e3952a8e508b9`
- **Baseline knowledge input:** verified `mvp-1a-2` plus independently reproduced comparison evidence from the separate `tdev-mvp-1a-2-ted` implementation
- **Active design:** Design 0005 — Immutable Expected-Revision Journal CAS
- **Superseded active identity:** `mvp-1a-2`

`mvp-1a-3` directly retains the verified `mvp-1a-2` execution, lifecycle, Promotion, snapshot, and same-process persistence behavior. Its narrow designed change adds an opt-in immutable expected-revision journal adapter that can elect one local-filesystem CAS winner across independent Node processes without using cache or checkpoint state as authority.

## Why this is `mvp-1a-3`

The deciding fact is architecture and code origin, not change size.

- The implementation starts from the exact GitHub `mvp-1a-2` source state and preserves its correctness barriers.
- The Work Graph ontology, execution model, Case/Task/Attempt ownership, snapshot schema, Promotion semantics, and existing stores are not restarted.
- Design 0005 adds one opt-in storage adapter and one-way durable-format migration boundary rather than replacing the architecture foundation.
- Comparison implementation B contributes counterexamples and a commit-slot idea only; it is not a code parent.

Therefore the next revision stays on lineage `1a` rather than becoming a sibling or architecture-generation restart.

## Relationship to prior and legacy lineages

- `mvp-1` is the current MVP generation's baseline source state.
- `mvp-1a-2` is the direct code parent and remains the verified regression baseline.
- `mvp-1a-1` remains earlier historical evidence.
- `legacy/mvp-parallel` names the earlier TMCP-to-parallel experimental lineage. It is research history only and is not an active naming or implementation parent of `mvp-1a-3`.
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
