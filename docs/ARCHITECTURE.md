# architecture

> Normative owner for component boundaries, fact ownership, and dependency direction.

## 1. Selected architecture

The architecture preserves xh-1's parallel Work Graph ontology and imports the reference branch's durable ownership, effect uncertainty, fencing, authority, migration, and evidence disciplines without importing its serial Task ontology.

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
       | MemorySnapshotStore / FileSnapshotStore |
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
| snapshot bytes and CAS revision | snapshot store | executor |
| load, source migration persistence, transaction | `CaseRepository` | raw store |
| deterministic candidate tree and manifest | Promotion | ordinary work Task |
| canonical tree replacement | successful Promotion transition in `CaseEngine` | executor, Agent, MCP |

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
| `claim-ledger.mjs` | global lease generation, fencing, validation, release, snapshot, wait notification |
| `runner.mjs` | capacity loop, claims, executor invocation, settlement, optional checkpoint |
| `durable-runner.mjs` | repository-backed checkpoint protocol |
| `store.mjs` | memory and local-file CAS adapters |
| `repository.mjs` | domain restore/migration and single-shot CAS transaction |
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

Domain code has no dependency on Cloudflare, GitHub, Termux, MCP, filesystem effects, process execution, or network APIs. The local file store is the only Node filesystem adapter in this slice.

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

## 7. Production mapping

The current contracts map cleanly to a future distributed product:

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

This is a mapping, not an implementation claim. The production target-claim owner must persist lease acquisition/release with its own authoritative transaction. A local in-memory `ClaimLedger` cannot provide distributed fencing after process loss.

## 8. Security and failure boundaries

- Claims are exclusion, not authorization.
- Executor identity and epoch are evidence, not tenant authentication.
- Self-digests detect corruption/inconsistency, not hostile rewrite authenticity.
- A provider adapter must use trusted storage or add an externally protected MAC/signature if snapshot storage is adversarial.
- External-effect retry requires stable idempotency or reconciliation; timeout alone proves nothing about effect application.
- Publication must remain a separate, single fenced lane after deterministic Promotion.

## 9. Performance posture

The implementation intentionally favors falsifiable correctness:

- mutations clone authoritative state to guarantee rollback on rejection;
- invariants and readiness may scan the graph;
- claim admission scans current holders;
- Promotion copies and validates the full text tree;
- snapshots contain bounded inline canonical data.

These are not semantic blockers, but they are production optimization work. Safe substitutions include remaining-dependency counters derived from authoritative states, claim prefix indexes, incremental invariant checks, content-addressed ChangeSets/Artifacts, and Merkle/Git-tree candidate construction. None may introduce a second readiness owner or bypass Promotion.

## 10. Architectural stop gates

A new adapter or optimization is rejected when it:

- stores a competing ready state;
- lets AgentDO, MCP, executor, or ClaimLedger own Task lifecycle;
- lets an ordinary Task mutate canonical state;
- retries an uncertain effect without idempotency/reconciliation evidence;
- validates only a partial result identity;
- treats local-file serialization as distributed durability;
- changes capacity one into a separate execution model.
