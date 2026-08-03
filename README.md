# Terminal Developer

> Status: architecture and protocol concept on the `concept` branch. No product implementation or release is claimed yet.

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

## Normative documents

Read these in order:

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

The first implementation gate is the schema and pure-domain foundation, followed by a complete `file.read` vertical slice through the final Worker, CaseDO, AgentDO, and Termux Agent path. See [MVP.md](docs/MVP.md) for the ordered acceptance plan.
