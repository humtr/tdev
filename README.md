# dev-2 implementation

Start with AGENTS.md; it selects the current authority and WORKBOARD. This file is developer navigation only.

## Reproduce the implemented checks

Use an exact execution variant in `config/toolchain.lock.json`: native Termux/Android arm64 Node 24.18.0 or the checksum-pinned Linux CI Node 24.21.0, with the matching SQLite version. `.node-version` selects the Linux CI variant, not a universal production-host requirement. Git is pinned in the same lock and Python must be >=3.12. Install locked development dependencies in a separate preparation step:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node tools/validate.mjs --profile core --output .artifacts/core
npm run check
```

`npm run check` requests core AND integration. Missing/unimplemented mandatory layers return exit 2 and `not_run`, not a successful empty test suite. A focused module test can pass while a whole integration or release layer remains not run. Production eligibility is never granted by this developer CLI; the trusted broker runner owns that check.

No product module requires tmcp, Codex or a second model. Bootstrap use and execution environment are recorded under docs/evidence. A production toolchain seal is intentionally incomplete until a real authorized sandbox image/package is acquired and checked; no placeholder image is usable.

Internal checked interfaces live in `src/contracts/ports.d.ts`; P-lane boundaries and implementation priority are in WORKBOARD. `test/fixtures` adapters are test-only and cannot substantiate live-provider or OS-isolation claims.

## Actual first-release placement

Termux/Android is the control/state runtime; the public origin must be workers.dev.
The selected managed execution boundary and its explicit costs are in D0005/D0006.
No VPS, systemd or local Podman installation is required or assumed on the device.
The Podman adapter is for a separately sealed managed execution environment only;
fixed local command execution is not permission to run untrusted candidate scripts.
No canonical dev-2 endpoint or deployment is currently established by these modules.
