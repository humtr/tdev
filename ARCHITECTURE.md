# tdev architecture

## 1. Purpose and authority

ChatGPT chooses strategy, commands, edits, diagnostics, composition and publication.
tdev supplies execution and enforces identity, unrelated-state preservation,
authorization, isolation, concurrency, replay and exact publication. It does not plan
work or classify the meaning of commands.

Current user instructions and actual permissions bound work. README owns purpose and
current status; this file owns design semantics; contracts/tools.schema.json owns wire
types; IMPLEMENTATION_PLAN owns order. AGENTS is navigation. Old conclusions live in
Git history. Design freeze means these current documents agree, not host acceptance.

## 2. Alternatives and selection

These are engineering trade-offs, not measured scores. All viable candidates isolate
candidate code from controller secrets and retain trusted publication.

| Dimension | A: previous ten-tool checkpoint harness | B: working-directory agent | C: command-first checkpoint core (selected) |
|---|---|---|---|
| Public tools | context/read/workspace/patch/exec/process/validate/integrate/observe/capability | discover/read/write/exec/job/publish | workspace/read/edit/exec/process/validate/publish |
| Trusted components | controller, projector, registry, outer executor, provider | controller, filesystem journal, outer executor, provider | controller, Git, SQLite, outer executor, provider |
| Durable state | binding/grant/workspace/operation/executor/capability | directory mapping, undo journal, jobs, publish intent | workspace and operation; static authority in operator config |
| Source | immutable tree plus numeric revision | normal private Git worktree and dirty directory | immutable checkpoint commit OID, temporary command filesystem |
| Command path | materialize/capture; other effects through registry | persistent isolated directory and direct shell | materialize/capture; CLI is normal extension path |
| Auth | Connector Secret, subject full/permit, session permit | credential mapped to scope | credential mapped directly to principal/repo/ref scope |
| Extensions | schema/digest/grant gateway | installed CLI or independent MCP | installed CLI or independent MCP; no public registry |
| Validation/publication | frozen commit, receipt, integrate | snapshot dirty directory, validate, publish | frozen commit, operation result, publish |
| Concurrency/recovery | revisions, writer reservations, leases | directory locks, interrupted-edit repair, job journal | checkpoint CAS, per-workspace busy operation, no lease expiry |
| Termux topology | controller/tunnel plus remote OCI | same ingress plus persistent remote sandbox | controller/tunnel plus remote OCI |
| Advantage | rich typed vocabulary and privileged adapter mediation | cheap warm commands and normal Git ergonomics | atomic multi-file edit, fewer authority/state concepts |
| Cost | schema, repeated identities, registry lifecycle, host-dependent auth | dirty snapshot recovery and remote filesystem lifetime | materialization/capture; process observation shares a tool |
| Failure mode | stale owners, unverified session policy | partial multi-file writes and uncheckpointed byte loss | uncertain remote process holds its workspace |

C removes the gateway, context/observe tools, numeric revision, grant/executor tables,
Permit and authority projection subsystem. Validation/publication stay distinct:
candidate stdout cannot create a trusted receipt, and an uncertain publication must
not silently run validation or regenerate a commit. Seven names are a consequence,
not a target.

Known repo/ref/head: open → read → edit → validate → publish is five semantic calls
plus asynchronous observations. Unknown head adds workspace list. A normally adds
context before open. B can batch shell edits but still needs snapshot and validation.
All allow batch read/edit and sequential shell commands. Counts are estimates of a
specified path, not proof of lower latency; executor cold start may dominate.

## 3. Ownership and durable minimum

Git owns bytes/history/canonical refs. SQLite owns accepted mutation intent/results
and the current workspace pointer. One operator-owned config owns enrolled repositories,
exact refs, credential scopes, validation policy and executor identity. Supervisor owns
service restart; executor engine owns container lifetime; tunnel owns delivery.

| Durable row | Restart requirement | Excluded ownership |
|---|---|---|
| workspace | owner, enrolled repo/ref identity, base, checkpoint, busy operation and closed state are not a Git tree | canonical head, human role or provider lifetime |
| operation | request digest and exact intent/result prevent duplicate effects after response loss | task, conversation, permission or execution plan |

Executor identity, validation receipt and publication intent are operation values.
No binding/grant/executor/capability tables. Static config is not mirrored as mutable
DB authority. Object pins/logs/remote spool preserve bytes/evidence, not extra workflow
owners. Reads need no journal. Each public mutation, including stdin and cancellation,
uses caller request identity. Short local edits commit with their result; dispatches
need durable intent first. Retain tombstones for installation lifetime. Logs are bounded;
open workspaces and unresolved effects do not expire. GC must trace all DB pointers;
initial implementation does not collect live source objects.

## 4. Workspace/source model

| Choice | Atomicity/recovery | Command/performance/Termux cost |
|---|---|---|
| Git tree pointer | atomic DB pointer; identical bytes can recur (ABA) | efficient but no transition identity |
| Normal worktree | needs journal/repair for partial multi-file writes | warm commands cheap; mutable index/config/lifecycle |
| Index/tree plumbing | private index builds immutable tree | Git reuse without shared working index or hard-link requirement |
| Temporary filesystem + capture | atomic only after complete capture | generic commands simple; copy/capture cost |
| New content-addressed snapshot | must implement own history/tree/GC | duplicates Git storage and tooling |

Choose Git plumbing for edits and temporary isolated filesystems for commands.
Checkpoint is a commit with previous checkpoint as parent and unique operation marker.
OID is both source identity and CAS token; no numeric revision. A→B→A bytes have
different checkpoint OIDs. Canonical base is separately stored; checkpoint history is
not published. Validation constructs a sole-child candidate of canonical base before
testing, then publication uses that exact commit.

Use private bare objects, never the user's index or dirty checkout. Synthetic test
repositories are fixtures, not alternate development checkouts. Configure Git fsync,
write objects before SQLite pointer commit, and never depend on link(2). Orphan objects
after failure are harmless. Multi-file edit preflights paths and preconditions then
publishes once. Symlinks are read as bytes, never followed; execution rejects escaping
links and unsupported gitlinks. Reject .git aliases, traversal and topology collisions.
Capture is all-or-nothing: tracked files, nonignored new files under starting ignore
rules and explicit extra paths. Candidate index/config cannot alter capture authority.
Nonzero exit still preserves safely captured changes. Limit overflow preserves the last
checkpoint and reports incomplete capture. Large-source transfer limits are explicit;
incremental materialization is a later measured optimization.

Commands receive credential-free shallow Git metadata at their exact checkpoint;
validation receives its frozen candidate as HEAD. History beyond that shallow boundary
is read through the controller. The remote filesystem is bounded tmpfs: outer executor
freezes all container processes before capture, then proves termination before importing.
Forced cancellation/host loss can destroy dirty bytes; report captureError and release
the writer only after positive stop evidence, keeping the previous checkpoint.

## 5. Admission and authentication

A secret maps directly to one configured principal and exact repository/ref scope.
Check current configuration on every call and replay. Ordinary developer scope includes
read/edit/exec/validate/publish. Network/executor limits come from enrollment. No Task,
per-command permission registration or projection abstraction.

A bearer identifies a configured credential holder, not a verified ChatGPT account or
conversation. Distinct secrets allow distinct principals. Sharing a credential shares
authority; session isolation is not claimed. Session-specific delegation is outside the
first release. No One-Time Permit or elicitation fallback. Subject/session headers and
model-supplied approval text are ignored for authorization.

| Identity | Meaning |
|---|---|
| tunnel runtime key | outbound tunnel control-plane access only |
| installation ingress secret | configured principal and local scope |
| ChatGPT account | not inferred by this controller |
| conversation/session | correlation only, not durable authority |
| human possession | local operator secret/config provisioning |
| repository grants | exact repo/ref entries in operator config |

Secrets never enter MCP arguments, source, logs or candidate environment. Remote calls
cannot install adapters, change policy/config, mint grants or activate releases.
Revocation/rotation affects subsequent admissions and replays. Config must remain outside
source and only operator writable. Scope never exceeds actual provider/user authority.

## 6. Command and extension boundary

Termux runs controller/Git/SQLite and adopted fixed utilities. Arbitrary commands/tests
require a separate Linux executor with rootless OCI, private namespaces, seccomp,
no-new-privileges, dropped capabilities and finite CPU/memory/PID/disk/output limits.
No Android root/systemd/local Docker. Same UID, env filtering, cwd or PRoot is NOT a
sandbox. A trusted authored local fixture is test-only, not a production executor.
No automatic native shell fallback.

First remote connection: operator-enrolled SSH host/host key and fixed adopted outer
executor program, not a generic provider framework. Candidate cannot see SSH credentials
or outer spool. A managed provider may host that executor. Existing GitHub launch/run
assignment machinery is useful evidence, not mandatory just to obtain a shell.

Commands specify shell text, source-relative cwd, nonsecret env, initial stdin, deadline
and admitted network. No executable-name allowlist. Cwd resolves inside source; env starts
clean. Baseline network is none. Internet requires an enrolled isolated network whose
private/metadata/admin access is denied externally and live qualified. A network name
alone is not proof. Private package credentials require a scoped broker, not copied
controller credentials. Unsupported features, including PTY, return explicit gaps.

Long commands return operation handles. Logs retain byte offsets and discarded counts.
Stdin sequence is durably reserved before write; delivery to a pipe is not proof of
consumption. Lost acknowledgements remain unknown without resend. Cancellation targets
exact container/run identity, never PID alone; whole-container freeze precedes capture,
and positive termination proof precedes checkpoint import.

CLI extensions require no descriptor registry or new MCP tools. Repository CLI code
remains untrusted. External MCP can be separately connected by the host or adapted by a
sandbox CLI within granted credentials/network. Privileged adopted local adapters enter
the controller trust domain only through operator installation. Extensions cannot issue
grants, validation receipts, canonical publication or release/admin authority.
Action schemas/digests/gateway should be introduced only for an actual privileged
mediation requirement; installed executor image/program identity is already pinned.

## 7. Concurrency/stale/recovery

One controller holds an OS lock released on death. SQLite WAL/FULL transactions never
span network waits. Workspace checkpoint CAS prevents overwrite; a busy operation
serializes only that workspace. Reads use the last committed checkpoint. No global
stale lock, TTL lease, task scheduler workflow or automatic same-ref coordination.

After restart, in-flight external effects are unknown until exact remote identity is
observed. Never create a replacement command. Retained outer terminal result allows
capture/unlock; timeout is not death proof. Uncertain jobs do not exhaust all logical
slots, but actual remote resource quotas still apply. Creator operation is provenance;
current authorized principal/operator can observe/cancel surviving resources regardless
of creator lifecycle. Positive termination evidence is needed to release its writer.
After terminal reconciliation, process retire removes its exact stopped container and
large source/capture payloads while retaining intent digest, results and bounded logs.
The terminal creator does not lock resource management. Unknown/running resources cannot
be retired on a timer.
Lost host/corruption may require operator recovery; fence only affected resources.

Same-ref work stays independent. Model can compose exact checkpoints into a fresh
workspace: base→source changes apply only where target is unchanged or already equals
desired output. Reject conflicting path/mode/type changes. No leader/member settlement;
validate combined result once. General merge/rebase can use Git in the isolated command
filesystem with capture.

| Effect certainty | Meaning |
|---|---|
| none | no committed effect; semantic rejection or proven pre-dispatch failure |
| committed | effect is durably known; replay returns original result |
| unknown | dispatch/effect may have occurred; observe, do not automatically repeat |

Running status differs from effect certainty. Transport failure is not command failure.
Dedup follows current authorization and precedes stale checks. Same principal/request
with different canonical input conflicts. Accepted intent fixes repo/source/policy once.

## 8. Validation and publication

Freeze candidate commit/tree/parent, command/policy digest, executor and operation before
validation. Operator policy supplies mandatory command; candidate policy-file edits do
not change it. Diagnostics are exec. Outer executor outside candidate authority records
actual exit and input identity. Candidate PASS/JSON is output only. Passing tests proves
execution of adopted tests, not correctness of all code. Source is read-only during
validation and scratch is separate.

Publish checks current scope/policy, successful validation and unchanged checkpoint.
Publish the frozen commit, never regenerate. Unique publication per validation survives
different request IDs. Candidate is sole child of expected canonical head. GitHub checks
immutable repository ID and fixed HTTPS URL/full ref; local fixture checks exact bare
repository identity. No guessed targets, wildcard refs or symbolic canonical refs.

No force push. A private trusted pre-push hook checks advertised old OID, local new OID
and single ref against persisted intent; normal receive-pack CASes that advertised old
OID. Ordinary push without that guard would not prove caller expected head.
Local bare fixture uses explicit old-OID update-ref CAS. Before either path, verify the
candidate's sole parent. Persist publication intent before dispatch.

Lost response: new head or verified descendant proves publication under enrolled
no-rewrite/no-delete policy. Old head alone cannot prove the previous sender will never
publish; retain unknown unless sender termination is established. Other heads are stale
only with proof of nonpublication; otherwise unknown. Never automatically resend an
uncertain push. Admin rewrites violate enrollment assumptions and require reconciliation.

## 9. Transport and Termux operations

ChatGPT → OpenAI Secure MCP Tunnel → localhost HTTP MCP → controller.
[Official Tunnel documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
describes outbound delivery and runtime credentials, not our proposed subject/session
security semantics. Bearer forwarding, host availability and discovery require real
acceptance. Reconnect does not change durable development state.

HTTP implements JSON-RPC initialize/tools/list/tools/call, JSON responses, notification
202, unsupported GET stream 405, auth before discovery, Origin/Host/version/body checks.
JSON-RPC/session IDs are not mutation identity. No generic transport framework.

Python/Git/SQLite run on Termux. Independent controller and tunnel runit services use
bounded logging. Android UID kill may stop supervisor too: no always-on guarantee.
Install/check/rollback are local operator actions: inactive verified version directory,
active/previous pointer, schema compatibility and separate config. No release machinery
in coding calls. Production cutover needs explicit authority and real acceptance.
Source work/inactive rehearsal does not change installed services.

## 10. Evidence, performance and remaining acceptance

Fresh 2026-09-20 inspection: local/remote starting HEAD
244c106a8951cba8a329b0f321e0bab29ccb5a31; Python 3.14.6, Git 2.55.0, Node 24.18.0,
runsv available. Installed tunnel-client reports
0.0.10+105e17a79a36e4e5c897fd698ed2b8dbf935b144. Previous observations of other
binaries are not current runtime identity.

Fresh source inspection at dev-2 05e5ae681c846ac77457dc0bbeb15f67f3a29688:
src/candidate/tree.mjs has preflight/immutable construction; src/integration/git-ref.mjs
has direct-parent checking and qualified force lease (replaced by non-force advertised
old guard); src/execution/podman.mjs, managed-sandbox.mjs and outer-receipt.mjs join
trusted outer identity and reject candidate-produced validation evidence. Recover the
invariants, not the action/attempt/session graph. tmcp process-runner.ts/store.ts show
bounded capture, group cancellation and request reservation. Source inspection is not
live runtime qualification.

Primitive references: [Git CAS](https://git-scm.com/docs/git-update-ref),
[MCP HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[Podman](https://docs.podman.io/en/latest/markdown/podman-run.1.html).
Container flags alone do not prove deployed isolation.

Measure schema/startup bytes, calls/polls, duplication/transfer, command starts, remote
cold/warm time, validations, Git/provider requests, stale retries, user interventions
and maintenance cost. Local fixture timings are not host/remote performance. Use
one-file, multi-file, search and competing-ref cases with actual counts, not scores.
No benchmark framework before first complete fixture path.

Host acceptance: discovery/bearer forwarding/reconnect and separate credentials;
remote OS isolation/egress/resource/capture/receipt/network-loss tests; actual production
activation. Provisional assumptions remain explicit. Independent local implementation,
tests and packaging continue while these require human access.
