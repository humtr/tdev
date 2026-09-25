import http.client
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
        self.now += 16
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

    def test_fair_offers_backoff_exhaustion_and_ack_at_retention_bound(self):
        p = self.policy
        for n in range(32):
            p.tool('alice', {'action':'activate','requestId':str(n)})
        seen = set()
        for _ in range(12):
            seen.update(r['id'] for r in p.offers('alice'))
            self.now += 16
        self.assertEqual(32, len(seen))
        self.assertEqual([], p.offers('bob'))
        for _ in range(100):
            self.now += 301
            self.assertLessEqual(len(p.offers('alice')), 3)
        state = p.inspect('alice')
        self.assertTrue(all(r['offers'] == 8 and r['retry'] == 'exhausted' and r['nextOfferAt'] is None
                            for r in state['incidents']))
        self.assertEqual(32, state['summary']['exhausted'])
        self.assertEqual([], p.offers('alice'))
        p.tool('alice', {'action':'acknowledge','incidentId':state['incidents'][0]['id']})
        self.assertEqual(31, p.inspect('alice')['summary']['unacknowledged'])

    def test_offer_backoff_uses_elapsed_time_and_survives_future_wall_timestamp(self):
        p = self.policy
        p.tool('alice', {'action':'activate','requestId':'clock'})
        first = p.offers('alice')[0]
        with patch('tdev.diagnostic_policy.time.time', return_value=first['lastOfferedAt']+10000):
            self.assertEqual([], p.offers('alice'))
        self.now += 15
        self.assertEqual(2, p.offers('alice')[0]['offers'])
        self.now += 15
        self.assertEqual([], p.offers('alice'))  # Second delay is 30 seconds.
        until(lambda: not p.inspect('alice')['storagePending'])
        p.close(); self.policies.remove(p)
        with patch('tdev.diagnostic_policy.time.time', return_value=first['createdAt']-10000):
            restored = self.create()
            self.assertEqual([], restored.offers('alice'))
            self.now += 30
            self.assertEqual(3, restored.offers('alice')[0]['offers'])

    def test_summary_counts_suppressed_server_signals_and_report_replays_separately(self):
        p = self.policy
        for n in range(3):
            p.recorder.bind(n, 'alice')
            p.recorder.emit(n, 'dispatch_failed')
            p.recorder.tool_result(n, {'ok':False,'error':{'effect':'unknown'}})
            p.recorder.emit(n, 'http_finished')
        args = {'action':'report','requestId':'private-client-id','category':'visible_stall'}
        p.tool('alice', args); p.tool('alice', args)
        with self.assertRaises(Fault):
            p.tool('alice', {**args,'category':'call_limit'})
        state = p.tool('alice', {'action':'inspect','view':'summary'})
        self.assertEqual([], state['incidents'])
        self.assertEqual({'dispatch_failed':3,'tool_error':3,'uncertain_effect':3}, state['summary']['server'])
        self.assertEqual({'visible_stall':1}, state['summary']['reported'])
        self.assertEqual(3, state['summary']['retainedIncidents'])
        self.assertEqual({}, p.inspect('bob')['summary']['server'])
        until(lambda: not p.inspect('alice')['storagePending'])
        p.close(); self.policies.remove(p)
        restored = self.create()
        self.assertEqual(state['summary'], restored.inspect('alice')['summary'])
        restored.tool('alice', args)
        self.assertEqual({'visible_stall':1}, restored.inspect('alice')['summary']['reported'])
        self.assertNotIn('private-client-id', (self.directory/'incidents.json').read_text())

    def test_aggregation_is_bounded_and_old_incidents_upgrade_without_invented_counts(self):
        p = self.policy
        for n in range(35):
            p.recorder.bind(n, str(n))
            p.recorder.tool_result(n, {'ok':False})
            p.recorder.emit(n, 'http_finished')
        self.assertEqual(32, len(p._aggregate))
        self.assertEqual(3, p.inspect('0')['summary']['aggregationEvicted'])
        self.assertIsNone(p.inspect('0')['summary']['since'])
        p.tool('alice', {'action':'activate','requestId':'old'})
        row = p._incident[0]
        row['offers'] = 98; row['delivery'] = 'offered'; row['lastOfferedAt'] = time.time()
        p.close(); self.policies.remove(p)
        saved = json.loads((self.directory/'incidents.json').read_bytes())
        saved['schema'] = 1
        saved.pop('aggregates'); saved.pop('aggregateEvicted')
        atomic_write(self.directory/'incidents.json', canonical(saved))
        restored = self.create()
        result = restored.inspect('alice')
        self.assertEqual(98, result['incidents'][0]['offers'])
        self.assertEqual('exhausted', result['incidents'][0]['retry'])
        self.assertEqual({}, result['summary']['server'])
        self.assertEqual(0, result['storageErrors'])
        self.assertEqual([], restored.offers('alice'))


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

    def start_watch(self):
        self.fixture.repo.config['principals']['alice']['diagnostics'] = True
        self.call({'action':'activate','requestId':'boundary-init'})
        policy = self.policies[0]
        incident = policy.inspect('alice')['incidents'][0]['id']
        self.call({'action':'acknowledge','incidentId':incident})
        policy.tool('alice', {'action':'stop'})
        policy._silence_until = 0
        return policy

    def test_blocked_dispatch_is_observable_and_capture_expires_before_http_returns(self):
        p = self.start_watch()
        now = [100.0]
        p.clock = lambda: now[0]
        entered, release, completed = threading.Event(), threading.Event(), threading.Event()
        replies, failures = [], []
        original = self.fixture.controller.call

        def blocked(*args):
            entered.set()
            if not release.wait(5):
                raise AssertionError('test did not release dispatch')
            return original(*args)

        def request():
            try:
                replies.append(self.fixture.request('tools/call',
                    {'name':'tdev_task','arguments':{'action':'list'}}))
            except Exception as error:
                failures.append(error)
            finally:
                completed.set()

        with patch.object(self.fixture.controller, 'call', blocked):
            client = threading.Thread(target=request)
            client.start()
            try:
                self.assertTrue(entered.wait(2))
                now[0] += 1.1
                until(lambda: p.mode == 'trace')
                active = control(p.directory, {'action':'snapshot'})
                self.assertTrue(any(r['event'] == 'dispatch_started' for r in active['active']))
                incident = next(r for r in active['incidents'] if r['reason'] == 'slow_dispatch')
                self.assertEqual(('active', 'queued'), (incident['capture'], incident['delivery']))
                self.assertFalse(completed.is_set())
                now[0] += 3
                until(lambda: p.mode == 'watch')
                expired = control(p.directory, {'action':'snapshot'})
                row = next(r for r in expired['incidents'] if r['id'] == incident['id'])
                self.assertEqual(('expired', 'queued'), (row['capture'], row['delivery']))
                self.assertFalse(completed.is_set())  # No HTTP poll or response was needed.
            finally:
                release.set()
                client.join(5)
        self.assertFalse(client.is_alive())
        self.assertEqual([], failures)
        code, response = replies[0]
        self.assertEqual(200, code)
        self.assertTrue(response['result']['structuredContent']['ok'])
        offered = response['result']['_meta']['io.tdev/diagnostics'][0]
        self.assertEqual((incident['id'], 'expired', 'offered'),
                         (offered['id'], offered['capture'], offered['delivery']))

    def test_lost_response_after_commit_triggers_capture_without_repeating_effect(self):
        p = self.start_watch()
        args = {'name':'tdev_task','arguments':{'action':'open','requestId':'lost-response',
                'repo':'test','ref':'refs/heads/main','expectedHead':self.fixture.repo.head}}
        committed = []
        original_call = self.fixture.controller.call
        handler = self.server.RequestHandlerClass
        original_headers = handler.end_headers

        def remember(*values):
            result = original_call(*values)
            committed.append(result)
            return result

        class BrokenBody:
            def __init__(self, stream):
                self.stream = stream
            def write(self, data):
                raise BrokenPipeError('injected private disconnect')
            def __getattr__(self, name):
                return getattr(self.stream, name)

        def disconnect_after_headers(request):
            original_headers(request)
            request.wfile = BrokenBody(request.wfile)

        with patch.object(self.fixture.controller, 'call', remember), \
             patch.object(handler, 'end_headers', disconnect_after_headers):
            with self.assertRaises(http.client.IncompleteRead):
                self.fixture.request('tools/call', args)
            until(lambda: any(r['event'] == 'response_failed'
                              for r in p.recorder.snapshot()['recent']))
        self.assertEqual(1, len(committed))
        self.assertTrue(committed[0]['ok'])
        row = next(r for r in p.inspect('alice')['incidents'] if r['reason'] == 'response_failed')
        self.assertEqual(('trace', 'queued'), (p.mode, row['delivery']))
        events = p.recorder.snapshot()['recent']
        failure = next(r for r in events if r['event'] == 'response_failed')
        dispatch = next(r for r in events if r['event'] == 'dispatch_finished'
                        and r['request'] == failure['request'])
        self.assertTrue(dispatch['ok'])
        self.assertLess(dispatch['eventId'], failure['eventId'])
        self.assertEqual(('body', 'broken_pipe'), (failure['stage'], failure['failureClass']))
        _, replay = self.fixture.request('tools/call', args)
        self.assertEqual(committed[0], replay['result']['structuredContent'])
        offer = replay['result']['_meta']['io.tdev/diagnostics'][0]
        self.assertEqual((row['id'], 'offered'), (offer['id'], offer['delivery']))
        self.assertIsNone(offer['acknowledgedAt'])
        self.assertNotIn('injected private disconnect', json.dumps(replay))

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

    def test_client_report_summary_contract_grants_and_server_errors(self):
        from jsonschema import Draft202012Validator
        from tdev.server import expanded
        schema = self.fixture.controller.schema
        output = next(t['outputSchema'] for t in schema['x-tools'] if t['name']=='tdev_diagnostics')
        validator = Draft202012Validator(expanded(schema, output))
        cold = self.call({'action':'inspect','view':'summary'})
        validator.validate(cold['structuredContent'])
        self.assertEqual({}, cold['structuredContent']['result']['summary']['server'])
        args = {'action':'report','requestId':'client-observation','category':'transport_error'}
        self.assertEqual('PERMISSION_DENIED', self.call(args)['structuredContent']['error']['code'])
        self.assertFalse((self.root/'diagnostics').exists())
        self.fixture.repo.config['principals']['alice']['diagnostics'] = True
        report = self.call(args)
        validator.validate(report['structuredContent'])
        self.assertEqual('reported_transport_error', report['_meta']['io.tdev/diagnostics'][0]['reason'])
        self.call(args)
        bad = self.call({**args, 'rawError':'never retain this'})
        self.assertEqual('SCHEMA', bad['structuredContent']['error']['code'])
        self.assertEqual(400, self.fixture.request(headers={'MCP-Protocol-Version':'invalid'})[0])
        summary = self.call({'action':'inspect','view':'summary'})['structuredContent']
        validator.validate(summary)
        self.assertEqual([], summary['result']['incidents'])
        self.assertEqual({'transport_error':1}, summary['result']['summary']['reported'])
        self.assertEqual({'tool_error':1,'protocol_error':1}, summary['result']['summary']['server'])
        self.assertNotIn('never retain this', json.dumps(control(self.policies[0].directory, {'action':'snapshot'})))
        self.fixture.repo.config['principals']['alice']['diagnostics'] = False
        denied = self.call({**args,'requestId':'new'})
        self.assertEqual('PERMISSION_DENIED', denied['structuredContent']['error']['code'])

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
        later = p.clock() + 16
        p.clock = lambda: later
        wrapped = bridge.handle({'jsonrpc':'2.0','id':7,'method':'tools/call','params':{'name':'tdev_diagnostics','arguments':{'action':'inspect'}}})
        self.assertIn('io.tdev/diagnostics', wrapped['result']['_meta'])
        self.assertGreater(len(wrapped['result']['content']), 1)


if __name__ == '__main__':
    unittest.main()
