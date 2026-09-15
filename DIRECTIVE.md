# dev-2 owner directive

- Status: active
- Revision: 6
- Scope: first public `dev-2` architecture, implementation and proof, followed by final `tdev` product convergence

## 0. Current post-release convergence requirements

The final product identity is `tdev`. `dev-2` is the current development branch and historical development codename, not the intended permanent product, protocol, internal-runtime, provider-visible, or deployment identity. Before final promotion, remove branch-derived `dev-2`/`dev2` naming from current product surfaces and internal identities where it exists only because development occurred on that branch. Historical Git branch names and truthful historical evidence may retain the old name. A rename that changes durable or protocol semantics must preserve correctness through the existing Design owner; the naming correction itself does not justify a new Design.

One canonical `tdev` installation/runtime and public MCP service must be able to work with multiple explicitly authorized repositories and refs without requiring a separate local runtime, installation, Worker, or public endpoint per repository as the normal operating model. Repository/ref selection must preserve exact identity, authorization, isolation, request deduplication, validation, recovery and canonical-integration fencing independently for each selected binding. Resource sharing is allowed only where those boundaries remain intact.

Complete the remaining managed-execution cost/reliability repairs, multi-repository/ref capability, final `tdev` identity convergence and repository-aware transfer optimization on the current development line before final branch promotion. After those changes and their required validation/live acceptance converge, promote the exact validated final product state to `main`, transition canonical self-development to the verified `main` binding, and prove ordinary self-development there. `main` is the final canonical product line, not a second place to continue unfinished substantive development.

These requirements preserve all first-release correctness and security invariants below. They add the post-release convergence target and override earlier uses of `dev-2` only where those uses treated the development codename as the permanent product identity.

## 1. Authority

This Directive is the highest repository authority for the user's explicit objectives, requirements, priorities, and non-substitutable completion conditions.

No Rule, Design, implementation, test, benchmark, historical result, compatibility concern, predecessor decision, or derived document may override, narrow, or silently reinterpret it. When lower-level material conflicts with the Directive, correct the lower-level material.

The documentation system itself is mutable. Any repository document, including this Directive and the other top-level governance documents, may be changed without prior user approval when the change is materially justified by the user's objective, new evidence, or a simpler and more correct development system. Apply justified top-level authority/governance changes first, then report them to the user with the reason, effect, major risks, and alternatives considered.

Within those boundaries, the agent may autonomously design, create, revise, merge, or remove all subordinate documentation and implementation structures needed to achieve this Directive, including Designs, architecture, history, evidence, benchmarks, security, deployment, qualification, and operational documentation.

## 2. Product objective

Build `dev-2` as a substantially simpler, faster, more efficient, and actually self-developing ChatGPT-native development system.

The primary completion condition is factual:

> ChatGPT can use the canonical `dev-2` MCP path to discover the current repository, understand relevant source, make real source changes, validate them, integrate them safely, and read back authoritative completion without requiring a predecessor development system for ordinary forward development.

For the first public release, ordinary product operation through the canonical ChatGPT -> `dev-2` core path must not require tmcp, direct GitHub mutation, manual runtime rebinding, deployment-time source scoping, Codex, another LLM, or another external bootstrap. This is a product-independence and first-release-proof requirement, not a restriction on the tools used to implement, repair, bootstrap, inspect, or review `dev-2` itself. During development of `dev-2`, any authorized development tool, coding agent, model, IDE, shell, repository tool, or provider tool may be used when useful. Such a tool must not be mistaken for proof that the resulting canonical product path works without it, and it must not silently become a required dependency of that path.

## 3. Clean-sheet requirement

`dev-2` starts from a parentless Git root and from requirements, not predecessor architecture.

Existing tdev and tmcp code, documents, Designs, workflows, schemas, tools, state models, and runtime structures are non-authoritative evidence and salvage candidates only. Reuse is allowed only after the new architecture independently requires the same abstraction and reuse is still the simplest, safest, and most efficient realization.

Prior implementation, verification, qualification, deployment, sunk cost, historical acceptance, or migration convenience is never sufficient reason to retain an abstraction. Large-scale replacement and deletion are allowed before the first public release.

## 4. Core intelligence and optional harnesses

ChatGPT is the only required intelligence for the first-release canonical core development path. That core path must remain fully usable without a Codex executable, Codex authentication, a second LLM, a model subprocess, another model execution service, or any comparable delegated-intelligence harness.

This does not make `dev-2` a permanently ChatGPT-only executor. The architecture may support optional local or remote executors, coding harnesses, agents, models, compilers, build systems, shells, or other specialized capabilities, including Codex-like or Antigravity-like harnesses, when they provide product value. They are optional capabilities unless a later Directive explicitly promotes one into a required product dependency. Their absence must not break the first-release canonical core path, and their integration must preserve the same authorization, exact identity, isolation, validation, recovery, conflict, and canonical-integration invariants as any other executor.

There is no product requirement restricting which tools or models may be used to develop `dev-2` itself. The requirement concerns what the shipped canonical path requires in order to operate and what evidence is necessary to prove that independence.

## 5. Self-development and repository context

A normal new development task must be startable from canonical `dev-2` MCP without externally pre-baking source scope or redeploying the runtime merely to expose required files.

ChatGPT must be able to bind exact current repository identity, discover relevant paths, progressively obtain bounded source context, execute the change, validate it, integrate it safely, and observe completion.

Exact-base identity, authorization, bounded reads, integrity, stale-state rejection, and safe recovery are required.

## 6. Parallel-first baseline

Parallel development is a first-class product property.

The default configured concurrency is **8**. The first public release must actually support at least eight independent development work units progressing concurrently when dependencies and real resource conflicts permit.

Eight is not an architectural maximum. The architecture must not encode eight as a permanent semantic ceiling, fixed lane identity count, public API limit, or durable-state limit.

Configured concurrency above eight must be possible without redesigning core work semantics. A concrete deployment may impose a resource ceiling as runtime policy; that ceiling is not a product architectural maximum.

Independent work proceeds concurrently by default. Only genuinely conflicting or dependency-ordered work should serialize or fence. Failure, cancellation, timeout, or unresolved effect in one work unit must not globally stop unrelated work.

## 7. Isolation, recovery, and integration

Concurrent work must not depend on one shared writable checkout. Each executable work unit requires isolated exact-base-bound candidate state or an equivalent isolation mechanism.

Retries, reconnects, restarts, and response loss must not create duplicate logical work or duplicate canonical effects.

Only validated results may enter canonical state. Stale or conflicting candidates must not silently overwrite newer state. The exact validated result must be the result integrated. Partial or duplicate completion must not leave canonical state ambiguous.

The concrete integration abstraction is a new Design decision; predecessor Case, Drive, Agent, Promotion, or similar abstractions are not mandatory.

## 8. Simplicity

Use the smallest understandable set of durable owners, state machines, queues, coordinators, adapters, manifests, and recovery mechanisms that correctness and product value actually require.

Historical qualification, recovery, migration, and compatibility machinery must not dominate the normal core. Preserve necessary external durable state deliberately, but isolate legacy compatibility at an edge rather than designing the new core around it.

## 9. MCP contract

The public MCP surface is a clean-sheet Design decision. No predecessor tool count or schema is inherited.

The target is the smallest clear and safe contract that lets ChatGPT discover repository state and context, start and observe development, recover interruption, validate and integrate results, and perform real self-development. Avoid both tool-per-internal-capability proliferation and an unrestricted arbitrary shell/mutation interface.

## 10. Comparative efficiency after first release

There is no reason to keep investing in `dev-2` unless it remains materially better in useful development work than the alternatives available to the owner. Comparative performance and efficiency therefore remain product concerns, but measurement machinery must not become a larger cost than the product decision it informs.

`dev-2` should continue to be evaluated against tdev and tmcp on representative development workloads where evidence is genuinely comparable. Predecessors remain comparison subjects, never architectural authorities. Old tdev must not be recreated, repaired, reinstalled or parallel-hosted merely to manufacture a benchmark. Use measured-current, measured-historical and analytical evidence honestly and keep unsupported cells unknown.

Evaluation should include successful end-to-end completion, latency, throughput, concurrent utilization, model/tool rounds, source/context bytes, redundant reads, repeated validation, stale/wasted work, manual intervention, external bootstrap, recovery cost, managed execution, Git/provider operations and infrastructure requests per completed task.

Formal claims of statistical superiority use D0007's preregistered methodology until that Design is revised. A favorable diagnostic or owner release decision is not a substitute for those statistics and must not be reported as D0007 PASS. Conversely, the owner may make a product/release decision from bounded current evidence when the marginal cost of additional measurement is not justified, provided the decision and remaining unknowns are explicit.

Performance or cost wins obtained by weakening validation, exact-state correctness, authorization, isolation, recovery, conflict handling or canonical integration safety do not count.

## 11. First-release owner closure

On 2026-09-14 the owner explicitly accepted and closed the first public `dev-2` release from the available current evidence and one-shot comparison diagnostics. This owner decision is the controlling first-release completion decision under this revision.

The closure does **not** assert that every D0007 repeated statistical cohort, p95 sample requirement or hard superiority threshold ran or passed, and it does not convert unperformed physical Android sleep/Doze/reboot acceptance into PASS. Those cells remain unverified or deferred. Retained evidence may support narrower factual claims only at the layer actually exercised.

The owner decision closes the r4 release-blocking requirement to continue costly repeated benchmarking or disruptive physical acceptance before declaring the first release. D0007 remains the formal methodology for any later statistical-superiority claim unless revised. Future regressions, incidents or product decisions may reopen specific acceptance work without retroactively changing what was and was not measured at first-release closure.

The first-release product invariants remain: canonical ChatGPT -> `dev-2` ordinary development must be self-hosting without predecessor or second-model dependency, default concurrency remains eight without being an architectural ceiling, concurrent work remains isolated, interruption/retry remains idempotent, and only exact required-validated results may reach canonical state.

## 12. Post-release priority

Prioritize reducing the real cost of completed development while preserving every correctness and security invariant. The first research frontier is same-ref stale recomposition and repeated full-validation amplification. D0003's accepted cost-efficient composition research boundary is the current owner of that research: it keeps production semantics unchanged, rejects unsafe cross-tree receipt reuse under the current whole-result validation identity, and permits only a pure off-path deterministic composition falsifier before any later production Design revision.

After structural amplification, optimize managed-execution/session, Git/provider and Workers/DO request cost where measurement shows material remaining waste. Prefer eliminating unnecessary work over making repeated unnecessary work marginally faster. Treat validation executions, managed compute, provider operations, infrastructure requests, redundant bytes, wall time and human intervention per completed task as first-class efficiency metrics. Use cheap falsifiers before large cohorts, and do not build a new qualification subsystem merely to prove an optimization.

## 13. Non-substitutable first-release operating environment

The user's actual local development and operating environment is **Termux on an
Android device**. It is a first-release operational target and a material part of
the system, not merely an optional hermetic-test or transition environment. The
user's existing foundation is Termux/Android, Cloudflare `workers.dev`, GitHub,
and ChatGPT. Do not substitute an imagined general-purpose Linux server for it.

The public ChatGPT-facing MCP origin must be served through **Cloudflare
`workers.dev`**. Generic HTTPS availability is not an equivalent requirement.
Actual account, subdomain, Worker/resource names, deployed versions, entitlements,
and credential permissions are mutable observations that must be rebound from
the provider when used, not invented hostnames or inherited predecessor settings.

Ordinary first-release operation must not assume that the user owns or will
maintain a separate VPS, dedicated Linux host, cloud VM, reverse-proxy server, or
other always-on server. An additional service or execution dependency is an
explicit architectural cost, not part of the assumed environment. Select one only
after examining whether the existing foundation can satisfy the objective, record
why it is necessary, and report its operational, permission, resource and cost
consequences. Convenience or sunk implementation cost is insufficient justification.

A separate public tunnel, temporary URL, manual endpoint rebinding, or repeated
public-origin creation is not a user requirement and must not be a normal-path
assumption. How the local and public sides communicate is a Design decision.

Do not assume Android/Termux provides root, systemd, Docker/Podman, usable cgroups,
user namespaces, unrestricted inbound networking, or uninterrupted daemon
lifetime. Equally, do not assume Termux is incapable without checking the actual
authorized environment. Measure architecture-relevant filesystem, toolchain,
process, storage, network, concurrency and isolation capabilities. Treat sleep,
background suspension, process termination and restart as ordinary failure modes;
neither wake locks nor a service launcher may be treated as an uptime guarantee.

The environment correction preserves Sections 2-12: required validation,
authorization, exact identity, candidate isolation, scoped conflicts, duplicate
prevention, recoverability, scalable default-eight concurrency, real self-development
and superiority over both predecessors must not be weakened to fit the environment.
An unavailable test or capability remains unavailable, not a success or a silent
fallback. Claims about native Termux behavior require native Termux evidence;
claims about workers.dev/provider behavior require evidence at that actual layer.

This section specifies operating and product requirements, not a storage product,
communication protocol, state owner, component count or process topology. Those
choices remain independently justified Design decisions. Sharing the predecessor's
environment does not inherit its architecture, workflow, source or authority.


## 14. Phase A cutover and ChatGPT metadata policy

The owner explicitly authorizes replacing the existing tdev public MCP runtime on
its currently verified workers.dev origin with dev-2. Prefer reusing that exact
origin so the user need not change the app URL. Preserve predecessor Git branches,
source and history; old live availability, old request/state continuity, old DO/D1
migration, parallel hosting, complete snapshots and a compatibility rollback layer
are not requirements. Do not delete unrelated user/provider resources or credentials.
Verify actual provider routing and authorization before changing the binding.

All four selected public tools (`dev_context`, `dev_read`, `dev_work`,
`dev_observe`) publish `readOnlyHint:true` and `destructiveHint:false`.
This is the user's intentional ChatGPT-facing metadata policy, including dev_work;
subordinate Designs must not reverse it based on the fact that operations mutate
source or providers. Match other relevant fresh tmcp hints when observable, not
remembered values. Hints do not grant or weaken internal authorization, capability
intersection, exact validation/integration, CAS, stale-base protection, deduplication,
recovery or credential isolation. Mutation semantics remain documented explicitly.

Phase A prioritizes the single unavoidable ChatGPT Refresh boundary over historical
J1/J2/J3 sequencing. Freeze first-release-capable public names, closed input/output
unions, operation vocabulary, errors, request/retry identity, observation selectors
and annotations before cutover. Implement a real usable repository/work backend,
not a descriptor-only mock: after Refresh the next session must obtain current
repository identity and remote HEAD, bounded source, open/incomplete work, admit
new work, prepare/edit exact candidates, invoke implemented validation/integration
capabilities and observe outcomes/recovery through dev-2. Unimplemented operations
must fail with typed unavailable/blocked results, never fabricated success.

Complete all independently executable Phase A source/runtime/auth/transport/schema,
configuration, deployment, tests, provider/server readback, coherent publication and
repository-resident Phase B resume information before requesting Refresh. Existing
authorized tmcp/GitHub/project-local/provider tooling is a bounded bootstrap exception;
record why it was used. No additional reasoning model is required. Phase B should
use dev-2 for operations it can perform rather than routinely rediscovering through
predecessor tooling when proving the canonical product path. This preference does not
restrict which authorized tools may be used to implement or repair dev-2 itself;
product-path proof and product-development tooling are distinct. Current authority
must identify exact implemented/incomplete frontiers, dependencies, blockers,
evidence and first read-only rebinding operations.

Phase A does not perform Phase B release completion. Full hosted execution sealing,
physical Android sleep/reboot, complete eight-way stress, self-update and comparison
proofs may follow Refresh unless their minimum implementation is necessary to
continue development through dev-2. Phase A stops only when real server/provider
cutover acceptance is complete and the user's ChatGPT app/action Refresh alone
remains, or when an external blocker prevents cutover after every independent
Phase A implementation/verification/publication task is exhausted. One failure,
workload size or an unfinished release proof is not a stop condition.
