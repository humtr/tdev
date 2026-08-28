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
- for the concrete D0027 deployment realization, strict canonical `m2:<seq>` parsing; exact `managementRequestSequenceHighWater + 1` fresh admission; gap/stale/overflow rejection; retained exact replay before floor classification; changed operation/intent/original-predecessor conflict; one unchanged request across multi-phase drain/readiness/final lifecycle transitions; and bounded receipt compaction that cannot erase or lower the permanent request floor;
- J3 fence-first versus admission-first histories with the complete current tuple, serialization held through immediate send initiation, no transferable permit, no second `maySend` after response loss/ambiguous send, reconnect/current-tuple fencing and fresh authorization/admission for every later ordinal;
- J4 concurrent first registration, crash/lost response at each genesis staging/final-election boundary, fixed candidate mismatch, failed-candidate retirement, stale restore/clone/deletion, bounded GC non-resurrection, non-executable partial tuples and rejection of base `start` before `initial_activate`;
- stop/start lifecycle ABA, stop-before-quiescence fencing, start final revalidation, uninstall-owned draining from an already stopped route, response-loss replay, update/rollback/reinstall generation monotonicity and deletion barriers;
- supervisor durable-before-create PREPARED/ACTIVE/GO_ALLOWED ordering, post-create failure remaining held, live pidfd/warden-only destructive authority, stored-PID rejection after supervisor replacement and complete descendant/process-resource cleanup before `cleanup_complete`;
- legacy D0020-only predecessor quiescence: same-host same-boot whole-domain absence, scoped reboot proof, late evidence during `GENESIS_PENDING`, duplicate/stale evidence and missing-local-state histories may refine only the exact retained D0020 route + `deliveryId`/executor/evidence slot and otherwise keep activation blocked;
- repository/state/evidence/log/manifest/model-visible secret exclusion and proof-layer non-promotion.

At the **local Agent/machine** layer, install a real package copy on the exact supported fresh-machine profile without a tdev checkout, tmcp Task/worktree dependency, ambient developer helper or unbound runtime download. Prove package/service provenance, independently provisioned credential/trust inputs, clone-safe activation, control-process restart against the same supervisor, supervisor restart with no stored-PID destructive adoption, pidfd capability fail-closed behavior, warden descendant containment and positive cleanup under normal completion/cancellation/timeout/crash cases. Identify every package/helper/runtime/profile digest and the secret-storage boundary; this layer alone does not prove provider authority.

At the **provider/security** layer, prove the existing D0020 route reaches exactly one writable `AgentDeliveryAuthority` whose D0027 substate atomically owns current installation/credential/package/trust/lifecycle/genesis and first-emission admission. Exercise independently authenticated management denial, credential/trust rotation and revocation against already-open sockets, package/trust/lifecycle/dispatch races, replay/high-water/GC reconstruction and bounded storage. Concrete trust/credential/package wiring must match SECURITY/DEPLOYMENT ownership and secret values must remain outside durable semantic/evidence/model-visible state.

At the **deployment/migration/rollback** layer, execute supported legacy D0020-only initialization, interrupted genesis, reinstall/replacement, update, rollback and uninstall against exact versioned predecessor formats. Prove old writers cannot reactivate incompatible state, candidate generations never lower/reuse, a D0020 held slot remains addressable until matching positive quiescence arrives, unsafe missing locators keep capacity held, and payload/service/secret deletion never destroys the last required replay/recovery evidence. For the concrete management-request correction, additionally prove nested admission v1->v2 predecessor classification and request-floor initialization/import, fail-closed rejection of noncanonical `m2`/unknown/nonterminal predecessor state, first-v2-write rollback fencing and absence of an automatic v2->v1 downgrade.

At the **deployed-product** layer, compose the elected CaseDO owner, the verified D0020 `AgentDeliveryAuthority` and one authenticated installed D0027 Agent. Run concurrent multi-Case work through J3 first-emission fencing, J4 first activation, real stop/start/reconnect/revocation/update/uninstall/reinstall, process-owner crash, positive physical cleanup, response-loss reconciliation and stale restore/replay. The concrete management-request correction must preserve the same `m2` transaction identity through update/rollback/uninstall response loss rather than minting a completion request. Source, local-machine, provider/security, migration/rollback and deployed-product evidence are independent; no one layer substitutes for another.

### D0039 Revision-3 deployment-realization proof profile

D0039@r3 makes this file the canonical semantic owner of the qualification-run journal and resource-claim protocol. `tdev.installable-agent-qualification-run.v1` and `tdev.installable-agent-qualification-claim.v1` define strict canonical records with unknown-field/version rejection, run identity `(qualificationRunId, runGeneration)`, deterministic resource-key identity, monotonically non-reused `claimGeneration`, exact predecessor record digest/revision CAS and all-or-none `shared_read` / `exclusive_mutation` claim acquisition. Before any external/product/provider/device mutation, the exact run, target/S/A/V/R identity, stable mutation identity, claims, intended operation and authoritative reread method are durably `PREPARED`.

Legal forward run state is `PREPARED -> DISPATCHED -> RECONCILING -> TERMINAL_NOT_ADMITTED|TERMINAL_APPLIED|TERMINAL_CONFLICT -> CLEANUP_PENDING -> CLEAN`. `ADMITTED_IN_PROGRESS` and `STILL_AMBIGUOUS` are reconciliation outcomes that remain nonterminal `RECONCILING`; neither authorizes a new request or dependent progress. Every state-changing operation defines its durable phases, authoritative reread, receipt/request-floor/current/tombstone predicates, positive zero-effect predicate and safe retry/resume/stop/cleanup behavior. Once dispatch may have occurred, timeout, transport loss, unreadable/oversized/truncated/invalid response, response-authentication failure, unproven non-2xx, parser failure or controller death is ambiguous until authoritative reconciliation.

Exactly one qualification mutation controller may own a live mutation lane. **No live takeover is inferred.** Lease expiry/timeout, disconnect, process disappearance, failed CAS, a fresh request identity or a higher generation does not authorize successor effects, cleanup, claim release or resource reuse. A successor must first durably establish positive predecessor exclusion/quiescence for the exact prior run and every conflicting claimed resource. Missing proof keeps the lane blocked. Restart deterministically enumerates every nonterminal run/claim and reconciles before mutation/progress/reuse; stale generations cannot mutate or release later claims. Compaction occurs only after CLEAN and retains run tombstones and per-resource generation high-water sufficient to prevent reuse. Corrupt/missing/total-loss state fails closed.

Terminal gate proof uses `tdev.installable-agent-qualification-evidence.v2`, a fresh run/target identity and direct observations from the required independent principals; gate/check catalogs, structural validators, arbitrary drivers/adapters and all-true JSON cannot close a gate. Q2 requires provider version control-plane plus route-owner runtime binding; Q3 requires physical-device observation, independent Termux/Termux:API signing-certificate lineage and AndroidKeyStore possession; Q4 requires the independent operator capsule-digest channel plus authenticated executed runtime/verifier observation; Q5 requires provider/route binding and cross-principal IAM observations; Q6-Q9 require their management/release/provider/route owners and exact changing epochs; Q10 composes only mutually compatible authenticated final evidence. The observation producer cannot be its sole authenticator.

Q5 deployment admission freezes and joins exact S/A/V/R before Q2 or any live mutation. Evidence carries read/write/invalidation sets: Q6 invalidates affected pre-Q6 route/request-floor/HMAC observations; Q7 higher-route recovery invalidates old-route final composition; Q8 trust/package changes invalidate evidence bound to replaced identities; destructive Q9 cannot compose with the destroyed instance; Q10 runs last on the exact final lane. A Q3 helper that creates/deletes an alias, signs, manipulates a service or otherwise changes device/package state is reversible mutating prequalification only and requires exclusive claims; cleanup ambiguity blocks reuse.

Revision-3 Q1 uses strict Model B. Exact source/normative commit `S` runs the complete source gate. An optional descendant `E` is reusable only when a repository-owned deterministic checker already present in S proves protected paths byte-identical and every change lies inside machine-delimited evidence/current-status regions fixed by S; the checker emits a changed-path/region manifest. If the checker/delimiters are absent, any source/owner/tool/test/package input changes, or a changed region is not allowlisted, E becomes a new S and the complete Q1 gate reruns. Evidence names both identities and never calls E the Q1-tested SHA.

Selective candidate integration is semantic-hunk based, never wholesale. The provenance ledger records candidate ref identity and source commit in the evidence/provenance artifact rather than this normative qualification owner, plus candidate path/hunk, target owner, disposition, copied/rewritten/rejected result, target path, focused tests, rationale and resulting commit. The code-heavy D0039 r2 candidate is already historical ancestor material and is not replayed; the D0039 r2 qualification-followup candidate remains non-authoritative and is not wholesale merged.

The first source/tool/runtime realization of these accepted trust, identity, persistence, deployment and verification rules is Class 2 and must pass the full source gate plus focused Revision-3 falsifiers at exact S before Q1 can close. Q2-Q10 remain separate provider/device/operator proof layers; absent execution is `unverified`, never an inherited PASS. If the qualification protocol would need an independent public/durable effect-admission authority or other owner-model/cutover expansion, stop at a new-Design boundary under `SDD.md`.

### D0039 Revision-4 workers.dev deployment-realization proof profile

D0039@r4 inherits Revision-3 authenticated evidence, journal/claims, reconciliation, no-live-takeover and Q2-Q10 separation. Exact S reruns the complete source gate. Q1 additionally falsifies deployment-identity-v2 shape, workers.dev hostname/origin derivation, legacy Zone-route fields, disabled workers.dev, enabled previews, provider/route-owner drift and the Revision-4 least-privilege IAM rule.

Q5 reads account and Worker subdomain state, establishes the exact production hostname/origin, one active V at 100 percent state-changing traffic, Worker/class/namespace/jurisdiction and immutable S/A/config bindings, inventories secret names without values, and only then reads the route owner at that origin. Provider and route-owner deployment-v2 digests must exact-join in one stable epoch. IAM uses a distinct observer and proves account-scoped Workers Scripts Write; signer custody/privilege separation remains independently evidenced.

Revision 4 uses `qualification/d0039-r4-source-equivalence.mjs` and the bounded `D0039-R4-CURRENT-STATUS` WORKBOARD region. An evidence descendant may add only canonical `docs/evidence/group-f-d0039-r4-*.json` plus that bounded status change. Every other changed path makes a new S. Q2-Q10 remain unverified until executed on the exact admitted R4 deployment.

### D0039 Revision-5 provider-generated-version qualification coordination

D0039@r5 preserves the final Revision-4 `tdev.installable-agent-qualification-deployment.v2` S/A/V/R identity but corrects the pre-provider mutation target. The first provider deployment effect is PREPARED against strict `tdev.installable-agent-qualification-deployment-intent.v1`, containing only exact pre-dispatch S/A, account/service, desired workers.dev/configuration, intended Worker/namespace/class/jurisdiction bindings and an authoritative predecessor-provider-state digest. Provider-generated Worker version/deployment/route-owner outputs are absent rather than guessed.

The durable coordination format advances to `tdev.installable-agent-qualification-run.v2` and `tdev.installable-agent-qualification-store.v2`; `tdev.installable-agent-qualification-claim.v1` keeps its existing meaning. Run v2 carries an explicit target kind: `provider_deployment_intent` accepts only deployment-intent.v1 and is valid for the provider-deploy mutation; `admitted_deployment` accepts only final deployment.v2 and is required for state-changing product/device qualification. A deployment intent cannot be used as `expectedDeploymentIdentityDigest`, terminal Q5 target or a Q2-Q10 product mutation fence.

No v1 coordination bytes are silently reinterpreted. A v1 store with a nonterminal run, live claim or mutation controller blocks v2 migration until positively reconciled by v1-capable tooling. A supported quiescent migration must preserve genesis provenance, tombstones and controller/claim generation high-water/replay barriers; otherwise it fails closed. There is no automatic v2->v1 downgrade.

Before provider dispatch, the controller binds the exact intent, stable mutation identity, affected provider-resource claims and authoritative reread method, then enters DISPATCHED. Any unknown outcome remains RECONCILING. The generated V is accepted only from authoritative provider reread proving the intended S/A/configuration; response content alone does not authorize dependent work. Final provider plus route-owner readback constructs the unchanged deployment-v2 identity, and Q2/state-changing product or device qualification remains blocked until that final identity exact-joins under Q5.

Revision-5 Q1 must include the R4 journal mismatch regression plus intent/final-target substitution denial, unknown-field/profile rejection, v1 migration barriers and ambiguous-provider-effect claim retention/no-duplicate-effect vectors. Exact Revision-5 S reruns the complete source gate and constructs a new deterministic A. An evidence descendant is reusable only through the S-owned `qualification/d0039-r5-source-equivalence.mjs` checker and the bounded `D0039-R5-CURRENT-STATUS` WORKBOARD region; other semantic/source changes create a new S.

### D0039 Revision-6 qualification DAG and route-bootstrap fence

Revision-6 exact source S6 owns `qualification/d0039-r6-source-equivalence.mjs` and the machine-delimited `D0039-R6-CURRENT-STATUS` WORKBOARD region. After complete Q1/A6, only a descendant that changes that bounded status region and adds canonical immutable `docs/evidence/group-f-d0039-r6-*.json` blobs may reuse S6; any other source, Design, routing or documentation mutation invalidates source-equivalence and requires a fresh Q1 source identity.

D0039@r6 corrects the live R5 circularity: final route-bound Q5 admission cannot be required before the only D0027 state-changing genesis transaction that can create CURRENT. Qualification is an explicit dependency/invalidation DAG, not numeric Q-order. After exact R6 Q1 S/A, isolated Q3 physical and Q4 bootstrap prequalification may run in parallel with Q5-P provider substrate when claims are disjoint. Q5-P establishes authoritative provider-applied S/A/V/IAM. A strict `tdev.installable-agent-qualification-route-bootstrap.v1` target then fences only the exact fresh-route D0027 UNREGISTERED -> GENESIS_PENDING -> CURRENT transaction. After CURRENT, Q5-R constructs final deployment-v2.

Coordination advances to strict run/store v3 with exactly `provider_deployment_intent`, `route_bootstrap` and `admitted_deployment` target kinds. Nonterminal v2 state is never silently interpreted as v3. The retained R5 provider-deploy run must first be reconciled with v2 tooling: if authoritative provider readback still proves the exact dispatched effect, that **operation** may terminalize/clean without claiming final Q5. R5 provider replay remains forbidden. Because R6 semantic source changes require new S/A, the active R5 V is an exact predecessor, not an R6 final V; any required R6 provider deploy uses a new stable mutation identity after Q1 and fresh predecessor reread.

Every Q7-Q9 state-changing operation declares read/write/invalidation sets. A mutation that changes any deployment-v2 field or dependent proof invalidates the prior admitted epoch; fresh provider + route-owner readback must construct a new admitted deployment before the next dependent mutation. Destructive/conflicting Q7-Q9 scenarios may run on isolated sibling qualification lanes in parallel, but a destroyed/divergent sibling never composes as canonical current state. Q10 runs last on the latest surviving exact lane. Capacity 1 is the same DAG serialized.

Source/local-runtime/provider/device/deployed-product evidence remain separate. Current D0018 semantic runtime qualification may be used to parallelize isolated source/runtime falsifiers, but it cannot promote provider/device state.

Parallel qualification lanes must also separate **semantic timeout falsifiers** from **normal-path scheduling budgets** and from the **outer whole-suite wall-clock deadline**. An exact-S6 parallel trial exposed that D0018 warm-host normal fresh-process attempts used a 10s transport budget while a concurrent full source gate saturated the same Termux host; W23 then produced a false `model_transport_timeout` despite correct isolation semantics. The warm qualification normal path therefore carries an explicit bounded contention margin, while the dedicated 50ms transport-timeout falsifier remains unchanged. This is qualification scheduling policy only; it does not weaken production retry/fencing/cancellation semantics or promote trusted-local runtime evidence into provider/device proof.

### D0039 Revision-7 Q4 executed-bootstrap qualification

R7 preserves the R6 DAG and replaces only Q4's incomplete source realization. Source Q1 must now prove strict capsule-v2/execution-v1 normalization, exact legacy-v1 rejection/non-use, independently supplied digest separation and an executor/verifier path that authenticates the complete runtime bytes and exact verifier bytes actually executed. The verifier child starts with zero inherited environment in a private positively empty cwd; the authenticated verifier may import exactly `node:crypto`, `node:fs`, `node:path` and `node:zlib`, with relative/package/dynamic/native loading and network-capable closure rejected.

The permanent fresh-bootstrap qualification must distinguish three layers: (1) candidate/transport self-consistency, which is never terminal trust; (2) source/local executor proof, including stable-handle verified-bytes-equal-executed-bytes, environment/cwd/import/network and archive/signature/tamper falsifiers; and (3) terminal Q4, which additionally requires an independently authenticated operator principal/channel that established the exact capsule-v2 digest before untrusted transport input was consulted. Absence of layer 3 is recorded as blocked/unverified even when layers 1-2 pass.

Historical `codex/d0039-r2-qualification-followup-20260824` may supply selectively revalidated transport/archive/tamper mechanics only. Its v1 capsule and non-executed verifier model are explicit regression fixtures, not implementation authority. Any R7 Design/source change creates fresh S7/Q1/A7; R6 source-equivalence cannot be used across this revision.

### D0039 Revision-8 route-bootstrap pre-admission and evidence verification

R8 preserves the R7 executed-bootstrap contract and the R6 dependency/invalidation DAG. It corrects only the qualification runtime path that must admit the first D0027 genesis transaction while the authoritative route is still `UNREGISTERED`, plus the production evidence-verifier wiring used by genesis readiness evidence. The exact target profile remains `tdev.installable-agent-qualification-route-bootstrap.v1`; it is not an admitted deployment and cannot be supplied as `expectedDeploymentIdentityDigest`.

### D0039 Revision-9 pending-genesis continuation qualification

R9 preserves the R8 v1 `UNREGISTERED` initial-admission target and adds the exact target profile `tdev.installable-agent-qualification-route-bootstrap.v2` for the D0027 `GENESIS_PENDING` continuation phase. The v2 target is a qualification projection/fence only: it reads the authoritative D0027 pending identity and never creates, elects or assigns pending state, candidate generations or management receipts.

Phase P binds the original `UNREGISTERED` predecessor digest separately from D0027's authoritative `pendingDigest`, `genesisGeneration`, `managementRequestId` and `intentDigest`, plus the fresh pending route readback digest, route/provider binding and exact subordinate request digest. `register_installable_agent` is allowed in this phase only as exact replay/reconciliation of the original request after a committed response loss; its management request, intent, original predecessor and complete request body must match. Evidence, predecessor-quiescence, initial-activation and fail-genesis operations must bind the exact pending digest/generation and their D0027-required identity fields. Changed, stale, competing, failed or caller-invented pending identities are denied before host dispatch.

This R9 source qualification performs no provider, route, device or product mutation. Live Q6-B remains a separate fresh S/A/V/provider/route admission and readback gate. R9 source changes require fresh focused qualification; the prior S8 identity is not automatically promoted through later qualification/tool/test changes. Existing Q4 evidence is retained only after explicit capsule/runtime/verifier/archive invalidation analysis.

The route-bootstrap RPC carries `routeBootstrapTarget`, `routeBootstrapTargetDigest`, `routeBootstrapTransactionId` and `routeBootstrapRequestDigest`. Admission requires the six bounded operations (`migrate_installable_agent_route`, `register_installable_agent`, `record_installable_agent_genesis_evidence`, `accept_legacy_predecessor_quiescence`, `initial_activate_installable_agent`, `fail_installable_agent_genesis`) and rejects every other operation. It verifies the complete target S/A/manifest/V/account/service/epoch/origin/workers.dev/namespace/class/jurisdiction binding, exact `(agentId, routeGeneration)`, fresh `UNREGISTERED` route state, null current tuple/digest, predecessor digest, management-request high-water, key identifiers and canonical route-authoritative reread digest. The request digest binds the stable transaction/route identity; the full target digest binds all claims without circular hashing.

Live pre-CURRENT route-owner qualification must use the authoritative `read_installable_agent` operation and prove two stable `UNREGISTERED`/null-current observations with the same canonical route-authoritative reread digest. `qualification/installable-agent-cloudflare-readback.mjs --route-readback-mode unregistered` implements this explicit method while preserving its default CURRENT-bound readback mode. `d0039_security_readback` derives the admitted deployment identity through a non-null `currentTupleDigest` and therefore remains a CURRENT-bound reader; it must not be reinterpreted or automatically fallen back from as an UNREGISTERED predecessor reader.

Only those six operations bypass the current-deployment guard. Ordinary management, credential, package, trust, replacement, uninstall and recovery mutations still require `expectedDeploymentIdentityDigest` and a fresh current route read. Unknown fields/profiles, changed predecessor, current tuple presence, target/runtime mismatch, request mismatch, stale readback or unavailable provider data fail closed before dispatch.

Genesis evidence in R8 used an async `tdev.installable-agent-evidence-envelope.v1` signed by the persisted release-root Ed25519 key over the canonical D0027 evidence context. That concrete signer choice is historical R8 meaning. Verification-before-CAS and fail-closed proof authentication survive; R10 supersedes the mandatory release-root signer choice.

### D0039 Revision-10 owner-corrected deployment-realization proof profile

R10 preserves the product falsifiers for management authentication/replay, independently authenticated executed bootstrap, exact provider/route binding, phase-U `UNREGISTERED` admission, transaction-bound `GENESIS_PENDING` continuation, exact original-register replay, evidence-before-CAS and final deployed composition. The authoritative D0027 owner, not qualification tooling, creates pending/current state.

Genesis evidence qualification now requires an **opaque authenticated proof plus an injected verifier** that binds the exact canonical route/pending/evidence context. The proof producer cannot be its sole authenticator. Missing proof/verifier, malformed input, context mismatch or authentication failure must be rejected before CAS with zero product effect. R10 does not select the offline release root as the mandatory live evidence signer; the concrete proof mechanism is a SECURITY/DEPLOYMENT concern and any new custody/trust/effect owner requires its own Design.

The R3-R6 qualification run/store/claim/controller formats, provider-intent/version coordination, store migrations, repeated-admission plumbing and revision-specific source-equivalence tools are preserved as historical/non-product qualification mechanics, not D0039 product state or a ROADMAP exit. Top-level `qualification/` remains a non-product executable boundary under D0037. A bounded proof run may use those tools only when freshly admitted by the current method/deployment owner; reusable durable control ownership, takeover or migration is independently decidable and cannot be inferred from D0039.

The R9 phase driver is optional sequencing scaffolding. Focused source qualification must prove that it performs stable phase-U/P reads, exact pending/request binding, management signing, forwarding of already-produced evidence proofs and no blind retry, while proving that it does not choose an evidence signer, inspect secret bytes or mint product identity.

For any evidence-reuse decision, require a positive invalidation/join relation between the observation and the candidate identity. If that relation cannot be established within the bounded reuse method, execute the applicable proof method against the candidate instead of extending product or durable qualification state solely to preserve a prior observation. Evidence produced at one proof layer is admissible only for claims that the layer's method explicitly proves.

The surviving dependency rule is semantic: after any mutation that changes a fact read by a dependent proof, reread/re-admit that fact before the dependent operation. Q10 composes only mutually compatible authenticated evidence. This is a qualification-method rule, not a new product state machine.

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
| default executor capacity | omit `capacity` on a ready width greater than 8 and prove exactly 8 concurrent admissions; compare with explicit 1/8 for canonical result equivalence |
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
