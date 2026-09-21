import base64
import json
import os
import shlex
import tempfile
import time
import urllib.request
from pathlib import Path
from unittest.mock import patch

from test_core import Base
from tdev.common import Fault
from tdev.core import Controller
from tdev.native import NativeExecutor


class EnvironmentTest(Base):
    def setUp(self):
        super().setUp()
        self.c.executor_override = None

    def tearDown(self):
        # A failed assertion must not leave fixture servers behind.
        for row in self.c.store.all("SELECT id,intent FROM operation WHERE kind IN ('exec','validate') AND status IN ('running','unknown')"):
            if 'execution' in json.loads(row['intent']):
                backend = self.c.backend(json.loads(row['intent']))
                backend.control(row['id'], {'action': 'cancel'}, 'f' * 32)
                deadline = time.monotonic() + 10
                while not backend.observe(row['id']).get('terminal') and time.monotonic() < deadline:
                    time.sleep(.02)
        super().tearDown()

    def execute(self, w, request, command, **extra):
        return self.call('exec', {'requestId': request, 'taskId': w['taskId'],
                                 'expected': w['checkpoint'], 'command': command, **extra})

    def wait(self, ident):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            value = self.call('operation', {'action': 'status', 'operationId': ident})
            if value['status'] not in ('running', 'unknown'):
                return value
            time.sleep(.02)
        self.fail(value)

    def output(self, ident):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            value = self.call('operation', {'action': 'status', 'operationId': ident})
            output = base64.b64decode(value.get('output', {}).get('data', ''))
            if output:
                return output
            self.assertIn(value['status'], ('running', 'unknown'), value)
            time.sleep(.02)
        self.fail('No process output')

    def environment(self, w):
        return self.root / 'state/native/environments' / w['taskId']

    def test_dependencies_reused_after_retirement_and_restart_and_validation(self):
        w = self.open()
        setup = self.execute(w, 'setup', '''python -m venv --without-pip "$TDEV_ENV_DIR/venv" && "$TDEV_ENV_DIR/venv/bin/python" -c 'import pathlib,sysconfig; pathlib.Path(sysconfig.get_path("purelib"),"warmdep.py").write_text("VALUE = 42\\n")' && mkdir -p "$PIP_CACHE_DIR" && printf cached > "$PIP_CACHE_DIR/fixture"''')
        done = self.wait(setup['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        w['checkpoint'] = done['result']['checkpoint']
        self.call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': setup['id']})
        self.assertTrue(self.environment(w).is_dir())
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config)
        second = self.execute(w, 'reuse', '''python -c 'import warmdep; print(warmdep.VALUE)' && test "$(cat "$PIP_CACHE_DIR/fixture")" = cached''')
        done = self.wait(second['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        self.assertEqual(base64.b64decode(done['output']['data']), b'42\n')
        w['checkpoint'] = done['result']['checkpoint']
        self.repo.config['repositories']['test']['validation'] = 'python -c "import warmdep; assert warmdep.VALUE == 42"'
        v = self.call('validate', {'requestId': 'validate-warm', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'warm'})
        self.assertEqual(self.wait(v['id'])['status'], 'succeeded')
        self.repo.config['repositories']['test']['validation'] = 'printf changed > a.txt'
        v = self.call('validate', {'requestId': 'validate-change', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'reject'})
        self.assertEqual(self.wait(v['id'])['result']['captureError'], 'VALIDATION_SOURCE_CHANGED')

    def test_fresh_environment_and_task_separation_preserve_private_home(self):
        w = self.open()
        first = self.execute(w, 'marker', 'printf keep > "$TDEV_ENV_DIR/marker"; printf private > "$HOME/private"')
        done = self.wait(first['id'])
        w['checkpoint'] = done['result']['checkpoint']
        second = self.execute(w, 'private-home', 'test -f "$TDEV_ENV_DIR/marker" && test ! -f "$HOME/private"')
        done = self.wait(second['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        w['checkpoint'] = done['result']['checkpoint']
        fresh = self.execute(w, 'fresh', 'test -z "${TDEV_ENV_DIR-}" && test ! -f "$HOME/private"', environment='fresh')
        self.assertEqual(self.wait(fresh['id'])['status'], 'succeeded')
        other = self.open()
        isolated = self.execute(other, 'other-task', 'test ! -f "$TDEV_ENV_DIR/marker"')
        self.assertEqual(self.wait(isolated['id'])['status'], 'succeeded')
        self.assertNotEqual(self.environment(w), self.environment(other))

    def test_server_reconnect_edit_validate_close_stop_and_retire(self):
        w = self.open()
        code = 'from http.server import HTTPServer, SimpleHTTPRequestHandler; h=HTTPServer(("127.0.0.1",0), SimpleHTTPRequestHandler); print(h.server_port,flush=True); h.serve_forever()'
        server = self.execute(w, 'server', 'python -u -c ' + shlex.quote(code), mode='process')
        port = int(self.output(server['id']).splitlines()[0])
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config)
        edited = self.call('edit', {'requestId': 'edit-live', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                                  'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'new source'}]})
        current = edited['result']['checkpoint']
        # A real server continues serving its precise old snapshot.
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/a.txt', timeout=3) as response:
            self.assertEqual(response.read(), b'hello\n')
        v = self.call('validate', {'requestId': 'validation-live', 'taskId': w['taskId'], 'expected': current, 'message': 'live'})
        self.assertEqual(self.wait(v['id'])['status'], 'succeeded')
        frontier = self.call('task', {'action': 'inspect', 'taskId': w['taskId'], 'limit': 1})
        self.assertTrue(frontier['mutationReady'])
        self.assertEqual(frontier['processes'][0]['id'], server['id'])
        self.assertEqual(frontier['processes'][0]['execution']['checkpoint'], w['checkpoint'])
        self.assertIsNone(frontier['processes'][0]['execution']['timeout'])
        self.assertNotEqual(frontier['operations'][0]['id'], server['id'])
        self.call('task', {'action': 'close', 'requestId': 'close-live', 'taskId': w['taskId'], 'expected': current})
        self.call('operation', {'action': 'cancel', 'requestId': 'stop-live', 'operationId': server['id']})
        stopped = self.wait(server['id'])
        self.assertTrue(stopped['result']['stopped'])
        self.assertTrue(stopped['result']['cancelled'])
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], current)
        self.assertTrue(self.c.task('alice', w['taskId'])['closed'])
        self.call('operation', {'action': 'retire', 'requestId': 'retire-live', 'operationId': server['id']})
        self.assertFalse((self.root / 'state/native' / server['id'] / 'work').exists())
        self.assertTrue(self.environment(w).exists())

    def test_process_exit_cannot_capture_or_release_another_writer(self):
        w = self.open()
        process = self.execute(w, 'process', 'printf discarded > a.txt; printf ready; read value', mode='process')
        self.output(process['id'])
        command = self.execute(w, 'command', 'read value; printf captured > a.txt')
        self.call('operation', {'action': 'stdin', 'requestId': 'exit-process', 'operationId': process['id'], 'sequence': 0, 'text': 'done\n', 'eof': True})
        self.assertEqual(self.wait(process['id'])['status'], 'succeeded')
        task = self.c.task('alice', w['taskId'])
        self.assertEqual(task['busy'], command['id'])
        self.assertEqual(task['checkpoint'], w['checkpoint'])
        self.call('operation', {'action': 'stdin', 'requestId': 'exit-command', 'operationId': command['id'], 'sequence': 0, 'text': 'done\n', 'eof': True})
        self.assertNotEqual(self.wait(command['id'])['result']['checkpoint'], w['checkpoint'])

    def test_process_lost_reply_replay_and_deadline(self):
        w = self.open()
        original = NativeExecutor.submit
        def lost(executor, payload):
            original(executor, payload)
            raise Fault('LOST_REPLY', effect='unknown')
        with patch.object(NativeExecutor, 'submit', lost):
            process = self.execute(w, 'lost-process', 'printf once; printf discarded > a.txt; sleep 30', mode='process', timeout=1)
        self.assertEqual(process['effect'], 'unknown')
        self.assertEqual(self.execute(w, 'lost-process', 'printf once; printf discarded > a.txt; sleep 30', mode='process', timeout=1)['id'], process['id'])
        self.assertIsNone(self.c.task('alice', w['taskId'])['busy'])
        done = self.wait(process['id'])
        self.assertTrue(done['result']['timedOut'])
        self.assertEqual(base64.b64decode(done['output']['data']), b'once')
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], w['checkpoint'])

    def test_reset_requires_stop_proof_and_preserves_closed_task_and_receipts(self):
        w = self.open()
        process = self.execute(w, 'held', 'printf marker > "$TDEV_ENV_DIR/marker"; printf ready; read value', mode='process')
        self.output(process['id'])
        args = {'action': 'resetEnvironment', 'requestId': 'reset', 'taskId': w['taskId'], 'expected': w['checkpoint']}
        blocked = self.c.call('alice', 'tdev_task', args)
        self.assertEqual(blocked['error']['code'], 'ENVIRONMENT_BUSY')
        self.call('operation', {'action': 'cancel', 'requestId': 'stop-held', 'operationId': process['id']})
        self.wait(process['id'])
        self.call('task', {'action': 'close', 'requestId': 'close-held', 'taskId': w['taskId'], 'expected': w['checkpoint']})
        cleared = self.call('task', args)
        self.assertEqual(cleared['result']['environmentReset'], True)
        self.assertEqual(self.call('task', args), cleared)
        self.assertFalse(self.environment(w).exists())
        self.assertTrue(self.c.task('alice', w['taskId'])['closed'])
        self.assertTrue((self.root / 'state/native' / process['id'] / 'result.json').exists())

    def test_reset_interruption_reconciles_original_effect_after_restart(self):
        w = self.open()
        op = self.execute(w, 'prepare-reset', 'printf preserve-receipt > "$TDEV_ENV_DIR/marker"')
        w['checkpoint'] = self.wait(op['id'])['result']['checkpoint']
        args = {'action': 'resetEnvironment', 'requestId': 'interrupted-reset', 'taskId': w['taskId'], 'expected': w['checkpoint']}
        original = NativeExecutor.reset_environment
        def lost(executor, ident, operation_id):
            original(executor, ident, operation_id)
            raise Fault('LOST_RESET_REPLY', effect='unknown')
        with patch.object(NativeExecutor, 'reset_environment', lost):
            reset = self.call('task', args)
        self.assertEqual(reset['effect'], 'unknown')
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config)
        done = self.call('task', args)
        self.assertEqual(done['id'], reset['id'])
        self.assertEqual(done['status'], 'succeeded')
        self.assertFalse(self.environment(w).exists())
        self.assertIsNone(self.c.task('alice', w['taskId'])['busy'])
        next_op = self.execute(w, 'after-reset', 'test ! -f "$TDEV_ENV_DIR/marker"')
        self.assertEqual(self.wait(next_op['id'])['status'], 'succeeded')
        # Replay of an old reset must not delete subsequently rebuilt dependencies.
        self.assertEqual(self.call('task', args), done)
        self.assertTrue(self.environment(w).exists())

    def test_reset_rejects_symlink_and_does_not_touch_external_files(self):
        w = self.open()
        root = self.environment(w)
        root.parent.mkdir(parents=True)
        outside = self.root / 'external'
        outside.mkdir()
        (outside / 'keep').write_text('owned elsewhere')
        root.symlink_to(outside, target_is_directory=True)
        reset = self.call('task', {'action': 'resetEnvironment', 'requestId': 'bad-reset', 'taskId': w['taskId'], 'expected': w['checkpoint']})
        self.assertEqual(reset['error']['code'], 'ENVIRONMENT_SYMLINK')
        self.assertEqual((outside / 'keep').read_text(), 'owned elsewhere')

    def test_process_cap_and_remote_features_fail_before_dispatch(self):
        w = self.open()
        with patch.object(NativeExecutor, 'submit', return_value={'accepted': True}) as submitted:
            try:
                for i in range(8):
                    self.execute(w, 'slot-' + str(i), 'read value', mode='process')
                blocked = self.c.call('alice', 'tdev_exec', {'requestId': 'ninth', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'command': 'true', 'mode': 'process'})
                self.assertEqual(blocked['error']['code'], 'PROCESS_LIMIT')
                self.assertEqual(submitted.call_count, 8)
            finally:
                # This test intentionally suppresses dispatch; no live resources exist.
                with self.c.store.tx() as db:
                    db.execute("UPDATE operation SET status='failed',effect='none' WHERE kind='exec'")
        self.repo.config['repositories']['test']['executor'] = {
            'target': 'fixture', 'script': '/runner', 'digest': 'a' * 64, 'spool': '/spool',
            'image': 'fixture@sha256:' + 'a' * 64, 'knownHosts': '/hosts', 'identityFile': '/key'}
        with patch('tdev.remote.SSHExecutor') as ssh:
            for extra in ({'mode': 'process'}, {'environment': 'task'}):
                denied = self.execute(w, 'remote-' + next(iter(extra)), 'true', **extra)
                self.assertEqual(denied['error']['code'], 'NATIVE_FEATURE_REQUIRED')
                self.assertEqual(denied['effect'], 'none')
            ssh.assert_not_called()

    def test_reset_crash_after_rename_finishes_cleanup_on_observation(self):
        w = self.open()
        op = self.execute(w, 'prepare-rename', 'printf keep > "$TDEV_ENV_DIR/marker"')
        w['checkpoint'] = self.wait(op['id'])['result']['checkpoint']
        args = {'action': 'resetEnvironment', 'requestId': 'rename-reset', 'taskId': w['taskId'], 'expected': w['checkpoint']}
        with patch('tdev.native.shutil.rmtree', side_effect=SystemExit('simulated crash')):
            with self.assertRaises(SystemExit):
                self.call('task', args)
        self.assertFalse(self.environment(w).exists())
        self.assertEqual(len(list(self.environment(w).parent.glob('*.reset-*'))), 1)
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config)
        result = self.call('operation', {'action': 'status', 'lookupRequestId': 'rename-reset'})
        self.assertEqual(result['status'], 'succeeded')
        self.assertEqual(list(self.environment(w).parent.glob('*.reset-*')), [])

    def test_environment_budget_is_sampled_and_blocks_capture(self):
        w = self.open()
        # This executor must own an independent budget even when an outer tdev
        # validation runs the suite. Keep its disposable spool outside outer TMPDIR.
        host_tmp = Path(os.environ.get('PREFIX', '/')) / 'tmp'
        fixture = tempfile.TemporaryDirectory(prefix='tdev-budget-test-', dir=host_tmp)
        self.addCleanup(fixture.cleanup)
        backend = NativeExecutor(Path(fixture.name))
        self.c.executor_override = backend
        # Cross the aggregate budget without allocating 2 GiB or exceeding the
        # native runner's per-file limit when this suite itself runs in validation.
        root = backend.root / 'environments' / w['taskId']
        root.mkdir(parents=True, mode=0o700)
        for index in range(17):
            with open(root / ('large-' + str(index)), 'wb') as stream:
                stream.truncate(128 * 1024 * 1024 if index < 16 else 1)
        result = self.wait(self.execute(w, 'detect-environment-limit', 'sleep 1')['id'])
        self.assertEqual(result['result']['captureError'], 'ENVIRONMENT_DISK_LIMIT')
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], w['checkpoint'])
