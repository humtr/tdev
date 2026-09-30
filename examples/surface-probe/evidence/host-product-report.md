# Final input probe: fresh ChatGPT report

Provenance: the user pasted a fresh ChatGPT trial ("Worked for 25s"). Only
`mcp__tdev_probe__*` was reportedly called. These are supplied declaration excerpts
and receipts, not a byte-for-byte capture of the whole injected catalog.

Actual visible declarations:

```typescript
tdev_find({request:{project?:string, label?:string,
  state?:"all"|"open"|"closed", after?:integer, limit?:integer, since?:string}})
// project 1..160 chars; label 1..80; state default all;
// after 0..9007199254740991; limit 1..20; since <=64 chars.
// task start ordinary branch requires requestId; baseRef/localChanges optional.
// predecessor branch requires requestId/fromTaskId, permits only localChanges:false.
// source release: required action/requestId/validationId/name/expectedRevision/command/health.
// artifact release: required action/requestId/validationId/name/expectedRevision/subject/health.
```

The find, start and artifact-release examples returned `CANONICAL_VALID`,
`probeOnly:true`, `effect:"none"`. All three exact input digests were reproduced
locally and retained in [the structured report](host-product-summary.json).
Removing expectedRevision from the artifact release was rejected by the host's
request.oneOf schema validation before a probe receipt existed. The displayed raw
required array included expectedRevision.

This verifies these input declarations and instructed calls. It does not measure
uninstructed planning, task creation, release success, production cutover or visible
continuation of a long real development session. The probe omits product output
schemas because it returns effect-free validation receipts; actual source output
schemas are retained separately in product-source-tools.json and checked by domain
and official SDK tests.
