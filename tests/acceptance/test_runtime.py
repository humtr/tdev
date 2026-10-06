"""Behavioral acceptance against a separately launched, replaceable executable."""
import base64
import json
import unittest

from acceptance.harness import CONTRACT, Runtime, eventually, git, output


class RuntimeTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def test_discovery_and_rejected_requests_have_no_effect(self):
        r = self.runtime
        status, _, value, _ = r.request()
        self.assertEqual(status, 200)
        actual = value['result']['tools']
        names = {t['name'] for t in actual}
        self.assertTrue({'tdev_find', 'tdev_workspace', 'tdev_task', 'tdev_project',
            'tdev_read', 'tdev_edit', 'tdev_exec', 'tdev_operation',
            'tdev_validate', 'tdev_publish'} <= names)
        self.assertEqual(len(actual),len(names))
        self.assertTrue(names <= {t['name'] for t in CONTRACT['x-tools']})
        self.assertNotIn('$ref', json.dumps(actual))
        for advertised in actual:
            canonical = next(t for t in CONTRACT['x-tools'] if t['name'] == advertised['name'])
            self.assertEqual(advertised['annotations'], canonical['annotations'])
        before = r.call('task', {'action': 'list'})
        for headers, expected in [({'Authorization': 'Bearer wrong'}, 401),
                                  ({'Origin': 'https://evil.example'}, 403),
                                  ({'Host': 'evil.example'}, 403),
                                  ({'MCP-Protocol-Version': None}, 400),
                                  ({'Mcp-Method': 'tools/call'}, 400)]:
            with self.subTest(headers=headers):
                self.assertEqual(r.request(headers=headers)[0], expected)
        args = {'action': 'open', 'requestId': 'invalid', 'repo': 'test',
                'ref': 'refs/heads/main', 'expectedHead': r.head}
        for arguments in (args, {'request': {**args, 'adminApproved': True}},
                          {'request': args, 'action': 'open'}):
            status, _, value, _ = r.request('tools/call',
                {'name': 'tdev_task', 'arguments': arguments})
            self.assertEqual(status, 200)
            self.assertEqual(value['result']['structuredContent']['error']['code'], 'SCHEMA')
        self.assertEqual(r.call('task', {'action': 'list'}), before)

    def test_source_edit_exec_validate_publish_and_closed_cleanup(self):
        r = self.runtime
        w = r.open()
        edit_args = {'requestId': 'edit', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                     'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': '안녕'}]}
        edited = r.call('edit', edit_args)
        self.assertEqual(r.call('edit', edit_args), edited)
        checkpoint = edited['result']['checkpoint']
        read = r.call('read', {'taskId': w['taskId'], 'checkpoint': checkpoint,
                             'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), '안녕\n'.encode())
        run = r.call('exec', {'requestId': 'exec', 'taskId': w['taskId'], 'expected': checkpoint,
                            'command': 'printf native >> a.txt', 'timeout': 20, 'waitMs': 0})
        done = r.terminal(run['id'])
        self.assertEqual((done['status'], done['result']['exitCode']), ('succeeded', 0))
        check = r.call('validate', {'requestId': 'validate', 'taskId': w['taskId'],
            'expected': done['result']['checkpoint'], 'message': 'acceptance', 'waitMs': 0})
        checked = r.terminal(check['id'])
        self.assertEqual(checked['status'], 'succeeded')
        self.assertEqual(checked['execution']['timeout'], 20)
        self.assertEqual(checked['execution']['timeoutSource'], 'repository')
        published = r.call('publish', {'requestId': 'publish', 'validationId': checked['id'],
                                      'expectedHead': r.head})
        oid = published['result']['commit']
        self.assertEqual(oid, checked['result']['candidate'])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), oid)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'show', oid + ':a.txt'), '안녕\nnative')
        self.assertEqual((r.work / 'a.txt').read_text(), 'hello\n')
        r.restart()
        self.assertEqual(r.call('publish', {'requestId': 'publish', 'validationId': checked['id'],
                                         'expectedHead': r.head})['id'], published['id'])
        for operation in (done, checked):
            self.assertEqual(r.call('operation', {'action': 'retire',
                'requestId': 'retire-' + operation['id'], 'operationId': operation['id']})['status'], 'succeeded')
        self.assertTrue(r.call('task', {'action': 'inspect', 'taskId': w['taskId']})['task']['closed'])
        self.assertEqual(r.call('task', {'action': 'list', 'includeClosed': True})['tasks'][0]['id'], w['taskId'])

    def test_invalid_paths_cannot_change_checkpoint_or_escape_source(self):
        r = self.runtime
        w = r.open()
        for index, path in enumerate(('../escape', '/escape', '.git/config',
                                      'a/../b', 'a//b', 'a\\b', '.GiT /config')):
            with self.subTest(path=path):
                status, _, value, _ = r.request('tools/call', {'name': 'tdev_edit', 'arguments': {
                    'request': {'requestId': 'path-' + str(index), 'taskId': w['taskId'],
                        'expected': w['checkpoint'], 'edits': [
                            {'action': 'put', 'path': path, 'before': None, 'content': 'escape'}]}}})
                self.assertEqual(status, 200)
                response = value['result']['structuredContent']
                # Rejection can be an admission fault or a durable failed operation.
                error = response['result']['error'] if response['ok'] else response['error']
                self.assertEqual(error['code'], 'PATH')
                current = r.call('task', {'action': 'inspect', 'taskId': w['taskId']})
                self.assertEqual(current['task']['checkpoint'], w['checkpoint'])
                self.assertTrue(current['mutationReady'])
        self.assertFalse((r.root / 'escape').exists())

    def test_lost_reply_sigkill_stdin_replay_and_one_execution(self):
        r = self.runtime
        w = r.open()
        marker = r.root / 'executions'
        command = 'printf x >> "$MARKER"; printf ready; read value; printf "%s" "$value" >> a.txt'
        args = {'requestId': 'lost', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                'command': command, 'env': {'MARKER': str(marker)}, 'timeout': 20, 'waitMs': 0}
        r.discard_reply('exec', args)
        op = r.call('operation', {'action': 'status', 'lookupRequestId': 'lost'})
        eventually(lambda: r.status(op['id']), lambda row: 'output' in row and output(row) == b'ready')
        self.assertEqual(marker.read_bytes(), b'x')
        r.restart()  # Actual SIGKILL; independent supervisor must survive.
        replayed = r.call('exec', args)
        self.assertEqual(replayed['id'], op['id'])
        self.assertEqual(marker.read_bytes(), b'x')
        stdin = {'action': 'stdin', 'requestId': 'input', 'operationId': op['id'],
                 'sequence': 0, 'text': 'once\n', 'eof': True}
        r.discard_reply('operation', stdin)
        self.assertEqual(r.call('operation', stdin)['status'], 'succeeded')
        done = r.terminal(op['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        read = r.call('read', {'taskId': w['taskId'], 'checkpoint': done['result']['checkpoint'],
                              'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), b'hello\nonce')
        r.restart()
        self.assertEqual(r.call('exec', args)['status'], 'succeeded')
        self.assertEqual(marker.read_bytes(), b'x')

    def test_no_change_then_completion_is_visible_to_fresh_client(self):
        r = self.runtime
        w = r.open()
        args = {'requestId': 'progress', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                'command': 'printf ready; read value; printf done > a.txt', 'timeout': 20, 'waitMs': 0}
        op = r.call('exec', args)
        first = eventually(lambda: r.status(op['id'], since=''), lambda row: 'output' in row and output(row) == b'ready')
        same = r.status(op['id'], since=first['observation']['cursor'], waitMs=50)
        self.assertFalse(same['observation']['changed'])
        self.assertGreaterEqual(int(same['observation']['observedAtNs']), int(first['observation']['observedAtNs']))
        self.assertIn('pollAfterMs', same['observation'])
        r.call('operation', {'action': 'stdin', 'requestId': 'finish', 'operationId': op['id'],
                             'sequence': 0, 'text': 'go\n', 'eof': True})
        r.stop()  # No terminal reply was observed by this client before restart.
        r.start()
        current = eventually(lambda: r.call('task', {'action': 'inspect', 'taskId': w['taskId']}),
                             lambda value: value['mutationReady'])
        completed = next(row for row in current['operations'] if row['id'] == op['id'])
        self.assertEqual(completed['status'], 'succeeded')
        self.assertEqual(r.call('exec', args)['id'], op['id'])
        forward = r.call('edit', {'requestId': 'forward', 'taskId': w['taskId'],
            'expected': current['task']['checkpoint'], 'edits': [
                {'action': 'put', 'path': 'next.txt', 'before': None, 'content': 'useful next work'}]})
        self.assertEqual(forward['status'], 'succeeded')

    def test_exit_failure_and_noop_checkpoint_remain_durable(self):
        r = self.runtime
        w = r.open()
        args = {'requestId': 'failure', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                'command': 'printf failed; exit 7', 'timeout': 20, 'waitMs': 3000}
        failed = r.terminal(r.call('exec', args)['id'])
        self.assertEqual((failed['status'], failed['effect'], failed['result']['exitCode']),
                         ('failed', 'committed', 7))
        self.assertEqual(failed['result']['checkpoint'], w['checkpoint'])
        r.restart()
        replay = r.call('exec', {**args, 'waitMs': 0})
        self.assertEqual((replay['id'], replay['status']), (failed['id'], 'failed'))
        self.assertEqual(output(r.status(replay['id'])), b'failed')
        status, _, value, _ = r.request('tools/call', {'name': 'tdev_exec', 'arguments': {
            'request': {**args, 'command': 'true'}}})
        self.assertEqual(status, 200)
        self.assertEqual(value['result']['structuredContent']['error']['code'], 'IDEMPOTENCY_MISMATCH')

    def test_find_names_preserves_ambiguity_and_closed_predecessors(self):
        r = self.runtime
        first = r.call('task', {'action': 'start', 'requestId': 'one', 'label': '로그인 수정'})['result']
        second = r.call('task', {'action': 'start', 'requestId': 'two', 'label': '다른 작업'})['result']
        r.call('task', {'action': 'close', 'requestId': 'close', 'taskId': first['taskId'],
                        'expected': first['checkpoint']})
        r.restart()
        ambiguous = r.call('find', {'project': 'Human project'})
        self.assertEqual(ambiguous['resolution'], 'ambiguous')
        self.assertEqual({m['taskId'] for m in ambiguous['matches']}, {first['taskId'], second['taskId']})
        found = r.call('find', {'project': 'Human project', 'label': '로그인'})
        self.assertEqual(found['resolution'], 'unique')
        self.assertEqual(found['matches'][0]['taskId'], first['taskId'])
        again = r.call('find', {'project': 'Human project', 'label': '로그인',
                                'since': found['observation']['cursor']})
        self.assertFalse(again['observation']['changed'])

    def test_bounded_wait_json_and_opted_in_progress_sse(self):
        r = self.runtime
        w = r.open()
        args = {'requestId': 'wait', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                'command': 'printf ready; read value', 'timeout': 20, 'waitMs': 0}
        op = r.call('exec', args)
        eventually(lambda: r.status(op['id']), lambda value: 'output' in value and output(value) == b'ready')
        params = {'name': 'tdev_operation', 'arguments': {'request': {
            'action': 'status', 'operationId': op['id'], 'waitMs': 200}}}
        status, media, value, _ = r.request('tools/call', params)
        self.assertEqual((status, media), (200, 'application/json'))
        self.assertEqual(value['result']['structuredContent']['result']['status'], 'running')
        params['arguments']['request']['waitMs'] = 1500
        status, media, value, data = r.request('tools/call', params, progress='wait-token')
        self.assertEqual((status, media), (200, 'text/event-stream'))
        self.assertIn(b'notifications/progress', data)
        self.assertIn(b'wait-token', data)
        self.assertEqual(value['result']['structuredContent']['result']['id'], op['id'])


class ObjectFormatTest(unittest.TestCase):
    def test_sha256_checkpoint_and_exact_publication_survive_restart(self):
        r = Runtime(object_format='sha256')
        self.addCleanup(r.close)
        w = r.open()
        self.assertEqual(len(w['checkpoint']), 64)
        v = r.call('validate', {'requestId': 'sha256', 'taskId': w['taskId'],
            'expected': w['checkpoint'], 'message': 'sha256', 'waitMs': 0})
        done = r.terminal(v['id'])
        self.assertEqual(done['status'], 'succeeded')
        r.restart()
        p = r.call('publish', {'requestId': 'publish', 'validationId': done['id'], 'expectedHead': r.head})
        self.assertEqual(p['result']['commit'], done['result']['candidate'])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), done['result']['candidate'])
