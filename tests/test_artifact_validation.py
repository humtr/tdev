import json
import socket
from pathlib import Path
from unittest.mock import patch

import test_artifacts
import test_artifact_build
from test_core import Base
from test_deployments import FixtureDeployment
from test_resident import FakeRunit
from tdev.common import Fault, canonical
from tdev.core import Controller

APP = '''import os,json
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200); self.send_header('X-Tdev-Release',os.environ['TDEV_RELEASE']); self.end_headers()
  self.wfile.write(Path('asset.txt').read_bytes())
HTTPServer(('127.0.0.1',int(os.environ['TDEV_PORT'])),Handler).serve_forever()
'''
CHECK = '''import os,urllib.request
from pathlib import Path
with urllib.request.urlopen('http://127.0.0.1:'+os.environ['TDEV_PORT']+'/healthz') as r:
 assert r.headers['X-Tdev-Release']==os.environ['TDEV_RELEASE']
 assert r.read()==Path('asset.txt').read_bytes()
'''


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class ArtifactValidationTest(Base):
    validated = test_artifacts.ArtifactTest.validated
    build_recipe = test_artifact_build.NativeBuildTest.build_recipe

    def prepare(self, service=False, version='one', command=None):
        self.c.executor_override = self.executor
        recipe = self.build_recipe(command or 'mkdir dist; cp app.py check.py asset.txt dist/')
        recipe['inputs'] = ['app.py', 'check.py', 'asset.txt']
        if service:
            recipe.update(kind='service', service={'command': 'exec python -I -S -B app.py', 'cwd': 'dist',
                          'runtime': {'platform': recipe['target'], 'tools': recipe['build']['tools']}, 'environment': {}})
        extra = [{'action': 'put', 'path': p, 'before': None, 'content': data} for p, data in
                 [('app.py', APP), ('check.py', CHECK), ('asset.txt', version)]]
        w, source = self.validated(recipe, extra=extra)
        self.c.executor_override = None
        build = self.call('artifact', {'action': 'prepare', 'requestId': 'build-' + str(self.counter), 'validationId': source})
        self.assertEqual(self.wait(build['id'])['status'], 'succeeded')
        return w, source, build

    def verify(self, build, service=False, request='check', **extra):
        args = {'subject': 'artifact', 'artifactId': build['id'], 'requestId': request, **extra}
        if service:
            args['health'] = {'port': free_port(), 'path': '/healthz'}
        op = self.call('validate', args)
        return args, self.wait(op['id'])

    def delegate(self):
        self.repo.config['deploymentTargets'] = {'phone': {'kind': 'termux', 'servicePrefix': 'tdev-app-pkg-test-'}}
        self.repo.config['principals']['alice']['deploymentTargets'] = ['phone']
        self.runit = FakeRunit(self.root / 'svdir')
        self.c.deployments.backend = FixtureDeployment(self.root / 'state', self.runit)

    def release(self, validation, request='release', **extra):
        return self.call('deploy', {'action': 'release', 'subject': 'artifact', 'requestId': request,
                         'name': 'package', 'validationId': validation['id'], 'health': {'port': 18180, 'path': '/healthz'}, **extra})

    def test_file_validation_closed_source_fresh_policy_and_no_source_publication(self):
        w, source, build = self.prepare()
        self.repo.config['repositories']['test']['artifactValidation'] = 'test "$(cat dist/asset.txt)" = one'
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': w['taskId'], 'expected': w['checkpoint']})
        args, verified = self.verify(build)
        self.assertEqual(verified['status'], 'succeeded', verified)
        self.assertTrue(verified['result']['artifactChecked'])
        self.assertEqual(self.call('validate', args)['id'], verified['id'])
        inspected = self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})
        self.assertTrue(inspected['artifactValidated'])
        self.assertEqual(inspected['artifactValidationId'], verified['id'])
        denied = self.c.call('alice', 'tdev_publish', {'requestId': 'bad-publish', 'validationId': verified['id']})
        self.assertEqual(denied['error']['code'], 'SOURCE_VALIDATION_REQUIRED')
        self.repo.config['repositories']['test']['artifactValidation'] = 'exit 7'
        self.assertFalse(self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})['artifactValidated'])
        _, failed = self.verify(build, request='new-policy')
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(failed['result']['exitCode'], 7)
        self.assertEqual(failed['result']['contentDigest'], verified['result']['contentDigest'])
        for i, op in enumerate((verified, failed, build)):
            self.call('operation', {'action': 'retire', 'requestId': 'retire-' + str(i), 'operationId': op['id']})
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], w['checkpoint'])
        self.assertEqual(self.c.store.one('PRAGMA user_version')['user_version'], 5)

    def test_mutated_output_deadline_and_service_readiness_cannot_pass(self):
        _, _, build = self.prepare()
        for i, command in enumerate(('echo mutated > dist/asset.txt', 'sleep 10')):
            self.repo.config['repositories']['test']['artifactValidation'] = command
            _, result = self.verify(build, request='bad-' + str(i), timeout=1)
            self.assertEqual(result['status'], 'failed', result)
            self.assertFalse(result['result']['artifactChecked'])
            if i == 0:
                self.assertEqual(result['result']['captureError'], 'ARTIFACT_BYTES_CHANGED')
            else:
                self.assertTrue(result['result']['timedOut'])
        original = self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})
        self.assertTrue(original['verifiedBytes'])
        _, _, service = self.prepare(True, command="mkdir dist; cp check.py asset.txt dist/; printf 'raise SystemExit(9)\\n' > dist/app.py")
        self.repo.config['repositories']['test']['artifactValidation'] = 'true'
        _, result = self.verify(service, True, request='unready')
        self.assertEqual(result['status'], 'failed', result)
        self.assertFalse(result['result']['artifactChecked'])

    def test_validated_service_release_update_rollback_and_runtime_preflight(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, build = self.prepare(True)
        _, verified = self.verify(build, True)
        self.assertEqual(verified['status'], 'succeeded', verified)
        first = self.release(verified)
        self.assertEqual(first['status'], 'succeeded', first)
        ident = first['result']['deploymentId']
        _, _, second_build = self.prepare(True, 'two')
        _, second_validation = self.verify(second_build, True, 'check-two')
        second = self.release(second_validation, 'release-two', expectedRevision=1)
        self.assertEqual(second['status'], 'succeeded', second)
        events = list(self.runit.events)
        with patch('tdev.artifact_runtime.host_platform', return_value={'os': 'wrong'}):
            failed = self.c.call('alice', 'tdev_deploy', {'action': 'rollback', 'requestId': 'drift', 'deploymentId': ident, 'expectedRevision': 2})
        self.assertEqual(failed['error']['code'], 'ARTIFACT_RUNTIME_PLATFORM')
        self.assertEqual(events, self.runit.events)
        restored = self.call('deploy', {'action': 'rollback', 'requestId': 'rollback', 'deploymentId': ident, 'expectedRevision': 2})
        self.assertEqual(restored['result']['release'], first['result']['release'])
        for i, op in enumerate((build, verified, second_build, second_validation)):
            self.call('operation', {'action': 'retire', 'requestId': 'retire-' + str(i), 'operationId': op['id']})
        self.call('deploy', {'action': 'stop', 'requestId': 'stop', 'deploymentId': ident, 'expectedRevision': 3})
        self.call('deploy', {'action': 'start', 'requestId': 'start', 'deploymentId': ident, 'expectedRevision': 4})
        root = self.c.deployments.backend.root({'deploymentId': ident})
        (root / 'data').mkdir(exist_ok=True); (root / 'data/keep').write_text('keep')
        removed = self.call('deploy', {'action': 'remove', 'requestId': 'remove', 'deploymentId': ident, 'expectedRevision': 5})
        self.assertEqual(removed['status'], 'succeeded')
        self.assertEqual((root / 'data/keep').read_text(), 'keep')

    def test_current_policy_tampered_receipt_and_command_override_rejected(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, source, build = self.prepare(True)
        _, verified = self.verify(build, True)
        first = self.release(verified)
        before = list(self.runit.events)
        bad = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'subject': 'artifact', 'requestId': 'override',
                       'name': 'package', 'validationId': verified['id'], 'command': 'true', 'health': {'port': 18180, 'path': '/healthz'}})
        self.assertEqual(bad['error']['code'], 'SCHEMA')
        self.repo.config['repositories']['test']['artifactValidation'] = 'changed'
        with self.assertRaises(Fault) as error:
            self.c.config = self.c.load_config()
            self.c.artifacts.validated('alice', verified['id'])
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_VALIDATION_POLICY_CHANGED')
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        receipt = dict(verified['result']); receipt['contentDigest'] = '0' * 64
        with self.c.store.tx() as db:
            db.execute('UPDATE operation SET result=? WHERE id=?', (canonical(receipt).decode(), verified['id']))
        bad = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'subject': 'artifact', 'requestId': 'forged',
                       'name': 'package', 'validationId': verified['id'], 'health': {'port': 18180, 'path': '/healthz'}})
        self.assertEqual(bad['error']['code'], 'ARTIFACT_VALIDATION_RECEIPT')
        self.assertEqual(before, self.runit.events)

    def test_lost_validation_response_reconnect_and_interrupted_switch(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, build = self.prepare(True)
        from tdev.native import NativeExecutor
        submit = NativeExecutor.submit
        def lost(executor, payload):
            submit(executor, payload)
            raise OSError('lost response')
        args = {'subject': 'artifact', 'artifactId': build['id'], 'requestId': 'lost', 'health': {'port': free_port(), 'path': '/healthz'}}
        with patch.object(NativeExecutor, 'submit', lost):
            op = self.call('validate', args)
        self.assertEqual(op['status'], 'unknown')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        self.c.deployments.backend = FixtureDeployment(self.root / 'state', self.runit)
        verified = self.wait(op['id']); self.assertEqual(verified['status'], 'succeeded', verified)
        with patch.object(NativeExecutor, 'submit', side_effect=AssertionError('duplicate dispatch')):
            self.assertEqual(self.call('validate', args)['id'], op['id'])
        first = self.release(verified)
        original = self.c.deployments.backend.apply
        def crash(record, ident):
            original(record, ident)
            raise KeyboardInterrupt()
        with patch.object(self.c.deployments.backend, 'apply', crash), self.assertRaises(KeyboardInterrupt):
            self.release(verified, 'crash')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        self.c.deployments.backend = FixtureDeployment(self.root / 'state', self.runit)
        recovered = self.call('operation', {'action': 'status', 'lookupRequestId': 'crash'})
        self.assertEqual(recovered['status'], 'failed', recovered)
        self.assertEqual(recovered['result']['release'], first['result']['release'])
        self.assertTrue(recovered['result']['rolledBack'])

    def test_artifact_state_rejects_old_bundle_without_losing_source_state(self):
        from tdev.admin import point
        _, _, build = self.prepare()
        self.c.close()
        try:
            with patch('tdev.admin.verify', return_value={'stateVersions': [3, 4]}), self.assertRaises(Fault) as error:
                point(self.root, 'a' * 64)
            self.assertEqual(error.exception.value['code'], 'SCHEMA_VERSION')
        finally:
            self.c = Controller(self.root / 'state', self.repo.config)
        self.assertTrue(self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})['verifiedBytes'])

    def test_release_detects_retained_byte_tamper_before_stopping_service(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, build = self.prepare(True)
        _, verified = self.verify(build, True)
        first = self.release(verified)
        self.assertEqual(first['status'], 'succeeded')
        before = list(self.runit.events)
        content = verified['result']['contentDigest']
        (self.c.artifacts.objects() / content / 'files/dist/asset.txt').write_text('tampered')
        rejected = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'subject': 'artifact', 'requestId': 'tamper',
                       'name': 'package', 'validationId': verified['id'], 'health': {'port': 18180, 'path': '/healthz'}})
        self.assertEqual(rejected['error']['code'], 'ARTIFACT_BYTES_CHANGED')
        self.assertEqual(before, self.runit.events)
        # Cleanup remains available without material validation.
        stopped = self.call('deploy', {'action': 'stop', 'requestId': 'stop-tampered',
                            'deploymentId': first['result']['deploymentId'], 'expectedRevision': 1})
        self.assertEqual(stopped['status'], 'succeeded')
