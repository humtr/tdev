# Design 0002 — Complete First-Release Product Specification

## Metadata

- Status: `implementing`
- Date: 2026-08-04
- Acceptance authority: direct maintainer request to complete the tdev specification before further implementation
- Base source: `a6a184d3d205f3c6ebb0e6fad095c8b54da4d3c8`
- Affected owners: `docs/SPEC.md`, root `AGENTS.md`, repository governance validation, design registry, and `WORKBOARD.md`
- Implementation paths: `docs/SPEC.md`, `AGENTS.md`, `README.md`, `scripts/check-governance.mjs`, `docs/design/`, and `WORKBOARD.md`

## One-line definition

Complete the normative product specification for the entire first public release scope, from installation through verified recovery, using stable product requirement IDs and executable owner/milestone/evidence traceability without duplicating subordinate architecture, protocol, Operation, security, deployment, or MVP contracts.

## Source classification

### Authority

- `docs/SPEC.md` owns product definition, scope, terminology, non-goals, and product-level acceptance.
- `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, and `docs/MVP.md` own the detailed subordinate contracts identified by root `AGENTS.md`.
- Root `SDD.md` requires a Class 2 design record for product scope, terminology, public behavior, support, security, lifecycle, compatibility, or verification changes.

### Evidence

- At the base source, `docs/SPEC.md` has 304 lines and provides the product direction, core topology, terminology, public MCP surface, major invariants, and thirteen release acceptance statements.
- The subordinate owners collectively contain over 4,300 lines of detailed behavior, state, Operation, security, lifecycle, and verification contracts.
- The existing product specification does not assign stable IDs to functional or quality requirements and does not provide complete requirement-to-owner, milestone, and evidence traceability.
- Product-level actors, prerequisites, management lifecycle, offline behavior, resource bounds, observability, data lifecycle, remote-provider scope, and quality requirements are described only partially or implicitly across subordinate documents.

### Inference

- The implementation can follow subordinate documents, but a reviewer cannot prove that every first-release product capability and quality property has one complete top-level requirement and a named implementation/verification owner.
- Copying detailed schemas or tables into `SPEC.md` would create competing owners; a requirement catalog with links and traceability preserves the existing owner map.

### Unknowns

- Exact heartbeat, lease, retention, payload, Artifact, battery, and background-service defaults remain evidence-gated engineering decisions.
- The first release has no fixed public availability or latency SLA; limits must be explicit and measured before a guarantee is added.
- Support beyond the reference Cloudflare deployment, Termux on Android ARM64, and ordinary Git transport to an operator-controlled remote is not claimed.

## Current contract

- The first release is implemented through milestones M0–M10.
- Only Termux on Android ARM64 is a claimed host.
- The deployment is user-owned in the user's Cloudflare account.
- CaseDO, AgentDO, the terminal Agent, D1, R2, CLI, and remote providers have distinct owners.
- Public development effects are typed Operations; uncertain external effects remain unverified until reconciled.
- Installation, upgrade, rollback, uninstall, destroy, credential removal, and Agent replacement have distinct meanings.

## Problem and evidence

The existing product specification is a strong summary but not yet a complete requirements baseline for the whole first-release implementation. Missing stable requirement identifiers and traceability make it possible for a milestone to be implemented without proving that all product-level capabilities, quality properties, security requirements, and lifecycle obligations are covered. The correction must improve completeness without moving exact schemas, state tables, Operation inputs, Cloudflare resource details, or test procedures out of their current owners.

## Scope

- Define the exact completeness boundary as the first public release described by M0–M10.
- Define actors, deployment assumptions, prerequisites, trust domains, and supported environment.
- Define product-level functional requirements for setup, Agent/Workspace/Project management, Case/Task/Attempt control, typed execution, evidence, lifecycle, and recovery.
- Define product-level quality requirements for durability, consistency, idempotency, boundedness, security, privacy, observability, compatibility, portability, recovery, and unrelated-state preservation.
- Define error and uncertainty semantics at product level.
- Define stable requirement IDs and map each requirement to its detailed owner, milestone, and authoritative evidence class.
- Add an executable governance check for requirement-ID uniqueness and traceability completeness.

## Non-goals

- Implement M1 or any later runtime milestone.
- Change canonical JSON Schema, Case/Task/Attempt state machines, Operation schemas, Cloudflare resource design, Agent protocol, or setup state machine.
- Add new host or remote-provider support claims.
- Select evidence-gated numeric defaults without measurements.
- Replace subordinate owner documents with a monolithic specification.
- Define an unbounded post-MVP roadmap.

## Invariants

- One requirement fact has one normative owner.
- `SPEC.md` states product outcomes and constraints; subordinate documents retain exact design and execution contracts.
- Current canonical terminology, support target, security model, and M0 implementation remain unchanged unless a verified conflict is found.
- Requirement IDs are stable and unique after publication; changing their meaning requires a Class 2 design.
- Every normative first-release requirement maps to at least one detailed owner, milestone, and evidence class.
- No implementation or release layer is claimed complete by this documentation change.

## Owner impact

- Existing owners changed: `docs/SPEC.md` expands its explicit ownership to complete product-level functional and quality requirements plus traceability; `AGENTS.md` is updated to state that responsibility.
- Owner added or removed: none.
- Projections/caches introduced: none. Requirement traceability is normative within `SPEC.md`; the governance script only validates its structure.

## Design

### Requirement model

Use stable identifiers grouped by meaning:

```text
TDEV-FUN-###  functional capability
TDEV-SEC-###  product security and privacy
TDEV-NFR-###  durability, boundedness, observability, compatibility, and other quality attributes
TDEV-LCM-###  installation, upgrade, rollback, uninstall, destroy, and recovery lifecycle
TDEV-ACC-###  first-release product acceptance scenario
```

Each normative requirement row contains the requirement statement, detailed owner, first milestone or release gate, and authoritative evidence class. Requirements refer to subordinate sections instead of repeating their exact schemas or algorithms.

### Product boundary

The complete specification covers the first public release from clean Termux installation to setup, authenticated Agent connection, Workspace/Project registration, durable Case execution, exact local and remote effects, evidence-gated completion, upgrade/rollback, and recovery. It does not claim all future product capabilities.

### API and dependencies

No public API or implementation dependency changes. Existing public MCP, CLI management, Agent, Cloudflare, filesystem, Git, and provider boundaries are cataloged at product level and remain detailed in their current owners.

### Ordering, concurrency, retry, and cancellation

The specification restates product outcomes only: one canonical owner, durable intent before external effects, one high-cost Agent execution slot in the MVP, idempotent redelivery, reconciliation before retry when an effect may have started, and cancellation distinct from effect absence. Exact transitions remain in `PROTOCOL.md` and `ARCHITECTURE.md`.

### Errors and evidence

The product-level error taxonomy distinguishes transport rejection, admission rejection, durable Task failure, domain verdicts, cancellation state, and unverified external effects. Every completion claim is limited to independently observed layers listed by the requirement traceability table and `MVP.md`.

## Security and secret impact

No secret flow changes. The completed specification makes user ownership, credential separation, outbound-only Agent connectivity, path containment, redaction, and same-UID limitations explicit at product level. Detailed threats and key handling remain owned by `SECURITY.md`.

## Compatibility, migration, and rollback

- Compatibility: documentation and governance validation only; no public or stored schema changes.
- Migration: none.
- Rollback: revert the specification commits. No runtime, Cloudflare, Agent, or stored state is affected.

## Vertical slices

1. Register and activate this design record.
2. Replace the summary-style product contract with a complete first-release requirement baseline and traceability model.
3. Extend the governance checker to reject duplicate, missing, or untraced product requirement IDs.
4. Update routing documentation and run focused plus full deterministic source gates.
5. Publish the reviewed task branch, mark the design verified, and fast-forward `concept` under an exact remote lease.

## Acceptance criteria

1. `SPEC.md` explicitly defines the first-release completeness boundary.
2. Product actors, prerequisites, deployment assumptions, trust boundaries, interfaces, lifecycle, and supported environment are stated.
3. Every first-release functional, security, lifecycle, and quality requirement has a stable unique ID.
4. Every requirement identifies its subordinate owner, milestone or release gate, and authoritative evidence class.
5. Exact schemas, state transitions, Operation payloads, Cloudflare details, and test procedures remain in their current owner documents.
6. Product non-goals and evidence-gated unknowns are explicit and do not preserve obsolete internal debates.
7. Governance validation fails for duplicate or untraced requirement IDs and passes for the completed specification.
8. Existing M0 tests and four-test-file policy remain unchanged and green.
9. Complete diff contains only specification, routing, governance validation, design, and workboard changes.
10. The final commit is published and the `concept` branch is fast-forwarded from its exact observed predecessor with no merge commit.

## Verification matrix

| Claim | Command or probe | Authoritative reader | Layer | Contamination/skip rule |
| --- | --- | --- | --- | --- |
| requirement uniqueness and traceability | `npm run check:governance` | repository files and checker | contract/source | any parser warning or missing mapping is failure |
| existing generated/domain behavior unchanged | `npm test` and `go vet ./...` | test runners and Go tool | source/unit | skipped or failing gate is unknown, not clean |
| owner links and active design coherent | governance checker and bounded file reads | repository files | contract/source | broken link or status mismatch is failure |
| scoped effective change | exact Git status and complete diff | Git | source/checkout | unreviewed or unrelated path is failure |
| publication and integration | exact remote branch reads and ancestry | GitHub remote and Git | remote source | ambiguous push is reconciled before retry |

## Verification evidence

Observed on 2026-08-04 in the isolated `tmcp/tdev-full-spec` worktree at base `a6a184d3d205f3c6ebb0e6fad095c8b54da4d3c8`:

- `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `go test ./...`, `go vet ./...`, and `git diff --check` completed successfully.
- The canonical `portable-test` and `portable-install` profiles completed successfully and did not change the seven intended paths.
- The completed specification contains 94 unique traced requirements: 29 functional, 15 security, 13 lifecycle, 22 quality/operational, and 15 release-acceptance requirements.
- Every detailed owner and every M0–M10 plus `Release` gate has at least one requirement.
- Synthetic duplicate-ID, empty-evidence, and invalid-owner requirement rows were rejected by the governance checker in isolated temporary copies.
- The repository still contains exactly four M0 test files; generated drift, cross-language fixtures, state transition matrices, and forbidden domain imports remain clean.
- The effective change is limited to seven specification, routing, governance-validation, design-registry, and workboard paths.

Remote task-branch publication, exact commit observation, and `concept` fast-forward remain pending. This record therefore remains `implementing`.

## Stop gates

- Do not begin M1 until this design is verified and a separate accepted M1 design owns SQLite schema, raw JSON ingress, union discrimination, transaction boundaries, migration, rollback, and storage tests.
- Do not add numeric reliability, latency, retention, battery, or output-limit guarantees without measured evidence and an owner update.
- Do not claim a host or remote provider beyond the stated reference scope without reference-environment acceptance evidence.

## Decision log

- 2026-08-04: maintainer directed completion of the full implementation specification before further implementation.
- 2026-08-04: completeness is bounded to the first public release defined by M0–M10, not an unlimited future roadmap.
- 2026-08-04: the existing owner map is preserved; `SPEC.md` gains product-level requirement and traceability ownership rather than copying subordinate contracts.
- 2026-08-04: stable requirement IDs and executable traceability validation are selected as the completion mechanism.
- 2026-08-04: first-release remote behavior remains provider-neutral ordinary Git transport; no provider-specific API or qualified-provider claim is added.
