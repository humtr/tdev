# WORKBOARD

> Sole owner of the current tdev self-development routing instance. Stable rules live in `RULE.md`, `SDD.md`, `LINEAGE.md` and `docs/development/WORKFLOW.md`; product meaning lives in its named product owners. Historical detail is preserved in Design/evidence/history records and is loaded only when a current gate needs it.

## Current routing

- Repository: `humtr/tdev`
- Active cumulative Group: Group F — Cloudflare runtime and local Agent topology
- Active cumulative branch: `group/f-cloudflare-runtime`
- Immediate completed predecessor: `group/e-context-delivery@151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`, checkpoint `cp_1786580384438_9ed881e039da`
- Checkpoint succession owner: `LINEAGE.md`
- Current self-development Design: D0031 revision 1 — `docs/design/0031-self-development-documentation-authority.md`, `accepted`; implementation/verification in progress
- Current self-development gate: add executable documentation and session-rebind validation for the accepted D0031 authority model
- Exact next action: implement the D0031 documentation validator and adversarial stale-handoff/F-to-G/Design-revision fixtures, then run full repository gates
- Product frontier after D0031: resume the bounded D0019 production implementation/qualification gate; D0030 production implementation remains separate

A mutable remote head is not stored here as timeless authority. Re-read the provider ref immediately before any remote-changing action and prove the expected non-force predecessor/ancestry.

## Current product frontier

### D0019 — CaseDO authority adapter

- Design owner: `docs/design/0019-casedo-authority-adapter.md`
- Current Design meaning: accepted revision 2 on Group F; one durable placement generation elects one exact provider tuple and one SQLite-backed CaseDO hosts/adapts the existing D0010/CaseEngine semantic authority
- Canonical production state at the D0031 starting point: Design/model evidence accepted; production CaseDO adapter/provider qualification not yet landed on the active cumulative branch
- Initial migration boundary: existing locally authoritative Cases are not migrated; any later move requires a separately accepted exclusive-writer cutover Design
- D0020 remains the separate Agent connection/delivery/capacity/owner-loss boundary
- Next product action after D0031: bounded production implementation/qualification for durable placement election plus the elected SQLite-backed CaseDO/profile, for new Cases only until a migration Design is accepted

### D0030 — immutable-journal publication portability

- Design owner: `docs/design/0030-immutable-journal-publication-portability.md`
- Current Design meaning: accepted; the bounded fd-relative native helper is the selected qualified `RENAME_NOREPLACE` backend contract
- Production implementation/package qualification remains pending and separate from D0019
- The inherited hard-link publication path is not qualified on the connected Termux/F2FS profile; no plain-rename/copy/check-then-rename fallback is authorized

## Live carry-forward constraints

- Group E is completed and retained. D0017 production source is verified on its declared supported-Termux source scope; D0018 production source/runtime is verified on its declared supported-Termux trusted-local scope. Their detailed historical qualification belongs in their Design/evidence/history records, not this router.
- ImmutableJournal hard-link publication remains an inherited platform qualification gap on the current lineage. A check that exercises that unsupported primitive is not reported green merely because unrelated D0031 documentation tests pass.
- Validation-registry maintenance debt remains: tmcp profiles named `portable` and `full` reference package scripts absent from the current `package.json`. That drift is not evidence for D0030 or D0031 and should be repaired only in its own bounded scope unless it blocks a required gate.
- Checkout alignment debt was observed at D0031 admission: the canonical Termux checkout was clean but still on completed Group E while the registered project/default development route was Group F. The D0031 work uses an isolated exact-Group-F worktree. Treat the checkout identity as `last-observed` until re-read; do not reset unrelated state merely to make pointers equal.
- No handoff, chat summary, project prompt, historical report, generated registry or tool-owned `tmcp/*` branch can override the route above. Rebind any such continuity data before dependent mutation.

## Current owner pointers

- Bootstrap: `AGENTS.md`, `RULE.md`, `SDD.md`, this file
- Documentation taxonomy/naming/history: `docs/DOCUMENTATION.md`
- Checkpoint succession: `LINEAGE.md`
- Development execution/synchronization/publication: `docs/development/WORKFLOW.md`
- Capability exits: `docs/ROADMAP.md`
- Design-sized dependency/coverage graph: `docs/development/PROGRAM.md`
- Design registry: `docs/design/README.md` (derived/supporting; Design files own their maintained revision/status)
- Executable acceptance: `docs/MVP.md`
- Historical development records: `docs/history/`
- Machine-readable evidence: `docs/evidence/`

## Routing stop lines

- A missing or conflicting bootstrap/current-router owner blocks only the dependent mutation until corrected under `SDD.md`.
- Completed Group/legacy refs are provenance and are not rewritten for ordinary correction.
- A falsifier that reaches an accepted/verified Design meaning reopens the affected scope; new dependent mutation waits for corrected acceptance/supersession. Operational rollback is a separate deployment/state decision.
- Product/runtime/provider/migration semantics unresolved by current owners remain `unknown`; D0031 does not authorize guessing them.
