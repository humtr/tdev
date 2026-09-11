# dev-2 Design authoring

This directory contains bounded architectural and contract decisions for `dev-2`.

This document is subordinate to `DIRECTIVE.md` and `RULE.md`. It defines Design-writing conventions only. It must not redefine product objectives, stable engineering rules, or current execution routing.

## 1. Purpose

Create a Design only when `RULE.md` classifies work as Designed. Designs make material decisions explicit, falsifiable, composable, and replaceable.

Do not create Designs for ordinary implementation progress, chronology, meeting notes, or evidence dumps.

## 2. Identity and naming

Use IDs `D0001`, `D0002`, ... within the `dev-2` epoch. A normal filename is `D0001-short-descriptive-title.md`.

The number is identity only. A larger number does not imply higher authority, later execution, dependency, or completion order.

## 3. Required metadata

Every Design begins with:

- `Design`: `Dxxxx`
- `Title`: short descriptive name
- `Status`: `draft | accepted | verified | superseded`
- `Depends-On`: zero or more Design IDs
- `Supersedes`: zero or more Design IDs
- `Directive`: current Directive revision the Design serves

Relationship meaning is owned by the Design declaring it. Never infer relationships from numbering or filenames.

`Depends-On` means the decision cannot be validly implemented or verified without the referenced Design. It is not a scheduling preference.

`Supersedes` means this Design intentionally replaces the bounded meaning of another Design. Superseded material remains history, not current authority for that meaning.

## 4. Required body

Keep the body decision-focused. Use these sections unless genuinely inapplicable:

1. **Problem** — one bounded material decision.
2. **Required outcome** — observable end state.
3. **Facts / assumptions / unknowns** — separate observation, inference, and unresolved state.
4. **Decision** — selected architecture or contract, including ownership/state transitions when relevant.
5. **Concurrency and isolation** — when shared resources or parallel work are involved.
6. **Failure and recovery** — failure, cancellation, retry, unknown-effect, cleanup, and recovery semantics where relevant.
7. **Security / external effects** — only when relevant.
8. **Alternatives** — serious alternatives and why rejected.
9. **Acceptance** — cheapest falsifiers and evidence needed to accept/verify.
10. **Implementation consequences** — affected areas and constraints, not a work diary.

A Design may be shorter when the decision is small. Do not add empty ceremonial sections.

## 5. Lifecycle

Use a minimal semantic lifecycle:

- `draft` — decision is being formed and does not authorize Designed implementation.
- `accepted` — current bounded decision; implementation may proceed.
- `verified` — required evidence for the claimed layers has been observed.
- `superseded` — another accepted Design owns the replaced meaning.

Do not use `implementing` as a Design status. Implementation progress belongs in `WORKBOARD.md`.

If accepted/verified meaning is falsified, revise the Design while preserving Git history or create a superseding Design when the problem/decision boundary materially changes. Do not accumulate a diary of prior states in the maintained Design body.

## 6. History and evidence separation

Keep Design prose current and bounded.

- Git owns document history.
- Evidence artifacts own detailed observations, benchmark outputs, and proof records.
- `WORKBOARD.md` owns current execution status.
- A Design cites evidence needed to justify or falsify its decision but does not reproduce an evidence archive.

Historical predecessor tdev/tmcp Designs may be cited only as non-authoritative evidence. They never become `dev-2` dependencies by citation.

## 7. Design relationship index

`docs/design/INDEX.md` is a derived navigation projection, not an authority owner.

It may show Design ID/title, current status read from each Design, declared `Depends-On` edges, declared `Supersedes` edges, and a relationship graph.

It must not invent or own those values and must not define execution order. If INDEX conflicts with a Design, the Design wins and INDEX is regenerated/fixed. If execution order matters, `WORKBOARD.md` owns it.

Prefer generating INDEX mechanically once Designs exist. Manual edits are acceptable only while they remain a faithful checkable projection.

## 8. Self-containment and predecessor reuse

A Design should be understandable from the current Directive, Rule, declared dependencies, and cited evidence. Avoid hidden reliance on prior conversations or predecessor architecture.

For predecessor implementation, decide the new abstraction first. Only then classify old code as `REUSE`, `REWRITE`, `DELETE`, or `LEGACY-ISOLATE`. Reuse requires an affirmative reason under the new Design.
