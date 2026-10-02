# Final execution input probe: ChatGPT report

Provenance: user supplied the fresh ChatGPT report “Worked for 24s”. This is a
record of its declaration excerpts and instructed calls, not a complete raw
injected catalog directly observed by this Codex session.

The actual reported `mcp__tdev_probe__tdev_exec` declaration contains two positive
request alternatives. Both require requestId/taskId/expected/command. Command
permits waitMs (0..30000), capturePaths (0..64 items), optional mode:"command".
Process additionally requires mode:"process" and contains neither waitMs nor
capturePaths. Both close additionalProperties. Common cwd/env/stdin/timeout and
task/fresh environment fields remain visible.

The requested process fixture returned CANONICAL_VALID, probeOnly:true,
effect:"none" and inputDigest
`b952d42292cc5bea1708e23024ba8f43c0def4f83d2527e1f449c03331a2a885`.
The exact digest was independently recomputed against the final product probe.
Adding waitMs:0 or capturePaths:[] was rejected at the host request.oneOf schema
validator before a probe receipt. These are expected negative controls.

This verifies the final execution shape is present in this conversation's
injection and enforced for these instructed inputs. It supports successful
refresh/new-session delivery for this trial, not reliability of every future
Refresh or catalog replacement in an already-open conversation. No process ran;
no real development, deployment or user-visible long-session continuity is
claimed. The structured evidence is in [host-exec-summary.json](host-exec-summary.json).
