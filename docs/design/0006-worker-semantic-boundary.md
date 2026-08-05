# Design 0006 — Worker Semantic Boundary

## Metadata

- Status: `implementing`
- Date: `2026-08-05`
- Acceptance authority: maintainer instruction authorizing the managed `concept-revision-1` MVP source pass
- Base source: `4cb1eb889af4069cb83dee6a1aa3184e9135b5bb`
- Affected owners: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/MCP.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `protocol/README.md`, Design 0004, Design 0005
- Implementation paths: `protocol/schemas/`, `protocol/testdata/`, `protocol/generated/typescript/`, `protocol/contract.test.ts`, `tools/generate/`, `edge/worker/`, `edge/case-do/service.ts`, `package.json`, `scripts/check-governance.mjs`

## One-line definition

`A stateless TypeScript Worker validates one bounded MCP 2026-07-28 semantic request, authenticates and authorizes it, routes it to the canonical owner, and projects one capability-specific result without owning durable lifecycle state.`

## Source classification

### Authority

- `docs/PROTOCOL.md` owns the twelve capability semantics, identifiers, revisions, replay, cancellation, and bounds.
- `docs/MCP.md` and Design 0003 own MCP revision-specific representation and optional-extension negotiation.
- Design 0004 owns CaseDO lifecycle, receipts, exact replay bytes, and public control/query semantics.
- Design 0005 owns callback-owned transaction portability, internal-record separation, and target-scoped generation.
- `docs/SECURITY.md` owns authentication, authorization, privacy, bounds, and secret handling.

### Evidence

- At the base source, the six mutation input roots exist, but the six read/query input roots and all twelve capability-specific result roots are absent from the canonical schema.
- `edge/case-do/` implements the canonical local control/query core; no `edge/worker/` source exists.
- The target manifest and selected-reference generator foundation are verified at the base source.
- The registered `portable` profile passes at the exact base with TypeScript 62/62 and all Go tests green.

### Inference

- The next production-shaped slice is one generated capability projection plus one stateless Worker boundary that terminates at typed CaseDO and injected locator/artifact interfaces.
- A global request store, RequestDO, or Worker-owned scheduler would duplicate CaseDO ownership and is unnecessary.

### Unknowns

- Exact live Cloudflare compatibility date, route, bindings, namespace, cost, hibernation, PITR, and rollback remain unobserved.
- Actual SDK and current-client support for MCP `2026-07-28`, Tasks, Resources, elicitation, and schema refresh remain unobserved.
- A production Artifact byte store is not available in this source slice.

## Baseline contract at design start

- The semantic catalog contains exactly twelve tools-v1 capabilities in stable order.
- Worker is documented as a stateless public adapter; CaseDO is the canonical owner of Case, Task, Attempt, Event, receipt, checkpoint, evidence, revision, and terminal state.
- MCP native revision is `2026-07-28`; optional extensions require bilateral declaration.
- Authentication must precede expensive owner-specific work, and unauthenticated errors must not enumerate protected identifiers.
- Mutation replay returns the exact stored response owned by CaseDO and never re-executes the effect.

## Problem and evidence

The source foundation cannot expose the documented semantic surface because executable schemas and the Worker adapter are incomplete. Hand-maintained mappings would create a second contract, while routing directly from untrusted input to CaseDO would violate the security ordering and ownership boundaries. The missing vertical boundary is:

```text
bounded bytes
-> lossless request
-> protocol metadata
-> authentication
-> capability validation
-> authorization
-> deterministic route
-> canonical owner
-> capability result validation
-> bounded MCP projection
```

## Scope

- Add strict executable public roots for all twelve inputs and results.
- Add one deterministic TypeScript capability descriptor generated from canonical schema roots plus design-owned capability policy.
- Implement the bounded Worker ingress, protocol, authentication, authorization, routing, result, and projection modules.
- Add a narrow CaseDO service facade without exposing SQL.
- Connect mutation result construction, receipt/replay, and egress to the same result contract.
- Add one table-driven all-capability integration suite.
- Amend only the owner sections required by the executable implementation.

## Non-goals

- No live Cloudflare deployment, public route, current-client refresh, install, migration of live state, or rollback claim.
- No AgentDO or native Agent implementation; Design 0007 owns that successor slice.
- No generic shell, arbitrary JSON RPC, global scheduler, Worker lifecycle table, or exactly-once effect claim.
- No D1 canonical ownership and no R2 byte implementation.
- No removal of compatibility-exempt existing Go generated views.

## Invariants

- Capability order is exactly: `list_operations`, `list_resources`, `submit_operation`, `get_case`, `get_task`, `control_case`, `finish_case`, `cancel_case`, `control_task`, `cancel_task`, `render_task`, `read_artifact`.
- Public root names are unversioned within `tdev.v1`.
- Worker stores no durable lifecycle or replay state.
- CaseDO remains the mutation receipt, replay, revision, and terminal owner.
- Public input never accepts trusted `principalBindingDigest`, server clock, or authorization decision fields.
- Authentication occurs before deep capability validation; authorization occurs after a typed value and semantic digest exist.
- Unknown fields, duplicate or escaped-equivalent keys, unsafe numbers, invalid UTF-8, and all configured bounds fail closed.
- Agent-dependent work may return only typed pending, deferred, unavailable, or unverified knowledge until Design 0007 provides evidence.

## Owner impact

- Existing owners changed: focused sections of Architecture, Protocol, MCP, Security, Deployment, MVP, and protocol routing guidance.
- Owner added or removed: no durable product owner is added; this design owns only the bounded Worker implementation decision.
- Projections/caches introduced: generated TypeScript capability metadata and release digests are reproducible derivatives, never canonical lifecycle state.

## Design

### Data and state

#### Canonical public roots

Existing mutation inputs remain:

```text
SubmitOperationInput
ControlCaseInput
FinishCaseInput
CancelCaseInput
ControlTaskInput
CancelTaskInput
```

The schema adds:

```text
ListOperationsInput
ListResourcesInput
GetCaseInput
GetTaskInput
RenderTaskInput
ReadArtifactInput
```

Every capability gains one result root:

```text
ListOperationsResult
ListResourcesResult
SubmitOperationResult
GetCaseResult
GetTaskResult
ControlCaseResult
FinishCaseResult
CancelCaseResult
ControlTaskResult
CancelTaskResult
RenderTaskResult
ReadArtifactResult
```

All new public roots target TypeScript only. They declare concrete Worker/MCP consumers in `tdev.v1.targets.json`. Existing broad Go views remain compatibility-exempt; this slice adds no new Go public projection.

#### Generated capability descriptor

`protocol/generated/typescript/capabilities.ts` contains exactly twelve descriptors in the stable order. Each descriptor includes:

```text
name, version, inputRoot, resultRoot, mutation,
owner, routing, retryClass, approvalClass,
MCP annotations, maxResultBytes,
inputSchemaDigest, resultSchemaDigest
```

The generated module also exports deterministic tools-v1 catalog and projection digests scoped to MCP `2026-07-28`. Shape and bounds come from JSON Schema. Routing, annotation, retry, and approval policy come from one generator-owned declarative table cross-checked against the canonical roots and target manifest. Generation fails when a root is absent, mistargeted, duplicated, or reordered.

#### Resource locator source

Before D1 exists, `list_resources` uses an injected `ResourceLocatorSource` that returns a bounded authenticated union of:

- release-static Agent observations,
- granted Workspace observations,
- Project observations,
- explicit authorized CaseDO query adapters.

Every item includes source and freshness. The source has no effect authority, cannot modify grants or lifecycle, and is not a durable owner. Case-scoped history remains a CaseDO query rather than a global projection.

### API and dependencies

Approved Worker layout:

```text
edge/worker/README.md
edge/worker/types.ts
edge/worker/ingress.ts
edge/worker/protocol.ts
edge/worker/auth.ts
edge/worker/authorization.ts
edge/worker/routing.ts
edge/worker/projection.ts
edge/worker/results.ts
edge/worker/service.ts
edge/worker/index.ts
edge/worker/*.test.ts
```

A narrow `edge/case-do/service.ts` facade may expose typed admission, control, query, render, artifact-metadata, and replay operations. It must not expose SQL handles or permit Worker-owned transitions.

Routing policy:

- `list_operations`: release-static generated catalog.
- `list_resources`: injected bounded locator source plus authorized CaseDO adapters.
- `submit_operation`: existing `tdev.new-case-route.v1` for new Case ownership.
- explicit Case/Task controls and reads: explicit `caseId` to CaseDO.
- `read_artifact`: CaseDO authorizes metadata, then injected bounded `ArtifactByteReader` supplies bytes. An absent byte source yields a typed unavailable or not-materialized result.

The outer async Worker auth and transport-digest adapter uses Web Crypto. Existing synchronous canonical/storage cryptography remains unchanged. A live release must independently prove its exact Cloudflare compatibility configuration.

### Ordering, concurrency, retry, and cancellation

Public ingress ordering is fixed:

1. transport byte ceiling,
2. fatal UTF-8 decoding,
3. lossless JSON lexical scan with duplicate, escaped-equivalent, unsafe-number, depth, token, container, and string bounds,
4. minimal JSON-RPC and MCP envelope,
5. per-request MCP `2026-07-28` revision/capability metadata and mirrored-header agreement,
6. authentication,
7. capability lookup and deep input-root validation,
8. authorization and target-grant checks over the exact typed value and digest,
9. deterministic owner routing,
10. canonical service call,
11. capability result validation,
12. bounded MCP result projection.

Worker retry does not create lifecycle state. Mutation retry and dedupe terminate at the CaseDO request receipt. A replay returns the stored canonical response bytes. Cancellation is intent; an Agent-dependent effect may remain pending or unverified.

### Errors and evidence

- Transport, lexical, protocol, authentication, schema, authorization, conflict, unavailable, unverified, and internal invariant failures are distinct bounded error classes.
- Unauthorized responses do not reveal Case, Task, Artifact, Agent, Workspace, or Project existence.
- Mutation success requires a validated result root and canonical receipt evidence.
- Agent-dependent operations cannot fabricate verified success before an Agent result is reconciled.
- The authoritative completion reader for source is the exact Git commit plus registered validation; live completion requires separate Cloudflare and client readers.

## Security and secret impact

- Bearer or equivalent credential bytes are consumed only by the authentication adapter and never persisted in CaseDO, logs, digests, checkpoints, fixtures, or generated outputs.
- Authentication precedes deep owner-specific work to bound unauthenticated cost.
- Authorization evaluates the authenticated principal, exact target grant, capability effect class, input digest, and requested revision.
- ResourceLocatorSource output is filtered by grants and cannot authorize an effect.
- Web Crypto key material is supplied through bindings; no secret is committed.

## Compatibility, migration, and rollback

- Compatibility: the tools-v1 capability names and ordering remain stable. New executable roots replace prose-only gaps. Optional MCP extensions remain negotiated rather than required.
- Migration: no persisted CaseDO schema migration is required by the Worker boundary. New receipt result validation must remain compatible with existing canonical response bytes or fail before publication.
- Rollback: source rollback is to the exact compatible predecessor commit. A live rollback is blocked until bindings, projection digest, schema compatibility, route, and stored receipt readers are proven compatible.

## Current implementation status

Accepted and implementation-authorized at base `4cb1eb889af4069cb83dee6a1aa3184e9135b5bb`. The current contract/projection slice adds the six missing read/query input roots, all twelve capability-specific result roots, TypeScript-only target declarations for the newly added public roots, deterministic self-contained Tool schemas and digests, and executable strict/bound tests. The stateless Worker adapter, typed CaseDO service wiring, all-twelve integration suite, live Cloudflare runtime, public MCP endpoint, and current-client evidence are not yet claimed.

Durable implementation commits are:

1. Design 0006/0007 and router commit.
2. Schema, target manifest, fixtures, contract tests, and generated capability projection commit.
3. Worker, CaseDO facade, result/replay integration, all-twelve suite, and focused owner amendments commit.
4. Design 0007 Agent source commit.
5. Final source status and verification commit when needed.

After interruption, resume only from the last local or published commit and Task checkpoint. Never infer uncommitted edits.

## Vertical slices

1. Add strict public roots and deterministic projection generation.
2. Implement bounded ingress, protocol metadata, authentication, and authorization.
3. Route all twelve capabilities to typed owners.
4. Validate results across construction, receipt/replay, and egress.
5. Run the all-twelve table-driven suite and full source validation.
6. Publish with exact remote lease and verify provider ancestry.

## Acceptance criteria

1. Exactly twelve descriptors map the stable capability order to existing executable TypeScript input and result roots.
2. All new roots are strict, bounded, fixture-covered, target-declared, and generated without a new Go projection.
3. Unauthenticated requests cannot trigger deep capability parsing or owner lookup.
4. Worker stores no durable lifecycle, dedupe, session, or scheduling state.
5. Every mutation uses the same capability result contract at construction, receipt/replay, and egress.
6. Replay returns exact stored semantic bytes and a conflicting request performs no write.
7. `list_resources` is bounded, grant-filtered, source/freshness-labelled, and non-authoritative.
8. Missing Artifact bytes return a typed unavailable result.
9. All twelve capabilities pass one table-driven Worker/CaseDO integration suite.
10. Registered portable validation, `go vet ./...`, `git diff --check`, forbidden imports, governance, full diff review, clean commit, exact-lease push, and provider verification pass.

## Verification matrix

| Claim | Command or probe | Authoritative reader | Layer | Contamination/skip rule |
| --- | --- | --- | --- | --- |
| roots and projection deterministic | generator tests plus `npm run check:generated` | canonical schema, target manifest, generated diff | source | a hand-edited generated file is failure |
| ingress ordering and privacy | focused Worker tests | test process and exact source commit | source | skipped lexical/auth cases are unknown |
| all capabilities route correctly | all-twelve integration table | Worker/CaseDO test harness | source | missing row is failure |
| receipt replay is exact | response-loss and conflict tests | CaseDO receipt reader | source | reconstructed current-row response is failure |
| source package coherent | registered `portable`, `go vet ./...`, `git diff --check` | tmcp Job result and Git status | source | changed environment or dirty tree invalidates reuse |
| live Cloudflare works | isolated real deployment probes | Cloudflare runtime and storage | runtime | emulator/source green is not evidence |
| current client supports projection | actual client request and Tool snapshot | client/server observation | client | documentation or SDK-only evidence is insufficient |

## Stop gates

- A new root without target and consumer evidence blocks generation.
- An unresolved public shape, persisted receipt incompatibility, authentication ambiguity, or authorization ambiguity blocks the dependent route.
- Missing live credentials blocks only live qualification, not source completion.
- A result that cannot be represented without generic unconstrained JSON blocks that capability until the canonical owner is amended.

## Decision log

- `2026-08-05`: Maintainer accepted the managed one-Task/one-worktree source pass and Design 0006.
- `2026-08-05`: Public root names remain unversioned inside `tdev.v1`; existing mutation input names are preserved.
- `2026-08-05`: TypeScript capability metadata is generated; no Go projection is created.
- `2026-08-05`: Worker remains stateless, ResourceLocatorSource is non-authoritative, and CaseDO owns receipt replay.
- `2026-08-05`: Source completion is explicitly separated from Cloudflare, public MCP, current-client, install, rollback, and cost qualification.
- `2026-08-05`: The canonical tools-v1 input/result contract and deterministic TypeScript projection slice were implemented and fully source-validated; Worker service wiring remains the active gate.
