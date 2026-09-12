# Fixed helper / native runtime join

This is the implementation contract for current release continuation
workd094b54dd6f208cd9ab34a126002218b. It is not a claim that the helper has been
commissioned, that production execution is enrolled, or that a rollout is active.

## Current ownership and sequencing

Production execution collector remains543fce88473719f2d313440c167fcc97. Its already
canonical native receipt contract companion isada6db901618219101b12d7f86a63aa03b2b218a.
Production finite build/enrollment composition is currently owned by
0a263131c50fa39c7402d7183fe736c2. Do not overwrite those source areas from old
candidates. This work supplies fixed helper/runtime admission and private native
control; native main composition must consume the exact current producer contract.

Actual managed tests are required before canonical integration. The prerequisite
workae5c9425b8ae276f4ecd86ee0b3f368b fixes the helper's native device activation port,
with exact same-effect recovery, positive stop proof, paired health and rollback.
Its current source passed managed validation against1488582e; composition against
freshada6db90 is in progress. Live activation remains separate acceptance.

## Fixed service boundary

`tools/build-release-helper.mjs` builds an installation helper artifact separately
from ordinary device.cjs/worker.mjs/tools.json. The installed helper owns only the
exclusive activation journal, exact admitted artifact/config identities, designated
runit control sender and exact provider effects. It never opens the native work
ledger as an owner, accepts source commands, or becomes a second work queue.

`createFixedHelper` takes one privately installed closed config. Fixed helper,
common Python module, writer-fence config and FIFO-sender config digests are checked.
Role-separated 32-byte HMAC keys protect the existing private native/helper RPCs.
Native-authorized staged build handoff is data-only and bounded. The helper checks
manifest, executor/install seal, artifact store, immutable native config and pair
identity; required/production receipt verification remains the native builder's
responsibility before handoff. Merely possessing JSON/hash/qualification evidence
cannot call the authenticated private handoff or self-enroll a runtime.

`DeviceReleaseConfigs` copies only the privately sealed baseline template and
changes fixed runtime identities plus fixed releaseControl locators. It retains the
config digest in helper meta before activation. A changed credential locator/file
is rejected; it is not rehashed into new pointer authority. Unchanged device
components preserve their exact prior pointer/config and avoid restart.

## Native composition handoff

`NativeReleaseControl` is instantiated from optional fixed NativeConfig.releaseControl
before native execution enrollment is verified. init() reads private role keys;
startupAdmission() obtains a fresh authenticated helper response for the actual
executing runtime, current pointer and retained staged manifest. The returned object
is deeply immutable and process-locally branded. Candidate/plain/copied JSON cannot
serve as this admission. `releaseRuntimeAdmitted(admission, expected)` allows only
an exact non-baseline released device to match the retained execution enrollment.

The expected executor mapping is explicit: manifest.executor.controllerDigest is
the complete enrolled execution controller/trustedRunnerDigest, not its nested
inner validation-controller digest. manifest.executor.sealDigest is the privately
installed production enrollment identity; workflowDigest is its exact approved
workflow digest. This does not change the enrollment's historical nativeJoin or
promote historical qualification to production. Baseline admission never bypasses
the original qualification-nativeJoin checks. Enrollment integration must retain
those checks unless this fresh typed admission matches every source/artifact/tree,
installation/binding, controller/workflow/enrollment identity exactly.

After DevelopmentEngine exists, control.serve({engine,connection}) exposes only
native.status and native.drain. Draining requires the helper's exact currently sent
pending activation effect, persists its identity in the native ledger, then closes
new admission while retaining existing work. Status reports drained only when no
unrelated in-memory action remains. It is NOT OS writer-stopped proof: the independent
writer fence still requires launcher/SQLite/every-Git-sender ownership before switch.

Control refresh/activePair/observe/begin/upload/reconcileStage are typed adapters for
existing ReleaseBackend ports. Helper begin receives both intent and the retained
native-verified build; then a fixed timer continues the existing journal independently
of the HTTP response and broker lifetime. Startup runtime admission avoids querying
the restarting native endpoint, preventing a helper/native initialization cycle.

## Fresh readback versus our effects

At11:01:26Z a separate current owner advanced installed device from4429139c/epoch6
tof0d1dbff967d21cd688c73a6b01493ddbe524950/epoch7. This continuation did not perform
that runtime mutation and does not repeat it. Device bundle
sha256:74c052e9e63e97809bfcee0988798876f389f261d07cd2d29a9e57e12998e5bf;
qualified enrollmentsha256:80a1f0dec10802a37f354a6d11d12cb3462c7d7b7c76fb343ba402ba27965a0c.
Edge still4429139c/version590a6f73-fd51-4383-b56b-e2c9f948e3ce. No staged/active
release or deployment seal. Four-tool schema remains unchanged. The new runtime
supports retained managed artifact projection, so diagnostic reads return to the
product path; the earlier bounded shell log-read exception is no longer necessary.
