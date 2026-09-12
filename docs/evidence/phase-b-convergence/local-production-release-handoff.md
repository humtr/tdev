# Local production enrollment / release composition handoff

Evidence class: local source implementation and deterministic tests only.
Local candidate complete; not yet canonical; not commissioned; not live accepted.
First release complete: **NO**. Canonical branch modified/pushed by this session: **NO**.

## Bound source and authority

- Fresh starting canonical `origin/dev-2` HEAD:
  `cd3d63fd152e54d73641b6dd2dcc8944090404c9`.
- Starting canonical tree: `40c2b4bfa68dab0edd5788c53d84edc2d71920da`.
- Original local checkout was on `dev2` at
  `c4039be6f23c0322ff3d3a7160039127f99abb49`, not the canonical branch.
  Its unrelated untracked runtime/qualification/log directories were preserved.
- Isolated worktree: `/data/data/com.termux/files/home/prj/tdev-prod-release`.
- Local branch: `codex/prod-enrollment-release-join`.
- Exact implementation/final commit and validation identities: see the validation
  record appended below; final handoff commit is obtained from this branch's HEAD.
- Directive: r4. Selected Designs: D0001/D0002 (retained work/source), D0003
  (validation/integration), D0005 (managed isolation), D0006 (release), and new
  accepted D0008 (this bounded commissioning/composition join).
- D0001-D0007 Directive metadata was synchronized to r4 for the existing Design
  checker. No authority precedence/role was changed. D0004/D0007 received metadata
  changes only. The public four-tool schemas remain unchanged.

Codex was development tooling only. No Codex, second LLM, new backend, new build
system or MCP dependency was added to the shipped canonical product path.

## Implemented blocker contracts

### 1. Separate production enrollment

`src/runtime/production-enrollment.mjs:verifyProductionEnrollment` accepts only the
closed version-1 `dev2.production-enrollment` record. Qualification enrollment is
still verified separately by `verifyEnrollment`; its production-outer gate remains.
Historical `productionValidation:false` remains false and never supplies production
receipt eligibility. Source/config/schema names and arbitrary rehashed JSON do not
authenticate anything.

The record is `{schemaVersion:1, kind, intent, proofs, sealDigest}`. Its canonical
seal is `recordDigest('dev2.production-enrollment.v1', bodyWithoutSeal)`.
It names actual records in the same private native ledger, not embedded reports.
Verification returns a frozen, process-branded capability; JSON cloning loses it.

The closed intent is `{schemaVersion:1, kind:'dev2.production-commissioning',
commissioningId, installationId, repositoryId, bindingEpoch, providerRepositoryId,
repositoryOwnerId, repositoryFullName, approvedCommitOid, approvedSourceTreeOid,
approvedSourceManifestDigest, identities, engineDigest, dependencyArtifactDigest,
qualificationSealDigest, runtime}`. `identities` is exactly the approved source's
`managedDefinition().identities`: trustedRunnerDigest, controllerDigest,
toolchainDigest, dependencyLockDigest, workflowDigest, imageDigest, seccompDigest.
`runtime` is the exact installed sourceCommitOid/sourceTreeOid/bundleDigest/schemaDigest.

`production.commissioning:<commissioningId>` retains that private intent exactly.
Its domain `dev2.production-commissioning.v1` is only the probe assignment seal,
distinct from the final enrollment seal. No caller chooses a production capability
by supplying that digest. Installer probes have no validation/integration/Builder
port. Their private `production.commission` action is not in the public input schema.

There are exactly three ordered proofs: fixed core, integration, release-build.
Each proof is `{resultId, assignmentId, sessionId, runId, runAttempt:'1', leaseId,
profileDigest, contextDigest, outerReceiptDigest}`. Verification joins the actual
prepared result, original action/attempt, native assignment/input identity, selected
provider repository/owner/ref/workflow/run, exact source/execution, session lifetime,
lease, approved engine/controller/seccomp/dependencies, output bytes and kernel
evidence through existing `ProductionReceipts` / `joinProductionReceipt`.

`ManagedSessions.complete()` now atomically retains
`managed.completion:<assignmentId>` only after authenticated OIDC/lease/ready-object
checks. It stores the completed assignment, selected session snapshot and exact
launchIdentity. Later normal idle retirement does not retroactively cancel that
execution. Missing historical snapshots are NOT backfilled. Cancellation/stale
state at completion, changed identities, failed execution, invalid isolation,
missing kernel evidence, noncanonical outer bytes and partial uploads fail closed.

Live-only: actual approved provider/OIDC execution, production-adapter containment
qualification, authoritative kernel/object evidence and private commissioning.
Fixture ledgers/reports are not usable installation inputs.

### 2. Managed producer and finite Builder

`createManagedControl(...).production.builder` is present only after separate
production verification and with an installed helper installationSealDigest.
`createProductionControl` reuses ManagedSessions/ManagedPool/ExecutorEndpoint on
the same native ledger. Private OIDC callbacks and cancellation route by retained
session execution identity. No additional work/session owner is introduced.

`src/release/managed-builder.mjs:ManagedReleaseBuilder` implements the existing
ReleaseBackend Builder. It accepts the existing integrated-source authority object,
uses the fixed release-build profile and existing ProductionRunner/build tool, and
reconstructs its manifest/receipt from actual authenticated output objects.
Exactly `device.cjs`, `worker.mjs`, `tools.json` are accepted: each positive-sized,
aggregate decoded bytes <= 8 MiB, bounded encoded output <= 12 MiB, canonical names,
size/digest checks and the exact installed four-tool descriptors/schema. The outer
log is diagnostic evidence, not a fourth release artifact. ReleaseArtifactStore
then verifies/stores the same bytes. No stdout hash or candidate manifest is a seal.

`release.build:<actionId>` retains immutable source/previous-pair/input identity
and the first existing action reservation BEFORE managed dispatch. The build does
not create another work or consume a second action slot. Duplicate requests must
have identical inputs. Completed assignments survive lost replies/restart; pending
or cancelled first assignments cannot become a new logical build on a later attempt.
The existing production journal fails an interrupted unknown command outcome rather
than executing it twice. Partial uploads/corruption stay unavailable.

Release manifest executor.controllerDigest is the COMPLETE trustedRunnerDigest,
not the nested inner controllerDigest. The fixed schema/protocol/ledger and edge
compatibility date (`2026-08-15`, existing deploy identity) come from the approved
controller. Source, required-validation id, exact build proof and installation
seal all participate. `release.stage` has a fixed 900000-ms action ceiling so its
300000-ms profile plus launch/transfer/staging overhead can actually be admitted.

The historical validation policy is NOT automatically adopted into production.
`policy.adopt` remains its existing authorized, integrated-data CAS operation.
Production-capable policy selects the production receipt verifier; historical
policies/receipts remain separate. `managedExecution.sealDigest` reflects the
currently selected validator; release admission has its separately bound producer.

Live-only: approved runner execution of the actual integrated releasable source,
finite artifacts retained over the real upload channel, live loss/restart/cancel
reconciliation and, when required, ordinary production policy adoption.

### 3. Native main and public operation composition

`tools/device-main.mjs` checks its actual bundle digest.
`src/runtime/native.mjs:createNativeInstallation` now composes, in order:

1. Private config/path checks; NativeReleaseControl init and fresh startup admission.
2. Managed/production enrollment verification (or qualification-only source mode).
3. DevelopmentEngine with existing policy and release special/recovery hooks.
4. Authenticated native status/drain RPC, then NativeReleaseRuntime/artifact init.
5. Normal pump and device connection; commissioning mode instead drains public work.

Release availability requires verified production enrollment, its real Builder,
authenticated matching helper admission, valid paired installed release config and
artifact directory, initialized NativeReleaseRuntime and the current ledger owner.
Absent enrollment preserves bootstrap/qualified source capability but release stays
unavailable. Invalid supplied enrollment/config fails startup; it is not silently
ignored. Startup failure closes any newly opened private RPC and ledger owner.

Existing ReleaseBackend/activation journal own stable action/effect identities,
dedup, expected-active CAS and response-loss recovery. Policy handlers are retained.
Actual public-schema `dev_work` admission is exercised locally with fixture ports;
no live public release call was made.

Runtime projection separates canonical source, installed device source, observed
edge source, retained stage, pending activation and live active pair. Active/sealed
requires `NativeReleaseRuntime.refresh()` plus exact current pair readback; failure,
pending rollout, expiry or disconnect clears it. An in-flight readback invalidated
by disconnect cannot resurrect a stale active pair. Retained helper state alone
never establishes deploymentSealed. Unverified activation projects frozen-schema
`idle`, not an invented enum value.

Live-only: sealed helper/private RPC/runit/writer-fence installation, actual owner
admission, Cloudflare effects, public stage/activate, paired readback and rollback.

## Exact commissioning inputs and sequence for Pro

First Pro/live action is READ ONLY: fresh canonical `dev_context`, current
AGENTS/DIRECTIVE/RULE/WORKBOARD/selected Designs, and `dev_observe` runtime/open
work state. Compare with this local branch; review its commits before authorized
canonical integration. Do not assume any historical HEAD, provider run or installed
runtime is current. No automatic push was made by this session.

1. Integrate/review the candidate under the current canonical workflow. Record the
   resulting exact approved commit/tree/manifest and computed managedDefinition.
   Local Git integration alone is NOT a native IntegratedSourceAuthority record.
2. Obtain actual production-adapter qualification/negative containment evidence,
   exact rootless engine executable digest and approved dependency artifact identity
   for that controller/image/lock on the provider. Do not reuse the historical
   qualification-only adapter's PASS as production. The commissioning intent names
   approved enforcement bytes; its successful probe receipts must independently
   match them. Provider drift requires renewed approval/evidence, not a relaxed gate.
3. Install only missing native capability under the existing bounded bootstrap
   allowance: the actual newly built device bundle with matching source/tree/schema/
   bundle identities, private config, canonical sender/guard and existing qualified
   managed enrollment. If baseline source changed, obtain the exact new nativeJoin
   core/integration record and seal it WITHOUT changing its productionValidation:false
   or historical controller evidence. Do this before binding the production intent's
   qualificationSealDigest. Never run source imports while claiming an old bundle.
4. Prepare a private absolute regular mode-0600 intent file with the exact fields
   above. It names the installed baseline runtime and existing qualification seal.
   Native config at this phase has managedEnrollmentFile but NO productionEnrollmentFile.
   A helper is not needed to collect the three probes. Stop the old exclusive native
   owner first; do not run two processes on work.sqlite or delete/reset its ledger.
5. Invoke the installed digest-checked commissioning entrypoint through the local
   operator launcher (paths below are placeholders, not actual installed inputs):

   ```sh
   node tools/commission-production.mjs \
     --device /private/installed/device.cjs \
     --config /private/installed/native.json \
     --intent /private/production-intent.json \
     --output /private/production-enrollment.json
   ```

   It launches that exact device bundle with installer-only `--commission-intent`
   and `--commission-output` arguments. Public admission is drained; the actual
   device/executor OIDC channel serves only native-retained private probes. The
   same commissioningId/profile reuses its original action/result/assignment;
   physical replacement uses only the existing positively-stopped, never-assigned
   session rule and cannot replace an already leased logical execution.
   interrupted/failed/expired proofs do not gain enrollment. Retry response loss
   with the SAME intent/output and preserve ledger/object custody. A definitively
   failed/expired execution needs reviewed fresh commissioning intent, not relabeling.
   Success writes the immutable canonical final record; stdout is a locator/identity
   summary with releaseActivated:false, not acceptance. Never copy fixture outputs.
6. Install productionEnrollmentFile pointing to that record, releaseArtifactDirectory
   matching the helper artifact root, and releaseControl with exactly:
   helperEndpointFile, helperKeyFile, nativeEndpointFile, nativeKeyFile,
   installationSealDigest, deviceReleaseId. Files/keys and directories follow the
   existing private regular-file/no-alias/symlink/hardlink and 0600/0700 discipline.
   Helper/native RPC keys are distinct 32-byte role keys. Public/candidate input
   cannot choose or override these paths.
7. Commission the existing HelperConfig, not another release backend: actual
   baseline RuntimePair and DevicePointer; baseConfigDigest over the final native
   config; executor {sealDigest:production seal, controllerDigest:trustedRunnerDigest,
   workflowDigest}; actual helper bundle and installation seal; private journal,
   object/artifact/config/pointer/endpoint/key paths; fixed writer-fence/runit/Python
   helper/config digests; Cloudflare account/worker/router/edge config and private
   credential locator. See the exact HelperConfig type and helper-runtime-join.md.
   The sealed native template's release locators must match these helper locators;
   subsequent admitted device configs inherit them unchanged.
8. Start helper, then native. Freshly observe owner/runtime/availability and actual
   baseline pair. If a production source policy is needed, integrate its bounded
   policy file under the current validator and use ordinary policy.adopt with exact
   integratedCommit/policyPath/expectedPolicyDigest/newPolicyDigest. This does not
   enroll a controller. Obtain a genuine current native integrated-source/validation
   authority record for the commit to stage; no manual SQL/imported arbitrary proof.
9. First release mutation is an ordinary public `dev_work` item:
   `{op:'release.stage', repository:'self', requestId, integratedCommit,
   expectedActiveRelease, policyDigest}`. Read expectedActiveRelease from fresh
   verified paired runtime; observe the returned action and retain its result.
   Then `{op:'release.activate', repository:'self', requestId,
   stagedReleaseId, expectedActiveRelease}`; stagedReleaseId is the returned release
   digest's 64-hex identity without the `sha256:` prefix (current frozen id schema).
   Reuse requestId ONLY for identical retries. Never create another activation
   because its response was lost. Observe/reconcile the retained action/helper effect.
10. Retain paired device/edge/pointer readback, actual rollback and another paired
    readback. Then runtime self-development through ChatGPT -> canonical dev-2 MCP
    -> core, physical overlapping eight-way work, Android kill/Doze/reboot and the
    other Directive acceptance evidence. None was exercised here.

## Failure expectations / remaining risks

- No production authority from wrong installation/repository/binding epoch/provider
  repository/run/attempt/workflow, controller/source/manifest, assignment/lease/
  session/result/profile, outer digest, output bytes or missing native completion.
- No production PASS from qualificationValidation:false, fixture JSON, a green
  workflow alone, schema/version names or a source-provided seal.
- Missing/ineligible kernel or isolation evidence and failed/timed-out/cancelled
  execution remain fail-closed. Partial uploads and lost unknown outcomes never
  authorize new logical work. Actual resource/process absence is not inferred.
- Actual GitHub permission/capacity/OIDC reachability, engine/dependency stability,
  Termux launcher semantics, helper keys/baseline identity and Cloudflare paired
  compatibility are unverified until live commissioning. This local Android/arm64
  shell is a test host, not the installed product runtime.
- A production record requires retained native ledger and objects across restart;
  copying JSON without that custody intentionally fails. New controller/engine/
  binding approval is separate commissioning, not candidate-controlled policy.
- Existing release/live/benchmark aggregate profiles remain unimplemented and are
  NOT marked PASS. Local core/integration have installationEligibility:false.
- Generation 5/8 retirement and stale provider capacity reconciliation were not
  reopened. The managed-pool change is only the new no-work release.stage fence.

## Changed files and validation record

The implementation commit contains source changes in execution sessions/outer
receipts/pool; new runtime production enrollment/control/commissioning; managed
validation routing; finite release Builder/output; native startup/application/
projection/engine budget; helper config join; device and private commissioning
entrypoints. Tests cover enrollment trust mismatches, finite output/replay/restart/
cancel/partial upload, managed producer separation and native main/public-schema
composition. D0008, r4 Design metadata/index and routing handoffs are included.
Use `git diff --name-status cd3d63fd152e54d73641b6dd2dcc8944090404c9 HEAD` for the
exact inventory. Exact final local validation results are appended before handoff.

### Recorded local validation (2026-09-12 UTC)

Implementation commit: `b9c7db04687d6d2eab8609ca0603e7aaf4bde9e5`.
The following documentation-only handoff commit does not change validation inputs.
The implementation is one atomic composition commit because producer, enrollment,
native startup and their tests depend on each other's contracts.

- `npm run check`: exit 0. Core: 172 passed, zero failed/skipped; integration:
  198 passed, zero failed, one pre-existing Android-specific skip (199 total).
- Core finished `2026-09-12T15:54:05.688Z`; integration finished
  `2026-09-12T15:55:34.226Z`. Both input/output identities match:
  `sha256:b4810b864bccf313ae4f43c727b371276ed6067ccacca232b05d99f6ac1aa62a`.
- Core result file digest:
  `sha256:ce4287b01a9da8105021caef40f89ac5033518785eeea1775a3932db18d22a3f`.
- Integration result file digest:
  `sha256:d14b553556e83e35f39b2204a603eba1b8eae07fe10b159d276320b15c8c7828`.
- Local results/logs are retained under `.artifacts/core/` and
  `.artifacts/integration/` in the worktree (ignored, not production evidence).
  Both report `installationEligibility:false`, `controllerMode:local-reviewed`.
- The skipped test is `hard links never enter a dependency artifact`: native
  Android forbids creating that fixture. The existing hosted-Linux test MUST run;
  its containment proof is not covered by this local PASS.
- `npm run typecheck`: passed. Standard core also passed required JSDoc/static,
  Python and Design checks; Design checker passed all eight Designs.
- Focused command below: 38 passed, zero failures/skips. It includes qualification
  separation, production enrollment and receipt negatives, production runner
  replay, Builder recovery, managed producer and native public-schema composition.

  ```sh
  node --test test/core/native-enrollment.test.mjs \
    test/integration/outer-receipt.test.mjs \
    test/integration/production-runner.test.mjs \
    test/integration/production-enrollment.test.mjs \
    test/integration/managed-release-builder.test.mjs \
    test/integration/production-commissioning.test.mjs \
    test/integration/native-main-release.test.mjs \
    test/integration/native-release-composition.test.mjs
  ```

- `node --test test/release/*.test.mjs`: 36 passed, zero failures/skips. These are
  fixture tests, NOT a PASS for the unimplemented release acceptance profile.
- `node tools/build-device.mjs .artifacts/local-composition-build`: passed;
  918025 bytes, digest
  `sha256:42a03fbef1c090962a5053b3d26eb5514d55c20dbc3236bcb0ea77a923c0ed4b`.
- `node tools/build-release-helper.mjs .artifacts/local-helper-build`: passed;
  430102 bytes, digest
  `sha256:633454aed56d24437dc9a9a60776ed8558e599cc1aefbe702a8a52fea3cc12cc`.
- Frozen schema remains
  `sha256:0de1e538b40c866a3a91acfdc70eba89c09902972daf65fca0688c61ac0de25c`.
- Actual local validation environment: Android arm64, Node 24.18.0, SQLite
  3.53.4, npm 11.19.0, Git 2.55.0. Approved package lock was installed with
  `npm ci --ignore-scripts`. No package/toolchain/profile security gate was weakened.

No actual provider execution, installed runtime commissioning, helper deployment,
Cloudflare mutation, live public stage/activate, paired activation/rollback or
physical Android/eight-way acceptance was performed. Those remain unknown.
