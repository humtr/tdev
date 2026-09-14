# H2 production Design review and canonical handoff

This is non-normative source inspection and adversarial reasoning, not an executed H2 implementation test, deployed capability, or production validation receipt. Decision owner: [D0003](../../design/D0003-validation-exact-integration.md).

## Scope and authority

Local Codex fresh-fetched `origin/dev-2` at `b224f36356c5d33c2763a02c5ed4689c58e9b71a` (parent `a4bdf6eba8de16b8d6863231ba49d11116cdac59`, tree `1795b2baf40410a1d45614b8f4a66411c6491ccf`) and reviewed AGENTS, DIRECTIVE r5, RULE, WORKBOARD and D0001-D0008. It inspected the current ledger/object store, Work coordinator, runtime engine/recovery/application/native path, integration prepare/effect/sender/git-ref boundary, validation receipts/production binding/policy, authorization, contracts, release authority and native Git sender. The separately published review commit was `5045ce79dbefb96be2b22a56d366b72b2686249f` on `codex/d0003-h2-production-promotion-20260914-review`; canonical `dev-2` remained unchanged during that local review.

F3 evidence (`docs/evidence/cost-hosted-f3-falsification-20260914/`) and F4 evidence (`docs/evidence/cost-live-f4-falsification-20260914/`) were consumed without rerunning either experiment. F3 remains constrained recovery/sender evidence. F4 remains bounded live-cost evidence: 9 full validations, 0 stale recomposition validations, 1659.647 s aggregate wall/slot proxy, one exact expected-old CAS effect, authoritative intended-result readback, exact cleanup and no canonical contamination. Historical W4 comparisons are descriptive, not D0007 superiority proof; CPU, network bytes, session/cold-start and Workers/DO/MCP attribution remain unknown.

## Source feasibility findings

The current SQLite WAL/FULL ledger can update multiple Work/Action records in one synchronous transaction, and `settleIn` already combines terminal Action and Work disposition changes. Current prepared/effect lookup, engine settlement and recovery are single-member and therefore need follower-aware extensions rather than a second owner. Durable sender invocation plus the native OS lock already supplies the no-duplicate-sender recovery primitive. Cancellation is durable Action metadata and terminal integration requires effect reconciliation plus stop proof. The Design therefore selects extension of existing D0001/D0003 ownership rather than a synthetic Work, mutable batch lifecycle, queue or coordinator.

The review identified and closed eleven design hazards: explicit prepared-result substitution, async authorization revocation race, mixed observer projections, follower recovery/cancellation splitting, capacity reservation ambiguity, nondeterministic seed/timestamp choice, sender-size overflow, reconciliation after principal revocation, old-reader adoption of H2 state, accidental ordinary reuse of an H2 seed, and nondeterministic choice among multiple eligible receipts.

## Adversarial traces

The review traced sixteen required schedules. These are reasoning verdicts; production fault injection remains required.

| Case | Required outcome | Review |
| --- | --- | --- |
| 1. Member cancels immediately before freeze | Whole freeze rolls back; no effect/prefix attachment; survivors keep ordinary path. | coherent |
| 2. Member generation/revision changes before freeze | Whole freeze fails; no prefix publication; evidence retained. | coherent |
| 3. Policy changes after composed validation | No send before final gate, or frozen never-sent effect is disarmed as one tuple; stale receipt not reused. | coherent |
| 4. Authorization revoked before dispatch | No send before final gate; after remote-possible only reconcile, never erase uncertainty. | coherent |
| 5. Crash immediately after atomic fencing | Exact tuple/effect remains durable and nonterminal; restart adopts tuple, not members independently. | coherent |
| 6. Crash after effect persistence before sender starts | Same effect retained; inspect/fence original invocation before any safe sequential retry. | coherent |
| 7. Provider accepts C but response is lost | All members remain nonterminal until authoritative readback and stop proof, then settle integrated atomically. | coherent |
| 8. Old sender running or unknown | No replacement sender; tuple stays blocked/open while unrelated work may continue. | coherent |
| 9. Another managed child advances H first | Entire tuple receives CONTENDED_REF after stop; all Works stay open with evidence. | coherent |
| 10. Readback is verified managed descendant of C | Entire tuple integrates together; original C remains integratedCommit. | coherent |
| 11. Crash during member settlement | SQL rollback gives 0/N or commit gives N/N; never a durable partial terminal subset. | coherent |
| 12. Duplicate request/retry | Existing Actions/effect are returned by dedup; no re-enrollment or new R/E. | coherent |
| 13. Follower observation races settlement | One response sees one ledger snapshot; separate calls may straddle commit but no mixed tuple projection is manufactured. | coherent |
| 14. Unrelated same-ref Work advances while shared effect unresolved | No branch-global lock; remote CAS determines genuine stale/integrated order. | coherent |
| 15. Foreign rewrite/exclusive-writer loss | Binding effects are fenced and tuple stays blocked pending authorized epoch reconciliation. | coherent |
| 16. Optimization precondition fails | Before shared effect, ordinary per-work fallback preserves original intents/evidence; after effect, reconcile/disarm first. | coherent |

No known Design-level correctness blocker remained after the second pass. This is not proof that implementation matches the contract. Production join tests, native multi-member transaction size/latency, rollback/disk-pressure behavior, client projection transcripts and live H2 end-to-end acceptance remain unexecuted.

## Local validation audit

The local review branch changed only `WORKBOARD.md`, D0001, D0003, D0004 and this evidence document. No source, tests, scripts, dependency lock, runtime state or provider configuration changed. Local native Termux checks reported:

- `npm ci --ignore-scripts --no-audit --no-fund`: PASS
- `python docs/design/check.py --write-index`: PASS; INDEX unchanged
- `python docs/design/check.py`: PASS
- `npm run check`: PASS
- `git diff --check`: PASS
- core: 201 PASS
- integration: 217 PASS, 1 SKIP, 0 FAIL

The one skip was the Android hard-link fixture restriction and is not relabeled PASS. Local validation is supporting evidence only; current canonical integration still requires the authorized tdev validation receipt.

## Canonical review conclusion

Current canonical review independently rebound the same exact base and found the local branch one commit ahead with only the five documented Markdown paths changed. The normative decision remains bounded to D0003: same-envelope/same-principal, exact same base/head, deterministic immutable tuple, separate complete composed validation, one leader-anchored exact expected-old CAS effect, atomic whole-tuple fencing and settlement, tuple-aware cancellation/recovery, final current-policy/authorization gate, stale all-member outcome, unrelated-work isolation and existing per-work full recomposition/full validation fallback. D0001 and D0004 only carry ownership/projection cross-references. Public schema, source implementation, migration and activation remain unchanged.

## Implementation frontier (not performed)

A separately authorized implementation should begin with versioned H2 record/reference support and the ledger reader gate, immutable tuple objects, and real SQLite atomic helpers. First fencing test: N=8 with member 8 cancelled or revised immediately before effect transaction must persist zero shared effects and zero partial attachments. First settlement/recovery test: crash after every member write and reopen real SQLite; observe only 0/8 or 8/8, one original effect and the same leader invocation. First fallback test: explicit preparedResultId, overlap, ineligible member or post-freeze stale CAS must preserve ordinary exact-result/full-validation semantics. Keep selection disabled until production acceptance and D0006 compatibility/release gates pass.
