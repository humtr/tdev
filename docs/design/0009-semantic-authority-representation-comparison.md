# Design 0009 — Semantic-Authority Representation Comparison

- Status: verified
- Class: 2
- Date: 2026-08-09
- Target development identity: `mvp-1a-6`
- Direct code parent: exact `mvp-1a-5@aaf7ec9258fb776443dd70345a1acea33ed22d78`
- Owners: `docs/SPEC.md` for current semantics, `docs/ARCHITECTURE.md` for current implementation boundaries, `docs/PROTOCOL.md` for durable/public identities, this record for the bounded comparison gate, and `docs/MVP.md` for verification evidence

> Verified scope: this record verifies only non-authoritative representation models, comparison harnesses, tests, checked evidence, and the resulting structural candidate decision. It does **not** change `CaseEngine` canonical authority, `treeDigest`, snapshot schema v2, journal formats, durable publication semantics, Git OID status, provider/distributed ownership, migration behavior, or rollback/downgrade behavior.

## 1. One-line decision

Compare the current full canonical text-tree authority against bounded-fanout content-addressed structural models under the existing Promotion oracle, while treating a small transactional root/head as an orthogonal publication requirement rather than a substitute data structure; if a candidate wins structurally, advance it only to a separate Class 2 migration design.

## 2. Facts, evidence, inference, and unknowns

### 2.1 Current implementation facts

- Canonical semantic state is a complete normalized map `path -> UTF-8 text`.
- Current tree identity is `digest(tree)`: SHA-256 over the complete canonical JSON text tree with no tree-specific digest domain.
- Promotion clones the complete base tree, validates the complete tree, computes the complete tree digest, and returns the complete final tree.
- A successful Case snapshot retains complete tree material in the compiled Plan, canonical state, and successful Promotion accepted result.
- Snapshot v2 and journal formats are current authority and are not changed by this design.
- Git OIDs include repository/object-format and mode semantics that are not part of current tdev text-tree identity; Git remains a derived projection.

### 2.2 Verified predecessor evidence

D0008 configured 32 authority-path samples across 1k/5k/20k/100k trees, 1/8/128/broad writes, and wide-flat/deep-path shapes. All 24 completed 1k/5k/20k samples matched the current Promotion oracle and cold restore. All eight 100k samples hit declared time/RSS stop gates, including sparse writes. The checked predecessor artifact is `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json`.

### 2.3 Inference to falsify

A bounded-fanout persistent structure may make **candidate root update work** proportional to touched paths plus bounded tree height instead of total entry count. However, if current `digest(full tree)` remains a required authoritative identity on every transition, computing that compatibility digest still requires complete materialization/canonical hashing. Therefore a persistent structure alone cannot remove the full-tree authority cost without a later explicit identity migration.

### 2.4 Unknowns this gate owns

- Which bounded-fanout structural family best preserves deterministic text-tree semantics under sparse and broad batches?
- Whether directory-shaped Merkle metadata is sufficiently bounded or still amplifies wide directories.
- Whether path-byte radix locality is preferable to hash-trie fixed-depth locality under the declared workloads.
- How much node/hash/write amplification each candidate creates for broad updates.
- Whether a candidate remains deterministic under different write/input orders.
- Whether structural gains survive the cost of compatibility materialization to the current full-tree digest.

Unknowns about provider storage, distributed transactions, hostile-store authentication, real Git publication, production GC scheduling, and production migration remain outside this gate.

## 3. Current contract and the problem boundary

The current semantic contract remains the complete normalized text map. For every completed comparison sample, the authoritative oracle is the current source path:

1. construct the current Plan/base tree;
2. produce a legal ChangeSet;
3. obtain the current Promotion result;
4. materialize the model candidate back to a complete text map;
5. require canonical JSON equality and current `digest(tree)` equality with Promotion.

A model root digest is **research identity only**. It cannot be substituted for current `treeDigest`, persisted into snapshot v2 as authority, or used by current restore logic.

The key problem is two-dimensional:

- **representation work:** how many nodes/bytes/hashes must change to derive a new root from a batch of writes;
- **legacy-identity compatibility work:** how much complete materialization/canonical hashing remains necessary while current `digest(full tree)` is still authoritative.

The harness must report those dimensions separately. A fast candidate root that still depends on a full compatibility digest is not evidence that current production authority has become sparse.

## 4. Candidate families

### C0 — Current flat full-tree baseline

Model the current authority cost explicitly: complete entry clone/validation/hash work and complete legacy digest. This is the correctness baseline, not a new representation.

### C1 — Directory Merkle reference model

Represent path segments as directories whose digest includes sorted child names/types/digests. This is a deliberately simple Merkle reference. It is retained to falsify the assumption that a directory Merkle automatically bounds sparse updates: a single wide directory can still require hashing metadata proportional to its child count.

C1 is not eligible for advancement if a one-path update in a wide directory requires root/ancestor metadata work proportional to total siblings.

### C2 — Bounded-fanout path-byte radix CAS

Represent normalized UTF-8 path bytes in an immutable bounded-fanout radix/trie. Branch fanout is bounded by the byte alphabet; terminal values carry the exact normalized path and text content. Branch and value identities use distinct typed research domains. A batch update clones/re-hashes only changed radix paths and shared ancestors. Materialization walks nodes in deterministic byte order and reproduces the complete current text map.

Required research domains:

- `tdev.research.semantic-value.v1`
- `tdev.research.semantic-radix-node.v1`
- `tdev.research.semantic-radix-root.v1`

These domains are intentionally not production protocol identifiers.

### C3 — Bounded-fanout path-hash trie CAS

Hash normalized path bytes into a fixed-radix key and store immutable bounded-fanout trie nodes. Collision buckets retain and sort complete paths so correctness never depends on assuming hash collision impossibility. Node/value/root types use separate research domains. The fixed-depth key removes path-length sensitivity but sacrifices path-prefix locality and may amplify broad batches.

Required research domains:

- `tdev.research.semantic-value.v1`
- `tdev.research.semantic-hashtrie-node.v1`
- `tdev.research.semantic-hashtrie-root.v1`

### C4 — Small transactional root/head

C4 is **not** scored as an alternative tree representation. It is the publication/ownership mechanism that any future persistent-root candidate would require: a small record naming representation version, root identity, generation/expected predecessor, and migration epoch, updated with one trusted CAS/transaction.

D0009 may measure hypothetical head bytes and update count, but may not implement it as current authority. A structural winner without a credible single-writer transactional head cannot advance to migration design.

### Deferred structural alternatives

Canonical B-tree/B+tree or content-defined ordered pages remain valid follow-up candidates if C2/C3 fail. D0009 does not pretend that a non-canonical insertion-order-sensitive B-tree is suitable merely because it is balanced.

## 5. Identity and deterministic-equivalence rules

Every model must satisfy all of the following:

1. Materialized `path -> text` map is byte-for-byte canonical-JSON equal to current Promotion output.
2. `digest(materializedTree)` equals current Promotion `treeDigest` for completed oracle samples.
3. Model root identity is deterministic for the same semantic tree regardless of initial insertion order or write order.
4. Node/value/root digest domains are type separated. No candidate may reuse current generic `digest(tree)` as an internal node digest.
5. Path policy, UTF-8 scalar-string behavior, topology rules, file/tree limits, conflict rules, and ChangeSet semantics are inherited from current owners and are not relaxed by the harness.
6. Collision handling, if a candidate hashes paths, must remain correct even under an injected same-key/collision test; correctness cannot rest on cryptographic probability.

## 6. Workload and measurement contract

### 6.1 Shapes

The comparison uses at least:

- `wide-flat`: all files share one wide directory;
- `deep-path`: all files share a deep prefix and one wide leaf directory;
- `balanced-directory`: files are distributed across deterministic bounded directory groups to expose the best case for directory Merkle metadata.

### 6.2 Sizes and write batches

Default checked matrix:

- entries: `1_000`, `5_000`, `20_000`, `100_000`;
- writes: `1`, `8`, `128`, and `broad` where broad is `min(10_000, ceil(N/4))`;
- changes modify existing paths for direct comparison with D0008;
- focused correctness tests additionally include deterministic create, delete, write-order permutation, and collision-bucket cases.

### 6.3 Primary evidence

Operation/byte evidence is primary:

- initial nodes/values built;
- node/value canonical bytes hashed;
- path-key hash operations/bytes for candidates that hash normalized paths before structural lookup;
- update node reads;
- new immutable nodes/values written;
- nodes/values reused;
- node hashes recomputed;
- maximum fanout/height;
- hypothetical head bytes and head writes;
- full materialization node reads and output bytes;
- legacy compatibility canonical bytes hashed;
- complete-map equality and current legacy digest equality.

Wall-clock and RSS are secondary noisy evidence only.

### 6.4 Stop gates

- no sample beyond the current 100k-entry contract ceiling;
- no write batch beyond the current 10k-write ChangeSet ceiling;
- default per-sample wall gate: 30 seconds;
- default process RSS gate: 768 MiB;
- stopped samples are recorded, never extrapolated into successful results.

## 7. Structural advancement criteria

A candidate may advance to a later migration design only if all correctness rules pass and its checked evidence demonstrates:

- sparse root-update structural work does not scale linearly with total entry count for 1/8/128 writes;
- no unbounded sibling fanout causes a sparse update to hash metadata proportional to a wide directory's complete child count;
- broad updates are batch-aware: shared ancestors are re-hashed once per batch rather than once per write, and measured structural work is explained by unique affected nodes rather than sequential `K * full-path` rebuilds;
- deterministic root equality across write-order permutations;
- complete materialization remains available and exactly reproduces current semantics;
- the candidate's required small head can be published by a single trusted CAS/transaction without making immutable-node caches or Git OIDs authoritative by implication.

No fixed wall-clock speedup is sufficient by itself. A candidate that wins time but violates an invariant is rejected.

## 8. Rejected shortcuts

- **Git tree/commit OID as semantic authority:** rejected in this gate. Git identity contains semantics outside current tdev text-tree authority and varies with object format/modes.
- **Naive directory Merkle = solved:** rejected unless wide-directory structural counts are bounded by evidence.
- **Keep current full-tree digest and call sparse root authoritative:** rejected. The current engine/protocol still requires the complete legacy digest, so this would hide rather than remove O(N) authority work.
- **Benchmark insertion-order-sensitive B-tree and call it canonical:** rejected.
- **Sequentially replay each write through an immutable structure and call broad-update amplification inherent:** rejected; candidates must receive a sorted batch and may share ancestor work.
- **Use wall-clock alone:** rejected; operation/byte counts are the primary claim.
- **Change snapshot v2 or current Promotion to make the prototype look good:** rejected.

## 9. Failure, corruption, repair, and GC requirements for any future migration

D0009 does not implement these production behaviors, but a candidate cannot advance unless a later migration design can satisfy them:

- missing, malformed, type-confused, or digest-mismatched nodes fail closed;
- root/head publication has one expected-predecessor CAS/transaction owner;
- an ambiguous root/head publication is resolved by authoritative re-read, not blind retry;
- repair may rebuild from a trusted authoritative predecessor/materialized tree and must compare the rebuilt root before publication; derived Git state is not a trusted repair source by default;
- immutable node GC is reference-aware and cannot delete nodes reachable from any live root, protected migration predecessor, rollback checkpoint, or in-flight publication;
- self-digests provide corruption detection, not hostile-store authentication;
- resource bounds exist for node size, fanout, depth, traversal, repair, and GC.

## 10. Migration, mixed writers, and rollback requirements for a later design

A future authority migration must be a separate accepted Class 2 record and must define at minimum:

1. a versioned semantic-root profile and domain-separated root/node/value identities;
2. an explicit mapping from current normalized text tree to the new representation;
3. a migration epoch or quiescence rule that prevents old full-tree writers and new root writers from concurrently claiming authority;
4. single-write / dual-read behavior, if used, with exact precedence and failure rules;
5. how legacy `digest(full tree)` is retained, recomputed, or retired during cutover;
6. rollback before first new-format authoritative write and downgrade behavior after it;
7. root/head CAS or transaction fencing, ambiguous-outcome reconciliation, and restart recovery;
8. corruption detection, scrub, repair, and immutable-node GC;
9. provider-independent semantic identity and a separate derived Git projection identity;
10. proof that old snapshots either remain readable or fail with an explicit migration/format boundary rather than being silently reinterpreted.

D0009 explicitly does not choose these migration mechanics.

## 11. Security consequences

Typed candidate domains reduce cross-type digest confusion but do not authenticate an attacker-controlled node store. A future trusted root/head needs an explicit storage trust/authentication model. Any path-hash trie must keep complete paths in collision buckets and validate materialized paths with current policy. Node fetches, proofs, GC, and repair must be bounded; a content-addressed graph is not safe merely because every object has a digest.

## 12. Verification matrix

D0009 becomes `verified` only when all rows close:

| Requirement | Falsifier | Required evidence |
| --- | --- | --- |
| Current semantics preserved | any completed model materializes a different canonical tree or legacy digest | focused tests plus checked matrix equality |
| Root determinism | same tree via permuted input/write order gives different model root | deterministic permutation tests |
| Collision correctness | injected same-key bucket loses/aliases a path | focused collision test |
| Wide-directory Merkle claim | C1 sparse update hashes sibling metadata proportional to N | explicit count retained as rejection evidence |
| Bounded sparse update | C2/C3 1/8/128 structural update work grows linearly with N | node/hash/read/write count matrix |
| Broad batch behavior | candidate re-hashes shared ancestors independently per write or stops pathologically below current limits | broad-update unique-node counts and stop record |
| Compatibility tax visible | harness hides complete materialization/current digest work | separate candidate-root and legacy-compatibility metrics |
| Head requirement separated | structural model implicitly treats its node store as published authority | explicit hypothetical-head metrics and design boundary |
| Source safety | comparison code changes production `src/` authority behavior or durable formats | effective diff review |
| Repository gate | syntax/tests/demo/durable-demo or diff check regress | standard source gate on compatible POSIX environment |

## 13. Verification evidence and completion decision

D0009 is verified for its declared non-authoritative comparison scope on 2026-08-09.

### 13.1 Verification layers

- Final path-key-aware comparison candidate: `7ba03082ac94fe75242c22a7b31ca76d933aeb0c`.
- Checked raw matrix: `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json`, SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`.
- Independent Ubuntu/POSIX validation: GitHub Actions run `31306276819`, job `93227063683`.
- Repository source gate: 152/152 tests passed; coverage was 92.57% lines, 83.10% branches, and 95.99% functions; effective diff check passed.
- Focused model gate: materialization/current-digest equality, create/update/delete, rebuild-root equality, input/write-order determinism, injected hash-key collision correctness, directory-Merkle wide-fanout falsifier, bounded sparse-update counts, batch-vs-sequential shared-ancestor hashing, and small hypothetical-head separation all passed.
- Matrix: 12 tree cases × 4 write batches × 3 structural models = 144 model samples; 141 completed and all completed samples reproduced the current Promotion tree and legacy `digest(tree)` exactly. Three 100k broad samples stopped only after candidate-root update, during full compatibility materialization/digest, at the declared RSS gate. Stopped samples are retained rather than extrapolated.

### 13.2 Candidate decisions

**C1 directory Merkle is rejected.** On a 100k-entry wide-flat tree, a one-path update rewrote only one directory node but hashed all 100,000 child references and about 10.2 MB of node metadata. The same failure appears under the deep shape because the wide leaf directory remains. A simple directory-shaped Merkle therefore does not satisfy bounded sparse-update work.

**C2 path-byte radix is a structural survivor.** At 100k entries a one-path update wrote 16 nodes in wide-flat, 32 in deep-path, and 37 in balanced-directory; update hash work remained independent of total entry count in the checked sparse matrix. Its 10k-write 100k broad samples also completed candidate-root update; the balanced sample stopped only later in legacy compatibility materialization/digest. C2 preserves direct normalized-path-byte semantics and prefix locality but incurs greater path-depth/node churn.

**C3 path-hash trie is the preferred structural research candidate.** It remains deterministic, stores complete paths in collision buckets, passed the injected same-key collision test, and retains bounded fanout. At 100k entries a one-path update wrote six nodes for all three shapes. For 128 writes it wrote about 483-487 nodes. In the 100k wide-flat 10k-write sample it wrote 21,756 nodes, performed 31,757 typed node/value hash operations plus 10,000 explicitly counted path-key SHA-256 operations, and hashed about 8.59 MB of typed payload plus 0.50 MB of path-key input. The comparable C2 sample wrote 61,117 nodes, performed 71,118 typed hash operations, and hashed about 15.42 MB. C3 therefore advances as the **preferred candidate to design around**, not as production authority.

**C2 remains the required fallback/reference.** A later migration design must retain it as a comparison point if path-prefix locality, avoidance of path-key hashing, proof construction, repair behavior, or persistent-store/GC constraints materially weaken C3's advantage.

**C4 small transactional head remains orthogonal.** Hypothetical head records stayed about 306-313 bytes. D0009 does not implement or authorize that head; any production persistent root still needs one trusted expected-predecessor CAS/transaction owner with restart and ambiguous-outcome recovery.

### 13.3 Compatibility-tax decision

The checked evidence confirms that a structural root alone does not fix current authority cost. Every completed model still had to materialize the complete text map and compute current `digest(full tree)` to satisfy the present contract. The three stopped 100k broad samples all stopped in this compatibility stage, not in candidate-root derivation. Therefore the current engine must remain full-tree authoritative until an explicit migration design changes identity and persistence rules.

### 13.4 Follow-on authorization boundary

The evidence is strong enough to open a **separate Class 2 semantic-authority migration and transactional-head design**, with C3 as the preferred structural candidate and C2 as fallback/reference. That design must define the versioned production root/profile, type/domain identities, path-key algorithm and collision rules if C3 remains selected, mapping from current normalized text tree, migration epoch/quiescence, mixed-writer exclusion, legacy-digest cutover, rollback/downgrade, root/head fencing and ambiguous-outcome recovery, corruption/scrub/repair, reference-aware GC, provider-independent identity, security bounds, and old-snapshot behavior.

Verification of D0009 never means C2 or C3 has become production authority.

## 14. Non-goals and follow-on gates

D0009 does not implement semantic-root migration, transactional root/head persistence, node-store durability, snapshot v3, journal v4, Git publication, provider storage, cross-host Claims, hostile-store authentication, production GC, or automatic downgrade.

C2 and C3 survive structurally, with C3 preferred by the checked operation/byte evidence. The next gate is therefore a separate Class 2 **semantic-authority migration and transactional-head design**. Only after that design is accepted may production source authority change. A real Git adapter remains a later derived projection/publication gate unless that migration design explicitly changes the contract.
