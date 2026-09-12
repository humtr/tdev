# dev-2 workboard

Authority: DIRECTIVE r4 -> RULE -> selected D0001-D0008.
This file is current execution status only; mutable facts require fresh observation.

## Local candidate handoff (not canonical or commissioned)

The isolated local branch `codex/prod-enrollment-release-join`, based on freshly
fetched `dev-2` at `cd3d63fd152e54d73641b6dd2dcc8944090404c9`, implements the
separate production enrollment/receipt verifier, private exact-source commissioning,
managed finite release Builder and native main composition under D0008. It retains
qualification-only authority separately, reuses the existing session/action owners
and release backend, and gates release availability on the installed verified join.

This is **local candidate complete, not yet canonical, not commissioned, not live
accepted**. Local verification and the exact next Pro inputs/actions are recorded
in [the production release handoff](docs/evidence/phase-b-convergence/local-production-release-handoff.md).
The canonical and runtime observations below are retained pre-candidate facts,
not fresh live observations from this local session. Do not redo the closed
generation 5/8 retirement or capacity repairs; neither is a new workstream here.

## Current implementation state

The latest confirmed product implementation commit before documentation-only changes is `dcc7e85e50682a90e9917becfeb9c9e6599a309a`, parent `9b5b00dc2a286b825c0e35184a78f7ca27608881`, with result `0db842c598e97f308753673251049ed8`. The production runner generation 6 result is integrated and remotely read back.

DIRECTIVE r4 distinguishes product requirements from development tooling. The first-release canonical ChatGPT to dev-2 core path must not require another model or predecessor system as a product dependency. Authorized external tools and coding agents may still be used to implement, repair, inspect, or review dev-2 itself. Optional future harnesses are compatible with the architecture when the canonical core remains independently usable.

## Runtime observation

Latest retained evidence reports device source `f0d1dbff967d21cd688c73a6b01493ddbe524950`, owner epoch 7, connected. Edge source remains `4429139cded44451efbce1f45d7bf90b71d59d66` at version `590a6f73-fd51-4383-b56b-e2c9f948e3ce`. No staged or active release was confirmed. Repository source, device source, edge source, staged release, and active release are separate identities.

## Integrated release implementation

- `dff65e843ddfeada601b4ee519d7471f9c11cc1c`: finite release build
- `72002ce430660864758e2d9debd20f250a473297`: writer-stop fence
- `1488582e407d358c377d3a6443cc072d4c41da21`: fixed launcher/control
- `5d670f1e315f9cd2622c77b9313eb10f62293eb9`: device activation port
- `b6ceaf337b22696dee078dc789d61d8809fc13a5`: helper/runtime admission
- `ee53fba681441532dc51287b28831e8629f504e7`: capacity reconciliation
- `9b5b00dc2a286b825c0e35184a78f7ca27608881`: native release wrapper
- `dcc7e85e50682a90e9917becfeb9c9e6599a309a`: production runner/build support

These source integrations do not establish an installed active release or live release acceptance.

## Immediate remaining dependency

The canonical branch still needs review/integration of the local candidate above.
After that, the leading dependency is actual approved production evidence and
private enrollment commissioning, bounded installation of the missing native/helper
capability, then public release staging, activation, paired readback and rollback.
The local implementation does not itself supply any of that live authority.

Relevant retained work:

- `543fce88473719f2d313440c167fcc97`: production runner result integrated at `dcc7e85...`.
- `0a263131c50fa39c7402d7183fe736c2`: remaining production qualification/enrollment/native producer/build composition.
- `4e93425c92bfe9779a84f379d2799d0a`: native release composition; wrapper integrated, final native-main composition remains.
- `8e484c03be678347b2fe54e40b51e1ff`: generation 8 retirement repair closed.

## Remaining first-release evidence

Still incomplete are installed runtime change through the release path, live paired release and rollback, actual eight independent overlapping works and higher-capacity semantics, safe Android recovery evidence, and predecessor comparison/performance repair.

First release is not complete. This local candidate closes the selected source
joins, not all first-release evidence or the broader acceptance workstreams.
