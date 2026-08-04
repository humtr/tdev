# Terminal Developer Installation, Deployment, and Lifecycle

> Authority: this document owns the installer contract, local authentication profiles, setup state machine, Cloudflare resource identity, D1 deployment schema, release cohesion, version compatibility deployment policy, upgrade, rollback, Agent service lifecycle, uninstall, destroy, recovery, and end-to-end deployment verification.

## 1. Deployment model

Each user deploys tdev into a Cloudflare account they control. The product is not a centralized SaaS and does not require a vendor-operated control plane.

The normal deployment contains:

```text
one stateless Worker
CaseDO namespace
AgentDO namespace
one D1 database
one R2 bucket
Worker secrets
workers.dev endpoint by default
```

The terminal host contains:

```text
tdev CLI
tdev-agent binary
Agent service definition
local Cloudflare profile
local deployment manifest
setup journal
Agent identity
Workspace and Project records
profile registry
```

## 2. Official installation entry point

```sh
curl -fsSL \
  https://github.com/humtr/tdev/releases/latest/download/install.sh \
  | sh
```

The public asset name is `install.sh`.

The installer is a bootstrapper, not a second setup implementation.

## 3. install.sh responsibilities

`install.sh` performs only:

1. supported host and architecture detection;
2. release selection;
3. immutable release-manifest download;
4. manifest and selected-asset verification;
5. CLI archive download;
6. atomic CLI installation;
7. `exec tdev setup` through `/dev/tty` when interactive input is available;
8. a clear setup command when no TTY exists.

It MUST NOT:

- deploy Cloudflare resources directly;
- store Cloudflare credentials;
- enroll the Agent;
- create Workspaces or Projects;
- contain migration logic duplicated from the CLI;
- require Node.js, npm, Wrangler, Go, or a source build;
- select an unsupported host through a permissive fallback.

## 4. Bootstrap verification

The release manifest is selected by a versioned release URL after resolving `latest`. All subsequent assets are fetched from immutable version-specific URLs.

The bootstrap verification mechanism must be proven on a clean supported Termux installation. The required end state is:

- an embedded or securely obtained release verification root;
- manifest authenticity verification;
- per-asset SHA-256 verification;
- archive path and type safety;
- exact platform and architecture matching;
- atomic installation;
- no execution of an unverified asset.

The precise signature utility is evidence-gated because a clean bootstrap cannot assume arbitrary packages. The implementation experiment must compare at least:

- a verification path implemented by an already trusted previous `tdev` binary for upgrades;
- a minimal verifier embedded in or downloaded by the bootstrap with a pinned digest and public key;
- capabilities reliably present in the supported Termux base environment.

A checksum delivered beside an asset over the same unauthenticated trust path is not sufficient by itself.

## 5. Local Cloudflare authentication profiles

A Cloudflare profile is reusable across deployments.

```ts
type CloudflareProfile = {
  schemaVersion: 1;
  profileId: string;
  displayName: string;
  accountId: string;
  apiTokenSecretRef: string;
  verifiedPermissions: string[];
  verifiedAt: Timestamp;
  profileRevision: number;
};
```

The token secret is stored separately from ordinary profile metadata with restrictive permissions.

Initial commands:

```text
tdev auth add
tdev auth list
tdev auth status
tdev auth use
tdev auth update
tdev auth forget
```

A profile display-name change has no authentication effect. Account ID or token value changes require re-verification.

## 6. Cloudflare API Token permissions

The default workers.dev deployment requests the narrowest permissions required by the implemented Cloudflare API calls. The expected categories are:

```text
Workers Scripts — Edit
D1 — Edit
Workers R2 Storage — Edit
```

The exact permission template is verified against implementation calls before release.

Default setup does not request DNS, Zone, or Workers Routes permissions. A future custom-domain flow is a separate explicit feature and permission request.

## 7. Deployment identity

Resource names are human-facing labels and are not canonical deployment identity.

```ts
type DeploymentDescriptor = {
  schemaVersion: 1;
  product: "tdev";
  deploymentId: DeploymentId;
  displayName: string;
  accountId: string;
  worker: {
    name: string;
    scriptVersion: string;
  };
  durableObjects: {
    caseNamespaceId: string;
    agentNamespaceId: string;
  };
  d1: {
    databaseId: string;
    schemaVersion: number;
  };
  r2: {
    bucketName: string;
  };
  endpoint: string;
  release: {
    version: string;
    manifestDigest: Sha256;
  };
  mcp: {
    protocolRevision: string;
    projectionDigest: Sha256;
  };
  agentProtocol: {
    minimum: number;
    maximum: number;
  };
};
```

`deploymentId` is immutable. `displayName` and resource labels can change without changing identity when bindings and descriptor remain verified.

The MCP protocol revision and projection digest are release-pinned identities owned by [MCP.md](MCP.md). They are not inferred from a client name, a moving `latest` label, or the currently connected request. Agent protocol compatibility remains a separate range.

## 8. Deployment discovery and reuse

`tdev setup` discovers an existing deployment in this order:

```text
1. selected local deployment manifest
2. Cloudflare tdev-managed descriptor records
3. actual Worker, Durable Object, D1, R2, and secret bindings
4. endpoint and product probe
```

Adoption requires all identity and binding checks. A `tdev-*` name prefix is never enough.

Outcomes:

- one exact match: reuse automatically;
- multiple verified matches: user selects;
- no match: create a new deployment;
- partial or conflicting match: stop with diagnosis and recovery choices;
- inaccessible resources: report unknown rather than creating duplicates.

Reusing a deployment preserves endpoint and MCP bearer token unless explicit rotation is requested.

## 9. Setup state machine

`tdev setup` is a durable local state machine with one setup journal.

```text
preflight
auth_profile
deployment_discovery
release_compatibility
resource_plan
cloud_resources
edge_deployment
owner_key
agent_installation
agent_enrollment
workspace_registration
project_registration
end_to_end_verification
completed
```

Every stage defines:

- input identity and revision;
- idempotency key;
- authoritative reader;
- observable completion condition;
- mutation receipt;
- rollback or compensation rule;
- resume behavior;
- invalidation triggers.

The journal stores identifiers and receipts, not secrets.

## 10. Setup stages

### 10.1 preflight

Verifies:

- supported Termux host and ARM64 architecture;
- private application storage availability;
- network and TLS capability;
- required basic utilities or Go CLI-owned replacements;
- process and service adapter availability;
- sufficient storage;
- clock sanity for signed grants;
- no unsupported installation collision.

Unsupported is a hard failure, not a generic Linux fallback.

### 10.2 auth_profile

Selects or creates a Cloudflare profile and verifies account identity and required permissions using harmless reads before mutation.

### 10.3 deployment_discovery

Finds and validates existing descriptors and resources. It does not create resources until ambiguity is resolved.

### 10.4 release_compatibility

Compares CLI, Agent, Edge bundle, stored schema, migration set, and protocol metadata from one release manifest.

### 10.5 resource_plan

Creates a deterministic plan with exact expected absence or existing identities. The plan has a digest used by later stages.

### 10.6 cloud_resources

Creates or reuses D1, R2, Durable Object namespaces, Worker script identity, and required secrets. Every create call has a durable local receipt and post-create observation.

### 10.7 edge_deployment

Uploads the prebuilt edge bundle and applies bindings and migrations in a release-defined order. The deployed product probe must return the selected release and protocol identity.

### 10.8 owner_key

Creates or reuses the Deployment Owner Key. The public key and generation are installed into the deployment without exposing the private key.

### 10.9 agent_installation

Installs the exact release Agent binary, configuration, and Termux service definition. It does not claim the service is healthy until process and authenticated connection are observed.

### 10.10 agent_enrollment

Uses the security flow in [SECURITY.md](SECURITY.md). Existing identity reconnect is preferred. A new identity is created only when needed or explicitly replacing an Agent.

### 10.11 workspace_registration

Registers an explicit root with typed WorkspacePolicy and verifies canonical root identity. Setup explains that this is not kernel isolation.

### 10.12 project_registration

Optionally discovers contained Git checkouts and requires explicit selection before registration. No remote is stored when no remote exists.

### 10.13 end_to_end_verification

Verifies:

- Worker product and release probe;
- MCP authentication;
- Agent authenticated connection and epoch;
- live capability probe;
- Workspace inspect;
- a harmless Case and read-only Task through the public path;
- terminal Task result;
- Case completion or cleanup;
- endpoint and MCP token presentation.

### 10.14 completed

Writes the final local deployment manifest only after all mandatory checks pass. Setup can then remove transient journal entries while retaining recovery receipts.

## 11. D1 role and schema

D1 contains queryable locator and deployment data only.

Expected tables:

```text
deployments
agents
workspaces
projects
cases
migrations
release_compatibility
```

D1 does not contain:

- full Case contracts;
- Task and Attempt lifecycle truth;
- Agent queue truth;
- absolute Workspace paths;
- Cloudflare API tokens;
- Agent private keys;
- Git credentials;
- large logs or Artifacts.

Projection updates are idempotent. Projection failure does not roll back canonical CaseDO or AgentDO state; it is retried and remains observable.

## 12. Release cohesion

One release manifest binds:

```text
tdev CLI
tdev-agent
edge Worker bundle
CaseDO and AgentDO implementation
canonical schema bundle
generated TypeScript and Go types
D1 migrations
Durable Object migrations
protocol compatibility metadata
Operation catalog and profile schema versions
installer assets
checksums and signatures
rollback metadata
```

A release is not a collection of independently selected latest assets.

## 13. Release manifest

The manifest includes at least:

```ts
type ReleaseManifest = {
  schemaVersion: 1;
  product: "tdev";
  version: string;
  publishedAt: Timestamp;
  sourceRevision: string;
  assets: ReleaseAsset[];
  edgeBundle: ReleaseAsset;
  schemas: ReleaseAsset;
  migrations: MigrationDescriptor[];
  protocolCompatibility: ProtocolCompatibility;
  minimumPreviousVersion?: string;
  rollbackCompatibility: RollbackCompatibility;
  manifestDigest: Sha256;
  signature: string;
};
```

Asset URLs become immutable after version selection.

## 14. Version compatibility

The deployment compares:

```text
CLI version
Agent version
Edge release
protocol version
canonical schema bundle
D1 schema
CaseDO and AgentDO stored schema
Operation catalog
```

Rules:

- unknown compatibility is rejection;
- the selected protocol is fixed for one Agent connection epoch;
- an incompatible Agent reports `upgrade_required` and receives no Tasks;
- Edge upgrade happens before or with a compatible Agent path defined by the manifest;
- stored-state migrations run only from a verified predecessor schema;
- additive schema changes are not assumed compatible without declared rules;
- rollback is allowed only when the predecessor understands the resulting stored state.

## 15. Upgrade state machine

```text
observe_current
select_release
verify_manifest
compatibility_plan
install_local_inactive
prepare_cloud_migrations
deploy_edge_inactive_or_staged
migrate
activate_edge
upgrade_agent
reconnect_and_negotiate
public_verification
commit_release
```

The exact Cloudflare staging mechanism is selected by implementation evidence, but the semantic gates remain fixed.

An upgrade failure preserves the last verified release when the migration contract allows it.

## 16. Rollback

Rollback is a verified state transition, not merely choosing an older binary.

A rollback plan identifies:

- current and target release identities;
- stored schema compatibility;
- D1 and Durable Object migration state;
- Agent protocol compatibility;
- endpoint and secret preservation;
- exact activation order;
- post-rollback probes;
- forward recovery path.

A rollback outcome is complete only after the target release, Agent connection, public MCP behavior, and required client schema are independently observed.

If stored state is not backward compatible, rollback is blocked or requires a release-defined compensating migration.

## 17. Agent service lifecycle on Termux

The Termux adapter owns the concrete service mechanism. The core owns abstract service intents:

```text
install
start
stop
restart
status
remove
```

The adapter reports:

- configured release identity;
- process identity;
- start time;
- current exit or signal state;
- connection state;
- last failure;
- whether Android background restrictions are known to affect reliability.

A running process is not equivalent to an authenticated Agent connection.

Android wake-lock and notification defaults are selected through measured reliability and battery tests. Until then, setup reports the configured policy and remaining risk explicitly.

## 18. MCP endpoint and token

Setup outputs:

- endpoint URL;
- MCP bearer token or a secure copy path;
- server name suggestion;
- exact manual ChatGPT registration steps;
- a product probe command;
- token rotation and recovery commands.

The product does not modify ChatGPT settings automatically.

Token rotation preserves endpoint and deployment identity. A bounded overlap generation prevents an immediate client outage when requested.

## 19. Local lifecycle commands

### 19.1 tdev uninstall

Removes from the current Termux installation:

- CLI binary when selected;
- Agent binary;
- Agent service definition;
- transient caches.

By default it preserves:

- Cloudflare authentication profiles;
- deployment manifest and recovery metadata;
- Cloudflare deployment;
- MCP endpoint and credential;
- optional Agent identity when safe and explicitly documented.

The command previews exact effects before confirmation.

### 19.2 tdev destroy

Destroys one selected Cloudflare deployment after exact identity and dependency checks.

It does not remove unrelated resources that merely share a name prefix. Cloudflare authentication profiles are preserved by default.

Deletion is ordered to retain recovery evidence until the last safe point.

### 19.3 tdev auth forget

Removes one local Cloudflare credential profile after confirming which deployments will lose management access. It does not delete Cloudflare resources.

### 19.4 tdev purge

A future destructive aggregate command, if added, must enumerate local credentials, recovery data, Agent identity, and Cloud resources independently. It cannot be an alias with hidden effects.

## 20. Reinstallation and recovery

Reinstallation normally performs:

```text
install CLI
load existing Cloudflare profile
load local deployment manifest
verify cloud deployment
reuse endpoint and token
reuse Agent identity when present
reinstall and reconnect Agent
verify Workspace and Project records
run end-to-end probe
```

If Termux application data was lost:

- Cloudflare deployment discovery can recover non-secret identity;
- a Cloudflare profile must be reintroduced;
- MCP token recovery or rotation follows deployment policy;
- Agent identity is not assumed recoverable without an explicit secure backup feature;
- a new Agent requires enrollment and Workspace rebind.

Encrypted profile export and import is deferred until its threat model and recovery scope are specified. Agent private keys are not included by default.

## 21. Failure and resume rules

For every setup or lifecycle API response that is lost:

1. read the authoritative resource state;
2. match exact identity, revision, and plan digest;
3. record the observed outcome in the journal;
4. retry only if the mutation is proven absent or idempotent.

Setup never creates duplicate resources merely because a response timed out.

A failed notification, display action, or browser launch does not change setup completion.

## 22. Deployment verification layers

Deployment completion keeps these layers separate:

```text
source revision
release manifest and assets
local CLI installation
Cloudflare resource bindings
stored schema and migrations
active Edge release
release-pinned MCP projection
Agent binary and service
Agent authenticated connection
Workspace and Project observation
public MCP behavior
current client-visible schema
rollback and recovery state
```

Each affected layer is read from its authoritative owner after mutation.

## 23. Deployment acceptance

A release deployment is accepted only when:

- installer and all selected assets verify;
- setup journal can resume at every injected failure boundary;
- resource creation is idempotent under lost responses;
- deployment discovery rejects name-only impostors;
- D1 and Durable Object migrations are from exact expected versions;
- active Edge probe matches release manifest;
- Agent service and authenticated connection match the expected Agent release;
- Agent protocol negotiation succeeds and the public MCP revision and projection digest match the release manifest;
- public read-only Case and Task complete through the endpoint using the release-pinned projection;
- the current client-visible Tool snapshot matches the approved projection or reports an explicit refresh/republication requirement;
- reinstall reuses deployment, endpoint, and credential as specified;
- uninstall preserves cloud state by default;
- destroy removes only exact owned resources;
- rollback restores a verified predecessor when declared compatible;
- secrets do not appear in journal, logs, argv, or reports;
- unsupported hosts stop before mutation.
