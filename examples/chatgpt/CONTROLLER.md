# ChatGPT bounded-cell controller

Use this policy with the function in `run-cell.js`, pasted verbatim into each fresh
`functions.exec` body. This is a caller-side reference adapter, not an installed host hook.
The server cannot install it into ChatGPT or schedule the next cell. No import, Node API,
resident update or new MCP contract is needed. Pure-JS setup does not dispatch tools.

## Assistant policy

1. Bind current task, tools and authority. Prepare a small ordered plan of already authorized
   steps. Each step.args is exact public JSON, `{request:{...}}`. Use stable step IDs and retain the exact original mutation requestId/arguments before
   dispatch. Do not pre-plan dependent mutations against an unknown future checkpoint. Setup
   discovery belongs in a separate bounded cell; do not spend uncounted calls before the runner.
2. Pass all nested calls in the work cell through one `runTdevCell` invocation. Its default
   policy is 16 total attempts and a 15-second soft elapsed budget. Both are adjustable local
   policy, not discovered host capabilities. Failed tools and diagnostic calls consume attempts.
   Do not use parallel, detached calls or extra tool calls in callbacks/after the runner.
3. Print the returned packet with `text(packet)` and end the physical cell normally. Do not
   call `yield_control()` and continue the same cell as a substitute for ending it. Do not
   recursively call functions.exec from the JS. Returning state is not scheduling another cell.
4. On `status=rollover`, give the user a brief progress update using the assistant commentary
   channel, then issue a fresh functions.exec in the same turn without waiting for user input.
   Reuse the same plan and returned nextIndex. Respect any new user steering/Stop; continuation
   is not authorization to outlive cancellation. Never describe an emitted packet as delivered
   until the assistant actually receives it. Text output alone is not proof of visible delivery.
5. On `review`, inspect the received response or caller-processing failure. On `reconcile`,
   the pending step may already have committed: inspect its original retained operation/request
   in a fresh bounded cell. Never automatically rerun it or invent a replacement requestId.
   These statuses are not automatic rollover. A plan being `complete` means only its listed
   calls returned and were classified; establish actual command/validation success separately.
6. For ordinary non-interactive `tdev_exec` command work and source `tdev_validate`, include
   `waitMs=30000` on the admission call. The controller excludes this observation-only field from
   mutation identity, admits or replays the exact request once, then performs one bounded terminal/log
   observation before returning that same nested tool call. This removes the admission-to-monitor
   physical-cell scheduling gap for short success/failure. For staged-stdin workflows, explicitly
   set `waitMs=0` so the caller receives the retained handle before delivering later stdin; process
   mode returns immediately and its request rejects `waitMs` and `capturePaths`. If admission still returns `running`, switch to
   `runTdevOperationCell`. By default each monitor cell makes exactly one original-operation status call with `waitMs=30000`
   for that exact operation/request identity before returning or rolling over. This keeps multiple 30-second terminal waits inside one physical cell instead
   of requiring a fresh host-scheduled cell after every wait. The server returns immediately on
   terminal reconciliation or after the bounded wait with the freshest status/log page; nonterminal
   log growth alone does not end the wait. The helper advances the output offset and surfaces terminal
   `failed`/`cancelled` state before return. `unknown`, malformed or unavailable status stops for
   review rather than looping. On `rollover`, give the user a brief progress update and issue a fresh
   monitor cell in the same turn with `nextArgs.request` spread into its options; do not wait for user input. This removes dense
   polling and bounds the normal visible quiet interval, but cannot guarantee that the host schedules
   the next physical cell. A new session must still rebind durable task/operation state; monitor
   packets are transient caller context, not durable tdev resume storage.

`classify` must return exactly `continue` only when the actual decoded response permits the next
planned step. Running/unknown operations, semantic errors or unreadable wrappers require review.
`onReply` should print the relevant operational receipt/result promptly and retain IDs needed for
recovery. Both callbacks are pure caller JS: no tools, retries or long-running work. Do not reduce
an operation result to transport success. The runner never infers success from a fulfilled await.

Example tail after pasting the function and selecting the actual discovered tool name:

```js
// A read-only usage example, not a density experiment. Adapt decoding to the real host wrapper.
const packet = await runTdevCell({
  tools,
  steps: [{id: "projects", tool: "ACTUAL_TDEV_PROJECT", args: {request: {action: "list"}}}],
  onReply: reply => text(reply),
  classify: reply => {
    const body = reply?.structuredContent; // If absent, review; never guess success.
    return !reply?.isError && body?.ok === true ? "continue" : "review";
  }
});
text(packet);
// End this functions.exec here. The assistant decides the next invocation.
```

## Optional witness mode

Pass `witness: {tool, instance, runId, cellId, sequence}` using previously inspected generation,
one opaque run ID across cells, a fresh opaque cell ID per physical cell and the last attempted
sequence (zero initially). The caller must inspect returned `witnesses` for actual receipt/errors.
No diagnostics calls are made when witness is omitted. Off/capacity errors do not activate or
restart diagnostics. No probe failure causes operational retry or cancellation.

Three calls are reserved: cell_enter, one sparse tool_return for the last fulfilled operational
await, then cell_exit. Thus the default permits at most **13 work calls plus 3 probes**, not
16 work calls plus instrumentation. Continue the returned sequence even if a marker reply was
lost. tool_return.callOrdinal is the original plan index plus one, not a physical attempt count;
keep the plan stable within that run. afterRequest is emitted only from a valid exposed receipt
of the matching instance. Missing metadata is never fabricated. The final tool_return is sparse:
it cannot locate a hang before that marker as precisely as per-call probing could.

The time budget is checked before starting another work call. It cannot preempt a blocked await,
probe, callback, host scheduling or UI rendering; there is no Promise.race timeout pretending to
cancel an ambiguous effect. Closing probes can exceed the soft time budget. If entry probing
uses all available time, review instead of repeatedly rolling over without doing useful work.

If the host rejects calls below this policy budget, stop the current work plan, preserve the
original request identity and reconcile. Select a lower budget for subsequent cells based on
observed admitted attempts, leaving margin for instrumentation; do not run a threshold search
or assume every client has a ceiling of 20. Calls bypassing this runner cannot be counted.

Local tests prove the JS gate, fresh-instance counters and no automatic ambiguous replay. They
do not prove that ChatGPT schedules the next cell, obeys cancellation or updates its visible UI.
Keep server, caller-witness, independent-observer and user-visible timelines distinct. Normal
usage acceptance should measure time between visible updates, not just backend completion.

## Isolating a reported visible stall

The agent owns collection of any exposed physical-cell code and host error/result. Do not make
the user extract Code Mode internals or treat their absence as a permission blocker. Use the
user's approximate wall time with timezone and independently available logs. An existing
authorization to diagnose continues to apply; do not ask for the same grant again. If this
client exposes no ChatGPT execution-history API, record that capability boundary and continue
authorized investigation/work from durable state rather than waiting for inaccessible material.
Export existing local server evidence before rotation;
record coverage gaps and the incident's runtime generation separately from the current one.
Inspect retained state and observe the original effect only. A terminal receipt eliminates a
reason to re-execute it, but an HTTP flush does not establish Tunnel delivery or a fulfilled await.

For the next explicitly authorized host diagnostic run, use a read-only comparison, not another
validation/build. In the first physical cell make exactly one read call, emit a compact returned
packet and end the cell. After the assistant receives that packet, send a short commentary update
and make one read in a fresh cell. Record each received packet and the user's observed progress.
This isolates the boundary without a density/ceiling search or detached calls. It cannot retroactively
prove why the old cell stalled, and a short successful run does not qualify a long workload.

If current diagnostic grant, session authorization and generation permit witnesses, separately repeat
with one operational read plus the runner's three sparse markers (`maxCalls:4`). Preserve actual
marker replies and metadata; absent/failed markers remain inconclusive. Do not change the resident
or claim retroactive coverage to manufacture missing evidence. An authorized independent observer or
bounded trace can capture new server evidence; state its duration/storage limits and avoid claiming
retroactive coverage. If the host cell
does not return, retain that failure and reconcile in the next user-authorized turn; a caller timeout
must not pretend to cancel the effect or repair host scheduling.
