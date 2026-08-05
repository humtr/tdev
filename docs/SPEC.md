# Terminal Developer Product Specification

> Status: normative first-release product contract. Current implementation state and active change work are routed through [WORKBOARD.md](../WORKBOARD.md) and the [design registry](design/README.md).
>
> Authority: this document owns the product definition, first-release completeness boundary, canonical terminology, supported environment, product-level functional, security, lifecycle, and quality requirements, product non-goals, acceptance scenarios, and requirement traceability. Exact component design, schemas, state transitions, Operation payloads, threat controls, Cloudflare resources, implementation slices, and verification procedures remain owned by the linked subordinate documents.

## 1. Conformance and completeness boundary

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** express normative requirements.

This specification is complete for the **first public release** defined by milestones M0 through M10 in [MVP.md](MVP.md). Completeness means that every required first-release product capability and quality property has:

1. one stable requirement identifier;
2. one product-level outcome or constraint in this document;
3. one detailed normative owner;
4. one first implementation or release gate;
5. one authoritative evidence class.

This document is not an unlimited future roadmap. A capability excluded from the first release remains outside the contract until a later accepted design updates the appropriate owner.

Requirement identifiers are stable after publication. Rewording may clarify a requirement without changing its meaning. Reusing an identifier for a different meaning, deleting a required behavior, or changing its owner, support claim, security boundary, compatibility rule, or acceptance evidence is a Class 2 change under root [SDD.md](../SDD.md).

## 2. Product definition and problem

**tdev (Terminal Developer) is a user-owned durable development control plane that lets an MCP client coordinate verified development work through Cloudflare while a user-controlled terminal Agent performs bounded filesystem, Git, validation, process, installation, and runtime effects.**

A conversational client can make semantic development decisions but is not a durable execution owner. A terminal can perform real effects but must not be exposed as an unrestricted remote shell. A complete development undertaking also crosses failures that ordinary request/response tools do not own:

- client disconnects and client replacement;
- Worker restart and Durable Object hibernation;
- mobile process suspension, network loss, and Agent reconnect;
- repeated or ambiguous submissions;
- partial or unobserved external effects;
- approvals, additional user input, and retry decisions;
- exact filesystem, Git, profile, and remote-ref preconditions;
- bounded output, Artifact retention, and evidence mapping;
- installation, activation, migration, upgrade, rollback, uninstall, destruction, and recovery.

tdev provides one explicit authority chain and one canonical transition path for those facts.

## 3. Actors, trust domains, and deployment assumptions

### 3.1 User and operator

The user owns the terminal environment, Cloudflare account, deployment credentials, Agent identity, Workspace registrations, Project registrations, provider credentials, and authorization decisions. The first release is designed for one user administering one independently owned deployment.

### 3.2 MCP client

The MCP client discovers the public catalog, creates and controls Cases and Tasks, supplies typed input and approvals, reads bounded results, and presents evidence. It is not the durable owner of Case state, Agent execution, external-effect truth, or deployment credentials.

### 3.3 User-owned Cloudflare deployment

The Worker, Durable Objects, D1, R2, bindings, migrations, endpoint, and MCP credential run in the user's Cloudflare account. tdev does not require a centralized vendor SaaS account or a shared vendor Cloudflare deployment.

### 3.4 Termux Agent

The Agent runs under the user's existing Termux identity and is the only component permitted to perform local operating-system effects. It establishes an outbound authenticated connection to the user's Cloudflare deployment. The first release does not require an inbound port, local MCP server, ngrok, or another tunnel subsystem.

### 3.5 Workspace and Project

A Workspace is an Agent-managed filesystem authority boundary with an exact root identity and typed policy. A Project is a registered development target inside a Workspace, normally a Git checkout. Multiple Workspaces, Projects, and Cases are supported in the model, while release acceptance requires at least one Workspace and one Project.

### 3.6 Remote provider

Git remote effects are performed from the Agent with local credentials. The typed Git contract is not owned by a provider-specific cloud integration. The first release uses ordinary Git transport to an operator-controlled remote and does not require a provider-specific cloud API. Provider-specific API behavior is not a first-release support claim without its own owner and evidence.

### 3.7 First-release operating assumptions

The first release assumes:

```text
users per deployment              1
independently owned deployments   1 per accepted scenario
Termux Agents required            1
active Agent connections          1
high-cost Agent concurrency       1
Workspaces                         multiple in model; at least 1 in acceptance
Projects                           multiple in model; at least 1 in acceptance
Cases                              multiple
reference host                     Termux on Android ARM64
reference cloud                    user-owned Cloudflare account
reference remote scenario          ordinary Git transport to an operator-controlled remote
```

A user performing installation or setup must have a supported Termux environment, network access, a Cloudflare account, and a Cloudflare API Token with the exact permissions defined in [DEPLOYMENT.md](DEPLOYMENT.md). Remote Git mutation additionally requires a locally usable provider credential or transport configuration.

## 4. Canonical terminology

### 4.1 Case

A **Case** is the durable authority and record for one outcome-oriented development undertaking. It may contain multiple Tasks and may target multiple Workspaces or Projects only when its immutable grants permit them.

The canonical names are:

```text
CaseDO(caseId)
CaseContract
CaseTargetGrant
case.*
```

### 4.2 Task

A **Task** is one durably admitted semantic Operation and its canonical result. A Task may have more than one Attempt over time, but it has at most one nonterminal Attempt and exactly one terminal semantic result.

### 4.3 Attempt

An **Attempt** is one actual Agent execution attempt for a Task. Dispatch uncertainty is reconciled against the same `attemptId`; it does not silently create a new Attempt.

### 4.4 Agent

An **Agent** is a user-controlled terminal execution identity. Agent identity, current connection, capability, service health, and target authority are separate facts.

### 4.5 Workspace

A **Workspace** is an Agent-managed local filesystem boundary with an exact root identity and typed policy. It can contain zero or more Projects.

### 4.6 Project

A **Project** is a registered development target within a Workspace, normally a Git checkout. A Project remote is optional; absence is represented by field absence or a typed absence variant, never an ambiguous empty string.

### 4.7 Operation and profile

An **Operation** is a versioned semantic action with typed targets, required effects, input schema, result schema, failure schema, retry policy, cancellation policy, and approval policy. A **ValidationProfile** or **ProcessProfile** is an Agent-local versioned execution contract; it is not arbitrary command input.

### 4.8 Artifact and evidence

An **Artifact** is bounded immutable content stored outside the canonical state row. **Evidence** is a typed reference that supports an acceptance or verification claim. A queue status, process exit, Task outcome, test result, or notification is not by itself evidence for unrelated layers.

### 4.9 Unknown and unverified

An **unknown** fact has not been established by an authoritative reader. An **unverified** outcome means an external effect may exist but the system cannot establish its result. Unknown and unverified are not aliases for success, failure, or cancellation.

## 5. Supported environment and fixed technology decisions

The only implementation and release host currently claimed is:

```text
Termux on Android ARM64
```

Termux is the reference host for installation, service management, filesystem behavior, Git integration, process execution, Android background constraints, recovery, and end-to-end release qualification. The repository MAY contain an unimplemented `agent/hosts/linux/` adapter boundary to keep core packages host-neutral. Its presence does not claim Linux support. No other desktop or server operating system is part of the first-release support statement.

The selected technology stack is:

```text
Cloudflare Worker and Durable Objects   TypeScript
CLI                                      Go
Agent core and Termux adapter            Go
Canonical external schemas               JSON Schema 2020-12
Generated shared wire types              TypeScript and Go
Worker/MCP projection metadata            TypeScript
Bootstrap installer                      POSIX shell
```

Canonical JSON Schemas are the sole owner of external data contracts. Generated TypeScript views, Go views for wire records consumed by the CLI or Agent, MCP-compatible schemas, TypeScript-owned projection metadata, examples, and test vectors are derivatives and MUST be checked against their declared language targets for drift.

## 6. Product topology and interfaces

The product topology is:

```text
MCP client
  -> stateless Cloudflare Worker
       -> CaseDO(caseId)
       -> AgentDO(agentId)
       -> D1 locator and deployment index
       -> R2 Artifact bytes
            |
            v
       tdev-agent on Termux
         -> Workspace filesystem
         -> Git and remote Git transport
         -> ValidationProfiles and ProcessProfiles

Local operator
  -> tdev CLI
       -> installer, setup, deployment, lifecycle, recovery, and diagnosis
```

The detailed ownership and dependency direction are defined in [ARCHITECTURE.md](ARCHITECTURE.md).

### 6.1 Public MCP control and query surface

The product defines twelve canonical semantic control/query capabilities. Their exact inputs, outputs, transitions, and errors are owned by [PROTOCOL.md](PROTOCOL.md); the authoritative catalog and MCP wire projection are owned by [MCP.md](MCP.md).

The first-release `tools-v1` projection exposes all twelve capabilities as deterministic MCP Tools. Standard Resources, the Tasks extension, and elicitation MAY be added only as capability-gated projections that preserve the same semantic owner and baseline behavior. They are not assumed supported by ChatGPT until current-client evidence demonstrates support.

Only `submit_operation` creates a Native Task. Case and Task lifecycle control is canonical state control, not an Agent Operation or an MCP-owned lifecycle. A prompt cannot force the client host to declare an unsupported extension.

### 6.2 Agent Operation surface

The first release requires the bounded Agent Operation set owned by [OPERATIONS.md](OPERATIONS.md): Agent and target observation, file listing/reading/search/editing, Git observation/staging/commit/fetch/push, validation, and registered process execution. It MUST NOT expose arbitrary shell, executable, argument vector, environment, or working-directory control.

### 6.3 CLI management surface

The CLI owns installation continuation, setup, Cloudflare profile management, deployment discovery and lifecycle, Agent enrollment/replacement/revocation, Workspace and Project registration, upgrade, rollback, uninstall, destroy, credential removal, and diagnosis. Management actions are not silently exposed as ordinary development Operations. Exact commands and effects are owned by [DEPLOYMENT.md](DEPLOYMENT.md).

### 6.4 Notifications

Notifications MAY report a meaningful state change. They are a separate presentation surface and do not create, advance, complete, or verify a Case, Task, Attempt, deployment stage, or external effect.

## 7. Product requirement catalog

Each row below defines one normative product requirement. The detailed owner column identifies the sole document that owns the exact design. The first gate is the earliest milestone at which the requirement must be implemented and verified; `Release` means it is an aggregate release qualification requirement. The evidence column names the authoritative evidence class, not a particular test implementation.

### 7.1 Functional requirements

| Requirement | Product-level requirement | Detailed owner | First gate | Required evidence |
| --- | --- | --- | --- | --- |
| TDEV-FUN-001 | The product MUST deploy its cloud control plane into a Cloudflare account selected and controlled by the user. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | exact Cloudflare resource and account observation |
| TDEV-FUN-002 | The official bootstrap MUST install verified prebuilt release assets on a clean supported Termux host without requiring Node.js, npm, Wrangler, Go, or a source build. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | clean-host installer and asset-digest evidence |
| TDEV-FUN-003 | Setup MUST be resumable and MUST discover, verify, and reuse a compatible existing deployment instead of creating name-based duplicates. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | setup journal and injected-response-loss observations |
| TDEV-FUN-004 | The CLI MUST manage distinct Cloudflare authentication profiles without using human-readable profile or token labels as deployment identity. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | local profile and exact deployment identity observation |
| TDEV-FUN-005 | The product MUST enroll an Agent identity through a bounded single-use grant and proof of private-key possession. | [SECURITY.md](SECURITY.md) | M2 | grant-consumption, challenge, and authenticated connection evidence |
| TDEV-FUN-006 | An Agent reconnect MUST replace the old live connection under a new epoch while preserving durable queue and receipt state. | [ARCHITECTURE.md](ARCHITECTURE.md) | M2 | reconnect, hibernation, epoch, and queue observation |
| TDEV-FUN-007 | The operator MUST be able to replace or revoke an Agent without transferring a running Attempt to another identity or accepting the old key after revocation. | [SECURITY.md](SECURITY.md) | M9 | replacement ordering and old-key rejection evidence |
| TDEV-FUN-008 | The operator MUST be able to register and inspect a Workspace and manage its typed policy under an exact root identity and revision. | [SECURITY.md](SECURITY.md) | M8 | Agent-local Workspace identity, revision, and policy observation |
| TDEV-FUN-009 | The operator MUST be able to register and inspect a Project within a Workspace and manage its registered metadata while representing an absent remote unambiguously. | [SECURITY.md](SECURITY.md) | M8 | Agent-local Project registration, revision, metadata, and live Git observation |
| TDEV-FUN-010 | An MCP client MUST be able to discover bounded Agent, Workspace, Project, Case, Operation, and availability information with explicit freshness. | [PROTOCOL.md](PROTOCOL.md) | M3 | public catalog and resource-query responses |
| TDEV-FUN-011 | An MCP client MUST be able to create a Case whose objective, acceptance, verification requirements, non-goals, constraints, and target grants become an immutable CaseContract. | [PROTOCOL.md](PROTOCOL.md) | M1 | canonical CaseContract row and digest observation |
| TDEV-FUN-012 | The product MUST atomically create a new Case and its first admitted Task, or add one admitted Task to an explicitly selected existing Case. | [PROTOCOL.md](PROTOCOL.md) | M1 | CaseDO transaction, Task count, and response-loss recovery evidence |
| TDEV-FUN-013 | Duplicate semantic submissions MUST return the original durable result, while reuse of the same request ID for a different semantic digest MUST be rejected. | [PROTOCOL.md](PROTOCOL.md) | M1 | request-dedupe record and concurrent submission evidence |
| TDEV-FUN-014 | An MCP client MUST be able to query canonical Case and Task state and bounded Attempt, Event, result, Artifact, and presentation data after the initiating client session ends. | [PROTOCOL.md](PROTOCOL.md) | M1 | public query after disconnect, restart, and hibernation |
| TDEV-FUN-015 | An MCP client MUST be able to pause, resume, checkpoint, finish, or request cancellation of a Case under exact revision and terminal prerequisites. | [PROTOCOL.md](PROTOCOL.md) | M1 | allowed and denied Case transition observations |
| TDEV-FUN-016 | An MCP client MUST be able to approve, deny, provide typed input, authorize or decline retry, and request Task cancellation without creating a separate control Task. | [PROTOCOL.md](PROTOCOL.md) | M1 | canonical Task decision and transition observations |
| TDEV-FUN-017 | CaseDO and AgentDO MUST durably dispatch one Attempt, reconcile lost receipts against the same Attempt identity, and accept only a matching fenced result. | [ARCHITECTURE.md](ARCHITECTURE.md) | M2 | dispatch, receipt, redelivery, and accepted-result evidence |
| TDEV-FUN-018 | The Agent MUST support bounded file listing, complete-file digest observation, text and binary range reading, and bounded search inside an authorized target. | [OPERATIONS.md](OPERATIONS.md) | M3 | typed file results and contained-target observations |
| TDEV-FUN-019 | The Agent MUST support exact file creation, replacement, and deterministic text edits with before and expected-after preconditions and post-effect observation. | [OPERATIONS.md](OPERATIONS.md) | M4 | before/after digest and unrelated-file preservation evidence |
| TDEV-FUN-020 | The Agent MUST support deterministic Git status, identity, diff, and history observation without assuming object format or exposing credentials. | [OPERATIONS.md](OPERATIONS.md) | M5 | real-repository Git observation and digest evidence |
| TDEV-FUN-021 | The Agent MUST support path-scoped staging and exact commit creation without implicit staging, Git configuration mutation, hook bypass, or speculative duplicate commits. | [OPERATIONS.md](OPERATIONS.md) | M5 | HEAD, index tree, commit, identity, and response-loss reconciliation evidence |
| TDEV-FUN-022 | The Agent MUST support exact fetch and fast-forward-only push through local credentials and MUST reconcile an ambiguous provider response by reading authoritative refs before retry. | [OPERATIONS.md](OPERATIONS.md) | M7 | local and remote ref observations plus provider failure evidence |
| TDEV-FUN-023 | The Agent MUST discover and execute digest-bound ValidationProfiles against an exact source and return passed, failed, or indeterminate domain verdicts separately from Task execution failure. | [OPERATIONS.md](OPERATIONS.md) | M6 | profile, source digest, parsed checks, and output-completeness evidence |
| TDEV-FUN-024 | The Agent MUST execute only registered digest-bound ProcessProfiles with typed parameters, declared effects, bounded output, approval, and explicit termination uncertainty. | [OPERATIONS.md](OPERATIONS.md) | M6 | profile resolution, approval, process termination, and mutation evidence |
| TDEV-FUN-025 | The product MUST store bounded results and immutable Artifact metadata and MUST map typed evidence to every mandatory Case acceptance and verification requirement before completion. | [PROTOCOL.md](PROTOCOL.md) | M1 | EvidenceSet ownership, digest, layer, and completion validation |
| TDEV-FUN-026 | The product MUST expose a stable authenticated MCP endpoint and versioned current catalog that a supported client can use for the complete first-release development scenario. | [DEPLOYMENT.md](DEPLOYMENT.md) | M10 | public endpoint behavior and current client-visible schema |
| TDEV-FUN-027 | The CLI MUST diagnose release, local installation, Cloudflare resources, active Edge, Agent service, authenticated connection, Workspace and Project state, public MCP, client schema, and recovery as separate layers. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | layered doctor observations from authoritative readers |
| TDEV-FUN-028 | Official setup MUST install and activate the expected Termux Agent service before enrollment and MUST verify the running service and authenticated connection. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | installed service identity, process, enrollment, and connection evidence |
| TDEV-FUN-029 | Setup MUST present the stable MCP endpoint, a securely handled deployment-scoped MCP credential, manual supported-client registration instructions, product probe, token rotation, and recovery commands without mutating client settings automatically. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | setup output, authentication probe, manual client registration, and rotation/recovery evidence |
| TDEV-FUN-030 | The public MCP adapter MUST preserve all twelve canonical semantic capabilities through the release-pinned `tools-v1` baseline; any Resource, Task, or elicitation projection MUST remain additive and MUST NOT create a second lifecycle owner. | [MCP.md](MCP.md) | M1 | projection manifest, semantic mapping, and owner-boundary evidence |
| TDEV-FUN-031 | An optional MCP extension MUST activate only when the release implements and advertises it and the current client declares the required capability; a user prompt MUST NOT substitute for client support, and absence MUST select baseline behavior or a typed missing-capability result. | [MCP.md](MCP.md) | M10 | public request capability, server declaration, fallback, and current-client observations |

### 7.2 Security and privacy requirements

| Requirement | Product-level requirement | Detailed owner | First gate | Required evidence |
| --- | --- | --- | --- | --- |
| TDEV-SEC-001 | Cloudflare API Tokens, the Deployment Owner Key, Agent private keys, MCP bearer tokens, and Git provider credentials MUST remain distinct credentials with distinct owners and uses. | [SECURITY.md](SECURITY.md) | M2 | credential-flow review and secret-negative fixtures |
| TDEV-SEC-002 | A Cloudflare API Token MUST remain in the local CLI profile and MUST NOT enter Worker code, Durable Object state, Agent dispatch, Task input, argv, Event, log, checkpoint, Artifact, or report. | [SECURITY.md](SECURITY.md) | M8 | redacted persistence and process-input inspection |
| TDEV-SEC-003 | Git provider credentials MUST remain on the terminal host and MUST NOT be serialized into cloud Operation or Case state. | [SECURITY.md](SECURITY.md) | M7 | Task and cloud-state secret-negative evidence |
| TDEV-SEC-004 | The Worker MUST authenticate MCP requests with a deployment-scoped bearer token, support bounded-overlap rotation, and reveal no unauthorized resource existence. | [SECURITY.md](SECURITY.md) | M8 | authentication, rotation, and denial observations |
| TDEV-SEC-005 | Agent enrollment MUST bind a single-use expiring grant to the intended deployment and public key and MUST reject replay, expiry, wrong-key, and wrong-deployment use. | [SECURITY.md](SECURITY.md) | M2 | negative enrollment and atomic grant-consumption tests |
| TDEV-SEC-006 | Every Agent connection MUST prove private-key possession over fresh challenge material before it can become the current live connection. | [SECURITY.md](SECURITY.md) | M2 | nonce, transcript, signature, and replay-rejection evidence |
| TDEV-SEC-007 | Every effect MUST be permitted by the intersection of observed Agent capability, current Workspace policy, immutable Case grant, Operation requirements, and exact Task preconditions. | [SECURITY.md](SECURITY.md) | M3 | admission and narrowed-local-policy denial evidence |
| TDEV-SEC-008 | The Agent MUST contain filesystem effects to the selected root and allowed subpaths and MUST reject traversal, disallowed symlink or mount escape, root replacement, and noncanonical paths before effect. | [SECURITY.md](SECURITY.md) | M3 | real-filesystem containment and unchanged-outside-target evidence |
| TDEV-SEC-009 | AgentDO and CaseDO MUST reject stale epochs, wrong fencing tokens, revoked generations, mismatched identities, and late results that are not authorized under the current connection. | [SECURITY.md](SECURITY.md) | M2 | old-connection and wrong-fencing rejection evidence |
| TDEV-SEC-010 | The Agent MUST revalidate local target identity, policy, capability, profile digest, and preconditions immediately before an effect even when cloud admission succeeded. | [SECURITY.md](SECURITY.md) | M3 | policy-narrowing and target-replacement race evidence |
| TDEV-SEC-011 | Secret-like values MUST be redacted before durable output storage; possible unredacted persistence MUST be treated as an incident and not as clean completion. | [SECURITY.md](SECURITY.md) | M6 | captured-output, Event, Artifact, error, and report inspection |
| TDEV-SEC-012 | Cloud results MUST minimize disclosure of absolute local paths, environment values, and unrelated target information; D1 locators and public responses MUST NOT become local filesystem authority. | [SECURITY.md](SECURITY.md) | M3 | response-shape and locator-authorization negative evidence |
| TDEV-SEC-013 | User-facing setup and documentation MUST state that same-UID Termux execution is a permission policy boundary and not a kernel sandbox. | [SECURITY.md](SECURITY.md) | M8 | clean-host setup output and documentation observation |
| TDEV-SEC-014 | The Agent private key MUST remain in restrictive Agent-local storage; cloud state MUST contain only the public identity, enrollment and revocation metadata, and bounded signed observations required by the protocol. | [SECURITY.md](SECURITY.md) | M2 | local-secret inspection and cloud-state secret-negative evidence |
| TDEV-SEC-015 | The Deployment Owner private key MUST remain in the CLI local secret store; the deployment MUST receive only the public key and generation needed to validate enrollment grants. | [SECURITY.md](SECURITY.md) | M8 | local profile, deployed public-key metadata, and secret-negative persistence evidence |

### 7.3 Lifecycle and recovery requirements

| Requirement | Product-level requirement | Detailed owner | First gate | Required evidence |
| --- | --- | --- | --- | --- |
| TDEV-LCM-001 | A release MUST identify one coherent compatible set of Edge bundle, CLI, Agent, installer, schemas, migrations, and compatibility metadata through an immutable release manifest. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | manifest and selected asset digest evidence |
| TDEV-LCM-002 | Setup and lifecycle mutations MUST journal durable stage intent and receipts and MUST resume from authoritative state after interruption or response loss. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | failure-injected journal and no-duplicate-resource evidence |
| TDEV-LCM-003 | Deployment discovery MUST use exact non-secret deployment identity and compatibility checks and MUST stop on a partial or conflicting deployment rather than normalize by name. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | discovery conflict and exact-resource observations |
| TDEV-LCM-004 | Upgrade MUST verify release cohesion, protocol ranges, stored-schema migration preconditions, Agent compatibility, and recovery state before activation. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | inactive rehearsal, migration, compatibility, and activation evidence |
| TDEV-LCM-005 | Rollback MUST be permitted only to a compatible verified predecessor or an explicitly documented recovery path and MUST verify all affected layers after activation. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | predecessor identity, stored schema, Agent, endpoint, and public probe evidence |
| TDEV-LCM-006 | Reinstallation SHOULD reuse the selected Cloudflare profile, verified deployment, stable endpoint, MCP credential, Agent identity when present, and target registrations instead of duplicating them. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | reinstall identity and end-to-end probe evidence |
| TDEV-LCM-007 | `tdev uninstall` MUST remove selected local binaries, service definitions, and transient caches while preserving cloud deployment and Cloudflare authentication profiles by default. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | before/after local and cloud ownership observation |
| TDEV-LCM-008 | `tdev destroy` MUST remove only the exact selected deployment's owned Cloudflare resources after dependency checks and MUST preserve unrelated resources and local authentication profiles by default. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | exact resource deletion and unrelated-resource preservation evidence |
| TDEV-LCM-009 | `tdev auth forget` MUST remove one local Cloudflare credential profile without deleting remote resources and MUST report affected management access. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | local profile and unchanged-cloud observation |
| TDEV-LCM-010 | Agent replacement MUST prove the new enrolled connection and perform explicit Workspace rebinding and Attempt reconciliation before normal revocation of the old Agent. | [SECURITY.md](SECURITY.md) | M9 | replacement sequence and target-binding evidence |
| TDEV-LCM-011 | Recovery after Termux data loss MUST distinguish recoverable cloud identity from unrecoverable local secrets and MUST require new enrollment and Workspace rebinding when Agent identity is absent. | [DEPLOYMENT.md](DEPLOYMENT.md) | M9 | recovery drill and new-identity observations |
| TDEV-LCM-012 | Unsupported hosts and architectures MUST stop before modifying local or cloud state. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | unsupported-host preflight and unchanged-state evidence |
| TDEV-LCM-013 | The first public release MUST provide either a viable verified predecessor for rollback or a documented first-release recovery path that does not claim unavailable rollback. | [MVP.md](MVP.md) | Release | release qualification and recovery rehearsal evidence |

### 7.4 Quality and operational requirements

| Requirement | Product-level requirement | Detailed owner | First gate | Required evidence |
| --- | --- | --- | --- | --- |
| TDEV-NFR-001 | Every durable fact MUST have one canonical owner, and a projection, cache, Event log, Artifact object, or client response MUST NOT become a parallel writer of that fact. | [ARCHITECTURE.md](ARCHITECTURE.md) | M0 | ownership review and stale-projection negative evidence |
| TDEV-NFR-002 | Canonical intent and exact preconditions MUST become durable before dispatching an external effect. | [ARCHITECTURE.md](ARCHITECTURE.md) | M1 | transaction-before-dispatch observation |
| TDEV-NFR-003 | A canonical state transition and its audit Event MUST commit atomically under the owning revision. | [PROTOCOL.md](PROTOCOL.md) | M1 | transactional state and Event evidence |
| TDEV-NFR-004 | Request submission, dispatch delivery, result delivery, and retry control MUST be idempotent at their defined identities and MUST NOT duplicate an effect after a lost response. | [PROTOCOL.md](PROTOCOL.md) | M2 | response-loss, duplicate-delivery, and effect-count evidence |
| TDEV-NFR-005 | A possible but unobserved external effect MUST remain typed uncertainty until authoritative reconciliation establishes the outcome. | [PROTOCOL.md](PROTOCOL.md) | M1 | unverified-state and later-reconciliation evidence |
| TDEV-NFR-006 | Public tools, Agent Operations, setup stages, process execution, logs, Artifacts, pagination, waits, and retention work MUST have explicit enforceable bounds. | [PROTOCOL.md](PROTOCOL.md) | M1 | boundary and truncation observations |
| TDEV-NFR-007 | Every write or effect MUST be fenced by exact target identity and the applicable revision, digest, object ID, permission, deadline, and cancellation boundary. | [PROTOCOL.md](PROTOCOL.md) | M1 | stale-precondition and unauthorized-effect rejection evidence |
| TDEV-NFR-008 | Canonical Case and Agent delivery state MUST survive Worker restart, Durable Object hibernation, client disconnect, and ordinary Agent reconnect without requiring event replay as the primary current-state source. | [ARCHITECTURE.md](ARCHITECTURE.md) | M2 | restart, hibernation, disconnect, and reconnect observation |
| TDEV-NFR-009 | The reference Agent MUST serialize high-cost execution with one slot in the first release; additional parallelism requires measured ordering and resource invariants. | [ARCHITECTURE.md](ARCHITECTURE.md) | M2 | controlled queue and device resource evidence |
| TDEV-NFR-010 | Every canonical wire contract implemented or consumed by both TypeScript Edge components and Go CLI/Agent components MUST have equivalent accept/reject behavior and canonical bytes and typed digests. Edge-only MCP projection metadata and capability mappings MUST remain TypeScript-owned and MUST NOT require a Go mirror. | [PROTOCOL.md](PROTOCOL.md) | M0 | declared language targets, shared cross-language fixtures, and generated-diff evidence |
| TDEV-NFR-011 | A typed Operation MUST NOT silently fall back to arbitrary shell, a broader profile, or an untyped command surface. | [OPERATIONS.md](OPERATIONS.md) | M3 | catalog, dispatch, and forbidden-fallback evidence |
| TDEV-NFR-012 | Completion MUST be evaluated independently for contract, source, validation, package, installation, cloud resources, active Edge, Agent, public MCP, client schema, and recovery layers when affected. | [MVP.md](MVP.md) | Release | layer-specific authoritative observations |
| TDEV-NFR-013 | Skipped, unsupported, unavailable, contaminated, truncated, stale, or unexecuted evidence MUST NOT be reported as clean evidence. | [MVP.md](MVP.md) | M0 | negative fixture and completion-gate evidence |
| TDEV-NFR-014 | Public and stored schemas MUST be versioned; breaking changes require compatibility analysis, migration, old-reader and old-writer behavior, and a rollback-compatible predecessor or explicit rollback barrier. | [PROTOCOL.md](PROTOCOL.md) | M1 | version negotiation and migration/rollback fixtures |
| TDEV-NFR-015 | Source, target, index, remote refs, processes, cloud resources, credentials, routes, and generated data outside the authorized scope MUST remain unchanged. | [MVP.md](MVP.md) | M3 | complete before/after scope observation |
| TDEV-NFR-016 | Audit and diagnostic output MUST identify the relevant entity, transition, causation, correlation, revision, freshness, and evidence source without making logs a second canonical owner. | [PROTOCOL.md](PROTOCOL.md) | M1 | Event and diagnostic response observation |
| TDEV-NFR-017 | The implementation MUST isolate host-specific behavior behind the Termux adapter and MUST NOT claim another host from compile-only or generic Linux evidence. | [ARCHITECTURE.md](ARCHITECTURE.md) | M3 | reference-host and dependency-boundary evidence |
| TDEV-NFR-018 | Artifact and Event retention or cleanup MUST preserve every object referenced by canonical evidence, active recovery, migration, or rollback state. | [ARCHITECTURE.md](ARCHITECTURE.md) | M1 | reference-aware cleanup and orphan-handling evidence |
| TDEV-NFR-019 | The first release MUST use measured bounded defaults for heartbeat, lease, output, Artifact, retention, and Android background behavior; no unmeasured value may be presented as a reliability guarantee. | [MVP.md](MVP.md) | Release | measurement record and reference-host qualification |
| TDEV-NFR-020 | The first release makes no fixed public latency or availability SLA; unavailable or offline components MUST be represented explicitly and MUST NOT be hidden by stale cached success. | [ARCHITECTURE.md](ARCHITECTURE.md) | Release | offline, stale-cache, and availability-state observations |
| TDEV-NFR-021 | The current client-visible schema MUST be verified separately from server publication, and a stale client MUST produce an explicit refresh-required or unsupported result rather than a false success. | [MVP.md](MVP.md) | M10 | actual client schema and behavior observation |
| TDEV-NFR-022 | Release builds and selected assets MUST be reproducible or independently digest-verifiable as declared by the release manifest. | [DEPLOYMENT.md](DEPLOYMENT.md) | M8 | build provenance, manifest, and asset digest evidence |

## 8. Product error, cancellation, and uncertainty semantics

The first release distinguishes these product-level outcomes:

| Class | Meaning | Canonical consequence |
| --- | --- | --- |
| Transport rejection | The request did not reach a determinable canonical transition, such as invalid transport, authentication failure, or oversized input. | No Case or Task transition is inferred. |
| Admission rejection | The request was understood but its schema, lifecycle, authority, capability, target, or exact precondition did not permit Task creation. | No Task is created. |
| Durable Task failure | A Task was admitted and later reached a known typed failure with no unresolved external effect. | The failure is canonical Task state. |
| Domain verdict | A validation or process ran successfully as an Operation but reported failed checks or a nonzero exit. | The Task may succeed while its typed domain result is non-passing. |
| Cancellation requested | A caller requested cancellation, but execution or an external effect may still exist. | Cancellation intent is durable; terminal outcome waits for reconciliation. |
| Cancelled | The required cancellation and effect observations converged. | A terminal cancelled outcome is recorded with evidence. |
| Unverified | The external effect cannot be established. | Typed uncertainty remains visible and blocks claims that require certainty. |
| Completed | Every required terminal prerequisite and evidence mapping is satisfied. | The Case is terminal and immutable. |

Exact error envelopes and state transitions are owned by [PROTOCOL.md](PROTOCOL.md); Operation-specific failures are owned by [OPERATIONS.md](OPERATIONS.md).

## 9. Data placement, privacy, and retention

Product data is placed according to canonical ownership:

- CaseDO owns Case, Task, Attempt, decisions, current state, evidence metadata, Artifact metadata, and transactional audit Events.
- AgentDO owns enrollment, revocation generation, connection epoch, durable queue, delivery receipts, and current capability observations.
- D1 owns bounded locator and deployment-index projections only; a stale D1 row cannot authorize an effect.
- R2 owns immutable Artifact bytes only; bytes without matching canonical metadata are not valid evidence.
- The Agent owns absolute Workspace paths, exact local root identity, local policy records, local profiles, local provider credential use, and local operating-system observations.
- The CLI owns local Cloudflare authentication profiles, deployment manifest, setup journal, and recovery metadata.

The cloud MUST receive only the local information required by typed contracts. Absolute local paths are omitted by default. Secret values are excluded before persistence. Exact retention periods remain evidence-gated, but cleanup MUST be reference-aware and MUST NOT remove data required by active Cases, evidence, migration, rollback, or recovery.

## 10. Product-level non-goals

The first release does not include:

- a centralized tdev SaaS account or shared vendor Cloudflare account;
- a local MCP server, inbound terminal port, ngrok, or another tunnel subsystem;
- an unrestricted remote shell Operation or arbitrary executable/argv/environment input;
- a Linux or other desktop/server support claim;
- multi-Agent scheduling, placement, or migration of a running Attempt between Agents;
- WorkspaceDO or ProjectDO without a demonstrated serialization invariant;
- automatic mutation of ChatGPT or another client's settings;
- repository creation or pull request, issue, release, or Actions management;
- file deletion, file move, or Git worktree lifecycle Operations;
- Workspace or Project unregistration/removal until a lifecycle design defines active-Case handling, record preservation, and filesystem non-deletion semantics;
- package installation, service control, or runtime deployment as ordinary MCP development Operations;
- custom domains in the default setup path;
- force push, remote ref deletion, or speculative retry after a possible external effect;
- encrypted credential export or Agent private-key backup without an accepted threat model;
- a generic policy language, plugin system, or telemetry platform;
- a fixed availability, latency, retention, or battery guarantee before measurement;
- completion based only on a queue status, process exit, test result, build result, push response, or notification.

A non-goal can be reopened only through an accepted design that names the owner, compatibility, security, migration, rollback, and verification impact.

## 11. First-release acceptance scenarios

The first public release is accepted only when every requirement below is demonstrated on the authoritative reference layers. These scenarios aggregate the detailed milestone acceptance in [MVP.md](MVP.md); they do not replace it.

| Requirement | Product-level requirement | Detailed owner | First gate | Required evidence |
| --- | --- | --- | --- | --- |
| TDEV-ACC-001 | A clean supported Termux installation MUST verify and install the expected CLI and Agent release without a source toolchain. | [DEPLOYMENT.md](DEPLOYMENT.md) | Release | clean reference-host installation and asset digest evidence |
| TDEV-ACC-002 | Setup MUST create or reuse the exact user-owned Cloudflare deployment and MUST resume from every injected stage failure without duplicate resources. | [DEPLOYMENT.md](DEPLOYMENT.md) | Release | setup journal, resource inventory, and failure-injection evidence |
| TDEV-ACC-003 | An Agent MUST enroll, reconnect, negotiate a compatible protocol, and remain fenced against replayed, revoked, or stale identities. | [SECURITY.md](SECURITY.md) | Release | enrollment and reconnect negative/positive observations |
| TDEV-ACC-004 | A Workspace and Project MUST register with exact local identity and policy, and invalid traversal, symlink escape, root replacement, or broader authority MUST leave outside state unchanged. | [SECURITY.md](SECURITY.md) | Release | real reference-host containment and authority evidence |
| TDEV-ACC-005 | A supported MCP client MUST discover the bounded tdev catalog through the active projection, create a Case, submit a read-only Operation, and query the same durable Task after client disconnect, Worker restart, and DO hibernation. | [MVP.md](MVP.md) | Release | public MCP projection, canonical state, and current client-schema evidence |
| TDEV-ACC-006 | Lost request, dispatch, and result responses and an Agent disconnect MUST reconcile without duplicate Task or external effect, and a stale epoch result MUST be rejected. | [MVP.md](MVP.md) | Release | fault injection, Task count, receipt, target, and fencing evidence |
| TDEV-ACC-007 | Exact file observation and mutation MUST enforce path, policy, before-state, expected-after, output, and unrelated-file boundaries. | [OPERATIONS.md](OPERATIONS.md) | Release | file result, digest, and outside-scope observations |
| TDEV-ACC-008 | Git status, review, staging, commit, fetch, and fast-forward push MUST preserve exact HEAD, index, identity, remote, and unrelated-ref boundaries and reconcile lost responses. | [OPERATIONS.md](OPERATIONS.md) | Release | local repository and authoritative remote-ref evidence |
| TDEV-ACC-009 | Validation and ProcessProfiles MUST be digest-bound, bounded, approval-aware, and able to distinguish domain verdict, execution failure, cancellation, and unverified termination. | [OPERATIONS.md](OPERATIONS.md) | Release | profile, source, output, process, approval, and uncertainty evidence |
| TDEV-ACC-010 | One Case MUST complete the public development scenario of discovery, read, exact edit, review, validation, stage, commit, fast-forward push, remote verification, and evidence mapping through the release-pinned projection and current client-visible schema. | [MVP.md](MVP.md) | Release | complete public end-to-end Case and remote observation |
| TDEV-ACC-011 | Reinstallation MUST reuse the verified deployment, endpoint, credential, and Agent identity when present and MUST explicitly recover or replace missing local secrets and bindings. | [DEPLOYMENT.md](DEPLOYMENT.md) | Release | reinstall and data-loss recovery drill evidence |
| TDEV-ACC-012 | Uninstall, destroy, authentication-profile removal, Agent replacement, Agent revocation, upgrade, rollback, and diagnosis MUST have distinct tested effects and preservation boundaries. | [DEPLOYMENT.md](DEPLOYMENT.md) | Release | before/after lifecycle observations and recovery evidence |
| TDEV-ACC-013 | Security qualification MUST demonstrate credential separation, replay resistance, least authority, local revalidation, path containment, secret redaction, token rotation, and the documented same-UID limitation. | [SECURITY.md](SECURITY.md) | Release | security acceptance suite and persisted-output inspection |
| TDEV-ACC-014 | Source, generated contracts, package assets, installation, migrations, active Edge, Agent service, authenticated connection, Workspace/Project state, public MCP, client schema, and rollback/recovery MUST be verified independently when affected. | [MVP.md](MVP.md) | Release | complete layered release evidence matrix |
| TDEV-ACC-015 | An unsupported host, incompatible release, conflicting deployment, failed mandatory reference-host gate, or unresolved possible secret persistence MUST block public release. | [MVP.md](MVP.md) | Release | release-gate rejection and preserved-state evidence |

## 12. Requirement traceability and change rules

The requirement catalog is the product-level traceability source. Every `TDEV-*` row MUST contain:

- one unique stable identifier;
- one normative product outcome or constraint;
- one linked detailed owner;
- one first milestone or `Release` gate;
- one nonempty evidence class.

The repository governance gate MUST reject duplicate identifiers, unknown requirement categories, empty columns, missing detailed-owner links, unsupported gates, or a first-release category with no requirements.

Traceability does not transfer ownership. The linked owner defines exact records, schemas, algorithms, transitions, effects, threats, setup stages, and verification procedures. [MVP.md](MVP.md) sequences implementation and release qualification. [WORKBOARD.md](../WORKBOARD.md) reports only current state and active pointers.

Public schemas are versioned. Additive fields are not automatically compatible. A breaking public or stored-state change requires protocol compatibility, migration, old-reader and old-writer behavior, and rollback analysis. A new durable owner, fallback, background task, dependency, public surface, support target, or verification method requires an accepted design before implementation.

## 13. Evidence-gated product decisions

The following are engineering experiments, not unresolved product-preference questions:

- inline response and Artifact byte defaults;
- Event, Artifact, receipt, and journal retention values;
- Agent heartbeat, connection lease, and enrollment-grant expiry defaults;
- Android wake-lock, foreground notification, restart, and battery defaults;
- release bootstrap signature or trust mechanism available on a clean supported Termux installation;
- safe cheap-read parallelism on the reference device;
- whether demonstrated multi-Case contention justifies a WorkspaceDO or ProjectDO;
- whether measured client behavior requires stricter public payload or pagination bounds;
- the exact final MCP revision and projection digest for the first public release;
- whether the current supported client declares Resources, Tasks, or elicitation capabilities;
- whether a future reduced Tool projection improves behavior while preserving all twelve semantic capabilities and rollback;
- whether a future standalone TypeScript CLI or Agent replacement can meet clean-host installation, startup, memory, artifact-size, process-tree cancellation, long-lived connection, Android background, storage durability, cryptography, upgrade, and rollback gates without changing public or persisted contracts.

Each decision requires measurements, a named owner update, acceptance evidence, and compatibility/rollback analysis when applicable. Until then it remains explicit unknown or bounded configuration and cannot be represented as a completed guarantee.

## 14. Normative document map

| Document | Sole responsibility |
| --- | --- |
| `SPEC.md` | Product definition, first-release scope, terminology, supported environment, product-level functional/security/lifecycle/quality requirements, non-goals, acceptance, and traceability |
| `ARCHITECTURE.md` | Component ownership, data placement, dependencies, dispatch topology, concurrency, repository shape, and architectural failure boundaries |
| `MCP.md` | MCP wire revision, deterministic projection manifest, Tool/Resource/extension mapping, client capabilities, and current-client compatibility |
| `PROTOCOL.md` | Canonical tdev schemas, identifiers, digests, semantic inputs/results, Case/Task/Attempt states, dispatch, errors, Events, evidence records, and domain compatibility |
| `OPERATIONS.md` | Agent Operation catalog, profile contracts, effects, approvals, retry/reconciliation, operation-specific inputs, results, failures, and evidence |
| `SECURITY.md` | Trust boundaries, credentials, Agent identity and enrollment, Workspace and Project authority, paths, secrets, threat handling, and security acceptance |
| `DEPLOYMENT.md` | Installer, setup, Cloudflare identity and resources, release cohesion, migrations, upgrade, rollback, lifecycle commands, and recovery |
| `MVP.md` | Milestone order, vertical slices, test strategy, fault injection, acceptance evidence, release qualification, and evidence-gated follow-up |

A fact is defined by one owner and linked elsewhere. A conflict between owner documents stops the dependent change and is resolved explicitly under [SDD.md](../SDD.md); it is never normalized by an implementation fallback.
