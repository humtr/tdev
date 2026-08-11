# MVP program roadmap

> Normative owner for final-MVP program decomposition, capability-group exit criteria, sequencing, and user/provider setup gates. Product scope remains owned by `SPEC.md`; component ownership remains owned by `ARCHITECTURE.md`; accepted implementation behavior requires a separate Design under `SDD.md`.

## 1. Final MVP definition

The final tdev MVP is a **deployed and qualified product**, not only a source-library milestone. Completion requires the verified parallel/durable semantic core to be integrated with the intended Cloudflare and local-Agent runtime, real Git publication, a secured MCP surface, deployment/configuration procedures, and representative end-to-end failure/recovery evidence.

The target includes, when required by the accepted runtime architecture:

- the existing parallel/durable Case execution and D0010 semantic/current-state authority;
- `CaseDO` (Case Durable Object) or an equivalent single authoritative Case runtime owner;
- `AgentDO` or an equivalent Agent connection/capacity/delivery owner;
- an authenticated local Agent for OS/Git/process/model effects;
- repository/model execution and the selected deterministic context-delivery contract;
- D0011/D0012-derived Git projection/publication integrated into the deployed runtime;
- Worker/API ingress and a real MCP projection/command surface;
- authentication, tenant/Case authorization, Task capability admission, secret handling, payload/rate bounds, reconnect/replay, and audit boundaries;
- Cloudflare storage/projection components such as R2/D1 only where the selected architecture actually needs them;
- provider, GitHub, Cloudflare, MCP-client, Agent-machine, and secret configuration procedures;
- migration, rollback, operational recovery, and fresh-environment deployment evidence;
- a final deployed end-to-end qualification matrix.

Some provider/account operations necessarily require a user or operator. Those steps remain part of MVP acceptance: they must be documented with required permissions, inputs, expected results, verification, rollback/revocation, and secret-exposure warnings.

## 2. Program hierarchy

Roadmap work is organized as:

```text
MVP Program
  -> Capability Group
       -> Design
            -> Verification Gate
```

A capability group is a durable product ability, not a branch or version. A Design is one accepted Class 2 decision that may implement all or part of a group. A verification gate is observable evidence. **Provisional Design IDs in this roadmap are planning labels only and do not authorize implementation.** `SDD.md` still requires an accepted Design record before Class 2 code changes.

## 3. Completion levels

| Level | Meaning | Current use |
| --- | --- | --- |
| 0 — Verified Core | source semantics, local authority, Git/repository/model substrate independently verified in declared environments | substantially reached through D0014/D0015 review |
| 1 — Integrated Runtime | CaseDO/AgentDO/local Agent/model/Git execution path integrated in target runtime | open |
| 2 — Secured Product Surface | MCP/auth/tenant/secret/provider boundaries implemented and independently falsified | open |
| 3 — Deployable MVP | fresh environment can be configured and deployed from documented steps, including required user actions | open |
| 4 — Qualified MVP | deployed E2E success, failure, recovery, security, migration and rollback matrix accepted | open |

For this project, **“MVP complete” means Level 4**. Source completion, deployment, and production qualification must not be conflated.

## 4. Capability groups

| Group | Capability | Current status | Existing foundation | Final-MVP exit condition |
| --- | --- | --- | --- | --- |
| A | Parallel execution and durable core | VERIFIED source foundation | D0001-D0008 | provider adapters preserve one scheduler/lifecycle meaning and the existing oracle |
| B | Semantic authority and persistence | VERIFIED local / runtime integration open | D0009-D0010 | target Case runtime durably hosts or explicitly migrates the D0010 authority with restart/response-loss evidence |
| C | Git and publication | SOURCE VERIFIED / deployment open | D0011-D0012 | deployed fenced Promotion -> Git candidate -> authenticated remote publication path is reconciliable and least-privilege qualified |
| D | Repository and model execution | LOCAL VERIFIED | D0013-D0014 | selected actual executor/provider path preserves result-only/fencing/cancellation/resource contracts |
| E | Context delivery and model input | READY | D0014 post-review baseline | per-Attempt delivery/disclosure contract selected from measured post-D0014 costs and independently verified |
| F | Cloudflare runtime and local Agent topology | NOT IMPLEMENTED | architecture mapping only | CaseDO/AgentDO/local Agent ownership, delivery, restart, capacity and fencing are deployed and verified |
| G | MCP, authentication and security | DOCUMENTED BOUNDARY / NOT IMPLEMENTED | `MCP.md`, `SECURITY.md` | real secured MCP endpoint passes auth/tenant/replay/stale-fence/limit/reconnect/current-client gates |
| H | Deployment, operations and final qualification | NOT IMPLEMENTED | deployment requirements only | fresh deploy, user/provider setup, migration/rollback/runbooks and full deployed qualification pass |

A group may be implemented through multiple Designs. Conversely, one Design may close adjacent gates when one coherent authority decision makes separation artificial.

## 5. Post-D0014 baseline and next decision

D0014 removes a structural repository-preparation amplification axis for same exact bases: validated evidence retains the `48 -> 5` same-base-eight Git-call result and retry preparation `4x -> 1x`. It does **not** remove one complete canonical request or one model process start per Attempt.

The next decision therefore starts from the remaining cost, not from the pre-D0014 roadmap. Candidate mechanisms must include at least:

1. **full-context reference transport** — retain model-visible full-context semantics while reducing repeated request copying/transfer/parse;
2. **immutable manifest plus content references** — bind content identity while separating request metadata from bytes;
3. **deterministic ContextSlice** — reduce model-visible bytes/disclosure, but only with a completeness/dependency/fallback/quality contract;
4. **warm executor/process** — remeasure startup/initialization now that preparation is cheaper;
5. **streaming/lazy delivery** — reduce peak copies/backpressure while preserving explicit semantics;
6. **hybrid/staged approaches** — e.g. semantic-preserving reference transport first, then remeasure before accepting ContextSlice risk.

Persistent cross-worker CAS remains evidence-gated. D0014 process-local reuse already removes much repeated work, while persistent CAS adds publication, corruption, permissions, partial-write, reader-protection, GC, disk-pressure, migration and rollback contracts.

## 6. Provisional remaining Design program

These IDs describe a planning envelope. D0016 is now an accepted decision and is retained below as the completed entry gate for Group E; the remaining IDs are not accepted decisions unless their owner records otherwise and may be merged, split, reordered, made conditional, or moved post-MVP from new evidence.

| Provisional ID | Group | Planning question | MVP criticality |
| --- | --- | --- | --- |
| D0016 | E | Per-Attempt Context Delivery Minimization Decision | **accepted 2026-08-11** — immutable full-context reference envelope |
| D0017 | E | Selected Context Delivery Contract | **required next** — define authorized immutable reference + receiver representation |
| D0018 | D/E | Model Executor / External Provider Runtime Contract | required for the accepted final execution profile |
| D0019 | B/F | CaseDO Authority Adapter | required |
| D0020 | F | AgentDO Connection, Capacity and Delivery Owner | required |
| D0021 | F | Distributed Target Claims / Runtime Fencing | conditional on final cross-Case conflict workload |
| D0022 | F/E | Artifact/Content Storage and Query Projection (R2/D1/equivalent) | conditional on selected content/artifact architecture |
| D0023 | G | MCP Command and Projection Surface | required |
| D0024 | G | MCP Authentication, Authorization and Tenant Security | required |
| D0025 | C/F | Runtime Git Publication Integration | required |
| D0026 | F/H | Cloudflare Deployment Package and Configuration | required |
| D0027 | F/G/H | Local Agent Runtime and Secure Registration | required |
| D0028 | H | Operational Observability and Recovery | required bounded operations gate |
| D0029 | H | Full Deployed MVP Qualification | required final gate |

The realistic planning envelope is roughly **10-14 additional Design-sized gates after D0015**, depending on merges and conditional owners. The count is not an acceptance metric; capability-group exit criteria are.

## 7. Ownership targets for the deployed topology

The default architecture hypothesis, to be independently designed rather than assumed, is:

```text
MCP client / API
      |
   Worker ingress
      |
    CaseDO  -------------------> fenced Git publication lane
      |
      +---- Task/Attempt delivery ----> AgentDO
                                        |
                                        v
                              authenticated local Agent
                                        |
                              Git / process / model/provider
```

Ownership must remain separated:

- `CaseDO`: Case graph/lifecycle/results/receipts and the accepted semantic authority host; not Agent connection truth;
- `AgentDO`: Agent connection epoch, bounded delivery queue/capacity and delivery receipts; not Task lifecycle or accepted result authority;
- local Agent: actual OS/Git/process/network effect truth; not canonical Case state;
- target owner (`AgentDO`, `ProjectDO`, dedicated `TargetDO`, or equivalent): only if cross-Case exclusion needs one durable lease owner;
- R2/equivalent: immutable bytes only if selected; object existence is not semantic authority;
- D1/equivalent: locator/query projection only if selected;
- Worker/MCP: stateless or replayable ingress/projection; not readiness, lifecycle, Claims or canonical-tree authority.

If a provider implementation cannot preserve these boundaries and instead changes semantic authority, the change must be explicitly classified as an authority migration.

## 8. User/provider configuration gate

Every required external setup step must be tracked in this form:

| Field | Requirement |
| --- | --- |
| Actor | user, operator, CI, deployment automation, or provider administrator |
| Permission | minimum provider/GitHub/Cloudflare/MCP permission needed |
| Inputs | non-secret identifiers plus separately handled secret inputs |
| Action | exact CLI/API/UI operation or documented manual step |
| Expected result | provider-visible state after success |
| Verification | independent read/check proving the expected state |
| Rollback/revoke | safe reversal or credential revocation procedure |
| Secret warning | where the value must not be persisted or logged |

Credential material must not enter Plan inputs, Case snapshots, semantic Events, evidence, repository content, model observations, or clear remote intents.

## 9. Dependency and parallelism posture

The roadmap is not a serial Design-number queue. A likely dependency spine is:

```text
D0016 -> D0017/D0018
               |
        +------+------+
        |             |
      D0019         D0020
      CaseDO         AgentDO
        +------+-+----+
               |
       D0022/D0027 as selected
               |
         D0023 + D0024
               |
             D0025
               |
             D0026
               |
             D0028
               |
             D0029
```

Cloudflare authority research, Agent topology research, and MCP threat-model work may proceed in parallel when they do not preempt an unresolved owner decision. D0021 and D0022 stay conditional until the actual workload/architecture requires them.

## 10. Final deployed qualification

D0029 or its eventual equivalent must exercise at least:

- a clean successful Case with parallel Tasks;
- same-base parallel model work;
- Task retry and cancellation;
- Agent disconnect/reconnect/restart and stale delivery;
- CaseDO restart/response loss and duplicate command replay;
- provider/model failure and bounded output/input/resource rejection;
- wrong repository base/context identity;
- stale Attempt/fencing/claim denial;
- Git publication conflict, authorization denial and ambiguous response reconciliation;
- unauthenticated and cross-tenant MCP denial;
- deployment restart and supported migration;
- rollback/revocation procedures;
- final remote repository content equal to the accepted Promotion projection.

Small deterministic falsifiers should precede load tests. Production SLOs are not implied by bounded development benchmarks.

## 11. Post-MVP candidates

Unless a preceding Design produces contrary evidence, the following are not automatically MVP blockers:

- fleet-wide persistent context CAS solely for cache hit rate;
- cache-locality scheduling;
- speculative execution;
- multi-provider routing;
- large fleet warm pools beyond what the selected execution profile requires;
- advanced distributed indexing/GC unrelated to MVP correctness;
- platform parity outside the accepted Cloudflare/local-Agent target.

The roadmap is a decision structure from verified evidence to the next falsifiable gate, not a promise that every provisional mechanism will be implemented.
