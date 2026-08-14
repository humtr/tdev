# tdev qualification

> Normative owner for how tdev claims are qualified. Product behavior remains in its product owner; current routing remains in `WORKBOARD.md`; observed results remain evidence/history.

## 1. Authority and scope

This document owns verification methodology and proof-layer boundaries. It does not redefine runtime product behavior, current Design status, the current development route, provider state or historical results.

The product milestone called the MVP remains defined by `docs/SPEC.md` and the final-MVP capability/exit program in `docs/ROADMAP.md`. Passing a lower qualification layer never implies Level-4 deployed-product completion.

## 2. Baseline source qualification gate

At the repository source-qualification gate, use this exact baseline sequence unless an accepted Design and this owner explicitly revise it:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

A non-green required command is not converted to success. If the execution environment cannot support a required primitive, report the affected environment/layer as unqualified and preserve the exact failure evidence. A supported subset can show bounded non-regression but does not substitute for the failed required layer.

Focused Design/provider gates may add evidence for their own scope; they do not silently weaken this baseline.

## 3. Qualification layers

Keep proof layers separate:

1. **source/static** — syntax, deterministic repository behavior, source tests, source coverage and diff integrity;
2. **local runtime/adapter** — executable behavior in the exact declared local/platform profile;
3. **provider/runtime** — real provider ownership, persistence, restart, ambiguity and provider-policy behavior;
4. **security/client** — authentication, authorization, tenant isolation, secret handling and current supported-client behavior;
5. **deployment/migration/rollback** — package/configuration/deployability, fresh-environment setup, migration, rollback and recovery;
6. **final deployed product** — end-to-end Level-4 qualification required by `docs/ROADMAP.md`.

Evidence from one layer proves only that layer. In particular, local/source tests do not by themselves prove Durable Object/Worker/provider behavior, a real local-Agent process, remote D1/R2 behavior, secured MCP/current-client behavior, external side effects, deployment/migration/rollback safety, production capacity/SLOs or final deployed-product completion.

## 4. Evidence semantics

A positive qualification claim identifies the exact source/revision, execution environment/profile, command or falsifier, outcome and durable evidence when applicable. Skipped, unavailable, unsupported, stale or unexecuted evidence remains explicit and cannot be recorded as pass.

A previous pass is historical evidence, not timeless current status. Mutable current gaps belong in `WORKBOARD.md` or the responsible Design/product owner rather than this stable method owner. `docs/ROADMAP.md` owns stable unmet capability/exit criteria, not mutable current state.

When a required gate is impossible on the current environment, preserve both facts separately: what bounded subset did pass, and which required layer remains unqualified.

## 5. Qualification method catalog

The catalog below preserves the 78 pre-D0032 verification-method pairs exactly. Each row names a verification area and its cheapest falsifier. The behavior being tested is still owned by the applicable product/Design owner; this table owns the proof method, not the behavior.

| Area | Cheapest falsifier |
| --- | --- |
| immutable graph | mutate Plan / duplicate Task / unknown dependency / cycle |
| one Promotion | zero/multiple Promotion or incomplete full join |
| capacity degeneration | same graph at capacity 1 and N |
| scheduling/completion order | inverse executor timing and accepted-result order |
| executor identity | different executor IDs/epochs with valid envelopes |
| retry order | alternate retry interleavings |
| parallel admission | disjoint claims with barriers |
| Claim correctness | exact/reference oracle over randomized prefix sets |
| Claim lifecycle | acquire/release 2,000 unique paths |
| authority | one missing set in the capability intersection |
| complete fencing | stale epoch/token/identity/lease/scope |
| durable dispatch | inspect store before executor callback |
| checkpoint race | forced CAS loss before dispatch |
| accepted-result durability | inspect persistence and lease-release ordering |
| effect recovery | reopen each effect class / invalid external result |
| cancellation race | cancel before late success |
| blocker propagation | reverse-lexical topological chain and cancellation DAG |
| atomic mutation | fail after first Event / invalid reconciliation |
| full restore oracle | snapshot after every randomized transition |
| acceleration loss | delete/corrupt counters, ready set, claim-holder set |
| runner candidate loss | clear local ready candidates |
| Promotion safety | conflict/topology/path error |
| strict/canonical data | duplicate key, unsafe number, malformed UTF-8, noncanonical bytes |
| bounds | result/evidence/Event/receipt/snapshot overflow |
| snapshot integrity | digest/Event/result/index/state/blocker corruption |
| v1 migration | historical succeeded fixture |
| File store stale race | independent same-process instances |
| Journal stale race | warm stale instance after another instance commits |
| Journal concurrent race | independent same-process CAS calls |
| Immutable journal create race | independent Node processes / absent base |
| Immutable journal same-process race | independent instances / one expected revision |
| Immutable journal process race | independent Node processes / one expected revision |
| Immutable journal format migration | legacy prefix -> v2; v2 -> legacy |
| Immutable journal cutover | legacy/new adapters at one predecessor |
| Immutable journal full replay | historical semantic corruption / restart |
| Immutable warm namespace | warm instance then add malformed committed-looking name |
| Immutable warm base file type | warm instance then replace `base.json` with non-regular entry |
| warm-cache corruption | mutate durable base after load |
| Legacy journal record contents | recognized delta with malformed/noncanonical/truncated contents, missing base, replay corruption |
| Legacy committed namespace | malformed committed-looking `delta-*` name or recognized-name non-regular entry |
| Immutable committed namespace | malformed/unsafe committed-looking name or recognized non-regular authority slot |
| Immutable publication ambiguity | injected failure before/after the final-slot boundary |
| aggregate durable admission | individually legal Case components whose combined snapshot exceeds configured store bound |
| settlement checkpoint/Claim liveness | checkpoint exception after in-memory settlement and before terminal lease release |
| D0009 semantic equivalence | research model materializes a different tree/current digest |
| D0009 root determinism | rebuild/input/write history changes research root |
| D0009 hash collision | equal path-hash key aliases/losses complete paths |
| D0009 directory Merkle | one sparse write in a wide directory requires bounded metadata work |
| D0009 bounded sparse structures | C2/C3 1/8/128 update work scales with total tree entries |
| D0009 compatibility tax | research root removes need for current full-tree materialization/digest without migration |
| D0010 root/topology | rebuild/order/batch history changes root or prefix conflict needs O(N) materialization |
| D0010 sparse authority | 1/8/128 writes or v3 checkpoint secretly materialize/hash the full tree |
| D0010 head/ambiguity | independent expected-predecessor writers both win or unknown commit triggers blind retry |
| D0010 migration/downgrade | live/racing legacy source crosses cutover or post-v3 write downgrades automatically |
| D0010 corruption/repair/GC | corrupt reachable object hides behind cache, repair changes authority, or GC deletes live/pinned object |
| D0011 semantic Git binding | real Git tree/blob bytes differ from candidate semantic root or commit bytes differ from tree/parent/metadata |
| D0011 deterministic/object format | same semantic root built in permuted order; project into SHA-1 and SHA-256 repos |
| D0011 local ref CAS | two independent creators/writers present one predecessor |
| D0011 ambiguity/restart | inject pre/post-update loss and reopen adapter |
| D0011 rollback | rollback exact winner or after an intervening publication |
| D0011 process/ref safety | symbolic/wrong namespace, bad predecessor/metadata, inherited `GIT_DIR`, repository hook |
| D0012 target/admission | local candidate is unelected, remote target changes, branch absent, or clear credential is embedded |
| D0012 exact remote fence | two locally elected siblings present one remote predecessor |
| D0012 ambiguity/restart | push result is lost or transport fails, then adapter restarts |
| D0012 rollback/provider rejection | rollback current candidate, reject rewind, or advance remote first |
| D0012 routing/secrets | inherited `GIT_DIR` or stderr/embedded credential attempts to redirect/leak |
| D0013 exact repository base | exact commit text map differs from Attempt `baseDigest`, or worktree changes after Plan creation |
| D0013 Git/text safety | executable file, symlink, invalid UTF-8, path/tree bound failure, inherited `GIT_DIR` |
| D0013 request/result binding | stale/wrong request digest, malformed response, subprocess error/timeout/abort/output overflow |
| D0013 repository authority | model returns a ChangeSet |
| D0013 full-context baseline | repeated Tasks/retry use same commit |
| D0014 same-base preparation | 1/2/4/8 Tasks share one immutable base |
| D0014 identity/restart/rollback | changed commit or wrong `baseDigest`, cache loss, eviction, restart or `contextCache: false` |
| D0014 concurrency/failure | same-key stampede, different bases, producer failure, one/all reader cancellation |
| D0014 process lifecycle | timeout/abort/overflow/direct-child exit with a descendant holding pipes |
| D0014 observations | callback throws, rejects or never settles |
| compaction crash shape | replacement base durable before covered-delta deletion |
| three-state compatibility | successful transition histories across all three states |

## 6. Final-MVP qualification relation

The source gate and method catalog are necessary evidence mechanisms, not a declaration that the final MVP is complete. Final completion requires the capability exits and real provider/user/deployment/security/end-to-end evidence required by `docs/ROADMAP.md` and the responsible product owners.

An accepted or implemented Design is not automatically qualified. A Design becomes verified only under `SDD.md` after its applicable falsifiers and evidence layers are satisfied.

## 7. Evidence record requirements

For a claim that may be reused later, record enough identity to test whether it is still applicable:

- exact Git/source identity;
- exact environment, provider, filesystem/runtime or client profile relevant to the claim;
- exact command/falsifier and outcome;
- counts/coverage/benchmark values only as observations in evidence, never as current authority here;
- any unsupported or unexecuted layer;
- referenced Design/product owner and durable evidence path when applicable.

## 8. Historical boundary

The pre-D0032 executable-acceptance/evidence aggregate is preserved byte-identically at `docs/history/mvp-verification-and-evidence.md`. It records earlier test counts, benchmark observations, completion narratives and the former `docs/MVP.md` authority state. It is history/evidence, not a live qualification owner.

Historical Design/evidence records may truthfully retain references to the former path. Current bootstrap, owner tables, routing/navigation and current qualification-dependent Design links resolve to this file instead.
