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
| stable Agent identity (`agentId`) | supported registration/security route | ingress, delivery owner, local Agent | stable across ordinary reconnect; not socket/process identity | authenticated Agent-to-route binding + route generation | bounded ID; one writable owner per elected route |
| current connection identity | Agent delivery authority on authenticated connect | transport, recovery | durable logical record; socket object is provider/in-memory state | `(agentId, connectionEpoch, connectionId)` | exactly one current connection |
| connection epoch | Agent delivery authority | every connection-scoped message | durable monotonic generation across owner reconstruction | lower epoch stale; same epoch requires exact connectionId | safe positive integer; overflow fails closed |
| executor identity/epoch | local Agent/executor runtime | delivery owner, Case authority | executor-generation lifetime; may survive network reconnect | exact `(executorId, executorEpoch)`; replacement changes tuple | bounded IDs; no tuple reuse while stale messages can exist |
| Attempt identity | CaseDO/CaseEngine | runner, delivery owner, Agent, result bridge | durable Case lifetime | exact Case/Task/Attempt | existing Case bounds |
| fencing token | CaseEngine | delivery owner, Agent, Case result path | Attempt lifetime | exact token + executor tuple + existing claim facts | bounded digest/ID |
| advertised capacity | authenticated current local executor; accepted by delivery owner | aggregate admission | latest accepted value for exact executor generation; unknown explicit | current connection + executor tuple | `0..maxAgentCapacity`; unknown admits zero |
| effective capacity | Agent delivery authority from advertisement + deployment ceiling | aggregate admission | owner state until changed | owner revision + executor/route generation | never above configured ceiling |
| slot reservation | Agent delivery authority | Case/runner admission | durable short-lived pre-delivery record | owner slot token/generation + request digest + executor tuple | reservations + activated deliveries cannot exceed admission capacity |
| delivery identity (`deliveryId`) | Agent delivery authority on activation | transport, Agent, result/recovery bridge | stable for exact Attempt across reconnects until semantic terminal + physical cleanup/reconciliation | exact Attempt fence + executor tuple | one active record per admitted Attempt fence |
| delivery payload digest | Agent delivery authority records immutable activation content | Agent/transport | delivery lifetime | same deliveryId with different digest conflicts | per-item + aggregate live-byte ceiling |
| transport receipt | Agent delivery authority records authenticated Agent observations | delivery/recovery diagnostics | fixed phase fields, not append-only message log | current connection + deliveryId + phase/digest | finite phases/evidence bytes |
| semantic/result receipt | CaseDO/CaseEngine | semantic clients/result bridge | durable Case lifetime | Case request/revision + existing Attempt fence | Case owner bounds |
| admitted/queued slot accounting | Agent delivery authority | admission/diagnostics | reservations + already-admitted deliveries only; no waiting Task list | slot/delivery generation | bounded; no durable waiter growth |
| running slot accounting | local Agent supplies start/cleanup evidence; delivery owner stores it | capacity/recovery | through physical cleanup | deliveryId + executor tuple; new observations also connection-fenced | one held slot per admitted delivery |
| disconnect fact | delivery authority from exact connection/provider evidence | recovery | connection disposition | exact connection tuple | one terminal disposition per superseded connection |
| reconnect fact | delivery authority connect transaction | transport/recovery | new connection generation | idempotent connect receipt + new tuple | one current epoch |
| Agent-owner reconstruction | provider runtime; durable state rehydrates semantic owner | adapter | instance fact only | Agent route + durable owner revision | allocates no slot/epoch by itself |
| Case-owner reconstruction | D0019 runtime | Case semantic clients | instance fact only | D0019 placement/revision | never implies delivery loss |
| cancellation state | CaseDO/CaseEngine | delivery owner/Agent consume as control intent | Case semantic lifetime | Attempt fence | existing reason/evidence bounds |
| uncertain external-effect state | CaseDO owns semantic `reconciling`/`unverified`; Agent/effect adapter owns effect evidence | recovery/result bridge | until authoritative reconciliation | Attempt fence + deliveryId + executor tuple | bounded reconciliation evidence |

Three generations remain distinct: **connection epoch**, **executor epoch**, and **Attempt fence**. Reconnect may change only connection epoch. Executor replacement changes the executor tuple. Semantic retry creates a new Attempt/fence.

## 6. Failure and cheapest-falsifier matrix

| Failure/race | Required behavior | Falsifier |
| --- | --- | --- |
| old connection late ack/result | reject before delivery/Case mutation | lower-epoch message changes state |
| duplicate activation | exact repeat dedups; conflicting body rejects | second slot/delivery/execution appears |
| duplicate receipt | exact repeat dedups; contradictory transition rejects or records uncertainty | replay advances semantic/effect state twice |
| reconnect, same executor | new connection epoch; same executor tuple may remain; reconcile live deliveries | reconnect forces semantic retry or executor epoch change |
| hibernating socket survives owner reconstruction | restore same logical connection without new epoch | constructor/reload stales healthy socket |
| disconnect before send | no new send; positively unsent can become not-applied evidence | unsent treated as effect-applied |
| disconnect immediately after send/before ack | delivery uncertain; no blind replay | reconnect automatically re-invokes unknown effect |
| disconnect after local start/effect | keep slot; reconcile exact delivery/effect | disconnect frees slot or schedules retry |
| effect status unknown | Case reconciling/unverified until effect owner resolves | transport error/ack becomes semantic certainty |
| Agent owner reconstructs | restore holds/deliveries; no Case reopen | reconstruction drops slots or synthesizes retry |
| Case owner reconstructs | preserve live Attempt absent explicit D0019 recovery cause | eviction alone interrupts Attempt |
| two Cases at capacity 1 | at most one reservation succeeds; loser remains pending without Attempt | two executable slots or loser burns retry budget |
| saturation | bounded denial; no durable waiter | Agent owner accumulates blocked Tasks |
| capacity shrink | retain holds; admit none until below new capacity | active work cancelled solely for shrink or new work still admits |
| capacity unknown/0 | admit none | any new slot opens |
| cancel before reservation | no Agent state | cancellation creates delivery state |
| cancel after reservation before Case commit | reservation released/expired; no delivery/effect | reservation activates after failed/cancelled start |
| cancel after Case commit before verified send | revalidate Case; suppress send when cancellation observed first | terminal Attempt newly dispatched |
| cancel races after possible start | cancellation is intent; keep slot through cleanup/reconcile | immediate slot release/guessed effect outcome |
| stale result after new connection | ingress rejects | old socket can forward result |
| stale result after new executor generation | delivery + Case fences reject | replacement executor satisfies predecessor Attempt |
| payload/resource exhaustion | preflightable bounds reject before Attempt creation | oversized payload creates running Attempt |
| reservation response loss | stable request reread/replay | retry double-counts capacity |
| activation response loss | reread durable record before send | retry creates second delivery/slot |
| result command response loss | reread Case durable receipt/state | second accepted result/Attempt appears |
| reservation expires after Case start but before activation | stale activation rejects; explicit delivery-not-activated recovery | expired reservation still sends or leaves silent permanent running |
| replay after transport ack | same delivery reconciles; no re-invocation absent `not_started` proof | `received` authorizes a second invocation |
| executor replacement with old delivery live | old slot remains held/uncertain until recovery | new executor frees/replays predecessor blindly |

The cheapest decisive source/model tests are therefore: capacity-1 two-Case race; old-epoch late message; reconnect-with-same-executor; disconnect-after-send unknown-effect case; owner reconstruction; capacity shrink/unknown; response-loss idempotency; payload preflight; and ack-versus-effect separation.

Passing them proves only the tested layer.

## 7. Selected semantic owner

For each elected stable Agent route, one `AgentDeliveryAuthority` owns:

- monotonic connection generations and the one current logical connection;
- the accepted executor tuple presented by that connection;
- accepted/effective aggregate capacity;
- short pre-dispatch slot reservations;
- activated delivery records and finite transport/reconciliation phase facts;
- conservative release after semantic terminal/recovery and physical cleanup/effect disposition.

It is an **admission/delivery owner**, not a Task scheduler. It cannot decide dependency readiness, Task retry, accepted result or Promotion.

`agentId` is a stable logical execution endpoint identity, not a credential, socket, process or Durable Object ID. Production ingress must authenticate one Agent principal to one exact elected route. A deployment/namespace transition must not create two writable owners for the same supported Agent route; incompatible moves require a route-generation fence/migration rather than name equality across namespaces.

## 8. Connection and executor fencing

### 8.1 Connect

An authenticated connect carries at least:

- `agentId` and elected route generation;
- idempotent `connectRequestId` + request digest;
- fresh `connectionId`;
- exact `(executorId, executorEpoch)`;
- bounded protocol/capability metadata.

The owner transaction either replays an identical connect receipt or commits a new current connection by increasing `connectionEpoch`. Reusing an idempotency key with different content conflicts. A new logical connection supersedes the old one even if the old socket remains physically open.

Every Agent-to-owner message carries `(agentId, connectionEpoch, connectionId)`. That tuple is validated before delivery state, so old-connection receipts/results cannot mutate state after supersession.

### 8.2 Hibernation is not reconnect

With a Cloudflare Hibernation WebSocket, the Durable Object may reconstruct while the socket stays connected. The provider adapter therefore re-associates the exact socket with its durable connection record and does **not** increment connection epoch merely because in-memory JavaScript state was recreated.

Serialized WebSocket attachment may hold only bounded connection locator/fence data. It is not delivery/capacity authority; state that must survive socket loss remains in durable owner storage.

If reconstruction cannot prove an attached socket is the durable current connection, new sends fail closed. Existing activated deliveries/slots stay held until explicit reconnect/recovery resolves them.

### 8.3 Executor generation is independent

A network reconnect to the same still-valid executor advances connection epoch but may retain the executor tuple. An executor replacement that could overlap stale predecessor messages must change at least one executor-tuple component. Preserving executorId requires a non-reused epoch; otherwise replacement uses a new unique executorId.

A connection change alone does not prove the predecessor executor or external effect stopped.

## 9. Aggregate capacity without a second queue

Aggregate capacity means the maximum **held executable slots across all Cases dispatched through one Agent route**. It is not each Case runner's local `capacity` option.

The current authenticated local executor advertises a non-negative capacity. The owner accepts that value only for the exact current connection/executor generation and computes effective capacity as the minimum of advertisement and configured deployment ceiling. Unknown/stale/over-limit capacity is fail-closed; unknown or zero admits no new work.

Shrink is non-preemptive. Existing holds remain; new admission stops until the held count falls below effective capacity. Growth does not revive stale delivery/retry state.

### 9.1 Pre-dispatch reservation

A ready Case asks for a slot **before creating the next Attempt** so aggregate saturation does not manufacture running-but-unexecutable Attempts.

A reservation request is idempotent and binds Agent route/executor tuple, caller request digest, Case/Task identity, expected Case revision, predicted next Attempt ordinal/identity where exposed, and bounded expiry. It carries no executable payload.

If saturated, the owner returns a bounded admission denial and stores no waiter. The Task stays pending at its Case/runner owner. Existing Claim leases are not parked indefinitely behind Agent capacity; their owner/lifecycle remains unchanged.

A reservation can safely expire because it cannot send/execute. Expiry commits a terminal reservation disposition and stale activation rejects. If the Case Attempt committed before expiration but activation never did, that durable no-activation fact becomes explicit recovery evidence for the stuck running Attempt.

No durable waiter list exists. A caller may retry only through bounded existing scheduling/control wake points or a lossy/coalescible non-authoritative capacity-change wake.

## 10. Handoff ordering with Case authority

The crossing is:

```text
ready Case Task
  -> existing Claim admission if applicable
  -> AgentDeliveryAuthority.tryReserveSlot(...)
     [capacity only; cannot execute]

CaseDO transaction
  -> commit exact running Attempt
     + executorId/executorEpoch from reserved Agent generation
     + existing fencingToken/effectKey
     + Case revision/command receipt

AgentDeliveryAuthority.activateDelivery(...)
  -> exact live reservation
  + exact committed Case/Task/Attempt/fence
  + immutable payload digest/size
  -> stable deliveryId and held slot

only after activation commit
  -> current connection send
```

If Case start fails/conflicts, release/expire reservation. If Case start response is ambiguous, reread Case authority before activation. If activation response is ambiguous, reread the reservation/delivery record before send.

Revision 1 does not use `dispatch_pending`/`queued` for Agent capacity waiting. D0019@r2 froze `running` before the D0020 crossing; using those latent states would amend an accepted predecessor and require D0019 re-review. The capacity reservation is outside Case semantics and is intentionally non-executable.

## 11. Delivery identity and receipts

`deliveryId` is stable for one exact committed Attempt across reconnects and binds at least:

`agentId + caseId + taskId + attemptId + executorId + executorEpoch + fencingToken`

Connection epoch is excluded so reconnect cannot create a second logical delivery. Activation separately stores immutable payload/body digest, effect key where applicable, source Case revision, slot token/generation, protocol version and byte count. Same deliveryId with different immutable content conflicts.

Every physical send adds the **current connection tuple** to that stable delivery envelope. The local Agent validates bounded shape and exact executor tuple before execution.

The owner may store a finite phase set such as `activated`, `sent`, `received`, `started`, `completed`, `cleanup_complete`, `uncertain`. These are delivery/transport facts only:

- `received` != effect applied;
- `started` != effect completed;
- `completed` != Case semantic result accepted;
- WebSocket send/ack != external effect receipt.

Case command/result receipts remain Case authority. Physical effect truth remains Agent/effect-adapter evidence consumed by Case reconciliation. Transport receipts are finite fields, not an unbounded message log.

## 12. Result handoff

A result message must match the current authenticated connection, active deliveryId, delivery executor tuple, exact Case/Task/Attempt identity/fencing token and bounded result/effect envelope before it may cross into Case authority.

The bridge then calls the existing Case result/reconciliation command with a stable idempotency identity derived from the exact delivery/result digest. CaseDO is the final semantic arbiter. Response loss is reconciled by reading Case durable receipt/state, never by creating another Attempt or lower-layer retry.

A new connection leaves deliveryId/Attempt fence unchanged. A new executor generation cannot satisfy a predecessor delivery.

## 13. Disconnect, reconnect and reconstruction

A confirmed disconnect marks only the connection unavailable. It does not free delivery slots, change executor epoch, fail an Attempt or prove an external effect absent. New reservations require a valid current connection and known positive capacity unless a later accepted implementation proves an equivalent conservative reachability mechanism.

On reconnect the owner advances connection epoch, fences the old connection and reconciles each live delivery against the exact executor/local evidence. Minimum dispositions are:

- `not_started`: same delivery may be sent/re-sent because predecessor execution is proved absent;
- `live`: resume observation/control of the same execution;
- `completed`: forward/reconcile existing exact result/effect evidence;
- `unknown`: do not replay; use Case reconciliation/recovery according to effect class.

Agent owner restart/eviction reconstructs durable state and may reattach a hibernating socket. It neither advances connection epoch for the same healthy logical connection nor frees slots nor triggers Case recovery.

CaseDO reconstruction likewise does not imply delivery/executor loss.

## 14. Cancellation

Cancellation stays Case semantic authority.

1. Before reservation: no D0020 state.
2. Reservation exists, Case start did not commit: release/expire reservation; zero delivery/effect.
3. Running Attempt committed, delivery not activated: activation validates exact nonterminal Case state; cancellation observed first suppresses send.
4. Delivery activated but positively unsent: prevent first send and provide bounded not-applied evidence where valid.
5. Send/start may have happened: cancellation is intent; send exact control to current delivery/executor, keep slot through cleanup, and reconcile effect class conservatively.
6. Late result after cancellation remains subject to delivery ingress and Case result fencing.

A distributed cancel/send race is ordered by the authoritative Case validation immediately before first send plus durable delivery activation. Cancellation racing after dispatch authorization is treated as possible execution, not guessed absence.

## 15. External-effect uncertainty and replay

Delivery recovery is not semantic retry.

Reconnect may resend the **same delivery** only when predecessor local execution is proved `not_started`, or where an independently accepted effect contract makes replay of the same effect key safe. Unknown external effects never trigger blind replay.

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
- maximum live reservations and activated deliveries;
- reservation lifetime and bounded terminal tombstones;
- delivery/payload bytes and aggregate live bytes;
- connection metadata/WebSocket attachment bytes;
- transport receipt/evidence bytes and fixed phase count;
- identifiers, request IDs, protocol metadata and errors;
- recovery/reconciliation evidence;
- provider RPC/WebSocket frame limits below provider/application ceilings.

There is no durable waiter list proportional to blocked Tasks.

All preflightable capacity/size checks occur before Case Attempt creation. A bound discovered only after Case start fails closed into explicit recovery/reconciliation instead of disappearing or inventing retry.

A delivery slot may be released only when:

1. Case authority proves the exact Attempt terminal or durably superseded by recovery, and
2. Agent/effect evidence proves the physical execution handle is cleaned up or unresolved effect state has been transferred into durable Case reconciliation evidence.

After delivery GC, transport replay alone cannot recreate execution; the bridge must reread Case authority and fail closed if the crossing is no longer live.

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

The durable owner needs atomic persistent mutation for connection generation/current identity/connect receipt, executor tuple/capacity, reservations, activated deliveries, immutable content digest/slot ownership, fixed transport/reconciliation facts and recovery cause IDs.

In-memory maps, socket objects and process handles are projections only.

A Cloudflare Durable Object is a viable Group F host only if provider qualification proves:

- one elected Agent route reaches one writable object;
- durable storage preserves the selected owner state;
- Hibernation WebSocket reconstruction preserves the same logical connection without synthetic epoch change;
- attachment contains only bounded locator/fence data and durable state survives socket loss;
- superseded sockets remain stale-fenced even when physically open;
- eviction/deployment reconstruction cannot lose live slots/deliveries;
- provider schema/config/version overlap, namespace/jurisdiction and limits are deployment-owned and fail closed.

The local Agent must support exact Agent/connection/executor identities, one fresh runtime operation per Attempt, delivery/effect-key duplicate suppression for the lifetime it can prove, bounded process/resource cleanup, explicit `not_started|live|completed|unknown` recovery evidence, executor-generation replacement fencing and no semantic retry queue.

A durable local execution journal is not required for correctness merely to survive unknown disposition: restart may conservatively report `unknown` and force Case reconciliation. If later availability/SLO requirements need automatic decisive recovery after Agent restart, they must explicitly select and bound such a journal.

## 20. Compatibility, migration, deployment and rollback

The existing direct/local `runCase({capacity})` path remains compatible and still means per-invocation capacity. The Agent-backed path must not claim aggregate capacity unless it uses the selected owner and must not silently fall back to per-Case capacity when the owner/provider is unavailable.

Existing Case snapshot/fence/result schema remains semantic authority. Revision 1 does not require connection epoch or deliveryId to become Case truth.

For initial deployment there is no existing Agent delivery-owner state to migrate. Before production admission, deployment establishes an exact Agent route generation, durable namespace/storage/schema compatibility, capacity/byte ceilings and authenticated Agent path, then independently qualifies source/provider failure behavior before enabling Agent-backed Case admission.

After any delivery state exists, rollback may not switch to code that ignores connection epochs, slot ownership or delivery uncertainty. Rollback must remain schema/protocol compatible or first drain/fence the route so no reservations/deliveries remain and related Case Attempts are terminal/reconciled. Deleting/recreating provider storage is not semantic rollback.

## 21. Explicitly rejected alternatives

- **Durable Agent Task queue:** rejected because it duplicates Case readiness/retry/order authority.
- **Start Attempt then wait indefinitely for capacity:** rejected because saturation would create an unbounded pseudo-queue of running-but-unexecutable Attempts and consume semantic attempt state.
- **Use `dispatch_pending`/`queued` now:** rejected because D0019@r2 froze running-before-D0020; changing that is predecessor re-design, not D0020 implementation detail.
- **connectionEpoch == executorEpoch:** rejected because network reconnect and executor replacement are different failure domains.
- **connectionEpoch inside deliveryId:** rejected because reconnect would manufacture a second logical delivery.
- **free slot on disconnect/timeout:** rejected because neither proves local execution/effect stopped.
- **transport ack == effect receipt:** rejected because transport does not own effect truth.
- **blind replay after reconnect:** rejected unless predecessor `not_started` or independent effect-idempotency proof exists.
- **mandatory durable local journal now:** not selected; conservative unknown -> Case reconciliation is safe, and stronger restart availability is a separate explicit requirement.

## 22. Acceptance criteria

Acceptance requires independent review to confirm all of the following without reopening D0018/D0019 semantics:

1. one owner holds Agent connection/delivery/capacity facts while Case remains sole semantic Task/Attempt/retry/result owner;
2. capacity N bounds executable slots across multiple Cases, with N=1 the same algorithm;
3. saturation creates no durable waiting Task entry and no Attempt/retry consumption;
4. no executable payload crosses before exact Case `running` Attempt/fence commit;
5. pre-dispatch reservation cannot execute and stale/expired activation fails closed;
6. old connection messages cannot mutate delivery or Case state after supersession;
7. reconnect can preserve executor tuple, while executor replacement cannot masquerade as reconnect;
8. connect/reserve/activate/receipt/result response loss is idempotent or conflicting, never double-slot/double-execution;
9. cancellation before observed first send suppresses send, while possible-start cancellation retains slot and reconciles;
10. transport loss never guesses effect truth or starts semantic retry;
11. Agent-owner/Case-owner reconstruction alone neither frees capacity nor causes semantic reopen;
12. a healthy hibernating WebSocket can survive owner reconstruction without synthetic connection epoch;
13. shrink preserves existing holds and unknown/zero capacity admits none;
14. slot release requires semantic terminal/recovery plus physical cleanup/effect-disposition proof;
15. all live-record/payload/receipt/evidence/identifier/wait dimensions have selected finite ceilings;
16. authenticated Agent routing prevents cross-Agent/cross-Case authority injection;
17. existing local runner behavior remains compatible but is not mislabeled Agent-global capacity;
18. deployment/rollback cannot create dual writable Agent delivery owners or unfenced fallback.

Independent acceptance must specifically challenge whether the non-executable pre-dispatch reservation is the smallest valid cross-owner admission primitive. If it duplicates semantic scheduling or cannot be recovered without a second authority, reject/split this revision rather than hiding the defect in implementation.

## 23. Verification layers after acceptance

### Source/model

Add deterministic tests for multi-Case capacities 1/N; reserve/activate response loss; old connection late ack/result; reconnect with same executor versus executor replacement; duplicate delivery/receipt/result; cancellation at each crossing; disconnect before/after send/start/effect; Agent/Case owner reconstruction; saturation/shrink/unknown/growth; payload/live-byte exhaustion; expired unactivated reservation; unknown external effect reconciliation; and slot retention through physical cleanup.

The repository source gate remains required; focused tests do not replace it.

### Provider/runtime

Independently verify real Cloudflare Durable Object/storage/WebSocket behavior: Hibernation reconstruction on the same logical connection, explicit reconnect/new epoch with old-socket rejection, eviction/reconstruction with live holds, concurrent multi-Case capacity races, disconnect/response-loss injection, exact deployed namespace/route identity, and provider limits/schema/config compatibility.

### Local Agent/machine

Verify fresh per-Attempt execution, cancellation/descendant cleanup, executor replacement, local result/effect evidence, and capacity release only after actual resource cleanup.

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
