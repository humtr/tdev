"""Actual death, durable provider proof and controller credential boundaries."""
from contextlib import closing
import http.client
import json
import sqlite3
import threading
import time
import unittest

from acceptance.harness import eventually, git
from acceptance.test_github import GithubCase


class NativeGithubTest(GithubCase):
    def intent(self, request):
        with closing(sqlite3.connect('file:' + str(self.runtime.state / 'state.sqlite') + '?mode=ro', uri=True)) as db:
            row = db.execute('SELECT id,intent FROM operation WHERE owner=? AND request=?',
                             ('alice', request)).fetchone()
        return row[0], json.loads(row[1])

    def sql(self, statement, params=()):
        db = sqlite3.connect(self.runtime.state / 'state.sqlite')
        try:
            db.execute(statement, params)
            db.commit()
        finally:
            db.close()

    def interrupt(self, gap):
        r, p = self.runtime, self.provider
        p.state['gap'] = gap
        p.save()
        args = self.args(request='interrupted')
        replies, failures = [], []
        def invoke():
            try:
                replies.append(self.result('project', args))
            except (ConnectionError, http.client.HTTPException):
                pass
            except BaseException as error:
                failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        try:
            eventually(p.marker.exists, bool, seconds=8)
            opid, intent = self.intent(args['requestId'])
            self.assertEqual(intent['projectCreate'], True)
            self.assertEqual(intent.get('createdIdentity'), 'github:1234' if gap == 'get' else None)
            started = time.monotonic()
            original = r.status(opid)
            self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'))
            self.assertEqual(self.result('project', args)['id'], opid)
            self.result('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Available'})
            self.assertLess(time.monotonic() - started, 3)
            r.stop()
        finally:
            p.release.touch()
            caller.join(timeout=5)
            eventually(p.done.exists, bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(replies, replies)
        self.assertFalse(failures, failures)
        self.assertEqual(len(p.posts()), 1)
        return args, original

    def test_death_before_response_never_reposts_or_adopts_name(self):
        r, p = self.runtime, self.provider
        args, original = self.interrupt('post')
        calls = len(p.calls())
        r.start()
        for _ in range(2):
            receipt = r.status(original['id'])
            self.assertEqual((receipt['id'], receipt['status'], receipt['effect'], receipt['error']['code']),
                             (original['id'], 'unknown', 'unknown', 'PROJECT_UNKNOWN'))
            self.assertEqual(self.result('project', args)['id'], original['id'])
        self.assertEqual(len(p.calls()), calls)
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 1)
        self.assertEqual(self.result('project', self.args('connect', 'explicit'))['status'], 'succeeded')
        self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(len(p.posts()), 1)

    def test_death_after_id_recovers_under_fresh_policy_and_identity_only(self):
        r, p = self.runtime, self.provider
        args, original = self.interrupt('get')
        r.config['principals']['alice']['projectPolicies'] = []
        r.save_config()
        r.start()
        self.error('operation', {'action': 'status', 'operationId': original['id']}, 'PROJECT_POLICY_DENIED')
        self.assertEqual(len(p.posts()), 1)
        r.config['principals']['alice']['projectPolicies'] = ['cloud']
        r.config['projectPolicies']['cloud'].update(allowCreate=False,
            validationTimeoutSeconds=73, managedRefNamespace='refs/heads/current/')
        r.save_config()
        p.state['repository']['id'] = 9999
        p.save()
        denied = r.status(original['id'])
        self.assertEqual((denied['status'], denied['error']['code']), ('unknown', 'REPOSITORY_IDENTITY'))
        p.state['repository']['id'] = 1234
        p.save()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['id'], recovered['status'], recovered['effect']),
                         (original['id'], 'succeeded', 'committed'))
        self.assertEqual((recovered['result']['validationTimeoutSeconds'],
                          recovered['result']['managedRefNamespaces']), (73, ['refs/heads/current/']))
        self.assertEqual(self.result('project', args), {k: v for k, v in recovered.items() if k != 'observation'})
        self.assertEqual(len(p.posts()), 1)

    def test_sqlite_completion_failure_preserves_id_and_enrollment_atomicity(self):
        r, p = self.runtime, self.provider
        self.sql("CREATE TRIGGER fail_enrollment BEFORE INSERT ON project BEGIN SELECT RAISE(FAIL, 'fixture enrollment failure'); END")
        args = self.args()
        original = self.result('project', args)
        self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'))
        self.assertEqual(self.intent(args['requestId'])[1]['createdIdentity'], 'github:1234')
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 1)
        self.sql('DROP TRIGGER fail_enrollment')
        r.restart()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['status'], recovered['effect']), ('succeeded', 'committed'))
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 2)
        self.assertEqual(len(p.posts()), 1)

    def test_controller_credentials_only_enter_provider_transport_not_private_git_or_receipts(self):
        r, p = self.runtime, self.provider
        connected = self.result('project', self.args('connect'))
        task = self.result('task', {'action': 'start', 'requestId': 'start',
            'repo': connected['result']['repo'], 'expectedHead': r.head})['result']
        self.result('edit', {'requestId': 'edit', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'changed'}]})
        calls = p.calls()
        provider = [c for c in calls if c['kind'] == 'api']
        transport = [c for c in calls if c.get('transport')]
        private = [c for c in calls if c['kind'] == 'git' and not c['transport']]
        self.assertTrue(provider and transport and private)
        self.assertTrue(all(c['credential'] for c in provider + transport))
        self.assertFalse(any(c['credential'] for c in private))
        self.assertTrue(all('--hostname' in c['args'] and 'github.com' in c['args'] for c in provider))
        self.assertTrue(all('credential.https://github.com.helper=!gh auth git-credential' in c['args'] for c in transport))
        self.assertNotIn('fixture-controller-secret', p.trace.read_text())
        with closing(sqlite3.connect('file:' + str(r.state / 'state.sqlite') + '?mode=ro', uri=True)) as db:
            receipts = list(db.execute('SELECT intent,result,error FROM operation'))
        self.assertNotIn('fixture-controller-secret', str(receipts))
        self.assertNotIn('fixture-controller-secret', (r.root / 'controller.log').read_text())
        config = (r.state / 'sources' / connected['result']['repo'] / 'config').read_text()
        self.assertNotIn('credential', config)

    def test_malformed_success_is_uncertain_and_explicit_rejections_do_not_create(self):
        r, p = self.runtime, self.provider
        for status, code in [(403, 'PROVIDER_PERMISSION_DENIED'), (404, 'PROVIDER_NOT_FOUND'), (422, 'PROJECT_EXISTS')]:
            p.state['post_status'] = status
            p.save()
            op = self.result('project', self.args(request='rejected-' + str(status)))
            self.assertEqual((op['status'], op['effect'], op['error']['code']), ('failed', 'none', code))
        p.state.update(post_status=201, post_reply='malformed')
        p.save()
        args = self.args(request='malformed')
        original = self.result('project', args)
        self.assertEqual((original['status'], original['effect'], original['error']['code']),
                         ('unknown', 'unknown', 'PROVIDER_RESPONSE'))
        calls = len(p.calls())
        r.restart()
        self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(len(p.calls()), calls)
        self.assertNotIn('createdIdentity', self.intent(args['requestId'])[1])

    def retained_publication(self):
        r = self.runtime
        connected = self.result('project', self.args('connect'))
        task = self.result('task', {'action': 'start', 'requestId': 'start',
            'repo': connected['result']['repo'], 'expectedHead': r.head})['result']
        r.stop()
        git('--git-dir=' + str(r.remote), 'update-ref', task['ref'], r.head)
        self.sql("UPDATE task SET published_oid=?,ref_state='published',closed=1 WHERE id=? AND owner='alice'",
                 (r.head, task['taskId']))
        r.start()
        return task

    def deletions(self):
        return [c for c in self.provider.calls() if c['kind'] == 'git' and 'push' in c['args']]

    def interrupt_delete(self, phase):
        r, p = self.runtime, self.provider
        task = self.retained_publication()
        p.state['git_gap'] = phase
        p.save()
        args = {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': task['taskId']}
        replies, failures = [], []
        def invoke():
            try: replies.append(self.result('task', args))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        try:
            eventually(p.marker.exists, bool, seconds=8)
            opid, intent = self.intent('cleanup')
            self.assertEqual((intent['refMutation'], intent['old']), ('delete', r.head))
            original = r.status(opid)
            self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'))
            self.assertEqual(self.result('task', args)['id'], opid)
            self.result('workspace', {'action': 'create', 'requestId': 'available', 'name': 'Independent'})
            r.stop()
        finally:
            p.release.touch()
            caller.join(timeout=5)
            eventually(p.done.exists, bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(replies, replies)
        self.assertFalse(failures, failures)
        self.assertEqual(len(self.deletions()), 1)
        return task, args, original

    def test_remote_delete_death_after_effect_finishes_only_original_receipt(self):
        r = self.runtime
        task, args, original = self.interrupt_delete('after-delete')
        r.start()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['status'], recovered['effect']), ('succeeded', 'committed'))
        git('--git-dir=' + str(r.remote), 'update-ref', task['ref'], r.head)
        self.assertEqual(self.result('task', args)['id'], original['id'])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', task['ref']), r.head)
        self.assertEqual(len(self.deletions()), 1)

    def test_remote_delete_death_before_effect_keeps_fence_without_repeating(self):
        r = self.runtime
        task, args, original = self.interrupt_delete('before-delete')
        r.start()
        for _ in range(2):
            self.assertEqual(r.status(original['id'])['status'], 'unknown')
            self.assertEqual(self.result('task', args)['id'], original['id'])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', task['ref']), r.head)
        self.assertEqual(len(self.deletions()), 1)
        git('--git-dir=' + str(r.remote), 'update-ref', '-d', task['ref'], r.head)
        self.assertEqual(r.status(original['id'])['status'], 'succeeded')

    def test_remote_delete_exact_lease_preserves_racing_branch(self):
        r, p = self.runtime, self.provider
        task = self.retained_publication()
        tree = git('--git-dir=' + str(r.remote), 'rev-parse', r.head + '^{tree}')
        replacement = git('--git-dir=' + str(r.remote), 'commit-tree', tree, '-p', r.head, '-m', 'foreign')
        p.state['git_race'] = replacement
        p.save()
        args = {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': task['taskId']}
        original = self.result('task', args)
        self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'))
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', task['ref']), replacement)
        self.assertIn('--force-with-lease=' + task['ref'] + ':' + r.head, self.deletions()[0]['args'])
        r.restart()
        self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(self.result('task', args)['id'], original['id'])
        self.assertEqual(len(self.deletions()), 1)

    def test_provider_and_transport_failures_never_expose_credentials(self):
        r, p = self.runtime, self.provider
        p.state['transport_failure'] = True
        p.save()
        op = self.result('project', self.args('connect'))
        self.assertEqual((op['status'], op['effect'], op['error']['code']), ('failed', 'none', 'COMMAND_FAILED'))
        self.assertNotIn('fixture-controller-secret', json.dumps(op))
        with closing(sqlite3.connect('file:' + str(r.state / 'state.sqlite') + '?mode=ro', uri=True)) as db:
            receipts = list(db.execute('SELECT intent,result,error FROM operation'))
        self.assertNotIn('fixture-controller-secret', str(receipts))

    def test_static_refs_need_not_all_exist_and_retained_source_survives_base_ref_removal(self):
        r = self.runtime
        r.config['repositories']['static'] = {'kind':'github','name':'Example/Repo',
            'remote':'https://github.com/Example/Repo.git','identity':'github:1234',
            'refs':['refs/heads/absent','refs/heads/main'], 'validation':'true'}
        r.config['principals']['alice']['repos']['static'] = ['refs/heads/main']
        r.save_config()
        opened = self.result('task', {'action':'open','requestId':'static-open','repo':'static',
            'ref':'refs/heads/main','expectedHead':r.head})
        self.assertEqual(opened['status'], 'succeeded')
        task = opened['result']
        git('--git-dir=' + str(r.remote), 'update-ref', '-d', 'refs/heads/main', r.head)
        r.restart()
        read = self.result('read', {'taskId':task['taskId'],'queries':[{'action':'file','path':'a.txt'}]})
        self.assertTrue(read['items'][0]['data'])
        self.assertEqual(read['checkpoint'], r.head)


if __name__ == '__main__':
    unittest.main()
