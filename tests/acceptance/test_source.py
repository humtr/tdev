"""Local source contracts through real HTTP, with no implementation imports."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, git


class SourceTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)
        self.validators = {tool['name']: jsonschema.Draft202012Validator(
            {**tool['outputSchema'], '$defs': CONTRACT['$defs']}) for tool in CONTRACT['x-tools']}

    def call(self, tool, args, **options):
        status, _, value, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': args}}, **options)
        self.assertEqual(status, 200, value)
        result = value['result']['structuredContent']
        self.validators['tdev_' + tool].validate(result)
        self.assertTrue(result['ok'], result)
        return result['result']

    def error(self, tool, args, code, **options):
        status, _, value, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': args}}, **options)
        self.assertEqual(status, 200, value)
        result = value['result']['structuredContent']
        self.validators['tdev_' + tool].validate(result)
        self.assertFalse(result['ok'], result)
        self.assertEqual(result['error']['code'], code, result)

    def read(self, task, queries, **fields):
        return self.call('read', {'taskId': task['taskId'], 'queries': queries, **fields})

    def test_lost_open_and_edit_reply_replay_after_restart_and_close(self):
        r = self.runtime
        opened = {'action': 'open', 'requestId': 'lost-open', 'repo': 'test',
                  'ref': 'refs/heads/main', 'expectedHead': r.head}
        r.discard_reply('task', opened)
        original = self.call('operation', {'action': 'status', 'lookupRequestId': 'lost-open'})
        self.assertEqual(original['status'], 'succeeded')
        task = original['result']
        r.restart()
        self.assertEqual(self.call('task', opened)['id'], original['id'])
        edit = {'requestId': 'lost-edit', 'taskId': task['taskId'], 'expected': task['checkpoint'],
                'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': '안녕'}]}
        r.discard_reply('edit', edit)
        changed = self.call('edit', edit)
        checkpoint = changed['result']['checkpoint']
        r.restart()
        self.assertEqual(self.call('edit', edit), changed)
        closed = self.call('task', {'action': 'close', 'requestId': 'close',
                                  'taskId': task['taskId'], 'expected': checkpoint})
        self.assertEqual(closed['status'], 'succeeded')
        self.assertEqual(self.call('edit', edit), changed)
        read = self.read(task, [{'action': 'file', 'path': 'a.txt'}])
        self.assertEqual(base64.b64decode(read['items'][0]['data']), '안녕\n'.encode())
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), r.head)

    def test_atomic_batch_binary_modes_move_delete_and_failure(self):
        task = self.runtime.open()
        setup = self.call('edit', {'requestId': 'setup', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'put', 'path': 'delete-me',
                'content': 'temporary', 'before': None}]})
        before = self.read(task, [{'action': 'list'}])
        entries = {entry['path']: entry['blob'] for entry in before['items'][0]['entries']}
        edits = [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': '새 내용'},
            {'action': 'move', 'path': 'b.txt', 'to': 'nested/renamed', 'before': entries['b.txt']},
            {'action': 'delete', 'path': 'delete-me', 'before': entries['delete-me']},
            {'action': 'put', 'path': 'binary', 'content': base64.b64encode(b'\x00\xff').decode(),
             'encoding': 'base64', 'mode': '100755', 'before': None}]
        args = {'requestId': 'batch', 'taskId': task['taskId'], 'expected': setup['result']['checkpoint'], 'edits': edits}
        changed = self.call('edit', args)
        self.assertEqual(changed['status'], 'succeeded')
        read = self.read(task, [{'action': 'list'}, {'action': 'file', 'path': 'binary'},
            {'action': 'search', 'text': '새'}, {'action': 'diff', 'format': 'names'}, {'action': 'history'}])
        self.assertEqual({e['path'] for e in read['items'][0]['entries']}, {'a.txt', 'nested/renamed', 'binary'})
        self.assertEqual(base64.b64decode(read['items'][1]['data']), b'\x00\xff')
        self.assertEqual(read['items'][1]['mode'], '100755')
        self.assertEqual(read['items'][2]['hits'], [{'path': 'a.txt', 'byteOffset': 0}])
        self.assertIn(b'binary', base64.b64decode(read['items'][3]['data']))
        self.assertIn(changed['result']['checkpoint'].encode(), base64.b64decode(read['items'][4]['data']))
        bad = self.call('edit', {'requestId': 'bad-batch', 'taskId': task['taskId'],
            'expected': changed['result']['checkpoint'], 'edits': [
                {'action': 'put', 'path': 'must-not-exist', 'content': 'x', 'before': None},
                {'action': 'replace', 'path': 'a.txt', 'old': 'not present', 'text': 'x'}]})
        self.assertEqual((bad['status'], bad['effect']), ('failed', 'none'))
        self.assertIsNotNone(bad['error'])
        unchanged = self.read(task, [{'action': 'list'}, {'action': 'file', 'path': '../secret'}])
        self.assertEqual(unchanged['checkpoint'], changed['result']['checkpoint'])
        self.assertNotIn('must-not-exist', [e['path'] for e in unchanged['items'][0]['entries']])
        self.assertEqual(unchanged['items'][1]['error']['code'], 'PATH')

    def test_concurrent_checkpoint_cas_and_duplicate_admission(self):
        task = self.runtime.open()
        def edit(index):
            return self.runtime.request('tools/call', {'name': 'tdev_edit', 'arguments': {'request': {
                'requestId': 'race-' + str(index), 'taskId': task['taskId'], 'expected': task['checkpoint'],
                'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': str(index)}]}}})[2]['result']['structuredContent']
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(edit, range(2)))
        winners = [r['result'] for r in results if r['ok']]
        self.assertEqual(len(winners), 1, results)
        self.assertEqual(winners[0]['status'], 'succeeded')
        loser = next(r for r in results if not r['ok'])
        self.assertIn(loser['error']['code'], ('TASK_BUSY', 'STALE_CHECKPOINT'))
        current = winners[0]['result']['checkpoint']
        args = {'requestId': 'duplicate', 'taskId': task['taskId'], 'expected': current,
                'edits': [{'action': 'put', 'path': 'once', 'content': 'one', 'before': None}]}
        with ThreadPoolExecutor(max_workers=4) as pool:
            receipts = list(pool.map(lambda _: self.call('edit', args), range(4)))
        self.assertEqual(len({r['id'] for r in receipts}), 1)
        done = self.runtime.terminal(receipts[0]['id'])
        self.assertEqual(done['status'], 'succeeded')
        self.assertEqual(self.read(task, [{'action': 'list'}])['checkpoint'], done['result']['checkpoint'])
        self.error('edit', {**args, 'edits': [{'action': 'put', 'path': 'different', 'content': 'x', 'before': None}]}, 'IDEMPOTENCY_MISMATCH')

    def test_workspace_membership_revision_and_close_guards(self):
        self.error('workspace', {'action': 'create', 'requestId': 'unattached-default',
            'name': 'Invalid', 'defaultRepo': 'test'}, 'PROJECT_NOT_ATTACHED')
        create = {'action': 'create', 'requestId': 'space', 'name': 'Development'}
        op = self.call('workspace', create)
        workspace = op['result']
        attach = {'action': 'attach', 'requestId': 'attach', 'workspaceId': workspace['workspaceId'],
                  'expectedRevision': workspace['revision'], 'repo': 'test'}
        attached = self.call('workspace', attach)
        workspace = attached['result']
        self.assertEqual(self.call('workspace', attach), attached)
        configured = self.call('workspace', {'action': 'configure', 'requestId': 'configure',
            'workspaceId': workspace['workspaceId'], 'expectedRevision': workspace['revision'], 'defaultRepo': 'test'})
        workspace = configured['result']
        self.error('workspace', {**attach, 'requestId': 'stale'}, 'STALE_WORKSPACE')
        task = self.call('task', {'action': 'open', 'requestId': 'explicit', 'repo': 'test',
            'ref': 'refs/heads/main', 'expectedHead': self.runtime.head, 'workspaceId': workspace['workspaceId']})['result']
        self.assertEqual(task['workspaceId'], workspace['workspaceId'])
        for action in ('close', 'detach'):
            args = {'action': action, 'requestId': 'blocked-' + action,
                    'workspaceId': workspace['workspaceId'], 'expectedRevision': workspace['revision']}
            if action == 'detach': args['repo'] = 'test'
            self.error('workspace', args, 'WORKSPACE_IN_USE')
        self.call('task', {'action': 'close', 'requestId': 'close-task', 'taskId': task['taskId'], 'expected': task['checkpoint']})
        detached = self.call('workspace', {'action': 'detach', 'requestId': 'detach', 'repo': 'test',
            'workspaceId': workspace['workspaceId'], 'expectedRevision': workspace['revision']})['result']
        self.assertEqual(detached['projects'], [])
        closed = self.call('workspace', {'action': 'close', 'requestId': 'close-space',
            'workspaceId': workspace['workspaceId'], 'expectedRevision': detached['revision']})['result']
        self.assertTrue(closed['closed'])
        self.runtime.restart()
        self.assertEqual(self.call('workspace', create), op)
        self.assertEqual(self.call('workspace', {'action': 'list'})['workspaces'], [])
        self.assertEqual(len(self.call('workspace', {'action': 'list', 'includeClosed': True})['workspaces']), 1)

    def test_project_projection_task_and_workspace_paging_freshness(self):
        project = self.call('project', {'action': 'list'})['projects'][0]
        self.assertEqual((project['repo'], project['defaultRef']), ('test', 'refs/heads/main'))
        self.assertEqual(self.call('project', {'action': 'inspect', 'repo': 'test'})['head'], self.runtime.head)
        spaces = []
        for index in range(3):
            space = self.call('workspace', {'action': 'create', 'requestId': 'space-' + str(index),
                'name': str(index), 'projects': ['test']})['result']
            spaces.append(space)
            self.call('task', {'action': 'open', 'requestId': 'task-' + str(index), 'repo': 'test',
                'ref': 'refs/heads/main', 'expectedHead': self.runtime.head, 'workspaceId': space['workspaceId']})
        page = self.call('workspace', {'action': 'list', 'limit': 1})
        second = self.call('workspace', {'action': 'list', 'limit': 1, 'after': page['nextAfter']})
        self.assertNotEqual(page['workspaces'][0]['workspaceId'], second['workspaces'][0]['workspaceId'])
        tasks = self.call('task', {'action': 'list', 'limit': 1})
        next_tasks = self.call('task', {'action': 'list', 'limit': 1, 'after': tasks['nextAfter']})
        self.assertNotEqual(tasks['tasks'][0]['id'], next_tasks['tasks'][0]['id'])
        args = {'action': 'inspect', 'taskId': tasks['tasks'][0]['id']}
        first = self.call('task', args)
        again = self.call('task', {**args, 'since': first['observation']['cursor']})
        self.assertFalse(again['observation']['changed'])
        inspected = self.call('workspace', {'action': 'inspect', 'workspaceId': spaces[0]['workspaceId']})
        self.assertEqual(len(inspected['tasks']), 1)
        self.assertEqual(inspected['pendingTasks'], [])

    def test_revoked_resource_and_credentials_cannot_replay(self):
        r = self.runtime
        task = r.open()
        args = {'requestId': 'owned', 'taskId': task['taskId'], 'expected': task['checkpoint'],
                'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'changed'}]}
        op = self.call('edit', args)
        r.config['principals']['alice']['repos']['test'] = []
        r.save_config()
        self.error('edit', args, 'PERMISSION_DENIED')
        self.error('operation', {'action': 'status', 'operationId': op['id']}, 'PERMISSION_DENIED')
        r.config['principals']['alice']['repos']['test'] = ['refs/heads/main']
        r.config['credentials'] = {'cred_' + '1' * 32: {'principal': 'alice', 'tokenHash': hashlib.sha256(b'new-secret').hexdigest(), 'state': 'active'}}
        r.config['principals']['alice']['tokenHash'] = hashlib.sha256(b'rotated-secret').hexdigest()
        r.save_config()
        self.assertEqual(r.request()[0], 401)
        self.assertEqual(self.call('edit', args, headers={'Authorization': 'Bearer new-secret'}), op)
        r.config['principals']['bob'] = {'tokenHash': hashlib.sha256(b'bob-secret').hexdigest(), 'repos': {'test': ['refs/heads/main']}}
        r.save_config()
        self.error('operation', {'action': 'status', 'operationId': op['id']}, 'OPERATION_NOT_FOUND', headers={'Authorization': 'Bearer bob-secret'})
        r.config['credentials']['cred_' + '1' * 32]['state'] = 'revoked'
        r.save_config()
        self.assertEqual(r.request(headers={'Authorization': 'Bearer new-secret'})[0], 401)

    def test_schema_metadata_fail_before_durable_admission_and_query_errors_are_local(self):
        r = self.runtime
        for headers, code in [({'Authorization': 'Bearer wrong'}, 401), ({'Host': 'bad'}, 403),
            ({'Origin': 'https://bad'}, 403), ({'Mcp-Method': None}, 400), ({'MCP-Protocol-Version': None}, 400)]:
            self.assertEqual(r.request(headers=headers)[0], code)
        args = {'action': 'open', 'requestId': 'invalid', 'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': r.head, 'adminApproved': True}
        self.error('task', args, 'SCHEMA')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'invalid'}, 'OPERATION_NOT_FOUND')
        task = r.open()
        result = self.read(task, [{'action': 'file', 'path': '../escape'}, {'action': 'file', 'path': 'a.txt'}, {'action': 'file', 'path': 'missing'}])
        self.assertEqual(result['items'][0]['error']['code'], 'PATH')
        self.assertEqual(base64.b64decode(result['items'][1]['data']), b'hello\n')
        self.assertEqual(result['items'][2]['error']['code'], 'FILE_NOT_FOUND')

    def test_unbounded_offsets_and_utf8_pages_are_lossless(self):
        task = self.runtime.open()
        self.call('edit', {'requestId': 'unicode', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': '가나다'}]})
        chunks, offset = [], 0
        while True:
            item = self.read(task, [{'action': 'file', 'path': 'a.txt', 'offset': offset, 'limit': 2}])['items'][0]
            chunks.append(base64.b64decode(item['data']))
            offset = item['nextOffset']
            if item['complete']: break
        self.assertEqual(b''.join(chunks), '가나다\n'.encode())
        huge = 10 ** 100 + 1
        item = self.read(task, [{'action': 'file', 'path': 'a.txt', 'offset': huge}])['items'][0]
        self.assertEqual((item['offset'], item['nextOffset'], item['data'], item['complete']), (huge, huge, '', True))

    def test_sha256_source_checkpoint_restart_and_aba(self):
        self.runtime = Runtime('sha256')
        # addCleanup above resolves self.runtime at registration time, so own this fixture too.
        self.addCleanup(self.runtime.close)
        task = self.runtime.open()
        self.assertEqual(len(task['checkpoint']), 64)
        first = self.call('edit', {'requestId': 'b', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'changed'}]})
        second = self.call('edit', {'requestId': 'a', 'taskId': task['taskId'], 'expected': first['result']['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'changed', 'text': 'hello'}]})
        self.assertNotEqual(second['result']['checkpoint'], task['checkpoint'])
        self.runtime.restart()
        self.assertEqual(self.read(task, [{'action': 'file', 'path': 'a.txt'}])['checkpoint'], second['result']['checkpoint'])
        self.error('edit', {'requestId': 'stale', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'put', 'path': 'new', 'content': 'x', 'before': None}]}, 'STALE_CHECKPOINT')


if __name__ == '__main__':
    unittest.main()
