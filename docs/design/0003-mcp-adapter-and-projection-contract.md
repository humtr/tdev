# Design 0003 — MCP Adapter and Projection Contract

## Metadata

- Status: `verified`
- Date: 2026-08-04
- Acceptance authority: direct maintainer request to align tdev with the new MCP standard while preserving the previously accepted twelve-capability product surface
- Base source: `771bbe921b424a0e8f7794c3c838eef0276352cb`
- Owners affected: `docs/SPEC.md`, new `docs/MCP.md`, `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `AGENTS.md`
- Implementation paths: normative documentation and governance validation only

## One-line definition

tdev preserves twelve canonical semantic control/query capabilities while exposing them through one release-pinned tools baseline and optional additive MCP projections that activate only when both the tdev server and the actual client declare and demonstrate support.

## Source classification

### Authority

- `docs/SPEC.md` owns the first-release product outcomes.
- `docs/PROTOCOL.md` owns the canonical tdev Case, Task, Attempt, control, query, and result semantics.
- `docs/ARCHITECTURE.md` makes the public Worker stateless and keeps CaseDO as the canonical Task owner.
- `docs/DEPLOYMENT.md` separates public MCP and current client-visible schema verification.
- `SDD.md` requires a Class 2 design for a public MCP surface or compatibility change.

### External evidence

Observed from official sources on 2026-08-04:

- MCP `2025-11-25` remains the current stable specification, while the `2026-07-28` line is published as a release candidate with a stateless direction.
- The 2026 Tasks design is an extension identified as `io.modelcontextprotocol/tasks`; the client and server both declare support, and the server alone decides per request whether to return a task handle.
- MCP Tasks require durable creation before the handle is returned and use `tasks/get`, `tasks/update`, and `tasks/cancel` without creating a second tdev lifecycle owner.
- ChatGPT custom MCP apps are configured by scanning tools. OpenAI documents a frozen snapshot of approved tools and inputs, with admin review or republication required for later changes. The reviewed OpenAI documentation does not establish current ChatGPT support for the 2026 release candidate, `server/discover`, MCP Resources as the application control surface, the Tasks extension, or elicitation.

Official references:

- https://modelcontextprotocol.io/specification/2025-11-25
- https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- https://modelcontextprotocol.io/extensions/tasks/overview
- https://modelcontextprotocol.io/seps/2663-tasks-extension
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

### Inference

- The twelve accepted tdev capabilities are product semantics, not necessarily twelve permanent MCP wire tools.
- Replacing the twelve-tool baseline before observing ChatGPT Resources or Tasks support could make the first release unusable.
- Additive capability-gated projections are progressive enhancement, not legacy protocol compatibility.

### Unknown

- Which exact MCP revision ChatGPT will send when tdev reaches the public client gate.
- Whether ChatGPT will declare Resources, Tasks, elicitation, or 2026 stateless discovery capabilities.
- How ChatGPT presents Resource links and Task input requests in the released client.
- Whether a reduced tool set produces better planning behavior than the tools baseline after equivalent functionality is proven.

These unknowns block deleting baseline tools or claiming an enhanced projection as supported. They do not block defining the adapter contract.

## Current contract

The repository currently calls the following entries fixed public MCP tools:

```text
list_operations
list_resources
submit_operation
get_case
get_task
control_case
finish_case
cancel_case
control_task
cancel_task
render_task
read_artifact
```

This contract correctly separates Case and Task control from Agent Operations, but it conflates two layers:

1. twelve canonical tdev semantic capabilities;
2. the MCP methods, tools, resources, and extensions used to project those capabilities to a client.

The repository does not yet own an explicit MCP adapter, projection-manifest, extension-negotiation, or current-client profile contract.

## Problem and evidence

A prior review proposed reducing the public tool list by mapping discovery and reads to MCP Resources and Task controls to the Tasks extension. That proposal conflicted with the accepted twelve-tool baseline and assumed client support that has not been observed.

The opposite extreme—declaring all twelve entries permanent MCP tools—would make a tdev semantic inventory dictate the wire shape forever and would fail to use standard MCP primitives when they become available.

The missing abstraction is a deterministic projection from one semantic capability catalog to an exact release-pinned MCP surface.

## Scope

This design may:

- add `docs/MCP.md` as the owner of the public MCP adapter and projection contract;
- relabel the twelve entries as canonical semantic capabilities;
- retain all twelve as the first-release tools baseline;
- define optional additive Resources, Tasks, and elicitation projections;
- define extension declaration ownership and fallback behavior;
- define release and current-client evidence needed before changing the projection;
- update routing, milestones, deployment metadata, and governance checks accordingly.

## Non-goals

This design does not:

- implement a Worker, MCP transport, CaseDO, AgentDO, Resources, Tasks, elicitation, or an OpenAI app;
- claim that ChatGPT supports any reviewed RC or extension feature;
- select the final public MCP revision before official final publication and current-client observation;
- delete, rename, or combine a canonical tdev semantic capability;
- create a separate MCP Task table or lifecycle;
- add compatibility for an undeployed tdev MCP wire protocol;
- change stored Case, Task, Attempt, Event, or Artifact schemas;
- change authentication, Cloudflare resources, installation, routing, or runtime state.

## Invariants

1. The twelve semantic capabilities remain available to a supported first-release client.
2. `CaseDO` remains the sole canonical owner of tdev Task state.
3. An MCP Task is only a projection of an existing tdev Task.
4. Client capability metadata never grants product authority.
5. The tools list and schemas are deterministic for one projection digest.
6. Unsupported optional features degrade to the tools baseline or a typed missing-capability error; they never disappear silently.
7. A user prompt cannot force the ChatGPT host to advertise an unsupported extension.
8. Tool reduction requires an accepted future design, a new projection identity, client refresh/republication analysis, and equivalent behavioral evidence.
9. Public MCP compatibility and internal stored-state migration remain separate contracts.
10. `read_artifact` retains a bounded range-capable path until an equivalent authorized standard projection is proven.

## Owner impact

- `docs/MCP.md` becomes the sole owner of MCP revision selection, standard method mapping, projection manifests, tool/resource/extension projection, client capability use, and current-client compatibility.
- `docs/PROTOCOL.md` continues to own the twelve semantic capabilities and all canonical tdev inputs, results, states, transitions, errors, and evidence.
- `docs/SPEC.md` owns the product requirement that all capabilities remain accessible and that optional projections do not change semantics.
- `docs/ARCHITECTURE.md` owns the stateless adapter boundary and the prohibition on a second state owner.
- `docs/SECURITY.md` owns trust and authorization rules for capability metadata, Resource URIs, and elicitation.
- `docs/DEPLOYMENT.md` owns release-pinned projection metadata, client snapshot refresh, and rollout.
- `docs/MVP.md` owns client feature probes and release qualification.

## Design

### 1. Canonical semantic catalog

The twelve names remain stable tdev capability identifiers. Their schemas and transitions are owned by `docs/PROTOCOL.md` whether the wire projection uses a Tool, Resource, or extension method.

### 2. First-release tools baseline

Projection profile `tools-v1` exposes all twelve capabilities as deterministic MCP tools. This is the first-release baseline unless a later accepted design changes it after client evidence.

The baseline is not an old-protocol compatibility mode. It is the complete minimum projection for clients whose verified integration surface is tool scanning and tool calling.

### 3. Additive features

A release may advertise implemented additive features without removing baseline tools:

```text
resources-v1
  Operation catalog, locator, Case, Task, Attempt, checkpoint, evidence,
  Artifact metadata, and presentation Resources

tasks-v1
  MCP Task handle, get, update, and cancel projection over one tdev Task

elicitation-v1
  non-secret typed input and approval presentation when the client declares support
```

Each feature is activated only when:

- the release manifest declares the implementation;
- the tdev server advertises the feature or extension;
- the current request carries the corresponding client capability where required;
- current-client verification demonstrates the expected behavior.

The server declaration is controlled by tdev. The client declaration is controlled by the ChatGPT host or other MCP client. A user or prompt cannot manufacture client support.

### 4. Projection manifest

Each release binds one immutable projection manifest:

```ts
type McpProjectionManifest = {
  schemaVersion: 1;
  protocolRevision: string;
  semanticCapabilityVersion: 1;
  baseProfile: "tools-v1";
  additiveFeatures: ("resources-v1" | "tasks-v1" | "elicitation-v1")[];
  toolSetDigest: Sha256;
  resourceSetDigest?: Sha256;
  extensionSetDigest: Sha256;
  projectionDigest: Sha256;
};
```

The MCP tool list and input/output schemas do not vary by connection, user prompt, or transient server state within one projection digest. Availability belongs in typed results and catalogs, not in tool-definition churn.

### 5. Resource projection

Resource URIs are opaque handles, not bearer capabilities. Every read rechecks authentication and authorization.

Reserved URI families include:

```text
tdev://operations
tdev://operations/{operationId}/{version}
tdev://agents/{agentId}
tdev://workspaces/{workspaceId}
tdev://projects/{projectId}
tdev://cases/{caseId}
tdev://tasks/{taskId}
tdev://attempts/{attemptId}
tdev://checkpoints/{checkpointId}
tdev://evidence/{evidenceSetId}
tdev://artifacts/{artifactId}
```

Resources are read-only projections and cannot authorize an effect or own lifecycle truth. Large Artifact byte ranges continue through `read_artifact` or a separately accepted authenticated range design.

### 6. Task projection

When both sides declare `io.modelcontextprotocol/tasks`, the server may return an MCP Task handle for a long-running `submit_operation` call.

- The handle resolves to the same canonical tdev `TaskRecord`.
- No MCP-only Task table or status writer is introduced.
- `tasks/get` projects the current tdev Task status and result.
- `tasks/update` maps only to outstanding typed input, approval, or retry-decision records.
- `tasks/cancel` records the existing cooperative cancellation intent.
- Domain outcomes such as `denied` and `unverified` remain available in typed extension data even when projected to a coarser MCP terminal status.

### 7. Elicitation

Form elicitation may carry non-secret typed decisions and input. Secrets, credentials, private keys, bearer tokens, and authorization codes never enter form elicitation or Case state. A future URL elicitation path requires a separate accepted security and callback-correlation design.

When elicitation is unsupported, `control_task` remains the canonical tools-baseline path.

### 8. Results and errors

Tool results use:

- `structuredContent` for canonical bounded machine data;
- a short text summary for model and user readability;
- authorized Resource links when the client supports them;
- `outputSchema` derived from the canonical tdev result schema.

Transport and JSON-RPC failures remain distinct from admission errors, tool execution errors, and durable Task terminal outcomes. Projection cannot collapse `unverified` into ordinary failure without preserving typed uncertainty.

### 9. Client observation

Client name, version, protocol revision, and capability digest are observations, not authentication. They may be recorded in bounded audit metadata but never widen a Case grant or Workspace policy.

### 10. Tool annotations

Tool annotations are generated from canonical Operation effects and retry/approval policy. They guide clients but do not authorize effects. Manually maintained annotation duplicates are prohibited.

## Security and secret impact

This change adds no credential and persists no runtime state.

The normative contract requires:

- authentication and authorization on every Resource read and Task method;
- non-enumeration of unauthorized handles;
- separation of client capability metadata from authenticated principal;
- no secret form elicitation;
- no credential or local absolute path in Resource URIs;
- bounded content, pagination, and Artifact reads;
- no prompt-controlled extension activation.

## Compatibility, migration, and rollback

### MCP wire compatibility

No historical tdev MCP endpoint has been released, so no old tdev wire version or session requires migration. The first public release supports one exact final protocol revision and one exact projection manifest.

### Stored state

Stored CaseDO, AgentDO, D1, and Artifact metadata migrations remain required independently. This design neither defines nor removes them.

### Client snapshot compatibility

Changing a tool name, required input, output schema, or annotation can conflict with the ChatGPT frozen action snapshot. A breaking projection change requires a new projection identity and explicit refresh or republication evidence.

### Rollback

Documentation rollback is a Git revert before runtime implementation. A later runtime rollback may use only a predecessor whose projection and stored schemas are declared compatible.

## Vertical slices

1. Create the MCP owner and revise the semantic/projection terminology.
2. Add deterministic governance checks for the twelve-capability catalog and projection owner.
3. Before Worker implementation, pin a final MCP revision and implement `tools-v1` without optional features.
4. Verify the exact ChatGPT-visible tools and schemas.
5. Implement one additive feature at a time only after the client capability is observed, retaining baseline semantics.
6. Consider tool reduction only in a later design after equivalent behavior, planning quality, refresh, and rollback are verified.

## Acceptance criteria

1. The repository has one explicit MCP adapter/projection owner.
2. The twelve canonical semantic capabilities remain listed exactly once and retain their current meaning.
3. The first-release `tools-v1` baseline exposes all twelve capabilities.
4. Resources, Tasks, and elicitation are documented as additive, capability-gated, and unverified in ChatGPT until observed.
5. Extension declaration ownership is explicit for tdev server, client host, and user prompt.
6. MCP Tasks cannot create a second durable Task owner.
7. Release metadata binds an exact protocol revision and projection digest.
8. Tool-definition change and ChatGPT snapshot refresh requirements are recorded.
9. Governance rejects a missing, duplicated, or renamed semantic capability and a missing MCP owner.
10. Documentation, governance, M0 tests, generated-source checks, and static checks pass without adding test files.
11. The reviewed commit is published by exact fast-forward to `concept`.
12. No runtime, deployment, client, Agent, or stored state is changed or claimed verified.

## Verification matrix

| Claim | Verification | Authoritative reader | Layer |
| --- | --- | --- | --- |
| owner and links | `npm run check:governance` | repository files | contract/schema |
| twelve capabilities | governance capability-set check | `docs/MCP.md` and checker | contract/schema |
| unchanged M0 | `npm test`, `go test ./...`, `go vet ./...` | test processes | unit/source |
| generated parity | `npm run check:generated` | Git diff | generated source |
| complete patch | `git diff --check` and full diff review | Git | source/checkout |
| publication | exact branch and GitHub commit observation | Git and remote provider | remote source |
| public/client behavior | not executed by this design | none | unknown |

## Verification evidence

- `job_h9_7e2a3143ff`: `npm run verify:sandbox` passed generated-source parity, eight TypeScript tests, all Go tests, forbidden-import checks, and governance including the exact twelve-capability set.
- `job_ha_afe3bd04c6`: `git diff --check` and `go vet ./...` passed with no output.
- `job_h0_ee443eb4ef`: the complete tracked worktree diff and deterministic status were reviewed; the two new files were separately read in `job_h6_689e0552f3` and `job_h7_efca7093ef`.
- `job_hb_60b1b16afe`: searches found no remaining `Native MCP Task`, `fixed public tools`, `fixed control/query surface`, or obsolete deployment `protocol` field in the affected owner set.
- No public endpoint, Cloudflare deployment, ChatGPT client, extension negotiation, Agent runtime, installation, migration, or rollback runtime was executed or claimed.

A green source gate does not prove the public MCP endpoint, the ChatGPT client, extension negotiation, installation, or rollback runtime.

## Unknowns and stop gates

- Do not pin an RC-only public release until the final MCP revision and actual ChatGPT request behavior are observed.
- Do not enable `resources-v1`, `tasks-v1`, or `elicitation-v1` in a release manifest until implementation and current-client support are verified.
- Do not remove baseline tools until a future accepted design proves equivalent access, improved client behavior, snapshot migration, and rollback.
- Do not implement M1 public ingress until duplicate JSON member rejection and validated union discrimination are accepted.

## Decision log

- 2026-08-04: direct maintainer request accepts revising the MCP surface before M1 implementation.
- 2026-08-04: the twelve names are retained as canonical semantic capabilities rather than assumed permanent wire tools.
- 2026-08-04: `tools-v1` is selected as the complete first-release baseline.
- 2026-08-04: Resources, Tasks, and elicitation are additive features, not grounds to delete baseline tools without client evidence.
- 2026-08-04: the server and client independently declare extensions; user prompting cannot substitute for host capability.
