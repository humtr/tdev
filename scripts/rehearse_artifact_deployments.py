"""Public dependency -> native validation -> isolated real runit deployment/recovery."""
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import test_artifact_runtime
from test_artifact_validation import ArtifactValidationTest, free_port
from tdev.core import Controller
from tdev.deployments import NativeDeployment
from tdev.resident import Runit

APP = '''import json,os
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
import packaging
from packaging.version import Version
VERSION = "VERSION_VALUE"
assert Version(packaging.__version__) == Version('25.0')
FAIL_PORT = BAD_PORT
if int(os.environ['TDEV_PORT']) == FAIL_PORT: raise SystemExit(9)
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  body=json.dumps({'version':VERSION,'dependency':packaging.__version__,'asset':json.loads(Path('asset.json').read_text()),'release':os.environ['TDEV_RELEASE']}).encode()
  self.send_response(200); self.send_header('X-Tdev-Release',os.environ['TDEV_RELEASE']); self.end_headers(); self.wfile.write(body)
HTTPServer(('127.0.0.1',int(os.environ['TDEV_PORT'])),Handler).serve_forever()
'''
CHECK = '''import json,os,urllib.request
with urllib.request.urlopen('http://127.0.0.1:'+os.environ['TDEV_PORT']+'/healthz') as r:
 value=json.load(r)
 assert r.headers['X-Tdev-Release']==os.environ['TDEV_RELEASE']==value['release']
 assert value['dependency']=='25.0' and value['asset']['message']=='retained package'
'''


def main():
    f = ArtifactValidationTest('test_file_validation_closed_source_fresh_policy_and_no_source_publication')
    f.setUp()
    graph = None
    try:
        f.delegate()
        svdir = f.root / 'isolated-services'
        svdir.mkdir()
        graph = subprocess.Popen([shutil.which('runsvdir'), '-P', str(svdir)], start_new_session=True,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        class IsolatedRunit(Runit):
            def preflight(self):
                assert graph.poll() is None
                return {'svdir': str(self.svdir), 'recoveryMonitor': False}
        backend = NativeDeployment(f.root / 'state', IsolatedRunit(svdir))
        f.c.deployments.backend = backend
        f.repo.config['repositories']['test']['artifactValidation'] = 'python -I -S -B check.py'
        port = free_port()
        def prepare(version, fail=False):
            example = test_artifact_runtime.example
            recipe = example.make_recipe()
            recipe['inputs'].append('check.py')
            recipe['build']['command'] += ' && cp check.py dist/'
            sources = {name: (test_artifact_runtime.EXAMPLE / name).read_text()
                       for name in ('build.py', 'launch.py', 'requirements.lock')}
            sources.update({'app.py': APP.replace('VERSION_VALUE', version).replace('BAD_PORT', str(port if fail else -1)), 'check.py': CHECK})
            f.c.executor_override = None
            task, source = f.validated(recipe, extra=[{'action': 'put', 'path': n, 'before': None, 'content': content} for n, content in sources.items()])
            build = f.call('artifact', {'action': 'prepare', 'requestId': 'build-' + version, 'validationId': source})
            assert f.wait(build['id'])['status'] == 'succeeded'
            _, check = f.verify(build, True, 'verify-' + version)
            assert check['status'] == 'succeeded', check
            f.call('task', {'action': 'close', 'requestId': 'close-' + version, 'taskId': task['taskId'], 'expected': task['checkpoint']})
            for op in (build, check, {'id': source}):
                f.call('operation', {'action': 'retire', 'requestId': 'retire-' + op['id'], 'operationId': op['id']})
            return check
        def release(validation, name):
            return f.call('deploy', {'action': 'release', 'subject': 'artifact', 'requestId': name,
                          'validationId': validation['id'], 'name': 'package', 'health': {'port': port, 'path': '/healthz'}})
        def response():
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/healthz', timeout=2) as stream:
                return json.load(stream)
        first = release(prepare('one'), 'first')
        assert first['status'] == 'succeeded', first
        ident = first['result']['deploymentId']
        assert response()['version'] == 'one' and response()['release'] == first['result']['release']
        second_check = prepare('two')  # First service stays up while validating on a separate port.
        assert response()['version'] == 'one'
        second = release(second_check, 'second')
        assert second['status'] == 'succeeded', second
        assert response()['version'] == 'two'
        active_build = second_check['result']['artifactId']
        assert not f.call('artifact', {'action': 'prunePreview', 'artifactId': active_build})['canPrune']
        f.c.close(); f.c = Controller(f.root / 'state', f.repo.config); f.c.deployments.backend = backend
        with patch('tdev.artifact_build.acquire', side_effect=AssertionError('rollback must not acquire')):
            rollback = f.call('deploy', {'action': 'rollback', 'requestId': 'rollback', 'deploymentId': ident, 'expectedRevision': 2})
        assert rollback['status'] == 'succeeded' and response()['version'] == 'one', rollback
        view = f.call('deploy', {'action': 'inspect', 'deploymentId': ident})
        old = view['runtime']; os.kill(old['pid'], signal.SIGKILL)
        until = time.monotonic() + 20
        while True:
            runtime = f.call('deploy', {'action': 'inspect', 'deploymentId': ident})['runtime']
            if runtime['healthy'] and runtime.get('pid') != old['pid'] and runtime.get('childPid') != old['childPid']:
                break
            assert time.monotonic() < until, runtime
            time.sleep(.1)
        bad_check = prepare('bad', True)  # Readiness passes validation, deliberately exits at target port.
        failed = release(bad_check, 'failed-switch')
        for _ in range(3):
            if failed['status'] != 'unknown':
                break
            failed = f.call('operation', {'action': 'status', 'operationId': failed['id']})
        assert failed['status'] == 'failed' and failed['result']['rolledBack'], failed
        assert response()['version'] == 'one'
        record = f.call('deploy', {'action': 'inspect', 'deploymentId': ident})['deployment']
        (backend.root(record) / 'data/keep').write_text('preserved')
        f.call('deploy', {'action': 'stop', 'requestId': 'stop', 'deploymentId': ident, 'expectedRevision': 3})
        f.call('deploy', {'action': 'start', 'requestId': 'start', 'deploymentId': ident, 'expectedRevision': 4})
        assert response()['version'] == 'one'
        removed = f.call('deploy', {'action': 'remove', 'requestId': 'remove', 'deploymentId': ident, 'expectedRevision': 5})
        assert removed['status'] == 'succeeded', removed
        assert (backend.root(record) / 'data/keep').read_text() == 'preserved'
        exported = f.call('artifact', {'action': 'export', 'artifactId': active_build, 'path': 'dist/app.py'})
        assert exported['eof'] and exported['size'] > 0
        preview = f.call('artifact', {'action': 'prunePreview', 'artifactId': active_build})
        assert preview['canPrune']
        pruned = f.call('artifact', {'action': 'prune', 'requestId': 'prune-removed', 'artifactId': active_build,
                                   'expectedPreview': preview['previewToken']})
        assert pruned['status'] == 'succeeded'
        assert (backend.root(record) / 'data/keep').read_text() == 'preserved'
        print(json.dumps({'isolatedRealRunit': True, 'publicPinnedDependency': 'packaging==25.0',
                          'artifactValidationAndRelease': True, 'updateWhilePreviousServes': True,
                          'controllerReconnectRollback': True, 'supervisorCrashRecovery': True,
                          'failedActivationRestoresPrevious': True, 'stopStartRemovePreserveData': True,
                          'scratchRetiredBeforeRelease': True, 'activePinThenExportPrune': True, 'liveGraphTouched': False}))
    except BaseException:
        for file in (f.root / 'state/deployments').glob('*/logs/current'):
            print(file.read_text(errors='replace')[-4000:], file=sys.stderr)
        raise
    finally:
        if graph is not None:
            for row in f.c.store.all('SELECT record FROM deployment'):
                record = json.loads(row['record'])
                if backend.service(record).exists():
                    backend.down(record)
            os.killpg(graph.pid, signal.SIGTERM)
            try:
                graph.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(graph.pid, signal.SIGKILL); graph.wait(timeout=5)
        f.tearDown()


if __name__ == '__main__':
    main()
