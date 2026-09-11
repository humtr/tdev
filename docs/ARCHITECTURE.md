# dev-2 architecture

Navigation only; bounded semantic owners are the accepted Designs. DIRECTIVE r2
owns product goals and the actual first-release operating constraints. Current
implementation and execution order are in WORKBOARD, not this overview.

## Selected system

```text
ChatGPT (sole required intelligence)
  -> fixed workers.dev MCP + Access identity
  -> installation-scoped routing-only connection object
  <-> device-initiated outbound channel
Termux / Android
  -> deterministic control + exact Git repository/candidates
  -> per-repository SQLite work truth and bounded admission
  -> isolated native validation on ephemeral GitHub-hosted execution sessions
  -> exact validated Git result / expected-old-ref integration
  -> durable terminal observation through the same MCP
```

Termux is the actual control and state runtime, not an optional test host. Public
ingress is workers.dev, not an invented generic HTTPS server. The device requires
no inbound reachability, extra VPS, reverse-proxy host, public tunnel or changing
URL. GitHub-hosted compute is an explicit managed execution dependency within the
existing foundation, chosen to avoid running hostile candidate code in the same
Android UID as credentials. It is not a user-maintained Linux server.

One local ledger owns each repository's work and recovery; one external Git ref
owns canonical source. The routing object owns only live connection routing.
Execution sessions own physical process observations, not work/admission authority.
No second model, Case/Drive/Agent/Promotion, copied cloud work ledger, queue service,
D1 or R2 is introduced. Each component has a concrete removal test: without routing
an outbound socket cannot receive public requests; without isolated execution an
untrusted candidate could access device control credentials; without durable local
identity recovery could duplicate work/effects. Other components are omitted.

Work identity and correctness do not depend on any of these provider resource IDs.
Default execution capacity is 8; capacity1 serial mode and capacity16/32 use the same
contracts. Independent edits, reads, validation and nonconflicting effects progress
concurrently. Only exact work revisions, actual resource bounds and same-ref atomic
updates fence. Android sleep makes control unavailable, not a second owner or a
successful no-op. Retry reaches the same ledger identity after reconnection.

## Exact change and result semantics

Bound current repo/head, progressively read bounded source, create an immutable
candidate generation, and prepare a frozen direct-child commit/result at current
head. Required full validation runs against those exact bytes in an identified
execution environment. Only an authenticated matching receipt makes that result
eligible. Integrate using expected-old-ref protection; reconcile response loss by
exact commit and managed-lineage readback. Recomposition changes result identity
and requires validation again. No throughput optimization may validate one tree
and publish another or exclude the cost of stale/full-validation repetition.

## Owner map

| Question | Owner |
| --- | --- |
| Work, IDs, deduplication, admission, restart and callback fencing | D0001 |
| Binding, bounded context, Git objects, candidate generations | D0002 |
| Prepared result, required validation, same-ref integration | D0003 |
| Four MCP tools, typed work variants and observation | D0004 |
| Human/device/runner authentication, capabilities, sandbox, credentials | D0005 |
| Termux + workers.dev topology, outbound routing, managed execution, release | D0006 |
| Native/core/integration/live test purposes, comparisons and gates | D0007 |

Dependencies are in Design metadata and mechanically projected into INDEX. They
are not lane execution order. Workboard selects the implementation frontier.

## Operational cost and falsifiability

Warm execution sessions amortize managed runner startup, but cold jobs, request
routing, object transfer, quota and Android outages may cost more than predecessors.
This architecture is selected, not proved optimal or faster. Same-ref eight-work
benchmarking against both actual predecessors remains mandatory; an improvement
claim cannot be made from component count or source cleanup. Benchmark cohorts
remain release/performance decision work, not a per-edit gate.

No dev-2 Worker, assigned public origin, native activation helper or production
sandbox seal is presumed present. Environment evidence and its explicit unknowns
are in [the correction record](evidence/environment-correction-2026-09-11/README.md).
The old persistent generic-Linux/systemd topology is no longer an accepted target.
