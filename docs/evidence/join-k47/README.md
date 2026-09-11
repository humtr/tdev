# Functional implementation join: k47

Implementation started from fresh remote `2807644416d776e58be43bb45ae8a1187e933d28`.
Current imported authority and selected P3/P4 source is
`b76394c642506bf37c958fe290fd8c1abd38cb36` (peer source commit `7d76762`).
The sole parentless root remains `9a42b05d403370b7b4a698b4d7440d58aa4a79b5`.
No predecessor code/history or old runtime was merged or changed.

Two task-created managed workspaces were reported orphaned by the tmcp owner.
Each rejected workspace was retained without further mutation. A separate
registered checkout (`dev2-k47-bootstrap`) now owns this execution. This is an
explicit bootstrap repair, not a dev-2 product dependency. The source and lane
snapshots were preserved; P3/P4 now come from the peer's published commit.
P1/P2 copies are frozen join inputs pending the current peer owner's publication;
they must not replace that publication. P5/P6/P7/P8 continue here.

Actual completed checks under checksum-verified official Node 24.21.0/Linux arm64
in the project-local PRoot bootstrap environment:
- Five joined tests: source creation, two required real Node validation processes,
  exact Git CAS, terminal readback, prepared-result reuse, atomic rejected edits,
  failed validation preventing publication, bounded four-tool projections.
- Four authenticated real HTTP tests: full four-tool source development loop,
  modern/legacy protocol, signed JWT audience and current grants, origin/host,
  body/method limits, closed output enforcement, and disconnect/retry semantics.
- Six authenticated validation tests, including current observer epoch distinct
  from immutable launch identity. The old implementation failed the new adoption
  test before the receipt contract and D0003 were corrected.

These are core/integration observations, not production OS sandbox, live ChatGPT,
rootless execution, runtime activation, 8-way same-ref performance or superiority
acceptance. PRoot is explicitly not an OS security boundary. Runtime recovery,
release composition and the remaining joined tests are ongoing in this execution.

Bootstrap exception: tmcp project-local execution, GitHub reads/CI and Git pushes
are necessary because no usable canonical dev-2 installation exists yet. None of
these is selected as an ordinary product dependency. No credential value, host
provisioning, provider deployment or legacy external-state mutation occurred.
