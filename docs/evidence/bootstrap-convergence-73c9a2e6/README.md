# Bootstrap convergence and implementation diagnostics

Fresh start was `a1265adcab2d95b39759f60419fd77d407d1dbdb`, parent
`fd38a4f72f3cdaf80e35c706f20c7efaf7cbbfe1`, tree
`e99145c3609f330d0743dccb92e11a1a705b0420`; only parentless root was
`9a42b05d403370b7b4a698b4d7440d58aa4a79b5`.

A concurrent execution published F0 at `2a2e0dd513c969e77f9c39042cabb1780d9c8cfe`
before this execution's publication. The expected-old-HEAD check stopped the stale
push before mutation. The new remote HEAD/parent/tree and bootstrap owners were
rebound. All seven selected Designs had unchanged exact blob identities. The
published contract was adopted instead of merging a competing F0 contract.
The alternative `tmcp/dev2-f0-73c9a2e6` remains isolated; its 46 passing tests are
not claimed as canonical tests. No predecessor history was merged or deployed.

The canonical F0 source plus CI at `d10f42bb6bc782a820eb59bc4fc9333ea91a2989`
passed GitHub Actions run `34585079331` using checksum-verified official Node
24.21.0 on Linux x64. The same entrypoint also runs under the official pinned
Linux arm64 binary with a private PRoot library mapping on the authorized project
host. This is a bootstrap execution environment, not production OS isolation.

`input-seal-before.json` records a reproduced inventory omission: changing a new
checked benchmark module did not change the F0 report's input digest. The driver
now inventories `bench`; a disposable-clone regression test changes those bytes
and requires different input digests. This corrected an implementation omission,
not a falsification of D0007's exact-input requirement. No accepted Design,
required profile, superiority threshold or numeric trial requirement was weakened.

The diagnostic implementation measures declared schema shape and summarizes
supplied execution spans, preserving failed/cancelled attempts, repeated exact
validation, missing terminals, full observation time and independent overlap.
Its outputs explicitly do not authenticate receipts or establish performance,
ChatGPT usability, or superiority. The 36-validation/8-work fixture tests counting
only; it is not a measured dev-2 workload. No new runtime coordinator, service,
queue, journal, model, compatibility adapter or qualification gate was introduced.

The actual dev_work/ChatGPT test requires the P7 schema and canonical installation.
Same-ref W4 requires joined real preparation, full validation and integration.
D0007's repeated cohorts remain release/performance-decision work, not per-edit
requirements. No live/product-speed conclusion follows from the diagnostic tests.

Bootstrap exception: GitHub reads, tmcp project-local shell, and Git publication
were used because dev-2 does not yet expose a working canonical development MCP.
Only task-owned worktrees and explicit dev-2 publication are mutated. Existing
P1-P8 work is preserved. Transition ordinary development to dev-2 once its
required capabilities and live authorization boundary actually exist.
