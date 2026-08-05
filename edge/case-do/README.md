# CaseDO SQLite core

This directory owns the source-level M1 CaseDO storage boundary.

- `sql.ts` owns bounded synchronous SQL primitives and the non-nested callback-owned `SqlStore.transactionSync` contract.
- `cloudflare-sqlite.ts` structurally adapts Durable Object storage, eagerly consumes SQL cursors, and owns no product lifecycle state.
- `schema.ts` owns the exact schema-version-1 DDL, logical migration byte domain, atomic empty-to-v1 callback, immutable/current-row guards, and reopen verification.
- `records.ts` owns canonical JSON byte, digest, schema-proof, and stored-row validation.
- `admission.ts` owns the deterministic new-Case route function and the exact internally generated submit result/replay shape.
- `repository.ts` owns atomic new-Case admission and receipt replay inside the outer `SqlStore` transaction; it never executes transaction-control SQL.
- `internal-records.ts` owns strict internal checkpoint, approval/input/retry, and evidence row shapes shared by control and query code.
- `control.ts` owns atomic Case, Task, and Attempt control transitions, immutable decisions, checkpoints, evidence materialization, original-response receipts, replay/conflict handling, and response-loss recovery.
- `cursor.ts` owns canonical HMAC-bound cursor-v1 creation and verification with current/previous key-generation rotation.
- `query.ts` owns bounded `get_case`, `get_task`, stable resource pagination, and UTF-8-safe `render_task` continuation.
- `node-sqlite.test-support.ts` is test-only and owns Node-specific transaction statements. Production code must not import `node:sqlite`.
- `sql-store.test.ts` verifies Node rollback/nesting and structural Cloudflare callback/cursor behavior; it is not live platform evidence.

Production modules do not own public capability decoding, Worker routing, authentication, deployment, Agent dispatch, or R2 bytes. A successful local SQLite close/reopen or structural adapter test proves source behavior only; it does not prove live Cloudflare Durable Object transactions, hibernation, deployment, public MCP, current-client, or rollback behavior.
