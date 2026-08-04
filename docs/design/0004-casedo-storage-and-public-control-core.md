# Design 0004 — CaseDO Storage and Public Control Core

## Metadata

- Status: `implementing`
- Date: 2026-08-04
- Acceptance authority: direct maintainer instruction to proceed with Design 0004 in the repository-defined order; acceptance becomes effective only after the owner updates and source verification in this record are coherent
- Base source: `a51d140e76a7e3abee34511a49821dfbd6385d20`
- Affected owners: `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/MCP.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`
- Subordinate guidance affected: `protocol/README.md`, `WORKBOARD.md`, `docs/design/README.md`
- Implementation paths: current protocol profile/runtime/generator/test corrections plus future versioned protocol schemas, `edge/worker/`, `edge/case-do/`, CaseDO SQLite migrations, and one consolidated Worker/CaseDO integration boundary

## One-line definition

M1 admits public semantic requests only through a bounded lossless JSON ingress and validated domain conversion, then lets the uniquely addressed `CaseDO(caseId)` atomically own Case, Task, Attempt, decisions, deduplication, evidence metadata, and audit Events in versioned SQLite storage while every retry returns the original committed mutation response.

## Source classification

### Authority

- `docs/SPEC.md` requires immutable Case contracts, atomic Case-plus-first-Task admission, semantic request deduplication, durable query and control, exact revisions, transactional Events, bounded results, and evidence-gated completion at M1.
- `docs/PROTOCOL.md` owns canonical JSON, identifiers, digests, Case/Task/Attempt transitions, public semantic inputs and results, request deduplication, errors, Events, evidence, and stored/public schema compatibility.
- `docs/ARCHITECTURE.md` makes one `CaseDO(caseId)` the sole owner of Case lifecycle state and specifies SQLite current rows plus same-transaction audit Events without event-sourced reconstruction.
- `docs/MCP.md` keeps the Worker adapter stateless, preserves all twelve semantic capabilities in `tools-v1`, and requires UTF-8 and duplicate-member rejection before canonical routing.
- `docs/MVP.md` defines the M1 storage, public-control, hibernation, response-loss, transaction, and completion-evidence acceptance gates.
- `SDD.md` classifies public/stored schema, durable ownership, migration, retry, cancellation, and verification changes as Class 2 work requiring an accepted design before implementation.

### Evidence

At base source `a51d140e76a7e3abee34511a49821dfbd6385d20`:

- `protocol/README.md` records that parsed-value validators cannot establish whether raw JSON contained duplicate object member names.
- the Go schema runtime decodes through `encoding/json`, whose ordinary object decoding does not preserve duplicate-member evidence for later validation;
- generated Go `oneOf` declarations are `json.RawMessage` aliases, including Case, Task, Attempt, result, reference, target, and error unions;
- the current validator reports whether a value matches exactly one `oneOf` branch but returns no branch identity proof for a domain converter;
- `RequestDedupeRecord` stores a response digest but not the original committed response value;
- a new Case request has no pre-existing `caseId`, while Case lifecycle state and request dedupe are owned inside `CaseDO(caseId)`;
- the public semantic catalog includes `cancel_task`, but `docs/PROTOCOL.md` does not yet define its exact input;
- state-changing Case and Task controls other than `cancel_case` do not carry request IDs, leaving response-loss replay behavior unspecified.

### Inference

- Duplicate-member rejection must operate on the raw token stream before any ordinary map/object decode; validating an already parsed object cannot recover discarded duplicate evidence.
- Schema success alone is insufficient for Go domain safety unless the validator also supplies the exact accepted union branch and the converter consumes that proof.
- Retrying new-Case creation after a lost response requires a deterministic pre-routing Case identity; a global request table or `RequestDO` would duplicate CaseDO ownership.
- Returning the current mutable Task after a replay is not equivalent to returning the original admission result. The exact committed mutation response must be retained with the dedupe record.
- Every state-changing public semantic capability needs the same request-identity and replay contract, even when revision preconditions make duplicate effects unlikely.

### Unknowns

- Actual Cloudflare Durable Object SQLite transaction, trigger, hibernation, and migration behavior has not been exercised by this design.
- No Worker, CaseDO, public MCP endpoint, client schema, stored migration, or rollback runtime exists to verify.
- The exact final public MCP revision remains owned and gated by Design 0003 and `docs/MCP.md`; it does not affect the canonical M1 CaseDO design.

These unknowns block marking M1 implemented or verified. They do not block accepting this source-level design. Measured platform behavior that contradicts a transaction, migration, or hibernation assumption reopens this record before dependent implementation continues.

## Current contract

The accepted repository contract already establishes:

- one `CaseDO` per `caseId` as the sole canonical Case/Task/Attempt owner;
- current SQLite rows as lifecycle truth and Events as same-transaction audit records;
- raw UTF-8 JSON with no duplicate object members;
- safe-integer canonical JSON and schema-before-domain validation;
- `tools-v1` projection of all twelve semantic capabilities;
- exact Case and Task revision preconditions for lifecycle controls;
- request deduplication for `submit_operation` by request ID plus semantic digest;
- terminal immutability and evidence-gated completion.

The contract does not yet define the lossless ingress algorithm, a validated union-conversion proof, deterministic new-Case routing, exact replayable mutation records, complete control request identities, exact CaseDO table constraints, versioned migration entry, bounded snapshot cursors, or a rollback barrier for the first persisted schema.

## Problem and evidence

M1 would otherwise cross three unsafe gaps.

First, ordinary JSON decoding may accept a document such as `{"caseId":"case_a","caseId":"case_b"}` by retaining one member. The retained object can pass schema validation and produce a digest even though the raw request is forbidden. Last-member-wins or first-member-wins behavior cannot become canonical state.

Second, a generated Go `oneOf` alias can be unmarshalled into `json.RawMessage` without proving which branch matched. Domain code could persist or transition on a wire value that was never schema-validated or whose discriminator was interpreted independently from the schema.

Third, a new Case is routed before its CaseDO exists. If CaseDO commits and the response is lost, a random second `caseId` would create a second Case, while a global dedupe owner would conflict with CaseDO ownership. Even after reaching the original CaseDO, a digest-only dedupe record cannot reproduce the original response once the Task has advanced.

The design must close all three gaps before M1 implementation is authorized.

## Scope

This design may:

- define the raw JSON ingress state machine and its enforceable limits;
- define schema validation proofs and validated union conversion for TypeScript and Go;
- define deterministic new-Case routing from deployment identity and request ID;
- require request IDs and semantic dedupe for every state-changing CaseDO capability;
- define the exact `cancel_task` semantic input;
- define the M1 CaseDO schema owner, canonical tables, derived indexes, constraints, transaction templates, query snapshots, rendering, and Artifact metadata stubs;
- define initial migration, compatibility, and rollback-barrier behavior;
- define implementation slices, fault injection, acceptance, and verification needed to progress from `accepted` to `verified`;
- update the affected owners and current Workboard pointer.

## Non-goals

This design does not:

- implement or deploy the Worker, CaseDO, Durable Object migrations, D1, R2, AgentDO, Agent, CLI, or public MCP endpoint;
- modify the current M0 canonical schema or generated code before this record is accepted;
- mark Design 0004 or M1 `verified` before every required source, storage, runtime, public, client, and rollback evidence gate passes;
- execute a stored-state migration or claim rollback runtime;
- create a global request owner, RequestDO, scheduler, replay worker, Event-rebuild path, WorkspaceDO, or ProjectDO;
- change Agent dispatch, queue, connection, epoch, fencing, or result acceptance owned by M2;
- change the twelve semantic capability names or the `tools-v1` baseline;
- activate Resources, MCP Tasks, or elicitation;
- select the final MCP revision or change client publication behavior;
- define R2 byte upload, download, or retention implementation beyond bounded metadata stubs;
- change authentication credentials, Cloudflare resources, deployment identity, or client settings.

## Invariants

1. `CaseDO(caseId)` is the only writer of Case, Task, Attempt, control-decision, request-dedupe, evidence-mapping, Artifact-metadata, and Case Event truth.
2. Raw duplicate member names, invalid UTF-8, unsafe numbers, or exceeded ingress limits cannot reach ordinary decoding, canonicalization, digesting, routing, or storage.
3. A wire union cannot enter domain or storage APIs without an exact schema-validation proof and successful generated domain discrimination.
4. One deployment/request tuple deterministically selects one new `caseId`; a request ID never selects two CaseDOs.
5. The same request ID and semantic digest returns the original committed response; the same request ID with another semantic digest has no effect and returns `REQUEST_ID_CONFLICT`.
6. Mutation intent, current-row changes, revision increments, Event insertion, and dedupe response commit in one CaseDO SQLite transaction.
7. Current rows, not Events, are lifecycle truth. Events are append-only audit evidence and never rebuild or authorize current state.
8. Terminal Case, Task, and Attempt records never transition.
9. A Task has at most one nonterminal Attempt.
10. Cancellation intent is not terminal cancellation and may race with a valid success.
11. Query cursors and rendered envelopes are bounded read projections; they own no lifecycle fact and never authorize an effect.
12. D1 and Resource projections remain locators and summaries. A stale projection cannot authorize a CaseDO mutation.
13. `tools-v1` continues to expose every canonical semantic capability; this design changes semantics and storage contracts, not projection policy.
14. No secret, bearer token, credential, absolute local path, or authorization header enters canonical CaseDO input, Event, dedupe response, Artifact metadata, fixture, or report.
15. Source validation proves only contract and source layers until the required Cloudflare, public, client, migration, and rollback probes execute.

## Owner impact

- Existing owners changed: `docs/PROTOCOL.md` gains the M1 ingress proof, mutation replay, control, storage-version, and query-snapshot contracts; `docs/ARCHITECTURE.md` gains the exact CaseDO ingress and SQLite transaction boundary; `docs/MVP.md` gains ordered M1 slices and fault tests.
- Existing owner retained without semantic change: `docs/MCP.md` continues to own wire projection and `tools-v1`; `docs/DEPLOYMENT.md` continues to own release migration ordering and runtime rollback; `docs/SECURITY.md` continues to own authentication, non-enumeration, and secret exclusion.
- Owner added or removed: none.
- Projections/caches introduced: derived status-kind and query-index columns inside the same CaseDO database, D1 summaries, cursors, and rendering remain non-authoritative. No independent lifecycle cache is added.

## Design

### 1. M1 ingress limits

The release-pinned M1 protocol profile uses these hard maxima before semantic routing:

```text
raw request body                 1,048,576 bytes
JSON nesting depth               64 containers
JSON lexical tokens              100,000
members in one object            4,096
items in one array               10,000 unless a stricter schema bound applies
canonical mutation response      262,144 bytes
rendered text envelope            65,536 UTF-8 bytes
query page size                  default 20, maximum 100
```

A stricter canonical schema limit always wins. Increasing a limit is a versioned protocol/profile change with resource evidence; decreasing a limit requires compatibility analysis because an old valid request may become invalid.

### 2. Lossless raw JSON admission

Each public semantic request passes one bounded ingress pipeline:

```text
bounded body collection
-> fatal UTF-8 validation
-> lossless JSON lexical scan
-> duplicate-member, depth, token, container, and number checks
-> generic JSON value decode using exact safe integers
-> canonical schema validation and canonical value digest
-> validation proof construction
-> generated domain conversion
-> capability-specific semantic digest
-> authentication/authorization and deterministic owner routing
-> CaseDO transaction or bounded read
```

The lexical scanner maintains a member-name set for every open object. A member name is compared after JSON escape decoding to Unicode scalar values; `"a"` and `"\u0061"` are the same name. Scope is per object, and duplicates at any nesting depth are rejected. A duplicate in an unknown field is still rejected before schema handling.

The scanner accepts only JSON grammar, rejects trailing values, and parses number tokens losslessly before any floating-point conversion. A number is accepted only when its exact mathematical value is an integer in `[-9007199254740991, 9007199254740991]`; non-integral, out-of-range, non-finite, replacement-decoded, over-depth, over-token, or over-container inputs are rejected before canonicalization. Equivalent accepted integer spellings canonicalize to the same protocol value and bytes.

TypeScript and Go implementations consume the same byte-vector fixtures. Neither implementation may delegate duplicate detection to an ordinary object decoder or claim the property from a parsed-value validator.

### 3. Validation proof and domain conversion

Schema validation returns an ephemeral `ValidationProofV1` together with the validated value:

```ts
type ValidationProofV1 = {
  schemaDigest: Sha256;
  rootDefinition: string;
  canonicalDigest: Sha256;
  unions: {
    instancePointer: string;
    schemaPointer: string;
    branchIndex: number;
    branchIdentity: string;
  }[];
};
```

The proof is produced only when every schema node validates and every `oneOf` matches exactly one branch. `canonicalDigest` is `SHA256("tdev.validation-proof.v1\0" + canonical bytes of the validated root value)` and binds the proof to that exact value. Zero matches return `ONE_OF_NO_MATCH`; multiple matches return `ONE_OF_MULTIPLE_MATCH`. The proof is process-local evidence, not stored authority, and cannot be supplied by the client.

The generator emits stable branch identities derived from the canonical schema pointer and branch index. When a branch has a required `const` discriminator such as `kind` or `outcome`, generated conversion verifies that value and the proof identity agree. A union without a field discriminator uses the proof branch identity directly; it is never selected by field-presence heuristics or decode order.

Generated Go `json.RawMessage` aliases remain wire containers only. Domain constructors require the validated value plus matching proof, return closed domain variants, and do not expose a conversion that accepts an unproved `RawMessage`. TypeScript follows the same proof-consuming boundary even though its parsed representation is structurally accessible.

CaseDO repositories and transition functions accept only domain values. Persisted canonical JSON is produced from the closed domain variant and revalidated on read before use; malformed stored data is `STORAGE_CORRUPT`, not an empty or default state.

### 4. Deterministic new-Case routing

For `submit_operation` with `case.kind = "new"`, the stateless Worker derives the Case identity before routing:

```text
route_bytes =
  "tdev.new-case-route.v1" + NUL
  + deploymentId + NUL
  + requestId

caseId = "case_" + lowercase_hex(SHA256(route_bytes))
```

`deploymentId` and `requestId` use their canonical UTF-8 forms. The deployment is single-user in the first release; adding another principal dimension is a future protocol and migration decision. The derived ID is an opaque identifier, not a credential. Every request is still authenticated and authorized, and unauthorized identifiers are not confirmed to exist.

The same deployment and request ID always route to the same CaseDO after Worker restart, response loss, or client reconnect. A different request ID creates a distinct Case even when its semantic content is equal. Existing-Case admission continues to require an explicit `caseId` and expected contract digest.

No D1 lookup, global request table, RequestDO, session state, or prompt continuity is used to choose the owner. D1 may index the committed Case afterward as a non-authoritative locator.

### 5. Mutation request identity

Every state-changing semantic capability carries a `requestId`:

```text
submit_operation
control_case
finish_case
cancel_case
control_task
cancel_task
```

`control_case`, `finish_case`, and `control_task` add a required `requestId`. `cancel_case` retains its existing request ID. `cancel_task` is defined as:

```ts
type CancelTaskInput = {
  requestId: RequestId;
  caseId: CaseId;
  taskId: TaskId;
  expectedTaskRevision: number;
  reason: string;
};
```

`cancel_task` records cooperative cancellation intent. It does not force a terminal cancelled result, create a control Task, or create another Attempt.

A mutation semantic digest covers the capability identifier and version plus every validated canonical input field other than transport-only wait preferences. For `submit_operation`, it includes the Case selector or new contract, Operation identity and schema digest, target bindings, and arguments. Reusing a request ID for another capability or another semantic digest is `REQUEST_ID_CONFLICT`.

### 6. Replayable mutation record

M1 replaces the M0 conceptual dedupe row with a versioned mutation receipt:

```ts
type MutationReceiptV1 = {
  schemaVersion: 1;
  requestId: RequestId;
  capability: string;
  semanticDigest: Sha256;
  caseId: CaseId;
  taskId?: TaskId;
  subject?: EntityRef;
  response: JsonValue;
  responseDigest: Sha256;
  committedCaseRevision: number;
  committedTaskRevision?: number;
  committedEventSequence: number;
  createdAt: Timestamp;
};
```

`response` is the exact canonical semantic response committed by the original transaction and must fit the mutation-response bound. Its digest uses a capability-specific response domain. A replay returns this response with transport-level replay metadata; it does not reconstruct a response from current mutable rows. Thus a Task that has since advanced does not alter the original admission result.

Mutation receipts are immutable and retained at least as long as their Case. A cleanup process cannot remove one while its Case or any referenced recovery state remains retained. The current M0 schema stays unchanged until this record is accepted; the first implementation slice introduces the versioned M1 canonical schema and regenerated types before any CaseDO code consumes it.

### 7. CaseDO schema version and tables

Each CaseDO database contains one authoritative schema metadata row:

```text
schema_meta
  component = "case_do"
  schema_version
  schema_digest
  release_id
  applied_at
```

It records local database compatibility only. Deployment-wide migration progress remains owned by `docs/DEPLOYMENT.md` and its deployment records.

M1 CaseDO schema version 1 contains:

```text
case_contract
case_state
case_target_grants
tasks
attempts
approval_requests
approval_decisions
input_requests
input_responses
retry_decisions
checkpoints
evidence_sets
evidence_mappings
evidence_refs
artifact_refs
mutation_receipts
events
```

Canonical contracts, statuses, requests, decisions, results, failures, uncertainty, evidence references, and Event payloads are stored as validated canonical JSON bytes plus their declared digests. Indexed kind, outcome, sequence, revision, and timestamp columns are derived selectors inside the same owner. A selector never authorizes a transition without reading and validating the canonical value.

Required relational constraints include:

- one `case_contract` and one `case_state` for the addressed Case;
- foreign keys contained to that Case;
- unique `(case_id, task_sequence)` and `(task_id, attempt_ordinal)`;
- at most one nonterminal Attempt per Task through a partial unique index or equivalent database guard;
- unique request ID per Case in `mutation_receipts`;
- unique `(case_id, event_sequence)` and globally unique Event ID;
- unique decision IDs and one terminal decision per request;
- unique evidence-set ID and criterion mapping; duplicate criteria or evidence references are invalid rather than order-resolved;
- immutable contract, grant, receipt, decision, checkpoint, evidence-set, Artifact-metadata, and Event rows after insertion;
- database and application guards that reject updates from a terminal Case, Task, or Attempt status.

The exact SQL DDL is generated from or reviewed against the accepted M1 schema contract in the first implementation slice. Hand-maintained duplicate state definitions are prohibited.

### 8. Transaction templates

Every canonical mutation executes under one CaseDO SQLite transaction and one serialization turn.

Before mutation, CaseDO:

1. reads any existing `MutationReceiptV1` by request ID;
2. returns its original response if the semantic digest matches;
3. rejects `REQUEST_ID_CONFLICT` without other writes if it differs;
4. validates the current canonical rows, exact expected revisions, status, outstanding request identity, authorization facts already routed to the owner, and terminal prerequisites.

A successful transaction commits together:

- the current-row insert or update;
- exactly one increment for each affected Case, Task, or Attempt revision;
- the next contiguous Case event sequence and typed Event rows;
- any immutable decision, checkpoint, evidence, or Artifact metadata rows;
- the exact bounded semantic response and mutation receipt.

No response is returned before commit. If commit succeeds and response delivery is lost, replay returns the receipt. If the transaction aborts, none of the current rows, Events, or receipt becomes visible.

New-Case admission atomically inserts the contract, grants, active Case state, first Task, initial Attempt when immediately dispatchable, initial Events, and mutation receipt. Existing-Case Task admission uses the same receipt table and does not require a Case revision, but validates the current Case state, contract digest, grants, policy inputs, schema digest, and request identity.

Control transitions use compare-and-update revision predicates. A zero-row update is re-read and classified as replay, revision conflict, lifecycle conflict, or storage corruption; it is never retried by dropping the precondition.

### 9. Event and revision rules

`caseRevision`, `taskRevision`, `attemptRevision`, and `eventSequence` retain the meanings in `docs/PROTOCOL.md`.

- one accepted Case-level mutation increments `caseRevision` once, even when it emits multiple typed Events;
- a Task mutation increments only that Task revision plus the Case revision when Case-visible checkpoint, evidence, cancellation, or completion facts change as defined by the transition;
- an Attempt mutation increments only that Attempt revision and any Task/Case revisions whose canonical state also changes in the same transaction;
- Event sequences are gap-free within a committed database state; aborted transactions consume no visible sequence;
- Events record causation by request, dispatch, result, or reconciliation identity and correlation by Case/Task as applicable;
- Events cannot be edited, replayed as commands, or used as the sole current-state reader.

The first implementation slice must enumerate every transition-to-revision/Event matrix. An unlisted transition is rejected.

### 10. Reads, pagination, and rendering

`get_case` and `get_task` read canonical current rows and bounded related summaries in one SQLite read transaction. Each response identifies at least the Case revision and snapshot event sequence; a Task response also identifies its Task revision.

A pagination cursor is an opaque, untrusted, self-contained value with:

```text
cursor schema version
semantic capability and query digest
caseId and optional taskId
snapshot upper event sequence or immutable ordering bound
last emitted stable key
```

Every page revalidates the cursor, authentication, authorization, entity identity, query digest, and bounds. A cursor is not a bearer capability or stored lifecycle fact. Tampering produces `INVALID_CURSOR`; it never widens the query. Pagination uses stable `(sequence, id)` or `(created_at, id)` order and the fixed upper bound so concurrent later writes do not appear inside an earlier snapshot.

`render_task` derives a read-only presentation from the same canonical snapshot, applies the rendered-text bound, and returns explicit truncation plus a cursor or authorized Artifact reference when available. It does not persist a second summary owner.

M1 Artifact stubs contain only immutable metadata owned by CaseDO. A stub without committed byte ownership and digest cannot satisfy evidence or be read as a valid Artifact. R2 byte lifecycle remains a later implementation boundary.

### 11. Errors and evidence

Pre-routing ingress errors create no CaseDO transition:

```text
PAYLOAD_TOO_LARGE
INVALID_UTF8
MALFORMED_JSON
DUPLICATE_JSON_MEMBER
JSON_LIMIT_EXCEEDED
UNSAFE_JSON_NUMBER
INPUT_SCHEMA_INVALID
ONE_OF_NO_MATCH
ONE_OF_MULTIPLE_MATCH
UNION_DISCRIMINATOR_MISMATCH
```

Error details contain a bounded schema/instance pointer and reason but no raw request, secret, unauthorized identifier, or unbounded member name. Authentication and non-enumeration rules still apply before revealing owner-specific facts.

CaseDO errors preserve existing categories and add or refine:

```text
REQUEST_ID_CONFLICT
REVISION_CONFLICT
LIFECYCLE_CONFLICT
OUTSTANDING_REQUEST_MISMATCH
TERMINAL_IMMUTABLE
COMPLETION_EVIDENCE_INCOMPLETE
INVALID_CURSOR
STORAGE_VERSION_MISMATCH
STORAGE_CORRUPT
MIGRATION_REQUIRED
ROLLBACK_BLOCKED
```

Admission errors create no Task. A failure after Task admission remains a durable Task result or waiting state. A possible external effect remains typed uncertainty and is not normalized by M1 storage.

The authoritative evidence for a mutation is the committed current row, matching immutable receipt, contiguous Event rows, and observed response. Logs are diagnostic only.

### 12. Security and secret impact

The deterministic Case ID contains a one-way digest of non-secret deployment and request identifiers. It does not contain the MCP token, credential, raw objective, target path, or authorization facts.

Raw request bytes may exist only in bounded process memory during ingress and are not logged, persisted, attached to errors, or copied into Events. Canonical inputs are persisted only where their protocol records require them. Secret fields are not accepted by these semantic schemas.

Every read and mutation rechecks the authenticated deployment principal and requested Case authority. Knowledge of a Case ID, cursor, Task ID, or Artifact ID grants nothing. Unauthorized existence is not disclosed.

Mutation responses stored in receipts pass the same redaction and secret-negative validation as public results. A possible secret in a proposed response or Event aborts the transaction and is treated as a security incident, not truncation.

### 13. Compatibility, migration, and rollback

#### Compatibility

No public M1 endpoint or CaseDO database has been released. The M0 schema and generated types are a source foundation, not a deployed M1 stored-schema predecessor. The accepted design introduces a versioned M1 schema before runtime implementation; it does not reinterpret existing M0 bytes as persisted CaseDO rows.

The deterministic Case routing domain, mutation receipt semantics, status meanings, digest domains, and table schema version become compatibility contracts once the first M1 state is written. An additive field is not automatically compatible.

Old code that lacks the exact schema version or digest fails closed with `STORAGE_VERSION_MISMATCH`. It cannot partially read, default, or rewrite a newer database.

#### Migration

The initial migration is exact empty-state to CaseDO schema version 1. It runs transactionally before request service, creates all tables, indexes, and guards, writes `schema_meta` last, then reopens and validates the observed schema version and digest.

Subsequent migrations require:

- exact predecessor version and schema digest;
- a release-manifest migration identity;
- preflight compatibility and space/resource checks;
- an idempotent durable stage receipt owned by deployment lifecycle, not Case lifecycle;
- one transaction or an explicitly designed resumable sequence where the platform forbids one transaction;
- post-migration schema and canonical-row validation;
- fault injection after every durable stage.

A failed initial or later migration leaves the exact predecessor readable by its compatible release or leaves the deployment blocked with preserved evidence. It never marks the target version applied early.

#### Rollback

Before any CaseDO runtime exists, this documentation change can be reverted in Git.

After schema version 1 stores state, rollback to a source-only predecessor that does not understand CaseDO storage is blocked. A runtime predecessor is rollback-compatible only when its release manifest declares the resulting CaseDO schema version/digest and public semantic contract readable without loss. Otherwise rollback requires a separately accepted compensating migration or recovery export/import design.

This record executes no migration and proves no runtime rollback.

## 2026-08-04 implementation amendment: release policy and pre-storage correction gate

The maintainer approved the recommended cursor, migration, retention, and quota defaults and required all legitimately changeable values to be extracted from business logic for easy future revision. This amendment authorizes the source-level correction gate before CaseDO storage implementation.

The gate establishes one canonical non-secret release profile identified as `tdev.m1.default` version 1, generated TypeScript and Go views, a typed digest, immutable hard ceilings, startup validation, and drift checks. Release policy, deployment secrets, immutable/versioned protocol rules, and test-only overrides remain separate categories. A policy value may narrow behavior within its hard ceiling; a hard-ceiling, algorithm, state, security, compatibility, or persistence-semantics change requires a versioned owner/design change.

The same gate fixes exact `ValidationProofV1.rootDefinition` binding, cross-language digit/exponent limits before expensive integer work, typed ingress reasons, and the canonical public ingress order. It freezes the exact DDL, transition/revision/Event, twelve-capability semantic, cursor, migration metadata, retention, and quota contracts in `docs/PROTOCOL.md`; it does not implement Worker or CaseDO runtime behavior.

The approved M1 policy defaults are page 20/max 100, cursor TTL 3,600 seconds, 10,000 Tasks per Case, 100 Attempts per Task, 100,000 Events per Case, and 30-day R2 orphan cleanup eligibility. M1 performs no Event compaction, retains mutation receipts with their Case or recovery state, and never cleans referenced Event or Artifact metadata while referenced. Unknown Cloudflare byte limits remain unverified deployment constraints rather than invented guarantees.

## 2026-08-04 implementation amendment: CaseDO storage substrate

The first CaseDO SQLite source boundary is `edge/case-do/`. It introduces the minimal SQL adapter contract, exact schema-version-1 DDL, immutable and terminal triggers, schema and migration digests, atomic empty-to-v1 migration, reopen verification entrypoint, canonical stored-row codecs, and a narrow Case revision/Event/receipt transaction primitive. Production storage files do not import the Node SQLite driver; the Node adapter is deterministic test support only.

The frozen identities are schema digest `847e7a2cb1301b94c7618037a7ae196eebae8a58c3fe4b487f321975089d1c2e`, migration ID `case_do.empty_to_v1.v1`, and migration checksum `10b497ed040ef047a0fd7345cd886bb86462420c5476833fbc7cfdba39525788`. `schema_meta` is inserted last. Every pre-commit fault rolls back all objects; a typed post-commit response-loss result records that commit may already exist, and a newly opened repository independently verifies exact schema SQL and identity before use.

Implementation exposed one omission in the earlier table summary: canonical `MutationReceiptV1` can carry optional `taskId` and `subject`, so `mutation_receipts` also owns nullable `task_id` and a paired nullable `subject_kind`/`subject_id`, with a Task foreign key and reconstruction checks. These columns preserve the already accepted semantic type; they do not add a second receipt owner or a new public field.

This amendment defines a storage substrate, not completion of every semantic transition. The complete transition-to-revision/Event matrix remains an M1 acceptance condition across the storage, atomic-admission/replay, and control/query slices. Local `node:sqlite` tests prove only source and isolated SQLite behavior; Durable Object APIs, hibernation, instance restart, deployment, public MCP, current-client behavior, and runtime rollback remain unverified.

## Vertical slices

1. **Contract freeze:** accept this record, update the affected owners, register it, and point the Workboard at the accepted design without changing runtime code.
2. **M1 schema and proof foundation:** add the versioned M1 canonical schemas, ingress byte fixtures, validation-proof model, generated branch identities and domain converters, mutation receipt, control inputs, and exact cross-language vectors. No Worker or database yet.
3. **Pre-storage contract/source correction:** centralize the release-pinned typed policy profile; fix exact-root proof binding and cross-language number bounds; expose typed ingress/schema/proof reasons; reconcile ingress/auth ordering; and freeze the exact DDL, transition/Event, twelve-capability, cursor, migration, retention, and quota contracts. No Worker or database yet.
4. **CaseDO storage substrate:** add schema-version-1 SQLite DDL and exact migration, schema identity/reopen verification, canonical codecs, repository adapters, immutable guards, and bounded revision/Event/receipt primitives with isolated storage tests.
5. **Atomic admission and replay:** implement deterministic new-Case routing, Case-plus-first-Task transaction, receipt replay, request conflict, and commit-then-response-loss fault tests; add the corresponding rows and Events from the frozen transition matrix.
6. **Control and query core:** implement the remaining Case/Task/Attempt transitions including `cancel_task`, snapshot reads, cursors, rendering, evidence-gated completion, hibernation, and instance-restart tests.
7. **Worker semantic boundary:** route all twelve `tools-v1` semantics through the lossless ingress and canonical owners in one consolidated Worker/CaseDO integration suite. Agent dispatch remains stubbed at the M1 boundary and cannot claim M2.
8. **M1 verification:** run isolated Cloudflare Durable Object SQLite, hibernation, migration-failure, and public semantic probes required by M1; record only observed layers and mark this design `verified` only when every acceptance criterion below is evidenced.

Each slice uses final owner and dependency boundaries. No compatibility scheduler, global dedupe owner, mock-only alternate API, or generic shell fallback is permitted.

## Acceptance criteria

1. The repository has one accepted Design 0004 and no second Case/Task/dedupe owner.
2. Raw duplicate names at any nesting depth, including escaped-equivalent names, are rejected before ordinary decode in TypeScript and Go.
3. Invalid UTF-8, unsafe numbers, depth/token/container overflow, trailing JSON, and schema mismatch are rejected with matching cross-language outcomes.
4. Every generated `oneOf` value entering domain code has an exact validation proof and generated branch conversion; unproved `json.RawMessage` cannot enter storage.
5. A new-Case request deterministically routes to one `CaseDO` after Worker restart or response loss without a global request store.
6. Every CaseDO mutation has a request ID, semantic digest, immutable original response, and same-transaction mutation receipt.
7. Same request ID plus same semantic digest returns the original committed response even after current Task state changes.
8. Same request ID plus a different semantic digest or capability has no effect and returns `REQUEST_ID_CONFLICT`.
9. New Case, first Task, optional first Attempt, Events, revisions, and mutation receipt are atomically visible or wholly absent.
10. Case, Task, and Attempt terminal rows are immutable and one Task cannot have two nonterminal Attempts.
11. Current-row transitions, revision increments, Events, decisions, evidence mappings, and receipts obey the complete transition matrix under controlled races.
12. `cancel_task` records cooperative intent and cancellation racing with a valid success preserves the valid success.
13. Hibernation and instance restart preserve canonical rows, receipts, schema version, and bounded query behavior.
14. `get_case`, `get_task`, pagination, and `render_task` return bounded stable snapshots and no cursor or projection authorizes an effect.
15. Completion without complete, owned, digest-valid evidence at every mandatory layer is rejected.
16. Migration from exact empty state to schema version 1 is atomic; injected migration failure does not expose a falsely applied target version.
17. An incompatible stored schema or rollback target fails closed without mutating state.
18. The twelve semantic capabilities and `tools-v1` projection remain unchanged.
19. Source, generated, domain, storage, Worker integration, governance, static, and complete-diff gates pass at the applicable slice.
20. No installation, active Edge, Agent connection, public ChatGPT behavior, client schema, or rollback runtime is claimed without its independent probe.

## Verification matrix

| Claim | Command or probe | Authoritative reader | Layer | Contamination/skip rule |
| --- | --- | --- | --- | --- |
| design and owner coherence | `npm run check:governance` plus complete owner diff review | repository files and Git | contract/schema | missing owner, mismatched status, or unread design is not accepted |
| M0 remains unchanged in this design-only change | `npm run check:generated`, `npm test`, `go test ./...`, `go vet ./...` | generators and test processes | generated/unit/source | any changed generated output or skipped check blocks publication |
| ingress byte semantics | shared raw-byte fixture table in TypeScript and Go | runtime validators | protocol/unit | parsed-object-only tests cannot prove duplicate rejection |
| union proof | schema branch fixtures and compile/API checks preventing unproved storage input | generated converter and domain APIs | protocol/domain | a successful unmarshal alone is invalid evidence |
| isolated CaseDO storage substrate | `node --test edge/case-do/*.test.ts` plus exact DDL/digest review | canonical BLOB re-read, `sqlite_schema`, schema metadata, current rows, Events, receipts | storage/source | Node SQLite success does not prove Durable Object APIs, hibernation, restart, deployment, or rollback |
| deterministic new-Case route function | fixed deployment/request vectors | pure route function and derived Case IDs | storage/source | source vectors do not prove Worker routing, restart, deployment identity injection, or public behavior |
| atomic admission and replay | isolated transaction fault injection before/after commit plus canonical row, Event, receipt, and Task/Attempt counts | CaseDO SQLite rows plus stored original semantic response | storage/source | logs, response status, or a second reconstructed response do not prove state or exact replay; local SQLite does not prove Cloudflare persistence |
| transition atomicity | controlled race matrices and current-row/Event reads | CaseDO SQLite | storage/integration | sleep-based outcomes or internal field-only assertions are contaminated |
| persistence | hibernation and instance restart with canonical re-read | Durable Object SQLite | Cloudflare integration | in-memory repository tests do not prove persistence |
| migration | exact predecessor fixtures and injected stage failure | schema metadata and observed tables | migration | successful process exit without schema re-read is unknown |
| public semantic behavior | authenticated isolated endpoint exercising `tools-v1` | public MCP response plus CaseDO read | public MCP | source or SDK conformance alone is insufficient |
| current client schema | actual supported-client scan and calls | current client UI/schema observation | client | server publication alone is insufficient |
| rollback | compatible predecessor activation plus state/public probes | deployment, CaseDO, public endpoint, client | rollback | no compatible predecessor or missing probe is `ROLLBACK_BLOCKED`/unknown |
| source publication | exact commit/tree/status and independent remote branch read | Git and remote provider | source/remote | push acceptance alone is insufficient |

## Stop gates

- Do not begin M1 schema or runtime implementation until this design is `accepted` and the affected owner documents agree.
- The first implementation slice must introduce a versioned M1 canonical schema and generated validation-proof/domain-conversion boundary before any CaseDO repository or Worker route consumes public values.
- Do not persist generated Go `json.RawMessage` unions or call a parsed-value validator as evidence of duplicate-member rejection.
- Do not add a global request index, RequestDO, scheduler, Event replay owner, or fallback parser to solve routing or replay.
- If Cloudflare Durable Object SQLite cannot provide the required transaction, uniqueness, trigger/guard, migration, or hibernation behavior, set this record back to `draft` or `blocked` and revise the owning contract before implementation continues.
- Do not mark M1 `verified` until actual Durable Object, hibernation, response-loss, migration, public semantic, and required source gates pass.
- Do not claim public ChatGPT client compatibility, optional MCP extension support, installation, Agent, or rollback from M1 source evidence.
- Do not reduce `tools-v1` or change projection semantics under this record.

## Decision log

- 2026-08-04: the maintainer instructed that Design 0004 proceed in the repository-defined order; the instruction authorizes design work and, after coherent owner updates and source verification, acceptance of this bounded record, but not M1 implementation.
- 2026-08-04: duplicate JSON member rejection is assigned to a lossless raw lexical scanner before ordinary decoding in every public runtime.
- 2026-08-04: schema validation returns an ephemeral branch proof, and generated domain conversion must consume it before a `oneOf` value can enter state or storage.
- 2026-08-04: new-Case routing derives `caseId` deterministically from deployment identity and request ID, preserving CaseDO as the sole dedupe owner.
- 2026-08-04: every state-changing CaseDO semantic capability receives a request ID and immutable replayable response receipt.
- 2026-08-04: current rows remain lifecycle truth, Events remain audit records, and no event-sourced reconstruction path is introduced.
- 2026-08-04: the first stored CaseDO schema establishes a rollback barrier to predecessors that do not declare exact schema compatibility.
- 2026-08-04: the maintainer selected a single versioned non-secret release profile for mutable policy values, separate deployment secret injection, immutable compatibility ceilings, and production-inaccessible test overrides.
- 2026-08-04: cursor v1 uses canonical payload plus deployment-scoped HMAC-SHA256, and M1 keeps one `schema_meta` row with `migration_id` and `migration_checksum`.
- 2026-08-04: the recommended page, quota, retention, and orphan-grace defaults were approved; changing a hard ceiling or fixed M1 retention meaning requires a versioned design.
- 2026-08-04: implementation status resumed for the bounded contract/source-correction gate only; Worker, CaseDO runtime, Cloudflare, public MCP, client, and rollback layers remain unimplemented and unverified.
- 2026-08-04: pre-storage correction source commit `e4e0bdf5f32bfd6c1ffbd876e2ce46f8df3b9a4c` passed `npm run check:generated`, `npm test` including 13 TypeScript tests and all Go tests, `go vet ./...`, `git diff --check`, governance, forbidden-boundary, generated-drift, and complete effective-diff review. This verifies only repository source and contract layers; Design 0004 remains `implementing` and the next product slice is CaseDO storage core.
- 2026-08-04: CaseDO storage-substrate source commit `3cf29451a35453fb5b1bc54267b59e520ad92972` passed `job_13k_a93fc9da85`: generated drift, 25 TypeScript tests including 12 isolated storage tests, all Go tests, forbidden-boundary and governance checks, `go vet ./...`, `git diff --check`, exact schema/migration identity checks, production/test SQLite import-boundary checks, and complete effective-diff review artifact `artifact_14_dde71c27eb`. This verifies exact DDL/migration and isolated SQLite source behavior only. Design 0004 remains `implementing`; the next product slice is atomic admission and replay.
- 2026-08-04: the affected owner documents and verification matrix were reviewed as one bounded design, and portable source validation `job_mt_d2b3bb0f1e` passed generated parity, eight TypeScript tests, all Go tests, forbidden-import checks, and governance. The maintainer instruction is therefore effective as the explicit acceptance decision. Status moved to `accepted`; no M1 implementation or runtime effect began.
