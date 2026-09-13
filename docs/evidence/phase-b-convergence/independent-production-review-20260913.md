# Independent production candidate review - 2026-09-13

## Verdict and evidence class

**Green for source integration after repair**, not first-release completion.
The candidate was independently inspected by ChatGPT rather than accepting the
originating Codex report. Optional additional read-only harness attempts did not
produce usable reviews; no blind multi-reviewer or ACR convergence claim is made.
The machine-readable companion records the exact source tree, fresh starting refs,
validation results, raw-log digests and durable execution jobs.

Fresh remote canonical was `cd3d63fd152e54d73641b6dd2dcc8944090404c9`;
candidate was `ba7b50688d1c7fd74b5c20db4014069628b4421a`, a direct descendant
through implementation `b9c7db04687d6d2eab8609ca0603e7aaf4bde9e5`.
No canonical source was mutated before review and repair validation.

## Falsifiers and repairs

R1: Initial standard validation failed the private-control response-loss test:
197 integration passes, one failure, one Android-specific skip. Its 20ms timer
could expire before delivery and did not deterministically test response loss.
The test now uses a real loopback authenticated-handler-entry barrier and aborts
only after entry. No runtime timeout was increased to conceal the race.

R2: A new real-loopback falsifier completed the mutating handler, received headers,
and then lost the response body. The raw TypeError escaped the private RPC's
closed uncertainty contract. Body-stream errors now retain EXECUTION_UNAVAILABLE
with delivery unknown; cleanup cannot replace this failure. There is no resend.
The same failed scenario and all five private-control tests pass after repair.

R3: A valid production seal transition selected still-warm commissioning sessions
because source and trusted-runner identities matched. HostedSession correctly
pins its first seal, so this made the first production operation fail. Direct
native offer also admitted a mixed-seal lease. Both falsifiers failed before repair.
Selection and offer now derive compatibility from existing immutable assignments.
Same-seal warm reuse, probe completion evidence and existing retirement/positive
stop handling remain intact. D0008's bounded commissioning decision records this
invariant; no new durable owner or replacement retirement design was introduced.

Seven additional review tests cover valid cross-assignment splicing, altered
runtime and copied admission, owner turnover during asynchronous byte checks,
missing native commissioning intent, substituted stored bytes and both seal
transition boundaries. All pass. This is fixture/native-source evidence, not
an authenticated hosted production execution.

## Reviewed contracts

D0008 remains subordinate to DIRECTIVE r4 and RULE, and composes D0003/D0005/D0006
without replacing D0001 work/recovery or D0002 repository ownership. Qualification
reports cannot grant production authority. Production verification reads actual
native intent/assignment/session/completion records, checks provider/OIDC semantic
joins, outer receipt bytes and actual artifacts, and fences owner changes.
Private flags, copied branded admissions, stale/cancelled/uncertain evidence,
wrong source/runtime, mismatched identities and modified artifacts are rejected.

The production Builder is available only after verified enrollment and reuses the
finite production runner, existing action/attempt ledger and artifact store. Its
completed assignment survives response loss/restart without a second execution.
The real device-main path reaches the native factory, helper admission, production
control, engine/private RPC, release runtime/backend and recovery handlers. Release
availability depends on installed composition, while an installation without a
release configuration can still provide normal development operations.

The 900000ms stage action is bounded around a 300000ms finite build, 2000ms kill
grace and the existing session/action/lease fencing and helper RPC bounds. Increasing
this number was not used as a repair. Source, device, edge, stage, active and sealed
identities remain distinct. Disconnect invalidates cached paired projection.

## Validation and remaining work

Final repaired code tree: `8084474556acee6f532032f58c3766c4f39dcb5e`.
Native Termux standard check: core/static/type/design 172 PASS; integration
206 PASS, zero FAIL, one SKIP. Focused replay: 41 PASS. Release fixtures: 36 PASS.
Device and helper bundles build successfully with unchanged four-tool schema.
The skipped hard-link check is not a PASS and must run on hosted Linux.

No production evidence, enrollment commissioning, new installed runtime, live
release, paired rollback, final-runtime self-development, actual eight-way
acceptance, Android reboot/Doze or predecessor-superiority result is inferred.
Proceed through fresh canonical integration/readback and those live frontiers.
Development-tool repairs and local fixtures are not canonical product-path proof.
