# tdev Workboard

## Current

- Product/source stage: M0 schema/domain foundation, M1 schema/proof foundation at `63b3e1948ce2579cd4d781a9854122bac3a65203`, pre-storage correction at `e4e0bdf5f32bfd6c1ffbd876e2ce46f8df3b9a4c`, CaseDO SQLite substrate at `3cf29451a35453fb5b1bc54267b59e520ad92972`, atomic admission/replay at `8a7075877dae4f14d3edba81a70ec86cb9c34f41`, and Control/query core at `50fed94bbda5f9849512198a6f3251894defc57c` are source-verified. The latest slice implements the remaining Case/Task/Attempt control transactions, exact decisions and receipts, cancellation races, checkpoints, evidence-gated completion, bounded snapshots/cursors/rendering, and file-backed local SQLite close/reopen recovery. No independently validated public output root, Worker, Cloudflare Durable Object adapter or hibernation, deployment, Agent, R2 ownership, public MCP, current-client, or live rollback layer is claimed.
- Current work: no active source implementation in this observation. Design 0004 remains `implementing` because the Worker semantic boundary, actual Cloudflare persistence/hibernation/restart, authenticated public MCP, current-client, deployment, and rollback evidence are not implemented or verified.
- Next product gate: implement the ordered **Worker semantic boundary** slice: route the release-pinned twelve-capability `tools-v1` surface through the lossless ingress and final CaseDO boundary in one table-driven integration suite. Agent dispatch remains an M2 boundary; actual Cloudflare deployment/hibernation, authenticated public MCP, current-client, and live rollback remain downstream gates.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0004 — CaseDO Storage and Public Control Core](docs/design/0004-casedo-storage-and-public-control-core.md): `implementing`

## Blocking unknowns

- Actual Cloudflare Durable Object SQLite transaction, uniqueness, migration, hibernation, restart, and rollback behavior remains unverified. Sources `3cf29451a35453fb5b1bc54267b59e520ad92972`, `8a7075877dae4f14d3edba81a70ec86cb9c34f41`, and `50fed94bbda5f9849512198a6f3251894defc57c` supply a runtime-neutral SQL boundary plus deterministic local migration, admission, control, replay, conflict, response-loss, bounded-query, cursor, race, evidence, and file-backed close/reopen tests, but no Cloudflare Durable Object adapter, Wrangler configuration, Workers test-pool/Miniflare harness, deployment, or Task-visible Cloudflare account/token variables were used. No Durable Object platform behavior was executed or observed; local SQLite success is source/storage evidence only, not evidence of Cloudflare behavior.
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
