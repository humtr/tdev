# Design 0041 — Installable Agent Pre-Genesis Material Binding

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-08-28
- Acceptance base: `development@effeb3c2b6182645e414cf8941ac5b85835e2c02`
- Trigger: D0039@r12 completed its fresh isolated route/custody admission, then phase-U application revalidation proved that current owners do not define the stable credential-provisioning identity or the release-delegation-to-D0027 trust projection needed to assemble the concrete-security register request without guessing
- Acceptance evidence: `docs/evidence/group-f-d0041-r1-pre-genesis-material-binding-acceptance-2026-08-28.json`
- Trigger evidence: `docs/evidence/group-f-d0039-r12-fresh-route-custody-admission-2026-08-28.json`
- Scope: exact non-authoritative pre-genesis credential identity/preparation plus root-verified release-trust projection and reconciliation required before D0039 phase-U may dispatch
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, installable-Agent security/keystore/qualification helpers and focused tests during later implementation
- Preserved owners: D0027 owns route/pending/current/generation/CAS authority; D0039 owns provider/Q4/phase-U/phase-P orchestration; D0040 owns evidence attestation; QUALIFICATION owns proof methods; DEPLOYMENT owns concrete device/release material wiring
- Explicit non-goals: no generic credential broker, backup, recovery, rotation or cross-route key service; no new management/release-root authority; no route/current authority; no provider mutation; no phase-U/P execution during acceptance; no private AndroidKeyStore key extraction

## 1. One-line definition

Make the already-selected D0027/D0039 credential and release-trust materials safe to prepare before genesis by giving the candidate credential one deterministic predecessor-bound correlation identity, projecting only root-authenticated release delegation into D0027 trust fields, and requiring authoritative reconciliation before dispatch, replay or cleanup.

## 2. Why this is a new Design

D0039@r12 intentionally repaired lost management/release custody and now has a fresh stable `UNREGISTERED` route with protected signing custody. That admission is no longer the blocker.

Application revalidation at the next phase-U boundary exposed a different problem. Concrete-security `register_installable_agent` requires an RSA-3072 public verifier, `credentialProvisioningId`, `trustSubjects`, `packageTrustSubjectDigest` and `trustStateDigest` before D0027 atomically creates `GENESIS_PENDING`. The current repository has the physical AndroidKeyStore adapter and release-delegation verifier, but does not own the missing correlation/projection rules. Q3 was deliberately no-mutation evidence and therefore cannot be promoted into a current credential.

Choosing a stable identifier/digest/trust mapping and defining the lifecycle of a device key prepared before authoritative register commit are Class-2 identity/security semantics. They are independently reusable from D0039's provider/Q sequencing, and R12 already prohibits continuing revision churn for an independently decidable lifecycle capability. `SDD.md` therefore requires D0041 rather than an improvised phase-U input or D0039@r13.

D0041 does not supersede D0039. D0039 remains the private deployment-realization owner and resumes only after D0041 closes this dependency.

## 3. Existing seams preserved

### 3.1 D0027 register remains the only genesis authority

`AgentDeliveryAuthority.registerInstallableAgent` remains the sole operation that allocates and commits the next genesis, installation, credential, package, trust-policy and lifecycle generations. D0041 never reserves or advances a generation in durable product state.

The authoritative pre-CURRENT predecessor view already exposes each generation high-water. D0041 may project the one next candidate as `highWater + 1` only for pre-dispatch preparation. A projection is not a reservation and loses immediately if the authoritative predecessor changes.

### 3.2 Existing AndroidKeyStore alias is reused

The existing `tdev.agent-keystore-alias.v1` record remains exact:

```text
profile
agentId
routeGeneration
installationGeneration
credentialGeneration
```

The existing deterministic alias/credential-ref functions and `TermuxAndroidKeyStoreCredential.provision` remain the physical realization. Provisioning first reads the exact alias, creates RSA-3072 only when the alias is absent, then rereads the exact public verifier. Private key bytes remain inside AndroidKeyStore.

### 3.3 Existing release delegation is reused

The existing `tdev.release-delegation.v1` contract remains authoritative for release trust. The route-scoped offline release root authenticates the normalized delegation; each delegated signer has one key ID/public key, one `active|retired|revoked` disposition and canonically sorted release subjects. The existing release verifier already requires the release-statement signer to be active and authorized for the exact package subject.

D0041 creates no second release registry and no second signature format.

## 4. Credential preparation identity

### 4.1 Preparation record

Introduce one strict profile:

```text
tdev.agent-credential-provisioning.v1
```

Its exact normalized record is:

```text
profile
agentId
routeGeneration
managementRequestId
expectedPredecessorDigest
installationGeneration
credentialGeneration
credentialRef
```

Requirements:

- `agentId` and `routeGeneration` equal the authoritative route;
- `managementRequestId` is the exact stable D0039 management request selected for the original phase-U register transaction;
- `expectedPredecessorDigest` is the exact authoritative `UNREGISTERED` predecessor digest used by that transaction;
- `installationGeneration` and `credentialGeneration` equal the corresponding authoritative predecessor high-water plus one;
- `credentialRef` is exactly the existing AndroidKeyStore credential reference derived from the exact existing alias record with those route/generation values.

### 4.2 Stable provisioning identifier

Define:

```text
provisioningDigest = typedDigest(
  "tdev.agent-credential-provisioning.v1",
  normalizedPreparationRecord
)
credentialProvisioningId = "cp1." + hexSuffix(provisioningDigest)
```

where `hexSuffix(sha256:<64 lowercase hex>)` is exactly the 64 lowercase hex characters. The resulting identifier is 68 characters, satisfies the current identifier grammar, is deterministic, and binds the device candidate to one route, one predecessor, one original management transaction and one projected credential identity.

Changing any bound field creates a different provisioning identity. An abandoned candidate may not be reinterpreted as belonging to another preparation record.

### 4.3 Candidate authority

A successfully provisioned AndroidKeyStore alias and its public JWK remain **non-authoritative candidate material**. They grant no route, pending, current, connect, management or release authority until D0027 commits the exact register transaction containing that verifier and provisioning ID.

The public verifier may leave the device for the phase-U request. The private key may not leave AndroidKeyStore or appear in repository, evidence, Task/Plan/result, logs or model-visible context.

## 5. Release-trust projection

D0041 permits only the following projection after successful root verification and normalization of the exact release delegation for the same `agentId` and `routeGeneration`.

### 5.1 Trust-policy generation

The delegation `trustPolicyGeneration` must equal the authoritative predecessor's trust-policy high-water plus one. A delegation for any other generation is not phase-U input for that predecessor.

### 5.2 Trust subjects

Construct D0027 `trustSubjects` by mapping every normalized delegated signer:

```text
trustSubjects[signer.keyId] = signer.disposition
```

No subject/key is invented and no disposition is inferred. The complete normalized signer set is projected so retirement/revocation remains visible to D0027 state instead of being erased by package selection.

### 5.3 Package trust subject

After the existing package verifier validates the release statement and exact package subject under that same delegation:

```text
packageTrustSubjectDigest = releaseStatement.signerKeyId
```

The key ID already is a canonical `sha256:` digest and D0027 permits trust subject/key identities. It must be present in `trustSubjects` with disposition `active`; the existing release verifier must also have proven that this signer authorizes the exact package subject. No aggregate or synthetic package-subject digest is substituted.

### 5.4 Trust-state digest

Define:

```text
trustStateDigest = typedDigest(
  "tdev.release-delegation.v1",
  normalizedReleaseDelegation
)
```

`typedDigest` hashes `domain || NUL || canonicalJson(record)`. Those are exactly the bytes authenticated by the existing release-root signature through `signedRecordBytes("tdev.release-delegation.v1", normalizedReleaseDelegation)`. `trustStateDigest` is therefore the SHA-256 identity of the exact root-authenticated trust-state message, not `digest({trustSubjects})`, a release-key-only digest, or another synthetic summary.

The route `releaseRootKeyId`/public key must equal the root identity that verified the delegation.

## 6. Pre-dispatch admission

Before any phase-U register dispatch, the controller must freshly reread the authoritative route and prove all of the following still hold:

- state is exactly `UNREGISTERED`;
- route identity, management identity and release-root identity are unchanged;
- predecessor digest equals the preparation record's `expectedPredecessorDigest`;
- projected installation/credential/trust-policy generations still equal the relevant high-water plus one;
- the selected stable management request is still valid under D0039 request sequencing;
- the exact AndroidKeyStore alias rereads to the same public verifier/credential key ID;
- the exact root-verified delegation still produces the same `trustStateDigest` and trust-subject projection;
- the package still verifies under the same active delegated signer and manifest digest.

Any mismatch blocks dispatch. Preparation does not let the controller repair or overwrite product state.

## 7. Register ambiguity, replay and orphan cleanup

D0039/R9's exact-original-register reconciliation remains authoritative. D0041 adds no second retry protocol.

If phase-U transport/result is ambiguous, do not generate a new management request, provisioning ID, key or trust snapshot. First reread authoritative route state:

- if exact `GENESIS_PENDING` state proves the original register committed with the same candidate credential/provisioning/trust identities, retain the exact alias and continue only under D0039 phase-P rules;
- if the route remains the exact unchanged `UNREGISTERED` predecessor, only the existing exact-original-request replay rule may authorize another dispatch;
- if another predecessor/pending/current identity won, the prepared key is an orphan candidate and grants no authority.

Cleanup of an orphan is allowed only after authoritative readback proves that exact credential identity was not consumed by a committed pending/current state. Cleanup operates on the exact deterministic alias/credentialRef. A missing alias after proven no-consumption is already clean; an ambiguous/mismatched alias fails closed rather than deleting another key.

An orphaned provisioning identity and alias may never be rebound to a different route/predecessor/management request/generation combination.

## 8. Relationship to phase-P and D0040

Phase-P must use readiness observations for the exact credential/public verifier selected by the committed pending state. A newly minted replacement key cannot satisfy readiness for an already committed pending identity.

D0040 remains independent. D0040 authenticates evidence observations; it does not mint the Agent credential, define release trust or turn candidate material into current state. Conversely, D0041 does not authenticate bootstrap/package/verifier/local readiness evidence.

## 9. Failure and safety properties

- Keystore source-lineage mismatch, non-RSA-3072 readback, ambiguous alias or verifier change blocks phase-U.
- Release-root mismatch, delegation signature failure, generation mismatch, malformed signer set, inactive package signer or package-subject mismatch blocks phase-U.
- A prepared key survives process/controller restart only as an exact alias-bound candidate; durable product authority remains the route readback.
- Timeout, process loss or controller lease loss never proves register non-commit and never authorizes remint or delete.
- No secret/private bytes are required for server-side reconciliation.
- D0041 does not make qualification coordination or local custody state product authority.

## 10. Implementation ordering

1. Add pure normalization/identity helpers for the credential preparation record/ID and release-delegation trust projection.
2. Add focused deterministic, substitution, stale-predecessor, disposition, generation and exact-digest tests without device/provider mutation.
3. Add one qualification/deployment preparer that combines authoritative predecessor readback, existing AndroidKeyStore provisioning and existing release verification into a phase-U input candidate while keeping dispatch disabled.
4. Run the full registered source gate and record exact source evidence.
5. Separately qualify real supported-Termux candidate preparation/readback and exact orphan/reconciliation behavior with no phase-U dispatch.
6. Only after D0041 source and physical preparation gates pass, return control to D0039@r12 for a fresh provider/Q4/route admission and the one exact phase-U transaction.

## 11. Acceptance matrix

| Area | Required acceptance |
| --- | --- |
| owner boundary | D0027 remains sole route/pending/current/generation/CAS authority; D0039 remains phase-U/P orchestrator |
| provisioning identity | deterministic `cp1.<64hex>` binds exact route, predecessor, management request, projected generations and credentialRef |
| keystore | existing deterministic AndroidKeyStore alias is reused; private key never leaves AndroidKeyStore |
| candidate status | pre-register credential is explicitly non-authoritative |
| trust subjects | only root-verified delegated signer key IDs and exact dispositions are projected |
| package trust | exact verified release-statement signer key ID is the package trust subject and must be active/authorized |
| trust digest | SHA-256 identity is `typedDigest(tdev.release-delegation.v1, normalized delegation)`, matching exact root-signed bytes |
| stale fence | fresh predecessor/high-water/material reread is mandatory immediately before dispatch |
| ambiguity | authoritative route reconciliation precedes replay, remint or cleanup |
| orphan cleanup | delete only exact proven-unconsumed deterministic alias; no cross-preparation reuse |
| D0040 separation | evidence authentication stays independent from credential/trust material identity |
| acceptance effects | no device/provider/route/phase-U/phase-P mutation occurs merely by accepting D0041 |

## 12. Rejected alternatives

### Reuse historical synthetic trust digests

Rejected. Test `digest({trustSubjects})` and historical live `digest({releaseKey: ...})` values were convenient evidence inputs, not owner-defined release-trust state identities.

### Generate the Agent credential on the server

Rejected. D0039 already selected RSA-3072 in supported Termux:API AndroidKeyStore. A server key would violate the concrete credential realization and destroy the private-key custody boundary.

### Use a random provisioning ID

Rejected. It would correlate logs but would not deterministically bind the key to the exact predecessor/candidate/register intent needed for reconciliation.

### Treat pre-provisioning as a generation reservation

Rejected. Only D0027 register allocates authoritative generations. Local preparation is speculative and must tolerate losing the race.

### Hide the rules inside D0039@r13

Rejected. This is independently decidable identity/trust/orphan-lifecycle meaning and the exact sort of revision churn R12 stopped. SDD therefore assigns a new Design owner.

## 13. Proof boundary

Acceptance authorizes only later source implementation/qualification after WORKBOARD routing. It does not provision a new Agent credential, create a release delegation, mutate provider or route state, dispatch phase-U/P, reinterpret the retained lost-key predecessor route, or promote any prior Q3/Q4 evidence beyond its original proof layer.
