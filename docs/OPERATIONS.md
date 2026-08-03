# Terminal Developer Operation Contract

> Authority: this document owns the Agent Operation catalog, target roles, required effects, approval and retry policy, ValidationProfile and ProcessProfile contracts, and Operation-specific inputs, results, failures, and reconciliation rules. Case and Task control tools are owned by [PROTOCOL.md](PROTOCOL.md).

## 1. Operation design rules

Every Operation is a versioned semantic action. It MUST define:

- stable ID and integer version;
- description;
- target roles and cardinality;
- allowed target kinds;
- required effects;
- strict input, result, and failure schemas;
- cancellation behavior;
- retry behavior;
- approval behavior;
- exact preconditions;
- bounded output behavior;
- evidence produced;
- reconciliation behavior after an ambiguous response.

An implementation MUST NOT silently replace a typed Operation with `sh -c`, an arbitrary executable, or a broader profile.

## 2. Effect vocabulary

The initial effect vocabulary is:

```text
fs.read
fs.write
fs.delete
git.read
git.write
remote.read
remote.write
validation.execute
process.execute
network.use
package.manage
service.manage
runtime.manage
```

An Operation can execute only when every required effect is present in the effective permission intersection defined by the security model.

## 3. Target roles

Targets are supplied by `submit_operation` outside Operation-specific arguments.

```ts
type TargetBinding = {
  role: string;
  grantId: GrantId;
  resource:
    | { kind: "workspace"; workspaceId: WorkspaceId }
    | {
        kind: "project";
        workspaceId: WorkspaceId;
        projectId: ProjectId;
      };
};
```

Initial fixed roles include:

```text
source
target
repository
```

A future multi-target Operation must define explicit roles such as `source` and `destination`; it must not infer roles from array order.

## 4. Retry classes

```text
idempotent
  A new Attempt can be authorized automatically when the previous Attempt is proven not to have changed state.

reconcile_before_retry
  Target or receipt reconciliation is mandatory before a new Attempt.

explicit_retry_only
  Reconciliation is followed by an explicit Task retry decision.
```

Redelivery of the same `attemptId` is not a retry. It is idempotent message delivery.

## 5. Approval classes

```text
none
  The immutable Case grant and current local policy are sufficient.

policy_derived
  Workspace policy or profile risk class decides whether Task approval is required.

explicit
  Each Task enters waiting(approval) before dispatch.
```

Standing approval is not part of the MVP. An approval applies to one Task, one input digest, one target set, and one plan or profile digest.

## 6. MVP Operation catalog

### 6.1 Observation

```text
agent.status
agent.probe
workspace.list
workspace.inspect
project.list
project.inspect
file.list
file.read
file.search
git.status
git.inspect
git.diff
git.history
validation.describe
```

### 6.2 Mutation and execution

```text
file.apply
git.fetch
git.stage
git.commit
git.push
validation.run
process.run
```

### 6.3 Deferred Operations

The MVP does not include:

```text
file.delete
file.move
git worktree lifecycle
repository creation
pull request, issue, release, or Actions management
package installation
service control
runtime deployment control
arbitrary shell execution
multi-Agent placement
```

## 7. Common path contract

A relative path is UTF-8 and NFC-normalized. It MUST NOT contain:

- an absolute prefix;
- NUL;
- backslash;
- empty segments;
- `.` or `..` segments;
- a representation that resolves outside the selected target root.

The root itself is represented by a typed variant, not an empty path.

```ts
type WorkingDirectory =
  | { kind: "target_root" }
  | { kind: "subpath"; path: RelativePath };
```

Disallowed symlinks are rejected according to WorkspacePolicy.

## 8. Common captured output

```ts
type CapturedStream =
  | { kind: "empty" }
  | {
      kind: "inline_utf8";
      text: string;
      bytes: number;
      complete: true;
    }
  | {
      kind: "artifact";
      artifact: ArtifactRef;
      preview?: string;
      complete: boolean;
    };
```

Output exceeding the inline bound becomes an Artifact. Output exceeding the Artifact bound is marked incomplete and cannot silently support complete evidence.

## 9. file.list v1

Purpose: list bounded entries under a Workspace or Project target.

Required effect:

```text
fs.read
```

Input:

```ts
type FileListInput = {
  root: WorkingDirectory;
  maxDepth: number;
  maxEntries: number;
  include: ("files" | "directories" | "symlinks")[];
};
```

Result:

```ts
type FileListResult = {
  root: WorkingDirectory;
  entries:
    | { kind: "inline"; items: FileEntry[] }
    | { kind: "artifact"; artifact: ArtifactRef; totalEntries: number };
  truncated: boolean;
  observationDigest: Sha256;
  observedAt: Timestamp;
};
```

Retry: `idempotent`.

## 10. file.read v1

Purpose: observe one regular file and return a bounded content selection plus a digest of the complete file.

Target role: `source`.

Required effect:

```text
fs.read
```

Input:

```ts
type FileReadInput = {
  path: RelativePath;
  selection:
    | {
        kind: "text_lines";
        startLine: number;
        maxLines: number;
        maxBytes: number;
      }
    | {
        kind: "byte_range";
        offset: number;
        maxBytes: number;
      };
  expectation:
    | { kind: "any_regular_file" }
    | { kind: "exact_file"; sha256: Sha256; bytes?: number };
};
```

Result:

```ts
type FileReadResult = {
  path: RelativePath;
  observation: {
    kind: "regular_file";
    sha256: Sha256;
    bytes: number;
    executable: boolean;
  };
  content:
    | {
        kind: "utf8_lines";
        text: string;
        startLine: number;
        endLine: number;
        returnedBytes: number;
        completeness:
          | { kind: "complete" }
          | { kind: "truncated"; reason: "max_lines" | "max_bytes" };
      }
    | {
        kind: "base64_bytes";
        data: string;
        offset: number;
        returnedBytes: number;
        completeness:
          | { kind: "complete" }
          | { kind: "truncated"; reason: "max_bytes" };
      };
  observedAt: Timestamp;
};
```

The observation digest is calculated over the complete file even when returned content is partial.

Failures:

```text
PATH_NOT_FOUND
PATH_OUTSIDE_TARGET
SYMLINK_DISALLOWED
UNSUPPORTED_FILE_KIND
INVALID_UTF8
FILE_EXPECTATION_MISMATCH
FILE_CHANGED_DURING_READ
```

Retry: `idempotent`.

## 11. file.search v1

Purpose: literal or regular-expression search across bounded contained files.

Required effect: `fs.read`.

Input MUST specify:

- query kind and value;
- case sensitivity;
- included subpaths;
- excluded subpaths;
- maximum matched files;
- maximum matches;
- maximum bytes read;
- binary-file policy.

The result includes source observation digests for matched files and a truncation record. Search results are observations, not proof that no other match exists when truncated or excluded.

Retry: `idempotent`.

## 12. file.apply v1

Purpose: create, replace, or deterministically edit one regular file under exact preconditions.

Target role: `target`.

Required effect: `fs.write`.

Deletion, move, directory removal, and permission changes are not part of v1.

Input:

```ts
type FileApplyInput = {
  path: RelativePath;
  change:
    | {
        kind: "create";
        expected: { kind: "absent" };
        content: FileContentSource;
        expectedAfterSha256: Sha256;
      }
    | {
        kind: "replace";
        expected: { kind: "regular_file"; sha256: Sha256 };
        content: FileContentSource;
        expectedAfterSha256: Sha256;
      }
    | {
        kind: "exact_edits";
        expected: { kind: "regular_utf8_file"; sha256: Sha256 };
        edits: ExactTextEdit[];
        expectedAfterSha256: Sha256;
      };
  parentPolicy:
    | { kind: "must_exist" }
    | { kind: "create_missing" };
};
```

```ts
type FileContentSource =
  | { kind: "inline_utf8"; text: string }
  | {
      kind: "artifact";
      artifactId: ArtifactId;
      expectedSha256: Sha256;
      expectedBytes: number;
    };

type ExactTextEdit = {
  oldText: string;
  newText: string;
  expectedOccurrences: number;
};
```

Exact edits are applied in array order. Every edit's occurrence count is checked before the final replacement. A mismatch leaves the target unchanged.

Result:

```ts
type FileApplyResult = {
  path: RelativePath;
  before:
    | { kind: "absent" }
    | { kind: "regular_file"; sha256: Sha256; bytes: number };
  after: {
    kind: "regular_file";
    sha256: Sha256;
    bytes: number;
    executable: boolean;
  };
  effect:
    | { kind: "created" }
    | { kind: "replaced" }
    | { kind: "edited"; appliedEdits: number };
  createdParents: RelativePath[];
  writeMethod: "same_directory_atomic_replace";
  observedAt: Timestamp;
};
```

Execution sequence:

```text
validate containment and policy
observe expected target
construct temporary file in same directory
validate expected result digest
re-observe target precondition
atomically replace
re-observe final digest
```

Failures:

```text
FILE_PRECONDITION_MISMATCH
PATH_OUTSIDE_TARGET
SYMLINK_DISALLOWED
PARENT_NOT_FOUND
PARENT_NOT_DIRECTORY
ARTIFACT_MISMATCH
EDIT_OCCURRENCE_MISMATCH
RESULT_DIGEST_MISMATCH
ATOMIC_REPLACE_FAILED
EFFECT_UNVERIFIED
```

Retry: `reconcile_before_retry`.

Reconciliation:

```text
after digest matches   recover existing Attempt as succeeded
before state matches   a new Attempt may be authorized
neither matches        Task becomes unverified or awaits a retry decision
```

## 13. git.status v1

Purpose: deterministically observe repository identity, HEAD, index, worktree, and optional content-aware source state.

Target role: `repository`.

Required effects:

```text
git.read
fs.read
```

Input:

```ts
type GitStatusInput = {
  scope:
    | { kind: "all" }
    | { kind: "paths"; paths: RelativePath[] };
  untracked: "exclude" | "normal" | "all";
  ignored: "exclude" | "matching";
  contentHashing:
    | { kind: "none" }
    | { kind: "changed_files"; maxTotalBytes: number };
  maxEntries: number;
};
```

Result:

```ts
type GitStatusResult = {
  repository: {
    objectFormat: "sha1" | "sha256";
    head:
      | { kind: "unborn" }
      | { kind: "commit"; objectId: GitObjectId };
    branch:
      | { kind: "detached" }
      | { kind: "named"; name: string };
    upstream:
      | { kind: "absent" }
      | {
          kind: "present";
          remote: string;
          branch: string;
          objectId: GitObjectId;
          ahead: number;
          behind: number;
        };
  };
  indexTree: { objectId: GitObjectId };
  entries:
    | { kind: "inline"; items: GitStatusEntry[] }
    | { kind: "artifact"; artifact: ArtifactRef; totalEntries: number };
  statusDigest: Sha256;
  contentState:
    | { kind: "not_computed" }
    | {
        kind: "complete";
        sourceDigest: Sha256;
        hashedFiles: number;
        hashedBytes: number;
      }
    | {
        kind: "incomplete";
        reason: "max_total_bytes";
        hashedFiles: number;
        hashedBytes: number;
      };
  observedAt: Timestamp;
};
```

`sourceDigest` can be used as exact validation evidence only when complete.

Retry: `idempotent`.

## 14. git.inspect v1

Purpose: bounded exact inspection of repository identity, local refs, object existence, ancestry, merge bases, and remote configuration metadata without reading secrets.

Input declares each requested observation explicitly. Results identify the Git object format and never assume 40-character object IDs.

Retry: `idempotent`.

## 15. git.diff v1

Purpose: return a bounded deterministic diff for worktree, index, or exact commit range.

Input includes:

- diff kind;
- exact base and head when applicable;
- paths;
- rename detection policy;
- binary policy;
- maximum bytes.

Result includes the exact compared object IDs or status digest, truncation state, and either inline content or an Artifact.

Retry: `idempotent`.

## 16. git.history v1

Purpose: read bounded history from one exact Git object ID with optional contained paths.

The result includes commit, parent, tree, public author/committer identity, timestamps, and message digest. It does not expose credential configuration.

Retry: `idempotent`.

## 17. git.fetch v1

Purpose: fetch exact remote refs into explicitly named local destinations.

Required effects:

```text
remote.read
git.write
```

Every request contains:

- remote profile ID and digest;
- source ref;
- expected remote object ID or known absence;
- destination ref;
- expected destination object ID or known absence.

The Agent uses local credentials. Secrets do not enter the Task.

Retry: `reconcile_before_retry`. The Agent observes both remote and destination refs before issuing another fetch.

## 18. git.stage v1

Purpose: stage selected paths from an exact observed status.

Required effect: `git.write`.

Input includes selected paths and `expectedStatusDigest`. Result includes before and after index-tree object IDs and post-stage status digest.

Stage never commits, removes unrelated index entries, or expands path scope.

Retry: `reconcile_before_retry`.

## 19. git.commit v1

Purpose: create one commit from the exact current index tree and exact current HEAD.

Target role: `repository`.

Required effect: `git.write`.

The Operation does not stage, push, create a branch, change Git configuration, bypass hooks, or create an empty commit in v1.

Input:

```ts
type GitCommitInput = {
  expected: {
    head:
      | { kind: "unborn" }
      | { kind: "commit"; objectId: GitObjectId };
    indexTreeObjectId: GitObjectId;
  };
  message: string;
  author:
    | {
        kind: "identity_profile";
        profileId: string;
        expectedProfileDigest: Sha256;
      }
    | { kind: "explicit"; name: string; email: string };
  committer:
    | { kind: "same_as_author" }
    | {
        kind: "identity_profile";
        profileId: string;
        expectedProfileDigest: Sha256;
      };
};
```

Identity profiles are Agent-local. A GitHub noreply address can be stored in a profile without changing global Git configuration.

Result:

```ts
type GitCommitResult = {
  previousHead:
    | { kind: "unborn" }
    | { kind: "commit"; objectId: GitObjectId };
  commit: {
    objectId: GitObjectId;
    treeObjectId: GitObjectId;
    parentObjectIds: GitObjectId[];
    author: GitPublicIdentity;
    committer: GitPublicIdentity;
    messageSha256: Sha256;
  };
  postState: {
    headObjectId: GitObjectId;
    indexTreeObjectId: GitObjectId;
    statusDigest: Sha256;
  };
  observedAt: Timestamp;
};
```

Failures:

```text
HEAD_PRECONDITION_MISMATCH
INDEX_TREE_PRECONDITION_MISMATCH
EMPTY_INDEX
IDENTITY_PROFILE_NOT_FOUND
IDENTITY_PROFILE_CHANGED
INVALID_IDENTITY
COMMIT_HOOK_REJECTED
GIT_COMMIT_FAILED
COMMIT_EFFECT_UNVERIFIED
```

Retry: `reconcile_before_retry`.

Reconciliation compares current HEAD, parent, tree, message digest, author, and committer. A possible existing commit is recovered; a second commit is never created speculatively.

## 20. git.push v1

Purpose: fast-forward one exact local object ID to one expected remote branch state.

Required effects:

```text
remote.write
git.read
```

Input includes:

- remote profile ID and digest;
- local branch and exact local object ID;
- remote branch;
- expected remote object ID or known absence;
- fast-forward-only policy;
- upstream-setting policy.

Force push and deletion are not supported in v1.

A transport error after transmission is reconciled by reading the remote ref before another push.

Retry: `reconcile_before_retry`.

## 21. validation.describe v1

Purpose: list available ValidationProfiles and their typed metadata without execution.

Result includes profile ID, digest, required effects, supported selection, expected tools, risk class, and availability reason. It does not include hidden environment values or executable secrets.

Retry: `idempotent`.

## 22. ValidationProfile

A ValidationProfile is a versioned Agent-local contract:

```ts
type ValidationProfile = {
  schemaVersion: 1;
  profileId: string;
  displayName: string;
  executable: ExecutableResolver;
  argumentTemplate: ArgumentTemplate;
  workingDirectory: WorkingDirectoryPolicy;
  environmentProfileId: string;
  requiredEffects: TargetEffect[];
  supportedSelection: "full" | "paths";
  parser: ValidationParserRef;
  outputPolicy: OutputPolicy;
  availabilityChecks: AvailabilityCheck[];
  profileDigest: Sha256;
};
```

A profile cannot accept arbitrary executable, argument, environment, or working-directory overrides. Typed parameters are validated against its own parameter schema.

## 23. validation.run v1

Purpose: execute an exact ValidationProfile against an exact source digest and return a domain verdict.

Required effects begin with `validation.execute` and can include profile-declared effects.

Input:

```ts
type ValidationRunInput = {
  profile: {
    profileId: string;
    expectedProfileDigest: Sha256;
  };
  source: { expectedSourceDigest: Sha256 };
  selection:
    | { kind: "full" }
    | { kind: "paths"; paths: RelativePath[] };
  bounds: {
    timeoutMs: number;
    stdoutBytes: number;
    stderrBytes: number;
    artifactBytes: number;
  };
};
```

Result:

```ts
type ValidationRunResult = {
  profile: { profileId: string; profileDigest: Sha256 };
  sourceDigest: Sha256;
  verdict:
    | { kind: "passed" }
    | { kind: "failed"; failedChecks: number }
    | {
        kind: "indeterminate";
        reasons: (
          | "skipped"
          | "unsupported"
          | "contaminated"
          | "timed_out"
          | "cancelled"
          | "incomplete_output"
        )[];
      };
  checks: {
    passed: number;
    failed: number;
    skipped: number;
    unsupported: number;
  };
  process: ProcessTermination;
  stdout: CapturedStream;
  stderr: CapturedStream;
  artifacts: ArtifactRef[];
  startedAt: Timestamp;
  finishedAt: Timestamp;
};
```

A completed validation process with failed tests yields:

```text
Task outcome = succeeded
validation verdict = failed
```

Process spawn failure or invalid result parsing is a Task failure. Unknown termination is unverified.

Retry: reconcile before a new execution; if the previous process may have started, Task enters retry decision according to profile policy.

## 24. ProcessProfile

`process.run` v1 does not accept arbitrary executable, `argv`, shell script, or environment objects.

A ProcessProfile is a versioned Agent-local contract:

```ts
type ProcessProfile = {
  schemaVersion: 1;
  profileId: string;
  displayName: string;
  executable: ExecutableResolver;
  parameterSchemaDigest: Sha256;
  argumentTemplate: ArgumentTemplate;
  workingDirectory: WorkingDirectoryPolicy;
  environmentProfileId: string;
  requiredEffects: TargetEffect[];
  riskClass: "observe" | "build" | "mutate" | "external";
  outputPolicy: OutputPolicy;
  mutationEvidencePolicy: MutationEvidencePolicy;
  retryPolicy: "reconcile_before_retry" | "explicit_retry_only";
  availabilityChecks: AvailabilityCheck[];
  profileDigest: Sha256;
};
```

Profiles are registered through local management, not created by an MCP Task.

## 25. process.run v1

Purpose: execute one exact registered ProcessProfile with schema-validated parameters.

Required effects are the union of `process.execute` and profile-required effects.

Input:

```ts
type ProcessRunInput = {
  profile: {
    profileId: string;
    expectedProfileDigest: Sha256;
  };
  parameters: JsonValue;
  sourceExpectation:
    | { kind: "none" }
    | { kind: "exact_source"; sourceDigest: Sha256 };
  bounds: {
    timeoutMs: number;
    stdoutBytes: number;
    stderrBytes: number;
    artifactBytes: number;
  };
};
```

Result:

```ts
type ProcessRunResult = {
  profile: { profileId: string; profileDigest: Sha256 };
  execution: ProcessTermination;
  sourceBefore?: TargetObservation;
  sourceAfter?: TargetObservation;
  stdout: CapturedStream;
  stderr: CapturedStream;
  artifacts: ArtifactRef[];
  startedAt: Timestamp;
  finishedAt: Timestamp;
};
```

A nonzero exit code is a valid process result, not a Task execution failure. Spawn failure, output capture failure, invalid result schema, or unverified mutation is a Task failure or unverified result as appropriate.

Approval:

```text
observe    Case grant normally sufficient
build      policy-derived
mutate     explicit per Task
external   explicit per Task
```

Retry: profile policy, never automatic after execution may have begun.

## 26. Agent observation Operations

### 26.1 agent.status

Reads AgentDO state only: enrollment, online/offline, epoch, lease, queue depth, selected protocol, and latest capability observation timestamp. It does not contact the Agent.

### 26.2 agent.probe

Dispatches a live read-only probe to the Agent and returns current host kind, Agent version, protocol support, tool availability, service state, and capability digest.

Cached status and live probe are separate Operations so callers know the freshness source.

## 27. Workspace and Project observation

### 27.1 workspace.list and project.list

Return bounded locator data. They do not prove live filesystem presence unless explicitly marked as a recent Agent observation.

### 27.2 workspace.inspect

Returns current Agent-local root identity digest, policy digest, revision, capability intersection, and live availability. Absolute root path is omitted from cloud results by default.

### 27.3 project.inspect

Returns Project registration, root identity digest, optional normalized remote, default branch, Git identity, current HEAD, status summary, and profile availability selected by explicit include fields.

## 28. Operation failure categories

Operation-specific durable failures use typed categories:

```text
precondition
policy
capability
filesystem
git
remote
validation
process
cancellation
result_validation
uncertainty
```

Every failure reports:

- stable failure code;
- retryability classification;
- affected target;
- expected and observed precondition when safe;
- whether an external effect may have started;
- required reconciliation action.

## 29. Operation contract tests

Every Operation must have:

- canonical valid input and result fixtures;
- rejection fixtures for every unknown field;
- path traversal and symlink cases where applicable;
- exact precondition success and mismatch cases;
- output-bound and truncation cases;
- cancellation before start, during execution, and after effect cases;
- duplicate dispatch and duplicate result cases;
- reconciliation cases;
- stale Agent epoch and fencing cases;
- TypeScript and Go decode and digest equality;
- evidence proving no unrelated target changed.
