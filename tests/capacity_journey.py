"""Large-source qualification: real native execution, private Git, public lifecycle.

Run with scripts/check_capacity.py. User corpus is copied read-only, never committed here.
"""
import base64
import hashlib
import json
import os
import random
import resource
import shutil
import time
from pathlib import Path

from test_core import Base
from tdev.capacity import SOURCE_BYTES
from support import git


class CapacityJourney(Base):
    def setUp(self):
        super().setUp()
        self.c.executor_override = None
        self.repo.config['artifactLimits'] = {'workingBytes': 2 * 1024 * 1024 * 1024}
        directory = self.repo.work / '.git'
        st, checkout = directory.stat(), self.repo.work.stat()
        self.repo.config['repositories']['test'].update(remote=str(directory), allowWorktree=True,
            identity=f'local:{st.st_dev}:{st.st_ino}', checkout=str(self.repo.work),
            checkoutIdentity=f'local:{checkout.st_dev}:{checkout.st_ino}',
            managedRefNamespaces=['refs/heads/tasks/'])
        self.repo.config['principals']['alice']['managedRefNamespaces'] = {'test': ['refs/heads/tasks/']}

    def wait_large(self, ident):
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            result = self.call('operation', {'action': 'status', 'operationId': ident})
            if result['status'] not in ('running', 'unknown'):
                return result
            time.sleep(.1)
        self.fail(result)

    def write_bytes(self, name, size, chunk=None):
        chunk = chunk or random.Random(947).randbytes(1024 * 1024)
        with (self.repo.work / name).open('wb') as stream:
            while size:
                part = chunk[:min(len(chunk), size)]
                stream.write(part)
                size -= len(part)

    def journey(self, label, source_files, source_bytes, *, overflow=False, publish=False):
        started = time.monotonic()
        index = (self.repo.work / '.git/index').read_bytes()
        refs = git('for-each-ref', '--format=%(refname) %(objectname)', cwd=self.repo.work)
        space = self.call('workspace', {'action': 'create', 'requestId': 'space', 'name': label,
                                      'projects': ['test']})['result']
        target = self.call('task', {'action': 'start', 'requestId': 'target', 'repo': 'test',
                                   'workspaceId': space['workspaceId']})['result']
        imported = self.call('task', {'action': 'start', 'requestId': 'import', 'repo': 'test',
            'workspaceId': space['workspaceId'], 'localChanges': True})
        self.assertEqual(imported['status'], 'succeeded', imported)
        source = imported['result']
        self.assertEqual(source['localImport']['files'], source_files + 2)
        execution = self.call('exec', {'requestId': 'exec', 'taskId': source['taskId'],
            'expected': source['checkpoint'], 'command': "printf 'WORLD\n' > a.txt"})
        done = self.wait_large(execution['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        captured = done['result']['checkpoint']
        job = self.root / 'state/native' / execution['id']
        payload = json.loads((job / 'request.json').read_bytes())
        proof = json.loads((job / 'result.json').read_bytes())
        self.assertTrue(proof['stopped'])
        self.assertEqual(sum(f['size'] for f in payload['files']), source_bytes + 12)
        self.assertFalse(any('data' in f for f in payload['files']))
        self.assertIsInstance(payload['gitPack'], dict)
        self.assertLess((job / 'request.json').stat().st_size, 1024 * 1024 * 16)
        captured_entries = self.c.git('test').entries(captured)
        self.assertEqual(proof['capture']['files'], [
            {**f, 'blob': captured_entries[f['path']][1]}
            for f in payload['files']])
        merged = self.call('task', {'action': 'integrate', 'requestId': 'merge', 'taskId': target['taskId'],
            'expected': target['checkpoint'], 'sourceTaskId': source['taskId'], 'sourceCheckpoint': captured})
        self.assertEqual(merged['status'], 'succeeded', merged)
        self.assertTrue(merged['result']['applied'])
        self.assertEqual(self.c.git('test').tree(merged['result']['checkpoint']), self.c.git('test').tree(captured))
        view = self.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId']})
        self.assertEqual(len(view['tasks']), 2)
        sample = next(f for f in payload['files'] if f['path'] not in ('a.txt', 'b.txt'))
        read = self.call('read', {'taskId': target['taskId'], 'queries': [{'action': 'file',
            'path': sample['path'], 'offset': max(0, sample['size'] - 31), 'limit': 31}]})['items'][0]
        self.assertLessEqual(len(base64.b64decode(read['data'])), 31)
        self.assertEqual(read['size'], sample['size'])
        if sample['size'] > 16 * 1024 * 1024:
            search = self.call('read', {'taskId': target['taskId'], 'queries': [{'action': 'search', 'path': sample['path'], 'text': 'needle'}]})['items'][0]
            self.assertEqual(search['error']['code'], 'READ_SCAN_LIMIT')
            self.assertIn('budget=readSearchScanBytes configured=16777216 observed=', search['error']['message'])
        operations = [execution['id']]
        if publish:
            validation = self.call('validate', {'requestId': 'validate', 'taskId': target['taskId'],
                'expected': merged['result']['checkpoint'], 'message': 'large committed source'})
            self.assertEqual(self.wait_large(validation['id'])['status'], 'succeeded')
            publication = self.call('publish', {'requestId': 'publish', 'validationId': validation['id']})
            self.assertEqual(publication['status'], 'succeeded', publication)
            operations.append(validation['id'])
        if overflow:
            over = self.call('exec', {'requestId': 'over', 'taskId': source['taskId'],
                'expected': captured, 'command': 'printf x >> ' + sample['path']})
            failed = self.wait_large(over['id'])
            self.assertEqual(failed['status'], 'failed', failed)
            self.assertIn(f'budget=sourceBytes configured={SOURCE_BYTES} observed={SOURCE_BYTES + 1}',
                          failed['result']['captureError'])
            self.assertEqual(self.c.task('alice', source['taskId'])['checkpoint'], captured)
            operations.append(over['id'])
        for ident in operations:
            retired = self.call('operation', {'action': 'retire', 'requestId': 'retire-' + ident, 'operationId': ident})
            self.assertEqual(retired['status'], 'succeeded', retired)
            directory = self.root / 'state/native' / ident
            for name in ('source.pack', 'capture.tar', 'request.json', 'work'):
                self.assertFalse((directory / name).exists(), name)
        for task in (target, source):
            cleaned = self.call('task', {'action': 'cleanup', 'requestId': 'clean-' + task['taskId'], 'taskId': task['taskId']})
            self.assertEqual(cleaned['status'], 'succeeded', cleaned)
        view = self.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId'], 'includeClosed': True})
        closed = self.call('workspace', {'action': 'close', 'requestId': 'close-space',
            'workspaceId': space['workspaceId'], 'expectedRevision': view['workspace']['revision']})
        self.assertTrue(closed['result']['closed'])
        self.assertEqual((self.repo.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('for-each-ref', '--format=%(refname) %(objectname)', cwd=self.repo.work), refs)
        self.assertLess(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, 128 * 1024)
        self.assertLess(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, 128 * 1024)
        print(json.dumps({'fixture': label, 'files': source_files, 'bytes': source_bytes,
                          'seconds': round(time.monotonic() - started, 3),
                          'controllerPeakKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                          'utilityPeakKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, 'result': 'PASS'}), flush=True)

    def test_corpus(self):
        # Corpus processing fits the ordinary working default, independently of
        # the larger budget needed for 512 MiB source plus private Git objects.
        self.repo.config['artifactLimits']['workingBytes'] = 128 * 1024 * 1024
        source = os.environ.get('TDEV_CAPACITY_CORPUS')
        if source:
            source = Path(source).resolve(strict=True)
            files = sorted(p for p in source.rglob('*') if p.is_file() and not p.is_symlink())
            fingerprint = hashlib.sha256()
            for file in files:
                name = file.relative_to(source)
                destination = self.repo.work / 'corpus' / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, destination)
                fingerprint.update(str(name).encode() + b'\0')
                with file.open('rb') as stream:
                    fingerprint.update(hashlib.file_digest(stream, 'sha256').digest())
            size = sum(p.stat().st_size for p in files)
            print(json.dumps({'corpus': str(source), 'files': len(files), 'bytes': size,
                              'manifestDigest': fingerprint.hexdigest()}), flush=True)
            self.journey('actual corpus', len(files), size)
        else:
            size = 190 * 208896
            for i in range(190):
                self.write_bytes(f'corpus-{i:03}', 208896, random.Random(947 + i).randbytes(208896))
            self.journey('190 files / >=37.7 MiB', 190, size)

    def test_single_173_mib(self):
        size = 173 * 1024 * 1024 + 31
        self.write_bytes('large-file', size)
        self.journey('>=173 MiB single file', 1, size)

    def test_committed_single_173_mib(self):
        size = 173 * 1024 * 1024 + 31
        self.write_bytes('large-file', size)
        # Keep fixture preparation bounded too, so child RSS measures admission.
        git('-c', 'core.bigFileThreshold=1m', 'add', 'large-file', cwd=self.repo.work)
        git('-c', 'core.bigFileThreshold=1m', 'commit', '-m', 'committed source', cwd=self.repo.work)
        self.journey('committed >=173 MiB source', 1, size, publish=True)

    def test_aggregate_512_mib(self):
        for i in range(8):
            self.write_bytes(f'large-{i}', 64 * 1024 * 1024 - (12 if i == 7 else 0), random.Random(947 + i).randbytes(1024 * 1024))
        self.journey('512 MiB aggregate', 8, SOURCE_BYTES - 12, overflow=True)

    def test_committed_aggregate_512_mib(self):
        for i in range(8):
            self.write_bytes(f'large-{i}', 64 * 1024 * 1024 - (12 if i == 7 else 0), random.Random(947 + i).randbytes(1024 * 1024))
        git('-c', 'core.bigFileThreshold=1m', 'add', '.', cwd=self.repo.work)
        git('-c', 'core.bigFileThreshold=1m', 'commit', '-m', 'committed aggregate', cwd=self.repo.work)
        self.journey('committed 512 MiB aggregate', 8, SOURCE_BYTES - 12, overflow=True)

    def test_many_files(self):
        for i in range(1024):
            (self.repo.work / f'file-{i:05}').write_bytes(b'x')
        self.journey('1024 files', 1024, 1024)

    def test_large_artifact_source_input(self):
        from test_artifacts import recipe
        from tdev.artifact_build import host_platform
        from tdev.common import digest
        size = 173 * 1024 * 1024 + 31
        self.write_bytes('large-file', size)
        value = recipe()
        value['inputs'] = ['large-file']
        value['build']['platform'] = value['target'] = host_platform()
        value['build']['tools'] = [{'name': 'sh', 'sha256': digest(Path(shutil.which('sh')).resolve().read_bytes())}]
        value['build']['command'] = 'mkdir dist; printf artifact > dist/output'
        (self.repo.work / 'tdev-package.json').write_text(json.dumps(value))
        imported = self.call('task', {'action': 'start', 'requestId': 'import', 'repo': 'test', 'localChanges': True})
        self.assertEqual(imported['status'], 'succeeded', imported)
        task = imported['result']
        validation = self.call('validate', {'requestId': 'validation', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'message': 'large source input'})
        self.assertEqual(self.wait_large(validation['id'])['status'], 'succeeded')
        binding = self.call('artifact', {'action': 'inspectRecipe', 'validationId': validation['id']})
        self.assertEqual(binding['source']['inputs']['large-file']['size'], size)
        build = self.call('artifact', {'action': 'prepare', 'requestId': 'build', 'validationId': validation['id']})
        done = self.wait_large(build['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        artifact = self.call('artifact', {'action': 'inspect', 'artifactId': build['id']})
        self.assertEqual((self.c.artifacts.objects() / artifact['contentDigest'] / 'files/dist/output').read_bytes(), b'artifact')
        for ident in (validation['id'], build['id']):
            retired = self.call('operation', {'action': 'retire', 'requestId': 'retire-' + ident, 'operationId': ident})
            self.assertEqual(retired['status'], 'succeeded', retired)
            self.assertFalse((self.root / 'state/native' / ident / 'work').exists())
        self.assertEqual(self.call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': task['taskId']})['status'], 'succeeded')
        print(json.dumps({'fixture': '>=173 MiB artifact source input', 'bytes': size, 'result': 'PASS'}), flush=True)
