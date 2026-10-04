"""Owned empty-ref cleanup and retained source/authority through either executable."""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually, git


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def call(self, tool, request, **options):
        status, _, reply, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': request}}, **options)
        self.assertEqual(status, 200, reply)
        value = reply['result']['structuredContent']
        schema = next(t['outputSchema'] for t in CONTRACT['x-tools'] if t['name'] == 'tdev_' + tool)
        jsonschema.Draft202012Validator({**schema, '$defs': CONTRACT['$defs']}).validate(value)
        return value

    def result(self, tool, request, **options):
        value = self.call(tool, request, **options)
        self.assertTrue(value['ok'], value)
        return value['result']

    def task(self, request='start', **fields):
        operation = self.result('task', {'action': 'start', 'requestId': request, **fields})
        self.assertEqual(operation['status'], 'succeeded', operation)
        return operation['result']

    def args(self, task, request='cleanup'):
        return {'action': 'cleanup', 'requestId': request, 'taskId': task['taskId']}

    def inspect(self, task):
        return self.result('task', {'action': 'inspect', 'taskId': task['taskId']})

    def test_empty_cleanup_closes_source_preserves_checkout_and_replay_never_deletes_recreated_ref(self):
        r = self.runtime
        task = self.task()
        (r.work / 'a.txt').write_text('staged')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_text('working')
        (r.work / 'untracked').write_bytes(b'keep\x00')
        index = (r.work / '.git/index').read_bytes()
        self.assertEqual(self.inspect(task)['refCleanup'], 'ready')
        args = self.args(task)
        r.discard_reply('task', args)
        original = self.result('task', args)
        self.assertEqual((original['status'], original['effect']), ('succeeded', 'committed'))
        self.assertEqual(original['result'], {'taskId': task['taskId'], 'ref': task['ref'], 'cleaned': True})
        current = self.inspect(task)
        self.assertEqual((current['task']['closed'], current['task']['ref_state'], current['refCleanup']), (1, 'deleted', 'done'))
        self.assertEqual(current['task']['checkpoint'], task['checkpoint'])
        data = self.result('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(data['items'][0]['data']), b'hello\n')
        git('--git-dir=' + str(r.remote), 'update-ref', task['ref'], r.head)
        r.restart()
        self.assertEqual(self.result('task', args), original)
        self.assertEqual(self.inspect(task)['refCleanup'], 'changed')
        failed = self.result('task', self.args(task, 'new-cleanup'))
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', 'REF_NOT_OWNED'))
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', task['ref']), r.head)
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual((r.work / 'a.txt').read_text(), 'working')
        self.assertEqual((r.work / 'untracked').read_bytes(), b'keep\x00')
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), r.head)

    def test_cleanup_after_workspace_detach_close_keeps_current_authority(self):
        r = self.runtime
        task = self.task()
        self.result('task', {'action': 'close', 'requestId': 'close-task', 'taskId': task['taskId'], 'expected': task['checkpoint']})
        space = self.result('workspace', {'action': 'inspect', 'workspaceId': task['workspaceId']})
        detached = self.result('workspace', {'action': 'detach', 'requestId': 'detach', 'workspaceId': task['workspaceId'], 'repo': 'test', 'expectedRevision': space['workspace']['revision']})
        self.result('workspace', {'action': 'close', 'requestId': 'close-space', 'workspaceId': task['workspaceId'], 'expectedRevision': detached['result']['revision']})
        args = self.args(task)
        done = self.result('task', args)
        self.assertEqual(done['status'], 'succeeded', done)
        r.restart()
        self.assertEqual(self.result('task', args), done)
        r.config['principals']['alice']['managedRefNamespaces'] = {}
        r.save_config()
        for tool, request in [('task', args), ('operation', {'action': 'status', 'operationId': done['id']})]:
            self.assertIn(self.call(tool, request)['error']['code'], ('PERMISSION_DENIED','MANAGED_REF_DENIED'))
        r.config['principals']['alice']['managedRefNamespaces'] = {'test': ['refs/heads/work/']}
        r.save_config()
        self.assertEqual(self.result('task', args), done)

    def test_unmanaged_foreign_and_other_principal_refs_are_preserved(self):
        r = self.runtime
        canonical = self.result('task', {'action': 'open', 'requestId': 'open', 'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': r.head})['result']
        failed = self.result('task', self.args(canonical, 'canonical'))
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', 'REF_NOT_OWNED'))
        self.assertEqual(self.inspect(canonical)['task']['closed'], 0)
        task = self.task()
        git('--git-dir=' + str(r.remote), 'update-ref', task['ref'], r.head)
        failed = self.result('task', self.args(task))
        self.assertEqual(failed['error']['code'], 'REF_NOT_OWNED')
        self.assertEqual(self.inspect(task)['refCleanup'], 'changed')
        r.config['principals']['bob'] = copy.deepcopy(r.config['principals']['alice'])
        from hashlib import sha256
        r.config['principals']['bob']['tokenHash'] = sha256(b'bob-secret').hexdigest()
        r.save_config()
        denied = self.call('task', self.args(task, 'foreign-owner'), headers={'Authorization': 'Bearer bob-secret'})
        self.assertEqual(denied['error']['code'], 'TASK_NOT_FOUND')
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', task['ref']), r.head)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), r.head)

    def test_duplicate_cleanup_has_one_receipt_and_fresh_tasks_never_reuse_names(self):
        r = self.runtime
        task = self.task()
        args = self.args(task)
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(lambda _: self.result('task', args), range(4)))
        self.assertEqual(len({op['id'] for op in replies}), 1)
        done = eventually(lambda: self.result('task', args), lambda op: op['status'] == 'succeeded')
        self.assertIsNone(self.inspect(task)['task']['busy'])
        fresh = self.task('fresh')
        self.assertNotEqual((fresh['taskId'], fresh['ref']), (task['taskId'], task['ref']))
        self.assertEqual(self.call('task', self.args(fresh))['error']['code'], 'IDEMPOTENCY_MISMATCH')
        r.restart()
        self.assertEqual(self.result('task', args), done)

    def test_sha256_cleanup_keeps_source_and_exact_replay_identity(self):
        r = Runtime(object_format='sha256')
        self.addCleanup(r.close)
        self.runtime = r
        task = self.task()
        done = self.result('task', self.args(task))
        self.assertEqual(done['status'], 'succeeded', done)
        self.assertEqual(len(self.inspect(task)['task']['checkpoint']), 64)
        r.restart()
        self.assertEqual(self.result('task', self.args(task)), done)
