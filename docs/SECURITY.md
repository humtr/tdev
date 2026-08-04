# Terminal Developer Security and Authority Model

> Authority: this document owns the trust model, Agent enrollment and reconnection, key separation, Workspace and Project authority, local path policy, capability and permission intersection, secret handling, approvals, logging, revocation, and threat-response requirements.

## 1. Security statement

tdev provides a least-authority development control plane. It does not provide a kernel sandbox and does not claim isolation from other processes running as the same Termux user.

The security boundary is enforced by:

- explicit Agent identity;
- typed Agent capability;
- typed Workspace policy;
- immutable Case target grants;
- versioned Operation effects;
- exact Task preconditions;
- Task-scoped approval where required;
- local revalidation before effects;
- bounded input, output, deadline, and cancellation;
- connection epochs and fencing;
- secret separation and redaction;
- durable uncertainty instead of optimistic replay.

CaseDO mutation replay is allowed only from an immutable receipt whose canonical response bytes still match its stored digest and whose Case, Task, subject, committed revisions, Event sequence, capability, and semantic digest remain exactly bound. A matching request returns the original stored response without a second transition; a mismatch returns `REQUEST_ID_CONFLICT` without mutation. A lost response after commit is durable uncertainty resolved by the same deterministic Case route and receipt, not evidence that the admission failed. Local source tests do not prove Worker authentication, routing, restart, or Cloudflare persistence.

## 2. Trust domains

### 2.1 User and MCP client

The user authorizes product-level objectives and explicit approvals. The MCP client decides semantic next actions but is not trusted to bypass schema, policy, preconditions, or terminal rules.

Client name, version, protocol revision, and advertised capabilities are observations, not authentication or authorization. A user prompt cannot cause the client host to declare an extension it does not implement, and a claimed client name cannot widen any grant or policy.

### 2.2 Cloudflare deployment

The user's Worker, CaseDO, AgentDO, D1, R2, and secrets form the durable coordination domain. They are trusted to enforce the deployed protocol but do not receive the user's Cloudflare deployment credential or local Git provider credential.

### 2.3 Termux Agent

The Agent is trusted to perform local effects under the Termux user identity and to enforce Agent-local policy. It can access what that Unix identity can access; therefore Workspace policy is a product boundary, not operating-system isolation.

### 2.4 Remote providers

Git hosting and other external providers own their remote facts. Credentials remain on the terminal host. Provider responses can be ambiguous and must be re-observed before retry.

### 2.5 MCP projections

Tools, Resources, Task handles, and elicitation are presentation and transport projections over canonical tdev owners. They do not grant authority by possession.

Every Resource read and Task extension method rechecks the authenticated principal, current Case authority, and requested identifier. Unauthorized identifiers are not confirmed to exist. Resource URIs contain no credential, absolute local path, secret, or user-controlled authorization fact.

Form elicitation is limited to non-secret typed input and decisions. Cloudflare tokens, MCP bearer tokens, private keys, provider credentials, authorization codes, and secret environment values are never requested through form elicitation or persisted as Case input. A future URL elicitation flow requires a separate accepted threat model and one-use callback contract.

## 3. Credential and key separation

The following credentials have distinct owners and MUST NOT be reused:

```text
Cloudflare API Token
  owner: local tdev CLI profile
  purpose: create, inspect, update, and delete Cloudflare resources

Deployment Owner Key
  owner: local tdev CLI profile
  purpose: authorize Agent enrollment grants

Agent Private Key
  owner: Agent local secret store
  purpose: prove Agent identity on enrollment and reconnect

MCP Bearer Token
  owner: Cloudflare secret plus local recovery record
  purpose: authenticate MCP requests

Git Provider Credential
  owner: terminal credential manager, SSH, git helper, or gh
  purpose: remote Git and provider actions
```

No one credential is a fallback for another.

## 4. Cloudflare API Token

The product supports a scoped Cloudflare API Token, not the legacy Global API Key.

The token is used only by the local CLI and MUST NOT appear in:

- Worker variables or Durable Object storage;
- Agent configuration;
- CaseContract or CaseTargetGrant;
- Task or Attempt inputs;
- command arguments;
- logs, Events, checkpoints, Artifacts, or reports;
- Git history.

A Cloudflare dashboard token display-name change has no effect because identity is based on the local profile, account ID, and secret token value. A token value rotation requires profile update and re-verification.

Local token profiles use restrictive permissions and are identified by an opaque local profile ID, not by a mutable dashboard label.

## 5. Deployment Owner Key

`tdev setup` creates a deployment-specific signing keypair.

```text
owner private key  local CLI secret store
owner public key   deployment configuration
```

The key authorizes short-lived single-use enrollment grants. It is not used to sign Agent messages, MCP requests, releases, or Git commits.

Owner-key rotation requires:

- installation of a new public key under an explicit generation;
- a bounded overlap policy when needed;
- rejection of grants signed by retired generations;
- recovery documentation and independent verification.

## 6. Agent identity

### 6.1 Key generation

The Agent generates its own keypair locally. The initial algorithm is Ed25519, subject to implementation verification across the selected Go and Cloudflare runtimes.

The private key never leaves the terminal host.

### 6.2 Agent ID

Agent identity is derived from deployment identity and public key:

```text
agentId = typed_hash(deploymentId, canonical_agent_public_key)
```

The public contract treats `agentId` as opaque.

## 7. Agent enrollment

### 7.1 Existing identity check

`tdev setup` first searches for an existing valid Agent identity for the selected deployment. When key and enrollment data are present, setup attempts authenticated reconnect rather than creating a new identity.

### 7.2 Enrollment grant

The CLI signs a short-lived grant with the Deployment Owner Key:

```ts
type AgentEnrollmentGrant = {
  schemaVersion: 1;
  deploymentId: DeploymentId;
  grantId: string;
  agentPublicKeyDigest: Sha256;
  label: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  maximumUses: 1;
  ownerKeyGeneration: number;
  signature: string;
};
```

Recommended expiry is five to ten minutes. The exact default is measured and versioned.

The grant is bound to the Agent public key and cannot enroll a different key.

### 7.3 Connection routing

The Agent connects to the deployment Agent endpoint. The stateless Worker validates structure and routes by `agentId` to `AgentDO(agentId)`. AgentDO makes the enrollment decision.

### 7.4 Challenge

AgentDO returns:

```text
connectionAttemptId
server nonce
deploymentId
supported protocol range
```

### 7.5 Proof of possession

The Agent signs a canonical transcript containing:

```text
deploymentId
agentId
grantId
connectionAttemptId
server nonce
client nonce
selected protocol version
```

### 7.6 Atomic verification

AgentDO verifies in one canonical transition:

- deployment identity;
- owner signature and key generation;
- grant expiry;
- single-use status;
- public-key binding;
- Agent proof signature;
- protocol compatibility;
- revocation state.

It then atomically:

- consumes the grant;
- stores the Agent public key;
- creates enrollment revision 1;
- establishes connection epoch 1;
- registers the WebSocket and lease.

### 7.7 Enrollment receipt

The result includes only non-secret identity and connection facts:

```text
agentId
enrollmentRevision
connectionEpoch
selectedProtocolVersion
heartbeat interval
```

MVP does not issue a separate long-lived Agent certificate. AgentDO directly owns the public key and verifies reconnect challenges.

## 8. Agent reconnection and fencing

On reconnect:

1. Agent presents `agentId` and protocol range.
2. AgentDO issues a new nonce challenge.
3. Agent signs with the enrolled private key.
4. AgentDO verifies against the stored public key and revocation generation.
5. A successful replacement increments `agentEpoch`.
6. The previous connection is closed or fenced.
7. New queue assignments receive new fencing tokens.

Messages from an old epoch cannot update canonical queue or Case state.

An Agent result must match the full identity tuple defined by the protocol. Fencing is checked by both AgentDO and CaseDO.

## 9. Agent replacement and revocation

### 9.1 Replacement

Replacement uses a new keypair and therefore a new Agent identity:

```text
create new pending Agent
enroll and verify connection
reconcile in-flight Attempts
explicitly rebind selected Workspaces
revoke old Agent
verify old identity rejection
```

The old Agent is not revoked before the new Agent connection is proven unless the user explicitly chooses emergency revocation.

### 9.2 Revocation

Revocation increments a canonical generation and causes:

- new connections to be rejected;
- current connection closure;
- queue delivery stop;
- affected Tasks to enter reconciliation or waiting;
- explicit Workspace rebind before execution elsewhere.

Revocation does not claim that a currently running local process has stopped. Termination must be observed separately.

## 10. AgentCapability

Agent identity does not imply capability. The Agent advertises a signed current capability observation per connection epoch.

```ts
type AgentCapability = {
  schemaVersion: 1;
  agentId: AgentId;
  agentEpoch: number;
  agentVersion: string;
  host: {
    kind: "termux";
    architecture: "arm64";
  };
  protocol: {
    minimum: number;
    maximum: number;
    selected: number;
  };
  operations: {
    id: string;
    versions: number[];
  }[];
  tools: ToolCapability[];
  hostFeatures: HostFeature[];
  observedAt: Timestamp;
  capabilityDigest: Sha256;
  signature: string;
};
```

The signature covers the canonical capability observation including Agent identity, Agent epoch, selected protocol, and capability digest. Capability describes what the Agent can technically execute at the observation time. It does not grant permission.

A capability observation becomes stale according to a versioned freshness policy. Stale capability can block admission but cannot expand authority.

## 11. Workspace authority model

### 11.1 Three separate facts

The system distinguishes:

```text
WorkspaceLocator
  Cloud query index

AgentLocalWorkspaceRecord
  canonical local filesystem root and policy

CaseTargetGrant
  immutable maximum authority for one Case
```

These records are not interchangeable.

### 11.2 Workspace locator

D1 stores a non-authoritative locator:

```ts
type WorkspaceLocator = {
  workspaceId: WorkspaceId;
  agentId: AgentId;
  displayName: string;
  workspaceRevision: number;
  rootIdentityDigest: Sha256;
  policyDigest: Sha256;
  lastObservedAt: Timestamp;
};
```

Absolute local root paths are not stored in Cloud by default.

### 11.3 Agent-local Workspace record

```ts
type AgentLocalWorkspaceRecord = {
  schemaVersion: 1;
  workspaceId: WorkspaceId;
  rootPath: string;
  rootIdentity: FilesystemIdentity;
  workspaceRevision: number;
  policy: WorkspacePolicy;
  policyDigest: Sha256;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

`rootPath` is local configuration, not a public protocol target.

### 11.4 Workspace policy

```ts
type WorkspacePolicy = {
  schemaVersion: 1;
  effects: {
    fsRead: boolean;
    fsWrite: boolean;
    fsDelete: boolean;
    gitRead: boolean;
    gitWrite: boolean;
    remoteRead: boolean;
    remoteWrite: boolean;
    validationExecute: boolean;
    processExecute: boolean;
    networkUse: boolean;
    packageManage: boolean;
    serviceManage: boolean;
    runtimeManage: boolean;
  };
  paths: {
    followSymlinks: false;
    allowSymlinkNodes: boolean;
    allowNestedMounts: boolean;
    allowNestedWorkspaces: boolean;
    sensitivePaths: RelativePath[];
  };
  profiles: {
    allowedValidationProfileIds: string[];
    allowedProcessProfileIds: string[];
  };
  approval: {
    processRisk: {
      build: "case_grant" | "task";
      mutate: "task";
      external: "task";
    };
  };
};
```

The initial `followSymlinks` value is fixed to `false`; it is not a permissive switch. Future support requires a new policy version and a containment design.

### 11.5 Effective permission

```text
AgentCapability
intersection current WorkspacePolicy
intersection immutable CaseTargetGrant
intersection Operation required effects
intersection Task-specific preconditions and approval
```

Any missing element denies execution.

Policy narrowing takes effect immediately. Policy expansion does not expand an existing Case grant.

A root identity change invalidates existing grants until a successor Case or explicit contract revision path is created.

## 12. Project authority model

A Project is registered inside one Workspace.

```ts
type AgentLocalProjectRecord = {
  schemaVersion: 1;
  projectId: ProjectId;
  workspaceId: WorkspaceId;
  relativePath: RelativePath;
  rootIdentity: FilesystemIdentity;
  projectRevision: number;
  remote?: NormalizedRemote;
  defaultBranch?: string;
  validationProfileIds: string[];
  processProfileIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Rules:

- `remote` is absent when no remote exists;
- an empty remote string is invalid;
- Project root must remain contained in its Workspace;
- Project root symlink rules follow Workspace policy;
- Git remote URLs are normalized and secrets are removed;
- provider credentials are references to local credential mechanisms, not Project fields.

## 13. Filesystem containment

For every path Operation, the Agent:

1. resolves the registered root identity;
2. validates path syntax before filesystem access;
3. walks components without following disallowed symlinks;
4. validates mount and nested-Workspace policy;
5. confirms the final object kind;
6. revalidates containment before a mutating final effect;
7. returns the observed identity and digest.

Forbidden paths include:

- absolute paths;
- parent traversal;
- alternate separators;
- NUL-containing paths;
- paths entering sensitive entries;
- symlink traversal under the initial policy;
- paths crossing an unauthorized nested mount or Workspace.

Path-policy failures are typed failures, not empty results.

## 14. Process and profile security

### 14.1 No arbitrary process surface

`process.run` v1 accepts only a registered ProcessProfile. It does not accept arbitrary executable, shell text, argv, environment, PATH, or working directory.

### 14.2 Profile ownership

Profiles are installed or registered locally through explicit management. Each profile owns:

- executable resolution;
- parameter schema;
- argument template;
- working-directory policy;
- environment profile;
- effects;
- risk class;
- output policy;
- mutation evidence policy;
- retry policy;
- availability checks.

A Task references a profile ID and exact digest.

### 14.3 Environment profiles

Environment values are stored locally and allowlisted by name. Secret environment values are referenced, never returned in profile inspection. Child processes receive only the profile-defined environment.

## 15. Approval model

An approval record is bound to:

```text
caseId
taskId
operation input digest
target bindings
profile or plan digest
requested effects
expiry when applicable
approving actor
```

Changing any bound fact invalidates the approval.

The initial policy is:

- read-only typed Operations: no extra approval;
- exact file and Git mutations already bounded by an explicit Case grant: policy-derived;
- ProcessProfile `mutate` or `external`: Task approval;
- package, service, and runtime effects: not available in MVP.

## 16. Secret redaction

Redaction occurs before durable storage and before notification formatting.

At minimum, redact:

- Cloudflare tokens and authorization headers;
- MCP bearer tokens;
- private keys and enrollment grants;
- Git credential helper output;
- embedded credentials in remote URLs;
- known secret environment variables;
- profile-marked secret parameter fields;
- common token and private-key formats.

Redaction is not proof that arbitrary command output contains no secret. Profiles must minimize secret exposure at the source.

A redaction failure that may have persisted a secret is a security incident and blocks ordinary completion.

## 17. Logging and Artifact safety

- Logs use bounded structured fields.
- Full dispatch arguments are not logged by default.
- Secret-bearing fields are schema-marked and excluded.
- Artifact metadata records media type, bytes, digest, owner, and retention class.
- Artifact reads are authorized against Case ownership and caller access.
- Public responses never expose R2 object keys.
- Truncated output is marked incomplete.
- Diagnostic bundles require explicit user action and a manifest of included paths.

### 17.1 Durable storage integrity

Before a CaseDO repository serves a read or mutation, it verifies foreign-key enforcement, exact table/index/trigger names and SQL, `STRICT` table flags, integrity and foreign-key checks, one immutable `schema_meta` row, schema and migration digests, release-profile identity, and any required release identity. Mismatch fails closed as `STORAGE_VERSION_MISMATCH` or `STORAGE_CORRUPT`; metadata version alone is never trusted.

Every stored canonical JSON BLOB is re-read through the lossless ingress, required to be byte-for-byte canonical, checked against its stored digest, validated against the exact canonical schema root, and compared with its selector columns before domain use. Selector drift, invalid proof binding, digest mismatch, or non-canonical bytes are corruption, not authorization input. Immutable and terminal triggers, exact revision predicates, contiguous Event insertion, and rollback-on-fault prevent partial state from becoming canonical.

The Node SQLite adapter is confined to tests. Passing local SQLite tests does not prove Cloudflare Durable Object behavior, and no storage error may expose raw canonical values, secrets, or unrelated resource existence.

## 18. MCP authentication

MCP bearer tokens are deployment-scoped secrets. The Worker validates them before routing.

The initial product supports rotation with a bounded overlap generation. Token rotation must not change the endpoint or Case identities.

Authentication failure creates no Task and reveals no resource existence beyond the minimum error.

Pagination cursor integrity uses a deployment-scoped HMAC key that is distinct from the MCP bearer token. Cursor v1 fixes HMAC-SHA256; the release profile may set only the bounded TTL. Deployment configuration provides a current key generation and at most one previous generation for bounded rotation overlap. Key material is never committed, logged, included in a cursor, copied into canonical input, or persisted in an Event. Unknown key generation, malformed encoding, expiry, query mismatch, or failed constant-time MAC verification returns `INVALID_CURSOR` without revealing whether a referenced Case, Task, or Artifact exists. A valid cursor is still not authority: every page authenticates and authorizes again.

## 19. Threat cases and required behavior

| Threat or failure | Required response |
| --- | --- |
| stolen expired enrollment grant | reject by expiry and single-use record |
| stolen grant with different key | reject public-key binding |
| replayed Agent signature | reject nonce and connection-attempt mismatch |
| stale Agent connection | reject epoch and fencing |
| compromised D1 locator | canonical owners revalidate; locator cannot authorize |
| path traversal | typed denial before effect |
| symlink escape | typed denial under initial policy |
| Case requests broader effect than Workspace | deny admission or local execution |
| Workspace policy narrows after admission | Agent rejects dispatch; Task records policy failure |
| profile digest changes | reject exact profile precondition |
| provider response lost after push | read remote before retry |
| possible process still running after timeout | unverified until termination is observed |
| secret appears in captured output | redact before persistence; incident if persistence cannot be excluded |
| revoked Agent reconnects | reject revocation generation |
| Cloudflare token label renamed | no effect |
| Cloudflare token value rotated | local profile must update and verify |

## 20. Security acceptance

The security model is implemented only when tests demonstrate:

- enrollment grant expiry, key binding, single use, and replay rejection;
- reconnect challenge verification and epoch replacement;
- old-epoch and wrong-fencing rejection at both AgentDO and CaseDO;
- Workspace path traversal and symlink escape rejection;
- local policy narrowing after Cloud admission;
- immutable Case grant not expanding after policy expansion;
- root identity replacement invalidation;
- profile parameter rejection and profile digest mismatch;
- no secret values in canonical fixtures, logs, Events, Artifacts, or errors;
- MCP token rotation without endpoint change;
- Agent revocation and old-key rejection;
- same-UID limitation documented in user-facing setup output;
- no test claims a kernel sandbox or security isolation not provided by Termux.
