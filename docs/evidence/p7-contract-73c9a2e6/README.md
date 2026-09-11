# P7 input and wire contract implementation

Base: `6a730d8076430f297ff8e6f90141799c722343a4`, whose shared F0 was published
before this isolated lane began. No alternative F0 ports, predecessor code or
predecessor ancestry were imported. This is a P7 sub-frontier, not completed P7,
J1, self-development or full MCP transport acceptance.

Implemented source: `src/mcp/input-schemas.mjs`, `src/mcp/protocol.mjs`.
Pinned core result: **52 tests passed, 0 failed**, checked JSDoc passed and
repository document checks passed. Of these, 20 input-contract tests and 14 wire
codec tests are new P7 checks; the earlier 18 F0/diagnostic tests also passed.

Actual checks: all ten work variants, unknown fields, deterministic defaults,
uint64 boundaries, counts 1/8/16/32/64, input byte bounds, bounded read target/query
combinations, five observation selectors, malformed sibling isolation, concurrent
admission callbacks, authorization before replay lookup, secret-redacted failures,
modern and legacy transcript envelopes, metadata/header mismatch, unsupported
version, request-ID error correlation, invalid UTF-8, endpoint origin/host rejection
and tool-level errors in complete results.

The checked per-item admission callback is not a ledger implementation. Mocked
retry/overlap tests do not establish process-level 8-way execution or provider
exact-once effects. All fixed input objects are closed. Profile parameters remain
bounded explicit JSON data and must pass the adopted profile's own schema before
execution. No generic shell or operation registry is exposed.

`schema-shape.json` is generated from the actual exported input descriptors, not a
hand-authored estimate. Local definition reachability avoids repeating the ten
work variants in the other three tools. Bytes/union width do not establish token
cost, error rate or ChatGPT usability. Actual ChatGPT evidence remains NOT RUN
because no canonical dev-2 installation/tool registration is available.

`core.json` is the canonical local-process report under checksum-verified official
Node 24.21.0 Linux arm64, privately executed with PRoot on the authorized bootstrap
host. It is not a trusted sandbox receipt. The exact source commit is also sent
through the same canonical core entrypoint on Linux x64 CI. Only successful
readback of that exact commit counts as the CI observation.

P7 still requires closed domain output schemas, authenticated HTTP composition,
streaming body/time limits, bounded observation waits, method/content negotiation,
and joined end-to-end transcripts. Work disconnect never means durable cancellation.
The helper does not start a listener, return authentication success, or fabricate
runtime identity or authoritative terminal state.

No accepted Design changed in this sub-frontier. No evidence yet falsifies the
selected four-tool surface or the superiority gates. Same-ref full-validation
amplification needs the real P5/P6 join; the earlier 36-validation fixture only
tests measurement arithmetic. D0007 repeated cohorts remain off the ordinary core
validation path. No thresholds or repeated-trial requirements were weakened.

Bootstrap exception: GitHub reads, tmcp project-local execution and Git publication
are still needed because dev-2 has no usable canonical development broker. No
existing deployment, credentials, unrelated worktree or legacy external state was
mutated. Transition to dev-2 itself only when those capabilities actually exist.

## Protocol references checked during implementation

- https://modelcontextprotocol.io/specification/2026-07-28/basic
- https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
