# CaseDO SQLite core

This directory owns the source-level M1 CaseDO storage boundary.

- `sql.ts` is the minimal synchronous SQL interface that both a Cloudflare Durable Object adapter and deterministic local tests can implement.
- `schema.ts` owns the exact schema-version-1 DDL, migration identity, atomic empty-to-v1 migration, immutable/current-row guards, and reopen verification.
- `records.ts` owns canonical JSON byte, digest, schema-proof, and stored-row validation.
- `admission.ts` owns the deterministic new-Case route function and the exact internally generated submit result/replay shape.
- `repository.ts` owns narrow SQLite transaction primitives, including atomic new-Case admission and receipt replay.
- `internal-records.ts` owns strict internal checkpoint, approval/input/retry, and evidence row shapes shared by control and query code.
- `control.ts` owns atomic Case, Task, and Attempt control transitions, immutable decisions, checkpoints, evidence materialization, original-response receipts, replay/conflict handling, and response-loss recovery.
- `cursor.ts` owns canonical HMAC-bound cursor-v1 creation and verification with current/previous key-generation rotation.
- `query.ts` owns bounded `get_case`, `get_task`, stable resource pagination, and UTF-8-safe `render_task` continuation.
- `node-sqlite.test-support.ts` is test-only. Production code must not import `node:sqlite`.

Production modules do not own public capability decoding, Worker routing, authentication, deployment, Agent dispatch, or R2 bytes. A successful local SQLite close/reopen test proves source behavior across repository instances only; it does not prove Cloudflare Durable Object transactions, hibernation, deployment, public MCP, current-client, or rollback behavior.
