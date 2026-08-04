# tdev Workboard

## Current

- Product/source stage: M0 schema/domain foundation, Design 0004 accepted, and the first M1 schema/proof foundation slice (canonical control schemas, lossless raw JSON ingress, `ValidationProofV1`, branch identities, and proof-consuming closed domain converters) are source-verified and published at `63b3e1948ce2579cd4d781a9854122bac3a65203`; no Worker, CaseDO SQLite, Cloudflare deployment, Agent, public MCP, current-client, or live release layer is claimed.
- Current work: no active implementation. The first M1 schema/proof foundation slice is complete, and the previously unverified live-layer prerequisites were inspected without mutating Cloudflare, routes, public endpoints, credentials, or client settings.
- Next product gate: implement the CaseDO SQLite storage core, schema version 1 migration, repository adapters, immutable guards, and transaction/fault tests defined by Design 0004. Worker, deployment, public MCP, and client checks remain downstream gates.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `accepted`

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
