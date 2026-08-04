# tdev Engineering Rules

> Authority: this document owns cross-cutting implementation and evidence guardrails that prevent recurring contract drift. Product and subsystem facts remain owned by the normative documents listed in `AGENTS.md`.

## Rule 1 — Do not guess repository or runtime facts

Read the applicable owner, source, schema, Git state, validation profile, and runtime observation. Missing, unreadable, ambiguous, conflicting, stale, or contaminated evidence remains explicit. Do not convert it to an assumed default.

## Rule 2 — One fact, one canonical owner

Before introducing a table, object, cache, descriptor, journal, event, projection, registry, or background worker, identify the exact fact it owns and the previous owner it replaces. A cache or projection cannot authorize an effect or become an independent lifecycle writer.

For tdev specifically:

- Case lifecycle truth belongs to `CaseDO`;
- Agent connection and delivery truth belongs to `AgentDO`;
- local filesystem, Git, process, and host observations belong to the Agent and their external authorities;
- D1 locators and R2 bytes are not lifecycle owners.

## Rule 3 — State meaning must be closed and explicit

Use discriminated states and validated transitions, not combinations of booleans, nullable fields, timers, cache presence, or map membership. Terminal Case, Task, and Attempt records never transition. A Task has at most one nonterminal Attempt and one terminal semantic result.

## Rule 4 — No hidden workaround, compatibility fallback, or generic escape hatch

Do not silently substitute:

- an arbitrary shell command for a typed Operation;
- a local scheduler for CaseDO or AgentDO;
- a name prefix for exact deployment identity;
- a retry for reconciliation;
- a cache for an authoritative read;
- permissive parsing for an unsupported schema feature.

A compatibility bridge requires an owner, bounded scope, explicit observation, removal gate, and no new permanent dependency.

## Rule 5 — Failure and uncertainty are not success

False preconditions, lost responses, partial effects, stale epochs, truncated output, skipped checks, unsupported cases, cancellation races, and missing evidence keep their own typed meaning. Unknown external effects become reconciliation or `unverified`; they are never guessed failed, cancelled, or succeeded.

## Rule 6 — Exact authority is an intersection

An effect is allowed only by the intersection of current Agent capability, current Workspace policy, immutable Case target grant, Operation required effects, exact Task preconditions, and any required approval. Missing or stale authority denies execution. Policy expansion never expands an existing Case grant.

## Rule 7 — Inputs and outputs are bounded and schema-owned

External records are validated against a versioned canonical schema before domain use. Unknown fields and unsupported schema keywords are rejected. Digests use the declared canonical domain and exclude only fields explicitly owned by the digest rule. Generated code is derivative and cannot redefine the schema.

## Rule 8 — Cross-language behavior must be equal

Any protocol behavior implemented in TypeScript and Go needs equivalent accept/reject, canonical bytes, digest, Unicode, bound, and error semantics. A green test in one language does not compensate for a mismatch in the other. Future keyword or numeric support is admitted only with vectors proving parity.

## Rule 9 — Paths are capabilities, not strings

Path-bearing Operations validate syntax, normalization, target binding, root identity, containment, sensitive paths, object kind, symlink policy, mount policy, and mutation-time re-observation at the layer that owns each fact. Empty path, absolute path, alternate separator, NUL, empty segment, `.`, `..`, and escape are never interpreted permissively.

M0 schema validation proves only the checks implemented by the canonical schema/runtime subset. NFC and live filesystem containment remain hard gates for the Agent path slice; they must not be claimed from regex validation alone.

## Rule 10 — Lifetimes and cancellation must be owned

Every Case, Task, Attempt, connection, queue entry, process, temporary file, setup journal, upload, and migration has an owner, start condition, terminal condition, cancellation behavior, and recovery path. Cancellation request, process termination, external-effect observation, and canonical terminal commit are separate facts.

## Rule 11 — Concurrency semantics are designed, not incidental

Define the serialization owner, identity key, ordering, idempotency key, fencing, stale-writer behavior, and retry class before concurrent execution. The MVP device execution limit is one high-cost slot. Do not add WorkspaceDO, ProjectDO, parallel dispatch, or background replay without an observed invariant and owner revision.

## Rule 12 — Secrets are excluded before persistence

Cloudflare tokens, MCP tokens, private keys, enrollment grants, provider credentials, authorization headers, secret environment values, and credential-bearing URLs do not enter Task input, argv, logs, Events, checkpoints, Artifacts, reports, fixtures, or Git history. Redaction happens before durable storage. Possible secret persistence is a security incident and blocks ordinary completion.

## Rule 13 — Tests prove contracts, not timing luck

Use table-driven matrices, fake clocks, controlled queues, barriers, isolated stores, real temporary files, and local Git remotes where appropriate. Sleep, process liveness alone, internal field peeking alone, or snapshot overwrite is not a success condition. Never delete, skip, weaken, or narrow a test merely to obtain green output.

## Rule 14 — Evidence cannot be broadened

Record source revision, profile revision, inputs, environment, bounds, and authoritative reader. Reuse evidence only when those facts remain valid and the owner permits reuse. A unit test does not prove a package, an installed binary, an active release, a public endpoint, a client-visible schema, or rollback.

## Rule 15 — Reference-host and release claims require live evidence

Generic Linux, emulation, a local TypeScript runtime, or Cloudflare mocks are supplementary. Termux-on-Android-ARM64 support, installer behavior, background reliability, public MCP, upgrade, and rollback are claimed only after the reference-host and live gates in `docs/MVP.md` and `docs/DEPLOYMENT.md` pass.

## Rule 16 — Preserve unrelated state

A bounded change must leave unrelated files, index entries, refs, worktrees, processes, services, credentials, deployments, routes, and cloud resources unchanged. Mutation scope is explicit and post-state is observed.

## Rule 17 — Review every complete diff and mechanize repeated violations

Review owner impact, contract changes, failure paths, security, generated drift, tests, and unrelated preservation. When the same violation can recur, add the narrowest deterministic schema check, generator check, lint, fixture, or validation gate. Do not rely on prose alone when a safe mechanical check is available.

## Rule 18 — Reopen the design when evidence invalidates it

Implementation friction is not permission to change architecture. When measured behavior contradicts an accepted design, stop the dependent slice, record the evidence, update the active design and correct owner, re-evaluate migration and rollback, then resume from the new accepted contract.
