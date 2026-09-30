# Fresh ChatGPT report: B2 and controls

Provenance: user pasted a fresh ChatGPT trial ("Worked for 41s"). This file
records its observations and excerpts; it is not a byte-for-byte injected catalog
capture and this Codex session did not itself see the injection.

- `tdev_task.request.start`: normal arm requires `requestId`; optional `baseRef`
  and `localChanges:boolean`. Continuation arm requires `requestId` and `fromTaskId`,
  omits `baseRef`, permits only `localChanges:false`. No `Exclude<any, any>`.
- `tdev_operation.status`: two explicit alternatives require `operationId` or
  `lookupRequestId`, respectively. Both preserve offset/limit/since/waitMs.
- `workspace.configure`: one arm requires `name` with optional nullable defaultRepo;
  the other requires nullable `defaultRepo` with no name.
- `diagnostics.mark`: cell_enter/cell_exit separate from tool_return, which requires
  callOrdinal and permits afterRequest. No any/Exclude in these four B2 cases.

Controls in the same catalog:

| Control | Observed declaration |
|---|---|
| root task | `{ [key: string]: any }` |
| flat task | typed action vocabulary; branch-specific required fields lost |
| original nested task | start position `Exclude<any, any>` |
| action start | `{ [key: string]: any }` |
| workflow source | `{ intent: "task.start", arguments: Exclude<any, any> }` |

The two supplied valid starts returned `CANONICAL_VALID`, `probeOnly:true`,
`effect:"none"`. Their digests match locally recomputed probe receipts in
[the summary](host-B2-summary.json). The invalid continuation with
`localChanges:true` was rejected by host schema validation before tool receipt;
its displayed branch had enum `[false]`, required action/fromTaskId/requestId,
and additionalProperties false.

This passes the tested positive-alternative rendering gate. It does not establish
uninstructed model selection accuracy, product effect execution, live resident
acceptance, or all future schema shapes. The action-per-tool control still contains
the original conditional constraints; it does not show that an unconstrained
single positive-object action tool fails.
