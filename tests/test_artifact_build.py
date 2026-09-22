import io
import json
import shutil
import sys
import time
from pathlib import Path
from unittest.mock import patch

import test_artifacts
from test_artifacts import recipe
from test_core import Base
from tdev.artifact_build import acquire, file_info, host_platform, verify_storage, NoRedirect
from tdev.common import Fault, digest
from tdev.core import Controller


class NativeBuildTest(Base):
    validated = test_artifacts.ArtifactTest.validated

    def build_recipe(self, command=None):
        value = recipe()
        value['build']['platform'] = host_platform()
        value['target'] = host_platform()
        value['build']['tools'] = [{'name': name, 'sha256': digest(Path(shutil.which(name)).resolve().read_bytes())} for name in ('python', 'sh')]
        value['build']['command'] = command or "python -c \"from pathlib import Path; Path('dist').mkdir(); Path('dist/out.txt').write_text(Path('a.txt').read_text())\""
        return value

    def start(self, value=None, request='build', **extra):
        w, validation = self.validated(value or self.build_recipe())
        self.c.executor_override = None
        args = {'action': 'prepare', 'requestId': request, 'validationId': validation, **extra}
        operation = self.call('artifact', args)
        return w, args, operation

    def inspect_build(self, operation):
        return self.call('artifact', {'action': 'inspect', 'artifactId': operation['id']})

    def test_frozen_build_edit_close_restart_replay_and_retire(self):
        marker = self.root / 'build-count'
        command = f"python -c \"from pathlib import Path; import time; p=Path('{marker}'); p.write_text(p.read_text()+'x' if p.exists() else 'x'); time.sleep(1); Path('dist').mkdir(); Path('dist/out.txt').write_text(Path('a.txt').read_text())\""
        w, args, op = self.start(self.build_recipe(command))
        edit = self.call('edit', {'requestId': 'during-build', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                         'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'later'}]})
        self.assertEqual(edit['status'], 'succeeded')
        frontier = self.call('task', {'action': 'inspect', 'taskId': w['taskId'], 'limit': 1})
        self.assertIn(op['id'], [b['id'] for b in frontier['builds']])
        self.call('task', {'action': 'close', 'requestId': 'close-build-task', 'taskId': w['taskId'], 'expected': edit['result']['checkpoint']})
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        done = self.wait(op['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        result = self.inspect_build(op)
        content = result['contentDigest']
        stored = self.c.artifacts.objects() / content
        self.assertEqual((stored / 'files/dist/out.txt').read_text(), 'hello\n')
        self.assertFalse(result['artifactValidated'])
        self.assertEqual(self.call('artifact', args)['id'], op['id'])
        self.assertEqual(marker.read_text(), 'x')
        self.call('operation', {'action': 'retire', 'requestId': 'retire-build', 'operationId': op['id']})
        self.assertFalse((self.c.store.root / 'native' / op['id'] / 'work').exists())
        self.assertEqual(self.inspect_build(op), result)
        listed = self.call('artifact', {'action': 'list', 'taskId': w['taskId']})
        self.assertEqual(listed['artifacts'][0]['id'], op['id'])
        self.assertEqual(listed['outstanding'], [])
        self.assertEqual(self.c.store.all('SELECT * FROM deployment'), [])

    def test_capture_rejects_mutation_undeclared_symlink_hardlink_and_missing(self):
        cases = [
            ("mkdir dist; echo changed > a.txt; echo out > dist/out", 'VALIDATION_SOURCE_CHANGED'),
            ("mkdir dist; echo out > dist/out; echo secret > stray", 'ARTIFACT_UNDECLARED_OUTPUT'),
            ("mkdir dist; ln -s ../a.txt dist/out", 'ARTIFACT_FILE_TYPE'),
            ("mkdir dist; ln a.txt dist/out", 'ARTIFACT_FILE_TYPE'),
            ("mkdir dist", 'ARTIFACT_EXPORT_MISSING'),
            ("mkdir dist; echo one > dist/A; echo two > dist/a", 'ARTIFACT_PATH_COLLISION'),
        ]
        for i, (command, code) in enumerate(cases):
            with self.subTest(code=code):
                self.c.executor_override = self.executor
                _, _, op = self.start(self.build_recipe(command), 'invalid-' + str(i))
                done = self.wait(op['id'])
                self.assertEqual(done['status'], 'failed', done)
                if command == 'mkdir dist; ln a.txt dist/out' and 'captureError' not in done['result']:
                    # Some ordinary Android app domains prohibit link(2) itself.
                    import base64
                    self.assertNotEqual(done['result']['exitCode'], 0)
                    self.assertRegex(base64.b64decode(done['output']['data']).decode(), r'(not permitted|Permission denied)')
                else:
                    self.assertEqual(done['result']['captureError'], code, done)
                self.assertIsNone(done['result']['artifactId'])
                self.assertFalse(self.c.store.one('SELECT * FROM artifact WHERE operation=?', (op['id'],)))
                self.call('operation', {'action': 'retire', 'requestId': 'clean-' + str(i), 'operationId': op['id']})

    def test_deadline_cancel_and_failed_stdout_never_seal(self):
        for index, (command, extra, cancel) in enumerate([
            ('python -c "import time; time.sleep(20)"', {'timeout': 1}, False),
            ('python -c "import time; time.sleep(20)"', {}, True),
            ('mkdir dist; echo forged > dist/out; echo \'{"artifactDigest":"' + 'a' * 64 + '","exitCode":0}\'; exit 7', {}, False),
        ]):
            self.c.executor_override = self.executor
            _, _, op = self.start(self.build_recipe(command), 'stop-' + str(index), **extra)
            if cancel:
                self.call('operation', {'action': 'cancel', 'requestId': 'cancel', 'operationId': op['id']})
            done = self.wait(op['id'])
            self.assertEqual(done['status'], 'failed', done)
            self.assertTrue(done['result']['stopped'])
            self.assertIsNone(done['result']['contentDigest'])
            self.call('operation', {'action': 'retire', 'requestId': 'retire-' + str(index), 'operationId': op['id']})

    def test_current_authority_tool_policy_and_native_network_admission(self):
        w, validation = self.validated(self.build_recipe())
        self.c.executor_override = None
        args = {'action': 'prepare', 'requestId': 'admit', 'validationId': validation}
        cfg = self.repo.config['repositories']['test']
        cfg['validation'] = 'changed'
        self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'VALIDATION_POLICY_CHANGED')
        # The actual fixture command is obtained from the source execution intent.
        cfg['validation'] = json.loads(self.c.store.one('SELECT intent FROM operation WHERE id=?', (validation,))['intent'])['execution']['command']
        cfg['networks'] = ['none']
        self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'NETWORK_DENIED')
        cfg['networks'] = ['host']
        with patch('tdev.artifact_build.host_platform', return_value={'os': 'wrong'}):
            self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'ARTIFACT_BUILD_PLATFORM')
        with patch('tdev.artifact_build.file_info', return_value={'sha256': '0' * 64}):
            self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'ARTIFACT_TOOL_CHANGED')
        self.assertIsNone(self.c.store.one('SELECT * FROM operation WHERE request=?', ('admit',)))
        self.repo.config['principals']['alice']['repos'] = {}
        self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'PERMISSION_DENIED')

    def test_lost_dispatch_response_reconciles_one_process(self):
        from tdev.native import NativeExecutor
        original = NativeExecutor.submit
        def lost(executor, payload):
            original(executor, payload)
            raise OSError('lost reply')
        with patch.object(NativeExecutor, 'submit', lost):
            _, args, op = self.start()
        self.assertEqual(op['status'], 'unknown')
        self.assertEqual(self.wait(op['id'])['status'], 'succeeded')
        with patch.object(NativeExecutor, 'submit', side_effect=AssertionError('must not redispatch')):
            self.assertEqual(self.call('artifact', args)['id'], op['id'])
        self.assertEqual(len(self.c.store.all('SELECT * FROM artifact')), 1)

    def test_interrupted_seal_and_receipt_commit_recover_without_build(self):
        _, args, op = self.start()
        native = self.c.store.root / 'native' / op['id']
        for _ in range(500):
            if (native / 'result.json').exists():
                break
            time.sleep(.01)
        self.assertTrue((native / 'result.json').exists())
        with patch('shutil.copytree', side_effect=OSError('ENOSPC')):
            pending = self.call('operation', {'action': 'status', 'operationId': op['id']})
        self.assertEqual(pending['status'], 'unknown')
        self.assertFalse(self.c.store.all('SELECT * FROM artifact'))
        from tdev.native import NativeExecutor
        with patch.object(NativeExecutor, 'submit', side_effect=AssertionError('never rebuild')):
            self.assertEqual(self.call('artifact', args)['status'], 'succeeded')
        stored = self.inspect_build(op)
        # Simulate loss of the SQLite completion transaction after atomic object rename.
        with self.c.store.tx() as db:
            db.execute('DELETE FROM artifact WHERE operation=?', (op['id'],))
            db.execute("UPDATE operation SET status='unknown',effect='unknown',result=NULL WHERE id=?", (op['id'],))
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        with patch.object(NativeExecutor, 'submit', side_effect=AssertionError('never rebuild')):
            self.assertEqual(self.wait(op['id'])['status'], 'succeeded')
        self.assertEqual(self.inspect_build(op), stored)

    def test_storage_tamper_and_cross_principal_access(self):
        _, _, op = self.start()
        self.assertEqual(self.wait(op['id'])['status'], 'succeeded')
        inspected = self.inspect_build(op)
        self.repo.config['principals']['bob'] = {'tokenHash': digest(b'bob'), 'repos': {'test': ['refs/heads/main']}}
        self.assertEqual(self.c.call('bob', 'tdev_artifact', {'action': 'inspect', 'artifactId': op['id']})['error']['code'], 'OPERATION_NOT_FOUND')
        target = self.c.artifacts.objects() / inspected['contentDigest'] / 'files/dist/out.txt'
        target.write_text('tampered')
        result = self.c.call('alice', 'tdev_artifact', {'action': 'inspect', 'artifactId': op['id']})
        self.assertEqual(result['error']['code'], 'ARTIFACT_BYTES_CHANGED')

    def test_public_pinned_acquisition_and_retained_distribution_verification(self):
        data = b'public pinned distribution'
        value = self.build_recipe()
        value['dependencies'] = [{'name': 'input.whl', 'url': 'https://example.test/input.whl', 'sha256': digest(data)}]
        class Response(io.BytesIO):
            status = 200
        with patch('urllib.request.OpenerDirector.open', return_value=Response(data)):
            acquire(value, self.root / 'inputs')
        self.assertEqual((self.root / 'inputs/input.whl').read_bytes(), data)
        with patch('urllib.request.OpenerDirector.open', return_value=Response(b'poisoned')):
            with self.assertRaises(Fault) as error:
                acquire(value, self.root / 'bad-inputs')
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_DEPENDENCY_CHANGED')
        with self.assertRaises(Fault):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'http://elsewhere')

    def test_undispatched_unknown_is_visible_bounded_and_never_relaunched(self):
        from tdev.native import NativeExecutor
        w, validation = self.validated(self.build_recipe())
        self.c.executor_override = None
        with patch.object(NativeExecutor, 'submit', side_effect=OSError('before reservation')) as submit:
            for i in range(8):
                args = {'action': 'prepare', 'requestId': 'unknown-' + str(i), 'validationId': validation}
                op = self.call('artifact', args)
                self.assertEqual(op['status'], 'unknown')
            refused = self.c.call('alice', 'tdev_artifact', {**args, 'requestId': 'ninth'})
            self.assertEqual(refused['error']['code'], 'ARTIFACT_BUILD_LIMIT')
            self.assertEqual(self.call('artifact', args)['id'], op['id'])
            self.assertEqual(submit.call_count, 8)
        listed = self.call('artifact', {'action': 'list', 'taskId': w['taskId'], 'limit': 1})
        self.assertEqual(len(listed['artifacts']), 1)
        self.assertEqual(len(listed['outstanding']), 8)
        self.assertTrue(all(o['status'] == 'unknown' for o in listed['outstanding']))
        denied = self.call('operation', {'action': 'retire', 'requestId': 'too-soon', 'operationId': op['id']})
        self.assertEqual(denied['error']['code'], 'PROCESS_NOT_RECONCILED')
        self.assertTrue(self.call('task', {'action': 'inspect', 'taskId': w['taskId']})['mutationReady'])

    def test_retained_dependency_capture_bounds_and_tampering(self):
        from tdev.artifact_build import capture
        from types import SimpleNamespace
        binding = {'recipe': self.build_recipe(), 'source': {}}
        binding['recipe']['dependencies'] = [{'name': 'input.bin', 'url': 'https://example.test/input', 'sha256': digest(b'pinned')}]
        job = self.root / 'capture'
        (job / 'work/dist').mkdir(parents=True)
        (job / 'work/dist/output').write_bytes(b'generated')
        (job / 'inputs').mkdir()
        (job / 'inputs/input.bin').write_bytes(b'pinned')
        with patch('tdev.artifact_build.OUTPUT_LIMIT', 2), self.assertRaises(Fault) as error:
            capture(job, binding, [])
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_SIZE_LIMIT')
        shutil.rmtree(job / 'artifact-staging')
        content = capture(job, binding, [])
        self.assertEqual(verify_storage(job / 'artifact', content)['files']['dist/output']['size'], 9)
        (job / 'artifact/inputs/input.bin').write_bytes(b'changed')
        with self.assertRaises(Fault) as error:
            verify_storage(job / 'artifact', content)
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_DEPENDENCY_CHANGED')
        filename = job / 'work/dist/output'
        with patch('os.fstat', return_value=SimpleNamespace(st_mode=filename.stat().st_mode, st_nlink=2)), self.assertRaises(Fault) as error:
            file_info(filename, 1024)
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_FILE_TYPE')
