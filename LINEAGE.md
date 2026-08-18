# tdev development lineage

> Normative self-development owner for Group-checkpoint succession and provenance preservation. `WORKBOARD.md` owns which Group and development route are current. This file does not define product runtime semantics.

## Governing model

Post-D0015 development is one cumulative checkpoint lineage, not independently advanced Capability Group branches later collected into an integration branch. Before D0036, that lineage used a persistent branch per cumulative Group checkpoint; the surviving pre-D0036 succession is historical provenance:

```text
concept-1a-7
  -> group/e-context-delivery
  -> group/f-cloudflare-runtime
```

D0036 revision 1 replaces the future branch-per-checkpoint topology with one persistent `development` route. During its bridge, `group/f-cloudflare-runtime` remains published as the exact legacy predecessor while old and persistent authority resolvers are required to agree on one `development@sha`. After that bridge is proved, later Group checkpoint transitions remain on `development` unless a separately accepted Design changes the route model.

`concept-1a-7` remains conception provenance and is excluded from authority-location candidates. Group names identify capability/checkpoint facts, not Git-route or product-semantic owners. A completed Group is represented by an exact commit identity plus its Design/evidence/history records; a durable extra ref is retained only when a bounded live consumer or recovery requirement justifies it.

The active Group, active route and current next action are read from `WORKBOARD.md`, not inferred from this lineage narrative.

## Checkpoint lifecycle

A Group checkpoint has two phases independent of the persistent branch name.

### Active

The current `development` route may receive normal non-force development while the Group's required Designs, implementation and verification are incomplete. Temporary candidate/worktree branches may exist, but accepted work lands on the current route before checkpoint completion.

### Completed

After a Group exit is accepted:

1. re-observe the exact `development` head on the required planes;
2. record that exact commit as the Group checkpoint with the required Design/evidence identities;
3. prove required source/provider/target gates and unresolved boundaries;
4. keep normal development on `development` and update only the Group field in `WORKBOARD.md` for the successor checkpoint;
5. create a separate durable anchor only when a named live consumer or recovery requirement requires one;
6. never force-rewrite shared checkpoint history merely to shorten or reshape provenance.

A completed checkpoint is a durable evidenced commit identity, not a permanent mutable integration destination and not automatically a permanent branch.

## Successor rule

Before moving the active Group forward on `development`, prove:

```text
current development ref
exact final checkpoint commit
accepted/verified exit evidence required by the current Group
successor Group selected by current planning/routing owners
successor WORKBOARD update descends from the same exact checkpoint commit
```

Do not skip an accepted predecessor checkpoint by starting a later Group from an older baseline. Do not create future Group refs merely because Group names are known in the roadmap. A Design or Group number change alone never creates a branch; later checkpoints inherit accepted earlier work through ordinary ancestry on the same persistent route.

## Completed-ref preservation

- Do not fast-forward or merge later work back into a legacy/checkpoint ref merely to make names look synchronized.
- Do not force-update a historical checkpoint for ordinary defect correction.
- Do not squash away accepted Design, falsifier-fix, verification or provenance commits merely to shorten history.
- D0036 may retire a legacy/checkpoint ref only after its per-ref material/consumer/exact-object/reachability barrier is proved and provider state is reread. An unresolved required consumer retains that ref as explicit migration debt.
- Do not wholesale-merge divergent legacy history merely to keep its commits reachable; port still-valid executable meaning or archive useful evidence/rationale forward with exact source identity.
- If a defect is discovered in inherited work, reopen/correct its contract under `SDD.md` and correct forward on `development`. Operational rollback, when separately required and safe, follows the deployment/runtime owner; it does not rewrite checkpoint history.
- A true divergence between replicas of the same active `development` ref is reconciled before checkpoint election. That is replica reconciliation under `docs/development/WORKFLOW.md`, not Group aggregation.

## Prototype fork

A future prototype fork is not pre-authorized by this lineage. D0036 keeps the persistent self-development route on `development`; any later prototype/ref topology change requires the then-current accepted owner and exact final checkpoint evidence.

## Current routing versus history

`WORKBOARD.md` is the only owner of the current routing instance. This file may define the valid succession graph and preservation law, but it must not declare a particular Group current.

Mutable external facts such as a remote branch head are observed at the operation gate that needs them. A recorded SHA without its ref/location/observation meaning is not a current-head claim.

The pre-D0031 accumulated development narrative is preserved at `docs/history/development-lineage.md`. It contains historically accurate former-current statements and rationale, including pre-Group naming decisions. It is history, not an alternate route owner.

Exact historical evidence may still mention the former path `docs/development/BRANCH_LINEAGE.md`; those strings are provenance and need not be rewritten to make the evidence look current.

## Relationship to product and program authority

- `docs/SPEC.md` and the named product owners define what tdev must mean and do.
- `docs/ROADMAP.md` owns capability decomposition and Group exit intent.
- `docs/development/PROGRAM.md` owns Design-sized dependency/coverage planning.
- `WORKBOARD.md` selects the current executable frontier and active cumulative lane.
- this file owns only the legal succession/provenance relation between Group checkpoints on the current development route.

Branch shape cannot redefine product semantics, and a product Design cannot silently rewrite development lineage.
