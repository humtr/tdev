"""Supervised child for artifact checks. Native worker owns deadlines and stop proof."""
import http.client
import os
import shutil
import subprocess
import time

from .artifact_build import verify_storage
from .artifact_runtime import service_launch
from .common import require
from .executor import save
from .native import environment, identity


def run_check(job, payload):
    selected = payload['artifactValidation']
    directory = job / 'artifact-input'
    manifest = verify_storage(directory, selected['contentDigest'])
    env = environment(job)
    (job / 'data').mkdir(mode=0o700, exist_ok=True)
    env.update(TDEV_ARTIFACT_DIR=str(directory / 'files'), TDEV_DATA_DIR=str(job / 'data'),
               PYTHONDONTWRITEBYTECODE='1', TDEV_RELEASE=payload['id'])
    cwd, service = directory / 'files', None
    try:
        if manifest['recipe']['kind'] == 'service':
            launch = service_launch(directory, selected['contentDigest'], job / 'service-runtime')
            health = selected['health']
            launch['env'].update(TDEV_RELEASE=payload['id'], TDEV_PORT=str(health['port']))
            service = subprocess.Popen(launch['argv'], cwd=launch['cwd'], env=launch['env'], close_fds=True)
            saved = identity(service.pid)
            require(saved, 'ARTIFACT_SERVICE_IDENTITY')
            save(job / 'service-child.json', saved)
            env.update(launch['env'])
            cwd = launch['cwd']
            until = time.monotonic() + min(12, payload['timeout'])
            while True:
                require(service.poll() is None, 'ARTIFACT_SERVICE_EXITED')
                conn = http.client.HTTPConnection('127.0.0.1', health['port'], timeout=.5)
                try:
                    conn.request('GET', health['path'])
                    response = conn.getresponse()
                    healthy = response.status == 200 and response.getheader('X-Tdev-Release') == payload['id']
                    response.read(8192)
                    if healthy and service.poll() is None:
                        break
                except (OSError, http.client.HTTPException):
                    pass
                finally:
                    conn.close()
                require(time.monotonic() < until, 'ARTIFACT_SERVICE_NOT_READY')
                time.sleep(.05)
        shell = shutil.which('sh', path=environment(job)['PATH'])
        result = subprocess.run([shell, '-c', payload['command']], cwd=cwd, env=env, close_fds=True)
        require(service is None or service.poll() is None, 'ARTIFACT_SERVICE_EXITED')
        save(job / 'artifact-check.json', {'id': payload['id'], 'contentDigest': selected['contentDigest'],
                                         'serviceChecked': service is not None, 'exitCode': result.returncode})
        return result.returncode
    finally:
        if service is not None and service.poll() is None:
            service.terminate()
            try:
                service.wait(timeout=1)
            except subprocess.TimeoutExpired:
                service.kill()
                service.wait(timeout=1)
        # The parent subreaper terminates any remaining descendants and verifies bytes.
