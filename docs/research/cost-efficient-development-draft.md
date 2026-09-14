# Cost-efficient development research draft

- Status: **research draft / non-normative**
- Review state: **revised after independent local falsification; still open for further independent review**
- Production authority: unchanged; current accepted Designs remain controlling
- Scope: same-ref development cost amplification first, runtime/provider residual cost later
- Explicit non-decision: this document does **not** authorize production batching, cross-tree validation-receipt reuse, incremental required-validation skipping, a new durable owner/queue, or a public MCP change

This note deliberately separates a research hypothesis from an accepted Design decision. It may be revised, rejected, split, or deleted after independent review. Where this draft conflicts with `DIRECTIVE.md`, `RULE.md`, or an accepted Design, the higher authority controls and this draft is wrong.

## 1. Research question

Can `dev-2` materially reduce the cost per completed development task by removing same-ref stale recomposition amplification while preserving all existing correctness, authorization, isolation, recovery, and canonical-source invariants?

The immediate target is the observed pattern in which N independent same-base candidates all validate successfully, but sequential publication makes the remaining old-head prepared results stale. Each stale work then mechanically recomposes onto the newer head and runs the complete required validation again. With slow full validation this can turn healthy parallel execution into near-triangular repeated work.

The optimization is valuable only if it removes unnecessary work. Making repeated unnecessary work slightly faster is secondary.

## 2. Non-negotiable invariants

Any candidate optimization must preserve at least these properties:

1. exact-base candidate identity and immutable candidate generations;
2. isolated concurrent work rather than one shared writable checkout;
3. complete required validation before canonical mutation;
4. publication of the exact result that was validated;
5. rejection of stale/conflicting results rather than silent overwrite;
6. distinct stable work, action, request, prepared-result, validation, and external-effect identities at their current owners;
7. response-loss/restart deduplication and exact external-effect reconciliation;
8. default concurrency 8 without encoding eight as a semantic maximum;
9. unrelated failure isolation;
10. the canonical Git ref as authoritative external source state;
11. ordinary canonical MCP development without predecessor dependence;
12. no optimization claim derived from omitted correctness work.

A reduction that violates any item above is not a cost win.

## 3. Current bounded evidence

The retained 2026-09-14 one-shot W4 diagnostic used eight independent same-base disjoint-path tasks on one canonical ref under the normal required validation/integration semantics. The initial eight full validations all passed with observed validation overlap 8. Within the fixed 30-minute window, 34 full required validations completed, 34 integration attempts were admitted, six canonical integrations completed, and 27 attempts ended stale/`CONTENDED_REF`; a seventh integration landed just after the deadline. The completed validation spans had median about 140.78 seconds and mean about 151.17 seconds.

That trace is sufficient to motivate a structural amplification hypothesis. It is not a D0007 statistical-superiority proof, and the 34 observed validations are not identical to the closed-form worst/complete sequential model below.

The current test-only composition model represents the complete N-member sequential-recomposition structure as:

- initial candidate validations: N;
- stale recomposition validations: N(N-1)/2;
- total full validations: N(N+1)/2;
- canonical publications/CAS attempts: N.

For N=8 that model is 36 full validations, including 28 stale-recomposition validations, and 8 publications. The experimental structural target is 8 candidate validations + 1 exact composed-result validation + 1 publication: 9 full validations, 0 stale-recomposition validations, and 1 publication.

These counts are protocol-structure quantities, not measured CPU, wall-time, session, Workers, Durable Object, or provider-account cost.

## 4. Hypotheses and current disposition

### H1 - reuse old validation evidence across a different composed tree

Current disposition: **rejected under the current validation identity**.

The accepted validation identity is whole-result sensitive. The exact prepared result tree/commit, policy, execution identity, toolchain/dependency identity, and repository-wide trusted inputs participate in required validation authority. Changed-path disjointness does not prove semantic independence of tests, tools, configuration, generated behavior, or repository-global assertions.

Therefore a candidate receipt for tree U1 cannot authorize a different tree U2. Any future dependency-sliced validation identity is separate Designed work. It must define trustworthy dependency/test-selection invalidation and must itself remain evaluable by the old trusted policy when selectors/controllers/toolchains change.

### H2 - deterministic same-base composition followed by one new exact full validation

Current disposition: **selected research route, not a production decision**.

The safe form does not reuse candidate receipts as publication authority. Candidate validations are only provenance/precondition evidence. Pairwise-disjoint same-base candidate deltas may be deterministically composed off-path, after which the exact composed result gets a new complete required validation. Only that new result could ever become publication-eligible.

The existing pure research primitive already models deterministic membership ordering, exact final-tree equality, late-head rejection, wrong-base rejection, missing-validation rejection, path-collision rejection, and structural cost accounting. It performs no provider effect and owns no durable lifecycle.

### H3 - split required validation into reusable dependency layers

Current disposition: **deferred separate research**.

This can be considered only after structural amplification is either removed or falsified. It changes validation identity/selection semantics and is therefore materially higher risk than H2. It must not be smuggled into H2 as an optimization shortcut.

### H4 - managed session/runtime/provider optimization

Current disposition: **later residual-cost work**.

Session reuse, cold-start reduction, repository/object caching, Git operation reduction, MCP polling reduction, Workers/DO request reduction, and byte reduction should be measured after the dominant structural amplification is addressed or falsified. Otherwise they risk optimizing repeated work that should not exist.

## 5. Draft H2 execution model

This section is a falsifiable research model only.

### 5.1 Bounded membership discovery

The first production-shaped falsifier should only consider already-admitted `integrate` items that appeared in one `dev_work` envelope and are simultaneously eligible. This is a **bounded discovery rule**, not an envelope transaction and not a new public contract.

D0004 currently says envelope items are independently authorized/admitted, sibling failure does not roll back a successful item, order is not a dependency, and there is no envelope transaction or DAG. H2 must preserve that meaning. Same-envelope membership must therefore be opportunistic internal optimization after independent admission, never a new all-or-nothing admission semantic.

Do not wait for a batch to fill. Do not introduce a timer window, batch queue, or coordinator merely to increase group size. If a compatible set is not immediately available, existing per-work integration proceeds.

The same-envelope restriction is intentionally conservative for the first falsifier. A later review may decide that compatible intents across envelopes can be discovered safely, but that is not assumed here.

For the first H2 shape, an `integrate` item that explicitly names `preparedResultId` is excluded from grouping. D0003/D0004 require that explicit result to be reused exactly; substituting a new composed result/commit would violate the caller's exact-result intent. H2 may initially consider only integrate intents that requested preparation/validation without an explicit prepared result.

### 5.2 Member eligibility before composition

A tentative member must independently satisfy existing authorization and intent requirements and must bind:

- the same repository, binding epoch, canonical ref, expected head, and adopted policy;
- the same exact candidate base commit/tree;
- a distinct stable work/action/request identity;
- the selected generation and current expected work revision;
- normal successful candidate validation evidence;
- no pre-freeze cancellation;
- an open/fenced integration action whose identity has not drifted.

Changed-path sets relative to the shared base must be pairwise disjoint, including mode/type and file/directory collision rules. Any ambiguity fails closed to ordinary D0003 per-work handling. There is no ordering-based conflict winner.

### 5.3 Deterministic composition

Membership is ordered by a stable evidence identity, not arrival order. The composition identity binds at least repository/epoch, exact base, ordered member identities, each candidate validation/provenance identity, candidate manifests/changed paths, and the exact composed manifest.

For disjoint deltas, applying the ordered set must produce exactly the same final tree as applying the same member deltas sequentially from the shared base in that deterministic order. Exact final-tree equality is a cheap falsifier; failure ends this route.

The current head must still equal the shared expected base/head at composition eligibility. A late canonical head movement invalidates the optimization. It does not silently rebase the group.

### 5.4 Exact composed-result validation

The composed tree becomes a distinct prepared result with its own immutable result/commit/manifest identity under the current D0003 rules. It must pass the complete current required validation once.

Candidate receipts remain provenance only. They do not make the composed tree eligible. No required profile is skipped because member paths are disjoint.

If composed validation fails, there is no group publication effect. The failure must be preserved as evidence of cross-member or repository-global interaction rather than attributed arbitrarily to one member. Independently valid member works remain recoverable. The safe fallback is the existing per-work path, subject to normal validation/conflict outcomes; the group experiment must not close or silently cancel those works.

### 5.5 Publication-group freeze without a new owner

After successful exact composed-result validation, the research model may freeze one immutable ordered member tuple plus one exact composed publication identity.

One deterministic member action can act as the physical sender/leader, but leadership must grant no new product ownership or authorization. Every original member action remains the distinct authorization/dedup intent for including that work. The leader is an implementation role for one external sender, not a batch Work, scheduler, or second recovery owner.

Immediately before admitting the external effect, all original member fences must still match their frozen work/action/request/generation/revision/prepared-result/candidate-evidence/policy/head identities. If any fence changed before the effect exists, the group is abandoned and ordinary per-work handling resumes.

Independent local falsification reported that the existing repository ledger can read/fence multiple Works/actions and can settle all members inside one transaction: injected process death and SQL-write failure left either zero or all members integrated when the settlement used one transaction. The same review also reproduced a counterexample when members were settled in separate transactions: a crash after the first commit left partial terminal truth. Therefore the research requirement is narrower and stronger: all-member terminal settlement must be one existing-ledger transaction, not a sequence of per-member commits.

This does **not** prove the production H2 runtime join. The review also reproduced that a leader-only effect lookup lets a queued follower cancel terminally and escape the shared recovery fence. Every frozen member's dispatch, cancellation, observation and recovery path must therefore resolve the same immutable publication effect/member tuple. Whether the current engine/recovery join can do that without a new owner remains the next executable falsifier.

### 5.6 One exact publication effect and recovery

The frozen group permits at most one external canonical publication effect for the exact composed commit and expected old head. Membership is immutable from effect freeze onward.

Response loss/restart reconciles only that frozen expected-head/commit/effect identity:

| Authoritative observation | Draft group outcome |
| --- | --- |
| Ref is the composed commit or a verified managed descendant | Finalize all frozen members as integrated from the same publication identity. |
| Ref remains expected head and prior sender is proven stopped | Retry the same sender/effect identity after current authorization/policy checks. |
| Ref remains expected head but sender may still be active | Keep all frozen members nonterminal/uncertain; do not create another sender. |
| Ref is another verified managed descendant of expected head | Give every frozen publication member the same explicit stale/contended publication outcome; member works remain open. |
| Foreign/rewrite/deletion/incomplete trusted ancestry | Fence the affected binding under existing canonical recovery rules. |

Cancellation semantics must distinguish at least three phases: tentative in-memory/member freeze, durable publication-effect intent, and remote acceptance/uncertain dispatch. A tentative freeze alone does not make cancellation too late. Independent local falsification reported that cancellation set after helper freeze but before durable effect storage still passed the current pure fence check, so cancellation/authorization/policy/member fences must be rechecked atomically when the durable effect intent is admitted and again immediately before dispatch as current D0003 requires. Only after the shared effect is durably frozen and remote delivery may have occurred does membership become recovery-immutable; proven integration then yields cancellation-too-late rather than byte removal.

No outcome may produce partial canonical integration because the canonical effect is one whole-tree commit. Equally, local ledger recovery must not report only a subset integrated when the one external effect is proven to include all frozen members.

### 5.7 Failure isolation and bounded coupling

Batching independent work can itself become a source of coupling, so H2 is acceptable only as an opportunistic optimization with a cheap escape hatch.

- A sibling admission failure must not invalidate independently admitted siblings.
- A member becoming ineligible before effect freeze must dissolve the tentative group rather than block unrelated members behind a group lifecycle.
- A composed-validation failure must not destroy member candidates or fabricate a culprit.
- A provider/CAS uncertainty after effect freeze necessarily couples only the frozen members to that one uncertain effect; unrelated works outside the frozen tuple must continue.
- Group formation must not reserve general concurrency while waiting for additional members.
- The initial experiment uses eight members because the observed workload does; production semantics must not encode eight as a fixed group maximum.

The optimization should have a bounded additional hold time: at most the work needed to construct and validate the immediately available exact composition, not an open-ended batching delay.

## 6. Cost model and accounting draft

Use per-completed-task accounting and preserve `unknown` distinctly from measured zero. The current bounded metric surface includes:

- full required validation executions;
- validation CPU time;
- managed sessions and cold starts;
- canonical Git publications/CAS attempts and failed CAS;
- stale recompositions;
- GitHub/provider API operations;
- Workers requests and Durable Object operations;
- request/response bytes and repository source bytes;
- wall time;
- useful versus wasted execution-slot milliseconds.

For the first structural experiment, the primary measured quantities are validation count, stale recomposition count, publication/CAS count, exact final-tree equality, and safety violations. CPU/session/provider/request/byte measurements should be added only where they can be obtained without building a measurement subsystem larger than the optimization.

The diagnostic baseline must distinguish:

1. the theoretical complete sequential structure (for N=8: 36/28/8);
2. the actual bounded W4 trace (34 completed full validations within the fixed window, six completions in-window, seventh just after);
3. any future live experimental trace.

Do not substitute one for another in percentage claims.

## 7. Cheap falsifier ladder

### F0 - pure composition determinism

Use an exact same-base eight-member disjoint fixture. Randomize input order. Require identical composition identity and exact final tree. Reject shared paths, wrong base, late head movement, missing validation, malformed evidence, file/directory collisions, and no-change members.

Expected structural comparison for N=8 is 36 -> 9 full validations, 28 -> 0 stale recomposition validations, and 8 -> 1 publication/CAS, with zero final-tree mismatch. This is a model result only.

### F1 - pure multi-work recovery model

Freeze eight distinct work/action/request intents into one immutable publication identity without creating a synthetic Work. Falsify with member revision drift, generation drift, evidence drift, pre-freeze cancellation, late head movement, duplicate identity, and missing validation.

Replay response-loss outcomes repeatedly and require deterministic all-member projection from the one effect: integrated, retryable, uncertain, stale, or binding-fenced. Replaying the same observation must not create a second publication identity or partial logical completion.

### F2 - existing-ledger atomicity and runtime-join falsifier

Independent local review first reported executable evidence that the existing SQLite ledger can compare multiple member fences and commit all-member settlement in one transaction. Across injected process-death/write-failure points, the atomic form left zero or all members integrated; deliberately splitting settlement into member transactions reproduced partial terminal truth.

A later owner-supplied independent local falsification report states that a **test-only runtime join survived** in the tested same-repository/same-principal scope when it retained the existing Work/action/request/effect owners and added no mutable group lifecycle. The reported join exercised follower cancellation, SIGKILL/restart, unknown-sender recovery, local Git response loss, terminal replay, ancestry uncertainty, fence drift, atomic eight-member settlement and unrelated-work progress. That report is research evidence supplied from an unmerged local branch; it is not canonical repository authority and it does not prove that the current unmodified production runtime already implements H2 safely.

The same report also reproduced unsafe joins. Leader-only effect lookup allowed a queued follower to cancel terminally; reverse lookup without queued leader cancellation/deadline handling still allowed leader-only escape; member-by-member settlement exposed partial terminal truth; overlapping observation during non-atomic settlement exposed inconsistent member completion; the base schema did not by itself prevent duplicate membership under different leaders; and conflating logical sender uncertainty with executor lifetime could retain capacity incorrectly.

F2 therefore survives only with a stricter production-shaped constraint set: every frozen member must be able to resolve the same immutable effect; membership/effect uniqueness must be enforced; queued cancellation and deadline handling must route through shared-effect reconciliation; no-send cancellation must require positive no-launch/all-senders-stopped evidence while preserving member Works/candidates consistently; logical publication-effect/sender identity must remain distinct from physical executor/session lifetime; all member fences must be rechecked at the appropriate effect/dispatch boundary; terminal settlement and externally visible member observation must be transactionally consistent; and a failed grouping discovery, including explicit-`preparedResultId`, capacity or earlier-item constraints, must abandon the optimization before reserving shared resources.

This is sufficient to advance the research ladder to F3. It is **not** a production H2 acceptance result. A later Design revision would still need to select the exact durable lookup/uniqueness/cancellation/deadline/observation semantics and prove that the production implementation matches them.

### F3 - disposable hosted exact-CAS/recovery fixture

F3 is now the next exact falsifier. Exercise a disposable managed ref/hosted fixture with the real expected-old-ref writer and the production-relevant sender/runtime boundary. The highest-value first scenario is old-sender-survival plus response loss: keep the original physical sender alive or plausibly startable, cancel a follower, kill/restart the broker/controller, require every frozen member to rediscover the same immutable effect without a second sender or terminal escape, then use independent canonical accept/readback and positive-stop evidence to obtain one consistent all-member outcome.

The fixture must retain the same correctness boundary as F2: exact validated composed result, immutable membership, one logical publication effect, explicit distinction between sender uncertainty and executor/session state, atomic all-member terminal settlement, terminal replay, ancestry-uncertainty preservation, and no unrelated-work fencing. Verify exact commit/tree, descendant reconciliation, stale behavior under a competing managed descendant, cancellation-too-late only after remote-effect possibility, and no duplicate effect after restart.

Do not use the canonical product ref merely to prove the research mechanism if a disposable authoritative fixture is sufficient.

### F4 - bounded live cost comparison

Only after the correctness falsifiers pass, compare the current sequential path with the experimental path on the same-base/disjoint eight-way workload under equivalent required validation. Record the full R1 metrics that are cheaply observable.

The first comparison is for structural amplification removal, not D0007 statistical superiority.

## 8. Draft promotion gates

These are research gates, not accepted production criteria.

For the eight-way same-base disjoint workload, a candidate H2 implementation should show the following against the **matched measured A-path comparator**, while the 36/28/8 model remains a structural diagnostic rather than the denominator for live performance claims:

- at least 50% fewer full required validation executions than the matched measured current path, or else an explicitly justified revision of this draft gate if the matched baseline cannot structurally reach that reduction;
- at least 75% fewer stale-recomposition validations against that measured comparator;
- at least 50% fewer Git publication attempts and separately reported CAS attempts;
- a meaningful managed CPU or wall-time reduction when those quantities are measured;
- exact final-tree equality;
- zero invalid integration, lost update, silent conflict, wrong-base publication, unvalidated byte, duplicate canonical effect, request/recovery identity break, or partial terminal settlement;
- no new durable owner/queue unless separately Designed and justified by measured value;
- no degradation of unrelated-work progress under cancellation, validation failure, provider uncertainty, or stale competition.

A pass would justify drafting a D0003-owned production Design revision. It would **not** make this research note authoritative by itself.

## 9. Explicitly rejected shortcuts in this draft

The following do not qualify as H2:

- treating pairwise disjoint paths as permission to reuse a receipt for another tree;
- publishing a composition that has not itself passed all current required validation;
- replacing member request/action identities with one synthetic batch request;
- creating a mutable batch Work simply to simplify implementation;
- waiting on a timer or queue to fill batches in the normal path without measured need;
- allowing arrival order to select conflicting bytes;
- partially settling only some frozen members after one whole-tree commit is proven integrated;
- retrying with a newly generated commit/effect after an uncertain sender;
- weakening CAS, append-only lineage, authorization, policy, or old-policy validator evaluation;
- claiming the structural count reduction as measured CPU/provider cost or D0007 superiority.

## 10. Open design questions for independent review

1. **Production mapping after test-only runtime-join survival:** Independent local falsification reports that the existing ownership model can survive the member-aware runtime join when follower reverse lookup/uniqueness, queued cancellation/deadline routing, sender-versus-executor distinction, atomic settlement and transactionally consistent observation are enforced. Which exact existing records/indexes or minimal D0001/D0003 schema revisions would be required to make those constraints production semantics without creating a new mutable group owner?
2. **D0004 compatibility boundary:** Local falsification supports same-envelope discovery after independent admission when explicit-`preparedResultId` intents are excluded and grouping failure happens before reservation. Does the later production shape preserve that result under hosted restart, fairness, deadline and fallback behavior without creating an implicit envelope transaction?
3. **Group membership identity:** Is binding work/action/request/generation/revision/prepared-result/candidate validation/manifest sufficient, or must additional authorization-capability digests be frozen explicitly?
4. **Composed-result provenance:** Should the prepared result or commit metadata bind the publication-group identity directly, or is durable ledger linkage sufficient? Adding commit metadata would itself be a D0003 contract change.
5. **Composed validation failure:** Should fallback begin immediately for all original works, or should the failed combined result be surfaced for ChatGPT inspection first when failure suggests semantic interaction?
6. **Cancellation after composed validation but before effect freeze:** Can one cancelled member be removed and the remainder recomposed/revalidated, or should the whole tentative group dissolve to per-work behavior? The simpler fail-closed answer is currently preferred but not selected.
7. **Authorization/policy drift:** Which checks must be repeated at composition, after validation, at effect freeze, and immediately before sender dispatch to remain equivalent to current per-work integration?
8. **No-wait grouping:** Is one-envelope-only enough to capture material W4 savings in practice, or would it leave most compatible intents in separate calls? Do not answer this by adding a coordinator before measuring actual admission shape.
9. **Group-size policy:** The research fixture uses eight, while the MCP envelope allows up to 64 and architectural concurrency is not capped at eight. What resource-based upper bound, if any, is justified for one composed validation/publication?
10. **Failure attribution:** How should evidence distinguish a composition-wide validation failure from a member-local candidate failure without inventing unsupported blame?
11. **Fairness:** Could repeated opportunistic grouping of immediately available work delay older standalone integration intents or change deterministic dispatch fairness?
12. **Provider cost:** After publication collapse from N to 1, which residual costs actually dominate: validation sessions, cold starts, repository transfer, Git object construction, GitHub API, Workers/DO traffic, or MCP observation?
13. **Cross-envelope extension:** If same-envelope H2 works, is extending compatible membership across envelopes worth the ownership/recovery complexity, or does it recreate the queue/coordinator intentionally avoided here?
14. **Production fallback observability:** What minimum trace should prove that group ineligibility really fell back to ordinary D0003 rather than silently dropping or reordering a member?

## 11. Proposed review order

Independent review should not start from implementation convenience. Review in this order:

1. try to falsify exact-result correctness and cross-tree validation assumptions;
2. try to falsify compatibility with D0001 action/work ownership and D0004 independent envelope items;
3. try to construct response-loss/restart/cancellation histories that yield duplicate or partial effects;
4. verify unrelated failure isolation and absence of hidden batching waits;
5. only then judge whether the structural savings justify a production Design revision;
6. only after structural savings survive, inspect session/runtime/provider residual costs.

## 12. Independent local falsification revisions

Independent local reviews supplied by the owner now report two successive outcomes: first `draft survives with required revision`, then `F2 runtime join survives / draft survives with further revision`. These reviews are evidence, not repository authority, and their unmerged local evidence branches have not been treated here as canonical state. This draft incorporates only the constraints consistent with the current authoritative Designs and uses the reported PASSes narrowly at the layers exercised.

- H1 remains rejected under the current whole-result validation identity.
- F0 composition survived randomized/permutation and real-Git tree comparison, but the research helper itself is not a trusted evidence verifier: duplicate validation IDs, descriptor/base authenticity and truthy validation flags require trusted-boundary checks, and helper-generated pseudo tree OIDs are not provider Git-object proof.
- F1's pure model remains insufficient by itself, but the later runtime-join review reports executable terminal replay and ancestry-uncertainty coverage in the test-only join.
- Existing-ledger multi-member atomic settlement and a member-aware test-only runtime join now have positive local evidence without a new mutable group owner. That survival depends on constraints absent from a naive/default join: follower reverse lookup and uniqueness, queued cancellation/deadline routing through the shared effect, no-send proof, sender/executor distinction, all-member fence rechecks, transactionally consistent observation and one atomic terminal settlement.
- Leader-only effect discovery, per-member settlement, queued leader cancellation/deadline escape, duplicate membership under different leaders, inconsistent observation during non-atomic settlement, and sender/executor conflation remain demonstrated unsafe shapes.
- Explicit `preparedResultId` intents remain outside the first grouping shape, and grouping ineligibility must be discovered before shared reservation so sibling admission semantics stay independent.
- The reported fairness checks cover unrelated/older/additional work under the exercised uncertain-group fixture; statistical starvation under unbounded arrivals remains unproven.
- F3/F4 methodology must count publications separately from CAS attempts and include queue/startup/fetch/object/transfer/billing/reconciliation/polling costs where material. Structural 36/28/8 versus 9/0/1 remains a model, not measured provider/CPU savings.

The next exact falsifier is now **hosted F3 old-sender-survival plus response loss** on a disposable authoritative fixture. Preserve an original sender that is alive or plausibly startable, cancel a follower, kill/restart the broker/controller, require all frozen members to rediscover the same logical effect without terminal escape or a second sender, and settle only from independent canonical accept/readback and positive-stop evidence. The hosted test must distinguish logical publication uncertainty from physical executor/session lifetime and must not convert unavailable evidence into stale/success.

## 13. Current draft conclusion

The strongest current direction remains **not** validation reuse. It is deterministic composition of already validated same-base disjoint candidates, followed by **one new full validation of the exact composed result**, one immutable member-aware publication effect, and one exact canonical publication with atomic all-member reconciliation.

The pure composition model makes the structural savings plausible. Successive independent local falsification reports now provide evidence that the existing ownership model can support both atomic multi-member settlement and a constrained test-only engine/cancellation/recovery join without introducing a new mutable group owner. They also narrow the required shape substantially: reverse member-to-effect discovery and uniqueness, phase-correct cancellation/deadline routing, positive no-send proof, sender/executor separation, transactional observation/settlement, and pre-reservation fallback are not optional implementation details.

This still does **not** establish that the current unmodified production runtime implements H2 safely, nor does it prove hosted response-loss/restart correctness or measured wall/managed/provider savings. F3 is now ready as the next correctness gate; F4 remains after F3. Until those gates pass and a later D0003 Design revision is independently reviewed and accepted, production integration semantics remain unchanged.
