# D0003 - Required validation and exact canonical integration

- Design: `D0003`
- Title: `Required validation and exact canonical integration`
- Status: `accepted`
- Depends-On: `[D0001, D0002]`
- Supersedes: `[]`
- Directive: `r5`
- Owns: `validation-identity, canonical-integration, stale-conflict-semantics`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.

## Problem

A passing candidate at base B is not necessarily a passing combined result at a newer canonical head H. Validate the exact frozen result, not a patch that will later be transformed. A lost response for A must not unnecessarily stop an independent B on the same ref.

## Required outcome

Only an exact result passing all required validation can enter the canonical ref. Retrying or moving from a validation action to an integration action cannot produce another commit for the same prepared result. Concurrent updates are linearized by expected-old-ref CAS, not a global validation/recovery lock.

## Facts / assumptions / unknowns

The initial managed ref must reject deletion and history rewrite, with verified exclusive normal-write authority for the dev-2 integration principal. Merely restricting outsiders to fast-forward updates is insufficient: they could introduce unvalidated bytes. Provider policy and actual expected-old-ref behavior must be verified in a disposable live fixture before integration is enabled. Administrative/break-glass writes are outside normal operation and require explicit binding-epoch reconciliation; a foreign canonical change is not silently blessed. GitHub REST force:false alone is not the chosen exact-CAS mechanism. No throughput advantage is established by acceptance of this Design.

## Decision

### Validation authority

The broker's adopted, digest-pinned validation policy defines mandatory profile IDs, trusted controller/runner digest, fixed commands, toolchain/image/environment identities and budgets. It is bound to the repository binding and current policy version. A caller may add diagnostics, never remove mandatory validation. A candidate file, test output or fabricated receipt cannot grant eligibility.

Initial project policy requires the complete core and integration profiles in D0007 for each source result. A release additionally requires release and affected sandbox/security/activation checks. Live experiential and comparative benchmarks are D0007 performance-decision evidence, not a second qualification workflow on every edit. Under DIRECTIVE r5, unrun formal benchmark cohorts do not reopen the owner-closed first release. No change-impact skipping is initially trusted.

Policy adoption is an explicit policy.adopt effect under policy.write, referencing an already integrated policy artifact and the expected old digest. Its introducing work must pass the old policy; new validators are tested before adoption. Reductions require an explicit scoped policy-change intent and cannot violate the Directive. A candidate may not self-adopt the weaker policy it needs to pass. Changes to a trusted entrypoint, test selector or toolchain are evaluated by the old trusted controller, not solely by the proposed replacement. Ordinary repository tests remain untrusted sandbox input. Validation proves configured assertions, not absence of all malicious code.

### Prepared result and exact receipt

A prepared result has random 128-bit resultId R, repository/epoch, workId, selected generation and its base B/tree T, expected current head H, full composed tree U and strong manifest, adopted policy, and one frozen direct-child commit C. R is independent of the action that prepares, validates or publishes it. Its descriptor is immutable data retained with validation/action records, not a new coordinator or mutable lifecycle owner.

Freeze the actor from authenticated policy, commit message template, timestamp, parent H and tree U once. Include a Dev2-Result trailer naming R, never the currently calling action ID. Create and persist exact commit bytes/OID C BEFORE running required validation. The trusted runner receives C/U and the frozen metadata descriptor as read-only inputs; candidate execution does not receive writable Git metadata. Retried preparation of the same action resumes the retained R/C rather than drawing another timestamp or result ID.

Using D0001 canonical encoding and domain dev2.validation-identity.v1, hash the record of repositoryId, bindingEpoch, resultId, baseHead H, commitOid C, resultTreeOid U, resultTreeSha256, policyDigest, orderedProfileDigests, trustedRunnerDigest, toolchainDigest, environmentClass and dependencyLockDigest. This validationId is identity, not success.

An attempt receipt separately records unique run ID, attempt/owner epoch, sandbox identity, start/end, exit/signal/deadline, all mandatory profile outcomes, tracked input/output integrity and trusted receipt signature/MAC. Only broker-verified, current-policy receipts for the exact R/C/U with every required profile successful and no tracked-byte drift are eligible. Failed, cancelled, absent or unadopted stale-epoch callback receipts are never eligible. A receipt authenticated and durably admitted under its then-current observer remains immutable evidence after a broker restart: restarting the observer does not alter its signed launch tuple or repeat already-completed validation. The admission boundary must reject late old-observer callbacks before storing their receipts; only current-owner reconciliation of the exact selected provider run, stopped attempt and sealed result can admit recovered evidence. Eligibility then rechecks the retained exact result, current binding/policy and execution identity, not equality between historical launch epoch and today's observer epoch. This distinction is enforced by the existing immutable-receipt restart tests and the Phase B full-tuple callback/recovery tests. Changing H, U, C, policy or a required execution-identity field requires a new prepared result and validation.

A validate action accepts expectedHead H, applies the same authorization, freshness, conflict and composition checks in integration steps 1-3, prepares R/C and returns preparedResultId=R with its receipt, without publication. An integrate action may explicitly name that R. When work/generation, H, immutable metadata, policy and required execution identity still match, it reuses exactly C and the successful receipt even though its action/request ID differs. No commit is regenerated and no mandatory test is repeated solely because the operation changed from validate to integrate. An explicit R that no longer matches is rejected; it is never silently replaced. With no explicit R, integrate prepares and validates a result in that one durable action. Early diagnostic run remains separate and does not confer integration eligibility.

### Exact integration algorithm

An integrate action names one open work/generation, expected work revision, fresh expected target head H, policy digest and optional preparedResultId.

1. Recheck authorization, epoch, selected generation and required policy. Observe the authoritative ref; a head mismatch is STALE_BASE with bounded current-context facts, not substitution inside the accepted intent.
2. Let B/T be the original work base/tree. At H=B, U=T. Otherwise require B to be an ancestor of H in the verified managed lineage. For every delta path B->T, require the H entry still equals the B entry, including mode/type; creations/destinations require absence and no file/directory collision. A mismatch is INTEGRATION_CONFLICT. No fuzzy or same-file textual merge is automatic. A true conflict is resolved by ChatGPT inspecting H and creating replacement work with newly justified edits; the old immutable base is not rebound.
3. Apply the exact delta to H in private immutable-object construction, producing complete tree U. Reuse the explicitly requested eligible R/C, or freeze a new R/C as above and run required validation on that full result. Disjoint paths do not imply semantic independence. Preserve B/T separately; U is a prepared integration result, not a hidden candidate mutation. A no-op returns NO_CHANGE without a commit.
4. Persist publication intent containing exact H/C/R/U, target ref, policy, successful receipt, work/generation, effect ID and authorization identity. Reserve only this work's integration eligibility by transactional revision fencing. Immediately before dispatch, recheck authorization/policy, generation reservation, receipt and expected head. No sandbox run, network request or process wait occurs inside a SQL transaction.
5. Publish exactly C with one provider expected-old-ref operation. The Git adapter may use --force-with-lease=<full-ref>:<H> only after proving C has sole parent H and the expected full tree/bytes. This is an expected-value guard, never permission to rewrite history. Never use an unqualified lease, force, mirror, wildcard or multiple refspecs. No branch-wide lock is held over push or reconciliation; the remote CAS owns serialization of that actual ref transition.
6. Read the authoritative ref and prove C is the head or an ancestor of a later verified managed fast-forward head. Atomically finalize this effect/work and record observedHead separately from integratedCommit C. Return terminal success only with readback evidence. Lost local finalization is repaired from the same persisted intent and remote ancestry, not by creating another commit.

### Concurrency, ordering and recovery

Independent works compose, validate and attempt publication concurrently, including on one ref. Ready actions have deterministic dispatch order (readySequence, actionId), skipping blocked work. The winner is the operation accepted first by remote CAS; network arrival order is not falsely promised to be reproducible. Given the observed canonical order, eligibility and outcomes are deterministic. There is no mandatory merge train, batch owner, per-path distributed lock or global ref-recovery queue.

After C advances H, another old-H direct child cannot publish. It retains its candidate and passed-but-ineligible receipt and returns STALE_BASE. The caller discovers current H and submits a new intent; mechanical recomposition is followed by required validation of the new complete result. The default client recipe permits three fresh-head attempts before reporting CONTENDED_REF without losing work. Retry policy is not a concurrency cap.

An unresolved response is not a failed push. Reconcile the exact frozen (H,C,ref) intent:

| Observation | Meaning/action |
| --- | --- |
| Ref is C or a proven descendant of C | Integration occurred; finalize this same result/effect/work. |
| Ref is H and the prior push process is confirmed ended | The same C may be retried against the same H, after current authorization/policy checks. |
| Ref is another descendant of H, excluding C | In the managed no-rewrite lineage this effect did not integrate and cannot later replace that newer head with the frozen old-H CAS; report stale. |
| Remote unreachable, incomplete ancestry, or unresolved sender while ref remains H | Keep this effect/work nonterminal and observable; never invent another C or duplicate its sender. |
| Ref deletion/rewrite, foreign update or loss of the append-only/exclusive-writer guarantee | Fence the affected binding's canonical effects and require authorized epoch reconciliation. |

Crucially, A's unresolved sender or ledger finalization is not by itself a reason to fence independent B on the same ref. B may freshly observe the ref, prepare/validate its exact result and use its own CAS. If A actually wins a competing old-H CAS, B receives a genuine stale outcome; if B wins, A's delayed old-H CAS cannot overwrite it. If B observes A's already-published C, it may extend C while A's local receipt is still unfinished. Proof relies on immutable persisted intents, exact CAS and the verified append-only writer boundary. No second sender for A is started until A's prior sender is known stopped. Quarantine consumes A's resource reservation only; an actual shared provider outage or full resource budget is reported separately, not disguised as A owning the ref.

The external ref and local ledger are not a distributed transaction. There is one remote linearization point and an explicitly recoverable observation gap. One-ref atomic publication leaves an entire committed tree, never partially applied files. Provider unavailability may leave outcome unknown; it cannot justify fabricated success or an untracked replacement effect. Referenced result/commit/receipt bytes and request tombstones remain retained while needed for reconciliation.

### Cancellation and failures

Cancellation before publication intent prevents dispatch. During a possibly active push, reconcile the exact effect before declaring cancellation terminal. If C integrated, report integrated with cancellationTooLate; never reset the ref. Changed policy invalidates pre-dispatch eligibility even after a previous pass. Permission rejection is an explicit failure, not an unbounded retry. Crash-test preparation, validation, intent persistence, remote acceptance, readback and local finalization independently.

## Alternatives

Validate a patch then cherry-pick is rejected because tested and published bytes may differ. Regenerating commit metadata during integration breaks exact prepared-result reuse. A ref fence held through unknown response recovery adds serialization beyond the remote CAS invariant and is rejected. GitHub force:false alone is insufficient for exact H. A database/Git distributed commit or Promotion lifecycle is unnecessary. The bounded H2 decision below permits shared publication only with atomic member fencing and settlement; all other integration uses the per-work algorithm. Repeated full validation after same-ref head movement is a real D0007 benchmark risk; failure requires bounded Design revision, never weaker validation or an undocumented global queue.

## Acceptance

Prove exact C/U/manifest and metadata identity between validation and publication. Prepare/validate under action A and integrate the returned R under distinct action B: one identical commit, no second validation when every eligibility field matches. Reject stale explicit R and wrong/forged receipts. Race eight old-H integrations; one wins that CAS and the rest preserve explicit stale outcomes. Recompose disjoint edits and validate their new complete result. Lose A's push response while B on the same ref makes progress, including extending C before A's ledger finalizes; retain one effect per ordinary work, or one shared effect for the exact H2 tuple below. Inject every crash/cancel boundary, changed policy, revoked authorization, foreign writer, mode/delete/directory conflicts and lost readback. Report integration-inclusive latency and repeated validation, not merely candidate completion.

## Implementation consequences

Use a pure target-tree/commit preparer, trusted validation evaluator, immutable prepared-result descriptor, persisted exact effect and narrow CAS writer/reconciler. D0001 owns durable action/work transitions, D0002 owns immutable source, D0004 exposes the typed operations and D0007 owns proof. No new durable owner, release lifecycle or recovery subsystem is introduced.

## Placement-independent receipt and effect authority

The selected execution environment is D0006's managed ephemeral sandbox, not a
required container daemon on Termux. Prepared result, full required validation and
Git CAS semantics are unchanged. Bind every run receipt to the exact selected
provider session/run/attempt and execution seal; the trusted controller signs it
outside candidate containment. Transfer/reconnect delivery acknowledgments are not
validation receipts. Verify result identity, required profiles, environment and
signature on the device before eligibility; a provider job's overall green check
or candidate-produced result.json cannot substitute.

Only the device's authorized integration component changes the canonical ref.
Execution jobs have no canonical writer credential. A missing device channel,
expired session or lost validation receipt cannot create a new canonical effect.
After a provider run is proven terminal, an unobserved replay-safe validation may
be rerun with a new attempt; its overhead is counted. Same-ref stale recomposition
still invalidates previous result/validation identity, even on a warm executor.
Placement alone authorizes neither batch coalescing nor cross-tree receipt reuse; only the bounded H2 contract below selects composition.

## H2 production-promotion decision

This accepted revision selects a production contract, **not implementation or
activation**. The per-work algorithm above remains the deployed behavior and the
correctness fallback. This section is its sole bounded multi-work specialization.
D0001 owns Work/Action lifecycle, storage and recovery; D0002 owns candidate bytes;
D0005 owns authorization. There is no new Design ID, group owner or public API.

### Motivation, evidence and limits

[F3](../evidence/cost-hosted-f3-falsification-20260914/README.md),
[A3](../evidence/cost-hosted-f3-falsification-20260914/A3.md) and its
[raw record](../evidence/cost-hosted-f3-falsification-20260914/experiment-a3.json)
survived the constrained native held-sender/controller-death/two-restart attack:
one logical effect, no replacement while the old sender was not stopped,
follower cancellation-too-late, atomic 3/3 settlement and unrelated validation
progress. It is recovery-model evidence, not production authorization.

[F4](../evidence/cost-live-f4-falsification-20260914/README.md) and its
[fixture](../evidence/cost-live-f4-falsification-20260914/fixture.json),
[measurement](../evidence/cost-live-f4-falsification-20260914/provider-publication-measurement.json),
[verdict](../evidence/cost-live-f4-falsification-20260914/final-verdict.json) and
[resolved historical blocker](../evidence/cost-live-f4-falsification-20260914/provider-publication-blocker.json)
retain N=8, eight normal member validations plus one complete exact composed
validation: 9 full validations, 0 stale recomposition validations, 1659.647 s
aggregate wall/slot proxy. Historical W4 retained 34 completed validations,
27 CONTENDED_REF outcomes and approximately 5139.78 s proxy: descriptive count
and proxy reductions of 73.5% and 67.7%. F4 measured one expected-old CAS attempt,
one effect, zero stale/uncertain sends, one reconciliation, zero retries, exact
result readback, exact cleanup and independently confirmed absent disposable ref;
zero lost changes, silent overwrites, wrong-base admissions or canonical contamination.
The raw cleanup confirmationHead has a documented reporting bug; independent absent
readback, not that field, proves cleanup. F4 used a separate composed validation
Work as fixture scaffolding; production must not import that synthetic owner.

CPU, transfer bytes, attributable session/cold-start, Workers/DO/MCP counts remain
unknown. Historical workloads are not paired contemporaneous trials. Neither F3
nor F4 proves D0007 statistical superiority or the production join described here.
Do not rerun these research experiments merely to restate their retained findings.

Non-goals: H1 cross-tree receipt reuse, incremental profiles, cross-base batching,
background coalescing, merge trains, automatic rebase, new MCP batching vocabulary,
new durable coordinator, source implementation, migration or release activation.

### Observed implementation feasibility

Source inspection at b224f36356c5d33c2763a02c5ed4689c58e9b71a establishes:

- `src/storage/ledger.mjs` has one synchronous SQLite connection, WAL/FULL,
  EXCLUSIVE owner lock, BEGIN IMMEDIATE/COMMIT/ROLLBACK and rejects async transaction
  callbacks. `Transaction.compareWork` and `updateAction` may update arbitrary
  distinct records in one transaction. `WorkCoordinator.settleIn` already composes
  terminal Action, attempt release and Work revision/disposition update within a
  caller-owned transaction. There is no cross-DO or distributed settlement problem.
- `prepared(work_id)` and `effect(action_id UNIQUE)` currently refer to one member.
  Effects are immutable JSON rows; observations are separate meta records.
  Current `getEffect(actionId)`, engine settlement and recovery snapshots assume
  that member is the only affected Work. They cannot be used unchanged for H2.
- Current effectId is random and binds intent through its immutable record;
  `DurableGitSender` additionally hashes the entire effect with
  `dev2.git-effect.v1`. The ledger retains `sender:<effectId>` before spawning.
  `tools/git-sender.py` uses one invocation flock inherited by the Git child,
  stopped/process-group evidence and inspect fencing of not-started invocations.
  Broker death, missing promise, socket or heartbeat is not stop evidence.
- `ResultPreparer` retains seed metadata under `prepare:<actionId>`, then stores
  exact R/C before validation. R is independent of validate versus integrate
  action, but bound to one Work/generation. `RequiredValidation` binds the exact
  R/C/U and execution identity; production binding MACs the complete descriptor
  and immutable attempt. Keep those gates for a leader-carried composed descriptor.
- `ActionRecovery` adopts observer epochs, retains launch tuples, stamps a snapshot
  before async inspection, then compares it in the applying transaction. Its
  single-member snapshots/adoption/resume paths need tuple-aware equivalents.
- Cancellation is durable `cancel:<actionId>` metadata. A running cancellation
  does not immediately close Work. Current terminal integration also requires
  sender/attempt stop; positive provider readback alone does not release resources.
- `DevelopmentApplication.invoke` independently admits envelope items before its
  pump call. Other pump wakeups may interleave; an in-memory envelope is not a
  durable selection barrier. `observe` currently reads records across awaits and
  cannot guarantee a single snapshot for an H2 response without modification.

Thus the existing store can represent both atomic boundaries without a new owner.
This is feasibility, not a claim that current source implements them. JSON rows
are limited to 2 MiB and the Python sender intent to 64 KiB. Keep large manifests
and deltas in D0002 immutable fsynced objects; effect rows carry digests/references,
not the tuple bytes. Never evade these bounds with unbounded meta JSON.

### Eligibility and bounded formation

Only independently admitted integrate actions with **no explicit
preparedResultId** may participate. Explicit R means publish that exact R/C under
the existing contract and MUST use the ordinary path. A candidate validation
receipt can be discovered internally without changing the integrate request.

Initial selection considers only newly admitted, distinct Works/actions in one
completed dev_work envelope, under one authenticated principal and one ledger.
Duplicates return their original action and never re-enroll it. Same-envelope is
not a Git correctness requirement; it is the selected bounded opportunity policy
and F3 evidence limit. Cross-envelope/cross-principal selection is not authorized:
it would require a revised selection/recovery/disclosure decision and additional
proof for starvation, replay and independently revoked grants. There is no timer,
scan of unrelated queued work, waiting for a missing member or envelope transaction.
Rejected siblings remain independently rejected; admitted siblings remain admitted.

At the selection transaction, form compatibility classes from eligible unsent
queued items, sorted by stable identities below. Use the complete class if it fits
resource limits and is pairwise disjoint; otherwise give that class ordinary
per-work dispatch. Do not choose overlapping winners by arrival order. Each class
needs at least two members. If independent dispatch already took any proposed
member, abandon that class; do not pull it from a running per-work operation.
A crash before durable selection simply leaves ordinary independently admitted
items. Once selected, retries resolve the retained selection; they never regroup.

Every member must have the same repository/provider identity, installation,
binding epoch, full canonical ref, exact expected H, **base commit B=H**, exact
base tree and manifest, identical current adopted policy/execution identity and
compatible current grants. Each Work is open, currentActionId is its admitted
integrate Action, candidate generation/revision and immutable candidate tree and
manifest match. Bind original request principal/epoch/requestId/intentDigest;
no retained request or receipt substitutes for current authorization on all changed
paths. Deadlines must accommodate one complete composed validation and dispatch.

Require retained successful normal required validation of each exact candidate
prepared result at H under the current policy/execution identity, with intact
production provenance. Choose the eligible member result by ascending resultId if
several exist, then choose its eligible receipt by ascending runId (unsigned UTF-8
order); retain its validationId and receipt runId/digest exactly. Freeze the eligible
evidence snapshot before selection: later receipts cannot replace those references. Absence
means ordinary per-work behavior, not waiting for sibling validation. Empty deltas,
malformed/unsupported source, missing objects or unverified lineage are ineligible.
Compute exact base-to-candidate entry deltas (old/new mode, blob OID, content digest,
explicit absence), sorted by raw UTF-8 path bytes. Deltas must be pairwise disjoint,
including delete/move endpoints and file/directory ancestor collisions. Compose
by applying that union to B; do not edit any member candidate.

### Immutable identities and preparation

Use D0001 canonical encoding and versioned digest domains. Sort members by the
unsigned UTF-8 bytes of `(workId, actionId)` lexicographically; reject duplicates.
These are persisted admitted IDs, never indexes, process order or retry order.
The first member is physical leader only. Given the same admitted set/evidence,
input permutation cannot change tuple, leader, tree, commit or identities.

The member tuple M contains repository/provider ID, installation, epoch, ref, H,
base tree/manifest, policy digest and complete execution identity, then ordered:
`{workId, actionId, principal, requestId, intentDigest, generation,
reservedWorkRevision, candidateTreeOid, candidateManifestDigest,
memberResultId, memberValidationId, memberReceiptRunId, memberReceiptDigest,
changedPathDigest}`. `reservedWorkRevision` is the next revision committed at
selection, derived from the exact admitted current revision. Original request
revision remains in immutable intent. Observer epoch/action revision are separate
mutable fences, not fields rewritten in M on restart.

Hash delta records under `dev2.h2-delta.v1`, M under `dev2.h2-members.v1` to obtain
D. Hash `{memberTupleDigest:D, resultTreeOid:U, resultTreeSha256:manifest(U)}`
under `dev2.h2-composition.v1` to obtain K. Persist M and deltas as bounded immutable
objects before any row references them. Selection atomically advances all Work
revisions, sets all Actions running with internal composition references to D/K
and leader, and retains a preparation seed in the leader's existing Action record.
Followers have no execution reservation and are skipped by the ready dispatcher;
selection also reserves exactly one leader D0001 attempt in that same transaction.
If capacity is unavailable, roll back selection and use ordinary queued dispatch;
there is no new reservation-wait lifecycle. The selected
running phase denotes action processing, not N physical sandbox executions.

For composed results only, derive R as the 64 hex digits of
`recordDigest(dev2.h2-result.v1, {compositionIdentity:K})`; it fits existing opaque
ID limits. This explicitly specializes the ordinary random-R rule. Commit actor
comes from adopted policy; message is the fixed `dev-2 composed source change`;
timestamp is the maximum timestamp in the selected member prepared metadata.
Persist these values and K before constructing C. Freeze sole parent H, tree U
and the existing Dev2-Result R trailer. Verify exact commit bytes and persist the
composed prepared record before validation. A digest collision or disagreeing
retained descriptor is integrity failure, never overwrite/reseed.

The composed descriptor keeps leader workId/generation/base/candidate fields
truthful, and adds a versioned H2 extension containing D/K and immutable tuple
object reference. It does not pretend the leader candidate is U. It has no mutable
status. Production receipt binding covers the entire extended descriptor.
ValidationId remains the existing exact R/C/U/policy/execution hash, now transitively
binding K through R. Receipt run/attempt identity is separate and may differ on an
authorized replay-safe execution; a retry never changes R/C/U/M.

### Exact validation, ownership and admission fence

Member receipts authorize no bytes of U. Execute the complete currently adopted
required profile set once on exact C/U through the leader's existing attempt,
including old trusted controller/selector/toolchain evaluation. Cross-tree receipt
reuse, disjointness-based promotion, partial profiles, stale policy and automatic
acceptance of old execution identities are forbidden. An interrupted run lacking
admissible receipts may repeat only under D0001 stopped-attempt rules, with its
cost counted. Completed current-policy composed evidence is retained across restart.

All member Work/Action/request ownership stays separate. No synthetic Work, Batch,
group lifecycle, independent queue, coordinator DO or second recovery owner exists.
The existing ledger owner operates on M; leader workId/actionId on prepared/effect
records are storage/execution anchors, not ownership of follower product intent.
An Action H2 reference is an internal index into immutable prepared/effect evidence,
not a separately mutable group state. Effect state is derived from existing Action
steps and retained effect observations.

After validation, perform an **atomic freeze/effect-intent transaction**. Re-read
all Works, Actions, cancellation flags, current policy/authorization authority
stamp, descriptor and receipt references. Require all reservations match M, all
Actions are current/nonterminal and owned by today's ledger observer, every member
is unexpired/uncancelled/authorized, no member has an existing different effect,
and exact composed validation is eligible. Atomically persist one effect E and
attach the same E/D/K/R/validationId to **every** member Action. No effect can be
visible with only a prefix fenced. Missing member or any predicate failure rolls
back the entire transaction. No provider I/O occurs inside it.

E is deterministic: 64 hex digits of `dev2.h2-effect.v1` over
`{memberTupleDigest:D, compositionIdentity:K, repositoryId, bindingEpoch, ref,
expectedHead:H, commitOid:C, resultTreeOid:U, resultTreeSha256,
preparedResultId:R, validationId, policyDigest}`. The immutable effect record
includes those fields plus leader workId/actionId and tuple-object digest.
Retain one effect row with the existing unique leader action key; follower lookup
resolves its action reference, verifies membership and loads that same row by E.
Do not create N effect rows or rewrite an old per-work effect into a shared one.

Authorization involves asynchronous verification outside SQL. Before both effect
creation and physical sender launch, capture a bounded trusted grant/binding/policy
snapshot and its revision/digest; finish all asynchronous reads and validate exact
receipt/commit/lineage first. Inside the final synchronous owner boundary compare
that snapshot with current trusted authority, including expiry at the current
clock and all member path grants. Authority installation/adoption and this gate
must be serialized on the existing owner event loop with a monotonic authority
revision; any mismatch aborts dispatch. A boolean obtained before an await is
insufficient. This extends the current async AuthorizationPort with an internal
synchronous snapshot check; it does not add a grant service or store credentials
in the tuple. External revocation not yet visible to the configured authority has
the same D0005 limits as ordinary publication, never an H2-specific cached grant.

### Dispatch and exact-CAS

Order: atomic effect freeze; commit; finish provider/writer checks and sender
filesystem preparation; final current-authority/member gate plus durable invocation
reservation; commit; invoke the fixed sender without an intervening asynchronous
application step. If work is awaited after the final gate, repeat the gate. The
invocation reservation is the conservative **remote-possible** boundary even when
no process has started yet. Inspect/cancel under the sender lock must fence an
unstarted invocation before declaring not-sent. Freeze and reservation may be
separate transactions; neither may contain a network request or filesystem wait.

Before reservation, policy/grant invalidation or cancellation disarms the entire
frozen effect if authoritative not-sent/stop proof exists; never change its M or C.
After reservation, invalidation cannot erase uncertainty. Stop/inspect the exact
invocation and reconcile E; prohibit further sends without renewed authority.
No new logical effect is made merely because policy changed or a response was lost.

Use the existing private fixed native sender, one full ref, one expected-old H,
validated exact direct-child C and exact lease CAS. Reject force, non-CAS,
wildcard, mirror, multiple refs and caller-selected publication semantics.
The sender's retained effectDigest must cover the H2 effect record unchanged.
At most one physical invocation may be running or possibly running for E.
Sequential reinvocation is allowed only after positive prior stop, authoritative
H readback and fresh full-member dispatch eligibility; it retains E/H/C/R/M.
Logical retry/reconciliation usually performs **no physical reinvocation**.

### Reconciliation and atomic settlement

The SQLite owner adopts existing member observer authority together and retains
all immutable launch identities. Followers without an attempt resolve the retained leader attempt; generic
missing-reservation recovery must not fail or dispatch them separately. Loading
**any** member for cancel/resume/recovery
resolves the exact retained tuple and leader; no regrouping from open Works,
request order, temporary files or current candidate trees. Stamp the entire frame
(all member revisions, Action states, cancellation flags, effect, sender selection,
retained attempt and observer epochs) before asynchronous inspection. Compare the
entire current frame in the settlement transaction; if changed, inspect again.
A per-member callback cannot independently settle a frozen member.

Authoritative managed-lineage readback gives these outcomes:

| Evidence | Atomic outcome for the entire frozen tuple |
| --- | --- |
| C or verified acceptable managed descendant of C | After all relevant execution/sender stop proof, every Action succeeded, every Work integrated. |
| Another verified managed descendant of H excluding C | After sender stop, every Action failed with CONTENDED_REF; every Work stays open with its original candidate/evidence. |
| H, old sender positively stopped | Same E can retry only if every current precondition holds; otherwise settle all as no-publication below. |
| H with old sender running/unknown, unreachable provider or incomplete ancestry | All members nonterminal/blocked, exact E retained; no second sender. |
| Foreign update, deletion/rewrite or exclusive-writer loss | Fence canonical effects for the affected binding; retain all members blocked pending authorized epoch reconciliation. |

C ancestry alone is insufficient: the entire accepted descendant segment must
satisfy the existing managed lineage/writer boundary. Integrated observedHead is
separate from original integratedCommit C. A later descendant may advance further;
never substitute its bytes for the validated result. Success/stale proof cannot
bypass existing stop-before-terminal rules; while stop is unknown, record provider
certainty and keep all members nonterminal. Retry/observation must not require a
revoked integration grant merely to settle already-observed facts: internal broker
recovery can reconcile without new-send authority, while public reads/resume still
require their own current D0005 capability. No credential expiry strands a known
committed effect waiting for a new mutation authorization.

One short transaction records shared effect outcome, updates **all** member Action
statuses/result/effect projections and revisions, all corresponding Work
revisions/dispositions/currentActionId, cancellation-too-late steps and reservation
release. `settleIn` can be used for the leader; followers require equivalent
currentAction/revision checks without inventing sandbox attempts. All writes,
including public observation projections, commit or roll back together. A crash
at member 5 leaves 0/N committed, never 5/N. Repeat settlement is idempotent only
when all terminal receipts already agree exactly; mixed terminal state is an
integrity defect and blocks the affected tuple, not a normal repair-by-guessing.

A dev_observe response must collect member Works/Actions/results/effects and their
mutable projections from one synchronous ledger snapshot after async authorization
and provider inspection. Recheck authority before disclosure. Avoid per-member
await/read loops that can mix pre/post-settlement states. Separate calls or pages
may legitimately straddle a commit; they do not promise a global historical
snapshot. No response may manufacture a mixed terminal projection for M.

### Cancellation, invalidation and fallback

Before effect freeze, durable effective cancellation excludes that member and
abandons the selected optimization as a whole. Stop any leader validation safely;
retain member/composed evidence. Uncancelled members continue ordinary per-work
processing under their original admitted intents if still eligible. Cancelled
integrate Actions follow existing cancellation semantics (Work remains open unless
subsequently explicitly closed). Do not turn a sibling's cancellation into another
Work's product cancellation.

After freeze M never changes. If C publishes, all members integrate and each
member whose cancellation was recorded before settlement gets existing
`complete.cancel_too_late` / cancellationTooLate projection. A later cancellation
cannot rewrite immutable terminal receipts. If no publication is proven (H plus
positive sender stop, or never-reserved sender fenced), disarm E and atomically
release every member: cancelled/expired Actions become cancelled; other Actions
fail with the specific policy/authorization error or EXECUTION_UNAVAILABLE for
shared optimization abandonment. All Works retain candidates and remain open.
The shared effect outcome is uniformly not-published although individual cancel
intent determines Action status. If another managed descendant won, uniform
CONTENDED_REF takes precedence for all, with cancellation intent still visible.
Never remove a member, rewrite C or silently retry a subset of a frozen E.

Fallback is first-class. Different base/H/policy, authorization mismatch, stale
revision/generation, pre-freeze cancellation, path overlap/collision, absent valid
receipt, malformed source, indeterministic identity, failed composed validation,
insufficient deadline/resource budget, missing atomic capability or unsupported
storage format all decline the optimization without losing member evidence.
Before E, ordinary dispatch may continue the same admitted actions only with
original intent/preconditions and safe execution stop. Atomically release the
leader reservation, retire all composition references into retained evidence and
move uncancelled selected Actions through blocked to queued under D0001; cancelled
Actions terminalize and clear only their own fences. Retain immutable M and its
preparation seed under a distinct H2 key, never reuse that seed for ordinary
preparation. No follower needs a fictitious attempt to perform this transition. A stale explicit R remains
rejected, never silently rebuilt. Once E exists, first resolve/disarm it for all;
then a caller uses fresh context and new ordinary per-work intents, retaining old
candidates and receipts. Current full recomposition/full validation applies on a
new H; there is no cross-tree reuse, hidden rebase or automatic new intent.
Foreign state/unexpected provider invariants block publication rather than using
fallback to evade a binding fence. Storage corruption is not an optimization miss.

Unrelated same-ref Works retain ordinary admission/validation/CAS/recovery. No
branch mutex or global recovery queue is added. A real binding invariant failure
is the existing scoped exception; capacity/provider outage remains honestly shared
resource pressure. Only the leader's actual held execution reservation counts;
followers do not consume fictional execution slots or deadlock at capacity one.

### API and implementation consequences

D0004 shapes and independent item admission remain unchanged. No public group ID,
batch API or envelope atomicity is added. Each member Action returns its own
request/work identity with common resultId; the results array contains one truthful
leader-carried composed descriptor, and effects contains one logical E. Observation
of a follower must include its referenced common descriptor/effect without asserting
that the follower is the descriptor's anchor Work. All members have the same
principal in this selection, and current path/read grants still apply. Existing
clients can follow action.resultId; explicit preparedResultId integration remains
ordinary. D0004's accompanying clarification owns this projection interpretation,
not a second publication contract. No closed schema expansion is necessary.

Likely changes, to be implemented only in a separately authorized session:

| Module | Required consequence |
| --- | --- |
| `src/contracts/ports.d.ts`, `src/storage/ledger.mjs` | Versioned optional H2 Action/result/effect references, effect-by-ID membership lookup, atomic whole-tuple helpers; preserve old rows and reject unknown H2 versions. |
| `src/runtime/application.mjs`, `src/mcp/input-schemas.mjs` | Offer completed envelope's newly admitted IDs to internal selection; preserve per-item failures/dedup, explicit-R exclusion; snapshot observation and follower projection. |
| `src/work/coordinator.mjs`, `src/runtime/engine.mjs` | Selection reservation, leader-only capacity, follower dispatch/cancel guards, whole-tuple freeze and settlement; generic per-action error/deadline paths may not split a tuple. |
| `src/integration/prepare.mjs`, `src/candidate/tree.mjs` | Exact delta union, deterministic M/K/R/C, immutable seed/objects and leader-carried composed result, separate from ordinary reuse. |
| `src/validation/receipts.mjs`, `src/validation/production-binding.mjs`, `src/runtime/production.mjs` | Complete composed validation and native full-descriptor production join; reject altered extension/receipt; never fabricate a synthetic Work. |
| `src/integration/effects.mjs`, `src/runtime/recovery.mjs` | Whole-frame intent/reconciliation/atomic terminal projection, follower resolution and atomic adoption, internal reconciliation independent of new-send authority. |
| `src/security/authorization.mjs`, `src/validation/policy.mjs`, `src/runtime/native.mjs` | Trusted current authority stamp and synchronous final gate after async checks; policy adoption serializes with it. |
| `src/release/authority.mjs` | Preserve leader anchored integrated-source verification; require the same all-member committed outcome before any downstream policy/release consumer can trust C. |
| `src/integration/sender.mjs`, `tools/git-sender.py` | Preserve exact helper/OS-stop semantics; move final gate/reservation to the last dispatch boundary, compact digest-bound extension within 64 KiB; no new recovery owner. |

Existing SQL ownership columns can remain leader anchors; JSON record extensions
require ledger user_version 2 before first H2 selection (the current reader
accepts only 0/1), with an atomic version-only upgrade retaining v1 rows and new
versioned JSON fields. The H2 reader accepts v1 ordinary records and v2 extensions;
no historical receipt is backfilled or reinterpreted.
No migration is applied by this decision. Old binaries must refuse unsupported
pending H2 records rather than recover them as single-member effects. Rollback to
old code is forbidden while any H2 selection/effect is nonterminal; disabling new
selection must retain the H2 recovery reader. Store immutable M/deltas in existing
ObjectStore, fsync before references, keep them reachable through every follower,
and include them in retention/backup integrity checks. Effect sender intent stays
compact; no raw credential/principal assertion enters it.

Formation is initially bounded by the existing 64-item envelope policy, total tuple
object budget 256 KiB, existing 2 MiB row and 64 KiB sender bounds. These are resource
limits, not eight-member identities or a lifetime concurrency maximum. Precompute
sizes outside SQL; never chunk atomic freeze/settlement to fit a budget. Test N=2,
8,16,32 and configured maximum with actual native SQLite rollback/disk-pressure
injection and transaction duration/event-loop measurements. If bounds cannot be
met safely, decline composition; do not introduce a distributed transaction owner.

### Production acceptance, stop and rollout boundary

Before enablement, add core identity/permutation/eligibility tests and real SQLite
crash tests at selection, object reference, preparation, receipt, effect intent,
sender reservation and every settlement write. Add integration tests next to
`ledger.test.mjs`, `phase-b-recovery.test.mjs`, `phase-b-exactness.test.mjs`,
`git-sender.test.mjs`, `production-validation.test.mjs` and
`production-controller-history.test.mjs`. Exercise public transcripts next to
existing MCP schema/controller tests without changing descriptors. Specifically
prove follower-only observe/resume, explicit-R exclusion, denied sibling, capacity
one and above eight, stopped versus unknown sender, authority revocation across
all awaits, cancellation, stale/foreign descendant classification and fallback.

The [adversarial review](../evidence/h2-production-design-review-20260914/README.md)
traces sixteen required schedules; it is Design reasoning, not an executed product
fault suite. Production acceptance must execute those schedules through the joined
engine/store/controller path and preserve F3 native sender guarantees. Reuse the
existing F3/F4 evidence for already exercised layers; add the missing production
join tests, not a second benchmark or recovery subsystem. A bounded authorized
live production-join proof on a disposable fixed target is required before enabling
canonical optimization. Statistical/cold-start/CPU superiority remains unclaimed.

Stop promotion/enablement if exact validation/CAS weakens, any ownership becomes
ambiguous, partial terminal state is observable, tuple recovery is ambiguous,
a duplicate physical sender is possible, cancellation mutates M, stale applies
only to a subset, authority changes disappear, foreign protection/fallback fails,
unnecessary public batching or unjustified coordinator appears, or storage cannot
atomically fence/settle. Do not waive a stop condition with F3/F4 survival. The
smallest next test is the failed invariant's deterministic production-path schedule.

This revision accepts a coherent implementable contract with no known Design
correctness blocker; all new implementation/production proofs remain outstanding.
Canonical review/integration of these documents is separate from implementation.
Implementation requires separate authorization, then required full validation,
reviewed durable-format compatibility and D0006 release checks. Default selection
stays disabled until those gates pass. No deployment, release.stage, release.activate
or schema migration is authorized or performed by this Design-only session.
