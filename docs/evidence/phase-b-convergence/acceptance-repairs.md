# Phase B acceptance repair evidence

These are bounded observations, not product authority or production seals.

## Fresh continuation

At 2026-09-12T03:40Z canonical HEAD was 6f6681f5fbaba215a547a7f2a7be2d1aa081282b.
Installed Android/edge remained 6832ee5885a8ca5e25655a45e918a0a0ce8f0938,
owner epoch4, edge c00d6eb8-e6a0-4ca4-99bc-f6539077feed, activeRelease null.
The real refreshed client used the four public tools; Phase A was not repeated.

## Native recovery test defect -> repair -> replay

Exact native candidate c75a023b4e0c12ba2eac0b58c35701e4cc13ecd7 passed core,
but joined integration produced 105 PASS / 2 FAIL / 1 SKIP. Durable outputs had all
expected fields and values; only Object.create(null) versus Object.prototype
caused assert.deepStrictEqual failure. The duplicate-aware canonical record parser
intentionally creates null-prototype records. Changing that safe product behavior
would have been the wrong repair.

The two tests now compare full canonical bytes, retain exact request/effect/deadline
checks, and assert a modified policy digest cannot compare equal. Source edit was
admitted through dev_work in work accbcc0a6f09dbe0d4f494eb914f7fc7 generation13.
Prepared result 373982a3d2ebc334bdd6983e50056fce freezes commit
4c5925ca70b5ca62f79fcd32c58ed1fd0b3d33d2, tree
e1fca557976151b9f83cc167fc69bb8a9bdc42c9, parent6f6681f5.

`job_s3v_f73430e2f9` ran on native Termux Node24.18.0: core167/167, joined
integration107 PASS / 1 hardlink SKIP / 0 FAIL, release29/29. Required input digest
before/after was sha256:00eac522cf14799494628093967bab6bf0258df087ceebd7d1fceab602acb9f5.
`job_s3w_0fc3a0c95c` published exactly that immutable candidate against old6f6681f5;
retained publication effect b51d3a8514c74fb1bab078f1457d7b2b and remote readback
both identify 4c5925ca. Fresh dev_context independently confirmed it at03:51Z.
This is source validation/publication, productionValidation=false.

## Hosted read-only-source falsifier

Existing run34670718884 attempt1, job103491435844, at exact
 db1bd4cef9f079f4320dcb358934205dc87ff9c9 was observed to terminal failure,
not relaunched to recover status. Actual containment and core passed. Required
integration had101 PASS /1 FAIL, unchanged input/output identities and no memory
OOM events. The diagnostic identifies edge-build.test's default output path:
mkdir /source/.artifacts failed under the required immutable source mount.

Class: test defect. Build CLI already accepts an explicit output directory.
The test now selects its own bounded temporary scratch and preserves all AOT,
repeatability, schema, descriptor and executable-import checks. Source isolation,
network, memory, disk, PID and CPU bounds are unchanged. Repaired hosted replay
must pass before private production commissioning. The earlier kernel memory.events
OOM falsifier and verified OIDC/stop/duplicate-launch evidence remain preserved;
qualification still has productionValidation=false and nativeAssignmentVerified=false.

## Bootstrap scope

Source reads/edits/preparation/observation used dev-2. Exact prepared native tests,
publication and the already retained hosted provider log were accessed through the
bounded bootstrap task because the installed Phase A backend still cannot execute
or publish. No old B4 recovery, old runtime restoration, new model, dirty checkout
reset or second effect for response loss was used. Native capability installation
ends this exception for every operation as it becomes usable.
