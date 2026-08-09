# Design 0011 — Real Git Projection and Fenced Publication

- Status: verified
- Class: 2
- Development identity: `mvp-1a-7` (same active development direction; this Design does not create a new `mvp-*` branch)
- Direct source predecessor: exact `mvp-1a-7@3048286a88c2687a2206cc3bcb4faab924be88d9`
- Semantic authority precursor: verified Design 0010 / `tdev.semantic.path-byte-radix.v1`

> Verified boundary: D0011 adds a real **local Git object/ref projection adapter** after semantic Promotion. Git blob/tree/commit OIDs and the publication ref are derived projection state. They do not replace the D0010 semantic root or transactional Case head as tdev authority.

## 1. Decision

`tdev` will add one local Git projection profile, `tdev.git.text-tree.v1`, and one fenced publication lane over an existing Git repository.

The adapter consumes a validated `SemanticRadixTree`, materializes its exact `path -> UTF-8 text` semantics for this first projection slice, writes immutable Git blobs/trees/commit objects with plumbing commands, and then elects the visible Git projection by one exact expected-predecessor `update-ref` operation.

D0011 intentionally separates three facts:

1. **semantic authority** — D0010 semantic root owned by `CaseEngine` / `SemanticCaseRepository`;
2. **Git candidate objects** — immutable derived blobs/tree/commit; object existence alone is not publication authority;
3. **Git publication ref** — the single externally visible local Git projection pointer, updated only by exact predecessor CAS.

No ordinary work Task may mutate an index, worktree, Git ref, or remote. Publication remains a separate post-Promotion effect lane.

## 2. Why Git remains derived

The tdev semantic contract is normalized relative path plus UTF-8 text content. Git identity additionally depends on repository object format, file mode, directory tree encoding, commit parent, author/committer identity, timestamp, and commit message.

Therefore two repositories may project the same semantic root to different Git OIDs without any semantic divergence. D0011 binds those projection inputs explicitly rather than redefining the semantic root as a Git OID.

The connected runtime directly verified Git 2.55.0 plumbing on a bare repository:

- `rev-parse --show-object-format` reports the repository object format;
- `hash-object -w --stdin` creates immutable blobs;
- `mktree` creates deterministic trees and produced the same tree from reversed entry input;
- `commit-tree` creates a commit under explicit metadata;
- `update-ref <ref> <new> <old>` rejects a stale expected predecessor;
- both SHA-1 and SHA-256 object-format repositories are supported by the observed Git binary.

These observations constrain the implementation but are not provider/remote evidence.

## 3. Repository profile

The D0011 repository profile is exactly:

```text
profile: tdev.git.text-tree.v1
repositoryPath: caller-selected existing local Git repository
objectFormat: observed from `git rev-parse --show-object-format`
publicationRef: full `refs/heads/...` name only
fileMode: 100644 for every semantic file
```

Supported object formats are `sha1` and `sha256`. The adapter validates OID length and lowercase hexadecimal shape from the observed format. An unsupported format fails closed before publication.

The publication ref contract is intentionally narrower than `git check-ref-format`: it must begin with `refs/heads/`, must pass Git's ref-format validation, and must not be a symbolic ref. This slice does not publish tags, notes, remote-tracking refs, pseudorefs, or arbitrary custom namespaces.

The adapter uses Git plumbing without an index or worktree. Tests use bare repositories to make accidental index/worktree dependency observable.

## 4. Tree projection

A D0010 `SemanticRadixTree` is required as input. The adapter validates its root descriptor and materializes the current semantic tree. This initial real-Git slice is correctness-first and may perform O(N) materialization; D0011 makes no sparse-Git-construction performance claim.

For each semantic entry:

- the path is already a normalized tdev relative path under the Case path policy;
- content is encoded as exact UTF-8 bytes;
- a Git blob is written with `hash-object -w --stdin`;
- the leaf mode is exactly `100644`;
- directories are represented only by Git tree objects;
- no executable bit, symlink, submodule, `.git` metadata entry, `.tdev` entry, attributes rewrite, line-ending conversion, or clean/smudge filter participates.

Tree objects are constructed bottom-up with `mktree`. The resulting root tree OID is a derived identity under the repository object format.

The adapter rechecks that the materialized entry count equals the semantic root `entryCount`. The semantic tree itself remains unchanged by projection.

## 5. Commit projection

A projection commit is built with `commit-tree` and has explicit caller-supplied deterministic metadata:

```text
authorName
authorEmail
timestampSeconds
timezoneOffset
message
```

The committer identity/time is identical to the author identity/time in this slice. Metadata strings are bounded and reject NUL, CR, or LF where Git identity syntax would become ambiguous. `timestampSeconds` is a non-negative safe integer. `timezoneOffset` is an explicit `+HHMM` or `-HHMM` value with a valid hour/minute range. `message` is bounded UTF-8 text and is normalized to one final LF before `commit-tree`.

If `expectedRefOid` is non-null, it must name an existing Git commit in the same repository and becomes the candidate commit's sole parent. If it is null, the candidate is a root commit.

The candidate record binds:

```text
projection profile
semantic root digest
repository object format
publication ref
expected predecessor OID or null
root tree OID
candidate commit OID
explicit commit metadata
```

and receives domain-separated candidate identity `tdev.git.projection-candidate.v1`.

## 6. Publication authority and fencing

Only the publication ref elects the visible Git projection. Blob/tree/commit object creation may happen before publication and may leave unreachable immutable objects after a race or failed publication; those objects are not authority.

Publication uses exactly one expected-predecessor CAS:

```text
expectedRefOid != null:
  git update-ref <ref> <candidateCommitOid> <expectedRefOid>

expectedRefOid == null:
  git update-ref <ref> <candidateCommitOid> <all-zero OID of repository format>
```

The adapter never uses force, fetch, merge, checkout, reset, index mutation, worktree mutation, push, or a remote ref operation.

Two independent publishers presenting the same predecessor may both create immutable candidates, but at most one can win the local ref CAS. A stale publisher never overwrites the winner.

## 7. Ambiguous outcome recovery

A failed/lost `update-ref` response is not interpreted as non-application. Publication always has a reconciliation path that rereads the durable ref and classifies exactly:

| Observed ref | Classification |
| --- | --- |
| candidate commit OID | `applied` |
| expected predecessor OID, or absent when predecessor was null | `not_applied` |
| any third OID | `conflict` |

The same classification is used after an injected post-update response-loss fault. The adapter does not blindly replay `update-ref` or rebuild a second candidate to resolve ambiguity.

A successful publication receipt binds the candidate identity, semantic root, object format, ref, predecessor, tree OID, commit OID, and whether success was observed directly or recovered by reread. Receipt identity uses domain `tdev.git.publication-receipt.v1`.

## 8. Rollback

Rollback is a new fenced ref mutation, not deletion of Git objects and not a semantic-state rollback.

If the publication predecessor was non-null, rollback attempts:

```text
git update-ref <ref> <predecessor> <candidate>
```

If the publication created the ref from absence, rollback attempts:

```text
git update-ref -d <ref> <candidate>
```

After an error or response-loss fault, the adapter rereads the ref:

- predecessor/absence => rollback applied;
- candidate => rollback not applied;
- third OID => conflict.

An intervening publisher therefore fences an old rollback. D0011 never deletes unreachable candidate objects as part of rollback.

## 9. Git process and trust boundary

Git commands are executed with argument arrays, never shell interpolation. The adapter disables replacement refs for object inspection and disables repository hooks for its plumbing commands. It does not source a user-provided shell command.

The repository path and Git executable are trusted local deployment inputs. D0011 does not authenticate the repository owner and does not protect against an attacker who can rewrite the entire repository/object database or replace the Git executable.

The adapter validates:

- repository existence and Git object format;
- exact publication-ref namespace and non-symbolic shape;
- OID format against repository object format;
- predecessor commit existence/type;
- semantic-root validity and exact materialization count;
- commit metadata bounds/syntax;
- candidate/receipt canonical shape before state-changing ref operations.

Remote authorization, branch protection, signed commits, signed refs, server-side hooks, remote races, transport security, and multi-host publication are outside D0011.

## 10. Git configuration boundary

D0011 does not use `.gitattributes`, autocrlf, filters, user identity, default branch, signing configuration, or worktree/index settings to derive candidate content. Blob bytes come directly from tdev semantic UTF-8 content and commit identity/time/message are explicit inputs.

Repository object format is intentionally observed because it is intrinsic to Git object identity. Git implementation version is operational evidence, not candidate identity.

The adapter passes an explicit disabled hooks path for its plumbing commands. It does not claim that arbitrary hostile repository configuration is safe; configuration that changes or blocks the underlying Git plumbing may cause a fail-closed adapter error.

## 11. API boundary

The intended source surface is one `GitProjectionAdapter` with operations equivalent to:

```text
inspect()
project({ semanticTree, expectedRefOid, commitMetadata })
publish(candidate)
reconcilePublication(candidate)
rollback(receiptOrCandidate)
```

`project` may write immutable Git objects but never the publication ref. `publish` is the only forward ref mutation. `rollback` is the only reverse ref mutation. `inspect` and reconciliation are read-only.

A low-level command runner/fault seam may be dependency-injected for deterministic tests, but it is not an alternate authority or publication path.

## 12. Acceptance matrix

D0011 is not `verified` until all rows below close.

| Area | Cheapest falsifier | Required result |
| --- | --- | --- |
| semantic binding | project then compare materialized semantic tree with Git tree/blob bytes | exact path/text equality and semantic root unchanged |
| mode/profile | inspect recursive Git tree | every semantic file exactly `100644`; no extra entries |
| deterministic projection | same semantic root, predecessor, metadata, format with permuted construction | identical tree and commit OIDs |
| object-format separation | project same semantic input into SHA-1 and SHA-256 repos | semantic root equal; Git OIDs use correct distinct formats |
| no index/worktree authority | execute complete flow in bare repo | success without index/worktree |
| exact ref CAS | two independent publishers from one predecessor | exactly one ref winner; stale writer cannot overwrite |
| create CAS | two publishers from absent ref | exactly one creator wins |
| pre-update failure | inject before ref update | predecessor/absence remains authoritative; `not_applied` |
| post-update response loss | update ref then inject lost response | reread classifies candidate as `applied`; no replay required |
| third-state recovery | move ref to unrelated third commit before reconciliation | deterministic `conflict` |
| restart/reopen | rebuild adapter after publish | same ref/candidate classification and Git bytes |
| rollback | rollback exact current candidate | predecessor/absence restored |
| stale rollback | intervening ref move before rollback | old rollback fenced; third ref preserved |
| ref safety | invalid namespace/name or symbolic publication ref | fail closed before mutation |
| predecessor type | expected OID is missing/non-commit | fail closed before candidate publication |
| metadata safety | newline/NUL identity, invalid timezone/timestamp, oversized message | fail closed |
| source regression | complete repository source gate | inherited v2/v3 semantics remain green |
| compatible POSIX | run real Git focused gate independently on Ubuntu/POSIX | all real-Git publication/recovery rows pass |

## 13. Non-goals

D0011 does not implement or claim:

- Git OID as tdev semantic authority;
- sparse/incremental Git tree construction or a Git performance SLO;
- remote fetch/push or remote ref CAS;
- GitHub/GitLab protected-branch semantics, authorization, reviews, status checks, or API receipts;
- signed commits/tags/refs;
- worktree application, merge, rebase, conflict resolution, index management, or user checkout;
- distributed/multi-host publication ownership;
- provider transaction coupling between the semantic Case head and Git ref;
- distributed Claim migration;
- deletion/GC of unreachable Git objects;
- hostile repository/object-store authenticity;
- changing existing v2/v3 migration, rollback, scrub, repair, or semantic GC contracts.

## 14. Rollout and rollback

D0011 is additive. Existing semantic-v3 Cases and repositories require no data migration. The Git adapter is invoked only when a caller explicitly supplies an existing Git repository, publication ref, semantic tree, expected predecessor, and commit metadata.

Code rollback before any publication only leaves unreachable immutable Git objects at most. Code rollback after publication leaves a normal Git commit/ref in the repository; reverting the ref requires the explicit fenced rollback operation or an operator action with equivalent exact-predecessor evidence. No semantic Case-head rollback is implied by Git rollback.

Because `mvp-1a-7` remains the same development direction, accepted and verified D0011 commits fast-forward that same branch. D0011 completion is not permission to create `mvp-1a-8`.

## 15. Completion boundary

Verification may conclude only that a real **local** Git repository can receive an exact tdev semantic projection and elect/rollback one local branch ref through expected-predecessor fencing with explicit ambiguous-outcome recovery.

The next provider-facing gate, if still desired after D0011, must separately design and prove authenticated remote publication/protected-branch behavior and its ownership/receipt/reconciliation contract. D0011 evidence cannot be promoted into that claim.

## 16. Verification record

D0011 became `verified` on 2026-08-10 without changing the active development-direction branch. The independently validated source candidate is `c321e9079855c87b9df806930b2cd48c61244e9b`; accepted design, implementation, evidence, owner alignment, and verification continue to fast-forward `mvp-1a-7` because no development-direction change was authorized.

Independent Ubuntu/POSIX GitHub Actions run `31325628829`, job `93275404092`, used Ubuntu 24.04.4 LTS, Node `v22.23.1`, and Git `2.54.0`. It passed the complete source gate with **191/191 tests**, **92.80% line / 82.37% branch / 96.34% function coverage**, **13/13 focused D0011 real-Git tests**, SHA-1 and SHA-256 bare-repository capability checks, and the effective diff gate.

Checked evidence is `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json`, SHA-256 `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`. The connected tmcp/Termux runtime independently passes the D0011 focused 13/13 real-Git gate, but its inherited complete source suite is not counted as green because the existing `ImmutableJournalSnapshotStore` hard-link publication primitive still fails with `EACCES` in that job-private filesystem.

The verified rows include exact semantic path/text projection, `100644` mode, deterministic candidate identity, SHA-1/SHA-256 representation separation, bare-repository operation without index/worktree authority, create/update expected-predecessor CAS, pre/post-update ambiguity recovery, restart reconciliation, fenced rollback and stale-rollback rejection, ref/predecessor/metadata safety, read-only reconciliation, recomputed-digest tamper rejection, inherited `GIT_*` routing suppression, and disabled reference-transaction hooks.

This verification closes only the declared local source boundary. It does not authorize a new `mvp-*` branch and does not verify remote fetch/push or remote ref CAS, GitHub/GitLab authorization or protected-branch semantics, signed commits/refs, distributed publication ownership, provider transaction coupling, Git-object GC, or hostile repository authenticity. Git OIDs remain derived projection identities rather than tdev semantic authority.
