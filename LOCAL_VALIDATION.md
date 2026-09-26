# Local validation evidence — 2026-09-20

Evidence only; README owns current status. Work location:
`/data/data/com.termux/files/home/prj/tdev`, branch `tdev`.
Starting authoritative local and remote HEAD:
`11042735d67ca029e258573ba3d800aa464fb755`.

No alternate development clone/checkout/worktree or production service change.
Synthetic Git repositories and inactive bundles were disposable authored test fixtures.
Existing unrelated .artifacts, node_modules and tools were preserved. The MCP SDK probe
was installed separately in ignored .tdev-mcp-client, not existing node_modules.

## Historical executed checks (before independent review below)

| Command | Observed result |
|---|---|
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_native test_http test_process_crash test_contract -v` | 21 tests, OK, 20.189s |
| `sh scripts/check.sh` | 57 tests, OK on the native-CGO/termux-chroot Tunnel-compatibility line; diff whitespace check passed |
| disposable `sh install.sh --no-start <private-root>` | `prepare-tunnel` selected `native-cgo`, built tunnel-client 0.0.14 for Android/arm64 with CGO, and staged the private binary in the DOWN Tunnel service template |
| `PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py` | Official @modelcontextprotocol/client@2.0.0, pin 2026-07-28, modern era; connection, seven-tool listing and structured tool call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` | Real staged native edit/exec → controller SIGKILL → restart/stdin replay → validate → exact local publication/readback; wrong bearer 401 and seven tools on both starts; runit shell syntax and DOWN templates passed |
| `PYTHONPATH=src:.tdev-deps python scripts/measure.py` | Three default-native exact-publication trials, below |

Rehearsed runtime bundle SHA-256:
`06992d4b0b47d71512af3d86bc393b6e0519477d203bdf4033f8233bab808633`.
It covers source, contracts and pinned Python dependencies, not a Git commit or production
deployment. The disposable bundle was removed after rehearsal; no active install changed.

The first official SDK probe rejected missing cache metadata on tools/list. Added required
ttlMs/cacheScope to discovery/list results and reran successfully. This was a real wire
failure, not treated as a PASS or hidden by relaxing the client.

Coverage: actual Draft 2020-12 schemas and positive/negative config/tool fixtures;
native default and explicit SSH no-fallback; SHA-1/SHA-256 source, atomic edits, CAS/ABA,
parallel refs/workspaces, immutable candidate HEAD and exact non-force publication;
actual controller SIGKILL while native execution remains live; lost launch reply without
re-execution; sequenced stdin; detached-descendant cancellation; timeout/partial capture;
bounded output; environment credential sentinels; validation source-change and forged
stdout rejection; terminal retirement and inactive rollback/tamper.

Missing native process identity is fault-injected to check unknown effect and per-workspace
fencing; it is not represented as an actual whole-UID kill. Optional OCI control-flow tests
use an authored mocked engine, not deployed Linux isolation. Native tests run the real
default supervisor on this Termux device, but do not prove hostile same-UID isolation.

## Small measurement, not a comparative benchmark

Advertised input/output tool schemas: **25,262 UTF-8 bytes**, canonical JSON.
Workload: open, batched read/search, atomic two-file edit, one real native validation,
exact local publication and status polls. No injected fixture executor.

| Trial | Wall seconds | Calls | Polls | Validations | Native starts | Exact publication |
|---|---:|---:|---:|---:|---:|---|
| 1 | 1.136 | 26 | 21 | 1 | 1 | yes |
| 2 | 1.119 | 29 | 24 | 1 | 1 | yes |
| 3 | 1.146 | 27 | 22 | 1 | 1 | yes |

Five semantic calls plus aggressive 10ms polling explain call counts; these are not
recommended ChatGPT polling intervals. No HTTP/Tunnel/GitHub latency, remote cold start,
large-repository throughput or comparative architectural speedup was measured. Fresh
per-operation copies and HOME do not retain ignored dependencies between runs. File
payload plus shallow Git pack still duplicate source. No broad performance claim follows.

## Tunnel host-compatibility follow-up — 2026-09-21

The installed tunnel-client 0.0.10 treated absent OAuth metadata (HTTP 404 candidates) as a
doctor failure. The official stable 0.0.14 was checksum-verified before replacement; its
doctor accepts that bearer-only configuration and reports the OAuth discovery candidates as
optional. The original binary was retained as a local backup.

The official 0.0.14 linux-arm64 binary is statically linked and was built without cgo DNS
support. On Android there is no /etc/resolv.conf, so its pure-Go resolver fell back to
[::1]:53 even though Termux curl resolved normally through $PREFIX/etc/resolv.conf.
GODEBUG=netdns=cgo was observed to be unsupported.

Two working Termux compatibility paths were then falsified and qualified. First, the pinned
official v0.0.14 source was built locally with `CGO_ENABLED=1 GOOS=android GOARCH=arm64`.
The resulting Android binary used the platform resolver and system trust directly: no PRoot,
GODEBUG resolver override or CA_BUNDLE was required. A read-only metadata lookup succeeded
and a bounded run emitted `🟢 tunnel-client started`. The simpler
`go install github.com/openai/tunnel-client/cmd/client@v0.0.14` route with CGO enabled also
produced a working Android binary.

Second, the installed official Linux binary was tested through `termux-chroot`. The wrapper
made Termux's resolver visible as /etc/resolv.conf, while `CA_BUNDLE=$PREFIX/etc/tls/cert.pem`
was still required for TLS verification. With that CA setting, metadata lookup and bounded
startup also succeeded. termux-chroot is provided by the Termux proot package, so this is a
simpler fallback wrapper rather than removal of the underlying PRoot dependency or a security
boundary. Product direction is native CGO first, termux-chroot fallback.

These probes established the Termux control-plane startup path. Live host evidence followed
on 2026-09-21.

## Live ChatGPT/Tunnel acceptance — 2026-09-21

The development Tunnel used the prepared native-CGO tunnel-client 0.0.14 and the private
installation bearer. After ChatGPT connector creation/Refresh, the host exposed all seven
tdev tools. The first read-only `workspace list` call was blocked by the host before reaching
tdev because the mixed-action tools were advertised with destructive/open-world annotations.
All seven public tools were then aligned to the then-used tmcp convention
(`readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=false`,
`openWorldHint=false`). Focused contract/HTTP checks passed and the then-current full suite
passed 57/57. After server restart and connector Refresh, live `workspace list` succeeded.

That successful authenticated discovery and subsequent calls prove the configured bearer was
forwarded to the local server: tdev authenticates before discovery/tool dispatch. The server
also rejects mismatched MCP protocol/method/name metadata before tool effects, so successful
ChatGPT calls exercised the required **MCP 2026-07-28** request metadata/header path rather
than a silent legacy downgrade.

A first disposable GitHub-ref acceptance then completed workspace open/read/edit and a real
native exec. The exec initially returned `running`; a same-turn process status read exposed
the terminal result, exit 0 and captured stdout. The first native validation did **not** pass:
the enrolled command rebuilt ignored dependencies with
`python -m pip install --target .tdev-deps ...` inside the fresh operation copy, exceeded the
native disk budget, and terminated with `DISK_LIMIT` / exit -9. A temporary external tooling
path proved the diagnosis: the same checkpoint then ran 57/57 tests, published exactly to
the disposable ref, replayed the same publish request without a second effect, and preserved
the same terminal validation/publication state after a controller restart.

The product repair is commit
`18303db9c280c8578c92896c0048610345db11e2`
(`Add operator tooling environment for native validation`). Repository config may now supply
a bounded, non-secret `toolingEnvironment`; reserved HOME/TMP/XDG/Git/SSH lookup variables
remain unavailable. The exact tooling environment is included in execution input and the
validation policy digest, so changing it invalidates prior validation for publication.
Local post-repair `scripts/check.sh` passed **58/58 tests in 95.285s**.

For the final live revalidation, the tdev repository used `sh scripts/check.sh` with
`PYTHONPATH` pointing to an operator-owned warm tooling directory outside the operation
source copy. The ChatGPT-driven disposable ref opened and edited normally; validation began
directly with unittest output, performed no `pip install`, and passed **58/58 tests in
98.198s**. Validation operation
`14e5549a0aa541a7ab1fc2f3240afed0` produced candidate
`2841dc7d8d83a9d7027e8d717c92d820c45d2c25`, which was published to the disposable ref
and same-request replay returned the identical publication without a second effect.
The disposable remote ref, temporary authorization and acceptance worktree were then
removed; canonical `refs/heads/tdev` remained at
`18303db9c280c8578c92896c0048610345db11e2` before this documentation closeout.

The live status stream advanced through increasing output cursors and reached
`running → terminal` in the same model turn. Earlier controller-restart acceptance also
read back the already-completed validation/publication instead of relaunching it. These are
direct observations of the progress-continuity and reconnect invariants on this path, not a
claim that every future timing race is impossible.

## Protocol and host acceptance boundary

The requested version is **MCP 2026-07-28**. Implemented per-request metadata/header
validation, server/discover, complete results, explicit cache metadata, and structured
unsupported-version errors. Core HTTP has no legacy initialize/session protocol or silent
downgrade. The official SDK pinned-version probe tests interoperability, while the historical
ChatGPT acceptance above confirms the tested host drove that then-advertised annotation
profile through Secure MCP Tunnel. It does not qualify subsequently corrected annotations.

Primary references:
[MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
[MCP HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover).
[OpenAI's server documentation](https://developers.openai.com/plugins/build/mcp-server) and
[Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
describe the product route used for the observed live acceptance.

Not executed: entering an intentionally wrong bearer in the ChatGPT host UI, alternate
account/session isolation (not claimed for shared credentials), optional remote OS
isolation/egress, or production cutover. Local wrong-bearer denial remains covered by the
HTTP/rehearsal evidence above. No separate Linux executor is needed for the default native
path. Production activation requires separate authorization.

## Independent canonical review and Local Codex qualification

Fresh starting local HEAD and remote `refs/heads/tdev` both resolved to
`989f580434c5ed865b84e84f84a835aa923b64c5`; the review range begins at
`99372b5b7988f0640e12c70943cdcac3a7abf40f`. Both heads were rechecked after resume.
Only `/data/data/com.termux/files/home/prj/tdev` was used for product development.
Existing `.artifacts/` and `node_modules/` were preserved. Authored bare repositories and
inactive bundles were disposable tests, not alternative product checkouts.

| Review area | Finding and disposition |
|---|---|
| Exactness/authority | Termux-native default, exact source/candidate, current authorization, durable replay and non-force publication survived the reviewed commits. No mandatory remote executor was reintroduced. |
| Tool annotations | `41f6018` marked arbitrary command/write/publish operations read-only and closed-world to pass host gating. Corrected conservative hints: only read is read-only; tests assert real semantics. Older successful host calls do not qualify these changed hints. |
| Warm tooling | `18303db` binds exact environment values to execution and validation policy, not external directory contents. Current warm path contained Python dependencies, not tdev source. Added candidate-module precedence, credential sentinel and source-change rejection tests; documented immutable/versioned dependency paths and owner trust. Old pre-policy-format validations fail closed at publication, rather than gaining authority. |
| Progress/reconnect | `0025f62`/`66006a8` added requirements but no bounded frontier; replay could return an old running result. Added reconciliation on same-request replay, bounded inspect/pages/closed-resource discovery and freshness cursors. Logs expose retained available bytes even beyond the returned page. No new table/planner. |
| Historical live evidence | Read-only inspection of retained validation `14e5549a0aa541a7ab1fc2f3240afed0` confirmed success, exit 0, stopped proof and candidate `2841dc7d8d83a9d7027e8d717c92d820c45d2c25`; publication `f4f021990f754bc698742f115e5dc4ba` matched it. Retained output includes 58 tests/98.198s/OK. No retirement records were present and execution copies remained; prior cleanup wording did not prove full resource retirement. No historical runtime data was deleted. |
| Tunnel operations | Existing native Tunnel and controller processes remained alive; localhost health returned up. Managed runtime alias listing was empty, consistent with the foreground runtime not being an alias. Ephemeral health port had no URL file, so guessed-port results were not used as health evidence. New inactive service templates persist the health URL; existing services were not restarted. |

The earlier acceptance date headings are retained as reported evidence labels, not a claim
of a new ChatGPT run during this review. No previously completed ChatGPT coding acceptance
was repeated. Source-integrity/credential claims remain the owner-trusted same-UID model,
not hostile-code isolation or immutable dependency attestation.

### Installed Local Codex and extension evidence

Installed `codex-cli 0.155.1` sent legacy initialize against the HTTP endpoint; the direct
probe failed with missing required request headers (`-32020`). The correction is an explicitly
selected `tdev.codex_bridge` stdio compatibility edge, not a core downgrade. Core requests
remain 2026-07-28. Adapter initialization reports 2025-11-25 and forwards the same schemas,
annotations, arguments and durable identity, once; current auth remains at the controller.
An additional disposable loopback capture, without the adapter, recorded the actual client
proposal as `initialize` with `protocolVersion: 2025-06-18`. Thus 2025-11-25 is the adapter's
accepted response/negotiated revision, not the client's original proposed date. The capture
logged only method/version, no credentials, and made no calls to the development runtime.

The prepared native tunnel-client 0.0.14 installed its bundled Tunnel MCP plugin (0.1.4) into
the initially active `jgnh` Codex profile. On resume the active profile was `janmori101`;
installation was repeated specifically there, preserving unrelated configuration. Fresh
Codex app-server discovery then found the plugin and its read-only `list_runtime_aliases`
call succeeded. No Tunnel runtime was created, stopped or replaced by the plugin.

`scripts/check_codex.py` launches the installed Codex app-server with an ephemeral test MCP
configuration and thread, without model inference or permanent tdev MCP registration.
Actual MCP discovery/list/call exercised all seven tools on a synthetic bare Git ref:
open/read/edit → native exec → client exit/restart → same-request replay → sequenced stdin
and replay → validate → exact local publication → execution retirement → closed-workspace
inspection. The synthetic ref/state disappear with the test directory. These are installed
client facts, not a ChatGPT model turn, GitHub acceptance, or Local Codex through Tunnel.

The authored external CLI fixture consumed JSON stdin, produced a captured artifact, exited
7 despite forged PASS/admin/validation stdout, and could not be used as a validation receipt.
Owner-mandated validation remained mandatory and retirement remained available. This closes
the selected command-first extension path without a gateway. Remote/device/API adapters are
not selected or qualified; they are not prerequisites for native use.

### Checks for this review

| Command | Observed result |
|---|---|
| Baseline `sh scripts/check.sh` at `989f580` | 58 tests, OK, 54.998s |
| Review `sh scripts/check.sh` | 64 tests, OK, 109.940s; final post-documentation rerun 64 tests, OK, 121.885s; diff whitespace checks passed |
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_adapter test_admin test_bridge test_progress test_contract test_native -v` | 21 tests, OK, 45.967s |
| `PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py` | Official SDK 2.0.0, protocol 2026-07-28, seven tools and structured call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/check_codex.py` | Installed client seven-tool native path, client restart/replay, exact local publication, retirement passed; installed Tunnel plugin discovered/read-only call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` | Inactive bundle `29a01f536a86fe06b9827d81b9a3edbf1540c11a404ff41c8bf4a68bb57a2736`; real native SIGKILL/recovery/publication; two HTTP starts each denied wrong bearer (401) and exposed seven authenticated tools; no production services touched |

Schema-edit failures during development were genuine failures (misplaced JSON fields),
localized and repaired before successful fixture/schema reruns; no invariant/test was removed.
Canonical UTF-8 `x-tools` advertisement (expanded schemas, descriptions and annotations) grew
from 25,271 bytes at `989f580` to 37,069 bytes. This is a real context cost for the inspect
frontier/freshness contract; tool count remains seven and no handshake was added to core HTTP.
The explicit legacy adapter adds one upstream discover during its own initialize and one
upstream request per tool request. No comparative latency/throughput speedup is claimed.

Remaining acceptance is targeted, not a new design/governance gate: deploy the reviewed
changes only to an authorized development runtime, Refresh the ChatGPT connector and check
truthful mixed/write annotations with the host's supported approvals. If blocked, record the
actual host behaviour instead of restoring false hints. Persistent Local Codex registration
requires selecting the intended instance/private bearer; the disposable client path already
passes. Interactive model behaviour, Codex-through-Tunnel, wrong-secret host UI, optional
remote isolation and production cutover were not executed. Shared credentials still do not
promise account/session isolation.

### Approved development controller restart

After explicit user approval, source HEAD `00edb5fe88f1737a0d36c9a65fc50da0793b180d`
was loaded by restarting only the identified development controller. Preflight found no
running/unknown operations and no busy workspace; SQLite quick_check returned ok.
PID/start identity and repository cwd/argv were checked before SIGINT. An owner-private
SQLite online backup and startup log were retained under
`/data/data/com.termux/files/home/.local/share/tdev/controller-restart-wmfxyqfg/`.
New detached controller PID 13295 replaced PID 19587 on the same localhost port 8765,
state and config. Native Tunnel PID 26918/start identity was unchanged; no service manager
activation, credential/grant change, remote publication or native execution was performed.

Post-restart local checks: health up; authenticated MCP 2026-07-28 tools/list exactly equals
the current expanded contract (seven tools, only read marked read-only); wrong bearer 401;
workspace list succeeds, includes nextAfter and reads canonical head `00edb5f`.
All ten operation rows and both workspace rows were unchanged across restart; config digest
was unchanged. These are localhost deployment checks, not refreshed ChatGPT acceptance.
Documentation/contract checks passed (3 tests, 0.610s); `sh scripts/check.sh` passed all
64 tests in 56.576s after this follow-up, with no source/contract implementation changes.
Next human action: Refresh the existing ChatGPT connection, then use a new conversation to
verify changed discovery/approval behaviour. The prior complete coding path need not be
repeated solely because controller memory was refreshed.


## Delegated projects and managed branch lifecycle — 2026-09-21

Implemented `tdev_project` list/inspect/connect/create for ordinary local Git folders and
GitHub repositories, operator-delegated root/owner policies, automatic workspace start,
publication by absence CAS, cleanup of owned exact-OID refs after close, and continuation
from retained publication. Existing user dirty/untracked state and canonical refs are preserved.
SQLite schema 2 migrates existing rows and adds project enrollment; bundle compatibility is
bound to hashed config-schema metadata and incompatible rollback is rejected.

Executed checks:

- Focused project/HTTP/admin/contract/adapter/bridge suite: 28 tests, OK (66.499s).
- Additional provider late-failure and schema migration coverage; focused project/admin suite:
  18 tests, OK (46.909s); subsequent admin/migration/contract checks: 7 tests, OK (3.490s).
- `sh scripts/check.sh`: 81 tests, OK (179.135s); final rerun after client-script/documentation
  updates: 81 tests, OK (156.375s), including diff whitespace check.
- Official SDK probe: @modelcontextprotocol/client 2.0.0, protocol 2026-07-28, eight tools,
  structured call success.
- Installed Local Codex probe: eight tools, native coding path, reconnect replay, exact local
  publication and cleanup success through the explicit stdio adapter.
- Inactive packaged rehearsal: bundle
  `1f697463c66fe3a687e6f1a5f3bbacb8d49dfa40d68355ae1472308ad309a559`,
  native SIGKILL recovery/exact publication, eight tools before/after restart and wrong bearer
  401. No production service activation.

Within the user's request to implement and enable project management, the existing development
controller at localhost:8765 was restarted (PID 14108 → 9803) with the same state, bearer and
provider credentials. Private config and SQLite backups, migration-copy check and activation
receipts are retained under
`/data/data/com.termux/files/home/.local/share/tdev/project-upgrade-wx0tqehv/`.
Nine workspace rows and 45 operation rows were preserved during activation. Delegation now
covers `~/prj` through `local-projects` and GitHub owner `humtr` through `github-projects`;
both permit create/connect and use adopted validation `sh scripts/check.sh`. Existing `tdev`
is the default project/base `refs/heads/tdev` with managed namespace `refs/heads/tdev-work/`.
No credential text was logged. Local GitHub readback confirmed the existing credential has
push/admin access to humtr/tdev; this does not prove creation permissions on other owners.

Real GitHub lifecycle acceptance through authenticated localhost HTTP:

- Workspace `dfb983f12a5442d6a2ecf36d0ff47e95`, generated ref
  `refs/heads/tdev-work/project-acceptance-dfb983f12a5442d6a2ecf36d0ff47e95`.
- Started from canonical `e7124860dfb6e014b4943ee0614a350987393a47` without manually supplied
  repo/ref/head; only `tdev-managed-project-probe.txt` was added.
- Validation `81b07c751ae64e91a2510afc6a3a4010` ran that remote candidate's existing **64-test**
  suite, exit 0 (119.235s). This is separate from the local changed-source 81-test suite.
- Published exact frozen commit `a21e057ad39e7fbf9ba4700e7b4577d57c9661b5`; Git readback
  matched exact commit and probe-only diff.
- Managed cleanup deleted the branch, repeat cleanup and publication replay returned the
  original results, workspace is closed, validation execution copy was retired.
- Canonical HEAD remains `e7124860dfb6e014b4943ee0614a350987393a47`.

The previously stranded `refs/heads/tdev-host-acceptance-20260921` was independently checked
against expected OID `0f8492c849d3416f0b25001ebfc635a2a6b63ffe`, sole parent e7124860 and only
`tdev-host-acceptance-probe.txt`. It was deleted with advertised-old-OID Git CAS; its temporary
exact-ref grant was removed. It was not retroactively adopted as a managed workspace.
Post-run checks found zero running/unknown operations, zero busy workspaces and HTTP health 200.

Limits: GitHub repository creation uses provider fixtures and has not created a real repository;
new-project local creation/native validation/publication/cleanup ran over actual HTTP in disposable
fixtures. These localhost/SDK results do not claim refreshed ChatGPT host discovery. Optional
remote/OCI isolation and production cutover were not performed. Source changes remain uncommitted.

## Workspace composition and source-task separation — 2026-09-21

This qualification supersedes the earlier source-workspace/process contract for the current
working source. Historical evidence above retains the names and state formats actually tested.
`tdev_workspace` now manages project composition; `tdev_task` manages one project's source
state; `tdev_operation` observes every operation and controls execution processes when applicable.
The executable patch revision was changed only in `src/tdev/__init__.py`, under README policy.
Internal state schema 3 uses fresh state; old experimental state is rejected without migration
or deletion. No existing development controller restart or production activation was performed.

Executed checks:

- Source core checks: 7 tests, OK (16.998s).
- Contract checks: 3 tests, OK (2.656s).
- Project lifecycle checks after the rename: 14 tests, OK (35.408s).
- HTTP checks including real native local project → workspace → task → edit → validation →
  publication → cleanup/retirement → workspace close: 6 tests, OK (17.310s).
- New composition checks, final focused run: 8 tests, OK (19.802s). They cover repository-free
  spaces; durable replay across restart; operation status for non-process effects; two projects
  with independent exact publications; reuse of one project in another space; default-space
  concurrent creation; revision races; cross-principal denial; revoked/replaced membership;
  pending source admission blocking close/detach; bounded pending-operation visibility;
  same-turn completion/no-change observation; and owned cleanup after workspace close.
- The old-state test opens an actual old-shaped SQLite fixture twice, verifies rejection and
  released lock, and checks that its table/data/revision remain unchanged. The prior automatic
  schema migration test was removed because that compatibility is no longer offered.
- `sh scripts/check.sh`: **88 tests, OK (166.078s), exit 0**, including `git diff --check`.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client 2.0.0, pinned protocol
  2026-07-28, nine tools, source-task and workspace structured calls passed.
- `scripts/check_codex.py`: installed Codex app-server through explicit stdio → local HTTP;
  nine tools, workspace creation/inspection/close, native coding, client reconnect/replay,
  exact local publication and resource retirement passed. This profile reported no Tunnel
  plugin installed; it was not installed as part of qualification.
- `scripts/rehearse.py`: inactive bundle
  `06a3e9198b9d48bcfa1efac639c5ab24e82f7fb9eada15fe75611e4e9087d71a`;
  real native controller SIGKILL/restart and exact publication passed, nine tools on both
  starts, wrong bearer 401. No production services touched.
- `scripts/measure.py`: three authored default-native trials completed exact publication in
  3.202s / 2.763s / 3.103s, with one validation and executor start each. Calls were 33/29/30,
  including 28/24/25 status polls: five semantic calls each, no explicit workspace setup call.
  Expanded advertised tool schemas measured 111087 bytes. The script uses aggressive local
  polling; these timings ran alongside other checks and are not a matched speed comparison,
  host/Tunnel/provider latency result or an end-to-end productivity claim.

An HTTP header test initially retained the base64 encoding of the old source-tool name and
correctly received a mismatch rejection; its encoded fixture was updated to the renamed tool.
New composition tests were corrected to account for the existing rule that successful
publication closes the source task (closed tasks require includeClosed in listings). Neither
HTTP admission checks nor publication terminalization was weakened to make tests pass.

Remaining: qualification in a newly prepared actual development installation and refreshed
ChatGPT discovery; the rest of the Git/local development loop and actual resident deployment
remain separate implementation milestones. Multi-project publication is independently proved
per repository, not an atomic cross-repository transaction. No Blender/device/model integration
or production deployment is claimed by this qualification.

## Local checkout import and task integration — 2026-09-21

The current source adds explicit local checkout import, same-repository task delta integration
and bounded source comparisons. The executable patch revision changed only in
`src/tdev/__init__.py`; the product remains within the authorized 0.1 line. No state format
change, existing controller restart, canonical publication or production activation was made.

Executed checks for this source revision:

- `test_source`: 12 tests, OK (18.485s) before the final UTF-8 pagination and older-source
  checkpoint assertions. The final affected run below includes those assertions.
- `test_source test_http test_projects test_contract`: **35 tests, OK (46.212s)**. Local import
  preserves original index bytes, files and refs across validation/publication, captures final
  staged-plus-unstaged working bytes, omits ignored untracked files, preserves executable bits
  and safe links, and does not execute a configured clean filter. Changes between scans,
  unsafe links, tracked FIFOs, sparse/unmerged indexes, moved identities and switched HEAD are
  rejected without admitting a partial task. Linked worktrees use their own branch and cannot
  silently rebind an existing project.
- Integration fixtures exercise independent edits within one text file, explicit content and
  side selection, binary/delete-modify/file-directory conflicts, unchanged target on conflict,
  frozen source replay after restart, newer-base targets, stale target/source rejection,
  same-repository admission, private utility failure without a stuck writer, and rejection of
  validation from before integration. Diff pagination reconstructs UTF-8 bytes losslessly.
- The HTTP project lifecycle fixture now imports actual local edits, integrates a second task,
  reads a patch, validates natively, publishes the exact candidate, cleans the branch/retires
  the process and closes the composition space.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client 2.0.0, pinned 2026-07-28,
  nine-tool discovery and task/workspace structured calls passed.
- `sh scripts/check.sh`: **100 tests, OK (124.709s), exit 0**, including `git diff --check`.
- `scripts/rehearse.py`: inactive bundle
  `a699dd8d8a47cebae439fbe8f9f7a78eab89564f2328d9450aa95144d1d5c696`;
  packaged native controller SIGKILL/restart and exact publication passed, nine tools on both
  starts, wrong bearer 401. This exercises packaging/recovery; the new import/integration
  journey is qualified by the focused HTTP fixture, not by this rehearsal.

These are local fixtures and an inactive installation. They do not qualify live ChatGPT tool
refresh, persistent development environments, checkout writeback, complete Git merge-parent
history or resident deployment. Integration keeps a single target parent and an operation
receipt for the selected source delta. Existing deployment and extension milestones remain.

## Development connection refresh repair — 2026-09-21

The reported stale tool list was reproduced directly against localhost:8765: the old running
controller advertised eight tools, including tdev_process, while working source advertised
nine including tdev_task/tdev_operation. Its health version was 0.1.0 and state schema was 2.
Refresh could not load implementation changes into that process. During repair the user
stopped the manual Tunnel; the old controller itself remained alive.

Prepared the already tested bundle
`a699dd8d8a47cebae439fbe8f9f7a78eab89564f2328d9450aa95144d1d5c696` under
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8/`.
Its config preserves existing bearer hashes, exact grants and local/GitHub delegation.
Schema-3 state is separate; the old schema-2 directory remains intact, with a SQLite backup
in previous-state.sqlite. The existing delegated humtr/ai project was reconnected through
the project API with the same repository identity and ID. Historical source tasks/operations
were not migrated into the new state. Preflight found 14 closed old source workspaces and
77 terminal operations, with no open source workspace or running/unknown operation.

The candidate was first started at localhost:8766. Authenticated HTTP advertised all nine
tools, and workspace create → default task start → native command (exit 0) → task close →
process retirement → workspace close passed. This smoke fetched existing source and did not
publish a remote ref. Original credentials were accepted without exposing them in output.

After qualification, the old controller PID 9803 and temporary candidate were stopped.
Controller PID 13651 now runs the packaged source/state/config on the original port 8765;
health reports 0.1.2. The existing remote Tunnel identity is retained, with native managed
runtime alias tdev-development and profile tdev-managed forwarding to localhost:8765/mcp.
The HTTP attachment uses native runtimes connect because the plugin connect tool accepts
stdio only; plugin list/status/stop were used where available. No remote tunnel was created
or deleted, no production runit service was installed, and canonical source was not published.
Private preparation/activation receipts are retained in the new installation root.

Final authenticated discovery on port 8765 returned HTTP 200 and the nine expected tools.
Native runtime status proved process_running/healthy/ready. Its admin-UI poll summary was
unknown, so `tunnel-client health --url-file ... --require-control-plane-poll --json` was
checked separately: healthz/readyz were 200 and a successful control-plane poll was recorded,
exit 0. The initial unauthenticated legacy initialize probe remains 401 as expected; it is
not a failed authenticated modern MCP request. `git diff --check` passed after documentation
updates. No source implementation changed during this connection repair.

Remaining host acceptance: Refresh the existing ChatGPT connection, verify tdev_task and
tdev_operation (and the new tdev_workspace composition actions), then test in a new conversation.
Local authenticated discovery/native execution and Tunnel health are separate from that host
acceptance. Old foreground server/Tunnel commands must not be restarted alongside this runtime.


## Resident service installation — 2026-09-21

The user explicitly requested Termux service registration, automatic `bash install.sh`, and
retirement of the previous implementation occupying the service names. The implementation now
uses owned runit services `tdev` and `tdev-tunnel`; the executable patch revision remains in
the authorized 0.1 line and is defined only in src/tdev/__init__.py.

Qualification performed:

- Initial focused resident/admin/HTTP tests: 19 tests, OK (14.359s); repeated after profile
  identity hardening: 19 tests, OK (25.895s).
- Initial full suite: 110 tests, OK (151.846s). A second full check after profile identity
  changes: 110 tests, OK (143.758s). These precede the final additional regression tests.
- Final focused resident tests: 12 tests, OK (4.618s), including installation ownership,
  first-registration rollback, interrupted partial update, readiness rollback, explicit old
  service retirement, incompatible pre-resident rollback rejection, concurrent foreign service
  preservation, installer locking, credential reference handling, executable/profile checks,
  maintenance admission fencing and outstanding-effect preservation.
- `scripts/rehearse_services.py` uses actual runsv/runsvdir and a private copy of the installed
  termux-services recovery script with a separate PREFIX/SVDIR. Installation/reinstallation,
  server and fixture-tunnel SIGKILL recovery, root SIGKILL/monitor recovery, persistent DOWN
  and uninstall/data retention passed. No shared live graph was killed. Tunnel provider health
  is a fixture in this test and is qualified separately on the actual installation.
- `bash install.sh --takeover --retire-legacy tdev:<verified-run-digest>` completed against the
  existing private schema-3 installation, followed by a no-argument `bash install.sh` and
  `bash install.sh --check`. Both services were UP, controller bundle/arguments matched,
  native-cgo tunnel identity matched and control-plane polling succeeded.
- Real scoped process recovery: controller PID 24402 was killed and recovered as PID 7011;
  tunnel PID 24568 was killed and recovered as PID 7166, with final live checks passing.
  Recovery evidence is retained in resident-acceptance.json under the installation root.

Installation root remains
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8/`.
Existing config/state/project enrollments and authentication were retained. The live service
markers bind installation `5319069b4e6a4fe2bd5b0d43c553cc78` and launcher hashes. The former
manual controller and managed Tunnel alias tdev-development were stopped. The same remote
Tunnel identity now runs directly under the tdev-tunnel runsv service. No second tmux runtime
or live tdev-oai-tunnel alias is used.

The legacy Node tdev service, its release-control-tdev-epoch3 helper, and the two already-DOWN
historical tdev-agent registrations were verified by their executable paths and removed from
the live service graph. Their directories/receipts remain under retired-services outside that
graph. User projects, historical private state, other Termux services and canonical Git refs
were not removed or published. Shared termux-services and its monitor were reused, not replaced.

The controller advertises the same nine public tools. Service administration remains local to
the operator installer; no installer/config/credential-management MCP authority was added.
This qualifies resident operation of tdev, not persistent authored development environments,
arbitrary project deployment, Android reboot startup or host acceptance of every tool.

Final installed bundle:
`87412906077b744eeb9f7549ad401bee997acc35692d3a26941d3bbd2d11d35c`.
No-argument install completed with controller PID 18946 and native-cgo Tunnel PID 19011;
subsequent `--check` passed with controlPlanePoll=true. Authenticated HTTP on port 8765
returned 200 and exactly the expected nine tools. The isolated real-runit rehearsal was
repeated against the final source and passed all listed lifecycle/recovery checks.

Final `sh scripts/check.sh`: **112 tests, OK (144.297s), exit 0**, including whitespace
verification, against the final service ownership/rollback implementation. `bash -n install.sh`
and post-documentation `git diff --check` also passed. No canonical push was performed.

## Persistent environments and processes — 2026-09-21

- Product remains on the user-authorized 0.1 line; executable revision is 0.1.4 from
  src/tdev/__init__.py. Nine tools remain; exec adds mode/environment, validation adds
  environment, task adds resetEnvironment and inspection of outstanding snapshot processes.
- Focused `test_environments test_native test_contract`: **25 tests PASS**, 35.506s, exit 0.
- `sh scripts/check.sh`: **123 tests PASS**, 151.429s, exit 0, including git diff --check.
- New native checks cover actual venv dependency reuse across controller restart and operation
  retirement; fresh/private environments and different tasks; exact validation source checks;
  a real loopback HTTP server serving its old checkpoint during edits and validation; stdin,
  cancellation, close/retire and another writer's ownership; lost dispatch replay/deadline;
  bounded process admission and remote feature rejection; reset stop requirements, symlink
  rejection, lost response and crash after rename; sampled persistent disk budget.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client@2.0.0, pinned 2026-07-28,
  nine tools, new input schemas advertised and calls PASS, exit 0.
- `scripts/check_codex.py`: installed Codex through explicit stdio adapter → local modern
  HTTP, discovery/native coding/reconnect/exact local publication/composition/cleanup PASS,
  exit 0. This fixture made no production changes.
- Persistent dependencies are task-scoped, mutable and explicitly resettable; source and HOME
  remain per-operation. Process mode is fixed-snapshot development execution, not hot reload,
  PTY debugging, resident deployment or a new OS isolation boundary. Cross-task dependency
  sharing and authored-project deployment remain later work.
- Authorized `bash install.sh` updated the existing owned installation, exit 0. Active bundle:
  `75730adcd31762a2672958a3f0e7659ebcd22432012541c5e9144990b2bfa7cb`.
  Controller reported 0.1.4, PID 15907; native-CGO tunnel PID 15918, controlPlanePoll=true,
  recoveryMonitor=true. Existing root, configuration, state and Tunnel identity were reused.
- Live authenticated HTTP MCP acceptance on the installed controller: nine-tool discovery with
  process/environment schemas; managed task start; dependency marker reuse across commands;
  process with no deadline; edit and command while it remained running; snapshot identity and
  bounded task frontier PASS. Task `f3375fcce55c4b53892f1f6548924edd`, process operation
  `0d155254709c40858a0c1ab415434415`. All three execution operations were stopped/retired,
  task closed, environment reset and absent owned-ref cleanup completed. No source publication
  was performed. This is installed loopback MCP acceptance plus Tunnel control-plane health,
  not a claim of a new ChatGPT-host invocation.
- The first temporary live probe omitted the required Accept header and received no JSON
  response before any task admission. Correcting that probe header completed the acceptance;
  credentials and product code needed no repair.
- Final `bash install.sh --check` PASS, exit 0: both owned services UP with the same
  bundle identity and successful control-plane polling. Outstanding running/unknown operations:
  zero; probe dependency directory and maintenance fence absent. Local canonical source HEAD
  remains `e7124860dfb6e014b4943ee0614a350987393a47`; changes remain uncommitted/unpublished.

## Native project deployment — 2026-09-21

- The user explicitly authorized source commit/push and continuation into deployment. The
  accumulated 0.1.4 work was committed as `1f3edb690ab93db3f5e22b34cf2b453353c118e3` and
  pushed without force to origin refs/heads/tdev. Remote readback matched that exact commit.
- The next executable revision is 0.1.5, still inside the authorized 0.1 line. tdev_deploy adds
  the tenth tool: delegated native Termux source-release deploy/inspect/log/start/stop/update/
  rollback/remove. Artifact/dependency packaging and other runtime adapters are not claimed.
- Initial deployment/contract/HTTP/admin focused run: 26 tests PASS, 60.375s, exit 0.
- Official MCP SDK probe PASS on 2026-07-28 with ten tools. Installed Codex adapter probe PASS
  for ten-tool discovery and existing native coding/reconnect/publication/composition/cleanup.
  Its installed Tunnel plugin was discovered and only its read-only runtime list was called.
- Real isolated runit rehearsal passed validated release and HTTP release-header identity,
  supervisor crash recovery, controller reconnect, update/rollback, deliberate DOWN across
  shared-root recovery, readiness failure restoration and data-preserving removal. No live
  shared-service graph was touched by that rehearsal. Initial runs exposed transient supervisor
  control timeouts and an early PID-file read during root recovery. The rehearsal now waits
  for a new healthy graph and, when recovery remains unknown, observes the original operation
  to finish restoration instead of reissuing the release. Unproved recovery is never success.
- An initial full 137-test run failed only the CLI adapter's obsolete nine-tool assertion.
  It was updated for ten tools, and its focused test passed (5.135s). Further cleanup tests
  verify that changed source cannot start but does not prevent stopping/removing owned services.
- Final focused deployment/contract/admin/adapter run: **23 tests PASS**, 27.379s, exit 0.
  The final isolated runit rehearsal again reported every acceptance dimension above as true.
  A subsequent full-check attempt was interrupted before a terminal test summary; it is not
  counted as a pass and was rerun after resuming the session.
- Resumed full run: 139 tests in 355.691s, one failure in the existing unrelated-operation
  concurrency test. Its first status read assumed `true` had already exited. The fixture now
  waits for terminal executor receipts without reconciling the controller, then still proves
  the second reconciliation completes while the first is blocked. Focused test PASS, 3.723s.
- Final `sh scripts/check.sh`: **139 tests PASS**, 411.615s, exit 0, including diff whitespace
  validation. No runtime code was changed to make the concurrency fixture pass.
- Authorized `bash install.sh` updated the owned resident installation, exit 0, to bundle
  `c375fa9707d83ff9c210c1eb07442b71a7b5266a47a5ff77193f6eec98378102`.
  Controller 0.1.5 PID 16551 and native-CGO tunnel PID 16565 were UP; controlPlanePoll=true
  and recoveryMonitor=true. Existing configuration, state and Tunnel identity were retained.
  The operator CLI delegated target `termux` with the `tdev-app-` prefix to existing principal
  `owner`; it starts no service and changes no project/provider credential grants.
- First installed acceptance reached the inherited fixed 300-second validation deadline
  before the full tdev suite completed. It correctly failed with timedOut=true/stopped=true;
  no deployment was admitted. Validation was retired, task closed, environment reset and
  absent owned ref cleaned. Outstanding operations returned to zero.
  `tdev_validate` now accepts the same bounded timeout range as command execution (1–3600s,
  default 300); existing launch machinery already binds it into the immutable execution intent.
  Adopted validation command/source checks are unchanged. Explicit timeout/failed validation
  plus contract checks: **4 tests PASS**, 7.315s, exit 0.
- Deadline contract was installed through the same owned update path, exit 0; active bundle
  `56d6c26b4672bd5f6054256d60f115c7a551760afa0997fe7be1fbfbb7b1797f`.
  Controller 0.1.5 PID 7454 and native-CGO tunnel PID 7703 were UP with controlPlanePoll=true
  and recoveryMonitor=true. Final official MCP SDK probe again passed ten-tool discovery/call.
- Final `sh scripts/check.sh` including the deadline contract: **140 tests PASS**, 402.384s,
  exit 0. This supersedes the earlier 139-test qualification for the final source tree.
- The next installed validation completed the old 123-test suite in 334.613s without a
  timeout, but failed its aggregate-environment-budget fixture: one sparse 2GiB file exceeded
  the outer native runner's 128MiB per-file limit. No release was admitted; task/environment/
  validation cleanup completed. The fixture now uses sixteen sparse 128MiB files plus one
  byte, preserving the real 2GiB aggregate-limit check. Focused test PASS, 3.096s, exit 0.
  Final installed acceptance imports the complete current implementation diff before running
  the adopted `sh scripts/check.sh`, rather than validating the older published implementation.
- An intermediate nested run correctly stopped with DISK_LIMIT because the budget fixture
  also exceeded its outer operation's aggregate allowance. The fixture executor now uses an
  independent, automatically cleaned host temporary spool, while retaining native per-file
  and aggregate checks. Product resource limits were not relaxed. The affected environment
  suite passed **11 tests**, 48.743s; stopped validation/task/environment cleanup completed.
- Final installed authenticated MCP acceptance, exit 0: imported the complete current
  runtime/contract/test diff and a disposable HTTP app, then ran the adopted `sh scripts/check.sh`
  with timeout=1200. **140 tests PASS**, 306.231s, plus app compilation and diff checks;
  validation `a597e42b4e0e40afb2373b740291e9ba` exited 0 for exact candidate
  `773403428b4752962390bc8f3d7ef900f0959239`.
  Deployment `005c4ca6cab54dbf354e30e58e908227` released
  `7806cfc2cfcadf12f22e169c187951b08f335d84e2338a254424ef55deddd3f3`.
  Actual HTTP release-header/body identity, stop, restart, renewed readiness and removal passed.
  Final deployment revision is 4/removed; its service directory is absent. Validation retired,
  task closed, dependency storage reset and absent owned-ref cleanup completed. Releases, logs,
  data and operation receipts remain intentionally retained. No probe source was published.
- Final `bash install.sh --check` PASS, exit 0: 0.1.5 controller and native-CGO tunnel UP,
  controlPlanePoll=true. The active bundle's full file digest equals the current repository
  runtime/contract/dependency bundle. Outstanding running/unknown operations: zero; maintenance
  fence absent. This is installed loopback MCP acceptance and Tunnel health, not a claim of
  a new invocation from the ChatGPT host.

## Continuity and Android feasibility review — 2026-09-22

Investigation and documentation only. No product code, wire schema, installed runtime, provider,
credentials or device permissions changed. This section records evidence and design reasoning;
selected semantics belong in ARCHITECTURE, execution order in IMPLEMENTATION_PLAN. The user
explicitly requested documentation updates in addition to reviewing the supplied hypotheses.

### Current authoritative state and actual gaps

Fresh local branch `tdev`, HEAD and remote `refs/heads/tdev` readback both
`758ef37eaa164370d94486b247f1bd8bdbd1cb62` in `humtr/tdev`. Entry WIP was the previously
requested packaging plan in IMPLEMENTATION_PLAN.md; untracked `.artifacts/` and `node_modules/`
were preserved. AGENTS/README navigation, relevant ARCHITECTURE and plan, tool schemas,
server ingress and workspace/task/operation/deployment implementations were reread. The
canonical source implements ten tools; no note/artifact/resource tool is currently advertised.

| Capability | Finding in current source |
|---|---|
| Workspace/project/task/checkpoint | Implemented in `store.py`, `workspaces.py`, `core.py` and Git; workspace membership/defaults and isolated source tasks are durable. |
| Intent/result/effect certainty | Implemented operation IDs, request replay, retained intent/result and unknown-effect handling; `operation` observation/control is independent of transport reconnect. |
| Validation/publication/deployment | Implemented exact source validation/publication and native HTTP-service deployment/recovery. Dependency/build packages remain planned. |
| Processes/dependencies/cleanup | Implemented supervisor identities, outstanding process discovery, task environment reuse and cleanup after close. A retained environment is mutable, not an attested dependency artifact. |
| Current external state | Partial bounded observations; provider errors/uncertainty are explicit. Workspace inspect is not a complete atomic view of every deployment/process/provider. |
| Semantic meaning | Project purpose/design/plan survive in repository documents. Public/store state has no general current objective, objective-change history, decision rationale, blocker or cross-conversation capsule. |
| Host/resource access without a task | Workspace/deployment listing is source-free, but arbitrary native filesystem/process/toolchain inspection has no source-free public adapter. Native exec already has app-UID power but requires source-task context. |

`server.py` requires protocol/capability `_meta`, verifies matching HTTP method/name/version
headers, and authenticates a Bearer principal. Extra metadata can be present, but tools dispatch
passes only principal, name and arguments to `controller.call`; `openai/subject` and
`openai/session` are not preserved. Request logging is suppressed. No current request metadata
capture proves those fields are present or absent in today's ChatGPT requests. Transport
`MCP-Session-Id` is not a semantic identity owner in this implementation.

`store.py` has workspace, workspace_project, task, operation, project and deployment tables,
not semantic history. Task inspect reconciles busy work/processes and reads remote state;
deployment inspect can restore an interrupted release. Therefore calling all existing inspect
actions is not a safe substitute for a strictly observational resume envelope. This review
read source rather than invoking those recovery-bearing production paths.

The plan's fresh-session requirement is implemented for bounded material task recovery, not
for reconstructing lost intentions or a whole multi-project objective. The review corrects the
plan's overbroad one-frontier wording; it does not infer a new planner from “next admissible
action.” Exact problem: a fresh model can discover what happened but often must ask/research
again to learn why, which objective is current and which next work is useful.

### Local Codex: observed persistence and public implementation

Installed `codex-cli 0.155.1`, native Android arm64 executable; selected profile
`.codex-profiles/wrlab`. Read-only SQLite connections used `mode=ro` plus `query_only`; output
was limited to schema, counts and JSON key/type/array-size metadata. No auth files, token/key
values, prompt text or raw tool output were printed. No Codex resume/compaction was triggered.

- `thread_history_1.sqlite` contained 91 `contextCompaction` items at observation. Recent item
  objects had `type` and `id`; this UI/history item alone is not the compaction payload.
- Projection state tracks rollout byte offsets/ordinals. This supports treating this DB as a
  history projection/index, not assuming it is the sole resume authority.
- Two recent tdev rollout files were inspected by event shape. One contained five `compacted`
  events; the other none. Recent compacted records included `replacement_history`,
  `guardian_history`, `retained_context`, window identities/number, compaction response identity
  and latest token-usage metadata. Replacement-history lengths were 33, 40 and 44 items in
  the three sampled checkpoints; raw history still existed in the rollout. These are observed
  structures, not an attempt to decode private model reasoning or encrypted content.

The matching public version tag's [compaction code](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/compact.rs)
builds a replacement model history from bounded user messages and a summary and installs
persisted compaction metadata. This is model-context compaction, not SQLite VACUUM or deletion
of all original history. Its [rollout reconstruction](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/session/rollout_reconstruction.rs)
selects a surviving replacement-history checkpoint and replays its suffix, accounting for
rolled-back segments. The [context manager](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/context_manager/history.rs)
separates working history and retained context/review history and tracks history revisions.
These are version-tag source observations, not proof that the installed executable has an
identical build hash or that every session uses the same compaction path.

Conclusion: worktree/Git is source truth; rollout plus installed compact checkpoints and
subsequent events reconstruct model history; DBs support durable session/history discovery
and indexing; current tools/OS/providers still determine current effects. Neither Git alone,
a `contextCompaction` DB row alone nor a summary alone recreates complete continuity. Reusable
principles are bounded working context separate from retained evidence, atomic revision-bound
replacement and suffix preservation. Codex's private formats/guardian/window internals are not
requirements for tdev. MCP cannot own the host's turn scheduler, full transcript, compaction
trigger or next model input in the way the Codex client does.

### tmcp: evidence, not reference architecture

Local tmcp HEAD `ce3f2a78c98853fba06e4ec1a3b21955283ca4b9` was read without modification or
live probes. Its current `docs/REFACTORING_EXECUTION.md`, relevant plan and `src/mcp.ts` are
historical evidence, not tdev authority. `sharedIdentityDigest` reads bounded subject/session
metadata and hashes the pair; deterministic `tests/shared-mcp.test.ts` supply fabricated values.

| Evidence class | What the records establish | What they do not establish |
|---|---|---|
| Recorded direct ChatGPT call | T-OTP-4 ledger explicitly records a real ChatGPT caller unable to complete elicitation; no grant was created. | Successful post-repair conversation reuse, or today's tdev metadata values. |
| Scripted live public/local probes | T-OTP-6 ledger reports fixed-ngrok/local session bootstrap, consumption, same-conversation reuse and cross-conversation rejection. | That those successful probes originated in ChatGPT rather than the scripted client. |
| Deterministic tests | Metadata parsing/digesting and grant behaviour for constructed inputs. | Host delivery, actual conversation semantics or live user experience. |
| Explicit open acceptance | Ledger still lists foreground clipboard proof and direct ChatGPT retry as remaining. Later Bearer restoration reports local/public auth probes, not closure of that acceptance. | A completed direct ChatGPT OTP/session lifecycle. |

No retained raw direct-host metadata trace was established by this bounded review. The evidence
does not justify “ChatGPT always sends these keys.” Nor does an old implementation justify
copying OTP/conversation grants or root tasks. The tmcp ledger's numerous task/gate/authority
layers are a warning: extracting the failure cases is useful; importing its workflow is not.

### Candidate comparison and selected minimum

| Approach | Benefit | Cost/failure | Verdict |
|---|---|---|---|
| No new subsystem; docs + current task/operation inspection | Already works for durable shared design; zero new state. | Ephemeral intent across conversations requires repeated reconstruction or repository handoff edits. | Keep as baseline/fallback, insufficient alone for the requested UX. |
| First-call bootstrap | One early intent snapshot. | Server cannot see the user prompt; first call may precede understanding; later goal changes are missed. | Optional model contribution, never a gate or automatic inferred intent. |
| Semantic payload on every tool call | Frequent capture. | Repetition, stale claims, tokens, schema pollution, writes and additional failure coupling. | Reject. |
| Explicit semantic sync tool | Clear boundary and optional failure. | Extra public concept if all state already belongs to workspace context. | Keep sync semantics, use workspace actions initially. |
| Existing workspace action with compact state | Few concepts, multi-project context, revisioned selection. | Requires the model to remember useful boundaries; uncaptured meaning cannot be recovered. | Selected initial design. |
| Hybrid event journal plus compaction | Recover intermediate decisions and compact long histories. | More storage, replay/retention/suffix rules and summary risk before benefit is measured. | Defer; add only if note/revision trials expose a real loss. |
| Full transcript/local-attached mode/private Codex DB dependency | Superficial similarity to another client. | MCP lacks full host context; doubles workflow/truth and couples private formats. | Reject. |

The selected design is [ARCHITECTURE's optional semantic continuity](ARCHITECTURE.md#optional-semantic-continuity):
workspace resume notes, a separate two-table sidecar, bounded revisioned model-authored state,
typed references and targeted fresh observations. It deliberately omits a distinct logical
thread owner/event taxonomy at first. Content is lossy working context, not an audit transcript;
decisions that must be normative still belong in their existing repository owner.

### Capability comparison and practical ceiling

| Capability | Local Codex pattern | ChatGPT + proposed tdev notes |
|---|---|---|
| Same-conversation continuation | Client retains model history and schedules calls. | ChatGPT owns this; tdev provides current tool results and optional recalled intent. |
| Context-window compaction | Client installs replacement history and resumes after its boundary. | Cannot replace ChatGPT's window; model can write/read a bounded note at useful boundaries. |
| Fresh-session recovery | Durable rollout/checkpoint reconstruction plus fresh tool state. | Candidate discovery + chosen note + relevant current material reads; no full transcript recovery. |
| Multiple conversations | Client-specific thread/resume/fork behaviour. | Workspace note identity is independent of conversations; concurrent updates require CAS. |
| Tool/effect recovery | Tool-specific current evidence still matters. | Existing tdev operation/supervisor/deployment recovery remains the owner. |
| Material reconciliation | History does not make current files/processes immutable. | Rebind references, observe unknowns, enforce current grants/CAS/policy as before. |

Meaningful cross-conversation recovery is feasible without full history, but equivalent recall,
host-controlled compaction and guaranteed automatic bootstrap are not established. The upper
bound is the quality of information the model actually records and later retrieves. No measured
token savings or fresh-ChatGPT success rate is claimed yet; the plan includes paired baseline
and note-enabled trials including update/rebind overhead and model variance.

### Failure and tmcp-regression audit

| Risk | Minimum prevention selected |
|---|---|
| Authority pollution / semantic permission | Prose is recollection; existing current authentication/admission/validation owns effects. |
| Duplicate HEAD/PASS/deployment truth | Typed references only; current evidence remains in its owner and is returned separately. |
| Workflow creep / recursive planner growth | No mandatory note, campaign, root task, semantic gate, decision owner or second development mode. |
| Context pollution / stale assumptions | Current objective replaces old one; dated assumptions, brief evidence-linked rationale, rebind relevant changed facts. |
| Per-call model overhead | Meaningful-boundary updates only; ordinary tool contracts/results remain unchanged. |
| Excessive storage | Bounded capsule/revisions, no transcript/stdout duplication; explicit limits/forget. |
| Wrong attach / authorization leak | Candidate discovery then model selection within current grants; metadata cannot authenticate or force attachment. |
| Host dependence | No session keys required; names/defaults/handles work on any supported client. |
| Compaction hallucination | No current-fact authority in summaries; revision CAS, source references and limited optional history, no silent loss of later updates. |
| Sidecar failure | Lazy isolated semantic storage; core does not open it; deleting it leaves product state/cleanup intact. |
| Too many durable owners | Two semantic tables own recorded text/replay only, not tasks, effects, decisions or permissions. |

Residual risk remains model omission/misinterpretation and host failure to invoke resume. It is
addressed by real-host acceptance and concise tool guidance, not another enforcing workflow.
Implementation placement, proposed actions/fields and falsification matrix are in the existing
architecture/plan owners, not a new review authority.

### Android inventory, feasibility and limits

Read-only local inventory: Android **16**, API **36**, `arm64-v8a`; current native process
UID **10379**, SELinux domain `untrusted_app_27`. This is ordinary Termux app authority, not
system/root or ADB shell. JDK **21.0.12** is installed. `aapt`, `aapt2` (**16.0.0.4-1**) and
`zipalign` are installed Android arm64 ELF tools. `termux-api` CLI package **0.59.1-1** is
installed; this alone does not prove the compatible Android add-on or its grants are usable.
`gradle`, `sdkmanager`, `d8`, `apksigner` and `adb` were not on PATH. Standard checked SDK
locations (`$PREFIX/opt/android-sdk`, `$HOME/Android/Sdk`) and `$HOME/.gradle` were absent.
This bounded check does not rule out project wrappers or tools in other locations. No toolchain,
APK, private key or companion was installed/created and no screen/sensor/clipboard was read.

On-device Android building is **plausible and practical to qualify**, not already verified for
arbitrary projects. Existing native resource tools and JDK remove obvious prerequisites, while
a compatible Gradle/AGP/platform/D8/signing chain and its host executable requirements still
need qualification. The official [Termux apksigner recipe](https://github.com/termux/termux-packages/blob/master/packages/apksigner/build.sh)
provides a Java-based signing route. A bounded future build must pin exact tools and record any
Termux-native replacement; incompatible native/NDK tooling may require an explicitly selected
other host. Neither “all Android projects build here” nor “a remote host is always required”
is supported by this inventory.

Android's [command-line build documentation](https://developer.android.com/build/building-cmdline)
distinguishes APK signing with apksigner from AAB signing with jarsigner/Gradle and generating
installable APKs from bundles with bundletool. Thus APK/AAB is a concrete requirement for generic
artifact production, not a reason to make every artifact a service or installable file. Preserve
final-byte validation, signing provenance and build-host/target separation now; qualify actual
APK/AAB production without waiting for UI control.

| Android interaction | Feasibility and boundary |
|---|---|
| Termux alone | Its permitted filesystem/process/network and exposed Android interfaces; no generic cross-app private-data or arbitrary UI authority. Android applies its [app sandbox](https://source.android.com/docs/security/app-sandbox) to native processes too. |
| Termux:API | Selected device APIs through the add-on and CLI, with required permissions and compatible signing. The [official app](https://github.com/termux/termux-api) requires matching Termux signatures; package presence is not live permission proof. |
| Optional companion | User-enabled [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService) can expose window content/actions/gestures subject to capabilities and app support. Secure windows can reject screenshots. This is a feasible observe/act/observe substrate, not universal control. |
| Screen / notification / clipboard | Separate Android capabilities, not implied by Accessibility. [MediaProjection](https://developer.android.com/media/grow/media-projection) requires consent per capture session; [clipboard access](https://developer.android.com/about/versions/10/privacy/changes#clipboard-data) has foreground/default-IME restrictions. [Notification access](https://developer.android.com/reference/android/service/notification/NotificationListenerService) also requires its own user-enabled service. |
| Beyond ordinary apps | Companion alone does not read other apps' private data, override protected UI or provide root-only system management. [Shizuku](https://github.com/RikkaApps/Shizuku) delegates an explicitly started ADB/root service and documents limits of ADB authority; [Device Owner](https://developer.android.com/work/dpc/dedicated-devices) is a separately provisioned management role. These are optional future adapters, not substitutes for existing grants. |

No IPC/API architecture or Android-use implementation is warranted now. Preserve authenticated
optional adapter boundaries and independent core failures. Runtime/resource control shares
identity, freshness, provenance and recovery vocabulary with continuity, but needs neither its
DB nor its summaries. The important packaging omissions were artifact export, non-service
outputs, build-vs-target platform and final signed-byte identity; speculative device frameworks
would not resolve them more cheaply.

### Review verdict and next work

There is sufficient value to implement a small **optional resume-note trial**, not evidence to
implement the entire proposed history/compaction subsystem. Use meaningful-boundary model sync
through workspace actions, not a new continuity tool or per-call metadata. Full history is not
needed; current-note rewriting is the initial compaction mechanism. Session keys are optional
provenance only. Multiple source tasks can reference one workspace note; no second work mode.
Independent storage permits the entire context feature to disappear without losing material
state. tmcp-style expansion remains a risk only if these explicit boundaries are relaxed.

The best value/complexity scope is bounded notes, revision CAS, candidate discovery, targeted
fresh state and real-host recovery measurement. Codex-like useful resumption is a testable goal;
Codex-equivalent context control is not an MCP-server capability. Android APK/AAB requirements
are explicit; current on-device feasibility is conditional, generic Android-use is insufficient
with Termux alone, and a separately authorized companion is a realistic later option. Core
development needs none of these optional Android components.

Proceed with generalized packaging, then minimum notes, then the complete journey qualification;
source-free resource inspection and demanded Android/external adapters follow. Only a concrete
blocking prerequisite may move earlier. Detailed slices/acceptance are recorded in
[IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md#current-priority-after-the-continuity-review).

### Checks for the documentation review

- Focused `test_contract.py`: **3 tests PASS**, 1.811s, exit 0.
- `sh scripts/check.sh`: **140 tests PASS**, 237.316s, exit 0; diff whitespace check passed.
- Local documentation link targets exist. Only README, ARCHITECTURE, IMPLEMENTATION_PLAN and
  this evidence file changed; existing packaging WIP and unrelated untracked state were preserved.
- These checks verify existing regressions/document consistency, not implementation or measured
  acceptance of the proposed notes, artifact packaging, Android builds or companion. No new
  direct ChatGPT metadata/resume acceptance, Android build or production activation was run.

## Packaging recipe and identity foundation — 2026-09-22

Implemented the first packaging slice in the development checkout after the approved review;
product patch version is 0.1.6. Canonical base remains `758ef37eaa164370d94486b247f1bd8bdbd1cb62`
until publication. Prior review/packaging document edits and unrelated untracked state remain
preserved. This slice is recipe inspection and identity validation, not a completed package builder.

- Added `tdev_artifact inspectRecipe` as the eleventh tool. It reads an exact successful source
  candidate and current adopted policy without dispatch/recovery, downloading dependencies,
  requiring a service target or creating an operation. Native/HTTP tests prove frozen-source
  inspection survives later edits, task close and controller restart; maintenance permits it.
- Recipe/manifest checks cover strict JSON, bounded relative inputs/exports, content pins,
  public HTTPS input descriptions, build-vs-target requirements and conditional service launch
  metadata. APK/AAB kind acceptance is descriptive only, not Android toolchain qualification.
  The eventual sealer must verify real bytes; caller-provided manifest hashes do not prove builds.
- Source-only receipt checks are shared with publication and source deployment/start/rollback.
  Artifact-subject receipts and inconsistent candidate/stop/exit identities are rejected;
  earlier retained source receipts without an explicit subject remain usable. The adopted
  artifact-check policy defaults to source validation and can be overridden once in project
  policy; changing/removing the override changes the binding without stale policy inheritance.
- Initial focused run found three fixture errors (unknown principal expectation, omitted close
  checkpoint and aliased platform dictionaries). Corrected fixtures: **16 tests PASS**, 33.171s.
  Affected artifact/contract/deployment/project/HTTP/bridge/CLI suite: **53 tests PASS**, 139.448s.
- Pinned official `@modelcontextprotocol/client@2.0.0` probe PASS, exit 0: modern 2026-07-28,
  eleven tools, expanded inspectRecipe schema and genuine error call. No direct ChatGPT claim.
- Inactive bundle rehearsal first exposed stale pre-resident template assertions. Updated it to
  inspect the resident launcher and exercise staged `run_service` with synthetic settings and a
  mocked exec boundary. Final `scripts/rehearse.py` PASS, exit 0: bundle
  `df54e6d79a6e852ccdec4b2d38e2ac7fe874f7ce0a796c9f15e8d02d2407c2f1`, wrong-Bearer rejection,
  eleven tools before/after restart, native SIGKILL recovery, exact source publication and
  synthetic native tunnel argv/profile/health settings. No real tunnel or shared service started.
- One full regression run was interrupted before completion during the session transition;
  its partial log is not PASS. The complete final rerun is recorded below.
- Final `sh scripts/check.sh`: **152 tests PASS**, 400.740s, exit 0, including the source
  receipt compatibility assertion added after the affected run. Final diff whitespace check
  passed. This validates the recipe/identity slice and existing paths, not retained builds.

Remaining: supervised retained builds/sealing/recovery, artifact verification and export/prune,
Python dependency layout and packaged release integration. Public prepare/validate-artifact/
export actions are intentionally absent until their implementation. The resident installation
still exposes its previous bundle; no production activation, commit or push occurred in this slice.

## Retained native builds — 2026-09-22

Extended the same unactivated 0.1.6 checkout with `tdev_artifact prepare/list/inspect`.
Existing operation intent/result/request identity owns builds; one artifact pin table joins
completed build operations to retained content digests. No new planning/workflow owner.

- Actual native fixtures build declared file outputs from frozen validated source, while edits
  and task close proceed independently. Reconnect and lost-dispatch replies reuse the original
  process; operation retirement removes scratch and leaves independently verified retained bytes.
  HTTP and staged-bundle fixtures exercise prepare/inspect/retire without deployment targets.
- Negative cases cover source mutation, undeclared output, symlinks, hardlink rejection, missing
  exports, case aliases, size limits, dependency hash mismatch, stored-byte tampering, changed
  authority/policy/tool/platform, cancellation/deadline and forged stdout. On this Android domain
  actual hardlink creation is denied by the OS; the file-reader's link-count rejection is also
  exercised with a deterministic stat fixture. Do not infer kernel isolation from these tests.
- Deterministic HTTPS response fixtures cover pinned public acquisition and redirect refusal;
  retained distribution capture/recheck is separately exercised. No real third-party dependency
  download or whole transitive package-manager build is claimed here. Build tools/host network
  are not hermetic; dynamic libraries and SDK data are not fully attested.
- Injected copy failure (ENOSPC-shaped OSError) and lost SQLite completion after object rename
  recover by verification/sealing without another build. A pre-reservation dispatch failure
  remains unknown, visible outside paged history, cannot be retired without proof, and counts
  against the eight-build bound. This is not an exhaustive SIGKILL test at every seal instruction.
- Initial focused runs exposed unnormalized symlink errors and native missing-job log errors
  leaking into the output-success schema. Fixed both. A fixture now distinguishes Android's
  hardlink syscall denial from capture rejection. Final affected artifact/build/HTTP/contract
  suite: **30 tests PASS**, 104.866s, exit 0.
- Official MCP SDK 2.0.0 probe: PASS, exit 0; modern 2026-07-28, eleven tools, all four artifact
  action schemas and an actual error call. No direct ChatGPT acceptance claim.
- Inactive bundle rehearsal: PASS, exit 0, bundle
  `4b68f03f856dbfca839ff84f592372365b4a6ec2b0173cc18828d33dde6d19e1`.
  Staged HTTP server passes authorization, native SIGKILL/restart and exact source publication,
  then builds retained output after task publication/close and rechecks it after scratch retirement.
  Controller/tunnel service-template checks remain synthetic; no shared service/provider changed.

Next is slice 3's concrete relocatable dependency/runtime fixture, then artifact validation and
release integration. Export/prune, operator-configurable artifact budgets, signed outputs,
APK/AAB qualification and installed build acceptance remain outstanding. No commit, push or
resident activation is included in this slice. Full regression outcome is recorded below after
completion; partial progress is not a PASS.

Final `sh scripts/check.sh`: **162 tests PASS**, 428.011s, exit 0; diff whitespace check
passed. The full suite includes existing deployment/recovery/resident-installation/source/
workspace regressions. Local documentation targets also resolve. These are checkout and isolated
fixture results, not activation or direct ChatGPT acceptance of the new installed tool surface.

## Pure-Python layout and runtime compatibility — 2026-09-22

Implemented packaging slice 3 in the same unactivated 0.1.6 checkout. The project-owned
`examples/python-package` recipe installs fixed wheel inputs into a new artifact-local layout;
there is no copied live venv or new Python package-manager authority. The shared internal runtime
helper verifies retained bytes and declared host requirements and returns launch inputs for the
existing supervisor architecture. It does not activate services or add a second process lifecycle.

- Service `inspect` now reports current runtime compatibility separately from retained-byte
  integrity. Optional `service.runtime.files` pins explicit host files such as shared libraries.
  Missing/changed platform, executable or file requirements never trigger install/rebuild;
  inspection, historical success and scratch retirement remain usable. Scratch inside retained
  storage and overrides of runner-owned HOME/cache/environment paths are rejected.
- The example uses no-index/no-deps/hash-checked binary installation from selected inputs,
  disables bytecode, and invokes an artifact-relative launcher with Python `-I -S -B`. It does
  not process `.pth` files or inherit host site-packages/PYTHONPATH. Generated pip wrappers are
  discarded; deterministic fixtures exercise console-entrypoint metadata, package data, a
  generated asset, relocated paths, external data writes and missing dependency failure.
- Four deterministic runtime tests use a source-pinned synthetic wheel and real native pip/
  build/runtime execution without registry access. The fixture wheel remains a frozen source
  input; the independent live rehearsal below exercises the public dependency acquisition path.
- An initial fixture omitted the existing `resetEnvironment.expected` field; corrected the
  fixture, not the product's checkpoint semantics. Also removed an imported test class from
  module discovery to avoid duplicate test execution. Final affected artifact/runtime/build/
  contract suite: **28 tests PASS**, 56.590s, exit 0. Added scratch-scope and reserved-environment
  assertions then ran the two affected tests: **2 PASS**, 5.340s, exit 0.
- Opt-in `scripts/rehearse_python_package.py`: PASS, exit 0. Actual public distribution
  `packaging-25.0-py3-none-any.whl`, SHA-256
  `29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484`, was fetched through the
  production acquirer. Two independent builds produced identical artifact digest
  `1ad2e8138b167f0a8bb892c0c74fa608457d1bd4ad0865dce5b95f05c9ea194b` in that fixture.
  After task/environment cleanup, removal of development/native build directories and package
  relocation, the app imported retained packaging 25.0, read its generated asset and wrote
  only external data. Post-run retained-byte verification passed; 11 selected host-library
  requirements were checked. No runit service, deployment target or resident runtime changed.
- This measured equality applies to the selected fixture and host. It is not a universal
  reproducible-build claim. Native extensions, editable/.pth-based layouts, entire stdlib/pip
  implementation, unlisted system libraries/future dlopen inputs and OS state remain outside
  this qualification. Actual network isolation was not asserted; launch uses no acquirer or
  package manager, but native commands retain host network authority.
- Official MCP SDK 2.0.0 probe: PASS, exit 0, modern protocol 2026-07-28 and eleven tools.
  Documentation link targets and diff whitespace checks passed. No direct ChatGPT acceptance,
  commit/push or installed activation was performed.

The next slice is artifact validation and packaged release integration, reusing the checked
runtime helper before each verification/start/rollback. The pure-Python example is a finite
launch probe; it does not itself prove HTTP readiness or service recovery.

Final regression log from `sh scripts/check.sh`: **166 tests PASS**, 299.200s, ending in `OK`.
The process handle was unavailable after the profile/session transition, so its shell exit code
was not independently recovered. A fresh final `git diff --check` passed with exit 0; no test
failure or incomplete test run is being promoted to PASS.

Implementation references: [pip install flags](https://pip.pypa.io/en/stable/cli/pip_install/)
and [Python isolated/no-site invocation](https://docs.python.org/3/using/cmdline.html). These
explain the selected invocation; executed fixtures, not documentation alone, establish the
local qualification above.

## Artifact validation and packaged deployment — 2026-09-22

Implemented packaging slice 4 in the unactivated 0.1.6 checkout, continuing the accumulated
packaging changes on canonical checkout HEAD `758ef37eaa164370d94486b247f1bd8bdbd1cb62`.
No commit/push or production service/provider change was performed for this slice.

- Added artifact-subject validation through the existing tool/operation lifecycle. File artifacts
  run the adopted policy without a service target. Service artifacts execute their manifest
  entrypoint on a separate test port, prove HTTP release identity, run the adopted check, stop
  descendants and recheck disposable and retained bytes. Neither exit zero nor stdout is a PASS
  receipt. Source publication continues to reject artifact validation.
- Packaged release uses the existing deployment controller, ownership, revision CAS and switch
  recovery. It forbids command overrides and rechecks current source/artifact policy, content
  and runtime before taking down an existing service. Build/validation retirement and task close
  preserve deployability; changed runtime/content does not prevent stopping/removing an owned
  service. Writable application data stays outside the package.
- Artifact admission advances internal storage to schema 4; source-only state stays at 3. A
  dedicated regression rejects selecting a schema-3-only bundle after artifacts exist and then
  reopens the retained state successfully. This is not a product version change.
- Seven new tests exercise file validation after source close, current policy and receipt
  mismatch, forbidden command override, output mutation, deadline, early service exit, lost
  dispatch response/reconnect without resubmission, failed/interrupted deployment recovery,
  runtime/content preflight and old-bundle rejection. HTTP coverage executes a real native
  build → artifact validation → inspection → scratch retirement and preserves source publication.
- Final affected artifact-validation/runtime/deployment/HTTP/contract/admin suite: **39 tests
  PASS**, 134.312s, log ends in `OK`. The earlier profile's process handle is no longer available,
  so its shell exit code was not recovered. An initial fixture used a disallowed service prefix;
  corrected to the required `tdev-app-` namespace. One earlier concurrent runtime test exceeded
  its iteration-based polling budget; the shared fixture now uses a bounded 20-second monotonic
  deadline. Product deadlines were not relaxed.
- `scripts/rehearse_artifact_deployments.py` completed all assertions and printed its success
  record. It uses real native validation, the public pinned `packaging==25.0` wheel, generated
  app data and an isolated real runit graph: update while the old version serves, controller
  reconnect/rollback, supervisor SIGKILL recovery, failed activation restoring the old version,
  and stop/start/removal preserving application data. Source/build/validation scratch was retired
  before release. Rollback ran with the acquirer patched to reject any call; this proves no
  hidden reacquisition, not OS-enforced network isolation. The shared live graph was untouched.
  The earlier process handle was unavailable after the profile change; shell exit code was not
  independently recovered. This does not qualify shared runsvdir-root recovery or ChatGPT calls.
- Official MCP SDK 2.0.0: PASS, exit 0, protocol 2026-07-28, eleven tools and the advertised
  artifact validation variant. `scripts/rehearse.py`: PASS, exit 0, inactive bundle
  `0722a890de95bf836febd366ac939d9f410b8453ac92c1879185ff99c656ebb0`. Its authenticated HTTP
  path executes native crash/reconnect/exact publication, retained build, artifact validation
  and scratch retirement. Service/tunnel template checks remain synthetic; the resident
  installation was not changed.

Next is explicit retention/export/prune and configurable budgets (slice 5), then remaining
qualification/delivery. Android build/signing, native extensions, other package managers,
remote/container targets and installed artifact acceptance are not claimed by this fixture.
Final `sh scripts/check.sh`: **173 tests PASS**, 228.474s, **exit 0** (also captured in a durable
exit marker). Documentation file/heading links and final `git diff --check` passed. These results
qualify the checkout and isolated fixtures, not installed activation or direct ChatGPT acceptance.

## Artifact retention, bounded export and pruning — 2026-09-22

Implemented packaging slice 5 on the same uncommitted, unactivated 0.1.6 checkout. The separate
ChatGPT monitoring investigation remains deferred; no bounded-wait or host orchestration change
was included. No resident service, project provider, credential or operator config was changed.

- Added `tdev_artifact usage/export/prunePreview/prune` to the existing eleven-tool surface.
  Export returns bounded verified file pages and whole-file identity; it needs no HTTP service
  or destination-path grant. Usage is a bounded authorized metadata page with explicit unknown
  historical sizes; it does not claim total installation disk consumption.
- Current/previous deployment versions (including stopped services), pending verification and
  ambiguous switches prevent pruning. Pending builds retain their own capture and capacity
  reservation without blocking unrelated cleanup. Preview tokens
  are rechecked under the same lifecycle serialization as deployment admission/reconciliation.
  Source tasks remain independently editable. Historical success receipts now disclose their
  retained/pruned storage state; pruned receipts cannot reactivate the artifact.
- Retirement is journaled before an operation-owned rename/delete. Tests interrupt both rename
  and deletion, reconnect, preserve a newly built identical shared object, reject an untrusted
  tombstone symlink, and race release against prune. Removed service data and historical release
  copies remain untouched. There is no automatic GC or arbitrary-path deletion API.
- Operator packaging limits separately bound acquired bytes, output bytes/files, sampled working
  storage, deadlines, retained admission capacity and minimum retention age. Build reservations
  survive unknown dispatch and pending prune retains conservative capacity. No source-copy or
  task-dependency ceiling was disabled. Output/input/file ceilings remain the conservative format
  bounds; native budgets are not OS quotas or hostile-code isolation.
- Storage accepts schema 3/4/5, preserving old source and artifact rows. New artifact admissions
  mark schema 5; schema-3/4-only bundles are refused. A temporary legacy-schema fixture verifies
  additive metadata upgrade, explicit unmeasured bytes, subsequent verified accounting and
  unchanged retained content. Product line remains 0.1; no new major/minor release was declared.
- Initial affected build/validation/contract checks: **20 PASS**, 55.142s. Initial new retention
  suite had one test expectation failure: an undelegated principal correctly returned
  `PERMISSION_DENIED`, while the fixture expected `OPERATION_NOT_FOUND`. The fixture was corrected;
  product authorization was not relaxed. Subsequent affected suite: **41 PASS**, 242.925s,
  exit 0. Final retention/HTTP/contract suite: **20 PASS**, 100.501s, log ends in `OK`; its process
  handle did not survive session resume, so no independent shell exit code is asserted for it.
  Final metadata-upgrade/shared-page checks: **2 PASS**, 11.765s, exit 0. Final review then
  removed an overly broad pending-build deletion fence: it could prevent freeing disk space
  needed to recover a pending seal. A targeted lost-receipt/equal-content test checks cleanup
  followed by reconciliation from the independent native capture without rebuild. Those final
  pending-seal/protection checks: **2 PASS**, 10.595s, exit 0. Full regression was restarted for
  that final source revision; the earlier in-progress run is not its qualification evidence.
- Official MCP SDK 2.0.0 probe: PASS, exit 0, protocol 2026-07-28, eleven tools, new action schemas
  and usage call. Inactive `scripts/rehearse.py`: PASS, exit 0; tested bundle
  `8ba5e6a29cce4f409cb4dd8023cef5cca034f141bf0417077a488258c98c3edc` exercised authenticated
  HTTP/reconnect/exact source publication, artifact validation, export and explicit prune.
  Subsequent edits moved historical size measurement outside its SQLite transaction and clarified
  action descriptions. After the pending-build cleanup correction, the inactive rehearsal passed
  again with final bundle `80e92599b2c11459425569a4b8f4a2df605407132ba406a208a2c78a2164010d`,
  exit 0 (durable marker), including the same export/prune and HTTP/reconnect assertions.
- Real isolated `scripts/rehearse_artifact_deployments.py`: PASS, exit 0 (durable exit marker).
  Actual public `packaging==25.0` acquisition, artifact verification, update, reconnect/rollback,
  supervisor crash recovery, failed activation restoring the old release, and data-preserving
  stop/start/remove all passed. New assertions reject pruning an active package and export/prune
  it after removal while preserving app data. Its temporary runit graph was independent of the
  shared live graph. This is not direct ChatGPT or installed-runtime acceptance.

Remaining packaging work is slice 6 delivery/installed acceptance and final journey qualification.
Large-file transfer throughput, historical deployment-copy pruning, signed transformations,
APK/AAB/native-extension/other package-manager qualification remain outside this slice.
Final `sh scripts/check.sh`: **186 tests PASS**, 599.780s, **exit 0**, including
`git diff --check`. Both the completed process result and durable exit marker confirm success.
This run includes the final pending-seal cleanup correction and all 13 retention tests.

## Optional HTTP lifecycle diagnostic isolation — 2026-09-24

The lifecycle investigation first prototyped detailed HTTP recording, then adopted the user's
requirement that ordinary operation must not depend on the diagnostic layer. The current source
therefore defaults to `--diagnostics off`: no collector import, diagnostic storage, writer or
operator socket. Explicit `trace` enables bounded collection/export. Hooks isolate observer
exceptions from dispatch/response; failed optional startup is exposed in health without writing
a potentially blocking stderr notice. Core MCP contracts and retained-operation semantics are
unchanged. Automatic watch, runtime activation/expiry, incident delivery and policy mitigation
remain proposed in ARCHITECTURE; they are not claimed as implemented capabilities.

Evidence is retained under `.artifacts/lifecycle-forensics-20260924/`:

- `diagnostic-optional-health-focused.log`: **25 tests**, **52.420 s**, PASS. Includes HTTP
  compatibility, blocked/failed writer, active-stage snapshot, bad auth/body, serialization and
  socket failures, restart correlation, bounded rotation, export gaps, private paths, optional
  module absence, observer failures, and escaped Unicode IDs.
- `diagnostic-conditional-delivery/rehearsal-results.json`: inactive bundle
  `eddbb9cbe48395e609e0bb77bb022b97e2804249ac8f7c680f8c3911fa11d595` ran twice on disposable
  state/ports. Authenticated MCP and CLI exports passed; runtime instances differed while key,
  RPC and operation tags persisted. Exact bundle verification passed before/after execution.
- `diagnostic-conditional-delivery/off-results.json`: actual entrypoint with the diagnostic
  module unavailable still served health and all 11 tools in both default-off and requested-trace
  cases. Health distinguished `off` from `unavailable`; no diagnostic directory was created.
- `diagnostic-optional-delivery/benchmark-results.json`: pre-health-field candidate, alternating
  240 local status calls/path with concurrent test load; p50 baseline **6.589 ms**, default off
  **6.546 ms**, persistent trace **10.404 ms**. No sink drops/errors. This is a local smoke
  comparison, not statistical or ChatGPT visible-liveness qualification.

The bundle is inactive: no live active-pointer/service registration, config/provider replacement,
original diagnostic evidence cleanup or Codex live-state change. Resident identity is checked
separately. Export is bounded and non-atomic; server write success does not prove host receipt,
continuation or visible progress. Previous prototype results do not qualify the final source.

Final `bash scripts/check.sh`: **205 tests**, **622.036 s**, **PASS**, exit 0;
`git diff --check` passed. See `diagnostic-conditional-full.log`.

## Automatic diagnostics, expiry and response notifications — 2026-09-25

The user authorized implementation, remote commit/push and resident delivery, then selected
`watch` for the diagnostic operating configuration. Product version is **0.1.7**. New installations
still default to off. The implementation adds scoped `tdev_diagnostics` control/acknowledgment,
watch-triggered bounded capture, independent timer expiry, asynchronous bounded incident storage,
and compact notification offers in tool response text and metadata. It never cancels/retries work.

Scope and failure checks:

- Automatic slow-dispatch/dispatch-failure triggers, expiry without new calls, no lease extension
  on replay, stop cooldown, return to off/watch, private incident visibility, cross-principal ack
  rejection, bounded retention, restart interruption and retained acknowledgments.
- A blocked incident writer does not block expiry, inspect or ack. Persistence errors are exposed;
  corrupt/incompatible evidence is preserved. API output excludes raw arguments, logs and secrets.
- Lazy authorized activation from off; unauthorized activation does not create the runtime.
  Fresh diagnostic-grant revocation is enforced. HTTP and Local Codex bridge preserve alert offers.
- Config update/recovery uses the operator config lock plus expected-content checks. An injected
  crash restores the old bundle/config before service restart. A concurrent operator edit is
  preserved and leaves recovery evidence; rollback retains a compatible config receipt.

Evidence under `.artifacts/diagnostic-activation-20260925/`:

- `policy-final.log`: **9 tests**, **6.405 s**, PASS.
- `resident-config-lock.log`: **14 tests**, **4.294 s**, PASS.
- `mcp-sdk-alerts.log`: official `@modelcontextprotocol/client@2.0.0`, protocol **2026-07-28**,
  **12 tools**, authenticated call, notification text/metadata and acknowledgment PASS.
- `inactive-coding-rehearsal.log`: installed coding/build/validation/export/prune and restart
  rehearsal PASS on isolated state; no production/provider service changes.
- `final/watch-rehearsal.json`: exact staged bundle
  `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, real server entrypoint,
  watch config, one-second manual capture, notification acknowledgment, automatic expiry,
  restart-preserved acknowledgment/key identity and local export PASS. Two process generations
  served the same verified package; no live service activation during rehearsal.

Local HTTP/SDK/bridge success is not ChatGPT UI qualification. Offers mean a response was prepared,
not received/rendered. Explicit ack records caller receipt, not visible surface delivery. There is
no unsolicited push/wake path in this request/response server. During an unavailable host channel,
retained incidents and subsequent response offers/inspection are the recovery path. Recent state
can still be lost before asynchronous storage completes; counters disclose pending/error status.

Final `bash scripts/check.sh`: **216 tests**, **664.561 s**, **PASS**, exit 0;
`git diff --check` passed. Log: `final/full-check.log`. The exact staged source above includes
both automatic diagnostic behavior and serialized config update/recovery. Production acceptance
is recorded separately after the authorized transition.

### Authenticated ChatGPT connector continuation acceptance — 2026-09-25

After Local Codex completed source qualification, commit `794129df1a82ba0672782dfcc40f033bbd9d3591`, push, and the installed-runtime transition, ChatGPT continued the explicitly authorized acceptance through the refreshed authenticated connector. This continuation changed no product source or tracked runtime configuration.

- Installed identity was rebound before acceptance: source commit `794129df1a82ba0672782dfcc40f033bbd9d3591`, bundle `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, version `0.1.7`, diagnostic base mode `watch`.
- Fresh connector discovery exposed `tdev_diagnostics`; authenticated `inspect` succeeded from ChatGPT.
- ChatGPT activated a bounded 2-second manual capture. Incident `a7d9271c582e3fa6bb9478b80d1eaac7` was offered on an ordinary subsequent connector response (`offers=1`), then acknowledged by the same authenticated principal.
- A later fresh `tdev_diagnostics inspect` observed `capture=expired`, `delivery=acknowledged`, `offers=1`, base `mode=watch`, `storageErrors=0`, and `storagePending=false`. This proves request/response offer, principal-scoped acknowledgement, expiry and return to watch for this connector path; it does not claim ChatGPT UI rendering or unsolicited wake/push behaviour.
- Durable evidence: `.artifacts/diagnostic-activation-20260925/chatgpt-connector-acceptance.json`. That artifact is operator evidence and remains untracked by design.

The implementation/source qualification remains the Local Codex work recorded above. This section records only the subsequent ChatGPT-operated acceptance so a later independent reviewer can distinguish authorship and re-evaluate the evidence without trusting the conversational handoff.

### Post-ChatGPT independent review — 2026-09-25

The resumed Local Codex review read current repository instructions, source and the ChatGPT
continuation commit `9ca2c8c`; that commit changes only this file and OPERATIONS. The remote
branch still pointed at `794129d` when reviewed. The continuation's own full-check log records
216 tests in 721.567 s, exit 0. This is retained prior evidence, not a newly executed test result.

Independent read-only installed checks:

- `install.sh --check` verified owned controller PID 13744, version 0.1.7, bundle
  `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, and native-cgo Tunnel
  PID 13764 with control-plane polling. Health reported watch. Installed manifest file hashes
  matched the checkout's packaged source, and the live config matched the deployment receipt.
- Comparing that private config with its rollback receipt showed only the selected watch mode
  and owner diagnostic grant changed. No credentials were printed. Read-only SQLite inspection
  reported internal schema 3; this does not qualify a schema-5 artifact journey.
- A new same-UID snapshot/export independently found the recorded ChatGPT incident
  `a7d9271c582e3fa6bb9478b80d1eaac7` expired and acknowledged, with one offer and matching ack time.
  It corroborates retained server state; the ChatGPT origin/host receipt remains the continuation's
  recorded evidence, not something the local socket independently attests.
- At that sample there were no active observed requests, no sink drops/errors, no incident storage
  errors or pending writes. The ring had 2,796 overwrites among 3,052 emitted events. That is expected
  finite retention, but means this snapshot cannot reconstruct the whole intervening session.
- Two later expired manual incidents were still unacknowledged, with **98 and 93 offers**. Source
  `DiagnosticsPolicy.offers` bounds frequency and per-response count, but not total offers before
  acknowledgment/eviction. This is a demonstrated notification-overhead candidate, not proof of a
  ChatGPT stall or of user-visible delivery. Their actor/client cannot be inferred from the manual
  reason alone. No incident was acknowledged or removed by this review.

An isolated four-incident policy probe reproduced an additional selection defect. With no ack
and one eligible response every 16 seconds, 20 responses produced offer counts **[20, 20, 20, 0]**.
`DiagnosticsPolicy.offers` filters in insertion order then takes the first three; those three
become eligible again before every response, so the fourth incident is starved. Serialized alert
metadata alone totaled 12,473 bytes in this fixture, excluding the duplicate text block and normal
response. This is a deterministic selection result for that schedule, not a universal runtime
threshold or ChatGPT reproduction. `offer-fairness.json` records the fixture. Fair selection and
bounded total retries are the next runtime change; this review does not alter live delivery policy.

A disposable scheduling prototype then prioritized never-offered/least-recently-offered incidents,
used 15–300 s exponential delays and capped each incident at eight offers. Over 120 responses
spaced 16 seconds apart, the four-incident case changed from `[120,120,120,0]` to `[8,8,8,8]`;
serialized metadata fell from 75,036 to 6,743 bytes. At the 32-incident retention bound, all 32
received eight offers; the current policy reached only the first three. These are local simulated
schedules, not host performance measurements or selected production defaults. The prototype still
needs restart/clock-change tests and explicit inspection semantics for exhausted retries; bounded
retry does not guarantee receipt. `compare_offer_policy.py` and `offer-prototype.json` remain
isolated artifacts and are not imported, packaged or installed by tdev.

The earlier `live_accept.py` local authenticated check failed because the assumed
`connector.secret` file did not exist. Its failure log remains intact. Subsequent same-UID
operator acceptance and the separately recorded authenticated ChatGPT acceptance cover different
boundaries; neither turns that failed script into a pass. No credential search or replacement was
needed for this review.

Added two isolated HTTP boundary regressions in `tests/test_diagnostic_policy.py`:

- Hold a real authenticated HTTP dispatch open, advance the injected diagnostic clock, and inspect
  through the independent Unix socket. Slow dispatch activates capture; expiry returns to watch
  while the HTTP client is still waiting. Releasing dispatch delivers its normal successful result
  and the expired incident offer. This exercises diagnosis without another MCP poll.
- Commit a real disposable task-open effect, inject a body-write disconnect after headers, and
  observe client `IncompleteRead`. Evidence distinguishes successful dispatch from failed response
  delivery. The next same-request replay returns the original receipt and offers the pending
  incident without treating the failed write as acknowledgment. No live tasks were touched.

Focused policy checks: **11 tests**, **11.261 s**, PASS. Affected diagnostic/HTTP/bridge checks:
**38 tests**, **82.303 s**, PASS. Full `bash scripts/check.sh`: **218 tests**, **784.542 s**,
PASS, exit 0; `git diff --check` passed. Log: `full-check.log`.
New evidence is under `.artifacts/diagnostic-review-20260925/`, including
`rebind.json`, a new private export and test logs. Existing diagnostic evidence remains intact.
This review changes tests/documentation only; no runtime reinstall or provider change is required.

The next implementation order is recorded in IMPLEMENTATION_PLAN: bound alert repetition, capture
one actual first divergence with independent server/host/visible observations, compare a fixed
workload across clients, then test ownership/Stop separately. The source can diagnose server-side
failures, but watch cannot detect UI-only silence and response notifications cannot wake a stopped
host. Visible continuity remains an open product requirement.

## Bounded alerts, error aggregation and independent observation — 2026-09-25

The user selected implementation along the lifecycle roadmap and easier error observation during
ChatGPT use. The 0.1.8 candidate keeps diagnostic adapters optional and adds no operational retry,
cancellation, provider mutation or always-on observer service. Prior authority to publish/update
the resident installation and keep its watch configuration remains applicable.

Implemented and checked boundaries:

- Never-offered/least-offered eligible incidents replace insertion-order selection. Three offers
  per response, eight total per incident and 15–300 s exponential delay bound retries. Exhaustion
  remains distinct from acknowledgment; full inspection and ack work afterward. Existing counts
  above eight are preserved, not reset. Elapsed-time scheduling and clamped restart delays handle
  wall-clock jumps without unlimited delay. Alert text no longer duplicates the entire metadata row.
- Principal-scoped summaries count server tool/protocol errors and lifecycle failure signals,
  independently of incident cooldown. Classified client reports have separate counters and no
  free-text/raw error field. Request replay does not recount or extend capture; conflicting
  categories/actions fail. Grant revocation, schema rejection and privacy boundaries remain live.
- Counters survive incident eviction and ordinary restart. Aggregation has its own 32-principal
  bound, explicit eviction count and coverage timestamps; categories overlap and are not distinct
  operation counts. Healthy responses cause no aggregation writes. Revision-1 incidents upgrade
  without invented historical counters. A prior bundle preserves revision-2 bytes and reports
  diagnostic storage incompatibility rather than overwriting them.
- An independently launched observer records bounded private snapshots or unavailability records,
  including file hash and stop reason. It makes no MCP calls and never restarts/activates tdev.
  A test sends SIGSTOP to a disposable diagnostic process: the separate observer records a timeout,
  and after SIGCONT observes the same PID. Duration/byte ceilings and refusal to overwrite evidence
  are tested. These signals do not independently identify ChatGPT UI state or a private host cause.

Evidence under `.artifacts/diagnostic-observation-20260925/`:

- `initial.log`: **19 tests**, **19.210 s**, PASS for the initial policy/contract slice.
- `observer.log`: **3 tests**, **4.697 s**, PASS, including actual process suspension/recovery.
- `affected.log`: **49 tests**, **95.735 s**, PASS across diagnostics, observer, HTTP, bridge and contract.
- `sdk.log`: official `@modelcontextprotocol/client@2.0.0`, modern MCP 2026-07-28, 12 tools;
  report replay and compact summary passed in addition to activation/ack.
- `watch-rehearsal.json`: staged bundle
  `8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`, real 0.1.8 entrypoint,
  direct modern MCP and the tdev legacy Codex Bridge adapter. Both paths produced classified reports;
  a genuine missing-operation response incremented the server error counter. Summary omitted full
  incidents. Replayed reports, counts and ack survived restart, key identity stayed stable and process
  instance changed. The staged external observer/export worked in both generations. No live services
  or provider runtime were changed during this rehearsal. This is not the Local Codex agent loop or
  ChatGPT Code Mode qualification. The inactive root's Tunnel selection was not exercised; the
  resident native-cgo Tunnel remains separately checked at installation.
- `resident-before.json` and `before-export/`: preserved pre-update config digest, watch grant,
  zero outstanding operations at that sample, and bounded existing diagnostic evidence.
- `offer-comparison.json`: the actual candidate policy produced `[8,8,8,8]` over the earlier
  four-incident/120-response/16-second schedule, with 8,321 metadata bytes. This is an isolated
  schedule measurement, not ChatGPT latency or visible-liveness qualification.
- `downgrade-sidecar.json`: the actual installed 0.1.7 policy was run against a disposable copy of
  revision-2 state. It reported one storage error and preserved the incident file byte-for-byte.
  No live rollback or operational-state downgrade was performed.

The first `full-check.log` stopped without a completion result across session interruption; it is
preserved and is not counted as PASS. The resumed `bash scripts/check.sh` completed **226 tests**
in **735.971 s**, PASS, exit 0; `git diff --check` passed. Log: `resumed-full-check.log`.
Actual ChatGPT discovery of the
new report/summary contract and a real visible-divergence/control experiment remain separate host
acceptance. Do not manufacture client error reports in production merely to claim that acceptance.

### Installed 0.1.8 acceptance

Implementation commit `dcaaf10` was pushed to `origin/tdev` before the authorized resident update.
The first installation attempt returned `OUTSTANDING_EFFECT`, effect none: a newly running exec
appeared after the preflight snapshot. Existing controller PID 13744 remained healthy on 0.1.7.
The operation was not cancelled, retried or force-terminalized. A later read-only SQLite check
found no outstanding operations; the supported installer retry succeeded and verified the services.
Both attempt logs remain in the evidence directory.

- `install-live-retry.json` and `resident-after-check.json`: controller **0.1.8**, PID 28483,
  bundle `8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`; owned native-cgo
  Tunnel PID 28509 with control-plane polling. Health reports watch.
- `live-acceptance.json`: installed manifest files equal the tested checkout; private config digest
  is unchanged. All **five** prior incidents remain, existing acknowledgments/times and accumulated
  offers are preserved, correlation key is unchanged and process instance changed. Incident storage
  advanced to revision 2 with no storage error. No production client-error report was fabricated.
- `after-export/` preserves a new live snapshot and retained log/incidents. Missing higher rotated
  segments are reported as absent/rotated rather than silently presented as complete history.
- `live-observer/`: the installed observer recorded **four** snapshots over **two seconds** with
  zero unavailable samples, bounded bytes and a verified file hash. This qualifies the local installed
  observation path, not ChatGPT UI continuity or the ability to interrupt old host continuations.

The remaining roadmap work is real ChatGPT discovery/report/summary acceptance and first-visible-
divergence correlation, followed by paired workload and separate control-ownership qualification.
No host-private success claim is substituted from the direct MCP or Codex Bridge evidence.

## Caller execution witness — 2026-09-26

Fresh entry bound root AGENTS, README Current work/version policy, the local lifecycle diagnostic
architecture, diagnostics wire contract and implementation-plan follow-up order. Local branch
`tdev` and remote `origin/refs/heads/tdev` both named
`839026fef7a99eae60b082fed1149b6566d806a5` before this change; origin is `humtr/tdev`.
Tracked source was clean; untracked `.artifacts/` and `node_modules/` were preserved. The latest
user instruction permits source implementation/qualification but explicitly forbids resident
replacement/restart/config/provider changes. Earlier installation authority was not reused.

**Prompt assessment and independent design decision.** Its objective is appropriate, with three
corrections: marker presence is an assertion whose meaning depends on the actual await-ordered
caller; marker absence does not identify the stalled boundary; every probe perturbs call budget
and timing. A later ordinary tool call or report can already establish that *some* caller code
continued, given its saved script. Thus it would be false to claim no existing surface can ever
provide an external witness. The missing feature is explicit, correlated, bounded observation
without operational mutation or activating an incident/capture. Existing report activates trace
and counts incidents; acknowledgement concerns an incident, not arbitrary response receipt.
Watch/trace/HTTP and the independent observer describe the server; retained operation success
and replay describe durable effects. Local bridge evidence describes that client, not ChatGPT's
private continuation. Task/file markers unnecessarily mutate operational state. These alternatives
do not supply the same non-activating, correlated diagnostic contract.

Selected one `mark` action under the existing owner, not another standalone MCP tool. Added optional
response metadata to join a returned call to the existing instance/request server identity.
Principal + instance + run + sequence replaces a second independent requestId for this ephemeral
probe: one identity controls ordering, conflicts, deduplication and an evicted-retry rejection.
It deliberately does not pretend to use durable operational replay. Thirty-two process-local run
watermarks never evict; 256 receipts evict with a count. This bounded refusal policy prevents old
retries becoming fictitious fresh progress. Reuse one run across cells; a full run registry is a
reported diagnostic limitation, not permission to restart production. Receipt denotes memory
acceptance, not flushed storage. Raw IDs are keyed tags in retained events; strict input excludes
messages, outputs, commands, paths, auth, exceptions and arbitrary fields.

The available environment tool catalog exposed no supported reader for private ChatGPT turn-runner
telemetry. The official [plugin troubleshooting guide](https://developers.openai.com/plugins/deploy/troubleshooting)
checked on this date recommends correlating server/client evidence and escalation for internal
reproduction; it does not provide that private reader. This is a bounded availability finding,
not a claim that no internal OpenAI interface exists. No internal telemetry is fabricated here.

The retained `reported_visible_stall` incident, created at 2026-09-26 00:00:47 UTC, independently
preserves relevant server evidence: event 1458 admitted a running exec; event 1462 reports the same
keyed operation as succeeded/terminal; event 1463 records HTTP completion at 2026-09-25 23:48:58 UTC.
The next retained event (1464, diagnostic inspect) is about **695.93 seconds** later at 00:00:34.
This corroborates operation completion followed by an observed server gap, not host receipt or
UI delivery. The exact visible phrase `Checking and Raising File Size Limits`, the user's Stop and
resume, and the separate observer's continuity are not independently time-bound by this incident;
those remain user observations. Watch did not retain detailed socket stages for that earlier call.
A new **read-only** resident export confirms PID 28483, instance `4bc43da834047048`,
key generation `7ca33a31371bbfad`, watch, no active requests at sampling, and 256 recent records
with 2,508 ring overwrites. The current ring cannot reconstruct or falsify that earlier UI event;
the incident's bounded excerpt is why the server frontier above survives. It was not used
to assert that server silence means host/UI failure; no incident was acknowledged or removed.

**Relevant defect found and corrected.** In `make_server.Handler.do_POST` response assembly,
alert retrieval was protected but alert text formatting and JSON serialization
were not. A malformed optional diagnostic record could therefore discard an otherwise completed
operational response after dispatch. Rendering and serializability now succeed before the alert
is attached; optional response correlation metadata is similarly isolated. Fault injection
reproduces this failure class and verifies the ordinary response survives. This is a real failure
window in tdev, but no evidence links it to the reported natural ChatGPT stall.

**Source candidate:** 0.1.9; inactive bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`.
Owner changes: `src/tdev/diagnostic_policy.py` (witness policy/replay), `diagnostics.py` (detached bounded
record), `server.py` (optional receipt/fail-open rendering), `core.py` (fresh grant/maintenance
check only), `__init__.py` (patch version), `contracts/tools.schema.json`; qualification in
`tests/test_diagnostic_witness.py` and `scripts/check_mcp.py`; README, ARCHITECTURE, OPERATIONS,
IMPLEMENTATION_PLAN and this validation record. No observer implementation or production service
graph change. Operational core still imports no diagnostic implementation.

Evidence is preserved under untracked `.artifacts/host-witness-20260926/`:

- Focused: **8 tests PASS**, 7.575 seconds (`focused-final.log`). Initial `focused.log` failed
  because the test used `response_body_written` instead of the actual `socket_body_written`;
  corrected and reran. The controlled timeline waits for server finalization explicitly: real
  client receipt can race handler-finalization logging, so the public semantics do not assume
  strict ordering between all client/server timestamps.
- Affected: **57 tests PASS**, 64.029 seconds (`affected.log`), diagnostics/policy/observer/witness,
  contract, HTTP and bridge. A later strict ID-length assertion (including trailing newline) is
  included in the full run, after the affected run.
- Official pinned MCP client **PASS** (`sdk.log`), protocol 2026-07-28, twelve tools, mark schema,
  response metadata, original-receipt replay and unchanged report/ack coverage.
- Probe overhead (`probe-overhead.json`): one isolated watch-mode task-list response used 885
  JSON bytes, of which optional request correlation added 72. Enter/return/exit marker result
  envelopes used 739/811/737 bytes and added three tool calls to one target call. These exclude
  HTTP headers, host wrapping, setup and latency; they are not a ChatGPT performance measurement.
  This supports sparse probes rather than adding markers to every production tool call.
- Inactive package rehearsal **PASS** (`rehearsal.json`, `rehearse.py`): verified bundle bytes,
  actual staged server processes, direct modern HTTP MCP, Codex Bridge adapter, separately spawned
  observer, three ordered phases with exact request join, lost-reply replay without another
  witness, watch/no incident creation, stable key and changed instance after restart, stale marker
  rejection. No active pointer, tunnel startup, live provider change or production registration.
- Full `scripts/check.sh`: **234 tests PASS**, 407.094 seconds, plus `git diff --check` PASS
  (`full-check.log`).
  The run emitted an unclosed-SQLite `ResourceWarning` during existing artifact tests; the same
  warning is present in the prior 0.1.8 full-check logs. It is recorded rather than hidden or
  attributed to this witness change.

The focused cases also cover concurrent duplicate delivery, retained payload conflict, evicted
replay refusal, run capacity, ring bounds, off with no lazy load, trace expiry/persistence/storage
failure, fresh authorization, invalid/extra/raw fields, principal scope, unchanged source/database
and operational receipt, no operational retries, detached active-request accounting, local socket
non-writer boundary, and malformed diagnostic metadata after normal dispatch. Existing regression
coverage retains report/incident/notification/ack semantics and recorder queue/drop accounting.
These are local harness assertions, not observation of the private ChatGPT runner.

**Resident remains unchanged:** 0.1.8, bundle
`8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`, controller PID 28483,
tunnel PID 28509, native-cgo/control-plane polling healthy (`resident-check.json`). The source
and installation are intentionally different generations. Installation is the explicit stop point.
After separate authorization, verify the approved checkout produces the candidate above, then use
`bash install.sh --root /data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`
and its `--check` path as documented in OPERATIONS. No config/provider options are required for
this already-watch installation. Outstanding effects must remain a blocking fence; do not force
through them or copy files over the live bundle. No installation command was executed here.

**Remaining acceptance/roadmap:** after a separately authorized install and fresh ChatGPT discovery,
verify inspection generation and metadata exposure; execute a short real physical cell with
enter → fulfilled real call → return witness → exit while the independent observer records.
Then collect the first natural visible divergence, preserve coverage/loss and the actual script,
and align the user-visible Stop/successor/resume timeline without inferring it from silence.
Classify only the positive execution frontier, compare a sparse probe with an uninstrumented
bounded workflow, then target the implicated response, continuation, scheduling or UI boundary.
Report/Stop/resume ownership remains separately qualified. Direct MCP and the bridge are a tdev
reference harness; neither the actual Codex agent loop nor real ChatGPT Code Mode is qualified by
this local rehearsal. tdev can preserve resume state and reduce round trips; it cannot guarantee
host scheduling, wake-up or user-visible progress over a stopped request/response channel.

## Caller witness resident update attempt — 2026-09-26

The user subsequently authorized resident replacement and commit/push. Fresh local and remote
`tdev` both named `6b891f884b738c6a35b9c87cbc15a8e59d51d54f`; tracked source was clean.
Candidate verification still matches the qualified 0.1.9 bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`.
The prior source qualification (234 tests, SDK, affected tests and inactive rehearsal) applies;
this installation attempt changes no executable code and does not claim a new full-suite run.

`bash install.sh --check --root /data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`
passed for the existing 0.1.8 controller/tunnel. The authorized install then returned
`OUTSTANDING_EFFECT` before the service transition. Read-only SQLite inspection identifies
validation `ce5e5082fe69457b8b148a382ad5d0f3`, task `93ebb4d236d2416ba6386b3f64ff8b1b`,
with status running/effect unknown. Its existing native result is terminal with exitCode 0,
timedOut false and cancelled false. Those process facts do not replace the controller's validation
reconciliation or prove the controller receipt is terminal. `Controller.status` normally invokes
that reconciliation; the installer correctly refuses the unreconciled row.

On resume the same blocker remained. This local session exposes no tdev MCP tools or configured
tdev MCP registration; the installation has no conventional connector.secret file. The missing
file prevented a local authenticated status call before any HTTP dispatch. No credential was
created, changed or extracted from unrelated state. The user was asked to invoke the existing
authenticated `tdev_operation status` for that operation or identify its existing bearer-file
reference. Do not directly edit SQLite, manufacture a terminal receipt, cancel/retry validation,
or bypass the installer's fence to finish an update.

Evidence remains at `.artifacts/host-witness-install-20260926-9v4_w7we/`: before binding/check/export,
failed install log, bounded process-result summary, and prepared `verify_installed.py`.
That post-install verifier has **not run** because installation has not completed. Config digest
is unchanged, no maintenance flag remains, and resident health still reports the previous bundle,
version 0.1.8 and PID 28483. No existing incident was acknowledged or deleted.

Next: reconcile through the normal authenticated status path, confirm no outstanding effects,
rerun the already-authorized installer, then the prepared installed readback and service check.
Record and publish actual installed acceptance afterward. The authorization persists; another
deployment approval is not required. Real ChatGPT mark/metadata/visible-control acceptance remains
separate and outstanding.

## Caller witness installed acceptance — 2026-09-26

This entry supersedes the preceding installation blocker. The user identified the existing local
bearer location; `.local/share/tdev/connector.secret` matched the resident principal hash and was
used in memory for authenticated loopback requests without printing, copying or changing it.
Normal `tdev_operation status` reconciled validation `ce5e5082fe69457b8b148a382ad5d0f3` to
succeeded/committed. Zero outstanding operations, unchanged config digest and exact candidate
bytes were confirmed before retrying the already-authorized installer. No direct database edits,
forced fence bypass, cancellation or execution retry were used.

The installer successfully replaced the owned controller/tunnel with **0.1.9**, bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`, executable source commit
`6b891f884b738c6a35b9c87cbc15a8e59d51d54f`. Checkout at installation was `986e4ae`, which only
adds documentation. Controller PID 21787, tunnel PID 21798; native-cgo tunnel control-plane polling
and the separate `install.sh --check` pass. Watch remains enabled. Installation config digest is
unchanged; all **seven** existing incidents, their identities and acknowledgments survive.
Correlation key generation `7ca33a31371bbfad` is preserved; process instance changed to
`658aa49fc2d185c2`. No diagnostic storage errors were observed.

Evidence remains in `.artifacts/host-witness-install-20260926-9v4_w7we/`:

- `reconciled-operation.json`, `install-retry.log`, `after-check.json`: normal terminalization,
  successful controlled installation and service health.
- `live-acceptance.json`, `verify-installed.log`: exact installed file verification against the
  qualified source, config/key/incident preservation and a separate installed observer process
  (four samples, zero unavailable). Export reports absent/unrotated segments 1–3 explicitly;
  missing optional rotated files are not represented as complete historical coverage.
- `live-mcp-acceptance.json`, `live-mcp-verified.log`: actual authenticated modern HTTP tool
  discovery (12 tools including mark), inspection, ordered enter → real task-list await → return
  with exact response request reference → exit, then identical marker replay with no new witness.
  Final event IDs 78/87/92, referenced request 29, same process instance. No report/activate/ack
  calls were added by the acceptance; watch remained watch.
- `live-witness-observer-verified/`: independent installed observer recorded all three final
  witnesses; 30 samples over 15 seconds, zero unavailable, within the 8 MiB bound.

Two initial harness failures are retained: a four-second observation window ended before the
approximately five-second live task-list call returned; its marker existed in the later server
snapshot, but absence from those samples was a real coverage gap. The next harness read the old
output path despite writing a new observer directory. Correcting both the window and readback
path produced the passing run above. These are not hidden as successful tests or diagnosed as
ChatGPT stalls. They reinforce that absence of a marker in an undersized observer window does
not imply stalled continuation. The observed task-list latency is a workload fact for later
round-trip comparison, not a cause assignment based on this small probe.

No executable changes followed the previously passing 234-test full run, 57 affected tests,
focused checks, official SDK check and inactive rehearsal. This turn adds installed acceptance
and documentation only; `git diff --check` was rerun, not a redundant full suite.

**Next acceptance:** refresh ChatGPT discovery after this service replacement (the user's earlier
refresh preceded installation), inspect the new instance, and run a short real Code Mode cell
with the independent observer covering the entire workload. Verify whether the host exposes
response metadata and collect actual visible progress/Stop/successor/resume separately. Local
authenticated installed MCP success does not qualify ChatGPT UI continuity or its private runner.

## Bounded ChatGPT caller adapter — 2026-09-26

Starting local/remote `tdev` head: `a558164df7d3186cab3b11f93bc04898bf21fde8`.
The caller-side reference function and controller instructions live in `examples/chatgpt`.
No server code, MCP wire contract, installed runtime, observer, credentials or incident state
was changed. No C20/C22 or live Stop experiment was run. The product runtime version remains
0.1.9 because this change ships caller source and documentation, not a new runtime component.

The reference policy counts all nested attempts before dispatch and reserves sparse closing
witnesses within the same budget. A fresh JS realm resumes the remaining plan with a fresh
counter. A lost operational reply stops for original-identity reconciliation; classification/
output failures require review. Time limits apply only between awaits. The helper cannot force
ChatGPT to receive an outer result, schedule another cell, cancel execution or update its UI.

Executed focused check: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_chatgpt_cell -v`
passed one Python wrapper and all ten Node.js controller tests (Node v24.18.0).
Executed affected check: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_chatgpt_cell
test_contract test_diagnostic_witness -v` passed 12 Python tests, including those ten JS cases,
in 12.798 seconds. These use disposable fixtures, not the resident controller/observer.

Full `sh scripts/check.sh` passed all 235 Python tests (including the ten Node.js cases) in
871.671 seconds, with exit code 0 and the diff whitespace check passing. Its log and generated
ChatGPT handoff are in `.artifacts/chatgpt-cell-controller-20260926/` (untracked local evidence).
Standalone official SDK, installed Codex, inactive deployment rehearsal and real ChatGPT
acceptance were not run for this caller-only change. Affected tests include the existing
HTTP/bridge/witness/independent-observer fixture. Actual ChatGPT outer-result receipt, fresh-cell
scheduling and visible progress must be assessed during normal authorized work, not inferred
from the local 16/16/8 fake-tool test or from backend completion.

## Resident caller guidance and observer frontiers — 2026-09-26

Starting source/remote head: `cbabcfb5eb2b212468556ba8d466a5f6fa914cd7`. The user explicitly
requested applying the change to the resident and observer. Source 0.1.10 advertises adjustable
ChatGPT caller guidance through the existing operation-tool description, without imposing a
server limit or adding wire fields. The independent observer derives bounded per-generation
counters and latest run witnesses, labels retained baseline history, and preserves raw snapshots.
The continuous command is now source-owned at `scripts/tdev-observe`; it remains a separate
operator process with the existing retention settings. No private ChatGPT telemetry is claimed.

Focused checks passed: observer frontier/bounded observer/HTTP (15 tests, 43.089s) and continuous
observer fixtures (7 tests, 13.677s). The first combined affected run was interrupted with no
completion result; its leftover disposable observer was identified by its command and temporary
root, then stopped normally. Its files and the production observer were preserved. The resumed
combined run passed **34 tests in 50.111s**, including the ten JS caller tests. Official MCP SDK
and inactive staged-bundle restart/native recovery/artifact checks passed (exit 0), candidate
bundle `2379801775c3d8f2e3619e1c3295198cf4edaf05d42afb58e8d938a1dda9950a`.

Full `sh scripts/check.sh` passed **248 tests in 606.298s**, exit code 0, including the
Node.js caller checks and diff whitespace check. Installed acceptance remains pending. Evidence is in
`.artifacts/runtime-observer-rollover-20260926/`. The full log includes an unclosed SQLite
ResourceWarning during fixture garbage collection; the preceding 235-test baseline log also
contains this warning. It is not hidden as a clean warning-free run. No failed test has been
observed in the completed run.

Installer preflight found retained exec `2378f2a3f1cb47d1b0ca2f9a4e50d390` still marked running.
A normal authenticated operation-status read reconciled it to succeeded/committed, exit code 0.
No DB update, command relaunch or effect cancellation was used. The C20/C22 source segment
`20260926-160813-coarse-228cd9c7` was pinned and its previously reported SHA-256 reverified before
cutover preparation. Prior shortcut bytes and current observer settings were backed up.
