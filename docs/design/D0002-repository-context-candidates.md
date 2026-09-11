# D0002 - Exact repository context and isolated candidates

- Design: `D0002`
- Title: `Exact repository context and isolated candidates`
- Status: `accepted`
- Depends-On: `[D0005]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `repository-snapshots, progressive-context, candidate-generations`

Accepted is a decision state, not a claim of implementation, live verification, or measured superiority.


## Problem

ChatGPT must discover and change an arbitrary authorized part of the current repository without a deployment-time source allowlist, a full-repository prompt dump or a shared mutable checkout.

## Required outcome

Every read identifies its exact repository, commit/tree and bytes. Context expands progressively with explicit limits. Edits create isolated candidate generations with all-or-nothing preconditions. Stale current-context requests are rejected; intentional historical reads remain possible without pretending they are current.

## Facts / assumptions / unknowns

Git provides immutable commits, trees and blobs; its object IDs alone do not identify a provider repository, authorization grant or binding epoch. The initial product targets normal Git source repositories, including dev-2 itself, not arbitrary host directory editing. Native object formats may be SHA-1 or SHA-256; the public identity is algorithm-tagged, never a hardcoded forty-character slot. Performance of object ingestion and materialization must be measured on the chosen host.

## Decision

### Binding and snapshot

Installation configuration binds `repoId` to `(provider, stableProviderRepositoryId, canonicalRemote, allowedRef, bindingEpoch)`. Display owner/name is navigation, not identity. A renamed repository retains provider identity only after verification. Changing the provider repository or authorized ref creates/revises the binding under administration authority; ordinary path expansion does neither. The initial self-development binding is `humtr/tdev`, `refs/heads/dev-2`; no predecessor branch is a source fallback.

`dev_context` resolves the allowed ref from its authoritative remote, fetches the exact commit and tree into the broker object store, checks object integrity and returns a snapshot descriptor. It includes repository identity, epoch, full commit/tree IDs, SHA-256 integrity digest, current validation-policy digest, observed time, freshness mode, limits and an opaque snapshot token. No successful current binding is returned solely from a stale remote-tracking ref when the remote is unavailable.

The snapshot token is authenticated and bound to subject/repository/epoch/commit/tree/policy, with a configurable expiration (initially 30 minutes). It is a handle, not permission; authorization is rechecked at use. Refreshing a token for the same immutable snapshot does not change its identity. A work's pinned base is durable and remains readable through its work ID after a token expires, subject to current access.

`freshness:current` is default. At the start of a current discovery/read transaction, observe the remote ref and reject with `STALE_CONTEXT` if it differs; include the new head but do not silently mix content. A response is exact at its explicit observation point, not a claim that the remote cannot change one instant later. `freshness:pinned` explicitly reads the named historical snapshot with a visible `notCurrent`/last-observed indicator and is useful during a multi-call exploration or active work. New work creation always rechecks the current ref equals the requested base. A historical snapshot does not authorize silently starting stale work.

### Bounded discovery

The public reader offers directory listing, literal text search, file byte ranges, candidate diff and artifact ranges, all in one typed `dev_read` tool. List Git entries, not host filesystem paths. Sort entries by raw UTF-8 Git path bytes. Search is literal, case-sensitive by default, with specified path/prefix scope; do not accept unbounded regular expressions. Cursors bind snapshot/candidate identity, query digest and last scanned entry/byte position. An expired/mismatched cursor returns an error, not a restart hidden inside an apparently complete response.

Initial advertised per-call policy: at most 256 directory entries, 64 requested files, 256 KiB returned source bytes, 1 MiB single blob read, 128 search hits and 8 MiB scanned source bytes. A large file is read through explicit byte ranges; binary content uses base64 with decoded-byte counts. A search stops on either scan budget or result budget, returning `complete:false`, scanned counts and a continuation. Unrepresentable files/types are explicitly listed. These are tunable resource limits, not work-concurrency semantics or eight-slot ceilings. Access policy applies before size/count disclosure where such metadata is sensitive.

Every returned file/range identifies path, mode, blob ID, full blob SHA-256/size, offset/length and encoding. Truncation is explicit. A request exceeding a mutation/body limit fails rather than applying a prefix. Cache immutable authorized blobs by digest; cache keys and delivery checks include repository authorization. A cache hit does not make a revoked blob readable. Negative/empty discovery results include coverage and completion so ChatGPT can distinguish absence from unsearched data.

### Candidate representation

A work begins with base commit `B` and generation 0 equal to `tree(B)`. A generation is a broker-owned immutable Git tree plus a SHA-256 manifest over sorted `(path, mode, contentDigest)` entries. Clients edit through an atomic list of `put`, `delete`, or `move` operations. Each entry carries the expected old mode/blob digest or explicit absence. `put` contains complete bytes or an exact-edit sequence with uniquely matching old text; ambiguous/multiple matches fail. `move` is an explicit source identity and absent destination, not a guessed rename heuristic.

Check work revision, limits, authorization and every expected old entry first. Build new objects in a private staging area; fsync, verify and publish by digest; then transactionally advance the work's generation/revision. A crash before row commit leaves only garbage-collectable unreferenced objects; a committed row never refers to an unflushed object. Failed edits leave the prior generation unchanged. Each generation contains the full resulting tree, while physical unchanged blobs are shared immutably. The logical delta against `B` is derived exactly from trees, including mode changes, deletions and file/directory collisions.

There is no permanently writable checkout for a work. Commands get an attempt-private materialization of a sealed generation. Prefer a read-only source view and separate writable build paths; for ordinary tools requiring a writable source directory, copy/reflink immutable bytes to a private scratch directory and verify tracked bytes/modes before and after. Do not hardlink writable candidate files to shared objects. No `.git` directory, external worktree metadata, hooks or provider credential is mounted into untrusted execution.

Diagnostic/generation profiles may produce a proposed patch artifact, but their filesystem writes never silently advance a candidate. An authenticated `edit` request can adopt exact artifact bytes with the same expected-old-entry checks. Validation always binds the generation explicitly and rejects unexpected tracked writes. D0003 owns validation/integration identities, not this storage layer.

## Concurrency and isolation

Repository reads share immutable objects and can run concurrently across works. Two source mutations on one work use optimistic revision fencing; independent works have independent generations and materializations even when they share a base or edit the same path. Object insertion uses atomic content-addressed publication; no global writable Git index is shared. Broker Git tree-building uses private indexes or direct tree construction, with sanitized configuration. Per-repository fetch/object maintenance locks are brief and do not fence reads of already pinned objects or running validations.

## Failure and recovery

On missing/corrupt referenced bytes, fail integrity checks, recover the exact object from an authorized remote if possible, and otherwise block that work with the digest needed. Never substitute a newer file. On remote outage, pinned reads may continue with an explicit freshness limitation; current binding/new-work admission does not guess. Materialization is deterministic and disposable; restart can recreate it from the generation. Disk-full during generation construction preserves the previous row. Symlink/case/path collisions fail before writing a target.

## Alternatives

Shared worktrees are efficient Git conveniences but not the chosen trust boundary. Separate mutable worktrees alone still expose Git metadata and can couple process side effects. Whole-repository prompt delivery wastes context and prevents bounded inspection. Deployment-time scope manifests require an external bootstrap for ordinary tasks and are rejected. A custom version-control system duplicates Git trees and refs; the extra SHA-256 manifest is only an integrity/receipt representation, not a new mutable source authority. Automatic fuzzy patching hides stale context and is rejected.

## Acceptance

Compare every returned range to the exact Git blob. Test progressive completion, range/binary boundaries, limit exhaustion, authorization revocation, stale ref/epoch/token/cursor, same-path concurrent edits, file/directory collisions, mode changes and interrupted object publication. At capacity 8, write different bytes to the same path in eight works and prove no candidate or scratch mutation leaks. Rebuild a deleted scratch directory solely from its retained generation. An unknown-context source change must discover a previously unread allowed path without deployment or scope provisioning.

## Implementation consequences

Implement an immutable repository reader, canonical path/manifest codec, exact edit engine and private materializer. No task-specific source list is baked into a release. Keep provider binding and credential policy in D0005, work pointers in D0001, and canonical source transition in D0003.
