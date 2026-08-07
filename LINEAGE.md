# Development Lineage

This repository uses lineage identifiers, not product-style release versions.

## Current identities

- `mvp-1`: the baseline source snapshot for the current development family.
- `mvp-1a-1`: the current repository. It was produced from `mvp-1` by the first independently audited development line.

Historical comparison snapshots may be cited by commit digest when they explain an architecture decision, but they are not active branch identities.

## Naming rule

Use:

```text
mvp-<generation><lineage>-<revision>
```

where:

- `generation` changes only when the architecture foundation is intentionally restarted as a new generation while retaining accumulated engineering insight;
- `lineage` (`a`, `b`, `c`, ...) distinguishes sibling implementation lines within one generation;
- `revision` increments only within that implementation line.

Do not encode the full ancestry path in the name. Exact ancestry belongs in this document or equivalent repository metadata.

## Valid next outcomes from mvp-1a-1

### `mvp-1a-2`

Use when `mvp-1a-1` is the code/architecture base and the next work is a continuation or substantial transformation of that line. Large rewrites are allowed; the deciding fact is that the current line remains the implementation base.

### `mvp-1b-1`

Use when the accumulated evidence from `mvp-1a-1` is valuable but its implementation direction should not be the code base. Restart implementation from `mvp-1`, carry forward the learned evidence and insights, and create a sibling line.

### `mvp-2a-1`

Use when neither `mvp-1` nor `mvp-1a-1` should constrain the implementation foundation. Start a new architecture generation from accumulated requirements, invariants, measurements, failures, and insights. This is an architecture restart, not an ignorance restart.

## Knowledge lineage vs code lineage

A restart may discard code without discarding knowledge. Benchmarks, falsified assumptions, correctness invariants, failure cases, and validated design insights remain inputs unless independently disproved.

Therefore:

- code can restart from `mvp-1` and become `mvp-1b-1`;
- architecture can restart from accumulated insight and become `mvp-2a-1`;
- continuation from the current implementation becomes `mvp-1a-2`.

No future tool or model should invent semantic versions such as `0.x.y` to represent these development lines unless a separate product-release policy is explicitly introduced.
