import type {Json} from '../contracts/ports.js';
/** Private release records. These are not additional public MCP operations. */
export interface VersionRange {min:number;max:number}
export interface ReleaseManifest {
 schemaVersion:1;repositoryId:string;bindingEpoch:string;sourceCommitOid:string;
 sourceTreeOid:string;sourceManifestDigest:string;policyDigest:string;schemaDigest:string;
 protocol:VersionRange;ledger:VersionRange;installationSealDigest:string;
 requiredValidationId:string;releaseValidationId:string;
 device:{artifactDigest:string;sourceCommitOid:string};
 edge:{artifactDigest:string;sourceCommitOid:string;compatibilityDate:string};
 executor:{workflowDigest:string;controllerDigest:string;sealDigest:string};
}
export interface RuntimePair {
 releaseId:string;schemaDigest:string;sourceCommitOid:string;
 deviceReleaseId:string;deviceArtifactDigest:string;deviceSourceCommitOid:string;
 edgeVersionId:string;edgeArtifactDigest:string;edgeSourceCommitOid:string;
 protocol:VersionRange;ledger:VersionRange;
}
export interface ActivationIntent {
 activationId:string;actionId:string;installationId:string;repositoryId:string;
 bindingEpoch:string;principalId:string;createdAt:number;deadline:number;
 previous:RuntimePair;target:RuntimePair;
}
export type ActivationStep='edge.activate'|'device.drain'|'device.stop'|'device.switch'|'device.start'|'pair.check';
export interface ActivationEffect {
 effectId:string;activationId:string;direction:'forward'|'rollback';step:ActivationStep;
 inputDigest:string;expected:RuntimePair;target:RuntimePair;
}
export interface ActivationReceipt {
 effectId:string;inputDigest:string;kind:'applied'|'not_applied'|'pending'|'failed'|'conflict';
 senderStopped:boolean;observedAt:number;output:{[key:string]:Json};
}
export interface PendingActivationEffect {effect:ActivationEffect;state:'planned'|'sent';sends:number}
export interface ActivationRecord {
 intent:ActivationIntent;intentDigest:string;revision:string;direction:'forward'|'rollback';
 cursor:number;phase:'prepared'|'draining'|'switching'|'checking'|'active'|'rolled_back'|'blocked';
 pending:PendingActivationEffect|null;receipts:ActivationReceipt[];reason:string|null;
 observedPair:RuntimePair|null;
}
export interface ActivationPort {
 /** An absent observation alone is NOT proof a prior sender has stopped. */
 reconcile(effect:ActivationEffect):Promise<ActivationReceipt>;
 /** Called only after the exact effect is journalled as sent. */
 execute(effect:ActivationEffect):Promise<ActivationReceipt>;
}
