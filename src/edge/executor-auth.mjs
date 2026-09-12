import {jwtVerify,createRemoteJWKSet} from 'jose';
import {requireThat} from '../contracts/errors.mjs';
import {executorBearer,executorRequest} from '../execution/protocol.mjs';
/** Edge verifies signed provider role and bound repository before consuming a
 * device correlation. Native separately checks the durable approved launch,
 * selected run, owner ID, lease and exact assignment; edge has none of that truth.
 * @param {import('./types.js').EdgeConfig} config
 * @param {ReturnType<typeof createRemoteJWKSet>} [keys]
 * @param {()=>number} [now]
 */
export function executorAuthentication(config,keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks')),now=Date.now){
 /** @param {Request} request @param {unknown} value */
 return async(request,value)=>{
  const input=executorRequest(value),assertion=executorBearer(request),ref='refs/heads/dev2-exec/'+input.sessionId;
  const remote=new URL(config.binding.remote);requireThat(remote.protocol==='https:'&&remote.hostname==='github.com'&&!remote.username&&!remote.password,'INTEGRITY_FAILURE');
  const repository=remote.pathname.slice(1).replace(/\.git$/,'');
  const {payload}=await jwtVerify(assertion,keys,{issuer:'https://token.actions.githubusercontent.com',audience:config.origin+'/executor',algorithms:['RS256'],requiredClaims:['exp','iat','sub','repository_id','repository_owner_id','ref','sha','workflow_ref','workflow_sha','run_id','run_attempt','runner_environment','event_name'],currentDate:new Date(now()),clockTolerance:0});
  requireThat(payload.repository_id===config.binding.providerRepositoryId&&payload.ref===ref&&payload.workflow_ref===repository+'/.github/workflows/dev2-executor.yml@'+ref&&typeof payload.sha==='string'&&/^[a-f0-9]{40}$/.test(payload.sha)&&payload.workflow_sha===payload.sha&&payload.run_attempt==='1'&&typeof payload.run_id==='string'&&/^[1-9][0-9]{0,19}$/.test(payload.run_id)&&payload.event_name==='push'&&payload.runner_environment==='github-hosted','UNAUTHORIZED');
  requireThat(typeof payload.iat==='number'&&Number.isSafeInteger(payload.iat)&&payload.iat*1000<=now()&&typeof payload.exp==='number'&&Number.isSafeInteger(payload.exp)&&payload.exp*1000>now()&&payload.exp-payload.iat<=900,'UNAUTHORIZED');
  return assertion;
 };
}
