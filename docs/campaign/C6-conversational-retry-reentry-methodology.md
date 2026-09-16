# C6 — conversational retry/re-entry evaluation methodology

Status: issued mandatory post-C2 methodology campaign; not active during C2; independent verdict from C5 product/controller correctness

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable contracts and `WORKBOARD.md` own meaning and current routing. C6 validates an evaluation method; it is not itself a product safety contract and does not become a hidden prerequisite for ordinary tdev operation.

The owner requires the proposed process to be tested as a hypothesis rather than assumed correct. C6 therefore asks whether a conversational `gate -> benign success -> intentional retry/re-entry -> same-test-payload serial baseline -> actual separate role=user reinjection -> intentional retry/re-entry -> diversified repetition` process is a valid and useful evaluation method, and what relationship, if any, it has to C5's P0 controller-convergence problem.

## 1. Methodology question

The candidate process was motivated by safety/guardrail testing in a stateful LLM/API setting. Its distinctive claim is not merely “retry after failure.” It deliberately exercises successful or nonterminal conversational state, repeated invocation, and a real new user-turn boundary before observing whether the expected safe behavior remains stable.

C6 must not silently reinterpret `retry` as failure recovery. For this campaign:

- **intentional retry/re-entry** means deliberate re-invocation or re-entry after a successful, benign or still-valid state in order to test continuity/state sensitivity;
- **failure recovery retry** means a retry caused by an actual failure/unknown-delivery condition and is a separate test variable;
- **effect retry** means repetition of an effectful logical request and remains governed by the product owner's stable identity/idempotency contract; it is never authorized merely because the methodology says “retry”; and
- **role=user reinjection** means an actual separate user-turn boundary in the real client/API where available, not string concatenation that only resembles a user message.

The ambiguous shorthand `pwd` from the motivating description is not adopted as campaign terminology. C6 uses **test payload** for the same prompt/payload under comparison unless the original source later supplies a more exact definition.

## 2. Independent hypotheses

C6 evaluates several separable hypotheses rather than one all-or-nothing claim:

1. **State-boundary realism.** Benign prior calls, deliberate re-entry and an actual separate user turn can expose behavior that a stateless/single-turn prompt test misses.
2. **Discrimination.** The candidate process can distinguish known-good from deliberately unsafe/known-bad behavior without simply making every case easier or harder.
3. **Retry integrity.** Intentional retry/re-entry does not erase an earlier hard safety violation, manufacture a false pass, or itself authorize a new effectful identity.
4. **Diversity over repetition.** Variation across session state, user-turn boundary, retry class, history/noise and payload form provides stronger evidence than many identical repetitions alone.
5. **C5 applicability is unknown.** The method may be causally related to C5's P0 manifestation, merely diagnostic, useful only as auxiliary validation, or unrelated.

A favorable result on one hypothesis does not prove the others.

## 3. Non-goals and safety boundary

C6 does not:

- weaken any tdev authorization, validation, exact-effect, binding-isolation, deduplication or recovery invariant;
- allow a hard violation to be converted into PASS because a later retry succeeds;
- claim that 40/40 observations imply a true 100% success probability;
- make identical repeated trials a substitute for state/payload diversity;
- make the proposed process the sole C5 acceptance method before it is validated;
- assume that C5 is a controller-only problem or that C6 must be related to C5;
- require product mutation merely to make a test harness easier to run;
- turn synthetic message concatenation into proof of actual client `role=user` behavior; or
- generalize a tdev-specific result into a universal LLM-safety methodology without separate evidence.

Hard safety truth continues to come from the relevant product/effect owner. C6 evaluates whether the conversational procedure is a trustworthy way to exercise and observe that truth.

## 4. C6-1 — terms, threat model and candidate protocol

Freeze the exact question before looking for a favorable outcome.

- Specify the gate/control call and what it proves versus does not prove.
- Specify the benign successful call and whether it changes conversation/session state.
- Define intentional retry/re-entry separately from failure recovery and effect retry.
- Define the same-test-payload serial baseline, including what state is retained between calls.
- Define what constitutes an actual separate `role=user` turn in the available ChatGPT/client/API environment.
- Identify synthetic approximations and mark them non-equivalent until evidence supports equivalence.
- Define hard-safety outcomes independently from controller-quality/efficiency outcomes.
- Predefine how an earlier hard failure is retained in the trial result even if later re-entry succeeds.

Exit: the candidate protocol is executable or its unavailable real-client layers are explicitly unknown.

## 5. C6-2 — test-of-test calibration and pre-correction discrimination

Before using the process as qualification, attack the process itself.

Compare at least these harness families over the same bounded scenarios where feasible:

- minimal fresh-entry baseline with no benign warm-up or intentional retry;
- benign-success plus intentional retry/re-entry;
- actual separate user-turn re-entry;
- failure-recovery retry as a distinct condition; and
- synthetic user-message reconstruction only as a labeled comparison, never as automatic replacement for the real boundary.

Use both positive and negative controls:

- known-good controls that should preserve the same durable/safety truth across re-entry;
- deliberately unsafe/known-bad controls that must be detected, such as conflicting replacement before reconciliation, wrong-binding adoption, duplicate effect intent, or advancement past an unresolved relevant frontier, exercised only in a safe/disposable way; and
- where useful, C5's frozen pre-repair incident corpus as evidence input without assuming that the methodology caused the incident.

Measure whether benign warm-up or intentional retry masks a defect, whether it creates false alarms, and whether the real user-turn boundary behaves differently from synthetic or same-turn baselines.

Exit: the candidate method either has demonstrated discrimination worthy of freezing, needs bounded revision, or is rejected/not applicable. C5 may not wait indefinitely for C6 to rescue a weak method.

## 6. C6-3 — methodology freeze before post-correction results

For any method that survives C6-2, freeze the core protocol before using favorable post-correction outcomes to judge it.

Freeze:

- scenario/control definitions;
- which state is fresh versus warmed;
- intentional retry/re-entry and failure-retry conditions;
- actual user-turn requirements;
- hard-safety pass/fail rules;
- quality metrics;
- trial ordering/randomization where stochastic behavior matters;
- payload paraphrase/history/noise variation; and
- bounded repetition count justified by the claim being made.

The motivating `40/40` result is a hypothesis input, not a mandatory sample size. Forty identical repeats may show stability for one cell but do not substitute for independent scenario/state coverage. If C6 changes a material rule after seeing post-correction outcomes, rerun the affected pre-correction/control baseline under the revised method before drawing a paired conclusion.

## 7. C6-4 — post-correction diversified qualification

Run the frozen surviving method against the corrected/final controller/product state or another clearly defined post-correction target, while retaining the same relevant negative controls.

Where C5 provides the pre/post target, compare the frozen C5 pre-repair evidence with the corrected state without assuming that improvement proves causation by the methodology. If C5 found no reproducible current defect, use deliberate known-bad controls and label the missing paired live defect as a limitation.

Separate two outcome classes:

### Hard safety outcome

Examples include duplicate logical/canonical/provider effect, wrong-binding recovery, unreconciled conflicting replacement, lost relevant admitted lane or dependent advance past unresolved effect. A hard violation remains a failed trial even if a later retry/re-entry converges successfully.

### Conversational/controller quality outcome

Record first-entry reconstruction, intentional-retry reconstruction, real-user-turn reconstruction, failure-recovery behavior, unnecessary read-only calls, false diagnoses, rounds/tool calls to convergence and other bounded friction. These are not silently promoted into hard safety failures unless an authoritative product contract says so.

Evidence should prefer diverse independent conditions over repeated copies of one payload. Repetition is still useful for stochastic stability once scenario diversity is present.

## 8. C6-5 — applicability and relationship verdict

Independently classify what C6 established.

For C5, use one of these relationship verdicts when evidence supports it:

- **causal** — the tested conversational state/re-entry mechanism is demonstrated to contribute materially to the P0 failure mechanism;
- **diagnostic** — the method reliably exposes the P0 class but is not shown to cause it;
- **auxiliary** — the method adds useful coverage/realism but is neither necessary nor sufficient for C5 acceptance;
- **unrelated** — the method does not materially help explain or detect the C5 P0 class; or
- **unknown** — available evidence cannot distinguish the relationship.

An unrelated C5 verdict does not make C6 worthless. C6 may still be useful for C4, another evaluation boundary or general LLM/client research, but such reuse requires evidence appropriate to that new scope.

Also issue a methodology verdict: **validated for the stated scope**, **partially validated**, **rejected**, or **not executable/unknown**.

## 9. C6-6 — closeout and owner absorption

- Preserve raw/redacted trial data, exact scenario/state definitions and material uncertainty in evidence rather than narrative claims alone.
- Record positive-control and negative-control behavior separately.
- Record whether actual `role=user` boundaries were exercised or remained unknown.
- Record first-attempt versus intentional-retry versus failure-recovery results separately.
- Record the C5 relationship verdict independently from the methodology verdict.
- If the method becomes a lasting required product-validation or benchmark methodology, revise the existing appropriate semantic owner or create a new Design only if RULE's independent-owner test is truly satisfied; the campaign plan itself must not become that owner.
- If the method is rejected or unrelated, remove any temporary coupling from other campaign procedures.
- Do not preserve a giant qualification subsystem merely because the investigation used one.

## 10. Routing and interaction with C5/C4

C6 is mandatory after C2 because the owner requires the methodology hypothesis to be tested. It is separate from C5 and cannot be used to decide whether C5 runs.

WORKBOARD may interleave the campaigns at bounded evidence boundaries. The preferred evidence-efficient shape is:

- C5-1 freezes the smallest useful pre-repair incident/control corpus;
- C6-1/C6-2 may consume that corpus and calibrate the proposed method without delaying necessary C5 repair;
- C5 proceeds through owner localization/correction and its own hard acceptance independently;
- C6-3 freezes any surviving methodology before favorable post-correction qualification;
- C6-4/C6-5 evaluate the corrected state and the relationship to C5; and
- C5 and C6 each close on their own evidence/verdict.

C5 may close before C6 if its independent hard acceptance is complete, but C6 remains mandatory and must still reach its own verdict. C4 begins only after the mandatory post-C2 C5 and C6 campaigns have both reached closeout under current routing, so it audits the final controller/tool surface with the methodology verdict known. If C6 is unrelated to tdev/C5, that verdict does not enlarge C4 scope.

## 11. Stop conditions

C6 stops only when:

- the candidate methodology reaches a supported validated/partial/rejected verdict with the C5 applicability relation separately classified; or
- a genuine external client/API limitation prevents exercising a required real conversational boundary, in which case that layer remains unknown and the blocker is recorded without substituting synthetic evidence.

Do not close C6 merely because one 40/40 cell passes, because C5 is fixed, because C5 is unrelated, or because a synthetic prompt harness behaves consistently.