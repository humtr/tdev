# D0006 - Runtime and release activation

- Design: `D0006`
- Title: `Runtime and release activation`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003]`
- Supersedes: `[]`
- Directive: `r3`
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

Actual native and account observations are retained in the environment correction
evidence. The workers.dev subdomain exists; its exact dev-2 Worker/origin is selected from fresh
installation readback, including the authorized existing-origin cutover. Existing GitHub CI runs; production sandbox, managed-session latency,
account quota and new deployment permissions are not yet proven. No paid capability
or uninterrupted Android lifetime is assumed.

## 1. Decision: selected first-release topology

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

## 6. Alternatives, bounds and acceptance evidence

A generic Linux service and public reverse proxy fail DIRECTIVE Section13. A cloud
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


## Phase A installation boundary

DIRECTIVE Section 14 permits replacing the current tdev Worker at the same verified
workers.dev origin. Do not add a live predecessor compatibility/migration layer.
Remove the old tool dispatch and old product bindings from the active request path;
unrelated provider resources and predecessor source/history remain untouched.
An existing human Access registration may be adopted as D0005 specifies; the new
routing DO and device channel retain no old work/request state.

A bootstrap-installed reviewed bundle may expose the complete frozen public contract
and real native repository/ledger/candidate/preparation backend before the full
hosted/activation seal. Its identity, capabilities and unqualified release status
must be explicit. It is not an active production-sealed release by implication.
Install immutable source outside a dirty implementation workspace, wire the native
launcher and durable state, and verify outbound reconnect. Phase B completes missing
hosted/session/activation capabilities through the existing public vocabulary.


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


### Provider-constrained predecessor retirement

A fresh provider rejection may identify another old tdev trial Worker binding to
the exact predecessor namespace being retired. After verifying that trial's
source/deployment identity and exact binding, remove only that old-product binding;
preserve its other bindings, source, Access configuration and unrelated resources.
This is owner-authorized old runtime retirement, not a migration/compatibility layer.
Re-read both trial binding state and target deployment before retrying cutover.
Current resource names/IDs and rejection/readback belong to Phase A evidence.
