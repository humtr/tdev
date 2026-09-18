import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { failure } from '../contracts/envelopes.mjs';
import { TdevError } from '../contracts/errors.mjs';
import { createMcpGateway, jsonResponse, readBody } from './gateway.mjs';
import { executorAuthentication } from './executor-auth.mjs';
import { executorRequest, EXECUTOR_BODY_BYTES } from '../execution/protocol.mjs';
/** @type {WeakMap<object,ReturnType<typeof executorAuthentication>>} */const executors=new WeakMap();
import { edgeConfig, authenticateDevice, humanAuthentication } from './auth.mjs';
import { SCHEMA_DIGEST } from './contract.mjs';
export { TdevRendezvousDO } from './router.mjs';
/** @typedef {import('./types.js').EdgeEnvironment} Env */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @type {WeakMap<object,ReturnType<typeof createMcpGateway>>} */const gateways=new WeakMap();
export default {
 /** @param {Request} request @param {Env} env */
 async fetch(request,env){try{
  const config=edgeConfig(env),url=new URL(request.url);
  if(url.origin!==config.origin||url.username||url.password||url.search||url.hash)throw new TdevError('FORBIDDEN');
  const stub=()=>env.TDEV_ROUTER.get(env.TDEV_ROUTER.idFromName(config.installationId));
  if(url.pathname==='/.well-known/oauth-protected-resource/mcp'){
   if(request.method!=='GET')return new Response(null,{status:405});
   return jsonResponse({resource:config.origin+'/mcp',authorization_servers:[config.issuer],bearer_methods_supported:['header'],resource_name:'tdev MCP'});
  }
  if(['/__tdev/device','/__tdev/status','/__tdev/verify'].includes(url.pathname)){
   authenticateDevice(request,env,config);return await stub().fetch(request);
  }
  if(url.pathname==='/executor'){
   if(request.method!=='POST')return new Response(null,{status:405});
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new TdevError('INVALID_ARGUMENT');
   const input=executorRequest(parseRecord(await readBody(request,EXECUTOR_BODY_BYTES),EXECUTOR_BODY_BYTES));
   let authenticate=executors.get(env);if(!authenticate){authenticate=executorAuthentication(config);executors.set(env,authenticate);}
   const assertion=await authenticate(request,input);
   const response=await stub().fetch(new Request(config.origin+'/__tdev/executor',{method:'POST',headers:{'content-type':'application/json'},body:canonicalJson({arguments:input,assertion})}));
   return jsonResponse(/** @type {Json} */(parseRecord(await readBody(response,262144),262144)));
  }
  if(url.pathname!=='/mcp')return new Response(null,{status:404});
  let gateway=gateways.get(env);if(!gateway){gateway=createMcpGateway({origin:config.origin,allowedOrigins:config.allowedOrigins,
   serverInfo:{name:'tdev',version:SCHEMA_DIGEST.slice(7,23)},authenticate:humanAuthentication(config),
   deliver:async body=>{const response=await stub().fetch(new Request(config.origin+'/__tdev/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:canonicalJson(body)}));
    return /** @type {Json} */(parseRecord(await response.text(),262144));}});gateways.set(env,gateway);}
  return await gateway(request);
 }catch(error){const status=error instanceof TdevError&&error.code==='UNAUTHORIZED'?401:403;return jsonResponse(failure(error),status);}}
};
