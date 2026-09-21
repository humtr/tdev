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
