import { createRemoteJWKSet } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { bytesDigest } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { accessApplicationVerifier } from '../security/access-application.mjs';
/** @typedef {import('./types.js').EdgeConfig} Config */
/** @typedef {import('./types.js').EdgeEnvironment} Env */
/** @param {Env} env @returns {Config} */
export function edgeConfig(env){
 const config=/** @type {Config} */(JSON.parse(env.DEV2_CONFIG_JSON));
 requireThat(config.installationId===config.binding.installationId&&Array.isArray(config.grants)&&config.grants.length>0,'INTEGRITY_FAILURE');
 requireThat(/^sha256:[a-f0-9]{64}$/.test(config.deviceCredentialDigest),'INTEGRITY_FAILURE');return config;
}
/** Device key authenticates only the installation channel and bounded installation
 * readback. It never authenticates /mcp or authorizes a public tool mutation.
 * @param {Request} request @param {Env} env @param {Config} config */
export function authenticateDevice(request,env,config){
 const header=request.headers.get('authorization');
 requireThat(typeof env.DEV2_DEVICE_SECRET==='string'&&env.DEV2_DEVICE_SECRET.length>=43&&bytesDigest(Buffer.from(env.DEV2_DEVICE_SECRET))===config.deviceCredentialDigest,'UNAUTHORIZED');
 requireThat(typeof header==='string'&&header.startsWith('Bearer ')&&header.length<=256,'UNAUTHORIZED');
 const actual=Buffer.from(header.slice(7)),expected=Buffer.from(env.DEV2_DEVICE_SECRET);
 requireThat(actual.byteLength===expected.byteLength&&timingSafeEqual(actual,expected),'UNAUTHORIZED');
 requireThat(new URL(request.url).origin===config.origin,'FORBIDDEN');
}
/** Edge verifies the exact signed Access assertion but does not own repository
 * standing grants. A fixed native authorization hop performs the current
 * installation/repository/ref grant decision for discovery and calls.
 * @param {Config} config */
export function humanAuthentication(config){
 const verify=accessApplicationVerifier({profile:'access-application',issuer:config.issuer,applicationAudience:config.applicationAudience,resourceOrigin:config.origin,applicationCapabilities:config.applicationCapabilities},createRemoteJWKSet(new URL(config.issuer+'/cdn-cgi/access/certs')));
 /** @param {Request} request */
 return async request=>{const assertion=request.headers.get('cf-access-jwt-assertion');await verify(assertion);return /** @type {string} */(assertion);};
}
