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
| D0020 | F | provisional label | Case authority and Agent delivery ownership must remain separate; research may proceed beside D0019 | required | two connection epochs plus disconnect/reconnect, stale delivery/result and queue/capacity saturation; exit is one durable Agent connection/delivery owner with stale-instance fencing and bounded live-work admission | Cloudflare/runtime evidence once an AgentDO-equivalent owner is selected |
| D0021 | F | provisional label | representative target-conflict workload and the selected runtime owner topology | conditional on real cross-Case target conflicts | two Cases contend for one target across owner restart and stale lease generation; exit is one durable exclusion owner or evidence that MVP does not need cross-Case exclusion | provider/runtime state only if activated |
| D0022 | E/F | provisional label | selected deployed context/artifact architecture | conditional on persistent content/artifact storage being required | missing/corrupt/stale object, duplicate publication and authorization denial with no semantic-state corruption; exit is a narrowly owned byte/query layer or evidence that it is unnecessary | storage provider configuration only if activated |
| D0023 | G | provisional label | integrated runtime projection; D0024 security work may co-design schemas and denial cases | required | duplicate request, stale expected revision and reconnect/resume against one real supported endpoint; exit is a versioned strict MCP command/projection surface that remains non-authoritative | supported MCP client configuration/verification |
| D0024 | G | provisional label | D0023 surface and selected supported identity flow; threat modelling may start earlier | required | authenticated tenant A attempts tenant B Case/Artifact access with zero semantic effect; exit is supported authentication plus tenant/Case denial, replay and credential revocation/rotation evidence | identity/provider/client configuration as selected |
| D0025 | C/F | provisional label | selected runtime effect owner/fencing plus inherited Promotion/Git contract; may advance beside later security/deploy work after authority is fixed | required | ambiguous publication followed by exact remote reread plus predecessor conflict and authorization denial; exit is one authenticated fenced runtime publication lane | GitHub app/token/SSH/branch-policy configuration as selected |
| D0026 | F/H | provisional label | selected Worker/DO/Agent/storage/publication/security bindings | required | fresh non-production deployment from documented configuration plus controlled rollback; exit is reproducible provider-visible deploy/config/rollback state | Cloudflare account/project/routes/bindings/secrets and operator approvals |
| D0027 | F/G/H | provisional label | D0020 connection/delivery contract and selected local execution/security boundaries | required | fresh machine registration, reconnect with new epoch, stale Agent rejection and secret-exclusion check; exit is an installable authenticated local Agent executing a bounded real Task under correct fencing | machine permissions plus selected Git/model/tool credentials |
| D0028 | H | provisional label | deployed mandatory components and their recovery/rollback owners | required bounded operations gate | selected component outage with detection, bounded degradation and verified recovery/rollback; exit is actionable runbooks/observation without telemetry becoming semantic authority | operator/provider access needed to exercise recovery safely |
| D0029 | H | provisional label | all mandatory A-H exits and every activated conditional gate | required final gate | deterministic deployed success/failure/security/recovery/migration/rollback matrix before any load/SLO experiment; exit is accepted Level-4 evidence | unavoidable provider/account/client actions documented and independently verified |

A future accepted Design may merge/split/reorder provisional rows when one authority decision makes the existing boundary wrong. Update this program relation only through the applicable SDD classification; a Design number is never authorization by itself.

## 3. Dependency and parallelism graph

The numbers are not a serial queue. The current planning relation is approximately:

```text
D0019@r2 -----+-------------------------------+
              |                               |
D0030@r1 --(when required by selected store qualification route)
              |                               |
D0020 --------+----> runtime spine <---- D0027
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
                                       D0029
```

`?` marks an evidence-activated conditional gate, not optional correctness after activation.

Research may proceed ahead of an implementation dependency when it does not choose an unresolved authority/security/migration contract by implication. Canonical repository mutation/publication remains governed by the development workflow and current WORKBOARD route.

## 4. Current unresolved decision questions

Only questions that can still change the forward graph belong here:

- Does deployed/provider evidence show enough remaining semantic input volume or disclosure pressure to justify a separate ContextSlice decision, or does the accepted full-context reference contract remain sufficient for MVP?
- Does the selected deployed content/artifact path require persistent shared storage/query projection, activating D0022?
- What exact connection epoch, delivery receipt, bounded queue/capacity and live-resource facts belong to the Agent connection/delivery owner versus the local Agent/executor, to be resolved by D0020?
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
