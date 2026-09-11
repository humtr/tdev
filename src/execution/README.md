# Execution trust boundary

`command.mjs` is a bounded trusted-control subprocess primitive, not a hostile-code
sandbox. `podman.mjs` is an unsealed argument/identity adapter for the selected
managed hosted execution environment; its mocked tests prove no containment on
Termux or on a real runner. It must never be selected as a native Android fallback,
and no ordinary candidate command executes in the device controller UID. D0005
requires actual namespace, cgroup, storage, seccomp, network and credential-negative
proof for the exact hosted invocation before admission.

`github-identity.mjs` verifies a signed hosted-job identity against both the current
persisted session intent and an authenticated provider observation. Its callback
must perform that read; peer-supplied claims are not the expected record. The exact
trusted push ref/workflow/commit, repository IDs, run and first attempt must match.
The result is an executor identity, not a user principal or canonical-effect grant.
A fixture-signed token proves this predicate only; no provider launch, runner seal,
OIDC enrollment endpoint or user MCP is implemented by this module.
