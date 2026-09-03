# Design 0046 - Minimum Viable tdev MCP Experiential Path

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@069be884f0cb160ee8584c7b79ab333d232a1c2f`
- Trigger: direct user requirement to stop treating source/package milestones as the development goal and instead reach the first real web ChatGPT -> tdev MCP -> Termux development result by the shortest safe route, then harden that working path
- Acceptance evidence: `docs/evidence/group-f-d0046-r1-minimum-viable-tdev-mcp-experiential-path-acceptance-2026-09-03.json`
- Scope: the isolated Cloudflare owner composition, deployment order, current-client handoff and user-experienced acceptance boundary for the first single-user tdev development unit
- Affected owners: `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/MCP.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, provider manifests/adapters and focused end-to-end qualification
- Preserved owners: D0019 remains the sole Case/Task/Attempt/result/Promotion authority; D0020/D0027 remain Agent delivery/local execution owners; D0023 owns the stateless MCP schema; D0024 owns MCP authentication; D0042 owns durable Case-to-Agent drive semantics; D0043 owns typed Termux operations; D0025 owns Git publication; D0045 owns later tmcp comparison
- Explicit non-goals: no immediate replacement of the existing `tdev.humtr.workers.dev` experiment; no canonical-tree or remote-Git mutation in the first experiential run; no multi-tenant or hostile-local-code support claim; no D0045 superiority claim; no final-MVP or production-SLO claim

## 1. One-line definition

First make one isolated, authenticated web ChatGPT request produce and validate a real non-documentation tdev ChangeSet through the existing Case, drive, Agent and Termux owners, with only a candidate projection returned to the user; after that exact path works, harden its recovery, security, capacity, rollback and stable cutover without reopening the minimum result.

## 2. Why this is Class 2

The missing step is not another source adapter. Selecting one public Worker, cross-script Durable Object bindings, a D0042 durable placement, one Agent route, one repository/model profile, an authentication generation, a deployment/cutover order and a new user-visible acceptance boundary changes provider, security, retry and qualification meaning. Those decisions require an accepted Design before implementation or provider mutation.

This Design composes existing owners. It does not transfer their state or semantics into the MCP Worker.

## 3. Failure analysis

The prior route stopped before user-visible value for three independent reasons.

### 3.1 Physical execution gap

D0043 Revision 1 qualified a typed source/package catalog but left the model and validator as unbound `configured_runtime` names. Its model profile declared `network:none`, and its own package evidence explicitly did not claim a physical Termux run. A public MCP endpoint over that package could admit work but could not produce a real model-generated ChangeSet.

D0043 Revision 2 is the corrective owner. It binds the installed non-interactive Codex runtime, saved local authentication boundary, structured result schema and fixed validation executable while preserving result-only execution.

### 3.2 Provider composition authority gap

D0023/D0024 source qualification did not authorize a live Worker to join D0019 Case, D0042 drive and D0020 Agent delivery owners. Provider readback showed that the existing `tdev.humtr.workers.dev/mcp` service is an older OAuth experiment with none of those owner bindings. The available Case and Agent Workers are qualification owners, not an already composed tdev MCP product.

This Design supplies the missing provider composition authority through a new isolated trial Worker. The old endpoint remains untouched until a later explicit cutover gate.

### 3.3 Completion/reporting gap

The earlier plan allowed source, package or provider sub-gates to become stopping points. That made a technically useful intermediate result look like completion while the user still had no URL that could perform development.

Under this Design, small commits, tests, deployments and readbacks remain execution units. They are not user-facing completion. The first product checkpoint is the successful current-client development result in Section 4, or an exact irreducible blocker after all authorized work before it has been exhausted.

## 4. First experiential claim

The minimum viable claim is exactly one run satisfying all of the following:

1. the operator has already completed source, physical-Termux and provider preflight without repeated web-client probing;
2. the user adds the exact read-back MCP HTTPS URL to supported web ChatGPT and completes the selected D0024 authentication flow;
3. the user gives one bounded real development objective against one exact published tdev commit;
4. ChatGPT invokes the D0023 tools, one D0019 Case is created and D0042 drives it through the fixed D0020/D0027 Agent route;
5. the Termux Agent invokes the D0043 Revision-2 Codex profile, receives one schema-valid result-only ChangeSet and runs the fixed validation profile in an isolated candidate;
6. ChatGPT receives a terminal projection containing the exact base, validation result and inspectable candidate/diff;
7. independent readback proves no canonical checkout, Git ref, unrelated Case, provider owner or credential was mutated.

The first objective must change non-documentation source and include an objective focused regression plus the repository-required validation. A canned patch, no-op, documentation-only edit, direct out-of-band edit or result imported from tmcp does not pass.

For this checkpoint the only planned user actions are:

- add the final read-back MCP URL and authenticate when ChatGPT prompts;
- submit the real development objective and inspect the returned candidate.

Provider configuration, release installation, Agent activation, preflight, readback and failure diagnosis are implementation/operator work, not additional setup delegated to the user.

This claim is deliberately smaller than final MVP: it proves a useful end-to-end candidate path, not Git publication, broad recovery, multi-tenant operation, comparative superiority or stable production cutover.

## 5. Selected minimum topology

The first public resource is:

```text
https://tdev-mcp-trial.humtr.workers.dev/mcp
```

The service name and resource are release-manifest values and must be confirmed by provider readback before handoff. A preexisting or conflicting provider object fails closed; it is not overwritten by convention.

The isolated Worker `tdev-mcp-trial` contains only the D0023/D0024 ingress adapters, provider facades and one new SQLite Durable Object host for D0042:

```text
supported web ChatGPT
        |
        v
Cloudflare Access -> tdev-mcp-trial /mcp
                         |
                         +-> tdev-d0020-composition-case-r1 / CaseRuntimeDO
                         |
                         +-> CaseAgentDriveRuntimeDO
                                   |
                                   +-> CaseRuntimeDO (fresh authoritative reread)
                                   |
                                   +-> tdev-d0020-qualification-clean-a
                                         AgentDeliveryRuntimeDO
                                                   |
                                                   v
                                         authenticated Termux Agent
                                              |             |
                                              v             v
                                      bounded Codex     fixed validation
```

The trial manifest binds, without caller selection:

- `TDEV_CASE_AUTHORITY` to the existing `tdev-d0020-composition-case-r1` / `CaseRuntimeDO` namespace;
- `TDEV_AGENT_DELIVERY` to the existing `tdev-d0020-qualification-clean-a` / `AgentDeliveryRuntimeDO` namespace;
- `TDEV_CASE_AGENT_DRIVE` to a new trial-local `CaseAgentDriveRuntimeDO` SQLite namespace implementing D0042;
- `TDEV_CASE_PLACEMENT` to the exact same D1 placement database already used by the bound Case owner;
- one exact principal, tenant/account mapping, Agent ID, route generation, Case namespace/prefix, immutable repository base policy, D0043 operation capability/release digest and D0024 authentication generation.

Cross-script Durable Object bindings are provider routing, not new state owners. The ingress cannot choose a different script, class, namespace, D1 database, Agent, repository or operation profile from request data. Every deployed binding is compared with an exact expected manifest and provider readback before traffic is admitted.

Reusing the existing qualified Case and Agent owner namespaces is limited to this isolated, single-user trial and fresh trial-scoped identities. Existing Cases, D0039/D0044 qualification lanes and unrelated route generations are not reusable test data. Stable production may retain or replace these placements only through the hardening/cutover barrier in Section 10.

## 6. Minimum-path execution order

The order is selected by cheapest decisive falsifier, not by document number.

### M0 - make Termux capable of real development

Implement and qualify D0043 Revision 2 first. Bind exact Codex/npm identities, implement the structured result adapter and candidate materialization, update the installable Agent only after positive quiescence, then run one real non-documentation source task through the local/Agent path. The output must be a validated isolated candidate with no canonical or Git mutation.

If M0 fails, fix the D0043/runtime defect before spending more Cloudflare or web-client attempts. Source/package success alone does not advance the checkpoint.

### M1 - compose and preflight the isolated provider path

Implement the D0042 SQLite Durable Object host and the D0046 provider facades/manifest. Prove the complete source gate, deploy only `tdev-mcp-trial`, independently read back its immutable version, bindings, DO namespaces, D1 identity, Access profile and disabled preview/alternate writers, then run bounded machine/provider MCP lifecycle and one end-to-end candidate trial through the same owner path.

No existing `tdev` Worker, canonical D0039 route, D0044 lane or stable Git ref is replaced in M1. A provider response loss is reconciled by version/config/readback; it is not retried blindly.

### M2 - perform the one planned web ChatGPT trial

Only after M0 and M1 are green, hand the user the exact URL, expected authentication identity, connection steps, tool-set fingerprint and rollback/disable status. Run one current-client initialize/list/read preflight and then the Section-4 real development objective. Preserve the exact Case/request/base/release/provider identities and independent candidate verification as evidence.

Ad hoc repeated ChatGPT/Access probing is forbidden. A current-client mismatch is captured once with the smallest failing discovery/registration/auth/tool request and zero unauthorized owner mutation. Its responsible D0023/D0024/D0046 contract is corrected before one new bounded attempt.

## 7. Admission and owner interaction

The MCP Worker authenticates and authorizes before any owner lookup. One release-owned account map converts the verified D0024 principal into the sole trial tenant and allowed Case scope. The request body cannot select or override tenant, Agent route, Case placement, repository root, model, validation command, executable, environment, credential or network mode.

`case_create` creates a fresh trial-scoped Case against the exact immutable repository authority. `case_run_or_resume` records or replays one D0042 drive intent. Every drive step rereads the Case and Agent owners; the drive record never caches readiness or Agent capacity. Read/projection tools reread the named owner and remain stateless.

The trial ends at an isolated validated candidate projection. Promotion may be evaluated in-memory/isolated form only as already authorized by D0019; no canonical target or Git adapter is configured for this first path. An unexpected canonical/publication capability is a deployment admission failure.

## 8. Authentication, credentials and disclosure

D0024 remains the authentication owner. The trial first uses Cloudflare Access Managed OAuth with exact resource, issuer, audience, registration mode, redirect, PKCE and verified claim mapping. Standard protected-resource/authorization metadata must be provider-read back before ChatGPT is asked to connect.

If the current ChatGPT client falsifies the selected Managed OAuth contract, the request stops before owner mutation and exact evidence reopens D0024. A revised client-compatible profile is designed and source/provider-preflighted before another web attempt; no permissive bearer-token fallback or undocumented header bypass is allowed.

The web credential terminates at Access/ingress and never reaches Case, drive, Agent or model input. The Agent credential never reaches MCP/ChatGPT. Codex saved authentication stays local to the Codex process boundary defined by D0043 Revision 2 and is never copied into Worker, Case, evidence or model instructions. Evidence contains identities/digests and redacted denial classes, never secret values.

The first real model run sends the exact admitted repository context under the user's existing trusted-local Codex account. This is an explicit single-user disclosure boundary; it is not a multi-tenant privacy or hostile-provider claim.

## 9. Failure, response loss and cleanup

- MCP response loss: replay the same request ID/payload and project the stored owner receipt; never create a replacement Case by timeout.
- Worker/drive restart: reconstruct the D0042 record and reread Case/Agent owners before action.
- Agent disconnect/reconnect: retain Case intent; D0020/D0027 decide current route, socket and delivery truth.
- model/validation failure: return the exact terminal failure/validation result with no Promotion or Git effect.
- Codex authentication expiry: fail closed as a local model admission/provider error; never request a secret through MCP.
- provider deploy ambiguity: reread exact version, bindings, traffic and Access configuration before retry or rollback.
- client disconnect: the Case continues only under its existing durable intent; reconnect reads state and does not invent completion.
- cleanup ambiguity: retain the candidate/claim/capacity block until positive process/workspace reconciliation.

Every failed trial records whether Case, drive, delivery, process, candidate, provider and credential effects are absent, present or unknown. Unknown is never collapsed into failure/no-effect.

## 10. Harden only after the useful path exists

The successful M2 path is frozen as a regression corpus before hardening. The implementer then advances continuously through:

1. **H1 recovery** - forced Worker/drive/Agent restart, MCP/model/result response loss, reconnect, cancellation and positive process/workspace cleanup;
2. **H2 security lifecycle** - wrong resource/issuer/audience/tenant denial, refresh, revocation, JWKS and policy rotation, log/trace secret scans;
3. **H3 deployment durability** - reproducible fresh deploy, exact config/version readback, rollback/forward recovery and old/preview writer exclusion;
4. **H4 normal parallelism** - legal disjoint widths 2 and 4 first, then the selected normal capacity, preserving deterministic Promotion and bounded resources;
5. **H5 stable cutover** - only after the hardened matrix passes, decide whether to promote the exact composition to `https://tdev.humtr.workers.dev/mcp`; preserve or explicitly retire the old experiment with readback and rollback evidence.

Safety floors required to prevent unauthorized effects, credential leakage, owner duplication or blind replay are part of M0-M2 and cannot be postponed as hardening. Broader resilience, scale, multi-tenant support and stable-name migration do not block the first single-user candidate result unless their absence makes that exact run unsafe.

D0045 tmcp comparison begins only after this tdev-native path is independently usable. Comparative findings may trigger further owner-specific hardening but cannot be used to postpone establishing the baseline tdev path.

## 11. Reporting and continuation rule

Implementation remains small-commit and gate-driven, but the implementer does not stop merely because any of the following passes:

- parser/unit/source tests;
- installable package construction;
- a diagnostic process;
- Worker upload or binding readback;
- MCP initialize/tools/list;
- authentication without a real development result.

After each internal gate, update evidence/routing as required and continue to the next authorized M-step. User-facing handoff occurs only at one of these boundaries:

1. **ready for user action** - M0/M1 are independently green and the report contains the exact MCP URL, authentication/connection instructions, expected identity/tool fingerprint and disable/rollback procedure;
2. **experiential PASS** - the Section-4 real task is complete and the user can inspect its validated candidate/diff;
3. **exact blocker** - an authority/safety defect or unavailable external capability remains after all safe in-scope alternatives are exhausted, with the failing layer, unchanged effects and next Design/actor/action named.

The first boundary is a deliberate user handoff, not implementation completion. After the user's connection/task action, work resumes at the same Case and proceeds to PASS or exact blocker.

## 12. Acceptance matrix and cheapest falsifiers

| Area | Minimum required result |
| --- | --- |
| operation | D0043 Revision-2 real Codex ChangeSet plus fixed validation on physical Termux |
| composition | exact read-back trial Worker, Case DO, drive DO, Agent DO and D1 bindings; no hidden in-memory owner |
| authentication | current web ChatGPT completes exact D0024 flow and one authorized tool call; cross-resource/tenant denial is zero-effect |
| real development | one non-documentation source objective produces an inspectable validated candidate from one immutable published base |
| result-only | Codex/ordinary Task cannot mutate canonical checkout or Git; only disposable candidate bytes appear |
| identity | one principal/tenant/Agent/route/repository/profile manifest; caller cannot substitute any identity |
| response loss | same request/Case/Attempt is reconciled without duplicate dispatch/model process/effect |
| credentials | Access, Agent and Codex credential domains remain separate and secret-free in repository/evidence/Case/model-visible state |
| user burden | user supplies only MCP connection/authentication and the development objective after a complete handoff |
| reporting | source/package/provider sub-gates do not become a false completion report |
| proof scope | exact source, machine, provider, client and final-path layers are recorded separately |

Cheapest decisive falsifiers are:

1. the installed Agent still runs a placeholder or diagnostic instead of real Codex and validation;
2. the trial Worker cannot name one exact Case, drive and Agent owner set;
3. ChatGPT authentication succeeds but the development task requires a manual out-of-band executor/edit;
4. one request selects another tenant, Agent, executable, repository, model or validation command;
5. response loss starts a second Case, Attempt or model process;
6. the model or ordinary Task changes the canonical checkout/ref;
7. a completion report is issued before the user-ready handoff or validated candidate.

Any one blocks the affected claim and is corrected at its responsible owner before the complete M0-M2 path is rerun.

## 13. Migration, rollback and provider preservation

The new trial Worker and drive namespace start empty. No Case/drive schema migration is implied. Cross-script bindings reference existing owner namespaces without copying their records. A mismatched writer/profile/version fails before traffic.

Before M2, rollback is disabling trial traffic/Access and restoring the previously read-back trial version or deleting only newly created empty trial resources after positive absence/quiescence evidence. Existing `tdev`, Case/Agent owner, D0039/D0044 and Git resources are never rollback targets for this Design.

After a live trial Case exists, do not delete the drive namespace or roll back to code unable to read it until the Case is terminal, Agent/process/candidate state is positively quiescent and the exact terminal receipt remains readable. Provider ambiguity recovers forward or remains disabled; it never authorizes blind deletion.

Stable endpoint cutover is H5, not an M2 shortcut. It requires exact old/new resource and Access-generation handling, provider traffic readback, current-client reconnection proof and a supported rollback/disable result.

## 14. Rejected alternatives

### Keep implementing internal gates and ask the user to infer readiness

Rejected. The missing product value is the connected real development path; internal gates remain necessary evidence but are not the experiential exit.

### Deploy the existing source package before binding a real model runtime

Rejected. It would expose a public endpoint that cannot complete the target operation and would spend scarce client/provider trials on a known local gap.

### Replace the existing `tdev` Worker immediately

Rejected. Its current meaning is an incomplete OAuth experiment, and an in-place replacement couples minimum-path debugging to cutover/rollback risk. The isolated trial name gives an independently disableable route.

### Build new Case and Agent authority implementations inside the MCP Worker

Rejected. D0019 and D0020/D0027 already own those facts. The Worker uses explicit provider bindings and remains stateless.

### Require full production hardening before the first user run

Rejected. It delays the cheapest proof of utility and can optimize a path that still cannot complete. The M-path includes mandatory safety floors; recovery breadth, scale and stable cutover follow a frozen successful path.

### Use a static bearer or Agent credential when OAuth is inconvenient

Rejected. It collapses identity domains and makes a compatibility issue into a security defect. An observed D0024 incompatibility returns through SDD.

### Start tmcp comparison before tdev works independently

Rejected. D0045 needs a stable tdev candidate path. Comparison is an additive improvement gate after D0046, not a substitute for establishing it.

## 15. Follow-on gate

This Design authorizes implementation and qualification of M0-M2 plus the H1-H5 hardening sequence after explicit `WORKBOARD.md` routing. Provider mutation starts only after the applicable source/physical preflight and a fresh provider ref/config readback. It authorizes no Git publication, canonical self-development, multi-tenant exposure, tmcp retirement or comparative claim.

The next user-visible deliverable is not another internal pass count. It is the complete connection handoff for the exact trial URL after M0/M1, followed by the validated real candidate from M2.
