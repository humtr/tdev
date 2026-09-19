# D0008 - Production enrollment and native producer composition

- Design: `D0008`
- Title: `Production enrollment and native producer composition`
- Status: `accepted`
- Depends-On: `[D0003, D0005, D0006]`
- Supersedes: `[]`
- Directive: `r8`
- Owns: `production-commissioning-join`

## Problem and required outcome

D0005's production outer execution cannot inherit qualification-only enrollment.
D0006's existing release backend needs an installed finite Builder and native main
composition. Complete these joins without creating another execution owner or
letting source, public input, fixture reports or hashes authorize production.

## Facts / assumptions / unknowns

Production authorization is intentionally separate from qualification-only enrollment.
Exact installed source, enrollment, commissioning, provider-run and paired-activation
identities are mutable observations and must be read from their retained owners when
production eligibility or release state is evaluated.

## Decision

Keep the historical managed enrollment unchanged. A separate private versioned
production record names the exact approved controller commit/tree/manifest,
installation/repository/binding, provider repository/owner, controller identities,
engine and dependency artifact, baseline native runtime and commissioning intent.
Its digest identifies this authorization; it is not authentication by itself.

The private installer must supply retained native production assignments for all
three fixed profiles (core, integration, release-build), against the exact approved
source. The existing OIDC endpoint, ManagedSessions completion and immutable object
transfer authenticate those assignments. Enrollment verification reads these native
records, never report snapshots supplied in the enrollment. Each proof names the
exact assignment, result, session, run/attempt, lease and outer digest. It reuses
ProductionReceipts and joins installed identities and actual stored output bytes.
Private commissioning permits only an operator-approved exact-source probe intent;
it grants no public validation, integration or release capability. Its intent digest
is the probe's assignment seal; successful enrollment has a different final seal.
This breaks the proof/enrollment cycle without calling a probe production authority.

At authenticated completion, retain the selected session snapshot in the existing
ledger with the assignment. Later idle retirement does not cancel a previously
completed execution. Verification still compares immutable current assignment and
session/run identities and rejects missing provenance, cancellation at completion,
failure, stale execution and mismatched or partial objects. This is authenticated
completion evidence, not a second session owner. Legacy assignments have no such
evidence and are never backfilled into production. Fixtures may construct test
ledgers but cannot install or authenticate themselves in an actual native ledger.

The enrollment's baseline runtime must match exactly. A subsequent released runtime
may instead use only D0006's freshly authenticated, process-branded non-baseline
helper admission matching the complete executor, enrollment and runtime identities.
Historical qualification receipts preserve their original verification semantics.

## Concurrency and failure/recovery

A hosted session pins the seal of its first assignment. Warm commissioning sessions
therefore cannot receive assignments under the later production enrollment seal,
even when controller/source identities are unchanged. Admission derives seal
compatibility from the existing immutable assignment records, both when selecting
an idle session and when offering a new lease. It does not rewrite old assignments,
completion snapshots or hosted journals. Same-seal warm reuse remains allowed;
incompatible sessions follow the existing retirement and positive-stop capacity
path. No additional session owner or enrollment-selected execution fallback exists.

The Builder uses the release action's existing reserved attempt and managed pool.
Its immutable build input is retained under that action before dispatch, including
source authority, previous pair and first attempt. A resumed action may read an
already completed first assignment but cannot launch a replacement build under a
new attempt. Pending execution is reconciled/cancelled through the same managed
assignment/session. Missing or partially uploaded artifacts remain unavailable.
One release build consumes one existing action reservation, not an extra work.
The release.stage action has a fixed fifteen-minute ceiling, covering the fixed
five-minute build plus managed launch/transfer and staging effects. It cannot use
the generic five-minute action budget, which cannot admit that build profile.

The finite result uses only device.cjs, worker.mjs and tools.json, with D0005's
receipt and D0006's artifact store. Manifest compatibility constants come from the
installed approved controller, never arbitrary candidate configuration. Verification
reconstructs the exact manifest and receipt from retained build input and objects.

Native startup reads private config, authenticates helper startup admission,
verifies enrollment, creates the engine, serves private status/drain, initializes
the existing release runtime and only then pumps/connects. Installed-only paths
remain in the sealed config template across updates. Partial composition keeps
release unavailable. Active/sealed projection requires fresh paired readback;
disconnect invalidates it. Policy special/recovery handlers retain their owner.
Private commissioning executes the exact digest-checked installed device bundle
in installer-only, public-admission-drained mode. A source CLI only launches that
bundle; it cannot claim a different installed runtime through source imports.

## Security/effects and alternatives

No public schema, candidate flag, source-local enrollment or other model becomes
an authority. No production flags are added to qualification records. Reusing
qualification PASS was rejected because it lacks the native authenticated join.
Embedding report JSON and trusting its hashes was rejected for the same reason.
Another build system, release backend or activation journal duplicates existing
owners and is unnecessary. Private installer authority and native ledger custody
remain part of D0005's trusted operator domain.

## Acceptance and implementation consequences

Exercise every installation/source/provider/profile/attempt/result/receipt identity
mismatch, invalid kernel/isolation evidence, noncanonical receipts, qualification
and fixture substitution, byte corruption, cancellation and partial upload.
Test same-action duplicate/restart/response-loss recovery with no second logical
build; test native ordering, availability, special/recovery and fresh projection.
Run standard local core/integration validation. These prove source and fixture
behavior only. Actual OIDC/provider production probes, private commissioning,
Termux helper startup, public stage/activate, paired readback/rollback and physical
Android/self-development acceptance remain mandatory live evidence.

## C2-1 multi-binding clarification

The historical managed/production enrollment in this Design remains bound to the
installation's primary/controller repository and is not cloned, widened or rewritten
when C2-1 adds an ordinary target repository/ref. It continues to authenticate the
finite controller/production capability selected here. D0006 owns the additional
target-binding identity carried by managed assignments and receipts. Target binding
adoption grants no release-build, policy-adoption or activation authority; those
operations remain primary/controller scoped unless a later Design explicitly
changes the production enrollment contract. This preserves historical evidence and
avoids enrollment churn while keeping target source validation and D0003 publication
exactly binding-scoped.

## C2-2 production-enrollment compatibility

Existing qualification and production enrollment objects are immutable evidence and
retain every historical `dev2` kind, digest, workflow and provider-run identity they
were commissioned with. C2-2 does not rewrite those records or claim that a spelling
change re-qualifies them. Verifiers accept such a record only through the exact
legacy identity its retained seal already binds.

Newly commissioned enrollment/evidence uses current `tdev` kind and digest domains
and current executor workflow identity. A released runtime may continue to rely on a
legacy enrollment only when the existing D0006 release-admission rule proves that
exact controller/enrollment/runtime composition. Because that immutable approved
controller commit contains only its enrolled legacy workflow, sessions launched by
that exact enrollment also retain the legacy operational ref/workflow identity until
private current-controller commissioning replaces it. This is an enrollment-scoped
compatibility producer; no source candidate, public request or alias may select which
namespace is trusted. Legacy enrollment verification and production may retire only
when a current enrollment is active, no rollback-eligible runtime depends on the old
enrollment, and all legacy sessions are positively terminal.


### C2-2 destructive hard-cutover override

For the D0006 hard cutover, the new runtime must be composed from current tdev qualification/production enrollment and current executor identity. The compatibility rule above that permits a released runtime to rely on a legacy dev2 enrollment is superseded once the pre-cutover runtime reaches the required quiescent boundary. Legacy enrollment/evidence remains historical immutable evidence only and is not accepted by the post-cutover runtime verifier or used to launch new sessions.

Production commissioning still requires the same independently verified security/execution inputs and exact native join. The hard cutover does not turn historical evidence into new qualification and does not weaken controller, seal, repository or provider-run binding.

### C2-2 current-controller recommissioning handoff

If the fixed release launcher is already current but the installed managed/production
enrollment still approves a predecessor controller, C2-2 must not normalize that
historical enrollment in place and must not let an ordinary release silently carry it
forward. The bounded repair is a two-phase private recommissioning handoff.

First, the exact currently executing canonical device source is qualified by the
current tdev containment workflow. A product-owned preparation component independently
joins the selected successful provider run, managed-controller report, containment
report and production-adapter report to the exact installed source tree and controller
definition. It emits a new immutable managed enrollment, a production commissioning
intent and a staging native config that contains the new managed enrollment but no
production enrollment. Existing production authority is not loaded or replaced in
that commissioning process. The existing private production commissioner then runs
the three exact-source production probes and emits a separately verified immutable
production enrollment.

Second, after the public/runtime ledger, managed sessions and release activation state
are quiescent, the current active runtime pair becomes the baseline of a fresh
release-control subroot for the same installation/repository/binding epoch. The old
release-control root and both old enrollment objects remain byte-for-byte historical
evidence. The new root reuses only already sealed fixed helper bytes and installation
credentials, copies the exact active immutable release artifact, creates new private
RPC locators, and binds the new enrollment seals, current baseline native config,
pointer, fixed writer/runit configuration, pointer-aware launcher composition and
helper service run into a controller-recommission extension seal. The base installation
seal remains the installation authority and is not rewritten.

The handoff stops only the canonical tdev device and fixed release-helper services,
requires the existing pointer and helper active-pair readback to agree exactly, and
requires no held Attempt, running/offered managed assignment or nonterminal activation.
The live inspection must obtain the exact helper active-pair readback before the stop boundary. After both services are stopped, apply must rebind that same pair from the durable terminal activation journal (or the sealed helper baseline when there has never been an activation) and recompute the exact inspected plan digest; it must not require a live helper RPC after the stopped boundary.

It then installs the fully composed fresh subroot before atomically replacing the two
global runit run files. On any partial global service-run replacement it restores the
exact previous run files. It does not mutate the work ledger, provider deployment,
binding registry, Git refs, historical release-control root or historical enrollment
objects. Services are restarted only after exact file/digest readback.

Post-handoff startup must verify the new managed and production enrollment against the
same current native runtime and then expose ordinary tdev validation/release authority.
No compatibility reader may select the predecessor enrollment in the new subroot. A
rollback to the historical root is an explicit operator rollback of the whole retained
root/run-file pair, never a mixed enrollment or partial seal fallback. C2-2 may close
only after ordinary required validation proves the current controller and the next
normal release activation succeeds from this recommissioned root.
