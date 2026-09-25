"""Command-line installation orchestration; no credentials in output or arguments."""
import argparse
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import uuid
from pathlib import Path

from . import admin
from .common import Fault, atomic_write, canonical, digest, private_file, require
from .resident import Installation, NAMES, Runit, command, option, process, processes


def default_root():
    if os.environ.get('TDEV_ROOT'):
        return Path(os.environ['TDEV_ROOT']).absolute()
    svdir = Path(os.environ.get('SVDIR', os.environ.get('PREFIX', '') + '/var/service'))
    marker = svdir / 'tdev/.tdev-owner.json'
    if marker.is_file():
        return Path(json.loads(private_file(marker))['root'])
    # Adopt only an unambiguous running packaged installation, never arbitrary old state.
    roots = set()
    for p in processes():
        if 'tdev.server' in p['argv']:
            cfg, state = option(p['argv'], '--config'), option(p['argv'], '--state')
            if cfg and state:
                root = Path(cfg).parent
                if Path(state) == root / 'state' and (root / 'active/manifest.json').is_file():
                    roots.add(root)
    require(len(roots) <= 1, 'INSTALL_ROOT_REQUIRED', 'Multiple installations are running; choose --root')
    return roots.pop() if roots else Path.home() / '.local/share/tdev'


def discover_profile(port):
    profiles = set()
    for p in processes():
        if 'run' in p['argv'] and 'tunnel-client' in p['exe']:
            name = option(p['argv'], '--profile')
            directory = option(p['argv'], '--profile-dir', str(Path.home() / '.config/tunnel-client'))
            if name:
                f = Path(directory) / (name + '.yaml')
                try:
                    v = json.loads(private_file(f))
                    if any(t.get('url') == f'http://127.0.0.1:{port}/mcp' for t in v.get('mcp', {}).get('server_urls', [])):
                        profiles.add(f)
                except (OSError, ValueError, Fault):
                    pass
    require(len(profiles) <= 1, 'TUNNEL_PROFILE_REQUIRED', 'Multiple matching profiles; select --profile-file')
    return profiles.pop() if profiles else None


def configure(root, port=8765, tunnel_id=None, key_file=None, profile_file=None):
    root = Path(root)
    if (root / 'resident.json').exists():
        settings = json.loads(private_file(root / 'resident.json'))
        require(not tunnel_id and not key_file and not profile_file, 'RESIDENT_CONFIG_EXISTS',
                'Existing resident settings are retained; explicit operator reconfiguration is separate')
        return settings
    profile_file = Path(profile_file) if profile_file else discover_profile(port)
    prior = json.loads(private_file(profile_file)) if profile_file else {}
    cp = prior.get('control_plane', {})
    tunnel_id = tunnel_id or cp.get('tunnel_id')
    key_ref = cp.get('api_key', '')
    if key_file is None and key_ref.startswith('file:'):
        key_file = key_ref[5:]
    require(tunnel_id and re.fullmatch(r'tunnel_[A-Za-z0-9]+', tunnel_id), 'TUNNEL_ID_REQUIRED',
            'Provide --tunnel-id for the existing Tunnel (no remote Tunnel is created by install)')
    require(key_file, 'TUNNEL_KEY_REQUIRED', 'Provide --runtime-key-file; never put a key value in arguments')
    key = private_file(key_file)
    require(key.strip(), 'TUNNEL_KEY_REQUIRED')
    key_target = root / 'tunnel-env/CONTROL_PLANE_API_KEY'
    if key_target.exists():
        require(private_file(key_target) == key, 'TUNNEL_KEY_CHANGED')
    else:
        atomic_write(key_target, key)
    runtime = admin._select_tunnel_runtime(root)
    require(runtime['mode'] != 'unprepared', 'TUNNEL_CLIENT_INSTALL')
    runtime['digest'] = digest(Path(runtime['binary']).read_bytes())
    settings = {'installation': uuid.uuid4().hex, 'port': port, 'home': str(Path.home()),
                'runtime': runtime, 'tunnelId': tunnel_id}
    directory = root / 'tunnel-profiles'
    directory.mkdir(mode=0o700, exist_ok=True)
    profile = {'config_version': 1, 'control_plane': {'base_url': cp.get('base_url', 'https://api.openai.com'),
               'tunnel_id': tunnel_id, 'api_key': 'file:' + str(key_target)},
               'health': {'listen_addr': '127.0.0.1:0', 'url_file': str(root / 'tunnel-health.url')},
               'admin_ui': {'open_browser': False}, 'log': {'level': 'info', 'format': 'json'},
               'mcp': {'server_urls': [{'channel': 'main', 'url': f'http://127.0.0.1:{port}/mcp'}]}}
    if cp.get('url_path'):
        profile['control_plane']['url_path'] = cp['url_path']
    settings['profileDigest'] = digest(canonical(profile))
    atomic_write(directory / 'tdev.yaml', canonical(profile))
    atomic_write(root / 'resident.json', canonical(settings))
    return settings


def retire_legacy(installation, request):
    """Explicit name+script digest authorizes one unmanaged service retirement."""
    name, checksum = request.split(':', 1)
    require(name in (*NAMES, 'tdev-oai-tunnel'), 'SERVICE_NAME')
    directory = installation.svdir / name
    require(directory.is_dir() and not directory.is_symlink(), 'SERVICE_CONFLICT')
    require(not (directory / '.tdev-owner.json').exists(), 'SERVICE_ALREADY_MANAGED')
    require(digest(private_file(directory / 'run')) == checksum, 'SERVICE_CHANGED')
    backup = installation.root / 'retired-services' / (name + '-' + uuid.uuid4().hex)
    backup.parent.mkdir(mode=0o700, exist_ok=True)
    record = {'service': name, 'runDigest': checksum, 'backup': str(backup),
              'wasDown': installation.backend.wanted_down(directory)}
    atomic_write(backup.parent / (backup.name + '.json'), canonical(record))
    installation.backend.remove(directory, backup)
    return record


def takeover(root, settings, backend):
    """Stop the exact former manual controller/managed Tunnel before service ownership."""
    manual = [p for p in processes() if 'tdev.server' in p['argv'] and option(p['argv'], '--state') == str(root / 'state')]
    if backend.available(backend.svdir / 'tdev'):
        try:
            supervised = backend.pid(backend.svdir / 'tdev')
            manual = [p for p in manual if p['pid'] != supervised]
        except Fault:
            pass
    require(len(manual) <= 1, 'DUPLICATE_CONTROLLER')
    for p in manual:
        require(option(p['argv'], '--config') == str(root / 'config.json'), 'CONTROLLER_IDENTITY')
        require(Path(p['exe']).resolve() == Path(sys.executable).resolve(), 'CONTROLLER_IDENTITY')
    dbfile = root / 'state/state.sqlite'
    if dbfile.exists():
        with sqlite3.connect('file:' + str(dbfile) + '?mode=ro', uri=True) as db:
            require(db.execute("SELECT count(*) FROM operation WHERE status IN ('running','unknown')").fetchone()[0] == 0,
                    'OUTSTANDING_EFFECT', 'Finish existing operations before first service takeover')
    binary = settings['runtime']['binary']
    listing = json.loads(command([binary, 'runtimes', 'list', '--json']).stdout)
    aliases = []
    for entry in listing.get('aliases', []):
        if isinstance(entry, str):
            alias = entry
        else:
            alias = entry.get('alias')
        if not alias:
            continue
        status = json.loads(command([binary, 'runtimes', 'status', alias, '--json']).stdout)
        proc = status.get('process', {})
        if status.get('process_running') and (status.get('tunnel_id') or proc.get('tunnel_id') or entry.get('tunnel_id')) == settings['tunnelId']:
            require(proc.get('target_value') == f"http://127.0.0.1:{settings['port']}/mcp", 'TUNNEL_TARGET_CONFLICT')
            aliases.append(alias)
    # Preserve a concrete receipt. Controller command has no credential arguments.
    record = {'controllers': manual, 'tunnelAliases': aliases, 'phase': 'stopping'}
    for p in manual:
        env = (Path('/proc') / str(p['pid']) / 'environ').read_bytes().split(b'\0')
        # This private recovery record may contain operator environment; never print it.
        atomic_write(root / 'manual-controller-environment.json', canonical({
            k.decode(): v.decode() for item in env if b'=' in item for k, v in [item.split(b'=', 1)]}))
    atomic_write(root / 'manual-takeover.json', canonical(record))
    for alias in aliases:
        command([binary, 'runtimes', 'stop', alias, '--json'])
    for p in manual:
        require(process(p['pid']) == p, 'CONTROLLER_IDENTITY')
        os.kill(p['pid'], signal.SIGTERM)
        until = time.monotonic() + 10
        while process(p['pid']) is not None:
            require(time.monotonic() < until, 'CONTROLLER_STOP')
            time.sleep(.1)
    record['phase'] = 'stopped'
    atomic_write(root / 'manual-takeover.json', canonical(record))
    return record


def restore_manual(root, settings):
    filename = root / 'manual-takeover.json'
    if not filename.exists():
        return
    record = json.loads(private_file(filename))
    if record['phase'] not in ('stopping', 'stopped'):
        return
    for old in record['controllers']:
        matches = [p for p in processes() if p['argv'] == old['argv']]
        if not matches:
            env = json.loads(private_file(root / 'manual-controller-environment.json'))
            with open(root / 'manual-recovery.log', 'ab') as log:
                os.chmod(root / 'manual-recovery.log', 0o600)
                subprocess.Popen(old['argv'], env=env, cwd=root, stdin=subprocess.DEVNULL,
                                 stdout=log, stderr=log, start_new_session=True)
    for alias in record['tunnelAliases']:
        command([settings['runtime']['binary'], 'runtimes', 'connect', '--alias', alias,
                 '--tunnel-id', settings['tunnelId'], '--runtime-api-key',
                 'file:' + str(root / 'tunnel-env/CONTROL_PLANE_API_KEY'),
                 '--mcp-server-url', f"http://127.0.0.1:{settings['port']}/mcp", '--json'], timeout=45)
    record['phase'] = 'restored'
    atomic_write(filename, canonical(record))


def main():
    parser = argparse.ArgumentParser(description='Install/update owned Termux tdev services; preserve credentials and state')
    flags = parser.add_mutually_exclusive_group()
    for name in ('no-start', 'check', 'rollback', 'uninstall', 'recover'):
        flags.add_argument('--' + name, action='store_true')
    parser.add_argument('directory', nargs='?')
    parser.add_argument('--root')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--tunnel-id')
    parser.add_argument('--runtime-key-file')
    parser.add_argument('--profile-file')
    parser.add_argument('--takeover', action='store_true', help='Stop this installation\'s manual controller and matching managed Tunnel')
    parser.add_argument('--diagnostics', choices=('off', 'watch'), help='Set diagnostic mode within the recoverable update transaction')
    parser.add_argument('--diagnostic-principal', action='append', default=[],
                        help='Grant an existing principal bounded diagnostic capture control')
    parser.add_argument('--retire-legacy', action='append', default=[], metavar='NAME:RUN_SHA256', help='Explicitly retire one verified unmanaged old service before installation')
    args = parser.parse_args()
    require(not (args.diagnostics or args.diagnostic_principal) or not any(
        (args.no_start, args.check, args.rollback, args.uninstall, args.recover)), 'INSTALL_OPTIONS')
    root = Path(args.root or args.directory or default_root()).absolute()
    source = Path(__file__).resolve().parents[2]
    if args.no_start:
        admin.prepare_tunnel(root)
        result = admin.stage(root, source)
    elif args.check:
        result = Installation(root).check() if (root / 'resident.json').exists() else admin.check(root)
    elif args.uninstall:
        result = Installation(root).uninstall()
    elif args.recover:
        inst = Installation(root)
        with inst.lock():
            inst.backend.preflight()
            inst.recover()
        if not (inst.svdir / 'tdev/.tdev-owner.json').exists():
            restore_manual(root, inst.settings())
        result = {'recovered': True}
    else:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        backend = Runit()
        backend.preflight()
        admin.prepare_tunnel(root)
        staged = admin.stage(root, source)
        if not (root / 'config.json').exists():
            admin.init_config(root)
        settings = configure(root, args.port, args.tunnel_id, args.runtime_key_file, args.profile_file)
        inst = Installation(root, backend)
        # No live mutation until bundle/config/prerequisites and exact ownership are known.
        # Bundle schema/config are checked before retiring any previous service.
        admin.verify(root / 'versions' / staged['bundle'])
        from jsonschema import Draft202012Validator
        Draft202012Validator(json.loads((source / 'contracts/config.schema.json').read_bytes())).validate(json.loads(private_file(root / 'config.json')))
        if (root / 'state/state.sqlite').exists():
            with sqlite3.connect('file:' + str(root / 'state/state.sqlite') + '?mode=ro', uri=True) as db:
                require(db.execute('PRAGMA user_version').fetchone()[0] in admin.state_versions(root / 'versions' / staged['bundle']), 'SCHEMA_VERSION')
                require(db.execute("SELECT count(*) FROM operation WHERE status IN ('running','unknown')").fetchone()[0] == 0, 'OUTSTANDING_EFFECT')
        with inst.lock():
            inst.recover()
            for request in args.retire_legacy:
                retire_legacy(inst, request)
            for name in NAMES:
                inst.snapshot(name, settings)
            if args.takeover:
                takeover(root, settings, backend)
        bundle = json.loads(private_file(root / 'previous.json'))['target'].split('/')[-1] if args.rollback else staged['bundle']
        config_update, config_expected = None, None
        previous_config = root / 'previous-config.json'
        if args.rollback and previous_config.exists():
            saved = json.loads(private_file(previous_config))
            if saved['bundle'] == bundle:
                require(digest(private_file(root / 'config.json')) == saved['expected'], 'CONFIG_CHANGED')
                import base64
                config_update = json.loads(base64.b64decode(saved['before']))
                config_expected = saved['expected']
        if args.diagnostics or args.diagnostic_principal:
            original = private_file(root / 'config.json')
            config_update, config_expected = json.loads(original), digest(original)
            if args.diagnostics:
                config_update.setdefault('diagnostics', {})['mode'] = args.diagnostics
            for principal in args.diagnostic_principal:
                require(principal in config_update['principals'], 'PRINCIPAL_NOT_FOUND')
                config_update['principals'][principal]['diagnostics'] = True
        try:
            result = inst.install(bundle, config_update, config_expected)
            result['check'] = inst.check()
        except Exception:
            if args.takeover and not inst.journal.exists():
                restore_manual(root, settings)
            raise
        if args.takeover:
            receipt = json.loads(private_file(root / 'manual-takeover.json'))
            receipt['phase'] = 'committed'
            atomic_write(root / 'manual-takeover.json', canonical(receipt))
    print(canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except Fault as e:
        print(canonical({'ok': False, 'error': e.value}).decode(), file=sys.stderr)
        raise SystemExit(1)
