"""Fixed Git sender. Its flock/file journal observes one external effect only.

No work admission, arbitrary command, source script, credential output or second
work ledger is implemented here. Inspection fences a not-yet-started invocation
under the same lock used by run; loss before the child starts is therefore safe.
The Git child inherits the lock, so broker/helper death is not stop evidence.
"""
import errno
import fcntl
import hashlib
import json
import os
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path


def require(value, message):
    if not value:
        raise ValueError(message)


def private_json(path, missing=None):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return missing
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and info.st_mode & 0o077 == 0 and info.st_size <= 65536,
                'Private bounded regular descriptor required')
        with os.fdopen(fd, 'r', closefd=False) as stream:
            return json.load(stream)
    finally:
        os.close(fd)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def durable_json(path, value):
    temporary = str(path) + '.tmp-' + str(os.getpid())
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        data = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
        require(len(data) <= 65536, 'Descriptor bound')
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
        os.fsync(fd)
        os.replace(temporary, path)
        sync_directory(Path(path).parent)
    finally:
        os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def group_exists(pgid):
    if not isinstance(pgid, int) or pgid <= 1:
        return False
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def raw_oid(value):
    require(isinstance(value, str) and re.fullmatch(r'(sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})', value), 'Exact Git object ID required')
    return value.split(':', 1)[1]


def main():
    require(len(sys.argv) == 4 and sys.argv[1] in ('run', 'inspect', 'cancel'), 'Fixed operation required')
    operation, config_path, invocation = sys.argv[1:]
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', invocation), 'Invocation identity')
    config = private_json(config_path)
    require(config and config['schemaVersion'] == 1, 'Sender configuration')
    root = Path(config['stateDirectory'])
    require(root.is_absolute() and str(root.resolve()) == str(root), 'Sender state alias')
    directory = root / invocation
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(str(directory.resolve()) == str(directory), 'Invocation alias')
    intent_path, state_path = directory / 'intent.json', directory / 'state.json'
    lock_fd = os.open(directory / 'sender.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    require(stat.S_ISREG(os.fstat(lock_fd).st_mode), 'Sender lock type')
    if operation == 'cancel':
        durable_json(directory / 'cancel.json', {'cancelled': True})
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        if error.errno not in (errno.EACCES, errno.EAGAIN):
            raise
        print(json.dumps({'invocationId': invocation, 'stopped': False, 'delivery': 'unknown', 'state': 'running'}))
        os.close(lock_fd)
        return
    try:
        state = private_json(state_path)
        if state and state.get('state') in ('done', 'fenced') and not group_exists(state.get('processGroup')):
            print(json.dumps(state))
            return
        if state and group_exists(state.get('processGroup')):
            print(json.dumps({'invocationId': invocation, 'stopped': False, 'delivery': 'unknown', 'state': 'uncertain'}))
            return
        if operation != 'run' or (directory / 'cancel.json').exists() or state:
            value = {'invocationId': invocation, 'stopped': True, 'delivery': 'unknown' if state else 'not_sent', 'state': 'fenced'}
            durable_json(state_path, value)
            print(json.dumps(value))
            return
        intent = private_json(intent_path)
        require(intent and intent['invocationId'] == invocation, 'Missing immutable sender intent')
        effect = intent['effect']
        for key in ('repositoryId', 'bindingEpoch', 'ref'):
            require(effect[key] == config[key], 'Sender binding mismatch')
        require(re.fullmatch(r'refs/heads/(?!.*\.\.)(?!.*@\{)[A-Za-z0-9_./-]+', config['ref']) and not config['ref'].endswith(('/', '.lock')), 'Canonical ref')
        if config.get('allowLocalFixture'):
            require(config.get('provider') == 'fixture' and os.path.isabs(config['remote']), 'Explicit fixture only')
        else:
            require(config.get('provider') == 'github' and re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git', config['remote']), 'Fixed GitHub remote')
        require(os.path.isabs(config['gitExecutable']) and os.path.isabs(config['repositoryDirectory']), 'Fixed absolute broker paths')
        environment = dict(config['environment'])
        require(all(isinstance(k, str) and isinstance(v, str) and '\0' not in k + v for k, v in environment.items()), 'Environment descriptor')
        for name in list(environment):
            if re.match(r'GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_PARAMETERS|CONFIG_KEY_|CONFIG_VALUE_|REPLACE_REF_BASE)', name):
                del environment[name]
        environment.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_NO_REPLACE_OBJECTS='1', GIT_ATTR_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0', GIT_OPTIONAL_LOCKS='0', LC_ALL='C')
        settings = ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'http.followRedirects=false', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=30', '-c', 'core.fsync=objects,pack-metadata,reference', '-c', 'core.fsyncMethod=fsync']
        if config.get('allowLocalFixture'):
            settings += ['-c', 'protocol.file.allow=always']
        command = [config['gitExecutable'], *settings, '--git-dir=' + config['repositoryDirectory']]
        head, commit = raw_oid(effect['expectedHead']), raw_oid(effect['commitOid'])
        checked = subprocess.run([*command, 'cat-file', '-p', commit], env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=True)
        require(len(checked.stdout) <= 65536, 'Commit descriptor bound')
        headers = checked.stdout.split(b'\n\n', 1)[0].decode('utf-8').splitlines()
        require([line[7:] for line in headers if line.startswith('parent ')] == [head], 'Only an exact direct child may be sent')
        start = int(time.time() * 1000)
        durable_json(state_path, {'invocationId': invocation, 'effectId': effect['effectId'], 'state': 'running', 'stopped': False, 'delivery': 'unknown', 'startedAt': start})
        argv = [*command, 'push', '--porcelain', '--no-verify', '--force-with-lease=' + config['ref'] + ':' + head, '--', config['remote'], commit + ':' + config['ref']]
        child = subprocess.Popen(argv, env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, pass_fds=(lock_fd,))
        state = {'invocationId': invocation, 'effectId': effect['effectId'], 'state': 'running', 'stopped': False, 'delivery': 'unknown', 'startedAt': start, 'processGroup': child.pid}
        durable_json(state_path, state)
        selector = selectors.DefaultSelector()
        for pipe in (child.stdout, child.stderr):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ)
        output, errors = hashlib.sha256(), hashlib.sha256()
        retained = 0
        deadline = time.monotonic() + min(max(int(config.get('timeoutMs', 30000)), 1), 120000) / 1000
        killed = False
        while selector.get_map():
            if time.monotonic() >= deadline or (directory / 'cancel.json').exists() or retained > 65536:
                if not killed:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    killed = True
            for key, _ in selector.select(0.1):
                try:
                    data = os.read(key.fd, 8192)
                except BlockingIOError:
                    continue
                if not data:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                else:
                    retained += len(data)
                    (output if key.fileobj is child.stdout else errors).update(data)
            if killed and time.monotonic() > deadline + 5:
                break
        selector.close()
        code = child.wait(timeout=5)
        stopped = not group_exists(child.pid)
        result = {**state, 'state': 'done' if stopped else 'uncertain', 'stopped': stopped, 'delivery': 'sent' if code == 0 and not killed and stopped else 'unknown', 'exitCode': code, 'endedAt': int(time.time() * 1000), 'cancelled': (directory / 'cancel.json').exists(), 'stdoutDigest': 'sha256:' + output.hexdigest(), 'stderrDigest': 'sha256:' + errors.hexdigest()}
        durable_json(state_path, result)
        print(json.dumps(result))
    finally:
        # Do not LOCK_UN: a still-alive inherited child descriptor must retain it.
        os.close(lock_fd)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Provider stderr, private paths and credentials never escape this helper.
        print(json.dumps({'stopped': False, 'delivery': 'unknown', 'state': 'unavailable'}))
        sys.exit(1)
