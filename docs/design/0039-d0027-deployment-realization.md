# Design 0039 — D0027 Deployment Realization

- Status: `implementing`
- Revision: 9
- Class: 2
- Decision date: 2026-08-26
- Acceptance base: `development@c92c8819d7a45ec46ad0d0822177fb496cded327`
- Trigger: the Revision-8 application-only falsifier showed that `register_installable_agent` is admitted from `UNREGISTERED` and moves D0027 to `GENESIS_PENDING`, while the next same-genesis `record_installable_agent_genesis_evidence` operation is denied before host dispatch because the shared qualification fence requires another fresh `UNREGISTERED` read
- Predecessor revision: D0039@r8, reopened after the `UNREGISTERED -> GENESIS_PENDING` continuation falsifier while preserving its source/Q4 proof records
- Predecessor maintained text: `development@c92c8819d7a45ec46ad0d0822177fb496cded327:docs/design/0039-d0027-deployment-realization.md`
- Trigger/acceptance evidence: `docs/evidence/group-f-d0039-r8-q4-terminal-q6b-sequence-falsifier-2026-08-26.json`, `docs/evidence/group-f-d0039-r8-route-owner-pre-current-readback-2026-08-26.json`, and `docs/evidence/group-f-d0039-r8-q5p-provider-readback-2026-08-26.json`
- Scope: same D0039 deployment-realization owner family; preserve the Revision-7 Q4 contract, the Revision-8 evidence-verifier contract and the Revision-6 Q5-P -> Q6-B -> Q5-R0 -> Q2 -> Q7/re-admit -> Q8/re-admit -> Q9/re-admit -> Q10 DAG, and correct only the qualification route-bootstrap admission fence for the exact D0027 pending-genesis continuation and exact register replay/reconciliation
- Affected owners: `docs/SECURITY.md`, `docs/QUALIFICATION.md`, `docs/DEPLOYMENT.md`, `src/cloudflare-agent-delivery-runtime.mjs`, qualification runtime/target validators and tests, derived Design/PROGRAM routing and bounded WORKBOARD current status
- Preserved owners: D0027@r1 remains the installable authenticated local-Agent lifecycle owner; D0020 `AgentDeliveryAuthority` remains the sole route-current/effect-admission owner; D0038 remains executor-capacity owner; Q4 and the qualification DAG remain unchanged; qualification coordination remains non-product authority
- Explicit non-goals: no new route/state owner; no change to Q4 or Q5/Q6 DAG meaning; no provider/route/device/product effect during Design acceptance or source qualification; no ordinary-operation bypass; no evidence-proof fallback; no proof-layer promotion; no secret/private-key bytes in repository/evidence/model-visible state. Live Q6-B mutation remains a separate fresh admission/readback gate.

## 1. One-line definition

Realize D0027 through the preserved Revision-6 qualification DAG while making Q4 authenticate one exact capsule-v2 execution closure: independently supplied capsule digest, exact runtime bytes, exact self-contained verifier bytes, exact permitted builtin set, empty inherited environment, private empty working directory and declared environmental executor TCB.

## 2. Executed Revision-5 falsifier

Revision 5 correctly separated the pre-provider deployment intent from provider-generated V. Its live application then reached a stronger falsifier:

- one provider-deploy run was durably PREPARED and dispatched exactly once;
- authoritative Cloudflare readback observed V `166d691a-630a-4fd3-af44-dd5076b323eb` at 100 percent on the exact workers.dev ingress with exact R5 S/A/configuration;
- independent IAM readback was available;
- the retained exact D0027 route `d0039-q6-bounded-final-20260824`, generation 1, was `UNREGISTERED` with no `currentTupleDigest`;
- `d0039_security_readback` therefore failed closed with `invalid_digest`;
- D0027 owns `UNREGISTERED -> GENESIS_PENDING -> CURRENT`, and only its state-changing registration/genesis transaction may create the first CURRENT tuple.

R5 simultaneously required final provider plus route-owner S/A/V/R admission before any Q6 state-changing mutation. That is a cycle, not a missing credential or transient provider failure. The provider request is not retried or rolled back to hide this result.

A second sequencing defect is also normative: existing qualification text already says Q7/Q8/Q9 invalidate route/package/trust/provider observations that earlier Q5 evidence read. Therefore `Q5 once -> Q6 -> Q7 -> Q8 -> Q9 -> Q10` cannot be a sound immutable evidence chain even if initial genesis already existed.

## 3. Revision inheritance and exact R5 disposition

Revision 6 preserves all durable R5 facts and does not promote them into R6 proof:

- R5 exact tested source `S5 = 431b5f48d01f99c166ed1e6ec64a5271932716da` and its deterministic A remain immutable R5 evidence;
- the currently active R5 provider V remains a real provider predecessor, not an R6 final V;
- the R5 provider-deploy request must never be replayed as a retry of the same stable mutation identity;
- the R5 v2 run may leave `RECONCILING` only after v2-capable authoritative reread proves that its intended **provider effect** is applied. That transition may terminalize/clean the provider-deploy operation, but it does not close Q5 or create an admitted deployment;
- because R6 changes Design/qualification source, R6 requires a new exact S6, a complete Q1 gate and a new deterministic A6. If exact provider runtime binding must name S6/A6, a later R6 provider deployment is a new mutation identity against the freshly reread R5 provider predecessor, not a retry of the R5 effect.

Operation-run terminality and qualification-gate closure are distinct. `TERMINAL_APPLIED` means that the run's intended external mutation was authoritatively observed; it does not mean every proof gate that depends on that effect is closed.

## 4. Qualification coordination v3

Revision 6 advances the strict coordination union because a third mutation target is required:

```text
tdev.installable-agent-qualification-run.v3
tdev.installable-agent-qualification-store.v3
tdev.installable-agent-qualification-claim.v1
tdev.installable-agent-qualification-deployment-intent.v1
tdev.installable-agent-qualification-route-bootstrap.v1
tdev.installable-agent-qualification-deployment.v2
```

Run/store v3 accepts exactly three target kinds:

1. `provider_deployment_intent` — only `provider_deploy` may mutate against it;
2. `route_bootstrap` — only the bounded initial D0027 route-bootstrap transaction may mutate against it;
3. `admitted_deployment` — all ordinary state-changing product/device qualification requires it.

Unknown target kinds/profiles/fields fail closed. A deployment intent or route-bootstrap target is never accepted as `expectedDeploymentIdentityDigest`, terminal Q5 identity, Q2 runtime identity or an ordinary Q7-Q9 mutation fence.

No nonterminal v2 state is silently reinterpreted as v3. The currently retained R5 v2 provider run is first reconciled with v2 semantics. After every v2 run/claim/controller is positively terminal/quiescent, a supported v2->v3 migration preserves genesis provenance, tombstones, controller/resource generation high-water and replay/no-takeover barriers. Missing/corrupt/ambiguous state blocks migration.

## 5. Exact route-bootstrap target

The strict profile is:

```text
tdev.installable-agent-qualification-route-bootstrap.v1
```

It represents only facts knowable after authoritative provider application and before first D0027 CURRENT election:

- exact R6 S/A/archive/manifest identities;
- exact Cloudflare account, Worker/service, workers.dev hostname/origin and deployment epoch;
- authoritative active provider V/deployment/configuration digest and 100-percent-writer observation digest;
- exact Worker namespace ID/name, D0027 class and jurisdiction;
- exact D0020/D0027 route binding `(agentId, routeGeneration)`;
- authoritative exact route predecessor state `UNREGISTERED`, predecessor/current-state digest and management-request high-water/floor facts required by D0027;
- one controller-selected stable route-bootstrap transaction identity/request identity;
- exact provider and route-owner reread method identities;
- the exact qualification resource claims that fence the route/provider/device state touched by this transaction.

The target deliberately has no caller-invented first-route tuple, credential generation, package generation, trust generation or lifecycle generation. Those product-owner outputs are admitted only from authoritative route-owner readback.

The `route_bootstrap` operation authorizes only the existing D0027 fresh-route transaction family needed to reach or fail genesis safely: legacy-route migration when required, register, genesis evidence/quiescence staging, first `initial_activate`, and bounded fail-genesis/reconciliation paths. It does **not** authorize ordinary start/stop, credential rotation, package activation, replacement, uninstall, arbitrary higher-route recovery or provider redeploy.

`AgentDeliveryAuthority` remains the sole product-current owner throughout. The qualification target grants no route-current authority; it is only an external-effect fence around an already-owned D0027 transaction.

## 6. Q1-Q10 is a dependency/invalidation DAG, not a numeric serial queue

The Q labels remain proof categories. Their number is not a scheduling primitive.

### 6.1 Canonical surviving lane

The minimum canonical lane is:

```text
Q1(S6/A6)
  -> Q5-P provider substrate (intent -> one R6 provider effect if required -> authoritative V6/100%/IAM)
  -> Q6-B route bootstrap from exact UNREGISTERED predecessor
  -> Q5-R0 final provider + CURRENT route join => admitted deployment D0
  -> Q2 runtime crypto/readback against D0
  -> Q7 mutation family -> fresh re-admission D7
  -> Q8 mutation family -> fresh re-admission D8
  -> Q9 surviving recovery/retention family -> fresh re-admission D9
  -> Q10 final composition on D9
```

`Q5-P` and `Q5-R` are two phases of the Q5 proof category, not new public Design IDs. Q6-B is the initial route-bootstrap subset of Q6 that is expressly permitted before final Q5-R because otherwise no CURRENT route can exist.

### 6.2 Parallel lanes

After Q1 closes, independent work may proceed concurrently when resource claims and proof owners are disjoint:

- Q3 physical Android/Termux package/keystore prequalification may run on isolated qualification-owned local state;
- Q4 fresh bootstrap/capsule prequalification may run on an isolated fresh profile;
- Q5-P provider substrate may run on its exact provider lane;
- source/runtime falsifiers and read-only analyses may run in sibling Task-owned worktrees/runtime slots.

Parallel prequalification does not turn isolated state into final deployed-product evidence. Capacity one remains the same DAG executed serially.

Q7/Q8/Q9 destructive or conflicting scenarios may also run in parallel **only on isolated sibling qualification routes/instances**. Their evidence is scenario evidence; a destroyed or divergent sibling identity cannot be composed as the current identity of the canonical surviving lane.

## 7. Evidence invalidation and re-admission checkpoints

An admitted deployment is epoch-bound, not timeless. Every state-changing qualification operation declares the fields/resources it reads and writes and the evidence it invalidates.

- Q6 bootstrap writes the first CURRENT route and invalidates pre-Q6 route/request-floor/HMAC/final-route observations.
- Q7 higher-route/management recovery, credential revocation/rotation or equivalent current-tuple change invalidates the prior route-bound deployment admission and any dependent runtime observation.
- Q8 package/trust/release/lifecycle changes invalidate admissions and local-machine evidence bound to replaced package/trust/credential identities.
- Q9 provider loss/rollback/retention/reinstall/replacement may invalidate provider V, route, package or instance identity. A destructive instance cannot later be called the final current instance.

After any mutation that changes a field of deployment-v2 or a proof read by the next dependent gate, the controller performs fresh authoritative provider + route-owner readback and constructs a new exact deployment-v2 epoch before the next dependent state-changing mutation. Stale admissions are rejected rather than silently reused.

Q2/Q3/Q4 evidence is rerun or retained according to its explicit read/invalidation set. Q10 composes only mutually compatible evidence for the latest surviving final lane plus separately labeled failure-scenario evidence.

## 8. Corrected Q1-Q10 proof meanings

- **Q1 source/canonical:** new exact R6 S6, complete current source gate, complete coverage/diff/cleanliness checks required by the current owner, and deterministic A6. R5 source-equivalence cannot promote semantic R6 changes.
- **Q2 Workers crypto/runtime:** requires a current admitted deployment epoch; provider V and route-owner runtime binding must exact-join. It may run after Q5-R0 and must rerun if later mutation invalidates its read set.
- **Q3 physical Android/Termux:** isolated prequalification may run in parallel after Q1. Final claims name exact package/device/keystore lineage and are invalidated by relevant Q8/Q9 replacement.
- **Q4 fresh bootstrap:** isolated fresh-machine/capsule/bootstrap evidence may run in parallel after Q1. It remains a fresh-scenario proof and is not promoted into current-route state without the exact final join it actually observed.
- **Q5 live provider/IAM:** Q5-P establishes exact provider-applied S/A/V plus IAM; Q5-R establishes each final route-bound deployment epoch after a CURRENT route exists. Neither half alone is terminal Q5.
- **Q6 live migration:** its initial fresh-route bootstrap subset is fenced by route-bootstrap.v1 between Q5-P and Q5-R0. Later ordinary/migration mutations require the latest admitted deployment and invalidate it when they change identity.
- **Q7 management loss/compromise:** canonical-lane mutation is serialized under claims and followed by re-admission; independent destructive/higher-route scenarios may use sibling lanes.
- **Q8 release lifecycle:** package/trust/credential/lifecycle changes use the latest admission, preserve generation monotonicity and are followed by re-admission when identity changes.
- **Q9 provider loss/retention/rollback:** destructive variants use isolated siblings or explicitly recover/reinstall into a new surviving identity, then re-admit. Destroyed-instance evidence is never current-state evidence.
- **Q10 deployed composition:** last on the latest surviving exact lane. It binds the current S/A/V/R epoch and only compatible Q2-Q9 evidence; it does not flatten mutually exclusive histories into one state.

## 9. Runtime-test lane and repository-path correction

Historical runtime branch `tmcp/d0018-runtime-boundary-recovery@b9e260391e56c82b6ca6c9ab7965664396da1069` is evidence, not authority. Its production repair `73d404bdc24eac8337019738ba074c2a1fea4861` is an ancestor of the R6 acceptance base. D0037 moved permanent D0018 falsifiers from `bench/d0018-*` to semantic paths:

```text
qualification/model-runtime-adversarial-falsifier.mjs
qualification/model-runtime-warm-host.mjs
```

Current-head revalidation at the acceptance base passed the adversarial path (all 27 reference cases plus current-source cancellation cases) and the full warm-host path. The successful warm-host run completed in 230696 ms. An earlier 180000 ms outer runner deadline produced a false timeout even though the historical official warm qualification also required about 181 seconds; therefore whole-suite wall-clock deadlines are runner plumbing and must retain margin beyond the harness internal semantic timeout/cancellation guards. This lane is suitable for isolated parallel source/runtime qualification and defect discovery. It does not prove Cloudflare/provider/device layers and never authorizes reuse of an old runtime branch as repository authority.

The stale D0018 maintained-path pointer is corrected as derived documentation drift under already-verified D0037; no D0018 product/runtime semantics change.

## 10. R5-to-R6 operational continuation

The existing provider state is preserved while R6 source is qualified.

1. Freshly reread current remote authority and the R5 provider/journal state.
2. Under exact v2 semantics, reconcile the existing R5 `provider_deploy` run. If authoritative readback still proves the exact dispatched provider effect, terminalize/clean that operation without claiming final Q5. Any ambiguity keeps it blocked.
3. Only after v2 coordination is quiescent, migrate the qualification store to v3 preserving all replay/high-water/tombstone barriers.
4. Establish exact S6/A6 from Q1.
5. Freshly reread the active R5 provider V as the predecessor. If R6 final runtime binding requires S6/A6, PREPARE one new R6 provider intent with a new stable mutation identity and perform at most one fenced provider effect; reconcile V6 by authoritative readback.
6. Build route-bootstrap.v1 from the exact provider-applied R6 state plus the exact UNREGISTERED route predecessor and claims.
7. Execute/reconcile only the bounded D0027 bootstrap transaction. Unknown outcome remains blocked with claims retained; no blind retry/takeover.
8. After authoritative CURRENT readback, construct Q5-R0 deployment-v2 and continue the DAG.

A provider V from R5 may be the predecessor of R6 deployment, but it is never renamed into an R6 final V without exact R6 S/A binding proof.

## 11. Source implementation order

1. accept/publish this Revision-6 owner correction and synchronize QUALIFICATION/DEPLOYMENT/SECURITY/PROGRAM/WORKBOARD;
2. implement strict route-bootstrap.v1 plus run/store v3 target union and v2-quiescent migration;
3. implement operation/target substitution denials and the operation-run-terminal-vs-gate-closure distinction;
4. implement R5 provider-run reconciliation/cleanup without provider replay;
5. add DAG/invalidation/re-admission helpers/checks and focused falsifiers;
6. rerun current D0018 adversarial/warm-host runtime qualifications through semantic paths;
7. establish exact S6 and complete Q1 + deterministic A6;
8. only then consider live R6 provider/route work under fresh authority/provider/credential/claim preflight.

No live Q6-Q10 mutation is authorized merely by acceptance of this Design. The source gate and the exact R6 external-effect fences must exist first.

## 12. Acceptance matrix and cheapest falsifiers

| Area | Required acceptance |
| --- | --- |
| circularity | fresh UNREGISTERED route no longer requires a nonexistent CURRENT tuple before its exact bootstrap transaction |
| target separation | provider intent, route bootstrap and admitted deployment are strict non-substitutable target kinds |
| run/store migration | nonterminal v2 blocks v3; quiescent migration preserves replay/high-water/tombstone/controller barriers |
| R5 preservation | exact R5 provider effect is never replayed; operation-level applied reconciliation does not claim Q5 |
| DAG | Q labels are dependency/invalidation gates, not a numeric serial queue; capacity one is valid degeneration |
| re-admission | Q7-Q9 identity changes make stale deployment epochs unusable until fresh provider+route readback joins a new epoch |
| destructive scenarios | destroyed/divergent sibling evidence cannot become canonical current identity |
| product authority | AgentDeliveryAuthority remains sole route-current/effect owner; qualification targets grant no product authority |
| runtime path | current semantic D0018 adversarial and warm-host falsifiers remain runnable; outer suite deadlines are not confused with semantic timeout guards; historical branch/path names are not treated as current authority |
| proof layers | source/runtime experiments do not promote provider/device/deployed-product state |

Cheapest falsifiers include: route-bootstrap accepted without an authoritative UNREGISTERED predecessor; ordinary operation accepted on route-bootstrap target; R5 provider effect replayed with the same mutation identity; v2 nonterminal state silently read as v3; stale D0 accepted after a Q7/Q8/Q9 identity change; Q10 joining a destroyed sibling; or an old `bench/d0018-*` path treated as the current runtime executable.

## 13. Preserved Revision-6 completion boundary

Revision 6 established the dependency/invalidation DAG and its source realization. Revision 7 does not weaken or reorder it. R6 source/runtime evidence remains immutable predecessor evidence only; because Revision 7 changes normative/source bootstrap meaning, a fresh exact S7, complete Q1 and deterministic A7 are required before new live R7 provider/route/device progression.

## 14. Revision-7 Q4 authenticated executed-bootstrap contract

### 14.1 Executed falsifier and lifecycle decision

During the first R6 live continuation, the retained R5 provider operation was authoritatively reconciled without replay and its quiescent coordination state migrated v2 -> v3 with high-water/tombstones preserved. Disjoint Q3 and Q4 prequalification lanes were then opened. Before Q4 performed any bootstrap/product mutation, source inspection falsified the maintained Q4 realization: `src/installable-agent-security.mjs` still names `tdev.agent-bootstrap-trust-capsule.v1` and authenticates only capsule bytes plus verifier entry bytes. The historical non-authoritative qualification-followup harness adds useful independent-digest, archive and tamper checks but also uses v1 and never executes an authenticated runtime/verifier closure.

Maintained SECURITY already requires capsule v2 and the bytes actually executed, but the exact durable v2 schema was not carried into maintained Design authority. Per SDD this is a same-owner **new D0039 revision**, not a Class-1 string change and not a new Design. The R6 DAG remains authoritative and unchanged.

### 14.2 Exact capsule-v2 schema

The canonical capsule has exactly these top-level fields and no others:

```text
profile = tdev.agent-bootstrap-trust-capsule.v2
routeBinding
managementKeyId
managementPublicKey
releaseRootKeyId
releaseRootPublicKey
initialTrustPolicyGeneration
initialDelegationDigest
execution
```

The inherited route/key/trust fields retain their previous strict meanings. `execution` is one exact record:

```text
profile = tdev.agent-bootstrap-execution.v1
runtimeProfile
runtimeSha256
runtimePlatform
runtimeArchitecture
verifierProfile
verifierSha256
allowedBuiltinModules
networkAllowed = false
environmentInheritance = false
workingDirectoryProfile = private-empty-v1
```

`runtimeSha256` and `verifierSha256` are raw lowercase SHA-256 values over the complete runtime executable and self-contained verifier module bytes actually admitted for execution. `allowedBuiltinModules` is a sorted, duplicate-free exact list of `node:` standard-module specifiers. The current product verifier profile may use only `node:crypto`, `node:fs`, `node:path` and `node:zlib`; relative/package/repository imports, dynamic imports, native addons, child-process/worker creation and any other module are outside the closure. `runtimePlatform` and `runtimeArchitecture` bind the exact observed execution platform/architecture; the current D0027 target remains Android/arm64.

`environmentInheritance=false` has one unambiguous current meaning: the verifier child inherits **zero** environment variables. There is no implicit PATH, HOME, NODE_OPTIONS, NODE_PATH, loader/preload setting or candidate-selected environment allowlist. Any future need to admit environment variables changes the execution profile/capsule identity and returns through the owner lifecycle. `networkAllowed=false` is mandatory; the execution context supplies no network-capable global or module outside the authenticated closure.

### 14.3 Independent anchor and environmental TCB

The raw SHA-256 of the exact canonical capsule-v2 bytes is the sole Q4 product trust anchor. It must be established by an authenticated operator channel before any value from the release/candidate transport is consulted. A digest emitted by the candidate, copied from the same archive/repository/CDN/GitHub transport or merely stored in another file path is not independent authentication. The consumer communications product remains deployment-owned; absence of a positively authenticated operator channel leaves terminal Q4 unverified.

The OS kernel, filesystem/process primitives and exact bootstrap executor used to open/hash/launch the runtime are declared environmental TCB, not product trust anchors. Terminal evidence identifies their profile/observation. The executor must bind verified bytes to executed bytes by a stable-handle/immutable-staging primitive proven for the claimed platform; path check-then-exec alone is insufficient.

### 14.4 Execution and transport rules

The executor must read capsule, verifier, signatures and archive as bounded regular non-symlink inputs through stable handles; reject links, devices/FIFOs, duplicate archive paths, non-normal/absolute/traversal paths, unsupported entries and extraction escape; verify the complete runtime bytes before launch; execute the exact verified verifier bytes with only the exact allowed builtin modules; reject dynamic/package/relative/native loading; use an absolute/stable runtime identity; start with an exact empty environment and a new positively empty private working directory; and prohibit network, runtime download, compiler invocation, package resolution, ambient repository imports and candidate-selected helpers. Verifier stdout/stderr remain diagnostics until a bounded canonical result is returned.

The verifier itself must authenticate the capsule-rooted management/release/delegation identities, signed release statement, archive digest, manifest and every extracted file before installation/current election. Ambient tdev source may orchestrate or observe the executor but cannot replace the capsule/runtime/verifier trust decision.

### 14.5 Version/migration/rollback rule

Capsule v1 is historical predecessor material only. There is **no v1 -> v2 reinterpretation or automatic migration** and no terminal R7 Q4 claim may consume a v1 capsule. No accepted terminal live Q4 state exists that needs product-state migration. A fresh v2 capsule and independently authenticated digest are required for R7. Rollback/downgrade from v2 to v1 is forbidden for terminal qualification. Any runtime, verifier, allowed-builtin set, runtime platform/architecture or execution-policy change creates a new v2 capsule identity and requires a newly independently authenticated capsule digest.

### 14.6 Q4 falsifiers and proof boundary

Source qualification must permanently cover: v1 rejection; unknown/duplicate/unsorted builtin entries; wrong runtime/verifier digest; wrong platform/architecture; non-empty inherited environment; non-private/non-empty cwd; relative/package/dynamic/native import attempts; network-capable closure attempts; runtime/verifier replacement between verification and execution; digest file inside the untrusted transport; candidate/self-issued digest; symlink/special-file transport inputs; archive duplicate/traversal/link/tamper; signer/delegation/release/archive/manifest/file tamper; and executor crash/ambiguous cleanup. A source/local pass closes only the source/executor proof layer. Terminal Q4 still requires a positively authenticated independent operator digest channel plus observation of the exact executor/runtime/verifier process.

## 15. Revision-7 completion boundary

Revision 7 is accepted, not verified. Implementation requires a fresh exact S7/Q1/A7 and executable capsule-v2 normalization, independent-channel fresh-bootstrap executor/verifier and the falsifiers above. Q3 and Q4 may still run in parallel with Q5-P only after S7/A7 and only on disjoint resources exactly as R6 specifies. Q5-P -> Q6-B -> Q5-R0 -> Q2 -> Q7/re-admit -> Q8/re-admit -> Q9/re-admit -> Q10 remains unchanged. No R5/R6 provider observation, R6 source/runtime pass or historical qualification branch is promoted into R7 terminal proof.


## 16. Revision-8 route-bootstrap pre-admission and evidence-verifier correction

### 16.1 Executed falsifier and same-owner decision

The fresh R7 Q6-B readback is a valid `UNREGISTERED` predecessor with a stable predecessor digest and null `currentTupleDigest`. The qualification runtime nevertheless calls `#readRouteCurrent` before every non-read-only operation, so `runtime_probe` and the six D0027 genesis operations fail closed before dispatch. Independent source/runtime inspection also shows that the production `AgentDeliveryRuntimeDOHost` is constructed without an installable-Agent evidence verifier. This is a qualification-admission and deployment-wiring defect, not permission to invent a CURRENT tuple or to mutate another route.

D0039@r8 is a same-owner Class-2 correction. It does not reopen the R7 capsule contract and does not revise the DAG. It adds one fail-closed route-bootstrap admission path and one authenticated evidence-verifier wiring contract; all other state-changing operations retain the admitted-deployment guard.

### 16.2 Exact route-bootstrap admission

The existing `tdev.installable-agent-qualification-route-bootstrap.v1` target remains the only pre-CURRENT target. Exactly these six operations may use it:

```text
migrate_installable_agent_route
register_installable_agent
record_installable_agent_genesis_evidence
accept_legacy_predecessor_quiescence
initial_activate_installable_agent
fail_installable_agent_genesis
```

A route-bootstrap RPC must carry `routeBootstrapTarget`, its canonical `routeBootstrapTargetDigest`, `routeBootstrapTransactionId` and `routeBootstrapRequestDigest`. The target is checked against the exact runtime S/A/manifest/V/account/service/epoch/origin/workers.dev/namespace/class/jurisdiction binding, the route `(agentId, routeGeneration)`, and a fresh authoritative route read. That read must contain `state=UNREGISTERED`, `currentTuple=null`, `currentTupleDigest=null`, the predecessor digest, key identifiers and the nonnegative management-request high-water. The target must bind the same predecessor digest, high-water and a canonical route-authoritative reread digest.

The request digest is domain-separated over the stable transaction identity and route binding. It intentionally does not include the target digest because the target itself contains the request digest and is canonically covered by `routeBootstrapTargetDigest`; the two independently checked digests therefore avoid a circular definition while binding both the transaction identity and every target claim. A current tuple or a changed predecessor fails closed. Only the six operations above bypass the current-deployment guard; ordinary management, credential, package, trust, replacement, uninstall and recovery operations still require `expectedDeploymentIdentityDigest` and the current route identity.

### 16.3 Authenticated genesis-evidence verifier

The production qualification host supplies an async verifier for the exact `tdev.installable-agent-evidence-envelope.v1` record with fields `profile`, `keyId`, `context` and `signature`. The context must equal the canonical D0027 evidence context, including the route binding, evidence digest/type and the persisted release-root key ID/public key. The verifier recomputes the release-root key ID and verifies the Ed25519 signature under `tdev.installable-agent-evidence.v1`. A missing release-root key, missing callback, malformed envelope, context mismatch or failed signature remains a hard denial. Evidence verification occurs before the authority compare-and-swap; concurrent revision changes therefore fail rather than creating a second writer or silently accepting stale evidence. Proof envelopes and private key material are not persisted as new authority.

### 16.4 Rollback, acceptance and proof boundary

R8 source qualification changes no provider, route, device or product state. Deployment of the corrected qualification Worker must be a new exact S/A/V observation and must preserve the existing R7 provider version as the rollback boundary. Q4 still requires the independently authenticated operator capsule-v2 digest and executed-bootstrap observation; the source verifier wiring cannot satisfy that independent channel. After a deployed route-bootstrap readback proves the six-operation path, Q6-B may proceed under the retained claims. Until then Q4, Q6-B, Q5-R0 and Q2-Q10 remain nonterminal, with no blind retry, provider rollback, replacement route, or ordinary product mutation.

### 16.5 R8 acceptance matrix

| Area | Required acceptance |
| --- | --- |
| pre-CURRENT admission | exact `UNREGISTERED`/null-current read is accepted only for the six bounded genesis operations |
| target binding | S/A/manifest/V/account/service/epoch/origin/workers.dev/namespace/class/jurisdiction, route, predecessor, high-water and readback digests match exactly |
| request identity | transaction and route identity are canonical and jointly bound with the full target digest without circular hashing |
| ordinary operations | every non-bootstrap mutation still requires the current admitted deployment identity |
| evidence authentication | production host wires release-root Ed25519 evidence verification; unavailable/malformed/mismatched proof fails closed |
| authority separation | qualification remains a fence; `AgentDeliveryAuthority` alone owns route CURRENT and state transitions |
| rollback/safety | source phase performs no external mutation and keeps the R7 provider version as rollback boundary |
| proof layers | source/focused tests do not promote Q4 independent channel, deployed Q6-B, Q5-R0 or later DAG evidence |

## 17. Revision-8 completion boundary

The preserved Revision-8 source record remains exact S8 `development@2fed68c582ceee31546ece08f4c7a9a6d7194941` with deterministic A8 source qualification: 571/571 tests passed, coverage was 85.24% line / 71.63% branch / 88.56% function, and the two A8 builds were byte-identical. The deployed pre-CURRENT route readback and the independent Q4 operator execution record are separate proof-layer observations; they do not by themselves close the D0039 lifecycle.

The later stateful Q6-B falsifier reaches the R8 admission meaning: `register_installable_agent` is admitted from `UNREGISTERED` and changes the authoritative state to `GENESIS_PENDING`, while the next `record_installable_agent_genesis_evidence` request is denied before host dispatch because the R8 route-bootstrap guard requires another fresh `UNREGISTERED` read. This conflicts with D0027's retained contract that the same exact pending genesis identity stages subordinate evidence and effects before `initial_activate` elects `CURRENT`. The observed facts are recorded in `docs/evidence/group-f-d0039-r8-q4-terminal-q6b-sequence-falsifier-2026-08-26.json` and the deployed pre-CURRENT observation in `docs/evidence/group-f-d0039-r8-route-owner-pre-current-readback-2026-08-26.json`.

Under `SDD.md`, the affected R8 admission scope was reopened. The user-approved owner decision is now recorded as D0039@r9, a same-owner Class-2 correction. R8 remains immutable historical meaning for its exact scope; its source/Q4 records are not silently rewritten as R9 proof. Until R9 source qualification and the later deployed admission/readback gates pass, Q6-B, Q5-R0 and the dependent Q2-Q10 gates remain nonterminal.

The Q4 proof-layer record remains separate: the maintained evidence records the independently authenticated operator digest fixed before executor-artifact consultation and the exact executed runtime/verifier closure, while the operator-owned artifact directory and its generation process are not reclassified here beyond the evidence actually observed. A failed deployment/readback retains claims and returns to the exact R8 source/ref without retrying an ambiguous provider effect.

## 18. Revision-9 transaction-bound `GENESIS_PENDING` continuation admission

### 18.1 Same-owner decision and preserved boundaries

Revision 9 is the deliberate same-owner Class-2 correction for the R8
stateful falsifier. The core problem remains D0039 deployment-realization
qualification, the qualification owner remains a non-product fence, and D0027
remains the sole owner of `UNREGISTERED -> GENESIS_PENDING -> CURRENT` state,
pending identity, candidate generations, management receipts and durable
effects. No new Design or second route/state authority is introduced.

R9 preserves the R7 Q4 execution/trust contract, the R6 qualification DAG, the
R8 release-root evidence verifier and the R8 initial `UNREGISTERED` admission
path. R9 changes only the pre-CURRENT admission projection so that it can
represent the exact D0027 pending transaction after the first register has
committed. The target is an observation/fence: it describes D0027 state and
never creates, elects, allocates or assigns D0027 state.

### 18.2 Phase U and phase P

Phase U retains `tdev.installable-agent-qualification-route-bootstrap.v1`.
It admits only the existing bounded operations against a fresh authoritative
`UNREGISTERED`/null-current route read and preserves the exact R8 target,
predecessor, high-water and provider/runtime binding rules.

Phase P introduces the exact target profile
`tdev.installable-agent-qualification-route-bootstrap.v2` with
`routeBootstrapPhase=GENESIS_PENDING_CONTINUATION`. It is legal only for the
same D0027 pending transaction and these operations:

```text
register_installable_agent              # exact replay/reconciliation only
record_installable_agent_genesis_evidence
accept_legacy_predecessor_quiescence
initial_activate_installable_agent
fail_installable_agent_genesis
```

The phase-P target contains provider/runtime/route binding plus these distinct
facts:

- `genesisPredecessorDigest`: the original authoritative `UNREGISTERED`
  predecessor consumed by D0027 register;
- `pendingDigest`: D0027's authoritative pending identity, including its
  candidate and transaction content; qualification does not calculate or
  allocate it;
- `genesisGeneration`, `pendingManagementRequestId` and `pendingIntentDigest`:
  the exact D0027 pending identity fields;
- `routePredecessorStateDigest`: the current authoritative route readback
  predecessor digest for the `GENESIS_PENDING` state;
- `pendingReadbackDigest`: a canonical digest of the current authoritative
  pending read, including the route, state, key IDs, high-water and pending
  identity; and
- `routeBootstrapRequestDigest`: a domain-separated digest over the exact
  subordinate operation, transaction identity, route binding and request body
  received by qualification.

The target contains no caller-supplied candidate tuple or newly assigned
generation. Every pending field is compared with a fresh D0027
`read_installable_agent` observation immediately before host dispatch.

### 18.3 Exact replay and fail-closed predicates

For phase P, qualification first requires a fresh authoritative
`GENESIS_PENDING` read with null current tuple/digest and a non-null pending
identity. It then requires exact equality of the target's pending fields and
the fresh pending readback digest. The request must match the target's
operation and request digest.

`register_installable_agent` is permitted in phase P only as exact
replay/reconciliation of the original request: the request's
`managementRequestId`, `intentDigest` and `expectedPredecessorDigest` must
match the pending identity and original `genesisPredecessorDigest`, and the
complete received request must have the same request digest. This permits a
committed register whose response was lost to resume without minting another
candidate or generation.

Evidence, predecessor-quiescence, initial-activation and fail-genesis
operations must bind the exact pending digest and generation. Initial
activation and fail-genesis additionally bind the pending management request,
intent and original predecessor as required by D0027. D0027 remains the final
authority for operation-specific management proof, readiness, quiescence,
replay and CAS behavior.

Qualification denies before host dispatch on an unrelated pending transaction,
changed intent, wrong management request, wrong generation, stale pending or
readback digest, changed route/provider binding, competing registration,
failed/terminal pending identity, non-exact replay, current tuple presence or
caller-invented candidate state. An exact D0027 replay remains the only
exception to the pending continuation operation fence.

### 18.4 Mutation and proof boundary

Design acceptance and R9 source qualification perform no provider, route,
device or product mutation. They prove only the qualification/admission
projection and its local fail-closed behavior. Live Q6-B may be attempted only
after a fresh exact S/A/V/provider/route admission and the separately required
Q4/Q5 predecessor gates authorize it. A successful source/test result does not
close Q6-B, Q5-R0, D0039, Group F or MVP.

R9 does not automatically invalidate Q4. The existing Q4 proof may be retained
only after an invalidation check confirms that the exact capsule, runtime,
verifier and archive identities authenticated by Q4 are unchanged. If any of
those bytes change, fresh Q4 evidence is required. R9's changed admission
semantics themselves require fresh focused source qualification; prior S8
source identity is not automatically promoted through post-S8 source/tool/test
changes.

### 18.5 R9 acceptance matrix

| Area | Required acceptance |
| --- | --- |
| lifecycle | R8 is recorded as reopened history and R9 is the accepted/implementing same-owner correction |
| authority separation | D0027 alone creates/owns pending identity and state; qualification only observes and fences it |
| phase U | R8 `UNREGISTERED` initial admission remains byte/semantic compatible |
| phase P | exact `GENESIS_PENDING` read, null-current tuple and matching pending readback are required |
| identity | original predecessor, pending digest, generation, management request, intent, route and request digest match exactly |
| replay | original register exact replay/reconciliation is admitted; changed or competing register is denied |
| operation fence | only the five D0027-valid phase-P operations are permitted; ordinary operations retain current-deployment admission |
| mutation boundary | Design/source qualification performs no external mutation; live Q6-B has separate fresh gates |
| proof boundary | R9 source tests do not promote Q4, deployed Q6-B, Q5-R0 or later DAG evidence |
