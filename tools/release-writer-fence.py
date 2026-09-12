"""Fixed native writer handoff. No work admission, epoch mutation or shell.

The launcher gate is shared by the live native process and exclusive while a
pointer is switched. The existing SQLite writer lock and every retained Git
sender lock are independently required. A stopped broker is not sender proof.
"""
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
from pathlib import Path


def require(value):
    if not value:
        raise ValueError('Release writer fence rejected')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def regular(path, maximum, private=True):
    path = Path(path)
    require(path.is_absolute() and str(path.resolve()) == str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= maximum)
        if private:
            require(before.st_uid == os.getuid() and before.st_mode & 0o077 == 0)
        data = os.read(fd, maximum + 1)
        after = os.fstat(fd)
        require(len(data) == before.st_size == after.st_size and before.st_ino == after.st_ino and before.st_mtime_ns == after.st_mtime_ns)
        return data
    finally:
        os.close(fd)


def private_json(path, missing=None):
    try:
        return json.loads(regular(path, 262144))
    except FileNotFoundError:
        return missing


def durable(path, value):
    path = Path(path)
    data = canonical(value)
    require(len(data) <= 262144 and str(path.parent.resolve()) == str(path.parent))
    temporary = str(path) + '.tmp-' + str(os.getpid())
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
        os.fsync(fd)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def exclusive(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and info.st_mode & 0o077 == 0)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except Exception:
        os.close(fd)
        raise


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


def stopped_service(config):
    # runit's fixed 20-byte status: pid little-endian at12, want at17,
    # state at19. This is only launcher observation, never writer stop proof.
    status = regular(config['serviceStatusFile'], 20, private=False)
    require(len(status) == 20 and int.from_bytes(status[12:16], 'little') == 0 and status[17] == ord('d') and status[19] == 0)


def pointer(value, config):
    fields = {'schemaVersion', 'installationId', 'repositoryId', 'bindingEpoch', 'deviceReleaseId', 'artifactDigest', 'sourceCommitOid', 'schemaDigest', 'nativeConfigDigest'}
    require(isinstance(value, dict) and set(value) == fields and value['schemaVersion'] == 1)
    for key in ('installationId', 'repositoryId', 'bindingEpoch'):
        require(value[key] == config[key])
    for key in ('deviceReleaseId', 'artifactDigest', 'schemaDigest', 'nativeConfigDigest'):
        require(isinstance(value[key], str) and re.fullmatch(r'sha256:[0-9a-f]{64}', value[key]))
    require(re.fullmatch(r'sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64}', value['sourceCommitOid']))
    return value


def verify_target(value, config):
    value = pointer(value, config)
    release = value['deviceReleaseId'].split(':', 1)[1]
    bundle = regular(Path(config['artifactDirectory']) / release / 'device.cjs', 16777216)
    native = regular(Path(config['nativeConfigDirectory']) / (release + '.json'), 1048576)
    require('sha256:' + hashlib.sha256(bundle).hexdigest() == value['artifactDigest'])
    require('sha256:' + hashlib.sha256(native).hexdigest() == value['nativeConfigDigest'])
    runtime = json.loads(native)['runtime']
    require(runtime['bundleDigest'] == value['artifactDigest'] and runtime['sourceCommitOid'] == value['sourceCommitOid'] and runtime['schemaDigest'] == value['schemaDigest'])
    return value


def fence(config, request, mode, directory):
    require(set(request) == {'effectId', 'inputDigest', 'expected', 'target'})
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', request['effectId']) and re.fullmatch(r'sha256:[0-9a-f]{64}', request['inputDigest']))
    expected, target = pointer(request['expected'], config), verify_target(request['target'], config)
    locks = []
    database = None
    try:
        locks.append(exclusive(Path(directory) / 'effect.lock'))
        prior = private_json(Path(directory) / 'proof.json')
        if prior:
            require(prior['effectId'] == request['effectId'] and prior['inputDigest'] == request['inputDigest'])
        current = pointer(private_json(config['pointerFile']), config)
        if mode == 'switch' and current == target and prior and prior.get('writerStopped') is True:
            return {**prior, 'state': 'switched', 'pointer': current}
        require(current == expected or current == target)
        locks.append(exclusive(config['launcherLockFile']))
        stopped_service(config)
        ledger = Path(config['ledgerFile'])
        require(ledger.is_file() and str(ledger.resolve()) == str(ledger) and not ledger.is_symlink())
        database = sqlite3.connect(ledger.as_uri() + '?mode=rw', uri=True, timeout=0, isolation_level=None)
        database.execute('PRAGMA busy_timeout=0')
        database.execute('PRAGMA locking_mode=EXCLUSIVE')
        database.execute('BEGIN EXCLUSIVE')
        binding = json.loads(database.execute('SELECT record FROM binding WHERE singleton=1').fetchone()[0])
        for key in ('installationId', 'repositoryId', 'bindingEpoch'):
            require(binding[key] == config[key])
        epoch = database.execute("SELECT value FROM meta WHERE key='ownerEpoch'").fetchone()[0]
        root = Path(config['senderStateDirectory'])
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        require(str(root.resolve()) == str(root))
        names = {p.name for p in root.iterdir()}
        for row in database.execute("SELECT value FROM meta WHERE key LIKE 'sender:%'"):
            names.add(json.loads(row[0])['invocationId'])
        require(len(names) <= 16384)
        for name in sorted(names):
            require(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', name))
            sender = root / name
            sender.mkdir(mode=0o700, exist_ok=True)
            require(str(sender.resolve()) == str(sender) and sender.is_dir())
            locks.append(exclusive(sender / 'sender.lock'))
            state = private_json(sender / 'state.json')
            require(not state or not group_exists(state.get('processGroup')))
            if not state or state.get('state') not in ('done', 'fenced'):
                # Fences delayed not-yet-launched senders under their existing lock.
                # Preserve completed delivery records and every old invocation ID.
                durable(sender / 'state.json', {'invocationId': name, 'stopped': True, 'delivery': 'unknown' if state else 'not_sent', 'state': 'fenced'})
        stopped_service(config)
        require(pointer(private_json(config['pointerFile']), config) == current)
        proof = {'effectId': request['effectId'], 'inputDigest': request['inputDigest'], 'state': 'stopped', 'writerStopped': True, 'ownerEpoch': epoch, 'senderCount': len(names), 'pointer': current}
        durable(Path(directory) / 'proof.json', proof)
        if mode == 'switch':
            verify_target(target, config)
            durable(config['pointerFile'], target)
            proof = {**proof, 'state': 'switched', 'pointer': pointer(private_json(config['pointerFile']), config)}
            require(proof['pointer'] == target)
            durable(Path(directory) / 'proof.json', proof)
        return proof
    finally:
        if database is not None:
            try:
                database.execute('ROLLBACK')
            except sqlite3.Error:
                pass
            database.close()
        for fd in reversed(locks):
            os.close(fd)


def main():
    require(len(sys.argv) == 4 and sys.argv[1] in ('probe', 'switch'))
    mode, filename, effect_id = sys.argv[1:]
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', effect_id))
    config = private_json(filename)
    fields = {'schemaVersion', 'installationId', 'repositoryId', 'bindingEpoch', 'ledgerFile', 'senderStateDirectory', 'pointerFile', 'launcherLockFile', 'serviceStatusFile', 'requestDirectory', 'artifactDirectory', 'nativeConfigDirectory'}
    require(isinstance(config, dict) and set(config) == fields and config['schemaVersion'] == 1)
    directory = Path(config['requestDirectory']) / effect_id
    require(str(directory.resolve()) == str(directory))
    request = private_json(directory / 'intent.json')
    require(request and request['effectId'] == effect_id)
    print(canonical(fence(config, request, mode, directory)).decode())


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"state":"blocked","writerStopped":false}')
        sys.exit(1)
