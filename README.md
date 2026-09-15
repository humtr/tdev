# tdev

Start with `AGENTS.md`. It is the repository bootstrap/navigation entrypoint and selects the current authority, WORKBOARD routing, active campaign, and relevant Designs. This README owns no product requirement, architecture, or current-state truth.

The current development ref is `dev-2`; the final product line is intended to converge to `main` under `DIRECTIVE.md`.

## Local check reproduction

Use the repository-selected toolchain and locked dependencies. For a local reproduction of implemented checks:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

These commands are developer reproduction aids. Production validation eligibility and execution identity are owned by the current validation/runtime contracts, not by this README.

## Navigation

- `DIRECTIVE.md` — user objectives and completion requirements.
- `RULE.md` — stable engineering/change rules.
- `WORKBOARD.md` — current execution position and routing.
- `docs/design/` — bounded current Design owners and generated navigation index.
- `docs/campaign/` — non-authoritative campaign route map and active/pending execution plans.
- `docs/evidence/` — retained observations/provenance only.

Mutable repository, runtime, release, provider, session, and benchmark facts must be freshly observed rather than copied from README or historical documents.
