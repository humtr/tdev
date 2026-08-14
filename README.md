# tdev

tdev is a **parallel-first Work Graph system**. Its durable product semantics, runtime ownership, protocol records, security boundaries, deployment contract and verification methods are defined by the normative owners under `docs/`; this README is navigation and orientation only.

Do not infer current development state from this file. The repository deliberately separates stable product meaning, self-development routing, Design decisions, observed evidence and history.

## Development session bootstrap

For repository development, start at `AGENTS.md`.

The fixed bootstrap kernel is:

```text
AGENTS.md
RULE.md
SDD.md
WORKBOARD.md
```

`AGENTS.md` defines the bootstrap/rebinding algorithm. `RULE.md` owns stable engineering guardrails. `SDD.md` owns change classification and Design lifecycle. `WORKBOARD.md` alone owns the current cumulative Group/branch, runnable Design revision foreign keys, selected next action and live carry-forward constraints.

After that kernel, load only the owners selected by the current route and affected scope. Historical reports, old Designs and prior chat/task context are continuity/provenance, not current authority.

## Product contract map

| Concern | Owner |
| --- | --- |
| scope, terminology, product acceptance and non-goals | `docs/SPEC.md` |
| component/fact ownership, dependency direction and concurrency | `docs/ARCHITECTURE.md` |
| Case/Task/Attempt/result/Claim/Promotion records and transitions | `docs/PROTOCOL.md` |
| runtime operation boundary and failure behavior | `docs/OPERATIONS.md` |
| trust, identity, secret, path and effect boundaries | `docs/SECURITY.md` |
| deployment, provider binding, migration and rollback | `docs/DEPLOYMENT.md` |
| MCP product surface and protocol boundary | `docs/MCP.md` |
| verification methods, executable source gate and proof-layer boundaries | `docs/QUALIFICATION.md` |

One product owner may reference another, but development branch/session state is not required to interpret product meaning.

## Development and planning map

| Concern | Owner |
| --- | --- |
| repository/session bootstrap | `AGENTS.md` |
| stable implementation guardrails | `RULE.md` |
| change classes, Design revisions/reopen/supersession | `SDD.md` |
| current route, runnable frontier and selected action | `WORKBOARD.md` |
| checkpoint succession and completed-ref preservation | `LINEAGE.md` |
| documentation taxonomy/naming/history rules | `docs/DOCUMENTATION.md` |
| self-development execution/worktree/publication workflow | `docs/development/WORKFLOW.md` |
| stable final-MVP capability decomposition and exits | `docs/ROADMAP.md` |
| forward Design/gate dependency and coverage graph | `docs/development/PROGRAM.md` |
| one bounded Class 2 decision | `docs/design/<id>-<name>.md` |
| derived Design index | `docs/design/README.md` |

`docs/ROADMAP.md` answers **what capability exits define the final MVP**. `docs/development/PROGRAM.md` answers **which forward Design-sized gates cover those exits and how the unresolved/conditional work relates**. Neither file is the current router.

## Evidence and history

- `docs/evidence/` contains machine-readable observed evidence.
- `docs/history/` preserves completed/superseded narratives and former live-document snapshots when their provenance still matters.
- Design files own their maintained revision/status; Git and evidence preserve earlier accepted meanings.
- A historical statement can remain true about the past without becoming a current branch, Design or product claim.

Passing tests never silently redefine a product contract. A check proves only the layer it actually observes; unsupported or unexecuted layers remain explicit.

## Repository development discipline

- Parallel execution is the base semantic model; executor capacity one is the same model with less capacity.
- Ordinary Task work produces isolated results; Promotion is the canonical tree writer.
- Current branch/runnable work is resolved from `WORKBOARD.md`, not remembered from an earlier session.
- Class 2 mutation requires an accepted or implementing Design revision under `SDD.md`.
- One durable fact or contract has one authoritative owner; derived views must be mechanically checked or explicitly non-authoritative.
- Before remote-changing actions, re-read the provider ref and prove the exact expected predecessor/ancestry.
- Preserve unrelated branches, worktrees, files, processes, secrets, evidence and completed checkpoints.

For exact validation commands and what they do or do not prove, read `docs/QUALIFICATION.md`; this README intentionally does not duplicate that executable gate.

## Reading by goal

- **Understand the product:** start with `docs/SPEC.md`, then follow the affected product owners.
- **Continue development:** start with `AGENTS.md` and let the bootstrap/current router select the next documents.
- **Understand final-MVP coverage:** read `docs/ROADMAP.md`, then `docs/development/PROGRAM.md` for forward gates.
- **Implement a Class 2 change:** read the exact maintained Design revision referenced by the current gate plus every affected normative owner.
- **Verify a claim:** read `docs/QUALIFICATION.md` and the exact evidence for the claimed layer.
- **Investigate why a former decision existed:** load the relevant Design/evidence/history only after rebinding current authority.

The pre-D0033 README, including its formerly current development/benchmark narrative, is preserved at `docs/history/readme-before-d0033.md` for provenance rather than maintained as live navigation.
