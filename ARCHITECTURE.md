# tdev architecture

## 1. Product and authority

Android + Termux is both the development and normal operating environment. The complete
default path is ChatGPT → Tunnel → localhost tdev → workspace/edit → exec/process →
validate → publish. No Linux host, VPS, SSH, OCI, root, systemd or Docker is required.

ChatGPT chooses strategy, commands, edits, diagnostics, composition and publication.
tdev owns exact repository/ref/source identity, current MCP admission, immutable checkpoint
handling, mutation identity, concurrency and validation/publication joins. Git owns source
and canonical refs; SQLite owns workspace pointers and accepted intents/results; the native
supervisor owns subprocess lifetime; runit owns service restart; Tunnel owns delivery.

User instructions and actual permissions bound work. README owns purpose/current status;
this file owns semantics; contracts/tools.schema.json owns wire types; IMPLEMENTATION_PLAN
owns execution order. AGENTS is navigation. Superseded designs live in Git history.

## 2. Runtime choice and public surface

| Execution choice | Benefit | Cost / boundary | Role |
|---|---|---|---|
| Shell in the user's existing checkout | minimal copying | partial writes, unrelated dirty state and candidate config affect controller operations | rejected as default |
| Native subprocess in a per-operation copy | installed Termux CLIs, no provisioning/cold remote startup | same UID, no hostile-code filesystem/network isolation; materialization/capture cost | default |
| SSH + rootless OCI outer runner | OS isolation and enforceable network/resource controls after qualification | external host/image/SSH maintenance, transfer/cold start and more failure points | optional explicit backend |

Retain workspace/read/edit/exec/process/validate/publish. CLI adapters need no additional
public tools or permission registration. No planner, Task, permission projection,
registry/gateway or per-command allowlist. CLI extensions gain no MCP admin operation;
native programs nevertheless have the real app UID's authority (§3).

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
SSH agent, provider/tunnel tokens, proxy variables or Git global credential helpers. Source
contains credential-free shallow Git metadata, never a copied provider configuration.
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
| workspace | owner, enrolled repo/ref identity, canonical base, checkpoint, busy operation, closed state |
| operation | principal/request digest, exact intent/backend/policy, result and effect certainty |

Operator config owns credentials, repo/ref enrollment, adopted validation and optional
executor selection. No mirrored grant/binding/executor/capability tables. Runner spool
stores accepted input, process observation, bounded output, controls and terminal evidence;
these are execution evidence, not new authority/workflow owners.

Private bare Git stores hold objects; no hard-link correctness dependency. A checkpoint
commit OID is source identity and CAS token. A→B→A bytes have distinct checkpoint OIDs;
no numerical revision. Private index/tree plumbing makes multi-file edits atomic.
Objects are written/pinned before the SQLite pointer/result transaction. Shared FETCH_HEAD
is not used. Concurrent first opens see a completely initialized object store.

Commands materialize an exact checkpoint with shallow Git HEAD. Capture atomically imports
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

## 5. Admission and authentication

Installation bearer maps directly to a principal and exact repo/ref scope. Check current
config on every admission and replay. No permission object per command. Bearer identifies
a credential holder, not a verified ChatGPT account/session. Shared credentials share API
authority. Subject/session headers never grant access.

Tunnel runtime credentials authorize transport; installation bearer protects MCP ingress;
provider credentials authorize publication; local config possession is operator authority.
No One-Time Permit or unverified metadata primitive. Revocation affects subsequent API
admissions/replays; it cannot revoke an already running native process's app-UID authority.
Private config stays outside source; MCP has no config/install/release endpoint. Actual
provider/user permissions remain the upper bound.

## 6. Process, concurrency and recovery

One controller holds a kernel lock released on death; SQLite WAL/FULL transactions do not
span subprocess/network waits. Per-workspace checkpoint CAS/busy ownership prevents silent
overwrite; reads use the last committed checkpoint. Different workspaces/ref tasks proceed
independently. No global stale lock, timeout lease, automatic coordination or planner.

### Progress continuity within a turn and across resumes

The controller-facing state must remain **live and monotonic within the same model turn**.
After the model starts or joins an operation, every bounded wait/status/readback must be able
to observe a same-or-newer operation/frontier revision. If work advances or reaches terminal
state while the model is still in the turn, the next observation must surface that progress;
the model must not remain pinned to an earlier "running", stale snapshot, cached task view or
pre-completion frontier.

The current work frontier is the smallest bounded view that answers: exact current
source/checkpoint and remote head, which accepted effects are terminal, which remain
running/unknown, what resource ownership still requires cleanup, and which next action is
actually admissible. It may be derived from workspace/operation/source state; this requirement
does not introduce a planner or second workflow authority. Frontier observations need an
explicit revision/cursor or equivalent freshness evidence so a caller can distinguish
"nothing changed" from "I accidentally reread an old snapshot".

Completed predecessors are facts, not work to rediscover. **Within the same turn**, once a
predecessor completes, the model must be able to notice that completion cheaply and continue
to the next admissible action. It is a product failure if the underlying work completed but
the model keeps waiting on stale state, starts re-investigating already completed work, or
remains trapped in a live turn without useful forward progress solely because completion was
not surfaced.

Same-turn observation must also be **bounded against stale loops**. Repeated no-change reads
must either expose a newer revision when progress exists or return an explicit current
no-progress/stalled observation with enough provenance to tell the caller what was actually
checked. The caller must not need to keep polling, reinterpret an old snapshot, or invent a
new diagnosis merely because freshness is unclear. A stale progress loop must not be treated
as generic evidence that unrelated authorization, safety or policy state changed. Any guard
or safety gate transition must be tied to a concrete current fact/policy decision, not used as
a fallback escape from ambiguous progress state.

The observed failure mode motivating this invariant is stronger than a slow resume: the model
can stay inside one turn after the underlying work already advanced, lose its sense of what is
complete/current, repeatedly inspect or question the same work, and eventually drift into
defensive/guard-oriented checks instead of continuing the development path. Whether a specific
external safety system caused that drift is not assumed here; tdev must remove the stale,
ambiguous control state that permits the loop in the first place.

The same invariant applies after a fresh model turn, reconnect or controller restart. Resume
must recover the current frontier from durable product state without replaying chat history,
scanning an unbounded event log, or re-running completed stages merely to discover that they
already finished. If external state advanced, the resumed view reconciles that fresh evidence
with durable state and moves forward from the newer proved state.

A successful progress observation or resume is therefore not just "correctly rebound".
Unless there is a genuine external blocker or unresolved unknown effect, the model must be
able to continue useful work in the same turn after observing progress. Progress reporting
must be cheap enough to call routinely and specific enough to distinguish completed,
in-flight/unknown, blocked and next-admissible work.

Resource lifecycle is part of the same invariant. Finishing one controller/session must not
make its clean owned resources impossible to inspect or retire from a later authorized
maintenance/resume path. Terminalization may seal mutation authority, but it must not create
an orphan state that requires bypassing the product API for cleanup.

Acceptance must exercise both **same-turn live progress** and fresh-session/reconnect/restart
at multiple cut points, including after a predecessor completed but before its caller observed
completion. A same-turn waiter must observe the terminal transition and continue; a resumed
client must recover the same or newer frontier, skip proved-complete predecessors, preserve
unknown effects without replay, expose any required cleanup, and continue useful work without
an unbounded historical reconstruction step.

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
Only the affected workspace is fenced. Do not invent successful receipts or recapture
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
URL/full ref; local bare fixture identity is device/inode. No guessed targets/wildcard refs.

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

No initialize/initialized, transport session, GET/DELETE stream, SSE resume or automatic
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

Runit services and bounded logging are separate from coding calls. Inactive installation
stages a verified bundle and DOWN templates; rollback checks schema and outstanding effects.
Production activation needs explicit authority. Bundle verification is not protection from
hostile same-UID code. Native runner is included without extra executor enrollment.

## 9. Evidence and acceptance

Termux-native subprocess tests, HTTP full coding path, restart, cancellation, environment
hygiene, exact publication and inactive packaged rehearsal are primary local evidence.
Measured results belong in LOCAL_VALIDATION; completion belongs in README. No fixture result
is hostile-code sandbox proof. Remaining host acceptance is actual ChatGPT/Tunnel discovery,
bearer forwarding and reconnect, not Linux machine provisioning.

References: [Git CAS](https://git-scm.com/docs/git-update-ref),
[Linux subreaper](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html),
[process start identity](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html),
[MCP 2026-07-28 HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover),
[OpenAI MCP server](https://developers.openai.com/plugins/build/mcp-server),
[OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
