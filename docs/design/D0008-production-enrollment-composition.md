# D0008 - Production enrollment and native producer composition

- Design: `D0008`
- Title: `Production enrollment and native producer composition`
- Status: `accepted`
- Depends-On: `[D0003, D0005, D0006]`
- Supersedes: `[]`
- Directive: `r4`
- Owns: `production-commissioning-join`

## Problem and required outcome

D0005's production outer execution cannot inherit qualification-only enrollment.
D0006's existing release backend needs an installed finite Builder and native main
composition. Complete these joins without creating another execution owner or
letting source, public input, fixture reports or hashes authorize production.

## Facts / assumptions / unknowns

The source at cd3d63fd152e54d73641b6dd2dcc8944090404c9 has the production runner,
native receipt join, finite build, artifact store, helper and release backend.
Managed enrollment and native main do not yet compose them. Live authenticated
production qualification, installation and paired activation remain unknown.

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

Completion admission uses a fresh authenticated provider observation started after
the completion request. Ordinary polling may retain its bounded observation cache,
but completion cannot reuse that cache or a provider read already in flight. JWT
verification precedes the fresh read; exact native session/run, lease, expiry and
owner checks follow it. Provider loss, a terminal run or a non-running observation
cannot create completion custody. Native state is reread after provider I/O so a
concurrent selector or retirement cannot be replaced by a pre-request snapshot.
The existing completion record and action remain the only durable owners.

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
