# Phase A accepted cutover and Phase B resume

Phase A ends at the user's ChatGPT Refresh boundary. The same-origin dev-2 backend
is usable; this is not first-release completion. DIRECTIVE r3 and accepted
D0001-D0007 remain the authority. WORKBOARD owns execution order only.

## Exact source and authority

This takeover freshly bound remote dev-2 HEAD
`6832ee5885a8ca5e25655a45e918a0a0ce8f0938`, parent
`ae522036feb03a82dd79df2789cf71df6f48ab32`, tree
`7eeab0d59819bb48a1407430ff15182f075c0c63`. The earlier Phase A authoring session
began at that parent and had already deployed the HEAD before interruption.
Fresh provider readback, not its report, established current runtime truth.

The direct requirements were already durable in Directive r3: same-origin cutover,
no old live baseline/continuity requirement, cutover-first sequencing and all four
ChatGPT metadata hints. D0006 now records the narrow provider-required removal of
one obsolete old-product trial binding. Architecture's implementation projection
and comparison wording are synchronized; accepted topology/security is not reopened.
The installer now constructs the complete scoped owner grant through a tested helper,
matching the already-installed configuration. Missing installation/path fields were
not worked around by relaxing authorization. A repeatable verifier now compares
actual provider config, immutable artifacts, descriptors and fixed native readback.

## Cutover and current observation

Public MCP: `https://tdev.humtr.workers.dev/mcp`.
The Worker `tdev` now runs dev-2 through routing-only Dev2RendezvousDO to the native
outbound device connection; existing Access Managed OAuth registration is retained
with verified issuer/application audience/domain/policy. Human assertion verification
still occurs at both edge and native dispatch. Device keys cannot authenticate /mcp.
Preview routing is disabled. Old tools are not aliases to the new four.

`provider-cutover.json` is the preserved actual mutation record, not a new measurement.
It records replacement of the old version with the dev-2 version. Cloudflare required
retiring the old local CaseAgentDriveRuntimeDO namespace. The old tdev-mcp-trial had
one binding to that namespace; `prior-trial-detach.json` records removal of only that
binding, preservation of the other 29 bindings, and no source/Access/credential change.
No old Case migration, compatibility layer, baseline repair or parallel hosting was
introduced. Predecessor Git branches/history and unrelated provider resources remain.

`provider-readback.json` and `installation-readback.json` are fresh reads in this
completion session, including actual provider configuration equality, version/route,
exact schemas/hints, connected native state and bounded current repository reads.
`reconnect.json` separately proves actual native runit restart and outbound reconnect,
owner epoch 3 -> 4, unchanged installed code/schema and successful reads afterwards.
It does not claim a physical Android sleep/reboot trial or recovery of nonempty work.

| Observed identity | Value |
| --- | --- |
| Active edge version | c00d6eb8-e6a0-4ca4-99bc-f6539077feed (100%) |
| Active deployment | 66fee9cb-ba72-48d6-8fc6-e97097da39d9 |
| Installed source | sha1:6832ee5885a8ca5e25655a45e918a0a0ce8f0938 |
| Schema | sha256:0de1e538b40c866a3a91acfdc70eba89c09902972daf65fca0688c61ac0de25c |
| Edge bundle | sha256:dfb19669b05183d95b0c62dacb3f4245c723a4ab72ca48007a98962ab93bfc92 |
| Device bundle | sha256:f3724b09bd39eb9e5227faab66928db78e76574e8854df035a740522609d1e8f |
| Native environment | Android arm64, Node 24.18.0, SQLite 3.53.4, Git 2.55.0, Python 3.14.6 |

These are dated observations, not fixed deployment authority. Resolve the current
private installation selector, then verify provider/runtime again for any mutation.
In this installation the stable selector is `$HOME/.config/dev2/installation.json`;
it contains the actual private release/config/service paths. Bundles, config,
credentials, repository objects and work SQLite are outside all development worktrees.
The service is default-up. Do not print or commit config/credential contents.

Current repository HEAD will be the enclosing published commit or a later fresh
successor; installed source remains the recorded bootstrap commit. Final source
changes concern installer/readback/tests/docs, and both runtime rebuilds have the
same exact deployed digests (`build-identity.json`). No redeploy merely to relabel
identical runtime bytes is necessary. Source HEAD is not activeRelease proof.

## Frozen public contract and immediate capabilities

Exactly dev_context, dev_read, dev_work, dev_observe. All four publish
`readOnlyHint:true`, `destructiveHint:false`, `idempotentHint:false`,
`openWorldHint:false`, matching the user's explicit policy and fresh tmcp metadata.
This metadata supplies no internal capability or mutation authorization.

The same frozen contract covers all ten work operations: create, edit, run,
validate, integrate, cancel, resume, policy.adopt, release.stage, release.activate.
Closed input/output schemas, tagged edits/selectors, bounded error facts, request
identity/retry, exact prepared-result/effect projection and runtime identities are
already published. Backend completion must use those operations, not refresh the
client simply to expose the next implementation layer. A real incompatible change
still requires owner revision and explicit client verification, never hidden drift.

| Capability | Installed state |
| --- | --- |
| Current repository/provider/ref/HEAD/context | Implemented; reads actual bound remote, not a chat snapshot |
| Bounded snapshot/candidate list/search/file/diff | Implemented with exact IDs, path scope and budgets |
| Create/edit/cancel work | Implemented with durable SQLite identity, generation/revision fencing and request dedup |
| Open/request/work/action/runtime observation | Implemented; no mutation by polling |
| Validate/integrate preparation | Partial: retains exact frozen result and reports EXECUTION_UNAVAILABLE while execution is unsealed; no fake receipt or Git publication |
| Named profile run | Unavailable until managed executor wiring/seal |
| Resume interrupted external effect | Unavailable pending native reconciler; never invent a new sender |
| Policy adoption and qualified stage/activate | Unavailable pending implementation and required proof |

Full hosted execution, canonical-writer assurance and qualified activation are
Phase B frontiers, not missing public operation names. At readback the actual
native instance has capacity 8, no open works/reserved/executing actions, and no
production execution seal. The implementation can immediately prepare source changes
through dev-2; unsupported execution/publication still needs a bounded authorized
bootstrap bridge until those existing operation implementations are completed.

## Validation and limits of proof

`validation-summary.json` indexes exact receipts and artifact digests. Core's 134
tests, JSDoc typecheck and selected-Design checker pass. The original completion's 40 joined native/edge
integration fixtures passed: real native Git/SQLite/source changes, prepared-result
reuse, local exact CAS, transport reconnect, dedup, authentication rejection and
explicit unsealed execution outcomes. These are operator-reviewed fixtures, not
production hosted receipts. The official integration/release/live/benchmark profiles
remain NOT RUN/unimplemented, not PASS inferred from a focused subset.

The final test-only source join is recorded separately in `joined-verification.json`: core 134/134 and native/edge 43/43 PASS, including three new public-contract fixtures that prove source preparation and request recovery without unsealed execution or publication. The original 40-fixture completion receipts remain unchanged. Four documented Phase B first-call argument shapes also pass the frozen schema validator. No runtime, schema or eligibility semantics changed in this join.

The deployed fixed installation probe successfully binds current context, reads
AGENTS/WORKBOARD and observes runtime/open work through the actual device route.
The server's exact discovery descriptors and runtime identity match the frozen
contract. /mcp is reachable and rejects missing auth, a device credential and a
forged assertion; the private installation route also rejects missing credentials.
Protected-resource metadata identifies the correct resource and issuer.

A successful human OAuth tools/list/tools/call through the refreshed ChatGPT client
is NOT RUN. The fixed installation credential cannot supply a human principal or
invoke arbitrary mutations, and was never used that way. Local gateway protocol
fixtures plus live installation discovery do not pretend to be a human transcript.
Do not force new names through the old ChatGPT frozen action snapshot.

During completion an added verifier initially compared null-prototype parsed grant
objects to ordinary JS objects using strict deep equality and failed despite equal
fields. Canonical encoded equality fixed this verifier-only error; final live checks
pass with no authorization or installed configuration changes. No unresolved Phase A
failure or external permission blocker remains.

## Phase B first action: no prior chat required

After user Refresh, call the actual new dev_context with
`{"apiVersion":1,"repository":"self","freshness":"current"}`.
Use its returned snapshotId in dev_read, target freshness=current, to read AGENTS.md,
DIRECTIVE.md, RULE.md, WORKBOARD.md and this README; expand current selected Designs
and the relevant source with bounded queries. Do not hard-code this record's HEAD.
Then call dev_observe with `{"apiVersion":1,"selector":{"runtime":true}}` and
`{"apiVersion":1,"selector":{"open":true}}`. Inspect request selectors before
replacing any uncertain work. Confirm source/installed/edge/schema and unsealed
capabilities independently. These calls establish the actual human OAuth/client proof.

The dependency graph and next implementation scopes are in WORKBOARD B0-B5. Start
with managed execution session/controller/receipt wiring and containment, while
independently verifying the exact provider exclusive-writer/CAS boundary. Use dev-2
for source reads and candidate create/edit now; only unsupported execution,
publication or qualified activation may use a bounded recorded bootstrap exception.
Do not restart architecture or repository-context bootstrap through tmcp by default.

## Provenance and resource boundaries

This completion used tmcp authorized project-local shell for native readback/tests,
reviewed source changes, service restart, exact Git publication and Cloudflare reads;
GitHub for fresh remote authority/publication checks. Earlier mutation records are
preserved explicitly as historical. No new model agent was launched. No benchmark
or production performance superiority is claimed. Old tdev comparison uses preserved
source/architecture/history, bounded reproducible or analytical evidence; tmcp can
be measured where currently available. Old live availability is not restored.

The final published worktree is coherent. Four pending files from the interrupted
owner were reviewed and retained, not lost; its old directory and all unrelated
workspaces remain preserved but are not runtime/resume dependencies. Private IDs
must be read from installation state and dated evidence, never elevated into
Directive/Design constants.
