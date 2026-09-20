# Local operation and remaining acceptance

This runbook describes operator actions; it does not grant production authority.
Current implementation/acceptance status lives in README.

## Development and inactive rehearsal

From the repository root:

```sh
python -m pip install --target .tdev-deps -r requirements.txt
sh scripts/check.sh
sh install.sh --no-start /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin init --root /absolute/private/staging-root
PYTHONPATH=src:.tdev-deps python -m tdev.admin point --root /absolute/private/staging-root --bundle RETURNED_BUNDLE_ID
sh install.sh --check /absolute/private/staging-root
```

Stage copies a verified bundle and creates DOWN service templates outside the live
service directory. It never starts/replaces production services. The generated
connector.secret is mode 0600; its contents must be entered only through the connector
credential UI, not a chat/tool argument. Initial config grants no repositories.
Config shape is checked by contracts/config.schema.json; public wire types remain
in contracts/tools.schema.json. Do not put credentials in repository config.

## Repository and executor enrollment

Operator config identifies repositories by a local label plus immutable identity.
GitHub uses kind=github, name=owner/repository, exact HTTPS .git URL and identity
github:NUMERIC_REPOSITORY_ID. Query the ID with authenticated gh api; do not infer it
from the name. The target must have no-delete/no-rewrite protection and the intended
publication principal must have actual access. Local test repositories use kind=local,
an absolute bare path and identity local:DEVICE:INODE. Each entry lists exact full refs,
an adopted mandatory validation command, admitted networks and optional executor config.
The matching principal's repos map lists the allowed refs. No per-command grants.

The SSH executor requires a separate Linux host with rootless Podman, cgroup v2 CPU,
memory and PID controllers, seccomp, Python and Git. The pinned image needs /usr/bin/env,
/bin/sh, python3, git and required development CLIs. It must be pre-pulled by the operator.
The controller does not pull images, provision infrastructure or install remote keys.

Install src/tdev/executor.py to an operator-owned absolute remote path and record its
SHA-256 digest. Use immutable versioned script paths so pending operations can still
observe their adopted executor after an upgrade. Configure target, script, digest, spool (private absolute directory),
image (name@sha256:digest), identityFile and knownHosts. These are private local files;
SSH enforces pinned host keys, no agent forwarding, no password prompt and one identity.
Do not reuse a production service credential merely because it exists on the device.

Network none works without egress adoption. For internet, the remote spool's private
network-policy.json must name a dedicated tdev-* Podman network and qualificationDigest
identifying operator-reviewed evidence that private/admin/metadata destinations are
blocked. Pin that file's canonical JSON SHA-256 as executor.networkPolicyDigest. The
controller must also grant internet for the repository. A digest is adoption, not proof
that firewall rules work: run the actual negative tests before enabling this mode.

Production code never falls back to same-UID local execution. Local test executors are
authored fixtures imported only from tests. CLI adapters are ordinary sandbox programs;
they cannot access controller config, publish credentials or outer receipt files.

## Local HTTP and Tunnel

The following starts an explicitly selected development instance, not installed services:

```sh
PYTHONPATH=src:.tdev-deps python -m tdev.server --state /private/dev-state --config /private/config.json --port 8765
```

The server listens on 127.0.0.1 only. GET /healthz is a credential-free liveness check;
POST /mcp requires the bearer for initialize, discovery and calls. Incoming
X-Openai-Subject/Session headers never change authorization.

For the installed tunnel-client, use its help/doctor to configure a distinct tdev profile
pointing at http://127.0.0.1:8765/mcp. It needs an operator-selected tunnel ID and runtime
API key with Tunnels Read + Use. Tunnel provisioning/admin key is a different boundary.
Keep those values in a private profile or envdir; service templates expect tunnel-env
and profile tdev. Installed CLI help was inspected; actual forwarding is not yet proved.

While the selected tunnel is running, connect/refresh the ChatGPT developer connector.
Configure its installation secret through the host's credential UI. Acceptance must show
seven tools, denied discovery with a wrong secret, accepted discovery with the right
secret, and a repeated mutation request returning the same operation after reconnect.
If the host cannot forward a distinct bearer, stop authentication acceptance and choose
a supported per-principal connection/auth route; do not substitute unverified headers.
No account/session isolation is claimed for shared credentials.

## Live executor acceptance

Use disposable enrolled refs and credential sentinels, never production candidate code
before isolation qualification. Verify no controller/SSH/provider secrets or outer
spool access, cross-workspace and symlink escapes denied, host sockets/metadata/private
network denied, kernel memory/PID/CPU/disk limits enforced, bounded output with cursors,
stdin loss has no resend, cancellation stops all descendants, and no duplicate launch
after SSH loss. Confirm read-only validation source and exact candidate HEAD, forged
stdout cannot pass validation, lost publication response reconciles without another
push, and real controller restart recovers the same execution identity.

The OCI source filesystem uses bounded tmpfs; a completed command is frozen before
capture and then stopped. A forced cancellation/host loss can lose uncheckpointed
bytes. Such terminal failures return captureError and preserve the previous checkpoint.
There is no claim of recovering bytes after a destroyed remote filesystem.

After a terminal operation has been reconciled into the controller, use tdev_process
action retire with a new requestId and that operationId to remove the exact stopped
container and remote source/capture payloads. Intent digest, result and bounded logs
remain for replay. Retirement of live/unknown executions is rejected.

## Activation and rollback

After real acceptance and explicit production cutover authority, stop the selected
controller, ensure no outstanding effects, verify the staged bundle and atomically point
active to it. Only then install the DOWN service templates into the actual runsvdir and
bring up the controller and tunnel independently. Preserve old service/config state for
rollback; do not change canonical Git history. The point command refuses an active
controller, pending/unknown effects or incompatible DB schema. --rollback verifies and
selects the previous compatible bundle and does not start services. Android may kill
the entire Termux UID; runit cannot survive that or promise always-on service.
