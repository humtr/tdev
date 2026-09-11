# dev-2 owner directive

- Status: active
- Revision: 2
- Scope: first public `dev-2` architecture, implementation, and proof

## 1. Authority

This Directive is the highest repository authority for the user's explicit objectives, requirements, priorities, and non-substitutable completion conditions.

No Rule, Design, implementation, test, benchmark, historical result, compatibility concern, predecessor decision, or derived document may override, narrow, or silently reinterpret it. When lower-level material conflicts with the Directive, correct the lower-level material.

The documentation system itself is mutable. Any repository document, including this Directive and the other top-level governance documents, may be changed without prior user approval when the change is materially justified by the user's objective, new evidence, or a simpler and more correct development system. Apply justified top-level authority/governance changes first, then report them to the user with the reason, effect, major risks, and alternatives considered.

Within those boundaries, the agent may autonomously design, create, revise, merge, or remove all subordinate documentation and implementation structures needed to achieve this Directive, including Designs, architecture, history, evidence, benchmarks, security, deployment, qualification, and operational documentation.

## 2. Product objective

Build `dev-2` as a substantially simpler, faster, more efficient, and actually self-developing ChatGPT-native development system.

The primary completion condition is factual:

> ChatGPT can use the canonical `dev-2` MCP path to discover the current repository, understand relevant source, make real source changes, validate them, integrate them safely, and read back authoritative completion without requiring a predecessor development system for ordinary forward development.

Normal forward development must not repeatedly require tmcp, direct GitHub mutation, manual runtime rebinding, deployment-time source scoping, Codex, another LLM, or another external bootstrap. Such tools may be used only as bounded break-glass recovery when `dev-2` itself is unavailable or not yet capable of the transition being established.

## 3. Clean-sheet requirement

`dev-2` starts from a parentless Git root and from requirements, not predecessor architecture.

Existing tdev and tmcp code, documents, Designs, workflows, schemas, tools, state models, and runtime structures are non-authoritative evidence and salvage candidates only. Reuse is allowed only after the new architecture independently requires the same abstraction and reuse is still the simplest, safest, and most efficient realization.

Prior implementation, verification, qualification, deployment, sunk cost, historical acceptance, or migration convenience is never sufficient reason to retain an abstraction. Large-scale replacement and deletion are allowed before the first public release.

## 4. ChatGPT-native intelligence

ChatGPT is the only required intelligence for the core development path. The first public core must not require a Codex executable, Codex authentication, a second LLM, a model subprocess, or another model execution service. Optional delegated intelligence may exist later only if core development remains fully usable without it.

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

## 10. Required superiority over predecessors

There is no reason to replace current tdev and tmcp unless `dev-2` is materially better.

`dev-2` must therefore be designed and measured against both current tdev and current tmcp on comparable representative development workloads. Those systems are benchmark baselines, never architectural authorities.

`dev-2` must demonstrate materially better overall development performance and efficiency while preserving correctness and safety. Evaluation should include, where applicable:

- successful end-to-end task completion;
- end-to-end latency;
- throughput and concurrent-work utilization;
- tool calls and model/tool round trips;
- repository/context bytes transferred;
- redundant reads, retries, repeated validation, and stale/wasted work;
- manual user intervention and approval burden;
- external bootstrap operations;
- recovery cost after interruption or response loss;
- infrastructure/provider operations per completed task.

At minimum, `dev-2` must provide reliable MCP-only self-development, default eight-way concurrency, lower ordinary external-bootstrap burden, and compelling measured efficiency/throughput superiority over both baselines.

Performance wins obtained by weakening validation, exact-state correctness, authorization, isolation, recovery, conflict handling, or canonical integration safety do not count.

## 11. First-release proof

The first public release is incomplete until current evidence proves:

1. a real ChatGPT session performs a real non-documentation `dev-2` source change through canonical `dev-2` MCP ordinary operations;
2. no predecessor development system is required to prepare that ordinary task;
3. no second model is required for the core path;
4. default concurrency is eight and eight independent work units can actually progress concurrently;
5. eight is not encoded as an architectural ceiling and higher configured concurrency does not change core work identity or durable semantics;
6. concurrent work is isolated and conflicts block only necessary scope;
7. interruption and response loss do not produce duplicate work or duplicate integration;
8. the exact validated result is what reaches canonical state;
9. comparable benchmark evidence demonstrates material performance and efficiency superiority over current tdev and tmcp.

## 12. Priority

Until those proofs are green, prioritize: clean architecture, minimum complete self-development core, dynamic repository context, scalable default-eight concurrency, isolation and safe integration, recovery correctness, real self-development, then comparable predecessor benchmarking.

Do not let optional features, compatibility polish, migration convenience, or proof machinery displace those priorities.

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
