# M1 release profile

`protocol/profiles/tdev.m1.release-profile.json` is the canonical, non-secret, release-pinned value source for M1 product-policy and bounded-runtime settings. [docs/PROTOCOL.md](../../docs/PROTOCOL.md) remains the normative semantic owner; this directory maps those contracts into one validated implementation input and does not create a second product owner.

The generator validates this file losslessly, rejects unknown, duplicate, missing, trailing, or out-of-range data, computes the typed digest `tdev.release-profile.v1`, and generates:

- `protocol/runtime/typescript/profile.generated.ts`;
- `protocol/runtime/go/profile_generated.go`.

TypeScript and Go load only the generated immutable view, validate it at startup, and fail closed before request service. M1 does not hot-reload this profile. A release manifest pins `profileId`, `profileVersion`, and profile digest.

## Classification

| Category | Examples | Change rule |
| --- | --- | --- |
| immutable or versioned protocol invariant | safe-integer range, canonicalization and digest domains, HMAC-SHA256 for cursor v1, state/error meanings, transaction atomicity, terminal immutability, authentication and non-enumeration | accepted design plus protocol/profile/schema or migration version change; never an environment toggle |
| release product policy | request/parser bounds, output bounds, page sizes, cursor TTL, Case/Task/Event quotas, orphan grace period | edit the canonical JSON within hard compatibility ceilings, update owning contracts, regenerate, validate, publish a new release |
| deployment configuration or secret | deployment identity, bearer tokens, cursor HMAC key generations, Cloudflare resource bindings | deployment owner injects and validates it; never committed, logged, copied into canonical input, Events, fixtures, or reports |
| test-only override | deliberately narrowed limits and forged invalid profiles | construct only in tests through explicit test APIs; no production loader or environment override |

A mutable product policy may narrow behavior only within its versioned hard ceiling. Raising a hard ceiling, changing a fixed enum, changing compatibility meaning, or weakening a security invariant requires a versioned design change. Unknown Cloudflare storage-byte limits remain evidence-gated deployment constraints and are not invented here.

## M1 defaults and hard ceilings

| Setting | Default | Minimum | Hard ceiling | Reload |
| --- | ---: | ---: | ---: | --- |
| `ingress.maxBodyBytes` | 1,048,576 | 1 | 4,194,304 | new release/startup |
| `ingress.maxJsonDepth` | 64 | 1 | 128 | new release/startup |
| `ingress.maxJsonTokens` | 100,000 | 1 | 500,000 | new release/startup |
| `ingress.maxObjectMembers` | 4,096 | 1 | 16,384 | new release/startup |
| `ingress.maxArrayItems` | 10,000 | 1 | 100,000 | new release/startup |
| `ingress.maxStringCodePoints` | 262,144 | 1 | 1,048,576 | new release/startup |
| `ingress.maxNumberDigits` | 1,024 | 1 | 4,096 | new release/startup |
| `ingress.maxExponentMagnitude` | 10,000 | 1 | 10,000 | new release/startup |
| `output.maxMutationResponseBytes` | 262,144 | 1 | 1,048,576 | new release/startup |
| `output.maxRenderedTextBytes` | 65,536 | 1 | 262,144 | new release/startup |
| `output.maxArtifactChunkBytes` | 262,144 | 1 | 1,048,576 | new release/startup |
| `pagination.defaultPageSize` | 20 | 1 | selected `maxPageSize` | new release/startup |
| `pagination.maxPageSize` | 100 | 1 | 500 | new release/startup |
| `pagination.cursorTtlSeconds` | 3,600 | 60 | 86,400 | new release/startup |
| `quota.maxTasksPerCase` | 10,000 | 1 | 100,000 | new release/startup |
| `quota.maxAttemptsPerTask` | 100 | 1 | 1,000 | new release/startup |
| `quota.maxEventsPerCase` | 100,000 | 1 | 1,000,000 | new release/startup |
| `retention.r2OrphanGraceDays` | 30 | 1 | 3,650 | new release/startup |

M1 fixes `eventCompaction = disabled`, `mutationReceiptRetention = case_or_recovery`, and `referencedEvidenceCleanup = forbidden`. Those values are encoded in the profile for release identity and drift detection, but changing them is not an ordinary value edit; it requires a versioned retention design.

## Change procedure

1. Update the normative owner when semantics, compatibility, security, migration, or evidence changes.
2. Edit only `tdev.m1.release-profile.json` for an ordinary within-ceiling value change.
3. Run `npm run generate` and review both generated language views and the digest.
4. Run `npm run check:generated`, `npm test`, `go test ./...`, `go vet ./...`, and the complete diff gate.
5. Pin the exact profile identity and digest in the release manifest before deployment.

Business logic must consume the validated profile view rather than repeating these mutable defaults as local literals.
