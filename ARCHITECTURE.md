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

`tdev_artifact inspectRecipe` supplies the first packaging surface described in §8; it reads
validated source metadata and does not produce or release an artifact.

Tool annotations use the fixed tmcp host-hint scope: all twelve public tools advertise
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

Every new native command, process and source-validation admission freezes the selected operator
workingBytes budget into its execution payload and retained intent. Native child file-size limits
and sampled/final working-storage checks use that same value (subject to inherited OS hard limits).
Replay/reconnect observes the accepted budget; changing config never rewrites or relaunches an
existing operation. Legacy payloads without the field retain the runner's default. Source capture,
transfer, retained output and task dependency budgets remain separate; remote execution is unchanged.

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
The artifact-retention bundle reads schema 3, 4 and 5. Source-only state stays at 3; new artifact
build/validation/prune admission sets 5 in its transaction. Schema-4 artifact metadata gains
size/retention-time/retirement fields without deleting records; original bytes remain intact.
Missing historical sizes are explicitly unmeasured until verified accounting backfills them,
and historical minimum retention starts on upgrade. Bundles supporting only schema 3/4 cannot
be selected after schema-5 admission, even after all objects are pruned.

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

Host-specific call budgeting belongs in a caller adapter, not server admission. The optional
ChatGPT reference runner in `examples/chatgpt/run-cell.js` bounds total nested attempts, including
diagnostics/failures, and checks elapsed time before another call. It returns a continuation to
the assistant, which must receive the outer result and issue a new physical cell. It cannot
schedule that cell, extend a turn or guarantee visible delivery. Unknown operational replies
stop for reconciliation of the original identity; diagnostic failure never retries the effect.
This adapter imports no runtime diagnostics and adds no operational-core dependency or wire type.
The operation tool's discovery description carries compact ChatGPT caller guidance. These are
adjustable orchestration defaults, not server admission limits; discovery cannot force the host
to follow them. The full caller helper remains separate from the resident's operational core.

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

### Optional semantic continuity

This is the selected design, not an implemented contract. Existing task/operation recovery
above reconstructs material progress; it cannot reconstruct an unrecorded user objective or
why a model rejected an alternative. Repository purpose/design/plan documents already retain
shared project meaning. A resume note fills the smaller gap: temporary working intent spanning
tasks, projects and conversations. It does not replace those documents.

Start with a **bounded, revisioned resume note in an existing workspace**. Several named notes
may coexist for unrelated objectives; one note may reference several projects/tasks. There is
no root task, campaign, planner, semantic gate or new execution lifecycle. Closing a task does
not close its note. A conversation and a note are many-to-many; selecting a note is context
selection, not an attachment grant. There is no required durable conversation-binding table.

| Information | Authoritative owner | Note's role |
|---|---|---|
| User intent and constraints | Current user instructions; applicable repository instructions/design | Model-authored recollection with provenance, not a new permission or normative document. |
| Semantic working state | Model supplies meaning; note store owns only recorded content/revision | Objective, brief rationale, unresolved question/blocker, next intent. |
| Conversation provenance | Observed request metadata, scoped by authenticated principal | Optional unverified routing hint, never identity proof. |
| Git source/ref | Git and current provider readback | Reference to project/task/source evidence. |
| Task checkpoint | Existing task row and immutable Git checkpoint | Task reference, no second current-checkpoint pointer. |
| Operation and process | Existing intent/result; supervisor and current observation | Operation reference, no copied success/process truth. |
| Validation/publication | Existing exact candidate/policy receipt and Git readback | Validation/operation reference, never model-authored PASS. |
| Deployment | Deployment record, switch journal, retained release and target observation | Deployment reference, no desired release in a note. |
| Runtime/resource | Actual selected executor/provider/device observations | Timestamped evidence reference; refresh before reliance. |
| Authorization | Current authenticated principal, delegated config and actual OS/provider grants | None. A remembered decision cannot authorize an effect. |

Use explicit semantic updates at meaningful boundaries: objective established/changed, a costly
decision, first-order blocker found/resolved, or useful handoff. Bootstrap when enough meaning
is known, not mechanically on the first tool call. No payload on every edit/exec/status call,
no mandatory end-of-turn ceremony, no hidden chain-of-thought collection. Keep one current
objective, relevant constraints, a few decisions with one/two-sentence reasons, current
blockers/questions and next intent. Retain a rejected alternative only if it prevents costly
repetition; link durable design decisions to their repository owner instead of copying them.
Assumptions are explicitly unverified or evidence-linked, and invalidated when their dependencies
change. Objective changes replace the current objective; old revisions are historical only.

#### Minimal state and proposed surface

Prefer three actions on `tdev_workspace`: `remember`, `resume`, `forget`. These are proposed
names, not advertised tools. `remember` creates/replaces/archives a named note with expected
note revision and request identity; `resume` discovers candidates or reads a selected note;
`forget` removes only that note's semantic records. Existing workspace revision and lifecycle
are not changed by note updates. Contract changes ship only with implementation/tests.

Use a separately opened optional local `continuity.sqlite`, with two tables: note identity/
workspace/principal/current revision, and bounded immutable note revisions holding content,
typed references, timestamp, format revision and request digest/result for replay. No separate
objective, decision, conversation, event, plan or task-link tables initially. No foreign keys,
attached database or write transaction spanning the product store and this sidecar. References
are resolved through current product authority; they may be unavailable or retired. Note IDs
must never be reused after deletion, so an old expected revision cannot overwrite a new note.

Initial bounds to qualify: 8 KiB UTF-8 per capsule, at most 32 typed references, five candidate
titles per discovery page, one capsule per response. These are byte limits, not token promises.
Keep the current revision and up to eight previous revisions; discard historical revisions
older than 30 days. Active current content survives age alone but is visibly dated; archive/
forget is explicit. Apply configurable total storage limits and bounded pagination; refuse only
semantic writes when full. Retained request identities replay exactly; an older unavailable
receipt returns stale/expired rather than accepting an old write. Hash/content mismatch on a
retained request conflicts. Atomic revision CAS prevents concurrent conversations losing updates.

Store no complete user prompts, assistant transcripts, raw tool stdout, auth headers, secrets,
private keys or opaque Codex compaction payloads. A concise user-intent gist is sufficient for
the default path. Optional external-agent provenance is a bounded provider/session reference,
not a profile scan or session import. Privacy filtering is not a claim that arbitrary model text
can be perfectly sanitized; user-selected content remains private and explicitly deletable.
Forget covers semantic revisions/provenance; document any external backup retention separately.

#### Resume and host boundary

Discover within current principal/workspace/project authority using names and returned handles.
Return candidate titles before loading unrelated prose; the model chooses a relevant note or
starts fresh. No implicit hard attach and no internal-ID copying by the user. Without a known
workspace, use the existing workspace listing/defaults. Normal tools keep their existing outputs;
host instructions/tool descriptions teach the model to call resume when continuing work.
This requires an actual host tool interaction: tdev cannot inject into an unopened ChatGPT
conversation, force the host to call a tool, or replace its context window.

Return semantic content separately from bounded, newly read observations of referenced material
state. Do not scan every workspace/resource or claim an atomic global frontier. Mark observation
time, owner, truncation, unavailable references and unknown effects. Read-only resume must not
invoke recovery-bearing task/deployment inspection implicitly: pending reconciliation is shown
as such and handled through the existing operation path. Before an effect, rebind the relevant
source, grants, policy and runtime via existing admission checks; a note's next intent is advice.
Conflicting current instructions or evidence supersede a note. Referenced project revocation
must not leak its facts; if project-sensitive prose cannot be safely separated, withhold the
whole note until authorized access returns. Workspace membership is not a grant.

`openai/subject` and `openai/session`, if actually supplied, are optional, size-bounded ingress
provenance. Do not equate them with transport `MCP-Session-Id`, a source task or authentication.
Bearer/principal checks precede discovery; caller-supplied metadata cannot expand scope or prove
the caller is ChatGPT. If later retained, prefer principal-scoped digests over raw identifiers;
neither provenance nor missing metadata affects core request identity/replay. Current ingress
does not propagate these fields. Add preservation only after a redacted direct-host probe proves
value; deterministic fixtures cannot prove current ChatGPT behaviour. Metadata is unnecessary
for the first note implementation, including use from Local Codex and other MCP clients.

#### Compaction and failure isolation

Initially the active model rewrites the bounded current note: this is enough context reduction
without a full semantic journal, background model, token-window detector or additional LLM bill.
When a note approaches its byte budget, compress before its next optional update. Keep brief
evidence references and uncertainties; format validation cannot certify summary truth. Concurrent
revision changes reject replacement for re-read/merge, never silently lose the other writer.

Only measured loss of useful decision history justifies an optional bounded semantic journal.
Then record meaningful changes, not every tool event; compact a named revision/event prefix and
preserve later events as a suffix. Install a capsule atomically against the covered revision.
Do not copy Codex private formats, guardian machinery or transcript retention. No summary is
allowed to replace current source/runtime authority or turn a model claim into permission.

Core startup, authentication, read/edit/exec/operation/validate/publish/deploy and existing
workspace/project/task actions must never require the sidecar. Missing, corrupt, full, locked,
disabled or incompatible continuity storage affects only semantic actions; bound its I/O time
and isolate its exceptions. Enforce its own storage budget before writes and never hold core
locks while accessing it. This does not promise immunity to host-wide disk/OS failure shared by
all local software. Do not turn corrupt history into a successful empty-context claim
or silently repair by destroying evidence. A failed optional update cannot swallow or change an
already completed core result. Removing the entire sidecar loses notes only: Git, tasks,
operations, deployments, cleanup ownership and core authorization remain usable and unchanged.
This is failure isolation for optional context, not fail-open authorization.

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

### Local lifecycle diagnostics

The operational core owns admission, effects and recovery; optional diagnostic adapters own
observation and incidents. Cold startup with diagnostics `off` does not import the collector,
create diagnostic files or start its workers. Observation failures are isolated from normal tool
responses. `tdev_diagnostics` can inspect state without activating collection; authorized manual
activation lazily loads the adapter. Once loaded, bounded workers/control remain available for
incident delivery and later capture even when observation returns to off. No diagnostic decision
retries, cancels, alters provider policy or edits production work.

| Mode | Healthy operation | Transition |
|---|---|---|
| off | No collection or automatic triggers; cold startup has no diagnostic runtime | Authorized activation starts a bounded trace; expiry returns to off |
| watch | Bounded metadata ring and authenticated dispatch timing; no response hashing or continuous event-log stream | Classified triggers start bounded trace; expiry returns to watch |
| trace | Detailed HTTP stages, keyed identity/payload digests, four rotating 2 MiB segments | Time budget 1–300 seconds; no trigger extends an existing lease |

Operator config selects startup off/watch and trace duration, slow-dispatch threshold and trigger
cooldown. CLI mode is an explicit startup override; CLI trace returns to watch. Values/defaults
are owned by the config contract. The currently selected diagnostic installation uses watch.
The policy is fixed at adapter construction; changing startup policy uses the controlled update
path. Principal activation grants are checked freshly on every tool call.

Automatic triggers are authenticated dispatch exceptions, response-write/serialization failures,
explicit unknown-effect tool errors and dispatch duration exceeding the selected threshold.
Slow dispatch is a candidate signal, not proof of a stalled worker. Idle ChatGPT, pre-authentication
stalls, a frozen UI and private host continuation are not inferred from missing calls. Watch
requires an explicit policy choice. A separate timer expires tracing even if disk storage blocks;
Linux/Android boottime includes device suspension. Explicit stop ends capture and temporarily
suppresses automatic retriggering. Manual activation remains possible. Repeated requestId within
retained history replays without extending expiry; changing its duration conflicts. Restart keeps
incident history but terminalizes previously active captures as interrupted; it never resumes a lease.

Request hooks update bounded memory and a nonblocking writer queue. Ring, active-request and
queue capacities are 256. Drop/overwrite/eviction/error counters expose evidence loss. Detailed
stages distinguish parsing, auth, body input, dispatch, serialization, headers and body writes.
Watch has less pre-trigger detail. A private installation-local key maintains opaque correlation
across restarts; key generation, process instance, clocks and package identity remain distinct.
Raw arguments, output, auth, filesystem paths and exception text are excluded. Runtime identity
is recorded at startup and detailed request entry. No tag confers ownership or authority.

Incidents are principal-scoped and capped at 32 globally. Each retains its trigger, capture state,
notification state and a bounded local evidence excerpt. Retention prefers acknowledged records;
otherwise the oldest record is evicted and counted. No operational receipts are removed. A separate
writer atomically replaces a private bounded incident file. Persistence is best effort: callers see
pending/error state; a crash can lose recent offers/acknowledgments. Corrupt/incompatible incident
files are preserved and storage is disabled rather than silently replacing evidence. Expired records
remain available until the retention bound evicts them. Capture log rotation remains independent.

Server-observed tool errors, authenticated protocol errors, dispatch/response failures, uncertain
effects and slow dispatches also increment bounded principal-scoped aggregate counters. Counting
precedes incident cooldown/deduplication, so repeated error responses remain measurable even when
only one capture is started. Categories overlap (an unknown-effect tool error counts in both);
these are observed signals, not counts of distinct operations. Successful traffic does not dirty
the aggregate store. At most 32 principal aggregate records are retained; least-recently-updated
eviction is counted. Counters survive incident eviction and ordinary restart, but not aggregation
eviction, missing storage or unflushed crashes. Since/last-observed times bound each record; no
historical counts are fabricated when upgrading existing incidents.

Authorized `report` records a caller-observed category and starts a bounded capture. It stores no
free text, error message, conversation, command or raw request identity. Reports of visible stalls,
transport errors, host call limits, unexpected turn ends and control mismatches are unverified
client observations and are counted separately from server signals. Receipt time is not the time
of the original visible failure. Request replay within retained incident history neither recounts
nor extends capture; a conflicting category/action is rejected. `inspect view=summary` returns
counts and pending/exhausted totals without the incident list. Full inspect remains the recovery
path to an incident ID. Reading counts does not acknowledge or reset them.

#### Control, notifications and delivery boundary

Authorized `mark` adds a caller execution witness without creating an incident or activating a
capture. It is a caller assertion, not cryptographic attestation of ChatGPT: only the actual
ordered caller script (await the target response, then await the marker) establishes its meaning.
It records keyed run/cell/principal tags, a run sequence, phase and optional call ordinal/request
reference. Watch places it in the bounded memory ring; trace also queues it to the existing
best-effort stream. Off rejects it without loading the collector. A detached witness never
creates an active HTTP request. The local observer only samples it; the local socket cannot write it.

The marker identity is principal + process instance + run + sequence, deliberately separate from
durable operational requestId replay. Sequences strictly increase across cells of one run; gaps
are allowed. Identical retained retries return the original timestamp/event without another
witness; conflicting retained retries fail. Evicted older sequences fail rather than fabricate new
progress. Process-local watermarks for at most 32 runs never evict, while receipts have a 256-entry
cache with counted eviction. At capacity new runs fail; existing runs continue. Use one run across
cells, not a new run per request. Restart creates a new instance and rejects old markers; neither
disk history nor a lost reply is silently reinterpreted as a new arrival. No production restart is
required or justified just to clear a diagnostic limit. Off rejects even retained marker retries.

In watch/trace, an optional tools/call response receipt identifies its process and HTTP request.
The caller can echo that request reference after checking the instance, enabling an exact join
with server records when both survive. The reference remains caller-supplied, not server proof of
receipt. If the host adapter strips metadata, phase/ordinal plus the saved script still establish
a logical execution frontier, but cannot identify a particular concurrent transport request.
Notification rendering/serialization and diagnostic receipt failures cannot discard the normal
operational response. The operational core imports no diagnostic implementation.

Server HTTP completion, caller execution and visible UI delivery remain separate facts. A
tool_return witness placed after a fulfilled await narrows a response-delivery hypothesis; it
does not prove the user saw progress. cell_exit is a point before the outer cell result, not proof
of its delivery or next-cell scheduling. Missing markers can reflect instrumentation failure,
admission limits, cancellation, ring overwrite or lost storage as well as continuation failure.
Do not automatically classify a root cause from their absence. Every marker adds a round trip and
host call-budget pressure; use sparse bounded probes and an uninstrumented comparison, never a
production requirement to mark every tool. Marker failure must not cause operational retry/cancel.

`tdev_diagnostics` inspects/acknowledges only the current principal's incidents. Reporting/activation/stop
control runtime-wide collection; those controls and mark require an explicit diagnostic grant plus fresh authorization;
installation maintenance fences these controls. Global mode/expiry/storage health are observable.
Raw evidence is local-operator-only. A same-UID Unix socket offers snapshot, bounded activation
and stop without MCP/controller locks. It accepts no commands, paths or arbitrary execution.
Local activation incidents belong to the local operator, not an inferred ChatGPT principal.

Unacknowledged alerts are offered in subsequent tools/call responses as a short extra text block
and `io.tdev/diagnostics` result metadata, without altering structured operational receipts. At most
three alerts are offered per response, prioritizing never-offered then least-offered eligible
incidents. Each incident has at most eight automatic offers; delay doubles from 15 seconds to a
300-second cap. Eligibility uses elapsed time during a process lifetime. Restart reconstructs a
remaining delay from stored wall time, clamped to one delay so backward clock changes cannot
silence an incident indefinitely. Old counts exceeding eight are retained and marked exhausted.
Exhaustion is not acknowledgment; inspection and acknowledgment remain available. Compact text
names the ID/reason/capture while structured metadata carries delivery details. Failed socket
writes do not acknowledge delivery. Explicit principal-scoped acknowledgment is idempotent;
model acknowledgment is not proof that the user saw the message. Local Codex's bridge preserves
this envelope content. Exact fields are owned by the tool contract.

Current HTTP supports responses to requests; it cannot wake a stopped ChatGPT turn or supply an
unsolicited guaranteed push. If the channel is unavailable, local persistence and later inspection
are the recovery path. Server socket-write completion proves neither host receipt, JS continuation
nor visible progress. Backend completion and Local Codex success are separate qualification evidence.

Operator export pins a new private directory containing a live snapshot, retained incidents and
bounded rotated files with hashes/coverage. It never pauses work or exports the correlation key.
The copy is non-atomic: rotation can omit/duplicate segments and partial records are reported.
Snapshot is independent of the disk writer; copying still needs working source/destination storage.
Same-UID access follows the existing native trust boundary, not hostile-code isolation. These are
bounded diagnostics, not a crash-durable audit ledger or an extension of ChatGPT turn lifetime.

An explicitly launched `tdev.diagnostic_observer` process samples the same-UID socket with bounded
timeouts into a new private directory. It never starts the controller, activates capture or sends
MCP calls. Duration, interval, byte and sample ceilings bound overhead; timeout/unavailability is
recorded instead of inferred as a specific root cause. A whole-process suspension can block the
in-process socket while the external observer still records that gap. Retained snapshots include
runtime/process/key identity, counters and bounded recent records for correlation; snapshots may
overlap and are not an atomic history. The operator records actual host/visible observations
separately. No always-on observer is added to the resident service graph.

Observer snapshots also carry a bounded derived frontier. Each process generation's first
snapshot is a historical baseline; retained witnesses are labelled as such and request counters
start after it. Subsequent events are deduplicated by instance/eventId, with missing events,
regressions, invalid records and generation changes exposed. At most 32 latest run witnesses
are retained in the summary. Parsed-request counts include markers and other clients; they do
not identify a physical ChatGPT cell's attempts. Original snapshots remain intact. The separate
continuous operator command uses the same reducer and records sampler bundle/script identity;
neither observer imports into the server, calls MCP, acknowledges incidents or infers UI health.

Diagnostic storage revision 2 accepts existing revision-1 incidents and retains their IDs,
acknowledgments and offer counts. Prior bundles do not understand revision 2: a rollback preserves
the file and disables diagnostic persistence with an explicit storage error. Operational state
and effects do not depend on this sidecar. Do not delete evidence to make a downgrade look healthy.

Diagnostic mode/grant updates can accompany a resident update. The installer journals the old
private config, checks its expected digest, writes the new config only after stopping owned
services, and restores it before restarting the old bundle on failure. A concurrent config edit
causes an explicit conflict. Successful updates retain a matching config rollback receipt so an
older bundle can restart with its compatible config. No credentials or provider enrollment change.

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
with installed host tooling/adopted dependency paths. Retained build-artifact deployment is the
separate explicit variant described below.
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

### General build artifacts and optional Android capabilities

The recipe/identity, retained native build, artifact validation and Termux service integration
below are implemented, including explicit export/prune. Python runtime qualification covers the
selected layout; other runtime/target adapters remain planned. An artifact is a retained build output independent
of any deployment target; separate validation proves its adopted checks. It may be a file set, archive, binary,
service package, APK or AAB, with no foreground command or HTTP probe. Target adapters add
launch/install/readiness requirements; the existing Termux HTTP adapter keeps its exact checks.
Distinguish build executor/toolchain identity, artifact target platform/ABI and deployment target.
Termux-compatible host tools may produce Android artifacts; another explicitly selected build
runtime may be needed for unsupported toolchains. Never silently substitute a remote runtime.

Preserve source → dependencies/toolchain → build → test/validate → artifact → optional signing/
packaging → verify final bytes → optional install/deploy → live verification. Build and signing
can be combined by a recipe, but the final digest and verification must cover the signed output;
a later signature or package transform creates a new artifact linked to its input. Signing keys
and passwords remain outside source, artifacts, notes and receipts. Public certificate identity
and an authorized signer reference are provenance, not embedded secret material. Build success,
signature verification, install success and live behaviour are separate claims. Android AAB is
not directly installed as an APK. No Android-specific packaging framework is required now.

#### Implemented recipe and identity foundation

`inspectRecipe` selects an existing successful source validation and reads `tdev-package.json`
(or an explicit project-relative path) from its immutable candidate. It requires current
principal/repository authority, exact repository identity, current source-validation policy
and a matching terminal/stopped successful receipt. It does not reconcile an unknown operation,
run recipe commands, fetch dependencies, inspect live toolchains or require a deployment grant.
Later task edits/close do not change the selected candidate. It is an observation during an
installation admission fence, with no operation row or replay identity of its own.

Strict bounded recipe/schema checks reject duplicate JSON keys, extra authority/policy fields,
traversal, overlapping/case-colliding paths, symlink inputs, unpinned dependency entries and
credential/query-bearing dependency URLs. The initial acquisition description supports public
HTTPS inputs only. Inspection reports build/runtime tool and platform requirements; preparation
checks the native build host and declared executables, not eventual runtime compatibility. Service launch metadata is conditional; archive,
APK/AAB and other non-service descriptions need no entrypoint or readiness endpoint. Merely
accepting a kind is not qualification of its toolchain. Source/input manifests initially cover
regular files only; unsupported symlinks fail rather than acquiring undocumented semantics.

The inspection binds the source tree, repository identity, raw recipe digest and declared input
path/mode/size/content hashes. The whole source tree remains bound even if the explicit input
list omits a source file. Candidate/validation identity and current source/artifact policy
digests live in the inspection binding, not in artifact content identity. Internal manifest
validation binds source/recipe and exact exported file metadata; receipt IDs, timestamps and
current policy do not change retained content identity. A manifest/hash alone is not evidence
of captured bytes or successful execution. The trusted sealer captures/verifies bytes, and build admission rederives the binding from
current owners rather than trusting a supplied inspection/hash. No public API accepts a caller-authored manifest or PASS result.

The adopted artifact check command is the repository/project policy's `artifactValidation`,
defaulting to `validation`; recipes cannot select or waive it. Its digest has an artifact
subject and includes the executor/tooling environment. Changing only this policy does not
invalidate source validation; it changes the artifact inspection binding. Delegated policies
are reread on each call, including removal of an override.
New source validation intents explicitly identify their subject; retained earlier source
receipts remain usable. Source publication and source-release activation/start/rollback reject
an artifact-subject receipt. Only the explicit artifact release variant consumes artifact validation.

#### Retained native builds

`prepare` accepts a source validation and request identity, rechecks current authority/policy,
and creates one ordinary artifact operation. It never locks or advances the source task.
The native supervisor owns dispatch, process identity, deadlines/cancellation, bounded logs and
stop proof. Accepted unknown work is observed, never relaunched. A principal can have at most
eight outstanding builds; task inspection and artifact listing expose them independently of
history pagination. Closed tasks retain inspection/control access under current project grants.
A dispatch reservation gap or lost supervisor remains unknown; an operator investigation is
required when stop proof cannot be recovered. No synthetic success or automatic rebuild repairs it.

Builds use fresh source/HOME/scratch and no task environment or adopted toolingEnvironment.
The recipe must pin `sh` and its declared executables. Platform is OS/architecture/ABI;
executable digests are checked before admission and again in the child. This does not attest
shared libraries, SDK data, every subprocess or the whole host image. Native execution remains
same-UID with host network: a recipe can use undeclared host/network resources, so retained-byte
integrity is guaranteed, not hermeticity or reproducible independent builds. Runtime compatibility
qualification is a separate slice. Private dependency acquisition is not supported yet.

Public HTTPS distributions are fetched without ambient proxy/auth/cookie configuration;
redirects fail explicitly. Each digest is checked before the command and again after it.
Named files are supplied through `TDEV_INPUT_DIR`; `TDEV_BUILD_DIR` holds disposable intermediates.
After stopped successful execution, source content/modes must be unchanged; only declared exports
are captured. New files outside exports fail. Symlinks, special files, hardlinks, aliases, missing
exports and oversized outputs fail. Outputs and selected distributions are retained together;
there is no resolver or implicit transitive download. Recipes must enumerate their acquisition
closure and invoke their package manager against those selected inputs.

Operator `artifactLimits` independently bounds exported bytes, acquired bytes, output files,
working storage and build/verification deadlines. Defaults preserve 64 MiB output, 64 MiB input,
4,096 files and 128 MiB sampled working storage; manifest size remains capped at 1 MiB.
Output/input/file settings can lower these format ceilings; working storage can be raised within
its contract bound. Source-copy limits are unchanged. Sealing temporarily uses additional copies.
These conservative limits do not qualify large Android toolchains or hostile-process containment.

The worker fsyncs a private staged capture and atomically renames it. Reconciliation verifies
that capture, copies/verifies/fsyncs an independently retained content-addressed object, then
commits its build pin and terminal operation receipt together. The artifact table stores
operation identity, digest, measured retained size, retention start and optional prune operation;
operation already owns principal, repository identity and
source-validation provenance. A crash after object rename but before receipt commit can finish
that transaction by observation. Unreferenced objects alone never prove successful execution.
A copy/disk failure preserves unknown evidence and can retry sealing without another build.
`inspect` checks bytes and manifest anew. Its derived `artifactValidated` and validation handle
require a successful check under current policy, valid source provenance and compatible service
runtime; byte integrity alone is insufficient. No caller-supplied manifest is trusted.

Operation `retire` requires reconciled stop proof and removes build scratch/capture, preserving
the retained object and receipt. Task close/reset does not delete it. There is no automatic GC;
only explicit previewed pruning can release retained references. Signed transformations remain
planned work.

#### Python layout and runtime compatibility

The reference `examples/python-package` project installs a content-pinned pure-Python wheel
into a fresh artifact-local `dist/python` using no-index/no-deps/hash-checked pip installation.
Its project-owned launcher uses `python -I -S -B`, inserts only the artifact's dependency/app
paths alongside the selected interpreter's standard library, and never processes `.pth` files.
This qualifies that concrete layout, not every arbitrary Python recipe. Generated pip console
wrappers are discarded; module/metadata entrypoints run through the artifact-relative launcher.
No live venv, development cache, host site-packages or build-root path is a runtime dependency.
Package data/entrypoints, missing dependency failure, external writable data and absence of
bytecode/source mutations are exercised after relocation and build/development root removal.

Service runtime requirements can additionally list exact host files (not exported files),
including shared libraries. `inspect` rechecks platform, declared tool digests and these file
hashes and reports compatibility separately from retained-byte integrity. A changed/missing
runtime does not erase build success or prevent inspection/retirement. Requirements are
recipe-bound, not an instruction to install/repair the host. Runtime inspection performs no
rebuild, installation or process activation. Restore the pinned runtime or explicitly prepare
and validate a new artifact; application rollback alone cannot undo host changes.

The internal service-launch helper rechecks retained bytes and runtime requirements, derives
argv/cwd/environment from the manifest, and requires HOME/TMP/data outside retained storage.
It returns launch inputs to a supervisor; it introduces no second execution lifecycle or public
run tool. Artifact verification/start/rollback call it afresh. Existing source-only deployments
retain their separate source receipt path. Generic shell commands do not
receive automatic Python import isolation; the tested project's explicit launcher provides it.

Attestation is intentionally bounded: executable files, OS/architecture/ABI and listed library
files are checked. Python standard-library content, pip modules used during build, unlisted
libraries/future dlopen inputs and the OS image remain external assumptions. Native extensions
and other Python layouts require separate qualification; do not infer portability from this
pure-Python example. Hash equality in two measured independent builds is fixture evidence,
not a universal reproducibility guarantee or permission to weaken content checks.

#### Artifact validation and packaged release

`tdev_validate subject=artifact` creates an ordinary validation operation tied to a retained
build, original source receipt, candidate, content digest and current adopted artifact policy.
It neither reserves the source writer nor requires the source task to remain open. A principal
may have eight outstanding artifact validations in addition to eight builds; bounded task and
artifact inspection expose both. Existing operation observation/cancel/retire controls apply.

The native worker verifies retained storage, copies it into disposable validation storage and
rechecks both copies after all descendants stop. The mandatory check runs in the artifact layout
with writable HOME/TMP/data outside those bytes, without task dependencies or toolingEnvironment.
File artifacts need no service/HTTP target. Service artifacts launch the manifest command and
must remain alive through the check; readiness requires HTTP 200 and the validation operation's
`X-Tdev-Release`. A separate loopback health port becomes `TDEV_PORT`, allowing verification while
the previous deployment serves. This is sampled native execution, not hostile-code containment.
Exit zero alone cannot produce a successful receipt: identity, stop proof, unchanged content,
service readiness where applicable and the worker's artifact-check result must agree.

`tdev_deploy release subject=artifact` consumes that receipt and copies verified retained bytes
into the existing immutable release layout. It permits no command override. The health path must
match verification; the target port may differ and is passed as `TDEV_PORT`. Artifact content
identity and deployment release identity remain separate; `TDEV_RELEASE` and the HTTP header
identify the deployment release. Writable application data stays outside releases and survives
update/rollback/removal. Start/rollback do not acquire dependencies or rebuild packages.

Admission and pre-dispatch recovery recheck receipt/source/policy joins, bytes and host runtime
before stopping an existing service. The native supervisor rechecks bytes/runtime on every launch.
Failed or interrupted switching restores the previous desired release through the existing
deployment journal. If its current policy/runtime can no longer be satisfied, recovery remains
explicitly unknown; it does not fabricate a successful rollback. Stop/remove still work after
package damage. Validation/build scratch retirement cannot delete retained or deployed bytes.

#### Retention, export and explicit pruning

The build handle owns a retained reference, not necessarily an exclusive physical object.
Identical content can have multiple build references. `export` returns bounded base64 pages
from one declared exported file after checking retained integrity, with its expected whole-file
hash and offsets. It writes no caller-selected destination, creates no archive implicitly and
needs no service target. Large downloads incur repeated integrity checks; this initial path
is not a bulk-transfer or public-download service. Clients verify the assembled file hash.

`usage` pages authorized retained metadata, deduplicating content within each page only. Its
size excludes native scratch, sealing temporaries and deployment release copies; it does not
claim global physical disk usage. `list` and original build status expose retained/pruned state
without changing historical execution success. Inspecting a pruned build returns its content
identity and prune-operation reference; old validation cannot activate missing/retired storage.

`prunePreview` reports current/previous deployment references, in-flight validation/switch
references, shared content and the operator minimum retention period. Stopped deployments retain
their pins. Removed deployments no longer need activation pins, but remove itself never prunes
bytes or user data. Pending/unknown builds retain their own native capture and capacity reservation; their
uncompleted handles cannot be pruned. They do not block cleanup of unrelated completed builds.
If an identical retained object is pruned before a pending seal commits, reconciliation restores
it from that build's independently owned capture without re-executing the build. The preview token is not deletion authority; `prune` requires current
principal/project authority and rechecks every pin and current policy at admission.

Artifact admissions, exports, reconciliation and deployment switches share a controller-local
reentrant mutex; the existing process lock still ensures one controller. This serializes artifact
lifecycle changes, not ordinary source editing/execution. The mutex precedes per-operation
reconciliation locks. Native workers write their own scratch captures and never the retained store.
No SQLite transaction spans copying, deletion or service health waits.

Prune acceptance atomically records an ordinary operation and retires the selected build reference.
If no other retained reference needs the object, reconciliation renames it to an operation-owned
tombstone, fsyncs, removes it and commits completion. Interruptions retain unknown evidence and
resume through the original operation; no new deletion request is required. A newly built equal
object/reference must survive tombstone cleanup. Symlink roots/conflicting tombstones fail closed.
Other build references keep shared content alive. Eight pending prunes per principal plus eight
builds/eight artifact validations bound outstanding discovery to 24 entries. There is no automatic GC.

The default retained-object admission budget is 2 GiB. Builds reserve their maximum output/input
plus manifest bytes before dispatch; accepted unknown builds keep that reservation. Retained
objects count once by digest; unfinished prunes retain conservative capacity reservations.
Exhaustion rejects a new build without evicting data. Lowering a policy affects future admissions,
not the resource promise already persisted for an accepted execution. Per-operation native working
storage remains sampled; byte reservations do not replace available filesystem capacity checks.
Default minimum retention is zero (explicit pruning only); operators may require a longer age.

Source-task-independent host access belongs to a concrete resource adapter, not continuity.
The first useful surface should provide bounded native filesystem/process/toolchain observations
within delegated host roots, without a dummy Git task. Existing same-UID exec is powerful but
does not provide source-free targeting, bounded discovery or a stable resource observation
contract. Establish those only for selected use cases; do not add `host`, `resource` and
`connection` tool families at once. Prefer a narrow `tdev_resource` proposal for native inspection
when implemented; a connection describes how that resource is reached and authorized, not a
second owner of its state. Shared identity/provenance/freshness conventions do not require a
universal gateway or a joint context/resource database.

Termux's native authority covers its app-UID filesystem/process scope and available permitted
Android interfaces, not system/root privileges, other apps' private data or arbitrary UI control.
Termux:API supplies selected Android APIs only with its compatible app and required grants.
A future optional Android companion is feasible for user-enabled Accessibility tree/gestures,
app intents, notification access and permitted screen observation. MediaProjection has its own
user-consent/session requirements; clipboard/background access and secure UI remain restricted.
Use authenticated, revocable local control and bounded observe → act → observe operations;
dispatch success alone is not proof of the intended UI effect. No IPC design is fixed here.

ADB/delegated shell (including Shizuku), Device Owner and root are separate optional authority
adapters if a real task requires them; none grants every capability or follows from installing
a companion. Android app building/signing does not require Android-use. Missing companion,
Accessibility, Termux:API, ADB, Shizuku, root or continuity must leave the core development path
usable. Only the selected unsupported/unavailable/unauthorized Android operation fails. Adapter
revocation must preserve observation/cleanup evidence without silently rerouting an accepted
effect. Implement no Android-use subsystem before the complete development path is qualified.

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
