# Design 0037 — Final-MVP Repository Shape and Qualification Boundary

- Status: `verified`
- Revision: 1
- Class: 2
- Decision date: 2026-08-19
- Acceptance base: `development@d554e4a2bcfe1af60931006487b21aa41b12873e`
- Trigger: user-directed application of ACR campaign `tdev-20260819-mvp-repository-shape-01`, convergence `acr/tdev-20260819-mvp-repository-shape-01/convergence`
- Acceptance evidence: `docs/evidence/group-f-d0037-r1-final-mvp-repository-shape-acceptance-2026-08-19.json`
- Source implementation evidence: `docs/evidence/group-f-d0037-r1-final-mvp-repository-shape-source-evidence-2026-08-19.json`
- Scope: repository executable topology, qualification boundary, semantic path/name migration, bounded removal of superseded research/selection executables, and consumer-safe validation/publication sequencing
- Product/runtime semantics: unchanged
- Explicit non-goals: no new Agent/MCP product surface; no broad `src/` hierarchy redesign; no `main` mutation; no development-route rename; no protocol/schema/profile/migration/provider identity rename merely to remove Design chronology; no Cloudflare resource rename/teardown without its own fresh provider proof; no loss of permanent regression/qualification coverage or Design/evidence/history provenance

## 1. One-line definition

Reshape the current repository into a clean final-MVP engineering surface by keeping flat semantic product/runtime source, introducing one explicit top-level `qualification/` executable boundary, migrating live Design-numbered qualification/build/test paths to semantic names, and removing only proven superseded executable residue while preserving durable compatibility identities and historical evidence.

## 2. Why this is Class 2

This change is not cosmetic. It changes path ownership, qualification discovery, build/package/workflow paths, and the acceptance evidence required before old executable paths disappear. `SDD.md` therefore requires an accepted Design before implementation.

The decision is bounded to engineering representation. It does not change product behavior. It changes where permanent qualification machinery lives, which executable research artifacts remain on the live tip, and how path consumers are migrated and proved.

## 3. Repository facts and reviewed evidence

At the acceptance base:

- `src/index.mjs` is the sole package export; the product/runtime source remains a flat semantic module set.
- D0019 qualification-only modules live under `src/` and D0019 qualification orchestration is split across `tools/`, `test/`, and `bench/`.
- D0030 selected native publication machinery is live production/build/qualification material but its package/build/workflow paths retain Design-number chronology.
- D0018 executable falsifiers remain current qualification assets even though they live under `bench/`.
- D0009 representation-comparison executables are non-authoritative research superseded by the selected semantic-v3 path.
- D0016/D0017 selection benches and the development-state comparison pair are historical-selection/development evidence rather than current product qualification, subject to complete consumer/invariant proof before deletion.
- current syntax/test discovery uses top-level globs and therefore must be extended before or atomically with moving executable modules into `qualification/`.

The ACR convergence independently joined A/B/C with blind P consumer-boundary review. Its machine readiness is `CONDITIONAL_ON_EXECUTABLE_PROOF`: the normative topology is closed; consumer/provider/deployment evidence remains executable application work.

## 4. Selected golden topology

```text
src/
  <flat product/runtime modules only>
  index.mjs

qualification/
  <permanent provider/runtime/falsifier executables using semantic names>

test/
  <permanent regression tests using semantic names>

tools/
  <genuine build/maintenance tools>

native/immutable-journal-publication/
  <package-owned native helper source/manifest/artifacts>

.github/workflows/
  immutable-journal-publication-posix-qualification.yml

bench/
  <only currently useful product/performance benchmarks>

cloudflare/d1/migrations/
  <durable migration identities unchanged>

docs/design/
docs/evidence/
docs/history/
  <durable rationale/evidence/history unchanged in authority role>
```

`qualification/` is an executable/navigation boundary, not a new normative owner. `docs/QUALIFICATION.md` remains the verification-method owner; affected product/Design owners remain behavior owners.

## 5. Path dispositions

### 5.1 D0019 CaseDO qualification

Move qualification-only code out of product source and remove Design chronology from internal live paths:

- `src/cloudflare-d0019-qualification.mjs` -> `qualification/cloudflare-casedo-worker.mjs`
- `src/d0019-qualification-runtime.mjs` -> `qualification/cloudflare-casedo-runtime.mjs`
- `tools/d0019-cloudflare-api.mjs` -> `qualification/cloudflare-casedo-api.mjs`
- `tools/d0019-cloudflare-qualify.mjs` -> `qualification/cloudflare-casedo-provider.mjs`
- `tools/d0019-live-qualification.mjs` -> `qualification/cloudflare-casedo-live.mjs`
- `bench/d0019-case-budget-measurement.mjs` -> `qualification/cloudflare-casedo-capacity-measurement.mjs`
- D0019 regression test filenames become semantic `casedo` / `cloudflare-casedo` names while preserving assertions.

Do **not** rename D0019 provider resource values, D1 migration `0001-case-placement.sql`, placement profile/schema identities, secret binding names, or any deployed identity merely because the repository path becomes semantic. Those are separate deployment/provider identities.

### 5.2 D0030 immutable-journal publication

The selected native helper remains production machinery. Migrate the repository/package paths as one deployment-shaped unit:

- `native/d0030/` -> `native/immutable-journal-publication/`
- `tools/build-d0030-native-helper.mjs` -> `tools/build-immutable-journal-publication-helper.mjs`
- package script `build:native:d0030` -> semantic primary `build:native:immutable-journal-publication`
- `.github/workflows/d0030-posix-qualification.yml` -> `.github/workflows/immutable-journal-publication-posix-qualification.yml`
- D0030 portability/mixed-race executables move under semantic qualification/test names.

The byte-identical `bench/d0030-native/rename_noreplace_helper.c` duplicate is deleted only after qualification consumes the package-owned production source. The comparator addon survives under a semantic qualification name.

External/manual consumers of the old npm script, workflow/check name, or package-relative helper path are an executable proof boundary. If absence cannot be proved, retain a bounded compatibility alias/path and report the row partial rather than guessing complete cleanup.

### 5.3 D0018 model-runtime falsifiers

The current verified D0018 executable falsifiers remain permanent qualification assets and move from `bench/` to semantic `qualification/model-runtime-*` paths together with the coupled worker fixture. Their accepted falsifier coverage must remain runnable after migration.

### 5.4 Superseded executable residue

After an exact-target complete consumer/invariant scan:

- remove D0009 research comparison executables and `bench:semantic`; keep current semantic-v3 production source/tests/bench plus D0009 Design/evidence/Git provenance;
- remove D0016/D0017 selection-only benches from the live executable tip while retaining their Design/evidence/history and current selected-context-delivery source/tests;
- remove the one-time development-state comparison pair and `bench:compare` while retaining its existing evidence/history/Git provenance.

If the scan finds a current qualification/recovery/maintenance consumer or unique surviving invariant, the affected row is retained or migrated instead of deleted.

## 6. Durable identities excluded from cosmetic cleanup

The following remain unchanged unless their own current lifecycle explicitly migrates them with compatibility/rollback evidence:

- Design IDs and Design/evidence/history filenames where chronology is provenance;
- schema/protocol/profile generations;
- `cloudflare/d1/migrations/0001-case-placement.sql`;
- D0019 provider resource/binding identities while live;
- immutable-journal committed filenames/backend semantic identities;
- persistent `development` route identity;
- evidence hashes and exact historical commits.

## 7. Application ordering

1. Extend syntax/test/documentation discovery so `qualification/` cannot escape the baseline gate.
2. Migrate D0019 internal qualification source/tool/test paths while preserving external provider identities; run baseline and D0019 focused/provider qualification available to the application.
3. Migrate D0030 native/build/workflow/qualification paths as one unit; rebuild and run clean-source, installed-copy/helper-identity/recovery, portability/mixed-race and workflow/check evidence available to the application before old paths or aliases disappear.
4. Move D0018 executable falsifiers and rerun their current accepted qualification boundary.
5. Run a complete exact-target consumer/invariant scan for D0009/D0016/D0017/development-comparison deletion candidates, then delete only rows proved current-consumer-free and semantically covered.
6. Run the complete current baseline/documentation gate and review the effective diff.
7. Publish only by non-force fast-forward from a freshly reread exact `development` predecessor, then provider-reread the published head.

## 8. Compatibility, rollback and failure behavior

- A move is not complete while a known required consumer still points at the old path.
- Unknown external consumers do not become zero consumers. For manually invoked/external names, keep compatibility until a negative-consumer/readback proof exists or explicitly report a retained compatibility exception.
- Any baseline discovery regression, focused-falsifier loss, package-helper identity failure, provider qualification failure, or owner mismatch fails closed before old-path deletion/publication.
- Rollback is repository/source rollback only unless a provider/deployment owner separately authorizes an external rollback. This Design does not authorize Cloudflare resource teardown or identity migration.
- Historical evidence is not rewritten to look current.

## 9. Acceptance matrix and cheapest falsifiers

| Area | Required acceptance |
| --- | --- |
| routing/authorization | D0037@r1 is `accepted`/`implementing` and selected in current `WORKBOARD.md` before implementation |
| baseline discovery | all moved `.mjs` executables are still syntax-checked and all permanent regression tests are still discovered |
| D0019 | semantic internal paths; unchanged provider/migration identities; current focused tests plus provider qualification when available |
| D0030 | semantic native/build/workflow paths; production helper is single source; clean-source/build/install/helper-identity/recovery/portability/mixed-race gates preserved |
| D0018 | adversarial/warm-runtime falsifier coverage remains runnable under semantic qualification names |
| deletion rows | complete repository consumer/invariant scan proves no current required consumer or unique uncovered invariant before deletion |
| docs/history | documentation governance passes; Design/evidence/history authority/provenance remains intact |
| publication | full applicable source gate green; exact diff reviewed; remote `development` freshly reread; non-force publish; provider reread equals intended commit |

Cheapest falsifiers are missing discovery after a move, a stale import/path consumer, a current owner naming a deletion candidate, changed D0019 external identity, a D0030 installed-copy/helper recovery failure, or a documentation-governance mismatch.

## 10. Non-goals and proof boundaries

This Design does not claim that the repository is a completed Level-4 product MVP, does not create future Agent/MCP modules, and does not claim runtime/provider behavior from source-only evidence.

Provider/external-consumer absence and D0030 platform/deployment identities remain separate proof layers. Application may close them only from direct evidence. Otherwise compatibility stays and the final Design verification records the bounded retained exception.

### 10.1 Implementation-time proof adaptations

D0037 does not weaken the D0013 repository-context contract to make the moved D0018 warm-host harness pass. The current tdev repository now contains package-owned native binary material, while `tdev.repository-context.git-full-text.v1` intentionally accepts only regular UTF-8 text blobs and fails closed on invalid UTF-8. The current warm-host requalification therefore runs the **current runtime code** against the predeclared D0018 expectation source commit `a603a736b3009331810f2e9e02d2f7ea9abf0d00`, which was independently revalidated as a current-HEAD ancestor and a complete UTF-8 text-tree fixture. Current-code HEAD and repository-context fixture identity are reported separately.

The old D0030 npm script, workflow filename and `native/d0030/` package path remain bounded compatibility surfaces because external/manual direct-path consumer absence is not provable from repository state alone. The semantic `immutable-journal-publication` names are primary; compatibility mirrors/aliases must remain content-identical and may be removed only by a later negative-consumer proof.

The connected Termux execution requalified D0030 build, source/manifest/binary identity and portability behavior, but two unchanged 25-round mixed-race attempts were interrupted by contender `SIGKILL`. This local environment row remains unqualified rather than green. The semantic Linux workflow must close the independent POSIX mixed-race and installed-copy/recovery layer after publication before D0037 verification.

D0019 internal path migration preserves every external provider/resource/binding and migration identity. The current application has no authorized Cloudflare account-plane connector, so live provider qualification is not re-executed or claimed; D0019 source/regression qualification is recorded separately.

## 11. Verification closure rule

Set D0037 to `verified` only after the implementation is published and the target's required baseline/focused gates pass for every mutated row. Rows whose external-consumer proof cannot be closed must be represented as retained compatibility exceptions, not silently called deleted. The final verification record must distinguish source/repository proof from any provider/deployment layer actually observed.

## 12. Verification closure

D0037@r1 is verified against implementation `bc8f7d27b18b13c840367843e503a75f84c126d9`. The complete source candidate gate passed before publication, the commit was published to `development` by exact non-force predecessor fencing, and provider reread returned the same implementation SHA. Verification evidence is `docs/evidence/group-f-d0037-r1-final-mvp-repository-shape-verification-2026-08-19.json`.

The semantic Linux POSIX workflow run `32222841632` completed successfully on that exact SHA. Its `linux-x64` job passed clean-source and post-build portability tests, unchanged immutable-journal oracles through both rename-no-replace and hardlink backends, the 25-round independent-process mixed race (`25/25` exact-one-winner with `25` loser conflicts), and fresh installed-copy helper missing/tamper/recovery qualification. Evidence artifact `9354508022` has digest `sha256:b5a6f88c7b2864f7917afecfd9b176baaf3e04574a48a1d0b143d844e79ef2df`. This closes the D0030 Linux proof that the current Termux process could not execute reliably.

D0018 adversarial and warm-host qualification also passed after the warm harness stopped incorrectly treating binary-containing current tdev HEAD as a valid `git-full-text.v1` fixture. Current runtime code remains current; immutable repository context is the predeclared D0018 expectation source `a603a736b3009331810f2e9e02d2f7ea9abf0d00`. No product repository-context rule was relaxed.

D0019 internal qualification paths are source/regression-qualified and all external provider/resource/binding/migration identities remain unchanged. No authorized Cloudflare account-plane connector was available in this application, so D0037 explicitly does **not** claim new D0019 live-provider qualification.

The old D0030 npm script, build-tool entrypoint, workflow filename and `native/d0030/` content remain bounded compatibility surfaces because external/manual direct-path consumer absence was not proved. Their semantic `immutable-journal-publication` counterparts are primary. This retained compatibility is an explicit verified exception, not unfinished hidden deletion. A later cleanup may remove it only with fresh negative-consumer/readback evidence.
