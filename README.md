# tdev

Intelligence leads development; tdev supplies the foundation for using and composing tools,
projects and execution environments. ChatGPT chooses strategy and tools within the user's
delegated authority. **Android + Termux is the default development and operating environment**,
not just a controller for another machine.

The first development goal is complete Git/local development, validation and deployment:
create/connect projects → inspect/edit/debug → test → commit/integrate/publish → deploy →
verify live behaviour → recover and clean up. A successful Git push is not deployment.
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

Nine MCP tools separate composition (`tdev_workspace`), source tasks (`tdev_task`), projects
(`tdev_project`), source read/edit, execution, general operation observation/control
(`tdev_operation`), validation and publication. Git holds checkpoints; SQLite holds workspace
composition, source tasks, enrolled projects and accepted operations. These interfaces replace
the experimental source-workspace/process names without aliases.

Core HTTP MCP is pinned to **2026-07-28**. Local Codex has an explicitly selected legacy stdio
adapter; it does not downgrade core HTTP. Commands/tests run natively on Termux by default.
Explicit remote execution remains optional and never silently falls back to native. No SSH
host, VPS, OCI, root, systemd or Docker prerequisite is imposed on local development.

Native execution carries ordinary Termux app-UID authority. Source copies, private HOME,
clean environment and API grants are useful safeguards, not hostile-code or credential
isolation. See the [trust boundary](ARCHITECTURE.md#3-native-trust-and-containment).

## Current work

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
observes all accepted effects; process controls apply only to exec/validation operations.
See [usage](OPERATIONS.md#workspace-composition-and-source-tasks).

Qualification: **123 deterministic tests pass**. New coverage includes dependency reuse, a live
HTTP development server during edits/validation, reconnects, writer independence, process limits
and interrupted environment cleanup. Official MCP SDK and installed Local Codex checks also pass
with the same nine-tool surface. Prior resident installation/recovery evidence remains separate.
Exact results are recorded in [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md#persistent-environments-and-processes--2026-09-21).

The new internal state format uses the existing fresh schema-3 development state. The
installation now runs through owned runit services on localhost:8765, with the same Tunnel
identity, credentials and project enrollments. The old manual runtime and experimental tdev
service/helper/agent registrations have been retired from the live graph. Historical private
state and retired service files remain outside that graph. The accumulated implementation is
now delivered on the canonical tdev branch under the user-authorized 0.1 pre-release line;
this resident installation is not a product v1 release.
See [resident evidence](LOCAL_VALIDATION.md#resident-service-installation--2026-09-21).

The next development work connects concrete execution/provider resources and deployment of
authored projects. Persistent task dependencies and snapshot processes cover the initial native
path; hot reload, PTY debugging and cross-task environment sharing are not implemented.
Installing tdev itself does not implement arbitrary project deployment. Blender/MCP/device/
computer-use/model connections remain future integrations. See
[implementation order](IMPLEMENTATION_PLAN.md#next-implementation-sequence).

Earlier project-management evidence includes 81 deterministic tests, actual GitHub managed-ref
publication/readback/cleanup and an unchanged canonical HEAD. It used the earlier eight-tool
contract. Earlier native SDK/client and inactive packaged crash-recovery evidence, with their
exact tested scope, are retained in [LOCAL_VALIDATION.md](LOCAL_VALIDATION.md). New composition
qualification is recorded there separately; do not infer live rollout from local tests.

Run deterministic checks with `sh scripts/check.sh` after
`python -m pip install --target .tdev-deps -r requirements.txt`.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
