/** Stateless wire codec for D0004. This is not an authenticated HTTP server.
 * P8 must enforce streaming body limits before buffering and P1 authentication on
 * every request. Decoding never admits work, cancels an effect, or proves a session.
 */
import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { MAX_REQUEST_BYTES } from './input-schemas.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{era:'modern'|'legacy',version:string,id:string|number|null,method:string,params:RecordValue,notification:boolean}} Message */
export const MODERN_VERSION = '2026-07-28';
export const LEGACY_VERSION = '2025-11-25';
export const SUPPORTED_VERSIONS = Object.freeze([MODERN_VERSION, LEGACY_VERSION]);
const VERSION = 'io.modelcontextprotocol/protocolVersion';
const CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
export class ProtocolError extends Error {
    /** @type {string|number|null} */ requestId = null;
    /** @type {'modern'|'legacy'} */ era = 'modern';
    /** @param {number} code @param {number} status @param {string} message @param {Json} [data] */
    constructor(code, status, message, data = null) { super(message); this.name = 'ProtocolError'; this.code = code; this.status = status; this.data = data; }
}
/** @param {unknown} condition @param {number} code @param {number} status @param {string} message @returns {asserts condition} */
function requireWire(condition, code, status, message) { if (!condition)
    throw new ProtocolError(code, status, message); }
/** @param {unknown} value @returns {value is RecordValue} */
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value @returns {value is string|number} */
function rpcId(value) { return (typeof value === 'string' && value.length <= 128) || (typeof value === 'number' && Number.isSafeInteger(value)); }
/** @param {RecordValue} params @param {string[]} names */
function fields(params, names) { requireWire(Object.keys(params).every(k => names.includes(k) || k === '_meta'), -32602, 400, 'Unknown protocol parameter'); }
/** @param {string|null} header */
export function decodeNameHeader(header) {
    requireWire(header !== null && header.length <= 1024, -32020, 400, 'Missing or oversized Mcp-Name header');
    if (header.startsWith('=?base64?') && header.endsWith('?=')) {
        const encoded = header.slice(9, -2);
        requireWire(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), -32020, 400, 'Malformed encoded Mcp-Name');
        const bytes = Buffer.from(encoded, 'base64');
        requireWire(bytes.toString('base64') === encoded, -32020, 400, 'Noncanonical encoded Mcp-Name');
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        }
        catch {
            throw new ProtocolError(-32020, 400, 'Invalid UTF-8 in Mcp-Name');
        }
    }
    requireWire(/^[\x20-\x7e\t]*$/.test(header) && header.trim() === header, -32020, 400, 'Malformed Mcp-Name');
    return header;
}
/** Validate configured exact origin/host, not untrusted proxy forwarding headers.
 * @param {string} requestUrl @param {Headers} headers
 * @param {{origin:string,allowedOrigins:readonly string[]}} configured */
export function checkEndpoint(requestUrl, headers, configured) {
    let url, origin;
    try {
        url = new URL(requestUrl);
        origin = new URL(configured.origin);
    }
    catch {
        throw new ProtocolError(-32600, 403, 'Invalid endpoint');
    }
    requireWire(origin.origin === configured.origin && ['https:', 'http:'].includes(origin.protocol), -32600, 403, 'Invalid configured origin');
    requireWire(url.origin === configured.origin && !url.username && !url.password && url.pathname === '/mcp' && !url.search && !url.hash, -32600, 403, 'Endpoint is not authorized');
    const host = headers.get('host');
    requireWire(host === null || host.toLowerCase() === url.host.toLowerCase(), -32600, 403, 'Host is not authorized');
    for (const permitted of configured.allowedOrigins) {
        let parsed;
        try {
            parsed = new URL(permitted);
        }
        catch {
            throw new ProtocolError(-32600, 403, 'Invalid allowed origin');
        }
        requireWire(parsed.origin === permitted && ['https:', 'http:'].includes(parsed.protocol), -32600, 403, 'Invalid allowed origin');
    }
    const supplied = headers.get('origin');
    requireWire(supplied === null || configured.allowedOrigins.includes(supplied), -32600, 403, 'Origin is not authorized');
}
/** Only call after authentication and bounded HTTP body collection. Protocol
 * metadata is peer data, not an authorization or work-identity source.
 * @param {Uint8Array|string} bytes @param {Headers} headers @returns {Message} */
export function decodeMessage(bytes, headers) {
    requireWire((typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.byteLength) <= MAX_REQUEST_BYTES, -32600, 413, 'Request body exceeds limit');
    let raw;
    try {
        raw = parseRecord(bytes, MAX_REQUEST_BYTES);
    }
    catch {
        const error = new ProtocolError(-32700, 400, 'Parse error');
        error.era = headers.get('mcp-protocol-version') === LEGACY_VERSION ? 'legacy' : 'modern';
        throw error;
    }
    try {
        return decodeRecord(raw, headers);
    }
    catch (error) {
        if (error instanceof ProtocolError && isRecord(raw)) {
            if (rpcId(raw.id))
                error.requestId = raw.id;
            const meta = isRecord(raw.params) && isRecord(raw.params._meta) ? raw.params._meta : {};
            error.era = meta[VERSION] === undefined && headers.get('mcp-protocol-version') !== MODERN_VERSION &&
                (raw.method === 'initialize' || headers.get('mcp-protocol-version') === LEGACY_VERSION) ? 'legacy' : 'modern';
        }
        throw error;
    }
}
/** @param {unknown} raw @param {Headers} headers @returns {Message} */
function decodeRecord(raw, headers) {
    requireWire(isRecord(raw) && raw.jsonrpc === '2.0' && typeof raw.method === 'string' && raw.method.length > 0 && raw.method.length <= 128, -32600, 400, 'Invalid Request');
    requireWire(Object.keys(raw).every(k => ['jsonrpc', 'id', 'method', 'params'].includes(k)), -32600, 400, 'Invalid Request fields');
    const notification = !Object.hasOwn(raw, 'id');
    requireWire(notification || rpcId(raw.id), -32600, 400, 'Invalid request id');
    const id = notification ? null : /** @type {string|number} */ (raw.id);
    const params = raw.params === undefined ? {} : raw.params;
    requireWire(isRecord(params), -32602, 400, 'Expected protocol parameter object');
    const meta = params._meta === undefined ? {} : params._meta;
    requireWire(isRecord(meta), -32602, 400, 'Expected protocol metadata object');
    const bodyVersion = meta[VERSION], headerVersion = headers.get('mcp-protocol-version');
    if (headerVersion !== null && !SUPPORTED_VERSIONS.includes(headerVersion))
        throw new ProtocolError(-32022, 400, 'Unsupported protocol version', { supported: [...SUPPORTED_VERSIONS], requested: headerVersion });
    const modern = bodyVersion !== undefined || headerVersion === MODERN_VERSION ||
        (raw.method !== 'initialize' && headerVersion !== LEGACY_VERSION);
    if (modern) {
        requireWire(typeof bodyVersion === 'string' && isRecord(meta[CAPABILITIES]), -32602, 400, 'Required request protocol metadata missing');
        if (bodyVersion !== MODERN_VERSION)
            throw new ProtocolError(-32022, 400, 'Unsupported protocol version', { supported: [...SUPPORTED_VERSIONS], requested: bodyVersion });
        requireWire(headerVersion === bodyVersion && headers.get('mcp-method') === raw.method, -32020, 400, 'Required protocol header mismatch');
        if (raw.method === 'tools/call')
            requireWire(decodeNameHeader(headers.get('mcp-name')) === params.name, -32020, 400, 'Mcp-Name does not match the body');
        requireWire(!notification, -32601, 404, 'Notification method is not supported');
    }
    else {
        if (headerVersion !== null && headerVersion !== LEGACY_VERSION)
            throw new ProtocolError(-32022, 400, 'Unsupported protocol version', { supported: [...SUPPORTED_VERSIONS], requested: headerVersion });
        requireWire(raw.method === 'initialize' || headerVersion === LEGACY_VERSION, -32020, 400, 'Protocol version header required');
    }
    switch (raw.method) {
        case 'server/discover':
            requireWire(modern, -32601, 404, 'Method not found');
            fields(params, []);
            break;
        case 'initialize':
            requireWire(!modern && !notification, -32601, 404, 'Method not found');
            fields(params, ['protocolVersion', 'capabilities', 'clientInfo']);
            requireWire(typeof params.protocolVersion === 'string' && isRecord(params.capabilities) && isRecord(params.clientInfo) && typeof params.clientInfo.name === 'string' && typeof params.clientInfo.version === 'string', -32602, 400, 'Invalid initialize parameters');
            break;
        case 'notifications/initialized':
            requireWire(!modern && notification, -32600, 400, 'Expected legacy notification');
            fields(params, []);
            break;
        case 'notifications/cancelled':
            requireWire(!modern && notification, -32600, 400, 'Expected legacy notification');
            fields(params, ['requestId', 'reason']);
            requireWire(rpcId(params.requestId) && (params.reason === undefined || typeof params.reason === 'string'), -32602, 400, 'Invalid cancellation parameters');
            break;
        case 'tools/list':
            requireWire(!notification, -32600, 400, 'Request id required');
            fields(params, ['cursor']);
            requireWire(params.cursor === undefined || typeof params.cursor === 'string', -32602, 400, 'Invalid cursor');
            break;
        case 'tools/call':
            requireWire(!notification, -32600, 400, 'Request id required');
            fields(params, ['name', 'arguments']);
            requireWire(typeof params.name === 'string' && params.name.length <= 128 && (params.arguments === undefined || isRecord(params.arguments)), -32602, 400, 'Invalid tools/call parameters');
            break;
        case 'ping':
            requireWire(!notification, -32600, 400, 'Request id required');
            fields(params, []);
            break;
        default: throw new ProtocolError(-32601, 404, 'Method not found');
    }
    return { era: modern ? 'modern' : 'legacy', version: modern ? MODERN_VERSION : LEGACY_VERSION, id, method: raw.method, params, notification };
}
/** Encode a complete protocol result. Domain projection must already have passed
 * its closed output schema. This function does not make a receipt authoritative.
 * @param {Message} message @param {RecordValue} payload @param {{name:string,version:string}} serverInfo */
export function completeMessage(message, payload, serverInfo) {
    requireWire(!message.notification && rpcId(message.id), -32600, 400, 'Cannot respond to a notification');
    requireWire(!Object.hasOwn(payload, 'resultType'), -32603, 500, 'Result discriminator is codec-owned');
    const meta = payload._meta === undefined ? {} : payload._meta;
    requireWire(isRecord(meta), -32603, 500, 'Invalid result metadata');
    const result = message.era === 'modern' ? { ...payload, resultType: 'complete', _meta: { ...meta, 'io.modelcontextprotocol/serverInfo': serverInfo } } : payload;
    return /** @type {RecordValue} */ (parseRecord(canonicalJson({ jsonrpc: '2.0', id: message.id, result }), MAX_REQUEST_BYTES));
}
/** @param {{name:string,version:string}} serverInfo */
export function discovery(serverInfo) { return { supportedVersions: [...SUPPORTED_VERSIONS], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo } }; }
/** An initialize request may propose another legacy version; agreement explicitly
 * selects the only implemented legacy version, never silently changes it later.
 * @param {{name:string,version:string}} serverInfo */
export function initialization(serverInfo) { return { protocolVersion: LEGACY_VERSION, capabilities: { tools: {} }, serverInfo }; }
/** @param {RecordValue} envelope */
export function toolPayload(envelope) { requireWire(envelope.apiVersion === 1 && typeof envelope.ok === 'boolean', -32603, 500, 'Invalid tool envelope'); return { content: [{ type: 'text', text: canonicalJson(envelope) }], structuredContent: envelope, isError: !envelope.ok }; }
/** No raw provider or parsing exception details are sent to a peer.
 * @param {unknown} error @param {string|number|null} [id] @param {'modern'|'legacy'} [era] */
export function errorResponse(error, id = null, era) {
    const known = error instanceof ProtocolError;
    if (id === null && known)
        id = error.requestId;
    const actualEra = era ?? (known ? error.era : 'modern');
    /** @type {RecordValue} */ const detail = { code: known ? error.code : -32603, message: known ? error.message : 'Internal error' };
    if (known && error.data !== null)
        detail.data = error.data;
    /** @type {RecordValue} */ const body = { jsonrpc: '2.0', error: detail };
    if (id !== null && rpcId(id))
        body.id = id;
    else if (actualEra === 'legacy')
        body.id = null;
    return { status: known ? error.status : 500, body };
}
