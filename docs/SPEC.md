# Terminal Developer Product Specification

> Status: normative product contract. Current implementation stage and active design work are routed through [WORKBOARD.md](../WORKBOARD.md) and [MVP.md](MVP.md).
>
> Authority: this document owns the product definition, product scope, canonical terminology, non-goals, and product-level acceptance. Architecture, protocol, operations, security, deployment, and verification details are owned by the linked documents and must not be redefined here.

## 1. One-line definition

**tdev (Terminal Developer) is a durable development control plane that lets an MCP client coordinate verified development work through Cloudflare while a user-owned terminal Agent performs bounded filesystem, Git, validation, process, installation, and runtime effects.**

## 2. Product problem

A conversational client can make good development decisions but is not a durable execution owner. A terminal can perform real effects but should not be exposed as an unrestricted remote shell. Long-running development also crosses failures that ordinary request/response tools do not own:

- client disconnects and session replacement;
- mobile process suspension and network loss;
- repeated or ambiguous submissions;
- partial external effects;
- approvals and additional user input;
- exact filesystem and Git preconditions;
- evidence retention and result verification;
- installation, activation, routing, rollback, and recovery.

tdev provides one explicit contract and one canonical transition path for those facts.

## 3. Current product contract

The product MUST provide:

1. A durable top-level **Case** aggregate identified by `caseId`.
2. An immutable `CaseContract` containing objective, acceptance, verification requirements, non-goals, constraints, and target grants.
3. Native MCP Tasks representing admitted semantic Operations.
4. Attempts representing individual Agent execution attempts.
5. A `CaseDO` as the canonical owner of Case, Task, Attempt, approval, input, checkpoint, result acceptance, evidence mapping, and terminal outcome.
6. An `AgentDO` as the canonical owner of one Agent connection, lease, epoch, queue, fencing, and dispatch relay.
7. A user-owned `tdev-agent` that alone performs local operating-system effects.
8. Exact target identity, revision, digest, permission, deadline, output, cancellation, and retry boundaries.
9. Typed Operation contracts rather than an unrestricted remote shell surface.
10. Durable ambiguity: an unknown external effect MUST remain observable and MUST NOT be converted into success, failure, or cancellation without evidence.
11. Independent completion evidence for every affected layer requested by a Case.
12. A resumable installation and setup flow that deploys into the user's own Cloudflare account.

## 4. Canonical terminology

### 4.1 Case

A **Case** is the durable authority and record for one outcome-oriented development undertaking. It can contain multiple Tasks and can target multiple Workspaces or Projects when its immutable grants permit that.

A Case owns:

- one immutable `CaseContract`;
- immutable `CaseTargetGrant` records;
- mutable canonical Case state;
- Native MCP Tasks;
- Attempts;
- approval and input requests;
- checkpoints;
- evidence and Artifact references;
- one terminal outcome.

The canonical names are:

```text
CaseDO(caseId)
CaseContract
CaseTargetGrant
case.*
```

### 4.2 Task

A **Task** is one durably admitted semantic Operation and its canonical result. A Task can have more than one Attempt, but only one nonterminal Attempt at a time and only one terminal semantic result.

### 4.3 Attempt

An **Attempt** is one actual Agent execution attempt for a Task. Dispatch uncertainty is reconciled against the same `attemptId`; it does not silently create a new Attempt.

### 4.4 Agent

An **Agent** is a user-controlled terminal execution identity. Agent identity, capability, and online connection state are separate facts.

### 4.5 Workspace

A **Workspace** is an Agent-managed local filesystem boundary with an exact root identity and a typed policy. It can contain zero or more Projects.

### 4.6 Project

A **Project** is a registered development target within a Workspace, normally a Git checkout. A Project remote is optional; absence is represented by field absence, never an empty string.

### 4.7 Operation

An **Operation** is a versioned semantic action with typed targets, required effects, input schema, result schema, failure schema, retry policy, cancellation policy, and approval policy.

### 4.8 Artifact and evidence

An **Artifact** is bounded content stored outside the canonical state row. **Evidence** is a typed reference that supports an acceptance or verification claim. A Task terminal status is not by itself evidence for unrelated layers.

## 5. Host scope

### 5.1 Claimed implementation target

The only implementation and release target currently claimed is:

```text
Termux on Android ARM64
```

Termux is the reference host for installation, service management, filesystem behavior, Git integration, process execution, power constraints, and end-to-end acceptance.

### 5.2 Reserved adapter boundary

The repository MAY contain an unimplemented `agent/hosts/linux/` adapter boundary so the core contract does not acquire Termux-specific dependencies. Its presence does not claim Linux support.

No other desktop or server operating system is currently part of the product contract or roadmap statement.

## 6. Fixed technology decisions

The selected stack is:

```text
Cloudflare Worker and Durable Objects   TypeScript
CLI                                      Go
Agent core and Termux adapter            Go
Canonical schemas                        JSON Schema 2020-12
Generated protocol types                 TypeScript and Go
Bootstrap installer                      POSIX shell
```

The canonical JSON Schemas are the sole owner of external data contracts. TypeScript types, Go types, MCP-compatible schemas, documentation tables, and test vectors are derived representations and MUST be checked for drift.

## 7. Product topology

The product consists of:

- a stateless Cloudflare Worker for authentication, routing, bounded public MCP tools, and resource lookup;
- one `CaseDO` per Case;
- one `AgentDO` per Agent identity;
- D1 for small locator and deployment index records only;
- R2 for large Artifact bytes only;
- a Go CLI for setup, deployment, lifecycle, diagnosis, and local management;
- a Go Agent for filesystem, Git, validation, process, installation, and runtime effects.

The canonical ownership and dependency rules are defined in [ARCHITECTURE.md](ARCHITECTURE.md).

## 8. Public MCP product surface

The public MCP surface MUST separate queries, Case control, Task control, and Agent Operations. A Case lifecycle transition MUST NOT be represented as a new Native Task.

The fixed control/query surface is:

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

Notifications are exposed separately and do not determine Operation completion.

The exact schemas and state transitions are defined in [PROTOCOL.md](PROTOCOL.md).

## 9. Product security model

The product is not a kernel sandbox. The Agent runs under the user's existing Termux identity. Security is enforced through layered least authority:

```text
AgentCapability
intersection WorkspacePolicy
intersection CaseTargetGrant
intersection Operation required effects
intersection exact Task preconditions
```

The product MUST:

- keep Cloudflare deployment credentials out of Worker, Durable Object, Agent Task, argv, log, checkpoint, and Artifact payloads;
- keep Git provider credentials on the terminal host;
- prevent path traversal and disallowed symlink escape;
- distinguish Agent identity from current capability;
- use challenge-response proof of Agent private-key possession;
- use connection epochs and fencing tokens;
- use explicit approvals for risk classes that require them;
- redact secrets before durable output storage.

The detailed trust model is defined in [SECURITY.md](SECURITY.md).

## 10. Installation and deployment contract

The official installation entry point is:

```sh
curl -fsSL \
  https://github.com/humtr/tdev/releases/latest/download/install.sh \
  | sh
```

The installer is a small bootstrapper. It detects the supported host and architecture, verifies an immutable release manifest and selected assets, installs the Go CLI, and transfers control to `tdev setup`.

`tdev setup` MUST be resumable, idempotent at every stage, and able to discover and reuse a verified existing deployment. It MUST deploy into the user's Cloudflare account and MUST NOT require Node.js, npm, Wrangler, or a source build on the Termux host.

The deployment and lifecycle contract is defined in [DEPLOYMENT.md](DEPLOYMENT.md).

## 11. Product-level non-goals

The first product contract does not include:

- a centralized tdev SaaS account or shared vendor Cloudflare account;
- a local MCP server;
- an ngrok or other tunnel subsystem;
- an unrestricted remote shell Operation;
- Linux support claims;
- multi-Agent scheduling or migration of a running Attempt between Agents;
- WorkspaceDO or ProjectDO without a demonstrated coordination invariant;
- automatic registration inside a user's ChatGPT settings;
- GitHub repository, pull request, issue, release, or Actions management in the MVP;
- package installation or service control in the MVP Operation catalog;
- custom domains in the default setup path;
- silent fallback from a typed Operation to an untyped command;
- automatic replay of an Operation after an external effect may have started;
- completion claims based only on a queue status, process exit, test result, or notification.

## 12. Product invariants

The implementation MUST enforce at least the following:

1. One canonical owner exists for every durable fact.
2. `CaseContract` and `CaseTargetGrant` records are immutable.
3. Terminal Case, Task, and Attempt records never transition again.
4. A Task has at most one nonterminal Attempt.
5. A Task has exactly one terminal semantic result.
6. The same request ID maps only to the same semantic digest.
7. The same Attempt dispatch is idempotent.
8. Stale Agent epochs and fencing tokens cannot commit a result.
9. Unknown, skipped, unsupported, untested, contaminated, or truncated evidence is not clean evidence.
10. A completed Case maps every mandatory acceptance criterion to valid evidence.
11. A rolled-back Case has independently verified rollback evidence.
12. All canonical state changes and corresponding audit Events commit in the same CaseDO transaction.
13. D1 locator data never becomes a parallel lifecycle owner.
14. R2 bytes never become the owner of Case or Task state.
15. Optional identity fields use field absence or a typed variant, never an ambiguous empty value.

## 13. Product-level acceptance

The first releasable version is accepted only when all of the following are demonstrated on a clean Termux installation:

1. `install.sh` installs the expected CLI artifact without requiring a source toolchain.
2. `tdev setup` creates or reuses a verified deployment and can resume after interruption.
3. An Agent enrolls using a single-use grant and proof of private-key possession.
4. A Workspace and Project can be registered with exact local identity and typed policy.
5. An MCP client can create a Case and submit a read-only Operation.
6. The Task remains queryable after client disconnect, Worker restart, and Durable Object hibernation.
7. Agent disconnect and reconnect are reconciled without duplicate effects.
8. Stale epoch results are rejected.
9. Exact file, Git, validation, and process preconditions produce typed failures when false.
10. At least one complete development flow performs read, exact edit, validation, review, commit, and fast-forward push under one Case.
11. Reinstallation reuses the selected Cloudflare profile, deployment, Agent identity when present, endpoint, and MCP token.
12. Uninstall, destroy, credential removal, upgrade, rollback, and Agent replacement have distinct and tested meanings.
13. Required source, package, installation, runtime, public MCP, client schema, and recovery layers are verified independently when affected.

The detailed milestone and verification matrix is defined in [MVP.md](MVP.md).

## 14. Compatibility and change rules

- Public schemas are versioned.
- Additive fields are not automatically compatible; compatibility is declared by protocol negotiation and schema rules.
- A breaking public schema or stored-state change requires a migration and rollback plan.
- A new owner, fallback, background task, dependency, public surface, or support target requires an explicit design revision.
- A design decision invalidated by implementation evidence is reopened in its owner document before implementation continues.
- Generated code and documentation never override their canonical schema or owner document.

## 15. Evidence-gated decisions

The following are engineering experiments, not pending product-preference questions:

- the exact release-signature bootstrap mechanism available on a clean supported Termux installation;
- Android background, wake-lock, and notification defaults that provide reliable service without unacceptable battery cost;
- bounded log and Event retention values under measured Durable Object and R2 cost;
- safe output and Artifact defaults under measured MCP client limits;
- when a WorkspaceDO or ProjectDO becomes necessary under demonstrated concurrency.

Until measured, these remain explicit unknowns and cannot be represented as completed support.

## 16. Normative document map

| Document | Sole responsibility |
| --- | --- |
| `SPEC.md` | Product definition, scope, terminology, non-goals, product acceptance |
| `ARCHITECTURE.md` | Component ownership, data placement, dependencies, concurrency, repository shape |
| `PROTOCOL.md` | Canonical schemas, Case/Task/Attempt state machines, MCP control surface, dispatch, results, errors |
| `OPERATIONS.md` | Operation catalog, profile contracts, effects, approvals, retries, operation-specific evidence |
| `SECURITY.md` | Trust boundaries, Agent enrollment, Workspace policy, path safety, secrets, threat handling |
| `DEPLOYMENT.md` | Installer, setup state machine, Cloudflare identity, release, upgrade, rollback, lifecycle |
| `MVP.md` | Implementation slices, acceptance matrix, verification, release gates, deferred scope |

A fact should be defined in one owner document and linked elsewhere. If two owner documents appear to disagree, the conflict must be resolved explicitly; it must not be normalized by an implementation fallback.
