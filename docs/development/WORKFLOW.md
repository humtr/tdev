# tdev self-development workflow

> Normative owner for how tdev itself is developed across available repository, execution and publication planes. `WORKBOARD.md` owns the current route; `LINEAGE.md` owns checkpoint succession. This is a self-development contract, not product runtime behavior.

## 1. Operating model

Development can use multiple planes with different capabilities. A plane is authoritative only for the facts it actually owns.

### Local execution checkout

A capable local checkout may perform filesystem edits, Git operations, tests, processes and local runtime probes. It can be the strongest execution plane without becoming product authority or current-route authority.

### Remote repository

The remote Git provider is the durable publication/collaboration plane for commits and refs. It owns the current observation of its mutable refs. It does not prove local filesystem/process or provider-runtime state.

### Working mirror / CI

Agent worktrees and CI checkouts are derived engineering mirrors. Prefer complete Git-aware mirrors at exact commits. They are disposable; losing one must not lose product or development authority.

## 2. Plane health, access and observation

Keep these separate:

```text
plane health                healthy / unhealthy / unknown
route or service health     healthy / unhealthy / unknown
current-session capability  available / unavailable / unknown
observed repository state   <ref @ sha> / last-observed / unobserved
```

A healthy plane may be inaccessible to the current session. Missing current-session tooling does not prove the plane is broken. A user report that a route is healthy does not itself update an exact Git identity.

When a required plane cannot be freshly observed, label that fact `unobserved` or `last-observed`; never silently upgrade it to current.

## 3. Git identity and current route

A commit SHA identifies an immutable object. A branch/ref is mutable and must be named with the location whose state was observed.

Always distinguish when relevant:

```text
remote active ref:    <ref> @ <sha-or-unobserved>
local active ref:     <ref> @ <sha-or-unobserved>
working mirror:       <ref/detached> @ <sha-or-unobserved>
```

Before `WORKBOARD.md` can resolve the route, bind the exact published snapshot that supplies it using the current `AGENTS.md` authority-location contract. `concept-*` refs are excluded before candidate WORKBOARD parsing. With no self-declaring route-mode marker, the verified D0031 legacy predecessor/ancestry election remains active. During the D0036 bridge, exactly one self-declaring `persistent-v1` candidate must exist and the legacy resolver must independently elect the same exact `ref@sha`; any malformed/competing marker, predecessor/ancestry failure or resolver disagreement is `BLOCKED` for the dependent mutation.

A byte-identical `development` seed does not become authority by ref existence alone. It becomes the work/publication route only after its own WORKBOARD self-declares `development` and the bridge equality gate succeeds. Terminal removal of legacy fallback is separately proved later in D0036.

Resolve the active cumulative Group and branch only from the `WORKBOARD.md` in that bound snapshot. Under D0036 the Group may advance while the branch remains `development`. Do not infer either field from repository default, an old Design, historical report, handoff, Task transport branch, timestamps, branch naming, mere ref existence or prior Group succession.

The normal capable local checkout should track the active cumulative branch when safe. If it is on a completed/predecessor branch, that is `CHECKOUT_ALIGNMENT_DEBT`, not a second route authority. The provider default may likewise be aligned as a compatibility/discovery pointer only after current authority is already resolved. Preserve unrelated dirty state; align safely or use an isolated worktree from the exact current active ref.

## 4. Synchronization states

Use these observations only for replicas of the same active development ref:

| State | Meaning | May dependent work continue? |
| --- | --- | --- |
| `SYNCED` | observed local and remote active refs identify the same commit | yes |
| `LOCAL_AHEAD` | local descendant is not yet published | yes; publication debt |
| `REMOTE_AHEAD` | remote descendant is not yet reconciled locally | yes; local sync debt |
| `CANDIDATE_AHEAD` | isolated candidate descends from active ref | yes on candidate; not checkpoint completion |
| `UNOBSERVED` | one relevant plane cannot be freshly read | yes if the requested gate is independently executable elsewhere |
| `DIVERGED` | replicas of the same active ref contain independent descendants | limited; preserve both and reconcile before checkpoint election |
| `BLOCKED` | required capability exists on no currently usable authorized plane | no for that dependent gate |

Intentional ancestry differences between completed and successor Group refs are not synchronization debt. A stale canonical checkout on a completed ref is checkout-alignment debt because the checkout is supposed to follow the current route.

## 5. Work-start protocol

Before substantive mutation:

1. locate and bind one exact published current repository snapshot under the current `AGENTS.md` authority algorithm (legacy D0031 before a route marker; D0036 dual-resolver equality during the bridge) unless a trusted immutable identity is already supplied;
2. complete the fixed bootstrap from that bound snapshot: `RULE.md`, `SDD.md`, `WORKBOARD.md`;
3. confirm the bound ref matches the active branch declared by `WORKBOARD.md`, then resolve the active cumulative branch, runnable Design revision references, selected next action and live debts from it;
4. load this workflow when execution/replica/publication state matters, and `LINEAGE.md` when checkpoint succession matters;
5. load every Design referenced by the selected/dependent Class 2 gate and the affected normative product owners required by the scope; verify the referenced Design revision is currently `accepted` or `implementing` before mutation;
6. observe the current remote active ref directly when remote identity matters;
7. observe local checkout branch, HEAD, upstream and dirty state when local access exists;
8. observe any working mirror used for the change;
9. record exact relationships (`equal`, `ancestor`, `descendant`, `diverged`, `unobserved`);
10. attempt the cheapest safe alignment/reconciliation needed by the current gate;
11. if one plane is unavailable or unsafe to align, preserve state, record exact debt, and continue only on a plane that can independently execute the requested gate;
12. never invent the state of an unavailable plane.

A handoff may provide candidate identities and prior observations, but each mutable fact is rebound to its current owner before use.

## 6. Isolated work and canonical integration

Parallel work is the default development posture. Capacity one is the same model with one executor.

- Independent investigations or implementation candidates may use isolated worktrees/branches at exact bases.
- Ordinary work produces isolated changes; canonical integration/commit/publication uses one controlled lane.
- A tool-owned worktree branch is transport bookkeeping unless repository authority explicitly elects it as a development ref.
- Preserve unrelated files, worktrees, refs, processes and credentials.
- Do not use `reset --hard`, cleaning, force-push or history rewriting as a default reconciliation technique.

When two candidate lines differ semantically, compare them against the accepted Design and falsifiers before choosing integration mechanics. Git convenience cannot choose product meaning.

## 7. Replica reconciliation

### Remote ahead

If the observed local active head is an ancestor of the current remote active head and the local checkout is safe to update, fetch and fast-forward only.

### Local ahead

If the current remote active head is an ancestor of the validated local candidate, publish by normal non-force fast-forward after freshly rereading the expected remote predecessor.

### Diverged

Preserve both descendants. Choose merge, rebase, cherry-pick or semantic supersession only after inspecting the complete differences and current authority. Already shared or independently evidenced commits are not rewritten casually.

After an ambiguous remote write, reread the provider ref before retrying.

## 8. Checkpoint transition

Checkpoint creation and successor rules come from `LINEAGE.md`; capability exit intent comes from `ROADMAP.md`; `WORKBOARD.md` supplies the current instance.

When the active Group exit is satisfied:

1. re-observe the exact active `development` head on required planes;
2. finish required source/provider/target validation;
3. record the exact checkpoint commit, Design/evidence identities and unresolved boundaries;
4. reconcile debt required to trust the completed Group checkpoint;
5. retain an additional ref only when the current lineage/consumer/recovery contract requires one;
6. update `WORKBOARD.md` to the successor Group while keeping `development` as the active route;
7. publish that update only as a normal non-force descendant of the exact completed checkpoint;
8. align capable local/default operational pointers when safe, otherwise record exact alignment debt; alignment is compatibility/discovery state, never route election;
9. reread any aligned provider/default pointer when its alignment is part of checkpoint evidence;
10. do not update retained legacy refs merely to mirror later development.

A future prototype/ref topology change follows the then-current accepted owner in `LINEAGE.md`; it is not implied by reaching the final planned Group.

## 9. Publication safety

Before repository publication verify:

```text
repository/remote identity
current route from WORKBOARD
candidate exact HEAD
complete effective diff from exact base
clean or explicitly preserved worktree/index state
fresh remote destination ref
expected remote predecessor
ancestry / non-force fast-forward condition
required validation evidence
```

Publication admission is not completion. After a push or equivalent mutation, reread the remote ref and prove that it names the intended commit.

Product Git publication performed by tdev runtime and repository self-development publication remain separate systems and must not inherit authority from one another.

## 10. Completion layers

Report applicable layers independently:

- engineering/source result;
- validation result;
- repository publication result;
- replica alignment result;
- checkpoint election result;
- runtime/provider/client result when actually in scope.

One layer cannot silently stand in for another. A successful source gate does not prove provider deployment; temporary inability to observe a nonessential plane does not erase independently completed engineering work.

## 11. Safety invariants

- Preserve unrelated local changes and historical evidence.
- Never infer local state from a remote ref or current remote state from a stale local tracking ref.
- Treat mutable remote heads as fresh observations, not cached law.
- Keep current routing in `WORKBOARD.md`, succession law in `LINEAGE.md`, and product semantics in their named product owners.
- `SDD.md` controls Class 2 authorization and correction lifecycle.
- Unknown migration, rollback, credential, provider and external-effect state stays explicit.
