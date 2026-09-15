# dev-2 Design authoring

## Authority and ownership

`DIRECTIVE.md > RULE.md > Design`. AGENTS is bootstrap/navigation; WORKBOARD owns current execution and ordering. Designs own bounded current architectural decisions, not user goals, campaign routing, or progress. Git is history; evidence is observation. Neither this guide nor generated `INDEX.md` is a new authority tier.

A new Design is warranted by a material independently falsifiable or replaceable decision: a state/authority boundary, public contract, safety invariant realization, execution mechanism, migration contract, or required evidence methodology. Do not fragment every function into a Design and do not create a Design merely to record chronology, phases, naming cleanup, or implementation progress. A direct change that preserves accepted semantics needs no ceremonial Design.

## Metadata contract

Use the line-oriented metadata in `TEMPLATE.md` exactly once, immediately after the title. `Design`, `Title`, `Status`, `Depends-On`, `Supersedes`, `Directive` and `Owns` are mandatory. ID format is D plus four digits; it is identity, never sequence or priority. `Directive` names the current controlling Directive revision.

`Depends-On` and `Supersedes` contain only actual semantic relationships. Partial replacement must clarify ownership and cannot leave competing accepted owners. `Owns` is a comma-separated set of unique lowercase hyphenated bounded-decision labels. It is a review aid, not sufficient proof against semantic overlap. A cross-cutting Design references another owner's rule rather than defining a second version.

## Content and acceptance

A Design should state the problem, required outcome, facts/assumptions/unknowns, decision, relevant concurrency/isolation, failure/recovery, security/effects, alternatives, acceptance evidence, and implementation consequences. State observable falsifiers and exact identity/linearization when relevant. Design acceptance decides behavior; verification requires actual matching evidence. Unknown measurements or deployment values do not become alleged results.

Keep chronology, campaign progress, recovery narratives, and obsolete implementation-phase instructions out of the body unless a historical fact is necessary to explain a still-current semantic boundary. Execution position belongs in WORKBOARD. When current evidence falsifies an accepted decision, revise or supersede the bounded owner rather than hiding the mismatch in another document.

## Derived navigation and checks

Run from repository root:

```sh
python docs/design/check.py --write-index
python docs/design/check.py
```

The stdlib-only checker projects metadata into `INDEX.md` and rejects duplicate IDs/ownership labels, invalid status or references, dependency/supersession cycles, stale derived index output, stale controlling Directive revisions, and broken relative Markdown file links. It is documentation tooling, not product implementation or architecture proof.

Acyclic dependencies are the default. Work execution order may differ from any topological display, but no dependency can be inferred from a Design number. Review current requirement coverage directly against `DIRECTIVE.md` and the selected Design owners; `WORKBOARD.md` routes the implementation frontier.

Documentation checking prunes `.git`, `node_modules`, `.bootstrap`, `.artifacts` and `__pycache__`. Installed tool documents and generated output are not repository documentation or authority. All other repository Markdown remains checked.
