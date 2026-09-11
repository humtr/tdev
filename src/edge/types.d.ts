import type { Json, Binding, Capability } from '../contracts/ports.js';
import type { Grant } from '../security/authorization.mjs';
export interface EdgeConfig {
 installationId:string; deviceId:string; origin:string; issuer:string; applicationAudience:string;
 deviceCredentialDigest:string; allowedOrigins:string[]; binding:Binding; grants:Grant[];
 applicationCapabilities:Capability[]; sourceCommitOid:string; edgeBundleDigest:string;
}
export interface EdgeSocket {
 readyState:number; send(data:string|Uint8Array):void; close(code?:number,reason?:string):void;
 serializeAttachment(value:unknown):void; deserializeAttachment():unknown;
}
export interface DurableContext {
 getWebSockets(tag?:string):EdgeSocket[]; acceptWebSocket(socket:EdgeSocket,tags?:string[]):void;
 setWebSocketAutoResponse(pair:{request:string;response:string}):void;
}
export interface EdgeEnvironment {
 DEV2_CONFIG_JSON:string; DEV2_DEVICE_SECRET:string;
 DEV2_VERSION?:{id:string;timestamp:string};
 DEV2_ROUTER:{idFromName(name:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}};
}
export interface DeviceHello { v:1; kind:'hello'; connectionId:string; installationId:string; schemaDigest:string;
 edge:{versionId:string|null;sourceCommitOid:string;bundleDigest:string;schemaDigest:string;observedAt:string} }
export interface DeviceObservation { schemaDigest:string; sourceCommitOid:string; bundleDigest:string; ownerEpoch:string;
 nodeVersion:string; platform:string; arch:string; connectedAt:string; lastMessageAt:string; probe:Json|null }
