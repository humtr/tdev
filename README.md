# tdev

Intelligence leads development; tdev supplies the foundation for using and composing tools,
projects and execution environments. ChatGPT chooses strategy and tools within the user's
delegated authority. **Android + Termux is the default development and operating environment**,
not just a controller for another machine.

## 처음 설치하기

새 Termux 터미널에서 아래 두 방법 중 하나를 선택합니다. Python/Git 사전 설치는
필요하지 않습니다. `curl: command not found`가 나오면 `pkg install -y curl`을 한 번
실행하고 재시도합니다.

### 간편 설치

다운로드한 설치 진입점을 바로 실행합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/humtr/tdev/setup/i | bash
```

### 내용을 확인한 뒤 설치 — 더 안전한 방법

본 설치기를 임시 파일로 모두 내려받은 뒤 내용을 표시합니다. 이 단계에서는 설치기를
실행하지 않습니다. 다운로드가 성공해야 실행용 파일 이름으로 바꾸므로, 실패한 다운로드의
일부 내용이 다음 단계에서 실행되는 것을 방지합니다.

```bash
tdev_setup_dir=$(mktemp -d) &&
curl -fSL --proto '=https' https://raw.githubusercontent.com/humtr/tdev/install/termux-bootstrap/bootstrap.sh -o "$tdev_setup_dir/bootstrap.part" &&
mv "$tdev_setup_dir/bootstrap.part" "$tdev_setup_dir/bootstrap.sh" &&
cat "$tdev_setup_dir/bootstrap.sh"
```

오류 없이 다운로드가 끝나고 내용을 확인했다면, 같은 터미널에서 직접 실행합니다.

```bash
bash "$tdev_setup_dir/bootstrap.sh" --ref install/termux-bootstrap
```

이 방법도 실행 후에는 설치 브랜치의 소스와 외부 패키지를 내려받습니다. 파일을 먼저
확인할 기회를 제공하는 방식이며, 코드 신뢰성이나 의존성 안전성을 보증하지는 않습니다.

### 설치 후 안내

필요한 Termux 패키지와 서비스를 준비한 뒤 Tunnel ID와 런타임 키를 입력받습니다.
키는 화면에 표시하지 않습니다. Tunnel은 미리 준비해야 하며, 설치 후 프로젝트 접근
범위는 사용자가 지정합니다. [처음 설치·연결·첫 프로젝트 안내](INSTALL.md)를 따라가세요.
이 명령은 공개된 설치 브랜치의 코드를 실행합니다. 이전 작업 데이터 복원 명령은 아닙니다.

## Product purpose

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

The product version has one source: `Cargo.toml` package metadata. Build outputs and the
reference executable derive it there; inactive reference bundles include this input. Internal
storage/format revisions and external protocol versions are independent of product maturity.
No production release has been made. Pre-release redesign does not require compatibility
aliases or migration machinery solely for experimental interfaces; actual user files,
credentials and in-flight effects still require deliberate handling.

## Implementation status

Thirteen MCP tools include human-name continuation lookup (`tdev_find`) and separate composition (`tdev_workspace`), source tasks (`tdev_task`), projects
(`tdev_project`), source read/edit, execution, general operation observation/control
(`tdev_operation`), validation, publication, project deployment (`tdev_deploy`) and artifact
recipe inspection and retained builds (`tdev_artifact`), plus runtime diagnostics
(`tdev_diagnostics`). Git holds
checkpoints; SQLite holds workspace composition, source tasks, enrolled projects and accepted operations. These interfaces replace
the experimental source-workspace/process names without aliases.

Core HTTP MCP is pinned to **2026-07-28**. Local Codex has an explicitly selected legacy stdio
adapter; it does not downgrade core HTTP. Commands/tests in the public coding surface run natively on Termux. The authored SSH/rootless-Podman
backend is retained dormant for possible later qualification and is not advertised as a caller-selectable
execution/network mode. No SSH host, VPS, OCI, root, systemd or Docker prerequisite is imposed on development.

Native execution carries ordinary Termux app-UID authority. Source copies, private HOME,
clean environment and API grants are useful safeguards, not hostile-code or credential
isolation. See the [trust boundary](ARCHITECTURE.md#3-native-trust-and-containment).

## Current work

The selected work is to redesign and implement the tdev runtime in Rust, starting with
implementation-independent acceptance boundaries. The existing product architecture remains
the semantic foundation; this is not a line-by-line translation or a second product variant.
The implementation structure is specified in [ARCHITECTURE §10](ARCHITECTURE.md#10-implementation-structure),
and the single delivery sequence is in [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md#next-implementation-sequence).
[IMPLEMENTER_REFERENCE](IMPLEMENTER_REFERENCE.md) maps existing evidence to that work.

Implementation progress: the baseline is committed and published, including the existing install/observer
changes and the latest thirteen-tool contract. `tests/acceptance/` now launches a separate server
with disposable Git/config/state, tests real HTTP and process restart, and records action-level
evidence and fixed identity vectors. These tests contain no domain implementation imports.
The Rust package now builds on Termux and implements validated types, exact identity encoding,
SQLite ownership/admission/completion primitives, private local Git source construction and
compiled Schema 2020-12 input/output/config validators. Git uses bounded native utilities,
SHA-1/SHA-256 stores and private indices; real fixtures cover atomic batch failure, concurrent
opening/editing, unchanged capture and dirty-checkout preservation. Contract checks are compared
with an independent validator across all thirteen described tool families; this does not
advertise those families as implemented handlers. Its command currently exposes version/help;
it is not a serving runtime yet. The Python executable remains the behavioral reference.
No state format revision or resident cutover has been performed. P2 is in progress: authenticated
HTTP, current-authority snapshots and the source/workspace/project vertical slice are next.
Raw wire numeric materialization, typed conversion and Unicode/depth policy still need edge
qualification; successful materialized Schema validation alone does not qualify HTTP decoding.
Remaining fault,
artifact/deployment/operator and host qualification belongs to the corresponding P3–P6 gates;
the initial common tests are not a complete parity claim. The prior product qualification backlog
remains relevant acceptance scope; it does not compete with the selected implementation order.
No resident replacement or provider change is implied. Product naming stays `tdev`; successful
integration replaces the implementation rather than shipping a language-specific edition.

Latest recorded live qualification is **0.1.25**, bundle
`f1d10cf548ff2cbc1169db2ab239b3c772a0b8264e61ad8b31bffad777877ee7`.
Qualified source commit `983f4559ac1f79526cd8bd59558ed496d67773e9` is published on
`refs/heads/tdev`. Both existing connections are healthy/running after the owned recoverable
update. Existing state/config/credentials/profiles and the historical unknown publication
were unchanged in that qualification. The Termux `tdev` shortcut was bound to the qualified
checkout. The local install/observer changes have since been included in the published source
baseline; this implementation work has not performed another live update.

Source **0.1.25** repairs the Host/exact-operation boundary: no-op command capture retains
its source checkpoint; late dispatch failures cannot overwrite a terminal result; a new source
mutation reconciles only its busy predecessor before checking fresh CAS. Repository/project
policy can supply `validationTimeoutSeconds`, with explicit request override, frozen admission
budget/origin and project readback. The caller adapter supplies a pure outcome classifier and
documents one default monitor wait per physical cell. Goal continuation stays Host-owned;
terminal operations never resume or rerun automatically. Fixed host hints are unchanged.
Focused **15**, affected **78**, and full **346 tests** pass; see the
[boundary qualification](LOCAL_VALIDATION.md#hostexact-operation-boundary-repair--2026-10-01).
Inactive bundle and real isolated runit rehearsals passed. Installed localhost MCP confirmed
13 typed tools/fixed hints, human-name lookup, no-op capture, durable nonzero failure despite
successful RPC, and frozen source-validation budget/result readback. The owned acceptance
task is closed/cleaned; its receipts remain discoverable. The subsequent authorized operator
configuration sets **tdev source validation to 1800 seconds**; other project policies retain
300-second fallback. Caller timeout remains an explicit per-attempt override. Config hot readback
and a new timeout-omitted admission confirm `1800 / repository` without restarting services.
That installed source validation completed **346 tests in 834.517s**, succeeded with exit0
and no timeout; its task/scratch is closed/cleaned with the receipt retained.
The supplied fresh ChatGPT Host run consumed exit-7 correctly and observed one ~420-second
command through terminal in the same turn, crossing ~287/~326-second cells with 39 witnesses.
Resident receipts/cleanup and the live 39-witness/1-run summary corroborate the report. The
previous stall/history rollback did not reproduce in that run; permanent UI persistence and
causal resolution remain unproved. See the [installed closeout](LOCAL_VALIDATION.md#0125-resident-activation-and-live-readback--2026-10-01)
and [budget/Host follow-up](LOCAL_VALIDATION.md#repository-budget-and-fresh-host-follow-up--2026-10-02).

The reported ChatGPT run recovered the completed source work in **3 read calls**
using only project name and label, with **0 user-supplied internal IDs** and no new effects.
Project-only lookup remained ambiguous; label filtering selected the closed published predecessor,
and task inspection confirmed the exact validation/publication commit. Installed state independently
matched. This confirms bounded material rediscovery. The user's subsequent report of a visible
stall around 18:30 KST, followed by a new turn, leaves host continuity unresolved; a new turn
alone does not establish a fresh conversation. The complete two-project workload remains separate. See
[the actual host report](LOCAL_VALIDATION.md#actual-fresh-chatgpt-material-recovery-report--2026-09-30).

Source **0.1.24** completes the same human-name rule in newly accepted project create/connect
responses. Previously retained receipts keep their original bytes, including old path-valued names;
current listing/discovery is a separate projection. Focused **8**, affected **33** and full **332 tests** plus inactive bundle qualification pass.
Final activation/readback are recorded in the takeover review. The thirteen-tool input surface and fixed host hints are unchanged.

Source **0.1.23** fixes a measured human-name continuation gap: delegated local projects now
show their enrolled checkout relative to the current policy root, so `tdev_find` can resolve
`pkg-chatgpt-20260930-a1` directly. Old exact remote locators still work. It does not rewrite
project/effect receipts, reconcile on discovery, select ambiguous work or change tool inputs/hints.
Focused **7**, affected **33**, full **332 tests**, inactive bundle and actual Codex schema-loader
checks pass. The takeover also completed the handed-off service/artifact lifecycle through
authenticated local MCP, with fresh data preservation, supervisor crash recovery, failed-switch
restoration, export and explicit pruning. This is independent backend acceptance, not a new
ChatGPT/UI measurement. Resident activation is recorded separately below. See
[the takeover review](LOCAL_VALIDATION.md#installed-handoff-review-and-human-name-recovery--2026-09-30).

Source **0.1.22** implements the selected thirteen-tool surface after root/flat/nested/action/
workflow comparisons. Exact positive request alternatives replace eight duplicated flat discovery
schemas. `tdev_find` resolves human-name source continuation from retained intents and receipts,
without replaying effects or choosing an ambiguous/truncated result. Deployment release now
requires explicit create/update revision intent. Finite command and persistent process use
mode-specific branches, rejecting ineffective process wait/capture choices. Tool descriptions are shorter; fixed host hints,
including `readOnlyHint=true`, remain unchanged.

Fresh ChatGPT input probes preserve find fields, task-start alternatives, mandatory deployment
revision and command/process branches. Missing revision and process wait/capture inputs are rejected. Actual Codex and official MCP SDK checks exercise the new
input envelope. Final full validation passes **331 tests**, alongside the actual Codex journey,
pinned MCP SDK and inactive bundle rehearsal. Final command/process ChatGPT typing and both
negative controls also pass their reported checks; no actual process runs in that probe.

The qualified source was canonically published at `593d57a65d76c90f49cdf999d603e1c53a986477` and bundle
`ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33` was activated as resident **0.1.22** at that qualification.
The owned recoverable update preserved the exact historical unknown publication receipt and both configured connections.
After the user refreshed the ChatGPT connector, the actual injected catalog exposed all thirteen tools with the required
`request` envelope. Live `tdev_project` list and `tdev_find` calls succeeded, while missing deployment revision and
process `waitMs`/`capturePaths` controls were rejected by the host schema before dispatch. This establishes installed
surface acceptance; the complete ChatGPT development/deploy/reconnect journey remains a separate acceptance target.
See [the dated review](LOCAL_VALIDATION.md#surface-redesign-review--2026-09-30),
[the activation record](LOCAL_VALIDATION.md#n-authorized-canonical-publication-and-resident-activation--2026-09-30), and
[reproducible probe](examples/surface-probe/README.md).

Source **0.1.21** makes every remaining root-composed MCP tool host-friendly for ChatGPT discovery. The strict canonical root unions remain the runtime validators, while `tdev_workspace`, `tdev_task`, `tdev_validate`, `tdev_project`, `tdev_deploy`, `tdev_artifact` and `tdev_diagnostics` advertise typed root objects whose fields are the union vocabulary of their canonical arms. Nested composition inside fields remains intact (including `tdev_task.resolutions`), so only the tool-input root avoids a composition-only schema. Runtime action requirements and replay semantics are unchanged. Connector acceptance checks the actual host-visible declaration in a fresh ChatGPT session after Refresh because an already-open conversation may retain its previously injected tool catalog.

Source **0.1.20** adds a narrow resident-maintenance escape hatch for one exact historical managed-branch publication whose provider outcome remains `unknown`. Normal updates still reject every running/unknown operation. An operator who has independently reconciled the historical publication can name its exact operation ID with `--allow-unknown-publish`; tdev verifies that the row is an unknown managed create publication, preserves that receipt unchanged, and excludes only that row from the maintenance frontier. Any other uncertain operation still blocks the update. The exact exemption is journaled so interrupted service replacement can recover the previous bundle without reinterpreting or redispatching the publication.

Source **0.1.19** makes `tdev_operation` typed in ChatGPT Code Mode without weakening the server's action-specific validation and keeps the normal MCP coding surface Termux-native. The advertised operation schema is a flat typed discovery object while the canonical discriminated union remains the call validator. `tdev_exec` no longer advertises or accepts a caller-selected `network`; native execution already resolves to the Termux app UID's host network. The existing SSH/rootless-Podman implementation, operator configuration and tests are retained as a dormant experimental backend for possible later qualification, but its network controls are not part of the current public coding surface. Installed ChatGPT acceptance requires updating the resident and Refreshing the connector.

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

The observer CLI now binds its default evidence directory to the selected installation's
persisted operator HOME, preserving custom `TDEV_OBSERVE_DIR` overrides and native task HOME
isolation. `tdev observer status --json` reads both modes without creating files or controlling
processes, and distinguishes missing evidence, stopped/stale records and invalid roots. The
existing revision-2 collector can be inspected without replacement; new collectors from this
source record revision 3 and explicit root identity. See [operator usage](OPERATIONS.md#caller-execution-witnesses)
and [context qualification](LOCAL_VALIDATION.md#observer-context-binding--2026-09-28).
The user reports successful fresh-session rediscovery, completed-effect recognition, new forward
work/readback and visible handoff/final delivery in the 2026-09-28 reconnect trial. Local read-only
checks independently confirmed the running observer and sample/runtime association; they did
not replay that host trial or qualify remaining broader baseline gates.
At final read-only closeout the old observer had stopped at 13:24:01 UTC, with its 316-sample
segment intact. No observer control command was issued in this work; the initiating actor is
unverified and no automatic restart was performed. The timestamped qualification above records
both the earlier live observations and this later stopped state.

The locally qualified **0.1.16** bootstrap work adds a Termux bootstrap for first-time users, including package preparation,
version-checked private Python dependencies, stock termux-services compatibility and the command
shortcut. The bootstrap preserves terminal input for the existing guided Tunnel setup and reuses
matching clean source checkouts without resetting or pulling them. See [installation](INSTALL.md).
The current resident is not replaced by this source change; qualification is recorded separately.

Installed native packaging acceptance first passed on resident **0.1.14** through authenticated
local HTTP: pinned public dependency, generated asset, source/build/validation scratch retirement,
dependency-environment removal, artifact verification, live release, update/rollback, failed-switch
restoration, data-preserving stop/start/remove, paged export/hash checks and explicit pruning.
A non-service ZIP also builds/verifies/exports without a health port or deployment. The owned
trial service was removed, trial task environments/refs were retired, and no pending effects remained;
data, project registration, historical releases and evidence were intentionally retained.
See [installed evidence](LOCAL_VALIDATION.md#installed-packaging-lifecycle-acceptance--2026-09-27).
A two-project baseline now completes across the connected-tool start and a local CLI resume:
source integration/publication, retained packages, live consumer checks, update/rollback and
cleanup all pass. The connector was unavailable after resume, so complete real ChatGPT journey
and visible-continuity acceptance remain outstanding. All five trial tasks and the workspace
are closed, both artifacts pruned, and the trial service removed with data/history preserved.
See [journey evidence](LOCAL_VALIDATION.md#two-project-journey-with-local-resume--2026-09-27)
and the [baseline execution guide](examples/chatgpt/JOURNEY.md).


The refreshed **0.1.22** ChatGPT surface now requalifies that installed packaging path with actual
model-facing calls. A fresh service fixture completed source validation, retained artifact build and
artifact validation, create/update, retained-byte rollback, failed-switch reconciliation, stop/start/remove,
scratch/environment/ref cleanup and exact artifact pruning. The failed update first returned an unknown
recovery receipt; observing that original operation reconciled it to a committed failed operation with
`rolledBack:true`, while the previous release remained HTTP 200. A fresh non-service archive also
validated and exported its 145-byte ZIP in three bounded pages with one stable SHA-256 before cleanup.
This 0.1.22 run reuses the earlier data-sentinel result rather than claiming a second data-preservation
measurement. Final retained artifact usage returned to zero. See
[the dated requalification](LOCAL_VALIDATION.md#refreshed-chatgpt-packaginglifecycle-requalification--2026-09-30)
and [bounded host evidence](examples/chatgpt/PACKAGING_ACCEPTANCE_20260930.md).
The complete one-/two-project ChatGPT development journey and measured visible continuity remain separate;
the [baseline execution guide](examples/chatgpt/JOURNEY.md) is prepared for that next step.
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
[delivery order](IMPLEMENTATION_PLAN.md#next-implementation-sequence) and
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
