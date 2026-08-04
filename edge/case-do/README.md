# CaseDO SQLite core

This directory owns the source-level M1 CaseDO storage boundary.

- `sql.ts` is the minimal synchronous SQL interface that both a Cloudflare Durable Object adapter and deterministic local tests can implement.
- `schema.ts` owns the exact schema-version-1 DDL, migration identity, atomic empty-to-v1 migration, immutable/current-row guards, and reopen verification.
- `records.ts` owns canonical JSON byte, digest, schema-proof, and stored-row validation.
- `admission.ts` owns the deterministic new-Case route function and the exact internally generated submit result/replay shape.
- `repository.ts` owns narrow SQLite transaction primitives, including atomic new-Case admission and receipt replay. It does not own public capability decoding, Worker routing, authentication, deployment, or Agent dispatch.
- `node-sqlite.test-support.ts` is test-only. Production code must not import `node:sqlite`.

A successful local SQLite test proves repository source behavior only. It does not prove Cloudflare Durable Object transaction, hibernation, deployment, public MCP, current-client, or rollback behavior.
