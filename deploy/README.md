# Phase A installation and provider boundary

Authority: DIRECTIVE r3 and D0004-D0007. This is the authorized bootstrap path,
not the public release.stage/release.activate implementation or a production seal.

Build committed clean source with `node tools/build-edge.mjs` and
`node tools/build-device.mjs`. The edge uses ahead-of-time JSON Schema validators;
its schema and exact descriptors are identical to native output projection.
Immutable Worker/device bundles and private installation configuration are installed
outside any development worktree by `tools/install-phase-a.mjs` from a private
provider/repository-bound plan. That plan, installation manifest and credentials
are deliberately not stored in Git. Current paths/IDs are installation state.

The installer prepares a new native runit service in the stopped state. It does
not overwrite another service, migrate old tdev state, start untrusted source,
change provider routing, or grant release eligibility. Native Git and SQLite are
the durable owners. GitHub and device credentials are separate private files and
never enter candidates, tool results, edge human responses or candidate execution.
The device initiates its authenticated connection; no Termux public listener exists.

`deploy/cloudflare.py read` verifies the exact workers.dev origin, active deployment,
Access audience/domain/OAuth policy IDs and current bindings. `deploy` requires the
fresh expected active version. It uploads only the reviewed immutable Worker,
new dev-2 device secret, runtime config, version metadata and routing DO binding.
Any retired predecessor local DO class must be explicitly named in installation
state; unrelated Workers/D1/Access and account resources are never deleted.
Preserving old live state is not a goal. Provider rejection is surfaced, never
worked around through a hidden predecessor compatibility layer.

The existing human Access application is explicitly adopted, preserving its ChatGPT
OAuth registration. The Worker and native runtime both verify the actual signed
human Access assertion. Device credentials do not authenticate `/mcp`. A separately
authenticated fixed installation readback exposes published descriptors, edge/device
identity and a read-only current context/AGENTS/WORKBOARD/runtime/open-work probe.
That probe is labeled installation evidence, not a refreshed human OAuth transcript.

After provider cutover start the prepared service with native runit, then verify
actual provider identity, route, authentication rejection, device reconnect and
fixed readback. Record PASS/FAIL/NOT RUN by layer. Update repository-resident resume
evidence and publish/read back the coherent dev-2 branch before requesting the
single ChatGPT Refresh. Mutable paths and IDs must be rebound from current
installation state, not copied from this document as authority.

Provider API contract used: Cloudflare Workers multipart upload and declarative
Durable Object exports, read September 12, 2026:
https://developers.cloudflare.com/api/resources/workers/
https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
