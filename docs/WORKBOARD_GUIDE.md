# tdev WORKBOARD Guide

> `WORKBOARD.md` is the repository's concise current-state router. It is not a product specification, design record, evidence archive, task database, or changelog.

## 1. What the workboard may own

Only current routing facts:

- current product milestone or source stage;
- current verified source gate;
- active or blocked design-record IDs;
- next design/implementation gate;
- concise blocking unknowns;
- pointers to normative owners and the design registry.

## 2. What it must not own

Do not copy into the workboard:

- product scope or terminology;
- architecture or durable ownership;
- schema, state machine, Operation, security, deployment, or release contracts;
- detailed requirements, acceptance criteria, verification commands, or evidence;
- historical task logs;
- speculative future work;
- branch-local implementation details that will be stale after merge.

Those facts stay in `docs/SPEC.md`, subsystem owners, `docs/MVP.md`, and `docs/design/`.

## 3. Update order

1. update the correct normative owner or accepted design;
2. implement and verify the change;
3. update the design record status and evidence;
4. update `WORKBOARD.md` pointers and next gate.

Never make the workboard the first or only place where a contract changes.

## 4. Current-stage vocabulary

Use repository milestones from `docs/MVP.md` when applicable:

```text
not started
designing
implementing
source verified
reference-host verified
live verified
release qualified
blocked
```

Name the layer. For example, `M0 source verified` does not mean installation or release qualified.

## 5. Active work

List only accepted/implementing/blocked design records that affect the current repository direction. Each entry contains:

- design ID and link;
- short status;
- affected milestone or owner;
- next gate.

Do not embed the design's scope, decisions, or acceptance.

## 6. Parallel workstreams

List parallel work only when owner and path boundaries do not overlap or when the design explicitly defines coordination. Two workstreams must not independently edit the same canonical owner, schema, migration sequence, or release identity.

## 7. Blocking unknowns

Include only unknowns that block the next named gate. Point to the design section that owns details. Remove an unknown only after the authoritative owner and evidence are updated.

## 8. Review checklist

A valid workboard is:

- short enough to scan before a change;
- composed primarily of links and status;
- consistent with design-record statuses;
- honest about verification layers;
- free of copied contracts and stale branch/task data;
- updated after, not before, the source owners.

Use `docs/WORKBOARD_TEMPLATE.md` only as a shape reference. The actual root `WORKBOARD.md` is the current repository state.
