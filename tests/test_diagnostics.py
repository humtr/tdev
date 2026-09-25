import importlib.util
import io
import json
from pathlib import Path
import socket
import threading
import time
import unittest

from tdev.diagnostics import Recorder
from tdev import server as candidate
import test_http


class DiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.fixture = test_http.HTTPTest()
        self.fixture.setUp()
        self.original_server = self.fixture.server
        self.trace = Recorder(capacity=256)
        self.server = candidate.make_server(self.fixture.controller, diagnostics=self.trace)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.fixture.server = self.server

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.trace.close()
        self.fixture.server = self.original_server
        self.fixture.tearDown()

    def terminal(self):
        args = {'name': 'tdev_task', 'arguments': {'action': 'open', 'requestId': 'open-private-label',
                'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': self.fixture.repo.head}}
        _, value = self.fixture.request('tools/call', args)
        return value['result']['structuredContent']['result']['id']

    def status(self, opid):
        return self.fixture.request('tools/call', {'name': 'tdev_operation',
               'arguments': {'action': 'status', 'operationId': opid}})

    def idle_snapshot(self):
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            value=self.trace.snapshot()
            if not value['active']:
                return value
            time.sleep(.005)
        self.fail('handler did not finish')

    def test_success_parity_correlation_and_no_raw_arguments(self):
        opid = self.terminal()
        observed = self.status(opid)
        self.fixture.server = self.original_server
        baseline = self.status(opid)
        self.fixture.server = self.server
        self.assertEqual(baseline, observed)
        rows = self.idle_snapshot()['recent']
        returned = next(r for r in rows if r['event']=='dispatch_finished' and r.get('operationTag'))
        status_input = next(r for r in rows if r['event']=='rpc_parsed' and r['tool']=='tdev_operation')
        self.assertEqual(returned['operationTag'], status_input['operationTag'])
        self.assertEqual(returned['request'], next(r for r in rows if r['event']=='rpc_parsed')['request'])
        serialized = json.dumps(rows)
        for raw in [opid, 'open-private-label', 'alice-secret', 'refs/heads/main']:
            self.assertNotIn(raw, serialized)

    def test_disabled_server_has_no_collector(self):
        self.assertIsNone(self.original_server.diagnostics)
        self.assertFalse((Path(self.fixture.tmp.name)/'state/diagnostics').exists())
        self.assertEqual('off', self.original_server.diagnostic_state)
        _, body = self.fixture.get('/healthz')
        self.assertEqual('trace', json.loads(body)['diagnostics'])

    def test_observer_failures_do_not_change_tool_response(self):
        opid = self.terminal()
        self.fixture.server = self.original_server
        expected = self.status(opid)
        self.fixture.server = self.server
        for method in ('request', 'identity', 'outcome', 'payload_tag', 'emit'):
            with self.subTest(method=method):
                original = getattr(self.trace, method)
                def fail(*args, **kwargs):
                    raise RuntimeError('diagnostic-only failure')
                setattr(self.trace, method, fail)
                try:
                    self.assertEqual(expected, self.status(opid))
                finally:
                    setattr(self.trace, method, original)

    def test_bad_auth_and_bad_json_are_visible_without_secrets(self):
        code, _ = self.fixture.request(headers={'Authorization': 'Bearer do-not-log-this'})
        self.assertEqual(401, code)
        rows = self.idle_snapshot()['recent']
        self.assertTrue(any(r['event']=='http_parse_started' for r in rows))
        self.assertTrue(any(r['event']=='ingress_finished' and not r['authenticated'] for r in rows))
        self.assertFalse(any(r['event']=='dispatch_started' for r in rows))
        self.assertNotIn('do-not-log-this', json.dumps(rows))
        import http.client
        conn = http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request('POST','/mcp',b'{private-bad-json',headers={
            'Authorization':'Bearer alice-secret','Content-Type':'application/json',
            'Accept':'application/json, text/event-stream'})
        response=conn.getresponse()
        self.assertEqual(400,response.status)
        response.read(); conn.close()
        self.assertTrue(any(r['event']=='body_read_finished' for r in self.trace.snapshot()['recent']))
        self.assertNotIn('private-bad-json',json.dumps(self.trace.snapshot()))

    def test_json_surrogate_identity_does_not_change_response(self):
        ident = 'rpc-\ud800'
        code, value = self.fixture.request(ident=ident)
        self.assertEqual(200, code)
        self.assertEqual(ident, value['id'])
        self.assertTrue(any(row.get('rpcTag') == self.trace.tag(ident)
                            for row in self.idle_snapshot()['recent']))
        code, value = self.status('invalid-\ud800')
        self.assertEqual(200, code)
        self.assertTrue(value['result']['isError'])

    def test_slow_auth_is_identified_before_dispatch(self):
        entered, release = threading.Event(), threading.Event()
        original = self.fixture.controller.authenticate
        def auth(token):
            entered.set()
            if not release.wait(3):
                raise RuntimeError('probe timeout')
            return original(token)
        self.fixture.controller.authenticate=auth
        finished=[]
        thread=threading.Thread(target=lambda: finished.append(self.fixture.request()))
        thread.start()
        try:
            self.assertTrue(entered.wait(2))
            active=self.trace.snapshot()['active']
            self.assertEqual(['ingress_started'],[r['event'] for r in active])
        finally:
            release.set();thread.join(3)
            self.fixture.controller.authenticate=original
        self.assertEqual(200,finished[0][0])

    def test_partial_body_wait_is_visible_before_rpc_parse(self):
        port=self.server.server_port
        data=b'{"jsonrpc":"2.0","id":1,"method":"unknown"}'
        headers=('POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:'+str(port)+'\r\n'
                 'Authorization: Bearer alice-secret\r\nContent-Type: application/json\r\n'
                 'Accept: application/json, text/event-stream\r\nContent-Length: '+str(len(data))+'\r\n\r\n').encode()
        client=socket.create_connection(('127.0.0.1',port),timeout=3)
        try:
            client.sendall(headers+data[:1])
            deadline=time.monotonic()+2
            while time.monotonic()<deadline:
                rows=self.trace.snapshot()['active']
                if any(r['event']=='body_read_started' for r in rows):
                    break
                time.sleep(.005)
            else:
                self.fail('body wait was not observable')
            self.assertFalse(any(r['event']=='rpc_parsed' for r in self.trace.snapshot()['recent']))
            client.sendall(data[1:])
            while client.recv(65536):
                pass
            self.assertTrue(any(r['event']=='body_read_finished' for r in self.idle_snapshot()['recent']))
        finally:
            client.close()

    def test_blocked_sink_saturation_does_not_block_http_or_snapshot(self):
        entered, release = threading.Event(), threading.Event()
        def sink(_):
            entered.set()
            release.wait(5)
        # The Handler captures this recorder; enable its sink before requests.
        self.trace._sink=sink
        self.trace._writer=threading.Thread(target=self.trace._drain,daemon=True)
        self.trace._writer.start()
        try:
            opid=self.terminal()
            self.assertTrue(entered.wait(2))
            for _ in range(24):
                self.assertEqual(200,self.status(opid)[0])
            snapshot=self.trace.snapshot()
            self.assertGreater(snapshot['counts']['sink_drops'],0)
            self.assertGreater(snapshot['counts']['ring_overwrites'],0)
            self.assertLessEqual(len(snapshot['recent']),256)
            self.assertFalse(self.trace.close(timeout=.01))
        finally:
            release.set()
            self.assertTrue(self.trace.close(timeout=3))

    def test_sink_failure_does_not_change_response(self):
        def broken_sink(_):
            raise OSError('private filesystem detail must not be logged')
        self.trace._sink=broken_sink
        self.trace._writer=threading.Thread(target=self.trace._drain,daemon=True)
        self.trace._writer.start()
        self.assertEqual(200,self.fixture.request()[0])
        self.assertTrue(self.trace.close(timeout=3))
        snapshot=self.trace.snapshot()
        self.assertGreater(snapshot['counts']['sink_errors'],0)
        self.assertNotIn('private filesystem',json.dumps(snapshot))

    def test_dispatch_exception_is_distinct_from_tool_error(self):
        original=self.fixture.controller.call
        def explode(*_):
            raise RuntimeError('secret exception body')
        self.fixture.controller.call=explode
        try:
            code,result=self.fixture.request('tools/call',{'name':'tdev_operation','arguments':{'action':'status','operationId':'missing'}})
        finally:
            self.fixture.controller.call=original
        self.assertEqual(200,code)
        self.assertEqual(-32603,result['error']['code'])
        self.assertTrue(any(r['event']=='dispatch_failed' for r in self.trace.snapshot()['recent']))
        self.status('missing')
        rows=self.trace.snapshot()['recent']
        self.assertTrue(any(r['event']=='dispatch_finished' and r.get('ok') is False for r in rows))
        self.assertNotIn('secret exception body',json.dumps(rows))

    def test_header_body_and_serialization_failures_have_separate_stages(self):
        handler=self.server.RequestHandlerClass.__new__(self.server.RequestHandlerClass)
        handler._trace_request=self.trace.request()
        handler.send_response=lambda _:None
        handler.send_header=lambda *_:None
        handler.end_headers=lambda:(_ for _ in ()).throw(BrokenPipeError())
        handler.wfile=io.BytesIO()
        with self.assertRaises(BrokenPipeError):
            handler.send(200,{'safe':True})
        handler.end_headers=lambda:None
        class BrokenBody:
            def write(self,_): raise ConnectionResetError()
        handler.wfile=BrokenBody()
        handler.send(200,{'safe':True})
        with self.assertRaises(TypeError):
            handler.send(200,{'invalid':object()})
        failures=[r for r in self.trace.snapshot()['recent'] if r['event']=='response_failed']
        self.assertEqual(['headers','body','serialization'],[r['stage'] for r in failures])



class PersistenceTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.directory = self.root / 'diagnostics'
        self.source = Path(__file__).resolve().parents[1]
        self.runtimes = []

    def runtime(self):
        from tdev.diagnostics import RuntimeDiagnostics
        runtime = RuntimeDiagnostics(self.directory, self.source)
        self.runtimes.append(runtime)
        return runtime

    def tearDown(self):
        for runtime in self.runtimes:
            runtime.close()
        self.tmp.cleanup()

    def test_server_import_and_health_without_diagnostic_module(self):
        import os
        import subprocess
        import sys
        script = """
import sys, threading, http.client
sys.modules['tdev.diagnostics'] = None
from tdev.server import make_server
server = make_server(None)
assert server.diagnostics is None
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
    conn.request('GET', '/healthz')
    response = conn.getresponse()
    assert response.status == 200
    response.read()
    conn.close()
finally:
    server.shutdown()
    thread.join()
    server.server_close()
"""
        env = dict(os.environ, PYTHONPATH=str(self.source/'src')+':'+str(self.source/'.tdev-deps'))
        subprocess.run([sys.executable, '-c', script], env=env, check=True,
                       capture_output=True, timeout=10)

    def test_restart_preserves_tags_but_not_process_identity(self):
        from tdev.diagnostics import snapshot, export
        first = self.runtime()
        old = snapshot(self.directory)
        tag = first.recorder.tag('original-request')
        first.recorder.emit(1, 'rpc_parsed', requestTag=tag)
        first.recorder.emit(1, 'dispatch_started')
        self.assertEqual(tag, snapshot(self.directory)['active'][0]['requestTag'])
        first.close()
        second = self.runtime()
        new = snapshot(self.directory)
        self.assertEqual(old['keyId'], new['keyId'])
        self.assertEqual(tag, second.recorder.tag('original-request'))
        self.assertNotEqual(old['instance'], new['instance'])
        self.assertNotEqual(second.recorder.tag(1), second.recorder.tag('1'))
        self.assertEqual('enabled', new['identity']['persistence'])
        self.assertEqual(64, len(new['identity']['sourceDigest']))
        report = export(self.directory, self.root/'evidence')
        self.assertFalse(report['atomic'])
        self.assertNotIn('live_snapshot_unavailable', report['gaps'])
        self.assertFalse((self.root/'evidence/correlation.key').exists())
        key = (self.directory/'correlation.key').read_bytes()
        for file in (self.root/'evidence').iterdir():
            self.assertNotIn(key, file.read_bytes())
            self.assertNotIn(b'original-request', file.read_bytes())
        with self.assertRaises(FileExistsError):
            export(self.directory, self.root/'evidence')

    def test_rotation_is_bounded_and_export_survives_offline(self):
        from tdev.diagnostics import RotatingSink, private_directory, export
        private_directory(self.directory)
        sink = RotatingSink(self.directory, max_bytes=200, segments=3)
        for n in range(40):
            sink(json.dumps(dict(instance='test', eventId=n, event='probe'))+'\n')
        files = list(self.directory.glob('events.*.jsonl'))
        self.assertEqual(3, len(files))
        self.assertLessEqual(sum(p.stat().st_size for p in files), 600)
        report = export(self.directory, self.root/'offline')
        self.assertIn('live_snapshot_unavailable', report['gaps'])
        self.assertEqual(3, len(report['files']))
        self.assertEqual(39, report['files']['events.0.jsonl']['coverage']['test']['last'])

    def test_symlink_key_degrades_without_reading_target(self):
        from tdev.diagnostics import private_directory, snapshot
        private_directory(self.directory)
        target = self.root/'private-target'
        target.write_bytes(b'protected')
        (self.directory/'correlation.key').symlink_to(target)
        runtime = self.runtime()
        self.assertEqual('unavailable', snapshot(self.directory)['identity']['persistence'])
        self.assertIsNone(runtime.recorder._sink)
        self.assertEqual(b'protected', target.read_bytes())

    def test_symlink_log_never_changes_target(self):
        from tdev.diagnostics import RotatingSink, private_directory, export
        private_directory(self.directory)
        target = self.root/'private-target'
        target.write_bytes(b'protected')
        (self.directory/'events.0.jsonl').symlink_to(target)
        with self.assertRaises(OSError):
            RotatingSink(self.directory)('{}\n')
        report = export(self.directory, self.root/'evidence')
        self.assertIn('events.0.jsonl:unavailable', report['gaps'])
        self.assertEqual(b'protected', target.read_bytes())
        self.assertFalse((self.root/'evidence/events.0.jsonl').exists())

    def test_operator_snapshot_and_export_work_with_blocked_writer(self):
        from tdev.diagnostics import snapshot, export
        runtime = self.runtime()
        # Drain startup before replacing the sink.
        self.assertTrue(runtime.recorder.close(timeout=2))
        release, entered = threading.Event(), threading.Event()
        def blocked(_):
            entered.set()
            release.wait(5)
        runtime.recorder._sink = blocked
        runtime.recorder._stop.clear()
        runtime.recorder._writer = threading.Thread(target=runtime.recorder._drain, daemon=True)
        runtime.recorder._writer.start()
        try:
            for n in range(600):
                runtime.recorder.emit(n, 'dispatch_started')
            self.assertTrue(entered.wait(2))
            observed = snapshot(self.directory)
            self.assertGreater(observed['counts']['sink_drops'], 0)
            self.assertGreater(observed['counts']['active_evictions'], 0)
            self.assertEqual(256, len(observed['active']))
            report = export(self.directory, self.root/'blocked')
            self.assertNotIn('live_snapshot_unavailable', report['gaps'])
            self.assertFalse(runtime.recorder.close(timeout=.01))
        finally:
            release.set()
            self.assertTrue(runtime.recorder.close(timeout=2))

    def test_control_bind_failure_does_not_displace_first_owner(self):
        from tdev.diagnostics import snapshot
        first = self.runtime()
        second = self.runtime()
        self.assertEqual('unavailable', second.recorder.runtime_identity['control'])
        self.assertEqual(first.recorder.instance, snapshot(self.directory)['instance'])

    def test_partial_log_and_source_manifest_identity(self):
        from tdev.diagnostics import identity, private_directory, export
        from unittest.mock import patch
        private_directory(self.directory)
        (self.directory/'events.0.jsonl').write_bytes(b'{"instance":"x","eventId":1}\n{"partial"')
        (self.directory/'events.0.jsonl').chmod(0o600)
        report = export(self.directory, self.root/'partial')
        self.assertIn('events.0.jsonl:partial_record', report['gaps'])
        self.assertEqual(1, report['files']['events.0.jsonl']['coverage']['x']['records'])
        source = self.root/'source'
        (source/'src/tdev').mkdir(parents=True)
        (source/'contracts').mkdir()
        (source/'contracts/tools.schema.json').write_text('{}')
        (source/'manifest.json').write_text('{"id":"bundle-test"}')
        self.assertEqual('bundle-test', identity(source)['bundle'])
        runtime = self.runtime()
        # Both ends validate peer ownership. Server returns no snapshot to another UID.
        with patch('tdev.diagnostics.same_uid', return_value=False):
            from tdev.diagnostics import snapshot
            with self.assertRaises(ValueError):
                snapshot(self.directory)


if __name__ == "__main__":
    unittest.main()
