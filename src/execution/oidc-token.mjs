import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {parseRecord} from '../contracts/canonical.mjs';
import {workersDevOrigin} from '../runtime/environment.mjs';
/** This credential is available only on the approved outer GitHub host. Never
 * pass its URL/token, provider token or ambient environment into a candidate.
 * @param {{origin:string,url:string,token:string,fetcher?:typeof fetch,now?:()=>number}} options */
export function oidcToken(options){
 const url=new URL(options.url);requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&url.hostname.endsWith('.actions.githubusercontent.com')&&options.token.length>=16&&options.token.length<=32768&&!/\s/.test(options.token),'UNAUTHORIZED','Unapproved OIDC service');url.searchParams.set('audience',workersDevOrigin(options.origin)+'/executor');
 const now=options.now??Date.now,fetcher=options.fetcher??fetch;let cached='',at=-Infinity;let pending=/** @type {Promise<string>|null} */(null);
 return async()=>{if(cached&&now()-at<90000&&now()>=at)return cached;if(pending)return pending;
  pending=(async()=>{let response;try{response=await fetcher(url,{headers:{authorization:'Bearer '+options.token},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','OIDC service unavailable');}requireThat(response.ok,'UNAUTHORIZED','OIDC service refused issuance');
   const reader=response.body?.getReader();requireThat(reader,'INTEGRITY_FAILURE');let size=0;const chunks=[];try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;requireThat(size<=40000,'LIMIT_EXCEEDED');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const value=/** @type {{value?:string}} */(parseRecord(Buffer.concat(chunks),40000));requireThat(typeof value.value==='string'&&value.value.length<=32768&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.value),'UNAUTHORIZED');cached=value.value;at=now();return cached;
  })();try{return await pending;}finally{pending=null;}
 };
}
