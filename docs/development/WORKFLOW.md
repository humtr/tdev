# tdev self-development workflow

> Normative owner for how tdev itself is developed across Termux, GitHub and derived agent workspaces. This is a self-development contract, not product runtime behavior.

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

Prefer reconstruction through normal Git mechanisms (clone/fetch/bundle/archive plus verified history) over copying another machine's `.git` directory byte-for-byte. A raw `.git` copy can carry paths, worktree metadata, hooks, alternates or platform-specific state that are not valid in the new environment.

## 2. Git identity and observation

A Git commit SHA identifies one immutable commit object. The same object may exist simultaneously in Termux, GitHub, ChatGPT and CI repositories.

The SHA is not inherently "remote" or "local". What differs by location is which mutable ref currently points to it.

Always distinguish:

```text
GitHub published head: <ref> @ <sha>
Termux local head:     <ref> @ <sha>
working mirror head:   <branch/detached> @ <sha>
```

Do not report an unqualified "HEAD" when the location matters.

The active `mvp-*` ref elects the integrated development direction at its observed location. Group branches and candidate commits are work lanes until integrated; they do not redefine product semantic authority.

## 3. Synchronization principle

The governing rule is:

> **Synchronize when possible; progress when not; never lose provenance; reconcile later.**

Synchronization is attempted before new work when practical, but inability to reach one plane is not by itself a reason to abandon work that can safely proceed on another plane.

Availability must not require an unrealistically perfect state. Consistency is preserved by explicit identities, ancestry and reconciliation debt rather than by blocking all progress until every location is simultaneously reachable.

## 4. Development synchronization states

Use these states for repository-development coordination. They are operational observations, not product states.

| State | Meaning | May work continue? |
| --- | --- | --- |
| `SYNCED` | observed Termux and GitHub integration heads identify the same commit | yes |
| `TERMUX_AHEAD` | local commit(s) descend from the published remote head and are not yet published | yes; record publication debt |
| `GITHUB_AHEAD` | published remote head descends from the observed Termux head and local reconciliation has not happened | yes; record local sync debt |
| `CANDIDATE_AHEAD` | a group/agent/CI candidate exists beyond the integrated head | yes on that lane; do not mislabel it integrated |
| `UNOBSERVED` | one location cannot currently be read | yes if the available plane has sufficient authority; record what is unknown |
| `DIVERGED` | Termux and GitHub contain independent descendants after a common predecessor | limited; preserve both and reconcile before pretending one linear integration head exists |
| `BLOCKED` | the required capability exists only on an unavailable plane and cannot be safely substituted | no for that specific gate; unrelated gates may continue |

A non-`SYNCED` state is **sync debt**, not automatically failure. The failure is losing the exact observed identities/ancestry or overwriting one side without reconciliation.

## 5. Work-start protocol

Before substantive work:

1. read `AGENTS.md`, `RULE.md`, `SDD.md`, `WORKBOARD.md`, `docs/DOCUMENTATION.md`, `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, the current group execution file and the active Design if any;
2. observe the current GitHub integration ref directly;
3. observe Termux/local status when available;
4. observe the working mirror status when one exists;
5. record exact SHAs and their relationship (`equal`, `ancestor`, `descendant`, `diverged`, `unobserved`);
6. attempt the cheapest safe synchronization;
7. if synchronization cannot complete, choose the available work plane, state the debt, and continue only within that plane's actual capabilities;
8. never invent the state of an unavailable plane.

Recommended observation form:

```text
Work-start identities

GitHub published head: mvp-1a-7 @ <sha-or-unobserved>
Termux local head:     mvp-1a-7 @ <sha-or-unobserved>
Working mirror head:   <branch> @ <sha-or-unobserved>
Relationship:          <equal/ancestor/diverged/unobserved>
Sync attempt:           <result>
Decision:               <where work will continue>
Reconciliation debt:    <none or exact follow-up>
```

## 6. Reconciliation rules

### Simple remote-ahead case

If local `C` is an ancestor of GitHub `C1`, reconcile by fetch plus fast-forward-only update when local access returns.

### Simple local-ahead case

If GitHub `C` is an ancestor of local `C1`, publish using a normal non-force fast-forward after validation and re-observation of the expected predecessor.

### Divergence

If:

```text
      A  (Termux)
     /
    C
     \
      B  (GitHub)
```

preserve both descendants. Choose merge, rebase, cherry-pick or supersession from semantics/evidence; do not use `reset --hard` merely to make identities equal.

Already shared or independently verified commits should not be rewritten casually. Prefer ancestry-preserving integration when parallel Capability Group history is meaningful.

## 7. Branch model

### Integration development branch

`mvp-1a-7` remains the current integrated development-direction branch until an explicit owner decision changes the development direction itself.

A Design number, Group transition or verification milestone does not create another `mvp-*` branch.

### Capability Group work branches

Use `group/*` branches as long-lived **work-integration lanes** for a Capability Group when multiple related Designs should reach one group exit before integration.

Current branch:

```text
group/e-context-delivery
```

was created from exact published integration head:

```text
mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
```

Suggested future lanes, only when their work actually begins:

```text
group/f-cloudflare-runtime
group/g-mcp-security
group/h-deployment-qualification
```

Groups A-D are historical/verified foundations and do not require retroactive group branches.

A group branch:

- is not product authority;
- is not a new development generation;
- may contain several Design, implementation, evidence and review commits;
- may temporarily be ahead of `mvp-1a-7`;
- must record its exact base and integration dependencies;
- must be reconciled with the latest integration branch before final group integration.

## 8. Group integration strategy

Use the least history-destructive strategy that preserves validated provenance.

- If one group branch is the only descendant of the integration predecessor, a fast-forward is preferred.
- If multiple group branches advanced in parallel, an explicit merge commit is normally preferable because it preserves both validated histories and the integration event.
- Rebase may be used before commits are shared/validated when it materially simplifies integration and changes no evidence identity that must be retained.
- Do not squash away accepted Design, falsifier-fix, independent-validation or provenance commits by default.
- Never force-update the integration branch merely to make history look linear.

## 9. Codex / agent working-mirror rule

An automated coding agent should, when the environment permits:

1. materialize a complete Git checkout with `.git`;
2. verify the exact intended base SHA before edits;
3. work on the designated `group/*` branch or a subordinate temporary candidate branch;
4. keep the worktree clean between intentional commits;
5. run the declared source/focused/provider gates;
6. record exact source/evidence SHA identities;
7. publish only through a non-force path whose expected predecessor was reread;
8. report any Termux/GitHub/working-mirror mismatch as synchronization debt rather than silently correcting it.

If the agent lacks one plane, it should not stop merely because perfect synchronization is impossible. It should proceed on the available plane when the requested gate is actually executable there and leave a precise reconciliation record.

## 10. Work-completion protocol

Completion has two separate dimensions:

### Engineering completion

The requested Design/Group gate is implemented and verified in the plane capable of executing it.

### Synchronization completion

Known development replicas have been reconciled to the intended integrated state.

These may happen at different times.

A completion report must state both, for example:

```text
Engineering result: verified Group E candidate @ <sha>
GitHub: <sha>
Termux: <older sha; unavailable>
State: GITHUB_AHEAD
Reconciliation debt: fetch and ff-only after Termux access returns
```

Do not call unsynchronized replicas "equal". Do not call successful engineering work "failed" solely because a nonessential plane is temporarily unreachable.

## 11. Safety invariants

- Preserve unrelated local changes; never use `reset --hard` as a default sync mechanism.
- Never infer local state from a remote ref or remote state from a stale local tracking ref.
- `origin/<branch>` is only the last fetched observation in a local repository.
- Re-read the actual GitHub ref before publication when remote state matters.
- Record exact commit ancestry, not only filenames or archive hashes.
- Group branches organize development; `SDD.md` still controls whether Class 2 code is authorized.
- Product Git publication (`Promotion -> Git`) and tdev self-development Git synchronization are different systems and must never share authority by accident.
