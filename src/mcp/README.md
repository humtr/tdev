# MCP boundary

This directory owns the typed public MCP contract and wire projection used by the current dev-2 runtime. It is a module boundary, not a standalone deployment or a second state owner.

The public surface remains four tools: `dev_context`, `dev_read`, `dev_work`, and `dev_observe`. `input-schemas.mjs` defines their closed input shapes and independent batched work-item admission; `protocol.mjs` owns supported wire revisions and request/result encoding; output/schema modules own the bounded projections. Trusted human identity, authorization, durable Work/action state, repository access, execution, integration, release control, and observation are supplied by their existing runtime owners.

`dev_work` admits the typed lifecycle operations selected by the current runtime: create, edit, configured run, required validation, exact integration, cancel/resume, policy adoption, release staging, and release activation. A durable mutation is not cancelled merely because a client observation disconnects. Request identity/deduplication and work/effect recovery remain owned by the native ledger/runtime contracts.

D0006 explicit rollback and fixed native/helper controls are private operator boundaries. They are not a fifth public tool or a generic `dev_work` rollback variant.

All fixed object shapes reject unknown properties. Profile parameters remain bounded data, not permission; installed policy and authorization select what may execute. Candidate input cannot replace trusted identity, toolchain, validation, provider credentials, or release authority. Source/path limits and Git semantics remain owned by the repository/integration Designs rather than this adapter.

The current production runtime composes this contract through the authenticated workers.dev edge and connected Termux/Android native runtime. Historical P-lane/bootstrap notes belong in retained evidence and Git history, not in this module README as unfinished current status.
