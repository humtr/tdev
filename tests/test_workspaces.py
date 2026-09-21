import sqlite3
import threading
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from test_core import Base
from support import Repository, git
from tdev.common import Fault, digest
from tdev.core import Controller
from tdev.git import Git
from tdev.store import Store


class WorkspaceTest(Base):
    def create(self, projects=None, **fields):
        self.counter += 1
        return self.call('workspace', {'action': 'create', 'requestId': 'space' + str(self.counter),
                                      'name': 'Development', 'projects': projects or [], **fields})['result']

    def change(self, workspace, action, **fields):
        self.counter += 1
        return self.call('workspace', {'action': action, 'requestId': 'change' + str(self.counter),
                                      'workspaceId': workspace['workspaceId'],
                                      'expectedRevision': workspace['revision'], **fields})['result']

    def inspect(self, workspace, **fields):
        return self.call('workspace', {'action': 'inspect', 'workspaceId': workspace['workspaceId'], **fields})

    def error(self, tool, args, code, principal='alice'):
        response = self.c.call(principal, 'tdev_' + tool, args)
        self.assertFalse(response['ok'], response)
        self.assertEqual(response['error']['code'], code, response)

    def managed(self, repo='test'):
        self.repo.config['repositories'][repo]['managedRefNamespaces'] = ['refs/heads/tasks/']
        self.repo.config['principals']['alice'].setdefault('managedRefNamespaces', {})[repo] = ['refs/heads/tasks/']

    def start(self, workspace=None, **fields):
        self.counter += 1
        args = {'action': 'start', 'requestId': 'start' + str(self.counter), **fields}
        if workspace:
            args['workspaceId'] = workspace['workspaceId']
        op = self.call('task', args)
        self.assertEqual(op['status'], 'succeeded', op)
        return op['result']

    def test_empty_space_atomic_replay_restart_and_generic_operation(self):
        # Composition is useful before there is any repository, grant or Git operation.
        self.repo.config['repositories'] = {}
        self.repo.config['principals']['alice']['repos'] = {}
        args = {'action': 'create', 'requestId': 'empty', 'name': 'Devices later'}
        with patch.object(Git, 'head', side_effect=AssertionError('no Git dependency')):
            op = self.call('workspace', args)
        w = op['result']
        self.assertEqual(w['projects'], [])
        self.assertEqual(self.call('operation', {'action': 'status', 'operationId': op['id']}), op)
        self.error('operation', {'action': 'cancel', 'requestId': 'cancel', 'operationId': op['id']}, 'PROCESS_REQUIRED')
        closed = self.change(w, 'close')
        self.assertTrue(closed['closed'])
        self.assertEqual(self.call('workspace', {'action': 'list'})['workspaces'], [])
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        self.assertEqual(self.call('workspace', args), op)
        self.assertTrue(self.inspect(w)['workspace']['closed'])
        self.assertEqual(len(self.call('workspace', {'action': 'list', 'includeClosed': True})['workspaces']), 1)
        self.error('workspace', {**args, 'name': 'Changed'}, 'IDEMPOTENCY_MISMATCH')
        self.error('task', {'action': 'start', 'requestId': 'closed', 'workspaceId': w['workspaceId']}, 'WORKSPACE_CLOSED')

    def test_two_projects_defaults_independent_source_validation_publication(self):
        second_root = self.root / 'second'
        second_root.mkdir()
        second = Repository(second_root)
        self.repo.config['repositories']['second'] = second.config['repositories']['test']
        self.repo.config['principals']['alice']['repos']['second'] = ['refs/heads/main']
        self.managed()
        self.managed('second')
        w = self.create(['test', 'second'])
        self.error('task', {'action': 'start', 'requestId': 'ambiguous', 'workspaceId': w['workspaceId']}, 'PROJECT_REQUIRED')
        w = self.change(w, 'configure', defaultRepo='second')
        two, one = self.start(w), self.start(w, repo='test')
        self.assertEqual(two['repo'], 'second')
        for task, repository in ((one, self.repo), (two, second)):
            self.counter += 1
            suffix = str(self.counter)
            changed = self.call('edit', {'requestId': 'edit' + suffix, 'taskId': task['taskId'],
                'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': task['repo']}]})
            self.assertEqual(changed['status'], 'succeeded')
            validation = self.call('validate', {'requestId': 'validate' + suffix, 'taskId': task['taskId'],
                'expected': changed['result']['checkpoint'], 'message': 'integration ' + suffix})
            proved = self.wait(validation['id'])
            self.assertEqual(proved['status'], 'succeeded')
            published = self.call('publish', {'requestId': 'publish' + suffix, 'validationId': validation['id']})
            self.assertEqual(published['result']['commit'], proved['result']['candidate'])
            self.assertEqual(git('--git-dir=' + str(repository.remote), 'rev-parse', task['ref']), proved['result']['candidate'])
            self.assertEqual(git('--git-dir=' + str(repository.remote), 'rev-parse', 'refs/heads/main'), repository.head)
        tasks = self.inspect(w, includeClosed=True)['tasks']
        self.assertEqual({t['taskId'] for t in tasks}, {one['taskId'], two['taskId']})
        page = self.inspect(w, limit=1, includeClosed=True)
        self.assertIsNotNone(page['nextAfter'])
        next_page = self.inspect(w, limit=1, after=page['nextAfter'], includeClosed=True)
        self.assertNotEqual(page['tasks'][0]['taskId'], next_page['tasks'][0]['taskId'])
        other = self.create(['test'])
        three = self.start(other)
        self.assertEqual(three['checkpoint'], self.repo.head)
        filtered = self.call('task', {'action': 'list', 'workspaceId': other['workspaceId']})
        self.assertEqual([t['id'] for t in filtered['tasks']], [three['taskId']])

    def test_default_space_concurrent_admission_and_legacy_names_rejected(self):
        def opening(i):
            return self.c.call('alice', 'tdev_task', {'action': 'open', 'requestId': 'parallel' + str(i),
                'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': self.repo.head})
        with ThreadPoolExecutor(3) as pool:
            results = list(pool.map(opening, range(3)))
        self.assertTrue(all(r['ok'] and r['result']['status'] == 'succeeded' for r in results), results)
        ids = {r['result']['result']['workspaceId'] for r in results}
        self.assertEqual(len(ids), 1)
        w = self.call('workspace', {'action': 'list'})['workspaces'][0]
        self.assertTrue(w['isDefault'])
        self.assertEqual(len(self.inspect(w)['tasks']), 3)
        self.error('workspace', {'action': 'open', 'requestId': 'old', 'repo': 'test',
                   'ref': 'refs/heads/main', 'expectedHead': self.repo.head}, 'SCHEMA')
        self.error('process', {'action': 'status', 'operationId': results[0]['result']['id']}, 'SCHEMA')

    def test_revision_cas_and_workspace_ownership(self):
        w = self.create()
        def configure(i):
            return self.c.call('alice', 'tdev_workspace', {'action': 'configure', 'requestId': 'cas' + str(i),
                'workspaceId': w['workspaceId'], 'expectedRevision': w['revision'], 'name': str(i)})
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(configure, range(2)))
        self.assertEqual(sum(r['ok'] for r in results), 1)
        self.assertEqual(next(r for r in results if not r['ok'])['error']['code'], 'STALE_WORKSPACE')
        self.repo.config['principals']['bob'] = {'tokenHash': digest(b'bob'), 'repos': {'test': ['refs/heads/main']}}
        self.error('workspace', {'action': 'inspect', 'workspaceId': w['workspaceId']}, 'WORKSPACE_NOT_FOUND', 'bob')
        self.assertEqual(self.call('workspace', {'action': 'list'}, 'bob')['workspaces'], [])

    def test_membership_never_grants_or_adopts_replaced_project(self):
        self.managed()
        w = self.create(['test'])
        self.repo.config['principals']['alice']['repos'] = {}
        member = self.inspect(w)['workspace']['projects'][0]
        self.assertFalse(member['available'])
        self.error('task', {'action': 'start', 'requestId': 'revoked', 'workspaceId': w['workspaceId']}, 'PERMISSION_DENIED')
        self.repo.config['principals']['alice']['repos'] = {'test': ['refs/heads/main']}
        self.repo.config['repositories']['test']['identity'] = 'local:replacement'
        self.error('task', {'action': 'start', 'requestId': 'replaced', 'workspaceId': w['workspaceId']}, 'REPOSITORY_IDENTITY')
        self.error('workspace', {'action': 'attach', 'requestId': 'rebind', 'workspaceId': w['workspaceId'],
                   'expectedRevision': w['revision'], 'repo': 'test'}, 'REPOSITORY_IDENTITY')
        self.error('task', {'action': 'start', 'requestId': 'foreign', 'workspaceId': self.create()['workspaceId'],
                   'repo': 'test'}, 'PROJECT_NOT_ATTACHED')

    def test_pending_source_admission_blocks_close_and_detach(self):
        w = self.create(['test'])
        entered, release = threading.Event(), threading.Event()
        original = Git.fetch
        def blocked(git_instance, *args):
            entered.set()
            if not release.wait(10):
                raise AssertionError('test did not release fetch')
            return original(git_instance, *args)
        with patch.object(Git, 'fetch', blocked), ThreadPoolExecutor(1) as pool:
            future = pool.submit(self.c.call, 'alice', 'tdev_task', {'action': 'open', 'requestId': 'pending',
                'workspaceId': w['workspaceId'], 'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': self.repo.head})
            try:
                self.assertTrue(entered.wait(10))
                pending = self.inspect(w)['pendingTasks']
                self.assertEqual(len(pending), 1)
                self.assertEqual(pending[0]['requestId'], 'pending')
                self.assertEqual(pending[0]['operation']['status'], 'running')
                for action in ('close', 'detach'):
                    fields = {'repo': 'test'} if action == 'detach' else {}
                    self.error('workspace', {'action': action, 'requestId': action, 'workspaceId': w['workspaceId'],
                               'expectedRevision': w['revision'], **fields}, 'WORKSPACE_IN_USE')
            finally:
                release.set()
            self.assertTrue(future.result()['ok'])
        self.assertEqual(len(self.inspect(w)['tasks']), 1)

    def test_inspection_observes_completion_cleanup_survives_space_close(self):
        self.managed()
        w = self.create(['test'])
        task = self.start(w)
        op = self.call('exec', {'requestId': 'command', 'taskId': task['taskId'], 'expected': task['checkpoint'],
                              'command': 'printf changed > a.txt'})
        self.executor.jobs[op['id']]['proc'].wait(timeout=10)
        view = self.inspect(w)
        self.assertIsNone(view['tasks'][0]['busy'])
        self.assertEqual(view['tasks'][0]['active']['status'], 'succeeded')
        self.assertNotEqual(view['tasks'][0]['checkpoint'], task['checkpoint'])
        current = self.inspect(w)
        unchanged = self.inspect(w, since=current['observation']['cursor'])
        self.assertFalse(unchanged['observation']['changed'])
        checkpoint = view['tasks'][0]['checkpoint']
        v = self.call('validate', {'requestId': 'v', 'taskId': task['taskId'], 'expected': checkpoint, 'message': 'published'})
        self.assertEqual(self.wait(v['id'])['status'], 'succeeded')
        self.call('publish', {'requestId': 'p', 'validationId': v['id']})
        self.assertTrue(self.c.task('alice', task['taskId'])['closed'])
        w = self.change(w, 'detach', repo='test')
        w = self.change(w, 'close')
        cleanup = self.call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': task['taskId']})
        self.assertEqual(cleanup['status'], 'succeeded')
        self.assertTrue(self.inspect(w, includeClosed=True)['tasks'][0]['closed'])

    def test_old_state_rejected_without_migration_or_data_loss(self):
        # A real old-shaped database is rejected before new composition tables are created.
        directory = self.root / 'old-state'
        directory.mkdir(mode=0o700)
        with closing(sqlite3.connect(directory / 'state.sqlite')) as db:
            db.executescript("CREATE TABLE workspace(id TEXT PRIMARY KEY, checkpoint TEXT);"
                             "INSERT INTO workspace VALUES('keep','old-commit'); PRAGMA user_version=2;")
        for _ in range(2):
            with self.assertRaises(Fault) as raised:
                Store(directory)
            self.assertEqual(raised.exception.value['code'], 'SCHEMA_VERSION')
        with closing(sqlite3.connect(directory / 'state.sqlite')) as db:
            self.assertEqual(db.execute('SELECT * FROM workspace').fetchall(), [('keep', 'old-commit')])
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(), [('workspace',)])
