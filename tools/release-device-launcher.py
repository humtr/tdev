"""Runit's fixed device launcher: shared pointer gate survives exec into Node.

No source file, package script, install hook or caller-provided command executes.
The exclusive writer-fence gate prevents an old pointer being read before switch
and executed afterwards. Artifact and private native-config bytes are both bound.
"""
import os
import stat
import sys
from release_native import require, closed, private_json, regular, lock, pointer, device_files, digest, sha, exact_path


def main():
    require(len(sys.argv) == 2)
    config = private_json(sys.argv[1])
    closed(config, ['schemaVersion', 'installationId', 'repositoryId', 'bindingEpoch', 'pointerFile', 'launcherLockFile', 'artifactDirectory', 'nativeConfigDirectory', 'nodeExecutable', 'nodeDigest', 'schemaDigest', 'environment'])
    require(config['schemaVersion'] == 1)
    digest(config['schemaDigest'])
    digest(config['nodeDigest'])
    allowed = {'HOME', 'PATH', 'TMPDIR', 'LANG', 'PREFIX', 'ANDROID_ROOT', 'ANDROID_DATA'}
    env = config['environment']
    require(isinstance(env, dict) and set(env) <= allowed and {'HOME', 'PATH', 'TMPDIR'} <= set(env))
    require(all(isinstance(v, str) and '\0' not in v and len(v) <= 8192 for v in env.values()))
    node = str(exact_path(config['nodeExecutable']))
    node_info = os.stat(node, follow_symlinks=False)
    require(stat.S_ISREG(node_info.st_mode) and node_info.st_mode & 0o022 == 0 and sha(regular(node, 268435456, private=False)) == config['nodeDigest'])
    gate = lock(config['launcherLockFile'], shared=True)
    try:
        current = pointer(private_json(config['pointerFile']), config)
        require(current['schemaDigest'] == config['schemaDigest'])
        bundle, native = device_files(current, config)
        require(private_json(config['pointerFile']) == current)
        os.set_inheritable(gate, True)
        os.execve(node, [node, bundle, '--config', native], env)
    finally:
        os.close(gate)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"event":"release_launcher_rejected"}', file=sys.stderr)
        sys.exit(111)
