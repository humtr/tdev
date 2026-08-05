# Terminal Developer

> Status: the M0 schema and pure-domain foundation, repository governance, and Design 0004 source slices through the CaseDO control/query core are source-verified. The next product gate is the Worker semantic boundary. No Worker route, Cloudflare Durable Object runtime or hibernation, public MCP endpoint, current-client behavior, Agent runtime, product installation, rollback runtime, or release is claimed yet.

**tdev** is a durable development control plane that lets an MCP client coordinate verified development work through Cloudflare while a user-owned terminal Agent performs bounded filesystem, Git, validation, and process effects.

## Current target

The only claimed implementation target is **Termux on Android ARM64**. A Linux host-adapter directory may be reserved to keep the core host-neutral, but Linux support is not claimed.

## Selected stack

```text
Cloudflare Worker and Durable Objects   TypeScript
tdev CLI                                Go
tdev-agent                              Go
Canonical protocol schemas              JSON Schema 2020-12
Generated protocol types                TypeScript and Go
Bootstrap installer                     POSIX shell
```

## Core topology

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
```

A **Case** is the durable authority for one outcome-oriented development undertaking. `CaseDO` owns its immutable contract, target grants, canonical tdev Tasks, Attempts, approvals, inputs, evidence, and terminal outcome. An optional MCP Task handle is only a projection of that same Task. `AgentDO` owns Agent enrollment, connection, epoch, queue, and fencing. The terminal Agent alone performs local operating-system effects.

## Source development commands

The checked-in protocol, domain, and source-level CaseDO foundation uses Go 1.26 or newer and Node.js 26 or newer. It has no third-party runtime dependencies.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run generate
npm run check:generated
npm test
```

`protocol/schemas/tdev.v1.schema.json` is the canonical contract. Generated Go and TypeScript files are derivatives and must not be edited directly. See [protocol/README.md](protocol/README.md) for the implementation boundary.

## Repository workflow and normative documents

For any repository change, first read [AGENTS.md](AGENTS.md), [RULE.md](RULE.md), [SDD.md](SDD.md), [WORKBOARD.md](WORKBOARD.md), and the active record in the [design registry](docs/design/README.md). These files route work and govern change method; they do not replace product owners.

Then read the affected normative documents:

1. [Product specification and requirement traceability](docs/SPEC.md)
2. [Architecture and ownership](docs/ARCHITECTURE.md)
3. [MCP adapter and projection contract](docs/MCP.md)
4. [Protocol and state model](docs/PROTOCOL.md)
5. [Operation contracts](docs/OPERATIONS.md)
6. [Security and authority](docs/SECURITY.md)
7. [Installation, deployment, and lifecycle](docs/DEPLOYMENT.md)
8. [MVP and verification plan](docs/MVP.md)

Each document declares the facts it owns. A contract should be defined once and linked elsewhere rather than independently copied.

## Important boundaries

- No local MCP server or tunnel subsystem.
- The first-release `tools-v1` projection preserves twelve canonical tdev semantic capabilities; optional MCP projections are additive until current-client evidence supports a separately designed reduction.
- No unrestricted remote shell Operation.
- No centralized tdev SaaS account.
- Cloudflare API Tokens remain in the local CLI profile and are not sent to the Worker or Agent.
- Git provider credentials remain on the terminal host.
- Workspace policy is a product permission boundary, not a kernel sandbox.
- Unknown external effects remain explicitly unverified until reconciled.
- WorkspaceDO and ProjectDO are deferred until an observed coordination invariant requires them.

## Next implementation gate

The complete first-release product requirements and traceability are defined in [SPEC.md](docs/SPEC.md), and the public MCP projection is defined in [MCP.md](docs/MCP.md). Design 0004 has source-verified the protocol/proof foundation, CaseDO SQLite substrate, atomic admission/replay, and control/query core. The next implementation gate is the **Worker semantic boundary**: complete executable input and result schema roots for all twelve semantic capabilities, generate and verify the deterministic `tools-v1` mapping, and route the lossless ingress to the existing CaseDO boundary in one table-driven integration suite. M2 AgentDO connection/queue work and the M3 `file.read` vertical slice follow only after the remaining M1 live gates in [MVP.md](docs/MVP.md). Current implementation state and blocking unknowns are routed by [WORKBOARD.md](WORKBOARD.md).
