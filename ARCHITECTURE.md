# tdev architecture

## 1. Product and authority

Android + Termux is both the development and normal operating environment. The current
source-development path is ChatGPT → Tunnel → localhost tdev → task/edit → exec/operation →
validate → publish. No Linux host, VPS, SSH, OCI, root, systemd or Docker is required.

ChatGPT chooses strategy, commands, edits, diagnostics, composition and publication.
tdev owns exact repository/ref/source identity, current MCP admission, immutable checkpoint
handling, mutation identity, concurrency and validation/publication joins. Git owns source
and canonical refs; SQLite owns workspace composition, task pointers and accepted intents/results; the native
supervisor owns subprocess lifetime; runit owns service restart; Tunnel owns delivery.

User instructions and actual permissions bound work. README owns purpose/current status;
this file owns semantics; contracts/tools.schema.json owns wire types; IMPLEMENTATION_PLAN
owns execution order. AGENTS is navigation. Superseded designs live in Git history.

### Target composition model

Workspace/project/source-task composition is implemented. Tool/runtime connections and
broader deployment below remain design requirements; the native Termux project-service path is implemented in §8. Product goals and version policy belong
in README; wire types live in the contract.

| Concept | Responsibility |
|---|---|
| Workspace | Composes project references, connected tools and execution environments for development. |
| Project | Reusable development target/source identity; may participate in multiple workspaces. |
| Source task | Isolated source state for one project within a workspace; a multi-project objective uses multiple tasks. |
| Operation | An accepted execution or effect with identity, progress, result and recovery evidence. |

`tdev_workspace` owns composition; `tdev_task` owns source-task lifecycle. `tdev_edit` changes
source. `tdev_operation` inspects every accepted operation and controls exec/validation
processes where applicable. No old-name aliases are provided for experimental contracts.
Workspace create/list/inspect/attach/detach/configure/close need no Git source task. A workspace
may be empty. Each project membership captures its enrolled identity and never grants authority.

Task start/open/compose admit an optional workspaceId. When omitted, the controller creates or
reuses the principal's default workspace and attaches the resolved project in the same local
transaction as task admission. Explicit workspaces use only their attached projects and their
configured default (or sole member); they never silently use an unrelated global default.
The same project can participate in multiple spaces with independent tasks and checkpoints.

Workspace mutations use revision CAS and commit composition and replay results together.
Close/detach reject open tasks and pending/unknown source-task creation, including the interval
before a task row exists. Closed tasks, published refs and execution resources are retained;
closing a workspace never implies deleting a branch or cancelling a process. Owned cleanup
and inspection remain available after close/detach subject to current project authority.
Workspace inspect observes the selected bounded page of task executors outside the store lock,
then rereads task state; its observation records freshness and no-change evidence. Revoked or
replaced projects are reported unavailable rather than silently re-enrolled. Old receipts
record historical composition; current membership comes from workspace inspect.
Pending source-task creation is separately paged in that inspection, exposing operation and
request identity even before the task row exists. It must not look like an empty idle space.

Reading a device or calling an external tool must not require a Git branch or source task
when those adapters are implemented. Connections below are future requirements, not an
advertisement of currently implemented device or MCP attachment.

The intelligence chooses strategy and composition. Connections supply discoverable capabilities,
actual authorization, endpoint/runtime identity and attach/use/inspect/detach lifecycles. MCP,
CLI, API, device and model adapters may differ; do not force all tools through one transport.
Host-connected tools can be used directly. Runtime-side connections do not automatically
register tools in the host. No particular model, decision intermediary or workflow is mandatory.

Workspace membership does not grant OS/provider authority. Within delegated scope, route effects
through the authenticated connection that can perform them; missing shell credential inheritance
alone must not strand an otherwise authorized operation. Distinguish absent credentials,
insufficient external authority, unsupported capability and unavailable runtime. Revocation
gates new effects; changing a connection must not silently reroute or repeat accepted effects.
Record enough input/resource identity and results to continue after reconnect or replacement.

Source checkpoints, validation and Git CAS belong to source-development adapters. External
effects need their own observed success and recovery semantics; a model judgment is not an
effect receipt. Multi-repository publication is not atomic, device effects are not Git-reversible,
and native working-copy separation is not a security sandbox. Deployment binds a verified
artifact to a target, checks live identity/readiness and supports explicit recovery and cleanup.
Publishing source alone does not establish any of those facts.

Implement the full coding/deployment path first using these boundaries. Add concrete integrations
as selected, with evidence for their actual capabilities, rather than building a universal
registry or planner before there is a usable development loop.

## 2. Runtime choice and public surface

| Execution choice | Benefit | Cost / boundary | Role |
|---|---|---|---|
| Shell in the user's existing checkout | minimal copying | partial writes, unrelated dirty state and candidate config affect controller operations | rejected as default |
| Native subprocess in a per-operation copy | installed Termux CLIs, no provisioning/cold remote startup | same UID, no hostile-code filesystem/network isolation; materialization/capture cost | default |
| SSH + rootless OCI outer runner | OS isolation and enforceable network/resource controls after qualification | external host/image/SSH maintenance, transfer/cold start and more failure points | optional explicit backend |

The source surface is task/read/edit/exec/operation/validate/publish; workspace supplies
composition and project supplies delegated local/GitHub enrollment. CLI adapters need no
additional permission registration. tdev_deploy manages validated native project services on delegated Termux targets. General
tool/runtime connection lifecycle remains future work. CLI extensions gain no MCP admin operation;
native programs nevertheless have the real app UID's authority (§3).

Tool annotations use the fixed tmcp host-hint scope: all ten public tools advertise
`readOnlyHint=true`, with `destructiveHint=false`, `idempotentHint=false` and
`openWorldHint=false`. These annotations are host hints, not effect semantics, admission
authority or a safety boundary. The actual task mutation, owner-trusted execution,
validation and remote publication effects remain enforced by tdev's normal contracts,
authentication, CAS, validation and provider authority.

Known repo/ref/head: open → batched read → edit → validate → publish is five semantic calls
plus observations. Exec can batch shell commands. Tool count is not a goal.
Omitted executor config means native; explicit SSH never falls back to native on failure.
Existing SSH configurations without kind remain readable. Each new operation records its
selected backend; reconnect/config changes never migrate an accepted command or relaunch it.

## 3. Native trust and containment

Native execution is ordinary Termux developer authority. Enrolling a repository/principal
for native commands means trusting its commands/dependencies with this Android app UID,
as with running a local terminal. The MCP API checks repo/ref scope and exposes no admin
operations. It cannot restrict a hostile native shell to that scope at the OS level.
Separate principals are API scopes, not same-UID hostile-code security domains.

The runner supplies a clean environment, separate HOME/TMPDIR/XDG directories, no inherited
SSH agent, provider/tunnel tokens, proxy variables or Git global credential helpers. Operator
repository config may add a bounded `toolingEnvironment` for non-secret toolchain/dependency
locations needed by clean copies; private HOME/TMP/Git/SSH lookup variables remain reserved.
The exact tooling environment is recorded in execution input and validation policy identity.
This binds environment **strings**, not the changing contents of referenced directories.
Owner-adopted tooling must be non-secret dependencies, not another copy of repository source;
put candidate source first in module lookup. Prefer immutable versioned dependency paths and
change the configured path when updating them. This is not dependency-content attestation.
Source contains credential-free shallow Git metadata, never a copied provider configuration.
Native commands and validation now default to a task-owned dependency directory, exposed as
`TDEV_ENV_DIR`, with persistent pip/npm/XDG caches. The directory is independent of source and
private per-operation HOME/TMP/config. Its `venv/bin` and `bin` precede the command PATH; callers
install their selected tools explicitly. `environment=fresh` omits this directory and uses the
disposable caches. No automatic dependency installation, lockfile inference or sharing between
tasks is implied. Environment identity is part of the retained execution input; mutable
dependency contents are not attested. As with adopted toolingEnvironment, validation proves
the exact candidate ran in that environment, not a hermetic dependency build. Concurrent
processes can use the same task dependencies; stop consumers before changing an installed
toolchain. The API does not serialize arbitrary package-manager writes.
Controller/provider/Tunnel configuration stays outside the execution copy. Candidate stdout
is never parsed as a receipt. These prevent accidental credential propagation and confused
API authority; they do NOT prevent a malicious same-UID program from reading absolute paths,
inspecting processes, changing controller state, using host credentials or forging spool data.
No env-filtering, chmod, cwd, chroot or PRoot sandbox claim. Tunnel transport prefers a
Termux-native Android/arm64 CGO build of the pinned OpenAI tunnel-client source so Android
resolver/system trust are used directly. If that build is unavailable, the official Linux
binary may run through termux-chroot with the Termux CA bundle. termux-chroot is itself a
wrapper from the Termux proot package and is host compatibility only, not a containment
boundary. Do not use native mode for code that must be treated as hostile to the device
owner; stronger isolation is an optional backend.

Native network is explicitly host: the app UID's network access, including localhost and
private networks. Requests for none/internet isolation are rejected, not silently weakened.
There is no network-denial prerequisite preventing npm/pip/CLI development. Optional OCI
defaults to none and can admit externally qualified internet egress.

Each operation uses its own app-private copy; controller edits never touch the user's
checkout/index. Initial paths/symlinks are checked before materialization. Cwd resolves inside
that copy. Capture does not follow symlinks and rejects escaping links, special files,
unsupported gitlinks and .git control paths. These protect source handling, not against
arbitrary native commands explicitly accessing other paths.

The detached supervisor uses a separate session, Linux subreaping, no-new-privileges,
nonblocking stdin/output, a wall deadline and child cleanup before capture. It tracks actual
child relationships and checks PID start identity before signalling; no controller-wide kill
or UID-wide process limit. Ordinary detached/double-fork children are reaped by the live
supervisor. A hostile process race is not a kernel containment guarantee.

Limits: bounded retained output; per-process CPU/file-size/file-descriptor/core-dump limits;
sampled execution-directory disk budget. Wire values are in the contract. There is no hard
aggregate memory/PID/disk quota, cgroup guarantee or device-wide fork-bomb protection. Kernel
subreaper/no-new-privileges failure is reported locally, never routed to mandatory remote
provisioning. Android can kill the whole app UID, including runit and supervisors.

## 4. Durable state and source

| Row | Durable ownership |
|---|---|
| workspace | owner, name, revision, default project and enrolled project membership identities |
| task | workspace identity, owner, enrolled repo/ref identity, source base, checkpoint, busy operation, closed state; managed ref ownership and last published OID |
| project | delegated repository identity/path/default source branch and creating principal/policy; no credentials or copied executable policy |
| operation | principal/request digest, exact intent/backend/policy, result and effect certainty |
| deployment | owner, enrolled project and delegated target identity, service identity, desired release/revision and busy operation |

Operator config owns credentials, static repo/ref enrollment, delegated project scope, adopted
validation and optional executor selection. Project rows record enrollment within that scope;
current policy supplies validation/tooling/backend on every admission. No mirrored grant,
binding, executor or capability tables. Runner spool
stores accepted input, process observation, bounded output, controls and terminal evidence;
these are execution evidence, not new authority/workflow owners.

Private bare Git stores hold objects; no hard-link correctness dependency. A checkpoint
commit OID is source identity and CAS token. A→B→A bytes have distinct checkpoint OIDs;
no numerical revision. Private index/tree plumbing makes multi-file edits atomic.
Objects are written/pinned before the SQLite pointer/result transaction. Shared FETCH_HEAD
is not used. Concurrent first opens see a completely initialized object store.

Command mode materializes an exact checkpoint with shallow Git HEAD. Capture atomically imports
tracked files, nonignored new files under STARTING ignore rules and explicit extra paths.
Candidate index/config cannot change selection. Nonzero exit, timeout or cancellation may
still capture safely stopped native work. Capture overflow/failure keeps the previous
checkpoint and reports why. Native copies persist until explicit terminal retirement.
A command's local git commit/rebase produces file changes for capture; it does not replace
the controller's canonical source identity.

Normal persistent worktrees save copying but add partial-edit recovery/index lifetime;
tree-only pointers cannot distinguish ABA; custom content-addressed storage duplicates Git.
Keep Git plumbing plus temporary command copies. File payload and shallow pack currently
duplicate transfer/storage; optimize only with measurements.

Task dependency storage survives process retirement, controller reconnect and task/workspace
close. `task resetEnvironment` explicitly removes only that task's native dependency directory,
including after close, and requires no running/unknown execution for the task. Admission is
serialized with starts; an executor lease also rejects removal while a supervisor uses it.
The retained reset intent, same-directory rename and replayed deletion recover interruption
without deleting a newly rebuilt environment on replay of a completed request. Source, job
receipts and logs are separate and retained. This extends schema-3 intents, not stored grants.

### Local checkout import and task integration

A connected non-bare local project records its working-folder identity separately from its
Git common-directory identity. Linked checkouts use their own checked-out branch. Connecting
another checkout of the same enrolled repository does not silently rebind that source folder.
Task start may explicitly import local changes: the selected branch and HEAD must still match
the admitted base. Read tracked paths and nonignored untracked paths using the existing index
only for selection, then capture final working-file bytes, executable bits and safe symlinks.
Staged and unstaged versions are not separate snapshots; ignored untracked files are omitted.
No index refresh, add, clean filter, hook, checkout write or ref write is performed by import.
Unmerged indexes, skip-worktree entries, gitlinks and unsafe tracked file types are rejected.
Two matching scans check identities, selection, content and file metadata before committing the
new task; this detects concurrent changes but is not an atomic filesystem snapshot. Interrupted
import leaves no partially admitted task. Durable replay returns the captured source, not a
new scan. Existing native capture limits also bound imported files and total bytes.

Task integrate applies one task's delta (source base → selected source checkpoint) to another
task in the same repository. Both tasks require current access. The source checkpoint must
lie between its base and current checkpoint; source base must be an ancestor of target base.
For a newer upstream base, start a new target there and integrate the older task into it.
Admission freezes the source checkpoint in the operation; target checkpoint CAS and busy
ownership prevent stale writes. Ordinary independent text changes use Git's built-in
[three-way file merge](https://git-scm.com/docs/git-merge-file); user attributes, external merge
drivers and hooks are not executed. Binary, add/add, delete/modify, link/type and path topology
conflicts require explicit resolution when simple equality/unchanged-side rules cannot decide.

Unresolved integration completes with applied=false, bounded conflict details and the original
target checkpoint. It commits no partial merge or conflict markers. A new request can resolve
the frozen source version using current/incoming/base/delete choices or supplied file content;
all conflicts and file/directory collisions must be resolved before the target advances. The
source task never changes. The result is a single-parent target checkpoint with source lineage
in the operation receipt, not a Git merge-parent graph or automatic rename detection. Repeated
integration is another delta application and may need resolution. Validation is bound to the
exact resulting checkpoint; earlier validation cannot authorize publication after integration.

Source reads default to the task's current checkpoint and return that identity. Callers pin it
for subsequent pages when concurrent edits are possible. Diff supports stat, patch and name
summaries, an accessible historical base and literal path filtering. Diff/history pages carry
byte offsets and lossless base64 data alongside a text preview; concatenate decoded bytes for
exact reconstruction across UTF-8 boundaries. History currently covers the latest 20 commits.

## 5. Admission and authentication

Installation bearer maps directly to a principal and exact repo/ref or delegated project scope. Check current
config on every admission and replay. No permission object per command. Bearer identifies
a credential holder, not a verified ChatGPT account/session. Shared credentials share API
authority. Subject/session headers never grant access.

Tunnel runtime credentials authorize transport; installation bearer protects MCP ingress;
provider credentials authorize publication; local config possession is operator authority.
No One-Time Permit or unverified metadata primitive. Revocation affects subsequent API
admissions/replays; it cannot revoke an already running native process's app-UID authority.
Private config stays outside source; MCP has no config/install/release endpoint. Actual
provider/user permissions remain the upper bound.

### Delegated projects and managed tasks

Project policies authorize a fixed local root or GitHub owner, optionally repository creation,
and an operator-owned validation/tooling/backend profile. A principal may use only named
policies granted to it. Project connect/create cannot supply credentials, commands, executors
or expand a root/owner. Changing/revoking that scope also gates replay and existing projects.
Project identity stays bound to the Git common-directory device/inode or GitHub repository ID;
a same-name replacement is not the enrolled repository. Static enrollment remains supported.
The one-time operator CLI configures delegation; routine new projects use MCP, not config edits.

Local connect uses an existing Git project (including ordinary working checkouts) inside the
root. Create initializes a new directory and README commit without replacing existing files.
GitHub create uses controller credentials and a private initialized repository under the fixed
owner. Execution copies do not need provider authentication to finish project work: controller
project/Git operations own those effects for native and explicitly selected remote runners.
Provider scope and actual OS permissions remain upper bounds. Discovery distinguishes delegated
scope from live provider authentication/permissions; inspect performs current repository checks.

Task start chooses the sole accessible project or configured default, otherwise requires
an explicit project. It chooses the configured/sole source branch, resolves its actual HEAD once,
and journals that immutable base before fetching. Retries retain original identity. No global
current-project/session pointer. Start reserves a unique server-generated branch name within
the intersection of repository and principal namespaces; no remote branch exists yet. Exact
open/compose remain available for enrolled refs, never as a way to adopt a managed branch.

Managed tasks publish only their frozen validated candidate, parented by the admitted source
base, using create-if-absent CAS. Source base and publication target expected state are distinct:
first publication expects absence even when the source branch has advanced. Delegated projects
use base refs as sources; direct base publication is not granted by connect/create. Existing
explicit canonical publication grants keep their previous meaning. Start from a proved
published task continues its retained commit, even after that task's branch cleanup.

Close retains branches. Explicit cleanup works before or after close and deletes only the
task's created branch at its exact recorded publication OID. Prefix matching alone is
never ownership; foreign or changed branches are preserved. Clean local checked-out branches
must be switched away before deletion. User checkout/index/untracked content is never a
materialization/publication target. Absence can finish cleanup only when no prior uncertain
writer is active. Branch names are never reused. Namespace operators must not delete/recreate
or rewrite owned refs behind the controller; Git OID CAS cannot detect an external ABA rewrite.

Remote ref mutations journal intent before dispatch and survive restart as unknown until
observed; task cleanup is no longer classified as a purely local mutation. Unknown
publication cannot be cleared by an absent ref. Known exact publication and absent deletion
can reconcile without repeating effects. GitHub create persists its returned repository ID
before enrollment; loss before that ID is durable remains unknown, never re-POSTed or claimed
successful from the name alone. Explicit connect can enroll a repository independently.
SQLite schema 3 separates workspace composition and source tasks. Earlier experimental state
is rejected before table changes; this redesign uses a fresh private state directory and
provides no automatic migration or deletion of old state. Activation/rollback rejects bundles
unable to read the actual schema. Storage revisions are independent of product versions.

## 6. Process, concurrency and recovery

One controller holds a kernel lock released on death; SQLite WAL/FULL transactions do not
span subprocess/network waits. Per-task checkpoint CAS/busy ownership prevents silent
overwrite; reads use the last committed checkpoint. Different tasks/ref tasks proceed
independently. No global stale lock, timeout lease, automatic coordination or planner.

Native `exec mode=process` starts a foreground development server/debugger on a fixed checkpoint
copy. It has no default wall/CPU deadline; an explicit timeout restores both limits. It never
captures files into a task, so admission records the checkpoint without reserving the task
writer. Later completion, cancellation or supervisor loss cannot clear another writer or
change/reopen a closed task. Ordinary command and validation modes retain their existing
writer/deadline rules. Process mode remains an ordinary retained exec operation: status/logs,
sequenced stdin, cancel and stopped-resource retirement use the same controls and dedup rules.
It is not resident service deployment, auto-restart, hot reload or a PTY. To serve new source,
stop the old process and start a new operation at the new checkpoint. No shell detachment is
needed. Native supervisor loss retains uncertainty and blocks environment cleanup/installation
updates, while unrelated source editing remains possible.

### Progress continuity within a turn and across resumes

The controller must surface underlying completion within the same turn and after reconnect,
including when the caller missed the completion response. Replaying a mutation reconciles
the original operation before returning; it never starts the effect again. Process status
reads the supervisor's current result/log evidence, not a cached admission response.

Use task list (bounded task pages, includeClosed for cleanup) then task
inspect for a known task. Inspect reconciles its busy operation and returns current
checkpoint/base, live remote head or a provider error, a bounded newest-first operation page
(including related controls), original request IDs, cleanup state and mutationReady.
Older predecessors are available by before cursor; the response does not claim the entire
unbounded history fits in one page. mutationReady means only open/no busy, not advance
permission for every action: expected source, validation and old head are checked on admission.
The model chooses the next useful action; no planner or new durable workflow owner.

Inspect, and operation status with since, return a content-hash cursor, changed, observation
time/provenance and pollAfterMs. The cursor is equality evidence, NOT an ordered revision.
Inspect also bounds its observation interval with startedAtNs; SQLite, executor and remote
reads are not an atomic distributed snapshot. Concurrent changes may require another read;
an active summary is omitted if the busy identity changed during observation. Admission CAS
remains authoritative. Local logs expose availableBytes so growth beyond the returned page
changes the cursor; older optional remote runners may omit that field until explicitly upgraded.
Retained output remains capped; unchanged output alone is not proof a process is stalled.
Task inspect also observes all admitted outstanding process-mode operations independently of
the history page. Admission caps their count so this observation is bounded; a just-completed
process remains visible in that observation and then in operation history. Execution summaries
identify mode, source checkpoint, environment selection and deadline. Closing a task does not
stop processes; use includeClosed for discovery and the original operation handle for controls.

Equal since returns a freshly checked no-change result, not an ambiguous cached response.
Wait at least the polling hint or do independent work, and bound polling by the task deadline;
the server does not impose a new scheduler, infer a guard/permission transition, or guarantee
model behaviour. Provider failure is an explicit current error, not evidence of completion.
Transport reconnect is unrelated to operation lifetime.

Closed tasks remain inspectable and discoverable with includeClosed. Inspect also reports
managed ref cleanup readiness and current absence separately from provider errors. Terminal execution
copies can be retired via the original operation after creator/session completion; unknown
effects retain evidence and cannot be retired automatically. Tests exercise live output growth,
no-change freshness, missed completion/replay, fresh controller/client resume, useful next work,
bounded pages and post-close cleanup. No-change/current observation must not force a model to
re-investigate completed predecessors or invent unrelated security diagnoses.

Every mutation uses principal/request identity. Auth precedes replay; dedup precedes stale
checks. Same identity with changed input conflicts. Local pointer and result commit together.
Dispatch/stdin/cancel/publication have durable intent before effects. Reads need no journal.

| Certainty | Meaning |
|---|---|
| none | no local pointer/effect committed or proven pre-dispatch rejection |
| committed | effect/result durably known |
| unknown | may have executed; observe original identity, never automatically repeat |

Native dispatch reserves a spool job before launching one detached supervisor. Lost
controller response/restart reconnects to that job. Launch reservation gaps and supervisor
death without a sealed result remain uncertain, even if no PID is currently visible.
Only the affected task is fenced. Do not invent successful receipts or recapture
possibly live bytes. Operator recovery may be needed after supervisor/app-UID loss; it
is not a prerequisite to ordinary native execution. Process start identity is not a lease.

Stdin sequences are reserved before unbuffered writes; partial delivery/unknown acknowledgement
does not cause resend. Cancellation is a persisted request, not termination proof. Logs have
byte cursors and discarded-byte counts. After terminal reconciliation, retire removes
per-job payload/copies while retaining digest, result, controls and bounded logs; creator
completion does not prevent management. Unknown jobs cannot be retired by timer.

Same-ref work stays independent. Compose applies base→source changes only where target
is unchanged or already equal, rejecting conflicts. The model decides when to merge/rebase
or compose, and validates the combined checkpoint.

## 7. Validation and publication

Before validation, construct the exact sole-child candidate of canonical base and record
its commit/tree, adopted command, backend and policy digest. Mandatory command comes from
operator config, not a candidate policy file. Native tests run against a disposable copy
with that exact HEAD. New build outputs may be created, but changes/deletions/mode changes
to existing source are rejected after all supervised descendants stop. Test artifacts are
never imported into publication. This is before/after integrity for owner-trusted native
code, not read-only mounts or adversarial continuous-integrity proof. Temporary malicious
source mutation/restoration or same-UID supervisor tampering is outside that trust model.
Optional OCI has read-only source and an OS-separated outer receipt.

Supervisor records actual exit, not candidate PASS/JSON. Success requires zero exit, no
cancellation/timeout/capture/source failure and proved supervised termination. Passing tests
proves their execution under the selected trust model, not universal code correctness.
Native mode does not claim unforgeable receipts against same-UID attacks.

Publish rechecks scope/policy, successful validation, unchanged checkpoint and expected
old head. Publish the frozen commit, never regenerate it. Unique publication per validation
survives different request IDs. GitHub identity is immutable repository ID plus exact HTTPS
URL/full ref; local bare fixture identity is device/inode. No guessed targets or wildcard mutation commands. Managed namespace grants resolve to one
owned exact ref before effects.

No force push. Trusted pre-push hook checks actual advertised old/new/ref; ordinary receive-pack
CASes that old OID. Local bare publication uses explicit old-OID update-ref. Lost response is
reconciled by exact new head or verified descendant under enrolled no-rewrite/no-delete
policy. Old head alone cannot prove a prior sender will not publish; retain unknown.
Admin rewrites require reconciliation. Native programs must not bypass the protocol with
owner credentials: prevention of malicious same-UID access requires a real OS credential
boundary, which this default does not claim.

## 8. Optional remote execution and operations

SSH/OCI is explicit and optional; target/host key/script digest/image/spool are enrolled
only when selected. Pending SSH operations retain their adopted backend across upgrades.
No remote failure triggers native execution. Live OCI isolation/network qualification
is required only for claims about that backend, never for the native coding path.

Default topology: Termux Python/Git/SQLite/controller + native supervisors + localhost MCP
+ outbound OpenAI Secure MCP Tunnel. MCP is pinned to **2026-07-28**, not a relabeled
legacy initialize protocol. Each authenticated POST carries version/capability metadata
and matching method/version/name headers; header mismatches fail before tool admission.
server/discover is optional for clients, not a required handshake. Results are complete
JSON envelopes; discovery/tool lists carry explicit private zero-TTL cache metadata.
The exact envelope/error profile is in contracts/tools.schema.json x-mcp.

Core HTTP has no initialize/initialized, transport session, GET/DELETE stream, SSE resume or automatic
protocol downgrade. Unimplemented client notifications are rejected. The server does not
advertise subscriptions, sampling, elicitation, tasks or MRTR input requests. GET healthz
is liveness, not MCP. HTTP request IDs and clientInfo are not durable mutation identity or
authority. Reconnect never cancels/relaunches an already accepted operation: these calls
return durable operation handles, not request-scoped SSE jobs. No generic transport framework.

OpenAI documents Streamable HTTP and private Secure MCP Tunnel, but that does not establish
a live ChatGPT host's acceptance of this exact protocol revision or bearer forwarding.
Local official-SDK interoperability and actual host acceptance are separate evidence.
If a host only speaks an older protocol, report that mismatch; do not silently downgrade
the user-selected version or claim a host-supported revision without observation.

For an explicitly selected Local Codex client that requires legacy MCP, the optional
`tdev.codex_bridge` stdio adapter implements the 2025-11-25 initialize/list/call/ping subset
and forwards once to fixed localhost HTTP with 2026-07-28 metadata. It preserves public tool
schemas, fixed host-hint annotations, arguments and durable request IDs; it translates only the
transport lifecycle/envelope. Its bearer comes from a private operator file or environment,
never candidate source/argv. It cannot select remote targets, grant authority, execute code,
produce receipts, retry an uncertain call or cancel work on transport disconnect. No new
durable owner, public tool or implicit downgrade. The Tunnel Codex plugin manages Tunnel
runtimes; installing it alone does not register tdev tools with Codex.

Runit services and bounded logging are separate from coding calls. Inactive installation
stages verified bundles and DOWN templates. The operator installer registers tdev/tdev-tunnel
with installation identity/root and exact launcher hashes. Unknown owners are never inferred
from names. Explicit legacy retirement requires the current script digest and retains the old
directory outside the live graph. New launchers resolve/verify active source at every restart;
controller health includes PID and bundle identity. Live checks bind the supervised process to
its actual arguments/environment and the tunnel to its pinned executable/profile and successful
control-plane poll. Public liveness metadata grants no authorization.

An advisory shared admission lock surrounds API dispatch. The installer exclusively acquires
it to durably place a maintenance marker, then releases it so observations remain available.
Mutations while fenced fail explicitly; outstanding/unknown operations block installation.
Install/update/uninstall serialize with root and shared-service locks, journal before changes,
stop owned services, and switch only compatible bundles. Recovery restores old files/pointer
and desired state before clearing the fence. A process interruption leaves recoverable intent;
there is no claim of atomic two-directory filesystem replacement. Initial takeover is an
explicit operator action with private recovery receipts; ordinary updates use owned runit
services. A persisted DOWN marker survives shared-supervisor recovery. termux-services owns
root recovery; tdev does not duplicate it or silently install shared infrastructure.
Production activation needs user authority. Bundle verification is not protection from
hostile same-UID code. Native runner is included without extra executor enrollment.

### Native project deployment

`tdev_deploy` adds a concrete target adapter rather than treating Git publication or development
processes as deployment. An operator delegates a Termux target with a `tdev-app-` service prefix
once per principal. Project authority and current target identity gate admissions, inspection
and replay. Targets cannot address arbitrary service names or replace tdev/tdev-tunnel. A named
principal/target deployment owns one generated service name and a persistent deployment row;
source tasks can close while that service continues independently. Deployment mutations are
retained operations, with per-deployment writer ownership and revision CAS. `targets`, paged
`list`, and `inspect` require no source task. A sole delegated target resolves automatically.

Release selects a succeeded validation and its exact frozen candidate, rechecks the adopted
validation policy, and materializes only that source tree into a content-identified release.
The manifest binds candidate, validation ID, source paths/bytes/modes, launch command, adopted
non-secret environment and readiness probe. This first adapter is a **source release**: it does
not freeze dependencies, compiler outputs or the mutable task venv, and does not infer that
validation tested the separate launch command. Applications must run from the source release
with installed host tooling/adopted dependency paths. Build-artifact packaging is future work.
Publication of source is independent and is not required to deploy a validated candidate.

The runit service uses a pinned controller-bundle runtime path, verifies source at each start,
and records supervisor/child PID start identities plus release identity. The child receives a
clean environment, private persistent HOME/TMP, TDEV_DATA_DIR for writable data and TDEV_RELEASE.
Source additions, deletion, byte/mode changes reject subsequent verification; persistent data
must live outside the release. The child is a foreground service, not a daemonizing script;
TERM gets a bounded grace period, followed by descendant cleanup. Runit restarts natural/crash
exits. On supervisor loss, recorded session members are cleaned before relaunch; a launch gap
without recorded child identity fails closed instead of starting a possible duplicate. This
is owner-trusted same-UID process management, not hostile-code isolation or arbitrary daemon
recovery. Android killing the entire app remains outside a service's control.

Readiness requires the selected supervisor/child identity, source verification, HTTP 200 on
explicit loopback port/path and `X-Tdev-Release` equal to TDEV_RELEASE. A different listener
returning 200 does not suffice. The app must supply that header. There is no public ingress,
TLS, credential provisioning or arbitrary network probe in this adapter. Inspect distinguishes
running from healthy and returns bounded logs with inode generation/offset/size; rotation
requires restarting the byte cursor for the new generation. Logs use runit's bounded retention.

Before changing a service, ownership markers bind deployment ID, state root and exact run/log
scripts. Foreign/tampered directories are preserved. A durable journal precedes stop/switch/start;
failed activation restores the previous desired release, including intentional DOWN. An
interruption before a committed journal receipt also restores the previous state on observation;
a committed journal is reconciled into SQLite without restarting the service. Recovery failure
retains an unknown operation and deployment writer. Observe that original operation to retry
restoration; never submit a second release or fabricate successful readiness. External data
writes and other application effects cannot be rolled back by switching source directories.

Release updates retain the previous release for explicit rollback. Start/rollback verify the
retained source and current validation policy before activation; stop/remove can still manage
owned resources after policy or source changes. Remove stops the service and moves only its owned service
directory outside the live graph. Releases, data, logs and receipts are preserved; it is not a
purge. The additive deployment table uses the existing development state schema; older bundles
cannot manage this new surface and must not be chosen as a runtime downgrade while it is needed.
Project services pin their runner bundle, so tdev controller updates do not rewrite or restart
them; keep those bundles while their services exist. New release deployment is stop/start with
possible downtime, not a zero-downtime or multi-project transaction.

## 9. Evidence and acceptance

Termux-native subprocess tests, HTTP full coding path, restart, cancellation, environment
hygiene, exact publication and inactive packaged rehearsal are primary local evidence.
Measured results belong in LOCAL_VALIDATION; completion belongs in README. No fixture result
is hostile-code sandbox proof. Live host claims must identify the tested code/config and
annotation profile. Previously completed ChatGPT/Tunnel acceptance need not be repeated
without a relevant change; changed host-facing annotations require targeted requalification.
Local Codex qualification covers the installed client's discovery/calls and disposable
native coding/reconnect/cleanup, separately from an interactive model turn or Tunnel route.
CLI extension qualification uses ordinary exec with real exit/capture and cannot replace
mandatory validation/publication. Other MCP services currently remain independent integrations;
that evidence does not qualify future connection composition. Optional remote adapters require
acceptance only if selected.

References: [Git CAS](https://git-scm.com/docs/git-update-ref),
[Linux subreaper](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html),
[process start identity](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html),
[MCP 2026-07-28 HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover),
[OpenAI MCP server](https://developers.openai.com/plugins/build/mcp-server),
[OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
