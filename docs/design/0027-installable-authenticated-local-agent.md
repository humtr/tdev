# Design 0027 — Installable Authenticated Local Agent

- Status: `accepted`
- Revision: 1
- Acceptance evidence: `docs/evidence/group-f-d0027-r1-design-acceptance-2026-08-22.json`
- Accepted exact review candidate: `6ceebe9a7f16aca1f68fc02154e66decea29c9e4`
- Accepted review-candidate Design SHA-256: `8a4b7a7879bad176e9054a84f562e0dd0c458f835a36ff4e680992a6a0c38679`
- Independent exact-artifact acceptance review: ACR campaign `tdev-20260822-d0027-r1-j3j4-reacceptance-01` — J3/J4 and legacy D0020 predecessor-quiescence adjudication closed, review quality `STRONG`, decision readiness `READY`, implementation activation `NONE`
- Class: 2
- Decision date: 2026-08-22
- Active cumulative lineage: resolved from `WORKBOARD.md`; drafted from `development@09d7dfa889e7c974013eb231f20bd28f0263ee7b`
- Trigger: post-D0020 forward-design review plus direct user application decision to turn the surviving boundary into a target-native Design
- Draft correction basis: exact predecessor draft `development@23eca29eb9dac1fd06fe1e9d32dfb7d52aa01731` / blob `9c8f718fb62f82abb5c0ea3c4970764a4afd7ded`, corrected from the converged ACR campaign `tdev-20260822-d0027-r1-correction-01`; this provenance is review evidence, not repository authority
- J1/J2 correction basis: exact rejected draft `development@d7f5d506498dc2d05b7b5c2ce4ce8dbf94db0599` / blob `56bd254cacbbbda705752cdd3f9222e69fdf736a`, corrected only for the two blockers converged by `tdev-20260822-d0027-r1-j1j2-correction-01`; this provenance is evidence and does not authorize implementation or override current repository owners
- J3/J4 correction basis: exact rejected J1/J2-corrected draft `development@b1e716f7b86348319bd8b270769db7dda989bae1` / blob `69ce91e9d1ad49943af6f3c392636e25e08a8a66`, corrected only for the pre-send stale-authorization fence and route-scoped genesis blockers converged by `tdev-20260822-d0027-r1-j3j4-correction-01`; this provenance is review evidence, not repository authority or implementation authorization
- Affected owners: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, local-Agent package/runtime owners, the D0020 `AgentDeliveryAuthority` integration boundary, and the derived Design index
- Product/runtime semantics: accepts the supported installable authenticated local-Agent package, installation-principal, bounded local-effect and crash/orphan-recovery contract; this acceptance alone performs no source implementation, provider mutation, credential issuance, deployment or runtime activation
- Explicit non-goals: no D0020 reopen; no MCP user/client/tenant authentication ownership from D0024; no canonical remote Git publication ownership from D0025; no whole-provider deployment/secret-distribution ownership from D0026; no D0028 operations ownership; no D0035 self-hosting/tmcp-retirement completion; no arbitrary hostile-process sandbox; no external model-provider admission

## 1. One-line definition

A supported fresh Android/Termux machine can install and verify one provenance-bound tdev Agent package, register one non-reused installation principal against an existing D0020 stable Agent route, execute bounded package-owned local work through a crash-safe supervisor/warden lifecycle, and stop, reconnect, rotate, revoke, update, uninstall, reinstall or replace that installation without stale authority or invented physical-cleanup evidence.

## 2. Evidence classes at drafting

### Repository facts

At the drafting snapshot:

- `WORKBOARD.md` keeps D0020 Revision 2 `verified`, keeps D0027 research-only, and has no runnable frontier or selected next action.
- `docs/ARCHITECTURE.md` assigns Task/Attempt/result semantics to `CaseEngine`/CaseDO, route connection/capacity/reservation/delivery authorization and accepted delivery evidence to one durable `AgentDeliveryAuthority`, and actual filesystem/Git/process/network truth to the executor/local Agent.
- `docs/SECURITY.md` states that D0020 route, connection, executor, delivery and Attempt identifiers/fences are not bearer credentials and that externally reachable Agent paths must authenticate a principal before consulting delivery state.
- D0020 deliberately leaves final Agent credential enrollment/rotation/revocation and installation UX outside its verified meaning.
- `package.json` is currently a private library package with no install/service `bin` surface; its supported source CLI exposes demos rather than a local-Agent management product.
- `src/local-agent-runtime.mjs` currently reports `durableLocalJournal: false` and its process adapter spawns detached process groups. Therefore current source cannot rediscover or safely control a surviving package-owned process after the Agent process that held the live operation handle dies.
- `docs/ROADMAP.md` requires Group F to close local Agent execution/restart/fencing and Group H to prove fresh setup/deploy/recovery, while `docs/development/PROGRAM.md` identifies D0027 as the required installable authenticated local-Agent gate.

### Measured external engineering evidence

A bounded Android/Termux review-time probe on one Android 16 arm64 / Linux 6.1 profile observed:

- `pidfd_open` and `pidfd_send_signal` are available and provide a stable live process reference that does not authorize a recycled PID after the referenced process dies;
- `termux-services`/runit is available as a package-owned long-lived service host on that observed profile;
- writable cgroup ownership and unprivileged user/PID namespace creation were not available on that host;
- a detached process-group leader may exit while a descendant remains alive.

This probe selects a viable mechanism to design against. It is not D0027 product qualification and does not establish support for every Android/Termux profile. Every claimed profile must feature-probe the selected primitive and fail closed when it is absent.

### Inference

The final local-Agent boundary needs installation and credential identities that D0020 intentionally does not own: an installation incarnation that survives ordinary process restart but not reinstall/replacement, and a credential generation that can revoke an already-connected predecessor. The corrected package lifecycle additionally needs a separately advancing package-activation generation so package freshness is not overloaded onto credential lifetime. Release trust needs a monotonic route-current trust election, and restartable lifecycle mutation needs a monotonic lifecycle identity so repeated stop/start cannot recreate an old predecessor tuple. The existing per-route `AgentDeliveryAuthority` can own the installation/credential/package-activation, route-current non-secret trust-election and lifecycle fences as one transactionally ordered security/admission substate. `docs/SECURITY.md` remains the abstract trust-policy/disposition owner, `docs/DEPLOYMENT.md` remains the concrete trust-material/wiring owner, and local state may observe/cache these identities but cannot elect them current. Creating a second delivery/capacity or current-trust owner is unnecessary and forbidden.

D0020 deliberately separates durable Agent dispatch authorization from the later physical send attempt, so D0027 also needs a one-shot first-emission admission/authorization-consumption point at that same `AgentDeliveryAuthority`. It must order the exact current installation/credential/package/trust/lifecycle and D0020 connection/socket/executor tuple against any later fence without creating a transport-owned send permit. Fresh installation has a separate bootstrap circularity: before any D0027 tuple is current, trust, package and credential readiness cannot depend on one another already being current. The same route owner therefore needs a non-executable route-scoped genesis predecessor and pending transaction that stages all candidates before one atomic first-current election.

Crash-safe physical ownership also requires a live kernel identity held by a package-owned process that survives control/transport-process restart. Persisted PID/PGID metadata alone is insufficient destructive authority after owner restart because numeric process identifiers can be reused.

### Unknowns and bounded implementation choices

The following are not current repository facts and remain future implementation/deployment choices inside the contract below:

- the exact credential primitive, clone-safe installation-activation mechanism and secure local secret-storage backend;
- the package container/transport format, release-signing algorithm, concrete independently authenticated trust-anchor distribution mechanism and release channel;
- the exact admitted repository roots, tool/model profiles, network destinations and resource limits for the first supported deployment;
- whether every future Android/Termux profile proposed for support exposes pidfd syscalls; unsupported profiles must not receive a PID fallback;
- the final physical location of canonical Git publication effects under D0025;
- the supported MCP client/user authentication flow under D0023/D0024;
- whether evidence later activates D0021 cross-Case exclusion or D0022 persistent shared content/artifact storage.

A later choice that changes the ownership, stale-fence, crash-recovery, secret-exclusion or rollback meaning in this Design requires a Design revision rather than an implementation shortcut.

## 3. Current contract and concrete problem

### Current contract

D0020 provides one stable Agent route, logical connection generations, socket-incarnation fencing, executor generations, accepted aggregate capacity, non-executable reservations, delivery admission/authorization, accepted delivery evidence and the Case-owned `grant_attempt_dispatch` serialization boundary. It intentionally owns no waiting Task queue and no Task/Attempt/result semantics.

The local Agent owns real physical effects, but the maintained product has no accepted contract for how a fresh machine obtains an Agent package, becomes one authenticated installation, rotates/revokes that installation's credential, survives Agent-process crash, recovers or conservatively holds orphaned physical resources, or upgrades/reinstalls without stale authority.

### Concrete problem

Reusing a stable `agentId`, route generation, connection epoch, executor epoch, hostname or machine identifier as installation authority permits stale restored/reinstalled software to look current. Reusing the current qualification HMAC derivation key as a final unversioned installation credential cannot independently revoke one installation or an already-open socket. Persisting only PIDs/PGIDs cannot safely reacquire destructive process authority after a supervisor crash. Treating disconnect, process disappearance, cancellation or semantic terminality as cleanup would violate D0020's positive physical-evidence requirement and could release aggregate capacity while work still exists.

D0027 must close these gaps without moving Case semantics, delivery/capacity ownership, MCP authentication, Git publication, deployment orchestration or final operations into the local package.

## 4. Decision boundary and owner split

D0027 owns the **installable authenticated local-Agent boundary**. The owner split is:

| Fact / effect | Owner after D0027 | Explicit non-owner |
| --- | --- | --- |
| Plan/Task/Attempt/result/semantic terminality and `grant_attempt_dispatch` | `CaseEngine`/CaseDO | local Agent, supervisor, `AgentDeliveryAuthority` |
| stable `agentId`, route generation and deployment route binding | existing D0020/deployment owner | local re-election, machine hostname |
| connection/socket/executor generations, aggregate capacity, reservation/delivery admission and Agent dispatch authorization | existing per-route `AgentDeliveryAuthority` | CaseDO semantic lifecycle, local supervisor |
| current `installationGeneration`, current `credentialGeneration`, current `packageActivationGeneration`, route-current `trustPolicyGeneration` + non-secret trust-election state, lifecycle (`active`/`draining`/`revoked`), current `lifecycleGeneration` and idempotent management receipts | D0027 security/admission substate inside the existing per-route `AgentDeliveryAuthority` | a second Agent registry/queue/capacity/trust/lifecycle owner |
| abstract Agent-management authentication/admission, credential-lifecycle policy and release-trust policy | `docs/SECURITY.md` as synchronized by an accepted D0027 revision | D0020 identifiers, incumbent Agent credential possession, D0024 MCP identity, provisional D0026 planning labels |
| concrete credential/trust material provisioning, package distribution, provider/operator wiring and rollback realization | `docs/DEPLOYMENT.md`; future D0026 may wire an accepted policy but does not originate it | Case semantic state, delivery receipts, repository/evidence/model state |
| actual local process/resource ownership and cleanup evidence | D0027 package-owned execution supervisor + per-operation warden | CaseDO, `AgentDeliveryAuthority` physical inference |
| supported MCP user/client authentication and tenant/Case authorization | D0024 | Agent installation credential |
| canonical authenticated remote Git publication | D0025 | ordinary D0027 Task execution |
| whole provider deployment/configuration/rollback | D0026 | local package lifecycle |
| deployed operational outage/recovery runbooks | D0028 | D0027 package semantics |
| self-hosting and tmcp retirement proof | D0035 | D0027 alone |

The `AgentDeliveryAuthority` remains one owner: D0027 adds only the installation/credential/package-activation elections, the route-current non-secret trust election, the lifecycle disposition/generation and their stale-authority fences needed before its existing delivery state can be used. `docs/SECURITY.md` owns the abstract management-proof and release-trust/disposition policy selected by this Design after acceptance; `docs/DEPLOYMENT.md` owns concrete secret/trust/package realization and rollback wiring. Neither policy prose, deployment material nor local package state may expose a competing current runtime trust/lifecycle value. A provisional Design/program label never becomes a product owner by reference. Secret bytes are never stored in the `AgentDeliveryAuthority` substate.

## 5. Identity and durable state model

### 5.1 Identity axes

D0027 requires these identities to remain distinct:

- `agentId` — stable logical Agent endpoint selected by the existing route-binding owner;
- `routeGeneration` — positive non-reused generation of that stable route;
- `genesisGeneration` — positive non-reused route-scoped first-registration attempt identity allocated only while no D0027 `CURRENT` tuple has ever been elected; every new non-replay genesis admission advances the surviving genesis high-water/fence, exact replay does not, and failed/GC'd attempts cannot recreate an older pristine predecessor;
- `installationGeneration` — positive non-reused incarnation of one installed Agent package identity on that route;
- `credentialGeneration` — current credential generation for one installation;
- `packageActivationGeneration` — positive non-reused election of one exact package manifest/service state for that installation; every package-changing update, reinstall and rollback advances it even when `installationGeneration` is preserved;
- `trustPolicyGeneration` — positive non-reused route-current release-trust election generation held in the existing per-route `AgentDeliveryAuthority` under SECURITY-owned abstract policy/disposition semantics; every non-replay trust-state mutation advances it and rollback never restores an older trust generation;
- `lifecycleGeneration` — positive non-reused route-current lifecycle transition generation beside `active`/`draining`/`revoked`; every new product-side lifecycle mutation advances it while exact replay returns the already-recorded generation/result, so disposition alone can never create a restart ABA predecessor;
- `connectionEpoch` — D0020 logical network connection generation;
- `socketIncarnationId` — D0020 physical socket incarnation for one logical connection;
- `executorEpoch` — D0020/local execution generation; it advances when volatile executor state is replaced;
- `supervisorGeneration` — positive non-reused generation of the package-owned execution supervisor state owner;
- `operationGeneration` — monotonically non-reused local physical-operation identity allocated by that supervisor;
- Attempt identity/fence — Case-owned semantic execution fence and never an installation credential.

Machine identifiers, Android IDs, hostnames, filesystem paths, PID/PGID values and timestamps may be provenance or attestation inputs only. Possession of them never authorizes installation, connection or destructive process control.

### 5.2 Installation state

The local package persists one versioned installation record containing only non-secret state needed to restart safely, including:

- exact stable route identity (`agentId`, `routeGeneration`);
- while first registration is nonterminal, the observed `genesisGeneration`, exact pending candidate-tuple digest and stable genesis-management receipt needed for reconciliation; local copies never elect or recreate genesis authority;
- current `installationGeneration`, `credentialGeneration` and `packageActivationGeneration`, plus observed route-current `trustPolicyGeneration`/trust-state and `lifecycleGeneration`/disposition/transition receipts needed for reconciliation; these local observations never elect product authority;
- immutable current/previous package-manifest/configuration digests needed by a supported recovery or rollback path;
- local state-schema version and supported predecessor rule;
- `supervisorGeneration` and `operationGeneration` high-water values;
- stable management/provisioning request identities, intent digests, exact receipts or the surviving bounded replay/non-reuse fences that replace compacted detail;
- one crash-safe package-management lifecycle journal with at most one nonterminal management transaction;
- exact predecessor/quiescence scope while any physical slot remains held or may still be released by late positive evidence;
- durable local operation-journal records defined in Section 9.

Secret material lives only behind the selected local credential backend and is referenced indirectly. The local record must remain safe to include in bounded diagnostics after secret fields and deployment paths are excluded.

### 5.3 Lifetime rules

- ordinary control-process restart may preserve route/install/credential identity when the package-owned installation state is intact;
- real reconnect advances the D0020 connection generation; hibernation/reattach does not synthesize one;
- executor replacement advances `executorEpoch` and never reuses a tuple while stale input may exist;
- supervisor replacement advances `supervisorGeneration`;
- every new non-replay first-registration admission advances the route-scoped genesis high-water and allocates a fresh positive non-reused `genesisGeneration`; exact replay does not, failed candidates are never reused, and after a successful first `CURRENT` election the route never returns to a pristine genesis predecessor;
- every non-replay route-current trust-state mutation advances `trustPolicyGeneration`; exact replay does not, and copied/restored local trust state cannot lower or recreate current product trust;
- every new product-side lifecycle mutation advances `lifecycleGeneration`; exact replay does not, and lifecycle disposition without the exact generation/transition cause is insufficient predecessor authority for start/stop/uninstall;
- a compatible drained in-place package upgrade may preserve `installationGeneration`, but every package-changing update advances `packageActivationGeneration` and elects one exact manifest/service state under the current `trustPolicyGeneration`;
- `credentialGeneration` advances independently when credential lifecycle requires it; a package change does not advance it merely to carry package-version meaning, although a selected concrete clone-safe activation mechanism may require a fresh credential as its activation proof;
- reinstall, stale backup restore/clone, machine replacement or unclean package-state replacement requires a new `installationGeneration` and a fresh higher `packageActivationGeneration`;
- copied package/journal bytes plus a usable data-plane credential are never sufficient to become current: every supported installation profile must provide an independently clone-safe current-installation activation property;
- stable-route transfer to a new installation is legal only after an explicit predecessor admission fence; a new installation never adopts predecessor live handles;
- product-side installation/credential/package/trust/lifecycle non-reuse fences outlive local package deletion, secret deletion, uninstall, stale restore, reinstall and replacement and cannot be reset by recreating local state.

## 6. Registration, authentication, rotation and revocation

### 6.1 Route prerequisite

D0027 does not create `agentId` or `routeGeneration`. The deployment owner first establishes the one supported D0020 `AgentRouteBinding`. Registration then attaches an installation principal to that exact route.

### 6.2 Management authority and authenticated principal contract

`docs/SECURITY.md` owns the abstract Agent-management proof domain. Every product-authority mutation—`register` including its terminal `initial_activate` phase, `replace`, `rotate`, `revoke`, package activation, trust-policy/trust-state transition, `stop`, `start` and `uninstall`—must present an independently authenticated management proof bound to:

```text
operation
agentId
routeGeneration
stable managementRequestId
exact intentDigest
expected predecessor security state
```

For a trust-state transition, the predecessor includes the exact current `trustPolicyGeneration` and trust-state identity/dispositions. For a product-side lifecycle transition, it includes the exact current `lifecycleGeneration` and disposition plus the exact current route/installation/credential/package-activation/trust tuple relevant to that transition. For the first `register`, where no D0027 current tuple exists yet, the predecessor is instead the exact route-scoped `UNREGISTERED` identity from Section 7.4, including its current genesis high-water/non-reuse fence. An exact replay uses the same predecessor identity and returns the same result; an intervening current-state change makes an old request stale/conflicting rather than rebinding it.

Data-plane Agent credential possession, a D0020 route/connection/executor/delivery identifier, D0024 MCP identity, hostname or machine identifier is insufficient by itself. Denied or mismatched management proof produces zero durable mutation. Emergency revocation must remain possible through the authoritative management proof without requiring possession of the credential being revoked.

`docs/DEPLOYMENT.md` selects the concrete route-scoped per-install possession credential or equivalent verifier and the concrete delivery of management/trust material. Before externally reachable Agent connect/message/evidence/result handling consults delivery state, the data-plane verifier must authenticate:

```text
agentId
routeGeneration
installationGeneration
credentialGeneration
```

and the admitted session must additionally bind the exact current `packageActivationGeneration` and manifest identity elected under the current `trustPolicyGeneration`.

The product-side fence in `AgentDeliveryAuthority` persists the current installation, credential and package-activation generations, the route-current non-secret trust-election tuple, lifecycle (`active`, `draining`, `revoked`), current `lifecycleGeneration` and immutable or safely compacted management receipts/fences. It stores no credential or trust secret bytes.

### 6.3 Management requests, replay and bounded retention

Registration, replacement, rotation, revocation, package activation, trust-policy/trust-state transitions and product-side `stop`/`start`/`uninstall` lifecycle transitions use a stable `managementRequestId`, exact intent digest and expected predecessor security state.

- the first successful transaction performs at most one authorized election/advance and records one immutable result receipt;
- exact replay returns that same semantic result without minting another generation or repeating an external effect;
- changed-intent or changed-predecessor reuse fails conflict before mutation;
- response loss reconciles by replay/reread of that same identity, never by choosing current authority from a name, timestamp, connection recency, filesystem recency or credential/identifier possession;
- detailed receipt retention may be bounded only after a monotonic surviving fence—such as a closed request namespace/window, generation floor, retained digest/tombstone or equivalent—makes any forgotten predecessor request permanently stale and non-creating;
- TTL, quota or storage pressure that cannot compact without losing the last replay/non-reuse fence fails closed rather than accepting the ancient request as new work.

Concrete retention periods/counts are implementation/deployment choices. The ordering and non-resurrection properties above are normative.

### 6.4 Two-sided credential provisioning and current election

Credential creation/rotation uses one stable provisioning correlation identity and one positive non-reused **candidate** `credentialGeneration` that is not current and cannot authenticate executable work yet.

Two separate authoritative readiness receipts must exist for the same exact route, installation, package activation/manifest, provisioning identity and candidate credential generation:

- **verifier-ready** — the selected external verifier/credential backend can validate the candidate possession credential;
- **local-ready** — the supported local secret backend durably holds a usable reference/material for that same candidate.

Only the existing `AgentDeliveryAuthority` may elect the candidate `credentialGeneration` current, and only after both receipts match. Neither readiness side can self-elect. Lost responses reconcile the same provisioning identity without blind remint, an abandoned candidate generation is never reused, and product receipts never contain or reconstruct secret bytes.

### 6.5 Per-message stale fence

Every accepted socket attachment/reattach, Agent message/evidence/result mutation and every D0020 dispatch-authorization commit must be bound to the current `installationGeneration`, `credentialGeneration` and `packageActivationGeneration`. The package activation is itself bound to the exact manifest and current `trustPolicyGeneration`.

A socket authenticated under a predecessor installation/credential/package activation becomes unable to read or mutate delivery state or receive new executable dispatch immediately when the product fence advances or revokes that authority. Transport connection existence is not an authorization cache that can survive a product-side generation change.

Even after a D0020 Agent dispatch authorization has durably committed, no first physical send may begin until the same per-route `AgentDeliveryAuthority` grants the one-shot D0027-aware first-emission admission defined in Section 6.8. Authorization receipt possession, a socket object or a transport-local cached decision is never sufficient to cross a later D0027 security/lifecycle fence.

### 6.6 Coordinated rotation and emergency revocation

Coordinated credential rotation:

1. authorizes one stable management/provisioning request under Section 6.2;
2. prepares a positive non-current candidate generation and obtains both Section 6.4 readiness receipts;
3. atomically elects that `credentialGeneration` current in the product-side fence and records the rotation result;
4. makes predecessor sockets product-inert;
5. reconnects under the new generation;
6. reconciles revocation/removal of the predecessor secret in the external and local secret backends when their deletion barriers permit.

Emergency revocation performs the product-side fence first. It blocks new delivery mutations/dispatch immediately but does not imply that already-started physical effects are absent, erase management/reconciliation authority, or release physical capacity.

### 6.7 Route-current trust election and authorization serialization

The existing per-route `AgentDeliveryAuthority` owns one **route-current non-secret trust-election substate**. `docs/SECURITY.md` owns the abstract trust-policy and disposition semantics; `docs/DEPLOYMENT.md` owns concrete trust material, verifier/key custody, distribution and provider wiring; local package state may cache or observe trust identities/receipts but cannot elect current trust.

The route-current trust substate contains at least:

- positive non-reused `trustPolicyGeneration`;
- an exact current trust-state digest or equivalent immutable identity;
- a bounded set of non-secret trust-subject identities/digests with explicit `active`, `retired` or `revoked` disposition;
- immutable result receipts or safely compacted replay/non-reuse fences for trust-state mutations.

Every successful non-replay trust-state mutation advances `trustPolicyGeneration`. Exact replay returns the prior semantic result without another advance; changed-intent or changed-predecessor reuse conflicts before mutation. Product-side generation/high-water/tombstone state survives bounded detail GC and local deletion/reinstall so a forgotten request or stale local trust image cannot recreate or lower current trust.

Disposition semantics are fail-closed:

- `active` may authorize new package activation only when the other current install/credential/package/lifecycle predicates pass;
- `retired` never authorizes a new package activation by itself; a previously elected package activation may remain admitted only when the new current trust state explicitly and deterministically continues that exact activation/manifest;
- `revoked` denies new dependent package activation, connect/reattach, start and Agent dispatch authority and makes dependent predecessor sessions product-inert for new delivery mutation.

No trust disposition proves physical absence, Case terminality/cancellation or capacity release.

Trust-state mutation, package-activation election, connect/reattach and new session/message authority, product-side start election, `AgentDeliveryAuthority` dispatch authorization and Section 6.8 first-emission admission serialize at this same per-route owner against one exact current install/credential/package/trust/lifecycle tuple. A transaction that loses a trust/lifecycle race must reread/reconcile current state; it cannot commit using the predecessor tuple. If a relevant trust/lifecycle/current-tuple fence wins before first-emission admission, the predecessor authorization is permanently non-emitting. If first-emission admission wins first, that ordinal is conservatively possible execution and the later fence cannot rewrite the historical Case-owned `grant_attempt_dispatch` fact, erase the emission-admission winner or relax D0020 positive-cleanup/capacity requirements.

### 6.8 One-shot first-emission admission and authorization consumption

D0020 intentionally commits one durable `AgentDeliveryAuthority` dispatch authorization before the later physical-send attempt. D0027 therefore adds one further Design-level linearization at the **same existing per-route `AgentDeliveryAuthority`** after durable Agent authorization and before initiation of the first physical send for that dispatch ordinal.

For each exact `(deliveryId, dispatchOrdinal, dispatchGrantId, authorizationId)`, the owner records at most one durable **first-emission admission / authorization-consumption** fact. It is part of the existing delivery ordinal, not a second send registry, Case fact, transport-owned permit, local-supervisor decision or capacity owner. A successful admission revalidates and binds at least:

- exact `agentId + routeGeneration`;
- current `installationGeneration` and `credentialGeneration`;
- current `packageActivationGeneration` plus exact manifest identity;
- current `trustPolicyGeneration` plus exact current trust-state identity/dispositions relevant to that activation;
- current executable `active` `lifecycleGeneration`;
- the current D0020 logical connection plus physical `socketIncarnationId` fence;
- current executor identity/epoch;
- exact `deliveryId + dispatchOrdinal`;
- exact Case-owned `dispatchGrantId` and exact Agent `authorizationId`.

Case Attempt/fencing meaning remains Case-owned and is consumed through the existing delivery/grant/authorization binding; D0027 does not reconstruct or duplicate it.

Every mutation that invalidates one component of that tuple—including installation, credential, package, trust, lifecycle, connection/socket-incarnation or executor change—must be mutually ordered with first-emission admission at this same owner. The winner semantics are monotonic:

1. **Fence/current-tuple change wins first.** The predecessor authorization has not consumed first-emission authority, is stale for emission and is permanently non-emitting. Authorization replay, reconnect, owner reconstruction, cached transport state or later local recovery cannot revive it.
2. **First-emission admission wins first.** That exact ordinal becomes conservatively possible execution. The admission exclusively consumes authority for **at most one immediate physical-send initiation**. A later fence may block new authority but cannot retract that winner, classify the ordinal as `positively_not_sent`/`not_started`/`no_handle`, erase the Case grant or release capacity without the existing positive D0020 evidence.

The admission may be realized by an atomic one-shot state transition, provider-local serialization or an equivalent mechanism, but a mere final check that returns a transferable/cached permit is non-conforming. The admission winner must remain inside the serialization/exclusion boundary until the one permitted physical-send initiation is consumed or control is lost; an implementation may not pause after permission, allow a later fence to win, and then emit using the predecessor permission. If control crashes, the admission response is lost, or the send outcome becomes ambiguous after admission, the ordinal remains possible execution and exact replay returns the same admission identity/semantic result **without another may-send**.

Replay and reconnect follow the existing D0020 ordinal rules:

- replay of the Agent authorization receipt alone never grants another physical send;
- replay of an already-won first-emission admission never permits a second send attempt;
- reconnect, socket replacement, executor replacement or any changed D0027 current tuple cannot resurrect a predecessor authorization that had not already won admission;
- a later dispatch ordinal still requires D0020's positive safe-replay/effect-idempotency proof, a fresh one-shot Case `grant_attempt_dispatch`, fresh Agent authorization and a fresh current-tuple first-emission admission;
- cancellation, revocation, timeout, disconnect, response loss and a later fence never fabricate physical absence or capacity release.

## 7. Package and fresh-machine bootstrap

### 7.1 Supported local profile

Revision 1 selects one baseline profile, `tdev.agent.termux.pidfd.v1`, with these required properties:

- Android/Termux environment with the package-declared CPU architecture;
- Node.js runtime satisfying the package's declared minimum (`>=22` at the drafting snapshot);
- a package-owned long-lived service host equivalent to the observed `termux-services`/runit profile;
- working `pidfd_open` and `pidfd_send_signal` for exact live-process identity/control;
- filesystem semantics sufficient to fsync the package-owned local operation journal and its containing directory where required.

Bootstrap must feature-probe these properties on the actual machine. Missing/denied/mismatched pidfd support or service/journal capability is `unsupported`; there is no automatic PID/PGID destructive-control fallback.

### 7.2 Immutable package identity and release-trust policy

Every installable release has an immutable package manifest binding at least:

- package/release version and exact source revision;
- profile identifier;
- package file/helper digests and helper ABI/version;
- local durable-state schema version and predecessor compatibility range;
- Agent/D0020 protocol compatibility range;
- required runtime/service capabilities;
- non-secret configuration schema identity.

A fresh machine obtains the initial release trust anchor from an independently authenticated SECURITY-owned source; the candidate package/channel cannot authenticate the trust root that authenticates itself. Before any D0027 current tuple exists, the exact candidate trust state is staged only inside the non-executable `GENESIS_PENDING` transaction of Section 7.4 and cannot authorize a current package/session by itself. The route-current trust state is elected only by the existing per-route `AgentDeliveryAuthority`: first as part of the atomic `initial_activate` election, and afterward through Section 6.7. Every non-replay current trust-state mutation advances the positive non-reused `trustPolicyGeneration` and records explicit active, retired and revoked subject/key dispositions.

Every package activation, including update, downgrade or rollback, is a new forward election under the **current** trust state. Restoring older local trust bytes cannot lower current product authority. A retired trust subject cannot authorize a new package activation by itself; continuation of an already-elected exact activation/manifest must be explicitly admitted by the new current trust state, and absence/mismatch fails closed. A revoked trust subject denies new dependent package/connect/start/dispatch authority. Trust/package revocation never proves physical cleanup or releases capacity.

The concrete signature algorithm, key-custody implementation and release transport may vary by deployment. Unverifiable, mismatched or stale-policy artifacts fail before registration/connect/activation and cannot consume current Agent authority.

### 7.3 Bootstrap surface

The package must provide one supported management surface with semantic operations equivalent to:

```text
install
register
start
status
stop
update
uninstall
```

Exact CLI spelling is not yet an external compatibility contract, but each operation has one package owner, bounded inputs, explicit result, independent machine-visible verification and failure semantics. A supported fresh installation must not depend on a tdev repository checkout, tmcp Task/worktree state, ambient developer `PATH`, runtime compilation/download of unbound helpers, or model-visible secrets.

Non-secret configuration and secret provisioning are separate inputs. Secret values must never appear in repository files, Task/Plan/result state, evidence payloads, package manifests or model-visible context.

The human-facing management surface may combine fresh-machine preparation steps, but product state must not treat the ordinary Section 10.1 base `start` transition as first installation activation. Fresh registration follows the distinct route-scoped genesis contract below.

### 7.4 Route-scoped genesis and first-current election

The existing per-route `AgentDeliveryAuthority` owns the complete D0027 security/admission state as one union. Before first current election it has two non-executable states, followed by the ordinary current state:

#### `UNREGISTERED`

`UNREGISTERED` means the exact D0020 `AgentRouteBinding` (`agentId + routeGeneration`) already exists, but no D0027 current installation/credential/package/trust/lifecycle tuple has been elected. It grants no D0027 connect/reattach/start/dispatch/first-emission authority. A route may still carry a nonzero genesis-generation high-water, compact request tombstones or equivalent non-reuse fences from failed earlier attempts. Absence of local files, package/service state, credential bytes or a local journal is never proof of `UNREGISTERED`.

A route that has ever successfully elected a D0027 `CURRENT` tuple never returns to a pristine `UNREGISTERED` predecessor. Reinstall, stale restore/clone, machine replacement, uninstall recovery and later replacement use the ordinary successor/non-reuse rules of Sections 10.3-10.5.

#### `GENESIS_PENDING`

One independently authenticated stable `register` request may atomically consume the exact current `UNREGISTERED` predecessor. The request binds the exact route, stable `managementRequestId`, exact `intentDigest`, expected `UNREGISTERED` predecessor including the current genesis high-water/non-reuse fence, and one freshly allocated positive non-reused `genesisGeneration`. Admission fixes once, before any executable authority exists, one fresh candidate set containing at least candidate `installationGeneration`, `trustPolicyGeneration` plus trust-state identity, `packageActivationGeneration` plus exact manifest identity, `credentialGeneration`, and the first `lifecycleGeneration`. Allocation advances the applicable route-scoped non-reuse high-water/fences even if the pending attempt later fails; exact replay never reallocates candidates.

While `GENESIS_PENDING`, the same exact pending identity stages only subordinate evidence/effects, in this order or another order proven semantically equivalent without circular current-state dependency:

1. establish the exact candidate trust state from the independently authenticated SECURITY-owned bootstrap trust source through the DEPLOYMENT-owned concrete delivery mechanism;
2. verify/stage the exact package manifest and package-activation candidate under that candidate trust state, without electing either current;
3. obtain matching verifier-ready and local-ready credential receipts bound to the exact route, genesis, candidate installation/package/manifest/trust, provisioning identity and candidate credential generation;
4. establish supported local package/service/supervisor/capability readiness bound to the same pending identity while the service remains non-executable;
5. when the pre-D0027 route can still own live or ambiguous D0020 physical work, obtain the exact Section 9.5 positive predecessor-quiescence evidence required before the new installation may become executable.

Candidate trust, package bytes, signature verification, credential possession/readiness, local service presence and cached local records are evidence or subordinate effects only. None may self-elect current product authority, and no partial pending tuple may connect, reattach, use base `start`, authorize dispatch or win first-emission admission.

#### `CURRENT` through `initial_activate`

The first executable election is the terminal phase of the same stable genesis transaction and records transition cause **`initial_activate`**. It is distinct from the restart-only Section 10.1 `start` transition. Immediately before election, the same per-route `AgentDeliveryAuthority` revalidates the exact `GENESIS_PENDING` identity, all fixed candidate generations/digests/receipts, current route, candidate trust/package compatibility, local readiness and every required predecessor-quiescence barrier. Any changed candidate fact, trust/package/credential input, route/security state, competing registration or unresolved predecessor physical ambiguity makes the pending election stale/conflicting/fenced rather than silently rebinding it.

Only one atomic owner transaction may then elect the complete tuple `CURRENT` together: exact installation, credential, package activation/manifest, current trust state and the first active `lifecycleGeneration` with cause `initial_activate`. There is no executable intermediate current tuple. Ordinary base `start` is legal only from an exact completed restart-eligible `base_stop` drain and must reject `UNREGISTERED` or `GENESIS_PENDING`.

Genesis replay/recovery is fail-closed:

- exact replay of the same stable genesis request returns the same pending/final/terminal result and never remints candidate identities or repeats a first election;
- changed intent or changed predecessor under the same request identity conflicts before mutation;
- distinct concurrent first-registration requests cannot co-win: one exact admission wins and every loser rereads/conflicts against the advanced predecessor;
- response loss or crash resumes/reconciles the same `AgentDeliveryAuthority` pending state and receipts, never filesystem/service recency;
- a definitively failed pending attempt remains non-executable; all of its candidate generations are retired/non-reusable, and a later fresh attempt may begin only against the advanced exact non-current predecessor/high-water with fresh candidate identities;
- bounded detail GC may drop old genesis receipts only after a monotonic generation floor, tombstone, closed request namespace/window or equivalent surviving route fence makes every ancient request stale/non-creating;
- stale backup, clone, local deletion or reinstall cannot recreate the pristine genesis predecessor after a successful first election.

A future D0027-aware durable schema may initialize a legacy **D0020-only** route as `UNREGISTERED` only through a versioned migration that positively establishes the predecessor format could not already contain D0027 authority. Missing D0027 state inside a D0027-aware/newer format is corruption or ambiguity, not permission to infer `UNREGISTERED` from absence.

## 8. Local execution and least-authority boundary

D0027 local authority is deny-by-default.

### 8.1 Roots and paths

The deployment selects canonical repository/workspace roots outside Task input. Every admitted path is normalized and confined beneath the configured root after symlink/realpath checks appropriate to the operation. Task input cannot select arbitrary absolute roots, `.git` control paths outside the admitted operation, package state, credential state or unrelated user files.

### 8.2 Tool profiles

Execution uses package-selected named tool profiles. Each profile binds:

- executable/package identity;
- structured argv schema rather than ambient shell construction;
- bounded working-directory rule;
- explicit environment allowlist with no caller-environment inheritance by default;
- CPU/time/output/process/resource bounds;
- permitted filesystem roots;
- permitted network destinations or a no-network rule;
- model/tool credential reference owned outside semantic state;
- cleanup-domain requirement described below.

Ordinary Task input cannot replace the executable, inject an arbitrary shell, expand network destinations or select credentials. A later profile that intentionally exposes a shell or stronger external effect is new Class-2 surface unless already covered by an accepted owner.

### 8.3 Git and model boundaries

The local Agent may perform bounded local Git/filesystem mechanics inside an admitted isolated workspace when required to produce an ordinary result. It may not use ordinary D0027 Agent credentials to publish an authenticated remote ref or replace the canonical tree; D0025 remains the sole canonical publication owner.

The existing trusted-local model boundary may be used by an admitted local tool profile. Sending repository/context data to an external model provider remains blocked until the separate SECURITY-owned Class-2 egress/auth/privacy contract is accepted and qualified.

## 9. Crash-safe physical execution owner

### 9.1 Components

The selected physical owner is a package-owned long-lived **execution supervisor** hosted by the supported local service mechanism. The Agent control/transport process is a client of this supervisor and may restart without destroying physical ownership.

Each executable operation receives one package-owned **warden** process. The warden:

- is the leader/owner of the operation process group while work is live;
- begins in `WAIT_GO` state with no authority to start the Task/tool command;
- owns destructive group control against its own current group;
- remains inside the package cleanup contract until all admitted descendants/resources are absent.

The supervisor holds one live pidfd for each live warden. Only that live pidfd plus the live warden's self-owned process group authorizes destructive process control. Persisted PID/PGID/starttime/path/name metadata is provenance and non-destructive reconciliation input only.

### 9.2 Durable-before-create state machine

For one non-reused `operationGeneration` the supervisor performs:

```text
allocate operationGeneration
  -> fsync PREPARED before any per-operation process creation
  -> create WAIT_GO warden
  -> acquire live pidfd + boot/PID/PGID/starttime incarnation evidence
  -> fsync ACTIVE
  -> fsync GO_ALLOWED bound to the exact launch/fence digest
  -> send exact GO token
  -> warden may launch the admitted Task/tool process
  -> cleanup / positive absence
  -> terminal local record
```

`PREPARED` binds the operation to the D0020 delivery/Attempt/executor fences and an immutable launch digest before any resource may be created. Any supervisor crash from `PREPARED` onward is conservatively `possible_handle`/capacity-held; it is never historical `no_handle` merely because the exact live handle was not durably published before the crash.

The `WAIT_GO` barrier ensures the executable Task/effect cannot begin before `ACTIVE` and `GO_ALLOWED` are durable.

### 9.3 Agent-control restart

If the control/transport process dies while the supervisor remains live, the restarted control process reconnects to that same supervisor and queries exact `operationGeneration` state. It cannot launch a duplicate operation or infer cleanup from transport loss.

### 9.4 Supervisor restart

A replacement supervisor:

- advances `supervisorGeneration`;
- loads every nonterminal predecessor operation record as held/orphaned;
- never reconstructs destructive authority from stored PID/PGID or path/name metadata;
- never adopts predecessor handles merely because `/proc` fields appear to match;
- performs only non-destructive reconciliation until positive absence/quiescence evidence exists.

Stored metadata may narrow observation. It cannot authorize `kill`, `killpg` or an equivalent destructive operation against a potentially recycled unrelated process.

### 9.5 Cleanup, predecessor quiescence and capacity evidence

While the original supervisor/warden ownership chain is live, the supervisor uses the live pidfd to observe/control the exact warden and the warden cleans its own admitted process group/resources. `cleanup_complete` is emitted only after positive owned-resource absence.

After supervisor loss, predecessor physical capacity can be released only through one exact `PredecessorQuiescenceReceipt` scoped to the predecessor route/installation, supervisor generation, held physical slot and the operation-generation high-water or equivalent complete cleanup-domain identity. The receipt records the authoritative proof class/producer and enough host/boot identity to test its scope; it is non-secret and cannot carry predecessor delivery authority.

Revision 1 admits only these baseline positive proof classes:

1. **original live owner** — the still-authoritative predecessor supervisor/warden chain positively establishes owned cleanup;
2. **same-host same-boot whole-domain absence** — a qualified observer on the same host/boot positively observes the entire supported cleanup domain absent;
3. **same-host reboot** — independently established host continuity plus a changed boot identity proves predecessor-boot process absence, but not semantic result/effect resolution.

Replacement-machine boot, timeout, registry age, inaccessibility, machine disappearance, partial process observation and an unscoped operator assertion are not positive absence. A future operator-decommission proof class requires its own SECURITY/DEPLOYMENT specification and qualification; it is not a Revision-1 baseline escape hatch.

Current authoritative management admission accepts the exact receipt into the existing `AgentDeliveryAuthority`. Acceptance may monotonically refine only the matching predecessor physical slot to released/cleaned; it cannot release a different/current slot or restore any predecessor installation, credential, socket, package or delivery authority.

While any predecessor physical slot remains held or can still legally be released by late positive evidence, enough exact predecessor scope must survive local/authentication detail compaction to address that slot deterministically. If that locator cannot be retained safely, capacity stays held.

`AgentDeliveryAuthority` remains the aggregate capacity/delivery owner. The local supervisor/qualified observer supplies only scoped physical evidence and cannot create a second durable Task queue, reservation ledger or dispatch authority.

### 9.6 Cleanup-domain support limit

Every supported tool profile must prove that managed descendants remain in the warden's cleanup domain under normal completion, cancellation, timeout and the claimed crash cases. Arbitrary hostile process/session escape is not part of `tdev.agent.termux.pidfd.v1`. If a proposed tool can escape the process group/session in a way the baseline Android profile cannot positively contain or observe, that tool is unsupported until a stronger accepted isolation/security design and qualification exist.

## 10. Stop, restart, reinstall, update, uninstall, migration and rollback

The package persists one versioned **management lifecycle journal**. At most one management transaction may be nonterminal for an installation at a time. Every transaction binds a stable `managementRequestId`, intent digest, expected predecessor authority and the exact package/service/security election state. Staged old/new payload bytes may coexist, but filesystem recency, version strings, timestamps, service discovery order and process presence never elect current authority.

The existing per-route `AgentDeliveryAuthority` owns lifecycle disposition `active | draining | revoked` plus one positive non-reused `lifecycleGeneration`. Every new product-side lifecycle mutation advances `lifecycleGeneration`; exact replay of the same stable request returns the already-recorded result and does not advance it again. The durable transition receipt or equivalent record binds at least the operation/cause, stable request identity, intent digest, exact expected predecessor lifecycle generation/disposition, exact route/install/credential/package/trust predecessor tuple, resulting lifecycle generation/disposition and enough correlation to reconcile subordinate local effects. Local service/process state is evidence or a subordinate effect, never the product lifecycle elector.

Exactly one product-side `packageActivationGeneration` and one matching local package/service election may be current. Journal loss, missing lifecycle predecessor identity or product/local election mismatch fails closed before executable admission rather than choosing an apparent winner.

| Transition | Required rule |
| --- | --- |
| control-process restart | preserve intact install/credential/package identity; reconnect to the same live supervisor; advance connection/executor generations when the corresponding volatile owner is replaced |
| real network reconnect | use D0020 real reconnect semantics and an advancing connection epoch; do not elect a new installation/package merely because the socket changed |
| supervisor restart | advance `supervisorGeneration`; quarantine predecessor nonterminal records; no stored-PID destructive adoption; conservatively account held capacity |
| credential rotation | use Section 6.4 two-sided readiness, advance only `credentialGeneration`, fence old sockets, reconnect; unresolved physical work remains held |
| emergency security revocation | product fence first; block new Agent mutation/dispatch immediately; preserve cleanup/reconciliation state and do not infer physical absence |
| first `initial_activate` | only as the terminal phase of the exact Section 7.4 `GENESIS_PENDING` transaction; keep all preparation non-executable, require any applicable positive predecessor-quiescence barrier, revalidate the fixed candidate tuple, then atomically elect the first complete `CURRENT` tuple with a fresh active `lifecycleGeneration` caused by `initial_activate` |
| base `stop` | from the exact current active lifecycle generation, atomically elect a new `draining` lifecycle generation before local quiescence; prohibit later executable admission, positively quiesce owned/held work, verify service/supervisor stopped, and mark only that completed `base_stop` drain generation restart-eligible while preserving installation/credential/package/trust authority |
| base `start` | reject `UNREGISTERED`/`GENESIS_PENDING`; otherwise authenticate an exact stable start request against the current completed restart-eligible `base_stop` draining generation and current route/install/credential/package/trust tuple; prepare local service while still fenced, revalidate the full current tuple, then atomically elect a new `active` lifecycle generation; any intervening security/package/install/lifecycle change makes the old request stale/conflicting |
| compatible in-place update | stage + verify under current trust, drain/quiesce, preserve old/new recovery provenance, migrate compatible state, elect a fresh higher `packageActivationGeneration`, then activate exactly one matching local service; may preserve `installationGeneration` |
| rollback / supported downgrade | another forward higher package activation under the current `trustPolicyGeneration`; never restore older package/trust generations or infer authority from old files |
| reinstall / stale restore / clone | install predecessor admission fence, require exact positive predecessor quiescence when physical ambiguity exists, mint a new `installationGeneration` and fresh package activation, never adopt predecessor live handles or treat copied state/credential as current |
| machine replacement | new installation generation; stable route reuse requires predecessor admission fence plus baseline-supported predecessor quiescence; replacement-machine boot does not prove old-host absence |
| normal `uninstall` | persist/reconcile the authenticated uninstall request and elect an uninstall-owned draining lifecycle generation even when already stopped/draining, positively quiesce and release matching physical capacity, then commit final installation/package/credential revocation plus a new final `revoked` lifecycle generation, reconcile secret retirement, and remove service/payload only after deletion barriers close |
| reboot | may support same-host predecessor-boot process-absence proof under Section 9.5; cannot prove semantic failure/success or external-effect/result resolution |
| unsupported downgrade | fail before registration/connect/activation unless the current trust/state compatibility rule admits it as the forward rollback transition above |

### 10.1 Base stop and restart

Base `stop` is **graceful drain-only**. It does not gain unspecified authority to kill ambiguous predecessor work. A legal stop starts only from the exact current active `lifecycleGeneration` and atomically elects a **new draining lifecycle generation before local quiescence**. The successful transition receipt records `base_stop` as its cause. That product-side fence races at the existing `AgentDeliveryAuthority` boundary with Agent executable authorization: if the drain election wins, no later authorization/new physical send may cross under the predecessor lifecycle generation; if Agent authorization wins first, its possible physical work remains held and must be positively settled before stop can succeed.

Stop succeeds only after positive quiescence for every live/held operation in scope and independent verification that the package service/supervisor is stopped. Only that completed `base_stop` draining generation is restart-eligible. A draining generation created by update, uninstall, reinstall/replacement or another lifecycle/security transition is not restart-eligible merely because its disposition is `draining`. Installation, credential, package activation and admitted trust authority may remain current across a completed base stop, so restart does not require re-registration.

A legal `start` is an independently authenticated, replay-safe `draining -> active` management transition. It is **restart-only** and is invalid while the D0027 route state is `UNREGISTERED` or `GENESIS_PENDING`; the first executable election uses Section 7.4 `initial_activate` instead. The request binds the exact completed restart-eligible draining `lifecycleGeneration`, exact `base_stop` receipt/cause and the exact current route, installation, credential, package activation/manifest and trust-state tuple. Local package/service/supervisor preparation occurs while product executable admission remains fenced/draining. Immediately before activation, the same per-route `AgentDeliveryAuthority` revalidates that full tuple and that no conflicting/nonterminal lifecycle transaction exists, then atomically elects a **new active lifecycle generation**. An intervening credential, package, trust, installation or lifecycle change, reinstall, uninstall or newer stop makes the old start request stale/conflicting; it is reconciled or newly admitted rather than silently rebound. Predecessor live handles are never adopted.

Emergency security revocation is a separate transition: trust revocation may fence new authority even without changing lifecycle disposition; when an emergency/security operation does change product lifecycle disposition it uses a new lifecycle generation. Neither form can claim cleanup or stop success without the same physical evidence.

### 10.2 Update and rollback cutover

Before an update can change current election, the management journal durably records the current and candidate manifest, schema, trust generation, package activation, credential binding and service-registration provenance needed for deterministic resume or rollback. The candidate is staged and verified under current trust before draining the predecessor.

After required quiescence and migration, the product elects a fresh higher `packageActivationGeneration` for the exact candidate manifest and the local package/service election must match it before executable activation. Two package/service generations cannot both be executable-current. A crash at any cutover boundary recovers only as resume, forward rollback, fenced/held or fail-closed according to durable state; it cannot select by filesystem/process observation.

Post-election rollback is another forward higher package activation under the current trust policy. It may reactivate previous bytes only if their manifest/schema are currently admitted; it never lowers `packageActivationGeneration` or `trustPolicyGeneration` and never restores a retired credential by copying old local state.

### 10.3 Reinstall, stale restore and machine replacement

An unclean reinstall, lost package journal, stale restore/clone or replacement first installs a product-side predecessor admission fence so no new predecessor dispatch is legal. If predecessor physical work is ambiguous, successor executable activation waits for a Section 9.5 positive quiescence receipt; fencing alone, timeout or disappearance is insufficient.

The successor receives a new non-reused `installationGeneration` and fresh higher `packageActivationGeneration`. The supported profile's clone-safe activation property must distinguish a copied predecessor even when every backup-eligible package/journal byte and a usable copyable data-plane credential were copied. A successor never adopts predecessor live handles.

### 10.4 Normal uninstall and residual authority

Normal uninstall is a crash-safe management transaction, not `rm -rf` semantics:

1. durably create/reconcile the exact authenticated uninstall request and elect a new uninstall-owned draining `lifecycleGeneration` even when the predecessor is an already-completed restart-eligible stop drain, thereby invalidating every delayed start for that older lifecycle generation;
2. stop new executable admission and obtain positive quiescence for all matching physical work;
3. let `AgentDeliveryAuthority` release only matching physical capacity from accepted positive evidence;
4. commit final product-side installation/package/credential revocation and a new final `revoked` lifecycle generation while preserving the management/replay record needed to reconcile response loss;
5. reconcile external and local secret retirement without requiring secret bytes in product state;
6. remove service registration and package payload only after no required cleanup/replay/recovery evidence is being destroyed;
7. report success only when product authority is revoked, physical cleanup is positively resolved, and the supported local service/payload absence contract is verified.

Ambiguous cleanup or a lost response leaves uninstall fenced/held and replayable; package/service disappearance alone is not success or capacity release. Product-side generation high-water/tombstone state survives uninstall so stale restore/reinstall cannot resurrect predecessor authority. Non-secret residual configuration/diagnostics may be retained or purged as an implementation choice only when retained state is explicitly non-authoritative on reinstall.

### 10.5 Durable retention, bounded GC and deletion barriers

Detailed management/provisioning receipts, old manifests and local recovery records need not be retained forever, but compaction is legal only after the corresponding safety barrier closes:

- a surviving monotonic request/generation floor, closed namespace/window, tombstone/digest or equivalent must make GC'd predecessor management requests stale and non-creating;
- installation, credential, package-activation, trust and lifecycle generation/high-water non-reuse fences survive local deletion, reinstall, stale restore and machine replacement;
- exact predecessor scope remains addressable while any held physical slot can still be released by late positive quiescence evidence;
- old manifest/schema/trust/service-registration provenance survives while any supported resume/rollback path can require it;
- retained old provenance is historical/recovery input and can never independently re-elect itself current;
- TTL, quota or storage pressure that cannot satisfy these barriers fails closed rather than converting uncertainty to success, resurrecting stale authority or releasing capacity.

Every durable local/product format still has an explicit version, accepted predecessor set, validation, migration owner and rollback barrier. State recreation is not rollback when it can forget a live predecessor, replay fence or non-reused generation.

## 11. Failure, cancellation and response-loss semantics

- Case cancellation remains serialized against Agent dispatch by the Case-owned D0020 `grant_attempt_dispatch` boundary. The local package cannot invent a semantic cancellation winner.
- A local cancel request may stop a positively owned warden/process group, but cancellation acknowledgement is not `cleanup_complete` until positive resource absence exists.
- Lost management/provisioning/lifecycle responses reconcile through the exact stable request/provisioning identity and immutable result receipt or surviving closed-namespace/high-water/tombstone fence; blind re-enrollment/remint/re-execution is forbidden. A GC'd trust/lifecycle predecessor identity is stale/non-creating, never implicitly fresh, and an ambiguous local service effect is reconciled rather than blindly repeated.
- Lost/crashed genesis registration or `initial_activate` resumes the exact Section 7.4 `GENESIS_PENDING` identity and fixed candidates; it never infers `UNREGISTERED` from local absence, remints candidates on replay or uses ordinary base `start` to escape pending state.
- D0020 connect/delivery response loss keeps its existing logical-connection, socket-incarnation, delivery and replay rules; D0027 may not create a parallel replay protocol. A lost or ambiguous Section 6.8 first-emission admission never yields another `maySend`; after admission, uncertainty remains possible execution until positive D0020 evidence refines it.
- Revocation, disconnect, timeout, package/service disappearance, registry age or machine disappearance cannot turn uncertain execution into known failure or release capacity.
- A corrupt/missing local operation or management journal, incompatible package/state version, product/local package-election mismatch, missing pidfd primitive, failed package signature/current-trust check or denied root/tool/network capability fails closed before new executable dispatch.
- A storage/retention bound that cannot compact safely under Section 10.5 fails closed; it cannot delete the last replay/non-reuse/predecessor/rollback evidence and continue as success.
- A package-owned diagnostic may report uncertainty and held resources; diagnostics do not become semantic Task/Attempt truth.

## 12. Rejected alternatives and tradeoffs

### Reuse `routeGeneration`, `connectionEpoch`, `executorEpoch` or machine identity as installation identity

Rejected. Those values have different lifetimes and owners. Reinstall/clone/replacement would otherwise inherit stale executable authority or force unrelated D0020 epochs to carry installation semantics.

### Keep one deployment-wide shared HMAC key as the final Agent credential

Rejected as the D0027 final shape. A qualification key may prove authenticated routing, but the supported installation boundary requires route/install-scoped least authority, independent generation/revocation and already-open-session fencing. The concrete credential primitive remains a deployment/security implementation choice.

### Let data-plane credential possession or D0024 identity authorize Agent management

Rejected. Management transitions change installation/credential/package/trust authority and require an independently authenticated SECURITY-owned management proof bound to the exact request and predecessor state. Knowing or possessing a data-plane credential, D0020 identifier or MCP identity does not imply that authority.

### Reuse `credentialGeneration` as the package-version/current-package fence

Rejected. Credential and package activation have different lifetimes. Every package change advances a distinct `packageActivationGeneration`; a concrete clone-safe mechanism may choose to mint a fresh credential as proof, but the Design does not force credential rotation merely to encode package version.

### Persist PID/PGID/starttime and signal it after supervisor restart

Rejected. Numeric/process metadata is not a stable live kernel handle and can be recycled. It is provenance only after the process that held the live pidfd dies.

### Put a durable Task queue or second capacity ledger in the local supervisor

Rejected. D0020 deliberately owns delivery/capacity/reservation state and CaseDO owns semantic Task lifecycle. The supervisor owns only local physical resources and evidence.

### Treat reboot, disconnect or supervisor death as cleanup/effect resolution

Rejected. Same-host reboot under established host continuity can prove only that predecessor-boot processes are absent. Replacement-machine boot, timeout, inaccessibility, disappearance or an unscoped operator assertion is not baseline quiescence. Semantic/external-effect uncertainty remains with the existing Case/reconciliation owners.

### Put current trust election in SECURITY/DEPLOYMENT prose, a separate registry or local package state

Rejected. SECURITY owns abstract trust/disposition meaning and DEPLOYMENT owns concrete material/wiring, but one route-current runtime trust value is durable substate of the existing per-route `AgentDeliveryAuthority`. A second registry or local self-election would create competing current authority and cross-owner races against package/session/start/dispatch admission.

### Treat `authorizeDispatch` or a final tuple check as a transferable send permit

Rejected. Durable Agent authorization precedes physical send and can be followed by a D0027 trust/lifecycle/current-tuple fence. Section 6.8 therefore requires one same-owner one-shot emission admission whose winner remains inside the serialization/exclusion boundary through the single immediate send initiation. A cached/transferable permit recreates the exact delayed-send race J3 forbids.

### Infer first registration from local absence or use base `start` as genesis

Rejected. Filesystem/service/credential absence cannot prove a route has no D0027 authority history, and ordinary base `start` requires a completed restart-eligible `base_stop` predecessor that fresh installation does not have. Section 7.4 uses one route-scoped `UNREGISTERED -> GENESIS_PENDING -> CURRENT` owner transaction with durable non-reuse/replay fences and distinct `initial_activate` semantics.

### Use lifecycle disposition or installation/credential/package/trust generations as the restart predecessor

Rejected. Base stop/start may preserve all of those security/package generations, so `active -> draining -> active -> draining` can recreate the same apparent predecessor and admit a delayed old start. A distinct positive non-reused `lifecycleGeneration` (or semantically identical route-current lifecycle epoch) advances on every product-side lifecycle mutation and is required in predecessor matching.

### Let local service/process state elect product lifecycle authority

Rejected. Service start/stop, supervisor control, secret retirement and payload deletion are subordinate journaled effects. They may prove local readiness/absence but cannot elect product `active`, `draining`, `revoked`, current trust or capacity state after response loss or crash.

### Make base `stop` an unspecified destructive cancellation

Rejected. Base stop is graceful drain-only and can succeed only from positive quiescence plus verified service stop. Emergency revocation and any future stronger destructive operator action remain separately authorized transitions.

### Delete receipts, tombstones or rollback provenance as part of uninstall

Rejected. Payload deletion cannot erase the only non-reuse/replay fence, held-predecessor locator or supported recovery/rollback provenance. Those records may compact only behind the Section 10.5 safety barriers.

### Require cgroup/PID-namespace sandboxing on the baseline Android profile

Not selected. The observed profile did not expose writable cgroup ownership or unprivileged user/PID namespaces. Revision 1 instead limits support to admitted tools that stay inside the warden cleanup domain. A stronger hostile-process sandbox is a separate security/authority decision if later required.

### Fold MCP auth, canonical Git publication, whole deployment or operations into D0027

Rejected. D0024, D0025, D0026 and D0028 are independently decidable owner boundaries. D0027 exposes only the local-Agent interfaces they may later consume.

The tradeoff is conservative capacity hold and possible reboot/quiescence requirements after supervisor/journal loss. The benefit is that stale or ambiguous local resources cannot be converted into false cleanup or destructive control of unrelated processes.

## 13. Acceptance and verification matrix

This matrix defines the evidence the eventual implementation must produce. Design `accepted` status approves the falsifiable contract; it does not claim these executable rows have already passed. `verified` requires the rows applicable to the maintained implementation and claimed environment to be independently observed at their named proof layers.

| Gate | Required result / proof layer |
| --- | --- |
| owner closure | exact Design review proves the owner table has no second Case/delivery/capacity/current-trust/lifecycle owner, provisional planning label as product authority, or unresolved management/trust/lifetime/rollback policy choice |
| management admission + replay | Design/source/security tests deny every non-management proof class with zero mutation across register/replace/rotate/revoke/package/trust and product-side stop/start/uninstall; exact request replay is idempotent, changed-intent/predecessor reuse conflicts, and ancient trust/lifecycle replay after detailed receipt GC is stale/non-creating under the surviving bounded fence |
| identity / clone / package activation | model/security tests cover non-reused installation/credential/package-activation/trust/lifecycle/supervisor/operation generations, prove copied backup-eligible state plus usable data-plane credential cannot self-elect a clone, reject stale lifecycle predecessors after repeated stop/start, and prove a predecessor package is stale after a successful package change |
| two-sided provisioning | crash/response-loss injection at verifier preparation, local secret readiness and current election proves a candidate is non-executable until both exact readiness receipts exist and recovery never blind-remints/reuses a candidate generation |
| route-current release trust | Design/state tests prove only the existing per-route `AgentDeliveryAuthority` elects current non-secret trust state; every non-replay trust mutation advances `trustPolicyGeneration`; retired trust cannot authorize new activation and existing-activation continuation is explicit/current/fail-closed; revoked trust denies new dependent package/connect/start/dispatch authority; trust mutation races package/session/start/dispatch through one current-state serialization point and never fabricates cleanup/capacity release |
| release trust lifecycle | fresh bootstrap proves the initial trust source is independently authenticated; rollover/revocation plus old-local-trust restoration proves retired/revoked trust cannot recreate/lower current authority; rollback is a forward activation under current trust |
| registration/revocation | security/provider tests prove one route-scoped installation principal, exact response-loss reconciliation, coordinated rotation/emergency revocation and denial of already-open predecessor sockets before delivery mutation or new dispatch |
| fresh-machine package | a genuinely fresh supported Android/Termux profile with no tdev checkout/tmcp setup obtains a provenance-bound package, establishes current trust, feature-probes required capabilities, provisions separated config/secrets and registers successfully |
| pidfd support | every claimed machine profile positively proves `pidfd_open`/`pidfd_send_signal`; absent/denied support fails closed with no PID destructive fallback |
| durable-before-create | crash injection at PREPARED, warden creation/pidfd acquisition, ACTIVE, GO_ALLOWED and GO proves no Task/tool effect starts before the durable barrier and no crash is rewritten as historical `no_handle` |
| control restart | Agent control/transport death and restart reconnects to the same supervisor/operation without duplicate launch or invented cleanup |
| supervisor death | replacement supervisor advances generation, quarantines predecessor records, never signals/adopts from stored PID/PGID, and preserves conservative capacity until positive absence/quiescence |
| predecessor quiescence | exact tests admit only live-owner, qualified same-host same-boot whole-domain absence, or same-host reboot-with-continuity baseline receipts; timeout/disappearance/replacement-machine boot/unscoped operator assertion fail and a valid receipt releases only its exact predecessor slot without reviving stale authority |
| cleanup domain | timeout/cancel/normal completion and descendant creation for every supported tool profile prove that package-owned resources remain in the warden cleanup domain and `cleanup_complete` follows positive absence only |
| path/tool/network denial | denied root, symlink escape, executable/argv/environment/resource/network expansion and credential misuse produce zero unauthorized local effect |
| D0020 composition | deployed CaseDO + `AgentDeliveryAuthority` + authenticated local Agent preserves running-before-dispatch, `grant_attempt_dispatch`, aggregate capacity, reservation, stale delivery and cleanup evidence ownership with no local durable Task queue |
| first-emission admission / J3 | Design/state/source tests place a trust/lifecycle/current-tuple fence between durable Agent authorization and physical send: fence-first makes the predecessor authorization permanently non-emitting; admission-first permits at most one immediate send initiation and remains possible execution; exact admission replay never sends twice; reconnect/socket-incarnation/executor/security-tuple change before admission rejects the predecessor; cancellation/revocation/fence never fabricates absence or capacity release |
| route genesis / J4 | a D0020-only route begins from one authoritative non-executable `UNREGISTERED` predecessor; concurrent registration has exactly one `GENESIS_PENDING` winner with fixed non-reused candidates; crash/response loss at every staging/final-election boundary reconciles the same request; candidate trust/package/credential/readiness cannot self-elect; mutation/mismatch before final election stays non-executable; `initial_activate` atomically elects the first complete `CURRENT` tuple only after required predecessor quiescence; base `start` fails from genesis states; failed/GC'd/stale-restored genesis cannot resurrect or reuse authority |
| lifecycle generation / start | repeated `active -> draining -> active -> draining` advances a positive non-reused `lifecycleGeneration`; a delayed start bound to the first drain fails predecessor matching, update/uninstall/security drains are not restart-eligible, a legal restart remains fenced during local preparation then revalidates route/install/credential/package/trust/lifecycle before atomically electing a new active generation, and genesis uses only the separate `initial_activate` path |
| base stop | drain-only stop elects a new draining lifecycle generation before local quiescence, races correctly against Agent authorization/send, preserves management authority, reports success only after positive quiescence plus verified service stop, and makes only the completed `base_stop` drain restart-eligible |
| reinstall/replacement | predecessor admission is fenced, new `installationGeneration` + package activation are elected, copied/stale state never self-elects, old handles are never adopted and ambiguous predecessor capacity waits for positive quiescence |
| update/rollback cutover | crash injection before/after staging, drain/quiescence, migration, product election and local service election leaves exactly one current package/service or a deterministic fenced/held recovery; rollback is a higher forward activation under current trust |
| uninstall | crash/response-loss injection at drain, quiescence/capacity release, final revocation, secret retirement and payload deletion proves no premature success, no lost reconciliation path and no stale-authority resurrection after reinstall |
| durable GC / non-resurrection | compact exact management/auth/package detail, then replay ancient requests, deliver late predecessor quiescence, restore stale local state and exercise supported rollback; surviving floors/tombstones/locators/provenance must classify each deterministically, and unsafe quota/TTL pressure must fail closed |
| secret exclusion | repository, semantic state, evidence, package manifest, receipts, logs/diagnostics and model-visible context contain no credential secret values or clear provider secret material |
| proof separation | Design/source, fresh-machine, provider/security, migration/rollback and deployed-composition results are recorded independently; no lower/predecessor evidence is promoted into D0027 installability/verification |
| D0035 predecessor | later self-hosting proof consumes the verified D0027 installed-Agent path as one prerequisite without treating D0027 as tmcp-retirement or whole-MVP proof |

## 14. Cheapest falsifiers

Before expensive whole-product qualification, the cheapest decisive failures are:

1. a data-plane credential, D0020 identifier or D0024 identity can authorize `register`/`replace`/`rotate`/`revoke`/package/trust or product-side `stop`/`start`/`uninstall` mutation, or denied management proof mutates durable state;
2. exact management request replay mints another generation/effect, changed-intent reuse succeeds, or an ancient request becomes fresh after detailed receipt GC;
3. reinstall/restore/clone with copied package/journal plus a usable predecessor credential can become current without an independent clone-safe activation, or a pre-update package remains authoritative after package activation advances;
4. one-sided credential readiness can become current, or a lost provisioning response causes blind remint/reuse rather than reconciliation of one stable provisioning identity;
5. a package/channel can authenticate its own bootstrap trust root, a second/local/prose owner can elect current trust, a non-replay trust mutation reuses `trustPolicyGeneration`, restoring old local trust lowers current authority, retired trust implicitly authorizes new activation, or revoked trust still grants new dependent package/connect/start/dispatch authority;
6. after credential/package revocation an already-open predecessor socket can still read/mutate delivery state or receive a new dispatch authorization;
7. any Task/tool effect can start before PREPARED/ACTIVE/GO_ALLOWED durability or a crash in that window is later reported as known `no_handle`;
8. after supervisor restart the implementation uses stored PID/PGID/path/name as destructive authority or can signal an unrelated recycled process;
9. a supported tool escapes the claimed warden cleanup domain and capacity is nevertheless released as `cleanup_complete`;
10. timeout, replacement-machine reboot, inaccessibility, disappearance, registry age or unscoped operator assertion releases predecessor physical capacity without one exact baseline-positive quiescence receipt;
11. base `stop` reports success while live/ambiguous work remains, fails to elect a new draining `lifecycleGeneration` before local quiescence, permits post-fence new Agent send, or silently gains destructive cancellation authority beyond its graceful drain contract;
12. interrupted uninstall deletes the only management/replay/predecessor evidence before positive cleanup + final revocation can be reconciled, or package/service disappearance is treated as capacity release/success;
13. an interrupted update leaves two executable package/service elections current, or current authority is reconstructed from filesystem recency, timestamp or process presence;
14. rollback lowers `packageActivationGeneration`/`trustPolicyGeneration`, reactivates a stale credential by copying old state, or requires provenance the destructive path was allowed to delete;
15. auth/install detail compaction makes a still-held predecessor slot unaddressable so valid late positive quiescence must be guessed/rejected or releases the wrong slot;
16. quota/TTL/storage pressure deletes the final replay/non-reuse/rollback fence and the system nevertheless reports success, resurrects stale authority or releases capacity;
17. ordinary D0027 Agent credentials can perform canonical remote Git publication or MCP user/tenant authority;
18. a claimed profile without pidfd support silently falls back to PID signaling;
19. incompatible downgrade or unclean reinstall activates executable work while newer/ambiguous predecessor state remains unfenced;
20. a fresh supported installation requires an existing tdev checkout, tmcp Task/worktree state, ambient developer helper, runtime download of an unbound helper or an unverifiable package/trust artifact;
21. trust revocation racing package activation, connect/reattach, start or Agent dispatch allows both incompatible predecessor/current authority commits to succeed instead of exactly one current-state winner;
22. `active -> draining -> active -> draining` followed by a delayed start for the first drain succeeds because lifecycle disposition/security generations recreate an ABA predecessor instead of failing `lifecycleGeneration` matching;
23. start from an update/uninstall/security-created drain becomes active, or a start admitted before an intervening credential/package/trust/install/lifecycle change silently rebinds instead of failing final current-state revalidation;
24. lost/replayed stop/start/uninstall response advances lifecycle authority twice, repeats a destructive/local service effect blindly, or loses the only reconciliation receipt/fence;
25. uninstall begun from a completed restart-eligible stop drain does not first advance to a new uninstall-owned draining generation, allowing a delayed predecessor start to revive authority during uninstall;
26. `authorizeDispatch` under an old D0027 tuple commits, a relevant trust/lifecycle/current-tuple fence advances, and a delayed first-emission admission or physical send still succeeds under the predecessor authorization;
27. first-emission admission wins before a later fence but permits more than one physical-send initiation, or the later fence rewrites that winner into known `positively_not_sent`/`not_started`/`no_handle` or releases capacity without positive D0020 evidence;
28. control crashes, the admission response is lost, or `socket.send` becomes ambiguous after first-emission admission and exact replay obtains another `maySend` or second physical send attempt;
29. connection/socket-incarnation, executor, installation, credential, package activation, trust or lifecycle changes after Agent authorization but before first-emission admission and the predecessor admission still succeeds;
30. a later dispatch ordinal after uncertainty omits D0020 safe-replay proof, a fresh Case `grant_attempt_dispatch`, fresh Agent authorization or a fresh current-tuple first-emission admission;
31. a fresh D0020 route with no D0027 current tuple lacks one authoritative non-executable `UNREGISTERED` predecessor, or local file/service/credential absence can manufacture that state;
32. two distinct concurrent first-registration intents can both create `GENESIS_PENDING` or `CURRENT` authority for the same route;
33. crash or response loss at any `UNREGISTERED -> GENESIS_PENDING` staging boundary or the `GENESIS_PENDING -> CURRENT` election remints candidate generations, chooses by local recency or repeats the first election instead of reconciling the same request;
34. candidate trust/package/credential/readiness mismatch or an intervening route/security mutation before final election silently rebinds the pending request or leaves any executable partial tuple;
35. a failed/abandoned genesis attempt reuses any candidate generation, or bounded detail GC forgets the monotonic genesis fence so an ancient request becomes fresh/creating;
36. stale restore, clone, local deletion or reinstall after a successful current election recreates the pristine `UNREGISTERED` path;
37. ordinary base `start` succeeds from `UNREGISTERED` or `GENESIS_PENDING`, or the first active lifecycle election lacks the distinct `initial_activate` cause;
38. pre-existing live/ambiguous D0020 physical work is bypassed during first executable activation because the new installation, reboot, timeout, disconnect, disappearance or genesis/security fence is treated as predecessor cleanup/quiescence;
39. the J3/J4 correction creates a second Case/delivery/send/trust/lifecycle/capacity owner or claims D0027 implementation/provider/runtime proof from D0020 source shape or Design acceptance alone.

Failure of one falsifier blocks only the affected D0027 scope; it does not reopen D0020 unless the evidence directly invalidates D0020's maintained verified meaning.

## 15. Non-goals and follow-on gates

D0027 does not decide:

- D0021 cross-Case exclusion unless real workload evidence activates it;
- D0022 persistent shared content/artifact storage unless the deployed topology requires it;
- D0023 MCP schema/projection surface;
- D0024 supported MCP user/client/tenant authentication and authorization;
- D0025 canonical authenticated remote Git publication lane/location/credentials;
- D0026 whole Cloudflare/provider deployment, operator secret wiring and provider rollback;
- D0028 whole-product operations/runbooks;
- D0035 self-hosting/tmcp retirement;
- D0029 final Level-4 product qualification;
- an arbitrary hostile-process sandbox or platform parity outside accepted profiles;
- external model-provider egress/privacy/authentication.

Bounded D0023/D0024/D0025 research may proceed in parallel when it does not change D0027's owner assumptions by implication. D0026 executable credential/deployment proof and later D0035 composition consume D0027 after the required lifecycle gates close.

## 16. Accepted lifecycle and next gate

This file is the canonical maintained Revision-1 `accepted` Design for D0027. Acceptance fixes the normative Class-2 boundary above but does not itself implement, deploy, issue credentials, activate runtime state or make a WORKBOARD gate runnable.

Before implementation may become runnable:

1. the accepted decision remains subject to the normal `SDD.md` falsifier/reopen/revision rules; a semantic correction after this acceptance requires that lifecycle rather than silent implementation drift;
2. product owners changed by this accepted revision are synchronized before implementation according to `SDD.md`;
3. only then may `WORKBOARD.md` add/select D0027 when the current maintained status and dependencies authorize that exact implementation gate;
4. source, fresh-machine, provider/security, migration/rollback and deployed-composition proof remain separate later layers and cannot be inferred from Design acceptance.

Until owner synchronization and a later explicit WORKBOARD routing transition close, the repository's current runnable frontier and selected next action remain unchanged.
