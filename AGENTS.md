# tdev repository instructions

Scope: the entire repository unless a nearer `AGENTS.md` narrows only local implementation details.

## Required reading

Before a change, read:

1. `RULE.md` and `SDD.md`;
2. `WORKBOARD.md`;
3. the active design record;
4. every affected normative owner;
5. the implementation and executable verification path.

Do not infer authority from names, conventions, generated output, or passing tests.

## Normative owners

| Contract | Owner |
| --- | --- |
| Product scope, terminology, acceptance, non-goals | `docs/SPEC.md` |
| Components, ownership, dependency direction, concurrency | `docs/ARCHITECTURE.md` |
| Work-graph records, states, claims, results, promotion | `docs/PROTOCOL.md` |
| Executor operation boundary and failure behavior | `docs/OPERATIONS.md` |
| Trust, path, secret, and effect boundaries | `docs/SECURITY.md` |
| Build, deployment, migration, rollback layers | `docs/DEPLOYMENT.md` |
| Current source slice and verification gates | `docs/MVP.md` |
| MCP projection boundary | `docs/MCP.md` |
| Integration evidence and retained boundaries | `docs/IMPLEMENTATION_REPORT.md` |
| Current pointers only | `WORKBOARD.md` |

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

## Validation

Minimum source gate:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

A source gate proves only the declared Node behavior and local adapters. It does not prove distributed/provider storage, deployment, public-client behavior, or provider rollback.
