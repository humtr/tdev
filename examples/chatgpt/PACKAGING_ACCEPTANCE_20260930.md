# Refreshed ChatGPT packaging acceptance — 2026-09-30

Scope: installed packaging/lifecycle requalification through the actual refreshed 0.1.22 ChatGPT tool surface. This is not the whole development/reconnect journey and does not repeat the older data-sentinel measurement.

Provenance: retained ChatGPT documentation task `152c039f710c466a83a72933b81b63f8`,
checkpoint `565be4bfefbaa1d3623020cc40d966b84432df9c`. The takeover independently read back
terminal validation/recovery receipts, removed deployment revision and pruned archive identity.
It did not repeat those effects or independently measure the host/UI timeline.

## Baseline

- Resident: 0.1.22, bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`.
- Disposable enrolled project: `p-db2cad4ec9177b4edb395216`, checkout HEAD `9a335d2604fc2191c63f8d158a53da228cf155c7`.
- Prior deployment `767660ec696b2124e244f5e500952f8e` was already removed.
- Initial retained artifact usage: zero.

## Service package

- Task `df48138d4e6240fb8f58804952302402`; reviewed historical fixture delta integrated from the identical base, conflict count zero.
- Source validation `476f9b583e64410ab1eeea8cb2848b41` succeeded.
- Artifact `c7280fe6a9df4a5ba8af44a72a2d6103`, digest `de01f132bd1a5ac6f8d86336d02fa9b9cb029a3398aeae88280228f547ce1a84`.
- Artifact validation `ae2e4d7dc59b483988f8c8bd9e125e4d` succeeded with HTTP health on its validation port.
- Deployment `f70af0ef214fc553722ce3fdf8b3ea6b`, service `pkg-0122-host-0930`.
- Create `expectedRevision:0` → revision 1, release `a73747e463c982300156ebb2d5dd4e1e8f1ca97d257699f959df03d33766bf45`, HTTP 200.
- Source/build/artifact-validation scratch retired and task dependency environment reset; revision 1 remained HTTP 200.
- Retained export `dist/asset.json`: 32 bytes, SHA-256 `0ca9e98414b209833559f1c01bd92e29cc05a4ec2a69e1d2651244e33e3d8c78`.
- Updated artifact `46f30864143a4f599cb11c15a63dd03d`; release with `expectedRevision:1` → revision 2, release `f45071e4ae65f968fd50376a30bcd7d96833ca888ec53b7226ea46986b937140`, HTTP 200.
- Rollback with `expectedRevision:2` → revision 3 and restored release `a73747e...`, HTTP 200, with no rebuild.
- Intentional bad artifact `2f831b3a3b80423dabe0405b810a9ceb` passed separate-port artifact validation `f6d49314366a45a58fec8d9b94a613c3` but failed at the deployment port.
- Original failed release operation `730a89f706e94c25ab6b070076de0782` first returned `DEPLOYMENT_RECOVERY_REQUIRED` / unknown. It was not retried. Status on that same identity reconciled to failed + committed, `DEPLOYMENT_INTERRUPTED`, `rolledBack:true`; deployment inspect independently showed revision 3 still healthy on the previous release.
- Stop revision 3 → 4; start revision 4 → 5 and HTTP 200; remove revision 5 → 6 and no running process.
- All new validation/build scratch retired; environment reset; task closed; managed ref cleaned.
- Three service artifacts were each pruned only after `canPrune:true`, empty pins and exact `previewToken`; retained usage returned to zero.

The 2026-09-27 installed acceptance remains the evidence that an app-data sentinel survives stop/start/remove. This run did not recreate that sentinel.

## Non-service archive

- Task `5193628ef9b54e48b0b2804106090385`, fixture integration conflict count zero.
- Source validation `7796c59179e640aebd236184ac50ef39`.
- Artifact `b4c6e87b2eb1496181f4236fcd30eb50`, digest `5cb18fc1240fa78211be7ad26e0337205cbb3a3abd1c35ae7a59ed12d07f22c5`.
- Artifact validation `133336c54d2d4a1f857c58515c762b73` succeeded without a service health port.
- `dist/hello.zip`: 145 bytes, SHA-256 `9eb80fac27052ec4a6bcb0fc6ed7542e200bbcd1be8de520cc4c4be59233eb85`.
- Bounded export pages: 0→64, 64→128, 128→145/eof; each response reported the same full-file digest.
- Scratch retired, environment reset, task/ref cleaned, artifact previewed/pruned. Final retained artifact usage: zero.

No credentials, tokens or private config values are recorded here. Historical unrelated deployments, receipts, diagnostics and user data were not cleaned up.
