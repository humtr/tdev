# tdev forward development program

> Engineering owner for the forward Design-sized dependency/coverage graph between stable Capability Group exits in `docs/ROADMAP.md` and accepted implementation/qualification work. It owns planning relations, conditionality, cheapest falsifiers, exit shape, external-action dependency and unresolved coverage questions. It does not own product meaning, maintained Design status, current routing, historical evidence or Capability Group definitions.

## 1. Authority boundary

The mutable current routing instance and runnable frontier are owned only by `WORKBOARD.md`. Resolve exact runnable/selected Design revisions there, then resolve each maintained Design revision/status from its Design file.

This register carries no current lane, `ACTIVE` Group or branch instance. A route transition therefore does not require a synchronized PROGRAM edit.

`docs/ROADMAP.md` is the sole live A-H Capability Group/exit owner. This file references Group IDs only; it does not duplicate the capability table.

A gate row has one of two authority forms:

- **maintained Design foreign key** — `Dxxxx@rN` plus its Design path; the Design file, not this register, owns whether that revision is accepted/implementing/verified/reopened/etc.;
- **provisional label** — a planning key only. It does not authorize Class 2 implementation until `SDD.md` is satisfied by an accepted Design record.

Completed Design narrative, test counts, benchmark values, commit SHAs and evidence digests belong to Design/evidence/history owners and are intentionally absent here.

## 2. Forward gate register

| Gate | Groups | Authority | Depends on / may run with | Conditionality | Cheapest falsifier / exit shape | External action dependency |
| --- | --- | --- | --- | --- | --- | --- |
| D0019@r2 | B/F | maintained Design foreign key: `docs/design/0019-casedo-authority-adapter.md` | inherited semantic core; Agent delivery can be researched in parallel; D0030 is only a prerequisite for a verification route that actually exercises the Termux immutable-journal write path | required current Case-runtime gate | competing placement/replay/revision/eviction/owner-loss/corruption/capacity/rollout failures on one durable Case authority; exit is a qualified single semantic owner in the target Case runtime | Cloudflare Durable Object/storage/account evidence where provider qualification is claimed |
| D0030@r2 | B/F | maintained Design foreign key: `docs/design/0030-immutable-journal-publication-portability.md` | can implement independently of D0019 semantics; may unblock Termux journal-backed qualification paths | required for any supported deployment/profile that cannot qualify the inherited hard-link publication primitive | no-replace publication capability, ambiguity/reread and unchanged journal-oracle behavior on each supported profile; exit is one positively qualified backend/integration path without silent fallback | native build/package/runtime-filesystem qualification as applicable |
| D0020@r2 | F | maintained Design foreign key: `docs/design/0020-agent-connection-delivery-and-aggregate-capacity.md` | Case authority and Agent delivery ownership remain separate; implementation preserves D0019 running-before-dispatch and the accepted `grant_attempt_dispatch` boundary; D0027 consumes this route/delivery boundary without reopening it | required | inherited connection/capacity/cancellation/reservation gates plus R2 post-spawn handle/no-handle truth, exact lost-connect-response socket-incarnation fencing, terminal-delivery retirement/bounded tombstone GC and ancient-replay non-resurrection; exit is one durable `AgentDeliveryAuthority` with bounded aggregate admission and no second semantic queue | Cloudflare/runtime evidence for the selected `AgentDeliveryAuthority` host/profile where provider qualification is claimed |
| D0038@r1 | F | maintained Design foreign key: `docs/design/0038-default-executor-capacity-policy.md` | D0018 capacity-N semantics and D0020 aggregate Agent capacity remain independent owners; D0039 may consume the implemented default but does not own it | required fixed runner/runtime policy gate | omitted capacity selects 8 while explicit 1 and other positive safe integers remain the same admission model; widths 1/8/>8 preserve claims, retry, cancellation, fencing and canonical result/Promotion behavior; exit is one qualified fixed normal default with no adaptive controller or second queue | Android/Termux resource-pressure and selected Agent/provider composition evidence only where those layers are claimed |
| D0021 | F | provisional label | representative target-conflict workload and the selected runtime owner topology | conditional on real cross-Case target conflicts | two Cases contend for one target across owner restart and stale lease generation; exit is one durable exclusion owner or evidence that MVP does not need cross-Case exclusion | provider/runtime state only if activated |
| D0022 | E/F | provisional label | selected deployed context/artifact architecture | conditional on persistent content/artifact storage being required | missing/corrupt/stale object, duplicate publication and authorization denial with no semantic-state corruption; exit is a narrowly owned byte/query layer or evidence that it is unnecessary | storage provider configuration only if activated |
| D0023 | G | provisional label | integrated runtime projection; D0024 security work may co-design schemas and denial cases | required | duplicate request, stale expected revision and reconnect/resume against one real supported endpoint; exit is a versioned strict MCP command/projection surface that remains non-authoritative | supported MCP client configuration/verification |
| D0024 | G | provisional label | D0023 surface and selected supported identity flow; threat modelling may start earlier | required | authenticated tenant A attempts tenant B Case/Artifact access with zero semantic effect; exit is supported authentication plus tenant/Case denial, replay and credential revocation/rotation evidence | identity/provider/client configuration as selected |
| D0025 | C/F | provisional label | selected runtime effect owner/fencing plus inherited Promotion/Git contract; may advance beside later security/deploy work after authority is fixed | required | ambiguous publication followed by exact remote reread plus predecessor conflict and authorization denial; exit is one authenticated fenced runtime publication lane | GitHub app/token/SSH/branch-policy configuration as selected |
| D0026 | F/H | provisional label | selected Worker/DO/storage/publication/security bindings after the private D0027 Agent realization split into D0039@r6 | required broader deployment gate; D0039 owns the exact private D0027 credential/trust/genesis realization and does not complete this row | fresh non-production deployment from documented configuration plus controlled rollback for the remaining provider topology; exit is reproducible provider-visible deploy/config/rollback state beyond the private D0027 realization | Cloudflare account/project/routes/bindings/secrets and operator approvals |
| D0027@r1 | F/G/H | maintained Design foreign key: `docs/design/0027-installable-authenticated-local-agent.md` | D0020 connection/delivery contract; bounded D0023/D0024/D0025 research may proceed in parallel; D0039 realizes its concrete private credential/trust/provider/genesis boundary without revising D0027 | required local-Agent Design gate; lifecycle authorization remains owned by the maintained Design, and concrete deployed realization now has its own D0039 owner | fresh package verification/registration, stale credential/socket rejection, control/supervisor crash recovery with no PID-reuse authority, reinstall/update/downgrade fencing and secret exclusion; exit is an installable authenticated local Agent executing a bounded real Task under correct D0020 fencing and positive physical-cleanup evidence | machine permissions plus the selected route-scoped Agent credential/package trust inputs and any admitted local Git/model/tool credentials; canonical publication credentials remain D0025 |
| D0039@r6 | F/H | maintained Design foreign key: `docs/design/0039-d0027-deployment-realization.md` | D0020@r2 route/held-slot/current authority plus D0027@r1 installation lifecycle; D0038 may run independently and only supplies the separately owned numeric runner default | required private D0027 deployment-realization gate split from provisional D0026 | Q1-Q10 falsify canonical RSA/Ed25519 wire rules, clone-safe AndroidKeyStore custody, authenticated executed bootstrap/evidence, provider-intent fencing, provider-generated-V reconciliation, exact UNREGISTERED route-bootstrap fencing, repeated S/A/V/R admission checkpoints, mutation-bound RPC identity, persistent qualification reconciliation/no-live-takeover, same-route D0020 genesis migration, HMAC retirement and forward-only rollback/retention; exit is an executable-proof-backed D0027 realization with no second route owner or fallback authority | physical Android/Termux, Cloudflare Worker/DO/IAM, live migration/rollback and fresh-machine deployed composition evidence |
| D0028 | H | provisional label | deployed mandatory components and their recovery/rollback owners | required bounded operations gate | selected component outage with detection, bounded degradation and verified recovery/rollback; exit is actionable runbooks/observation without telemetry becoming semantic authority | operator/provider access needed to exercise recovery safely |
| D0035@r1 | F/G/H | maintained Design foreign key: `docs/design/0035-tdev-self-hosting-and-tmcp-retirement.md` | supported paths selected by D0020 and D0023-D0028, plus every activated D0021/D0022 conditional gate used by the final deployment | required self-hosting/tmcp-retirement gate before final qualification; lifecycle authorization remains owned by the Design | disable the tmcp operational plane, then use tdev-owned MCP/Case/Task/Agent/validation/Promotion/Git paths to produce and provider-reread one real tdev successor with representative failure reconciliation; exit is independent evidence that no required step used tmcp | supported client, machine/Agent, GitHub and provider access plus an operator-controlled tmcp disable observation |
| D0029 | H | provisional label | D0035@r1 plus all mandatory A-H exits and every activated conditional gate | required final gate | deterministic deployed success/failure/security/recovery/migration/rollback matrix before any load/SLO experiment; exit is accepted Level-4 evidence | unavoidable provider/account/client actions documented and independently verified |

A future accepted Design may merge/split/reorder provisional rows when one authority decision makes the existing boundary wrong. Update this program relation only through the applicable SDD classification; a Design number is never authorization by itself.

## 3. Dependency and parallelism graph

The numbers are not a serial queue. The current planning relation is approximately:

```text
D0019@r2 -----+-------------------------------+
              |                               |
D0030@r2 --(when required by selected store qualification route)
              |                               |
D0020@r2 -----+----> runtime spine <---- D0027
              |                 |             |
D0021? -------+                 +----> D0023 + D0024
D0022? -------+                 |
                                +----> D0025
                                |
                                +----> D0026
                                         |
                                         v
                                       D0028
                                         |
                                         v
                                     D0035@r1
                                         |
                                         v
                                       D0029
```

`?` marks an evidence-activated conditional gate, not optional correctness after activation.

Research may proceed ahead of an implementation dependency when it does not choose an unresolved authority/security/migration contract by implication. Canonical repository mutation/publication remains governed by the development workflow and current WORKBOARD route.

## 4. Current unresolved decision questions

Only questions that can still change the forward graph belong here:

- Does deployed/provider evidence show enough remaining semantic input volume or disclosure pressure to justify a separate ContextSlice decision, or does the accepted full-context reference contract remain sufficient for MVP?
- Does the selected deployed content/artifact path require persistent shared storage/query projection, activating D0022?
- Do representative MVP workloads contain real cross-Case target conflicts requiring D0021?
- Where should runtime Git publication effects execute under the final runtime/security model: authenticated local Agent, dedicated publication lane, or another fenced owner?
- Which MCP client and authentication flow is the supported MVP target for D0023/D0024 qualification?
- Which Cloudflare/storage/routing components are mandatory versus conditional after the actual deployment topology is selected and measured?
- Which provisional gates should be combined, split, reordered or removed because later evidence shows their authority boundaries are not independent?

Questions already decided by maintained Designs are not kept here as if they were open. Historical formulations remain recoverable in `docs/history/program-before-d0033.md` and the responsible Design/evidence records.

## 5. Coverage and omission-prevention rule

For every newly discovered requirement/finding that may affect final MVP:

1. identify the product owner or explicitly record that product meaning is unchanged;
2. map it to one or more existing ROADMAP Group IDs, or change ROADMAP through the appropriate accepted Design if the capability decomposition itself is wrong;
3. map it to an existing forward gate, create a provisional planning row, or explicitly reject/defer it with evidence;
4. give the forward gate a cheapest falsifier/exit shape and record any external-action dependency;
5. when Class 2 implementation becomes authorized, replace a provisional authority with the maintained accepted Design foreign key without copying the Design status into PROGRAM;
6. after execution, store observed results in evidence and maintained Design records rather than appending a mini-report here;
7. close Group/checkpoint state through `LINEAGE.md`, `WORKBOARD.md`, the responsible Design/evidence and `docs/development/WORKFLOW.md`, not by turning this register into a historical ledger.

The absence of an implementation mechanism never permits a requirement to disappear. Keep it `conditional`, `unknown`, or blocked at the responsible owner until evidence resolves it.

## 6. Relationship to completion and history

- Capability exits: `docs/ROADMAP.md`.
- Current runnable/selected gate: `WORKBOARD.md`.
- Maintained Design meaning/status: `docs/design/`.
- Development execution, isolated work, integration and publication procedure: `docs/development/WORKFLOW.md`.
- Checkpoint succession/preservation: `LINEAGE.md`.
- Verification methods: `docs/QUALIFICATION.md`.
- Observed results: `docs/evidence/`.
- Superseded planning narrative, including the pre-D0033 392-line register: `docs/history/program-before-d0033.md`.

A Group completion report or past Design verification is valuable history, but it is not a forward dependency edge and therefore does not accumulate in this file.