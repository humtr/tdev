# Design 0020 — Agent Connection, Delivery, and Aggregate Capacity

- Status: `accepted`
- Revision: 1
- Acceptance evidence: `docs/evidence/group-f-d0020-agent-delivery-acceptance-2026-08-20.json`
- Accepted exact review candidate: `c3f7a484a66315d90340d053d00cd07c231ff055`
- Accepted review-candidate Design SHA-256: `1adfaa75702959f4dc20df38cbf557fd7fb1374aca8a736aab69c69e5cd401cf`
- Independent exact-artifact acceptance review: `task_ahs_1bdb96128c` — C1/C6/C8 confirmed, no material regression, Design readiness `READY`, executable proof `PROOF_PENDING`
- Class: 2
- Decision date: 2026-08-20
- Capability Group: F — Cloudflare runtime and local Agent topology
- Drafting authority anchor: `development@dfd4d0c9768515fd80f62346c128acc37d84e34b`
- Trigger: required provisional Group F Agent connection/delivery/capacity gate in `docs/development/PROGRAM.md`
- Inherited boundaries: D0018 verified runtime boundary; D0019@r2 verified CaseDO authority adapter
- Affected product owners after acceptance: `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`
- Post-acceptance affected-owner obligation: before D0020 implementation, `docs/PROTOCOL.md` must owner-natively add the Section-10 `grant_attempt_dispatch` Case command/receipt/event contract; the acceptance transition does not mutate that owner
- Product/runtime effect: accepted Design decision only; no implementation, provider mutation, deployment, or WORKBOARD routing activation is included in this acceptance

## 1. Decision

Select one durable **Agent delivery authority per stable Agent route** to own logical connection generations, the one current connection, aggregate execution-slot admission, and the bounded set of already-admitted deliveries across all Cases using that Agent.

Preserve these existing authorities:

- CaseDO/CaseEngine remains the sole Task/Attempt/retry/result/reconciliation semantic owner.
- The local Agent/executor remains the physical execution owner and source of local start/cleanup/effect evidence.
- Waiting Tasks remain with Case/runner scheduling; the Agent delivery authority does not become a second semantic queue.
- D0019's ordering remains intact: a Case commits the exact `running` Attempt and its existing executor/fencing facts before an executable payload can cross to the Agent.

Aggregate capacity is obtained before that Case mutation through a short durable **non-executable slot reservation**. A reservation contains no executable payload, cannot authorize an external effect, and becomes delivery authority only when activated by the exact committed Attempt fence.

## 2. Evidence and inherited contract

The drafting anchor establishes the following facts.

1. `src/runner.mjs` creates its `running` map inside `runCaseWithHooks()` and gates `running.size < capacity`; therefore implemented capacity is per run/Case invocation, not one Agent-wide budget across independent Cases.
2. `src/engine.mjs` already owns Attempt identity, `executorId`, `executorEpoch`, `fencingToken`, cancellation, retry, result acceptance and reconciliation. The state machine contains `dispatch_pending` and `queued`, but the production runner starts Attempts directly as `running`.
3. D0018 requires one fresh runtime operation per Attempt, forbids lower-layer semantic retry/queue ownership, and keeps runtime capacity occupied through execution cleanup/settlement.
4. D0019@r2 requires the Case `running` Attempt/fence commit before the Agent delivery crossing. Ordinary CaseDO reconstruction does not imply execution-owner loss; semantic reopen requires an explicit durable recovery cause.
5. Product owners distinguish transport acknowledgement from external-effect truth and require stale-instance fencing, bounded delivery/capacity and conservative uncertain-effect reconciliation.
6. `PROGRAM.md` makes D0020 a required but provisional Group F gate. A provisional label is not implementation authorization.
7. Cloudflare's Hibernation WebSocket behavior permits a Durable Object to leave memory while an accepted WebSocket stays connected and later re-enters through a reconstructed object instance. Object reconstruction therefore cannot itself mean reconnect, disconnect, or a new connection epoch.

The Design remains coherent only if these predecessor boundaries survive unchanged.

## 3. Problem

The repository has no owner that can answer, across multiple Cases competing for one local Agent:

- which authenticated logical connection is current;
- which connection messages are stale after reconnect;
- how many physical executions may be live in aggregate;
- which admitted Attempt owns each Agent slot;
- whether transport was only sent/received versus locally started/completed/cleaned up;
- how reconnect and owner reconstruction recover those facts without inventing Task retry;
- when delivery/executor evidence is strong enough to cross D0019's explicit execution-owner-loss recovery boundary.

Independent `runCase({capacity:N})` invocations can each admit N operations, so they cannot enforce one Agent-wide N. Moving pending Tasks into an Agent object would instead duplicate Case scheduling/retry authority.

## 4. Non-goals

This Design does not:

- move Case, Task, Attempt, retry, result, Promotion or semantic reconciliation authority into the Agent owner;
- make transport ack proof that an external effect was applied;
- make delivery replay a semantic Task/Attempt retry;
- equate connection epoch with executor epoch;
- treat CaseDO or Agent-owner reconstruction as execution-owner loss;
- promise exactly-once arbitrary external effects;
- introduce a provider/executor semantic retry queue;
- activate `dispatch_pending` or `queued` as the distributed Agent queue protocol in revision 1;
- define final Agent credentials, installation UX, Git publication or general deployment automation;
- remove the existing direct/local runner compatibility path.

## 5. Ownership and lifetime matrix

| Fact | Authoritative writer | Authoritative reader | Durability / lifetime | Stale-instance fence | Bound |
| --- | --- | --- | --- | --- | --- |
| stable Agent route binding (`agentId`, `routeGeneration`) | deployment owner for the supported Agent-backed profile commits the immutable initial route binding | ingress, delivery owner, local Agent | one immutable route-generation lifetime; not socket/process identity | exact route binding + generation + deployment/environment/class/namespace/jurisdiction identity | bounded identity; exactly one writable owner for the elected binding |
| current connection identity | Agent delivery authority on authenticated connect | transport, recovery | durable logical record; socket object is provider/in-memory state | `(agentId, routeGeneration, connectionEpoch, connectionId)` | exactly one current connection |
| connection epoch | Agent delivery authority | every connection-scoped message | durable monotonic generation across owner reconstruction | lower epoch stale; same epoch requires exact connectionId | safe positive integer; overflow fails closed |
| executor identity/epoch | local Agent/executor runtime | delivery owner, Case authority | executor-generation lifetime; may survive network reconnect | exact `(executorId, executorEpoch)`; replacement changes tuple | bounded IDs; tuple is never reused while stale input can exist |
| Attempt identity | CaseDO/CaseEngine | runner, delivery owner, Agent, result bridge | durable Case lifetime | exact Case/Task/Attempt | existing Case bounds |
| fencing token | CaseEngine | delivery owner, Agent, Case result path | Attempt lifetime | exact token + executor tuple + existing claim facts | bounded digest/ID |
| reported capacity observation | authenticated current local Agent/executor | Agent delivery authority only | executor-generation evidence carrying monotonic `capacityRevision`; reconnect requires a fresh revision even when value is unchanged | current connection + executor tuple + capacity revision | `0..maxAgentCapacity`; malformed/out-of-bound evidence cannot mutate accepted state |
| accepted/effective capacity | Agent delivery authority, as sole durable writer | aggregate admission | durable accepted `(executor tuple, capacityRevision, reportedCapacity, effectiveCapacity)`; effective value becomes unknown/0 at reconnect or replacement until fresh evidence | route + current connection/executor generation + accepted capacity revision | never above deployment ceiling; unknown admits zero |
| slot reservation | Agent delivery authority | Case/runner admission | durable short-lived non-executable pre-delivery record containing only immutable preflight descriptor and identity | reservation window + slot token/generation + request digest + executor tuple + capacity revision | reservations + delivery admission holds + physical execution slots cannot exceed effective capacity; no executable body bytes |
| reservation idempotency window/floor | Agent delivery authority | reservation/activation admission | durable monotonic `reservationWindowGeneration` plus `minimumAcceptedReservationWindow`; bounded detailed request receipts exist only for the one open window and are GC'd only after that window is permanently fenced | generation below the durable floor is stale before request-ID lookup; closed generation never reopens | O(1) scalar fence plus bounded current-window detail; no historical request-ID set |
| preflight descriptor | Agent delivery authority records the validated caller descriptor | activation and admission | immutable reservation lifetime | reservation identity + descriptor digest | body precursor digest, canonical body bytes, resource dimensions and protocol/bound profile are all bounded |
| delivery identity (`deliveryId`) | Agent delivery authority on activation | transport, Agent, result/recovery bridge | stable for exact Attempt across reconnects until bounded delivery/tombstone GC | exact Attempt fence + executor tuple | one active record per admitted Attempt fence |
| activation payload binding | Agent delivery authority | Agent/transport | immutable delivery lifetime | reservation descriptor + exact deliveryId/Attempt fence | actual body digest/bytes must equal preflight descriptor; complete envelope must satisfy its preflight bound |
| dispatch authorization | Agent delivery authority | transport, cancellation/recovery | durable per-send-ordinal fact before any physical send | deliveryId + dispatch ordinal + observed Case revision/fence + current connection tuple | one authorization per ordinal; response loss is reread, never blind re-authorize |
| accepted transport/execution/cleanup/effect evidence | Agent delivery authority accepts durable evidence; local Agent/effect adapter produces local evidence | admission/recovery/result bridge | finite disposition fields plus monotonic evidence high-water marks, not an append-only log | current connection where transport-scoped + delivery/executor tuple + evidence revision/digest | finite dispositions/evidence bytes; lower revisions are stale |
| semantic/result receipt | CaseDO/CaseEngine | semantic clients/result bridge | durable Case lifetime | Case request/revision + existing Attempt fence | Case owner bounds |
| aggregate capacity accounting | Agent delivery authority | admission/diagnostics | exactly one capacity unit per admitted work item across reservation -> delivery admission hold -> physical execution slot; no waiting Task list | reservation/delivery generation + accepted capacity revision | bounded; no durable waiter growth, double count or accounting gap |
| delivery admission hold | Agent delivery authority | dispatch/admission | activation converts the reservation one-for-one into a non-executable capacity hold until positive no-start closure or local start converts it to a physical slot | deliveryId + executor tuple | reserves capacity but is not evidence that a process/handle exists |
| physical execution slot | local Agent owns the actual process/resource/handle; Agent delivery authority accounts accepted `started/held` evidence and release | aggregate admission/recovery | begins only when local execution/resource ownership is positively established; ends on positive `cleanup_complete`/equivalent no-handle proof | deliveryId + executor tuple + accepted evidence revision | actual physical ownership only; release may precede semantic/effect resolution |
| disconnect fact | delivery authority from exact connection/provider evidence | recovery | connection disposition | exact connection tuple | one terminal disposition per superseded connection |
| reconnect fact | delivery authority connect transaction | transport/recovery | new connection generation and capacity-freshness barrier | idempotent connect receipt + new tuple | one current epoch |
| Agent-owner reconstruction | provider runtime; durable state rehydrates semantic owner | adapter | instance fact only | Agent route + durable owner revision | allocates/releases no slot or epoch by itself |
| Case-owner reconstruction | D0019 runtime | Case semantic clients | instance fact only | D0019 placement/revision | never implies delivery loss |
| cancellation state | CaseDO/CaseEngine | delivery owner/Agent consume as control intent | Case semantic lifetime | Attempt fence | existing reason/evidence bounds |
| uncertain external-effect state | CaseDO owns semantic `reconciling`/`unverified`; Agent/effect adapter produces effect evidence and delivery owner stores accepted evidence | recovery/result bridge | may outlive physical resource cleanup and capacity release until authoritative reconciliation | Attempt fence + deliveryId + executor tuple | bounded reconciliation evidence independent of physical-capacity accounting |

The three execution/delivery freshness fences remain distinct: **connection epoch**, **executor epoch**, and **Attempt fence**. Reconnect may change only connection epoch. Executor replacement changes the executor tuple. Semantic retry creates a new Attempt/fence. Section 11.3's `reservationWindowGeneration` is a separate Agent-owner idempotency-compaction generation: it can advance only to fence GC'd reservation request identities and has no connection, executor, Attempt, capacity-release or dispatch-authority meaning.

## 6. Failure and cheapest-falsifier matrix

| Failure/race | Required behavior | Falsifier |
| --- | --- | --- |
| old connection late ack/result | reject before delivery/Case mutation | lower-epoch message changes state |
| duplicate activation | exact repeat dedups; conflicting body rejects | second slot/delivery/execution appears |
| duplicate receipt/evidence | exact identity/revision/digest replays; same revision with different content or illegal transition conflicts; lower revision is stale | replay advances a disposition/effect twice or contradictory evidence overwrites stronger evidence |
| reconnect, same executor | new connection epoch; same executor tuple may remain; effective capacity becomes unknown/0 until a strictly newer capacity revision; reconcile live deliveries | reconnect inherits stale positive capacity, forces semantic retry or executor epoch change |
| stale capacity update | lower revision rejects; same revision/different value conflicts; higher valid revision is the only accepted update | delayed old `capacity=4` overwrites accepted newer `capacity=1` |
| hibernating socket survives owner reconstruction | restore same logical connection without new epoch | constructor/reload stales healthy socket |
| disconnect before dispatch authorization | no authorization/send; positive no-handle closure releases admission hold | disconnect alone is treated as an external effect |
| disconnect immediately after dispatch authorization/send uncertainty | possible execution; no blind replay until positive not-sent/not-started evidence | reconnect automatically re-invokes unknown effect |
| disconnect after local start/effect | disconnect alone keeps physical slot; positive cleanup may release the physical slot while effect/result uncertainty remains durable | disconnect frees slot without cleanup, or cleanup incorrectly erases semantic uncertainty |
| effect status unknown after cleanup | physical slot may be free; Case remains reconciling/unverified until effect owner resolves | transport/cleanup evidence becomes semantic certainty or authorizes semantic retry |
| Agent owner reconstructs | restore reservations/admission holds/physical-slot evidence/deliveries; no Case reopen or synthetic release | reconstruction drops capacity accounting or synthesizes retry |
| Case owner reconstructs | preserve live Attempt absent explicit D0019 recovery cause | eviction alone interrupts Attempt |
| two Cases at capacity 1 | at most one reservation succeeds; loser remains pending without Attempt | two executable slots or loser burns retry budget |
| saturation | bounded denial; no durable waiter | Agent owner accumulates blocked Tasks |
| capacity shrink | retain existing reservation/admission/physical units; admit none until below new capacity | active work cancelled solely for shrink or new work still admits |
| capacity growth | permit only fresh admission; do not revive a stale request/delivery/Attempt | growth replays or retries old work |
| capacity unknown/0 | admit none | any new reservation/slot opens |
| cancel before reservation | no Agent state | cancellation creates delivery state |
| cancel after reservation before Case commit | reservation released/expired; no delivery/effect | reservation activates after failed/cancelled start |
| cancel after activation before Case dispatch grant | cancel-first serializes in CaseDO, so grant/Agent authorization/send are forbidden and the activated hold closes only with positive no-start/no-handle evidence | terminal/cancelled Attempt gains a dispatch grant or first send |
| cancel races after Case dispatch grant | grant-first is already the dispatch linearization; treat as possible execution/control intent even before Agent authorization/socket write until positive not-sent/not-started/no-handle evidence refines it | cancellation rewrites possible send as absent or frees physical resource without evidence |
| stale result after new connection | ingress rejects | old socket can forward result |
| stale result after new executor generation | delivery + Case fences reject | replacement executor satisfies predecessor Attempt |
| payload/resource exhaustion | immutable descriptor preflight rejects every known bound before Attempt creation; activation verifies exact body/byte/bound equality | oversized known work creates running Attempt or activation substitutes unreserved bytes |
| reservation response loss | replay exact `(reservationWindowGeneration, reservationRequestId, digest)` while its window is open; after permanent window closure/GC the old generation is stale before lookup, never new | retry double-counts capacity or GC'd ID obtains a new reservation |
| activation response loss | reread durable activation; activation is still not dispatch authorization | retry creates second delivery/slot or sends because activation reply was lost |
| Agent dispatch-authorization response loss | reread exact `(deliveryId, dispatchOrdinal, dispatchGrantId)`; existing authorization means possible execution, while proven absence permits idempotent authorization from that same committed Case grant only | blind second ordinal/grant or physical send before durable authorization |
| transport/evidence replay after tombstone GC | compact epoch/high-water/fence rejects ancient identity; observation never creates delivery | GC'd command/observation creates connection/capacity/reservation/execution |
| result command response loss | reread Case durable receipt/state | second accepted result/Attempt appears |
| reservation expires after Case start but before activation | stale activation rejects; explicit delivery-not-activated recovery | expired reservation still sends or leaves silent permanent running |
| replay after transport receipt | same delivery reconciles; no later dispatch ordinal absent explicit positive safety proof + a fresh one-shot Case dispatch grant for that ordinal | `received` authorizes a second invocation |
| executor replacement with old delivery live | predecessor admission/physical capacity unit and effect remain fenced/uncertain until positive predecessor no-handle/cleanup/recovery evidence; replacement capacity starts unknown/0 | new executor frees/replays predecessor blindly |

The cheapest decisive source/model tests are therefore: capacity-1 two-Case race; old-epoch late message including after a committed Case grant; reconnect-with-same-executor; cancel-first with an activated delivery; grant-first cancellation before Agent authorization/socket write; grant and Agent-authorization response-loss replay; reservation-window close plus ancient replay and capacity shrink; contradictory evidence before/after physical cleanup; execution-started followed by negative evidence; owner reconstruction with activated-but-ungranted delivery; disconnect-after-send unknown-effect case; payload preflight; and ack-versus-effect separation.

Passing them proves only the tested layer.

## 7. Selected semantic owner

For each elected stable Agent route, one `AgentDeliveryAuthority` owns:

- monotonic connection generations and the one current logical connection;
- the accepted executor tuple presented by that connection;
- the sole durable accepted/effective aggregate-capacity record and its freshness fence;
- short pre-dispatch slot reservations and immutable preflight descriptors;
- activated delivery records, durable dispatch authorizations and finite accepted transport/execution/cleanup/effect evidence;
- aggregate admission/physical-capacity accounting through positive no-handle/cleanup evidence;
- bounded delivery/idempotency tombstones and replay high-water marks needed to reject ancient input.

It is an **admission/delivery owner**, not a Task scheduler. It cannot decide dependency readiness, Task retry, accepted result, semantic reconciliation outcome or Promotion. The local Agent/executor is an evidence producer for reported capacity and physical execution/effect facts; it is not a co-writer of accepted/effective durable capacity.

`agentId` is a stable logical execution endpoint identity, not a credential, socket, process or Durable Object ID. For the revision-1 supported profile, the deployment owner establishes **before first connect** exactly one immutable `AgentRouteBinding` containing at least `agentId`, a bounded non-reused positive `routeGeneration`, and the exact deployment/environment/Worker/class/namespace/jurisdiction/Durable-Object identity that may host the route. That deployment-owned binding elects one writable `AgentDeliveryAuthority`; the authority persists and validates the same self-binding before accepting connection or delivery mutation. A second different writable binding for the same supported `agentId` is a conflict, not failover.

Revision 1 does not define live route migration/cutover. Changing any bound deployment/namespace/jurisdiction/object identity while the route is live is unsupported and fails closed. A later live move must define a separate Class-2 election/cutover contract with a new non-reused route generation; name equality, storage recreation or credential success cannot silently elect it. This minimum election rule does not absorb credential enrollment, revocation, IAM or general deployment automation.

## 8. Connection and executor fencing

### 8.1 Connect

An authenticated connect carries at least:

- `agentId` and exact elected `routeGeneration`;
- the caller's `expectedConnectionEpoch` (`0` only before the first accepted connection for that route generation);
- idempotent `connectRequestId` + canonical request digest;
- fresh `connectionId`;
- exact `(executorId, executorEpoch)`;
- bounded protocol/capability metadata.

The owner first validates its immutable route self-binding. The connect transaction then either replays the exact receipt already bound to the same request identity/digest or, only when `expectedConnectionEpoch` equals the durable last connection epoch, commits one new current connection by increasing `connectionEpoch`. Reusing an idempotency key or expected predecessor with different content conflicts; presenting an older predecessor is stale. The durable last connection epoch is never reset by socket loss, owner reconstruction or receipt GC. A new logical connection supersedes the old one even if the old socket remains physically open.

Every Agent-to-owner message carries `(agentId, routeGeneration, connectionEpoch, connectionId)`. That tuple is validated before delivery state, so input from an unelected route generation or old connection cannot mutate state after supersession.

### 8.2 Hibernation is not reconnect

With a Cloudflare Hibernation WebSocket, the Durable Object may reconstruct while the socket stays connected. The provider adapter therefore re-associates the exact socket with its durable connection record and does **not** increment connection epoch merely because in-memory JavaScript state was recreated.

Serialized WebSocket attachment may hold only bounded connection locator/fence data. It is not delivery/capacity authority; state that must survive socket loss remains in durable owner storage.

If reconstruction cannot prove an attached socket is the durable current connection, new sends fail closed. Existing activated deliveries/slots stay held until explicit reconnect/recovery resolves them.

### 8.3 Executor generation is independent

A network reconnect to the same still-valid executor advances connection epoch but may retain the executor tuple. An executor replacement that could overlap stale predecessor messages must change at least one executor-tuple component. Preserving executorId requires a non-reused epoch; otherwise replacement uses a new unique executorId.

A connection change alone does not prove the predecessor executor or external effect stopped.

### 8.4 Capacity revision and reconnect freshness

The local executor produces capacity observations; `AgentDeliveryAuthority` is the sole durable writer of accepted/effective capacity. Each executor generation maintains a monotonically increasing positive safe-integer `capacityRevision`. The executor increments that revision for every new capacity observation that may be accepted, including a reconnect freshness advertisement even when the numeric capacity is unchanged.

An advertisement binds `agentId + routeGeneration + current connection tuple + executor tuple + capacityRevision + reportedCapacity + canonical digest`. The owner classifies it exactly:

- same executor generation, same accepted revision and same value/digest: exact idempotent replay, no mutation;
- lower revision: stale reject;
- same revision with a different value/digest: conflict, no mutation;
- higher revision with valid bounds: accept atomically and durably write the new reported/effective pair;
- malformed/out-of-bound value or revision overflow: fail closed without changing the prior accepted record.

For example, accepted `4@revision=7 -> 1@revision=8` followed by delayed `4@revision=7` leaves capacity at 1.

Every new logical connection installs a **capacity-freshness barrier**. Even when it retains the same executor tuple, effective admission capacity is unknown/0 until that new connection supplies a valid capacity revision strictly greater than the last revision accepted for that executor generation. Executor replacement starts a fresh revision namespace and likewise admits zero until its first valid advertisement. Thus reconnect never inherits a stale positive admission value merely because the executor tuple is unchanged.

Shrink is non-preemptive: existing reservations, delivery admission holds and physical execution slots remain and new admission stops until held capacity is below the new effective value. Growth permits later admission only; it neither revives stale delivery state nor creates retry. Unknown capacity is represented explicitly and admits zero.

## 9. Aggregate capacity without a second queue

Aggregate capacity means the maximum **one-unit admission/physical commitments across all Cases dispatched through one Agent route**. Reservations and delivery admission holds conservatively reserve future physical capacity even though they are non-executable; once local execution/resource ownership is positively established, the same unit is the physical execution slot. It is not each Case runner's local `capacity` option.

The current authenticated local executor **reports** non-negative capacity evidence; it never writes durable admission truth. Only `AgentDeliveryAuthority` may accept a report and write the durable reported/effective pair under Section 8.4. Effective capacity is the minimum of the accepted reported value and configured deployment ceiling. A new connection or executor generation is capacity-unknown/0 until its required fresh revision arrives; stale, conflicting, malformed or over-limit reports cannot preserve or restore a positive effective value.

Shrink is non-preemptive. Existing reservations, delivery admission holds and physical execution slots remain; new admission stops until held capacity falls below the effective value. Growth permits new reservations but does not revive stale delivery, retry or dispatch state.

### 9.1 Pre-dispatch reservation

A ready Case asks for a slot **before creating the next Attempt** so aggregate saturation does not manufacture running-but-unexecutable Attempts.

A reservation request is idempotent and binds the exact current `reservationWindowGeneration`, stable `reservationRequestId` and `reservationRequestDigest`, Agent route/executor tuple, the exact accepted `capacityRevision`, Case/Task identity, expected Case revision, predicted next Attempt ordinal/identity where exposed, bounded expiry, and an immutable **preflight descriptor**. The reservation carries no executable payload/body bytes and cannot be converted into execution by transport alone.

The preflight descriptor contains at least:

- the canonical executable-body precursor/profile identity and canonical body digest computed before Attempt-specific delivery envelope fields are added;
- the exact canonical executable-body byte count;
- every preflightable resource dimension used by the selected local runtime/profile;
- protocol/profile version metadata and the deterministic maximum/expected envelope-bound profile needed to prove the complete activated envelope will remain within configured/provider limits.

Before the reservation commits, the owner validates that descriptor against per-item, aggregate-live-byte, transport-frame and selected local resource ceilings. Work already known to be oversized or unsupported therefore fails before a `running` Attempt exists. Activation later supplies the actual executable body only after Case commit and must prove exact body digest/byte equality plus complete-envelope compliance with the reserved bound profile. Descriptor mismatch or a newly discovered non-preflightable bound fails closed as **not activated/not sent** recovery evidence; it never silently substitutes different bytes or creates a lower-layer retry.

If saturated, freshness-blocked, descriptor-invalid or bounded retained-delivery/evidence storage cannot admit the work, the owner returns a bounded admission denial and stores no waiter. The Task stays pending at its Case/runner owner. Existing Claim leases are not parked indefinitely behind Agent capacity; their owner/lifecycle remains unchanged.

A reservation can safely expire because it cannot send/execute. Expiry commits a terminal reservation disposition and stale activation rejects. If the Case Attempt committed before expiration but activation never did, that durable no-activation fact becomes explicit recovery evidence for the stuck running Attempt.

No durable waiter list exists. A caller may retry only through bounded existing scheduling/control wake points or a lossy/coalescible non-authoritative capacity-change wake.

## 10. Handoff ordering with Case authority

The crossing is:

```text
ready Case Task
  -> existing Claim admission if applicable
  -> AgentDeliveryAuthority.tryReserveSlot(...)
     [capacity + immutable preflight descriptor only; cannot execute]

CaseDO transaction
  -> commit exact running Attempt
     + executorId/executorEpoch from reserved Agent generation
     + existing fencingToken/effectKey
     + Case revision/command receipt

AgentDeliveryAuthority.activateDelivery(...)
  -> exact live reservation + reserved descriptor
  + exact committed Case/Task/Attempt/fence
  + actual body digest/bytes equal to descriptor
  + complete envelope within reserved bound profile
  -> stable deliveryId
  -> reservation converts one-for-one to delivery capacity hold
  -> dispatch remains not_authorized

CaseDO grant_attempt_dispatch command
  -> same CaseDO command-serialization transaction as cancellation
  -> validates exact Case + current running Task/Attempt/fence/executor tuple
  + exact Agent route generation + activated delivery/activation receipt
  + exact reservation-window/slot/preflight binding + expected Case revision
  + dispatch is still legal and no grant already exists for this ordinal
  -> commit one-shot dispatchGrantId + command receipt + attempt_dispatch_granted event
  -> advance Case revision exactly once        [cancellation-vs-dispatch linearization point]

AgentDeliveryAuthority.authorizeDispatch(...)
  -> exact durable activation + exact committed Case dispatch grant
  -> durable dispatch ordinal bound to dispatchGrantId
  + current connection/executor tuple
  -> dispatch = authorized

only after that Agent authorization commit
  -> physical send attempt for that ordinal
```

The selected Case command is `grant_attempt_dispatch`. It uses the existing Case command envelope's stable `requestId` and `expectedCaseRevision`; its command content contains exactly `caseId`, `taskId`, `attemptId`, `executorId`, `executorEpoch`, `fencingToken`, `agentId`, `routeGeneration`, `deliveryId`, `activationReceiptId`, `activationDigest`, `reservationWindowGeneration`, `reservationRequestId`, `reservationRequestDigest`, `slotToken`, `slotGeneration`, `preflightDescriptorDigest`, and the proposed `dispatchOrdinal`. The D0020 crossing adapter issues it only after reading the durable activation receipt. CaseDO validates the command against the exact current Case and currently `running` Task/Attempt/fence/executor facts, validates the supplied activation/reservation binding as the immutable D0020 crossing identity, rejects cancelled/terminal/non-running or already-granted ordinals, and commits the grant in the same atomic Case command boundary that serializes `cancel_task`.

A first successful grant creates exactly one `dispatchGrantId`, one normal Case command receipt, and one `attempt_dispatch_granted` Event while advancing Case revision exactly once. The grant is a durable serialization fact only: it is not a Task state, Attempt lifecycle state, delivery queue state, result authority, execution result, or transfer of delivery ownership into CaseDO. `dispatchGrantId` is a domain-separated digest over the Case identity, grant `requestId`, and the exact immutable command fields above. Every executable dispatch ordinal, including a later ordinal allowed by Section 11 safety proof, requires its own one-shot grant before Agent authorization.

Grant replay follows the existing Case receipt rule rather than inventing a second idempotency system: the same stable `requestId` plus identical command content returns the committed receipt even after response loss; the same request identity with different command content conflicts; a different request identity targeting an already-granted ordinal is rejected and cannot create another grant. The committed receipt exposes the exact `dispatchGrantId`, committed Case revision and Event identity needed by the Agent crossing. Thus grant-response loss is resolved by exact Case receipt replay/reread and cannot create a duplicate delivery or send.

`AgentDeliveryAuthority.authorizeDispatch` no longer uses a Case reread as its permission boundary. It accepts only the exact committed Case grant bound to the same activation, delivery, reservation/preflight identity, Attempt fence and proposed ordinal, then commits its own idempotent transport authorization. Agent-authorization response loss replays/rereads that same `(deliveryId, dispatchOrdinal, dispatchGrantId)` authorization; it never mints a second ordinal or authorizes a send without the Case grant.

If Case start fails/conflicts, release/expire the reservation. If Case start response is ambiguous, reread Case authority before activation. If activation response is ambiguous, reread the reservation/delivery record; activation remains non-executable because the Case needs its exact durable identity before it can grant dispatch. If cancellation commits before the grant, the grant cannot commit and no first send is permitted; the activated delivery is closed against dispatch while still `not_authorized`, and positive no-start/no-handle evidence releases its admission/resource hold without semantic retry or another Attempt. If the grant commits first, any later cancellation is ordered after the dispatch linearization point and the delivery is conservatively possible execution even when Agent authorization or the socket write has not yet happened. The Agent may withhold a not-yet-started send after learning that later cancellation, but absence semantics require positive Section-11 not-sent/not-started/no-handle evidence. Cancellation remains control intent and cannot revoke history by assertion.

Owner reconstruction with an activated but ungranted delivery is likewise non-executable: the Agent owner may reread an existing exact Case grant/authorization receipt, but absence of a committed grant never becomes permission to send. If Case authority now rejects the stable grant request because cancellation/terminal state won, the delivery closes and its hold is cleaned up; if grant response alone was lost, replay of the same immutable grant request recovers the one receipt. No Agent-side semantic retry or duplicate Attempt is created.

Revision 1 does not use `dispatch_pending`/`queued` for Agent capacity waiting. D0019@r2 froze `running` before the D0020 crossing; using those latent states would amend an accepted predecessor and require D0019 re-review. The capacity reservation is outside Case semantics and is intentionally non-executable. **D0019 compatibility verdict:** no predecessor reopen is required by this correction: the exact `running` Attempt/fence durable commit remains the mandatory predecessor, and D0020 adds only a stricter Case-serialized grant before first executable send without changing Task/Attempt lifecycle or moving delivery ownership into CaseDO.

## 11. Delivery identity and receipts

`deliveryId` is stable for one exact committed Attempt across reconnects and binds at least:

`agentId + routeGeneration + caseId + taskId + attemptId + executorId + executorEpoch + fencingToken`

Connection epoch is excluded so reconnect cannot create a second logical delivery. Activation separately stores immutable payload/body digest, effect key where applicable, source Case revision, exact `reservationWindowGeneration + reservationRequestId + reservationRequestDigest`, slot token/generation, preflight descriptor digest, protocol version and byte count. Same deliveryId with different immutable content conflicts.

Every physical send adds the **current connection tuple** to that stable delivery envelope. The local Agent validates bounded shape and exact executor tuple before execution.

The delivery state is **not** one lossy phase enum. The authority stores independent bounded disposition dimensions so transport progress, local execution, physical cleanup and external-effect truth cannot overwrite one another.

### 11.1 Normative delivery dispositions and transitions

For each stable `deliveryId`, activation first creates no dispatch ordinal and therefore `dispatch = not_authorized`. Every later physical-send attempt has a bounded monotonically increasing `dispatchOrdinal`. One ordinal stores these exact dimensions:

- `dispatch`: `authorized | sent_observed | positively_not_sent`;
- `transportReceipt`: `none | received`;
- `execution`: `unknown | not_started | started | completed`;
- `cleanup`: `unknown | no_handle | held | cleanup_complete`.

The delivery also stores one effect dimension independent of physical-send ordinal:

- `effect`: `not_applicable | unknown | not_applied | applied`.

A dispatch ordinal is created **only** by the durable authorization transaction in Section 10. Its initial dispatch value is `authorized`. For that ordinal the only legal refinements are:

- `authorized -> sent_observed` from positive transport/local send evidence;
- `authorized -> positively_not_sent` only from positive evidence that the authorized send was not physically emitted; cancellation or response loss alone is insufficient;
- `transportReceipt: none -> received` from an authenticated receipt for that exact ordinal;
- `execution: unknown -> not_started | started | completed`, and `started -> completed`;
- `cleanup: unknown -> no_handle | held | cleanup_complete`, and `held -> cleanup_complete`;
- `effect: unknown -> not_applied | applied`; `not_applicable` is fixed for result-only work.

Within one dispatch ordinal, `sent_observed` cannot later become `positively_not_sent`, `started/completed` cannot become `not_started`, `held/cleanup_complete` cannot become `no_handle`, and `applied` cannot become `not_applied` (or vice versa). `received` remains only transport receipt evidence. `completed` remains only local execution evidence and does not mean Case result acceptance. `cleanup_complete` means the local resource/handle is positively gone; it says nothing by itself about external-effect outcome.

The local Agent/effect adapter attaches a monotonically increasing positive safe-integer `localEvidenceRevision` to accepted execution/cleanup/effect observations for the exact `deliveryId + executor tuple`. Reconnect does not reset this revision; executor replacement cannot issue evidence for the predecessor tuple. The delivery authority classifies every duplicate/delayed/conflicting observation before mutation:

- **exact replay** — same command/observation identity, same revision and same canonical digest/value: return the existing receipt, no transition;
- **stale** — lower connection epoch, lower capacity/evidence revision, superseded executor tuple, older dispatch ordinal used as if current, expired/tombstoned identity, or any already-retired generation: no mutation;
- **conflict** — same identity/revision with different canonical content, or a transition contradicting already accepted stronger evidence: no mutation and surface conflict;
- **monotonic refinement** — a higher valid evidence revision may replace only the weaker/unknown dimension it proves, and only when the resulting complete disposition tuple remains globally legal under the rules below.

Those per-axis transitions are necessary but not sufficient. The complete tuple has these normative negative-evidence scopes and cross-axis implications:

- `dispatch=positively_not_sent` is positive historical proof that this exact authorized `dispatchOrdinal` never crossed the physical-send emission boundary. Missing send acknowledgement, cancellation, disconnect or an unobserved socket call is not that proof.
- `execution=not_started` is positive historical proof that this exact delivery/ordinal never crossed the selected local executor operation's start boundary. It means more than "not currently running" and cannot be inferred from a process-list miss after owner reconstruction.
- `cleanup=no_handle` is reserved for positive proof that this exact delivery/ordinal never created or owned the selected local process/resource/handle. A raw observation that no handle exists **now** is only current absence and cannot set `no_handle`; when a handle existed and was later removed, the legal positive disposition is `cleanup_complete`.
- Lack of a downstream observation leaves the corresponding axis `unknown`/`none`; absence of evidence never creates any of the three negative proofs above.

Positive downstream evidence forbids contradictory upstream negatives without requiring all predecessor positives to have been observed. In particular:

1. an authenticated `transportReceipt=received` for an ordinal is incompatible with `dispatch=positively_not_sent` for that ordinal;
2. `execution=started` or `execution=completed` is incompatible with both `dispatch=positively_not_sent` and `execution=not_started`;
3. accepted `effect=applied` is incompatible with `dispatch=positively_not_sent` and `execution=not_started`, even when transport receipt or local-start evidence was not separately observed;
4. `execution=started`/`completed`, any other positive resource/process-creation evidence, `cleanup=held`, or `cleanup=cleanup_complete` is incompatible with `cleanup=no_handle`;
5. a later negative observation can never refine away any already accepted positive fact listed above.

Partial observation remains legal: for example `received + execution=unknown`, `completed + transportReceipt=none`, or `effect=applied + cleanup=unknown` does not require the missing predecessor axis to be synthesized. The implication rules only reject a simultaneously asserted absolute negative that the downstream positive makes impossible.

Evidence assimilation is atomic for the disposition tuple. After identity/revision checks, every incoming observation is classified as exactly one of **exact replay**, **stale**, **conflict**, or **monotonic refinement**. A proposed higher `localEvidenceRevision` is a refinement only when its per-axis transition is legal **and** the resulting whole tuple satisfies every cross-axis implication above. Otherwise the entire observation is `conflict`; the owner must not partially mutate one axis and leave an illegal Cartesian product.

`AgentDeliveryAuthority` is the sole durable writer of a bounded delivery evidence-conflict record containing the delivery/ordinal, conflicting evidence identities/revisions/digests and current disposition digest. While such a contradiction is unresolved, it blocks every new executable dispatch grant consumption, Agent dispatch authorization, physical send, initiation of a new local execution and same-delivery replay that could create another execution. Already-started execution may only be controlled/observed under its existing fence; the conflict cannot retroactively prevent or erase it. The conflict does not choose a Case result, rewrite an existing positive into a negative, or turn transport evidence into effect truth. Safe physical cleanup evidence may still monotonically prove that a real handle is gone and release physical capacity, but it does not clear the contradiction. If the conflict leaves whether send/start/effect occurred genuinely uncertain rather than rejecting one input as stale/invalid, the bounded conflict/uncertainty evidence crosses to CaseDO for conservative reconciliation; CaseDO remains the only semantic result/retry/reconciliation owner.

A higher dispatch ordinal for the same `deliveryId` is allowed only after one of two explicit safety proofs: the previous ordinal is positively unsent/not-started with no physical handle, or an independently accepted effect contract explicitly authorizes replay of the same stable effect key. It requires the delivery to retain a valid admission-capacity unit and a fresh one-shot Section-10 Case dispatch grant followed by Agent dispatch authorization for the new ordinal. No disposition transition, reconnect, receipt replay or new dispatch ordinal creates a new Task/Attempt; semantic retry remains Case authority only.

### 11.2 Bounded idempotency, tombstones and ancient replay

Idempotency state is bounded. Large historical receipt sets may be compacted only when a smaller durable fence still makes every GC'd request stale. An ancient request is never reinterpreted as a fresh command merely because its detailed receipt was collected.

| Command class | Identity / exact replay | Retention and GC condition | After detailed receipt/tombstone GC |
| --- | --- | --- | --- |
| connect | `routeGeneration + expectedConnectionEpoch + connectRequestId + requestDigest`; exact current/last receipt replays | keep the current/last connection record plus only a bounded recent receipt set; older detail may GC after a strictly later durable `connectionEpoch` exists | durable last epoch/predecessor check rejects the ancient connect as stale; it cannot allocate a new epoch |
| capacity advertisement/update | exact executor tuple + `capacityRevision` + canonical digest/value | keep accepted high-water record for the live executor generation plus bounded recent receipts; compact GC into durable accepted/high-water revision | `capacityRevision <=` high-water is replay/stale according to digest if retained, otherwise stale; it cannot restore an older capacity |
| reserve | `reservationWindowGeneration + reservationRequestId` is the stable request identity; request digest binds Case/Task/predicted Attempt, expiry and descriptor | bounded detail is retained for every request in the one open window; an individual request ID is never forgotten while that window remains open. Window rollover/GC follows Section 11.3 only | generation below `minimumAcceptedReservationWindow` is stale before ID/digest lookup; a historical identity, including the same ID with different digest, can never become new work |
| activate | live reservation + activation request identity/digest + exact Attempt fence + descriptor/body binding | activation receipt lives with delivery; terminal tombstone is retained through the delivery replay horizon and at least the reservation tombstone horizon | activation can only consume an extant live reservation; missing/GC'd reservation or delivery identity is stale and can never recreate either |
| transport/local observation | deliveryId + connection tuple where transport-scoped + dispatch ordinal or `localEvidenceRevision` + digest | live delivery stores only finite disposition fields/high-water revisions; bounded terminal delivery tombstone after close | an observation never creates a delivery; unknown/GC'd delivery or revision at/below compacted high-water is stale |
| result handoff | exact delivery/result digest maps to the existing Case command/result receipt and Attempt fence | Case receipt retention remains Case-owner bounded; delivery bridge keeps only bounded delivery/result crossing metadata | the bridge rereads Case authority; missing/GC'd delivery cannot create a new Case command identity or Attempt, and an already accepted exact Case result follows existing Case replay semantics |

Finite configuration therefore includes replay horizons/tombstone counts, while compact last-epoch/high-water records remain O(1) per live route/executor/delivery generation rather than growing with historical commands.

### 11.3 Reservation-window non-reuse fence

Reservation GC uses one bounded generation namespace rather than an unbounded historical request-ID set. `AgentDeliveryAuthority` durably owns two positive safe integers: the one open `reservationWindowGeneration = G` and `minimumAcceptedReservationWindow = F`. Revision 1 maintains `F == G` at all times and retains no closed-but-still-accepted reservation window. A new `tryReserveSlot` is admitted only when it explicitly carries the current `G`; the stable reservation request identity is `(G, reservationRequestId)`, while `reservationRequestDigest` binds its immutable content.

Within open G, same identity + same digest is exact replay, same identity + different digest is conflict, and a different request ID is new only after ordinary fresh Case/admission/capacity evaluation. A request with generation `< F` is stale before any detailed lookup; a generation `> G` is unsupported future input. The owner never rewrites an old request's generation to current and never treats "unknown after GC" as new.

Detailed receipts/tombstones for G are bounded by configuration and are **not individually deleted while G remains open**, because forgetting one identity inside an accepting namespace would permit resurrection. When the bounded detail budget requires compaction, the owner stops admitting new reservations for G and performs a rollover only after every reservation from G is expired/terminal, no activation/delivery admission hold can still consume one, and the configured replay grace has elapsed. The rollover atomically and durably advances both `reservationWindowGeneration` and `minimumAcceptedReservationWindow` to `G + 1` before deleting G's detailed receipts/tombstones. Generation overflow fails closed. If G cannot drain, new reservation admission fails boundedly rather than opening extra historical windows or accumulating an unbounded ID set.

After that fence commit, G is permanently closed. Any ancient G reserve or activation replay is stale before it can acquire capacity, recreate a reservation, activate a delivery, obtain a dispatch grant/authorization or reach execution; the same historical `(G, reservationRequestId)` with a different digest is still stale, not a fresh request. A legitimate later reservation uses the new current generation and a new stable request identity after fresh Case/admission evaluation. Closed generations are never reopened.

This fence has a different owner/lifetime from the other generations. `connectionEpoch` fences logical transport sessions; executor `capacityRevision` fences reported capacity evidence; the executor epoch fences process-generation identity; `deliveryId` remains stable for one Attempt across reconnect; the Attempt fence remains Case semantic authority. `reservationWindowGeneration` exists only to bound reservation idempotency-detail lifetime. Advancing it cannot release a live capacity unit, supersede a connection/executor, close a delivery, create an Attempt, or authorize dispatch. Its durable cost is two O(1) scalar fences plus one bounded current-window request map.

Case command/result receipts remain Case authority. Physical effect truth remains Agent/effect-adapter evidence consumed by Case reconciliation. Transport receipts are finite fields, not an unbounded message log, and transport receipt never becomes semantic/effect receipt.

## 12. Result handoff

A result message must match the current authenticated connection, active deliveryId, delivery executor tuple, exact Case/Task/Attempt identity/fencing token and bounded result/effect envelope before it may cross into Case authority.

The bridge then calls the existing Case result/reconciliation command with a stable idempotency identity derived from the exact delivery/result digest. CaseDO is the final semantic arbiter. Response loss is reconciled by reading Case durable receipt/state, never by creating another Attempt or lower-layer retry.

A new connection leaves deliveryId/Attempt fence unchanged. A new executor generation cannot satisfy a predecessor delivery.

## 13. Disconnect, reconnect and reconstruction

A confirmed disconnect marks only the connection unavailable. It does not by itself release a delivery admission hold or physical slot, change executor epoch, fail an Attempt or prove an external effect absent. New reservations require a valid current connection whose capacity-freshness barrier has been satisfied by a known positive effective capacity unless a later accepted revision proves an equivalent conservative reachability mechanism.

On reconnect the owner advances connection epoch, fences the old connection, installs the capacity-freshness barrier, and reconciles each live delivery against exact executor/local evidence. That reconciliation updates only the Section-11 dimensions under their evidence revisions:

- positive `execution=not_started` with `cleanup=no_handle` may permit a later dispatch ordinal for the **same** delivery only after a fresh one-shot Case dispatch grant for that ordinal and grant-bound Agent authorization;
- `execution=started` and/or `cleanup=held` resumes observation/control of that same physical execution and keeps its physical hold;
- `execution=completed` forwards/reconciles existing exact result/effect evidence; `cleanup_complete` may independently release physical capacity even while result/effect truth remains uncertain;
- `execution=unknown` or `effect=unknown` never authorizes blind replay; Case reconciliation/recovery remains effect-class dependent.

Agent owner restart/eviction reconstructs durable state and may reattach a hibernating socket. It neither advances connection epoch for the same healthy logical connection nor synthesizes capacity freshness, frees physical holds without positive evidence, nor triggers Case recovery.

CaseDO reconstruction likewise does not imply delivery/executor loss.

## 14. Cancellation

Cancellation stays Case semantic authority; `AgentDeliveryAuthority` owns only the delivery-side dispatch linearization and accepted physical evidence.

1. **Before reservation:** no D0020 state.
2. **Reservation exists, Case start did not commit:** release/expire reservation; zero delivery/effect.
3. **Running Attempt committed, delivery not activated:** activation validates the exact Attempt/fence but still creates only `dispatch=not_authorized`; cancellation can close the crossing without send.
4. **Activated, before Case dispatch grant:** activation is still non-executable. The crossing submits the stable Section-10 `grant_attempt_dispatch` command to the same CaseDO serialization boundary as `cancel_task`. If cancellation/terminal mutation commits first, the grant predicate cannot commit, no Agent dispatch authorization or physical send is permitted, and positive no-start/no-handle closure releases the delivery admission hold.
5. **Case dispatch grant committed first:** the grant commit is the cancellation-vs-dispatch linearization point. A cancellation committed after that grant is ordered after dispatch permission and the delivery is conservatively **possible execution**, even if Agent authorization has not committed yet or the physical socket write has not started. Cancellation is control intent; it cannot erase the grant or infer absence/effect outcome.
6. **Agent authorization/send after grant:** Agent authorization must bind the exact grant and may still withhold a not-yet-sent dispatch when later cancellation control is observed. Whether withheld or transport-ambiguous, absence is established only by exact positive evidence for that ordinal: `positively_not_sent`, `execution=not_started`, and where required `cleanup=no_handle`. Only such evidence may monotonically refine the conservative possible-execution view; stronger `effect=not_applied` still requires the effect contract to support it.
7. **Send/start may have happened:** cancellation is control intent; send exact cancellation/control to the current delivery/executor, retain physical capacity only until positive no-handle/cleanup evidence, and keep any result/effect uncertainty durably separate for Case reconciliation.
8. **Late result after cancellation:** remains subject to current delivery ingress and existing Case result/Attempt fencing.

Response loss/reconnect never changes this order. Activation response loss is resolved by rereading activation; grant response loss by replay/reread of the same immutable Case command request; Agent authorization response loss by rereading the exact grant-bound dispatch ordinal; transport response loss leaves a committed grant/authorization as possible execution until stronger evidence arrives. None of those paths creates a new Attempt or implicit semantic retry.

## 15. External-effect uncertainty and replay

Delivery recovery is not semantic retry.

Reconnect may create a later dispatch ordinal for the **same delivery** only through Section 11's explicit safety proof and a fresh Case-serialized `grant_attempt_dispatch` for that exact new ordinal: predecessor local execution is positively `not_started` with no handle, or an independently accepted effect contract explicitly makes replay of the same stable effect key safe. The new ordinal still requires its grant-bound durable Agent dispatch authorization and valid capacity accounting. Unknown external effects never trigger blind replay.

For external work:

- idempotent external work uses the existing stable Task effect key under its accepted contract;
- reconcilable external work requires authoritative effect evidence before retry;
- unrecoverable unknown remains reconciling/unverified rather than guessed success/failure;
- response loss after possible effect is resolved from effect evidence + Case durable semantic state, not transport ack.

For result-only work, explicit executor-owner loss may feed the existing interrupted/retry path, but a second invocation is a new Case Attempt rather than same-Attempt hidden replay.

## 16. Execution-owner loss crossing

D0019 already exposes durable idempotent execution-owner-loss recovery. D0020 may call it only with a specific fenced recovery cause containing Agent route, delivery identity, connection observations, executor tuple, Attempt fence and bounded evidence digest.

These alone are not execution-owner-loss proof:

- new connection epoch;
- ordinary disconnect;
- Agent-owner reconstruction/hibernation;
- CaseDO reconstruction;
- RPC response loss;
- capacity shrink.

Executor replacement proves the replacement cannot own the predecessor delivery, but whether predecessor external effect is absent versus unknown still depends on local/effect evidence. Recovery remains conservative.

## 17. Bounds and backpressure

Implementation must select finite values for at least:

- `maxAgentCapacity`;
- maximum live reservations, delivery admission holds and physical execution slots;
- maximum retained delivery/effect-uncertainty records independent of physical capacity;
- reservation lifetime, replay grace, maximum detailed request identities in the one open reservation window, reservation-window safe-integer/overflow bound, command-class receipt/tombstone counts and delivery replay horizon;
- maximum dispatch ordinals per delivery;
- delivery/body/envelope bytes and aggregate live/retained evidence bytes;
- connection metadata/WebSocket attachment bytes;
- capacity revision and local evidence revision safe-integer bounds/overflow behavior;
- transport receipt/evidence bytes and fixed disposition dimensions;
- identifiers, request IDs, protocol metadata and errors;
- recovery/reconciliation evidence;
- provider RPC/WebSocket frame limits below provider/application ceilings.

There is no durable waiter list proportional to blocked Tasks. Compact last-epoch/revision high-water marks are bounded fencing state, not historical receipt logs.

All preflightable capacity/size/resource checks use the immutable reservation descriptor before Case Attempt creation. A bound discovered only after Case start fails closed into explicit not-activated/recovery/reconciliation instead of disappearing, substituting payload, or inventing retry.

Capacity lifetime is deliberately separate from semantic uncertainty:

1. a reservation consumes one non-executable admission unit;
2. activation converts that same unit one-for-one into a delivery admission hold, without double-counting;
3. positive local `started/held` evidence converts the delivery's unit into an actual **physical execution slot**, meaning a real Agent process/resource/handle is owned;
4. if execution is positively never started and the delivery is closed against further dispatch, positive `no_handle` evidence releases the admission hold;
5. after physical execution started, positive `cleanup_complete` (or equivalent exact no-handle proof) releases the physical slot **as soon as the actual Agent resource is gone**, even when result/effect disposition is still `unknown` and the Case remains reconciling/unverified.

Disconnect, timeout, cancellation, owner reconstruction, transport receipt or Case semantic terminality alone never proves physical cleanup. Conversely, semantic terminality is **not** required before a positively cleaned-up process/resource/handle is removed from physical-capacity accounting. After slot release, the bounded delivery/effect record can remain durable for reconciliation and retry prohibition; freeing physical capacity does not authorize another semantic Attempt or erase uncertainty.

After delivery/tombstone GC, transport replay alone cannot recreate execution. Compact epoch/revision fences classify ancient input as stale, and the bridge rereads Case authority before any remaining crossing.

## 18. Security and identity

Agent, connection, delivery and executor IDs are identifiers, not bearer credentials. Externally reachable connect/message/result paths authenticate the Agent principal before accepting them.

The implementation must:

- bind the authenticated principal to exactly one Agent route/generation;
- reject caller-selected arbitrary Case provider/storage routing;
- resolve Case result placement through the existing Case authority path;
- validate strict typed/canonical envelope shape and byte limits before mutation;
- keep provider secrets/Agent credentials outside Case/Plan/result/evidence payloads;
- treat stale connection/executor identities as replay/hostile input;
- prevent cross-Agent observation/mutation of delivery/capacity state.

Concrete credential enrollment/rotation/install policy remains a downstream owner and must satisfy, not weaken, this boundary.

## 19. Storage, provider and local runtime requirements

The durable owner needs atomic persistent mutation for immutable route self-binding, connection generation/current identity/connect receipt, executor tuple, accepted capacity revision/reported/effective values and freshness barrier, `reservationWindowGeneration`/`minimumAcceptedReservationWindow` plus bounded current-window reservation detail, reservations/preflight descriptors, activated deliveries, exact Case dispatch-grant bindings, dispatch authorizations/ordinals, admission/physical-capacity accounting, immutable body/envelope binding, fixed transport/execution/cleanup/effect dispositions with evidence high-water marks/conflict records, bounded replay tombstones/floors and recovery cause IDs.

In-memory maps, socket objects and process handles are projections only.

A Cloudflare Durable Object is a viable Group F host only if provider qualification proves:

- one elected Agent route reaches one writable object;
- durable storage preserves the selected owner state;
- Hibernation WebSocket reconstruction preserves the same logical connection without synthetic epoch change;
- attachment contains only bounded locator/fence data and durable state survives socket loss;
- superseded sockets remain stale-fenced even when physically open;
- eviction/deployment reconstruction cannot lose live slots/deliveries;
- provider schema/config/version overlap, namespace/jurisdiction and limits are deployment-owned and fail closed.

The local Agent must support exact Agent/route/connection/executor identities, monotonic per-executor `capacityRevision`, monotonic per-delivery/executor local evidence revisions, one fresh runtime operation per semantic Attempt, bounded dispatch-ordinal duplicate suppression, bounded process/resource cleanup, explicit not-started/started/completed/no-handle/cleanup/effect evidence matching Section 11, executor-generation replacement fencing and no semantic retry queue. It reports evidence; `AgentDeliveryAuthority` remains the sole durable writer of accepted/effective capacity and delivery dispositions.

A durable local execution journal is not required for correctness merely to survive unknown disposition: restart may conservatively report `unknown` and force Case reconciliation. If later availability/SLO requirements need automatic decisive recovery after Agent restart, they must explicitly select and bound such a journal.

## 20. Compatibility, migration, deployment and rollback

The existing direct/local `runCase({capacity})` path remains compatible and still means per-invocation capacity. The Agent-backed path must not claim aggregate capacity unless it uses the selected owner and must not silently fall back to per-Case capacity when the owner/provider is unavailable.

Existing Case snapshot/fence/result schema remains semantic authority. Revision 1 does not require connection epoch or deliveryId to become Case truth.

For initial deployment there is no existing Agent delivery-owner state to migrate. Before production admission, the deployment owner commits the single immutable Section-7 `AgentRouteBinding` with a non-reused route generation and exact deployment/environment/Worker/class/namespace/jurisdiction/Durable-Object identity, proves there is no simultaneous writable owner for that supported `agentId`, establishes durable namespace/storage/schema compatibility, capacity/byte/replay ceilings and authenticated Agent path, then independently qualifies source/provider failure behavior before enabling Agent-backed Case admission.

Revision 1 supports initial binding only. A live route move, namespace/jurisdiction cutover, storage recreation under a new writable identity, or dual-write migration is unsupported/fail-closed and is a separate Class-2 concern if required. Full credential enrollment/revocation remains separately owned.

After any delivery state exists, rollback may not switch to code that ignores route/connection/capacity/evidence revisions, dispatch authorization, capacity-slot ownership, tombstone floors or delivery uncertainty. Rollback must remain schema/protocol compatible or first drain/fence the route so no reservations/admission holds/physical slots remain and related Case Attempts/effect uncertainties are terminal or explicitly reconciled. Deleting/recreating provider storage is not semantic rollback and cannot silently reset route generation or replay floors.

## 21. Explicitly rejected alternatives

- **Durable Agent Task queue:** rejected because it duplicates Case readiness/retry/order authority.
- **Start Attempt then wait indefinitely for capacity:** rejected because saturation would create an unbounded pseudo-queue of running-but-unexecutable Attempts and consume semantic attempt state.
- **Use `dispatch_pending`/`queued` now:** rejected because D0019@r2 froze running-before-D0020; changing that is predecessor re-design, not D0020 implementation detail.
- **connectionEpoch == executorEpoch:** rejected because network reconnect and executor replacement are different failure domains.
- **connectionEpoch inside deliveryId:** rejected because reconnect would manufacture a second logical delivery.
- **free slot on disconnect/timeout:** rejected because neither proves local resource cleanup; positive cleanup may free physical capacity later without erasing semantic uncertainty.
- **hold physical slot until semantic reconciliation ends:** rejected because a positively cleaned-up process/handle is no longer physical capacity even if effect/result truth remains unknown.
- **inherit positive capacity across reconnect:** rejected because delayed updates within one executor generation require a fresh monotonic capacity revision fence.
- **activation == dispatch authorization:** rejected because activation must remain non-executable so Case cancellation can serialize against a later one-shot dispatch grant.
- **fresh Case reread followed by Agent-side authorization as the cancellation boundary:** rejected because cancellation can commit after the reread and before the Agent commit. The selected CaseDO grant is the single durable ordering fact; Agent authorization binds it but does not replace it.
- **unbounded idempotency receipt log:** rejected; bounded receipts/tombstones compact only behind durable epoch/revision/fence high-water state that makes ancient requests stale.
- **TTL-only reservation ID reuse or unknown-after-GC-is-new:** rejected. The bounded reservation window must be permanently fenced before detail GC, so replay of the old generation is stale regardless of request digest.
- **transport ack == effect receipt:** rejected because transport does not own effect truth.
- **blind replay after reconnect:** rejected unless predecessor `not_started`/no-handle or independent effect-idempotency proof exists, followed by a fresh one-shot Case dispatch grant and grant-bound Agent authorization for the new ordinal.
- **mandatory durable local journal now:** not selected; conservative unknown -> Case reconciliation is safe, and stronger restart availability is a separate explicit requirement.

## 22. Acceptance criteria

Acceptance requires independent review to confirm all of the following without reopening D0018/D0019 semantics:

1. one `AgentDeliveryAuthority` owns durable Agent route/connection/delivery/admission facts while CaseDO/CaseEngine remains sole semantic Task/Attempt/retry/result/reconciliation owner;
2. the local Agent/executor is only the reported-capacity/physical-evidence producer, while `AgentDeliveryAuthority` is the sole durable writer of accepted/effective capacity and accepted delivery dispositions;
3. delivery state uses the independent dispatch/transport-receipt/execution/cleanup/effect dimensions plus Section-11 cross-axis implication rules; `positively_not_sent`, `not_started` and `no_handle` have the exact historical-negative scopes defined there, and current handle absence is not silently promoted into proved-never-created;
4. every observation is deterministically classified as exact replay, stale, conflict or monotonic refinement; a higher revision cannot commit an illegal global evidence tuple, positive downstream evidence forbids contradictory upstream negatives without requiring unobserved predecessor positives, and conflict blocks new executable crossing without deciding Case semantics;
5. capacity N bounds one aggregate stream of reservation/admission/physical units across multiple Cases, with N=1 the same algorithm and no reservation-to-delivery double count/gap;
6. `capacityRevision` fences delayed updates within one executor generation; same-revision different values conflict and lower revisions cannot restore an older capacity;
7. every new logical connection, including reconnect to the same executor tuple, admits zero until a strictly fresher capacity revision arrives; executor replacement also starts capacity-unknown/0;
8. saturation/freshness/storage-bound denial creates no durable waiting Task entry and consumes no Attempt/retry budget;
9. every reservation contains only the immutable preflight descriptor, and all known body/resource/protocol/envelope bounds fail before Attempt creation; activation body digest/bytes and complete envelope must match that descriptor;
10. no executable payload can cross before the exact Case `running` Attempt/fence commit and successful activation of that exact live reservation;
11. activation is not send authorization: every executable dispatch ordinal first obtains the exact one-shot CaseDO `grant_attempt_dispatch` receipt from the same serialization boundary as cancellation, then Agent authorization binds that exact grant, and no physical send may start before both commits;
12. cancel-first means the Case grant cannot commit and there is no first send; grant-first is the cancellation-vs-dispatch linearization even when cancellation arrives before Agent authorization/socket write, so later cancellation is possible execution/control intent until positive not-sent/not-started/no-handle evidence refines it;
13. old route-generation/connection messages cannot mutate delivery or Case state after supersession, and reconnect can preserve executor tuple while executor replacement cannot masquerade as reconnect;
14. connect/capacity/reserve/activate/Case-dispatch-grant/Agent-authorization/transport-local-observation/result handoff response loss follows the selected owner receipt rules and never double-allocates a grant, capacity unit, delivery, ordinal or execution;
15. reservation detail GC is legal only after permanent bounded window closure: requests below `minimumAcceptedReservationWindow` are stale before lookup, same historical identity with a different digest is never new work, and ancient replay cannot regain reservation/capacity/delivery/grant/authorization/execution; other command classes retain their Section-11.2 compact predecessor/epoch/revision/delivery fences;
16. a physical slot means actual local process/resource/handle ownership; positive cleanup/no-handle evidence releases physical capacity independently of later semantic/effect uncertainty;
17. releasing physical capacity while `effect=unknown` leaves bounded delivery/effect evidence and Case reconciliation/retry prohibition intact; cleanup is not semantic/effect receipt;
18. transport receipt, local execution completion, physical cleanup, effect evidence and Case semantic result acceptance remain distinct facts;
19. transport loss/reconnect/owner reconstruction never guesses effect truth, frees physical capacity without evidence or starts semantic retry;
20. Agent-owner/Case-owner reconstruction alone neither changes connection generation for a healthy logical connection nor causes semantic reopen;
21. a healthy hibernating WebSocket can survive owner reconstruction without synthetic connection epoch, while an actual reconnect installs both a new connection epoch and capacity-freshness barrier;
22. shrink preserves existing reservation/admission/physical units, growth only permits fresh admission, and unknown/zero capacity admits none;
23. the revision-1 initial `AgentRouteBinding` has one deployment-owned immutable non-reused route generation and exact deployment/environment/class/namespace/jurisdiction/object binding with no simultaneous writable owner;
24. live route migration/cutover/storage recreation under a new writable identity is unsupported/fail-closed rather than implicitly designed by credential success or name equality;
25. all reservation/delivery/dispatch/replay/body/evidence/identifier/uncertainty dimensions have selected finite ceilings and overflow fails closed;
26. authenticated Agent routing prevents cross-Agent/cross-Case authority injection; existing local runner behavior remains compatible but is not mislabeled Agent-global capacity; rollback cannot ignore new fencing/accounting state or create an unfenced fallback.

Independent acceptance must specifically challenge whether the non-executable pre-dispatch reservation is the smallest valid cross-owner admission primitive. If it duplicates semantic scheduling or cannot be recovered without a second authority, reject/split this revision rather than hiding the defect in implementation.

Acceptance must also confirm the Section-10 Case grant as the selected cancellation/dispatch arbitration contract and record the owner obligation: after D0020 r1 is accepted, but **before any D0020 implementation**, `docs/PROTOCOL.md` must be amended owner-natively with `grant_attempt_dispatch`, the exact fields/admission predicate above, normal Case receipt/idempotency behavior, one `attempt_dispatch_granted` Event + Case revision advance on first commit, cancellation serialization, and the explicit facts that it adds no Attempt lifecycle state and transfers no delivery ownership to CaseDO. This draft correction does not perform that PROTOCOL mutation.

## 23. Verification layers after acceptance

### Source/model

Add deterministic tests for multi-Case capacities 1/N; stale/lower and same-revision-conflicting capacity updates; reconnect freshness to the same executor and replacement-executor unknown/0 capacity; reserve/activate/Case-dispatch-grant/Agent-authorization response loss; old route-generation/connection late ack/result; exact duplicate versus stale/conflicting/higher-revision delivery evidence; every legal/illegal per-axis and cross-axis dispatch/transport/execution/cleanup/effect tuple; reservation-window rollover plus ancient replay after reservation detail GC and every other receipt/tombstone GC path; cancel-first/grant-first ordering including cancellation before physical socket write; disconnect before/after authorization/send/start/effect; Agent/Case owner reconstruction; saturation/shrink/unknown/growth; immutable preflight descriptor/body-digest/byte/resource/envelope mismatch and exhaustion; expired unactivated reservation; physical cleanup with still-unknown effect/result; unknown external-effect reconciliation; and no semantic retry from any delivery transition.

The repository source gate remains required; focused tests do not replace it.

### Provider/runtime

Independently verify real Cloudflare Durable Object/storage/WebSocket behavior: one immutable deployed route binding maps to one writable object; Hibernation reconstruction on the same logical connection; explicit reconnect/new epoch with old-socket rejection and capacity-freshness barrier; eviction/reconstruction with live reservation/admission/physical accounting plus replay floors; concurrent multi-Case capacity races; dispatch/cancellation/disconnect/response-loss injection; exact deployed namespace/jurisdiction/route identity; bounded tombstone/GC persistence; and provider limits/schema/config compatibility.

### Local Agent/machine

Verify fresh per-Attempt execution, monotonic capacity/evidence revisions, dispatch-ordinal duplicate suppression, cancellation/descendant cleanup, executor replacement, local result/effect evidence, positive no-handle/cleanup classification, physical capacity release immediately after actual resource cleanup even while semantic uncertainty remains, and no lower-layer semantic retry.

### Deployed product

Later Group F/Level-4 proof must compose CaseDO + Agent delivery authority + authenticated local Agent under real reconnect/restart/stale-delivery/capacity-pressure conditions. Source, provider, local-machine and deployed proofs do not substitute for one another.

## 24. Deferred/non-owned concerns

Deferred unless a later owner makes them safety prerequisites:

- concrete Agent credential enrollment/rotation/revocation and multi-tenant IAM;
- user-facing Agent installation/update;
- remote Git publication;
- general provider deployment/migration automation;
- durable local delivery journal for stronger restart availability;
- fairness/priority/quota among Cases waiting for one Agent;
- multi-Agent selection/load balancing;
- context slicing/model-session reuse;
- arbitrary external-effect exactly-once guarantees;
- migration of a live Agent delivery owner across provider routes;
- latency/fairness SLO for capacity wait.

If any deferred item is required for safety rather than availability/convenience, this Design must be revised or split before implementation.

## 25. Lifecycle and implementation boundary

This accepted revision authorizes only owner-native implementation of the selected semantic boundary after required product-owner amendments and current WORKBOARD routing separately make that implementation runnable. Runtime/module naming should remain semantic, for example Agent delivery authority/provider host and local Agent transport adapter; Design numbers remain provenance rather than runtime architecture.

For this accepted revision, owner impact order is mandatory: before implementation, amend `docs/PROTOCOL.md` to add the exact Section-10 `grant_attempt_dispatch` command vocabulary, fields, admission predicate, receipt/replay/conflict behavior, `attempt_dispatch_granted` Event/Case-revision effect and cancellation serialization meaning. That amendment must explicitly preserve `running` as the already-committed D0019 predecessor, add no Task/Attempt lifecycle state, and leave activation/delivery/connection/capacity ownership in D0020 rather than CaseDO. The PROTOCOL amendment is owner-native follow-on work, not part of this draft correction and not optional implementation policy.

This acceptance does not itself activate production source changes, provider resources, deployment, WORKBOARD runnable-frontier/selection edits, Case semantic changes beyond the required future product-owner amendments, or compatibility removal. Implementation/provider/runtime proof remains a separate lifecycle layer.
