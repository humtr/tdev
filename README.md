# Terminal Developer

> Status: the M0 schema and pure-domain foundation is implemented on the current development branch. No Cloudflare deployment, Agent runtime, product installation, or release is claimed yet.

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

A **Case** is the durable authority for one outcome-oriented development undertaking. `CaseDO` owns its immutable contract, target grants, Native MCP Tasks, Attempts, approvals, inputs, evidence, and terminal outcome. `AgentDO` owns Agent enrollment, connection, epoch, queue, and fencing. The terminal Agent alone performs local operating-system effects.

## M0 development commands

The checked-in M0 foundation uses Go 1.26 or newer and Node.js 26 or newer. It has no third-party runtime dependencies.

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

1. [Product specification](docs/SPEC.md)
2. [Architecture and ownership](docs/ARCHITECTURE.md)
3. [Protocol and state model](docs/PROTOCOL.md)
4. [Operation contracts](docs/OPERATIONS.md)
5. [Security and authority](docs/SECURITY.md)
6. [Installation, deployment, and lifecycle](docs/DEPLOYMENT.md)
7. [MVP and verification plan](docs/MVP.md)

Each document declares the facts it owns. A contract should be defined once and linked elsewhere rather than independently copied.

## Important boundaries

- No local MCP server or tunnel subsystem.
- No unrestricted remote shell Operation.
- No centralized tdev SaaS account.
- Cloudflare API Tokens remain in the local CLI profile and are not sent to the Worker or Agent.
- Git provider credentials remain on the terminal host.
- Workspace policy is a product permission boundary, not a kernel sandbox.
- Unknown external effects remain explicitly unverified until reconciled.
- WorkspaceDO and ProjectDO are deferred until an observed coordination invariant requires them.

## Next implementation gate

M0 is the source-level schema and pure-domain foundation. The next product gate is an accepted M1 design for CaseDO SQLite storage, transactions, request dedupe, public control/query, Events, evidence, migration, and rollback behavior. M2 AgentDO connection/queue work and the M3 `file.read` vertical slice follow the milestone order in [MVP.md](docs/MVP.md). Current implementation state and blocking unknowns are listed only in [WORKBOARD.md](WORKBOARD.md).
