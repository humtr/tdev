# dev-2 workboard

Execution status and routing only. `DIRECTIVE.md@r1 > RULE.md > Designs`; this file neither defines product semantics nor ranks Design authority. Dependency identity comes from each Design's `Depends-On`, not its number or the sequence below.

## Current state

- Fresh authority foundation: parentless root `9a42b05d403370b7b4a698b4d7440d58aa4a79b5`, tree `caca5a5d3f32c4b63f0dbfaeed290a22f6cd1e1c` verified on 2026-09-11. This is the foundation, not an assertion of the future/current branch HEAD.
- Architecture: D0001 through D0007 accepted; `docs/ARCHITECTURE.md` maps requirements, `docs/design/INDEX.md` projects the acyclic metadata graph.
- Product implementation: **STARTED; F0 complete in this snapshot**. Checked shared contracts, locked dependencies, deterministic fixtures and canonical validation entrypoint exist. No usable canonical broker is installed yet.
- Implemented F0 core: **11 tests PASS**, checked JSDoc and document checks PASS under pinned Node 24.21.0. Full integration/release/live/benchmark remain **NOT RUN / NOT PROVEN**; `npm run check` correctly returns 2 until integration exists. See `docs/evidence/f0-2026-09-11/README.md`.
- Baselines: exact current source/runtime observations and uncertainty in `docs/evidence/2026-09-11-architecture-basis.md`; refresh before benchmarking.
- Current next frontier: **P1-P8**, using this published F0 shared-contract snapshot. No architecture approval is missing.

## Next session bootstrap

Read actual remote `dev-2` HEAD/parents/tree, then AGENTS, DIRECTIVE, RULE, this board and selected Designs through the derived index. Verify the parentless foundation is the only root. Do not reset to the foundation or merge `development`. Run `python docs/design/check.py` and `git diff --check`. Preserve unrelated local work. The full repository, not a past chat or task ID, is sufficient to resume.

During initial construction only, authorized tmcp/GitHub/project-local tooling may bootstrap and publish dev-2. Work in independent clean-root-descended branches/workspaces with exact base identities and expected remote updates. Do not copy old source directories or dependency manifests. Once the MCP path exists, move ordinary work to it; record each break-glass exception and its reason.

## F0 - shared contract and build seed (complete)

One integration owner creates only the minimum skeleton required by the accepted contracts: package/lock, pinned toolchain/profile descriptors, `src/contracts/` identifiers/envelopes/ports, small deterministic fixtures, and `tools/validate.mjs` dispatch with missing implementations reported as NOT RUN, never success. There is no new architectural decision hidden in this step.

Freeze internal port signatures for authorization, repository read/object store, ledger transaction/admission, sandbox launch/inspect/cancel, profile evaluation, ref compare/update/readback, and release-helper observation. Use dependency-injected fake clocks/providers for core tests. Define serialized digest/revision types once using D0001 canonical-record encoding; include the D0003 prepared-result descriptor and explicit result reuse in the shared ports. Cross-module ports transport the exact identities specified by D0001-D0006; do not introduce a Case/Agent adapter.

F0 exit: dependency install is reproducible; core contract tests and documentation check run from the canonical entrypoint; fake-provider fixtures have deterministic seeds; eight lane branches can consume the same contract commit. Product-complete and integration tests remain explicitly unimplemented where appropriate. Seal exact image/package hashes when obtained on an authorized host; never invent a digest.

F0 implementation is in `src/contracts/`, `config/`, `tools/`, `test/core/` and `test/fixtures/`. Shared files are frozen for the first P frontier; update them once through the integration owner when a concrete peer need appears. `jose` and `ajv` are locked for the required maintained OAuth/JWT verifier and closed-schema validator, not extra runtime orchestration. Production image/package seals remain unset, so release cannot pass accidentally.

## P frontier - eight independent implementation lanes

Run up to eight ready lanes concurrently when the execution environment permits. These are temporary development work assignments, not durable product lane IDs. Each owns its files and tests; do not share a writable checkout. Stubs/fakes against F0 ports allow concurrency before peer implementations land. A peer's implementation is required for joined verification, not for beginning independent contract work.

| Lane | Designs to read | Exclusive first file ownership | Deliverable and cheapest falsifier |
| --- | --- | --- | --- |
| P1 | D0005, relevant D0001/D0006 | `src/security/`, `src/execution/`, corresponding auth/sandbox tests | Scoped auth and profile launcher; deny cross-work paths/credentials, bound logs, confirm exact termination; no unsandboxed fallback. |
| P2 | D0001 | `src/work/`, `src/storage/`, state/SQLite tests | Revision/dedup tables, capacity reservations, ready selector and reconciliation; crash between admission/launch, prove C1/8/16/32 identity invariance. |
| P3 | D0002, D0005 | `src/repository/`, context/Git-read tests | Exact dynamic binding/snapshots, list/search/range/cursors; stale or denied context never leaks bytes and no source bake. |
| P4 | D0002, D0005 | `src/candidate/`, candidate/materialization tests | Immutable entry CAS, generation sealing and private materialization; race eight candidates, symlink/topology and partial-write failures. |
| P5 | D0003, D0007 | `src/validation/`, `tools/validate.mjs`, validation tests | Trusted full-tree receipts, adopted profiles and canonical local/CI command; mutated tracked input, wrong policy or fake receipt fails. |
| P6 | D0003, D0001/D0002 | `src/integration/`, ref-composition/effect tests | Pure target composer, commit frozen before validation and provider CAS/reconciliation; reuse one prepared result across distinct actions, and prove independent same-ref progress while a lost response remains unresolved. |
| P7 | D0004, all referenced contracts | `src/mcp/`, public schema/transcript tests | Four closed tools with modern and legacy protocol envelopes, per-item batch admission and reconnect selectors; missing/unknown fields fail without effects. |
| P8 | D0006, D0007 | `src/runtime/`, `deploy/`, release-helper tests | Broker composition/bootstrap, capability preflight, immutable stage/activation/rollback helper; kill at pointer switch and prove one writer. |

Only F0 integration owner edits `src/contracts/`, package/lock and shared toolchain/profile descriptors after lanes branch. P5 owns the validation entrypoint after F0; other lanes contribute per-layer test modules, not competing entrypoints. Required signature changes are proposed as exact contract diffs, reviewed against owning Design and merged once; they are not silently patched in each branch.

P exit per lane: focused core/integration tests and negative cases, no unresolved owner ambiguity, declared file scope preserved. Do not assert production sandbox/live pass from fakes. Merge/reconcile independent completed lanes with full exact-tree validation; completion order need not match P numbering.

## Join and first usable path

J1: Join P1-P7 behind P8 broker composition. Run all core/integration layers, real SQLite reopen and Git CAS fixtures; enforce truthful annotations and source/ledger isolation. Start test-only benchmark driver under `bench/` after a lane frees; it uses public ports and cannot enter runtime dependencies.

J2: On an authorized Linux sandbox host, run release/OS tests. Demonstrate eight actually overlapping validations and independent witness progress while one action fails or restarts. Run same-ref eight-way integration through stale outcomes until all intended disjoint edits complete; include every retry and full revalidation in metrics. If repeated validation/round trips defeat D0007, revise D0003 transparently rather than weakening checks or adding undocumented serialization.

J3: Provision first canonical dev-2 installation under transition authority, with verified OAuth issuer, stable HTTPS origin, approved Git binding/credentials, append-only ref enforcement and resource capacity. No live host/domain/credential is assumed present. These installation inputs gate live tests only; F0/P work proceeds without them. No new paid resource or account mutation is implicitly authorized by this board.

J4: Use actual ChatGPT and canonical dev-2 MCP for a real source change, progressive new-path discovery, required validation, exact integration and terminal readback. Then stage/activate its integrated runtime change through that same MCP and prove recovery. No tmcp/direct GitHub/manual redeployment in this ordinary proof. Return to break-glass only on a concrete unavailable/broken capability, record the gap, do not claim self-development completion.

J5: Refresh both predecessor baseline identities; freeze D0007 benchmark manifest; execute matched/default resource experiments and hard gates. A capability-only win or unsupported baseline does not prove both-baseline latency superiority. Mark Designs verified only at their actual exercised scope, and update this board with evidence pointers, not diaries.

## Blockers and stop rules

No missing decision blocks implementation. Live deployment needs an authorized capable Linux host, DNS/origin, OAuth configuration and repository-scoped credentials; none is asserted provisioned. Benchmark distributions are unmeasured. Do not weaken tests to fit the current ChatGPT container. Do not purchase/provision new infrastructure without the applicable authorization.

Stop only the affected lane/effect on lost authority, unexpected remote ancestry, unknown provider effect, missing isolation, integrity failure or resource exhaustion. Preserve durable work and continue genuinely independent authorized work. A changed Directive or material contract conflict requires updating its owning documents, not a hidden implementation workaround. No product implementation was performed in the architecture-documentation session.
