# tdev

ChatGPT leads repository development; tdev supplies commands and exact source handling,
mutation replay/recovery and controlled validation/publication. **Android + Termux is the
default development and operating environment**, not just a controller for another machine.

Seven MCP tools, Git checkpoint OIDs and two SQLite row families (workspace/operation).
MCP is pinned to **2026-07-28** with per-request metadata and server/discover, not legacy
initialize. OpenAI host acceptance of this exact version is separate from local conformance.
Normal exec/tests run natively on Termux in per-operation copies with detached supervisors.
No SSH host, VPS, OCI, root, systemd or Docker prerequisite. Explicit remote execution
remains optional; it never silently falls back to native.

Native execution carries ordinary Termux app-UID authority. Clean environment, private
HOME, source capture, process controls and API grants are useful safeguards, not hostile-code
sandboxing or same-UID credential isolation. Use native commands/dependencies only when
trusted with the local user's authority. See [trust boundary](ARCHITECTURE.md#3-native-trust-and-containment).

## Current work

The remote-only architecture regression is corrected in config, default command/process/
validation dispatch, source handling and operations. The real native runner and full HTTP
workspace/edit → exec/process → validate → publish path pass local qualification, including
restart, stdin replay, cancellation, output/deadline limits and validation-source integrity.
All four implementation deliverables have locally executable source/tests: 55 deterministic
tests pass, along with the official SDK 2.0.0 pinned-protocol probe and inactive packaged
native SIGKILL/recovery/publication rehearsal. No production service/runtime was changed.
Existing unrelated untracked files are preserved.

The remaining host-dependent acceptance is ChatGPT/Tunnel 2026-07-28 discovery, bearer forwarding and
reconnect. A separate Linux executor is not a next step or gate for normal use.
See [local evidence](LOCAL_VALIDATION.md) and [operator steps](OPERATIONS.md).

Run deterministic checks with `sh scripts/check.sh` after
`python -m pip install --target .tdev-deps -r requirements.txt`.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
