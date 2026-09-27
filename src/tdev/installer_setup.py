"""Private, resumable first-install setup. No remote provisioning or authority grants."""
import contextlib
import fcntl
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import termios
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require


@contextlib.contextmanager
def setup_lock(root):
    with open(Path(root) / 'setup.lock', 'a+b') as lock:
        os.chmod(lock.name, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Fault('INSTALLER_BUSY') from None
        yield


def interactive():
    return sys.stdin.isatty() and sys.stderr.isatty()


def answer(prompt, secret=False):
    """Use only the actual input TTY; never open /dev/tty or fall back to echoing a key."""
    require(interactive(), 'SETUP_INPUT_REQUIRED',
            'Use an interactive terminal or --tunnel-id and --runtime-key-file (or --profile-file)')
    previous = None
    try:
        if secret:
            fd = sys.stdin.fileno()
            previous = termios.tcgetattr(fd)
            hidden = previous.copy()
            hidden[3] &= ~termios.ECHO
            termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        print(prompt, end='', file=sys.stderr, flush=True)
        value = sys.stdin.readline(4097)
        require(value != '', 'SETUP_CANCELLED', 'Setup cancelled; no services were changed')
        require(len(value) <= 4096 and value.endswith('\n'), 'SETUP_INPUT', 'Input is too long or incomplete')
        return value.strip()
    except (EOFError, KeyboardInterrupt):
        raise Fault('SETUP_CANCELLED', 'Setup cancelled; no services were changed') from None
    finally:
        if previous is not None:
            termios.tcsetattr(fd, termios.TCSADRAIN, previous)
            print(file=sys.stderr, flush=True)


def select(root, port, tunnel_id, key_file, profile_file, auth_mode, discover_profile):
    """Resolve all inputs before writing credentials. Returned key bytes stay in memory."""
    root = Path(root)
    if (root / 'resident.json').exists():
        require(not any((tunnel_id, key_file, profile_file, auth_mode)), 'RESIDENT_CONFIG_EXISTS',
                'Existing resident settings are retained; explicit operator reconfiguration is separate')
        return None
    require(1 <= port <= 65535, 'PORT')
    pending = root / 'setup-pending.json'
    saved = json.loads(private_file(pending)) if pending.exists() else {}
    profile_file = Path(profile_file) if profile_file else (
        discover_profile(port) if not saved and (not tunnel_id or key_file is None) else None)
    prior = json.loads(private_file(profile_file)) if profile_file else {}
    require(not any(prior.get('mcp', {}).get(k) for k in ('extra_headers', 'discovery_extra_headers')),
            'TUNNEL_PROFILE_AUTH', 'Profile has custom MCP headers; update its original --root to preserve authentication')
    cp = prior.get('control_plane', {})
    tunnel_id = tunnel_id or saved.get('tunnelId') or cp.get('tunnel_id')
    key_ref = cp.get('api_key', '')
    if key_file is None and key_ref.startswith('file:'):
        key_file = key_ref[5:]
        if not Path(key_file).is_absolute():
            key_file = str(profile_file.parent / key_file)
    key_target = root / 'tunnel-env/CONTROL_PLANE_API_KEY'
    if key_file is None and key_target.exists():
        key_file = key_target
    missing = not tunnel_id or key_file is None
    if missing:
        require(interactive(), 'SETUP_INPUT_REQUIRED',
                'Fresh setup needs --tunnel-id tunnel_... and --runtime-key-file /private/key, '
                'or --profile-file /private/profile.yaml; alternatively run in an interactive terminal')
        print('tdev initial setup\nUse an existing OpenAI Tunnel and its runtime API key.', file=sys.stderr)
    if not tunnel_id:
        while True:
            tunnel_id = answer('OpenAI Tunnel ID: ')
            if re.fullmatch(r'tunnel_[a-z0-9]{32}', tunnel_id):
                break
            print('Enter tunnel_ followed by exactly 32 lowercase letters or digits.', file=sys.stderr)
    require(re.fullmatch(r'tunnel_[a-z0-9]{32}', tunnel_id), 'TUNNEL_ID_REQUIRED', 'Invalid Tunnel ID')
    key = private_file(key_file).strip() if key_file else answer('Tunnel runtime API key (hidden): ', secret=True).encode()
    require(key and len(key) <= 4096 and b'\n' not in key and b'\r' not in key and b'\0' not in key,
            'TUNNEL_KEY_REQUIRED', 'Provide a nonempty private runtime API key file')
    if key_target.exists():
        require(private_file(key_target).strip() == key, 'TUNNEL_KEY_CHANGED')
    # Adoption preserves the old host-provided model. Only genuinely new installations default to tunnel auth.
    mode = auth_mode or saved.get('connectorAuth') or ('bearer' if profile_file or (root/'config.json').exists() else 'tunnel')
    explicit_bearer = auth_mode == 'bearer'
    if missing and auth_mode is None and not saved:
        default = '1' if mode == 'tunnel' else '2'
        print('Connector authentication:\n'
              '  1) OpenAI Tunnel authorization (no custom credential in ChatGPT; shared local principal)\n'
              '  2) Connector-provided Bearer (host must support it)', file=sys.stderr)
        while True:
            choice = answer('Select [' + default + ']: ') or default
            if choice in ('1', '2'):
                mode = 'tunnel' if choice == '1' else 'bearer'
                explicit_bearer = choice == '2'
                break
            print('Choose 1 or 2.', file=sys.stderr)
    require(mode in ('tunnel', 'bearer'), 'CONNECTOR_AUTH')
    plan = {'port': port, 'tunnelId': tunnel_id, 'connectorAuth': mode,
            'baseUrl': cp.get('base_url', saved.get('baseUrl', 'https://api.openai.com')),
            'urlPath': cp.get('url_path', saved.get('urlPath'))}
    if saved:
        require(plan == saved, 'SETUP_CHANGED', 'Retry with the original setup inputs; staged credentials are preserved')
    return {**plan, '_key': key, '_showBearer': explicit_bearer and interactive() and not (root/'config.json').exists()}


def write_inputs(root, plan):
    """A nonsecret intent precedes writes; incomplete setup is retryable, never implicitly rotated."""
    root = Path(root)
    atomic_write(root/'setup-pending.json', canonical({k:v for k,v in plan.items() if not k.startswith('_')}))
    target = root/'tunnel-env/CONTROL_PLANE_API_KEY'
    if target.exists():
        require(private_file(target).strip() == plan['_key'], 'TUNNEL_KEY_CHANGED')
    else:
        atomic_write(target, plan['_key'])


def local_header(root, required):
    root = Path(root)
    secret_path = root/'connector.secret'
    if not secret_path.exists():
        require(not required, 'LOCAL_CREDENTIAL_REQUIRED', 'Internal Tunnel auth requires the installation connector.secret')
        return None
    secret = private_file(secret_path).strip()
    require(re.fullmatch(rb'[A-Za-z0-9_-]{32,256}', secret), 'LOCAL_CREDENTIAL_FORMAT')
    config = json.loads(private_file(root/'config.json'))
    matches = [name for name, value in config['principals'].items() if value['tokenHash'] == digest(secret)]
    require(len(matches) == 1, 'LOCAL_CREDENTIAL_MISMATCH', 'connector.secret must match exactly one configured principal')
    # file: references contain the whole header value; connector.secret stays compatible with other clients.
    target = root/'tunnel-env/MCP_AUTHORIZATION'
    value = b'Bearer ' + secret
    if target.exists():
        require(private_file(target) == value, 'LOCAL_CREDENTIAL_CHANGED')
    else:
        atomic_write(target, value)
    return 'file:' + str(target)


def show_connection(root, settings, show_bearer=False):
    mode = settings.get('connectorAuth', 'bearer')
    if mode == 'tunnel':
        print('ChatGPT: select this Tunnel and authentication None. Local tdev authentication remains enabled.\n'
              'All authorized Tunnel users share the configured local principal. No repository grants were added.', file=sys.stderr)
    elif show_bearer and interactive():
        secret = private_file(Path(root)/'connector.secret').strip()
        print('Connector Bearer:\n' + secret.decode() + '\nSaved privately to:\n' + str(Path(root)/'connector.secret'), file=sys.stderr)
        copy_token(secret)

    else:
        print('Connector Bearer is preserved privately at ' + str(Path(root)/'connector.secret'), file=sys.stderr)


def copy_token(secret):
    copied = False
    clipboard = shutil.which('termux-clipboard-set')
    if clipboard:
        try:
            with subprocess.Popen([clipboard], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True) as proc:
                try:
                    proc.communicate(input=secret, timeout=3)
                    copied = proc.returncode == 0
                except subprocess.TimeoutExpired:
                    # The Termux wrapper can spawn termux-api; bound the whole private process group.
                    try: os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    proc.communicate()
        except (OSError, subprocess.SubprocessError):
            pass
    print('Copied to Android clipboard. Paste into your connector authentication field.' if copied else
          'Clipboard unavailable. Copy the credential shown above manually.', file=sys.stderr)
    return copied


def deliver_token(secret, file):
    copied = copy_token(secret)
    if not copied and interactive():
        print('Connector Bearer:\n' + secret.decode(), file=sys.stderr)
    return {'secretFile': str(file), 'copied': copied,
            'hint': 'Paste into the connector Bearer field' if copied else 'Read the private secret file locally; no secret is returned in JSON'}
