# Implementation order

Derived from ARCHITECTURE, not a second design authority. Current completion belongs
only in README; wire types belong only in contracts/tools.schema.json. Continue through
all locally executable deliverables despite outstanding independent host acceptance.

| Deliverable | Required invariant | Minimum checks | Next prerequisite | Human acceptance |
|---|---|---|---|---|
| 1. Contract/SQLite/Git workspace/read/edit | current scope, atomic edits, checkpoint CAS, replay before stale, unrelated state preserved | real JSON Schema fixtures, Git fixtures, restart/races | durable source/intent | none |
| 2. Command + validation/publication path | no native arbitrary shell, outer receipt, exact commit, durable intent, non-force CAS | trusted local executor and remote protocol fixtures; forged output/stale/lost response/nonzero capture | complete local coding path | remote host credentials for live isolation only |
| 3. HTTP/auth/recovery/concurrency | discovery auth, metadata grants nothing, reconnect no relaunch, unrelated work proceeds | HTTP, revocation, principals/repos, stdin/cancel and crash tests | usable recoverable MCP | ChatGPT connection/Refresh and credential entry |
| 4. Executor/CLI extension qualification | pinned remote program, OCI isolation/resources, extension cannot publish or mint receipts | protocol/engine fixtures, installed CLI fixture, capture/output/cancel tests | ready for remote trial | separate Linux executor, image/SSH key and live negative tests |
| 5. Inactive install/rollback | verified bundle, private config, compatible rollback, no production effect | disposable install/check/rollback, runit definitions | ready for activation | tunnel setup and explicit production cutover |

Each deliverable: source, invariant test, focused check, first-order failure repair,
affected-domain check, scripts/check.sh, whole diff/status, then continue. Do not label
unexecuted host tests PASS. Do not recreate Permit, registry, numerical revision,
binding/grant/executor tables or generic provider/release frameworks.

First complete fixture path: open → read → edit/exec → validate → publish → readback.
Measure it before packaging. Publication must reuse the exact frozen validated commit.
Local execution fixtures contain authored trusted programs and are not sandbox proof.
