# dev-2

Start with `AGENTS.md`. It selects the current authority chain and `WORKBOARD.md`; this file is developer navigation only.

## Current product and development path

The canonical public origin is `https://tdev.humtr.workers.dev`, with MCP at `/mcp`. Termux/Android is the control and durable-state runtime; the device connects outbound to the workers.dev edge. Candidate execution remains isolated in the selected managed execution environment rather than sharing the Android credential boundary.

Normal forward development uses the canonical ChatGPT -> dev-2 lifecycle:

1. discover current repository/context and read bounded source;
2. create a Work and isolated candidate generation;
3. run configured execution and complete required validation;
4. integrate the exact eligible result and observe/recover its durable outcome;
5. adopt policy when applicable; and
6. stage and activate a release when the product change requires deployment.

`tmcp`, direct GitHub mutation, Codex, and a second model are not ordinary forward-development dependencies. D0006 keeps explicit rollback and fixed helper/operator controls private; they are not reclassified as public MCP operations.

Mutable repository, release, device, edge, session, and provider identities must be rebound with the current development context/observation path rather than copied from documentation. `WORKBOARD.md` owns the current execution frontier and records bounded observations.

## Reproduce implemented checks

Use an exact execution variant in `config/toolchain.lock.json`: native Termux/Android arm64 Node 24.18.0 or the checksum-pinned Linux CI Node 24.21.0, with the matching SQLite version. `.node-version` selects the Linux CI variant, not a universal production-host requirement. Git is pinned in the same lock and Python must be >=3.12. Install locked development dependencies in a separate preparation step:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node tools/validate.mjs --profile core --output .artifacts/core
npm run check
```

`npm run check` requests core and integration. Missing mandatory layers return failure rather than an empty successful suite. These commands are developer reproduction aids; production eligibility is owned by the installed trusted validation path.

## Documentation ownership

`DIRECTIVE.md` owns product requirements. `RULE.md` owns repository governance. Accepted files under `docs/design/` own bounded decisions. `WORKBOARD.md` owns current execution status. `docs/evidence/` owns retained observations and provenance, not current truth. `docs/research/` is non-normative unless an accepted Design explicitly adopts a result. Git history owns historical source state.
