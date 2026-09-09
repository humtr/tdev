# Design 0046 - Minimum Viable tdev MCP Experiential Path

- Status: `implementing`
- Revision: 8
- Class: 2
- Decision date: 2026-09-09
- Acceptance base: `development@33400f2f7ab13015f7a5699068a128ae1081ee06`
- Predecessor revision: D0046@r7 made one complete ChatGPT-to-tdev Case/Drive/Agent/validation/Promotion loop the product gate, but its selected operation was still mandatory D0043@r4 Codex model execution. Revisions 1-7 and all provider/recovery/Codex-backed evidence remain immutable historical evidence for their exact scope.
- Trigger: `DIRECTIVE.md@r1` requires the first public v1 core to use ChatGPT as the only required intelligence, with Codex optional. Exact-source review confirms the current convenience path still hard-codes a model Task and caller validation profile. The experiential owner must therefore preserve the successful distributed backbone while replacing the mandatory model leg with D0043@r5 deterministic typed-operation execution.
- Acceptance evidence: `docs/evidence/group-f-d0046-r8-chatgpt-native-experiential-gate-acceptance-2026-09-09.json`
- C0 source/Agent-preflight evidence: `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`
- Scope: the isolated authenticated MCP owner composition, preserving deployment/readback order, current-client handoff and final user-experienced no-Codex development proof for first public v1.
- Affected owners: `docs/ARCHITECTURE.md`, `docs/MCP.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, provider manifests/adapters and focused end-to-end evidence.
- Preserved owners: D0019 remains sole Case/Task/Attempt/result/Promotion authority; D0042 remains durable drive; D0020/D0027 remain Agent delivery/local execution; D0023 owns the public MCP v1 schema; D0024 owns authentication; D0043 owns semantic typed operations/bindings; D0047/D0048 own lazy context identity; D0025 owns optional later Git publication.
- Explicit non-goals: no direct Case/Drive/Agent bypass; no filesystem canonical-checkout or remote-Git publication in the first experiential proof; no new scheduler/result owner; no generic shell; no mandatory Codex qualification; no multi-tenant/hostile-local-code claim; no tmcp superiority/retirement claim; no extra recovery/qualification architecture as a substitute for product completion.

## 1. One-line definition

The first public-v1 experiential gate is one real current-client run in which ChatGPT reads bounded repository context, discovers the typed-operation contract, authors the actual ChangeSet, and then uses the existing Case -> Drive -> AgentDelivery/local Agent -> deterministic typed result -> owner-required validation -> D0019 Promotion path to a terminal success with Codex disabled or unavailable.

## 2. Revision-8 correction

Revision 8 keeps the core insight of Revision 7: internal source/package/provider milestones are evidence, not product completion, and Promotion is part of the user-visible exit. It corrects only the accidental executor specialization.

The Directive-triggered mismatch reopened the affected Revision-7 mandatory-model meaning during this acceptance review. Prior Codex-backed successful Cases remain valid demonstrations that Case/Drive/Agent/candidate/validation/Promotion infrastructure can work. They do **not** prove the corrected first-release core because intelligence was delegated to Codex.

No earlier Case is rewritten. No successful Codex evidence is relabelled as a no-Codex result.

## 3. Required first-release path

The highest-priority path is now exactly:

```text
authenticated web ChatGPT
  -> development_context_get/list/search/read
  -> operation_list / operation_get
  -> ChatGPT reasons about the source and authors typed ChangeSet writes
  -> development_start selecting tdev.operation.repository.changeset.compose.v1
  -> D0019 Case
  -> D0042 durable drive
  -> D0020/D0027 AgentDelivery + local Agent
  -> deterministic D0043@r5 ChangeSet result (no model process)
  -> disposable exact-base candidate
  -> owner-required tdev.operation.repository.candidate.validate.v1
  -> D0019 Case-native Promotion
  -> development_get / case_promotion_get / terminal owner readback
```

The same backbone may later run optional `tdev.operation.repository.change.generate.v1` through a Codex binding, but that is an interoperability path and cannot substitute for this core proof.

## 4. What ChatGPT and the Agent each own

ChatGPT is the intelligence on the core path. It:

- obtains an owner-issued immutable context reference;
- uses bounded context list/search/read operations to understand the repository;
- reads the exact semantic operation contract with `operation_list/get`;
- decides the actual source change;
- submits the exact typed `baseDigest` plus `writes[{path,content}]` for deterministic ChangeSet composition.

The local Agent does not perform model reasoning for this path. It:

- verifies the Case/Attempt/fence/capability and exact operation contract;
- validates/normalizes base, path, scope, duplicate and size bounds;
- returns the normal result-only ChangeSet through AgentDelivery;
- materializes the disposable candidate under existing runtime/warden rules;
- runs owner-required validation;
- returns bounded evidence/results for Case acceptance.

D0019 Promotion alone advances the Case semantic canonical tree. Neither ChatGPT, MCP nor Agent writes canonical authority directly.

## 5. Public MCP/client acceptance

The client-visible contract is D0023@r4:

- surface identity remains `tdev.mcp.surface.v1`;
- exactly sixteen final public tools are advertised;
- every tool reports `openWorldHint:false`;
- `case_drive`, `case_promotion_get`, `development_start` and `development_get` replace their trial-only names;
- `operation_list` and `operation_get` provide catalog discovery without adding per-operation MCP tools.

The expected interaction is one top-level `development_start` mutation followed by read-only state/context/projection calls as needed. D0042 continues durable progress/re-drive server-side; ChatGPT should not have to resubmit a mutation merely to make each internal step continue.

`openWorldHint:false` is tested as client metadata only. The experiential gate observes whether the repeated approval prompts attributable to the former `openWorldHint:true` descriptors disappear. If the ChatGPT platform still asks for a confirmation for another policy reason, record that separately; do not weaken tdev authorization/effect/fencing rules or revert the annotation to explain client behavior.

## 6. Source/Agent preflight — C0

Before provider/client use, source and Agent-package evidence must prove the corrected core locally without Codex:

1. core runtime/catalog construction succeeds when Codex executable, saved authentication and Codex-specific configuration are absent;
2. the final sixteen-tool MCP manifest is exact and all annotations have `openWorldHint:false`;
3. `operation_list/get` project the D0043@r5 catalog under bounded schemas;
4. `development_start` binds one selected semantic operation ID/version/contract digest into a normal Case Plan and does not accept caller validation selection;
5. `repository.changeset.compose.v1` rejects malformed, stale, duplicate, unsafe or out-of-scope writes and returns the existing deterministic result-only ChangeSet for legal input;
6. candidate materialization and owner-required validation use the exact accepted ChangeSet/base identity;
7. no model subprocess is spawned on this path;
8. Promotion remains the only canonical writer and the complete configured source gate passes.

Failure in C0 is corrected at D0023/D0043 or unchanged lower owner; it is not papered over with provider probing.

## 7. Preserving deployment/readback — C1

After C0 is green, update only the already-selected isolated provider/Agent composition needed for the final v1 contract. Reuse existing D0019 Case, D0042 Drive, D0020/D0027 Agent and D0024 authentication owners unless fresh evidence reaches one of those contracts.

Before mutation:

- fresh-read the exact `development` source and provider generation;
- prove Agent/package route quiescence or compatible legacy handling for any old nonterminal profile-bound Case;
- preserve provider namespaces, credentials, Case/Agent identity and unrelated routes;
- bind the new semantic catalog and no-Codex-capable Agent release;
- deploy/read back the exact sixteen-tool v1 surface and required owner bindings.

Do not create a new qualification controller, extra Durable Object owner, second MCP endpoint architecture or diagnostic subsystem just to prove this correction. Existing preservation/deployment owners are sufficient unless they fail a concrete falsifier.

A provider response loss is reconciled by exact version/config/readback, never a blind retry.

## 8. Current-client experiential proof — C2

Only after C0/C1 are green, perform one bounded current-client proof against one exact published tdev base with Codex disabled or unavailable.

The development objective must be a real non-documentation source change with a focused regression and repository-required validation. It must not be a canned patch, no-op, documentation-only edit, manual out-of-band edit or result imported from tmcp/Codex.

Required observations:

1. ChatGPT authenticates to the exact read-back D0024 resource.
2. `tools/list` exposes exactly the sixteen D0023@r4 names and every descriptor has `openWorldHint:false`.
3. ChatGPT obtains the immutable context reference and uses bounded context tools to understand the relevant code.
4. ChatGPT discovers/reads `tdev.operation.repository.changeset.compose.v1` and itself constructs the exact legal typed writes.
5. `development_start` creates one D0019 Case bound to that semantic operation and one D0042 drive intent.
6. The Task traverses D0042 -> D0020/D0027 -> local Agent and returns a non-empty result-only ChangeSet without a model process.
7. The disposable exact-base candidate matches the ChangeSet and owner-required validation passes.
8. The same Case reaches successful D0019 Promotion.
9. `development_get`, `case_promotion_get` and terminal Case readback agree on base/result/candidate/validation/Promotion identities.
10. independent runtime evidence shows Codex executable/auth/config was not required and no model subprocess was spawned.
11. repeated approval prompts attributable to the former open-world annotation are absent; any remaining platform confirmation is separately classified.
12. no filesystem canonical checkout, Git ref, unrelated Case/provider owner or credential is mutated.

Only this C2 result closes the Directive's core experiential objective.

## 9. Case continuity, response loss and cleanup

A nonterminal or ambiguously observed request stays bound to the same request/Case/Attempt identities. Response loss, Worker restart, Agent reconnect or Drive replay rereads authoritative owners and never creates a new Case merely because a client response disappeared.

Once D0019 authoritatively records terminal failure, that Case remains failed evidence. A later bounded attempt may use a fresh Case/request after exact terminal readback; failed Cases are never resurrected to manufacture success.

Malformed/stale/out-of-scope ChangeSet input, required-validation failure or cleanup uncertainty yields no Promotion. Process/workspace/candidate uncertainty remains explicit and blocks unsafe reuse. Client disconnect does not release semantic claims or invent completion.

## 10. Authentication and credential separation

D0024 remains the external authentication owner. Web credentials terminate at ingress and never enter Case, Agent operation input or evidence. Agent credentials remain local to D0020/D0027. The no-Codex core path has no model credential domain at all.

Optional Codex interoperability, if later invoked, reuses its separately accepted trusted-local credential boundary from D0043 history. Codex credentials are never copied into MCP/Case and their absence cannot make core development unavailable.

## 11. Compatibility and rollback

Existing provider generations and immutable Cases using the old Revision-7/profile-bound recipe remain historical under their original semantics. C1 must either retain an exact legacy handler for any still-live old Plan or wait for positive quiescence before removing it. There is no in-place reinterpretation into `changeset.compose`.

The isolated trial/provider route may be disabled or rolled back only to a generation that can still read any live durable state it owns. Canonical/Git publication remains outside this first experiential proof. Stable endpoint cutover is a later bounded decision after the corrected path works; it is not a shortcut for C2.

## 12. Optional Codex follow-on

Only after the no-Codex C2 proof is green may the project optionally select `tdev.operation.repository.change.generate.v1` and requalify its Codex binding through the same Case/Drive/Agent/result/validation/Promotion backbone.

That check proves interoperability only. A Codex failure does not reopen the core path unless it reveals a shared D0019/D0042/D0020/D0027 defect. A Codex success cannot replace the no-Codex completion evidence.

## 13. Acceptance matrix and cheapest falsifiers

| Area | Minimum required result |
| --- | --- |
| intelligence | ChatGPT itself reasons about and authors the real source ChangeSet |
| no-Codex | core runtime and C2 complete with Codex executable/auth/config absent and zero model subprocesses |
| MCP | exact sixteen-tool v1 surface; every tool `openWorldHint:false` |
| operation discovery | ChatGPT can list/get the semantic operation without public tool proliferation |
| execution | selected ChangeSet operation traverses Case -> Drive -> AgentDelivery -> local Agent -> typed result |
| result-only | ordinary work cannot mutate Case canonical authority or Git |
| validation | repository/release owner-required validation passes; caller cannot weaken it |
| promotion | D0019 Promotion succeeds and is the sole canonical writer |
| identity | exact principal/tenant/Case/Attempt/base/context/operation-contract/binding/result identities are preserved |
| response loss | no duplicate Case/Attempt/operation from reconnect or missing response |
| compatibility | old Cases keep old semantics; no profile alias masquerades as migration |
| approval UX | former open-world-derived repeated prompts are absent or any remaining platform confirmation is separately classified |
| user burden | user supplies MCP connection/auth and development objective; internal provider/Agent work is not delegated to them |

Cheapest decisive falsifiers are: Codex required to start or complete core development; a model process spawned for `changeset.compose`; fewer/more than sixteen public tools; any `openWorldHint:true`; caller-selected validation weakening the required gate; manual/out-of-band source edit; direct result ingress bypassing Agent; validated candidate reported complete while Promotion is pending/failed; duplicate execution after response loss; or a historical Codex PASS presented as the corrected C2 proof.

## 14. Rejected alternatives

### Keep Codex as the mandatory product gate because it already passed once

Rejected. That proves useful executor compatibility, not the owner's required architecture.

### Let ChatGPT submit a ChangeSet directly to Case

Rejected. ChatGPT is the intelligence, not a new result authority. Its authored bytes still traverse the existing Agent execution/delivery path.

### Add more qualification/recovery machinery before trying the corrected path

Rejected. Existing owners already proved the distributed backbone. New machinery is justified only by a concrete falsifier at its responsible boundary.

### Require Git publication for the first experiential proof

Rejected. D0019 Promotion is the semantic completion boundary for this checkpoint; D0025 publication is a separate later effect.

## 15. Follow-on gate

Revision 8 is implementing. C0 source/Agent preflight is green and published by `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json`. C1 preserving deployment/readback is also green and recorded by `docs/evidence/group-f-d0046-r8-c1-preserving-deployment-readback-2026-09-09.json`; existing provider/Agent/auth owners were preserved, and an older unknown-effect held delivery remains a deliberate safety fence rather than being rewritten. The next routed gate is C2, which must use a fresh current-client manifest/connection before starting one bounded no-Codex experiential Case. Optional Codex interoperability follows only after the no-Codex core C2 proof succeeds.
