# Design 0005 — concept-revision-1 Transaction and Contract Boundaries

## Metadata

- Status: `implementing`
- Date: 2026-08-05
- Acceptance authority: direct maintainer approval to create `concept-revision-1` and implement architecture alternatives 2 + selective 3 + 6
- Exact base source: `79c7196c32ba4e17505068c5084f3f830a2adf53`
- Publication line: remote branch `concept-revision-1`; no merge to `concept` is authorized by this record
- Owners affected: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/MCP.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, Design 0003, Design 0004, `protocol/README.md`, `edge/case-do/README.md`
- Implementation paths: `edge/case-do/`, `protocol/`, `tools/generate/`, generated protocol views, focused tests

## One-line definition

`tdev` keeps the TypeScript Edge / minimal Go CLI-Agent topology and the twelve semantic capabilities, while replacing platform-incompatible SQL transaction transcripts with a callback-owned store, separating MCP revision DTOs from durable domain records, and generating only owner-declared contract closures.

## Source classification

### Authority

- The maintainer explicitly approved alternatives 2 + selective 3 + 6 and requested the `concept-revision-1` implementation line.
- `docs/ARCHITECTURE.md` owns component and transaction boundaries.
- `docs/PROTOCOL.md` owns canonical Case, Task, Attempt, receipt, revision, cancellation, storage, and migration semantics.
- `docs/MCP.md` owns the public MCP revision and revision-specific projection.
- JSON Schema 2020-12 remains the sole external field, union, and bound owner.
- `docs/DEPLOYMENT.md` owns release, migration ordering, compatibility, rollback, and live qualification.

### Baseline evidence

At the exact base:

- CaseDO production mutation and migration code directly executes `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK`.
- Cloudflare SQLite-backed Durable Object storage owns transactions through a synchronous callback, not SQL transaction-control statements executed through `sql.exec`.
- `migration_checksum` hashes a Node/SQLite-oriented transcript containing platform wrapper statements.
- the generator emits every `$defs` entry to TypeScript and Go and can emit invalid Go `map[string]never` for a strict empty object;
- TypeScript and Go contract validation append the same semantic errors twice on one public path;
- Design 0003 records `2026-07-28` as an RC, while the official MCP `latest` path now resolves to final revision `2026-07-28`;
- actual SDK and current-client support for that revision and optional extensions remains unobserved.

### Inference

- Worker and CaseDO integration cannot be a valid Cloudflare source claim until transaction ownership is corrected.
- broad symmetric generation creates compatibility and maintenance cost without proving a Go consumer.
- MCP protocol evolution should change an adapter DTO, not force a durable Task schema migration.

### Unknown

- live Cloudflare transaction, hibernation, restart, PITR, cost, and rollback behavior;
- actual MCP SDK and current-client revision/capability behavior;
- AgentDO and Termux Agent lifecycle, Android kill/reconnect, battery, and network behavior;
- which future roots become concrete Go CLI/Agent wire consumers.

These unknowns block claims at their layers. They do not block the bounded source corrections in this record.

## Current contract preserved

This design preserves:

- all twelve semantic capabilities;
- stateless Worker ownership;
- CaseDO as the only Case/Task/Attempt current-state and terminal writer;
- AgentDO as connection epoch, queue, receipt, and fencing owner;
- Termux Agent as local OS-effect and precondition owner;
- Case, Task, and Attempt as distinct lifecycles;
- mutation receipts, semantic replay, exact revision, cooperative cancellation, stale-result fencing, uncertainty, and `unverified`;
- exact bounds, lossless ingress, typed Operations, no arbitrary shell, privacy, and Design 0004 no-overclaim gates.

## Scope

This design authorizes:

1. a synchronous callback-owned SQL store abstraction and Node/Cloudflare adapters;
2. logical empty-to-v1 migration identity independent of platform transaction wrappers;
3. MCP final revision `2026-07-28` as the native owner baseline, without claiming SDK or client support;
4. revision-specific MCP DTOs mapped to canonical internal records without a second lifecycle owner;
5. an explicit generated-root target and consumer manifest;
6. selected-root `$ref` closure generation per target;
7. one semantic-validation execution per public validation call;
8. valid strict-empty-object generation for Go;
9. focused and full source verification and publication only to `concept-revision-1`.

## Non-goals

This record does not authorize:

- merging to `concept`;
- deployment, installation, activation, live migration, route publication, or client refresh;
- deletion of `SESSION_HANDOFF_ONCE.md`;
- reducing or renaming the twelve semantic capabilities;
- adding a global scheduler, generic shell, duplicate public API, MCP-only Task table, retry owner, or terminal writer;
- claiming live Cloudflare, public MCP, current-client, Agent, Android, D1, R2, rollback, or recovery completion;
- deleting existing Go generated views before consumer and compatibility evidence is reviewed.

## Owner table

| Concern | Canonical owner | Derived implementation | Forbidden competing owner |
| --- | --- | --- | --- |
| external JSON shape and bounds | JSON Schema 2020-12 | selected TypeScript/Go validators and types | prose-only or handwritten parallel shape |
| Case lifecycle and storage | `docs/PROTOCOL.md` / CaseDO | repository and control modules | Worker, MCP adapter, D1, AgentDO |
| transaction boundary | `SqlStore.transactionSync` under Architecture/Protocol | Node and Cloudflare adapters | SQL interception in repository/control/schema |
| empty-to-v1 identity | logical migration bytes in `schema.ts` | stored `migration_checksum` | platform wrapper transcript |
| public MCP revision and DTO | `docs/MCP.md` | TypeScript Worker projection | durable internal record or Go mirror by symmetry |
| generated target selection | root target/consumer manifest | generator closure computation | all-definitions implicit default |
| Go wire surface | concrete CLI/Agent consumers or explicit expiring compatibility exemption | generated Go closure | Edge-only projection metadata |
| current-client behavior | deployment/client qualification evidence | release profile | prompt, connection cache, or assumption |

## Terms

- **SqlDatabase**: bounded synchronous SQL primitives with no transaction-opening authority.
- **SqlStore**: a SqlDatabase that owns one non-nested synchronous transaction callback.
- **logical migration bytes**: canonical version, ordered DDL bytes, metadata insert contract, and pre/postconditions; platform BEGIN/COMMIT/ROLLBACK wrappers are excluded.
- **public MCP DTO**: revision-specific adapter representation with no durable lifecycle ownership.
- **generated root**: a declared schema definition selected as an entry root for at least one target.
- **target closure**: the selected roots plus every reachable local `$ref` definition for one language.
- **compatibility exemption**: an explicit, reviewable reason to retain an existing generated target until a named removal gate; it is not consumer evidence.

## Requirements

- R1. Production CaseDO modules MUST NOT execute SQL transaction-control statements.
- R2. Every CaseDO migration or mutation opens exactly one synchronous `SqlStore.transactionSync` callback at the outer owner.
- R3. Nested transaction attempts fail before a second transaction begins.
- R4. Callback throw preserves the original failure and leaves no partial rows, Events, or receipts.
- R5. Post-commit response loss remains distinguishable from pre-commit rollback.
- R6. `migration_checksum` retains its stored column name but hashes only the accepted logical migration bytes.
- R7. Schema DDL digest changes only when exact DDL bytes change.
- R8. MCP native owner revision is `2026-07-28`; actual SDK/client support remains a qualification gate.
- R9. MCP Task projection points to the same canonical tdev Task and creates no second status, scheduler, retry, cancellation, or terminal owner.
- R10. Every generated root declares role, target languages, proof requirement, and a consumer or compatibility exemption.
- R11. Generator output is the per-target reachable closure and fails closed on undeclared roots, missing definitions, or dangling local refs.
- R12. One public validation call reports each semantic error once in deterministic order.

## Accepted design

### Callback-owned transaction store

`SqlStore` extends the bounded SQL primitive surface with:

```ts
transactionSync<T>(callback: () => T): T;
```

The callback has no asynchronous escape. The adapter owns platform begin/commit/rollback mechanics. Production repository, control, and migration code only supplies the domain transaction callback. A store tracks callback depth and rejects nesting. Cloudflare storage is wrapped structurally so source compilation does not depend on a provider package. Cursor rows are eagerly materialized before the call returns.

### Logical migration identity

The empty-to-v1 migration checksum covers canonical bytes containing:

1. migration format and schema version;
2. exact ordered `CASE_DO_SCHEMA_SQL` bytes;
3. the parameterized `schema_meta` insert contract and column order;
4. precondition: foreign keys enabled and no user tables;
5. postcondition: one immutable matching `schema_meta` row and schema re-verification.

Node or Cloudflare transaction wrappers are deliberately outside this byte domain. If a future verifier needs a platform transcript, it receives a separately named digest and owner.

### MCP revision and DTO boundary

The native protocol owner revision is final `2026-07-28`. Each request is self-contained; protocol and capability metadata is interpreted per request, with the request body as source of truth and transport mirrors checked for mismatch. Core results use the revision-defined `resultType` forms. Tasks are optional bilateral extension DTOs. A public Task DTO is mapped to one authorized canonical Task ID and may be coarser, but typed extension data must preserve denial, uncertainty, reconciliation, and `unverified` without creating another durable owner.

### Generated target manifest

A machine-readable manifest adjacent to the schema declares each entry root, role, targets, concrete consumers, proof requirement, and optional compatibility exemption. The generator validates the manifest before reading output paths, computes local-ref closure independently for TypeScript and Go, sorts deterministically, and rejects unowned roots. Existing Go output may remain during this slice only through explicit exemptions whose removal gate is the first concrete CLI/Agent consumer inventory.

### Validation ownership

Schema structural validation, proof construction, and semantic validation remain distinct operations, but one public call invokes semantic validation once. TypeScript and Go exact error-list tests freeze deterministic order and prevent duplicate entries.

## Compatibility, migration, and rollback

- This branch has no deployed stored database evidence. The checksum semantic change is therefore a source compatibility correction, not a live migration claim.
- A database whose version-1 metadata carries the old transcript checksum is not silently accepted as the new logical identity. Deployment qualification must classify it and either use an explicit predecessor adapter/migration or block rollback.
- Existing generated Go views are retained until a complete target diff and consumer inventory authorizes removal.
- `concept` remains the exact predecessor and is not modified.
- Runtime rollback is unverified until an installed compatible predecessor and live schema evidence exist.

## Security and operations

- Transaction callbacks remain synchronous and bounded; no secret or authorization state is stored in the adapter.
- MCP metadata never authenticates a principal or widens a CaseTargetGrant.
- Manifest consumers are repository paths or named components, never credentials.
- Error projection remains typed and bounded; internal adapter causes are not public details.
- Live Cloudflare cost, hibernation blockers, PITR, and Android resource budgets remain deployment/Agent gates.

## Ordered vertical slices

1. owner/design and Workboard routing;
2. transaction store and adapter conformance;
3. logical migration identity and CaseDO mutation refactor;
4. MCP owner correction and DTO boundary;
5. target manifest, closure generation, and generator tests;
6. semantic-validation single ownership;
7. generated drift, focused tests, full portable validation, diff review;
8. commit and exact-lease publication only to `concept-revision-1`;
9. successor Worker and Agent Tasks from the published exact commit.

## Acceptance and falsification matrix

| Area | Required evidence | Falsifier |
| --- | --- | --- |
| authority | accepted 0005 and aligned owner pointers | code meaning changes before owner update |
| transaction | Node and structural Cloudflare adapter tests | production transaction SQL, partial write, nested ambiguity |
| migration | exact logical bytes and computed checksum | platform wrappers in digest or invented constant |
| replay | original receipt bytes and post-commit loss tests | re-execution or reconstructed different response |
| MCP | final revision owner plus DTO mapping tests/contract | client support inferred from spec or second Task owner |
| generation | manifest validation and per-target closure tests | undeclared root, implicit all-defs target, invalid Go |
| validation | exact non-duplicated error list in TS and Go | repeated semantic error or order drift |
| source | focused plus full portable validation | skipped/unsupported reported as green |
| publication | exact commit and remote `concept-revision-1` read | update to `concept` or unverified remote state |

## Current implementation status

The source implementation is complete and independently re-verified in the Task-owned worktree at the exact base. Observed source evidence before publication:

- callback-owned Node and structural Cloudflare SQLite adapters, non-nested transaction enforcement, rollback propagation, and eager cursor consumption;
- no direct transaction-control SQL calls outside the Node test adapter;
- logical migration ID `case_do.empty_to_v1.logical.v1` and checksum `e6974b3c3922c99da7386617315261d0ac42842ae1f6715d1b946dffe2995e77`, with unchanged DDL digest;
- manifest validation, per-target local-reference closure, strict-empty-object Go generation, deterministic output, and generated drift clean;
- exact single-pass semantic error lists in TypeScript and Go;
- full portable profile: TypeScript 62/62, all Go tests, forbidden-import boundary, and governance check passed;
- `go vet ./...` and `git diff --check` passed;
- complete effective-diff review found and corrected a missing read-only SQL type import and a test fixture that still opened its own SQL transaction.

The design remains `implementing` until the exact clean commit is published to remote `concept-revision-1` and independently re-read. Live Cloudflare, public MCP, current-client, Agent, installation, and rollback layers remain outside this source evidence.

## Current unknowns and stop gates

- Actual Cloudflare conformance remains unknown until an isolated real Durable Object test; source adapters cannot close that gate.
- Actual SDK and current-client MCP support remains unknown; public projection digest cannot be release-frozen from documentation alone.
- AgentDO, Termux Agent, Android kill/reconnect, install, routing, D1/R2, cost, battery, rollback, and recovery remain successor gates.
- Any persisted version-1 database carrying the old transcript checksum requires explicit deployment classification before activation.

## Decision log

- 2026-08-05: maintainer approved alternatives 2 + selective 3 + 6 and creation of `concept-revision-1`.
- 2026-08-05: retained all twelve semantic capabilities and Case/Task/Attempt separation.
- 2026-08-05: selected callback-owned transactions and logical migration identity; rejected SQL interception and hidden buffering.
- 2026-08-05: selected final MCP `2026-07-28` as owner baseline while retaining SDK/current-client support as unknown.
- 2026-08-05: selected manifest-driven per-target closure; deferred removal of existing Go output to an explicit consumer/compatibility review.
