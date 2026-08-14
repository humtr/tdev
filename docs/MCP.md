# MCP projection boundary

> Normative owner for the MCP role. A secured deployed MCP command/projection surface and current-client qualification are **required for the final MVP**. Mutable implementation and current-client qualification status belongs to `WORKBOARD.md`, `PROGRAM.md`, the maintained Design and exact evidence, not this stable product owner.

## 1. Role

MCP is a stateless projection and command-ingress layer over authoritative owners. It may:

- validate and project Plan/Case/Task/Attempt/result schemas;
- query Case snapshots and bounded event views;
- submit receipt-backed commands to the Case owner;
- upload/fetch Artifact references through a separate byte owner;
- surface reconciliation work to an authorized operator;
- report claim conflicts without owning the leases.

It must not own readiness, Task lifecycle, executor delivery truth, target claims, or canonical-tree mutation.

## 2. Required command semantics

Every state-changing MCP operation must map to a stable command envelope with:

- caller-generated `requestId`;
- exact command payload;
- optional `expectedCaseRevision`;
- authenticated principal and authorization context outside the canonical command where appropriate.

Response loss is handled by replaying the same request ID and payload. MCP must return the stored response receipt rather than synthesizing a new lifecycle decision.

## 3. Candidate final-MVP tool surface

A later accepted MCP Design may expose tools equivalent to:

- `case_create`;
- `case_get`;
- `case_events_get`;
- `task_cancel`;
- `attempt_reconcile`;
- `case_run_or_resume`;
- `claim_conflicts_get`;
- `artifact_get`;
- `promotion_get`.

Names and schemas are not accepted public contracts yet. They require a separate design, generated schemas, negative fixtures, versioning, and current-client evidence.

## 4. Projection rules

- Project canonical IDs/digests exactly; do not replace them with display-only aliases.
- Preserve `reconciling` and `unverified`; do not collapse them into generic failure.
- Preserve executor epoch, fencing token identity, and claim generation where the caller needs to submit a result/reconciliation command.
- Do not expose secrets in Task input, evidence, or receipts by default.
- Bound pagination, event count, payload size, and Artifact metadata.
- Treat snapshot `caseRevision` as the optimistic-concurrency version.
- Keep wall-clock observations separate from deterministic semantic Events.

## 5. Authorization

MCP authentication/tenant authorization is not the same as Task capability admission. A future endpoint must enforce both:

1. whether the caller may view or mutate the Case;
2. whether the Task can be admitted under Case grant, Workspace policy, and executor capabilities.

Possession of a `requestId`, fencing token, or claim token is not sufficient authentication.

## 6. Streaming and reconnect

A streaming transport may project Event/revision changes, but streams are caches of owner state. After reconnect, the client must resume from a revision/event sequence and re-read authoritative state. A stream acknowledgement is not a command receipt or effect receipt.

## 7. Qualification gate

MCP completion requires all of:

- accepted versioned JSON schemas;
- strict duplicate-member-safe request parsing;
- idempotent mutation replay tests;
- stale revision and stale fencing negative tests;
- authentication and tenant-isolation tests;
- payload/pagination limits;
- reconnect/resume tests;
- at least one currently supported MCP client exercised against the deployed endpoint;
- explicit migration and rollback plan.

Until then, MCP remains a documented but **final-MVP-open** boundary. Source completion must not be confused with MCP/product completion.
