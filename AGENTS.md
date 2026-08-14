# tdev repository instructions

Scope: the entire repository unless a nearer `AGENTS.md` narrows only local implementation details.

## Session bootstrap

`AGENTS.md` is the repository entrypoint, not a database of current branch or Design state.

Before reading the fixed kernel, bind the repository snapshot that is allowed to supply it. If the caller already supplies a trusted exact immutable `ref@sha`, validate that identity directly. Otherwise freshly enumerate published candidate refs and resolve them under D0031's authority-location contract: a candidate is eligible only when its own `WORKBOARD.md` names the intended repository and declares that exact published ref as active; exact immediate-predecessor identity and Git ancestry must agree; select exactly one maximal eligible candidate. Zero candidates, multiple maxima, or identity/ancestry conflict fails the dependent mutation closed.

The provider default branch, current checkout, branch naming, timestamps, remembered continuity, mere existence of a later ref and local-only unpublished refs are discovery inputs only. They do not elect the current route. Bind the selected exact `ref@sha`, then establish the fixed bootstrap kernel in this order:

1. read `RULE.md` from the bound snapshot;
2. read `SDD.md` from the bound snapshot;
3. read `WORKBOARD.md` from the bound snapshot, confirm its active branch matches the bound published ref, and resolve the current development route from it;
4. compare any chat summary, handoff, project prompt, Task context, cached interpretation or historical record with those current owners;
5. discard or mark stale every incompatible derived claim before dependent mutation.

If authority location cannot resolve one exact published snapshot, or a required bootstrap owner is missing, unreadable, or mutually inconsistent, stop only the dependent mutation and repair authority through `SDD.md`. Do not choose a branch, Design, migration, rollback, product meaning or completion claim by convention.

A new session reconstructs current development context from published repository state. Previous-session continuity or an aligned default/checkout may accelerate discovery but never replaces authority location plus bootstrap rebind.

## Progressive loading

After the fixed kernel, read only the owners selected by the current route and affected scope:

- documentation taxonomy, naming or authority boundaries -> `docs/DOCUMENTATION.md`;
- development execution, worktrees, synchronization, publication or plane capability -> `docs/development/WORKFLOW.md`;
- checkpoint succession, completed refs or prototype-fork questions -> `LINEAGE.md`;
- product/capability sequencing -> `docs/ROADMAP.md` and, when Design-sized execution coverage matters, `docs/development/PROGRAM.md`;
- Class 2 work -> every `Dxxxx@rN` Design record referenced by the runnable/selected gate in `WORKBOARD.md`;
- product behavior -> every affected normative product owner named by `docs/DOCUMENTATION.md`;
- verification -> `docs/QUALIFICATION.md` plus the exact evidence required by the current gate.

Historical reports, old Designs and evidence are loaded when a current owner, falsifier or provenance question requires them. They are not part of the unconditional session bootstrap.

Do not infer authority from file names, capitalization, branch location, generated output, planning labels or passing tests. Naming is a navigation signal only; declared ownership controls.

## Development route discipline

- `WORKBOARD.md` owns the current routing instance: active cumulative Group/branch, zero or more runnable `Dxxxx@rN` foreign keys, the selected next action, and live debts/barriers. Design files own their status and maintained revision meaning.
- `LINEAGE.md` owns stable checkpoint succession and completed-ref preservation. It does not own which Group is current.
- Resolve the active branch from `WORKBOARD.md`; do not carry a remembered branch from an earlier session or historical report.
- Before a remote-changing action, freshly observe the actual provider ref and verify expected predecessor/ancestry. A commit SHA is immutable identity; a mutable ref observation is location- and time-specific.
- Completed Group checkpoints and legacy refs are provenance. Do not force-rewrite them as routine development and do not return to them as the normal correction path for an inherited defect.
- Temporary `tmcp/*` or other tool-owned branches are transport/worktree bookkeeping unless current repository authority explicitly promotes one. They do not define tdev development lineage.
- When the normal local checkout is unavailable, stale or unsafe to align, preserve unrelated state, record the exact debt, and use an isolated worktree rooted at the exact current active ref when `WORKFLOW.md` permits it.
- Product Git publication (`Promotion -> Git`) and tdev self-development Git synchronization are separate authority systems.

## Change discipline

- Classify every change under `SDD.md` before implementation.
- Only an accepted or implementing Design revision authorizes Class 2 implementation.
- A failed falsifier may reopen an earlier Design/owner. Correct forward on the current cumulative lineage unless a separately authorized operational rollback is required and actually safe.
- One durable fact or contract has one authoritative origin owner, and that owner exposes exactly one current semantic value. Derived summaries, indexes and handoffs require a deterministic source or mismatch check and never silently become co-owners; historical/as-of statements must be explicitly scoped as non-current.
- Preserve unrelated files, branches, worktrees, refs, processes, credentials, historical evidence and user state.
- Keep changes in small reviewable commits. Before each commit/publication gate review the complete effective diff from the exact intended base.

## Product invariants

Unless an accepted Design and the responsible product owner change them:

- Parallel execution is the base semantics; capacity one is a normal degeneration.
- A PlanRevision is immutable.
- Readiness is derived once from the Case state owner, not duplicated in a scheduler cache.
- One Task has at most one nonterminal Attempt.
- Sibling Tasks may run concurrently when dependencies and claims permit.
- Ordinary Tasks produce isolated results and never mutate the canonical tree.
- Promotion is the only canonical tree writer.
- Accepted result order and executor capacity do not change the promoted tree.
- Wall-clock time is not part of state-transition meaning or digests.
- Unknown external effects, migrations, credentials and rollback capability remain explicit unknowns.

## Validation

Use `docs/QUALIFICATION.md` as the stable owner for the baseline source gate, verification methods and proof-layer boundaries, plus the exact evidence required by the affected gate. Do not duplicate its command list here.

A source gate proves only its declared source/adaptor layer. Provider, deployment, public-client, migration and rollback claims require their own evidence.
