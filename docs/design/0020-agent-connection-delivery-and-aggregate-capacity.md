# Design 0020 — Agent Connection, Delivery, and Aggregate Capacity

- Status: `draft`
- Revision: 1
- Class: 2
- Decision date: 2026-08-20
- Capability Group: F — Cloudflare runtime and local Agent topology
- Drafting authority anchor: `development@dfd4d0c9768515fd80f62346c128acc37d84e34b`
- Trigger: required provisional Group F Agent connection/delivery/capacity gate in `docs/development/PROGRAM.md`
- Inherited boundaries: D0018 verified runtime boundary; D0019@r2 verified CaseDO authority adapter
- Product/runtime effect: Design proposal only; no implementation, provider mutation, deployment, WORKBOARD routing change, or lifecycle self-approval

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
| slot reservation | Agent delivery authority | Case/runner admission | durable short-lived non-executable pre-delivery record containing only immutable preflight descriptor and identity | slot token/generation + request digest + executor tuple + capacity revision | reservations + delivery admission holds + physical execution slots cannot exceed effective capacity; no executable body bytes |
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

Three generations remain distinct: **connection epoch**, **executor epoch**, and **Attempt fence**. Reconnect may change only connection epoch. Executor replacement changes the executor tuple. Semantic retry creates a new Attempt/fence.

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
| cancel after activation before dispatch authorization | fresh Case reread observes cancellation first; authorization/send forbidden | terminal/cancelled Attempt gains dispatch authorization |
| cancel races after durable dispatch authorization | treat as possible execution until positive not-sent/not-started evidence; cancellation is intent | cancellation rewrites possible send as absent or frees physical resource without evidence |
| stale result after new connection | ingress rejects | old socket can forward result |
| stale result after new executor generation | delivery + Case fences reject | replacement executor satisfies predecessor Attempt |
| payload/resource exhaustion | immutable descriptor preflight rejects every known bound before Attempt creation; activation verifies exact body/byte/bound equality | oversized known work creates running Attempt or activation substitutes unreserved bytes |
| reservation response loss | stable live request reread/replay; after bounded expiry/GC the ancient request is stale, never new | retry double-counts capacity or GC'd ID obtains a new reservation |
| activation response loss | reread durable activation; activation is still not dispatch authorization | retry creates second delivery/slot or sends because activation reply was lost |
| dispatch-authorization response loss | reread exact delivery/dispatch ordinal; existing authorization means possible execution, absent authorization permits only a fresh Case revalidation path | blind second authorization or physical send before durable authorization |
| transport/evidence replay after tombstone GC | compact epoch/high-water/fence rejects ancient identity; observation never creates delivery | GC'd command/observation creates connection/capacity/reservation/execution |
| result command response loss | reread Case durable receipt/state | second accepted result/Attempt appears |
| reservation expires after Case start but before activation | stale activation rejects; explicit delivery-not-activated recovery | expired reservation still sends or leaves silent permanent running |
| replay after transport receipt | same delivery reconciles; no later dispatch ordinal absent explicit positive safety proof + fresh Case validation | `received` authorizes a second invocation |
| executor replacement with old delivery live | predecessor admission/physical capacity unit and effect remain fenced/uncertain until positive predecessor no-handle/cleanup/recovery evidence; replacement capacity starts unknown/0 | new executor frees/replays predecessor blindly |

The cheapest decisive source/model tests are therefore: capacity-1 two-Case race; old-epoch late message; reconnect-with-same-executor; disconnect-after-send unknown-effect case; owner reconstruction; capacity shrink/unknown; response-loss idempotency; payload preflight; and ack-versus-effect separation.

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

A reservation request is idempotent and binds Agent route/executor tuple, the exact accepted `capacityRevision`, caller request digest, Case/Task identity, expected Case revision, predicted next Attempt ordinal/identity where exposed, bounded expiry, and an immutable **preflight descriptor**. The reservation carries no executable payload/body bytes and cannot be converted into execution by transport alone.

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

fresh CaseDO authoritative reread
  -> exact same Attempt is still nonterminal/running and not cancelled

AgentDeliveryAuthority.authorizeDispatch(...)
  -> durable dispatch ordinal + exact observed Case revision/fence
  + current connection/executor tuple
  -> dispatch = authorized        [linearization point]

only after that authorization commit
  -> first physical send attempt
```

If Case start fails/conflicts, release/expire reservation. If Case start response is ambiguous, reread Case authority before activation. If activation response is ambiguous, reread the reservation/delivery record; activation alone never authorizes send. If Case cancellation/terminal state is authoritatively observed before dispatch authorization commits, authorization fails and no send occurs. If dispatch-authorization response is ambiguous, reread the exact delivery/ordinal record before doing anything; never mint a second authorization blindly. Once durable dispatch authorization exists, a racing cancellation is conservatively treated as possible execution until positive not-sent/not-started evidence refines it.

Revision 1 does not use `dispatch_pending`/`queued` for Agent capacity waiting. D0019@r2 froze `running` before the D0020 crossing; using those latent states would amend an accepted predecessor and require D0019 re-review. The capacity reservation is outside Case semantics and is intentionally non-executable.

## 11. Delivery identity and receipts

`deliveryId` is stable for one exact committed Attempt across reconnects and binds at least:

`agentId + routeGeneration + caseId + taskId + attemptId + executorId + executorEpoch + fencingToken`

Connection epoch is excluded so reconnect cannot create a second logical delivery. Activation separately stores immutable payload/body digest, effect key where applicable, source Case revision, slot token/generation, protocol version and byte count. Same deliveryId with different immutable content conflicts.

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

- **exact idempotent replay** — same command/observation identity, same revision and same canonical digest/value: return the existing receipt, no transition;
- **stale reject** — lower connection epoch, lower capacity/evidence revision, superseded executor tuple, older dispatch ordinal used as if current, expired/tombstoned identity, or any already-retired generation: no mutation;
- **conflict** — same identity/revision with different canonical content, or a transition contradicting already accepted stronger evidence: no mutation and surface conflict;
- **monotonic evidence refinement** — a higher valid evidence revision that satisfies the transition rules above may replace only the weaker/unknown dimension it proves.

A higher dispatch ordinal for the same `deliveryId` is allowed only after fresh Case revalidation and one of two explicit safety proofs: the previous ordinal is positively unsent/not-started with no physical handle, or an independently accepted effect contract explicitly authorizes replay of the same stable effect key. It requires the delivery to retain a valid admission-capacity unit and the Section-10 dispatch-authorization transaction again. No disposition transition, reconnect, receipt replay or new dispatch ordinal creates a new Task/Attempt; semantic retry remains Case authority only.

### 11.2 Bounded idempotency, tombstones and ancient replay

Idempotency state is bounded. Large historical receipt sets may be compacted only when a smaller durable fence still makes every GC'd request stale. An ancient request is never reinterpreted as a fresh command merely because its detailed receipt was collected.

| Command class | Identity / exact replay | Retention and GC condition | After detailed receipt/tombstone GC |
| --- | --- | --- | --- |
| connect | `routeGeneration + expectedConnectionEpoch + connectRequestId + requestDigest`; exact current/last receipt replays | keep the current/last connection record plus only a bounded recent receipt set; older detail may GC after a strictly later durable `connectionEpoch` exists | durable last epoch/predecessor check rejects the ancient connect as stale; it cannot allocate a new epoch |
| capacity advertisement/update | exact executor tuple + `capacityRevision` + canonical digest/value | keep accepted high-water record for the live executor generation plus bounded recent receipts; compact GC into durable accepted/high-water revision | `capacityRevision <=` high-water is replay/stale according to digest if retained, otherwise stale; it cannot restore an older capacity |
| reserve | reservation request identity/digest + Case/Task/predicted Attempt + bounded expiry + descriptor digest | live record through expiry/terminal; bounded terminal tombstone through configured replay grace; GC only after the request is expired and cannot activate | expired/missing ancient reservation request is stale; it may not obtain a new reservation. A new reservation requires a new non-expired request identity after fresh Case/admission evaluation |
| activate | live reservation + activation request identity/digest + exact Attempt fence + descriptor/body binding | activation receipt lives with delivery; terminal tombstone is retained through the delivery replay horizon and at least the reservation tombstone horizon | activation can only consume an extant live reservation; missing/GC'd reservation or delivery identity is stale and can never recreate either |
| transport/local observation | deliveryId + connection tuple where transport-scoped + dispatch ordinal or `localEvidenceRevision` + digest | live delivery stores only finite disposition fields/high-water revisions; bounded terminal delivery tombstone after close | an observation never creates a delivery; unknown/GC'd delivery or revision at/below compacted high-water is stale |
| result handoff | exact delivery/result digest maps to the existing Case command/result receipt and Attempt fence | Case receipt retention remains Case-owner bounded; delivery bridge keeps only bounded delivery/result crossing metadata | the bridge rereads Case authority; missing/GC'd delivery cannot create a new Case command identity or Attempt, and an already accepted exact Case result follows existing Case replay semantics |

Finite configuration therefore includes replay horizons/tombstone counts, while compact last-epoch/high-water records remain O(1) per live route/executor/delivery generation rather than growing with historical commands.

Case command/result receipts remain Case authority. Physical effect truth remains Agent/effect-adapter evidence consumed by Case reconciliation. Transport receipts are finite fields, not an unbounded message log, and transport receipt never becomes semantic/effect receipt.

## 12. Result handoff

A result message must match the current authenticated connection, active deliveryId, delivery executor tuple, exact Case/Task/Attempt identity/fencing token and bounded result/effect envelope before it may cross into Case authority.

The bridge then calls the existing Case result/reconciliation command with a stable idempotency identity derived from the exact delivery/result digest. CaseDO is the final semantic arbiter. Response loss is reconciled by reading Case durable receipt/state, never by creating another Attempt or lower-layer retry.

A new connection leaves deliveryId/Attempt fence unchanged. A new executor generation cannot satisfy a predecessor delivery.

## 13. Disconnect, reconnect and reconstruction

A confirmed disconnect marks only the connection unavailable. It does not by itself release a delivery admission hold or physical slot, change executor epoch, fail an Attempt or prove an external effect absent. New reservations require a valid current connection whose capacity-freshness barrier has been satisfied by a known positive effective capacity unless a later accepted revision proves an equivalent conservative reachability mechanism.

On reconnect the owner advances connection epoch, fences the old connection, installs the capacity-freshness barrier, and reconciles each live delivery against exact executor/local evidence. That reconciliation updates only the Section-11 dimensions under their evidence revisions:

- positive `execution=not_started` with `cleanup=no_handle` may permit a later dispatch ordinal for the **same** delivery after fresh Case validation and capacity authorization;
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
4. **Activated, before first dispatch authorization:** immediately before authorizing any executable send, the delivery authority must freshly reread Case authority and prove the exact Attempt is still the current nonterminal/running Attempt and not cancelled. If cancellation/terminal state is observed first, dispatch authorization does not commit, no physical send is permitted, and the no-execution/cleanup path may release the capacity hold.
5. **Durable dispatch authorization committed:** this commit is the cancellation-vs-dispatch linearization point. Only after it may transport attempt the physical send. A cancellation that becomes authoritative after this point is treated as **possible execution** even if the send call has not returned or its response is lost. Cancellation alone cannot rewrite `authorized` to `positively_not_sent` or infer `effect=not_applied`.
6. **Later positive not-sent/not-started evidence:** exact evidence for that dispatch ordinal may monotonically refine the delivery to `positively_not_sent` and/or `execution=not_started`, `cleanup=no_handle`; only then may stronger not-applied classification be used when the effect contract supports it.
7. **Send/start may have happened:** cancellation is control intent; send exact cancellation/control to the current delivery/executor, retain physical capacity only until positive no-handle/cleanup evidence, and keep any result/effect uncertainty durably separate for Case reconciliation.
8. **Late result after cancellation:** remains subject to current delivery ingress and existing Case result/Attempt fencing.

Response loss/reconnect never changes this order. Activation response loss is resolved by rereading activation; dispatch-authorization response loss by rereading the exact dispatch ordinal; transport response loss leaves an existing authorization as possible execution until stronger evidence arrives. None of those paths creates a new Attempt or implicit semantic retry.

## 15. External-effect uncertainty and replay

Delivery recovery is not semantic retry.

Reconnect may create a later dispatch ordinal for the **same delivery** only through Section 11's explicit safety proof and fresh Case revalidation: predecessor local execution is positively `not_started` with no handle, or an independently accepted effect contract explicitly makes replay of the same stable effect key safe. The new ordinal still requires durable dispatch authorization and valid capacity accounting. Unknown external effects never trigger blind replay.

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
- reservation lifetime, replay grace, command-class receipt/tombstone counts and delivery replay horizon;
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

The durable owner needs atomic persistent mutation for immutable route self-binding, connection generation/current identity/connect receipt, executor tuple, accepted capacity revision/reported/effective values and freshness barrier, reservations/preflight descriptors, activated deliveries, dispatch authorizations/ordinals, admission/physical-capacity accounting, immutable body/envelope binding, fixed transport/execution/cleanup/effect dispositions with evidence high-water marks, bounded replay tombstones/floors and recovery cause IDs.

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
- **activation == dispatch authorization:** rejected because cancellation needs one durable linearization point after fresh Case revalidation and before physical send.
- **unbounded idempotency receipt log:** rejected; bounded receipts/tombstones compact only behind durable epoch/revision/fence high-water state that makes ancient requests stale.
- **transport ack == effect receipt:** rejected because transport does not own effect truth.
- **blind replay after reconnect:** rejected unless predecessor `not_started`/no-handle or independent effect-idempotency proof exists, followed by fresh Case validation and a new durable dispatch ordinal.
- **mandatory durable local journal now:** not selected; conservative unknown -> Case reconciliation is safe, and stronger restart availability is a separate explicit requirement.

## 22. Acceptance criteria

Acceptance requires independent review to confirm all of the following without reopening D0018/D0019 semantics:

1. one `AgentDeliveryAuthority` owns durable Agent route/connection/delivery/admission facts while CaseDO/CaseEngine remains sole semantic Task/Attempt/retry/result/reconciliation owner;
2. the local Agent/executor is only the reported-capacity/physical-evidence producer, while `AgentDeliveryAuthority` is the sole durable writer of accepted/effective capacity and accepted delivery dispositions;
3. delivery state uses the independent dispatch/transport-receipt/execution/cleanup/effect dimensions and exact transition rules in Section 11 rather than an implementation-defined phase enum;
4. exact duplicate, delayed/stale, same-revision conflict and higher-revision monotonic evidence refinement have deterministic outcomes and none creates semantic retry;
5. capacity N bounds one aggregate stream of reservation/admission/physical units across multiple Cases, with N=1 the same algorithm and no reservation-to-delivery double count/gap;
6. `capacityRevision` fences delayed updates within one executor generation; same-revision different values conflict and lower revisions cannot restore an older capacity;
7. every new logical connection, including reconnect to the same executor tuple, admits zero until a strictly fresher capacity revision arrives; executor replacement also starts capacity-unknown/0;
8. saturation/freshness/storage-bound denial creates no durable waiting Task entry and consumes no Attempt/retry budget;
9. every reservation contains only the immutable preflight descriptor, and all known body/resource/protocol/envelope bounds fail before Attempt creation; activation body digest/bytes and complete envelope must match that descriptor;
10. no executable payload can cross before the exact Case `running` Attempt/fence commit and successful activation of that exact live reservation;
11. activation is not send authorization: fresh authoritative Case validation precedes every executable dispatch authorization, and no physical send may start before the matching authorization is durably committed;
12. cancellation observed before dispatch authorization forbids send; cancellation racing after durable authorization is possible execution until positive not-sent/not-started evidence refines it;
13. old route-generation/connection messages cannot mutate delivery or Case state after supersession, and reconnect can preserve executor tuple while executor replacement cannot masquerade as reconnect;
14. connect/capacity/reserve/activate/transport-local-observation/result handoff response loss/replay follows Section 11.2 bounded receipt/tombstone semantics and never double-allocates capacity or execution;
15. after detailed receipt/tombstone GC, compact predecessor/epoch/revision/delivery fences make an ancient command stale; a GC'd ID can never obtain a new connection generation, capacity value, reservation, delivery or execution;
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

## 23. Verification layers after acceptance

### Source/model

Add deterministic tests for multi-Case capacities 1/N; stale/lower and same-revision-conflicting capacity updates; reconnect freshness to the same executor and replacement-executor unknown/0 capacity; reserve/activate/dispatch-authorization response loss; old route-generation/connection late ack/result; exact duplicate versus stale/conflicting/higher-revision delivery evidence; every legal/illegal dispatch/execution/cleanup/effect transition; ancient command replay after each receipt/tombstone GC path; cancellation before and after the durable dispatch linearization point; disconnect before/after authorization/send/start/effect; Agent/Case owner reconstruction; saturation/shrink/unknown/growth; immutable preflight descriptor/body-digest/byte/resource/envelope mismatch and exhaustion; expired unactivated reservation; physical cleanup with still-unknown effect/result; unknown external-effect reconciliation; and no semantic retry from any delivery transition.

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

A later acceptance action may authorize only owner-native implementation of the selected semantic boundary. Runtime/module naming should remain semantic, for example Agent delivery authority/provider host and local Agent transport adapter; Design numbers remain provenance rather than runtime architecture.

This proposal does not authorize production source changes, provider resources, deployment, WORKBOARD runnable-frontier/selection edits, Case semantic changes, compatibility removal, or a lifecycle transition beyond controller-owned review.
