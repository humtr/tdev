# tdev Workboard

## Current

- Product/source stage: M0 schema/domain foundation, the first M1 schema/proof foundation slice at `63b3e1948ce2579cd4d781a9854122bac3a65203`, the pre-storage contract/source-correction gate at `e4e0bdf5f32bfd6c1ffbd876e2ce46f8df3b9a4c`, the isolated CaseDO SQLite storage substrate at `3cf29451a35453fb5b1bc54267b59e520ad92972`, and atomic admission/replay at `8a7075877dae4f14d3edba81a70ec86cb9c34f41` are source-verified. The latest slice derives the full SHA-256 Case route from deployment and request identity, atomically commits the Case contract and grants, Case revision 1, first Task revision 1, optional first Attempt revision 1, contiguous initial Events, and an immutable original-response receipt, and proves matching replay, capability/digest conflict, all pre-commit rollback points, and commit-then-response-loss recovery in isolated SQLite. No Worker, Cloudflare Durable Object adapter or deployment, Agent, public MCP, current-client, or live release layer is claimed.
- Current work: no active source implementation in this observation. Design 0004 remains `implementing` because the remaining Case/Task/Attempt controls and bounded queries, Worker integration, Cloudflare persistence/hibernation/restart, public MCP, client, and rollback evidence are not implemented or verified.
- Next product gate: implement the ordered **Control and query core** slice: all remaining Case/Task/Attempt transitions including `cancel_task`, bounded stable snapshots/cursors/rendering, evidence-gated completion, and source-level hibernation/restart harnesses. Worker routing, deployment, authenticated public MCP, current-client, and live rollback remain downstream gates.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`

## Blocking unknowns

- Actual Cloudflare Durable Object SQLite transaction, uniqueness, migration, hibernation, restart, and rollback behavior remains unverified. Sources `3cf29451a35453fb5b1bc54267b59e520ad92972` and `8a7075877dae4f14d3edba81a70ec86cb9c34f41` supply a runtime-neutral SQL boundary plus deterministic local migration, transaction, replay, conflict, and response-loss tests, but no Cloudflare Durable Object adapter, Wrangler configuration, Workers test-pool/Miniflare harness, deployment, or Task-visible Cloudflare account/token variables were used. No Durable Object platform behavior was executed or observed; local SQLite success is source/storage evidence only, not evidence of Cloudflare behavior.
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
