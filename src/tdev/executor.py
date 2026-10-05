"""Bounded source primitives and the optional adopted OCI outer executor.

Native execution reuses the pack/capture primitives. The standalone RPC role is
delivered by authenticated, host-key-pinned SSH; spool receipts stay outside OCI.
"""
import base64
from contextlib import nullcontext
import fcntl
import hashlib
import io
import json
import os
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from pathlib import Path

SOURCE_LIMIT = 512 * 1024 * 1024
PACK_LIMIT = 1024 * 1024 * 1024
METADATA_LIMIT = 48 * 1024 * 1024
SOURCE_FILES = 100000
LOG_LIMIT = 1024 * 1024


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else encoded(value)).hexdigest()


def save(filename, value):
    data = encoded(value)
    fd, temp = tempfile.mkstemp(prefix=".write-", dir=filename.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, filename)
        fd = os.open(filename.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def safe_path(name):
    if not isinstance(name, str) or not name or len(name.encode()) > 4096 or "\\" in name or any(ord(c) < 32 for c in name):
        raise ValueError("PATH")
    if any(p in ("", ".", "..") or p.lower().rstrip(" .") == ".git" for p in name.split("/")):
        raise ValueError("PATH")
    return name


def safe_link(name, target):
    if target.startswith("/") or "\\" in target or any(ord(c) < 32 for c in target):
        raise ValueError("SYMLINK")
    parts = name.split("/")[:-1]
    for p in target.split("/"):
        if p == "..":
            if not parts:
                raise ValueError("SYMLINK")
            parts.pop()
        elif p not in ("", "."):
            parts.append(p)
    if any(p.lower() == ".git" for p in parts):
        raise ValueError("SYMLINK")


def engine(args, timeout=30, check=True):
    result = subprocess.run(["podman", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, env={k: v for k, v in os.environ.items()
                                                if k in ("PATH", "HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS")})
    if check and result.returncode:
        raise RuntimeError("ENGINE")
    return result


def preflight(image):
    if not re.fullmatch(r"[A-Za-z0-9_./:-]+@sha256:[0-9a-f]{64}", image):
        raise ValueError("PINNED_IMAGE_REQUIRED")
    info = json.loads(engine(["info", "--format=json"]).stdout)
    host = info["host"]
    if not (host["security"]["rootless"] and host["security"]["seccompEnabled"]
            and host["cgroupVersion"] == "v2" and {"cpu", "memory", "pids"} <= set(host["cgroupControllers"])):
        raise ValueError("ISOLATION_UNAVAILABLE")
    engine(["image", "exists", image])


def container_name(ident):
    if not re.fullmatch(r"[0-9a-f]{32}", ident):
        raise ValueError("IDENTITY")
    return "tdev-" + ident


def inspect(ident, expected):
    name = container_name(ident)
    present = engine(["container", "exists", name], check=False)
    if present.returncode == 1:
        return None
    if present.returncode:
        raise RuntimeError("OBSERVATION_UNKNOWN")
    data = json.loads(engine(["inspect", name]).stdout)[0]
    if data["Config"]["Labels"].get("tdev.input") != expected:
        raise ValueError("IDENTITY")
    return data["State"]


def arguments(ident, payload, source, image, network_policy=None):
    network = "none"
    if payload["network"] == "internet":
        if not network_policy or sha(network_policy) != payload.get("networkPolicyDigest") or not re.fullmatch(r"[0-9a-f]{64}", network_policy.get("qualificationDigest", "")):
            raise ValueError("NETWORK_UNQUALIFIED")
        network = network_policy.get("network", "")
        if not re.fullmatch(r"tdev-[A-Za-z0-9_-]+", network):
            raise ValueError("NETWORK_UNQUALIFIED")
    elif payload["network"] != "none":
        raise ValueError("NETWORK_UNQUALIFIED")
    return ["run", "--detach", "--name=" + container_name(ident),
            "--label=tdev.input=" + sha(payload), "--pull=never", "--read-only",
            "--read-only-tmpfs=false", "--http-proxy=false", "--unsetenv-all",
            "--image-volume=ignore", "--health-cmd=none", "--restart=no", "--systemd=false",
            "--cap-drop=ALL", "--security-opt=no-new-privileges", "--network=" + network,
            "--pid=private", "--ipc=private", "--uts=private", "--cgroupns=private",
            "--userns=keep-id", "--cgroups=enabled", "--memory=512m", "--memory-swap=512m",
            "--pids-limit=128", "--cpus=1", "--timeout=" + str(payload["timeout"] + 60),
            "--tmpfs=/work:rw,nosuid,nodev,size=" + str(payload.get("artifactLimits", {}).get("workingBytes", 128 * 1024 * 1024)) + ",mode=1777",
            "--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777",
            "--mount=type=bind,src=" + str(source) + ",dst=/input,ro=true",
            "--log-driver=k8s-file", "--log-opt=max-size=1m",
            "--entrypoint=/usr/bin/env", image, "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
            "HOME=/tmp", "/bin/sh", "-c", "while :; do sleep 1; done"]


def materialize(files, root):
    root.mkdir(mode=0o700)
    total, names = 0, set()
    # Validate full topology before writing/following anything.
    for f in files:
        name = safe_path(f["path"])
        if name in names or f["mode"] not in ("100644", "100755", "120000"):
            raise ValueError("SOURCE")
        names.add(name)
    for name in names:
        if any("/".join(name.split("/")[:i]) in names for i in range(1, len(name.split("/")))):
            raise ValueError("TOPOLOGY")
    for f in files:
        data = base64.b64decode(f["data"], validate=True)
        total += len(data)
        capacity_check('sourceFileBytes', SOURCE_LIMIT, len(data))
        capacity_check('sourceBytes', SOURCE_LIMIT, total)
        p = root / f["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        if f["mode"] == "120000":
            target = data.decode()
            safe_link(f["path"], target)
            p.symlink_to(target)
        else:
            p.write_bytes(data)
            p.chmod(0o755 if f["mode"] == "100755" else 0o644)


def prepare_git(source, payload):
    """Credential-free private shallow metadata at the exact checkpoint OID."""
    checkpoint = payload["checkpoint"]
    if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", checkpoint):
        raise ValueError("CHECKPOINT")
    env = {"PATH": os.environ["PATH"], "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
    def git(*args, data=None):
        return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", str(source), *args],
                              input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, check=True).stdout
    git("init", "--template=", "--object-format=" + ("sha1" if len(checkpoint) == 40 else "sha256"))
    pack = base64.b64decode(payload["gitPack"], validate=True)
    capacity_check('packBytes', PACK_LIMIT, len(pack))
    git("index-pack", "--stdin", data=pack)
    (source / ".git/shallow").write_text(checkpoint + "\n")
    git("update-ref", "refs/heads/task", checkpoint)
    git("symbolic-ref", "HEAD", "refs/heads/task")
    git("reset", "--mixed", checkpoint)


def capacity_check(budget, configured, observed):
    if observed > configured:
        raise ValueError(f'budget={budget} configured={configured} observed={observed}')


def file_digest(stream):
    stream.seek(0)
    result = hashlib.file_digest(stream, 'sha256').hexdigest()
    stream.seek(0)
    return result


def copy_source(stream, target, descriptor):
    size = descriptor['size']
    if descriptor.get('format') != 'git-pack' or type(size) is not int or size < 0 or not isinstance(descriptor.get('digest'), str) or not re.fullmatch(r'[0-9a-f]{64}', descriptor['digest']):
        raise ValueError('SOURCE_DESCRIPTOR')
    capacity_check('packBytes', PACK_LIMIT, size)
    fingerprint, observed = hashlib.sha256(), 0
    with (os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') if target is not None else nullcontext(None)) as output:
        while observed < size:
            chunk = stream.read(min(65536, size - observed))
            if not chunk:
                raise ValueError('SOURCE_TRANSFER_INCOMPLETE')
            if output is not None:
                output.write(chunk)
            fingerprint.update(chunk)
            observed += len(chunk)
        if fingerprint.hexdigest() != descriptor['digest'] or stream.read(1):
            raise ValueError('SOURCE_TRANSFER_DIGEST')
        output.flush()
        os.fsync(output.fileno())
    parent = os.open(Path(target).parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def source_utility(argv, output, input_file=None, limit=METADATA_LIMIT, timeout=300, env=None):
    if argv and Path(argv[0]).name == 'git':
        argv = [argv[0], '-c', 'core.bigFileThreshold=1m', '-c', 'core.packedGitWindowSize=1m',
                '-c', 'core.packedGitLimit=16m', '-c', 'core.deltaBaseCacheLimit=16m', *argv[1:]]
    """Only regular-file input and bounded pipe-to-file output, without source buffers."""
    proc = subprocess.Popen(argv, stdin=input_file or subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=env, start_new_session=True)
    selector, errors = selectors.DefaultSelector(), bytearray()
    selector.register(proc.stdout, selectors.EVENT_READ, True)
    selector.register(proc.stderr, selectors.EVENT_READ, False)
    observed, deadline = 0, time.monotonic() + timeout
    completed = False
    try:
        while selector.get_map():
            left = deadline - time.monotonic()
            if left <= 0:
                raise ValueError(f'budget=sourceUtilitySeconds configured={timeout} observed={timeout}')
            for key, _ in selector.select(min(left, .25)):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                elif key.data:
                    observed += len(chunk)
                    capacity_check('sourceTransferBytes', limit, observed)
                    output.write(chunk)
                else:
                    capacity_check('utilityDiagnosticBytes', METADATA_LIMIT, len(errors) + len(chunk))
                    errors.extend(chunk)
        code = proc.wait(timeout=max(.01, deadline - time.monotonic()))
        completed = True
        return code
    finally:
        if not completed:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
        selector.close()
        proc.stdout.close()
        proc.stderr.close()


def source_manifest(files, checkpoint):
    if not isinstance(checkpoint, str) or not re.fullmatch(r'(?:[0-9a-f]{40}|[0-9a-f]{64})', checkpoint):
        raise ValueError('SOURCE_MANIFEST')
    length = len(checkpoint)
    names, total = set(), 0
    capacity_check('sourceFiles', SOURCE_FILES, len(files))
    for entry in files:
        name = safe_path(entry['path'])
        if name in names or entry['mode'] not in ('100644', '100755', '120000'):
            raise ValueError('SOURCE_MANIFEST')
        size = entry['size']
        if type(size) is not int or size < 0 or not re.fullmatch('[0-9a-f]{' + str(length) + '}', entry['blob']):
            raise ValueError('SOURCE_MANIFEST')
        capacity_check('sourceFileBytes', SOURCE_LIMIT, size)
        total += size
        capacity_check('sourceBytes', SOURCE_LIMIT, total)
        names.add(name)
    for name in names:
        if any('/'.join(name.split('/')[:i]) in names for i in range(1, len(name.split('/')))):
            raise ValueError('TOPOLOGY')
    return files


class BlobMaterializer:
    """Parse cat-file's framing incrementally; retain at most a header or link target."""
    def __init__(self, root, files):
        self.root, self.files = root, iter(files)
        self.header, self.entry, self.left, self.output, self.link = bytearray(), None, 0, None, None
        self.separator = False
        self.completed = 0

    def write(self, chunk):
        at = 0
        while at < len(chunk):
            if self.separator:
                if chunk[at] != 10:
                    raise ValueError('GIT_BLOB_FRAME')
                at += 1
                self.separator = False
            elif self.entry is None:
                newline = chunk.find(b'\n', at)
                end = len(chunk) if newline < 0 else newline
                self.header.extend(chunk[at:end])
                if len(self.header) > 128:
                    raise ValueError('GIT_BLOB_FRAME')
                at = end if newline < 0 else end + 1
                if newline < 0:
                    break
                oid, kind, size = self.header.split()
                self.header.clear()
                self.entry = next(self.files)
                if oid.decode() != self.entry['blob'] or kind != b'blob' or int(size) != self.entry['size']:
                    raise ValueError('GIT_BLOB_FRAME')
                self.left = int(size)
                target = self.root / self.entry['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                if self.entry['mode'] == '120000':
                    capacity_check('sourceLinkBytes', 4096, self.left)
                    self.link = bytearray()
                else:
                    self.output = target.open('xb')
                if not self.left:
                    self.finish()
            else:
                end = min(len(chunk), at + self.left)
                data = chunk[at:end]
                if self.link is not None:
                    self.link.extend(data)
                else:
                    self.output.write(data)
                self.left -= len(data)
                at = end
                if not self.left:
                    self.finish()

    def finish(self):
        target = self.root / self.entry['path']
        if self.link is not None:
            link = self.link.decode('utf8')
            safe_link(self.entry['path'], link)
            target.symlink_to(link)
        else:
            self.output.close()
            target.chmod(0o755 if self.entry['mode'] == '100755' else 0o644)
        self.output, self.link, self.entry = None, None, None
        self.separator = True
        self.completed += 1

    def close(self):
        if self.output:
            self.output.close()


def materialize_source(root, payload, pack_path):
    files = source_manifest(payload['files'], payload['checkpoint'])
    root.mkdir(mode=0o700)
    env = {'PATH': os.environ['PATH'], 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
           'GIT_ATTR_NOSYSTEM': '1'}
    git = ['git', '-c', 'core.hooksPath=/dev/null', '-c', 'core.bigFileThreshold=1m', '-C', str(root)]
    sink = io.BytesIO()
    if source_utility(git + ['init', '--template=', '--object-format=' + ('sha1' if len(payload['checkpoint']) == 40 else 'sha256')], sink, env=env):
        raise ValueError('GIT_INIT')
    with open(pack_path, 'rb') as stream:
        if file_digest(stream) != payload['gitPack']['digest'] or os.fstat(stream.fileno()).st_size != payload['gitPack']['size']:
            raise ValueError('SOURCE_TRANSFER_DIGEST')
        sink = io.BytesIO()
        if source_utility(git + ['index-pack', '--stdin'], sink, input_file=stream, env=env):
            raise ValueError('GIT_PACK')
    checkpoint = payload['checkpoint']
    (root / '.git/shallow').write_text(checkpoint + '\n')
    for args in (['update-ref', 'refs/heads/task', checkpoint], ['symbolic-ref', 'HEAD', 'refs/heads/task'], ['reset', '--mixed', checkpoint]):
        if source_utility(git + args, io.BytesIO(), env=env):
            raise ValueError('GIT_CHECKPOINT')
    listing = io.BytesIO()
    if source_utility(git + ['ls-tree', '-rlz', checkpoint], listing, env=env):
        raise ValueError('GIT_TREE')
    actual = []
    for record in listing.getvalue().split(b'\0'):
        if record:
            meta, name = record.split(b'\t', 1)
            mode, kind, oid, size = meta.decode().split()
            if kind != 'blob':
                raise ValueError('UNSUPPORTED_GITLINK')
            actual.append({'path': name.decode(), 'mode': mode, 'blob': oid, 'size': int(size)})
    if sorted(actual, key=lambda f: f['path']) != sorted(files, key=lambda f: f['path']):
        raise ValueError('SOURCE_MANIFEST')
    with tempfile.TemporaryFile(dir=root.parent) as listing_file:
        for entry in files:
            listing_file.write((entry['blob'] + '\n').encode())
        listing_file.seek(0)
        sink = BlobMaterializer(root, files)
        try:
            if source_utility(git + ['cat-file', '--batch'], sink, input_file=listing_file,
                              limit=PACK_LIMIT, env=env):
                raise ValueError('GIT_BLOB')
            if sink.entry is not None or sink.header or sink.separator or sink.completed != len(files):
                raise ValueError('GIT_BLOB_FRAME')
        finally:
            sink.close()


class BlobHashReader:
    def __init__(self, stream, size, checkpoint):
        self.stream = stream
        self.hash = hashlib.sha1() if len(checkpoint) == 40 else hashlib.sha256()
        self.hash.update(f'blob {size}\0'.encode())
        self.size, self.seen = size, 0

    def read(self, count=-1):
        chunk = self.stream.read(min(65536, self.size - self.seen) if count < 0 else min(count, self.size - self.seen))
        self.seen += len(chunk)
        self.hash.update(chunk)
        return chunk


def captured_source(root, payload, ignore, target):
    """Stopped source -> bounded owned tar plus content identities, never body JSON."""
    initial = {entry['path'] for entry in payload['files']}
    extras, readonly = payload['capturePaths'], payload['readonly']
    checkpoint = payload['checkpoint']
    files, total = [], 0
    fingerprint = hashlib.sha256()
    class Sink:
        seen = 0
        def write(self, chunk):
            self.seen += len(chunk)
            capacity_check('captureTransferBytes', PACK_LIMIT, self.seen)
            fingerprint.update(chunk)
            if output is not None:
                output.write(chunk)
    with (os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') if target is not None else nullcontext(None)) as output:
        sink = Sink()
        with tarfile.open(fileobj=sink, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            for base, dirs, names in os.walk(root, followlinks=False):
                if Path(base) == root:
                    dirs[:] = [d for d in dirs if d != '.git']
                    names = [n for n in names if n != '.git']
                links = [d for d in dirs if (Path(base) / d).is_symlink()]
                dirs[:] = [d for d in dirs if d not in links]
                for name in sorted(names + links):
                    filename = Path(base) / name
                    relative = safe_path(str(filename.relative_to(root)))
                    if readonly and relative not in initial:
                        continue
                    if relative not in initial and not any(relative == p or relative.startswith(p + '/') for p in extras):
                        code = source_utility(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null',
                                              '-C', str(ignore), 'check-ignore', '--no-index', '--', relative], io.BytesIO(),
                                              env={'PATH': os.environ['PATH'], 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull})
                        if code == 0:
                            continue
                        if code != 1:
                            raise ValueError('IGNORE_CHECK')
                    before = filename.lstat()
                    info = tarfile.TarInfo(relative)
                    if stat.S_ISLNK(before.st_mode):
                        link = os.readlink(filename)
                        safe_link(relative, link)
                        data, mode = link.encode(), '120000'
                        size = len(data)
                        info.type, info.linkname = tarfile.SYMTYPE, link
                        blob = hashlib.sha1() if len(checkpoint) == 40 else hashlib.sha256()
                        blob.update(f'blob {size}\0'.encode() + data)
                        capacity_check('sourceFileBytes', SOURCE_LIMIT, size)
                        capacity_check('sourceBytes', SOURCE_LIMIT, total + size)
                        capacity_check('sourceFiles', SOURCE_FILES, len(files) + 1)
                        archive.addfile(info)
                    else:
                        if not stat.S_ISREG(before.st_mode):
                            raise ValueError('CAPTURE_TYPE')
                        size = before.st_size
                        capacity_check('sourceFileBytes', SOURCE_LIMIT, size)
                        capacity_check('sourceBytes', SOURCE_LIMIT, total + size)
                        capacity_check('sourceFiles', SOURCE_FILES, len(files) + 1)
                        mode = '100755' if before.st_mode & 0o111 else '100644'
                        info.mode, info.size = (0o755 if mode == '100755' else 0o644), size
                        fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                        with os.fdopen(fd, 'rb') as stream:
                            opened = os.fstat(stream.fileno())
                            if (opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns, before.st_ctime_ns):
                                raise ValueError('CAPTURE_CHANGED')
                            reader = BlobHashReader(stream, size, checkpoint)
                            archive.addfile(info, reader)
                            after = os.fstat(stream.fileno())
                            if reader.seen != size or (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
                                raise ValueError('CAPTURE_CHANGED')
                            blob = reader.hash
                    total += size
                    capacity_check('sourceBytes', SOURCE_LIMIT, total)
                    capacity_check('sourceFiles', SOURCE_FILES, len(files) + 1)
                    after = filename.lstat()
                    if (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns, before.st_ctime_ns):
                        raise ValueError('CAPTURE_CHANGED')
                    files.append({'path': relative, 'mode': mode, 'blob': blob.hexdigest(), 'size': size})
        if output is not None:
            output.flush()
            os.fsync(output.fileno())
    files.sort(key=lambda entry: entry['path'])
    capacity_check('sourceMetadataBytes', METADATA_LIMIT, len(encoded(files)))
    if target is not None:
        parent = os.open(Path(target).parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    return {'format': 'tar', 'size': sink.seen, 'digest': fingerprint.hexdigest(), 'files': files}


class InputPump:
    """Unbuffered nonblocking delivery, with durable intent before each input."""
    def __init__(self, root, initial):
        self.root = root
        self.pending = initial.encode()
        self.sequence = 0
        self.active = None
        self.eof = False
        self.closed = False

    def step(self, stream):
        if self.closed:
            return
        if not self.pending and self.active is None:
            control = self.root / ("stdin-" + str(self.sequence) + ".json")
            if control.exists():
                value = json.loads(control.read_bytes())
                self.active = self.sequence
                self.pending = value["text"].encode()
                self.eof = value.get("eof", False)
                save(self.root / ("delivery-" + str(self.sequence) + ".json"), {"delivery": "unknown"})
        if self.pending:
            try:
                count = os.write(stream.fileno(), self.pending)
                self.pending = self.pending[count:]
            except BlockingIOError:
                return
            except BrokenPipeError:
                self.closed = True
                return
        if self.active is not None and not self.pending:
            if self.eof:
                stream.close()
                self.closed = True
            save(self.root / ("delivery-" + str(self.active) + ".json"), {"delivery": "committed"})
            self.sequence += 1
            self.active = None


def capture_tar(stream, initial, capture_paths, ignore_root):
    """Never extract untrusted tar on host. Bound bytes and reject links/devices."""
    tracked = {f["path"] for f in initial}
    files, total, seen = [], 0, set()
    for extra in capture_paths:
        safe_path(extra)
    with tarfile.open(fileobj=stream, mode="r|*") as archive:
        for entry in archive:
            name = entry.name
            while name.startswith("./"):
                name = name[2:]
            if not name or name == "." or name == ".git" or name.startswith(".git/"):
                continue
            safe_path(name)
            if entry.isdir():
                continue
            if name in seen or not (entry.isfile() or entry.issym()):
                raise ValueError("CAPTURE_TYPE")
            seen.add(name)
            capacity_check('captureScanFiles', 250000, len(seen))
            explicit = any(name == p or name.startswith(p + "/") for p in capture_paths)
            if name not in tracked and not explicit:
                # This separate trusted directory contains the STARTING ignore files,
                # not a candidate-mutated index or config.
                ignored = subprocess.run(["git", "-c", "core.excludesFile=/dev/null", "-C", str(ignore_root),
                                          "check-ignore", "--no-index", "--", name], stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL)
                if ignored.returncode == 0:
                    continue
                if ignored.returncode != 1:
                    raise ValueError("IGNORE_CHECK")
            total += entry.size if entry.isfile() else len(entry.linkname.encode())
            capacity_check('sourceFileBytes', SOURCE_LIMIT, entry.size if entry.isfile() else len(entry.linkname.encode()))
            capacity_check('sourceBytes', SOURCE_LIMIT, total)
            if entry.issym():
                safe_link(name, entry.linkname)
                data, mode = entry.linkname.encode(), "120000"
            else:
                data = archive.extractfile(entry).read(SOURCE_LIMIT + 1)
                mode = "100755" if entry.mode & 0o111 else "100644"
            files.append({"path": name, "mode": mode, "data": base64.b64encode(data).decode()})
    return files


def capture_stream(stream, payload, ignore, target):
    """Rewrite selected paused OCI source as binary tar without host extraction."""
    tracked = {f['path'] for f in payload['files']}
    files, total, seen = [], 0, set()
    fingerprint = hashlib.sha256()
    class Header(tarfile.TarInfo):
        @classmethod
        def frombuf(cls, buf, encoding, errors):
            value = super().frombuf(buf, encoding, errors)
            if value.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK):
                capacity_check('captureHeaderBytes', 16384, value.size)
            return value
    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as output:
        class Sink:
            seen = 0
            def write(self, chunk):
                self.seen += len(chunk)
                capacity_check('captureTransferBytes', PACK_LIMIT, self.seen)
                fingerprint.update(chunk)
                output.write(chunk)
        sink = Sink()
        with tarfile.open(fileobj=stream, mode='r|', tarinfo=Header) as source, tarfile.open(fileobj=sink, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            for entry in source:
                name = entry.name
                while name.startswith('./'):
                    name = name[2:]
                if name in ('', '.', '.git') or name.startswith('.git/'):
                    continue
                safe_path(name)
                if entry.isdir():
                    continue
                if name in seen or not (entry.isfile() or entry.issym()):
                    raise ValueError('CAPTURE_TYPE')
                seen.add(name)
                capacity_check('captureScanFiles', 250000, len(seen))
                explicit = any(name == p or name.startswith(p + '/') for p in payload['capturePaths'])
                if name not in tracked and not explicit:
                    code = source_utility(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null', '-C', str(ignore), 'check-ignore', '--no-index', '--', name], io.BytesIO(), env={'PATH': os.environ['PATH'], 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull})
                    if code == 0:
                        continue
                    if code != 1:
                        raise ValueError('IGNORE_CHECK')
                size = entry.size if entry.isfile() else len(entry.linkname.encode())
                capacity_check('sourceFileBytes', SOURCE_LIMIT, size)
                total += size
                capacity_check('sourceBytes', SOURCE_LIMIT, total)
                capacity_check('sourceFiles', SOURCE_FILES, len(files) + 1)
                info = tarfile.TarInfo(name)
                if entry.issym():
                    safe_link(name, entry.linkname)
                    info.type, info.linkname = tarfile.SYMTYPE, entry.linkname
                    blob = hashlib.sha1() if len(payload['checkpoint']) == 40 else hashlib.sha256()
                    blob.update(f'blob {size}\0'.encode() + entry.linkname.encode())
                    archive.addfile(info)
                    mode = '120000'
                else:
                    info.size, info.mode = size, 0o755 if entry.mode & 0o111 else 0o644
                    reader = BlobHashReader(source.extractfile(entry), size, payload['checkpoint'])
                    archive.addfile(info, reader)
                    if reader.seen != size:
                        raise ValueError('CAPTURE_CHANGED')
                    blob, mode = reader.hash, '100755' if entry.mode & 0o111 else '100644'
                files.append({'path': name, 'mode': mode, 'blob': blob.hexdigest(), 'size': size})
        output.flush()
        os.fsync(output.fileno())
    files.sort(key=lambda f: f['path'])
    capacity_check('sourceMetadataBytes', METADATA_LIMIT, len(encoded(files)))
    return {'format': 'tar', 'size': sink.seen, 'digest': fingerprint.hexdigest(), 'files': files}


def capture_process(copier, initial, capture_paths, ignore, timeout=300, payload=None, target=None):
    # The deadline covers reading the pipe, not only wait() after tar parsing.
    # A stalled engine must not strand the task in capture forever.
    expired = threading.Event()
    def stop():
        expired.set()
        copier.kill()
    timer = threading.Timer(timeout, stop)
    timer.daemon = True
    timer.start()
    try:
        files = (capture_stream(copier.stdout, payload, ignore, target) if payload is not None
                 else capture_tar(copier.stdout, initial, capture_paths, ignore))
        code = copier.wait(timeout=timeout)
        if expired.is_set() or code:
            raise RuntimeError("CAPTURE")
        return files
    finally:
        timer.cancel()
        timer.join()
        copier.stdout.close()
        if copier.poll() is None:
            copier.kill()
            copier.wait()


def worker(spool, image, ident):
    root = Path(spool) / ident
    with open(root / "worker.lock", "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        payload = json.loads((root / "request.json").read_bytes())
        hashed = sha(payload)
        result = {"id": ident, "inputDigest": hashed, "terminal": True, "stopped": False,
                  "exitCode": None, "cancelled": False, "timedOut": False}
        name = container_name(ident)
        launched = False
        try:
            preflight(image)
            if (root / "cancel.json").exists():
                result["cancelled"] = True
                result["stopped"] = True
                result["captureError"] = "CANCELLED_BEFORE_LAUNCH"
                return
            source = root / "source"
            if isinstance(payload.get('gitPack'), dict):
                materialize_source(source, payload, root / 'source.pack')
            else:
                materialize(payload["files"], source)
                prepare_git(source, payload)
            # Ignore rules are regular data, never candidate executable code.
            ignore = root / "ignore"
            ignore.mkdir()
            subprocess.run(["git", "init", str(ignore)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for f in payload["files"]:
                if f["path"].split("/")[-1] == ".gitignore" and f["mode"] != "120000":
                    p = ignore / f["path"]
                    p.parent.mkdir(parents=True, exist_ok=True)
                    if isinstance(payload.get('gitPack'), dict):
                        shutil.copyfile(source / f['path'], p)
                    else:
                        p.write_bytes(base64.b64decode(f["data"]))
            policy_file = Path(spool) / "network-policy.json"
            network_policy = None
            if policy_file.exists():
                if policy_file.is_symlink() or policy_file.stat().st_mode & 0o077:
                    raise ValueError("NETWORK_POLICY_PERMISSIONS")
                network_policy = json.loads(policy_file.read_bytes())
            engine(arguments(ident, payload, source, image, network_policy), timeout=60)
            launched = True
            # /input is always read-only. Commands edit /work; validation uses /input.
            if not payload["readonly"]:
                engine(["exec", name, "/bin/sh", "-c", "cp -a /input/. /work/"], timeout=300)
            base = "/input" if payload["readonly"] else "/work"
            cwd = payload["cwd"]
            if cwd != ".":
                safe_path(cwd)
            # Image-owned Python resolves cwd before shell execution. No host paths.
            bootstrap = "import os,sys; b,c=sys.argv[1:3]; p=os.path.realpath(b+'/'+c); assert p==b or p.startswith(b+'/'); os.chdir(p); os.execv('/bin/sh',['sh','-c',sys.argv[3]])"
            argv = ["podman", "exec", "-i", name, "/usr/bin/env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/tmp", "TMPDIR=/tmp"]
            for key, value in payload["env"].items():
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or "\0" in value:
                    raise ValueError("ENV")
                argv.append(key + "=" + value)
            argv += ["python3", "-c", bootstrap, base, cwd, payload["command"]]
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            os.set_blocking(proc.stdin.fileno(), False)
            os.set_blocking(proc.stdout.fileno(), False)
            input_pump = InputPump(root, payload["stdin"])
            retained, discarded = 0, 0
            deadline = time.monotonic() + payload["timeout"]
            with open(root / "output", "wb") as log:
                while proc.poll() is None:
                    if (root / "cancel.json").exists() or time.monotonic() >= deadline:
                        result["cancelled"] = (root / "cancel.json").exists()
                        result["timedOut"] = not result["cancelled"]
                        engine(["kill", "--signal=KILL", name], check=False)
                        break
                    input_pump.step(proc.stdin)
                    try:
                        chunk = os.read(proc.stdout.fileno(), 65536)
                    except BlockingIOError:
                        chunk = b""
                    keep = chunk[:max(0, LOG_LIMIT - retained)]
                    log.write(keep)
                    log.flush()
                    retained += len(keep)
                    discarded += len(chunk) - len(keep)
                    time.sleep(.01)
                try:
                    result["exitCode"] = proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                # Drain bounded output after physical stop without trusting its text.
                while True:
                    try:
                        chunk = os.read(proc.stdout.fileno(), 65536)
                    except BlockingIOError:
                        break
                    if not chunk:
                        break
                    keep = chunk[:max(0, LOG_LIMIT - retained)]
                    log.write(keep)
                    retained += len(keep)
                    discarded += len(chunk) - len(keep)
                log.flush()
                os.fsync(log.fileno())
            proc.stdout.close()
            if not proc.stdin.closed:
                proc.stdin.close()
            result["discardedBytes"] = discarded
            state = inspect(ident, hashed)
            if not payload["readonly"] and state and state.get("Running"):
                # Freeze every container process before copying immutable capture.
                engine(["pause", name])
                copier = subprocess.Popen(["podman", "cp", name + ":/work/.", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                try:
                    if isinstance(payload.get('gitPack'), dict):
                        result['capture'] = capture_process(copier, payload['files'], payload['capturePaths'], ignore, payload=payload, target=root / 'capture.tar')
                    else:
                        result["files"] = capture_process(copier, payload["files"], payload["capturePaths"], ignore)
                finally:
                    engine(["unpause", name], check=False)
            elif not payload["readonly"]:
                result["captureError"] = "TASK_LOST_ON_STOP"
        except Exception as error:
            result.pop("files", None)
            result.pop("capture", None)
            result["captureError"] = type(error).__name__ + ":" + str(error)[:128]
        finally:
            try:
                state = inspect(ident, hashed)
                if state and state.get("Running"):
                    engine(["unpause", name], check=False)
                    engine(["kill", "--signal=KILL", name], check=False)
                state = inspect(ident, hashed)
                result["stopped"] = bool(state and not state.get("Running") and not state.get("Pid")) or (state is None and not launched)
            except Exception:
                result["stopped"] = False
            save(root / "result.json", result)


def rpc(spool, image, request, source=None):
    root = Path(spool)
    if not root.is_absolute() or "," in str(root) or ":" in str(root) or str(root) == "/":
        raise ValueError("SPOOL")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.stat().st_mode & 0o077 or root.is_symlink():
        raise ValueError("SPOOL_PERMISSIONS")
    action = request["action"]
    ident = request["payload"]["id"] if action == "submit" else request["id"]
    container_name(ident)
    job = root / ident
    # Slow cancellation/observation for one job must not fence other tasks.
    with open(root / (ident + ".lock"), "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == "submit":
            payload = request["payload"]
            if job.exists():
                if (job / "retired.json").exists():
                    if json.loads((job / "retired.json").read_bytes())["inputDigest"] != sha(payload):
                        raise ValueError("IDEMPOTENCY_MISMATCH")
                    return {"accepted": True, "retired": True}
                if not (job / "request.json").exists():
                    return {"error": "RESERVATION_UNKNOWN", "effect": "unknown"}
                if sha(json.loads((job / "request.json").read_bytes())) != sha(payload):
                    raise ValueError("IDEMPOTENCY_MISMATCH")
                return {"accepted": True}
            job.mkdir(mode=0o700)
            if isinstance(payload.get('gitPack'), dict):
                if source is None:
                    raise ValueError('SOURCE_TRANSFER_REQUIRED')
                copy_source(source, job / 'source.pack', payload['gitPack'])
            save(job / "request.json", payload)
            # Crash here yields unknown, never a duplicate launch on retry.
            with open(job / "outer.log", "ab") as log:
                subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "worker", str(root), image, ident],
                                 stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            return {"accepted": True}
        if not job.exists():
            return {"error": "RUN_NOT_FOUND", "effect": "unknown"}
        if action == "observe":
            return json.loads((job / "result.json").read_bytes()) if (job / "result.json").exists() else {"terminal": False}
        if action == "logs":
            offset, limit = request["offset"], request["limit"]
            if type(offset) is not int or offset < 0 or type(limit) is not int or not 0 < limit <= 65536:
                raise ValueError("CURSOR")
            if not (job / "output").exists():
                data = b""
                available = 0
            else:
                with open(job / "output", "rb") as stream:
                    available = os.fstat(stream.fileno()).st_size
                    stream.seek(offset)
                    data = stream.read(min(limit, max(0, available - offset)))
            controls = sorted(int(p.stem.split("-")[1]) for p in job.glob("stdin-*.json"))
            deliveries = []
            for sequence in controls[-16:]:
                receipt = job / ("delivery-" + str(sequence) + ".json")
                state = json.loads(receipt.read_bytes())["delivery"] if receipt.exists() else "queued"
                deliveries.append({"sequence": sequence, "delivery": state})
            return {"offset": offset, "nextOffset": offset + len(data), "availableBytes": available, "encoding": "base64", "data": base64.b64encode(data).decode(),
                    "stdin": {"nextSequence": len(controls), "deliveries": deliveries}}
        control_id = request["controlId"]
        container_name(control_id)
        record = job / ("control-" + control_id + ".json")
        if action == "control_status":
            if record.exists():
                return {"known": True, "result": json.loads(record.read_bytes())["result"]}
            for control in job.glob("stdin-*.json"):
                value = json.loads(control.read_bytes())
                if value.get("_controlId") == control_id:
                    return {"known": True, "result": {"delivery": "queued", "nextSequence": value["sequence"] + 1}}
            return {"known": False}
        if record.exists():
            saved = json.loads(record.read_bytes())
            if saved["hash"] != sha(request):
                raise ValueError("IDEMPOTENCY_MISMATCH")
            return saved["result"]
        if action == "retire":
            result_file = job / "result.json"
            if not result_file.exists():
                raise ValueError("STOP_PROOF_REQUIRED")
            result = json.loads(result_file.read_bytes())
            if result.get("stopped") is not True:
                raise ValueError("STOP_PROOF_REQUIRED")
            state = inspect(ident, result["inputDigest"])
            if state and (state.get("Running") or state.get("Pid")):
                raise ValueError("STOP_PROOF_REQUIRED")
            if state:
                engine(["rm", container_name(ident)])
            # Durable retirement tombstone precedes removal. Duplicate dispatch
            # still joins the original hash even after the large payload is gone.
            save(job / "retired.json", {"inputDigest": result["inputDigest"]})
            result.pop("files", None)
            result.pop("capture", None)
            save(result_file, result)
            for name in ("source", "ignore"):
                directory = job / name
                if directory.is_symlink():
                    raise ValueError("SPOOL_SYMLINK")
                if directory.exists():
                    shutil.rmtree(directory)
            for filename in ('source.pack', 'capture.tar', 'request.json'):
                (job / filename).unlink(missing_ok=True)
            result = {"retired": True}
        elif action == "cancel":
            if (job / "retired.json").exists():
                raise ValueError("PROCESS_RETIRED")
            save(job / "cancel.json", {"requested": True})
            payload = json.loads((job / "request.json").read_bytes())
            state = inspect(ident, sha(payload))
            if state and state.get("Running"):
                engine(["unpause", container_name(ident)], check=False)
                engine(["kill", "--signal=KILL", container_name(ident)], check=False)
            # If worker died, current authority may retire its resource independently.
            with open(job / "worker.lock", "a+b") as worker_lock:
                try:
                    fcntl.flock(worker_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    state = inspect(ident, sha(payload))
                    if not state or (not state.get("Running") and not state.get("Pid")):
                        if not (job / "result.json").exists():
                            save(job / "result.json", {"id": ident, "inputDigest": sha(payload), "terminal": True, "stopped": True,
                                                       "exitCode": None, "cancelled": True, "captureError": "WORKER_INTERRUPTED"})
                except BlockingIOError:
                    pass
            result = {"cancelRequested": True}
        elif action == "stdin":
            value = request["input"]
            sequence = value["sequence"]
            if type(sequence) is not int or sequence < 0 or sequence >= 1024:
                raise ValueError("STDIN_SEQUENCE")
            control = job / ("stdin-" + str(sequence) + ".json")
            previous = job / ("stdin-" + str(sequence - 1) + ".json")
            if control.exists():
                previous_value = json.loads(control.read_bytes())
                if previous_value.get("_controlId") == control_id and previous_value.get("_hash") == sha(request):
                    return {"delivery": "queued", "nextSequence": sequence + 1}
                raise ValueError("STDIN_SEQUENCE")
            if sequence > 0 and not previous.exists():
                raise ValueError("STDIN_SEQUENCE")
            if (job / "result.json").exists():
                raise ValueError("PROCESS_TERMINAL")
            save(control, {**value, "_controlId": control_id, "_hash": sha(request)})
            result = {"delivery": "queued", "nextSequence": sequence + 1}
        else:
            raise ValueError("ACTION")
        save(record, {"hash": sha(request), "result": result})
        return result


def read_exact(stream, size):
    chunks, observed = [], 0
    while observed < size:
        part = stream.read(min(65536, size - observed))
        if not part:
            raise ValueError('TRANSFER_INCOMPLETE')
        chunks.append(part)
        observed += len(part)
    return b''.join(chunks)


def stream_rpc(spool, image, incoming, outgoing):
    length = int.from_bytes(read_exact(incoming, 4), 'big')
    capacity_check('sourceMetadataBytes', METADATA_LIMIT, length)
    request = json.loads(read_exact(incoming, length))
    if request['action'] != 'capture':
        outgoing.write(encoded(rpc(spool, image, request, source=incoming)))
        return
    ident = request['id']
    container_name(ident)
    root = Path(spool)
    with open(root / (ident + '.lock'), 'a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        job = root / ident
        result = json.loads((job / 'result.json').read_bytes())
        if result.get('stopped') is not True or result.get('terminal') is not True or result.get('capture') != request['descriptor']:
            raise ValueError('CAPTURE_PROOF_REQUIRED')
        fd = os.open(job / 'capture.tar', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as body:
            metadata = os.fstat(body.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_size != request['descriptor']['size']:
                raise ValueError('CAPTURE_PROOF_REQUIRED')
            capacity_check('captureTransferBytes', PACK_LIMIT, metadata.st_size)
            frame = encoded({'capture': request['descriptor']})
            outgoing.write(len(frame).to_bytes(4, 'big') + frame)
            while chunk := body.read(65536):
                outgoing.write(chunk)


if __name__ == "__main__":
    os.umask(0o077)
    if sys.argv[1] == "worker":
        worker(*sys.argv[2:5])
    else:
        try:
            if sys.argv[1] == 'stream':
                stream_rpc(sys.argv[2], sys.argv[3], sys.stdin.buffer, sys.stdout.buffer)
                sys.exit(0)
            data = sys.stdin.buffer.read(48 * 1024 * 1024 + 1)
            capacity_check('sourceMetadataBytes', METADATA_LIMIT, len(data))
            output = rpc(sys.argv[2], sys.argv[3], json.loads(data))
        except Exception as error:
            output = {"error": type(error).__name__ + ":" + str(error)[:128], "effect": "unknown"}
        sys.stdout.buffer.write(encoded(output))
