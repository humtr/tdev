import {createRemoteJWKSet} from 'jose';
import {requireThat} from '../contracts/errors.mjs';
import {managedDefinition} from '../execution/controller-identity.mjs';
import {ManagedSessions} from '../execution/sessions.mjs';
import {ManagedPool} from '../execution/managed-pool.mjs';
import {GitHubSessions} from '../execution/github-sessions.mjs';
import {AssignmentTransfer} from '../execution/session-transfer.mjs';
import {ExecutorEndpoint} from '../execution/executor-endpoint.mjs';
import {githubExecutorVerifier} from '../execution/github-identity.mjs';
import {verifyProductionEnrollment} from './production-enrollment.mjs';
import {ManagedReleaseBuilder} from '../release/managed-builder.mjs';
/** Installed production capability joins existing native owners. The private
 * record alone is never authority: verification reads authenticated completions.
 * @param {{enrollment:import('./production-enrollment.mjs').ProductionEnrollment,qualificationSealDigest:string,runtime:import('./native.mjs').NativeConfig['runtime'],admission?:import('../release/native-control.mjs').Admission|null,installationSealDigest?:string,repository:import('../repository/git.mjs').GitRepository,binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,objects:import('../contracts/ports.js').ObjectStorePort,token:string,origin:string,capacity:number,wake:()=>void}} o */
export async function createProductionControl(o){
 const i=o.enrollment.intent,approved=await o.repository.readCommit(o.binding,i.approvedCommitOid),definition=await managedDefinition(o.repository,approved.source);
 requireThat(definition.config.origin===o.origin,'INTEGRITY_FAILURE','Production origin differs');
 const sessions=new ManagedSessions({ledger:o.ledger,config:{repositoryOwnerId:i.repositoryOwnerId,repositoryFullName:i.repositoryFullName,approvedCommit:i.approvedCommitOid.slice(5),trustedRunnerDigest:definition.identities.trustedRunnerDigest,sessionTimeoutMs:definition.config.sessionLifetimeMs,capacity:o.capacity,sealDigest:o.enrollment.sealDigest}});
 const enrolled=await verifyProductionEnrollment(o.enrollment,{binding:o.binding,definition,source:approved.source,runtime:o.runtime,qualificationSealDigest:o.qualificationSealDigest,sessions,objects:o.objects,admission:o.admission});
 const provider=new GitHubSessions({sessions,token:async()=>o.token}),pool=new ManagedPool({sessions,provider,repository:o.repository,objects:o.objects}),transfer=new AssignmentTransfer({sessions,objects:o.objects});pool.reconcileLocal();
 const verify=githubExecutorVerifier({origin:o.origin,installationId:o.binding.installationId},createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks')),id=>provider.authorization(id));
 const endpoint=new ExecutorEndpoint({sessions,transfer,verify,poll:i=>pool.poll(i),retire:i=>pool.retire(i),wake:o.wake});
 const builder=o.installationSealDigest?new ManagedReleaseBuilder({production:enrolled,pool,objects:o.objects,installationSealDigest:o.installationSealDigest}):null;
 return {enrolled,definition,sessions,provider,pool,transfer,endpoint,builder};
}
