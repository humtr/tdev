# Implementation order

Derived from ARCHITECTURE; status belongs in README, wire types in the contract.
Termux alone must support the default coding path. Optional remote backend qualification
does not block any native deliverable.

| Deliverable | Required invariant | Minimum checks | Next prerequisite | Human acceptance |
|---|---|---|---|---|
| 1. Contract/SQLite/Git workspace/read/edit | current scope, atomic edits, checkpoint CAS, replay before stale, unrelated state preserved | JSON Schema fixtures, Git fixtures, restart/races | durable source/intent | none |
| 2. Command + validation/publication on Termux | native default without executor registration; clean env and disposable source; real exit; exact commit; durable replay; non-force CAS | native commands, stdin, output/deadline, source-change/forged-stdout rejection, exact publication | complete on-device coding path | none |
| 3. Process recovery and HTTP/auth | detached supervisors survive controller restart; no lost-response relaunch; per-workspace uncertainty; MCP 2026-07-28 per-request metadata, no legacy handshake | real crash/reconnect, subreaper cancellation, input replay, full HTTP edit/exec/validate/publish; pinned official SDK and negative wire tests | recoverable MCP | ChatGPT connection/Refresh, exact-version forwarding and credential entry only |
| 4. Inactive install/rollback and config | omitted/native config works; explicit SSH stays optional; no false sandbox/egress claim; no production effect | defaults/legacy SSH schema, installed CLIs, packaged native path, rollback/tamper | ready for on-device host acceptance | Tunnel credentials and explicit production cutover only |
| 5. Local client and CLI extension qualification | no core protocol downgrade or new authority; fixed tmcp host-hint annotations; completion visible in same turn/reconnect; closed resources manageable | bounded frontier/no-change/missed completion; installed Codex discovery + disposable read/edit/exec/process/validate/publish/replay/retire; external CLI real exit/capture/forged authority rejection | qualified selected clients/extensions, not every hypothetical adapter | targeted ChatGPT Refresh/approval acceptance after annotation changes; persistent Local Codex registration uses operator-supplied private bearer |

Each deliverable: source, invariant tests, focused/affected checks, first-order failure
repair, scripts/check.sh, coherent diff/state review; then continue. Authored-program tests
exercise the real default runner but do not prove hostile-code isolation. Keep optional
OCI tests without treating external enrollment as a gate.

Live progress continuity is a required acceptance dimension, not optional UX polish.
The primary failure case is **same-turn staleness**: an operation advances or completes while
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
current-frontier read must identify recent proved-complete predecessors, running/unknown effects,
exact current source/remote state, cleanup ownership and the next admissible action. The fresh
session must skip completed predecessors and, absent a genuine external blocker/unknown
effect, perform useful forward work in that same turn. Tests must cover "completion happened
but caller did not observe it" for both same-turn polling and fresh resume. Terminal lifecycle
must also leave a supported inspection/cleanup path for clean owned resources.

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

First complete path: open → read/edit → exec/process → validate → publish → readback.
Never weaken exact publication/replay to hide missing native support. Keep native authority
limitations explicit instead of promising unavailable kernel boundaries. No permission
choreography or new release/provider framework.

Deliverable 5 is derived from the selected local client and command-first extension path,
not an inherited stage name or a requirement to implement a capability gateway. Its adapter
is an explicitly selected legacy stdio edge; core HTTP remains 2026-07-28. Run
`scripts/check_codex.py` separately from deterministic tests because it depends on installed
Codex. CLI fixtures prove extension behaviour, not hostile same-UID isolation. Qualify a
remote/API/device adapter only when one is actually selected. After local deliverables,
only affected host acceptance and separately authorized activation remain; do not build or
activate a release framework to substitute for those human actions.
