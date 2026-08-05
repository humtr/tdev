# tdev Design Record Registry

Design records authorize and preserve Class 2 changes under root `SDD.md`. They refine a bounded change but do not replace normative product and subsystem owners.

## Status rules

- `draft`: open design; dependent implementation is not authorized.
- `accepted`: approved bounded design; implementation may start.
- `implementing`: effects are in progress.
- `verified`: stated acceptance was observed at the recorded layers.
- `blocked`: a named hard-stop unknown prevents dependent work.
- `superseded`: a linked record or owner revision replaces the design.

A record marked `verified` can still list future-layer unknowns outside its scope.

Sections named `Source classification`, baseline evidence, baseline contract, and problem describe facts at the record's exact base unless they explicitly say otherwise. Once implementation begins, the record keeps those sections as provenance and adds or updates a `Current implementation status` section, implementation amendments, active stop gates, and the decision log. `WORKBOARD.md` routes only the current gate. Historical statements and satisfied stop gates never override a later owner update or current implementation status.

## Records

| ID | Title | Status | Primary owners |
| --- | --- | --- | --- |
| [0001](0001-repository-governance-and-m0-hardening.md) | Repository governance and M0 hardening | verified | repository process, protocol M0, domain M0 |
| [0002](0002-complete-first-release-product-specification.md) | Complete first-release product specification | verified | product specification and requirement traceability |
| [0003](0003-mcp-adapter-and-projection-contract.md) | MCP adapter and projection contract | verified | MCP wire adapter, semantic projection, and current-client compatibility |
| [0004](0004-casedo-storage-and-public-control-core.md) | CaseDO storage and public control core | implementing | protocol ingress, CaseDO storage, mutation replay, and public semantic control/query |
| [0005](0005-concept-revision-1-transaction-and-contract-boundaries.md) | concept-revision-1 transaction and contract boundaries | verified | transaction portability, logical migration identity, MCP DTO boundary, target-scoped generation |

## Naming

Use zero-padded monotonic IDs and descriptive kebab-case names:

```text
0002-casedo-storage-and-control-core.md
```

Do not reuse or renumber an accepted ID. A superseding design links both directions.

## Record discipline

- Update the correct normative owner before or with implementation.
- Separate authority, evidence, inference, and unknown.
- Preserve rejected alternatives when they explain an invariant or future stop gate.
- Put current active pointers in root `WORKBOARD.md`; do not duplicate the record there.
- Use Git history for provenance rather than appending an unbounded change log.
