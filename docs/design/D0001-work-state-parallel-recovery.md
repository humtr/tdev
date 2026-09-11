# D0001 - Work state, parallel admission and recovery

- Design: `D0001`
- Title: `Work state, parallel admission and recovery`
- Status: `accepted`
- Depends-On: `[D0005]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `work-state, action-deduplication, parallel-admission, execution-recovery, canonical-record-encoding`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

Provide durable, reconnectable work without duplicating ChatGPT's reasoning or recreating an agent orchestration hierarchy. Persistence must prevent duplicate effects while allowing independent work to advance concurrently.

## Required outcome

A work item has stable identity, an exact repository/base, an isolated candidate, observable execution and validation, and explicit integration eligibility. Capacity 1 is serial execution of the same architecture; capacity 8 is the default; capacities 16 and 32 require configuration only. No fixed lane IDs, eight-element durable arrays, global work lock or compulsory model service exists.

## Facts / assumptions / unknowns

The requirements establish the need for stable state and deduplication, not a particular predecessor lifecycle. The initial service is single-active-broker on one durable host, with separate ledgers per repository. Availability during complete host loss is not promised; restart after process/host recovery and restore from a verified backup are supported. SQLite transaction latency and useful parallel utilization must be measured, not assumed from thread count.

## Decision

### Owners and records

The broker maintains a SQLite WAL database per repository on local durable storage, using foreign keys, `synchronous=FULL` and explicit short transactions. It holds an OS-level single-writer-owner lock per ledger. SQLite provides transactional persistence, not a distributed scheduler. Git's external ref is the only source-of-truth for canonical source; a cached head in the ledger is always an observation with time/epoch.

The minimum logical tables are:

| Record | Owned fact and key |
| --- | --- |
| `binding` | Provider repository ID, allowed canonical ref, binding epoch, policy digest; one row per binding. |
| `work` | Random 128-bit work ID, creator, exact base commit/tree, candidate generation, monotonically increasing revision, disposition, current blocker, creation order. |
| `action` | Unique `(principal, bindingEpoch, requestId)`, canonical request digest, work ID where applicable, operation, status, durable step, attempts, deadline and result/receipt references. |
| `validation` | Immutable validation result identity and trusted runner receipt; semantics owned by D0003. |
| `effect` | Exact intended ref transition and reconciliation receipt (D0003); release actions hold only a reference/projection of the sole activation-record truth (D0006), never a competing release owner. |

Immutable source/artifact bytes are filesystem objects named by verified digest; rows contain references. They are not another mutable work owner. A bounded diagnostic event/log stream may be derived from row changes; replay of an event journal is not required to discover current state. No Case, Drive, Agent, Promotion, root-task tree or inherited state is imported.

`work.disposition` is only `open | integrated | cancelled`. A failed validation is not a destroyed work item: it remains open, with a failed action and repairable candidate. Phase such as editing, validating or integrating is derived from the current action, not a competing lifecycle. An integrated/cancelled work cannot be reopened; a follow-up creates another stable work ID from freshly discovered state.

An action is `queued -> running -> succeeded | failed | cancelled`, or `running -> blocked -> queued` only through explicit safe reconciliation/retry. `blocked` is nonterminal with a precise reason and next permitted action. Authoritative reconciliation may move blocked directly to succeeded, failed or cancelled when the original effect is proven; only renewed execution requires the safe blocked-to-queued transition. A deadline/cancellation with an unresolved external effect remains blocked pending reconciliation, not falsely failed/cancelled. Retries increment `attempt` within the same action and reuse its immutable intent. Terminal receipts are immutable. Work revision increments atomically with candidate, disposition or current-action changes; log appends do not force clients to race a continually changing revision.

### Request identity and effect admission

Every mutating request carries a client-chosen request ID and exact relevant preconditions. Canonical JSON hashing excludes credentials and transport wait options but includes operation, repository, work, edits, policy and expected revisions. After authentication and repository-scoped authorization, the admission transaction first looks up the deduplication key. Same digest returns the existing action/result even if its original precondition is now old. A different digest under the same key returns `IDEMPOTENCY_MISMATCH`. Only a new key proceeds to current precondition and capacity checks; authorization is never bypassed by deduplication. No execution sandbox, mutable work state or provider effect begins before a durable action is committed. Bounded immutable Git/object staging for inline create/edit is an explicit exception: after current authorization and an initial dedup lookup, it may publish only verified content-addressed bytes before the final action/work transaction. The final transaction rechecks dedup and all work preconditions, and atomically records both the terminal inline action and candidate pointer. Failed admission leaves unreferenced immutable objects, never a partially created work or candidate. Git object-construction subprocesses use only trusted fixed plumbing, no hooks or repository execution. This exception does not apply to validation, arbitrary commands, ref updates, runtime activation or retained mutable state. It reconciles atomic initial edits with the prohibition on filesystem/network I/O inside SQLite transactions without adding a staging lifecycle or second owner.

Admission rejected before an action exists returns an explicit `accepted:false`; a caller retries the same logical request key. On uncertain transport delivery, the caller observes by request ID or resubmits the identical request, never invents a new work ID. Creating a work and assigning its ID occur in the same transaction. Client connection/session IDs are not work identity. A new ChatGPT session can list authorized open/recent works and recover by work/request ID without conversation history.

### Canonical record encoding

The common identity codec is `dev2.canonical-json.v1`. Its values are null, booleans, safe integers, Unicode scalar strings, dense arrays and plain string-keyed records. Reject duplicate parsed keys, non-integer/unsafe numbers, non-finite values, lone surrogates, cycles and non-JSON values; normalize negative zero to zero. Revisions outside the safe-integer range remain decimal strings as D0004 requires. Sort record keys by unsigned UTF-16 code-unit order, preserve array order and string code points without Unicode normalization, and encode primitive values with JSON.stringify-compatible escaping and number spelling, no whitespace. Encode the resulting string as UTF-8. Each digest is SHA-256 over UTF-8 domain name, one NUL byte and these canonical bytes, returned as `sha256:` plus lowercase hex. Domain names are versioned per record purpose; a request, source manifest, result descriptor and validation identity cannot share a domain. Schemas expand declared defaults before hashing; transport wait options and credentials never enter a mutation-intent digest. A digest supplies integrity, not authorization.

This codec owns only serialization/identity mechanics. D0002 owns source-manifest fields, D0003 owns result/validation fields and D0006 owns release fields. Golden vectors must cover key order, non-ASCII text, integer boundaries, escaping, defaults and rejection cases. A material encoding change versions its domain and cannot reinterpret retained request keys.

### Dispatch and resource policy

A deterministic ready-row selector inside the broker replaces a separate queue service. It chooses eligible actions round-robin across principals/repositories and in admission order within a work. It skips a fenced/blocked action rather than causing head-of-line blocking. A wakeup on admission/completion and a bounded periodic scan reconstruct scheduling after restart. The scan has a persistent cursor/fairness rule so a busy prefix cannot starve later rows.

`executionCapacity` is a positive integer, default 8, with no product semantic upper bound. Limits on pending requests, bytes, CPU, memory and disks are separately advertised resource policies. A deployment may cap configured execution capacity according to available resources, but neither work IDs nor API batch counts define that cap. Reads and short immutable edits do not consume a long-running execution slot. Validation, diagnostic execution and release build attempts use the same bounded execution budget; cancellation and observation retain reserved control-plane capacity.

An idle open work consumes storage, not an execution token. Reserve a token durably before dispatch. Active, launch-reserved and launch-uncertain attempts consume the budget until reconciled; only confirmed running attempts count as observed concurrency/utilization. This prevents concurrent dispatch from oversubscribing capacity. Admission may accept work into a bounded queue without claiming it is executing. Reducing configured capacity allows running work to finish; it does not cancel arbitrary IDs. Increasing it admits additional ready work without a schema change.

Mutable actions on the same work are serialized through revision/generation fencing, not a lock held during execution. Two different works may edit overlapping paths in isolation; D0003 detects the actual canonical conflict later. A validation runs against an immutable generation. A new edit either waits for the current mutating action to finish or explicitly cancels it; it cannot silently change the bytes beneath a validation.

### Recovery and cancellation

Each launch uses a unique durable attempt ID and broker ownership epoch. Persist launch intent before creating a deterministically named container. On restart, discover containers by installation/repository/work/action/attempt labels, verify their full identity, and adopt only the exact current attempt. If creation response was lost, inspection discovers the same container; never launch a second process based on a timeout alone. A missing sandbox is restarted only for declared replay-safe profiles, with a new attempt number and a fresh private materialization. Other attempts become failed/interrupted evidence and await an explicit retry. Old-epoch callbacks cannot change current rows. Adoption records a new observer ownership epoch and re-reads trusted container exit/state plus sealed artifacts; it does not accept an old callback as a current receipt.

Before repeating a provider operation, use D0003/D0006 reconciliation of the exact effect. Do not reuse a generic retry loop for unknown effects. An isolated attempt without network/credentials may be repeated; a possibly committed ref/release effect may only be reconciled and retried with its frozen identity.

Cancellation first persists intent, prevents new dispatch/effect admission, and signals the exact sandbox. It becomes terminal only after confirmed termination and resolution of outstanding effects. If integration already crossed its linearization point, report integrated with `cancellationTooLate`; do not undo canonical source. A disconnected MCP call does not cancel work. Default action execution timeout is profile-defined; the broker enforces a hard deadline and a 5-second termination grace. Observation waits are bounded independently and never extend execution deadlines.

An execution reservation's capacity-holding flag is distinct from its retained
attempt identity. Confirmed termination releases capacity, not the immutable
attempt tuple needed to reconcile a still-ambiguous effect. Keep that compact
identity and observer epoch until the action is terminal/retained. Settlement
compares the entire tuple, not only attempt ID and attempt number. Adoption
changes only observer authority; a closed epoch cannot submit callbacks.

A queued cancellation or pre-dispatch deadline expiry clears only that action's
work fence in the same transaction. Expired rows are skipped within a bounded
ready scan so they do not stall independent work. An already-retained authorized
request is returned before checking its original execution deadline: expiry does
not make response-loss recovery invent a new action. A new request still requires
a future deadline. These rules introduce no new queue or recovery owner.

Work rows store a candidate reference `(treeOid, manifestDigest)`, not a copy of
all source entries. Load the immutable SourceTree through the repository object
adapter only when an operation needs it, then verify the manifest. This preserves
bounded ledger transactions independently of repository file count. The initial
internal JSON row bound is 2 MiB (distinct from the 1 MiB public request limit);
source and large artifact bytes belong in immutable object storage, not the row.

The initial SQLite adapter uses connection-lifetime EXCLUSIVE locking mode with
WAL/FULL, relying on SQLite's OS file lock as the per-ledger ownership lock;
transactions remain short and never span execution. Opening another owner must
fail, and close/crash must release the lock. The schema's attempt rows retain a
`held` flag and immutable identity; released rows do not consume capacity.

Immutable byte publication uses a private same-filesystem file, exact digest
verification, file fsync, atomic rename and directory fsync. Concurrent publishers
of the same digest may replace the pathname only with the identical verified
bytes; inode identity is not content identity. Existing corrupt bytes are an
integrity failure, not an implicit repair. Readers open without following a final
symlink and verify type/size/digest. This does not permit replacing a candidate
materialization, mutable ledger, or another attempt's workspace.

Concrete broker recovery uses the existing action/attempt rows, not a second
recovery queue. An authorized `resume` records its own idempotent control request,
but reconciles/requeues the original action and retains its result/effect identity.
It first verifies the original operation's current capability, the exact work
revision, and that no in-process execution still owns the action. The installation
observer must independently prove both execution termination and effect-sender
termination; neither a missing broker promise nor an expired lease is proof.
Observe a retained effect before considering replay. Already integrated results
settle without another validation, commit or send. Retryable absence may requeue
only after stopped proof; full validation rerun still requires replay-safe profiles.
No-effect profile retries likewise require replay-safe execution. An expired action
is reconciled/cancelled, not silently given a new deadline; a new development action
can be admitted after the fence is resolved. A startup scan is bounded and invokes
this same transition; read-only observation never invokes it. Reauthorization can
use a freshly verified token from the same subject without changing original
request identity. A narrower token cannot resume a more privileged operation.

### Retention

Keep nonterminal work, unresolved effects, referenced objects and current/previous releases. Retain compact request-key tombstones and canonical-effect receipts for the binding epoch, even after verbose logs and scratch are removed. A cleanup cannot permit a late retry to duplicate work. Destructive reset starts a new binding epoch with explicit authorization; old-epoch mutations are rejected. Storage pressure rejects new admissions with measured limits rather than deleting unresolved truth. Logs and unreferenced immutable objects use reference-aware garbage collection; no deletion follows merely from age.

## Concurrency and isolation

The only required same-work ordering is mutation of one work revision. One target Git ref has a linear update boundary (D0003); different refs/repositories do not share it. Per-ledger SQLite writes are physically serialized for short transactional integrity, but no network call, validation, process wait or materialization occurs inside a transaction. This storage implementation is not a global workflow lock. If measured ledger contention defeats the parallel gates, replace the persistence implementation while retaining keys and transitions; do not claim eight-way progress from queue depth.

## Failure and recovery

Crash-test immediately before/after row commit, object publication, container creation, result capture and effect reconciliation. Disk-full must leave either an absent/unaccepted request or a committed action with an explicit blocker. Corrupt/missing objects fail integrity checks and block only referencing work. Database corruption stops the affected repository ledger; another repository continues. Host-wide resource/OS failure can affect the installation and is an explicit shared failure domain, not an A-to-B dependency.

## Alternatives

Pure synchronous MCP calls lose continuity on transport failure. Event sourcing plus projections adds two representations without a demonstrated need. Distributed queues and multi-host leaders are not needed for the initial single-host, eight-or-more execution target. A no-dispatcher policy leaves accepted work stranded after disconnection; the small ready-row dispatcher is justified by that concrete failure. Perpetual worker lanes are rejected because capacity is policy, not identity. An extra reasoning agent repeats intelligence already available in ChatGPT.

## Acceptance

At capacity 1/8/16/32, run the same identities and state-transition tests. At 8, prove eight sandbox intervals overlap and a blocked ninth starts when a token is released. Fail/cancel/restart A while B-H complete without waiting on A's work fence. Replay create/edit/integrate requests before and after restart and observe one logical action/effect. Test late callback fencing, request digest mismatch, fair dispatch, pending-limit pressure, tombstone replay, lost launch response, partial object write and cancellation crossing a ref commit. Instrument transaction duration and event-loop delay under load. These are implementation gates, not executed results in this document.

## Implementation consequences

Use pure transition/admission functions plus a narrow SQLite store, a ready selector and sandbox attempt adapter. Keep effect-specific rules in their owning Designs. Export read projections rather than exposing SQL rows or process IDs as the public contract. No durable schema contains a fixed concurrency-length collection.
