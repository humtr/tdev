# tdev

Intelligence leads development; tdev supplies the foundation for using and composing tools,
projects and execution environments. ChatGPT chooses strategy and tools within the user's
delegated authority. **Android + Termux is the default development and operating environment**,
not just a controller for another machine.

The first development goal is complete Git/local development, validation and deployment:
create/connect projects → inspect/edit/debug → test → build/package → commit/integrate/publish → deploy →
verify live behaviour → recover and clean up. A successful Git push is not deployment.
Build outputs include binaries, web/service artifacts, archives and Android APK/AAB packages;
building, signing and verifying an Android app must not depend on Android UI automation.
Routine work should not require the user to manage internal IDs, HEAD OIDs, branch grants or
private config files by hand. Long-running processes and reconnects must preserve usable progress.

The longer-term goal includes external MCP services (such as Blender), Android device control
and computer use, CLI/API tools, local/remote/container runtimes and optional decision models.
Jev is an example of a replaceable tool, not a dependency or mandatory decision gate. Build
extension boundaries now, then qualify concrete integrations when needed; do not delay the
complete coding path to build a speculative universal framework. These are product goals,
not claims that these integrations or the full deployment path already exist.

## Version policy

The current product line is **0.1**, pre-release. The agent may choose patch-level and lower
pre-release/build revisions within this line when warranted. Raising the minor or major
version requires the user's explicit authorization; no product or public-contract v1 (or
later major version) may be declared without it. Documentation changes need no automatic bump.

The executable version has one source: `src/tdev/__init__.py`; consumers must derive it
there rather than scatter version literals through code, contracts or tool names. Internal
storage/format revisions and external protocol versions are independent of product maturity.
No production release has been made. Pre-release redesign does not require compatibility
aliases or migration machinery solely for experimental interfaces; actual user files,
credentials and in-flight effects still require deliberate handling.

## Implementation status

Twelve MCP tools separate composition (`tdev_workspace`), source tasks (`tdev_task`), projects
(`tdev_project`), source read/edit, execution, general operation observation/control
(`tdev_operation`), validation, publication, project deployment (`tdev_deploy`) and artifact
recipe inspection and retained builds (`tdev_artifact`), plus runtime diagnostics
(`tdev_diagnostics`). Git holds
checkpoints; SQLite holds workspace composition, source tasks, enrolled projects and accepted operations. These interfaces replace
the experimental source-workspace/process names without aliases.

Core HTTP MCP is pinned to **2026-07-28**. Local Codex has an explicitly selected legacy stdio
adapter; it does not downgrade core HTTP. Commands/tests run natively on Termux by default.
Explicit remote execution remains optional and never silently falls back to native. No SSH
host, VPS, OCI, root, systemd or Docker prerequisite is imposed on local development.

Native execution carries ordinary Termux app-UID authority. Source copies, private HOME,
clean environment and API grants are useful safeguards, not hostile-code or credential
isolation. See the [trust boundary](ARCHITECTURE.md#3-native-trust-and-containment).

## Current work

Source **0.1.18** changes modern HTTP response shaping after real ChatGPT host acceptance reproduced a transport-only stall on the 0.1.17 comment-only SSE path. The resident wrote and flushed HTTP 200 SSE headers, four keepalive comments, the terminal JSON-RPC response and stream close within about 3.4 seconds, while the ChatGPT tool call did not return to the assistant. Positive bounded waits now follow an auto profile: when the request includes `_meta.progressToken`, tdev uses request-scoped SSE with standard `notifications/progress`; without a progress token, the same bounded observation returns one `application/json` response and does not force a comment-only stream. Operation admission, durable identity, wait duration, disconnect semantics on the streamed path and replay rules are unchanged. Server write completion still does not prove Tunnel receipt or visible UI delivery.

Source **0.1.17** directly measures the long-running MCP delivery boundary and adds
2026-07-28 request-scoped SSE only for explicit positive waits on command `tdev_exec`,
source `tdev_validate`, and `tdev_operation status`. The pre-change 0.1.16 profile was
measured as a silent open HTTP request until terminal completion followed by one complete
JSON response; it sent no intermediate response headers or bytes. The new path records
request/JSON-RPC identity, dispatch, durable admission, response media type, each SSE
chunk and flush, terminal observation, final response and close/write-failure boundary
without logging bearer tokens or request bodies. Standard `notifications/progress` is sent
only when the client supplies `_meta.progressToken`; otherwise SSE comments are keepalives.
`waitMs` omission/zero, process/staged-stdin behavior, durable operation identity, requestId
replay and publication semantics are unchanged. Server-side writes remain distinct from
Tunnel/network receipt and user-visible ChatGPT rendering.

Installed native packaging acceptance now passes on resident **0.1.14** through authenticated
local HTTP: pinned public dependency, generated asset, source/build/validation scratch retirement,
dependency-environment removal, artifact verification, live release, update/rollback, failed-switch
restoration, data-preserving stop/start/remove, paged export/hash checks and explicit pruning.
A non-service ZIP also builds/verifies/exports without a health port or deployment. The owned
trial service is removed, trial task environments/refs are retired, and no pending effects remain;
data, project registration, historical releases and evidence are intentionally retained.
See [installed evidence](LOCAL_VALIDATION.md#installed-packaging-lifecycle-acceptance--2026-09-27).
Real ChatGPT one-/two-project journey and visible continuity remain outstanding; the
[baseline execution guide](examples/chatgpt/JOURNEY.md) is prepared for the actual host.
Source **0.1.15** fixes the observed CLI credential-selection gap: `--connection NAME` uses
that registered connection's local credential for MCP calls. If connector.secret is missing,
terminal users can select a connection by number; automation receives an actionable error.
No credential is silently chosen, recreated or rotated, and failed calls are never retried with
another credential. Focused **25**, affected **27**, and full **307 tests** pass;
installed read-only CLI calls also pass. The resident remains 0.1.14.

Source **0.1.14** groups the local CLI into numbered terminal menus. Enter `tdev`,
`tdev connection`, `tdev diagnostics`, `tdev work` or `tdev maintenance`; connection actions
also offer a registered-connection picker. Direct commands remain available for automation,
and non-terminal category calls show usage without prompting. See the
[CLI guide](OPERATIONS.md#local-cli-and-multiple-tunnel-connections).
CLI-focused **18 tests**, affected **41 tests**, and full **300 tests** pass.
The source-backed command shortcut uses the new menus without a resident restart.
During menu implementation the resident reported **0.1.13**. The subsequent 2026-09-27 read-only
review reports **0.1.14 / up**, with `default` (bearer) and `tdev_janmori` (no-auth) both locally
healthy. This observation does not establish real cross-workspace or packaged-release acceptance;
no runtime/config change was performed during the roadmap review.

Source **0.1.13** adds the local `tdev` CLI and installation-owned multiple Tunnel connections.
Run `./tdev` for the menu or `./tdev link` to install the command shortcut. Connection-specific
Bearer/no-auth mode, token copying/rotation, independent lifecycle and controller-only setup
preserve the existing owner/task model and legacy clients. See the
[CLI guide](OPERATIONS.md#local-cli-and-multiple-tunnel-connections).
All **291 tests**, pinned-client forwarding, official MCP SDK and isolated rehearsals pass.
At that qualification point the CLI shortcut was installed and the resident remained **0.1.11 / watch**.
Real multi-workspace ChatGPT acceptance remains outstanding.


Source **0.1.12** adds interactive fresh installation and internal local authentication for
Tunnel-authorized callers without a host Bearer field. Complete CLI/profile installs remain
noninteractive; existing residents preserve their exact auth mode/credentials. First-install
interruption is retryable without secret rotation. See [installation](OPERATIONS.md#resident-installation-and-deployment)
and [qualification](LOCAL_VALIDATION.md#interactive-installation-and-tunnel-local-authentication--2026-09-27).
All 267 tests, pinned-client forwarding, official MCP SDK and isolated rehearsals pass.
Real ChatGPT no-custom-credential acceptance was not established by that qualification; its resident was 0.1.11.

Source **0.1.11** fixes ordinary native execution dropping the operator working-storage budget.
New command/process/source-validation payloads retain `artifactLimits.workingBytes`, so both
child file-size and working-storage checks honor the configured value. Existing operations keep
their accepted limits; source capture/transfer limits remain separate. The owned resident now runs
**0.1.11 / watch** with its existing 512 MiB setting. All 252 tests and inactive rehearsal pass;
the installed bundle successfully copied a 173,101,495-byte fixture through a symlink to a regular
file. Config, incidents and the uninterrupted observer are preserved. See
[qualification and installed acceptance](LOCAL_VALIDATION.md#native-working-budget-propagation--2026-09-26).

An optional [ChatGPT caller adapter](examples/chatgpt/CONTROLLER.md) now supplies bounded physical
cells with total-attempt accounting, sparse witness reservation and explicit reconciliation on
lost tool replies. It is source for the assistant's cells, not a resident-installed host hook.
Real ChatGPT rollover/visible-continuity acceptance remains open; server limits are unchanged.
The preceding **0.1.10** added compact caller guidance in operation-tool discovery and bounded
local observer frontiers with historical baselines, generation/coverage counters and per-run
witnesses. The continuous observer command is now maintained at `scripts/tdev-observe`.
The separate continuous observer remains on revision 2. That release passed all 248 tests,
official SDK, inactive bundle and installed checks, preserving config, seven prior
incidents and existing observation evidence. See
[installed acceptance](LOCAL_VALIDATION.md#resident-caller-guidance-and-observer-installed-acceptance--2026-09-26);
actual ChatGPT scheduling and visible-progress acceptance remain open.

The preceding **0.1.9** release added optional caller execution witnesses to the diagnostic owner and isolated
malformed diagnostic metadata from ordinary response delivery. `mark` correlates caller code points
with server HTTP requests when response metadata is exposed; it cannot attest ChatGPT internals
or visible progress. Source qualification is recorded in
[LOCAL_VALIDATION.md](LOCAL_VALIDATION.md#caller-execution-witness--2026-09-26).
The earlier 0.1.9 resident acceptance enabled watch. Normal status reconciliation cleared
the completed validation that initially blocked installation. Installed bundle/config/incident
preservation and independent observer checks pass; real ChatGPT witness/visible-liveness
acceptance remains open. See the
[installed acceptance](LOCAL_VALIDATION.md#caller-witness-installed-acceptance--2026-09-26).

Optional lifecycle diagnostics now support watch-triggered capture, automatic expiry, bounded
local evidence and principal-scoped alerts through `tdev_diagnostics`. New installations default
to off; the diagnostic operating configuration selects watch. Operators may activate a bounded
trace, inspect incidents and acknowledge receipt without changing development work. Alerts are
offered in subsequent tool responses; they cannot wake a stopped ChatGPT turn or prove UI delivery.
The earlier 0.1.7 authenticated
ChatGPT connector acceptance covered activation, alert receipt/acknowledgment and expiry.
The 0.1.8 installed checks confirmed source/bundle identity, unchanged config and preservation of
all five prior incidents and acknowledgments. The 0.1.9 source passed **234 tests**,
official SDK and staged direct MCP/Codex Bridge witness checks. Fresh ChatGPT witness and
visible-liveness qualification remain open. The diagnostic implementation bounds and fairly selects alert retries, aggregates
server-observed errors separately from client reports, and supports compact diagnostic summaries.
`tdev_diagnostics report` records a classified caller observation without raw messages or output.
A separately launched local observer records bounded snapshots and socket/process unavailability.
Qualification/installation results are recorded in
[LOCAL_VALIDATION.md](LOCAL_VALIDATION.md#bounded-alerts-error-aggregation-and-independent-observation--2026-09-25); these additions do not
establish ChatGPT visible continuity. The next host investigation correlates server evidence,
host/cell return and actual user-visible progress, then qualifies report/Stop/resume separately.
See the
[follow-up review](LOCAL_VALIDATION.md#post-chatgpt-independent-review--2026-09-25).
See [operator usage](OPERATIONS.md#capture-lifecycle-diagnostics) and the
[diagnostic boundary](ARCHITECTURE.md#local-lifecycle-diagnostics).

Packaging recipe inspection and retained native builds are implemented in this checkout.
`tdev_artifact prepare` builds a successful source validation's frozen candidate with pinned
public HTTPS inputs, a fresh environment and declared exports. `list` exposes outstanding
builds; `inspect` rechecks retained bytes. Existing operation controls provide logs, cancellation
and scratch cleanup without deleting retained artifacts. Source edits/close can proceed during
builds. A pure-Python reference package now runs after relocation and removal of development/build
roots. Service inspection checks declared host runtime compatibility separately from retained bytes.
Artifact validation now runs the adopted check against retained bytes; service checks exercise
the actual entrypoint and release identity before packaged deployment. Packaged services reuse
the existing update/rollback/recovery path after build scratch and source tasks are retired.
Bounded file export, explicit prune with deployment/in-flight protection, paged storage usage
and operator-controlled packaging budgets are now implemented. Historical operation receipts
survive pruning; automatic GC is not enabled. See the
[Python example](examples/python-package/README.md), [verification/release usage](OPERATIONS.md#validate-and-deploy-a-retained-artifact)
and [export/prune usage](OPERATIONS.md#export-inspect-usage-and-prune-retained-artifacts).
The retention slice passed all **186 tests**, official MCP SDK and inactive-bundle checks.
A real isolated runit rehearsal covers packaged activation, failure recovery and export/prune;
exact results are recorded in [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md#artifact-retention-bounded-export-and-pruning--2026-09-22).
Installed local-HTTP artifact build/validate/release acceptance now passes; the actual ChatGPT
journey remains outstanding. See
[recipe/build usage](OPERATIONS.md#inspect-a-packaging-recipe).

Artifact production remains separate from service activation. The continuity review selects
optional workspace resume notes
and fresh material-state observations, not a transcript store or another workflow hierarchy.
These notes, source-task-independent host access and Android control are **not implemented**.
Existing task/operation recovery is implemented; automatic semantic recovery across ChatGPT
conversations is not. See the [design](ARCHITECTURE.md#optional-semantic-continuity),
[delivery order](IMPLEMENTATION_PLAN.md#current-priority-after-the-continuity-review) and
[review evidence](LOCAL_VALIDATION.md#continuity-and-android-feasibility-review--2026-09-22).

Native project deployment is implemented for delegated Termux HTTP services. `tdev_deploy`
releases an exact validated source candidate, verifies process and HTTP release identity, and
supports inspection/logs, start/stop, update, rollback and data-preserving removal. Interrupted
switches retain recovery evidence. See [deployment usage](OPERATIONS.md#deploy-a-validated-project-on-termux).
The installed adapter supports source releases and retained dependencies/build outputs; the latter
now has installed local-HTTP acceptance, separate from actual ChatGPT journey acceptance. Remote/container deployment and public ingress remain future work.
See [deployment evidence](LOCAL_VALIDATION.md#native-project-deployment--2026-09-21).
The owned installation runs this adapter; installed MCP acceptance passed the full 140-test
suite, live release identity, stop/restart and removal. The `owner` principal has the delegated
Termux target, so routine project-service deployment needs no per-service config edits.

Persistent task dependencies and development processes are implemented in the **0.1** line.
Native exec/validation reuse task-owned dependency/cache storage while keeping source and HOME
separate per operation. `exec mode=process` runs a foreground server/debugger on a fixed source
snapshot without blocking edits; existing operation status/stdin/cancel/retire controls survive
controller reconnect. Task inspect exposes outstanding processes independently of history pages.
Explicit resetEnvironment cleans dependencies after executions stop, including after task close.
The owned resident installation has been updated and its authenticated MCP path qualified;
verification tasks/processes/dependency storage were cleaned up.
See [usage and limits](OPERATIONS.md#persistent-dependencies-and-development-processes).

Resident installation is implemented. `bash install.sh` now prepares a verified bundle,
registers owned `tdev` and `tdev-tunnel` services in Termux's shared runit graph, updates them
with failure recovery, and verifies controller identity plus Tunnel control-plane health.
`--check`, `--rollback`, `--recover` and `--uninstall` are available. Existing credentials,
project grants and state remain in the selected private installation. No manual Tunnel/server
startup is needed while termux-services is running. See [installation](OPERATIONS.md#resident-installation-and-deployment).


Local checkout import and task integration are implemented. Explicit localChanges on task
start captures working edits while preserving the original files/index/HEAD. Same-project tasks
can integrate independent text changes, inspect conflicts and resolve them atomically; the
source task remains intact and publication requires validation of the resulting target.
Source reads default to the current checkpoint and support paged patch/stat/name comparisons.
See [import and integration usage](OPERATIONS.md#import-existing-local-edits-and-integrate-tasks).

Workspace/source-task separation is implemented. Empty or multi-project spaces support
create/list/inspect/attach/detach/configure/close, revision CAS and durable replay. Starting a
source task without workspaceId automatically uses a default space; an explicit space resolves
its own project defaults. A project can participate in multiple spaces with independent source
checkpoints. Busy-task completion is observed during bounded workspace inspection. Composition
never grants project permissions, and close/detach never delete owned refs or process resources.

Delegated local/GitHub project connect/create, automatic source-base/managed-branch selection,
exact validation/publication and owned branch cleanup remain available through the renamed
source-task API. `tdev_edit` modifies source; `tdev_task` manages its lifecycle. `tdev_operation`
observes all accepted effects; process controls apply to exec/validation/build operations.
See [usage](OPERATIONS.md#workspace-composition-and-source-tasks).

Historical deployment qualification: **140 deterministic tests passed**. Coverage included native deployment authority,
exact source/readiness identity, failure recovery, dependencies, development processes and
workspace composition. Official MCP SDK and installed Local Codex checks pass with the same
then-current ten-tool surface. The current diagnostic release has a twelve-tool surface and
separate qualification above. A real isolated runit graph also passed project-service crash recovery,
update/rollback and removal. Exact results and installed acceptance are recorded in
[LOCAL_VALIDATION.md](LOCAL_VALIDATION.md#native-project-deployment--2026-09-21).

Source-only state remains schema 3; this artifact-retention implementation accepts schema 3/4/5
and advances artifact admissions to schema 5 without discarding source/task/deployment records.
Bundles that do not support schema 5
cannot subsequently activate against it. This is an internal storage revision, not a product version.
That initial resident qualification used schema-3 state; rebind the live store before migration or rollback. The
installation runs through owned runit services on localhost:8765, with the same Tunnel
identity, credentials and project enrollments. The old manual runtime and experimental tdev
service/helper/agent registrations have been retired from the live graph. Historical private
state and retired service files remain outside that graph. The accumulated implementation is
now delivered on the canonical tdev branch under the user-authorized 0.1 pre-release line;
this resident installation is not a product v1 release.
See [resident evidence](LOCAL_VALIDATION.md#resident-service-installation--2026-09-21).

Installed packaging delivery and lifecycle qualification is recorded in Current work above.
The next milestone is the baseline one-/two-project ChatGPT development/deployment journey,
with explicit CLI credential selection available for local reference checks. Measure remaining
friction before adding optional resume notes; broader package targets and concrete resource
adapters follow. Visible-liveness observation accompanies useful work rather than replacing it.
See the single [ordered roadmap](IMPLEMENTATION_PLAN.md#next-implementation-sequence).
Persistent task dependencies and snapshot processes cover the initial native path;
hot reload, PTY debugging and cross-task environment sharing are not implemented.
The native project-service adapter is separate from installation of tdev itself. Blender/MCP/device/
computer-use/model connections remain future integrations. See
[implementation order](IMPLEMENTATION_PLAN.md#next-implementation-sequence).

Earlier project-management evidence includes 81 deterministic tests, actual GitHub managed-ref
publication/readback/cleanup and an unchanged canonical HEAD. It used the earlier eight-tool
contract. Earlier native SDK/client and inactive packaged crash-recovery evidence, with their
exact tested scope, are retained in [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md). New composition
qualification is recorded there separately; do not infer live rollout from local tests.

Run deterministic checks with `sh scripts/check.sh` after
`python -m pip install --target .tdev-deps -r requirements.txt`.
The caller-adapter tests also require Node.js with `node --test` support; the tdev runtime
and the pasted Code Mode helper do not depend on Node.js.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
