"""Delegation and enrollment through actual HTTP and disposable local projects."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, git


class ProjectTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)
        r = self.runtime
        r.config['projectPolicies'] = {'local': {'kind': 'local', 'root': str(r.root),
            'allowCreate': True, 'managedRefNamespace': 'refs/heads/managed/',
            'validation': 'test -f README.md', 'validationTimeoutSeconds': 21}}
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.save_config()

    def call(self, tool, args, **options):
        status, _, value, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': args}}, **options)
        self.assertEqual(status, 200, value)
        value = value['result']['structuredContent']
        schema = next(t['outputSchema'] for t in CONTRACT['x-tools'] if t['name'] == 'tdev_' + tool)
        jsonschema.Draft202012Validator({**schema, '$defs': CONTRACT['$defs']}).validate(value)
        return value

    def result(self, tool, args, **options):
        value = self.call(tool, args, **options)
        self.assertTrue(value['ok'], value)
        return value['result']

    def error(self, tool, args, code, **options):
        value = self.call(tool, args, **options)
        self.assertFalse(value['ok'], value)
        self.assertEqual(value['error']['code'], code, value)

    def change(self, action, request, name, **fields):
        return self.result('project', {'action': action, 'requestId': request,
            'policy': 'local', 'name': name, **fields})

    def failed(self, action, request, name, code):
        value = self.change(action, request, name)
        self.assertEqual((value['status'], value['effect'], value['error']['code']),
                         ('failed', 'none', code), value)
        return value

    def test_connect_preserves_dirty_checkout_and_receipts_follow_current_policy(self):
        r = self.runtime
        (r.work / 'a.txt').write_text('staged\n')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_text('working\n')
        (r.work / 'untracked').write_bytes(b'untouched\x00')
        index = (r.work / '.git/index').read_bytes()
        before = git('status', '--porcelain', cwd=r.work)
        args = {'action': 'connect', 'requestId': 'connect', 'policy': 'local', 'name': 'authored'}
        r.discard_reply('project', args)
        receipt = self.result('project', args)
        self.assertEqual((receipt['status'], receipt['effect']), ('succeeded', 'committed'))
        project = receipt['result']
        st = (r.work / '.git').stat()
        identity = f'local:{st.st_dev}:{st.st_ino}'
        expected = hashlib.sha256(json.dumps(['alice', identity], separators=(',', ':')).encode()).hexdigest()[:24]
        self.assertEqual(project['repo'], 'p-' + expected)
        self.assertEqual((project['name'], project['identity'], project['policy']), ('authored', identity, 'local'))
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('status', '--porcelain', cwd=r.work), before)
        self.assertEqual(git('rev-parse', 'HEAD', cwd=r.work), r.head)
        task = self.result('task', {'action': 'open', 'requestId': 'delegated-open',
            'repo': project['repo'], 'ref': 'refs/heads/main', 'expectedHead': r.head})['result']
        read = self.result('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), b'hello\n')
        r.restart()
        self.assertEqual(self.result('project', args), receipt)
        policy = r.config['projectPolicies']['local']
        policy.update(validation='new operator command', validationTimeoutSeconds=73,
                      managedRefNamespace='refs/heads/current/')
        r.save_config()
        current = self.result('project', {'action': 'inspect', 'repo': project['repo']})
        self.assertEqual((current['validationTimeoutSeconds'], current['managedRefNamespaces']),
                         (73, ['refs/heads/current/']))
        self.assertEqual(self.result('project', args), receipt)
        other = self.change('connect', 'same-project', 'authored')
        self.assertEqual(other['result'], {k: v for k, v in current.items() if k != 'head'})
        r.config['principals']['alice']['projectPolicies'] = []
        r.save_config()
        self.error('project', args, 'PROJECT_POLICY_DENIED')
        self.error('operation', {'action': 'status', 'operationId': receipt['id']}, 'PROJECT_POLICY_DENIED')
        self.error('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]}, 'PERMISSION_DENIED')
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 1)
        r.config['principals']['alice']['projectPolicies'] = ['local']
        policy['root'] = str(r.work)
        r.save_config()
        self.error('project', args, 'PROJECT_SCOPE_CHANGED')
        policy['root'] = str(r.root)
        r.save_config()
        self.assertEqual(self.result('project', args), receipt)

    def test_create_replay_duplicate_requests_existing_files_and_current_creation_grant(self):
        r = self.runtime
        listing = self.result('project', {'action': 'list'})
        self.assertEqual(listing['policies'], [{'name': 'local', 'provider': 'local',
            'scope': str(r.root), 'canCreate': True}])
        args = {'action': 'create', 'requestId': 'new', 'policy': 'local', 'name': 'New_project'}
        r.discard_reply('project', args)
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(lambda _: self.result('project', args), range(4)))
        self.assertEqual(len({reply['id'] for reply in replies}), 1)
        completed = self.result('project', args)
        self.assertEqual((completed['status'], completed['effect']), ('succeeded', 'committed'))
        self.assertEqual(completed['result']['name'], 'New_project')
        target = r.root / 'New_project'
        head = git('rev-parse', 'HEAD', cwd=target)
        self.assertEqual(git('rev-list', '--count', 'HEAD', cwd=target), '1')
        self.assertEqual((target / 'README.md').read_text(), '# New_project\n')
        r.restart()
        self.assertEqual(self.result('project', args), completed)
        self.error('project', {**args, 'name': 'Other'}, 'IDEMPOTENCY_MISMATCH')
        self.failed('create', 'exists', 'New_project', 'PROJECT_EXISTS')
        self.assertEqual(git('rev-parse', 'HEAD', cwd=target), head)
        self.failed('create', 'invalid-name', 'nested/project', 'PROJECT_NAME')
        policy = r.config['projectPolicies']['local']
        policy['allowCreate'] = False
        r.save_config()
        self.assertEqual(self.result('project', args), completed)
        self.error('project', {**args, 'requestId': 'denied', 'name': 'Denied'}, 'PROJECT_CREATE_DENIED')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'denied'}, 'OPERATION_NOT_FOUND')
        self.assertFalse((r.root / 'Denied').exists())

    def test_connect_scope_linked_worktrees_identity_and_principal_ownership(self):
        r = self.runtime
        outside = r.root / 'outside'
        outside.mkdir()
        scoped = r.root / 'scope'
        scoped.mkdir()
        (scoped / 'escape').symlink_to(r.work, target_is_directory=True)
        r.config['projectPolicies']['local']['root'] = str(scoped)
        r.save_config()
        self.failed('connect', 'escape', 'escape', 'PROJECT_PATH')
        self.failed('connect', 'traverse', '../authored', 'PROJECT_PATH')
        r.config['projectPolicies']['local']['root'] = str(r.root)
        r.save_config()
        (r.work / 'subdir').mkdir()
        self.failed('connect', 'subdir', 'authored/subdir', 'PROJECT_PATH')
        self.failed('connect', 'not-git', 'outside', 'GIT_PROJECT_REQUIRED')
        linked = r.root / 'linked'
        git('worktree', 'add', '-b', 'feature', str(linked), cwd=r.work)
        connected = self.change('connect', 'linked', 'linked')
        self.assertEqual(connected['status'], 'succeeded')
        self.assertEqual(connected['result']['checkout'], str(linked))
        self.failed('connect', 'alternate-checkout', 'authored', 'PROJECT_ALREADY_CONNECTED')
        r.config['principals']['bob'] = {'tokenHash': hashlib.sha256(b'bob-secret').hexdigest(),
            'repos': {}, 'projectPolicies': ['local']}
        r.save_config()
        bob = self.result('project', {'action': 'connect', 'requestId': 'linked',
            'policy': 'local', 'name': 'linked'}, headers={'Authorization': 'Bearer bob-secret'})
        self.assertEqual(bob['status'], 'succeeded')
        self.assertNotEqual(bob['result']['repo'], connected['result']['repo'])
        self.error('operation', {'action': 'status', 'operationId': connected['id']},
                   'OPERATION_NOT_FOUND', headers={'Authorization': 'Bearer bob-secret'})
        old = r.work / '.git'
        old.rename(r.work / '.git-original')
        git('init', '--template=', '-b', 'main', str(r.work))
        inspected = self.result('project', {'action': 'inspect', 'repo': connected['result']['repo']})
        self.assertEqual(inspected['error']['code'], 'REPOSITORY_IDENTITY')

    def test_bare_project_named_head_and_multiple_policy_conflict(self):
        r = self.runtime
        git('--git-dir=' + str(r.remote), 'symbolic-ref', 'HEAD', 'refs/heads/main')
        connected = self.change('connect', 'bare', 'remote.git')
        self.assertEqual((connected['status'], connected['result']['checkout']), ('succeeded', None))
        r.config['projectPolicies']['other'] = dict(r.config['projectPolicies']['local'])
        r.config['principals']['alice']['projectPolicies'].append('other')
        r.save_config()
        conflict = self.result('project', {'action': 'connect', 'requestId': 'other-policy',
            'policy': 'other', 'name': 'remote.git'})
        self.assertEqual((conflict['status'], conflict['error']['code']), ('failed', 'PROJECT_ALREADY_CONNECTED'))
        git('checkout', '--detach', cwd=r.work)
        self.failed('connect', 'detached', 'authored', 'BASE_REF_REQUIRED')
        git('checkout', '-b', 'managed/foreign', cwd=r.work)
        self.failed('connect', 'foreign-namespace', 'authored', 'BASE_REF_REQUIRED')
