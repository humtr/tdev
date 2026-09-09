# Design 0043 — Versioned Typed Development Operations and Release Bindings

- Status: `verified`
- Revision: 5
- Class: 2
- Decision date: 2026-09-09
- Acceptance base: `development@33400f2f7ab13015f7a5699068a128ae1081ee06`
- Predecessor revision: D0043@r4 accepted the trusted-local no-sandbox Codex/validation execution boundary and positive warden cleanup. Its acceptance evidence `docs/evidence/group-f-d0043-r4-warden-candidate-boundary-acceptance-2026-09-06.json` and all later Codex-backed physical evidence remain historical for that exact optional binding.
- Trigger: `DIRECTIVE.md@r1` and exact-source review falsified the maintained operation abstraction, not the Case/Agent execution backbone. Current source treats release profiles as semantic operations, hard-wires `model_repository` to Codex, takes caller-selected `validationProfile`, and makes the development recipe depend on a model Task. The first public v1 instead requires a generic server/Agent-owned semantic operation catalog, deterministic ChatGPT-authored ChangeSet composition, owner-required validation and no Codex dependency on the core path.
- Acceptance evidence: `docs/evidence/group-f-d0043-r5-generic-typed-operation-acceptance-2026-09-09.json`
- C0 source/package verification evidence: `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`
- Scope: versioned semantic development-operation contracts, release binding identity, capability admission, deterministic ChangeSet composition, candidate validation policy, optional delegated-intelligence bindings and common local execution/cleanup boundaries.
- Affected owners: `src/development-operation-profile.mjs` or its successor catalog module, `src/development-unit.mjs`, `src/development-runtime.mjs`, operation/binding config, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, installable-Agent package manifests and focused operation/runtime tests.
- Preserved owners: D0019 remains sole Case/Task/Attempt/result/Promotion authority; D0042 remains Case-to-Agent drive/re-drive; D0020/D0027 remain Agent delivery and local process/effect owners; D0013/D0014/D0047/D0048 remain repository-context identities/transports; D0025 remains Git publication authority.
- Explicit non-goals: no general shell; no caller-selected executable/argv/environment/cwd/network/credential/model-authentication mode; no second scheduler or result owner; no ordinary-operation canonical write; no direct MCP-to-Case ChangeSet acceptance; no multi-tenant/hostile-local-code isolation claim; no requirement to delete the already working Codex adapter.

## 1. One-line definition

A development Task selects one immutable semantic operation contract; the installed Agent release selects an admitted concrete binding for that contract, executes it through the existing Attempt/delivery boundary, and returns one existing typed Case result. Core development uses a deterministic non-model ChangeSet operation and must work when Codex is completely unavailable.

## 2. Revision-5 correction

Revision 5 separates three concepts that Revision 4 combined:

1. **semantic operation** — what the Task means, its strict input/result/effect contract and version;
2. **release binding** — how an installed Agent realizes that operation, including executable or built-in implementation, argv, environment, filesystem/network/credential boundary and cleanup;
3. **owner policy** — which internal supporting operation/binding is required for a repository/release, including mandatory validation.

The Directive-triggered mismatch reopened only the affected Revision-4 operation-abstraction meaning during this acceptance review. Revision-4 Codex process fencing, result-only ChangeSet handling, disposable exact-base/candidate workspaces and positive warden cleanup remain valid requirements for that process-backed binding and are reused rather than discarded.

## 3. Semantic operation catalog

The Agent/server owns one versioned semantic catalog equivalent to:

```text
tdev.development-operation-catalog.v1
```

The public MCP does not own or mutate the catalog. Each semantic descriptor contains at least:

```text
id
version
contractDigest
title
description
inputSchema
inputSchemaDigest
resultKind
effectClass
effects
requiredCapabilities
cancellable
selectionScope
callerSelectable
```

Runtime `availability` and bounded `reason` may be projected beside the descriptor, but they are not part of semantic authority and do not grant execution permission.

`contractDigest` is computed from the immutable semantic contract fields, including the strict input schema and result/effect meaning, and excludes concrete binding path/version, machine availability and mutable observations. A Case/Plan binds the semantic `id`, integer `version`, `contractDigest` and normalized input. The same ID/version may never silently acquire different input/result/effect meaning; a semantic change requires a new operation version.

## 4. Binding identity

A concrete implementation uses a distinct release-owned identity such as:

```text
tdev.binding.builtin.changeset-compose.v1
tdev.binding.repository-context.git-scoped-lazy.v1
tdev.binding.npm.repository-check.v1
tdev.binding.codex.repository-change.v1
```

The installed Agent release binds semantic operation contract -> concrete binding and records the binding identity/digest plus package/release identity in Attempt/runtime evidence. An implementation may change under the same semantic operation version only when the semantic input/result/effect contract remains equivalent; the binding/release identity must still change so evidence can distinguish executions.

A binding manifest owns executable/built-in identity, literal argv, fixed environment, filesystem root/mode, network mode, resource limits, credential mode, disclosure policy and warden/cleanup behavior. Caller input cannot select or widen any of those properties.

Capability admission remains Case grant ∩ Workspace policy ∩ current Agent capabilities. A discoverable operation or binding name alone grants nothing.

## 5. Initial semantic operations

### 5.1 `tdev.operation.repository.context.bind.v1`

Purpose: bind one exact repository commit/full-base identity and admitted scope to an immutable context reference used by the Plan.

This is normally a supporting/internal operation. Full, lazy, packed and cached representation are binding/transport choices, not different public semantic meanings. Existing D0013/D0014/D0047/D0048 identities and bounds remain authoritative.

Result kind: `observation`, effect class `result-only`.

### 5.2 `tdev.operation.repository.changeset.compose.v1`

Purpose: deterministically validate and normalize a ChatGPT-authored bounded ChangeSet against the exact Case/Plan base and owner-issued write scope. This is the primary first-release core development operation and contains **no model intelligence**.

The operation input reuses the existing D0019 ChangeSet algebra rather than introducing a parallel edit language:

```text
baseDigest
writes: [
  { path, content }
]
```

`content` is complete UTF-8 replacement text or `null` for deletion, exactly matching the existing `normalizeChangeSet()` result shape. The operation verifies at minimum:

- input `baseDigest` equals the immutable Plan/context base;
- each path is safe, relative, normalized and inside any owner-issued write scope;
- duplicate writes are rejected;
- string/null content and per-file/total byte/write-count bounds are enforced;
- unknown fields and malformed canonical input fail before any result is returned.

The deterministic built-in binding is equivalent to `tdev.binding.builtin.changeset-compose.v1`. It does not invoke a model or require network/authentication. It returns the existing result-only:

```text
{ kind: "changeset", baseDigest, writes, evidence }
```

through the normal Agent delivery/Case result boundary. It never calls Case result acceptance directly and never writes the Case canonical tree.

### 5.3 `tdev.operation.repository.candidate.validate.v1`

Purpose: execute the repository/release **owner-required** validation contract against the disposable candidate and return a bounded existing `validation` result with `requirePassed:true` before Promotion.

The caller does not select `validationProfile`. The repository/release policy owns the required validation operation/binding. For the current tdev repository that policy may bind to `tdev.binding.npm.repository-check.v1`, whose current concrete command is `npm run check`; this command is binding detail, not the semantic operation name or caller input.

A policy identity equivalent to `tdev.policy.repository.validation.required.v1` binds the required validation contract for the admitted repository/release. Missing, unknown or incompatible required validation fails closed rather than falling back to a weaker profile.

### 5.4 `tdev.operation.repository.change.generate.v1`

Purpose: optional delegated intelligence that reads the admitted context and returns a result-only ChangeSet under the same D0019 result algebra.

This operation is caller-selectable only when its descriptor reports available and the Case/Workspace/Agent capability intersection admits it. A Codex implementation may bind here as `tdev.binding.codex.repository-change.v1`, reusing the proven Revision-4 no-sandbox/disposable-clone/structured-result/warden boundary.

Codex executable, saved authentication, model configuration or output schema is never required to construct the core runtime, enumerate the catalog, run `changeset.compose`, validate its candidate or promote it. If the Codex binding is absent or its auth is unavailable, only this optional operation is unavailable; the core path remains fully usable.

## 6. Case/Task binding and execution path

A new Revision-5 development Plan contains ordinary Tasks whose execution contract binds semantic operation identity rather than implementation profile identity:

```text
operationId
operationVersion
operationContractDigest
resultKind
effectClass
retry
```

The Task input contains only normalized semantic input and owner-issued identities. Dispatch reaches the existing authenticated Agent through D0042/D0020. At Attempt admission the Agent resolves exactly one compatible release binding, records that binding/release identity as evidence, and executes it. The result returns through D0020/D0027 and D0019 acceptance under the existing Attempt/fencing/claim identity.

No operation may bypass `runDurableCase`, fabricate a Case receipt, accept its own result, or invoke Promotion as a hidden side effect. Promotion remains a separate D0019 internal Task and the only canonical-tree writer.

## 7. Development recipe

The primary no-Codex recipe is:

```text
owner-issued context identity
  -> tdev.operation.repository.changeset.compose.v1
  -> materialize disposable exact-base candidate
  -> tdev.operation.repository.candidate.validate.v1 (owner-required)
  -> D0019 Promotion
```

`development_start` may select another caller-selectable semantic operation, such as optional `repository.change.generate.v1`, but that operation occupies the same ordinary-Task slot and returns the same typed result kind. Case/Drive/Agent/result/validation/Promotion semantics do not depend on which binding generated the ChangeSet.

Context binding and validation are supporting operations selected by owner policy/Plan construction, not arbitrary caller-selected executors.

## 8. Local runtime and cleanup

Built-in deterministic operations use no model process. Process-backed bindings continue to register each process/workspace with the existing warden under the stable Case/Task/Attempt operation identity and require positive cleanup before result/reuse.

Candidate materialization remains disposable and exact-base. A candidate digest binds the accepted ChangeSet plus exact repository/base/context identity. Validation runs only against that candidate. Candidate/process/workspace cleanup uncertainty remains explicit and blocks reuse; missing responses never become positive cleanup evidence.

No operation or binding trusts inherited shell, cwd, `PATH`, `GIT_*`, ambient credential or arbitrary network data from the Task. Release-owned concrete bindings may construct a minimal explicit environment required by their trusted-local runtime.

## 9. Failure, cancellation and reconciliation

- unknown semantic ID/version/contract digest: reject before Attempt execution;
- unavailable optional binding: bounded unavailable/admission result, no hidden fallback to another executor;
- malformed/stale/out-of-scope `changeset.compose` input: fail closed with zero accepted result and no Promotion;
- missing/incompatible required validation: fail closed; caller cannot substitute a profile;
- validation `passed:false`: required validation blocks Promotion under existing result semantics;
- process timeout/cancel/response loss: preserve D0027 cleanup/effect uncertainty and never blind-replay a process;
- Agent reconnect/Drive replay: reread/reconcile the same Case/Attempt/delivery identity;
- stale delivery/result/fence: rejected by existing D0019/D0020 rules;
- candidate residue: positive cleanup required before workspace/capacity reuse.

## 10. Compatibility, migration and rollback

Revision 5 does not reinterpret existing immutable Cases/Plans whose Tasks name Revision-4 profile IDs such as `tdev.model.repository.execute.v1` or `tdev.repository.validate.v1`. Those Plans remain historical/executable only under a release that explicitly supports their original contract.

New Cases after the Revision-5 cutover bind semantic operation ID/version/contract digest. Before removing a legacy handler, deployment must prove either:

- no old-generation nonterminal/ambiguous Case requires it; or
- the activated Agent release deliberately carries the exact legacy handler until those Cases quiesce.

There is no automatic profile-name alias from a Revision-4 Task to a Revision-5 semantic operation. Rollback to a release that cannot understand a live Plan/binding is blocked. Historical Codex successes remain valid evidence for the optional binding but never satisfy the no-Codex core proof.

## 11. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| catalog | exact semantic ID/version/schema/contract digest; unknown or mismatched contracts fail closed |
| separation | semantic descriptor excludes concrete binding/runtime availability from contract meaning |
| binding | Attempt evidence records exact binding/release identity; caller cannot choose executable/argv/env/network/credential |
| compose | existing `writes[{path,content}]` algebra, `null` deletion, exact base/scope/path/size/duplicate validation, deterministic result-only ChangeSet |
| no-Codex | core runtime/catalog/compose/candidate validation/Promotion path works with Codex executable/auth/config absent and spawns no model process |
| validation | repository/release owner selects required validation; caller has no weakening `validationProfile` control |
| optional model | Codex is only an optional binding of `repository.change.generate.v1`; unavailable Codex cannot make core unavailable |
| delivery | every selected operation remains a normal Case Task -> Drive -> AgentDelivery -> Agent -> typed result flow |
| cleanup | process-backed bindings and disposable candidates retain positive warden cleanup or explicit uncertainty |
| compatibility | old immutable profile-bound Plans are preserved and never silently aliased/reinterpreted |
| promotion | only D0019 Promotion writes the Case canonical tree |

Cheapest decisive falsifiers are: runtime construction failing because Codex is absent; a model process on the core compose path; caller executable/argv/env/network/credential or validation selection reaching execution; same semantic ID/version producing a changed schema/effect contract without version change; `changeset.compose` accepting stale/out-of-scope/malformed writes; an operation directly accepting its result or writing canonical state; or an old Plan silently mapped to new semantics.

## 12. Rejected alternatives

### Keep `tdev.model.repository.execute.v1` as the mandatory product operation

Rejected. It confuses one executor implementation with the product architecture and violates the ChatGPT-only core requirement.

### Add a direct MCP ChangeSet submission path

Rejected. The author of the bytes does not change control authority. ChatGPT-authored changes still execute as a normal Case/Attempt through Drive and AgentDelivery.

### Expose arbitrary shell/process fields as a generic operation

Rejected. Server-side extensibility comes from registered semantic operations and release-owned bindings, not caller-defined executables.

### Let the caller choose validation

Rejected. The work being validated cannot choose a weaker validator. Repository/release policy owns mandatory validation.

### Delete Codex support entirely

Rejected as unnecessary. The existing adapter is useful optional interoperability as long as it cannot become a hidden core dependency.

## 13. Follow-on gate

Revision 5 is verified at the C0 source/package layer by `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`: the semantic catalog/binding split, deterministic ChangeSet compose operation, owner-required validation policy, generic development recipe, Codex optionalization, fail-closed falsifiers and complete registered source gate are realized and published. This verification does not promote live Agent activation, provider deployment, current-client behavior or optional Codex interoperability; those remain separately observed layers under D0046 and the optional follow-on.
