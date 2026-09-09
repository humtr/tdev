# tdev forward development program

> Engineering owner for the forward Design-sized dependency/coverage graph between stable Capability Group exits in `docs/ROADMAP.md` and accepted implementation/qualification work. It owns planning relations, conditionality, cheapest falsifiers, exit shape, external-action dependency and unresolved coverage questions. It does not own product meaning, maintained Design status, current routing, historical evidence or Capability Group definitions.

## 1. Authority boundary

The mutable current routing instance and runnable frontier are owned only by `WORKBOARD.md`. Resolve exact runnable/selected Design revisions there, then resolve each maintained Design revision/status from its Design file.

This register carries no current lane, `ACTIVE` Group or branch instance. A route transition therefore does not require a synchronized PROGRAM edit.

`docs/ROADMAP.md` is the sole live A-H Capability Group/exit owner. This file references Group IDs only; it does not duplicate the capability table.

A gate row has one of two authority forms:

- **maintained Design foreign key** — `Dxxxx@rN` plus its Design path; the Design file, not this register, owns whether that revision is accepted/implementing/verified/reopened/etc.;
- **provisional label** — a planning key only. It does not authorize Class 2 implementation until `SDD.md` is satisfied by an accepted Design record.

Completed Design narrative, test counts, benchmark values, commit SHAs and evidence digests belong to Design/evidence/history owners and are intentionally absent here.

## 2. Forward gate register

| Gate | Groups | Authority | Depends on / may run with | Conditionality | Cheapest falsifier / exit shape | External action dependency |
| --- | --- | --- | --- | --- | --- | --- |
| D0019@r2 | B/F | maintained Design foreign key: `docs/design/0019-casedo-authority-adapter.md` | inherited semantic core; Agent delivery can be researched in parallel; D0030 is only a prerequisite for a verification route that actually exercises the Termux immutable-journal write path | required current Case-runtime gate | competing placement/replay/revision/eviction/owner-loss/corruption/capacity/rollout failures on one durable Case authority; exit is a qualified single semantic owner in the target Case runtime | Cloudflare Durable Object/storage/account evidence where provider qualification is claimed |
| D0030@r2 | B/F | maintained Design foreign key: `docs/design/0030-immutable-journal-publication-portability.md` | can implement independently of D0019 semantics; may unblock Termux journal-backed qualification paths | required for any supported deployment/profile that cannot qualify the inherited hard-link publication primitive | no-replace publication capability, ambiguity/reread and unchanged journal-oracle behavior on each supported profile; exit is one positively qualified backend/integration path without silent fallback | native build/package/runtime-filesystem qualification as applicable |
| D0020@r2 | F | maintained Design foreign key: `docs/design/0020-agent-connection-delivery-and-aggregate-capacity.md` | Case authority and Agent delivery ownership remain separate; implementation preserves D0019 running-before-dispatch and the accepted `grant_attempt_dispatch` boundary; D0027 consumes this route/delivery boundary without reopening it | required | inherited connection/capacity/cancellation/reservation gates plus R2 post-spawn handle/no-handle truth, exact lost-connect-response socket-incarnation fencing, terminal-delivery retirement/bounded tombstone GC and ancient-replay non-resurrection; exit is one durable `AgentDeliveryAuthority` with bounded aggregate admission and no second semantic queue | Cloudflare/runtime evidence for the selected `AgentDeliveryAuthority` host/profile where provider qualification is claimed |
| D0038@r1 | F | maintained Design foreign key: `docs/design/0038-default-executor-capacity-policy.md` | D0018 capacity-N semantics and D0020 aggregate Agent capacity remain independent owners; D0039 may consume the implemented default but does not own it | required fixed runner/runtime policy gate | omitted capacity selects 8 while explicit 1 and other positive safe integers remain the same admission model; widths 1/8/>8 preserve claims, retry, cancellation, fencing and canonical result/Promotion behavior; exit is one qualified fixed normal default with no adaptive controller or second queue | Android/Termux resource-pressure and selected Agent/provider composition evidence only where those layers are claimed |
| D0021 | F | provisional label | representative target-conflict workload and the selected runtime owner topology | conditional on real cross-Case target conflicts | two Cases contend for one target across owner restart and stale lease generation; exit is one durable exclusion owner or evidence that MVP does not need cross-Case exclusion | provider/runtime state only if activated |
| D0022 | E/F | provisional label | selected deployed context/artifact architecture | conditional on persistent content/artifact storage being required | missing/corrupt/stale object, duplicate publication and authorization denial with no semantic-state corruption; exit is a narrowly owned byte/query layer or evidence that it is unnecessary | storage provider configuration only if activated |
| D0023@r4 | G | maintained Design foreign key: `docs/design/0023-versioned-stateless-tdev-mcp-surface.md` | D0042@r1 durable drive/reconciliation owner and D0043@r5 semantic typed operations; D0024@r1 supplies authenticated principal/tenant context; D0046@r8 owns preserving provider composition and the current-client complete loop | required first-release public-surface gate | exact `tdev.mcp.surface.v1` exposes only the sixteen Directive-named tools, every descriptor has `openWorldHint:false`, `operation_list/get` are bounded reads, `development_start` binds one semantic operation without caller validation selection, supported protocol revisions still complete their admitted discovery/tools/call flow, and duplicate/stale/malformed/reconnect cases remain owner-bound | supported MCP client and HTTPS deployment configuration |
| D0024@r1 | G | maintained Design foreign key: `docs/design/0024-chatgpt-cloudflare-access-managed-oauth.md` | D0023@r4 surface plus selected current ChatGPT client; D0046@r8 consumes the first exact profile in an isolated trial; a custom-broker revision remains evidence-triggered rather than a permissive fallback | required | falsify discovery/resource binding, issuer/client mix-up, tenant crossing, refresh/revocation, rotation, response-loss or reconnect; exit is supported authentication plus tenant/Case denial and credential separation evidence | Cloudflare Access application, identity/client registration and current-client verification |
| D0025 | C/F | provisional label | selected runtime effect owner/fencing plus inherited Promotion/Git contract; may advance beside later security/deploy work after authority is fixed | required | ambiguous publication followed by exact remote reread plus predecessor conflict and authorization denial; exit is one authenticated fenced runtime publication lane | GitHub app/token/SSH/branch-policy configuration as selected |
| D0026 | F/H | provisional label | selected Worker/DO/storage/publication/security bindings after the private D0027 Agent realization split into D0039@r12 | required broader deployment gate; D0039 owns the exact private D0027 credential/trust/genesis realization and does not complete this row | fresh non-production deployment from documented configuration plus controlled rollback for the remaining provider topology; exit is reproducible provider-visible deploy/config/rollback state beyond the private D0027 realization | Cloudflare account/project/routes/bindings/secrets and operator approvals |
| D0027@r1 | F/G/H | maintained Design foreign key: `docs/design/0027-installable-authenticated-local-agent.md` | D0020 connection/delivery contract; bounded D0023/D0024/D0025 research may proceed in parallel; D0039 realizes its concrete private credential/trust/provider/genesis boundary without revising D0027 | required local-Agent Design gate; lifecycle authorization remains owned by the maintained Design, and concrete deployed realization now has its own D0039 owner | fresh package verification/registration, stale credential/socket rejection, control/supervisor crash recovery with no PID-reuse authority, reinstall/update/downgrade fencing and secret exclusion; exit is an installable authenticated local Agent executing a bounded real Task under correct D0020 fencing and positive physical-cleanup evidence | machine permissions plus the selected route-scoped Agent credential/package trust inputs and any admitted local Git/model/tool credentials; canonical publication credentials remain D0025 |
| D0039@r12 | F/H | maintained Design foreign key: `docs/design/0039-d0027-deployment-realization.md` | D0020@r2 route/held-slot/current authority plus D0027@r1 installation lifecycle; D0040@r1 separately owns the concrete evidence-attestation authentication identity/binding; D0038 may run independently and only supplies the separately owned numeric runner default; `docs/QUALIFICATION.md` owns proof methods rather than product state | required private D0027 deployment-realization gate split from provisional D0026 | falsify canonical management/credential/release trust, clone-safe AndroidKeyStore custody, independently authenticated executed bootstrap and D0040-authenticated installable-Agent evidence, exact provider/route binding, phase-U initial `UNREGISTERED` admission, phase-P transaction-bound `GENESIS_PENDING` continuation/exact replay, forward-only rollback/retention and deployed composition; qualification run/store/controller/transport mechanics are not product exit meaning | physical Android/Termux, Cloudflare Worker/DO/IAM, a deployed D0040 secret-preserving evidence-attestation path, deployed route bootstrap, live migration/rollback and fresh-machine deployed composition evidence |
| D0040@r1 | F/H | maintained Design foreign key: `docs/design/0040-installable-agent-evidence-attestation-authority.md` | consumes the D0027/D0039 injected evidence-verifier seam but owns only authentication identity/envelope/custody/binding; D0039 fresh Q4 remains independently runnable and is never replaced by this gate | required security/deployment dependency for D0039 evidence acceptance | wrong-key/domain/context/type substitution, malformed/missing proof/config, historical-v1 substitution and signer-role reuse must fail before CAS; exit is one dedicated deployment-bound Ed25519 attestor/verifier path with no D0027 state schema or generic signing authority | secret-preserving attestor custody/provisioning and provider/runtime public-key readback only when deployed qualification is claimed |
| D0041@r1 | F/H | maintained Design foreign key: `docs/design/0041-installable-agent-pre-genesis-material-binding.md` | consumes D0027 predecessor/generation authority, D0039 route/release-root custody and D0040 only where evidence authentication is later composed; owns no provider or route mutation | required dependency before D0039@r12 phase-U may resume | deterministic predecessor-bound `cp1` identity, alias/trust substitution and stale-after-provision reconciliation failures; exit is source-qualified credential/release-trust projection plus a separate supported-Termux physical candidate-preparation proof with no D0027 dispatch | Android/Termux keystore/source-lineage and exact release-root/delegated-signer material only for the physical proof layer |
| D0042@r1 | F/G | maintained Design foreign key: `docs/design/0042-case-agent-drive-and-redrive.md` | D0019 Case authority, D0020 AgentDeliveryAuthority and D0027 route/current/dispatch boundaries; D0046@r8 consumes the first dedicated SQLite Durable Object placement without changing drive semantics | required before a supported endpoint may assume autonomous progress | kill/restart the candidate owner around ready/reserved/attempt-start/dispatch/result boundaries and prove level-triggered re-drive plus authoritative reconciliation without duplicate dispatch authority or invented success; exit is one durable owner that connects Case readiness to Agent delivery while preserving existing owners | Cloudflare DO/runtime evidence only where deployed drive ownership is claimed |
| D0043@r5 | D/F/H | maintained Design foreign key: `docs/design/0043-bounded-development-operation-profiles.md` | D0019/D0042 Case-drive authority, D0020/D0027 local Agent delivery, D0047/D0048 context identity and the retained Revision-4 warden/process boundary for optional process-backed bindings | required generic typed-operation source gate before D0046@r8 C1/C2 | with Codex executable/auth/config absent, construct the core runtime/catalog, bind exact semantic ID/version/contract digest, execute deterministic `repository.changeset.compose.v1` through the normal Agent result path, reject stale/unsafe/out-of-scope input, run owner-required validation, preserve Promotion-only canonical mutation, and prove zero model subprocesses; optional Codex availability must not affect the core exit | supported local machine and repository validation tooling; Codex authentication is required only if the later optional delegated binding is exercised |
| D0047@r2 | D/F/G/H | maintained Design foreign key: `docs/design/0047-lazy-bounded-repository-context.md` | D0013/D0014/D0017 full-context compatibility; D0043@r5 operation boundary; D0046@r8 MCP composition | required before a large-repository development request or scoped disclosure is called supported | exact base/manifest identity carried through Case and Agent, owner-issued bounded list/search/read, bounded selected-operation context, separate full-base candidate, distinct base/scope/context/candidate digests, explicit incomplete/limit outcomes and separate full-context stress evidence | generated large repository and supported lazy context runtime; provider/client layers remain separate |
| D0048@r1 | D/F/G/H | maintained Design foreign key: `docs/design/0048-lazy-scoped-plan-reference.md` | D0019 Case/Plan authority and D0047@r2 manifest/scope owner; D0043@r5 operation boundary; D0046@r8 MCP composition | required for a scoped semantic Plan whose selected tree is smaller than the complete exact-base repository | complete manifest/repository identity remains bound while an owner-issued semantic scope enters Case/Agent, unsupported entries outside scope do not force eager hydration, candidate starts from a full exact-base clone, and Plan reference/snapshot restore reject identity drift | exact repository manifest and scoped source/validation runtime; provider/client layers remain separate |
| D0046@r8 | D/F/G/H | maintained Design foreign key: `docs/design/0046-minimum-viable-tdev-mcp-experiential-path.md` | D0019/D0020/D0027 owners, D0023@r4/D0024 surface/auth, D0042 drive, D0043@r5 operations, D0047@r2 bounded context and D0048@r1 scoped Plan identity; D0025 Git publication remains outside the first loop | required first user-experienced no-Codex complete tdev development loop | after C0 source/Agent and C1 preserving provider preflight, supported web ChatGPT reads context/operation metadata, itself authors one real non-documentation ChangeSet and starts one Case that traverses Drive/Agent, disposable exact-base candidate, owner-required validation, D0019 Promotion and matching terminal readback with Codex unavailable and zero model subprocesses; remaining approval confirmations are classified separately; terminally failed Cases remain evidence and may be followed only after exact terminal readback by a fresh bounded attempt | physical local Agent and validation tooling, Cloudflare Worker/DO/D1/Access, current web ChatGPT connection and the user's authentication/development objective; no Codex dependency for the core proof |
| D0045@r1 | C/D/F/G/H | maintained Design foreign key: `docs/design/0045-tdev-tmcp-mcp-development-path-comparative-qualification.md` | candidate comparison requires an independently usable D0046@r8 C2 tdev path; publication comparison additionally requires D0025; D0035 consumes the result without treating it as tmcp-disabled proof | required comparative adoption gate before D0035 retirement verification; implementation remains unrunnable until `WORKBOARD.md` selects it after D0046 | freeze a client-stratified equivalent-work manifest before candidate results, then pair Codex and later supported web ChatGPT tmcp/tdev MCP runs; exit requires non-inferior correctness/safety plus predeclared material improvements in latency, throughput/parallelism, efficiency and fault recovery after complete-corpus remediation reruns | exact supported clients, both MCP services, model/Agent/runtime observation and isolated Git/provider refs as exercised |
| D0028 | H | provisional label | deployed mandatory components and their recovery/rollback owners | required bounded operations gate | selected component outage with detection, bounded degradation and verified recovery/rollback; exit is actionable runbooks/observation without telemetry becoming semantic authority | operator/provider access needed to exercise recovery safely |
| D0035@r1 | F/G/H | maintained Design foreign key: `docs/design/0035-tdev-self-hosting-and-tmcp-retirement.md` | supported paths selected by D0020 and D0023-D0028, plus D0042@r1/D0043@r5/D0046@r8/D0047@r2/D0048@r1 boundaries, D0045 comparative adoption evidence and every activated D0021/D0022 conditional gate used by the final deployment | required self-hosting/tmcp-retirement gate before final qualification; lifecycle authorization remains owned by the Design | disable the tmcp operational plane, then use tdev-owned MCP/Case/Task/Agent/validation/Promotion/Git paths to produce and provider-reread one real tdev successor with representative failure reconciliation; exit is independent evidence that no required step used tmcp; D0045 superiority does not substitute for this absence proof | supported client, machine/Agent, GitHub and provider access plus an operator-controlled tmcp disable observation |
| D0029 | H | provisional label | D0035@r1 plus all mandatory A-H exits and every activated conditional gate | required final gate | deterministic deployed success/failure/security/recovery/migration/rollback matrix before any load/SLO experiment; exit is accepted Level-4 evidence | unavoidable provider/account/client actions documented and independently verified |

A future accepted Design may merge/split/reorder provisional rows when one authority decision makes the existing boundary wrong. Update this program relation only through the applicable SDD classification; a Design number is never authorization by itself.

## 3. Dependency and parallelism graph

The numbers are not a serial queue. The current planning relation is approximately:

```text
                         D0019@r2 Case owner
                                |
D0023@r4 + D0024@r1 -----+      +------ D0042@r1 drive
                         |                      |
                         v                      v
                   D0046@r8 C2 <-------- D0020@r2 + D0027
                         ^                      ^
                         |                      |
                   D0043@r5 C0 ----------------+
                         |
                         v
                   D0046@r8 C1
                         |
                         v
                     D0045@r1 <----- D0025 publication rows
                         |
                         v
                     D0035@r1
                         |
                         v
                       D0029

D0021? / D0022? / D0026 / D0028 remain conditional or broader final-MVP lanes.
```

`?` marks an evidence-activated conditional gate or a provisional future Design ID, not implementation authorization. D0042@r1 remains accepted, D0043@r5 is verified at its published C0 source/package layer, and D0046@r8 is implementing; exact runnable selection still comes only from `WORKBOARD.md`. D0045 remains later than the independently usable D0046@r8 C2 path.

The current runnable line remains owned only by `WORKBOARD.md`. C0 is published at `development@c76e24add24823fa63e95aa656ffb07491694dc7` with evidence `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`; the routed next gate is D0046@r8 C1 preserving deployment/readback, followed only after C1 success by C2 current-client no-Codex experiential proof. Intermediate evidence updates do not become product completion.

Research may proceed ahead of an implementation dependency when it does not choose an unresolved authority/security/migration contract by implication. Canonical repository mutation/publication remains governed by the development workflow and current WORKBOARD route.

### 3.1 Functional adoption checkpoints and reporting boundary

The user-facing adoption route groups many small reviewable changes into functional checkpoints. It is a forward plan, not current routing and not permission to skip an accepted Design or validation gate.

| Checkpoint | Functional exit | Included forward work |
| --- | --- | --- |
| C0 - no-Codex source/Agent gate | **PASS** at `development@c76e24add24823fa63e95aa656ffb07491694dc7`: the generic catalog, deterministic ChatGPT-authored ChangeSet operation, owner-required validation and final v1 MCP contract passed the complete source/Agent gate with Codex executable/auth/config absent and zero model subprocesses | D0043@r5 plus the D0023@r4 surface pieces required by the same vertical slice; evidence: `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`; provider/client completion is not claimed |
| C1 - preserving isolated endpoint | the already selected isolated Agent/provider composition is rebound to the accepted v1 contracts, old live Plan compatibility/quiescence is proven, and exact provider readback shows the sixteen-tool surface with all `openWorldHint:false` | D0046@r8 preserving deployment using existing D0019/D0020/D0023/D0024/D0042/D0043 owners; no new qualification owner or endpoint architecture |
| C2 - experiential no-Codex development | supported web ChatGPT discovers context/operations, itself authors one real source ChangeSet and completes the same Case through Drive/Agent/candidate/owner-required validation/Promotion/terminal readback with Codex unavailable | the user's connection/authentication and development objective are the only planned manual actions; this is the first corrected user-visible product PASS |
| H - solidify the proven path | the frozen C2 corpus survives recovery, auth lifecycle, reproducible deploy/rollback, legal parallelism and stable endpoint cutover gates | later D0046 hardening only after C2; mandatory safety floors remain in C0-C2 rather than being deferred |
| C - comparative adoption | client-matched tmcp/tdev MCP runs over one frozen corpus satisfy D0045 correctness, speed, throughput/parallelism, efficiency and recovery gates | only after D0046@r8 C2 is independently usable; optional Codex and web ChatGPT strata remain separate |
| P - publication/self-hosting | tdev publishes/reconciles a real successor and later proves self-hosting while tmcp is disabled | D0025, D0035, broader D0026/D0028/final prerequisites and D0029 |

Small commits, tests, fixes, evidence writes, routing updates and safe internal reruns remain execution units, not user-facing completion units. The implementer proceeds continuously from M0 into M1, stopping for the user only when the complete connection handoff is ready. Thereafter handoff occurs only at M2/H/C/P completion or when an exact authority, safety or unavailable external-resource blocker prevents further in-scope progress.

## 4. Current unresolved decision questions

Only questions that can still change the forward graph belong here:

- Does deployed/provider evidence show enough remaining semantic input volume or disclosure pressure to justify a separate ContextSlice decision, or does the accepted full-context reference contract remain sufficient for MVP?
- Does the selected deployed content/artifact path require persistent shared storage/query projection, activating D0022?
- Do representative MVP workloads contain real cross-Case target conflicts requiring D0021?
- Where should runtime Git publication effects execute under the final runtime/security model: authenticated local Agent, dedicated publication lane, or another fenced owner?
- Can the current supported ChatGPT MCP client complete end-to-end discovery, RFC 8707 resource binding, issuer/client-identity validation, refresh/offline continuity, revocation and reconnect through Cloudflare Access Managed OAuth? This is the first qualification path; a custom OAuth broker becomes a candidate only after a concrete compatibility or ownership falsifier.
- After D0046 proves the isolated single-user path, should stable deployment retain the qualification Case/Agent placements or migrate to new production-labeled namespaces during H5, and what exact quiescence/readback makes that change safe?
- Which Cloudflare/storage/routing components are mandatory versus conditional after the actual deployment topology is selected and measured?
- Which provisional gates should be combined, split, reordered or removed because later evidence shows their authority boundaries are not independent?

Questions already decided by maintained Designs are not kept here as if they were open. Historical formulations remain recoverable in `docs/history/program-before-d0033.md` and the responsible Design/evidence records.

## 5. Coverage and omission-prevention rule

For every newly discovered requirement/finding that may affect final MVP:

1. identify the product owner or explicitly record that product meaning is unchanged;
2. map it to one or more existing ROADMAP Group IDs, or change ROADMAP through the appropriate accepted Design if the capability decomposition itself is wrong;
3. map it to an existing forward gate, create a provisional planning row, or explicitly reject/defer it with evidence;
4. give the forward gate a cheapest falsifier/exit shape and record any external-action dependency;
5. when Class 2 implementation becomes authorized, replace a provisional authority with the maintained accepted Design foreign key without copying the Design status into PROGRAM;
6. after execution, store observed results in evidence and maintained Design records rather than appending a mini-report here;
7. close Group/checkpoint state through `LINEAGE.md`, `WORKBOARD.md`, the responsible Design/evidence and `docs/development/WORKFLOW.md`, not by turning this register into a historical ledger.

The absence of an implementation mechanism never permits a requirement to disappear. Keep it `conditional`, `unknown`, or blocked at the responsible owner until evidence resolves it.

## 6. Relationship to completion and history

- Capability exits: `docs/ROADMAP.md`.
- Current runnable/selected gate: `WORKBOARD.md`.
- Maintained Design meaning/status: `docs/design/`.
- Development execution, isolated work, integration and publication procedure: `docs/development/WORKFLOW.md`.
- Checkpoint succession/preservation: `LINEAGE.md`.
- Verification methods: `docs/QUALIFICATION.md`.
- Observed results: `docs/evidence/`.
- Superseded planning narrative, including the pre-D0033 392-line register: `docs/history/program-before-d0033.md`.

A Group completion report or past Design verification is valuable history, but it is not a forward dependency edge and therefore does not accumulate in this file.
