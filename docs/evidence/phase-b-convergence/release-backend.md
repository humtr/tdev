# Independent release backend convergence

Authority remains DIRECTIVE r3 and selected D0001-D0007. This record grants no
publication/activation eligibility. Starting source was freshly observed as
a5f74cb713cec2a9301609365e6f673e8f2085f7 at 2026-09-12T02:53:37Z. Existing policy,
manifest, activation journal and controller modules are reused, not recreated.

## Source joins and isolated ownership

Current ChatGPT used dev_work create/edit/validate and dev_observe for work
38e15c7913b337d4fe955b2a7d0886e0. It implements integrated-source authority joining
native required receipts, canonical effects and current ancestry; private immutable
release artifacts; stage/activate backend with current authorization and fixed helper
handoff; and durable at-most-one-send provider-effect records in the existing helper
journal. No arbitrary host command, candidate archive or source import is introduced
in the release broker. Four-tool schema and annotation policy remain unchanged.

Another retained B1 work e107fe593393dc5749f77be010229efb was observed changing
trusted validator/mount paths and routing documents. Its earlier eab2d122ac5ff577297f
b73ec8edfecd4f1fdece failed a core test and was not published by that operation.
Fresh dev_context at 03:02:41Z independently confirmed its repaired source
b81ba525c8e9b5e47093db5744fc705d45cf0f82 was canonical. No other work was cancelled
or overwritten; no second model was launched by this lane. dev-2 exact preparation
composed this independent release work onto that newer canonical parent.

Alternative unvalidated trusted-validator work 34d4d1c880294e0b9660eb75454cefab is
retained, not installed/published. Its overlapping foundation must not replace the
new canonical B1 source. Documentation work 6f77a822407589a78bf127408813ca59 and
prepared e28b734fc3b78e099c874d740bb84141 are retained; its bootstrap export stopped
before execution/publication on dependency-lock mismatch. That guard is not a product
validation failure. Canonical B1 WORKBOARD now records actual Phase B routing, so the
older competing documentation candidate must not be blindly published.

## Verified first backend slice, 2026-09-12T03:05:27Z

Exact dev-2 prepared result f7ab59fa954a2d13ba7b1bf8100db92d:

- Commit: d95e255e86beafb0c2df0e0eef80bfcd26d81482.
- Parent: b81ba525c8e9b5e47093db5744fc705d45cf0f82.
- Tree: 5dab93159092d921e4b84c88a3823dc6e9c14eb5.
- Dev-2 preparation action: bdd50d7d42ebaaf23121df91298fe3e1.
- Bootstrap task/job: task_rrh_1a1750319c / job_s0p_2a10e49e22.

Core passed (Python, JSDoc, Designs, core tests), joined integration passed 97/98
with one explicit skip and no failure, and release module tests passed 24/24.
Core input/output-input digest was identical:
sha256:ce9355db3595a2b9e9a8e1425cb18aec753647afa31d96bd2d3e2f49f1623879.
Actual execution was Termux Android arm64 Node24.18.0, SQLite3.53.4, reviewed local
bootstrap, productionValidation:false and installationEligibility:false. Native
preparation correctly retained EXECUTION_UNAVAILABLE instead of issuing a fake
production receipt. Tests cover real fixture Git/process/SQLite joins, immutable
artifact corruption, path/cancel fences, response loss, paired rollback and unchanged
component reuse. Provider/build/physical-stop ports in release tests remain fixtures.

The exact export and logs are retained under the selected installation's private
bootstrap/phase-b/f7ab59fa954a2d13ba7b1bf8100db92d directory. This test did not publish
or activate the candidate. Later edits require their own exact-result validation.

## Repairs and additional regression frontier

Review found that a durable native activation intent could survive a crash before
helper admission. Reusing that intent must not bypass newly revoked path grants.
The backend now observes an already admitted helper transaction without relaunch;
when no helper record exists, it rechecks current source/policy/path/runtime authority
before delivering the same original intent/deadline. A dedicated regression exercises
this gap. Immutable staged retries also return verified retained output instead of
rewriting a terminal stage with a newer provider observation timestamp.

ProviderEffects persists planned -> sent -> confirmed in the fixed helper journal.
A positive owner restart fences the old local sender but does not imply a sent remote
request was absent. Uncertain sent effects cannot regain send permission or acquire
a replacement ID; unrelated IDs remain independently runnable. SQLite restart,
response-loss deduplication and concurrent independent-ID regressions are included
in the next exact slice and are not covered by the earlier 24-test report.

## Acceptance falsifier and repair, 2026-09-12T03:09Z

Prepared result cc37c98443140ef88c717e047dd87b29 / commit
6e75cafe8471cd151dddbf795d71bf114a36dff1 / tree
0bd8aaa083ca4d0a88ce7a2bc25e0cbd4e0fcfd1 passed core and joined integration
(97 passed, one skipped) in bootstrap job job_s1j_eeb88b6a2b. Release tests were
27/28: the real helper-restart regression found that an old callback reached the
closed journal guard before the owner guard and emitted INTEGRITY_FAILURE rather
than STALE_REVISION. It did not mutate the reopened journal, but this was a product
error-classification defect relevant to recovery. Publication was not attempted.

ProviderEffects now checks current owner before opening each transaction and also
inside it. The regression expectation is preserved; no requirement was weakened.
A new exact prepared result must replay that test, all release tests, core and joined
integration before publication. The failed result and logs remain retained rather
than overwritten or relabeled as successful production validation.

## Remaining operational frontier (not completed by these module tests)

Native composition still needs actual sealed managed release builder, fixed helper
transport/service, Cloudflare inactive version upload and exact activation readback,
Termux drain/stop/locked-pointer/switch/start ports, special-action recovery and paired
health/rollback trials. Production managed validation and native canonical integration
remain B1/B2 prerequisites; bootstrap publication alone deliberately cannot authorize
ordinary release.stage. Source/runtime/schema/release identities must be re-read
independently before installation. Live provider and Android physical trials remain
NOT RUN until executed. Missing software joins are implementation work, not claims of
external permission denial. Continue independent work and acceptance repair.
