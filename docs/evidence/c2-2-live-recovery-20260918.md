# C2-2 live recovery evidence — 2026-09-18

Status: non-authoritative observation record. Current product meaning remains owned by the Directive, Rule, D0006 and executable source/tests; WORKBOARD still owns routing.

## Scope

This record preserves the live C2-2 recovery observations that required bounded break-glass execution while the ordinary public tdev path was unavailable. It is not a substitute for required validation, canonical integration, release acceptance or C2-2 closeout.

## Observed source and activation lineage

- The final ordinary release attempt before recovery staged `sha256:d3f08228e5837786210ac8c84fb402202c9bec26eccaec53895ca068601a9dd1` from source `a3006cce7fff5feca95bfe2f3a3fb3d573210909` against healthy active release `sha256:5a575e53c2b8dad563f2d42b5f0efed35688378c5d9149fc9a36c8249d45e2df`.
- Public activation Action `25013c04a3f5481c228028a15240f4b9` admitted helper activation `33d72462c2ba0833ea582ea94b30e5318db0672d2d90542c7932bcff75a31343`. No replacement activation was created during recovery.
- The target device failed before native control became available because the retained pre-C2 primary Git-sender configuration used the exact legacy `DEV2_GITHUB_TOKEN_FILE` key while the current runtime expected `TDEV_GITHUB_TOKEN_FILE` under strict private-scope equality.
- Automatic rollback then blocked at rollback `device.drain` because the failed target could not answer the native drain RPC.

## Bounded repairs and falsification

D0006 was revised before implementation to preserve the retained sender and activation identities. The first bounded repair introduced exact retained-primary-sender dual-read plus a startup-unverified rollback fallback. Live execution falsified one detail: reconciling a newly derived normal rollback `device.stop` through the fixed runit sender's inspect mode correctly fenced that never-started sender as durable `not_sent` evidence.

The follow-up repair retained that evidence and changed the fallback so the original pending rollback `device.drain` effect is projected to the fixed stop actuator without changing its activation ID, direction, effect ID, input digest or pair identities. Absent projected stop state is not inspected. A pre-existing fenced normal rollback stop remains immutable evidence and can count as satisfied only after fresh service-down readback plus the independent writer/Git-sender fence.

Break-glass commits were fast-forwarded on the existing development line only after the bounded native validation available to the repair path:

- `9b9d97e4f5136dfac77c11a2984c264e4805925e` — retained sender dual-read and startup rollback recovery owner.
- `f5f0549d3e52aa27fd1c5143307d351f5dbf2ad1` — live-falsified effect-fencing correction; tree `45d72e721e39898ee5c867e48b6a2c2f8ec5a9df`.

The follow-up repair's core and integration validation both passed on the exact candidate before its fast-forward. Those break-glass checks are evidence only; they are not a normal tdev required-validation/integration receipt for the current canonical source.

## Recovery readback

The same retained activation was resumed through the fixed helper. The original pending drain effect sent the stop once, subsequent reconciliation observed the same effect, the rollback advanced through the original plan, and the normal helper tick completed the retained activation.

After recovery, ordinary public tdev observation reported:

- `deploymentSealed=true`;
- active release `sha256:5a575e53c2b8dad563f2d42b5f0efed35688378c5d9149fc9a36c8249d45e2df`;
- device and edge source `sha1:215303e0fbd4f35c3b146794a30d409e9c519801` with Worker version `4fe2db6d-234f-432a-8ac0-75926ece5819`;
- canonical source `sha1:f5f0549d3e52aa27fd1c5143307d351f5dbf2ad1`, tree `sha1:45d72e721e39898ee5c867e48b6a2c2f8ec5a9df`;
- managed execution ready and ordinary tdev operations available.

The original public activation Action `25013c04a3f5481c228028a15240f4b9` subsequently observed `status=succeeded`, recovery step `complete.recovered`, and output state `rolled_back` under the same activation ID. This closes the uncertain original activation without a replacement effect.

The older staged release `sha256:d3f08228e5837786210ac8c84fb402202c9bec26eccaec53895ca068601a9dd1` remains historical/staged state from source `a3006cce…` and is not an activation target for the newer canonical source.

## Remaining C2-2 gate at this record

C2-2 is not declared complete by this evidence. The current canonical successor must pass normal tdev required validation and exact integration, then a fresh release built from that normal integrated source must stage/activate through the ordinary release owner. Applicable live readback, final identity residual scan, managed-ref naming confirmation and WORKBOARD transition to C2-3 remain required.
