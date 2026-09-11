# MCP input boundary (P7 first sub-frontier)

`input-schemas.mjs` implements the four D0004 input schemas, the ten work
variants, deterministic advertised defaults and independent per-item validation
and admission hooks. It is not a listening MCP server or a runtime installation.
`protocol.mjs` implements modern/legacy wire decoding, standard mirrored-header checks,
request-ID-preserving errors, complete-result encoding and exact endpoint guards.
HTTP/OAuth wiring, bounded observation waits, closed domain output schemas and
end-to-end HTTP transcripts remain P7/J1 work.

`TOOL_INPUT_DESCRIPTORS` deliberately does not advertise an output schema that
has not been implemented. Do not expose this module alone as a completed MCP.
P8 must supply trusted request context and the P1 authorization boundary. The
admitter must perform authorized request dedup before stale revision checks,
durably persist asynchronous work and return admission rather than execution.
The input adapter owns no database, replay cache, queue or thread identity.

All fixed object shapes reject unknown properties. Profile `parameters` is an
explicit bounded recursive JSON data value; arbitrary parameter names are not
permission. The selected adopted profile must validate its exact parameter schema
before launch. Recursive schemas use local definitions only; no network schema
resolution is enabled. Source-path authorization, byte-path limits, content
encoding and unsupported Git feature handling remain D0002/D0005 responsibilities.
The 4096-character path and 256-element parameter collection ceilings are initial
input-resource policy; they do not define Git or work-identity semantics.

JSON Schema validates a whole document. `validateInput('dev_work', value)` is
useful for client conformance, but the server admission path must use
`admitWorkBatch`: it first validates the closed envelope, then validates each item
with the same published variant schema. A malformed sibling is rejected without
preventing other independent items. The adapter does not implement `waitMs`;
P8 applies bounded waiting only after durable admissions, without cancelling work.

Immutable schema-shape measurements are diagnostics, not actual ChatGPT evidence.

## Wire composition boundary

The codec speaks the selected 2026-07-28 and 2025-11-25 revisions only. Modern
metadata is per-request and never supplies trusted identity. Missing metadata,
mirrored-header mismatch, unsupported version and unknown method use their defined
protocol codes. Modern errors omit an unreadable ID; legacy errors may use null.
Tool-level errors remain complete tool results, with `isError: true`; both text
and structured representations contain the same domain envelope.

The codec has no socket, session registry or cancellation side effect. A legacy
cancel notification ends request observation only when wired by P8; durable work
cancellation still requires the typed authorized `cancel` operation. Production
composition must authenticate every request, enforce body/header/time limits while
reading the socket, check method/content negotiation, validate domain output schemas,
use 202/no body for accepted notifications and 405 for unsupported GET/DELETE.
No live authorization, production isolation or full transport conformance follows
from the isolated codec tests.
