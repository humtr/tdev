# WORKBOARD

> Sole owner of the current tdev self-development routing instance. Stable rules live in `RULE.md`, `SDD.md`, `LINEAGE.md` and `docs/development/WORKFLOW.md`; product meaning and Design status/revision semantics live in their named owners. Historical detail is preserved in Design/evidence/history records and is loaded only when a current gate needs it.

## Current routing

- Repository: `humtr/tdev`
- Active cumulative Group: Group F — Cloudflare runtime and local Agent topology
- Active cumulative branch: `group/f-cloudflare-runtime`
- Immediate completed predecessor: `group/e-context-delivery@151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`, checkpoint `cp_1786580384438_9ed881e039da`
- Checkpoint succession owner: `LINEAGE.md`

A mutable remote head is not stored here as timeless authority. Re-read the provider ref immediately before any remote-changing action and prove the expected non-force predecessor/ancestry.

## Runnable frontier

Each entry is a foreign key to one maintained Design revision, not a copied Design status. Validation resolves the referenced Design owner before the gate may run. The section may contain zero, one or many entries; parallel-runnable entries do not imply that one Task must implement them together.

- D0032@r1 — `docs/design/0032-qualification-authority-recomposition.md` — replace the overloaded MVP acceptance/evidence aggregate with one qualification owner while preserving exact history
- D0019@r2 — `docs/design/0019-casedo-authority-adapter.md` — bounded production implementation/qualification for the elected SQLite-backed CaseDO authority adapter
- D0030@r1 — `docs/design/0030-immutable-journal-publication-portability.md` — production helper/package implementation and qualification under the accepted portability contract

## Selected next action

- D0032@r1 — preserve the exact former MVP history, construct the accepted qualification owner, atomically swap current references, and run adversarial/source verification

The selected next action must be `none` or identify exactly one entry already present in the runnable frontier. Selection is scheduling/routing, not Design acceptance and not a claim that other frontier entries are blocked.

## Live carry-forward constraints

- Group E is completed and retained. D0017 production source is verified on its declared supported-Termux source scope; D0018 production source/runtime is verified on its declared supported-Termux trusted-local scope. Their detailed historical qualification belongs in their Design/evidence/history records, not this router.
- ImmutableJournal hard-link publication remains an inherited platform qualification gap on the current lineage. A check that exercises that unsupported primitive is not reported green merely because unrelated documentation tests pass.
- Validation-registry maintenance debt remains: tmcp profiles named `portable` and `full` reference package scripts absent from the current `package.json`. That drift is not evidence for D0030 and should be repaired only in its own bounded scope unless it blocks a required gate.
- Checkout alignment debt was observed during D0031: the canonical Termux checkout was clean but still on completed Group E while the registered project/default development route was Group F. The D0031 correction was verified from an isolated exact-Group-F worktree. Treat the checkout identity as `last-observed` until re-read; do not reset unrelated state merely to make pointers equal.
- No handoff, chat summary, project prompt, historical report, generated registry or tool-owned `tmcp/*` branch can override the route/frontier above. Rebind any such continuity data before dependent mutation.
- A Design referenced by the runnable frontier stops authorizing that gate immediately if its maintained owner is no longer the same revision in `accepted` or `implementing` state. In particular `reopened`, `blocked`, `superseded`, `draft` and already `verified` meanings are not runnable Class 2 implementation authorization.

## Current owner pointers

- Bootstrap: `AGENTS.md`, `RULE.md`, `SDD.md`, this file
- Documentation taxonomy/naming/history: `docs/DOCUMENTATION.md`
- Checkpoint succession: `LINEAGE.md`
- Development execution/synchronization/publication: `docs/development/WORKFLOW.md`
- Capability exits: `docs/ROADMAP.md`
- Design-sized dependency/coverage graph: `docs/development/PROGRAM.md`
- Design registry: `docs/design/README.md` (derived/supporting; Design files own their maintained revision/status)
- Qualification methods and executable source gate: `docs/QUALIFICATION.md`
- Historical development records: `docs/history/`
- Machine-readable evidence: `docs/evidence/`

## Routing stop lines

- A missing or conflicting bootstrap/current-router owner blocks only the dependent mutation until corrected under `SDD.md`.
- A selected Design action missing from the runnable frontier, or a frontier Design whose owner revision/status does not authorize implementation, blocks only that selected/dependent gate.
- Completed Group/legacy refs are provenance and are not rewritten for ordinary correction.
- A falsifier that reaches an accepted/verified Design meaning reopens the affected scope; new dependent mutation waits for corrected acceptance/supersession. Operational rollback is a separate deployment/state decision.
- Product/runtime/provider/migration semantics unresolved by current owners remain `unknown`; D0031 does not authorize guessing them.
