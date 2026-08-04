# M0 protocol foundation

`protocol/schemas/tdev.v1.schema.json` is the sole canonical external contract for M0. The generated files under `protocol/generated/` are reproducible derivatives:

```sh
npm run generate
npm run check:generated
```

The generator rejects unresolved local `$ref` values and canonical objects with declared properties that do not set `additionalProperties: false`.

## Runtime boundary

Stored M0 digests use these exact domains and omit only their own digest field:

```text
CaseTargetGrant  tdev.case-target-grant.v1 + NUL + JCS(grant without grantDigest)
CaseContract     tdev.case-contract.v1 + NUL + JCS(contract without contractDigest)
```

Validation rejects a well-shaped stored contract or grant whose digest does not match its canonical unsigned content.

The TypeScript and Go runtime packages implement the same checked-in fixtures for:

- strict schema and semantic validation;
- CaseContract and CaseTargetGrant validation;
- canonical JSON bytes;
- typed SHA-256 digests using `domain + NUL + canonical JSON`;
- Case, Task, and Attempt transition matrices;
- request dedupe, completion evidence, and the one-nonterminal-Attempt invariant.

M0 protocol JSON permits null, booleans, strings, arrays, objects, and safe integers. Fractional and out-of-range numeric values are rejected instead of being normalized differently by JavaScript and Go. Expanding the numeric domain requires a versioned schema and matching cross-language golden vectors.

`allowedSubpaths` contains explicit safe relative path prefixes. Empty strings, `.`, `..`, empty segments, backslashes, absolute paths, and implicit wildcards are not accepted. Operation working directories use the separate `target_root | subpath` union defined in `docs/OPERATIONS.md`.

## Test consolidation

M0 uses four test files: one protocol/fixture file and one state/invariant file per language. New cases extend the existing fixtures or transition tables. A new file is justified only by a separate runtime boundary, not by a new row in an existing contract.
