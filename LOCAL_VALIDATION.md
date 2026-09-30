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

## Explicit local CLI credential selection — 2026-09-27

Source base `650e1dd3843b3c74fc6e78ce91b23bfbdb6f7b33`, source candidate 0.1.15.
The fix adds --connection name/stable-ID for local MCP calls. Legacy default behavior remains;
only a missing default file offers a terminal picker. Insecure/invalid credentials never cause
fallback. Dedicated credentials require active state, known principal and matching private bytes;
the server checks current auth again. No effect is repeated after any server/transport error.
No wire/config schema or installed auth configuration changed. The source-backed CLI shortcut
uses this code without a resident replacement.

Evidence: `.artifacts/cli-credential-20260927/`.
Focused `test_cli.py`: **25 tests, OK, 13.077s**. Affected `test_connections test_bridge test_http
test_contract`: **27 tests, OK, 31.218s**, exit 0. The first full check stopped during
resident tests across a session transition: the process no longer existed, there was no terminal
summary or exit marker, and its partial `check.log` is not counted as PASS. A new detached local
check runner records `check-final.log`, `check-final.exit` and a completion receipt. Final `sh scripts/check.sh`: **307 tests,
OK, 543.729s**, exit 0, including diff whitespace check. Existing SQLite ResourceWarning
appeared during fixture collection; this is not a warning-free claim. No production rehearsal
was rerun for this client-only change; the existing installed read-only checks below qualify
the actual CLI path, not a server replacement.
Coverage includes same-owner replay across legacy/dedicated credentials, name/stable-ID selection,
missing default non-TTY failure, terminal pick/cancel, unknown/disabled/revoked/mismatched/missing/
symlink/public-mode selected files, legacy failures without alternate selection, server revocation
after local credential inspection, no timeout retry and rejecting the option for local mutations.

Actual source CLI read-only calls with --connection tdev_janmori succeeded against the existing
0.1.14 resident: twelve-tool discovery and workspace list. A real PTY showed diagnostics menu →
missing-default credential picker → q; cancellation returned 0 without MCP dispatch. No token
was printed, copied, regenerated or rotated; resident/Tunnel services were not replaced.

examples/chatgpt/JOURNEY.md prepares the real one-/two-project baseline prompt and separate
server/caller/observer/visible evidence requirements. It is not executed ChatGPT acceptance.
Read-only observer status at resume reports stopped, old PID 19489 and segment
20260927-140614-coarse-f0c3cdd7, 4,509 samples, historical unavailable/storage-errors 0, but last
sample approximately 14,000 seconds old. This is a live coverage gap, not evidence of present
availability. The observer was not restarted; actual host observation needs a running current
collector or an explicit coverage limitation. The first status read was incorrectly parsed as
JSON by the local inspection command; status is human-readable and the original output is
preserved. No product failure or secret issue was inferred from that parsing error.

## Installed packaging lifecycle acceptance — 2026-09-27

Source HEAD `746344d54293e38ae1164d1f7f2417231cb11663`; resident 0.1.14, active bundle
`e356a2c6aea607050e9124ef6be8276c779a2721f033ef8ac092423f27f2dbe3`.
Evidence and the local-only harness are in `.artifacts/installed-package-20260927/`:
`calls.jsonl`, `state.json`, `result.json`, run/lifecycle/archive/finish logs and exported files.
Run `pkg-465db7dbf0fb`, enrolled trial repo `p-db2cad4ec9177b4edb395216`, deployment
`767660ec696b2124e244f5e500952f8e`. All effects used existing owner delegation to a new local
project and a generated tdev-app service; no production controller/Tunnel/observer replacement,
credential rotation, policy modification, external Git publication or arbitrary deletion.

The CLI's fixed connector.secret lookup failed before HTTP because that file is missing in the
current installation. Inspection found an active dedicated owner credential for tdev_janmori.
The harness explicitly selected it, verified its configured hash/principal/state, read it privately
and used Bridge.forward's modern authenticated localhost HTTP path. No token was printed, copied
to clipboard, passed in argv or retained in evidence. Why the legacy file is absent was not
established; healthy Tunnel probes do not establish that the local CLI credential exists. Add
explicit connection selection rather than silently choosing another credential or rotating one.

Executed acceptance:

- Create isolated trial project under existing local-projects delegation; unchanged adopted
  `sh scripts/check.sh` validates source and exported package checks. Use reviewed Python layout,
  real public hash-pinned packaging 25.0 wheel and generated asset.
- Prepare/verify two service versions; close tasks, retire source/build/artifact-validation
  scratch and clean managed refs before release. Check live release header/body, dependency and
  asset. Update while verifying the next version with the previous service still available.
- Fresh HTTP connections observe the retained first version after rollback. Active/previous
  versions refuse prune while running and stopped. No new build request is issued by rollback;
  this run does not claim network denial or an instrumented absence of all network activity.
- A candidate passed verification on its separate port but intentionally exited at the trial
  deployment port. Release failed as expected, restored the earlier healthy service and retained
  the failed operation. No controller/other service crash was injected.
- Stop/start/remove; trial app-data sentinel survives. Export app source in 128-byte pages,
  assemble and check returned SHA-256; preview/prune only the trial artifact handles after removal.
- Non-service ZIP build and artifact verification use no service command, health port or target;
  export/hash verification and explicit pruning pass, with retained history.
- Reset all five trial task dependency environments through the supported API. An additional
  service package was released successfully after its own environment and execution scratch
  were retired, then removed and pruned. This closes the stronger runtime-independence check;
  the first service runs alone did not prove dependency-directory absence.

Final result: 70 trial operations, 69 succeeded and one intentional failed activation, no global
running/unknown operations at final readback. Trial deployment desired=removed, revision 8,
no running process. Trial data, enrolled initial repository, historical deployment copies/logs
and operation evidence remain by contract; they were not destructively swept. Artifact admission
advanced installed state from schema 3 to 5, so incompatible old bundles cannot be used for rollback.
The controller and both Tunnel connections remain locally healthy at 0.1.14.

A local harness state file briefly lost completed lifecycle fields when two independent phases
saved stale snapshots. Per-call append-only evidence and server receipts remained intact; these
were merged without reissuing effects, and final cleanup/readback ran sequentially. The durable
server, not that harness state file, is the result authority.

run.py, lifecycle.py, archive.py and finish.py each exited 0. These are installed acceptance
checks, not a new full deterministic-suite run; product code was unchanged. Documentation diff
checks pass. Actual ChatGPT host execution, visible continuity, cross-workspace acceptance,
controller crash qualification on the live installation, native-extension/Android packaging and
host-wide offline execution are not claimed. Earlier isolated fault/SDK evidence remains separate.

## Refreshed ChatGPT packaging/lifecycle requalification — 2026-09-30

The retained ChatGPT closeout task `152c039f710c466a83a72933b81b63f8` reports this run through
the actual refreshed thirteen-tool surface. On takeover, its terminal source/artifact validation,
original failed-switch receipt, removed deployment and pruned archive were read back from the
installed resident; those effects were not repeated. This verifies durable backend state, not
an independent capture of its ChatGPT declaration or visible UI timeline. The reported runtime was **0.1.22** / bundle
`ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`. It intentionally reuses the
2026-09-27 data-sentinel and broader fault evidence where the invariant was already established; it does
not relabel those older measurements as fresh. The purpose here was to prove the changed model-facing
surface, explicit deployment revisions and original-operation recovery against the installed runtime.
Bounded receipt details are in `examples/chatgpt/PACKAGING_ACCEPTANCE_20260930.md`.

The disposable project was existing local enrollment `p-db2cad4ec9177b4edb395216`. Baseline artifact
usage was zero and its historical deployment was already removed. A new managed service task
`df48138d4e6240fb8f58804952302402` integrated the previously reviewed fixture delta from the same
`9a335d2604fc2191c63f8d158a53da228cf155c7` base without replaying historical effects.
Source validation `476f9b583e64410ab1eeea8cb2848b41`, artifact `c7280fe6a9df4a5ba8af44a72a2d6103`
and artifact validation `ae2e4d7dc59b483988f8c8bd9e125e4d` succeeded. The retained artifact digest was
`de01f132bd1a5ac6f8d86336d02fa9b9cb029a3398aeae88280228f547ce1a84`; release created deployment
`f70af0ef214fc553722ce3fdf8b3ea6b` at revision 1 / release
`a73747e463c982300156ebb2d5dd4e1e8f1ca97d257699f959df03d33766bf45`, with HTTP health 200.
After source/build/artifact-validation scratch retirement and task environment reset, the same release
remained healthy and retained `dist/asset.json` exported as 32 bytes with SHA-256
`0ca9e98414b209833559f1c01bd92e29cc05a4ec2a69e1d2651244e33e3d8c78`.

An updated source produced validated artifact `46f30864143a4f599cb11c15a63dd03d` and updated the same
deployment with `expectedRevision:1` to revision 2 / release
`f45071e4ae65f968fd50376a30bcd7d96833ca888ec53b7226ea46986b937140`, still HTTP 200. Rollback with
`expectedRevision:2` restored the first retained release at revision 3 without a new build. A separately
validated artifact `2f831b3a3b80423dabe0405b810a9ceb` was designed to pass artifact validation on its separate port
but fail on the deployment port. Release operation `730a89f706e94c25ab6b070076de0782` initially returned
`DEPLOYMENT_RECOVERY_REQUIRED` with unknown effect. No replacement release was admitted. Status on that
same operation reconciled to `failed`, `effect:committed`, `DEPLOYMENT_INTERRUPTED` and `rolledBack:true`;
inspect independently showed revision 3 still on the first release, running and HTTP 200.

CAS lifecycle then stopped revision 3 to revision 4, started revision 4 to revision 5 with HTTP 200, and
removed revision 5 to revision 6. All new source/build/artifact-validation scratch was retired; the task
environment was reset, task closed and managed ref cleaned. All three service artifacts had empty pin
sets, were pruned with their exact preview tokens, and retained artifact usage returned to zero.
The earlier 2026-09-27 data-sentinel result remains the data-preservation evidence; this run did not
create a second sentinel.

A second managed task `5193628ef9b54e48b0b2804106090385` integrated the retained archive fixture on the
same base. Source validation `7796c59179e640aebd236184ac50ef39`, archive artifact
`b4c6e87b2eb1496181f4236fcd30eb50` and artifact validation `133336c54d2d4a1f857c58515c762b73`
all succeeded without a service command or health port. Manifest `dist/hello.zip` was 145 bytes with
SHA-256 `9eb80fac27052ec4a6bcb0fc6ed7542e200bbcd1be8de520cc4c4be59233eb85`; three 64-byte-bounded export
calls advanced 0→64→128→145 and reported that same digest. Its execution scratch/environment/ref and
retained artifact were then retired/reset/cleaned/pruned; final artifact usage again reported zero.

This closes installed queue steps 0–2 for the current surface. It is actual ChatGPT tool execution, but
it is not the separate whole one-/two-project development/deploy/reconnect journey and is not a
quantitative visible-continuity measurement.

## Installed handoff review and human-name recovery — 2026-09-30

### Fresh authority and starting frontier

The original `prj/tdev` checkout was old source with unrelated dirty changes; it was not changed.
Root navigation, README, affected architecture/contracts, IMPLEMENTATION_PLAN and operator update
rules were rebound in `prj/tdev-surface-redesign`, fast-forwarded to canonical
`055b97d534e06504e3a7db1eaeee0287d852bdf4`. Installed runtime readback was 0.1.22 / bundle
`ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`, with both connections healthy.
The historical managed-create publication `2531fb0f9bbd4aa584865f62898e1010` remained unknown/unknown.
The retained earlier ChatGPT closeout was reviewed and terminal receipts were read back, rather than
recreating its service/archive work. Its open documentation task is preserved, not silently closed.

### Fixture review and corrections

The handed-off source task `fee2f0d9bd904f6e8b14fe3a80a73e7e` and successful retained artifact
`f6307a0fe1a0479c8e4e498c29642cf2` were reused. The earlier literal-newline mistakes were already
corrected; their failed exec/source-validation/build receipts remain terminal history. Including
`check.py`, `test_app.py` and `scripts/check.sh` in the recipe is appropriate: the currently delegated
source/artifact policy requires that entrypoint, with static source checks and separate live artifact
checks. It is not a policy waiver or a build-success substitute for validation.

The original lock substring check could overlook malformed final bytes, and live dependency locality
was implicit. A genuinely strengthened second candidate checks exact lock bytes and rejects literal
`\n`, incorrect hashes and duplicate requirements; checks recipe/input/service metadata; proves
`packaging==25.0` imports from the artifact's Python directory; and verifies real HTTP status,
`X-Tdev-Release`, body identity/version and generated asset bytes. Source publication and artifact
validation remain independent receipts. The new candidate was validated/built normally; the successful
first artifact was not discarded. One local edit harness initially supplied a SHA-256 instead of the
Git blob OID for `before`; terminal `EDIT_CONFLICT` / effect none was retained, then corrected input
was admitted under a new identity. This and the earlier newline errors are fixture-authoring mistakes,
not product failures or ambiguous mutation retries.

### Installed lifecycle results

These calls used the authenticated localhost MCP bridge from Codex, not injected ChatGPT tools.
Requests were persisted before one dispatch; admitted running/unknown work was observed by its
original operation only. Private requests/responses and timestamps remain in
`.artifacts/installed-journey-20260930`; the compact public record is
[`installed-a1-20260930.json`](examples/chatgpt/installed-a1-20260930.json).

| Stage | Fresh result |
|---|---|
| Reuse original artifact | Artifact validation `ff41967b1ffe465aa7eebb17a2ac6d86`, exit 0, actual health/header/dependency/asset checks |
| Initial release | Deployment `1a7384347f050a137239369207c82093`, `expectedRevision:0` → revision 1; separate inspect and direct HTTP verify version one |
| Strengthened second source | Validation `1262b65ffa39416d9bbf58363b7f5976`, candidate `b37c6933b482a7ece331af1075c0330f8a537fcc`; managed publication readback exact; main unchanged |
| Second artifact | `5af26f5b3e8446a390ebc25cff16fe26`, digest `54872539bbfb7c83d4d7ed973cf582dd134a7e8e3b50ff585451af84139e80dd`; artifact validation `1c7adc5f1a864d0c96f3bc110fa2ec1d` exit 0 |
| Previous service during validation | Distinct validation port; direct HTTP version one before/after validation. Continuous zero downtime is not inferred |
| Update and rollback | Expected revisions 1→2→3, separate live identity/health readback; rollback reused retained first release without rebuilding |
| Owned supervisor crash | Exact process command/deployment ownership checked before one SIGKILL; fresh supervisor and child restored same healthy release |
| Bad activation | Separately validated artifact `ef52e8de66434bfbb7ade277241c5c34`; release `53de25feb715414ab42e9840af00c100` failed/committed, `DEPLOYMENT_NOT_READY`, `rolledBack:true`; original revision 3 healthy independently |
| Scratch independence | All stopped original/second/bad source/build/validation scratch retired, both task environments reset; version one still HTTP 200 |
| Stop/start/remove | CAS revisions 3→4→5→6; fresh `data/keep` sentinel preserved byte-for-byte after each stage; no running process after remove |
| Pin/export/prune | Active artifact preview pinned; second asset exported in two 16-byte pages, 32 total, stable SHA-256 `0ca9e98414b209833559f1c01bd92e29cc05a4ec2a69e1d2651244e33e3d8c78`; all three artifacts pruned only after empty-pin exact-token previews |
| Final owned state | Both source tasks closed and managed refs cleaned; retained usage 0. Project registration, data, release history, receipts and unrelated tasks preserved |

### Measured defect, insight and decision ownership

Observation: `find({project:"pkg-chatgpt-20260930-a1"})` returned none despite an enrolled project
and retained task; the exact private `.git` path returned the correct frontier. Direct cause: project
projection fell back to remote path instead of its policy-relative human name. Immediate fix:
derive that name from the already enrolled checkout/current root; retain the old exact remote alias.
General principle: a well-typed locator must refer to the same user-facing namespace at enrollment,
listing and continuation. A schema probe cannot prove runtime identity resolution. Related surfaces:
project list, terminal display and new-session task discovery. Architecture implication: derive names
in the existing project owner, keep IDs/CAS for concurrency, and never add a mutable current-task
pointer or fuzzy selection to conceal real ambiguity. Evidence strength: installed reproduction plus
restart/replay regression; post-activation installed lookup remains a separate readback below.

Removed choices: none in this patch; the earlier network/executor knobs remain absent. Added choices:
none; project/objective lookup already expresses the intent. Retained choices: exact project key/name,
label/state, explicit task start/predecessor, execution mode, revision/CAS and effect identity.
Internalized choice: local project display-name derivation belongs to the controller's enrolled
project/policy binding. No state or accepted receipt is rewritten, and duplicate names stay ambiguous.

### Qualification and visibility limits

Focused project/continuation tests: **7 passed**; affected project/continuation/surface/HTTP tests:
**33 passed**. `scripts/check.sh`: **332 tests passed in 900.906 s**, plus diff whitespace check.
Inactive bundle rehearsal passed with bundle
`cfe8abe4fa0896e625ef024983ad6a2ad9bf330120cbd070987f513cad584dff`: authenticated HTTP/restart,
retained artifact validation/export/prune, exact source publication and no production service changes.
Actual Codex app-server loader matched all 13 input schemas and effect-free probe calls; this is not
model-inference or ChatGPT rendering acceptance. Tool input schemas and the user's fixed annotations
are unchanged. The owned disposable journey ran on installed 0.1.22; lookup implementation is 0.1.23.

Backend receipts, local caller receive timestamps, MCP/Tunnel delivery and ChatGPT visible rendering
are distinct. The existing `visible_stall` caller report `f9162b133388b3afde97a53ec3e8f462` is not
converted into a backend failure. The independent observer reported stopped at takeover; this run
therefore has no continuous independent observer or new ChatGPT witness/UI timeline. Fresh ChatGPT
one-/two-project semantic continuation and measured visible progress remain open. A new API/admin
key is not required for this local qualification or ordinary installed continuation.

### Intermediate canonical publication and 0.1.23 resident readback

Qualified implementation/evidence was committed and pushed to canonical as
`aa3f60af318bd942a42cb0407319a61fb8b15597`. The owned resident update activated the qualified
`cfe8abe4fa0896e625ef024983ad6a2ad9bf330120cbd070987f513cad584dff` bundle and controller 0.1.23.
Both configured Tunnel connections subsequently reported healthy/running. Fresh bridge clients
verified 13 exact request-envelope tools and unchanged fixed annotations. Direct project-name
lookup returned both closed objectives as ambiguous; adding `label:"a1-source"` uniquely returned
the published/cleaned predecessor with no outstanding effects. The exact legacy remote locator
returned the same frontier. Configuration/profile hashes, enrollment count and the exact unknown
publication row were preserved; no maintenance/install journal remained.

A final cross-surface review then found new create/connect receipts still constructing `name` from
remote path directly, despite corrected current list/find projections. The 0.1.24 follow-up applies
the same project-owned projection at new receipt creation. Existing receipt bytes remain unchanged.
The restart regression now explicitly seeds a pre-fix path-valued receipt and proves exact replay;
existing create/connect tests also assert meaningful human names. Direct cause: two name projection
sites. General insight: current observation and immutable accepted receipt are different kinds of
truth; align new responses but never “repair” historical receipts by rewriting their bytes. No new
field, default, state format or selection policy is introduced.

### Terminal entrypoint finding

The installed `tdev` shortcut still imported the original old/dirty `prj/tdev/src` checkout.
A read-only `tdev ... --connection tdev_janmori project list` actually sent the old flat input and
received `SCHEMA`, effect none, from resident 0.1.23. No mutation was admitted. The shortcut's
old CLI also printed the MCP error without a failing shell status; the qualified CLI already has
proper envelope/error handling. This is a deployment-entrypoint mismatch, not failure of the new
runtime schema. The old source tree must stay untouched. After final qualification, relink only
the recognized owned shortcut to the qualified checkout using the existing `tdev link` owner;
keep its old bytes in private evidence and verify the same terminal read succeeds.
General principle: source, resident, discovery and local command binding are independent version
frontiers. Canonical publication or healthy server alone does not prove a human entrypoint is current.

### Final 0.1.24 source qualification

The receipt-alignment change passed focused **8 tests in 30.392 s**, affected **33 tests in
129.468 s**, and a new complete `scripts/check.sh` run: **332 tests in 1009.823 s**, plus the
whitespace check. No source changes followed that run. Its inactive bundle rehearsal passed as
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56`, including HTTP/restart,
retained validation/export/prune and exact source publication, with no production service changes.
The tool contract is byte-identical to the earlier 0.1.22/0.1.23 thirteen-tool contract; the recorded
actual Codex loader check is reused for that unchanged input surface, not claimed as a new model run.
Private focused/affected/full and inactive receipts are under `name-receipt-*` in the takeover
evidence directory. The existing actual host continuation guide now starts with a bounded
read-only human-name check; the complete two-project workload remains separate.

### Final canonical/resident/terminal acceptance

Fresh canonical readback matched `dc743395726925b14e34720f6eea005e69a0b719` after the qualified
0.1.24 implementation was pushed. Before activation, the staged file digest matched the inactive
rehearsal exactly, and the maintenance frontier contained only the independently reviewed historical
managed-create publication. Its repository identity was read back as `humtr/tdev`, GitHub ID
1322208918, and its exact managed ref was absent; absence was not treated as failure or success.
The authorized update exempted only `2531fb0f9bbd4aa584865f62898e1010` while preserving it unknown.

The resident activated bundle
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56` / controller **0.1.24**.
Both configured connections were separately observed healthy/running after startup; each credential
also successfully authenticated a local project-list MCP read. Before/after checks matched every
captured configuration, connection credential/header/profile file, stable connection identity and
runtime identity, and the entire historical unknown operation row. No other running/unknown effect,
maintenance flag or install journal remained. The fresh owned app-data sentinel was still intact.
Live tools/list was byte-equal to the 0.1.23 catalog, including the user's fixed annotations.

Fresh bridge clients again resolved the human project + source label to the closed published
predecessor with no outstanding operation, while the project-only query honestly remained ambiguous.
The recognized owned Termux shortcut was backed up privately and relinked using the existing CLI
owner to `prj/tdev-surface-redesign`; the same project-list command that previously returned SCHEMA
then succeeded with a human project name. No original dirty source, credential, grant, unrelated project source,
retained unknown effect or prior ChatGPT documentation task was overwritten/cleaned.

These results are reflected in the compact public packet. This remains local installed control-plane
readback; it does not claim a new actual ChatGPT call, successful Connector Refresh, host scheduling
or visible UI progress. The actual fresh-session request was supplied to the user; until its result
arrives, that acceptance and the complete one-/two-project ChatGPT workload remain open. Ordinary
continuation uses the existing installation; no new OpenAI admin key is needed.

## Whole-roadmap review — 2026-09-27

Reviewed at source/canonical head `aa250a66bda9e152f06bea80f17ede4a6c7251e0`.
Compared README, AGENTS, plan, relevant architecture and tool contracts against artifact,
validation and deployment dispatch, the Python package example, isolated rehearsal source and
prior recorded acceptance. This is a scoped plan/evidence audit, not a fresh whole-source defect
review or rerun of historical live acceptance.

The execution owner now has one ordered queue: installed packaging and lifecycle acceptance,
baseline whole ChatGPT journey, measured friction fixes, then conditional semantic notes and
additional package/resource adapters. It removes obsolete installation/diagnostic/connection
implementation prerequisites and separates server freshness from visible continuity. Existing
packaging and note specifications remain; no new authority document or wire schema was added.

Read-only `tdev status` reports controller up/version 0.1.14 and locally healthy running
connections `default` (bearer) and `tdev_janmori` (no-auth). No real workspace/host delivery
acceptance follows from that observation. This review changed no runtime, credentials, services,
observer or user work. Previously recorded 300-test qualification belongs to the executable CLI
change, not to a new test run. This documentation-only review checks diff whitespace, Markdown
local links/anchors in the edited plan/status documents and coherence with the scoped contracts;
focused/affected/full executable suites and live rehearsals were not rerun. No version bump.

## Numbered local CLI menus — 2026-09-27

Fresh local/canonical/remote head: `317b407b7691e26adda8a55662017f8f7c8043bc`.
Source 0.1.14 adds category navigation and stable-ID connection selection over the existing
CLI dispatch. No MCP wire, authentication or resident lifecycle behavior is changed.
Unrelated artifacts/node_modules are preserved. Evidence: `.artifacts/cli-menus-20260927/`.

- Focused: `PYTHONPATH=src:.tdev-deps python -m unittest discover -s tests -p test_cli.py -v`,
  **18 tests, OK, 11.280s** (`focused-final.log`).
- Affected: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_connections test_installer_setup test_observer_continuous test_contract test_bridge -v`,
  **41 tests, OK, 29.853s**, exit 0 (`affected.log`, `affected.exit`).
- Full: `sh scripts/check.sh`, **300 tests, OK, 754.671s**, exit 0
  (`check.log`, `check.exit`), including the diff whitespace check. Existing SQLite
  ResourceWarnings appeared in fixture collection; this is not a warning-free claim.

Tests exercise terminal navigation/back/quit, invalid choices, EOF/interrupt without effects,
empty connections, stable-ID selection and installation root preservation, destructive-action
confirmation, single diagnostic/observer dispatch, non-terminal help with no calls/writes,
and contract-valid observation arguments. The first focused run caught a project-menu prompt
incorrectly asking for owner/repo; the wire contract instead requires a registered repository ID.
The corrected prompt and contract check pass; the initial failure remains in `focused.log`.

Real Termux PTY checks used the installed `tdev` shortcut: root menu → exit, connection menu →
authentication action → existing default connection picker → back → quit. No mutation was
selected. Non-terminal `tdev help` also passed. The shortcut loads this checkout, so menus are
available immediately without service replacement. Read-only `/healthz` now reports an existing
resident **0.1.13 / up**, differing from the prior qualification note's 0.1.11. This session did
not perform that update, any mode/token change, clipboard write, or observer start/stop.
No additional pinned-client, SDK or deployment rehearsal was run for this navigation-only
change; existing connection tests cover compatibility. Real ChatGPT multi-workspace acceptance
remains separate and outstanding.

## Local CLI and multiple Tunnel connections — 2026-09-27

Fresh source/canonical/remote head: `302c91bf57d313e071bfc2a281514ee73838e6ee`.
README/AGENTS, authentication/resident architecture, config/tool contracts, execution order and
installer/resident/core source were rebound. The subsequent user requirement adds a local CLI
rather than requiring users to assemble install.sh options. Source 0.1.13 adds connection-owned
lifecycle and additional credentials mapping to the existing owner; the original compatibility
secret remains unchanged. No new MCP management endpoint or per-workspace RBAC is introduced.

`./tdev link` installed an owned command at `$PREFIX/bin/tdev` and `tdev help`/`tdev status`
readback succeeded. The command points at this checkout, not a replacement resident bundle.
Read-only production status still reports 0.1.11 / watch and the existing default Bearer Tunnel.
No production update, connection migration, mode switch, token rotation, clipboard write or
observer restart was performed. Existing artifacts, node_modules, profiles and observations survive.

Focused CLI/connection checks passed **24 tests in 37.949s** on the final executable source. Earlier affected CLI, connections,
setup, admin, resident, HTTP and contract checks passed **63 tests in 99.385s**; subsequent focused
coverage adds the friendly no-auth spelling, malformed profile/credential rejection, standalone
expanded tool schemas, and status refusing to claim an unowned listener as healthy. Full
repository validation passed **291 tests in 765.003s**, with `OK` in check-final.log. Both
staged and unstaged `git diff --check` passed after completion. The original process handle
was unavailable after session resume, so a separately retrieved process exit code is not claimed. Evidence is in
`.artifacts/multi-connection-20260927/`.

Coverage includes multiple credentials sharing one owner/workspace/replay, real HTTP revocation,
compatibility token preservation, dedicated disable/revoke/rotate/remove, mode header scope and
secret preservation, no restart of unrelated services, same shared runtime-key source preservation,
rename identity, zero-connection install, update/uninstall, crash after revocation or rotation,
failed stop, config CAS conflict, remote health degradation, old-bundle rollback rejection and
security-snapshot rejection. CLI tests cover all-tool forwarding, exact request identity/no retry,
nonzero tool errors, non-TTY help, guided installation, shortcut conflicts and explicit token
clipboard/fallback delivery. Existing real PTY/clipboard timeout/secret-input tests remain covered.

The first affected run found that old inactive bundle fixtures lack a config schema; compatibility
validation was limited to present schemas while new connection state still requires a capable
bundle. This failure is preserved in affected-initial.log. The initial inactive rehearsal reached
native recovery/artifact checks but failed its synthetic launcher settings, which omitted Tunnel
ID. The fixture now supplies the required legacy identity; no production validation was weakened.
The successful inactive rehearsal is in rehearsal-final.log, bundle
`ea36092b8754162777468e3d6b6cf624d1800acad8746702c5f22426de0ffd3c`. After final CLI changes,
both inactive and real-runit rehearsals passed again against the same final bundle
`95b3bb5e7a0748c4e29712e809f5575239e7b709eb87f937f4d07c3cd2cb96dd`
(rehearsal-qualified.log and services-qualified-final.log).

The initial full run was deliberately interrupted (exit 130) after the CLI review found two
additional improvements: binding status to installation process identity and expanding schema
references. It is retained as check.log, not counted as PASS. The new status fixture initially
lacked an installation identity and inherited the live supervisor path; its corrected fixture
now has explicit identity and a disposable SVDIR. The final focused run above passes. Full
validation of the final source is in check-final.log. It includes the existing unclosed SQLite
ResourceWarning from fixture collection; this is not claimed as a warning-free run.

Pinned native tunnel-client 0.0.14 forwarding checks passed both profiles: no host credential
succeeds in compatible mode and fails in Bearer-required mode; valid Bearer succeeds in both and
invalid Bearer fails in both. Startup discovery and all twelve-tool discovery/call remain valid;
local auth/Host/Origin and secret scoping checks pass. Official MCP SDK 2.0.0 also passed.
These are local mock-control-plane tests, not real ChatGPT or cross-organization acceptance.

Real isolated runit rehearsal passes multiple simultaneous client processes, connection mode
change/disable/rotate/enable/remove, unrelated controller/client PID preservation, common update,
intentional DOWN, root-monitor recovery and uninstall. Its Tunnel executable is a process fixture,
separate from the actual pinned-client forwarding check. Production services are not involved.
Real independent OpenAI account/workspace connections and ChatGPT connector UI acceptance remain
outstanding; local credentials do not attest a Tunnel path or user-visible progress.

## Interactive installation and Tunnel local authentication — 2026-09-27

Fresh local/canonical/remote `tdev` head: `7f62191ca40a5f24fc379a4a950737b364753d41`.
README/AGENTS, installer/auth/resident architecture, config and MCP contracts, implementation
order, operations, installer/admin/resident/server source and their tests were rebound from source.
No managed-task-only publication rule is present for this authorized local checkout work.
Existing untracked operator artifacts and node_modules are preserved.

The actual pin remains tunnel-client **0.0.14**, Go module source commit
`0f870e50a973fa820d4c409000059e181e8d242b`. Reviewed its configuration guide, runtimeconfig
file-reference loading, static/forwarding round-tripper order, startup probe and Unix socket
support. [Pinned configuration](https://github.com/openai/tunnel-client/blob/v0.0.14/docs/configuration.md)
documents local MCP/header scopes; implementation applies connector headers last, overriding
static headers case-insensitively. Whole-header `file:` values require a private derived header
file, while connector.secret remains the existing raw token format for other clients.
The [current OpenAI Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
requires organization/workspace association and Tunnels Read/Use; the
[connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) describes private
developer-mode Tunnel connections. This is documented admission policy, not a live cross-account
penetration test or proof that every ChatGPT UI offers the same authentication controls.

Source **0.1.12** implements missing-input-only TTY setup, hidden runtime-key entry, default
Tunnel-local auth and explicit Bearer compatibility. Complete CLI inputs do not prompt.
Preexisting config/profile adoption retains the old Bearer default; resident updates retain
the exact profile and credentials and reject mode selection. Profiles with custom MCP headers
are rejected for adoption rather than silently rewritten. New personal Tunnel mode shares one
local principal and adds no grants. Direct localhost remains authenticated. Unix sockets are
supported upstream but would require tdev server/readiness/bridge changes, so they and per-user
OAuth are deferred. No MCP/config wire shape or state-schema migration was required; the new
optional resident setting is installer-owned. The patch version changes for delivered installer code.

Two adjacent defects were corrected: input validation now matches the pinned client's exact
Tunnel ID format, and first initialization can finish an interrupted secret/config pair without
rotating its secret. Missing config for an existing state DB is rejected. Pending setup metadata
contains no credential bytes; interruption/retry preserves auth mode and file identity. Clipboard
uses stdin and a bounded private process group; unavailable/failed/timed-out API is nonfatal.
The installed Termux clipboard wrapper's stdin path was read directly; the real device clipboard
was not overwritten by tests.

Focused TTY/setup checks first passed 13 tests in 3.291s; the expanded setup and lifecycle run
passed 15 in 49.520s. After final input/clipboard changes, affected setup/admin/resident/HTTP
checks passed **40 tests in 85.206s**. Coverage includes real PTYs, hidden key input, invalid ID
retry, EOF, echo restoration on interrupt, non-TTY behavior, main-entry install/failure/retry/update,
credential permissions/mismatch, clipboard success/failure/absence/timeout, and auth-file preservation
through first-install failure, update, rollback, uninstall and reinstall.

`scripts/check_tunnel_auth.py` passed using the actual pinned native binary against a disposable
real tdev server and local mock control plane. Both generated profiles complete authenticated
startup `server/discover` (HTTP 200), tools/list (12 tools) and tools/call. No-host-Bearer requests
succeed only in Tunnel mode; missing host Bearer in compatibility mode and wrong incoming Bearer
in either mode return 401. Case-insensitive incoming Authorization precedence is exercised.
Direct localhost missing/wrong credentials fail; Host/Origin and owner principal mapping remain
correct. The internal secret is absent from upstream requests/responses and ordinary client logs;
the separate runtime key is absent from local MCP requests. Early harness failures were fixture
errors (invalid sample ID, metadata GET consuming queued commands, and an incomplete startup-probe
assertion); corrected checks assert successful modern discovery rather than equating a rejected
initial probe with the complete discovery outcome. No server protocol downgrade was introduced.

Official MCP SDK 2.0.0 checks passed. Inactive bundled native recovery/artifact/HTTP rehearsal
passed, candidate `57623fc946f6d3ed423988b59b417a7d1555d0302f5bc45c572e4162db0c3f1a`.
Real isolated runit rehearsal passed service and root-monitor crash recovery, update, intentional
DOWN and uninstall, preserving all internal-auth files. Its Tunnel process is a fixture;
the separate forwarding check above uses the actual binary. No production services were touched.
The first full `scripts/check.sh` run was interrupted before a completion result. Its log is
preserved as `check.log` and is not counted as PASS. The resumed full `sh scripts/check.sh`
passed **267 tests in 710.903s**, exit code 0, including the diff whitespace check. Its log is
`check-resumed.log`. Both logs include the preexisting unclosed SQLite ResourceWarning in test
fixture collection; this is not represented as a warning-free run. The qualified source is
0.1.12; the existing resident remains **0.1.11 / watch**, with its profile, credentials and
independent observer unchanged. Source publication does not constitute resident deployment.
Evidence: `.artifacts/installer-auth-20260927/`.

Real ChatGPT no-custom-credential discovery/call acceptance on a newly configured Tunnel remains
outstanding. Local mock-control-plane success does not prove OpenAI account admission, current
ChatGPT UI availability, same-turn liveness or per-user identity. Existing resident authentication
must not be implicitly migrated to obtain that acceptance.

## Native working-budget propagation — 2026-09-26

Starting source/remote head: `d10a2b1cec56390547a531c673ad044b6e09cc83`. The installed
0.1.10 config selects `artifactLimits.workingBytes=536870912`, but ordinary native launch
omitted the field. Consequently the child used the 128 MiB fallback for `RLIMIT_FSIZE` and
sampled working storage. Source 0.1.11 passes only the selected workingBytes into new native
command/process/source-validation payloads and retained intents. It does not change config,
remote execution, source-capture limits, old accepted payloads or replay ownership.

The regression was demonstrated before the fix: three tests failed (five subtest/failure
reports), including all three execution modes, frozen budget and aggregate storage enforcement.
After the fix, four focused tests passed in 17.020s. They verify the real child's rlimit and
creation of a 173,101,495-byte regular sparse file via ftruncate, default-limit EFBIG, retained
budget across config change/reconnect/replay, and two individually smaller files exceeding the
aggregate budget. These fixture files are disposable; no user rollout file was accessed.
Affected native/environment/recovery/contract checks passed **46 tests in 93.797s**.

Inactive staged-bundle rehearsal passed (exit 0), including native crash/reconnect without
relaunch, exact publication, retained artifact build/validation/export/prune, HTTP authentication
and twelve-tool discovery across restart. Candidate bundle:
`06023908919bafac20b372beea579c4c5fa7af146121d301727d20b0e9f3cf24`.
Full `sh scripts/check.sh` passed **252 tests in 608.680s**, exit 0, including the diff
whitespace check. Its log contains the previously observed unclosed SQLite ResourceWarning
from fixture collection; no test failed. Installed acceptance follows below.
The separate official SDK check was not rerun: wire input/output shapes are unchanged, and the affected
contract tests plus staged HTTP checks cover the changed description and native payload.
Evidence is in `.artifacts/native-workingbytes-20260927/`.

Source commit `b820136f251295af1159805039cd803636043757` was pushed to `origin/tdev` before
cutover. An unrelated existing operation `d88b210abfe44e32824af1b1356175c8` remained genuinely
running, with recent output; installation waited. It later finished failed, exit code 1, observed
through normal authenticated operation status. This is not a failure of the above fixture suite.
No operation was cancelled/relaunched and no state DB rows were edited to bypass installation.

The controlled installer and subsequent `--check` passed. Resident **0.1.11 / watch** runs the
exact qualified candidate above; installed file hashes match source. Controller PID 20233,
native-CGO tunnel PID 20251, successful control-plane polling. Config hash is unchanged, including
workingBytes=536870912. Seven prior incidents/ack states and the correlation key are preserved;
storage error counters are zero. Authenticated discovery still exposes twelve tools.
New diagnostic instance `d90790a695741dcf` replaces `4a6f9860d32b9ba5`.
Absent rotated logs remain explicit export coverage gaps.

An isolated fixture using the actual installed bundle and copied workingBytes setting exercised
ordinary native exec: it wrote 173,101,495 bytes of authored data, copied through a symlink into a
regular file, compared SHA-256 content and removed only those fixture files. The child reported
both RLIMIT_FSIZE values as 536870912 and completed successfully. This is installed-code/native-child
acceptance, not a live MCP task or a copy of the user's rollout. The source-capture boundary is
unchanged. Results are in `installed-copy.json` and `installed-acceptance.json`.

The independent observer PID 19489 continued without restart, sampled the new runtime instance
and recorded one generation change with no observed unavailable samples, storage errors or
event gaps. Its pinned 0.1.10 sampler remains compatible; no observer source changed in this fix.
Sampling cannot exclude an inter-sample outage or establish ChatGPT visible delivery. Details are
in `observer-after.json`; installer/check output and before/after diagnostic exports are retained
alongside it. Only documentation changed after qualification, so whitespace checks were rerun
without repeating the full executable suite.

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
Node.js caller checks and diff whitespace check. Installed acceptance follows below. Evidence is in
`.artifacts/runtime-observer-rollover-20260926/`. The full log includes an unclosed SQLite
ResourceWarning during fixture garbage collection; the preceding 235-test baseline log also
contains this warning. It is not hidden as a clean warning-free run. No failed test has been
observed in the completed run.

Installer preflight found retained exec `2378f2a3f1cb47d1b0ca2f9a4e50d390` still marked running.
A normal authenticated operation-status read reconciled it to succeeded/committed, exit code 0.
No DB update, command relaunch or effect cancellation was used. The C20/C22 source segment
`20260926-160813-coarse-228cd9c7` was pinned and its previously reported SHA-256 reverified before
cutover preparation. Prior shortcut bytes and current observer settings were backed up.

## Resident caller guidance and observer installed acceptance — 2026-09-26

Source commit `753c895` was pushed to `origin/tdev` before the authorized cutover. The controlled
installer and separate `--check` passed with resident **0.1.10 / watch**, bundle
`2379801775c3d8f2e3619e1c3295198cf4edaf05d42afb58e8d938a1dda9950a`.
Controller PID 12847; native-CGO tunnel PID 12863 with successful control-plane polling.
Installed files match the qualified source exactly. Config SHA-256 is unchanged, all seven
prior incidents and acknowledgment states survive, and the correlation key is preserved.
New process witness instance: `4a6f9860d32b9ba5` (previous `658aa49fc2d185c2`). Existing old-instance
witness arguments must not be reused after this restart. Authenticated HTTP discovery returns
all twelve tools and the new operation-tool caller guidance. No new marker experiment or
incident report/ack was performed. Optional rotated logs absent before and after export remain
explicit coverage gaps, not a claim of complete tracing. Diagnostic storage errors were zero.

The existing coarse observer ran through the resident replacement and sampled the new instance
before its own controlled update. The cutover segment contains 108 old-instance samples and six
new-instance samples, with no unavailable sample observed (sampling cannot exclude a shorter
inter-sample outage). Its last segment was gracefully closed and its SHA-256 checked;
current/prior cutover segments and the historical boundary segment were pinned. The private
command now matches `scripts/tdev-observe`, revision 2, SHA-256
`1481c5f2dfec385d8490b3baf92d5639ca7bd6b5e0edc6203c8a804121dc1aaf`.
New independent worker PID 15003 uses the exact installed sampler bundle. It retains 10-second
sampling, hourly/64 MiB rollover, 24-hour/512 MiB retention with KEEP exemptions; fine mode was
inactive and was not started. The old-last/new-first sample interval was **2.660422707 seconds**.
First sample contained the expected frontier/instance with zero unavailable/storage errors;
a later nine-sample readback also had zero unavailable, storage errors and event gaps.
Observer process restart establishes a new baseline, so its generationChanges counter begins
at zero; the cross-worker transition is documented here and in the cutover evidence packet.

Evidence: `.artifacts/runtime-observer-rollover-20260926/` contains the full/affected/SDK/rehearsal
logs, before/after diagnostic exports, installer/check output, installed-acceptance.json,
observer-cutover.json, prior shortcut bytes and preserved-boundary-evidence.json. Existing user
observations, credentials and unrelated files were preserved. The pre-update script backup can
be restored independently of the resident; production rollback still uses the installer.

Real ChatGPT discovery must be refreshed to receive the updated tool description. This only
publishes caller guidance; it cannot force the assistant to use the helper, issue another cell
or update the visible UI. Existing full controller instructions and helper remain the executable
reference. Real ChatGPT scheduling/visible continuity remains outstanding and is to be assessed
during normal authorized work, not another density or Stop experiment.


## Real ChatGPT successor-cell visible divergence — 2026-09-29

During normal authorized `humtr/tdev` work, the user reported that the visible ChatGPT surface
stopped after the host/tool-group label "Ran focused diagnostic policy test and checked operation
status". A fresh durable task inspection after that report showed later work had nevertheless
continued on the same source task: request `exec-wait-successor-first-probe-20260929`, operation
`0a5acea60d2c4dbc9147d92527c1bf96`, was already `succeeded` / `committed` with exit code 0,
and the task checkpoint had advanced to `04deda988d6417d5ff3b194465e4d03ff49e53c1`.
No standalone assistant progress commentary was inserted between that probe's admission and its
first two status cells. This therefore disproves a stronger hypothesis that a standalone progress
message is required for the visible continuation loss. It does not identify which ChatGPT host/UI
stage failed; tdev backend completion is not proof of visible delivery.

Attempts to hide successor scheduling by performing multiple 30-second status waits inside one
physical Code Mode cell were also not a safe workaround in this run: larger multi-wait cells hit
the outer Code Mode cell timeout, while a single `status(waitMs=30000)` physical cell repeatedly
returned current backend progress. The caller helper default was therefore restored to one
bounded status call per physical cell; same-operation identity, output cursor advancement and
no-replay semantics remain unchanged. Ordinary ChatGPT command/source-validation admission may
still send explicit `waitMs=30000` once the refreshed connector schema exposes that source
contract. The currently connected ChatGPT-side `tdev_exec` schema did not yet accept `waitMs`
during this evidence run, so source implementation and live connector acceptance remain separate
acceptance facts.
# Surface redesign review — 2026-09-30

**Status: source 0.1.22 implements the selected thirteen-tool design; final local qualification
passes 331 tests, actual Codex/SDK and inactive bundle checks. Selected find/start/release and
final command/process host probes pass their reported checks. The production resident is unchanged.** This section records evidence/candidate analysis, not a replacement
for ARCHITECTURE or the canonical contract. The first user-supplied fresh ChatGPT report confirms
useful nested typing but finds a task-start branch collapsed to `Exclude<any, any>`. The user
requires host evidence before broader implementation; the revised B2 typing gate passed in the user-supplied fresh-host report. No passing schema test below
is represented as ChatGPT acceptance or measured model accuracy.

## A. Fresh authority and current state

- Entry checkout: `/data/data/com.termux/files/home/prj/tdev`, local branch `tdev`,
  `0f6b78e18ec6abfad830bfd8e65917c7c128149a`, source 0.1.16, with substantial pre-existing
  installer/observer/source/document/test changes. All were preserved.
- Fresh remote `refs/heads/tdev`: `b418c1ddb97af052f80430f3d55802cf3060cfe2`, source 0.1.21.
  `origin/HEAD` points at historical `development` (`afd2853...`); it is not this product's
  development authority. The resident's enrolled tdev repository independently reports
  `refs/heads/tdev` at `b418c1d`. Rechecked unchanged after key setup.
- New isolated worktree: `../tdev-surface-redesign`, branch `redesign/surface-20260930`, based
  on that exact tdev commit. AGENTS, README, applicable ARCHITECTURE semantics, canonical input
  definitions and IMPLEMENTATION_PLAN were rebound there after detecting the stale checkout.
- Resident: 0.1.21, bundle
  `635c8080c9e21a459099bc4e10f0e14d36515ad606d89094a87f7799583f8441`, controller up, diagnostics
  watch. `default` (bearer) and `tdev_janmori` (Tunnel auth) locally healthy/running. This is
  runtime observation, not a claim that this Codex conversation has their tools injected.
- At 03:40:08 UTC: 43 open / 72 closed tasks, 2,088 succeeded / 322 failed operations,
  one unknown publication `2531fb0f9bbd4aa584865f62898e1010` on task
  `0fc0709559c940589a0a54808dfa849c`. Earlier read-only observation showed one running
  validation and 44 open tasks; another actor's work completed between reads. Neither was
  restarted, cancelled, reconciled or closed by this review. Counts are timestamped facts.
- Source and resident contract SHA-256 both
  `35ea0a5ed2d7d7d85957117e85e72d2fb7f0e0640156cf2e4908ea54adf9bebf`.
  Authenticated resident `tools/list` equals the expanded source advertisement and the local
  legacy bridge representation. Raw captures and timestamped state are in
  [probe evidence](examples/surface-probe/evidence/authority.json).
- The same contract was fetched without authentication from public GitHub at the exact commit;
  bytes match. The probe exposes only derivatives of that public schema. It has no resident,
  project, state, command execution or credential-reading path.

Owners remain README (status), ARCHITECTURE (meaning), `contracts/tools.schema.json` (wire),
IMPLEMENTATION_PLAN (sequence). No old chat/handoff/version or historical tmcp design was used
as current authority. The user explicitly reconfirmed the fixed host annotation profile,
including `readOnlyHint=true`, to avoid repetitive permission popups. Preserve it. Changing
these hints is outside this redesign unless the popup behavior is first solved and qualified.

## B. Workload and state model before tool names

The natural responsibilities are discovery of an authorized target, selection/creation of
isolated work, observation of immutable source, source changes, execution intent, observation
of an admitted effect, mandatory candidate verification, exact source publication, retained
artifact production/verification, deployment switching, current health observation, and owned
cleanup. A transport connection and an assistant conversation are not work owners. Workspace
membership is useful composition and never an authority grant or mandatory user ritual.

The durable transitions must remain distinct:

`source changed → tested → candidate validated → source published`

`candidate validated → artifact built → artifact validated → deployment switched → health observed`

These are dependencies, not an automatic workflow: publication is not required for every
local artifact deployment; source-only deployment remains a meaningful distinct strategy.
No automatic validate/publish/deploy chain is proposed. Tests run by `run` cannot substitute
for adopted mandatory validation, and healthy-now is a time-bounded observation, not a durable
property of an old successful release receipt.

Stable identities belong at task/source CAS, effect admission, validation candidate, artifact
content, deployment revision and cleanup ownership. A new domain-specific job hierarchy adds
no demonstrated value. Keep a common durable operation receipt for accepted asynchronous
effects; give source/artifact/release receipts explicit subject types inside it.

## C. Current surface audit

The [generated field inventory](examples/surface-probe/generated/field-inventory.json) contains
every current branch, its full field schemas, required list, nested schemas and conditionals.
The following table summarizes responsibilities and candidate disposition. Root counts are
**advertised property counts**; action counts expand enum arms and subject variants.

| Tool | Variants / root fields | Effects and composition | Principal problem / missing decision | Proposed disposition |
|---|---:|---|---|---|
| workspace | 7 / 13 | list/inspect plus composition mutations; root canonical union, flat discovery | Membership/default rules hide behind broad lifecycle description; no name lookup; default space is useful controller work | Split observations; keep explicit composition mutations and automatic default space |
| task | 9 / 21 | list/inspect, start/open/compose/integrate/close/ref cleanup/environment reset; nested conflict resolutions | Start versus resume versus canonical-ref open; label becomes sanitized ref fragment; cleanup domains mixed | Split discovery/inspection/cleanup; retain source lifecycle and explicit source strategy |
| read | 1 / 4 | Read-only immutable snapshot; typed query-array union | Overlaps the word “inspect” but source content has distinct batching/checkpoint semantics | Keep; do not merge source bytes into generic resource inspection |
| edit | 1 / 4 | Atomic mutation; typed edits-array union, before hashes and checkpoint CAS | Input already expresses real decisions well; result needs compact continuation | Keep and improve result projection |
| exec | 1 / 12 | command/process modes, source capture versus fixed source, staged stdin; bounded wait | Flat fields permit irrelevant capture/wait options in process mode; long host instructions embedded in description | Rename run; discriminate command/process requests; retain meaningful environment/timeout/capture choices |
| operation | 4 / 11 | status, sequenced stdin, cancel, retire; locator exclusion lost in advertisement | Observation, process control and storage retirement mixed; “status” can advance recovery effects | Split observe/control/cleanup/recover; preserve common operation identity |
| validate | 2 / 10 | Source candidate or artifact validation, asynchronous | `requestId` alone advertised valid; implicit source subject; service test port is technical allocation | Keep a strict source/artifact subject union; move test-port selection into runtime after race-safe design |
| publish | 1 / 3 | Exact validated source CAS/provider effect | One validation ID is meaningful, not an optional “latest”; source-only distinction needs typed receipt | Keep; return exact publication proof and observation locator |
| project | 4 / 5 | list/inspect/connect/create; controller credentials | Opaque repo handles; policy name mixes provider/location with authority; creation hardcodes private | Split observations, retain connect/create and named permitted location; privacy remains safe declared policy |
| deploy | 9 / 14 | targets/list/inspect; source/artifact release; start/stop/rollback/remove | Missing explicit create-vs-update intent when revision omitted; service health port is meaningful, test port is not | Split observation; explicit create/update request branches; retain target/source/artifact/rollback decisions |
| artifact | 8 / 11 | recipe/read/export/usage/prune-preview plus build/prune; source-independent bytes | Build, export and destructive storage management share one large description; build success versus validation | Split build/export/inspect/cleanup; retain artifact identity and policy pins |
| diagnostics | 6 / 13 | inspection, capture, report, ack, witnesses; special bounded replay | 1,698 description characters and host witness IDs in normal coding catalog; stop means capture stop | Separate optional operator capability; preserve alert delivery and existing diagnostic state |

Tool count alone disguises 53 actual dispatch variants. Every one is included in generated
valid examples. Root object vocabulary has 21 fields on task, while a specific action typically
requires only a few. Read/edit's nested alternatives are useful controls, not proof that every
nested conditional or host preserves required/exclusion constraints.

Current results are strict at the JSON level but still broad semantically: `Operation.result`
points at a large union, task results expose storage names (`owner`, `source_ref`, `closed:0|1`),
and Frontier duplicates operation schemas. Expanded output-schema sizes range from 1,551 to
60,784 bytes per tool (task 60,784; artifact 51,030; workspace 38,867). Whether these output
schemas enter the actual model context is **unmeasured**. Raw tools/list byte savings alone
must not be sold as model-token savings.

## D. Decision ownership and default audit

U = user intent/authority; A = agent strategy; C = deterministic controller policy/state;
R = runtime technical facts. “Agent carries” does not imply “user types”. This inventory covers
the full root vocabulary; nested source/query/edit/recipe decisions are covered below.

| Current field(s) or decision | Current caller burden | Proposed owner / treatment |
|---|---|---|
| action, subject, mode | A chooses partly overlapping action families | A; explicit branch/tool boundaries, source/artifact and command/process discriminators |
| repo, name, label, projects, workspaceId | U/A meaningful names mixed with handles | U chooses project/objective; A chooses work; C resolves exact authorized handles and persists original Unicode label |
| policy, target, defaultRepo | A must understand opaque configuration names | U/A selects named permitted location/target when meaningful; C sole/default resolution only when unambiguous and disclosed |
| ref, baseRef, fromTaskId, localChanges, sources | A selects source history and import | A retains explicit base/continue-published/import-independent/composition intent; no hidden adoption of local edits |
| taskId, sourceTaskId, artifactId, validationId, deploymentId | A transports stable handles | C resolves locators; A selects actual candidate/work; stable IDs remain in receipts/CAS context |
| requestId, lookupRequestId, operationId | A must preserve original effect identity | Client/agent persists request before submission; C binds/deduplicates; discovery recovers original receipt. Never generate a new ID on lost reply |
| expected, expectedHead, expectedRevision, checkpoint, sourceCheckpoint | A transports concurrency evidence | C returns opaque exact evidence; A selects snapshot/candidate; admission still checks it. Do not replace expected with “whatever is current” |
| expectedPreview | A transports deletion preview | C creates and rechecks ownership/pin token; U/A chooses exact cleanup scope |
| command, cwd, env, stdin, text, eof | A configures real program behavior | A retains; provider secrets/executor variables forbidden as public execution decisions |
| environment | A chooses task caches or fresh dependencies | A retains speed/reproducibility tradeoff; current task default must be declared, not described as hermetic verification |
| timeout | A bounds work duration | A retains finite timeout and explicit persistent intent; R enforces observed limits |
| waitMs | A also carries transport profile descriptions | A chooses bounded observation duration; host adapter supplies tested default; transport media/progress-token choice belongs to adapter, not task intent |
| capturePaths | A decides what stopped command output becomes source | A retains for command branch only; never import process outputs implicitly |
| edits, resolutions | A chooses source mutations/conflict resolution | A retains atomic batch, exact before evidence and bounded content; C validates current source |
| queries, path, view | A chooses information and recipe/export path | A retains bounded source and artifact-relative access; C refuses arbitrary host-path reinterpretation |
| budget, limit, offset, after, before, pendingAfter, since | A manages result windows | C returns cursors/hints; A selects additional pages/detail. Equality cursors are not revision order |
| includeClosed | A chooses discovery scope | A retains; cleanup and continuation need closed predecessors as well as active tasks |
| health.port | A selects both live endpoint and validation scratch port | Live endpoint U/A; artifact-validation free port R with race-safe reservation. These are two different decisions |
| health.path | A repeats service check contract | U/A source health contract; C derives artifact path from adopted validated launch policy, rejects mismatch |
| message | A supplies validation candidate commit message | A retains as candidate metadata; not proof of tests or authority |
| category, seconds, incidentId, instance, runId, cellId, sequence, phase, callOrdinal, afterRequest | A carries diagnostic instrumentation | Operator/host adapter outside ordinary coding catalog. Stdin sequence remains C-returned/A-carried, not removed with diagnostic sequence |
| network/backend/executor/provider credential/tunnel selection | Network already removed in 0.1.19 | C/R retained internally; no new “execution intent” abstraction containing the same unnecessary knobs |
| PID, spool paths, free ports, runtime identity | Mostly internal already | R; expose proof/status only when needed, not caller-selected identifiers |

Nested decisions: `queries[]` file/list/search/diff/history and their range/format/base/filter
fields remain A information choices. `edits[]` put/delete/patch-style content and before hashes
remain A desired changes plus C checks. Integration resolution variants retain conflict intent
and exact source checkpoint. Packaging recipe platform, inputs, exports and service entrypoint
are source/product intent, while acquisition/auth/spool mechanics remain C/R. Neither a recipe
nor a caller can waive adopted mandatory verification. The full nested vocabulary is retained
in the field inventory; no proposed removal is justified merely by nesting or string type.

Defaults checked in implementation: deployment selects only a sole authorized target, otherwise
requires a target; task start uses permitted default/sole project/base and errors on ambiguity.
These are useful existing behaviors, not bugs to claim as new improvements. Default workspace
creation is composition convenience without expanded grants. `localChanges=false` avoids
unrequested adoption; managed independent start remains intentional. `includeClosed=false`
is appropriate for active discovery but insufficient as the only recovery view. Recipe default
`tdev-package.json` and bounded page sizes are reasonable conventions with meaningful overrides.
Private project creation is a declared supported capability; adding public creation merely to
increase choice is not justified. Artifact validation's adopted fallback command is a policy
decision, not caller-configurable PASS. Deployment release's omitted revision, unlike a sole
target default, can hide whether the caller meant create or replace: split that intent.

Four proposed change categories (none installed yet):

1. **Remove unnecessary choices:** irrelevant process capture/wait fields, duplicate discovery
   union vocabulary, operational host witness knobs in normal coding discovery. Network was
   already removed; do not count it again as work done here.
2. **Add necessary choices:** explicit resume versus independent work, human task/objective
   label lookup, explicit deployment create/update, typed source-versus-artifact subject,
   explicit recovery that may restore/switch resources, exact owned cleanup resource selection.
3. **Retain choices:** project/base/source adoption, integration resolutions, file/query/edit
   content, focused commands versus mandatory validation, environment/timeout, publication,
   artifact path, meaningful deployment target/port, rollback and bounded observation.
4. **Internalize choices:** credentials/connection/backend identity (already largely internal),
   validation-only ephemeral port, request/cursor plumbing in a durable client adapter,
   lookup from names to IDs. Do not internalize user target, source or cleanup intent.

## E. Missing surface, contradictions and priority

| Priority | Evidence / problem | Safe change candidate |
|---|---|---|
| P0 | `status` and deployment `inspect` can call `reconcile → deployments.advance`; interrupted deployment restoration stops/starts resources. Environment reset/prune reconciliation also performs cleanup. A universal “observe is pure” claim would be false. | Separate observation of proof/finalization from effectful recovery. Return typed `recoveryRequired` and require explicit original-operation recovery for restoration/deletion. Requalify existing interrupted-switch guarantees before changing behavior. |
| P0 | Real unknown publication survives; absent remote head cannot prove old sender failure. | Keep original operation, provider certainty and maintenance fence; no latest/new-ID repair or use of maintenance exemption in this work. |
| P1 | 0.1.21 flat discovery demonstrably accepts branch-invalid requests. | Canonical branch reuse under nested request, or correctly split tools after actual host probe. |
| P1 | 43 open tasks at snapshot; list has no project/objective search, label only used to construct sanitized ref; generated project names/IDs differ from user concepts. | Principal-scoped exact human locator discovery plus bounded frontier; no latest-active default. Old labels from retained creation input when available, otherwise explicitly unnamed. |
| P1 | Release without expectedRevision resolves current state at admission; creates and updates share a branch. | `create` requires absence; `update` requires observed revision. Prevent unintended replacement even without concurrent writer. |
| P1 | Accepted operation versus successful command, candidate, package and live health require different judgments. | Typed result subject/stage and compact receipt/current-observation separation; no undifferentiated `success`. |
| P2 | Manual discovery definitions duplicate enums/ranges/regex/required vocabulary; tests explicitly demonstrate intentional looseness. | One canonical wire definition; generated adapters with equivalence/rejection tests, no hand-maintained second semantic owner. |
| P2 | Mixed inspection, controls, cleanup, and huge descriptions/outputs. | Separate domain mutations from reusable inspection/observation; retain source-read batching. Minimize compact result projections before deleting useful fields. |
| P2 | Validation requires an ephemeral health port while deployment port is actual product endpoint. | Runtime allocation with reservation and explicit zero-port capability if supported; do not select-then-close a socket and claim race freedom. |
| P3 | Diagnostics dominates normal descriptions; host annotations intentionally differ from actual effects to prevent repetitive permission popups. | Optional operator diagnostic catalog; express actual effect categories in tool boundaries/results. Preserve the user's fixed annotation profile. |

Negative space includes pending admission before a task row, multiple exact-name matches,
completed work whose reply was lost, unresolved provider state after reconnect, source versus
artifact validation, command capture versus persistent process, and resource cleanup after task
close. Some already have backend support (pending workspace operations, terminal predecessors,
closed-task inspection, process controls, artifact pins); the redesign should project them
coherently, not invent a second state store. A transcript or universal session owner is not
justified. A Unicode task label plus derived current frontier is justified by concrete gaps.

Simplification debt: permanent syntax aliases are unnecessary for pre-release tools; historical
receipts are not aliases and must survive. Dormant SSH code/config is not a selectable public
backend; removing it is unrelated to this probe. Duplicated discovery definitions and host-specific
scheduling prose are design debt. Fixed host hints are an intentional user-required compatibility
constraint, not cleanup debt. Old operation kind/input hashes must not be rewritten when public
names change.

## F. Insight log

### 1. Fresh binding changed the entire comparison baseline

Observation: entry checkout 0.1.16, remote/resident 0.1.21; remote default branch historical.
Direct cause: checkout, canonical ref and installed bundle have independent lifetimes.
Immediate fix: isolated worktree from live authorized ref; capture source/resident contract hashes.
General principle: a familiar directory or repository default is not sufficient work authority.
Related surfaces affected: project lookup, current-source defaults, release receipts, reconnect.
Possible architecture implication: discovery must return exact source authority separately from
runtime version and conversation connection.
Evidence strength: direct Git, authenticated HTTP, read-only SQLite and byte comparison.
Remaining uncertainty: later concurrent changes; snapshot is not a global lock.

### 2. Flat vocabulary exchanges schema precision for host visibility

Observation: 547/777 synthetic invalid calls pass A discovery; none pass strict runtime.
Direct cause: union fields and required intersection erase action-field dependencies.
Immediate fix: B directly embeds canonical input under a required typed root property.
General principle: schema validity and model-visible fidelity are different acceptance gates.
Related surfaces affected: all eight composed input families, not only operation.
Possible architecture implication: keep wire ownership single; isolate host adaptation and
test both acceptance equivalence and actual rendered branch structure.
Evidence strength: exhaustive dispatch-variant corpus, deterministic negative mutations.
Remaining uncertainty: fresh ChatGPT B rendering and actual model error rate.

### 3. Fewer tools does not mean smaller choice space

Observation: 12 tools hide 53 variants; six-tool D has the largest input catalog and deepest
envelopes in the mechanical comparison.
Direct cause: grouping relocates branching and duplicates domain/intent context.
Immediate fix: compare semantic responsibility and per-workload selection, not tool count.
General principle: compress repeated technical decisions, not unrelated product responsibilities.
Related surfaces affected: artifact, task, operation, broader release workflow proposals.
Possible architecture implication: hybrid narrow mutation tools plus typed observation; no
single source/run/release workflow engine by default.
Evidence strength: generated catalogs and exact byte counts.
Remaining uncertainty: model selection performance and better hand-designed D shapes.

### 4. Source labels are currently naming hints, not durable work meaning

Observation: label is sanitized into branch name; Task has no label/objective field or search.
Direct cause: branch creation history owns the user-facing hint; task rows expose storage fields.
Immediate fix candidate: preserve original bounded label, discover by authorized project and
label, return all matches and a current frontier only when uniquely resolved.
General principle: stable machine identity and recoverable human intent are complementary.
Related surfaces affected: project/workspace/service names, completed predecessors, multiple accounts.
Possible architecture implication: bounded locator resolution, no global current-task or transcript store.
Evidence strength: direct schema/store/core inspection and dozens of active tasks.
Remaining uncertainty: realistic objective ambiguity and whether historical creation inputs suffice.

### 5. “Observation” currently includes effectful recovery

Observation: deployment inspection/status may restore prior desired release after interruption;
cleanup reconciliation may perform deletion. Existing tests intentionally assert this behavior.
Direct cause: one reconcile method covers observing proof, committing receipts and advancing effects.
Immediate fix candidate: classify reconciliation paths before moving all reads into a read-only tool.
General principle: public effect boundaries must be derived from executable call paths, not verbs.
Related surfaces affected: deployment, artifact prune, environment reset, maintenance and reconnect.
Possible architecture implication: explicit original-operation recovery, typed recovery-needed frontier.
Evidence strength: direct call graph plus existing interrupted-activation/unknown recovery tests.
Remaining uncertainty: changing automatic restoration must not strand an unavailable previous service;
explicit recovery needs a current-policy/journal strategy and crash qualification.

### 6. The largest context cost may be repeated results, not input wrappers

Observation: task output schema alone is 60,784 bytes; its input is 2,683.
Direct cause: expanded broad result unions and duplicate Operation/Frontier structures.
Immediate fix candidate: measure host-injected inputs/outputs separately, design compact typed receipts.
General principle: measure the representation actually consumed; wire bytes are not model tokens.
Related surfaces affected: every effect tool reusing Operation/MutationResult and diagnostics descriptions.
Possible architecture implication: subject-discriminated receipts plus separate optional detail inspection.
Evidence strength: direct tools/list measurement; model-context contribution not yet observed.
Remaining uncertainty: which outputSchema details the current ChatGPT adapter injects.

### 7. One “health port” represents two different owners

Observation: service artifact tests and deployed endpoints both require a caller-supplied port.
Direct cause: a technical scratch allocation reused the live-service health shape.
Immediate fix candidate: allocate test port internally while retaining live endpoint intent.
General principle: same wire shape does not establish same decision ownership.
Related surfaces affected: validation/build scratch, runtime paths, execution environment settings.
Possible architecture implication: distinguish validation environment facts from release configuration.
Evidence strength: artifact validation and deployment implementation.
Remaining uncertainty: race-free port reservation for arbitrary entrypoints on Termux.

### 8. A nested branch can still disappear through negative constraints

Observation: in the user's fresh ChatGPT B trial, task's start arm appears as
`Exclude<any, any>`, while other task arms and validate/read/edit alternatives remain typed.
The same minimal start call succeeds with `probeOnly:true,effect:none`; invalid validation
is rejected before a probe receipt. See [host report](examples/surface-probe/evidence/host-B-report.md).
Direct cause: the affected canonical arm combines `not` and `allOf`/`if`/`then`; which keyword
or interaction causes the host translation is not yet isolated. The failure is declaration
fidelity, not loss of the canonical branch or runtime validation.
Immediate fix candidate: B2 compiles the bounded presence/finite-value constraints to disjoint
positive alternatives without relaxing valid inputs, then reuses them under the typed root.
General principle: preserving nesting alone is insufficient; the host's schema-to-type subset
must preserve both visibility and constraints. Callable is not the same as comprehensible.
Related surfaces affected: operation locator exclusion, workspace configure's at-least-one
field, diagnostic witness phase conditions, action-per-tool candidates that retain root `not`.
Possible architecture implication: define new source intent as a positive base/local-checkout/
published-task union in the canonical wire itself, rather than maintaining flat mutually
exclusive knobs plus a permanent generic compiler. Use the experiment to identify the supported
subset, not to introduce a universal schema transpiler into the product.
Evidence strength: user-supplied actual declarations/results; local reproduction of accepted
input digests, 192 conditional combinations and unchanged primitive field constraints.
Remaining uncertainty at discovery: B2 fresh-host rendering and root/action/workflow controls.
Follow-up: the B2/control report resolved those tested shapes; uninstructed model choice and
future host versions remain unmeasured.

## G. Executable candidates and measurement

[scripts/probe_surface.py](scripts/probe_surface.py) generates five effect-free catalogs and
all branch examples from the **frozen baseline** canonical contract. It never opens a Controller,
executes a submitted command or reads private runtime state. All mock mutation calls return
`probeOnly:true,effect:none`; they prove shape handling only.

| Candidate | Tools | Input bytes total | Mean / max input bytes | Synthetic invalid accepted by discovery |
|---|---:|---:|---:|---:|
| Root strict control | 12 | 28,369 | 2,364 / 5,223 | 0 / 777 |
| A: current grouped + flat vocabulary | 12 | 18,151 | 1,513 / 2,683 | 547 / 777 |
| B: typed root + canonical nested request | 12 | 29,509 | 2,459 / 5,318 | 0 / 777 |
| C: dispatch variant per tool | 53 | 29,177 | 551 / 1,868 | 0 / 777 |
| D: broader workflow groups + typed request | 6 | 37,545 | 6,258 / 9,375 | 0 / 777 |
| B2: nested positive conditional alternatives | 12 | 32,365 | 2,697 / 5,865 | 0 / 777 |

All accept 53/53 valid canonical examples; none accepts an invalid call at the canonical
validator. Invalid calls are deterministic required omissions, foreign action fields, range
violations and invented fields. This is **not model invalid-call rate**. A/B use current full
descriptions; C/D use short experimental labels, so description totals are not a fair measure
of finished documentation cost. Generated candidate outputs are uniform probe receipts;
original real output schemas are captured separately. Token counts and model selection,
invented-field/omission frequencies, extra round trips and fresh-host continuation success
remain unmeasured. No synthetic code generator is presented as an intelligent model benchmark.

Actual examples (full JSON Schemas are in `examples/surface-probe/generated/*.tools.json`):

```typescript
// A: properties share vocabulary; required action alone does not describe its branch.
tdev_task({action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"})
tdev_task({action: "inspect", taskId: "task"})
// B: exact canonical branch-specific required/forbidden fields survive under request.
tdev_task({request: {action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"}})
tdev_task({request: {action: "inspect", taskId: "task"}})
// C: tool name selects branch. This control intentionally retains constant action fields.
tdev_task_start({action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"})
tdev_task_inspect({action: "inspect", taskId: "task"})
// D: coarse workflow selects domain intent; canonical arguments remain unchanged.
tdev_source({request: {intent: "task.start", arguments:
  {action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"}}})
tdev_observe({request: {intent: "task.inspect", arguments: {action: "inspect", taskId: "task"}}})
```

B schema is exactly `{type:"object",properties:{request:canonicalInput},required:["request"],
additionalProperties:false}`. It adds 95 bytes per tool in this encoding; the much larger
increase versus A restores semantics A omits. This is not gratuitous wrapper overhead.
C still contains root conditional constraints for some variants (status locator exclusion,
start import rules); splitting actions alone does not prove perfect host fidelity.
D is a reproducible mechanical candidate, not proof that all workflow-oriented designs are bad.

B2 additionally matches canonical acceptance over 192 combinations of start source selectors,
status locators, workspace configuration presence and diagnostic phase/witness fields, including
null/wrong-type/invalid-value cases. Its start schema has two positive arms: with `fromTaskId`
required, `baseRef` absent and optional `localChanges:false`; or `fromTaskId` absent with base/local
choices retained. No `not`, conditional `if` or `allOf` remains in its input catalog. Unknown
constraint syntax and excessive expansion fail closed. It adds 2,856 input bytes versus B.
This bounded compiler is an isolated prototype; final canonical product choices should be
expressed positively where the source strategies have real meaning.

## H. Decision matrix and async alternatives

| Dimension | A | B | C | D |
|---|---|---|---|---|
| Workflow calls / identity burden | Existing | Same | Same absent semantic changes | Same absent semantic changes |
| Tool selection | 12 overlapping lifecycle groups | Same grouping problems | 53 explicit names, larger selection set | Six broad groups, substantial intent branching |
| Parameter/required clarity | Proven action-field holes | Exact branch relationship if host retains union | Strong branch selection; residual constraints need probe | Typed but deeper and sometimes duplicated intent |
| Schema fidelity / host compatibility | Fresh control typed, branch loss intentional | Fresh B loses start; B2 retains tested positive alternatives | Original conditional start control becomes a generic map; positive single-action tools not disproved | Fresh source control loses start arguments; broader redesigns not disproved |
| Recovery / mutation safety | Existing invariant and recovery caveats | Envelope alone changes neither | Splitting alone changes neither | Grouping alone changes neither |
| Context cost | Smallest inputs, longest prose compensations | +11,358 input bytes vs A; exact reuse | Small individual schemas, many names/annotations | Largest aggregate and largest individual inputs |
| Implementation / migration | Smallest change, permanent precision debt | Small normalization seam; preserve old receipt identity | More routing/client migrations | New domains/routing, largest naming migration |
| Extensibility | Every field broadens unrelated actions | New branch remains local; grouping can still become incoherent | Tool list grows with actions | Broad union can become a second universal protocol |
| User interventions / IDs | Existing | No improvement from wrapper alone | No improvement from splitting alone | No improvement from grouping alone |

Pre-implementation direction was canonical reuse plus responsibility changes and human
continuation lookup. The fresh B2 evidence subsequently qualified positive alternatives;
section L records the selected architecture and why broader recovery/control splits were rejected.

Async alternatives: domain-specific job handles fragment reconnect and logs without reducing
effect count; continuation tokens can carry locators but cannot replace durable request identity;
a common operation receipt preserves existing acceptance/unknown evidence. Separate wait/log
observation from effect identity as today. Finite command and persistent process share receipt
storage but have different input branches, capture/busy/deadline semantics. Cancel means requested
stop, not proof of termination; retire requires proof and preserves receipt; task close does
neither. Bounded wait reduces short-command calls from admission+observation to one only when
the host returns the result; default noninteractive wait and staged-stdin immediate return must
be tested independently. No transport stream or wait token owns the effect lifetime.

## I. Broader boundary candidate considered (not selected)

Seventeen ordinary tools plus an optional diagnostics capability were a **testable candidate**,
not a target count. Single-responsibility tools use typed roots; heterogeneous requests use a
required nested discriminated request. Do not keep empty action selectors for single actions.

| Name | Responsibility / input | Result / continuation | Async and recovery |
|---|---|---|---|
| tdev_find | Read-only project/workspace/task/service human locator, status scope and bounded pagination | unique frontier or typed candidates/ambiguity; pending admissions included | No effectful reconciliation; never start/reuse by hidden heuristic |
| tdev_inspect | Read-only typed project/workspace/task/artifact/recipe/storage/deployment subject | Current compact material state, provenance, detail cursor, recovery-needed flags | No restore/delete; terminal receipt finalization only when proof already exists |
| tdev_observe | Original operation or original request locator, output cursor, bounded wait | Receipt certainty/status/subject, fresh output cursor, terminal flag and observation timestamp | Common finite/process/build/validation observation; no new effect |
| tdev_project | Connect/create at a named authorized location | Project identity/display name and operation receipt | Provider unknown stays original; no create retry by name |
| tdev_workspace | Explicit composition/name/default changes with revision CAS | Composition revision and receipt | Membership never grants authority; default workspace remains C convenience |
| tdev_task | Explicit independent start, exact-ref open, continue-published, compose/integrate, close; bounded Unicode label | Task/source context and exact CAS, receipt | Close retains processes/bytes; start never doubles as resume |
| tdev_read | Batched immutable source queries | Returned checkpoint, bounded query pages | Snapshot reads; no command execution |
| tdev_edit | Atomic edits plus source CAS/request identity | Receipt, committed checkpoint, current-context locator | Replay same input before stale; never auto-adopt current source |
| tdev_run | Command/process request union with command/env/deadline and mode-specific capture/wait | Operation receipt and source context; terminal result if bounded wait completes | Fixed process source, finite command capture; no hidden replacement/relaunch |
| tdev_control | Sequenced input or stop request for an admitted execution | Control receipt and target observation locator | Delivery uncertainty remains explicit; cancel is not stopped |
| tdev_validate | Explicit source/artifact request subject under adopted mandatory policy | Validation operation; exact candidate/artifact binding | Focused command is separate; no caller-declared PASS, no policy waiver |
| tdev_publish | Exact source-validation receipt and target CAS | Publication receipt with candidate/ref proof | Never consumes artifact validation; original uncertain publication only observed |
| tdev_build | Validated source plus recipe selection | Build receipt then retained artifact binding | Independent scratch/source lifetime; no automatic verify/deploy |
| tdev_deploy | Explicit create/update source/artifact release, start/stop/rollback/remove; revision and target | Switch receipt, desired release and current-health observation locator | Separate switch success/current health; unknown recovery remains journal-bound |
| tdev_cleanup | Preview/commit exact owned operation/env/ref/artifact resource scopes | Ownership/pin evidence, CAS/preview token, receipt | No arbitrary paths or “clean all”; unknown resources pinned; durable receipt retained |
| tdev_export | Bounded retained artifact-relative file bytes | Verified digest/range cursor | No command, mutation or caller host-path write |
| tdev_recover | Explicit selected original operation with effectful recovery strategy permitted by journal/policy | Original effect identity and recovery receipt/proof | May restore prior desired deployment/finish owned cleanup; never repeat unknown provider create/publish |

In this unselected candidate, optional `tdev_diagnostics` would remain operator-scoped, outside the ordinary coding catalog; runtime
errors/alerts can identify its availability without inventing host dynamic discovery support.
That candidate would require explicit separate capability registration, rather than promise
that arbitrary hosts add tools on demand. Existing incidents/witness receipts remain untouched.

Example future intent shapes (design examples, not today's accepted calls):

```typescript
tdev_find({request:{kind:"task", project:"humtr/tdev", label:"UI fix", state:"open"}})
tdev_run({request:{kind:"process", context:{taskId:"task", expected:"…"},
  requestId:"persist-before-send", command:"python app.py", environment:"task"}})
tdev_deploy({request:{action:"update", service:"preview", expectedRevision:2,
  candidate:{kind:"artifact", validationId:"artifact-validation"}, requestId:"release-1"}})
```

Keep names only in read-resolution where ambiguity is handled. A mutation must bind the exact
resolved identity/CAS, or resolve and persist that exact binding within admission before any
effect. Replay consults original binding before current names; renaming or a newly duplicated
name cannot retarget an accepted effect. Generated client request identity must be persisted
before dispatch; server-only auto IDs are insufficient when the admission reply is lost.

Compact effect response candidate: `receipt:{operationId,requestId,subject,status,effect}`,
`context:{taskId,checkpoint,...}` where relevant, and `observation:{cursor,observedAt,nextOffset,
terminal,recoveryRequired}`. Immutable admission binding and fresh current observations must be
separate; replay must not cache a “current checkpoint” forever. Error categories should distinguish
invalid request, stale CAS, ambiguous locator, unavailable/revoked target, permission denial and
unknown/recovery-needed effect, with typed original identity/candidate choices rather than only
prose. Omit irrelevant keys by subject; do not return a giant DB row or an executable next-mutation
plan. The server suggests an **observation class**, not the agent's next strategic action.

Minimum durable additions: original bounded task label/objective summary and its principal/project
binding; existing source/receipt/artifact/deployment state remains authoritative. A derived frontier
joins these facts with current provenance. No global mutable current task, per-chat ownership,
transcript storage, automatic cleanup, provider retry or synthetic successful recovery receipt.
Multi-connection current installation maps to the same principal: transport/account is not a
new task permission. Any future principal separation must filter locator results and receipts
before exposing candidates, not accept a caller-selected owner or credential ID.

## J. Workflow comparison and host acceptance

The [probe guide](examples/surface-probe/README.md#fixed-workflow-traces) fixes all six required
workloads: small edit 9 semantic calls; debugging 9; reconnect 4; artifact/release/rollback 11;
lost reply 2 including original lost call; two active tasks 3 plus human selection. These are
analytical traces with one observation per asynchronous phase and explicitly prebound contexts,
not model measurements. A/B/C/D have identical semantic call counts and machine identity burden.
Changing a wrapper does not earn a fictional efficiency score.

The traces were also routed through the actual candidate encoders and schema-checked (all
effect-free): [workload routing artifact](examples/surface-probe/evidence/workload-routing.json).
Tool-kind counts differ even when semantic calls do not:

| Scenario | Calls, every candidate | A / B / B2 tool kinds | C tool kinds | D tool kinds |
|---|---:|---:|---:|---:|
| Small edit | 9 | 8 | 8 | 4 |
| Debugging | 9 | 4 | 6 | 3 |
| Reconnect | 4 | 3 | 4 | 1 |
| Artifact/release/rollback | 11 | 4 | 8 | 2 |
| Lost provider reply | 2 | 2 | 2 | 2 |
| Multiple tasks | 3 | 2 | 3 | 1 |

Small edits carry task/checkpoint/current effect-or-validation/pending request references;
debugging additionally carries output and stdin cursors. Artifact workflows carry exact source
validation, build/artifact (the same operation identity), artifact validation, deployment/revision
and observation cursor. Request identities are per effect, not one workflow-wide ID. These
machine reference requirements do not change across A/B/C/D/B2. They need not be user-pasted:
the agent can already rediscover some from existing lists; the missing improvement is bounded
human-intent resolution and compact state projection, not deletion of stable IDs.

The proposed `find`+frontier could reduce unambiguous fresh reconnect to discovery+operation
observation (two calls), eliminate user-pasted IDs and expose completed predecessors, while still
returning meaningful choice for two matching tasks. It must check ambiguity across the authorized
candidate set, not only the first page, and return `incomplete` rather than choosing from a
truncated page. In small edits, context receipts reduce re-lookup/copying, not the number of real
test/publish effects. Artifact workflows continue to carry source-validation, build, artifact-
validation and deployment identities internally; changing their visibility cannot erase them.
Unknown effects cannot safely be made a one-call success path.

The prompt table in the guide is a hand-labeled evaluation set (resume, test/deploy, running
status, publish-only, no-new-work, independent experiment, validate-only, artifact subject,
ambiguous objectives). Actual model first-call selection, invalid/omitted/invented parameters,
extra round trips, accidental effects and continuation success must be collected separately.

Actual host layers checked so far:

| Layer | Current evidence |
|---|---|
| Source canonical/discovery | Generated variants and strict validators exercised locally |
| Installed resident | Read-only 0.1.21 health and raw tools/list; product unchanged |
| Local bridge | Captured tools/list equals raw installed/source schema |
| Independent probe process | Effect-free stdio tested; initial B, now B2 plus five named structural controls (`compare`, 17 tools) |
| Independent Tunnel | Created `tunnel_6abc8a11a61c8191afc952512ff005a6`, alias `tdev-surface-probe-20260930`; locally running, /healthz and /readyz 200 |
| Tunnel control-plane delivery | Status reports poll health unknown (no live admin UI snapshot); actual B calls are user-reported and independent local dispatcher logs show forwarded requests |
| ChatGPT Connector Refresh / fresh catalog | User supplied fresh B and B2/control reports; the B2 four key alternatives remain typed. This Codex session itself has no probe tool injection |
| ChatGPT injected typing / generated call | B: validate/read/edit positive; task start `Exclude<any, any>` fails fidelity; two instructed valid calls and one expected schema rejection, not an uninstructed model benchmark |
| User-visible continuation | Not established by server writes, markers, probe echo or local health |

Admin setup was explicitly authorized. A private file-backed probe admin profile was registered
without activating it as the default; the key value was never printed. New Tunnel uses the same
workspace as the existing default connection. Runtime setup initially lacked CONTROL_PLANE_API_KEY;
it now references the existing runtime key file without copying/rotating it. One automatic approval
review rejected schema export; public byte-identity evidence allowed the retry, and the user then
explicitly authorized independent-profile schema transmission/testing. No remaining permission
rejection is being worked around. Existing resident/Tunnels were not repointed.

## K. Safety, state preservation and remaining implementation gate

At the end of the pre-implementation review, product source/runtime/contract were unchanged.
The following records that review boundary; implemented changes are recorded below. The review changed the selected plan,
adds the isolated experiment and invariant tests, and records this review. No canonical publication,
resident cutover, actual user-state migration, cleanup, credential rotation or unknown-effect
resolution was performed. The independent probe Tunnel/profile are the only new external runtime
resources. Historical operations and live task/artifact/deployment state remain owned by existing
controllers. The original dirty checkout is untouched; the new worktree uses a local dependency
symlink solely to run the existing pinned Python dependencies.

Migration design for a later selected surface: normalize new syntax before admission into the
same internal effect identity; preserve old stored inputs/hashes/receipts and inspectability;
no permanent experimental aliases. Prove auth-before-replay and replay-before-stale with old
receipts, changed labels, concurrent sessions and lost responses. Add only compatible label
metadata or an explicit schema revision with backup/rollback gates; do not reopen or rewrite
old tasks to populate names. Deployment restore semantics require separate targeted qualification.
Host hints are not authorization. Keep the user's existing fixed hints unchanged; actual
CAS/policy checks and observation/effect boundaries remain independent of those hints.

Local validation completed initially: probe-focused **4 tests PASS**; affected contract,
bridge, HTTP, progress, recovery and deployment **49 tests PASS** (143.126 s). This includes
existing lost-publication-response and interrupted-deployment restoration tests; it qualifies
the unchanged baseline, not a newly implemented recovery split. Initial full `scripts/check.sh`
**318 tests PASS** (549.765 s), including `git diff --check`. After B2, **7 focused tests PASS**
(8.696 s), including positive equivalence and fail-closed expansion. A focused test initially
failed because relative PYTHONPATH stopped resolving in its temporary child cwd; the test now
passes absolute dependency paths. No product behavior was changed to hide that failure.
Installed Codex MCP loader/bridge preserves exact input schemas for root/A/B/C/D/B2; each
performed two effect-free calls in a fresh ephemeral app-server thread. This is actual client
loading, not model-injected TypeScript or ChatGPT proof. B2 full `scripts/check.sh`: **321 tests PASS** (686.111 s).
Resident mutation
acceptance and ChatGPT fresh-session acceptance are **not run** for a redesigned product.

The B2 fresh-host report and five controls are retained in
[host evidence](examples/surface-probe/evidence/host-B2-report.md). The typing gate permits implementation;
model selection and complete product journey acceptance remain open. Implement
one selected slice at a time: canonical schema ownership/adapter, human locator/frontier,
explicit release intent and mode-specific execution inputs. The larger separation above was
considered and rejected; it is not an unfinished implementation requirement. Re-run focused/affected/full
tests after each meaningful product change; qualify resident and new-session behavior separately.
Do not infer a final architecture win from this local corpus alone.


## L. Selected architecture and implementation — source 0.1.22

Selection: B2's typed request boundary plus a separate human-name continuation responsibility,
explicit release revision intent and shorter descriptions. Thirteen tools are selected, not a
fixed product limit. Canonical positive alternatives directly own public request validation;
there is no production import of the experimental conditional compiler. HTTP unwraps only after
validating the exact envelope, then preserves semantic arguments and existing effect fingerprints.

The broader §I split is not selected. A uniform inspect/recover split would move accepted-operation
reconciliation and journaled restoration into new caller decisions without measured benefit.
Restoration belongs to the original admitted deployment transaction; observation must disclose
that reconciliation can finish it, never masquerade as an entirely pure read. `find` supplies the
missing genuinely effect-free retained-state discovery. Separate build/export/cleanup names might
reduce selection ambiguity, but fixed workload traces showed no effect-call savings; the extra
catalog and migration cost lack an uninstructed model-selection result. The existing domain
boundaries are retained for their task/ref, artifact-pin and deployment-journal ownership, not
because twelve names are mandatory. Reconsider those splits only against measured selection errors.

| Public tool | Responsibility and input under request | Output / continuation | Effect and async semantics |
|---|---|---|---|
| find | Project key/display name, label substring, all/open/closed, bounded pagination | typed resolution; checkpoint, closed/published state, recent and outstanding original receipts | Local retained-state reads only; no arbitrary latest selection |
| workspace | composition actions; exact revision for changes | workspace revision/membership, retained change receipt | Membership never grants authority; inspection can reconcile admitted work |
| project | list/inspect/connect/create within delegated policy | enrolled project or original provider receipt | Unknown create remains unknown until original-effect observation |
| task | start/open/compose/inspect/list/integrate/close/owned cleanup/reset | source checkpoint, receipt or bounded domain frontier | start is new work; fromTaskId is a published predecessor, not resume; close is not stop/delete |
| read | batch of file/list/search/diff/history queries | exact checkpoint and bounded results | No source mutation |
| edit | atomic edits plus expected checkpoint and request identity | retained receipt and new checkpoint | Replay before stale check; no automatic adoption |
| exec | finite command or persistent process, source/env/capture/deadline | retained operation; terminal exit/result if bounded wait completes | Native Termux; process does not capture or inherit a default deadline |
| operation | status by operation or original request; stdin/cancel/retire | original receipt, certainty, output cursor and terminal result | status reconciles original journal; never replacement admission; cancel differs from retired |
| validate | source or retained artifact subject | validation receipt and exact candidate/artifact binding | Source, artifact and live-health proof remain distinct |
| publish | exact source validation and remote-head CAS | exact source publication receipt | No deployment; lost response is observed under its original identity |
| artifact | recipe/build/list/inspect/usage/export/prunePreview/prune | retained identity, validation status, bytes/cursor or preview token | Build is not artifact validation; pruning honors pins and preview identity |
| deploy | source/artifact release, list/inspect/targets and lifecycle controls | revision/release receipt; current identity/health through inspection | Required revision 0 initial / positive exact update; rollback uses retained bytes |
| diagnostics | existing operator-granted diagnostics/witnesses | bounded diagnostics and witness receipts | Existing capability and fixed host hints preserved; witnesses are not UI proof |

Decision ownership changes, separated from inherited behavior:

- **Removed:** omission of release revision as an implicit current-service update strategy;
  loose flat action/field combinations; duplicated discovery branch definitions. Network/backend
  caller choice had already been removed in 0.1.19 and is not claimed as this change.
- **Added:** human project/label continuation lookup; explicit all/open/closed search intent;
  complete/ambiguous/incomplete/unavailable resolution; explicit initial-vs-exact-update revision
  on every release. No optional default can silently select the current update revision.
- **Retained:** agent file/test strategy, finite/process mode, task/fresh environment, capture,
  source adoption vs published predecessor, source/artifact subject, recipe/target choices when
  meaningful, CAS, stable request identity, sequenced stdin and owned cleanup previews.
- **Internalized:** discovery derivation and envelope interpretation are controller boundary work;
  label/receipt lookup is a bounded local projection. Provider credentials, transport identity,
  native executor/PID and source branch namespace resolution remain existing controller/runtime
  responsibilities. No connection, credential, network or backend selector was added.

Direct observations: root composition loses typing; some negative conditionals also collapse
inside nested unions; B2 positive alternatives and the final source input probe retain required
fields. Derived insight: host-compatible shape is an independent requirement from validator
expressiveness, and physical nesting alone is not the solution. Another direct observation is
that deployment release previously inferred a current revision. Derived insight: CAS safety
against races does not express user authorization to replace a named service; expected revision
must express initial/update intent as well as guard concurrency.

Final input host evidence is retained in
[the user-supplied report](examples/surface-probe/evidence/host-product-report.md). It covers three
valid instructed calls and one expected pre-dispatch rejection, with all three receipt digests
recomputed locally. It does not measure uninstructed model choice or production development effects.
The earlier root/A/B/C/D/B2 artifacts remain pinned to baseline b418c1d; changing product source
cannot silently rewrite those historical controls.

The final source validation, package rehearsal and quantitative comparison are recorded in section M. Any missing live acceptance remains explicit, never inferred from
local success. No user files, credentials, connections, grants, retained artifacts, deployment state,
unknown effects or receipts have been migrated or deleted. No canonical publication or production
resident cutover has been performed.


### Additional discoveries during implementation review

Observation: a newly created project may have an admitted provider operation before it has an
enrollment or a task. Direct cause: resource discovery and effect admission have different
lifetimes. Implemented fix: include original pending project admissions in
human-name lookup, authorize them through the retained project-policy binding, and never call
the provider during lookup. General principle: recovery discovery must start from durable
admission intent, not only from successfully created resources. Related surfaces: source open,
build preparation and deployment switch. Architecture implication: a compact receipt frontier
can span those cut points without creating a transcript/workflow engine. Evidence strength:
existing provider-loss/restart fixtures plus the new targeted lookup fixture; live provider loss
is deliberately not induced. Remaining uncertainty: real long-session model planning remains
separate from schema and local recovery proofs.

Observation: project enrollment can be replaced while historical task rows remain. Direct cause:
human names are locators, not authority or stable effect bindings. Immediate fix: unavailable
matches must not be projected as absent work. General principle: filtering an unusable binding
must not authorize replacement work by omission. Related surfaces: revoked scopes and migrated
connections. Architecture implication: typed resolution must distinguish unavailable, ambiguous,
incomplete and none. Evidence strength: disposable identity-replacement and revocation tests.
Remaining uncertainty: user-facing explanation of complex multi-project ambiguity is still an
agent responsibility, not an automatic controller selection.

## M. Final redesign report — ordered acceptance record

### 1. Fresh authority / current state

The authority chain is AGENTS → README → applicable ARCHITECTURE sections → canonical contract
→ IMPLEMENTATION_PLAN. The remote development ref was rebound to `refs/heads/tdev` at
`b418c1ddb97af052f80430f3d55802cf3060cfe2` and rechecked after handoff. The isolated branch
`redesign/surface-20260930` implements source 0.1.22 on that base. Changes are local and reviewable;
the original dirty 0.1.16 checkout is preserved. Current production bundle, connection health,
task counts and outstanding effects are timestamped in
[resident readback](examples/surface-probe/evidence/resident-final-readback.json).
The resident still advertises twelve 0.1.21 tools and the baseline contract. The historical
unknown publication retains its original operation/task identity. Neither its outcome nor
permission to replace the resident is inferred from this redesign.

### 2. Current tool-surface diagnosis

Sections C–K retain the pre-implementation observations and candidate proposals; selected
dispositions are in L and this final report, rather than a second unfinished implementation queue.
The field-by-field baseline inventory and all twelve tool audits are in sections C–F and
`generated/field-inventory.json`. Highest-impact defects were model-visible required-field loss,
manual canonical/discovery duplication, internal-handle-only continuation, implicit service
replacement intent and process options that could not affect execution. Domain inspect/status
paths also have materially different reconciliation semantics. Long prose obscured those
boundaries and carried host cell policy that belongs in the caller adapter.

Historical boundaries were tested rather than presumed natural. Source bytes and atomic edits
remain distinct from mutable resource inspection; common receipts remain useful across async
effects; task/ref ownership, retained-artifact pins and deployment journals justify their current
domain boundaries. A separate pure retained-state lookup addresses a responsibility absent from
those effect-reconciling inspect paths. Splitting every action has no demonstrated call advantage.

### 3. Measured ChatGPT host behavior

Three fresh user-supplied host reports are retained, with their provenance explicitly stated:
[B](examples/surface-probe/evidence/host-B-report.md),
[B2](examples/surface-probe/evidence/host-B2-report.md), and
[selected inputs](examples/surface-probe/evidence/host-product-report.md).
They are actual reported declaration excerpts and instructed calls, not a complete raw injected
catalog captured by this Codex session.

Root composition was a generic map in the control. Flat vocabulary retained properties but lost
branch requirements. Nesting alone preserved read/edit/validation while task-start conditionals
still collapsed to `Exclude<any, any>`. Positive alternatives preserved both start strategies,
status locators, workspace configuration and diagnostic phase requirements. The selected find
fields and both mandatory deployment revision branches were visible; omission of expectedRevision
was rejected before dispatch. Valid instructed calls returned only `probeOnly:true,effect:none`.
The [final command/process report](examples/surface-probe/evidence/host-exec-report.md) confirms
both alternatives, required process mode and schema rejection of waitMs:0/capturePaths:[] in the
process arm. Its valid receipt digest matches the final probe. This proves the changed shape
reached this conversation; it does not prove universal Refresh reliability or actual process effects.

### 4. Key discoveries — direct findings

- The host can lose a valid nested conditional branch as well as a composed root.
- Baseline discovery accepts 547/777 deterministic invalid perturbations that canonical validation
  rejects; discovery validity and runtime validity had different meanings.
- Release inferred an update revision from the current service when the caller omitted one.
- Process-mode waiting was ineffective and capture was unsupported, yet both were selectable.
- Retained creation intents already contain human labels; a new memory database is unnecessary.
- A provider creation can be unknown before any project/task exists. Resource-only lookup misses it.
- Replaced project bindings can leave historical task rows; absence and unavailable work differ.
- Mechanical regrouping changes schema/tool costs without removing any underlying effect call.

### 5. Derived insights — broader architecture consequences

Host typing is a product requirement independent of JSON Schema validity. Express real strategies
as positive alternatives under a typed envelope, and validate exactly that advertised shape.
Do not repair lost constraints with a longer description or a second manually owned vocabulary.
The experimental compiler established equivalence; product code directly owns explicit branches.

Concurrency safety does not express product intent. Required revision zero means create only;
a positive inspected revision means update exactly that service state. An automatically selected
current revision could avoid a race while still authorizing the wrong replacement.

Recovery discovery should join durable admission intent and receipts, including admissions that
have not created resources. Human names locate work; stable identities still bind authority and
effects. Complete/ambiguous/incomplete/unavailable must be distinct before admitting replacement
work. A bounded derived frontier solves this without a current-session pointer or transcript store.

Observation can finish an original transaction's journaled restoration. Renaming it a pure read
would hide ownership; adding another recovery choice without evidence would move deterministic
journal work into agent planning. `find` is genuinely local and effect-free, while status explicitly
reconciles only the original admitted effect. Both preserve unknown outcome and prohibit new replay.

The full Observation/Cause/Fix/Principle/Affected-surfaces/Implication/Evidence/Uncertainty log is in
section F and L's additional discoveries. Remaining unknowns are retained beside each inference.

### 6. Decision ownership changes

| Category | Concrete disposition | Owner |
|---|---|---|
| Removed unnecessary choices | Flat public argument syntax; action-irrelevant field combinations; process wait/capture inputs; omitted revision as an implicit update strategy | Contract rejects invalid combinations; no silent choice |
| Added needed choices | Human project/label and all/open/closed lookup; explicit create-only versus exact revision update on every release | User supplies objective/project when ambiguous; agent chooses meaningful scope/intent |
| Retained choices | Independent new source versus published predecessor/local-change adoption; file/test scope; command/process; task/fresh environment; timeout/capture for commands; source/artifact subject; recipe/target; rollback; exact owned cleanup | User owns product/destructive intent, agent owns authorized strategy |
| Internalized choices | Discovery reuse/envelope decoding and retained label/receipt projection; existing credential/connection/executor/PID allocation remain internal | Controller derives deterministic bindings; runtime supplies technical facts |

Network/backend selection had already been removed in 0.1.19; this change does not claim that
historical removal. Stable request identities and source/deployment CAS remain explicit machine
safety primitives. Fixed host annotations remain exactly true/false/false/false as directed by
the user. They neither authorize effects nor claim that status reconciliation is pure.

The missing-decision audit deliberately did not add caller-selectable mandatory validation depth,
provider visibility bypass, arbitrary cleanup paths, connection credentials or health-test resource
allocation. Focused test strategy already belongs to exec; mandatory validation is delegated policy.
A meaningful future deployment/test-port change requires runtime collision evidence and ownership,
not an unrelated configuration knob added during this redesign.

### 7. Alternatives considered

| Candidate | Tools | Aggregate / mean input bytes | Benefit | Rejection or selection reason |
|---|---:|---:|---|---|
| A grouped flat vocabulary | 12 | 18,151 / 1,513 | Smallest input | Required/foreign-action combinations lost in discovery |
| B nested canonical wrapper | 12 | 29,509 / 2,459 | Single owner, strict branches | Host still loses conditional start arm |
| B2 positive nested alternatives | 12 | 32,365 / 2,697 | Tested branch fidelity and equivalence | Selected foundation; wrapper alone cannot solve recovery discovery |
| C action-per-tool control | 53 | 29,177 / 551 | Small individual action schemas | More selected names; no call reduction; original conditionals still fail host control |
| D workflow groups | 6 | 37,545 / 6,258 | Fewer tool kinds in a trace | More intent branching/depth; no call reduction; source control loses a branch |
| Broader 17-tool boundary split | 17 + diagnostics | Design candidate, not measured catalog | Explicit observation/control/build/export names | Added migration/recovery choices without measured model-selection benefit |

These byte counts use the same pinned baseline inputs. C/D descriptions were experimental labels,
so their shorter text is not a fair finished-product context comparison. Positive action-per-tool
or a better workflow redesign has not been disproved. The chosen design wins the tested fidelity,
continuation and intent requirements with a small normalization seam and no stored-state migration;
it does not claim universally optimal model tool selection.

### 8. Chosen architecture

All thirteen inputs are closed typed objects with required `request`. Single responsibilities
remain typed objects; heterogeneous responsibilities contain explicit disjoint positive unions.
The HTTP boundary validates this exact shape after authentication, unwraps once, and passes the
unchanged semantic request into existing authorization/replay/admission. The contract owns wire
fields once. The finite conditional compiler is probe-only and absent from product imports.

| Tool | Responsibility; actual effect boundary | Input under request | Output / continuation and async recovery |
|---|---|---|---|
| tdev_find | Pure retained local discovery | project, label, state, pagination, since | Typed resolution; current checkpoint, recent/outstanding original receipts, completeness and observation cursor; no provider/executor calls |
| tdev_workspace | Composition reads/changes | action-specific revision/name/member inputs | Workspace revision and membership; original mutation receipt; inspect may reconcile existing work |
| tdev_project | Authorized enrollment/provider creation and observation | list/inspect/connect/create branches | Enrolled identity or original provider receipt; unknown create stays attached before enrollment |
| tdev_task | Source lifecycle and domain inspection | Explicit start alternatives; open/compose/integrate/close/cleanup/reset/inspect/list | Source checkpoint or original receipt; close does not stop processes; inspect supplies live/detailed continuation |
| tdev_read | Immutable batched source reads | taskId plus typed query array | Exact source checkpoint, bounded content/diff/history pages; no mutation |
| tdev_edit | Atomic source mutation | requestId, taskId, expected, typed edits | Original receipt and committed checkpoint; replay before stale comparison |
| tdev_exec | Finite command or persistent foreground process | Command supports wait/capture; process requires mode and excludes both | Common durable operation; command terminal exit/captured checkpoint after bounded wait, otherwise original handle; process source fixed and no default deadline |
| tdev_operation | Observe/control original admitted effect | Exclusive status locator; sequenced stdin/cancel/retire branches | Original status/effect/result, bounded output cursor; status may finish journaled restoration, never a replacement dispatch |
| tdev_validate | Exact source or artifact verification | Positive source/artifact alternatives | Validation operation binds exact candidate/artifact; terminal success remains distinct from publication/deployment |
| tdev_publish | Exact validated source publication | validationId, original requestId, expectedHead | Publication operation/proof; unknown provider result is observed, not repeated |
| tdev_artifact | Retained builds, inventory, export and owned pruning | Action-specific source-validation/recipe/artifact/preview inputs | Build operation then retained manifest; validation state, export cursor/digest, pin-aware prune preview; scratch retirement preserves bytes |
| tdev_deploy | Release switch and service lifecycle | Source/artifact release with required revision; inspected lifecycle revision | Original release/revision receipt; inspect observes current identity/health; rollback uses retained bytes, recovery remains journal-owned |
| tdev_diagnostics | Existing granted diagnostics and witness capability | Positive phase/action alternatives | Bounded incidents/counters/witness receipts; no inference of UI delivery; fixed host hints preserved |

Common result semantics remain `ok/result` or `ok:false/error` with effect certainty. Original
operation identity, admission source and current observation are not collapsed into one success
flag. Existing typed errors distinguish schema, stale state, unavailable/revoked authority and
unknown effects; find adds typed resolution/candidates rather than prose-only ambiguity.
No executable next-mutation plan, automatic retry, workflow engine or default “latest task” is added.

Examples:

```typescript
tdev_find({request:{project:"tdev",label:"surface",state:"all"}})
tdev_exec({request:{requestId:"persist-before-send",taskId:"resolved",expected:"exact",
  command:"python -m unittest",waitMs:30000}})
tdev_exec({request:{requestId:"new-process-intent",taskId:"resolved",expected:"exact",
  command:"python app.py",mode:"process"}})
tdev_deploy({request:{action:"release",subject:"artifact",requestId:"release-intent",
  validationId:"exact-artifact-validation",name:"preview",expectedRevision:0,
  health:{port:18080,path:"/"}}})
```

The examples illustrate shape, not fixture-valid IDs or authorized production commands.

### 9. Before / after workflow

The fixed six workload traces were schema-encoded for every architecture. Counts below are
analytical comparisons under their stated fixtures, not measured ChatGPT planning results.

| Scenario | Baseline calls | Selected design calls | Carried state / user intervention |
|---|---:|---:|---|
| Small edit/test/validate/publish | 9 | 9 | Exact task/checkpoint/receipts retained; branch requirements now visible |
| Persistent debugging | 9 | 9 | Original process identity, output/stdin cursor; no ineffective process wait/capture choice |
| Fresh reconnect, one complete matching frontier | 4 | 2 | find + original effect observation; user supplies name/objective, not UUIDs |
| Initial artifact/release/verify/rollback | 11 | 11 | Source-validation/build/artifact-validation/service revision remain distinct; update needs inspect if revision unknown |
| Lost provider reply, original handle known | 2 | 2 | Observe original operation; no new effect identity |
| Multiple active tasks | 3 | 2 plus meaningful human choice | One find returns candidates; selected original operation then observed |

Name-only lost-reply recovery adds find before original-operation observation; it does not earn a
fictional one-call saving. Older history, incomplete pages and live remote/deployment health can
require more inspection. Stable identities still exist and are transported by the agent; they
are recovered from current authorized facts rather than demanded from the user. Completed
predecessors and closed work remain visible so missing context does not imply a new start.

### 10. Confusion removed

Schema rejects cross-action fields, missing branch requirements, both/neither status locators,
predecessor/local-adoption conflict, process capture/wait and implicit revision updates. Names and
receipts separate resume discovery from new task creation. Explicit output certainty separates
admission from execution success, build from artifact verification, publication from deployment,
and switched release from current health. No new network/container/provider-auth concept is exposed.
Host scheduling budgets moved from operation discovery to the caller adapter; server state,
transport flush, Tunnel delivery, cell execution and user-visible progress remain separate evidence.

### 11. Missing capability added

Human-name continuation now includes completed and closed predecessors, running/unknown receipts,
source checkpoint and publication state. Unknown project creation is discoverable before enrollment;
a replaced historical binding is unavailable rather than absent. Bounded paging cannot choose a
partial/latest match. Release intent distinguishes create-only from exact inspected update. Finite
and persistent execution now expose only mode-relevant choices without losing their stable handles.
These additions require no transcript, new credentials, global session owner or DB migration.

### 12. Safety / consistency

Lost response never authorizes a new request identity. Public envelopes do not enter stored
fingerprints. Authentication/current authority precede receipt replay; existing receipts replay
before stale CAS. Exact validated candidate publication, non-force remote CAS, unknown outcome,
maintenance frontier, unrelated dirty state, owned cleanup and artifact pins remain intact.
No hidden provider mutation/retry was introduced. Required release revision is checked before
preparation and again in admission. Schema rejection occurs before effect admission/SSE selection.
Deployment recovery can complete only its original journal; source discovery performs no recovery.

### 13. Validation

Final statuses and exact log/bundle identities are recorded in the qualification table below.
Focused, affected, full, actual client loading/calls, staged bundle, resident acceptance and
fresh ChatGPT schema acceptance are separate rows. The earlier 331-test run failed one stale
catalog-count fixture and is retained as a failure, not relabeled PASS. A later SDK run failed
an outdated object-property assertion after exec became a union; its fixed rerun is separate.
No production resident acceptance or full ChatGPT development journey is implied by local results.

### 14. Migration / state preservation

The stored task/operation/artifact/deployment formats are unchanged. Labels derive from original
intents. New public syntax normalizes to existing semantic inputs without permanent flat aliases.
Historical receipts remain observable even where old syntax is no longer admitted (for example
omitted release revision). User files, credentials, grants, connections, pending/unknown effects,
retained artifacts and deployment journals were not migrated or deleted. Local test fixtures own
all created source/build/service/prune effects. The isolated probe runtime/profile remains available
for host acceptance; existing production connections were not repointed. Dependency symlinks are
local test aids and excluded from publication. Canonical publication and resident cutover were not
performed and require their current authority/maintenance checks and explicit permission.

### 15. Remaining uncertainty

Uninstructed model tool selection, omission/invented-field frequency and long-session visible
continuation were not measured by a model benchmark. Host reports cover excerpts/instructed calls,
not every field/output in a complete injected catalog. The last execution branch passed its separate reported host gate. Production migration/cutover and real full ChatGPT artifact/deploy/reconnect journey
remain separate acceptance work. Android Termux same-UID authority is unchanged; no stronger
sandbox guarantee is claimed.

Strict input size increases: baseline 18,151 → 31,371 bytes; descriptions fall 9,824 → 3,299.
Full raw declarations, including outputs, rise 276,470 → 287,730 bytes (about 4.1%). These are
compact JSON bytes, not tokens. This design improves constraint fidelity and reconnect lookup
while accepting a measured context cost. Output compression or additional tool splits need real
host selection/result evidence before a further change. The final product corpus has 59 positive
cases and rejects all 854 deterministic invalid perturbations; that is schema correctness,
not a measured model error rate.

### Final qualification table

| Boundary | Result | Exact evidence / practical limit |
|---|---|---|
| Host-qualified schema invariants | PASS | `test_surface`, `test_surface_probe`, contract tests in final full run; positive alternatives, drift checks, no-op probe, fixed hints |
| Human continuation / pending-admission focused | 8 PASS, 17.955 s | `admission-frontier-focused.log`; Unicode label, restart, ambiguity/paging, closed work, revoked/replaced authority, unknown source/provider admission before resource creation, catalog adapter |
| Execution / wire affected | 19 PASS, 67.399 s | `execution-affected.log`; process immediate admission, wait/capture rejection before admission, bounded command/source waits, source wire validation |
| Final full `scripts/check.sh` | 331 PASS, 796.247 s | `product-final-full-check.log`; includes recovery/lost response, source/publication/deploy/artifact, HTTP, diagnostics, CLI and JS adapter coverage, plus diff whitespace check |
| Final official MCP SDK | PASS, 13 tools | `product-final-sdk-fixed.log`; pinned @modelcontextprotocol/client 2.0.0, protocol 2026-07-28, actual notifications/progress, terminal exit, replay |
| Final installed Codex loader | PASS, exact 13 input schemas | `product-final-loader.log`, `product.codex-tools.json`; two no-effect instructed calls, no model inference |
| Final actual Codex development journey | PASS | `product-final-codex-journey.log`; real local read/edit/native exec, fresh thread/find, stdin/replay, validation, exact disposable publication, composition and cleanup; productionTouched=false |
| Final inactive staged bundle | PASS | `product-final-bundle-rehearsal.log`, bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`; authenticated loopback/restarts/SIGKILL recovery, retained bytes after scratch retirement, artifact validation/export/owned prune; productionServicesTouched=false |
| Fresh ChatGPT B / B2 comparison | B partial failure; B2 tested branches PASS | User declaration excerpts/control reports; no complete raw injected catalog or unbiased selection benchmark |
| Fresh ChatGPT selected find/start/release | PASS for reported declarations/instructed calls | `host-product-report.md`; three effect-free valid receipts, expectedRevision omission rejected before receipt |
| Fresh ChatGPT selected command/process | PASS for reported declaration/instructed controls | `host-exec-report.md`, `host-exec-summary.json`; digest matched, waitMs:0 and capturePaths:[] rejected before dispatch; no process ran |
| Production resident acceptance of 0.1.22 | PASS | Canonical `593d57a65d76c90f49cdf999d603e1c53a986477`; active bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`; resident 0.1.22; exact unknown publication preserved; both configured connections healthy/running; refreshed ChatGPT injected 13-tool `request` surface and direct read-only calls passed |
| Real complete ChatGPT development/deploy/reconnect journey | NOT RUN | Probe validation receipts do not create tasks, run commands, deploy or attest visible continuity |

The latest resident readback had 44 open/72 closed tasks and 2,123 succeeded/338 failed/one running/
one unknown operation. These externally advancing counts are observations, not a migration result.
The unknown publication is still `2531fb0f9bbd4aa584865f62898e1010`; the running exec
`71b23ff3bc3948059fb2cc88f690425f` belongs to existing work and was not controlled by this redesign.

The final source contract digest is
`b25025e68029cf56837e2ca5e037ddd7c539641062cced351e189db8d1edb08a`.
`product-metrics.json` and `product-source-tools.json` reproduce its schema corpus and complete
advertisement; `product.codex-tools.json` records the actual final loader representation.
No production credential value appears in those artifacts. Historical failed checks remain
separate logs, so a corrected rerun does not erase the investigation trail.

## N. Authorized canonical publication and resident activation — 2026-09-30

The user explicitly authorized both canonical publication and resident replacement after the
completed local/host input qualification. This is new deployment authority; the preceding
sections retain their historical pre-activation observations. Current remote `refs/heads/tdev`
was rechecked at b418c1d; GitHub readback confirmed humtr/tdev identity 1322208918 and push access.

The current resident has only historical unknown managed-create publication
`2531fb0f9bbd4aa584865f62898e1010` outstanding. Its stored owner/task/ref/create intent and exact
candidate were reviewed, repository identity independently matched to GitHub, and its exact
remote ref read back absent. Absence does not prove original failure; the receipt remains unknown.
OPERATIONS' maintenance option allows this precise historical publication to be preserved and
excluded from the update frontier. No original provider mutation is retried or resolved.
`maintenance_ready` passes with only that exact exemption. Any new running/unknown effect still
blocks the installer. Credential/config/profile fingerprints are retained privately for post-update
comparison; public evidence contains only aggregate preservation results and receipt identity.

Selected qualified bundle: `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`.
Its source/config compatibility and actual inactive-bundle journey were already qualified.
Publication is a non-force update from the observed canonical base; activation uses the existing
owned installation and recoverable installer, preserving both connections/auth modes and watch.
Completion, exact canonical commit, live schema readback and state-preservation results are
recorded below after each step succeeds. No successful deployment is claimed in advance.

Canonical publication completed at `593d57a65d76c90f49cdf999d603e1c53a986477`. The Codex session that prepared this
change ended immediately after the successful push because its workspace credit was exhausted; its retained command history
contains no resident installer invocation after that push. Resident activation was therefore resumed independently rather
than assuming a partially completed replacement.

The exact qualified source and bundle were rechecked before mutation. The pre-update frontier contained only historical
unknown publication `2531fb0f9bbd4aa584865f62898e1010`; no maintenance or install-transaction journal was pending.
The owned installer ran with that one explicit maintenance exemption, then `install.sh --check` succeeded. Readback showed:

- active bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33` and resident version **0.1.22**;
- controller up, with `tdev_janmori` (Tunnel authorization) and `default` (Bearer) both enabled, healthy and running;
- historical publication `2531fb0f9bbd4aa584865f62898e1010` still exactly `unknown`/`unknown`, with no replay or resolution;
- no pending maintenance journal, install transaction or recovery state after the successful switch.

Before host Refresh, authenticated localhost discovery through `tdev_janmori` advertised exactly thirteen tools:
`tdev_find`, `tdev_workspace`, `tdev_task`, `tdev_read`, `tdev_edit`, `tdev_exec`, `tdev_operation`, `tdev_validate`,
`tdev_publish`, `tdev_project`, `tdev_deploy`, `tdev_artifact`, `tdev_diagnostics`. The selected composed tools had a closed
root object requiring `request`; live catalog inspection showed 9 task alternatives, 2 exec alternatives, 4 operation
alternatives, 2 validation alternatives and 6 deployment alternatives.

After the user performed the required ChatGPT connector Refresh, the actual injected catalog matched that thirteen-tool
resident surface. `tdev_project({request:{action:"list"}})` succeeded, and
`tdev_find({request:{project:"tdev",label:"surface",state:"all",limit:5}})` resolved the retained `typed-native-surface`
work uniquely without replaying an effect. Host-side negative controls rejected a deployment release missing
`expectedRevision`, process mode with `waitMs:0`, and process mode with `capturePaths:[]` before dispatch. This is installed
and refreshed ChatGPT surface acceptance, not the still-separate complete development/deploy/reconnect journey.
The bounded evidence summary is `examples/surface-probe/evidence/host-installed-acceptance-20260930.md`.
