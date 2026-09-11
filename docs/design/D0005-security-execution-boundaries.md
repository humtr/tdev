# D0005 - Security and execution boundaries

- Design: `D0005`
- Title: `Security and execution boundaries`
- Status: `accepted`
- Depends-On: `[]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `authorization, sandbox-boundary, credential-custody`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

Repository files and test commands are executable, potentially hostile input. A convenient shell is not an authorization model. Choose the smallest boundary that permits ChatGPT to write and test code without giving that code canonical Git, service-control, or credential authority.

## Required outcome

An authenticated principal can read its authorized repository, edit an isolated candidate, run bounded profiles, integrate validated bytes, and activate an authorized release. Neither a repository instruction, path, output, MCP annotation, nor a child process can grant itself additional authority. Independent executions cannot read or mutate one another.

## Facts / assumptions / unknowns

The Directive requires authorization, exact identity, isolation and no mandatory second model. Rootless OCI isolation and standard OAuth resource-server behavior are available mechanisms, not evidence that a dev-2 deployment exists. The initial deployment requires an authorized Linux host with user namespaces, cgroup v2 and a rootless Podman installation. Availability of that host, an OAuth issuer, DNS and credentials is unverified until deployment evidence is recorded. A same-UID process on an ordinary checkout does not meet the production sandbox contract.

## Decision

There are three trust domains, not three independent product owners:

1. **Controller:** the authenticated ChatGPT caller chooses source edits and typed operations. The server still checks authorization and preconditions.
2. **Broker:** trusted dev-2 code owns ledgers, object ingestion, Git remote credentials, ref updates and release intent. It never evaluates repository JavaScript in its own process.
3. **Execution sandbox:** a disposable, credential-free rootless OCI container executes repository code with explicit resource and filesystem bounds. It owns no canonical effect.

Use an existing standards-conformant OAuth authorization server; dev-2 is a resource server, not a new account/consent system. Verify issuer, signature and allowed algorithm, expiration, audience/resource, subject and scoped repository access on every request. Publish protected-resource metadata and the configured authorization-server location. Use PKCE through the issuer for interactive client authorization; do not accept a token merely because an upstream proxy accepted it. The issuer and audience are installation configuration. Tokens and secrets never enter repository context, request hashes, logs or evidence.

Capabilities are `repository.read`, `work.write`, `profile.run`, `integration.write`, `policy.write`, `runtime.activate`, each scoped to installation/repository/ref as applicable. A principal may hold several capabilities under standing authorization. No mandatory approval round trip is added per ordinary work item. Deployment/bootstrap authority is not inferred from `work.write`. Recheck authorization at effect dispatch; a revoked queued request cannot publish. An already committed effect remains observable as historical fact after revocation, subject to read access.

Bindings are installation-admin-managed records keyed by stable provider repository ID, not caller URLs. Only approved Git HTTPS/SSH endpoints are contacted. Reject redirect-to-unapproved-host, repository identity mismatch, local file remotes, transport helpers supplied by a repository, and private-network fetch targets unless explicitly part of the deployment policy. Git operations use a sanitized environment, disabled hooks and filters, broker-owned configuration, exact refspecs, and no inherited credential helpers from candidate files.

The effective capability set is the intersection of verified token scopes and
current installation grants, never their union. The JWT `scope` claim must be a
bounded space-delimited string. Unknown scopes grant no dev-2 capability; absent
scopes or absent verified token-capability metadata cannot inherit a standing
grant. Internal Principal records may omit that metadata for abstract port test
fixtures, but the concrete ScopedAuthorization boundary then denies access.

Container launch is one detached `run` with an immutable deterministic name, no
replace/restart/auto-remove, and an engine/conmon-owned timeout. The initial
Podman adapter requires profile timeouts/grace to be positive whole seconds, so
conversion cannot silently extend the profile deadline. The broker's action
deadline is independently enforced by cancellation. Image entrypoint, proxy
forwarding, image volumes, healthchecks and default environment are disabled or
explicitly replaced by the fixed profile. The persisted launch label binds the
profile and source manifest. A surviving created-but-never-confirmed-started
container is quarantined as an uncertain launch: recovery may inspect/cancel it,
not blindly issue `start` or recreate the same attempt. A fresh attempt is allowed
only after the owning action proves the old sender and container stopped.

### Source and mutation

All paths are repository-relative UTF-8, reject NUL, absolute paths, `..`, platform separators and normalization aliases. Preserve case-sensitive Git path identity; reject collisions on a materialization filesystem that cannot represent it. Never dereference a candidate symlink while writing another path. Git metadata, runtime state, credentials and other work roots are outside the exposed namespace. A symlink is a typed blob for inspection; materialization rejects escaping or cyclic links. Submodule and LFS pointers are visible as metadata; execution requiring unresolved content returns `UNSUPPORTED_REPOSITORY_FEATURE`, never success or a silent empty file.

Candidate edits use expected entry identities and an expected work revision. Authorization covers the repository and allowed write paths, independent of the context already read. Expansion to another ordinary source path does not require redeployment. Denied paths remain denied even if their blob digest is known. Requests cannot select arbitrary host paths, shell executables, environment names, remotes, service units or credential references.

### Command execution

Only named profiles in the trusted policy are callable. A profile contains fixed executable/argv construction, relative cwd, allowed typed parameters, timeout, CPU/memory/PID/disk/log limits, network mode and input/output paths. Profile arguments never interpolate into a shell. Repository scripts themselves remain untrusted and run only inside the sandbox. The core has no model invocation capability.

The initial production launcher uses rootless Podman, a digest-pinned image, dropped capabilities, no new privileges, a default-deny seccomp policy, read-only image root, private namespaces, a private temporary directory, no host PID/IPC namespace, no device/engine sockets and no broker HOME. Only that attempt's source materialization and private writable build/scratch volumes are mounted. Source files may be made read-only where compatible; otherwise the trusted runner checks the complete tracked tree before and after validation. Any tracked mutation invalidates the result. Read-only shared dependency artifacts are content-addressed and verified; mutable cache directories are per attempt.

Network is disabled for core/hermetic profiles. Dependency resolution is a separate declared preparation step with allowlisted package endpoints and lock/integrity enforcement; it is not a shell with general egress. Integration/live fixtures receive only fixture-scoped capabilities through a brokered service or short-lived fixture token, never the canonical Git writer or runtime activation key. Profile output is untrusted data, not a command or instruction to the broker. Truncation includes byte counts and artifact handles; never silently truncate a source mutation payload.

### Credential and effect boundary

The broker alone can ask the provider to update the bound canonical ref. Use a repository-scoped, short-lived provider credential where supported, with a separately scoped runtime activation capability. Secret material is injected into the broker through the installation's secret store, not checked into Git or sent in MCP arguments. Sanitized receipts record credential identity/version, never values. A source commit does not automatically authorize changing OAuth issuer, scopes, provider account, network allowlists or fixture targets.

Policy changes are explicit typed actions under `policy.write`, with expected old policy digest and audited new digest. They are not auto-discovered from a candidate. Existing required validation cannot be removed by editing a candidate's manifest. D0003 owns adoption and validation ordering. Release activation is similarly explicit, not a hidden post-commit hook.

## Concurrency and isolation

Authorization and read checks are concurrent. A sandbox identity is `(installation, repository, work, action, attempt, ownerEpoch)`, never a slot number. Resource quotas apply to that identity. A sandbox has no route to another candidate or ledger even if a client guesses its work ID. Per-principal admission limits prevent one caller exhausting all capacity. A rejected sandbox launch does not reserve a slot indefinitely or serialize other work.

## Failure and recovery

Sandbox capability probes fail closed. Do not silently fall back to an unsandboxed host command. Revocation stops new effects and requests cancellation of affected running profiles; their outputs cannot grant new effects. Timeouts terminate the exact container/process group, then verify it is stopped before a writable materialization is reused. Unconfirmed termination quarantines that attempt, not the repository. Disk/log exhaustion stops that attempt and preserves a bounded receipt. Authentication outages do not convert requests into anonymous access.

## Alternatives

Unrestricted `shell.run` is rejected as the normal public contract: it joins user intent, arbitrary execution and privileged effects. A same-UID worktree is insufficient for untrusted tests. A Worker-only runtime cannot supply the chosen local Git and execution boundary without adding another executor/control protocol. A new credential broker service or OAuth server is unnecessary; keep these as narrow modules and an existing issuer. Full VM-per-work isolation is stronger but is not initially required for the declared threat model; hostile multi-tenant kernel isolation would require a replacement sandbox implementation, not weaker checks.

## Acceptance

Fail tests for path traversal, symlink escape, cross-work reads/writes, malicious Git configuration, output-based instruction injection, forged result files, expired/wrong-audience tokens, token passthrough, role escalation, network egress, writable shared caches, engine-socket access, retained credentials and oversized output. A real sandbox fixture must demonstrate filesystem, network and resource restrictions at capacity 1 and 8. Fakes cannot verify this Design's OS boundary. Revoke a queued integration grant and prove no push occurs. Verify that a legitimate source edit needs no per-task administrator intervention.

## Implementation consequences

Own the auth/policy module and sandbox adapter boundary. Reuse maintained cryptographic/OAuth and OCI primitives under an exact dependency lock; do not implement JWT cryptography or a container engine. The service account, authorized host and issuer are deployment prerequisites, not a reason to narrow the Directive. See D0006 for installation/activation and D0007 for the environment/evidence contract.
