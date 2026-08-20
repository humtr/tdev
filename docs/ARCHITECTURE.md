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
| Task and Attempt lifecycle | `CaseEngine` | Agent/`AgentDeliveryAuthority`, ClaimLedger, store |
| accepted result identity | `CaseEngine` | executor, transport |
| Case terminal outcome | `CaseEngine` | runner, projection |
| semantic Events and command receipts, including `attempt_dispatch_granted` | `CaseEngine`/CaseDO command transaction | store, MCP, `AgentDeliveryAuthority` |
| in-Case claim admission | `CaseEngine` | ClaimLedger |
| cross-Case claim lease/generation | `ClaimLedger` or future target owner | each Case snapshot |
| direct/local per-invocation executor capacity and invocation | runner/provider adapter | `CaseEngine` lifecycle model |
| stable Agent route binding and non-reused route generation | deployment owner for the supported Agent-backed profile | CaseDO, `AgentDeliveryAuthority`, local Agent re-election |
| Agent connection generations, accepted/effective aggregate capacity, non-executable reservations, delivery admission/authorization and accepted delivery evidence | one durable `AgentDeliveryAuthority` per stable Agent route | CaseDO/`CaseEngine` Task lifecycle; local Agent physical truth |
| cancellation-versus-Agent-dispatch ordering | `CaseEngine`/CaseDO via one-shot `grant_attempt_dispatch` receipt/Event | `AgentDeliveryAuthority`, transport |
| actual filesystem/Git/process/network effect | executor/Agent adapter | Case coordinator, `AgentDeliveryAuthority` |
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

D0030 keeps immutable-journal publication in that outer-adapter layer. Its selected second backend uses one package-owned standalone native helper behind `store.mjs`: JS owns Case-path resolution and opens the Case directory, while the helper receives only an inherited directory fd plus generated single-component contender/final basenames and owns exactly one fd-relative `renameat2(..., RENAME_NOREPLACE)` operation. The helper has no semantic-read, cleanup-authority, shell, network, config, secret, absolute-path, or fallback role. A dedicated begin/result channel makes post-begin native result loss an ambiguity boundary handled by the JS/store owner through authoritative reread. Helper presence/capability is deployment qualification, not durable Case state; current implementation/qualification status is owned by the maintained Design and evidence, not this architecture contract.

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

The final MVP is required to realize the current contracts in the Cloudflare/local-Agent product topology. D0019 fixes the Case semantic-authority host; accepted D0020 fixes the Agent route/connection/delivery/admission owner shape. The remaining provider-owner rows stay architecture targets until their responsible Designs and target-environment evidence establish them:

```text
D0010/CaseEngine semantic authority -> one SQLite-backed Case Durable Object (D0019-selected)
stable Agent route binding -> one deployment-owned immutable route generation
connection generations / aggregate capacity / non-executable reservation + delivery admission -> one durable AgentDeliveryAuthority per stable route (D0020-selected; provider host requires deployment qualification)
cross-Case target claim leases -> dedicated target owner (AgentDO/ProjectDO/etc.)
actual OS/Git/process/network truth -> authenticated local Agent
immutable Artifact bytes -> R2 or equivalent content store
locator and query projection -> D1 or equivalent index
MCP / Worker -> stateless projection and command ingress
Promotion publication lane -> dedicated fenced Git/reference adapter
```

D0019 and D0020 are Design-layer authority selections; neither alone is production/provider-verification evidence. A Case placed in Cloudflare has exactly one CaseDO durable SQLite owner for its D0010/CaseEngine current semantic facts; no writable local co-owner or projection may compete. The Case owner contributes only the one-shot `grant_attempt_dispatch` receipt/Event that serializes cancellation against dispatch permission after the `running` Attempt is already durable. `AgentDeliveryAuthority` consumes that exact grant and remains the owner of connection, aggregate capacity, reservation, delivery and Agent-side dispatch-authorization facts; it owns no waiting Task queue or semantic retry lifecycle. `docs/ROADMAP.md` owns the remaining capability-group exits. Each still-provisional provider adapter requires its responsible accepted Design and target-environment evidence. The production target-claim owner must persist lease acquisition/release with its own authoritative transaction. A local in-memory `ClaimLedger` cannot provide distributed fencing after process loss.

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

D0013 establishes the full-context/process-per-Attempt repository/model transport baseline. D0014 defines bounded executor-local exact-base preparation reuse, tree/file byte preflight, unique-blob loading, cancellable Git plumbing and POSIX lifecycle cleanup. D0017 inserts a representation-independent authorized logical context reference and an ephemeral bounded packed/hybrid receiver between that authoritative preparation and model admission. The receiver recomputes Case/Plan authorization before carrier access, validates freshness/integrity/resource bounds, reconstructs the complete semantic context and proves canonical-byte equality with the D0014 preparation before the existing full-context subprocess request is built. D0018 defines a warm **host** only at that D0014 preparation layer: model process/module/session state remains fresh per Attempt. Its transient runtime boundary uses committed semantic Events only as non-authoritative wake hints, exact Attempt/controller fencing, exact persisted-revision checkpoint drain, and a runtime slot that is not returned until predecessor execution cleanup/settlement completes. Deterministic ContextSlice, persistent/cross-worker CAS, same-model-process warm pools, cache-locality placement, external-provider transport and token accounting are outside this accepted boundary and remain owned by later context/provider/topology decisions when activated.

## 9.1 Authority packaging and representation boundary

One semantic Case owner does not imply that every physical representation must be monolithic. The schema-v2 compatibility profile packages the compiled Plan, Case contract, Events, canonical tree, Task/Attempt state, receipts and whole-snapshot digest as one validated authority record; that representation may contain complete base/final trees and therefore has complete-snapshot construction and validation cost even when a mutation is sparse.

A storage delta, cache, Git object graph or research root cannot remove that authority-packaging cost merely by storing fewer changed bytes downstream. Such structures remain derived until an accepted authority migration changes which predecessor/root record elects current semantic state. Historical D0008/D0009 measurements and candidate comparisons are retained in Design/evidence/history; the stable architectural conclusion is that sparse mutation performance requires a sparse authoritative representation plus one trusted transactional predecessor/CAS owner, not a second cache or projection owner.

A directory-Merkle shape alone is insufficient to guarantee sparse update work when a directory can have unbounded fanout. A bounded-fanout sparse representation must also preserve the existing semantic path rules, including exact-file, ancestor and descendant conflicts. This requirement is why the maintained sparse authority uses path-aware radix ownership rather than treating a path-hash index by itself as semantic truth.

## 9.2 Semantic-authority v3 boundary

For an opt-in v3 Case, `CaseEngine` owns lifecycle and the semantic base/canonical root descriptors. Typed immutable radix objects carry content; a small schema-v3 snapshot binds lifecycle state to those roots; `SemanticSqliteStore` elects the current snapshot/root pair through one expected-predecessor transactional head. Object existence alone is not authority.

The path-byte radix must enforce the same canonical text-tree semantics as the compatibility profile, including exact path identity and file/ancestor/descendant exclusion. The normal sparse Promotion/checkpoint path does not require complete text-tree materialization or hashing, while compatibility APIs, cold semantic hydration/scrub and explicit full-tree comparison may still be O(N). Existing v2 Cases retain their compatibility schema/store semantics unless a separately accepted migration changes them.

The semantic tree identity remains the tdev canonical text-tree contract, not a Git tree OID. Provider transactions, distributed Claims and hostile-storage authenticity are separate owners/problems and cannot be inferred from a local sparse root.

## 9.3 Local and remote Git projection boundary

D0011 local profile `tdev.git.text-tree.v1` is a derived projection over a validated semantic tree. It writes exact UTF-8 `100644` content into Git blobs/trees/commits without using an index or worktree and restricts publication to a direct full `refs/heads/...` ref changed through one exact expected-predecessor CAS.

Candidate validation rereads the Git graph, reconstructs the tdev semantic tree, and validates commit bytes against the bound tree, parent and explicit author/committer metadata before publication. Lost publication or rollback responses are reconciled by durable ref reread; a third OID is conflict and blind replay is forbidden. Rollback is another fenced ref CAS and never rewrites Case semantic authority or deletes immutable Git objects.

D0012 profile `tdev.git.remote-existing-branch.v1` adds authenticated remote publication above a locally elected candidate. An immutable remote intent binds the candidate, exact non-null predecessor, remote identity and digest of the single effective push target without persisting the clear target. Forward publication uses an expected-predecessor remote lease; uncertain outcomes are classified only by durable remote-ref reread and restart reconciliation is read-only and bound to the original remote identity.

Git OIDs remain representation-dependent derived identities. Local/remote Git success does not by itself prove provider authorization policy, branch protection, signing, multi-host ownership or hostile-repository authenticity.

## 9.4 Repository, model and context-delivery boundary

D0013 `GitRepositoryModelExecutor` stays outside Case authority. Operation `tdev.model.repository` reads one exact immutable Git commit under profile `tdev.repository-context.git-full-text.v1`, accepts only regular UTF-8 `100644`/`100755` blobs, preserves executable mode as context metadata, rebuilds the existing path-to-text semantic digest, and requires equality with the Attempt invocation `baseDigest`. Worktree/index state is never context authority.

The supported commit context is sent by canonical JSON to a fresh trusted-local subprocess under `tdev.model.subprocess-json.v1`. The request binds repository context plus Case/Plan/Attempt/fencing identity through a request digest; the subprocess must echo that digest and may return only an existing tdev result. The runner and `CaseEngine` remain responsible for result-kind, Plan, lease, fencing and Promotion validation, so process/model output cannot elect canonical state directly.

D0014 may reuse only bounded, instance-local derived preparation keyed by executor/repository identity, object format, immutable commit OID and authoritative `baseDigest`. One producer may serve same-key readers; different keys may prepare concurrently; finite retention contains only verified immutable descriptor/file encodings. Cache loss, restart, disablement or eviction performs a cold rebuild from Git. Cache metadata never becomes semantic state, readiness or result-acceptance authority.

D0017 changes the trusted-local delivery representation without changing semantic/model authority. `tdev.selected-context-reference.v1` binds immutable commit, semantic `baseDigest`, repository `contextDigest`, and `tdev.selected-context-reference-scope.v1` authorization over admitted `caseId`, `planDigest` and `caseContractDigest`; `attemptId`, representation kind, process identity and physical locators are excluded.

The bounded in-memory `tdev.context-pack.v1` representation permits at most 128 files per pack, 2 MiB semantic bytes per pack, 3 MiB stored bytes per pack, a 512 KiB manifest and at most 790 packs, in addition to inherited repository semantic bounds. Resolution occurs only after authorization is independently recomputed, rejects unauthorized/stale/missing/corrupt/limit states and cancellation before model admission, reconstructs the complete context and requires canonical descriptor/file equality. Carrier state is ephemeral and rebuildable; it is not Case/Plan authority or an implicit persistent shared store.

D0018 may keep only the bounded D0014 host preparation warm. Attempt authorization, D0017 carrier/request state, controller/deadline and model process are fresh per Attempt. Committed Events are non-authoritative wake hints; exact Attempt/controller fencing, persisted-revision checkpoint drain and runtime-slot retention through predecessor cleanup/settlement preserve the durable result boundary. Deterministic ContextSlice, persistent cross-worker CAS, same-model-process pooling, locality scheduling and external-provider transport remain separate decisions when activated.

## 9.5 D0019 Case authority hosting boundary

D0019 selects **hosting/adaptation, not a semantic rewrite**. A durable placement generation first elects exactly one deployment/environment/class/namespace/jurisdiction/Durable-Object tuple for a new Cloudflare Case; that placement fact is meta-authority for physical ownership, not a semantic Case head. The elected SQLite-backed CaseDO owns the D0010/CaseEngine current revision, semantic head/root, command receipts, Task/Attempt lifecycle, accepted result, terminal status and running-before-dispatch record. Its in-memory instance and caches are disposable. The authoritative mutation transaction persists the exact receipt and successor state before returning or crossing into an external effect.

Receipt identity stays exactly D0010: `typedDigest('tdev.case-command.v1', canonicalClone(command))`; `requestId` addresses the receipt and `expectedCaseRevision` is excluded from that digest. Ordinary CaseDO eviction reconstructs durable state without semantic reopen. Only an explicit durable execution/delivery-owner-loss recovery cause may invoke the existing reopen transition. Under accepted D0020, Agent route/connection generations, aggregate capacity, non-executable reservations, delivery admission, Agent-side dispatch authorization and accepted transport/execution/cleanup/effect evidence stay outside Case authority in one durable `AgentDeliveryAuthority` per stable route. CaseDO owns only the semantic Case facts plus the `grant_attempt_dispatch` cancellation/dispatch ordering receipt/Event; that grant does not move delivery ownership into CaseDO. Actual OS/Git/process effect truth remains at the local Agent/effect boundary. Git refs, R2 objects, D1 rows and Worker/MCP projections remain derived or narrow-purpose owners only; none can elect a Case head.

The initial adapter must use the versioned `tdev.casedo.sqlite-authority.v1` logical profile, normalized/chunked state, a finite deployment-qualified Case capacity budget, and compatible old/new schema/API overlap or a fail-closed rollout barrier. D0019 explicitly forbids an initial migration of an existing local Case. New qualified Cases may be born only after placement election. Any later existing-Case move requires a separate cutover owner that fences the old writer before activating the destination; two writable copies are never a supported topology. Production/provider qualification of this boundary requires live placement, eviction/response-loss, capacity, rollout and deployment-lifecycle evidence; current status belongs to the maintained Design and exact evidence.

## 10. Architectural stop gates

A new adapter or optimization is rejected when it:

- stores a competing ready state;
- lets `AgentDeliveryAuthority`, MCP, executor, or ClaimLedger own Task lifecycle;
- lets an ordinary Task mutate canonical state;
- retries an uncertain effect without idempotency/reconciliation evidence;
- validates only a partial result identity;
- treats local-file serialization as distributed durability;
- changes capacity one into a separate execution model.
