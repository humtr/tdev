import { randomUUID } from 'node:crypto';
import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{maxPending:number,maxRequestBytes:number,maxResponseBytes:number,maxRetainedBytes:number,deadlineMs:number}} Limits */
/** Not a work record, receipt, queue, authentication service or public proxy. */
export class DeliveryUnavailable extends Dev2Error {
    /** @param {'not_sent'|'unknown'} delivery */
    constructor(delivery) {
        super('EXECUTION_UNAVAILABLE', 'Device delivery unavailable', { delivery });
        this.name = 'DeliveryUnavailable';
        this.code = 'EXECUTION_UNAVAILABLE';
        this.delivery = delivery;
        this.sameRequest = true;
    }
}
/** Ephemeral bounded correlation for one authenticated installation connection.
 * Attach/receive are trusted adapter entrypoints, never directly public methods.
 * The Worker adapter must authenticate device/human roles, enforce streaming
 * socket limits, verify closed domain outputs, and discard this map on restart.
 */
export class RequestRendezvous {
    /** @type {{id:string,send:(message:string)=>void}|null} */ #connection = null;
    /** @type {Map<string,{connectionId:string,bytes:number,expiresAt:number,timer:ReturnType<typeof setTimeout>,resolve:(value:Json)=>void,reject:(error:Error)=>void}>} */ #pending = new Map();
    #retainedBytes = 0;
    /** @type {Readonly<Limits>} */ #limits;
    /** @type {()=>number} */ #now;
    /** @param {Partial<Limits>} [limits] @param {()=>number} [now] */
    constructor(limits = {}, now = Date.now) {
        this.#limits = Object.freeze({ maxPending: 128, maxRequestBytes: 1048576, maxResponseBytes: 262144, maxRetainedBytes: 8388608, deadlineMs: 30000, ...limits });
        for (const n of Object.values(this.#limits))
            requireThat(Number.isSafeInteger(n) && n > 0, 'INVALID_ARGUMENT', 'Positive routing bounds required');
        requireThat(this.#limits.deadlineMs <= 2147483647, 'INVALID_ARGUMENT', 'Routing deadline cannot overflow a timer');
        this.#now = now;
    }
    /** Called only after device authentication for this installation.
     * @param {(message:string)=>void} send @returns {string} */
    attach(send) {
        requireThat(typeof send === 'function', 'INVALID_ARGUMENT');
        if (this.#connection)
            this.disconnect(this.#connection.id);
        const id = randomUUID();
        this.#connection = { id, send };
        return id;
    }
    /** A late close from a superseded socket cannot close the current device.
     * @param {string} connectionId */
    disconnect(connectionId) {
        if (this.#connection?.id !== connectionId)
            return false;
        this.#connection = null;
        for (const [id, pending] of this.#pending)
            if (pending.connectionId === connectionId)
                this.#fail(id);
        return true;
    }
    /** @param {string} id */
    #take(id) {
        const pending = this.#pending.get(id);
        if (!pending)
            return null;
        this.#pending.delete(id);
        clearTimeout(pending.timer);
        this.#retainedBytes -= pending.bytes;
        return pending;
    }
    /** @param {string} id */
    #fail(id) { this.#take(id)?.reject(new DeliveryUnavailable('unknown')); }
    /** Requires an already bounded and authenticated incoming tool request. The
     * device independently verifies the assertion and current capability grant.
     * Authorization is never supplied by a method name or transport correlation ID.
     * @param {{tool:string,arguments:Json,assertion:string}} request @returns {Promise<Json>} */
    request(request) {
        try {
            requireThat(['dev_context', 'dev_read', 'dev_work', 'dev_observe'].includes(request.tool), 'INVALID_ARGUMENT', 'Unknown routed tool');
            requireThat(request.arguments !== null && typeof request.arguments === 'object' && !Array.isArray(request.arguments) &&
                typeof request.assertion === 'string' && request.assertion.length > 0 && request.assertion.length <= 16384, 'INVALID_ARGUMENT', 'Bounded arguments and signed identity assertion required');
            requireThat(Object.keys(request).length===3,'INVALID_ARGUMENT','Closed routed request');
            return this.#route(canonicalJson({ tool: request.tool, arguments: request.arguments, assertion: request.assertion }));
        } catch(error) { return Promise.reject(error); }
    }
    /** Authenticated provider-role adapter, distinct from human tool dispatch.
     * The native endpoint independently verifies OIDC and retained launch identity.
     * @param {{arguments:Json,assertion:string}} request @returns {Promise<Json>} */
    executor(request) {
        try {
            requireThat(Object.keys(request).length===2&&request.arguments!==null&&typeof request.arguments==='object'&&!Array.isArray(request.arguments)&&typeof request.assertion==='string'&&request.assertion.length>0&&request.assertion.length<=32768,'INVALID_ARGUMENT');
            requireThat(Buffer.byteLength(canonicalJson(request.arguments))<=131072,'LIMIT_EXCEEDED');
            return this.#route(canonicalJson({kind:'executor',arguments:request.arguments,assertion:request.assertion}));
        } catch(error) { return Promise.reject(error); }
    }
    /** Trusted device-role adapter only: no arbitrary tool, path, subject or mutation. */
    probe() { return this.#route(canonicalJson({kind:'installation_read_probe'})); }
    /** @param {string} body @returns {Promise<Json>} */
    #route(body) {
        try {
            const bytes = Buffer.byteLength(body);
            requireThat(bytes <= this.#limits.maxRequestBytes, 'LIMIT_EXCEEDED', 'Routing body exceeds limit');
            const connection = this.#connection;
            if (!connection)
                return Promise.reject(new DeliveryUnavailable('not_sent'));
            requireThat(this.#pending.size < this.#limits.maxPending && this.#retainedBytes + bytes <= this.#limits.maxRetainedBytes, 'CAPACITY_REJECTED', 'Routing capacity unavailable');
            const now = this.#now();
            requireThat(Number.isSafeInteger(now) && Number.isSafeInteger(now + this.#limits.deadlineMs), 'INVALID_ARGUMENT', 'Invalid routing clock');
            const id = randomUUID();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => this.#fail(id), this.#limits.deadlineMs);
                this.#pending.set(id, { connectionId: connection.id, bytes, expiresAt: now + this.#limits.deadlineMs, timer, resolve, reject });
                this.#retainedBytes += bytes;
                const message = `{"v":1,"connectionId":${JSON.stringify(connection.id)},"correlationId":${JSON.stringify(id)},"body":${body}}`;
                // Once send is attempted, an exception cannot establish non-delivery.
                // No automatic retransmission occurs here: the caller reuses durable IDs.
                try {
                    connection.send(message);
                }
                catch {
                    this.#fail(id);
                }
            });
        }
        catch (error) {
            return Promise.reject(error);
        }
    }
    /** Called only for frames on an authenticated device socket. Wrong/late/duplicate
     * replies never settle another request. Malformed frames fail without leaking
     * arbitrary peer text; the adapter decides whether to close that socket.
     * @param {string} connectionId @param {string|Uint8Array} encoded */
    receive(connectionId, encoded) {
        if (this.#connection?.id !== connectionId)
            return false;
        /** @type {Json} */ let frame;
        try {
            frame = /** @type {Json} */ (parseRecord(encoded, this.#limits.maxResponseBytes + 512));
        }
        catch {
            throw new Dev2Error('INVALID_ARGUMENT', 'Invalid routing reply');
        }
        requireThat(frame !== null && typeof frame === 'object' && !Array.isArray(frame), 'INVALID_ARGUMENT', 'Invalid routing reply');
        requireThat(Object.keys(frame).length === 4 && frame.v === 1 && frame.connectionId === connectionId &&
            typeof frame.correlationId === 'string' && Object.hasOwn(frame, 'body') &&
            ['v', 'connectionId', 'correlationId', 'body'].every(k => Object.hasOwn(frame, k)), 'INVALID_ARGUMENT', 'Invalid routing reply');
        const pending = this.#pending.get(frame.correlationId);
        if (!pending || pending.connectionId !== connectionId)
            return false;
        requireThat(Buffer.byteLength(canonicalJson(frame.body)) <= this.#limits.maxResponseBytes, 'LIMIT_EXCEEDED', 'Reply body exceeds limit');
        if (this.#now() >= pending.expiresAt) {
            this.#fail(frame.correlationId);
            return false;
        }
        this.#take(frame.correlationId)?.resolve(frame.body);
        return true;
    }
    snapshot() { return Object.freeze({ connected: this.#connection !== null, pending: this.#pending.size, retainedBytes: this.#retainedBytes }); }
    dispose() {
        if (this.#connection)
            this.disconnect(this.#connection.id);
    }
}
