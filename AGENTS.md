# dev-2 repository instructions

`AGENTS.md` is the bootstrap and navigation entrypoint for `dev-2`. It owns no product requirement or architectural decision.

## Bootstrap

For material work, bind the exact current `dev-2` commit and read:

1. `DIRECTIVE.md` — highest repository authority for the user's explicit objectives, requirements, priorities, and completion conditions.
2. `RULE.md` — stable engineering and development rules subordinate to the Directive.
3. `WORKBOARD.md` — current execution state and routing; it owns no product meaning.
4. Only the Design or derived documents selected by the current work.

Conflicts resolve upward. `DIRECTIVE.md` wins over every repository document. `RULE.md` cannot narrow or reinterpret the Directive. Designs cannot override the Directive or Rule. `WORKBOARD.md`, indexes, history, evidence, benchmarks, handoffs, tests, code shape, predecessor branches, and prior conversations do not become authority by existence.

## Clean-root boundary

`dev-2` is a new Git root and authority epoch. No predecessor tdev/tmcp document, Design, architecture, lifecycle, implementation, branch history, or accepted conclusion is inherited. Predecessors may be inspected only as evidence, benchmark baselines, failure history, external-state provenance, or salvage candidates.

## Document autonomy

All repository documents may be created, revised, reorganized, merged, or removed without prior user approval when doing so better serves the active Directive and Rule.

When a change alters the top-level authority/governance system itself — including the role, precedence, or existence of `AGENTS.md`, `DIRECTIVE.md`, `RULE.md`, or `WORKBOARD.md` — make the justified change first and report it to the user afterward. The report must state the reason, material effect, important risks, and alternatives considered. Do not consume a user turn asking for approval unless a higher-priority safety or permission boundary requires it.

Derived documentation — including Designs, architecture, history, evidence, benchmarks, security, deployment, qualification, and indexes — may be designed and maintained autonomously. Create only what has a concrete navigation, decision, proof, or operational purpose.

## Design navigation

For Designed work follow `docs/design/README.md`. Each Design owns its bounded relationship metadata. `docs/design/INDEX.md` is only a derived navigation view and never owns Design meaning, status, dependency, supersession, or execution order.

## Truth

Freshly observe mutable repository, runtime, provider, and benchmark facts when they matter. Keep unverified state `unknown`. A proof establishes only the layer it actually exercised.
