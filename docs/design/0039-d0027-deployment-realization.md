# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 4
- Class: 2
- Decision date: 2026-08-25
- Acceptance base: `development@d2e4d4d67cbf34b4c6c11fa2e68951ef3c5a0285`
- Trigger: user-directed selection of a domainless `workers.dev` ingress after Revision-3 Q5 admission observed zero Cloudflare Zones in the target account
- Predecessor revision: D0039@r3, accepted and later partially executed through Q5 deployment admission
- Predecessor maintained text: `development@d2e4d4d67cbf34b4c6c11fa2e68951ef3c5a0285:docs/design/0039-d0027-deployment-realization.md`
- Predecessor acceptance evidence: `docs/evidence/group-f-d0039-r3-normative-correction-acceptance-2026-08-24.json`
- Predecessor source evidence: `docs/evidence/group-f-d0039-r3-source-verification-2026-08-25.json`
- Predecessor Q5 boundary evidence: `docs/evidence/group-f-d0039-r3-q5-deployment-admission-partial-2026-08-25.json`
- Acceptance evidence: `docs/evidence/group-f-d0039-r4-workers-dev-ingress-acceptance-2026-08-25.json`
- Scope: same D0039 deployment-realization owner family; replace the unavailable Cloudflare Zone-route ingress identity with a provider-observable exact `workers.dev` ingress identity while preserving the accepted S/A/V admission, single-writer, route-current, IAM, trust, qualification-journal and no-live-takeover boundaries
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, D0039 qualification deployment identity/provider/IAM readback tooling, deployment-realization proof tooling and bounded WORKBOARD current status
- Preserved owners: D0027@r1 remains the installable authenticated local-Agent owner; D0038@r1 remains the executor-capacity owner; the per-route `AgentDeliveryAuthority` remains the sole product-current owner
- Explicit non-goals: no owned domain requirement for the current qualification substrate; no Zone Route or Custom Domain substitution; no second product-current/effect authority; no new product credential/trust owner; no weakening of signer custody; no automatic qualification-controller takeover; no Q2-Q10 proof promotion; no secret/private-key bytes in repository/evidence/model-visible state

## 1. One-line definition

Realize the accepted D0027 installable authenticated Agent on an exact Cloudflare `workers.dev` Worker ingress, preserving D0039's exact S/A/V admission, 100-percent state-changing writer, route-owner/current authority, independent IAM observation, authenticated bootstrap, AndroidKeyStore possession and crash-safe qualification fencing without requiring a customer-owned DNS Zone.

## 2. Revision inheritance and historical preservation

Revision 4 is a same-Design correction under `SDD.md`: the core problem, owner family, D0027 state model and deployment-admission sequence are unchanged. The exact Revision-3 maintained Design remains immutable and recoverable at `development@d2e4d4d67cbf34b4c6c11fa2e68951ef3c5a0285`. All Revision-3 meaning not explicitly overridden by this Revision-4 record remains normative.

In particular, Revision 4 preserves without semantic relaxation:

- strict canonical JSON, typed digests and signed-domain separation;
- the exact Termux:API AndroidKeyStore RSA-3072 credential profile, no private-key export/file fallback and independent Termux/Termux:API source-lineage evidence;
- one-shot current-key possession, `c1:<seq>` connection-request replay floors and durable challenge-generation high-water;
- one immutable route-generation Ed25519 management identity, `m2:<seq>` management request identity, `managementRequestSequenceHighWater`, stable multi-phase request identity and no HMAC/MCP/Agent management fallback;
- offline Ed25519 release root, bounded delegated signer set, signed delegation/release statement chain, untrusted package transport and forward-only package rollback;
- independently authenticated `tdev.agent-bootstrap-trust-capsule.v2` digest and the Revision-3 executed-bootstrap TCB/verified-bytes-equal-executed-bytes constraints;
- the existing per-route `AgentDeliveryAuthority` as the only product-current owner and the Worker/Durable Object as verifier/transport rather than a second current registry;
- D0020-only -> UNREGISTERED -> GENESIS_PENDING -> CURRENT as the only D0027 genesis migration, first-marker permanent HMAC disablement, higher-route-only authority recovery after canonical route loss, monotonic generations/floors/tombstones and storage-pressure fail-closed behavior;
- authenticated gate evidence, persistent qualification run/claim journal, exclusive mutation lane, exact CAS transitions, reconciliation of ambiguous effects, and the prohibition on automatic live controller takeover;
- Q2-Q10 as independent executable proof layers which cannot be promoted by source or provider evidence from another layer.

Where this record conflicts with Revision 3, Revision 4 controls only the deployment ingress identity, the dependent provider/IAM readback contract, the deployment-identity schema/profile, and the Q5 checks that referred specifically to a Zone route object.

## 3. Executed falsifier and correction boundary

Revision-3 Q5 admission was attempted against Cloudflare account `11efca097a2e54ea53b457dcf9f36454`. The exact source S was verified, exact artifact A and manifest were constructed and verified, provider and independent IAM observer API-token principals were separately identified, and the IAM observer successfully read the provider token policy. Fresh provider observation then established `Cloudflare Zones = 0` and `Active Zones = 0`. No provider mutation occurred and immutable V was not created.

Revision 3 required the active R identity to include an exact Cloudflare Zone route object ID/pattern. With no Zone, that R cannot exist. Treating `workers.dev` as though it were a Zone Route would falsify rather than satisfy the accepted readback contract. The user selected the domainless alternative, so the same D0039 owner family advances to Revision 4 rather than silently changing Revision 3 or purchasing an unrelated external dependency.

This falsifier does not invalidate the previous Q1 source observations for Revision-3 source S, the constructed Revision-3 A as historical evidence, the account/token identities, the independent token-policy observation or the predecessor Worker/namespace observations. It does invalidate their use as terminal Revision-4 S/A/V/R evidence. Revision-4 semantic source changes create a new S and therefore require a fresh Q1 and a newly constructed A.

## 4. Exact workers.dev ingress identity

Revision 4 selects `workers_dev` as the only admitted provider ingress kind for the current isolated non-production qualification substrate. The exact provider-observable ingress identity is:

```text
accountId
+ Worker service/script name
+ account workers.dev subdomain
+ exact hostname <worker-script>.<account-subdomain>.workers.dev
+ workers.dev enabled = true
+ preview URLs enabled = false
```

The account subdomain is read from the Cloudflare account control plane. The Worker-specific `enabled` and `previews_enabled` state is independently read from the Worker subdomain control plane. The qualification endpoint is exactly the credential-free HTTPS origin:

```text
https://<worker-script>.<account-subdomain>.workers.dev
```

No caller-supplied alternate hostname, Zone ID, route ID, route pattern, Custom Domain, preview URL or redirect may substitute for this origin. The exact origin is derived from provider readback before the qualification bearer credential is transmitted. Preview URLs are disabled because an additional provider-generated ingress hostname would make the admitted ingress set larger than the exact R identity.

`workers.dev` is an ingress locator and provider-routing fact only. It is not a product credential, trust root, current-state owner, recovery authority or signer. A future business-critical/public-production move to an owned domain, Custom Domain or Zone Route is a deployment/cutover semantic change and requires the then-applicable Design revision rather than implicit promotion of this qualification ingress.

## 5. Exact S/A/V/R admission

Revision 4 preserves the strict admission sequence:

```text
S -> A -> V -> deployment/cutover -> exactly 100% state-changing writer
  -> provider readback -> route-owner readback -> exact S/A/V/R join
```

Definitions are:

- `S`: the exact source/normative commit that passes the complete Revision-4 Q1/source gate.
- `A`: the exact build/release archive plus manifest deterministically constructed from S and verified before deployment. A Revision-3 artifact is historical and cannot be relabeled as Revision-4 A after semantic source change.
- `V`: the immutable Cloudflare Worker version that binds exact S/A and the admitted deployment configuration.
- `R`: the active provider/runtime identity joining account/service, deployment/config epoch, exactly 100-percent state-changing traffic ownership, exact `workers.dev` ingress identity from Section 4, Worker script, Durable Object namespace/class/jurisdiction, exact Durable Object route identity and route-current verifier bindings.

The deployment-admission portion of Q5 precedes Q2 and every state-changing live gate. Mixed/canary state-changing writers are forbidden. Provider active-version identity and route-owner version identity must agree in one stable deployment epoch. Observations from different deployment/config epochs cannot be spliced.

The active Worker must export `AgentDeliveryRuntimeDO`, bind exactly the expected `TDEV_AGENT_DELIVERY` Durable Object namespace, read back the expected namespace/class/script/jurisdiction, and expose the exact route-current tuple/verifier identity from the sole `AgentDeliveryAuthority`. Historical resource names are locators only.

## 6. Revision-4 deployment identity and runtime fence

The mutation-bound deployment identity advances from `tdev.installable-agent-qualification-deployment.v1` to:

```text
tdev.installable-agent-qualification-deployment.v2
```

The v2 identity contains exact S/A/V, account/service, deployment/environment/epoch, `stateChangingTrafficPercentage=100`, qualification endpoint origin, `ingressKind=workers_dev`, account subdomain, exact workers.dev hostname, `workersDevEnabled=true`, `workersDevPreviewsEnabled=false`, Worker script, namespace ID/name, class, jurisdiction, agent ID, route generation, Durable Object ID, route-current tuple digest and route-verifier digest. Revision-3 `routeId` and `routePattern` fields are not optional compatibility fields; they are absent from the strict v2 schema and unknown members fail closed.

The deployed qualification Worker carries the same immutable v2 facts as plain-text deployment bindings and reconstructs its runtime identity before every state-changing qualification mutation. `expectedDeploymentIdentityDigest` remains mandatory on mutation RPCs and is now the typed digest of the v2 deployment identity. Mismatch fails as `qualification_runtime_identity_mismatch` before product mutation with positively established zero product effect.

The outer qualification RPC remains `tdev.installable-agent-qualification-rpc.v2` and terminal evidence remains `tdev.installable-agent-qualification-evidence.v2`; their semantics did not need a new outer profile merely because the nested deployment identity advanced. Old code that only understands deployment identity v1 cannot be used to authorize a Revision-4 mutation.

## 7. Provider and IAM observation

Q5 still requires independent direct observations from `provider_control_plane`, `route_owner_runtime` and `iam_control_plane`.

Provider control-plane readback must establish in one stable epoch:

- exact account and Worker/service;
- active deployment and exactly one active V at 100 percent state-changing traffic;
- exact workers.dev account subdomain and Worker `enabled=true`, `previews_enabled=false` state;
- exact derived Worker hostname/origin;
- exported Durable Object class and exact namespace binding/namespace identity/jurisdiction;
- immutable plain-text S/A/deployment/ingress bindings;
- secret-name inventory without secret values;
- route-owner endpoint reachability only at the admitted workers.dev origin.

The route-owner runtime readback must independently return the same v2 deployment identity/digest, exact S/A/V, Durable Object route binding, route-current tuple/verifier digest and public management/release/current-credential verifier fingerprints. Provider and route-owner facts must exact-join; self-report alone is insufficient.

IAM separation remains mandatory. The deployment/provider principal requires effective `Workers Scripts Write` (or provider-equivalent Edit alias) on the exact account because Revision 4 no longer mutates a Zone Route. `Workers Routes Write` may exist on a previously provisioned token but is not a Revision-4 minimum-proof requirement and its presence does not create a Zone dependency. A distinct IAM observer principal must use the appropriate API-token-read namespace (`Account API Tokens Read` for an account-owned provider token or `API Tokens Read` for a user-owned provider token) to read the provider token policy.

Cloudflare token-policy observation proves only the provider/IAM principal and permission separation it directly observes. It does **not** prove that deployment has no management/release private key or that management/release signers have no provider privilege. Terminal Q5 therefore remains false until independent non-secret evidence proves the accepted management/release signer private-key custody and authority separation. Secret/private-key values are never evidence.

## 8. Qualification journal, effects and no-live-takeover

Revision-3 `tdev.installable-agent-qualification-run.v1` and `tdev.installable-agent-qualification-claim.v1` remain normative. Before any external/product/provider/device mutation, the controller durably records `PREPARED` with the exact Revision-4 S/A/V/R target identity, complete stable mutation identity, resource claims and expected predecessor digest/revision. Updates use strict compare-and-swap.

The legal family remains:

```text
PREPARED -> DISPATCHED -> RECONCILING
  -> TERMINAL_NOT_ADMITTED | TERMINAL_APPLIED | TERMINAL_CONFLICT
  -> CLEANUP_PENDING -> CLEAN
```

`STILL_AMBIGUOUS` and admitted-in-progress outcomes remain nonterminal and block duplicate effects. There is exactly one qualification mutation controller for a live mutation lane and no automatic takeover. Timeout, disconnected controller, process loss, claim expiry, higher generation or new request identity does not authorize successor mutation. Positive predecessor exclusion/quiescence under the qualification protocol is required before successor effects or resource reuse.

The workers.dev correction does not turn provider routing into a qualification-current owner. The journal cannot authenticate/elect product state and cannot recover a lost `AgentDeliveryAuthority` route.

## 9. Q1-Q10 acceptance delta

No gate may promote another layer.

- **Q1 source/canonical:** all inherited Revision-3 source/canonical, crypto, replay, migration, journal/claim and fail-closed vectors, plus deployment-identity v2 strictness, exact workers.dev hostname/origin derivation, legacy Zone-route-field rejection, workers.dev-disabled rejection, preview-URL-enabled rejection, provider/route-owner identity drift rejection and R4 IAM least-privilege/separation vectors.
- **Q2 Workers crypto:** unchanged mechanism; executes only after Revision-4 Q5 deployment admission on exact V/R.
- **Q3 physical Android/Termux:** unchanged RSA-3072 AndroidKeyStore/lineage/custody proof.
- **Q4 fresh bootstrap:** unchanged Revision-3 capsule-v2/executed-bootstrap proof.
- **Q5 live provider/IAM:** replace Zone-route-object proof with exact workers.dev account-subdomain + Worker-subdomain configuration + exact hostname/origin proof; retain exact account/service/V/100-percent-writer/class/namespace/jurisdiction/route-owner/public-verifier/IAM/custody/secret-inventory proof.
- **Q6 live migration:** unchanged D0020-only -> nested-v2 UNREGISTERED -> GENESIS_PENDING -> CURRENT proof, now mutation-fenced by deployment identity v2.
- **Q7 management loss/compromise:** unchanged.
- **Q8 release lifecycle:** unchanged.
- **Q9 rollback/provider-loss/retention:** unchanged except any provider ingress recovery must re-establish a newly admitted exact Revision-4 R before dependent mutation.
- **Q10 deployed composition:** unchanged composition requirement, bound to the final exact Revision-4 provider/runtime identity.

Q2-Q10 remain unverified at Revision-4 acceptance. Prior Revision-3 Q1 and partial Q5 evidence remain historical observations only and cannot close Revision-4 gates.

## 10. Deployment, rollback and failure behavior

The current target is an isolated non-production qualification substrate. Deployment creates/builds A from exact S, provisions the selected qualification Worker/configuration, ensures workers.dev is enabled and preview URLs are disabled, establishes one immutable V at 100 percent state-changing traffic, and then performs provider and route-owner readback before Q2 or state-changing qualification.

A missing account workers.dev subdomain, disabled Worker workers.dev ingress, enabled preview URLs, hostname/origin mismatch, ambiguous namespace/class, mixed Worker versions, missing immutable S/A bindings, route-owner mismatch or inability to read required IAM policy blocks Q5. There is no fallback to a Zone route, preview URL, alternate Worker hostname or stale predecessor endpoint.

If provider mutation is dispatched and its outcome becomes ambiguous, the qualification journal reconciliation rules control; a new V, configuration change or cleanup is not guessed. Rollback may activate only code read-compatible with surviving durable state/fences and must restore an exact admitted identity. Product-state rollback remains forward-only under D0027 rules. Loss/corruption of the canonical route-current owner still requires separately authorized higher-route recovery rather than same-name provider recreation.

## 11. Exact source and evidence descendant

Revision 4 keeps Revision-3 Model B but owns a new bounded checker and namespace. Exact final source/normative commit `S` runs the complete Q1/source gate. An optional descendant `E` may add only newly created immutable `docs/evidence/group-f-d0039-r4-*.json` and modify only the machine-delimited `D0039-R4-CURRENT-STATUS` region in `WORKBOARD.md` when a deterministic checker already present in S proves the restriction.

Any `src/**`, `native/**`, `qualification/**`, `test/**`, `tools/**`, package/lock input, Design, SECURITY, DEPLOYMENT or QUALIFICATION semantic change makes the descendant a new S and requires the full Q1/source gate again. Evidence names both `qualifiedSource=S` and, when present, `publishedEvidenceDescendant=E`; E is never reported as the source that ran Q1.

Revision-3 source/evidence descendants retain their own R3 checker/namespace and are immutable historical evidence. Revision-4 evidence does not rewrite them.

## 12. Owner synchronization and implementation order

This accepted Design revision authorizes the following order and no broader change:

1. synchronize SECURITY, DEPLOYMENT and QUALIFICATION to the exact workers.dev/v2 identity meaning;
2. implement the smallest production-shaped R4 deployment identity, Worker runtime binding, provider readback and IAM readback slice;
3. add strict focused falsifiers and a Revision-4 source-equivalence checker/status region;
4. complete one exact semantic source/normative S and run the full Q1 source gate at S;
5. build and verify a new exact A from S;
6. before provider mutation, establish the required qualification journal/claims and exact intended target facts available at that stage;
7. create immutable V, enable exact workers.dev ingress with previews disabled, establish exactly 100-percent writer ownership, and read back provider + route owner + IAM under one stable epoch;
8. close only the Q5 subclaims directly authenticated by those observations; signer custody/authority separation remains unverified until independent evidence exists;
9. execute Q2-Q10 only after terminal deployment admission and through the accepted durable qualification protocol.

If implementation requires a second public/durable product-current or effect-admission authority, changes D0027 generation/current ownership, needs an alternate trust root, cannot make workers.dev ingress unique without an additional unbounded hostname, or requires a materially different cutover/recovery axis, stop and return through `SDD.md` rather than widening this revision silently.

## 13. Acceptance status

Revision 4 is accepted at `development@d2e4d4d67cbf34b4c6c11fa2e68951ef3c5a0285` on the user-directed domainless-ingress decision and the executed Revision-3 Q5 falsifier. This acceptance establishes design meaning only. It does not claim Revision-4 source/Q1, A, V, workers.dev deployment, provider/route-owner join, terminal Q5, signer custody or Q2-Q10 have passed.

The predecessor Revision-3 evidence remains immutable. The next admissible Class-2 implementation is the bounded workers.dev/v2 vertical slice above; successful source tests may close Q1 only, and successful Cloudflare ingress readback may close only the provider facts it actually observes.
