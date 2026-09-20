# tdev

ChatGPT leads repository development; tdev supplies commands and exact source handling,
mutation replay/recovery and controlled validation/publication. **Android + Termux is the
default development and operating environment**, not just a controller for another machine.

Seven MCP tools, Git checkpoint OIDs and two SQLite row families (workspace/operation).
MCP is pinned to **2026-07-28** with per-request metadata and server/discover, not legacy
initialize. Normal exec/tests run natively on Termux in per-operation copies with detached
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
All four implementation deliverables have locally executable source/tests: **58 deterministic
tests pass**, along with the official SDK 2.0.0 pinned-protocol probe and inactive packaged
native SIGKILL/recovery/publication rehearsal.

OpenAI tunnel-client 0.0.14 is qualified on Termux in two forms: the primary path builds the
official source as an Android/arm64 CGO-enabled binary and uses Android DNS/system trust
directly; the fallback runs the official Linux binary through termux-chroot with the Termux
CA bundle. termux-chroot is a convenience wrapper supplied by the Termux proot package, not
a sandbox claim.

**Live ChatGPT/Tunnel acceptance passed on 2026-09-21** on the development installation.
Connector Refresh exposed all seven tools. Authenticated workspace discovery, disposable-ref
read/edit, native exec/process, validation, exact GitHub publication/readback, same-request
replay and controller-restart replay all succeeded. Because the server rejects mismatched
protocol/method/name metadata before tool effects, the successful host calls also exercised
the required MCP **2026-07-28** request metadata/header path and bearer delivery.

The first live validation exposed a real native defect: rebuilding ignored dependencies
inside each clean validation copy hit `DISK_LIMIT`. The repair adds a bounded non-secret
repository `toolingEnvironment`; its exact values are recorded in execution input and bound
into validation policy identity. A second live disposable-ref validation then ran the full
58-test suite directly from an operator-owned warm tooling path, with no `pip install` in
the operation copy, and published/replayed successfully. Temporary acceptance refs and
authorizations were removed afterward. No production cutover occurred.

The previously observed development-harness requirement remains a permanent regression
invariant: **within the same model turn**, progress/wait/readback must expose underlying
advancement and completion instead of pinning the model to an old snapshot. The live
acceptance directly observed increasing output cursors, `running → terminal` transitions,
and durable terminal state after controller restart. No-change observations must remain
bounded/current, and fresh sessions must resume from durable state without rediscovering
proved-complete predecessors. These requirements remain normative in ARCHITECTURE §6 and
IMPLEMENTATION_PLAN.

Remaining unexecuted evidence is deliberately narrower: alternate-account/session isolation
for shared credentials, an intentionally wrong credential entered through the ChatGPT host
UI, optional remote OS isolation/egress, and production cutover. A separate Linux executor
is not a next step or gate for normal use. See [local evidence](LOCAL_VALIDATION.md) and
[operator steps](OPERATIONS.md).

Run deterministic checks with `sh scripts/check.sh` after
`python -m pip install --target .tdev-deps -r requirements.txt`.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
