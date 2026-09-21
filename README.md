# tdev

ChatGPT leads repository development; tdev supplies commands and exact source handling,
mutation replay/recovery and controlled validation/publication. **Android + Termux is the
default development and operating environment**, not just a controller for another machine.

Seven MCP tools, Git checkpoint OIDs and two SQLite row families (workspace/operation).
Core HTTP MCP is pinned to **2026-07-28** with per-request metadata and server/discover, not
legacy initialize. Local Codex can explicitly select a separate legacy stdio adapter; it
does not downgrade core HTTP. Normal exec/tests run natively in per-operation copies with detached
supervisors. No SSH host, VPS, OCI, root, systemd or Docker prerequisite. Explicit remote
execution remains optional; it never silently falls back to native.

Native execution carries ordinary Termux app-UID authority. Clean environment, private
HOME, source capture, process controls and API grants are useful safeguards, not hostile-code
sandboxing or same-UID credential isolation. Use native commands/dependencies only when
trusted with the local user's authority. See [trust boundary](ARCHITECTURE.md#3-native-trust-and-containment).

## Current work

The remote-only architecture regression is corrected in config, default command/process/
validation dispatch, source handling and operations. The real native runner and full HTTP
workspace/edit → exec/process → validate → publish path pass local qualification, including
restart, stdin replay, cancellation, output/deadline limits and validation-source integrity.
The original four deliverables and the added local-client/CLI-extension deliverable have
locally executable source/tests. Current results and exact scope are in LOCAL_VALIDATION,
including the official SDK 2.0.0 pinned-protocol probe and inactive packaged native
SIGKILL/recovery/publication rehearsal. **64 deterministic tests pass** after independent review.

OpenAI tunnel-client 0.0.14 is qualified on Termux in two forms: the primary path builds the
official source as an Android/arm64 CGO-enabled binary and uses Android DNS/system trust
directly; the fallback runs the official Linux binary through termux-chroot with the Termux
CA bundle. termux-chroot is a convenience wrapper supplied by the Termux proot package, not
a sandbox claim.

**Prior live ChatGPT/Tunnel acceptance was recorded as 2026-09-21** on the development installation.
Connector Refresh exposed all seven tools. Authenticated workspace discovery, disposable-ref
read/edit, native exec/process, validation, exact GitHub publication/readback, same-request
replay and controller-restart replay all succeeded. Because the server rejects mismatched
protocol/method/name metadata before tool effects, the successful host calls also exercised
the required MCP **2026-07-28** request metadata/header path and bearer delivery. That run
used the fixed tmcp host-hint profile now restored in source; host acceptance after this
restoration still requires a Connector Refresh and user-side retest.

The first live validation exposed a real native defect: rebuilding ignored dependencies
inside each clean validation copy hit `DISK_LIMIT`. The repair adds a bounded non-secret
repository `toolingEnvironment`; its exact values are recorded in execution input and bound
into validation policy identity. A second live disposable-ref validation then ran the full
58-test suite directly from an operator-owned warm tooling path, with no `pip install` in
the operation copy, and published/replayed successfully. Temporary acceptance refs and
authorizations were removed afterward. No production cutover occurred.
Retained native execution copies were not all retired; the historical run is not evidence
of complete resource cleanup. Tooling policy binds configured strings, not external-directory
contents; use operator-owned dependencies and candidate-source-first lookup.

The previously observed development-harness requirement remains a permanent regression
invariant: **within the same model turn**, progress/wait/readback must expose underlying
advancement and completion instead of pinning the model to an old snapshot. The live
acceptance directly observed increasing output cursors, `running → terminal` transitions,
and durable terminal state after controller restart. No-change observations must remain
bounded/current, and fresh sessions must resume from durable state without rediscovering
proved-complete predecessors. These requirements remain normative in ARCHITECTURE §6 and
IMPLEMENTATION_PLAN.

Independent review of `99372b5..989f580` corrected stale mutation replay and missing
bounded progress/resume inspection. Workspace inspect and process status now expose current
facts, change/no-change evidence and cleanup ownership; no workflow table or planner was
added. After refreshed host testing, the public tool annotations are restored to the fixed
tmcp host-hint scope: all seven are read-only-hinted and the other three hints are false.
Those hints do not change tdev's mutation, execution, validation or publication authority.

Installed **Local Codex 0.155.1** discovery and disposable native read/edit/exec/process/
validate/publish, client reconnect/replay and retirement pass through the explicit stdio
adapter → localhost HTTP path. The installed client proposes 2025-06-18 in direct initialize;
the explicit adapter replies with supported version 2025-11-25, accepted by this client.
Neither is direct 2026-07-28 client support; core HTTP remains pinned and rejects legacy initialize.
This is actual Codex app-server MCP, not an autonomous model turn or Codex-through-Tunnel
test. The official Tunnel plugin is installed in the tested Codex profiles; plugin runtime
management and tdev tool registration are separate. CLI extension capture/real-exit and
forged-authority rejection are tested without adding a public gateway.

The reviewed code is now loaded by the existing development controller following explicit
restart approval; authenticated local tools/list matches the current contract exactly.
Tunnel, credentials, grants and durable operation/workspace rows were preserved.
Remaining: ChatGPT Connector Refresh and targeted discovery/approval requalification,
optional interactive Local Codex/Tunnel
route, intentionally wrong bearer through ChatGPT UI, selected remote backend isolation and
separately authorized production cutover. Shared credentials do not promise account/session
isolation. Only the explicitly approved development controller was restarted afterward. A separate
Linux executor is not a next step or gate. See [evidence](LOCAL_VALIDATION.md) and [operations](OPERATIONS.md).

Run deterministic checks with `sh scripts/check.sh` after
`python -m pip install --target .tdev-deps -r requirements.txt`.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
