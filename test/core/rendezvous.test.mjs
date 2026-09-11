import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestRendezvous, DeliveryUnavailable } from '../../src/transport/rendezvous.mjs';
import { canonicalJson } from '../../src/contracts/canonical.mjs';
const request = (id = 'same-intent') => ({ tool: 'dev_work', arguments: { apiVersion: 1, items: [{ op: 'create', requestId: id }] }, assertion: 'signed.fixture.assertion' });
const reply = (frame, body = { apiVersion: 1, ok: true }) => JSON.stringify({ v: 1, connectionId: frame.connectionId, correlationId: frame.correlationId, body });
const unavailable = delivery => e => e instanceof DeliveryUnavailable && e.code === 'EXECUTION_UNAVAILABLE' && e.delivery === delivery && e.sameRequest === true;
test('offline requests are not sent and create no retained transport work', async () => {
    const r = new RequestRendezvous();
    await assert.rejects(() => r.request(request()), unavailable('not_sent'));
    assert.deepEqual(r.snapshot(), { connected: false, pending: 0, retainedBytes: 0 });
});
for (const count of [1, 8, 16, 32])
    test('independent routing at configurable count ' + count, async () => {
        const frames = [], r = new RequestRendezvous({ maxPending: count });
        const connection = r.attach(s => frames.push(JSON.parse(s)));
        const promises = Array.from({ length: count }, (_, i) => r.request(request('r' + i)));
        assert.equal(frames.length, count);
        assert.equal(r.snapshot().pending, count);
        assert.equal(new Set(frames.map(f => f.correlationId)).size, count);
        for (const [i, f] of frames.entries())
            assert.equal(f.body.arguments.items[0].requestId, 'r' + i);
        for (const f of [...frames].reverse())
            assert.equal(r.receive(connection, reply(f, { logicalId: f.body.arguments.items[0].requestId })), true);
        assert.deepEqual((await Promise.all(promises)).map(x => x.logicalId), Array.from({ length: count }, (_, i) => 'r' + i));
        assert.equal(r.snapshot().retainedBytes, 0);
        r.dispose();
    });
test('reconnect rejects uncertain observations and fences both old replies and late socket closes', async () => {
    const frames = [], r = new RequestRendezvous();
    const old = r.attach(s => frames.push(JSON.parse(s))), pending = r.request(request());
    const rejected = assert.rejects(pending, unavailable('unknown'));
    const fresh = r.attach(s => frames.push(JSON.parse(s)));
    await rejected;
    assert.notEqual(old, fresh);
    const next = r.request(request());
    assert.equal(r.disconnect(old), false);
    assert.equal(r.receive(old, reply(frames[0])), false);
    assert.equal(r.snapshot().pending, 1);
    assert.equal(r.receive(fresh, reply(frames[1], { sameRequestId: frames[1].body.arguments.items[0].requestId })), true);
    assert.equal((await next).sameRequestId, 'same-intent');
    r.dispose();
});
test('duplicate and foreign correlation replies cannot complete a different live request', async () => {
    const frames = [], r = new RequestRendezvous();
    const c = r.attach(s => frames.push(JSON.parse(s)));
    const a = r.request(request('a')), b = r.request(request('b'));
    assert.equal(r.receive(c, reply({ ...frames[0], correlationId: 'unknown' })), false);
    assert.equal(r.receive(c, reply(frames[0], { which: 'a' })), true);
    assert.equal(r.receive(c, reply(frames[0], { which: 'forged' })), false);
    assert.equal(r.snapshot().pending, 1);
    r.receive(c, reply(frames[1], { which: 'b' }));
    assert.equal((await a).which, 'a');
    assert.equal((await b).which, 'b');
    r.dispose();
});
test('count and aggregate byte limits reject rather than creating another queue', async () => {
    const frames = [], r = new RequestRendezvous({ maxPending: 1 });
    const c = r.attach(s => frames.push(JSON.parse(s)));
    const a = r.request(request());
    await assert.rejects(() => r.request(request('second')), { code: 'CAPACITY_REJECTED' });
    assert.equal(frames.length, 1);
    r.receive(c, reply(frames[0]));
    await a;
    r.dispose();
    const size = Buffer.byteLength(canonicalJson(request())), q = new RequestRendezvous({ maxRetainedBytes: size });
    const xs = [];
    const qc = q.attach(s => xs.push(JSON.parse(s)));
    const p = q.request(request());
    await assert.rejects(() => q.request(request()), { code: 'CAPACITY_REJECTED' });
    assert.equal(xs.length, 1);
    q.receive(qc, reply(xs[0]));
    await p;
    assert.equal(q.snapshot().retainedBytes, 0);
    q.dispose();
});
test('oversized request and unsupported proxy operation are rejected before send', async () => {
    let sends = 0;
    const r = new RequestRendezvous({ maxRequestBytes: 512 });
    r.attach(() => sends++);
    await assert.rejects(() => r.request({ ...request(), arguments: { content: 'x'.repeat(513) } }), { code: 'LIMIT_EXCEEDED' });
    await assert.rejects(() => r.request({ ...request(), tool: 'shell.run' }), { code: 'INVALID_ARGUMENT' });
    assert.equal(sends, 0);
    r.dispose();
});
test('malformed reply is bounded and cannot change another observation', async () => {
    const frames = [], r = new RequestRendezvous({ maxResponseBytes: 128 });
    const c = r.attach(s => frames.push(JSON.parse(s)));
    const p = r.request(request());
    for (const text of ['{"v":1,"v":2}', '[]', reply({ ...frames[0], connectionId: 'foreign' }), JSON.stringify({ ...JSON.parse(reply(frames[0])), extra: 1 })])
        assert.throws(() => r.receive(c, text), { code: 'INVALID_ARGUMENT' });
    assert.throws(() => r.receive(c, reply(frames[0], { data: 'x'.repeat(129) })), { code: 'LIMIT_EXCEEDED' });
    assert.equal(r.snapshot().pending, 1);
    r.receive(c, reply(frames[0], { ok: true }));
    assert.equal((await p).ok, true);
    r.dispose();
});
test('send exceptions are uncertain, redacted and never automatically retried', async () => {
    let sends = 0;
    const r = new RequestRendezvous();
    r.attach(() => { sends++; throw Error('credential-secret'); });
    await assert.rejects(() => r.request(request()), e => unavailable('unknown')(e) && !JSON.stringify(e).includes('credential-secret') && !e.message.includes('credential-secret'));
    assert.equal(sends, 1);
    assert.equal(r.snapshot().retainedBytes, 0);
    r.dispose();
});
test('deadline expiry rejects without cancelling a logical work or retrying it', async () => {
    const frames = [], r = new RequestRendezvous({ deadlineMs: 10 });
    const c = r.attach(s => frames.push(JSON.parse(s)));
    await assert.rejects(() => r.request(request()), unavailable('unknown'));
    assert.equal(frames.length, 1);
    assert.equal(r.receive(c, reply(frames[0])), false);
    r.dispose();
});
test('late reply cannot win merely because the event loop delayed a deadline callback', async () => {
    let now = 1000;
    const frames = [], r = new RequestRendezvous({ deadlineMs: 10000 }, () => now);
    const c = r.attach(s => frames.push(JSON.parse(s)));
    const p = r.request(request());
    const rejected = assert.rejects(p, unavailable('unknown'));
    now = 11000;
    assert.equal(r.receive(c, reply(frames[0])), false);
    await rejected;
    assert.equal(r.snapshot().pending, 0);
    r.dispose();
});
test('synchronous response callback is safe and caller mutation cannot alter a sent intent', async () => {
    const r = new RequestRendezvous();
    let c;
    let sent;
    c = r.attach(text => { sent = JSON.parse(text); r.receive(c, reply(sent, { result: 'done' })); });
    const input = request();
    const p = r.request(input);
    input.arguments.items[0].requestId = 'changed';
    assert.equal((await p).result, 'done');
    assert.equal(sent.body.arguments.items[0].requestId, 'same-intent');
    assert.equal(r.snapshot().pending, 0);
    r.dispose();
});
test('invalid routing policies do not truncate, round or create an eight-slot semantic limit', () => {
    for (const policy of [{ deadlineMs: 2147483648 }, { maxPending: 0 }, { maxRetainedBytes: NaN }, { maxRequestBytes: 1.5 }])
        assert.throws(() => new RequestRendezvous(policy), { code: 'INVALID_ARGUMENT' });
});
