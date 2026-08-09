# Design 0008 — authority-boundary verification and durability admission

- Status: draft
- Class: 2
- Target development identity: `mvp-1a-5` candidate; no implementation identity is established by this draft
- Direct code parent: `mvp-1a-4` / `1ff7c5d321958df725497d4e3a2649e210b029db`
- Evidence date: 2026-08-09
- Affected owners: `WORKBOARD.md`, `README.md`, `LINEAGE.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `docs/IMPLEMENTATION_REPORT.md`; prospective behavior changes may later require `docs/SPEC.md` and `docs/PROTOCOL.md`

> Draft authority: this record identifies the next Class 2 verification/admission gate and its known problems. It does **not** authorize production code or change the current semantic identity, snapshot schema, persistence format, migration rule, rollback rule, or Git publication contract. Under `SDD.md`, code begins only after this record is accepted or replaced by a more precise accepted design.

## 1. One-line definition

Before changing semantic-tree representation or treating a real Git adapter as a Promotion performance solution, measure the complete current authority path and close durable-admission, local-journal namespace, commit-ambiguity, and checkpoint/claim liveness gaps while preserving the existing semantic authority model.

## 2. Current repository facts

These are source facts in exact `mvp-1a-4@1ff7c5d321958df725497d4e3a2649e210b029db`, not future design decisions.

1. `CaseEngine.snapshot()` contains the compiled `plan`, `caseContract`, complete Events, `canonicalTree`, `canonicalDigest`, Task states, Attempts, receipts, and a whole-snapshot digest.
2. The compiled Plan contains the complete validated `baseTree` and `baseDigest`.
3. A successful Promotion result contains the complete final `tree` and `treeDigest`; after acceptance the same semantic final tree is also held as `CaseEngine.canonicalTree`. Accepted Promotion state therefore retains a complete final tree inside Task state in addition to the canonical tree.
4. Current semantic files are normalized relative paths mapped to Unicode scalar text bounded as UTF-8. Git mode, arbitrary binary, symlink, gitlink/submodule, and LFS object semantics are not represented in the canonical tree.
5. Current tree identity is `digest(canonicalTree)`, i.e. SHA-256 over canonical JSON with the ordinary `sha256:<hex>` digest format. It is not a Git tree OID and is not made equivalent to Git object identity by this design.
6. `DEFAULT_LIMITS` bounds individual domain structures, including a default 16 MiB canonical tree and 32 MiB Plan. `FileSnapshotStore` and journal stores separately default to a 64 MiB materialized snapshot/file limit. The current contracts do not prove that every combination of individually valid Case data is guaranteed to fit every configured durable store limit.
7. The legacy `JournalSnapshotStore` rejects a `delta-from-*` immutable-v2 namespace, validates canonical bytes for recognized legacy delta records, and rejects many replay corruptions. Its committed-delta enumeration currently filters to regular files whose names match `delta-<16 digits>.json`; malformed committed-looking legacy `delta-*` names and recognized-name non-regular entries are not all rejected by that enumeration. `ImmutableJournalSnapshotStore` has the stricter committed-namespace/file-type checks.
8. Immutable-journal publication can return `store_commit_ambiguous` after final-slot hard-link publication when the required directory sync fails. The source preserves that possible success for reconciliation; the current checked-in suite has no deterministic fault injection proving that exact boundary.
9. `runDurableCase` persists a running Attempt before dispatch. During settlement, the runner mutates the in-memory terminal state, awaits the durable checkpoint, then releases a terminal Claim lease. The current reference path has no separate release/reconciliation branch specifically for a settlement-checkpoint exception between those steps.
10. D0007 evidence proves exact-byte-gated materialization reuse for its declared 32-Task / 4 KiB local workload. It does not prove aggregate Case persistability, real-repository Promotion scalability, Git publication, or the failure boundaries listed above.

## 3. Evidence, inference, and unknowns

### 3.1 Measured or directly reproduced evidence

- Historical D0006/D0007 evidence shows retained-byte observation was cheaper than repeated strict replay in the measured local immutable-journal workload and that D0007 removed that replay cost without changing durable authority.
- Independent source audit of the current line confirms that snapshot construction still packages the complete Case authority described above and that successful Promotion retains complete final-tree data in both accepted-result state and canonical state.
- Independent real-Git probes show that identical path/text content can yield different Git tree OIDs when file mode changes, and that SHA-1 and SHA-256 repositories represent object identity differently. Git OID is therefore not a drop-in replacement for the current semantic tree digest.
- Independent Phase-zero real-Git measurements found sparse candidate construction can avoid unchanged blob reads, while full semantic materialization/validation/digest and full candidate materialization remain size-dependent. Those research measurements are evidence only; they are not current canonical implementation authority.

### 3.2 Evidence-backed inference

The immediate architectural risk is broader than `promotion.mjs` copying one flat tree. The current persistence/checkpoint boundary packages full semantic state into one Case snapshot, so a touched-path Git candidate alone cannot establish end-to-end Promotion or persistence scalability. The next gate should measure and harden that complete boundary before choosing a new semantic representation.

### 3.3 Unknowns that remain open in this draft

- the exact compositional durable-admission rule and which owner must expose a store-specific capacity to admission;
- the exact recovery rule after settlement state is mutated in memory but its durable checkpoint fails while a cross-Case lease remains held;
- deterministic result of each file publication fault boundary under controlled injection, including directory-sync ambiguity;
- the best future semantic authority representation: current full tree, repo-independent bounded-fanout persistent structure, trusted transactional root/head, or another model;
- migration, rollback, mixed-version writer, repair, GC, and anti-rollback contracts for any authority representation change;
- real repository/context/model/provider costs outside the current source slice.

These unknowns block acceptance of an authority-representation migration. They do not block documenting current gaps or building non-semantic measurement/fault seams after this design is made precise enough for acceptance.

## 4. Concrete problem

The prior next-step framing treated touched-path/content-addressed Promotion in a first repository adapter as the leading represented source-level optimization. New counterexamples qualify that ordering:

- a sparse Git candidate does not remove full current semantic snapshot/materialization work;
- current component limits do not compose into a proven durable-snapshot admission bound;
- the legacy journal's committed namespace is weaker than the fail-closed boundary already required by the protocol and implemented by the immutable journal;
- commit ambiguity exists as a deliberate source outcome but lacks deterministic fault evidence;
- settlement-checkpoint failure and Claim release are not yet closed as a process-loss/liveness story.

Optimizing representation before those boundaries are measured and admitted risks making a faster structure around an authority model whose durability/recovery contract is still incomplete.

## 5. Draft decision: one verification and durability-admission gate

D0008, if accepted, will own one bounded gate with five independent workstreams. They may be implemented in separate small commits, but none may silently change semantic authority representation.

### G1 — complete authority-path instrumentation

Instrument or build a checked harness that separates, on identical inputs:

```text
base/Plan construction
-> ordinary accepted results
-> Promotion candidate construction
-> full candidate validation + semantic digest
-> Promotion-result acceptance
-> complete Case snapshot construction/digest/clone
-> store delta/full-file preparation
-> durable CAS/publication
-> cold restore/replay
-> optional derived Git projection/materialization
```

Report operation counts and bytes as primary evidence. Wall-clock and RSS are secondary environment evidence. Stop gates remain explicit; stopped samples are never extrapolated.

### G2 — aggregate durable-admission closure

Before acceptance, this design must choose one exact rule proving that a transition accepted by the durable runner cannot create a snapshot that the configured store is structurally unable to persist under its declared capacity. Candidate solutions must keep one owner and must not duplicate store truth in arbitrary scheduler policy.

Cheapest falsifier: construct individually legal Plan/result/Event/receipt/tree values whose combined snapshot exceeds a smaller configured durable-store bound, then prove the accepted rule rejects before irreversible dispatch/effect or proves the store can persist the transition.

### G3 — legacy committed-namespace fail-closed parity

Bring the legacy journal's committed-namespace/file-type handling up to the existing fail-closed protocol instead of weakening the protocol to match the current filter behavior.

Cheapest falsifiers include malformed committed-looking `delta-*` names, a recognized delta name occupying a non-regular entry, and a warm instance encountering either after prior materialization. The required result is a deterministic store error before replay/cache reuse; uncommitted dot-temporary files remain non-authoritative.

### G4 — deterministic publication-ambiguity evidence

Introduce a bounded fault seam around local publication stages sufficient to test at least:

```text
temporary create/write
file sync
final rename or no-replace link
case-directory sync
post-commit temporary cleanup
```

A failure before the commit boundary must be proven not applied. A failure after possible final publication must preserve ambiguity and reconcile by re-read before retry. Fault injection is test-only/adapter-local evidence, not a provider durability claim.

### G5 — checkpoint/Claim liveness closure

Define and test behavior when a durable checkpoint fails after in-memory settlement while a cross-Case lease is still held. The accepted design must preserve safety (no premature reuse before durable settlement) and liveness/recovery (no undocumented permanent stranded lease in the supported owner model). A production distributed lease owner remains a later independent layer.

## 6. Authority and non-authority during this gate

Until a later accepted design changes it:

```text
semantic authority     = current Case/Plan/result/Promotion/snapshot contracts
semantic tree identity = current canonical text tree + current SHA-256 canonical digest
store authority        = each existing adapter's documented durable records/CAS boundary
Git object identity    = derived external projection identity only
performance state      = disposable measurement/cache/index state only
```

A Git tree/commit OID must not become Case semantic identity by implication. A future repo-independent persistent tree/root may become semantic authority only through a separate accepted Class 2 migration design with exact schema, compatibility, rollback, repair, and mixed-writer rules.

## 7. Failure, cancellation, recovery, and cleanup requirements

- Measurement or fault-injection failure must not modify canonical source state or existing durable evidence.
- No test seam may convert an unknown publication outcome into a known failure or safe retry.
- Legacy namespace hardening must preserve the existing rule that dot-temporary files are non-authoritative while recognized/malformed committed-looking authority surfaces fail closed.
- Durable-admission rejection must happen before a transition crosses any external-effect boundary that cannot be safely replayed.
- Claim recovery must not release a lease merely because a local checkpoint threw if durable state may still be old; the accepted algorithm must first preserve or re-establish a safe owner observation.
- Disposable harness files, scratch repositories, and projected Git object databases are cleanup-only and may not become a second semantic owner.

## 8. Compatibility, migration, rollback, and deployment

This draft changes no durable format and authorizes no migration yet.

- D0005 legacy-v1 -> immutable-v2 cutover and downgrade barrier remain unchanged.
- D0007 cache rollback remains data-compatible with D0005 bytes.
- A legacy namespace validation fix should reject states that the protocol already classifies as invalid; exact compatibility impact still requires focused fixtures before acceptance.
- Aggregate durable admission may change which oversized-yet-component-valid transitions are accepted; the exact compatibility and error contract must be frozen before implementation.
- Test-only fault seams must have no production state schema.
- No Cloudflare, Git publication, MCP, provider, or distributed migration claim is part of D0008.

Any future semantic root/head migration is a separate Class 2 design and must specify forward migration, mixed-version writer exclusion, rollback/downgrade barriers, corruption/repair, GC, and provider independence.

## 9. Acceptance matrix for making D0008 verified

| Area | Cheapest falsifier / required evidence |
| --- | --- |
| authority unchanged | pre/post semantic fixtures produce identical legal Plan/result/Promotion/snapshot meaning except transitions intentionally rejected by the accepted durable-admission rule |
| instrumentation | one checked harness reports the complete authority path with byte/operation counts and named stop gates |
| aggregate durability | near-limit composite Case cannot pass durable admission into a structurally unpersistable snapshot |
| legacy namespace | malformed committed-looking names and non-regular recognized legacy slots fail closed, including after warm materialization |
| immutable regressions | D0005/D0007 migration, corruption, one-winner, cache-loss, and warm-cache barriers remain green |
| commit ambiguity | deterministic injected post-publication/pre-durability failure returns ambiguity and re-read distinguishes committed/not-committed without blind retry |
| pre-publication failure | deterministic injected failures before publication prove no committed successor |
| Claim/checkpoint liveness | settlement-checkpoint failure has a documented, tested safe lease/reopen outcome; start-checkpoint zero-dispatch guarantee remains green |
| source gate | repository minimum source gate passes without weakened tests |
| historical integrity | Designs 0001-0007 and existing evidence files remain byte-identical |
| provider boundary | unexecuted provider/distributed layers remain `unknown`, not inferred from local tests |

## 10. Acceptance gate for this draft

Before status may move from `draft` to `accepted`, close these design questions explicitly:

1. Which owner exposes the effective durable snapshot capacity to pre-commit admission, and how is that value bound to the durable runner/store instance without becoming semantic Case identity by accident?
2. At what exact transition boundary is aggregate snapshot capacity checked so result-only and external-effect paths remain safe?
3. What exact error and compatibility behavior applies to malformed/non-regular legacy committed namespace entries that older source silently ignored?
4. What exact state/lease observation and recovery sequence follows a settlement checkpoint exception?
5. What deterministic fault seam proves `store_commit_ambiguous` without weakening the production publication primitive?
6. Which full-path measurements are sufficient to decide whether a separate semantic-authority representation design should open next?

## 11. Rejected shortcuts

- **Implement Git OID as semantic identity now:** rejected; mode and object-format counterexamples show it changes or conflates semantics.
- **Implement a Merkle/HAMT tree before the gate:** rejected; representation choice is not yet justified across broad-update, snapshot, migration, and recovery costs.
- **Keep current roadmap and only add a real Git adapter:** rejected as the immediate priority because sparse projection does not close current authority/durability work.
- **Weaken fail-closed protocol to match legacy enumeration:** rejected; the responsible boundary is the implementation.
- **Raise the store byte limit only:** rejected; it moves the failure threshold without proving compositional admission.
- **Release Claim lease in an unconditional `finally`:** rejected as a design shortcut because safety depends on whether terminal settlement became durable.
- **Treat local fsync tests as provider durability:** rejected; local filesystem evidence owns only its declared environment.

## 12. Non-goals and follow-on gates

D0008 does not implement or select:

- a new semantic tree/root representation;
- Git tree/commit OID authority;
- binary/symlink/gitlink/LFS semantic expansion;
- repository publication or remote reference mutation;
- provider/distributed persistence or Claim ownership;
- ContextSlice/model-token transport;
- warm executor/process pools;
- history GC or semantic snapshot compaction;
- public MCP/client behavior.

After D0008 reaches verified evidence, the next Class 2 decision may compare current full-tree authority, a repo-independent bounded-fanout content-addressed semantic structure, a trusted transactional root/head, and other measured alternatives. A real Git adapter remains valuable as a derived repository/projection layer, but it must not be used to bypass the semantic-authority decision.
