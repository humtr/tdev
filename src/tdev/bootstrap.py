"""Explicit Termux setup helpers; no provider provisioning or project grants."""
import argparse
import fcntl
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

from .common import Fault, require


def pins(source):
    result = {}
    for line in (source / 'requirements.txt').read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        name, version = line.split('==')
        result[name] = version
    return result


def verify_dependencies(directory, expected):
    # -S forbids accidentally satisfying the check from global site-packages.
    code = '''import importlib.metadata as m,json,sys
sys.path.insert(0,sys.argv[1])
expected=json.loads(sys.argv[2])
actual={d.metadata['Name'].lower().replace('_','-'):d.version for d in m.distributions(path=[sys.argv[1]])}
assert all(actual.get(k)==v for k,v in expected.items()), (expected,actual)
import jsonschema,attrs,referencing,rpds
assert rpds.HashTrieMap({'probe':1})['probe']==1
'''
    return subprocess.run([sys.executable, '-I', '-S', '-B', '-c', code, str(directory), json.dumps(expected)],
                          capture_output=True).returncode == 0


def seed_rpds(target, version):
    """Copy only a version-matched Android distribution installed by Termux pkg."""
    import sysconfig
    roots = {sysconfig.get_path('purelib'), sysconfig.get_path('platlib')}
    for dist in importlib.metadata.distributions(path=list(roots)):
        if dist.metadata['Name'].lower().replace('_', '-') != 'rpds-py' or dist.version != version:
            continue
        root = Path(dist.locate_file('')).resolve()
        for entry in dist.files or []:
            path = Path(str(entry))
            if '__pycache__' in path.parts or path.suffix == '.pyc':
                continue
            require(not path.is_absolute() and '..' not in path.parts and
                    (path.parts[0] == 'rpds' or path.parts[0].startswith('rpds_py-') and path.parts[0].endswith('.dist-info')),
                    'DEPENDENCY_PATH', str(path))
            original = Path(dist.locate_file(entry))
            require(original.resolve().is_relative_to(root) and original.is_file() and not original.is_symlink(),
                    'DEPENDENCY_PATH', str(path))
            destination = target / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, destination)
        return True
    return False


def dependencies(source):
    source = Path(source).resolve()
    expected = pins(source)
    target = source / '.tdev-deps'
    require(not target.is_symlink(), 'DEPENDENCY_PATH', str(target))
    lockdir = source / '.tdev-deps-lock'
    require(not lockdir.is_symlink(), 'DEPENDENCY_PATH', str(lockdir))
    lockdir.mkdir(mode=0o700, exist_ok=True)
    with open(lockdir / 'lock', 'a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if verify_dependencies(target, expected):
            return
        with tempfile.TemporaryDirectory(prefix='.tdev-deps-stage-', dir=source) as tmp:
            stage = Path(tmp) / 'packages'; stage.mkdir()
            selected = dict(expected)
            if 'rpds-py' in selected and seed_rpds(stage, selected['rpds-py']):
                del selected['rpds-py']
            elif 'rpds-py' in selected and hasattr(sys, 'getandroidapilevel'):
                raise Fault('DEPENDENCY_NATIVE_VERSION',
                            'Termux python-rpds-py must match requirements.txt; run pkg update and '
                            'pkg install python-rpds-py, then retry. Existing dependencies were preserved.')
            subprocess.run([sys.executable, '-I', '-m', 'pip', '--isolated', 'install',
                            '--disable-pip-version-check', '--no-deps', '--no-compile', '--target', str(stage),
                            *[name+'=='+version for name, version in selected.items()]], check=True)
            require(verify_dependencies(stage, expected), 'DEPENDENCY_VERIFY', 'Staged imports/version check failed')
            old = Path(tmp) / 'previous'
            if target.exists(): target.rename(old)
            try:
                stage.rename(target)
            except BaseException:
                if old.exists(): old.rename(target)
                raise


def services(backend=None):
    from .resident import Runit
    backend = backend or Runit()
    require(backend.svdir == backend.prefix / 'var/service' and not backend.svdir.is_symlink(),
            'SVDIR', 'Use the shared Termux PREFIX/var/service directory')
    roots = backend.roots()
    require(len(roots) <= 1, 'SERVICE_ROOT_AMBIGUOUS', 'Multiple shared runsvdir processes; inspect Termux services')
    if not roots:
        # The standard Termux command has start/stop/restart, but no status action.
        env = {**os.environ, 'SVDIR': str(backend.svdir), 'LOGDIR': str(backend.prefix / 'var/log')}
        subprocess.run(['service-daemon', 'start'], env=env, check=True)
        deadline = time.monotonic() + 10
        while not backend.roots() and time.monotonic() < deadline:
            time.sleep(.1)
    return backend.preflight()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('dependencies', 'services'))
    args = parser.parse_args()
    try:
        if args.action == 'dependencies': dependencies(Path(__file__).resolve().parents[2])
        else: print(json.dumps(services()))
    except (Fault, OSError, subprocess.SubprocessError) as exc:
        print(f'tdev bootstrap: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
