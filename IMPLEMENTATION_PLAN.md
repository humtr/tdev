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
current-frontier read must identify proved-complete predecessors, running/unknown effects,
exact current source/remote state, cleanup ownership and the next admissible action. The fresh
session must skip completed predecessors and, absent a genuine external blocker/unknown
effect, perform useful forward work in that same turn. Tests must cover "completion happened
but caller did not observe it" for both same-turn polling and fresh resume. Terminal lifecycle
must also leave a supported inspection/cleanup path for clean owned resources.

First complete path: open → read/edit → exec/process → validate → publish → readback.
Never weaken exact publication/replay to hide missing native support. Keep native authority
limitations explicit instead of promising unavailable kernel boundaries. No permission
choreography or new release/provider framework.
