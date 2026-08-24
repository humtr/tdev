# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 3
- Class: 2
- Decision date: 2026-08-24
- Acceptance base: `development@1e132a24c213463564990180567dac4bd19fb6eb`
- Trigger: user-directed application of ACR campaign `tdev-20260824-d0039-normative-reopening-owner-correction-01`, convergence `acr/tdev-20260824-d0039-normative-reopening-owner-correction-01/convergence`
- Predecessor revision: D0039@r2, maintained as `implementing` at the acceptance base
- Predecessor acceptance evidence: `docs/evidence/group-f-d0039-r2-management-request-correction-acceptance-2026-08-23.json`
- Predecessor source evidence: `docs/evidence/group-f-d0039-r2-d0027-deployment-realization-source-verification-2026-08-24.json`
- Predecessor Q3 continuation evidence: `docs/evidence/group-f-d0039-r2-q3-prequalification-and-continuation-split-2026-08-24.json`
- Acceptance evidence: `docs/evidence/group-f-d0039-r3-normative-correction-acceptance-2026-08-24.json`
- Scope: same D0039 deployment-realization owner family, corrected for authenticated executed bootstrap closure, authenticated gate evidence, exact source/artifact/provider/route admission, mutation-bound runtime identity, crash-persistent qualification reconciliation and strict qualification-controller fencing
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, D0039 qualification RPC/profile and proof tooling, and the existing D0027 substate in the per-route `AgentDeliveryAuthority`
- Preserved owners: D0027@r1 remains the installable authenticated local-Agent owner; D0038@r1 remains the executor-capacity owner; `AgentDeliveryAuthority` remains the sole route-current product owner
- Explicit non-goals: no new product credential/trust/current-state owner; no second route-current registry; no qualification authority that can authorize or elect product state; no wholesale candidate merge; no Q2-Q10 proof promotion; no secret/private-key bytes in repository/evidence/model-visible state

## 1. One-line definition

Realize the accepted D0027 installable authenticated Agent with one exact RSA-3072 AndroidKeyStore data-plane credential, immutable route-scoped Ed25519 management identity, offline-root/delegated Ed25519 release trust, independently authenticated bootstrap, one-shot current-key possession challenges, fresh provider binding/readback, same-route D0020 genesis migration and forward-only rollback/recovery, while keeping `AgentDeliveryAuthority` the sole route-current owner.

## 2. Boundary and owner preservation

This is a new narrow Class-2 realization Design, not D0027 Revision 2. The existing per-route `AgentDeliveryAuthority` remains the sole durable owner for D0020 connection/socket/executor, accepted/effective aggregate capacity, reservation/delivery/release state and D0027 installation, credential, package activation, trust policy, lifecycle, genesis, first-emission current state, possession challenge state, replay floors, generation high-waters and terminal tombstones.

`docs/SECURITY.md` owns the selected cryptographic identities, trust/custody/loss/compromise policy and prohibition on fallback authority. `docs/DEPLOYMENT.md` owns exact wire/provider/local realization and migration/rollback/deletion procedure. `docs/QUALIFICATION.md` owns Q1-Q10 proof methods. Worker/`AgentDeliveryRuntimeDO` verifies and transports; it is not another current-state registry.

No current evidence requires D0023/D0024 MCP identity, D0025 canonical Git publication, D0028 operational policy or whole D0026 provider topology to authorize this private Agent boundary. Provisional D0026 retains the remaining broader reproducible provider topology/configuration/rollback scope after this private realization is split out. D0039 may consume a separately accepted D0038 default executor capacity of 8, but does not own that number.

## 3. Canonical signed and wire representation

All new signed structured records use strict repository canonical JSON. Unknown members and alternate encodings are rejected before cryptographic acceptance. Signed bytes are exactly:

```text
UTF8(domain) || 0x00 || UTF8(canonicalJson(record))
```

There is no BOM, newline, trailing NUL or wrapper object. Structured typed digests use `sha256:<64 lowercase hex>`. Existing package-file SHA-256 values remain raw 64-lowercase-hex manifest values. Binary wire values use RFC 4648 base64url without padding; padding, whitespace, `+`, `/`, non-shortest forms and decode/re-encode mismatch are rejected. Standard WebCrypto algorithms only.

## 4. Agent credential profile

The only CURRENT Agent credential profile in this revision is Termux:API AndroidKeyStore through installed `termux-keystore`, RSA exactly 3072 bits, exponent exactly 65537/F4, and `SHA256withRSA` / WebCrypto `RSASSA-PKCS1-v1_5` SHA-256. Private-key export and file fallback are forbidden. Per-use user authentication is disabled for the unattended service profile. StrongBox/hardware backing is evidence-only.

Canonical RSA public JWK is exactly:

```json
{"e":"AQAB","kty":"RSA","n":"<base64url-no-pad 384-byte modulus>"}
```

The modulus decodes to exactly 384 bytes with MSB set. No other JWK member is admitted. `credentialKeyId = typedDigest("tdev.agent-credential-public-key.v1", canonicalRsaJwk)`. Provider/current state stores only public verifier identity and generations, never private bytes.

## 5. One-shot physical-connect possession

Possession state is subordinate durable state inside the same route `AgentDeliveryAuthority`, only after exact D0027 `CURRENT` exists. It never elects current.

The challenge endpoint receives the complete strict v2 connect request, recomputes the existing connect-request digest and validates the exact current tuple before allocating. At most one live challenge exists per route/current credential. Durable challenge state includes schema/profile, monotonically increasing `challengeGeneration`, exact `connectRequestDigest`, current `credentialGeneration` and `credentialKeyId`, 32 cryptographically random nonce bytes, integer `issuedAtMs`/`expiresAtMs`, and exact current-tuple digest. TTL is exactly 120000 ms; request body maximum is 8192 bytes. Same digest retried while live returns the same challenge; a different digest conflicts until consume/expiry.

The signed domain/profile is `tdev.agent-connect-possession.v1`, binding `agentId`, `routeGeneration`, `challengeGeneration`, nonce, `credentialGeneration`, `credentialKeyId`, `connectRequestDigest`, `issuedAtMs`, `expiresAtMs`. RSA signature decodes to exactly 384 bytes. Strict outer envelope profile is `tdev.agent-connect-possession-envelope.v1`.

The server requires semantic equality with the outstanding challenge, verifies the current pinned RSA key and durably consumes a valid challenge before `connect` installs/replaces a socket. Invalid signature does not consume. Consumed/expired challenge cannot revive. `challengeGeneration` high-water survives restart and terminal compaction.

`connectRequestId` is narrowed to `c1:<positive base-10 integer with no leading zeroes>`. Client persists a monotonic sequence. Owner persists `connectRequestSequenceHighWater` and accepts a new request only at `highWater + 1`. Exact retained retry may replay its receipt; any request at or below the permanent floor after compaction is ancient/stale. One live challenge and a bounded recent receipt window may retain detail; storage pressure rejects new mutation rather than deleting safety floors.

## 6. Management identity, replay and custody

Each `routeGeneration` has exactly one immutable Ed25519 management public key. No in-route management rotation/delegation, HMAC substitution, Agent fallback or MCP fallback exists.

Canonical public key is exactly:

```json
{"crv":"Ed25519","kty":"OKP","x":"<43-char base64url-no-pad raw 32-byte key>"}
```

`managementKeyId = typedDigest("tdev.agent-management-public-key.v1", canonicalEd25519PublicKey)`.

The signed semantic context is the existing `tdev.agent-management.v1` `managementProofContext`: operation, agentId, routeGeneration, managementRequestId, intentDigest, expectedPredecessorDigest. Signature is standard Ed25519, exactly 64 bytes / 86-character base64url-no-pad. Strict envelope profile is `tdev.agent-management-envelope.v1` with keyId/context/signature.

Fresh mutating `managementRequestId` is exactly `m2:<seq>`, where `seq` is an ASCII positive base-10 safe integer in `1..9007199254740991` with no leading zeroes. Its namespace is scoped to the exact `(agentId, routeGeneration)` already bound by the management proof; it is independent of installation, credential, package, trust and lifecycle generations. The sole route `AgentDeliveryAuthority` owns durable nonnegative-safe-integer `managementRequestSequenceHighWater`. A fresh mutation may propose only `highWater + 1`, and the owner atomically burns/advances that sequence with the transaction's first durable admission. Zero, signs, whitespace, alternate spellings, gaps, reuse and safe-integer exhaustion fail closed; exhaustion does not automatically create a new `routeGeneration`.

One admitted management transaction keeps the same `managementRequestId`, operation, `intentDigest` and original `expectedPredecessorDigest` through every draining/readiness/final active-or-revoked phase. Intermediate lifecycle generations are transaction phase state and never replace or rebind the request identity; every D0027 product-side lifecycle mutation still advances `lifecycleGeneration`. Replay classification is exact and permanent: retained exact receipt is checked first and returns its prior result; retained same-ID changed operation/intent/predecessor conflicts; otherwise any canonical `m2` sequence at or below `managementRequestSequenceHighWater` is retired/stale and non-creating, while a sequence above `highWater + 1` is a gap. Detail receipts/tombstones may compact only behind the durable high-water, and storage pressure rejects new mutation rather than lowering or deleting that floor.

Private management key is operator-held only, absent from Agent, repository, package, Cloudflare secrets, Durable Object state, evidence and logs. Backup may copy the same identity only. Total loss fails closed. Compromise retires/quiesces the route and requires separately authorized D0020 cutover to strictly higher `routeGeneration` with a fresh key. No in-route replacement.

## 7. Release root, delegated signers and package statement

Each route generation pins one immutable offline Ed25519 release-root public key. Root identity domain is `tdev.release-root-public-key.v1`; delegated signer identity domain is `tdev.release-signer-public-key.v1`. At most four delegated signer identities exist over route lifetime and at most two are active simultaneously.

Root signs strict `tdev.release-delegation.v1` for each `trustPolicyGeneration`, binding agentId, routeGeneration, trustPolicyGeneration, root key ID and a signer-key-ID-sorted unique signer array. Each signer contains public key, disposition `active|retired|revoked`, and authorized package/capability/service-host/target-platform subject tuples. A newer statement is installed only through authenticated management transition advancing trustPolicyGeneration.

Delegated signer loss/compromise uses a newer root-signed statement; compromised signer is revoked before replacement-dependent package acceptance. Root loss permits already-active signers to continue but prevents signer-set change. Root compromise requires route retirement and higher route generation; no in-route root replacement.

An active delegated signer signs strict `tdev.installable-agent-release-statement.v1` with `releaseManifestDigest`, raw archive `archiveSha256` and `signerKeyId`. Verification order is current active signer -> signature -> raw archive hash before extraction -> strict manifest digest -> subject authorization -> every file digest/size before execution. GitHub/CDN/object transport is untrusted.

## 8. Independently authenticated bootstrap

Strict capsule profile `tdev.agent-bootstrap-trust-capsule.v1` includes route binding `(provider, namespace, durableObjectId, agentId, routeGeneration, jurisdiction)`, management key ID/public key, release-root ID/public key, initial trustPolicyGeneration, initial delegation digest, bootstrap verifier profile and bootstrap verifier SHA-256.

`bootstrapVerifierSha256` is raw SHA-256 of complete minimal verifier bytes rendered as 64 lowercase hex. Capsule bytes are canonical JSON with no trailing newline; their independently authenticated identity is raw SHA-256 of those exact bytes, also 64 lowercase hex.

A fresh machine receives only that capsule digest through an independently authenticated operator channel. Capsule/verifier/package bytes may arrive via untrusted transport. The digest authenticates exact route binding, management verifier, release root, delegation digest and verifier bytes before execution. Candidate package/transport can never supply its own accepted capsule digest.

## 9. Clone-safe Termux/Android realization

`androidSourceLineageId` is SHA-256 fingerprint of installed signing-certificate DER. Before provisioning/current election, independently read `com.termux` and `com.termux.api` fingerprints; they must be equal and equal the deployment profile's pinned lineage. Source-family change is a backend replacement requiring fresh installation/credential generations.

Alias record is canonical `{profile:"tdev.agent-keystore-alias.v1", agentId, routeGeneration, installationGeneration, credentialGeneration}`. Alias is `"tdev.a1." + base64url_no_pad(SHA256(UTF8(canonicalJson(aliasRecord))))`. Persisted non-secret `credentialRef` is only `androidkeystore://com.termux.api/<alias>`.

Every start must pass lineage equality/pinning, exact alias existence, RSA public readback canonicalizing to provider/current `credentialKeyId`, then a fresh server one-shot possession proof. Missing Termux:API/key, reinstall/app-data loss, unsupported source switch or device replacement fails closed and requires fresh generations. No file-key fallback. If a supported backup/clone reproduces the same usable private authority on a second installation, that profile fails qualification and is unsupported.

## 10. Provider binding and IAM

D0039 reuses the current live D0020 Agent substrate rather than creating a new authority. Deployment-time fresh Cloudflare readback must uniquely obtain account binding, Worker/service, active version/source revision, 100-percent traffic, exported `AgentDeliveryRuntimeDO`, DO binding/namespace/jurisdiction, exact route object ID, ingress disposition, public verifier bindings, legacy HMAC presence, and deployment/management IAM principals/permissions without secret values.

A provider-only Worker readback must return the exact `AgentDeliveryAuthority` route binding and security-key fingerprints. Control-plane and route-owner readbacks must match. Historical D0020 resource strings are locators only.

IAM separation is mandatory: deployment principal may inspect/deploy provider resources but has no management/release private keys; management signer has route-signing authority only; release root/delegated signers have no provider deployment privilege; runtime receives only runtime/public verifier bindings, no signing or provider-control private credentials.

## 11. D0020 coexistence and genesis migration

Before any D0027 durable migration mutation, one D0027-aware Worker version that understands predecessor D0020 and D0027 state must own 100 percent of state-changing production traffic. Split state-changing writers are forbidden.

Legacy `TDEV_AGENT_DELIVERY_AUTH_KEY` HMAC is predecessor-only. D0020-only may use it before a D0027 marker exists. The first durable D0027 `UNREGISTERED` marker permanently disables HMAC for D0027 state-changing authority. `GENESIS_PENDING`, `CURRENT`, management, challenge/possession and CURRENT connect hard-reject HMAC even if binding remains. After all routes leave D0020-only, remove the HMAC binding and read back absent. No asymmetric-to-HMAC fallback exists.

Only migration is:

```text
D0020-only -> UNREGISTERED -> GENESIS_PENDING -> CURRENT
```

`GENESIS_PENDING` contains one fixed non-executable candidate. Exact package/trust/verifier/local readiness and positive predecessor held-slot/quiescence evidence must agree on it. One stable management-authenticated `initial_activate` revalidates predecessor/current state and atomically elects first `CURRENT`. Response loss reconciles the same stable request/receipt; it does not mint another candidate/generation.

## 12. Rollback, recovery, uninstall and retention

Worker code rollback is allowed only to code read-compatible with durable schema and all surviving generation/replay/tombstone fences. Package rollback is a forward management transition activating an older authorized payload at strictly higher `packageActivationGeneration`; generations never decrease.

Durable Object PITR, database rewind, deletion/recreation or same-name inference never restores authority. Loss/corruption of canonical route object fails closed; recovery requires separately authorized D0020 cutover to a newly proven exact route object at strictly higher `routeGeneration`, after predecessor quiescence, then fresh D0027 realization.

Provider-side uninstall/revocation commits/exposes a durable terminal result before local AndroidKeyStore alias/package/service deletion. Local deletion failure is cleanup incompleteness, not continued authority.

Semantic safety state has no wall-clock TTL: route and all D0027 generation high-waters, `connectRequestSequenceHighWater`, challengeGeneration high-water, `managementRequestSequenceHighWater` and terminal route tombstone survive compaction/logical deletion; revoked signer IDs survive route lifetime within the four-signer bound. Detail receipts may compact only behind permanent floors. Challenge detail may expire after 120 seconds because its high-water remains. Storage pressure rejects new state-changing work rather than deleting safety state.

## 13. Qualification matrix Q1-Q10

No gate may be promoted into a later proof layer.

- **Q1 source/canonical:** strict canonical/unknown-field vectors, base64url corpus, RSA JWK length/exponent, RSA/Ed25519 positive/negative/domain confusion, challenge live/expiry/consume/replay/restart/ancient floor, exact `m2:<seq>` parsing/canonicalization, `highWater+1` admission, gap/stale/overflow rejection, exact replay/conflict, same-ID multi-phase crash/restart, explicit nested admission v1->v2 migration, management receipt compaction behind the permanent request floor, release signer/root/bootstrap tamper, HMAC hard rejection, storage-pressure fail-closed.
- **Q2 Workers crypto:** on exact deployed Workers runtime import real supported Termux:API RSA-3072 JWK and verify real SHA256withRSA; separately verify standard Ed25519 management/release vectors.
- **Q3 physical Android/Termux:** prove Termux/Termux:API lineage, RSA-3072 AndroidKeyStore generation, unattended signing, public-key interoperability, missing API/uninstall/source switch/reinstall/device replacement fail-closed and no cloned private authority.
- **Q4 fresh bootstrap:** no local trust; authenticate only independent capsule digest; fetch capsule/verifier/archive through untrusted transport; prove root/delegation/release/manifest chain and tamper each layer.
- **Q5 live provider/IAM:** fresh Cloudflare binding/version/class/namespace/jurisdiction/route readback, exact route owner, 100-percent writer, IAM/private-key separation and secret inventory.
- **Q6 live migration:** D0020-only -> nested-v2 UNREGISTERED -> GENESIS_PENDING -> CURRENT, plus any supported terminal D0027-aware nested-v1 predecessor import, crashes/restarts, exact request-floor initialization/import, held-slot/quiescence, no mixed writers, HMAC rejection from first marker and binding removal.
- **Q7 management loss/compromise:** valid `m2` mutation/exact replay/stale/gap/altered rejection and same-ID response-loss reconciliation, same-key backup if used, total loss fail-closed, compromise recovery only by higher-route cutover.
- **Q8 release lifecycle:** signer replacement/retirement/revocation under the same request-sequence rule, bounded set, trust generation monotonicity, root loss/compromise, forward package rollback and no package/capsule self-authentication.
- **Q9 rollback/provider-loss/retention:** nested-v2 rollback barrier, no automatic v2->v1 downgrade, no PITR/same-name authority, request/generation floors and tombstones across restart/compaction, storage pressure, provider-loss recovery only by fresh higher-route cutover.
- **Q10 deployed composition:** fresh supported machine -> bootstrap -> provision -> CURRENT -> challenge -> AndroidKeyStore proof -> connect -> existing delivery composition -> update -> forward rollback -> restart -> same-ID response-loss retry -> uninstall -> local/provider terminal cleanup.

## 14. Implementation ordering and stop rules

1. Accept and route D0039 before Class-2 implementation.
2. Synchronize SECURITY/DEPLOYMENT/QUALIFICATION first so source cannot invent policy.
3. Implement canonical crypto/wire helpers and owner-local challenge/replay floors with Q1 vectors.
4. Implement AndroidKeyStore adapter and Worker verification/readback surfaces without private-key material entering repository/evidence.
5. Implement 100-percent-writer/HMAC migration fences and same-route genesis path.
6. Pass full source gate and Q1 before publication.
7. Publish by exact non-force predecessor fencing and provider reread.
8. Execute Q2-Q10 only through authorized available provider/device surfaces. Missing planes remain unverified.

If an executable gate proves the mechanism cannot work without a new owner, trust root, recovery axis, rollback meaning or changed D0027 generation/fencing/crash/secret semantics, stop the dependent implementation and reopen/widen through `SDD.md`. Do not invent a fallback.

## 15. Revision 2 acceptance status and remaining proof

Successor ACR campaign `tdev-20260823-d0039-management-request-correction-01` converged with review quality `STRONG` and application readiness `CONDITIONAL_ON_EXECUTABLE_PROOF`. Fresh target rebinding at `development@64900718b36387fe8577069bd5309c863363cfae` confirmed that this is the same D0039 problem/owner family, so Revision 2 closes the management-request identity/replay/versioning meaning before implementation. No user-owned policy choice remains inside this correction boundary.

This acceptance does not claim Q1-Q10, corrected source behavior, provider identity, live IAM, physical Android key custody, live migration, rollback or deployed composition has passed. Those remain executable proof boundaries and one layer cannot promote another.

## 16. Revision 1 reopen — management-request/lifecycle generation conflict

D0039@r1 is reopened on 2026-08-23 by `docs/evidence/group-f-d0039-r1-management-request-lifecycle-falsifier-2026-08-23.json` before D0039 source/provider/device migration implementation began.

Revision 1 requires each mutating `managementRequestId` to be `m1:<target lifecycleGeneration>` with the number exactly predecessor lifecycle generation + 1. Current authoritative D0027 semantics instead require one stable management request to survive a crash-safe multi-phase transaction while **every product-side lifecycle mutation** advances `lifecycleGeneration`. In particular, one package update/rollback request elects a new draining generation before quiescence and a second final active generation after readiness; normal uninstall similarly elects a draining generation and then a distinct final revoked generation. The current `AgentDeliveryAuthority` implements those accepted D0027 rules exactly.

One stable request ID therefore cannot both encode the transaction's final lifecycle generation and equal the original predecessor + 1 for those transitions. Reinterpreting the ID as only the first draining generation, collapsing two D0027 lifecycle transitions into one generation, or minting a second management request for the completion phase would each change accepted meaning rather than merely implement Revision 1.

Under `SDD.md`, the affected D0039 scope was not implementation authorization while Revision 1 remained reopened. D0027@r1 and D0038@r1 were not reopened by this falsifier. The defect remained the same D0039 problem/owner family and therefore required a new D0039 revision with fresh acceptance rather than a D0027 revision or new owner.

## 17. Revision 2 correction, durable version and migration

Revision 2 selects the `m2:<seq>` / `managementRequestSequenceHighWater` contract in Section 6 and changes no D0027 lifecycle meaning. It also versions the affected durable substate explicitly: outer `AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION` remains `3`, while the nested installable-Agent admission profile advances from `tdev.installable-agent-admission.v1` to `tdev.installable-agent-admission.v2`. The strict D0027-aware v2 state requires nonnegative safe-integer `managementRequestSequenceHighWater`; v1 is never silently extended with an optional/defaulted field. The outer schema does not also advance because its top-level shape is unchanged and schema 3 already delegates strict nested validation to the nested admission owner.

Supported predecessor handling is fail closed. Exact v1 `LEGACY_D0020_ONLY` may remain unchanged until the first D0027-aware cutover, which creates nested-v2 `UNREGISTERED` with request high-water `0`. A terminal v1 D0027-aware `UNREGISTERED` or `CURRENT` state may migrate only when no `GENESIS_PENDING` or `current.managementTransaction` is nonterminal. Migration preserves retained management receipts/tombstones and sets the v2 request high-water to the maximum canonical surviving `m2` sequence found in retained management identity fields, or `0` when none exists. Any `m2:`-prefixed identity that is noncanonical/out of safe range, any nonterminal predecessor management transaction, malformed/unknown predecessor profile, or any v2 state missing the required high-water blocks instead of guessing. Legacy non-`m2` identities remain replay/retirement-only and can never be admitted as fresh corrected requests.

The first persisted nested-v2 D0027-aware state is the durable rollback barrier. Code that understands only nested v1 must not be activated for that route afterward; no automatic v2-to-v1 data downgrade exists. Rollback must use code that strictly reads v2 and preserves the request high-water, or recover forward under separately authorized route cutover semantics.

Revision 2 keeps the immutable route-scoped Ed25519 management key, `tdev.agent-management.v1` signature domain, RSA/AndroidKeyStore credential profile, release/bootstrap trust, provider/IAM shape, D0020 coexistence/genesis model and single `AgentDeliveryAuthority` owner from Revision 1. The fresh proof delta is limited to Q1 and the request-sequence/version crossings described in Q6-Q10; Q2-Q5 mechanism meaning is not reopened. Source implementation remains unauthorized until this Revision 2 acceptance and its WORKBOARD routing are committed on the current cumulative lineage.

## 18. Revision 2 Q1 source implementation and publication

D0039@r2 is `implementing` after its Q1 source boundary was completed and published. The exact implementation source is `development@4493fa11d2ea59a5813c8b75bca08c737dfb21a7`; publication was a non-force fast-forward from `development@9ce1aa3f2719526009c0d806ba23922a33e239b4`, and an independent provider reread observed the same `4493fa11d2ea59a5813c8b75bca08c737dfb21a7` remote head. Reusable source evidence is `docs/evidence/group-f-d0039-r2-d0027-deployment-realization-source-verification-2026-08-24.json`.

The exact baseline source gate passed at that implementation source: bounded install succeeded, `npm run check` passed 495/495 tests together with syntax/documentation/demo/durable-demo, the complete coverage run passed 495/495 with observed all-file coverage of 86.68% lines, 72.54% branches and 90.79% functions, and `git diff --check` passed. Focused D0039/admission qualification passed 19/19, including explicit `m2` and `c1` safe-integer overflow, management replay-storage pressure and same-request multi-phase authority-restart vectors. These observations close Q1 only.

Q2 through Q10 remain independent executable proof layers. No Workers-runtime crypto, physical AndroidKeyStore custody, fresh-machine bootstrap, live Cloudflare/IAM readback, live D0020-to-D0027 migration, management-key loss/compromise, live release lifecycle, provider-loss/retention or deployed end-to-end composition claim is promoted by Q1. The Design therefore remains `implementing` and keeps its current WORKBOARD routing while those authorized available surfaces are evaluated and executed.

## 19. Post-Q1 physical-Q3 prequalification and implementation continuation

A physical Android/Termux prequalification on 2026-08-24 corrected the earlier environment diagnosis without changing Revision 2 meaning. In the tmcp Job shell, bounded direct `termux-battery-status` and `termux-keystore list` calls both timed out, but an isolated one-shot runit service on the same Android/Termux installation returned exit 0 for both calls with successful command output discarded. The tmcp direct-shell timeout is therefore execution-context evidence about the still-evolving tmcp runtime, not a D0039 Termux:API/AndroidKeyStore product blocker. Full Q3 remains unverified because real RSA-3072 generation, unattended signing, exact public-verifier interoperability and the required negative custody/source/reinstall/clone falsifiers have not yet executed. Exact observations are recorded in `docs/evidence/group-f-d0039-r2-q3-prequalification-and-continuation-split-2026-08-24.json`.

The same Q3 prequalification exposed a bounded production-wiring defect after the historical Q1 canonical vectors. `TermuxAndroidKeyStoreCredential` already implements the accepted concrete credential behavior and `AgentDeliveryRuntimeDOHost.issueInstallableAgentConnectChallenge()` already routes challenge allocation to the sole `AgentDeliveryAuthority`. However, the direct `tdev-agent-control` entrypoint constructs `createInstallableAgentControlProcess({ packageRoot, config })` without the concrete `credentialAdapter` or deployment-owned `challengeClient`. For an `androidkeystore://` credential the control process therefore fails closed at the existing `installable_agent_keystore_adapter_unconfigured` guard before it can execute the product path. This is a Class-1 implementation defect under unchanged accepted Revision 2 semantics; it does not reopen D0039, D0027 or D0038 and does not authorize an alternate key, challenge or owner model.

The historical Q1 evidence remains a valid source/canonical observation for the vectors it actually executed, but it is not promoted into proof that the concrete D0039 control entrypoint was fully composed. D0039 remains `implementing`. Repair must wire the already-selected Termux AndroidKeyStore adapter, independent installed-package signing-certificate lineage readback and deployment-owned challenge transport into the real package/control path, add permanent focused coverage, rerun the affected source gate, and only then continue full Q3/Q2-Q10 proof.

For the next implementation slice, code-heavy repair and permanent qualification machinery are isolated to candidate branch `codex/d0039-r2-codeheavy-20260824`, created from the published commit carrying this handoff evidence. That branch is a candidate only and cannot elect repository authority. Until it is integrated or explicitly abandoned, a resumed `@acr 적용` controller must not independently mutate those delegated code paths; it may fresh-bind authority, inspect/review the candidate, gather non-conflicting read-only/live evidence, then own canonical integration/publication and the real device/provider/migration/deployed proof layers after the source candidate is accepted.

## 20. Revision 3 normative correction and acceptance boundary

Revision 3 preserves Sections 1–19 as predecessor design and historical proof for the scopes they actually established. Where this section conflicts with earlier D0039 text, this section controls Revision 3. D0027@r1 and D0038@r1 are not reopened. The existing per-route `AgentDeliveryAuthority` remains the sole product-current owner; qualification coordination can fence a qualification campaign but cannot authenticate, authorize, admit, elect, repair or restore product state.

### 20.1 Authenticated executed bootstrap closure

Fresh-bootstrap Q4 uses one exact `tdev.agent-bootstrap-trust-capsule.v2` digest as the sole product bootstrap trust anchor. The exact digest must arrive over an authenticated operator channel independent of the capsule, verifier, runtime, package/archive, repository checkout and release transport under test, and it must be established before any untrusted transport value is consulted. An unavailable authenticated channel leaves Q4 unqualified rather than falling back to a candidate/self-issued digest.

The capsule binds `tdev.agent-bootstrap-execution.v1`: exact runtime profile/platform/architecture and full runtime SHA-256, exact self-contained verifier SHA-256, an exact sorted builtin-module allowlist, `networkAllowed=false`, `environmentInheritance=false`, and a private-empty working-directory profile. The declared OS kernel/filesystem/process primitives and exact bootstrap executor are environmental TCB, not product trust anchors. The executor must positively preserve `verified bytes == executed bytes`, use bounded regular non-symlink inputs, reject archive/path/device/FIFO ambiguity, prevent hash-to-exec replacement, use absolute runtime identity with no inherited `PATH`/cwd/loader hooks, admit only an exact environment allowlist, and forbid network, download, compiler/package resolution and ambient repository imports. Any runtime/verifier/module/execution-policy change requires a new capsule identity and independently authenticated digest. Capsule v1 cannot terminally satisfy Revision-3 Q4.

### 20.2 Authenticated evidence profiles

Terminal evidence uses `tdev.installable-agent-qualification-evidence.v2`; a driver assertion, all-true check object, schema shape or self-issued file cannot close a gate. Relevant observations bind a fresh `qualificationRunId`/run generation and target digest; exact source `S`, artifact `A`, immutable provider version `V` and active route/runtime identity `R`; route/namespace/DO and generation; package/release/install/credential/trust/lifecycle generations; stable mutation identity and authoritative receipt/current tuple; device/profile and independently read source lineage where applicable; nonce or stable deployment epoch; observer/authenticator principals; and evidence read/write/invalidation sets.

Minimum terminal observers are gate-specific: Q2 joins provider control-plane version readback with route-owner runtime response at the provider-bound endpoint; Q3 joins physical-device observation, independent Termux/Termux:API signing-certificate lineage and AndroidKeyStore possession proof; Q4 joins the independent operator digest channel with authenticated executor/runtime/verifier observation; Q5 joins provider control plane, route-owner runtime and cross-principal IAM observations; Q6 joins management-authenticated receipts, route-current readback and provider writer/HMAC observations; Q7 joins management signer where available, route-current receipts and provider recovery/retirement observations; Q8 joins release-root/delegated signatures, exact artifact bytes and route trust/package receipts; Q9 joins provider loss/recovery with old/new route evidence and retained floors/tombstones; Q10 joins compatible authenticated Q2–Q9 evidence with current provider/route, physical credential possession and Case/Agent delivery evidence. An observation producer cannot be its sole authenticator, and evidence replayed under another run/deployment/route/device/current epoch is stale.

### 20.3 Exact source, artifact, provider and route admission

Live qualification distinguishes `S` = exact source commit that passed Q1, `A` = exact build/release artifact and manifest produced from S, `V` = immutable provider Worker version binding S/A, and `R` = active provider route/runtime identity including account/service, deployment/config epoch, 100-percent state-changing traffic ownership, route, namespace/class/jurisdiction, Durable Object identity and route-current verifier bindings. Admission is strictly `S -> A -> V -> deployment/cutover -> 100-percent state-changing writer -> provider readback -> route-owner readback -> exact S/A/V/R join`. No individual SHA, artifact, Worker version, deployed bytes, route or self-report substitutes for the join.

The deployment-admission portion of Q5 precedes Q2 and every state-changing live gate. The qualification endpoint origin is derived from and matched to the admitted provider route before any qualification credential/token transmission. Provider active-version identity and route-owner version identity must agree inside one stable deployment epoch; observations from different epochs cannot be spliced.

### 20.4 Mutation-bound runtime identity fence and effect reconciliation

State-changing qualification uses `tdev.installable-agent-qualification-rpc.v2`. Every mutation request carries `expectedDeploymentIdentityDigest`, the typed digest of `tdev.installable-agent-qualification-deployment.v1` over admitted S/A/V/R. The deployed Worker carries the same immutable identity. After request authentication and strict parsing but before every product mutation, the server reconstructs its observable runtime/route identity and compares it with the request/admitted identity. Mismatch fails as `qualification_runtime_identity_mismatch` with positively established zero product effect. A separate preflight does not authorize a later mutation; post-effect mismatch detection is too late. Mixed/canary state-changing writers, unknown deployment epoch, old RPC profile or stale client fail closed without mutation fallback.

The stable mutation identity is the full tuple `(agentId, routeGeneration, managementRequestId, operation, intentDigest, originalExpectedPredecessorDigest, expectedDeploymentIdentityDigest)`. Each state-changing operation has an owner-specific reconciliation descriptor covering all durable phases, authoritative reread, receipt/floor/current/tombstone predicates, positive zero-effect predicate, safe retry/resume/stop/cleanup and receipt-compaction behavior. Reconciliation distinguishes `NOT_ADMITTED`, `ADMITTED_IN_PROGRESS`, `TERMINAL_APPLIED`, `CONFLICT_DIFFERENT_EFFECT` and `STILL_AMBIGUOUS`. `ADMITTED_IN_PROGRESS` is not terminal success; `STILL_AMBIGUOUS` blocks retry and dependent progress. Once dispatch may have occurred, timeout, connection loss, unreadable/oversized/truncated/invalid response, response-authentication failure, unproven non-2xx, parser failure or controller death is ambiguous and never authorizes a new request identity. Cleanup and rollback mutations follow the same rule.

### 20.5 Persistent qualification journal, claims and no-live-takeover

`docs/QUALIFICATION.md` is the canonical semantic owner of `tdev.installable-agent-qualification-run.v1` and `tdev.installable-agent-qualification-claim.v1`, including canonical encoding/validation, namespace and identities, legal state transitions, compare-and-swap preconditions, resource-key derivation, claim modes/conflicts, generation allocation, restart enumeration, reconciliation, cleanup, retention/compaction, corruption/loss behavior and rollback/migration rules. `docs/DEPLOYMENT.md` owns only the concrete durable backing and deployment binding; `docs/SECURITY.md` owns the trust, fencing and non-authority constraints.

Before any external/product/provider/device mutation, the controller durably records `PREPARED` with run identity `(qualificationRunId, runGeneration)`, exact target/S/A/V/R identity, complete stable mutation identity, resource claims and expected predecessor digest/revision. Updates use strict compare-and-swap against the exact predecessor record. The forward state family is `PREPARED -> DISPATCHED -> RECONCILING -> TERMINAL_NOT_ADMITTED|TERMINAL_APPLIED|TERMINAL_CONFLICT -> CLEANUP_PENDING -> CLEAN`; in-progress or ambiguous outcomes remain nonterminal `RECONCILING`.

Resource claims are deterministic and acquired all-or-none as `shared_read` or `exclusive_mutation`. Each resource key has a monotonically increasing, never-reused `claimGeneration`; stale generations cannot mutate or release later claims. There is exactly one qualification mutation controller for a live mutation lane. **There is no automatic live takeover.** Lease timeout/expiry, controller disconnect, process disappearance, failed CAS, a fresh request identity or a higher run/claim generation alone never authorizes successor external/product/provider/device effects, cleanup, claim release or resource reuse. Before any successor effect, the qualification journal must contain positive predecessor exclusion/quiescence for the exact prior run and claimed-resource scope under the QUALIFICATION protocol. If that proof is unavailable, the lane remains blocked.

Restart deterministically enumerates every nonterminal run/claim and reconciles them before new mutation, progress, cleanup or claim release. Compaction is allowed only after `CLEAN` and retains enough run tombstones and per-resource claim-generation high-water to prevent identity/generation reuse. Corrupt, missing or totally lost coordination state fails closed for the affected run/resources and cannot recreate product authority. The first durable v1 run/claim material is a tooling rollback barrier: older tooling that does not understand the v1 fence cannot resume that campaign or silently recreate its ledger.

If safe recovery would require the journal/claim store to become an independently durable/public effect-admission authority, a second route-current registry, a new product credential/trust owner, a materially different owner model or an independently decidable migration/cutover, D0039 implementation stops and returns through `SDD.md` for a new Design.

### 20.6 Evidence invalidation and Q3 scope

Evidence records its identity epoch, read set, mutation write set and invalidation events. Q6 mutation invalidates affected pre-Q6 route/request-floor/HMAC observations and requires reread; Q7 higher-route compromise recovery invalidates old-route evidence for final composition; Q8 signer/delegation/trust/package changes invalidate evidence bound to replaced identities; destructive Q9 does not compose silently with the destroyed provider/route instance; Q10 is operationally last on the exact final lane and its terminal cleanup destroys those live prerequisites. Read-only lanes may run concurrently only after exact identities are frozen and resource sets are disjoint.

A Q3 helper that creates/deletes AndroidKeyStore aliases, signs, creates or controls runit services, or changes package/device state is reversible **mutating prequalification**, not non-destructive terminal proof. It requires exclusive device/service/alias claims. Its output may establish only an observed or positive subset; complete Q3 still requires the accepted negative custody/source/reinstall/clone/API/fallback falsifiers. Cleanup ambiguity remains `CLEANUP_PENDING` and blocks lane reuse.

### 20.7 Exact Q1 source identity and optional evidence descendant

Revision 3 uses Model B: exact final source/normative commit `S` runs the complete Q1/source gate; an optional descendant `E` may add evidence/current-status projection only when a repository-owned deterministic checker already present in S proves every protected path byte-identical and every changed path/region inside an exact machine-delimited allowlist fixed by S. The checker emits the changed-path/region manifest. Allowed E-only changes are newly created immutable `docs/evidence/**`, derived `docs/design/README.md`, and machine-delimited current-status/provenance regions explicitly owned by S. `src/**`, `native/**`, `qualification/**`, `test/**`, `tools/**`, package/lock inputs and SECURITY/DEPLOYMENT/QUALIFICATION meaning remain byte-identical.

If S lacks the required checker or delimiters, or any changed path/region is unknown/non-allowlisted, no evidence-descendant exception exists: the descendant becomes a new S and the full Q1/source gate reruns. Evidence always names `qualifiedSource = S` and, when used, `publishedEvidenceDescendant = E`; E is never described as the SHA that ran Q1.

### 20.8 Selective integration and provenance

`codex/d0039-r2-codeheavy-20260824@75cfccd7f9a257ffe242fbbc7848965a67641e01` is already an ancestor of the acceptance base and must not be replayed. `codex/d0039-r2-qualification-followup-20260824@37aa891804b9239cbff7866e6c4da34d8a09a008` is a non-authoritative descendant and must not be merged wholesale. Integration is by semantic hunk with a non-product provenance ledger recording candidate ref@sha/commit/path/hunk, target owner, disposition, copied/rewritten/rejected result, target path, focused tests, rationale and resulting commit.

Bounded regular-file/web-response reads, catalogs/structural validators, crypto vectors/bounds and unchanged-owner fail-closed hardening may be copied only after owner-native review. Arbitrary-driver terminal qualification is rejected. Q4 terminal execution, generic scenario orchestration, mutation-bound qualification RPC, terminal Q2/Q5 binding and Q6-Q10 command claim paths are reimplemented against this accepted contract. Q3 candidate helpers remain prequalification only.

### 20.9 Owner synchronization, class and proof ordering

Acceptance requires SECURITY to own the independent bootstrap trust/TCB distinction, evidence-authentication principals and no-live-takeover trust boundary; DEPLOYMENT to own exact S/A/V/R realization, endpoint/provider binding and the concrete durable run/claim backing; and QUALIFICATION to own the run/claim protocol, per-gate evidence matrix, reconciliation outcomes, invalidation DAG, Q3 scope, strict Q1 S/E checker and selective-integration provenance semantics.

This Revision-3 decision and the **first source/tool/runtime realization** of its trust, identity, persistence, deployment and verification contract are Class 2. Only later repair that demonstrably preserves an already accepted Revision-3 contract may classify as Class 1. Editorial/current-status projection with no meaning change remains Class 0. Any uncertainty about trust, identity, persistence, migration/recovery or verification classifies upward under `SDD.md`.

After this acceptance and owner synchronization, implementation order is: fresh-bind current authority/candidates; realize accepted Revision-3 semantics as Class 2; complete product/source/normative commit S; run the full Q1 source gate plus focused Revision-3 falsifiers at exact S; use optional E only when the strict mechanical checker permits it; publish by fresh non-force predecessor fencing and provider reread; build exact A, deploy immutable V, establish active R and the S/A/V/R admission; then execute Q2-Q10 only through the durable journal/claims, authenticated evidence profiles, reconciliation and invalidation rules. Missing provider/device/operator resources remain `unverified`, never PASS.

Revision-2 acceptance/source/Q1/Q3-continuation evidence remains immutable historical evidence for its exact claimed scope and is not rewritten or promoted into Revision-3 proof. Revision 3 is accepted by this owner correction; source implementation and Q1 are not yet complete at the acceptance boundary.
