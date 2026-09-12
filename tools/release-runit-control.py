"""One fixed service, only the documented runsv u/d FIFO commands.

The nonblocking one-byte send has no descendant writer. Its immutable intent and
sent marker precede the write. Positive wanted-state readback acknowledges it;
a timeout or absent service never permits a second send. A delayed unstarted run
is fenced under the same OS lock. Status alone is NOT SQLite/Git-writer stop proof.
"""
import errno
import os
import re
import stat
import sys
from pathlib import Path
from release_native import require, closed, private_json, regular, durable, lock, pointer, digest, sha, exact_path


def status(config):
    service = exact_path(config['serviceDirectory'])
    # No source-controlled customization or post-exit hook may override u/d.
    require(not (service / 'finish').exists())
    for key in ('u', 'd', 't'):
        require(not (service / 'control' / key).exists())
    require(sha(regular(service / 'run', 65536)) == config['serviceRunDigest'])
    raw = regular(service / 'supervise' / 'status', 20, private=False)
    require(len(raw) == 20 and raw[17] in (ord('u'), ord('d')) and raw[19] in (0, 1, 2))
    return {'pid': int.from_bytes(raw[12:16], 'little'), 'wanted': chr(raw[17]), 'state': raw[19]}


def receipt(request, phase, delivered, seen, stopped=True):
    return {'effectId': request['effectId'], 'inputDigest': request['inputDigest'], 'step': request['step'], 'state': phase, 'delivery': delivered, 'senderStopped': stopped, 'service': seen}


def run(config, mode, effect_id):
    directory = exact_path(config['stateDirectory']) / effect_id
    require(directory.is_dir() and str(directory.resolve()) == str(directory))
    request = private_json(directory / 'intent.json')
    closed(request, ['effectId', 'inputDigest', 'step', 'expectedDeviceReleaseId', 'targetDeviceReleaseId'])
    require(request['effectId'] == effect_id and request['step'] in ('device.stop', 'device.start'))
    for key in ('inputDigest', 'expectedDeviceReleaseId', 'targetDeviceReleaseId'):
        digest(request[key])
    wanted = 'd' if request['step'] == 'device.stop' else 'u'
    try:
        gate = lock(directory / 'sender.lock')
    except OSError as error:
        if error.errno not in (errno.EAGAIN, errno.EACCES):
            raise
        return receipt(request, 'running', 'unknown', None, False)
    try:
        state_path = directory / 'state.json'
        old = private_json(state_path)
        if old:
            require(old['effectId'] == effect_id and old['inputDigest'] == request['inputDigest'] and old['step'] == request['step'])
        seen = status(config)
        if old and old['state'] in ('done', 'fenced'):
            return {**old, 'service': seen}
        if old:
            # A previous process may have written to runsv before losing its
            # response. Only acknowledgment of that same desired state resolves it.
            if seen['wanted'] == wanted:
                result = receipt(request, 'done', 'sent', seen)
                durable(state_path, result)
                return result
            return receipt(request, 'uncertain', 'unknown', seen)
        if mode == 'inspect':
            result = receipt(request, 'fenced', 'not_sent', seen)
            durable(state_path, result)
            return result
        current = pointer(private_json(config['pointerFile']), config)
        allowed = {request['expectedDeviceReleaseId'], request['targetDeviceReleaseId']} if wanted == 'd' else {request['targetDeviceReleaseId']}
        require(current['deviceReleaseId'] in allowed)
        if seen['wanted'] == wanted:
            result = receipt(request, 'done', 'not_sent', seen)
            durable(state_path, result)
            return result
        pipe = exact_path(config['serviceDirectory']) / 'supervise' / 'control'
        require(str(pipe.resolve()) == str(pipe))
        fd = os.open(pipe, os.O_WRONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            require(stat.S_ISFIFO(info.st_mode) and info.st_uid == os.getuid())
            durable(state_path, receipt(request, 'sent', 'unknown', seen))
            # PIPE_BUF includes a single byte. A partial write is impossible;
            # failure still conservatively retains the uncertain original send.
            require(os.write(fd, wanted.encode()) == 1)
        finally:
            os.close(fd)
        seen = status(config)
        if seen['wanted'] == wanted:
            result = receipt(request, 'done', 'sent', seen)
            durable(state_path, result)
            return result
        return receipt(request, 'uncertain', 'unknown', seen)
    finally:
        os.close(gate)


def main():
    require(len(sys.argv) == 4 and sys.argv[1] in ('run', 'inspect'))
    mode, filename, effect_id = sys.argv[1:]
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', effect_id))
    config = private_json(filename)
    closed(config, ['schemaVersion', 'installationId', 'repositoryId', 'bindingEpoch', 'serviceDirectory', 'serviceRunDigest', 'stateDirectory', 'pointerFile'])
    require(config['schemaVersion'] == 1)
    digest(config['serviceRunDigest'])
    import json
    print(json.dumps(run(config, mode, effect_id), sort_keys=True, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"state":"unavailable","senderStopped":false,"delivery":"unknown"}')
        sys.exit(1)
