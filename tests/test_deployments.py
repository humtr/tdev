import json
from unittest.mock import patch

from test_core import Base
from test_resident import FakeRunit
from tdev.common import Fault, digest
from tdev.core import Controller
from tdev.deployments import NativeDeployment
from tdev.deployment_runtime import verify_release


class FixtureDeployment(NativeDeployment):
    def status(self, record):
        running = self.backend.running.get(record['service'], False)
        if running:
            manifest = verify_release((self.root(record) / 'active').resolve())
            if manifest['command'] == 'unready':
                raise Fault('DEPLOYMENT_NOT_READY')
        return {'running': running, 'healthy': running, 'release': record['release']}


class DeploymentTest(Base):
    def setUp(self):
        super().setUp()
        self.repo.config['deploymentTargets'] = {'phone': {'kind': 'termux', 'servicePrefix': 'tdev-app-test-'}}
        self.repo.config['principals']['alice']['deploymentTargets'] = ['phone']
        self.runit = FakeRunit(self.root / 'svdir')
        self.c.deployments.backend = FixtureDeployment(self.root / 'state', self.runit)

    def validated(self):
        w = self.open()
        v = self.call('validate', {'requestId': 'validation-' + str(self.counter), 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'release'})
        done = self.wait(v['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        return w, v['id'], done['result']['candidate']

    def release(self, validation, request='release', **extra):
        return self.call('deploy', {'action': 'release', 'requestId': request, 'name': 'demo', 'validationId': validation,
                                   'command': 'exec python app.py', 'health': {'port': 18080, 'path': '/healthz'}, **extra})

    def inspect(self, ident):
        return self.call('deploy', {'action': 'inspect', 'deploymentId': ident})

    def control(self, ident, action, revision, request=None):
        return self.call('deploy', {'action': action, 'requestId': request or action, 'deploymentId': ident, 'expectedRevision': revision})

    def restart(self):
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        self.c.deployments.backend = FixtureDeployment(self.root / 'state', self.runit)

    def test_validation_release_update_rollback_and_remove_preserve_data(self):
        w, validation, candidate = self.validated()
        first = self.release(validation)
        self.assertEqual(first['status'], 'succeeded', first)
        ident = first['result']['deploymentId']
        view = self.inspect(ident)
        record = view['deployment']
        self.assertEqual(record['revision'], 1)
        self.assertTrue(view['runtime']['healthy'])
        root = self.c.deployments.backend.root(record)
        manifest = verify_release(root / 'releases' / record['release'])
        self.assertEqual(manifest['candidate'], candidate)
        self.assertEqual((root / 'releases' / record['release'] / 'source/a.txt').read_text(), 'hello\n')
        # Releasing a different validated task leaves the previous release available.
        _, second_validation, _ = self.validated()
        second = self.release(second_validation, 'second-release', expectedRevision=1)
        self.assertEqual(second['status'], 'succeeded')
        self.assertNotEqual(second['result']['release'], first['result']['release'])
        rollback = self.control(ident, 'rollback', 2)
        self.assertEqual(rollback['result']['release'], first['result']['release'])
        self.assertEqual(self.control(ident, 'stop', 3)['result']['desired'], 'down')
        self.assertFalse(self.inspect(ident)['runtime']['running'])
        self.assertEqual(self.control(ident, 'start', 4)['result']['desired'], 'up')
        (root / 'data').mkdir(); (root / 'data/keep').write_text('retained')
        self.assertEqual(self.control(ident, 'remove', 5)['result']['desired'], 'removed')
        self.assertFalse((self.runit.svdir / record['service']).exists())
        self.assertEqual((root / 'data/keep').read_text(), 'retained')
        self.assertTrue((root / 'releases' / first['result']['release']).exists())
        self.assertEqual(self.c.task('alice', w['taskId'])['checkpoint'], w['checkpoint'])

    def test_release_replay_and_revision_cas(self):
        _, validation, _ = self.validated()
        first = self.release(validation)
        before = list(self.runit.events)
        self.restart()
        self.assertEqual(self.release(validation), first)
        self.assertEqual(self.runit.events, before)
        ident = first['result']['deploymentId']
        stale = self.c.call('alice', 'tdev_deploy', {'action': 'stop', 'requestId': 'stale', 'deploymentId': ident, 'expectedRevision': 0})
        self.assertEqual(stale['error']['code'], 'STALE_DEPLOYMENT')
        mismatch = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'requestId': 'release', 'name': 'different', 'validationId': validation, 'command': 'true', 'health': {'port': 18080, 'path': '/'}})
        self.assertEqual(mismatch['error']['code'], 'IDEMPOTENCY_MISMATCH')

    def test_readiness_failure_restores_previous_and_does_not_claim_success(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        bad = self.release(validation, 'bad-release', command='unready')
        self.assertEqual(bad['status'], 'failed', bad)
        self.assertTrue(bad['result']['rolledBack'])
        self.assertEqual(bad['result']['release'], good['result']['release'])
        view = self.inspect(good['result']['deploymentId'])
        self.assertEqual(view['deployment']['revision'], 1)
        self.assertTrue(view['runtime']['healthy'])
        self.assertIsNone(view['busy'])

    def test_interrupted_activation_restores_old_release_on_observation(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        original = self.c.deployments.backend.apply
        def crash(record, operation_id):
            original(record, operation_id)
            raise KeyboardInterrupt()
        with patch.object(self.c.deployments.backend, 'apply', crash):
            with self.assertRaises(KeyboardInterrupt):
                self.release(validation, 'crash-release', command='new-command')
        self.restart()
        recovered = self.call('operation', {'action': 'status', 'lookupRequestId': 'crash-release'})
        self.assertEqual(recovered['status'], 'failed', recovered)
        self.assertTrue(recovered['result']['rolledBack'])
        self.assertEqual(recovered['result']['release'], good['result']['release'])
        self.assertTrue(self.inspect(good['result']['deploymentId'])['runtime']['healthy'])

    def test_lost_success_receipt_does_not_restart_service(self):
        _, validation, _ = self.validated()
        with patch.object(self.c.deployments, 'finish', side_effect=KeyboardInterrupt()):
            with self.assertRaises(KeyboardInterrupt):
                self.release(validation, 'lost-success')
        before = list(self.runit.events)
        self.restart()
        completed = self.call('operation', {'action': 'status', 'lookupRequestId': 'lost-success'})
        self.assertEqual(completed['status'], 'succeeded', completed)
        self.assertEqual(before, self.runit.events)

    def test_foreign_service_and_changed_owned_launcher_are_preserved(self):
        _, validation, _ = self.validated()
        ident = digest({'owner': 'alice', 'target': 'phone', 'name': 'demo'})[:32]
        foreign = self.runit.svdir / ('tdev-app-test-' + ident)
        foreign.mkdir(); (foreign / 'run').write_text('foreign')
        denied = self.release(validation)
        self.assertEqual(denied['error']['code'], 'DEPLOYMENT_SERVICE_CONFLICT')
        self.assertEqual((foreign / 'run').read_text(), 'foreign')
        (foreign / 'run').unlink(); foreign.rmdir()
        good = self.release(validation, 'owned')
        (foreign / 'run').write_text('changed externally')
        denied = self.control(good['result']['deploymentId'], 'stop', 1)
        self.assertEqual(denied['error']['code'], 'DEPLOYMENT_SERVICE_CHANGED')
        self.assertEqual((foreign / 'run').read_text(), 'changed externally')

    def test_current_target_and_project_authority_precede_replay(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        ident = good['result']['deploymentId']
        self.repo.config['principals']['alice']['deploymentTargets'] = []
        denied = self.c.call('alice', 'tdev_deploy', {'action': 'inspect', 'deploymentId': ident})
        self.assertEqual(denied['error']['code'], 'DEPLOYMENT_TARGET_REQUIRED')
        self.repo.config['principals']['alice']['deploymentTargets'] = ['phone']
        self.repo.config['deploymentTargets']['phone']['servicePrefix'] = 'tdev-app-other-'
        denied = self.c.call('alice', 'tdev_operation', {'action': 'status', 'operationId': good['id']})
        self.assertEqual(denied['error']['code'], 'DEPLOYMENT_TARGET_CHANGED')
        self.repo.config['deploymentTargets']['phone']['servicePrefix'] = 'tdev-app-test-'
        self.repo.config['principals']['alice']['repos'] = {}
        denied = self.c.call('alice', 'tdev_deploy', {'action': 'inspect', 'deploymentId': ident})
        self.assertEqual(denied['error']['code'], 'PERMISSION_DENIED')

    def test_validation_policy_change_rejected_before_service_creation(self):
        _, validation, _ = self.validated()
        self.repo.config['repositories']['test']['validation'] = 'changed-policy'
        result = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'requestId': 'bad', 'name': 'demo', 'validationId': validation, 'command': 'true', 'health': {'port': 18080, 'path': '/'}})
        self.assertEqual(result['error']['code'], 'VALIDATION_POLICY_CHANGED')
        self.assertEqual(self.runit.events, [])

    def test_inspection_log_generation_and_no_change_freshness(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        ident = good['result']['deploymentId']
        first = self.inspect(ident)
        current = self.call('deploy', {'action': 'inspect', 'deploymentId': ident, 'since': first['observation']['cursor']})
        self.assertFalse(current['observation']['changed'])
        record = first['deployment']; logs = self.c.deployments.backend.root(record) / 'logs/current'
        logs.write_bytes(b'one\ntwo\n')
        current = self.call('deploy', {'action': 'inspect', 'deploymentId': ident, 'limit': 4})
        self.assertEqual(current['logs']['nextOffset'], 4)
        old_generation = current['logs']['generation']
        logs.rename(logs.with_name('rotated')); logs.write_bytes(b'new\n')
        self.assertNotEqual(self.inspect(ident)['logs']['generation'], old_generation)

    def test_pre_dispatch_crash_releases_only_that_deployment_writer(self):
        _, validation, _ = self.validated()
        with patch.object(self.c.deployments.backend, 'prepare', side_effect=KeyboardInterrupt()):
            with self.assertRaises(KeyboardInterrupt):
                self.release(validation, 'prepare-crash')
        self.restart()
        interrupted = self.call('operation', {'action': 'status', 'lookupRequestId': 'prepare-crash'})
        self.assertEqual(interrupted['status'], 'failed')
        self.assertEqual(interrupted['effect'], 'none')
        self.assertIsNone(self.c.store.one('SELECT busy FROM deployment')['busy'])
        self.assertEqual(self.release(validation, 'after-prepare-crash')['status'], 'succeeded')

    def test_recovery_failure_keeps_fence_until_original_operation_reconciles(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        original = self.c.deployments.backend.apply
        with patch.object(self.c.deployments.backend, 'apply', side_effect=Fault('FIXTURE_DOWN')):
            failed = self.release(validation, 'recover-later', command='new-command')
        self.assertEqual(failed['status'], 'unknown')
        self.assertEqual(self.c.store.one('SELECT busy FROM deployment')['busy'], failed['id'])
        self.assertIsNotNone(original)
        self.restart()
        done = self.call('operation', {'action': 'status', 'operationId': failed['id']})
        self.assertEqual(done['status'], 'failed')
        self.assertTrue(done['result']['rolledBack'])
        self.assertEqual(done['result']['release'], good['result']['release'])
        self.assertIsNone(self.c.store.one('SELECT busy FROM deployment')['busy'])

    def test_source_tampering_is_rejected_before_reactivation(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        ident = good['result']['deploymentId']
        self.control(ident, 'stop', 1)
        record = self.inspect(ident)['deployment']
        source = self.c.deployments.backend.root(record) / 'releases' / record['release'] / 'source/a.txt'
        source.write_text('tampered')
        started = self.c.call('alice', 'tdev_deploy', {'action': 'start', 'requestId': 'tampered-start', 'deploymentId': ident, 'expectedRevision': 2})
        self.assertEqual(started['error']['code'], 'RELEASE_CHANGED')
        self.assertFalse(self.runit.running[record['service']])
        source.write_text('hello\n')
        self.assertEqual(self.control(ident, 'start', 2)['status'], 'succeeded')

    def test_http_readiness_requires_release_header_and_live_child(self):
        from tdev.common import atomic_write, canonical
        _, validation, _ = self.validated()
        first = self.release(validation)
        record = self.inspect(first['result']['deploymentId'])['deployment']
        backend = NativeDeployment(self.root / 'state', self.runit)
        atomic_write(backend.root(record) / 'runtime.json', canonical({'supervisor': {'pid': 100, 'start': 'a'},
                     'child': {'pid': 101, 'start': 'b'}, 'phase': 'running', 'release': record['release']}))
        identities = {100: {'pid': 100, 'start': 'a', 'state': 'R'}, 101: {'pid': 101, 'start': 'b', 'state': 'R'}}
        with patch('tdev.deployments.identity', side_effect=lambda pid: identities[pid]), patch('tdev.deployments.http.client.HTTPConnection') as connection:
            response = connection.return_value.getresponse.return_value
            response.status = 200
            response.getheader.return_value = 'wrong-release'
            self.assertFalse(backend.status(record)['healthy'])
            response.getheader.return_value = record['release']
            self.assertTrue(backend.status(record)['healthy'])
            identities[101]['state'] = 'Z'
            self.assertFalse(backend.status(record)['healthy'])

    def test_extra_source_files_and_restart_policy_change_are_not_silent(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        ident = good['result']['deploymentId']
        self.control(ident, 'stop', 1)
        record = self.inspect(ident)['deployment']
        directory = self.c.deployments.backend.root(record) / 'releases' / record['release']
        extra = directory / 'source/extra.py'; extra.write_text('not in validated tree')
        with self.assertRaises(Fault):
            verify_release(directory)
        extra.unlink()
        self.repo.config['repositories']['test']['validation'] = 'changed-policy'
        denied = self.c.call('alice', 'tdev_deploy', {'action': 'start', 'requestId': 'new-policy', 'deploymentId': ident, 'expectedRevision': 2})
        self.assertEqual(denied['error']['code'], 'VALIDATION_POLICY_CHANGED')
        # Stopping/removing retained resources does not require revalidating them.
        self.assertEqual(self.control(ident, 'remove', 2)['status'], 'succeeded')

    def test_changed_source_can_still_be_stopped_and_removed(self):
        _, validation, _ = self.validated()
        good = self.release(validation)
        ident = good['result']['deploymentId']
        row = self.c.deployments.get('alice', ident)
        record = json.loads(row['record'])
        source = self.c.deployments.backend.root(record) / 'releases' / record['release'] / 'source/a.txt'
        source.write_text('changed runtime source')
        self.assertEqual(self.control(ident, 'stop', 1)['status'], 'succeeded')
        self.assertEqual(self.control(ident, 'remove', 2)['status'], 'succeeded')
        self.assertEqual(source.read_text(), 'changed runtime source')
