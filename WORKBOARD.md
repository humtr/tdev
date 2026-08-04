# tdev Workboard

## Current

- Product/source stage: M0 schema/domain foundation, Design 0004 accepted, and the first M1 schema/proof foundation slice (canonical control schemas, lossless raw JSON ingress, ValidationProofV1, branch identities, and proof-consuming closed domain converters) are source-verified; no Worker, CaseDO SQLite, Cloudflare deployment, Agent, public MCP, client, or live release layer is claimed.
- Current work: the first M1 schema/proof foundation slice is complete. CaseDO SQLite storage core is ready for the next slice.
- Next product gate: implement the CaseDO SQLite storage core, schema version 1 migration, and transaction boundary defined by Design 0004.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `accepted`

## Blocking unknowns

- Actual Cloudflare Durable Object SQLite transaction, uniqueness, migration, hibernation, and rollback behavior remains unverified. This does not block the first M1 source slice, but contradictory measured behavior reopens Design 0004 and blocks dependent runtime work.
- The exact final public MCP revision and current-client optional extension support remain separate release gates owned by `docs/MCP.md` and Design 0003.

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- MCP adapter and projection: [docs/MCP.md](docs/MCP.md)
- Protocol and domain state: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones and verification: [docs/MVP.md](docs/MVP.md)
