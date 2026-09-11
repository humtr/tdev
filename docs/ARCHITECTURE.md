# dev-2 architecture map

This is a navigation and requirement-coverage projection of accepted Designs, not another authority layer. [DIRECTIVE.md](../DIRECTIVE.md) owns objectives, [RULE.md](../RULE.md) owns stable invariants, each Design owns its bounded decisions. [WORKBOARD.md](../WORKBOARD.md) alone owns execution order. Design numbers do not encode dependency order. `accepted` below means decided, not implemented or verified.

## Product shape

ChatGPT supplies reasoning and exact edits. Four deterministic MCP tools connect it to one persistent Linux broker, per-repository SQLite work state, immutable Git-object candidates and isolated rootless execution containers. The external Git ref owns canonical source. Only a fully validated exact target tree can enter a direct-child commit through an expected-old-ref update. The same MCP can stage and activate its own immutable release at the unchanged endpoint. There is no required second model, Codex, Worker, Agent, Case, Drive or Promotion subsystem.

```text
ChatGPT (requirements, decomposition, edits, interpretation)
  -> canonical dev-2 MCP: context | read | work | observe
     -> authorization + bounded deterministic broker
        -> immutable snapshots/candidate generations
        -> repository ledger + ready-action dispatch
        -> isolated execution/required validation (default capacity 8)
        -> exact-ref Git integration -> authoritative readback
        -> immutable release -> fixed activation helper -> same MCP endpoint
```

Capacity is positive deployment policy with default 8, required supported baseline at least 8 and no architectural maximum. Stable work/action/attempt identities do not encode slots. Capacity 1 and 16/32 use the same schema and semantics. Independent work/read/validation proceeds concurrently. Only a work revision, short database transaction, one conflicting ref effect or actual process-ownership handoff serializes its necessary invariant.

## Requirement-to-decision ownership

| Directive obligation | Bounded owner | Verification location |
| --- | --- | --- |
| User authority, clean root, no predecessor inheritance | DIRECTIVE and RULE; no derived override | Publication root/parent and unchanged authority blob checks |
| ChatGPT-only intelligence; minimum deterministic public path | [D0004](design/D0004-mcp-controller-contract.md) | Actual client transcript; dependency/process audit |
| Stable work identity, parallel default 8, cancellation/restart/dedup | [D0001](design/D0001-work-state-parallel-recovery.md) | Core state/fault tests, SQLite reopen, C1/8/16/32 |
| Exact repository, progressive bounds, no deployment scope | [D0002](design/D0002-repository-context-candidates.md) | Real Git snapshots, stale context, unknown-path live task |
| Isolated immutable candidate generations | [D0002](design/D0002-repository-context-candidates.md) | Entry CAS and eight-way materialization tests |
| Required validation and exact canonical effect | [D0003](design/D0003-validation-exact-integration.md) | Full-tree identity, provider CAS and lost-response tests |
| Authorization, sandbox/credential/provider boundary | [D0005](design/D0005-security-execution-boundaries.md) | Negative permissions and real OS escape/isolation tests |
| Stable runtime and own-source safe update | [D0006](design/D0006-runtime-release-activation.md) | Stage/activate/restart/rollback through same MCP |
| Local/CI/live equivalence; both-baseline superiority | [D0007](design/D0007-verification-superiority-contract.md) | Canonical entrypoint, paired raw evidence, hard gates |

D0001 owns state transitions, not validation eligibility. D0002 owns object/snapshot identity, not permissions or canonical writes. D0003 owns canonical-source transition, not release activation. D0004 owns public representation, not a duplicate state machine. D0005 owns trust boundaries. D0006 owns deployment/activation. D0007 owns proof methodology, never product goals. A method that spans modules calls the owning contract; it does not copy its policy into another Design.

## Why each component exists

| Component | Concrete invariant lost if removed | Deliberately absent alternative |
| --- | --- | --- |
| Per-repo ledger and unique request keys | Reconnect/restart loses work or duplicates effects | Event-sourced Case/Drive tree, separate durable queue |
| Ready-row selector and resource reservations | Bounded/fair parallel dispatch cannot be enforced | Standalone scheduler service, fixed eight lanes |
| Immutable Git objects plus strong manifest | Candidate/source bytes can drift under validation | Shared writable checkout; semantic tree copy per owner |
| Attempt sandbox/launcher | Repository code reaches credentials or other work | Public arbitrary shell, model subprocess |
| Validation receipt + frozen ref intent | Tested and published bytes diverge; response loss duplicates commits | Promotion lifecycle; database/Git distributed transaction |
| Narrow provider/protocol adapters | Protocol formatting or remote credential effects leak into domain code | Generic plugin/compatibility framework |
| Fixed release helper and one activation record | Broker replacement can lose its own restart/rollback intent | Permanent custom supervisor/qualification coordinator |

Failure handling is in these same bounded contracts. There is no recovery product, qualification service or migration authority. Predecessor external state remains outside dev-2 and untouched. Removal of any later abstraction must be the default whenever these invariants still hold without it.

## Known architectural risks, not hidden assumptions

Same-ref parallel integrations can require repeated full validation after head movement. D0007 scores this cost and blocks a superiority claim on failure. SQLite short synchronous operations may limit the control plane under load; measure event-loop and admission latency before adding workers. The chosen Linux sandbox requires a capable host; no such host is claimed provisioned. A brief broker update interruption is accepted, but stable work survives and only one writer can run. Node's SQLite API pin and actual modern MCP client conformance require their own focused tests.

[Design index and graph](design/INDEX.md) are generated from metadata. [Evidence basis](evidence/2026-09-11-architecture-basis.md) records fresh observations and predecessor classifications. No historical PASS substitutes for a new acceptance test.
