# Pre-release v1 ChatGPT-native typed-operation correction plan — 2026-09-09

## 1. Purpose

This is a **subordinate execution plan** for `DIRECTIVE.md@r1`. It does not own the top-level objective and may not narrow, replace, or reinterpret the Directive. `SDD.md`, accepted technical Designs, and `WORKBOARD.md` continue to govern how the Directive is safely implemented and routed.

The Directive exists because the live trial proved a useful Case/Drive/Agent/Promotion loop, but the current development recipe accidentally elevated a Codex-backed model executor into a mandatory product path. The owner requirement is different: tdev's core development path must be fully usable with ChatGPT as the only intelligence. Codex may remain as an optional delegated executor and interoperability target, never as a core dependency.

## 2. Fixed product invariants

1. Public release identity remains `tdev.mcp.surface.v1`. The product has not shipped; pre-release name/schema corrections do not create a v2 release surface.
2. The core control/execution backbone remains `ChatGPT -> MCP -> D0019 Case -> D0042 Drive -> D0020/D0027 Agent delivery/local Agent -> typed Result -> Case acceptance -> required validation -> Promotion`.
3. ChatGPT is the only required intelligence on the core path. No Codex executable, Codex authentication, second LLM or model subprocess may be required to complete core development.
4. Codex may remain only as an optional server/Agent binding for an explicitly selected delegated-intelligence operation.
5. Promotion remains the only Case canonical-tree writer. MCP, Agent, typed operations and model adapters never directly write Case canonical authority.
6. Every public tdev MCP tool advertises `openWorldHint: false`. This annotation is a client UX hint, not an authorization source. Actual effect safety remains owned by typed-operation metadata, Case grants, Workspace policy, Agent capabilities, Attempt fencing and existing effect/reconciliation semantics.
7. The public MCP surface stays small and stable. New development capabilities should normally be added as versioned server/Agent typed operations, not as new MCP tools.
8. Operation semantic identity and executor implementation identity are separate. A Case binds an operation ID/version/contract digest; the exact executor/binding/release identity is Attempt/runtime evidence. Contract meaning never changes in place under the same operation ID/version/digest.
9. Existing durable Cases are never reinterpreted. Historical Codex-backed Cases remain historical evidence and use their original immutable Plan semantics.
10. Recovery/qualification machinery remains subordinate. Do not add a new scheduler, durable owner, generic shell surface, direct ChangeSet ingress, or second result-acceptance path to implement this correction.

## 3. Target public MCP v1 surface

The Directive fixes the first-release surface at sixteen tools. `operation_list` owns bounded catalog/list discovery; `operation_get` owns exact ID/version descriptor and schema retrieval. Keeping both avoids overloading list semantics while preserving the small fixed MCP surface.

1. `case_create`
2. `case_get`
3. `case_events_get`
4. `case_drive` — replaces pre-release `case_run_or_resume`; names the existing D0042 level-triggered abstraction directly.
5. `task_cancel`
6. `attempt_reconcile`
7. `claim_conflicts_get`
8. `case_promotion_get` — replaces pre-release `promotion_get` to keep the owner/resource explicit.
9. `development_context_get`
10. `development_context_list`
11. `development_context_search`
12. `development_context_read`
13. `operation_list` — bounded server/Agent operation catalog discovery/list summaries.
14. `operation_get` — exact semantic operation ID/version descriptor and schema retrieval.
15. `development_start` — replaces pre-release `development_unit_start`; creates/drives a Case-bound development run using one selected typed operation rather than a fixed model recipe.
16. `development_get` — replaces pre-release `development_unit_get`.

All sixteen tools must have `openWorldHint: false`. Read-only/destructive/idempotent hints remain truthful to each tool's own semantics. No per-operation MCP tools such as `git_push`, `validation_run`, `codex_run` or a generic `operation_execute` are added to the public surface.

## 4. Typed-operation identity model

Semantic operation IDs use the namespace:

`tdev.operation.<domain>.<object-or-action>.vN`

Initial core operations should converge on meanings equivalent to:

- `tdev.operation.repository.context.bind.v1` — bind an exact repository/base/scope to an immutable context reference; eager/lazy/packed/cache implementation is a binding concern.
- `tdev.operation.repository.changeset.compose.v1` — validate and normalize ChatGPT-authored bounded writes/deletes against exact base/scope/path/size rules and return a result-only ChangeSet. This is the primary core development operation and contains no model intelligence.
- `tdev.operation.repository.candidate.validate.v1` — execute the owner-required candidate validation contract. `npm run check` is a release/binding implementation, not the semantic operation name.
- `tdev.operation.repository.change.generate.v1` — optional delegated-intelligence operation that may be bound to Codex. It is not part of the core success requirement.

Implementation bindings use a distinct namespace such as:

- `tdev.binding.builtin.changeset-compose.v1`
- `tdev.binding.repository-context.git-scoped-lazy.v1`
- `tdev.binding.npm.repository-check.v1`
- `tdev.binding.codex.repository-change.v1`

Required validation policy is owner-selected rather than caller-selected. The current `validationProfile` public input should disappear from the normal development-start contract; repository/release policy chooses the mandatory validation binding and the caller cannot weaken it.

## 5. Operation descriptor contract

`operation_list` exposes bounded machine-readable catalog summaries and `operation_get` returns one exact ID/version descriptor/schema so ChatGPT can discover current capabilities without changing MCP tools. At minimum each descriptor should bind:

- `id`, `version`, `contractDigest`;
- title/description;
- strict `inputSchema` and schema digest;
- `resultKind`, `effectClass`, declared effects;
- required capabilities;
- cancellability and selection scope;
- availability/reason;
- whether the operation is caller-selectable or internal-only.

Effects are descriptive/admission inputs, not authorization. Existing Case grant, Workspace policy, Agent capability and Attempt fencing remain authoritative.

## 6. Directive authority and subordinate Design sequence

`DIRECTIVE.md@r1` owns the priority. Designs do not. The first subordinate authority task is D0031@r8, which adds the Directive to the self-development bootstrap and makes `WORKBOARD.md` carry the active Directive pointer.

After D0031@r8 is implemented/rebound, create and accept only the technical revisions actually required by the Directive:

- D0023 -> next revision: pre-release v1 names, sixteen-tool surface, all `openWorldHint=false`, `operation_list` + `operation_get`, and compatibility/migration rules for the trial-only old names.
- D0043 -> next revision: generic versioned typed-operation catalog, operation/binding/policy identity separation, deterministic ChatGPT-authored ChangeSet operation, owner-required validation, and Codex optionalization.
- D0046 -> next revision: replace the mandatory Codex-backed product gate with the ChatGPT-only core path while preserving Case -> Drive -> Agent -> Result -> validation -> Promotion and the current-client experiential boundary.

Do not mark D0023/D0043/D0046 `reopened` merely to store priority. Their lifecycle changes only when normal SDD semantics require it. D0019, D0042 and D0020/D0027 remain preserved owners unless later evidence actually reaches those contracts.

## 7. Implementation order after Design acceptance

A. Implement and verify D0031@r8 so a fresh session binds `DIRECTIVE.md@r1` before selecting dependent work; then rebind the Directive from the published repository.

B. Synchronize/accept the directive-driven D0023/D0043/D0046 revisions and affected normative owners. Do not implement their Class-2 source behavior before this authority step closes.

C. Correct MCP v1 names and annotations. Add a source invariant that every public tool has `openWorldHint === false`; generate/read back exactly the sixteen intended tools and no legacy aliases on the eventual release v1 surface. Add `operation_list` and `operation_get` with separate bounded list/exact-read responsibilities.

D. Introduce the versioned operation registry/descriptor contract. Keep MCP stateless and keep all operation execution Case-bound.

E. Implement the deterministic `repository.changeset.compose` core operation. ChatGPT reads context, decides edits, and supplies typed writes/deletes; the Agent only validates/normalizes/materializes under existing Attempt/warden/candidate rules.

F. Refactor `development_start` from the fixed `context -> model -> validation -> promotion` recipe into `context identity -> selected typed operation -> owner-required validation -> Promotion`. Preserve the normal Case/Drive/AgentDelivery/result-handoff path.

G. Make Codex a separately registered optional binding for delegated `repository.change.generate`; core runtime construction and core development must succeed when Codex executable/auth/config are absent.

H. Preserve old Case reader compatibility. Existing immutable pre-correction Plans are not rewritten. If any old nonterminal Case exists at deployment time, either keep the exact legacy handler until it quiesces or block deployment until a designed compatibility barrier is satisfied.

I. Run focused source falsifiers and the complete registered `portable` validation gate.

J. Perform one preserving Agent/provider deployment only after source/design gates pass. No new qualification architecture is added.

K. Prove the current-client core path with Codex disabled/unavailable: ChatGPT context read -> operation discovery -> ChatGPT-authored ChangeSet -> Case -> Drive -> Agent -> candidate -> mandatory validation -> Promotion -> terminal readback. Observe current-client approval UX after all tools advertise `openWorldHint=false`.

L. Only after K passes, optionally requalify Codex interoperability through the delegated operation. Optional Codex success cannot substitute for J.

## 8. Completion criteria

The correction is complete only when all of the following are observed:

- release identity is still `tdev.mcp.surface.v1`;
- public surface contains exactly the intended sixteen tools under the final names;
- every tool advertises `openWorldHint=false`;
- operation discovery works without adding per-operation MCP tools;
- core runtime starts and develops with Codex executable/auth absent;
- ChatGPT itself reads repository context and decides the actual source change;
- the change traverses the existing Case -> Drive -> AgentDelivery -> Agent result path;
- mandatory validation succeeds and Case-native Promotion succeeds;
- no model subprocess is required or spawned in the core proof;
- repeated approval prompts attributable to the old open-world annotation are absent; any remaining client confirmation is classified separately rather than weakening the server safety model;
- optional Codex support, if retained, is separately identified and cannot become a hidden core dependency.

Until these criteria are met, the earlier Codex-backed live-loop success remains useful compatibility/recovery evidence but is not the final v1 core-development success claim.
