# tdev owner directive

- Status: active
- Revision: 7
- Scope: current `tdev` product convergence on the development line, retained first-release invariants, and final promotion to `main`

## 0. Current state and remaining outcome

The Phase A public cutover is complete. The first public release was explicitly owner-closed on 2026-09-14. Those milestones are retained baseline, not current execution frontiers, and their old step-by-step cutover procedure is not an active requirement.

The current development branch remains `dev-2`; the final product identity is `tdev`. `dev-2` is a development branch and historical codename, not the intended permanent product, protocol, internal-runtime, provider-visible, or deployment identity.

The remaining required outcome is to finish the unresolved product-convergence work on the development line, including managed-execution lifecycle/cost correctness, one-runtime multi-repository/ref support, final `tdev` identity convergence, repository-aware transfer efficiency, and exact-state promotion to `main`. After promotion, canonical self-development must operate on the verified `main` binding and ordinary self-development must succeed there.

`WORKBOARD.md` owns current execution position. Campaign documents may organize the route, but they do not add product requirements or replace this Directive. This section may be maintained periodically to mark major milestones achieved or deferred without turning the Directive into a work log.

## 1. Authority and maintenance

This Directive is the highest repository authority for the user's explicit objectives, requirements, priorities, and non-substitutable completion conditions. No Rule, Design, implementation, test, benchmark, historical result, compatibility concern, predecessor decision, campaign, or derived document may override, narrow, or silently reinterpret it.

Repository governance and subordinate documentation may evolve when that makes the system simpler or more correct. The agent may autonomously correct stale milestone status, remove obsolete procedure, simplify wording, and reconcile this Directive with explicit user instructions. Such maintenance must preserve requirement meaning and must not invent, drop, relax, or materially reinterpret user requirements.

A material reframing of the user's objectives or completion conditions should be discussed with the owner when the existing instruction does not already authorize the change. Progress reporting and routine cleanup do not require a separate approval round trip.

## 2. Product objective

Build `tdev` as a substantially simpler, faster, more efficient, and genuinely self-developing ChatGPT-native development system.

The factual product condition is:

> ChatGPT can use the canonical tdev MCP path to discover the current authorized repository/ref, understand relevant source, make real source changes, validate them, integrate them safely, and read back authoritative completion without requiring a predecessor development system for ordinary forward development.

ChatGPT is the only required intelligence for the canonical core development path. Optional local or remote executors, coding harnesses, models, compilers, build systems, or other specialized capabilities may exist when they provide product value, but their absence must not break that core path unless a later Directive explicitly promotes one into a required dependency.

`tmcp`, direct GitHub mutation, manual task-specific runtime rebinding, deployment-time source scoping, Codex, another LLM, or another external bootstrap must not be required for ordinary forward product operation. Authorized development or repair tools may still be used to build or recover tdev; using them is not proof that the canonical product path depends on them.

## 3. Repository and self-development requirements

A normal new development task must be startable from canonical tdev MCP without externally pre-baking source scope or redeploying the runtime merely to expose required files.

The system must bind exact current repository/ref identity, discover relevant paths, progressively obtain bounded source context, isolate candidate state, execute the change, complete configured required validation, integrate the exact eligible result, and observe/recover completion.

The development line was established as a clean-root authority epoch. Predecessor tdev/tmcp source, documents, workflows, schemas, state models, and historical acceptance remain non-authoritative evidence or salvage material only. Sunk cost or predecessor compatibility is not sufficient reason to retain an abstraction.

One canonical tdev installation/runtime and public MCP service must support multiple explicitly authorized repositories and refs without requiring a separate local runtime, installation, Worker, or public endpoint per repository as the normal model. Repository/ref selection must preserve exact identity, authorization, isolation, request deduplication, validation, recovery, and canonical-integration fencing independently for each selected binding.

## 4. Parallelism, isolation, recovery, and integration

Parallel development is a first-class product property. Default configured concurrency is **8**, and at least eight independent work units must be able to progress concurrently when dependencies and real resource conflicts permit. Eight is not an architectural maximum or durable identity count.

Concurrent mutable work must not depend on one shared writable checkout. Each executable work unit requires isolated exact-base-bound candidate state or an equivalent isolation mechanism.

Retries, reconnects, restarts, cancellation, and response loss must not duplicate logical work or canonical effects. Missing, stale, failed, uncertain, or partially observed state never becomes success by default.

Only exact required-validated results may enter canonical state. Stale or conflicting candidates must not silently overwrite newer state. The exact result authorized by validation must be the result integrated, with recoverable exact effect identity across response loss.

Independent work should serialize only for actual dependency/resource/conflict boundaries. One failed or uncertain work unit must not globally stop unrelated work.

## 5. Simplicity and ownership

Use the smallest understandable set of durable owners, state machines, queues, coordinators, adapters, manifests, caches, and recovery mechanisms that correctness and product value require.

Every durable owner or background mechanism requires a concrete justification. Historical qualification, migration, compatibility, and recovery machinery must not dominate normal development. One durable semantic fact has one authoritative owner; derived documentation must not become a competing copy of current truth.

Designs own bounded architectural and contract decisions. WORKBOARD owns current execution position. Campaign plans organize execution only. Evidence records observations only. Git preserves history.

## 6. Operating environment and public service

The user's actual local operating environment is Termux on Android. It is a material production target, not an interchangeable generic Linux host. The public ChatGPT-facing MCP origin is the canonical Cloudflare `workers.dev` deployment. The normal product must not require a separate VPS, general-purpose always-on Linux server, reverse-proxy host, or changing public tunnel.

Do not assume Android/Termux provides root, systemd, Docker/Podman, usable cgroups, unrestricted inbound networking, or uninterrupted daemon lifetime. Sleep, background suspension, process termination, reconnect, and restart are ordinary failure modes. Architecture-relevant capabilities must be measured in the actual authorized environment when they matter.

Provider account IDs, Worker/resource names, versions, credentials, installation identities, and release IDs are mutable observations and must be rebound from their actual owners rather than copied from documentation.

## 7. Public MCP contract and metadata

The selected public MCP surface remains the four-tool contract: `dev_context`, `dev_read`, `dev_work`, and `dev_observe`, with typed bounded operations rather than an unrestricted arbitrary shell or provider proxy.

All four tools publish the owner-selected ChatGPT-facing metadata policy:

- `readOnlyHint: true`
- `destructiveHint: false`
- `idempotentHint: false`
- `openWorldHint: false`

These annotations are UI metadata only. They do not weaken internal authorization, capability intersection, exact validation/integration, stale-base protection, request deduplication, effect recovery, or credential isolation.

## 8. Achieved first-release baseline and retained invariants

The public cutover, ChatGPT Refresh boundary, and first-release owner closure are completed milestones. They are not reasons to keep Phase A/Phase B implementation chronology in current authority or Design prose unless a retained semantic boundary still depends on it.

The 2026-09-14 owner closure does **not** assert that every D0007 repeated statistical cohort, p95 sample requirement, or physical Android sleep/Doze/reboot cell ran or passed. Unperformed cells remain unknown/deferred. D0007 remains the formal methodology for any later statistical-superiority claim unless revised.

The first-release invariants continue to apply: canonical ordinary development is self-hosting without predecessor or second-model dependency; default concurrency is eight without being an architectural ceiling; concurrent work remains isolated; retry/recovery remains idempotent; authorization and credential boundaries remain explicit; and only exact required-validated results may reach canonical state.

## 9. Current convergence requirements

Before final promotion, complete all material unresolved convergence work while preserving the retained invariants above.

1. Managed execution must have truthful bounded lifecycle behavior: provider-terminal/session state, retries/replacements, operational resources, and cleanup must converge without hidden amplification or permanent disposable residue.
2. One canonical runtime/public service must support multiple authorized repository/ref bindings with exact isolation and recovery rather than per-repository runtime fragmentation.
3. Branch-derived `dev-2`/`dev2`/`DEV2` naming must be removed from current product, protocol, internal-runtime, provider-visible, and deployment identity where it exists only because development occurred on the branch. Truthful historical evidence and the actual development ref may retain the branch name until promotion. Semantic migrations remain owned by the existing relevant Design; naming alone does not justify a new Design.
4. Repeated repository/source/context transfer and other material cost amplification should be reduced where current measurement shows real waste, without weakening authorization, validation, exact identity, isolation, or recovery.
5. Permanent requirements and semantics discovered during convergence must land in Directive/Rule/current Designs/source/types/config/tests rather than remaining dependent on campaign or evidence narratives.

The detailed order of these tasks belongs to WORKBOARD and the active campaign route, not this Directive.

## 10. Efficiency and evidence

There is no reason to keep investing in tdev unless it remains materially useful and efficient relative to realistic alternatives. Measure representative work using comparable correctness semantics and include end-to-end completion, latency, throughput, concurrent utilization, source/context bytes, redundant reads, validation executions, stale/wasted work, retries, managed compute/session behavior, Git/provider operations, infrastructure requests, manual intervention, and recovery cost when material.

Prefer eliminating unnecessary work over making repeated unnecessary work marginally faster. Use bounded falsifiers before expensive cohorts. Do not build a qualification subsystem larger than the product decision it serves.

Formal statistical-superiority claims use D0007 until that methodology is revised. A bounded owner/product decision may use narrower evidence when further measurement cost is not justified, provided the scope and remaining unknowns are explicit. Performance wins obtained by weakening correctness or security do not count.

## 11. Final promotion and completion

Substantive unfinished product work remains on the development line. `main` is not a second unfinished development frontier.

Final completion requires:

- the exact final development-line state to have passed required validation and applicable live acceptance;
- that exact state, without new substantive product differences, to be promoted to `main`;
- remote `main` identity/readback to be verified;
- canonical tdev self-development to transition through the owner-defined mechanism to the authorized `main` binding;
- the corresponding final runtime/release identity to be verified where deployment is affected;
- bounded ordinary self-development from `main` to succeed through context -> read -> Work -> required validation/integration -> authoritative readback; and
- current governance/Design/source/test structure to be sufficient for future safe development without depending on completed campaign plans, stale overview documents, or historical evidence narratives.
