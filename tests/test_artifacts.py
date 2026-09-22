import copy
import json
from unittest.mock import patch

from test_core import Base
from tdev.artifacts import check_manifest, make_manifest, parse_recipe, source_validation
from tdev.common import Fault, canonical, digest
from tdev.core import Controller


def recipe(kind='files'):
    platform = {'os': 'android', 'arch': 'aarch64', 'abi': 'bionic'}
    value = {'format': 1, 'kind': kind, 'inputs': ['a.txt'], 'dependencies': [],
             'build': {'command': 'python build.py', 'platform': platform,
                       'tools': [{'name': 'python', 'sha256': 'a' * 64}]},
             'exports': ['dist'], 'target': platform}
    if kind == 'service':
        value['service'] = {'command': 'exec python app.py', 'cwd': 'dist',
                            'runtime': {'platform': dict(platform), 'tools': value['build']['tools']},
                            'environment': {'APP_MODE': 'production'}}
    return value


class ArtifactTest(Base):
    def validated(self, value=None, raw=None, extra=None):
        w = self.open()
        content = raw if raw is not None else json.dumps(value or recipe())
        edits = [{'action': 'put', 'path': 'tdev-package.json', 'before': None, 'content': content}]
        edits.extend(extra or [])
        changed = self.call('edit', {'requestId': 'recipe-' + str(self.counter), 'taskId': w['taskId'],
                            'expected': w['checkpoint'], 'edits': edits})
        w['checkpoint'] = changed['result']['checkpoint']
        v = self.call('validate', {'requestId': 'validate-' + str(self.counter), 'taskId': w['taskId'],
                      'expected': w['checkpoint'], 'message': 'package source'})
        self.assertEqual(self.wait(v['id'])['status'], 'succeeded')
        return w, v['id']

    def inspect(self, validation, **extra):
        return self.call('artifact', {'action': 'inspectRecipe', 'validationId': validation, **extra})

    def failure(self, validation, code, principal='alice', **extra):
        result = self.c.call(principal, 'tdev_artifact', {'action': 'inspectRecipe', 'validationId': validation, **extra})
        self.assertEqual(result['error']['code'], code, result)

    def test_native_inspection_uses_frozen_source_without_build_or_deployment(self):
        self.c.executor_override = None
        value = recipe('archive')
        marker = self.root / 'never-build'
        value['build']['command'] = 'touch ' + str(marker)
        w, validation = self.validated(value)
        expected_candidate = json.loads(self.c.operation('alice', validation)['intent'])['candidate']
        count = len(self.c.store.all('SELECT id FROM operation'))
        with patch.object(self.c, 'backend', side_effect=AssertionError('inspection must not dispatch/reconcile')):
            result = self.inspect(validation)
        self.assertEqual(len(self.c.store.all('SELECT id FROM operation')), count)
        self.assertFalse(marker.exists())
        self.assertFalse(result['buildExecuted'])
        self.assertEqual(result['candidate'], expected_candidate)
        self.assertEqual(result['source']['inputs']['a.txt']['sha256'], digest(b'hello\n'))
        self.assertNotIn('deploymentTargets', self.repo.config)
        self.call('edit', {'requestId': 'later', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                          'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'later'}]})
        self.assertEqual(self.inspect(validation), result)
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': w['taskId'],
                          'expected': self.c.task('alice', w['taskId'])['checkpoint']})
        self.assertEqual(self.inspect(validation), result)
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config)
        self.assertEqual(self.inspect(validation), result)
        (self.c.store.root / 'maintenance.json').write_text('{}')
        self.assertEqual(self.inspect(validation), result)

    def test_current_authority_identity_and_source_policy_precede_read(self):
        _, validation = self.validated()
        self.repo.config['principals']['bob'] = {'tokenHash': digest(b'bob'), 'repos': {'test': ['refs/heads/main']}}
        self.failure(validation, 'OPERATION_NOT_FOUND', principal='bob')
        cfg = self.repo.config['repositories']['test']
        cfg['identity'] += '-replaced'
        self.failure(validation, 'REPOSITORY_IDENTITY')
        cfg['identity'] = cfg['identity'].removesuffix('-replaced')
        cfg['validation'] = 'exit 0'
        self.failure(validation, 'VALIDATION_POLICY_CHANGED')
        self.repo.config['principals']['alice']['repos'] = {}
        self.failure(validation, 'PERMISSION_DENIED')

    def test_artifact_policy_is_adopted_not_recipe_supplied(self):
        _, validation = self.validated()
        original = self.inspect(validation)
        cfg = self.repo.config['repositories']['test']
        cfg['artifactValidation'] = 'python verify_package.py'
        current = self.inspect(validation)
        self.assertEqual(current['sourcePolicy'], original['sourcePolicy'])
        self.assertNotEqual(current['artifactPolicy'], original['artifactPolicy'])
        self.assertNotEqual(current['bindingDigest'], original['bindingDigest'])
        self.assertEqual(current['source'], original['source'])
        del cfg['artifactValidation']
        self.assertEqual(self.inspect(validation), original)
        self.failure(validation, 'SCHEMA', artifactPolicy=original['artifactPolicy'])
        self.failure(validation, 'SCHEMA', command='true')

    def test_missing_symlink_and_unsafe_recipe_inputs_rejected(self):
        _, missing = self.validated({**recipe(), 'inputs': ['absent.lock']})
        self.failure(missing, 'ARTIFACT_INPUT_MISSING')
        _, link = self.validated({**recipe(), 'inputs': ['link']}, extra=[
            {'action': 'put', 'path': 'link', 'before': None, 'content': 'a.txt', 'mode': '120000'}])
        self.failure(link, 'ARTIFACT_INPUT_MISSING')
        self.failure(link, 'ARTIFACT_RECIPE_MISSING', path='link')
        self.failure(link, 'PATH', path='../tdev-package.json')
        self.failure(link, 'ARTIFACT_RECIPE_MISSING', path='missing.json')

    def test_strict_json_and_policy_injection_are_rejected(self):
        invalid = [b'{"format":1,"format":1}', b'{"format":NaN}', b'\xff', b'{', b'[]', b' ' * 65537]
        for raw in invalid:
            with self.subTest(raw=raw[:30]), self.assertRaises(Fault):
                parse_recipe(raw)
        for field in ('validation', 'artifactValidation', 'adminApproved', 'targetId', 'signingKey', 'outputRoot'):
            with self.subTest(field=field), self.assertRaises(Fault):
                parse_recipe(canonical({**recipe(), field: 'true'}))

    def test_paths_exports_and_platform_requirements(self):
        for roots in [['../dist'], ['/dist'], ['dist', 'dist/a'], ['dist', 'DIST'], ['Dist/a', 'dist/b'], ['.git/x'], ['dist\\a']]:
            with self.subTest(roots=roots), self.assertRaises(Fault):
                parse_recipe(canonical({**recipe(), 'exports': roots}))
        value = recipe('service')
        for key in ('HOME', 'TDEV_RELEASE', 'PYTHONPATH', 'LD_PRELOAD', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'VIRTUAL_ENV'):
            bad = copy.deepcopy(value); bad['service']['environment'][key] = 'override'
            with self.subTest(key=key), self.assertRaises(Fault):
                parse_recipe(canonical(bad))
        bad = copy.deepcopy(value); bad['service']['runtime']['platform']['arch'] = 'other'
        with self.assertRaises(Fault): parse_recipe(canonical(bad))
        for kind in ('files', 'archive', 'binary', 'apk', 'aab'):
            self.assertNotIn('service', parse_recipe(canonical(recipe(kind))))
            with self.assertRaises(Fault): parse_recipe(canonical({**value, 'kind': kind}))
        self.assertEqual(parse_recipe(canonical(value)), value)

    def test_dependency_pins_and_unique_tool_identities(self):
        value = recipe()
        dep = {'name': 'package', 'url': 'https://example.org/package.whl', 'sha256': 'b' * 64}
        value['dependencies'] = [dep]
        self.assertEqual(parse_recipe(canonical(value)), value)
        for url in ['http://example.org/a', 'file:///tmp/key', 'https://user:secret@example.org/a',
                    'https://example.org/a?token=x', 'https://example.org/a#x', 'https://example.org:bad/a']:
            bad = copy.deepcopy(value); bad['dependencies'][0]['url'] = url
            with self.subTest(url=url), self.assertRaises(Fault): parse_recipe(canonical(bad))
        for checksum in ['', 'latest', 'f' * 63]:
            bad = copy.deepcopy(value); bad['dependencies'][0]['sha256'] = checksum
            with self.assertRaises(Fault): parse_recipe(canonical(bad))
        value['dependencies'].append({**dep, 'url': 'https://example.org/other'})
        with self.assertRaises(Fault): parse_recipe(canonical(value))
        value = recipe(); value['build']['tools'].append({'name': 'python', 'sha256': 'b' * 64})
        with self.assertRaises(Fault): parse_recipe(canonical(value))

    def test_manifest_identity_excludes_receipt_ids_but_binds_every_content_input(self):
        _, validation = self.validated()
        binding = self.inspect(validation)
        files = {'dist/app.bin': {'mode': '100755', 'sha256': digest(b'compiled'), 'size': 8}}
        manifest = make_manifest(binding, files)
        ident = check_manifest(manifest, binding)
        other = copy.deepcopy(binding)
        other.update(validationId='other-validation', candidate='f' * 40, artifactPolicy='a' * 64)
        other['bindingDigest'] = digest({k: v for k, v in other.items() if k != 'bindingDigest'})
        self.assertEqual(check_manifest(make_manifest(other, files), other), ident)
        for field, change in [('mode', '100644'), ('sha256', 'c' * 64), ('size', 9)]:
            changed = copy.deepcopy(files); changed['dist/app.bin'][field] = change
            self.assertNotEqual(check_manifest(make_manifest(binding, changed), binding), ident)
        altered = copy.deepcopy(binding); altered['recipe']['build']['command'] = 'different'
        with self.assertRaises(Fault): make_manifest(altered, files)
        altered['bindingDigest'] = digest({k: v for k, v in altered.items() if k != 'bindingDigest'})
        with self.assertRaises(Fault): check_manifest(manifest, altered)
        with self.assertRaises(Fault): check_manifest({**manifest, 'validationId': validation}, binding)
        self.assertNotIn('validationId', manifest)

    def test_export_scope_collisions_missing_roots_and_service_layout(self):
        _, validation = self.validated(recipe('service'))
        binding = self.inspect(validation)
        entry = {'mode': '100644', 'sha256': 'a' * 64, 'size': 1}
        for names in [['outside'], ['dist'], ['dist/a', 'dist/A'], ['dist/a', 'dist/a/b'], ['dist/../escape']]:
            with self.subTest(names=names), self.assertRaises(Fault):
                make_manifest(binding, {name: entry for name in names})
        files = {'dist/app.py': entry}
        self.assertEqual(check_manifest(make_manifest(binding, files), binding), digest(make_manifest(binding, files)))
        with self.assertRaises(Fault): make_manifest(binding, {'dist/link': {**entry, 'mode': '120000'}})

    def test_receipt_tampering_and_artifact_validation_never_publish_source(self):
        _, validation = self.validated()
        row = self.c.operation('alice', validation)
        for field, value in [('candidate', 'f' * 40), ('stopped', False), ('exitCode', False), ('id', 'other'), ('timedOut', True)]:
            changed = dict(row); result = json.loads(row['result']); result[field] = value
            changed['result'] = json.dumps(result)
            with self.subTest(field=field), self.assertRaises(Fault): source_validation(changed)
        intent = json.loads(row['intent']); intent['validationSubject'] = 'artifact'
        legacy = dict(row)
        legacy_intent = json.loads(row['intent']); legacy_intent.pop('validationSubject', None)
        legacy['intent'] = canonical(legacy_intent).decode()
        self.assertEqual(source_validation(legacy)[0]['candidate'], json.loads(row['intent'])['candidate'])
        with self.c.store.tx() as db:
            db.execute('UPDATE operation SET intent=? WHERE id=?', (canonical(intent).decode(), validation))
        self.failure(validation, 'SOURCE_VALIDATION_REQUIRED')
        result = self.c.call('alice', 'tdev_publish', {'requestId': 'wrong-proof', 'validationId': validation})
        self.assertEqual(result['error']['code'], 'SOURCE_VALIDATION_REQUIRED')
        self.assertIsNone(self.c.store.one('SELECT id FROM operation WHERE request=?', ('wrong-proof',)))
        result = self.c.call('alice', 'tdev_deploy', {'action': 'release', 'requestId': 'wrong-deploy', 'name': 'demo',
                         'validationId': validation, 'command': 'true', 'health': {'port': 18080, 'path': '/'}})
        self.assertEqual(result['error']['code'], 'SOURCE_VALIDATION_REQUIRED')

    def test_stdout_or_unknown_operation_cannot_provide_validation(self):
        w = self.open()
        op = self.call('exec', {'requestId': 'fake', 'taskId': w['taskId'], 'expected': w['checkpoint'],
                              'command': 'echo \'{"exitCode":0,"stopped":true}\''})
        self.wait(op['id'])
        self.failure(op['id'], 'VALIDATION_REQUIRED')
        _, validation = self.validated()
        with self.c.store.tx() as db:
            db.execute("UPDATE operation SET status='unknown',effect='unknown' WHERE id=?", (validation,))
        with patch.object(self.c, 'backend', side_effect=AssertionError('inspection must not reconcile')):
            self.failure(validation, 'VALIDATION_REQUIRED')
