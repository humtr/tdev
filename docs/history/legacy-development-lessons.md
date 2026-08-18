# Legacy development lessons

> Historical, non-current, non-authoritative development record. This file is not part of repository bootstrap, current routing, product semantics, source/test/build/runtime authority, or a required per-session reading set. Old refs and object identities below are provenance only.

This note preserves only three branch-local lessons that remained useful for avoiding repeated dead ends when D0036 compacted legacy refs. It deliberately does **not** preserve old source, tests, benchmarks, workflows, packages, branch topology, or executable reproduction environments. Current meaning remains in the current canonical owners on `development`.

## 1. Development-ref taxonomy rename

Source provenance: `concept-1a-7@c263eadd3d36e691e86bcb5f8dbc71c8af0e8a6f`, `docs/design/R0001-concept-development-ref-prefix-migration.md`, Git blob `0a02750bd7b446cc2867de0a6861edc1bbb79abd`.

The one-time `mvp-*` -> `concept-*` migration renamed the development-direction ref family one-to-one while preserving suffixes and exact tips. The useful lesson was to keep development-stage naming separate from the product term **MVP** and to treat stale branch-local "current" prose or cached external branch names as provenance rather than authority. Later self-development owners and D0036 superseded `concept-*` as a positive authority namespace; this record does not revive it.

Current routing and checkpoint meaning are owned by `AGENTS.md`, `WORKBOARD.md`, `LINEAGE.md`, and the active self-development Design, not by this historical ref.

## 2. Real-Git touched-path phase zero

Source provenance: `research/d0008-real-git-promotion-evidence@acd8fab5ea5ac336f26d39f2e875d020a513a428`, `docs/design/0008-real-git-repository-adapter-and-touched-path-promotion.md`, Git blob `3239b2458382585246720b8b5a4eb5e7fae9ae56`.

Sparse Git candidate construction could avoid unchanged blob-content reads and rewrite only changed blobs plus touched ancestor trees, but it did **not** remove the then-authoritative full canonical-tree validation/digest/snapshot cost. A Git tree OID therefore could not be promoted to tdev semantic authority as an optimization shortcut. The experiment also falsified a `100644`-only assumption because the real repository contained an executable `100755` file; Git mode/object-format identity remained distinct from the text-tree semantic identity.

The surviving semantic-representation and derived-Git boundaries are owned by the verified current D0009/D0011 records and their current source/evidence. The phase-zero harness and workflow are not retained here.

## 3. SQLite persistence-S prototype

Source provenance: `research/persistence-s-52e793@1afcd83c54675b2738842a9a87686af4148723fb`, `docs/design/0008-sqlite-transactional-snapshot-prototype.md`, Git blob `59c4b0c123408b0f609136557ecb5f2faa18c881`.

The prototype made `case_head` the online CAS authority while retained transitions were scrub/recovery authority. That changed the detection envelope: ordinary load/CAS could succeed after historical tamper that an explicit strict scrub later rejected. On the observed Node.js 22.16.0 / bundled SQLite 3.49.1 runtime, WAL was not admitted and the prototype used rollback-journal mode with `synchronous = EXTRA`. Its measured 32-task / 4 KiB hot-path p50 was about 1.05 s, retained storage about 7.0 MiB versus the V alternative's roughly 277 KiB, and one strict scrub about 315 ms; those timings were not semantically equivalent because S deferred historical verification to scrub.

Promotion was blocked by unresolved migration/rollback and runtime/API constraints. The later verified D0010 transactional-head design owns the surviving current model; the prototype source, tests, benchmark, and raw evidence are not current implementation inputs and are not copied into this history record.

## Retention boundary

These paragraphs are the retained material. The legacy refs themselves are not owners or archives. If a future current owner needs a historical fact, it may follow the exact provenance above; the old refs need not remain published merely to keep this text authoritative, because this text is not authoritative either.
