# Design 0043 — Bounded Typed Development Operation Profiles

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@62a37cca3ade0007c204de10c8bdc6b26b0ddca4`
- Trigger: P1 revalidation found that the installable Agent currently admits only a diagnostic `node --version` profile, while a real tdev development unit needs repository preparation, model execution and validation without unrestricted shell authority
- Acceptance evidence: `docs/evidence/group-f-d0043-r1-bounded-operation-profiles-acceptance-2026-09-03.json`
- Scope: a versioned, release-bound typed operation catalog for one isolated tdev development unit
- Affected owners: `src/`, `config/`, `docs/SECURITY.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, focused operation-profile tests
- Preserved owners: D0019 remains Case/Task/Attempt/result/Promotion authority; D0020/D0027 remain Agent delivery and local-process owners; D0013/D0014 remain repository context/model transport owners; D0025 remains Git publication authority; D0042 owns Case-to-Agent re-drive
- Explicit non-goals: no general shell; no caller-selected executable/argv/environment/path; no network credential broker; no canonical-tree mutation from an ordinary operation; no Git publication; no semantic scheduler or MCP auth

## 1. One-line definition

Expose only release-bound typed operations—immutable repository context preparation, repository-model execution and bounded validation—whose executable, arguments, environment, filesystem root, network policy, resource limits, fencing and cancellation are selected by the installed Agent release rather than by MCP/Task input.

## 2. Why this is Class 2

Choosing which local commands may run and how a caller reaches a repository or model subprocess changes the Agent capability, filesystem/network/credential boundary, release compatibility and P1 acceptance method. It cannot be implemented as an incidental profile edit under `SDD.md`; this Design fixes the authority and security boundary first.

## 3. Repository facts and unknowns

At acceptance:

- `src/repository-model-transport.mjs` reads one exact immutable Git commit, validates the semantic base digest and invokes a configured model subprocess with bounded output/timeout;
- `src/local-agent-runtime.mjs` and the supervisor own process handles, cancellation and positive cleanup evidence;
- `config/installable-agent-tool-profiles.json` currently permits only a package-fixed `diagnostic.node.version.v1` profile with no filesystem/network/stdin authority;
- Case result normalization already accepts `changeset` and `validation` results, while only Promotion may write `canonical:tree`;
- no profile binds a real development operation to a release-owned local repository root or a validation command.

Unknowns include the model executable and validation tool availability on the eventual Termux installation, and whether a provider deployment needs a separate operation Worker. These are deployment/client evidence, not permission to widen the source profile.

## 4. Decision and operation catalog

The package-owned manifest remains the authority for executable identity. Revision 1 adds a separate typed operation manifest/profile:

```text
tdev.development-operation-profiles.v1
```

Each profile has a fixed operation kind, release-bound executable identity, fixed literal argv, fixed environment allowlist, fixed filesystem/network mode and bounded limits. The caller selects only a profile identifier plus typed data admitted by that profile.

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

The release binds model executable, fixed arguments, empty or explicitly allowlisted environment, private-empty working directory, timeout, stdout/stderr limits and process-group cleanup. The model may propose only validated relative-path changes. It cannot receive an absolute repository path, Git credentials, MCP token, Agent credential, arbitrary command text or a `canonical:`/`remote:` claim.

The returned `changeset` is accepted by D0019 as an isolated result. Promotion remains a separate internal Case Task; an operation cannot write the canonical tree directly.

### 4.3 `tdev.repository.validate.v1`

Purpose: run the required validation suite against an isolated candidate tree and return a bounded `validation` result.

Required input:

```text
candidateTreeDigest
validationProfile
```

`validationProfile` is an installed manifest identifier, not a command string. The release manifest maps it to package-owned executable/argv, an isolated candidate root, fixed environment, network mode (default `none`), timeout, output bound, process-group cleanup and cancellation policy. The profile may read/write only the disposable candidate workspace; it cannot address the canonical repository ref or Agent state.

The first source profile is expected to include `tdev.validation.npm-check.v1` for the repository's declared check command. If the host lacks the declared executable or the profile cannot prove its root/cleanup bounds, the operation fails closed and the P1 gate remains unqualified.

## 5. Typed boundary and capability admission

The operation request is strict canonical JSON with exact profile-specific fields and bounded bytes. Unknown fields, duplicate members, unsafe numbers, path traversal, absolute paths, NULs, caller argv/env/cwd, network `allow`, credential references and shell metacharacter-bearing command text are denied before process creation.

The Agent advertises capability identifiers derived from the installed release/profile digest. D0020 delivery admission and D0027 local execution then require the exact capability in the Case grant, Workspace policy and executor capability intersection. A profile name alone does not grant authority.

The operation profile is not a new semantic owner: it returns an opaque result/evidence envelope to the authenticated Agent transport, which returns it through D0020 and the Case result boundary. No profile can call `applyCommand`, `Promotion`, `update-ref`, provider APIs or another profile as a hidden side effect.

## 6. Resource, filesystem and network limits

Every profile declares finite maxima for input, output, file count/bytes, process duration, descendants, retained temporary bytes and cancellation grace. Limits may be tightened by the Case contract but never widened by Task input.

The runtime opens a release-bound repository/candidate root with no-follow/safe-relative rules and uses a private temporary workspace. It does not trust inherited `PATH`, `GIT_*`, shell, current directory, ambient environment or provider configuration. Network is `none` unless a later Design explicitly accepts a named profile and credentials; Revision 1 has no such profile.

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

Revision 1 does not reinterpret the existing diagnostic profile. Existing packages remain valid for diagnostics but cannot claim P1 development support. Adding a profile changes the package/release identity and requires fresh source/package/Agent qualification; it is not an in-place capability alias.

No Case snapshot migration is introduced. A Case stores the typed operation/profile identity as Task input under existing bounds; durable operation receipts remain D0020/D0027/Case-owned. Rollback to a release lacking a still-live profile is blocked until affected Cases quiesce or an explicit forward-compatible migration is accepted.

## 9. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| catalog | exact versioned profiles for context, model and validation; unknown profile denied |
| executable | package/release-bound executable and literal argv; no `PATH`/shell/caller substitution |
| input | profile-specific strict schema; no arbitrary argv/env/cwd/path/credential/network input |
| repository | exact immutable commit/base digest; no mutable worktree or canonical-ref write |
| model | result-only changeset, bounded process/output/cleanup, request/result identity binding |
| validation | named profile, isolated candidate root, bounded output/time/cleanup, false result preserved |
| capability | Case grant ∩ Workspace policy ∩ Agent capabilities required before Attempt |
| cancellation | process-group cancellation and positive cleanup or durable uncertainty |
| reconnect | stale delivery/result is fenced; no duplicate process/effect after response loss |
| release | profile digest participates in package/release identity and unknown versions fail closed |
| proof boundary | source/profile tests do not claim Termux/provider/client/deployed support |

Cheapest decisive falsifiers are a Task-controlled command/argv/env reaching `spawn`, a profile that reads a mutable worktree or canonical ref, a validation failure omitted from Promotion, a duplicate process after response loss, or cleanup claimed without positive evidence.

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

## 11. Follow-on gates

This Design authorizes source implementation of the typed profile parser/manifest and the first isolated P1 operation composition after explicit `WORKBOARD.md` routing. It does not authorize adding network credentials, Git publication, a supported MCP endpoint/authentication, Cloudflare deployment, or D0045 comparison. D0023/D0024 must expose these operations only through stateless authenticated commands.
