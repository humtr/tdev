# tdev owner directive

- Status: `active`
- Revision: 4
- Issued: 2026-09-09
- Revised: 2026-09-11
- Scope: current forward development through the first public tdev release
- Supersession: only a later explicit owner directive may revise or supersede this objective

## 1. Authority

This file is the single owner of the **current top-level objective, priority, and non-substitutable completion criteria** for tdev development.

It is not a Design, implementation plan, router, scheduler, runtime owner, or safety bypass. `RULE.md` still owns stable engineering invariants, `SDD.md` still owns change classification and Design lifecycle, technical Designs still own their bounded contracts, and `WORKBOARD.md` still owns executable routing. Those subordinate owners must, however, remain consistent with this Directive. A conflicting Design, route, plan, handoff, qualification campaign, or historical success may not silently replace or narrow this objective; correct the conflict before dependent mutation.

## 2. Priority objective — first public v1

The first public release is **v1**. The public MCP release identity remains `tdev.mcp.surface.v1`. Pre-release corrections to tool names, schemas, executor bindings, implementation, runtime naming, or provider placement do not create a v2 product surface.

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
11. **Canonical product path now.** Do not continue extending a separately named `trial`, dated qualification, or temporary product runtime with the intention of renaming it later. Promote the already validated path into the canonical `tdev` runtime now, while preserving stateful provider identities that cannot safely be renamed in place.
12. **Self-hosting is a product requirement.** tdev is not considered fully self-developing if normal work repeatedly requires tmcp, GitHub mutation, Worker redeployment, or another external bootstrap merely to issue the next bounded repository context. Break-glass repair remains allowed, but normal forward self-development must be tdev-native.

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

The priority objective is complete only after a real current-client run proves, with Codex disabled or unavailable and through the canonical endpoint `https://tdev.humtr.workers.dev/mcp`:

`ChatGPT context read -> operation discovery -> ChatGPT-authored ChangeSet input -> Case -> Drive -> AgentDelivery/local Agent -> candidate -> mandatory validation -> Promotion -> terminal readback`

The proof must establish that:

- the canonical `tdev` runtime starts and operates without Codex executable/auth/config;
- ChatGPT itself performs the source-change reasoning;
- no model subprocess is required or spawned on the core path;
- the ChangeSet remains Case/Attempt/fence/base/scope bound and fails closed when malformed, stale, or out of scope;
- mandatory validation passes on the disposable candidate;
- Case-native Promotion succeeds and remains the only canonical writer;
- the public surface is the intended sixteen-tool v1 contract and every tool reports `openWorldHint: false`;
- repeated approval prompts attributable to tdev's previous open-world annotation are absent; any remaining platform confirmation is classified separately instead of weakening the server safety model;
- no tmcp or GitHub mutation is needed merely to issue the bounded self-development context used by this normal proof.

Only after this no-Codex proof is green may optional Codex interoperability be treated as a secondary completion item.

## 6. Canonical runtime, self-hosting, and release model

The previously qualified `trial` path is now a migration source, not the future product architecture. New forward implementation must converge directly on the canonical `tdev` runtime.

1. **Canonical MCP endpoint.** The canonical current development MCP endpoint is `https://tdev.humtr.workers.dev/mcp`, backed by the Cloudflare Worker named `tdev`.
2. **No new trial product runtime.** Do not create new product Workers, durable owners, deployment controllers, or public endpoints whose continuing identity is `trial`, dated qualification, a Design number, or a temporary migration label. Historical files/evidence may retain their original names where renaming would destroy provenance.
3. **Logical canonicalization and physical state are separate.** Product code, runtime/API terminology, and new deployment ownership should converge on `tdev`/development/runtime naming. Existing Case, Drive, Agent, D1, Access, Durable Object, and retained unknown-effect identities must not be destroyed or recreated merely to improve names. Stateful migration requires explicit preservation and readback.
4. **Cloudflare resources must converge, not proliferate.** Inventory existing Workers, Durable Object namespaces, D1 databases, Access applications, routes, bindings, and deployment identities. Classify each as an active owner, temporary migration/rollback source, historical resource that must be retained, or proven orphan. Only proven orphans may be deleted without migration. A legacy-looking name is not proof of orphanhood.
5. **Canonical cutover is evidence-gated.** The old `tdev-mcp-trial` endpoint/runtime remains a migration and rollback source until the canonical `tdev` Worker exposes the intended sixteen-tool surface, preserves all required owner/state bindings, passes provider/runtime readback, and succeeds from the current ChatGPT client. Disable/delete legacy runtime resources only after that cutover is green and dependencies have been re-read.
6. **Self-context issuance must be tdev-native.** From one exact current repository base, tdev must be able to issue a new bounded immutable repository context for an owner-permitted path set without requiring a Worker redeploy or external tmcp/GitHub mutation. Exact commit identity, scope, path/file/byte bounds, digesting, stale-base rejection, and owner policy remain mandatory.
7. **Break-glass tools are not the normal self-development path.** tmcp and direct GitHub mutation may repair a broken tdev bootstrap or provider/runtime defect, but after repair the flow must return to tdev. Repeated external scope rebinding for ordinary new work is a defect, not an accepted workflow.
8. **GitHub `development` is the canonical moving development line.** A release controller may observe that line, but a runtime may never use the mutable branch name as its repository base.
9. **Every runtime revision is immutable and exact-base bound.** For each update, capture one fresh `development` HEAD commit SHA and bind repository context, package, runtime revision, validation, and readback to that exact SHA.
10. **Automatic deployment is subordinate to canonicalization and self-hosting.** After the canonical endpoint and self-context path are proven, automate `fresh HEAD -> exact SHA capture -> validation -> immutable context/manifest bind -> preserving deployment -> runtime readback -> invariant verification -> current revision switch`. If any required gate fails, keep the previous successful runtime current.
11. **No-op when already current.** If the deployed exact repository base already equals the selected validated HEAD, do not redeploy merely because a controller ran again.
12. **Development and stable/public remain separate channels.** Development may automatically follow the latest validated exact SHA after the automated path is proven. Stable/public must advance only through an explicit owner-authorized release decision using a validated immutable revision.
13. **Automatic does not mean mutable.** Automation must not turn `development_context_get` into a dynamic branch resolver, weaken stale-base rejection, rewrite in-flight context identity, or clear durable state/history.
14. **M2 and earlier trial qualification are historical recovery evidence.** Do not reopen them or extend their temporary naming as the product path without new regression evidence requiring bounded repair.

## 7. Current execution order

Execute the following sequence before unrelated expansion. Technical Designs and `WORKBOARD.md` must be revised where needed to route this order; stale subordinate routing, old `trial` terminology, or historical fixed-base instructions do not override it.

**Parallel execution policy.** The configured tdev development capacity is eight lanes. For independent, non-conflicting investigation, implementation, or validation work, orchestration should preferentially keep as many of those lanes productively occupied as correctness permits, with the practical goal of using the maximum safe parallelism rather than serializing work by default. Do not manufacture work merely to fill lanes, and do not overlap operations that can corrupt or invalidate one another. Mutations to the same file or shared mutable state, exact-base transitions, provider cutover, Durable Object transfer, candidate/validation/Promotion dependencies, and other ordering-sensitive boundaries must be serialized or otherwise fenced when concurrent execution could create stale writes, nested edits, duplicate effects, or ambiguous ownership. Capacity is an upper bound, not a correctness override.

### P0 — establish the canonical `tdev` Cloudflare runtime and endpoint

Treat the newly connected `https://tdev.humtr.workers.dev/mcp` endpoint as the target canonical development runtime, not as proof that migration is complete. Determine why the current ChatGPT connection does not expose the expected tools, then migrate the already validated MCP runtime semantics from the legacy `tdev-mcp-trial` path into the canonical `tdev` Worker without losing required durable state or owner bindings.

P0 is green only when all of the following are true:

- `https://tdev.humtr.workers.dev/mcp` is backed by the intended canonical `tdev` Worker and current immutable release identity;
- authenticated MCP initialize/connect succeeds from the current ChatGPT client;
- `tools/list` exposes exactly the intended sixteen-tool v1 surface with the required annotations;
- at least `development_context_get` and representative bounded read tools succeed through that same connection;
- Case/Drive/Agent/D1/Access owner identities and retained unknown-effect history are preserved or explicitly migrated with exact readback;
- old `tdev-mcp-trial` remains available as rollback/migration source until the new endpoint is proven green;
- the migration does not create a second long-lived state owner or parallel product runtime.

### P1 — inventory and converge Cloudflare resources

After the canonical endpoint is live, inventory the Cloudflare resources accumulated during recovery and qualification. Build the dependency graph before deletion. For every Worker, Durable Object namespace, D1 database, Access application, route, and relevant binding, classify it as active canonical owner, required retained historical/state owner, temporary migration/rollback source, or proven orphan.

Delete or disable only proven unused resources whose inbound references, state ownership, rollback role, and current runtime dependencies have been checked. Preserve stateful/historical owners when deletion would erase required evidence or durable state. Finish P1 with a bounded canonical resource set and no newly created trial/qualification product path.

### P2 — make bounded self-context issuance tdev-native

Remove the ordinary-work bootstrap dependency that currently requires deployment-time hardcoded self-development scope changes. Implement the smallest owner-governed path by which the current canonical tdev runtime can issue a fresh immutable repository context for a requested owner-permitted bounded path set on one exact current base.

The path must preserve exact commit/base identity, bounded path/prefix/file/byte/search limits, manifest/scope digests, stale-base rejection, and authorization. It must not expose an unbounded repository read, dynamic mutable branch context, arbitrary shell, or direct canonical write. A normal new self-development task must not require tmcp/GitHub mutation or Worker redeployment just to make its source files visible.

### P3 — prove real self-development before automating deployment

Using only the canonical tdev MCP path for normal development operations, perform one fresh non-documentation source change that was not pre-scoped by an external bootstrap. The sequence must include tdev-native bounded context issuance/read, typed operation discovery, ChatGPT-authored ChangeSet, `development_start`, Case/Drive/Agent ownership, exact-base disposable candidate, owner-required validation, Case-native Promotion, and terminal readback.

If a real defect forces break-glass tmcp/GitHub repair, record it as a blocker/repair and restart the self-development proof after returning to tdev; the external repair itself does not satisfy P3.

### P4 — implement automated development deployment/rebind

Only after P0-P3 are green, automate the repeated development release mechanics by reusing the existing preserving deployment/state owners. Fresh-read GitHub `development`, capture one exact SHA, compare against the current deployed exact base, no-op when equal, run required validation, bind the immutable release/context, preserving-deploy, read back provider/runtime/source/context/surface invariants, and switch current revision only when green. Keep the previous successful revision current on failure.

Do not create a parallel scheduler, generic remote shell, mutable runtime base, or unconditional stable/public branch follower.

### P5 — execute the canonical no-Codex current-client proof

Run the Section 5 proof through `https://tdev.humtr.workers.dev/mcp` with Codex disabled or unavailable. This is the first public-v1 experiential completion proof: current ChatGPT client, canonical endpoint, intended sixteen tools, tdev-native self-context, ChatGPT-authored ChangeSet, Case/Drive/Agent, candidate, mandatory validation, Promotion, and terminal readback.

Do not count earlier M2 recovery, capacity changes, documentation-only changes, canonical migration implementation, Cloudflare cleanup, self-context implementation itself, or auto-deploy implementation retroactively as this proof.

Canonical/Git publication is not a shortcut for this proof. The proof's semantic completion boundary remains Case-native Promotion and consistent terminal readback; any later Git/public release effect is a separately authorized consequence.

### P6 — converge subordinate authority and prepare stable/public release

When P5 is green, update the reached technical Designs, evidence, and `WORKBOARD.md` so their status, naming, endpoint identity, and next route accurately reflect the canonical runtime and completed self-hosted/no-Codex development path. Preserve stale trial/fixed-base material as historical evidence where appropriate, not as the current executable route.

Only after the canonical development path is stable may bounded stable/public release automation be evaluated. Stable/public activation must retain an explicit owner authorization boundary and must never become unconditional branch-following.

Do not turn this Directive into the detailed implementation Design. The Directive owns the priority, canonical runtime identity, self-hosting requirement, release policy, safety boundaries, and completion order above; the reached Designs own the bounded technical contracts and `WORKBOARD.md` owns executable routing.
