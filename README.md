# tdev

ChatGPT leads repository development. tdev supplies commands and exact source handling
while enforcing repository/ref identity, unrelated-state preservation, credential/admin
boundaries, replay/concurrency safety, exact validation/publication and recovery.

Chosen design: command-first checkpoint core, seven MCP tools, Git checkpoint OIDs,
two durable row families (workspace/operation), direct credential-to-scope admission
and a separate isolated executor. CLI extensions use commands. No per-command permission
workflow or unverified ChatGPT subject/session authority. First ingress is localhost
HTTP plus OpenAI Secure MCP Tunnel. Same-UID shell is not a sandbox.

## Current work

The redesign is frozen and implemented through the local coding path: Git/SQLite
workspace/edit/replay, command capture, exact validation/publication, HTTP MCP/auth,
restart/recovery and inactive install/rollback. The remote SSH/OCI executor is written;
its protocol and boundary tests run locally, but real Linux isolation is unverified.
All five implementation deliverables have their locally executable source, tests and
inactive packaging checks. The deterministic suite passes 42 tests, including actual
controller SIGKILL/restart; the packaged loopback/auth/restart rehearsal also passes.
No new production runtime/provider has been activated. Existing untracked files are
preserved. Next: operator enrollment of a separate Linux executor and private Tunnel
credentials, then live isolation and ChatGPT connection acceptance. See
[local evidence](LOCAL_VALIDATION.md) and [operator steps](OPERATIONS.md).

Run deterministic local checks with `sh scripts/check.sh` after installing
`python -m pip install --target .tdev-deps -r requirements.txt`.

## Navigation

Read README and AGENTS first, then relevant ARCHITECTURE semantics, contract wire
definitions and IMPLEMENTATION_PLAN order. User instructions and actual permissions
bound all of them. Superseded conclusions remain in Git history.
