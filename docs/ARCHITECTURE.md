# architecture

> Normative owner for component boundaries, fact ownership, and dependency direction.

## 1. Selected architecture

The architecture preserves mvp-1's parallel Work Graph ontology and imports the reference branch's durable ownership, effect uncertainty, fencing, authority, migration, and evidence disciplines without importing its serial Task ontology.

```text
                         provider / application boundary
                                      |
                          +-----------v-----------+
                          |     CaseRepository     |
                          | load / migrate / CAS   |
                          +-----------+-----------+
                                      |
                     +----------------v----------------+
                     | runDurableCase / runCase driver |
                     | capacity, checkpoints, dispatch |
                     +-----------+---------------------+
                                 |
                 +---------------v----------------+
                 |            CaseEngine           |
                 | sole graph + lifecycle owner    |
                 | Plan / Task / Attempt / result  |
                 | Event / receipt / Promotion     |
                 +-----+----------------------+----+
                       |                      |
       local/in-Case claims and          isolated executor
       derived readiness                 result or effect
                       |                      |
                 +-----v------+        +------v------+
                 | pure policy |        |  executor   |
                 | results and |        |  adapter    |
                 | Promotion   |        +-------------+
                 +------------+

             optional cross-Case exclusion
                         |
                 +-------v-------+
                 |  ClaimLedger  |
                 | leases only   |
                 +---------------+

             snapshot bytes and CAS
                         |
       +-----------------v------------------+
       | Memory / File / Journal snapshot stores |
       +------------------------------------+
```

There is one scheduler meaning and one canonical writer. `runCase` is a driver; it does not own readiness or lifecycle truth. `ClaimLedger` owns only active cross-Case claim leases. Stores own bytes and compare-and-swap, not domain validity.

## 2. Ownership matrix

| Fact | Canonical owner | Explicit non-owner |
| --- | --- | --- |
| PlanRevision graph and digest | compiled Plan held by `CaseEngine` | runner, executor, MCP |
| dependency readiness | `CaseEngine`, derived from Task states | queue, ClaimLedger, stored ready flag |
| Task and Attempt lifecycle | `CaseEngine` | Agent/AgentDO, ClaimLedger, store |
| accepted result identity | `CaseEngine` | executor, transport |
| Case terminal outcome | `CaseEngine` | runner, projection |
| semantic Events and command receipts | `CaseEngine` | store, MCP |
| in-Case claim admission | `CaseEngine` | ClaimLedger |
| cross-Case claim lease/generation | `ClaimLedger` or future target owner | each Case snapshot |
| executor capacity and invocation | runner/provider adapter | `CaseEngine` lifecycle model |
| actual filesystem/Git/process/network effect | executor/Agent adapter | Case coordinator |
| snapshot bytes and CAS revision | legacy snapshot store | executor |
| v3 semantic tree/root authority | `CaseEngine` using the versioned semantic radix profile | `SemanticSqliteStore`, Git OID, executor |
| v3 durable Case-head election | `SemanticSqliteStore` transaction | executor, Git ref, immutable object existence |
| local post-Promotion Git object/ref projection | `GitProjectionAdapter` for derived Git candidate/ref state | `CaseEngine` semantic authority, ordinary work Task, executor |
| load, source migration persistence, transaction | legacy `CaseRepository`; v3 `SemanticCaseRepository` | raw store |
| deterministic candidate tree/root and manifest | Promotion | ordinary work Task |
| canonical tree/root replacement | successful Promotion transition in `CaseEngine` | executor, Agent, MCP |

## 3. Component map

| Module | Responsibility |
| --- | --- |
| `canonical.mjs` | strict duplicate-safe JSON, constrained canonical data, domain-separated digests, safe clones |
| `policy.mjs` | Case contract, limits, authority intersection, path and tree-topology validation |
| `claims.mjs` | pure claim normalization, overlap, and compatibility |
| `plan.mjs` | Plan compilation, DAG checks, indexes, Promotion contract |
| `results.mjs` | closed result normalization and identity |
| `promotion.mjs` | deterministic result manifest, conflict detection, candidate construction |
| `state.mjs` | state vocabularies and Attempt transition guard |
| `engine.mjs` | all authoritative lifecycle state, events, receipts, snapshots, migration, reconciliation |
| `claim-ledger.mjs` | global lease generation, fencing, validation, release, rebuildable overlap index, snapshot, wait notification |
| `runner.mjs` | capacity loop, rebuildable ready-candidate set, claims, executor invocation, settlement, optional checkpoint |
| `durable-runner.mjs` | repository-backed checkpoint protocol |
| `store.mjs` | memory, full-snapshot, verified legacy journal, and immutable expected-revision local-file CAS adapters |
| `repository.mjs` | legacy domain restore/migration and single-shot CAS transaction |
| `semantic-authority.mjs` | deterministic compressed UTF-8 path-byte radix, typed semantic values/nodes, root descriptors, sparse updates, explicit compatibility materialization |
| `semantic-promotion.mjs` | v3 deterministic accepted-result join and sparse semantic-root Promotion |
| `semantic-snapshot.mjs` | compact schema-v3 snapshot and Plan-binding validation |
| `semantic-store.mjs` | opt-in local SQLite immutable-object/snapshot storage plus transactional expected-predecessor Case head |
| `semantic-repository.mjs` | native v3 repository lifecycle, quiesced v2 -> v3 migration, rollback-status boundary |
| `git-projection.mjs` | D0011 local real-Git SHA-1/SHA-256 derived tree/commit projection, exact `refs/heads` CAS, reread reconciliation, and fenced rollback |
| `index.mjs` | supported source API surface |
| `cli.mjs` | observable source demos only |

## 4. Dependency direction

The pure core is inward-facing:

```text
canonical
  <- claims / policy
  <- plan / results / promotion / state
  <- engine
  <- runner / repository / durable-runner
  <- CLI or future provider adapters
```

Pure domain code has no dependency on Cloudflare, GitHub, Termux, MCP, filesystem effects, process execution, or network APIs. Outer local adapters include the file/journal stores, semantic SQLite store, and D0011 `GitProjectionAdapter`, which invokes a trusted local Git executable with bounded argv-array plumbing; those adapters do not become domain owners.

## 5. Parallel semantics

Readiness is computed from immutable dependencies and current Task states. Admission then checks:

1. Case is active;
2. Task is pending;
3. all dependencies succeeded;
4. retry budget remains;
5. authority is sufficient;
6. no in-Case claim holder conflicts;
7. when required, a live cross-Case lease is acquired.

Capacity only limits how many admitted Attempts the driver invokes. It never selects another state machine. Completion may be observed in any order. Promotion sorts Task IDs and write paths by stable code-unit ordering and builds a complete candidate before canonical replacement.

## 6. Durable dispatch boundary

The durable execution sequence is:

```text
load/reopen snapshot
  -> start fenced Attempt in CaseEngine
  -> CAS-persist running Attempt
  -> invoke executor
  -> validate/fence/settle result or failure
  -> CAS-persist settlement
  -> release terminal claim lease
```

A failed Attempt-start checkpoint means zero executor calls. The repository does not auto-retry an arbitrary transaction callback after CAS conflict, because such a callback may already have performed an external effect.

## 7. Final-MVP deployment mapping

The final MVP is required to realize the current contracts in the Cloudflare/local-Agent product topology. The mapping below is the current architecture hypothesis and ownership target; it is **not yet an implementation or provider-verification claim**:

```text
CaseEngine + CaseRepository transaction -> Case Durable Object
connection epoch / delivery queue / device capacity -> Agent Durable Object
cross-Case target claim leases -> dedicated target owner (AgentDO/ProjectDO/etc.)
actual OS/Git/process/network truth -> Agent
immutable Artifact bytes -> R2 or equivalent content store
locator and query projection -> D1 or equivalent index
MCP / Worker -> stateless projection and command ingress
Promotion publication lane -> dedicated fenced Git/reference adapter
```

This is a required final-MVP direction but still only a mapping at the current revision. `docs/ROADMAP.md` owns the capability-group gates. Each provider adapter requires a separate accepted Design and target-environment evidence. The production target-claim owner must persist lease acquisition/release with its own authoritative transaction. A local in-memory `ClaimLedger` cannot provide distributed fencing after process loss.

## 8. Security and failure boundaries

- Claims are exclusion, not authorization.
- Executor identity and epoch are evidence, not tenant authentication.
- Self-digests detect corruption/inconsistency, not hostile rewrite authenticity.
- A provider adapter must use trusted storage or add an externally protected MAC/signature if snapshot storage is adversarial.
- External-effect retry requires stable idempotency or reconciliation; timeout alone proves nothing about effect application.
- Publication must remain a separate, single fenced lane after deterministic Promotion.

## 9. Performance posture

Correctness state remains authoritative; performance policy reduces implementation work without changing semantics. Design 0004 establishes:

- direct mutations retain stable collection roots and use entry-level undo records plus Event-array truncation, rather than canonical cloning or root-record copying;
- committed records are frozen and exposed through stable read-only collection views; untrusted restore still performs full validation;
- incremental commit validation covers appended Events and changed Task/Attempt/receipt records, while full restore remains the semantic oracle;
- rebuildable Task-state counts, unsatisfied dependency counts, ready IDs, and claim-holder IDs update only changed entries and direct reverse edges; a non-active Case-state candidate is confirmed against authoritative Task records;
- blocker propagation visits an affected descendant closure once in deterministic topological order, producing bounded complete blocker evidence;
- the runner's ready candidates and the ClaimLedger overlap trie are disposable candidate-narrowing structures; admission and live lease validation remain authoritative;
- Claim trie release prunes empty path nodes so historical churn does not become retained search state;
- journal materialization is reused only when a cryptographic fingerprint of exact durable base/delta names, lengths, and bytes matches; this preserves stale-writer/corruption detection but still incurs O(journal bytes) read/hash work;
- Design 0005 adds a separate opt-in immutable journal: after a quiesced legacy-writer cutover, one no-replace `delta-from-R` slot owns CAS election among v2 writers for expected revision R; Design 0007 keeps that durable authority but permits disposable materialization reuse only after strict committed-namespace observation and exact reread-byte fingerprint equality, so any retained-byte or authority-surface change returns to full D0005 replay; it has no durable checkpoint/head state;
- Plan compilation remains linear in graph size apart from deterministic output ordering;
- Promotion still copies, validates, and hashes the complete text tree. In addition, the current authoritative Case snapshot retains the compiled Plan (including its full base tree), complete accepted-result state, and the canonical tree; a succeeded Promotion accepted result itself contains the complete final tree. Therefore touched-path Git/object construction alone does not remove the complete authority-packaging cost and is downstream of the D0008 authority-boundary gate.

D0013 established the real full-context/process-per-Attempt repository/model transport baseline. D0014 implements bounded executor-local exact-base preparation reuse, tree/file byte preflight, unique-blob loading, cancellable Git plumbing and POSIX lifecycle cleanup. D0017 now inserts a representation-independent authorized logical context reference and an ephemeral bounded packed/hybrid receiver between that authoritative preparation and model admission. The receiver recomputes Case/Plan authorization before carrier access, validates freshness/integrity/resource bounds, reconstructs the complete semantic context and proves canonical-byte equality with the D0014 preparation before the existing full-context subprocess request is built. The architecture still does not implement deterministic ContextSlice, persistent/cross-worker CAS, warm process/toolchain pools, cache-locality placement, external-provider transport or token accounting; D0018/D0022 retain those separate boundaries.

## 9.1 Current authority packaging boundary

The current source has one semantic Case owner but a broad materialized snapshot boundary. A schema-v2 snapshot contains the compiled Plan, Case contract, complete Events, canonical tree, Task states with accepted results, Attempts, receipts, and a whole-snapshot digest. The compiled Plan includes the full validated `baseTree`. A successful Promotion result includes the full final `tree`, which is retained inside accepted Task state while the same semantic final tree is also installed as `canonicalTree`.

This is current implementation fact, not a second owner: restore and snapshot validation deliberately treat the complete Case record as one authority. Storage-level delta/cache optimizations can reduce retained bytes or replay work without eliminating upstream full snapshot construction, digesting, cloning, or duplicated tree representation. D0008 measured that complete path while preserving the current semantic owner.

The checked D0008 authority matrix contains 32 wide-flat/deep-path samples across 1k/5k/20k/100k trees and 1/8/128/broad writes. All 24 completed 1k/5k/20k samples matched the current Promotion oracle and cold restore exactly. All eight 100k samples hit the declared 30 s or 768 MiB stop gate; sparse 1/8-write samples included stops at Promotion oracle/result-acceptance stages. This reproduces total-tree/total-snapshot size dependence even when writes are sparse. The evidence justifies opening a separate Class 2 semantic-authority representation comparison, but does not select Merkle/HAMT/transactional-root/Git-OID authority by itself.

D0008 also closes its bounded local hardening gates: concrete-store durable capacity admission, legacy journal fail-closed namespace/file-type parity, deterministic immutable-publication fault boundaries, and settlement-checkpoint/Claim reopen behavior. It changes no snapshot schema, durable journal format, semantic tree identity, migration/rollback rule, or provider/distributed owner.

## 9.2 Verified semantic-representation comparison

D0009 compares non-authoritative persistent representations under the current Promotion oracle without changing production authority. Every completed model must materialize the exact current `path -> UTF-8 text` map and reproduce the current `digest(tree)` before it can contribute evidence.

The checked 1k/5k/20k/100k × 1/8/128/broad × wide-flat/deep-path/balanced-directory matrix rejects a simple directory-Merkle representation: at 100k wide-flat entries, one write still hashes 100,000 sibling references and roughly 10.2 MB of directory metadata. Directory shape alone therefore does not bound sparse authority-update work.

Two bounded-fanout research models survive structurally. A UTF-8 path-byte radix model keeps direct path-prefix locality and avoids path-key hashing, but its update depth and node churn follow path length. A collision-safe path-hash Patricia/trie model stores complete paths in deterministic collision buckets and has lower checked structural churn: at 100k entries a one-write update writes six structural nodes in all three shapes; at 100k wide-flat with 10k writes it writes 21,756 nodes and performs 31,757 typed hashes plus 10,000 explicitly counted path-key SHA-256 operations, versus 61,117 nodes and 71,118 typed hashes for the radix model. D0009 therefore prefers the hash-trie family for the **next migration design**, while retaining radix as a required fallback/reference.

A small transactional root/head is not an alternative tree representation. Any future persistent semantic root still requires one trusted expected-predecessor CAS/transaction owner with version/profile identity, generation/migration fencing, restart recovery, and explicit ambiguous-outcome reconciliation. D0009 only measured hypothetical head records; it did not install one.

Most importantly, all completed research roots still pay the full current compatibility tax: materialize the complete text map and compute the existing full-tree digest. The three stopped 100k broad samples completed candidate-root update and stopped only during this compatibility materialization/digest stage. Therefore the current engine remains full-tree authoritative. Sparse research-root evidence is sufficient to justify a separate Class 2 migration/transactional-head design, not to change `CaseEngine`, snapshot v2, journal formats, or current `treeDigest` inside D0009.

Current semantic tree identity remains the tdev canonical text-tree digest, not a Git tree OID. Git mode and repository object format affect Git identity but are absent from the current semantic tree contract. Future Git object construction is a derived projection until a separate accepted Class 2 design explicitly changes semantic authority.

## 9.3 Verified semantic-authority v3 boundary

D0010 closes the bounded local authority migration that D0009 intentionally left open. The production v3 profile selects a compressed UTF-8 path-byte radix rather than the D0009 benchmark-preferred path-hash trie. The reason is semantic ownership, not a reversal of the D0009 measurements: the current tree contract forbids file/descendant collisions, and the path-byte radix can enforce exact, ancestor, and descendant conflicts from the same sparse authority structure. A path-hash-only authority would require an O(N) prefix scan or a second synchronized prefix owner.

For an opt-in v3 Case, `CaseEngine` owns lifecycle and the semantic base/canonical root descriptors. Typed immutable radix objects carry content; a small schema-v3 snapshot binds lifecycle state to those roots; `SemanticSqliteStore` elects the current snapshot/root pair through one expected-predecessor transactional head. Object existence alone is not authority. Existing v2 Cases retain the full-tree schema-v2 and legacy store semantics.

The normal v3 Promotion/checkpoint path no longer materializes or hashes the complete text tree. Compatibility APIs, cold semantic hydration/scrub, and explicit full-tree comparison may still be O(N); D0010 does not claim otherwise. D0011 adds a local derived Git projection and D0012 adds a derived authenticated remote-publication layer outside this semantic-authority boundary; neither Git layer becomes the semantic owner. Provider transactions, distributed Claims, protected-branch policy ownership, and hostile-storage authentication remain outside the verified semantic owner.

## 9.4 Verified local Git projection boundary

D0011 implements one local `tdev.git.text-tree.v1` projection over a validated D0010 semantic tree. It materializes the semantic path/text map for this correctness-first slice, writes exact UTF-8 `100644` blobs and Git trees/commits without an index or worktree, and treats those immutable objects as derived candidates. The publication ref is restricted to a direct full `refs/heads/...` ref and is changed only through one exact expected-predecessor `update-ref` CAS.

Candidate validation rereads the Git tree/blob graph, rebuilds the existing tdev semantic root, and checks raw commit bytes against the bound tree, parent, and explicit author/committer metadata before publication. Lost publication or rollback responses are classified by durable ref reread; a third OID is a conflict and blind replay is forbidden. Rollback is another fenced ref CAS and never rewrites semantic Case authority or deletes Git objects.

This boundary is local-source verification, not a remote/provider claim. Git OIDs remain representation-dependent derived identities, SHA-1 and SHA-256 repositories may project the same semantic root differently, and D0011 does not prove remote publication, provider authorization or branch protection, signing, multi-host ownership, provider transactions, or hostile repository authenticity.

## 9.5 Verified remote Git publication source boundary

D0012 adds `GitRemotePublicationAdapter` profile `tdev.git.remote-existing-branch.v1` above a locally elected D0011 candidate. An immutable remote intent binds the candidate, exact non-null predecessor, remote name, and digest of the single effective push target without persisting the clear target. Forward publication uses an explicit expected-predecessor remote lease; because the D0011 candidate parent is that predecessor, every accepted forward update is still topologically fast-forward. Uncertain outcomes are classified only by durable remote-ref reread, and restart reconciliation is read-only and bound to the original remote identity.

This remains a derived publication boundary: the D0010 transactional Case head and semantic root remain tdev authority, and D0012 never creates/deletes remote branches or stores credentials. Source tests and an authenticated GitHub push dry-run verify the generic protocol and non-interactive credential negotiation capability. They do **not** promote any provider resource to integration-verified, prove protected-branch policy, provider-specific authorization/rules, multi-host ownership, signing, or hostile-provider authenticity.

## 9.6 Verified repository-context and local model-transport boundary

D0013 adds `GitRepositoryModelExecutor` outside the Case authority boundary. For operation `tdev.model.repository`, it reads one exact immutable local Git commit under profile `tdev.repository-context.git-full-text.v1`, accepts only regular UTF-8 `100644`/`100755` blobs, preserves executable mode as context metadata, rebuilds the existing path-to-text semantic digest, and requires that digest to equal the Attempt invocation `baseDigest`. It reads commit objects directly and never uses the worktree/index as context authority.

The complete supported commit context is reconstructed for every Attempt and sent by canonical JSON to one fresh trusted local subprocess under `tdev.model.subprocess-json.v1`. The request binds repository context plus Case/Plan/Attempt/fencing identity through a request digest; the subprocess must echo that digest and may return only an existing tdev result. The runner and `CaseEngine` remain responsible for result-kind, Plan, lease, fencing and Promotion validation, so model/process output cannot directly elect canonical state. Repository descriptors, request/response bytes and timing observations are non-authoritative evidence.

This is intentionally the pre-optimization baseline. For four identical full-context requests, the 75% repeated fraction is structurally `(4 - 1) / 4`; it was not an unexpected experimental discovery. Checked source evidence instead contributes the absolute 101-file / 1,757,785-byte context, 7,031,140 requested context bytes, 5,273,355 repeated bytes, one full 1,757,785-byte retry reconstruction, and the real Git/process timing profile. It does not prove tokenizer/token savings, external-model latency, provider authentication/data-egress policy, warm-process benefit or locality scheduling.

D0014 keeps the same full-context request and result-only process boundary but adds an optional, bounded, instance-local derived preparation cache. The exact key is scoped by one executor/repository instance and binds object format, immutable commit OID and authoritative `baseDigest`. One producer may serve concurrent same-key readers; different keys prepare concurrently; a finite LRU retains only verified immutable descriptor/file encodings within entry/byte bounds. Cache loss, restart, disablement or eviction performs a cold rebuild from Git, so cache metadata cannot elect semantic state. Cold preparation preflights tree sizes, coalesces duplicate blob OIDs, propagates cancellation into Git, and POSIX process-group cleanup also begins at direct-child exit so inherited descendant pipes cannot convert a valid result into a timeout. Full repository request bytes and one process start per Attempt remain unchanged.

D0017 preserves that semantic/process boundary while changing the trusted-local context-delivery stage. `tdev.selected-context-reference.v1` binds exact immutable commit, semantic `baseDigest`, repository `contextDigest`, and `tdev.selected-context-reference-scope.v1` authorization over admitted `caseId`, `planDigest`, and `caseContractDigest`; `attemptId`, representation kind, process identity and physical locators are excluded. `src/selected-context-delivery.mjs` derives bounded in-memory `tdev.context-pack.v1` packs (128 files, 2 MiB semantic, 3 MiB stored; 512 KiB manifest; at most 790 packs) and resolves them only after independently recomputing authorization. Resolution enforces inherited repository limits, typed unauthorized/stale/missing/corrupt/limit failures and AbortSignal cancellation, then reconstructs the complete context and requires canonical descriptor/file equality before subprocess admission. Carrier state is executor-owned, ephemeral, rebuildable and non-authoritative; no persisted Case/Plan schema, D0022 durable/shared store, D0018 warm process lifecycle or ContextSlice is introduced.

## 10. Architectural stop gates

A new adapter or optimization is rejected when it:

- stores a competing ready state;
- lets AgentDO, MCP, executor, or ClaimLedger own Task lifecycle;
- lets an ordinary Task mutate canonical state;
- retries an uncertain effect without idempotency/reconciliation evidence;
- validates only a partial result identity;
- treats local-file serialization as distributed durability;
- changes capacity one into a separate execution model.
