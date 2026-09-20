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

First complete path: open → read/edit → exec/process → validate → publish → readback.
Never weaken exact publication/replay to hide missing native support. Keep native authority
limitations explicit instead of promising unavailable kernel boundaries. No permission
choreography or new release/provider framework.
