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

## Current post-P3/P4 parallel assignments

P3/P4 source is published at `1b717ad1d4c29520de859225413fc3bd4f0b3d10`;
the native 10,000-file context join and Linux CI coverage are published at
`7d76744a38708db3f988582e6ae0720e173a29d9`. These commits are the shared source,
not the earlier prototypes. Canonical core passed 69 tests; actual native
repository/candidate/context module coverage passed 14 tests on Linux CI.

To continue useful work while the other root task resolves its orphaned workspace
handles, c819e5 now also owns **retained P1/P2 primitive hardening and publication**
in fresh task-owned `tmcp/dev2-p1-c819e5` / `tmcp/dev2-p2-c819e5` workspaces. It
uses only the dev-2 candidate copies already retained in its own authorized
workspace, not direct access to another root task's protected files. These copies
are candidate input, not current authority or proof. They must pass current
Designs and actual checks before joining. Do not duplicate or overwrite them in
the integration lead's workspace.

The k47 execution remains the **P5/P6/P7/P8 and overall broker integration lead**.
Consume the exact published P1/P2/P3/P4 contracts, combine complementary changes,
and fresh-rebind the canonical ref at each integration. Shared contract changes
are bounded, additive and documented with the owning Design. The earlier split
below describes the already-completed phase, not a conflicting current assignment.
No normal dev-2 runtime, live sandbox, ChatGPT experiment or superiority claim is
implied by module tests or by the existence of task/worktree records.

## Active implementation split (2026-09-11 current frontier)

Two live bootstrap executions were freshly observed against the same published
base. To avoid duplicate product implementations, `tmcp/dev2-impl-c819e5` owns
**P3 repository/context and P4 candidate/materialization** (`src/repository/`,
`src/candidate/`, corresponding tests), then complementary join/fault verification.
The concurrent `tmcp/dev2-impl-k47` execution is the integration lead for
**P1/P2/P5/P6/P7/P8 and broker join**. Existing dirty predecessor *dev-2* lane
workspaces remain untouched. This is temporary execution routing, not durable
product identity. Rebind these active branches before duplicating their scopes.

P3 will expose `GitRepository` from `src/repository/git.mjs`: existing RepositoryPort
methods plus `putBlob(bytes) -> SourceEntry-without-path/mode`,
`writeTree(entries) -> SourceTree`, `readTree(treeOid) -> SourceTree`, and
`freezeCommit(parent,tree,metadata,resultId) -> Oid`. Bindings are supplied to the
RepositoryPort methods; the store is installation-selected, not client-selected.
P4 exports `editTree(repository, source, edits) -> SourceTree`,
`materialize(repository, source, destination) -> destination`,
`inspectMaterialization(source, destination) -> manifestDigest`, and
`composeTrees(base,candidate,head) -> SourceEntry[]` with exact path-level conflict
checking. P3/P4 preserve existing shared ports; no competing F0 contract is added.
Names are implementation coordination only and remain replaceable under the owning
Designs. Focused implementation commits will be published promptly for the join.

The integration lead's active owned workspace is now `tmcp/dev2-impl-k47-join`.
The former `tmcp/dev2-impl-k47` managed workspace was reported orphaned by tmcp;
its bytes and independent lane prototypes were preserved without further mutation.
The lead accepts the P3/P4 interfaces above and will consume the peer's exact
published commit, not replace those directories with its earlier unselected
prototype. P1/P2/P5/P6/P7/P8 continue on eight task-private `tmcp/dev2-k47b-p*`
workspaces with early joined checking. For integration, Git metadata timestamps
are epoch milliseconds; `freezeCommit` converts to Git epoch seconds exactly once.
Public projection shapes are derived from the selected ContextService output, not
an adapter to competing context semantics. This paragraph is coordination only.

## P3/P4 implementation ready for early module join

`tmcp/dev2-impl-c819e5` now supplies actual Git repository/context and isolated
candidate/materialization source, with real SHA-1/SHA-256 object tests and bounded
core context tests. `src/repository/context.mjs` consumes the existing immutable
ObjectStorePort rather than adding a context ledger. `src/contracts/errors.mjs`
and `envelopes.mjs` gain only optional closed expected/current-head/time facts;
existing call signatures remain compatible and provider text remains redacted.
The integration lead must retain these facts in its closed error output schema.

P3/P4 join names follow the active split above. Source `Snapshot` is internal;
the MCP projection must not return its full `source.entries` inventory. Git fetch
uses the installed binding and verifyRemote hook; production provider identity,
transport credentials and read-grant boundaries are injected by P1/P8. Direct
Git commands are not exposed as a public tool. P4 verifies exact materialization
but does not claim an OS sandbox. Only P1's sealed runner can supply that boundary.

The completed local P3/P4 sub-frontier does not close J1-J5. Integrate with the
concurrent P1/P2/P5/P6/P7/P8 implementation; run joined end-to-end and same-ref
full-validation tests before claiming the development loop works. Evidence and
reproduced fixes are under `docs/evidence/p34-c819e5/`.

## Current concurrent bootstrap scopes

The published F0 contract at `2a2e0dd513c969e77f9c39042cabb1780d9c8cfe` remains
canonical. The independent `tmcp/dev2-f0-73c9a2e6` alternative is retained but is
**not selected for integration**; do not replace the published ports with it.
P1-P8 implementation workspaces already exist on `tmcp/dev2-p*-20260911` branches;
preserve their uncommitted work and bind their actual current state before joining.
The separate `tmcp/dev2-evidence-73c9a2e6` scope supplies pinned Linux core CI,
`bench/diagnostics.mjs`, its focused tests, and the validation input-inventory fix.
P5 must preserve coverage of checked benchmark inputs when replacing the F0 driver.
These diagnostics do not claim actual ChatGPT usability, same-ref performance,
OS isolation, or superiority; no benchmark trial is added to ordinary validation.

## P7 current sub-frontier

P7 is **partially implemented, not complete**. The canonical pinned core entrypoint
passes 52 tests (20 new input + 14 new wire + 18 existing), checked JSDoc and
document checks; this is not integration/release/live acceptance. `src/mcp/input-schemas.mjs` supplies
four closed input contracts, ten tagged work variants, advertised defaults and
per-item independent authorization/admission hooks. `src/mcp/protocol.mjs` supplies
the stateless modern/legacy wire codec, mirrored-header and origin guards and
request-ID-preserving errors. Their source and focused core tests were developed
in the isolated `tmcp/dev2-p7-contract-73c9a2e6` worktree, from the published F0 line.
No existing P1-P8 workspace was mutated. See `src/mcp/README.md` for composition
boundaries and `docs/evidence/p7-contract-73c9a2e6/README.md` for actual checks.

The next P7 resume is closed domain output projection plus authenticated HTTP
composition, bounded waits and real end-to-end transcripts, joined with the
current P1/P2/P3/P4/P5/P6/P8 ports. Do not deploy the input descriptors or codec
alone as a completed MCP server. Rebind any concurrent P7 branch before integration;
combine complementary work instead of replacing the shared contract or dirty work.
J1-J5 are not complete; actual ChatGPT schema usability and same-ref full-validation
cost remain live/join questions, not conclusions from core fixtures. D0007 trial
counts apply to release/performance decisions, not every implementation edit.

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


### Integration lead current functional join

The k47 integration lead recovered into the independently registered checkout
`dev2-k47-bootstrap`, branch `tmcp/dev2-impl-k47-final`, after the tmcp owner twice
marked its managed worktrees orphaned. No rejected target was subsequently
mutated. P3/P4 consume the exact published peer source at `7d76762`; P1/P2 remain
frozen inputs pending that peer owner's publication. P5-P8 and joined behavior
continue here; this is not a new product owner or a second development runtime.
The joined real Git/SQLite development loop and authenticated four-tool HTTP
loop have focused passing tests. Recovery/release and same-ref 8-way execution
remain active work, not completed gates. See `docs/evidence/join-k47/README.md`.
