"""Published predecessor continuation through either executable's real HTTP edge.

Until P3 publication exists in both executables, seed retained publication facts
offline from actual private edit commits. These fixtures do not qualify publication.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import sqlite3
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually, git


class PredecessorCase(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime(request_timeout_seconds=45)
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

    def error(self, tool, request, code, **options):
        value = self.call(tool, request, **options)
        self.assertFalse(value['ok'], value)
        self.assertEqual(value['error']['code'], code, value)

    def sql(self, statement, params=()):
        # Only fixture-owned durable facts, modified while its controller is stopped.
        self.assertIsNone(self.runtime.process)
        connection = sqlite3.connect(self.runtime.state / 'state.sqlite')
        try:
            connection.execute(statement, params)
            connection.commit()
        finally:
            connection.close()

    def predecessor(self):
        r = self.runtime
        task = self.result('task', {'action': 'start', 'requestId': 'source'})['result']
        edited = self.result('edit', {'requestId': 'published-edit', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [
                {'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'published'}]})
        self.published = edited['result']['checkpoint']
        edited = self.result('edit', {'requestId': 'later-edit', 'taskId': task['taskId'],
            'expected': self.published, 'edits': [
                {'action': 'replace', 'path': 'a.txt', 'old': 'published', 'text': 'later'}]})
        self.later = edited['result']['checkpoint']
        r.stop()
        # Fixture adapters locate retained objects; assertions remain wire-level.
        self.retained_git = next(path for path in
            (r.state / 'sources' / 'test', r.state / 'objects' / 'test.git') if path.is_dir())
        git('--git-dir=' + str(r.remote), 'fetch', '--no-tags', '--no-write-fetch-head',
            str(self.retained_git), self.later)
        git('--git-dir=' + str(r.remote), 'update-ref', task['ref'], self.published)
        self.sql("UPDATE task SET published_oid=?,ref_state='published',closed=1 WHERE id=?",
                 (self.published, task['taskId']))
        r.start()
        self.source = task
        return task

    def args(self, request='continue', **fields):
        return {'action': 'start', 'requestId': request, 'fromTaskId': self.source['taskId'], **fields}

    def add_project(self):
        r = self.runtime
        r.config['repositories']['other'] = copy.deepcopy(r.config['repositories']['test'])
        r.config['principals']['alice']['repos']['other'] = ['refs/heads/main']
        r.config['principals']['alice']['managedRefNamespaces']['other'] = ['refs/heads/work/']
        r.config['principals']['alice']['defaultRepo'] = 'other'
        r.save_config()


class PredecessorTest(PredecessorCase):
    def test_retained_publication_after_cleanup_ignores_head_defaults_and_preserves_dirty_checkout(self):
        r = self.runtime
        source = self.predecessor()
        done = self.result('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': source['taskId']})
        self.assertEqual(done['status'], 'succeeded', done)
        space = self.result('workspace', {'action': 'inspect', 'workspaceId': source['workspaceId']})
        detached = self.result('workspace', {'action': 'detach', 'requestId': 'detach',
            'workspaceId': source['workspaceId'], 'repo': 'test', 'expectedRevision': space['workspace']['revision']})
        self.result('workspace', {'action': 'close', 'requestId': 'close-space',
            'workspaceId': source['workspaceId'], 'expectedRevision': detached['result']['revision']})
        destination = self.result('workspace', {'action': 'create', 'requestId': 'destination',
            'name': 'New work', 'projects': ['test']})['result']
        git('--git-dir=' + str(r.remote), 'update-ref', 'refs/heads/main', self.later)
        self.add_project()
        r.config['repositories']['test']['managedRefNamespaces'].insert(0, 'refs/heads/earlier/')
        r.config['principals']['alice']['managedRefNamespaces']['test'].insert(0, 'refs/heads/earlier/')
        r.save_config()
        (r.work / 'a.txt').write_text('staged')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_text('working')
        (r.work / 'untracked').write_bytes(b'keep\x00')
        index = (r.work / '.git/index').read_bytes()
        args = self.args(workspaceId=destination['workspaceId'], expectedHead=self.published)
        r.discard_reply('task', args)
        operation = self.result('task', args)
        self.assertEqual((operation['status'], operation['effect']), ('succeeded', 'committed'))
        task = operation['result']
        self.assertEqual((task['repo'], task['base'], task['checkpoint'], task['sourceRef']),
                         ('test', self.published, self.published, 'refs/heads/main'))
        self.assertNotEqual(task['taskId'], source['taskId'])
        self.assertNotEqual(task['ref'], source['ref'])
        self.assertTrue(task['ref'].startswith('refs/heads/work/'))
        read = self.result('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), b'published\n')
        r.restart()
        self.assertEqual(self.result('task', args), operation)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')
        old = self.result('task', {'action': 'inspect', 'taskId': source['taskId']})
        self.assertEqual((old['task']['closed'], old['task']['checkpoint'], old['task']['published_oid']),
                         (1, self.later, self.published))
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual((r.work / 'a.txt').read_text(), 'working')
        self.assertEqual((r.work / 'untracked').read_bytes(), b'keep\x00')

    def test_unpublished_unmanaged_wrong_owner_and_incompatible_inputs_are_not_admitted(self):
        r = self.runtime
        unpublished = self.result('task', {'action': 'start', 'requestId': 'unpublished'})['result']
        unmanaged = self.result('task', {'action': 'open', 'requestId': 'unmanaged', 'repo': 'test',
            'ref': 'refs/heads/main', 'expectedHead': r.head})['result']
        for task in (unpublished, unmanaged):
            request = {'action': 'start', 'requestId': 'reject-' + task['taskId'], 'fromTaskId': task['taskId']}
            self.error('task', request, 'PUBLISHED_TASK_REQUIRED')
            self.error('operation', {'action': 'status', 'lookupRequestId': request['requestId']}, 'OPERATION_NOT_FOUND')
        source = self.predecessor()
        self.add_project()
        for request, code in ((self.args('wrong-repo', repo='other'), 'SOURCE_CHANGED'),
                              (self.args('wrong-head', expectedHead=r.head), 'STALE_HEAD'),
                              (self.args('import', localChanges=True), 'SCHEMA'),
                              (self.args('branch', baseRef='refs/heads/main'), 'SCHEMA')):
            self.error('task', request, code)
            self.error('operation', {'action': 'status', 'lookupRequestId': request['requestId']}, 'OPERATION_NOT_FOUND')
        from hashlib import sha256
        r.config['principals']['bob'] = copy.deepcopy(r.config['principals']['alice'])
        r.config['principals']['bob']['tokenHash'] = sha256(b'bob-secret').hexdigest()
        r.save_config()
        self.error('task', self.args('wrong-owner'), 'TASK_NOT_FOUND', headers={'Authorization': 'Bearer bob-secret'})
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', source['ref']), self.published)

    def test_duplicate_and_distinct_requests_preserve_frozen_receipt_and_current_authority(self):
        r = self.runtime
        self.predecessor()
        args = self.args()
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(lambda _: self.result('task', args), range(4)))
        self.assertEqual(len({op['id'] for op in replies}), 1)
        original = eventually(lambda: self.result('task', args), lambda op: op['status'] == 'succeeded')
        first = self.result('task', self.args('first'))
        self.assertNotEqual(first['result']['ref'], original['result']['ref'])
        r.stop()
        self.sql('UPDATE task SET published_oid=? WHERE id=?', (self.later, self.source['taskId']))
        r.start()
        self.assertEqual(self.result('task', args), original)
        fresh = self.result('task', self.args('fresh'))
        self.assertEqual(fresh['result']['base'], self.later)
        self.error('task', {**args, 'label': 'changed'}, 'IDEMPOTENCY_MISMATCH')
        r.config['principals']['alice']['managedRefNamespaces']['test'] = []
        r.save_config()
        for tool, request in (('task', args), ('operation', {'action': 'status', 'operationId': original['id']})):
            self.assertFalse(self.call(tool, request)['ok'])
        r.config['principals']['alice']['managedRefNamespaces']['test'] = ['refs/heads/work/']
        r.save_config()
        r.restart()
        self.assertEqual(self.result('task', args), original)

    def test_explicit_predecessor_selects_project_but_requires_destination_membership(self):
        self.predecessor()
        self.add_project()
        destination = self.result('workspace', {'action': 'create', 'requestId': 'space',
            'name': 'Both', 'projects': ['test', 'other'], 'defaultRepo': 'other'})['result']
        result = self.result('task', self.args(workspaceId=destination['workspaceId']))
        self.assertEqual((result['status'], result['result']['repo']), ('succeeded', 'test'))
        other = self.result('workspace', {'action': 'create', 'requestId': 'other-space',
            'name': 'Other', 'projects': ['other']})['result']
        self.error('task', self.args('not-attached', workspaceId=other['workspaceId']), 'PROJECT_NOT_ATTACHED')
        empty = self.result('workspace', {'action': 'create', 'requestId': 'empty', 'name': 'Empty'})['result']
        self.result('workspace', {'action': 'close', 'requestId': 'close-empty',
            'workspaceId': empty['workspaceId'], 'expectedRevision': empty['revision']})
        self.error('task', self.args('closed', workspaceId=empty['workspaceId']), 'WORKSPACE_CLOSED')

    def test_sha256_retained_predecessor_is_independent_new_source(self):
        r = self.runtime = Runtime(object_format='sha256', request_timeout_seconds=45)
        self.addCleanup(r.close)
        self.predecessor()
        self.result('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': self.source['taskId']})
        args = self.args()
        operation = self.result('task', args)
        task = operation['result']
        self.assertEqual((task['base'], task['checkpoint']), (self.published, self.published))
        self.assertEqual(len(task['checkpoint']), 64)
        edited = self.result('edit', {'requestId': 'new-edit', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'published', 'text': 'new'}]})
        self.assertEqual(edited['status'], 'succeeded')
        self.assertNotEqual(edited['result']['checkpoint'], self.later)
        r.restart()
        self.assertEqual(self.result('task', args), operation)
