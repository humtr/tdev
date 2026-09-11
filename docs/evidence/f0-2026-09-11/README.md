# F0 implementation evidence - 2026-09-11

Observation, not product authority. Started from fresh remote dev-2 `a1265adcab2d95b39759f60419fd77d407d1dbdb`, parent `fd38a4f72f3cdaf80e35c706f20c7efaf7cbbfe1`, tree `e99145c3609f330d0743dccb92e11a1a705b0420`; only root `9a42b05d403370b7b4a698b4d7440d58aa4a79b5`. AGENTS, Directive, Rule, WORKBOARD and all seven selected Designs were read at that exact snapshot before implementation.

## Actual implementation and proof boundary

F0 adds the canonical JSON/identity/error/envelope implementation, checked internal port interfaces, deterministic fixture adapters, pinned toolchain and dependency manifests, and the single profile dispatcher. Contract tests include UTF-16 key order versus JavaScript numeric-key enumeration, duplicate escaped JSON keys, numeric underflow/rounding rejection, uint64 overflow, capacity 1/8/16/32+, and explicit non-success for unimplemented validation layers.

`core.json` and `core.tap` are the final implemented-profile results. `integration.json` is deliberately not_run. These are developer execution observations, NOT a signed broker receipt, complete product integration proof, production isolation proof or superiority result. No benchmark or ChatGPT-native dev-2 call is claimed.

## Environment and bootstrap exception

The authorized project-local host provides Git 2.55.0 and Python 3.14.6 but native Node is 24.18.0/Android. The official Node 24.21.0 Linux arm64 archive was downloaded, checked against its published SHA-256 and run without binary modification through a project-local PRoot library mapping. Its executed binary hash is in core.json. Node 24.21.0, npm 11.19.0 and locked dependencies were actually used for final preparation and checks. PRoot is only a bootstrap compatibility aid, NOT the D0005 sandbox or a product dependency. No system package/runtime was replaced. No Podman/systemd release environment was available; production seals remain explicitly incomplete.

GitHub reads and tmcp project-local shell were used because dev-2 had no product implementation or usable MCP path. The ChatGPT container also failed GitHub DNS and did not contain the pinned toolchain. No predecessor deployment, source branch or external durable state was mutated. This exception ends per capability as the dev-2 MCP becomes usable.

## Falsifiers and corrections

Initial source checking exposed ES2024 string APIs missing from the typecheck target and an inferred-array annotation error; both were corrected without disabling strict checking. The installed TypeScript shebang assumed /usr/bin/env, so the canonical invocation uses the pinned Node executable directly. Duplicate-aware numeric parsing additionally rejects fractional input that JavaScript would silently round to an integer.

The documentation checker initially walked installed Node's README under .bootstrap and failed on upstream-relative links. Its traversal now prunes generated/dependency directories while preserving all other repository Markdown checks. This is a checker-scope correction, not reduced product validation. No accepted architectural Design or benchmark target needed changing at F0.

## Reproduction

Use README.md and config/toolchain.lock.json. Run locked dependency preparation, then `node tools/validate.mjs --profile core --output .artifacts/core`. `npm run check` requests both core and integration and must return 2 at this F0 boundary. The raw result identifies exact input, profile, runner, dependency-lock and executed Node hashes. Resume P1-P8 from the current published snapshot; do not replay F0 from chat identifiers.
