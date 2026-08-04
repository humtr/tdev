# tdev Workboard

## Current

- Product/source stage: M0 schema/domain foundation, the first M1 schema/proof foundation slice at `63b3e1948ce2579cd4d781a9854122bac3a65203`, and the Design 0004 pre-storage contract/source-correction gate at `e4e0bdf5f32bfd6c1ffbd876e2ce46f8df3b9a4c` are source-verified. The correction gate centralizes the release-pinned typed policy profile, exact-root validation proofs, cross-language ingress limits and typed reasons, ingress/auth ordering, and the frozen DDL, transition/Event, capability, cursor, migration, retention, and quota contracts. No Worker, CaseDO SQLite runtime, Cloudflare deployment, Agent, public MCP, current-client, or live release layer is claimed.
- Current work: no active source implementation in this observation. Design 0004 remains `implementing` because its CaseDO storage, Worker, Cloudflare, public MCP, client, and rollback evidence layers are not implemented or verified.
- Next product gate: implement the CaseDO SQLite storage core and exact empty-to-v1 migration against the frozen DDL and transition/Event matrices. Worker, deployment, public MCP, and client checks remain downstream gates.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`

## Blocking unknowns

- Actual Cloudflare Durable Object SQLite transaction, uniqueness, migration, hibernation, restart, and rollback behavior remains unverified. A 2026-08-04 Task-bound inspection at source `63b3e1948ce2579cd4d781a9854122bac3a65203` found no repository Edge Worker or CaseDO implementation, SQL migration/probe, Wrangler configuration or dependency, Workers test-pool/Miniflare harness, or Task-visible Cloudflare account/token variables. No Durable Object platform behavior was executed or observed; this is a prerequisite block, not evidence of platform failure.
- Authenticated public MCP behavior remains unverified. The same inspection found no public MCP server implementation, deployment configuration, Task-visible public endpoint, or MCP token, so no authenticated endpoint call occurred.
- Current-client schema, exact client-requested MCP revision, and optional Resources, Tasks, or elicitation support remain unverified. No repository client-observation harness or Task-visible client registration/refresh path exists, and no actual supported-client schema or behavior was observed. These remain separate release gates owned by [docs/MCP.md](docs/MCP.md) and Design 0003.
- Runtime rollback remains unverified because no CaseDO schema has been installed and no compatible predecessor or active release exists. Source rollback remains ordinary Git history only and is not runtime rollback evidence.

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- MCP adapter and projection: [docs/MCP.md](docs/MCP.md)
- Protocol and domain state: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones and verification: [docs/MVP.md](docs/MVP.md)
