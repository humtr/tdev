import { canonicalJson } from '../../src/contracts/canonical.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODERN_VERSION as V, LEGACY_VERSION as L, ProtocolError, decodeMessage, checkEndpoint, decodeNameHeader, completeMessage, discovery, initialization, toolPayload, errorResponse } from '../../src/mcp/protocol.mjs';
const server = { name: 'dev-2-fixture', version: '0.0.0' };
function modern(method = 'tools/list', fields = {}) { return { jsonrpc: '2.0', id: 1, method, params: { ...fields, _meta: { 'io.modelcontextprotocol/protocolVersion': V, 'io.modelcontextprotocol/clientCapabilities': {} } } }; }
function headers(message) { const h = new Headers({ 'mcp-protocol-version': V, 'mcp-method': message.method }); if (message.method === 'tools/call')
    h.set('mcp-name', message.params.name); return h; }
function decode(message, h = headers(message)) { return decodeMessage(JSON.stringify(message), h); }
function fails(fn, code, status = 400) { assert.throws(fn, e => e instanceof ProtocolError && e.code === code && e.status === status); }
test('modern discovery and tools need no session or initialization', () => {
    const m = decode(modern('server/discover'));
    assert.equal(m.era, 'modern');
    assert.equal(m.version, V);
    const r = completeMessage(m, discovery(server), server);
    assert.deepEqual(r.result.supportedVersions, [V, L]);
    assert.equal(r.result.resultType, 'complete');
    assert.equal(canonicalJson(r.result._meta['io.modelcontextprotocol/serverInfo']), canonicalJson(server));
    const next = modern();
    const h = headers(next);
    h.set('mcp-session-id', 'untrusted-old-session');
    h.set('last-event-id', 'old');
    assert.equal(decode(next, h).method, 'tools/list');
});
test('legacy initialize, initialized, subsequent calls and explicit version agree without minting a work identity', () => {
    const init = { jsonrpc: '2.0', id: 'init', method: 'initialize', params: { protocolVersion: L, capabilities: {}, clientInfo: { name: 'fixture', version: '1' } } };
    const m = decode(init, new Headers());
    const result = completeMessage(m, initialization(server), server);
    assert.equal(result.result.protocolVersion, L);
    assert.equal(result.result.resultType, undefined);
    const h = new Headers({ 'mcp-protocol-version': L });
    const n = decode({ jsonrpc: '2.0', method: 'notifications/initialized' }, h);
    assert.equal(n.notification, true);
    fails(() => completeMessage(n, {}, server), -32600);
    assert.equal(decode({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, h).era, 'legacy');
});
test('missing modern metadata differs from missing or disagreeing mirrored headers', () => {
    fails(() => decode({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }), -32602);
    const m = modern();
    for (const name of ['mcp-protocol-version', 'mcp-method']) {
        const h = headers(m);
        h.delete(name);
        fails(() => decode(m, h), -32020);
    }
    const h = headers(m);
    h.set('mcp-method', 'tools/call');
    fails(() => decode(m, h), -32020);
    const h2 = headers(m);
    h2.set('mcp-protocol-version', L);
    fails(() => decode(m, h2), -32020);
});
test('unknown modern version is a negotiation error, never an implicit legacy downgrade', () => {
    const m = modern();
    m.params._meta['io.modelcontextprotocol/protocolVersion'] = '2029-01-01';
    const h = headers(m);
    h.set('mcp-protocol-version', '2029-01-01');
    assert.throws(() => decode(m, h), e => e.code === -32022 && e.data.requested === '2029-01-01' && e.data.supported.includes(V));
});
test('tool-name routing headers match exact decoded UTF-8 and cannot hide a different body', () => {
    const m = modern('tools/call', { name: 'dev_work', arguments: { apiVersion: 1, items: [] } });
    assert.equal(decode(m).params.name, 'dev_work');
    const h = headers(m);
    h.set('MCP-NAME', '=?base64?' + Buffer.from('dev_work').toString('base64') + '?=');
    assert.equal(decode(m, h).params.name, 'dev_work');
    h.set('mcp-name', 'dev_read');
    fails(() => decode(m, h), -32020);
    h.delete('mcp-name');
    fails(() => decode(m, h), -32020);
    assert.equal(decodeNameHeader('=?base64?' + Buffer.from('\u03bb').toString('base64') + '?='), '\u03bb');
    for (const invalid of ['=?base64?%%%?=', '=?base64?/w==?=', ' padded '])
        fails(() => decodeNameHeader(invalid), -32020);
});
test('unknown methods produce HTTP 404/-32601 rather than success or generic 400', () => { fails(() => decode(modern('unimplemented')), -32601, 404); fails(() => decode({ jsonrpc: '2.0', id: 1, method: 'server/discover' }, new Headers({ 'mcp-protocol-version': L })), -32601, 404); });
test('batch JSON-RPC, duplicate fields, malformed UTF-8 and null IDs fail before effects', () => {
    fails(() => decodeMessage('[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]', new Headers()), -32600);
    fails(() => decodeMessage('{"jsonrpc":"2.0","id":1,"id":2,"method":"tools/list"}', new Headers()), -32700);
    fails(() => decodeMessage(Buffer.from([0xff]), new Headers()), -32700);
    fails(() => decode({ ...modern(), id: null }), -32600);
    fails(() => decode({ ...modern(), result: {} }), -32600);
    fails(() => decodeMessage(' '.repeat(1048577), new Headers()), -32600, 413);
});
test('modern notifications and RPC responses are not silently accepted', () => {
    const m = modern('notifications/cancelled', { requestId: 1 });
    delete m.id;
    fails(() => decode(m), -32601, 404);
    fails(() => decodeMessage(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), new Headers()), -32600);
});
test('legacy cancellation decoding never mutates or fabricates durable work cancellation', () => {
    const message = { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1, reason: 'stop waiting' } };
    const m = decode(message, new Headers({ 'mcp-protocol-version': L }));
    assert.equal(m.method, 'notifications/cancelled');
    assert.equal(m.notification, true);
    assert.equal(m.params.requestId, 1);
    assert.equal('workId' in m, false);
});
test('tool-level failure is a complete tool result in both wire eras, not a JSON-RPC error', () => {
    const envelope = { apiVersion: 1, ok: false, error: { code: 'STALE_CONTEXT', message: 'Stale', retry: { sameRequest: false, afterMs: null }, facts: {} } };
    for (const era of ['modern', 'legacy']) {
        const m = { ...decode(modern('tools/call', { name: 'dev_read', arguments: {} })), era };
        const out = completeMessage(m, toolPayload(envelope), server);
        assert.equal(out.error, undefined);
        assert.equal(out.result.isError, true);
        assert.deepEqual(JSON.parse(out.result.content[0].text), envelope);
        assert.equal(canonicalJson(out.result.structuredContent), canonicalJson(envelope));
    }
});
test('endpoint guards reject hostile origin/host and proxy claims independently of method', () => {
    const config = { origin: 'https://dev2.example.invalid', allowedOrigins: ['https://chatgpt.com'] };
    checkEndpoint(config.origin + '/mcp', new Headers(), config);
    checkEndpoint(config.origin + '/mcp', new Headers({ origin: 'https://chatgpt.com', host: 'dev2.example.invalid' }), config);
    for (const h of [{ origin: 'null' }, { origin: 'https://attacker.invalid' }, { host: 'attacker.invalid' }, { origin: 'https://chatgpt.com/path' }])
        fails(() => checkEndpoint(config.origin + '/mcp', new Headers(h), config), -32600, 403);
    for (const url of ['http://dev2.example.invalid/mcp', 'https://dev2.example.invalid/other', 'https://evil@dev2.example.invalid/mcp', 'https://dev2.example.invalid/mcp?redirect=1'])
        fails(() => checkEndpoint(url, new Headers({ 'x-forwarded-host': 'dev2.example.invalid' }), config), -32600, 403);
});
test('unknown error and peer data cannot replace codec-owned discriminators or leak credentials', () => {
    const unknown = errorResponse(new Error('token-secret'));
    assert.equal(unknown.status, 500);
    assert.equal(unknown.body.id, undefined);
    assert.equal(JSON.stringify(unknown).includes('token-secret'), false);
    assert.equal(errorResponse(new ProtocolError(-32700, 400, 'Parse error'), null, 'legacy').body.id, null);
    assert.equal(errorResponse(new ProtocolError(-32602, 400, 'Invalid parameters'), 4).body.id, 4);
    fails(() => completeMessage(decode(modern()), { resultType: 'input_required' }, server), -32603, 500);
    fails(() => toolPayload({ ok: true }), -32603, 500);
});
test('malformed parameter and header responses preserve a readable request id without reparsing', () => {
    for (const [m, h, code] of [[{ ...modern(), id: 'readable', params: null }, headers(modern()), -32602], [modern(), new Headers({ 'mcp-protocol-version': V }), -32020]]) {
        let captured;
        try {
            decode(m, h);
        }
        catch (e) {
            captured = e;
        }
        const out = errorResponse(captured);
        assert.equal(out.body.id, m.id);
        assert.equal(out.body.error.code, code);
    }
    fails(() => decode({ ...modern(), params: { _meta: null } }), -32602);
    fails(() => decode({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, new Headers({ 'mcp-protocol-version': '2099-01-01' })), -32022);
});
test('allowed-origin configuration cannot authorize a null or wildcard origin', () => {
    for (const allowedOrigins of [['null'], ['*'], ['https://chatgpt.com/path']])
        fails(() => checkEndpoint('https://dev2.example.invalid/mcp', new Headers(), { origin: 'https://dev2.example.invalid', allowedOrigins }), -32600, 403);
});
