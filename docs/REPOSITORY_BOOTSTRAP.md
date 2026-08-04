# tdev Repository Bootstrap and Authority Recovery

> Use this document only when applicable repository instructions or owner routing are absent, unreadable, ambiguous, or conflicting. It is a recovery procedure, not a replacement product specification.

## 1. Classify the instruction state

For each path to be changed, classify the nearest applicable repository instruction as exactly one of:

```text
present
absent
unreadable
ambiguous
conflicting
```

Do not convert unreadable, ambiguous, or conflicting into absent. Absence means no repository-specific routing was found; it is not itself a repository defect.

## 2. Preserve unknowns

Unknowns involving public schema, durable ownership, stored data, security, permissions, concurrency, external side effects, installation, deployment, routing, compatibility, rollback, or real verification are hard stops for dependent mutation. Reversible reading and diagnosis may continue.

## 3. Recover authority from the repository

Inspect, in order:

1. explicit maintainer direction for the current change;
2. nearest applicable `AGENTS.md`;
3. root `WORKBOARD.md` and the design registry;
4. the normative owner map in root `AGENTS.md` and `docs/SPEC.md`;
5. accepted active design records;
6. canonical schemas and source implementation;
7. Git history for provenance;
8. executable validation and live observations for evidence.

Modification time, naming similarity, a generated file, or a passing test cannot promote a document into an owner.

## 4. Temporary change contract

When a persistent design owner is unavailable but the change is safe and bounded, record a temporary contract containing:

- one-line definition;
- confirmed current contract;
- affected paths and layers;
- non-goals;
- acceptance criteria;
- verification method;
- unknowns and stop gates.

The temporary contract governs only the current work. It does not become a permanent product or architecture decision without updating the correct owner and receiving the required design acceptance.

## 5. Conflicts

When owner documents, schema, implementation, tests, CI, runtime, or external observations conflict:

- do not select the most convenient one;
- identify the exact fact and owner;
- preserve all conflicting evidence;
- classify the cause as implementation defect, stale document, unapproved design change, environment difference, contaminated output, or unknown;
- resolve the owner before the dependent change.

## 6. Creating repository governance files

Do not create `AGENTS.md`, `SDD.md`, `RULE.md`, or `WORKBOARD.md` merely because they are missing. Introduce them only with maintainer approval and after the durable owner map is known.

When governance adoption is approved, use this order:

1. confirm normative product and subsystem owners;
2. write the repository-specific `RULE.md` and `SDD.md`;
3. create the design registry and any active design record;
4. implement and verify the approved change;
5. create or update `WORKBOARD.md` as pointers;
6. create or update `AGENTS.md` as the final routing layer.

A single commit may contain these files when the work was performed in that order and the resulting diff preserves the separation of responsibilities.

## 7. Minimum safe behavior before routing is restored

- make no broad or destructive mutation;
- preserve unrelated files, refs, worktrees, credentials, processes, deployments, routes, and secrets;
- do not add generic shell, retry, fallback, owner, dependency, or background work;
- use exact preconditions and bounded output;
- report what is unreadable, what it affects, and what remains unknown.

## 8. Exit condition

Bootstrap mode ends only when the applicable instructions, owner documents, active design, implementation target, and verification path are readable and non-conflicting. Record any remaining unknown in the active design or workboard before implementation continues.
