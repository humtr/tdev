# Design 0044 — Agent Route Higher-Generation Election and Cutover

- Status: `implementing`
- Revision: 1
- Class: 2
- Decision date: 2026-09-02
- Acceptance base: `development@26b598465333f8aa5100772281286a316831d0f3`
- Trigger: D0039@r12 executable revalidation proved that terminal Q7 management-compromise recovery, Q8 release-root-compromise recovery and Q9 canonical-route/provider-loss recovery all require an actual strictly higher D0020 `routeGeneration`, while current verified D0020 intentionally supports initial immutable route binding only and fails closed on live route migration/cutover
- Trigger evidence: `docs/evidence/group-f-d0039-r12-higher-route-cutover-design-trigger-2026-09-02.json`
- Acceptance evidence: `docs/evidence/group-f-d0044-r1-agent-route-higher-generation-cutover-acceptance-2026-09-02.json`
- Scope: one durable per-Agent higher-generation route election/cutover authority, independently authorized recovery root, generation-aware physical route hosting, predecessor retirement/exclusion and successor activation needed to move one stable `agentId` from one immutable D0020 route generation to its next non-reused generation without dual current writers
- Affected owners during later implementation: D0020 route-binding/runtime routing and durable delivery-owner state, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, Worker Durable Object exports/bindings, qualification helpers and focused tests
- Preserved owners: D0019 remains Case semantic authority; each D0020 per-generation `AgentDeliveryAuthority` remains sole connection/delivery/capacity owner for that generation; D0027 remains installation/credential/package/trust/lifecycle authority inside one elected route; D0039 remains deployment/Q-gate orchestration; D0040 remains evidence authentication only; D0041 remains pre-genesis material preparation only
- Explicit non-goals: no in-route management-key or release-root replacement, no generic key broker, no dual-write migration, no adoption of predecessor live handles, no PITR/same-name/storage recreation as authority, no automatic rollback to an old route, no whole-provider-account disaster recovery, no route-recovery-root rotation, no canonical D0039 R12 cutover merely by accepting this Design

## 1. One-line definition

Add the missing D0020 owner that can, under one independent recovery authorization and positive predecessor exclusion/quiescence, retire one immutable route generation and elect exactly one prepared successor generation for the same stable `agentId`, while making every stale predecessor route permanently non-current and non-creating.

## 2. Why this is a new Design

D0039 did not discover a qualification-driver gap. It reached a contract that current product semantics intentionally do not implement.

The accepted D0039 security contract says:

- total management-key loss fails closed;
- management-key compromise retires/quiesces the route and recovers only through a separately authorized D0020 cutover to a strictly higher `routeGeneration` with a fresh key;
- release-root compromise has the same higher-route requirement;
- canonical route-object loss/corruption, PITR, database rewind, deletion/recreation and same-name inference never restore authority; recovery requires a newly proven exact route object at a strictly higher generation after predecessor quiescence.

Verified D0020 intentionally stops before that boundary. Its maintained Design says one `agentId` has one immutable initial `AgentRouteBinding`, a second different writable binding is a conflict, live route migration/cutover is unsupported, and any later live move must define a separate Class-2 election/cutover contract with a new non-reused route generation.

The concrete runtime confirms the gap rather than filling it implicitly. Agent authentication and connection/delivery records already bind `routeGeneration`, but provider routing still maps `idFromName(agentId)` to one Durable Object whose persisted route binding rejects every different generation. There is no owner that can elect a successor or prevent two distinct physical owners from both claiming to be current.

Creating that owner, the authorization axis that survives management/release compromise, the physical-generation selection rule and the retirement/activation transaction changes security, identity, persistence, deployment and recovery semantics. `SDD.md` therefore requires a new Class-2 Design. D0039@r13 would be the wrong owner and would recreate the revision-churn boundary that R12 explicitly stopped.

D0044 does not supersede D0020 or D0039. It fills the Class-2 seam D0020 reserved and returns the verified primitive to D0039 for isolated Q7/Q8/Q9 scenarios and any later authorized production use.

## 3. Preserved seams

### 3.1 Stable logical Agent identity remains stable

`agentId` remains the stable logical execution-endpoint identity. A cutover changes only the route generation and its exact physical/provider binding. It does not mint a replacement `agentId` and does not reinterpret a hostname, Worker name or Durable Object name as semantic identity.

### 3.2 Every route generation remains independently immutable

A per-generation `AgentDeliveryAuthority` still owns one immutable `AgentRouteBinding`. D0044 never edits that binding in place to pretend an old object became a new route. A successor is a distinct physical route owner with a distinct positive non-reused `routeGeneration` and exact binding digest.

Connection epochs, executor epochs, reservations, deliveries, installable-Agent generations, management request floors and live handles remain scoped to their original route generation. They are never copied into the successor as current authority.

### 3.3 Existing route-generation authentication is reused

The existing Agent principal token, challenge, connect, socket attachment, reservation, delivery and installable-Agent security contexts already bind `agentId + routeGeneration`. D0044 reuses those fields. It does not create a second data-plane credential or weaken current route-generation checks.

### 3.4 D0027 starts fresh on the successor

A newly elected D0020 route generation does not migrate D0027 `CURRENT` state. D0039 or another authorized deployment owner must perform a fresh D0027 realization on the successor under the existing owners, with fresh management/release/credential/install/package/trust/lifecycle identities as applicable.

## 4. New authority: `AgentRouteElectionAuthority`

### 4.1 Single writer

Introduce exactly one durable election authority per stable `agentId`. It owns only:

- the current elected `routeGeneration` and exact route-binding/physical-host identities;
- the monotonically non-reused route-generation high-water;
- one independently verified route-recovery public key identity;
- one cutover-request sequence high-water;
- at most one nonterminal cutover transaction;
- bounded exact-replay receipts plus permanent generation/request floors and terminal retirement/election tombstone summaries.

It does **not** own Agent connections, deliveries, capacity, D0027 installation state, package/release state, Case state or qualification truth.

The authority is a distinct durable owner from every per-generation route owner. Provider placement must make its identity explicit and independently readable; the same `agentId` names the election owner inside its dedicated namespace/class but never aliases a delivery-owner object.

### 4.2 Strict state profile

The maintained state profile is:

```text
tdev.agent-route-election.v1
```

Its authoritative logical fields are:

```text
profile
agentId
routeGenerationHighWater
cutoverRequestSequenceHighWater
recoveryKeyId
recoveryPublicKey
currentRoute
activeCutover
recentReceipts
```

`currentRoute` is either absent only before the first election, or contains the exact:

```text
routeGeneration
routeBindingDigest
routeHostProfile
routeHostKey
activationReceiptDigest
```

`activeCutover` is either null or the one exact transaction defined in Section 8. Unknown fields/versions fail closed. Storage compaction may remove bounded receipt detail only behind permanent generation/request floors; it may never lower a high-water or forget the current election.

## 5. Independent route-recovery authorization

### 5.1 Recovery root

Introduce an Ed25519 route-recovery public-key identity with domain:

```text
tdev.agent-route-recovery-public-key.v1
```

and key ID equal to the typed digest of the strict canonical public key under that domain.

The private recovery key is operator-held/offline authority. It is absent from the local Agent, repository, package, Worker secrets, per-route management state, D0040 evidence signer and normal data-plane credentials. A provider API token, qualification token, Agent HMAC, current management key, release root or D0040 attestor cannot substitute for it.

The same recovery-key identity may be backed up as the same identity. Loss leaves the current route usable but makes future higher-route cutover unavailable and fail-closed. Compromise of the route-recovery root is outside D0044 recovery scope: it cannot be rotated in place or use itself to bless a replacement. A different logical recovery authority requires retirement/new `agentId` or another accepted Design.

### 5.2 Per-generation attachment

Every route that is eligible to participate in D0044 has an immutable election attachment:

```text
tdev.agent-route-election-attachment.v1
```

binding at least:

```text
agentId
routeGeneration
routeBindingDigest
routeHostProfile
routeHostKey
electionAuthorityIdentity
recoveryKeyId
recoveryPublicKey
```

A newly created elected route receives this attachment before it can become executable.

A legacy generation-1 route may be imported only through an explicit one-time import transaction while its existing authority is healthy. Import binds the exact pre-existing immutable route binding/host and requires both the existing route management authority and possession of the new recovery root. Missing election state never silently means "legacy generation 1" once elected routing is enabled. A route whose management authority is already lost before import remains fail-closed rather than being retrofitted by provider control alone.

## 6. Generation-aware physical route hosting

### 6.1 Canonical successor host key

Define the strict host-key record:

```text
tdev.agent-route-host.v1
{ agentId, routeGeneration }
```

For an elected route created under D0044, the provider host key is:

```text
rh1.<64 lowercase hex>
```

where the suffix is the SHA-256 typed-digest suffix of the exact normalized host-key record. This is a deterministic provider locator, not semantic authority.

An explicitly imported legacy generation-1 route retains its exact historical physical host key (`agentId`) under host profile `legacy_agent_id_v1`. That exception is stored in the election record; it is never inferred from missing state. All D0044-created successor generations use host profile `generation_key_v1` and the `rh1.*` locator.

### 6.2 Ingress election

In elected mode, public Agent/qualification ingress resolves `agentId` through `AgentRouteElectionAuthority` first. The request's authenticated `routeGeneration` must equal the exact current elected generation before the Worker resolves the current route host key. A lower generation is stale; any other non-current generation is not elected. Neither condition may cause creation or access of a different route owner.

Legacy routing may remain available only as an explicit deployment mode before an exact legacy import. Switching a deployed lane into elected mode requires a positive election record for the exact current route. There is no `election record absent -> idFromName(agentId)` fallback in elected mode.

### 6.3 Fresh elected-route genesis

A new logical Agent that starts under D0044 initializes election authority through the strict profile:

```text
tdev.agent-route-election-genesis.v1
```

The recovery root signs the exact `agentId`, recovery key ID, generation-1 route binding digest, generation-bound host profile/key and a fresh genesis nonce/digest. The generation-1 route owner must already exist as non-executable `STANDBY` with the matching election attachment. `AgentRouteElectionAuthority` accepts genesis only from truly absent state with zero generation/request high-waters, verifies the recovery signature and exact standby readback, then atomically sets `routeGenerationHighWater = 1`, elects that exact route as `currentRoute` and emits its first activation receipt.

Genesis is create-once. Replay of the exact retained genesis returns the same election; changed intent conflicts; any existing election/high-water makes a new genesis non-creating. Provider object recreation or missing storage can never rerun genesis after a prior election.

### 6.4 Explicit legacy generation-1 import

A pre-D0044 generation-1 route uses the strict profile:

```text
tdev.agent-route-election-import.v1
```

Import binds the exact `agentId`, route generation 1, existing immutable route-binding digest, legacy host key/profile, current route-state digest, recovery key ID/public key and election-authority identity. The existing route management authority signs the import domain and the recovery root independently signs the same canonical import record. Neither signature can substitute for the other.

Import is a reconciled three-owner workflow rather than an atomic cross-object guess:

1. the legacy route owner verifies both proofs and records a pending immutable election attachment without changing its executable/current meaning;
2. the election owner verifies the same proofs plus exact positive legacy-route readback and creates the generation-1 election record once;
3. the legacy route owner reconciles the exact created election digest and seals the attachment;
4. provider routing may switch from explicit legacy mode to elected mode only after independent readback proves both election creation and attachment sealing.

A crash before step 4 leaves legacy routing in its prior mode and never enables elected ingress. Once elected mode is enabled, there is no rollback to absence/legacy inference. If the management key is already lost/compromised before import, import is unavailable and the route remains fail-closed for D0044 recovery rather than letting provider/recovery authority retrofit itself.

## 7. Cutover identity and replay

The signed cutover intent profile is:

```text
tdev.agent-route-cutover.v1
```

with exact fields:

```text
profile
agentId
cutoverRequestId
expectedElectionDigest
predecessorRouteGeneration
predecessorRouteBindingDigest
predecessorRouteHostProfile
predecessorRouteHostKey
successorRouteGeneration
successorRouteBindingDigest
successorRouteHostProfile
successorRouteHostKey
reason
recoveryKeyId
```

`cutoverRequestId` is `rc1:<positive canonical base-10 sequence>` and the election owner accepts a fresh request only at `cutoverRequestSequenceHighWater + 1`. Exact retained replay returns the same semantic result; same ID with changed intent conflicts; sequences at/below the permanent floor are stale and non-creating; gaps fail closed.

`successorRouteGeneration` is exactly `routeGenerationHighWater + 1`. This chooses one deterministic next generation rather than allowing gaps to become ambiguous recovery state.

Accepted `reason` values are limited to:

```text
planned_retirement
management_key_loss
management_key_compromise
release_root_compromise
route_object_loss_or_corruption
```

The recovery-root signature binds the exact normalized intent. A reason is diagnostic/policy context and never substitutes for the exclusion/quiescence proofs below.

## 8. Crash-safe cutover transaction

One cutover has stable identity from first admission through terminal cleanup. It never mints a new intent after response loss.

### 8.1 `PREPARED`

The election owner verifies:

- exact current election digest and predecessor generation/binding/host;
- canonical fresh `rc1` sequence;
- valid recovery-root signature and exact key ID;
- successor generation exactly equals the route high-water plus one;
- successor host/binding identity is distinct and generation-correct;
- there is no other live cutover.

It durably records the intent as `PREPARED`. This step alone does not change ingress current generation and does not make the successor executable.

### 8.2 `DRAINING`

When the predecessor owner is available, it verifies the same signed cutover intent against its immutable election attachment, records the exact cutover identity, enters a one-way `DRAINING` route disposition and rejects all new executable/connect/reservation/delivery/D0027 state-changing admission except exact cutover reconciliation, readback and cleanup/evidence operations needed to reach quiescence.

Already admitted work is not declared gone. The normal D0020 positive physical-cleanup/quiescence rules remain authoritative; timeout, socket disappearance, process loss or provider read failure is insufficient.

### 8.3 Lost/corrupt predecessor alternative

If the predecessor route object cannot authoritatively persist `DRAINING`/`RETIRED`, cutover remains blocked unless independent evidence proves **both**:

1. positive physical quiescence for every predecessor delivery/capacity hold that could still create or release effects; and
2. positive provider exclusion showing the exact predecessor host is no longer reachable by any state-changing deployed ingress/writer admitted for this lane.

No PITR, same-name object, recreated storage, timeout or missing readback counts as either proof. Provider exclusion must be tied to an exact provider deployment/election epoch and must close stale/preview/alternate writer paths, not merely hide the object from one request.

D0044 recovers loss/corruption of a route owner only while the independent election authority and provider account/control plane needed to prove exclusion remain trustworthy and readable. Total loss/corruption of the election authority or whole-provider-account authority remains fail-closed and outside this Design.

### 8.4 `RETIRED`

For an available predecessor, positive quiescence permits the predecessor owner to write a terminal `RETIRED` receipt/tombstone for the exact cutover. It permanently rejects reactivation and any later request that would create authority for that route generation.

For an unavailable predecessor, the election owner retains the exact provider-exclusion/quiescence evidence digests as the terminal predecessor-exclusion record. The old generation is still permanently below the election high-water and cannot be inferred current by recreation.

### 8.5 Successor `STANDBY`

The successor per-generation owner may be initialized with its exact route binding and election attachment before election, but remains `STANDBY`. It may expose bounded identity/readiness readback but cannot accept executable Agent connection, reservation, delivery or D0027 mutation as current authority.

No predecessor live handle, request floor, connection epoch, delivery identity or D0027 state is adopted.

### 8.6 Election commit and activation receipt

Only after exact predecessor retirement or the lost-predecessor exclusion path and exact successor standby readback does `AgentRouteElectionAuthority` atomically:

- advance `routeGenerationHighWater` to the exact successor generation;
- replace `currentRoute` with the exact successor binding/host;
- burn the cutover request sequence;
- emit one immutable activation receipt digest bound to the cutover and successor;
- retain the predecessor retirement/exclusion tombstone summary.

The successor validates that exact activation receipt before leaving `STANDBY`. A crash after election but before successor activation creates an availability gap, not permission to revive the predecessor; exact activation reconciliation resumes against the same receipt.

At no point are predecessor and successor both elected current.

## 9. Split-brain and stale-generation fences

After election commit:

- ingress rejects every predecessor route generation before selecting a delivery host;
- the predecessor owner remains locally `RETIRED` where available;
- recreated or PITR-rewound predecessor state cannot lower the election high-water or current generation;
- a stale Worker/provider version that lacks the admitted election epoch cannot be a state-changing writer under provider admission;
- old Agent HMAC tokens remain generation-bound and cannot authenticate the successor;
- old management/release/credential material has no authority in the successor unless independently reintroduced by the successor's normal owners, which D0044 does not do;
- exact late cleanup evidence may settle historical capacity only through existing D0020 positive-evidence rules and can never reactivate the predecessor.

## 10. Provider/runtime migration and legacy generation 1

D0044 source implementation must support a staged rollout that does not reinterpret the currently deployed generation-1 route.

1. Source may add the election owner, generation-aware route-host function and strict state/intent types without live effects.
2. A deployed lane remains in explicit legacy-routing mode until an authorized election import succeeds for its exact existing route.
3. Legacy import is a durable effect with its own exact replay/reconciliation contract and must be independently qualified. It cannot be performed merely because code was deployed.
4. Only after positive import/provider readback may that lane enter elected-routing mode.
5. A fresh qualification lane may instead begin directly in elected mode with a generation-1 `generation_key_v1` host and no legacy import.

The canonical D0039 R12 route is not imported, migrated or cut over merely to prove D0044 source. D0039 Q7/Q8/Q9 should first consume D0044 through isolated sibling scenarios.

## 11. Relationship to D0039 Q7, Q8 and Q9

D0044 supplies only the missing higher-route primitive. It does not mark D0039 gates PASS.

### Q7 management loss/compromise

An isolated admitted D0039 route may prove normal `m2` replay/floor behavior, then exercise management-key loss/compromise. Same-route replacement remains impossible. Terminal recovery requires a D0044 cutover to the next route generation followed by fresh D0027 realization whose management key is different and independently observed.

### Q8 release lifecycle

Normal delegated-signer lifecycle remains in-route D0027/D0039 behavior. Release-root loss continues to fail closed for signer-set change. Release-root compromise may recover only by D0044 higher-route cutover followed by a fresh successor release root and fresh D0027 realization.

### Q9 rollback/provider loss/retention

Nested-v2 rollback floors/tombstones remain D0039/D0027/D0020 evidence. PITR, same-name recreation and route-object loss cannot self-elect. Recovery from the supported route-object-loss/corruption case requires D0044 provider exclusion + positive predecessor quiescence + strictly next generation. Total election-authority/provider-account loss is not promoted into a recoverable case.

Each scenario still requires the independent principals and exact read/write/invalidation sets owned by `docs/QUALIFICATION.md`. A sibling destroyed or diverged by Q7-Q9 never composes into D0039 Q10 canonical state.

## 12. Failure and ambiguity rules

- No response, controller death, lease expiry, timeout or failed CAS proves a cutover absent or complete.
- Once dispatch may have occurred, authoritative election/predecessor/successor rereads precede any retry.
- A nonterminal cutover blocks a second cutover and successor-generation reuse.
- Recovery-root signature failure, wrong key, wrong current election, wrong predecessor binding, successor substitution, gap sequence or generation substitution has zero route-election effect.
- Inability to prove predecessor quiescence/exclusion keeps the route unavailable rather than electing a possibly concurrent successor.
- Inability to activate a committed successor never rolls the election back to the predecessor.
- Election-store corruption or loss fails closed. Provider reconstruction/PITR cannot invent current-route authority.
- Storage pressure rejects new cutover work before dropping permanent floors/current election.

## 13. Implementation ordering

1. Add pure strict normalization/digest/signature helpers for recovery keys, route-host keys, election attachments, election state and cutover intents.
2. Add an in-memory/reference `AgentRouteElectionAuthority` with exact replay/high-water/one-live-cutover behavior and focused substitution/crash/restart/compaction tests.
3. Add per-generation route disposition/attachment behavior (`STANDBY`, `ACTIVE`, `DRAINING`, `RETIRED`) without changing D0027 semantic ownership.
4. Add generation-aware Worker routing plus the separate election Durable Object and explicit legacy/elected deployment modes. Prove no missing-election fallback and preserve exact legacy generation-1 behavior before import.
5. Add explicit legacy import and recovery-root-authorized predecessor-retirement/successor-activation reconciliation. Prove old generation cannot regain current status after commit or PITR/same-name recreation.
6. Run the complete registered source gate on one exact D0044 source and record source evidence before any live D0044 provider cutover.
7. Separately deploy/qualify an isolated supported provider lane: fresh elected generation 1, positive work/quiescence, prepared successor generation 2, retirement/exclusion, election, activation, stale-generation rejection and response-loss reconciliation. No canonical D0039 route mutation is needed for this gate.
8. Return control to D0039@r12 for isolated Q7/Q8/Q9 terminal scenarios; keep Q3's physical-device blocker independent.

## 14. Acceptance matrix

| Area | Required acceptance |
| --- | --- |
| owner | exactly one durable `AgentRouteElectionAuthority` per stable `agentId`; per-generation D0020 owners remain independent and immutable |
| route generation | current generation plus permanent high-water is non-reused; fresh successor is exactly high-water + 1 |
| recovery authorization | one immutable offline Ed25519 recovery root independent of management/release/HMAC/provider/D0040 authority |
| physical host | D0044-created routes use deterministic generation-bound `rh1.*`; legacy generation 1 is preserved only by explicit import |
| ingress | elected mode resolves election first and rejects non-current generation before route-host selection |
| predecessor | one-way draining/retired path; no new executable work after fence; positive quiescence is mandatory |
| lost predecessor | recovery needs both positive physical quiescence and exact provider exclusion; no timeout/PITR/same-name inference |
| successor | prepared `STANDBY`, distinct exact binding, no predecessor handles/state, executable only after exact activation receipt |
| atomic election | one current route only; commit advances generation/request floors and cannot roll back to predecessor |
| ambiguity | exact durable request identity and authoritative reconciliation precede retry; second live cutover blocked |
| legacy migration | explicit dual-authorized import only; no missing-state fallback in elected mode |
| Q7/Q8/Q9 | D0044 supplies the higher-route primitive only; D0039 still owns terminal gate proof and fresh successor realization |
| acceptance effects | no provider/route/device/key/D0027/canonical D0039 mutation occurs by accepting D0044 |

## 15. Rejected alternatives

### Change the management or release root inside the same route

Rejected. Their immutability is the security property Q7/Q8 are meant to falsify; allowing in-route replacement would erase the compromise boundary.

### Use the management key, release root, Agent HMAC, provider API token or D0040 attestor as cutover authority

Rejected. Management/release compromise are recovery triggers; Agent HMAC/provider credentials are different trust domains; D0040 authenticates evidence and is not effect authority. Reusing any of them creates circular recovery or collapses independent principals.

### Route only by `idFromName(agentId + routeGeneration)` without an election owner

Rejected. Generation-aware storage alone permits multiple distinct owners to exist without one durable fact choosing which generation is current. It does not solve split brain, replay or old-route retirement.

### Rewrite the existing Durable Object binding in place

Rejected. D0020 makes each generation's route binding immutable. Storage mutation or same-name recreation cannot become a new route generation.

### Treat missing election state as legacy generation 1

Rejected. After a partial migration or election-store loss, absence would silently recreate old authority. Legacy compatibility must be explicit deployment mode plus exact import.

### Use PITR, database rewind or same-name recreation for provider loss

Rejected. These can restore stale security floors and are expressly non-authoritative in D0039/D0020.

### Dual-write predecessor and successor during cutover

Rejected. It introduces a second delivery/capacity current owner and makes physical-effect/capacity reconciliation ambiguous. D0044 chooses fail-closed gap over split brain.

### Add D0039@r13

Rejected. Higher-route election/cutover is independently reusable D0020 recovery semantics shared by D0039 Q7/Q8/Q9. R12 explicitly requires a separate Design for this capability.

## 16. Proof boundary

Acceptance authorizes only later source implementation/qualification after WORKBOARD routing. It does not generate a recovery private key, import the canonical R12 route, create a successor route, mutate Cloudflare/provider state, replay D0039 phase-U/P, change the current AndroidKeyStore credential, close Q3/Q6/Q7/Q8/Q9/Q10, or claim recovery from loss of the election authority/provider account itself.
