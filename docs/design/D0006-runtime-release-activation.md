# D0006 - Runtime and release activation

- Design: `D0006`
- Title: `Runtime and release activation`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003]`
- Supersedes: `[]`
- Directive: `r8`
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
repository HEAD and stagedRelease are separate facts. `stagedRelease` is only a
forward-staged candidate newer than the current active release boundary. Immutable
`release.ready` rows older than the ready row for the verified active pair are
historical activation/rollback evidence and must never resurface as a staged candidate;
projection scans newest-to-oldest and stops when it reaches that active ready row.
Candidate source may integrate without changing the active runtime. No manual
task-specific Worker redeployment is part of ordinary forward development after this
release capability is installed.

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

C2 identity migration makes `tdev.private-rpc.v1` and `x-tdev-private-mac` the
current private transport identities. A current server may authenticate the exact
legacy `dev2.private-rpc.v1` / `x-dev2-private-mac` pair only as a bounded rolling
upgrade alias and must answer in the same authenticated family. A current client
tries the current family first and may retry the exact same canonical request under
the legacy family only after an explicit authentication rejection proves that no
handler/effect ran. Timeout, disconnect, partial response, or any other unknown
transport outcome never authorizes family fallback or replacement execution.

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

### Retained sender identity and startup-unverified rollback

C2 identity migration does not rewrite a retained pre-C2 canonical Git-sender
configuration. New sender configurations and environments for every binding use
`TDEV_GITHUB_TOKEN_FILE`. When an explicitly installed primary or secondary sender
configuration predates C2 and is otherwise byte-for-byte the current expected private
scope for that exact binding, the runtime may accept exactly one legacy alternative
in which that single environment key is `DEV2_GITHUB_TOKEN_FILE` at the identical
sealed token path. A secondary legacy alternative is eligible only for the exact
`bindingProviders[].gitSender` association selected by the retained installation
binding registry; namespace/path discovery alone cannot authorize it. The runtime
must reject a mixed configuration, both keys at once, any path/value difference,
any other scope difference, an unknown binding or a missing provider association.
The validated retained configuration itself is used to instantiate that sender; it
is never rewritten in place merely to normalize the namespace.

The same exact-retention rule applies to the immutable pre-C2 production enrollment's
approved source manifest. Current repository reads and all new commissioning/enrollment
writers use the `tdev` source-manifest identity. When, and only when, the selected
retained production controller is the legacy `dev2` workflow family, verification may
also accept its stored approved source-manifest digest if the existing repository
legacy-manifest reconstruction proves that digest over the exact same approved source
entries. The approved commit and tree still match exactly, the recomputed managed
controller identities still match exactly, and arbitrary or unrelated manifest digests
remain invalid. A current `tdev` production enrollment never gains this alternative,
and the retained enrollment is not rewritten or re-sealed to normalize the digest.

The immutable pre-C2 managed/private enrollment follows the same bounded source-manifest
rule across its whole qualification proof, not only its top-level approved digest. For
the retained `dev2` managed workflow family, the stored `approvedSourceManifestDigest`
must first be proved by the existing current-or-exact-legacy source-manifest reader over
the exact approved source entries. The retained controller report and both required
profile result input/output digests must then equal that same stored approved digest.
Commit, tree, controller identities, provider/OIDC/containment evidence, canonical
ruleset and native join remain independently exact. A current `tdev` managed enrollment
accepts only the current source-manifest digest, all new qualification/enrollment writers
remain `tdev`-only, and no retained evidence is rewritten or re-sealed during startup.

Fatal device startup telemetry must survive the fixed service logging boundary. The
retained Termux device service log receives the device process stdout while stderr is
not a durable diagnostic channel, so a startup failure before native private control
is available emits exactly one closed stdout record containing only `event` and the
typed `code`; it must not include an exception message, stack, path, credential or
other ambient detail. This diagnostic record does not acknowledge startup, satisfy a
release effect, or weaken the existing `native_start_not_verified` recovery proof.

A second bounded C2 failure class exists when forward activation switched the device
pointer but the new device failed during startup before native private control became
available. If the exact forward `device.start` receipt is `failed` with
`native_start_not_verified`, the same activation later rolls back, its exact rollback
`device.drain` effect has aged past the ordinary native-health timeout, the rollback
expected pointer still names that failed target, and native status remains
unavailable, the helper must not deadlock forever waiting for a drain RPC that the
failed runtime can never serve. For that exact case only, the retained rollback
`device.drain` effect may be projected to the fixed runit stop actuator while preserving
its exact `activationId`, direction, `effectId`, `inputDigest`, expected pair and target
pair; only the actuator verb is `device.stop`. This projection is not a replacement
activation effect and does not mint a recovery effect identity. It positively reads
back the service stopped state and obtains the full writer fence: exclusive native
work-ledger ownership plus every retained canonical Git-sender OS lock. Only that
positive stopped-writer proof may substitute for the unavailable native drain and
produce `drained:true` for the original drain effect. No elapsed time, missing PID,
disconnect, failed RPC, or startup error alone counts as drain proof.

Reconciliation must not invoke the fixed runit sender's `inspect` mode for an absent
projected stop. That mode deliberately fences a never-started sender and therefore
would make the later bounded stop impossible. When the native endpoint is unavailable
and the startup-unverified prerequisites hold, an absent projected stop reconciles as
`not_applied`; execution then uses `run` under the original drain effect identity.
Response loss re-enters that same projection, whose fixed sender state prevents a
second physical send.

The fallback does not change previous/target pairs, rewrite a pointer, skip the normal
`device.stop`/`device.switch`/`device.start`/`pair.check` steps, or invent a provider
effect. A normal rollback `device.stop` that was previously durably fenced as
`not_sent` remains truthful evidence and is never deleted or rewritten. If the
startup-unverified drain projection has meanwhile stopped the same service, that
normal stop may be satisfied without a send only after fresh runit readback proves
`wanted=d`, `pid=0`, stopped state and the independent writer/Git-sender fence again
proves `writerStopped` for the exact pair; otherwise the activation remains blocked.
A current native endpoint, foreign pointer, missing failed-forward-start receipt,
partial stop proof, or sender/writer fence failure also remains blocking. A one-shot
operator may run this exact current helper controller against the installed fixed
configuration while the installed helper is stopped, solely to recover an already
retained activation; it gains no caller-chosen target, command, provider operation or
journal rewrite authority.

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

Release authority remains exact-commit native provenance. A commit introduced through a bounded break-glass publication, even when independently validated before publication, is not stage-eligible merely because it is now canonical. It becomes stage-eligible only through a later tdev-native required-validation and integration that produces an exact canonical descendant. A no-change Work cannot manufacture that authority and is rejected as `NO_CHANGE`; the descendant must contain an owner-approved durable change that actually traverses the native validation and integration boundary.

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

### One-time retained-pair edge-drift repair after live falsification

C2-2 live release acceptance also exposed a narrower pre-stage split-pair failure. The fixed helper retained one terminal pair and the unchanged installed device still matched that pair exactly, but the canonical Worker had been moved outside the retained activation journal to another single-version deployment. In the observed failure the live edge reported the same immutable edge artifact digest and public schema as the retained pair but a different provider version/source identity. The helper correctly rejected `activePair()` with `EFFECT_UNCERTAIN`, so ordinary `release.stage` failed before creating a `release.stage:*` record. Neither the policy-projection repair nor terminal-stage recovery applies to this state.

For this exact bootstrap defect only, an authorized repair tool may stop the installed fixed helper and run a one-shot **retained-pair edge-drift recovery owner** from the exact current required-validated canonical source against the unchanged installed helper configuration and journal. It may not adopt the foreign edge deployment, alter the retained pair, device pointer, device bytes, native work ledger, release artifacts, helper activation records, canonical source, credentials or any provider resource other than the canonical Worker deployment selection. No active helper activation may exist.

Inspection derives all identities from installed state. It requires the current pointer and live device to match the helper retained pair exactly; the live device must be connected and accepting; the canonical Worker must have exactly one version at 100%; the device's authenticated edge observation must name that same active provider version; and the observed edge artifact digest and schema must equal the retained pair while its provider version/source differs. The observed foreign version and exact retained target version must additionally expose the same provider script ETag, so artifact metadata alone cannot classify changed Worker bytes as metadata-only drift. The retained target version must still exist and independently verify against the retained pair and its retained helper-admitted build. Baseline-only or missing-build targets, partial rollouts, a different edge artifact/schema or provider script ETag, device drift, an active activation, or any ambiguous provider state aborts.

Inspection returns a stable plan digest over the exact retained pair, observed foreign edge identity and exact retained target version. Apply must present that plan digest and recompute the full inspection before mutation. The recovery effect is a deterministic `edge.activate` effect whose expected side is the observed split projection and whose target is the retained pair. It uses the existing Cloudflare deployment effect store and sender, so the sent marker precedes the provider call and response-loss retries reconcile only that exact effect. The target provider version is verified again before send; any changed current deployment is a conflict, not authority to overwrite it. Success means only that the canonical Worker again selects the exact retained edge version at 100%.

After the one-shot owner closes, restart the unchanged fixed helper and reconnect/restart the unchanged device service as needed so its authenticated edge observation is fresh. Normal helper `activePair()` must then prove the complete retained pair and the ordinary runtime must report `deploymentSealed=true`. Only after that proof may normal public `release.stage`/`release.activate` resume. This exception is C2-2 bootstrap evidence, not a generic provider repair API, alternate release authority or permanent dependency.

### One-time post-upload stage terminalization recovery after live falsification

C2-2 live activation exposed one additional self-hosting catch-22 after the ordinary
release path had already produced an exact managed build, staged immutable artifacts,
and durably sent a Cloudflare version-upload effect. The pre-C2 native engine could
observe that builder and provider sender had both stopped and that the retained effect
was positively resolved, yet it terminalized the public `release.stage` Action as
`failed/EFFECT_UNCERTAIN` instead of keeping that same Action retryable. Because the
release manifest binds its production receipt to the original stage `actionId`, making
a replacement stage Action creates a different release/effect identity and is not an
acceptable retry.

For this exact post-upload bootstrap defect only, an authorized repair tool may stop
the replaceable device service and run a one-shot **terminal-stage recovery owner**
from the exact current required-validated canonical source. It may inspect only
retained `release.stage:*` records whose matching public Action is terminal
`failed/EFFECT_UNCERTAIN`, has no held attempt, targets the exact current canonical
source/policy and exact retained active release, and already contains the immutable
managed build plus provider effect. It must never reopen or rewrite the terminal
Action, renew its deadline, invoke the builder, call the provider upload sender, alter
the provider deployment, active pointer or helper journal, or synthesize a different
release identity.

The recovery owner re-verifies current authorization and integrated-source authority,
the retained managed production receipt, immutable artifact bytes, current adopted
policy and exact helper active pair. It performs read-only reconciliation of every
matching retained provider effect and requires each sender to be stopped and each
effect to be terminal. If more than one retained failed stage exists for the same
canonical source because the old runtime was retried before this defect was localized,
selection is deterministic from durable creation order. Inspection returns a stable
plan digest over the exact active pair, ordered candidate action/effect/release
identities and terminal provider observations. Apply must present that exact plan
digest and recompute it before any mutation; any changed candidate set, active pair or
provider result aborts. The owner may promote only the first positively `ready`
retained effect and leaves every other inactive provider version and stage record
untouched as historical evidence. A pending, mismatched or unresolved effect aborts
the repair.

Promotion writes only the normal `release.stage:<actionId>` continuation and
`release.ready:<releaseId>` index through the release backend after rechecking the
terminal Action and exact retained Stage in the same transaction. The failed Action
remains failed historical evidence. After the one-shot owner closes and releases the
ledger, restart the unchanged installed runtime and use ordinary public
`release.activate` for that exact staged release. If activation loses its response,
recover only that activation identity through the fixed helper/new runtime; never
start a replacement activation. Successful bootstrap is complete only when the normal
runtime reports the exact canonical active pair and subsequent stage/activate no
longer needs this exception. This exception is C2-2 bootstrap evidence, not a new
public operation or permanent release path.

### One-time principal-projection mutation-admission recovery after live falsification

C2-2 closeout exposed one final self-hosting catch-22 in the retained human-principal
migration. The Access adapter intentionally attaches the exact legacy subject as a
non-enumerable private alias, while the active native engine attempts to persist the
whole authenticated Principal through canonical JSON at Action admission. The result
is a pre-durable `INVALID_ARGUMENT` for new mutation Actions, including Work creation
and release operations. The current canonical successor contains the narrow correction:
project the authenticated Principal into ordinary canonical durable metadata while
preserving the exact legacy subject. A break-glass publication of that correction is
not itself release authority and still requires a later native validated/integrated
descendant.

For this exact admission failure only, an authorized development/repair tool may stop
the replaceable device service and run a one-shot **principal-projection recovery
owner**. Its executable source must equal the exact retained active device source plus
only (a) the current canonical `src/runtime/engine.mjs` principal-projection delta,
(b) the exact canonical `src/execution/outer-receipt.mjs` retained legacy-executor
join delta exposed by the first bounded validation falsification, and, after the
second bounded falsification below, (c) the exact generic managed-validation
source-manifest bridge in `src/execution/payload.mjs`,
`src/execution/managed-pool.mjs` and `src/runtime/managed.mjs`. The receipt join
delta may only let a current `tdev` Attempt consume an Assignment whose `tdev` or
`dev2` identity is independently derived from the exact retained assignment ID,
authenticated session ref/workflow, completion record and outer receipt;
caller-selected namespace substitution remains forbidden.

The source-manifest bridge is narrower still. It applies only to the generic managed
pool whose exact installed workflow identity is retained `dev2-exec`; it does not
change production/release pool selection or authorize a legacy digest for a current
`tdev-exec` controller. Native code must first verify the canonical commit/tree and
current source manifest, then derive the wire manifest from those exact same canonical
entries using the already-owned `legacySourceManifest` compatibility function. The
wire payload, Assignment input and immutable executor result remain bound to that
derived legacy digest. At the RequiredValidation boundary, native code may normalize
an input or output digest back to the canonical result-tree digest only when the
trusted runner returned exactly that deterministic legacy wire digest; a foreign,
changed or caller-supplied digest remains unchanged and therefore fails validation.
This projection proves two names for the same verified entry set; it is not permission
to substitute source bytes, a candidate tree, an execution namespace or a validation
result.

Tests, documentation and unrelated canonical deltas are not execution input. It must
reuse the exact installed private native configuration, credentials, enrollment,
ledgers, binding registry and release-control files without rewriting their runtime
source, artifact or release identities. The retained helper, edge deployment, active
device pointer, release artifacts, canonical Git ref and provider resources remain
unchanged. This repair source is execution evidence only and does not become another
installed runtime, release or identity owner.

Before starting it, prove the retained helper active pair is exact, there is no staged
release or active activation, no active managed session or running Action, and the
replaceable device service has stopped and released its ledgers. The one-shot owner
must connect through the existing device transport and serve the ordinary public tdev
MCP with the existing authorization and binding semantics; no shell caller may choose
a principal, capability, repository/ref, candidate, validation result, provider effect
or release identity. It may admit exactly one recovery Work on the exact current
canonical head whose bounded durable change strengthens regression/owner evidence for
this observed admission failure, then use only the normal typed edit/required-validation
and exact-integration path.

The first bounded replacement was permitted only because the first recovery Work's
required-validation Action terminated before integration when an exact retained
`dev2-exec` identity family could not be joined to the current `tdev` Attempt.
That first Work is exhausted and must never be integrated, resumed into integration or
used for release authority.

The replacement Work is likewise exhausted by the separately observed second-order
falsification: before ACK, the immutable retained `dev2` ManagedRunner rejected the
current `tdev` source-manifest digest even though the payload entries and Git object
bytes were exact. Read-only replay of the exact retained payload through the exact
legacy decoder must reproduce that rejection, and replay after replacing only the
manifest with `legacySourceManifest` of those same entries must succeed, before the
bridge above is eligible for use. The failed replacement Work must never be integrated,
resumed into integration or used for release authority.

After that exact bridge is independently required-validated and break-glass published,
the recovery owner may admit **one final replacement Work** on the then-current
canonical head containing the same bounded regression/owner-evidence change. That final
replacement is the sole Work eligible for native required validation and integration.
No further replacement Work is authorized by this exception. This does not permit a
new model-selected product change, a changed release target, a changed candidate after
validation, or reuse of either failed Work. Any stale head/revision, failed required
profile, changed candidate or integration conflict on the final replacement aborts and
restarts the unchanged retained device; further recovery then requires fresh Design
authority rather than another retry.

The final replacement exposed one third-order failure that is distinct from a failed
required profile and therefore requires this fresh authority before any further
execution. The retained hosted executor authenticated, received and ACKed the exact
assignment, but no execution result or authenticated completion was ever retained.
After the profile deadline the assignment remained nonterminal until the provider
session deadline, then the provider run stopped, the managed assignment became
`stopped` with `result=null`, the exact execution ref was positively retired, and
native recovery terminally cancelled the validation Action. No required-validation
receipt, integration, canonical effect, release stage or activation exists for that
Work. A real PASS/FAIL validation receipt is never reclassified by this paragraph.

For this exact **terminal no-receipt hosted-execution** shape only, one last replacement
Work is permitted after this Design revision advances the canonical head. Before it is
created, prove the exhausted final Work still has the exact unchanged regression
candidate, no current Action, no validation receipt and no integration; prove its last
managed assignment is positively `stopped` with no result or completion record; prove
the selected provider session and operational ref are terminally retired; and prove the
normal retained device has been restored with the exact retained active pair, no staged
release, no activation and no active/reserved managed session. The canonical delta from
the exhausted Work's base to the new replacement base may contain only this Design
revision and the already-authorized recovery source/doc ancestry; it may not smuggle a
new product change into the retry.

The replacement Work must reproduce the same bounded regression/owner-evidence source
change byte-for-byte against that new canonical base. The one-shot recovery owner may
then perform exactly one ordinary typed required-validation attempt on that replacement.
This is a provider-lifecycle retry of an execution that produced no validation result,
not permission to retry a `VALIDATION_FAILED` result, alter the required profiles,
change their timeout/resource/network identity, substitute the production controller,
or reinterpret a legacy/current controller digest. A retained completed validation
receipt, whether PASS or FAIL, is authoritative.

If that single replacement again ends without a completed required-validation receipt,
returns any failed required profile, changes candidate/head/revision, or encounters an
integration conflict, this exception is exhausted: close the one-shot owner, restore
the unchanged retained device and require a different fresh Design repair rather than
another Work or execution retry. If required validation succeeds, only that exact
replacement may integrate and proceed through the existing normal release path.

Only the exact descendant produced by that native required-validation/integration may
then enter the normal public `release.stage` and `release.activate` path. Builder,
artifact, provider, helper, writer-fence, pointer, startup and rollback effects remain
owned by their existing components; the recovery tool never performs or substitutes
those effects directly. If activation admission succeeds and the helper requires the
old writer to quiesce, close the one-shot owner and recover only that same durable
activation identity from the newly started canonical runtime. Never create a second
stage or activation because the one-shot process exited or a response was lost.

Success requires the normal installed runtime to report the exact new canonical
source on both device and edge, `deploymentSealed=true`, no staged release, managed
execution ready, and a fresh public mutation admission with the retained legacy
principal succeeding without the recovery owner. Then the exception is exhausted.
This is bounded C2-2 recovery evidence, not a permanent alternate runtime, public API,
release authority or ordinary development dependency.

### One-time retained-production wire-manifest recovery after pre-build stage falsification

The native-validated and integrated descendant produced by the recovery above exposed
one further compatibility boundary only when ordinary `release.stage` entered the
installed **production** builder. The retained production enrollment still selects the
immutable legacy `dev2-exec` workflow, so its Assignment identity is correctly legacy,
but the production `ManagedPool` did not enable the exact source-manifest projection
already required by the retained generic managed controller. The immutable legacy
runner therefore received the current `tdev` source-manifest digest in an otherwise
legacy Assignment and rejected the payload with `INTEGRITY_FAILURE` before ACK.

This failure is eligible for the recovery in this subsection only when fresh durable
evidence proves all of the following for that exact stage Action: its retained
`release.stage:<actionId>` record is still in the pre-build state with
`build=null`, `effect=null`, `receipt=null` and `target=null`; no
`release.ready` record exists for the source; no provider effect belongs to the
Action; its attempt is no longer held; the selected production session is the exact
retained `dev2-exec` enrollment; and the assignment is terminally stopped with no
result or authenticated completion. The active helper pair must still be exact, no
release may be staged or activating, and the normal retained device must be healthy
again before recovery begins. A post-build, uploaded, pending-provider or ambiguous
stage is not this case and must use its existing owner or another fresh Design.

The failed pre-build stage Action is exhausted historical evidence. It must never be
resumed into a build, have its deadline renewed, acquire a provider effect, be promoted
by terminal-stage recovery, or contribute release authority. A replacement stage is
permitted only for a later exact canonical descendant containing the durable bridge
fix below after that descendant has passed ordinary required validation and exact
integration.

The durable bridge is an identity projection, not a source substitution. It applies
only when the production definition and verified production enrollment select the
exact retained legacy `.github/workflows/dev2-executor.yml` controller. A current
`tdev-executor.yml` production controller remains current-manifest-only. Native code
must first verify the canonical source commit, tree and current manifest, derive the
legacy wire manifest from the exact same verified entry set through the existing
`legacySourceManifest` compatibility function, and bind that derived digest into the
payload and Assignment consumed by the retained runner. No caller, Work, release input
or retained row may supply the projected digest.

Production receipt joining must independently prove the same equivalence rather than
trusting the Assignment. The verifier must receive or recover the exact canonical
SourceTree owned by the integrated release source, verify its current manifest, and
derive the one allowed legacy wire digest from those entries. For a retained
`dev2` production assignment only, the Assignment, raw runner result and outer receipt
may carry that exact derived wire digest while the release source remains bound to the
canonical digest. Any normalization at a native boundary is allowed only when the raw
input/output digest equals that exact derived wire digest and every other execution
field is unchanged. Assignment/session/workflow/run identity, lease/seal, artifacts,
kernel/isolation evidence, profile identity and production enrollment remain exact.
A foreign digest, changed entry set, current production controller or mismatched raw
result fails closed. New release manifests and source authority continue to record only
the canonical current source-manifest digest.

Because the installed retained device still cannot perform ordinary mutation admission
without the principal-projection repair source, an authorized repair tool may perform
one bounded two-owner handoff. First, after this Design-only revision is canonical, it
may stop only the replaceable device service and run the existing principal-projection
recovery owner against the exact installed native configuration. Through ordinary
public typed tdev it may admit exactly one Work whose product delta is limited to
wiring the already-defined source-manifest projection into the verified retained
production control, making the production receipt join prove the exact legacy/current
source equivalence above, and adding focused regression coverage. It may not change
profiles, resource/time limits, provider selection, enrollment identities, release
manifest semantics, the generic managed projection, or any provider/release state.
That Work must pass every required validation profile and exact integration normally.

The first recovery owner does not gain authority by having integrated those bytes and
must not hot-swap them into itself. After integration it closes and releases the
ledger. A second and final one-shot owner may then start from exactly that newly
integrated canonical source, reusing the same installed private configuration,
credentials, enrollment, ledgers, binding registry and fixed release control without
rewriting their identities. Before staging, prove no managed session or Action from the
source Work remains active, the old failed stage remains pre-build/no-effect evidence,
the retained active pair is unchanged and exact, and no staged release or activation
exists. This bounded owner handoff is part of the same recovery campaign and does not
authorize another source Work.

Only that exact integrated bridge descendant may create one replacement
`release.stage` Action against the exact retained active release. Ordinary
same-request recovery still applies to transport-unknown delivery, but a distinct
functional stage failure does not authorize another stage or source Work. If the
replacement stage does not produce one exact retained staged release through the normal
managed builder and provider owners, close the recovery owner, restore the unchanged
retained device and require fresh Design authority. If it stages successfully, ordinary
`release.activate` owns helper admission, writer fencing, pointer switching, startup,
health checking and rollback. If activation admission stops the old writer or loses its
response, close the recovery owner and recover only that same durable activation
identity; never create a second activation.

Success and exhaustion require the normal installed runtime, with no recovery owner
present, to report the exact integrated bridge descendant as canonical device and edge
source, `deploymentSealed=true`, no staged release, managed execution ready, the
retained primary/secondary bindings and capacity unchanged, and fresh public mutation
admission succeeding. The prior pre-build stage remains historical failed evidence.
This subsection is a one-time C2-2 self-hosting bridge, not a permanent legacy
production mode or alternate release path.

### One-time retained-production physical-container identity recovery after post-build join falsification

The single replacement stage authorized above exposed one further retained-controller
compatibility boundary after its production runner had already authenticated, ACKed and
completed the exact release-build assignment. For that stage Action, the verified
canonical source manifest and the independently derived legacy wire manifest matched
the exact assigned entry set; the retained `dev2` profile, Assignment, session,
workflow/run, lease, seal, trusted runner and argv identities matched; every assigned
artifact was ready; and replay of the receipt-bound production build output succeeded.
The Action nevertheless terminated with `INTEGRITY_FAILURE` before a release build,
provider effect, staged release or activation was retained.

This case is eligible for the recovery in this subsection only when fresh evidence
reproduces that exact shape. In particular, replay of the exact retained outer receipt
must fail the production join only at its physical container-name equality while all
other outer identity predicates remain exact. The retained container name must also be
reproduced byte-for-byte by the historical physical naming algorithm for the exact
Assignment family. For the observed retained assignment, the historical
`dev2-<digest>` name is exactly reproduced from the same physical Attempt object even
though that object carries the current logical Attempt namespace marker. A foreign
container name, a different Assignment family, any changed execution field, a failed
profile, an incomplete artifact, an ambiguous effect or an already staged release is
not this recovery.

The failed replacement stage Action is exhausted evidence. It must never be resumed,
reused, have its deadline renewed, be promoted by terminal-stage recovery or contribute
release authority. Its completed hosted execution is evidence for the falsified join
only; it does not authorize a release effect or a second interpretation of the same
Action.

The durable repair must preserve the existing physical Attempt object and derive the
expected container namespace only from the exact authenticated Assignment identity.
Native code may determine whether the Assignment ID is the current or retained legacy
identity for the exact `{attempt, profileDigest}` value, compute the same
`physicalAttempt(assignment)`, and then require the container name to equal exactly
`<assignment-family>-recordDigest(<assignment-family>.sandbox-attempt.v1,
physicalAttempt)`. The logical Attempt's `identityNamespace` must not override a
legacy Assignment family at this receipt-verification boundary. A current Assignment
continues to require the current `tdev` physical name. No caller, Work, receipt,
retained row or recovery tool may choose the family or supply an alternate name.

This repair changes no source-manifest projection, profile, resource/time limit,
provider selection, production enrollment, workflow/ref identity, release-manifest
semantics or sandbox naming used by a current controller. Assignment/session/workflow/
run, lease/seal, trusted-runner, profile, argv, artifacts, kernel/isolation and raw
result bindings remain exact. The only additional compatibility rule is exact
historical recomputation of the physical container name from an already authenticated
legacy Assignment.

Because the installed retained device still lacks the repaired verifier, the same
bounded two-owner self-hosting pattern may be used once more after this Design-only
revision is canonical. A first one-shot recovery owner, using the exact installed
private configuration without changing runtime/release/provider identity, may expose
ordinary public typed tdev for exactly one Work limited to implementing the
assignment-family physical-name derivation above plus focused fail-closed regression
coverage. That Work must pass every required validation profile and exact integration
normally. The recovery owner does not gain release authority from executing those
bytes and must close after integration.

A second and final one-shot owner may start only from that exact newly integrated
descendant after proving the old active pair remains exact, no managed Action/session
from the source Work is active, no staged release or activation exists, and the
exhausted stage above remains without a release/provider effect. Only that exact
integrated descendant may create one new replacement `release.stage` Action against
the unchanged retained active release. Transport-unknown recovery of that same request
remains allowed, but a distinct functional failure does not authorize another stage,
source Work or reinterpretation. If staging succeeds, only its matching ordinary
`release.activate` may proceed. Activation response loss recovers only that durable
activation identity.

Success and exhaustion remain the normal C2-2 criteria: with no recovery owner present,
the installed runtime reports the exact integrated descendant on both device and edge,
`deploymentSealed=true`, no staged release, managed execution ready, retained
primary/secondary bindings and installation-wide capacity unchanged, C1 terminal
session/ref invariants preserved, and a fresh public mutation admission succeeds.
This subsection is a one-time compatibility recovery, not a permanent legacy naming
mode or alternate release mechanism.

### One-time retained-production builder re-verification normalization recovery

The replacement stage authorized by the physical-container recovery above reached a
complete authenticated retained `dev2` release-build execution after the container
identity repair. Fresh replay proves that the exact Assignment/session/workflow/run,
lease and production seal, source entry set and derived legacy wire manifest, physical
container, profile and argv, kernel/isolation observations, deadline/resource bounds,
receipt-bound artifacts, and decoded `device.cjs`, `worker.mjs` and `tools.json`
outputs are all valid. Every finite-build eligibility predicate is true and no release
artifact, provider effect, staged release or activation was retained. The stage Action
nevertheless terminated with `VALIDATION_FAILED`.

The falsification is limited to deterministic builder re-verification. The first
`ManagedReleaseBuilder.output` consumes the execution returned by
`ManagedPool.run`, which applies the already-authorized exact retained-`dev2`
wire-manifest normalization: only the deterministic legacy digest derived from the
verified canonical SourceTree is mapped back to that SourceTree's canonical manifest
digest, with every other execution field unchanged. The immediate
`ManagedReleaseBuilder.verify` replay instead reads the same completed Assignment's
raw retained result and passes it directly to `output`. For a retained legacy
Assignment those raw input/output digests are still the exact legacy wire digest, so
the receipt verifier correctly refuses to treat that unnormalized replay as the
canonical execution. The builder then collapses the replay failure to
`VALIDATION_FAILED`. This is a verifier-path normalization omission, not a failed
runner, changed build bytes, second source identity or permission to reinterpret a
foreign digest.

This recovery is eligible only for that exact shape. Fresh evidence must prove that
the failed stage is terminal, its retained stage record has no build, effect, receipt
or target, no release is staged or activating, and no provider/release effect belongs
to the Action. Its completed Assignment and authenticated completion must remain exact,
its raw input/output digests must equal the one deterministic retained `dev2` wire
manifest derived from the exact canonical source entries, and replay must show every
production receipt eligibility predicate and every receipt-bound release output byte
valid. Any failed profile, foreign digest, changed artifact, ambiguous provider effect,
already-staged release, current-controller execution, or mismatch outside the
re-verification normalization boundary is not this recovery.

The failed stage Action is exhausted historical evidence. It must never be resumed,
have its deadline renewed, gain a build/effect/target, be promoted by terminal-stage
recovery, or be used as release authority. Its completed production execution is
diagnostic evidence only. No recovery path may reinterpret that Action as successful
or manufacture a staged release from it.

The durable source repair is narrow. During deterministic release-builder
re-verification only, after the exact retained Assignment identity and source have been
recovered, native code may pass the retained Assignment result through the same
`ManagedPool.normalizeValidation(result, attempt, profile, execution)` operation used
by the original `run` path before calling `output`. That operation remains
fail-closed: it may normalize only when the authenticated Assignment family is
`dev2`, the production pool is explicitly in its Design-authorized legacy source
projection mode, the exact repository commit still has the prepared tree and canonical
manifest, and the raw digest equals the deterministic legacy manifest for those exact
entries. A current Assignment or foreign digest remains unchanged and therefore fails
the existing receipt equality checks when inappropriate. No caller, receipt, Work,
stage input or recovery tool may provide a replacement digest or choose the
normalization.

The repair changes no runner, profile, timeout/resource/network identity, source entry
set, production enrollment, Assignment/session/workflow/run identity, physical
container naming, artifact bytes, release-manifest semantics, provider selection,
helper protocol, activation semantics or current-controller behavior. Focused
regression coverage must prove that a retained legacy completion which produced a
valid normalized build also verifies deterministically from the retained raw result,
while a foreign raw digest, wrong Assignment family or changed source still fails
closed.

Because the installed retained device lacks this repair and ordinary public mutation
admission still depends on the bounded C2-2 recovery owner, a first one-shot recovery
owner may start only after this Design-only revision is canonical. It must reuse the
exact installed private native configuration and retained active pair without changing
runtime/release/provider identity. Through ordinary public typed tdev it may admit
exactly one source Work limited to the re-verification normalization call above and its
focused fail-closed tests. That Work must pass every required validation profile and
exact integration normally. The recovery owner gains no release authority from
executing those source bytes and must close after integration.

A second and final one-shot release owner may start only from that exact newly
integrated descendant after proving the retained active pair is unchanged, no managed
Action/session from the source Work is active, no staged release or activation exists,
and the exhausted `VALIDATION_FAILED` stage remains no-effect evidence. It may create
exactly one new `release.stage` Action against the unchanged retained active release.
Same-request transport-unknown recovery remains idempotent; a distinct functional
failure again requires fresh Design authority and does not authorize another stage or
source Work. If staging succeeds, only the matching ordinary `release.activate` may
proceed, and activation response loss may recover only that same durable activation
identity.

Success and exhaustion remain the normal C2-2 criteria: with no recovery owner
present, device and edge report the exact newly integrated canonical source,
`deploymentSealed=true`, no staged release remains, managed execution is ready,
primary/secondary binding isolation and installation-wide capacity are unchanged, C1
terminal session/ref invariants hold, and a fresh public mutation admission succeeds.
This subsection is a one-time repair of deterministic retained-result replay; it is not
a permanent legacy normalization mode, alternate builder, release bypass or additional
release authority.

### One-time fixed-helper release-identity admission recovery

The replacement stage after builder re-verification reached a valid retained production
build and entered the normal upload phase, but terminated with `INVALID_ARGUMENT`
before any provider effect, staged release or activation. The exact failed Action is
`04c56652b8882d64b472bc7f34b7772d`. Its release build identifies current tdev
release `sha256:47fd4d235860de14b2960c1b87c09bac9b07ecc5a3e9aea639abef2e350a15a9`
from native-integrated source `2fcac8d08a5c3691a2956df3dda70d406c8111d2`.

Fresh replay localizes the falsification to the installed immutable fixed helper, not
the build, production receipt, artifact bytes, device config generator or provider.
The installed helper bundle digest is
`sha256:324bcaefba72dcdbf37f19b9ad3089e99085cc0dafdcb12225ecc47a73318db7`.
Its bundled closed release-manifest schema predates C2-2: it rejects the
`identityNamespace: "tdev"` field and derives every release identity in the
`dev2.release-manifest.v1` domain. The current required-validated source accepts only
the optional exact current marker and derives the release identity from the resulting
current or retained namespace. Pure replay of the failed build through current
`FixedReleaseService.admitBuild` succeeds, while the installed helper retained no
`helper.build:<releaseId>`, no new native config or device pointer, and the work ledger
retained no provider effect. This is an installed fixed-control bootstrap mismatch,
not permission to strip the current marker, rehash the release as legacy, reinterpret
the failed Action or bypass helper admission.

This case may use the already Designed **One-time bootstrap repair of pre-migration
fixed files** above, with no wider mutation surface. Eligibility requires fresh
readback that the retained active pair is unchanged, no staged release or activation
exists, no managed Action is executing, the failed Action remains terminal with no
provider effect, and the installed helper bytes and bound digest equal the exact stale
bundle identified above. Before repair retain byte-for-byte backups and prove the
deterministic canonical fixed-control bytes to be installed come from one exact
required-validated native-integrated descendant. Stop only the helper service, use the
existing private same-filesystem atomic replacement and restoration rules, and restart
the helper. The admissible files remain exactly those already owned by that bootstrap
procedure: the fixed helper bundle and its bound helper-bundle digest plus the fixed
device launcher when its canonical bytes differ. The writer-fence helper is not part
of this falsification and must not change unless the pre-existing multi-binding
bootstrap clause independently requires its exact canonical repair. No device pointer,
Worker deployment, work/activation ledger, credential, enrollment, release artifact or
provider resource may be changed by the fixed-file repair.

Because this Design-only publication is break-glass history rather than release
authority, one bounded recovery owner may then expose ordinary public typed tdev and
admit exactly one post-Design Work whose durable change is focused regression coverage
for current tdev release-manifest admission by the fixed helper contract. Product
release semantics must not change: the current source implementation already defines
the required behavior. That Work must pass every required validation profile and exact
integration normally. Only the resulting exact native-integrated canonical descendant
is eligible both as the deterministic source of the repaired fixed-control bytes and
as later release authority.

After the fixed-file repair, fresh private status must report the exact same retained
active pair while the original installed device remains unchanged, and replay of the
new helper's release-manifest parser must accept the descendant's exact current tdev
manifest and compute its current-domain release identity. Any mismatch restores the
byte-for-byte old fixed files/config and restarts the old helper before further release
work.

Only after that readback may a second one-shot release owner run the ordinary public
release path for the exact native-integrated descendant. It may create exactly one new
`release.stage` against the unchanged retained active release. The exhausted
`04c56652b8882d64b472bc7f34b7772d` Action remains historical no-effect evidence and
must never be resumed, promoted or reused. Same-request transport-unknown recovery is
idempotent; any distinct functional failure again requires fresh Design authority.
If staging succeeds, only its matching ordinary `release.activate` may proceed, and
response loss may recover only that same durable activation identity.

Success remains the normal C2-2 criterion: with no recovery owner present, device and
edge report the exact native-integrated canonical source, `deploymentSealed=true`,
no staged release remains, managed execution is ready, primary/secondary binding
isolation and installation-wide capacity are unchanged, C1 terminal session/ref
invariants hold, and a fresh public mutation admission succeeds. This subsection
exhausts only the observed stale fixed-helper identity bootstrap; it creates no
permanent compatibility mode, alternate release identity or additional release path.

## C2-2 runtime/provider identity hard cutover

The owner has explicitly waived compatibility with pre-cutover `dev2` Work,
Action, managed-session, release/rollback, provider-resource and local-runtime state
for final C2-2 identity convergence. For this cutover, this section supersedes every
earlier D0006 allowance whose only purpose is to keep such pre-cutover state usable
under a legacy `dev2` identity, including rolling private-RPC aliases, retained
sender/environment aliases, retained legacy source-manifest readers, legacy
execution-ref/workflow production, legacy binding locators and previous-release
rollback compatibility. Historical Git/evidence may remain truthful history, but it
is not runtime compatibility authority.

The cutover is destructive with respect to those retained runtime identities, not
with respect to canonical source or security. Before the first irreversible provider
or local-state mutation, fresh readback must prove a quiescent boundary: no executing
or reserved Action, no active or reserved managed session, no forward staged release
or activation in progress, and no provider effect whose outcome is still uncertain.
Pre-cutover open/terminal Work or session history may be abandoned and need not be
readable or resumable afterward. If any such state still has a possible external
effect, it must be reconciled or fenced before the cutover; waiver of compatibility
does not turn uncertainty into success or cancellation.

After the boundary, all current runtime/provider identities use only the final
`tdev` namespace. This includes private route `/__tdev/`, private RPC
`tdev.private-rpc.v1` / `x-tdev-private-mac`, sender environment
`TDEV_GITHUB_TOKEN_FILE`, current source-manifest/digest domains,
`refs/heads/tdev-exec/<sessionId>`, `tdev-executor.yml`, current binding/local
locator domains, Cloudflare bindings `TDEV_CONFIG_JSON`, `TDEV_DEVICE_SECRET`,
`TDEV_VERSION`, `TDEV_ROUTER`, and Durable Object class
`TdevRendezvousDO`. The deployed current Worker/runtime must not retain
`/__dev2/`, `dev2.private-rpc.v1`, `x-dev2-private-mac`, `DEV2_*`,
`Dev2RendezvousDO`, legacy execution workflow/ref production, or a legacy local
locator as an accepted current-path fallback.

`TdevRendezvousDO` may use a fresh Durable Object namespace. D0006 assigns the DO
only connection-routing/hibernation attachment state, not Work admission, canonical
repository state, validation eligibility or completion; therefore pre-cutover
`Dev2RendezvousDO` state is intentionally not migrated. The current workers.dev
origin and authorization boundary remain the single public service. Provider secrets
may be rebound under the new names through the sealed deployment path, but secret
values must never be exposed through source, logs or readback. Old bindings/classes,
routes and provider aliases are removed only after provider readback proves the new
Worker references the exact new resources and the fresh device has authenticated and
reconnected through the `tdev` path. This bounded delayed deletion is cutover
safety, not compatibility support.

Abandoning a legacy local ledger/locator must not silently reuse its durable
deduplication namespace. If the exact implementation requires a new installation,
binding epoch, ledger identity or request namespace to fence abandoned retained
records, use the existing D0001/D0002/D0004 owners for that identity and revise them
before implementation when their accepted semantics require it. Canonical Git
commit/tree and authorized repository/ref bindings remain the source baseline; the
hard cutover does not authorize rewriting canonical history, bypassing required
validation, weakening authorization, or creating a second long-lived runtime.

The previous `dev2` release pair is not a required rollback target across this hard
boundary. Before old resources are destroyed, the exact new tdev deployment must be
read back healthy; after the boundary, ordinary release rollback semantics apply only
among releases admitted in the new `tdev` identity domain. A failed cutover may be
repaired with the smallest owner-authorized recovery necessary to reach one healthy
tdev runtime, but it must not re-establish permanent dev2 aliases merely to recover
historical Work/session/release state.

C2-2 hard-cutover acceptance requires all of the following from fresh observation:

- canonical source, device source and edge source identify the exact required-validated
  integrated descendant selected for the cutover;
- deployment is sealed, the runtime is accepting, no forward staged release remains,
  and managed execution is ready;
- primary/secondary repository-binding isolation, authorization and installation-wide
  execution capacity remain intact for fresh post-cutover work;
- fresh public mutation admission and cancellation succeed on the normal installed
  tdev runtime;
- fresh managed execution, when exercised, uses only `tdev-exec` /
  `tdev-executor.yml` and terminal operational refs retire normally;
- provider readback shows only the current `TDEV_*` bindings and
  `TdevRendezvousDO` on the active Worker/runtime path, with no active
  `Dev2RendezvousDO` or `DEV2_*` compatibility binding;
- current product/source/config/deployment/runtime metadata has no `dev2`,
  `DEV2`, `dev-2` or equivalent branch-codename identity except the truthful
  development Git branch/ref and explicitly historical evidence; and
- no current runtime behavior depends on compatibility readers or aliases for
  pre-cutover dev2 Work, sessions, releases, provider resources or local locators.

Only after those observations may C2-2 again be treated as complete and routing
advance to C2-3.

### One-time post-cutover human OAuth owner-rebind recovery

Fresh post-cutover readback exposed a human-authority bootstrap mismatch that the
installation self-probe could not prove. The epoch-2 tdev installation was built with
one historical signed-human owner subject observed on 2026-09-11. Its fixed phase-A
probe correctly exercised repository/context/runtime readback with a synthetic local
principal derived from that installed grant and explicitly reported `humanOAuth=false`.
After the owner refreshed the current single ChatGPT connection, however, a normal
signed human `dev_context` continued to reach the native runtime and return
`FORBIDDEN`. The same current repository/binding succeeds through the bounded local
probe, so repeating OAuth reconnects or substituting the device credential is not an
acceptable acceptance path.

D0005's one-shot current-human observation is therefore authorized as bounded C2-2
recovery. The recovery source must be committed on the exact canonical development
line and pass the available native core/integration checks before use. Because the
ordinary human tdev path is the failed boundary being repaired, TMCP may integrate
that exact recovery commit and perform the minimum reversible local runtime handoff
needed to observe the current signed principal. This break-glass publication is
recovery evidence, not a substitute for the normal required-validation receipt that
must be re-established after human authority is restored.

The observation handoff must not mutate the epoch-2 work ledger or activation journal.
Before handoff, fresh installation readback must prove no executing/reserved Action
and no active/reserved managed session. The normal `tdev` service is then stopped and
an isolated temporary device state may connect to the existing current tdev Worker
using the same installation/device channel identity solely for this observation. Its
private configuration retains the exact primary repository/ref/policy and current
human grant, uses a separate empty state directory, omits managed execution, canonical
writers and release control, and sets the explicit `c2HumanObservationRecovery` flag.
That flag drains development admission before the device connects. The temporary
runtime may answer context/read-only protocol paths but must not admit Work, launch
managed execution, write canonical Git or mutate provider/release state. No Worker
redeploy or Access-policy widening is authorized for observation.

Immediately after the controlled current-session `dev_context` call, the temporary
process is stopped and the original epoch-2 `tdev` service is restored unchanged.
The private observation window is acceptable only if it contains one distinct verified
subject and the observed request itself still returned `FORBIDDEN`; otherwise recovery
aborts. If the sole current subject equals the installed owner subject, grant mismatch
is falsified and no owner rebind occurs.

If the sole current subject differs, the current owner-directed recovery may create a
fresh tdev-only installation with that exact observed subject as its sole owner grant.
Because the current epoch-2 installation is then abandoned rather than rewriting its
immutable grant in place, D0001/D0002 require a new binding epoch. The fresh install
must preserve the same canonical repository/ref authority, second-binding registry
semantics, capacity 8, current TDEV-only provider identity and independently generated
machine credentials. Provider deployment follows the existing same-origin bounded
path and is read back exactly before the new service starts. The old epoch-2 service
remains stopped as bounded rollback evidence until the new human `dev_context` succeeds.

Once current human OAuth succeeds, return immediately to the normal tdev path. Fresh
normal `dev_work` mutation/cancellation and required validation/integration must then
prove the new owner authority. The temporary observation implementation, temporary
state and any obsolete recovery source are consumed and must be removed before final
C2-2 residual acceptance; historical owner credentials are never accepted as the
new human authority merely because they existed before this recovery.

### One-time blocked-validation same-Action recovery for C2-2 hard cutover

C2-2 hard-cutover closeout exposed one final pre-cutover recovery incompatibility while validating the bounded bootstrap-installer correction. The exact validation Action `471247fda53cd173fbfa24ee03827373` for Work `584b3107ec4102d4665426359acd42c0`, generation `1`, candidate tree `sha1:bd9667e24fb4a2a1ffc5904edc38c366d2cb670d`, produced a retained PASS for the core required profile but no complete required-validation receipt. Its managed provider session later reached positive stopped state with no active session, while the native reservation remained held and the Action stayed `blocked/recovery.required`. Three ordinary public `resume` admissions, including a short request identity, failed pre-durably with `INVALID_ARGUMENT`; none created a new Action, attempt, result, receipt, provider effect or publication.

For this exact shape only, an authorized one-shot recovery owner may stop the replaceable pre-cutover device service, acquire the exact binding ledger exclusively, and reconcile only that retained validation Action. Before any mutation it must independently re-read the Action, Work, reservation, prepared result and validation rows and require all exact identities above; require the Work candidate/generation/base to be unchanged; require no integration/publication/provider effect for the Action; require no completed required-validation receipt; require the retained managed assignment/session and operational execution ref to be positively terminal with no possible external execution remaining; and require no other executing/reserved Action or managed session that would be affected. Unknown is not stop proof.

Before opening the recovery transaction, the same bounded owner may drain an unrelated managed session only when the existing managed-session owner proves it is actionless and `ready`, with no offered/running assignment. Drain means the ordinary durable cancel/refresh path for that exact session followed by positive provider-terminal readback and normal operational-ref retirement. A `busy`, `waiting`, `reserved`, assignment-bearing or provider-uncertain session aborts recovery; direct provider cancellation or session-row rewriting is not authorized.

The recovery owner may then perform exactly one of two outcomes through the existing D0001/D0003 state rules: if the original Action remains replay-eligible and its exact retained execution identity can be safely resumed, release only its positively stopped reservation and requeue that same Action without changing `actionId`, `resultId`, candidate, generation, policy, deadline or execution identity; otherwise terminally cancel that exact Action and release only its positively stopped reservation, leaving the Work open with the exact same candidate/generation and no fabricated validation result. It must not create a replacement Action, Work, result, receipt, provider session, Git ref or external effect. Any mismatch or ambiguous provider/session state aborts without mutation.

After the one-shot owner exits and releases the ledger, the ordinary installed runtime must read back the exact resulting Action/Work state. If the Action was requeued, only normal same-Action execution/recovery may continue. If it was terminally cancelled, further validation of the unchanged candidate requires fresh explicit authority rather than silently manufacturing a retry. This exception exists only to clear the observed pre-cutover recovery incompatibility so the D0006 hard-cutover quiescent boundary can be reached; it is not a permanent alternate validation path or compatibility reader.

### Consumed recovery closeout and one fresh bootstrap-installer validation

The one-shot recovery above is now consumed. Fresh readback after recovery proves Action `471247fda53cd173fbfa24ee03827373` is terminal `cancelled/complete.recovered`, Work `584b3107ec4102d4665426359acd42c0` remains open at generation `1` with candidate tree `sha1:bd9667e24fb4a2a1ffc5904edc38c366d2cb670d` and no current Action, its retained attempt is released, and no validation receipt or external effect exists for result `143a79a5b598dd498dabcd47fc6a7473`. Managed execution is again ready with no active or reserved session.

The bounded recovery also exposed a local-identity side effect that must not become a second compatibility path. Opening the retained pre-cutover installation through the current recovery source created an empty `tdev.binding-ledger.v1` secondary locator next to the populated retained `dev2.binding-ledger.v1` locator for the same secondary binding. The pre-cutover runtime correctly failed closed with `INTEGRITY_FAILURE: Current and legacy local identity locators both exist`. After the device was stopped and an exact private backup was preserved, readback proved the current-domain duplicate contained no Work, Action, Attempt, prepared result, validation receipt or effect; only that empty duplicate and its sidecars were quarantined. The populated legacy locator was left unchanged. The ordinary pre-cutover runtime then started, reconnected, and passed its repository probe. This was recovery of the existing control plane, not completion of the hard cutover.

Accordingly, `tools/recover-blocked-validation.mjs` is exhausted and must be removed from the current source path with this Design revision. It must not be invoked again, generalized into a compatibility reader, or used to create current-domain local locators inside the retained pre-cutover installation.

This paragraph is the fresh explicit authority required by the preceding paragraph for exactly one new ordinary required-validation admission of the unchanged Work `584b3107ec4102d4665426359acd42c0`, generation `1`, candidate tree `sha1:bd9667e24fb4a2a1ffc5904edc38c366d2cb670d`. Before admission, fresh readback must still prove that exact Work/generation/candidate, no current Action, no completed receipt for the recovered result, no executing/reserved Action, and no active/reserved managed session. The new validation uses the then-current canonical head and the unchanged required profiles/policy; it may create the ordinary new Action/result identity implied by a fresh validation admission. It does not authorize candidate edits, a profile/environment substitution, integration without a completed eligible receipt, release/provider mutation, or another validation retry if this fresh admission again fails or ends without a completed receipt.


### Network-interrupted replacement validation for the unchanged bootstrap-installer candidate

The single fresh validation authorized immediately above was admitted as Action `3f54860138c9f61de7a6d81ef434f5bd` and is now exhausted. Its exact core profile completed with exit code 0 and a retained PASS artifact, but before the required integration profile could complete the retained device transport entered repeated `connection_error` / `disconnected` state beginning at 2026-09-18T22:33:28Z and remained unavailable through the Action deadline at 2026-09-18T22:43:36Z. The selected GitHub managed run `35401708180` itself remained authenticated to its ordinary workflow and completed provider-side with conclusion `success` immediately after that deadline. No integration-profile outcome, completed required-validation receipt, integration, canonical effect, release effect or provider mutation was produced by this validation. Ordinary same-Action recovery has since terminally cancelled the expired validation as `complete.recovered` and released its retained Attempt.

This is evidence of external device-connectivity interruption, not a failed required profile and not authority to reinterpret the retained core PASS as complete required validation. For this exact shape only, one replacement ordinary required-validation admission is authorized for the unchanged Work `584b3107ec4102d4665426359acd42c0`, generation `1`, candidate tree `sha1:bd9667e24fb4a2a1ffc5904edc38c366d2cb670d`. Before admission, fresh readback must prove that Action `3f54860138c9f61de7a6d81ef434f5bd` remains terminal with no receipt or integration, the Work has no current Action and the exact same candidate/generation, `executingActions=0`, `reservedAttempts=0`, managed execution is ready with no active/reserved session, and the normal retained device is connected and accepting. The replacement uses the unchanged required profiles, policy and ordinary managed controller on the then-current canonical head.

No previous partial profile result is reused to manufacture a receipt; the replacement must run the complete required profile set normally. It does not authorize candidate edits, profile/environment substitution, a second replacement, release/provider mutation, or integration without a completed eligible receipt. Any failed required profile, another no-receipt terminal outcome, stale candidate/head/revision, or integration conflict exhausts this exception and requires fresh owner-correct Design repair rather than another validation admission.

### Pre-cutover provider-terminal stale-ready session normalization

The retained pre-C1 installed runtime lacks the later C1 background `SessionReconciler.start()` ownership now present in canonical source. Consequently a managed provider run may be positively `completed` and its Action fully settled while the pre-cutover ledger still projects that exact session as actionless `ready` until another managed dispatch performs the ordinary provider refresh. This is not authority to treat an actually running, queued, unknown, assignment-bearing or provider-uncertain session as quiescent.

For the single replacement bootstrap-installer validation authorized immediately above, its preflight may therefore contain at most one such stale-ready session instead of zero active sessions only when fresh evidence proves all of the following: the session has no Action, pending dispatch, offered/running assignment or cancel uncertainty; its exact selected GitHub run is provider-terminal `completed/success`; the run/ref/workflow identities still match the retained session; no other active/reserved managed session exists; and the device remains connected and accepting. The replacement validation must use the ordinary installed ManagedPool state machine. Its first dispatch may bind transiently to that actionless session, but before any assignment can be executed the ordinary forced provider refresh must positively close the completed run and retire its exact operational ref. Only the existing never-assigned resource-replacement rule may then move that unchanged logical assignment to a fresh session. Any provider ambiguity, unexpected assignment, ref-retirement failure, second active session or changed identity aborts rather than bypassing the zero-external-execution boundary.

This exception exists only to bridge the already-fixed C1 background-reconciliation gap in the retained pre-cutover runtime. It authorizes no direct ledger rewrite, provider-side ref deletion outside the normal adapter, session-row editing, compatibility reader, extra validation retry or post-cutover stale-ready tolerance. After the final tdev runtime is installed, the ordinary C1 background reconciler remains the sole normal convergence mechanism.

### One-time sent-activation target-version fence and hard-cutover bootstrap

The bootstrap-installer correction above has now completed required validation and exact integration as canonical commit `sha1:d6d977106a1e435652c0cc58475a0074daa82541`. Fresh pre-cutover runtime readback after its validation proves `executingActions=0`, `reservedAttempts=0`, managed execution ready with zero active/reserved sessions, and the retained device connected and accepting. The remaining quiescence blocker is the exact old activation below; this subsection owns only its one-time fence and the immediately following fresh-runtime bootstrap.

The retained helper-authoritative activation is `210bb9a9e9ee8f578a6dc041058475a4181fe4da15a76a883278024c79b8b9f0`, Action `d43f5fa19a1a064f2a127b64310fd339`, intent digest `sha256:5675986d6fa58ffce2c06f94603cec2ab0ee190b95900dacc6a174e06bac4f1f`. Its only pending effect is `5c8b62c72661e66d3c5a29f5e382899ee0333bef4c0ad90b2910c169eddf51f0`, input digest `sha256:480eafd7f038765a774de514e8582f4f2ceaf11f9a66451150c9bf74b684455e`, step `edge.activate`, retained as `sent` with exactly one send and no receipt. The previous edge version is `7dffeadd-6d27-429a-bca5-838fbe38fc62`; the target edge version is `643ca63f-4e73-4c08-bc88-fdc565a1ad98`; the staged release is `sha256:4dc5c8ef407af6dd20f78058592b58fcd2fe85db2fbe3c2f745b6815fa040e22`.

Fresh Cloudflare readback shows the newest active deployment `c8e326bb-ce39-406c-8532-f7a7b789d4f8` serving only previous version `7dffeadd-6d27-429a-bca5-838fbe38fc62` at 100 percent, no deployment carrying the exact pending activation marker, and target version `643ca63f-4e73-4c08-bc88-fdc565a1ad98` present only as an inactive uploaded version. That target still carries the pre-cutover `DEV2_CONFIG_JSON`, `DEV2_DEVICE_SECRET`, `DEV2_ROUTER`, `DEV2_VERSION` bindings and `Dev2RendezvousDO`; therefore it is not an admissible final hard-cutover deployment even if the old activation could otherwise complete. Cloudflare's current provider contract models deployments as references to explicit Worker version IDs and exposes an exact Beta Worker-version deletion operation. For this exact abandoned target, absence of the target version after an authenticated delete plus unchanged previous-only active deployment is the positive fence: the retained old deployment request can no longer legally establish the deleted target version as an active deployment. Elapsed time or marker absence alone is not this proof.

One bounded recovery implementation may be added to current canonical source and must pass normal required validation before use. It must be exact-ID fail-closed, two-phase inspect/apply with an inspect-plan digest, never expose credentials, and operate only on the retained installation paths after the replaceable old device and fixed helper services have been stopped. Stopping those services is reversible admission fencing, not authority to mutate durable state. Before stop, ordinary tdev readback must again prove no executing/reserved Action and zero active/reserved managed sessions. After stop, inspect must acquire/read the exact old work ledger and activation journal without creating any current-domain binding locator, preserve private byte-for-byte backups of each database and existing sidecars, and require the activation/stage/provider identities above with no foreign or additional uncertain effect.

Apply first re-reads Cloudflare. If the target version is referenced by any deployment, if the exact activation marker exists, if the newest deployment is not the exact previous version at 100 percent, or if any identity differs, it aborts without provider or local mutation. Otherwise it may issue exactly the Beta `DELETE /accounts/{account_id}/workers/workers/{worker_id}/versions/643ca63f-4e73-4c08-bc88-fdc565a1ad98` for Worker `tdev`. No deployment, other version, route, binding, namespace or secret may be mutated by this fence. Response loss is reconciled by exact target-version GET and deployment-list readback; target absence is success, while target presence after a positively stopped sender permits only the same exact-version delete to be retried. Any other ambiguity aborts. Before local mutation, readback must prove the target version absent, the newest deployment still previous version `7dffeadd-6d27-429a-bca5-838fbe38fc62` at 100 percent, and the exact old activation marker absent.

Only after that provider fence may the recovery owner terminalize the exact retained local release state. In the fixed-helper activation journal it may change only activation `210bb9a9e9ee8f578a6dc041058475a4181fe4da15a76a883278024c79b8b9f0` from the exact blocked/sent/no-receipt record above to terminal `rolled_back`, with `pending=null`, `observedPair` exactly equal to the retained `intent.previous`, direction `rollback`, and a bounded reason identifying the hard-cutover target-version fence. It must not fabricate an activation receipt or claim that the forward effect succeeded. In the old work ledger it may delete only the exact `release.ready:sha256:4dc5c8ef407af6dd20f78058592b58fcd2fe85db2fbe3c2f745b6815fa040e22` projection row after proving that row is the retained staged record for the exact target/previous pair above. The underlying `release.stage:<actionId>` history, blocked Action, Work/Action history and other ledger rows remain untouched historical evidence. Either local step is resumable only after the provider fence is re-proven; a partially completed local closeout may finish the missing exact step but may not broaden its mutation set.

Fresh stopped-state inspection of the byte-for-byte pre-cutover backup exposed three exact historical storage residues that the first recovery implementation incorrectly treated as live execution. Two are old `release.activate` Actions `06df336eb824813d7f4e96bcac33b8a4` and `8d383ec0f75fc1384c605794ef11b832`, both retained as `blocked/recovery.required/EFFECT_UNCERTAIN` with unheld Attempts. Their helper activations are respectively `e608e6e9be0994ee00ef299d733007367cc2dd794a7963b00449ce8a41a3e8ee` and `0e0298651de9347bddad236ffdaeda128f19d0675d387d42e13def27dc8b5705`; each is `active=0`, has `pending=null`, and retains six terminal `applied` receipts. The third residue is managed dispatch `8ef2b4fcc6ef24a7600e84982d8ee94b130ded759c638b23b891380c05fb7d30` from cancelled Action `4ca8ecd1bc43cf17120a61b7b0ad2364`: its Attempt is unheld, session `68b0dd097524969c45fca2074c024acc` is closed, its assignment is `stopped` with no result, and exact ref retirement is retained for `refs/heads/dev2-exec/68b0dd097524969c45fca2074c024acc` / run `35415636223`. None is a live or reserved execution and none is to be rewritten.

For this exact recovery only, inspect may tolerate those three records as immutable historical residue, but only after re-proving every identity and terminal fact above from the stopped old ledger/journal. Any different or additional blocked Action, pending dispatch, nonclosed session, offered/running assignment, held Attempt, or changed retirement evidence aborts. The helper journal must additionally prove that every `provider.effect:*` record is `confirmed` except the single exact target effect `5c8b62c72661e66d3c5a29f5e382899ee0333bef4c0ad90b2910c169eddf51f0`, which alone may remain `sent` with its exact input digest and null response before the target-version fence. Thus the successful-apply requirement of no executing/reserved Action or managed session means no held/queued/running execution and no nonclosed/offered/running managed resource; the three exact terminal residues above may remain untouched until the entire old ledger is abandoned. This is not authority to generalize stale blocked/pending rows, repair them, or treat unknown provider state as terminal.

The first Design Work that attempted to record this residue classification, Work `55c9e0cf4c4f21ee5a5a5d617327b485`, itself exhausted its validation path before this replacement Design could become authority. Its validation Action `c43d81ac525e42aa96bc36e02a5c8e99`, result `9d6c9ebec186a89ed1dce11893f97df7`, and held Attempt `715653343cab9923b62fe1482393e00f` have no validation receipt, integration or provider effect. The sole managed dispatch `bb8a5ec3d80edd2e3c690a01072203a52b40f1bdc2320913f9fd3034383ec0a4` never acquired an assignment; its session `8c26376896992ff539ef914d66a2e60a` is provider-terminal `completed`, closed, and its exact `refs/heads/dev2-exec/8c26376896992ff539ef914d66a2e60a` ref is retired. Ordinary public `resume` for that same Action fails pre-durably with `INVALID_ARGUMENT` and creates no replacement Action or external effect.

After this replacement Design is itself required-validated and integrated, one bounded recovery owner may terminalize only that exact failed Design validation before hard-cutover inspect continues. It must stop the replaceable old device again, acquire the exact old ledger exclusively, re-prove the Work/candidate/result/Action/Attempt and provider-terminal no-assignment/ref-retirement facts above, require no other held Attempt or live managed resource, then settle Action `c43d81ac525e42aa96bc36e02a5c8e99` as terminal `cancelled/complete.recovered` and release only Attempt `715653343cab9923b62fe1482393e00f`. Work `55c9e0cf4c4f21ee5a5a5d617327b485` remains open historical evidence and is never integrated or reused as release authority. No result, validation receipt, provider effect, session, ref, candidate or canonical commit may be synthesized or altered by this cleanup. Any identity mismatch or additional held/live execution aborts. This one-shot cleanup exists only to restore the hard-cutover zero-held-attempt boundary after the failed owner-Design validation; it is not a generic ledger repair path.


The stopped-ledger cleanup must accept the exact terminal dispatch projection produced by the ordinary managed `reconcileLocal()` owner after the associated sessions close. Fresh readback after validating the recovery implementation proves both exact residues have converged in this way: historical dispatch `8ef2b4fcc6ef24a7600e84982d8ee94b130ded759c638b23b891380c05fb7d30` and held-Design dispatch `bb8a5ec3d80edd2e3c690a01072203a52b40f1bdc2320913f9fd3034383ec0a4` now retain their unchanged immutable input/session/assignment identities but project `state="done"` rather than their earlier `pending` value. This transition is eligible only when the historical dispatch still has the same terminal `stopped/result=null` assignment, the held-Design dispatch still has no assignment at all, both exact sessions remain closed/provider-terminal with matching retained ref retirement, and no held/live execution exists beyond the single Design Attempt being cleaned. Recovery may recognize either the original `pending` form or this exact ordinary `done` terminal projection for these two named dispatches; it must not rewrite either dispatch, generalize `done` as proof for another record, or weaken any session/assignment/retirement identity check.

Successful apply must read back: no active helper activation; retained pair equal to the old previous pair; no exact `release.ready` projection row; no executing/reserved Action or managed session in the stopped old installation; target Worker version absent; and previous edge deployment unchanged. The old device/helper services remain stopped after this proof. The blocked special Action may remain as historical pre-cutover evidence because its only possible external effect is positively fenced and the old ledger will be abandoned; it is not re-admitted, resumed or converted to success.

This exact fence establishes the D0006 quiescent boundary for the discarded pre-cutover release/runtime state. The next local mutation is a fresh tdev-only installation, not repair of the old ledger. The primary binding moves from epoch `1` to fresh epoch `2` as required by D0001/D0002 while keeping the same canonical repository/ref authority. The fresh installation uses new installation/device identities, new private credentials, tdev-only roots/configuration/service names and current tdev durable/source domains, capacity 8, and the exact then-current required-validated canonical source. It must not import the old work ledger, activation journal, local locator, request tombstones, sessions or release pair.

The fresh bootstrap uses the now-canonical `tools/install-phase-a.mjs` with explicit binding epoch `2`, then the existing bounded `deploy/cloudflare.py` same-origin path against a freshly rebound exact active previous version. That deployment must install only `TDEV_CONFIG_JSON`, `TDEV_DEVICE_SECRET`, `TDEV_VERSION`, `TDEV_ROUTER`, export `TdevRendezvousDO`, and retire `Dev2RendezvousDO` as an explicitly named predecessor class. Upload response loss is reconciled by provider readback before any retry. The old previous Worker version may remain provider history, but no active Worker/runtime path may retain `DEV2_*` or `Dev2RendezvousDO`. Only after provider readback matches the fresh installation may its tdev device service start and reconnect.

If the fence fails before target-version deletion, the old services may be restarted unchanged after exact readback. If the target version has been deleted, recovery must continue from that positive fence and must not recreate the discarded staged target. If failure occurs after local terminalization or during fresh bootstrap/deploy, bounded TMCP/recovery tooling may resume only the same fresh installation/deployment identities from readback; it must not resurrect dev2 compatibility or historical Work/session/release state. Once the fresh tdev control plane is healthy, this recovery implementation is consumed and must be removed from the current source path before final C2-2 acceptance.


### Pre-cutover recovery-chain stale-ready session normalization

Required validation of the hard-cutover recovery implementation exposed one final retained-runtime lifecycle gap before the device can be stopped for cleanup. The exact recovery-source validation completed successfully and integrated as canonical commit `sha1:2b4421f5f6e52261812c693c0fdd1e99fc19cb45`. Its managed provider run `35417168781` for session `eb650872307a75892bc2fe1d3d0d2c90` is provider-terminal `completed/success`, the public validation Action is complete, and the session is actionless, but the retained pre-C1 installed runtime still projects the session as `ready` because that runtime predates the C1 background `SessionReconciler.start()` owner. Ordinary runtime readback therefore shows zero executing Action but one active managed session, blocking the held-Design cleanup precondition even though no external execution remains.

For this exact hard-cutover recovery chain only, the bounded recovery owner may normalize at most one such residual managed session before terminalizing the held Design Attempt. The eligible session is derived from the stopped old ledger, never caller-selected, and must be the sole nonclosed managed session. It must have no current Action, no pending dispatch, no offered/running assignment, no cancel uncertainty, no nonterminal assignment, and every retained assignment it does have must already be terminal with a trusted completed result. Its exact selected GitHub run must be re-read through the existing authenticated managed-provider contract and be `completed`; repository, owner, workflow, ref, launch commit and run-attempt identities must still match the retained session. The exact operational ref must either still point to the retained launch commit or already be absent with matching retained retirement evidence. Any queued/in-progress/unknown run, second nonclosed session, pending dispatch, offered/running assignment, held Attempt owned by the session, changed ref, duplicate provider run, provider ambiguity or identity mismatch aborts.

Normalization must preserve the exact state-transition and provider-observation semantics of the retained installed `ManagedSessions` / `GitHubSessions.refresh(sessionId,true)` owner, but it must not reintroduce that owner's legacy identity reader into the current normal runtime. Fresh source comparison proves why this distinction is required: installed source `sha1:67f7442d37b8b17e212e576f34bae32a354cd6e8` accepts both exact `tdev-exec` and retained `dev2-exec` intents, while the current hard-cutover source intentionally accepts only `tdev-exec`. Therefore the bounded hard-cutover recovery module may contain one recovery-local retained-session adapter for this sole pre-cutover session family. That adapter derives the exact legacy workflow/ref namespace only from the retained session itself and must independently recheck the old installation identity, repository/owner, launch commit, selected run, run attempt, terminal provider status, exact ref target or prior retirement evidence, and the absence of pending/offered/running work before mutation.

The recovery-local adapter may perform only the same durable terminal transition that the installed owner would perform after a positively observed completed selected run: close the exact retained session with the authenticated terminal provider observation, then retire only its exact operational ref and retain matching retirement evidence. Those writes must use compare-and-set checks over the exact retained session/ref identities and must be idempotent under response loss. It may not accept an arbitrary legacy namespace, modify current `src/execution/sessions.mjs` or `src/execution/github-sessions.mjs` to recognize `dev2`, update any unrelated session or assignment, forge provider completion, delete any other Git ref, create a replacement session, offer a new assignment or run validation. If validation of this Design or the matching source repair replaces the observed session with one later recovery-chain session of the same exact terminal/actionless shape, the same one-session rule applies to that successor; it never authorizes more than one nonclosed session at recovery apply time. The recovery-local legacy projection is consumed with the abandoned old ledger and must be removed with the hard-cutover recovery implementation before final C2-2 acceptance.

After normalization, fresh stopped-ledger readback must prove zero nonclosed managed sessions and zero offered/running assignments before `cleanup-held-design` may release Attempt `715653343cab9923b62fe1482393e00f`. This exception is consumed when the old ledger reaches that zero-live-session/zero-held-attempt boundary. It is not a general pre-C1 compatibility path, background reconciler substitute, or post-cutover behavior.



### Cloudflare latest-version deletion fence correction

Live execution of the authorized hard-cutover recovery proved one provider rule that the earlier target-deletion fence did not encode. With old device/helper services stopped, active deployment `c8e326bb-ce39-406c-8532-f7a7b789d4f8` still exactly previous-only at `7dffeadd-6d27-429a-bca5-838fbe38fc62`, and target `643ca63f-4e73-4c08-bc88-fdc565a1ad98` remained inactive and otherwise exact. Cloudflare nevertheless returned HTTP 404 / provider code 10339, `The latest version cannot be deleted.`, because that inactive target was Worker version 58 and still the latest uploaded version. Fresh GET immediately after each failed delete continued to return the exact target and the previous-only deployment unchanged. Therefore "inactive and unreferenced" is necessary but not sufficient for this provider deletion fence.

For this exact C2-2 recovery only, when all existing stopped-ledger, previous-only deployment, target legacy identity, no-marker, zero-live-session and zero-held-attempt predicates still hold and the exact target is the latest uploaded version, the bounded recovery owner may create at most one **predecessor sentinel version** before retrying target deletion. The sentinel is not a deployment, release, activation, compatibility path or new product runtime. It exists only to move the provider's latest-version deletion guard away from the abandoned target.

The sentinel upload must use the provider's version-only upload API, never the deployment/script replacement API. Cloudflare's version-only API rejects a UUID in an `inherit` binding's `version_id` and accepts only the literal `latest`; its script-content endpoint also returns the latest uploaded version rather than the active deployment's selected version. Therefore the bounded recovery request uses `version_id: "latest"` and the module bytes of the exact abandoned target only after a fresh version-list fence proves that target is latest, the active deployment references the exact previous version at 100%, and both target and predecessor retain the exact legacy binding family. The target's script is the only permissible sentinel code in this provider shape; it is already abandoned and the sentinel is never deployed. No old secret is read out and re-materialized by recovery. Compatibility date/flags and the sole live Durable Object export must equal the exact predecessor. The only export is live `Dev2RendezvousDO` with its existing sqlite namespace; the upload must not carry a delete/rename/transfer tombstone. Cloudflare's returned exports reconciliation must prove empty created, deleted, updated, renamed, transferred and transfer-pending sets and no warning/info residue. Before target deletion, the returned script etag must match either the positively read-back predecessor or exact abandoned target, and the resolved legacy binding shape must match the fence. Any resource difference or Durable Object reconciliation mutation aborts. After that positive fence, the immutable sentinel resource is rechecked for its legacy shape before deletion after a newer tdev version makes the provider latest-version guard releasable.

The sentinel carries exactly one deterministic recovery marker, `tdev.c2-2 hard-cutover predecessor sentinel 5c8b62c72661e66d3c5a29f5e382899ee0333bef4c0ad90b2910c169eddf51f0`. Provider version-list readback is part of the fence: before the sentinel, the latest version must be the exact target; after a confirmed upload, the latest version must be the single marker-bearing sentinel, while the exact target and exact previous version remain present and the active deployment remains previous-only. No unrelated latest version or second sentinel is tolerated.

Sentinel upload response loss is reconciled by fresh provider version-list and exact sentinel-resource readback before any retry. If the marker-bearing sentinel is present and exact, recovery continues without another upload. If fresh readback still proves the target is latest and no sentinel marker exists, only the same exact bounded sentinel upload may be retried; a changed/latest foreign version aborts. The old blocked activation effect is never resent or reclassified.

Only after the exact sentinel is positively latest may recovery delete target `643ca63f-4e73-4c08-bc88-fdc565a1ad98`. Target deletion retains the existing positive-readback rule: response loss is reconciled by GET; target absence plus unchanged previous-only deployment and exact sentinel latest state are required before helper activation terminalization or `release.ready` removal. The recovery plan digest remains bound to the existing immutable activation/effect/version identities and stopped-ledger backups, so sentinel creation does not mint a new logical recovery plan.

After a fresh tdev-only version has later been positively deployed and a newer version therefore exists, the same bounded recovery owner may delete only the single exact marker-bearing predecessor sentinel, and only if no deployment references it and its resolved code/resources still match the exact predecessor clone. Sentinel deletion is idempotent under response loss and must be positively read back as absent. This cleanup must occur before final C2-2 residual acceptance unless the sentinel has already disappeared. It does not authorize deletion of any other historical Worker version.

This correction does not weaken the final hard-cutover invariant. No new `DEV2_*` or `Dev2RendezvousDO` identity is allowed in the fresh installation or active tdev runtime. The sentinel is bounded provider recovery evidence only and is removed after the final tdev version makes it deletable.
