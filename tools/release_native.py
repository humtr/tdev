"""Private fixed-launcher file primitives; never a candidate-selected program."""
import fcntl
import hashlib
import json
import os
import re
import stat
from pathlib import Path


def require(value):
    if not value:
        raise ValueError('Fixed release operation rejected')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def closed(value, fields):
    require(isinstance(value, dict) and set(value) == set(fields))


def exact_path(path):
    require(isinstance(path, str) and os.path.isabs(path) and str(Path(path).resolve()) == path)
    return Path(path)


def regular(path, maximum=262144, private=True):
    path = str(path)
    exact_path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= maximum)
        if private:
            require(before.st_uid == os.getuid() and before.st_mode & 0o077 == 0)
        chunks, length = [], 0
        while True:
            chunk = os.read(fd, min(65536, maximum + 1 - length))
            if not chunk:
                break
            chunks.append(chunk)
            length += len(chunk)
            require(length <= maximum)
        after = os.fstat(fd)
        require(length == before.st_size == after.st_size and before.st_ino == after.st_ino and before.st_mtime_ns == after.st_mtime_ns)
        return b''.join(chunks)
    finally:
        os.close(fd)


def unique(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def private_json(path, missing=None):
    try:
        return json.loads(regular(path), object_pairs_hook=unique)
    except FileNotFoundError:
        return missing


def durable(path, value):
    path = exact_path(str(path))
    data = canonical(value)
    require(len(data) <= 262144)
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


def lock(path, shared=False):
    path = exact_path(str(path))
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and info.st_mode & 0o077 == 0)
        fcntl.flock(fd, (fcntl.LOCK_SH if shared else fcntl.LOCK_EX) | fcntl.LOCK_NB)
        return fd
    except Exception:
        os.close(fd)
        raise


def sha(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def digest(value):
    require(isinstance(value, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', value))
    return value


def pointer(value, config):
    closed(value, ['schemaVersion', 'installationId', 'repositoryId', 'bindingEpoch', 'deviceReleaseId', 'artifactDigest', 'sourceCommitOid', 'schemaDigest', 'nativeConfigDigest'])
    require(value['schemaVersion'] == 1)
    for key in ('installationId', 'repositoryId', 'bindingEpoch'):
        require(value[key] == config[key])
    for key in ('deviceReleaseId', 'artifactDigest', 'schemaDigest', 'nativeConfigDigest'):
        digest(value[key])
    require(re.fullmatch(r'sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64}', value['sourceCommitOid']))
    return value


def device_files(value, config):
    value = pointer(value, config)
    release = value['deviceReleaseId'][7:]
    bundle = exact_path(config['artifactDirectory']) / release / 'device.cjs'
    native = exact_path(config['nativeConfigDirectory']) / (release + '.json')
    require(sha(regular(bundle, 16777216)) == value['artifactDigest'])
    native_bytes = regular(native, 1048576)
    require(sha(native_bytes) == value['nativeConfigDigest'])
    runtime = json.loads(native_bytes, object_pairs_hook=unique)['runtime']
    require(runtime['bundleDigest'] == value['artifactDigest'] and runtime['schemaDigest'] == value['schemaDigest'] and runtime['sourceCommitOid'] == value['sourceCommitOid'])
    return str(bundle), str(native)
