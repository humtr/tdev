# Design 0007 — verified immutable-journal materialization reuse

- Status: verified
- Class: 2
- Target development identity: `mvp-1a-4`
- Direct code parent: `mvp-1a-3` / `52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Evidence input: Design 0006 phase-zero persistence measurements and isolated V research
- Affected owners: `LINEAGE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`, `WORKBOARD.md`, `docs/history/implementation-report.md`

## 1. One-line definition

Keep D0005 durable authority and no-replace publication unchanged, but allow an instance-local materialized snapshot to replace strict replay only after every currently retained authoritative filename, length, and byte exactly matches a fingerprint produced by prior strict validation or by a successfully durable local commit from such a verified predecessor.

## 2. Evidence and decision

Phase-zero reproduced the 32-task / 4 KiB gap on Node 22.16.0/Linux x64: File about 0.94 s p50, verified Journal about 1.21 s p50, and D0005 Immutable about 3.55 s p50 across three rotated-order repeats. Immutable and Journal fresh-instance final loads remained close at about 99 ms and 97 ms.

At 32 tasks the immutable final history retained 67 authoritative files / 66 deltas. Reading all retained bytes took about 5 ms p50 and exact ordered SHA-256 fingerprinting about 0.26 ms p50, while strict replay took about 133 ms p50. Exact prefix accounting grew from about 0.017 GiB cumulative replay byte-work at 16 tasks to about 0.134 GiB at 32 tasks, approximately 8x when task count doubled in that workload.

Therefore full retained-byte observation is not the dominant measured cost. Repeated strict replay/prefix snapshot validation is the first acceleration target.

## 3. Authority and state

Durable authority remains:

```text
base.json + all reachable retained committed journal records + strict replay
```

New performance-only state is:

```text
instance-local materialized cache = { exactFilesFingerprint, strictly validated snapshot }
```

The cache is disposable, absent from durable schema, cannot elect a CAS winner, and can be dropped without changing a legal result. It is never consulted until the committed namespace has been strictly listed and every currently retained authoritative file byte has been reread.

## 4. Read algorithm

Each load/non-create CAS:

1. strictly list the D0005 committed namespace, rejecting malformed committed-looking names and recognized non-regular authority slots;
2. reread `base.json` and every retained committed record byte;
3. hash the exact ordered tuple of filename, byte length, and raw bytes;
4. if the fingerprint equals a cache entry known to represent strict validation of those exact bytes, clone the cached materialization;
5. otherwise perform complete D0005 canonical parse, record validation, fork/gap/order checks, source/target digest validation, replay, materialized-size validation, then replace the cache.

A byte, name, length, file-type, or committed-namespace change cannot hit the cache.

## 5. Successful local publication

After the final no-replace slot link and required directory sync succeed, the store may cache the already validated candidate using the predecessor files just reread plus the exact canonical bytes that were durably published. This avoids a redundant replay on the next operation.

Do not update the cache after final-slot conflict, any pre-publication failure, or `store_commit_ambiguous`. Those outcomes require re-observation/reconciliation.

## 6. Failure and corruption behavior

All D0005 fail-closed conditions remain. Post-warm historical mutation changes the exact-byte fingerprint and forces strict replay. Malformed/non-regular/new committed-looking entries are rejected before reuse. Whole-history hostile rewrite with recomputed self-digests remains outside the D0005 trust model.

Literal physical-medium integrity is not claimed: the store validates bytes returned through the filesystem interface.

## 7. Compatibility, migration, rollback

- Durable format: unchanged.
- Publication slots and hard-link no-replace protocol: unchanged.
- Legacy-prefix -> immutable-v2 cutover: unchanged.
- No checkpoint, durable head, compaction, GC, or history deletion.
- Rolling back only this source optimization is data-compatible because its durable bytes are D0005 bytes.
- The pre-existing D0005 downgrade barrier to unmodified pre-v2 journal code remains.

## 8. Acceptance matrix

| Area | Cheapest falsifier |
| --- | --- |
| inherited D0005 semantics | all existing immutable-journal tests green |
| warm historical corruption | warm instance then mutate old retained record -> next load/CAS fails closed |
| warm namespace corruption | warm instance then add malformed committed-looking name -> fail closed before reuse |
| warm file-type corruption | warm instance then replace recognized authority slot with non-regular entry -> fail closed before reuse |
| restart/cache loss | fresh instance strictly replays to identical digest |
| same/cross-process CAS | inherited one-winner tests remain green |
| ambiguous commit | no cache promotion on ambiguous publication path |
| performance | 32-task / 4 KiB workload improves >=2x vs D0005 Immutable or reaches <=1.25x Journal p50; experiment target only, not SLO |
| source gate | repository minimum source gate remains green |

## 9. Rejected alternatives

- **Skip retained-byte reread on warm cache:** rejected because historical mutation would become observationally invisible without another trusted integrity substrate.
- **Durable checkpoint/head:** rejected because it changes authority, anti-rollback, migration, and rollback requirements.
- **Merkle root while still rereading every byte:** rejected as unnecessary complexity; an ordered domain-separated whole-history fingerprint is sufficient for equality of the bytes already reread.
- **Transactional head/history replacement in this design:** rejected as a separate authority/migration experiment.

## 10. Non-goals

Provider/distributed CAS, hostile-storage authentication, history GC, compaction, trusted checkpoint roots, deployment, and changing the D0005 publication primitive.

## 11. Verification closure

Source/container closure is verified for this freeze: 20/20 focused immutable-journal tests and 130/130 complete source tests passed; coverage completed at 91.84% lines / 81.82% branches / 96.19% functions; `git diff --check` passed; the 32-task / 4 KiB / capacity-8 promotion benchmark measured D0005 Immutable at 3397.535 ms p50 and D0007 Immutable at 1007.262 ms p50 (3.373x) with the same 277,023 retained bytes and fresh-instance load remaining about 97 ms; a clean exported archive extraction reinstalled and passed `npm run check`. Structured evidence is retained in `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json`. Remote publication/ancestry is a separate final completion layer and must be independently observed after push.
