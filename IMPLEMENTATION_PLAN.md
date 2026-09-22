# Implementation order

Derived from ARCHITECTURE; status belongs in README, wire types in the contract.
Termux alone must support the default coding path. Optional remote backend qualification
does not block any native deliverable.

Product scope and version authority are defined in README. The table below describes the
existing implementation sequence, not completion of the broader product goal. Continue with
the next sequence below; do not treat source publication as the deployment milestone.

| Deliverable | Required invariant | Minimum checks | Next prerequisite | Human acceptance |
|---|---|---|---|---|
| 1. Contract/SQLite/Git task/read/edit | current scope, atomic edits, checkpoint CAS, replay before stale, unrelated state preserved | JSON Schema fixtures, Git fixtures, restart/races | durable source/intent | none |
| 2. Command + validation/publication on Termux | native default without executor registration; clean env and disposable source; real exit; exact commit; durable replay; non-force CAS | native commands, stdin, output/deadline, source-change/forged-stdout rejection, exact publication | complete on-device coding path | none |
| 3. Process recovery and HTTP/auth | detached supervisors survive controller restart; no lost-response relaunch; per-task uncertainty; MCP 2026-07-28 per-request metadata, no legacy handshake | real crash/reconnect, subreaper cancellation, input replay, full HTTP edit/exec/validate/publish; pinned official SDK and negative wire tests | recoverable MCP | ChatGPT connection/Refresh, exact-version forwarding and credential entry only |
| 4. Inactive install/rollback and config | omitted/native config works; explicit SSH stays optional; no false sandbox/egress claim; no production effect | defaults/legacy SSH schema, installed CLIs, packaged native path, rollback/tamper | ready for on-device host acceptance | Tunnel credentials and explicit production cutover only |
| 5. Local client and CLI extension qualification | no core protocol downgrade or new authority; fixed tmcp host-hint annotations; completion visible in same turn/reconnect; closed resources manageable | bounded frontier/no-change/missed completion; installed Codex discovery + disposable read/edit/exec/operation/validate/publish/replay/retire; external CLI real exit/capture/forged authority rejection | qualified selected clients/extensions, not every hypothetical adapter | targeted ChatGPT Refresh/approval acceptance after annotation changes; persistent Local Codex registration uses operator-supplied private bearer |
| 6. Delegated projects and managed work | local/GitHub connect/create within one-time scope; automatic base/name; create-if-absent publication; owned CAS cleanup after close; current policy/replay | ordinary dirty checkout preservation, new-project native HTTP path, ref transport CAS, provider fixtures, response loss/restart, revocation/identity replacement, incompatible-state rejection, compatible rollback | ChatGPT can start a new project without per-project private config edits | one-time local-root/GitHub-owner delegation and provider auth; affected Connector Refresh/live acceptance |

Each deliverable: source, invariant tests, focused/affected checks, first-order failure
repair, scripts/check.sh, coherent diff/state review; then continue. Authored-program tests
exercise the real default runner but do not prove hostile-code isolation. Keep optional
OCI tests without treating external enrollment as a gate.

Live progress continuity is a required acceptance dimension, not optional UX polish.
The primary failure case is **same-turn staleness**: an operation advances or completes while
the model is still working, but subsequent wait/status/frontier reads keep returning an older
view, so the model waits, re-investigates completed predecessors, or stays trapped in the turn
without doing the now-admissible next work. In observed failure this prolonged ambiguity can
also make the model abandon the normal development path and drift into unrelated defensive/
guard checks. Tests must force this race and prove that bounded repeated observations are
monotonic/current enough to expose the terminal transition and let the same turn continue.

Acceptance must also cover the no-change case: after a bounded number/time of observations,
the product must return an explicit current no-progress result with freshness/provenance rather
than encouraging an unbounded polling loop. No test should require the model to infer that
authorization/safety state changed merely because operation progress is stale or ambiguous.

Fresh-session/reconnect continuity is the second half of the same invariant. At representative
cut points, terminate the client/controller view and resume from a fresh session. One bounded
current-frontier read for the selected task must identify recent proved-complete predecessors,
running/unknown effects, current source/remote observations and cleanup ownership. The model
chooses useful next work; only fresh admission establishes whether an effect is admissible. This
is not a one-call atomic snapshot of all projects, deployments or providers. The fresh
session must skip completed predecessors and, absent a genuine external blocker/unknown
effect, perform useful forward work in that same turn. Tests must cover "completion happened
but caller did not observe it" for both same-turn polling and fresh resume. Terminal lifecycle
must also leave a supported inspection/cleanup path for clean owned resources.

Material recovery alone does not reconstruct a changed objective or design rationale. The
optional semantic continuity slice below addresses that gap without making a resume note a
prerequisite for development or expanding this requirement into a mandatory workflow engine.

Additional observed harness lessons to preserve during tdev implementation:

- Command execution must expose the underlying command result prominently; controller/job
  admission success must not be mistaken for process/test success.
- Long-running development processes need a product-owned start/status/log/stop lifecycle;
  do not force callers into unmanaged detached-shell workarounds.
- Isolated worktrees/copies need a reproducible dependency/tooling context so clean isolation
  does not silently remove required ignored caches or environments.
- Closeout must remain actionable through commit/push/readback/cleanup; terminalization must
  not strand unfinished closeout work or its owned resources.
- Registry/descriptive metadata can become stale; mutable repository/runtime facts must be
  freshness-bound to their current owner rather than trusted from cached labels.
- Status/readback surfaces need bounded summary/collapse/limits so large untracked trees do
  not turn a simple progress check into a huge artifact.
- Git/ref inputs should have consistent, explicit semantics across operations; common symbolic
  refs such as HEAD must either work consistently or fail clearly by contract.
- Request identity should be easy to generate safely in long autonomous runs; idempotency
  conflicts must stay explicit without requiring fragile manual request-id bookkeeping.

Existing source-development path: open → read/edit → exec/operation → validate → publish → readback.
Never weaken exact publication/replay to hide missing native support. Keep native authority
limitations explicit instead of promising unavailable kernel boundaries. Avoid repeated
permission choreography inside already delegated scope.

Deliverable 5 is derived from the selected local client and command-first extension path,
not an inherited stage name or a requirement to implement a capability gateway. Its adapter
is an explicitly selected legacy stdio edge; core HTTP remains 2026-07-28. Run
`scripts/check_codex.py` separately from deterministic tests because it depends on installed
Codex. CLI fixtures prove extension behaviour, not hostile same-UID isolation. Qualify a
remote/API/device adapter only when one is actually selected. Existing local checks leave
affected host acceptance and separately authorized activation; the broader coding/deployment
goal also requires the work below.

## Next implementation sequence

The user's resident-service request prioritizes tdev's own service installation and manual
runtime replacement before the remaining development-environment work in step 2. Complete
that concrete deployment, then return to persistent environments/dependency reuse/processes;
this does not declare arbitrary project deployment or the complete coding journey finished.

1. **Resolve concepts and contracts together.** Maintain the composition model in
   ARCHITECTURE: workspace, reusable project, source task and operation. Qualify single-project
   defaults, multi-project targeting, source isolation, current authority, concurrent close/
   admission, bounded current progress and restart replay. Update affected clients with
   renamed contracts together; do not add aliases or migrations solely to preserve experimental
   interfaces. Completion and current qualification belong in README and LOCAL_VALIDATION.
2. **Complete routine local/Git development.** Cover project create/connect, local source
   import, branching, comparison, editing, persistent dev processes/debugging, dependency
   reuse, validation, commit/integration/conflict resolution, publication/readback and owned
   cleanup. Preserve deliberate edits and recover interrupted work. Ordinary use must not
   require manual IDs/OIDs or per-project private configuration changes. Task dependency storage
   and snapshot development processes use existing execution/operation ownership; qualify
   cross-task environment reuse, hot reload or PTY debugging only for a concrete next use case.
   Support multiple project targets without implying atomic multi-repository publication.
3. **Connect the resources needed for that path.** Establish concrete connection/runtime
   identity, delegated authority and lifecycle using the native and Git provider paths first.
   Keep provider effects available through authenticated connections without distributing
   credentials to every command. Make extension points usable for selected MCP/API/CLI/device
   adapters; a general gateway, model router or mandatory decision model is not a prerequisite.
4. **Complete deployment and resident operation.** Bind validated artifacts to explicit
   targets and implement deploy/status/log/stop/update/recover/remove semantics. Finish the
   tdev Termux service installation requirements in OPERATIONS as the first concrete resident
   deployment. Distinguish source publication, installation, readiness and actual live behaviour.
   The first project adapter is delegated Termux runit source releases with explicit HTTP
   release identity, stopped-service updates, rollback and data-preserving removal. Follow with
   retained dependency/build-artifact packaging before claiming arbitrary app deployment;
   reproducible rebuilding is an additional property to measure, not infer from retention.
   Tests and inactive preparation do not authorize production activation.
5. **Qualify the whole user journey.** From ChatGPT, start a new local project, develop/debug,
   validate, integrate/publish, deploy to an authorized test target, verify identity/health,
   update/recover and clean up. Exercise reconnects and lost responses at effect boundaries.
   Include a two-project change. Measure human terminal/config interventions, manual identifiers,
   tool round trips, environment startup and repeated work; the simple path must not become
   more cumbersome because composition exists. Record measured results, not projected gains.

Only after the first complete path, qualify additional integrations as demanded by real work,
such as Blender MCP, Android computer use or a replaceable decision model. Test attach/use/
detach and replacement with task continuity; no selected extension becomes a dependency of
basic development. Follow README's version policy throughout this sequence.

## Current priority after the continuity review

The 2026-09-22 review preserves the sequence above and makes the remaining delivery order
concrete. Architecture owns the selected boundaries; review observations are in LOCAL_VALIDATION.
The existing packaging WIP is retained and generalized below, not discarded.

1. **Settle small packaging prerequisites — this review.** Separate build host, artifact target,
   signing transformation and deployment target. Preserve non-service outputs and optional
   continuity/resource/Android support. The read-only Android inventory establishes plausible
   feasibility, not a qualified toolchain. No Android-use or new host gateway is a prerequisite.
2. **Implement packaging slices 1–6 below.** Start with the native dependency/generated-asset
   service case and a non-service artifact fixture. This finishes the missing material path
   using existing exec/operation ownership; source-free host access and semantic history are not
   required to build from a source task. Qualify the exact Android toolchain separately before
   promising APK/AAB support; a bounded APK/AAB build/signature spike may accompany packaging
   qualification, but must not grow into companion/UI work or block the first service package.
3. **Add minimum optional resume notes.** Use the now-stable source/artifact/deployment references
   and existing workspace actions. This is a small independent slice before final journey
   qualification, not a prerequisite for packaging. Defer journal compaction and conversation
   routing unless the note-only measurements demonstrate a concrete gap.
4. **Qualify the complete ChatGPT journey.** One new local project and one two-project workspace,
   dependency/build output, validation/publication/deployment/recovery/cleanup, and actual fresh
   conversations with/without notes. Measure cost and useful recovery, not just API existence.
5. **Qualify source-task-independent native resource access.** First filesystem/process/toolchain
   inspection (including explicitly selected external-session metadata) without creating a dummy
   task. Reuse existing observation/operation conventions. Move only a narrowly demonstrated
   blocker ahead of step 4; do not speculate a connection platform before it is needed.
6. **Add demanded adapters.** External MCP/CLI/API/model/remote/container integrations and optional
   Android companion/UI control follow concrete projects. Android app build/package qualification
   may occur earlier; it does not wait for Android-use. No selected adapter becomes core required
   infrastructure. Shared primitives do not imply one transport or authority hierarchy.

**Next work is packaging slice 6 qualification and delivery**, following explicit retention,
bounded file export, prune recovery and operator budgets. Qualify the packaged installed path
and remaining journey cases, preserving active/previous/in-flight pins and source-only deployment.
No unresolved continuity metadata or Android UI question requires delaying it. Android SDK
installation, device permission changes and resident activation are separate from these source slices.

## Deployment packaging implementation plan

This is the detailed plan for step 4, recorded at the user's request after canonical
`758ef37eaa164370d94486b247f1bd8bdbd1cb62`. It authorizes no implementation or activation by
itself. Current behaviour remains in README/ARCHITECTURE and current wire types remain in
contracts/tools.schema.json. The action/field names below are proposals to settle with the
corresponding implementation slice. `inspectRecipe/prepare/list/inspect`, artifact-subject
validation, packaged release, bounded file export and explicit pruning are implemented.
Stay on the authorized 0.1 product line.

The first two slices supply bounded recipe/manifest definitions, frozen-source/current-policy
binding, source-vs-artifact receipt rejection, native build admission/replay and retained sealing.
Signing transformations, runtime layout and artifact-validation requests must be qualified with
their execution slices; schema acceptance is not a claim of APK/AAB toolchain support.

### Outcome and first supported case

An app with a third-party dependency and generated build output must run from a retained,
verified artifact after its source task, development environment and build scratch directory
have been removed. Updating or rolling back selects retained artifact bytes; activation must
not reinstall dependencies, contact a package registry or run a build. Source publication
remains independent of deployment, and deployment never changes the canonical Git ref.

Artifact production itself must also work without a deployment: native binaries, archives,
static/web packages and Android APK/AAB are concrete general-development outputs. The shared
artifact model cannot require a service target, foreground entrypoint or HTTP readiness. The
first service adapter adds these requirements only when releasing its selected artifact.

Start with a Termux-native Python HTTP application, one pinned pure-Python dependency and a
generated asset. Then qualify a compiled Python dependency against the selected Android ABI.
Node/static/native-binary recipes reuse the proven artifact lifecycle only when qualified;
do not claim arbitrary package-manager or cross-platform compatibility from the Python slice.
The initial package includes application outputs/dependencies, not Android, the interpreter,
all system libraries or a container image. Required host components are explicit external
requirements with checked identity. No public ingress, secret manager, database migration,
zero-downtime switch, universal build graph or remote registry is a prerequisite.

### Required joins and authority

The flow is source validation → prepare artifact → validate sealed artifact → release it →
verify live identity. Each arrow joins immutable identities rather than a mutable directory
name. Source validation continues to bind the exact candidate and adopted project policy.
Artifact validation additionally binds packaged bytes and the applicable verification policy.
A service validation also binds runtime requirements and launch specification. Passing source
tests does not prove that a dependency/build package works.

Keep the existing source-task/checkpoint/publication model and deployment target ownership.
An artifact is a retained build output, not a new source task, project or work mode.
Workspace composition supplies context; it never grants build, repository or target access.
Current principal/project/target checks apply to new effects and replay. Changing a policy,
repository identity or target must not silently reinterpret an accepted build or release.
Stopping/removing a known owned deployment remains possible after artifact damage.

### Slice 1 — recipe, identity and contract

1. Define a bounded project-owned packaging recipe captured in the validated candidate. Bind
   its path and digest, explicit input/lockfile paths, build command, exported roots/output kind,
   build host/toolchain and artifact target requirements. Service recipes additionally bind a
   foreground entrypoint and non-secret runtime settings. No recipe field grants
   authority, chooses an arbitrary installation root or overrides mandatory validation.
   Scope permits normal project recipe edits without per-build private configuration edits.
2. Separate acquisition inputs from execution inputs. Resolve dependencies once using pinned
   lock entries and content hashes; preserve the selected distributions and transitive closure.
   A cache is an optimization only: every reused item is checked against recorded content.
   Unpinned, missing, changed or incompatible inputs produce a concrete failure, never a
   fallback to the mutable task venv or a silently refreshed dependency version.
3. Specify a canonical manifest containing file paths/modes/content digests, output kind,
   source-tree identity, recipe/input digests, build/target compatibility and optional service
   launch information. Do not confuse the build executor with the eventual runtime. Keep build
   candidate/validation/operation IDs, timestamps, policy and observations in provenance receipts so retries with identical
   semantic inputs/outputs need not produce a different content identity merely from new IDs.
   Distinguish replaying the same retained artifact from reproducing identical bytes in an
   independent build; only measured repeatability may be reported as reproducibility.
4. Prefer one `tdev_artifact` surface for prepare/list/inspect/export/prune, rather than forcing
   an APK/archive build through a deployment tool. This replaces the earlier proposal to put
   all artifact actions on `tdev_deploy`: names should match the responsibility, not optimize
   tool count. Reuse `tdev_operation` for execution/recovery, an artifact verification variant
   on `tdev_validate`, and `tdev_deploy` for release from successful artifact validation. Keep
   the current source-release variant explicit. Release must not accept a different launch command
   that bypasses the artifact verification receipt. Use returned handles/default target
   resolution; ordinary use must not require users to type digests or internal IDs.
5. Freeze the source/artifact validation distinction in contracts and negative tests.
   `tdev_publish` accepts only appropriate source validation; artifact validation neither
   regenerates the source candidate nor substitutes for source publication authorization.
6. Model signing/post-build packaging as transformations with input/output identities; verify
   the exact final output after signing. Preserve signer references/public certificate identity
   without storing keys/passwords. No signer service is required for the first unsigned fixture.
   APK and AAB require different signing/installation handling; qualify each selected recipe,
   not an Android-specific universal pipeline. Authorized export of retained bytes must work
   independently of service activation, with bounded transfer/digest verification and no arbitrary
   host-path reads. Download/installation success is separate from live verification.

Done when fixtures reject inconsistent candidate/recipe/artifact/runtime joins, policy changes,
forged success data and stale request/revision inputs, while the source-only path still works.

### Slice 2 — retained builds and sealed storage

1. Add the smallest artifact record needed for owner/project identity, content identity,
   build/source-validation references and storage/pin state. Use existing operation intent,
   result, effect certainty and request deduplication for the build; do not copy command logs,
   validation results or credential grants into another history table. Retain failed build
   evidence with bounded logs and actionable cleanup, including across task/workspace close.
2. Reuse the native supervisor for cancellable/deadline-bounded builds in a fresh source copy
   with independent scratch and dependency storage. Pin the frozen input, not the mutable
   development environment. Record process identity before relying on a build result; reconcile
   an accepted operation on reconnect instead of rerunning its package-manager/build commands.
   Source editing can continue without changing this build's input. Surface outstanding builds
   through bounded operation/deployment inspection so they are not hidden behind a history page.
3. Acquire dependencies using existing authorized facilities without putting credentials into
   the recipe, manifest, subprocess receipt or exported package. The first fixture uses public
   inputs. Private acquisition needs an explicit qualified credential mechanism later; a clean
   environment does not make same-UID native execution a credential-isolation boundary.
4. After all supervised build descendants stop successfully, collect only declared exports.
   Reject escaping paths/symlinks, special files, case/path collisions where relevant, undeclared
   additions, oversized files/trees and source mutation. Do not archive the whole task HOME,
   venv/cache, checkout or host filesystem. Normalize only documented metadata; preserve modes
   and symlink semantics that affect execution. Do not treat candidate stdout as a manifest.
5. Seal through a private staging directory, verified manifest and atomic rename/fsync into
   content-addressed storage. Never expose a partial tree as deployable. Pin objects before
   recording references. Lost replies and crashes at pre-dispatch, child launch, capture,
   rename and receipt commit need distinct recoverable states; uncertainty must not trigger
   another build. An unreferenced complete artifact is recoverable storage, not proof of a
   completed operation.

Done when controller/process failures, cancellation, low disk space, duplicate requests and
lost receipts cannot create partial artifacts, duplicate accepted builds or lost cleanup owners.

### Slice 3 — Python layout and host compatibility

1. Install dependencies into a newly prepared artifact-local layout from the recorded inputs.
   Do not copy a live venv and assume relocatability. Test imports, package data, entrypoints,
   scripts/shebangs, absolute build paths and runtime writes from the actual final layout.
   Build native extensions only for an explicitly identified compatible target; retain their
   source/distribution and compiler/build provenance, not an unqualified portability claim.
2. Define the launch environment from the artifact manifest and selected host runtime, with
   dependency lookup rooted in the artifact. Ignore development caches and undeclared
   toolingEnvironment dependency paths. Keep HOME/TMP/data/logs outside sealed outputs.
   Explicitly identify the interpreter, Android architecture/ABI and required system libraries;
   a version label or PATH entry alone is insufficient identity. Document which host facts
   are attested and which remain external assumptions for this adapter.
3. Recheck those requirements before validation/start/rollback. A host update that invalidates
   them is an incompatibility, not permission to rebuild/reinstall during restart. Preserve
   inspection, data and stop/remove paths. Specify the operator remedy when a pinned interpreter
   or library is no longer installed; rollback of application bytes cannot restore the OS.
4. Check independent builds with frozen inputs before promising identical output hashes.
   Report nondeterminism (embedded paths, timestamps or generated bytes) instead of weakening
   content checks. The first deliverable guarantees retained-byte reuse; reproducible rebuilding
   is a separate measured acceptance property of each recipe/adapter.

Done when the pure-Python case runs after development/build roots are deleted, hidden host
dependency fallback fails clearly, and incompatible native/runtime requirements are rejected.

### Slice 4 — artifact validation and release integration

Implemented in the unactivated checkout. Native checks use disposable copies, external writable
data, the adopted policy and stopped receipt proof. Service verification uses a separate loopback
port and the manifest entrypoint; packaged release/start/rollback recheck runtime and policy before
stopping the previous service. An isolated real runit/public-wheel rehearsal covers update,
reconnect, crash recovery and failed-switch restoration. See LOCAL_VALIDATION for exact scope;
this is not installed ChatGPT acceptance.

1. Validate the sealed artifact in its intended runtime layout using a separate writable test
   scratch/data area. Mandatory verification is selected by current adopted project/packaging
   policy, not a caller-supplied PASS field. Reuse the existing validation command where it
   can explicitly exercise the artifact; otherwise delegate an artifact-validation entrypoint
   once in project policy. Project-owned test scripts remain ordinary validated source, not
   authority to waive mandatory source/manifest/readiness checks. Settle this policy binding
   in slice 1 before accepting the first artifact; do not ship a recipe-defined bypass.
2. Verify packaged dependency use and a generated output, and for services exercise the actual entrypoint.
   Check content before/after, exit status and proved child termination. Artifact verification
   does not itself authorize switching a live target. A validation can be repeated against
   unchanged retained bytes after a compatible policy update, without rebuilding them.
3. Bind the artifact-validation receipt to artifact content, original source validation,
   adopted artifact-check policy and applicable runtime/launch requirements. Keep semantic artifact
   identity separate from deployment-instance release identity to avoid manifest/hash cycles.
   The existing HTTP release header continues to prove which deployment instance is serving.
4. Extend deployment manifests/runner checks to pin the artifact and its successful verification.
   Start/rollback use existing service ownership, revision CAS and durable switch recovery.
   Perform all artifact/runtime/policy checks before stopping a healthy previous deployment.
   A failed activation restores the previous desired artifact; an interrupted switch is
   reconciled from its retained intent. Do not rebuild to make rollback pass.
5. Check the supported state/bundle format at update/rollback admission. No migration framework
   merely to preserve an experimental wire name, but existing source deployments, user data and
   active artifact pins must never be silently discarded or read by an incompatible bundle.

Done when a verified source with a broken package cannot release, replacing packaged bytes or
runtime identity is detected, and failed/ambiguous activation restores or retains honest recovery
evidence without losing the prior artifact or application data.

### Slice 5 — retention, limits and cleanup

Implemented in the unactivated checkout: paged metadata usage, verified file-byte export,
prune preview/current-pin recheck, durable retirement with recoverable rename/delete and
preserved operation receipts. Global operator budgets reserve retained capacity for admitted
builds; output/input/file ceilings remain conservative. This is not a disk quota for the whole
installation: deployment release copies, native scratch and temporary sealing copies have
separate lifetimes and are excluded from retained-object usage. No automatic GC or path-based
delete/export is exposed. Old deployment release copies are retained; pruning their independent
history is not implied by pruning a build's retained object.

Track hard pins from active/previous deployments, in-flight verification and ambiguous switches;
pending builds preserve their own capture and capacity reservation without fencing unrelated
cleanup. Distinguish these from configurable retention of historical verification artifacts. Receipts remain
available after explicit artifact retirement and say when their payload has been pruned;
an old successful receipt cannot reactivate absent bytes. Task environment reset and
task/workspace close must not invalidate deployed packages.
Deployment remove preserves data by default and does not silently purge historical artifacts.
Provide bounded usage/list/inspection and an explicit prune preview; removal rechecks current
pins under the same admission discipline as a competing activation. Never follow an arbitrary
caller path. Use a recoverable tombstone/rename before deleting owned unreferenced storage.
An unknown effect remains pinned. Operator-controlled disk/file/output/deadline budgets must
account for dependencies and artifacts separately from the current small source-copy budget;
do not disable existing limits merely to accommodate builds. Native budgets remain sampled,
not hostile-process containment. Defer automatic GC until the explicit ownership path is proven.

### Slice 6 — qualification and delivery order

| Acceptance | Required evidence |
|---|---|
| Unit/contract | Manifest/path/identity checks, source vs artifact validation, current grants/policy, dedup/CAS, pins and bounded inspection; existing source-release tests remain green. |
| Native packaging | Locked dependency plus generated asset; cache poisoning/missing inputs fail; modifying/resetting the dev environment cannot change sealed bytes. |
| Non-service output | Archive/file artifact prepares, validates and exports with no HTTP port, foreground command, runit service or deployment target. |
| Android qualification, when selected | Pin JDK/Gradle/AGP, platform/build tools and any native-tool substitutions; build a minimal APK and AAB, verify signatures and final hashes with a disposable test key; distinguish build-only success from authorized device installation. No companion/root prerequisite; unsupported toolchain reports the actual gap. |
| Runtime separation | Start after task/build scratch removal, deliberate dependency shadowing rejected, host incompatibility reported, artifact writes rejected or moved to declared data. |
| Failure recovery | Interrupt acquisition/build/seal/receipt/switch/rollback/prune; observe original operations after reconnect; no hidden second build, orphaned live process or deleted pinned artifact. |
| Real isolated runit | Update between two dependency/output versions, matching live release identity, deliberate stop, crash recovery, rollback with registry unavailable, data-preserving removal. Network isolation is not inferred from a native offline test. |
| Client/installed path | Official SDK and affected client schemas, then authorized disposable installed acceptance; exact runtime bundle and artifact digests, health, logs, cleanup and source remote readback recorded. |
| User journey | New local project and a two-project workspace: develop, validate, package, release, reconnect, update/rollback and close. Record manual config/identifier interventions, tool calls, elapsed time and retained storage. |

Implement slices in order, with focused/affected tests then `scripts/check.sh` per meaningful
change. Expected component touchpoints are contracts/tools.schema.json and scoped config policy,
core admission/validation, store retention, native build supervision, deployment manifest/runtime,
and corresponding unit/real-runit rehearsals. Share concrete capture/hash/path checks where their
semantics match; do not create a universal artifact/connection framework just to remove duplication.
Update ARCHITECTURE semantics and contract types alongside implemented slices; keep unimplemented
claims out of README. Record actual acceptance and limitations in LOCAL_VALIDATION.

The review above resolves the sequencing question. Continue at slice 6, using the implemented
recipe/identity, retained-build, validation and deployment boundaries. The pure-Python path has
real selected-distribution build/relocation and isolated runit evidence; installed artifact validation/release and
broader dependency/native-extension qualification remain outstanding.
Product minor/major version changes still need user authority.

## Minimum semantic continuity implementation and qualification

Implement only ARCHITECTURE's optional workspace resume note first. Existing source tasks,
execution, validation, publication and deployment keep their semantics. Do not add a full
transcript/event store or new thread/planner owner to make the test easier.

1. Add bounded note actions, principal/workspace/reference checks, isolated lazy sidecar access,
   revision CAS and bounded replay/retention. Missing metadata is the normal supported path.
   Add only implemented fields to the public contract; no speculative conversation/adapter types.
2. Add candidate discovery and selected-note retrieval, with separately identified current
   material observations. Preserve unavailable/unknown/reconciliation-needed states. Ordinary
   development calls must not open the sidecar or wait for its locks. No automatic provider or
   service recovery as a side effect of reading a note.
3. Teach hosts through concise tool descriptions/usage to remember at meaningful boundaries and
   resume on continuation. Qualification uses actual new ChatGPT conversations as well as client
   fixtures; MCP cannot guarantee host invocation, capture unsubmitted meaning or control host
   compaction. No user-pasted internal IDs or handoff essay as the standard path.
4. Measure against the existing document/task/operation baseline. Stop expanding the feature if
   it does not materially reduce recovery work. Consider bounded semantic events only after
   concrete examples show the current note/history bounds lose useful meaning. Optional external
   session provenance and ChatGPT metadata routing each need independent evidence of value.

| Test matrix | Required result / measurement |
|---|---|
| Semantic recovery | Seed a changed objective, rejected alternative, blocker and pending useful action; fresh model finds relevant meaning, verifies referenced current state and advances correctly. |
| Material reconciliation | Advance Git, complete an operation after its response is lost, revoke policy, stop/change a deployment and retire referenced payloads; stale prose never causes replay, false PASS or unauthorized effect. |
| Concurrency/replay | Two conversations replace one note; stale writer cannot erase newer content. Lost reply replays while retained; deleted/expired receipts and reused request IDs cannot resurrect or overwrite another note. |
| Discovery | One clear candidate and several ambiguous objectives; one conversation/many notes and many conversations/one note; no hard attach, cross-principal leak or reliance on user-supplied handles. |
| Complete isolation | Disabled, missing, deleted, corrupt, locked, full and incompatible sidecar; failed compaction, expired note and refused semantic sync; existing tools/cleanup/replay remain usable with their original security checks. Exercise real effects in disposable fixtures, not just success-shaped mocks. |
| Client independence | No metadata, forged/changed session IDs, Local Codex and another MCP client; absent provenance neither blocks development nor expands scope. Direct ChatGPT proof is separate from scripted HTTP/SDK tests. |
| Bounds/privacy | Oversized text/ref/candidate lists, sensitive-input rejection, history retention, explicit forget and revoked project references; no raw transcript/stdout/secret export or unbounded model context. |
| Non-mutating resume | Pending deployment recovery remains pending until its normal effect/reconciliation path is invoked; reading a capsule never stops/starts a service or refreshes a source pointer. |
| Journey | One project and a two-project objective, reconnect mid-build/release, close tasks, resume in a new conversation, finish/cleanup with notes unavailable as well as available. |

Use the same fixed cut points/prompts and current material states for baseline and note-enabled
runs; repeat to expose model variance. Count tool calls to first **correct useful action**, elapsed
time, user handoff/config/ID interventions, repeated completed work, stale-assumption failures,
model-visible tokens (including update/rebind costs), response bytes and retained storage.
Initial targets, not measured claims: no user-copied IDs or handoff essay for an unambiguous
workspace; at most three discovery/resume/observation calls before useful action in the bounded
fixture; at least 30% lower median resume-context tokens than full reconstruction; zero unintended
replays/permission expansion. Report absolute costs and failed cases, not just reduction ratios.
Do not claim a reduction against full transcript injection if the real baseline already uses
bounded repository docs. No extra semantic call per ordinary tool operation; core-disabled
regression runs must retain prior results. If targets fail, simplify/revise before adding events.

A redacted current-host metadata experiment, if later selected, records field presence/type/
length and principal-scoped digest only. Compare repeated calls and a second actual conversation;
record transport identity separately. Do not read credentials, log raw requests or treat a
scripted `openai/session` value as host evidence. It does not block note-only delivery.
