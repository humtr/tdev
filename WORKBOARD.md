# dev-2 workboard

Authority: DIRECTIVE r4 -> RULE -> selected D0001-D0008.
This file is current execution status only; mutable facts require fresh observation.

## Canonical single-owner rollback

By direct owner instruction on 2026-09-13, the four-commit multi-account/OAuth experiment that starts after `fbe04f6356b4cae98890f416935f46e82115b413` is retained on `dev-2-multi-account` at `a304c5627cfe27718aadbbeba55166b31e9c348e`. Canonical `dev-2` was restored to the exact pre-experiment source tree; the canonical product path is again the prior single-owner account procedure. Provider/runtime rollback and live owner readback are separate mutable gates and must be freshly observed before claiming completion.

## Production enrollment composition is canonical

The D0008 production enrollment/native producer composition is already integrated, not a pending local candidate. Commit `b9c7db04687d6d2eab8609ca0603e7aaf4bde9e5` (`feat(release): join private production enrollment to native release runtime`) is an ancestor of the pre-multi-account baseline `fbe04f6356b4cae98890f416935f46e82115b413`; that baseline is six commits ahead of the integration commit. Current canonical source retains `src/runtime/production-enrollment.mjs`, `src/runtime/production-commissioning.mjs`, the managed release Builder and the production qualification/commissioning tools. The former `codex/prod-enrollment-release-join` branch is no longer present on the remote.

The retained [independent production review](docs/evidence/phase-b-convergence/independent-production-review-20260913.md) remains source/fixture evidence. It must not be interpreted as a still-open branch or a need to reintegrate the same implementation.

## Current runtime observation

Fresh observation on 2026-09-13 after the single-owner rollback shows repository, device and edge source at `d40359476562a024a949f7af4bc5d11cfa1cee83`; the device is connected at owner epoch 18, managed execution is ready with configured capacity 8, deployment is sealed, and release `sha256:3d002c5c417b43502a1d729804a0a988c13aaa716af12bec9a228bd606d7ddce` is active. This establishes the current installed/readback state only; it does not substitute for any D0008 or DIRECTIVE acceptance that exercises a different layer.

DIRECTIVE r4 still requires the canonical ChatGPT -> dev-2 core path to remain independent of a predecessor system or second model for ordinary forward development.

## Immediate remaining dependency

Do not recreate or reintegrate the deleted production-enrollment branch. Freshly inventory the mandatory D0008 live gates against current retained evidence and execute only gates that are still missing. In particular, distinguish source integration from authenticated production qualification/private commissioning, helper admission, public stage/activate, paired readback and explicit rollback evidence; do not repeat a gate merely because old WORKBOARD text called it incomplete.

After the D0008 live-evidence inventory is current, the remaining Directive-level first-release frontier is real non-documentation ChatGPT self-development through canonical MCP, actual eight-way overlapping work with higher configured concurrency preserving the same semantics, interruption/response-loss duplicate prevention, Android sleep/process-death/reboot recovery evidence, and predecessor comparison/performance evidence.

First release remains incomplete until those still-missing experiential proofs are green.
