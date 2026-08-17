# Design 0035 — tdev Self-Hosting and tmcp Retirement

- Status: `draft`
- Revision: 1
- Class: 2
- Decision date: 2026-08-17
- Active cumulative lineage: resolved from `WORKBOARD.md`; drafted from `group/f-cloudflare-runtime@05cfe7a98b79c4941fa4ddf62ec2ed51ee2d2da7`
- Trigger: direct user decision that completed tdev replaces tmcp for normal development/operation and tmcp becomes disabled legacy infrastructure
- Affected owners: `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `docs/development/WORKFLOW.md`, `docs/QUALIFICATION.md`, `docs/MCP.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, local-Agent/runtime owners, Git publication owners, derived Design index
- Product/runtime semantics: proposes a new final-MVP self-hosting/retirement requirement; this draft authorizes no runtime, provider, deployment, Agent or tmcp mutation
- Explicit non-goals: no GitHub replacement; no tmcp shutdown during design work; no activation or implementation of D0020-D0029; no duplication of Case/Task/Attempt authority in Agent, MCP, Git or tmcp; no deletion or rewriting of tmcp historical state

## 1. One-line definition

Before tmcp can be retired, one deployed tdev release must use only tdev-owned control, Agent execution, validation and fenced Git publication paths to develop, validate, promote and publish an exact successor of the tdev repository while tmcp is operationally disabled, including representative failure reconciliation and independent proof that no required step depended on tmcp.

## 2. Evidence classes at drafting

### Repository facts

At the drafting snapshot:

- `docs/ROADMAP.md` defines the final MVP as a deployed and qualified Work Graph product that includes the Cloudflare/local-Agent topology, real Git publication, secured MCP, reproducible deployment, operations/recovery and Level-4 deployed evidence.
- `docs/development/PROGRAM.md` carries D0020 and D0023-D0029 as forward gates for Agent delivery, MCP, security, Git publication, deployment, local Agent, operations and final qualification.
- `docs/development/WORKFLOW.md` treats local execution and remote Git as separate development planes and requires independent publication reread rather than making a tool-owned worktree or branch authoritative.
- `ARCHITECTURE.md` and `SPEC.md` keep Case/Task/Attempt/result/Promotion semantics inside tdev while actual filesystem/Git/process/network effects remain outside the semantic owner behind executor/Agent boundaries.
- The repository has no separate accepted decision whose exit explicitly proves that normal tdev self-development remains complete when tmcp is unavailable or disabled.

### Direct user decision

The product direction supplied for this Design is that tdev replaces tmcp for normal operation when tdev is complete. tmcp may remain as historical/legacy infrastructure but is not intended to remain a required execution, control, validation, publication or recovery dependency after the retirement gate closes.

### Inference

The lower capability gates can each succeed while an orchestration, bootstrap, validation or recovery step still depends on tmcp. Therefore a final qualification that does not explicitly remove tmcp from the exercised path can produce a false retirement claim even when the product functions demonstrated by that qualification are individually correct.

### Unknowns

The following remain unresolved until their responsible future Designs and deployed evidence exist:

- the exact supported MCP client and authenticated local-Agent installation flow;
- the final Cloudflare/storage/routing topology and any evidence-activated D0021/D0022 path;
- the exact tdev-native validation orchestration interface used by the self-hosting proof;
- whether any emergency post-retirement tmcp reactivation is supported, and if so its owner, authorization, compatibility barrier and removal condition;
- the smallest production-source self-change suitable for the retirement proof without turning the gate into synthetic test-only behavior.

Unknowns do not weaken the retirement invariant. They determine how it is satisfied after the prerequisite owners are selected.

## 3. Current contract and concrete problem

### Current contract

The maintained repository currently requires a Level-4 deployed product with integrated local-Agent execution, secured MCP, fenced Git publication, deployment and operational recovery, but no accepted owner yet states that the final supported self-development path must remain complete with tmcp disabled. tmcp may be used by the present self-development workflow as an execution plane, but it is not product or repository authority. D0035 is a proposed decision boundary only; until a revision is accepted it changes no product/runtime contract and authorizes no implementation or cutover.

### Concrete problem

The forward program has a final D0029 Level-4 qualification gate, but its generic success/failure/security/recovery/migration/rollback matrix does not by itself prove tool independence. A controller could still use tmcp to create worktrees, run validation, execute Git commands, reconcile a failed operation or publish the repository while all product-visible checks pass.

That would leave tdev dependent on the system it is intended to replace. It would also make tmcp failure modes part of the long-term operating boundary even though the tdev semantic core, local Agent, MCP and Git publication paths are intended to own those responsibilities.

The missing decision is therefore not another executor feature. It is a cutover invariant: what evidence proves that the assembled tdev product is self-hosting enough for tmcp to stop being an operational dependency.

## 4. Decision boundary

D0035 owns **tmcp-retirement readiness** and the self-hosting proof that establishes it.

D0035 does not re-own the implementation decisions of the prerequisite gates. In particular:

- D0020 owns Agent connection/delivery epochs, stale-instance fencing and bounded delivery/capacity behavior;
- D0023 owns the supported versioned MCP command/projection surface;
- D0024 owns authentication, tenant/Case authorization and credential/security behavior;
- D0025 owns the authenticated fenced Git publication lane;
- D0026 owns reproducible provider deployment/configuration/rollback;
- D0027 owns the installable authenticated local Agent and bounded real Task execution;
- D0028 owns deployed operations, outage handling and recovery;
- D0021/D0022 participate only when their evidence-activated conditional gates are required by the selected deployed topology.

D0029 remains the final whole-product Level-4 qualification gate. D0035 is a distinct prerequisite coverage gate: D0029 must not be treated as proof of tmcp retirement unless the maintained D0035 exit has already been satisfied.

Creating D0035 does not create D0029@r1 or revise D0029. D0029 remains a provisional planning label until its own SDD lifecycle creates a maintained Design.

## 5. Rejected alternatives and tradeoffs

### Fold the retirement claim into D0029 only

Rejected. D0029 owns final whole-product qualification. A generic Level-4 run can remain green while its controller still uses tmcp for worktree creation, execution, validation, reconciliation or publication. Folding the requirement into D0029 would make the separately decidable cutover invariant easy to satisfy accidentally and would mix retirement ownership with the final aggregate evidence matrix.

### Keep tmcp as a permanent supported execution backend

Rejected for the intended completed-product boundary. That preserves the operational dependency this Design exists to eliminate and makes tmcp lifecycle defects part of the long-term supported path. Historical provenance and a separately designed emergency procedure are different from a permanent normal backend.

### Replace GitHub as part of the same decision

Rejected. GitHub is an external remote Git/provider plane whose current refs and provider state remain independently observable. D0035 requires tdev to own the fenced publication path and reconciliation semantics; it does not require reimplementing remote Git hosting or provider administration.

### Require release N to hot-upgrade itself to release N+1 in the same run

Not selected as the minimum retirement proof. Producing, validating and publishing N+1 without tmcp proves the self-development dependency boundary. Same-run binary activation is a stronger deployment property and remains with the responsible deployment/rollback owner unless later evidence makes it necessary.

### Disable or delete tmcp before replacement evidence exists

Rejected. Retirement is gated by evidence, not aspiration. tmcp remains available to current development until the accepted retirement procedure explicitly reaches cutover; historical tmcp state is preserved after cutover unless an independent retention decision removes it.

The tradeoff is a late, comparatively expensive integrated qualification step. The benefit is that final MVP completion cannot conceal a residual bootstrap, execution, validation, publication or recovery dependency on the legacy control plane.

## 6. Retirement invariants

A successful D0035 qualification must establish all of the following for the supported self-development path:

1. **bootstrap independence** — tdev can bind its exact published repository authority and establish the required development context without reading tmcp Task, Job, worktree, registry or runtime state as authority or required bootstrap input;
2. **control independence** — creation, admission, lifecycle, cancellation, retry/reconciliation and completion of the self-development work are represented by tdev-owned Case/PlanRevision/Task/Attempt semantics and supported MCP commands, not tmcp Root Task/Job lifecycle;
3. **execution independence** — repository, model, filesystem, process and validation effects required by the proof are executed by the supported authenticated local Agent path without tmcp operation submission;
4. **validation independence** — required source/documentation/product validation is invoked and observed through tdev-owned work and evidence paths rather than tmcp validation profiles or shell execution;
5. **publication independence** — the accepted Promotion projection reaches the intended GitHub ref through the supported fenced Git publication lane, with exact predecessor checks and independent provider reread;
6. **recovery independence** — representative disconnect, stale result, cancellation, validation failure, predecessor conflict and ambiguous publication cases can reach the correct durable outcome without tmcp recovery/control operations;
7. **authority isolation** — tmcp branches, Tasks, Jobs, checkpoints, local caches or runtime observations cannot become tdev repository, Case, Task, Git-publication or completion authority;
8. **secret isolation** — disabling tmcp does not require copying tmcp credentials or secret-bearing state into Case/Plan/evidence/repository content; supported Agent/provider credential owners remain separate;
9. **observable absence** — independent machine/runtime observations prove that the tmcp execution/control service used by the legacy path is disabled for the entire qualifying self-hosting run.

A path that merely happens not to call tmcp is insufficient. Every capability required by that run must have a tdev-owned supported replacement and evidence owner.

## 7. Required self-hosting proof

The strongest acceptance route is one real successor publication:

```text
tdev release N
  -> bind exact published tdev repository authority
  -> create one bounded self-development PlanRevision
  -> execute at least two independent ordinary Tasks from the same exact base where parallelism is legal
  -> accept only fenced typed results
  -> run the required repository validation through the supported tdev/Agent path
  -> perform one deterministic Promotion
  -> construct and publish the Git candidate through the supported authenticated fenced lane
  -> reread the remote provider ref and prove the intended successor
  -> observe tdev release/repository N+1 as the published descendant
```

During this proof the tmcp operational plane must remain disabled.

The selected change must exercise real production-shaped repository development. A documentation-only no-op, precomputed commit, direct remote-file mutation, manual out-of-band patch or test fixture that bypasses ordinary tdev Task/result/Promotion semantics does not satisfy the gate.

The proof need not require tdev to hot-upgrade the running coordinator to N+1 unless a responsible deployment Design separately requires that behavior. The essential self-hosting claim is that N can produce, validate and publish N+1 without tmcp.

## 8. Failure and recovery proof

A success-only self-edit does not establish retirement readiness. Qualification must include deterministic or controlled cases covering the supported equivalents of:

- local Agent disconnect/reconnect with a new connection epoch;
- stale delivery or stale result rejection;
- Task cancellation with no unauthorized canonical effect;
- validation failure that prevents Promotion/publication;
- remote Git expected-predecessor conflict;
- ambiguous or response-lost Git publication followed by authoritative remote reread and reconciliation;
- coordinator or delivery-owner restart at a boundary selected by the responsible runtime Design, with no duplicate external effect or invented success.

The cases may be split across prerequisite evidence when exact environment/profile identities match the final self-hosting route. D0035 still requires one integrated tmcp-disabled run proving that the assembled replacement path composes correctly.

## 9. Cutover and legacy treatment

Retirement is an operational transition, not Git-history deletion.

After the D0035 acceptance matrix is satisfied and every downstream owner required by the final route agrees:

- normal tdev development/operation documentation must no longer require tmcp;
- tmcp service/route/client integration for the legacy execution path is disabled under an independently observed machine/runtime transition;
- historical tmcp Tasks, Jobs, branches, artifacts and evidence remain provenance unless a separately authorized retention policy removes them;
- a tmcp-owned ref or local checkout cannot become fallback repository authority merely because it survives the cutover;
- tdev completion claims must continue to use tdev/GitHub/provider/machine owners for the layers they actually own.

Automatic or assumed tmcp reactivation is not a rollback strategy. If emergency reactivation is retained, a responsible operational owner must define its exact compatibility preconditions, authority limits, secret handling, activation evidence and removal gate. Until such a contract exists, emergency reactivation remains unsupported/unknown rather than an implied escape hatch.

## 10. Dependency and sequencing

D0035 is intentionally late and compositional.

Research and acceptance refinement may occur earlier, but verification of the retirement claim requires the supported paths selected by D0020, D0023, D0024, D0025, D0026, D0027 and D0028, plus every activated D0021/D0022 conditional path that the final deployment actually depends on.

The maintained Design lifecycle, not the numeric ID, determines implementation authorization. D0035 must not activate or pre-choose unresolved lower-layer owner, provider, security, migration or rollback decisions.

After D0035 verification, D0029 can consume the retirement result as one prerequisite of the final Level-4 matrix rather than duplicating the self-hosting decision or evidence.

## 11. Acceptance matrix

| Gate | Required result |
| --- | --- |
| prerequisite closure | every mandatory lower-layer owner used by the supported self-hosting path is accepted/implemented/verified to the level required by its own gate; activated conditional gates are included |
| tmcp disabled | independent machine/runtime observation proves the legacy tmcp operational service/control path is disabled before the integrated run begins and remains unavailable through completion |
| exact authority | self-development starts from the exact published tdev authority resolved by the supported repository-authority procedure, not a default branch, stale checkout, tool branch or remembered SHA |
| tdev-native control | self-development work is created, admitted, fenced, cancelled/reconciled and completed only through tdev-owned Case/Task/Attempt/MCP semantics |
| Agent execution | all required repository/model/filesystem/process/validation effects execute through the supported authenticated local Agent path with bounded authority and stale-instance fencing |
| parallel semantics | at least two independent ordinary Tasks from one exact base may execute concurrently and their completion order cannot change the Promotion result |
| validation | the exact required source/documentation validation for the chosen self-change passes through the tdev-owned replacement path; failed validation prevents publication |
| Promotion | exactly one Promotion deterministically accepts the complete intended result set and produces the candidate repository projection |
| Git publication | the candidate is published through the supported authenticated fenced Git lane with exact predecessor verification and independent provider reread |
| successor proof | provider observation proves the intended tdev repository successor is a descendant of the exact starting authority and contains only the reviewed promoted change |
| failure/recovery | stale Agent/result, cancellation, validation failure, Git conflict and ambiguous publication/reconciliation cases preserve the responsible authority and do not require tmcp |
| secret boundary | no tmcp credential/state is copied into semantic state, repository content, evidence payloads or model-visible context as a condition of retirement |
| legacy isolation | surviving tmcp state is provenance only and cannot authorize, route, execute or complete the qualifying tdev work |
| full regression | applicable source, documentation, deployment, security and final qualification gates remain green at their declared proof layers |

Failure of any row keeps tmcp retirement unverified even when lower product capabilities remain independently usable.

### Cheapest falsifiers

Before running the full self-hosting matrix, the cheapest decisive failures are:

1. make the legacy tmcp operation/control endpoint unavailable before bootstrap; any required self-development step that cannot proceed through a tdev-owned path falsifies retirement readiness;
2. reject or disconnect the selected local Agent and then reconnect under a new epoch; acceptance of a stale delivery/result or a requirement to use tmcp for recovery falsifies the boundary;
3. inject one failed required validation; any Promotion/publication that still proceeds falsifies the replacement path;
4. advance the remote Git predecessor independently or lose the publication response; inability to resolve the outcome by the supported tdev publication owner plus authoritative provider reread, without tmcp, falsifies the boundary;
5. independently observe the legacy tmcp service/control path during the integrated run; any successful required call or reactivation needed for completion falsifies the claimed tmcp-disabled proof.

These falsifiers establish only the retirement boundary they exercise; they do not substitute for the complete integrated acceptance matrix.

## 12. Verification evidence and ownership

D0035 verification evidence should record exact immutable identities rather than a narrative assertion:

- starting and resulting tdev repository commit identities and provider refs;
- tdev release/runtime identity responsible for the self-hosting run;
- MCP schema/client identity used to submit/control the work;
- local Agent identity/connection epochs and bounded capability observations;
- PlanRevision, Task, Attempt, accepted-result and Promotion identities sufficient to prove the executed path;
- validation profile/method identity and result;
- Git publication intent, expected predecessor, observed remote outcome and reconciliation evidence;
- tmcp-disabled machine/runtime observation before, during and after the integrated run;
- exact failure/recovery evidence reused from prerequisite gates, including its environment/profile compatibility with the integrated path.

`docs/QUALIFICATION.md` owns stable verification methods. `docs/evidence/` owns observed results. This Design owns the retirement decision and its acceptance boundary; neither PROGRAM nor a final report becomes a second evidence owner.

## 13. Non-goals and follow-on boundary

D0035 does not require:

- replacing GitHub repository hosting, Git object/ref semantics or provider administration;
- deleting tmcp source, repositories, historical Tasks/Jobs/artifacts or old branches;
- implementing a second scheduler or execution ontology parallel to Case/Task/Attempt;
- guaranteeing platform parity outside the supported final-MVP Cloudflare/local-Agent target;
- using tdev to deploy/activate its own newly published binary in the same run unless a later accepted deployment owner requires that stronger property;
- retaining tmcp as an emergency fallback.

If later evidence shows that retirement requires a materially separate migration of persistent state, credentials, provider ownership or a supported emergency rollback channel, that independent decision requires its own accepted Design rather than silently expanding D0035.
