# dev-2 architecture

Navigation only. `DIRECTIVE.md` r5 owns product goals and operating requirements; accepted Designs own bounded semantics; `WORKBOARD.md` owns current execution status and mutable observations.

## Selected system

```text
ChatGPT
  -> fixed workers.dev MCP + human Access identity
  -> installation-scoped routing-only edge state
  <-> device-initiated outbound channel
Termux / Android
  -> deterministic control + exact Git repository/candidates
  -> per-repository SQLite work/action/effect truth
  -> isolated managed build/test execution
  -> exact validated expected-old-ref integration
  -> durable observation/recovery through the same MCP
```

Termux/Android is the actual control and state runtime. Public ingress is the canonical workers.dev deployment; the device requires no inbound listener, VPS, reverse-proxy host, or public tunnel. Candidate execution is isolated from the Android credential boundary in the selected managed environment. One local ledger owns repository Work/action/recovery truth and one external Git ref owns canonical source; routing state does not become a copied work ledger.

Default execution capacity is 8, but contracts are not semantically capped at eight. Independent reads, candidates, validation, and nonconflicting work may progress concurrently. Exact work revisions, resource capacity, authorization, required validation, and expected-old-ref publication fences remain authoritative.

## Normal self-development lifecycle

The ordinary canonical path is current context discovery -> bounded read -> Work creation -> isolated edit/candidate -> configured run/required validation -> exact canonical integration -> observation/recovery. `policy.adopt`, `release.stage`, and `release.activate` extend that path when applicable to a policy or deployed product change.

`tmcp`, direct GitHub mutation, Codex, or a second model is not a required ordinary forward-development layer. Bounded bootstrap/repair remains exceptional. D0006 keeps explicit rollback, native writer control, and fixed helper/operator mechanisms private; the public MCP does not gain a generic rollback operation.

D0003 H2 is an internal integration optimization under the existing Work/action/effect owners. Compatible same-base members may produce one exact composed required validation and one canonical publication with atomic member settlement; ordinary per-Work integration remains the fallback. H2 does not authorize cross-tree validation-receipt reuse or a second mutable batch owner.

## Exact change, validation, and release semantics

A candidate generation is immutable and bound to an exact base. A prepared result freezes an exact result tree/commit and current policy/execution identity. Required validation must authorize those exact bytes. Integration uses expected-old-ref protection and reconciles response loss through exact effect identity and trusted lineage. Recomposition changes result identity and requires validation again.

Release staging/activation is a separately authorized lifecycle over integrated source. The installed release path verifies the native/managed production enrollment and paired device/edge identity; a sealed active release is not inferred from a source commit alone. Current release/device/edge IDs belong in `WORKBOARD.md` or fresh observation, not this architecture overview.

## Owner map

| Question | Owner |
| --- | --- |
| Work, IDs, deduplication, admission, restart and callback fencing | D0001 |
| Binding, bounded context, Git objects, candidate generations | D0002 |
| Prepared result, required validation, exact/H2 same-ref integration | D0003 |
| Four MCP tools, typed work variants and observation | D0004 |
| Human/device/runner authentication, capabilities, sandbox, credentials | D0005 |
| Termux + workers.dev topology, managed execution, release and private rollback boundary | D0006 |
| Verification purposes, comparison methodology and statistical claims | D0007 |
| Production enrollment composition and qualification join | D0008 |

Design dependency metadata is mechanically projected into `docs/design/INDEX.md`; it is not mutable execution order.

## Evidence and empirical limits

First release is owner-closed under DIRECTIVE r5. That closure does not imply D0007 repeated statistical-superiority cohorts or physical Android sleep/Doze/reboot acceptance were performed. Historical cutover, failure-isolation, recovery, H2, and cost evidence remains under `docs/evidence/` and owns only the observation it records.

Post-release work begins by measuring completed-development cost and structural amplification. Only measured material residual cost should drive managed execution/session, Git/provider, or Workers/DO optimization. `docs/research/` may supply hypotheses and measurement vocabulary but is not current architectural authority unless an accepted Design adopts a decision.
