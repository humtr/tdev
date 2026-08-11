# tdev repository instructions

Scope: the entire repository unless a nearer `AGENTS.md` narrows only local implementation details.

## Required reading

Before a change, read in this order:

1. `RULE.md` and `SDD.md`;
2. `docs/DOCUMENTATION.md`, `docs/development/WORKFLOW.md`, `docs/development/ACCESS.md`, and `docs/development/BRANCH_LINEAGE.md`;
3. `WORKBOARD.md`, `docs/ROADMAP.md`, and `docs/development/PROGRAM.md`;
4. the current Capability Group execution document when work is on a `group/*` lane (currently `docs/development/GROUP_E_CONTEXT_DELIVERY.md`);
5. the active Design record, if any;
6. every affected normative product owner;
7. the implementation and executable verification path.

Do not infer authority from names, conventions, generated output, branch location, planning labels, or passing tests.

## Development branch discipline

- `mvp-1a-7@83e9610d79b4ad70858e4dd7fe3625052336a92c` is the retained cumulative legacy baseline through D0015 and the exact predecessor from which Group E began. It is **not** the destination for post-D0015 Group integration.
- Post-D0015 Capability Group development follows the cumulative checkpoint lineage owned by `docs/development/BRANCH_LINEAGE.md`.
- The current mutable cumulative branch is `group/e-context-delivery`. When Group E is complete, retain its exact final head as the Group E checkpoint and create Group F from that exact head.
- Continue linearly: final E -> `group/f-cloudflare-runtime`; final F -> `group/g-mcp-security`; final G -> `group/h-deployment-qualification`; final H -> a separately named MVP prototype branch selected at the final qualification gate.
- Do **not** create E/F/G/H as independent branches from `mvp-1a-7` and later merge them together. Do **not** merge completed Groups back into `mvp-1a-7` as normal progression.
- `group/*` names are cumulative Capability Group checkpoints, not product semantic owners. A later Group inherits all accepted earlier Group work through ordinary Git ancestry.
- A Design number change alone does not create a new branch. Group branch creation is tied to a completed predecessor Group checkpoint, not to every Design or verification milestone.
- Completed Group checkpoint refs are retained for provenance and should not be force-rewritten as routine development. Temporary candidate branches may exist within the active Group, but accepted work lands on the active cumulative Group branch before Group completion.
- Previously superseded or legacy `mvp-*` refs are reference/checkpoint history and are not modified merely to mirror later Group progress. Tool-owned `tmcp/*` worktree branches are transport bookkeeping and do not define development lineage.
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
| Self-development work planes and synchronization workflow | `docs/development/WORKFLOW.md` |
| Current-session access versus development-plane health | `docs/development/ACCESS.md` |
| Post-D0015 cumulative Group checkpoint lineage | `docs/development/BRANCH_LINEAGE.md` |
| Exhaustive provisional Design execution/coverage register | `docs/development/PROGRAM.md` |
| Current Group E execution and exit contract | `docs/development/GROUP_E_CONTEXT_DELIVERY.md` |
| MCP projection boundary | `docs/MCP.md` |
| Integration evidence and retained boundaries | `docs/IMPLEMENTATION_REPORT.md` |
| Current pointers / historical verified-state summary | `WORKBOARD.md` |

Product contracts describe tdev. Development documents describe how tdev itself is changed. Evidence documents describe what has actually been proved. A development document may plan a product change but cannot silently redefine the product contract; evidence cannot become authority merely because it passed.

For post-D0015 branch progression, `docs/development/BRANCH_LINEAGE.md` supersedes older wording in `WORKBOARD.md`, `LINEAGE.md`, or other pre-checkpoint documents that describes `mvp-1a-7` as a continuously fast-forwarded integration destination.

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
