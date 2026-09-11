# Architecture basis - 2026-09-11

Classification: observations, selected predecessor evidence and design-session review; **not product authority, a dev-2 runtime result or performance proof**. Sensitive values are excluded. Repository history holds chronology; this file records reproducible inputs and the boundary of conclusions.

## Fresh clean-root bind

GitHub branch/tree reads and a project-local isolated worktree independently returned:

```text
repository       humtr/tdev
branch           dev-2
observed HEAD    9a42b05d403370b7b4a698b4d7440d58aa4a79b5
parents          []
root/count       9a42b05d403370b7b4a698b4d7440d58aa4a79b5 / 1
tree             caca5a5d3f32c4b63f0dbfaeed290a22f6cd1e1c
```

The complete tree contained AGENTS.md, DIRECTIVE.md, RULE.md, WORKBOARD.md and docs/design/{README,TEMPLATE,INDEX}.md only. All seven were read at that exact commit before design. DIRECTIVE r1 already expresses the requested clean-sheet authority, ChatGPT-only intelligence, parallel default 8/no ceiling, isolated work and superiority requirements. No hierarchy change or Directive/RULE rewrite was necessary.

Preserved authority blobs: AGENTS `1878cbab5ad65fdd6e80d11b28f1838fde374274`; DIRECTIVE `4238d91be16ed8875d8ecdc00ba0a9588b1bfcc0`; RULE `0263e2b77c961f4d1730245d151a1eca91ff55be`. Changes are accepted Designs, their authoring/navigation system, current execution board and evidence/documentation checking only. Root count and these blobs must be rechecked before publication.

Reproduce the foundation read with `git show --no-patch --format='%H %T %P' <sha>`, `git rev-list --max-parents=0 <sha>`, `git rev-list --count <sha>` and `git ls-tree -r <sha>`. Discover a **fresh** remote HEAD with `git ls-remote origin refs/heads/dev-2`; the SHA above is a recorded input, not a replacement for discovery.

The initial requirement-first target sketch was written before deep predecessor source investigation, SHA-256 `2af5fdbfd176abf531e788fd7365ba4c217d637737ead37ff9a0b7c5505b1ce8`, retained as [initial decision sketch](initial-decisions-2026-09-11.md). It selected the broker/SQLite/immutable candidate/sandbox/exact-ref/four-tool direction from requirements. Later protocol and recovery corrections are in the accepted Designs. The sketch is historical evidence, never a competing Design.

## Fresh predecessor identities and observation limits

| Input | Exact observed identity | What was actually established |
| --- | --- | --- |
| tdev remote development | `afd28533f2ac0edb64639dc637ca8f0600f3ac9e`; tree `c19bcdf08b006d4c497a072103b0cedb2bd88e60`; parent `7e77cc331a2b1093292f1d56d9ba53f926767230` | Fresh remote ref and exact source reads. The local development checkout was older and not used as the baseline. |
| tdev live context | same `afd28533...`; context profile `tdev.repository.context.prepare.lazy.v1` | `development_context_get` with package.json succeeded; bounded scope maxFiles128/maxBytes2097152. No source mutation/integration was run. |
| tmcp remote next | `ce3f2a78c98853fba06e4ec1a3b21955283ca4b9`; parent `972712a49c4f41b26a6bacd899048626d4561077` | Latest observed branch has a documentation commit newer than active release source. |
| tmcp active server source | `972712a49c4f41b26a6bacd899048626d4561077` | Installation manifest and running-server release agree, observed via `tmcp.info` and read-only `tmcp.runtime.status`. |
| tmcp active release | `release-0b49ad3b5b26cd273f9a1237c4f9a74ed08a3ffaf6c0a462a442ede4d1065f8b` | Executor concurrency4, batchParallelism8, 58 operations, Node24.18.0. Queue/batch admission is not running concurrency. |

Transition read jobs: `job_r8q_4bf65d78d5` (isolated root/environment/remote heads); `job_r8u_0e2683acb9` (exact current tdev source); `job_r8r_b9883ff2e9` (tmcp info); `job_r8t_4045cec7e2` (tmcp runtime status); `job_r8y_667e1108c5` (selected historical evidence and original authority hashes). These are secondary retrieval aids; exact Git source paths/commits and observations above stand without the old chat. No private credentials or full local environment dump is retained.

## Actual useful paths and failure observations

Current tmcp successfully supports operation discovery, isolated worktree creation and bounded deterministic local command execution in this session. Its shell receipt expressly says `same_uid_policy_not_os_sandbox`; it is useful transition tooling but not evidence for dev-2's production isolation requirement. Source `src/process-runner.ts` at active source implements fixed argv (`shell:false`), bounded output counters/redaction, process-group cancellation and revalidation before spawn. Those behaviors inform tests, not inheritance of its Task/Job/registry owners.

Current tdev `src/mcp-self-context.mjs` has bounded path/prefix selection and release-bound manifest/identity checks. Therefore it would be inaccurate to say tdev has no progressive context. Whether ordinary new scope remains deployment-independent in every full live development path must be measured, not inferred from a single package read. `src/mcp-development-adapter.mjs`, `src/mcp-trial-runner.mjs`, `src/mcp-surface.mjs` and `src/promotion.mjs` still expose layered Case/Drive/Agent/Promotion responsibilities. In the inspected surface, mutation/cancellation annotations use readOnlyHint=true; dev-2 deliberately uses accurate effect descriptions instead.

At tdev `afd28533...`, `docs/evidence/group-f-d0043-r5-c0-chatgpt-native-source-package-verification-2026-09-09.json` records a deterministic no-Codex source/package path, 753 focused tests and zero model process starts, explicitly excluding current-client live/provider proof. `group-f-d0046-r8-chatgpt-native-experiential-gate-acceptance-2026-09-09.json` distinguishes acceptance from the then-open live proof. These are historical recorded observations, not rerun tests. A claim that all current tdev paths necessarily invoke Codex would be false; the benchmark must choose the usable deterministic path.

Historical tdev `group-f-d0046-r1-m2-cpu-bootstrap-remediation-2026-09-05.json` records Worker discovery exceeding CPU while decoding a roughly 7.8 MB semantic tree, with lazy initialization as remediation. This justifies testing cold discovery/source bytes; it does not prove the repaired current runtime still has that failure.

Fresh tmcp local status retained a September 7 failed tunnel-repair handoff (`Quick Tunnel did not become ready within 150s`) and older degraded-route observations while current control calls worked. Public route probes were skipped in that local-only status. Do not misreport old health records as current public outage or successful end-to-end development. Preserve runtime/source/route observation timestamps separately in benchmarks.

## Requirement-first disposition

| Existing material | Disposition in dev-2 | Affirmative reason or rejection |
| --- | --- | --- |
| tdev `test/policy.test.mjs` reserved `.git/config`, `dir/../file`, file/descendant collision vectors | **REUSE candidate: input/expected-safety vectors only** | Independently required D0002/D0005 path/topology denial already has concrete adversarial examples. Reexpress them through new ports; do not import Case/Plan/Promotion helpers. Add symlink/case/byte-range cases absent from that small set. |
| tmcp bounded output/cancel/revalidate behavior in `src/process-runner.ts` | **REWRITE** | D0005 needs these observations with OCI identity/credential isolation; same-UID execution and RuntimeConfig/ResolvedTarget dependencies cannot be reused as the sandbox. |
| tdev context selection/entry validation and candidate composition | **REWRITE** | Need live bound remote identities and immutable generations, not release manifest/source-scope or Case ownership. Keep the requirements and adversarial examples, not object hierarchies. |
| Case/Drive/Agent/Promotion; legacy model task/runner; inherited 16 tools and inaccurate annotations | **DELETE from target architecture** | No requirement justifies these owners; ChatGPT + durable work + sandbox + exact-ref integration provide the selected semantics. This is not deletion of predecessor files/state. |
| tmcp Task/registry/tunnel/runtime epoch architecture; qualification/recovery compatibility layers | **LEGACY-ISOLATE** | Required only to operate/observe predecessors and transition. No dev-2 core dependency or state import. |
| Existing Cloudflare Worker/DO/D1, credentials, routes, tmcp releases/worktrees/registry | **LEGACY-ISOLATE** | Existence does not establish orphanhood or deletion authority; untouched, outside dev-2 canonical state. |
| Both predecessor benchmark/validation harnesses | **LEGACY-ISOLATE** | May wrap as baseline adapters with exact versions and equal postconditions; no inherited PASS, threshold or product authority. |

No predecessor implementation file or subsystem is approved for wholesale reuse. A later reuse proposal must identify exact bytes/dependencies, meet the already accepted contract, retain permission/license provenance and demonstrate lower verified cost than a rewrite. 'Already works' or 'looks harmless' is not approval.

## Technical primary references

These explain mechanism constraints, not repository authority. Accessed 2026-09-11:

- [Git push expected ref lease](https://git-scm.com/docs/git-push): use exact expected old ref, never unqualified force or background-tracking assumptions.
- [SQLite WAL](https://www.sqlite.org/wal.html): local durable transaction mechanism; not a distributed scheduler or Git transaction.
- [Node 24 SQLite API](https://nodejs.org/download/release/v24.21.0/docs/api/sqlite.html): synchronous interface and release-candidate stability motivate narrow storage encapsulation and timing tests.
- [MCP 2026-07-28 discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover) and [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools): modern discovery/metadata are required transport behavior, not product work state.
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [Podman run](https://docs.podman.io/en/latest/markdown/podman-run.1.html): authorization and execution boundary inputs; actual deployment conformance still requires tests.

## Consistency review scope

The design-session review checked requirement coverage, separate semantic owners, acyclic dependencies, no numeric-order inference, derived-only index, execution-only board and evidence/history isolation. It corrected authorization-before-dedup, launch reservations before active-slot accounting, release truth ownership, protocol discovery support, stale-conflict replacement work, and public error vocabulary. This was a direct consistency review, not an independent reviewer campaign or runtime test.

Known falsifiers remain visible: same-ref repeated validation, SQLite event-loop contention, Node SQLite stability, real modern-client interop, host sandbox availability and release-helper recovery. D0007 makes these measurable release conditions. The benchmark is a completed contract, not a completed experiment. Documentation checker success cannot be promoted to product verification.
