# Design 0039 — D0027 Deployment Realization

- Status: `accepted`
- Revision: 2
- Class: 2
- Decision date: 2026-08-23
- Acceptance base: `development@64900718b36387fe8577069bd5309c863363cfae`
- Trigger: user-directed application of ACR campaign `tdev-20260823-d0039-management-request-correction-01`, convergence `acr/tdev-20260823-d0039-management-request-correction-01/convergence`
- Predecessor revision: D0039@r1, accepted from `development@9b78b5487591730754d9708e205d41367f510afc`
- Predecessor acceptance evidence: `docs/evidence/group-f-d0039-r1-d0027-deployment-realization-acceptance-2026-08-23.json`
- Reopen evidence: `docs/evidence/group-f-d0039-r1-management-request-lifecycle-falsifier-2026-08-23.json`
- Acceptance evidence: `docs/evidence/group-f-d0039-r2-management-request-correction-acceptance-2026-08-23.json`
- Scope: concrete private F-side realization of D0027 credential/verifier, clone-safe local key custody, package/release/bootstrap trust, Cloudflare binding/IAM, D0020-to-D0027 genesis migration, forward rollback/recovery/retention and proof-layer-separated qualification
- Affected owners: `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, D0027 substate in the existing per-route `AgentDeliveryAuthority`, Cloudflare Agent delivery adapter, installable Agent package/runtime and focused/permanent tests
- Explicit non-goals: no D0027 owner-model revision; no MCP/D0023/D0024 identity dependency; no D0025 canonical Git-publication dependency; no D0028 runbook semantics; no second route/current registry; no broad D0026 completion claim; no authority-restoring PITR or same-name resource recreation; no secret/private-key bytes in repository/evidence/model-visible state

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
