# Design 0023 - Versioned Stateless tdev MCP Surface

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@2b99f09280a06ab52a8ea04934afc3ae3d538f4e`
- Trigger: P1 source composition now reaches a validated isolated candidate, so the final-MVP MCP boundary must be made executable without creating a second Case scheduler, Agent queue or canonical writer
- Acceptance evidence: `docs/evidence/group-f-d0023-r1-stateless-mcp-surface-acceptance-2026-09-03.json`
- Scope: one versioned, stateless MCP projection/command ingress for tdev Case, drive and development-unit operations
- Affected owners: `src/`, `docs/MCP.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, the deployed MCP Worker and its generated schemas
- Preserved owners: D0019 remains the sole Case/Task/Attempt/result/Promotion authority; D0020/D0027 remain Agent delivery and local-process authorities; D0042 remains Case-to-Agent drive/re-drive; D0043 remains typed operation admission; D0024 owns MCP authentication/tenant identity; D0025 owns Git publication
- Explicit non-goals: no MCP-owned scheduler or readiness cache; no MCP-owned queue, process handle, claim lease, canonical tree writer, Git ref writer or credential store; no implicit localhost exposure; no tmcp comparison or retirement

## 1. One-line definition

Expose a strict, versioned, stateless Streamable HTTP MCP surface at `/mcp` that maps a small tool set to authoritative tdev owners, preserves exact receipts/revisions/reconciliation states, and never invents semantic success from a transport response.

## 2. Why this is Class 2

Tool names, schemas, request identity, authentication context, reconnect behavior and deployment transport determine how an external client can create or mutate a Case and reach a local Agent. A permissive wrapper would become an unreviewed scheduler or shell/credential broker. This Design fixes the public contract before source or provider implementation.

## 3. Transport and protocol

The supported external transport is HTTPS Streamable HTTP:

- endpoint path: `/mcp`;
- `POST` carries JSON-RPC MCP messages;
- `GET` is allowed only when the selected MCP transport implementation requires a resumable event stream and must remain an owner-state projection, never a command channel;
- other methods are rejected before owner access;
- the Worker is stateless between requests; durable Case/drive state is read from the accepted owners;
- the server negotiates only an explicitly supported MCP protocol-version set and rejects an unknown/future version without downgrade-by-convention;
- JSON-RPC batch, notifications and tool calls follow the selected version's exact schema; unsupported message shapes fail closed.

Every request is bounded before authentication-dependent owner dispatch. Duplicate JSON members, unsafe numbers, invalid UTF-8, sparse arrays, unknown top-level fields, oversized bodies and trailing data are rejected by the strict canonical parser. A JSON-RPC error is transport output, not a Case Event or receipt.

The public origin is HTTPS only. A Termux process is never reached by an inbound localhost URL from web ChatGPT; the local Agent uses its separately authenticated outbound D0020 connection/delivery route.

## 4. Surface identity and versioning

The surface identity is:

```text
tdev.mcp.surface.v1
```

The Worker publishes one immutable surface manifest containing:

- protocol version set and `/mcp` route;
- exact tool names, input/output schema IDs and maximum byte/page limits;
- server build/source digest and dependency identities;
- authentication profile ID from D0024;
- owner adapter profile IDs for Case, drive, operation and Artifact projections.

A changed tool name, required field, result meaning, authentication resource or owner mapping is a new surface revision. A client cannot select an executable, path, environment, network policy, Agent identity, claim, credential or provider binding through a tool argument.

## 5. Tool contract

Tool names remain stable and schemas are versioned by the surface manifest. The first surface contains:

| Tool | Kind | Required input | Owner mapping |
| --- | --- | --- | --- |
| `case_create` | mutation | `requestId`, `caseId`, compiled Plan, optional Case contract | D0019 CaseRepository create |
| `case_get` | read | `caseId` | D0019 Case snapshot projection |
| `case_events_get` | read | `caseId`, bounded `afterSequence`, `limit` | D0019 committed Event projection |
| `case_run_or_resume` | mutation | `requestId`, `caseId`, stable `driveRequestId`, exact payload, optional `expectedCaseRevision` | D0042 drive, then D0019/D0020 |
| `task_cancel` | mutation | `requestId`, `caseId`, `taskId`, reason, optional expected revision | D0019 Case command |
| `attempt_reconcile` | mutation | `requestId`, `caseId`, `attemptId`, exact reconciliation decision, optional expected revision | D0019 Case/D0020 evidence boundary |
| `claim_conflicts_get` | read | bounded claim query | ClaimLedger projection only |
| `promotion_get` | read | `caseId` | D0019 Promotion result projection |
| `development_context_get` | read | bounded repository/context selector | D0013/D0043 local Agent context owner |
| `development_unit_start` | mutation | `requestId`, `caseId`, stable `driveRequestId`, context reference, instruction and named validation profile | D0043 plan + D0042 drive + D0019 |
| `development_unit_get` | read | `caseId` | D0042/D0019 candidate projection |

`development_unit_start` accepts only an owner-issued immutable context reference and typed instruction/validation identifiers. It never accepts a shell command, executable, argv, cwd, absolute repository path, environment, network mode, secret, Agent token, claim token or caller-selected profile manifest. If the local Agent cannot provide an exact context/reference, the tool returns a bounded not-ready/reconciling result and does not create a second authority.

For every mutation:

- `requestId` is caller-generated and immutable across response loss;
- `driveRequestId` is the D0042 durable run identity where applicable;
- the exact canonical payload is hashed and compared on replay;
- `expectedCaseRevision` is optional optimistic concurrency, never a substitute for owner reread;
- authenticated principal/tenant context is supplied by D0024 outside the semantic command;
- receipt replay returns the owner-stored response, not a newly synthesized result.

Read tools may return projections of IDs, digests, revisions, bounded events, validation status and candidate metadata. They do not return secrets or unrestricted file-system/process state. A candidate tree is returned only through the owner-approved bounded development projection and remains a candidate until the existing Promotion/Git owner acts.

## 6. Result and error mapping

A successful tool call returns both human-readable `content` and machine-readable `structuredContent` when supported by the negotiated client. Structured output preserves:

- Case state including `active`, `succeeded`, `failed`, `cancelled`, `reconciling` and `unverified`;
- Case revision/event sequence and exact digest identities;
- Task/Attempt status, executor epoch/fence and claim-generation evidence where a follow-up command needs them;
- owner receipt identity and replay classification;
- bounded next-action/not-ready information without declaring readiness from a cache.

Errors map to stable surface error codes with bounded messages and no token, secret, absolute path, raw provider response or process output. An MCP transport timeout never becomes Case failure. If the owner response is ambiguous, the client receives `reconciling` and must call the same request identity or a read/reconciliation tool.

## 7. Authorization and owner separation

D0024 authenticates the external MCP caller and supplies a verified principal/tenant. The adapter authorizes that principal for the requested Case, context and Artifact before calling the owner. Possession of a request ID, fencing token, claim token, Case ID or display alias is not authentication.

Task admission remains separate: D0019 intersects Case grant and Workspace policy with the current Agent executor capabilities; D0020/D0027 verify the current connection/delivery fence; D0043 verifies the release-bound operation capability. The MCP Worker cannot bypass any of these checks.

The Worker holds no semantic ready list, retry queue, process handle, Agent capacity, canonical tree or Git ref authority. It may cache immutable manifest metadata only. Provider Durable Objects, if selected, host an already accepted owner and do not turn MCP into a new owner.

## 8. Streaming, reconnect and response loss

A stream or long-poll response is a projection cache. A reconnect supplies an event/revision cursor and then rereads the authoritative Case/drive owner. A stream acknowledgement is not a command receipt.

Response loss rules are:

1. retain the same `requestId` and exact payload;
2. reread the owner and receipt;
3. return the exact stored response when present;
4. otherwise expose `reconciling`/unknown and let D0042/D0019/D0020 decide the next action;
5. never submit a new mutation identity merely because the HTTP response disappeared.

The surface must exercise coordinator restart, client reconnect, duplicate submission, stale expected revision, stale Attempt/fence, Agent reconnect and terminal quiescence against one owner path. A client disconnect cannot release a claim, process or delivery slot.

## 9. Bounds and deployment

The surface manifest fixes finite limits for request/response bytes, tool input fields, event pages, candidate/context size, call duration and concurrent stream count. Case/Artifact/operation owners may impose tighter bounds; MCP may not widen them.

The deployable shape is one public HTTPS Worker route plus accepted owner bindings. The Worker must verify the configured MCP origin/resource before dispatch, use no ambient shell/environment credentials and avoid logging sensitive input. Local development may use a loopback harness, but loopback success is not public-client or provider evidence.

A release/rollback that changes the surface manifest, schema, owner binding or auth resource is a new compatibility generation. Existing live Cases and drives remain under the old owner until quiesced or an explicit forward migration is accepted; the Worker cannot silently reinterpret them.

## 10. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| transport | current supported MCP client completes `initialize`, `tools/list` and `tools/call` over HTTPS Streamable HTTP |
| schemas | exact generated versioned schemas reject duplicate/unknown/unsafe/oversized input |
| mutations | request identity, exact replay, stale revision and owner receipt behavior are proven |
| projections | Case/Task/Attempt/Promotion/reconciliation states and digests remain exact and bounded |
| authorization | principal/tenant A cannot read or mutate tenant B Case/context/Artifact |
| separation | no MCP queue/readiness/process/claim/canonical/Git owner appears |
| development | named context -> D0043 model/validation -> D0042 drive reaches a candidate only through existing owners |
| reconnect | client/Worker/Agent reconnect and response loss do not duplicate dispatch/effect or invent success |
| deployment | exact public HTTPS origin, bindings, version and rollback boundary are reread |
| evidence | source, provider, auth and current-client proof layers are separate |

Cheapest decisive falsifiers are a caller-supplied command/path/token reaching execution, a second dispatch after response loss, a Case result synthesized from HTTP status, a tenant-crossing projection, or a stream/Worker memory value that becomes the semantic owner.

## 11. Rejected alternatives

### Expose a general shell tool

Rejected. It defeats D0043 release-bound capability admission and makes a web client a remote command broker.

### Put a task queue in the Worker

Rejected. It duplicates D0019 readiness/lifecycle and D0042 drive semantics and cannot safely reconcile a lost response.

### Let MCP write the canonical tree or Git ref

Rejected. Promotion and D0025 are the only writers for those effects.

### Use a localhost URL in web ChatGPT

Rejected. The web client requires a public HTTPS MCP origin; local execution uses the authenticated outbound Agent route.

### Return a generic failure for reconciling/unverified

Rejected. It destroys owner truth and encourages unsafe retries.

## 12. Follow-on gates

This Design authorizes source implementation of the strict parser/adapter, generated schemas, bounded tool manifest and isolated local endpoint tests. It does not by itself claim Cloudflare deployment, Access OAuth compatibility, a supported web ChatGPT success, Termux physical execution, Git publication or D0045 comparison. D0024 must be accepted and composed before a protected public endpoint is offered to an external client.
