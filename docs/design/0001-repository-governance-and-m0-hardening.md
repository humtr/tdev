# Design 0001 — Repository Governance and M0 Hardening

## Metadata

- Status: `implementing`
- Date: 2026-08-04
- Acceptance authority: direct maintainer request to establish repository-specific SDD, RULE, AGENTS, WORKBOARD, supporting guidance, and to re-audit the first implementation
- Base source: `cacda33e5cf04ab6ea7b606ba7ce61038ff98bee`
- Affected owners: repository process; `docs/PROTOCOL.md`; `docs/MVP.md`; M0 runtime and pure domain implementation
- Implementation paths: root governance files, `docs/design/`, M0 runtime/state/tests, directly affected status documentation

## One-line definition

Establish a tdev-owned specification-driven repository workflow and harden the existing M0 implementation so unsupported schema features, malformed UTF-8 inputs, invalid UTC timestamps, cross-language numeric divergence, and duplicate completion mappings fail explicitly without expanding the M0 product boundary.

## Source classification

### Authority

- `docs/SPEC.md`, `ARCHITECTURE.md`, `PROTOCOL.md`, `OPERATIONS.md`, `SECURITY.md`, `DEPLOYMENT.md`, and `MVP.md` at the base source.
- Canonical M0 schema at `protocol/schemas/tdev.v1.schema.json`.

### Source material

The following general workflow documents were supplied by the maintainer and used as design input, not copied as repository authority:

| Material | SHA-256 |
| --- | --- |
| General SDD guidance | `48a9aefe7d8f4904d3ae7572e5f6109ad18fa7179ee255ee9ed617ee2c146170` |
| General engineering RULE guidance | `2ce66bc3a630b9fa557568da29bf16bc1c6c8ceadee744e518f509e235008ceb` |
| Repository bootstrap guidance | `e2d605e73cc2c547fd512e40ef3253bdbe05f18d498c89921da32adba955cc36` |
| WORKBOARD guide | `001f1d0338c3fb0ba3f0d11d91a1a356d905a14fee4517074cb7d1b4fa19b1f2` |
| WORKBOARD template | `a1e75d194afd661211b1eeabd6f23d4446c93260c40d0e8a652a79c512191ca6` |

### Evidence at design start

- Root repository governance files were absent.
- The existing deterministic M0 gate passed on the base source.
- TypeScript accepted a synthetic `type: number` value `1.5`; Go rejected it.
- Both runtime validators accepted an unknown schema keyword without error.
- Completion evidence mappings with the same `criterionId` were overwritten by map construction rather than rejected explicitly.
- Go `ParseJSON` accepted invalid UTF-8 bytes by allowing replacement with U+FFFD.
- The `Timestamp` regex accepted impossible calendar dates and time fields despite the protocol owner requiring RFC 3339 UTC.
- The M0 schema itself currently uses safe `integer`, not `number`, for `JsonValue`.
- Generated Go `oneOf` representations are `json.RawMessage` and require validation before domain use.

### Unknowns

- Full Unicode NFC enforcement for `RelativePath` is not implemented in M0 and cannot be claimed from the regex. It is a hard gate for the M3 Agent filesystem slice.
- Whether M1 needs generated typed Go union wrappers or validated domain-specific decoders remains an M1 design decision. Raw wire unions must not be used as trusted domain state.
- M0 validators consume parsed values and cannot observe duplicate object member names discarded by an ordinary JSON parser. M1 raw ingress must reject duplicates before decoding, validation, canonicalization, or digest comparison.

## Current contract

- Existing normative documents own product and subsystem facts.
- JSON Schema 2020-12 is canonical; generated outputs are derivative.
- Protocol v1 `JsonValue` supports safe integers, not fractional values.
- TypeScript and Go must accept and reject the same protocol values.
- Every mandatory completion criterion and verification requirement must map to evidence.
- M0 has four consolidated test files and no Cloudflare, Agent runtime, deployment, installation, or release claim.

## Problem

The repository had strong product documents but no repository-local routing and change-control system. That made it possible for a client-specific workflow to be mistaken for repository authority. The M0 review also found fail-open behavior in the custom schema subset and ambiguous duplicate evidence mapping, both contrary to tdev's one-owner and failure-honesty rules.

## Scope

- Add repository-specific `AGENTS.md`, `RULE.md`, `SDD.md`, `WORKBOARD.md`, bootstrap/workboard guidance, template, design registry, and this record.
- Clarify normative status and the next milestone.
- Define and enforce the exact schema keyword subset supported by M0 runtimes.
- Align TypeScript `number` behavior with the safe-integer protocol profile used by Go and `JsonValue`.
- Reject duplicate completion mappings explicitly in TypeScript and Go.
- Reject malformed UTF-8 in the Go raw JSON helper and canonical schema generator input.
- Add an executable `date-time` format and equal Gregorian UTC validation in TypeScript and Go.
- Extend existing tests only; retain four test files.

## Non-goals

- M1 CaseDO storage or public control implementation.
- Cloudflare Worker or Durable Object code.
- Agent enrollment, transport, queue, filesystem, Git, process, setup, deployment, installation, release, or routing.
- Full Unicode normalization implementation.
- A new schema version, migration, dependency, generated-union framework, CI provider, or generic policy language.
- Merge to the default branch.

## Invariants

- Existing normative owners remain sole owners of their facts.
- tmcp and other clients remain execution integrations, not product owners.
- Unsupported schema semantics never validate successfully.
- TypeScript and Go protocol validation remain equal.
- Safe-integer-only protocol v1 behavior remains explicit.
- Duplicate evidence mappings cannot become order-dependent truth.
- Generated files remain reproducible derivatives.
- Four M0 test files remain sufficient; behavioral coverage increases.
- Unrelated refs, worktrees, credentials, runtime, Cloudflare state, and sealed audit material remain untouched.

## Design

### Repository governance

- `AGENTS.md` provides routing and validation entry points.
- `RULE.md` owns recurring cross-cutting guardrails.
- `SDD.md` owns change classification and design workflow.
- `WORKBOARD.md` contains current pointers only.
- `docs/design/` stores accepted change designs and evidence summaries.
- Bootstrap and workboard guides are fallback/reference material, not active product owners.

### Schema subset

M0 implements a deliberate JSON Schema 2020-12 subset. Supported schema-node keywords are:

```text
$ref
additionalProperties
const
enum
format
items
maxLength
maximum
maxItems
minLength
minimum
minItems
oneOf
pattern
properties
required
type
uniqueItems
```

The validator rejects any other schema-node keyword. `$ref` and `oneOf` nodes in the M0 subset have no siblings because the runtime otherwise could ignore sibling semantics. The generator and both runtime implementations enforce compatible rules.

### Numeric profile

Protocol v1 canonical JSON accepts null, booleans, strings, arrays, objects, and integers in the JavaScript safe range. Fractional and out-of-range numbers are invalid. A future broader number domain requires a versioned owner change and cross-language canonical vectors.

### Completion evidence

`criterionId` appears at most once in a completion mapping set. Duplicate mappings return a deterministic error before coverage is considered complete. The function preserves existing missing-criterion, empty-evidence, and missing-requirement checks.

### Generated Go unions

No generator expansion is introduced in this slice. `json.RawMessage` is a wire representation only. M1 must validate and discriminate before constructing canonical state. This limitation is documented rather than hidden.

## Security impact

No credential or runtime surface is added. Fail-closed schema handling reduces authorization and result-validation risk. The new documents prohibit client-specific credentials or execution assumptions from becoming repository contracts.

## Compatibility, migration, and rollback

- The canonical M0 schema changes by adding the executable `date-time` format to `Timestamp`. No released client or persisted state exists, so no compatibility bridge or data migration is required.
- Runtime behavior changes only for unsupported schema definitions, malformed UTF-8 raw inputs, invalid timestamps, fractional synthetic `number` values, and duplicate completion mappings; these were never valid under the intended M0 contract.
- Rollback is source-only: revert the governance branch commits. No Cloudflare or Agent state is affected.

## Vertical slices

1. Establish owner map, repository rules, SDD workflow, design registry, and active workboard.
2. Add fail-closed schema-subset validation and numeric parity tests.
3. Add duplicate completion mapping rejection and tests.
4. Update normative status/clarification documents.
5. Run focused and full deterministic gates, review complete diff, publish the branch, and update this record/workboard to verified state.

## Acceptance criteria

1. Repository-specific governance files exist and assign no duplicate product owner.
2. AGENTS routes through RULE, SDD, WORKBOARD, active design, and relevant normative owners.
3. WORKBOARD contains pointers and current layer only.
4. Unsupported schema keywords and `$ref`/`oneOf` sibling semantics are rejected in TypeScript, Go, and generation checks.
5. TypeScript and Go both reject fractional `type: number` values under the M0 profile and accept safe integers.
6. Duplicate completion mappings are rejected deterministically in both languages.
7. Go raw protocol and schema parsing reject invalid UTF-8 without replacement.
8. TypeScript and Go reject impossible calendar dates, invalid time fields, offsets, leap seconds, and noncanonical suffixes while accepting the same valid UTC timestamp fixtures.
9. Existing schema fixtures, canonical vectors, transition matrices, generated drift, forbidden-import check, and Go vet remain green.
10. Test file count remains four.
11. Complete diff contains only scoped governance, M0 hardening, tests, and affected documentation.
12. Published remote branch equals the reviewed local commit and uses the noreply author/committer identity.

## Verification matrix

| Claim | Verification | Layer |
| --- | --- | --- |
| Owner routing | bounded file reads and link/path checks | contract/source |
| Schema subset fail-closed | synthetic unsupported-keyword and sibling tests in both existing protocol test files | unit/protocol |
| Numeric parity | synthetic number schema cases in both languages | unit/protocol |
| Duplicate mapping | existing state test files in both languages | unit/domain |
| Raw UTF-8 admission | existing Go protocol test file plus generator invalid-input probe | unit/protocol |
| Timestamp parity | shared schema fixtures and direct invalid calendar/time probes in both runtimes | unit/protocol |
| Generated parity | `npm run check:generated` | source/generated |
| M0 regression | `npm test` | source/unit |
| Go static checks | `go vet ./...` | source/static |
| Scope and whitespace | `git diff --check`, file list, complete diff review | source/checkout |
| Publication | exact local/remote ref and GitHub commit/file observation | remote source |

No installation, Cloudflare, Agent, public MCP, client-schema, or rollback runtime verification is claimed.

## Verification evidence

Observed on 2026-08-04 from base `cacda33e5cf04ab6ea7b606ba7ce61038ff98bee` in the isolated governance worktree:

- `npm ci --ignore-scripts --no-audit --no-fund` completed successfully.
- `npm test` completed successfully: generated drift, eight TypeScript logical tests, all Go packages, forbidden domain imports, and governance links/status were clean.
- `go vet ./...` and `git diff --check` completed successfully.
- Generator admission rejected unknown root keywords, malformed bounds, same-instance reference cycles, `$ref` siblings, unsupported and misplaced string formats, and invalid UTF-8.
- The canonical `portable-test` and `portable-install` validation profiles completed successfully and changed no paths.
- The repository retained exactly four test files.

Remote publication and exact remote-commit observation remain pending. This record therefore remains `implementing` until acceptance criterion 12 is observed.

## Stop gates

- Do not begin M1 until a separate accepted design record owns SQLite schema, transactions, public control, raw JSON duplicate-name rejection, validated union discrimination, persistence tests, migration, and rollback.
- Do not begin M3 path effects until NFC normalization, symlink/mount containment, root identity, and live re-observation are implemented and tested on the owning Agent boundary.
- Do not treat generated Go unions as canonical domain values without a validated discriminator layer.

## Decision log

- 2026-08-04: maintainer authorized repository-specific governance and current-work re-audit.
- 2026-08-04: existing product owner map retained; governance files route rather than duplicate it.
- 2026-08-04: M0 numeric domain retained as safe integers; TypeScript is tightened instead of broadening Go/JCS behavior.
- 2026-08-04: unsupported schema keywords are rejected rather than silently ignored.
- 2026-08-04: duplicate completion mappings are invalid rather than last-write-wins.
- 2026-08-04: same-instance `$ref` cycles are rejected; recursive schema is admitted only after instance structure is consumed.
- 2026-08-04: malformed UTF-8 is rejected by the Go M0 raw helper and schema generator before replacement can occur.
- 2026-08-04: `Timestamp` gains an executable `date-time` format with equal Gregorian UTC validation in TypeScript and Go; impossible regex-shaped values are rejected.
- 2026-08-04: raw duplicate JSON member rejection is assigned to the future M1 ingress boundary and remains a stop gate, not an M0 completion claim.
