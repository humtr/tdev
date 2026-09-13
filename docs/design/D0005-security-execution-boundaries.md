# D0005 - Security and execution boundaries

- Design: `D0005`
- Title: `Security and execution boundaries`
- Status: `accepted`
- Depends-On: `[]`
- Supersedes: `[]`
- Directive: `r4`
- Owns: `authorization, sandbox-boundary, credential-custody`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.




## Problem

Required source isolation and least-authority execution cannot assume a container
engine or different OS users inside the actual Termux app. Public human OAuth,
device connectivity and managed executor authentication must not be confused.

## Required outcome

Keep secrets and canonical effects outside untrusted candidates, authorize each
operation from verified identity and current grants, and fail closed when the
selected environment cannot enforce a required bound.

## Facts / assumptions / unknowns

The bounded live inventory is in the environment correction evidence. Native
filesystem/SQLite/process primitives work; user namespaces and Landlock are not
available to this process. A managed CI engine is observed but its production
containment seal and final dev-2 Access installation binding require independent verification. No token
shape or grant is inferred from an unverified proxy header.

## 1. Decision and trust model

Use capability-separated trusted control on native Termux, a workers.dev ingress,
and isolated candidate execution on managed ephemeral GitHub runners. Placement
is D0006's decision; this Design owns authorization, containment and credentials.
The user operates no extra Linux server. A working directory, cleared environment,
PRoot, a shell allowlist or Node permissions is not a hostile-source sandbox.

The Android app UID contains operator credentials and is a trusted control domain.
Only installed, explicitly authorized dev-2 release code and fixed broker-owned Git
commands run there. Do not execute proposed source, npm hooks, project scripts or
arbitrary profile commands in that UID as a fallback. The threat model trusts the
operator, installed release and provider isolation, not candidate code, repository
configuration, logs, inbound headers or a caller's claimed principal. Compromise of
the operator UID is outside the promised cross-candidate isolation boundary.

## 2. Human identity and capability delegation

The selected first-release authorization service is Cloudflare Access Managed
OAuth on the explicitly adopted dev-2 installation application. For the owner-authorized same-origin cutover, the existing human Access application may be adopted after fresh issuer/audience/domain/policy readback, preserving its ChatGPT OAuth registration without preserving old runtime semantics. A new application is required only when actual binding/security evidence prevents safe adoption, not merely because the backing product changed.
Its opaque OAuth access token terminates at Access; it is not a JWT bearer. The
Worker and Termux verifier validate the signed Access assertion with the exact
installation issuer, application audience, allowed asymmetric algorithm, expiration,
issued-at/not-before and human subject. Reject service-token identities on human
MCP routes. Never trust `Cf-Access-Jwt-Assertion` merely because a header exists.
The device receives the signed assertion through the authenticated typed channel;
raw OAuth tokens are not logged or forwarded to subprocesses.

Managed OAuth delegates application access, not dev-2's six named capabilities.
Represent that fact explicitly as an adopted `access-application` auth profile:
its fixed, nonempty `applicationCapabilities` is a deployment-grant ceiling, not
an inferred token `scope`. Authorization is the intersection of verified application
delegation, current principal-specific standing grants, repository/ref/path scope
and the requested operation. Grant revocation takes effect at each admission/read
and before integration or activation. Identity token expiry does not silently
cancel already admitted deterministic execution; any later privileged effect must
obtain currently valid authorization or block.

The existing `oauth-jwt` profile continues to require a verified `scope` claim and
intersect it with standing grants. Never auto-detect or downgrade between profiles;
missing scopes on that profile still fail. A caller cannot choose its auth profile,
application ceiling, audience or issuer. `Principal.tokenCapabilities` remains a
verified delegation ceiling: the Access adapter derives it only after assertion
verification from the adopted application profile. Distinct profile IDs and tests
make this provider-specific semantic change visible rather than an authorization
bypass. Private/special-purpose OAuth clients needing narrower delegated powers
require a distinct adopted application/profile, not fabricated per-token scopes.

### Installation owner and additional principals

Installation ownership and repository authorization are separate facts. The original
`ownerSubjectDigest` remains the bootstrap/install ownership identity and always
produces the deterministic owner grant. Additional human principals are additive,
explicit standing grants for exact verified `dev2.access-subject.v1` digests; they
never become installation owners merely because they receive the same capability
set. Email, Access membership, domain, IP, browser or recent-request ordering are not
authorization identities.

One app-private file under the stable installation state directory owns mutable human
authorization. It contains the owner subject digest plus zero or more additional
principal entries with explicit capability, allowed-path and denied-path sets. It
contains no raw Access `sub`, email, token or assertion. Duplicate subjects, including
an owner repeated as an additional principal, are rejected rather than merged. A
legacy installation with no private authorization file retains its exact embedded
single-owner grant behavior until an operator-authorized migration creates the file.
Once the file exists, it is the sole standing-grant source; deletion of an additional
entry therefore takes effect on the next native authorization lookup. Updates use a
private atomic file replacement and cannot replace the installation owner.

The Worker remains the Access assertion verifier and ingress boundary, but it does
not independently own or infer repository standing grants. Every authenticated MCP
POST asks the native installation authority for a fixed admission preflight over the
already authenticated device channel. The native endpoint independently verifies the
same signed assertion against exact issuer, application audience and resource origin,
consults the live private standing-grant source, and returns only whether the principal
currently has the fixed `repository.read` preflight grant. If the native authority is
unavailable or the assertion is invalid, discovery fails closed.

A cryptographically authenticated principal may complete only fixed protocol setup
and descriptor methods (`server/discover`, `initialize`, initialization notifications,
`ping`, and `tools/list`) when that preflight reports no standing grant. Those replies
contain protocol/server metadata and the frozen four tool descriptors only; they expose
no repository identity or contents, work/runtime state, artifacts, operation results,
or mutation surface. Every `tools/call` still requires a positive current
`repository.read` preflight before dispatch, and normal tool dispatch independently
re-verifies capability/path authorization. Authentication-only discovery is therefore
not repository authorization and cannot be used to exercise any dev-2 operation.
This keeps one grant owner instead of duplicating mutable principal lists in Worker
and native configuration.

The private grant file is installation state, not repository source or a release
artifact. Release configuration preserves the stable installation state directory,
so source upgrades/restarts do not erase authorized principals. A fixed private
operator utility may replace the desired digest-only grant record after verified
identity binding. Public MCP schemas, `dev_work`, candidate output, profiles and
release artifacts have no grant-selection or grant-mutation field and cannot create
or broaden standing authority.

ChatGPT connection setup must not deadlock on the standing grant that commissioning
is intended to create. After the native verifier has cryptographically accepted an
Access assertion, an unknown principal may complete only the authentication-only
protocol discovery described above. Before returning that negative grant status,
native code appends installation-private observation evidence containing only the
verified subject digest, a digest of that exact signed assertion, an opaque
deterministic observation ID and observation time. It stores no raw `sub`, email,
token or assertion and confers no capability. The same principal remains
`FORBIDDEN` from every `tools/call` until a trusted operator installs an explicit
standing grant. Invalid issuer, audience, signature or expiry fails before any
observation is created. A known principal with an insufficient capability is not an
enrollment candidate.

Promotion remains a separate trusted operator action. The private operator must
select an exact observation ID and explicit capabilities/path restrictions; the
utility resolves the verified subject from that observation, preserves the original
owner and all unrelated grants, and atomically updates the sole private grant file.
Repository source, a candidate, an MCP caller, Access membership, email, request
ordering or the most recent denial can never promote an observation automatically.
If multiple observations make the intended user interaction ambiguous, no grant is
installed until the operator can bind the intended interaction without guessing.

Capabilities remain `repository.read`, `work.write`, `profile.run`,
`integration.write`, `policy.write`, `runtime.activate`. A read-only grant cannot
use work mutations. Runtime activation and policy adoption require explicit standing
grants separate from source writing. Descriptions, tool annotations, retrieved
repository prose and a passing test never grant authority.

## 3. Device and hosted execution authentication

A registered installation device uses an independent random channel credential,
kept in Android app-private storage and Worker secret storage, with rotation under
explicit installation authority. HTTPS/WSS and exact workers.dev origin are
mandatory. Never place it in a URL or accept it on a human MCP route. It authorizes
only that installation's typed transport, not a new human principal or Git write.
Deployment forbids public access to an unverified direct/preview Worker route.

Hosted execution connects outward to the same public service using a short-lived
GitHub Actions OIDC token with the installed audience. Verify the issuer signature,
expiry, repository_id/owner_id, workflow identity and SHA, event, operational ref,
run_id and run_attempt against a durable session intent and a fresh GitHub run
readback. Permit only the approved trusted runtime commit, never candidate workflow
bytes or a user-supplied image/entrypoint. Select one provider run atomically before
assigning attempts. A duplicate run gets no candidate execution authority.

A verified session receives only a per-session secret/capability restricted to its
assigned attempt identities, exact input objects and authenticated results. No
canonical Git writer, Cloudflare token, device key, user OAuth token or broker-ledger
access enters the hosted job. Candidate containers receive none of the session's
credentials or OIDC environment. Machine authentication never supplies human grants.

## 4. Candidate containment and execution seal

Each attempt executes inside its own rootless OCI container on the hosted runner.
The trusted outer controller is approved release code, not a checked-out candidate
workflow. Require an immutable image digest, checked engine binary/version,
private PID/mount/user namespaces, no capabilities, no-new-privileges, enforcing
seccomp, resource controllers and bounded writable scratch. Network defaults to
none; an adopted fixture network has exact destinations and separate scoped fixture
credentials. No Docker/Podman socket, host home, runner workspace, Git credentials,
cloud metadata or broker transport socket is mounted inside the container.

Immutable source is materialized by trusted code from D0002 objects and mounted
read-only. Required offline validation may also mount one immutable dependency
artifact at the profile-reserved `node_modules` path. This is a separate artifact,
not the runner workspace: trusted approved release code builds it from its exact
locked dependencies with lifecycle scripts disabled, copies only dependency bytes
into a private cache outside the checkout, rejects escaping links and special files,
and records its content digest with the dependency-lock identity. The candidate
cannot select its host path or substitute its bytes; the mount is read-only and
contains no credentials, repository metadata, control state or transport sockets.
Candidate entries colliding with the reserved mount path are rejected. A mismatched
lock/artifact fails closed rather than downloading or executing candidate-selected
package installation on the trusted host. A different adopted dependency artifact
requires its own exact validation and seal; the normal source-edit path reuses the
matching warm artifact without a provider deployment or new registry service.

This realizes the existing locked-dependency/offline requirement without baking a
new image for every source edit. Baking the same artifact into a pinned image is
an equivalent but heavier alternative; mounting a writable cache or the checkout
is not. Acceptance adds an actual managed read-only dependency mount, absence of
host/control canaries, lock mismatch rejection and unchanged tracked source hashes.

Commands, argument schemas, cwd, image, CPU/memory/PID/disk/log limits,
deadline, kill grace and replay-safety are adopted profile inputs. No unrestricted
shell operation is exposed. Tests may execute untrusted code inside this boundary;
the trusted controller computes input/output integrity and signs the receipt outside
it. Candidate stdout saying PASS, modifying its tests, printing a fake receipt or
exiting zero is not the controller's validation result.

A runner image or `podman --version` is not an execution seal. Preflight must exercise
the exact invocation and reject missing namespace, seccomp, cgroup, log, deadline or
storage guarantees. Current observed Podman 4.9.3 is evidence, not an assertion that
all existing adapter flags work. Remove unsupported adapter flags only by replacing
them with an equivalent tested enforcement, never by silently dropping the bound.

Attempt names/labels hash the full immutable attempt identity. Create is atomic;
inspect verifies source/profile/identity labels before observing or cancelling.
Never relaunch a known attempt merely because a response was lost. A session-side
attempt file is a durable effect observation for that ephemeral host, not a second
work owner; if it or the host is lost, GitHub terminal run readback proves the old
host execution has ended before a new replay-safe validation attempt is admitted.
A missing connection, lease or heartbeat is not proof of termination.

### Production outer receipt and kernel lifetime

The selected production execution keeps the credential-free container alive with a
fixed image-resident idle process while the trusted outer controller invokes the
adopted command through one bounded exec. This permits exact host-side cgroup and
namespace observations before and after the command, before container teardown.
Neither child stdout nor a candidate-writable result file supplies kernel evidence.
The original profile's container deadline, resource bounds, immutable source and
controller mounts remain enforced. The outer controller stops the entire container
and verifies stop, including descendant processes, before submitting completion.

The outer journal persists intent before exec. An interrupted exec with no retained
outcome cannot be rerun in that assignment; reconcile and stop it, then expose an
interrupted result. Transfer loss after a retained outcome resends identical objects
and completion without execution. A complete receipt binds native input identity,
assignment/lease, provider session/run, exact command/profile, before/after kernel
observations, stopped execution outcome, source digests and bounded output objects.
Native acceptance joins that receipt to the immutable prepared result, generation,
policy, full attempt and installation/binding epoch before HMAC signing. Historical
qualified receipts retain their original evidence class and cannot acquire this
production proof by adding a field or relabeling a log.

Finite release builds return only device.cjs, worker.mjs and tools.json as bounded
objects. Collection is a fixed credential-free container operation; the trusted
outer controller hashes the actual returned bytes. Native code verifies the bound
object set and frozen descriptor contract, never runs a candidate build/install hook.
Missing observations, changed cgroup identity, OOM counter increases, incomplete
stop, output truncation or object disagreement reject production eligibility. The
new execution shape requires actual managed containment qualification and live
native receipt acceptance before enrollment; deterministic tests alone do not seal it.

## 5. Credential and effect boundary

Only Termux's trusted integration component receives repository-scoped Git provider
credentials. Fixed remote/ref and trusted Git configuration disable hooks, filters,
external diff, credential helpers selected by source, and arbitrary remote URLs.
The auxiliary execution-ref prefix is separately authorized; it is never canonical
integration. Candidate results cannot mutate either namespace directly.

Only the fixed deployment/activation helper receives provider-update credentials.
It accepts sealed release identities and expected active identities, not shell
commands or arbitrary provider requests. Read-only inventory authorization does
not prove deployment permission. Missing write grants block installation, not cause
borrowing of predecessor identities. Secrets stay outside source/evidence/logs.

Executing an integrated release on Android is a deliberate `runtime.activate`
trust transition by a currently authorized principal after required isolated validation.
Native compatibility checks run as part of that explicit activation authority on
disposable device state, before changing the active release pointer. It is not an escape hatch for `run` or `validate` and
does not claim to sandbox an untrusted release from its operator. A release that
cannot be safely activated remains inactive even when its source is integrated.

## 6. Acceptance and alternatives

Required tests include spoofed/missing assertions, wrong application/issuer, service
identity on human routes, profile downgrade, expired authorization, revoked grants,
forged OIDC/run identity, duplicate session selection, sandbox host-secret access,
namespace escape, network/metadata egress, fork/output/storage abuse, independent
attempt cancellation and unavailable-host recovery. Native trusted probes and mock
Podman arguments do not replace these managed-layer tests.

All-local unprivileged execution was rejected because this device's investigated
isolation primitives do not supply the required hostile-code boundary. A new VPS,
rooting Android or a new security-helper APK is not an assumed user asset. Existing
managed execution is selected over inventing an unverified paid provider capability;
its cost/performance remains subject to D0007, not presumed superior.

## Implementation consequences

Keep fixed-command control and provider credentials on Termux. Retain the strict
JWT-scope verifier, add the explicitly configured Access-application verifier, and
implement machine/hosted execution adapters without changing domain work identity.
All production containment claims require real managed-layer negative tests.

### Authentication completion and role routing

Recheck assertion/lease expiry after asynchronous key/provider lookup as well as
at later capability dispatch. An optionally present Access `nbf` is a nonnegative
safe integer timestamp; malformed claims are not ignored. A missing configured
application ceiling is a bounded configuration error, never a default grant.

Managed compute enrollment requires the selected session, the provider's exact
run attempt and a currently active run. The initial adapter accepts only attempt1
of the trusted push workflow; a manual rerun requires a new retained session intent,
not implicit reuse. Result identity is a machine role without human capabilities.
Do not validate against a launch descriptor supplied by the connecting peer.

The installation's Access application protects the human MCP route. Device and
executor paths on the same workers.dev origin require their separate machine
verifiers, not a broad anonymous bypass of the human route. Read back exact path
coverage and test negative cross-role requests. Missing routing/auth configuration
blocks deployment; existing predecessor apps and preview routes are not fallbacks.


## Phase A authorization boundary

Rebinding an existing verified Access application under DIRECTIVE Section 14 is an
explicit installation decision, not automatic trust in predecessor configuration.
Keep its human OAuth issuer/audience and registration only after live readback;
provision a separate dev-2 device credential and explicit principal-specific grants.
Do not turn off Access, accept arbitrary unsigned headers, add a service-token human
bypass, broaden account membership or copy old product operation authorization.
Existing provider state outside the exact changed product binding is preserved.
Unavailable hosted sealing blocks ordinary candidate execution/integration eligibility;
reviewed Phase A bootstrap tests are separate operator-authorized evidence, not a
production validation receipt or permission to execute arbitrary candidate code.


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
