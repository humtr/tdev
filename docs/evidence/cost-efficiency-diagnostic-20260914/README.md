# Cost-efficiency diagnostic - 2026-09-14

This artifact preserves the bounded one-shot measurements that motivated post-release cost-efficiency research. It is descriptive evidence only. It is **not** a completed D0007 paired cohort, statistical superiority proof or claim that either system passed W4.

## dev-2 one-shot W4

The fixture used eight independent same-base, disjoint-path source tasks on one canonical ref with the existing required validation and integration semantics.

- actual peak validation execution overlap: 8;
- initial full validation: 8/8 passed;
- initial validation duration median: about 144.1 seconds;
- fixed W4 window: 30 minutes;
- full required validations completed before the deadline: 34;
- one additional validation attempt was still running and was later cancelled;
- integration attempts admitted before the deadline: 34;
- successful canonical integrations completed before the deadline: 6;
- stale `CONTENDED_REF` integration outcomes completed before the deadline: 27;
- fixed-window canonical completion: 6/8 = 75%;
- fixed-window canonical throughput: 0.200 task/minute;
- sixth completion occurred about 27 minutes 29.5 seconds after trial start;
- a seventh integration completed 2.256 seconds after the deadline and is excluded from the trial score;
- the final lane did not complete validation/integration;
- the 34 completed validation spans had median about 140.78 seconds, minimum about 100.49 seconds, maximum about 216.64 seconds and mean about 151.17 seconds.

The dominant observed cost was repeated exact full validation after each same-ref canonical winner made other old-head prepared results stale. The initial eight-way validation itself succeeded and overlapped; publication/recomposition semantics amplified the work.

The late seventh integration advanced the diagnostic lineage to `b58e7121a214f2c0bad6c66569edace999b8eb17`, tree `621751bc8a239e7bdf7adbaca3f01f5c661deae4`. That lineage retains test-only marker files for lanes 1, 3, 4, 5, 6, 7 and 8 under `bench/one-shot-w4/`; lane 2 is absent. Later canonical commits may add unrelated research/documentation bytes and must be rebound separately.

## tmcp one-shot W4-like diagnostic

A single current-tmcp descriptive run used eight exact-base worktrees and the available normal validation command. It did not reach comparable canonical W4 completion.

- observed effective executor concurrency was about 4 despite eight requested lanes;
- 3/8 lanes completed local validation/commit successfully;
- 5/8 failed or were cancelled around the production-commissioning integration check;
- terminal batch wall time was about 11 minutes 31.7 seconds;
- median raw lane wall time was about 338.8 seconds;
- no canonical `dev-2` publication was reached, so comparable canonical completion was 0/8.

The local 3-success rate or derived local-lane throughput must not be compared directly with dev-2 canonical throughput because tmcp did not reach the same terminal postcondition.

## Fresh current state after research-boundary integration

A later fresh public observation on 2026-09-14 showed:

- canonical source `c5fb68ad102bb8798214d3bfaded64b08b3d7286`;
- canonical tree `9987f39bd02caad3fc7ba37d8a1afc161b8e4c7f`;
- public runtime accepting, deployment sealed and qualified;
- configured capacity 8;
- `executingActions: 0` and `reservedAttempts: 0`;
- active release `sha256:3bcde63d0124f1193ab46eac974dc89e7403c05586093b4d454f538d0981cc17`;
- edge/device source `1ad5d13fb74b0a316b17a0d5139ed193826bc6a6`;
- owner epoch 42.

Current canonical D0003 also contains a test-only cost-efficient composition research boundary and `bench/cost-efficient-composition.mjs`. That later structural research is not part of the one-shot timing measurement above.

## Interpretation boundary

The measurements are sufficient to identify a structural cost hypothesis: same-ref stale recomposition can multiply required validation and provider/control-plane work even when initial parallel execution is healthy. They are not sufficient to establish D0007 statistical superiority, p95 behavior or stable cost attribution to a Cloudflare account quota.

DIRECTIVE r5 records the separate owner decision to close the first release without converting these diagnostics or unperformed physical Android cases into PASS. The current D0003 research boundary uses this evidence only as motivation for a cheap off-path falsifier before any production semantic change.
