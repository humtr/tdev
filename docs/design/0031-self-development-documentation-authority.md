# Design 0031 — Self-Development Documentation Authority

- Status: `verified`
- Revision: 3
- Revision predecessor: revision 2 was verified at `34e2857261c05593cc38d73c8209302f2a193b70`; revision 1 and revision 2 verification evidence remain historical evidence
- Revision 3 reason: fresh convergence revalidation reproduced two gaps inside the verified r2 problem boundary: pre-bootstrap authority location can start from a coherent predecessor/default snapshot with no contract for locating the actual current snapshot, and a maintained Design owner can expose contradictory current-looking lifecycle/implementation state while metadata/index validation stays green
- Revision 3 falsifier: `docs/evidence/group-f-d0031-r3-authority-convergence-falsifier-2026-08-15.json`
- Revision 3 acceptance evidence: `docs/evidence/group-f-d0031-r3-authority-convergence-acceptance-2026-08-15.json`
- Revision 3 downstream revalidation: authority-location resolution, stale/default/local-only candidate behavior, owner-internal current-value consistency, D0018 maintained-record scoping, Design-index derivation and documentation governance; product/runtime semantics remain unaffected
- Class: 2
- Scope: self-development authority, session bootstrap, current routing, documentation naming/retention, Design correction lifecycle, documentation validation
- Active cumulative lineage: resolved from `WORKBOARD.md`; acceptance was prepared from `group/f-cloudflare-runtime@97208151c8cdb04f89a6af0bd58eea568bc825c3`
- Inventory evidence: `docs/evidence/group-f-d0031-documentation-authority-inventory-2026-08-13.json`
- Revision 1 verification source: `92d4ffeae74a0a0cac00ec05ab4efea01e73eedb`
- Revision 1 verification evidence: `docs/evidence/group-f-d0031-documentation-authority-verification-2026-08-13.json`
- Revision 2 verification source: `34e2857261c05593cc38d73c8209302f2a193b70`
- Revision 3 verification source: `85009bf72ec9e1bfe876bb7a1dcbedd8b44e8dd5`
- Revision 3 verification evidence: `docs/evidence/group-f-d0031-r3-authority-convergence-verification-2026-08-15.json`
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
- Class 2 work -> every Design revision referenced by the selected/dependent Class 2 gate in `WORKBOARD.md`;
- product behavior -> every affected product owner;
- verification -> the current qualification/proof-method owner selected by `docs/DOCUMENTATION.md` and exact referenced evidence required by the gate.

Historical reports and evidence are loaded only when a current gate, Design, owner, falsifier or provenance question requires them.

### 3.3 Current router

`WORKBOARD.md` exclusively owns the current development routing instance:

- active cumulative Group;
- active cumulative branch name;
- completed immediate predecessor checkpoint needed for current ancestry;
- zero or more runnable Design revision references relevant to the frontier, without copying their owner status;
- exactly one selected next action/gate or an explicit `none` when no runnable action exists;
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

### 3.6 Pre-bootstrap authority location

The fixed kernel is authoritative only after the session has bound itself to the repository snapshot that actually contains the current router. A fresh actor therefore performs an authority-location step before section 3.1 when its starting snapshot is not already trusted by exact immutable identity.

Authority location is an ephemeral resolution, not a new owner:

1. freshly enumerate the published repository candidates that can contain the self-development kernel;
2. read each candidate's `WORKBOARD.md` as a declaration made by that exact published `ref@sha`;
3. keep a candidate only when its repository identity matches the intended repository and its declared active branch is exactly the published ref containing it;
4. for each retained candidate, validate any declared immediate predecessor against the exact published predecessor identity and Git ancestry;
5. treat a retained candidate as superseding its exact predecessor candidate only when that predecessor relation is valid;
6. select exactly one retained maximal candidate and bind to its exact `ref@sha` before reading the fixed kernel;
7. if no maximal candidate exists, more than one maximal candidate remains, or a required predecessor identity/ancestry conflicts, fail the dependent mutation closed.

The provider default branch, current checkout, branch-name shape, timestamps, a remembered route, mere existence of a later ref, and local-only unpublished refs are discovery inputs only. None can elect the route. A provider default or normal checkout may be aligned to the already-resolved current route as an operational compatibility pointer, but that alignment never becomes a second current-route owner.

A tool-owned transport branch is not a route candidate merely because it contains current-looking files: its own published ref must equal the active branch declared by the `WORKBOARD.md` it contains. The resolver result is disposable and becomes invalid when any source ref observation changes.

## 4. Decision — naming and physical layout

Filename semantics are a secondary signal, never a substitute for declared ownership.

1. Live normative/current Markdown owners use `UPPERCASE.md`, preferably one semantic word when that remains clear (`RULE`, `SDD`, `WORKBOARD`, `LINEAGE`, `SPEC`, `PROTOCOL`, `SECURITY`, `WORKFLOW`, `PROGRAM`).
2. Bounded Design, evidence, completed campaign/group material, audits, reviews and historical reports use lowercase kebab-case names under semantic directories.
3. `README.md` is a conventional exception and may remain uppercase without becoming a normative product/development owner.
4. Existing widely referenced normative names are not renamed solely for stylistic purity. D0031 originally retained `docs/MVP.md`; later D0032 split verification methodology into `docs/QUALIFICATION.md` and preserved the former MVP aggregate as history, so this maintained revision follows that newer owner without rewriting D0031's historical Git evidence.
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

1. locate and bind the exact current repository snapshot under section 3.6 unless the starting snapshot is already trusted by exact immutable identity;
2. read the fixed bootstrap kernel from that bound snapshot;
3. resolve current routing from `WORKBOARD.md` and confirm it matches the bound published ref;
4. load the current stable owners required by that route;
5. compare any carried branch/Design/owner claim to the current owners;
6. discard or mark stale every incompatible derived claim;
7. freshly observe mutable external state at the gate that requires it.

No handoff can originate a new branch, Design status, product contract or migration authority.

## 7. Program and status deduplication

`ROADMAP.md` owns stable capability decomposition and exit criteria. `PROGRAM.md` owns the engineering dependency/coverage graph. `WORKBOARD.md` owns the current executable frontier.

ROADMAP/PROGRAM may retain historical completion/provenance or stable planning classification, but they must not carry a mutable `ACTIVE`/current-Group/current-branch instance that must change when WORKBOARD advances. A WORKBOARD-only F-to-G route transition must leave ROADMAP/PROGRAM valid without synchronization edits.

The Design record owns its maintained revision/status. WORKBOARD may reference `Dxxxx@rN` as a runnable foreign key but does not copy that status; validation resolves the Design owner and permits runnable Class 2 work only from the current `accepted` or `implementing` revision. Zero runnable Designs is valid.

One durable mutable semantic value requires not only one canonical origin owner but exactly one current semantic value exposed by that owner. A maintained owner must not state a second current-looking lifecycle/implementation value that contradicts or competes with its canonical current metadata. Explicitly historical/as-of predecessor statements, independent evidence, deterministic projections, exact-source caches and validation constraints remain allowed because they do not originate a second current value. Current-versus-historical scoping must be machine-checkable for maintained status snapshots; a generated index alone cannot prove owner-body consistency.

Human-readable Design indexes are deterministic derived projections of all maintained Design files. Validation checks the complete projection generically; no individual Design ID is special-cased. Projection equality and owner-body single-valuedness are separate gates.

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
| authority location — coherent predecessor/default | with a coherent predecessor as provider/default entry and a published current successor, the resolver binds the unique valid current `ref@sha` or fails closed; it never silently accepts the predecessor as current |
| authority location — unelected successor | a later-looking successor ref whose own WORKBOARD still declares the predecessor is not elected merely because the ref exists |
| authority location — local-only successor | an unpublished/local successor or current-looking checkout cannot advance the published current route |
| authority location — conflict | sibling/self-declaring candidates or predecessor identity/ancestry conflicts fail closed rather than using time/name/default heuristics |
| bootstrap | after exact authority location, a fresh-session procedure can determine current route from `AGENTS/RULE/SDD/WORKBOARD` without reading historical reports first |
| stale handoff | a fixture claiming an old `mvp-*`, Group E or old Design revision cannot override current WORKBOARD/current Design owner |
| route transition | full documentation validation remains green when a fixture changes only WORKBOARD from F to G; AGENTS/RULE/WORKFLOW/LINEAGE/ROADMAP/PROGRAM remain byte-identical |
| empty frontier | WORKBOARD with zero runnable Design references validates when no Design gate is selected |
| one owner | active branch/runnable-frontier/next-action instance is not independently declared as current by multiple live stable owners |
| owner single value | a maintained Design with canonical current lifecycle metadata plus a conflicting unscoped current-looking status snapshot is rejected, while an explicitly historical/as-of predecessor snapshot remains valid |
| lineage | completed checkpoint succession remains exact and historical checkpoints are not rewritten |
| history | old Design/evidence/report observations remain recoverable and are not rewritten as current claims |
| naming | live normative/current owners and bounded historical/specific records obey the declared filename categories, except documented conventions |
| Design reopen | a falsified accepted/verified Design blocks new dependent mutation until corrected revision/supersession |
| rollback separation | lifecycle rules do not imply that semantic correction requires Git/deployment rollback |
| docs validation | executable validator detects missing kernel owner, duplicate current route, stale stable Group literals, bad history naming, broken required live references, non-authorizing/reopened frontier Designs and any Design-index drift without hard-coded Design IDs |
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

## 12. Revision history and current correction

Revision 1 was `verified` for the original D0031 self-development/documentation scope at `8c89b9a6248b82456d52e3bbaaa0ff4e18cd20db`. Its repository-owned validator and seven adversarial governance tests passed, and the supported-Termux suite excluding the inherited ImmutableJournal hard-link profile passed 250/250 both uninstrumented and instrumented; product `src/` changed zero paths. Exact all-test commands remained platform-unqualified only because the pre-existing ImmutableJournal hard-link profile receives `link(2) EACCES` on this filesystem.

The 2026-08-14 falsifier `docs/evidence/group-f-d0031-r2-framework-gap-reproduction-2026-08-14.json` reopens only the claims that r1 had fully generalized current routing and validation. It reproduced three concrete defects: an empty active-Design state could not parse, a WORKBOARD-only F-to-G transition failed against ROADMAP's duplicated `ACTIVE` marker, and validator code special-cased D0019. Those failures stay inside the same bootstrap/current-router/derived-state problem and owner family, so SDD requires a new revision of D0031 rather than a new Design ID.

Revision 2 was `verified`. WORKBOARD models a route plus 0..N runnable `Dxxxx@rN` foreign keys and resolves authorization from the Design owner; ROADMAP/PROGRAM carry no mutable `ACTIVE`/current-lane mirror; the Design README is an exact deterministic projection of every maintained Design; and r2 adversarial validation proved zero-frontier validity, WORKBOARD-only F-to-G rebinding, reopened-Design fail-closed behavior, stale-continuity rejection and registry-drift detection without Design-ID special cases. The supported-Termux suite excluding the inherited ImmutableJournal hard-link profile passed 254/254 and the same subset completed instrumented coverage with exit 0. Exact `npm run check` remained explicitly platform-unqualified only because the inherited ImmutableJournal profile contributed the same 25 `link(2)` `EACCES` failures reproduced in isolation. Product `src/` changed zero paths. Evidence is `docs/evidence/group-f-d0031-r2-framework-verification-2026-08-14.json`.

The 2026-08-15 convergence falsifier reopens only r2's affected bootstrap/current-routing/documentation-validation meaning. Fresh observation found the provider default and normal checkout coherently on completed Group E while current WORKBOARD authority was Group F, and r2 supplied no pre-bootstrap rule for locating which snapshot's fixed kernel to read. The same fresh source review found D0018's maintained body could still expose a current-looking pre-production status snapshot contradicting its verified production record without failing the generated index or governance validator. These defects remain inside D0031's existing bootstrap/authority/validation problem and owner family, so revision 3 is the corrected revision rather than a new Design or registry migration.

Revision 3 was `accepted` by `docs/evidence/group-f-d0031-r3-authority-convergence-acceptance-2026-08-15.json` at `f2000d286f9ce527529792356473be74e9bcd41f`, implemented at `85009bf72ec9e1bfe876bb7a1dcbedd8b44e8dd5`, and is now `verified` by `docs/evidence/group-f-d0031-r3-authority-convergence-verification-2026-08-15.json`. The authority-location and single-value falsifiers pass 34/34 governance tests, documentation validation and exact projection checks pass, the supported non-hardlink regression suite passes 277/277, and product `src/` changed zero paths. The exact full `npm run check` and full coverage commands remain explicitly non-green on this Termux filesystem because the inherited ImmutableJournal hard-link profile reproduces 25 `link(2)` `EACCES` failures in isolation; that platform layer is not reported qualified. Revision 3 changes no product semantics, product source, D0019 acceptance, or WORKBOARD scheduling ownership.
