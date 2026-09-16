import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, parseRecord, bytesDigest } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { failure } from '../contracts/envelopes.mjs';
/** Closed input boundary only. No HTTP listener, execution engine or success receipt.
 * @typedef {import('../contracts/ports.js').Json} Json
 * @typedef {{[key:string]:Json}} Schema
 * @typedef {'dev_context'|'dev_read'|'dev_work'|'dev_observe'} ToolName
 */
import { MAX_REQUEST_BYTES } from './limits.mjs';
export { MAX_REQUEST_BYTES };
const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
/** @param {string} name @returns {Schema} */
const ref = name => ({ $ref: '#/$defs/' + name });
/** @param {Record<string,Schema>} properties @param {string[]} [required] @returns {Schema} */
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
/** @param {Schema} items @param {number} maxItems @param {number} [minItems] @returns {Schema} */
const array = (items, maxItems, minItems = 1) => ({ type: 'array', items, minItems, maxItems });
/** @param {number} maximum @param {number} [minimum] @returns {Schema} */
const integer = (maximum, minimum = 0) => ({ type: 'integer', minimum, maximum });
/** @param {number} maximum @param {number} [minimum] @returns {Schema} */
const text = (maximum, minimum = 0) => ({ type: 'string', minLength: minimum, maxLength: maximum });
/** @param {Schema} schema @param {Json} value @returns {Schema} */
const def = (schema, value) => ({ ...schema, default: value });
/** Portable JSON Schema integer bound for a decimal-string uint64, without custom formats. */
function revisionPattern() {
    const max = '18446744073709551615', parts = ['0', '[1-9][0-9]{0,18}'];
    for (let i = 0; i < max.length; i++) {
        const low = i === 0 ? 1 : 0, high = Number(max[i]) - 1;
        if (high < low)
            continue;
        const choice = low === high ? String(low) : `[${low}-${high}]`, tail = max.length - i - 1;
        parts.push(max.slice(0, i) + choice + (tail ? `[0-9]{${tail}}` : ''));
    }
    return '^(?:' + [...parts, max].join('|') + ')$';
}
/** @type {Record<string,Schema>} */
const defs = {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$', minLength: 1, maxLength: 128 },
    revision: { type: 'string', pattern: revisionPattern(), minLength: 1, maxLength: 20 },
    digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    oid: { type: 'string', pattern: '^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$' },
    path: text(4096),
    mode: { type: 'string', enum: ['100644', '100755', '120000', '160000'] },
    expected: { oneOf: [{ const: 'absent' }, object({ blobDigest: ref('digest'), mode: ref('mode') })] },
    // Profile parameter values are data, not an open operation registry. The adopted
    // profile schema must independently reject unknown names, types and effects.
    parameter: { anyOf: [{ type: 'null' }, { type: 'boolean' }, integer(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER), text(MAX_REQUEST_BYTES),
            { type: 'array', items: ref('parameter'), maxItems: 256 },
            { type: 'object', additionalProperties: false, patternProperties: { '^.*$': ref('parameter') }, maxProperties: 256 }] },
    edits: array(ref('edit'), 256),
};
defs.edit = { oneOf: [
        object({ kind: { const: 'put' }, path: ref('path'), expectedEntry: ref('expected'), mode: ref('mode'), content: text(MAX_REQUEST_BYTES), encoding: { enum: ['utf8', 'base64'] } }),
        object({ kind: { const: 'delete' }, path: ref('path'), expectedEntry: ref('expected') }),
        object({ kind: { const: 'move' }, from: ref('path'), to: ref('path'), expectedEntry: ref('expected'), expectedDestination: { const: 'absent' } }),
        object({ kind: { const: 'exact_edit' }, path: ref('path'), expectedEntry: ref('expected'), oldText: text(MAX_REQUEST_BYTES, 1), newText: text(MAX_REQUEST_BYTES) })
    ] };
const work = { workId: ref('id'), expectedRevision: ref('revision') };
const candidate = { ...work, generation: ref('revision') };
const integration = { ...candidate, expectedHead: ref('oid'), policyDigest: ref('digest') };
/** @param {string} op @param {Record<string,Schema>} fields @param {string[]} [optional] @returns {Schema} */
const item = (op, fields, optional = []) => object({ op: { const: op }, requestId: ref('id'), ...fields }, ['op', 'requestId', ...Object.keys(fields).filter(k => !optional.includes(k))]);
/** @type {Record<string,Schema>} */
const variants = {
    create: item('create', { snapshotId: ref('id'), expectedHead: ref('oid'), objective: text(4096, 1), initialEdits: ref('edits') }, ['initialEdits']),
    edit: item('edit', { ...work, expectedGeneration: ref('revision'), edits: ref('edits') }),
    run: item('run', { ...candidate, profileId: text(128, 1), policyDigest: ref('digest'), parameters: ref('parameter') }),
    validate: item('validate', integration),
    integrate: item('integrate', { ...integration, preparedResultId: ref('id') }, ['preparedResultId']),
    cancel: item('cancel', { ...work, actionId: ref('id'), reason: text(4096) }, ['actionId', 'reason']),
    resume: item('resume', { ...work, actionId: ref('id') }),
    'policy.adopt': item('policy.adopt', { repository: ref('id'), expectedPolicyDigest: ref('digest'), integratedCommit: ref('oid'), policyPath: ref('path'), newPolicyDigest: ref('digest') }),
    'release.stage': item('release.stage', { repository: ref('id'), integratedCommit: ref('oid'), expectedActiveRelease: ref('digest'), policyDigest: ref('digest') }),
    'release.activate': item('release.activate', { repository: ref('id'), stagedReleaseId: ref('id'), expectedActiveRelease: ref('digest') }),
};
defs.item = { oneOf: Object.values(variants) };
const cursor = ref('id');
defs.query = { oneOf: [
        object({ kind: { const: 'list' }, path: ref('path'), cursor, limit: def(integer(256, 1), 256) }, ['kind', 'path']),
        object({ kind: { const: 'search' }, paths: array(ref('path'), 64), literal: text(MAX_REQUEST_BYTES, 1), cursor, caseSensitive: def({ type: 'boolean' }, true), maxHits: def(integer(128, 1), 128) }, ['kind', 'paths', 'literal']),
        object({ kind: { const: 'file' }, path: ref('path'), startByte: def(integer(Number.MAX_SAFE_INTEGER), 0), maxBytes: def(integer(1048576, 1), 65536), encoding: def({ enum: ['utf8', 'base64'] }, 'utf8') }, ['kind', 'path']),
        object({ kind: { const: 'diff' }, baseSnapshotId: ref('id'), paths: array(ref('path'), 64), cursor }, ['kind', 'baseSnapshotId']),
        object({ kind: { const: 'artifact' }, startByte: integer(Number.MAX_SAFE_INTEGER), maxBytes: integer(1048576, 1) })
    ] };
defs.target = { oneOf: [object({ snapshotId: ref('id'), freshness: { enum: ['current', 'pinned'] } }), object({ workId: ref('id'), generation: ref('revision') }), object({ actionId: ref('id'), artifactId: ref('id') })] };
defs.selector = { oneOf: [
        ...['workIds', 'actionIds', 'requestIds'].map(key => object({ [key]: array(ref('id'), 64), afterRevision: ref('revision') }, [key])),
        object({ open: { const: true } }), object({ runtime: { const: true } })
    ] };
const context = object({ apiVersion: { const: 1 }, repository: def(ref('id'), 'self'), freshness: def({ enum: ['current', 'pinned'] }, 'current'), snapshotId: ref('id') }, ['apiVersion']);
context.allOf = [{ if: { properties: { freshness: { const: 'pinned' } }, required: ['freshness'] }, then: { required: ['snapshotId'] } }];
/** @type {Record<ToolName,Schema>} */
const roots = {
    dev_context: context,
    dev_read: object({ apiVersion: { const: 1 }, target: ref('target'), queries: array(ref('query'), 32), maxReturnBytes: def(integer(262144, 1), 262144) }, ['apiVersion', 'target', 'queries']),
    dev_work: object({ apiVersion: { const: 1 }, items: array(ref('item'), 64), waitMs: def(integer(20000), 0) }, ['apiVersion', 'items']),
    dev_observe: object({ apiVersion: { const: 1 }, repository: def(ref('id'), 'self'), selector: ref('selector'), waitMs: def(integer(20000), 0), cursor, limit: def(integer(128, 1), 32) }, ['apiVersion', 'selector']),
};
/** Include only reachable definitions. Avoid copying all ten work variants into each read tool.
 * @param {Schema} root @returns {Schema} */
function bundle(root) {
    /** @type {Record<string,Schema>} */ const used = {};
    /** @param {Json} value */
    function walk(value) {
        if (value === null || typeof value !== 'object')
            return;
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (typeof value.$ref === 'string') {
            const key = value.$ref.slice('#/$defs/'.length);
            if (!(key in used)) {
                requireThat(key in defs, 'INTEGRITY_FAILURE');
                used[key] = defs[key];
                walk(defs[key]);
            }
        }
        Object.values(value).forEach(walk);
    }
    walk(root);
    return { $schema: DIALECT, ...root, $defs: used };
}
/** @template T @param {T} value @returns {T} */
function immutable(value) { if (value && typeof value === 'object') {
    for (const child of Object.values(value))
        immutable(child);
    Object.freeze(value);
} return value; }
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: false, coerceTypes: false, removeAdditional: false, useDefaults: false, validateFormats: false });
/** @type {Record<ToolName,Schema>} */
export const INPUT_SCHEMAS = immutable(/** @type {Record<ToolName,Schema>} */ (Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, bundle(root)]))));
const validators = Object.fromEntries(Object.entries(INPUT_SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]));
const itemValidators = Object.fromEntries(Object.entries(variants).map(([op, schema]) => [op, ajv.compile(bundle(schema))]));
// Transport envelope is closed; items are intentionally checked independently
// against the very same published variant schemas, never coerced or stripped.
const workEnvelope = ajv.compile(bundle(object({ apiVersion: { const: 1 }, items: array({}, 64), waitMs: def(integer(20000), 0) }, ['apiVersion', 'items'])));
/** @type {Record<string,string>} */
const descriptions = {
    dev_context: 'Discover exact authorized repository identity, head, bounded context and available operations. Use current context before creating work; pinned context is read-only evidence.',
    dev_read: 'Read bounded directories, files, literal searches, diffs or artifacts at explicit snapshot/work/action identity. Expand context progressively; never execute source.',
    dev_work: 'Independently admit typed development operations. Reuse each requestId only for retries of the same logical intent. Validation and integration may return durable asynchronous admission; observe their outcome. No arbitrary shell.',
    dev_observe: 'Read retained work, action or request outcomes and runtime identity. Bounded waiting is observation only; disconnect is not durable work cancellation.'
};
/** Domain outputs and HTTP adapter are intentionally not advertised as implemented here. */
export const TOOL_INPUT_DESCRIPTORS = immutable(Object.entries(INPUT_SCHEMAS).map(([name, inputSchema]) => ({ name, description: descriptions[name], inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: false } })));
export const INPUT_SCHEMA_DIGEST = bytesDigest(Buffer.from(canonicalJson(TOOL_INPUT_DESCRIPTORS)));
/** @param {unknown} value @returns {{[key:string]:Json}} */
function record(value) { requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_ARGUMENT'); return /** @type {{[key:string]:Json}} */ (value); }
/** @param {unknown} value @returns {Json} */
function detached(value) { return /** @type {Json} */ (parseRecord(canonicalJson(value), MAX_REQUEST_BYTES)); }
/** @param {unknown} name @returns {asserts name is ToolName} */
function tool(name) { requireThat(typeof name === 'string' && Object.hasOwn(roots, name), 'INVALID_ARGUMENT', 'Unknown tool'); }
/** Structural input validation is not authorization. The domain must recheck paths,
 * profile parameters, policy, stale identities and dedup after authorization.
 * @param {ToolName} name @param {unknown} input @returns {{[key:string]:Json}} */
export function validateInput(name, input) {
    tool(name);
    const value = record(detached(input));
    requireThat(validators[name](value), 'INVALID_ARGUMENT', 'Input does not match the tool schema');
    if (name === 'dev_context')
        return { repository: 'self', freshness: 'current', ...value };
    if (name === 'dev_observe')
        return { repository: 'self', waitMs: 0, limit: 32, ...value };
    if (name === 'dev_work')
        return { waitMs: 0, ...value };
    const target = record(value.target);
    const queries = /** @type {Json[]} */ (value.queries);
    const artifact = Object.hasOwn(target, 'artifactId');
    requireThat(queries.every(q => (record(q).kind === 'artifact') === artifact), 'INVALID_ARGUMENT', 'Artifact and repository query scopes cannot be mixed');
    return { maxReturnBytes: 262144, ...value, queries: queries.map(q => { const item = record(q); switch (item.kind) {
            case 'list': return { limit: 256, ...item };
            case 'search': return { caseSensitive: true, maxHits: 128, ...item };
            case 'file': return { startByte: 0, maxBytes: 65536, encoding: 'utf8', ...item };
            default: return item;
        } }) };
}
/** @param {unknown} item @returns {{[key:string]:Json}} */
export function validateWorkItem(item) {
    const value = record(detached(item));
    requireThat(typeof value.op === 'string' && Object.hasOwn(itemValidators, value.op), 'INVALID_ARGUMENT', 'Unknown work operation');
    requireThat(itemValidators[value.op](value), 'INVALID_ARGUMENT', 'Work item does not match its schema');
    return value;
}
/** Preserve valid siblings when one item is malformed. No invalid item reaches
 * authorize/admit. Context is trusted request context, never client-supplied.
 * Admitter must durably deduplicate and return admission, not await execution.
 * @template C
 * @param {C} context @param {unknown} input
 * @param {(context:C,item:{[key:string]:Json})=>Promise<void>} authorize
 * @param {(context:C,item:{[key:string]:Json})=>Promise<Json>} admit
 */
export async function admitWorkBatch(context, input, authorize, admit) {
    const value = record(detached(input));
    requireThat(workEnvelope(value), 'INVALID_ARGUMENT', 'Invalid work envelope');
    const items = /** @type {Json[]} */ (value.items);
    return Promise.all(items.map(async (raw) => {
        try {
            const item = validateWorkItem(raw);
            await authorize(context, item);
            return { requestId: item.requestId, ok: true, receipt: detached(await admit(context, item)) };
        }
        catch (e) {
            const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
            const requestId = typeof source.requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(source.requestId) ? source.requestId : null;
            return { requestId, ok: false, error: failure(e).error };
        }
    }));
}
