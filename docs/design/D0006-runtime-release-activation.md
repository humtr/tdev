# D0006 - Runtime and release activation

- Design: `D0006`
- Title: `Runtime and release activation`
- Status: `accepted`
- Depends-On: `[D0001, D0002, D0003]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `runtime-topology, release-activation, toolchain-seal`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

A system that can edit itself but needs an external developer to restart or re-scope it is not self-developing. Choose a concrete runtime and a small recoverable release transition without importing a Worker/Agent deployment hierarchy.

## Required outcome

One stable authenticated MCP endpoint serves repository discovery, isolated execution, integration and its own release activation. Repository HEAD and running release are separately observable identities. A normal new work item never changes routing, deploy-time source scope, credentials or service configuration.

## Facts / assumptions / unknowns

The repository has only documentation at design acceptance. No dev-2 installation, DNS name, OAuth issuer or Linux execution host has been provisioned or verified. These are installation values, not undecided product semantics. A transition operator must provision an authorized host once; absence blocks live verification but not core implementation. Node 24 has a built-in SQLite interface; its documented release-candidate stability is an explicit pinning risk, not a claim of stable API compatibility.

## Decision

The first deployment is a persistent Linux service: one Node.js broker process, per-repository SQLite databases and immutable object/artifact storage on a local persistent filesystem, plus rootless Podman execution containers. HTTPS terminates at a standard reverse proxy with a fixed `/mcp` route to the broker. Use a static configured origin, not a dynamically allocated tunnel as a product dependency. Cloudflare Workers, Durable Objects, D1, a separate Agent, a model subprocess and a remote queue are not required.

The installation record contains `installationId`, public MCP origin, OAuth issuer/audience, broker state directory, approved repository bindings, adopted policy digests, execution capacity and release pointers. The self-repository binding names provider repository `humtr/tdev` and ref `refs/heads/dev-2`; its stable provider repository ID is resolved and verified at installation. Runtime configuration does not contain a task-specific list of source files. New snapshots resolve the bound remote ref through D0002 even when running code predates that HEAD.

Implement the broker as JavaScript ESM with checked JSDoc interfaces and the Node built-in test runner. Use Node **24.21.0** as the initial toolchain pin, Git **2.55.0**, Python **3.12 or later** only for documentation tooling, and rootless Podman **5.x** with user namespaces and cgroup v2 for production execution. Exact Podman package version, base-image digests, architecture, SQLite version and all npm dependency integrity hashes must be sealed in `config/toolchain.lock.json` at initial build; a range alone is not a valid execution seal. Resolving an available patched package/image within these chosen families is an implementation artifact selection, not a license to change the architecture. Update pins as a validated Direct change unless behavior/security contracts change.

Use `node:sqlite` behind a private storage module, not in domain interfaces. SQLite extensions are disabled. Prepared queries and short synchronous transactions are bounded; long filesystem scans, Git/network work, hashing large trees and child execution are asynchronous/offloaded. Add a DB worker only if measured event-loop blocking falsifies the latency budget, not as a second durable owner. WAL uses a local filesystem, not NFS. Snapshot backups include the SQLite-consistent backup plus referenced immutable objects; restore never silently replays uncertain Git effects.

The first deployment supports Linux amd64 and arm64 under the same contracts. A Termux host or the current ChatGPT container may run eligible hermetic tests but is not automatically a production execution target. No absolute HOME, CPU count or predecessor registry location is compiled into product semantics.

### Release identity and installation

A release is an immutable directory containing source commit ID, source manifest SHA-256, build artifact SHA-256, toolchain/environment seal, MCP schema digest, supported ledger-format interval and trusted validation receipt references. Its identity is the SHA-256 of that record plus artifact manifest. Build from an exact already integrated commit; do not rebuild different bytes between staging and activation. Package imports never execute from a mutable checkout.

The standard Linux service manager (initial adapter: systemd) owns process lifetime. A small fixed `dev2-activate` helper has only the authority to inspect the installation's release pointers, switch to an already verified release, and restart the named broker unit. It is invoked as a bounded service-manager job, not as a model process or free-form command. It cannot fetch arbitrary URLs, edit Git or interpret repository instructions. The helper executable is immutable within its active release; the invoking job remains alive independently of the broker being replaced.

One installation-level activation record is necessary because the process performing MCP work is itself being replaced. It is a fsynced, atomically replaced record, not a journal or workflow framework. Fields are `activationId`, request identity/digest, expected active release, candidate release, original release, phase, deadline, observed process/release, and terminal outcome. Its owner is the helper; the repository action row references this record and never competes as activation truth. The helper uses an OS exclusive lock on the activation record. This lock protects only release handoff, not ordinary repository execution.

### Activation algorithm

1. `release.stage` builds and validates an exact integrated commit in the normal sandbox, seals its artifact, and runs candidate startup/self-check against a disposable copy of state with provider writes disabled. Require the current trusted release policy, MCP contract compatibility and complete D0007 release checks applicable to this transition.
2. `release.activate` checks `runtime.activate`, expected active release, exact staged artifact, compatible ledger format and absence of another activation. Persist the helper intent before asking systemd to run it. A duplicate invocation reads the same record.
3. The current broker stops admitting **new mutable actions** for the brief handoff. Reads remain available until restart. Existing sandbox containers continue with durable identities; already-dispatched provider effects are reconciled or the activation remains `blocked`. Do not wait for arbitrary long validation to finish, kill it, or discard another work's state. Drain short ledger transactions and close the broker's ownership lock.
4. The helper independently verifies old process termination/ownership release, atomically switches the release pointer and restarts the broker. The new broker must acquire the exclusive broker lock, open compatible databases, reconcile recorded attempts/effects, and expose the expected release ID. It must not launch new writes during its readiness probe.
5. After local authenticated health and exact release readback pass, mark the activation `active`, enable admission and expose terminal evidence through `dev_observe`. The controller then independently reads the same canonical public MCP origin. Local success without public readback is not experiential success.
6. On bounded startup/readiness failure, stop the failed broker, verify ownership release, restore the original pointer and restart the original release. Record `rolled_back` only after exact old-release readiness. If either termination or restore is uncertain, record `blocked` and serve no conflicting writer. Never label a failed activation as successful merely because source integration succeeded.

Initial transition policy: helper deadline 120 seconds, local readiness deadline 30 seconds per launch, request wait at most 20 seconds, profile execution deadlines separately enforced. Values are deployment policy, not durable identity. Expiration stops new steps but cannot manufacture certainty about an existing effect. Recovery reruns the fixed helper against the same intent; it does not invent another activation.

### State evolution

First release uses schema version 1. Ordinary updates must support the active schema and rolling upgrade/rollback to the previous release. Additive changes are preferred; a schema migration is an explicitly versioned release operation tested both before and after crash. Destructive migrations require a new bounded Design and backup/restore proof; they are not part of the default core. A release that cannot reopen the active ledger is rejected before pointer replacement, not tested on the sole live copy.

Retain current and previous healthy releases plus releases referenced by unresolved work. The service manager's restart-on-failure policy and D0001 reconciliation provide ordinary recovery. No separate qualification service, migration coordinator, multi-provider tunnel election or historical epoch translation is introduced.

## Concurrency and isolation

Stage/build/test releases alongside other work under ordinary resource admission. Serialize only activation because two brokers cannot own the same installation's ledgers and credential dispatcher. This is an actual global process-ownership invariant; it does not justify global serialization for development. Persisted containers survive a broker restart, and a failed work item cannot block activation unless its unresolved canonical effect really conflicts with the writer handoff.

## Failure and recovery

Process crash before intent dispatch: reconcile existing intent. Crash after pointer replacement: inspect pointer, process identity and readiness; do not infer from action response. A stale activation expectation returns `STALE_RELEASE`. Missing sandbox, disk pressure or incompatible state returns a bounded rejection while current runtime stays active. Disaster restore must first resolve or fence old provider dispatchers; absent reliable effect evidence leaves affected refs blocked. Break-glass tooling may repair a broken installation, but normal staging/activation remains callable through dev-2 MCP.

## Alternatives

An all-Worker control plane still requires a separate command executor and distributed ownership; rejected for this execution-heavy first product. A plain unsandboxed local shell is smaller but violates isolation/credential boundaries. In-place source replacement cannot bind running bytes and is rejected. A permanent custom supervisor duplicates the service manager; use the fixed handoff helper only for its necessary release identity/rollback logic. Zero-downtime multi-writer blue/green deployment is not required and would add fencing/state compatibility complexity before evidence justifies it.

## Acceptance

Run exact release staging and activation through MCP, including a real source change; show source HEAD can advance without redeployment for ordinary context. Crash before/after intent, pointer switch and readiness; observe exactly one writer and same work IDs. Keep eight running fixture validations across restart, recover output receipts, and prove no cross-work contamination. Demonstrate rollback to exact prior artifact with no database downgrade corruption. A host that cannot satisfy sandbox probes cannot pass deployment acceptance.

## Implementation consequences

Runtime composition belongs under `src/runtime/`, fixed helper and service-unit templates under `deploy/`, no host-specific absolute paths. Configuration contains no secrets and all required capability probes are reproducible. D0004 only exposes typed release actions; D0007 owns execution commands and evidence gates.

## Fixed-helper storage and control boundary

The activation authority retains one current atomically replaced record plus
immutable terminal receipts keyed by activation ID. A terminal receipt is durable
before the current record can be replaced, preserving delayed response retries
without a workflow journal. Replaying an already admitted intent observes its
retained outcome even after the original forward deadline. The original deadline
still gates every new forward step. Bounded rollback safety work may continue
after it, but cannot invent certainty about process termination.

The Linux helper owns a real `flock` for the complete handoff. Its inherited open
file description survives the short lock-acquisition utility, and is closed on
helper exit; a PID file or persistent lock directory is not a substitute.
The service manager adapter can act only on the configured broker unit and its
private installation control socket. It never accepts a unit name, executable,
URL or shell program from an MCP action. The private socket is outside candidate
mounts and protected by installation-user filesystem permissions. Broker drain
fences future provider dispatch and waits only for already-admitted ref effects;
long-running isolated validations may survive broker replacement.

Build artifacts are sealed regular files, copied into an immutable release
namespace, fsynced and attested with an installation-only key after trusted
exact-source/build/startup verification. The key is not a validation result from
candidate code. Every activation and broker startup rechecks artifact hashes and
ledger compatibility. The first regular-file artifact packaging excludes symlinks
and hardlinks; it does not reinterpret source-tree Git symlinks.
