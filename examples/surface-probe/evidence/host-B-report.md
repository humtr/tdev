# Candidate B: fresh ChatGPT report supplied by the user

Provenance: user pasted a report from a fresh ChatGPT conversation connected to the dedicated
`tdev surface schema probe`; displayed tool namespace `mcp__tdev_probe__*`; reported work duration
37 s. The report states no other tdev app was called. This is host evidence supplied by the user,
not a direct capture by this Codex process. No host model/build ID or raw catalog hash was supplied.
The raw B tools/list and local loader capture are separate artifacts.

The following declaration excerpt is copied from the supplied report (including its
`Exclude<any, any>` branch and shortened field comments). It is not a reconstructed schema.

```typescript
mcp__tdev_probe__tdev_task(args: {
request:
 | {
action: "list",
after?: integer, // minimum: 0, maximum: 9007199254740991
limit?: integer, // minimum: 1, maximum: 50
includeClosed?: boolean,
workspaceId?: string, // pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
}
 | {
action: "open",
requestId: string, // pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
repo: string, // pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
ref: string, // pattern: /^refs/heads/[^\s~^:?*\[\\]+$/
expectedHead: string, // pattern: /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
workspaceId?: string, // pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
}
 | {
action: "compose",
requestId: string,
repo: string,
ref: string,
expectedHead: string,
sources: Array<
{
taskId: string,
checkpoint: string,
}
>,
workspaceId?: string,
}
 | {action: "close", requestId: string, taskId: string, expected: string}
 | {action: "inspect", taskId: string, since?: string, before?: integer, limit?: integer}
 | Exclude<any, any>
 | {action: "cleanup", requestId: string, taskId: string}
 | {
action: "integrate",
requestId: string,
taskId: string,
expected: string,
sourceTaskId: string,
sourceCheckpoint?: string,
resolutions?: Array<
 | {path: string, choice: "current" | "incoming" | "base" | "delete"}
 | {path: string, choice: "content", content: string, encoding?: "utf8" | "base64", mode?: "100644" | "100755"}
>,
}
 | {action: "resetEnvironment", requestId: string, taskId: string, expected: string}
,
}): Promise<unknown>;
```

Whitespace-only compaction of some object members above is for readability; the branch marker
and field/type structure are preserved. Do not use this excerpt as a byte-identical injected
catalog fixture. The supplied validation declaration:

```typescript
mcp__tdev_probe__tdev_validate(args: {
request:
 | {
requestId: string,
taskId: string,
expected: string,
message: string,
environment?: "task" | "fresh",
timeout?: integer,
waitMs?: integer,
}
 | {
subject: "artifact",
requestId: string,
artifactId: string,
health?: {port: integer, path: string},
timeout?: integer,
}
,
}): Promise<unknown>;
```

The report also shows concrete `read.queries[]` branches file/list/search/diff/history, with
file.path and search.text required; `edit.edits[]` branches put/replace/delete/move preserve
their required content/before/old/text/to fields. These are positive nested-array controls.

Actual calls reported:

```json
{"tool":"tdev_task","arguments":{"request":{"action":"list"}},"returned":{"ok":true,"probeOnly":true,"effect":"none","code":"CANONICAL_VALID","canonicalTool":"tdev_task","inputDigest":"584e7600815c4c752e42f8f3c00aa4bf1597f13bb08ed5de443b33097e1a1751"}}
{"tool":"tdev_task","arguments":{"request":{"action":"start","requestId":"probe-start-1"}},"returned":{"ok":true,"probeOnly":true,"effect":"none","code":"CANONICAL_VALID","canonicalTool":"tdev_task","inputDigest":"eca56736e0cb97e52e23975116bc772befb67bb9ac67156f8c2c826a4c9e0f68"}}
```

The intentional invalid call `tdev_validate({request:{requestId:"probe-invalid-1"}})` threw
before a probe receipt was returned. Reported error:

```text
{'requestId': 'probe-invalid-1'} is not valid under any of the given schemas
Failed validating 'oneOf' in schema['properties']['request']:
source required: ['requestId', 'taskId', 'expected', 'message']
artifact required: ['subject', 'requestId', 'artifactId']
```

This establishes rejection outside the normal probe reply; it does not independently identify
which host/bridge validation component threw. The probe's own call function returns a structured
rejection rather than throwing that error. No effect was dispatched by the effect-free server.

Conclusion: B preserves useful nested typed branches and required fields, but **fails full
declaration fidelity** for task start. Its canonical branch contains `not` plus `allOf`/`if`/`then`.
Attribution specifically to `not`, rather than their interaction, remains a hypothesis pending
controls. A callable input can still be invisible/unusable to model planning. This is not a B
acceptance PASS and does not establish free-form model selection accuracy.
