# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 10
- Class: 2
- Decision date: 2026-08-28
- Acceptance base: `development@ca6b7eb48135309daac425181fc0b396627ba5b8`
- Predecessor revision: D0039@r9, maintained as `implementing` at the acceptance base
- Trigger: user-directed owner correction after a fresh, read-only R1-to-R9 scope audit found that real D0027 deployment invariants had become over-coupled to a separately decidable qualification control-plane and that R8 had expanded the original offline release-root role into a live genesis-evidence signer without a separate least-authority decision
- Acceptance evidence: `docs/evidence/group-f-d0039-r10-owner-boundary-correction-acceptance-2026-08-28.json`
- Scope: preserve the private D0027 credential/trust/provider/genesis realization, R9 transaction-bound `GENESIS_PENDING` continuation and exact replay semantics, while restoring qualification/evidence ownership boundaries and removing the persisted release-root key as D0039's mandatory live genesis-evidence signer
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, the installable-Agent evidence verification seam, qualification host/phase-driver implementation and focused tests
- Preserved owners: D0027@r1 remains the installable authenticated local-Agent owner; D0020 `AgentDeliveryAuthority` remains the sole route-current/effect owner; D0032 keeps `docs/QUALIFICATION.md` as the sole verification-method owner; D0037 keeps `qualification/` as a non-product executable boundary; D0038 remains the executor-capacity owner
- Explicit non-goals: no live Q6-B/phase-U/phase-P/provider/route/device mutation in this correction; no new signer service, credential broker, trust registry or recovery authority; no weakening of genesis-evidence authentication; no deletion or rewrite of R1-R9 evidence/history; no automatic reinterpretation of historical qualification journals/stores; no D0027 owner-model revision

## 1. One-line definition

Realize the accepted D0027 installable Agent with independently authenticated management, bootstrap, release and genesis evidence; exact provider/route binding; and one route-owned `UNREGISTERED -> GENESIS_PENDING -> CURRENT` transaction whose pending continuation and response-loss replay remain exact, while keeping qualification orchestration outside product authority and keeping the offline release root offline from ordinary genesis-evidence signing.

## 2. Fresh facts and correction trigger

Fresh binding at the acceptance base established all of the following.

1. D0027 already requires one `AgentDeliveryAuthority`-owned genesis transaction. `GENESIS_PENDING` stages subordinate trust/package/credential/readiness/quiescence evidence and exact response loss resumes the same pending identity; therefore R9's pending-continuation correction is a real product requirement rather than qualification invention.
2. The product source already had an injected asynchronous `verifyInstallableAgentEvidence` seam before R8. The route owner constructs a canonical evidence context and refuses mutation when the verifier is absent or rejects; the verifier itself does not elect product state.
3. D0039@r1 selected an **offline** Ed25519 release root whose product role is to sign release delegation. Active delegated release signers sign release statements. R8 later made the persisted release-root key the direct signer for every genesis-evidence envelope. D0027 does not require that concrete signer choice.
4. D0032@r2 makes `docs/QUALIFICATION.md` the sole owner of how claims are qualified. D0037@r1 makes top-level `qualification/` a permanent executable/navigation boundary, explicitly not a new normative behavior owner.
5. R3-R6 accumulated persistent qualification run/store/claim/controller formats, provider-intent/version admission, migration of the qualification store itself, repeated admission epochs and source-equivalence tooling. Those mechanisms can be useful qualification tools, but they are not D0027 product state and are not a ROADMAP capability exit by themselves.
6. The R9 phase driver and transport helper are non-product qualification code. They may sequence an already-authorized operation, but their existence does not establish a signer, provider admission, live deployment or Q6-B evidence.
7. Existing Q4 execution remains a separate proof layer. A cross-revision archive join is an evidence-reuse optimization, not product functionality.

The correction therefore narrows D0039 to one coherent problem again: concrete private D0027 deployment realization. It does not create a new qualification-infrastructure Design because this revision is **de-authorizing** that infrastructure as a D0039 product requirement. If a reusable durable qualification control-plane is later selected as an independently required authority or lifecycle, `SDD.md` requires its own Design.

## 3. Product invariants retained unchanged

R10 preserves the surviving D0039 product decisions unless this section explicitly narrows an ownership mistake.

### 3.1 Management identity and replay

Each route generation retains one immutable Ed25519 management public identity. Fresh management mutation uses canonical route-scoped `m2:<seq>` and the owner-local monotonic `managementRequestSequenceHighWater`. One authenticated request keeps the same request ID, operation, intent and original predecessor through every internal phase. Exact retained replay returns the prior result; changed intent/predecessor conflicts; compacted IDs at or below the durable floor remain permanently stale/non-creating. Private management-key bytes remain absent from Agent/product state, repository/evidence and model-visible context.

### 3.2 Credential and release trust

The selected supported Agent credential remains RSA-3072 in the declared Termux:API AndroidKeyStore profile. D0039 retains one immutable route-scoped Ed25519 release-root public identity and delegated Ed25519 release signers, forward-only trust-policy generations, revocation/retirement and no fallback authority.

The **release root is offline in the R10 product contract**. Its ordinary signing role is release delegation. Delegated release signers sign authorized release statements. Root loss/compromise semantics remain those of the selected release-trust model; R10 does not create an always-online root-signing dependency.

### 3.3 Independently authenticated bootstrap

The R7 executed-bootstrap closure remains product/security meaning: the independently supplied capsule-v2 digest authenticates the exact capsule, complete runtime bytes, verifier bytes and declared builtin/environment/cwd/network closure before untrusted release transport can influence execution. Verified bytes must be the bytes executed. Candidate transport cannot self-authenticate the trust anchor.

### 3.4 Provider and route binding

Provider/control-plane identity is a locator/admission input, never a credential or competing current-state owner. State-changing qualification against a concrete deployment must freshly bind the exact source/artifact/provider/runtime/route facts required by that operation. A stale deployment/route observation cannot silently authorize later mutation.

### 3.5 Genesis and first-current election

D0027 remains the sole state/effect owner for:

```text
D0020-only -> UNREGISTERED -> GENESIS_PENDING -> CURRENT
```

A qualification target may fence an already-owned transaction; it cannot mint a pending identity, candidate generation, receipt or CURRENT tuple. The R8 phase-U rule remains: initial bootstrap admission may begin only from a fresh authoritative `UNREGISTERED`/null-current read. The R9 phase-P rule remains: after registration commits `GENESIS_PENDING`, every subordinate operation binds the exact authoritative pending identity and a fresh pending readback. Changed/stale/competing/caller-invented identities fail before host dispatch.

Exact replay of the original register request is allowed only for response-loss reconciliation under the original request identity/body/digest; it cannot become a new registration attempt. Ordinary management, credential, package, trust, replacement, uninstall and recovery operations retain the current admitted-deployment fence.

## 4. R10 genesis-evidence authentication boundary

Genesis readiness/quiescence evidence remains untrusted until authenticated. R10 changes **who D0039 requires to sign it**, not the requirement to authenticate it.

The route owner constructs the canonical D0027 evidence context from authoritative route/pending facts and calls an injected asynchronous verifier **before CAS**. The verifier must positively authenticate the supplied proof against that exact context. Missing verifier configuration, missing proof, context mismatch, malformed proof or authentication failure denies the mutation with no durable effect. A proof or verifier cannot elect route state by itself.

R10 deliberately does **not** define the persisted offline release-root private key as the universal live evidence signer. A concrete deployed evidence-proof mechanism belongs to the responsible SECURITY/DEPLOYMENT proof owner and must preserve all of these constraints:

- authentication is independent of the candidate/evidence producer being authenticated;
- the proof binds the exact canonical route/pending/evidence context;
- signer/verifier authority is least-privilege and cannot become management, route-current or provider-deploy authority by implication;
- secret/private-key bytes remain outside repository, Task/result/evidence/model-visible state;
- response loss or proof retry cannot mint another D0027 mutation identity;
- introducing a new durable signer-custody owner, trust registry, effect-admission authority or cutover remains a new Class-2 Design decision.

A delegated release signer, operator-owned evidence signer or another mechanism is not selected merely because it is available. Its use requires existing owner authority that expressly covers the evidence purpose or a separate accepted Design.

The R8 release-root-signed envelope remains valid historical R8 source/evidence meaning. It is not silently reinterpreted as R10 deployment authority.

## 5. Qualification ownership correction

`docs/QUALIFICATION.md` owns verification methods and proof-layer boundaries. Top-level `qualification/` contains permanent non-product executables. Neither location becomes product authority merely because a D0039 falsifier uses it.

Accordingly, R10 removes the following from **current D0039 product/exit meaning**:

- the qualification run/store/claim/controller records introduced in R3;
- their v1/v2/v3 qualification-store migrations;
- provider-deployment-intent as a reusable product schema;
- qualification-controller lease/takeover policy as D0027 product state;
- revision-specific source-equivalence tools as a product requirement;
- the R9 phase driver or workers.dev transport helper as a required product API;
- exact old/new Q4 archive joining as product functionality.

Historical files and evidence are preserved. Existing qualification journals/stores are not deleted, rewritten or automatically migrated by R10. A bounded qualification execution may still use repository-owned tools when the current qualification/deployment owner explicitly admits them and they introduce no new authority. If durable reuse, cross-controller takeover, resource-claim ownership or a generic live effect lane is required beyond a bounded proof run, that independent lifecycle crosses the `SDD.md` new-Design boundary.

The R6 insight that Q labels form a dependency/invalidation DAG survives as **qualification method**, not product state. Provider/route facts invalidated by a mutation must be freshly reread before a dependent proof. Q10 may compose only mutually compatible evidence for the surviving final lane.

## 6. R10 phase-driver boundary

`qualification/installable-agent-r9-phase-driver.mjs` may remain as an optional non-product sequencer for focused qualification, but R10 narrows its authority:

- it may accept an already-authorized RPC callback;
- it may use the existing opaque management-signing capability for management operations;
- it may accept already-produced opaque genesis evidence proofs from the responsible proof owner;
- it may perform fresh route reads, construct phase-U/P qualification projections and enforce exact replay/request binding;
- it may not acquire credentials, choose an evidence signer, call the offline release root to manufacture evidence, introduce a credential broker, retry an ambiguous effect, mint pending/current identity or own recovery.

The endpoint-bound workers.dev helper remains optional transport wiring only. Concrete provider/auth/token wiring stays DEPLOYMENT-owned and must be freshly admitted for any live use.

## 7. Q4 retention and rerun rule

Existing independently authenticated Q4 execution is retained only at the proof layer it actually established. Reuse across a later source/artifact is allowed when the required capsule/runtime/verifier/archive invalidation relation is positively established.

If the exact archive join needed for reuse is unavailable or materially more expensive than rerunning the bounded Q4 method, qualification should rerun the bounded current Q4 rather than creating additional product or durable qualification machinery merely to preserve an old PASS. Protected operator material is not read or regenerated simply to make a repository join convenient.

## 8. Compatibility, migration and rollback

R10 acceptance itself performs no provider, route, device, credential, secret or product mutation.

There is no D0027 durable-state migration in this correction. Current D0027 route state remains whatever the authoritative route owner says at live admission time. Previous R8/R9 provider/readback evidence remains historical and cannot authorize a future phase-U after source/owner changes.

Historical qualification run/store bytes retain their historical meaning. R10 neither requires them for product compatibility nor authorizes their automatic reinterpretation. If a future qualification run elects to reuse them, the qualification owner must first prove the exact predecessor state and supported lifecycle; otherwise it starts no effect.

Repository rollback of an unpublished source correction is ordinary Git rollback. After publication, any semantic reversal moves forward through SDD. Provider/runtime rollback remains separately owned by DEPLOYMENT and cannot be inferred from this Design correction.

## 9. Acceptance matrix

| Area | Required acceptance |
| --- | --- |
| lifecycle | R9 remains recoverable as predecessor history; maintained D0039 becomes accepted R10 before source implementation |
| coherent owner | D0039 current meaning is private D0027 deployment realization; reusable qualification control-plane ownership is not hidden inside it |
| D0027 owner | `AgentDeliveryAuthority` remains the sole pending/current/effect owner |
| management | immutable management identity, `m2` replay/floor and exact predecessor semantics are unchanged |
| release trust | offline release root retains delegation role; delegated release signer/revocation model remains; no mandatory online root evidence signer |
| evidence | every genesis evidence mutation requires an authenticated proof checked by an injected async verifier against exact canonical context before CAS; missing/rejected proof is zero-effect denial |
| R9 continuation | phase-U `UNREGISTERED` and phase-P exact `GENESIS_PENDING` continuation/replay rules remain |
| qualification boundary | QUALIFICATION owns methods; `qualification/` tools are non-product; historical run/store/claim/controller machinery is preserved without remaining a D0039 product requirement |
| phase driver | optional sequencer only; no evidence-signer selection, credential lookup, generic broker, new authority or blind retry |
| Q4 | old execution may be reused only with positive invalidation/join proof; bounded rerun is preferred to growing join machinery when cheaper |
| proof layers | source implementation cannot promote provider/Q4/Q6-B/Q5-R0/Q2-Q10 evidence |
| external effects | acceptance/source correction performs no provider/route/device/product/secret mutation |

## 10. Rejected alternatives

### Keep the R8 release root as an online genesis-evidence signer

Rejected as the default D0039 contract. It expands an offline root's ordinary signing duty and operational exposure without a D0027 requirement or a separately evaluated least-authority reason.

### Remove genesis-evidence authentication entirely

Rejected. D0027 pending evidence remains security-sensitive input and must be authenticated before CAS.

### Create a generic signer/dispatcher service merely to make the R9 harness runnable

Rejected. Availability of an implementation mechanism is not authority to create a new custody, trust, recovery or effect-admission owner.

### Delete R3-R9 qualification tools and evidence

Rejected. They are useful regression/history/provenance and may remain bounded proof executables. R10 corrects ownership, not history.

### Promote the qualification journal/controller into a new product subsystem now

Rejected because no current ROADMAP/product requirement independently selects it. If a reusable durable qualification control-plane is later required, it receives its own Design rather than re-expanding D0039.

### Build more Q4 archive-join machinery

Rejected by default. Exact reuse is valuable only while cheaper than a bounded fresh proof and does not justify new product state.

## 11. Implementation ordering and stop rules

1. Publish this R10 acceptance/owner correction with no product source mutation.
2. Change the generic evidence context/qualification host so D0039 no longer assumes the persisted release root is the evidence signer; preserve async injected verification and fail-closed denial.
3. Narrow the phase driver to forward externally supplied authenticated evidence proofs rather than manufacture release-root signatures; preserve management signing, phase-U/P reads, replay identity and no-blind-retry behavior.
4. Run focused evidence/phase-driver/admission tests, then the complete baseline source gate from `docs/QUALIFICATION.md` and review the effective diff.
5. Record source evidence and keep D0039 `implementing`; source success closes no live provider/device/deployed-product gate.
6. Before any future live phase-U, fresh-bind the published R10 S/A/provider/route, resolve the authorized evidence-proof producer/verifier without exposing secret bytes, and establish Q4 by valid reuse or bounded rerun.
7. Execute phase-U/P only under fresh live admission. Unknown external outcome is reconciled through authoritative route readback; never blind retry.

Stop and return through SDD instead of implementation if closure would require a new signer-custody owner, generic durable qualification effect authority, second route-current owner, provider cutover or another independently decidable security/migration contract.

## 12. Revision preservation

Historical revision identities remain recoverable from Git and their immutable evidence artifacts:

| Revision | Surviving meaning in R10 |
| --- | --- |
| R1 | concrete management/credential/release/bootstrap/provider/genesis realization; offline-root/delegated-signer model |
| R2 | stable route-scoped `m2:<seq>` management identity and replay floor |
| R3 | executed-bootstrap/gate-authentication lessons survive; persistent qualification controller is historical tooling, not product authority |
| R4 | exact workers.dev ingress/provider binding where that deployment is claimed |
| R5 | provider-generated output must be reconciled by authoritative reread; run/store migration is historical qualification tooling |
| R6 | Q dependency/invalidation DAG and pre-CURRENT route-bootstrap insight survive as qualification method |
| R7 | terminal executed-bootstrap closure survives unchanged |
| R8 | pre-CURRENT admission and async authenticated evidence-before-CAS survive; mandatory release-root evidence signer is superseded |
| R9 | exact transaction-bound `GENESIS_PENDING` continuation and register replay survive unchanged |

R10 is the maintained accepted meaning. Earlier Design/evidence text is historical evidence for the revision that produced it and does not override this owner.
