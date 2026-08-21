# Design 0027 — Installable Authenticated Local Agent

- Status: `draft`
- Revision: 1
- Class: 2
- Decision date: 2026-08-22
- Active cumulative lineage: resolved from `WORKBOARD.md`; drafted from `development@09d7dfa889e7c974013eb231f20bd28f0263ee7b`
- Trigger: post-D0020 forward-design review plus direct user application decision to turn the surviving boundary into a target-native Design
- Affected owners: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, local-Agent package/runtime owners, the D0020 `AgentDeliveryAuthority` integration boundary, and the derived Design index
- Product/runtime semantics: proposes the supported installable authenticated local-Agent package, installation-principal, bounded local-effect and crash/orphan-recovery contract; this draft authorizes no source implementation, provider mutation, credential issuance, deployment or runtime activation
- Explicit non-goals: no D0020 reopen; no MCP user/client/tenant authentication ownership from D0024; no canonical remote Git publication ownership from D0025; no whole-provider deployment/secret-distribution ownership from D0026; no D0028 operations ownership; no D0035 self-hosting/tmcp-retirement completion; no arbitrary hostile-process sandbox; no external model-provider admission

## 1. One-line definition

A supported fresh Android/Termux machine can install and verify one provenance-bound tdev Agent package, register one non-reused installation principal against an existing D0020 stable Agent route, execute bounded package-owned local work through a crash-safe supervisor/warden lifecycle, and reconnect, rotate, revoke, update, reinstall or replace that installation without stale authority or invented physical-cleanup evidence.

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

The final local-Agent boundary needs two new kinds of identity that D0020 intentionally does not own: an installation incarnation that survives ordinary process restart but not reinstall/replacement, and a credential generation that can revoke an already-connected predecessor. Those fences can remain an authentication substate of the existing `AgentDeliveryAuthority`; creating a second delivery/capacity owner is unnecessary and forbidden.

Crash-safe physical ownership also requires a live kernel identity held by a package-owned process that survives control/transport-process restart. Persisted PID/PGID metadata alone is insufficient destructive authority after owner restart because numeric process identifiers can be reused.

### Unknowns and bounded implementation choices

The following are not current repository facts and remain future implementation/deployment choices inside the contract below:

- the exact credential primitive and secure local secret-storage backend;
- the package container/transport format, release-signing algorithm and concrete release channel;
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
| current `installationGeneration`, current `credentialGeneration`, active/draining/revoked election and idempotent registration/rotation/replacement receipts | D0027 authentication-fence substate inside the existing `AgentDeliveryAuthority` | a second Agent registry/queue/capacity owner |
| credential secret issuance/storage/distribution and provider/operator wiring | D0026/deployment-security wiring | Case semantic state, delivery receipts, repository/evidence/model state |
| actual local process/resource ownership and cleanup evidence | D0027 package-owned execution supervisor + per-operation warden | CaseDO, `AgentDeliveryAuthority` physical inference |
| supported MCP user/client authentication and tenant/Case authorization | D0024 | Agent installation credential |
| canonical authenticated remote Git publication | D0025 | ordinary D0027 Task execution |
| whole provider deployment/configuration/rollback | D0026 | local package lifecycle |
| deployed operational outage/recovery runbooks | D0028 | D0027 package semantics |
| self-hosting and tmcp retirement proof | D0035 | D0027 alone |

The `AgentDeliveryAuthority` remains one owner: D0027 adds only the authentication election/fence needed before its existing delivery state can be used. Secret bytes are never stored in this substate.

## 5. Identity and durable state model

### 5.1 Identity axes

D0027 requires these identities to remain distinct:

- `agentId` — stable logical Agent endpoint selected by the existing route-binding owner;
- `routeGeneration` — positive non-reused generation of that stable route;
- `installationGeneration` — positive non-reused incarnation of one installed Agent package identity on that route;
- `credentialGeneration` — current credential generation for one installation;
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
- current `installationGeneration` and `credentialGeneration` identifiers/receipts;
- immutable package-manifest/configuration digests;
- local state-schema version and supported predecessor rule;
- `supervisorGeneration` and `operationGeneration` high-water values;
- idempotent registration/rotation/replacement request/receipt identities;
- durable local operation-journal records defined in Section 9.

Secret material lives only behind the selected local credential backend and is referenced indirectly. The local record must remain safe to include in bounded diagnostics after secret fields and deployment paths are excluded.

### 5.3 Lifetime rules

- ordinary control-process restart may preserve route/install/credential identity when the package-owned installation state is intact;
- real reconnect advances the D0020 connection generation; hibernation/reattach does not synthesize one;
- executor replacement advances `executorEpoch` and never reuses a tuple while stale input may exist;
- supervisor replacement advances `supervisorGeneration`;
- a compatible drained in-place package upgrade may preserve `installationGeneration`;
- reinstall, stale backup restore/clone, machine replacement or unclean package-state replacement requires a new `installationGeneration`;
- stable-route transfer to a new installation is legal only after an explicit predecessor fence; a new installation never adopts predecessor live handles.

## 6. Registration, authentication, rotation and revocation

### 6.1 Route prerequisite

D0027 does not create `agentId` or `routeGeneration`. The deployment owner first establishes the one supported D0020 `AgentRouteBinding`. Registration then attaches an installation principal to that exact route.

### 6.2 Authenticated principal contract

The deployment/security layer provisions a route-scoped per-install possession credential or equivalent verifier. Its exact secret mechanism belongs to D0026/deployment wiring, but it must authenticate the tuple:

```text
agentId
routeGeneration
installationGeneration
credentialGeneration
```

before externally reachable Agent connect/message/evidence/result handling consults delivery state.

The product-side authentication fence in `AgentDeliveryAuthority` persists current installation/credential generations and lifecycle (`active`, `draining`, `revoked`) plus immutable receipts. It stores no credential secret bytes.

### 6.3 Registration and replay

Registration/rotation/replacement commands use stable request IDs and an exact intent digest. For each request ID:

- the first successful transaction elects or advances the intended generation and records one immutable receipt;
- exact replay returns the same receipt without minting another generation;
- reuse with a different intent fails conflict;
- response loss is reconciled by replay/reread of that same request identity, never by choosing a current installation from a name, timestamp, connection recency or identifier possession.

A registration receipt binds the route, installation generation, credential generation, package-manifest compatibility identity and request/intent digest. It never contains the credential secret.

### 6.4 Per-message stale fence

Every accepted socket attachment/reattach, Agent message/evidence/result mutation and every D0020 dispatch-authorization commit must be bound to the current `installationGeneration` and `credentialGeneration`. A socket authenticated under a predecessor generation becomes unable to read or mutate delivery state or receive new executable dispatch immediately when the product fence advances or revokes that generation.

Transport connection existence is not an authorization cache that can survive a product-side generation change.

### 6.5 Rotation and emergency revocation

Coordinated credential rotation:

1. provisions a replacement secret through the deployment/security owner;
2. atomically advances `credentialGeneration` in the product-side fence and records the rotation receipt;
3. makes predecessor sockets product-inert;
4. reconnects under the new generation;
5. revokes/removes the predecessor secret in the external secret backend.

Emergency revocation performs the product-side fence first. It blocks new delivery mutations/dispatch immediately but does not imply that already-started physical effects are absent or that physical capacity can be released.

## 7. Package and fresh-machine bootstrap

### 7.1 Supported local profile

Revision 1 selects one baseline profile, `tdev.agent.termux.pidfd.v1`, with these required properties:

- Android/Termux environment with the package-declared CPU architecture;
- Node.js runtime satisfying the package's declared minimum (`>=22` at the drafting snapshot);
- a package-owned long-lived service host equivalent to the observed `termux-services`/runit profile;
- working `pidfd_open` and `pidfd_send_signal` for exact live-process identity/control;
- filesystem semantics sufficient to fsync the package-owned local operation journal and its containing directory where required.

Bootstrap must feature-probe these properties on the actual machine. Missing/denied/mismatched pidfd support or service/journal capability is `unsupported`; there is no automatic PID/PGID destructive-control fallback.

### 7.2 Immutable package identity

Every installable release has an immutable package manifest binding at least:

- package/release version and exact source revision;
- profile identifier;
- package file/helper digests and helper ABI/version;
- local durable-state schema version and predecessor compatibility range;
- Agent/D0020 protocol compatibility range;
- required runtime/service capabilities;
- non-secret configuration schema identity.

A fresh machine verifies the artifact/manifest against one pinned release trust root before registration. The concrete signature algorithm, signing key and release transport may vary by deployment, but unverifiable or mismatched artifacts fail before registration/connect and cannot consume a current Agent credential.

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

### 9.5 Cleanup and capacity evidence

While the original supervisor/warden ownership chain is live, the supervisor uses the live pidfd to observe/control the exact warden and the warden cleans its own admitted process group/resources. `cleanup_complete` is emitted only after positive owned-resource absence.

After supervisor loss:

- same-boot ambiguous predecessor records remain capacity-held;
- a replacement supervisor may release process capacity only from independently positive absence/quiescence evidence;
- a changed boot positively proves that predecessor-boot processes no longer exist, but proves nothing about an external effect/result beyond process absence;
- transport loss, supervisor death, cancellation, semantic Task terminality, registry age or machine disappearance alone never releases physical capacity.

`AgentDeliveryAuthority` remains the aggregate capacity/delivery owner. The local supervisor supplies only scoped physical-capacity/cleanup evidence and cannot create a second durable Task queue, reservation ledger or dispatch authority.

### 9.6 Cleanup-domain support limit

Every supported tool profile must prove that managed descendants remain in the warden's cleanup domain under normal completion, cancellation, timeout and the claimed crash cases. Arbitrary hostile process/session escape is not part of `tdev.agent.termux.pidfd.v1`. If a proposed tool can escape the process group/session in a way the baseline Android profile cannot positively contain or observe, that tool is unsupported until a stronger accepted isolation/security design and qualification exist.

## 10. Restart, reinstall, update, migration and rollback

| Transition | Required rule |
| --- | --- |
| control-process restart | preserve intact install/credential identity; reconnect to the same live supervisor; advance connection/executor generations when the corresponding volatile owner is replaced |
| real network reconnect | use D0020 real reconnect semantics and an advancing connection epoch; do not elect a new installation merely because the socket changed |
| supervisor restart | advance `supervisorGeneration`; quarantine predecessor nonterminal records; no stored-PID destructive adoption; conservatively account held capacity |
| credential rotation | atomically advance `credentialGeneration`, fence old sockets, reconnect under the new credential; unresolved physical work remains held |
| emergency credential revocation | product fence first; block new Agent mutations/dispatch; do not infer cleanup from revocation |
| compatible in-place upgrade | verify trusted manifest/compatibility, drain all live/ambiguous operations required by the migration, migrate versioned local state, then reactivate; may preserve `installationGeneration` |
| reinstall / stale restore / clone | fence/revoke predecessor, mint a new `installationGeneration`, never adopt predecessor live handles |
| machine replacement | treat as new installation generation; stable route reuse requires explicit predecessor fence and supported quiescence proof |
| reboot | may prove predecessor-boot process absence; cannot prove semantic failure/success or external-effect/result resolution |
| unsupported downgrade | fail before registration/connect unless an explicit compatible drained/fenced rollback state and predecessor rule are accepted and proved |

Every durable local format has an explicit version, accepted predecessor set, validation, migration owner and rollback barrier. State recreation is not rollback when it can forget a live predecessor or stale credential generation.

Unclean reinstall or loss of the package-owned operation journal requires predecessor installation fencing plus reboot or another independently positive quiescence proof before executable activation. The new installation must not assume the predecessor had no live handles.

## 11. Failure, cancellation and response-loss semantics

- Case cancellation remains serialized against Agent dispatch by the Case-owned D0020 `grant_attempt_dispatch` boundary. The local package cannot invent a semantic cancellation winner.
- A local cancel request may stop a positively owned warden/process group, but cancellation acknowledgement is not `cleanup_complete` until positive resource absence exists.
- Lost registration/rotation/replacement responses reconcile through the exact request ID and immutable receipt; blind re-enrollment is forbidden.
- D0020 connect/delivery response loss keeps its existing logical-connection, socket-incarnation, delivery and replay rules; D0027 may not create a parallel replay protocol.
- Revocation, disconnect, timeout or machine disappearance cannot turn uncertain execution into known failure or release capacity.
- A corrupt/missing local journal, incompatible package/state version, missing pidfd primitive, failed package signature/trust check or denied root/tool/network capability fails closed before new executable dispatch.
- A package-owned diagnostic may report uncertainty and held resources; diagnostics do not become semantic Task/Attempt truth.

## 12. Rejected alternatives and tradeoffs

### Reuse `routeGeneration`, `connectionEpoch`, `executorEpoch` or machine identity as installation identity

Rejected. Those values have different lifetimes and owners. Reinstall/clone/replacement would otherwise inherit stale executable authority or force unrelated D0020 epochs to carry installation semantics.

### Keep one deployment-wide shared HMAC key as the final Agent credential

Rejected as the D0027 final shape. A qualification key may prove authenticated routing, but the supported installation boundary requires route/install-scoped least authority, independent generation/revocation and already-open-session fencing. The concrete credential primitive remains a deployment/security implementation choice.

### Persist PID/PGID/starttime and signal it after supervisor restart

Rejected. Numeric/process metadata is not a stable live kernel handle and can be recycled. It is provenance only after the process that held the live pidfd dies.

### Put a durable Task queue or second capacity ledger in the local supervisor

Rejected. D0020 deliberately owns delivery/capacity/reservation state and CaseDO owns semantic Task lifecycle. The supervisor owns only local physical resources and evidence.

### Treat reboot, disconnect or supervisor death as cleanup/effect resolution

Rejected. Reboot can prove only that predecessor-boot processes are absent. Semantic/external-effect uncertainty remains with the existing Case/reconciliation owners.

### Require cgroup/PID-namespace sandboxing on the baseline Android profile

Not selected. The observed profile did not expose writable cgroup ownership or unprivileged user/PID namespaces. Revision 1 instead limits support to admitted tools that stay inside the warden cleanup domain. A stronger hostile-process sandbox is a separate security/authority decision if later required.

### Fold MCP auth, canonical Git publication, whole deployment or operations into D0027

Rejected. D0024, D0025, D0026 and D0028 are independently decidable owner boundaries. D0027 exposes only the local-Agent interfaces they may later consume.

The tradeoff is conservative capacity hold and possible reboot/quiescence requirements after supervisor/journal loss. The benefit is that stale or ambiguous local resources cannot be converted into false cleanup or destructive control of unrelated processes.

## 13. Acceptance and verification matrix

This matrix defines the evidence the eventual implementation must produce. Design `accepted` status approves the falsifiable contract; it does not claim these executable rows have already passed. `verified` requires the rows applicable to the maintained implementation and claimed environment to be independently observed at their named proof layers.

| Gate | Required result / proof layer |
| --- | --- |
| owner closure | exact review proves the owner table has no second Case, delivery/capacity, MCP-auth or publication owner and no open normative lifetime/rollback choice |
| identity model | source/model tests cover non-reused installation/credential/supervisor/operation generations and reject lifetime overloading, stale install replay and request-ID reuse with changed intent |
| registration/revocation | security/provider tests prove one route-scoped installation principal, exact response-loss replay, rotation/revocation and denial of already-open predecessor sockets before delivery mutation or new dispatch |
| fresh-machine package | a genuinely fresh supported Android/Termux profile with no tdev checkout/tmcp setup obtains a provenance-bound package, verifies the pinned trust root, feature-probes required capabilities, provisions separated config/secrets and registers successfully |
| pidfd support | every claimed machine profile positively proves `pidfd_open`/`pidfd_send_signal`; absent/denied support fails closed with no PID destructive fallback |
| durable-before-create | crash injection at PREPARED, warden creation/pidfd acquisition, ACTIVE, GO_ALLOWED and GO proves no Task/tool effect starts before the durable barrier and no crash is rewritten as historical `no_handle` |
| control restart | Agent control/transport death and restart reconnects to the same supervisor/operation without duplicate launch or invented cleanup |
| supervisor death | replacement supervisor advances generation, quarantines predecessor records, never signals/adopts from stored PID/PGID, and preserves conservative capacity until positive absence/quiescence |
| cleanup domain | timeout/cancel/normal completion and descendant creation for every supported tool profile prove that package-owned resources remain in the warden cleanup domain and `cleanup_complete` follows positive absence only |
| path/tool/network denial | denied root, symlink escape, executable/argv/environment/resource/network expansion and credential misuse produce zero unauthorized local effect |
| D0020 composition | deployed CaseDO + `AgentDeliveryAuthority` + authenticated local Agent preserves running-before-dispatch, `grant_attempt_dispatch`, aggregate capacity, reservation, stale delivery and cleanup evidence ownership with no local durable Task queue |
| reinstall/replacement | predecessor install/credential is fenced, new `installationGeneration` is minted, old handles are never adopted and unclean state loss requires positive quiescence before executable activation |
| update/downgrade | supported in-place update proves package/state compatibility plus drain/migration; every unclaimed downgrade fails before connect and cannot reuse newer credentials/state |
| secret exclusion | repository, semantic state, evidence, package manifest, logs/diagnostics and model-visible context contain no credential secret values or clear provider secret material |
| proof separation | source, fresh-machine, provider/security, migration/rollback and deployed-composition results are recorded independently; no D0020 predecessor evidence is promoted into D0027 installability/verification |
| D0035 predecessor | later self-hosting proof consumes the verified D0027 installed-Agent path as one prerequisite without treating D0027 as tmcp-retirement or whole-MVP proof |

## 14. Cheapest falsifiers

Before expensive whole-product qualification, the cheapest decisive failures are:

1. fresh install requires an existing repository checkout, tmcp state, ambient developer helper or unverifiable package artifact;
2. reinstall/restore/clone can reuse `installationGeneration` or a revoked credential and reconnect as current;
3. after credential revocation an already-open predecessor socket can still read/mutate delivery state or receive a new dispatch authorization;
4. any Task/tool effect can start before PREPARED/ACTIVE/GO_ALLOWED durability or a crash in that window is later reported as known `no_handle`;
5. after supervisor restart the implementation uses stored PID/PGID/path/name as destructive authority or can signal an unrelated recycled process;
6. a supported tool escapes the claimed warden cleanup domain and capacity is nevertheless released as `cleanup_complete`;
7. disconnect, supervisor death, cancellation, registry age or machine disappearance releases physical capacity without positive absence evidence;
8. ordinary D0027 Agent credentials can perform canonical remote Git publication or MCP user/tenant authority;
9. a claimed profile without pidfd support silently falls back to PID signaling;
10. incompatible downgrade or unclean reinstall activates executable work while newer/ambiguous predecessor state remains unfenced.

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

## 16. Draft lifecycle and next gate

This file is a Revision-1 `draft`. It is the canonical maintained Design proposal for D0027 but authorizes no Class-2 implementation.

Before implementation may become runnable:

1. exact-artifact Design review must attack the decisions, rejected alternatives, migration/rollback semantics, acceptance matrix and cheapest falsifiers above;
2. any correction changes this draft before acceptance; a semantic correction after acceptance requires the normal SDD revision/reopen rules;
3. only an `accepted` or `implementing` maintained revision may authorize source implementation;
4. product owners changed by the accepted revision are synchronized before or with implementation according to `SDD.md`;
5. `WORKBOARD.md` may add/select D0027 only after its current maintained revision/status actually authorizes the intended implementation gate.

Until those conditions hold, the repository's current runnable frontier and selected next action remain unchanged.
