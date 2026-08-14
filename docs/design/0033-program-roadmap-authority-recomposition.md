# Design 0033 — Program and Roadmap Authority Recomposition

- Status: `verified`
- Revision: 1
- Class: 2
- Decision date: 2026-08-14
- Active cumulative lineage: resolved from `WORKBOARD.md`; this revision is accepted from `group/f-cloudflare-runtime@11c1e701fd67e07ae9891e8ea492c164f498a5c6`
- Inventory evidence: `docs/evidence/group-f-d0033-program-roadmap-recomposition-inventory-2026-08-14.json`
- Acceptance evidence: `docs/evidence/group-f-d0033-program-roadmap-recomposition-acceptance-2026-08-14.json`
- Verification evidence: `docs/evidence/group-f-d0033-program-roadmap-recomposition-verification-2026-08-14.json`
- Affected owners: `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `README.md`, `docs/DOCUMENTATION.md`, bounded owner wording in `docs/QUALIFICATION.md`, documentation validation/tests, `WORKBOARD.md`, derived Design index, and historical snapshots created by this Design
- Preserved owners: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MCP.md`, all product source/runtime state, all maintained product Design decisions, `LINEAGE.md`, and the D0032 qualification-method meaning
- Product semantics: unchanged

## 1. One-line definition

Finish the documentation normalization begun by D0031 and D0032 by making `ROADMAP.md` the compact stable owner of final-MVP capability/exit intent, making `PROGRAM.md` the compact forward-looking Design/gate dependency and coverage graph, removing Design status/evidence/history/current-route duplication from those live planning owners, rebuilding README as non-authoritative navigation, and making documentation validation derive from current owners rather than freezing historical transition data as a second authority.

## 2. Repository facts and concrete problem

At exact source `143d648636d26ba0df5eaf474f1aefae32f7f531`:

- `docs/ROADMAP.md` is 212 lines / 16,635 bytes;
- `docs/development/PROGRAM.md` is 392 lines / 40,803 bytes;
- the two live planning owners total 604 lines / 57,438 bytes;
- both repeat the A-H capability decomposition;
- both repeat provisional/accepted Design planning and status information;
- both retain completed Design narrative, evidence identities and historical checkpoint detail whose maintained owners already exist elsewhere;
- PROGRAM still carries open questions whose conditions were resolved by completed D0017/D0018 work or D0019 revision 2 acceptance;
- README still declares `mvp-1a-7` as the active development identity, calls D0014 the latest verified production-source layer, repeats source/coverage/benchmark commands, describes the post-D0014 context gate as future work, and tells every session to load a fixed historical/product set that conflicts with AGENTS progressive loading;
- QUALIFICATION says mutable current gaps may belong in ROADMAP even though D0031 revision 2 made ROADMAP a stable capability/exit owner;
- the generic documentation validator hard-codes the exact source-gate commands and permanently compares the current qualification-method catalog to the pre-D0032 historical 78-row snapshot, so changing the current owner would require editing a second semantic list or historical lock.

D0031 revision 2 already fixed current-route duplication: a WORKBOARD-only F-to-G transition is valid and ROADMAP/PROGRAM carry no `ACTIVE` or current-lane mirror. D0033 therefore does not reopen D0031's routing model. The remaining defect is **planning/history/derived-owner overlap**, not current-router correctness.

## 3. Decision — owner boundaries

### 3.1 ROADMAP

`docs/ROADMAP.md` owns only stable final-product planning meaning:

- final MVP definition and completion levels;
- A-H capability decomposition;
- stable Group exit criteria;
- stable cross-capability sequencing constraints and parallelism posture;
- unavoidable external setup acceptance shape at the capability level;
- final deployed Level-4 exit matrix;
- post-MVP boundary.

ROADMAP does not own:

- current Group/branch/frontier;
- maintained Design lifecycle status/revision;
- detailed Design decision text;
- test counts, benchmark values, candidate SHAs or evidence ledger;
- a Design-number execution queue;
- exact provider/deployment/security mechanisms already owned by product documents.

### 3.2 PROGRAM

`docs/development/PROGRAM.md` owns forward-looking engineering coverage:

- a compact mapping from remaining/conditional Design-sized gate labels to Capability Groups;
- accepted Design foreign keys only where their implementation/qualification remains a forward dependency;
- provisional Design labels that are explicitly non-authorizing;
- dependency edges and parallel-runnable posture;
- cheapest falsifier/exit shape for each forward gate;
- whether a gate depends on user/provider action;
- the omission-prevention coverage rule;
- unresolved questions that can still split, combine, activate, remove, reorder or defer gates.

PROGRAM does not copy the maintained status/evidence narrative of Design files, duplicate ROADMAP's A-H table, retain completed Group closure reports, or own current routing.

### 3.3 Design, evidence and history

A maintained Design file owns its decision/revision/status. Machine-readable evidence owns observed results. Historical narrative and superseded live-document snapshots live under `docs/history/` and may truthfully retain former current statements without becoming live planning authority.

Before D0033 removes material from README/ROADMAP/PROGRAM, the exact pre-D0033 bytes of all three files are preserved under lowercase history paths and independently hashed against the C0 inventory.

## 4. Decision — README

README is navigation and product orientation, not current authority.

The rebuilt README must:

- describe tdev without naming a remembered active branch or latest Design as current law;
- direct development sessions to `AGENTS.md` and the fixed `AGENTS -> RULE -> SDD -> WORKBOARD` bootstrap;
- direct product readers to the product owners and planning readers to ROADMAP/PROGRAM;
- contain no duplicate baseline source-gate command list;
- contain no historical benchmark/test-count ledger;
- contain no fixed old Design/review read set;
- make explicit that current route and runnable gates come from WORKBOARD and maintained Design owners.

Historical D0014-oriented README content is preserved in the D0033 history snapshot instead of silently discarded.

## 5. Decision — qualification wording and validator derivation

D0033 does not change any D0032 qualification method or source-gate command.

Two implementation corrections are required under that unchanged meaning:

1. QUALIFICATION's mutable-gap wording is corrected so mutable current gaps live in WORKBOARD or the responsible Design/product owner; ROADMAP owns stable unmet exit criteria, not mutable current state.
2. Generic governance must parse the source-gate commands and current method catalog from QUALIFICATION rather than carrying a second hard-coded command list or making the pre-D0032 historical matrix a perpetual current co-owner.

D0032's transition facts remain permanently evidenced by its accepted Design and verification evidence: the old MVP bytes were preserved and all 78 methods matched at the owner-swap gate. Removing that migration-specific equality from generic future validation does not change those historical facts and does not change current QUALIFICATION content.

Generic validation should still fail on malformed/duplicate source-gate blocks, command duplication back into AGENTS, missing/duplicate current qualification owner, observed-evidence/current-status contamination in QUALIFICATION, and structurally invalid method rows.

## 6. Traceability contract

Every final-MVP requirement must remain traceable without one planning owner copying another owner's detail:

```text
product requirement / product owner
  -> ROADMAP capability Group + exit
  -> PROGRAM forward Design/gate mapping
  -> accepted Design when Class 2
  -> implementation
  -> QUALIFICATION method + exact evidence
  -> user/provider action when required
```

A final-MVP Group row may exist only in ROADMAP. PROGRAM references Group identifiers rather than duplicating Group capability/exit text.

A maintained accepted/implementing Design used by a PROGRAM forward gate is referenced as `Dxxxx@rN` and its file path; PROGRAM does not copy its status. A provisional gate has no Design authority until a Design record is accepted under SDD.

## 7. Failure, compatibility and rollback

- Missing or malformed ROADMAP/PROGRAM owner structure fails documentation validation.
- A future WORKBOARD route change must not require ROADMAP/PROGRAM edits merely to synchronize current state.
- A Design status/revision change is resolved from its Design owner, not from PROGRAM text.
- Removing live historical prose is permitted only after the exact predecessor snapshots are preserved and hashed.
- Historical snapshots are never used as current routing or planning authority.
- No runtime code, durable schema, provider configuration, deployment, migration, rollback or security behavior changes.
- If compaction exposes an independent product/owner decision not already resolved by current authority, that dependent mutation stops until a separate Design/owner decision exists.
- Published corrections move forward on the active cumulative lineage; completed checkpoints are not rewritten.

## 8. Acceptance matrix

| Gate | Required result |
| --- | --- |
| authority rebind | exact current remote/base and bootstrap owners agree before mutation |
| preservation | pre-D0033 README, ROADMAP and PROGRAM are byte-identical at explicit history paths with C0 hashes |
| ROADMAP scope | one A-H capability/exit table; no maintained Design status/evidence ledger, no current route, no detailed completed-Design narrative |
| PROGRAM scope | no duplicate A-H capability table; compact forward gate rows carry Group refs/dependencies/falsifier/exit/external dependency without copied Design status/evidence narrative |
| Design ownership | current accepted Design foreign keys resolve to maintained Design files; provisional labels remain explicitly non-authorizing |
| resolved questions | CaseDO-host question and stale D0017/D0018 future-condition wording are absent; remaining open questions are genuinely unresolved |
| README | no active branch/Group claim, no D0014-latest claim, no source-gate command duplication, no fixed historical bootstrap set |
| qualification boundary | mutable current gaps are not assigned to ROADMAP; current QUALIFICATION methods/commands otherwise unchanged |
| generic validator | current source-gate commands are parsed from QUALIFICATION, not hard-coded; generic validation does not require current methods to equal historical MVP forever |
| current router | zero/N frontier, WORKBOARD-only F-to-G and reopened-Design fail-closed tests remain green |
| traceability | every forward PROGRAM gate maps to one or more ROADMAP Groups; every Group referenced by PROGRAM exists in ROADMAP; accepted Design refs resolve; provisional refs are distinguishable |
| stale-derived data | intentionally stale Design status/evidence inserted into PROGRAM is either impossible by schema or detected as forbidden duplicate owner data |
| source non-regression | applicable source/documentation gates pass, with inherited hard-link platform failure reported exactly |
| product isolation | zero product `src/` paths change |
| publication | exact clean candidate is a descendant of freshly reread remote predecessor and is published by non-force fast-forward; provider reread equals candidate |

## 9. Rejected alternatives

### Keep ROADMAP and PROGRAM verbose because both are only planning

Rejected. Two non-authoritative documents can still mislead a new session and impose synchronization work. Stable planning meaning still needs one owner per fact.

### Generate PROGRAM entirely from Design files

Rejected. Provisional/conditional gates and unresolved coverage questions exist before a Design is accepted. PROGRAM owns that forward planning relation; Design files own accepted decisions.

### Put all Design planning in ROADMAP and delete PROGRAM

Rejected. Capability exits and Design-sized dependency/coverage are different abstraction levels. Combining them would recreate the overloaded-document problem.

### Keep the D0032 78-row comparison as permanent generic validation

Rejected. It correctly proved the D0032 migration, but historical transition input must not become a permanent co-owner that blocks a future explicitly accepted qualification-method change.

### Rewrite old Designs/history to current paths and terminology

Rejected. Historical accuracy and evidence provenance are preserved. Current navigation/owners are corrected without falsifying what earlier records observed.

## 10. Implementation slices

1. preserve this accepted Design and acceptance evidence; route D0033 as the selected self-development gate;
2. preserve exact README/ROADMAP/PROGRAM predecessor snapshots under history;
3. rebuild ROADMAP as the sole stable capability/exit owner;
4. rebuild PROGRAM as the sole forward Design/gate dependency/coverage owner;
5. rebuild README navigation and correct bounded QUALIFICATION wording;
6. generalize documentation governance and add traceability/adversarial fixtures;
7. review all live documentation for newly exposed same-scope owner/drift defects and correct them within this Design or a separate Design when the problem boundary is independent;
8. run the full applicable qualification layers, mark D0033 verified, remove it from the runnable frontier, and publish by exact non-force fast-forward after a fresh remote read.

D0033 does not authorize D0019/D0030 product implementation or any provider/runtime/deployment mutation.
