import copy
from unittest.mock import patch

from test_core import Base
from tdev.common import canonical
from tdev.core import Controller


class ContinuationTest(Base):
    def setUp(self):
        super().setUp()
        self.repo.config['repositories']['test']['managedRefNamespaces'] = ['refs/heads/work/']
        self.repo.config['repositories']['test']['name'] = 'Human project'
        self.repo.config['principals']['alice']['managedRefNamespaces'] = {'test': ['refs/heads/work/']}

    def start(self, label):
        self.counter += 1
        return self.call('task', {'action': 'start', 'requestId': 'start-' + str(self.counter),
                                 'label': label})['result']

    def test_name_resume_after_restart_keeps_completed_predecessor_without_observing_effect(self):
        task = self.start('로그인 수정')
        edit = self.call('edit', {'requestId': 'edited', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [
                {'action': 'put', 'path': 'new', 'before': None, 'content': 'done'}]})
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        with patch.object(self.c, 'reconcile', side_effect=AssertionError('no effect observation')):
            found = self.call('find', {'project': 'Human project', 'label': '로그인'})
        self.assertEqual(found['resolution'], 'unique')
        match, = found['matches']
        self.assertEqual(match['taskId'], task['taskId'])
        self.assertEqual(match['label'], '로그인 수정')
        self.assertEqual(match['checkpoint'], edit['result']['checkpoint'])
        self.assertEqual(match['recent'][0]['requestId'], 'edited')
        self.assertEqual(match['recent'][0]['status'], 'succeeded')
        same = self.call('find', {'project': 'Human project', 'label': '로그인',
                                  'since': found['observation']['cursor']})
        self.assertFalse(same['observation']['changed'])
        self.assertEqual(self.executor.launches, 0)

    def test_multiple_matching_tasks_never_select_latest_or_first_page(self):
        first = self.start('Fix login')
        second = self.start('Fix login independently')
        found = self.call('find', {'label': 'LOGIN'})
        self.assertEqual(found['resolution'], 'ambiguous')
        self.assertEqual({m['taskId'] for m in found['matches']}, {first['taskId'], second['taskId']})
        page = self.call('find', {'label': 'LOGIN', 'limit': 1})
        self.assertEqual(page['resolution'], 'incomplete')
        self.assertIsNotNone(page['nextAfter'])
        last = self.call('find', {'label': 'LOGIN', 'limit': 1, 'after': page['nextAfter']})
        self.assertEqual(last['resolution'], 'incomplete')
        self.assertEqual(last['matches'][0]['taskId'], second['taskId'])
        self.assertIsNone(last['nextAfter'])

    def test_closed_work_is_visible_without_reopening_and_authority_filters_candidates(self):
        task = self.start('completed')
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': task['taskId'],
                           'expected': task['checkpoint']})
        result = self.call('find', {'label': 'completed'})
        self.assertEqual(result['resolution'], 'unique')
        self.assertTrue(result['matches'][0]['closed'])
        self.assertEqual(self.call('find', {'state': 'open'})['matches'], [])
        self.repo.config['principals']['alice']['repos'] = {}
        self.assertEqual(self.call('find', {})['matches'], [])
        self.assertEqual(self.call('find', {})['projects'], [])

    def test_pending_unknown_admission_is_preserved_when_no_task_exists(self):
        # Disposable provider-loss fixture: retained intent before task-row creation.
        intent = {'input': {'action': 'start', 'label': 'lost work'},
                  'repositoryIdentity': self.repo.config['repositories']['test']['identity']}
        with self.c.store.tx() as db:
            db.execute('INSERT INTO operation(id,owner,request,hash,kind,repo,ref,status,effect,intent) '
                       'VALUES(?,?,?,?,?,?,?,?,?,?)', ('pending', 'alice', 'original-request', 'fixture',
                        'task', 'test', 'refs/heads/main', 'unknown', 'unknown', canonical(intent).decode()))
        before = self.c.store.one('SELECT * FROM operation WHERE id=?', ('pending',))
        with patch.object(self.c, 'reconcile', side_effect=AssertionError('no retry')):
            result = self.call('find', {'project': 'test', 'label': 'lost work'})
        self.assertEqual(result['resolution'], 'unique')
        self.assertEqual(result['matches'], [])
        self.assertEqual(result['pending'][0]['requestId'], 'original-request')
        self.assertEqual(result['pending'][0]['status'], 'unknown')
        self.assertEqual(before, self.c.store.one('SELECT * FROM operation WHERE id=?', ('pending',)))

    def test_duplicate_project_display_names_do_not_resolve_by_default(self):
        other = copy.deepcopy(self.repo.config['repositories']['test'])
        self.repo.config['repositories']['other'] = other
        self.repo.config['principals']['alice']['repos']['other'] = ['refs/heads/main']
        result = self.call('find', {'project': 'Human project'})
        self.assertEqual(result['resolution'], 'ambiguous')
        self.assertEqual(len(result['projects']), 2)

    def test_replaced_project_cannot_make_old_work_look_absent(self):
        self.start('retained')
        self.repo.config['repositories']['test']['identity'] = 'local:replaced'
        found = self.call('find', {'project': 'test', 'label': 'retained'})
        self.assertEqual(found['resolution'], 'unavailable')
        self.assertEqual(found['unavailableMatches'], 1)
        self.assertEqual(found['matches'], [])
