import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { INPUT_SCHEMAS, TOOL_INPUT_DESCRIPTORS, INPUT_SCHEMA_DIGEST, MAX_REQUEST_BYTES, validateInput, validateWorkItem, admitWorkBatch } from '../../src/mcp/input-schemas.mjs';
import { canonicalJson } from '../../src/contracts/canonical.mjs';
import { revision } from '../../src/contracts/identity.mjs';
import { Dev2Error } from '../../src/contracts/errors.mjs';
import { schemaFootprint } from '../../bench/diagnostics.mjs';
const digest = 'sha256:' + 'a'.repeat(64), head = 'sha1:' + 'b'.repeat(40), work = { workId: 'w1', expectedRevision: '0' }, candidate = { ...work, generation: '0' }, integration = { ...candidate, expectedHead: head, policyDigest: digest };
const entry = { blobDigest: digest, mode: '100644' };
const edits = [{ kind: 'put', path: 'src/new.mjs', expectedEntry: 'absent', mode: '100644', content: 'export const x=1;', encoding: 'utf8' },
    { kind: 'delete', path: 'old.txt', expectedEntry: entry },
    { kind: 'move', from: 'a.txt', to: 'b.txt', expectedEntry: entry, expectedDestination: 'absent' },
    { kind: 'exact_edit', path: 'code.mjs', expectedEntry: entry, oldText: 'before', newText: 'after' }];
const examples = {
    create: { snapshotId: 's1', expectedHead: head, objective: 'Change one file', initialEdits: [edits[0]] },
    edit: { ...work, expectedGeneration: '0', edits }, run: { ...candidate, profileId: 'core', policyDigest: digest, parameters: { mode: 'check' } },
    validate: integration, integrate: { ...integration, preparedResultId: 'r1' }, cancel: { ...work, reason: 'Stop', actionId: 'a1' }, resume: { ...work, actionId: 'a1' },
    'policy.adopt': { repository: 'self', expectedPolicyDigest: digest, integratedCommit: head, policyPath: 'config/policy.json', newPolicyDigest: digest },
    'release.stage': { repository: 'self', integratedCommit: head, expectedActiveRelease: digest, policyDigest: digest },
    'release.activate': { repository: 'self', stagedReleaseId: 'stage1', expectedActiveRelease: digest }
};
const make = (op, requestId = op.replaceAll('.', '_')) => ({ op, requestId, ...structuredClone(examples[op]) });
for (const op of Object.keys(examples))
    test('closed work variant ' + op, () => {
        const input = make(op);
        assert.equal(canonicalJson(validateWorkItem(input)), canonicalJson(input));
        assert.equal(validateInput('dev_work', { apiVersion: 1, items: [input] }).waitMs, 0);
        for (const extra of [{ shell: 'echo unsafe' }, { environment: { TOKEN: 'secret' } }, { authorization: 'allow' }, { unknown: true }])
            assert.throws(() => validateWorkItem({ ...input, ...extra }), { code: 'INVALID_ARGUMENT' });
        for (const key of ['op', 'requestId']) {
            const copy = { ...input };
            delete copy[key];
            assert.throws(() => validateWorkItem(copy), { code: 'INVALID_ARGUMENT' });
        }
    });
test('published four-tool schemas are frozen, locally resolvable, and match their truthful annotations', () => {
    const ajv = new Ajv2020({ strict: true, strictRequired: false });
    for (const schema of Object.values(INPUT_SCHEMAS))
        assert.equal(ajv.validateSchema(schema), true);
    assert.equal(Object.keys(INPUT_SCHEMAS).length, 4);
    assert.match(INPUT_SCHEMA_DIGEST, /^sha256:[0-9a-f]{64}$/);
    for (const t of TOOL_INPUT_DESCRIPTORS) {
        assert.equal(t.annotations.readOnlyHint, t.name !== 'dev_work');
        assert.equal(t.annotations.destructiveHint, t.name === 'dev_work');
    }
    assert.throws(() => INPUT_SCHEMAS.dev_work.properties.extra = {});
    const sizes = schemaFootprint(TOOL_INPUT_DESCRIPTORS);
    assert.equal(sizes.tools.find(t => t.name === 'dev_work').maximumUnionWidth, 10);
    assert.equal(sizes.actualChatGPTUsability, 'not_run');
    assert.equal(INPUT_SCHEMAS.dev_context.$defs.item, undefined);
});
test('uint64 schema exactly matches the authoritative revision codec including boundaries', () => {
    const validate = new Ajv2020().compile(INPUT_SCHEMAS.dev_work.$defs.revision);
    const max = 18446744073709551615n;
    const values = ['0', '1', '01', '-1', '1.0', '1e2', max.toString(), (max + 1n).toString(), '9'.repeat(20), '0'.repeat(20)];
    for (let i = 0; i < 20; i++) {
        const power = 10n ** BigInt(i);
        for (const n of [power - 1n, power, power + 1n, max - power, max + power])
            if (n >= 0n)
                values.push(n.toString());
    }
    let seed = 17n;
    for (let i = 0; i < 256; i++) {
        seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 65n) - 1n);
        values.push(seed.toString());
    }
    for (const value of values) {
        let accepted = true;
        try {
            revision(value);
        }
        catch {
            accepted = false;
        }
        assert.equal(validate(value), accepted, value);
    }
    assert.equal(validate(1), false);
});
test('context defaults and pinned requirement are deterministic without mutating caller data', () => {
    const input = { apiVersion: 1 };
    assert.deepEqual(validateInput('dev_context', input), { apiVersion: 1, repository: 'self', freshness: 'current' });
    assert.deepEqual(input, { apiVersion: 1 });
    assert.throws(() => validateInput('dev_context', { apiVersion: 1, freshness: 'pinned' }));
    assert.equal(validateInput('dev_context', { apiVersion: 1, freshness: 'pinned', snapshotId: 's1' }).snapshotId, 's1');
    for (const bad of [{ apiVersion: '1' }, { apiVersion: 1, paths: ['src'] }, { apiVersion: 1, repository: '$new' }])
        assert.throws(() => validateInput('dev_context', bad));
});
test('all five read forms, targets, defaults and scope-mixing rejection', () => {
    const target = { snapshotId: 's1', freshness: 'current' };
    const read = validateInput('dev_read', { apiVersion: 1, target, queries: [{ kind: 'list', path: '' }, { kind: 'search', paths: ['src'], literal: 'x' }, { kind: 'file', path: 'src/x.mjs' }, { kind: 'diff', baseSnapshotId: 's1' }] });
    assert.equal(read.maxReturnBytes, 262144);
    assert.equal(read.queries[0].limit, 256);
    assert.equal(read.queries[1].caseSensitive, true);
    assert.equal(read.queries[2].encoding, 'utf8');
    assert.equal(read.queries[2].maxBytes, 65536);
    assert.throws(() => validateInput('dev_read', { apiVersion: 1, target, queries: [{ kind: 'artifact', startByte: 0, maxBytes: 1 }] }));
    const artifact = { actionId: 'a1', artifactId: 'log1' };
    assert.equal(validateInput('dev_read', { apiVersion: 1, target: artifact, queries: [{ kind: 'artifact', startByte: 0, maxBytes: 65536 }] }).queries.length, 1);
    assert.throws(() => validateInput('dev_read', { apiVersion: 1, target: artifact, queries: [{ kind: 'file', path: 'secret' }] }));
    assert.throws(() => validateInput('dev_read', { apiVersion: 1, target: { ...target, workId: 'w1', generation: '0' }, queries: [{ kind: 'list', path: '' }] }));
    assert.equal(validateInput('dev_read', { apiVersion: 1, target: { workId: 'w1', generation: '3' }, queries: [{ kind: 'file', path: 'x' }] }).target.generation, '3');
});
test('all observation selectors are exact, bounded and read-only input', () => {
    for (const selector of [{ workIds: ['w1'], afterRevision: '0' }, { actionIds: ['a1'] }, { requestIds: ['r1'] }, { open: true }, { runtime: true }]) {
        const got = validateInput('dev_observe', { apiVersion: 1, selector });
        assert.equal(got.waitMs, 0);
        assert.equal(got.limit, 32);
        assert.equal(got.repository, 'self');
    }
    for (const selector of [{ open: false }, { runtime: true, open: true }, { workIds: [] }, { workIds: Array(65).fill('w') }, { open: true, afterRevision: '0' }])
        assert.throws(() => validateInput('dev_observe', { apiVersion: 1, selector }));
});
test('no coercion, excess arrays, object fields, body prefix acceptance or eight-slot maximum', () => {
    for (const n of [1, 8, 16, 32, 64])
        assert.equal(validateInput('dev_work', { apiVersion: 1, items: Array.from({ length: n }, (_, i) => make('create', 'r' + i)) }).items.length, n);
    for (const n of [0, 65])
        assert.throws(() => validateInput('dev_work', { apiVersion: 1, items: Array(n).fill(make('create')) }));
    for (const waitMs of [-1, 20001, '0', 1.5])
        assert.throws(() => validateInput('dev_work', { apiVersion: 1, items: [make('create')], waitMs }));
    for (const changes of [{ objective: 'x'.repeat(4097) }, { initialEdits: Array(257).fill(edits[0]) }])
        assert.throws(() => validateWorkItem({ ...make('create'), ...changes }));
    const large = { ...make('run'), parameters: 'x'.repeat(MAX_REQUEST_BYTES) };
    assert.throws(() => validateWorkItem(large), { code: 'LIMIT_EXCEEDED' });
    assert.throws(() => validateWorkItem({ ...make('run'), parameters: { unsafe: 1.1 } }));
    assert.throws(() => validateWorkItem({ ...make('edit'), edits: [{ ...edits[0], shell: 'run' }] }));
});
test('whole-schema rejection is not used as envelope-wide admission failure', async () => {
    const items = Array.from({ length: 8 }, (_, i) => make('create', 'r' + i));
    items[3].unexpected = 'malformed';
    assert.throws(() => validateInput('dev_work', { apiVersion: 1, items }), { code: 'INVALID_ARGUMENT' });
    const authorized = [], admitted = [];
    const result = await admitWorkBatch({ subject: 'trusted' }, { apiVersion: 1, items }, async (context, item) => { assert.equal(context.subject, 'trusted'); authorized.push(item.requestId); }, async (context, item) => { admitted.push(item.requestId); return { workId: 'work_' + item.requestId, actionId: null, state: 'open' }; });
    assert.equal(result.filter(r => r.ok).length, 7);
    assert.equal(result[3].error.code, 'INVALID_ARGUMENT');
    assert.equal(authorized.length, 7);
    assert.equal(admitted.length, 7);
    assert.equal(admitted.includes('r3'), false);
});
test('independent admission callbacks overlap and denial does not block siblings', async () => {
    let entered = 0;
    const allEntered = Promise.withResolvers(), release = Promise.withResolvers();
    const result = admitWorkBatch({}, { apiVersion: 1, items: Array.from({ length: 8 }, (_, i) => make('create', 'r' + i)) }, async () => { }, async (context, item) => { entered++; if (entered === 8)
        allEntered.resolve(); await release.promise; return { workId: item.requestId }; });
    await allEntered.promise;
    assert.equal(entered, 8);
    release.resolve();
    assert.equal((await result).length, 8);
    const calls = [];
    const mixed = await admitWorkBatch({}, { apiVersion: 1, items: [make('create', 'deny'), make('create', 'pass')] }, async (context, item) => { if (item.requestId === 'deny')
        throw new Dev2Error('FORBIDDEN'); }, async (context, item) => { calls.push(item.requestId); return { workId: 'w1' }; });
    assert.equal(mixed[0].error.code, 'FORBIDDEN');
    assert.equal(mixed[1].ok, true);
    assert.deepEqual(calls, ['pass']);
});
test('batch adapter owns no dedup cache: domain lookup follows authorization on every retry', async () => {
    const retained = new Map(), order = [];
    let writes = 0, allowed = true;
    const authorize = async (context, item) => { order.push('authorize'); if (!allowed)
        throw new Dev2Error('FORBIDDEN'); };
    const admit = async (context, item) => { order.push('lookup'); if (retained.has(item.requestId))
        return retained.get(item.requestId); writes++; const receipt = { workId: 'w1', actionId: 'a1', revision: '1', state: 'queued' }; retained.set(item.requestId, receipt); return receipt; };
    const request = { apiVersion: 1, items: [make('integrate', 'r1')], waitMs: 0 };
    const first = await admitWorkBatch({}, request, authorize, admit);
    const retry = await admitWorkBatch({}, { ...request, waitMs: 20000 }, authorize, admit);
    assert.deepEqual(retry, first);
    assert.equal(writes, 1);
    assert.deepEqual(order, ['authorize', 'lookup', 'authorize', 'lookup']);
    allowed = false;
    const revoked = await admitWorkBatch({}, request, authorize, admit);
    assert.equal(revoked[0].error.code, 'FORBIDDEN');
    assert.equal(order.at(-1), 'authorize');
});
test('raw or provider exceptions never leak secret text; impossible non-JSON callbacks fail closed', async () => {
    const result = await admitWorkBatch({}, { apiVersion: 1, items: [null, make('create', 'r1'), make('create', 'r2')] }, async () => { }, async (context, item) => { if (item.requestId === 'r1')
        throw new Error('secret-token'); return undefined; });
    assert.equal(result.every(r => !r.ok), true);
    assert.equal(JSON.stringify(result).includes('secret-token'), false);
});
