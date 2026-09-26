"""Caller probes over real HTTP/bridge; no claim to observe ChatGPT's private runner."""
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch

import test_diagnostic_policy as fixtures
from tdev.common import Fault
from tdev.diagnostics import control
from tdev.codex_bridge import Bridge
from tdev.server import expanded
from jsonschema import Draft202012Validator


def mark(p, sequence=1, phase='cell_enter', **fields):
    value = dict(action='mark', instance=p.recorder.instance, runId='a'*32,
                 cellId='b'*32, sequence=sequence, phase=phase)
    if phase == 'tool_return':
        value['callOrdinal'] = 1
    return {**value, **fields}


def witnesses(p):
    return [r for r in p.recorder.snapshot()['recent'] if r['event'] == 'host_witness']


class WitnessPolicyTest(unittest.TestCase):
    setUp = fixtures.PolicyTest.setUp
    tearDown = fixtures.PolicyTest.tearDown
    create = fixtures.PolicyTest.create

    def test_watch_replay_conflict_and_no_incident_or_active_request(self):
        p = self.policy
        fixtures.until(lambda: p.recorder.snapshot()['counts']['sink_written'] >= 1)
        before = p.inspect('alice')
        accepted = p.tool('alice', mark(p))
        self.assertEqual(accepted, p.tool('alice', mark(p)))
        with self.assertRaises(Fault) as conflict:
            p.tool('alice', mark(p, cellId='c'*32))
        self.assertEqual('WITNESS_CONFLICT', conflict.exception.value['code'])
        self.assertEqual(1, len(witnesses(p)))
        self.assertEqual([], p.recorder.snapshot()['active'])
        after = p.inspect('alice')
        for field in ('incidents', 'mode', 'expiresAt', 'summary', 'storagePending'):
            self.assertEqual(before[field], after[field])
        self.assertEqual(1, p.recorder.snapshot()['counts']['sink_written'])
        self.assertNotIn('host_witness', (p.directory/'events.0.jsonl').read_text())
        # Same tuple in another principal's namespace is a separate assertion.
        self.assertNotEqual(accepted['eventId'], p.tool('bob', mark(p))['eventId'])
        evidence = json.dumps(control(p.directory, {'action':'snapshot'}))
        for raw in ('a'*32, 'b'*32, 'alice', 'bob'):
            self.assertNotIn(raw, evidence)

    def test_bounded_replay_never_recreates_evicted_progress_and_restart_fences(self):
        p = self.policy
        original = mark(p)
        for sequence in range(1, 300):
            p.tool('alice', mark(p, sequence))
        self.assertEqual(256, len(p._witness_receipts))
        self.assertEqual(43, p.inspect('alice')['witness']['evicted'])
        self.assertEqual(256, len(p.recorder.snapshot()['recent']))
        self.assertGreater(p.recorder.snapshot()['counts']['ring_overwrites'], 0)
        count = p.recorder.snapshot()['counts']['emitted']
        for args in (original, {**original, 'cellId':'c'*32}):
            with self.assertRaises(Fault) as old:
                p.tool('alice', args)
            self.assertEqual('WITNESS_REPLAY_EXPIRED', old.exception.value['code'])
        self.assertEqual(count, p.recorder.snapshot()['counts']['emitted'])
        for n in range(31):
            p.tool('alice', mark(p, runId=f'{n:032x}'))
        with self.assertRaises(Fault) as full:
            p.tool('alice', mark(p, runId='f'*32))
        self.assertEqual('WITNESS_RUN_LIMIT', full.exception.value['code'])
        p.tool('alice', mark(p, 300))  # Existing run still usable at capacity.
        p.close(); self.policies.remove(p)
        restarted = self.create()
        with self.assertRaises(Fault) as stale:
            restarted.tool('alice', original)
        self.assertEqual('WITNESS_INSTANCE_CHANGED', stale.exception.value['code'])
        self.assertEqual([], witnesses(restarted))

    def test_trace_persistence_off_and_storage_failure(self):
        p = self.policy
        p.tool('alice', dict(action='activate', requestId='trace', seconds=2))
        first = p.tool('alice', mark(p))
        fixtures.until(lambda: 'host_witness' in (p.directory/'events.0.jsonl').read_text())
        p.recorder._sink = lambda _: (_ for _ in ()).throw(OSError('private disk error'))
        p.tool('alice', mark(p, 2, 'tool_return', afterRequest=7))
        fixtures.until(lambda: p.recorder.snapshot()['counts']['sink_errors'] > 0)
        self.assertEqual(2, len(witnesses(p)))
        # Expiry never extends on mark, and off rejects even a retained replay.
        self.now += 3
        self.assertEqual('watch', p.mode)
        self.assertEqual(first, p.tool('alice', mark(p)))
        p._base_mode = p._mode = 'off'
        with self.assertRaises(Fault) as off:
            p.tool('alice', mark(p))
        self.assertEqual('DIAGNOSTICS_OFF', off.exception.value['code'])
        self.assertEqual(2, len(witnesses(p)))
        self.assertNotIn('private disk error', json.dumps(p.local({'action':'snapshot'})))

    def test_concurrent_identical_lost_reply_retry_emits_once(self):
        p = self.policy
        replies = []
        threads = [threading.Thread(target=lambda: replies.append(p.tool('alice', mark(p)))) for _ in range(8)]
        for t in threads: t.start()
        for t in threads: t.join(2)
        self.assertEqual(8, len(replies))
        self.assertTrue(all(r == replies[0] for r in replies))
        self.assertEqual(1, len(witnesses(p)))


class WitnessHTTPTest(unittest.TestCase):
    setUp = fixtures.DiagnosticHTTPTest.setUp
    tearDown = fixtures.DiagnosticHTTPTest.tearDown
    call = fixtures.DiagnosticHTTPTest.call
    start_watch = fixtures.DiagnosticHTTPTest.start_watch

    def test_cold_off_does_not_load_and_fresh_grant_schema_validation(self):
        args = dict(action='mark', instance='0'*16, runId='a'*32, cellId='b'*32, sequence=1, phase='cell_enter')
        self.assertEqual('PERMISSION_DENIED', self.call(args)['structuredContent']['error']['code'])
        self.fixture.repo.config['principals']['alice']['diagnostics'] = True
        self.assertEqual('DIAGNOSTICS_OFF', self.call(args)['structuredContent']['error']['code'])
        self.assertEqual([], self.policies)
        self.assertFalse((self.root/'diagnostics').exists())
        p = self.start_watch()
        invalid = [dict(phase='invalid'), dict(runId='a'*33), dict(cellId='b'*32+'\n'), dict(cellId='/private/path'),
                   dict(sequence=0), dict(rawOutput='secret command output'), dict(phase='tool_return'),
                   dict(callOrdinal=1), dict(afterRequest=3), dict(requestId='not-an-operation')]
        for changed in invalid:
            with self.subTest(changed=changed):
                response = self.call({**mark(p), **changed})
                self.assertEqual('SCHEMA', response['structuredContent']['error']['code'])
        self.assertEqual([], witnesses(p))
        self.assertNotIn('secret command output', json.dumps(p.local({'action':'snapshot'})))
        self.assertEqual('PERMISSION_DENIED', self.call(mark(p), 'bob-secret')['structuredContent']['error']['code'])
        self.fixture.repo.config['principals']['alice']['diagnostics'] = False
        self.assertEqual('PERMISSION_DENIED', self.call(mark(p))['structuredContent']['error']['code'])

    def test_real_http_timeline_exact_request_bridge_and_separate_observer(self):
        p = self.start_watch()
        p.tool('alice', dict(action='activate', requestId='timeline', seconds=30))
        first = self.call(mark(p))['structuredContent']['result']
        _, response = self.fixture.request('tools/call', {'name':'tdev_task','arguments':{'action':'list'}})
        link = response['result']['_meta']['io.tdev/diagnosticReceipt']
        self.assertEqual(p.recorder.instance, link['instance'])
        fixtures.until(lambda: any(r['request']==link['request'] and r['event']=='http_finished'
                                   for r in p.recorder.snapshot()['recent']))
        returned = self.call(mark(p, 2, 'tool_return', afterRequest=link['request']))['structuredContent']['result']
        exit_args = mark(p, 3, 'cell_exit')
        bridge = Bridge(f'http://127.0.0.1:{self.server.server_port}/mcp', 'alice-secret')
        wrapped = bridge.handle({'jsonrpc':'2.0','id':7,'method':'tools/call','params':{'name':'tdev_diagnostics','arguments':exit_args}})['result']
        last = wrapped['structuredContent']['result']
        self.assertIn('io.tdev/diagnosticReceipt', wrapped['_meta'])
        # Discarding the first reply and retransmitting never adds another witness.
        self.assertEqual(last, self.call(exit_args)['structuredContent']['result'])
        self.assertEqual(3, len(witnesses(p)))
        self.assertLess(first['eventId'], returned['eventId'])
        self.assertLess(returned['eventId'], last['eventId'])
        events = p.recorder.snapshot()['recent']
        for stage in ('dispatch_finished', 'socket_body_written', 'http_finished'):
            event = next(r for r in events if r['request']==link['request'] and r['event']==stage)
            self.assertLess(first['eventId'], event['eventId'])
            self.assertLess(event['eventId'], returned['eventId'])
        schema = self.fixture.controller.schema
        output = next(t['outputSchema'] for t in schema['x-tools'] if t['name']=='tdev_diagnostics')
        Draft202012Validator(expanded(schema, output)).validate(wrapped['structuredContent'])
        # Independent OS process, local snapshot only; does not create markers.
        observer = subprocess.run([sys.executable, '-m', 'tdev.diagnostic_observer', '--state', str(self.root),
                    '--output', str(self.root/'observed'), '--seconds', '1'], capture_output=True, text=True, timeout=5, check=True)
        self.assertEqual(0, json.loads(observer.stdout)['unavailable'])
        saved = json.loads((self.root/'observed/samples.jsonl').read_text().splitlines()[0])['snapshot']
        self.assertEqual([first['eventId'], returned['eventId'], last['eventId']],
                         [r['eventId'] for r in saved['recent'] if r['event']=='host_witness'])
        self.assertEqual(3, len(witnesses(p)))
        self.assertIn('error', control(p.directory, {'action':'mark'}))  # Local socket is not a writer.

    def test_mark_and_failed_mark_do_not_touch_operational_state_or_retry(self):
        p = self.start_watch()
        args = {'name':'tdev_task','arguments':{'action':'open','requestId':'real-work','repo':'test',
                'ref':'refs/heads/main','expectedHead':self.fixture.repo.head}}
        _, opened = self.fixture.request('tools/call', args)
        self.assertTrue(opened['result']['structuredContent']['ok'])
        db = self.fixture.controller.store.db
        before = list(db.iterdump())
        source = {str(f.relative_to(self.fixture.repo.work)):f.read_bytes()
                  for f in self.fixture.repo.work.glob('*.txt')}
        with patch.object(self.fixture.controller, 'call', wraps=self.fixture.controller.call) as calls:
            self.assertFalse(self.call(mark(p))['isError'])
            failed = self.call(mark(p, cellId='c'*32))
            self.assertTrue(failed['isError'])
            self.assertEqual(2, calls.call_count)
            self.assertTrue(all(c.args[1]=='tdev_diagnostics' for c in calls.call_args_list))
        self.assertEqual(before, list(db.iterdump()))
        self.assertEqual(source, {str(f.relative_to(self.fixture.repo.work)):f.read_bytes()
                                 for f in self.fixture.repo.work.glob('*.txt')})
        _, replay = self.fixture.request('tools/call', args)
        self.assertEqual(opened['result']['structuredContent'], replay['result']['structuredContent'])

    def test_broken_optional_metadata_and_disk_do_not_lose_operational_response(self):
        p = self.start_watch()
        p.tool('alice', dict(action='activate', requestId='disk', seconds=30))
        p.recorder._sink = lambda _: (_ for _ in ()).throw(OSError('private disk failure'))
        for alerts in ([{}], [dict(id='x',reason='x',capture='x',bad=object())]):
            with patch.object(p.recorder, 'offers', return_value=alerts), \
                 patch.object(p.recorder, 'receipt', return_value={'bad':object()}):
                _, response = self.fixture.request('tools/call', {'name':'tdev_task','arguments':{'action':'list'}})
            self.assertTrue(response['result']['structuredContent']['ok'])
            self.assertNotIn('io.tdev/diagnostics', response['result']['_meta'])
            self.assertNotIn('io.tdev/diagnosticReceipt', response['result']['_meta'])
        fixtures.until(lambda: p.recorder.snapshot()['counts']['sink_errors'] > 0)
        self.assertNotIn('private disk failure', json.dumps(p.local({'action':'snapshot'})))


if __name__ == '__main__':
    unittest.main()
