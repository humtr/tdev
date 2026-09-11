/** Internal v1 ports. Normative semantics are in D0001-D0006, not this projection.
 * Implementations must not add hidden effects. Unknown observations are tagged, not null-success.
 */
export type Id = string;
export type Revision = string;
export type Digest = string;
export type Oid = string;
export type Json = null | boolean | number | string | Json[] | { [key:string]: Json };
export type Capability = 'repository.read'|'work.write'|'profile.run'|'integration.write'|'policy.write'|'runtime.activate';
export interface Principal { subject:Id; issuer:string; audience:string; expiresAt:number; tokenCapabilities?:readonly Capability[] }
export interface Binding { repositoryId:Id; installationId:Id; provider:string; providerRepositoryId:string;
  remote:string; ref:string; bindingEpoch:Revision; policyDigest:Digest }
export interface RefObservation { head:Oid; observedAt:string; bindingEpoch:Revision }
export interface SourceEntry { path:string; mode:string; blobOid:Oid; contentDigest:Digest; size:number }
export interface SourceTree { treeOid:Oid; manifestDigest:Digest; entries:readonly SourceEntry[] }
export interface Snapshot { snapshotId:Id; binding:Binding; commitOid:Oid; source:SourceTree;
  policyDigest:Digest; observedAt:string; expiresAt:string; freshness:'current'|'pinned'; notCurrent:boolean }
export type ExpectedEntry = 'absent' | {blobDigest:Digest; mode:string};
export type Edit = {kind:'put';path:string;expectedEntry:ExpectedEntry;mode:string;content:string;encoding:'utf8'|'base64'} |
  {kind:'delete';path:string;expectedEntry:ExpectedEntry} |
  {kind:'move';from:string;to:string;expectedEntry:ExpectedEntry;expectedDestination:'absent'} |
  {kind:'exact_edit';path:string;expectedEntry:ExpectedEntry;oldText:string;newText:string};
export interface Work { workId:Id; repositoryId:Id; bindingEpoch:Revision; principal:Id; baseCommitOid:Oid;
  baseTreeOid:Oid; candidate:Pick<SourceTree,'treeOid'|'manifestDigest'>; generation:Revision; revision:Revision;
  disposition:'open'|'integrated'|'cancelled'; currentActionId:Id|null }
export type ActionStatus = 'queued'|'running'|'blocked'|'succeeded'|'failed'|'cancelled';
export interface Action { actionId:Id; requestId:Id; principal:Id; bindingEpoch:Revision; intentDigest:Digest;
  operation:string; workId:Id|null; status:ActionStatus; step:string; attempt:Revision; ownerEpoch:Revision;
  deadline:number; resultId:Id|null; errorCode:string|null }
export interface Attempt { installationId:Id; repositoryId:Id; workId:Id; actionId:Id;
  attemptId:Id; attempt:Revision; ownerEpoch:Revision }
export interface ExecutionIdentity { orderedProfileDigests:readonly Digest[]; trustedRunnerDigest:Digest;
  toolchainDigest:Digest; environmentClass:string; dependencyLockDigest:Digest }
export interface PreparedResult { resultId:Id; repositoryId:Id; bindingEpoch:Revision; workId:Id; generation:Revision;
  baseCommitOid:Oid; baseTreeOid:Oid; candidateTreeOid:Oid; expectedHead:Oid; commitOid:Oid;
  resultTreeOid:Oid; resultTreeSha256:Digest; policyDigest:Digest;
  metadata:{author:string;committer:string;timestamp:number;message:string}; execution:ExecutionIdentity }
export interface ProfileOutcome { profileDigest:Digest; status:'passed'|'failed'|'not_run'|'cancelled'; exitCode:number|null }
export interface ValidationReceipt { validationId:Digest; resultId:Id; runId:Id; attempt:Attempt; observerEpoch:Revision;
  startedAt:number; endedAt:number; exitCode:number|null; signal:string|null; deadlineExceeded:boolean;
  outcomes:readonly ProfileOutcome[]; inputDigest:Digest; outputDigest:Digest; signature:Digest }
export interface Effect { effectId:Id; workId:Id; actionId:Id; repositoryId:Id; bindingEpoch:Revision;
  ref:string; expectedHead:Oid; commitOid:Oid; preparedResultId:Id; validationId:Digest; policyDigest:Digest }
export type EffectObservation = {kind:'integrated';observedHead:Oid;observedAt:string} |
  {kind:'retryable'} | {kind:'stale';observedHead:Oid} | {kind:'uncertain'} | {kind:'binding_fenced'};
export interface Profile { profileId:Id; digest:Digest; argv:readonly string[]; cwd:string; parameters:Json;
  timeoutMs:number; killGraceMs:number; memoryBytes:number; pids:number; cpuMillis:number;
  diskBytes:number; logBytes:number; network:'none'|'fixture'; imageDigest:Digest; replaySafe:boolean }
export interface SandboxObservation { state:'absent'|'reserved'|'running'|'exited'|'uncertain';
  attempt:Attempt; exitCode:number|null; signal:string|null; artifacts:readonly Digest[] }
export interface ReleaseObservation { activationId:Id; phase:'prepared'|'draining'|'switching'|'checking'|'active'|'rolled_back'|'blocked';
  expectedRelease:Digest; candidateRelease:Digest; observedRelease:Digest|null; writerStopped:boolean; deadline:number }
export interface AuthorizationPort { authorize(principal:Principal,binding:Binding,capability:Capability,paths?:readonly string[]):Promise<void> }
export interface RepositoryPort { resolve(binding:Binding):Promise<RefObservation>;
  readCommit(binding:Binding,commit:Oid):Promise<{commitOid:Oid;parents:readonly Oid[];source:SourceTree}>;
  readBlob(binding:Binding,blob:Oid):Promise<Uint8Array>;
  isAncestor(binding:Binding,ancestor:Oid,descendant:Oid):Promise<boolean> }
/** put resolves only after verified, fsynced, atomic publication. get verifies digest. */
export interface ObjectStorePort { put(bytes:Uint8Array):Promise<Digest>; get(digest:Digest):Promise<Uint8Array> }
export interface LedgerTransaction {
  getWork(workId:Id):Work|null; getAction(actionId:Id):Action|null;
  lookupRequest(principal:Id,epoch:Revision,requestId:Id):Action|null;
  insertWork(work:Work):void; insertAction(action:Action):void;
  compareWork(expectedRevision:Revision,replacement:Work):boolean;
  updateAction(action:Action):void; reserveAttempt(attempt:Attempt,capacity:number):boolean;
  releaseAttempt(attemptId:Id):void; putPrepared(result:PreparedResult):void;
  getPrepared(resultId:Id):PreparedResult|null; putReceipt(receipt:ValidationReceipt):void;
  putEffect(effect:Effect):void;
}
/** Callback must be synchronous and have no filesystem/network/sandbox side effects. */
export interface LedgerPort { transact<T>(fn:(tx:LedgerTransaction)=>T):T; close():void }
export interface SandboxPort { launch(attempt:Attempt,profile:Profile,source:SourceTree):Promise<SandboxObservation>;
  inspect(attempt:Attempt):Promise<SandboxObservation>; cancel(attempt:Attempt):Promise<SandboxObservation> }
export interface ValidationPort { validate(result:PreparedResult,attempt:Attempt):Promise<ValidationReceipt>;
  eligible(result:PreparedResult,receipt:ValidationReceipt,currentPolicy:Digest,ownerEpoch:Revision):Promise<boolean> }
/** Trusted identity freezes before validation, persisted once and reused across action IDs. */
export interface PreparationPort { prepare(work:Work,head:Oid,execution:ExecutionIdentity,policy:Digest):Promise<PreparedResult>;
  reuse(resultId:Id,work:Work,head:Oid,execution:ExecutionIdentity,policy:Digest):Promise<PreparedResult> }
/** No lock spanning network. CAS operates on only the single full bound ref. */
export interface RefPort { compareUpdate(binding:Binding,effect:Effect):Promise<{kind:'sent'|'rejected'|'uncertain'}>;
  reconcile(binding:Binding,effect:Effect,senderStopped:boolean):Promise<EffectObservation> }
export interface ReleasePort { observe(activationId:Id):Promise<ReleaseObservation>;
  activate(intent:ReleaseObservation):Promise<ReleaseObservation> }
export interface Clock { now():number }
