# Termux operation

Operator actions, not production authorization. Current status lives in README.

## On-device prerequisites and inactive install

Use Termux Python, Git and the development CLIs required by the enrolled repositories
(for example Node/npm, Python/pip, rg). GitHub publication also needs owner-configured gh
authentication. Prefer the native Android/arm64 CGO tunnel-client. The fallback official
static Linux binary needs Termux PRoot to project resolver/CA files into conventional /etc
paths; that is compatibility plumbing, not isolation. No remote executor enrollment, root,
Docker or systemd is needed.
Install dependencies and rehearse before touching any existing service:

```sh
python -m pip install --target .tdev-deps -r requirements.txt
sh scripts/check.sh
PYTHONPATH=src:.tdev-deps python scripts/rehearse.py
sh install.sh --no-start /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin init --root /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin point --root /absolute/private/staging-root --bundle RETURNED_BUNDLE_ID
sh install.sh --check /absolute/private/staging-root
```

Stage includes the native runner and creates DOWN service templates outside live runsvdir.
It also creates a private mode-0700 tunnel-env directory; Termux does not need an envdir
binary. It never starts/replaces production services. Generated connector.secret is mode
0600; enter it only in the host credential UI, not chat/tool arguments. Initial config
grants no repositories. Keep config/credentials outside source.

Store the Tunnel runtime key once as an owner-only file:

```sh
umask 077
read -rsp "Tunnel runtime API key: " KEY
echo
printf '%s' "$KEY" > /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY
unset KEY
chmod 600 /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY
```

The tunnel service reads that file directly into CONTROL_PLANE_API_KEY at process start.
The secret is not placed in argv or repository configuration.

## Repository enrollment: native is the default

A repository entry lists immutable identity, exact URL/path/ref and mandatory validation.
GitHub uses kind=github, name=owner/repository, exact HTTPS .git URL and identity
github:NUMERIC_REPOSITORY_ID (query authenticated gh api, never infer from name). The
publication credential must have actual access; enroll no-rewrite/no-delete refs.
Local bare fixtures use kind=local, absolute path and identity local:DEVICE:INODE.
The matching principal's repos map lists exact allowed refs.

Omit executor, or set executor to {"kind":"native"}. Omit networks (defaults to ["host"])
or explicitly list host. Nothing else is needed to run commands. Existing configs listing
only networks=["none"] must be changed explicitly for native execution: none does NOT mean
a pretend sandbox. Explicit remote configs keep their existing backend and network policy.

Example repository value (replace identity, repo and command; never put secret values here):

```json
{
  "kind": "github",
  "name": "owner/repository",
  "remote": "https://github.com/owner/repository.git",
  "identity": "github:NUMERIC_ID",
  "refs": ["refs/heads/main"],
  "validation": "npm test",
  "toolingEnvironment": {
    "NODE_PATH": "/absolute/operator-owned/node_modules"
  }
}
```

Native runs with the Android app UID. Only use code/dependencies trusted with that user's
authority. The runner does not inherit tokens, agents, proxy env or global Git config;
HOME/TMPDIR/XDG paths are per-job. Existing source/user index is not the command cwd.
These are credential hygiene, not isolation: malicious same-UID code can access controller
files or private networks by absolute path. Native host networking is ordinary device
networking. Hard network isolation, aggregate RAM/PID quotas and hostile-code protection
are NOT provided. Do not falsely label an env-filtered shell a sandbox.

Validation materializes the frozen candidate with exact Git HEAD. New build artifacts may
be written; existing source bytes/modes must remain unchanged at completion. Source-changing
formatters/generators belong in exec, then validate their captured checkpoint. Test outputs
are never published. This is owner-trusted before/after checking, not a read-only OS mount.
Each exec/validation gets a fresh source copy and HOME. Ignored dependency/build directories
from an earlier command are not copied to validation. An adopted validation command may
prepare dependencies inside that copy, use operator-installed Termux tools, or use the
repository's bounded `toolingEnvironment` to reference an operator-owned warm dependency/
tooling location outside source. Do not place credentials in this environment; private
HOME/TMP/Git/SSH lookup variables are reserved. The tooling environment is part of validation
policy identity, so changing it invalidates prior validation for publication. Large installs
inside a per-operation copy can still hit the documented native disk/source limits.
Only configured strings are bound, not the mutable contents of external directories. Use
versioned operator-owned dependencies, not a second source checkout, and change the configured
path for tooling upgrades. Candidate modules must precede external dependencies (the tdev
check script puts candidate src first). NODE_PATH does not add npm executable directories to
PATH: adopt the correct validation command/tool paths for the actual repository. Never put
tokens in PATH/PYTHONPATH or other tooling values; same-UID access is still not isolated.

## Local HTTP and Tunnel

Start a selected development instance, separate from existing installed services:

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.server --state /absolute/private/dev-state --config /absolute/private/config.json --port 8765
```

Server binds 127.0.0.1 only. GET /healthz is liveness; POST /mcp requires the installation
bearer before discovery/calls. Subject/session headers never grant authority.

The endpoint implements **MCP 2026-07-28 only**. Use a client pinned to that revision;
there is no initialize handshake or session header. Every POST request needs Accept
application/json and text/event-stream, MCP-Protocol-Version=2026-07-28, Mcp-Method matching
the JSON-RPC method, and params._meta containing io.modelcontextprotocol/protocolVersion
and io.modelcontextprotocol/clientCapabilities. tools/call also needs matching Mcp-Name.
Client identity metadata is never a permission grant. See the contract x-mcp profile.

Reproduce the official SDK compatibility probe (a development-only dependency, not runtime):

```sh
npm install --prefix .tdev-mcp-client --ignore-scripts --no-audit --no-fund @modelcontextprotocol/client@2.0.0
PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py
```

This verifies local modern-protocol discovery/tools/calls, not a live ChatGPT host.
OpenAI's documented HTTP/Tunnel support alone does not prove support for this exact date.
Do not downgrade silently if a host sends legacy initialize or lacks required headers.

Use the installed tunnel-client help/doctor to configure profile tdev pointing at
http://127.0.0.1:8765/mcp. Provide Tunnel runtime credentials privately and separately
from installation bearer/provider credentials. Existing production profiles must not be
repurposed automatically. OAuth/DCR discovery is intentionally absent; the two protected-
resource well-known candidates return public HTTP 404 while /mcp remains bearer protected.

Prepare the Tunnel runtime before staging. The preferred path compiles the pinned official
OpenAI source as an Android/arm64 CGO-enabled binary under the private installation root.
If native compilation is unavailable or fails, Termux falls back to the installed official
Linux binary through termux-chroot plus the Termux CA bundle:

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.admin prepare-tunnel \
  --root /absolute/private/staging-root
```

`install.sh --no-start` performs this preparation automatically before staging. A successful
native preparation reports `mode: native-cgo`; fallback reports `mode: termux-chroot`.
The native binary needs no PRoot/chroot wrapper, custom resolver variable or CA override.
The fallback uses `CA_BUNDLE=$PREFIX/etc/tls/cert.pem`; termux-chroot supplies the Linux
filesystem view including `/etc/resolv.conf`. termux-chroot comes from the Termux proot
package, so this reduces wrapper complexity but is still PRoot-backed compatibility rather
than isolation.

For manual qualification, use the prepared private binary when native-cgo succeeded:

```sh
CONTROL_PLANE_API_KEY="$(cat /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY)" \
  /absolute/private/staging-root/bin/tunnel-client doctor \
  --profile tdev --health.listen-addr 127.0.0.1:0 --explain

CONTROL_PLANE_API_KEY="$(cat /absolute/private/staging-root/tunnel-env/CONTROL_PLANE_API_KEY)" \
  /absolute/private/staging-root/bin/tunnel-client run \
  --profile tdev --health.listen-addr 127.0.0.1:0
```

The staged tdev-oai-tunnel runit template selects that private native binary first. If it is
absent, a qualified Termux fallback template uses `termux-chroot tunnel-client` with
`CA_BUNDLE` and the same owner-only key-file and ephemeral-health-listener policy.

Connect/Refresh the ChatGPT connector and enter its bearer through the credential UI.
Verify 2026-07-28 request metadata/header forwarding, seven tools, wrong-secret discovery denial, full native
workspace/edit → exec/process → validate → publish, and same-request replay after reconnect.
If bearer forwarding is unsupported, qualify another supported host auth route; do not
substitute unverified subject/session headers. Shared credentials share API authority.

## Processes and restart

Workspace inspect returns a bounded current source/remote/operation/cleanup view, even for
closed workspaces (discover with list includeClosed). Follow nextBefore/nextAfter for older
rows. Process status with since (empty initially) and inspect expose a cursor, changed,
observation time and pollAfterMs. Reuse the returned cursor with the same query: unchanged
means checked now, not stalled. Respect the polling hint/task deadline or do independent
work. Exact admission checks still apply; mutationReady is only the open/no-busy prerequisite.

The native supervisor outlives controller HTTP/restart. Observe the original operation or
lookupRequestId after lost responses; never create a new request just because no response
arrived. Stdin delivery is sequenced and durable; queued/committed means pipe delivery,
not application consumption. Cancellation requests stop supervised descendants before capture.
Timeout/cancel can retain safely captured edits; capture failure preserves prior checkpoint.

After terminal reconciliation, process action retire with a new requestId removes execution
copies/payloads, retaining intent digest, result and bounded logs. It also works after the
creator finished. Unknown/live operations cannot be retired. Runit/Android may kill the whole
app UID; there is no always-on promise. Supervisor death without a sealed result remains
uncertain and fences only that workspace; preserve the spool for operator investigation.
No stale job becomes a global lock or a reason to provision another machine.

## Local Codex and optional CLI extensions

The installed Codex client may still speak legacy initialize; a direct connection to the
2026-07-28 endpoint then fails. Do not change the core version or mislabel tool annotations.
An explicit localhost-only stdio adapter is available:

```sh
PYTHONPATH=/absolute/tdev/src:/absolute/tdev/.tdev-deps python -m tdev.codex_bridge \
  --url http://127.0.0.1:8765/mcp --token-file /absolute/private/connector.secret
```

Register that command and PYTHONPATH in the chosen Codex MCP configuration if persistent
access is wanted; do not put the token value in command arguments or source. The file must
be private and contain a bearer already admitted by that installation. Adapter initialization
reports 2025-11-25, while every upstream request uses 2026-07-28. It forwards tool semantics
unchanged and never automatically retries effects. Native trust limitations still apply.

Use the prepared native `tunnel-client codex plugin install` when the optional Tunnel plugin
is missing. This changes Codex plugin configuration, not production services. The plugin
manages Tunnel runtimes; it does not by itself expose tdev's seven tools to Local Codex.
Test installed-client discovery/calls without a model run or permanent MCP config rewrite:

```sh
PYTHONPATH=src:.tdev-deps python scripts/check_codex.py
```

This runs a disposable local bare-ref/native coding path through actual Codex app-server MCP,
with client restart/replay and retirement. It does not test Codex through Secure MCP Tunnel.
External CLIs already use exec/stdin/output/capture and the normal process lifecycle; no
public capability gateway is required. Other MCP services remain independent clients.

Annotations now honestly mark mixed/mutating tools as such. A host may prompt or refuse an
action; use its supported approval settings, not false read-only/destructive hints. After
deploying changed annotations to the chosen development installation, Refresh the ChatGPT
connector and recheck only affected discovery/approval behaviour. Prior full-path acceptance
does not prove a new annotation profile is accepted.

New DOWN Tunnel service templates write their randomly assigned health address to
`<installation-root>/tunnel-health.url`. After authorized startup, inspect it with
`tunnel-client health --url-file <installation-root>/tunnel-health.url --require-control-plane-poll --json`.
An old foreground runtime without that file needs separate observation; do not infer its
health from a guessed fixed port or restart it just to create the file.

## Optional SSH/OCI backend

Only users who choose stronger isolation need a separate Linux host, rootless Podman with
cgroup v2/seccomp, pinned image and SSH key/host enrollment. Set executor kind=ssh with
target, script, digest, spool, image, identityFile and knownHosts (legacy omission of kind
also works). Install the standalone src/tdev/executor.py at an immutable versioned remote
path and pin its SHA-256; pre-pull the image. None is its default network. Internet requires
the adopted private network-policy.json and matching networkPolicyDigest, plus live egress
qualification. See ARCHITECTURE for its distinct security guarantees.

Do not claim optional OCI host isolation/resource/network acceptance from local fixture
tests. Those tests remain useful but are not a native installation gate. A failing explicit
remote backend never falls back to a less-isolated native run. Accepted operation intents
continue using their recorded backend even after configuration changes.

## Activation and rollback

After host acceptance and explicit cutover authority, stop the selected controller, check
outstanding effects, verify and select the bundle, then install DOWN templates in runsvdir
and bring up controller/Tunnel independently. Preserve old service/config state. Point/
rollback refuses an active controller, unknown/running operations or incompatible schema.
Rollback selects the previous verified bundle; it does not start services or rewrite Git.
Same-UID hostile code can tamper with installations: verification is not OS isolation.
