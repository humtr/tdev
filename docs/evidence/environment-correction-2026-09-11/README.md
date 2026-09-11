# Operating-environment correction evidence

Fresh start: `0a7e20d128c932a3f2c4ea6b6a544e3f1d705c42`, parent
`8a10ead36deee5f1ba33b0918da6a2cd70c718f8`, tree
`1d2d44967e02c4cb0c48a927ecfd226fe4476a78`. Its ancestry contains 15 commits and
one parentless root, `9a42b05d403370b7b4a698b4d7440d58aa4a79b5`.

`termux.json` records direct disposable probes on the user's actual Android/Termux
host. `cloudflare.json` records authenticated GET-only account observations,
including unavailable permissions. Values are observations, never architecture
constants. Credential contents, plaintext bindings and private request payloads
were not retained. Existing provider resources remain predecessor inventory.
No deployment, credential rotation, plan purchase, Android setting change or
existing service restart was performed. App sleep, force-stop and device reboot
were not exercised and are not claimed as verified.

The current dev-2 source's GitHub Actions run `34595760789`, job `103251012179`,
was independently read: exact same start commit, Linux x64 Node 24.21.0 core PASS,
32 native Git/SQLite module integration tests PASS. Hosted job evidence reports
Podman 4.9.3, rootless engine available and cgroup v2; production isolation was
explicitly NOT RUN. This demonstrates an existing managed execution capability,
not the user's possession of a Linux server or a proven production sandbox.

## Requirements-first decision basis

The missing conditions are native Termux as an operational target, workers.dev as
the fixed public origin, no assumed extra VPS/server/tunnel, and intermittent
Android lifetime. DIRECTIVE r2 adds these without selecting components. RULE and
AGENTS need no change. The architecture decision follows that correction.

A local deterministic control process is supported by observed Git, Node, SQLite,
locking, atomic filesystem operations, outbound TLS and concurrent child processes.
Public ingress cannot assume inbound device reachability. Select a provider-routed
outbound device connection, with no cloud copy of work truth. Candidate execution
cannot safely inherit this Termux UID's credentials. Unprivileged namespaces fail,
Landlock is unavailable to this process, KVM is absent, and no production container
engine is installed. These are capability observations, not a claim that every
possible future Android isolation technology is impossible.

Use already-observed GitHub-hosted ephemeral execution for untrusted native build
and test workloads, with a separate container for each attempt. It is an explicit
managed-service dependency inside the existing GitHub foundation: runner startup,
quota, provider operations, session limits and network transfer must be measured.
It does not require a user-operated server. Warm bounded sessions amortize startup;
this is a performance hypothesis, not measured superiority. GitHub execution may
not bypass required native-Termux release tests.

Rejected for first-release normal operation: a new persistent Linux/VPS host;
assuming rootless containers on this device; pretending PRoot/Node permissions are
a hostile-code security boundary; a new Android helper application or emulated VM
without deployment/performance evidence; full native validation inside a Worker
isolate; an unverified paid container entitlement; and a second cloud work ledger
or mailbox merely to copy local state. Future measured evidence may replace the
execution adapter without changing work identity or weakening validation.

## Implementation re-evaluation after target selection

REUSE: canonical codecs and exact identities, current capability-intersection
logic, path rules, immutable object store, SQLite ledger and callback fencing,
progressive Git/context/candidate modules, MCP input/wire contracts and diagnostic
arithmetic. Each directly realizes an unchanged required invariant and already has
focused falsifiers; runtime placement is not a reason to copy predecessor code.

REWRITE: public ingress/device connectivity, Access authentication adapter,
execution-provider admission, native toolchain selection, release activation and
test-environment routing. The existing generic JWT bearer verifier remains strict;
opaque Managed OAuth tokens must not be passed to it or trigger a permissive fallback.

RETAIN WITH NEW PLACEMENT: the Podman argument/attempt adapter is a candidate for
managed hosted execution only, subject to a real capability and containment seal.
Its mock tests do not prove a device sandbox. The trusted fixed-command runner is
for broker-owned Git/tooling, never arbitrary candidate execution on Termux.

DELETE FROM ACTIVE DESIGN: required VPS/reverse-proxy/systemd, Termux-test-only
classification, universal Linux Node pin, and an assumed always-live launcher.
No unrelated branch, dirty workspace or external predecessor state is deleted.

Bootstrap exception: GitHub reads, tmcp project-local execution and explicit Git
publication are needed because dev-2 has no installed self-development MCP. This
exception ends capability-by-capability when the canonical dev-2 path actually works.

## Primary provider documentation consulted

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://docs.github.com/en/actions/reference/limits
- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- https://developer.android.com/training/monitoring-device-state/doze-standby

Platform documentation supplies limits and contracts, not proof of this account's
entitlement or this device's lifecycle configuration. In particular, account-token
verification succeeded while the user-token endpoint did not; subscription access
was denied. Do not infer an invalid credential or a paid plan from the wrong endpoint.

## Concrete correction implementation and checks

The correction implements three bounded modules: exact native/CI execution-variant
and workers.dev binding checks; a separately configured, cryptographically verified
Access-application authentication profile; and volatile reconnect-fenced request
correlation. Existing scope-based authentication remains byte-identical. The relay
has no work ledger, admission authority, generic network proxy or effect retry.

Native Termux canonical core passed 109 tests (25 new correction tests included),
checked JSDoc and document/Design validation. The existing native Git/SQLite module
suite passed 32 tests. `native-core.json` and `validation.json` identify the exact
source inputs, native binary and measured results. Unimplemented canonical integration,
release/live and benchmark eligibility remain NOT RUN, not empty passing suites.
Linux CI for the staged source commit uses the same canonical entrypoint and its
own exact execution variant. Its external result must be read at that commit;
no prewritten success assertion is substituted for that readback.

Observed and corrected during authoring: the strict JWT-profile negative test
initially used a non-URL audience that its existing constructor correctly rejected.
The fixture now uses its valid resource audience and tests missing token scope.
The existing verifier was not relaxed. A JSDoc parse-record narrowing issue in the
new transport was corrected without changing runtime validation. These are source/
fixture defects, not a reason to downgrade any accepted security invariant.

Remaining: actual Worker/DO/WebSocket composition, installed dev-2 Access application,
managed execution session and containment seal, paired runtime activation, the joined
validation/integration loop, real ChatGPT schema usability and both-baseline performance.
No new resource was deployed and no unrelated worktree or legacy external state changed.

Additional authentication reference:
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
