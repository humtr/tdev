"""Native project deployment in an isolated real runit graph; no live graph changes."""
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from support import Repository
from tdev.core import Controller
from tdev.deployments import NativeDeployment
from tdev.resident import Runit

APP = '''import json,os
from http.server import HTTPServer,BaseHTTPRequestHandler
VERSION = "one"
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  body=json.dumps({"source":VERSION,"release":os.environ["TDEV_RELEASE"],"pid":os.getpid(),"inheritedToken":bool(os.environ.get("GH_TOKEN"))}).encode()
  self.send_response(200); self.send_header("X-Tdev-Release",os.environ["TDEV_RELEASE"]); self.end_headers(); self.wfile.write(body)
HTTPServer(("127.0.0.1",PORT),Handler).serve_forever()
'''


def main():
    with tempfile.TemporaryDirectory(prefix='tdev-deployment-rehearsal-') as tmp:
        parent = Path(tmp)
        prefix = parent / 'prefix'
        svdir = prefix / 'var/service'; svdir.mkdir(parents=True)
        (prefix / 'bin').mkdir()
        daemon = prefix / 'bin/service-daemon'
        shutil.copyfile(shutil.which('service-daemon'), daemon); daemon.chmod(0o700)
        for name in ('runsvdir', 'runsv', 'sv', 'setsid'):
            (prefix / 'bin' / name).symlink_to(shutil.which(name))
        env = {**os.environ, 'PREFIX': str(prefix), 'SVDIR': str(svdir), 'SERVICE_DAEMON_MONITOR_INTERVAL_SECONDS': '1'}
        def daemon_call(action):
            subprocess.run([str(daemon), action], env=env, capture_output=True, timeout=25, check=True)
        class FixtureRunit(Runit):
            def sv(self, action, directory):
                try:
                    return super().sv(action, directory)
                except BaseException:
                    print({'svAction': action, 'downMarker': (directory / 'down').exists(), 'status': (directory / 'supervise/status').read_bytes().hex()}, file=sys.stderr)
                    raise
            def preflight(self):
                daemon_call('status')
                return {'svdir': str(self.svdir), 'recoveryMonitor': True}
        (parent / 'repository').mkdir()
        repo = Repository(parent / 'repository')
        repo.config['repositories']['test']['validation'] = 'python -m py_compile app.py'
        repo.config['deploymentTargets'] = {'phone': {'kind': 'termux', 'servicePrefix': 'tdev-app-rehearsal-'}}
        repo.config['principals']['alice']['deploymentTargets'] = ['phone']
        controller = Controller(parent / 'state', repo.config)
        backend = NativeDeployment(parent / 'state', FixtureRunit(svdir))
        controller.deployments.backend = backend
        def call(tool, args):
            value = controller.call('alice', 'tdev_' + tool, args)
            assert value['ok'], value
            return value['result']
        def wait(op):
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                current = call('operation', {'action': 'status', 'operationId': op['id']})
                if current['status'] not in ('running', 'unknown'):
                    assert current['status'] == 'succeeded', current
                    return current
                time.sleep(.1)
            raise AssertionError(current)
        def inspect(ident):
            return call('deploy', {'action': 'inspect', 'deploymentId': ident})
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        def response():
            with urllib.request.urlopen('http://127.0.0.1:' + str(port), timeout=2) as stream:
                return json.load(stream)
        daemon_call('start')
        deployment = None
        try:
            w = call('task', {'action': 'open', 'requestId': 'open', 'repo': 'test', 'ref': 'refs/heads/main', 'expectedHead': repo.head})['result']
            w['checkpoint'] = call('edit', {'requestId': 'app', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'edits': [{'action': 'put', 'path': 'app.py', 'before': None, 'content': APP.replace('PORT', str(port))}]})['result']['checkpoint']
            validation = wait(call('validate', {'requestId': 'validate-one', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'one'}))
            first = call('deploy', {'action': 'release', 'requestId': 'release-one', 'name': 'app', 'validationId': validation['id'], 'command': 'exec python -u app.py', 'health': {'port': port, 'path': '/'}})
            assert first['status'] == 'succeeded', first
            ident = first['result']['deploymentId']; deployment = inspect(ident)['deployment']
            actual = response()
            assert actual['source'] == 'one' and actual['release'] == first['result']['release'] and not actual['inheritedToken'], actual
            # Both the supervisor and its child must change after a hard supervisor crash.
            before = inspect(ident)['runtime']; os.kill(before['pid'], signal.SIGKILL)
            deadline = time.monotonic() + 20
            while True:
                current = inspect(ident)['runtime']
                if current['healthy'] and current.get('pid') != before['pid'] and current.get('childPid') != before['childPid']:
                    break
                assert time.monotonic() < deadline, current
                time.sleep(.1)
            assert response()['release'] == first['result']['release']
            controller.close(); controller = Controller(parent / 'state', repo.config); controller.deployments.backend = backend
            assert inspect(ident)['runtime']['healthy']
            w['checkpoint'] = call('edit', {'requestId': 'app-two', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'edits': [{'action': 'replace', 'path': 'app.py', 'old': 'VERSION = "one"', 'text': 'VERSION = "two"'}]})['result']['checkpoint']
            validation2 = wait(call('validate', {'requestId': 'validate-two', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'two'}))
            second = call('deploy', {'action': 'release', 'requestId': 'release-two', 'name': 'app', 'expectedRevision': 1, 'validationId': validation2['id'], 'command': 'exec python -u app.py', 'health': {'port': port, 'path': '/'}})
            assert second['status'] == 'succeeded', second
            assert response()['source'] == 'two'
            rollback = call('deploy', {'action': 'rollback', 'requestId': 'rollback', 'deploymentId': ident, 'expectedRevision': 2})
            assert rollback['status'] == 'succeeded', rollback
            assert response()['source'] == 'one'
            call('deploy', {'action': 'stop', 'requestId': 'stop', 'deploymentId': ident, 'expectedRevision': 3})
            assert not inspect(ident)['runtime']['running']
            old_root = int((prefix / 'var/run/service-daemon.pid').read_text()); os.kill(old_root, signal.SIGKILL)
            deadline = time.monotonic() + 20
            while True:
                try:
                    current_root = int((prefix / 'var/run/service-daemon.pid').read_text())
                    assert current_root != old_root
                    daemon_call('status')
                    break
                except (OSError, ValueError, AssertionError, subprocess.SubprocessError):
                    assert time.monotonic() < deadline
                    time.sleep(.2)
            assert not inspect(ident)['runtime']['running']
            call('deploy', {'action': 'start', 'requestId': 'start', 'deploymentId': ident, 'expectedRevision': 4})
            assert response()['source'] == 'one'
            # Real failed readiness restores the last healthy release.
            failed = call('deploy', {'action': 'release', 'requestId': 'bad', 'name': 'app', 'expectedRevision': 5, 'validationId': validation2['id'], 'command': 'exit 9', 'health': {'port': port, 'path': '/'}})
            # A transient supervisor-control failure is retained as unknown. Observe
            # the same operation; recovery must restore the old release without
            # resubmitting the new deployment or inventing success.
            for _ in range(3):
                if failed['status'] != 'unknown':
                    break
                failed = call('operation', {'action': 'status', 'operationId': failed['id']})
            assert failed['status'] == 'failed' and failed['result']['rolledBack'], failed
            assert response()['source'] == 'one'
            record = inspect(ident)['deployment']; (backend.root(record) / 'data/keep').write_text('preserved')
            removed = call('deploy', {'action': 'remove', 'requestId': 'remove', 'deploymentId': ident, 'expectedRevision': 5})
            assert removed['status'] == 'succeeded', removed
            assert not backend.service(record).exists() and (backend.root(record) / 'data/keep').read_text() == 'preserved'
            print(json.dumps({'isolatedRealRunit': True, 'validatedRelease': True, 'liveReleaseIdentity': True,
                              'supervisorCrashRecovery': True, 'controllerReconnect': True, 'updateRollback': True,
                              'intentionalDownAfterRootRecovery': True, 'readinessFailureRecovery': True,
                              'removePreservesData': True, 'liveGraphTouched': False}))
        except BaseException:
            for file in (parent / 'state/deployments').glob('*/logs/current'):
                print(file.read_text(errors='replace')[-6000:], file=sys.stderr)
            for file in (parent / 'state/deployments').glob('*/runtime.json'):
                print(file.read_text(), file=sys.stderr)
            raise
        finally:
            if deployment:
                if backend.service(deployment).exists():
                    backend.down(deployment)
            daemon_call('stop')
            controller.close()


if __name__ == '__main__':
    main()
