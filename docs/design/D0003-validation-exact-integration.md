# D0003 - Required validation and exact canonical integration

- Design: `D0003`
- Title: `Required validation and exact canonical integration`
- Status: `accepted`
- Depends-On: `[D0001, D0002]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `validation-identity, canonical-integration, stale-conflict-semantics`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

A passing candidate at base B is not necessarily a passing combined result at a newer canonical head H. Validation and publication must bind identical complete bytes without holding a global lock for the duration of tests or inventing a predecessor Promotion lifecycle.

## Required outcome

Only a result passing the required validation for its exact full target tree can enter the canonical ref. Concurrent attempts have an explicit linearization rule. Stale/conflicting work cannot overwrite newer bytes. Retry and response loss do not create another logical commit or obscure whether the intended effect occurred.

## Facts / assumptions / unknowns

Git remote ref update provides an expected-old-object boundary through the push protocol. GitHub REST ref update with `force:false` alone is not the chosen exact-CAS implementation. The initial managed ref must reject force rewrites/deletion, and dev-2 holds narrowly scoped write authority. Additional authorized fast-forward writers are safe but can cause retries. Provider policy and actual expected-old-ref behavior must be verified in a disposable live fixture. No numeric throughput advantage is established by this Design.

## Decision

### Validation owner and policy

The broker's adopted, digest-pinned validation policy states mandatory profile IDs, trusted controller/runner digest, command definitions, toolchain/image/environment identities, applicable source scope and budgets. It is bound to the current binding and canonical policy version. The caller may request additional diagnostics, never remove required validation. A candidate-controlled file or fabricated log is not a validation authority.

The dev-2 project policy initially requires `core` and `integration` as defined in D0007; a release artifact additionally requires `release` and the affected sandbox/security/activation checks. Live experiential and comparative benchmark suites are release-completion gates, not heavyweight work attached to every source edit. Change-impact skipping is not initially trusted: mandatory core/integration suites run on the full target result. Optimize only with a later accepted, falsifiable policy change.

A policy update is a separate explicit `policy.adopt` effect under `policy.write`, referencing an already integrated policy artifact and expected old digest. The work introducing it must first satisfy the old policy. New required validators are tested before adoption; reductions require an explicit scoped policy-change intent and may not violate the Directive. A candidate may not adopt the weaker policy it needs in order to pass. Changing the trusted validation entrypoint/test selector or toolchain is treated as a policy-sensitive change: the old trusted controller must validate the proposed replacement, rather than execute the replacement as its own sole verifier. Ordinary repository tests run as untrusted input inside the sandbox. Validation proves the configured assertions, not freedom from all malicious code.

For each validation, freeze:

`validationId = sha256(canonical(repositoryId, bindingEpoch, baseHead, resultTreeOid, resultTreeSha256, policyDigest, orderedProfileDigests, toolchainDigest, environmentClass, dependencyLockDigest))`.

An attempt receipt also has a unique run ID, attempt/owner epoch, observed start/end, sandbox identity, exit/signal/deadline, mandatory profile results, input/output integrity digests and trusted receipt signature/MAC. Identity is distinct from observed run status. Only broker-verified receipts with all required profiles successful and no tracked-byte drift are eligible. Cache reuse requires the entire identity to match and policy permitting that environment; a pass at B cannot be reused for different full bytes at H. A failed, cancelled, missing or stale-epoch receipt is never eligible.

### Exact integration algorithm

Each explicit `integrate` action names one open work generation, expected work revision and fresh expected target head `H`. It may perform required target validation in the same durable action. No source change or integration permission is inferred from diagnostic execution.

1. Recheck authorization, epoch, policy and current remote head against the requested H. A mismatch returns `STALE_BASE` with a new context descriptor; do not silently substitute a head in that accepted request.
2. Let B be the work's base, T its selected immutable tree, and delta be the exact entry changes B -> T. If H equals B, target tree U is T. Otherwise require B to be an ancestor of H in the bound lineage. For every modified/deleted source path, require its entry in H still equals its entry in B; for creations/destinations require absence and no file/directory collision. Include mode and symlink type. A mismatch returns `INTEGRATION_CONFLICT` with bounded exact paths/identities. No automatic same-file textual merge, even for apparently disjoint lines. To resolve a true conflict, ChatGPT inspects H, creates a replacement work at that exact current base with newly justified edits, and closes the old work when safe; an immutable base is never silently rebound.
3. Apply that delta to H using immutable Git objects and a private index, yielding complete target tree U. Validate U under the freshly adopted required policy and environment. Disjoint paths do not imply semantic independence; full-result validation is still required. The original B/T remain intact for diagnosis; U is a separately identified integration preparation, not a stealth candidate mutation.
4. Produce one exact direct-child commit C with sole parent H and tree U, with actor, message, action ID and a timestamp frozen once in durable intent. Persist C's bytes/OID, U's strong digest, validation ID/receipt, expected H, target ref, policy digest and effect ID before any push. Retry uses those exact commit bytes. No remote empty commit, tag, receipt ref or speculative merge commit is needed.
5. Immediately before push, take the short ref-effect fence and recheck current head H, policy/authorization and the frozen validation identity. The fence covers only this target ref's effect preparation/publication/reconciliation, not source inspection, sandbox execution or validation. Publish exactly C with a provider operation that compares the actual old ref to H. The Git implementation may use explicit `--force-with-lease=<full-ref>:<H>` only after proving `parent(C)=H`; it is an expected-value guard, never authorization for a non-fast-forward. Never use the unqualified lease form, force, mirror, wildcard or multiple refspecs.
6. Read the authoritative ref and verify C is its head or an ancestor of a later observed fast-forward head. Atomically mark the effect and work integrated, recording the observed head as distinct from C. A failed local receipt write is recoverable from C/intent and remote ancestry. Return terminal success only with this readback evidence.

A no-op delta returns `NO_CHANGE` and does not create a meaningless commit or mark nonexistent source work as accomplished.

### Concurrent ordering and stale retry

Many works may compose and validate target trees concurrently. There is no branch-wide validation queue. Ready effects for the same H/ref are attempted in durable ready-order `(readySequence, actionId)`; the remote expected-old-ref update is the linearization point. A later ready effect is not held behind an earlier work that is still editing, validating, failed or blocked outside the ref effect. Different refs/repositories publish independently.

After one effect advances H, another prevalidated direct child of old H cannot publish. It becomes an explicit `STALE_BASE` result, preserving the passed-but-ineligible receipt and candidate. The caller discovers current H and submits a new integrate action for the same work/generation. Mechanical recomposition may be fast; required validation of new U still runs. Do not automatically chase a moving branch forever. The default client recipe allows up to three fresh-head integration attempts before presenting `CONTENDED_REF`, with all attempts/wasted validation measured. This is retry budget policy, not lost work or an architectural concurrency cap.

This initial choice deliberately avoids speculative merge trains, batch commit ownership and per-path distributed locks. It can incur repeated validation under eight-way single-ref load. That cost is a mandatory benchmark risk, not hidden by reporting only pre-integration throughput. If it prevents D0007 superiority, revise this bounded Design before claiming release completion; do not weaken exact-result validation or serialize all work as an undocumented workaround.

### Response loss and ambiguous effect

A transport timeout does not mean the push failed. With intent `(H,C,ref)` retained, inspect the authoritative ref:

| Observation | Meaning/action |
| --- | --- |
| Ref is C or proven descendant of C | The intended integration happened; finalize the same effect/work. |
| Ref is H and prior push process is confirmed ended | The identical C may be retried with the same expected H. |
| Ref is another descendant of H, not containing C | This effect did not integrate in the managed no-rewrite lineage; return stale/conflict, not success. |
| Remote unavailable, shallow/incomplete ancestry, running push process or ref rewrite | Keep `blocked:effect_unresolved`, resolve exact process/ancestry; do not create a replacement commit. |

A genuinely unresolved push fences new effects only for that ref; unrelated reads, edits, validations and other refs proceed. Kill/reconcile the exact push attempt before releasing the fence. Expiry alone is not evidence that a process can no longer publish. Because the managed ref is append-only, a delayed old push cannot overwrite a newer head. An administrative ref rewrite creates a new binding epoch and requires reconciliation before admission; it is not normal recovery.

The external ref and local ledger are not in one distributed transaction. Safety comes from a single remote linearization point, pre-persisted exact intent and readback reconciliation. During a provider outage there may be an explicitly unknown outcome, but never an untracked partial canonical state or fabricated terminal result. An atomic one-ref push leaves either H or C, not a half-applied tree. Liveness requires provider availability; correctness does not.

## Concurrency and isolation

Same-path work does not block development admission: candidates are isolated. It conflicts at integration unless the expected entries remain identical. Semantic cross-path conflict is detected through required full-tree validation, not falsely dismissed by disjoint path sets. A shared canonical ref is a real linear invariant, justifying only its small publication boundary. Validation processes remain outside all ref/SQL locks. Fairness and timeout tests must prove failure of one work cannot consume the ref fence without an actual unresolved effect on that ref.

## Failure and recovery

Test crashes after validation, after commit freezing, before/after remote acceptance, after readback and before local finalization. Test cancellation before intent (no effect), during push (reconcile), and after commit (report too late, never reset). Changed policy invalidates eligibility at push time even if a prior test passed. A remote permission rejection is failure, not a retry storm. Readback has a bounded per-attempt deadline; durable blocked state survives beyond it with the next permitted reconciliation action.

## Alternatives

Validate only the original patch and then cherry-pick is rejected because integrated full bytes differ. A global validation lock gives simple ordering but destroys independence. GitHub `force:false` without exact H is too weak for this contract. Two-phase distributed commit across a database and Git is unnecessary. Grouping disjoint works into one commit could amortize tests but couples failure and completion; not introduced without evidence it is needed. Renaming Promotion without removing its extra lifecycle would not simplify the boundary.

## Acceptance

Demonstrate exact tree/manifest equality between the trusted validation input and C. Prove one canonical commit under identical retries and dropped responses. Race eight direct-child integrations at H and prove only eligible effects publish; others retain exact candidates and explicit stale outcomes. Recompose disjoint edits and revalidate the resulting full tree. Reject overlapping mode/delete/rename/directory changes, wrong policy, forged receipts and stale authorization. Inject failure at every effect boundary and verify authoritative readback. Report integration-inclusive latency and repeated validations, not just candidate completion.

## Implementation consequences

Use a pure target-tree composer, a trusted validation evaluator, a frozen-effect record and a narrow expected-ref Git writer/reconciler. Do not build a generic saga, promotion engine, merge queue or qualification state machine. D0004 exposes the operations; D0007 sets measurement gates.
