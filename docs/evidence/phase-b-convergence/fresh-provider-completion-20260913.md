# Fresh provider completion review and repair

This is source evidence, not production commissioning or first-release acceptance.
Machine-readable identities, validation outputs and raw-log digests are in
[fresh-provider-completion-20260913.json](fresh-provider-completion-20260913.json).

## Authority and independent finding

The session independently started at canonical cd3d63fd and candidate ba7b5068.
While review was running, a different actor integrated fa018a40 and closed PR 44.
That ancestry is preserved; this controller did not perform or certify that merge.
The cloud reviewer subsequently found a P1: cached in-progress provider authority
can survive cancellation and become durable production completion custody.
This falsifies an unrestricted source-green claim even after fa018a40.

## Reproduction and bounded repair

The corrected result.submit probe uses an actual RS256 verifier, ExecutorEndpoint
and native session/assignment ledger with a controlled authenticated provider.
Three rejection assertions failed: cached cancellation, an older in-flight read,
and provider loss after cached success. The invalid-operation first probe is not
counted. Completion now derives an internal fresh-read requirement from the closed
operation, after JWT validation. It bypasses cached and older in-flight authority,
rejoins native state after I/O, and rejects non-running or unavailable observations.
Ordinary poll caching remains bounded. No durable owner or public input is added.
D0008 records this clarification under the existing D0005 completion boundary.

The same failures are replayed alongside successful completion and exact serialized
retry. All 17 focused tests pass. Full local validation has 173 core passes, 214
integration passes and one explicit Android hard-link skip; 36 release fixtures
pass. Design/type checks and device/edge/helper builds pass. These runs precede
this evidence-only text; source blobs and input digests identify what was tested.

## Hosted evidence is not promoted

Original candidate qualification run 34731136608 passed. Refinement run
34731643843 failed the pre-existing 20ms response-loss test race (201 integration
passes, one failure, no skips); fa018a40 repairs that test using an observed server
entry barrier. Its actual engine-byte observation is retained for private selection,
not relabeled as a successful qualification or production authority.

## Continuing frontier

Independent review of this repair and fresh exact-source qualification remain open.
No runtime, production enrollment, helper, staged/active release or deployment seal
was changed by this source-repair step. Continue with canonical integration only
after its gate, then actual installation/commissioning and all applicable Directive
acceptance. The Android app uid cannot read dumpsys deviceidle (permission denied);
that does not block independent source, provider, concurrency or process-recovery work.
