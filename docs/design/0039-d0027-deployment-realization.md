# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 6
- Class: 2
- Decision date: 2026-08-25
- Acceptance base: `development@7d629fb644808c5aa1428f1da55da28643a8c009`
- Trigger: executable Revision-5 Q5 application reached exact provider-applied S/A/V state but proved that the selected D0027 route is still `UNREGISTERED`; the accepted final-Q5-before-any-Q6-mutation rule therefore requires a CURRENT route before allowing the only transaction that can create that CURRENT route
- Predecessor revision: D0039@r5, accepted and source-qualified, with one exact provider effect applied and retained fail-closed in reconciliation
- Predecessor maintained text: `development@7d629fb644808c5aa1428f1da55da28643a8c009:docs/design/0039-d0027-deployment-realization.md`
- Trigger evidence: `docs/evidence/group-f-d0039-r5-q5-provider-applied-route-owner-blocked-2026-08-25.json`
- Acceptance evidence: `docs/evidence/group-f-d0039-r6-qualification-dag-route-bootstrap-acceptance-2026-08-25.json`
- Scope: same D0039 deployment-realization owner family; remove the Q5/Q6 circular dependency, replace the apparent Q1-Q10 serial queue with an explicit dependency/invalidation DAG, add a narrowly bounded route-bootstrap qualification target, separate operation-run terminality from gate closure, and require fresh re-admission after identity-changing Q7-Q9 mutations
- Affected owners: `docs/QUALIFICATION.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, D0039 qualification target/journal tooling and tests, derived Design/program routing and bounded WORKBOARD current status
- Preserved owners: D0027@r1 remains the installable authenticated local-Agent owner; D0020 `AgentDeliveryAuthority` remains the sole route-current/effect-admission owner; D0038 remains executor-capacity owner; qualification coordination remains non-product authority
- Explicit non-goals: no second route owner; no alternate provider/ingress; no caller-invented provider version/current tuple; no weakening of claims/CAS/reconciliation/no-live-takeover; no replay of the existing R5 provider effect; no proof-layer promotion; no secret/private-key bytes in repository/evidence/model-visible state

## 1. One-line definition

Realize D0027 through an explicit qualification DAG: qualify exact S/A, establish provider-applied S/A/V, authorize only the exact fresh-route genesis transaction from an authenticated UNREGISTERED predecessor, join the resulting CURRENT route into final deployment-v2, and re-admit after every later mutation that invalidates that identity before composing Q10.

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

## 13. Completion boundary

Revision 6 is accepted, not verified. Verification requires published source implementation, complete exact Q1/A6, executable target/migration/re-admission falsifiers and the required provider/device/operator proof layers. No current R5 provider observation, local runtime pass or source-only test is promoted into final R6 Q5/Q6-Q10 completion.
