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
