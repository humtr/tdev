# tdev Repository Agent Instructions

> Scope: the entire repository unless a nearer `AGENTS.md` explicitly narrows implementation details for its subtree.
>
> This is repository-owned guidance. A development client, tmcp integration, IDE, or automation runner is an execution surface, not a product-contract owner.

## 1. Required reading order

Before changing source, schemas, tests, deployment assets, or normative documentation:

1. read this file;
2. read [RULE.md](RULE.md) and [SDD.md](SDD.md);
3. read [WORKBOARD.md](WORKBOARD.md) for the current phase and active design pointers;
4. read the active design record under `docs/design/`, when one is listed;
5. read every normative owner document affected by the change;
6. inspect the current implementation and executable verification paths.

Do not infer authority from file names, modification time, conventions, generated output, or a passing test alone.

## 2. Normative authority map

Each contract has one owner.

| Contract | Owner |
| --- | --- |
| Product definition, scope, terminology, product non-goals, product acceptance | `docs/SPEC.md` |
| Components, durable ownership, dependency direction, data placement, concurrency, repository shape | `docs/ARCHITECTURE.md` |
| External schemas, identifiers, digests, Case/Task/Attempt states, MCP control surface, protocol compatibility | `docs/PROTOCOL.md` and canonical files under `protocol/schemas/` |
| Agent Operation catalog, effects, profiles, inputs, results, retry and reconciliation | `docs/OPERATIONS.md` |
| Trust boundaries, Agent identity, Workspace authority, path and secret policy | `docs/SECURITY.md` |
| Installer, setup, Cloudflare resources, release cohesion, upgrade, rollback and recovery | `docs/DEPLOYMENT.md` |
| Milestones, vertical slices, acceptance scenarios, verification and release gates | `docs/MVP.md` |
| Repository change method and design-record requirements | `SDD.md` |
| Cross-cutting implementation and evidence guardrails | `RULE.md` |
| Current phase and pointers only | `WORKBOARD.md` |

`AGENTS.md`, `WORKBOARD.md`, design records, generated files, tests, and implementation code do not silently override a normative owner. A design record may propose an owner change; the owner document must be updated before or with implementation.

## 3. Conflict handling

When documents, schema, code, tests, generated output, or runtime evidence disagree:

1. stop the dependent change;
2. identify the fact and its normative owner;
3. classify the mismatch as an implementation defect, stale documentation, unapproved design change, environment difference, contaminated output, or unresolved unknown;
4. resolve it in the owner and update dependent representations;
5. verify the effective result.

Never normalize a conflict with an undocumented fallback.

## 4. Change admission

Every change needs a bounded contract:

- one-line definition;
- affected owner documents and paths;
- current contract;
- non-goals;
- acceptance criteria;
- verification method;
- remaining unknowns and stop gates.

Use the change classes and design-record rules in `SDD.md`. Major changes require an accepted design record before implementation. A direct maintainer decision can accept a design record, but it does not remove the need to update the correct owner.

## 5. tdev implementation invariants

- One durable fact has one canonical owner.
- `CaseDO` owns Case, Task, Attempt, control decisions, evidence mapping, and terminal outcome.
- `AgentDO` owns Agent connection, epoch, queue, delivery receipts, and fencing.
- The terminal Agent alone performs local operating-system effects.
- D1 is a locator/projection store; R2 owns bytes, not lifecycle truth.
- Public effects are versioned typed Operations. Do not add an unrestricted shell surface or a silent typed-to-shell fallback.
- Unknown external effects remain explicit uncertainty until reconciled.
- Exact identity, revision, digest, permission, deadline, output, cancellation, and retry boundaries are preserved.
- Domain packages do not import Cloudflare, Termux, filesystem, Git CLI, network, or process implementations.
- The only claimed host is Termux on Android ARM64 until reference-host evidence changes `docs/SPEC.md` and `docs/MVP.md`.

## 6. Schema and generated code

`protocol/schemas/tdev.v1.schema.json` is the M0 canonical external contract.

- Edit canonical schema and generator inputs, not generated Go or TypeScript files.
- Regenerate both languages in the same change.
- Keep TypeScript and Go validation, canonicalization, and digest behavior equal through shared or equivalent vectors.
- Reject unsupported schema keywords; do not ignore them as successful validation.
- Treat generated Go `json.RawMessage` unions as untrusted wire values until schema validation and domain discrimination succeed.
- A public or stored schema change requires compatibility, migration, and rollback analysis in its owner design.

## 7. Testing and evidence

For the M0 foundation, retain the four consolidated test files unless a genuinely separate runtime boundary is introduced. Extend fixture tables and transition matrices rather than duplicating setup.

Tests must:

- observe public/domain results, not hidden implementation state as the success condition;
- cover allowed and forbidden paths;
- avoid sleep as correctness synchronization;
- preserve failed, skipped, unsupported, contaminated, truncated, or unexecuted results as non-clean evidence;
- prove the scope they claim and no broader layer.

Minimum deterministic source gate for the current repository:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
go vet ./...
git diff --check
```

Run additional owner-specific gates named by the active design record. A source gate does not prove installation, Cloudflare deployment, Agent service, public MCP, client schema, or rollback.

## 8. Git and preservation

- Work from an exact observed base in an isolated branch or worktree.
- Review the complete diff before commit.
- Stage only intended paths.
- Do not reset, clean, force-push, rewrite unrelated history, or modify unrelated refs and worktrees.
- Do not change global or repository credential and identity configuration as a convenience.
- Preserve secrets, local profiles, runtime processes, Cloudflare resources, routes, and unrelated generated artifacts.

## 9. Completion language

Report completion by affected layer:

```text
contract/schema
source/checkout
unit/state tests
build/package
installation
Cloudflare resources and migrations
active Edge
Agent service and authenticated connection
public MCP
current client schema
rollback/recovery
```

Use `completed` only for the layers independently observed. Use `blocked` or `unverified` when a required fact is unknown. A terminal job, notification, test, or push alone does not prove unrelated layers.

## 10. Nested instructions

A nested `AGENTS.md` may add local build, generated-code, or verification details. It must not redefine product terminology, ownership, security, public schema, milestone acceptance, or repository-wide evidence rules. Such a change belongs in the corresponding normative owner and, when major, an accepted design record.
