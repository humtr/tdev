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

`tdev_find` resolves retained source work from human project names and task labels.
Delegated local project display names derive from the enrolled checkout relative to its current
policy root; explicit configured names remain authoritative. The old exact remote locator also
resolves, without guessing a basename, changing enrollment or rewriting accepted receipts.
New create/connect receipts use the same name projection; replay returns the originally accepted
receipt, even when its historical display name differs from the current projection.
Duplicate names remain ambiguous. It performs bounded local reads, not executor/provider
reconciliation. Retained creation intents
supply labels; no transcript store, per-conversation current-task pointer or state migration is
needed. Multiple matches, incomplete pages and unavailable historical bindings never select a
task. Closed work remains visible by default. Returned checkpoints and receipts are a local
frontier, not live provider health or permission to mutate; exact CAS/current authority still
apply on admission. Use domain inspection for older history and detailed resource ownership.

`tdev_workspace` owns composition; `tdev_task` owns source-task lifecycle. `tdev_edit` changes
source. `tdev_operation` inspects every accepted operation and controls exec/validation
processes where applicable. Every MCP input is a closed typed root object with a
required `request` property. Its exact alternatives reuse the canonical semantic input
schemas; no flat discovery vocabulary is maintained separately. Presence/exclusion rules
use explicit positive object alternatives, because the qualified ChatGPT host lost some
negative/conditional branches even inside nested unions. The HTTP edge validates the envelope
before streaming/dispatch, then passes unchanged semantic arguments to the controller.
The controller rechecks authority and semantic validation before replay/admission. Stored
request hashes and receipts do not include the transport envelope; old accepted effects
remain recoverable without rewriting state. The terminal CLI constructs the envelope for
convenience commands; `tdev call --input` accepts exact public JSON. There is no public flat
syntax alias. Fixed host-hint annotations remain unchanged at the user's direction; these
hints do not authorize effects or describe reconciliation purity.
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
| SSH + rootless OCI outer runner | preserved isolation design for possible later qualification | external host/image/SSH maintenance, transfer/cold start and more failure points | dormant experimental backend; not advertised by the current MCP coding surface |

The source surface is task/read/edit/exec/operation/validate/publish; workspace supplies
composition and project supplies delegated local/GitHub enrollment. CLI adapters need no
additional permission registration. tdev_deploy manages validated native project services on delegated Termux targets. General
tool/runtime connection lifecycle remains future work. CLI extensions gain no MCP admin operation;
native programs nevertheless have the real app UID's authority (§3).

`tdev_artifact inspectRecipe` supplies the first packaging surface described in §8; it reads
validated source metadata and does not produce or release an artifact.

Tool annotations use the fixed tmcp host-hint scope: all public tools advertise
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
transfer, retained output and task dependency budgets remain separate. Working storage includes
private Git objects and source files; a source that fits content capacity can still require a
larger configured working budget. Rejection names the budget and its configured/observed values.
The dormant OCI backend uses the frozen working budget for its work tmpfs; its memory/tmp
quotas and qualification remain independent.

## 4. Durable state and source

Source content capacity belongs to Git tree admission/construction and the contract's execution
budgets. Immutable object sizes are checked before source acceptance; checkout double scans hash
opened files without keeping their bodies in memory, matching SHA-256 content and metadata on both scans;
the first scan writes its exact bytes to an owned temporary file for object construction,
so equal metadata around a later original-file read cannot substitute different object content;
matching content reuses its verified private object instead of writing it again, and composition/integration check the resulting tree.
Source bytes move separately from control metadata: one shallow binary pack for materialization,
and stopped capture bodies sealed with exact identities and a path/mode/content manifest.
A same-host native capture may use an owned sealed directory; transport archives carry the same
content/proof across the retained optional boundary. No second inline file-body copy belongs
in the execution request. Capture bodies require matching server-owned
stop/input evidence and stream through private Git construction before checkpoint completion.
Private temporary files, utility pipes and retained bodies have explicit cleanup owners.
Read pages and search/utility metadata retain independent caller/scan budgets; increasing source
capacity never authorizes larger model context, command working storage or task dependencies.
Large text replacement uses bounded UTF-8 carry; merge utilities receive private file inputs and
stream output. Git bulk writes use regular file input; bounded pack mapping/cache avoids keeping
a whole transferred pack resident. Git's own text merge/diff algorithms may still allocate
memory internally; this is not a native aggregate memory quota. Fetch keeps received objects
packed rather than producing whole-file loose mappings. Local upload-pack receives its own
bounded pack/large-file settings; client settings alone do not configure the sender.
Externally created large delta objects can still require Git's internal full-object decoding.


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
An unchanged captured tree retains the starting checkpoint, including on command failure;
execution history is retained in the operation receipt. Actual A→B→A source changes still
produce distinct checkpoint OIDs. A no-op command cannot invalidate a successful validation.
A command's local git commit/rebase produces file changes for capture; it does not replace
the controller's canonical source identity.

Normal persistent worktrees save copying but add partial-edit recovery/index lifetime;
tree-only pointers cannot distinguish ABA; custom content-addressed storage duplicates Git.
Keep Git plumbing plus temporary command copies. Streaming bodies and a single shallow pack keep content separate from control metadata;
copy/storage costs remain independently budgeted.

Task dependency storage survives process retirement, controller reconnect and task/workspace
close. `task resetEnvironment` explicitly removes only that task's native dependency directory,
including after close, and requires no running/unknown execution for the task. Admission is
serialized with starts; an executor lease also rejects removal while a supervisor uses it.
The retained reset intent, same-directory rename and replayed deletion recover interruption
without deleting a newly rebuilt environment on replay of a completed request. Source, job
receipts and logs are separate and retained. This extends schema-3 intents, not stored grants.

### Local checkout import, task composition and integration

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
Admission freezes the configured checkout path/identity with the original source intent; current
configuration cannot retarget a pending/completed receipt to another checkout. Replay checks that
binding without rescanning mutable files. Descriptor-relative no-follow traversal rejects linked
parent directories and special files before reading; regular file metadata is checked around the
bounded read. Detached or switched checkout HEAD fails CHECKOUT_HEAD_CHANGED. Link targets also
reject Git metadata aliases with trailing spaces/dots, matching the source-path boundary.

Task composition creates a new task on an exact enrolled project/ref from declared current
source checkpoints on that same project/ref. Each source base must be an ancestor of the new
task's base. Apply each base-to-checkpoint delta; overlapping changes must be identical or
compatible with the destination entry. Conflicting changes or file/directory collisions fail
without creating a task. Recheck declared source pointers before construction and inside the
task/receipt completion transaction. The composed checkpoint has the new base as its sole parent;
source lineage remains in the retained intent. Current source authority also gates receipt replay,
which returns the original receipt even after the sources advance. The completion recheck and
source replay checks deliberately strengthen the reference's construction-only checks.

Task integrate applies one task's delta (source base → selected source checkpoint) to another
task in the same repository. Both tasks require current access. The source checkpoint must
lie between its base and current checkpoint; source base must be an ancestor of target base.
For a newer upstream base, start a new target there and integrate the older task into it.
Ancestry observation happens outside storage; admission rereads the observed source pointer
inside its short transaction and rejects a concurrent change. After admission the selected
source checkpoint is frozen in the operation and independent source edits remain possible.
This source-pointer recheck deliberately strengthens the reference admission boundary.
Target checkpoint CAS and busy ownership prevent stale writes. Ordinary independent text changes use Git's built-in
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

The scripted installer supports Tunnel authorization plus an internal local service
credential. The guided CLI offers Bearer-required as its initial connection default. OpenAI's organization/workspace association and Tunnels Use permission govern the
upstream path; the Tunnel ID is not itself a credential. The runtime API key authenticates the
outbound client separately. The installer retains the existing connector.secret/tokenHash model:
only a private local header-value file contains the derived Bearer header, referenced through
the pinned client's MCP static-header configuration. tdev still binds only loopback, authenticates
every MCP admission, checks Host/Origin and applies the principal's existing grants. No grants
are added. All users admitted through this Tunnel share that local principal unless they supply
another configured credential; this is not per-ChatGPT-user identity. Hostile same-UID workloads
can read these files: local auth prevents unauthenticated/direct accidental access and preserves
the delegation boundary, not OS isolation. Per-user OAuth and Unix sockets are separate follow-ups.

Connector-provided Bearer remains an explicit alternative. Its static local header is scoped
only to discovery/startup probes; ordinary tool calls still require the host credential.
tunnel-client 0.0.14 resolves whole-header file references locally and applies forwarded headers
last, case-insensitively. A wrong incoming Authorization therefore fails rather than falling
back to the internal secret. MCP headers are not control-plane headers. No authentication bypass
or additional public HTTP endpoint is introduced.

Local connection management supports zero or more independent Tunnel ingress paths for one
installation. New connection credentials map to the existing owner principal through the
config credential registry; they do not create new principals, grants or task ownership.
Principal tokenHash remains the installation-wide compatibility credential, including existing
connector.secret/Local Codex use. Registry credentials are additional, uniquely hashed credentials
with active/disabled/revoked states. Authentication reads current config on each request;
requests already authenticated before revocation may continue to admission. Accepted durable
operations are not cancelled by connection lifecycle actions. Revoked credentials never become
active through enable; rotation creates a new credential identity. Credential identity is not
proof of the actual Tunnel path and is not a new authorization key.

Each connection has a stable ID, mutable display name, auth mode, desired enabled state and
profile digest. Exact collection shape is owned by contracts/connections.schema.json; credential
wire shape belongs to config.schema.json. Runtime credentials are installation-owned private
copies per connection; equal values are allowed and removal never revokes the upstream key or
deletes the supplied source file. Fresh connections have dedicated local secrets. The migrated
default connection preserves its original profile/mode and shared connector.secret. Disabling
or removing that legacy connection stops its transport but does not revoke the shared token.
Explicit rotation moves it to a dedicated token while leaving the compatibility token valid.

Bearer-required mode rejects missing host authorization. No-auth-compatible mode (stored as
tunnel) injects a local Bearer when the host supplies none, accepts valid explicit host Bearer,
and rejects invalid explicit Bearer. It does not grant per-workspace isolation: all current
connections use the owner's existing permissions. In compatible mode Tunnel admission is
sufficient to use that authority; supplying Bearer voluntarily does not make it mandatory.

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

The controller provider adapter invokes bounded `gh api` utilities against github.com with
explicit API headers and JSON stdin. Organization creation uses the fixed owner's endpoint;
personal creation first verifies the authenticated login equals that owner. HTTP status drives
explicit rejection versus uncertainty; provider/credential diagnostics never become receipt text.
Git transport accepts only the canonical HTTPS URL and rechecks the enrolled repository ID
around observations/fetch. New stores determine object format from advertised OIDs; existing
stores validate retained Git format without requiring a live base branch. Transport uses an ephemeral
GitHub-scoped credential helper. Controller token/config environment enters only provider and
authenticated transport utilities; private object plumbing receives neither token variables nor
the helper, and no credential/helper is persisted in the object store. This follows the
[GitHub CLI API](https://cli.github.com/manual/gh_api) and
[authentication environment](https://cli.github.com/manual/gh_help_environment) interfaces;
provider permissions and successful transport still remain independent upper bounds.

Creation journals uncertainty before POST and persists a returned repository ID before any
subsequent observation or enrollment. Recovery with that ID checks current owner/name/ID and
private visibility, then commits enrollment and the terminal receipt together. Without the ID,
replay/status perform no provider lookup or POST: a same-name repository cannot prove creation.
An explicit HTTP rejection before a returned ID can finish failed/none; malformed success,
server failure or lost response stays unknown. A late permission/storage failure retains the ID.
Active per-operation gates also protect provider workers without holding SQLite across waits.
The API's optional permission fields are exposed only as observed; explicit push denial rejects
new enrollment, while field omission does not fabricate a grant or replace actual Git access.

Local creation journals uncertainty before the exclusive target-directory creation. Initialization
finishes its README commit before recording the exact Git/checkout identity and initial HEAD,
then writes and syncs the original operation marker. Recovery requires all these facts at the
original scoped path; a same-name repository, copied marker, incomplete initialization or changed
HEAD cannot supply the missing proof. Without proof the original receipt stays unknown and no
initialization is repeated. Enrollment and its terminal receipt commit in one short transaction.
Interrupted connect before that commit can fail with effect=none: it constructed no public Git
or checkout effect. Per-operation controller gates prevent observation from interpreting an
active initializer as interrupted; they are not durable creation evidence or process supervision.
This completed-initialization proof deliberately strengthens the reference's earlier marker.

Task start chooses the sole accessible project or configured default, otherwise requires
an explicit project. It chooses the configured/sole source branch, resolves its actual HEAD once,
and journals that immutable base before fetching. Retries retain original identity. No global
current-project/session pointer. Start reserves a unique server-generated branch name within
the intersection of repository and principal namespaces; no remote branch exists yet. Exact
open/compose remain available for enrolled refs, never as a way to adopt a managed branch.

The managed task ID, ref and resolved source scope are frozen with the pending receipt before
fetch, independently of whether the original input named a project/ref. That reservation remains
in retained operations after failed/interrupted private construction; no later task reuses its
branch. Explicit workspace selection/membership is checked again in the reservation transaction;
a changed default/sole member that selects a different project rejects the stale selection.
This tightens the reference's selection race and earlier allocation-after-fetch ordering.
Replay observes the original receipt before resolving new defaults/HEAD, with current repository,
source-ref, namespace and workspace ownership checks. Private construction can fail interrupted
with effect=none, preserving the frozen reservation; source import, public ref mutation and
published predecessor continuation require their own applicable proofs.

Managed tasks publish only their frozen validated candidate, parented by the admitted source
base, using create-if-absent CAS. Source base and publication target expected state are distinct:
first publication expects absence even when the source branch has advanced. Delegated projects
use base refs as sources; direct base publication is not granted by connect/create. Existing
explicit canonical publication grants keep their previous meaning. Start from a proved
published task continues its retained commit, even after that task's branch cleanup.

Published predecessor start uses the owned task's retained publication OID, source ref and
namespace, independently of project/branch defaults or current remote HEAD. Its publication
state must be published or deleted and no writer may hold the predecessor at admission.
An explicit expectedHead compares with that publication OID. The destination workspace must
currently include the selected project; the predecessor's closed/detached workspace need not.
Admission rereads publication/scope facts in the same short transaction that reserves the new
task/ref/workspace receipt. It reserves no predecessor writer: later source edits, publication
or cleanup cannot retarget the already accepted base. Construction checks the retained private
object is a commit and pins it without remote fetch or adopting a ref. Missing/corrupt evidence
fails without substituting another HEAD. Current predecessor and resolved new-task scope gate
receipt access; replay retains the original publication even if the predecessor later advances.
Private-pin controller death retains the original interrupted receipt without reconstruction.

Close retains branches. Explicit cleanup works before or after close and deletes only the
task's created branch at its exact recorded publication OID. Prefix matching alone is
never ownership; foreign or changed branches are preserved. Clean local checked-out branches
must be switched away before deletion. User checkout/index/untracked content is never a
materialization/publication target. Absence can finish cleanup only when no prior uncertain
writer is active. Branch names are never reused. Namespace operators must not delete/recreate
or rewrite owned refs behind the controller; Git OID CAS cannot detect an external ABA rewrite.

Cleanup admission rereads source/publication pointers and reserves only the owned task writer;
closed/detached workspace membership is not a prerequisite for retained resource cleanup.
Current repository/source/namespace authority still gates admission and receipt access. A
distinct cleanup intent stays outside private-source interruption recovery. When the branch is
absent and no other writer holds the task, task close/ref retirement and the original receipt
commit together without Git mutation. Existing branches require published ownership at the exact
recorded OID, an ordinary nonsymbolic ref, and no checkout on that branch in any local worktree.
The local utility uses update-ref --no-deref with deletion-at-old-OID CAS and no user hooks.
GitHub deletion uses controller-authenticated push with an explicit force-with-lease binding
that exact branch to its retained publication OID. Ref/identity checks surround transport;
the lease protects dispatch races. Local worktree checks apply only to local repositories.
Both adapters share the same journal, task fence and observation-only recovery. Failed dispatch
or unavailable readback cannot turn absence into proof, clear another publication or repeat push.

Before deletion dispatch, persist its frozen old OID and unknown effect. Per-operation gates
prevent status/inspect/replay from completing an active worker from a temporary absence; other
tasks remain available while Git waits. After controller death, a pre-dispatch intent can complete
from current absence or fail interrupted while the branch exists. A dispatched deletion remains
unknown while the ref exists or observation fails; only observed absence can complete it without
another deletion. A utility CAS failure is conservatively unknown once dispatched, preserving
the changed ref and the task fence. SQLite completion failure after deletion reports uncertainty,
not effect=none. Completion preserves checkpoint/publication OIDs and clears only its owned busy
slot. A completed receipt never deletes a subsequently recreated branch on replay.

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
diagnostics/failures, and checks elapsed time before another call. Ordinary non-interactive command/source-validation
admission may include an explicit bounded terminal observation (normally `waitMs=30000` for the ChatGPT path): the controller strips the
observation-only `waitMs` field before mutation identity/admission, starts or replays the exact
operation, then performs one bounded status/log observation before returning from the same tool
call. Staged-stdin workflows must set `waitMs=0` to receive the retained handle before later stdin;
process mode returns immediately and rejects `waitMs` and `capturePaths` in its request branch.
The command branch alone supports those observation/capture choices. This closes the
admission-to-monitor physical-cell gap for short terminal
success/failure without replaying the effect. For an operation that remains running, the
operation-monitor helper uses bounded server-side terminal waiting on that exact admitted operation;
the default physical cell performs one read-only status call with a wait of at most 30 seconds, advances the output cursor, surfaces terminal failure
before return, and rolls over with exact continuation arguments only if the operation is still
nonterminal after that in-cell budget. This reduces host successor-cell scheduling points while
keeping each individual server wait bounded. Nonterminal log growth does not prematurely end
those server waits. Unknown/unreadable status stops for review; the helper never replays, cancels or
replaces the underlying effect. A rollover still requires the assistant to receive the outer result
and issue a new physical cell; the adapter cannot schedule that cell, extend a turn or guarantee
visible delivery. Unknown operational replies stop for reconciliation of the original identity;
diagnostic failure never retries the effect. This adapter imports no runtime diagnostics and adds
no operational-core dependency.
The reference `classifyTdevReply` distinguishes successful RPC processing from successful
durable operations. `ok=true`/MCP `isError=false` does not prove an operation passed;
`effect=committed` describes certainty, including failed execution. Monitor `status=terminal`
must be consumed with `operationStatus` and the domain receipt. Failed exec may capture partial
source changes; failed validation never authorizes publication. The Host owns the goal and
strategy, not operation truth. Another attempt after terminal failure is an explicitly selected
new admission, never resumption or automatic rerun of the terminal operation. UI history is
not durable execution authority and caller Stop does not establish executor stop proof.
The operation tool's description explains receipt observation, control and effect uncertainty.
Physical-cell budgets and orchestration defaults belong in the separate ChatGPT caller adapter,
not discovery prose or server admission limits; the server cannot force host scheduling.

The controller must surface underlying completion within the same turn and after reconnect,
including when the caller missed the completion response. Replaying a mutation reconciles
the original operation before returning; it never starts the effect again. Process status
reads the supervisor's current result/log evidence, not a cached admission response.

Use find for human-name continuation; task list remains the explicit domain inventory.
Use task inspect for a known task when live reconciliation or older history is needed. Inspect reconciles its busy operation and returns current
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
Terminal operation status/result/intent remain immutable even if dispatch later reports an
error. No late failure or intent update may replace already reconciled terminal evidence.
Before a new source-task mutation uses a busy task, admission reconciles only that retained
busy operation once, outside the SQLite transaction. It rereads the task and then rechecks
busy/CAS inside the admission transaction; a changed capture makes an old expected checkpoint
stale, and an unknown/running predecessor remains fenced. No background worker, global scan,
new dispatch or caller-goal decision is implied. Find remains a retained-state-only projection;
executor completion without an observer may still precede SQLite terminalization until status,
inspect, same-request replay or this bounded admission-before-use observation.

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

Source-validation execution budget resolves from explicit request timeout, then current
repository/project-policy `validationTimeoutSeconds`, then the legacy 300-second default.
The 1..3600-second budget is frozen at admission with its origin and exposed in the admission/
status execution projection. Project list/inspect exposes the current default. Caller `waitMs`
is only observation time and remains outside mutation identity. Changing an accepted timeout
requires a new request identity; replay never reinterprets old intent using current config.
This default is execution budget, not validation acceptance policy: changing it alone does
not invalidate a successful exact candidate. Command/process/artifact deadlines are unchanged.

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
server/discover is optional for clients, not a required handshake. Ordinary responses remain
complete JSON envelopes, including positive bounded waits when `_meta.progressToken` is absent.
An explicit positive `waitMs` on command-mode `tdev_exec`, source `tdev_validate`, or
`tdev_operation status` uses the same POST's request-scoped `text/event-stream` only when the
request also opts into `_meta.progressToken`: headers are committed immediately with buffering
disabled, standard `notifications/progress` are emitted while waiting, and the matching final
JSON-RPC response terminates the stream. This follows auto response shaping rather than forcing
a comment-only SSE stream merely because the server-side bounded wait is positive. Discovery/tool
lists carry explicit private zero-TTL cache metadata. The exact envelope/error profile is in
contracts/tools.schema.json x-mcp.

Core HTTP has no initialize/initialized, transport session, GET/DELETE stream, SSE event-id
resume or automatic protocol downgrade. Unimplemented client notifications are rejected.
The server does not advertise subscriptions, sampling, elicitation, tasks or MRTR input
requests. GET healthz is liveness, not MCP. HTTP request IDs, progress tokens and clientInfo
are not durable mutation identity or authority. Stream disconnect cancels only the bounded
observation response; an already accepted durable operation is not cancelled or relaunched.
Reconnect reconciles that retained operation and never replays its completed effect. SSE
comments are transport keepalives, not protocol progress or proof of ChatGPT/UI delivery.
No generic transport framework or transport-owned execution lifecycle is introduced.

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
An operator may explicitly name one retained unknown native stdin control for an existing
resident update. Its consumer must have a reconciled terminal committed result with exact
native execution identity and a stopped receipt; owner, repository/ref and enrolled identity
must match. This maintenance exception preserves every operation row and never certifies
past input delivery or sends input again. Other outstanding effects still block installation.
The exact exemption is rechecked under the admission fence and pointer lock, journaled for
failed-update recovery, and not carried into ordinary future updates automatically.
Install/update/uninstall serialize with root and shared-service locks, journal before changes,
stop owned services, and switch only compatible bundles. Recovery restores old files/pointer
and desired state before clearing the fence. A process interruption leaves recoverable intent;
there is no claim of atomic two-directory filesystem replacement. Initial takeover is an
explicit operator action with private recovery receipts; ordinary updates use owned runit
services. A persisted DOWN marker survives shared-supervisor recovery. termux-services owns
root recovery; tdev does not duplicate it. The explicitly invoked first-install bootstrap may
install Termux packages and start the shared service-daemon when no matching runsvdir exists.
Ordinary installer/preflight calls only inspect it. Preflight checks one live runsvdir executable
and absolute service-directory identity, so stock service-daemon needs no nonstandard status
action. Multiple roots fail explicitly; no automatic shared-daemon restart or replacement.
Production activation needs user authority. Bundle verification is not protection from
hostile same-UID code. Native runner is included without extra executor enrollment.

The short piped entry point `i` downloads the full bootstrap before execution and restores
terminal input from `/dev/tty`; it selects the documented installation source branch internally.
The shell bootstrap obtains a selected HTTPS repository branch/tag into a persistent source
directory through temporary staging. An existing matching clean checkout is reused at its local
commit; dirty/foreign sources are preserved and rejected. It installs no provider account or
project grant and passes terminal input to the existing setup wizard. Dependency preparation
verifies exact requirement versions and imports without global site-packages before switching
the private directory. A version-matched Termux rpds distribution supplies Android native bytes;
other pinned packages are acquired through pip. A native-version mismatch fails before activation.
Package-manager inputs remain Termux-managed; this is not an OS snapshot or deleted-state restore.

Connection-aware installations derive their runit service set from the registered collection,
including a valid controller-only set. Each client has separate profile, health, process and log
paths; executables and the controller remain shared. Local profile/binary identity is verified
before updates. External poll failures produce per-connection degraded observations rather than
rolling back an otherwise valid local update or declaring the controller corrupt. Common
controller updates still use the existing maintenance/outstanding-operation fence; individual
connection changes do not restart the controller or fence/cancel development work.

Connection changes serialize with installation changes and persist a forward-recovery intent.
Auth/config CAS is committed before stopping the selected transport; a failed stop leaves its
dedicated credential blocked and an explicit pending recovery. Restart/enable happens after
profile/header and desired-state persistence. Recovery finishes the same intent without minting
another token or restoring revoked credentials. Preparation interrupted before intent may leave
private unregistered files; they grant no access and are not destructively swept. Concurrent
operator config changes stop recovery rather than being overwritten. Removed connection-owned
secrets/profiles are deleted after transport removal; logs/service recovery evidence survive.

Software update cannot change credential registry or compatibility token hashes. On a
connection-aware installation, CLI rollback preserves the current operator config rather than
restoring historical config snapshots. Bundles unable to read connection/security state are
rejected before changing services or active pointer. These guarantees cover supported operator
flows, not arbitrary same-UID edits/restoration of private files.

Setup resolves inputs before writing credentials and prompts only on actual stdin/stderr TTYs
when required inputs are missing. Complete CLI/profile inputs remain noninteractive. New
resident settings persist connectorAuth; absent legacy settings retain their original profile
and host-Bearer semantics. Adoption of preexisting config/profile defaults to Bearer, never
silently to shared Tunnel authority. Updating software cannot select a different auth mode; the explicit local connection command can.
A nonsecret pending setup intent plus private idempotent file writes allow first-install retry
without credential rotation; an interrupted secret/config pair reuses its secret. Existing state
with missing config requires restoration. Setup serialization precedes the existing service
transaction; no partially prepared setup starts services. Service failure/recovery/uninstall
preserves these settings and credential files for retry. Terminal disclosure is restricted to
an explicitly selected fresh Bearer setup or explicit local token command on a TTY, with optional
bounded clipboard delivery through stdin. Ordinary JSON output/receipts never contain secrets.

The local CLI's terminal menus are navigation over existing operator/client commands, not a
second lifecycle or authorization layer. Bare categories and connection selection do not dispatch
effects. Menus retain the selected installation and connection's stable identity; opening or
cancelling navigation never changes services/credentials. Non-terminal category invocation shows
usage without waiting for input. Explicit commands retain their scripting semantics and MCP
request/replay behavior; a menu selection dispatches once and exits.

Local CLI MCP calls default to the installation compatibility secret. An explicit --connection
selects a registered connection's private credential by name/stable ID, without using the Tunnel
transport. A missing default file may offer a terminal choice; non-terminal use requires explicit
selection. Invalid/insecure default credentials never trigger fallback. Selected connections must
be enabled and their credentials current/active, principal-bound and hash-matching; the server
still authenticates and authorizes every request, including a revocation after local inspection.
Local operator commands do not consume this option. Selection performs no credential creation,
rotation, copying, persistent preference or authority change. Response/transport failures never
retry the operation or switch credentials. A local connection choice is not Tunnel-path proof.

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

The canonical continuous observer entrypoint is `tdev observer`; `scripts/tdev-observe`
is its independent collector and a standalone diagnostic/compatibility path. The installation's
existing `resident.json.home` owns the persistent operator HOME (captured during installation,
retained during updates, also used by resident launchers). The CLI resolves default observer
evidence to `<resident.home>/tdev-observations` and explicitly passes both installation root
and recording root to the collector. An explicit `TDEV_OBSERVE_DIR` overrides that default;
relative overrides retain caller-cwd meaning and are made absolute before dispatch. Missing or
invalid installation HOME fails explicitly, never falling back to execution HOME. No new state
owner or evidence migration is introduced. Multiple installations sharing an operator HOME
also share the legacy default evidence location; use separate explicit recording roots for
independent collectors, and never treat a known installation mismatch as selected-root coverage.

The source/operator shell HOME, disposable task/operation HOME, selected installation root and
persistent observer evidence root are distinct. Source location is not evidence ownership;
private native HOME remains unchanged. Direct standalone script use retains its historical
HOME default and must pass `TDEV_OBSERVE_ROOT` and `TDEV_OBSERVE_DIR` explicitly outside an
operator shell. A custom recording root is explicit operator context, not auto-discovered from
other directories or saved implicitly by status. Installation updates do not move, prune or
restart independent collectors. `status` reads bounded mode records and process identity without
creating directories/locks, signalling processes, sampling the server or invoking MCP. It reports
both resolved roots, per-mode lifecycle/freshness and recorded identity/coverage. Existing workers
without a recorded installation root can bind through their explicit process environment;
otherwise binding remains `unknown_legacy`, independently of verified process liveness. New
workers record both roots. This local evidence timeline remains separate from server diagnostics
and user-visible acceptance; absence at one recording root is not proof of missing global capture.

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
retained operations, with per-deployment writer ownership and revision CAS. Release requires
an explicit expected revision: zero admits an initial service, and a positive value updates
exactly that inspected revision. Matching an existing name never silently authorizes updating
its current revision. The revision is checked before preparation and again inside admission. `targets`, paged
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
its contract bound. Source admission remains independent of these acquired/exported input
budgets. Sealing temporarily uses additional copies.
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

## 10. Implementation structure

This section selects the implementation design; §§1–9 retain ownership of product semantics.
README distinguishes the selected design from implemented code. Rust is the target language for
the operational runtime, local CLI and installation/service management. Python may remain a
development/test tool and an application language used through tdev. A complete Python structural
refactor is not a prerequisite. Reuse the existing semantics and evidence, not Python object
boundaries, incidental defects or an assumed one-file-to-one-module correspondence.

### Package and dependency direction

Start with one Cargo package named `tdev`, a library for internal testing, and the `tdev` binary.
Use root `Cargo.toml`, `Cargo.lock` and `rust-toolchain.toml`, `src/lib.rs` for module assembly
and `src/main.rs` for entrypoint dispatch. The module names below are the initial layout under
`src/`; they may be files or directories as implementation size warrants.
Use modules before separate crates. A crate split needs a concrete dependency/build/test benefit;
there is no generic plugin framework, mandatory service mesh or universal workflow engine.
The binary has independent controller, supervisor and deployment-runner process roles as well
as operator commands. A shared executable does not merge their lifetimes.

| Initial modules / responsibility | Owns | Must not own |
|---|---|---|
| `model`, `identity` | Validated identifiers, operation/effect states, domain errors, canonical identity encoding | HTTP handlers, live filesystem/provider access, mutable global config |
| `admission`, `application` | Current authorization context, request replay, feature dispatch, bounded observations | A second state database or one giant cross-feature controller object |
| `workspace`, `project`, `source` | Composition, enrollment, checkpoints, edits, validation/publication joins and their recovery | Process lifetime or inferred provider grants |
| `artifact`, `deployment` | Frozen inputs, sealing/verification/retirement, pins, release switching and recovery | New execution receipts or duplicated source authority |
| `storage` | SQLite transactions, persisted record decoding, CAS, schema compatibility | Subprocess/network waits inside a transaction |
| `git`, `provider`, `execution` | Git plumbing and bounded controller provider access; accepted execution submission/observation/control; dormant SSH compatibility | Reinterpreting an accepted backend, policy or request identity |
| `supervisor`, `release` | Child identity, input/output, limits, stop proof and owned capture/runtime evidence | Controller-owned admission or fabricated success from stdout |
| `contract`, `transport`, `operator` | Existing JSON contract validation, MCP HTTP, selected stdio adapter, CLI, config/install/connection/service operations | A second schema authority, duplicated domain decisions or direct ad hoc mutation of core tables |
| `diagnostics`, `observer` | Optional bounded evidence and independent observation | Core liveness, execution authority or mandatory dependency of an ordinary call |

Domain models do not depend on transport or concrete adapters. Feature handlers receive a
bounded admission context and the specific storage/Git/executor/service capabilities they need;
they do not receive an all-purpose mutable controller. Introduce traits at these concrete test
or external boundaries, not one trait per function. Keep domain-specific transitions in their
feature modules; share durable record/CAS/identity mechanisms only where semantics match.

Wire DTOs are decoded and validated at the edge, then converted to domain types. The existing
JSON contracts remain the wire authority; derived Rust schemas cannot silently replace them.
Rust types do not alone validate JSON Schema bounds, patterns, alternatives or unknown fields.
There is no second handwritten schema registry. Contract parity tests cover both acceptance
and rejection, including JSON numeric representations and absent versus null/default fields.
Materialized Schema acceptance is separate from raw wire decoding and typed conversion.
Integer-valued floating forms remain schema-valid without changing their request fingerprint;
unbounded offsets cannot be silently narrowed to machine integers. Preserve original numeric
identity while choosing a bounded paging implementation. Legacy identity strings with unpaired
surrogates remain decodable; accepting/rejecting new wire strings requires an explicit edge
decision and fixtures, rather than inheriting a JSON library default.

The selected physical ingress profile is UTF-8 JSON with Unicode scalar strings/keys, finite
IEEE-754 floating materialization, at most 128 nested containers, at most 4,300 decimal digits
per integer and a 2 MiB body bound. Integer identity remains arbitrary precision within that
wire bound; integral floats remain schema-valid tool values but are not JSON-RPC integer IDs.
Depth is counted by the identity decoder, with the secondary JSON decoder's separate limit
disabled. Unpaired surrogate escapes in new HTTP/config bytes fail before admission; legacy
identity material still decodes unchanged. This explicitly tightens the reference's acceptance
of non-scalar strings and very deep metadata, whose interoperation is unpredictable under
[RFC 8259 §8.2](https://www.rfc-editor.org/rfc/rfc8259#section-8.2). Raw ingress fixtures record
this difference; it must remain visible in P6 compatibility qualification.

Discovery is derived from the canonical contract and narrowed to implemented request alternatives.
Validation uses that same narrowed input schema, so an unadvertised action cannot reach a stub.
Source construction reserves ownership/CAS in one short transaction, writes and pins private Git
objects outside the store mutex, then commits the pointer and receipt together. Recovery may
fail interrupted private source construction with effect=none and release its owned busy slot;
it cannot apply this rule to unknown effects, execution, public refs or unrelated legacy intents.
Read pages at or beyond the end report complete without changing the requested offset.
This corrects the reference list/search equality check that reported incomplete beyond EOF;
an integral Schema float likewise indexes a page correctly instead of reaching a slice error.
These are explicit behavior corrections, not request-identity normalization.
Bounded provider observation refreshes source state afterwards, so a predecessor completed during
the remote read can immediately support useful continuation. JSON/SSE observation creates no
effect; a disconnected caller does not cancel an accepted construction worker or release its
admission capacity while that worker still runs.

### Types, admission and transitions

Use distinct types for operation/request/task/workspace/project identifiers, checkpoint OIDs,
artifact digests and deployment revisions. Decode persisted input through validated constructors;
a Rust enum is not evidence that bytes read from storage are valid. Keep execution status and
effect certainty separate, as in the public Operation and Error definitions. Do not turn
`unknown` into failure/retry, or admission success into child success.

Capture an immutable config/policy view for a defined admission attempt rather than replacing
shared Controller configuration during concurrent calls. Authentication, replay and effect
admission still enforce current authority (§5). A retained intent freezes execution parameters,
not an evergreen grant. Reconciliation uses the accepted resource/backend identity; new effects
must pass their applicable current-authority checks. Recheck mutable prerequisites at the
transaction/CAS or external-effect boundary required by each feature.

| Boundary | Required implementation rule |
|---|---|
| Request lookup | Scope by principal/request and compare the canonical fingerprint; current authorization still applies to replay |
| Local admission | Commit intent, ownership/reservations and relevant CAS together; concurrent duplicate admission selects the same original operation |
| External dispatch | Persist sufficient dispatch intent/reservation before the effect; a crash or lost reply enters that feature's reconciliation path |
| Completion | Verify identity and observed outcome, then commit result and pointer/busy changes together where locally atomic |
| Recovery | Reconcile the original effect; never infer permission to submit a second execution from missing evidence |
| Retirement | Recheck ownership/pins and preserve durable receipts; recover interrupted owned rename/delete without deleting replacement resources |

Do not force Git publication, child launch, artifact seal and deployment switching through a
single supposedly atomic transaction. Their crash gaps differ. Typed transition functions return
explicit observations, record updates or narrowly described effect requests; the durable commit
and effect ordering remains visible in the coordinating code. Every externally meaningful gap
has an invariant test. Type-state may help a local construction sequence, but durable recovery
must represent states that exist after process death and partial writes.

### Concurrency and process lifetime

Retain one controller process owner per state root and SQLite WAL/FULL durability. Serialize
transactions on the owned connection; keep them short. Use bounded blocking work for SQLite,
Git and filesystem operations if the transport uses async I/O. Do not hold a transaction or
controller-wide exclusive mutex across subprocess/network waits. Preserve the installation
admission fence and retained pending-effect checks. Retain the artifact/deployment lifecycle
guard required by §8 initially, including its bounded copy/service-wait scope outside SQLite;
it precedes per-operation reconciliation locks and does not block ordinary source work. Narrower
locks require pin-versus-switch/prune race tests. Lock order must be explicit and consistent
before additional concurrency is introduced.
Pass an explicit guarded context to internal artifact/deployment advancement so nested
reconciliation does not reacquire a non-reentrant Rust mutex. Do not mechanically translate
Python's reentrant locking into nested ordinary mutex acquisition.
Per-operation reconciliation excludes concurrent advancement of that operation without blocking
unrelated work. Bounded queues report capacity exhaustion; they do not silently discard effects.

Controller request cancellation or disconnect ends observation, not the accepted operation.
Native supervisors run as independent OS processes with durable spool identity. A Tokio task
inside the controller cannot replace that boundary. Keep PID start checks, subreaping, stdin
delivery uncertainty, bounded byte logs, deadline accounting, descendant stop proof and capture
ordering. Limit unsafe/platform-specific code to reviewed syscall adapters and exercise it on
Termux. Same-UID execution and sampled budgets retain the limits described in §3.

The supervisor primitive reserves immutable internal launch input before dispatch. Its canonical
digest binds the command, relative cwd, deadline, working budget, initial stdin, selected task
dependency location (or fresh environment) and shell/tool location.
Dispatch and worker claim are durable create-once fences: partial records, a missing worker or a
dead worker cannot authorize another launch. Worker/child records bind PID, start ticks and boot
identity. The independent worker starts a separate session and subreaps descendants; terminal
evidence is separate from candidate stdout and bound to that reservation/worker. Final output is
fsynced after descendant stop and before the result record; incomplete stop proof stays unknown.
Cleanup freezes observed parents before killing their wait targets, preventing those kills
from resuming waiting shells into subsequent writes before capture.
The controller must join this evidence to its existing admission/capture lifecycle rather than
copy terminal truth into a second task owner.

Initial stdin is pumped first, without implicit EOF; controls start at sequence zero. Bounded
input reservations bind the original control ID/content and form one contiguous prefix. Admission
is serialized by a per-job kernel lock, journals intent before returning a stable acceptance
receipt and rejects new controls after reserved EOF or terminal/unknown worker evidence. Replay
of a retained acceptance does not write the pipe, even after completion or worker loss. Before
each initial/control write the worker persists unknown delivery bound to its identity; only
complete pipe acceptance (and closure for EOF) can persist committed delivery. This is pipe
acceptance, not candidate acknowledgement. Partial writes, EPIPE or worker death retain unknown;
queued input not attempted remains queued. Nonblocking bounded writes share the output/deadline
loop, so a candidate that does not read cannot block cancellation or output draining. Internal
spool format 4 binds capture selection and the merged non-secret environment alongside the
source binding and command/input/dependency selection; unsupported earlier records are rejected without
rewriting them or authorizing dispatch. This does not revise SQLite schema 3 or the wire contract.

Task dependency selection acquires a shared lease before child dispatch and holds it through
descendant stop, final budgets and terminal result persistence. An exclusive lease rejects
dispatch without a fresh-environment fallback or automatic retry. Stable lease files occupy a
separate namespace from replaceable task directories, including for task IDs ending in `.lock`.
The task's caches and venv/bin/bin PATH entries are persistent; HOME/TMP/config remain per-job.
Dependency paths that cannot be represented as single PATH entries fail before child dispatch;
they are not silently split into additional tool locations.
The dependency directory has its own preflight, sampled and final 2 GiB/100000-file budget with a separate 1000000-node scan bound,
independent of the working-copy budget. Leases do not serialize arbitrary package-manager writes.
Kernel lease release on worker death is not a stop proof: controller admission must also reject
reset while any consumer is running or unknown. The primitive exclusive guard supplies exclusion,
not reset intent/recovery or API authority; those join the existing task/operation lifecycle.
No spool record grants API authority or provides hostile same-UID tamper resistance.

The execution owner constructs source from the admitted immutable Git checkpoint before
launch, streaming bodies and one shallow non-delta pack into owned storage. The working copy
retains the exact detached shallow Git HEAD/index; only starting ignore files are duplicated
in a separate trusted selection directory. The reservation binds the checkpoint, canonical
manifest digest, physical pack length/digest, explicit capture paths and readonly selection;
a ready record binds the owned ignore/work/Git directory identities. Incomplete preparation is
never repaired by replay. Launch and worker entry verify original source selection and bodies.
The worker captures only after descendant stop, output closure and final budget observations.
Capture uses directory descriptors and no-follow file reads; bounded owned temporary bytes
couple the content witness to the imported body. Two matching source scans, exact body digests,
starting ignore rules and atomic directory/record publication seal the result before terminal
proof. A recorded capture rejection retains stopped execution evidence with a named source fault and grants
no source advancement. Capture has a separate 300-second deadline and 48 MiB metadata budget;
source content/count budgets remain those in the contract. No body enters a JSON record.
The execution owner requires original worker/stop/digest proof before private Git import.
A per-job import lock and bound candidate record retain the first recorded Git candidate,
so concurrent or delayed observations cannot substitute a newly timestamped commit. That is
private construction evidence; SQLite still exclusively owns task checkpoint and operation
receipt completion. Explicit retirement uses the same lock, rejects unproved stop, and removes
input/work/capture bodies and source metadata while preserving request identity, terminal
result, controls, bounded logs and any constructed Git candidate. Replay never rebuilds or
relaunches a retired copy.

Public command/process admission now joins this proof to the same SQLite task/operation owner.
Current task/ref/identity/workspace authority and expected checkpoint are checked at admission;
command reserves the task writer, while process reserves only one of eight outstanding slots.
The intent freezes merged tooling/caller environment, dependency selection, command/cwd/deadline,
source checkpoint and operator workingBytes. Private launch records allow 8 MiB for these bounded
strings; source manifests retain their separate 48 MiB metadata budget. Source bodies remain
outside either record and caller response budgets are unchanged. Task/workspace execution
summaries omit log bodies; operation status pages logs independently.
Preparation occurs only for the physical new admission, outside SQLite. Preparation and private
Git completion use at most eight controller background activities shared across operations; slot
exhaustion reports executionWork configured/observed values before a new admission commits.
Observation does not wait on their per-operation reconciliation locks, so waitMs=0 does not
wait for large source copying/import. These activities share the original SQLite connection/lock
and have no authority after controller death; restart observes uncertainty rather than rescheduling
preparation. A retained stopped job may reconcile private completion again without dispatch.
Its exact spool digest
is retained in the intent before dispatch. A known preparation failure before launch completes
with effect none; a lost preparation/dispatch/worker observation remains unknown, retaining any
command writer and process slot. Reconnect/replay observes the original evidence and never
reconstructs a copy or calls launch. Public interpretation requires the native construction tag;
other historical execution/control intents are not silently reinterpreted.
Proved-stopped command capture imports one retained private Git candidate, then commits the task
checkpoint, writer release and terminal receipt in one SQLite transaction with the original
checkpoint/busy CAS. Failed/cancelled commands can capture stopped partial work; capture rejection
keeps the previous checkpoint. Process completion never updates a task pointer or writer/closed
state. Before a fresh task mutation, its busy predecessor is observed once outside the admission
transaction, then the mutation's busy/CAS checks remain authoritative. A retained writer from an
unconnected feature remains busy without effect interpretation; task-authorized summaries remain
available and fresh mutation admission still rejects it. Task inspect also observes
all bounded outstanding processes independently of its history page; workspace inspect observes
busy task predecessors. No controller/store mutex spans supervisor, Git or filesystem waits.

Public stdin/cancel/retire controls retain their own operation receipt before the spool effect.
At most 64 pending controls per target are retained; configured/observed exhaustion is explicit.
Controls accepted while the original source is preparing remain pending, then the constructor
reconciles their original intents before dispatch. Initial stdin still precedes queued controls.
Loss of that constructor preserves unknown target/control state without starting a new copy.
Retained spool input acceptance reconciles a missed SQLite completion without pipe resending;
known input rejection completes with effect none, while unreadable control evidence remains
unknown. Control status can project current pipe-delivery evidence separately from acceptance.
Retirement requires target completion and original supervisor stop proof, preserves logs/control
records and never reconstructs source. Per-operation reconciliation locks exclude only the
original operation; controller disconnect ends observation without cancelling it.
Dependency reset reserves task busy ownership, including for closed tasks, in the same transaction
that rejects every running/unknown execution consumer. It also acquires the stable exclusive
kernel lease. A synced retained operation/task/directory-identity record precedes a same-device
rename to owned trash; recovery checks both sides of rename and finishes deleting that original
directory. Identity conflict preserves a rebuilt environment and the unresolved reset/writer;
completed replay never touches new dependencies. Reset errors identify the original operation and
retain effect unknown for reconciliation. This public execution increment does not close P3's
validation/publication/recovery exit gate or qualify a resident cutover.

Source validation shares the accepted execution/spool owner, with a separately typed retained
validation binding: admitted checkpoint/base, adopted policy digest, deadline origin and private
candidate. Only a physical new admission constructs the sole-child candidate, records it in
SQLite, then prepares its readonly source and binds the original job before launch. Replay never
constructs or launches an incomplete candidate. The frozen policy binds command, executor and
operator tooling environment; deadline defaults and working capacity are execution budgets, not
acceptance-policy identity. The supervisor seals capture only when all existing source metadata
and body witnesses match the initial manifest; newly created outputs are excluded. Completion
checks that seal against the original input and report, retains candidate/receipt and releases its
owned writer without changing the source checkpoint. Pre-launch budget failures retain their
configured/observed diagnostics rather than being misreported as missing source capture.

Source publication has its own feature transition: reserve writer plus unique validation binding
in one short transaction, check the retained candidate tree/sole parent, current policy and target,
then persist dispatch uncertainty before any public ref effect. Local transfer writes only objects
before exact old-OID update-ref; GitHub uses one ordinary non-force push with a trusted pre-push hook
checking actual advertised old/new/full ref. Receipt and task closure/publication identity complete
atomically. A lost dispatch/SQLite reply retains unknown and the writer; reconciliation only reads
the original target, accepting its exact candidate or a verified descendant under the enrolled
no-rewrite/no-delete policy. An old or unrelated head cannot prove non-dispatch. New request IDs
for the same validation retain aliases to the original publication without another effect; different
publication input still conflicts. Interrupted pre-dispatch preparation can fail with effect=none.
Current policy/source/explicit expected-head refusals happen before a new publication reservation;
no inadmissible request owns the validation's unique publication slot. Reference post-admission
refusals may instead retain a failed/effect=none receipt. Both rejection shapes are explicit in
common acceptance; accepted publications retain one effect under all request aliases.
Historical receipts with unrelated construction tags remain unconnected and preserve their fences.

Human-name continuation is a source feature over the original SQLite ledger. It scans at most
200 creation admissions plus one lookahead, with one row cursor for created tasks and pending
project/task effects; returned entries are capped at 20. Task-local recent/outstanding pages
read 8/40 plus one lookahead independently of the caller's task history page. The original
Store mutex keeps task pointers, receipt summaries and completeness evidence in one local view.
Authority checks accept that locked view and perform no reconciliation or utility calls.
Pending project owner/name projection reads naming fields from current configured policy even
when its grant is revoked; a separate retained-authority check then reports unavailable, so
revocation cannot make already owned work look absent or confer new policy authority. SQL
projects only locator/authority fields, excluding execution environment/stdin, source manifests,
log bodies and results before Rust decoding. Unicode full-fold search changes neither stored
names nor mutation identities. Duplicate matching project names remain ambiguous even when
only one currently has work; the reference's older count-based projection can report unique
in that case. No partial scan or continuation page claims unique resolution.

Task inspection records its complete observation interval and rereads task/history/active under
one Store lock after provider observation. A concurrently changed writer is projected from that
same local state. Provider/executor observations remain separate facts, not an atomic distributed
snapshot. Worker stop/capture proof alone is not SQLite completion: a first bounded observation
may initiate private background import and still expose the original running identity. Bounded
subsequent current reads expose the committed checkpoint/receipt and useful forward work;
no observation repeats execution or guesses a changed authority state.

Artifact recipe inspection uses the existing terminal source-validation join, current enrolled
repository policy and private immutable Git candidate. `artifact` owns its strict recipe semantics
and binding projection; `contract` compiles the original ArtifactRecipe/Inspection definitions.
The identity decoder has an explicit duplicate-key-rejecting mode for recipe documents; ordinary
request and retained identity decoding keeps its existing last-key semantics. Shared Unicode
full-fold projection lives in `model/casefold` for lookup and path collision checks; it never
normalizes stored identities. Raw and canonical recipe bytes are independently bounded to 64 KiB;
selected source bodies use original blob streaming into a hash sink. Inspection rechecks candidate
parent/tree identity and creates no operation, writer, reconciliation or acquisition effect.
Terminal source proof checks operation ID, terminal/stop flags, zero exit and absence of capture
error through the original validation helper used by publication as well.

`artifact/acquisition` owns selected public-distribution bytes independently of source copying.
It decodes the original strict recipe, uses the native tool directory's curl with cleared
ambient configuration/auth/proxy/CA environment and verified native HTTPS, and streams response
bodies into descriptor-relative exclusive files while hashing and enforcing aggregate acquired
bytes. Response headers have their own 64 KiB budget; redirects and non-200 responses fail before
accepting a body. Each transfer is bounded to 20 seconds and the supplied original deadline.
Only a fresh input directory is accepted; failures retain partial files without resume, overwrite,
cleanup or a second fetch. Reverification requires exactly the declared names, regular single-link
files, unchanged metadata and pinned hashes, without repair. Directory replacement cannot redirect
writes or qualify another input root. Admission, cancellation, dispatch, stop proof and replay
remain the original operation/supervisor owners; this helper has no new receipt or execution role.
Its build admission/supervisor connection is still a later P4 increment.

### Identity, storage and compatibility

Separate ordinary JSON serialization from bytes used for request, policy, spool, artifact and
release identities. Existing canonical JSON uses sorted keys, ASCII escapes, compact separators
and rejected non-finite numbers. Lock exact byte/hash examples, including Unicode, numeric
representations and empty/optional values, before writing a new encoder. Do not substitute a
library's default serializer or another canonical-JSON standard and assume hashes match.
Internal format changes may be deliberate, but their reader/writer compatibility and existing
receipt/artifact handling must be explicit and tested. Preserve Git OID and ref-CAS semantics;
continue invoking Git plumbing initially rather than changing Git implementation simultaneously.

The state owner admits only supported formats before mutation. A controller swap never creates
two writers. Python and Rust implementations must not run against the same live state root for
comparison. Test fixtures may use independent roots or offline copies. Existing in-flight work
either remains interpretable by its pinned owner or blocks cutover with honest recovery evidence.
Completed receipts, credentials, workspace/task ownership, artifacts, service data and active
release pins must survive the selected transition. Unsupported downgrade must fail before
stopping a healthy service or modifying state; restoring a binary does not undo schema writes.
Do not build migrations solely to preserve abandoned experimental names, and do not use that
policy as permission to reset real state.

Installation manifests bind the executable, contracts and actual required runtime files.
Readiness checks verify the selected process/bundle identity rather than relying on Python
argv/PYTHONPATH patterns. Project services retain their pinned runner while they need it.
Cargo package metadata owns the product version from package creation; the reference executable
derives that value and its bundles retain the manifest until retirement. This prevents two
manually maintained versions during implementation. Shell remains suitable for the minimal bootstrap; ordinary product operation
must not need a Python controller/helper once the target implementation is complete.
Previously pinned service bundles retain their declared interpreter/runtime prerequisites until
explicitly retired; preserving those live services does not select an alternate controller.

### Implementation-independent verification

Acceptance tests launch the selected executable with disposable roots/config, make actual HTTP
or CLI calls, interrupt owned processes and inspect externally observable results. They do not
import Controller, mock private methods or require Python class layouts. The harness supplies
process launch/readiness/stop and client operations; it does not implement business semantics.
Implementation-specific unit tests remain useful for transition tables, storage crash cases,
encoding and paths. Do not convert every existing unit test to an expensive end-to-end test.

Run the same behavioral scenarios on separate disposable fixtures for each implementation.
Compare semantic outcomes and effect counts; normalize only documented nondeterminism such as
fresh IDs, ports and timestamps. Do not normalize away failure codes, effect certainty, limits,
source content, authority decisions or identity relationships. Preserve exact digest comparisons
for stable fixture inputs. Existing behavior that contradicts an invariant is a defect to fix,
not an oracle to copy; document the difference and add the corrected invariant test.

Use deterministic barriers at selected persistence/dispatch/seal/switch boundaries plus real
SIGKILL/restart tests. Test hooks are compiled into test artifacts only, have no public MCP or
operator activation path, and cannot be enabled in the distributed binary. Test clocks can
control unit deadlines; actual process termination/readiness still needs real-process checks.
No arbitrary sleeps as the sole proof that a crash boundary was reached.

### Product identity and design adjustments

The delivered product remains `tdev`: canonical command, package, configuration and documentation
names describe responsibilities. No development-branch names, language-edition names, alternate
runtime switches or permanent old/new implementation selectors belong in the finished product.
Temporary harness launch adapters and reference implementations are removed when their evidence
has been carried forward; historical source remains in Git. Rust/toolchain names in build
metadata and genuine persisted-format compatibility checks are functional information, not
product variants. Unrelated caller examples and user-program language support are retained.

Module layout, libraries, lock granularity and internal representations may improve when a
concrete implementation or measurement justifies it. Update this owner and the affected tests
in the same change; update the plan if dependencies/order change. Record what improved and which
invariants were exercised in LOCAL_VALIDATION. Do not create a parallel design authority or
another roadmap. Changes to product authority/trust, removal of supported behavior, public
contracts or state compatibility are not routine refactors: identify their concrete impact and
resolve them against current user instructions before implementation. User-approved improvements
replace the relevant design, rather than accumulating permanent alternative modes.
