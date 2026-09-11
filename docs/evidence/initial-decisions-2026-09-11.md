# Initial clean-sheet decisions before predecessor source inspection

Input authority: humtr/tdev dev-2 at 9a42b05d403370b7b4a698b4d7440d58aa4a79b5, parentless root; DIRECTIVE r1 and RULE unchanged.

ChatGPT supplies intelligence. The product is a deterministic repository development service, not an agent/model orchestration system.

One persistent Linux service accepts authenticated MCP, owns one SQLite ledger per repository, and dispatches bounded sandboxed commands. The external Git branch owns canonical source; the ledger owns work and effect intent, never a competing canonical HEAD. Immutable Git objects own source bytes. No event-sourced state reconstruction, distributed queue, second model, or predecessor state import.

Stable work IDs and client request IDs; exact repository identity/binding epoch/base; monotonically revised immutable candidate generations. Source edits are atomic object/patch transactions. Executions get separate materializations and no shared writable checkout or privileged Git metadata. Rootless OCI sandboxes are the initial production execution boundary, with network and credentials absent by default.

Default execution capacity 8, positive configurable capacity without a semantic maximum; the same state and API at capacity 1, 8, 16 and 32. A ready-row dispatcher and bounded resource budgets, not persistent slot identities. Work mutation is fenced per work; canonical Git update is fenced per target ref; no command, network wait or validation holds the database transaction or ref update fence.

Integration prepares a direct child of an exact freshly observed target HEAD, validates that exact complete tree with trusted required policy, persists the exact commit and push intent, then uses an expected-old-ref Git update. A changed target requires fresh composition and validation, never unchecked cherry-picking. Identical effect retry uses the same commit; readback resolves response loss. Same-path automatic recomposition is rejected; unrelated edits are mechanically overlaid only when their expected base entries still match. No speculative merge queue or eight-slot coordinator is introduced.

Four proposed MCP tools: dev_context, dev_read, dev_work (typed operations, no arbitrary shell), dev_observe. An optional bounded request batch contains independent typed actions, not a workflow language. Public limits are advertised policy, not a concurrency ceiling.

Runtime activation consumes an integrated, validated immutable release artifact and uses a stable endpoint and durable activation receipt. OS service supervision survives broker replacement. No Worker/source-scope redeploy per task. A provisioned Linux host is a deployment requirement, not assumed to exist. The current ChatGPT container is only a possible hermetic authoring/test environment.

Seven bounded Designs will own: security; work/state/parallel recovery; repository/candidate; validation/integration; runtime activation; MCP; test and benchmark methodology. Acceptance is design acceptance, not a performance or live-verification claim.

Benchmark both current tdev and tmcp only after these decisions: equivalent correctness, identical workload, fixed model and resources, cold/warm split, repeated latency/throughput/round-trip/context/recovery/intervention measurements. Hard superiority remains unproven until implemented and measured.
