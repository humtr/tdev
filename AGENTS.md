# tdev repository instructions

Scope: the entire repository unless a nearer `AGENTS.md` narrows only local implementation details.

## Required reading

Before a change, read in this order:

1. `RULE.md` and `SDD.md`;
2. `docs/DOCUMENTATION.md`, `docs/development/WORKFLOW.md`, and `docs/development/ACCESS.md`;
3. `WORKBOARD.md`, `docs/ROADMAP.md`, and `docs/development/PROGRAM.md`;
4. the current Capability Group execution document when work is on a `group/*` lane (currently `docs/development/GROUP_E_CONTEXT_DELIVERY.md`);
5. the active Design record, if any;
6. every affected normative product owner;
7. the implementation and executable verification path.

Do not infer authority from names, conventions, generated output, branch location, planning labels, or passing tests.

## Development branch discipline

- The active `mvp-*` ref named by `WORKBOARD.md` / `LINEAGE.md` is the **integrated development-direction branch**, not a design, release, verification checkpoint, or product authority.
- A Design number change, `accepted`/`verified` transition, milestone completion, or ordinary source revision does **not** by itself authorize a new `mvp-*` branch.
- Create a new `mvp-*` development branch only after an explicit user/owner decision that the development direction itself changes; record the divergence and retained predecessor in `LINEAGE.md` before or with that publication.
- `group/*` branches are subordinate Capability Group work-integration lanes. They may contain multiple Design, implementation, evidence, and review commits without changing the `mvp-*` development identity.
- Create a Group branch from an exact observed integration commit and record the base in the matching `docs/development/GROUP_*.md` file. A Group branch is not product authority and is not automatically integrated merely because its tests pass.
- Final integration returns validated Group history to the active `mvp-*` direction through a non-force ancestry-preserving path. Prefer fast-forward when only one lane advanced; prefer an explicit merge when parallel validated Group histories must both be retained. Do not squash verified Design/evidence provenance by default.
- Previously superseded `mvp-*` direction branches are reference-only and are not modified. Tool-owned `tmcp/*` worktree branches are transport bookkeeping and do not define development direction.
- Development replicas do not have to be perfectly synchronized at every instant. Follow `docs/development/WORKFLOW.md`: synchronize when possible, continue on an available plane when safe, record exact sync debt, and reconcile later. Never guess the state of an unavailable plane.
- Plane health and current-session access are separate observations. Follow `docs/development/ACCESS.md`; absence of a tmcp/local tool in the current agent session does not prove Termux or the route is unhealthy, and a user-reported healthy route does not by itself update the last observed local Git identity.

## Normative owners

| Contract | Owner |
| --- | --- |
| Documentation taxonomy and authority layers | `docs/DOCUMENTATION.md` |
| Product scope, terminology, acceptance, non-goals | `docs/SPEC.md` |
| Components, ownership, dependency direction, concurrency | `docs/ARCHITECTURE.md` |
| Work-graph records, states, claims, results, promotion | `docs/PROTOCOL.md` |
| Executor operation boundary and failure behavior | `docs/OPERATIONS.md` |
| Trust, path, secret, and effect boundaries | `docs/SECURITY.md` |
| Build, deployment, migration, rollback layers | `docs/DEPLOYMENT.md` |
| Current source slice and verification gates | `docs/MVP.md` |
| Final-MVP capability program, sequencing, and exit criteria | `docs/ROADMAP.md` |
| Self-development work planes, synchronization, branch/integration workflow | `docs/development/WORKFLOW.md` |
| Current-session access versus development-plane health | `docs/development/ACCESS.md` |
| Exhaustive provisional Design execution/coverage register | `docs/development/PROGRAM.md` |
| Current Group E execution and exit contract | `docs/development/GROUP_E_CONTEXT_DELIVERY.md` |
| MCP projection boundary | `docs/MCP.md` |
| Integration evidence and retained boundaries | `docs/IMPLEMENTATION_REPORT.md` |
| Current pointers only | `WORKBOARD.md` |

Product contracts describe tdev. Development documents describe how tdev itself is changed. Evidence documents describe what has actually been proved. A development document may plan a product change but cannot silently redefine the product contract; evidence cannot become authority merely because it passed.

## Repository invariants

- Parallel execution is the base semantics; capacity one is a normal degeneration.
- A PlanRevision is immutable.
- Readiness is derived once from the Case state owner, not duplicated in a scheduler cache.
- One Task has at most one nonterminal Attempt.
- Sibling Tasks may run concurrently when dependencies and claims permit.
- Ordinary Tasks produce isolated results and never mutate the canonical tree.
- Promotion is the only canonical tree writer.
- Accepted result order and executor capacity do not change the promoted tree.
- Wall-clock time is not part of state-transition meaning or digests.
- Unknown external effects, migrations, credentials, and rollback capability remain explicit unknowns.
- Product Git publication (`Promotion -> Git`) and tdev self-development Git synchronization are separate authority systems.
- A Git commit SHA is immutable identity; any statement about a current head must also name the observed ref/location when that distinction matters.

## Validation

Minimum source gate:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

A source gate proves only the declared Node behavior and local adapters. It does not prove distributed/provider storage, deployment, public-client behavior, or provider rollback.