"""Foreground runit child for a pinned native project release. Same-UID, not a sandbox."""
import ctypes
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tdev.common import canonical, digest, require, atomic_write
from tdev.native import environment, identity, signal_exact, stop_children


def verify_release(directory):
    require(not directory.is_symlink(), 'RELEASE_IDENTITY')
    manifest = json.loads((directory / 'manifest.json').read_bytes())
    require(digest(manifest) == directory.name, 'RELEASE_IDENTITY')
    source = directory / 'source'
    require(not source.is_symlink() and source.is_dir(), 'RELEASE_CHANGED')
    actual = set()
    for base, dirs, names in os.walk(source, followlinks=False):
        links = [name for name in dirs if (Path(base) / name).is_symlink()]
        dirs[:] = [name for name in dirs if name not in links]
        actual.update(str((Path(base) / name).relative_to(source)) for name in names + links)
        require(len(actual) <= 100000, 'RELEASE_CHANGED')
    require(actual == set(manifest['files']), 'RELEASE_CHANGED')
    for name, entry in manifest['files'].items():
        file = directory / 'source' / name
        if entry['mode'] == '120000':
            require(file.is_symlink() and digest(os.readlink(file).encode()) == entry['digest'], 'RELEASE_CHANGED')
        else:
            require(not file.is_symlink() and file.is_file() and digest(file.read_bytes()) == entry['digest'], 'RELEASE_CHANGED')
            require(bool(file.stat().st_mode & 0o111) == (entry['mode'] == '100755'), 'RELEASE_CHANGED')
    return manifest


def stop_previous(root):
    """Recover a recorded foreground process session; never signal a recycled PID."""
    file = root / 'runtime.json'
    if not file.exists():
        return
    old = json.loads(file.read_bytes())
    supervisor = old.get('supervisor')
    current = identity(supervisor['pid']) if supervisor else None
    require(not current or current['state'] == 'Z' or current['start'] != supervisor['start'] or current['pid'] == os.getpid(), 'DEPLOYMENT_ALREADY_RUNNING')
    require(old.get('phase') in ('running', 'stopped'), 'DEPLOYMENT_LAUNCH_UNKNOWN', 'Launch or cleanup interrupted before proof; retained evidence needs operator reconciliation')
    child = old.get('child')
    if not child:
        return
    until = time.monotonic() + 5
    while True:
        rows = []
        for entry in Path('/proc').glob('[0-9]*'):
            try:
                row = identity(int(entry.name)) if entry.stat().st_uid == os.getuid() else None
            except (OSError, ProcessLookupError):
                continue
            if row and row['session'] == child['pid'] and row['state'] != 'Z':
                require(int(row['start']) >= int(child['start']), 'DEPLOYMENT_PROCESS_IDENTITY')
                if row['pid'] == child['pid']:
                    require(row['start'] == child['start'], 'DEPLOYMENT_PROCESS_IDENTITY')
                rows.append(row)
        if not rows:
            break
        for row in rows:
            signal_exact(row, signal.SIGKILL)
        require(time.monotonic() < until, 'DEPLOYMENT_STOP_UNKNOWN')
        time.sleep(.02)
    old['phase'] = 'stopped'
    atomic_write(file, canonical(old))


def serve(root):
    os.umask(0o077)
    stop_previous(root)
    directory = (root / 'active').resolve(strict=True)
    require(directory.parent == root / 'releases', 'RELEASE_SCOPE')
    manifest = verify_release(directory)
    libc = ctypes.CDLL(None, use_errno=True)
    require(libc.prctl(36, 1, 0, 0, 0) == 0 and libc.prctl(38, 1, 0, 0, 0) == 0, 'SUBREAPER_UNAVAILABLE')
    for name in ('home', 'tmp', 'data'):
        (root / name).mkdir(mode=0o700, exist_ok=True)
    env = environment(root)
    env.update(manifest['environment'])
    env.update(TDEV_RELEASE=directory.name, TDEV_DATA_DIR=str(root / 'data'), PYTHONDONTWRITEBYTECODE='1')
    stopped = False
    def stop(*_):
        nonlocal stopped
        stopped = True
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, stop)
    receipt = {'supervisor': identity(os.getpid()), 'release': directory.name, 'phase': 'launching'}
    atomic_write(root / 'runtime.json', canonical(receipt))
    child = None
    try:
        child = subprocess.Popen([shutil.which('sh'), '-c', manifest['command']], cwd=directory / 'source',
                                 env=env, stdin=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        receipt.update(child=identity(child.pid), phase='running')
        require(receipt['child'], 'DEPLOYMENT_LAUNCH_UNKNOWN')
        atomic_write(root / 'runtime.json', canonical(receipt))
        while not stopped and child.poll() is None:
            time.sleep(.05)
        if stopped and child.poll() is None:
            signal_exact(receipt['child'], signal.SIGTERM)
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
    finally:
        proved = stop_children(child)
        receipt.update(phase='stopped' if proved else 'unknown', exitCode=child.poll() if child else None)
        atomic_write(root / 'runtime.json', canonical(receipt))


if __name__ == '__main__':
    serve(Path(sys.argv[1]).resolve())
