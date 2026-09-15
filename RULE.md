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

## 8. Campaign, Design-minimization and documentation discipline

1. For Designed work, first locate the existing bounded semantic owner. Revise that Design when the changed decision remains within its natural ownership. Create a new Design only for a genuinely independent decision owner that cannot be represented clearly by revising existing ownership. Do not accumulate parallel or duplicate Designs merely to record chronology, implementation phases, migrations or naming cleanup.
2. A semantic-preserving naming correction is Direct. If a rename changes public contract, durable identity, security, deployment or migration semantics, revise the existing Design that already owns that meaning; the rename itself is not a reason to create a new Design.
3. A durable development campaign may use `C<n>` as its permanent campaign identity, `C<n>-<m>` for checkpoint identity and `C<n>-<m>.<k>` for detailed checkpoint identity. Issued IDs are not reused or renumbered. Identity does not imply execution order; WORKBOARD records current routing and the active checkpoint. Keep the hierarchy at these three levels and use ordinary checklists below them when more detail is needed.
4. WORKBOARD owns current execution position only. A repository-resident campaign plan may preserve ordered procedure, investigation/falsification steps, invariants, acceptance gates and resume instructions, but it is non-authoritative and must not duplicate current mutable truth or become a semantic owner. Plans may be revised as evidence changes.
5. New sessions rebind repository/runtime/provider truth freshly, read current authority and WORKBOARD, then reconcile the active checkpoint with durable Work/Action/effect state before continuing. Prior chat, plan snapshots, handoffs and remembered IDs are resume hints only.
6. Evidence, research, plans, history, handoffs and benchmark narratives are non-authority. They may preserve provenance, but ordinary safe development and operation must not depend on their continued presence. Any fact that remains necessary for future correctness or decision-making must be absorbed into its proper current owner: Directive, Rule, an existing Design, source/type/configuration, executable test or current WORKBOARD routing.
7. At campaign convergence, perform a non-authority dependency check. The product must remain understandable, safely changeable and operable when completed campaign plans, historical evidence and narrative history are not read. Retain only material provenance that still has concrete value; obsolete or redundant non-authority documents may be pruned because Git already preserves history.
