# D0004 - MCP controller contract

- Design: `D0004`
- Title: `MCP controller contract`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003, D0006]`
- Supersedes: `[]`
- Directive: `r2`
- Owns: `public-mcp-schema, controller-recipes, observation-contract`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

ChatGPT needs bounded composable capabilities, not another reasoning agent and not one tool for every internal method. Define enough public detail that the next session can implement schemas without inventing lifecycle or authority.

## Required outcome

Four tools support current context, bounded reads, durable mutations and observation/recovery. They work over stateless HTTP reconnects, support independent calls concurrently, and can operate the same architecture at capacity 1, 8, 16 or more. No tool takes arbitrary host shell, executable, credential or deployment scope.

## Facts / assumptions / unknowns

ChatGPT tool-call scheduling is a client property and is not assumed to issue eight simultaneous model calls. One bounded request may admit multiple independent items so eight backend actions can overlap even with a sequential client. MCP transport/schema support must be tested with the actual connected ChatGPT client; simulator success is not experiential proof.

## Decision

Expose exactly `dev_context`, `dev_read`, `dev_work`, `dev_observe` initially. Use Streamable HTTP at the stable canonical `/mcp` origin. Implement the current `2026-07-28` protocol, including `server/discover`, per-request protocol metadata and the specified complete/error result envelopes; also expose the small `2025-11-25` initialize/initialized transport adapter for existing clients. Both dispatch to the same four domain tools. Pin conformance fixtures to the official protocol specifications; do not require optional MCP Tasks, sampling or model APIs. Sessions and SSE delivery are transport conveniences, never work identity or success evidence. Validate Origin/Host and authenticate each request. Bounded polling is sufficient; no notification subsystem is required.

All tool input/output schemas are closed tagged unions (`additionalProperties:false` recursively). `apiVersion` is integer `1`. IDs are opaque strings 1..128 ASCII safe identifier characters; revisions are decimal strings representing nonnegative 64-bit integers. Digests carry algorithm prefixes. All documented defaults appear in published schemas. Breaking schemas require a Design revision and actual client refresh verification, not mislabeled annotations.

Common successful envelope: `{apiVersion:1, ok:true, data, observedAt, runtime:{releaseId,schemaDigest}}`. Domain failure: `{apiVersion:1, ok:false, error:{code,message,retry:{sameRequest:boolean,afterMs:null|integer},facts}}`; a failed tool call does not imply its previously admitted action did not run. Malformed JSON-RPC remains a protocol error. Facts are bounded and redacted. Terminal action receipts remain authoritative only for their named effect/layer.

### `dev_context`

Input `{apiVersion, repository?:bindingId, freshness?:"current"|"pinned", snapshotId?:id}`; defaults repository=self, freshness=current. Pinned requires snapshotId. No source paths are baked into this call or the runtime.

Returns binding identity/epoch/provider ID/ref, exact commit/tree/manifest, snapshotId, context expiry, policy digest, capacity and current limits, bounded root entries, authority-document paths, available named profile descriptors (IDs, parameter schema and effects) and recovery query hints. When the canonical branch moved, current returns a new snapshot; pinned can refresh an authorized old snapshot without pretending it is current. It does not create work or execute validation. Source inspection is `dev_read`.

### `dev_read`

Input `{apiVersion, target, queries:[Query], maxReturnBytes?:integer}`. Target is exactly one of `{snapshotId,freshness:"current"|"pinned"}`, `{workId,generation}`, or `{actionId,artifactId}`. Queries are:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `list` | `path`, optional `cursor`, `limit` | One bounded directory page; empty path means root. |
| `search` | `paths`, `literal`, optional `cursor`, `caseSensitive`, `maxHits` | Literal search with explicit scan coverage, no arbitrary regex engine. |
| `file` | `path`, optional `startByte`, `maxBytes`, `encoding` | Exact blob range, `utf8` or `base64`; defaults byte 0, 64 KiB. |
| `diff` | `baseSnapshotId`, optional `paths`, `cursor` | Structured entry differences against exact base, not an executable patch. |
| `artifact` | `startByte`, `maxBytes` | Bounded action-owned logs/results only for artifact targets. |

At most 32 queries by initial request-size policy; directory/file/search budgets are owned by D0002 and included in descriptors. Return a result for each query with exact target identity, path/mode/blob digest, offsets, bytes, complete/truncated flags and continuation. Never silently substitute a newer work generation. Source and output text are untrusted content. A policy-denied path does not become available through search, diff or artifact aliases.

### `dev_work`

Input `{apiVersion, items:[Item], waitMs?:integer}`. Initial transport policy accepts 1..64 items and 1 MiB total JSON; 64 is a request-size budget, not a concurrency or lifetime-work ceiling. Clients page larger sets. waitMs defaults 0 and is bounded 0..20000. Each item owns `requestId` and is validated/admitted independently; order in the envelope is not a dependency. Return per-item admitted/rejected receipt even when a sibling fails. No envelope transaction or DAG. Cross-item references to IDs created in the same envelope are disallowed; use explicit subsequent calls.

| `op` | Required semantic fields beyond requestId | Effect |
| --- | --- | --- |
| `create` | `snapshotId`, `expectedHead`, `objective`, optional `initialEdits` | New random stable work ID at current exact base; initial edits atomic with creation. |
| `edit` | `workId`, `expectedRevision`, `expectedGeneration`, `edits` | Atomic candidate generation replacement under D0002. |
| `run` | `workId`, `expectedRevision`, `generation`, `profileId`, `policyDigest`, `parameters` | Named diagnostic/generator profile, no automatic source adoption. |
| `validate` | `workId`, `expectedRevision`, `generation`, `expectedHead`, `policyDigest` | Prepare/freeze and validate exact D0003 result; return preparedResultId and receipt, without publication. |
| `integrate` | `workId`, `expectedRevision`, `generation`, `expectedHead`, `policyDigest`, optional `preparedResultId` | Reuse an explicitly eligible frozen result, or prepare/validate it; publish that exact commit through D0003 CAS. |
| `cancel` | `workId`, `expectedRevision`, optional `actionId`, `reason` | Cancel one action or close work, subject to effect reconciliation. |
| `resume` | `workId`, `expectedRevision`, `actionId` | Reconcile/retry the same safe blocked attempt; no new logical mutation or candidate. |
| `policy.adopt` | `repository`, `expectedPolicyDigest`, `integratedCommit`, `policyPath`, `newPolicyDigest` | Privileged adoption under D0003; candidate cannot self-adopt. |
| `release.stage` | `repository`, `integratedCommit`, `expectedActiveRelease`, `policyDigest` | Build/check/seal exact runtime artifact under D0006. |
| `release.activate` | `repository`, `stagedReleaseId`, `expectedActiveRelease` | Privileged recoverable handoff through the fixed helper. |

Create/edit entries are tagged `{kind:"put",path,expectedEntry,mode,content,encoding}`, `{kind:"delete",path,expectedEntry}`, `{kind:"move",from,to,expectedEntry,expectedDestination:"absent"}` or `{kind:"exact_edit",path,expectedEntry,oldText,newText}`. `expectedEntry` is `"absent"` or `{blobDigest,mode}`; content is exact UTF-8/base64 bytes. At most 256 entry edits and request byte limit; larger logical changes use successive generations then one integration. No caller-controlled scripts or undeclared environment fields. Objective is bounded 4096 characters and has no executable semantics.

Every item is first authorized, then dedup lookup precedes stale revision checks (D0001). A duplicate with identical intent returns the same work/action/effect even if its expected revision is now old. Results include `requestId`, `workId|null`, `actionId|null`, current revision/generation, state and minimal next observation selector. Prepared-result outcomes additionally include `preparedResultId`, exact commit/tree/expectedHead and validation receipt identity; observation returns the same retained descriptor, never a regenerated commit. Admission is not completion. Create/edit can finish inline; run/validate/integrate/stage/activate persist before execution. Server-generated action IDs are returned when available; response loss is recovered by requestId. Concurrent updates to the same work use revision CAS; unrelated works do not share it.

### `dev_observe`

Input `{apiVersion, repository?:bindingId, selector, waitMs?:integer, cursor?:id, limit?:integer}`. Selector is `{workIds:[id]}`, `{actionIds:[id]}`, `{requestIds:[id]}`, `{open:true}`, or `{runtime:true}`. IDs max64 per request, limit default32/max128, wait 0..20000. `open` is authorized principal/repository scoped, ordered by stable created sequence, and includes blocked/cancellation-pending items; continuation is not limited to eight lanes. Optional `afterRevision` on ID selectors enables bounded change waits. No query clears state or starts work; normal dispatcher recovery does not depend on polling.

Return per work exact base/candidate generation, latest revision, disposition, active action states, required validation identity/outcomes, effect certainty, blocker/conflict identities, retryability and bounded artifact handles. Integration terminal includes exact expected old ref, committed SHA/tree/manifest, validation receipt digest and fresh canonical ref readback/time. Runtime selector returns source HEAD separately from active/staged release IDs, activation record, toolchain, capability probes and unresolved effects. Failed, skipped, unavailable and not-run layers remain distinct.

`resume` is a mutation, not a read side effect. Observation after a lost integration response must find the original request/action before any new integration. A newer canonical descendant does not erase the original successful receipt. Readback unavailable is explicitly marked; an old cached head is not current completion proof.

### Controller recipes

Known-file ordinary change: context, bounded file read, create with exact initial edits, integrate, observe. Unknown-context change adds bounded list/search/file expansion; no deployment. Optional validate before integrate returns an immutable preparedResultId. Pass it with the latest work revision and the same generation/expectedHead/policy to reuse the exact validated commit under a different action ID. An ineligible explicit result is rejected, never silently rebuilt; omitting it requests preparation and validation in integrate. Diagnostic run is available for feedback that is not integration eligibility. Fix validation failure by edit with current revision, then new integrate request. For eight independent tasks, submit eight creates, submit eight integrate/run actions, observe all; backend admission permits concurrency even if ChatGPT called one envelope at a time. Handle same-ref stale losers by fresh context/read and a new bounded integration intent, never force overwrite. A true changed-entry conflict needs a replacement work at the new base, not a hidden rebase of the old work. A lost response repeats the same request ID or looks it up. New session starts context then open/request selectors; prior chat history is unnecessary.

Annotations are truthful: context/read/observe are read-only; dev_work is mutating, may have destructive source edits and external provider effects, so it uses conservative `readOnlyHint:false`, `destructiveHint:true`, `openWorldHint:true`, with `idempotentHint:true` only for the documented request-ID-bound effect semantics. Its identity-bound operations are idempotent as documented, not arbitrary replay-safe payloads. UI hints never grant capability or bypass user/tool permission controls.

## Failure and recovery

Required error vocabulary includes `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_ARGUMENT`, `LIMIT_EXCEEDED`, `CONTEXT_EXPIRED`, `STALE_CONTEXT`, `STALE_REVISION`, `STALE_BASE`, `ENTRY_CONFLICT`, `INTEGRATION_CONFLICT`, `NO_CHANGE`, `IDEMPOTENCY_MISMATCH`, `CAPACITY_REJECTED`, `VALIDATION_FAILED`, `EXECUTION_UNAVAILABLE`, `EFFECT_UNCERTAIN`, `CONTENDED_REF`, `STALE_RELEASE`, `UNSUPPORTED_REPOSITORY_FEATURE`, `INTEGRITY_FAILURE`, `STORAGE_PRESSURE`, `ENCODING_BOUNDARY`, `STALE_RESULT`. Facts identify the failed precondition without disclosing secrets. Errors that require a new intent set sameRequest=false; network loss of an admitted intent permits sameRequest=true. Exhausted waits return pending, never fabricated timeout failure of durable work.

## Alternatives

Sixteen inherited tools have no requirements-based justification. A single unrestricted shell is unsafe and noncomposable. A generic operation registry plus schema-fetch-before-every-action adds round trips for a small fixed vocabulary; reject it for first release. Four tools separate read/mutate/observe UX while typed variants avoid capability explosion. A batch scheduler/DAG object is unnecessary because ChatGPT owns decomposition and ready independent actions are enough.

## Acceptance

Generate closed JSON Schemas and test every variant, bad field and limit. Contract transcripts must demonstrate known/unknown context, eight-item admission, one sibling failure, response-loss lookup, stale edit, validation failure repair, integrated readback and runtime update. Reconnect without MCP session ID and recover the same work. Run actual ChatGPT against the canonical endpoint; do not substitute tool-list/schema success for the full source-change chain.

## Implementation consequences

`src/mcp/` owns protocol adapters only; domain/storage APIs are internal, not opaque public shell. Publish examples as contract tests. No model SDK, subprocess or token belongs in core dependencies. Truthful annotations and actual client usability are release acceptance requirements.

## workers.dev ingress and intermittent-device observation

The installed public MCP origin is the exact workers.dev binding from D0006.
The gateway applies D0005's explicitly selected Access-application authentication
profile; it does not parse an opaque Managed OAuth bearer as a JWT or trust a header
without signature/audience verification. Device and execution-session endpoints are
private machine roles on that origin, not additional public MCP tools.

Four tools and all typed operation shapes remain unchanged. The relay has no
admission authority. When offline before forwarding, return EXECUTION_UNAVAILABLE
with delivery=not_sent; after possible forwarding, report delivery=unknown and
same-request retry, never claim a mutation did not occur. Source/current terminal
truth requires the device owner. Immutable tool discovery and edge health may remain
available, but last-seen device/release information is explicitly stale. HTTP/WS
correlation IDs and connection nonces do not replace work/action/request identities.

A runtime observation separates repository source HEAD, edge version, device release,
managed controller release and pending activation. Only a confirmed compatible bundle
is activeRelease. Partial rollout stays nonterminal/blocked until readback or rollback.
Changes to closed output projection must add these observations under the existing
runtime result contract, not expose raw provider credentials or a generic proxy.
Actual ChatGPT registration/usability of the typed union remains a required live
trial; local schema bytes and synthetic transcripts do not satisfy it.

### Closed transport-error projection

`EXECUTION_UNAVAILABLE` caused by transport delivery preserves `facts.delivery`
exactly as `not_sent` or `unknown` and sets `retry.sameRequest: true` through the
ordinary failure encoder. It must not collapse to INTEGRITY_FAILURE or lose replay
guidance. DeliveryUnavailable is a bounded domain error, never a terminal work
state. Other unknown fact keys and arbitrary peer exception details remain rejected.
