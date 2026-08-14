# tdev final-MVP roadmap

> Normative owner for the stable final-MVP capability decomposition, completion levels, Capability Group exit intent, cross-capability sequencing constraints, external-setup acceptance shape, final deployed exit, and post-MVP boundary. Product meaning remains in the named product owners. `WORKBOARD.md` alone owns the mutable current development route and runnable frontier; `docs/development/PROGRAM.md` owns forward Design/gate dependency coverage.

## 1. Final MVP definition

The tdev MVP is a **deployed and qualified parallel-first Work Graph product**, not only a source-library milestone.

Final completion requires the cumulative product to preserve the verified semantic core while integrating the intended Cloudflare/local-Agent topology, real Git publication, a secured MCP surface, reproducible deployment/configuration, operational recovery, and representative deployed success/failure/security/migration/rollback evidence.

The product owners named in `docs/DOCUMENTATION.md` define the exact runtime contracts. This roadmap does not restate those contracts or choose a provider mechanism before its responsible Design/product owner does.

## 2. Completion levels

| Level | Meaning |
| --- | --- |
| 0 — Verified Core | source semantics and local substrate are independently verified in their declared environments |
| 1 — Integrated Runtime | Case authority, Agent delivery, local execution/model work and Git execution are integrated in the target runtime |
| 2 — Secured Product Surface | supported MCP/auth/tenant/secret/provider boundaries are implemented and independently falsified |
| 3 — Deployable MVP | a fresh supported environment can be configured, deployed, operated and rolled back from documented procedures, including required user/operator actions |
| 4 — Qualified MVP | representative deployed success, failure, recovery, security, migration, rollback and final publication evidence is accepted |

**“MVP complete” means Level 4.** A lower-layer source or adapter pass never implies deployed-product completion.

## 3. Capability Groups

This is the sole live A-H capability/exit table. Group identifiers are durable planning keys, not current branch state and not Design lifecycle status.

| Group | Capability | Stable final-MVP exit condition |
| --- | --- | --- |
| A | Parallel execution and durable core | target adapters preserve one scheduler/lifecycle meaning, durable-before-dispatch behavior, isolated ordinary results, single canonical Promotion and the existing semantic oracle |
| B | Semantic authority and persistence | the target Case runtime durably hosts or explicitly migrates the accepted Case authority with restart, receipt/replay, ambiguity and response-loss evidence and no competing writable semantic owner |
| C | Git and publication | Promotion-derived candidates reach authenticated remote Git publication through one fenced, least-privilege and reconcilable publication lane |
| D | Repository and model execution | the supported executor/provider path preserves exact repository/context identity, result-only behavior, fencing, cancellation/retry and bounded resource contracts |
| E | Context delivery and model input | the selected context-delivery/executor boundary remains semantically equivalent, authorized, bounded and restart/retry safe for its declared supported scope |
| F | Cloudflare runtime and local Agent topology | Case authority, Agent connection/delivery, local Agent execution, restart/capacity/fencing and required runtime integrations are deployed and independently verified |
| G | MCP, authentication and security | a real supported MCP endpoint passes version/schema, authentication, tenant/Case authorization, replay, stale-fence, bound, reconnect and current-client gates |
| H | Deployment, operations and final qualification | fresh setup/deploy, provider/user configuration, operations/recovery, supported migration/rollback and the complete Level-4 deployed qualification matrix pass |

Detailed predecessor checkpoints, completed Design evidence and maintained Design status belong to `LINEAGE.md`, Design records, evidence and history rather than this table.

## 4. Stable dependency posture

Capability development is **parallel where ownership permits, cumulative where exit dependencies require**.

The stable dependency shape is:

```text
A + B + C + D + E foundations
            |
            v
F integrated runtime
     |            \
     |             +--> C publication integration may advance with the runtime once its owner/fence is fixed
     v
G secured product surface
     |
     v
H deployability + operations + final qualification
```

This diagram is capability ordering, not a Design-number queue. Research and independently owned Designs may proceed in parallel when they do not preempt an unresolved owner/security/migration decision. Exact runnable Design revisions and scheduling come only from `WORKBOARD.md`.

Development checkpoint succession is separately owned by `LINEAGE.md`; capability completion cannot be inferred from a branch name.

## 5. External setup acceptance shape

Unavoidable provider/account/machine configuration remains part of final-MVP acceptance. Exact mechanisms are owned by `DEPLOYMENT.md`, `SECURITY.md`, `OPERATIONS.md`, the responsible Design and provider evidence.

Every required external step must identify:

| Field | Required meaning |
| --- | --- |
| actor | user, operator, CI/deployment automation, provider administrator, or supported client |
| permission | minimum Cloudflare/GitHub/provider/MCP/local-machine permission needed |
| non-secret inputs | stable identifiers and configuration names; secret values are handled separately |
| action | exact supported CLI/API/UI/manual operation |
| expected result | provider- or machine-visible state after success |
| verification | an independent read/check proving that state |
| rollback/revoke | safe reversal, disablement, credential rotation or revocation procedure |
| secret warning | where sensitive values must not be persisted, logged, committed or exposed to model/context state |

Credential material must not become Plan/Case semantic state, evidence payload, repository content or clear remote intent.

## 6. Final deployed Level-4 exit

The final deployed qualification must cover, at minimum, one representative supported path for each applicable row below. `docs/QUALIFICATION.md` owns verification-method semantics; exact evidence belongs under `docs/evidence/` or the responsible provider/runtime record.

- clean Case success with parallel Tasks and isolated results;
- same-base parallel repository/model work with accepted-result order independence;
- Task retry and cancellation;
- Agent disconnect/reconnect/restart, stale delivery and bounded capacity behavior;
- Case runtime restart/response loss and duplicate command replay;
- provider/model/context/resource rejection without invented semantic success;
- wrong repository base/context identity and stale Attempt/fencing denial;
- Git predecessor conflict, authorization denial and ambiguous publication reconciliation;
- unauthenticated and cross-tenant MCP denial with zero unauthorized semantic effect;
- deployment restart and every supported migration path;
- rollback/revocation procedures that are actually supported by the deployed state/schema;
- final remote repository content equal to the accepted Promotion projection.

Small deterministic falsifiers precede load/SLO experiments. Development benchmark results do not imply production SLOs.

## 7. Post-MVP boundary

Unless an accepted product Design produces contrary evidence, the following are not automatic MVP blockers:

- fleet-wide persistent context CAS solely for cache hit rate;
- cache-locality scheduling;
- speculative execution;
- multi-provider routing;
- fleet-scale warm pools beyond the selected supported execution profile;
- advanced distributed indexing/GC unrelated to MVP correctness;
- platform parity outside the accepted Cloudflare/local-Agent target.

Conditional capability required for correctness becomes MVP work when evidence activates its gate; it is not deferred merely because its provisional Design label existed later in a numbered list.

## 8. Relationship to other owners

- `docs/SPEC.md` and the named product documents own product meaning and non-goals.
- this file owns **what capability exits define the final MVP**.
- `docs/development/PROGRAM.md` owns **which forward Design-sized gates cover those exits and how they depend on one another**.
- a maintained `docs/design/<id>-<name>.md` owns an accepted Class 2 decision/revision/status.
- `WORKBOARD.md` owns **what is runnable/selected now**.
- `docs/QUALIFICATION.md` owns verification methods and proof-layer boundaries.
- `docs/evidence/` records what was actually observed.
- `docs/history/` and Git preserve former planning/current states without becoming current authority.

A route transition, Design status update, test result or benchmark does not require editing this roadmap unless the stable capability decomposition/exit meaning itself changes under an accepted Design.
