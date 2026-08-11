# tdev self-development workflow

> Normative owner for how tdev itself is developed across Termux, GitHub and derived agent workspaces. Branch succession after D0015 is owned by `docs/development/BRANCH_LINEAGE.md`. This is a self-development contract, not product runtime behavior.

## 1. Operating model

`tdev` development uses three kinds of work location with different capabilities.

### Termux local checkout

Termux is the full-capability local execution plane when connected and authorized.

It can own or perform:

- local filesystem edits;
- `.git` object/ref operations;
- local tests, processes and runtime probes;
- commits, branches, fetch, merge, rebase when explicitly justified, and push;
- local Agent/runtime work that GitHub cannot perform;
- remote Git operations when network/credentials are available.

Termux is not required to be continuously reachable for all repository work. Loss of local connectivity is an availability limitation, not automatic proof that GitHub-side work must stop.

### GitHub repository

GitHub is the durable remote publication/collaboration plane.

It can own or perform:

- durable Git objects and refs;
- remote branch creation/update;
- repository documents and source edits through supported connector/API paths;
- Issues, PRs and provenance records;
- GitHub Actions validation and artifacts;
- a repository-visible source of truth that independent sessions can reread.

GitHub does not possess the Termux filesystem/process environment and cannot substitute for local-only runtime evidence.

### ChatGPT / CI working mirror

A ChatGPT container such as `/mnt/data/tdev`, a Codex checkout, or a CI runner is a **derived Git-aware engineering mirror**.

When possible, it should be a complete `.git` repository at an exact observed commit so that agents can use ancestry, diff and status instead of loose file copies. It is nevertheless disposable and non-authoritative: container loss must not lose product or development authority.

Prefer reconstruction through normal Git mechanisms over copying another machine's `.git` directory byte-for-byte.

## 2. Git identity and observation

A Git commit SHA identifies one immutable commit object. The same object may exist simultaneously in Termux, GitHub, ChatGPT and CI repositories.

The SHA is not inherently "remote" or "local". What differs by location is which mutable ref currently points to it.

Always distinguish:

```text
GitHub active branch:   <ref> @ <sha>
Termux local branch:    <ref> @ <sha>
working mirror branch:  <ref/detached> @ <sha>
```

Do not report an unqualified "HEAD" when the location matters.

For post-D0015 development there are two different branch roles:

- `mvp-1a-7` is the retained legacy baseline through D0015;
- exactly one `group/*` branch is the active cumulative development branch at a time.

The current active cumulative branch is `group/e-context-delivery`.

## 3. Synchronization principle

The governing rule is:

> **Synchronize when possible; progress when not; never lose provenance; reconcile later.**

Synchronization is attempted before new work when practical, but inability to reach one plane is not by itself a reason to abandon work that can safely proceed on another plane.

Availability must not require an unrealistically perfect state. Consistency is preserved by explicit identities, ancestry and reconciliation debt rather than by blocking all progress until every location is simultaneously reachable.

Plane health and current-session access are separate observations; see `docs/development/ACCESS.md`.

## 4. Development synchronization states

Use these states for the **same active development ref** across repository locations. They are operational observations, not product states.

| State | Meaning | May work continue? |
| --- | --- | --- |
| `SYNCED` | observed Termux and GitHub active-branch refs identify the same commit | yes |
| `TERMUX_AHEAD` | local commit(s) descend from the GitHub active-branch head and are not yet published | yes; record publication debt |
| `GITHUB_AHEAD` | GitHub active-branch head descends from the observed Termux head and local reconciliation has not happened | yes; record local sync debt |
| `CANDIDATE_AHEAD` | a temporary agent/CI candidate exists beyond the active cumulative Group branch | yes on that candidate lane; do not mislabel it Group-complete |
| `UNOBSERVED` | one location cannot currently be read | yes if the available plane has sufficient capability; record what is unknown |
| `DIVERGED` | Termux and GitHub contain independent descendants of the same active branch predecessor | limited; preserve both and reconcile before electing a checkpoint head |
| `BLOCKED` | the required capability exists only on an unavailable plane and cannot be safely substituted | no for that specific gate; unrelated gates may continue |

A non-`SYNCED` state is **sync debt**, not automatically failure. The failure is losing exact identities/ancestry or overwriting one side without reconciliation.

Do not call the intentional difference between `mvp-1a-7` and `group/e-context-delivery` sync debt. They are different lineage checkpoints by design.

## 5. Work-start protocol

Before substantive work:

1. read `AGENTS.md`, `RULE.md`, `SDD.md`, `docs/DOCUMENTATION.md`, this file, `docs/development/ACCESS.md`, `docs/development/BRANCH_LINEAGE.md`, `WORKBOARD.md`, `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, the current Group execution file and the active Design if any;
2. identify the active cumulative Group branch from the branch-lineage/group document;
3. observe the current GitHub ref for that active branch directly;
4. observe Termux/local status for that same ref when available;
5. observe the working mirror status when one exists;
6. record exact SHAs and their relationship (`equal`, `ancestor`, `descendant`, `diverged`, `unobserved`);
7. attempt the cheapest safe synchronization of replicas of the active branch;
8. if synchronization cannot complete, choose the available work plane, state the debt, and continue only within that plane's actual capabilities;
9. never invent the state of an unavailable plane.

Recommended form:

```text
Work-start identities

Legacy baseline:       mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
Active cumulative ref: <group/ref>
GitHub active head:    <sha-or-unobserved>
Termux active head:    <sha-or-unobserved>
Working mirror head:   <sha-or-unobserved>
Replica relationship:  <equal/ancestor/diverged/unobserved>
Sync attempt:           <result>
Decision:               <where work will continue>
Reconciliation debt:    <none or exact follow-up>
```

## 6. Replica reconciliation rules

### Simple GitHub-ahead case

If local `C` is an ancestor of GitHub `C1` on the same active Group ref, reconcile by fetch plus fast-forward-only update when local access returns.

### Simple local-ahead case

If GitHub `C` is an ancestor of local `C1` on the same active Group ref, publish using a normal non-force fast-forward after validation and re-observation of the expected predecessor.

### Divergence

If two replicas contain independent descendants of one active Group predecessor, preserve both descendants. Choose merge, rebase, cherry-pick or supersession from semantics/evidence; do not use `reset --hard` merely to make identities equal.

Already shared or independently verified commits should not be rewritten casually.

This reconciliation is **not** a mechanism for combining Capability Groups. Capability Groups succeed each other linearly through `BRANCH_LINEAGE.md`.

## 7. Cumulative checkpoint branch model

The branch lineage is:

```text
mvp-1a-7
  -> group/e-context-delivery
  -> group/f-cloudflare-runtime
  -> group/g-mcp-security
  -> group/h-deployment-qualification
  -> <mvp prototype branch>
```

Each arrow means: create the successor from the **exact final verified head** of the predecessor checkpoint.

`mvp-1a-7` is not advanced to absorb Group E or later Groups. Group F is not created from `mvp-1a-7`; it is created from final Group E. G is created from final F; H from final G.

A Group branch:

- accumulates all earlier accepted Group history through ancestry;
- remains mutable only while that Group is active;
- becomes a retained checkpoint when its exit is accepted;
- is the exact base for the next Group branch;
- is not a product semantic authority merely because it is a checkpoint.

Temporary subordinate candidate branches may be used during one Group, but accepted work must land on the active Group branch before Group completion.

## 8. Group transition protocol

When the active Group exit criteria are satisfied:

1. re-observe the active Group head on GitHub and any required execution plane;
2. finish required source/provider/target validation;
3. record exact Design/evidence identities and unresolved boundaries;
4. reconcile replica sync debt required to elect a trustworthy final Group head;
5. record the exact final Group checkpoint SHA;
6. retain the completed Group ref;
7. create the next Group branch from that exact SHA;
8. update current Group pointers/documentation on the successor branch;
9. do not fast-forward or merge the completed Group back into `mvp-1a-7`.

If no further Capability Group remains, create the MVP prototype branch from the exact final Group head after final qualification and an explicit final-ref naming decision.

## 9. Codex / agent working-mirror rule

An automated coding agent should, when the environment permits:

1. materialize a complete Git checkout with `.git`;
2. verify the exact intended active Group SHA before edits;
3. work on the active cumulative Group branch or a subordinate temporary candidate branch;
4. keep the worktree clean between intentional commits;
5. run the declared source/focused/provider gates;
6. record exact source/evidence SHA identities;
7. publish only through a non-force path whose expected predecessor was reread;
8. report Termux/GitHub/working-mirror mismatch for the same active ref as synchronization debt rather than silently correcting it;
9. never create the next Group branch before the predecessor checkpoint is accepted.

If the agent lacks one plane, it should not stop merely because perfect synchronization is impossible. It should proceed on the available plane when the requested gate is executable there and leave a precise reconciliation record.

## 10. Work-completion protocol

Completion has separate dimensions.

### Engineering completion

The requested Design/Group gate is implemented and verified in the plane capable of executing it.

### Replica synchronization completion

Known replicas of the active Group branch have been reconciled enough to trust the elected checkpoint head.

### Group checkpoint completion

The final Group head is recorded and, only then, the successor Group branch may be created from that exact head.

These dimensions may complete at different times. A report must state them separately.

Example:

```text
Engineering result: Group E exit evidence complete @ <sha>
GitHub Group E: <sha>
Termux Group E: <older sha or unobserved>
Replica state: GITHUB_AHEAD
Checkpoint status: not yet elected / elected @ <sha>
Next branch: do not create until checkpoint election / group/f-cloudflare-runtime from <sha>
```

Do not call unsynchronized replicas "equal". Do not call successful engineering work "failed" solely because a nonessential plane is temporarily unreachable.

## 11. Safety invariants

- Preserve unrelated local changes; never use `reset --hard` as a default sync mechanism.
- Never infer local state from a remote ref or remote state from a stale local tracking ref.
- `origin/<branch>` is only the last fetched observation in a local repository.
- Re-read the actual GitHub ref before publication when remote state matters.
- Record exact commit ancestry, not only filenames or archive hashes.
- Do not merge Group E/F/G/H back into `mvp-1a-7` as normal progression.
- Do not create a later Group from an older legacy baseline when a completed predecessor Group exists.
- `SDD.md` still controls whether Class 2 code is authorized.
- Product Git publication (`Promotion -> Git`) and tdev self-development Git synchronization are different systems and must never share authority by accident.
