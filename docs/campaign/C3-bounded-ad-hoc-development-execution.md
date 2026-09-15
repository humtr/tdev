# C3 — bounded ad-hoc development execution

Status: draft; not active; mandatory entry revalidation before execution

This document is a non-authoritative campaign draft. `DIRECTIVE.md`, `RULE.md`, current accepted Designs, executable product contracts and `WORKBOARD.md` own meaning and current routing. C3 being issued does not authorize implementation, Design change, shell exposure, or a change in campaign order by itself.

## 1. Draft purpose

C3 investigates whether tdev needs a bounded ad-hoc development execution capability in addition to its typed operations and registered validation/run profiles, and if so implements the smallest secure form that improves ordinary self-development without turning tdev into an unrestricted remote shell or provider proxy.

The motivating gap is practical development expressiveness: one-off diagnostics, codemods, formatters, targeted tests, compiler/tool invocations, generated-file updates and similar candidate-local work can be awkward or impossible when every execution must already be a permanently registered profile. The proposed direction is typed-first and sandboxed: use an existing typed operation when one fits; use a registered profile when it is a stable reusable contract; use bounded ad-hoc execution only for development computation that genuinely needs it.

This draft does **not** assume that literal shell syntax is required. An argv-first bounded command interface may be sufficient. A shell interpreter, pipelines, redirection or other shell language features are optional decisions that must earn their complexity and risk during C3 entry/design review.

## 2. Mandatory entry revalidation — no implementation before this gate

When C1 completes and WORKBOARD reaches the post-C1 routing decision, do not begin C3 implementation from this draft by default. Freshly revalidate the agenda first.

At minimum, rebind and reassess:

- current `DIRECTIVE.md`, `RULE.md`, WORKBOARD routing and relevant D0001/D0002/D0004/D0005/D0006 decisions;
- the then-current tdev public operation surface, registered profiles, managed execution implementation and actual live sandbox/container guarantees;
- whether C1 changed managed-controller installation, session lifecycle, containment, cancellation, response-loss or resource semantics in ways that alter this proposal;
- concrete current development tasks that remain materially difficult or impossible with typed operations and registered profiles;
- whether those gaps justify a new product capability rather than a small number of reusable typed/profile operations;
- whether argv-only execution is sufficient, and if not, exactly which shell-language features are required;
- whether candidate mutation by ad-hoc execution is necessary or read-only diagnostics would satisfy the measured need;
- whether network access is needed at all; default assumption is no network;
- whether the proposed execution can stay entirely outside the Termux operator/credential UID's arbitrary-command surface;
- existing Design ownership and whether revisions to current owners are sufficient;
- actual security/latency/cost consequences compared with current typed/profile execution; and
- campaign ordering: whether C3 should still precede C2, move later, shrink, or be abandoned.

The revalidation result must be reflected in current WORKBOARD routing before substantive C3 implementation. If measured need is weak, current controls cannot safely support it, or the functionality is better expressed by typed/profile operations, close or defer C3 and route onward without implementing an ad-hoc shell merely because this draft exists.

## 3. Provisional product boundary to falsify

If C3 survives the entry revalidation, the provisional target is a candidate-scoped, credential-free, resource-bounded development execution primitive behind the existing tdev MCP surface.

Provisional invariants:

- preserve the four public MCP tools; prefer extending `dev_work` rather than adding a fifth public shell tool unless fresh evidence proves that contract inferior;
- typed operations remain preferred for repository, work, validation, integration, policy, release, provider and other authority-bearing effects;
- registered profiles remain preferred for stable reusable execution contracts and all required-validation authority;
- ad-hoc execution is development computation only, not canonical Git authority, validation authority, release authority, provider administration or credential-bearing operator control;
- never execute caller-selected arbitrary project commands directly in the trusted Termux control UID merely because the caller is authorized to develop source;
- execute candidate-selected or caller-selected commands only inside the accepted managed isolation boundary or an equivalently strong existing owner-approved boundary;
- exact Work/generation/repository/ref/binding identity fences every execution and its resulting candidate changes;
- default network is none; adding network access is a separate explicit security decision with destination/credential scoping rather than generic egress;
- no GitHub token, Cloudflare credential, device key, OAuth token, canonical Git writer, tdev ledger, installation-private state, control socket, container engine socket or another Work's writable state is exposed;
- exact cwd and writable paths are contained to the selected candidate/workspace plus bounded scratch and explicitly admitted immutable artifacts;
- CPU, memory, PID/process, storage, output and wall-clock limits are enforced by the trusted outer controller;
- cancellation, restart and response loss do not cause hidden duplicate physical execution when replay would be unsafe;
- command stdout, exit zero or a locally executed test claiming PASS never becomes required-validation authority; and
- canonical integration remains limited to the exact separately required-validated candidate result.

These are hypotheses for C3 design review, not new authority. If an existing Design conflicts or current evidence falsifies them, revise the proper owner or change/abandon the draft before implementation.

## 4. Provisional Design ownership

Do not create a new Design merely because C3 has a campaign identity. First evaluate revisions to existing semantic owners:

- D0004 for the public `dev_work` contract and typed/ad-hoc admission shape;
- D0005 for isolation, credential custody, arbitrary-command boundaries and sandbox requirements;
- D0002 for candidate/workspace/generation materialization and capture of command-produced source changes;
- D0001 if Action identity, retry, cancellation, recovery or durable execution state changes;
- D0006 if managed runtime/session topology or execution sealing changes; and
- D0003 only if validation/integration identity must change, which should not be necessary merely to add a development convenience execution mode.

Create an additional Design only if fresh analysis finds a genuinely independent semantic owner that cannot be represented cleanly by these existing owners.

## 5. Provisional route if C3 is activated

### C3-1 — agenda, need, owner and security revalidation

Perform the mandatory Section 2 review with bounded real development examples. Produce a go/no-go/scope decision before Design or product implementation.

Exit choices:

- **no-go/defer:** record current routing in WORKBOARD and proceed to the selected next campaign without implementing C3;
- **narrowed:** implement only the measured subset, such as argv-only diagnostic execution or candidate-producing commands without shell language;
- **proceed:** select existing Design revisions and the minimal accepted capability.

### C3-2 — owner-correct contract revision

If proceeding, revise only the required existing Designs. Decide at least:

- public operation/schema shape;
- argv versus shell-language support;
- candidate read/write semantics and exact generation transition;
- executable/tool lookup and environment construction;
- working-directory/path/symlink containment;
- immutable dependency/toolchain mounts;
- network policy;
- resource/output/deadline/process-tree bounds;
- cancellation/retry/recovery and replay-safety classification;
- result/diff capture and observation;
- capability authorization and typed-first restrictions; and
- explicit operations that ad-hoc execution can never substitute for.

### C3-3 — minimal implementation

Implement the smallest accepted execution primitive using the existing managed isolation path where possible. Avoid a second scheduler, work owner, validation system, credential broker or general provider proxy.

If candidate mutation is accepted, trusted code captures the resulting contained filesystem state/diff into the Work's next exact candidate generation. The command itself does not commit, push, integrate or mark validation PASS.

### C3-4 — adversarial and recovery falsification

At minimum test the accepted surface against applicable cases such as:

- `..`/absolute-path escape and symlink escape;
- other Work/repository/ref access;
- Termux home, installation-private state, ledger/control sockets and credential probes;
- `.git`/credential-helper/canonical-writer abuse;
- container-engine/control-socket access;
- network/metadata egress attempts under no-network policy;
- command/argument/shell quoting injection at every trusted boundary;
- process/fork/PID abuse, background descendants and incomplete teardown;
- CPU/memory/disk/output/deadline exhaustion;
- huge/binary/malformed output;
- cancellation before/during/after execution;
- disconnect/response loss with replay-safe and non-replay-safe commands;
- source mutation outside admitted writable paths;
- forged PASS/result output; and
- restart/reconcile behavior without duplicate unsafe execution.

### C3-5 — required validation, integration and live self-development acceptance

For the exact final implementation:

- run focused tests first, then complete required validation;
- integrate only the exact eligible result;
- qualify/install/release any changed managed trusted controller/runtime through its current owner-defined path before claiming live acceptance;
- prove fresh runtime/controller identity as applicable; and
- perform a bounded actual ChatGPT -> tdev self-development task using the new capability for at least one measured use case that typed/profile operations did not already handle efficiently, followed by ordinary required validation, exact integration and authoritative readback.

C3 is not accepted merely because a command executed. Acceptance requires the security boundary, candidate identity/recovery behavior and end-to-end product value selected at C3-1 to survive live use.

### C3-6 — closeout and downstream routing

- Re-evaluate whether any temporary compatibility or bootstrap mechanism can be removed.
- Confirm ordinary tdev development does not depend on tmcp or another predecessor MCP for the new capability.
- Promote permanent semantics into existing owners/source/tests and leave campaign evidence non-authoritative.
- Update WORKBOARD to the next selected campaign, currently expected to be C2 if no fresher authority changes that route.

## 6. Explicit exclusions

C3 does not authorize:

- exposing an unrestricted shell directly on the Termux operator UID;
- arbitrary provider/API proxying;
- using tmcp as a product dependency or as the implementation of the tdev execution feature;
- replacing typed policy/release/integration/provider operations with shell commands;
- treating ad-hoc tests as required validation;
- general network-enabled browsing/download/package installation without a separately justified owner decision;
- weakening C1 managed-execution lifecycle/ref retirement guarantees; or
- moving substantive C2 multi-repository, naming, transfer-deduplication or main-promotion work into C3.

TMCP may remain an external bootstrap/break-glass development tool while tdev is unfinished, but C3's product acceptance must be on tdev itself.

## 7. Stop conditions

Stop C3 execution only when:

- C3-1 concludes no-go/defer and WORKBOARD is routed onward;
- a genuine external permission/provider/user-action blocker prevents safe continuation;
- current security/isolation owners cannot support the selected capability without an unresolved redesign; or
- C3 acceptance and closeout are complete.

Do not continue implementation merely to fulfill this draft if fresh revalidation says the product does not need it.
