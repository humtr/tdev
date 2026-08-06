# tdev

`tdev` is a parallel-first work-graph execution prototype. The current MVP closes one complete loop:

```text
immutable plan -> readiness -> resource admission -> isolated execution
-> deterministic promotion -> canonical tree
```

A single executor is the same model with `capacity = 1`; it is not a compatibility mode.

## Run

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
```

The current branch is a source-only MVP. Cloudflare, Durable Objects, D1, R2, public MCP, Termux Agent delivery, and remote publication are explicit later layers and are not claimed by this implementation.
