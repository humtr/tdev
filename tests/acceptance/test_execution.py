"""Command/process continuity and controls through the public HTTP contract."""
import base64
from concurrent.futures import ThreadPoolExecutor
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually


class ExecutionTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime(request_timeout_seconds=40)
        self.addCleanup(self.runtime.close)
        self.task = self.runtime.open()
        self.validators = {t['name']: jsonschema.Draft202012Validator(
            {**t['outputSchema'], '$defs': CONTRACT['$defs']}) for t in CONTRACT['x-tools']}

    def call(self, tool, args):
        result = self.runtime.call(tool, args)
        self.validators['tdev_' + tool].validate({'ok': True, 'result': result})
        return result

    def execute(self, request, command, **fields):
        return self.call('exec', {'requestId': request, 'taskId': self.task['taskId'],
            'expected': self.task['checkpoint'], 'command': command, **fields})

    def inspect(self):
        return self.call('task', {'action': 'inspect', 'taskId': self.task['taskId']})

    def test_failed_command_captures_once_and_wait_is_observation_only(self):
        args = {'requestId': 'one', 'taskId': self.task['taskId'], 'expected': self.task['checkpoint'],
                'command': 'printf changed > a.txt; printf output; exit 7', 'waitMs': 5000}
        done = self.call('exec', args)
        self.assertEqual((done['status'], done['effect'], done['result']['exitCode']), ('failed', 'committed', 7))
        self.assertNotEqual(done['result']['checkpoint'], self.task['checkpoint'])
        self.assertEqual(base64.b64decode(done['output']['data']), b'output')
        self.runtime.restart()
        replay = self.call('exec', {**args, 'waitMs': 0})
        self.assertEqual((replay['id'], replay['result']), (done['id'], done['result']))
        frontier = self.inspect()
        self.assertEqual(frontier['task']['checkpoint'], done['result']['checkpoint'])
        self.assertTrue(frontier['mutationReady'])

    def test_noop_command_preserves_checkpoint_and_timeout_captures_partial_work(self):
        done = self.execute('noop', 'test "$(git rev-parse HEAD)" = "' + self.task['checkpoint'] + '"', waitMs=5000)
        self.assertEqual(done['status'], 'succeeded', done)
        self.assertEqual(done['result']['checkpoint'], self.task['checkpoint'])
        timeout = self.execute('timeout', 'printf partial > a.txt; sleep 20', timeout=1, waitMs=5000)
        self.assertEqual((timeout['status'], timeout['result']['timedOut']), ('failed', True), timeout)
        self.assertNotEqual(timeout['result']['checkpoint'], self.task['checkpoint'])

    def test_process_completion_preserves_a_concurrent_writer_and_closed_task(self):
        process = self.execute('server', 'printf discard > a.txt; sleep 1', mode='process', timeout=5)
        command = self.execute('writer', 'sleep 2; printf writer > a.txt')
        self.runtime.terminal(process['id'])
        frontier = self.inspect()
        self.assertEqual(frontier['task']['busy'], command['id'])
        self.assertEqual(frontier['task']['checkpoint'], self.task['checkpoint'])
        done = self.runtime.terminal(command['id'])
        self.assertNotEqual(done['result']['checkpoint'], self.task['checkpoint'])
        self.task['checkpoint'] = done['result']['checkpoint']
        process = self.execute('close-server', 'printf discarded > a.txt; sleep 20', mode='process', timeout=5)
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': self.task['taskId'], 'expected': self.task['checkpoint']})
        self.call('operation', {'action': 'cancel', 'requestId': 'cancel', 'operationId': process['id']})
        self.runtime.terminal(process['id'])
        frontier = self.inspect()
        self.assertTrue(frontier['task']['closed'])
        self.assertEqual(frontier['task']['checkpoint'], self.task['checkpoint'])

    def test_initial_and_staged_input_survive_lost_reply_without_duplicate(self):
        process = self.execute('input', 'cat', mode='process', stdin='initial\n', timeout=10)
        args = {'action': 'stdin', 'requestId': 'send', 'operationId': process['id'], 'sequence': 0, 'text': 'once\n', 'eof': True}
        self.runtime.discard_reply('operation', args)
        accepted = self.call('operation', args)
        accepted = self.runtime.terminal(accepted['id'])
        self.assertEqual(accepted['status'], 'succeeded', accepted)
        done = self.runtime.terminal(process['id'])
        self.assertEqual(base64.b64decode(done['output']['data']), b'initial\nonce\n')
        self.runtime.restart()
        self.assertEqual(self.call('operation', args)['id'], accepted['id'])
        delivery = self.runtime.status(accepted['id'])
        self.assertIn(delivery['result']['delivery'], ('queued', 'committed'))
        self.assertEqual(base64.b64decode(self.runtime.status(process['id'])['output']['data']), b'initial\nonce\n')

    def test_dependency_reset_retains_source_and_completed_replay_preserves_rebuilt_environment(self):
        first = self.execute('cache', 'printf saved > "$TDEV_ENV_DIR/retained"; printf "$TDEV_ENV_DIR"', waitMs=5000)
        self.assertEqual(first['status'], 'succeeded', first)
        reset_args = {'action': 'resetEnvironment', 'requestId': 'reset', 'taskId': self.task['taskId'], 'expected': self.task['checkpoint']}
        reset = self.call('task', reset_args)
        self.assertEqual(reset['status'], 'succeeded', reset)
        again = self.execute('rebuild', 'test ! -e "$TDEV_ENV_DIR/retained"; printf rebuilt > "$TDEV_ENV_DIR/retained"', waitMs=5000)
        self.assertEqual(again['status'], 'succeeded', again)
        self.runtime.restart()
        self.assertEqual(self.call('task', reset_args)['id'], reset['id'])
        saved = self.execute('saved', 'test "$(cat "$TDEV_ENV_DIR/retained")" = rebuilt', waitMs=5000)
        self.assertEqual(saved['status'], 'succeeded', saved)
        self.assertEqual(self.inspect()['task']['checkpoint'], self.task['checkpoint'])

    def test_concurrent_duplicate_exec_and_retire_keep_original_result_and_output(self):
        args = {'requestId': 'duplicate', 'taskId': self.task['taskId'], 'expected': self.task['checkpoint'],
                'command': 'printf once; sleep .2', 'waitMs': 0}
        with ThreadPoolExecutor(max_workers=4) as pool:
            receipts = list(pool.map(lambda _: self.call('exec', args), range(4)))
        self.assertEqual(len({r['id'] for r in receipts}), 1)
        done = self.runtime.terminal(receipts[0]['id'])
        retirement = self.call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': done['id']})
        self.assertEqual(retirement['status'], 'succeeded', retirement)
        self.runtime.restart()
        replay = self.call('exec', args)
        self.assertEqual((replay['id'], replay['result']), (done['id'], done['result']))
        self.assertEqual(base64.b64decode(self.runtime.status(done['id'])['output']['data']), b'once')
