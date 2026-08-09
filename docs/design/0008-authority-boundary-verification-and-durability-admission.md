# Design 0008 — authority-boundary verification and durability admission

- Status: accepted
- Class: 2
- Target development identity: `mvp-1a-5`; implementation is authorized only for the bounded G1-G5 gate below and remains unverified until its acceptance matrix closes
- Direct code parent: `mvp-1a-4` / `1ff7c5d321958df725497d4e3a2649e210b029db`
- Evidence date: 2026-08-09
- Affected owners: `WORKBOARD.md`, `README.md`, `LINEAGE.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `docs/IMPLEMENTATION_REPORT.md`; prospective behavior changes may later require `docs/SPEC.md` and `docs/PROTOCOL.md`

> Accepted authority: this record authorizes only the bounded G1-G5 verification, admission, recovery, namespace-hardening, and test-instrumentation work below. It does **not** authorize a semantic-tree/root migration, snapshot schema change, durable-format rewrite, Git OID authority, provider/distributed claim, history GC, or rollback/downgrade change. `verified` still requires the acceptance matrix in section 9 to close with observed source evidence.

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

### 3.3 Remaining unknowns outside this accepted gate

- the best future semantic authority representation: current full tree, repo-independent bounded-fanout persistent structure, trusted transactional root/head, or another model;
- migration, rollback, mixed-version writer, repair, GC, and anti-rollback contracts for any future authority representation change;
- real repository/context/model/provider costs outside the current source slice;
- production/distributed Claim ownership, provider durability, and remote publication behavior.

Those questions remain explicitly outside D0008. The six questions that formerly blocked D0008 acceptance are closed by section 10; they authorize only the bounded implementation and evidence work in this record.

## 4. Concrete problem

The prior next-step framing treated touched-path/content-addressed Promotion in a first repository adapter as the leading represented source-level optimization. New counterexamples qualify that ordering:

- a sparse Git candidate does not remove full current semantic snapshot/materialization work;
- current component limits do not compose into a proven durable-snapshot admission bound;
- the legacy journal's committed namespace is weaker than the fail-closed boundary already required by the protocol and implemented by the immutable journal;
- commit ambiguity exists as a deliberate source outcome but lacks deterministic fault evidence;
- settlement-checkpoint failure and Claim release are not yet closed as a process-loss/liveness story.

Optimizing representation before those boundaries are measured and admitted risks making a faster structure around an authority model whose durability/recovery contract is still incomplete.

## 5. Accepted decision: one verification and durability-admission gate

D0008 owns one bounded gate with five independent workstreams. They may be implemented in separate small commits, but none may silently change semantic authority representation.

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

The SnapshotStore instance owns physical materialized-snapshot capacity. Built-in stores expose an exact capacity assertion over the same canonical snapshot bytes they persist; unbounded memory storage reports no finite ceiling. The Case/Plan contract, snapshot, and semantic digests do not copy or hash the deployment capacity.

Every durable checkpoint candidate is checked exactly before CAS. For an external-effect Task, the durable runner additionally performs a pre-dispatch preview after authority/Claim admission but before the real Attempt mutation: it forks the committed engine, simulates the proposed running Attempt with the same identity/lease, and checks the running snapshot plus maximum contract-bounded success/failure/reconciliation successors against the store owner. Only a passing preview may create/checkpoint the real Attempt and then invoke the executor. Result-only Tasks need no future-effect reserve because a rejected settlement has no irreversible external effect; their exact start/settlement checkpoints still fail before dispatch or leave the durable predecessor authoritative. A durable store that cannot expose capacity may continue result-only operation, but external-effect dispatch fails closed with `store_capacity_unknown`.

Cheapest falsifier: construct individually legal Plan/result/Event/receipt/tree values whose combined running/settlement snapshot exceeds a smaller configured durable-store bound and prove the external executor receives zero calls, any acquired Claim is released, and the durable Case remains at its pre-dispatch revision.

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

This accepted gate changes no durable schema or record format. It authorizes only the behavioral hardening and non-authoritative instrumentation defined here.

- D0005 legacy-v1 -> immutable-v2 cutover and downgrade barrier remain unchanged.
- D0007 cache rollback remains data-compatible with D0005 bytes.
- Legacy Journal states that were already invalid under the fail-closed protocol but happened to be ignored by enumeration now fail deterministically: exact legacy delta names on non-regular entries use `store_journal_file_type`; other non-temporary committed-looking `delta-*` names use `store_journal_filename`; `delta-from-*` keeps `store_journal_format_upgrade_required`; dot-temporary files remain non-authoritative.
- Aggregate durable admission intentionally rejects an external-effect dispatch with `store_snapshot_too_large` when a known finite store cannot fit the maximum supported successor, or `store_capacity_unknown` when the store cannot expose a capacity assertion. Clean in-limit histories and result-only semantics are unchanged.
- Test-only fault seams have no production state schema and default to no injected fault.
- Settlement-checkpoint failure does not change snapshot schema or Claim format; recovery uses the existing durable predecessor plus `reopen:true` semantics and current Claim fencing.
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

## 10. Accepted design decisions — six acceptance questions closed

1. **Capacity owner and binding.** The concrete SnapshotStore instance remains the sole owner of materialized-snapshot capacity. Built-in stores implement `assertSnapshotCapacity(snapshot)` using their existing canonical serialization and configured `maxBytes`; `MemorySnapshotStore` is explicitly unbounded. `CaseRepository`/runners may invoke that capability but do not copy `maxBytes` into Plan, CaseContract, snapshot, or any semantic digest. Third-party stores without the capability are treated as capacity-unknown only where external-effect pre-dispatch proof is required.
2. **Exact admission boundary.** Every durable checkpoint candidate is capacity-checked immediately before store CAS. External-effect dispatch has an earlier zero-effect gate: after authority and Claim acquisition, but before mutating the real Case, the runner previews the proposed running Attempt on a restored clone and checks (a) its running snapshot and (b) the largest contract-valid success, executor-failure/invalid-result, and later reconciliation successor reachable without another external dispatch. The preview uses the actual graph/state transitions with maximum bounded effect-receipt/evidence/error payloads, so blocker/Event growth is included. Failure releases the newly acquired Claim and invokes no executor. Passing preview is followed by the existing real Attempt mutation -> durable running checkpoint -> executor sequence. Result-only Tasks require only exact checkpoint checks because no irreversible external effect precedes a later capacity rejection.
3. **Legacy namespace compatibility.** Dot-temporary files stay ignored. `delta-from-*` remains an explicit format-upgrade error. A recognized legacy `delta-<16 digits>.json` occupying a non-regular entry fails `store_journal_file_type`. Any other non-temporary committed-looking legacy `delta-*` name fails `store_journal_filename`. Existing recognized record parsing/replay errors are unchanged. No bytes are migrated or rewritten; only previously ignored protocol-invalid namespace states become fail-closed.
4. **Settlement checkpoint / Claim recovery.** If settlement mutates memory and its checkpoint throws, that invocation must not release the Attempt lease. The durable store still owns the predecessor snapshot. A later owner loads through `CaseRepository.load(...,{reopen:true})`; reopen/reconcile is CAS-persisted before the engine is returned. If that durable reopen makes the prior Attempt terminal (result-only, or retryable idempotent-external under the existing rules), the runner may then release its lease and continue. If uncertainty requires `reconciling`, the lease remains current until an explicit, fenced reconciliation reaches a terminal Attempt and that successor is durably checkpointed; only then may release occur. No unconditional `finally` release is legal.
5. **Deterministic publication fault seam.** `ImmutableJournalSnapshotStore` gains an instance-local, non-persistent `faultInjector(stage)` test seam with named stages adjacent to temporary write, file sync, final no-replace publication, case-directory sync, and post-commit cleanup. The default is null and leaves production primitives unchanged. An injected failure before final publication must produce a known write failure with no successor slot. A failure at directory sync after final publication must preserve `store_commit_ambiguous`; tests must re-read the authoritative namespace to determine whether the successor exists before any retry. Cleanup injection remains best-effort after a durably established successor and cannot retroactively turn success into failure.
6. **Measurements sufficient to open the next design.** A checked authority-boundary harness must separate Plan/base construction, ordinary result acceptance, Promotion construction, candidate validation/digest, Promotion acceptance, full Case snapshot construction/serialization, store preparation/CAS, cold restore, and optional Git projection. It must report operation/byte counts as primary evidence and wall/RSS as secondary evidence over sparse 1/8/128-touch workloads at increasing tree sizes up to the current 100,000-entry policy ceiling, with both wide-flat and deep-path shapes plus a broad-update control, explicit stop gates, and semantic equality to the current oracle. Opening a later semantic-authority representation design requires reproduced evidence that sparse changes still force total-tree/total-snapshot authority work at one or more current semantic/persistence stages across increasing sizes; no numeric speedup threshold and no Git-OID result by itself is sufficient to accept such a migration.

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
