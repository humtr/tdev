# Terminal Developer MCP Adapter and Projection Contract

> Authority: this document owns the public MCP wire revision, standard method mapping, deterministic projection manifest, tool/resource/extension projection, client capability interpretation, and current-client compatibility. Canonical tdev Case, Task, Attempt, control, query, and result semantics remain owned by [PROTOCOL.md](PROTOCOL.md).

## 1. Boundary

The MCP layer is a stateless adapter over canonical tdev state.

```text
MCP client
  -> MCP adapter in the stateless Worker
       -> canonical tdev semantic capability
            -> CaseDO / AgentDO / D1 / R2 owner
```

The adapter may project one semantic capability as a Tool, Resource, or negotiated extension method. A projection never becomes a second lifecycle owner and never changes the underlying authorization, revision, cancellation, evidence, or terminal rules.

## 2. Revision policy

The native owner baseline for new source is the final MCP specification revision `2026-07-28`. A release pins one exact revision and MUST NOT advertise an unqualified moving value such as `latest`.

The final specification does not by itself prove support in the selected SDK or current client. Before the first public release:

- the actual SDK and current client request revision and capability metadata are observed;
- one unsupported revision is rejected explicitly rather than interpreted as another revision;
- any compatibility profile is named, bounded, independently tested, and carries an explicit retirement gate rather than becoming an implicit permanent fallback;
- no historical tdev MCP session, transport, or wire schema is supported merely because a previous specification exists.

Each request is self-contained. Protocol revision and client capabilities are read from the revision-defined request-body `_meta.io.modelcontextprotocol/*` fields; a transport header mirror is checked for exact agreement but is not a competing source of truth. A connection, stream, process, previous request, client name, or cached capability observation never authenticates a principal, selects a durable Case, or widens authorization.

Successful core results use the revision-defined `resultType` forms, including `complete` and `input_required`. The optional Tasks extension uses its negotiated `task` result and methods only when both sides declare support on the current request. A revision-specific MCP Task DTO maps to one authorized canonical tdev Task ID. It creates no MCP-only table, scheduler, retry owner, cancellation owner, status writer, or terminal writer; typed extension data preserves denial, uncertainty, reconciliation, and `unverified` when the public status is coarser.

MCP wire compatibility is separate from CaseDO, AgentDO, D1, and Artifact stored-schema migration. [Design 0005](design/0005-concept-revision-1-transaction-and-contract-boundaries.md) owns the source correction; actual SDK and current-client support remains a deployment/client qualification gate.

## 3. Canonical semantic capability catalog

The following twelve entries are stable tdev semantic capabilities. Their exact inputs, outputs, transitions, and errors are owned by [PROTOCOL.md](PROTOCOL.md).

<!-- mcp-capabilities:start -->
| Capability | Creates Native Task | Semantic purpose | `tools-v1` projection |
| --- | ---: | --- | --- |
| `list_operations` | no | versioned Native Operation catalog and availability | Tool |
| `list_resources` | no | bounded Agent, Workspace, Project, and Case locators | Tool |
| `submit_operation` | yes | create a Case plus first Task or add a Task to an explicit Case | Tool |
| `get_case` | no | canonical Case snapshot and bounded summaries | Tool |
| `get_task` | no | canonical Task plus bounded Attempt, Event, and result data | Tool |
| `control_case` | no | pause, resume, and checkpoint | Tool |
| `finish_case` | no | validated completed, failed, rolled-back, or unverified transition | Tool |
| `cancel_case` | no | enter cancelling and propagate cancellation intent | Tool |
| `control_task` | no | approval, denial, typed input, and retry decision | Tool |
| `cancel_task` | no | request cooperative Task cancellation | Tool |
| `render_task` | no | bounded read-only presentation envelope | Tool |
| `read_artifact` | no | authorized bounded Artifact byte range | Tool |
<!-- mcp-capabilities:end -->

A future projection may expose some read or Task capabilities through standard MCP primitives, but it cannot delete or change the semantic capability without a product and protocol design change.

## 4. Projection manifest

Every release carries one immutable MCP projection manifest.

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

The projection digest covers canonicalized names, descriptions, annotations, input schemas, output schemas, Resource templates, extension identifiers, and protocol revision.

Within one projection digest:

- `tools/list` order and definitions are deterministic;
- a user prompt, connection, transient Agent state, or temporary availability change does not add or remove a Tool;
- current availability is returned as bounded catalog data or a typed Tool result;
- a breaking Tool definition change requires a new projection digest and current-client refresh or republication evidence.

## 5. First-release base profile

`tools-v1` is the complete first-release baseline. It exposes all twelve semantic capabilities as Tools.

This baseline is not a legacy protocol mode. It is the minimum complete projection for a supported client whose verified integration is Tool discovery and Tool calling.

A first release MUST NOT depend on an optional MCP extension unless the supported client declares it and the release qualification observes it.

## 6. Additive standard projections

Additive features MAY be present without removing `tools-v1` Tools.

### 6.1 `resources-v1`

When implemented and supported by the client, Resources MAY project read-only catalog and entity data:

```text
tdev://operations
tdev://operations/{operationId}/{version}
tdev://agents/{agentId}
tdev://workspaces/{workspaceId}
tdev://projects/{projectId}
tdev://cases/{caseId}
tdev://tasks/{taskId}
tdev://attempts/{attemptId}
tdev://events/{caseId}/{eventId}
tdev://checkpoints/{checkpointId}
tdev://evidence/{evidenceSetId}
tdev://artifacts/{artifactId}
```

Resource URIs are opaque identifiers, not bearer capabilities. Every `resources/list` or `resources/read` result is scoped by the authenticated principal and current authorization. Unauthorized existence is not disclosed.

Resources are projections only. They cannot authorize an effect, change canonical state, or replace bounded Artifact-range semantics. `read_artifact` remains available until an equivalent authenticated range contract is accepted and verified.

### 6.2 `tasks-v1`

The extension identifier is `io.modelcontextprotocol/tasks`.

The extension activates only when:

1. the release projection manifest includes `tasks-v1`;
2. the tdev server advertises the extension;
3. the current client request declares the extension capability;
4. current-client verification proves the expected lifecycle.

The server decides per request whether a long-running `submit_operation` returns a Task handle. The handle resolves to the same canonical tdev `TaskRecord`.

```text
MCP tasks/get     -> read canonical tdev Task
MCP tasks/update  -> satisfy an outstanding typed input, approval, or retry request
MCP tasks/cancel  -> record the existing cooperative cancellation intent
```

No MCP-only Task table, status writer, retry scheduler, or terminal decision is permitted. The Task is durably discoverable before its handle is returned. Cancellation may race with a valid success and does not force a false cancelled outcome.

A projected MCP status that is coarser than the tdev domain MUST preserve `denied`, `unverified`, reconciliation, and typed uncertainty in structured extension data.

### 6.3 `elicitation-v1`

Elicitation is optional presentation for existing typed input and approval records.

Form elicitation MAY contain non-secret structured values such as:

- an approval or denial decision;
- a retry decision;
- a branch or ref selection already permitted by the Case;
- a bounded non-secret Operation input.

Form elicitation MUST NOT request or carry:

- Cloudflare API Tokens;
- MCP bearer tokens;
- private keys;
- Git provider credentials;
- OAuth authorization codes;
- secret environment values.

A future URL elicitation flow requires a separate accepted security design for origin, callback correlation, one-use state, expiry, and secret exclusion from URLs and durable records.

When elicitation is absent, `control_task` remains the complete baseline path.

## 7. Extension declaration ownership

Extension activation is bilateral.

```text
tdev server implementation and declaration
  controlled by the tdev release

client capability declaration
  controlled by the MCP host, including ChatGPT

user prompt
  can request behavior but cannot create an unsupported client capability
```

The server MUST check the capability on the current request where the specification requires per-request declaration. A prior request, client name, or cached connection observation is not sufficient.

Missing optional support selects the baseline behavior. A request that fundamentally requires an unavailable capability returns a typed missing-capability error instead of fabricating support.

## 8. Stateless request model

The public Worker owns no protocol session state. Long-lived application state is addressed explicitly through server-minted identifiers such as `caseId`, `taskId`, `attemptId`, and Resource URIs.

Client name, client version, protocol revision, and capability digest are observations. They are not authentication identity and never widen:

- CaseTargetGrant;
- WorkspacePolicy;
- AgentCapability;
- Operation required effects;
- Task approval or preconditions.

A Worker restart cannot invalidate a Case, Task, or Task extension handle.

## 9. Tool contracts

Each Tool definition is derived from canonical tdev schemas and policy metadata.

### 9.1 Input and output

- `inputSchema` is derived from the canonical semantic input schema.
- `outputSchema` is derived from the canonical semantic result schema.
- `structuredContent` carries bounded machine-readable results.

The canonical schema now provides strict executable input and capability-specific result roots for all twelve semantic capabilities. Each newly added public root declares TypeScript ownership in the target manifest, and the generator emits the stable capability-to-root mapping, self-contained `inputSchema` and `outputSchema` documents, root schema digests, catalog/tool-set digests, and the MCP projection digest. Executable strict-root and bounded-result tests cover this contract. This closes the contract/projection gate only; the stateless Worker adapter, CaseDO service wiring, public endpoint, and current-client qualification remain separate gates. TypeScript/Go parity is additionally required for any root that becomes a shared wire contract consumed by the Go CLI or Agent; MCP Tool mappings, annotations, catalog metadata, and client adaptation remain Edge-only derivatives and MUST NOT be mirrored into Go merely for symmetry. Internal TypeScript return types do not stand in for an MCP `outputSchema`.
- `content` contains a short readable summary.
- Resource links MAY accompany a result only when supported and authorized.
- A large result is referenced through an Artifact rather than duplicated as text.

### 9.2 Annotations

Annotations are generated from canonical effects, retry class, approval policy, and external-world interaction.

```text
readOnlyHint
idempotentHint
destructiveHint
openWorldHint
```

Annotations are client guidance, not authorization. Manually maintained annotation copies MUST NOT diverge from the Operation or semantic capability owner.

### 9.3 Tool names

Tool names are stable within one projection version. Renaming a Tool or changing a required field is breaking for a frozen client action snapshot even when the underlying semantic capability is unchanged.

## 10. Results and errors

The adapter keeps these failure classes distinct:

```text
HTTP or MCP transport rejection
  invalid bytes, envelope, revision, authentication, or required headers

JSON-RPC method error
  unknown method or malformed standard request

semantic admission error
  no Task created; schema, grant, policy, status, or revision rejected

Tool execution error
  an actionable non-durable failure returned by the Tool contract

durable Task terminal
  succeeded, failed, cancelled, denied, or unverified under CaseDO authority
```

`unverified` and possible external effects are never flattened into ordinary failure or success. Errors expose bounded typed data and no secret or unauthorized identifier.

## 11. OpenAI and other client profiles

A supported client profile records observed behavior, not assumed vendor capability.

For ChatGPT, release qualification must independently observe:

- the MCP revision sent by the current client;
- the exact frozen Tool names and input schemas visible after scan or publication;
- Tool output-schema and structured-result behavior;
- whether Resources, Task handles, elicitation, or other extensions are declared and usable;
- confirmation and action-control behavior for writes;
- refresh or republication behavior after a projection change.

OpenAI documentation that describes Tool scanning does not by itself prove support for a particular MCP RC or extension. A server developer cannot force ChatGPT to advertise an unsupported extension.

## 12. Compatibility and publication

Before first public release, no historical tdev MCP wire compatibility is required. The release pins one exact final revision and projection digest.

After publication:

- additive semantic fields are not automatically client compatible;
- Tool additions or changes require current-client snapshot review;
- a breaking projection uses a new projection identity;
- the predecessor remains usable only when its stored-state and runtime compatibility are declared;
- public endpoint, server projection, and current client snapshot are verified as separate layers.

A reduced Tool projection is deferred. It requires a future accepted design proving equivalent semantic access, improved client behavior, refresh/republication, and rollback. The first release does not dynamically hide baseline Tools merely because an extension is present.

## 13. Security and bounds

The adapter enforces, before canonical routing:

```text
request byte bound
fatal UTF-8 validation
lossless JSON grammar, duplicate-member, depth, token, container, string, and exact-number bounds
minimal MCP and JSON-RPC envelope validation
exact protocol revision validation
authentication
client capability parsing
capability-specific canonical schema, validation proof, domain conversion, and semantic digest
authorization and deterministic owner routing
CaseDO transaction or bounded read
```

Authentication occurs before capability-specific deep validation so unauthenticated input cannot consume owner-specific validation work. Authorization and owner routing occur only after the exact canonical capability value and semantic digest exist. Header and body routing metadata must agree when required by the selected MCP revision. Secrets and user-controlled authorization data are not moved into extension metadata or Resource URIs.

All lists, reads, Tool results, Task projections, and error details are bounded and paginated where applicable.

## 14. Verification gates

The MCP adapter is not complete until evidence exists for each affected layer:

```text
contract plus all twelve executable input/result roots and generated projection mapping
Worker adapter tests
isolated Cloudflare MCP endpoint
release projection digest
public authenticated behavior
current client-visible Tool snapshot
optional extension behavior actually declared by the client
refresh or republication after a controlled schema change
rollback to a compatible predecessor
```

Source tests or an MCP SDK conformance test do not prove current ChatGPT behavior.

## 15. Deferred decisions

The following remain evidence-gated:

- the exact final MCP revision for the first release;
- whether `resources-v1`, `tasks-v1`, or `elicitation-v1` is enabled in that release;
- whether Resource links improve model planning and presentation;
- whether a future projection should remove redundant baseline read or Task-control Tools;
- Artifact range delivery through Tool, Resource template, or authenticated HTTPS range endpoint;
- optional Apps SDK UI for Case and Task presentation.

Each decision requires an owner update, a current-client probe, compatibility analysis, and rollback evidence.
