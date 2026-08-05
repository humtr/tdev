# Design NNNN — Title

> Template only. Copy to a numbered file, replace every placeholder, and register it in [README.md](README.md). A template is not an accepted design.

## Metadata

- Status: `draft`
- Date: `YYYY-MM-DD`
- Acceptance authority: `<maintainer decision or repository process>`
- Base source: `<exact commit>`
- Affected owners: `<normative owner files>`
- Implementation paths: `<bounded paths>`

## One-line definition

`<exact end state>`

## Source classification

### Authority

- `<current normative owner and relevant section>`

### Evidence

- `<command, test, external observation, or artifact tied to exact inputs>`

### Inference

- `<conclusion derived from named authority/evidence>`

### Unknowns

- `<missing, ambiguous, conflicting, stale, unsupported, or unexecuted fact>`

## Baseline contract at design start

- `<what affected owners say at the exact base source before the change>`

## Problem and evidence

`<reproducible problem; distinguish observed fact from preference>`

## Scope

- `<facts and layers this record may change>`

## Non-goals

- `<adjacent work explicitly excluded>`

## Invariants

- `<fact that must remain true>`

## Owner impact

- Existing owners changed: `<files or none>`
- Owner added or removed: `<normally none; explain when not none>`
- Projections/caches introduced: `<owner and non-authoritative role or none>`

## Design

### Data and state

`<records, identifiers, revisions, digests, transitions, and terminal meaning>`

### API and dependencies

`<typed surfaces, dependency direction, versioning, and bounds>`

### Ordering, concurrency, retry, and cancellation

`<serialization owner, idempotency, fencing, stale writer, uncertainty, cancellation>`

### Errors and evidence

`<typed failures, reconciliation, and authoritative completion reader>`

## Security and secret impact

`<trust boundary, permissions, path policy, secret flow, or not affected with reason>`

## Compatibility, migration, and rollback

- Compatibility: `<range and old reader/writer behavior or not affected>`
- Migration: `<preconditions and ordering or not affected>`
- Rollback: `<compatible predecessor and barriers or not affected>`

## Current implementation status

`<After implementation begins, record completed layers, current source evidence, the next gate, and every unverified runtime/public/client layer. Do not rewrite the baseline sections or use this section as a second owner.>`

## Vertical slices

1. `<smallest production-shaped slice using final boundaries>`

## Acceptance criteria

1. `<observable outcome>`

## Verification matrix

| Claim | Command or probe | Authoritative reader | Layer | Contamination/skip rule |
| --- | --- | --- | --- | --- |
| `<claim>` | `<verification>` | `<owner>` | `<layer>` | `<when result is unknown>` |

## Stop gates

- `<unknown and dependent work it blocks>`

## Decision log

- `YYYY-MM-DD`: `<accepted decision or evidence-driven reopening>`
