# tdev mvp-1a-7

`tdev` is a parallel-first Work Graph system being built toward a **deployed Cloudflare/local-Agent MVP**, not only a local source library. The active development identity is `mvp-1a-7`: one mutable architectural direction whose exact revisions are Git commits, not new `mvp-*` branch numbers.

D0014 remains the latest verified production-source layer: **bounded repository-context preparation reuse and process lifecycle hardening** over the D0013 full-repository/process-per-Attempt baseline. D0015 rebaselines the final product program without changing D0014 source: final completion requires CaseDO/AgentDO or equivalent owners, an authenticated local Agent, deployed Git integration, secured MCP, provider/user setup, operations and final end-to-end qualification. See `docs/ROADMAP.md`.

## Current authority

The current-state chain remains:

```text
D0010 Case head
  -> D0010 semantic root
  -> Plan baseDigest
  -> derived repository/model execution transport
  -> existing result / Claim / fencing validation
  -> Promotion
  -> derived D0011 local Git projection
  -> derived D0012 remote publication
```

Git OIDs, repository context, context-cache entries, canonical request encodings, model processes and transport observations are derived execution state. They cannot elect a Case head, authorize an Attempt, accept a result or publish canonical state.

## Verified layers on mvp-1a-7

- **D0010:** opt-in local semantic-v3 authority using a compressed UTF-8 path-byte radix, compact snapshots, one transactional SQLite Case head, quiesced migration, ambiguity recovery, exact repair and reference-aware GC.
- **D0011:** deterministic real local Git projection and exact local branch-ref CAS over the unchanged semantic root.
- **D0012:** authenticated existing-remote-branch publication source contract with immutable target intent, exact predecessor fencing and reread/restart reconciliation.
- **D0013:** read-only exact-commit full-text repository context and request-digest-bound trusted-local result-only subprocess transport.
- **D0014:** finite executor-local exact-base preparation single-flight/LRU reuse, early size preflight, unique-blob reads, cancellable Git plumbing, reusable immutable repository encodings, POSIX process-group cleanup and non-blocking observations.

D0014 retains the complete D0013 model request and one process start per Attempt. It reduces repeated local Git/decode/validation/hash/encoding work; it does not claim provider token, network, billing, model-quality or external latency savings.

## D0014 decision and evidence

For exactly `N` identical full-context Attempts, repeated context after the first copy is structurally `(N - 1) / N`. D0013's historical 75% value at four Attempts was therefore predictable. The useful D0013 measurements were the absolute repository/context size and real Git, request, process and retry costs.

D0014 re-audited that path and found higher-impact risks, including late size rejection, duplicate blob reads, cancellation waste, descendant process leakage, inherited-pipe false timeouts, asynchronous observation sinks that could stall transport completion, and a cancelled-producer handoff race that could poison a fresh reader. The first verification candidate was rejected before canonical publication when that race was reproduced.

Exact source candidate `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` passed independent Ubuntu/POSIX run `31348795334`, job `93335641224`:

- 232/232 complete tests;
- 93.10% line / 82.16% branch / 96.30% function coverage;
- 32/32 focused repository/cache/process tests;
- 22 baseline plus 22 candidate benchmark scenarios;
- repeated same-base and multi-base tail workloads;
- exact source bundle/archive and evidence hashing.

On the actual 102-file / 1,788,423-byte audit repository, eight same-base Tasks changed:

| Metric | D0013 baseline | D0014 | Change |
| --- | ---: | ---: | ---: |
| wall time | 5,287.2 ms | 1,027.2 ms | -80.6% |
| bounded batch completion rate | 1.513/s | 7.788/s | +414.7% |
| Git commands | 48 | 5 | -89.6% |
| Git stdout | 14.421 MB | 1.803 MB | -87.5% |
| sampled peak RSS | 411.98 MiB | 386.92 MiB | -14.6% |
| sampled peak heap | 282.93 MiB | 129.62 MiB | -54.9% |
| model input | 15,071,128 bytes | 15,071,128 bytes | unchanged |
| process starts | 8 | 8 | unchanged |

Preparation amplification across zero through three retries changed from 1/2/3/4 times to one exact-base preparation. Full request bytes and process starts remain proportional to Attempt count.

The checked evidence is `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json` (SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`); the full decision report is `docs/history/d0014-product-efficiency-audit.md`.

## Runtime and verification

The source target is Node.js 22 or newer with no third-party runtime dependency.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --test --experimental-test-coverage test/*.test.mjs
node --expose-gc bench/repository-model-transport-efficiency.mjs --scenario all
```

`npm run check` performs syntax checks, the complete Node test suite, the in-memory demo and the file-backed durable demo.

Benchmark results are development evidence, not production SLOs. The checked D0014 matrix records warm filesystem/Git cache effects, sequential-order bias, fixture-model limits, parent-only CPU attribution, sampled-memory limits and small tail-sample limitations.

## Minimal Work Graph use

```js
import { CaseEngine, definePlan, runCase } from './src/index.mjs';

const plan = definePlan({
  revisionId: 'example-v1',
  baseTree: { 'README.md': '# base\n' },
  tasks: [
    {
      id: 'write-doc',
      kind: 'work',
      dependencies: [],
      claims: [{ mode: 'write', resource: 'candidate:docs/**' }],
      input: { path: 'docs/result.txt', content: 'parallel-first\n' },
    },
    {
      id: 'promote',
      kind: 'promotion',
      dependencies: ['write-doc'],
      claims: [{ mode: 'write', resource: 'canonical:tree' }],
      input: {},
    },
  ],
});

const engine = new CaseEngine({ caseId: 'case-1', plan });
const outcome = await runCase(
  engine,
  async ({ baseDigest, task }) => ({
    kind: 'changeset',
    baseDigest,
    writes: [{ path: task.input.path, content: task.input.content }],
    evidence: { producer: task.id },
  }),
  { capacity: 4 },
);

console.log(outcome.caseState);
console.log(outcome.snapshot.canonicalTree);
```

## Repository/model executor boundary

`GitRepositoryModelExecutor` accepts only the configured repository path, executable and profiles. Task input names an immutable commit and bounded instruction; it cannot choose an arbitrary executable, shell command, environment, Git routing or mutable worktree.

D0014's default retained cache is bounded and optional. Its entry/byte settings bound retained complete preparations, not total concurrently pending cold-preparation memory or process RSS. `contextCache: false` restores the D0013 cold behavior. A cache miss, eviction, restart or process loss rebuilds from the exact commit and verifies the authoritative `baseDigest`; cache-hit and cold paths must produce identical request semantic content.

The model remains result-only. It cannot mutate the canonical repository directly, use a shared mutable worktree as authority or promote cache state into semantic truth.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/engine.mjs` | sole Case/Task/Attempt/result/Event/receipt/canonical owner |
| `src/runner.mjs` | capacity-bound parallel orchestration |
| `src/durable-runner.mjs` | checkpoint-before-dispatch durable orchestration |
| `src/semantic-*.mjs` | D0010 semantic-v3 authority, storage and migration |
| `src/git-projection.mjs` | D0011 local derived Git projection/ref CAS |
| `src/git-remote-publication.mjs` | D0012 authenticated derived remote publication |
| `src/repository-model-transport.mjs` | D0013/D0014 repository context, cache, model transport and lifecycle |
| `test/repository-model-transport.test.mjs` | repository/cache/process correctness and failure falsifiers |
| `bench/repository-model-transport-efficiency.mjs` | D0014 scaling, retry, parallel and resource evidence |
| `docs/design/0014-*.md` | accepted and verified D0014 source contract |
| `docs/design/0015-*.md` | verified final-MVP program rebaseline and D0014 post-review decision |
| `docs/ROADMAP.md` | final-MVP capability groups, provisional Design program and qualification levels |
| `docs/QUALIFICATION.md` | source qualification gate, proof layers and verification-method catalog |
| `docs/history/d0014-product-efficiency-audit.md` | complete D0014 audit and decision report |
| `docs/history/d0014-post-verification-review.md` | independent post-publication precision review and corrections |
| `docs/evidence/` | checked machine-readable evidence |

## Current boundaries and final-MVP program

Not yet verified or implemented by the current source:

- the selected post-D0014 context-delivery/model-provider contract;
- Cloudflare CaseDO/AgentDO ownership and an authenticated local-Agent delivery/runtime path;
- deployed Git publication/provider-policy qualification;
- secured MCP server, authentication/tenant authorization and current-client qualification;
- required provider/user deployment configuration, migration/rollback/runbooks and fresh-environment qualification;
- external-provider token/billing/latency/quality/privacy/residency outcomes;
- production load/SLO/incident qualification.

These are **open final-MVP capability groups**, not permanent product non-goals. The next context/model gate is decision-neutral: full-context references, manifest/content references, deterministic ContextSlice, warm execution, streaming and hybrids must compete on the post-D0014 baseline. Persistent CAS remains evidence-gated.

Start with `RULE.md`, `SDD.md`, `WORKBOARD.md`, `LINEAGE.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/QUALIFICATION.md`, Design 0015 and the D0014 post-verification review.
