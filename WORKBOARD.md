# tdev Workboard

## Current

- Product/source stage: M0 and the Design 0005 transaction/contract foundation are source-verified on `concept-revision-1`.
- Approved architecture: TypeScript Worker/CaseDO/AgentDO, minimal Go CLI/Termux Agent, consumer-proven target-scoped generation, and MCP DTO separation from internal durable records. All twelve semantic capabilities and the Case/Task/Attempt lifecycle remain preserved.
- Active gate: [Design 0006 — Worker Semantic Boundary](docs/design/0006-worker-semantic-boundary.md). The strict twelve-input/twelve-result contract, TypeScript-only target declarations for newly added public roots, deterministic self-contained Tool schemas, catalog/tool-set/projection digests, and executable bound tests are implemented in the current source slice. The remaining gate is bounded authenticated stateless Worker ingress, typed CaseDO routing, exact result/replay/egress integration, and one all-twelve table-driven suite.
- Queued gate after exact Worker source publication: [Design 0007 — AgentDO and Termux `file.read`](docs/design/0007-agentdo-and-termux-file-read.md).
- Non-normative continuation review: [docs/CONCEPT_REVISION_1_IMPLEMENTER_HANDOFF.md](docs/CONCEPT_REVISION_1_IMPLEMENTER_HANDOFF.md). Product meaning and acceptance remain owned by normative owners and accepted designs.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active designs

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`
- [Design 0006 — Worker Semantic Boundary](docs/design/0006-worker-semantic-boundary.md): `implementing`
- [Design 0007 — AgentDO and Termux `file.read`](docs/design/0007-agentdo-and-termux-file-read.md): `accepted`

## Blocking unknowns

- The executable tools-v1 contract/projection slice is source-verified, but the stateless Worker adapter, typed CaseDO facade, and all-twelve integration suite are not yet implemented. Owner: Design 0006.
- Live Cloudflare transaction, migration, hibernation, PITR, route, cost, and rollback behavior is unverified. Structural source evidence does not close this gate.
- MCP final revision is `2026-07-28`; actual SDK/current-client Tool snapshot, `resultType`, Tasks, Resources, elicitation, and refresh behavior is unverified.
- Concrete Go Agent consumers are authorized by Design 0007 but not implemented until its source gate begins.
- Real Android/Termux installation, process reclaim, reboot, CPU, RSS, network, battery, and recovery are unverified.

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Protocol/domain: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- MCP: [docs/MCP.md](docs/MCP.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones/verification: [docs/MVP.md](docs/MVP.md)
