import base64
import copy
import csv
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

from test_core import Base
import test_artifacts
from tdev.artifact_build import verify_storage
from tdev.artifact_runtime import service_launch, verify_runtime
from tdev.common import Fault, canonical, digest

EXAMPLE = Path(__file__).resolve().parents[1] / 'examples/python-package'
spec = importlib.util.spec_from_file_location('python_package_example', EXAMPLE / 'make_recipe.py')
example = importlib.util.module_from_spec(spec)
spec.loader.exec_module(example)


def wheel():
    files = {'probe_dependency/__init__.py': b"from importlib.resources import files\ndef main(): return files(__package__).joinpath('data.txt').read_text()\n",
             'probe_dependency/data.txt': b'package data',
             'probe_dependency-0.1.dist-info/METADATA': b'Metadata-Version: 2.1\nName: probe-dependency\nVersion: 0.1\n',
             'probe_dependency-0.1.dist-info/WHEEL': b'Wheel-Version: 1.0\nGenerator: tdev-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
             'probe_dependency-0.1.dist-info/entry_points.txt': b'[console_scripts]\nprobe-cli = probe_dependency:main\n',
             'ignored.pth': b"import os; raise RuntimeError('pth must not execute')\n"}
    record = io.StringIO()
    writer = csv.writer(record, lineterminator='\n')
    for name, data in sorted(files.items()):
        writer.writerow([name, 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip('='), len(data)])
    writer.writerow(['probe_dependency-0.1.dist-info/RECORD', '', ''])
    files['probe_dependency-0.1.dist-info/RECORD'] = record.getvalue().encode()
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            archive.writestr(zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0)), data)
    return output.getvalue()


class RuntimeTest(Base):
    validated = test_artifacts.ArtifactTest.validated

    def prepared(self):
        recipe = example.make_recipe()
        wheel_bytes = wheel()
        name = 'wheels/probe_dependency-0.1-py3-none-any.whl'
        recipe['dependencies'] = []  # Offline fixture pins its wheel through the frozen source tree.
        recipe['inputs'].append(name)
        recipe['build']['command'] = 'TDEV_INPUT_DIR="$PWD/wheels" python -I -B build.py'
        app = """import importlib.metadata, importlib.util, json, os
from pathlib import Path
import probe_dependency
root = Path(__file__).resolve().parent
assert (root / 'python').resolve() in Path(probe_dependency.__file__).resolve().parents
assert importlib.util.find_spec('pip') is None, 'host site-packages leaked'
d = importlib.metadata.distribution('probe-dependency')
entry = next(e for e in d.entry_points if e.name == 'probe-cli')
result = {'data': entry.load()(), 'version': d.version, 'asset': json.loads((root / 'asset.json').read_text())}
(Path(os.environ['TDEV_DATA_DIR']) / 'result.json').write_text(json.dumps(result))
print(json.dumps(result))
"""
        sources = {name: (base64.b64encode(wheel_bytes).decode(), 'base64'),
                   'app.py': (app, 'utf8'),
                   'requirements.lock': ('probe-dependency==0.1 --hash=sha256:' + digest(wheel_bytes) + '\n', 'utf8')}
        sources.update({name: ((EXAMPLE / name).read_text(), 'utf8') for name in ('build.py', 'launch.py')})
        extra = [{'action': 'put', 'path': p, 'before': None, 'content': data, 'encoding': encoding}
                 for p, (data, encoding) in sources.items()]
        w, validation = self.validated(recipe, extra=extra)
        self.c.executor_override = None
        args = {'action': 'prepare', 'requestId': 'python-build-' + str(self.counter), 'validationId': validation}
        op = self.call('artifact', args)
        done = self.wait(op['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        value = self.call('artifact', {'action': 'inspect', 'artifactId': op['id']})
        self.assertTrue(value['runtimeCompatibility']['compatible'], value)
        return w, validation, op, value

    def test_relocated_python_package_without_build_task_or_host_dependencies(self):
        w, validation, op, value = self.prepared()
        root = self.c.artifacts.objects() / value['contentDigest']
        # Console metadata stays usable without build-root shebang launchers or pyc paths.
        self.assertFalse((root / 'files/dist/python/bin').exists())
        self.assertFalse(list(root.rglob('*.pyc')))
        self.assertNotIn(str(self.c.store.root / 'native' / op['id']).encode(),
                         b''.join(p.read_bytes() for p in root.rglob('*') if p.is_file()))
        self.call('task', {'action': 'close', 'requestId': 'close', 'taskId': w['taskId'], 'expected': w['checkpoint']})
        self.call('task', {'action': 'resetEnvironment', 'requestId': 'reset', 'taskId': w['taskId'], 'expected': w['checkpoint']})
        for i, operation in enumerate((op, {'id': validation})):
            self.call('operation', {'action': 'retire', 'requestId': 'retire-' + str(i), 'operationId': operation['id']})
        relocated = self.root / 'relocated'
        shutil.copytree(root, relocated)
        shutil.rmtree(self.repo.work)
        scratch = self.root / 'run'
        poison = self.root / 'poison'
        poison.mkdir()
        (poison / 'probe_dependency.py').write_text("raise RuntimeError('host dependency shadow')")
        with patch.dict(os.environ, {'PYTHONPATH': str(poison), 'PYTHONHOME': str(poison), 'VIRTUAL_ENV': str(poison)}):
            launch = service_launch(relocated, value['contentDigest'], scratch)
        self.assertNotIn('PYTHONPATH', launch['env'])
        result = subprocess.run(launch['argv'], cwd=launch['cwd'], env=launch['env'], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        observed = json.loads((scratch / 'data/result.json').read_text())
        self.assertEqual(observed, {'data': 'package data', 'version': '0.1', 'asset': {'message': 'retained package'}})
        verify_storage(relocated, value['contentDigest'])  # Runtime created no bytecode/data in sealed output.
        # Bypass byte admission only to probe the launcher's lack of host fallback.
        shutil.rmtree(relocated / 'files/dist/python/probe_dependency')
        failed = subprocess.run(launch['argv'], cwd=launch['cwd'], env=launch['env'], capture_output=True, text=True, timeout=20)
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('ModuleNotFoundError', failed.stderr)
        with self.assertRaises(Fault):
            service_launch(relocated, value['contentDigest'], scratch)

    def test_runtime_drift_is_observation_not_rebuild_or_lost_artifact(self):
        _, _, op, value = self.prepared()
        artifact_root = self.c.artifacts.objects() / value['contentDigest']
        with self.assertRaises(Fault) as error:
            service_launch(artifact_root, value['contentDigest'], artifact_root / 'scratch')
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_RUNTIME_SCRATCH')
        self.assertFalse((artifact_root / 'scratch').exists())
        with patch('tdev.artifact_runtime.host_platform', return_value={'os': 'changed', 'arch': 'x', 'abi': 'y'}):
            inspected = self.call('artifact', {'action': 'inspect', 'artifactId': op['id']})
            self.assertTrue(inspected['verifiedBytes'])
            self.assertFalse(inspected['runtimeCompatibility']['compatible'])
            self.assertEqual(inspected['runtimeCompatibility']['error']['code'], 'ARTIFACT_RUNTIME_PLATFORM')
            with self.assertRaises(Fault):
                service_launch(self.c.artifacts.objects() / value['contentDigest'], value['contentDigest'], self.root / 'run')
        self.assertEqual(self.call('operation', {'action': 'status', 'operationId': op['id']})['status'], 'succeeded')
        self.call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': op['id']})
        self.assertEqual(self.call('artifact', {'action': 'inspect', 'artifactId': op['id']}), value)

    def test_host_files_tools_and_runtime_scope_rejected(self):
        recipe = example.make_recipe()
        service = recipe['service']
        search = str(Path(sys.executable).parent)
        verify_runtime(service, search)
        required = self.root / 'required.so'
        required.write_bytes(b'library')
        service['runtime']['files'] = [{'path': str(required), 'sha256': digest(b'library')}]
        verify_runtime(service, search)
        required.write_bytes(b'changed')
        with self.assertRaises(Fault) as error:
            verify_runtime(service, search)
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_RUNTIME_FILE_CHANGED')
        required.unlink()
        with self.assertRaises(Fault) as error:
            verify_runtime(service, search)
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_RUNTIME_FILE_MISSING')
        service['runtime']['files'] = []
        service['runtime']['tools'][0]['sha256'] = '0' * 64
        with self.assertRaises(Fault) as error:
            verify_runtime(service, search)
        self.assertEqual(error.exception.value['code'], 'ARTIFACT_RUNTIME_TOOL_CHANGED')
        from tdev.artifacts import parse_recipe
        for name in ['/tmp/../secret', 'relative', '/tmp/.git/config']:
            bad = copy.deepcopy(recipe)
            bad['service']['runtime']['files'] = [{'path': name, 'sha256': '0' * 64}]
            with self.assertRaises(Fault):
                parse_recipe(canonical(bad))

    def test_independent_builds_report_actual_content_identity(self):
        w, validation, first, value = self.prepared()
        second = self.call('artifact', {'action': 'prepare', 'requestId': 'independent', 'validationId': validation})
        completed = self.wait(second['id'])
        self.assertEqual(completed['status'], 'succeeded', completed)
        other = self.call('artifact', {'action': 'inspect', 'artifactId': second['id']})
        self.assertEqual(other['contentDigest'], value['contentDigest'])
        self.assertNotEqual(first['id'], second['id'])
