# tdev Workboard

## Current

- Product/source stage: M0 is source-verified. Design 0004 slices through the M1 CaseDO control/query core are source-verified in protocol, domain, and isolated SQLite source layers.
- Approved architecture direction: `concept-revision-1` implements TypeScript Edge + minimal Go CLI/Termux Agent, consumer-proven target-scoped generation, and MCP revision DTO separation from internal durable records. All twelve semantic capabilities and the Case/Task/Attempt lifecycle remain preserved.
- Current source gate: implement the Worker semantic boundary from the exact verified `concept-revision-1` foundation commit. The Worker slice must add the missing executable capability roots, deterministic TypeScript projection, bounded authenticated ingress, and one table-driven Worker/CaseDO integration surface without claiming live Cloudflare or current-client completion.
- Non-normative continuation review and implementer checklist: [docs/CONCEPT_REVISION_1_IMPLEMENTER_HANDOFF.md](docs/CONCEPT_REVISION_1_IMPLEMENTER_HANDOFF.md). Product meaning, acceptance, and verification remain owned by the linked normative owners and accepted designs.
- Next product gate after Worker source publication: implement the AgentDO + minimal Go Termux Agent `file.read` walking skeleton. Agent dispatch remains M2-owned until that successor gate is independently verified.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active designs

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`
  - Its lifecycle, replay, revision, cancellation, evidence, and no-overclaim invariants remain active; Design 0005 corrects the platform transaction and contract-generation boundary before Worker integration.

## Blocking unknowns

- Actual Cloudflare Durable Object SQLite transaction, migration, hibernation, restart, PITR, cost, and rollback behavior is unverified. Structural source conformance does not close the live platform gate. Owners: Design 0005 and [DEPLOYMENT.md](docs/DEPLOYMENT.md).
- MCP final specification revision is `2026-07-28`, but actual SDK and current-client revision, Tool snapshot, `resultType`, Resources, Tasks, and elicitation behavior is unverified. Owner: [MCP.md](docs/MCP.md).
- The executable schema still lacks six read/query input roots and all twelve capability-specific result roots. That is the successor Worker Task after Design 0005 is published. Owners: [PROTOCOL.md](docs/PROTOCOL.md), [MCP.md](docs/MCP.md), and Design 0004.
- Concrete Go CLI/Agent consumers have not yet been implemented. Existing Go generated views remain under explicit compatibility review until the first Agent vertical slice proves the required wire roots.
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
