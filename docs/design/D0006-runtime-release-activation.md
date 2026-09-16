# D0006 - Runtime and release activation

- Design: `D0006`
- Title: `Runtime and release activation`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003]`
- Supersedes: `[]`
- Directive: `r7`
- Owns: `runtime-topology, release-activation, toolchain-seal`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.




## Problem

A generic persistent Linux server and unrestricted inbound endpoint are not the
user's actual first-release environment. Android may suspend or kill control code,
while ChatGPT needs one stable workers.dev origin and exact durable work recovery.

## Required outcome

Operate the control plane on the existing Termux device, keep public ingress on
workers.dev without another server/tunnel, preserve parallel exact development,
and make partial connectivity/deployment failures observable and recoverable.

## Facts / assumptions / unknowns

Mutable installation identities, provider permissions, quotas, latency and deployment
state are observations, not Design facts; rebind them from the installed runtime and
provider when a decision depends on them. No paid capability or uninterrupted Android
lifetime is assumed.

## 1. Decision: selected runtime topology

The operational control runtime is a native Termux/Android Node process. It owns
repository bindings, bounded source discovery, immutable Git candidates, the local
SQLite work ledger, authorization decisions and canonical Git integration. SQLite
WAL/FULL and exclusive owner locking are checked on the app-private filesystem;
there is no mandatory Ubuntu host, VPS, VM, systemd or inbound device port.

ChatGPT connects to one canonical **workers.dev** MCP origin. A small Worker handles
public protocol/authentication and routes requests through one Durable Object per
installation to the device's outbound authenticated WebSocket. The DO exists only
because arbitrary Worker instances cannot address a particular outbound device
connection using local memory. It owns connection routing, not work admission,
scheduling, repository state, validation eligibility or canonical completion.
There is no D1/R2/Queue or copied cloud work ledger in this release topology.

Untrusted build/test execution uses bounded, ephemeral GitHub-hosted sessions;
D0005 owns their trust boundary. Sessions connect outward to the same Worker route.
They need no public URL or user-maintained server. Termux remains indispensable
operationally; it is not demoted to an optional test client. Device unavailability
is exposed honestly rather than papered over by a second control-plane owner.

Actual Worker name, account/subdomain, origin, Access application, credential grants
and deployed versions are installation bindings. No dev-2 resource is presumed to
exist from a naming convention. Installation seals require provider readback that
origin is HTTPS, an exact workers.dev hostname, enabled for the selected Worker,
and protected by the explicitly adopted dev-2 Access application (D0005). Previews remain disabled.

## 2. Bounded transport, disconnects and Android lifetime

The channel carries only versioned dev-2 envelopes and bounded exact-object chunks,
not arbitrary TCP, HTTP proxy targets, local file paths or public shell commands.
It is a product transport over the existing public ingress, not an ngrok/tunnel
service or a changing endpoint. Each connection has a fresh opaque transport nonce.
The DO retains only authenticated connection attachment data required for hibernation;
transient request state may be lost. No work identity depends on a connection, session,
DO identifier, socket, process ID or one of eight numbered slots.

For each HTTP request the router assigns a fresh correlation ID, records the exact
connection nonce and a deadline, then forwards the typed body and verified identity
assertion. Defaults: at most 128 outstanding requests, 8 MiB aggregate retained body
bytes, 1 MiB request, 256 KiB response, 64 KiB object chunks and 30 s transport deadline.
These are resource policies, not work/concurrency identity ceilings. Backpressure
returns a typed capacity error; it does not retain a second queue. Body/frame byte
limits apply while streaming, before allocation and decoding. Reject wrong-connection,
late, duplicate, oversized and unknown replies without completing another request.

No connection before forwarding means not sent. A timeout/disconnect after forwarding
means delivery may have occurred: report `EXECUTION_UNAVAILABLE` with same-request
retry guidance, never assert no mutation or cancel a work. Retrying the same logical
request reaches D0001 authorization and durable deduplication. Replacing a connection
fails pending observations as uncertain and fences old transport replies; it never
steals the SQLite owner lock or creates a replacement work. DO restart/Worker deploy
may drop in-flight responses; the same rule applies. Idle WS hibernation is an
optimization, not promised uptime, free active waiting or durable work execution.

When the device is offline, immutable tool descriptors and edge health may be read,
but current repository discovery, new admission and authoritative work observation
return unavailable. A cached last-seen timestamp is explicitly stale. No task-specific
scope or redeployment is necessary on reconnection. Exponential backoff with bounded
jitter reconnects only while the Android process is alive; no wakeup guarantee is made.

A Termux runit service is the selected normal launcher, with an explicit foreground
launch for diagnosis. It is not systemd and cannot override Android suspension,
force-stop, reboot or power loss. On restart reacquire the actual OS/SQLite lock,
advance the owner epoch, adopt retained attempts, reconcile provider effects, and
then admit conflicting mutations. Never use timeout expiry to prove an old writer
has died. A short relative UNIX socket or loopback connection avoids deep-path socket
limits; it is neither a public ingress nor an authorization boundary by itself.

## 3. Managed execution sessions without a permanent server

A session is an elastic execution resource, not a Work/Case/Agent or another model.
Its durable intent and selected provider run are stored alongside the existing work
ledger. The existing ready-work admission selects attempts independently; there is
no session-owned queue. Default execution capacity remains 8 and may be 1/16/32 or
other positive values subject to measured resources, without schema or identity changes.

Use the existing GitHub repository and a trusted push-triggered execution workflow
at an already approved runtime commit. Admission creates a deterministic auxiliary
ref under an installation-authorized `refs/heads/dev2-exec/` prefix pointing to that
exact approved commit. No candidate code, workflow edit or new source commit is
published to start execution. This avoids assuming `workflow_dispatch` exists on
the repository's unrelated default branch. The GitHub App/provider credential must
be allowed to trigger workflows; a recursion-suppressed GITHUB_TOKEN is not substituted.
Provider policy rejection remains an explicit installation/availability blocker.

Persist `sessionId`, ref, approved commit/workflow digest, deadline, requested
resources and provider intent before creating the ref. On response loss inspect
the exact ref and workflow runs, never create a new session ID blindly. Validate
OIDC plus GitHub readback as D0005 requires, then CAS-select one run_id/run_attempt.
Only that run gets assignments. Other duplicate runs exit without candidate work.
Operational refs are separate from canonical source, included in provider-operation
metrics and deleted only after the exact selected run is terminal and retained
session evidence is sufficient. No write or force-update of the default branch.

One bounded session may run several independently isolated attempts to amortize
provider startup across a development burst. Defaults: 60 s idle grace, 15 min
session lifetime, no admission whose declared deadline exceeds remaining lifetime,
and a provider job timeout slightly longer than the controller's cleanup deadline.
Capacity accounts for total memory/PIDs/disk/CPU, not merely process count. A profile
that cannot fit returns explicit capacity unavailable; it never quietly runs eight
heavy tests on a phone. When capacity increases, use additional bounded sessions
rather than changing work IDs. Session draining does not hold a repository-wide lock.

Source and results travel as manifest-bound immutable objects through authenticated
chunk transfer. The helper recomputes their digests; no candidate gets device/provider
credentials or a writable control checkout. Warm object caches are content-addressed
and reverified, never shared writable candidate directories. If the device disappears,
active attempts obey local enforced deadlines; results await reconnect only within
the session lifetime. A terminal host run without a recovered receipt yields interrupted
validation, not PASS. Replay requires proof the old run/attempt has ended. Candidate
commands have no canonical effect, and canonical integration remains on the device.

Managed execution is an explicit dependency and potential latency/quota bottleneck.
It uses a capability already observed within the user's GitHub foundation; it does
not assume a new user-owned server. Per-attempt cold CI jobs were rejected as the
normal burst path because startup would repeat unnecessarily. Warm-session benefit,
provider quotas, actual 8-way execution and cold performance still require measurement;
D0007 may reject this placement. No paid plan or higher runner quota is assumed.

## 4. Toolchain and reproducibility

A logical validation profile has one meaning across environments; an execution seal
identifies the actual implementation. `config/toolchain.lock.json` selects exact
Node/platform/architecture/SQLite variants. Initial native control target is the
observed Termux nodejs-lts 24.18.0-1, Android arm64, Node 24.18.0 and SQLite 3.53.4;
Linux CI uses existing checksum-pinned Node 24.21.0. Native canonical Git remains
2.55.0 and Python >=3.12. The credential-free managed validation image has a
separate exact implementation: the digest-pinned image observed in provider run
34663351658 contains Git 2.47.3 and Python 3.13.5. The former universal Git2.55
assumption was falsified by that real image, not by a fixture. Its linux-x64 Node
variant, image digest, Git and Python versions are explicitly pinned together in
`managedImage`; only the fixed installed managed entrypoint selects it. This does
not change the canonical writer, required tests, identity/state semantics or allow
automatic version fallback. The full integration suite must run on both variants.
Native binary digests/package versions are recorded, not silently reported as Linux.
Unknown/mismatched variants fail closed; no universal host path or automatic version
range fallback. Dependency versions/integrity are locked, lifecycle scripts disabled.

Native/CI test results are different execution identities and cannot substitute for
each other where the required environment differs. An installation seal additionally
pins device launcher/config, Worker artifact/compatibility date/namespace, auth profile,
trusted execution workflow/controller, exact sandbox image/engine/enforcement and
permissions. A source-level toolchain match is not an installation or sandbox seal.

## 5. Self-update and partial activation

`release.stage` assembles an immutable integrated-source release with device artifact,
Worker artifact, protocol compatibility, schema/ledger range and required receipt
identities. It does not switch active code. `release.activate` requires a current
runtime capability and expected old component identities. One tiny fixed helper,
installed with dev-2 and outside replaceable broker code, persists an activation
intent in app-private storage before touching any active pointer or provider effect.
It invokes only sealed deployment/launcher operations, never a shell supplied by source.

Order: prepare/stage the Worker version without routing traffic; verify the old/new
channel compatibility; activate a backward-compatible edge version and read back the
exact version/traffic routing; drain only affected local work/effects; prove old local
writer stopped; atomically replace the device release pointer; launch via the existing
Termux service; health-check fresh MCP and local release identities; persist terminal
activation. If either side fails, restore the compatible prior edge/device pair and
read it back. Each provider intent retains exact expected/new IDs across response loss.
The helper can resume from its journal on the next Android launch; it is not assumed
to survive app force-stop. Breaking cross-component or destructive ledger migrations
require an explicitly designed procedure, not an ordinary rollout or hidden fallback.

The edge and device do not share an atomic commit. Report `activating`, `rolled_back`,
`blocked` or exact `active` component identities; never call a mixed version terminal
success. `activeRelease` identifies the verified device/edge/controller bundle, while
repository HEAD and stagedRelease are separate facts. Candidate source may integrate
without changing the active runtime. No manual task-specific Worker redeployment is
part of ordinary forward development after this release capability is installed.

### Fixed helper and native control contract

The selected fixed helper has one app-private activation journal and runs outside
replaceable broker code under the existing Termux launcher. It is not another work
owner or job queue. Native-to-helper calls are a closed private vocabulary: helper
status, exact inactive-version upload/reconciliation, activation begin/observation,
and explicit operator rollback of the latest successful activation. Explicit rollback
accepts only that activation ID; the helper derives the exact retained previous pair
and retained admitted artifacts internally, so the caller cannot supply a target,
build, provider operation or command. Its deterministic reverse activation identity
makes response-loss retry observational rather than duplicative. This remains a
private fixed-helper/operator boundary, not a fifth public MCP tool. Helper-to-native
calls are status and drain for one retained activation. A bounded
loopback endpoint avoids Android deep-path UNIX-socket limits; it is never exposed
as public ingress. Private role-specific HMAC keys, fresh server nonce, bounded
request lifetime, exact request identity, strict canonical records and authenticated
responses bind each call. Loopback, PID, endpoint filename and annotations are not
credentials. The endpoint transports only typed records, never a shell, command,
provider URL, candidate path or arbitrary filesystem operation.

Endpoint/request lifetimes provide transport fencing, not external-effect stop
proof. A disconnected or timed-out call may have been applied. Every side effect
still uses the original action/activation/effect identity and the existing journals;
only exact observation can release uncertainty. Status/observation never create a
replacement operation. Old instance responses cannot complete a new server's call.

Before switching a device pointer the helper verifies the selected runit service
has stopped, obtains the real exclusive SQLite writer lock without advancing work
owner state, and proves every retained canonical Git sender stopped under its own
OS lock. Broker exit or elapsed time alone is insufficient because a Git child may
outlive it. Drain waits only on affected running actions/effects, excluding the
activation action that requested this exact handoff; idle retained works survive.
An unknown sender fences the rollout, not unrelated source reads or work. A fixed
launcher acquires the shared OS pointer gate before reading the atomically replaced,
private artifact-bound device pointer and inherits the gate through exec into Node.
The writer fence requires the exclusive gate, preventing an old pointer read from
starting after a switch. The launcher verifies the fixed Node binary, staged bundle,
private native-config digests and closed environment before execution.

The fixed runit sender addresses only the installed service's documented runsv
supervise/control FIFO, with nonblocking single-byte u/d writes. It verifies the
sealed service run file and rejects control/finish customization. It retains intent
and a sent marker before the write, without a child process that could outlive the
helper and send a delayed command. A desired wanted-state readback acknowledges the
same retained FIFO effect; missing readback remains uncertain and is not resent.
An already desired state emits no redundant command. Inspecting a never-started
sender fences its delayed launch under the same lock. None of these observations
substitutes for the exclusive SQLite/all-Git-senders proof before pointer switch.
These operations implement the documented runsv(8) control interface, not a new
service manager or force-kill policy. Actual Termux recovery remains a separate
acceptance requirement from deterministic FIFO/launcher tests.

The helper reads back exact edge routing and fresh native component health before
recording active or rolled_back. Unchanged device bytes do not trigger a restart;
unchanged edge bytes do not trigger a deployment. A mixed pair is never terminal
success. The exact previous pair remains retained until rollback is no longer
needed. Restart reopens the same helper journal and reconciles its fixed effects.
Native update eligibility is derived from the validated release admission and
existing approved executor enrollment, not a forged native-test report or repeated
operator commissioning. Required core/integration receipts remain mandatory.

Managed release artifact construction is a finite credential-free execution of
fixed build outputs under D0005 containment. Its trusted outer artifact receipt
binds the exact integrated source, profile, controller, run/attempt and three fixed
bundle/descriptor objects. It is not the full D0007 release/live aggregate: actual
paired activation, physical environment and recovery proofs remain separate gates.
No candidate build or install hook executes in the device/helper credential UID.

Falsifiers include forged/wrong-role or old-instance private calls, response loss
after durable effect admission, a live inherited Git-sender lock after broker exit,
changing a staged object, partial routing, unsolicited pointer changes, and restart
between stop/switch/start. Rejecting these must not relax the ordinary schema,
create a second work owner or require a task-specific runtime redeployment.

## 6. Alternatives, bounds and acceptance evidence

A generic Linux service and public reverse proxy fail the operating-environment requirements in DIRECTIVE Section 6. A cloud
work ledger would duplicate local recovery and create a second integration authority.
Stateless forwarding cannot find an outbound device socket; polling/mailboxes add
normal latency and retained messages, so a routing-only DO is the smaller choice.
Cloudflare Containers require an unverified paid entitlement; new APK/VM isolation
has no current deployment/performance proof. None is selected merely because a
predecessor or prompt mentioned it.

Release evidence must exercise the native device, actual workers.dev route and managed
execution separately and together: offline admission/readback, WS reconnect/Worker
restart, stale connection reply rejection, 8 concurrent isolated attempts, quota failure,
OIDC replay, exact-object corruption, Android process restart, source-vs-runtime identity,
partial edge/device activation and rollback. Device sleep/app kill/reboot remain distinct
experiential tests. No installed dev-2 origin or production execution seal is claimed
until those relevant provider operations and readbacks actually occur.

## Implementation consequences

Implement the native runtime variant, routing-only Worker/DO adapter and outbound
device connection before public composition. Join existing repository/work modules
without another ledger. Add managed-session provider effects under current work
admission, then the sealed helper and paired edge/device activation path. Derive
actual resource identities from installation readback, not example hostnames.

### Initial managed-session identity adapter

The trusted push entrypoint is `.github/workflows/dev2-executor.yml` at the exact
approved launch commit/ref. Its enrollment proof binds installation/session,
immutable repository/owner IDs, `refs/heads/dev2-exec/<sessionId>`, workflow_ref,
workflow_sha, sha, run_id, run_attempt1, push event and github-hosted environment.
Fresh authenticated provider readback must independently agree on run/attempt,
head/ref/workflow/event and active status. The verifier yields an executor role,
not a user principal or evidence that the sandbox/receipt/result is valid.

The verifier is a deterministic predicate; installing it does not implement a
launch controller, OIDC endpoint, job lease, hosted sandbox or public gateway.
Use one selected rendezvous and one explicit application-authentication adapter.
Neither compute enrollment nor transport correlation creates another work owner.


## Installation and cutover boundary

Use the verified canonical workers.dev origin without adding a predecessor compatibility layer to the active product path. Unrelated provider resources and predecessor source/history remain untouched. Any adopted human Access registration follows D0005, while routing/device state remains separate from predecessor work/request state. Installed source and runtime identity must be immutable/readable enough to distinguish current source, staged release, active release, and unavailable capabilities without implying qualification from installation alone.

### Bounded installation readback

The separately authenticated device-role installation channel may expose fixed
status/discovery readback and a fixed read-only native self-probe. The probe selects
no arbitrary tool, path, principal or mutation: it binds current context, reads
AGENTS/WORKBOARD and observes runtime/open work using a read-only local operator
capability. It exercises the deployed route before client Refresh without forging
human OAuth evidence. Device credentials never authenticate /mcp, every normal
routed tool call still verifies the actual Access assertion natively, and public
tool names remain exactly the selected four. Evidence must label this installation
probe separately from the first refreshed ChatGPT human OAuth invocation.

### Managed idle retirement and never-assigned resource replacement

An idle executor must request retirement from its authenticated native session owner
before exiting. The private `retire` operation atomically orders against dispatch:
if a pending assignment exists it is offered and the session continues; otherwise
the native session enters closing before acknowledging retirement. Closing sessions
cannot receive new dispatches. Lost retirement responses repeat the same session
operation; they do not prove termination. The public four-tool schema is unchanged.

A retained dispatch whose selected provider session is positively closed may acquire
a replacement execution resource only when no assignment was ever offered, its
original work/attempt is still current, cancellation is absent and its unchanged
input deadline still accommodates the complete profile. Preserve assignment ID,
input digest, action, work and attempt, and retain each prior session ID in the same
dispatch record. A prior offered/running/stopped assignment, unknown provider state,
expired deadline or stale owner forbids this replacement. This is resource admission
before any candidate execution, not replay of a possibly executed effect. Session
intent and each provider launch retain their separate durable identities. A bounded
64-entry replacement history is storage/retry policy, not a work-concurrency ceiling.

Acceptance races idle retirement with a new dispatch, loses the retirement response,
and closes a selected provider run before any assignment. The same immutable input
must complete on one replacement resource, while uncertain/offered assignments never
launch replacements and unrelated work continues. Insufficient remaining lifetime
must reject before dispatch, without lowering the required validation profile.

## One runtime with controller and target bindings

C2-1 keeps one installed device process, one edge service/rendezvous and one managed
trusted controller while allowing multiple binding-scoped development engines behind
that installation. The historical enrolled repository/ref remains the
**controller binding**: it identifies the trusted controller source, workflow/OIDC
launch authority and operational `dev2-exec/*` refs. Adding a target repository does
not copy those operational refs into the target canonical namespace and does not
turn the target repository into controller authority. D0008's retained enrollment
is not rewritten merely to add a target binding.

Secondary binding administration does not rewrite an immutable release artifact,
helper-admitted device pointer or release ID. D0005's private binding-registry overlay
is retained under the installation state directory and re-applied by every native
release at startup. Adding a binding therefore requires a bounded native quiesce,
exact atomic registry replacement and restart of the same device service, not another
Worker/device installation or source-scoped runtime. The workers.dev gateway already
authenticates the human application and forwards the requested repository selector;
all repository/ref authorization remains native, so an additive binding does not
require a Worker deployment. Release drain/writer fencing still covers every engine,
ledger and sender materialized from the effective registry, and a later release
continues to read the same private registry before accepting work.

Each managed assignment additionally binds the exact target repositoryId,
bindingEpoch, canonical ref and immutable candidate/result source identity it is
executing. The controller provider run may originate in the controller repository,
but its receipt authorizes only that target tuple and selected compatible policy;
it grants no target canonical writer credential. Validation/integration remains on
the target binding's D0003 owner. Session reuse across target bindings is permitted
only when the retained assignment/protocol proves exact target identity separation;
response-loss, replacement and retirement continue to use the original C1 session,
assignment, provider-run and operational-ref identities.

One installation-wide execution arbiter enforces the configured capacity across all
target engines. Binding count cannot multiply managed-session/provider-run capacity.
Release drain covers every installed engine. The fixed writer fence must acquire
all retained binding SQLite owner locks and all binding-scoped Git sender locks
before switching the one installation pointer. Secondary ledgers live in the fixed
`binding-ledgers` sibling of the primary ledger; their filenames bind the complete
immutable Binding digest. Sender roots use that same Binding under their distinct
sender-domain digest. Retained removed epochs are included: absence from current
discovery does not prove an uncertain sender stopped. Unknown files, foreign
installation identity or any held lock block the switch without stealing ownership.
The primary/controller binding continues to own `policy.adopt`, release build/stage,
activation and runtime source migration in C2-1; those operations reject secondary
target bindings. General multi-repository release orchestration is not introduced.

Live acceptance requires at least two separately authorized repository/ref bindings
served without Worker/device replacement: current context/read on both; isolated
create/edit; required validation and exact integration on both; concurrent work with
total capacity unchanged; wrong-binding negatives; response-loss/retry without a
second logical action or provider execution; and terminal managed-session and
operational-ref retirement preserving C1. Normal product use must not require TMCP,
direct GitHub mutation or manual MCP rebinding between the two targets.

## Bounded public-contract migration

Ordinary activation remains a same-public-schema operation. `compatiblePair` continues
to require equal schema digests and may not be weakened merely because a new source
was validated. D0004 owns whether a specific descriptor transition is backward-input
compatible. A different schema digest may activate only through the separate
`public-contract-v1` procedure below; a transition outside that bounded predicate
requires another Design revision.

`release.stage` is intentionally less restrictive than activation. It may prepare an
inactive release whose schema differs from the active release after native production
receipt verification. Schema identity is derived from the exact receipt-bound
`tools.json`, and every staged artifact store, helper admission, provider upload and
private device-config preparation verifies that release's manifest/tools identity.
The currently installed helper or broker schema is not a second authority for the
candidate release. Staging still preserves the four tool names/annotation policy and
per-release installation seal, executor, repository, epoch and artifact digests.
Staging a different schema does not make it activatable.

For a staged target with a different schema, the native owner loads the immutable
active and target `tools.json`, runs D0004's structural `public-contract-v1` checker,
and freezes its transition digest before asking the fixed helper to begin. The
activation intent carries a versioned migration record binding previous/target schema
digests and the transition digest. The fixed helper independently re-reads both
retained artifact sets and recomputes the same transition before journaling the
activation. No caller-supplied boolean, repository prose or candidate output can
select migration eligibility. Protocol overlap and the current ledger version remain
mandatory; destructive ledger migration is still outside this procedure.

The migration uses the existing single activation journal and the same exact provider,
writer-fence, runit, pointer, health and rollback effects. It does not create another
release owner. Edge activation, device drain/stop, pointer switch, device start and
paired readback remain recoverable by the retained activation identity. If the
transition predicate, artifact verification, active-pair precondition or any later
readback fails, the existing rollback target is the exact previous pair. A response
loss never creates another migration or provider deployment.

An explicit post-activation rollback (including failed old-client acceptance)
derives only the latest successful activation's exact previous pair. For a schema
migration the helper independently rechecks the retained **forward** transition,
then records its digest and `rollbackOf` activation identity in the reverse intent.
Removal of additive fields is not a newly eligible forward migration. Native
`begin` rejects caller-supplied rollback records; only the existing helper rollback
operation derives them. Automatic failure rollback retains the original intent.

Fixed release infrastructure must be schema-neutral after this revision. The helper,
release artifact store, Cloudflare staging adapter, private device-config preparer and
fixed launcher validate the schema named by each immutable release rather than pinning
all future releases to the schema compiled into the helper itself. The launcher still
accepts only a helper-admitted pointer and exact artifact/native-config digests; this
change removes a duplicate schema owner, not an integrity check. The helper's own
code/config identity and installation seal remain fixed and independently verified.

### Pre-migration native bridge

A fixed-files-only repair is insufficient when the currently executing native broker itself predates this migration procedure: that broker may reject the new schema while decoding the managed build or while forming the staged pair before the repaired helper is ever consulted. The bootstrap therefore begins with one ordinary **same-public-schema bridge release**. Its public `tools.json` and externally observable four-tool behavior are byte-contract-equivalent to the currently active schema, while its private release broker implements the schema-neutral staging and `public-contract-v1` machinery in this section. It is an exact required-validated integrated source release and is staged and activated only by the existing ordinary same-schema path; no repair tool writes the active device pointer or Worker deployment to create the bridge.

The bridge may retain newer internal multi-binding implementation only behind the old contract, but it must not expose the new repository selectors/discovery fields, change old call/output semantics, or introduce a runtime-selectable compatibility flag. Its purpose is solely to move the installed native release owner onto migration-capable code while the public contract remains unchanged. Exact live readback must prove the same old schema and old call shapes after bridge activation. If the ordinary bridge activation fails or rolls back, no fixed-file bootstrap proceeds.

After the bridge is active, perform the fixed helper/launcher repair below. The bridge native owner can then stage the final required-validated new-schema source, compute the exact active-to-target `public-contract-v1` transition and drive the normal retained activation. The final migration removes the need for the bridge contract; it is not a second long-lived public owner or an alternate release path. Future eligible migrations proceed directly through the schema-neutral product path without recreating a bridge unless a separately Designed migration changes the release machinery itself.

### One-time bootstrap repair of pre-migration fixed files

The installed first-release helper/launcher predates the schema-neutral rule and can
therefore deadlock the very migration that replaces the public contract. For this
specific self-hosting bootstrap defect, an authorized development/repair tool may
replace only the fixed helper bundle, its bound helper-bundle digest, and the fixed
device-launcher bytes with required-validated canonical versions implementing this
section. This is not ordinary release activation and is not evidence that normal tdev
operation depends on that repair tool.

The same bounded repair also replaces the fixed writer-fence helper and its digest
in helper configuration when enabling multi-binding: a primary-only fence cannot
prove installation-wide writer termination. No writer-fence paths, credentials,
service configuration or ledger contents are changed by this repair. The backup,
quiescence, atomic replacement and restoration rules below apply to these bytes too.

Before the bootstrap, prove there is no active activation journal/effect, record the
exact running device/helper identities and retain byte-for-byte backups of every file
to be replaced. Stop only the helper service; do not change the active device pointer,
Worker deployment, work ledger or canonical source. Install the new fixed files by
private same-filesystem atomic replacement, restart the helper, and require fresh
private status to report the exact same retained active pair while the original device
process continues unchanged. Any failure restores the old files/config and restarts
the old helper before other release work. The launcher replacement is inert until a
later device start. The bootstrap performs no provider deployment and no pointer
switch.

### One-time bridge-native projection repair after live falsification

The same-schema bridge can still expose one narrower self-hosting catch-22 that is
not a reason to widen the fixed-file repair above. Production restore may advance
the retained active policy while a stale in-memory binding clone used by release
authorization keeps the initial enrollment digest. If an exact `release.stage` for
a required-validated canonical successor terminates `FORBIDDEN` before any builder,
provider or helper effect, and the canonical successor contains the required-validated
correction that projects the retained policy owner into runtime binding views without
changing repository/ref/epoch identity, then the running bridge cannot use its own
ordinary release path to install the correction. This falsifies only the assumption
that every successfully activated bridge can stage the final migration; it does not
authorize a generic broker patch, alternate activation mechanism or permanent repair
runtime.

For this exact post-bridge bootstrap failure, an authorized development/repair tool
may run a one-shot **bridge-native recovery owner** under all of these bounds. It
materializes an isolated source tree at the exact active bridge commit and applies
only the exact policy-projection source delta from the current required-validated
canonical successor. Before use, prove the resulting public `tools.json` is exactly
the active old schema, repository/ref/epoch semantics are unchanged, the repair tree
has no unrelated delta, and the original public `release.stage` failure retained no
build/upload/helper effect. The repair source is execution evidence only: it is not a
new canonical source commit, release identity, public schema or long-lived installed
runtime.

After proving no active activation and no unresolved canonical/release effect that
would conflict with the repair, stop only the replaceable device service. Leave the
fixed helper, edge deployment, active pointer, release artifacts, ledgers, credentials
and canonical Git ref unchanged. The one-shot owner must compose the existing native
runtime classes from that bridge-compatible repair tree with the exact installed
native configuration, ledgers, grants, production enrollment, managed builder and
fixed helper admission. It may derive only the currently installed owner subject and
`runtime.activate` capability already present in the retained trusted grant; no caller
may choose a subject, capability, path, repository, build command, provider operation
or helper target. The normal recovery path remains `release.stage` and `release.activate` for one
exact current required-validated integrated canonical commit and the exact retained
active release. If correcting the projection makes the current adopted policy differ
from the policy on that commit's retained validation/integration evidence, release
authority must not waive or reinterpret that mismatch. Before stopping the old bridge,
the ordinary tdev client may create/edit exactly one open Work whose frozen candidate
adds or strengthens regression coverage for this observed projection failure and has
no active Action. The repair tool does not choose, generate or alter those source
bytes. After the one-shot owner restores the current adopted policy, it may invoke the
existing typed `validate` and `integrate` operations on only that pre-existing exact
Work/generation under the restored policy. Only the resulting exact required-validated
canonical commit may then enter `release.stage` and `release.activate`. Any stale
revision/base, validation failure, integration conflict or changed candidate aborts
the bootstrap and restarts the unchanged bridge; it is never a policy waiver or a
reason to manufacture another candidate while the repair owner is running.

All consequential effects still belong to the normal owners: integrated-source
verification and the managed release builder produce the exact release, staging uses
the retained provider effect, and activation uses the fixed helper's existing journal,
writer fence, pointer switch, runit control, health check and rollback. The repair
owner may not write the active pointer, release artifact store, provider deployment or
helper journal directly. If staging does not reach an exact retained staged release,
close the one-shot owner, prove its ledger lock is released and restart the unchanged
bridge service; no replacement stage/activation is invented. If activation is
admitted but its response is lost or remains nonterminal while the helper stops the
broker, close the one-shot owner so the existing helper/writer fence can proceed and
recover only that same activation identity from the newly started canonical runtime.
Never start a second activation because the repair process exited.

Successful recovery is complete only when the normal installed runtime reports the
exact new active pair, the one-shot process is absent, the original bridge remains
only rollback evidence, and subsequent release/self-development operations no longer
require the repair tool. The D0004 old-shape live proof still occurs before client
Refresh, followed by refreshed multi-binding acceptance. Fault acceptance for this
exception includes pre-effect `FORBIDDEN`, unrelated-delta rejection, wrong old-schema
rejection, failure before staging, response loss after helper admission, exact
activation recovery and rollback to the original bridge pair.

After that repair, a retained exact production build for the already validated C2-1
source may enter `public-contract-v1`; the migration must then pass D0004's old-shape
live client proof before client Refresh. Once a schema-neutral helper/launcher and a
schema-neutral native release are active, future eligible additive migrations use the
product release path itself and require no TMCP, direct provider mutation or manual
MCP rebinding. Acceptance includes bootstrap rollback injection, staging a different
schema without activation, rejection of a narrowing schema, migration response loss,
paired rollback, old-shape live client use before Refresh and refreshed two-binding
use afterwards.
