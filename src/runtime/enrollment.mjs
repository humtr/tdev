import {canonicalJson,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {digest,oid,revision} from '../contracts/identity.mjs';
import {boundedProviderJson} from '../execution/provider-json.mjs';
/** @typedef {Awaited<ReturnType<typeof import('../execution/controller-identity.mjs').managedDefinition>>} Definition */
/** @typedef {{schemaVersion:1,kind:'dev2-managed-enrollment',installationId:string,repositoryId:string,bindingEpoch:string,repositoryOwnerId:string,repositoryFullName:string,approvedCommitOid:string,approvedSourceManifestDigest:string,identities:Definition['identities'],qualification:{providerRunJson:string,controllerReportJson:string,containmentReportJson:string},nativeJoin:{sourceCommitOid:string,sourceTreeOid:string,inputDigest:string,coreStatus:'passed',integrationStatus:'passed',productionValidation:false},canonicalRuleset:import('../integration/github-boundary.mjs').RulesetIdentity}} EnrollmentBody */
/** @typedef {EnrollmentBody&{sealDigest:string}} Enrollment */
/** Private commissioning authorizes a previously tested finite controller. It is
 * neither a native execution result nor a validation receipt. Only the private
 * installer may supply this record; no public operation or repository file can
 * make itself production-eligible. Reports retain their original evidence class.
 * @param {EnrollmentBody} body */
export function enrollmentRecord(body){canonicalJson(body);return {...body,sealDigest:recordDigest('dev2.managed-enrollment.v1',body)};}
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE','Malformed enrollment evidence');return /** @type {Record<string,unknown>} */(value);}
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(canonicalJson(Object.keys(object(value)).sort())===canonicalJson([...keys].sort()),'INTEGRITY_FAILURE','Unexpected enrollment field');}
/** @param {unknown} text */
function report(text){requireThat(typeof text==='string'&&Buffer.byteLength(text)<=1048576,'LIMIT_EXCEEDED','Private evidence report bound');return object(boundedProviderJson(text,1048576));}
/** @param {Enrollment} enrollment @param {{binding:import('../contracts/ports.js').Binding,definition:Definition,source:import('../contracts/ports.js').SourceTree,runtime:{sourceCommitOid:string,sourceTreeOid:string},origin:string}} expected */
export function verifyEnrollment(enrollment,expected){
 try{
  closed(enrollment,['schemaVersion','kind','installationId','repositoryId','bindingEpoch','repositoryOwnerId','repositoryFullName','approvedCommitOid','approvedSourceManifestDigest','identities','qualification','nativeJoin','canonicalRuleset','sealDigest']);
  const {sealDigest,...body}=enrollment,b=expected.binding,definition=expected.definition;
  requireThat(digest(sealDigest)===recordDigest('dev2.managed-enrollment.v1',body)&&body.schemaVersion===1&&body.kind==='dev2-managed-enrollment'&&body.installationId===b.installationId&&body.repositoryId===b.repositoryId&&body.bindingEpoch===b.bindingEpoch,'INTEGRITY_FAILURE','Private enrollment identity mismatch');
  requireThat(revision(body.repositoryOwnerId)!=='0'&&b.remote==='https://github.com/'+body.repositoryFullName+'.git','FORBIDDEN');oid(body.approvedCommitOid);digest(body.approvedSourceManifestDigest);
  requireThat(body.approvedSourceManifestDigest===expected.source.manifestDigest&&canonicalJson(body.identities)===canonicalJson(definition.identities),'INTEGRITY_FAILURE','Private enrollment does not name the exact approved controller');
  closed(body.nativeJoin,['sourceCommitOid','sourceTreeOid','inputDigest','coreStatus','integrationStatus','productionValidation']);
  requireThat(body.nativeJoin.sourceCommitOid===expected.runtime.sourceCommitOid&&body.nativeJoin.sourceTreeOid===expected.runtime.sourceTreeOid&&body.nativeJoin.coreStatus==='passed'&&body.nativeJoin.integrationStatus==='passed'&&body.nativeJoin.productionValidation===false,'INTEGRITY_FAILURE','Native join has no exact source-validation record');digest(body.nativeJoin.inputDigest);
  closed(body.canonicalRuleset,['rulesetId','createdAt','updatedAt']);requireThat(Number.isSafeInteger(body.canonicalRuleset.rulesetId)&&body.canonicalRuleset.rulesetId>0&&Number.isFinite(Date.parse(body.canonicalRuleset.createdAt))&&Number.isFinite(Date.parse(body.canonicalRuleset.updatedAt)),'INTEGRITY_FAILURE');
  closed(body.qualification,['providerRunJson','controllerReportJson','containmentReportJson']);
  const run=report(body.qualification.providerRunJson),controller=report(body.qualification.controllerReportJson),containment=report(body.qualification.containmentReportJson),repository=object(run.repository),owner=object(repository.owner),rawCommit=body.approvedCommitOid.slice(5);
  requireThat(String(repository.id)===b.providerRepositoryId&&repository.full_name===body.repositoryFullName&&String(owner.id)===body.repositoryOwnerId&&run.head_sha===rawCommit&&run.event==='push'&&run.path==='.github/workflows/dev2-containment-proof.yml'&&run.status==='completed'&&run.conclusion==='success'&&run.run_attempt===1&&typeof run.head_branch==='string'&&/^dev2-containment\/[A-Za-z0-9_-]{1,128}$/.test(run.head_branch),'INTEGRITY_FAILURE','Qualification is not the exact successful provider run');
  const runId=String(run.id);requireThat(revision(runId)!=='0','INTEGRITY_FAILURE');
  requireThat(controller.kind==='real-managed-controller-qualification'&&controller.schemaVersion===1&&controller.status==='passed'&&controller.sourceCommit===rawCommit&&controller.sourceTree===expected.source.treeOid&&controller.sourceManifest===expected.source.manifestDigest&&controller.runId===runId&&controller.runAttempt==='1'&&controller.productionValidation===false&&controller.productionSeal===false&&controller.nativeAssignmentVerified===false&&canonicalJson(controller.identities)===canonicalJson(definition.identities),'INTEGRITY_FAILURE','Required-controller qualification is missing or relabeled');
  const marker=recordDigest('dev2.qualification-only-assignment.v1',{sourceCommit:rawCommit,controller:definition.identities.trustedRunnerDigest,runId});requireThat(controller.qualificationIdentity===marker&&Array.isArray(controller.profiles)&&controller.profiles.length===2,'INTEGRITY_FAILURE');
  const profiles=definition.policy.required();for(let i=0;i<profiles.length;i++){
   const proof=object(controller.profiles[i]),result=object(proof.result),p=profiles[i];
   requireThat(proof.profileId===p.profileId&&proof.profileDigest===p.digest&&proof.factories===1&&proof.launches===1&&proof.deliveries===2&&proof.exactResponseLossReplay===true,'INTEGRITY_FAILURE','Actual required managed profile or exact replay is missing');
   requireThat(result.assignmentId===proof.assignmentId&&result.sealDigest===marker&&result.trustedRunnerDigest===definition.identities.trustedRunnerDigest&&result.exitCode===0&&result.signal===null&&result.deadlineExceeded===false&&result.stopped===true&&result.inputDigest===expected.source.manifestDigest&&result.outputDigest===expected.source.manifestDigest,'INTEGRITY_FAILURE','Managed qualification result differs from approved bytes');
  }
  digest(/** @type {string} */(controller.dependencyArtifactIdentity));
  requireThat(containment.kind==='real-hosted-containment-qualification'&&containment.schemaVersion===1&&containment.status==='passed'&&containment.productionSeal===false&&containment.sourceCommit===rawCommit&&containment.runId===runId&&containment.runAttempt==='1'&&containment.image===definition.config.image&&containment.seccompDigest===definition.identities.seccompDigest&&containment.containmentExit===0,'INTEGRITY_FAILURE','Actual exact containment evidence is missing');
  const oidc=object(containment.oidc),ref='refs/heads/'+run.head_branch;
  requireThat(oidc.signatureVerified===true&&oidc.nativeAssignmentVerified===false&&oidc.audience===expected.origin+'/executor'&&oidc.repositoryId===b.providerRepositoryId&&oidc.ownerId===body.repositoryOwnerId&&oidc.sha===rawCommit&&oidc.workflowSha===rawCommit&&oidc.ref===ref&&oidc.workflowRef===body.repositoryFullName+'/.github/workflows/dev2-containment-proof.yml@'+ref&&oidc.runId===runId&&oidc.runAttempt==='1','INTEGRITY_FAILURE','Containment OIDC identity differs');
  const checks=object(report(containment.containment).checks);
  for(const name of ['hostFiles','credentials','procCredentials','nonRoot','noNewPrivileges','noCapabilities','seccomp','sourceReadOnly','rootReadOnly','memoryLimit','pidLimit','cpuLimit','hostLoopback','egress','diskLimit','pidAdmission'])requireThat(checks[name]===true,'INTEGRITY_FAILURE','Containment predicate missing: '+name);
  const memory=object(containment.memory),before=object(memory.beforeEvents),after=object(memory.lastEvents),duplicate=object(containment.duplicateLaunch),deadline=object(containment.deadline),cancel=object(containment.cancellation);
  requireThat(Number.isSafeInteger(before.oom_kill)&&Number.isSafeInteger(after.oom_kill)&&Number(after.oom_kill)>Number(before.oom_kill)&&duplicate.sameContainer===true&&duplicate.materializations===1&&deadline.exitCode!==0&&Number.isSafeInteger(deadline.elapsedMs)&&Number(deadline.elapsedMs)<12000&&cancel.state==='exited'&&cancel.repeatedState==='exited','INTEGRITY_FAILURE','Kernel bounds, launch fencing or stop semantics were not proved');
  return {enrollment,definition,policy:definition.policy,sealDigest,qualificationRunId:runId,evidenceDigests:{provider:bytesDigest(Buffer.from(body.qualification.providerRunJson)),controller:bytesDigest(Buffer.from(body.qualification.controllerReportJson)),containment:bytesDigest(Buffer.from(body.qualification.containmentReportJson))}};
 }catch(error){if(error instanceof Dev2Error)throw error;throw new Dev2Error('INTEGRITY_FAILURE','Malformed private enrollment evidence');}
}
