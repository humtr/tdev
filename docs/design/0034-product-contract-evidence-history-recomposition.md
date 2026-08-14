# Design 0034 — Product Contract Evidence and History Recomposition

- Status: `verified`
- Revision: 1
- Class: 2
- Decision date: 2026-08-14
- Active cumulative lineage: resolved from `WORKBOARD.md`; accepted from `group/f-cloudflare-runtime@f4b65010ef48e92e682646aa254d876f0bd37463`
- Inventory evidence: `docs/evidence/group-f-d0034-product-contract-evidence-history-inventory-2026-08-14.json`
- Acceptance evidence: `docs/evidence/group-f-d0034-product-contract-evidence-history-acceptance-2026-08-14.json`
- Verification evidence: `docs/evidence/group-f-d0034-product-contract-evidence-history-verification-2026-08-14.json`
- Affected owners: stable product-contract Markdown owners named by `docs/DOCUMENTATION.md`, `docs/history/`, documentation governance/tests, `WORKBOARD.md`, derived Design index
- Product/runtime semantics: unchanged
- Explicit non-goals: no source/runtime/provider/deployment mutation; no protocol identifier, digest, schema/profile version, resource bound, migration barrier, rollback rule, security boundary or accepted product behavior change

## 1. One-line definition

Keep live product owners focused on durable product contract and enduring rationale while moving historical measurements, verification chronology, exact result counts/environments and superseded implementation packaging into evidence/history, with byte-identical predecessor snapshots guaranteeing that no unique provenance is lost.

## 2. Concrete problem

D0033 removed obvious mutable current-status ledgers and exposed a broader boundary defect. At `40febe096fbc3c7c009e2a16ced423cf1f612fdf`, the seven stable product owners total 1,860 lines / 181,311 bytes. Most content is valid contract, but `ARCHITECTURE.md` sections 9.1-9.6 in particular mix stable authority decisions with D0008-D0014 measurement matrices, sample counts, stop-gate outcomes, benchmark-preferred representations and verification-state headings. Smaller comparator/profile/evidence chronology remains in security, operations and deployment prose.

This is not a product-behavior defect. It is an authority-classification defect: evidence can falsify or justify a contract, but a detailed past evidence ledger should not remain co-located as if it were current product meaning.

## 3. Decision — product-owner content

A live product owner may contain:

- normative behavior, ownership, transitions and non-goals;
- exact identifiers, digest domains, versions, protocol/resource bounds and compatibility rules that are part of the maintained contract;
- failure, security, migration, rollback and deployment qualification requirements;
- enduring rationale necessary to understand why the selected owner/representation preserves the contract;
- Design/evidence/history pointers when traceability helps interpretation.

A live product owner should not accumulate:

- exact past test counts, benchmark matrices, dated environment observations or candidate SHAs;
- headings whose primary meaning is “Verified … boundary” or “Current … packaging” rather than a stable contract;
- implementation-at-that-time statements such as “not yet implemented”, “current source still uses”, or “verified at source level”;
- detailed accepted/rejected comparator measurements that are already recoverable from the responsible Design/evidence/history.

Design records own accepted decision/revision/status and decision-specific evidence interpretation. Evidence records own observations. History owns superseded live narrative and predecessor snapshots.

## 4. Preservation rule

Before removing any evidence/history prose from a stable product owner, preserve the exact pre-D0034 bytes of all seven product owners under lowercase `docs/history/*-before-d0034.md` paths and verify their hashes independently.

The snapshots are historical provenance, not replacement product owners. Current links continue to point at the live normative files.

## 5. Architecture recomposition

`ARCHITECTURE.md` remains the owner of component/fact ownership, dependency direction and concurrency boundaries.

The former 9.1-9.6 evidence-heavy material is recomposed as stable architecture decisions:

- complete-Case snapshot packaging is an implementation representation, not a second semantic owner;
- sparse semantic authority must avoid total-tree update work and preserve exact path/ancestor/descendant conflict semantics;
- the selected v3 authority uses one transactional predecessor/CAS owner and one sparse semantic representation;
- Git is a derived projection/publication layer, never semantic authority;
- repository/model execution preserves immutable repository/context identity and the result-only boundary;
- bounded preparation/reference caches are disposable derived acceleration, never lifecycle/readiness/acceptance truth.

Exact D0008/D0009 matrices, sample counts, stop-gate results, benchmark rankings and former verification-state narrative move out of the live architecture owner while remaining recoverable in the predecessor snapshot and original Design/evidence records.

## 6. Other product owners

`SPEC.md`, `PROTOCOL.md`, `OPERATIONS.md`, `SECURITY.md`, `DEPLOYMENT.md` and `MCP.md` are edited only when an evidence/current-status sentence can be normalized without changing its contract. Protocol constants, exact failure rules, security controls, deployment migration/rollback barriers and final-MVP requirements are preserved.

A phrase such as “tested X leaked Y” may be replaced by the enduring security rule that the tested class is unqualified/forbidden, while the measured observation remains in Design/evidence/history.

## 7. Generic governance

Documentation validation should reject obvious evidence/history accumulation in stable product owners without becoming a semantic owner itself.

Required generic checks:

- no retired qualification path or current source-gate command duplication;
- no current route literal;
- no explicit mutable implementation-status phrases;
- no exact 40-character commit ledger in stable product owners;
- no evidence-history headings such as `Verified ... boundary`, `Current ... packaging boundary`, `Measured ...` or `Benchmark ...` in stable product owners;
- no `passed N/N`, exact benchmark/sample-result ledger or dated environment-result sentence where it is clearly observation rather than contract;
- allow contract constants, numeric resource bounds, migration predecessor names, profile versions and references to Design/evidence records.

The validator checks category boundaries; it does not freeze the exact prose or replace the product owner.

## 8. Acceptance matrix

| Gate | Required result |
| --- | --- |
| predecessor preservation | all seven pre-D0034 product owners are byte-identical at explicit history paths |
| product isolation | zero `src/` paths change and no runtime/provider mutation occurs |
| architecture | stable architecture ownership/rationale survives while measurement matrices, result counts and verification-state headings leave the live owner |
| protocol preservation | protocol identifiers, digest/state-transition/resource-bound meaning is unchanged |
| security/deployment preservation | trust, fail-closed, migration and rollback meaning is unchanged |
| evidence/history | removed unique narrative remains recoverable in predecessor snapshots and original Design/evidence records |
| status separation | stable product owners contain no current branch/runnable Design/current implementation verification ledger |
| qualification separation | source-gate commands exist only in QUALIFICATION among live owners |
| governance | adversarial fixtures reject evidence-history headings/result ledgers/status phrases in live product owners without hard-coded Design IDs |
| source regression | full applicable source/documentation gates pass or inherited unsupported layers remain explicitly classified |
| publication | exact clean descendant is non-force fast-forwarded only after fresh provider predecessor/ancestry proof |

## 9. Follow-on boundary

D0034 does not require every historical rationale sentence to disappear. A stable rationale that is necessary to interpret the maintained contract remains. Only observation chronology and superseded current-state packaging are removed from live product authority.

If this cleanup exposes an actual disagreement in product behavior, security, migration, rollback or support—not merely ownership of prose—the affected mutation stops and requires the responsible product Design/owner correction instead of being smuggled into D0034.
