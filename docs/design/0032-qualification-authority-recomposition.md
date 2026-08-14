# Design 0032 — Qualification Authority Recomposition

- Status: `verified`
- Revision: 1
- Class: 2
- Decision date: 2026-08-14
- Active cumulative lineage: resolved from `WORKBOARD.md`; this revision was accepted from `group/f-cloudflare-runtime@3e8599ddc0ecce26c339933af13a82a1be7d0f59`
- Inventory evidence: `docs/evidence/group-f-d0032-mvp-qualification-inventory-2026-08-14.json`
- Acceptance evidence: `docs/evidence/group-f-d0032-qualification-authority-acceptance-2026-08-14.json`
- Verification source: `19317e43a7c01ec8ee841395e938eaffe1ace177`
- Verification evidence: `docs/evidence/group-f-d0032-qualification-authority-verification-2026-08-14.json`
- Affected owners: `docs/MVP.md` (retiring live owner), `docs/QUALIFICATION.md` (replacement owner), `AGENTS.md`, `WORKBOARD.md`, `docs/DOCUMENTATION.md`, maintained current-owner references, documentation validation/tests
- Preserved owners: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MCP.md`, `docs/ROADMAP.md`, runtime implementation and all durable product state
- Product semantics: unchanged

## 1. One-line definition

Replace the overloaded `docs/MVP.md` live acceptance/evidence aggregate with one stable `docs/QUALIFICATION.md` owner for verification methods and proof-layer boundaries, while preserving the exact former MVP document as history and leaving product behavior, current routing, Design decisions and observed evidence in their existing owners.

## 2. Repository facts and problem

At exact source `7332a7b347f7ecc94c1c12b37ce92ee3358de314`, `docs/MVP.md` is 52,228 bytes / 308 lines with SHA-256 `45148c5e9f152284d875152c4bff8d133dbf56662501473c9bd3a2225676d346`.

The B0 inventory classifies every section and all 78 acceptance-matrix data rows. The file currently combines at least five different truth classes:

1. stable qualification method and source-gate commands;
2. D0007-D0019 Design/completion summaries whose maintained meaning belongs to Design/product owners;
3. exact historical test counts, coverage, candidate SHAs and benchmark measurements;
4. then-current maturity/gap observations that can become stale;
5. generic proof-layer limits such as source evidence not proving provider/deployment/security layers.

This violates the one-owner direction established by `RULE.md` and `docs/DOCUMENTATION.md`: an evidence-rich historical aggregate is also being loaded as a live normative owner.

There is an additional live conflict. `docs/MVP.md` names only:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

as its source gate, while current `AGENTS.md` separately calls the following the repository minimum source gate:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

Two live owners therefore describe different breadth for the same source-qualification concern.

## 3. Decision — qualification owner

`docs/QUALIFICATION.md` becomes the sole stable owner for **how a tdev claim is qualified**. It owns:

- the baseline source qualification command sequence;
- the rule that a check proves only its observed layer;
- required separation of source, provider/runtime, security/client, deployment/migration/rollback and final deployed-product evidence;
- handling of unsupported/unavailable/unexecuted layers as explicit unqualified/unknown outcomes rather than success;
- the retained qualification-method matrix reconstructed from the former MVP acceptance matrix;
- evidence-record requirements sufficient to recover what exact source/environment/gate produced a claim.

It does not own:

- product behavior or support meaning already owned by SPEC/ARCHITECTURE/PROTOCOL/OPERATIONS/SECURITY/DEPLOYMENT/MCP;
- final-MVP capability decomposition or Level-4 exit intent owned by ROADMAP;
- current Group/branch/frontier/gaps owned by WORKBOARD;
- Design lifecycle/status/decision meaning;
- observed pass counts, candidate SHAs, benchmark values or historical completion narrative.

`MVP` remains a product milestone term where the product/program owners use it. It is no longer the name of the verification authority file.

## 4. Decision — canonical source qualification gate

The canonical baseline source qualification sequence is the stronger already-current repository minimum declared by `AGENTS.md` before D0032:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

This selection does not infer a new product behavior from passing tests. It resolves an existing duplicate-owner conflict by moving the broader currently declared minimum into the one qualification owner.

After the owner transition:

- `AGENTS.md` points to `docs/QUALIFICATION.md` and no longer carries a second command list;
- `docs/QUALIFICATION.md` owns the exact baseline commands;
- a Design may add focused or provider-specific gates for its bounded scope, but it cannot silently weaken the baseline or turn an unsupported layer into success;
- when an environment cannot execute a required primitive, the exact command result remains non-green and the affected environment/layer is reported `unqualified` unless a responsible owner explicitly defines a different supported profile;
- a supported subset may provide useful regression evidence but never substitutes for the failed required layer.

The inherited connected-Termux ImmutableJournal hard-link `link(2) EACCES` profile is the current example: its exact all-test source/coverage layers remain explicitly platform-unqualified until the responsible product/portability work closes that primitive or the support contract changes.

## 5. Decision — former MVP preservation and migration

Before `docs/MVP.md` is removed from the live namespace, its exact bytes must be preserved at:

`docs/history/mvp-verification-and-evidence.md`

The preserved file must have the same SHA-256 as the B0 source identity:

`45148c5e9f152284d875152c4bff8d133dbf56662501473c9bd3a2225676d346`.

That historical snapshot remains evidence/provenance, not the current qualification owner. Historical statements and old path references inside evidence or bounded Design history are not rewritten merely to look current.

The live owner transition is atomic at one commit boundary: `docs/QUALIFICATION.md` is created, `docs/MVP.md` leaves the live namespace, current bootstrap/navigation/owner pointers switch to QUALIFICATION, and documentation validation switches to the new unique owner. There must not be a committed state with two live qualification owners or with neither owner.

## 6. Decision — acceptance-matrix preservation

The former MVP acceptance matrix contains 78 data rows. Each row is split by truth class:

- `Area` + `Cheapest falsifier` are retained as qualification methodology;
- `Observed evidence` is an observation and remains recoverable from the byte-identical historical snapshot and referenced evidence rather than being copied into current authority.

The transition must mechanically compare the 78 old method pairs to the 78 reconstructed method pairs. Any missing, changed or duplicate pair blocks the owner swap unless a separately accepted Design explicitly changes that qualification meaning.

The new matrix is a verification-method catalog. It does not override the product owner that defines the behavior being falsified.

## 7. Proof layers and evidence semantics

Qualification is layered. At minimum distinguish:

1. source/static and deterministic repository behavior;
2. local runtime/adapter behavior in its declared supported environment;
3. provider/runtime ownership and restart/ambiguity behavior;
4. security/auth/tenant/secret and current-client behavior;
5. deployment/configuration/migration/rollback behavior;
6. final deployed end-to-end product qualification required by ROADMAP.

A lower layer cannot prove a higher layer. Skipped, unavailable, unsupported, stale or unexecuted evidence remains explicit. A source gate is never enough to call the Level-4 MVP complete.

Evidence for a positive claim records the exact source/revision, environment/profile, command/falsifier, result counts/outcome, and referenced durable evidence where applicable. A historic pass does not become a timeless current status merely by being copied into QUALIFICATION.

## 8. Current status and gap ownership

Specific mutable gaps do not belong in QUALIFICATION. Examples include the current ImmutableJournal connected-Termux hard-link gap, an accepted-but-unimplemented D0030 package integration, or current D0019 provider qualification. Those remain in current WORKBOARD/ROADMAP/Design owners as appropriate.

QUALIFICATION owns only the stable rule that such a layer is not passed until its required proof exists.

## 9. Compatibility and rollback

D0032 changes documentation authority and verification-method ownership only.

- No runtime source, durable schema, Case/Task/Attempt/Claim/Promotion meaning, provider state, deployment, migration or security contract changes.
- The exact old `MVP.md` content remains recoverable in history and Git.
- Documentation rollback before publication is file-level reversal. After publication, corrections move forward under SDD; they do not rewrite completed Git checkpoints.
- Reverting the qualification-method decision itself would be a new Class 2 acceptance-method decision.

## 10. Acceptance matrix

D0032 revision 1 is verified only when all of the following hold:

| Gate | Required result |
| --- | --- |
| inventory | B0 source identity and 78-row classification parse exactly |
| Design authority | D0032 is accepted before live owner mutation and is routed as a runnable Design while implementing |
| history preservation | historical MVP snapshot is byte-identical to pre-transition `docs/MVP.md` |
| unique owner | live `docs/MVP.md` is absent and live `docs/QUALIFICATION.md` is present after the atomic swap |
| source gate | QUALIFICATION owns the exact four-command baseline; AGENTS contains no duplicate source-gate command block |
| method preservation | all 78 former `Area + Cheapest falsifier` pairs equal the reconstructed qualification pairs exactly and in order |
| evidence separation | QUALIFICATION contains no `Observed evidence` column and does not carry historical pass-count/benchmark/current-Design-status ledger material as authority |
| owner routing | AGENTS, WORKBOARD, DOCUMENTATION and current navigation point to QUALIFICATION; stale continuity naming `docs/MVP.md` cannot override it |
| current Design refs | current accepted frontier Designs that navigate to the qualification owner point to QUALIFICATION without changing their product decision meaning |
| history exception | historical/evidence references to `docs/MVP.md` may remain when they truthfully describe the former owner |
| documentation validation | validator fails on missing/duplicate qualification owner, stale current-owner pointer, source-gate duplication or qualification-history contamination covered by mechanized rules |
| fresh-session rebind | a fixture carrying old `docs/MVP.md`, old branch or stale Design information resolves current route and qualification owner from repository authority |
| source non-regression | applicable documentation/source gates pass, or pre-existing platform-unqualified layers are reported exactly rather than hidden |
| product isolation | zero product `src/` paths change in D0032 |

## 11. Rejected alternatives

### Keep the path `MVP.md` and only shorten it

Rejected for this bounded reconstruction. The file name continues to conflate a product milestone with the proof authority, while the semantic benefit of a dedicated `QUALIFICATION` owner is now large enough to justify the reference migration that D0031 intentionally deferred.

### Add `QUALIFICATION.md` but retain `MVP.md` as a live summary

Rejected. That recreates two live owners or a summary that a fresh session can mistake for authority.

### Move the whole old MVP text to QUALIFICATION

Rejected. It would preserve historical test counts, benchmarks and stale Design status as live authority instead of fixing the defect.

### Drop the old acceptance matrix and rely only on current tests

Rejected. Tests are implementation/evidence; they do not silently own the 78 existing verification-method requirements.

### Keep source-gate commands in AGENTS as well as QUALIFICATION

Rejected. The current breadth conflict proves why duplicated command ownership is unsafe.

## 12. Implementation slices

1. preserve this accepted Design and acceptance evidence;
2. create and independently hash the byte-identical historical MVP snapshot;
3. construct QUALIFICATION from the accepted source gate, proof-layer rules and exact 78 method pairs;
4. atomically swap the live owner and current references, without rewriting historical evidence;
5. mechanize unique-owner, method-preservation, stale-MVP and contamination falsifiers;
6. run documentation/source regression with inherited platform limitations separated exactly;
7. mark D0032 verified, remove it from the runnable frontier, and publish by exact non-force fast-forward only after a fresh remote predecessor read.

Implementation does not authorize Phase C deep PROGRAM/ROADMAP compaction or any D0019/D0030 product implementation.

## 13. Verification conclusion

Revision 1 is verified for the bounded qualification-authority/documentation scope. The pre-D0032 MVP aggregate is preserved byte-identically at SHA-256 `45148c5e9f152284d875152c4bff8d133dbf56662501473c9bd3a2225676d346`; the live namespace has one qualification owner, `docs/QUALIFICATION.md`; all 78 historical Area + Cheapest falsifier pairs are mechanically identical in the new method catalog; the four-command baseline is owned only by QUALIFICATION; stale-MVP and owner/method/source-gate drift fail closed in the 17-test governance suite; and no product `src/` path changed.

The connected Termux environment remains explicitly platform-unqualified for the inherited ImmutableJournal hard-link publication primitive: exact `npm run check` and exact full coverage both execute 286 tests with 261 pass / 25 fail, and the same 25 failures reproduce in isolated `test/immutable-journal.test.mjs` as `link(2) EACCES`. The hard-link-excluded supported suite and instrumented coverage both pass 260/260. This inherited product/platform gap is not a D0032 regression and is not hidden by the D0032 verification claim.
