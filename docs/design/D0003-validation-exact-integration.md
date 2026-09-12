# D0003 - Required validation and exact canonical integration

- Design: `D0003`
- Title: `Required validation and exact canonical integration`
- Status: `accepted`
- Depends-On: `[D0001, D0002]`
- Supersedes: `[]`
- Directive: `r3`
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

Initial project policy requires the complete core and integration profiles in D0007 for each source result. A release additionally requires release and affected sandbox/security/activation checks. Live experiential and comparative benchmarks are release-completion gates, not a second qualification workflow on every edit. No change-impact skipping is initially trusted.

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

Validate a patch then cherry-pick is rejected because tested and published bytes may differ. Regenerating commit metadata during integration breaks exact prepared-result reuse. A ref fence held through unknown response recovery adds serialization beyond the remote CAS invariant and is rejected. GitHub force:false alone is insufficient for exact H. A database/Git distributed commit or Promotion lifecycle is unnecessary. Grouping independent works into one commit could amortize tests but couples result/failure ownership; the initial contract does not add that abstraction without measured need. Repeated full validation after same-ref head movement is a real D0007 benchmark risk; failure requires bounded Design revision, never weaker validation or an undocumented global queue.

## Acceptance

Prove exact C/U/manifest and metadata identity between validation and publication. Prepare/validate under action A and integrate the returned R under distinct action B: one identical commit, no second validation when every eligibility field matches. Reject stale explicit R and wrong/forged receipts. Race eight old-H integrations; one wins that CAS and the rest preserve explicit stale outcomes. Recompose disjoint edits and validate their new complete result. Lose A's push response while B on the same ref makes progress, including extending C before A's ledger finalizes; retain one effect per work. Inject every crash/cancel boundary, changed policy, revoked authorization, foreign writer, mode/delete/directory conflicts and lost readback. Report integration-inclusive latency and repeated validation, not merely candidate completion.

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
No batch coalescing or cross-tree receipt reuse is authorized by this placement change.
