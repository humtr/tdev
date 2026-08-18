# Design 0036 — Single Development Route and Provenance Compaction

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-08-18
- Acceptance base: `group/f-cloudflare-runtime@675e2a192828954251f76fafcc34ef077bdad1f0`
- Trigger: user-directed application of ACR campaign `tdev-20260818-devstate-planab-01`, convergence `dda5c3bbae5f137a7ba1f93ed08004b14a4704e0`, after target-native R0 verification
- Acceptance evidence: `docs/evidence/group-f-d0036-r1-single-development-route-acceptance-2026-08-18.json`
- Scope: self-development route topology, pre-bootstrap route election migration, checkpoint/ref provenance compaction, bounded provider-ref retirement and the migration evidence needed to prove them
- Product/runtime semantics: unchanged
- Explicit non-goals: no merge or fast-forward of `main`; no product Git-Promotion change; no Cloudflare/runtime/deployment mutation; no tmcp retirement; no canonical-history rewrite; no wholesale merge of divergent historical branches; no structured-governance refactor beyond the fields needed to make this migration fail closed
- Supersession relation: D0031 r7 remains the verified pre-cutover bootstrap/documentation predecessor while the bridge is active. The D0036 cutover supersedes only D0031's affected multi-ref authority-election/checkpoint-ref-preservation meaning and preserves its fixed kernel, one-owner, stale-context, Design-lifecycle and complete-lifecycle-vocabulary safeguards.

## 1. One-line definition

Replace per-checkpoint persistent development branches with exactly one persistent published development route, `development`, while keeping `main` unchanged, preserving historical meaning by content/evidence rather than branch topology, and retiring old refs only after per-ref consumer/content/reachability proof.

## 2. Why this is a new Design

D0031 section 5.2 and `SDD.md` require a new Design when a correction selects a materially different owner model or introduces a separately decidable migration/cutover. This decision does both:

- the pre-cutover model elects one current route from multiple self-declaring published checkpoint refs linked by exact predecessors;
- the terminal model admits exactly one persistent development-route marker and does not require a permanent provider ref for each historical checkpoint;
- provider ref creation, bootstrap bridging and ref deletion are externally visible migration steps with independent rollback/recovery barriers.

D0035 is not this owner. D0035 owns future tmcp-retirement readiness and a deployed self-hosting proof after later product gates. D0036 changes only repository self-development authority/provenance topology.

## 3. Selected target topology

The persistent provider-visible development topology for this migration is:

```text
main          # release/non-development boundary; unchanged by D0036
  \
development  # the one persistent self-development route
```

The exact future development ref is `refs/heads/development`.

Acceptance-time provider observation established:

- `group/f-cloudflare-runtime@675e2a192828954251f76fafcc34ef077bdad1f0` as the freshly elected cumulative authority;
- `main@b86287b84375e2aeb833cf775371a7808a1239cf` as the D0036 main baseline observation;
- `refs/heads/development` absent;
- `git check-ref-format refs/heads/development` succeeds.

Those mutable observations must be reread at every provider-changing gate. The acceptance observation does not replace provider truth. If `main` differs from the D0036 baseline before R1-R3 completion, dependent D0036 provider mutation fails closed for owner review; D0036 never advances `main` itself.

## 4. Authority bridge and cutover

### 4.1 Seed phase

Create `development` only from the exact freshly re-elected cumulative authority head after proving the provider ref is still absent and `main` still equals the D0036 baseline. The seed changes no bytes: both refs initially name the same commit.

Because the seeded commit's `WORKBOARD.md` still declares `group/f-cloudflare-runtime`, the seeded `development` ref is deliberately ineligible under the verified D0031 legacy locator. Legacy authority therefore remains the old cumulative ref until a cutover commit exists.

### 4.2 Dual-resolver bridge

The cutover implementation introduces an explicit persistent-route marker in the current router and a new authority resolver mode.

The marker contract is:

```text
- Development route mode: `persistent-v1`
- Active cumulative branch: `development`
```

A `persistent-v1` candidate is eligible only when its own `WORKBOARD.md` contains exactly one well-formed repository identity equal to `humtr/tdev`, exactly one mode value `persistent-v1`, and exactly one active branch equal to the published ref containing that WORKBOARD.

During the bridge:

1. the cutover commit on `development` retains one exact legacy predecessor declaration pointing to the still-published pre-cutover `group/f-cloudflare-runtime@<exact-sha>`;
2. the verified D0031 legacy resolver must elect that exact `development@<cutover-sha>` as the unique maximal successor;
3. the new persistent resolver must independently elect the same exact `development@<cutover-sha>` from the unique `persistent-v1` marker;
4. disagreement, zero persistent candidates or more than one persistent candidate blocks cutover and any deletion.

No provider default, checkout, timestamp or branch-name heuristic substitutes for this equality proof.

### 4.3 Persistent resolver terminal rule

After bridge equality, provider-default alignment and controllable consumer migration are proved, the live bootstrap removes legacy multi-ref fallback. Terminal authority location enumerates published heads only to find the unique self-declaring `persistent-v1` route. Non-persistent historical/group/concept/research/agent/tool refs are provenance or transport and cannot elect or block the route.

Before the old cumulative ref may be deleted, the current router stops using `Immediate completed predecessor` as a live authority dependency. Its exact cutover source identity is preserved in the D0036 manifest/evidence instead. Once legacy fallback is removed, a deleted legacy ref cannot become fallback authority merely because a stale snapshot once self-declared it current.

Provider default may be aligned to `development` only after old/new resolver equality. Default alignment remains discovery/compatibility state, never repository authority.

## 5. Checkpoint and lineage model after cutover

Capability Group identity remains a planning/checkpoint fact; it no longer implies a new persistent branch.

After cutover:

- `WORKBOARD.md` may change the active cumulative Group while keeping `development` as the active branch;
- a completed Group checkpoint is recorded by exact reachable commit identity plus Design/evidence/history records;
- new Group completion does not create a permanent Group ref by default;
- `LINEAGE.md` owns checkpoint succession and evidence requirements, not a permanent-ref-per-checkpoint topology;
- an exact Git ref/tag anchor is retained only when a named live consumer or recovery requirement needs that object to remain otherwise unreachable;
- ordinary defect correction continues forward on `development` without rewriting `main` or historical commits.

D0036 is the explicit history-correction authority contemplated by `SDD.md` for changing completed-ref preservation policy. It does not authorize rewriting already shared history.

## 6. One-time compaction manifest

The migration uses one bounded machine-readable manifest at:

`docs/evidence/group-f-d0036-r1-development-route-compaction-manifest-2026-08-18.json`

It is D0036 migration evidence, not a permanent repository lifecycle owner. It is frozen when D0036 verification closes. Its schema contains:

```text
schemaVersion
repository
design
revision
migrationStatus
mainBaseline
targetDevelopmentRef
bridge
refs[]
providerRereads[]
validation[]
unresolvedExternalConsumers[]
```

`migrationStatus` is one of:

- `accepted_not_started`
- `bridge_seeded`
- `persistent_route_cutover`
- `retirement_in_progress`
- `complete_with_retained_exceptions`
- `complete`

Each `refs[]` entry records at minimum:

```text
ref
observedTip
relationToDevelopmentBase
materialInventory[]
branchNameConsumers[]
exactObjectConsumers[]
dispositions[]
deletionEligible
retentionReason
preDeleteValidation
postDeleteProviderObservation
```

Every material unique item receives exactly one disposition:

- `ACTIVE_PORT` — adapt still-valid executable benchmark/test/gate meaning into a current canonical owner;
- `ARCHIVE_CONTENT` — preserve useful evidence/rationale/reproduction/alternate implementation in non-live evidence/history with exact source identity/hash;
- `DROP_TRANSPORT` — discard only transport-only, stale branch-local status, duplicate generated or packaging bytes after proving substantive meaning survives elsewhere.

These dispositions are one-time migration classifications. They do not become a new general lifecycle model.

## 7. Per-ref deletion barrier

A published legacy ref is deletion-eligible only when all applicable rows are proved from fresh provider/source evidence:

1. exact observed tip SHA and ancestry/divergence relative to the D0036 development base are recorded;
2. material unique content is inventoried rather than inferred from branch name or timestamp;
3. every material unique item has exactly one justified disposition;
4. all repository/provider/tool consumers under current control that name the ref have been migrated or proven historical-only;
5. every known still-required exact-object consumer remains reachable from the surviving topology or has an accepted bounded preservation mechanism;
6. the live bootstrap/current router no longer depends on the ref;
7. required source/documentation validation is green immediately before the deletion batch;
8. deletion uses an exact expected-tip/precondition and never a force-update or guessed target;
9. provider reread after the batch proves `main`, `development` and any approved temporary exception anchor remain exact;
10. current route/bootstrap validation passes again after deletion.

An unresolved material item, controllable consumer, required exact object or provider precondition keeps only that ref retained. Unknown external consumers are recorded explicitly; if available evidence cannot bound an externally required branch-name or exact-object dependency, that ref remains a retained exception instead of being guessed safe.

## 8. Provenance and history policy

D0036 compacts refs, not meaning.

- Do not wholesale-merge a divergent concept/research/agent/group branch merely to keep its commits reachable.
- Do not create a permanent Git anchor for every historical branch or checkpoint.
- Already-contained commits remain preserved by ordinary ancestry when reachable from `development`/`main`.
- Useful divergent material is ported or archived forward with original ref/tip/content identity.
- Transport-only bytes may be dropped only after the manifest proves the semantic material is duplicated or preserved elsewhere.
- No `rebase --onto`, force-push, squash or canonical DAG rewrite is authorized by D0036.

## 9. Consumer migration

The migration must inspect and, where applicable, update consumers in these layers before a named ref can retire:

- fixed bootstrap and authority resolver;
- `WORKBOARD.md`, `LINEAGE.md`, `docs/DOCUMENTATION.md` and `docs/development/WORKFLOW.md`;
- maintained tests/validators/CI/workflows/configuration that parse or name route refs;
- provider default/branch settings and branch-protection/rules visible to the available provider plane;
- registered tmcp Project/validation metadata only when it is a current controllable consumer, without treating tmcp metadata as repository authority;
- evidence/history references only when they are live consumers rather than immutable provenance.

Literal branch names inside historical evidence are not rewritten merely to make history look current.

## 10. Failure, recovery and rollback

### Before cutover

If seeding or equality proof fails, `group/f-cloudflare-runtime` remains the legacy authority. Remove no legacy ref and move no default. A newly created seed ref with no independent work may be removed only with exact expected-tip proof if rollback itself is authorized and safe; otherwise retain it as explicit migration debt.

### During dual-resolver bridge

Any old/new resolver disagreement blocks further provider topology mutation. Preserve both refs and evidence. Correct forward under the still-provable authority; do not force one resolver to agree by rewriting history.

### After persistent cutover

Do not roll repository authority back by moving `main` or force-moving the old Group ref. Correct forward on `development`. A deleted ref is recreated only from its recorded exact identity when a separately proven consumer/recovery need requires it and recreation does not create a second current route.

Ambiguous provider writes are reconciled by provider reread before retry. Expected-predecessor mismatch is a failed admission, not permission to force.

## 11. Acceptance matrix

| Gate | Required result |
| --- | --- |
| exact R1 base | fresh D0031 election binds the one cumulative authority before each migration stage |
| selected ref | `development` is absent at acceptance/seed admission, is a valid Git refname, and is created only from the exact fresh cumulative head |
| main immutability | every R1-R3 provider-changing batch rereads `main`; its exact baseline is unchanged by D0036 |
| byte-identical seed | initial `development` and elected cumulative ref name the same exact commit |
| bridge equality | legacy D0031 and new persistent resolver elect the same exact `development@sha` while the old cumulative ref still exists |
| single persistent route | zero or more than one eligible `persistent-v1` published refs fails closed; exactly one is required |
| branch-stable Group transition | changing only the active Group after cutover does not require a new persistent route ref |
| no legacy fallback | after terminal cutover, non-persistent/deleted legacy refs cannot elect or block authority |
| complete disposition | every retiring ref has exact tip/content/consumer/reachability evidence and every material unique item has one disposition |
| exact-object barrier | a ref with a known still-required exact object that would otherwise become unreachable is not deleted |
| no wholesale merge | divergent stale/alternate history is not merged merely for provenance |
| no hidden activation | archived executable material does not become live behavior without its own accepted owner change |
| publication fencing | expected-predecessor/non-fast-forward mismatch fails closed and ambiguous writes are reread before retry |
| deletion batches | source/docs validation passes before/after and provider reread preserves exact `main`/`development` after every batch |
| final topology | provider-visible durable development routes are `main` plus one persistent `development`, except explicitly retained barrier failures that remain named migration debt |
| proof layers | repository/source evidence is not promoted into runtime/deployment qualification |
| main merge | development-to-main merge remains unactivated and requires a separate future user-authorized MVP/operational qualification decision |

## 12. Implementation slices

1. **R2a seed** — fresh-bind authority; freeze the D0036 manifest baseline; create `development` at the exact fresh cumulative head; reread `main`, old route and seed.
2. **R2b bridge/cutover** — implement persistent-route marker/resolver, update current self-development owners and falsifiers, publish a cutover commit on `development`, and prove legacy/new resolver exact equality before default alignment.
3. **R2c curated absorption** — enumerate fresh provider refs, inventory divergent material and consumers, port/archive only selected material as forward commits, and freeze exact disposition evidence.
4. **R3 bounded retirement** — remove only refs that satisfy the barrier in bounded batches; reread provider state and rerun route/source validation after each batch; retained exceptions remain explicit.
5. **verification** — remove legacy fallback/current predecessor dependency, prove one persistent route, freeze the manifest, mark D0036 verified only from executed source/provider evidence, and keep `main`/runtime proof boundaries explicit.

R4 structured-governance refactoring and R5 conditional owner/projection cleanup from the ACR convergence are not silently bundled into D0036. They require their own then-current owner/lifecycle classification after route shape stabilizes.

## 13. Cheapest falsifiers

Before destructive ref retirement, the cheapest decisive failures are:

1. provider `main` differs from the D0036 baseline;
2. `development` already exists at a non-equal SHA before seeding;
3. seed is not byte/commit-identical to the fresh elected cumulative head;
4. legacy and persistent resolvers disagree during bridge;
5. two published refs carry a valid `persistent-v1` self-declaration;
6. a retiring ref contains material unique content with no disposition;
7. a known controllable branch-name or exact-object consumer still requires a retiring ref;
8. a deletion batch changes `main` or the surviving `development` head unexpectedly;
9. source/documentation validation fails after route-owner changes;
10. any step proposes a force rewrite, wholesale historical merge or development-to-main merge as a shortcut.

Failure blocks only the dependent migration/ref batch unless it invalidates the accepted D0036 owner model itself.
