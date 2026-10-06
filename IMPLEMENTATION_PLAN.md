# Implementation order

Derived from ARCHITECTURE; status belongs in README, wire types in the contract.
Termux alone must support the default coding path. Optional remote backend qualification
does not block any native deliverable.

Product scope and version authority are defined in README. The table below describes the
existing implementation sequence, not completion of the broader product goal. Continue with
the next sequence below; do not treat source publication as the deployment milestone.

| Deliverable | Required invariant | Minimum checks | Next prerequisite | Human acceptance |
|---|---|---|---|---|
| 1. Contract/SQLite/Git task/read/edit | current scope, atomic edits, checkpoint CAS, replay before stale, unrelated state preserved | JSON Schema fixtures, Git fixtures, restart/races | durable source/intent | none |
| 2. Command + validation/publication on Termux | native default without executor registration; clean env and disposable source; real exit; exact commit; durable replay; non-force CAS | native commands, stdin, output/deadline, source-change/forged-stdout rejection, exact publication | complete on-device coding path | none |
| 3. Process recovery and HTTP/auth | detached supervisors survive controller restart; no lost-response relaunch; per-task uncertainty; MCP 2026-07-28 per-request metadata, no legacy handshake | real crash/reconnect, subreaper cancellation, input replay, full HTTP edit/exec/validate/publish; pinned official SDK and negative wire tests | recoverable MCP | ChatGPT connection/Refresh, exact-version forwarding and credential entry only |
| 4. Inactive install/rollback and config | omitted/native config works; explicit SSH stays optional; no false sandbox/egress claim; no production effect | defaults/legacy SSH schema, installed CLIs, packaged native path, rollback/tamper | ready for on-device host acceptance | Tunnel credentials and explicit production cutover only |
| 5. Local client and CLI extension qualification | no core protocol downgrade or new authority; fixed tmcp host-hint annotations; completion visible in same turn/reconnect; closed resources manageable | bounded frontier/no-change/missed completion; installed Codex discovery + disposable read/edit/exec/operation/validate/publish/replay/retire; external CLI real exit/capture/forged authority rejection | qualified selected clients/extensions, not every hypothetical adapter | targeted ChatGPT Refresh/approval acceptance after annotation changes; persistent Local Codex registration uses operator-supplied private bearer |
| 6. Delegated projects and managed work | local/GitHub connect/create within one-time scope; automatic base/name; create-if-absent publication; owned CAS cleanup after close; current policy/replay | ordinary dirty checkout preservation, new-project native HTTP path, ref transport CAS, provider fixtures, response loss/restart, revocation/identity replacement, incompatible-state rejection, compatible rollback | ChatGPT can start a new project without per-project private config edits | one-time local-root/GitHub-owner delegation and provider auth; affected Connector Refresh/live acceptance |

Each deliverable: source, invariant tests, focused/affected checks, first-order failure
repair, scripts/check.sh, coherent diff/state review; then continue. Authored-program tests
exercise the real default runner but do not prove hostile-code isolation. Keep optional
OCI tests without treating external enrollment as a gate.

Live progress continuity is a required acceptance dimension, not optional UX polish.
Backend state freshness and ChatGPT visible continuity are distinct acceptance boundaries.
A current operation response or completed backend cannot prove a live user-visible turn.
One server-observable failure case is **same-turn staleness**: an operation advances or completes while
the model is still working, but subsequent wait/status/frontier reads keep returning an older
view, so the model waits, re-investigates completed predecessors, or stays trapped in the turn
without doing the now-admissible next work. In observed failure this prolonged ambiguity can
also make the model abandon the normal development path and drift into unrelated defensive/
guard checks. Tests must force this race and prove that bounded repeated observations are
monotonic/current enough to expose the terminal transition and let the same turn continue.

Acceptance must also cover the no-change case: after a bounded number/time of observations,
the product must return an explicit current no-progress result with freshness/provenance rather
than encouraging an unbounded polling loop. No test should require the model to infer that
authorization/safety state changed merely because operation progress is stale or ambiguous.

Fresh-session/reconnect continuity is the second half of the same invariant. At representative
cut points, terminate the client/controller view and resume from a fresh session. One bounded
current-frontier read for the selected task must identify recent proved-complete predecessors,
running/unknown effects, current source/remote observations and cleanup ownership. The model
chooses useful next work; only fresh admission establishes whether an effect is admissible. This
is not a one-call atomic snapshot of all projects, deployments or providers. The fresh
session must skip completed predecessors and, absent a genuine external blocker/unknown
effect, perform useful forward work in that same turn. Tests must cover "completion happened
but caller did not observe it" for both same-turn polling and fresh resume. Terminal lifecycle
must also leave a supported inspection/cleanup path for clean owned resources.

Material recovery alone does not reconstruct a changed objective or design rationale. The
optional semantic continuity slice below addresses that gap without making a resume note a
prerequisite for development or expanding this requirement into a mandatory workflow engine.

Additional observed harness lessons to preserve during tdev implementation:

- Command execution must expose the underlying command result prominently; controller/job
  admission success must not be mistaken for process/test success.
- Long-running development processes need a product-owned start/status/log/stop lifecycle;
  do not force callers into unmanaged detached-shell workarounds.
- Isolated worktrees/copies need a reproducible dependency/tooling context so clean isolation
  does not silently remove required ignored caches or environments.
- Closeout must remain actionable through commit/push/readback/cleanup; terminalization must
  not strand unfinished closeout work or its owned resources.
- Registry/descriptive metadata can become stale; mutable repository/runtime facts must be
  freshness-bound to their current owner rather than trusted from cached labels.
- Status/readback surfaces need bounded summary/collapse/limits so large untracked trees do
  not turn a simple progress check into a huge artifact.
- Git/ref inputs should have consistent, explicit semantics across operations; common symbolic
  refs such as HEAD must either work consistently or fail clearly by contract.
- Request identity should be easy to generate safely in long autonomous runs; idempotency
  conflicts must stay explicit without requiring fragile manual request-id bookkeeping.

Existing source-development path: open → read/edit → exec/operation → validate → publish → readback.
Never weaken exact publication/replay to hide missing native support. Keep native authority
limitations explicit instead of promising unavailable kernel boundaries. Avoid repeated
permission choreography inside already delegated scope.

Deliverable 5 is derived from the selected local client and command-first extension path,
not an inherited stage name or a requirement to implement a capability gateway. Its adapter
is an explicitly selected legacy stdio edge; core HTTP remains 2026-07-28. Run
`scripts/check_codex.py` separately from deterministic tests because it depends on installed
Codex. CLI fixtures prove extension behaviour, not hostile same-UID isolation. Qualify a
remote/API/device adapter only when one is actually selected. Existing local checks leave
affected host acceptance and separately authorized activation; the broader coding/deployment
goal also requires the work below.

## Next implementation sequence

This section is the single selected order. Detailed sections below are acceptance specifications,
not competing queues. README owns implementation/current status; LOCAL_VALIDATION owns dated
results. Earlier incident/install/connection requests do not remain perpetual prerequisites once
implemented. Current user instructions may reprioritize an item; record the resulting order here.

The current instruction selects source capacity before the next public execution increment.
Use the current implementation as evidence: inventory checkout/blob/capture/integration/pack
and transport budgets, then provide 512 MiB source/file capacity through bounded streaming and
remove duplicate file-plus-pack payloads. Preserve separate native working/dependency budgets
and bounded model responses. Qualify the 190-file/37.7 MiB corpus, a >=173 MiB single file,
many-file and 512 MiB aggregate journeys and boundary diagnostics before commit/push; assess
resident alignment only after that qualification. Earlier branches are not capacity authority.
The current instruction authorizes qualified resident alignment, preserving the exact unknown
stdin record for a proved-stopped native consumer, and selecting 2 GiB live workingBytes in
the recoverable update transaction. Qualify this narrow explicit maintenance exception before
activation; never resolve delivery uncertainty merely to make installation admissible.

The selected order is P0–P6 below: establish behavioral test boundaries, then redesign and
implement directly in Rust using ARCHITECTURE §10. Do not first refactor the whole Python
implementation. The prior product qualification queue later in this document supplies acceptance
scenarios, not a competing implementation order. Optional semantic continuity, new package
ecosystems and new integration families remain outside this delivery unless a concrete blocker
and current user instruction select them.

The user now authorizes baseline publication and implementation in the selected development
branch. Live runtime/provider replacement and integration of an unqualified implementation
remain outside this authorization. The intended integrated
result is the canonical product, with no permanent language-specific variant.

### P0 — bind the baseline and the acceptance inventory

1. Record the selected Git base plus the relevant working-tree delta and untracked product
   files. A commit OID alone cannot identify this checkout. Preserve user changes, existing
   node_modules, observations and unrelated artifacts. Use a private, explicit comparison
   snapshot or worktree; preserve and explicitly account for the current install and observer
   changes. The user has authorized committing/publishing that baseline. A reference snapshot
   is test evidence, not a second product owner.
2. Inventory each implemented public action, operator command, persistence format and process
   role against its existing tests. Start from IMPLEMENTER_REFERENCE's map; fill action-level
   gaps from the contracts. Mark each as externally testable, internal unit coverage, real
   rehearsal, host-only evidence or currently unqualified. Test count alone is not coverage.
3. Use the refreshed baseline identity/results in LOCAL_VALIDATION; the earlier 326-test
   baseline is historical and no longer identifies the selected source.
   Preserve the small local measurement's limited scope. Capture executable/dependency identity,
   fixture size and isolated evidence paths for subsequent comparisons, without credentials.
   Define the P5 workload/device/concurrency and initial resource/latency budgets from baseline
   measurements before collecting candidate performance results; record what remains unmeasured.

Exit: another implementation can be compared against an identified source/config fixture and
an explicit behavior inventory. Missing host evidence is named, not invented. No Rust behavior
is claimed from the Python baseline. No implementation refactor is required to complete P0.

### P1 — build the executable acceptance boundary

1. Add a small harness under `tests/acceptance/` that starts a supplied executable/argv with a
   disposable config/state root, waits for bound readiness, calls HTTP/CLI, kills only owned
   processes, restarts the same fixture and collects bounded evidence. The initial launch
   adapter starts the existing Python server; final product code has no implementation selector.
   Discovery of nested tests must be explicit in `scripts/check.sh`; no silently skipped suite.
2. Extract scenarios from `test_http`, `test_process_crash`, `test_recovery` and `test_progress`
   first: strict metadata/auth/schema rejection, full source path, duplicate request, SIGKILL
   recovery, lost completion reply and bounded current/no-change observations. Add a behavioral
   lost-response proxy or client discard without retrying the effect. Keep useful internal
   unit tests; do not rewrite the entire test suite before implementing one feature.
3. Add identity golden fixtures for canonical JSON/digests, SHA-1/SHA-256 source identities,
   invalid paths/symlinks and wire acceptance/rejection. Include non-ASCII text, number forms,
   null versus omitted fields and request mismatch. Capture only deterministic private fixtures,
   not production databases/spools or real credential/config files.
4. Define synchronization/fault events for intent commit, dispatch reservation, child launch,
   terminal receipt, artifact rename, deployment switch and prune retirement. Use actual process
   death where observable; use narrow test-only barriers for otherwise unobservable windows.
   Test adapters must not duplicate recovery policy or make a false success look equivalent.

Exit: the common source/recovery scenarios run against the current executable without importing
its domain objects. The contract, effects and identity assertions are independent of module
layout. Remaining artifact/deployment/operator scenarios have explicit later owners in P4/P5.

### P2 — implement the package, types and durable local slice

1. Create the canonical `tdev` Cargo package/modules from ARCHITECTURE §10; pin the toolchain
   and dependency lockfile. Qualify on-device Termux build/test first. Select minimal libraries
   for JSON/Schema 2020-12, SQLite and HTTP from actual target builds and contract fixtures;
   verify MCP 2026-07-28 behavior before adopting an SDK. Neither an SDK nor generated structs
   replace tdev's contract checks. Record library choices and target/API/linking assumptions.
2. Implement validated identifiers, orthogonal operation/effect states, errors, wire conversion
   and canonical identity encoding. Implement the single-writer SQLite owner, supported-format
   admission and short transactions, then Git plumbing. Specify lock order and prohibit external
   waits while holding a database transaction. Test malformed persisted records and unsupported
   formats before accepting effects.
3. Deliver a vertical slice through authenticated HTTP: workspace/project enrollment, source
   task open, read, atomic edit, inspect, replay, checkpoint CAS and restart. Exercise a real
   disposable Git repository and SQLite file. Match current scope, managed-ref ownership and
   dirty-checkout preservation; a discovery-only server is not completion of this slice.
4. Add formatting/lint, unit/contract and implemented acceptance checks to `scripts/check.sh`.
   Until the target is complete, report which surfaces are implemented explicitly. Do not
   advertise all thirteen tools with success-shaped stubs or count skipped scenarios as passing.

The serving increment now implements current authentication, six narrowed tool families,
workspace membership/revision guards, local open/read/edit/close, source/request replay,
bounded JSON/SSE status, and the private Git-pin-before-pointer SIGKILL boundary. The P2
local/provider gate is now qualified: local delegated connect/create uses current policy projections and exact creation
evidence, including actual controller-death boundaries. Remote-base managed start now freezes
selection, HEAD and unique task/ref identity before fetch; it rechecks workspace selection at
reservation and qualifies actual pin-gap death without repeating construction. LocalChanges=true
now captures the enrolled checkout through no-follow directory descriptors and two matching
identity/selection/content/metadata scans, with private import-pin death qualified before atomic
task/receipt completion. fromTaskId now accepts a proved retained publication as detailed below.
Composition now combines compatible deltas on one exact project/ref, checking declared source
pointers before construction and again in the task/receipt transaction. Integration proves
source ancestry outside storage, rechecks the observed source pointer at admission, then freezes
the selected source version while allowing independent source edits. Only the target writer is
reserved. Unresolved conflicts commit an applied=false receipt without changing the target;
explicit resolutions advance it atomically. Both paths qualify actual private-pin controller
death, current source authority on replay and SHA-256 checkpoints. Duplicate admission releases
storage before nested replay; a deterministic concurrent duplicate test fixes that boundary.
Owned local ref cleanup now reserves retained tasks even after workspace close/detach, freezes
publication ownership, checks checked-out worktrees and uses exact-OID/no-dereference deletion.
Its separate intent records uncertainty before public dispatch; replay/status/inspect reconcile
only that original deletion. Actual SIGKILL before/after dispatch, CAS races, observation failures,
SQLite completion failure and uncertain-publication blocking have focused executable evidence.
Publication-backed deletion uses isolated retained-state fixtures; this does not qualify P3
publication admission/validation. Shared per-operation gates keep active workers from premature
reconciliation without holding the store across Git waits.
Published predecessor continuation now freezes the retained publication/source/namespace and
reserves unique new task/ref identity in the shared managed-start path. Admission rereads the
publication facts and destination membership without reserving the predecessor writer.
Construction pins the retained private commit without HEAD resolution/fetch; private-pin death
keeps the interrupted receipt. Current predecessor/resolved scope gates original receipt access
after cleanup or later source changes. Retained publication fixtures do not qualify P3 publication.
GitHub enrollment/provider now implements fixed-owner connect/private initialized create,
current policy discovery and live identity/permission observation. Returned repository IDs are
durable before enrollment; response loss without an ID never triggers another POST or name-based
success. Actual controller death around ID persistence, late permission/SQLite failure,
same-name replacement and current policy revocation have executable provider fixtures.
Source reads/edits use authenticated controller Git transport with fresh repository-ID checks;
private utilities and retained Git config receive no token/helper. Remote managed-ref deletion
joins the existing ownership journal with explicit exact-OID force-with-lease, observing the
original effect after death without repeating push. Retained publication fixtures qualify deletion,
not P3 publication. Static GitHub enrollment accepts absent configured refs when another scoped
ref can initialize the store; retained work does not need a live base branch after that.
Final affected and full `sh scripts/check.sh` regressions passed with exit status 0, including
55 Rust checks, 105 native HTTP checks and 429 reference/common regressions. This closes the
P2 local/provider gate; see LOCAL_VALIDATION.md for focused evidence and qualifications. Live GitHub
authentication/TLS is not qualified by these isolated executable adapters and remains a host/provider
qualification obligation. Next implement P3's independent supervisor/spool and execution ownership;
no production provider/runtime activation or main integration is implied by completion of P2.

Exit: an on-device build passes the local source slice and canonical identity fixtures. Existing
Python tests remain available as evidence until each affected behavior has an adequate successor.

### P3 — implement execution, validation/publication and recovery

The initial increment implements the independent `supervise` process role and durable spool
primitive: immutable input/tool-location digest, dispatch/worker fences, PID/start/boot identity,
clean environment, output drain/cap, limits/sampled storage, deadlines/cancel and descendant stop.
Real-process tests cover launcher SIGKILL, supervisor SIGKILL with surviving descendants,
double fork, dispatch/claim gaps, concurrent launch and forged/corrupt terminal evidence.
Ordered stdin intent/pipe-delivery evidence and shared task dependency
leases are now implemented: initial input precedes sequenced controls, partial delivery remains unknown, acceptance
replay never resends, and EOF closes further admission. Stable per-task lease files survive
directory replacement; task caches/tool paths persist independently of source/private HOME,
with separate dependency preflight, sampling and final budgets. A released kernel lease after
worker death does not authorize reset while a consumer remains logically unknown.
The owned source increment now binds immutable Git inputs to execution, seals stopped capture,
constructs one original private Git candidate and retires copies. Source and actual-process
qualification closes this private increment. The next increment now connects public native
command/process admission, original supervisor observation and SQLite checkpoint/receipt
completion, immediate admission with bounded background preparation/import, sequenced
stdin/cancel/retire controls (including preparation gaps), bounded task/workspace reconciliation and
logical/kernel consumer exclusion for dependency reset. The same-directory reset journal
preserves directory identity across interruption and completed replay cannot remove rebuilt
storage. Process completion never changes source/writer/closed state. No dispatch belongs in
replay or recovery. See LOCAL_VALIDATION.md for this increment's complete qualification evidence.
Source-validation candidate/policy admission and exact non-force publication now join the same
stop/completion owners: readonly integrity, frozen deadline origin, exact original candidate,
unique publication identity and observation-only ref recovery. Source 0.1.31 connects bounded
human-name continuation, coherent local lookup authority/projections and fresh task/history/active
observation intervals. Common executable source lifecycle, no-change, missed completion and actual
publication-backed continuation scenarios now run against the native executable in check.sh;
P3 actions have dedicated common links in the acceptance inventory. Close the native P3 exit
only with this increment's full regression evidence in LOCAL_VALIDATION, then proceed to P4.
Optional remote execution/provider live authentication and P6 installed/host acceptance remain
separate qualification boundaries. No installed activation is implied by P3 exit. The earlier private
increment qualified 115 Rust, 108 native HTTP,
447 reference/common and 7 native capacity checks on identical frozen inputs; its interrupted
script prefix plus qualified continuation remains historical evidence, not a script exit 0.

1. Implement the independent native supervisor process and durable spool protocol: reserve before
   dispatch, PID/start identity, clean environment, task dependency leases, stdin sequencing,
   bounded output, working budgets, deadlines, descendant stop and owned source capture. Select
   backend once at admission; preserve the dormant SSH adapter with transport fixtures without advertising it in the native-only public surface.
2. Join actual stop/exit/source proof to validation and exact non-force publication. Implement
   per-operation reconciliation and bounded task/workspace frontiers. Replaying the same request
   after disconnect or restart observes one effect; stale source/policy cannot become publishable.
3. Run common scenarios and Rust unit/fault tests at every persistence/dispatch gap. Test double
   fork/cancel, dead supervisor, input acknowledgment loss, controller SIGKILL, slow unrelated
   reconciliation, source capture failure and completion missed by a continuing/fresh client.

Exit: full source development and process recovery work through the actual executable. No
Python controller/worker is called to complete this slice. Dormant SSH is not caller-selectable;
unavailable remote infrastructure is a separately reported qualification gap, not native fallback.

### P4 — implement retained artifacts and deployment as one ownership path

The first native increment connects read-only recipe inspection and frozen source/policy binding.
Its executable common/proof/large-input boundaries are recorded in LOCAL_VALIDATION. Continue
with prepare/acquisition, declared-export capture and atomic retention before validation/release;
recipe inspection alone does not meet the P4 exit below.

1. Implement frozen recipe/policy binding, pinned public input acquisition, fresh builds,
   declared-export capture, atomic sealing and runtime checks using the existing packaging
   acceptance sections below. Keep build intent, stop proof, retained content and verification
   distinct. Editing/closing source cannot change an accepted build's input.
2. Implement source and packaged release activation, live release identity, update, rollback,
   failed-switch recovery and data-preserving removal. Share the same artifact pin/admission
   discipline with verification, export and prune. A successful server start alone is insufficient.
3. Carry behavioral scenarios from artifact/deployment tests into the executable harness;
   retain focused internal tests for pure rules. Exercise real isolated runit for process/service
   ownership, failure restoration and state after controller restart. Remove source/build scratch
   and dependency environments before checking retained runtime independence.
4. Test interruption after seal rename/before receipt, low space, output/capture limits, shared
   identical content, prune versus switch/verification, unknown-effect pins, export paging/hash,
   incompatible runtime and rollback without reacquisition. Include a non-service output.

Exit: a dependency-bearing retained service and a non-service artifact complete build, verify,
delivery, restart and owned cleanup. No rebuild disguises a failed rollback; data/history/pins
have explicit retained owners. Existing packaging tests are specifications, not new work queues.

### P5 — finish operator/runtime integration and state transition qualification

1. Implement CLI menus/direct commands, installation/configuration, independent connections,
   bearer selection, bootstrap, service lifecycle, diagnostics and observer behavior. Preserve
   optional diagnostic failure isolation and all thirteen contracted tools. Keep the explicitly
   selected stdio compatibility edge and caller examples; do not downgrade core HTTP.
2. Replace Python-specific launcher/readiness/bundle assumptions with verified executable
   identity. Retain the version ownership established in P2, derive consumers, and qualify fresh offline-staged
   installation, interrupted setup, intentional-down state and failed update/rollback. Retain
   credentials, operator HOME/evidence discovery and project-service runner pins.
3. On disposable offline copies, qualify the selected state reader/transition and incompatible
   downgrade refusal. Include complete receipts, running/unknown effects, active/previous
   deployments, artifacts and diagnostic data. Do not feed the actual running installation to
   an unqualified reader. Admission to a swap must define pending-effect handling before stop.
4. Record build time, peak build memory, installed size, dependency requirements, cold/warm start,
   controller-plus-supervisor memory/CPU and representative latency/storage costs. Use the same
   device, fixture and concurrency, with repetitions and comparable baseline runs. Select an
   explicit regression budget before interpreting candidate results; no assumed speed multiplier.

Exit: fresh installations and target-runtime operations have no Python runtime-helper dependency;
external user programs, test tools and previously pinned service bundles may require Python.
Supported installation/state/update behavior is exercised locally,
and build/runtime costs fit the selected Termux target. Unmet budgets trigger a measured repair
or documented scope decision, not a claim of improvement.

### P6 — qualify and integrate the canonical product

1. Close the action-level inventory. Every supported surface has an implementation, adequate
   tests and an honest qualification status. Run focused/affected checks, then `scripts/check.sh`,
   official pinned MCP-client interoperability and isolated installed-bundle/runit rehearsals.
   Reachable test-only fault hooks, placeholder responses and unexplained skipped checks fail
   this gate. Full checks must execute the final artifact, not just retained Python tests.
2. Qualify one-project and two-project journeys including reconnect, useful resumption and
   cleanup. Live ChatGPT/Tunnel acceptance is distinct from scripted HTTP/SDK success. Carry
   forward historical evidence only when the relevant boundary is unchanged; mark changed,
   untested boundaries outstanding. Document any unavailable host gate instead of silently
   treating it as satisfied for integration/release claims.
3. Remove superseded runtime code, temporary comparison launch adapters, duplicate version/schema
   owners and development-only product names/options. Keep general tests/examples and required
   persisted-format handling. Update README, installation/operations docs and the selected plan
   around the one finished product; leave historical implementations in Git.
4. Review the final diff against the preserved baseline and the intended integration target;
   account for user changes and conflicts without broad cleanup. Main integration requires
   closed required gates or an explicit user decision on a named remaining gap. Production
   activation/provider changes retain their separate authorization and acceptance boundary.

Exit: the integrated implementation is `tdev`, with one canonical controller implementation and
reviewable validation evidence. A new language suffix, alternate edition or permanent switch
between controllers is not a delivery mechanism.

### Rules for changing the implementation plan

At each slice, record implemented behavior and next work in README, design changes in
ARCHITECTURE and actual results in LOCAL_VALIDATION. Fix evidence-backed defects within the
current slice. Module/library choices may change with demonstrated benefits and affected checks;
do not require a new design document or user approval for ordinary internal improvements.
If an improvement changes scope, contract, authority, data compatibility or delivery dependencies,
state the impact and update the responsible owner/order before continuing dependent work.
No new integration, optional memory subsystem or universal abstraction enters the critical path
merely because the implementation language makes it convenient.

### Prior product qualification context

2026-10-01 user priority: repair confirmed Host/operation boundary defects on fresh canonical
source. First fix no-op capture and terminal-write races, add repository source-validation
budget/readback and enforce caller result consumption, then qualify bounded admission-before-use
reconciliation with fresh CAS/unknown fences. Run focused/affected/full validation before
closeout. Preserve the fixed annotation profile and all resident/provider/observer state;
source qualification does not establish installed or ChatGPT UI acceptance. No workflow engine,
conversation store, terminal resume, automatic retry or periodic reconciler is part of this slice.
The subsequent user authorization now permits 0.1.25 inactive qualification, canonical
publication and recoverable resident activation with exact historical unknown-publication
preservation. Installed readback precedes separate refreshed ChatGPT Host/UI acceptance;
observer/diagnostic policy and credential/config bytes remain unchanged.
0.1.25 inactive bundle/runit qualification, canonical source publication, resident activation
and installed localhost MCP readback are now complete. The exact historical unknown receipt
and all preexisting DB rows/config/security bytes were unchanged by activation.
The subsequent user-supplied fresh ChatGPT Host report passes schema/result consumption and
same-turn bounded rollover through a ~420-second command; current retained terminal/cleanup
receipts and live 39-witness/1-run summary corroborate it. The stall/history rollback did not
reproduce in that run; this is not a permanent UI fix or proof of earlier causality.
The authorized follow-up sets only `repositories.tdev.validationTimeoutSeconds=1800`, with
unchanged command/acceptance policy, security, delegated project defaults and service identities.
A new timeout-omitted source-validation admission reads `1800 / repository` and has completed
346 tests in 834.517s, terminal succeeded/exit0/no timeout. Its owned task is closed/cleaned;
original receipts remain discoverable. Long-running Host/schema and
source validation remain separate acceptance classes. Do not replay a completed or ambiguous
operation, and do not repeat a fixed-duration stall trial without a discriminating evidence gap.

2026-09-30 user priority: re-evaluate the complete model-facing development surface from
workloads and recovery, without preserving experimental names/count. First rebind current
canonical/resident state, record the surface/decision audits and compare at least grouped,
nested-request, action-per-tool and workflow candidates. Run the isolated schema probe before
selecting a public replacement. Actual fresh ChatGPT declaration/call evidence is a gate for
broader implementation, not substitutable by JSON Schema or local bridge success. While that
host is unavailable, finish the reproducible local comparisons and host-ready probe only.
Then implement selected slices with replay/state preservation, focused/affected/full checks,
and separately authorized resident acceptance. See the dated surface review in LOCAL_VALIDATION;
its candidates and generated fixtures are evidence, not additional contract owners.
The B2 positive-alternative gate and selected find/start/release/command-process probes passed
their fresh-host checks. The selected thirteen-tool source passes final full validation and
client/bundle qualification. The user now authorizes canonical publication and resident activation.
Canonical publication, the owned recoverable resident update, live schema/state readback and refreshed ChatGPT
installed-surface acceptance are now complete for 0.1.22. Continue with the installed acceptance sequence below: bind the
current disposable target, finish packaging/lifecycle evidence, then run the complete ChatGPT development/deploy/reconnect
journey. Do not reopen the rejected broader split merely to complete the experimental candidate list.

User clarification during this review: preserve the existing fixed host annotation profile,
including `readOnlyHint=true`. This is an intentional permission-popup workaround, not an
accidental claim of pure effects. Do not change it without first solving and qualifying the
popup behavior. Actual effect/recovery boundaries may improve independently of these hints.


The dated priorities below explain the existing working-tree/evidence baseline. Their numbered
steps refer to the prior qualification backlog, not P0–P6 or a prerequisite to starting P0.

2026-09-28 user priority: deliver a repository-URL one-line first install on fresh Termux,
including prerequisite/bootstrap handling, terminal setup, user documentation and isolated
qualification. Preserve existing installations and source edits; publishing the installer source
does not authorize replacing the resident. Complete this before resuming step 3 below.

2026-09-28 follow-up: installer source and both README installation options are published.
The user selected step 3 again. Read-only resumption finds a healthy resident and no pending
effects, but this session has no tdev connector tools. Continue the actual host trial through
`examples/chatgpt/JOURNEY.md` when connected; preserve the already completed local evidence.

2026-09-28 measured-friction priority (step 4): bind observer evidence discovery to the selected
installation's persisted operator HOME, preserve explicit custom recording roots and existing
collectors, qualify read-only status from isolated HOME, and correct acceptance guidance before
using observer absence as reconnect coverage evidence. This source/CLI repair does not authorize
a resident or collector replacement. Keep independent capture and visible acceptance separate.

### Completion and evidence rules

For each deliverable distinguish implemented source, local qualification, installed acceptance,
and actual ChatGPT journey acceptance. Never collapse these into one percentage or PASS.
Record source commit, tested bundle/config identity, artifact/validation/release identities where
applicable, client path, result and cleanup ownership. A later version or a healthy controller
alone does not requalify an untested journey. Reuse prior evidence unless relevant code, runtime,
policy or host behavior changed; run focused/affected/full checks for implementation changes.

Treat each unfamiliar production identity as an observation to verify, not an update instruction.
No routine upgrade, credential rotation or observer restart is required merely to begin this plan.
Unknown effects remain attached to their original operation/request; no ambiguous-effect retry.

### Product qualification backlog and scenario sources

Use this table to select P4–P6 journeys and later product work. It does not supersede P0–P6.

| Order | Work | Completion gate | Dependency / scope limit |
|---|---|---|---|
| 0 | Bind the current installed acceptance target | Read current controller/bundle, grants, pending effects and an owned disposable project/service target; define cleanup and evidence paths | Read-only preparation; no broad config changes or unrelated cleanup |
| 1 | Finish packaging slice 6 on the installed authenticated path | Pinned dependency + generated asset, source validation → retained build → artifact validation → release; exact live identity, logs and retained bytes recorded | Use the implemented native pure-Python path, not a new packaging framework |
| 2 | Finish installed package lifecycle and non-service delivery | Retire task/build scratch through supported operations; package still runs; update, rollback without acquisition/rebuild, failed-switch recovery, stop/start/remove with data preserved; non-service file export and pin-aware prune | Own disposable effects only; app rollback cannot restore changed host runtime; use existing fault fixtures unless an installed-only gap needs a safe targeted check |
| 3 | Qualify the baseline whole development journey | One new project and one two-project workspace, edit/debug/test/integrate/publish/package/deploy/verify/reconnect/cleanup through real ChatGPT; measure useful resumption and visible progress separately | Start without new semantic notes; local/bridge success is not ChatGPT acceptance; record blockers rather than waiting indefinitely for a host slot |
| 4 | Repair measured friction and bound operating costs | Fix reproducible blockers from steps 1–3; measure manual IDs/config edits, redundant calls, large export cost and retained/release-copy storage; requalify affected paths | CLI artifact/deployment selectors, streaming export, historical-copy retention, hot reload/PTY or cross-task dependency reuse only when a concrete gap justifies them; preserve pins/data, no automatic GC by default |
| 5 | Decide and qualify minimum semantic continuity | Baseline shows costly loss of working intent beyond durable facts; then bounded optional workspace notes, comparison against baseline and independent failure behavior | Existing notes design below remains the candidate; no mandatory sidecar, transcript store or per-call metadata; defer implementation if repository/task evidence is sufficient |
| 6 | Qualify additional package targets one at a time | Native Python extension on selected Android ABI; then selected Node/static/native-binary case; bounded APK/AAB build/signature qualification when selected | Pure-Python success proves none of these. Pin actual toolchains/inputs; Android build/signature/install/live behavior are separate gates; no UI companion prerequisite |
| 7 | Add narrow source-independent resource access | A demonstrated task needs native filesystem/process/toolchain observation without a dummy source task; bounded delegated observation and explicit ownership | Move only the specific blocker earlier if necessary; do not introduce several overlapping host/resource/connection families |
| 8 | Add demand-selected integrations | Concrete MCP/CLI/API/model or remote/container target, then Android-use/companion if needed; attach/use/revoke/recover independently | No universal gateway, mandatory model, OAuth/RBAC or Android UI subsystem on the current critical path; shared-account restrictions require a separate user requirement |

Steps 0–2 are now requalified on the live 0.1.22 resident through the refreshed ChatGPT surface and
their installed evidence is recorded in README/LOCAL_VALIDATION. The next selected work is step 3: run
the baseline whole one-/two-project development journey and measure reconnect/visible progress separately.
The 0.1.24 human-name fixes additionally passed the bounded reported ChatGPT material lookup:
three reported reads, no user-supplied IDs, explicit ambiguity and recognition of the closed published
predecessor. This is a completed subcheck of step 3, not closure of its one-/two-project workload or
continuous visible-progress gate.
Before expanding that workload, isolate the user-reported 18:30 KST visible stall using the
original terminal receipt and bounded read-only cells. Server completion is recorded; the
stalled cell script/host return and matching caller witnesses are missing. A new turn is not
proof of a fresh conversation or repaired scheduling. Do not rerun successful validation or
restart resident/Tunnel merely to diagnose it; use the incident protocol in CONTROLLER.md.
Repair concrete client blockers under step 4 when discovered rather than waiting until the end of the
journey. The proved packaging target is an application running from retained verified bytes after its
source/build environment is retired, with update/rollback/failed-switch recovery/cleanup rechecked through
actual host calls. Do not rebuild slices 1–5 merely to continue the journey. Step 3 starts with available
existing functionality before step 5 changes its recovery mechanism. Steps 5–8 remain conditional work,
not mandatory gates; unavailable optional clients do not prevent useful local work.

### Cross-cutting acceptance tracks

These tracks accompany the main queue; they do not independently restart completed implementation.
A reproducible safety/data-loss defect can preempt it. Host-private uncertainty or a missing
workspace/credential need not block unrelated local packaging work.

| Track | Selected work | Exit / escalation rule |
|---|---|---|
| ChatGPT visible continuity | Observe ordinary packaging/development with bounded caller cells and sparse witnesses; independent local observer plus user-visible times; optional session B only when it adds discrimination | Backend completion, caller receipt/continuation and visible progress are separate results; a stall preserves evidence and opens a specific boundary investigation, not more density trials |
| Connection/authentication | Qualify two independent real workspace paths to the same owner/task; Bearer-required and no-auth-compatible admission, correct/wrong/missing credentials, independent enable/disable and existing-client continuity | Healthy Tunnel processes are local evidence, not actual workspace authentication acceptance; run when those external clients are available, without replacing the packaging queue |
| Local operator usability | Keep numbered menus and direct automation commands; assess lifecycle summaries, recoverable failures, installed/source identity and ID selection during real tasks | Add only actions that reduce measured operator burden; adding every MCP field to menus is not the goal |
| Security and retained ownership | Current principal/policy checks, credential revocation surviving rollback, original-operation reconciliation, active/previous/in-flight artifact pins, bounded diagnostic storage | No auth weakening, deleted user evidence, silent effect retry or automatic repair based on a stale diagnostic/semantic note |

## Lifecycle investigation acceptance

When long-running visible delivery is the selected evidence gap, measure the actual
2026-07-28 POST response boundary before changing caller polling. Distinguish a silent
open request, server SSE write/flush, Tunnel/client network receipt, host successor
scheduling and visible rendering. The 2026-09-29 real ChatGPT acceptance proved one concrete
boundary: a no-progress-token `tdev_operation status(waitMs=8000)` produced HTTP 200 SSE headers,
keepalive writes/flushes, terminal JSON-RPC write/flush and stream close at the resident while the
host tool call did not return. The selected tdev repair is modern auto response shaping: no
`progressToken` means one JSON response after bounded observation; an opted-in progress token
uses request-scoped SSE with standard `notifications/progress`. Do not invent a server progress
token or treat comments as protocol/UI progress. Qualify the JSON fallback in the affected real
host and the progress-token SSE path with the pinned official SDK separately.

Carry the existing optional diagnostic behavior through P5. Investigate the cases below when
a reproduced continuity defect selects them; they do not supersede the P0–P6 delivery order.
Diagnostics remain operationally independent; continuous monitoring is not a new prerequisite
for admission or success. Existing local evidence should be analyzed before acquiring new trials.
The detailed investigation order below is activated by a useful evidence gap, not by elapsed time.

### Lifecycle investigation follow-up order

1. **Correlate existing evidence first.** Bind runtime/process and capture coverage, original
   request/operation and caller witness identity where available. Record server HTTP completion,
   caller tool_return/cell_exit/next cell_enter, independent observer availability and actual
   visible progress separately. No marker is a negative-proof shortcut; server write is not
   caller receipt; cell_exit is not outer-result delivery; marker receipt is not UI delivery.
2. **Observe a normal useful workload.** Reuse packaging acceptance as the workload. Apply the
   existing bounded-cell adapter with total-attempt accounting and reserved closing witnesses;
   the observed 20-call ceiling is not a tdev server contract and the conservative caller budget
   is not a host guarantee. Session B must not wake A and must disclose status reconciliation.
   Keep user-visible observation external; preserve evidence before bounded rings overwrite it.
3. **Choose a falsifying comparison.** Only if a boundary remains ambiguous, compare equivalent
   direct MCP / Local Codex bridge / available Code Mode / real ChatGPT behavior. Hold workload
   and checkpoints fixed; count calls, bytes, rollover, useful progress and observation overhead.
   Prototype aggregate observation only when redundant round trips explain material cost.
4. **Handle control ownership separately.** Report/Stop/successor-message/resume evidence must
   not be treated as the same defect as a natural visible stall. Existing evidence comes first;
   additional disposable Stop/cancellation experiments require a newly selected hypothesis and
   applicable user authorization. No revived C20/C22 or Stop campaign is implied by this plan.
5. **Repair and qualify only the identified layer.** Fix a proved tdev issue in its semantic
   owner, or mitigate caller pressure in the adapter. Qualify the changed path locally and in
   the actual affected host. Report private host uncertainty explicitly. The current response
   channel cannot guarantee host wake-up or visible rendering; recovery alone is not visible
   success and a backend PASS must never mask that product gap.

Use runtime failure rehearsal and authorized installed validation for actual runtime changes.
Do not silently acknowledge incidents, switch monitoring modes or replace a working observer
as part of reading evidence. Native same-UID tests establish behavior, not hostile-code isolation.

## Deployment packaging implementation plan

This is the detailed plan for step 4, recorded at the user's request after canonical
`758ef37eaa164370d94486b247f1bd8bdbd1cb62`. It authorizes no implementation or activation by
itself. Current behaviour remains in README/ARCHITECTURE and current wire types remain in
contracts/tools.schema.json. The action/field names below are proposals to settle with the
corresponding implementation slice. `inspectRecipe/prepare/list/inspect`, artifact-subject
validation, packaged release, bounded file export and explicit pruning are implemented.
Stay on the authorized 0.1 product line.

The first two slices supply bounded recipe/manifest definitions, frozen-source/current-policy
binding, source-vs-artifact receipt rejection, native build admission/replay and retained sealing.
Signing transformations, runtime layout and artifact-validation requests must be qualified with
their execution slices; schema acceptance is not a claim of APK/AAB toolchain support.

### Outcome and first supported case

An app with a third-party dependency and generated build output must run from a retained,
verified artifact after its source task, development environment and build scratch directory
have been removed. Updating or rolling back selects retained artifact bytes; activation must
not reinstall dependencies, contact a package registry or run a build. Source publication
remains independent of deployment, and deployment never changes the canonical Git ref.

Artifact production itself must also work without a deployment: native binaries, archives,
static/web packages and Android APK/AAB are concrete general-development outputs. The shared
artifact model cannot require a service target, foreground entrypoint or HTTP readiness. The
first service adapter adds these requirements only when releasing its selected artifact.

Start with a Termux-native Python HTTP application, one pinned pure-Python dependency and a
generated asset. Then qualify a compiled Python dependency against the selected Android ABI.
Node/static/native-binary recipes reuse the proven artifact lifecycle only when qualified;
do not claim arbitrary package-manager or cross-platform compatibility from the Python slice.
The initial package includes application outputs/dependencies, not Android, the interpreter,
all system libraries or a container image. Required host components are explicit external
requirements with checked identity. No public ingress, secret manager, database migration,
zero-downtime switch, universal build graph or remote registry is a prerequisite.

### Required joins and authority

The flow is source validation → prepare artifact → validate sealed artifact → release it →
verify live identity. Each arrow joins immutable identities rather than a mutable directory
name. Source validation continues to bind the exact candidate and adopted project policy.
Artifact validation additionally binds packaged bytes and the applicable verification policy.
A service validation also binds runtime requirements and launch specification. Passing source
tests does not prove that a dependency/build package works.

Keep the existing source-task/checkpoint/publication model and deployment target ownership.
An artifact is a retained build output, not a new source task, project or work mode.
Workspace composition supplies context; it never grants build, repository or target access.
Current principal/project/target checks apply to new effects and replay. Changing a policy,
repository identity or target must not silently reinterpret an accepted build or release.
Stopping/removing a known owned deployment remains possible after artifact damage.

### Slice 1 — recipe, identity and contract

1. Define a bounded project-owned packaging recipe captured in the validated candidate. Bind
   its path and digest, explicit input/lockfile paths, build command, exported roots/output kind,
   build host/toolchain and artifact target requirements. Service recipes additionally bind a
   foreground entrypoint and non-secret runtime settings. No recipe field grants
   authority, chooses an arbitrary installation root or overrides mandatory validation.
   Scope permits normal project recipe edits without per-build private configuration edits.
2. Separate acquisition inputs from execution inputs. Resolve dependencies once using pinned
   lock entries and content hashes; preserve the selected distributions and transitive closure.
   A cache is an optimization only: every reused item is checked against recorded content.
   Unpinned, missing, changed or incompatible inputs produce a concrete failure, never a
   fallback to the mutable task venv or a silently refreshed dependency version.
3. Specify a canonical manifest containing file paths/modes/content digests, output kind,
   source-tree identity, recipe/input digests, build/target compatibility and optional service
   launch information. Do not confuse the build executor with the eventual runtime. Keep build
   candidate/validation/operation IDs, timestamps, policy and observations in provenance receipts so retries with identical
   semantic inputs/outputs need not produce a different content identity merely from new IDs.
   Distinguish replaying the same retained artifact from reproducing identical bytes in an
   independent build; only measured repeatability may be reported as reproducibility.
4. Prefer one `tdev_artifact` surface for prepare/list/inspect/export/prune, rather than forcing
   an APK/archive build through a deployment tool. This replaces the earlier proposal to put
   all artifact actions on `tdev_deploy`: names should match the responsibility, not optimize
   tool count. Reuse `tdev_operation` for execution/recovery, an artifact verification variant
   on `tdev_validate`, and `tdev_deploy` for release from successful artifact validation. Keep
   the current source-release variant explicit. Release must not accept a different launch command
   that bypasses the artifact verification receipt. Use returned handles/default target
   resolution; ordinary use must not require users to type digests or internal IDs.
5. Freeze the source/artifact validation distinction in contracts and negative tests.
   `tdev_publish` accepts only appropriate source validation; artifact validation neither
   regenerates the source candidate nor substitutes for source publication authorization.
6. Model signing/post-build packaging as transformations with input/output identities; verify
   the exact final output after signing. Preserve signer references/public certificate identity
   without storing keys/passwords. No signer service is required for the first unsigned fixture.
   APK and AAB require different signing/installation handling; qualify each selected recipe,
   not an Android-specific universal pipeline. Authorized export of retained bytes must work
   independently of service activation, with bounded transfer/digest verification and no arbitrary
   host-path reads. Download/installation success is separate from live verification.

Done when fixtures reject inconsistent candidate/recipe/artifact/runtime joins, policy changes,
forged success data and stale request/revision inputs, while the source-only path still works.

### Slice 2 — retained builds and sealed storage

1. Add the smallest artifact record needed for owner/project identity, content identity,
   build/source-validation references and storage/pin state. Use existing operation intent,
   result, effect certainty and request deduplication for the build; do not copy command logs,
   validation results or credential grants into another history table. Retain failed build
   evidence with bounded logs and actionable cleanup, including across task/workspace close.
2. Reuse the native supervisor for cancellable/deadline-bounded builds in a fresh source copy
   with independent scratch and dependency storage. Pin the frozen input, not the mutable
   development environment. Record process identity before relying on a build result; reconcile
   an accepted operation on reconnect instead of rerunning its package-manager/build commands.
   Source editing can continue without changing this build's input. Surface outstanding builds
   through bounded operation/deployment inspection so they are not hidden behind a history page.
3. Acquire dependencies using existing authorized facilities without putting credentials into
   the recipe, manifest, subprocess receipt or exported package. The first fixture uses public
   inputs. Private acquisition needs an explicit qualified credential mechanism later; a clean
   environment does not make same-UID native execution a credential-isolation boundary.
4. After all supervised build descendants stop successfully, collect only declared exports.
   Reject escaping paths/symlinks, special files, case/path collisions where relevant, undeclared
   additions, oversized files/trees and source mutation. Do not archive the whole task HOME,
   venv/cache, checkout or host filesystem. Normalize only documented metadata; preserve modes
   and symlink semantics that affect execution. Do not treat candidate stdout as a manifest.
5. Seal through a private staging directory, verified manifest and atomic rename/fsync into
   content-addressed storage. Never expose a partial tree as deployable. Pin objects before
   recording references. Lost replies and crashes at pre-dispatch, child launch, capture,
   rename and receipt commit need distinct recoverable states; uncertainty must not trigger
   another build. An unreferenced complete artifact is recoverable storage, not proof of a
   completed operation.

Done when controller/process failures, cancellation, low disk space, duplicate requests and
lost receipts cannot create partial artifacts, duplicate accepted builds or lost cleanup owners.

### Slice 3 — Python layout and host compatibility

1. Install dependencies into a newly prepared artifact-local layout from the recorded inputs.
   Do not copy a live venv and assume relocatability. Test imports, package data, entrypoints,
   scripts/shebangs, absolute build paths and runtime writes from the actual final layout.
   Build native extensions only for an explicitly identified compatible target; retain their
   source/distribution and compiler/build provenance, not an unqualified portability claim.
2. Define the launch environment from the artifact manifest and selected host runtime, with
   dependency lookup rooted in the artifact. Ignore development caches and undeclared
   toolingEnvironment dependency paths. Keep HOME/TMP/data/logs outside sealed outputs.
   Explicitly identify the interpreter, Android architecture/ABI and required system libraries;
   a version label or PATH entry alone is insufficient identity. Document which host facts
   are attested and which remain external assumptions for this adapter.
3. Recheck those requirements before validation/start/rollback. A host update that invalidates
   them is an incompatibility, not permission to rebuild/reinstall during restart. Preserve
   inspection, data and stop/remove paths. Specify the operator remedy when a pinned interpreter
   or library is no longer installed; rollback of application bytes cannot restore the OS.
4. Check independent builds with frozen inputs before promising identical output hashes.
   Report nondeterminism (embedded paths, timestamps or generated bytes) instead of weakening
   content checks. The first deliverable guarantees retained-byte reuse; reproducible rebuilding
   is a separate measured acceptance property of each recipe/adapter.

Done when the pure-Python case runs after development/build roots are deleted, hidden host
dependency fallback fails clearly, and incompatible native/runtime requirements are rejected.

### Slice 4 — artifact validation and release integration

The implemented native checks use disposable copies, external writable
data, the adopted policy and stopped receipt proof. Service verification uses a separate loopback
port and the manifest entrypoint; packaged release/start/rollback recheck runtime and policy before
stopping the previous service. An isolated real runit/public-wheel rehearsal covers update,
reconnect, crash recovery and failed-switch restoration. See LOCAL_VALIDATION for exact scope;
this is not installed ChatGPT acceptance.

1. Validate the sealed artifact in its intended runtime layout using a separate writable test
   scratch/data area. Mandatory verification is selected by current adopted project/packaging
   policy, not a caller-supplied PASS field. Reuse the existing validation command where it
   can explicitly exercise the artifact; otherwise delegate an artifact-validation entrypoint
   once in project policy. Project-owned test scripts remain ordinary validated source, not
   authority to waive mandatory source/manifest/readiness checks. Settle this policy binding
   in slice 1 before accepting the first artifact; do not ship a recipe-defined bypass.
2. Verify packaged dependency use and a generated output, and for services exercise the actual entrypoint.
   Check content before/after, exit status and proved child termination. Artifact verification
   does not itself authorize switching a live target. A validation can be repeated against
   unchanged retained bytes after a compatible policy update, without rebuilding them.
3. Bind the artifact-validation receipt to artifact content, original source validation,
   adopted artifact-check policy and applicable runtime/launch requirements. Keep semantic artifact
   identity separate from deployment-instance release identity to avoid manifest/hash cycles.
   The existing HTTP release header continues to prove which deployment instance is serving.
4. Extend deployment manifests/runner checks to pin the artifact and its successful verification.
   Start/rollback use existing service ownership, revision CAS and durable switch recovery.
   Perform all artifact/runtime/policy checks before stopping a healthy previous deployment.
   A failed activation restores the previous desired artifact; an interrupted switch is
   reconciled from its retained intent. Do not rebuild to make rollback pass.
5. Check the supported state/bundle format at update/rollback admission. No migration framework
   merely to preserve an experimental wire name, but existing source deployments, user data and
   active artifact pins must never be silently discarded or read by an incompatible bundle.

Done when a verified source with a broken package cannot release, replacing packaged bytes or
runtime identity is detected, and failed/ambiguous activation restores or retains honest recovery
evidence without losing the prior artifact or application data.

### Slice 5 — retention, limits and cleanup

The implemented scope includes paged metadata usage, verified file-byte export,
prune preview/current-pin recheck, durable retirement with recoverable rename/delete and
preserved operation receipts. Global operator budgets reserve retained capacity for admitted
builds; output/input/file ceilings remain conservative. This is not a disk quota for the whole
installation: deployment release copies, native scratch and temporary sealing copies have
separate lifetimes and are excluded from retained-object usage. No automatic GC or path-based
delete/export is exposed. Old deployment release copies are retained; pruning their independent
history is not implied by pruning a build's retained object.

Track hard pins from active/previous deployments, in-flight verification and ambiguous switches;
pending builds preserve their own capture and capacity reservation without fencing unrelated
cleanup. Distinguish these from configurable retention of historical verification artifacts. Receipts remain
available after explicit artifact retirement and say when their payload has been pruned;
an old successful receipt cannot reactivate absent bytes. Task environment reset and
task/workspace close must not invalidate deployed packages.
Deployment remove preserves data by default and does not silently purge historical artifacts.
Provide bounded usage/list/inspection and an explicit prune preview; removal rechecks current
pins under the same admission discipline as a competing activation. Never follow an arbitrary
caller path. Use a recoverable tombstone/rename before deleting owned unreferenced storage.
An unknown effect remains pinned. Operator-controlled disk/file/output/deadline budgets must
account for dependencies and artifacts separately from the current small source-copy budget;
do not disable existing limits merely to accommodate builds. Native budgets remain sampled,
not hostile-process containment. Defer automatic GC until the explicit ownership path is proven.

### Slice 6 — qualification and delivery order

| Acceptance | Required evidence |
|---|---|
| Unit/contract | Manifest/path/identity checks, source vs artifact validation, current grants/policy, dedup/CAS, pins and bounded inspection; existing source-release tests remain green. |
| Native packaging | Locked dependency plus generated asset; cache poisoning/missing inputs fail; modifying/resetting the dev environment cannot change sealed bytes. |
| Non-service output | Archive/file artifact prepares, validates and exports with no HTTP port, foreground command, runit service or deployment target. |
| Android qualification, when selected | Pin JDK/Gradle/AGP, platform/build tools and any native-tool substitutions; build a minimal APK and AAB, verify signatures and final hashes with a disposable test key; distinguish build-only success from authorized device installation. No companion/root prerequisite; unsupported toolchain reports the actual gap. |
| Runtime separation | Start after task/build scratch removal, deliberate dependency shadowing rejected, host incompatibility reported, artifact writes rejected or moved to declared data. |
| Failure recovery | Interrupt acquisition/build/seal/receipt/switch/rollback/prune; observe original operations after reconnect; no hidden second build, orphaned live process or deleted pinned artifact. |
| Real isolated runit | Update between two dependency/output versions, matching live release identity, deliberate stop, crash recovery, rollback with registry unavailable, data-preserving removal. Network isolation is not inferred from a native offline test. |
| Client/installed path | Official SDK and affected client schemas, then authorized disposable installed acceptance; exact runtime bundle and artifact digests, health, logs, cleanup and source remote readback recorded. |
| User journey | New local project and a two-project workspace: develop, validate, package, release, reconnect, update/rollback and close. Record manual config/identifier interventions, tool calls, elapsed time and retained storage. |

Within P4, use the packaging dependency order above and run focused/affected tests then
`scripts/check.sh` per meaningful change. Expected component touchpoints are the existing wire
contracts and scoped config policy,
core admission/validation, store retention, native build supervision, deployment manifest/runtime,
and corresponding unit/real-runit rehearsals. Share concrete capture/hash/path checks where their
semantics match; do not create a universal artifact/connection framework just to remove duplication.
Update ARCHITECTURE semantics and contract types alongside implemented slices; keep unimplemented
claims out of README. Record actual acceptance and limitations in LOCAL_VALIDATION.

P4 reimplements and P6 qualifies these recipe/identity, retained-build, validation and deployment
semantics. Existing evidence may inform fixtures but cannot qualify the new implementation. The pure-Python path has
real selected-distribution build/relocation and isolated runit evidence; consult README for installed
artifact validation/release acceptance. Real ChatGPT journey and broader dependency/native-extension
qualification are separate gates.
Product minor/major version changes still need user authority.

## Minimum semantic continuity implementation and qualification

After the baseline journey demonstrates a semantic recovery gap, implement only ARCHITECTURE's
optional workspace resume note first. This candidate does not block baseline qualification. Existing source tasks,
execution, validation, publication and deployment keep their semantics. Do not add a full
transcript/event store or new thread/planner owner to make the test easier.

1. Add bounded note actions, principal/workspace/reference checks, isolated lazy sidecar access,
   revision CAS and bounded replay/retention. Missing metadata is the normal supported path.
   Add only implemented fields to the public contract; no speculative conversation/adapter types.
2. Add candidate discovery and selected-note retrieval, with separately identified current
   material observations. Preserve unavailable/unknown/reconciliation-needed states. Ordinary
   development calls must not open the sidecar or wait for its locks. No automatic provider or
   service recovery as a side effect of reading a note.
3. Teach hosts through concise tool descriptions/usage to remember at meaningful boundaries and
   resume on continuation. Qualification uses actual new ChatGPT conversations as well as client
   fixtures; MCP cannot guarantee host invocation, capture unsubmitted meaning or control host
   compaction. No user-pasted internal IDs or handoff essay as the standard path.
4. Measure against the existing document/task/operation baseline. Stop expanding the feature if
   it does not materially reduce recovery work. Consider bounded semantic events only after
   concrete examples show the current note/history bounds lose useful meaning. Optional external
   session provenance and ChatGPT metadata routing each need independent evidence of value.

| Test matrix | Required result / measurement |
|---|---|
| Semantic recovery | Seed a changed objective, rejected alternative, blocker and pending useful action; fresh model finds relevant meaning, verifies referenced current state and advances correctly. |
| Material reconciliation | Advance Git, complete an operation after its response is lost, revoke policy, stop/change a deployment and retire referenced payloads; stale prose never causes replay, false PASS or unauthorized effect. |
| Concurrency/replay | Two conversations replace one note; stale writer cannot erase newer content. Lost reply replays while retained; deleted/expired receipts and reused request IDs cannot resurrect or overwrite another note. |
| Discovery | One clear candidate and several ambiguous objectives; one conversation/many notes and many conversations/one note; no hard attach, cross-principal leak or reliance on user-supplied handles. |
| Complete isolation | Disabled, missing, deleted, corrupt, locked, full and incompatible sidecar; failed compaction, expired note and refused semantic sync; existing tools/cleanup/replay remain usable with their original security checks. Exercise real effects in disposable fixtures, not just success-shaped mocks. |
| Client independence | No metadata, forged/changed session IDs, Local Codex and another MCP client; absent provenance neither blocks development nor expands scope. Direct ChatGPT proof is separate from scripted HTTP/SDK tests. |
| Bounds/privacy | Oversized text/ref/candidate lists, sensitive-input rejection, history retention, explicit forget and revoked project references; no raw transcript/stdout/secret export or unbounded model context. |
| Non-mutating resume | Pending deployment recovery remains pending until its normal effect/reconciliation path is invoked; reading a capsule never stops/starts a service or refreshes a source pointer. |
| Journey | One project and a two-project objective, reconnect mid-build/release, close tasks, resume in a new conversation, finish/cleanup with notes unavailable as well as available. |

Use the same fixed cut points/prompts and current material states for baseline and note-enabled
runs; repeat to expose model variance. Count tool calls to first **correct useful action**, elapsed
time, user handoff/config/ID interventions, repeated completed work, stale-assumption failures,
model-visible tokens (including update/rebind costs), response bytes and retained storage.
Initial targets, not measured claims: no user-copied IDs or handoff essay for an unambiguous
workspace; at most three discovery/resume/observation calls before useful action in the bounded
fixture; at least 30% lower median resume-context tokens than full reconstruction; zero unintended
replays/permission expansion. Report absolute costs and failed cases, not just reduction ratios.
Do not claim a reduction against full transcript injection if the real baseline already uses
bounded repository docs. No extra semantic call per ordinary tool operation; core-disabled
regression runs must retain prior results. If targets fail, simplify/revise before adding events.

A redacted current-host metadata experiment, if later selected, records field presence/type/
length and principal-scoped digest only. Compare repeated calls and a second actual conversation;
record transport identity separately. Do not read credentials, log raw requests or treat a
scripted `openai/session` value as host evidence. It does not block note-only delivery.
