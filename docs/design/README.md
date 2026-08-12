# design registry

| ID | Title | Status | Scope |
| --- | --- | --- | --- |
| 0001 | Parallel-First Work Graph, Claims, Isolated Results, and Promotion | superseded | initial in-memory result-only loop |
| 0002 | Durable-Ready Parallel Control Core | verified historical foundation | effect-aware, fenced, persistent parallel control core under Node 22 |
| 0003 | Efficient Parallel Control Plane | superseded / audited | `mvp-1a-1` COW, indexes, journal delta, and benchmark experiment |
| 0004 | Incremental Transition Core and Verified Journal Cache | verified | `mvp-1a-2` entry transaction, incremental accounting, deterministic repair, and safe journal cache |
| 0005 | Immutable Expected-Revision Journal CAS | verified | `mvp-1a-3` opt-in immutable local journal, full replay, and cross-process commit-slot CAS |
| 0006 | Persistence Hot-Path Measurement Before Acceleration | verified | exact D0005 replay/read/fingerprint profiling and follow-on decision gates |
| 0007 | Verified Immutable-Journal Materialization Reuse | verified | `mvp-1a-4` exact-byte-gated disposable materialization reuse over unchanged D0005 authority |
| 0008 | Authority-Boundary Verification and Durability Admission | verified | `mvp-1a-5` complete authority-path evidence plus aggregate durable admission, legacy namespace hardening, deterministic local publication-fault classification, and checkpoint/Claim reopen liveness without semantic-authority migration |
| 0009 | Semantic-Authority Representation Comparison | verified | `mvp-1a-6` non-authoritative comparison: directory Merkle rejected; bounded path-byte radix and collision-safe path-hash trie survive; hash trie preferred for the next migration design; current authority unchanged |
| 0010 | Semantic-Authority Migration and Transactional Head | verified | `mvp-1a-7`: compressed path-byte radix v3 authority, compact snapshot, transactional local head, quiesced forward migration, repair/GC barriers; no Git/provider authority |
| 0011 | Real Git Projection and Fenced Publication | verified | `mvp-1a-7`: local SHA-1/SHA-256 Git projection and exact local ref CAS above unchanged semantic authority |
| 0012 | Authenticated Remote Git Publication | verified | `mvp-1a-7`: existing-remote-branch authenticated derived publication source contract; provider refs remain non-authoritative |
| 0013 | Real Repository Context and Model Transport | verified | `mvp-1a-7`: read-only immutable Git full-text context plus result-only trusted-local subprocess transport baseline before Context manifest/CAS/Slice |
| 0014 | Bounded Repository-Context Preparation Reuse and Process Lifecycle | verified | `mvp-1a-7`: finite executor-local exact-base single-flight/LRU preparation reuse, early bounds, unique-blob reads, Git cancellation with safe producer handoff, POSIX descendant cleanup and non-blocking observations; full request/process-per-Attempt retained |
| 0015 | Deployed MVP Program Rebaseline and D0014 Post-Verification Review | verified | `mvp-1a-7`: final MVP now requires Cloudflare/local-Agent/Git/MCP/deployment qualification; D0014 source remains verified while provenance/resource/measurement wording is corrected |
| 0016 | Per-Attempt Context Delivery Minimization Decision | accepted | Group E decision gate: immutable full-context reference envelope selected from measured post-D0014 evidence; no production source implementation |
| 0017 | Selected Context Delivery Contract | accepted / production verified (supported-Termux source) | Group E contract gate remains accepted; production `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db` independently verifies the representation-independent authorized immutable reference plus bounded packed/hybrid receiver under the declared platform qualification |
| 0018 | Adversarially Converged Model Executor/Runtime Boundary | implementing / production repair in progress | Group E runtime gate: accepted `warm-host-qualified-model-attempt-fresh`; only bounded immutable D0014 host preparation may survive Attempts, while D0017 authorization/carrier/request and model process/controller/deadline remain per-Attempt; implementation is limited to the accepted C1-C4 repair |

`accepted` authorizes only the implementation scope frozen in a design and is not a verification claim. `verified` applies only to the source/environment evidence declared in each record. Provider adapters, distributed ownership, current-client behavior, and environments that do not satisfy required filesystem primitives require independent evidence.

## Provisional future program

`docs/ROADMAP.md` lists the remaining provisional D0019+ planning identities across provider execution, CaseDO/AgentDO, MCP/security, Git runtime integration, deployment/Agent operations and final qualification. D0016, D0017 and D0018 are accepted Design-layer decisions; D0017 production source is independently verified under its declared supported-Termux qualification, while D0018 has entered `implementing` and its production repair/verification remains open. All later provisional labels remain **not accepted Designs** unless their owner records otherwise and may be merged, split, reordered or removed from evidence before implementation.
