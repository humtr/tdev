# Cost-efficient composition F3 hosted falsification evidence — 2026-09-14

Status: **F3 blocked before experimental ref mutation**

This is research evidence, not a Design and not production H2 authority. The accepted D0001/D0003/D0004 semantics remain unchanged. No release activation or production batching change was performed.

## 1. Verdict

**F3 blocked.**

The current installation exposes the real canonical expected-old Git CAS sender and its durable old-sender inspection logic, but the authorized interfaces available to this session do not expose that sender against a non-canonical disposable hosted ref, and the directly available GitHub ref-update operation does not accept an exact expected-old ref value. D0003 explicitly does not accept GitHub `force:false` alone as the exact-CAS mechanism.

The F3 safety stop therefore fired before creation or mutation of a disposable research ref. The canonical `refs/heads/dev-2` was not used as the research fixture.

F4 status: **not ready**.

## 2. Fresh starting authority

Observed through current `dev-2` authority and provider readback on 2026-09-14:

- repository: `humtr/tdev`
- repository ID: `github-1322208918`
- GitHub provider repository ID: `1322208918`
- GitHub owner ID: `272709831`
- binding epoch: `1`
- canonical ref: `refs/heads/dev-2`
- starting canonical HEAD: `a5d56f211d6cbaa169c7d7aae61ccdc49e2cc9`
- starting tree: `d7711e616e340881572714bde9a83e3f4bc9b6f3`
- starting snapshot manifest: `sha256:cdb31560c7b7f314ffb35fc96d825e1e941549d185174a7dbc6870b44e3ba32a`
- policy digest: `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`
- required profile `core`: `sha256:0f9100a8ec1ac018b37fc302851b2020d75472c900de3d79ad6966f017b5cffa`
- required profile `integration`: `sha256:228c3c1d07555d6b41b2200c5c2c9475d1566fdbeb0f74f496784a28e4dfdf71`
- configured execution capacity: `8`
- runtime observation: accepting, deployment sealed, environment class `github-hosted-rootless-oci`
- active runtime release from runtime observation: `sha256:3bcde63d0124f1193ab46eac974dc89e7403c05586093b4d454f538d0981cc17`
- device: Android arm64, owner epoch `42`, connected at the observation
- managed execution: ready; four active sessions were reported at the observation; no executing action and no unresolved canonical effect were reported
- edge version: `3993f1a1-0c0a-4ebe-98ba-df72cb7bbc4c`
- canonical GitHub ruleset: ID `23000887`, `dev2-canonical-monotonic-v1`, active, scoped only to `refs/heads/dev-2`, rules `deletion` and `non_fast_forward`, no bypass actors

The public provider readback agreed that `refs/heads/dev-2` was exactly `a5d56f211d6cbaa169c7d7aae61ccdc49e2cc9` at the starting check.

## 3. Disposable fixture decision

No disposable F3 ref was created.

Read-only provider discovery found no existing `refs/heads/research/` ref. The repository does contain many `refs/heads/dev2-exec/` refs, but D0006 owns that prefix as managed execution-session state; those operational refs were not repurposed as a research publication fixture.

The available GitHub connector can create a branch and can move a branch with `{branch_name, sha, force}`, but its ref-update operation has no `expectedOld` / lease precondition argument. That is insufficient for this F3 because the required fixture must support exact expected-old-ref CAS, not merely a non-force update.

## 4. Exact-CAS and sender capability actually present

Current source contains the production exact-CAS transport in `src/integration/git-ref.mjs`. It verifies the effect binding and direct-child commit, then runs Git push with:

`--force-with-lease=<full-ref>:<exact-expected-head>`

Current source also contains `DurableGitSender` and `tools/git-sender.py`. The sender persists one invocation identity per effect, holds an OS file lock inherited by the Git child, distinguishes stopped/alive/unknown, and refuses a second sender while the retained invocation may still be live. Local integration tests exercise lost sender stdout, exact direct-child CAS, pre-launch fencing and a contending child.

However, the currently exposed `dev-2` mutation API binds integration to the repository binding's single canonical ref. It does not accept an arbitrary target ref or sender configuration. Exposing such an argument would itself cross a security/integration boundary and was not added for this research.

The hosted validation profiles are also `network:none`; D0005 intentionally withholds canonical Git writer credentials from candidate/hosted validation containers. Therefore a candidate or normal `run`/`validate` action cannot be used as a hidden provider writer for the research ref.

## 5. Why mutation stopped

The user-specified F3 stop conditions include stopping when expected-old-ref CAS is not guaranteed or when fixture credential/isolation is not established.

Creating a research branch through the connector and then treating connector `update_ref(force=false)` as F3 CAS would weaken the exact-CAS condition that D0003 explicitly preserves. Likewise, granting a disposable workflow a repository-wide write token merely to manufacture a sender would broaden the trust/credential boundary without an established fixture-scoped credential and would not exercise the installed native sender/controller recovery path.

Accordingly no remote research ref mutation, workflow write-token experiment, product release activation, public schema change or production H2 implementation was performed.

## 6. Frozen experiment identity

No F3 experiment identity was frozen because a conforming disposable fixture could not be admitted safely.

The following requested values therefore remain intentionally **not created / unknown**, not fabricated:

- disposable ref
- expected old fixture head H
- composed result ID
- exact composed commit C and tree U
- result manifest digest
- composed-result validation ID
- frozen member tuple and member work/action/request/generation/revision identities
- logical shared publication effect E
- physical F3 sender/run/attempt identity

This evidence does not reuse canonical product identities as substitutes for those fixture identities.

## 7. Old-sender survival / response loss / cancellation

Not executed at the hosted provider layer because the conforming exact-CAS disposable sender could not be admitted through an authorized interface.

Consequently these F3 invariants remain unknown at hosted scope:

- one logical E across all frozen members after controller restart
- no second physical sender while old sender is uncertain
- follower cancellation cannot escape the shared effect
- response loss plus restart converges from retained identity
- all-member terminal settlement remains externally 0/N or N/N
- replay/same-request retry remains sender-idempotent at the hosted publication boundary
- unrelated work progresses while the hosted group effect is uncertain

Local F2 evidence is not promoted to hosted PASS for these cells.

## 8. Provider/readback capabilities confirmed

Read-only provider access can independently obtain repository identity, branch/ref HEAD, commits/ancestry, rulesets and workflow-run state. This is sufficient for the authoritative observation side of F3 once a safe sender exists.

The missing capability is on the mutation/fault side: an authorized fixture-scoped invocation of the installed exact-CAS sender against a disposable ref, plus a controlled crash/restart barrier that can leave that sender alive or plausibly live while the controller restarts.

## 9. Smallest authorized execution method

The smallest next method is a **private, one-shot research operator harness on the existing Termux control host**, not a new public MCP operation and not a production H2 implementation.

It should:

1. create one explicit disposable `research/f3-<id>` ref at a recorded H using existing provider authority;
2. create a research-only sender configuration fixed to exactly that repository/ref and private state directory;
3. prepare one direct-child C of H whose tree U is the already fully required-validated exact composed result;
4. invoke the existing `tools/git-sender.py`/`DurableGitSender` semantics, retaining invocation/effect identity;
5. insert a test-only dispatch barrier around the real Git process so the controller can be killed/restarted while the sender remains alive or may still publish;
6. cancel one frozen follower after E is durable;
7. restart the controller/ledger owner and reconcile exclusively from retained identities, sender lock/state and independent GitHub ref/ancestry readback;
8. repeat observe/resume/same-request retry and verify that no second sender/effect is created;
9. run an unrelated work while the publication remains uncertain;
10. delete the disposable research ref only after sender stop and retained evidence are authoritative.

The harness must hard-code the disposable ref and repository identity, expose no arbitrary shell/ref input, and must not reuse `refs/heads/dev-2` or `refs/heads/dev2-exec/*`. If the available credential cannot be constrained or the fixed harness cannot prove it will only write the disposable ref, keep F3 blocked.

## 10. Verdict and next exact falsifier

Verdict: **F3 blocked**.

F4: **not ready**.

Next exact falsifier: run the one-shot private Termux/provider harness above with a frozen validated composed result and the installed exact-CAS sender, then execute the old-sender-survival + response-loss + follower-cancellation + controller-restart sequence. Independent GitHub ref/ancestry and sender stopped/alive/unknown evidence must decide the A-F recovery branch; unavailable evidence must remain unknown.
