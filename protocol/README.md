# M0 protocol foundation

`protocol/schemas/tdev.v1.schema.json` is the sole canonical external contract for M0. The generated files under `protocol/generated/` are reproducible derivatives:

```sh
npm run generate
npm run check:generated
```

The generator rejects trailing schema JSON, unresolved or external local `$ref` values, `$ref` and `oneOf` sibling semantics, unsupported schema-node keywords, types, or string formats, invalid patterns, and canonical objects with declared properties that do not set `additionalProperties: false`. The TypeScript and Go validators enforce the same executable subset before validating values.

## Runtime boundary

Stored M0 digests use these exact domains and omit only their own digest field:

```text
CaseTargetGrant  tdev.case-target-grant.v1 + NUL + JCS(grant without grantDigest)
CaseContract     tdev.case-contract.v1 + NUL + JCS(contract without contractDigest)
```

Validation rejects a well-shaped stored contract or grant whose digest does not match its canonical unsigned content.

The TypeScript and Go runtime packages implement the same checked-in fixtures for:

- strict schema and semantic validation;
- calendar-valid UTC timestamps with optional one-to-nine-digit fractions and an uppercase `Z` suffix;
- CaseContract and CaseTargetGrant validation;
- canonical JSON bytes;
- typed SHA-256 digests using `domain + NUL + canonical JSON`;
- Case, Task, and Attempt transition matrices;
- request dedupe, completion evidence, and the one-nonterminal-Attempt invariant.

M0 protocol JSON permits null, booleans, strings, arrays, objects, and safe integers. Fractional and out-of-range numeric values are rejected instead of being normalized differently by JavaScript and Go. Expanding the numeric domain requires a versioned schema and matching cross-language golden vectors.

`allowedSubpaths` contains explicit safe relative path prefixes. Empty strings, `.`, `..`, empty segments, backslashes, absolute paths, and implicit wildcards are not accepted. Operation working directories use the separate `target_root | subpath` union defined in `docs/OPERATIONS.md`.

M0 relative-path validation is syntactic and does not claim Unicode NFC normalization or live filesystem containment. Those checks belong to the M3 Agent path boundary together with root identity, symlink and mount policy, and mutation-time re-observation.

The Go M0 raw JSON helper and schema generator reject invalid UTF-8 before ordinary decoding. Parsed-value validators still cannot prove that a raw ingress document was free of duplicate object member names. The M1 public-control decoder in each runtime must perform fatal UTF-8 decoding and reject duplicate names before schema validation, canonicalization, or digest comparison.

Generated Go `oneOf` declarations currently use `json.RawMessage` as a wire representation. They are untrusted until canonical schema validation and a domain-specific discriminator succeed; M1 storage must not persist them as trusted state merely because JSON unmarshalling succeeded.

## Test consolidation

M0 uses four test files: one protocol/fixture file and one state/invariant file per language. New cases extend the existing fixtures or transition tables. A new file is justified only by a separate runtime boundary, not by a new row in an existing contract.
