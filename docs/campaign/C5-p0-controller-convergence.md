# C5 — P0 controller convergence and durable-frontier discipline

Status: issued post-C2 candidate; not active; mandatory fresh entry revalidation

This document is a non-authoritative campaign plan. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. `P0` is the urgency label carried by this campaign, not a new campaign-ID syntax or authority tier; under RULE Section 8 the permanent campaign identity is `C5`.

C5 being issued does not authorize implementation during C2, does not reopen C1/C2-1, and does not by itself change current product semantics. Its purpose is to preserve a repeatedly observed controller-level correctness risk so it cannot disappear with chat history before a fresh post-C2 decision.

## 1. Campaign purpose

C5 investigates and, only if freshly justified, repairs a controller-convergence failure mode in which the underlying durable substrate retains the correct Work/Action/job/effect truth but the conversational development controller loses the active frontier, replans from an incomplete observation, or considers replacement work before joining the already-admitted durable operation.

The target is not “make ChatGPT remember more.” The target is a development-control discipline and, only where evidence requires it, owner-correct product/tool support that makes the current durable frontier reconstructible and hard to accidentally abandon across response loss, reconnect, long-running operations, multiple tools and fresh chats.

The provisional controller cycle to falsify is:

`REBIND -> RECONCILE -> PLAN FRONTIER -> FORK bounded independent lanes -> OBSERVE -> JOIN -> REPLAN -> ADVANCE`

The campaign must determine which parts belong only in controller recipes/workflow and which, if any, require changes in existing product owners such as D0001 durable work/recovery or D0004 MCP controller/observation contract.

## 2. Seed observations — evidence hints, not predetermined root cause

The following session observations motivate C5. They are not current-state authority and must be freshly reproduced or falsified after C2:

- During a C2-1 release activation, the normal device drain/stop/start interval made public tdev briefly return execution-unavailable delivery status while the already-admitted durable activation continued. The TMCP task retained the real activation frontier and later showed success, but the conversational controller initially branched into a separate outage diagnosis and considered an unrelated recently deleted qualification Worker as a possible cause before rejoining the existing activation.
- A broad `open:true` observation exposed a large historical backlog. That inventory was not the current C2 frontier, yet it was easy for the controller to lose the exact current Work/Action/request scope when the output was treated as a frontier rather than historical state requiring classification.
- Across long recovery and release work, response loss or interruption repeatedly created pressure to submit a replacement task, Work, Action or diagnostic path before the original durable identity had been reconciled to terminal/effect truth. Existing tdev/TMCP mechanisms often retained enough identity to avoid duplicate effects, but controller discipline was not reliably enforcing the join before replanning.
- The same class is visible across both canonical tdev operations and TMCP jobs. Therefore the initial hypothesis is not “tdev durability is broken”; it is that the controller can fail to consume durable truth consistently across substrates.

These examples may have different immediate causes. C5 must not force them into one implementation merely because they share an observed controller symptom.

## 3. Scope and non-goals

C5 owns an investigation/campaign boundary, not product semantics.

In scope:

- active-frontier reconstruction after response loss, reconnect, fresh chat or tool/runtime interruption;
- exact reconciliation of already-admitted tdev Work/Action/request/effect identities and TMCP task/job identities before replacement;
- bounded fork/join discipline for genuinely independent lanes;
- explicit supersession/cancellation rules so a replaced lane cannot remain semantically live by accident;
- distinction between historical/open inventory and the exact current objective frontier;
- multi-repository/ref controller scoping after C2-1;
- release/activation drain and other intervals where temporary unavailability is expected but durable work may still be running;
- controller behavior when one tool/backend is unavailable while another durable owner retains the operation; and
- fresh-session recovery that does not depend on prior conversational memory.

Out of scope by default:

- creating another reasoning agent, scheduler, queue or second durable work owner;
- changing tdev concurrency capacity merely to avoid controller bookkeeping;
- implementing C3 bounded ad-hoc execution;
- treating C4 public tool-contract ergonomics as the same problem;
- weakening D0001 request/effect deduplication, D0003 exact integration, or D0006 release recovery so replacement work becomes easier; or
- making TMCP a normal product dependency.

C4 remains the comprehensive final public-contract ergonomics/misuse-resistance audit. C5 is narrower and more fundamental: can the controller preserve and rejoin the correct durable frontier even when the existing contract is technically sufficient? If C5 discovers that public contract ambiguity is a first-order cause, revise the existing owner as needed and let C4 subsequently audit the final surface comprehensively.

## 4. Provisional controller invariants to falsify

Fresh review may revise these, but implementation must not begin by assuming a new coordinator is required.

1. **Durable truth beats conversational state.** Repository/runtime/provider state and retained Work/Action/request/effect or TMCP task/job state are re-read before dependent mutation after interruption.
2. **No replacement before reconciliation.** A timeout, lost response, transient unavailable route or forgotten local variable is not evidence that the original logical operation did not run.
3. **One current frontier per objective.** The controller must be able to name the exact current objective, binding/ref and durable identities that are allowed to advance it.
4. **Inventory is not frontier.** Broad historical `open` results, old evidence and unrelated retained jobs require classification; they do not become active merely because they are nonterminal or visible.
5. **Forks are bounded and explicit.** Every independent lane has a recorded responsibility and durable identity before parallel progress is relied upon.
6. **Join is mandatory before advance.** A phase/checkpoint cannot be declared complete, superseded or replanned while an admitted relevant lane/effect remains unclassified.
7. **Supersession is durable.** If a lane is abandoned, the old durable state is explicitly cancelled/closed/superseded according to its owner contract or retained as unresolved blocker; conversational intent alone does not retire it.
8. **Same-request recovery stays same-request.** Retrying a lost tdev effect or TMCP operation uses its owner-defined same logical identity/readback path rather than a cosmetically similar replacement.
9. **Uncertainty narrows mutation.** When controller convergence is uncertain, default to serial single-frontier work until exact state is rejoined; do not create parallelism to escape uncertainty.
10. **Fresh chats can resume.** Completion may not depend on hidden chat memory, handoff prose or a model remembering which operation was “probably” current.

## 5. C5-1 — fresh incident corpus and falsification

Purpose: determine whether a distinct P0 controller problem still exists on the final post-C2 product.

- Start from verified canonical `main` and freshly bind runtime/provider/tool state.
- Collect only the smallest retained session evidence needed to define the seed cases; do not treat old transcripts as current truth.
- Reproduce or falsify at least: lost response after durable admission, temporary device/runtime unavailability during a retained operation, a long-running TMCP job across conversation interruption, historical open-work backlog, and a bounded multi-lane workflow.
- Separate substrate bugs from controller-consumption bugs. If tdev/TMCP actually loses identity or duplicates effects, route that defect to its existing owner rather than hiding it as a controller issue.
- Record the exact point at which the controller can no longer name or prove the active frontier.

Exit: evidence shows either that C5 is no longer independently necessary, or a bounded controller failure taxonomy exists.

## 6. C5-2 — controller state model and owner classification

For each surviving failure classify what state must be recoverable:

- objective/campaign/checkpoint identity;
- repository/ref/binding epoch;
- Work and current generation/revision;
- Action/request/prepared-result/effect identities;
- release stage/activation identity where applicable;
- TMCP task/job/continuity identity for authorized repair work;
- forked-lane responsibility and join status; and
- explicit supersession/blocker state.

Then determine the smallest existing owner for each required correction:

- D0001 for durable request/action/recovery semantics only if the product state machine is insufficient;
- D0004 for public observation/controller recipes or bounded projections needed by a fresh controller;
- D0003/D0006 only for exact integration/release effect reconciliation defects actually owned there;
- RULE/WORKBOARD navigation discipline for repository development-process invariants where no product semantic change is needed; and
- client/controller procedure only when existing durable/product truth is already sufficient.

Do not invent a new Design solely because C5 exists. Create no new durable frontier registry until evidence proves the existing owners cannot expose/reconstruct the required truth safely.

## 7. C5-3 — minimal enforcement or implementation

Implement only the smallest surviving correction set.

Possible classes, none preselected:

- strengthen D0004 controller recipes so every effectful transition has an explicit rebind/reconcile/join precondition;
- expose a bounded existing-state projection that lets a fresh controller identify the exact active operation without scanning unrelated historical backlog;
- improve same-request/effect observation where current product truth exists but is not retrievable by exact identity;
- add fail-closed admission fencing only if a demonstrable controller error can otherwise create a conflicting logical mutation and the fence does not destroy legitimate independent concurrency;
- encode repository development workflow rules where the defect is in project control rather than product semantics; or
- make no product change if disciplined use of existing durable identities fully solves the reproduced failures.

Do not solve C5 with a second orchestrator, hidden agent memory, unbounded session registry, or mandatory TMCP dependency.

## 8. C5-4 — adversarial cross-substrate recovery

Exercise the selected solution against bounded failures including:

- response loss immediately before and after tdev create/edit/validate/integrate admission;
- response loss around a retained release stage/activation, including the normal drain interval;
- temporary public tdev unavailability while the release/helper or another durable owner continues;
- long-running TMCP `shell.run`/repair jobs with the conversational response interrupted;
- stale historical `open` rows mixed with a small current frontier;
- two repositories/refs with deliberately similar request/objective names;
- bounded independent lanes where one succeeds, one fails and one remains running; and
- an attempted replacement that must first reconcile or explicitly supersede the original operation.

Acceptance requires one logical operation/effect per intent, no lost relevant lane, and no advancement past a nonterminal/unclassified relevant frontier.

## 9. C5-5 — fresh-chat and bounded concurrency acceptance

Run actual controller acceptance from a new chat/session without relying on the campaign's old transcript.

At minimum:

- reconstruct an interrupted tdev operation from current authority and exact durable identities;
- reconstruct an interrupted TMCP task/job from its durable owner when TMCP is authorized;
- perform a bounded multi-lane task, track every admitted lane and join all relevant terminal states before advancing;
- verify a transient runtime drain is not misclassified as proof that the durable operation disappeared;
- show that unrelated retained/open history does not become the current frontier; and
- verify multi-binding repository/ref identity remains explicit throughout recovery.

Use the smallest lane count that falsifies the controller rule; this campaign is not a throughput benchmark.

## 10. C5-6 — closeout and C4 handoff

- Absorb every lasting invariant into its proper current owner: Rule, existing Design, executable source/type/schema/config/test, or current WORKBOARD routing.
- Remove temporary controller probes and narrative state that would become a hidden dependency.
- Re-run a fresh-session recovery smoke without reading this campaign plan.
- Explicitly record which seed observations were reproduced, which were falsified, and which were substrate defects owned elsewhere.
- If C5 required public contract changes, ensure C4 audits the final changed surface rather than the pre-C5 one.
- Route to C4 or the then-current frontier only after WORKBOARD freshly records C5 closeout.

## 11. Entry and routing policy

C5 is not active during C2. C2 retains its own completion criteria and should proceed using the conservative serial controller discipline already sufficient for current convergence unless a controller defect becomes a genuine C2 blocker.

After C2 completes, WORKBOARD performs a fresh post-C2 routing decision before C4. Revalidate C5 against the verified `main` product and actual connected client:

- if the P0 controller failure remains reproducible/material, activate `C5-1` and complete C5 before C4;
- if final C2 state or client/tool changes have already removed the failure, close/defer C5 with evidence and route directly to C4; and
- if only a C4 ergonomics problem remains, do not duplicate it in C5.

Issued C5 IDs remain durable trace identities regardless of the routing verdict.

## 12. Stop conditions

C5 stops only when one of the following is true:

- fresh revalidation shows no independently actionable controller-convergence problem and WORKBOARD records the no-go/defer verdict;
- reproduced controller failures have owner-correct repairs plus adversarial and fresh-chat acceptance demonstrating reliable durable-frontier rejoin;
- a genuine external client/provider/permission limitation blocks further safe testing and is recorded without inventing completion; or
- evidence proves the remaining issue belongs wholly to another current owner/campaign, which then receives the durable fact before C5 closes.

Do not close C5 merely because one lost-response case succeeds, and do not claim success from substrate deduplication alone. The acceptance question is whether the controller reliably finds and joins the original durable truth before replanning.
