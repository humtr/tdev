# Design 0013 - Real Repository Context and Model Transport

- Status: verified
- Class: 2
- Development identity: `mvp-1a-7` - same active development direction
- Direct source predecessor: exact `mvp-1a-7@4b3986917cacd4e9c8db1209c59bcec678ebbaa3`
- Semantic/publication precursors: verified D0010 semantic authority, D0011 local Git projection, D0012 remote derived publication
- Repository context profile: `tdev.repository-context.git-full-text.v1`
- Model transport profile: `tdev.model.subprocess-json.v1`
- Executor operation: `tdev.model.repository`

> Verified direction decision: D0013 adds a read-only repository context source and a result-only local subprocess transport outside the Case authority boundary. The D0010 Case head and semantic root remain tdev current-state authority. Git commit/tree/blob identities, repository context descriptors, model requests, process responses, and transport observations remain derived inputs/evidence. No new `mvp-*` branch is required.

## 1. Decision

The next measured substrate is one production-shaped executor adapter, not a Context CAS or cache abstraction. D0013 introduces a `GitRepositoryModelExecutor` that:

1. reads one exact immutable Git commit from a deployment-configured local repository;
2. materializes the complete supported committed text tree for every Attempt;
3. requires that path-to-text tree to reproduce the invocation `baseDigest`;
4. sends one canonical request to one fresh local subprocess;
5. accepts one request-bound canonical response containing an existing tdev result variant; and
6. returns only that declared result to the existing runner, which performs the normal result envelope, fencing, lease, and result validation.

The first profile is intentionally full-context and process-per-Attempt. It creates the baseline measurements needed to justify later ContextSlice/CAS or warm-executor work without implementing either optimization now.

## 2. Authority and ownership

Authority order remains:

```text
D0010 Case head -> D0010 semantic root / Plan baseDigest
                  -> D0013 read-only Git context
                  -> D0013 subprocess request/response
                  -> existing isolated Task result acceptance
                  -> existing Promotion
                  -> D0011/D0012 derived Git publication
```

Only the existing Case/semantic owners elect tdev current state. D0013 does not own Task lifecycle, readiness, Claims, Attempt election, canonical tree state, semantic roots, Git publication refs, or provider state.

The configured repository path, Git executable, model executable, model arguments, process environment, and timeout are deployment state. They are not Task input, result, snapshot, Case authority, or publication authority.

## 3. Repository context identity

Task input for operation `tdev.model.repository` has exactly:

```json
{
  "repositoryCommitOid": "full lowercase Git commit OID",
  "instruction": "bounded scalar string"
}
```

The repository path is constructor configuration and is never supplied by the Task or model response.

For every Attempt the adapter resolves the repository object format and requires a full SHA-1 or SHA-256 commit OID. It reads the exact commit and tree without an index or worktree. The first context profile accepts only regular blob entries with mode `100644` or `100755`; symlinks, submodules, unsupported modes, invalid UTF-8, invalid/reserved paths, topology collisions, per-file overflow, entry overflow, and total-tree overflow fail before the model process starts.

Paths are ordered by tdev text ordering. Contents are decoded as fatal UTF-8. The adapter validates the materialized path-to-text map through the default tdev text-tree policy and computes the existing semantic tree digest. That digest must equal the runner invocation `baseDigest`. A Git commit that does not represent the exact Plan base therefore cannot be used as context.

Executable mode is retained as repository context metadata but does not change the existing semantic `baseDigest`, whose contract remains path-to-text only.

The context descriptor binds:

```text
schemaVersion
profile
objectFormat
commitOid
treeOid
semanticBaseDigest
fileCount
contentBytes
ordered files: path, mode, blobOid, byteLength
```

with domain `tdev.repository-context.git-full-text.v1`. Raw file contents are sent in the request but are not duplicated inside the descriptor.

## 4. Full-context baseline, not ContextSlice

Every D0013 Attempt reconstructs and sends the complete supported commit context. There is no content-addressed context store, manifest cache, ContextSlice, token deduplication, path-selection heuristic, cache-locality scheduler, or warm executor pool.

This is deliberate. The adapter emits non-authoritative observations containing `contextDigest`, file count, content bytes, request bytes, response bytes, Attempt identity, and scan/process/total durations. Offline evidence can group equal `contextDigest` values to derive unique bytes, duplicate bytes, and retry reconstruction bytes without creating a second correctness owner or cache.

One process is started per Attempt, so the baseline explicitly records process starts and zero process reuse. Later designs may compare warm-pool evidence against this baseline.

## 5. Model subprocess request

The model transport starts exactly one deployment-configured executable with an argument array and no shell. D0013 does not accept a command string from Task input.

The process receives one canonical JSON request on stdin. The request contains:

```text
schemaVersion = 1
profile = tdev.model.subprocess-json.v1
repositoryContext descriptor
repository files with path, mode, blobOid, byteLength, content
invocation identity excluding the non-serializable AbortSignal:
  caseId
  planRevisionId
  planDigest
  baseDigest
  effectKey
  fencingToken
  claimLease
  task
  attempt
  acceptedResults
requestDigest
```

`requestDigest` is a domain-separated SHA-256 digest over the complete request identity before the digest field is added. The request therefore binds the exact repository bytes and all existing Attempt/Plan/fencing inputs transported to the subprocess.

D0013 accepts only work Tasks whose `execution.operation` is `tdev.model.repository` and whose `effectClass` is `result-only`. Promotion remains internal. Provider mutation or a model command with externally mutable side effects is outside this profile.

## 6. Process environment and trust boundary

The subprocess is a trusted local deployment component under the current source trust model; D0013 is not a sandbox.

The adapter does not inherit the caller environment by default. Environment entries, executable path, arguments, timeout, and working directory are constructor/deployment configuration and are not serialized into requests or canonical results. The adapter never accepts tokens, passwords, API keys, cookies, authorization headers, repository paths, or executable paths through Task input.

A future provider-backed model transport must separately define credential ownership, network authentication, billing/retry consequences, data egress policy, response-loss semantics, and hostile-provider assumptions. D0013 does not infer those contracts from a local subprocess.

## 7. Response binding and result algebra

The subprocess must exit successfully and emit exactly one bounded strict JSON object:

```json
{
  "schemaVersion": 1,
  "profile": "tdev.model.subprocess-json.v1",
  "requestDigest": "sha256:...",
  "result": {}
}
```

The echoed `requestDigest` must exactly equal the current request. A stale, cross-Attempt, cross-Case, cross-Plan, or cross-context response therefore fails at the transport boundary.

The adapter returns only `result`. It does not apply a ChangeSet to the repository or canonical tree. Existing `CaseEngine` acceptance still validates the complete result envelope, executor epoch, Plan identity, fencing token, Claim lease, declared result kind, result-specific limits, and ChangeSet `baseDigest` before state changes.

Raw subprocess stderr is diagnostic-only. Canonical errors and observations may retain exit/signal/byte counts but not stderr contents, environment contents, repository path, executable path, or file contents.

## 8. Failure, retry, timeout, and cancellation

The first profile is result-only. Repository observation failure, context mismatch, spawn failure, timeout, non-zero exit, output overflow, invalid UTF-8/JSON, invalid response shape, or request-digest mismatch produces no accepted result and never mutates the repository or Case directly.

Retry remains owned by the existing Task `retry.maxAttempts` budget. Each retry reconstructs the full repository context and starts a fresh process; D0013 never performs a hidden transport retry.

The adapter observes the supplied Attempt AbortSignal. Pre-aborted requests do not spawn. An abort or configured timeout terminates the child and returns a bounded transport failure. This does not upgrade current runner cancellation into provider-level command delivery; command-driven Agent/provider cancellation remains future work.

## 9. Limits

The default repository bounds reuse the current source defaults:

- at most `DEFAULT_LIMITS.maxTreeEntries` files;
- at most `DEFAULT_LIMITS.maxFileBytes` per decoded text file;
- at most `DEFAULT_LIMITS.maxTreeBytes` total text bytes;
- normal default tdev path policy, including `.git` and `.tdev` denial.

Canonical request size is additionally bounded by `DEFAULT_LIMITS.maxPlanBytes`. Model stdout is bounded by `DEFAULT_JSON_LIMITS.maxBytes`; model stderr is bounded and discarded from canonical data. Model timeout is required deployment configuration rather than an inferred product SLA.

Adapter-specific constructor limits may only tighten these defaults in D0013; widening them requires a later contract decision.

## 10. Measured observations

A caller may supply a non-authoritative observation callback. Each completed/failed Attempt observation contains bounded scalars only:

```text
schemaVersion
profile
caseId
taskId
attemptId
repositoryCommitOid
contextDigest
fileCount
contextBytes
requestBytes
responseBytes
processStarts = 1
processReuses = 0
scanDurationMs
processDurationMs
totalDurationMs
outcome
```

Durations and transport byte counts are evidence, never semantic/result identity. Observation callback failure must not change a successful transport result; it is diagnostic-only.

Checked evidence derives:

- requested context bytes from every observation;
- unique context bytes from the first occurrence of each `contextDigest`;
- duplicate context bytes from repeated occurrences;
- retry reconstruction bytes from repeated Attempts of one Task/context;
- process cold-start count from `processStarts`.

For exactly `N` Attempts that each send the same complete context, the repeated-context fraction after counting the first copy as unique is structurally `(N - 1) / N`. The historical four-Attempt value of 75% was therefore predictable from this execution model. The D0013 measurement contribution is the absolute repository/context size and the actual Git, decode, validation, hash, serialization, process, retry, memory, and concurrency costs observed on the real source candidate; the checked historical numbers remain unchanged.

No token count is invented. Token accounting remains unavailable until an actual provider/model tokenizer contract exists.

## 11. Security and repository safety

D0013 repository Git commands are read-only and use argument arrays. Inherited `GIT_*` routing is scrubbed by the existing Git command boundary. No checkout, index update, ref update, clean, reset, hook, credential, or remote command is part of context construction.

Full-context transfer is verified only to a trusted local subprocess under the current same-host source trust model. D0013 does not claim that arbitrary committed repository contents are safe to send to an external provider. Provider data-egress/redaction policy is a separate security design gate.

The subprocess result is untrusted. It cannot bypass current result normalization, fencing, Claim validation, Promotion conflict rules, or D0010 semantic authority.

## 12. Migration and rollback

D0013 is additive and writes no durable schema or migration marker. Existing v2/v3 Cases, D0010 semantic objects/head, D0011 local Git refs, and D0012 remote publication are unchanged.

Rollback is operational: stop selecting the D0013 executor profile and continue using the existing injected executor path, or revert the additive source commit. No persistent data downgrade or provider rollback is required.

## 13. Acceptance matrix

| Area | Cheapest falsifier | Required result |
| --- | --- | --- |
| direction/authority | repository/model state elects Case current state | reject design/implementation |
| exact repository base | commit text map digest differs from invocation `baseDigest` | fail before subprocess spawn |
| immutable commit | worktree changes after Plan creation | request still reads exact bound commit |
| modes | current repository includes `100755` text | preserve mode as context metadata; semantic digest unchanged |
| unsupported Git entry | symlink/submodule/unsupported mode | fail closed before model spawn |
| text safety | invalid UTF-8, reserved/invalid path, oversized file/tree | fail closed |
| full-context baseline | two Tasks use same commit | both reconstruct/send full context; evidence shows duplicate bytes |
| retry baseline | first Attempt fails and Task retries | full context/process reconstructed; no hidden transport retry |
| request binding | subprocess echoes another request digest | reject response |
| stale fencing | result arrives after Attempt becomes stale/cancelled | existing runner/engine rejects or ignores it without canonical mutation |
| result validation | subprocess returns malformed/wrong-kind result | existing acceptance fails closed |
| repository safety | model returns ChangeSet | adapter does not write worktree/index/ref; only Promotion may change canonical Case state |
| environment routing | inherited `GIT_DIR`/Git hooks try to redirect scan | ignored by Git boundary |
| process safety | command string/shell injection attempted through Task input | impossible; executable/argv are deployment configuration |
| output bound | stdout/stderr exceeds limit | child terminated, bounded failure |
| timeout/abort | child hangs or signal aborts | child terminated; no accepted result inferred |
| metrics authority | timing/byte observation changes | no semantic/result digest change |
| regression | complete source suite on compatible POSIX | D0010/D0011/D0012/v2 semantics unchanged |

## 14. Validation layers

D0013 verification is layered:

1. focused tests with real temporary Git repositories and a real Node subprocess fixture;
2. exact base binding, 100644/100755 handling, unsupported mode/invalid UTF-8/limit failures, immutable-commit behavior, environment routing, response binding, result validation, retry reconstruction, timeout/abort, and repository non-mutation falsifiers;
3. a measured run against the actual tdev Git commit that records file/context/request/process observations but never repository contents or secrets;
4. complete source/coverage/effective-diff gate on a compatible POSIX runtime;
5. final local focused gate and independent remote publication verification.

A Node fixture proves the subprocess transport contract, not model quality or provider integration. No claim of actual LLM/provider execution is made without separate evidence.

## 15. Non-goals

D0013 does not implement Context CAS, ContextSlice, context caching, token accounting, warm process/toolchain pools, locality scheduling, preflight, repository writes, worktree patch application, validation toolchain reuse, provider/model network APIs, provider credentials, billing semantics, Cloudflare adapters, distributed Claims, MCP/client transport, D0012 provider-ref qualification, or semantic authority in Git/model/process state.

## 16. Completion boundary

D0013 may be marked `verified` only for the exact local repository/context/subprocess transport and measurement layers independently exercised. The source must show that the actual repository can be reconstructed as bounded UTF-8 context, that the request is bound to the existing Plan base and Attempt identities, that the subprocess cannot directly mutate tdev authority through its response, and that repeated context/process costs are measured rather than estimated.

Actual external model/provider transport, tokenizer/token cost, provider authentication, data-egress policy, warm reuse, ContextSlice/CAS, and distributed Agent delivery remain future Class 2 work.

Because D0013 preserves the existing semantic/current-state owners and only adds an outer executor transport, it continues on `mvp-1a-7`. A future design that moves authority into repository/model/provider state is a genuine direction-change boundary and must not be inferred from D0013.

## 17. Verification record

D0013 became `verified` on 2026-08-10 without changing the active `mvp-1a-7` development direction. The independently validated source candidate is `3f7c04ad4e343af2968d082bf4ffb559e2580100`. GitHub Actions run `31331491616`, job `93290347063`, on Node `v22.23.1` / Git `2.54.0` / Ubuntu-compatible Linux passed **216/216 complete source tests**, **92.86% line / 81.61% branch / 96.34% function coverage**, **16/16 focused D0013 tests**, the exact source-candidate repository context probe, and the effective diff gate. The validation workflow commit changed only its temporary workflow after the exact source candidate.

Checked evidence is `docs/evidence/mvp-1a-7-repository-model-transport-2026-08-10.json`, SHA-256 `a470635bee28c5584ac61abf51340548d6df5eca3872dbd73569b0ea8a03a614`. The independent repository probe observed SHA-1 tree `a3eaa014d122c6ccbfc58e9945520eb4569d588e`, 101 supported files, 1,757,785 content bytes, semantic base digest `sha256:c34ee68955f7acadf8c104f1b0077f512138f25215f34f9b1b6383a9a6a7418b`, context digest `sha256:aa1b3d1a9b9ee155ed73bc0d4b8250d091ef942558567af39fde8feeec6d6ec4`, and `src/cli.mjs` as the retained executable text file.

The measured baseline ran three Cases / four Attempts against that same context, including one failed subprocess followed by the existing Task retry. It requested 7,031,140 context bytes for 1,757,785 unique bytes, so 5,273,355 bytes repeated; the retry reconstructed the complete 1,757,785-byte context; four processes started and none were reused. The 75% fraction follows structurally from `(4 - 1) / 4`; the measured contribution is the absolute byte and Git/process cost. This closes the intended pre-optimization measurement gate without preselecting a later implementation. D0014 subsequently compared broader alternatives and selected bounded exact-base preparation reuse first. D0013 does not establish external model/provider transport, token accounting or token savings, provider authentication/data-egress/billing/retry semantics, warm-process benefit, locality scheduling, or model/provider semantic authority.
