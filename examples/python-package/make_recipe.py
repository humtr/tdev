"""Run in the example project before source validation; no download/install occurs."""
import hashlib
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def sha(filename):
    return hashlib.sha256(Path(filename).read_bytes()).hexdigest()


def make_recipe():
    android = hasattr(sys, 'getandroidapilevel')
    target = {'os': 'android' if android else platform.system().lower(), 'arch': platform.machine(),
              'abi': 'bionic' if android else (platform.libc_ver()[0] or 'unknown')}
    tools = [{'name': n, 'sha256': sha(Path(shutil.which(n)).resolve())} for n in ('python', 'sh')]
    # Explicitly pin selected loaded system libraries. This is a bounded observation,
    # not an exhaustive future dlopen/stdlib/OS image attestation.
    probe = """import json, pathlib
paths = set()
for line in pathlib.Path('/proc/self/maps').read_text().splitlines():
    parts = line.split(maxsplit=5)
    if len(parts) == 6 and parts[5].startswith('/') and '.so' in pathlib.Path(parts[5]).name:
        p = pathlib.Path(parts[5])
        if p.is_file(): paths.add(str(p.resolve()))
print(json.dumps(sorted(paths)))
"""
    libraries = json.loads(subprocess.check_output([shutil.which('python'), '-I', '-S', '-c', probe], text=True))
    return {'format': 1, 'kind': 'service',
            'inputs': ['requirements.lock', 'build.py', 'launch.py', 'app.py'],
            'dependencies': [{'name': 'packaging-25.0-py3-none-any.whl',
                             'url': 'https://files.pythonhosted.org/packages/20/12/38679034af332785aac8774540895e234f4d07f7545804097de4b666afd8/packaging-25.0-py3-none-any.whl',
                             'sha256': '29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484'}],
            'build': {'command': 'python -I -B build.py', 'platform': target, 'tools': tools},
            'exports': ['dist'], 'target': target,
            'service': {'command': 'exec python -I -S -B launch.py', 'cwd': 'dist',
                        'runtime': {'platform': target, 'tools': tools,
                                    'files': [{'path': p, 'sha256': sha(p)} for p in libraries]},
                        'environment': {}}}


if __name__ == '__main__':
    Path('tdev-package.json').write_text(json.dumps(make_recipe(), indent=2) + '\n')
