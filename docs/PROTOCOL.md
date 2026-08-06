# work-graph protocol

## PlanRevision

A PlanRevision contains:

- `revisionId`
- `baseTree`
- derived `baseDigest`
- exactly one `promotion` Task
- zero or more `work` Tasks

The promotion Task depends on every work Task. The plan is validated as a DAG and deep-frozen before Case creation.

## Task

A Task contains `id`, `kind`, `dependencies`, `claims`, and immutable `input`.

Task states:

```text
pending -> running -> succeeded
                  -> failed
                  -> cancelled
```

Readiness is not a stored state. A pending Task is ready when all dependencies succeeded.

## Attempt

An Attempt contains `id`, `taskId`, `ordinal`, `executorId`, and state. Attempt IDs are fencing tokens for result acceptance.

Attempt states:

```text
running -> succeeded | failed | cancelled | interrupted
```

A Task has at most one `running` Attempt. An interrupted result-only Task may return to `pending` after snapshot reopen while the interrupted Attempt remains immutable evidence.

## Resource claims

A claim is `{ mode, resource }` where mode is `read`, `write`, or `execute`.

- overlapping `read/read`: compatible
- disjoint resources: compatible
- any overlapping pair containing `write` or `execute`: incompatible
- wildcard suffix `/**` owns that resource subtree

Ordinary work Tasks may not claim `canonical:*` or `remote:*`. The sole Promotion Task must claim `write canonical:tree`.

## Isolated ChangeSet

A work result is:

```json
{
  "kind": "changeset",
  "baseDigest": "sha256:...",
  "writes": [{ "path": "relative/path", "content": "text or null" }]
}
```

Paths are normalized relative paths; absolute and traversal paths are rejected. `null` deletes a path. A ChangeSet cannot mutate engine state directly.

## Promotion result

Promotion validates every base digest, sorts by Task ID and path, detects conflicting writes, applies the accepted set to a copy of the base tree, and returns a canonical tree digest. Identical duplicate writes are coalesced. A conflict is reported in stable order and leaves the canonical tree unchanged.

## Events and revisions

Events have a monotonic sequence assigned by state transition. No timestamp participates in readiness, acceptance, conflict ordering, or digest computation.
