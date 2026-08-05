# tdev Workboard

## Current

- Product/source stage: M0 is source-verified. Design 0004 slices through the M1 CaseDO control/query core are source-verified in protocol, domain, and isolated SQLite source layers.
- Current source gate: the high-involvement foundation documents have been reconciled to the current source boundary before further implementation. No product source or runtime layer is changed by this documentation gate.
- Next product gate: implement the **Worker semantic boundary**. First complete strict executable input and result roots for all twelve `tools-v1` capabilities, then generate the deterministic projection and route lossless authenticated ingress to the final CaseDO boundary in one table-driven integration suite.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`
  - Next gate: Worker semantic boundary; Agent dispatch remains an M2 boundary.

## Blocking unknowns

- The executable schema lacks six read/query input roots and all twelve capability-specific result roots. This blocks a generated `tools-v1` projection and public output validation. Owners: [PROTOCOL.md](docs/PROTOCOL.md), [MCP.md](docs/MCP.md), and Design 0004.
- Actual Cloudflare Durable Object SQLite transaction, migration, hibernation, restart, and rollback behavior is unverified. Local SQLite evidence is source/storage evidence only. Owners: Design 0004 and [DEPLOYMENT.md](docs/DEPLOYMENT.md).
- The final MCP revision, authenticated public endpoint behavior, current-client Tool snapshot, and optional Resources, Tasks, or elicitation support are unverified. Owner: [MCP.md](docs/MCP.md).
- Runtime rollback remains unverified because no compatible active release or installed CaseDO schema exists. Owner: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- MCP adapter and projection: [docs/MCP.md](docs/MCP.md)
- Protocol and domain state: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones and verification: [docs/MVP.md](docs/MVP.md)
