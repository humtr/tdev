# Design 0043 — Bounded Typed Development Operation Profiles

- Status: `accepted`
- Revision: 2
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@069be884f0cb160ee8584c7b79ab333d232a1c2f`
- Predecessor revision: D0043@r1 accepted at `development@62a37cca3ade0007c204de10c8bdc6b26b0ddca4`; its acceptance evidence is `docs/evidence/group-f-d0043-r1-bounded-operation-profiles-acceptance-2026-09-03.json`
- Trigger: the minimum-path failure analysis proved that Revision 1's source/package profiles stop at unbound `configured_runtime` names, `network:none`, and no physical Termux execution, so they cannot produce a real development result even after the MCP/provider owners are composed
- Acceptance evidence: `docs/evidence/group-f-d0043-r2-real-termux-codex-operation-binding-acceptance-2026-09-03.json`
- Scope: a versioned, release-bound typed operation catalog plus the first single-user trusted-local Termux Codex/validation runtime binding for one isolated tdev development unit
- Affected owners: `src/`, `config/`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, focused operation-profile tests
- Preserved owners: D0019 remains Case/Task/Attempt/result/Promotion authority; D0020/D0027 remain Agent delivery and local-process owners; D0013/D0014 remain repository context/model transport owners; D0025 remains Git publication authority; D0042 owns Case-to-Agent re-drive
- Explicit non-goals: no general shell; no caller-selected executable/argv/environment/path/model/authentication mode; no reusable network credential broker; no multi-tenant or hostile-local-code isolation claim; no canonical-tree mutation from an ordinary operation; no Git publication; no semantic scheduler or MCP auth

## 1. One-line definition

Expose only release-bound typed operations—immutable repository context preparation, repository-model execution and bounded validation—whose executable, arguments, environment, filesystem root, network policy, resource limits, fencing and cancellation are selected by the installed Agent release rather than by MCP/Task input.

## 2. Why this is Class 2

Choosing which local commands may run and how a caller reaches a repository or model subprocess changes the Agent capability, filesystem/network/credential boundary, release compatibility and P1 acceptance method. It cannot be implemented as an incidental profile edit under `SDD.md`; this Design fixes the authority and security boundary first.

## 3. Repository facts and unknowns

At Revision-2 acceptance:

- `src/repository-model-transport.mjs` reads one exact immutable Git commit, validates the semantic base digest and invokes a configured model subprocess with bounded output/timeout;
- `src/local-agent-runtime.mjs` and the supervisor own process handles, cancellation and positive cleanup evidence;
- Revision 1 is source/package-qualified, but `docs/evidence/group-f-d0043-r1-release-bound-development-operation-profiles-source-package-2026-09-03.json` explicitly leaves physical Termux execution unclaimed and records that the model and validation executables are not mapped;
- `config/development-operation-profiles.json` names only `release-bound-model-runtime` and `release-bound-validation-runtime`; its model profile is `network:none`, so it cannot invoke the authenticated remote model used by the installed Codex client;
- Case result normalization already accepts `changeset` and `validation` results, while only Promotion may write `canonical:tree`;
- the current supported-Termux observation finds `codex-cli 0.150.1`, Node, Git and npm installed, and `codex login status` reports an existing ChatGPT login without exposing credential bytes;
- current official OpenAI documentation defines `codex exec` as the non-interactive automation entrypoint, supports ephemeral execution, explicit sandbox selection, JSONL events and a JSON output schema, and states that saved CLI authentication is reused by default;
- no current adapter converts that bounded Codex output into the existing result-only ChangeSet contract, and no installed Agent release executes the real repository validation profile.

Unknowns remain the exact model/reasoning identifier available to the authenticated account at a future run, provider latency/rate limits, and whether the Termux/Android environment can positively enforce an endpoint-level egress allowlist. Those identities and limits are deployment evidence. Revision 2 deliberately supports only the user's trusted-local single-tenant trial until stronger isolation is separately accepted and proved.

## 4. Decision and operation catalog

The package-owned manifest remains the authority for executable identity. Revision 2 advances the typed operation manifest to:

```text
tdev.development-operation-profiles.v2
```

Revision 1 remains historical and is never reinterpreted as the network-capable runtime. Each Revision-2 profile has a fixed operation kind, release/deployment-bound executable identity, literal argument template, explicit environment and credential visibility, fixed filesystem/network mode and bounded limits. The caller selects only a profile identifier plus typed data admitted by that profile.

### 4.1 `tdev.repository.context.prepare.v1`

Purpose: read and validate the exact immutable base commit used by the Case Plan.

Required input:

```text
repositoryCommitOid
baseDigest
objectFormat
```

The operation delegates to the existing D0013 context preparation contract. It may read only the configured repository through hardened Git plumbing, never the mutable worktree/index, and returns a bounded context descriptor/reference. It has no write claim, no process creation and no network.

### 4.2 `tdev.model.repository.execute.v1`

Purpose: execute the selected model against the exact prepared context and return a result-only `changeset`.

Required input:

```text
repositoryCommitOid
baseDigest
instruction
contextReferenceId       // only when supplied by the owner-owned preparation step
```

The first real runtime profile is:

```text
tdev.model.codex-exec.v1
```

The release/deployment manifest binds the absolute Codex executable, executable digest/version, exact model and reasoning configuration when selectable, output schema digest, fixed arguments, isolated exact-base repository root, timeout, stdout/stderr limits and process-group cleanup. Its semantic argument template is equivalent to `codex exec --ephemeral --json --sandbox read-only --ignore-user-config --output-schema <release-owned-schema> --model <deployment-bound-model>`; no argument or path comes from Task/MCP input.

The adapter supplies the bounded instruction and exact prepared context, accepts only one terminal schema-valid result from the bounded JSONL stream, records directly reported usage separately from semantic output, and rejects missing/duplicate terminal output, tool-side mutation, malformed events, output overflow or identity mismatch. Codex runs read-only and ephemeral: it may inspect the immutable staged repository but cannot write the candidate or canonical checkout. tdev validates the returned relative-path ChangeSet and materializes it only in the disposable candidate workspace.

The Codex process may reuse the user's already-established saved CLI authentication. tdev never reads, copies, serializes, logs or forwards the cached credential, Access token or Agent credential. Authentication absence/expiry is a pre-launch or provider failure, not permission to request a secret through MCP. This is a trusted-local single-user credential boundary; it is not a general credential service.

The first external-model disclosure profile is `tdev.openai-codex-full-context.trusted-local.v1`. It explicitly permits the complete bounded regular UTF-8 tracked content of one exact published tdev commit, plus the admitted Task instruction, to be made available to the Codex service under the user's existing account. It excludes mutable worktree/index state, untracked files, repository-external paths, inherited environment, Git/provider/Agent/MCP credentials and any secret value. The deployment admits only the named repository/account/profile, records the exact commit and bounded context digest, and fails closed when the repository is not explicitly eligible for this profile. Provider retention, training, privacy, residency, billing and hostile-provider authenticity remain governed by the user's provider account/terms and are not tdev claims.

One Attempt authorizes at most one outer Codex process launch under its stable identity. The adapter does not blindly repeat a launch after timeout, disconnect, response loss or unknown provider billing/effect. Any Codex-internal provider calls/retries and directly reported usage are bounded/observed where the selected CLI exposes them and otherwise remain explicit unknowns; they never create semantic success or a second Attempt.

The returned `changeset` is accepted by D0019 as an isolated result. Promotion remains a separate internal Case Task; an operation cannot write the canonical tree directly.

### 4.3 `tdev.repository.validate.v1`

Purpose: run the required validation suite against an isolated candidate tree and return a bounded `validation` result.

Required input:

```text
candidateTreeDigest
validationProfile
```

`validationProfile` is an installed manifest identifier, not a command string. The release manifest maps it to package-owned executable/argv, an isolated candidate root, fixed environment, network mode (default `none`), timeout, output bound, process-group cleanup and cancellation policy. The profile may read/write only the disposable candidate workspace; it cannot address the canonical repository ref or Agent state.

Revision 2 fixes the first validation profile as `tdev.validation.npm-check.v1`, binding the installed npm executable and literal `run check` arguments with a finite deployment-recorded timeout large enough to run the current baseline. It runs in the disposable candidate workspace with a secret-free explicit environment and no admitted network need. If the exact base changes package scripts, lifecycle hooks or validation configuration relative to the admitted manifest, the profile is rebound before execution; model output cannot silently replace the validator it must pass. If the host lacks the declared executable or cannot prove root/cleanup bounds, the operation fails closed and the physical gate remains unqualified.

## 5. Typed boundary and capability admission

The operation request is strict canonical JSON with exact profile-specific fields and bounded bytes. Unknown fields, duplicate members, unsafe numbers, path traversal, absolute paths, NULs, caller argv/env/cwd/model, network `allow`, credential references and shell metacharacter-bearing command text are denied before process creation. Only the release-bound Codex profile can select the named model-network mode; caller input cannot upgrade another profile into it.

The Agent advertises capability identifiers derived from the installed release/profile digest. D0020 delivery admission and D0027 local execution then require the exact capability in the Case grant, Workspace policy and executor capability intersection. A profile name alone does not grant authority.

The operation profile is not a new semantic owner: it returns an opaque result/evidence envelope to the authenticated Agent transport, which returns it through D0020 and the Case result boundary. No profile can call `applyCommand`, `Promotion`, `update-ref`, provider APIs or another profile as a hidden side effect.

## 6. Resource, filesystem and network limits

Every profile declares finite maxima for input, output, file count/bytes, process duration, descendants, retained temporary bytes and cancellation grace. Limits may be tightened by the Case contract but never widened by Task input.

The runtime opens a release-bound repository/candidate root with no-follow/safe-relative rules and uses a private temporary workspace. It does not trust inherited `PATH`, `GIT_*`, shell, current directory, ambient environment or provider configuration.

Context preparation and validation remain `network:none` and receive no model credential. Only `tdev.model.codex-exec.v1` has the named `openai-codex-trusted-local` network mode. That mode permits the release-bound Codex client to use its own saved authentication for its documented service interaction; it grants no arbitrary Task-selected URL, proxy, header or credential. Where Android cannot positively enforce endpoint-level egress isolation, evidence must say so and the profile remains single-user trusted-local rather than being promoted to hostile-code or multi-tenant support.

Unknown process completion after timeout, disconnect or response loss is reconciled through the existing local Agent evidence and Case/Attempt rules. The operation layer never guesses `not_applied` from a missing response and never starts a second process under a new identity.

## 7. Failure, cancellation, recovery and cleanup

- pre-launch profile, schema, capability or root validation failure: zero process starts and a bounded `not_applied` failure;
- spawn/handle ambiguity: preserve D0027 `post_create`/cleanup evidence; do not claim no-handle without positive proof;
- timeout/cancel: signal the owned process group, wait for positive disappearance, and retain `unknown` if cleanup cannot be proved;
- model parse/base mismatch/invalid change: terminal bounded Task failure with no Promotion;
- validation failure: a valid `validation` result with `passed: false`; required validation prevents Promotion but does not become a transport error;
- Agent reconnect or coordinator restart: D0020/D0042 reconcile the same delivery/Attempt identity; the profile does not replay a process;
- candidate workspace residue: cleanup is required before the claim/workspace is reusable; unresolved residue blocks reuse.

## 8. Compatibility, release and migration

The manifest is versioned and bound into the installable-Agent release digest. A release that does not contain a profile required by a Case fails capability admission before Attempt creation. Unknown future manifest versions and profile substitutions fail closed.

Revision 2 does not reinterpret the existing diagnostic or Revision-1 development profiles. Existing packages remain valid for their qualified scopes but cannot claim the physical Codex development path. The v2 manifest, Codex adapter, schema and validation binding change the package/release identity and require fresh source/package/Agent qualification plus a quiescent D0027 package update; they are not in-place capability aliases.

No Case snapshot migration is introduced. A Case stores the typed operation/profile identity as Task input under existing bounds; durable operation receipts remain D0020/D0027/Case-owned. Rollback to a release lacking a still-live profile is blocked until affected Cases quiesce or an explicit forward-compatible migration is accepted.

## 9. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| catalog | exact versioned profiles for context, model and validation; unknown profile denied |
| executable | package/release-bound executable and literal argv; no `PATH`/shell/caller substitution |
| input | profile-specific strict schema; no arbitrary argv/env/cwd/path/credential/network input |
| repository | exact immutable commit/base digest; no mutable worktree or canonical-ref write |
| model | result-only changeset, bounded process/output/cleanup, request/result identity binding |
| Codex runtime | exact CLI/version/model/config/schema binding; read-only ephemeral execution; one terminal structured result |
| model authentication | existing saved CLI auth is usable without secret bytes entering tdev input/state/logs; missing/expired auth fails closed |
| disclosure | explicit full-context trusted-local profile for one exact published tdev commit; mutable/untracked/external/credential inputs excluded |
| network separation | only the Codex model profile admits its named trusted-local provider mode; context and validation remain credential-free/network-none |
| provider ambiguity | one outer launch per Attempt; timeout/response loss never causes blind model replay or invented usage/effect truth |
| validation | named profile, isolated candidate root, bounded output/time/cleanup, false result preserved |
| capability | Case grant ∩ Workspace policy ∩ Agent capabilities required before Attempt |
| cancellation | process-group cancellation and positive cleanup or durable uncertainty |
| reconnect | stale delivery/result is fenced; no duplicate process/effect after response loss |
| release | profile digest participates in package/release identity and unknown versions fail closed |
| physical Termux | one real non-documentation ChangeSet is produced through Codex, validated with the fixed profile and returned without canonical/Git mutation |
| proof boundary | source/profile tests do not claim physical Termux/provider/client/deployed support; each layer is recorded separately |

Cheapest decisive falsifiers are a Task-controlled command/argv/env/model reaching `spawn`, a credential appearing in Case/MCP/result/log output, Codex or validation mutating the canonical checkout, a malformed/multiple JSONL terminal result being accepted, a validation failure omitted from Promotion, a duplicate process after response loss, or cleanup claimed without positive evidence.

## 10. Rejected alternatives

### Permit a general shell with a repository root argument

Rejected. It makes the Agent a command broker, defeats package-owned capability admission and cannot give MCP a bounded security contract.

### Reuse the diagnostic profile and pass the operation in stdin

Rejected. The diagnostic profile explicitly has no filesystem/stdin authority and cannot silently expand its meaning.

### Let the model subprocess edit the canonical checkout

Rejected. Ordinary work is result-only; Promotion is the only canonical-tree writer and D0025 owns publication.

### Let validation be an MCP-provided command string

Rejected. Validation semantics and cleanup would become client-controlled and unbounded. A named release profile is auditable and versioned.

### Treat a timeout as a failed/no-effect process

Rejected. Local process and external effect uncertainty must remain explicit until D0027/Case reconciliation proves cleanup/effect state.

### Keep `configured_runtime` as a deployment TODO

Rejected by the minimum-path falsifier. It permits source/package success while no real model or validator can execute and recreates the planning gap that stopped before user-visible value.

### Give Codex workspace-write authority for the first path

Rejected. The existing product contract requires result-only ordinary work. Codex emits a structured ChangeSet under a read-only sandbox; tdev alone materializes the disposable candidate and Promotion remains the only canonical writer.

## 11. Follow-on gates

This revision authorizes the v2 manifest, bounded Codex JSONL/schema adapter, fixed npm validation binding, installable-Agent release update and single-user trusted-local physical Termux qualification after explicit `WORKBOARD.md` routing. It does not authorize a reusable credential broker, unrestricted provider transport, Git publication, multi-tenant support, the public MCP provider composition or D0045 comparison. D0046 owns the first public owner composition and user-experienced path; D0023/D0024 expose these operations only through stateless authenticated commands.
