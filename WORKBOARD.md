# dev-2 workboard

Authority: DIRECTIVE r4 -> RULE -> selected D0001-D0008.
This file is current execution status only; mutable facts require fresh observation.

## Canonical single-owner rollback

By direct owner instruction on 2026-09-13, the four-commit multi-account/OAuth experiment that starts after `fbe04f6356b4cae98890f416935f46e82115b413` is retained on `dev-2-multi-account` at `a304c5627cfe27718aadbbeba55166b31e9c348e`. Canonical `dev-2` was restored to the exact pre-experiment source tree; the canonical product path is again the prior single-owner account procedure. Provider/runtime rollback and live owner readback are separate mutable gates and must be freshly observed before claiming completion.

## Production enrollment composition is canonical

The D0008 production enrollment/native producer composition is already integrated, not a pending local candidate. Commit `b9c7db04687d6d2eab8609ca0603e7aaf4bde9e5` (`feat(release): join private production enrollment to native release runtime`) is an ancestor of the pre-multi-account baseline `fbe04f6356b4cae98890f416935f46e82115b413`; that baseline is six commits ahead of the integration commit. Current canonical source retains `src/runtime/production-enrollment.mjs`, `src/runtime/production-commissioning.mjs`, the managed release Builder and the production qualification/commissioning tools. The former `codex/prod-enrollment-release-join` branch is no longer present on the remote.

The retained [independent production review](docs/evidence/phase-b-convergence/independent-production-review-20260913.md) remains source/fixture evidence. It must not be interpreted as a still-open branch or a need to reintegrate the same implementation.

## Current runtime observation

Fresh observation on 2026-09-13 binds canonical source at `434c9ec1ca9c9cf5ec91f56142bf807e77bedc4c`, tree `5a845080504a958529d27fe0cb005dd7a4074d98`. The installed device/edge pair still runs source `d40359476562a024a949f7af4bc5d11cfa1cee83`, active release `sha256:3d002c5c417b43502a1d729804a0a988c13aaa716af12bec9a228bd606d7ddce`, owner epoch 20 and configured capacity 8; current observation shows accepting/sealed/qualified with no executing action or held attempt.

The retained staged release `sha256:60a772c23552ac7d8039e4700ff2c1eee62d08efdd44e49201270c97d7f258b1` must not be selected merely because it is staged. Retained convergence evidence identifies it with the excluded multi-account lineage. Before any activation, bind the staged release's exact integrated source and previous pair from current release authority and reject any source that is not the intended current canonical lineage.

A current ChatGPT session has now completed a real non-documentation source change through canonical `dev_context` / `dev_read` / `dev_work` / `dev_observe`: the same-ledger 8->12 restart/capacity regression was validated by the required core and integration profiles and exact-integrated as canonical `434c9ec1...`. This closes the source-change portion of DIRECTIVE Section 11. It does **not** yet close D0007 hard superiority gate 1, which additionally requires staging and activating that same source through canonical dev-2 MCP with authoritative paired readback.

DIRECTIVE r4 still requires the canonical ChatGPT -> dev-2 core path to remain independent of a predecessor system or second model for ordinary forward development.

## Ordered first-release acceptance frontier

Do not recreate or reintegrate the deleted production-enrollment branch. D0008 A-H are retained evidence only until any mutable identity they depend on is freshly rebound; the known remaining release gates are explicit rollback and post-rollback public paired readback. Execute the frontier in this order unless fresh evidence introduces a correctness blocker.

1. **Current-source release / rollback closure.** Rebind source, active release, helper journal, previous retained pair, staged identities and zero conflicting work. Stage the exact current canonical source `434c9ec1...` through public `release.stage`; never activate the retained excluded staged release. Activate only the newly staged current-source release through public `release.activate` and require exact device/edge/public paired readback. Then perform the D0008 explicit rollback exercise through the authoritative fixed-helper/private release boundary against the exact immediately previous compatible pair, followed by public MCP paired readback. Finally restore the intended current-source release and read it back again. A mixed pair, uncertain helper effect, unknown prior pair, conflicting running effect or source mismatch is a stop condition, not permission to improvise a rollback.

2. **Eight-way live failure isolation.** On the now-current release, run eight independent exact-base work units with real overlapping execution. Inject or select one bounded failing/cancelled/blocked witness while the other seven continue independently. Preserve work/action/request identity, measure overlap/provider intervals, and prove no global queue stop or capacity leak. Do not count eight queued admissions or a sleep-only fixture as development failure-isolation proof.

3. **Public response-loss and restart recovery.** Exercise create/admission response loss and integration/publication response loss separately with unchanged request IDs, then restart the native control process during pending work/effect recovery. Prove one durable logical work/effect, no duplicate canonical commit, same-request recovery, stable action identity and independent witness progress. Delivery uncertainty must remain explicit until authoritative observation settles it.

4. **Scored predecessor comparison.** Freeze D0007 benchmark manifests and run genuinely comparable W1-W4 / applicable W5 and fault cohorts against current tmcp and the allowed old-tdev historical/analytical baseline classes. Publish measured-current, measured-historical and analytical evidence separately. Do not claim superiority until D0007's preregistered completion-rate, median/CI, W4 throughput and efficiency gates are met against each baseline; unsupported old-tdev cells require narrower evidence, never fabricated timing.

5. **Physical Android acceptance.** Only after the non-physical correctness/performance frontier is stable, capture exact action/runtime tuples and perform actual network outage, whole-Termux restart/force-stop as appropriate, sleep/Doze and reboot trials. These are user/device disruptive boundaries. After reconnect, observe the same retained action before any unchanged-request retry. Never infer completion from timeout or service restart alone.

6. **Release decision.** Rebind canonical source, active device/edge release, owner epoch, capacity, open actions/effects and provider readback; reconcile the acceptance matrix against DIRECTIVE Section 11 plus D0007/D0008. First release may be declared only when the required experiential gates are actually green. A passing implementation test, retained historical proof or one successful lane is not release completion.
