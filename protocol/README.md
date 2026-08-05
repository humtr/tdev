# Protocol v1 source boundary

`protocol/schemas/tdev.v1.schema.json` is the sole canonical external contract for protocol v1. It retains the M0 schema and pure-domain foundation and also contains the source-implemented M1 records, validation-proof contracts, and six mutation input roots. Generated files under `protocol/generated/` are reproducible derivatives:

```sh
npm run generate
npm run check:generated
```

The generator rejects trailing schema JSON, unresolved or external local `$ref` values, `$ref` and `oneOf` sibling semantics, unsupported schema-node keywords, types, or string formats, invalid patterns, and canonical objects with declared properties that do not set `additionalProperties: false`. The TypeScript and Go validators enforce the same executable subset before validating values for contracts implemented or consumed in both languages.

Generation is target-scoped through [`schemas/tdev.v1.targets.json`](schemas/tdev.v1.targets.json). Every entry root declares its role, selected languages, proof requirement, and concrete consumer or explicit compatibility exemption. The generator validates that manifest, computes the reachable local-`$ref` closure independently for TypeScript and Go, and fails closed on undeclared, missing, or dangling roots. TypeScript owns every Edge-consumed canonical root and all Worker/MCP projection metadata. Go output is required only for canonical wire roots consumed or persisted by the CLI or Agent. Existing broad Go output is temporarily retained by named exemptions until the first accepted CLI/Agent consumer inventory and compatibility diff; the exemptions are not consumer evidence.

## Release policy profile

M1 mutable non-secret limits and product-policy defaults have one canonical source at [`profiles/tdev.m1.release-profile.json`](profiles/tdev.m1.release-profile.json). [`profiles/README.md`](profiles/README.md) classifies release policy, immutable protocol invariants, deployment secrets, and test-only overrides. The generator emits validated TypeScript and Go views and a typed digest; production code consumes those views rather than repeating mutable literals.

The profile is release-pinned and startup-validated. Missing, unknown, duplicate, trailing, out-of-range, or digest-mismatched data fails closed. Deployment identities, MCP tokens, cursor signing keys, and Cloudflare bindings are not profile fields and never enter Git.

## Runtime and domain boundary

The foundation digests use these exact domains and omit only their own digest field:

```text
CaseTargetGrant  tdev.case-target-grant.v1 + NUL + JCS(grant without grantDigest)
CaseContract     tdev.case-contract.v1 + NUL + JCS(contract without contractDigest)
```

Validation rejects a well-shaped stored contract or grant whose digest does not match its canonical unsigned content. The TypeScript and Go runtime packages share fixtures for strict schema and semantic validation, canonical UTC timestamps, canonical JSON bytes, typed SHA-256 digests, Case/Task/Attempt transition matrices, request dedupe, completion evidence, and the one-nonterminal-Attempt invariant.

Protocol v1 JSON permits null, booleans, strings, arrays, objects, and safe integers. Fractional and out-of-range numeric values are rejected instead of being normalized differently by JavaScript and Go. Expanding the numeric domain requires a versioned schema and matching cross-language golden vectors.

`allowedSubpaths` contains explicit safe relative path prefixes. Empty strings, `.`, `..`, empty segments, backslashes, absolute paths, and implicit wildcards are not accepted. Operation working directories use the separate `target_root | subpath` union defined in `docs/OPERATIONS.md`. Relative-path validation here is syntactic; Unicode NFC normalization and live filesystem containment remain M3 Agent responsibilities with root identity, symlink/mount policy, and mutation-time re-observation.

The TypeScript and Go runtimes implement lossless raw JSON ingress scanning, fatal UTF-8, duplicate-member rejection before ordinary decode, exact safe-integer checking, `ValidationProofV1`, stable branch identity, and proof-consuming closed domain conversion authorized by [Design 0004](../docs/design/0004-casedo-storage-and-public-control-core.md). Generated Go `oneOf` declarations remain wire containers (`json.RawMessage`); they cannot enter domain state or storage without a proof bound to the exact root and canonical value.

The source-level CaseDO boundary at [`edge/case-do/`](../edge/case-do/) now verifies exact schema/migration identity, canonical rows, atomic admission/replay, control transitions, outstanding decisions, cancellation races, evidence-gated completion, bounded queries/cursors/rendering, and local file-backed close/reopen recovery. This is isolated source/storage evidence only.

## Next public-schema gate

The prose contracts define twelve public semantic inputs and results, but the executable schema currently contains only six mutation input roots. Before the Worker semantic boundary can derive MCP schemas or validate public outputs, it must add strict input roots for the six read/query capabilities and all twelve capability-specific result roots, declare their language targets, generate the deterministic capability mapping and public projection metadata in TypeScript, and pass TypeScript public-root fixtures. It must generate Go and pass shared parity fixtures only for roots consumed by the CLI or Agent.

The repository now contains a structural Cloudflare SQLite adapter and callback-transaction conformance tests, but it still does not claim live Cloudflare Durable Object persistence or hibernation, a Worker route, deployment, authenticated public MCP endpoint, current-client behavior, Agent dispatch, R2 byte ownership, installation, or runtime rollback.

## Test consolidation

Protocol and pure-domain behavior remains consolidated around shared fixture tables and transition matrices. Separate files are used only for genuinely independent generated, CaseDO storage, or future Worker runtime boundaries; test-file minimization never reduces behavioral coverage.
