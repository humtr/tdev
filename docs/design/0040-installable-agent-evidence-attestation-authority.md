# Design 0040 — Installable Agent Evidence Attestation Authority

- Status: `implementing`
- Revision: 1
- Class: 2
- Decision date: 2026-08-28
- Acceptance base: `development@fffd5c83ce4e8f2bb92cf9db7dc5526715121a75`
- Trigger: D0039@r10 pre-live admission established the exact R10 artifact but found no already-authorized concrete producer/verifier for the existing `tdev.installable-agent-evidence.v1` proof seam; R10 requires a separate SDD decision before creating or selecting signer custody/trust authority
- Acceptance evidence: `docs/evidence/group-f-d0040-r1-evidence-attestation-authority-acceptance-2026-08-28.json`
- Source evidence: `docs/evidence/group-f-d0040-r1-source-q1-2026-08-28.json` — exact tested source `development@7cb3af495916aecb18359a0f0b732343f487669e`; source/Q1 only
- Scope: the cryptographic authentication identity, proof envelope, least-authority signer/observer boundary, verifier configuration and deployment binding used by the existing D0027 installable-Agent evidence-verification seam
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, installable-Agent security/admission verifier wiring and focused tests during later implementation
- Preserved owners: D0027 owns evidence types, route/pending/current state and CAS; D0039 owns private D0027 deployment realization and Q4/Q5/Q6 sequencing; QUALIFICATION owns proof methods; DEPLOYMENT owns concrete runtime/provider binding; D0020/D0027 `AgentDeliveryAuthority` remains sole route-current/effect owner
- Explicit non-goals: no management/release/Q4/provider credential reuse; no generic signing service or credential broker; no route-current/effect authority; no evidence-semantic rewrite; no D0027 durable-state schema change; no Q4 execution; no provider/route/device/product mutation in acceptance

## 1. One-line definition

Authenticate every current D0027 use of the shared installable-Agent evidence seam with a dedicated least-privilege Ed25519 evidence-attestation identity that is independent of management, release, Agent credential, Q4 operator and provider authority, binds only the exact existing canonical evidence context, and remains deployment configuration rather than D0027 route-current state.

## 2. Why this is a new Design

D0039@r10 intentionally stopped short of selecting a concrete evidence signer. The pre-live admission at its current exact artifact then established that no existing owner explicitly authorizes a concrete producer/verifier for this purpose. Selecting signer custody and a new trust identity is therefore a Class-2 security decision.

This decision is independently variable from D0039's private deployment realization. D0039 still owns management/credential/release/bootstrap/provider/genesis realization, phase-U `UNREGISTERED` admission and phase-P exact `GENESIS_PENDING` continuation. D0040 owns only how the already-existing `AgentDeliveryAuthority` evidence-verifier seam decides that an evidence proof is authentic. Keeping this in D0039 would recreate the owner coupling corrected by R10, so `SDD.md` requires a new Design ID.

D0040 does not supersede D0039. R10 explicitly left this boundary unresolved and required a separate Design if new custody/trust authority proved necessary.

## 3. Existing seam and evidence scope

D0027 already constructs canonical contexts through `evidenceProofContext(type, routeBinding, details)` under `tdev.installable-agent-evidence.v1` and invokes one injected asynchronous verifier before CAS. Missing/rejected verification is zero-effect denial.

The current evidence-type vocabulary using this authentication seam is:

- `bootstrap_trust`;
- `package_verified`;
- `verifier_ready`;
- `local_ready`;
- `local_service_ready`;
- `positive_quiescence`;
- `service_stopped`;
- `clone_safe_activation`.

The first five are genesis readiness receipts; `positive_quiescence` authenticates predecessor cleanup/quiescence; the final two may appear in later D0027 management transactions. D0040 owns authentication for the common seam, not the semantic meaning or sufficiency of these evidence types. Adding or changing evidence semantics remains with D0027/the responsible lifecycle owner.

## 4. Selected attestation identity

### 4.1 Dedicated key family

Select one dedicated Ed25519 evidence-attestation public identity for each admitted deployment configuration that needs to accept D0027 evidence proofs.

The public-key identifier is derived under a distinct identity domain:

```text
tdev.installable-agent-evidence-attestor-public-key.v1
```

The signature domain is distinct from management and release signatures:

```text
tdev.installable-agent-evidence-attestation.v1
```

The signed record is exactly the canonical `tdev.installable-agent-evidence.v1` context supplied by `AgentDeliveryAuthority`; the signer may not add a second route/pending/current interpretation.

### 4.2 Separation from existing authority

The evidence-attestation key is not and must not be automatically derived from or substituted by:

- the Ed25519 management key;
- the offline release root;
- a delegated release signer;
- the Agent RSA credential/AndroidKeyStore key;
- the Q4 authenticated-operator capsule anchor or any historical operator key;
- Cloudflare/provider/IAM/qualification credentials;
- a route, run, claim, request, deployment or fencing identifier.

Compromise of one existing role therefore does not silently inherit evidence-attestation authority. Conversely, the evidence-attestation key grants no management, release, Agent possession, provider deploy, route-current, recovery or Q4-anchor authority.

## 5. Proof envelope

The implementation shall introduce a new strict public envelope profile:

```text
tdev.installable-agent-evidence-envelope.v2
```

with exactly:

```text
profile
keyId
context
signature
```

`context` must canonical-equal the context independently constructed by the receiving `AgentDeliveryAuthority`. `keyId` must equal the deployment-configured D0040 public identity. `signature` must be canonical Ed25519 over the exact context using the D0040 signature domain.

Historical R8 `tdev.installable-agent-evidence-envelope.v1` release-root-signed proofs remain historical evidence only. They do not migrate, alias or authenticate as v2.

## 6. Producer and signer boundary

The private attestation key belongs to a dedicated secret-preserving deployment/operator capability. Private bytes may not enter Worker/DO durable state, Agent state, repository/evidence, Task/Plan/result data, command line, logs or model-visible context.

The capability is **not a generic arbitrary-record signing service**. It may sign only a D0040 evidence-attestation request whose domain and canonical context satisfy the exact D0027 evidence schema and whose evidence observation has been admitted by the responsible evidence-specific reader/method. A caller-provided `evidenceDigest` by itself is not sufficient authority to obtain a signature.

Evidence semantics remain outside D0040: QUALIFICATION/DEPLOYMENT or another already-authorized evidence owner determines how `bootstrap_trust`, package verification, local readiness, service readiness, quiescence, stop and clone-safe observations are established. D0040 requires the producer to consume that authoritative observation rather than allow the candidate under test to self-authenticate it.

If a future implementation needs a reusable durable observation registry, generic broker, cross-controller effect lane or independent recovery lifecycle to make this producer work, that is not hidden inside D0040 and must return through SDD.

## 7. Verifier and deployment binding

The D0040 public key/ID is deployment configuration for the verifier and is not persisted into D0027 `AgentDeliveryAuthority` route/current state. This avoids creating a second route trust-policy generation or a D0027 state-schema migration.

A deployment that accepts v2 evidence must bind the exact attestor key ID/public key into its immutable runtime/deployment configuration identity. Provider/runtime readback used for a state-changing admission must therefore prove the verifier is running with the expected D0040 identity. Missing key configuration, wrong key ID, malformed envelope, context mismatch, unsupported profile or invalid signature fails before D0027 CAS.

Changing the attestor public identity changes deployment configuration identity and invalidates dependent provider/runtime admission evidence. Rotation proceeds by a newly admitted deployment/configuration binding; it does not mutate D0027 route-current trust state and cannot be smuggled in as an in-place signer alias.

Already committed D0027 readiness stores only its accepted evidence digest/receipt under D0027 rules. Rotation does not rewrite historical committed readiness or reinterpret a historical proof under a new key.

## 8. Relationship to Q4 and D0039

D0040 does not replace or satisfy Q4. Q4's capsule-v2 raw SHA-256 must still arrive through its separately authenticated operator channel before untrusted candidate/release transport and must still authenticate exact executed bootstrap closure.

D0039 may use D0040 only after D0040 source/deployment binding has been independently qualified and a fresh D0039 provider/runtime/route admission observes the exact configured attestor identity. The existence of source code, a public key, a signer handle or a signature does not close Q4, provider admission, phase-U/P or any deployed-product gate by itself.

## 9. Failure, replay and ambiguity

Evidence proof verification is pure admission before CAS. A bad proof has zero product effect and is safe to retry only as a new read/verification attempt; it does not authorize replay of a state-changing D0027 operation.

Exact D0027 evidence replay remains owned by D0027. An already accepted identical evidence digest may replay according to the existing owner contract. Changed evidence after first acceptance conflicts. Attestor availability or transport loss never mints a pending identity, advances a generation, elects CURRENT, retries an ambiguous D0027 effect or changes management request identity.

Attestation service unavailability leaves the dependent evidence gate unverified/blocked; it is not permission to fall back to management, release-root, release-signer, Agent credential or unsigned evidence.

## 10. Implementation ordering

1. Route accepted D0040@r1 as the selected source gate while retaining D0039@r10 as the private deployment-realization owner.
2. Add the dedicated attestor public-key identity/domain and strict v2 envelope normalize/verify functions.
3. Wire the qualification/deployment runtime verifier from injected D0040 public configuration; remove any possibility that v1 release-root proof is accepted as v2.
4. Provide only a narrow opaque attestation callback/interface for evidence-specific producer wiring; do not implement a generic signer broker or place private bytes in repository/runtime state.
5. Add focused positive/wrong-key/wrong-domain/context-substitution/type-substitution/malformed-proof/missing-config tests and verify zero state mutation on denial.
6. Run the complete source gate and record exact source evidence.
7. Only after source qualification, provision or bind a real secret-preserving attestor capability under deployment/operator control and independently verify provider/runtime readback of its public identity.
8. D0039 pre-live admission then requires both the separate fresh Q4 gate and a fresh provider/route admission that includes the qualified D0040 verifier identity before any live phase-U/P.

## 11. Acceptance matrix

| Area | Required acceptance |
| --- | --- |
| owner boundary | D0040 owns evidence authentication mechanism/custody only; D0027 owns evidence semantics/state/CAS; D0039 owns deployment/Q sequencing |
| key separation | evidence attestor is distinct from management, release root, delegated release signer, Agent credential, Q4 operator anchor and provider/IAM credentials |
| envelope | strict v2 envelope carries only profile/keyId/context/signature and cannot accept historical v1 by alias |
| context binding | signature covers exact receiver-constructed canonical `tdev.installable-agent-evidence.v1` context |
| least privilege | attestor can authenticate evidence only; no management/release/provider/route/current/recovery authority follows |
| producer | caller-provided digest alone cannot obtain a signature; evidence-specific authoritative observation remains required |
| verifier | missing/wrong config, key, context, profile or signature denies before CAS with zero product mutation |
| durable state | D0027 route/current schema gains no attestor field/generation and requires no state migration |
| rotation | key change is a deployment-config identity change requiring fresh admission, not in-place D0027 trust mutation |
| Q4 separation | D0040 never substitutes for the independent capsule-v2 operator anchor/executed-bootstrap proof |
| proof layers | source verification does not promote provider/Q4/D0039 phase-U/P/deployed evidence |

## 12. Rejected alternatives

### Reuse the offline release root

Rejected. R10 specifically restored its ordinary offline delegation role; making it an online evidence signer recreates the corrected exposure and coupling.

### Reuse the management key

Rejected. The management key already authorizes D0027 state-changing management. Letting it manufacture readiness evidence collapses mutation and evidence-authentication independence and makes one compromise sufficient to bypass the evidence fence.

### Reuse a delegated release signer

Rejected. Release signers authenticate release statements/package authorization, not local/runtime/quiescence truth. A release transport or signer must not self-authenticate unrelated readiness.

### Reuse the Agent RSA credential

Rejected. The candidate Agent is among the subjects whose readiness/possession is being established. Candidate-controlled possession cannot be the independent authority that authenticates all of its own readiness evidence.

### Reuse the Q4 operator anchor

Rejected. Q4 is an independent pre-transport bootstrap anchor. Turning that role into an ongoing live evidence signer changes its exposure/lifecycle and conflates two proof layers.

### Use a provider/IAM/qualification token or unsigned digest

Rejected. Those authenticate transport/provider access or fence coordination; they do not authenticate evidence truth. A digest is integrity identity, not authentication.

### Persist the attestor identity in D0027 route state

Rejected for Revision 1. The verifier public identity is deployment binding, not route-current product state. Persisting it would add a new route trust generation/migration and duplicate authority without a demonstrated requirement.

## 13. Proof boundaries

Acceptance authorizes only the later Class-2 source implementation described above after WORKBOARD routing. It performs no signer creation/provisioning, secret read, provider deployment, route mutation, device mutation, Q4 execution or D0039 phase-U/P.

A source pass may establish envelope/key/context semantics and fail-closed runtime wiring. A deployment pass must separately prove the actual configured public identity, secret-preserving producer/custody path, evidence-specific observation provenance and provider/runtime readback. D0039 live admission remains a later independent composition gate.
