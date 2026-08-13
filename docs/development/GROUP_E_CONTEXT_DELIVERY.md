# Group E execution contract — context delivery and model input

> Current Capability Group execution owner for `group/e-context-delivery`. This file prepares Codex/agents to take Group E from the verified D0014/D0015 baseline to the Group E checkpoint exit without preselecting an implementation mechanism.

## 1. Identity and branch

Group:

```text
E — Context delivery and model input
```

Active cumulative branch:

```text
group/e-context-delivery
```

Creation predecessor:

```text
mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
```

`mvp-1a-7` is the retained cumulative legacy baseline through D0015. Group E is the first post-D0015 cumulative checkpoint branch. **Do not integrate Group E back into `mvp-1a-7`.** When Group E is complete, retain its exact final head as the Group E checkpoint and create `group/f-cloudflare-runtime` from that exact head.

Branch succession is owned by `docs/development/BRANCH_LINEAGE.md`.

## 2. Starting authority and verified baseline

Do not redesign already verified semantics without a falsifier.

Retain:

- D0010 Case head / semantic root / Plan `baseDigest` as semantic/current-state authority;
- D0011/D0012 Git representation/publication as derived;
- D0013 repository/model transport result-only boundary;
- D0014 exact-base bounded preparation reuse, early bounds, unique-blob reads, Git cancellation, POSIX process lifecycle and non-blocking observations;
- Task retry ownership in existing Task/Attempt semantics;
- full-context semantic equivalence until an accepted Design explicitly changes model-visible input.

D0014 remains verified. Its retained cache bounds complete entries, not all concurrently pending different-base live work. That aggregate live-work budget is a future executor/Agent admission concern, not permission to change D0014 semantic authority.

## 3. Group E problem statement

D0014 removed most repeated repository preparation for exact same bases but did **not** remove:

- one complete canonical repository request per Attempt;
- repeated request copy/assembly/transport/receiver parsing;
- one model/executor invocation/start per Attempt in the current local profile;
- full-repository disclosure to the model/provider;
- provider-specific authentication, token, billing, network and privacy costs, which remain unmeasured.

The next question is therefore not "implement ContextSlice". It is:

> Which deterministic delivery/execution structure removes the largest remaining verified per-Attempt cost and disclosure risk with the smallest correctness/authority burden?

## 4. Group E Design sequence

### D0016 — decision gate

Status: accepted 2026-08-11. The measured decision selects an immutable full-context reference envelope; receiver representation is intentionally deferred to D0017.

Measure and compare at least:

1. full-context immutable reference transport;
2. immutable manifest + content references;
3. deterministic ContextSlice;
4. warm executor/process;
5. streaming/lazy delivery;
6. staged/hybrid approaches, especially full-context references first followed by remeasurement before semantic input reduction.

Do not choose by elegance or expected architecture. Choose from post-D0014 evidence.

### D0017 — selected delivery contract

Status: **accepted Design — 2026-08-12; production source independently verified on the supported-Termux source scope**.

D0017 freezes one representation-independent logical reference identity over exact repository commit, semantic base, repository `contextDigest` and admitted Case/Plan authorization scope. Attempt identity and physical locators are excluded so retry/restart can preserve one logical reference without making it a bearer credential. The first receiver representation is bounded packed/hybrid; resolution is complete-semantic and fail closed for unauthorized, stale, missing, corrupt and limit-exceeded conditions. Receiver-local materialization remains derived/rebuildable and does not activate D0022.

Design evidence: `docs/evidence/group-e-d0017-context-delivery-contract-2026-08-12.json` (SHA-256 `a901816ada0d25858bcc78b94a2dc091376c34c004e6041027e22a5ddf9a3ca2`). Production implementation `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db` is independently verified on the supported-Termux source scope by `docs/evidence/group-e-d0017-production-verification-2026-08-12.json` (SHA-256 `ea9371c467dd5b1d86ddbfb97b81109c0d1b0885186610f04b92bb753cd1b907`). Focused D0017+transport tests passed 52/52 and the supported-Termux source suite passed 226/226; exact all-test coverage remains platform-unqualified only because the pre-existing ImmutableJournal hard-link tests hit `link(2) EACCES`. This closes D0017 production-source verification. D0018 production source/runtime is independently verified below; final Group E publication, replica reconciliation and checkpoint election remain separate.

### D0018 — final model executor/provider boundary

Group E cannot claim final product closure while the chosen context contract exists only in a synthetic local transport if the accepted final runtime crosses a different provider/executor boundary.

D0018 is shared D/E work and must bind the selected context delivery to the final execution profile while preserving result-only acceptance, Attempt identity, cancellation, retry and resource semantics. Even though D0018 affects Group D/E capability ownership, its accepted work remains on the active Group E cumulative branch; no separate D or E history is later merged.

D0018 is accepted at the Design layer with verdict `warm-host-qualified-model-attempt-fresh` and its production source/runtime is now verified on the declared supported-Termux trusted-local scope at `73d404bdc24eac8337019738ba074c2a1fea4861`. Exact reusable state remains limited to the bounded immutable D0014 `GitRepositoryModelExecutor` preparation/cache; D0017 logical authorization/reference/carrier/request state, live controller/deadline and model process/module/session state are per-Attempt. W01-W43 rejects the tested same-process WP profile and leaves WI/provider-session candidates unavailable. The verified C1-C4 implementation adds committed-Event wake observation as non-authoritative liveness, exact live-control fencing, durable `attempt_started` checkpoint before live-controller publication, pre/post-publication and pre-execution authority checks, exact persisted-revision checkpoint drain, and runtime-slot retention through predecessor cleanup/settlement. Pre-fix regressions remain recorded separately from post-fix qualification. Final adversarial evidence is `docs/evidence/group-e-d0018-final-adversarial-qualification-2026-08-12.json` (SHA-256 `70f6fe7bdfe2554cbc79068ab55b51d31dc93bbbaf22e02eca640881fc973033`); production verification is `docs/evidence/group-e-d0018-production-verification-2026-08-13.json` (SHA-256 `2a1f53043c326ada9618d54ffc8d114b1666f2c25986226637287190948216b7`). Exact supported source passed 233/233 and the adversarial reference protocol 27/27; exact full hard-link and instrumented-coverage layers remain explicitly unqualified rather than green.

### D0022 — conditional storage dependency

D0022 becomes a Group E dependency only if D0016/D0017 selects a content-reference design whose correctness or availability requires durable/shared content storage or query projection.

Do not add R2/D1 merely because they appear in the program. If Group E can close without them, leave D0022 conditional for later runtime/artifact needs inherited by subsequent cumulative Group branches.

## 5. D0016 measurement contract

D0016 was accepted only after the following matrix was executed by the repository-owned falsifier. The raw evidence is `docs/evidence/group-e-d0016-context-delivery-2026-08-11.json` (`sha256:ba4dbfe09dd05a48c741a384316f1e9755409ab1369335ebe898d2269537c495`). The matrix separates at least:

- parent repository preparation already addressed by D0014;
- per-Attempt canonical request construction/copy;
- bytes transferred to receiver/provider;
- receiver full-body parse/materialization;
- process/provider startup/initialization;
- retry amplification;
- same-base versus multibase locality;
- cold/no-cache versus warm/reference paths;
- sampled parent memory plus clearly scoped child/provider observations where measurable;
- disclosure volume and secret-sensitive content handling when an external provider is involved.

Required workloads:

- actual repository same-base 1/2/4/8;
- multibase 2/4/8;
- retry 0/1/2/3;
- cold restart;
- capacity-plus-one locality stress as a boundary observation, not a production workload claim;
- representative large/many-small/deep/wide repository shapes where the selected mechanism is sensitive;
- cancellation and request/input limit rejection;
- at least one real receiver/process/provider path for any claim about receiver/provider cost.

Use operation/byte counts for causal structure and wall time only as bounded comparative evidence. Do not call small benchmark rates sustained throughput or small sample percentiles production SLOs.

## 6. Candidate acceptance questions

For every candidate answer:

1. Does model-visible semantic content change?
2. If not, can byte/copy/parse reductions be proved while preserving exact request meaning?
3. If yes, what completeness contract prevents omission of required context?
4. What exact identities bind commit, `baseDigest`, preparation/manifest/slice and instruction?
5. What happens on missing/corrupt/stale references?
6. What happens after restart or cache loss?
7. Does retry produce the same semantic input identity?
8. What is the explicit fallback or fail-closed behavior?
9. Does the candidate introduce a durable owner, publication protocol, GC or migration burden?
10. Does it expose repository data to a new trust boundary?
11. Which measured post-D0014 bottleneck does it remove?
12. What is the cheapest falsifier that would reject it?

A candidate that cannot answer these questions is not ready to implement.

## 7. ContextSlice additional contract if selected

A deterministic ContextSlice must define at minimum:

- exact immutable commit and authoritative `baseDigest` binding;
- instruction/purpose digest binding;
- deterministic seed selection;
- dependency/reference expansion rules;
- deterministic ordering;
- file/count/byte limits;
- source/generated/large/binary/unsupported entry policy;
- empty selection behavior;
- overflow behavior;
- slice digest/profile/version;
- retry, restart, cold and cache-hit equality;
- stale-base and stale-slice rejection;
- explicit full-context fallback or explicit fail-closed behavior;
- auditability of why every file was included/excluded;
- representative full-context versus slice correctness/quality falsifier.

Token/cost savings alone cannot qualify ContextSlice if correctness/completeness evidence is weak.

## 8. Accepted D0017 full-context reference contract

D0017 now answers the reference questions that D0016 left open. The normative exact contract is `docs/design/0017-selected-context-delivery-contract.md`; this Group owner records only its routing summary:

- logical profiles: `tdev.selected-context-reference.v1` and `tdev.selected-context-reference-scope.v1`;
- reference identity: exact immutable repository commit + semantic `baseDigest` + repository `contextDigest` + authorization-scope digest;
- authorization scope: admitted `caseId` + `planDigest` + `caseContractDigest`; the reference is not a bearer credential;
- retry/restart: `attemptId` is excluded, so exact retries retain the same logical reference;
- product/API boundary: raw local paths, physical storage locators and representation kind are excluded from the logical reference;
- receiver representation: bounded packed/hybrid, with 128 files/pack, 2 MiB semantic bytes/pack, 3 MiB stored bytes/pack, 512 KiB manifest, at most 790 packs, plus inherited repository semantic bounds;
- failure classes: unauthorized/stale/missing/corrupt/limit-exceeded all fail before model acceptance;
- cancellation: partial resolution has no accepted effect and incomplete temporary state is discarded/cleaned;
- retention/expiry: receiver/executor-owned derived local materialization only; no D0022 durable/shared owner is activated;
- time: resolution consumes the existing finite invocation/executor deadline and AbortSignal budget; D0017 invents no separate unbounded phase;
- rollback: explicit deployment rollback may restore the current full-inline implementation, but a live missing/corrupt reference cannot silently fall back per request.

Reference transport and a future ContextSlice remain complementary layers, but ContextSlice is not selected by D0017.

## 9. Warm/streaming execution contract if selected

A warm executor/process must not gain semantic memory by accident. Define reset/isolation boundaries, Attempt identity, cancellation, crash/restart behavior and stale-state rejection.

Streaming/lazy delivery must define exact final semantic input identity, partial-failure behavior, byte limits and backpressure. A stream cannot silently change which repository content the model receives.

## 10. Security boundary

D0014 is a trusted-local subprocess profile. External provider adoption changes the trust/data-egress boundary.

Before sending repository content externally, D0018 or the selected Group E contract must address:

- provider authentication;
- tenant/Case authorization where applicable;
- minimum-necessary disclosure;
- repository secret/redaction policy;
- excluded credentials/environment values;
- request/content limits;
- provider logging/retention/privacy/residency assumptions;
- tokenizer/accounting/billing observations where product decisions rely on them;
- retry charging and ambiguous provider errors;
- audit record that does not itself leak secret content.

No secret value belongs in Plan input, semantic Events, Case snapshots, evidence, repository files, observations or clear remote intents.

## 11. Group E exit criteria

Group E is complete only when all applicable conditions hold:

1. D0016 is accepted from measured post-D0014 evidence and rejected alternatives are explicit.
2. D0017 is verified if the decision requires a new context-delivery contract.
3. The selected final executor/provider boundary in D0018 preserves the Group E contract in the actual accepted runtime profile.
4. Exact commit/`baseDigest`/delivery identity and stale rejection are closed.
5. Retry/restart/cache-loss equivalence is closed.
6. Input/request/resource bounds fail closed before unacceptable model/provider work where practical.
7. Cancellation cannot leave hidden authoritative or unbounded live work under the selected runtime contract.
8. Provider data-egress/security requirements are closed when an external provider is selected.
9. D0022 is either verified as a required content-storage dependency or explicitly remains unnecessary/conditional.
10. Focused, full source and applicable provider tests pass from exact source identities.
11. Evidence distinguishes measured facts, inference, unknowns and unsupported environments.
12. Product owners and `docs/ROADMAP.md` remain consistent with the final accepted mechanism.
13. The exact final `group/e-context-delivery` head is elected and recorded as the cumulative Group E checkpoint; it is **not** merged back into `mvp-1a-7`.
14. Termux/GitHub/working-mirror replicas of Group E are reconciled enough to trust that checkpoint head; nonessential remaining sync debt is reported explicitly.
15. Only after checkpoint election may `group/f-cloudflare-runtime` be created, and it must be created from the exact final Group E SHA.

## 12. Codex execution loop

Codex or another coding agent should execute Group E in this order unless new evidence changes the cheapest gate:

1. read repository instructions and all Group E owners, including `docs/development/BRANCH_LINEAGE.md`;
2. observe GitHub, local and working-mirror identities for `group/e-context-delivery` that are actually reachable;
3. attempt replica synchronization, but continue on the available plane if another plane is temporarily unavailable and the required gate is executable;
4. record exact sync debt rather than guessing unavailable state;
5. retain accepted D0016 and D0017 as the current Class 2 decision/contract gates;
6. retain the independently verified D0017 production implementation/evidence without reinterpreting the accepted Design;
7. preserve the D0017 focused/source verification qualification, including the exact-full Termux hard-link limitation;
8. keep product owners synchronized with the implemented D0017 meaning;
9. retain the accepted D0018 warm-host/fresh-model contract and implement/verify only its bounded C1-C4 runtime repair before Group E exit review;
10. activate conditional D0022 only if accepted evidence proves durable/shared content storage is required;
11. remeasure before considering any ContextSlice semantic reduction;
12. keep the active cumulative Group E lane until all Group E exit conditions close;
13. update Design/status owners and evidence without conflating accepted, implemented and verified layers;
14. perform a Group E exit review;
15. elect and retain the final Group E checkpoint head;
16. create `group/f-cloudflare-runtime` from that exact head and continue there. Do not advance `mvp-1a-7` as part of this transition.

Do not skip to later runtime/cloud/security implementation merely because the program lists it. Parallel research is allowed only when it does not preempt an unresolved Group E authority/transport decision; accepted later-Group implementation belongs on the later cumulative successor branch.

## 13. Completion handoff

The final Group E handoff must report:

```text
Group E branch head: <sha>
Legacy predecessor: mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
D0016: <status / sha>
D0017: <status / not-needed / sha>
D0018 E-facing contract: accepted Design `warm-host-qualified-model-attempt-fresh`; production source/runtime verified at `73d404bdc24eac8337019738ba074c2a1fea4861` under the declared supported-Termux trusted-local qualification
D0022: <verified dependency / not required / deferred>
Selected context mechanism: <name>
Model-visible semantics: <unchanged / changed under accepted contract>
Measured remaining bottleneck: <evidence>
Source/provider validation: <runs/evidence>
GitHub Group E head: <sha>
Termux Group E head: <sha or unobserved>
Working mirror: <sha or disposable/unobserved>
Replica sync state/debt: <state>
Checkpoint elected: <yes/no; exact sha>
Remaining Group E unknowns: <list>
Next branch: group/f-cloudflare-runtime from <exact final Group E sha>
```

Only after this record is complete should Group E be treated as a completed cumulative checkpoint and used as the creation base for Group F.
