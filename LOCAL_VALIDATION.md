# Local validation evidence — 2026-09-20

Evidence only; README owns current status. Work location:
`/data/data/com.termux/files/home/prj/tdev`, branch `tdev`.
Starting authoritative local and remote HEAD:
`11042735d67ca029e258573ba3d800aa464fb755`.

No alternate development clone/checkout/worktree or production service change.
Synthetic Git repositories and inactive bundles were disposable authored test fixtures.
Existing unrelated .artifacts, node_modules and tools were preserved. The MCP SDK probe
was installed separately in ignored .tdev-mcp-client, not existing node_modules.

## Executed checks

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
All seven public tools were then aligned to the current tmcp convention
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
unsupported-version errors. There is no legacy initialize/session protocol or silent
downgrade. The official SDK pinned-version probe tests interoperability, while the live
ChatGPT acceptance above confirms the user's host can currently drive this advertised
profile through Secure MCP Tunnel.

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
