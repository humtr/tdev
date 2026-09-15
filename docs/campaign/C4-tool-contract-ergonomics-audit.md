# C4 — public tool-contract ergonomics and misuse-resistance audit

Status: issued post-C2 campaign; not active before C2 completion

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. C4 is deliberately scheduled after C2 so the audit observes the converged product rather than repeatedly optimizing an interface that is still changing.

## 1. Campaign purpose and entry condition

C4 performs a comprehensive audit of the final tdev public development contract as actually used by ChatGPT. Its concern is not adding a new execution capability; it is making the existing typed product difficult to misuse, easy to discover correctly, and cheap to recover when an invalid call is attempted, without weakening exactness, authorization, isolation or explicit-effect semantics.

C4 begins only after C2 has completed exact-state `main` promotion, canonical self-development has moved to the verified `main` binding, and the bounded ordinary self-development acceptance required by C2 has succeeded. If C3 was activated before C2, its accepted public execution surface is included in this audit; if C3 was deferred/no-go, C4 does not revive it merely to create audit scope.

At C4 entry, freshly bind the then-current canonical repository/ref, runtime, release, schema and public tool surface. Do not rely on the examples or implementation details in this draft as current truth.

C4 is a post-convergence quality campaign, not a reason to keep C2 open. C2 completes on its own acceptance criteria. If C4 discovers substantive product changes, perform them through the then-current owner-authorized development workflow and exact validation/promotion path; do not turn the verified canonical `main` state into an ad-hoc unvalidated development frontier.

## 2. Audit principles

- Preserve typed operations as the primary product interface. Better ergonomics must not silently broaden authority or auto-correct ambiguous effectful requests.
- Prefer preventing an invalid request before an effect is admitted over accepting and guessing intent.
- Prefer machine-readable constraints in schemas or bounded capability metadata when the constraint can be represented there.
- For cross-item, stateful or semantic constraints that JSON Schema cannot express cleanly, make the rule discoverable in tool descriptions/current context and return structured actionable failure facts.
- Error recovery should tell ChatGPT what precondition failed and whether the same logical request may be retried, without exposing secrets or provider internals.
- Do not add narrative documentation as a second contract owner. Durable contract truth belongs in the existing Design/schema/type/source/test owner.
- Do not remove a safety constraint merely because ChatGPT violated it. First ask whether the constraint is necessary, whether its representation is adequate, and whether a safer equivalent interface exists.
- Measure interface friction, not just aesthetic preference. Extra round trips, failed admissions, redundant reads, unnecessary validation/provider work and repeated malformed calls are material.
- Audit the final four-tool surface as one system: `dev_context`, `dev_read`, `dev_work`, and `dev_observe`, including all then-current typed variants.

## 3. Seed cases — hints, not predetermined bugs

The following observed examples motivate the audit but must be freshly reproduced or falsified after C2:

- a `dev_work` edit batch can reject multiple touches of the same path even though the public schema alone does not express that cross-item uniqueness constraint, leading a caller to submit multiple `exact_edit` entries that should instead be consolidated;
- release staging may expose a full digest-shaped release identity while activation accepts a different public identifier representation, making an otherwise valid handoff non-obvious without owner knowledge;
- asynchronous validation/integration/release operations require exact observation/retry semantics that may be technically correct yet insufficiently discoverable from a fresh tool contract;
- error codes such as `ENTRY_CONFLICT`, `INVALID_ARGUMENT`, `STALE_*` or `EFFECT_UNCERTAIN` may be safe but too coarse if the response omits a bounded reason/path/precondition/remedy needed to form the next correct typed call;
- after C2, repository/ref selection, binding epochs, multi-repository scoping and any accepted C3 execution variants may introduce additional combinations whose legal shape is obvious to implementation code but not to a fresh ChatGPT caller.

These are audit seeds only. Do not change product semantics solely to preserve or satisfy an example from this draft.

## 4. Design ownership

D0004 is the expected primary owner because it owns the public MCP/controller contract. Before any change, locate the exact existing owner and revise only when necessary:

- D0004: public operation schemas, descriptions, error/recovery projection and ChatGPT-facing contract;
- D0001: request/action identity, retry/deduplication or durable observation semantics if those actually change;
- D0002: candidate/edit/snapshot semantics if the audit finds a genuine candidate-contract problem rather than a discoverability problem;
- D0005: authorization/security disclosure boundaries if richer diagnostics or execution metadata affect trust boundaries;
- D0006: release/runtime identity projection if activation/staging usability requires semantic change;
- other existing Designs only when their owned contract is actually implicated.

Do not create a new Design merely because C4 exists. A new owner is justified only for a genuinely independent semantic decision that cannot be represented cleanly by revising the current owner.

## 5. C4-1 — fresh contract and usage corpus

Purpose: establish the real final product surface and a bounded corpus of actual friction before proposing fixes.

- Freshly read the public schemas, tool descriptions, context output, error projection, retry hints, operation availability and current Designs.
- Collect representative successful and failed calls from C1/C2 and, if activated, C3 only as evidence; re-run the smallest safe cases needed to confirm the behavior on the final product.
- Exercise fresh-session tasks spanning context discovery, bounded read/search, multi-file edit, same-file multi-change intent, validation, integration, observation/recovery, release operations, multi-repository/ref selection and any accepted bounded execution surface.
- Record where the first attempted call is invalid, where a caller needs hidden repository knowledge, where one failure lacks enough information to construct the next correct call, and where the interface causes avoidable extra round trips or expensive effects.
- Separate caller/model mistakes from product-contract defects. A one-off reasoning mistake does not automatically justify product change.

Exit: a small evidence-backed taxonomy of final-product contract friction exists.

## 6. C4-2 — complete contract/misuse-resistance audit

Audit at least the following dimensions across all public operations:

1. **Schema expressiveness** — required/optional fields, unions, enum values, canonical encodings, cross-field and cross-item constraints, limits and conditional requirements.
2. **Identity handoff consistency** — repository/ref/binding IDs, Work/Action/result IDs, OIDs, digests, release identities, cursors and any representation change between producer and consumer operations.
3. **Batch semantics** — atomicity, independent item admission, same-path/same-work interactions, ordering assumptions, partial failure and deduplication behavior.
4. **State/precondition discoverability** — which current revision/generation/head/policy/release identity must be supplied and how the caller learns it without guessing.
5. **Async lifecycle clarity** — admitted versus completed work, observation keys, response loss, pending/blocked states, cancellation/resume and same-request retry rules.
6. **Error actionability** — whether bounded structured facts identify the failed precondition and permit the next correct call without exposing secrets or implementation internals.
7. **Operation selection** — whether typed operations overlap confusingly, whether the preferred operation is discoverable, and whether a safer typed operation is needlessly difficult compared with an unsafe workaround.
8. **Availability/capability projection** — unavailable operations, runtime-dependent capabilities and profile/tool support must be distinguishable from malformed requests.
9. **Multi-repository/ref ergonomics** — final C2 binding selection, scope and isolation must be explicit enough that the caller cannot accidentally target or observe the wrong binding.
10. **C3 surface if present** — typed-first selection, execution bounds and distinction between development execution and validation/integration authority must remain obvious.
11. **Token/round-trip cost** — contract improvements must not solve one hidden rule by forcing large repeated schema/doc reads or bloating every response.
12. **Security against helpful guessing** — server-side convenience must never infer a destructive/effectful target, substitute stale identity or silently reinterpret an ambiguous request.

## 7. C4-3 — classify and select repairs

For each confirmed friction point classify it as one of:

- caller-only mistake with no product change justified;
- documentation/description projection defect within an already-defined contract;
- schema/metadata expressiveness defect that can be corrected without semantic change;
- error-projection/actionability defect;
- implementation bug violating an existing Design;
- genuine public semantic change requiring revision of the existing Design owner; or
- intentionally retained constraint whose cost is justified by safety/correctness.

Prefer the smallest durable repair. Typical candidates may include:

- closed schema refinements where expressible;
- explicit machine-readable capability/constraint metadata in bounded `dev_context` output when stable and useful;
- concise operation descriptions/examples generated from the real contract rather than hand-maintained duplicate docs;
- structured error facts such as bounded reason/path/field/expected-state categories;
- consistent producer/consumer representation of public identities where semantics permit;
- cheap pre-effect preflight for invalid batches;
- tests proving that invalid calls fail before provider/execution effects and that the returned information is sufficient for a correct retry.

Do not add an automatic request-rewriter that guesses the caller's intent merely to improve benchmark success.

## 8. C4-4 — owner-correct implementation

Implement only selected repairs, revising existing Designs first when RULE classifies them as Designed.

Maintain:

- four-tool product shape unless fresh owner-level evidence justifies otherwise;
- exact authorization and capability checks;
- stable request/deduplication identity;
- stale-base/head/generation/release fencing;
- exact required-validation and integration boundaries;
- bounded outputs and secret-free diagnostics; and
- current C1/C2/C3 accepted safety and lifecycle properties.

Avoid a parallel help registry, second schema system or large prose manual. The executable contract and generated tool surface should remain the durable source of truth.

## 9. C4-5 — adversarial and actual-ChatGPT acceptance

Run focused contract tests plus complete required validation for every exact final change. Acceptance must include actual final ChatGPT-facing use, not schema snapshots alone.

Use a bounded task set that covers the representative friction taxonomy. Check at least:

- a fresh caller can discover required identities/preconditions without hidden handoff knowledge;
- legal calls remain legal and do not require materially more round trips;
- known-invalid calls fail before external/canonical effects and return enough bounded information to construct the correct next call where safe;
- same-path/multi-edit intent is either formed correctly from the exposed contract or rejected with an immediately actionable explanation, without weakening candidate conflict semantics merely for convenience;
- stage/activate and other producer-consumer identity handoffs are unambiguous;
- response loss and asynchronous completion still use the original durable identity rather than encouraging replacement effects;
- multi-repository/ref tasks remain correctly scoped;
- malicious or ambiguous requests do not gain authority through richer hints; and
- measured failed-admission/extra-round-trip cost is reduced for the selected cases or the retained cost is explicitly justified.

Do not claim deterministic model behavior from one transcript. The acceptance question is whether the contract supplies sufficient, consistent information and avoids known traps, not whether every future model call is perfect.

## 10. C4-6 — closeout

- Re-run the final public-contract inventory and ensure examples/tests match the authoritative executable contract.
- Remove temporary audit-only helpers and duplicate narrative material.
- Promote any lasting semantic changes into their existing Design/source/schema/test owners.
- Confirm ordinary safe tdev operation does not depend on this campaign plan or audit evidence.
- Report retained intentional constraints and any unresolved usability/security tradeoff explicitly.
- Reset WORKBOARD to the next actual frontier or idle state according to fresh authority.

## 11. Stop conditions

C4 does not stop merely because the initial seed cases were fixed. It is a bounded comprehensive audit of the final public contract.

Stop only when:

- the audit dimensions above have been covered sufficiently to falsify material hidden-contract risk;
- selected owner-correct repairs and required/live acceptance are complete;
- a genuine external permission/provider/user-action blocker prevents safe continuation; or
- fresh evidence shows a proposed repair would weaken correctness/security and no acceptable alternative is justified, in which case retain the constraint and document the bounded reason in its owner/test rather than forcing a convenience change.
