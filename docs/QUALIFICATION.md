# tdev qualification

> Normative owner for how tdev claims are qualified. Product behavior remains in its product owner; current routing remains in `WORKBOARD.md`; observed results remain evidence/history.

## 1. Authority and scope

This document owns verification methodology and proof-layer boundaries. It does not redefine runtime product behavior, current Design status, the current development route, provider state or historical results.

The product milestone called the MVP remains defined by `docs/SPEC.md` and the final-MVP capability/exit program in `docs/ROADMAP.md`. Passing a lower qualification layer never implies Level-4 deployed-product completion.

## 2. Baseline source qualification gate

At the repository source-qualification gate, use this exact baseline sequence unless an accepted Design and this owner explicitly revise it:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

A non-green required command is not converted to success. If the execution environment cannot support a required primitive, report the affected environment/layer as unqualified and preserve the exact failure evidence. A supported subset can show bounded non-regression but does not substitute for the failed required layer.

Focused Design/provider gates may add evidence for their own scope; they do not silently weaken this baseline.

### Permanent executable qualification boundary

Repository-owned executable proof machinery that is **not** product/runtime source lives under top-level `qualification/` with semantic names. This directory is a navigation and execution boundary, not a new behavior owner: product and accepted Design owners still define behavior, while this document defines how the corresponding claims are qualified.

The baseline syntax gate must continue to discover `qualification/*.mjs`. Permanent regression tests remain under `test/`; genuine build/maintenance utilities remain under `tools/`; `bench/` is reserved for currently useful product/performance measurement rather than superseded decision research. Moving a proof executable never authorizes loss of its assertions, provider/runtime identity, rollback boundary or historical Design/evidence provenance.

Historical `Dxxxx` names may remain in Design/evidence/history records where chronology is provenance. Live qualification paths should use semantic names when the Design number is not itself a compatibility identity. Provider resource names, schema/profile/protocol generations, migration ordinals, workflow/check names or package paths with external consumers are changed only through their own consumer-safe lifecycle; source-path cleanup alone is not that authorization.

### D0030 publication-portability focused gate

D0030 production verification adds backend/deployment evidence without replacing the baseline source gate. On each declared rename target, build the package-owned helper **before runtime** with `npm run build:native:immutable-journal-publication --silent`, then run the D0030 focused falsifiers and the unchanged immutable-journal oracle through the selected backend. A rename-qualified independent POSIX row must also run the same oracle through hard-link where hard links are supported and execute repeated independent-process hard-link-versus-rename races against one final slot.

The deployment layer must install a real package copy without lifecycle-script dependence, verify the package-relative helper/manifest identity, and prove that helper absence or mismatch rejects a new authority write as `store_publication_unsupported` with no fallback. Restoring the exact helper and starting a fresh process must requalify and resume writes. The connected Termux/Android row and the independent POSIX/Linux row are separate evidence; neither profile generalizes to another filesystem/runtime by assertion. Destructive power-loss remains unverified unless separately executed.

The repository-owned independent POSIX method is `.github/workflows/immutable-journal-publication-posix-qualification.yml`. Its run is reusable evidence only when the workflow run, exact source SHA, Node/runtime/filesystem/compiler observations, helper/source digests, both backend oracles, mixed-race result and installed-copy recovery all bind the claim being reused.

### D0020 Agent delivery focused gates

D0020 implementation/verification adds focused Agent-delivery evidence without replacing the baseline source gate. The accepted Design owns behavior; this section owns the minimum falsifier shape for claiming that behavior at each proof layer. Until these gates are actually executed against an implementation and the claimed environments, D0020 remains unverified at those layers.

At the **source/model** layer, deterministic tests must at minimum falsify:

- aggregate Agent capacity across at least two Cases at capacity 1 and N, including saturation with no durable waiting Task or premature Attempt creation;
- capacity revision fencing with `4@7 -> 1@8 -> delayed 4@7`, same-revision conflicting values, reconnect freshness and executor replacement starting at capacity unknown/0;
- immutable reservation preflight/body/resource/envelope binding, with known oversized work rejected before a running Attempt exists;
- legal and illegal global delivery-evidence tuples, including historical not-sent/not-started/no-handle precision, whole-tuple monotonic refinement and conflict quarantine without semantic-result invention;
- reservation-window rollover/GC plus terminal-delivery retirement: safely released eligible detail is replaced by a bounded tombstone/high-water fence, tombstone GC requires an older permanently closed reservation generation plus replay grace, ancient exact/conflicting delivery/evidence observations remain non-creating after GC, and fresh admission continues beyond historical `maxDeliveries` completions without an unbounded ledger;
- `cancel_task` versus `grant_attempt_dispatch` ordering for cancel-first and grant-first, plus lost Case-grant response, lost Agent-authorization response, exact replay/conflict and no duplicate grant/ordinal/first-send authority;
- connection replacement/reconstruction and exact lost-connect-response replay: exact replay keeps the logical connection receipt/epoch, a distinct physical socket-incarnation fence makes a superseded same-logical-tuple socket close/message stale, Hibernation reconstruction preserves the bound incarnation, and activated-but-ungranted recovery remains fenced;
- forced execution-start failures on both sides of physical handle creation: positive historical `not_started`/`no_handle` is accepted only when no selected handle was ever created, while any post-creation failure must retain ownership until positive `cleanup_complete`; prove physical-slot release cannot precede that positive cleanup while effect/result uncertainty and Case reconciliation remain intact;
- every reconnect/recovery/response-loss path preserving one semantic Attempt owner and introducing no lower-layer semantic retry.

At the **provider/runtime** layer, use the actual claimed Durable Object/storage/WebSocket profile to prove one immutable `AgentRouteBinding` reaches exactly one writable `AgentDeliveryAuthority`; competing route bindings fail closed; hibernation/reconstruction of the same healthy logical connection does not synthesize a new epoch; exact lost-connect-response replay keeps that logical receipt while installing a fresh durable physical socket incarnation whose superseded predecessor close/message cannot clear the replacement; a real reconnect does advance the logical generation and starts the capacity-freshness barrier; stale sockets/executors remain fenced; Revision-1 durable state migrates forward fail closed; live reservation/admission/physical accounting, terminal-delivery retirement/tombstone high-water, reservation GC floors and ancient-replay non-resurrection survive owner reconstruction; fresh admission continues after safe historical-detail compaction; and dispatch/cancellation/response-loss races preserve the Case grant plus Agent authorization ordering. Provider namespace, jurisdiction, schema/config compatibility, finite durable limits and rollback barriers are part of the observation identity.

At the **local Agent/machine** layer, prove fresh per-Attempt execution, monotonic capacity/evidence revisions, exact executor/connection/delivery/fence matching, dispatch-ordinal duplicate suppression, command-driven cancellation/control and bounded descendant/process/resource cleanup. Force a real process/resource to cross the creation boundary and then fail before operation return: the Agent must not emit historical `not_started`/`no_handle`, must positively establish descendant/process-group disappearance before `cleanup_complete`, and physical capacity must remain held until that proof. Also prove the legal pre-handle no-handle path, effect evidence and absence of a hidden semantic retry queue. The machine profile, executable/package identity and credential boundary must be identified; this layer does not by itself prove provider authority.

At the **deployed-product** layer, compose the elected CaseDO semantic owner, one qualified `AgentDeliveryAuthority`, and an authenticated local Agent under concurrent multi-Case capacity, exact lost-connect-response replay plus superseded physical-socket close, reconnect/restart, stale-delivery/result, terminal-delivery retirement/ancient replay/continued fresh admission, cancellation/dispatch response-loss, forced post-creation cleanup/capacity ordering, physical-cleanup/effect-uncertainty and reconciliation conditions. Source, provider, local-machine and deployed-product evidence are independent proof layers; no one layer substitutes for another.

### D0027 installable Agent focused gates

D0027 implementation/verification adds focused installable-Agent evidence without replacing the baseline source gate or D0020 qualification. The accepted Design owns behavior; this section owns the minimum falsifier shape for claiming D0027 at each proof layer. Until these gates are actually executed against an implementation and the claimed environments, D0027 remains unverified at those layers.

At the **source/model** layer, deterministic tests must at minimum falsify:

- independently authenticated management admission: data-plane credentials, D0020 identifiers/grants and D0024 identities cannot authorize registration, replacement, credential/package/trust/lifecycle mutation; denial has zero durable/local effect;
- exact stable-request replay, changed-intent/predecessor conflict and non-reuse/GC fencing for `genesisGeneration`, `installationGeneration`, `credentialGeneration`, `packageActivationGeneration`, `trustPolicyGeneration` and `lifecycleGeneration`;
- J3 fence-first versus admission-first histories with the complete current tuple, serialization held through immediate send initiation, no transferable permit, no second `maySend` after response loss/ambiguous send, reconnect/current-tuple fencing and fresh authorization/admission for every later ordinal;
- J4 concurrent first registration, crash/lost response at each genesis staging/final-election boundary, fixed candidate mismatch, failed-candidate retirement, stale restore/clone/deletion, bounded GC non-resurrection, non-executable partial tuples and rejection of base `start` before `initial_activate`;
- stop/start lifecycle ABA, stop-before-quiescence fencing, start final revalidation, uninstall-owned draining from an already stopped route, response-loss replay, update/rollback/reinstall generation monotonicity and deletion barriers;
- supervisor durable-before-create PREPARED/ACTIVE/GO_ALLOWED ordering, post-create failure remaining held, live pidfd/warden-only destructive authority, stored-PID rejection after supervisor replacement and complete descendant/process-resource cleanup before `cleanup_complete`;
- legacy D0020-only predecessor quiescence: same-host same-boot whole-domain absence, scoped reboot proof, late evidence during `GENESIS_PENDING`, duplicate/stale evidence and missing-local-state histories may refine only the exact retained D0020 route + `deliveryId`/executor/evidence slot and otherwise keep activation blocked;
- repository/state/evidence/log/manifest/model-visible secret exclusion and proof-layer non-promotion.

At the **local Agent/machine** layer, install a real package copy on the exact supported fresh-machine profile without a tdev checkout, tmcp Task/worktree dependency, ambient developer helper or unbound runtime download. Prove package/service provenance, independently provisioned credential/trust inputs, clone-safe activation, control-process restart against the same supervisor, supervisor restart with no stored-PID destructive adoption, pidfd capability fail-closed behavior, warden descendant containment and positive cleanup under normal completion/cancellation/timeout/crash cases. Identify every package/helper/runtime/profile digest and the secret-storage boundary; this layer alone does not prove provider authority.

At the **provider/security** layer, prove the existing D0020 route reaches exactly one writable `AgentDeliveryAuthority` whose D0027 substate atomically owns current installation/credential/package/trust/lifecycle/genesis and first-emission admission. Exercise independently authenticated management denial, credential/trust rotation and revocation against already-open sockets, package/trust/lifecycle/dispatch races, replay/high-water/GC reconstruction and bounded storage. Concrete trust/credential/package wiring must match SECURITY/DEPLOYMENT ownership and secret values must remain outside durable semantic/evidence/model-visible state.

At the **deployment/migration/rollback** layer, execute supported legacy D0020-only initialization, interrupted genesis, reinstall/replacement, update, rollback and uninstall against exact versioned predecessor formats. Prove old writers cannot reactivate incompatible state, candidate generations never lower/reuse, a D0020 held slot remains addressable until matching positive quiescence arrives, unsafe missing locators keep capacity held, and payload/service/secret deletion never destroys the last required replay/recovery evidence.

At the **deployed-product** layer, compose the elected CaseDO owner, the verified D0020 `AgentDeliveryAuthority` and one authenticated installed D0027 Agent. Run concurrent multi-Case work through J3 first-emission fencing, J4 first activation, real stop/start/reconnect/revocation/update/uninstall/reinstall, process-owner crash, positive physical cleanup, response-loss reconciliation and stale restore/replay. Source, local-machine, provider/security, migration/rollback and deployed-product evidence are independent; no one layer substitutes for another.

## 3. Qualification layers

Keep proof layers separate:

1. **source/static** — syntax, deterministic repository behavior, source tests, source coverage and diff integrity;
2. **local runtime/adapter** — executable behavior in the exact declared local/platform profile;
3. **provider/runtime** — real provider ownership, persistence, restart, ambiguity and provider-policy behavior;
4. **security/client** — authentication, authorization, tenant isolation, secret handling and current supported-client behavior;
5. **deployment/migration/rollback** — package/configuration/deployability, fresh-environment setup, migration, rollback and recovery;
6. **final deployed product** — end-to-end Level-4 qualification required by `docs/ROADMAP.md`.

Evidence from one layer proves only that layer. In particular, local/source tests do not by themselves prove Durable Object/Worker/provider behavior, a real local-Agent process, remote D1/R2 behavior, secured MCP/current-client behavior, external side effects, deployment/migration/rollback safety, production capacity/SLOs or final deployed-product completion.

## 4. Evidence semantics

A positive qualification claim identifies the exact source/revision, execution environment/profile, command or falsifier, outcome and durable evidence when applicable. Skipped, unavailable, unsupported, stale or unexecuted evidence remains explicit and cannot be recorded as pass.

A previous pass is historical evidence, not timeless current status. Mutable current gaps belong in `WORKBOARD.md` or the responsible Design/product owner rather than this stable method owner. `docs/ROADMAP.md` owns stable unmet capability/exit criteria, not mutable current state.

When a required gate is impossible on the current environment, preserve both facts separately: what bounded subset did pass, and which required layer remains unqualified.

## 5. Qualification method catalog

The catalog below preserves the 78 pre-D0032 verification-method pairs exactly. Each row names a verification area and its cheapest falsifier. The behavior being tested is still owned by the applicable product/Design owner; this table owns the proof method, not the behavior.

| Area | Cheapest falsifier |
| --- | --- |
| immutable graph | mutate Plan / duplicate Task / unknown dependency / cycle |
| one Promotion | zero/multiple Promotion or incomplete full join |
| capacity degeneration | same graph at capacity 1 and N |
| scheduling/completion order | inverse executor timing and accepted-result order |
| executor identity | different executor IDs/epochs with valid envelopes |
| retry order | alternate retry interleavings |
| parallel admission | disjoint claims with barriers |
| Claim correctness | exact/reference oracle over randomized prefix sets |
| Claim lifecycle | acquire/release 2,000 unique paths |
| authority | one missing set in the capability intersection |
| complete fencing | stale epoch/token/identity/lease/scope |
| durable dispatch | inspect store before executor callback |
| checkpoint race | forced CAS loss before dispatch |
| accepted-result durability | inspect persistence and lease-release ordering |
| effect recovery | reopen each effect class / invalid external result |
| cancellation race | cancel before late success |
| blocker propagation | reverse-lexical topological chain and cancellation DAG |
| atomic mutation | fail after first Event / invalid reconciliation |
| full restore oracle | snapshot after every randomized transition |
| acceleration loss | delete/corrupt counters, ready set, claim-holder set |
| runner candidate loss | clear local ready candidates |
| Promotion safety | conflict/topology/path error |
| strict/canonical data | duplicate key, unsafe number, malformed UTF-8, noncanonical bytes |
| bounds | result/evidence/Event/receipt/snapshot overflow |
| snapshot integrity | digest/Event/result/index/state/blocker corruption |
| v1 migration | historical succeeded fixture |
| File store stale race | independent same-process instances |
| Journal stale race | warm stale instance after another instance commits |
| Journal concurrent race | independent same-process CAS calls |
| Immutable journal create race | independent Node processes / absent base |
| Immutable journal same-process race | independent instances / one expected revision |
| Immutable journal process race | independent Node processes / one expected revision |
| Immutable journal format migration | legacy prefix -> v2; v2 -> legacy |
| Immutable journal cutover | legacy/new adapters at one predecessor |
| Immutable journal full replay | historical semantic corruption / restart |
| Immutable warm namespace | warm instance then add malformed committed-looking name |
| Immutable warm base file type | warm instance then replace `base.json` with non-regular entry |
| warm-cache corruption | mutate durable base after load |
| Legacy journal record contents | recognized delta with malformed/noncanonical/truncated contents, missing base, replay corruption |
| Legacy committed namespace | malformed committed-looking `delta-*` name or recognized-name non-regular entry |
| Immutable committed namespace | malformed/unsafe committed-looking name or recognized non-regular authority slot |
| Immutable publication ambiguity | injected failure before/after the final-slot boundary |
| aggregate durable admission | individually legal Case components whose combined snapshot exceeds configured store bound |
| settlement checkpoint/Claim liveness | checkpoint exception after in-memory settlement and before terminal lease release |
| D0009 semantic equivalence | research model materializes a different tree/current digest |
| D0009 root determinism | rebuild/input/write history changes research root |
| D0009 hash collision | equal path-hash key aliases/losses complete paths |
| D0009 directory Merkle | one sparse write in a wide directory requires bounded metadata work |
| D0009 bounded sparse structures | C2/C3 1/8/128 update work scales with total tree entries |
| D0009 compatibility tax | research root removes need for current full-tree materialization/digest without migration |
| D0010 root/topology | rebuild/order/batch history changes root or prefix conflict needs O(N) materialization |
| D0010 sparse authority | 1/8/128 writes or v3 checkpoint secretly materialize/hash the full tree |
| D0010 head/ambiguity | independent expected-predecessor writers both win or unknown commit triggers blind retry |
| D0010 migration/downgrade | live/racing legacy source crosses cutover or post-v3 write downgrades automatically |
| D0010 corruption/repair/GC | corrupt reachable object hides behind cache, repair changes authority, or GC deletes live/pinned object |
| D0011 semantic Git binding | real Git tree/blob bytes differ from candidate semantic root or commit bytes differ from tree/parent/metadata |
| D0011 deterministic/object format | same semantic root built in permuted order; project into SHA-1 and SHA-256 repos |
| D0011 local ref CAS | two independent creators/writers present one predecessor |
| D0011 ambiguity/restart | inject pre/post-update loss and reopen adapter |
| D0011 rollback | rollback exact winner or after an intervening publication |
| D0011 process/ref safety | symbolic/wrong namespace, bad predecessor/metadata, inherited `GIT_DIR`, repository hook |
| D0012 target/admission | local candidate is unelected, remote target changes, branch absent, or clear credential is embedded |
| D0012 exact remote fence | two locally elected siblings present one remote predecessor |
| D0012 ambiguity/restart | push result is lost or transport fails, then adapter restarts |
| D0012 rollback/provider rejection | rollback current candidate, reject rewind, or advance remote first |
| D0012 routing/secrets | inherited `GIT_DIR` or stderr/embedded credential attempts to redirect/leak |
| D0013 exact repository base | exact commit text map differs from Attempt `baseDigest`, or worktree changes after Plan creation |
| D0013 Git/text safety | executable file, symlink, invalid UTF-8, path/tree bound failure, inherited `GIT_DIR` |
| D0013 request/result binding | stale/wrong request digest, malformed response, subprocess error/timeout/abort/output overflow |
| D0013 repository authority | model returns a ChangeSet |
| D0013 full-context baseline | repeated Tasks/retry use same commit |
| D0014 same-base preparation | 1/2/4/8 Tasks share one immutable base |
| D0014 identity/restart/rollback | changed commit or wrong `baseDigest`, cache loss, eviction, restart or `contextCache: false` |
| D0014 concurrency/failure | same-key stampede, different bases, producer failure, one/all reader cancellation |
| D0014 process lifecycle | timeout/abort/overflow/direct-child exit with a descendant holding pipes |
| D0014 observations | callback throws, rejects or never settles |
| compaction crash shape | replacement base durable before covered-delta deletion |
| three-state compatibility | successful transition histories across all three states |

## 6. Final-MVP qualification relation

The source gate and method catalog are necessary evidence mechanisms, not a declaration that the final MVP is complete. Final completion requires the capability exits and real provider/user/deployment/security/end-to-end evidence required by `docs/ROADMAP.md` and the responsible product owners.

An accepted or implemented Design is not automatically qualified. A Design becomes verified only under `SDD.md` after its applicable falsifiers and evidence layers are satisfied.

## 7. Evidence record requirements

For a claim that may be reused later, record enough identity to test whether it is still applicable:

- exact Git/source identity;
- exact environment, provider, filesystem/runtime or client profile relevant to the claim;
- exact command/falsifier and outcome;
- counts/coverage/benchmark values only as observations in evidence, never as current authority here;
- any unsupported or unexecuted layer;
- referenced Design/product owner and durable evidence path when applicable.

## 8. Historical boundary

The pre-D0032 executable-acceptance/evidence aggregate is preserved byte-identically at `docs/history/mvp-verification-and-evidence.md`. It records earlier test counts, benchmark observations, completion narratives and the former `docs/MVP.md` authority state. It is history/evidence, not a live qualification owner.

Historical Design/evidence records may truthfully retain references to the former path. Current bootstrap, owner tables, routing/navigation and current qualification-dependent Design links resolve to this file instead.
