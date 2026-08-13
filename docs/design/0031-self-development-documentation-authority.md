# Design 0031 — Self-Development Documentation Authority

- Status: `verified`
- Revision: 1
- Class: 2
- Scope: self-development authority, session bootstrap, current routing, documentation naming/retention, Design correction lifecycle, documentation validation
- Active cumulative lineage: resolved from `WORKBOARD.md`; acceptance was prepared from `group/f-cloudflare-runtime@97208151c8cdb04f89a6af0bd58eea568bc825c3`
- Inventory evidence: `docs/evidence/group-f-d0031-documentation-authority-inventory-2026-08-13.json`
- Verification source: `92d4ffeae74a0a0cac00ec05ab4efea01e73eedb`
- Verification evidence: `docs/evidence/group-f-d0031-documentation-authority-verification-2026-08-13.json`
- Product semantics: unchanged
- Explicit non-owners: this Design does not redefine `SPEC.md`, `ARCHITECTURE.md`, `PROTOCOL.md`, `OPERATIONS.md`, `SECURITY.md`, `DEPLOYMENT.md`, `MCP.md`, runtime Case/Task/Attempt semantics, provider behavior, or product Git Promotion

## 1. One-line definition

Make a new development session rebind its authority from a small stable repository bootstrap plus one current router, while each durable development fact has one owner, bounded historical/evidence records remain preserved but non-authoritative, live normative documents are visually distinguishable from specific/history records, and a later falsifier can formally reopen or revise an earlier Design without rewriting completed Git checkpoints.

## 2. Evidence and concrete problem

The inventory at exact base `97208151c8cdb04f89a6af0bd58eea568bc825c3` found:

1. root `LINEAGE.md` still declares Group E active while current repository authority and the observed remote active branch are Group F;
2. exact active/completed Group facts are repeated in `AGENTS.md`, `RULE.md`, `WORKBOARD.md`, `ROADMAP.md`, `PROGRAM.md`, `WORKFLOW.md`, and `BRANCH_LINEAGE.md`;
3. `AGENTS.md` requires a broad fixed read set before affected scope is known;
4. `WORKBOARD.md` mixes current routing with verified history back through D0002;
5. `IMPLEMENTATION_REPORT.md` is a 1099-line historical aggregate but its ALLCAPS name resembles a live normative owner;
6. the completed Group E-specific execution document remains in the ALLCAPS development namespace even though no equivalent Group F document exists;
7. `ACCESS.md` mostly elaborates the `WORKFLOW.md` distinction between plane health and current-session capability;
8. `MVP.md` is both a widely referenced executable-acceptance owner and a historical evidence accumulator, making a path rename high-churn and low-value unless content is first separated;
9. `SDD.md` says a failed falsifier reopens a Design/owner but has no formal `reopened` state or same-Design revision rule; D0019 already required an accepted amendment in practice.

The defect is not that the repository preserves history. The defect is that preserved history and duplicated current facts are easy for a fresh session to mistake for current authority.

## 3. Decision — authority roles

### 3.1 Fixed bootstrap kernel

Every substantive repository change begins with exactly this fixed repository kernel:

```text
AGENTS.md
RULE.md
SDD.md
WORKBOARD.md
```

The kernel has distinct owners:

- `AGENTS.md` — bootstrap algorithm, precedence entrypoint, fail-closed stop lines, and progressive-loading directions;
- `RULE.md` — stable engineering invariants that are not tied to the current Group/branch/Design;
- `SDD.md` — change classification plus Design revision/reopen/supersession lifecycle;
- `WORKBOARD.md` — the single current routing instance.

The kernel is small by purpose. Reading it does not by itself authorize product changes; it tells the session which affected owners to load next.

### 3.2 Progressive loading

After the kernel, load only documents selected by the current route and affected scope:

- documentation/authority changes -> `docs/DOCUMENTATION.md`;
- development execution, replica or publication work -> `docs/development/WORKFLOW.md`;
- checkpoint succession or completed-ref questions -> `LINEAGE.md`;
- program/capability planning -> `docs/ROADMAP.md` and/or `docs/development/PROGRAM.md`;
- Class 2 work -> the active Design revision;
- product behavior -> every affected product owner;
- verification -> `docs/MVP.md` and exact referenced evidence required by the gate.

Historical reports and evidence are loaded only when a current gate, Design, owner, falsifier or provenance question requires them.

### 3.3 Current router

`WORKBOARD.md` exclusively owns the current development routing instance:

- active cumulative Group;
- active cumulative branch name;
- completed immediate predecessor checkpoint needed for current ancestry;
- active/accepted/implementing Design revisions relevant to the frontier;
- exact next action/gate;
- live blockers, sync/alignment debt, inherited qualification gaps and rollback/migration barriers that still constrain current action;
- pointers to the owners/evidence needed for that next action.

A current remote SHA is an observation, not a timeless routing fact. `WORKBOARD.md` may record an observed SHA with its observation meaning, but mutation/publication must freshly reread the provider ref.

Detailed chronological verification history does not belong in the current router.

### 3.4 Lineage

Root `LINEAGE.md` becomes the single-word normative owner for development checkpoint succession and history-preservation rules. It owns the stable succession model, not the current Group instance.

The pre-D0031 root `LINEAGE.md` is a historical accumulated-knowledge narrative and is preserved under a lowercase historical path. The pre-D0031 `docs/development/BRANCH_LINEAGE.md` contract supplies the normative lineage behavior to the new root owner. Exact old paths recorded inside evidence remain historical observations and are not blindly rewritten.

### 3.5 Workflow and access

`docs/development/WORKFLOW.md` owns the stable self-development execution model, including the distinction:

```text
plane health != route health != current-session capability != observed repository identity
```

Therefore a separate live `ACCESS.md` owner is unnecessary. Its durable invariant is absorbed into `WORKFLOW.md`; the old bounded document is preserved as lowercase history/supporting context.

`WORKFLOW.md` resolves the active branch from `WORKBOARD.md`; it does not embed Group F or any later current Group as process law.

## 4. Decision — naming and physical layout

Filename semantics are a secondary signal, never a substitute for declared ownership.

1. Live normative/current Markdown owners use `UPPERCASE.md`, preferably one semantic word when that remains clear (`RULE`, `SDD`, `WORKBOARD`, `LINEAGE`, `SPEC`, `PROTOCOL`, `SECURITY`, `WORKFLOW`, `PROGRAM`).
2. Bounded Design, evidence, completed campaign/group material, audits, reviews and historical reports use lowercase kebab-case names under semantic directories.
3. `README.md` is a conventional exception and may remain uppercase without becoming a normative product/development owner.
4. Existing widely referenced normative names are not renamed solely for stylistic purity. In particular `docs/MVP.md` remains the executable-acceptance owner in D0031; its historical accumulation may be reduced separately while keeping the stable path.
5. Historical evidence bytes are not rewritten simply to update a former path/name. Maintained live documents may update navigational references when a file moves.

Initial D0031 layout actions are limited to records whose role is already clear:

- normative branch succession -> root `LINEAGE.md`;
- old accumulated lineage narrative -> `docs/history/development-lineage.md`;
- completed Group E execution contract -> `docs/history/group-e-context-delivery.md`;
- historical implementation aggregate -> `docs/history/implementation-report.md`;
- D0014 audit/review reports -> lowercase historical paths;
- `ACCESS.md` -> historical/supporting path after its invariant is absorbed into `WORKFLOW.md`.

No new permanent `AUTHORITY.md`, `SESSION.md`, `ROUTER.md`, or `HANDOFF.md` is introduced.

## 5. Decision — Design correction lifecycle

A Design ID identifies one coherent problem/decision boundary. An accepted revision is immutable as historical Git/evidence identity even though the maintained Design file may advance to a new revision.

### 5.1 Same Design, new revision

Use a new revision of the same Design when new evidence tightens or repairs the accepted contract while preserving the same core problem, responsibility boundary and selected owner family.

The maintained record must identify:

- current revision number;
- predecessor revision/acceptance identity;
- falsifier or evidence that required the revision;
- changed decision text;
- affected downstream gates requiring revalidation.

D0019's accepted amendment is the existing motivating example.

### 5.2 New Design

Create a new Design ID when the correction changes the primary problem boundary, moves authority to a different owner model, introduces a separately decidable migration/cutover, or would make one record contain materially independent decisions.

The predecessor is then explicitly `superseded` for the affected meaning rather than silently edited into a different problem.

### 5.3 Reopen

A falsifier that invalidates an accepted or verified meaning puts the affected Design/owner scope into `reopened` state. While reopened:

- the affected contract is not authorization for new dependent mutation;
- unaffected previously verified facts remain valid unless the falsifier reaches them;
- current cumulative development continues on the active lineage rather than rewriting a completed Group ref;
- work proceeds toward a corrected accepted revision, a superseding Design, or an explicit blocked outcome.

### 5.4 Rollback is separate

Semantic correction answers what the contract must become. Operational rollback answers how an already active deployment/state is made safe. A defect may require either, both, or neither.

Rollback must obey the current deployment/migration barrier and cannot be inferred merely from a Design reopen. Completed development checkpoint refs are provenance and are not routine rollback targets to rewrite.

## 6. Derived state, handoff and stale context

A handoff, chat summary, project prompt, Task context or generated registry is continuity input, not current repository authority.

A continuation may carry observations and cached interpretations only when it also carries enough identity to test compatibility. At session start or before mutation:

1. read the fixed bootstrap kernel;
2. resolve current routing from `WORKBOARD.md`;
3. load the current stable owners required by that route;
4. compare any carried branch/Design/owner claim to the current owners;
5. discard or mark stale every incompatible derived claim;
6. freshly observe mutable external state at the gate that requires it.

No handoff can originate a new branch, Design status, product contract or migration authority.

## 7. Program and status deduplication

`ROADMAP.md` owns stable capability decomposition and exit criteria. `PROGRAM.md` owns the engineering dependency/coverage graph. `WORKBOARD.md` owns the current executable frontier.

ROADMAP/PROGRAM may retain historical or derived status for traceability only when clearly marked non-authoritative or mechanically checked against the current owners. They must not independently originate current branch routing.

The Design record owns its current Design revision/status. Human-readable Design indexes are derived registries and must be mechanically checked rather than treated as independent authority.

## 8. Failure, compatibility and migration

- Missing bootstrap/current-router owners fail the dependent mutation closed.
- Conflicting current-routing declarations in live normative documents fail documentation validation.
- A historical report that names a formerly active branch is not a conflict when its historical role is explicit.
- Naming migration may break live links only if the same change repairs all maintained live references; exact evidence observations may retain former paths.
- No product durable format, runtime deployment, provider state or product Git publication is changed by D0031.
- The canonical Termux checkout may remain alignment debt during this work; an isolated exact active-ref worktree is authorized by the existing workflow until safe alignment is separately performed.

## 9. Acceptance matrix

| Gate | Cheapest falsifier / required result |
| --- | --- |
| bootstrap | a fresh-session procedure can determine current route from `AGENTS/RULE/SDD/WORKBOARD` without reading historical reports first |
| stale handoff | a fixture claiming an old `mvp-*`, Group E or old Design revision cannot override current WORKBOARD/current Design owner |
| route transition | changing a fixture router from F to G changes derived current route without editing stable AGENTS/RULE/WORKFLOW/LINEAGE law |
| one owner | active branch/current Design/next-action instance is not independently declared as current by multiple live stable owners |
| lineage | completed checkpoint succession remains exact and historical checkpoints are not rewritten |
| history | old Design/evidence/report observations remain recoverable and are not rewritten as current claims |
| naming | live normative/current owners and bounded historical/specific records obey the declared filename categories, except documented conventions |
| Design reopen | a falsified accepted/verified Design blocks new dependent mutation until corrected revision/supersession |
| rollback separation | lifecycle rules do not imply that semantic correction requires Git/deployment rollback |
| docs validation | executable validator detects missing kernel owner, duplicate current route, stale stable Group literals, bad history naming and broken required live references |
| source non-regression | repository-required source gate remains green or any pre-existing platform-unqualified layer is reported exactly rather than hidden |

## 10. Rejected alternatives

### Add a separate authority/session manifest as a new source of truth

Rejected. It would reproduce the duplicate-owner defect. A generated/ephemeral manifest is acceptable only as a deterministic projection of current owners with source identities and mismatch rejection.

### Make every document part of every session bootstrap

Rejected. It increases stale-history collision and context load before the affected scope is known.

### Delete old history after moving current routing out

Rejected. Past decisions, falsifiers, rejected alternatives and qualification boundaries are needed to evaluate future defects and supersession.

### Rename every old normative path immediately

Rejected. Naming consistency is not worth breaking a widely referenced live owner such as `MVP.md` without a stronger semantic benefit.

### Roll back to an old Group when an inherited Design defect is found

Rejected as the normal correction model. Correct forward on the active cumulative lineage; use operational rollback only when current deployment/state safety and an explicit rollback barrier require and permit it.

## 11. Implementation slices

1. preserve this Design and inventory evidence;
2. establish bootstrap/current-router/lineage/workflow owner boundaries;
3. migrate clearly historical/specific ALLCAPS records and repair maintained references;
4. shrink WORKBOARD and deduplicate current status/routing copies;
5. formalize SDD Design revision/reopen rules;
6. add documentation/session-routing validation and adversarial fixtures;
7. run full effective-diff and source/documentation gates, then publish by exact fast-forward only.

Acceptance of this Design authorizes only these self-development/documentation changes. It does not authorize D0019/D0020/D0030 product implementation, provider deployment, runtime migration, or product semantic changes.

## 12. Verification conclusion

Revision 1 is `verified` for the D0031 self-development/documentation scope. The repository-owned validator and seven adversarial governance tests close stale handoff, F-to-G routing, Design-revision mismatch and fail-closed owner-conflict cases. The supported-Termux suite excluding the inherited ImmutableJournal hard-link profile passed 250/250 both uninstrumented and instrumented; product `src/` changed zero paths. Exact all-test commands remain platform-unqualified only because the pre-existing ImmutableJournal hard-link profile receives `link(2) EACCES` on this filesystem. That unrelated qualification gap is preserved rather than converted into D0031 success or failure.
