"""Native HTTP ingress and private construction gap qualification.

Invoked explicitly by scripts/check.sh, independently of reference discovery.
"""
import base64
import http.client
import json
import os
from pathlib import Path
import shutil
import sys
import threading
import time
import unittest

import jsonschema
from acceptance.harness import CONTRACT, META, VERSION, Runtime, eventually, git, read_response


class NativeSourceTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def raw(self, body, headers=None):
        r = self.runtime
        conn = http.client.HTTPConnection('127.0.0.1', r.port, timeout=15)
        try:
            h = {'Authorization': 'Bearer alice-secret', 'Content-Type': 'application/json',
                 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': VERSION,
                 'Mcp-Method': 'tools/call', 'Mcp-Name': 'tdev_read'}
            h.update(headers or {})
            conn.request('POST', '/mcp', body, h)
            response = conn.getresponse()
            return response.status, json.loads(read_response(response))
        finally:
            conn.close()

    def envelope(self, tool, request, rpc_id=1):
        return json.dumps({'jsonrpc': '2.0', 'id': rpc_id, 'method': 'tools/call',
            'params': {'name': tool, 'arguments': {'request': request}, '_meta': {
                META + 'protocolVersion': VERSION, META + 'clientCapabilities': {}}}})

    def test_discovery_contains_only_implemented_actions_and_rejects_hidden_handlers(self):
        r = self.runtime
        tools = r.request()[2]['result']['tools']
        names = {tool['name'] for tool in tools}
        self.assertEqual(names, {'tdev_workspace', 'tdev_task', 'tdev_project', 'tdev_read', 'tdev_edit', 'tdev_operation', 'tdev_exec'})
        self.assertNotIn('$ref', json.dumps(tools))
        for tool in tools:
            original = next(t for t in CONTRACT['x-tools'] if t['name'] == tool['name'])
            self.assertEqual(tool['annotations'], original['annotations'])
        task = next(t for t in tools if t['name'] == 'tdev_task')
        hidden = {'action': 'refresh', 'requestId': 'hidden', 'taskId': 'a', 'expected': 'a'*40}
        self.assertFalse(jsonschema.Draft202012Validator(task['inputSchema']).is_valid({'request': hidden}))
        response = r.request('tools/call', {'name': 'tdev_task', 'arguments': {'request': hidden}})[2]
        self.assertEqual(response['result']['structuredContent']['error']['code'], 'SCHEMA')
        for tool in ('tdev_validate', 'tdev_publish', 'tdev_find', 'tdev_deploy', 'tdev_artifact', 'tdev_diagnostics'):
            self.assertEqual(r.request('tools/call', {'name': tool, 'arguments': {'request': {}}})[0], 400)
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])

    def test_numeric_materialization_scalar_unicode_and_rpc_identity(self):
        task = self.runtime.open()
        request = {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt', 'offset': 1.0, 'limit': 2.0}]}
        for offset in ('1.0', '1e0', '1.00000000000000000001'):
            body = self.envelope('tdev_read', request).replace('"offset": 1.0', '"offset": ' + offset)
            status, response = self.raw(body)
            self.assertEqual(status, 200, response)
            item = response['result']['structuredContent']['result']['items'][0]
            self.assertEqual(base64.b64decode(item['data']), b'el')
            self.assertEqual(item['nextOffset'], 3)
        for rpc_id in (1.0, True, None):
            status, response = self.raw(self.envelope('tdev_read', request, rpc_id))
            self.assertEqual((status, response['error']['code']), (400, -32600))
        request['queries'][0]['offset'] = 1e100
        status, response = self.raw(self.envelope('tdev_read', request))
        self.assertEqual(status, 200, response)
        item = response['result']['structuredContent']['result']['items'][0]
        self.assertEqual((item['nextOffset'], item['data'], item['complete']), (int(1e100), '', True))
        huge = 10 ** 100 + 1
        pages = self.runtime.call('read', {'taskId': task['taskId'], 'queries': [
            {'action': 'list', 'offset': huge}, {'action': 'search', 'text': 'hello', 'offset': huge}]})['items']
        for page in pages:
            self.assertTrue(page['complete'])
            self.assertEqual(page['nextOffset'], huge)
        self.assertEqual((pages[0]['entries'], pages[1]['hits'], pages[1]['scannedBytes']), ([], [], 0))
        request['queries'][0]['offset'] = 1.0
        valid = self.envelope('tdev_read', request)
        for malformed in (valid.replace('"a.txt"', '"\\ud800"'),
                          valid.replace('"offset": 1.0', '"offset": 1e999'),
                          valid.replace('"offset": 1.0', '"offset": ' + '9' * 4301),
                          '[' * 130 + '0' + ']' * 130):
            status, response = self.raw(malformed)
            self.assertEqual((status, response['error']['code']), (400, -32700))
        self.assertEqual(self.runtime.call('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})['checkpoint'], task['checkpoint'])

    def test_raw_fingerprints_preserve_numeric_forms_before_schema_conversion(self):
        task = self.runtime.open()
        request = {'requestId': 'numbers', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'edited', 'count': 1}]}
        body = self.envelope('tdev_edit', request)
        headers = {'Mcp-Name': 'tdev_edit'}
        first = self.raw(body, headers)[1]['result']['structuredContent']['result']
        self.assertEqual(first['status'], 'succeeded')
        same = self.raw(body, headers)[1]['result']['structuredContent']['result']
        self.assertEqual(first, same)
        altered = self.raw(body.replace('"count": 1', '"count": 1.0'), headers)[1]['result']['structuredContent']
        self.assertEqual(altered['error']['code'], 'IDEMPOTENCY_MISMATCH')
        request['requestId'] = 'float-original'
        request['expected'] = first['result']['checkpoint']
        request['edits'][0].update(old='edited', text='final', count=1.0)
        body = self.envelope('tdev_edit', request)
        float_op = self.raw(body, headers)[1]['result']['structuredContent']['result']
        exponent_op = self.raw(body.replace('"count": 1.0', '"count": 1e0'), headers)[1]['result']['structuredContent']['result']
        self.assertEqual(float_op, exponent_op)

    def test_current_identity_config_and_private_file_fail_closed(self):
        r = self.runtime
        task = r.open()
        r.config['repositories']['test']['identity'] = 'local:0:1'
        r.save_config()
        value = r.request('tools/call', {'name': 'tdev_read', 'arguments': {'request': {'taskId': task['taskId'], 'queries': [{'action': 'list'}]}}})[2]
        self.assertEqual(value['result']['structuredContent']['error']['code'], 'REPOSITORY_IDENTITY')
        r.config_file.chmod(0o644)
        self.assertEqual(r.request()[0], 401)
        r.save_config()
        duplicate = json.loads(json.dumps(r.config['principals']['alice']))
        r.config['principals']['duplicate'] = duplicate
        r.save_config()
        self.assertEqual(r.request()[0], 401)

    def test_completion_during_remote_inspection_is_actionable(self):
        r = self.runtime
        task = r.open()
        r.stop()
        wrappers = r.root / 'inspect-utilities'
        wrappers.mkdir(mode=0o700)
        marker, release = r.root / 'head-wait', r.root / 'head-release'
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import subprocess, sys, time\nfrom pathlib import Path\n' +
            f'code=subprocess.call([{shutil.which("git")!r}, *sys.argv[1:]])\n' +
            'if "ls-remote" in sys.argv:\n' +
            f' marker=Path({str(marker)!r}); release=Path({str(release)!r}); marker.touch()\n' +
            ' end=time.monotonic()+15\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' marker.unlink(missing_ok=True)\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()
        replies, failures = [], []
        def inspect():
            try: replies.append(r.call('task', {'action': 'inspect', 'taskId': task['taskId']}))
            except BaseException as error: failures.append(error)
        caller = threading.Thread(target=inspect, daemon=True)
        caller.start()
        try:
            eventually(lambda: marker.exists(), bool, seconds=5)
            changed = r.call('edit', {'requestId': 'missed-completion', 'taskId': task['taskId'],
                'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'done'}]})
        finally:
            release.touch()
            caller.join(timeout=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(failures, failures)
        frontier = replies[0]
        self.assertEqual(frontier['task']['checkpoint'], changed['result']['checkpoint'])
        self.assertTrue(frontier['mutationReady'])
        self.assertIsNone(frontier['active'])
        self.assertEqual(frontier['operations'][0]['id'], changed['id'])
        next_edit = r.call('edit', {'requestId': 'useful-next', 'taskId': task['taskId'],
            'expected': frontier['task']['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'done', 'text': 'continued'}]})
        self.assertEqual(next_edit['status'], 'succeeded')

    def test_git_pin_before_pointer_kill_recovers_without_repeating_edit(self):
        r = self.runtime
        task = r.open()
        r.stop()
        wrappers = r.root / 'utilities'
        wrappers.mkdir(mode=0o700)
        armed, marker, release = [r.root / name for name in ('armed', 'pin.json', 'release')]
        real_git = shutil.which('git')
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json, os, subprocess, sys, time\n' +
            'from pathlib import Path\n' +
            f'armed=Path({str(armed)!r}); marker=Path({str(marker)!r}); release=Path({str(release)!r})\n' +
            f'code=subprocess.call([{real_git!r}, *sys.argv[1:]])\n' +
            'if code == 0 and armed.exists() and "update-ref" in sys.argv and any(a.startswith("refs/tdev/objects/") for a in sys.argv):\n' +
            ' marker.write_text(json.dumps({"pid":os.getpid(),"args":sys.argv[1:]}))\n' +
            ' end=time.monotonic()+20\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' marker.unlink(missing_ok=True)\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()
        armed.touch()
        args = {'requestId': 'interrupted-edit', 'taskId': task['taskId'], 'expected': task['checkpoint'],
                'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'private'}]}
        replies, failures = [], []
        def invoke():
            try: replies.append(r.call('edit', args))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        try:
            eventually(lambda: marker.exists(), bool, seconds=8)
            pin = json.loads(marker.read_text())
            oid = pin['args'][-1]
            self.assertNotEqual(oid, task['checkpoint'])
            started = time.monotonic()
            running = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            self.assertEqual(running['status'], 'running')
            frontier = r.call('task', {'action': 'inspect', 'taskId': task['taskId']})
            self.assertEqual((frontier['task']['checkpoint'], frontier['task']['busy']), (task['checkpoint'], running['id']))
            r.call('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Still usable'})
            self.assertLess(time.monotonic() - started, 3)
            connection = http.client.HTTPConnection('127.0.0.1', r.port, timeout=5)
            body = json.loads(self.envelope('tdev_operation', {'action': 'status', 'operationId': running['id'], 'waitMs': 1500}))
            body['params']['_meta']['progressToken'] = 'bounded'
            before = time.monotonic()
            connection.request('POST', '/mcp', json.dumps(body), {'Authorization': 'Bearer alice-secret',
                'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
                'MCP-Protocol-Version': VERSION, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'tdev_operation'})
            streamed = connection.getresponse()
            self.assertEqual(streamed.getheader('Content-Type'), 'text/event-stream')
            self.assertLess(time.monotonic() - before, 1)
            data = read_response(streamed)
            connection.close()
            self.assertIn(b'notifications/progress', data)
            self.assertIn(b'"status":"running"', data)
            self.assertLess(time.monotonic() - before, 3)
            r.stop()
        finally:
            armed.unlink(missing_ok=True)
            release.touch()
            caller.join(timeout=5)
            eventually(lambda: marker.exists(), lambda exists: not exists, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(failures, failures)
        self.assertFalse(replies, replies)
        r.start()
        recovered = r.status(running['id'])
        self.assertEqual((recovered['status'], recovered['effect'], recovered['error']['code']), ('failed', 'none', 'INTERRUPTED'))
        self.assertEqual(r.call('edit', args)['id'], running['id'])
        read = r.call('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual((read['checkpoint'], base64.b64decode(read['items'][0]['data'])), (task['checkpoint'], b'hello\n'))
        self.assertEqual(git('--git-dir=' + str(r.state / 'sources' / 'test'), 'rev-parse', 'refs/tdev/objects/' + oid), oid)
        retried = r.call('edit', {**args, 'requestId': 'new-edit'})
        self.assertEqual(retried['status'], 'succeeded')
        self.assertNotEqual(retried['result']['checkpoint'], oid)


if __name__ == '__main__':
    unittest.main()
