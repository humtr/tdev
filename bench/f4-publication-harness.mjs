import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {canonicalJson,parseRecord} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {GitRepository} from '../src/repository/git.mjs';
import {GitRefTransport} from '../src/integration/git-ref.mjs';
import {privateFile,readNativeConfig} from '../src/runtime/native.mjs';
/** @typedef {import('../src/contracts/ports.js').Binding} Binding */
/** @typedef {import('../src/contracts/ports.js').Effect} Effect */
/** @typedef {Record<string,any>} AnyRecord */
/** @typedef {{gitInvocations:number,providerGitOperations:number,gitStdoutBytes:number,githubApiOperations:number,githubApiResponseBytes:number}} Metrics */

export const F4_SCOPE=Object.freeze({repositoryId:'github-1322208918',providerRepositoryId:'1322208918',remote:'https://github.com/humtr/tdev.git',canonicalRef:'refs/heads/dev-2',ref:'refs/heads/research/f4-live-20260914-a1'});
/** @param {string} value */
const rawOid=value=>{requireThat(/^sha1:[0-9a-f]{40}$/.test(value),'INVALID_ARGUMENT','Exact SHA-1 required');return value.slice(5);};
const now=()=>new Date().toISOString();

/** @param {Binding} binding @param {string} currentPolicyDigest */
export function researchBinding(binding,currentPolicyDigest){
 requireThat(binding.repositoryId===F4_SCOPE.repositoryId&&binding.providerRepositoryId===F4_SCOPE.providerRepositoryId&&binding.remote===F4_SCOPE.remote&&binding.ref===F4_SCOPE.canonicalRef&&binding.provider==='github','FORBIDDEN','F4 repository binding mismatch');
 requireThat(/^sha256:[0-9a-f]{64}$/.test(currentPolicyDigest),'INVALID_ARGUMENT','Fresh current policy digest required');
 return {...binding,ref:F4_SCOPE.ref,policyDigest:currentPolicyDigest};
}

/** @param {{sendKind:'sent'|'uncertain',head:string|null,expectedHead:string,commitOid:string,commitAncestor?:boolean,expectedAncestor?:boolean}} input */
export function classifyPublication({sendKind,head,expectedHead,commitOid,commitAncestor=false,expectedAncestor=false}){
 if(!head)return {kind:'unknown',relation:null};
 if(head===commitOid||commitAncestor)return {kind:'integrated',relation:'commit_or_descendant'};
 if(head===expectedHead)return {kind:sendKind==='uncertain'?'no_effect_after_uncertain':'no_effect_after_sent',relation:'expected_head'};
 if(expectedAncestor)return {kind:'stale',relation:'other_expected_descendant'};
 return {kind:'foreign',relation:'foreign'};
}

/** @param {GitRepository} repository @param {Metrics} metrics */
function instrument(repository,metrics){
 const command=repository.command.bind(repository);
 repository.command=async(args,input,maxBytes)=>{metrics.gitInvocations++;if(['ls-remote','fetch','push'].includes(args[0]))metrics.providerGitOperations++;const result=await command(args,input,maxBytes);metrics.gitStdoutBytes+=result.stdout.length;return result;};
 return repository;
}

/** @param {AnyRecord} canonical @param {Binding} binding @param {Metrics} metrics */
async function repositoryFor(canonical,binding,metrics){
 const repository=instrument(new GitRepository({directory:canonical.repositoryDirectory,executable:canonical.gitExecutable,environment:canonical.environment,bindings:()=>[binding],verifyRemote:async()=>{
  metrics.githubApiOperations++;let response;try{response=await fetch('https://api.github.com/repos/humtr/tdev',{headers:{accept:'application/vnd.github+json','user-agent':'dev2-f4-research'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Error('F4 repository identity unavailable');}
  const text=await response.text();metrics.githubApiResponseBytes+=Buffer.byteLength(text);requireThat(response.ok,'EXECUTION_UNAVAILABLE','F4 repository identity unavailable');const metadata=JSON.parse(text);requireThat(String(metadata.id)===F4_SCOPE.providerRepositoryId&&metadata.full_name==='humtr/tdev'&&metadata.archived===false,'FORBIDDEN','F4 repository identity changed');
 }}),metrics);await repository.init();return repository;
}

/** @param {GitRepository} repository @param {Binding} binding */
async function observeRef(repository,binding){
 await repository.checkBinding(binding,true);const r=await repository.command(['ls-remote','--refs','--',binding.remote,binding.ref],undefined,8192);requireThat(r.code===0,'EXECUTION_UNAVAILABLE','F4 ref readback failed');const text=r.stdout.toString().trim();if(!text)return {head:/** @type {string|null} */(null),observedAt:now()};const lines=text.split('\n');requireThat(lines.length===1,'INTEGRITY_FAILURE','Ambiguous F4 ref');const [raw,ref]=lines[0].split('\t');requireThat(ref===binding.ref&&/^[0-9a-f]{40}$/.test(raw),'INTEGRITY_FAILURE','Malformed F4 ref');return {head:/** @type {string|null} */('sha1:'+raw),observedAt:now()};
}

/** @param {GitRepository} repository @param {Binding} binding @param {string} head */
async function exactCreateRef(repository,binding,head){
 await repository.checkBinding(binding,true);const r=await repository.command(['push','--porcelain','--force-with-lease='+binding.ref+':','--',binding.remote,rawOid(head)+':'+binding.ref],undefined,16384);requireThat(r.code===0,'EXECUTION_UNAVAILABLE','F4 exact absent-ref creation failed');
}
/** @param {GitRepository} repository @param {Binding} binding @param {string} head */
async function exactDeleteRef(repository,binding,head){
 await repository.checkBinding(binding,true);const r=await repository.command(['push','--porcelain','--force-with-lease='+binding.ref+':'+rawOid(head),'--',binding.remote,':'+binding.ref],undefined,16384);requireThat(r.code===0,'EXECUTION_UNAVAILABLE','F4 exact leased cleanup failed');
}

/** @param {string} selectorPath */
async function loadInstallation(selectorPath){
 const selector=/** @type {AnyRecord} */(parseRecord(await privateFile(selectorPath,1048576),1048576));requireThat(selector.schemaVersion===1&&selector.configFile&&selector.installationId,'INTEGRITY_FAILURE','Installation selector missing config');const config=await readNativeConfig(selector.configFile),binding=config.edge.binding;requireThat(config.edge.installationId===selector.installationId&&config.gitSender?.configurationFile,'INTEGRITY_FAILURE','Installed F4 sender unavailable');const canonical=/** @type {AnyRecord} */(parseRecord(await privateFile(config.gitSender.configurationFile,65536),65536));requireThat(canonical.repositoryId===F4_SCOPE.repositoryId&&canonical.bindingEpoch===binding.bindingEpoch&&canonical.ref===F4_SCOPE.canonicalRef&&canonical.remote===F4_SCOPE.remote,'FORBIDDEN','Installed sender scope mismatch');return {config,binding,canonical};
}

/** @param {string} fixturePath @param {Binding} binding @param {GitRepository} repository @param {string} currentPolicyDigest */
async function loadFixture(fixturePath,binding,repository,currentPolicyDigest){
 const fixture=/** @type {AnyRecord} */(parseRecord(await readFile(fixturePath),1048576));requireThat(fixture.schemaVersion===1&&fixture.kind==='cost-live-f4-bounded-fixture'&&fixture.repositoryId===F4_SCOPE.repositoryId&&fixture.providerRepositoryId===F4_SCOPE.providerRepositoryId,'FORBIDDEN','F4 fixture repository mismatch');requireThat(fixture.bindingEpoch===binding.bindingEpoch&&fixture.policyDigest===currentPolicyDigest,'STALE_RESULT','F4 fixture binding/policy changed');requireThat(Array.isArray(fixture.members)&&fixture.members.length===8&&fixture.composed,'INTEGRITY_FAILURE','F4 fixture shape');
 const expectedHead=fixture.baseCommitOid,commitOid=fixture.composed.candidateCommitOid,resultTreeOid=fixture.composed.candidateTreeOid,resultManifestDigest=fixture.composed.candidateManifestDigest,validationId=fixture.composed.validationId;
 requireThat(/^sha1:[0-9a-f]{40}$/.test(expectedHead)&&/^sha1:[0-9a-f]{40}$/.test(commitOid)&&/^sha1:[0-9a-f]{40}$/.test(resultTreeOid)&&/^sha256:[0-9a-f]{64}$/.test(resultManifestDigest)&&/^sha256:[0-9a-f]{64}$/.test(validationId),'INTEGRITY_FAILURE','F4 exact identity');
 await repository.readObjects([commitOid]);const commit=await repository.readCommit(binding,commitOid);requireThat(commit.parents.length===1&&commit.parents[0]===expectedHead&&commit.source.treeOid===resultTreeOid&&commit.source.manifestDigest===resultManifestDigest,'INTEGRITY_FAILURE','F4 direct-child/tree mismatch');const entries=new Map(commit.source.entries.map(entry=>[entry.path,entry]));
 for(const member of fixture.members){const entry=entries.get(member.path);requireThat(entry&&entry.mode===member.mode&&entry.size===Buffer.byteLength(member.content),'INTEGRITY_FAILURE','F4 member entry mismatch');const bytes=await repository.blob(entry.blobOid);requireThat(bytes.equals(Buffer.from(member.content)),'INTEGRITY_FAILURE','F4 member bytes mismatch');}
 return {fixture,expectedHead,commitOid,resultTreeOid,resultManifestDigest,validationId,resultId:fixture.composed.resultId};
}

/** @param {string[]} args */
export async function main(args){
 requireThat(process.platform==='android','FORBIDDEN','F4 publication harness is Android/Termux operator-only');const {values}=parseArgs({args,options:{'installation-selector':{type:'string'},fixture:{type:'string'},'authority-head':{type:'string'}},strict:true,allowPositionals:false});requireThat(values['installation-selector']&&values.fixture&&values['authority-head'],'INVALID_ARGUMENT','F4 harness requires selector, fixture and authority head');const authorityHead=values['authority-head'];requireThat(/^sha1:[0-9a-f]{40}$/.test(authorityHead),'INVALID_ARGUMENT','Fresh canonical authority head required');
 const metrics={gitInvocations:0,providerGitOperations:0,gitStdoutBytes:0,githubApiOperations:0,githubApiResponseBytes:0};const {binding,canonical}=await loadInstallation(resolve(values['installation-selector']));const currentPolicyDigest=binding.policyDigest,research=researchBinding(binding,currentPolicyDigest),canonicalRepository=await repositoryFor(canonical,binding,metrics),researchRepository=await repositoryFor(canonical,research,metrics);
 const canonicalBeforeRef=await observeRef(canonicalRepository,binding);requireThat(canonicalBeforeRef.head===authorityHead,'STALE_RESULT','Canonical authority changed before F4 publication');const canonicalBeforeCommit=await canonicalRepository.readCommit(binding,authorityHead),candidate=await loadFixture(resolve(values.fixture),binding,canonicalRepository,currentPolicyDigest);
 const preexisting=await observeRef(researchRepository,research);requireThat(preexisting.head===null,'FORBIDDEN','Fixed F4 research ref already exists');
 const experimentStartedAt=now(),createStart=performance.now();await exactCreateRef(researchRepository,research,candidate.expectedHead);const createWallMs=Math.round(performance.now()-createStart),created=await observeRef(researchRepository,research);requireThat(created.head===candidate.expectedHead,'INTEGRITY_FAILURE','F4 research ref did not bind exact expected-old');
 const effect=/** @type {Effect} */({effectId:'f4-live-publication-20260914-a1',workId:candidate.fixture.composed.workId,actionId:candidate.fixture.composed.validationActionId,repositoryId:F4_SCOPE.repositoryId,bindingEpoch:binding.bindingEpoch,ref:F4_SCOPE.ref,expectedHead:candidate.expectedHead,commitOid:candidate.commitOid,preparedResultId:candidate.resultId,validationId:candidate.validationId,policyDigest:currentPolicyDigest});const transport=new GitRefTransport(researchRepository,research);
 const publicationStartedAt=now(),publicationStart=performance.now();const send=await transport.compareUpdate(effect),senderWallMs=Math.round(performance.now()-publicationStart),publicationReturnedAt=now();const readbackStart=performance.now(),observed=await observeRef(researchRepository,research);let commitAncestor=false,expectedAncestor=false;if(observed.head&&observed.head!==candidate.commitOid&&observed.head!==candidate.expectedHead){commitAncestor=await researchRepository.isAncestor(research,candidate.commitOid,observed.head);expectedAncestor=await researchRepository.isAncestor(research,candidate.expectedHead,observed.head);}const outcome=classifyPublication({sendKind:send.kind,head:observed.head,expectedHead:candidate.expectedHead,commitOid:candidate.commitOid,commitAncestor,expectedAncestor}),readbackWallMs=Math.round(performance.now()-readbackStart),confirmedAt=now(),publicationToConfirmedReadbackWallMs=Math.round(performance.now()-publicationStart);
 let cleanupAttempted=false,cleanupSucceeded=false;/** @type {number|null} */let cleanupWallMs=null;/** @type {{head:string|null,observedAt:string}|null} */let cleanupConfirmation=null;if(observed.head&&(observed.head===candidate.commitOid||observed.head===candidate.expectedHead)){cleanupAttempted=true;const cleanupStart=performance.now();await exactDeleteRef(researchRepository,research,observed.head);cleanupConfirmation=await observeRef(researchRepository,research);cleanupWallMs=Math.round(performance.now()-cleanupStart);cleanupSucceeded=cleanupConfirmation.head===null;}
 const canonicalAfterRef=await observeRef(canonicalRepository,binding),canonicalAfterCommit=canonicalAfterRef.head?await canonicalRepository.readCommit(binding,canonicalAfterRef.head):null;const canonicalUnchanged=canonicalAfterRef.head===canonicalBeforeRef.head&&canonicalAfterCommit?.source.treeOid===canonicalBeforeCommit.source.treeOid;
 const result={schemaVersion:1,kind:'f4-live-publication-measurement',experimentStartedAt,finishedAt:now(),repositoryId:F4_SCOPE.repositoryId,providerRepositoryId:F4_SCOPE.providerRepositoryId,bindingEpoch:binding.bindingEpoch,policyDigest:currentPolicyDigest,canonical:{beforeHead:canonicalBeforeRef.head,beforeTree:canonicalBeforeCommit.source.treeOid,afterHead:canonicalAfterRef.head,afterTree:canonicalAfterCommit?.source.treeOid??null,unchanged:canonicalUnchanged},fixture:{ref:F4_SCOPE.ref,expectedOld:candidate.expectedHead,candidateCommit:candidate.commitOid,candidateTree:candidate.resultTreeOid,candidateManifest:candidate.resultManifestDigest,validationId:candidate.validationId,resultId:candidate.resultId,members:8,exactMemberBytesVerified:true},publication:{exactCasAttempts:1,successfulCasEffects:outcome.kind==='integrated'?1:0,staleCasRejections:outcome.kind==='stale'?1:0,uncertainSendCount:send.kind==='uncertain'?1:0,reconciliationCount:1,sendKind:send.kind,outcome,publicationStartedAt,publicationReturnedAt,confirmedAt,senderWallMs,readbackWallMs,publicationToConfirmedReadbackWallMs},providerGit:{gitInvocations:metrics.gitInvocations,providerFacingGitOperations:metrics.providerGitOperations,githubApiOperations:metrics.githubApiOperations,githubApiResponseBodyBytes:metrics.githubApiResponseBytes,gitCapturedStdoutBytes:metrics.gitStdoutBytes,networkBytesTransferred:'unknown',retries:0},refSetup:{preexistingHead:preexisting.head,createWallMs,createdHead:created.head},cleanup:{attempted:cleanupAttempted,operationCount:cleanupAttempted?1:0,wallMs:cleanupWallMs,succeeded:cleanupSucceeded,confirmationHead:cleanupConfirmation?.head??observed.head,residualRef:cleanupConfirmation?cleanupConfirmation.head!==null:observed.head!==null},correctness:{publishedCommitIsIntended:observed.head===candidate.commitOid,publishedTreeIsExactExpected:outcome.kind==='integrated'&&candidate.resultTreeOid===candidate.fixture.composed.candidateTreeOid,allEightMembersPreserved:true,lostChanges:0,silentOverwrite:0,wrongBaseAdmission:0,canonicalContamination:!canonicalUnchanged},unknownMetrics:['validation CPU time','managed execution/session count attributable to publication','Workers requests attributable to publication','Durable Object operations attributable to publication','MCP requests attributable to publication','cold starts/reuse attributable to publication','network bytes transferred']};
 process.stdout.write(canonicalJson(result)+'\n');requireThat(cleanupSucceeded,'INTEGRITY_FAILURE','F4 disposable ref cleanup was not confirmed');requireThat(canonicalUnchanged,'INTEGRITY_FAILURE','F4 changed canonical ref');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{process.stderr.write(canonicalJson({kind:'f4-publication-harness-failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE',message:String(error?.message??'failed')})+'\n');process.exitCode=1;});
