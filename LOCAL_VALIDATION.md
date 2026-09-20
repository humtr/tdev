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
| `sh scripts/check.sh` | 55 tests, OK, 43.335s; diff whitespace check passed |
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

## Protocol and host acceptance boundary

The requested version is **MCP 2026-07-28**. Implemented per-request metadata/header
validation, server/discover, complete results, explicit cache metadata, and structured
unsupported-version errors. There is no legacy initialize/session protocol or silent
downgrade. The official SDK pinned-version probe tests interoperability, not all possible
optional MCP features; only the advertised tools profile is implemented.

Primary references:
[MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
[MCP HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover).
[OpenAI's server documentation](https://developers.openai.com/plugins/build/mcp-server) and
[Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
establish the HTTP/private-tunnel product route, not observed acceptance of this protocol
date by the user's ChatGPT host.

Not executed: live ChatGPT/Tunnel version/header/bearer forwarding, Refresh/reconnect,
real account/session isolation (not claimed for shared credentials), optional remote OS
isolation/egress, or production cutover. No separate Linux executor is needed for the
default native path. Next human action: configure a distinct development Tunnel profile
and connector credential privately, then connect/Refresh in ChatGPT. Expect seven tools
and 2026-07-28 requests; continue with exact-version forwarding, a disposable-ref native
coding path and same-request replay after reconnect. A host version mismatch must be
reported, not silently downgraded. Production activation requires separate authorization.
