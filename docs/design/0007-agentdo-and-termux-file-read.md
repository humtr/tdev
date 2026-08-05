# Design 0007 — AgentDO and Termux `file.read`

## Metadata

- Status: `accepted`
- Date: `2026-08-05`
- Acceptance authority: maintainer instruction authorizing the managed `concept-revision-1` MVP source pass
- Base source: `4cb1eb889af4069cb83dee6a1aa3184e9135b5bb`
- Affected owners: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, Design 0004, Design 0005, Design 0006
- Implementation paths: `protocol/schemas/`, `protocol/testdata/`, `protocol/generated/`, `tools/generate/`, `edge/agent-do/`, `edge/case-do/`, `agent/`, `cmd/tdev-agent/`, `package.json`, `scripts/check-governance.mjs`

## One-line definition

`One fenced AgentDO dispatches a bounded non-destructive file.read attempt to one Go Termux Agent, while CaseDO remains the canonical intent, reconciliation, and terminal owner.`

## Source classification

### Authority

- `docs/ARCHITECTURE.md` assigns Agent connection/queue ownership to AgentDO and local OS effects to the Termux Agent.
- `docs/PROTOCOL.md` owns Attempt identity, fencing, cancellation intent, evidence, result validation, and unverified outcomes.
- `docs/OPERATIONS.md` owns native operation safety and forbids arbitrary shell semantics.
- Design 0004 owns CaseDO lifecycle and terminal decisions.
- Design 0005 owns target-scoped generation and internal/wire representation boundaries.
- Design 0006 owns the public Worker boundary and typed Agent-dependent pending/deferred projection.

### Evidence

- At the base source, no `edge/agent-do/`, `agent/`, or `cmd/tdev-agent/` implementation exists.
- The documented architecture already distinguishes AgentDO queue/fence ownership from the Agent's OS effect ownership.
- Existing canonical Task/Attempt, cancellation, result/evidence, and unverified semantics provide the lifecycle foundation.

### Inference

- A single non-destructive `file.read` walking skeleton is sufficient to prove the ownership and reconciliation boundary before adding write or installer effects.
- At-least-once redelivery plus fencing and a local journal is safer and more honest than an exactly-once claim.

### Unknowns

- Actual Android/Termux process reclaim, reboot, storage durability, package install, battery, CPU, RSS, and network behavior are unobserved.
- Live Agent enrollment, credential rotation, public routing, and Cloudflare hibernation behavior are unobserved.
- The final production local journal location and package manager integration require device qualification.

## Baseline contract at design start

- CaseDO owns Case, Task, Attempt, Event, evidence, revision, cancellation intent, reconciliation, and terminal state.
- AgentDO may own one Agent connection epoch, visible queue, dispatch fence, lease, and acknowledgement state, but not OS effects or Case terminal decisions.
- The Go Agent rechecks local preconditions immediately before an OS effect.
- Cancellation intent does not prove that an effect did not occur.
- Stale epoch, lease, fence, Attempt, revision, schema, or digest results are rejected.

## Problem and evidence

The source lacks the smallest actual Edge-to-Termux effect path. Without an AgentDO queue/fence owner and a local Agent journal, a timeout cannot distinguish “not delivered,” “acknowledged,” “effect started,” “effect completed,” or “result lost.” The walking skeleton must make these states explicit without creating a second lifecycle owner.

## Scope

- Add strict shared TypeScript+Go wire roots for one `file.read` operation and Agent dispatch/ack/result envelopes.
- Implement AgentDO connection epoch, one visible execution slot, queue, lease/fence, acknowledgement, and result visibility.
- Implement CaseDO outbox/result reconciliation adapters without distributed transactions.
- Implement a minimal Go CLI/Termux Agent, local journal, path containment, bounded read, digest, cancellation, and restart recovery.
- Add source/emulator fault tests and update bounded owners.

## Non-goals

- No arbitrary shell, process spawn, Git mutation, install, deploy, file write, or package upgrade.
- No exactly-once, distributed transaction, AgentDO terminal decision, or Worker-owned queue.
- No claim of real Android process survival, reboot recovery, installation, battery, or cost completion.
- No broad Go generation for Edge-only public MCP roots.

## Invariants

- CaseDO remains the canonical intent, Attempt, result/evidence reconciliation, and terminal owner.
- AgentDO owns only connection epoch, queue visibility, dispatch lease/fence, bounded acknowledgement, and result visibility.
- Go Agent owns local filesystem access, local precondition checks, and local journal truth.
- One Agent ID has at most one execution slot in this slice.
- Redelivery is idempotent by Attempt/dispatch identity; execution is not claimed exactly once.
- A stale epoch, fence, Attempt, input digest, cancellation generation, or result digest cannot advance CaseDO.
- Network timeout and cancellation intent never imply no effect.

## Owner impact

- Existing owners changed: focused architecture, protocol, operation, security, deployment, and MVP sections during implementation.
- Owner added or removed: no second lifecycle owner; AgentDO and local journal own only the facts explicitly assigned here.
- Projections/caches introduced: AgentDO queue and acknowledgement visibility are bounded operational state, not canonical Case/Task state.

## Design

### Data and state

Shared canonical roots, generated to TypeScript and Go only when the concrete consumers are added, are:

```text
AgentFileReadInput
AgentFileReadResult
AgentDispatchEnvelopeV1
AgentAcknowledgementV1
AgentResultEnvelopeV1
```

They are not MCP public roots. Each target manifest entry names the concrete TypeScript AgentDO and Go Agent consumer paths.

The CaseDO-to-AgentDO sequence is:

```text
CaseDO records intent and Attempt/outbox
-> AgentDO accepts dispatch with connection epoch and fence
-> Agent acknowledges receipt
-> local effect may start
-> Agent emits result and evidence
-> AgentDO exposes bounded result visibility
-> CaseDO validates Attempt, epoch, fence, revision, schema and digests
-> CaseDO records reconciliation
-> verified terminal or explicit unverified
```

No step assumes a cross-object atomic commit.

#### AgentDO state

AgentDO owns:

- monotonically increasing connection epoch,
- one active connection identity,
- bounded queue entries by dispatch/Attempt identity,
- dispatch lease and fence,
- acknowledgement visibility,
- result envelope visibility and delivery acknowledgement,
- bounded expiry and cleanup rules.

It does not write Case/Task/Attempt terminal state and does not infer effect success from connection state.

#### Local journal

The Go Agent journal records:

```text
dispatchId, caseId, taskId, attemptId,
connectionEpoch, fence, cancellationGeneration,
inputDigest, operation state, result digest, evidence reference
```

State transitions are written through an owner-defined atomic replacement or append-and-fsync protocol. Partial or corrupt records fail closed and surface typed reconciliation/operator evidence; they are never silently discarded as success.

### API and dependencies

Approved source layout:

```text
edge/agent-do/README.md
edge/agent-do/protocol.ts
edge/agent-do/queue.ts
edge/agent-do/connection.ts
edge/agent-do/service.ts
edge/agent-do/index.ts
edge/agent-do/*.test.ts

agent/core/
agent/operations/
agent/storage/
agent/hosts/termux/
cmd/tdev-agent/
```

The first CLI exposes only the fixed Agent runtime entry and the registered `file.read` operation. It is not a generic command runner.

`AgentFileReadInput` contains an explicit grant/root identity, canonical relative path, bounded offset and length, expected preconditions, and cancellation generation. `AgentFileReadResult` contains bounded bytes or a typed externalized reference policy, actual byte count, SHA-256 byte digest, observed precondition/revision evidence, completeness, and typed error state.

### Ordering, concurrency, retry, and cancellation

- AgentDO serializes the one execution slot and rejects stale connections and fences.
- The Agent validates envelope schema/digest, journal state, grant/root, cancellation generation, and local preconditions immediately before opening the file.
- Path validation rejects absolute paths, empty or non-canonical components, `..` escape, and symlink/realpath escape from the granted root.
- The file is opened read-only with no write-capable flags.
- Offset, requested length, returned bytes, path length, evidence, and result size have hard ceilings.
- Cancellation is checked before the effect and during bounded reads. A race with a valid completed result is reconciled by CaseDO policy rather than overwritten as cancelled.
- Duplicate dispatch reads the journal: a validated stored result is returned, an in-progress record is reconciled, and a conflicting input digest fails closed.
- Disconnect before acknowledgement, after acknowledgement, after effect, or before result are distinct observable states.

### Errors and evidence

Typed failures include invalid envelope, stale epoch, stale fence, stale Attempt, cancellation generation mismatch, unauthorized root, path escape, not found, permission denied, precondition conflict, size bound, I/O uncertainty, corrupt journal, result digest mismatch, and reconciliation conflict.

A verified success requires:

- accepted current Attempt/fence,
- matching input digest,
- bounded read result and byte digest,
- required local precondition evidence,
- CaseDO reconciliation commit.

Otherwise the canonical result is pending, failed, or unverified as owned by CaseDO.

## Security and secret impact

- Agent credentials are separate from public client credentials and are never stored in request fixtures, repository files, logs, or journal payloads beyond opaque credential generation identifiers.
- Granted roots are explicit enrollment/authorization facts; caller-provided absolute paths are never accepted.
- Symlink and realpath containment is checked at effect time to reduce TOCTOU escape.
- Journal permissions and location are fixed by the Termux host adapter and verified during real-device qualification.
- Result and evidence bytes are bounded before transmission and logging.

## Compatibility, migration, and rollback

- Compatibility: shared Agent roots are introduced only with both TypeScript and Go consumers. Edge-only roots remain TypeScript-only.
- Migration: no live Agent queue or journal migration is claimed in the source slice. The first installed journal version starts empty under an exact release/profile identity.
- Rollback: source rollback returns to the last compatible Worker/CaseDO commit. Installed rollback requires a compatible Agent binary, journal reader, queue schema, credentials, and CaseDO reconciliation reader; otherwise it is blocked and must be reported unverified.

## Current implementation status

Accepted at base `4cb1eb889af4069cb83dee6a1aa3184e9135b5bb` and queued after Design 0006 source publication. No AgentDO, Go Agent, shared Agent roots, package, install, real device, battery, reboot, or recovery completion is claimed at acceptance time.

The durable Agent source commit must begin from the exact published Worker source commit. If the managed session stops, resume from the last local or published commit and Task checkpoint, never from an orphaned worktree or uncommitted assumption.

## Vertical slices

1. Add shared roots, target entries, fixtures, and exact TS/Go consumers.
2. Implement AgentDO connection epoch, one-slot queue, fence, acknowledgement, and result visibility.
3. Add CaseDO outbox and idempotent result reconciliation.
4. Implement Go envelope validation and durable local journal.
5. Implement bounded read-only `file.read` with containment and cancellation.
6. Add duplicate, stale, disconnect, restart, corruption, tamper, and cancellation-race tests.
7. Run full source validation and exact-lease publication.
8. Leave real-device/install/cost/reboot qualification as a separate explicit gate.

## Acceptance criteria

1. All five shared roots have concrete TypeScript and Go consumers and deterministic parity fixtures.
2. AgentDO enforces one connection epoch, one execution slot, and stale-fence rejection without writing lifecycle terminals.
3. CaseDO records intent before dispatch and reconciles result idempotently without a distributed transaction.
4. Duplicate delivery never creates a conflicting second result or hides uncertainty.
5. `file.read` rejects absolute, traversal, symlink escape, stale precondition, stale fence, and oversize requests.
6. The Agent uses only read-capable filesystem access and produces bounded digest-backed evidence.
7. Journal reopen after process death returns or reconciles the same accepted result; corruption fails closed.
8. Cancellation races preserve a valid success or explicit unverified outcome according to CaseDO policy.
9. Source tests, parity, generated drift, portable validation, `go vet`, diff check, governance, complete diff review, clean commit, exact-lease push, and provider verification pass.
10. Real Android/Termux install, process reclaim, reboot, CPU, RSS, network, battery, and rollback remain explicitly unverified until independently observed.

## Verification matrix

| Claim | Command or probe | Authoritative reader | Layer | Contamination/skip rule |
| --- | --- | --- | --- | --- |
| shared wire parity | schema fixtures plus TS/Go tests | canonical schema and both runtimes | source | missing consumer or target entry is failure |
| queue/fence correctness | AgentDO table/fault tests | AgentDO source harness | source | stale case not exercised is unknown |
| reconciliation idempotent | CaseDO/AgentDO integration tests | CaseDO receipt/event reader | source | connection state alone is not evidence |
| file containment safe | Go operation and adversarial filesystem tests | Go Agent result/evidence | source | unsupported symlink test is unknown |
| journal recovery | kill/reopen/corruption tests | local journal reader | source | in-memory-only journal is failure |
| source package coherent | registered portable, `go vet ./...`, diff check | tmcp Job and Git | source | dirty tree invalidates result |
| Android lifecycle | real Termux kill/restart/reboot probes | device process and journal | device | emulator/source evidence is insufficient |
| install and rollback | exact package/release probes | installer and active binary | install | build success is insufficient |

## Stop gates

- An unresolved grant/root, symlink containment, journal durability, cancellation generation, fence, or result reconciliation contract blocks the dependent effect.
- A shared root without both concrete consumers blocks Go generation.
- Missing device, credentials, or installer blocks only real-device qualification, not source completion.
- Any requirement for generic shell, write access, or exactly-once semantics is rejected and requires a new accepted design.

## Decision log

- `2026-08-05`: Maintainer accepted Design 0007 as the queued Agent source gate following Design 0006.
- `2026-08-05`: AgentDO owns connection/queue/fence visibility only; CaseDO owns reconciliation and terminal state.
- `2026-08-05`: Delivery is at-least-once with idempotent reconciliation; no exactly-once or distributed transaction is claimed.
- `2026-08-05`: The first and only native effect is bounded read-only `file.read`.
- `2026-08-05`: Shared Go generation is authorized only with concrete Design 0007 TypeScript and Go consumers.
- `2026-08-05`: Real-device, install, reboot, performance, battery, and rollback remain independent follow-up gates.
