# D0039@r8 qualification resume handoff (as of 2026-08-26)

> Temporary continuity record. This file is non-authoritative and must never elect the repository route, Design revision, provider route, product owner, or completion status. A fresh session must bind the exact published snapshot first, then read AGENTS.md, RULE.md, SDD.md, WORKBOARD.md, and the maintained D0039 Design. This record is useful only after those owners agree with it.

## Objective

Continue D0039@r8 after published source/Q1/A8 to obtain, fail-closed:

1. an independently authenticated Q4 operator capsule-digest channel and executed-bootstrap observation;
2. an authenticated deployed R8 route-bootstrap readback;
3. only after those gates, Q6-B -> CURRENT -> Q5-R0 and the remaining DAG/rollback/resume boundaries.

Never perform an unapproved provider/device/product mutation, route replacement, blind retry, or rollback.

## Bound authority snapshot (refresh before use)

- Do not treat a SHA embedded in this handoff as the current mutable branch location; freshly read published `development` before dependent work.
- Cleanup/reconciliation began from published `development@ceefdc0b3a607e69d4e191566794412ea49ee5d8`; that is an as-of observation only, not a future routing owner.
- The immutable deployed qualification identity remains exact S8 `2fed68c582ceee31546ece08f4c7a9a6d7194941`, V88 `1dd66ffe-97ab-43b2-904a-b6514ad8576b`, deployment `820a02de-af17-4a06-9411-61a0551809db` until a fresh provider observation proves otherwise.
- Local tmcp/* refs/worktrees are bookkeeping candidates, not authority.
- Maintained current route is resolved from WORKBOARD -> D0039@r8 after the fixed-kernel rebind.

## The two approved R8 remedies

### A. Pre-CURRENT route-bootstrap admission

The corrected qualification dispatcher has a separate route-bootstrap.v1 pre-admission path. Exactly these six genesis operations may use an authoritative UNREGISTERED route read with currentTuple=null and currentTupleDigest=null:

- migrate_installable_agent_route
- register_installable_agent
- record_installable_agent_genesis_evidence
- accept_legacy_predecessor_quiescence
- initial_activate_installable_agent
- fail_installable_agent_genesis

Ordinary management, credential, package, trust, replacement, uninstall and recovery mutations retain the admitted-deployment identity fence.

### B. Production genesis-evidence verifier wiring

The corrected qualification host wires an asynchronous release-root Ed25519 verifier for tdev.installable-agent-evidence-envelope.v1. It verifies the exact canonical D0027 evidence context before authority CAS; missing callback/key, malformed envelope, context/key mismatch, and bad signature fail closed.

Both remedies are source-level until the corrected Worker is actually deployed and read back. Source Q1/A8 must never be promoted to Q4/Q6-B.

### Q4 role separation (required, not a string-level claim)

The independent operator and Codex must have separate roles. The operator establishes the raw SHA-256 of the exact canonical `tdev.agent-bootstrap-trust-capsule.v2` bytes through an authenticated channel before release/candidate transport is consulted. Codex is only the executor/observer: it receives that operator-bound `expectedCapsuleSha256`, verifies the capsule/runtime/verifier/execution closure, and records the resulting observation. Codex must never derive the terminal digest from Git, an archive, CDN/GitHub metadata, or a candidate-produced evidence file and then self-authenticate it.

The terminal Q4 evidence must preserve operator principal/channel provenance together with the exact runtime/verifier digests and execution facts. Merely writing `capsuleDigestSource: authenticated-operator-channel` is insufficient; the independently authenticated operator event must exist outside the executor's candidate transport. A two-session handoff is acceptable only when session A supplies the independently established digest and session B (Codex) performs executor/observer work without becoming the authenticator. A digest generator stored inside this repository/candidate transport is not retained as terminal-Q4 operator machinery and cannot establish the independent event.

## Execution ledger

| Phase | Required action | Exit evidence | Status at handoff |
| --- | --- | --- | --- |
| 0 | Fresh-bind published authority and reread owners | exact ref, clean tree, WORKBOARD/Design agreement | source-side complete; refresh each resume |
| 1 | Re-run R8 source/docs gate | npm run check, docs validator, diff check, exact S8/A8 | complete: 571/571 |
| 2 | Obtain independent operator capsule-v2 digest and executor observation | operator principal establishes raw canonical capsule digest before release/candidate transport; exact runtime/verifier execution facts and provenance | outstanding; operator material pending |
| 3 | Deploy corrected R8 Worker through the approved provider lane | exact S/A/V/config/IAM readback; R7 provider version retained as rollback boundary; no route mutation | complete: one fenced upload/readback, V88 `1dd66ffe-97ab-43b2-904a-b6514ad8576b`, deployment `820a02de-af17-4a06-9411-61a0551809db`, S8/A8/config checks pass |
| 4 | Run authenticated deployed route-owner readback | exact S/A/V/R join; UNREGISTERED, null current tuple/digest, predecessor/high-water and stable reread digests | complete: explicit `--route-readback-mode unregistered`; stable predecessor `sha256:94e1e3aa717ae788a68337fb346aa6bd9bca7b992939b1f4409e84cda2e8ac81`, high-water 1, reread `sha256:4434d527a0682d774932dd2d8b16857439ce1dd58d2e7a79548d71ef9b1462e5`; evidence `docs/evidence/group-f-d0039-r8-route-owner-pre-current-readback-2026-08-26.json` |
| 5 | Execute/reconcile Q6-B only after phases 2 and 4 pass | one stable route-bootstrap transaction; authoritative CURRENT or terminal fail-genesis; no blind retry/takeover | not admitted |
| 6 | Build Q5-R0 and continue DAG | fresh final S/A/V/R admission after CURRENT; Q2 then Q7/Q8/Q9 re-admission and Q10 composition | not started |

## Prior failed attempt (superseded observations)

Earlier shell-only discovery incorrectly left credential availability and route-owner readback unresolved. Fresh reconciliation found the approved mode-600 Cloudflare configuration without exposing secret values, verified the active provider principal and exact V88 substrate, and then completed Phase 4 through the explicit pre-CURRENT `read_installable_agent` path. The older `d0039_security_readback` HTTP 400 `invalid_digest` result is expected for an `UNREGISTERED` route because that operation is CURRENT-bound; it is not evidence that the R8 route-bootstrap predecessor is unavailable.

The remaining unresolved layer is Phase 2 only: no independently authenticated operator capsule-v2 digest/event has been supplied outside candidate/repository transport. This handoff therefore does not authorize Q6-B merely because Phase 4 is now complete.

## Resume procedure

1. Read this handoff only after rebinding the fixed kernel and current WORKBOARD/Design.
2. Re-enumerate all published origin heads and bind exact development@sha.
3. Inspect the actual R8 deployment implementation and the approved secret/deployment resolver. Do not conclude blocked merely because shell environment variables are absent.
4. The R8 provider substrate upload/readback is complete as recorded above; retain V88 and the R7 V87 predecessor as explicit rollback/reconciliation boundaries. Do not replay the upload or mutate the route.
5. Obtain and verify the independent Q4 operator digest/executor observation. The operator must establish the raw canonical capsule digest before transport; a digest copied from this repository, archive, CDN, Git transport or candidate is not independent. Codex then acts only as executor/observer.
6. Immediately before any Q6-B admission, fresh-reread provider/route state with the explicit pre-CURRENT readback mode and require it to match or freshly supersede the recorded Phase-4 evidence. Only if Phase 2 is independently green and the fresh Phase-4 reread is green may the six-op Q6-B path execute/reconcile to CURRENT (or terminal fail-genesis), after which Q5-R0 may be formed.
7. If any phase fails, record the exact failed layer and resume from that phase; do not replace the route or infer success from source/tests/public reachability.

## Safety and ownership

This handoff does not authorize provider/device/product mutation by itself. The qualification layer remains a fence; AgentDeliveryAuthority remains the sole route-current/effect owner. Secret values and private keys must never enter this file, evidence, Git history, logs, or model-visible state.
