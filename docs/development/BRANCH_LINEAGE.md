# tdev cumulative checkpoint branch lineage

> Normative self-development owner for post-D0015 branch progression. This file defines how completed Capability Groups accumulate in Git history. It does not define product runtime authority.

## 1. Governing model

Post-D0015 development is a **single cumulative checkpoint lineage**, not a set of parallel Group branches that are later merged into an integration branch.

The intended ancestry is:

```text
mvp-1a-7  (legacy cumulative baseline through D0015)
    |
    v
group/e-context-delivery  (E cumulative checkpoint when complete)
    |
    v
group/f-cloudflare-runtime  (E + F cumulative checkpoint when complete)
    |
    v
group/g-mcp-security  (E + F + G cumulative checkpoint when complete)
    |
    v
group/h-deployment-qualification  (E + F + G + H cumulative checkpoint when complete)
    |
    v
<mvp prototype branch>  (forked from the exact final Group H head)
```

There is no planned step that gathers independently advanced Group branches and merges them back into `mvp-1a-7`.

## 2. `mvp-1a-7` meaning after D0015

`mvp-1a-7` is retained as the last cumulative legacy/development baseline before the Capability Group checkpoint sequence begins.

Exact Group E creation predecessor:

```text
mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
```

After Group E begins:

- do not fast-forward `mvp-1a-7` merely to absorb Group E/F/G/H work;
- do not use `mvp-1a-7` as a merge collector for completed Groups;
- preserve it as an ancestry/reference checkpoint for the verified D0010-D0015 legacy accumulation;
- any later correction to that historical ref requires an explicit owner decision rather than ordinary Group progress.

Older repository text that calls `mvp-1a-7` the continuously mutable integration destination is superseded for **post-D0015 branch progression** by this file. Historical claims about what D0010-D0015 were verified on remain valid.

## 3. Group checkpoint lifecycle

A Group branch has two phases.

### Active phase

The current Group branch is mutable through normal non-force development while its Designs, implementation, evidence and verification are still in progress.

### Completed checkpoint phase

When the Group exit criteria are satisfied:

1. record the exact final Group head and verification evidence;
2. treat that Group ref as a retained cumulative checkpoint;
3. create the next Group branch from **that exact final Group head**;
4. continue development only on the successor Group branch unless a specific historical correction is explicitly authorized.

The completed Group ref is therefore both:

- a durable label for the product/development state at that Capability Group boundary; and
- the immutable ancestry predecessor for the next Group's normal development line.

## 4. Successor creation rule

A successor Group branch must be created only after its predecessor Group is complete enough to serve as the intended checkpoint.

Required observation before creation:

```text
Predecessor group: <group/ref>
Predecessor final head: <exact sha>
Verification state: <verified/accepted exit evidence>
Successor group: <group/ref>
Created from: <same exact sha>
```

Do not create Group F from `mvp-1a-7` after Group E has accumulated work. Group F must descend from the final Group E head. Likewise G must descend from final F, and H from final G.

## 5. Cross-Group Designs

A Design may affect capabilities associated with an earlier or later Group, but branch ancestry remains linear.

Examples:

- D0018 is D/E-facing but is completed on the active Group E lineage if Group E requires it.
- D0025 is C/F-facing but is implemented on the then-active cumulative Group F lineage rather than reopening a separate Group C branch.
- D0027 may span F/G/H; its work occurs on whichever active cumulative checkpoint owns the next unresolved gate, with later Groups inheriting all earlier accepted work automatically through ancestry.

Capability ownership and branch labels are related planning concepts, not separate histories that must later be merged.

## 6. Prototype fork

After the final required Capability Group is complete and the final deployed qualification has passed, create an MVP prototype branch from the **exact final head of the last Group branch**.

The prototype branch is a retained product-development artifact derived from the fully accumulated checkpoint chain. It is not assembled by merging the historical Group refs.

The exact prototype ref name is selected and recorded at the final Group H / qualification gate; do not create or pre-authorize that final ref merely from this planning document.

## 7. History preservation

- Use normal fast-forward ancestry within the active Group line.
- Do not force-update completed Group checkpoints as routine development.
- Do not squash away accepted Design, falsifier-fix, verification or provenance commits merely to shorten the checkpoint history.
- Temporary candidate branches may be used inside one active Group, but accepted work must land on the active Group branch before that Group is declared complete.
- If a true divergence occurs on the active Group branch across Termux/GitHub/agent planes, reconcile that divergence before electing the Group checkpoint head; this is replica reconciliation, not Group-branch aggregation.

## 8. Current position

Current legacy predecessor:

```text
mvp-1a-7 @ 83e9610d79b4ad70858e4dd7fe3625052336a92c
```

Current active cumulative branch:

```text
group/e-context-delivery
```

Group E is not yet a completed checkpoint. Its current remote head may advance while D0016-D0018 and applicable dependencies are executed.

The next branch `group/f-cloudflare-runtime` must **not** be opened as a parallel branch from `mvp-1a-7`; it is opened from the exact final Group E head after the Group E exit record is accepted.

## 9. Precedence and terminology

For post-D0015 branch progression, this file owns the branch-lineage rule. `WORKBOARD.md` and `LINEAGE.md` retain historical verified-state information, but any older statement that future Group work should be fast-forwarded or merged back into `mvp-1a-7` is legacy wording and does not control the checkpoint sequence.

Use these terms:

- **legacy baseline** — `mvp-1a-7` at the Group E creation predecessor;
- **active cumulative branch** — the one current Group branch receiving new accepted work;
- **completed Group checkpoint** — a retained Group ref whose exit is accepted;
- **successor checkpoint branch** — the next Group branch created from the exact completed predecessor head;
- **prototype fork** — the final MVP prototype ref created from the exact last Group head.
