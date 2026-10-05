"""Exact operation recovery and source identity, independent of Host/UI delivery."""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from test_core import Base
from support import git
from tdev.common import Fault
from tdev.core import Controller


class BoundaryTest(Base):
    def args(self, w, request='command', command='true', **extra):
        return {'requestId': request, 'taskId': w['taskId'],
                'expected': w['checkpoint'], 'command': command, **extra}

    def backend_done(self, op):
        # Wait for retained executor evidence without reconciling the SQLite row.
        deadline = time.monotonic() + 10
        while not self.executor.observe(op['id']).get('terminal'):
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.01)

    def test_noop_exec_preserves_validation_and_exact_publication(self):
        w = self.open()
        v = self.call('validate', {'requestId': 'validate', 'taskId': w['taskId'],
                                 'expected': w['checkpoint'], 'message': 'exact candidate'})
        validated = self.wait(v['id'])
        args = self.args(w, command='cat a.txt; exit 7')
        done = self.wait(self.call('exec', args)['id'])
        self.assertEqual(done['status'], 'failed')
        self.assertEqual(done['result']['checkpoint'], w['checkpoint'])
        self.assertEqual(self.call('exec', args)['id'], done['id'])
        published = self.call('publish', {'requestId': 'publish', 'validationId': v['id']})
        self.assertEqual(published['status'], 'succeeded', published)
        self.assertEqual(git('--git-dir=' + str(self.repo.remote), 'rev-parse', 'refs/heads/main'),
                         validated['result']['candidate'])

    def test_admission_reconciles_only_its_busy_predecessor(self):
        w = self.open()
        op = self.call('exec', self.args(w))
        self.backend_done(op)
        self.assertEqual(self.c.task('alice', w['taskId'])['busy'], op['id'])
        with patch.object(self.c, 'reconcile', wraps=self.c.reconcile) as observed:
            edited = self.call('edit', {'requestId': 'next', 'taskId': w['taskId'],
                         'expected': w['checkpoint'], 'edits': [
                             {'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'next'}]})
        self.assertEqual(edited['status'], 'succeeded', edited)
        self.assertEqual([x.args[0]['id'] for x in observed.call_args_list], [op['id']])
        self.assertEqual(self.executor.launches, 1)

    def test_capture_before_new_admission_rechecks_cas(self):
        w = self.open()
        op = self.call('exec', self.args(w, command='printf changed > a.txt'))
        self.backend_done(op)
        response = self.c.call('alice', 'tdev_edit', {'requestId': 'stale-next',
                    'taskId': w['taskId'], 'expected': w['checkpoint'], 'edits': [
                        {'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'wrong'}]})
        self.assertFalse(response['ok'])
        self.assertEqual(response['error']['code'], 'STALE_CHECKPOINT')
        current = self.c.task('alice', w['taskId'])
        self.assertIsNone(current['busy'])
        self.assertNotEqual(current['checkpoint'], w['checkpoint'])
        self.assertEqual(self.c.git('test').call('show', current['checkpoint'] + ':a.txt').stdout, b'changed')
        self.assertIsNone(self.c.store.one('SELECT id FROM operation WHERE request=?', ('stale-next',)))

    def test_publish_reconciles_its_validation_before_exact_candidate_join(self):
        w = self.open()
        v = self.call('validate', {'requestId': 'unobserved-validation', 'taskId': w['taskId'],
                                 'expected': w['checkpoint'], 'message': 'unobserved candidate'})
        self.backend_done(v)
        self.assertEqual(self.c.operation('alice', v['id'])['status'], 'running')
        p = self.call('publish', {'requestId': 'new-publication', 'validationId': v['id']})
        self.assertEqual(p['status'], 'succeeded', p)
        validated = self.c.operation('alice', v['id'])
        self.assertEqual(validated['status'], 'succeeded')
        self.assertEqual(p['result']['commit'], json.loads(validated['result'])['candidate'])
        self.assertEqual(self.executor.launches, 1)

    def test_unknown_predecessor_remains_fenced_without_dispatch(self):
        w = self.open()
        op = self.call('exec', self.args(w))
        with patch.object(self.executor, 'observe', return_value={'terminal': False}):
            self.c.fail(op['id'], Fault('LOST_RESPONSE', effect='unknown'))
            response = self.c.call('alice', 'tdev_exec', self.args(w, request='new'))
        self.assertEqual(response['error']['code'], 'TASK_BUSY')
        self.assertEqual(self.c.task('alice', w['taskId'])['busy'], op['id'])
        self.assertEqual(self.executor.launches, 1)

    def test_denied_admission_cannot_reconcile_a_predecessor(self):
        w = self.open()
        op = self.call('exec', self.args(w))
        self.backend_done(op)
        self.repo.config['principals']['alice']['repos'] = {}
        with patch.object(self.c, 'reconcile', side_effect=AssertionError('must authorize first')) as observed:
            response = self.c.call('alice', 'tdev_exec', self.args(w, request='denied'))
        self.assertFalse(response['ok'])
        observed.assert_not_called()
        self.assertEqual(self.executor.launches, 1)

    def test_legacy_execution_projection_does_not_invent_deadline_origin(self):
        w = self.open()
        args = self.args(w)
        op = self.call('exec', args)
        self.wait(op['id'])
        row = self.c.operation('alice', op['id'])
        intent = json.loads(row['intent'])
        intent.pop('timeoutSource')
        legacy = json.dumps(intent)
        with self.c.store.tx() as db:
            db.execute('UPDATE operation SET intent=? WHERE id=?', (legacy, op['id']))
        self.repo.config['repositories']['test']['validationTimeoutSeconds'] = 999
        replay = self.call('exec', args)
        self.assertEqual(replay['execution']['timeout'], 300)
        self.assertNotIn('timeoutSource', replay['execution'])
        self.assertEqual(self.c.operation('alice', op['id'])['intent'], legacy)

    def test_racing_admissions_after_unobserved_completion_keep_one_writer(self):
        w = self.open()
        op = self.call('exec', self.args(w))
        self.backend_done(op)
        def edit(i):
            return self.c.call('alice', 'tdev_edit', {'requestId': 'race-' + str(i),
                        'taskId': w['taskId'], 'expected': w['checkpoint'], 'edits': [
                            {'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': str(i)}]})
        with ThreadPoolExecutor(2) as pool:
            replies = list(pool.map(edit, range(2)))
        self.assertEqual(sum(r['ok'] and r['result']['status'] == 'succeeded' for r in replies), 1, replies)
        self.assertEqual(self.executor.launches, 1)

    def test_late_dispatch_failure_cannot_overwrite_reconciled_terminal_result(self):
        w = self.open()
        submit = self.executor.submit
        def lost(payload, source=None):
            submit(payload, source=source)
            self.wait(payload['id'])
            raise Fault('LOST_SUBMIT_REPLY', effect='unknown')
        args = self.args(w)
        with patch.object(self.executor, 'submit', side_effect=lost):
            result = self.call('exec', args)
        self.assertEqual(result['status'], 'succeeded', result)
        self.assertEqual(result['effect'], 'committed')
        self.assertIsNone(result['error'])
        self.c.save_intent(result['id'], lateWrite='must not change retained intent')
        self.assertNotIn('lateWrite', json.loads(self.c.operation('alice', result['id'])['intent']))
        self.assertEqual(self.call('exec', args), result)
        self.assertEqual(self.executor.launches, 1)


class NativeBoundaryTest(Base):
    def setUp(self):
        super().setUp()
        self.c.executor_override = None

    def test_validation_budget_override_frozen_replay_and_new_attempt(self):
        cfg = self.repo.config['repositories']['test']
        cfg.update(validation='sleep 2', validationTimeoutSeconds=1)
        w = self.open()
        project = self.call('project', {'action': 'inspect', 'repo': 'test'})
        self.assertEqual(project['validationTimeoutSeconds'], 1)
        args = {'requestId': 'short', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'budget'}
        first = self.call('validate', args)
        self.assertEqual(first['execution']['timeout'], 1)
        self.assertEqual(first['execution']['timeoutSource'], 'repository')
        failed = self.wait(first['id'])
        self.assertEqual(failed['status'], 'failed')
        self.assertTrue(failed['result']['timedOut'])
        cfg['validationTimeoutSeconds'] = 10
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config)
        replay = self.call('validate', {**args, 'waitMs': 0})
        self.assertEqual(replay['id'], first['id'])
        self.assertEqual(replay['execution'], first['execution'])
        mismatch = self.c.call('alice', 'tdev_validate', {**args, 'timeout': 4})
        self.assertEqual(mismatch['error']['code'], 'IDEMPOTENCY_MISMATCH')
        second = self.call('validate', {**args, 'requestId': 'long', 'timeout': 4})
        self.assertNotEqual(second['id'], first['id'])
        self.assertEqual(second['execution']['timeoutSource'], 'request')
        passed = self.wait(second['id'])
        self.assertEqual(passed['status'], 'succeeded', passed)
        self.assertEqual(self.call('validate', args)['status'], 'failed')
        self.assertNotEqual(passed['result']['candidate'], failed['result']['candidate'])

    def test_default_budget_and_changed_default_do_not_invalidate_success(self):
        w = self.open()
        self.assertEqual(self.call('project', {'action': 'inspect', 'repo': 'test'})['validationTimeoutSeconds'], 300)
        args = {'requestId': 'v', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'default'}
        op = self.call('validate', args)
        self.assertEqual(op['execution']['timeout'], 300)
        self.assertEqual(op['execution']['timeoutSource'], 'default')
        self.wait(op['id'])
        self.repo.config['repositories']['test']['validationTimeoutSeconds'] = 900
        self.assertEqual(self.call('project', {'action': 'inspect', 'repo': 'test'})['validationTimeoutSeconds'], 900)
        self.assertEqual(self.call('validate', args)['execution'], op['execution'])
        done = self.wait(self.call('exec', {'requestId': 'read', 'taskId': w['taskId'],
                        'expected': w['checkpoint'], 'command': 'cat a.txt'})['id'])
        self.assertEqual(done['result']['checkpoint'], w['checkpoint'])
        self.assertEqual(done['execution']['timeout'], 300)  # source-validation budget does not alter exec
        self.assertEqual(self.call('publish', {'requestId': 'p', 'validationId': op['id']})['status'], 'succeeded')

    def test_timeout_partial_capture_is_not_effect_none(self):
        w = self.open()
        args = {'requestId': 'partial', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                'command': 'printf partial > a.txt; sleep 5', 'timeout': 1, 'waitMs': 3000}
        body = self.c.call('alice', 'tdev_exec', args)
        self.assertTrue(body['ok'])
        op = body['result']
        self.assertEqual(op['status'], 'failed')
        self.assertEqual(op['effect'], 'committed')
        self.assertTrue(op['result']['stopped'])
        self.assertTrue(op['result']['timedOut'])
        self.assertNotEqual(op['result']['checkpoint'], w['checkpoint'])
        self.assertEqual(self.call('exec', args)['id'], op['id'])
