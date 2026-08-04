# tdev Specification-Driven Development

> Authority: this document owns how a repository change is defined, designed, accepted, sliced, verified, reopened, and closed. It does not own product or subsystem behavior.

## 1. Purpose

tdev coordinates durable effects across an MCP client, Cloudflare Worker, CaseDO, AgentDO, a mobile Agent, local files and Git, remote providers, installation, and recovery. Small ambiguities can create duplicate effects, stale authority, secret exposure, or false completion. Changes therefore proceed from explicit owner contracts and observable acceptance, not from code-first inference.

## 2. Change classes

### Class 0 — editorial

Only wording, links, formatting, or examples change; normative meaning, schemas, commands, acceptance, and support claims do not.

Required:

- identify the owner document;
- state why meaning is unchanged;
- run link/format or relevant documentation checks.

### Class 1 — bounded implementation

A local implementation defect or internal refactor is fixed without changing public schema, durable ownership, state meaning, security boundary, compatibility, deployment, dependencies, or acceptance.

Required temporary contract:

- one-line definition;
- current owner contract;
- scope and non-goals;
- acceptance;
- focused and regression verification;
- remaining unknowns.

A dedicated design record is optional unless the change crosses more than one owner or exposes a missing decision.

### Class 2 — designed change

A design record is mandatory before implementation when any of these may change:

- product scope, terminology, non-goals, or support claim;
- public MCP tool, Operation, JSON schema, stored state, identifier, digest, state, event, or failure meaning;
- canonical owner, component boundary, dependency direction, queue, concurrency, retry, cancellation, or background work;
- Workspace authority, Agent identity, fencing, path policy, approval, secret handling, or trust boundary;
- external dependency, build tool, release asset, installer, setup, Cloudflare resource, migration, upgrade, rollback, or recovery;
- verification method or evidence required for completion;
- an implementation workaround that would outlive the current slice.

When uncertain, classify upward until the owner impact is resolved.

## 3. Design record location and status

Designed changes live under `docs/design/` and are listed in `docs/design/README.md`.

Status vocabulary:

```text
draft          problem and alternatives are still open
accepted       the bounded design is approved for implementation
implementing   implementation is in progress under the accepted design
verified       stated acceptance has been independently observed
superseded     another record or owner revision replaces it
blocked        a named hard-stop unknown prevents dependent work
```

Only `accepted` or `implementing` records authorize a Class 2 implementation. Acceptance requires an explicit maintainer decision or repository process that has equivalent authority. A record cannot accept itself merely because code exists.

## 4. Mandatory design-record sections

Every Class 2 record contains:

1. **Metadata** — ID, title, status, date, owners affected, implementation paths.
2. **One-line definition** — the exact end state.
3. **Source classification** — repository authority, measured evidence, inference, and unknowns kept separate.
4. **Current contract** — what the affected owners say before the change.
5. **Problem and evidence** — reproducible facts, not anticipated preference.
6. **Scope** — facts and layers the record may change.
7. **Non-goals** — adjacent work explicitly excluded.
8. **Invariants** — facts that must remain true.
9. **Owner impact** — owners added, removed, or updated; normally no owner is added.
10. **Design** — data, states, APIs, dependencies, ordering, bounds, errors, cancellation, retry, and evidence as applicable.
11. **Security and secret impact**.
12. **Compatibility, migration, and rollback** — or an explicit explanation why each is not affected.
13. **Vertical slices** — the smallest production-shaped increments using final boundaries.
14. **Acceptance criteria** — observable outcomes.
15. **Verification matrix** — command/probe, authoritative reader, layer, and contamination rules.
16. **Unknowns and stop gates** — unresolved facts and work they block.
17. **Decision log** — material accepted changes and evidence-driven reopenings.

Do not pad an unaffected section; state `not affected` with the reason.

## 5. Owner-first workflow

### Phase A — route and define

1. Discover applicable `AGENTS.md` files and explicit overrides.
2. Read `WORKBOARD.md`, the design registry, and affected normative owners.
3. Inspect source, Git state, schemas, generated output, tests, and available validation.
4. Classify instruction and evidence state as present, absent, unreadable, ambiguous, or conflicting.
5. Write the bounded change contract and identify hard-stop unknowns.

### Phase B — design and freeze

1. Create or update the design record for Class 2 work.
2. Name each affected owner and representation.
3. Define failure, uncertainty, retry, cancellation, bounds, and unrelated-state preservation.
4. Define acceptance and verification before implementation.
5. Update normative owner documents and canonical schemas when the accepted design changes them.
6. Mark the record `accepted`, then `implementing` when effects begin.

### Phase C — production-shaped vertical slices

Implement the smallest slice that crosses final boundaries and can be disproved cheaply. Do not build a compatibility scheduler, parallel owner, mock-only path, or generic escape hatch that the target design excludes.

For each slice:

- preserve exact target and source revisions;
- update the canonical owner first;
- update generated and dependent representations;
- add focused regression coverage in the existing appropriate test boundary;
- run low-cost counterexamples before broad gates;
- review the complete diff.

### Phase D — verify and close

1. Run focused tests.
2. Run the deterministic repository gate.
3. Run integration, reference-host, live Cloudflare, public MCP, client-schema, and rollback gates only when affected.
4. Re-read status from authoritative owners after mutations.
5. Record skipped, unsupported, contaminated, unavailable, or unexecuted gates as unknown, not clean.
6. Update the design record with evidence and remaining unknowns.
7. Update `WORKBOARD.md` only after the owner and implementation are coherent.
8. Mark the design `verified` only for acceptance actually observed.

## 6. Source, evidence, inference, and unknown

A design record labels material claims:

- **Authority** — current normative owner or canonical schema.
- **Evidence** — a command, test, runtime observation, remote observation, or Artifact tied to exact inputs.
- **Inference** — a conclusion drawn from named authority/evidence.
- **Unknown** — a missing, ambiguous, conflicting, stale, unsupported, or unexecuted fact.

Inference cannot become authority without updating the owner. Unknowns affecting public behavior, durable data, security, concurrency, external effects, installation, deployment, routing, rollback, or real verification stop dependent mutation.

## 7. tdev-specific design checks

Every relevant record answers:

- Which fact is owned by CaseDO, AgentDO, Agent, CLI, D1, R2, Git, filesystem, remote provider, or client?
- Does a new store or background process duplicate an owner?
- What exact identity and revision fence every write?
- What happens after a response is lost at each external-effect boundary?
- Is redelivery the same Attempt, or is an explicit retry decision required?
- How do cancellation request, local termination, effect observation, and canonical terminal state differ?
- Which authority intersection permits the effect?
- Which secrets could reach input, argv, output, Events, Artifacts, or reports?
- Which layer verifies completion, and which layers remain unverified?
- Does the reference-host support claim change?

## 8. Schema and stored-state changes

A schema or persistence change specifies:

- canonical source and version;
- input, stored, event, result, and generated representations affected;
- compatibility range and negotiation;
- forward migration preconditions;
- rollback compatibility or rollback barrier;
- old-reader and old-writer behavior;
- digest and canonicalization changes;
- cross-language vectors;
- rejection of unknown or unsupported features.

Additive fields are not automatically compatible. Renaming an owner, state, effect, outcome, or identifier is breaking unless a versioned bridge is explicitly designed.

## 9. Verification by layer

Use the narrowest authoritative reader for each claim.

| Layer | Typical evidence |
| --- | --- |
| Contract/schema | owner diff, schema validation, generated-diff check |
| Source/checkout | exact commit, tree, status, complete diff |
| Unit/domain | deterministic state and fixture tests |
| Build/package | reproducible build/package outputs and digests |
| Installation | installed files and selected release identity |
| Cloudflare | exact resource IDs, bindings, migrations, active probe |
| Agent | binary/service identity plus authenticated connection and epoch |
| Public MCP | endpoint behavior under current catalog and token |
| Client | actual client-visible schema and behavior |
| Rollback/recovery | active predecessor, compatible state, public and Agent probes |

Do not infer a higher layer from a lower one.

## 10. Evidence-driven reopening

Reopen an accepted design when implementation or validation proves:

- the chosen owner cannot preserve the invariant;
- a schema cannot express or validate required behavior;
- the external platform has different ordering, identity, or compatibility behavior;
- the reference host cannot meet the assumed lifecycle or security property;
- the verification method cannot observe the acceptance criterion;
- a fallback or new dependency would be required.

Record the evidence, set the record to `draft` or `blocked`, update the owner decision, and resume only after re-acceptance.

## 11. Workboard discipline

`WORKBOARD.md` is a router, not a design record or changelog. It may list current product phase, active design IDs, current source gate, next gate, and blocking unknowns. Scope, non-goals, acceptance, detailed decisions, and evidence remain in their owners and design records.

## 12. Completion report

A completed change reports separately:

- instructions and owners applied;
- design record and status;
- source/branch/commit identities;
- acceptance satisfied;
- verification executed and its scope;
- unchanged adjacent layers;
- remaining unknowns and next gate.

Use the repository or task terminal vocabulary. Do not describe an unexecuted layer as clean.
