# MVP

## Current slice

The first slice is a local parallel-first reference loop with an immutable plan, DAG readiness, resource admission, concurrent isolated execution, deterministic Promotion, snapshot reopen, and an observable CLI demo.

## Acceptance matrix

- sibling Tasks can be simultaneously nonterminal with capacity greater than one
- capacity one and capacity N produce the same canonical digest
- dependencies gate readiness
- one Task has at most one running Attempt
- read/read and disjoint writes may run together
- overlapping read/write or write/write claims serialize
- identical duplicate result acceptance is idempotent
- stale result after cancellation is rejected
- interrupted snapshot reopen preserves evidence and permits a fresh result-only Attempt
- ordinary Tasks cannot claim canonical mutation
- exact base digest is required
- ChangeSet path traversal is rejected
- deterministic Promotion is independent of completion and input order
- conflicting Promotion preserves the previous canonical tree
- no wall-clock value participates in semantic digests

## Verification

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
git diff --check
```

Tests prove only the pure source loop and demo behavior. They do not prove Cloudflare, durable persistence, GitHub publication by the product, Termux execution, MCP, migration, or rollback.
