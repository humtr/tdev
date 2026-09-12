import { requireThat } from '../contracts/errors.mjs';
/** @typedef {{platform:string,arch:string,node:string,sqlite:string|null}} RuntimeObservation */
/** @typedef {RuntimeObservation & {id:string,role:'native-control'|'ci'}} ExecutionVariant */
/** Exact supported implementation of one logical validation contract. This does
 * not assert a sandbox, provider entitlement, device lifetime or installation seal.
 * @param {{executionVariants:readonly ExecutionVariant[]}} lock
 * @param {RuntimeObservation} observed
 * @returns {Readonly<ExecutionVariant>}
 */
export function selectExecutionVariant(lock, observed) {
    requireThat(Array.isArray(lock.executionVariants) && lock.executionVariants.length > 0, 'INVALID_ARGUMENT', 'Explicit execution variants required');
    const ids = new Set(), identities = new Set();
    for (const variant of lock.executionVariants) {
        requireThat(typeof variant.id === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(variant.id) &&
            ['native-control', 'ci'].includes(variant.role) &&
            ['platform', 'arch', 'node', 'sqlite'].every(k => typeof variant[ /** @type {keyof RuntimeObservation} */(k)] === 'string'), 'INVALID_ARGUMENT', 'Invalid execution variant');
        const identity = JSON.stringify([variant.platform, variant.arch, variant.node, variant.sqlite]);
        requireThat(!ids.has(variant.id) && !identities.has(identity), 'INVALID_ARGUMENT', 'Ambiguous execution variant');
        ids.add(variant.id);
        identities.add(identity);
    }
    const matched = lock.executionVariants.find(v => v.platform === observed.platform && v.arch === observed.arch && v.node === observed.node && v.sqlite === observed.sqlite);
    requireThat(matched, 'EXECUTION_UNAVAILABLE', 'No exact supported execution variant');
    return Object.freeze({ ...matched });
}
/** The credential-free managed image has an independently observed exact Git
 * implementation; canonical device writing retains its own exact native pin.
 * No range fallback or ambient environment variable can select another version.
 * @param {{git:{version:string},managedImage?:{imageDigest:string,executionVariant:string,gitVersion:string,pythonVersion:string}}} lock
 * @param {ExecutionVariant} variant @param {string} environment */
export function executionToolVersions(lock,variant,environment){
    requireThat(environment==='native'||environment==='managed-image','INVALID_ARGUMENT');
    if(environment==='native')return {git:lock.git.version,python:null};
    const image=lock.managedImage;
    requireThat(image&&/^sha256:[a-f0-9]{64}$/.test(image.imageDigest)&&variant.role==='ci'&&variant.platform==='linux'&&variant.id===image.executionVariant&&/^\d+\.\d+\.\d+$/.test(image.gitVersion)&&/^\d+\.\d+\.\d+$/.test(image.pythonVersion),'EXECUTION_UNAVAILABLE','No exact approved managed-image toolchain');
    return {git:image.gitVersion,python:image.pythonVersion};
}
/** Syntax and binding integrity only. The caller must independently obtain fresh
 * provider ownership, enabled-route and authentication-policy readback.
 * @param {unknown} value @returns {string} */
export function workersDevOrigin(value) {
    requireThat(typeof value === 'string' && value.length <= 253, 'INVALID_ARGUMENT', 'Exact workers.dev origin required');
    let url;
    try {
        url = new URL(value);
    }
    catch {
        requireThat(false, 'INVALID_ARGUMENT', 'Invalid public origin');
    }
    requireThat(url !== undefined && url.protocol === 'https:' && url.origin === value &&
        !url.username && !url.password && !url.port && !url.search && !url.hash &&
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(url.hostname), 'INVALID_ARGUMENT', 'Expected exact HTTPS workers.dev origin');
    return value;
}
/** @param {{origin:string,workerName:string,subdomain:string,workersDevEnabled:boolean}} binding */
export function workersDevBinding(binding) {
    const origin = workersDevOrigin(binding.origin);
    requireThat(binding.workersDevEnabled === true && origin === `https://${binding.workerName}.${binding.subdomain}.workers.dev`, 'INTEGRITY_FAILURE', 'Worker routing does not match installation binding');
    return Object.freeze({ ...binding, origin });
}
