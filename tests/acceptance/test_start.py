"""Managed task admission through HTTP; no runtime-domain imports."""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually, git


class StartTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def call(self, tool, request, **options):
        status, _, value, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': request}}, **options)
        self.assertEqual(status, 200, value)
        value = value['result']['structuredContent']
        schema = next(t['outputSchema'] for t in CONTRACT['x-tools'] if t['name'] == 'tdev_' + tool)
        jsonschema.Draft202012Validator({**schema, '$defs': CONTRACT['$defs']}).validate(value)
        return value

    def result(self, tool, request, **options):
        value = self.call(tool, request, **options)
        self.assertTrue(value['ok'], value)
        return value['result']

    def error(self, tool, request, code):
        value = self.call(tool, request)
        self.assertFalse(value['ok'], value)
        self.assertEqual(value['error']['code'], code, value)

    def start(self, request, **fields):
        operation = self.result('task', {'action': 'start', 'requestId': request, **fields})
        self.assertEqual((operation['status'], operation['effect']), ('succeeded', 'committed'), operation)
        return operation

    def space(self, request, projects, **fields):
        return self.result('workspace', {'action': 'create', 'requestId': request,
            'name': request, 'projects': projects, **fields})['result']

    def add_project(self):
        r = self.runtime
        r.config['repositories']['other'] = copy.deepcopy(r.config['repositories']['test'])
        principal = r.config['principals']['alice']
        principal['repos']['other'] = ['refs/heads/main']
        principal['managedRefNamespaces']['other'] = ['refs/heads/work/']
        r.save_config()

    def test_implicit_start_lost_reply_edit_close_and_restart_keep_original_identity(self):
        r = self.runtime
        (r.work / 'a.txt').write_text('staged\n')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_text('working\n')
        (r.work / 'untracked').write_bytes(b'preserve\x00')
        index = (r.work / '.git/index').read_bytes()
        before = git('status', '--porcelain', cwd=r.work)
        args = {'action': 'start', 'requestId': 'implicit', 'label': '작업 / isolated', 'localChanges': False}
        r.discard_reply('task', args)
        original = self.result('task', args)
        self.assertEqual(original['status'], 'succeeded')
        task = original['result']
        self.assertEqual((task['repo'], task['base'], task['checkpoint'], task['managed'], task['sourceRef']),
                         ('test', r.head, r.head, True, 'refs/heads/main'))
        self.assertTrue(task['ref'].startswith('refs/heads/work/isolated-'))
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')
        frontier = self.result('task', {'action': 'inspect', 'taskId': task['taskId']})
        self.assertEqual((frontier['task']['managed'], frontier['task']['ref_state'], frontier['remote']['head']), (1, 'reserved', None))
        self.assertEqual(frontier['task']['namespace'], 'refs/heads/work/')
        read = self.result('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), b'hello\n')
        changed = self.result('edit', {'requestId': 'managed-edit', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'changed'}]})
        self.assertEqual(changed['status'], 'succeeded')
        closed = self.result('task', {'action': 'close', 'requestId': 'managed-close',
            'taskId': task['taskId'], 'expected': changed['result']['checkpoint']})
        self.assertEqual(closed['status'], 'succeeded')
        r.restart()
        self.assertEqual(self.result('task', args), original)
        self.error('task', {**args, 'label': 'different'}, 'IDEMPOTENCY_MISMATCH')
        self.assertEqual(len(self.result('task', {'action': 'list', 'includeClosed': True})['tasks']), 1)
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('status', '--porcelain', cwd=r.work), before)
        self.assertEqual((r.work / 'untracked').read_bytes(), b'preserve\x00')
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', 'refs/heads/main'), r.head)

    def test_duplicate_admission_and_distinct_tasks_have_one_receipt_and_unique_branches(self):
        r = self.runtime
        args = {'action': 'start', 'requestId': 'duplicate', 'label': 'same'}
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.result('task', args), range(4)))
        self.assertEqual(len({op['id'] for op in responses}), 1)
        original = eventually(lambda: self.result('task', args), lambda op: op['status'] == 'succeeded')
        self.assertEqual(len(self.result('task', {'action': 'list'})['tasks']), 1)
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda request: self.start(request, label='same'), ['distinct-a', 'distinct-b']))
        tasks = [op['result'] for op in [original, *responses]]
        self.assertEqual(len({task['ref'] for task in tasks}), 3)
        self.assertEqual(len({task['taskId'] for task in tasks}), 3)
        self.assertEqual({task['base'] for task in tasks}, {r.head})
        self.assertEqual(len(self.result('workspace', {'action': 'list'})['workspaces']), 1)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')

    def test_project_and_workspace_defaults_are_explicit_and_never_global_current_state(self):
        r = self.runtime
        self.add_project()
        self.error('task', {'action': 'start', 'requestId': 'ambiguous'}, 'PROJECT_REQUIRED')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'ambiguous'}, 'OPERATION_NOT_FOUND')
        r.config['principals']['alice']['defaultRepo'] = 'test'
        r.save_config()
        self.assertEqual(self.start('principal-default')['result']['repo'], 'test')
        sole = self.space('sole', ['other'])
        self.assertEqual(self.start('sole-member', workspaceId=sole['workspaceId'])['result']['repo'], 'other')
        multi = self.space('multi', ['test', 'other'])
        self.error('task', {'action': 'start', 'requestId': 'ambiguous-space', 'workspaceId': multi['workspaceId']}, 'PROJECT_REQUIRED')
        configured = self.result('workspace', {'action': 'configure', 'requestId': 'set-default',
            'workspaceId': multi['workspaceId'], 'expectedRevision': multi['revision'], 'defaultRepo': 'other'})['result']
        self.assertEqual(self.start('space-default', workspaceId=multi['workspaceId'])['result']['repo'], 'other')
        self.assertEqual(self.start('explicit', workspaceId=multi['workspaceId'], repo='test')['result']['repo'], 'test')
        self.error('task', {'action': 'start', 'requestId': 'not-attached', 'workspaceId': sole['workspaceId'], 'repo': 'test'}, 'PROJECT_NOT_ATTACHED')
        self.error('workspace', {'action': 'detach', 'requestId': 'detach-active', 'workspaceId': multi['workspaceId'],
            'repo': 'other', 'expectedRevision': configured['revision']}, 'WORKSPACE_IN_USE')

    def test_branch_selection_expected_head_and_current_grants_gate_replay(self):
        r = self.runtime
        git('--git-dir=' + str(r.remote), 'update-ref', 'refs/heads/feature', r.head)
        r.config['repositories']['test']['refs'].append('refs/heads/feature')
        r.config['principals']['alice']['repos']['test'].append('refs/heads/feature')
        r.save_config()
        self.error('task', {'action': 'start', 'requestId': 'branch-ambiguous'}, 'BASE_REF_REQUIRED')
        self.error('task', {'action': 'start', 'requestId': 'stale', 'baseRef': 'refs/heads/main', 'expectedHead': 'a' * 40}, 'STALE_HEAD')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'stale'}, 'OPERATION_NOT_FOUND')
        r.config['repositories']['test']['defaultRef'] = 'refs/heads/feature'
        r.config['repositories']['test']['managedRefNamespaces'].insert(0, 'refs/heads/z/')
        r.config['principals']['alice']['managedRefNamespaces']['test'].insert(0, 'refs/heads/z/')
        r.save_config()
        args = {'action': 'start', 'requestId': 'granted', 'expectedHead': r.head}
        operation = self.result('task', args)
        self.assertEqual(operation['result']['sourceRef'], 'refs/heads/feature')
        self.assertTrue(operation['result']['ref'].startswith('refs/heads/work/'))
        r.config['principals']['alice']['defaultRepo'] = 'missing'
        r.config['repositories']['test']['defaultRef'] = 'refs/heads/main'
        r.save_config()
        self.assertEqual(self.result('task', args), operation)
        r.config['principals']['alice']['repos']['test'] = ['refs/heads/main']
        r.save_config()
        self.error('task', args, 'PERMISSION_DENIED')
        r.config['principals']['alice']['repos']['test'].append('refs/heads/feature')
        r.config['principals']['alice']['managedRefNamespaces']['test'] = []
        r.save_config()
        value = self.call('task', args)
        self.assertFalse(value['ok'])
        self.assertIn(value['error']['code'], ('PERMISSION_DENIED', 'MANAGED_REF_DENIED'))
        self.error('task', {'action': 'start', 'requestId': 'no-namespace', 'repo': 'test'}, 'MANAGED_REF_DENIED')
        r.config['principals']['alice']['managedRefNamespaces']['test'] = ['refs/heads/work/']
        r.save_config()
        self.assertEqual(self.result('task', args), operation)

    def test_connected_project_can_start_without_supplied_head_or_branch(self):
        r = self.runtime
        r.config['projectPolicies'] = {'local': {'kind': 'local', 'root': str(r.root),
            'managedRefNamespace': 'refs/heads/managed/', 'validation': 'true'}}
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.config['principals']['alice']['repos'] = {}
        r.save_config()
        project = self.result('project', {'action': 'connect', 'requestId': 'connect', 'policy': 'local', 'name': 'authored'})['result']
        started = self.start('delegated')
        self.assertEqual((started['result']['repo'], started['result']['base']), (project['repo'], r.head))
        self.assertTrue(started['result']['ref'].startswith('refs/heads/managed/'))
        denied = self.call('task', {'action': 'open', 'requestId': 'adopt', 'repo': project['repo'],
            'ref': started['result']['ref'], 'expectedHead': r.head})
        self.assertFalse(denied['ok'])
        self.assertIn(denied['error']['code'], ('PERMISSION_DENIED', 'REF_DENIED'))
        r.config['principals']['alice']['projectPolicies'] = []
        r.save_config()
        self.error('task', {'action': 'start', 'requestId': 'delegated'}, 'PERMISSION_DENIED')

    def test_sha256_managed_source_survives_restart_and_checkpoint_edit(self):
        r = Runtime(object_format='sha256')
        self.addCleanup(r.close)
        self.runtime = r
        operation = self.start('sha256', expectedHead=r.head)
        task = operation['result']
        self.assertEqual(len(task['base']), 64)
        edited = self.result('edit', {'requestId': 'sha256-edit', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'sha256'}]})
        self.assertEqual(edited['status'], 'succeeded')
        self.assertEqual(len(edited['result']['checkpoint']), 64)
        r.restart()
        self.assertEqual(self.result('task', {'action': 'start', 'requestId': 'sha256', 'expectedHead': r.head}), operation)
        inspected = self.result('task', {'action': 'inspect', 'taskId': task['taskId']})
        self.assertEqual(inspected['task']['checkpoint'], edited['result']['checkpoint'])
        self.assertEqual(inspected['remote']['head'], None)
