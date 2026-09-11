import { jwtVerify } from 'jose';
import { recordDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { CAPABILITIES } from './authorization.mjs';
import { workersDevOrigin } from '../runtime/environment.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** Explicit application-wide delegation profile. An opaque Managed OAuth bearer
 * is resolved by Access; this function verifies the signed assertion, not a header
 * claim or an OAuth scope. Standing grants are still required by ScopedAuthorization.
 * It never falls back from the existing strict oauth-jwt profile.
 * @param {{profile:'access-application',issuer:string,applicationAudience:string,resourceOrigin:string,applicationCapabilities:readonly Capability[]}} configuration
 * @param {import('jose').JWTVerifyGetKey} keyResolver
 * @param {()=>number} [now]
 */
export function accessApplicationVerifier(configuration, keyResolver, now = Date.now) {
    const config = { ...configuration, applicationCapabilities: [...configuration.applicationCapabilities] };
    requireThat(config.profile === 'access-application', 'INVALID_ARGUMENT', 'Explicit authentication profile required');
    requireThat(/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(config.issuer), 'INVALID_ARGUMENT', 'Exact Access issuer required');
    requireThat(/^[0-9a-f]{64}$/.test(config.applicationAudience), 'INVALID_ARGUMENT', 'Exact application audience required');
    workersDevOrigin(config.resourceOrigin);
    requireThat(config.applicationCapabilities.length > 0 && new Set(config.applicationCapabilities).size === config.applicationCapabilities.length &&
        config.applicationCapabilities.every(c => CAPABILITIES.includes(c)), 'INVALID_ARGUMENT', 'Explicit application delegation ceiling required');
    /** @param {unknown} assertion @returns {Promise<Principal>} */
    return async (assertion) => {
        requireThat(typeof assertion === 'string' && assertion.length <= 16384 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion), 'UNAUTHORIZED');
        try {
            const timestamp = now();
            requireThat(Number.isSafeInteger(timestamp) && timestamp >= 0, 'UNAUTHORIZED');
            const { payload } = await jwtVerify(assertion, keyResolver, { issuer: config.issuer, audience: config.applicationAudience,
                algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'type', 'email'], clockTolerance: 0, currentDate: new Date(timestamp) });
            requireThat(payload.type === 'app' && typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 1024 &&
                typeof payload.email === 'string' && payload.email.length > 0 && payload.email.length <= 1024, 'UNAUTHORIZED');
            requireThat(!Object.hasOwn(payload, 'common_name') && !Object.hasOwn(payload, 'service_token_id') &&
                (payload.service_token_status === undefined || payload.service_token_status === false), 'UNAUTHORIZED');
            requireThat(typeof payload.exp === 'number' && typeof payload.iat === 'number' && Number.isSafeInteger(payload.exp * 1000) &&
                Number.isSafeInteger(payload.iat * 1000) && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.iat) &&
                payload.iat >= 0 && payload.iat * 1000 <= timestamp && payload.exp > payload.iat, 'UNAUTHORIZED');
            // Audiences may be encoded as a string or array by the provider, but this
            // application profile never accepts a multi-application delegation.
            const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
            requireThat(audiences.length === 1 && audiences[0] === config.applicationAudience, 'UNAUTHORIZED');
            return { subject: recordDigest('dev2.access-subject.v1', { issuer: config.issuer, subject: payload.sub }).slice(7),
                issuer: config.issuer, audience: config.resourceOrigin, expiresAt: payload.exp * 1000,
                tokenCapabilities: Object.freeze([...config.applicationCapabilities]) };
        }
        catch {
            throw new Dev2Error('UNAUTHORIZED');
        }
    };
}
