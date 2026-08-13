# tdev specification-driven development

> Authority: this file owns how a repository change is classified, designed, revised, reopened, verified, superseded and closed. Product and subsystem behavior remain in their named normative owners.

## 1. Principle

A change is complete only when its owner contract, implementation, observable acceptance, failure behavior, migration effect and remaining unknowns agree. Passing code does not silently redefine a contract, and prose does not claim a layer that was not executed.

A Design is a falsifiable decision, not a protected historical conclusion. Later evidence may invalidate part or all of an accepted/verified meaning. Correct the responsible boundary while preserving the historical evidence that explains the earlier decision.

## 2. Change classes

### Class 0 — editorial

Wording, links, formatting, file movement or examples change without changing behavior, authority meaning, schema, commands, support or acceptance.

Required: identify the owner, explain why meaning is unchanged, preserve historical provenance when paths move, and run relevant documentation checks.

### Class 1 — bounded implementation

A local defect or internal refactor changes no public/durable contract, ownership, state meaning, security boundary, compatibility, deployment, dependency or verification requirement.

Required temporary contract:

- one-line end state;
- current owner;
- scope and non-goals;
- acceptance and focused regression tests;
- remaining unknowns.

An implementation that merely failed to satisfy an unchanged accepted Design can normally be repaired as Class 1 when no Class 2 boundary is implicated.

### Class 2 — designed change

A Design record is mandatory before implementation when any of these may change:

- product scope, terminology, support or non-goal;
- Plan, Task, Attempt, result, event, receipt, state, identifier, digest or public schema;
- owner, dependency direction, concurrency, claim, queue, retry, cancellation, reconciliation or canonical commit;
- authority, path, secret, identity, fencing, approval or trust boundary;
- persistence, migration, rollback, deployment, external dependency or release asset;
- acceptance evidence or verification method;
- self-development authority, current-routing semantics or Design lifecycle;
- a workaround that would survive the current slice.

When uncertain, classify upward.

## 3. Design record and revision identity

Class 2 work lives in `docs/design/` and must contain:

1. metadata, current revision and affected owners;
2. one-line definition;
3. repository facts, measured evidence, external engineering evidence, inference and unknowns separated;
4. current contract and concrete problem;
5. decision with ownership and state transitions;
6. rejected alternatives and tradeoffs;
7. failure, cancellation, recovery and cleanup;
8. compatibility, migration, rollback barrier and deployment impact;
9. acceptance matrix and cheapest falsifiers;
10. non-goals and follow-on gates.

A Design ID names one coherent problem/decision boundary. A revision identifies the maintained accepted meaning of that same boundary.

Post-D0031 new or semantically revised Designs must carry an explicit integer `Revision`. Pre-D0031 Design records without that field are treated as legacy revision 1 until they are next semantically revised; do not mass-edit historical records merely to add metadata.

An accepted revision is immutable as historical Git/evidence identity. The maintained Design file may advance to a later revision, but it must retain enough predecessor/evidence identity to recover what the earlier accepted revision meant.

A purely editorial correction that changes no decision or acceptance meaning does not increment the Design revision. Any correction to accepted decision, failure, migration, ownership or acceptance meaning does.

## 4. Lifecycle

Status vocabulary:

```text
draft -> accepted -> implementing -> verified
                    \-> blocked

accepted | implementing | verified -> reopened
reopened -> accepted (new revision) | blocked | superseded
accepted | verified -> superseded
```

Only the current accepted or implementing revision authorizes Class 2 implementation in its affected scope.

### Reopened

A falsifier that invalidates accepted or verified meaning changes the affected Design/owner scope to `reopened` until the mismatch is resolved.

While reopened:

- the invalidated portion is not authorization for new dependent mutation;
- unaffected previously verified facts remain valid unless the falsifier reaches them;
- current cumulative development continues on the route resolved by `WORKBOARD.md`; completed checkpoint refs are not rewritten to simulate correction;
- downstream Designs/gates reached by the falsifier are explicitly listed for revalidation, blocking or supersession;
- work converges on a corrected accepted revision, a superseding Design, or an explicit blocked state.

Reopen is a current lifecycle fact, not a rewrite of the historical acceptance claim.

### Same Design, new revision

Use the same Design ID with an incremented revision when new evidence tightens or repairs the accepted contract while preserving the same core problem, responsibility boundary and selected owner family.

The new maintained revision records:

- predecessor revision and acceptance/evidence identity;
- falsifier or evidence requiring the change;
- exact changed decision meaning;
- affected owners;
- downstream gates requiring revalidation;
- fresh acceptance evidence.

D0019 revision 2 formalizes the pre-D0031 `accepted as amended` practice: the amendment repaired the same CaseDO authority-adapter decision rather than opening a materially independent problem.

### New Design / supersession

Create a new Design ID when the correction changes the primary problem boundary, selects a materially different owner model, introduces a separately decidable migration/cutover, or would otherwise make one record contain independent decisions.

The replaced Design/revision becomes `superseded` for the affected meaning. Supersession never erases its historical evidence.

## 5. Owner impact order

For a designed change:

1. establish the accepted Design revision before Class 2 implementation;
2. update normative owner contracts that the revision changes;
3. implement the smallest production-shaped vertical slice;
4. test pure invariants first, then state transitions, persistence/reopen, adapter behavior and the full applicable source gate;
5. review the effective diff, generated/derived forms, failure paths and unsupported layers;
6. mark verified only from observed evidence.

A failed falsifier reopens the affected Design or owner. Do not hide the mismatch in a fallback, flag, cache, second owner or status summary.

If the falsifier reaches an earlier inherited Design, correct forward on the current cumulative lineage. Reopening D0017 while Group F is current does not make completed Group E the ordinary mutation branch.

## 6. Semantic correction versus operational rollback

Semantic correction answers what the maintained contract must mean next. Operational rollback answers how an already active deployment or durable state is made safe. They are independent decisions.

A defect may require:

- semantic correction only;
- operational rollback only;
- both, in a controlled order;
- neither, when the failing claim never reached an active/runtime layer.

Do not infer rollback from `reopened`. Before rollback, use the current deployment/migration owner to prove a compatible predecessor, data/schema compatibility, external-effect handling and the exact rollback barrier. When downgrade is unsafe, recovery must move forward under an accepted Design rather than pretending an old commit restores old data meaning.

Git history/checkpoint preservation is also separate from runtime rollback: completed development refs remain provenance unless an explicit history-correction authority says otherwise.

## 7. Evidence rules

- Tests use barriers, controlled promises, deterministic identities and public outcomes. Timeouts are deadlock guards only.
- A source test proves source behavior, not deployment, provider state, current-client behavior, rollback or external effect count.
- A performance claim names the measured workload/environment, compares equivalent semantics, and separates operation/byte-count evidence from noisy wall-clock observations. No microbenchmark becomes a production SLO by implication.
- A performance cache/index is rebuildable from an authoritative owner or explicitly promoted into a designed durable contract; an optimization never silently becomes semantic truth.
- Skipped, unsupported, unavailable and unexecuted layers remain `unknown`.
- An uncertain external effect remains `unverified` or `reconciling`; it is not rewritten as failed or cancelled.
- Security denials and corruption failures are tested as no-effect decisions.
- Every durable format has a version, predecessor rule, validation, migration owner and rollback barrier.
- An amendment/revision acceptance records fresh evidence instead of rewriting the earlier evidence artifact to look as though it tested the later meaning.

## 8. Derived status and routing

A roadmap, program row, Design index, handoff, milestone, Capability Group or provisional future Design ID is planning/continuity context. It never substitutes for the current Design record or independently authorizes Class 2 implementation.

`WORKBOARD.md` owns the current development routing instance. A Design owns its maintained revision/status. Derived registries and program status summaries lose conflicts to those owners and should be mechanically checked for drift.

## 9. Completion review

Before closing work, verify:

- one canonical owner per durable fact;
- current route is rebound from `WORKBOARD.md`, not stale continuity;
- Design status/revision and downstream invalidation are consistent;
- no duplicated readiness or lifecycle state;
- no direct canonical mutation outside Promotion;
- retries match the effect class;
- identity and fencing cover stale delivery;
- bounds and malformed/corrupt inputs fail closed;
- migrations are explicit and downgrade assumptions are not hidden;
- semantic correction and operational rollback are not conflated;
- commands in the documented source gate run in the declared minimum runtime or an already-known unsupported layer remains explicitly unqualified;
- remaining product/provider unknowns are stated without inflating source completion;
- performance-only state can be dropped/rebuilt without changing a legal result, and benchmark evidence covers the hot path the change claims to improve.
