import type {Attempt, Json} from '../contracts/ports.js';
import type {ExecutorIdentity} from './github-identity.mjs';
export interface ManagedConfig {
  repositoryOwnerId:string; repositoryFullName:string; approvedCommit:string;
  trustedRunnerDigest:string; sessionTimeoutMs:number; capacity?:number;
  sealDigest:string|null;
}
export interface ProviderRun {
  repositoryId:string; repositoryOwnerId:string; runId:string; runAttempt:string;
  headSha:string; headBranch:string; event:string; workflowPath:string;
  status:'queued'|'in_progress'|'completed'; observedAt:number;
}
export interface SessionIntent {
  sessionId:string; installationId:string; repositoryId:string; bindingEpoch:string;
  providerRepositoryId:string; repositoryOwnerId:string; repositoryFullName:string;
  ref:string; workflowRef:string; launchCommit:string; trustedRunnerDigest:string;
  createdAt:number; deadline:number;
}
export interface Session {
  intent:SessionIntent; intentDigest:string; revision:string; observerEpoch:string;
  launch:'reserved'|'sent'; state:'reserved'|'active'|'closing'|'closed';
  run:ProviderRun|null; cancelRequested:boolean; stoppedAt:number|null;
}
export interface AssignedInput {
  attempt:Attempt; resultId:string; profileDigest:string; sourceManifest:string;
  payloadDigest:string; executionDigest:string; deadline:number;
}
export interface ObjectDescriptor {digest:string; size:number}
export interface ExecutionResult {
  assignmentId:string; leaseId:string; inputIdentity:string; sealDigest:string;
  trustedRunnerDigest:string; startedAt:number; endedAt:number; stopped:true;
  exitCode:number|null; signal:string|null; deadlineExceeded:boolean;
  inputDigest:string; outputDigest:string; artifacts:string[];
}
export interface Assignment {
  assignmentId:string; sessionId:string; runId:string; leaseId:string;
  input:AssignedInput; inputIdentity:string; sealDigest:string;
  revision:string; state:'offered'|'running'|'complete'|'stopped';
  cancelRequested:boolean; result:ExecutionResult|null;
}
export type AuthenticatedExecutor = ExecutorIdentity;
export interface SessionAuthorization {identity:AuthenticatedExecutor; assignmentId:string; leaseId:string}
