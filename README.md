# dev-2 implementation

Start with AGENTS.md; it selects the current authority and WORKBOARD. This file is developer navigation only.

## Reproduce the implemented checks

Use the exact Node version in `.node-version`, Git version in `config/toolchain.lock.json`, and Python >=3.12. Install locked development dependencies in a separate preparation step:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node tools/validate.mjs --profile core --output .artifacts/core
npm run check
```

`npm run check` requests core AND integration. Missing/unimplemented mandatory layers return exit 2 and `not_run`, not a successful empty test suite. A focused module test can pass while a whole integration or release layer remains not run. Production eligibility is never granted by this developer CLI; the trusted broker runner owns that check.

No product module requires tmcp, Codex or a second model. Bootstrap use and execution environment are recorded under docs/evidence. A production toolchain seal is intentionally incomplete until a real authorized sandbox image/package is acquired and checked; no placeholder image is usable.

Internal checked interfaces live in `src/contracts/ports.d.ts`; P-lane boundaries and implementation priority are in WORKBOARD. `test/fixtures` adapters are test-only and cannot substantiate live-provider or OS-isolation claims.
