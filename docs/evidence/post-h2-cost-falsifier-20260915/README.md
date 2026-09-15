# Post-H2 completed-development cost falsifier — 2026-09-15

Status: bounded production-path diagnostic. This is **not** a D0007 statistical-superiority PASS and is not a large benchmark cohort.

## Bound starting state

The run rebound current `dev-2` at:

- canonical HEAD `1fb42cad9327b54c6ddf04baa3250b1bd3da7e3f`;
- tree `9eeecdacda610be33a100b6fdbd8a85b5771a65a`;
- manifest `sha256:2853d3e997bb76dc2be5ba13eafdf793e457ad8d27e274c981e055fb381e9f99`;
- policy `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`;
- active production release `sha256:b737132aff700c2a068a9d1de577a8a7b110b158bfa0ee2c3e8ff12b4591beee`;
- Android/edge source `3e85665a46b4ead17f8bc0302a3a0cc7507c151a`, Android owner epoch 44; and
- qualified, sealed, accepting runtime with H2 production selection enabled.

## Workload and method

The cheap falsifier used `N=3` independently admitted Works from the same exact base/head. Each Work added one distinct evidence-marker path (`member-a.md`, `member-b.md`, `member-c.md`), so the deltas were pairwise disjoint and intentionally changed no product behavior.

All three candidate results first ran complete required validation in parallel. After all three receipts were eligible, three `integrate` intents with no explicit `preparedResultId` were admitted in one envelope against the same expected head. This exercises the production H2 selection shape without constructing a large cohort.

The later documentation convergence that writes this README and updates `WORKBOARD.md` is outside this falsifier's cost counts.

## Measured production-path result

Candidate required-validation executions:

| Member | Duration | Result |
| --- | ---: | --- |
| A | 150.393 s | PASS |
| B | 153.318 s | PASS |
| C | 191.528 s | PASS |

H2 then selected the three integrate actions into one composition. All members exposed the same composed result ID `8e439d3f9ffc1810a007199292eb29dc1ebc9b81111664438a05ac81cb5f0878`; only the physical leader carried validation attempt 1 while the two followers carried attempt 0.

The exact composed result ran one additional complete required validation in 109.170 s and passed. Its validation ID was `sha256:7ac0aba6d2af340c26ed773dafb3914e33f9f40e72a9de649a87f4d51a8e171e`.

The resulting canonical effect was singular:

- effect ID `7c4f22bae493c0925013e6d6b879ed1e2c057f185eb56b67851f90a1636a7f8b`;
- composed commit `0f9e7f5310903b9a2c942690c5aee695ed0af68a`;
- composed tree `0325f24bd6e91af8821e3fecc3c301ac8a72b2f1`;
- composed tree manifest `sha256:419ee5b4c17574f2cae7e000734301936130054f1e68f680bf730841cee88fb1`; and
- all three Works settled `integrated` atomically against that same commit.

Observed structural/accounting quantities for this run:

| Quantity | Measured |
| --- | ---: |
| Completed Works | 3 |
| Full required-validation executions | 4 (3 member + 1 composed) |
| Stale recomposition validations | 0 |
| Canonical publication effects | 1 |
| Validation retries | 0 |
| CONTENDED_REF outcomes | 0 |
| Aggregate validation slot time | 604.409 s |
| Earliest member-validation start to composed-validation end | 322.952 s |
| Create-receipt observation to canonical integration readback | about 342.046 s |
| Manual intervention during the admitted run | 0 |

The wall figures are bounded MCP-observation diagnostics, not preregistered benchmark latency statistics.

## Structural-model comparison

For `N=3`, the retained ordinary full-recomposition model predicts `N(N+1)/2 = 6` full validations, `N(N-1)/2 = 3` stale recomposition validations, and 3 publications. The actual H2 production-path run produced 4, 0, and 1 respectively.

Relative to that **structural model only**, this is 33.3% fewer full validations, 100% fewer stale recomposition validations, and 66.7% fewer publications. These percentages are not a matched live A/B comparator and do not establish CPU, billing, provider-account, p95, or D0007 statistical superiority.

## Residual-cost signal

A release-aware runtime observation immediately before the falsifier showed managed execution `activeSessions: 3`, `reservedSessions: 0`, `reservedAttempts: 1`, and `executingActions: 0`. After the three-member completion, the same projection showed `activeSessions: 6`, `reservedSessions: 0`, `reservedAttempts: 1`, and `executingActions: 0`. Three newly visible ready sessions had creation times around the candidate-validation start.

The session projection does not expose a usable action-to-session attribution for these retained sessions (`actionId` is null), so exact per-action session reuse, cold-start count, CPU, provider billing, and cleanup eligibility remain unknown. The increase is a residual-cost signal, not proof that retained sessions are waste or safe to delete.

## Conclusion and next falsifier

The cheap production-path falsifier did **not** reproduce the pre-H2 stale-recomposition amplification: three completed same-base Works required four full validations, zero stale revalidations, and one canonical effect. There is no measurement-driven reason here to redesign H2.

DIRECTIVE r5 therefore routes the next bounded measurement to managed execution/session cost. Start with current lifecycle/session observations and the cheapest way to attribute sessions, starts, reuse, queue/start/fetch overhead, and actual compute/billing per completed Work. Do not clean retained historical/session state until its owner and positive cleanup/stop evidence are established. If managed execution/session cost is not material, continue to Git/provider operations and then Workers/Durable Object request cost.

Still unknown here: retained staged-release source/H2-reader compatibility, actual Termux checkout/worktree/untracked state, historical runtime/session cleanup ownership, exact Workers/DO request counts, network/object/source bytes, provider API counts beyond the single observed canonical effect, and actual managed CPU/billing.
