# tdev Workboard

## Current

- Product/source stage: M0 is source-verified. Design 0004 slices through the M1 CaseDO control/query core are source-verified in protocol, domain, and isolated SQLite source layers.
- Current source gate: the high-involvement documents have been aligned to the verified language boundary before further implementation: TypeScript owns Edge and public MCP projection; Go owns the CLI, Termux Agent, and shared wire contracts they consume. This documentation gate changed no product source, schema bytes, generated output, or runtime layer.
- Next product gate: implement the **Worker semantic boundary**. First complete strict executable input and result roots for all twelve `tools-v1` capabilities and declare their language targets; then generate TypeScript public validators plus the TypeScript-owned deterministic projection, generate Go only for shared CLI/Agent wire roots, and route lossless authenticated ingress to the final CaseDO boundary in one table-driven integration suite.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`
  - Next gate: Worker semantic boundary under the TypeScript Edge / Go CLI-Agent split; Agent dispatch remains an M2 boundary.

## Blocking unknowns

- The executable schema lacks six read/query input roots and all twelve capability-specific result roots. This blocks the TypeScript-owned generated `tools-v1` projection and public output validation. Each new root must declare whether it is Edge-only or a shared CLI/Agent wire contract before generation. Owners: [PROTOCOL.md](docs/PROTOCOL.md), [MCP.md](docs/MCP.md), and Design 0004.
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
