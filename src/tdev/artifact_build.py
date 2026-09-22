"""Native build acquisition/capture. No controller credentials or mutable task environment.

Same UID, not a sandbox. A pinned executable is not its entire dynamic toolchain.
"""
import hashlib
import json
import os
import platform
import shutil
import stat
import sys
import urllib.request
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, path, require

OUTPUT_LIMIT = 64 * 1024 * 1024
INPUT_LIMIT = 64 * 1024 * 1024
FILE_LIMIT = 4096
MANIFEST_LIMIT = 1024 * 1024


def host_platform():
    android = hasattr(sys, 'getandroidapilevel')
    return {'os': 'android' if android else platform.system().lower(), 'arch': platform.machine(),
            'abi': 'bionic' if android else (platform.libc_ver()[0] or 'unknown')}


def file_info(filename, remaining, destination=None):
    require(stat.S_ISREG(Path(filename).lstat().st_mode), 'ARTIFACT_FILE_TYPE')
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'ARTIFACT_FILE_TYPE')
        require(info.st_size <= remaining, 'ARTIFACT_SIZE_LIMIT')
        hashed, size = hashlib.sha256(), 0
        output = open(destination, 'xb') if destination is not None else None
        try:
            while data := stream.read(min(1024 * 1024, remaining - size + 1)):
                size += len(data)
                require(size <= remaining, 'ARTIFACT_SIZE_LIMIT')
                hashed.update(data)
                if output:
                    output.write(data)
            require(size == info.st_size and os.fstat(stream.fileno()).st_mtime_ns == info.st_mtime_ns,
                    'ARTIFACT_FILE_CHANGED')
            if output:
                output.flush()
                os.fchmod(output.fileno(), 0o755 if info.st_mode & 0o111 else 0o644)
                os.fsync(output.fileno())
        finally:
            if output:
                output.close()
    return {'mode': '100755' if info.st_mode & 0o111 else '100644', 'sha256': hashed.hexdigest(), 'size': size}


def verify_tools(recipe, search_path):
    require(any(t['name'] == 'sh' for t in recipe['build']['tools']), 'ARTIFACT_SHELL_REQUIRED', 'Pin the native command shell as well as declared build tools')
    require(recipe['build']['platform'] == host_platform(), 'ARTIFACT_BUILD_PLATFORM')
    for tool in recipe['build']['tools']:
        executable = shutil.which(tool['name'], path=search_path)
        require(executable is not None, 'ARTIFACT_TOOL_MISSING', tool['name'])
        # Installed tool symlinks are resolved; output/input symlinks are never followed.
        info = file_info(Path(executable).resolve(strict=True), 256 * 1024 * 1024)
        require(info['sha256'] == tool['sha256'], 'ARTIFACT_TOOL_CHANGED', tool['name'])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Fault('ARTIFACT_DEPENDENCY_REDIRECT', 'Pin a final public HTTPS URL; redirects are not followed')


def acquire(recipe, root, limits=None):
    input_limit = (limits or {}).get("inputBytes", INPUT_LIMIT)
    root.mkdir(mode=0o700)
    # No ambient proxy/auth handlers, cookies, netrc, or redirected credentials.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    total = 0
    for entry in recipe['dependencies']:
        target = root / entry['name']
        hashed = hashlib.sha256()
        try:
            with opener.open(entry['url'], timeout=20) as response, open(target, 'xb') as output:
                require(response.status == 200, 'ARTIFACT_DEPENDENCY_HTTP')
                while data := response.read(min(1024 * 1024, input_limit - total + 1)):
                    total += len(data)
                    require(total <= input_limit, 'ARTIFACT_INPUT_LIMIT')
                    hashed.update(data)
                    output.write(data)
                output.flush()
                os.fsync(output.fileno())
            require(hashed.hexdigest() == entry['sha256'], 'ARTIFACT_DEPENDENCY_CHANGED', entry['name'])
        except Fault:
            raise
        except Exception:
            # Never include request/response text that might contain an unexpected secret.
            raise Fault('ARTIFACT_DEPENDENCY_UNAVAILABLE', entry['name']) from None
        target.chmod(0o400)


def prepare_child(job, binding, env, limits=None):
    verify_tools(binding['recipe'], env['PATH'])
    acquire(binding['recipe'], job / 'inputs', limits)
    (job / 'build').mkdir(mode=0o700)
    env.update(TDEV_INPUT_DIR=str(job / 'inputs'), TDEV_BUILD_DIR=str(job / 'build'),
               PYTHONDONTWRITEBYTECODE='1')
    # Recheck after acquisition, immediately before dispatching the recipe.
    verify_tools(binding['recipe'], env['PATH'])


def walk_files(root):
    require(root.is_dir() and not root.is_symlink(), 'ARTIFACT_STORAGE_MISSING')
    names, count = [], 0
    for base, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            count += 1
            require(count <= FILE_LIMIT * 2, 'ARTIFACT_FILE_LIMIT')
            filename = Path(base) / name
            mode = filename.lstat().st_mode
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), 'ARTIFACT_FILE_TYPE')
            relative = filename.relative_to(root).as_posix()
            path(relative)
            require(len(relative.encode()) <= 1024, 'ARTIFACT_PATH')
        names.extend((Path(base) / name).relative_to(root).as_posix() for name in files)
    require(len(names) <= FILE_LIMIT, 'ARTIFACT_FILE_LIMIT')
    return sorted(names)


def sync_tree(root):
    for base, _, _ in os.walk(root, topdown=False):
        fd = os.open(base, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def dependency_files(recipe, root, destination=None):
    require(walk_files(root) == sorted(d['name'] for d in recipe['dependencies']), 'ARTIFACT_INPUT_MISMATCH')
    total = 0
    for entry in recipe['dependencies']:
        info = file_info(root / entry['name'], INPUT_LIMIT - total,
                         destination / entry['name'] if destination else None)
        total += info['size']
        require(info['sha256'] == entry['sha256'], 'ARTIFACT_DEPENDENCY_CHANGED')


def capture(job, binding, initial, limits=None):
    output_limit = (limits or {}).get("outputBytes", OUTPUT_LIMIT)
    file_limit = (limits or {}).get("files", FILE_LIMIT)
    source, staging = job / 'work', job / 'artifact-staging'
    staging.mkdir(mode=0o700)
    files_root, inputs_root = staging / 'files', staging / 'inputs'
    files_root.mkdir(mode=0o700); inputs_root.mkdir(mode=0o700)
    exports = binding['recipe']['exports']
    # Ignore only the runner's .git. All other new files must be declared exports;
    # recipes have a separate TDEV_BUILD_DIR for intermediates.
    known = {f['path'] for f in initial}
    files, total, count = {}, 0, 0
    for base, dirs, names in os.walk(source, followlinks=False):
        if Path(base) == source:
            dirs[:] = [d for d in dirs if d != '.git']
        for name in dirs + names:
            filename = Path(base) / name
            relative = filename.relative_to(source).as_posix()
            mode = filename.lstat().st_mode
            count += 1
            require(count <= FILE_LIMIT * 2, 'ARTIFACT_FILE_LIMIT')
            if stat.S_ISDIR(mode):
                require(relative in known or any(k.startswith(relative + '/') for k in known)
                        or any(relative == e or relative.startswith(e + '/') or e.startswith(relative + '/') for e in exports),
                        'ARTIFACT_UNDECLARED_OUTPUT', relative)
                continue
            selected = any(relative == e or relative.startswith(e + '/') for e in exports)
            require(relative in known or selected, 'ARTIFACT_UNDECLARED_OUTPUT', relative)
            if not selected:
                continue
            path(relative)
            require(len(relative.encode()) <= 1024, 'ARTIFACT_PATH')
            target = files_root / relative
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            files[relative] = file_info(filename, output_limit - total, target)
            total += files[relative]['size']
            require(len(files) <= file_limit, 'ARTIFACT_FILE_LIMIT')
    require(all(any(n == e or n.startswith(e + '/') for n in files) for e in exports), 'ARTIFACT_EXPORT_MISSING')
    # Detect aliases independently of the controller's later contract verification.
    aliases = {}
    for name in files:
        components = name.split('/')
        for i in range(1, len(components) + 1):
            prefix = '/'.join(components[:i])
            require(aliases.get(prefix.casefold(), prefix) == prefix, 'ARTIFACT_PATH_COLLISION')
            aliases[prefix.casefold()] = prefix
    dependency_files(binding['recipe'], job / 'inputs', inputs_root)
    manifest = {'format': 1, 'source': binding['source'], 'recipe': binding['recipe'], 'files': files}
    require(len(canonical(manifest)) <= MANIFEST_LIMIT, 'ARTIFACT_MANIFEST_LIMIT')
    atomic_write(staging / 'manifest.json', canonical(manifest))
    sync_tree(staging)
    os.rename(staging, job / 'artifact')
    fd = os.open(job, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return digest(manifest)


def verify_storage(root, expected):
    require(not root.is_symlink(), 'ARTIFACT_STORAGE_TYPE')
    require(sorted(p.name for p in root.iterdir()) == ['files', 'inputs', 'manifest.json'], 'ARTIFACT_STORAGE_CHANGED')
    file_info(root / 'manifest.json', MANIFEST_LIMIT)
    manifest = json.loads((root / 'manifest.json').read_bytes())
    require(digest(manifest) == expected, 'ARTIFACT_MANIFEST_CHANGED')
    require(walk_files(root / 'files') == sorted(manifest['files']), 'ARTIFACT_FILES_CHANGED')
    total = 0
    for name, expected_file in manifest['files'].items():
        path(name)
        actual = file_info(root / 'files' / name, OUTPUT_LIMIT - total)
        total += actual['size']
        require(actual == expected_file, 'ARTIFACT_BYTES_CHANGED')
    dependency_files(manifest['recipe'], root / 'inputs')
    return manifest
