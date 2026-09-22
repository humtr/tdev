import base64
import io
import json
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import test_artifacts
import test_artifact_build
import test_artifact_validation
from test_core import Base
from tdev.common import Fault, digest
from tdev.core import Controller
from tdev.artifact_build import acquire


class RetentionTest(Base):
    validated = test_artifacts.ArtifactTest.validated
    build_recipe = test_artifact_build.NativeBuildTest.build_recipe
    start = test_artifact_build.NativeBuildTest.start
    prepare = test_artifact_validation.ArtifactValidationTest.prepare
    verify = test_artifact_validation.ArtifactValidationTest.verify
    delegate = test_artifact_validation.ArtifactValidationTest.delegate
    release = test_artifact_validation.ArtifactValidationTest.release

    def built(self):
        task, args, op = self.start()
        self.assertEqual(self.wait(op['id'])['status'], 'succeeded')
        return task, args, op

    def preview(self, op):
        return self.call('artifact', {'action': 'prunePreview', 'artifactId': op['id']})

    def prune_args(self, op, request='prune'):
        return {'action': 'prune', 'requestId': request, 'artifactId': op['id'],
                'expectedPreview': self.preview(op)['previewToken']}

    def test_file_export_paging_integrity_scope_and_no_service(self):
        _, _, op = self.built()
        args = {'action': 'export', 'artifactId': op['id'], 'path': 'dist/out.txt', 'limit': 2}
        chunks, offset = [], 0
        while True:
            page = self.call('artifact', {**args, 'offset': offset})
            chunks.append(base64.b64decode(page['data']))
            offset = page['nextOffset']
            if page['eof']:
                break
        self.assertEqual(b''.join(chunks), b'hello\n')
        self.assertEqual(page['sha256'], digest(b'hello\n'))
        self.assertEqual(self.call('artifact', {'action': 'usage'})['retainedArtifacts'], 1)
        self.assertFalse(self.c.store.all('SELECT * FROM deployment'))
        self.assertEqual(self.c.call('bob', 'tdev_artifact', args)['error']['code'], 'PERMISSION_DENIED')
        self.assertEqual(self.c.call('alice', 'tdev_artifact', {**args, 'path': 'a.txt'})['error']['code'], 'ARTIFACT_EXPORT_SCOPE')
        manifest = self.call('artifact', {'action': 'inspect', 'artifactId': op['id']})
        (self.c.artifacts.objects() / manifest['contentDigest'] / 'files/dist/out.txt').write_text('tampered')
        self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'ARTIFACT_BYTES_CHANGED')

    def test_prune_closed_task_keeps_receipt_replays_and_rejects_reactivation(self):
        task, build_args, op = self.built()
        self.repo.config['repositories']['test']['artifactValidation'] = 'test -s dist/out.txt'
        _, check = self.verify(op)
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': task['taskId'], 'expected': task['checkpoint']})
        self.call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': op['id']})
        args = self.prune_args(op)
        result = self.call('artifact', args)
        self.assertEqual(result['status'], 'succeeded', result)
        self.assertEqual(self.call('artifact', args), result)
        self.assertEqual(self.call('artifact', build_args)['id'], op['id'])
        status = self.call('operation', {'action': 'status', 'operationId': op['id']})
        self.assertEqual(status['status'], 'succeeded')
        self.assertEqual(status['artifactStorage']['state'], 'pruned')
        inspected = self.call('artifact', {'action': 'inspect', 'artifactId': op['id']})
        self.assertFalse(inspected['retained'])
        self.assertEqual(self.call('artifact', {'action': 'usage'})['retainedBytes'], 0)
        with self.assertRaises(Fault) as error:
            self.c.artifacts.validated('alice', check['id'])
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_PRUNED')
        self.repo.config['principals']['alice']['repos'] = {}
        self.assertEqual(self.c.call('alice', 'tdev_artifact', args)['error']['code'], 'PERMISSION_DENIED')

    def test_shared_digest_releases_only_selected_reference(self):
        _, args, first = self.built()
        second = self.call('artifact', {**args, 'requestId': 'identical'})
        self.assertEqual(self.wait(second['id'])['status'], 'succeeded')
        before = self.call('artifact', {'action': 'usage'})
        self.assertEqual((before['retainedArtifacts'], before['retainedObjects']), (2, 1))
        page = self.call('artifact', {'action': 'usage', 'limit': 1})
        self.assertEqual(page['retainedArtifacts'], 1)
        tail = self.call('artifact', {'action': 'usage', 'limit': 1, 'before': page['nextBefore']})
        self.assertEqual(tail['retainedArtifacts'], 1)
        self.assertIsNone(tail['nextBefore'])
        preview = self.preview(first)
        self.assertTrue(preview['sharedObject'])
        self.assertEqual(preview['reclaimableBytes'], 0)
        self.call('artifact', self.prune_args(first))
        self.assertTrue(self.call('artifact', {'action': 'inspect', 'artifactId': second['id']})['verifiedBytes'])
        self.call('artifact', self.prune_args(second, 'last'))
        self.assertEqual(self.call('artifact', {'action': 'usage'})['retainedBytes'], 0)

    def test_unknown_validation_build_and_retention_policy_protect(self):
        _, build_args, op = self.built()
        original = self.prune_args(op)
        self.repo.config['artifactLimits'] = {'retentionSeconds': 3600}
        self.assertIn('retention_period', self.preview(op)['pins'])
        self.assertEqual(self.c.call('alice', 'tdev_artifact', original)['error']['code'], 'ARTIFACT_PINNED')
        self.repo.config['artifactLimits'] = {'outputBytes': 1024}
        self.assertEqual(self.c.call('alice', 'tdev_artifact', original)['error']['code'], 'ARTIFACT_PRUNE_STALE')
        with patch('tdev.native.NativeExecutor.submit', side_effect=OSError('lost')):
            check = self.call('validate', {'subject': 'artifact', 'artifactId': op['id'], 'requestId': 'unknown-check'})
        self.assertEqual(check['status'], 'unknown')
        self.assertIn('validation_in_flight', self.preview(op)['pins'])
        with patch('tdev.native.NativeExecutor.submit', side_effect=OSError('lost')):
            build = self.call('artifact', {**build_args, 'requestId': 'unknown-build'})
        self.assertEqual(build['status'], 'unknown')
        self.assertEqual(self.c.call('alice', 'tdev_artifact', {'action': 'prunePreview', 'artifactId': build['id']})['error']['code'], 'ARTIFACT_NOT_RETAINED')

    def test_deployment_current_previous_stopped_and_remove_pins(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, one = self.prepare(True)
        _, v1 = self.verify(one, True, 'check-one')
        first = self.release(v1)
        self.assertEqual(first['status'], 'succeeded', first)
        _, _, two = self.prepare(True, 'two')
        _, v2 = self.verify(two, True, 'check-two')
        second = self.release(v2, 'update')
        self.assertEqual(second['status'], 'succeeded', second)
        self.assertIn('deployment_previous', self.preview(one)['pins'])
        self.assertIn('deployment_release', self.preview(two)['pins'])
        ident = first['result']['deploymentId']
        self.call('deploy', {'action': 'stop', 'requestId': 'stop', 'deploymentId': ident, 'expectedRevision': 2})
        self.assertFalse(self.preview(one)['canPrune'])
        self.call('deploy', {'action': 'remove', 'requestId': 'remove', 'deploymentId': ident, 'expectedRevision': 3})
        self.assertTrue(self.preview(one)['canPrune'])
        self.call('artifact', self.prune_args(one))
        self.assertEqual(self.c.call('alice', 'tdev_deploy', {'action': 'rollback', 'requestId': 'bad-rollback', 'deploymentId': ident, 'expectedRevision': 4})['error']['code'], 'ARTIFACT_PRUNED')

    def test_delete_interruption_reconnect_and_new_shared_reference(self):
        _, build_args, op = self.built()
        args = self.prune_args(op)
        with patch('tdev.artifact_retention.shutil.rmtree', side_effect=OSError('disk interrupted')):
            result = self.call('artifact', args)
        self.assertEqual(result['status'], 'unknown', result)
        self.assertTrue((self.c.artifacts.objects() / ('.prune-' + result['id'])).exists())
        # A later independently built identical object must survive cleanup recovery.
        other = self.call('artifact', {**build_args, 'requestId': 'new-reference'})
        self.assertEqual(self.wait(other['id'])['status'], 'succeeded')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        recovered = self.call('artifact', args)
        self.assertEqual(recovered['status'], 'succeeded', recovered)
        self.assertTrue(self.call('artifact', {'action': 'inspect', 'artifactId': other['id']})['verifiedBytes'])
        self.assertEqual(self.c.store.one('PRAGMA user_version')['user_version'], 5)
        self.assertFalse((self.c.artifacts.objects() / ('.prune-' + result['id'])).exists())

    def test_prune_and_release_concurrent_admission_cannot_delete_active_bytes(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, build = self.prepare(True)
        _, check = self.verify(build, True)
        prune_args = self.prune_args(build)
        release_args = {'action': 'release', 'subject': 'artifact', 'requestId': 'release', 'name': 'package',
                        'validationId': check['id'], 'health': {'port': 18180, 'path': '/healthz'}}
        with ThreadPoolExecutor(2) as pool:
            a = pool.submit(self.c.call, 'alice', 'tdev_artifact', prune_args)
            b = pool.submit(self.c.call, 'alice', 'tdev_deploy', release_args)
            pruned, released = a.result(), b.result()
        self.assertNotEqual(pruned['ok'], released['ok'], (pruned, released))
        if released['ok']:
            self.assertTrue(self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})['verifiedBytes'])
        else:
            self.assertEqual(released['error']['code'], 'ARTIFACT_PRUNED')

    def test_unknown_switch_protects_new_previous_and_stale_preview(self):
        self.delegate()
        self.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        _, _, one = self.prepare(True)
        _, v1 = self.verify(one, True, 'first-check')
        self.release(v1)
        _, _, two = self.prepare(True, 'two')
        _, v2 = self.verify(two, True, 'second-check')
        stale = self.prune_args(two)
        with patch.object(self.c.deployments.backend, 'apply', side_effect=OSError('ambiguous switch')):
            result = self.release(v2, 'switch')
        self.assertEqual(result['status'], 'unknown', result)
        self.assertIn('deployment_in_flight', self.preview(one)['pins'])
        self.assertIn('deployment_in_flight', self.preview(two)['pins'])
        self.assertEqual(self.c.call('alice', 'tdev_artifact', stale)['error']['code'], 'ARTIFACT_PINNED')

    def test_interrupted_rename_and_untrusted_trash_preserve_outside_files(self):
        _, _, op = self.built()
        args = self.prune_args(op)
        with patch('tdev.artifact_retention.os.rename', side_effect=OSError('rename interrupted')):
            result = self.call('artifact', args)
        self.assertEqual(result['status'], 'unknown')
        external = self.root / 'external'; external.mkdir(); (external / 'keep').write_text('user')
        trash = self.c.artifacts.objects() / ('.prune-' + result['id'])
        trash.symlink_to(external, target_is_directory=True)
        retried = self.call('artifact', args)
        self.assertEqual(retried['status'], 'unknown')
        self.assertEqual((external / 'keep').read_text(), 'user')
        trash.unlink()
        self.assertEqual(self.call('artifact', args)['status'], 'succeeded')

    def test_operator_output_file_input_deadline_and_reserved_storage_limits(self):
        self.repo.config['artifactLimits'] = {'outputBytes': 2}
        _, _, op = self.start()
        done = self.wait(op['id'])
        self.assertEqual(done['result']['captureError'], 'ARTIFACT_SIZE_LIMIT', done)
        self.c.executor_override = self.executor
        self.repo.config['artifactLimits'] = {'files': 1}
        _, _, op = self.start(self.build_recipe('mkdir dist; echo a > dist/a; echo b > dist/b'), 'many-files')
        self.assertEqual(self.wait(op['id'])['result']['captureError'], 'ARTIFACT_FILE_LIMIT')
        self.c.executor_override = self.executor
        self.repo.config['artifactLimits'] = {'timeoutSeconds': 1}
        _, source = self.validated(self.build_recipe())
        self.c.executor_override = None
        denied = self.c.call('alice', 'tdev_artifact', {'action': 'prepare', 'requestId': 'long', 'validationId': source, 'timeout': 2})
        self.assertEqual(denied['error']['code'], 'ARTIFACT_DEADLINE_LIMIT')
        self.repo.config['artifactLimits'] = {'outputBytes': 10, 'inputBytes': 10, 'retainedBytes': 1048596}
        with patch('tdev.native.NativeExecutor.submit', side_effect=OSError('lost')):
            first = self.call('artifact', {'action': 'prepare', 'requestId': 'reserve', 'validationId': source})
        self.assertEqual(first['status'], 'unknown')
        denied = self.c.call('alice', 'tdev_artifact', {'action': 'prepare', 'requestId': 'over-budget', 'validationId': source})
        self.assertEqual(denied['error']['code'], 'ARTIFACT_RETAINED_LIMIT')
        response = io.BytesIO(b'pinned'); response.status = 200
        dependency = {'dependencies': [{'name': 'dep', 'url': 'https://example.test/dep', 'sha256': digest(b'pinned')}]}
        with patch('urllib.request.OpenerDirector.open', return_value=response), self.assertRaises(Fault) as error:
            acquire(dependency, self.root / 'inputs', {'inputBytes': 2})
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_INPUT_LIMIT')

    def test_fast_build_still_enforces_working_budget_and_small_export_count(self):
        self.repo.config['artifactLimits'] = {'workingBytes': 128}
        _, _, op = self.start()
        self.assertEqual(self.wait(op['id'])['status'], 'failed')
        self.c.executor_override = self.executor
        self.repo.config['artifactLimits'] = {'files': 1}
        _, _, op = self.start(request='one-export')
        self.assertEqual(self.wait(op['id'])['status'], 'succeeded')

    def test_schema_four_metadata_upgrade_preserves_retained_bytes(self):
        import sqlite3
        _, args, op = self.built()
        original = self.call('artifact', {'action': 'inspect', 'artifactId': op['id']})
        self.c.close()
        with sqlite3.connect(self.root / 'state/state.sqlite') as db:
            for column in ('bytes', 'retained_ns', 'pruned'):
                db.execute('ALTER TABLE artifact DROP COLUMN ' + column)
            db.execute('PRAGMA user_version=4')
        self.c = Controller(self.root / 'state', self.repo.config)
        usage = self.call('artifact', {'action': 'usage'})
        self.assertEqual(usage['unmeasuredArtifacts'], 1)
        self.assertEqual(self.call('artifact', {'action': 'inspect', 'artifactId': op['id']}), original)
        second = self.call('artifact', {**args, 'requestId': 'after-upgrade'})
        self.assertEqual(self.wait(second['id'])['status'], 'succeeded')
        usage = self.call('artifact', {'action': 'usage'})
        self.assertEqual(usage['unmeasuredArtifacts'], 0)
        self.assertEqual(usage['retainedArtifacts'], 2)
        self.assertEqual(self.c.store.one('PRAGMA user_version')['user_version'], 5)

    def test_pending_seal_does_not_block_cleanup_or_lose_its_own_capture(self):
        _, args, first = self.built()
        second = self.call('artifact', {**args, 'requestId': 'second'})
        self.assertEqual(self.wait(second['id'])['status'], 'succeeded')
        # Receipt commit lost after sealing: native capture remains independently owned.
        with self.c.store.tx() as db:
            db.execute('DELETE FROM artifact WHERE operation=?', (second['id'],))
            db.execute("UPDATE operation SET status='unknown',effect='unknown',result=NULL WHERE id=?", (second['id'],))
        self.assertTrue(self.preview(first)['canPrune'])
        self.assertEqual(self.call('artifact', self.prune_args(first))['status'], 'succeeded')
        with patch('tdev.native.NativeExecutor.submit', side_effect=AssertionError('must not rebuild')):
            self.assertEqual(self.wait(second['id'])['status'], 'succeeded')
        self.assertTrue(self.call('artifact', {'action': 'inspect', 'artifactId': second['id']})['verifiedBytes'])
