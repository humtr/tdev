# Termux operation

Operator actions, not production authorization. Current status lives in README.

## On-device prerequisites and inactive install

Use Termux Python, Git and the development CLIs required by the enrolled repositories
(for example Node/npm, Python/pip, rg). GitHub publication also needs owner-configured gh
authentication. Prefer the native Android/arm64 CGO tunnel-client. The fallback official
static Linux binary needs Termux PRoot to project resolver/CA files into conventional /etc
paths; that is compatibility plumbing, not isolation. No remote executor enrollment, root,
Docker or systemd is needed.
Install dependencies and rehearse before touching any existing service:

```sh
python -m pip install --target .tdev-deps -r requirements.txt
sh scripts/check.sh
PYTHONPATH=src:.tdev-deps python scripts/rehearse.py
sh install.sh --no-start /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin init --root /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin point --root /absolute/private/staging-root --bundle RETURNED_BUNDLE_ID
sh install.sh --check /absolute/private/staging-root
```

Stage includes the native runner and creates DOWN service templates outside live runsvdir.
It also creates a private mode-0700 tunnel-env directory; Termux does not need an envdir
binary. It never starts/replaces production services. Generated connector.secret is mode
0600; enter it only in the host credential UI, not chat/tool arguments. Initial config
grants no repositories. Keep config/credentials outside source.

Store the Tunnel runtime key once as an owner-only file:

```sh
umask 077
read -rsp "Tunnel runtime API key: " KEY
echo
printf '%s' "$KEY" > /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY
unset KEY
chmod 600 /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY
```

The resident tunnel profile refers to that file; no secret is placed in argv or repository configuration.

## Resident installation and deployment

`bash install.sh` installs or updates the owned `tdev` and `tdev-tunnel` services in the shared
`$PREFIX/var/service`, starts the controller before the tunnel and checks live identity/health.
It discovers the existing owned installation (or an unambiguous running packaged controller).
Use `--root /absolute/private/root` or TDEV_ROOT to select another installation explicitly.
Pinned Python dependencies are bootstrapped into .tdev-deps when missing. Existing credentials,
project delegation, state and Tunnel identity are retained; install does not create remote
Tunnels or expand project grants.

```sh
bash install.sh
bash install.sh --check
bash install.sh --rollback
bash install.sh --recover
bash install.sh --uninstall
```

For a fresh installation, supply `--tunnel-id tunnel_... --runtime-key-file /private/key` or
`--profile-file /private/existing-profile.yaml` (native JSON-formatted profile). The secret file
must be private. The installer stores a file reference, never an inline credential or secret
argument. Repository delegation remains the explicit operator profile setup documented below.
A matching existing managed Tunnel profile can be discovered for the first manual-to-service
transition; `--takeover` explicitly stops this installation's manual controller and matching
managed runtime. Subsequent `bash install.sh` runs need neither manual server startup nor
that flag. The resident tunnel runs directly under runsv, without a second tmux supervisor.

Termux's runit commands, running service-daemon and shared SVDIR are prerequisites. The installer
checks them and reports recovery-monitor availability; it does not replace shared termux-services.
Use a configured recovery monitor for runsvdir-root recovery. Termux session/boot infrastructure
must itself start service-daemon after device reboot; tdev does not install Termux:Boot or alter
Android battery settings. `sv down` controls the current supervisor; `sv-disable` persists a
DOWN marker across root recovery/reboot. An existing DOWN state is preserved across updates.

Service ownership binds installation identity/root and run-script hashes. Unmanaged or changed
services are rejected before replacement. A deliberate old-service replacement uses
`--retire-legacy NAME:RUN_SHA256`; it verifies that exact script, stops its supervisor and moves
its directory outside the live service graph before registration. This is an explicit operator
exception, not prefix/name-based ownership. The stale tdev-oai-tunnel name is rejected.

An installation-wide and shared-service lock, admission fence and durable journal protect
updates. Outstanding or uncertain operations block switching. Both services stop before the
active bundle changes; failure restores the old pointer, scripts and desired service states.
A hard interruption leaves a journal and admission fence: `--recover` restores the previous
state before another install. Registration uses complete DOWN directories; it does not claim
that two directory renames are a single filesystem transaction. First manual takeover retains
private process/environment receipts for restoring the former controller if installation fails.

`--check` verifies packaged files, run-script ownership, supervised PID, actual controller
source/config/state/port, tunnel binary/profile identity and successful control-plane polling.
It reports intentionally DOWN services explicitly. Rollback rejects bundles that predate the
resident launcher before stopping any service. Uninstall removes only owned services and
preserves config/state/secrets/logs and private service backups; it never purges project files.
To reinstall after uninstall, pass the previous `--root` explicitly.

`PYTHONPATH=src:.tdev-deps python scripts/rehearse_services.py` exercises actual runit and a
copy of the installed recovery monitor in an isolated graph: install/update, process SIGKILL,
root recovery, intentional DOWN and uninstall. Its tunnel process is a local fixture; actual
provider health requires the live service check. The shared live graph is not killed by tests.
Installing tdev itself does not qualify arbitrary project deployment targets.

## Workspace composition and source tasks

Use a fresh private state directory for the composition implementation. Earlier experimental
state formats are rejected without migration/deletion; do not restart a previous development
controller against its existing state directory with this code. Prepare a separate inactive
installation and qualify it before any authorized replacement. Credentials and project config
can be supplied deliberately; source changes do not authorize switching a live installation.

The current development connection uses a separately prepared bundle and fresh state; its
exact root and activation receipt are recorded in LOCAL_VALIDATION. The original state path
is retained history, not the active controller state. Do not revive an old manual command
against it. The resident tdev-tunnel service owns the current connection; inspect it
with bash install.sh --check instead of starting a duplicate foreground tunnel. Refresh in ChatGPT only rediscovers what the running server advertises;
first activate/verify the selected server, then Refresh and test in a new conversation.

The simple path is `tdev_task start` → `tdev_read`/`tdev_edit` → `tdev_exec` →
`tdev_operation status` → `tdev_validate` → `tdev_publish`. Omit workspaceId for the automatic
default space. The returned taskId selects source; workspaceId selects its composition.
Successful publication closes that source task. Continue with start.fromTaskId as needed.

For multiple projects, create a named space with `tdev_workspace create` and a projects list
of enrolled repo IDs; optionally set defaultRepo. Start each source task with that workspaceId
and a repo when ambiguous. Project defaults inside an explicit space take precedence over
global defaults. An empty space is valid and does not create a repository or Git branch.

Use workspace inspect to obtain the current revision, project availability and a bounded page
of tasks. Supply expectedRevision for attach/detach/configure/close. A stale revision requires
inspection; retrying the same requestId returns the original receipt, never a second mutation.
Inspect current state separately from historical replay. Task list can filter by workspaceId.
Workspace inspect reconciles busy tasks on its page; follow nextAfter for the rest and use
includeClosed to find published/closed tasks for cleanup. Pending task creation appears in
pendingTasks even before a source-task row exists; follow nextPendingAfter with pendingAfter
for the rest. tdev_operation status handles project,
workspace and source operations; stdin/cancel/retire apply only to execution/validation processes.

Close or reconcile open source tasks before detaching their project or closing the space.
These actions keep branches and execution resources. tdev_task cleanup remains available for
owned unchanged refs after workspace close, and tdev_operation retire removes proved-stopped
execution resources. Project membership is not a grant and cannot repair revoked credentials
or a replaced repository identity.

## Persistent dependencies and development processes

Native exec and validation default to task dependency reuse. Source, HOME and temporary
files remain fresh per operation; dependencies/caches live in `$TDEV_ENV_DIR`. No private
config edit is needed. For example, run this once through `tdev_exec` command mode:

```sh
python -m venv "$TDEV_ENV_DIR/venv"
"$TDEV_ENV_DIR/venv/bin/python" -m pip install -r requirements.txt
```

The environment's venv/bin precedes PATH, so subsequent commands and validation use that
Python. pip/npm caches are retained automatically. For Node, install dependencies with
`npm --prefix "$TDEV_ENV_DIR" install ...`, then link its node_modules into each source copy
when needed; include node_modules in the starting .gitignore so capture does not import the
external dependency link. tdev never silently imports the user's ignored directories. Follow
the project's lockfile/install procedure; a reused environment is mutable, not a hermetic
build. Stop consumers before replacing dependencies they use. `environment: "fresh"` on exec
or validation opts out of task storage (adopted operator tooling still applies).

For a server or pipe-driven debugger, call `tdev_exec` with `mode: "process"`, the current
checkpoint and a foreground command, for example `python -m http.server 8080 --bind 127.0.0.1`.
Omit timeout to keep it running until exit/cancellation. Save the operation ID, or recover it
by original request ID. The process uses a fixed source snapshot; edits and validation can
continue on the task. Restart at the newer checkpoint to serve edits. This does not implement
hot reload, a terminal/PTY, automatic restart, or deployment of that project.

Use `tdev_operation status` for logs and source/environment/deadline identity, `stdin` for
sequenced input, `cancel` to request termination, then observe stopped proof before `retire`.
`task inspect` includes outstanding processes even if their start is outside the history
page; closed tasks remain available via includeClosed. Controller reconnect never restarts
them. A process with a lost supervisor stays unknown and must not be automatically relaunched.
Log retention is bounded to the first contract-sized output segment; later bytes are counted
as discarded, so silence in retained output is not proof of a stalled process.

Task/workspace close and operation retire preserve dependencies. Use `tdev_task` action
`resetEnvironment` with taskId, expected checkpoint and a new requestId to remove dependencies
and caches. All exec/validation operations for that task must first be terminal with stop
proof. The reset also works after task close; source checkpoints, original checkout and
operation receipts/logs remain. If interrupted, inspect/replay that same reset identity.

An installer update is deliberately blocked while development processes or other uncertain
operations remain. Stop and observe them first, then run `bash install.sh`; recreate selected
servers at their recorded checkpoints afterward. Environment storage is under persistent
state, outside bundles, so it survives service updates. Native-only features are rejected by
an explicit remote executor instead of silently changing execution backend.

## Project management from ChatGPT

Configure each trusted local root or GitHub owner once. These operator commands preserve existing
credentials and exact grants, and do not start/restart services. Choose a validation command
appropriate to projects in this profile; create additional profiles for different toolchains.

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.admin delegate-projects \
  --root /absolute/private/installation --principal owner --policy local-dev \
  --local-root /absolute/projects --validation 'git diff --check' --allow-create
PYTHONPATH=src:.tdev-deps python -m tdev.admin delegate-projects \
  --root /absolute/private/installation --principal owner --policy github-dev \
  --github-owner YOUR_ACCOUNT --validation 'npm test' --allow-create
```

The first sample is a minimal whitespace check, not a substitute for a project's test suite.
Policies may also specify the existing optional executor, networks and toolingEnvironment
settings in operator config. Local connect requires an existing Git repository; local create
makes a new initialized folder. A directory outside the delegated root cannot be connected.
GitHub connect/create uses the controller's existing `gh` credential, not the clean command HOME.
The provider must grant the selected repository/account/organization operations; the MCP grant
does not expand GitHub or OS permissions. There is no token argument in the project tools.

After deploying the tested bundle and refreshing tool discovery, the normal conversation uses:

1. `tdev_project` list to discover enrolled projects and available policies.
2. `tdev_project` create/connect with policy, project name and requestId. Local names are relative
   to the policy root; GitHub names are relative to its fixed owner. Creation never overwrites
   an existing folder/repository and GitHub creation is private.
3. `tdev_task` start with the returned repo and requestId. No branch/OID entry is needed.
   Repo can be omitted when unambiguous or when the principal has a configured defaultRepo.
4. Read/edit/exec/validate as usual; publish needs requestId and validationId. Exact expected
   remote state comes from durable task facts, never a newly observed convenient HEAD.
5. Retain the published branch or explicitly task cleanup by taskId. Cleanup also
   works after close. Retire execution copies using tdev_operation retire as before.
6. Continue an earlier publication with task start.fromTaskId, including after cleanup.

Project inspect reports current source HEAD/provider errors and GitHub permissions when supplied
by the provider. `PROJECT_POLICY_DENIED` is delegation, `PROVIDER_AUTH_REQUIRED` is controller
credential setup, and `PROVIDER_PERMISSION_DENIED` is actual provider rejection. An uncertain
create/publish/delete retains its operation and must be inspected, not blindly resubmitted.
Existing disposable refs are not retroactively adopted as managed refs merely by their names.

The current state format requires a fresh private state directory. Older experimental state
is rejected without conversion or deletion; never point an incompatible bundle at newer state.

### Import existing local edits and integrate tasks

Connect the working folder once, then start with localChanges=true to bring its current edits
into an isolated task. Without this option, start uses committed source. For example:

```json
{"action":"start","requestId":"import-local-1","repo":"RETURNED_PROJECT_ID","localChanges":true}
```

The original files, index and HEAD remain intact. The import includes tracked working-file
contents and nonignored untracked files; it preserves neither a separate staged version nor
ignored dependency caches. The connected checkout must still have the selected source branch
and HEAD. Local unmerged indexes and sparse checkouts require resolution/full checkout first.
If files change during capture, inspect the failure and use a new request after edits settle.
Retrying the same successful request always returns the original frozen import.

Use tdev_task integrate to combine another task's changes into an existing target:

```json
{"action":"integrate","requestId":"integrate-1","taskId":"TARGET_TASK_ID","expected":"TARGET_CHECKPOINT","sourceTaskId":"SOURCE_TASK_ID"}
```

Use returned IDs/checkpoints directly; the caller does not need to choose a branch or resolve
HEAD manually. A successful operation with applied=false means conflicts were found and the
target was preserved. Read each side with tdev_read using the returned sourceCheckpoint and
sourceBase, then submit a new integrate request with that sourceCheckpoint and resolutions.
Choices are current, incoming, base, delete, or content with explicit replacement bytes. Conflict
details are bounded to 50 with a total count/truncation flag. For larger sets, carry previously
chosen resolutions into each new request to expose the next unresolved conflicts; no changes
apply until the complete set is resolved. Validate the
resulting target before publishing; validation from before integration is no longer sufficient.
To integrate onto advanced upstream source, start a new target at that base first.

tdev_read can omit checkpoint for the current view. Diff queries accept format=patch/stat/names,
optional base/path and offset/limit. Pin the returned checkpoint for subsequent pages. data is
base64 for exact byte reconstruction; text is a convenient preview. Integration applies a
source delta with a single target parent; it does not preserve a merge-parent history or detect
renames automatically. Persistent development environments and checkout writeback are separate
capabilities, not consequences of importing a local folder.

## Repository enrollment: native is the default

A repository entry lists immutable identity, exact URL/path/ref and mandatory validation.
GitHub uses kind=github, name=owner/repository, exact HTTPS .git URL and identity
github:NUMERIC_REPOSITORY_ID (query authenticated gh api, never infer from name). The
publication credential must have actual access; enroll no-rewrite/no-delete refs.
Local bare fixtures use kind=local, absolute path and identity local:DEVICE:INODE.
The matching principal's repos map lists exact allowed refs.

Omit executor, or set executor to {"kind":"native"}. Omit networks (defaults to ["host"])
or explicitly list host. Nothing else is needed to run commands. Existing configs listing
only networks=["none"] must be changed explicitly for native execution: none does NOT mean
a pretend sandbox. Explicit remote configs keep their existing backend and network policy.

Example repository value (replace identity, repo and command; never put secret values here):

```json
{
  "kind": "github",
  "name": "owner/repository",
  "remote": "https://github.com/owner/repository.git",
  "identity": "github:NUMERIC_ID",
  "refs": ["refs/heads/main"],
  "validation": "npm test",
  "toolingEnvironment": {
    "NODE_PATH": "/absolute/operator-owned/node_modules"
  }
}
```

Native runs with the Android app UID. Only use code/dependencies trusted with that user's
authority. The runner does not inherit tokens, agents, proxy env or global Git config;
HOME/TMPDIR/XDG paths are per-job. Existing source/user index is not the command cwd.
These are credential hygiene, not isolation: malicious same-UID code can access controller
files or private networks by absolute path. Native host networking is ordinary device
networking. Hard network isolation, aggregate RAM/PID quotas and hostile-code protection
are NOT provided. Do not falsely label an env-filtered shell a sandbox.

Validation materializes the frozen candidate with exact Git HEAD. New build artifacts may
be written; existing source bytes/modes must remain unchanged at completion. Source-changing
formatters/generators belong in exec, then validate their captured checkpoint. Test outputs
are never published. This is owner-trusted before/after checking, not a read-only OS mount.
Each exec/validation gets a fresh source copy and HOME. Ignored dependency/build directories
from an earlier command are not copied to validation. An adopted validation command may
prepare dependencies inside that copy, use operator-installed Termux tools, or use the
repository's bounded `toolingEnvironment` to reference an operator-owned warm dependency/
tooling location outside source. Do not place credentials in this environment; private
HOME/TMP/Git/SSH lookup variables are reserved. The tooling environment is part of validation
policy identity, so changing it invalidates prior validation for publication. Large installs
inside a per-operation copy can still hit the documented native disk/source limits.
Only configured strings are bound, not the mutable contents of external directories. Use
versioned operator-owned dependencies, not a second source checkout, and change the configured
path for tooling upgrades. Candidate modules must precede external dependencies (the tdev
check script puts candidate src first). NODE_PATH does not add npm executable directories to
PATH: adopt the correct validation command/tool paths for the actual repository. Never put
tokens in PATH/PYTHONPATH or other tooling values; same-UID access is still not isolated.

## Local HTTP and Tunnel

Start a selected development instance, separate from existing installed services:

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.server --state /absolute/private/dev-state --config /absolute/private/config.json --port 8765
```

Server binds 127.0.0.1 only. GET /healthz is liveness; POST /mcp requires the installation
bearer before discovery/calls. Subject/session headers never grant authority.

The endpoint implements **MCP 2026-07-28 only**. Use a client pinned to that revision;
there is no initialize handshake or session header. Every POST request needs Accept
application/json and text/event-stream, MCP-Protocol-Version=2026-07-28, Mcp-Method matching
the JSON-RPC method, and params._meta containing io.modelcontextprotocol/protocolVersion
and io.modelcontextprotocol/clientCapabilities. tools/call also needs matching Mcp-Name.
Client identity metadata is never a permission grant. See the contract x-mcp profile.

Reproduce the official SDK compatibility probe (a development-only dependency, not runtime):

```sh
npm install --prefix .tdev-mcp-client --ignore-scripts --no-audit --no-fund @modelcontextprotocol/client@2.0.0
PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py
```

This verifies local modern-protocol discovery/tools/calls, not a live ChatGPT host.
OpenAI's documented HTTP/Tunnel support alone does not prove support for this exact date.
Do not downgrade silently if a host sends legacy initialize or lacks required headers.

Use the installed tunnel-client help/doctor to configure profile tdev pointing at
http://127.0.0.1:8765/mcp. Provide Tunnel runtime credentials privately and separately
from installation bearer/provider credentials. Existing production profiles must not be
repurposed automatically. OAuth/DCR discovery is intentionally absent; the two protected-
resource well-known candidates return public HTTP 404 while /mcp remains bearer protected.

Prepare the Tunnel runtime before staging. The preferred path compiles the pinned official
OpenAI source as an Android/arm64 CGO-enabled binary under the private installation root.
If native compilation is unavailable or fails, Termux falls back to the installed official
Linux binary through termux-chroot plus the Termux CA bundle:

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.admin prepare-tunnel \
  --root /absolute/private/staging-root
```

`install.sh --no-start` performs this preparation automatically before staging. A successful
native preparation reports `mode: native-cgo`; fallback reports `mode: termux-chroot`.
The native binary needs no PRoot/chroot wrapper, custom resolver variable or CA override.
The fallback uses `CA_BUNDLE=$PREFIX/etc/tls/cert.pem`; termux-chroot supplies the Linux
filesystem view including `/etc/resolv.conf`. termux-chroot comes from the Termux proot
package, so this reduces wrapper complexity but is still PRoot-backed compatibility rather
than isolation.

For manual qualification, use the prepared private binary when native-cgo succeeded:

```sh
CONTROL_PLANE_API_KEY="$(cat /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY)" \
  /absolute/private/staging-root/bin/tunnel-client doctor \
  --profile tdev --health.listen-addr 127.0.0.1:0 --explain

CONTROL_PLANE_API_KEY="$(cat /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY)" \
  /absolute/private/staging-root/bin/tunnel-client run \
  --profile tdev --health.listen-addr 127.0.0.1:0
```

The staged tdev-oai-tunnel runit template selects that private native binary first. If it is
absent, a qualified Termux fallback template uses `termux-chroot tunnel-client` with
`CA_BUNDLE` and the same owner-only key-file and ephemeral-health-listener policy.

Connect/Refresh the ChatGPT connector and enter its bearer through the credential UI.
Verify 2026-07-28 request metadata/header forwarding, the current contract's tools, wrong-secret discovery denial, full native
task/edit → exec/operation → validate → publish, and same-request replay after reconnect.
If bearer forwarding is unsupported, qualify another supported host auth route; do not
substitute unverified subject/session headers. Shared credentials share API authority.

## Processes and restart

Workspace inspect returns a bounded current source/remote/operation/cleanup view, even for
closed tasks (discover with list includeClosed). Follow nextBefore/nextAfter for older
rows. Process status with since (empty initially) and inspect expose a cursor, changed,
observation time and pollAfterMs. Reuse the returned cursor with the same query: unchanged
means checked now, not stalled. Respect the polling hint/task deadline or do independent
work. Exact admission checks still apply; mutationReady is only the open/no-busy prerequisite.

The native supervisor outlives controller HTTP/restart. Observe the original operation or
lookupRequestId after lost responses; never create a new request just because no response
arrived. Stdin delivery is sequenced and durable; queued/committed means pipe delivery,
not application consumption. Cancellation requests stop supervised descendants before capture.
Timeout/cancel can retain safely captured edits; capture failure preserves prior checkpoint.

After terminal reconciliation, tdev_operation action retire with a new requestId removes execution
copies/payloads, retaining intent digest, result and bounded logs. It also works after the
creator finished. Unknown/live operations cannot be retired. Runit/Android may kill the whole
app UID; there is no always-on promise. Supervisor death without a sealed result remains
uncertain and fences only that task; preserve the spool for operator investigation.
No stale job becomes a global lock or a reason to provision another machine.

## Local Codex and optional CLI extensions

The installed Codex client may still speak legacy initialize; a direct connection to the
2026-07-28 endpoint then fails. Do not change the core version or mislabel tool annotations.
An explicit localhost-only stdio adapter is available:

```sh
PYTHONPATH=/absolute/tdev/src:/absolute/tdev/.tdev-deps python -m tdev.codex_bridge \
  --url http://127.0.0.1:8765/mcp --token-file /absolute/private/connector.secret
```

Register that command and PYTHONPATH in the chosen Codex MCP configuration if persistent
access is wanted; do not put the token value in command arguments or source. The file must
be private and contain a bearer already admitted by that installation. Adapter initialization
reports 2025-11-25, while every upstream request uses 2026-07-28. It forwards tool semantics
unchanged and never automatically retries effects. Native trust limitations still apply.

Use the prepared native `tunnel-client codex plugin install` when the optional Tunnel plugin
is missing. This changes Codex plugin configuration, not production services. The plugin
manages Tunnel runtimes; it does not by itself register tdev tools with Local Codex.
Test installed-client discovery/calls without a model run or permanent MCP config rewrite:

```sh
PYTHONPATH=src:.tdev-deps python scripts/check_codex.py
```

This runs a disposable local bare-ref/native coding path through actual Codex app-server MCP,
with client restart/replay and retirement. It does not test Codex through Secure MCP Tunnel.
External CLIs already use exec/stdin/output/capture and the normal process lifecycle.
Other MCP services currently remain separate host integrations. Future runtime-side connections
follow the composition design in ARCHITECTURE and require their own qualification; connecting
one in tdev does not automatically add its tools to the host.

Tool annotations follow the current contract's host-hint profile; hints do not grant authority
or describe proof of effects. After changed tool names/schemas are deployed to an explicitly
selected development installation, refresh the host connector and recheck affected discovery
and approval behaviour. Earlier host acceptance does not qualify the new tool contract.

New DOWN Tunnel service templates write their randomly assigned health address to
`<installation-root>/tunnel-health.url`. After authorized startup, inspect it with
`tunnel-client health --url-file <installation-root>/tunnel-health.url --require-control-plane-poll --json`.
An old foreground runtime without that file needs separate observation; do not infer its
health from a guessed fixed port or restart it just to create the file.

## Optional SSH/OCI backend

Only users who choose stronger isolation need a separate Linux host, rootless Podman with
cgroup v2/seccomp, pinned image and SSH key/host enrollment. Set executor kind=ssh with
target, script, digest, spool, image, identityFile and knownHosts (legacy omission of kind
also works). Install the standalone src/tdev/executor.py at an immutable versioned remote
path and pin its SHA-256; pre-pull the image. None is its default network. Internet requires
the adopted private network-policy.json and matching networkPolicyDigest, plus live egress
qualification. See ARCHITECTURE for its distinct security guarantees.

Do not claim optional OCI host isolation/resource/network acceptance from local fixture
tests. Those tests remain useful but are not a native installation gate. A failing explicit
remote backend never falls back to a less-isolated native run. Accepted operation intents
continue using their recorded backend even after configuration changes.

## Activation and rollback

After host acceptance and explicit cutover authority, stop the selected controller, check
outstanding effects, verify and select the bundle, then install DOWN templates in runsvdir
and bring up controller/Tunnel independently. Preserve old service/config state. Point/
rollback refuses an active controller, unknown/running operations or incompatible schema.
Rollback selects the previous verified bundle; it does not start services or rewrite Git.
Same-UID hostile code can tamper with installations: verification is not OS isolation.
