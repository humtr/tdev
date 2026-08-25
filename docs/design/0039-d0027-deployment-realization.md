# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 5
- Class: 2
- Decision date: 2026-08-25
- Acceptance base: `development@77be2a65db5318af621b5e6b157680cd7baf3803`
- Trigger: executable Revision-4 application falsifier proved that the durable qualification journal rejects the accepted deployment-identity-v2 target while Cloudflare creates immutable Worker version `V` only after the first provider mutation
- Predecessor revision: D0039@r4, accepted and source-qualified through exact Q1 plus deterministic artifact A, but not live-provider mutated
- Predecessor maintained text: `development@77be2a65db5318af621b5e6b157680cd7baf3803:docs/design/0039-d0027-deployment-realization.md`
- Predecessor source evidence: `docs/evidence/group-f-d0039-r4-s2-q1-exact-a-2026-08-25.json`
- Falsifier evidence: `docs/evidence/group-f-d0039-r5-provider-version-journal-falsifier-2026-08-25.json`
- Acceptance evidence: `docs/evidence/group-f-d0039-r5-provider-generated-version-admission-acceptance-2026-08-25.json`
- Scope: same D0039 deployment-realization owner family; repair the qualification coordination target/version boundary so provider mutation is fenced by exact pre-dispatch intent and exact predecessor provider state, while final state-changing qualification remains fenced by the unchanged admitted deployment identity v2
- Affected owners: `docs/QUALIFICATION.md`, `docs/DEPLOYMENT.md`, D0039 qualification journal/target tooling, focused qualification tests, derived Design/program routing and bounded WORKBOARD current status
- Preserved owners: `docs/SECURITY.md` trust/secret/no-takeover meaning is unchanged; D0027@r1 remains the installable authenticated local-Agent owner; D0038@r1 remains the executor-capacity owner; the per-route `AgentDeliveryAuthority` remains the sole product-current owner
- Explicit non-goals: no new product-current/effect authority; no alternate provider; no Zone Route or Custom Domain; no weakening of CAS, claims, ambiguity reconciliation, signer custody or no-live-takeover; no caller-invented Worker version; no Q2-Q10 proof promotion; no secret/private-key bytes in repository/evidence/model-visible state

## 1. One-line definition

Realize D0027 on the accepted exact `workers.dev` ingress by fencing the first provider deployment effect with a durable exact deployment intent, resolving provider-generated `V` only by authoritative readback, and requiring the unchanged exact deployment identity v2 before Q2 or any state-changing product/device qualification.

## 2. Revision inheritance and historical preservation

Revision 5 is a same-Design correction under `SDD.md`. The problem remains D0027 deployment realization; the selected Cloudflare account/Worker/Durable Object owner family, `workers.dev` ingress, S/A/V/R admission, D0027 generation model, D0020 route-current authority, credential/trust scheme, release scheme and final proof layers do not change.

Revision-4 source `S2 = e151d722d7dd8eb3e6cf9172bf45f56eb5ef67a4`, its exact Q1 observations and deterministic A remain immutable historical evidence for Revision 4 only. Because Revision 5 changes the Design, QUALIFICATION/DEPLOYMENT meaning and qualification source, they cannot be promoted into Revision-5 Q1 or A. Revision 5 requires a new exact source S, complete Q1, and a newly constructed deterministic A.

Revision 5 preserves without relaxation:

- exact `workers.dev` account subdomain, hostname, `enabled=true`, `previews_enabled=false` and no Zone/Custom-Domain fallback;
- final `tdev.installable-agent-qualification-deployment.v2` as the mutation-bound S/A/V/R identity after provider admission;
- one existing per-route `AgentDeliveryAuthority` as sole product-current owner;
- exact management/release/credential trust and signer-custody boundaries;
- one qualification mutation controller, exclusive claims, strict CAS, restart reconciliation and no automatic live takeover;
- Q2-Q10 as independent executable proof layers.

## 3. Executed falsifier and correction boundary

At exact authority `development@77be2a65db5318af621b5e6b157680cd7baf3803`, the generic durable journal imports Revision-3 `normalizeQualificationDeploymentIdentity`. A focused executable falsifier passed a valid Revision-4 deployment-v2 value into `FileQualificationJournal.prepareRun()` and observed `unexpected_keys` / `Revision-3 qualification deployment identity has unexpected or missing keys`. Therefore the accepted R4 target cannot enter PREPARED at all.

Independently, the repository Cloudflare provider adapter performs the Worker upload first and then reads the provider-created Worker version. The immutable Worker version ID `V` is consequently not a caller-known pre-dispatch fact for the first Worker mutation. Revision 4 simultaneously said that PREPARED carries exact S/A/V/R before provider mutation and that the implementation should record exact intended facts available at that stage before creating V. Those statements are incompatible on the selected provider.

No Cloudflare/provider mutation and no qualification-token transmission occurred while discovering this defect. The correction therefore changes coordination/admission semantics forward; no operational rollback is required.

## 4. Two exact target classes

Revision 5 defines two different, non-substitutable target classes.

### 4.1 Pre-provider deployment intent

The first provider effect uses strict profile:

```text
tdev.installable-agent-qualification-deployment-intent.v1
```

It contains only exact facts that are positively knowable before dispatch:

- exact Revision-5 S and A/archive/manifest digests;
- exact Cloudflare account and Worker service/script name;
- deployment/environment/epoch chosen by the qualification controller;
- fresh account `workers.dev` subdomain and exact derived desired hostname/origin;
- required ingress kind `workers_dev`, desired `enabled=true`, desired `previews_enabled=false`;
- exact intended Worker class/namespace/jurisdiction and immutable plain-text deployment-binding digest;
- exact digest of the authoritative pre-dispatch provider snapshot for the target Worker/resources, including whether the target service is absent or the exact predecessor deployment/version/configuration that exists;
- the authoritative reread method identity used after ambiguous dispatch.

The intent deliberately contains no provider-generated Worker version ID, no invented active deployment ID, no route-owner current tuple and no Durable Object route identity that has not yet been observed. Missing pre-dispatch facts remain a blocker; unknown provider-generated outputs are not replaced with placeholders.

### 4.2 Final admitted deployment identity

After provider effect reconciliation and independent provider plus route-owner readback, the final identity remains exactly:

```text
tdev.installable-agent-qualification-deployment.v2
```

Its Revision-4 strict shape and meaning are unchanged: exact S/A/V, account/service, deployment/environment/epoch, 100-percent state-changing traffic, exact workers.dev ingress, Worker/namespace/class/jurisdiction, Agent route generation/Durable Object identity and route-current/verifier digests.

A deployment intent is never accepted as `expectedDeploymentIdentityDigest`, never closes Q5, and never authorizes Q2 or a state-changing product/device qualification RPC.

## 5. Durable qualification run/store version and migration fence

Because the durable run target meaning changes from one deployment-identity shape to a strict tagged union, Revision 5 advances the coordination format rather than silently reinterpreting v1 bytes:

```text
tdev.installable-agent-qualification-run.v2
tdev.installable-agent-qualification-store.v2
```

The claim profile remains `tdev.installable-agent-qualification-claim.v1`; claim key/generation/exclusive-holder meaning is unchanged. Controller identity, legal run states, strict predecessor-record CAS, tombstones, high-water and cleanup semantics remain unchanged unless the v2 implementation must version a concrete record solely to preserve strict decoding.

Run v2 carries an explicit target kind and a strict target value:

```text
provider_deployment_intent -> deployment-intent.v1 only
admitted_deployment        -> deployment.v2 only
```

`provider_deploy` is the only state-changing operation allowed to PREPARE a `provider_deployment_intent`. Product/device state-changing operations require `admitted_deployment`. Read-only provider/admission observations may use the final admitted identity when it already exists. Unknown target kinds/profiles fail closed.

There is no implicit v1->v2 reinterpretation and no v2->v1 downgrade. If the configured predecessor store is v1 and contains a nonterminal run, live claim, or mutation controller, v2 admission is blocked until the predecessor obligations are positively reconciled under v1-capable tooling. A migration of a fully quiescent v1 store is allowed only through an explicit validated migration that preserves genesis provenance, tombstones, controller/claim generation high-water and every replay/resource-reuse barrier. If that preservation cannot be proven, migration is blocked rather than starting a fresh store over the old path.

## 6. Provider deployment effect and ambiguity

Before the first Worker mutation, the controller must:

1. freshly read the exact provider predecessor state and workers.dev account subdomain;
2. construct exact Revision-5 S and deterministic A;
3. construct the strict deployment-intent target and predecessor-provider-state digest;
4. acquire the global qualification mutation lane plus exact affected provider-resource claims;
5. durably PREPARE run.v2 with the intent, stable mutation identity and authoritative reread identity;
6. transition to DISPATCHED immediately before issuing the provider effect.

After dispatch, timeout, disconnect, malformed response, uncertain non-2xx, controller failure or any other unknown outcome remains ambiguous. The controller enters/reconstructs RECONCILING and reads the provider using the pre-bound authoritative method. It may classify only positive not-admitted/applied/conflict evidence; it does not mint a new request, create a second V, overwrite resources, release claims or transfer control merely because time passed.

A returned/upload-response Worker version is not authoritative by itself. The generated V is accepted only when provider control-plane reread shows the exact intended S/A/configuration on one immutable version and the intended deployment state. That observation becomes input to final S/A/V/R admission, not a retroactive pre-dispatch fact.

## 7. Exact S/A/V/R admission and Q5

The final admission sequence remains:

```text
S -> A -> PREPARED deployment intent -> provider effect/reconciliation -> V
  -> deployment/cutover -> exactly 100% state-changing writer
  -> provider readback -> route-owner readback -> exact S/A/V/R join
```

The deployment-admission portion of Q5 still precedes Q2 and every state-changing product/device qualification. Provider active-version identity and route-owner runtime version must agree in one stable deployment/config epoch. Mixed/canary state-changing writers, alternate hostnames, redirects, preview ingress, stale predecessor endpoints and cross-epoch joins fail closed.

Provider and IAM observation remain Revision-4 meaning: deploy principal needs effective Workers Scripts Write on the exact account; a distinct IAM observer reads the provider-token policy; signer private-key custody/privilege separation requires separate evidence and is not inferred from Cloudflare token policy.

## 8. Qualification journal, no-live-takeover and non-authority

The legal run-state family remains:

```text
PREPARED -> DISPATCHED -> RECONCILING
  -> TERMINAL_NOT_ADMITTED | TERMINAL_APPLIED | TERMINAL_CONFLICT
  -> CLEANUP_PENDING -> CLEAN
```

`STILL_AMBIGUOUS` and admitted-in-progress outcomes remain nonterminal. Exactly one mutation controller owns a live mutation lane. Timeout, expiry, disconnect, process disappearance, CAS failure, a new request identity or a higher generation never grants successor effect rights. Positive predecessor exclusion/quiescence remains required before takeover, cleanup, claim release or resource reuse.

Qualification coordination is still non-product authority. Neither deployment intent, run/store state, Cloudflare deployment state nor the qualification controller can elect product-current Agent state or recover a lost `AgentDeliveryAuthority` route.

## 9. Q1-Q10 acceptance delta

No proof layer promotes another.

- **Q1 source/canonical:** rerun all inherited R4 source gates plus explicit journal/target integration: valid final deployment-v2 target is accepted by run/store v2; valid deployment-intent is accepted without V; provider-deploy rejects final-target substitution; non-provider state-changing operations reject intent-target substitution; target kind/profile unknown fields fail closed; v1 nonterminal state blocks migration; any supported quiescent-v1 migration preserves tombstones/high-water/replay barriers; ambiguous provider-deploy reconciliation retains claims and blocks duplicate effects.
- **Q2 Workers crypto:** unchanged and blocked until final exact deployment-v2 admission.
- **Q3 physical Android/Termux:** unchanged.
- **Q4 fresh bootstrap:** unchanged.
- **Q5 live provider/IAM:** unchanged final workers.dev/provider/route-owner/IAM/custody requirements, but its first provider effect is now fenced by deployment-intent.v1 rather than an impossible pre-known V.
- **Q6 live migration:** unchanged product migration semantics; all state-changing qualification is fenced by the final admitted deployment-v2 identity.
- **Q7 management loss/compromise:** unchanged.
- **Q8 release lifecycle:** unchanged.
- **Q9 rollback/provider-loss/retention:** unchanged product/provider recovery requirements; coordination-store v1/v2 migration is additionally fail-closed as Section 5 specifies.
- **Q10 deployed composition:** unchanged and bound to the final exact Revision-5 deployment-v2 identity.

Revision-4 Q1/A evidence is historical only. Revision-5 Q1 and A start unverified.

## 10. Deployment, rollback and failure behavior

The target remains the isolated non-production qualification substrate. No provider mutation is admitted until run/store v2 and deployment-intent source behavior pass Revision-5 Q1 at exact S and a new A is constructed from S.

If preflight cannot establish exact account subdomain, target service/predecessor state, intended namespace/class/jurisdiction or the required provider-resource claim identity, provider deployment is not dispatched. If provider effect becomes ambiguous, only authoritative reread/reconciliation can advance it. If final readback cannot form one exact deployment-v2 identity, Q5 remains unverified and Q2/product mutation remains blocked.

Coordination rollback never means forgetting a durable v2 barrier. Tooling that understands only v1 cannot resume a v2 campaign. Product-state rollback remains forward-only under D0027 and still requires an admitted provider/runtime identity.

## 11. Exact source and evidence descendant

Revision 5 uses strict Model B. One exact final source/normative commit `S` runs the complete Q1/source gate and builds the new deterministic A. `S` must contain a repository-owned `qualification/d0039-r5-source-equivalence.mjs` checker and a machine-delimited `D0039-R5-CURRENT-STATUS` WORKBOARD region before an evidence descendant may reuse S.

An optional evidence descendant may add only newly created immutable `docs/evidence/group-f-d0039-r5-*.json` and modify only the bounded R5 status region. Any `qualification/**`, `test/**`, product/tool/package input, Design, DEPLOYMENT, QUALIFICATION, PROGRAM or routing-semantic change creates a new S and reruns full Q1. R3/R4 evidence/checkers remain immutable historical namespaces.

## 12. Owner synchronization and implementation order

This accepted revision authorizes only the following forward correction:

1. synchronize QUALIFICATION and DEPLOYMENT with the two-target/run-store-v2 meaning and update current routing/derived Design references to D0039@r5;
2. implement strict deployment-intent normalization/digest and run/store-v2 target dispatch without changing final deployment-v2 identity;
3. implement the explicit v1 migration barrier and only the safe quiescent migration behavior that can preserve all retained fences;
4. add focused executable falsifiers including the exact R4 journal mismatch regression and provider-generated-V sequencing;
5. add the R5 source-equivalence checker/status region;
6. establish exact source S, run full Q1, construct and verify new deterministic A;
7. only then reacquire needed provider/IAM/route-owner credentials through secret references and execute the fenced workers.dev Q5 admission;
8. continue Q2-Q10 only on the final admitted deployment-v2 identity.

If implementation requires a second product/effect authority, cannot preserve v1 durable barriers, changes final deployment-v2 runtime identity, needs another ingress/provider/trust root, or changes D0027/D0020 ownership, stop at the affected SDD boundary instead of widening Revision 5.

## 13. Acceptance status

Revision 5 is accepted on exact base `development@77be2a65db5318af621b5e6b157680cd7baf3803` from the executable journal mismatch and provider-version sequencing evidence. Acceptance changes contract meaning only. No Revision-5 source/Q1/A, run/store-v2 migration, Cloudflare mutation, final Q5, signer custody or Q2-Q10 proof is claimed yet.

The next admissible Class-2 action is the bounded Revision-5 qualification coordination/source correction above. Provider credentials are intentionally not requested or used until that source gate is green.
