# H2 production Design review and canonical handoff

This is non-normative source inspection and adversarial reasoning, not an executed
H2 implementation test, a deployed capability or a production validation receipt.
Decision owner: [D0003](../../design/D0003-validation-exact-integration.md).

## Fresh binding and scope

Fetched origin (https://github.com/humtr/tdev.git), canonical dev-2, before work.
Starting HEAD b224f36356c5d33c2763a02c5ed4689c58e9b71a; parent
 a4bdf6eba8de16b8d6863231ba49d11116cdac59; tree
1795b2baf40410a1d45614b8f4a66411c6491ccf. The starting local tracked tree matched
canonical with ahead/behind 0/0, but the original checkout contained unrelated
untracked research/runtime files. They were left untouched. A clean separate
worktree and branch codex/d0003-h2-production-promotion-20260914-review were created
at that exact fetched HEAD. No runtime/provider configuration or credentials were
read as product authority; repository/provider IDs in F3/F4 remain historical
experiment bindings, not a new live installation attestation.

Consumed current AGENTS, DIRECTIVE r5, RULE, WORKBOARD, Design README/INDEX and
D0001 through D0008. Source inspected: storage/ledger and immutable object contract;
work/coordinator; runtime/engine, recovery, application, native; integration/prepare,
effects, sender, git-ref, github-boundary; validation/receipts, production-binding,
policy; security/authorization; contracts/ports.d.ts; tools/git-sender.py;
release/authority; package.json, tools/check.mjs and tools/validate.mjs.
D0003 identifies the concrete findings and prospective source changes.

Evidence consumed: F3 README.md, A3.md and experiment-a3.json; F4 README.md,
fixture.json, provider-publication-measurement.json, final-verdict.json and
provider-publication-blocker.json. F3 proves the constrained three-member native
recovery/sender path. F4 measures eight member validations plus one complete
composed validation and one fixed disposable CAS; its separate composed Work is
fixture scaffolding, not production ownership. No F3/F4 experiment was rerun.

## Review method and first-pass defects

After source feasibility analysis and drafting, a separate adversarial reading
traced the schedules below against actual transaction, sender and controller
assumptions. No sub-agent or external reviewer was used. These are reasoning
verdicts; production fault injection is still required.

The review identified and resolved these design hazards:

1. Explicit preparedResultId substitution would violate exact C reuse. Excluded
   explicit-R items from H2 and preserved their ordinary path.
2. Awaited authorization leaves a revoke/adoption gap. Added a current authority
   stamp and synchronous final launch gate after asynchronous preflight.
3. SQLite atomic writes alone do not prevent mixed response projections: current
   observe reads across awaits. Required one snapshot for mutable response state.
4. Followers have no physical attempts; generic missing-attempt recovery and queued
   cancellation could split the group. Required running selection references,
   leader-only reservation, tuple-aware cancel/recovery and atomic follower updates.
5. A capacity-unavailable selected group could invent another waiting lifecycle.
   Selection now reserves the leader atomically or declines optimization entirely.
6. Random seed/timestamp generation would not be permutation-stable. H2 gets a
   versioned deterministic result ID and member-derived frozen commit timestamp.
7. A 2 MiB effect could exceed the Python helper's 64 KiB reader. Tuple/deltas live
   in immutable objects; effect contains bounded digest references only.
8. A revoked principal could strand already-published bytes if all recovery required
   new integration authorization. Internal reconcile/settle does not authorize a
   send and remains possible; public access is still independently authorized.
9. Old code would misread new follower records. Required SQLite user_version 2
   before H2, with old readers refusing it and no rollback across pending tuples.
10. Pre-effect fallback could accidentally reuse a composed preparation seed for a
    single Work. Added a distinct H2 seed and atomic retirement of selection refs,
    with ordinary original-intent requeue only after positive execution stop.

11. Multiple eligible receipts for one result need a deterministic tie-breaker.
    Final review added ascending resultId, then ascending runId, frozen against
    later receipt arrivals; this avoids retry/arrival-order tuple drift.

## Trace conventions

Every case uses N=8 as an example, not a semantic ceiling. All durable ownership
and recovery below is the existing repository SQLite owner; physical leader L is
first in ordered tuple M and has no product authority over followers. R/C/E and
M are immutable once persisted. Before selection M is absent; after selection it
is retained even if no E is created. Physical sender count means concurrent live
or possibly live invocations, never a claim that safe sequential retries are zero.

All rows use original per-member principal/epoch/requestId/intentDigest on duplicate
request; recovery uses original M/R/C/E and retained L attempt/invocation. A changed
intent needs a new request. Cancellation flags remain per Action. Terminal updates
are all-member SQL transactions, and one response uses one SQL snapshot: partial
terminal settlement is **forbidden in every row**. Observations occur outside SQL;
application compares the complete frame again before committing.

## Second-pass adversarial traces

| Case | M / logical E / physical sender | Action and Work outcome | Provider reconciliation / cancellation / fallback | Verdict |
| --- | --- | --- | --- | --- |
| 1. Member cancels just before effect freeze | Selected M retained; E=0, sender=0 | Freeze rolls back. Cancelled Action cancels after stop; other Actions return to ordinary dispatch, all Works preserve candidates/open state. | No publication. Durable cancellation wins the atomic fence; no member receipt overrides it. Ordinary original-intent fallback for survivors. | Coherent |
| 2. Generation/revision changes before freeze | M mismatch; E=0, sender=0 | Entire freeze fails, no prefix gets effect. Retain candidate evidence; original stale intent cannot be silently repaired. | No publication; fresh ordinary intent if needed. Cancellation retains its own semantics. Unexpected fenced mutation is also an integrity investigation. | Coherent |
| 3. Policy changes after composed validation | M/R unchanged; E=0 or 1 frozen; sender=0 before gate | Decline before E, or disarm frozen never-sent E for all; Works remain open. | Stamp mismatch prevents dispatch. Do not reuse old-policy receipt. If reservation already crossed, use uncertain/reconcile branch, never erase it. | Coherent |
| 4. Authorization revoked before dispatch | M retained; E=0 or 1; sender=0 if final gate has not crossed | No send. All members released together after no-send/stop proof; revoked intent cannot fallback without current grant. | D0005 current grant intersection, not retained assertion. After remote-possible, internal reconcile is still allowed; success means integrated, not rollback. | Coherent |
| 5. Crash immediately after atomic fencing | Exact M/E=1 durable; sender=0 or reserved unknown | All Actions/Works remain nonterminal; new ledger observer adopts tuple, not separate members. | Inspect retained sender selection; if absent, no send yet. Recheck every grant/policy/cancel before same-E dispatch. | Coherent |
| 6. Crash after E persistence before sender starts | M/E=1; physical sender 0, reservation may exist | All remain nonterminal until exact invocation is inspected/fenced. | Helper lock proves never-started stop; late launcher is fenced. At H same E may retry only if all eligible, otherwise all disarm. | Coherent |
| 7. Provider accepts C, response disappears | M/E=1; sender at most 1 | All blocked while outcome/stop unknown; then all succeeded/integrated atomically. | Authoritative C/managed descendant plus stop. Any retained cancellation yields too-late on success. No fallback/new effect. | Coherent |
| 8. Old sender still running or status unknown | M/E=1; possible sender=1, new sender=0 | All stay blocked/open even with positive ref evidence until stop proof. | Logical retries inspect/reconcile; no timeout-based reinvocation. Cancellation can signal exact sender, cannot change M. Unrelated Works continue. | Coherent |
| 9. Another managed child advances H before C | M/E=1; at most 1 existing sender | After stop all Actions failed CONTENDED_REF, all Works open, no member evidence discarded. | Verify managed descendant excluding C; old-H CAS cannot overwrite it. All same stale outcome, even a cancelled member. Fresh per-work full recomposition/validation. | Coherent |
| 10. Readback is managed descendant of C | M/E=1; at most 1 until stop | All succeeded/integrated together after stop, exact C remains integratedCommit. | Verify every relevant managed lineage segment; descendant head is observation only. Cancellation too late where retained. No revalidation of descendant on behalf of M. | Coherent |
| 11. Crash during settlement write 5 of 8 | M/E=1; sender stopped=0 live | SQL rollback leaves 0/8 terminal, or committed transaction has 8/8. Recovery repeats same frame/outcome. | Reobserve C/lineage as needed. All cancel-too-late flags/projections commit with Work states. Never repair by inventing remaining members. | Coherent |
| 12. Duplicate request or retry delivery | Same M/E=0 before effect or 1 after; at most 1 sender | Dedup returns original Actions, including terminal receipts, before stale-precondition rejection. | No re-enrollment, new R or E; original current authority checked. Changed digest is IDEMPOTENCY_MISMATCH. No extra fallback action inferred from timeout. | Coherent |
| 13. Member observer races settlement | Same M/E=1; no sender created | One response sees pre-commit all nonterminal or post-commit all terminal for included members. | Authorization/readback first, then SQL snapshot; follower resolves common R/E. Separate calls/pages can straddle commit. Cancel remains durable per-member fact. | Coherent |
| 14. Unrelated same-ref Work advances while E unresolved | M/E=1 plus unrelated own effect; at most 1 sender per effect | M remains fenced only locally; unrelated Work keeps normal states/progress. | If M wins, unrelated old-H CAS stales; if unrelated wins M stales; unrelated may extend C before M settles. No global queue/mutex. | Coherent |
| 15. Foreign rewrite/exclusive-writer loss | M/E retained; no new sender permitted | All tuple members blocked; affected binding canonical effects fenced, no false success. | Ancestry alone is insufficient. Authorized epoch reconciliation required; ordinary fallback cannot bypass fence. No automatic reset. | Coherent |
| 16. Optimization precondition fails | M absent or retired; E=0; sender=0 | Original admitted Works/actions/evidence remain; safe original-intent ordinary path or explicit stale/validation failure. | No selection waiting or hidden rebase. If E already exists this is reconciliation/disarm, never precondition fallback. | Coherent |

For cases 3/4, revocation after remote-possible does not retroactively undo remote
bytes. For cases 5/6, positive not-started fencing defeats a delayed old launcher;
new invocation means a safely sequential physical retry of the same E. For cases
7/10/11, terminal success awaits stop because the current D0001 implementation
requires it. For cases 1/2/16, no shared logical canonical effect exists.

## Remaining unknowns and bounded acceptance

No known correctness blocker remains in the contract after this pass. This is
not proof that a future implementation matches it. Production joins, actual
multi-member native transaction latency/size, rollback/disk-pressure behavior,
client projection transcripts and live H2 end-to-end acceptance remain unexecuted.
F3/F4 do not cover those joins; D0003 lists their mandatory tests. CPU, transfer
bytes, session/cold-start and Workers/DO/MCP attribution remain unknown. Cross-
envelope/principal grouping is expressly outside the accepted selection.

## Canonical handoff

1. Fresh-bind origin/dev-2, AGENTS -> DIRECTIVE -> RULE -> WORKBOARD and selected
   Design owners; do not treat the recorded base/runtime values as current truth.
2. Fetch the published codex/d0003-h2-production-promotion-20260914-review branch;
   verify the exact final commit/tree supplied by the local session report.
3. Compare new canonical changes with this base, especially D0001/D0003/D0004,
   ledger, controller, authorization and native sender changes. Re-review material
   differences; do not overwrite new canonical authority from a stale checkout.
4. Through ChatGPT + authorized tdev workflow, create isolated exact-base Work and
   import/apply only this branch's Design/document delta. Do not assume @tdev or
   prepared-result integration tools existed in this local Codex session.
5. Run current required tdev validation on that exact result; local test evidence
   is not a substitute for its production receipt.
6. Integrate the exact prepared result through the authorized workflow; explicit R
   must be preserved. No direct canonical Git push or ref reset.
7. Read back canonical commit/tree and the original Work/Action/effect terminal
   projection. Record actual integration SHA separately from the branch SHA.
8. Stop before H2 source implementation, migration, rollout or activation unless
   the owner separately authorizes that next session.

## Implementation frontier (not performed)

Start with the internal typed H2 extension and ledger user_version 2 reader gate,
immutable tuple object references, and atomic helper predicates in ledger/coordinator.
First fencing test: eight current Actions with member 8 cancelled/revised immediately
before effect transaction must persist zero effects and zero partial attachments.
First settlement/recovery test: crash after each member write and reopen real SQLite;
observe 0/8 or 8/8, one original E, same leader invocation, and no follower dispatch.
First fallback test: explicit R or overlapping paths uses ordinary exact-result
semantics; a post-freeze stale CAS settles all contended before fresh per-work
recomposition/full validation. Add follower-only observation and response-race tests.
Affected modules and full proof matrix are D0003-owned. Keep selection disabled;
D0006 rollout must reject old readers while H2 state is pending. No activation in
this Design session or automatically upon canonical document integration.

## Local validation and publication audit

Final Design inputs passed native Termux validation (Android arm64, Node 24.18.0,
SQLite 3.53.4, Git 2.55.0). Exact commands:

- `npm ci --ignore-scripts --no-audit --no-fund`: PASS, locked dependency preparation only.
- `python docs/design/check.py --write-index`: PASS; derived INDEX unchanged.
- `python docs/design/check.py`: PASS.
- `npm run check`: PASS; invokes core and integration via `tools/validate.mjs`.
- `git diff --check`: PASS.

core: passed, 22673 ms, counts `{"cancelled": "0", "fail": "0", "pass": "201", "skipped": "0", "tests": "201"}`. Result-file SHA-256 `fb2a49f941d6fae87a849d1cf544f170434222f2d18213053eb7f2ddc2edfe3d`.

integration: passed, 91053 ms, counts `{"cancelled": "0", "fail": "0", "pass": "217", "skipped": "1", "tests": "218"}`. Result-file SHA-256 `c4a1cee66ce802cbdaf22a258963c388a88a88fad15a1382101931bb2f259da3`.

Both final profiles bind input digest
`sha256:1dc92a31745fd4e43668ba72689cc6a9b370aefc6687e7df9bf4be50d9aeb0ca`.
Core includes the complete required JSDoc/typecheck and Design checks. No separate
redundant `npm run typecheck` was needed. Both complete profile runs passed before
and after the final deterministic receipt tie-break correction; no failing run.

One integration test is explicitly skipped: hard-link dependency artifact rejection,
because native Android forbids fixture hard-link creation; hosted Linux must run
that check. This cell is not PASS. Release/live/benchmark profiles, F3/F4 reruns,
D0007 cohorts, physical Android disruption and production H2 join tests were not
run: outside this Design-only scope, and H2 source is not implemented.

Raw local logs/results remain ignored under .artifacts; no binary, runtime state,
credential or raw log is included in the commit. This audit appendix is outside
the controller inputIdentity source inventory; the final document/link checker
is rerun after adding it. Only five Markdown documents change. D0001/D0003/D0004
retain accepted metadata, dependencies and ownership labels; INDEX is unchanged.
WORKBOARD changes routing only, not its authority role. AGENTS/DIRECTIVE/RULE are
unchanged. No source, tests, scripts, dependency lock or provider configuration changes.

Before commit, fresh origin/dev-2 remained
b224f36356c5d33c2763a02c5ed4689c58e9b71a. Final commit/tree and remote branch
readback are supplied in the session report to avoid a self-referential commit ID.
Canonical dev-2 is never a push destination in this session.
