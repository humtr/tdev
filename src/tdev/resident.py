"""Owned runit services, recoverable installation, and live identity checks.

This is an operator interface. No service or installation authority is exposed by MCP.
"""
import argparse
import base64
import contextlib
import fcntl
import http.client
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require

NAMES = ('tdev', 'tdev-tunnel')
FILES = ('run', 'log/run', '.tdev-owner.json')


def sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def command(argv, timeout=20, check=True):
    try:
        p = subprocess.run(list(map(str, argv)), capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Fault('SERVICE_COMMAND', type(e).__name__) from None
    require(not check or p.returncode == 0, 'SERVICE_COMMAND', p.stderr[:1000].decode(errors='replace') or p.stdout[:1000].decode(errors='replace'))
    return p


def process(pid):
    try:
        root = Path('/proc') / str(pid)
        status = (root / 'stat').read_text().split(') ', 1)[1].split()
        if status[0] == 'Z':
            return None
        return {'pid': int(pid), 'start': status[19],
                'argv': [s.decode() for s in (root / 'cmdline').read_bytes().split(b'\0') if s],
                'exe': os.readlink(root / 'exe')}
    except (OSError, ValueError, UnicodeError):
        return None


def processes():
    return [p for entry in Path('/proc').glob('[0-9]*') if (p := process(entry.name))]


def option(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default


def get_health(port):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
    try:
        c.request('GET', '/healthz')
        r = c.getresponse()
        require(r.status == 200, 'CONTROLLER_HEALTH')
        return json.loads(r.read(8192))
    finally:
        c.close()


def templates(root):
    """Stable launchers resolve a verified active bundle on every supervised restart."""
    import shlex
    root = Path(root)
    shell = shutil.which('sh')
    for name, role in zip(NAMES, ('controller', 'tunnel')):
        service = root / 'services' / name
        (service / 'log').mkdir(parents=True, exist_ok=True, mode=0o700)
        setup = 'export PYTHONPATH=' + shlex.quote(str(root / 'active/src') + ':' + str(root / 'active/.tdev-deps')) + '\n'
        argv = [sys.executable, '-m', 'tdev.resident', 'run', '--root', str(root), '--role', role]
        atomic_write(service / 'run', ('#!' + shell + '\nset -eu\nexec 2>&1\numask 077\n' + setup + 'exec ' + shlex.join(argv) + '\n').encode(), 0o700)
        log = root / 'logs' / name
        log.mkdir(parents=True, exist_ok=True, mode=0o700)
        atomic_write(log / 'config', b's1048576\nn3\n')
        atomic_write(service / 'log/run', ('#!' + shell + '\nexec ' + shlex.join([shutil.which('svlogd') or 'svlogd', '-tt', str(log)]) + '\n').encode(), 0o700)
        atomic_write(service / 'down', b'')


def run_service(root, role):
    from .admin import verify
    root = Path(root).resolve()
    settings = json.loads(private_file(root / 'resident.json'))
    active = (root / 'active').resolve()
    require(digest(private_file(root / 'tunnel-profiles/tdev.yaml')) == settings['profileDigest'], 'TUNNEL_PROFILE_CHANGED')
    verify(active)
    env = {**os.environ, 'HOME': settings['home'],
           'PYTHONPATH': str(active / 'src') + ':' + str(active / '.tdev-deps')}
    if role == 'controller':
        argv = [sys.executable, '-m', 'tdev.server', '--state', str(root / 'state'),
                '--config', str(root / 'config.json'), '--port', str(settings['port'])]
    else:
        runtime = settings['runtime']
        require(digest(Path(runtime['binary']).read_bytes()) == runtime['digest'], 'TUNNEL_BINARY_CHANGED')
        # Supervision retries on an unavailable controller; no duplicate detached daemon.
        health = get_health(settings['port'])
        require(health.get('bundle') == active.name, 'CONTROLLER_IDENTITY')
        argv = [runtime['binary'], 'run', '--profile-dir', str(root / 'tunnel-profiles'), '--profile', 'tdev',
                '--health.listen-addr', '127.0.0.1:0', '--health.url-file', str(root / 'tunnel-health.url')]
        if runtime['mode'] == 'termux-chroot':
            argv = [runtime['wrapper'], *argv]
            env['CA_BUNDLE'] = runtime['caBundle']
    os.execve(argv[0], argv, env)


class Runit:
    def __init__(self, svdir=None):
        self.prefix = Path(os.environ.get('PREFIX', '/data/data/com.termux/files/usr')).resolve()
        self.svdir = Path(svdir or os.environ.get('SVDIR', self.prefix / 'var/service')).absolute()

    def preflight(self):
        require(self.svdir == self.prefix / 'var/service' and self.svdir.is_dir() and not self.svdir.is_symlink(),
                'SVDIR', 'Use the shared PREFIX/var/service directory')
        require(Path(os.environ.get('SVDIR', self.svdir)).absolute() == self.svdir, 'SVDIR')
        for tool in ('sv', 'runsv', 'runsvdir', 'svlogd', 'service-daemon'):
            require(shutil.which(tool), 'TERMUX_SERVICES_REQUIRED', 'Install/configure termux-services before tdev: missing ' + tool)
        command(['service-daemon', 'status'])
        monitor = command(['service-daemon', 'monitor-status'], check=False)
        return {'svdir': str(self.svdir), 'recoveryMonitor': monitor.returncode == 0}

    def sv(self, action, directory):
        return command(['sv', '-w', '15', action, directory], timeout=20)

    def available(self, directory):
        try:
            fd = os.open(directory / 'supervise/ok', os.O_WRONLY | os.O_NONBLOCK)
            os.close(fd)
            return True
        except OSError:
            return False

    def wait_supervisor(self, directory):
        until = time.monotonic() + 15
        while not self.available(directory):
            require(time.monotonic() < until, 'SUPERVISOR_MISSING', str(directory))
            time.sleep(.1)

    def down(self, directory):
        atomic_write(directory / 'down', b'')
        self.wait_supervisor(directory)
        self.sv('down', directory)

    def up(self, directory):
        (directory / 'down').unlink(missing_ok=True)
        sync(directory)
        self.wait_supervisor(directory)
        self.sv('up', directory)

    def pid(self, directory):
        data = (directory / 'supervise/status').read_bytes()
        require(len(data) == 20, 'SUPERVISOR_STATUS')
        pid = int.from_bytes(data[12:16], 'little')
        require(pid and data[19] == 1, 'SERVICE_DOWN', directory.name)
        return pid

    def wanted_down(self, directory):
        if (directory / 'down').exists():
            return True
        try:
            return (directory / 'supervise/status').read_bytes()[17:18] == b'd'
        except OSError:
            return False

    def remove(self, directory, backup):
        self.down(directory)
        self.sv('exit', directory)
        os.rename(directory, backup)
        sync(directory.parent)
        # The directory has left runsvdir's graph before waiting for the logger to exit.
        until = time.monotonic() + 15
        while self.available(backup):
            command(['sv', 'exit', backup], check=False)
            require(time.monotonic() < until, 'SUPERVISOR_EXIT', str(backup))
            time.sleep(.1)

    def controller_ready(self, root, settings, bundle):
        p = process(self.pid(self.svdir / 'tdev'))
        require(p and 'tdev.server' in p['argv'], 'CONTROLLER_IDENTITY')
        for key, expected in (('--state', str(root / 'state')), ('--config', str(root / 'config.json')), ('--port', str(settings['port']))):
            require(option(p['argv'], key) == expected, 'CONTROLLER_IDENTITY')
        env = (Path('/proc') / str(p['pid']) / 'environ').read_bytes().split(b'\0')
        expected = ('PYTHONPATH=' + str(root / 'versions' / bundle / 'src') + ':' + str(root / 'versions' / bundle / '.tdev-deps')).encode()
        require(expected in env, 'CONTROLLER_IDENTITY')
        h = get_health(settings['port'])
        require(h.get('pid') == p['pid'] and h.get('bundle') == bundle, 'CONTROLLER_IDENTITY')
        diagnostic_mode = json.loads(private_file(root / 'config.json')).get('diagnostics', {}).get('mode', 'off')
        if diagnostic_mode == 'watch':
            require(h.get('diagnostics') in ('watch', 'trace'), 'DIAGNOSTICS_UNAVAILABLE')
        matches = [q for q in processes() if 'tdev.server' in q['argv'] and option(q['argv'], '--state') == str(root / 'state')]
        require(len(matches) == 1, 'DUPLICATE_CONTROLLER')
        return {'pid': p['pid'], 'bundle': bundle, 'version': h['version']}

    def tunnel_ready(self, root, settings):
        require(digest(private_file(root / 'tunnel-profiles/tdev.yaml')) == settings['profileDigest'], 'TUNNEL_PROFILE_CHANGED')
        pid = self.pid(self.svdir / 'tdev-tunnel')
        p = process(pid)
        runtime = settings['runtime']
        require(p is not None, 'TUNNEL_IDENTITY')
        matches = [q for q in processes() if option(q['argv'], '--profile-dir') == str(root / 'tunnel-profiles')
                   and option(q['argv'], '--profile') == 'tdev' and 'run' in q['argv']]
        require(len(matches) == 1, 'TUNNEL_IDENTITY')
        if runtime['mode'] != 'termux-chroot':
            require(matches[0]['pid'] == pid and Path(p['exe']).resolve() == Path(runtime['binary']).resolve(), 'TUNNEL_IDENTITY')
        require(digest(Path(runtime['binary']).read_bytes()) == runtime['digest'], 'TUNNEL_BINARY_CHANGED')
        argv = [runtime['binary'], 'health', '--url-file', str(root / 'tunnel-health.url'), '--require-control-plane-poll', '--json']
        if runtime['mode'] == 'termux-chroot':
            argv = [runtime['wrapper'], *argv]
        value = json.loads(command(argv).stdout)
        require(value.get('result') == 'ok' and value.get('control_plane_poll', {}).get('ok'), 'TUNNEL_HEALTH')
        return {'pid': pid, 'mode': runtime['mode'], 'controlPlanePoll': True}


def retry(fn, seconds=45):
    until = time.monotonic() + seconds
    while True:
        try:
            return fn()
        except (Fault, OSError, ValueError, http.client.HTTPException):
            if time.monotonic() >= until:
                raise
            time.sleep(.2)


class Installation:
    def __init__(self, root, backend=None):
        self.root = Path(root).absolute()
        require(self.root == self.root.resolve() and self.root.is_dir() and self.root.stat().st_mode & 0o077 == 0,
                'INSTALL_ROOT')
        self.backend = backend or Runit()
        self.svdir = self.backend.svdir
        self.journal = self.root / 'service-transaction.json'

    @contextlib.contextmanager
    def lock(self):
        with open(self.root / 'services.lock', 'a+b') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Fault('INSTALLER_BUSY') from None
            with open(self.svdir / '.tdev-install.lock', 'a+b') as shared:
                try:
                    fcntl.flock(shared, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise Fault('INSTALLER_BUSY') from None
                yield

    def settings(self):
        return json.loads(private_file(self.root / 'resident.json'))

    def owned(self, directory, settings, check_files=True):
        require(directory.is_dir() and not directory.is_symlink(), 'SERVICE_CONFLICT', str(directory))
        try:
            marker = json.loads(private_file(directory / '.tdev-owner.json'))
        except (OSError, ValueError, Fault):
            raise Fault('SERVICE_CONFLICT', 'Unmanaged service: ' + str(directory)) from None
        require(marker['installation'] == settings['installation'] and marker['root'] == str(self.root),
                'SERVICE_CONFLICT', 'Service belongs to a different installation: ' + str(directory))
        for name, checksum in (marker['files'].items() if check_files else []):
            require(name in ('run', 'log/run') and digest(private_file(directory / name)) == checksum,
                    'SERVICE_CHANGED', str(directory / name))
        return marker

    def snapshot(self, name, settings):
        directory = self.svdir / name
        if not directory.exists() and not directory.is_symlink():
            return None
        self.owned(directory, settings)
        return {'files': {f: base64.b64encode(private_file(directory / f)).decode() for f in FILES},
                'down': self.backend.wanted_down(directory)}

    def fence(self, ident):
        state = self.root / 'state'
        state.mkdir(mode=0o700, exist_ok=True)
        with open(state / 'admission.lock', 'a+b') as lock:
            until = time.monotonic() + 10
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < until, 'ADMISSION_BUSY')
                    time.sleep(.1)
            flag = state / 'maintenance.json'
            if flag.exists():
                require(json.loads(private_file(flag))['transaction'] == ident, 'MAINTENANCE_OWNED')
            atomic_write(flag, canonical({'transaction': ident}))
        dbfile = state / 'state.sqlite'
        if dbfile.exists():
            db = sqlite3.connect('file:' + str(dbfile) + '?mode=ro', uri=True)
            try:
                require(db.execute("SELECT count(*) FROM operation WHERE status IN ('running','unknown')").fetchone()[0] == 0,
                        'OUTSTANDING_EFFECT', 'Observe or finish existing operations before updating services')
            finally:
                db.close()

    def unfence(self, ident):
        flag = self.root / 'state/maintenance.json'
        if flag.exists():
            require(json.loads(private_file(flag))['transaction'] == ident, 'MAINTENANCE_OWNED')
            flag.unlink()
            sync(flag.parent)

    def write_service(self, name, settings):
        target = self.svdir / name
        if target.exists() or target.is_symlink():
            self.owned(target, settings)
        with tempfile.TemporaryDirectory(prefix='.tdev-stage-', dir=self.svdir) as temporary:
            directory = target if target.exists() else Path(temporary) / name
            (directory / 'log').mkdir(parents=True, exist_ok=True, mode=0o700)
            atomic_write(directory / 'down', b'')
            hashes = {}
            for f in ('run', 'log/run'):
                data = private_file(self.root / 'services' / name / f)
                atomic_write(directory / f, data, 0o700)
                hashes[f] = digest(data)
            atomic_write(directory / '.tdev-owner.json', canonical({'installation': settings['installation'],
                         'root': str(self.root), 'files': hashes}))
            if directory != target:
                require(not target.exists() and not target.is_symlink(), 'SERVICE_CONFLICT')
                os.rename(directory, target)
            sync(self.svdir)

    def desired(self, snapshots):
        return {name: old['down'] if old else False for name, old in snapshots.items()}

    def start_desired(self, desired, bundle):
        settings = self.settings()
        if not desired['tdev']:
            self.backend.up(self.svdir / 'tdev')
            retry(lambda: self.backend.controller_ready(self.root, settings, bundle))
        if not desired['tdev-tunnel']:
            require(not desired['tdev'], 'SERVICE_ORDER', 'Enable the controller before the tunnel')
            self.backend.up(self.svdir / 'tdev-tunnel')
            retry(lambda: self.backend.tunnel_ready(self.root, settings))

    def replace_config(self, data, expected):
        # Serialize with operator delegation commands, then compare under that lock.
        with open(self.root / 'config.lock', 'a+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            current = private_file(self.root / 'config.json')
            require(digest(current) in expected, 'CONFIG_CHANGED',
                    'Preserve a concurrent operator edit; resolve configuration before recovery')
            if current != data:
                atomic_write(self.root / 'config.json', data)

    def recover(self):
        if not self.journal.exists():
            return
        j = json.loads(private_file(self.journal))
        require(j['svdir'] == str(self.svdir), 'SVDIR')
        if j['phase'] not in ('prepared', 'committed'):
            settings = self.settings()
            for name in reversed(NAMES):
                directory = self.svdir / name
                backup = self.root / 'service-backups' / j['id'] / name
                if backup.exists() and j['services'][name] is not None:
                    require(not directory.exists(), 'RECOVERY_CONFLICT')
                    os.rename(backup, directory)
                if directory.exists():
                    # New directories enter the graph complete, including their marker.
                    # A foreign directory appearing during the transaction must survive.
                    self.owned(directory, settings, check_files=False)
                    self.backend.down(directory)
                    if j['services'][name] is None:
                        backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                        self.backend.remove(directory, backup)
            previous = j['active']
            if previous:
                from .admin import point
                point(self.root, Path(previous).name)
            elif (self.root / 'active').is_symlink():
                (self.root / 'active').unlink()
            if 'config' in j:
                before = base64.b64decode(j['config']['before'])
                self.replace_config(before, (digest(before), j['config']['afterDigest']))
            for name, old in j['services'].items():
                if old:
                    directory = self.svdir / name
                    for f, data in old['files'].items():
                        atomic_write(directory / f, base64.b64decode(data), 0o600 if f.startswith('.') else 0o700)
            if any(j['services'].values()):
                self.start_desired({n: (s['down'] if s else True) for n, s in j['services'].items()}, Path(previous).name)
        self.unfence(j['id'])
        if j['phase'] == 'committed' and 'config' in j and j['active']:
            atomic_write(self.root / 'previous-config.json', canonical({
                'bundle': Path(j['active']).name, 'before': j['config']['before'],
                'expected': j['config']['afterDigest']}))
        self.journal.unlink()
        sync(self.root)

    def install(self, bundle, config=None, expected_config=None):
        from .admin import point, verify
        with self.lock():
            infra = self.backend.preflight()
            self.recover()
            settings = self.settings()
            require(not (self.svdir / 'tdev-oai-tunnel').exists(), 'STALE_SERVICE', 'Remove the stale old-name service explicitly')
            manifest = verify(self.root / 'versions' / bundle)
            config_before = None
            if config is not None:
                config_before = private_file(self.root / 'config.json')
                require(digest(config_before) == expected_config, 'CONFIG_CHANGED')
                from jsonschema import Draft202012Validator
                schema = json.loads((self.root / 'versions' / bundle / 'contracts/config.schema.json').read_bytes())
                require(Draft202012Validator(schema).is_valid(config), 'CONFIG')
            require('src/tdev/resident.py' in manifest['files'], 'RESIDENT_BUNDLE_REQUIRED',
                    'Selected bundle predates resident services; keep the current services and choose a resident-capable bundle')
            snapshots = {name: self.snapshot(name, settings) for name in NAMES}
            desired = self.desired(snapshots)
            require(not desired['tdev'] or desired['tdev-tunnel'], 'SERVICE_ORDER', 'Disable the tunnel while its controller is disabled')
            active = os.readlink(self.root / 'active') if (self.root / 'active').is_symlink() else None
            j = {'id': uuid.uuid4().hex, 'phase': 'prepared', 'svdir': str(self.svdir), 'active': active, 'services': snapshots}
            if config_before is not None:
                j['config'] = {'before': base64.b64encode(config_before).decode(),
                               'afterDigest': digest(canonical(config))}
            atomic_write(self.journal, canonical(j))
            try:
                self.fence(j['id'])
                j['phase'] = 'changing'
                atomic_write(self.journal, canonical(j))
                for name in reversed(NAMES):
                    if snapshots[name]:
                        self.backend.down(self.svdir / name)
                if config_before is not None:
                    self.replace_config(canonical(config), (expected_config,))
                point(self.root, bundle)
                for name in NAMES:
                    self.write_service(name, settings)
                self.start_desired(self.desired(snapshots), bundle)
                j['phase'] = 'committed'
                atomic_write(self.journal, canonical(j))
                self.recover()
            except Exception:
                self.recover()
                raise
            return {'installed': True, 'bundle': bundle, 'services': list(NAMES), **infra}

    def check(self):
        from .admin import verify
        self.backend.preflight()
        require(not self.journal.exists(), 'INSTALLATION_INCOMPLETE', 'Run install/recover before checking readiness')
        settings = self.settings()
        bundle = verify(self.root / 'active')['id']
        result = {'bundle': bundle, 'services': {}}
        for name in NAMES:
            directory = self.svdir / name
            self.owned(directory, settings)
            down = self.backend.wanted_down(directory)
            if down:
                try:
                    pid = self.backend.pid(directory)
                except Fault as e:
                    require(e.value['code'] == 'SERVICE_DOWN', e.value['code'])
                else:
                    raise Fault('SERVICE_DESIRED_DOWN_RUNNING', str(pid))
                result['services'][name] = {'desired': 'down'}
            else:
                fn = self.backend.controller_ready if name == 'tdev' else self.backend.tunnel_ready
                value = fn(self.root, settings, bundle) if name == 'tdev' else fn(self.root, settings)
                result['services'][name] = {'desired': 'up', **value}
        return result

    def uninstall(self):
        with self.lock():
            self.backend.preflight()
            self.recover()
            settings = self.settings()
            snapshots = {name: self.snapshot(name, settings) for name in NAMES}
            j = {'id': uuid.uuid4().hex, 'phase': 'prepared', 'svdir': str(self.svdir),
                 'active': os.readlink(self.root / 'active'), 'services': snapshots}
            atomic_write(self.journal, canonical(j))
            try:
                self.fence(j['id'])
                j['phase'] = 'changing'
                atomic_write(self.journal, canonical(j))
                destination = self.root / 'service-backups' / j['id']
                destination.mkdir(parents=True, mode=0o700)
                for name in reversed(NAMES):
                    if snapshots[name]:
                        self.backend.remove(self.svdir / name, destination / name)
                j['phase'] = 'committed'
                atomic_write(self.journal, canonical(j))
                self.recover()
            except Exception:
                self.recover()
                raise
            return {'uninstalled': True, 'preserved': ['config', 'state', 'secrets', 'logs', 'service-backups']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['run'])
    parser.add_argument('--root', required=True)
    parser.add_argument('--role', choices=['controller', 'tunnel'], required=True)
    args = parser.parse_args()
    run_service(args.root, args.role)


if __name__ == '__main__':
    main()
