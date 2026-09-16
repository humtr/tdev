# C5 — P0 controller convergence and durable-frontier discipline

Status: issued mandatory post-C2 campaign; not active during C2; fresh entry revalidation scopes the work and is not a go/no-go gate

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. `P0` is the urgency label carried by this campaign, not a new campaign-ID syntax or authority tier; under RULE Section 8 the permanent campaign identity is `C5`.

The owner requires C5 to execute after C2. Fresh post-C2 observation may show that no product change is needed, but C5 may not be skipped, deferred at entry, or closed merely because one seed incident no longer reproduces. The campaign must perform the bounded investigation and acceptance needed to explain or falsify the observed failure class on the final product.

C5 does not authorize implementation during C2, does not reopen C1/C2-1, and does not by itself change product semantics. Product or workflow corrections discovered here still belong to their existing authoritative owners.

## 1. Campaign purpose

C5 investigates and closes a P0 development-control failure class in which the conversational development process can lose, misclassify or advance past an already-admitted durable frontier, or can consider replacement work before the relevant original operation/effect has been reconciled.

The root cause is deliberately unknown at entry. It may be controller procedure, public observation/controller contract, durable substrate semantics, effect-specific recovery, provider behavior, client/session state, or a combination. C5 must localize and falsify these alternatives rather than assume that the substrate is correct or that the controller alone is defective.

The target is not “make ChatGPT remember more.” The target is a bounded control model in which current authority and durable truth can be reconstructed, relevant admitted lanes are explicitly classified, conflicting replacement is fenced, and safe progress does not depend on hidden conversational memory.

The provisional control cycle to falsify is:

`REBIND -> RECONCILE -> CLASSIFY FRONTIER SET -> PLAN -> FORK bounded independent lanes -> OBSERVE -> JOIN relevant lanes -> REPLAN -> ADVANCE`

C5 determines which corrections, if any, belong only in controller/development procedure and which require revision of existing product owners such as D0001 durable work/recovery, D0003 canonical effects, D0004 MCP controller/observation contract or D0006 release recovery.

## 2. Seed observations — evidence hints, not predetermined root cause

The following session observations motivate C5. They are resume/evidence hints, not current-state authority, and must be freshly reproduced, bounded or falsified after C2:

- During a C2-1 release activation, the normal device drain/stop/start interval made public tdev briefly return execution-unavailable delivery status while an already-admitted durable activation continued. The retained activation frontier later showed success, while the conversational process temporarily branched into a separate outage diagnosis before rejoining the existing operation.
- A broad `open:true` observation exposed a large historical backlog. That inventory was not the current C2 frontier, yet it could be mistaken for the exact objective frontier without explicit classification.
- Across long recovery and release work, response loss or interruption repeatedly created pressure to submit a replacement task, Work, Action or diagnostic path before the original durable identity had been reconciled to terminal/effect truth.
- Similar symptoms have appeared across canonical tdev operations and authorized TMCP repair jobs. This does not prove a common root cause; C5 must distinguish controller-consumption failures from substrate, contract and provider failures.

These examples may have different immediate causes. C5 must not force them into one implementation merely because they share a controller-visible symptom.

## 3. Scope and non-goals

In scope:

- reconstruction of the exact objective frontier after response loss, reconnect, fresh chat or tool/runtime interruption;
- exact reconciliation of already-admitted tdev Work/Action/request/result/effect identities before conflicting replacement;
- authorized TMCP task/job continuity only where TMCP is actually the current repair owner, without making TMCP a product dependency;
- bounded fork/join discipline for genuinely independent lanes;
- explicit supersession/cancellation rules so an abandoned lane cannot remain semantically live by accident;
- distinction between historical/open inventory and the exact relevant frontier set;
- multi-repository/ref/binding scoping after C2-1;
- release/activation drain and other intervals where temporary unavailability may coexist with retained durable work;
- adequacy of the public observation/retry contract for fresh-session reconstruction; and
- controller behavior when one tool/backend is unavailable while another authoritative owner retains the operation.

Out of scope by default:

- creating another reasoning agent, scheduler, queue or second durable work owner;
- changing tdev concurrency capacity merely to avoid controller bookkeeping;
- implementing C3 bounded ad-hoc execution;
- treating C4 public tool-contract ergonomics as the same problem;
- assuming the separate C6 conversational retry/re-entry evaluation methodology is valid before C6 proves it;
- weakening D0001 request/effect deduplication, D0003 exact integration or D0006 release recovery so replacement work becomes easier; or
- making TMCP a normal product dependency.

C4 remains the comprehensive final public-contract ergonomics/misuse-resistance audit. C6 is a separate methodology-validation campaign. C5 may consume a C6 method only after that method has earned the relevant verdict; C5 correctness and completion cannot depend solely on an unvalidated C6 procedure.

## 4. Provisional control invariants to falsify

1. **Authoritative durable truth beats conversational state.** Repository/runtime/provider truth and retained Work/Action/request/result/effect or authorized repair-task state are re-read before dependent mutation after interruption.
2. **No conflicting replacement before reconciliation.** Timeout, response loss, transient unavailability or forgotten local reasoning is not evidence that the original logical operation did not run.
3. **One explicit frontier set per objective.** An objective may have multiple genuinely independent lanes, but every lane relevant to the next transition has explicit repository/ref/binding and durable identity/classification.
4. **Inventory is not frontier.** Broad historical `open` results, retained jobs and old evidence require classification; visibility does not make them current.
5. **Forks are bounded and explicit.** Independent lanes have a recorded responsibility and durable identity before their parallel progress is relied upon.
6. **Join is dependency-scoped and mandatory.** A transition cannot advance past a relevant nonterminal/unclassified lane or effect; unrelated history and genuinely independent future work do not create a global barrier.
7. **Supersession is durable.** If a relevant lane is abandoned, its owner contract explicitly cancels, closes, supersedes or retains it as a blocker. Conversational intent alone does not retire durable truth.
8. **Same-request recovery stays same-request.** Lost-response recovery uses the owner-defined stable identity/readback path rather than a cosmetically similar new mutation.
9. **Temporary unavailability is not terminal evidence.** Delivery uncertainty, device drain or a missing conversational response never proves the durable operation disappeared.
10. **Uncertainty narrows mutation, not observation.** Read-only reconciliation may broaden as needed, but conflicting effectful progress narrows to the smallest proven-safe frontier until exact state is classified.
11. **Fresh chats can resume.** Correctness cannot depend on hidden chat memory, handoff prose or a model remembering which operation was probably current.
12. **Methodology is not correctness.** C5 hard safety acceptance stands on observed durable/effect truth even if C6 later rejects its proposed evaluation process.

## 5. C5-1 — fresh incident/control corpus and causal falsification

Purpose: establish the final-product baseline and preserve enough pre-repair evidence to localize the P0 class without assuming its owner.

- Start from verified canonical `main` and freshly bind repository/ref, runtime, release, provider, installed bindings and authorized open durable state.
- Reproduce, bound or falsify at least: lost response after durable admission, temporary device/runtime unavailability during a retained operation, authorized long-running repair work across conversation interruption, historical open-work backlog, and a bounded multi-lane/multi-binding workflow.
- Establish small known-good controls as well as deliberately unsafe/known-bad control states where they can be exercised without destructive canonical effects.
- Separate substrate loss/duplication, public-contract observability gaps, provider/effect reconciliation defects, client/session-boundary behavior and controller-consumption errors.
- Record the exact point at which the process can no longer name or prove a relevant active frontier, or the evidence showing that the previously observed symptom no longer exists.
- Freeze immutable pre-repair evidence sufficient for C5 comparison and optional C6 methodology study; do not delay necessary repair merely to enlarge a methodology cohort.

Exit: a bounded incident/control corpus and owner hypotheses exist. Non-reproduction of one seed does not skip C5; it changes the hypothesis set and may ultimately support a no-product-change outcome only after later acceptance.

## 6. C5-2 — frontier state model and owner classification

For each surviving or historically demonstrated failure classify the minimum state that must be reconstructible:

- objective/campaign/checkpoint identity where relevant to development routing;
- repository/ref/binding epoch;
- Work and current generation/revision;
- Action/request/prepared-result/effect identities;
- release stage/activation identity where applicable;
- authorized TMCP task/job/continuity identity only for repair work that actually uses it;
- forked-lane responsibility, dependency and join status; and
- explicit supersession/blocker state.

Then localize the smallest authoritative owner for each correction:

- D0001 only when durable request/action/recovery state is insufficient or incorrect;
- D0004 when the public controller/observation/retry contract is insufficient to reconstruct existing truth safely;
- D0003/D0006 when exact canonical/release effect reconciliation is defective;
- RULE/WORKBOARD navigation discipline when the defect is project control rather than product semantics;
- client/controller procedure when existing durable/product truth is already sufficient; and
- provider-specific repair only where fresh evidence proves an external owner defect.

Do not invent a new Design solely because C5 exists. Create no new durable frontier registry until evidence proves the existing owners cannot expose/reconstruct the required truth safely.

## 7. C5-3 — minimal owner-correct correction

Implement only the smallest surviving correction set. Possible classes, none preselected:

- strengthen existing controller/development recipes so effectful transitions have explicit rebind/reconcile/classify preconditions;
- expose a bounded existing-state projection that lets a fresh controller identify the exact relevant operation without treating unrelated historical backlog as frontier;
- improve same-request/effect observation where durable truth exists but cannot be retrieved by exact identity;
- repair substrate/effect-specific state when the retained truth itself is wrong or insufficient;
- add fail-closed admission fencing only if a reproduced conflicting replacement can otherwise create an unsafe logical mutation without destroying legitimate independent concurrency; or
- select an explicit **no product change** outcome when C5-2 shows existing contracts are sufficient and the remaining correction is controller/development discipline only.

Do not solve C5 with a second orchestrator, hidden agent memory, unbounded session registry or mandatory TMCP dependency. A no-product-change result does not close the campaign; C5-4/C5-5 still have to falsify the selected explanation on the final state.

## 8. C5-4 — adversarial cross-owner recovery acceptance

Exercise the selected correction/explanation against bounded cases including:

- response loss immediately before and after tdev create/edit/validate/integrate admission;
- response loss around retained release stage/activation, including normal drain intervals;
- temporary public tdev unavailability while a durable owner continues;
- authorized long-running repair jobs with conversational interruption when TMCP is actually in scope;
- stale historical `open` rows mixed with a small current frontier;
- two repositories/refs with deliberately similar objective/request names;
- bounded independent lanes where one succeeds, one fails and one remains running; and
- an attempted conflicting replacement that must first reconcile or explicitly supersede the original operation.

Hard acceptance gates are zero observed duplicate logical/canonical/provider effects for one intent, zero wrong-binding adoption, zero lost relevant admitted lane, and zero advancement past a relevant nonterminal/unclassified effect. Extra bounded read-only observations or a corrected read-only hypothesis are quality/cost signals, not hard safety failures by themselves.

Any retry or recovery used here follows the existing owner-defined stable identity. C5 does not import C6's intentional retry/re-entry sequence unless C6 has independently validated it for this use.

## 9. C5-5 — actual fresh-chat and bounded-concurrency acceptance

Run actual controller acceptance from a new chat/session without relying on the campaign's old transcript.

At minimum:

- reconstruct an interrupted or retained tdev operation from current authority and exact durable identities;
- reconstruct an authorized interrupted repair task/job from its actual owner when such a repair lane is part of the selected evidence;
- perform a bounded multi-lane task, track every admitted relevant lane and join the required terminal states before dependent advance;
- verify transient runtime drain/unavailability is not misclassified as proof that durable work disappeared;
- show unrelated retained/open history does not become the current frontier;
- verify multi-binding repository/ref identity remains explicit throughout recovery; and
- repeat the hard gates from C5-4 against actual client behavior.

Use the smallest lane count and fault set that falsifies the selected control model; this campaign is not a throughput benchmark. If the fresh client cannot exercise a required boundary, keep that layer unknown rather than replacing it with a synthetic claim.

## 10. C5-6 — convergence, relation verdicts and handoff

- Absorb every lasting invariant/correction into its proper current owner: Rule, existing Design, executable source/type/schema/config/test or current WORKBOARD routing.
- Remove temporary controller probes and narrative state that would become a hidden dependency.
- Re-run a fresh-session recovery smoke without depending on this campaign plan.
- Explicitly record which seed observations were reproduced, falsified, explained by another owner, or no longer present.
- Record the root-cause disposition: controller procedure, public contract, substrate/effect owner, provider/client boundary, mixed, or no surviving defect under the bounded evidence.
- Preserve the minimum pre/post evidence needed for C6 to test its independent methodology hypothesis, but do not make C5 completion depend on C6's verdict.
- If C5 changed the public contract, C4 must audit the changed final surface rather than the pre-C5 one.
- Close C5 only after WORKBOARD records the owner-correct outcome and hard acceptance. Routing to C6/C4 then follows current WORKBOARD.

## 11. Entry and routing policy

C5 is mandatory after C2 and is not active during C2. C2 retains its own completion criteria and should proceed using conservative reconciliation discipline unless a controller/substrate defect becomes a genuine C2 blocker.

After C2 completes, WORKBOARD routes to `C5-1`; there is no post-C2 C5 go/no-go. Fresh entry revalidation determines current manifestation, root-cause hypotheses and exact scope, not whether C5 runs.

C6 is a separate mandatory methodology-validation campaign with an independent verdict. It may use frozen C5 pre/post evidence and may be interleaved at bounded points by WORKBOARD, but C5 repair and hard acceptance cannot be contingent on C6 validating the proposed methodology. If C6 is unrelated to the P0 class, both campaigns still complete independently.

Issued C5 identities remain durable trace identities regardless of whether the final correction is product code, contract, workflow discipline or no product change.

## 12. Stop conditions

C5 stops only when one of the following is true:

- the reproduced P0 failure class has owner-correct repairs or controller/process corrections plus C5-4/C5-5 acceptance demonstrating safe durable-frontier convergence;
- bounded investigation shows no surviving defect on the final product, existing owners are sufficient, and C5-4/C5-5 controls/fresh-chat acceptance support an explicit no-product-change closeout;
- a genuine external client/provider/permission limitation blocks further safe testing and is recorded as a blocker without inventing completion.

If investigation proves a defect belongs to another existing owner, that is a localization result, not automatic C5 completion: the correction/acceptance remains required unless the external limitation above prevents it. Do not close C5 merely because one seed no longer reproduces, one lost-response case succeeds, C6 passes, or substrate deduplication alone looks safe. The acceptance question is whether relevant durable truth is reliably reconstructed and joined before conflicting mutation or dependent advance.