import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import test_http
from tdev.common import Fault, atomic_write, canonical, digest
from tdev.diagnostic_policy import DiagnosticsPolicy
from tdev.diagnostics import export, control
from tdev.server import make_server


def until(predicate, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.01)
    raise AssertionError('bounded observation deadline exceeded')


class PolicyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)/'diagnostics'
        self.source = Path(__file__).resolve().parents[1]
        self.now = 100.0
        self.policies = []
        self.policy = self.create()

    def create(self):
        policy = DiagnosticsPolicy(self.directory, self.source,
                                   {'traceSeconds': 2, 'slowSeconds': 1, 'cooldownSeconds': 10},
                                   clock=lambda: self.now)
        self.policies.append(policy)
        return policy

    def tearDown(self):
        for policy in self.policies:
            policy.close()
        self.tmp.cleanup()

    def test_watch_has_no_event_stream_and_automatic_capture_expires_without_new_calls(self):
        p = self.policy
        until(lambda: p.recorder.snapshot()['counts']['sink_written'] >= 1)
        p.recorder.bind(1, 'alice')
        p.recorder.emit(1, 'rpc_parsed', tool='tdev_operation')
        p.recorder.emit(1, 'dispatch_started')
        self.assertIsNone(p.recorder.payload_tag(b'private-output'))
        self.assertEqual(1, p.recorder.snapshot()['counts']['sink_written'])
        self.now += 2
        until(lambda: p._mode == 'trace')
        row = p.inspect('alice')['incidents'][0]
        self.assertEqual('slow_dispatch', row['reason'])
        self.assertEqual('queued', row['delivery'])
        self.assertEqual([], p.inspect('bob')['incidents'])
        self.now += 3
        until(lambda: p._mode == 'watch')
        self.assertEqual('expired', p.inspect('alice')['incidents'][0]['capture'])
        self.assertEqual(1, len(p.inspect('alice')['incidents']))

    def test_manual_replay_stop_and_acknowledgement_are_scoped_and_idempotent(self):
        p = self.policy
        args = {'action': 'activate', 'requestId': 'private-request-id', 'seconds': 2}
        first = p.tool('alice', args)
        self.now += 1
        replay = p.tool('alice', args)
        self.assertEqual(first['expiresAt'], replay['expiresAt'])
        with self.assertRaises(Fault):
            p.tool('alice', {**args, 'seconds': 3})
        incident = first['incidents'][0]['id']
        self.assertEqual([], p.offers('bob'))
        offered = p.offers('alice')
        self.assertEqual('offered', offered[0]['delivery'])
        self.assertEqual([], p.offers('alice'))
        with self.assertRaises(Fault):
            p.tool('bob', {'action': 'acknowledge', 'incidentId': incident})
        ack = p.tool('alice', {'action': 'acknowledge', 'incidentId': incident})
        self.assertEqual('acknowledged', ack['incidents'][0]['delivery'])
        self.assertEqual([], p.offers('alice'))
        p.tool('alice', {'action': 'stop'})
        self.assertEqual('watch', p.tool('alice', args)['mode'])
        p.recorder.bind(1, 'alice')
        p.recorder.emit(1, 'dispatch_failed')
        self.assertEqual('watch', p.mode)  # Explicit stop suppresses immediate retrigger.

    def test_restart_keeps_pending_and_acknowledged_incidents_without_resuming_capture(self):
        p = self.policy
        args = {'action': 'activate', 'requestId': 'restart-id', 'seconds': 2}
        row = p.tool('alice', args)['incidents'][0]
        p.offers('alice')
        until(lambda: not p.inspect('alice')['storagePending'])
        saved = (self.directory/'incidents.json').read_bytes()
        p.close()
        self.policies.remove(p)
        atomic_write(self.directory/'incidents.json', saved)  # Simulate last crash-durable active state.
        restored = self.create()
        state = restored.tool('alice', args)
        self.assertEqual('watch', state['mode'])
        self.assertEqual('interrupted', state['incidents'][0]['capture'])
        restored.OFFER_INTERVAL = 0
        self.assertEqual(row['id'], restored.offers('alice')[0]['id'])
        restored.tool('alice', {'action': 'acknowledge', 'incidentId': row['id']})
        until(lambda: not restored.inspect('alice')['storagePending'])
        report = export(self.directory, Path(self.tmp.name)/'export')
        self.assertIn('incidents.json', report['files'])
        data = (self.directory/'incidents.json').read_text()
        self.assertNotIn('restart-id', data)
        self.assertNotIn('alice', data)
        restored.close()
        self.policies.remove(restored)
        again = self.create()
        self.assertEqual([], again.offers('alice'))
        self.assertEqual('acknowledged', again.inspect('alice')['incidents'][0]['delivery'])

    def test_blocked_incident_storage_does_not_block_expiry_inspection_or_ack(self):
        entered, release = threading.Event(), threading.Event()
        original = atomic_write
        def blocked(*args, **kwargs):
            entered.set()
            release.wait(5)
            return original(*args, **kwargs)
        with patch('tdev.diagnostic_policy.atomic_write', blocked):
            try:
                row = self.policy.tool('alice', {'action': 'activate', 'requestId': 'blocked'})['incidents'][0]
                self.assertTrue(entered.wait(2))
                self.now += 3
                until(lambda: self.policy._mode == 'watch')
                state = self.policy.tool('alice', {'action': 'acknowledge', 'incidentId': row['id']})
                self.assertTrue(state['storagePending'])
                self.assertEqual('expired', state['incidents'][0]['capture'])
            finally:
                release.set()
        until(lambda: not self.policy.inspect('alice')['storagePending'])
        saved = json.loads((self.directory/'incidents.json').read_bytes())
        self.assertEqual('acknowledged', saved['incidents'][0]['delivery'])

    def test_local_control_bounded_retention_and_failure_persistence(self):
        value = control(self.directory, {'action': 'activate', 'requestId': 'local', 'seconds': 2})
        self.assertEqual('trace', value['mode'])
        self.assertEqual('watch', control(self.directory, {'action': 'stop'})['mode'])
        self.assertIn('error', control(self.directory, {'action': 'activate', 'requestId': 'bad', 'seconds': 301}))
        self.assertIn('error', control(self.directory, {'action': 'exec', 'command': 'never-execute'}))
        for n in range(35):
            self.policy.tool('alice', {'action': 'activate', 'requestId': str(n)})
        self.assertEqual(32, len(self.policy._incident))
        self.assertGreater(self.policy.inspect('alice')['evicted'], 0)
        with patch('tdev.diagnostic_policy.atomic_write', side_effect=OSError('private failure')):
            self.policy.tool('alice', {'action': 'stop'})
            until(lambda: self.policy.inspect('alice')['storageErrors'] > 0)
            self.assertEqual('watch', self.policy.mode)

    def test_manual_capture_from_off_returns_to_off_without_collecting_or_retriggering(self):
        p = DiagnosticsPolicy(Path(self.tmp.name)/'off', self.source,
                              {'mode': 'off', 'traceSeconds': 1}, clock=lambda: self.now)
        self.policies.append(p)
        p.tool('alice', {'action': 'activate', 'requestId': 'off-capture'})
        self.assertEqual('trace', p.mode)
        self.now += 2
        until(lambda: p._mode == 'off')
        count = p.recorder.snapshot()['counts']['emitted']
        p.recorder.bind(10, 'alice')
        p.recorder.emit(10, 'dispatch_failed')
        self.assertEqual('off', p.mode)
        self.assertEqual(count, p.recorder.snapshot()['counts']['emitted'])

    def test_corrupt_state_is_preserved_and_reported(self):
        self.policy.close()
        self.policies.remove(self.policy)
        atomic_write(self.directory/'incidents.json', b'{bad-private-state')
        p = self.create()
        self.assertGreater(p.inspect('alice')['storageErrors'], 0)
        p.tool('alice', {'action': 'activate', 'requestId': 'new'})
        p.close()
        self.assertEqual(b'{bad-private-state', (self.directory/'incidents.json').read_bytes())


class DiagnosticHTTPTest(unittest.TestCase):
    def setUp(self):
        self.fixture = test_http.HTTPTest()
        self.fixture.setUp()
        self.original = self.fixture.server
        self.root = Path(self.fixture.tmp.name)
        self.policies = []
        self.fixture.repo.config['principals']['bob'] = {'tokenHash': digest(b'bob-secret'), 'repos': {}}
        def factory():
            p = DiagnosticsPolicy(self.root/'diagnostics', Path(__file__).resolve().parents[1],
                                  {'traceSeconds': 2, 'slowSeconds': 1})
            self.policies.append(p)
            return p.recorder
        self.factory = factory
        self.server = make_server(self.fixture.controller, diagnostic_factory=factory)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.fixture.server = self.server

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        for p in self.policies:
            p.close()
        self.fixture.server = self.original
        self.fixture.tearDown()

    def call(self, args, token='alice-secret'):
        return self.fixture.request('tools/call', {'name':'tdev_diagnostics','arguments':args},
                                    headers={'Authorization':'Bearer '+token})[1]['result']

    def test_lazy_activation_grants_wire_notifications_and_principal_scope(self):
        self.assertEqual('off', self.call({'action':'inspect'})['structuredContent']['result']['mode'])
        args = {'action':'activate','requestId':'activate-one','seconds':2}
        self.assertEqual('PERMISSION_DENIED', self.call(args)['structuredContent']['error']['code'])
        self.assertFalse((self.root/'diagnostics').exists())
        self.fixture.repo.config['principals']['alice']['diagnostics'] = True
        result = self.call(args)
        self.assertFalse(result['isError'])
        self.assertEqual(1, len(self.policies))
        row = result['_meta']['io.tdev/diagnostics'][0]
        self.assertIn(row['id'], result['content'][1]['text'])
        self.assertEqual([], self.call({'action':'inspect'},'bob-secret')['structuredContent']['result']['incidents'])
        denied = self.call({'action':'acknowledge','incidentId':row['id']},'bob-secret')
        self.assertEqual('INCIDENT_NOT_FOUND', denied['structuredContent']['error']['code'])
        ack = self.call({'action':'acknowledge','incidentId':row['id']})
        self.assertNotIn('io.tdev/diagnostics', ack['_meta'])
        self.assertEqual('acknowledged', ack['structuredContent']['result']['incidents'][0]['delivery'])
        from jsonschema import Draft202012Validator
        from tdev.server import expanded
        schema = self.fixture.controller.schema
        output = next(t['outputSchema'] for t in schema['x-tools'] if t['name']=='tdev_diagnostics')
        Draft202012Validator(expanded(schema, output)).validate(ack['structuredContent'])
        self.fixture.repo.config['principals']['alice']['diagnostics'] = False
        self.assertEqual('PERMISSION_DENIED', self.call({'action':'stop'})['structuredContent']['error']['code'])

    def test_dispatch_failure_activates_and_next_response_offers_without_changing_effect(self):
        self.fixture.repo.config['principals']['alice']['diagnostics'] = True
        self.call({'action':'activate','requestId':'init'})
        row = self.policies[0].inspect('alice')['incidents'][0]
        self.call({'action':'acknowledge','incidentId':row['id']})
        p = self.policies[0]
        p.tool('alice', {'action':'stop'})
        p._silence_until = 0
        original = self.fixture.controller.call
        self.fixture.controller.call = lambda *_: (_ for _ in ()).throw(RuntimeError('private-failure-body'))
        try:
            code, response = self.fixture.request('tools/call', {'name':'tdev_operation','arguments':{'action':'status','operationId':'missing'}})
        finally:
            self.fixture.controller.call = original
        self.assertEqual(200, code)
        self.assertEqual(-32603, response['error']['code'])
        self.assertEqual('trace', p.mode)
        result = self.call({'action':'inspect'})
        self.assertEqual('dispatch_failed', result['_meta']['io.tdev/diagnostics'][0]['reason'])
        self.assertNotIn('private-failure-body', json.dumps(result))
        from tdev.codex_bridge import Bridge
        bridge = Bridge(f'http://127.0.0.1:{self.server.server_port}/mcp', 'alice-secret')
        p.OFFER_INTERVAL = 0
        wrapped = bridge.handle({'jsonrpc':'2.0','id':7,'method':'tools/call','params':{'name':'tdev_diagnostics','arguments':{'action':'inspect'}}})
        self.assertIn('io.tdev/diagnostics', wrapped['result']['_meta'])
        self.assertGreater(len(wrapped['result']['content']), 1)


if __name__ == '__main__':
    unittest.main()
