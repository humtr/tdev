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

## 3. Versioned v1 tool surface

D0023 accepts one exact `tdev.mcp.surface.v1` tool set:

- `case_create`;
- `case_get`;
- `case_events_get`;
- `case_run_or_resume`;
- `task_cancel`;
- `attempt_reconcile`;
- `claim_conflicts_get`;
- `promotion_get`;
- `development_context_get`;
- `development_unit_start`;
- `development_unit_get`.

Their exact order and strict input schemas are owned by D0023 and the versioned surface manifest. Source acceptance does not claim provider deployment or current-client support; incompatible additions, removals or semantic reinterpretations require a later accepted revision rather than an alias.

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

### Source composition boundary

The source realization uses `src/mcp-surface.mjs` for the versioned Streamable HTTP/JSON-RPC adapter, `src/mcp-auth.mjs` for the resource/issuer/tenant contract, `src/mcp-auth-jwt.mjs` for issuer-bound Cloudflare Access RS256/JWKS verification, and `src/mcp-development-adapter.mjs` for owner-issued context composition into D0042/D0043. These modules are adapters over the named owners, not new scheduler, queue, process, claim, canonical-tree, Git, credential or provider authorities. Source, provider, current-client, and physical-Termux qualification remain separate evidence layers; the presence of a source adapter does not itself claim a public endpoint or web ChatGPT success.

### D0046 minimum experiential route

The first supported candidate path is the isolated `https://tdev-mcp-trial.humtr.workers.dev/mcp` resource selected by D0046. The endpoint is not offered to the user until exact source, physical-Termux and provider preflight passes and provider readback matches the release manifest. Its Worker remains stateless across requests except for the separately bound D0042 `CaseAgentDriveRuntimeDO`; Case, readiness, Task/Attempt/result, Agent delivery/process and candidate truth remain with their existing owners.

The first user-visible PASS requires supported web ChatGPT to authenticate, submit one real non-documentation development unit and receive its validated isolated candidate/diff. `initialize`, `tools/list`, authentication, Worker upload or source/package success alone is not this PASS. The complete handoff includes the exact read-back URL, authentication/connection instructions, tool-set fingerprint and disable/rollback status. The only planned user actions are connection/authentication and the development objective.

No Git/publication adapter is configured for this first route. Reconnect or response loss reuses the original request/Case/drive identity and rereads the owners. Repeated ad hoc ChatGPT probing is not a compatibility method: after lower-layer preflight, record the smallest failing current-client interaction once, correct its D0023/D0024/D0046 owner, then perform one new bounded attempt.
