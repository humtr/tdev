# D0039@r8 qualification resume handoff (as of 2026-08-26)

> Temporary continuity record. This file is non-authoritative and must never elect the repository route, Design revision, provider route, product owner, or completion status. A fresh session must bind the exact published snapshot first, then read AGENTS.md, RULE.md, SDD.md, WORKBOARD.md, and the maintained D0039 Design. This record is useful only after those owners agree with it.

## Objective

Continue D0039@r8 after published source/Q1/A8 to obtain, fail-closed:

1. an independently authenticated Q4 operator capsule-digest channel and executed-bootstrap observation;
2. an authenticated deployed R8 route-bootstrap readback;
3. only after those gates, Q6-B -> CURRENT -> Q5-R0 and the remaining DAG/rollback/resume boundaries.

Never perform an unapproved provider/device/product mutation, route replacement, blind retry, or rollback.

## Bound authority snapshot (refresh before use)

- Last observed branch: development.
- Last observed published development: 8492bf9c011345ddd602d1728f2d426697be3bf5.
- Last observed published main: b86287b84375e2aeb833cf775371a7808a1239cf.
- Last full git ls-remote --heads origin: only main and development.
- Local tmcp/* refs/worktrees are bookkeeping candidates, not authority.
- Maintained current route: WORKBOARD -> D0039@r8.

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

The terminal Q4 evidence must preserve operator principal/channel provenance together with the exact runtime/verifier digests and execution facts. Merely writing `capsuleDigestSource: authenticated-operator-channel` is insufficient; the independently authenticated operator event must exist outside the executor's candidate transport. A two-session handoff is acceptable only when session A supplies the independently established digest and session B (Codex) performs executor/observer work without becoming the authenticator.

## Execution ledger

| Phase | Required action | Exit evidence | Status at handoff |
| --- | --- | --- | --- |
| 0 | Fresh-bind published authority and reread owners | exact ref, clean tree, WORKBOARD/Design agreement | source-side complete; refresh each resume |
| 1 | Re-run R8 source/docs gate | npm run check, docs validator, diff check, exact S8/A8 | complete: 571/571 |
| 2 | Obtain independent operator capsule-v2 digest and executor observation | operator principal establishes raw canonical capsule digest before release/candidate transport; exact runtime/verifier execution facts and provenance | outstanding; operator material pending |
| 3 | Deploy corrected R8 Worker through the approved provider lane | exact S/A/V/config/IAM readback; R7 provider version retained as rollback boundary; no route mutation | complete: one fenced upload/readback, V88 `1dd66ffe-97ab-43b2-904a-b6514ad8576b`, deployment `820a02de-af17-4a06-9411-61a0551809db`, S8/A8/config checks pass |
| 4 | Run authenticated deployed route-owner readback | exact S/A/V/R join; UNREGISTERED, null current tuple/digest, predecessor/high-water and stable reread digests | outstanding; helper: qualification/installable-agent-cloudflare-readback.mjs |
| 5 | Execute/reconcile Q6-B only after phases 2 and 4 pass | one stable route-bootstrap transaction; authoritative CURRENT or terminal fail-genesis; no blind retry/takeover | not admitted |
| 6 | Build Q5-R0 and continue DAG | fresh final S/A/V/R admission after CURRENT; Q2 then Q7/Q8/Q9 re-admission and Q10 composition | not started |

## Prior failed attempt (not a terminal conclusion)

- Shell environment had no Cloudflare/operator variables.
- The local .tmcp Cloudflare token was tested through both documented GET token-verification endpoints and returned HTTP 401; it must not be treated as a valid current credential.
- No TDEV_D0020_QUALIFICATION_TOKEN or independently authenticated operator digest artifact was found in the bounded repository/state scan.
- Public endpoint reachability (405 for GET, 401 unauthenticated POST) is not route-owner proof.
- The approved `tdev-cloudflare` profile resolves to a mode-600 `/data/data/com.termux/files/home/.config/tdev/cloudflare.env`; read-only discovery verified an active account token. A single R8 provider upload then bound S8 `2fed68c582ceee31546ece08f4c7a9a6d7194941`, A8 archive `sha256:1a68a2496a22d4216c66789af356db848d9b4ad7dd90381c37ed241bce847fbc`, manifest `sha256:8357cc2775907cc29290afdb1844a4af037b18f0155b296cf9e4dd82609c64af`, and epoch `d0039-r8-q5p-20260826T003138Z`. Fresh readback observes one 100-percent Worker version V88 `1dd66ffe-97ab-43b2-904a-b6514ad8576b`, deployment `820a02de-af17-4a06-9411-61a0551809db`, exact namespace `0dad69baa7154d00949f88c8b8dbf94a`, workers.dev enabled with previews disabled, and no route/secret/device/product mutation. This closes provider substrate only; it does not close Q4 or Q6-B.

The above means the prior execution did not complete phases 2-4. It is not permission to declare the plan impossible without first attempting the approved deployment/credential path described below.

## Resume procedure

1. Read this handoff only after rebinding the fixed kernel and current WORKBOARD/Design.
2. Re-enumerate all published origin heads and bind exact development@sha.
3. Inspect the actual R8 deployment implementation and the approved secret/deployment resolver. Do not conclude blocked merely because shell environment variables are absent.
4. The R8 provider substrate upload/readback is complete as recorded above; retain V88 and the R7 V87 predecessor as explicit rollback/reconciliation boundaries. Do not replay the upload or mutate the route.
5. Obtain and verify the independent Q4 operator digest/executor observation. The operator must establish the raw canonical capsule digest before transport; a digest copied from this repository, archive, CDN, Git transport or candidate is not independent. Codex then acts only as executor/observer.
6. Run the authenticated route-owner readback. If phases 2 and 4 are green, execute/reconcile the six-op Q6-B path and record CURRENT, then form Q5-R0.
7. If any phase fails, record the exact failed layer and resume from that phase; do not replace the route or infer success from source/tests/public reachability.

## Safety and ownership

This handoff does not authorize provider/device/product mutation by itself. The qualification layer remains a fence; AgentDeliveryAuthority remains the sole route-current/effect owner. Secret values and private keys must never enter this file, evidence, Git history, logs, or model-visible state.
