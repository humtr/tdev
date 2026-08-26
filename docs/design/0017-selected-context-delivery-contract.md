# Design 0017: selected context delivery contract

- Status: `accepted`
- Owner decision: 2026-08-12
- Accepted decision scope: freeze one logical immutable authorized full-context reference contract and one bounded receiver representation for a later D0017 production implementation; this Design does not itself verify or implement that production path.
- Capability Group: E — Context delivery and model input
- Work lane: `group/e-context-delivery`
- Direct decision predecessor: accepted D0016 — `docs/design/0016-per-attempt-context-delivery-minimization-decision.md`
- D0016 raw evidence: `docs/evidence/group-e-d0016-context-delivery-2026-08-11.json` (SHA-256 `ba4dbfe09dd05a48c741a384316f1e9755409ab1369335ebe898d2269537c495`)
- D0017 falsifier source: `583c8855612c92f6a98a3c1ab2b4173197499576`
- D0017 raw evidence: `docs/evidence/group-e-d0017-context-delivery-contract-2026-08-12.json` (SHA-256 `a901816ada0d25858bcc78b94a2dc091376c34c004e6041027e22a5ddf9a3ca2`)
- Production-source change in this Design task: none
- Later production implementation: `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`, independently verified on the supported-Termux source scope
- Production verification evidence: `docs/evidence/group-e-d0017-production-verification-2026-08-12.json` (SHA-256 `ea9371c467dd5b1d86ddbfb97b81109c0d1b0885186610f04b92bb753cd1b907`)
- Product owners synchronized after implementation: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`

> `accepted` remains the Design-layer status. Under `SDD.md` it authorized the separately scoped production task; later production verification is a distinct evidence layer and does not retroactively turn the Design decision itself into a source-verification claim. The implementation is `verified` only for the declared supported-Termux source scope; exact all-test coverage remains platform-unqualified for the pre-existing ImmutableJournal hard-link limitation, and no external-provider/deployment qualification is implied.

## 1. One-line definition

For one already-authorized logical Case/Plan invocation, identify the complete immutable repository context by a representation-independent reference, resolve it through a bounded trusted receiver-local representation, and fail closed before model acceptance if authorization, freshness, integrity, semantic equivalence or resource bounds cannot be proved.

## 2. Authority retained

D0017 does not create a second semantic owner.

Retain without change:

- D0010 Case head / semantic root as current-state authority;
- the accepted Plan `baseDigest` as the invocation's expected semantic repository base;
- existing Case contract, Plan, Task, Attempt, Claim, fencing, result and Promotion owners;
- D0013/D0014 result-only model acceptance and existing Task retry ownership;
- the D0013 repository context profile `tdev.repository-context.git-full-text.v1` and its exact immutable Git commit/context descriptor as derived input identity;
- D0016's decision that D0017 preserves the full semantic context and does not select ContextSlice.

A Git commit OID, context reference, receiver object, cache entry, file path or physical content object is derived input/materialization state. Its existence never elects Case state or authorizes a result.

## 3. Facts, evidence, inferences and unknowns

### 3.1 Verified facts used by this decision

- D0016 measured the same-base/eight-Attempt inline full-context path at about 19.23 MB of parent-to-receiver request bytes and eight process starts.
- D0016 immutable bundle and manifest/content reference families reduced that repeated request volume to about 5.6-5.7 KB, approximately 99.97%, without changing full-context semantics.
- D0016 did not prove that a fresh receiver becomes faster merely because request bytes shrink.
- D0016 repository-shape evidence showed that fine-grained manifest/content references can be favorable for few-large/deep shapes but unfavorable for many-small/wide shapes.
- Current repository semantic bounds are `maxPathBytes = 4096`, `maxFileBytes = 2 MiB`, `maxTreeEntries = 100000`, and `maxTreeBytes = 16 MiB`.
- Current model execution already has a finite invocation/executor timeout and AbortSignal cancellation boundary; no repository owner establishes one new global D0017 millisecond value.
- The current Case/Plan authorization facts needed to scope a reference are `caseId`, accepted `planDigest`, and `caseContractDigest`.

### 3.2 New D0017 falsifier facts

The repository-owned benchmark `bench/context-delivery-contract.mjs` ran the actual repository plus many-small, few-large, deep and wide synthetic shapes. All three receiver representations received the same logical request/reference. Physical store paths and representation locators were receiver-local instrumentation, not request fields.

Observed representation object reads were:

| Shape | single canonical bundle | manifest/content refs | bounded packed/hybrid |
| --- | ---: | ---: | ---: |
| actual, 120 files | 1 | 121 | 3 |
| many-small, 2000 files | 1 | 2001 | 17 |
| few-large, 4 files | 1 | 5 | 2 |
| deep, 128 files | 1 | 129 | 2 |
| wide, 2000 files | 1 | 2001 | 17 |

The same run showed:

- every representation preserved one identical logical `referenceId` per context;
- every successful representation reconstructed the same repository `contextDigest` and semantic base;
- no request contained the benchmark's local store path;
- retry/restart with a changed `attemptId` retained the same logical reference;
- wrong Case authority failed as `context_reference_unauthorized`;
- wrong expected base failed as `context_reference_stale`;
- missing binding failed as `context_reference_missing`;
- digest-corrupt content failed as `context_reference_corrupt`;
- declared pack overflow failed as `context_reference_limit_exceeded`;
- cancellation after a partial pack read observed partial receiver work but no accepted-completion marker.

Wall-time samples were deliberately not a universal-winner result. Manifest was strongest in the few-large sample; bundle was fastest in one wide run; bounded packed/hybrid was strongest or competitive on several other shapes. These small Android/Termux measurements are comparative falsifiers, not production SLOs.

### 3.3 Inference accepted by this Design

A bounded packed/hybrid receiver representation is the lowest-burden balanced choice because it:

- retains the D0016 semantic-preserving reference mechanism;
- avoids requiring one physical content lookup per file on many-small/wide repositories;
- avoids requiring the receiver to parse one whole canonical full-tree JSON bundle as the representation contract;
- preserves a small representation object fanout across all measured shapes without claiming that it minimizes wall time on every shape;
- keeps the physical representation separate from the logical reference identity, so representation changes do not create a new semantic owner.

### 3.4 Unknowns intentionally not guessed

D0017 does not decide:

- external model-provider authentication, tokenizer, billing, retry charging, privacy/residency or provider retention;
- warm executor/process/provider lifecycle or process reuse, which belongs to D0018;
- deployed fleet locality, production SLOs or a platform-independent RSS cap;
- remote/cross-worker shared reference availability;
- a persistent cross-worker CAS, R2/D1 or other durable shared content store;
- whether ContextSlice is later justified after real-runtime/provider remeasurement.

If implementation evidence makes durable/shared cross-worker content a correctness or availability prerequisite, D0022 becomes an explicit accepted dependency before that durable state is introduced.

## 4. Logical reference contract

### 4.1 Profiles

The accepted logical profiles are:

```text
tdev.selected-context-reference.v1
tdev.selected-context-reference-scope.v1
```

A reference envelope has `schemaVersion: 1`, profile `tdev.selected-context-reference.v1`, and exactly the logical identity facts required below. Concrete serialization belongs to the implementation, but it must canonicalize these facts with the repository's existing typed-digest rules.

### 4.2 Authorization scope identity

For one admitted Case/Plan authority:

```text
authorizationScope = {
  caseId,
  planDigest,
  caseContractDigest
}

authorizationScopeDigest = typedDigest(
  "tdev.selected-context-reference-scope.v1",
  authorizationScope
)
```

`attemptId` is intentionally excluded. A retry is a different Attempt but, if it retains the same exact Case contract, Plan and semantic context, it resolves the same logical reference.

### 4.3 Context identity

The logical reference identity is:

```text
contextReferenceIdentity = {
  repositoryCommitOid,
  semanticBaseDigest,
  contextDigest,
  authorizationScopeDigest
}

referenceId = typedDigest(
  "tdev.selected-context-reference.v1",
  contextReferenceIdentity
)
```

Bindings:

- `repositoryCommitOid` is the exact immutable Git commit used by the existing repository-context descriptor;
- `semanticBaseDigest` MUST equal the invocation/Plan expected `baseDigest` before model execution;
- `contextDigest` MUST equal the verified `tdev.repository-context.git-full-text.v1` descriptor digest for that commit/base/full supported file set;
- `authorizationScopeDigest` MUST equal the digest recomputed from the already-admitted invocation's `caseId`, `planDigest` and `caseContractDigest`.

The reference identity does **not** contain a physical path, URL, storage key, receiver process identity, Attempt identity, representation kind, manifest/root object digest or provider credential.

### 4.4 Reference is not authority or a bearer credential

Possession of `referenceId` does not authorize resolution. A receiver may resolve only after the invocation has already passed the existing Case/Plan admission boundary and the receiver can recompute the same `authorizationScopeDigest` from that admitted invocation.

Copying a valid reference into a different Case, Plan or Case contract must fail before content is exposed to the model.

A receiver-local implementation may reuse identical physical packed objects across logical references, but it must keep authorization admission on the logical reference binding. Physical deduplication never broadens authority.

## 5. Product-visible contract versus local representation

The future product-visible/request contract is the logical reference envelope in section 4 plus the existing invocation identity. The following are **not** product API fields in D0017:

- raw local absolute repository/store paths;
- benchmark temporary directories;
- receiver argv/environment locators;
- `single-canonical-bundle`, `manifest-content-references` or `bounded-packed-hybrid` labels;
- receiver-local root/object digests and object filenames;
- cache hit/miss or process-local lifecycle observations.

Those facts may exist as bounded local implementation/observation state. The receiver maps an authorized `referenceId` to one derived representation and then proves that the resolved descriptor/content reproduces the logical identity.

This separation is intentional: **reference use is a logical transport decision; receiver representation is a local materialization decision.**

## 6. Selected receiver representation

D0017 selects **bounded packed/hybrid** as the first implementation representation under the logical reference.

Conceptually:

```text
logical referenceId
  -> receiver-local binding
  -> bounded pack manifest
  -> 1..N immutable integrity-checked packs
  -> full supported file sequence
  -> existing repository-context descriptor + semantic verification
```

The physical format MUST be deterministic and versioned. Each pack must bind each contained file's path, mode, blob identity/length and content integrity strongly enough to reject substitution or truncation. The manifest must bind pack order/count/bounds and the full repository context descriptor.

The exact local filesystem layout and content-object naming are implementation details. D0017 does not require a persistent/shared CAS.

### 6.1 Why not single canonical bundle

Single bundle has minimal object-read fanout and remains a valid falsifier/reference representation, but the D0017 run showed materially larger whole-bundle JSON heap/RSS on the actual/few-large/wide cases and no universal wall-time advantage. Selecting it would make whole-representation parse/materialization the required path even when a bounded pack working set is sufficient.

### 6.2 Why not manifest/content references

Fine-grained manifest/content references can be excellent for few-large content and remain a useful future implementation option behind the same logical identity. They are not selected as v1 because many-small/wide shapes produced one lookup per file: 2001 representation reads for 2000 files in the falsifier. D0016 independently observed shape sensitivity in the same direction.

### 6.3 Why packed/hybrid

The selected pack limits converted both 2000-file shapes to 16 packs plus one manifest, kept deep to one pack plus manifest, and kept the actual repository to two packs plus manifest. It retained memory behavior close to the fine-grained representation in the measured actual/deep/few-large cases and avoided the manifest's per-file read fanout.

This is a bounded-balance decision, **not** a claim that packed/hybrid is always the fastest representation.

## 7. Resolution bounds

### 7.1 Inherited semantic bounds

Resolution MUST fail before model invocation if the full resolved context would violate the existing repository policy:

```text
max path bytes:      4,096
max one file bytes:  2,097,152
max tree entries:    100,000
max tree bytes:      16,777,216
```

These remain semantic-input bounds, not new cache-size claims.

### 7.2 Packed representation bounds

The accepted v1 packed receiver representation is bounded by:

```text
max files per pack:          128
max semantic bytes per pack: 2,097,152
max stored bytes per pack:   3,145,728
max pack-manifest bytes:       524,288
max pack count:                   790
```

The `790` pack ceiling is a conservative bound derived from the current maximum file-count and semantic-tree-byte ceilings; implementation may produce fewer packs but may not silently exceed this v1 contract.

A receiver MUST validate declared pack metadata before allocating/reading beyond the declared bound, validate physical integrity before trusting pack content, and validate the complete semantic context before invoking the model.

### 7.3 Time and cancellation bound

D0017 introduces no independent unbounded resolution interval and no guessed global timeout number. Resolution consumes the same finite invocation/executor deadline and AbortSignal budget that owns the model operation. A receiver must check cancellation during multi-pack work and must not start or accept model work after that budget is cancelled/expired.

A later D0018 provider design may partition the total deadline between local resolution and provider work, but it may not make D0017 resolution unbounded.

### 7.4 Working-resource bound

The representation must be consumable pack-by-pack. It must not require all physical packs to be simultaneously buffered. The semantic result itself remains bounded by the existing 16 MiB tree / 100,000-entry policy, and transient representation work is bounded by one v1 pack plus bounded manifest/header state at a time.

No fixed process RSS number is accepted because Node/runtime/platform overhead is not stable product semantics. D0017 therefore bounds semantic bytes, pack bytes, pack count and working-set structure rather than inventing a cross-platform RSS SLO.

## 8. Resolution and typed failure semantics

Resolution is fail closed. The accepted D0017 product failure classes are:

| Code | Meaning | Required effect |
| --- | --- | --- |
| `context_reference_unauthorized` | admitted invocation scope does not reproduce `authorizationScopeDigest` | no content exposure to the model; no accepted result |
| `context_reference_stale` | invocation expected base/commit/context binding differs from the logical reference or resolved descriptor | no model invocation/acceptance |
| `context_reference_missing` | authorized logical reference cannot currently be resolved or exactly rematerialized | no silent inline substitution; no model invocation/acceptance |
| `context_reference_corrupt` | malformed envelope/binding/manifest/pack, integrity mismatch, unsupported representation, or resolved semantic content fails the bound reference identity | discard resolved material; no model invocation/acceptance |
| `context_reference_limit_exceeded` | any inherited semantic or v1 representation bound would be exceeded | stop bounded work; no model invocation/acceptance |

The benchmark contains finer local diagnostic distinctions, but only the table above is frozen as the D0017 product contract. In particular, a physically readable representation that reconstructs the wrong semantic tree is `context_reference_corrupt`; D0017 does not need a second public semantic-mismatch code.

Existing executor cancellation/timeout semantics remain the lifecycle owner for AbortSignal/deadline termination. D0017 does not introduce a hidden transport retry.

## 9. Retry and restart identity

A retry that keeps all of these unchanged:

- exact `repositoryCommitOid`;
- exact expected semantic `baseDigest`;
- exact repository `contextDigest`;
- exact `caseId`;
- exact `planDigest`;
- exact `caseContractDigest`;

MUST produce the same `referenceId` even though `attemptId` changes.

A process/repository resolver restart does not change logical identity. A fresh receiver may cold-resolve or exactly rematerialize the same reference if the exact immutable source commit and authorization facts are available. Cache loss is not semantic failure by itself.

If exact rematerialization cannot prove the same commit/base/context identity, resolution is `context_reference_missing` or `context_reference_corrupt` as applicable; it must not construct a new reference and pretend it is the old one.

## 10. Cancellation and partial resolution

Resolution is derived read/materialization work. Cancellation before complete semantic verification has **no accepted semantic/model effect**:

1. stop further pack reads/decodes under the existing cancellation budget;
2. do not invoke the model from a partially resolved context;
3. do not emit an accepted D0017 resolution marker/result;
4. discard partial decoded semantic state;
5. delete receiver-owned incomplete temporary files/objects if the implementation created them;
6. complete immutable integrity-verified derived objects may remain only under the resolver's normal bounded retention policy because their existence is non-authoritative.

The D0017 cancellation falsifier observed partial pack work, sent `SIGTERM`, and observed no accepted-completion marker.

## 11. Retention, cleanup and expiry owner

For v1, resolved/packed content is **receiver/executor-owned derived local materialization**.

- The receiver/executor owns bounded retention and eviction.
- Eviction or process restart may make a local binding cold without changing Case/Plan/reference identity.
- There is no reference TTL in the logical identity.
- A miss may trigger exact rematerialization from the same immutable Git commit only if all reference bindings can be reproved.
- A miss may not silently fall back to an inline different request representation for the same live invocation.
- Operator/deployment rollback to the pre-D0017 software path is a separate release-level rollback, not per-request missing-reference fallback.

Cross-worker persistence, durable retention windows, remote object ACLs, distributed GC and shared-storage expiry are not D0017 v1 contracts. If they become required, D0022 must explicitly own them.

## 12. Security and disclosure boundary

D0017 v1 is a trusted receiver-local resolution contract over already-authorized repository context. It does not make a reference a secret capability or a remote fetch token.

Required security behavior:

- authorization is checked before exposing resolved bytes to the model;
- clear local paths, environment values, credentials and receiver locators do not enter the logical reference or canonical semantic evidence;
- integrity is checked before content is trusted;
- stale/corrupt/missing/unauthorized/limit failures are fail closed and result in no accepted model result;
- physical deduplication cannot bypass Case/Plan scope admission;
- observations may record bounded identities/counts/durations but must not leak repository content or secret-bearing paths.

If D0018 later moves the receiver/provider across a new trust or tenant boundary, provider authentication, tenant authorization, minimum-necessary egress, secret/redaction, privacy/residency, provider logging/retention and billing/retry behavior require their own accepted contracts. D0017 does not guess them.

## 13. Migration, deployment and rollback barrier

This Design changes no production source, persisted schema, authoritative state or deployed format.

A later D0017 implementation must satisfy all of these barriers:

1. use an explicit versioned logical reference/profile and versioned receiver representation;
2. preserve the current full semantic model input and result-only acceptance oracle;
3. avoid making physical object existence authoritative;
4. admit the reference path only when both sender and receiver are configured for the same accepted profile; no guessed provider negotiation;
5. keep deployment rollback capable of restoring the current D0014/D0013 inline full-context implementation without semantic migration;
6. treat rollback as an operator/release transition, not as a silent per-request fallback after a D0017 typed failure;
7. introduce no irreversible durable/shared-state migration under D0017 v1;
8. if implementation requires durable shared content, pause at a separately accepted D0022 migration/rollback/authorization contract before creating that state.

Because this decision adds no durable state, there is no D0017 data migration to execute or roll back today.

## 14. Alternatives and non-goals

### Rejected for the first receiver representation

- **Single canonical bundle:** retained as a correctness/reference comparator; rejected as the required v1 representation because whole-bundle JSON materialization had the largest measured heap/RSS in several relevant shapes and no universal wall-time win.
- **Manifest/content references:** retained as a future representation option under the same logical reference; rejected for v1 because per-file object fanout reached 2001 reads on 2000-file shapes.

### Explicitly deferred / non-goals

- ContextSlice or other semantic reduction;
- warm executor/process/provider reuse — D0018;
- external provider choice/tokenizer/billing/privacy contract — D0018 or later accepted provider design;
- persistent cross-worker/shared CAS or R2/D1 — D0022 only if later evidence makes it required;
- cache-locality scheduling;
- production throughput/SLO claims;
- changing D0010 semantic authority, Task retry ownership, result acceptance or Promotion.

## 15. Acceptance matrix and falsifiers

| Gate | Falsifier | Accepted evidence |
| --- | --- | --- |
| D0016 mechanism prerequisite | reference family fails to reduce repeated parent transport while preserving full semantics | D0016 reference families reduced same-base-eight request transfer by about 99.97%; raw evidence hash above |
| one logical identity | representation changes `referenceId` | all three D0017 candidates used the same reference per context |
| semantic binding | reconstructed full context differs from expected base/context digest | all candidate success runs reproduced the expected semantic base and `contextDigest` |
| authorization | another Case/Plan can reuse the reference as bearer authority | wrong Case produced `context_reference_unauthorized` before model acceptance |
| stale identity | wrong expected base is accepted | stale-base probe produced `context_reference_stale` |
| missing/corrupt | resolver guesses/falls through | missing and digest-corrupt probes produced their exact typed failures |
| resource bounds | declared oversized representation proceeds | pack-bound tamper produced `context_reference_limit_exceeded` |
| retry/restart | new Attempt/process changes logical identity | fresh receiver runs with different `attemptId` retained the same reference |
| cancellation | partial resolution can become accepted work | partial read + SIGTERM produced no accepted marker |
| path/API boundary | local store locator leaks into request | D0017 invariant `noRequestContainsLocalStorePath = true` |
| representation choice | candidate has an unbounded/pathological shape hidden by averages | actual + many-small + few-large + deep + wide were compared; packed/hybrid bounded fanout without claiming universal wall-time victory |
| durable-state barrier | selected representation requires shared durable correctness owner | current v1 requires none; D0022 remains conditional |

The original evidence closes the D0017 **decision/contract acceptance layer**. The later production evidence closes the trusted-local production-source implementation layer under its declared supported-Termux qualification; provider/runtime verification remains separate.

## 16. Acceptance decision

D0017 is **accepted** with this exact scope:

1. the selected mechanism remains D0016's immutable full-context reference envelope;
2. logical identity is representation-independent and binds exact commit, semantic base, repository context digest and admitted Case/Plan authorization scope;
3. reference possession is not authority;
4. Attempt identity is excluded so exact retries/restarts retain one logical reference;
5. raw local paths and physical representation locators are not product-visible reference fields;
6. the first receiver representation is bounded packed/hybrid with the explicit v1 bounds in section 7;
7. resolution is complete-semantic and fail closed with the typed failure classes in section 8;
8. cancellation has no accepted effect and partial derived state is cleaned/discarded as specified;
9. local retention/eviction belongs to the receiver/executor and remains non-authoritative/rebuildable;
10. no durable shared store, provider lifecycle, warm process, ContextSlice or external provider contract is activated;
11. production `src/` implementation is not part of this Design commit; the later implementation `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db` is independently verified under the separate production evidence and declared platform qualification.

## 17. Next authorized boundary

The separately scoped D0017 production task has now implemented exactly this accepted contract at `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db` and independently verified the trusted-local source path under the qualification recorded below. This does not reopen or redesign the accepted contract.

At the time of this Design decision, D0018 was the downstream Group E boundary and owned warm executor/process/provider lifecycle and the final real executor/provider boundary; D0022 remained conditional. The Group E implementation and exit/checkpoint were subsequently completed and are retained as historical provenance. Current `WORKBOARD.md` records Group E completed and Group F current. D0017 verification alone did not create Group F and does not replace the current Group-F authority.

## 18. Production implementation verification

The production implementation preserves the accepted logical/physical separation: `tdev.selected-context-reference.v1` binds immutable commit, semantic base/context and admitted authorization scope, while `tdev.context-pack.v1` is an executor-local ephemeral packed/hybrid carrier. The receiver recomputes authorization before carrier access, validates stale/missing/corrupt/limit conditions with the accepted typed failures, reconstructs the complete semantic repository context, and requires canonical descriptor/file bytes to equal the authoritative D0014 preparation before the existing fresh subprocess request is admitted.

Verification at source commit `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db` produced these independent results:

- focused D0017 + repository/model transport: 52/52 passed;
- `npm ci --ignore-scripts --no-audit --no-fund`: passed;
- `npm run check`: passed;
- supported-Termux source coverage excluding only the pre-existing hard-link test file: 226/226 passed;
- exact all-test coverage: **platform-unqualified** because `test/immutable-journal.test.mjs` alone hits the previously known `link(2) EACCES`; no D0017/repository-model-transport failure was observed;
- `git diff --check`: passed.

The implementation creates no persisted Case/Plan schema change and no durable context state, so D0017 requires no data migration. Release rollback is deployment of the pre-D0017 D0013/D0014 full-inline source; a live unauthorized/stale/missing/corrupt/limit reference failure is not permitted to fall back inline. D0018 warm/provider lifecycle, D0022 persistent/shared storage, ContextSlice, and external-provider authentication/tokenizer/billing/privacy/residency remain outside this production verification.
