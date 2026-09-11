# dev-2 engineering and development rule

`RULE.md` is the stable development constitution for `dev-2`. It is subordinate to `DIRECTIVE.md` and contains only general rules intended to survive architecture changes. Do not turn it into a Design registry, history log, current-state report, or implementation diary.

## 1. Authority boundaries

1. `DIRECTIVE.md` is highest authority for explicit user objectives and requirements.
2. `RULE.md` defines stable engineering and change rules but cannot narrow or reinterpret the Directive.
3. A Design owns only its explicitly bounded architectural or contract decision.
4. `WORKBOARD.md` owns current work routing/status only; it owns no product semantics.
5. History, evidence, indexes, benchmarks, handoffs, tests, code shape, and predecessor material are evidence or projections, not independent authority.
6. One durable semantic fact has one authoritative owner. Derived forms cite or mechanically derive from that owner rather than silently becoming co-owners.

## 2. Engineering invariants

1. Observe current truth instead of guessing or relying on remembered mutable state. Keep unverified facts `unknown`.
2. Define requirements and desired end state before evaluating existing implementation for reuse.
3. Prefer removal or clean replacement to compatibility pollution when correctness and migration safety permit it.
4. Parallelism is normal. Independent work should progress concurrently; configured capacity is policy, not work identity.
5. Conflicts are scoped. Fence only state or effects that can actually collide unless a genuinely global transition requires quiescence.
6. Concurrent mutable work must be isolated; do not share one writable candidate or checkout across independent work units.
7. Canonical mutation must have an explicit authoritative integration boundary. Required validation cannot be bypassed.
8. Retries and recovery are idempotent by stable identity; disconnect, restart, or response loss must not duplicate committed effects.
9. Missing, malformed, stale, unsupported, failed, uncertain, or partially observed states do not become success defaults.
10. Every durable owner, queue, coordinator, scheduler, journal, state machine, adapter, manifest, cache, or background process requires a concrete correctness or product-value justification.
11. Performance optimizations may not change semantic truth unless explicitly designed as a contract change.
12. Preserve external durable/user state and credentials deliberately. Aggressive source replacement does not authorize blind destructive migration.

## 3. Change classification

Use only two change classes.

### Direct change

A change is Direct when it satisfies an already established contract without changing product behavior, public schema, durable state meaning, ownership, concurrency semantics, security/trust boundary, deployment/migration contract, required validation, or benchmark methodology.

Direct changes may be implemented immediately with an exact intended result and appropriate focused verification.

### Designed change

A Design is required before implementation when a material product or architecture decision is introduced or changed, including public behavior/API, durable semantics, ownership, concurrency, isolation, conflict handling, retry/recovery, canonical integration, security, deployment, migration, context/self-development authority, required validation, or benchmark methodology.

When uncertain whether a change alters one of those boundaries, treat it as Designed.

## 4. Design discipline

Design authoring and relationship conventions live in `docs/design/README.md` and are subordinate to this Rule.

A Design must be falsifiable and bounded. It states the problem, required outcome, observed facts versus assumptions/unknowns, decision, relevant failure/recovery behavior, alternatives, and acceptance evidence needed.

Do not use a Design as history narrative or work log. Git preserves history; evidence artifacts preserve observations; `WORKBOARD.md` preserves current execution state.

Design identifiers are identities, not chronological authority or mandatory implementation order. Dependencies and supersession are explicit metadata, never inferred from numbering.

Implementation progress is not a Design semantic state. Keep execution progress in `WORKBOARD.md`.

When current evidence falsifies an accepted Design, revise or supersede the bounded decision before dependent implementation continues. Do not hide mismatch in an undocumented fallback, compatibility flag, second owner, or test-only exception.

## 5. Documentation evolution

All documents may change without prior user approval when justified by the active Directive and evidence.

For changes to the top-level authority/governance system itself, apply the justified change first and then report to the user the reason, material effect, major risks, and alternatives considered. Do not require an approval round trip merely because a document is top-level.

Subordinate documentation structure is autonomous. Add, merge, split, generate, or remove Design, architecture, history, evidence, benchmark, security, deployment, qualification, and operational documents as useful. Avoid documents whose only purpose is duplicating another owner's current truth.

## 6. Evidence and performance

1. A test or observation proves only the layer actually exercised.
2. Skipped, unsupported, unavailable, and unexecuted layers remain `unknown`.
3. Performance claims use comparable workloads with equivalent correctness semantics.
4. Record workload, environment/configuration, measured quantities, and material uncertainty. Use repeated/distribution measurements where noise matters.
5. Distinguish cold and warm behavior when material.
6. A favorable one-off run, reduced code size, or fewer steps on an incomparable workload is not proof of superiority.
7. Faster results achieved by omitting required correctness work are invalid comparisons.
8. Directive-required experiential proof cannot be replaced by unit tests alone.

## 7. Completion

A change is complete only when the active Directive remains satisfied, applicable Rule invariants hold, any required Design decision is accepted, implementation matches that decision, required validation is observed, and remaining unknowns are explicit.
