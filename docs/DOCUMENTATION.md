# tdev documentation system

> Normative owner for documentation taxonomy, cross-document authority boundaries, naming categories and historical-retention rules. It classifies documents; it does not redefine product contracts.

## 1. Two independent classification axes

Every durable document is classified on two axes. Do not confuse them.

### Axis A — what kind of truth it carries

#### Product contract

Product contracts answer what tdev must mean or do at runtime. They are independent of the ChatGPT session, development branch, worktree, Design number or tool that produced them.

| Product concern | Owner |
| --- | --- |
| scope, terminology, product acceptance and non-goals | `docs/SPEC.md` |
| component/fact ownership, dependency direction and concurrency | `docs/ARCHITECTURE.md` |
| Case/Task/Attempt/result/Claim/Promotion records and transitions | `docs/PROTOCOL.md` |
| runtime operation boundary and failure behavior | `docs/OPERATIONS.md` |
| trust, identity, secret, path and effect boundaries | `docs/SECURITY.md` |
| deployment, provider binding, migration and rollback | `docs/DEPLOYMENT.md` |
| MCP product surface and protocol boundary | `docs/MCP.md` |
| executable source/provider qualification requirements | `docs/MVP.md` |

A product owner may reference a development plan, but current branch/session/Design state cannot be required to interpret product meaning.

#### Self-development / engineering

Self-development documents answer how this repository is changed, routed, designed, integrated, verified and published.

| Development concern | Owner |
| --- | --- |
| repository/session bootstrap entrypoint | `AGENTS.md` |
| stable implementation guardrails | `RULE.md` |
| change classification and Design lifecycle | `SDD.md` |
| current routing instance and live carry-forward constraints | `WORKBOARD.md` |
| cumulative checkpoint succession/preservation | `LINEAGE.md` |
| documentation taxonomy and naming | `docs/DOCUMENTATION.md` |
| development plane/worktree/synchronization/publication workflow | `docs/development/WORKFLOW.md` |
| final-MVP capability decomposition and exit intent | `docs/ROADMAP.md` |
| Design-sized dependency and coverage graph | `docs/development/PROGRAM.md` |
| one bounded Class 2 decision | `docs/design/<id>-<name>.md` |

Development documents may change product owners through an accepted Design, but they cannot silently become product semantics.

#### Evidence / history

Evidence answers what was observed. History preserves what was previously decided, believed, rejected or routed at a past point.

Examples:

- `docs/evidence/*.json` — structured observed evidence;
- tests, workflow runs, artifacts and exact commit identities referenced by evidence;
- `docs/history/*.md` — retained historical narrative or completed bounded reports;
- superseded/older Design revisions preserved by Git/evidence identity.

Evidence or history can falsify/reopen a contract but cannot become the replacement contract merely because it is detailed or passed once.

### Axis B — how a new session uses it

A document also has one primary session role:

| Session role | Meaning | Typical documents |
| --- | --- | --- |
| bootstrap | always needed to establish current development authority | `AGENTS.md`, `RULE.md`, `SDD.md`, `WORKBOARD.md` |
| stable owner | loaded when affected scope requires its long-lived contract | product owners, `LINEAGE.md`, `WORKFLOW.md`, `ROADMAP.md`, `PROGRAM.md` |
| current router | selects the current development frontier | `WORKBOARD.md` |
| active decision | authorizes one Class 2 scope | current Design revision |
| evidence | loaded for the gate/falsifier it proves | `docs/evidence/*`, tests/CI/runtime observations |
| history | loaded for provenance, prior rationale or defect comparison | `docs/history/*`, old Git/Design state |

Evidence is therefore a first-class truth category but is not a peer bootstrap router. A new session normally needs current routing before it knows which evidence matters.

## 2. Bootstrap and progressive loading

The unconditional repository bootstrap is:

```text
AGENTS.md
RULE.md
SDD.md
WORKBOARD.md
```

`AGENTS.md` defines the algorithm; `RULE.md` defines stable engineering invariants; `SDD.md` defines change/Design lifecycle; `WORKBOARD.md` owns the current route.

After that kernel, load stable owners selected by affected scope. Do not preload the whole historical/program corpus merely because it exists.

A chat summary, handoff, project prompt, Task context, generated registry or cached session manifest is derived continuity material. It may be reused only after its routing/Design/owner claims are rebound to current repository owners.

## 3. Information direction and one-owner rule

The default information direction is:

```text
self-development / engineering
        | changes through Design
        v
product contracts
        | are tested / observed by
        v
evidence

history preserves former states of any layer without becoming current authority
```

Each durable fact has one owner. Other documents may:

- link to it;
- derive a summary deterministically;
- cache it with source identity and mismatch rejection;
- record what it was at a historical point.

They may not independently originate another current value.

In particular:

- `WORKBOARD.md` owns the current active Group/branch/current gate/next action;
- `LINEAGE.md` owns valid checkpoint succession, not the current instance;
- `ROADMAP.md` owns stable capability/exit intent, not current branch routing;
- `PROGRAM.md` owns dependency/coverage planning, not current branch routing;
- a Design owns its current maintained revision/status; human indexes are derived summaries;
- remote Git owns its current mutable ref observation, so publication rereads that ref rather than trusting a documentation snapshot.

## 4. Program traceability

Every final-MVP requirement must remain traceable through applicable layers:

```text
product requirement
-> product owner
-> capability/exit intent
-> Design/gate dependencies
-> accepted Design when Class 2
-> implementation
-> exact verification/evidence
-> operator/provider action when applicable
```

No requirement disappears because its mechanism is undecided. Unknown, conditional and deferred decisions stay explicit.

Conversely, a planned Design needs a parent product requirement, risk, verification gap or evidence-backed optimization. A Design number is never authorization by itself.

Checkpoint lineage is orthogonal to this trace: a Group checkpoint preserves accumulated work only after its exit can be trusted; branch names do not own capabilities.

## 5. Naming semantics

Filename style is a navigation signal, not authority by itself.

### Live normative/current Markdown

Use `UPPERCASE.md`; prefer one semantic word when that remains clear and precise.

Examples: `RULE.md`, `SDD.md`, `WORKBOARD.md`, `LINEAGE.md`, `SPEC.md`, `PROTOCOL.md`, `SECURITY.md`, `WORKFLOW.md`, `PROGRAM.md`.

A multiword live normative name is allowed when forcing one word would reduce clarity or create unnecessary migration risk. Existing widely referenced `MVP.md` remains the executable-acceptance owner under D0031 rather than being renamed only for stylistic purity.

`README.md` is a conventional navigation exception and does not become normative merely because it is uppercase.

### Bounded/specific/historical material

Use lowercase kebab-case for new or actively migrated:

- Design records: `docs/design/0031-self-development-documentation-authority.md`;
- evidence: `docs/evidence/group-f-d0031-...json`;
- completed group/campaign reports;
- audits and reviews;
- historical narratives under `docs/history/`.

Do not rename a file solely for aesthetics when the reference/provenance cost exceeds the semantic benefit.

## 6. Historical retention

Preservation and loading are separate decisions.

Keep historical material when it contains unique:

- rejected alternatives or rationale;
- falsifiers/counterexamples;
- exact environment/qualification limits;
- migration/rollback boundaries;
- formerly current identities needed to interpret evidence;
- evidence provenance not reproducible from current owners.

Do not keep a historical narrative in `WORKBOARD.md` merely because it is valuable. Move/retain it under its Design/evidence/history owner and link it only when current work needs it.

A historically correct statement such as “Group E was active” remains correct inside a clearly historical report. Do not rewrite evidence/history to make it look current.

Before deleting duplicated prose, prove either:

1. it is a byte/meaning duplicate of a durable owner, or
2. its unique information has been preserved at the correct historical/evidence owner.

## 7. Current router content rule

`WORKBOARD.md` may retain old facts only when they constrain current action, for example:

- immediate completed predecessor needed for current ancestry;
- a live inherited qualification gap;
- unresolved sync/checkout-alignment debt;
- active migration or rollback barrier;
- accepted Design whose implementation remains a current frontier dependency.

Detailed benchmark chronology, old test counts and superseded current pointers belong elsewhere.

Age alone does not decide retention; present decision impact does.

## 8. Derived registries and mismatch checks

Human-readable registries such as `docs/design/README.md`, roadmap status summaries or program status fields are derived/supporting views when the underlying Design/current router owns the fact.

They must not resolve conflicts in their own favor. Documentation validation should detect drift and require repair of the derived view or its deterministic generation rule.

Do not introduce a new permanent authority/session manifest that repeats existing owners. An ephemeral resolver output is acceptable only if it identifies its source owners and becomes invalid when those sources change.

## 9. Review rule

Before closing a Design or checkpoint, review applicable dimensions independently:

1. **Product:** did product meaning change, and was the correct owner updated?
2. **Development:** are current routing, program dependencies and remaining gates accurate?
3. **Evidence:** does every verification claim identify the layer actually observed, with unsupported layers explicit?
4. **History:** were unique rationale/provenance preserved without being promoted into current authority?
5. **Checkpoint:** if a Group closes, is the exact final head retained and the successor created only under `LINEAGE.md`?

A claim is incomplete if one dimension is silently substituted for another.
