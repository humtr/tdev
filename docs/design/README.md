# dev-2 Design authoring

## Authority and ownership

`DIRECTIVE.md > RULE.md > Design`. AGENTS is bootstrap/navigation; WORKBOARD owns current execution and ordering. Designs own bounded current architectural decisions, not user goals or progress. Git is history; evidence is observation. Neither this guide, generated INDEX nor an architecture overview is a new authority tier. The repository's clean-root Design namespace starts at D0001; predecessor IDs carry no authority here.

A new Design is warranted by a material decision independently falsifiable or replaceable: a state/authority boundary, public contract, safety invariant realization, execution mechanism or required evidence methodology. Do not fragment every function into a Design, and do not put independent owners in a mega-Design. A direct change that preserves accepted semantics needs no ceremonial new Design.

## Metadata contract

Use the line-oriented metadata in TEMPLATE exactly once, immediately after the title. `Design`, `Title`, `Status`, `Depends-On`, `Supersedes`, `Directive` and `Owns` are mandatory. ID format is D plus four digits; it is identity, never sequence or priority. Titles are descriptive. Status is draft, accepted, verified or superseded. Directive names the current controlling revision, not a locally narrowed version.

`Depends-On` is a bracketed comma-separated list of semantic prerequisites; empty is `[]`. Declare only actual decision dependencies, not merely implementation imports or mentions. `Supersedes` is the same form and explicitly identifies replaced decisions in this clean-root namespace. Partial replacement must clarify ownership and cannot leave competing accepted owners. Do not use old tdev IDs as supersession targets.

`Owns` is a comma-separated set of unique lowercase hyphenated bounded-decision labels. It is a review aid, not sufficient proof against semantic overlap. A cross-cutting Design references another owner's rule rather than defining a second version. Metadata is owned only by the declaring Design. INDEX is generated and must not be edited to change status/dependency/ownership.

## Content and acceptance

Use Problem, Required outcome, Facts / assumptions / unknowns, Decision, relevant Concurrency/isolation, Failure/recovery, Security/effects, Alternatives, Acceptance and Implementation consequences. State observable falsifiers, exact identity/linearization when relevant, failure/uncertainty handling and the minimal reason each owner exists. Design acceptance decides behavior before implementation; verification requires actual matching evidence. Unknown measurements or deployment values do not become alleged results. Leave no material semantic choice as 'implementation decides'.

Keep chronology, recovery narratives, past revisions and execution diaries out of the body. Link bounded evidence where useful; store evidence elsewhere. Execution lanes and current blockers belong in WORKBOARD. An accepted Design can be revised under normal repository authority when new evidence falsifies it; never rewrite the Directive to make a failed test look compliant.

## Derived navigation and checks

Run from repository root:

```sh
python docs/design/check.py --write-index
python docs/design/check.py
```

The stdlib-only checker projects metadata into INDEX and rejects duplicate IDs/ownership labels, invalid status or references, dependency/supersession cycles, stale derived INDEX and broken relative Markdown file links. It checks document structure and current authority revision references. It is documentation tooling, not product implementation or architecture proof. Review semantic ownership, requirement coverage and WORKBOARD separation manually as well.

Acyclic dependencies are the default. If a genuine semantic cycle is discovered, first reconsider decomposition; this checker intentionally blocks publication until the cycle is eliminated or the authoring contract is explicitly revised with justification. Work execution order may differ from any topological display, but no dependency can be inferred from a Design number. `docs/ARCHITECTURE.md` projects requirement coverage and `WORKBOARD.md` routes the implementation frontier.

Documentation checking prunes `.git`, `node_modules`, `.bootstrap`, `.artifacts` and `__pycache__`. Installed tool documents and generated output are not repository documentation or authority. All other repository Markdown remains checked.
