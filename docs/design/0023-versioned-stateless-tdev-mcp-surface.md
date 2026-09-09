# Design 0023 - Versioned Stateless tdev MCP Surface

- Status: `accepted`
- Revision: 4
- Class: 2
- Decision date: 2026-09-09
- Acceptance base: `development@33400f2f7ab13015f7a5699068a128ae1081ee06`
- Predecessor: D0023 Revision 3 was `implementing` on the accepted dual-era protocol compatibility contract; its source/provider evidence remains historical and is not reinterpreted.
- Trigger: `DIRECTIVE.md@r1` and exact-source review falsified the maintained public-surface meaning: the source still exposes pre-release names, two mutation tools advertise `openWorldHint: true`, operation discovery is absent, and normal development start still takes instruction plus caller-selected validation profile instead of one Case-bound typed operation.
- Acceptance evidence: `docs/evidence/group-f-d0023-r4-v1-surface-directive-acceptance-2026-09-09.json`
- Scope: the first-release `tdev.mcp.surface.v1` public names, schemas, annotations, bounded operation discovery and stateless mapping into existing tdev owners.
- Affected owners: `src/mcp-surface.mjs`, generated MCP schemas/manifests, `docs/MCP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALIFICATION.md`, provider surface/readback and focused MCP tests.
- Preserved owners: D0019 remains the sole Case/Task/Attempt/result/Promotion authority; D0042 remains Case-to-Agent drive/re-drive; D0020/D0027 remain Agent delivery/local-process authorities; D0043 owns typed-operation semantics/admission/bindings; D0024 owns MCP authentication/tenant identity; D0025 owns Git publication.
- Explicit non-goals: no MCP-owned scheduler, queue, readiness cache, process handle, claim lease, canonical-tree writer, Git writer or credential store; no general shell; no one-MCP-tool-per-operation expansion; no generic `operation_execute`; no direct ChangeSet result ingress that bypasses Case/Drive/AgentDelivery.

## 1. One-line definition

Expose one strict, stateless, authenticated `tdev.mcp.surface.v1` whose sixteen final pre-release tool names project or command existing tdev owners, whose public annotations all set `openWorldHint: false`, and whose development entrypoint selects a versioned Case-bound D0043 operation rather than a fixed model recipe.

## 2. Revision-4 correction

Revision 4 is a pre-release correction of v1, not a v2 product surface. The product has not shipped. Tool names and schemas may therefore converge once to their intended first-release contract while the surface identity remains exactly:

```text
tdev.mcp.surface.v1
```

The Directive-triggered mismatch reopened only the affected Revision-3 public-surface meaning during this acceptance review. Revision-3 protocol, authentication, statelessness, strict parsing, response-loss and owner-separation evidence remains historical evidence for the exact generations that produced it. Revision 4 advances the maintained contract without rewriting those generations or any durable Case/Plan.

## 3. Transport and protocol

The supported external transport remains HTTPS Streamable HTTP at `/mcp`.

- `POST` carries JSON-RPC MCP messages.
- `GET` is allowed only for a protocol-defined resumable projection and never becomes a command channel.
- The Worker remains stateless between requests; durable Case, drive, delivery and operation truth is reread from named owners.
- The explicitly supported protocol set remains modern-first `2026-07-28` plus the admitted initialize-era compatibility revisions `2025-11-25`, `2025-06-18` and `2025-03-26` until a later accepted compatibility decision changes that set.
- Unknown/future protocol revisions, malformed request metadata, duplicate JSON members, unsafe numbers, invalid UTF-8, unsupported message shapes and oversized data fail closed.
- A JSON-RPC transport response is not a Case Event, Task result or semantic receipt.

D0024 authenticates the external caller. The local Agent remains reachable only through its authenticated outbound D0020/D0027 route; the web client never receives a localhost execution endpoint.

## 4. Exact public v1 tool set

The first public release exposes exactly these sixteen tools, in this contract order:

| Tool | Kind | Owner/meaning |
| --- | --- | --- |
| `case_create` | mutation | create one D0019 Case from a compiled immutable Plan |
| `case_get` | read | bounded authoritative Case projection |
| `case_events_get` | read | bounded committed Case Event projection |
| `case_drive` | mutation | level-trigger the existing D0042 drive/re-drive path for one Case |
| `task_cancel` | mutation/destructive | receipt-backed D0019 Task cancellation |
| `attempt_reconcile` | mutation | exact D0019/D0020 external Attempt reconciliation decision |
| `claim_conflicts_get` | read | bounded ClaimLedger conflict projection only |
| `case_promotion_get` | read | bounded D0019 Promotion/canonical-result projection |
| `development_context_get` | read | obtain an owner-issued immutable repository context reference |
| `development_context_list` | read | bounded lazy-context listing |
| `development_context_search` | read | bounded lazy-context search |
| `development_context_read` | read | bounded lazy-context file-range read |
| `operation_list` | read | bounded D0043 semantic-operation catalog summaries |
| `operation_get` | read | exact operation ID/version descriptor and input schema |
| `development_start` | mutation | create/drive one Case-bound development run around a selected typed operation |
| `development_get` | read | bounded development Case/candidate/validation/Promotion projection |

The pre-release names `case_run_or_resume`, `promotion_get`, `development_unit_start` and `development_unit_get` are historical trial names. They are not aliases in the final v1 manifest. Removing those aliases changes no stored Case or Plan meaning because tool names are transport ingress, not durable Case semantics. A provider generation that still needs an old name for an ambiguous in-flight request is kept isolated until that request is authoritatively reconciled/quiescent; the final v1 generation never advertises both contracts as one surface.

## 5. Annotation contract

Every one of the sixteen public tool descriptors has:

```text
openWorldHint: false
```

This is a public client UX annotation, not authorization and not effect truth. `readOnlyHint`, `destructiveHint` and `idempotentHint` remain truthful per tool. In particular, mutations remain `readOnlyHint: false`, and cancellation remains destructive even though `openWorldHint` is false.

Source validation must mechanize the invariant that every public descriptor has `openWorldHint === false` and that the manifest contains exactly the sixteen names above. No caller acquires a capability because an annotation is permissive or loses server-side checks because an annotation is restrictive. D0043 effect metadata, D0019 grants, Workspace policy, Agent capabilities, Attempt fencing, reconciliation and Promotion authority remain unchanged.

## 6. Operation discovery

`operation_list` and `operation_get` expose D0043 semantic operation contracts without executing them.

`operation_list` returns bounded, cursor-based summaries sufficient for discovery. Each summary includes at least:

- semantic `id` and integer `version`;
- `contractDigest`;
- title and description;
- `resultKind` and `effectClass`;
- declared effects;
- caller-selectability and selection scope;
- bounded availability plus reason.

`operation_get` requires one exact semantic ID/version and returns the exact descriptor plus strict `inputSchema`, `inputSchemaDigest`, required capability metadata and cancellability. Availability is a runtime/release projection and does not grant authority.

Neither tool accepts or returns executable paths, argv, environment, cwd, network configuration, credential material or an arbitrary process contract. A new local capability normally appears as a new D0043 semantic operation or version, not as a seventeenth MCP tool.

## 7. `development_start` contract

Normal first-release development start accepts the transport identities and one selected operation:

```text
requestId
caseId
driveRequestId
contextReference
operation: {
  id,
  version,
  contractDigest,
  input
}
```

There is no top-level `instruction` and no caller-selected `validationProfile` in the normal contract. An optional delegated-intelligence operation may define an `instruction` inside its own versioned input schema; the deterministic core ChangeSet operation instead accepts its own strict typed ChangeSet input.

The adapter resolves `contextReference`, binds the selected operation ID/version/contract digest and normalized input into an immutable Plan/Task, adds owner-required context/validation/Promotion dependencies, creates the D0019 Case and level-triggers D0042. It does not execute the operation directly, submit a result directly to Case, write the canonical tree or select an Agent/runtime binding.

Mutation replay keeps `requestId`, `driveRequestId` and exact canonical payload stable. Response loss rereads owner receipts/state. A missing HTTP response never authorizes a new Case, Attempt or operation execution.

## 8. Read/projection contract

`development_get` projects bounded Case-bound development state: exact Case/Plan/base identity, selected semantic operation identity, accepted ChangeSet identity when present, candidate digest/diff within configured bounds, owner-required validation state/evidence, Promotion state and terminal readback identity. It does not serialize unrestricted filesystem/process state or secrets.

`case_promotion_get` remains the focused D0019 Promotion projection. `development_get` may include the same Promotion identity as part of the experiential readback, but it does not become a second Promotion owner.

## 9. Authorization and owner separation

The Worker authenticates/authorizes the D0024 principal/tenant before owner dispatch. Possession of request IDs, Case IDs, context references, operation IDs or digests is not authentication.

Task admission remains the intersection of Case grant, Workspace policy and current Agent capabilities. D0043 verifies the selected semantic operation contract and release binding. D0020/D0027 verify delivery and local execution fences. MCP cannot override or cache any of those decisions.

The Worker owns no semantic ready list, retry queue, executor capacity, process, claim, candidate workspace, canonical tree or Git ref. Provider Durable Objects may host already accepted owners but do not turn the MCP adapter into a new owner.

## 10. Compatibility and deployment

Existing immutable Cases/Plans and historical Codex-backed trial runs retain their original semantics. Revision 4 introduces no Case snapshot migration.

Before a provider cutover to the final sixteen-tool v1 generation:

1. fresh-read the exact provider/source generation and owner bindings;
2. prove any old-generation nonterminal or ambiguous mutation can still be reconciled by its compatible handler, or block cutover until it quiesces;
3. deploy/read back one exact v1 manifest containing only the sixteen final names;
4. prove every descriptor reports `openWorldHint: false`;
5. preserve D0024 auth resource/tenant identity unless a separately accepted auth change requires otherwise.

Rollback cannot reinterpret a Case or route a live request to a generation that cannot understand its immutable payload. Provider disable/rollback and semantic correction remain separate decisions.

## 11. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| identity | surface remains exactly `tdev.mcp.surface.v1` |
| names | exactly the sixteen final names; no trial-only aliases in the final manifest |
| annotations | all sixteen report `openWorldHint:false`; other hints remain truthful |
| discovery | bounded `operation_list`; exact ID/version `operation_get`; neither executes work |
| development start | exact Case-bound operation selector; no top-level instruction or caller `validationProfile` |
| statelessness | no MCP queue/readiness/process/result/canonical/Git owner appears |
| replay | same request/payload reconciles without duplicate Case/Attempt/effect |
| authorization | client metadata never bypasses D0019/D0043/D0020/D0027/D0024 checks |
| compatibility | old durable Plans keep their old semantics; final v1 does not silently reinterpret them |
| client UX | current-client tool readback shows all `openWorldHint:false`; any remaining platform confirmation is classified separately |

Cheapest decisive falsifiers are: a seventeenth capability-specific MCP tool; a legacy alias in the final v1 manifest; any public `openWorldHint:true`; `operation_get/list` causing execution; caller command/argv/env/network/credential data reaching an executor; caller validation selection weakening required validation; or MCP directly accepting a ChangeSet result outside the Case/Drive/AgentDelivery path.

## 12. Rejected alternatives

### Keep the trial names indefinitely

Rejected. The product is still pre-release, and `case_drive`, `case_promotion_get`, `development_start` and `development_get` state the durable owner/abstraction more accurately before v1 freezes.

### Add one MCP tool for every typed operation

Rejected. It turns server-side capability evolution into public surface churn and duplicates the purpose of the D0043 catalog.

### Add a generic `operation_execute`

Rejected. A flat executor ingress can bypass Case/Attempt/Drive semantics and drift toward a remote shell. Execution remains `development_start` -> Case -> Drive -> AgentDelivery.

### Treat `openWorldHint:false` as authorization

Rejected. It is client UX metadata only. Server safety remains explicit and fail-closed.

## 13. Follow-on gate

Revision 4 authorizes source implementation of the final sixteen-tool v1 surface, annotations, operation discovery and revised Case-bound development-start/get adapter after explicit `WORKBOARD.md` routing. It does not by itself claim provider deployment, current-client approval UX, no-Codex execution, Git publication or final experiential success. Those claims require the D0043 and D0046 gates plus their own observed evidence.
