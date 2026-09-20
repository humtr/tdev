# Local validation evidence — 2026-09-20

Evidence only, not another design/status authority. README owns current status.
All work used /data/data/com.termux/files/home/prj/tdev, branch tdev. Starting local
and remote head: 244c106a8951cba8a329b0f321e0bab29ccb5a31. No alternate development
checkout/worktree/clone or production service change was used. Synthetic Git repositories
were disposable authored test fixtures. Existing .artifacts, node_modules and tools
contents were preserved and excluded from the change.

## Executed checks

| Command | Observed result |
|---|---|
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest discover -s tests -p test_executor.py -v` | 10 tests, OK, 0.781s |
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_core test_recovery -v` | 23 tests, OK, 26.254s |
| `sh scripts/check.sh` | 42 tests, OK, 55.408s; git diff whitespace check passed |
| `PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` | Verified inactive bundle; real packaged HTTP process before/after SIGKILL; wrong bearer 401 and authorized seven-tool discovery on both starts; runit shell syntax valid; no production services touched |
| `PYTHONPATH=src:.tdev-deps python scripts/measure.py` | Three exact-publication local fixture trials; details below |

Rehearsed runtime bundle SHA-256:
9c7efe670d5cb0a2828fe30ef8a8ed310651f6b3839daa5190b9346d1879a64a.
Bundle identity covers source, contracts and installed pinned dependencies; it is not a
Git commit or production deployment identity. The disposable bundle was removed after
rehearsal; no active installation was replaced.

Suite coverage includes actual Draft 2020-12 schema checking and positive/negative
fixtures, per-tool response schemas, atomic edits, SHA-1/SHA-256, concurrent first opens,
parallel refs without shared FETCH_HEAD, checkpoint ABA, composition, stale CAS,
lost-response dedup, unique publication, advertised-old non-force guard, exact validation
Git HEAD, forged stdout/outer identity rejection, bounded output/deadlines, pipe timeout,
stdin partial writes/lost acknowledgements, cancellation, creator-independent retirement,
grant revocation, two principals/repos, restart/WAL recovery and inactive rollback/tamper.
The outer worker control-flow tests launch authored subprocesses with a mocked OCI engine;
they are not proof of deployed Linux isolation.

## Small measurement, not a benchmark claim

Expanded advertised input/output tool schema: **25,184 UTF-8 bytes** (canonical JSON).
Workload: open, batched read/search, atomic two-file edit, mandatory validation, publication
and asynchronous status observation, using an authored trusted local executor.

| Trial | Wall seconds | Calls | Status polls | Validations | Executor starts | Exact publication |
|---|---:|---:|---:|---:|---:|---|
| 1 | 2.101 | 7 | 2 | 1 | 1 | yes |
| 2 | 2.155 | 7 | 2 | 1 | 1 | yes |
| 3 | 2.215 | 7 | 2 | 1 | 1 | yes |

The deterministic suite ran concurrently, so these are loaded-device observations, not
stable latency estimates or evidence of superiority to the unimplemented alternatives.
The path uses five semantic calls plus polls. File payload plus shallow Git pack duplicates
source transfer; that is a known initial cost. No remote cold/warm start, real GitHub
publication latency, Tunnel round trips, large-repository throughput or user-intervention
rate was measured. Competing-ref correctness is tested, not performance-scored.

## Not executed / not accepted

No enrolled remote SSH executor/image was available. Actual namespace/seccomp/cgroup,
host-secret/metadata/private-network exclusion, remote loss/capture/cancellation and
resource exhaustion remain live acceptance. Termux same-UID execution is never reported
as a sandbox. No configured Tunnel runtime credential or ChatGPT connection was exercised;
bearer forwarding, host discovery/Refresh and reconnect require operator/host interaction.
Shared ingress credentials do not establish separate ChatGPT account/session authority.
Production activation remains separate and requires explicit authority after acceptance.
