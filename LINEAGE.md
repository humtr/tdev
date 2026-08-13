# tdev development lineage

> Normative self-development owner for cumulative development-checkpoint succession and completed-ref preservation. `WORKBOARD.md` owns which checkpoint lane is current. This file does not define product runtime semantics.

## Governing model

Post-D0015 development is one cumulative checkpoint lineage, not independently advanced Capability Group branches later collected into an integration branch.

The planned succession is:

```text
mvp-1a-7
  -> group/e-context-delivery
  -> group/f-cloudflare-runtime
  -> group/g-mcp-security
  -> group/h-deployment-qualification
  -> <prototype fork selected at final qualification>
```

`mvp-1a-7` is the retained cumulative legacy baseline through D0015. Group names identify development checkpoints, not product semantic owners. Later checkpoints inherit accepted earlier work through ordinary Git ancestry.

The current active cumulative Group/branch, immediate completed predecessor and current next action are read from `WORKBOARD.md`, not inferred from this sequence.

## Checkpoint lifecycle

A cumulative Group branch has two phases.

### Active

The branch may receive normal non-force development while its required Designs, implementation and verification are incomplete. Temporary candidate/worktree branches may exist, but accepted work lands on the active cumulative branch before checkpoint completion.

### Completed

After the Group exit is accepted:

1. re-observe the exact final Group head on the required planes;
2. record the exact checkpoint identity and required evidence;
3. retain the completed Group ref for provenance;
4. create the successor only from that exact final head;
5. move normal development to the successor;
6. do not force-rewrite the completed ref as routine later development.

A completed checkpoint is both a durable historical label and the exact ancestry predecessor for its normal successor. It is not a permanent mutable integration destination.

## Successor rule

Before a successor is created, prove:

```text
predecessor ref
predecessor exact final head
accepted/verified exit evidence required by the current Group
successor ref selected by the program
successor created from the same exact predecessor head
```

Do not skip an accepted predecessor checkpoint by creating a later Group from an older legacy baseline. Do not create future Groups in parallel merely because their names are already known in the roadmap.

A Design number change alone never creates a branch. Cross-Group Designs execute on whichever cumulative branch `WORKBOARD.md` currently routes, and later checkpoints inherit the result through ancestry.

## Completed-ref preservation

- Do not fast-forward or merge later Group work back into a retained legacy/checkpoint ref merely to make names look synchronized.
- Do not force-update a completed checkpoint for ordinary defect correction.
- Do not squash away accepted Design, falsifier-fix, verification or provenance commits merely to shorten history.
- If a defect is discovered in inherited work, reopen/correct its contract under `SDD.md` and correct forward on the current cumulative lineage. Operational rollback, when separately required and safe, follows the deployment/runtime owner; it does not rewrite checkpoint history.
- A true divergence between replicas of the same active ref is reconciled before checkpoint election. That is replica reconciliation under `docs/development/WORKFLOW.md`, not Group aggregation.

## Prototype fork

Only after the final required cumulative Group and final qualification gates are complete may a prototype branch be created from the exact final Group head. The exact prototype ref name is selected at that gate; a planning document does not pre-authorize a concrete final ref.

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
- this file owns only the legal succession/preservation relation between cumulative development checkpoints.

Branch shape cannot redefine product semantics, and a product Design cannot silently rewrite development lineage.
