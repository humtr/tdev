# Reference navigation

Non-normative. Historical comparisons and superseded decisions are retained in Git
history. Current purpose/status is in README, semantics in ARCHITECTURE, wire types in
contracts/tools.schema.json and order in IMPLEMENTATION_PLAN. Do not import historical
Candidate C, stage numbering or subject/session assumptions into current implementation.

## Implementation entry points

Read [ARCHITECTURE §10](ARCHITECTURE.md#10-implementation-structure) for the selected structure
and [P0–P6](IMPLEMENTATION_PLAN.md#next-implementation-sequence) for deliverables and gates.
The map below is evidence navigation, not an additional specification or an assertion that a
scenario already runs against a new executable. Resolve discrepancies against the architecture
and contracts, then add a meaningful invariant test. Current Python tests often import domain
objects directly; even `test_http.py` starts an in-process controller and must be adapted for
an implementation-independent executable boundary.

| Behavior to carry forward | Existing test/evidence sources | External boundary or focused test to establish | Delivery owner |
|---|---|---|---|
| MCP/auth/metadata/schema | `tests/test_contract.py`, `tests/test_http.py`, `scripts/check_mcp.py` | Real HTTP positive/negative requests; exact version/annotations; schema and identity fixtures | P1/P2, final SDK P6 |
| Workspace/project/source ownership | `tests/test_workspaces.py`, `tests/test_projects.py`, `tests/test_source.py` | Two principals/projects, composition/CAS, dirty checkout preserved, managed-ref lifecycle | P2 |
| Atomic edit/replay/publication identity | `tests/test_core.py`, `tests/test_recovery.py`, `tests/test_process_crash.py` | Replayed request has one effect, ABA rejected, exact validated commit published, SHA-256 repository | P1 fixtures; P2/P3 behavior |
| Native execution and task dependencies | `tests/test_native.py`, `tests/test_environments.py` | Actual child exit/log/stdin, isolated HOME, dependency reuse/reset, frozen working budget, no implicit remote fallback | P3 |
| Death and uncertain effects | `tests/test_process_crash.py`, `tests/test_recovery.py`, `tests/test_executor.py` | Kill controller/supervisor, lose replies, retain uncertainty and ownership, no second launch/delivery | P1 harness; P3/P4 gaps |
| Human-name continuation and operation boundaries | `tests/test_continuation.py`, `tests/test_surface.py`, `tests/test_boundaries.py` | Typed request envelope, non-mutating find with ambiguity, no-op checkpoint, terminal-write race, frozen repository timeout | P1/P3 |
| Fresh progress and resume | `tests/test_progress.py`, `tests/test_workspaces.py`, `tests/test_bridge.py` | Miss completion then inspect/replay in same/fresh client; bounded current no-change; closed-resource cleanup | P1/P3, client P6 |
| Artifact recipe/build/runtime | `tests/test_artifacts.py`, `tests/test_artifact_build.py`, `tests/test_artifact_runtime.py`, `scripts/rehearse_python_package.py` | Frozen input, stopped capture, seal/receipt crash, moved retained package, missing development roots/runtime mismatch | P4 |
| Artifact validation/export/prune | `tests/test_artifact_validation.py`, `tests/test_artifact_retention.py` | Wrong policy/content rejected; pin/switch race; hash-checked paged export; non-service output; recoverable retirement | P4 |
| Deployment lifecycle | `tests/test_deployments.py`, `scripts/rehearse_deployments.py`, `scripts/rehearse_artifact_deployments.py` | Actual runit release identity, update/rollback, interrupted switch, failed activation restores, data/foreign service preserved | P4/P5 |
| Install/config/connections/operator CLI | `tests/test_admin.py`, `tests/test_bootstrap.py`, `tests/test_installer_setup.py`, `tests/test_connections.py`, `tests/test_cli.py`, `tests/test_resident.py` | Executable CLI with private fixtures; interactive/noninteractive input; credentials unchanged; inactive install and owned service rehearsals | P5 |
| Diagnostics and independent observer | `tests/test_diagnostics.py`, `tests/test_diagnostic_policy.py`, `tests/test_diagnostic_witness.py`, `tests/test_diagnostic_observer.py`, `tests/test_observer_frontier.py`, `tests/test_observer_continuous.py` | Disabled/broken evidence cannot block work; bounded alerts; operator HOME/root binding; status has no control side effect | P5 |
| Client edges and full journey | `tests/test_adapter.py`, `tests/test_bridge.py`, `tests/test_chatgpt_cell.py`, `scripts/check_codex.py`, `examples/chatgpt/JOURNEY.md` | Explicit stdio edge, CLI ordinary exit, SDK/installed client and actual ChatGPT journey measured separately | P5/P6 |

The [action inventory](tests/acceptance/inventory.json) expands the tool contract into 61
action/mode entries, including nested read queries and edits. Its check rejects missing/extra
actions and broken evidence/scenario links. Existing evidence is navigation to a test family,
not a claim that every rejection/race is covered. An empty `externalScenarios` list explicitly
marks a missing dedicated executable scenario. Pure path/encoding/policy
rules should keep fast unit coverage. Existing tests using mocks are useful evidence of intended
failure behavior, not proof that the same failure was induced against a different process.

## Executable acceptance boundary

The initial slice is implemented in `tests/acceptance/`; extend it by feature:

1. Add the disposable executable launcher/readiness/cleanup helper and actual HTTP client.
   Use the supplied command/config path, loopback and bounded deadlines. Keep test credentials
   synthetic and out of argv/logs. Reap only owned fixture children on cleanup.
2. Carry the native HTTP source path and strict protocol/auth rejection cases across that
   boundary; retain their original invariant assertions. Keep useful existing tests until the
   replacement is demonstrated. Do not modify production dispatch to accommodate the harness.
3. Add controller SIGKILL/restart plus the same request replay; assert the original operation
   and one actual execution, not just equal-looking responses. Validate discovery of the new
   tests in the normal check entrypoint.
4. Run focused/affected tests, then the full check. Record which boundary is now independent
   and the next uncovered crash/identity scenario; do not announce Rust parity at this point.

Use a test-only barrier only where a real observable cut point is insufficient. Extending fault
injection across every existing Python module is not preparation for this first change. P1 and
subsequent feature slices introduce the remaining targeted mechanisms when needed.

Run `PYTHONPATH=src:.tdev-deps:tests python -m unittest discover -s tests/acceptance -v`
for the independent boundary. Normal `scripts/check.sh` recursively discovers the package too.
The default launch adapter runs the baseline server. A supplied executable uses the test-only
`TDEV_ACCEPTANCE_COMMAND` JSON argv array, for example `["/absolute/path/to/tdev","serve"]`;
the harness appends state/config/port/diagnostics arguments. This is a test adapter contract,
not a requirement to preserve the current Python command layout or introduce a runtime selector.
Arguments must target the controller role; future operator tests have their own argv fixtures.
Each test owns a fresh local repository, bare remote, synthetic principal and private HOME.
Readiness checks the launched PID. The response-loss proxy forwards exactly once and discards
the response. Command barriers use stdin and observed output, not guesses from sleeps.
Responses are capped at 2 MiB, retained controller logs at 1 MiB, and waits are bounded.
Cleanup reconciles/cancels owned requests via the public boundary before deleting fixtures;
unreconciled fixtures are retained with their evidence path and fail the test.

`tests/acceptance/identity.json` fixes canonical bytes and SHA-256 hashes. The Python bridge
is `tests/test_identity.py`; a Rust encoder must consume the same static vectors. In particular,
Python preserves `1` versus `1.0`, negative floating zero, exponent spelling and unpaired
surrogate escapes. A JSON library rejecting/normalizing these is a compatibility decision to
resolve with contract/storage evidence, not a reason to regenerate the fixtures. The current
suite also exercises both Git object formats and rejects traversal/Git metadata paths.
Symlink capture, two-principal revocation/CAS and numeric schema parity still need their
existing unit fixtures carried into the relevant P2/P3 slice.

## Remaining operator, persistence and process boundaries

The `model`, `identity`, `storage`, `git` and `contract` library tests now qualify encoding,
primitive transactions/ownership, operation receipt fixtures, local Git source construction and
materialized Schema validation on Termux. `tests/git.rs` uses real private Git repositories;
`tests/acceptance/wire.json` supplies fixed Schema decisions, with additional canonical examples
and independent-validator comparisons in `scripts/check_contract.py`. These do not replace
feature acceptance or qualify a serving executable. `scripts/check.sh` runs formatting, lint,
native tests and compiled identity/contract comparisons before the reference/common tests.
Current authority, wire numeric conversion (including unbounded offsets), raw Unicode/depth
handling and the Git-object-before-SQLite-CAS crash boundary belong to the next P2 HTTP source
slice. `git/process.rs` owns bounded utility groups only; it is not P3's detached supervisor
or proof that arbitrary escaped command descendants have stopped. GitHub adapter/publication
and source capture selection/materialization retain their later feature evidence.
When connecting workspace/project handlers, move repository identity preflight outside the
SQLite transaction. The reference workspace wrapper can invoke Git/provider inspection from
inside its transaction; that incidental call order is not the design authority. Recheck owned
membership/revision/CAS inside the short transaction against the immutable admission context.
At the HTTP edge, preserve JSON-RPC ID type separately from Schema integer fields: an integral
floating tool offset may be valid while an RPC ID of that type remains invalid. Establish finite
float materialization before Schema validation without replacing the canonical request identity.

All entries below are required retained behavior. Evidence remains Python/internal tests or
separate authored rehearsals until an executable replacement is recorded. Native library and
compiled contract checks are recorded separately; the operator/process entries here have not
been qualified against a serving executable or a live host.

| Surface/actions or format | Existing evidence | Delivery |
|---|---|---|
| CLI menus/help/status; `tools`, task/project/workspace `list`, operation `status`, diagnostics `inspect`, `call`, `schema`, `link`, credential selection | `tests/test_cli.py`, `tests/test_bridge.py`, `tests/test_surface.py` | P5 |
| `install`, `update`, `check`, `recover`, `rollback`, `uninstall`; first-install bootstrap | `tests/test_bootstrap.py`, `tests/test_installer_setup.py`, `tests/test_resident.py` | P5 |
| connection `list`, `add`, `inspect`, `mode`, `token`, `enable`, `disable`, `rotate`, `revoke`, `remove`, `rename`, `migrate` | `tests/test_connections.py`, `tests/test_cli.py` | P5 |
| observer `status`, `start`, `stop`, `keep`; installation HOME and root binding | `tests/test_diagnostic_observer.py`, `tests/test_observer_continuous.py`, `tests/test_observer_frontier.py`, `tests/test_cli.py` | P5 |
| admin `stage`, `point`, `rollback`, `check`, `init`, `prepare-tunnel`, `delegate-projects`, `delegate-deployments` | `tests/test_admin.py`, `tests/test_projects.py`, `tests/test_deployments.py` | P5 |
| SQLite supported user versions 3/4/5, empty initialization; row intents/results/ownership and unsupported-version refusal | `tests/test_workspaces.py`, `tests/test_core.py`, `tests/test_artifacts.py`, `tests/test_resident.py` | P2/P5 |
| JSON config and connections schema; private credentials/profiles, resident settings, pending setup/connection/installation journals, bundle manifests/active pointers, service ownership | `contracts/config.schema.json`, `contracts/connections.schema.json`; `tests/test_connections.py`, `tests/test_resident.py`, `tests/test_installer_setup.py` | P5 |
| Git SHA-1/SHA-256 objects/refs and exact publication; dependency environments | `tests/test_source.py`, `tests/test_recovery.py`, `tests/test_environments.py`; common SHA-256 scenario | P2/P3 |
| Native spool request/dispatch/process identity, stdin sequencing/ack, output and terminal receipt; dormant SSH transport | `tests/test_native.py`, `tests/test_executor.py`, `tests/test_process_crash.py`, `tests/test_recovery.py` | P3 |
| Artifact manifest/content/seal, retirement and pin records; deployment active/previous/data/runner ownership | artifact test families above, `tests/test_deployments.py`; separate runit rehearsals | P4/P5 |
| Optional diagnostic state/incidents/keyed evidence and observer state | diagnostic test families above | P5 |
| Controller; detached supervisor/descendants; deployment runner/runit; independent observer; stdio bridge; selected external CLI adapter | `tests/test_process_crash.py`, `tests/test_native.py`, `tests/test_deployments.py`, `tests/test_observer_continuous.py`, `tests/test_bridge.py`, `tests/test_adapter.py` | P3–P5 |
| SDK discovery/call; installed Codex; ChatGPT Refresh, approvals, visible same/fresh-turn continuation and Tunnel | `scripts/check_mcp.py`, `scripts/check_codex.py`, `examples/chatgpt/JOURNEY.md`; actual host evidence separately | P6 |

Spool and journal field encodings are currently implementation-owned persistence formats,
not new public wire authorities. P2/P5 must inventory actual reader/writer compatibility before
admitting existing offline state; listing filenames is not migration qualification.

## Fault and comparison work to carry into feature slices

| Cut point | Required observation after recovery | Mechanism / owner |
|---|---|---|
| Intent committed, before external reservation | Same accepted identity; only proved undispatched local work can fail without effect | Existing pre-dispatch fixture; test-build barrier in P2/P3 |
| Dispatch reserved, before child launch | Uncertainty retained, no automatic second launch | Test-build reservation barrier, actual process death, P3 |
| Child alive, reply lost, controller killed | Original child completes once; request/input replay never redelivers | Implemented proxy + output/stdin barrier + SIGKILL scenario; additional dead-supervisor/descendant cases P3 |
| Terminal receipt available, caller missed completion | Fresh/current frontier exposes completion and permits next work | Implemented stdin completion + controller stop/restart; receipt-before-DB barrier P3 |
| Artifact renamed/sealed before receipt | Recover same sealed content, retain ownership/pins; no rebuild disguised as recovery | Test-build rename barrier + actual death, P4 |
| Deployment switched before durable acknowledgment | Reconcile actual owned service/release; preserve previous/data | Disposable real runit + switch barrier, P4 |
| Prune retirement before deletion/receipt | No live pin deleted, recover only owned retirement | Rename/delete barrier and pin race, P4 |

P5 comparisons use the same device/toolchain identity and separately owned fixtures, with warmup
then paired baseline/candidate repetitions. Start with 1 and 4 concurrent independent tasks,
small source (the two-file fixture), a 1,000-file tree, bounded-output commands, stdin/cancel,
validation/publication, retained service update/rollback and no-op observations. Report median,
p95, CPU, controller-plus-child peak memory, state growth, installed bytes and clean build cost.
Initial regression investigation budgets are candidate median latency no more than 1.20x the
paired baseline and peak aggregate memory no more than 1.10x, with zero semantic/replay failures.
These are investigation thresholds, not measured advantages or permission to weaken semantics.
No absolute memory/build-time budget has been established; capture matched baselines before
candidate performance runs. Uncontrolled three-trial smoke timings cannot qualify these budgets.
