# Terminal Developer Architecture

> Authority: this document owns component boundaries, durable ownership, dependency direction, data placement, concurrency, dispatch topology, and the proposed repository structure. Product scope is owned by [SPEC.md](SPEC.md); the MCP wire adapter and projection are owned by [MCP.md](MCP.md); canonical tdev data and message schemas are owned by [PROTOCOL.md](PROTOCOL.md).

## 1. Architectural goal

tdev separates semantic authority, durable coordination, connection ownership, and operating-system effects so that each durable fact has one canonical owner and every uncertain external effect remains reconcilable.

```text
MCP client
  -> stateless Cloudflare Worker
       -> CaseDO(caseId)
       -> AgentDO(agentId)
       -> D1 locator index
       -> R2 Artifact bytes
            |
            v
       tdev-agent on Termux
         -> Workspace filesystem
         -> Git
         -> validation profiles
         -> process profiles
         -> installation and runtime adapters
```

## 2. Architectural principles

1. **One fact, one owner.** A canonical fact is never independently writable in multiple stores.
2. **Durable state before side effects.** Intent and preconditions commit before dispatch.
3. **No distributed transaction assumption.** CaseDO, AgentDO, Agent, D1, and R2 coordinate with idempotent messages and reconciliation.
4. **Typed first.** Public development effects are versioned Operations, not arbitrary commands.
5. **Ambiguity is state.** Lost responses, disconnections, and partially observed effects enter explicit reconciliation states.
6. **Exact authority.** Case target grants, Workspace policy, Agent capability, Operation requirements, and Task preconditions are all checked.
7. **Minimal cloud knowledge.** Absolute terminal paths and provider credentials remain local unless a typed contract requires bounded disclosure.
8. **Evidence by layer.** Source, validation, package, installation, process, public MCP, client schema, and recovery are verified separately.
9. **Reference-host honesty.** Termux-specific behavior is isolated in its adapter; a Linux directory is only a boundary placeholder.
10. **No speculative coordinators.** WorkspaceDO and ProjectDO are added only when an observed invariant requires independent serialization.
11. **One release-policy source.** Mutable non-secret bounds and product policy come from one release-pinned typed profile; immutable protocol/security rules and deployment secrets remain separate owners.

## 3. Component ownership

### 3.1 Stateless Worker

The Worker owns no durable lifecycle state. It is responsible for:

- release-profile validation before serving requests;
- hard request bounds, fatal UTF-8 validation, and lossless raw JSON scanning before ordinary decoding;
- minimal MCP/JSON-RPC envelope and exact revision validation before authentication;
- authentication before client-capability parsing and capability-specific deep validation;
- canonical schema validation, exact-root validation-proof construction, generated domain conversion, and semantic digest before authorization and owner routing;
- release-pinned Tool, Resource, and extension projection routing;
- Operation catalog presentation under the active projection;
- authorized Resource and locator queries through canonical owners and D1 projections;
- deterministic new-Case routing from deployment identity and request ID, plus explicit routing to `CaseDO(caseId)` and `AgentDO(agentId)`;
- protocol-version negotiation at the public boundary;
- response shaping and redaction;
- bounded Artifact streaming authorization.

The Worker MUST NOT own:

- Case, Task, or Attempt truth;
- Agent queue truth;
- Workspace filesystem truth;
- deployment credentials;
- Git provider credentials;
- retry decisions;
- completion judgments;
- mutation request deduplication or stored replay responses.

A Worker restart cannot invalidate a Case, Task, negotiated Task handle, or Agent identity.

The MCP adapter is stateless. It may observe client revision and capabilities for response shaping, but it does not persist protocol-session authority or own a second Case, Task, approval, input, cancellation, evidence, or terminal state. Client capability metadata is never an authorization source.

The canonical non-secret M1 release profile is generated into both Worker language boundaries and pinned by profile identity and digest. Business logic does not repeat mutable policy literals. Deployment identities, bearer tokens, cursor HMAC keys, and Cloudflare bindings are injected by the deployment owner and are never profile values. Test-only narrowed profiles cannot be selected by a production loader.

### 3.2 CaseDO

One `CaseDO` instance is addressed by one `caseId`.

It is the sole canonical owner of:

- immutable `CaseContract`;
- immutable `CaseTargetGrant` records;
- current Case state and terminal outcome;
- Task records and Task results;
- Attempt records and accepted Agent results;
- immutable mutation receipts containing request identity, semantic digest, and the original committed response;
- approvals, input requests, retry decisions, and cancellation intent;
- checkpoints and continuity summaries;
- Artifact metadata and evidence mappings;
- Case event sequence and transactional audit Events.

CaseDO decides whether an Agent result is accepted. It does not perform operating-system effects and does not own Agent connectivity.

CaseDO storage is SQLite-backed Durable Object storage. Current rows are canonical; immutable mutation receipts reproduce original committed responses; Events are append-only audit records committed in the same transaction as the state change and receipt. MVP is not event sourced and does not require replay to rebuild current state.

Each mutation executes in one CaseDO serialization turn and one SQLite transaction. The transaction checks an existing receipt first, validates canonical current rows and exact revisions, changes current rows, increments affected revisions once, inserts contiguous typed Events, and inserts the bounded original response receipt before commit. A replay never reconstructs an old response from current mutable state.

### 3.3 AgentDO

One `AgentDO` instance is addressed by one `agentId`.

It is the sole canonical owner of:

- enrolled Agent public key and enrollment revision;
- current revocation generation;
- current WebSocket connection;
- connection lease and heartbeat state;
- monotonically increasing connection epoch;
- device execution queue;
- device-wide concurrency;
- dispatch receipts;
- fencing-token generation;
- reconnect replacement of stale connections;
- relay of Agent observations and execution results.

AgentDO does not decide Task success, Case completion, approval, or retry safety. It provides evidence to CaseDO.

AgentDO uses hibernation-capable WebSockets so an idle Agent connection does not require a continuously resident Durable Object isolate.

### 3.4 tdev-agent

The Agent is the sole performer and observer of local operating-system effects. It owns:

- Agent private key storage;
- Agent-local Workspace registry;
- exact filesystem root and root identity observation;
- typed Workspace policy enforcement;
- local Project registry and Project observation;
- filesystem reads and writes;
- Git reads and mutations;
- validation and process profile resolution;
- process creation, output capture, cancellation, and termination observation;
- installation and host runtime adapters;
- local provider credential use;
- execution receipts and evidence production.

The Agent MUST revalidate every dispatch locally. A Cloud admission decision is necessary but not sufficient, because local policy and capability may have changed after admission.

The Agent is not a durable Case scheduler and does not expose an MCP server.

### 3.5 tdev CLI

The Go CLI owns local management workflows:

- installation continuation after `install.sh`;
- Cloudflare authentication profiles;
- deployment discovery, creation, update, rollback, and destruction;
- local deployment manifests and setup journal;
- Agent installation, enrollment, replacement, and revocation requests;
- Workspace and Project registration and policy management;
- diagnosis and end-to-end probes;
- endpoint and MCP token presentation;
- local uninstall and credential removal.

Management actions are initially CLI-only. They are not silently exposed as ordinary development Operations.

### 3.6 D1

D1 owns small, queryable locator and deployment-index records:

- deployment descriptor and schema version;
- Agent locator and non-secret display metadata;
- Workspace locator and policy digest;
- Project locator and optional normalized remote;
- Case locator and bounded summary projection;
- migration state and release compatibility metadata.

D1 does not own Case lifecycle, Task lifecycle, Agent queue, absolute Workspace path, or Artifact bytes.

D1 records can be rebuilt from canonical owners where specified. A stale locator cannot authorize an effect.

### 3.7 R2

R2 owns large immutable byte objects:

- logs exceeding inline bounds;
- validation output;
- patches and exported reports;
- binary results;
- installation or diagnostic Artifacts where allowed.

CaseDO owns the Artifact metadata, digest, media type, ownership, retention class, and evidence relationship. An R2 object without matching canonical metadata is orphaned data, not a valid Artifact.

## 4. Dependency direction

The normal dependency direction is:

```text
public Worker
  -> domain protocol
  -> CaseDO / AgentDO adapters

CaseDO
  -> domain state machine
  -> AgentDO client interface
  -> R2 metadata adapter
  -> D1 projection adapter

AgentDO
  -> connection and queue domain
  -> Agent WebSocket protocol

Agent
  -> operation executor interfaces
  -> Agent-local Workspace and Project registry
  -> host-neutral core
  -> Termux adapter

CLI
  -> Cloudflare REST client
  -> local profile and journal stores
  -> release manifest verifier
  -> Termux management adapter
```

Domain packages MUST NOT import Cloudflare, Termux, Git CLI, filesystem, network, or process implementations.

## 5. Canonical data placement

| Fact | Canonical owner | Derived or cached copies |
| --- | --- | --- |
| Case contract | CaseDO | bounded D1 locator summary |
| Case state and outcome | CaseDO | D1 summary projection |
| Task and Attempt state | CaseDO | client responses, notifications |
| Agent public key and epoch | AgentDO | D1 locator summary |
| Agent live capability | AgentDO from signed Agent observation | bounded D1 summary |
| Agent local root path | Agent | none by default |
| Workspace root identity and policy | Agent | digest and locator in D1, immutable grant snapshot in CaseDO |
| Project checkout state | Agent/Git | locator and registered identity summary |
| Remote Git ref | remote provider | Agent observations |
| Artifact ownership and digest | CaseDO | public response projections |
| Artifact bytes | R2 | Agent upload buffers |
| Cloudflare API token | CLI local profile | none |
| Agent private key | Agent local secret store | none |
| MCP bearer token | Cloudflare secret and local recovery record | never Task input |

## 6. Dispatch and result flow

### 6.1 Normal flow

```text
1. Worker bounds the body, rejects invalid UTF-8 or duplicate-member JSON, parses the minimal MCP/JSON-RPC envelope and exact revision, authenticates the request, then validates the capability-specific canonical schema, converts validated unions, derives a deterministic new `caseId` when required, and routes to CaseDO.
2. CaseDO validates Case state, contract, target grants, Operation schema, input digest, policy requirements, and an existing mutation receipt.
3. CaseDO transactionally commits Task, Attempt(dispatch_pending), the original bounded response receipt, and Events.
4. CaseDO sends an idempotent dispatch using attemptId to AgentDO.
5. AgentDO transactionally records queue entry, Agent epoch, and fencing token.
6. AgentDO sends the dispatch to the current Agent connection.
7. Agent acknowledges receipt and start.
8. Agent performs the typed Operation and returns result plus evidence.
9. AgentDO records and relays the result.
10. CaseDO validates identity tuple, epoch, fencing, Task revision, input digest, result schema, and evidence.
11. CaseDO transactionally commits Attempt and Task terminal state and Events.
```

### 6.2 Lost dispatch response

If CaseDO cannot determine whether AgentDO accepted a dispatch:

```text
Attempt: dispatch_pending -> reconciling(dispatch_response_lost)
```

CaseDO queries AgentDO using the same `attemptId`. It does not create a new Attempt.

### 6.3 Agent disconnect

If the current Agent connection disappears while an Attempt may be running:

```text
Attempt: queued|running -> reconciling(agent_disconnected)
```

A reconnect increments the Agent epoch. Reconciliation uses durable AgentDO queue state, Agent receipts, and target observations. The previous epoch cannot commit a result.

### 6.4 Lost result response

If AgentDO or Agent does not know whether CaseDO accepted a result, the same result envelope is redelivered. CaseDO result acceptance is idempotent by `attemptId` and result digest.

### 6.5 New Attempt

A new Attempt is created only when the current Attempt is terminal and the Task state machine authorizes retry. Non-idempotent Operations require reconciliation or explicit retry authorization first.

## 7. Concurrency model

### 7.1 Case serialization

Each CaseDO serializes canonical transitions for one Case. Different Cases can progress concurrently.

### 7.2 Device execution limit

AgentDO owns actual device execution concurrency. The Termux default is:

```text
high-cost execution concurrency = 1
```

Cheap read-only Operations MAY be admitted concurrently later only after measured resource and ordering invariants are defined. MVP uses one execution slot to avoid hidden phone resource contention.

### 7.3 Per-Task Attempt rule

A Task has at most one nonterminal Attempt. Task state references that Attempt explicitly.

### 7.4 Cross-Case target conflicts

MVP does not add a WorkspaceDO or ProjectDO. With one Agent execution slot, local effects are serialized at the device boundary. Exact file and Git preconditions detect stale observations between Cases.

This does not provide a global filesystem transaction. When measured concurrency requires target-wide reservations or policy serialization, a dedicated coordinator can be introduced under the criteria in section 12.

## 8. Fencing model

An accepted Agent result MUST match:

```text
caseId
taskId
attemptId
agentId
agentEpoch
fencingToken
expectedTaskRevision
operationInputDigest
```

Rules:

- `agentEpoch` increases whenever a new live connection replaces the prior connection.
- A fencing token is issued for a queue assignment under an epoch.
- AgentDO rejects messages from stale connections.
- CaseDO independently rejects stale or mismatched result envelopes.
- A late success from a stale epoch is evidence for reconciliation but not an accepted Task result.

## 9. Storage model

### 9.1 CaseDO SQLite

M1 CaseDO schema version 1 includes:

```text
schema_meta
case_contract
case_state
case_target_grants
tasks
attempts
approval_requests
approval_decisions
input_requests
input_responses
retry_decisions
checkpoints
evidence_sets
evidence_mappings
evidence_refs
artifact_refs
mutation_receipts
events
```

The exact schema, canonical JSON and digest columns, revisions, derived selectors, indexes, immutable guards, migration identity, and rollback barrier are owned by [PROTOCOL.md](PROTOCOL.md). Required database constraints include one current Case row, unique Task sequence and Attempt ordinal, at most one nonterminal Attempt per Task, unique request ID per Case, contiguous committed Event sequence, and immutable terminal and audit records.

`schema_meta` owns only the local CaseDO database version and digest. Deployment-wide migration ordering and stage receipts remain owned by [DEPLOYMENT.md](DEPLOYMENT.md). The initial migration is exact empty state to version 1; after data is stored, a predecessor without declared exact compatibility is not a rollback target.

The source boundary is `edge/case-do/`. Production storage code depends on a minimal synchronous SQL adapter and does not import the Node SQLite test driver. `admission.ts` provides the fixed deployment/request-to-Case derivation and validates the exact internally stored submit-result shape; `repository.ts` keeps CaseDO as the sole admission-dedupe and receipt owner. The deterministic local adapter in `node-sqlite.test-support.ts` verifies DDL, migration rollback, canonical-row integrity, revision guards, Event sequencing, atomic Case/first-Task/optional-Attempt admission, matching receipt replay, request conflict, every pre-commit rollback point, and commit-then-response-loss recovery in isolated SQLite databases. Those tests are source/storage evidence only; they do not establish Worker restart routing, Cloudflare Durable Object API compatibility, hibernation, instance restart, deployment, public output validation, or live rollback behavior.

### 9.2 AgentDO storage

Expected records include:

```text
agent_enrollment
agent_revocation
connection_state
queue_entries
dispatch_receipts
result_receipts
capability_observation
```

AgentDO queue entries are not Task truth; they are delivery truth.

### 9.3 Agent-local storage

Expected local stores include:

```text
agent identity
Workspace records
Project records
ValidationProfile records
ProcessProfile records
provider credential references
runtime service state
bounded receipt cache
```

Local records use atomic replacement and restrictive permissions where applicable. Secret values are separated from ordinary configuration.

## 10. Technology mapping

### 10.1 TypeScript edge

TypeScript is used for the Worker, CaseDO, and AgentDO because it maps directly to Cloudflare bindings, Durable Object APIs, SQLite storage, and WebSocket hibernation.

External JSON is always schema-validated before conversion into internal branded types.

### 10.2 Go CLI and Agent

Go is used for release-friendly single binaries, HTTP and WebSocket clients, filesystem and process APIs, typed concurrency, and shared CLI/Agent protocol code generation.

The Agent and CLI may share:

- generated protocol types;
- canonical JSON and digest implementation;
- release manifest parsing;
- identifiers and error envelopes;
- redaction utilities;
- bounded I/O primitives.

They do not share ownership state merely for code reuse.

### 10.3 JSON Schema

JSON Schema 2020-12 is the canonical data-contract owner. Generated TypeScript, Go, and MCP schemas are verified derivatives.

### 10.4 POSIX shell bootstrap

`install.sh` is intentionally small and contains no product state machine. It detects, downloads, verifies, installs, and then executes the Go CLI setup path.

## 11. Proposed repository structure

```text
cmd/
  tdev/
  tdev-agent/

edge/
  worker/
  case-do/
  agent-do/
  generated/

domain/
  case/
  task/
  attempt/
  agent/
  workspace/
  project/
  operation/
  evidence/

protocol/
  schemas/
    common/
    case/
    task/
    attempt/
    control/
    operations/
  generated/
    go/
    typescript/
  testdata/

agent/
  core/
  operations/
  profiles/
  storage/
  hosts/
    termux/
    linux/

cli/
  setup/
  deployment/
  auth/
  lifecycle/
  doctor/

cloudflare/
  api/
  migrations/
  bundle/

packaging/
  installer/
  release/

docs/
```

`agent/hosts/linux/` contains interfaces or compile-only placeholders only when required to keep core boundaries host-neutral. It does not contain a claimed implementation.

## 12. Criteria for future coordinators

### 12.1 WorkspaceDO

A WorkspaceDO is introduced only when at least one demonstrated requirement cannot be safely owned by AgentDO, exact preconditions, and CaseDO grants:

- the same logical Workspace is served by multiple Agents;
- Workspace-wide write reservations are required across multiple device queues;
- Workspace policy is modified concurrently by independent controllers;
- offline Workspace lifecycle must progress independently of its Agent;
- Workspace quota, lease, or reservation requires globally serialized state.

Before introduction, the design must identify:

- the exact fact moving to WorkspaceDO;
- the previous owner being removed;
- message ordering and failure behavior;
- migration and rollback;
- evidence that exact preconditions alone are insufficient.

### 12.2 ProjectDO

A ProjectDO is introduced only when demonstrated requirements include:

- multiple physical clones of one logical Project across Agents;
- Project-wide remote publication locks;
- Project policy or approval independent of a Case;
- target-wide coordination not representable by exact Git preconditions;
- an independent Project lifecycle and event stream.

Neither coordinator may be added as a cache or naming convenience.

## 13. Failure boundaries

| Failure | Canonical treatment |
| --- | --- |
| Worker request fails before routing | transport failure; no Case transition inferred |
| Case admission fails | typed admission error; no Task created |
| CaseDO commits but response is lost | deterministic routing reaches the same CaseDO and the immutable mutation receipt returns the original committed response |
| AgentDO dispatch response is lost | Attempt reconciliation using same ID |
| Agent disconnects | new epoch on reconnect; running effect reconciled |
| Agent process fails to start | durable Task execution failure |
| validation reports failed checks | successful Operation result with failed verdict |
| process exits nonzero | successful Operation result with exit status |
| mutation effect cannot be observed | Task/Attempt unverified, never assumed failed or succeeded |
| D1 projection is stale | lookup may be stale; authorization reads canonical owners |
| R2 upload exists without metadata commit | orphan cleanup candidate, not valid evidence |
| notification fails | no effect on Task completion |

## 14. Architecture acceptance

The architecture is considered implemented only when tests demonstrate:

- invalid UTF-8, duplicate member names including escape-equivalent names, unsafe numbers, and ingress-limit overflow are rejected before ordinary decoding;
- every public `oneOf` enters domain code only through an exact validation proof and generated branch conversion;
- deterministic new-Case routing reaches the same CaseDO after Worker restart and response loss without a global request owner;
- current state, schema identity, and mutation receipts survive Worker restart and Durable Object hibernation;
- Case admission is atomic with first Task creation;
- same-digest replay returns the original committed response after current state advances, while a conflicting digest produces no write;
- dispatch and result redelivery are idempotent;
- Agent reconnect increments epoch and fences stale messages;
- a stale D1 locator cannot authorize an Operation;
- Artifact bytes cannot be read without matching Case metadata and authorization;
- no Cloudflare API token or Git provider secret appears in Task, Attempt, Event, log, or Artifact fixtures;
- the Agent rejects a dispatch that Cloud admitted when local policy has since narrowed;
- the exact empty-to-v1 migration either commits a verified schema or leaves no falsely applied target version;
- an incompatible stored schema or rollback predecessor fails closed without state mutation;
- the complete first vertical slice uses the final CaseDO and AgentDO boundaries without a compatibility scheduler, RequestDO, or Event-rebuild owner.
