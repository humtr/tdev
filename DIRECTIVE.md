# tdev owner directive

- Status: `active`
- Revision: 1
- Issued: 2026-09-09
- Scope: current forward development through the first public tdev release
- Supersession: only a later explicit owner directive may revise or supersede this objective

## 1. Authority

This file is the single owner of the **current top-level objective, priority, and non-substitutable completion criteria** for tdev development.

It is not a Design, implementation plan, router, scheduler, runtime owner, or safety bypass. `RULE.md` still owns stable engineering invariants, `SDD.md` still owns change classification and Design lifecycle, technical Designs still own their bounded contracts, and `WORKBOARD.md` still owns executable routing. Those subordinate owners must, however, remain consistent with this Directive. A conflicting Design, route, plan, handoff, qualification campaign, or historical success may not silently replace or narrow this objective; correct the conflict before dependent mutation.

## 2. Priority objective — first public v1

The first public release is **v1**. The public MCP release identity remains `tdev.mcp.surface.v1`. Pre-release corrections to tool names, schemas, executor bindings, or implementation do not create a v2 product surface.

Before unrelated product expansion or more recovery/qualification machinery is selected as the main path, converge the current system on all of the following:

1. **ChatGPT-only core intelligence.** The normal tdev development path must be fully usable with ChatGPT as the only required intelligence. No Codex executable, Codex authentication, second LLM, or model subprocess may be required for core development.
2. **Codex is optional.** Codex may remain only as an explicitly optional delegated typed-operation executor/binding and may be qualified separately. Codex success can never substitute for the ChatGPT-only core proof.
3. **Preserve the existing authority backbone.** Core development remains `ChatGPT -> MCP -> D0019 Case -> D0042 Drive -> D0020/D0027 AgentDelivery/local Agent -> typed Result -> required validation -> D0019 Promotion -> terminal readback`. Promotion remains the only canonical-tree writer.
4. **Stable public MCP v1 surface.** Converge on the sixteen tools in Section 3. Do not grow the public surface by adding one MCP tool per local capability.
5. **Approval-popup correction.** Every public tdev MCP tool advertises `openWorldHint: false`. This is client UX metadata only; it does not weaken authorization, effect classification, Case grants, Workspace policy, Agent capability checks, Attempt fencing, reconciliation, or Promotion authority.
6. **Generic versioned typed operations.** Extensible local development capability lives in a server/Agent-owned typed-operation catalog with semantic operation identity separated from concrete executor/binding identity.
7. **Owner-required validation.** Normal development cannot weaken mandatory validation by caller-selected profile. Repository/release policy selects required validation; executor details such as `npm run check` remain binding/runtime details.
8. **No authority bypass.** Do not introduce a generic shell, direct canonical write, second result owner, parallel scheduler, or out-of-band ChangeSet acceptance path merely to remove Codex.
9. **No qualification drift.** Recovery, probe, diagnostic, deployment-preservation, and qualification mechanisms remain subordinate evidence and may not become the product objective.
10. **Preserve durable history.** Existing Cases/Plans and prior Codex-backed successes remain valid historical evidence under their original immutable semantics; they are not reinterpreted to satisfy the corrected core objective.

## 3. Public MCP v1 tool target — sixteen tools

The first-release target is exactly these sixteen public tools unless this Directive is explicitly revised:

1. `case_create`
2. `case_get`
3. `case_events_get`
4. `case_drive` — final pre-release name for the D0042 level-triggered drive/re-drive command previously exposed as `case_run_or_resume`
5. `task_cancel`
6. `attempt_reconcile`
7. `claim_conflicts_get`
8. `case_promotion_get` — final pre-release owner-oriented name for `promotion_get`
9. `development_context_get`
10. `development_context_list`
11. `development_context_search`
12. `development_context_read`
13. `operation_list` — bounded catalog discovery/list summaries
14. `operation_get` — exact operation ID/version descriptor and schema read
15. `development_start` — final pre-release name for `development_unit_start`
16. `development_get` — final pre-release name for `development_unit_get`

`operation_list` and `operation_get` are deliberately separate: list/discovery and exact descriptor/schema retrieval have distinct responsibilities. Do not replace them with per-operation MCP tools such as `git_push`, `validation_run`, or `codex_run`, and do not expose a generic caller-defined `operation_execute` shell.

All sixteen public tools must advertise `openWorldHint: false`. Read-only, destructive, and idempotence annotations remain truthful to each tool's actual semantics.

## 4. Typed-operation target

Semantic operation identity and concrete executor identity are separate durable concepts. Semantic IDs use a namespace equivalent to:

`tdev.operation.<domain>.<object-or-action>.vN`

The initial core catalog must cover meanings equivalent to:

- `tdev.operation.repository.context.bind.v1` — bind exact repository/base/scope identity to an immutable context reference;
- `tdev.operation.repository.changeset.compose.v1` — deterministically validate and normalize ChatGPT-authored bounded writes/deletes against exact base/scope/path/size policy and return a result-only ChangeSet; this is the core development operation and contains no model intelligence;
- `tdev.operation.repository.candidate.validate.v1` — run owner-required candidate validation;
- `tdev.operation.repository.change.generate.v1` — optional delegated-intelligence generation; a Codex executor may bind here, but this operation is not required for core development.

Concrete binding identities use a separate namespace equivalent to:

- `tdev.binding.builtin.changeset-compose.v1`
- `tdev.binding.repository-context.git-scoped-lazy.v1`
- `tdev.binding.npm.repository-check.v1`
- `tdev.binding.codex.repository-change.v1`

A Case/Plan binds semantic operation ID/version/contract identity. Attempt/runtime evidence binds the actual executor/binding/release identity. The same semantic ID/version may not silently change meaning when its implementation changes.

## 5. Required proof before this Directive is complete

The priority objective is complete only after a real current-client run proves, with Codex disabled or unavailable:

`ChatGPT context read -> operation discovery -> ChatGPT-authored ChangeSet input -> Case -> Drive -> AgentDelivery/local Agent -> candidate -> mandatory validation -> Promotion -> terminal readback`

The proof must establish that:

- tdev core runtime starts and operates without Codex executable/auth/config;
- ChatGPT itself performs the source-change reasoning;
- no model subprocess is required or spawned on the core path;
- the ChangeSet remains Case/Attempt/fence/base/scope bound and fails closed when malformed, stale, or out of scope;
- mandatory validation passes on the disposable candidate;
- Case-native Promotion succeeds and remains the only canonical writer;
- the public surface is the intended sixteen-tool v1 contract and every tool reports `openWorldHint: false`;
- repeated approval prompts attributable to tdev's previous open-world annotation are absent; any remaining platform confirmation is classified separately instead of weakening the server safety model.

Only after this no-Codex proof is green may optional Codex interoperability be treated as a secondary completion item.

## 6. Immediate subordinate work

The first subordinate task is to make this Directive impossible for a fresh development session to miss: update the self-development authority/bootstrap under D0031 so `DIRECTIVE.md` is rebound from the exact published repository snapshot before routing or dependent implementation. Then revise only the technical Designs actually reached by this Directive (expected D0023, D0043, and D0046) and execute the smallest implementation that satisfies them.

Do not turn the Directive itself into a Design, and do not use Design status as a substitute for owner priority.
