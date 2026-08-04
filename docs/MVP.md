# Terminal Developer MVP and Verification Plan

> Authority: this document owns implementation order, production vertical slices, MVP boundaries, acceptance scenarios, verification methods, fault-injection requirements, release gates, and the distinction between implemented, tested, installed, active, public, and client-visible completion.

## 1. MVP objective

Deliver one user-owned Termux-to-Cloudflare development control plane that can durably execute and verify a bounded development change through the final CaseDO, AgentDO, Agent, protocol, security, setup, and evidence boundaries.

The MVP is not accepted by compiling isolated packages or demonstrating a mock queue. It requires a complete public path on the reference host.

## 2. Fixed MVP scope

```text
users per deployment              1
Cloudflare deployments tested     1
Termux Agents required            1
active Agent connections          1
high-cost Agent concurrency       1
Workspaces                         multiple in model; at least 1 in acceptance
Projects                           multiple in model; at least 1 in acceptance
Cases                              multiple
Task execution                    sequential on the reference Agent
host support claim                 Termux on Android ARM64 only
```

The data model can support multiple Cases. Multi-Agent placement and cross-Agent target migration are out of scope.

## 3. Definition of done by layer

The implementation keeps these completion layers separate:

```text
contract and schema
source and checkout
unit and state-machine tests
build and package
release assets
local CLI installation
Cloudflare resource creation
stored migrations
active Edge release
Agent binary and service
Agent authenticated connection
Workspace and Project registration
public MCP behavior
current client-visible schema
rollback and recovery
```

A green result in one layer does not prove another layer.

## 4. Milestone sequence

### M0 — schema and pure domain foundation

Deliver:

- canonical JSON Schema source layout;
- generated TypeScript and Go types;
- canonical JSON and typed digest implementations;
- CaseContract and CaseTargetGrant validation;
- pure Case, Task, and Attempt transition functions;
- typed errors, Events, evidence, and request dedupe model;
- golden cross-language fixtures.

Acceptance:

- TypeScript and Go accept and reject the same fixtures;
- canonical JSON bytes and digests match exactly;
- all allowed and forbidden transitions are table-tested;
- no Cloudflare, filesystem, Git, process, or Termux import exists in domain code.

Test maintenance minimizes test files and duplicated setup, not behavioral coverage. Existing fixture tables and transition matrices are extended for new cases. A new test file is added only for a genuinely separate runtime boundary or when adding the regression to an existing table would obscure the contract. Tests are never weakened, skipped, deleted, or overwritten merely to make an implementation pass.

### M1 — CaseDO storage and public control core

Deliver:

- CaseDO SQLite schema and migrations;
- atomic new-Case plus first-Task admission;
- request dedupe;
- Case and Task query tools;
- Case control, Task control, cancellation, and terminal validation;
- transactional audit Events;
- bounded rendering and Artifact metadata stubs.

Acceptance:

- commit-then-response-loss returns the original Task;
- same request ID with different digest is rejected;
- terminal records are immutable;
- hibernation and instance restart preserve canonical state;
- Events and current rows commit atomically;
- completion without evidence is rejected.

### M2 — AgentDO connection, enrollment, and queue

Deliver:

- Agent enrollment grant validation;
- proof-of-possession challenge;
- Agent public-key storage;
- reconnect and epoch replacement;
- hibernation-capable WebSocket;
- one-slot durable queue;
- fencing tokens;
- idempotent dispatch and result receipts;
- capability observation.

Acceptance:

- expired, replayed, or wrong-key grants fail;
- a replacement connection increments epoch;
- old connections cannot submit accepted results;
- duplicate dispatch uses one queue record;
- queue and receipt state survive hibernation;
- incompatible protocol reports upgrade required and receives no work.

### M3 — first production vertical slice: file.read

Deliver the complete public path:

```text
list_resources
-> create Case and file.read Task
-> CaseDO admission
-> Attempt dispatch_pending
-> AgentDO queue
-> Termux Agent execution
-> typed FileReadResult
-> CaseDO result acceptance
-> get_task
-> evidence/checkpoint
-> Case completion
```

No mock Agent or bypass transport is accepted for the end-to-end gate.

Acceptance:

1. A bounded UTF-8 line read succeeds.
2. A bounded binary byte-range read succeeds.
3. The result reports the complete file SHA-256.
4. Exact digest mismatch fails durably.
5. Path traversal fails.
6. Symlink escape fails.
7. Root identity mismatch fails.
8. Wrong grant and missing effect fail admission or local revalidation.
9. Duplicate request ID creates no duplicate Task.
10. Disconnect before dispatch receipt reconciles the same Attempt.
11. Disconnect after start does not create a duplicate read Attempt without reconciliation.
12. Stale epoch result is rejected.
13. Case and Task remain queryable after client disconnect and DO hibernation.

### M4 — exact file mutation

Deliver `file.apply` create, replace, and exact-edits modes.

Acceptance:

- create requires proven absence;
- replace requires exact digest;
- exact edits require exact occurrence counts;
- result digest is supplied and verified before final replacement;
- same-directory atomic replacement is used;
- parent creation is explicit;
- unrelated files are unchanged;
- lost response is reconciled by before/after digest;
- ambiguous third state becomes unverified;
- delete and move are unavailable.

### M5 — Git observation and commit path

Deliver:

```text
git.status
git.inspect
git.diff
git.history
git.stage
git.commit
```

Acceptance:

- object format is observed rather than assumed;
- status digest is deterministic;
- complete source digest includes changed and untracked content under policy;
- staging requires exact status digest and selected paths;
- commit requires exact HEAD and index tree;
- commit never stages implicitly;
- author and committer use local identity profiles without changing global config;
- lost commit response recovers an existing matching commit rather than creating a second commit;
- unrelated index entries and refs remain unchanged.

### M6 — validation and bounded profiles

Deliver:

```text
validation.describe
validation.run
ProcessProfile registry
process.run
```

Acceptance:

- profiles are versioned and digest-bound;
- arbitrary shell, executable, argv, environment, and cwd inputs are rejected;
- ValidationProfile executes against an exact source digest;
- failed checks produce a successful Task with failed validation verdict;
- skipped, unsupported, contaminated, timed-out, cancelled, or incomplete output produces indeterminate verdict;
- process nonzero exit is a result, not an execution failure;
- mutate and external profiles require Task approval;
- process termination uncertainty becomes unverified;
- output bounds and Artifact fallback are enforced.

### M7 — remote synchronization

Deliver:

```text
git.fetch
git.push
```

Acceptance:

- local credentials remain local;
- remote profile identity is digest-bound;
- fetch uses exact source and destination expectations;
- push is fast-forward only;
- force and delete are unavailable;
- lost push response is reconciled by reading the remote ref;
- a private-email rejection or other provider error is a typed remote failure;
- remote equality is verified after publication.

### M8 — release, installer, and setup

Deliver:

- coherent release manifest;
- prebuilt CLI, Agent, and Edge bundle;
- installer bootstrap verification proof;
- resumable `tdev setup` journal;
- Cloudflare profile management;
- deployment discovery and exact resource creation;
- Edge deployment and migrations;
- Agent service installation and enrollment;
- Workspace and Project registration;
- public end-to-end probe.

Acceptance:

- clean Termux installation succeeds without Node.js, npm, Wrangler, Go, or source build;
- every injected stage failure can resume without duplicate resources;
- an existing verified deployment is reused;
- partial conflicting deployment stops without destructive normalization;
- endpoint and token remain stable on reinstall;
- unsupported host fails before mutation.

### M9 — lifecycle and recovery

Deliver:

```text
tdev uninstall
tdev destroy
tdev auth forget
tdev upgrade
tdev rollback
tdev agent replace
tdev agent revoke
tdev doctor
```

Acceptance:

- uninstall preserves cloud deployment and auth profile by default;
- destroy deletes only exact owned Cloudflare resources;
- auth forget removes local credential without deleting resources;
- upgrade uses one coherent release manifest;
- rollback is allowed only when stored state is compatible and is independently verified;
- Agent replacement proves new connection before normal revocation of old Agent;
- doctor distinguishes process, connection, public endpoint, client schema, and recovery health.

### M10 — complete development scenario

Run one Case through:

```text
resource discovery
file.read
file.apply
git.status
git.diff
validation.run
git.stage
git.commit
git.push
remote verification
Case evidence mapping
Case completed
```

The scenario must use the public MCP endpoint and the current client-visible schema.

## 5. MVP public Operation set

The required Agent Operations are:

```text
agent.status
agent.probe
workspace.list
workspace.inspect
project.list
project.inspect
file.list
file.read
file.search
file.apply
git.status
git.inspect
git.diff
git.history
git.fetch
git.stage
git.commit
git.push
validation.describe
validation.run
process.run
```

The fixed control/query surface is defined by the protocol and is also required.

## 6. MVP non-goals

Do not add these while completing the MVP:

- claimed Linux support;
- additional desktop operating systems;
- multi-Agent scheduling;
- WorkspaceDO or ProjectDO;
- operation batches or general DAG workflow;
- arbitrary shell execution;
- repository creation;
- pull request, issue, release, or Actions management;
- file deletion or move;
- worktree lifecycle;
- package installation;
- service or runtime Operations;
- custom domains;
- automatic ChatGPT settings mutation;
- encrypted credential export;
- generic policy language;
- plugin system;
- telemetry platform.

A non-goal can be reopened only after the active MVP acceptance no longer depends on unresolved core behavior.

## 7. Test strategy

### 7.1 Pure state tests

Use table-driven tests for every state and transition. Assert public results, canonical rows, revisions, and Events.

### 7.2 Cross-language protocol tests

Run the same golden vectors through TypeScript and Go:

- schema accept/reject;
- canonicalization;
- digest;
- identifier parsing;
- error decoding;
- dispatch and result envelopes.

### 7.3 Storage tests

Use isolated SQLite databases and migration fixtures. Verify:

- exact predecessor version;
- transactional state plus Event;
- dedupe persistence;
- terminal immutability;
- failed migration rollback behavior;
- compaction without deleting referenced evidence.

### 7.4 Controlled concurrency tests

Use controlled queues, barriers, events, and fake clocks. Do not use sleep as success criteria.

Required races:

```text
cancel versus success
reconnect versus late result
duplicate dispatch
result redelivery
Case pause versus new Task admission
policy narrowing versus queued dispatch
same request ID concurrent submission
```

### 7.5 Agent filesystem tests

Run in temporary roots with real files, symlinks, mounts where available, nested directories, binary content, permissions, and concurrent external changes.

### 7.6 Git tests

Use real temporary Git repositories and local bare remotes. Cover:

- unborn and detached HEAD;
- SHA-1 and supported SHA-256 object formats where available;
- tracked, untracked, ignored, renamed, deleted, and binary files;
- index-only changes;
- hook rejection;
- remote rejection;
- lost-response simulation;
- author and committer profiles.

### 7.7 Cloudflare adapter tests

Use pure adapters and recorded API fixtures for fast tests, then isolated test deployments for:

- Durable Object storage and hibernation;
- D1 migrations;
- R2 upload and authorization;
- Worker routing and MCP transport;
- resource creation response loss;
- deployment discovery conflict.

### 7.8 Reference-host tests

A clean Termux-on-Android-ARM64 device is required for release qualification. Emulation or a generic Linux environment is supplementary only.

## 8. Fault injection matrix

At minimum inject failure after:

```text
CaseContract write before response
Task write before response
Attempt dispatch_pending commit
AgentDO queue commit
Agent receipt before CaseDO acknowledgement
process spawn
file temporary write
file atomic replacement
Git commit creation
remote push transmission
R2 byte upload before metadata commit
D1 projection update
Edge deployment upload
D1 migration
Agent service installation
Agent enrollment grant consumption
setup journal write
```

For each boundary verify:

- canonical owner state;
- whether an external effect may exist;
- retry permission;
- reconciliation path;
- unrelated state preservation;
- user-visible outcome.

## 9. Acceptance evidence matrix

| Acceptance | Required evidence |
| --- | --- |
| schema consistency | TypeScript and Go golden-vector results plus generated-diff clean |
| Case durability | CaseDO state before and after hibernation/restart |
| no duplicate Task | request dedupe record and Task count |
| no duplicate effect | Attempt receipt, target observation, and exact final digest/ref |
| Agent fencing | old-epoch rejection plus new-epoch accepted result |
| path containment | public typed failure and unchanged outside target |
| validation result | profile digest, exact source digest, parsed counts, output completeness |
| commit | expected HEAD/index and observed commit/tree/parent/identity |
| push | expected local and remote refs plus post-push remote observation |
| setup resume | stage receipts and no duplicate Cloudflare resources |
| active Agent | service observation plus authenticated WebSocket and capability probe |
| public MCP | endpoint call using deployment token and current catalog digest |
| client schema | actual client-visible tool schema or explicit refresh-required result |
| rollback | active predecessor release, stored schema, Agent connection, public probe |

## 10. Documentation and generated-contract gates

Before implementing a slice:

1. the relevant owner document and canonical schemas are frozen;
2. acceptance and verification commands are named;
3. unknowns affecting public behavior are either resolved or hard-stop the slice.

Before merging a slice:

- generated TypeScript and Go code matches schemas;
- examples validate;
- no duplicate owner or generic escape hatch was introduced;
- complete diff is reviewed;
- affected-domain tests pass;
- required full deterministic gate passes;
- reference-host or live gate passes when affected.

## 11. Review checklist

Every implementation review asks:

- Did a new owner appear?
- Is the owner replacing or duplicating an existing fact?
- Did a state meaning get spread across flags, timers, maps, or caches?
- Can a missing or failed value become an empty success?
- Can an Operation broaden its targets or effects?
- Are preconditions exact and refreshed only from authoritative readers?
- Does cancellation distinguish request, process termination, external effect, and terminal commit?
- Can a lost response trigger duplicate mutation?
- Are secrets excluded before persistence?
- Is every validation claim limited to its observed scope?
- Does the change preserve unrelated files, refs, processes, resources, and routes?

## 12. Release qualification

The first public release requires:

- all M0 through M10 acceptance green;
- no unsupported or skipped mandatory reference-host gate;
- verified release bootstrap on clean Termux;
- verified setup resume on injected failures;
- current Cloudflare API permission template proven by actual calls;
- documented battery/background behavior with measured results;
- source, package, installation, Edge, Agent, public MCP, client schema, and rollback evidence;
- a viable predecessor or documented first-release recovery path;
- no unresolved security incident or possible secret persistence;
- installation and recovery documentation matching actual behavior.

## 13. Evidence-gated follow-up

The following can be decided without user product preference after measured implementation evidence:

- exact inline and Artifact byte defaults;
- Event and Artifact retention values;
- Agent heartbeat and lease durations;
- enrollment grant expiry default;
- Android wake-lock and foreground notification defaults;
- release bootstrap signature mechanism;
- whether cheap read-only Agent Operations can safely use limited parallelism;
- whether observed multi-Case contention justifies a WorkspaceDO or ProjectDO.

These decisions are recorded in their owner documents with measurements and do not silently change product scope.
