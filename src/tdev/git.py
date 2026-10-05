import base64
import errno
import json
import os
import re
import tempfile
import hashlib
import io
import codecs
import tarfile
from contextlib import contextmanager
from pathlib import Path

from .common import Fault, canonical, decode, digest, path, require, run, atomic_write, branch_ref
from .capacity import SOURCE_BYTES, FILE_BYTES, SOURCE_FILES, PACK_BYTES, METADATA_BYTES, check


# Local upload-pack does not inherit the receiving Git command's configuration.
LOCAL_UPLOAD = ('--upload-pack=git -c core.bigFileThreshold=1m '
                '-c core.packedGitWindowSize=1m -c core.packedGitLimit=16m '
                '-c core.deltaBaseCacheLimit=16m -c pack.threads=1 '
                '-c core.hooksPath=/dev/null upload-pack')


class Git:
    def __init__(self, directory, config):
        self.root = Path(directory)
        self.config = config
        self.env = {k: os.environ[k] for k in ("PATH", "TMPDIR", "PREFIX", "HOME") if k in os.environ}
        self.env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                        GIT_TERMINAL_PROMPT="0", GIT_ATTR_NOSYSTEM="1",
                        GIT_AUTHOR_NAME="tdev", GIT_AUTHOR_EMAIL="tdev@localhost",
                        GIT_COMMITTER_NAME="tdev", GIT_COMMITTER_EMAIL="tdev@localhost")
        self.root.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not self.root.exists():
            self.identity()
            fmt = "sha1"
            if self.config["kind"] == "local":
                fmt = run(["git", "--git-dir=" + self.config["remote"], "rev-parse", "--show-object-format"], env=self.env).stdout.decode().strip()
            require(fmt in ("sha1", "sha256"), "OBJECT_FORMAT")
            # Publish only a complete bare store. A crash or concurrent first open
            # must not leave an apparently enrolled, partially initialized directory.
            with tempfile.TemporaryDirectory(prefix="objects-", dir=self.root.parent) as temporary:
                run(["git", "init", "--bare", "--template=", "--object-format=" + fmt, temporary], env=self.env)
                try:
                    os.rename(temporary, self.root)
                except OSError as error:
                    if error.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                        raise

    def call(self, *args, data=None, env=None, check=True, timeout=30,
             output=None, limit=METADATA_BYTES, budget='utilityOutputBytes'):
        command_index = 0
        while command_index < len(args) and args[command_index] == '-c':
            command_index += 2
        utility = args[command_index] if command_index < len(args) else ''
        streaming = utility in ('hash-object', 'pack-objects', 'index-pack', 'unpack-objects', 'cat-file', 'fetch')
        return run(["git", "--git-dir=" + str(self.root), "-c", "core.hooksPath=/dev/null",
                    "-c", "core.fsync=loose-object,reference", "-c", "core.fsyncMethod=fsync",
                    "-c", "gc.auto=0", *(["-c", "core.bigFileThreshold=1m"] if streaming else []), "-c", "core.packedGitWindowSize=1m",
                    "-c", "core.packedGitLimit=16m", "-c", "core.deltaBaseCacheLimit=16m", "-c", "http.followRedirects=false",
                    *(["-c", "credential.helper=!gh auth git-credential"] if self.config["kind"] == "github" else []),
                    *args], data=data, env={**self.env, **(env or {})},
                   timeout=timeout, check=check, output=output, limit=limit, budget=budget)

    def identity(self):
        c = self.config
        if c["kind"] == "local":
            try:
                p = Path(c["remote"]).resolve(strict=True)
                st = p.stat()
            except OSError:
                raise Fault('REPOSITORY_IDENTITY', 'The enrolled local repository is missing or inaccessible') from None
            require(str(p) == c["remote"], "REPOSITORY_IDENTITY")
            bare = run(["git", "--git-dir=" + str(p), "rev-parse", "--is-bare-repository"], env=self.env).stdout.strip() == b"true"
            require(bare or c.get("allowWorktree", False), "BARE_REQUIRED")
            actual = f"local:{st.st_dev}:{st.st_ino}"
        else:
            require(c["kind"] == "github" and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", c["name"]), "REPOSITORY_IDENTITY")
            require(c["remote"] == "https://github.com/" + c["name"] + ".git", "REPOSITORY_IDENTITY")
            actual = "github:" + str(json.loads(run(["gh", "api", "repos/" + c["name"]]).stdout)["id"])
        require(actual == c["identity"], "REPOSITORY_IDENTITY")
        return actual

    def allowed_ref(self, ref):
        return branch_ref(ref) and (ref in self.config['refs'] or any(
            ref.startswith(ns) for ns in self.config.get('managedRefNamespaces', [])))

    def head(self, ref, missing=False):
        self.identity()
        require(self.allowed_ref(ref), "REF_DENIED")
        if self.config["kind"] == "local":
            symbolic = run(["git", "--git-dir=" + self.config["remote"], "symbolic-ref", "-q", ref], env=self.env, check=False)
            require(symbolic.returncode != 0, "SYMBOLIC_REF")
        out = self.call("ls-remote", "--refs", "--", self.config["remote"], ref).stdout.decode().splitlines()
        if not out and missing:
            return None
        require(len(out) == 1 and out[0].split()[1] == ref, "REF_NOT_FOUND")
        return out[0].split()[0]

    def fetch(self, ref, expected):
        require(self.head(ref) == expected, "STALE_HEAD")
        # Fetch the admitted immutable source, without a shared FETCH_HEAD owner.
        # A concurrent ref fetch must not change another task's source check.
        self.fetch_objects(expected)
        require(self.call("cat-file", "-t", expected).stdout.strip() == b"commit", "COMMIT_REQUIRED")
        self.entries(expected)
        self.pin(expected)

    def fetch_objects(self, expected, *, destination=None):
        # Keeping received objects packed avoids whole loose-object mappings on
        # subsequent reads. Zero means the default, so use one, not zero.
        args = ('-c', 'fetch.unpackLimit=1', 'fetch',
                *((LOCAL_UPLOAD,) if self.config['kind'] == 'local' else ()),
                '--no-tags', '--no-write-fetch-head', '--')
        if destination is None:
            self.call(*args, self.config['remote'], expected, timeout=120)
        else:
            run(['git', '--git-dir=' + destination, '-c', 'core.hooksPath=/dev/null',
                 '-c', 'core.bigFileThreshold=1m', '-c', 'core.packedGitWindowSize=1m',
                 '-c', 'core.packedGitLimit=16m', '-c', 'core.deltaBaseCacheLimit=16m',
                 *args, str(self.root), expected], env=self.env, timeout=120)

    def pin(self, oid):
        self.call("update-ref", "refs/tdev/objects/" + oid, oid)

    def tree(self, commit):
        return self.call("rev-parse", commit + "^{tree}").stdout.decode().strip()

    def entries(self, commit):
        result, total = {}, 0
        for line in self.call("ls-tree", "-rlz", commit).stdout.split(b"\0"):
            if not line:
                continue
            meta, name = line.split(b"\t", 1)
            mode, kind, oid, size = meta.decode().split()
            name = name.decode("utf8")
            path(name)
            require(kind == "blob" and mode in ("100644", "100755", "120000"), "UNSUPPORTED_GITLINK")
            size = int(size)
            check('sourceFileBytes', FILE_BYTES, size)
            total += size
            check('sourceBytes', SOURCE_BYTES, total)
            check('sourceFiles', SOURCE_FILES, len(result) + 1)
            self.__dict__.setdefault('_sizes', {})[oid] = size
            result[name] = (mode, oid)
        return result

    def blob_size(self, oid):
        size = self.__dict__.setdefault('_sizes', {}).get(oid)
        if size is None:
            size = int(self.call("cat-file", "-s", oid).stdout)
            self._sizes[oid] = size
        check('sourceFileBytes', FILE_BYTES, size)
        return size

    def blob_to(self, oid, output):
        size = self.blob_size(oid)
        class Counted:
            received = 0
            def write(self, chunk):
                output.write(chunk)
                self.received += len(chunk)
        sink = Counted()
        self.call('cat-file', 'blob', oid, output=sink, limit=FILE_BYTES,
                  timeout=120, budget='sourceFileBytes')
        require(sink.received == size, 'GIT_OUTPUT')
        return size

    def blob(self, oid, limit=FILE_BYTES):
        check('sourceFileBytes', limit, self.blob_size(oid))
        output = io.BytesIO()
        self.blob_to(oid, output)
        return output.getvalue()

    def blob_range(self, oid, offset, count):
        class Range:
            seen = 0
            chunks = []
            kept = 0
            def write(self, chunk):
                start = min(len(chunk), max(0, offset - self.seen))
                part = chunk[start:start + max(0, count - self.kept)]
                if part:
                    self.chunks.append(part)
                self.kept += len(part)
                self.seen += len(chunk)
        output = Range()
        size = self.blob_to(oid, output)
        return size, b''.join(output.chunks)

    def hash_file(self, stream):
        stream.flush()
        size = os.fstat(stream.fileno()).st_size
        check('sourceFileBytes', FILE_BYTES, size)
        stream.seek(0)
        oid = self.call('hash-object', '-w', '--stdin', data=stream, timeout=120).stdout.decode().strip()
        require(int(self.call('cat-file', '-s', oid).stdout) == size, 'CAPTURE_CHANGED')
        self.__dict__.setdefault('_sizes', {})[oid] = size
        return oid

    def check_entries(self, entries):
        check('sourceFiles', SOURCE_FILES, len(entries))
        cache = self.__dict__.setdefault('_sizes', {})
        missing = sorted({oid for mode, oid in entries.values() if oid not in cache})
        if missing:
            listing = ''.join(oid + '\n' for oid in missing).encode()
            sizes = self.call('cat-file', '--batch-check=%(objecttype) %(objectsize)', data=listing).stdout.splitlines()
            require(len(sizes) == len(missing), 'GIT_OUTPUT')
            for oid, record in zip(missing, sizes):
                kind, size = record.split()
                require(kind == b'blob', 'GIT_OUTPUT')
                size = int(size)
                check('sourceFileBytes', FILE_BYTES, size)
                cache[oid] = size
        total = 0
        for mode, oid in entries.values():
            total += cache[oid]
            check('sourceBytes', SOURCE_BYTES, total)


    def write_tree(self, entries):
        self.check_entries(entries)
        names = set(entries)
        for name in names:
            path(name)
            parts = name.split("/")
            require(not any("/".join(parts[:i]) in names for i in range(1, len(parts))), "PATH_COLLISION")
        with tempfile.TemporaryDirectory(prefix="index-", dir=self.root) as tmp:
            env = {"GIT_INDEX_FILE": str(Path(tmp) / "index")}
            self.call("read-tree", "--empty", env=env)
            listing = b"".join(f"{mode} {oid}\t{name}".encode() + b"\0" for name, (mode, oid) in sorted(entries.items()))
            self.call("update-index", "-z", "--index-info", data=listing, env=env)
            return self.call("write-tree", env=env).stdout.decode().strip()

    def commit(self, tree, parent, message):
        oid = self.call("commit-tree", tree, "-p", parent, data=message.encode()).stdout.decode().strip()
        self.pin(oid)
        return oid

    def edit(self, checkpoint, edits, marker):
        entries = self.entries(checkpoint)
        touched = set()
        puts = {}
        for edit in edits:
            name = path(edit["path"])
            targets = [name, path(edit["to"])] if edit["action"] == "move" else [name]
            require(not touched.intersection(targets), "DUPLICATE_PATH")
            touched.update(targets)
            previous = entries.get(name)
            if "before" in edit:
                require((previous[1] if previous else None) == edit["before"], "EDIT_CONFLICT")
            action = edit["action"]
            if action == "delete":
                require(previous is not None, "EDIT_CONFLICT")
                del entries[name]
            elif action == "move":
                require(previous and edit["to"] not in entries, "EDIT_CONFLICT")
                entries[edit["to"]] = entries.pop(name)
            else:
                if action == "replace":
                    require(previous and previous[0] != "120000", "EDIT_CONFLICT")
                    expected = edit.get('count', 1)
                    old, text = edit['old'], edit['text']
                    require(bool(old) and 1 <= expected <= 10000, 'EDIT_CONFLICT')
                    estimate = max(0, self.blob_size(previous[1]) - expected * len(old.encode())) + expected * len(text.encode())
                    check('sourceFileBytes', FILE_BYTES, estimate)
                    if self.blob_size(previous[1]) <= 65536 and estimate <= 65536:
                        try:
                            contents = self.blob(previous[1]).decode('utf8')
                        except UnicodeDecodeError:
                            raise Fault('SOURCE_ENCODING') from None
                        require(contents.count(old) == expected, 'EDIT_CONFLICT')
                        puts[name] = contents.replace(old, text).encode()
                        entries[name] = (previous[0], 'pending')
                        continue
                    with tempfile.TemporaryFile() as output:
                        class Replacement:
                            pending, matches, written = '', 0, 0
                            decoder = codecs.getincrementaldecoder('utf-8')('strict')
                            def emit(self, value):
                                data = value.encode()
                                self.written += len(data)
                                check('sourceFileBytes', FILE_BYTES, self.written)
                                output.write(data)
                            def process(self, final):
                                cut = len(self.pending) if final else max(0, len(self.pending) - len(old) + 1)
                                cursor = 0
                                while True:
                                    found = self.pending.find(old, cursor)
                                    if found < 0 or (not final and found >= cut):
                                        break
                                    self.matches += 1
                                    require(self.matches <= expected, 'EDIT_CONFLICT')
                                    self.emit(self.pending[cursor:found])
                                    self.emit(text)
                                    cursor = found + len(old)
                                end = max(cursor, cut)
                                self.emit(self.pending[cursor:end])
                                self.pending = self.pending[end:]
                            def write(self, chunk):
                                try:
                                    self.pending += self.decoder.decode(chunk)
                                except UnicodeDecodeError:
                                    raise Fault('SOURCE_ENCODING') from None
                                self.process(False)
                            def finish(self):
                                try:
                                    self.pending += self.decoder.decode(b'', final=True)
                                except UnicodeDecodeError:
                                    raise Fault('SOURCE_ENCODING') from None
                                self.process(True)
                                require(self.matches == expected, 'EDIT_CONFLICT')
                        sink = Replacement()
                        self.blob_to(previous[1], sink)
                        sink.finish()
                        entries[name] = (previous[0], self.hash_file(output))
                    continue
                else:
                    data, mode = decode(edit["content"], edit.get("encoding", "utf8")), edit.get("mode", "100644")
                puts[name] = data
                entries[name] = (mode, "pending")
        for name, data in puts.items():
            entries[name] = (entries[name][0], self.call("hash-object", "-w", "--stdin", data=data).stdout.decode().strip())
            self.__dict__.setdefault('_sizes', {})[entries[name][1]] = len(data)
        tree = self.write_tree(entries)
        return self.commit(tree, checkpoint, "checkpoint " + marker)

    def content_manifest(self, checkpoint):
        result = {}
        for name, (mode, oid) in self.entries(checkpoint).items():
            class Hash:
                hash = hashlib.sha256()
                def write(self, chunk):
                    self.hash.update(chunk)
            sink = Hash()
            self.blob_to(oid, sink)
            result[name] = {'mode': mode, 'digest': sink.hash.hexdigest()}
        return result

    def capture(self, checkpoint, files, marker):
        entries = {}
        total = 0
        require(isinstance(files, list), 'CAPTURE_INVALID')
        check('sourceFiles', SOURCE_FILES, len(files), 'CAPTURE_LIMIT')
        for f in files:
            name = path(f["path"])
            require(name not in entries and f["mode"] in ("100644", "100755", "120000"), "CAPTURE_INVALID")
            data = decode(f["data"], "base64")
            total += len(data)
            check('sourceFileBytes', FILE_BYTES, len(data), 'CAPTURE_LIMIT')
            check('sourceBytes', SOURCE_BYTES, total, 'CAPTURE_LIMIT')
            entries[name] = (f["mode"], self.call("hash-object", "-w", "--stdin", data=data).stdout.decode().strip())
        return self.capture_entries(checkpoint, entries, marker)

    def capture_entries(self, checkpoint, entries, marker):
        tree = self.write_tree(entries)
        # Execution history lives in its operation receipt. Only changed source
        # needs a new CAS token; real A->B->A changes still make distinct commits.
        return checkpoint if tree == self.tree(checkpoint) else self.commit(tree, checkpoint, "capture " + marker)

    @contextmanager
    def execution_source(self, checkpoint):
        entries = self.entries(checkpoint)
        files = [{'path': name, 'mode': mode, 'blob': oid, 'size': self.blob_size(oid)}
                 for name, (mode, oid) in sorted(entries.items())]
        check('sourceMetadataBytes', METADATA_BYTES, len(canonical(files)))
        objects = {checkpoint, self.tree(checkpoint)}
        for record in self.call('ls-tree', '-rtz', checkpoint).stdout.split(b'\0'):
            if record:
                objects.add(record.split(b'\t', 1)[0].decode().split()[2])
        with tempfile.TemporaryFile(dir=self.root) as pack:
            self.call('-c', 'pack.threads=1', '-c', 'pack.windowMemory=16m',
                      'pack-objects', '--stdout', '--window=0', '--depth=0',
                      data=('\n'.join(sorted(objects)) + '\n').encode(), output=pack,
                      limit=PACK_BYTES, timeout=300, budget='packBytes')
            size = pack.tell()
            pack.seek(0)
            fingerprint = hashlib.file_digest(pack, 'sha256').hexdigest()
            pack.seek(0)
            yield files, {'format': 'git-pack', 'size': size, 'digest': fingerprint}, pack

    def capture_archive(self, checkpoint, descriptor, stream, marker):
        from .executor import source_manifest, BlobHashReader, safe_link
        require(descriptor.get('format') == 'tar' and type(descriptor.get('size')) is int and descriptor['size'] >= 0
                and isinstance(descriptor.get('digest'), str) and re.fullmatch(r'[0-9a-f]{64}', descriptor['digest']), 'CAPTURE_INVALID')
        files = source_manifest(descriptor['files'], checkpoint)
        expected = {entry['path']: entry for entry in files}
        known = {oid for mode, oid in self.entries(checkpoint).values()}
        check('captureTransferBytes', PACK_BYTES, descriptor['size'], 'CAPTURE_LIMIT')
        fingerprint = hashlib.sha256()
        class Reader:
            seen = 0
            def read(self, count=-1):
                chunk = stream.read(65536 if count < 0 else min(count, 65536))
                self.seen += len(chunk)
                check('captureTransferBytes', descriptor['size'], self.seen, 'CAPTURE_LIMIT')
                fingerprint.update(chunk)
                return chunk
        class Header(tarfile.TarInfo):
            @classmethod
            def frombuf(cls, buf, encoding, errors):
                info = super().frombuf(buf, encoding, errors)
                if info.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK):
                    check('captureHeaderBytes', 16384, info.size, 'CAPTURE_LIMIT')
                return info
        reader, entries, total = Reader(), {}, 0
        with tarfile.open(fileobj=reader, mode='r|', tarinfo=Header) as archive:
            for item in archive:
                name = path(item.name)
                require(name in expected and name not in entries, 'CAPTURE_INVALID')
                entry = expected[name]
                if item.issym():
                    safe_link(name, item.linkname)
                    data = item.linkname.encode()
                    size, mode = len(data), '120000'
                    blob = self.call('hash-object', '-w', '--stdin', data=data).stdout.decode().strip()
                else:
                    require(item.isfile(), 'CAPTURE_TYPE')
                    size, mode = item.size, '100755' if item.mode & 0o111 else '100644'
                    check('sourceFileBytes', FILE_BYTES, size, 'CAPTURE_LIMIT')
                    require(size == entry['size'] and mode == entry['mode'], 'CAPTURE_IDENTITY')
                    source = BlobHashReader(archive.extractfile(item), size, checkpoint)
                    with tempfile.TemporaryFile(dir=self.root) as captured:
                        while chunk := source.read(65536):
                            if entry['blob'] not in known:
                                captured.write(chunk)
                        require(source.seen == size, 'CAPTURE_INCOMPLETE')
                        blob = source.hash.hexdigest()
                        require(blob == entry['blob'], 'CAPTURE_IDENTITY')
                        if blob not in known:
                            require(self.hash_file(captured) == blob, 'CAPTURE_IDENTITY')
                            known.add(blob)
                total += size
                check('sourceBytes', SOURCE_BYTES, total, 'CAPTURE_LIMIT')
                require(mode == entry['mode'] and size == entry['size'] and blob == entry['blob'], 'CAPTURE_IDENTITY')
                entries[name] = (mode, blob)
        while reader.read(65536):
            pass
        require(reader.seen == descriptor['size'] and fingerprint.hexdigest() == descriptor['digest'], 'CAPTURE_TRANSFER_DIGEST')
        require(set(entries) == set(expected), 'CAPTURE_INCOMPLETE')
        return self.capture_entries(checkpoint, entries, marker)

    def publish(self, ref, old, new):
        require(self.head(ref) == old, "STALE_HEAD")
        parents = self.call("rev-list", "--parents", "-n", "1", new).stdout.decode().split()
        require(parents == [new, old], "DIRECT_CHILD_REQUIRED")
        if self.config["kind"] == "local":
            # Transfer objects first without changing the canonical ref.
            self.fetch_objects(new, destination=self.config['remote'])
            run(["git", "--git-dir=" + self.config["remote"], "update-ref", "--no-deref", ref, new, old], env=self.env)
        else:
            self.push_ref(ref, old, new)
        require(self.head(ref) == new, "PUBLICATION_UNKNOWN")

    def managed_change(self, ref, old, new):
        """Create-if-absent or delete-at-exact-OID, never update/adopt a branch."""
        require(branch_ref(ref) and ref not in self.config['refs'] and any(
            ref.startswith(ns) for ns in self.config.get('managedRefNamespaces', [])), 'REF_DENIED')
        require((old is None) != (new is None), 'REF_MUTATION')
        self.call('check-ref-format', ref)
        require(self.head(ref, missing=True) == old, 'STALE_HEAD')
        sample = old or new
        zero = '0' * len(sample)
        if self.config['kind'] == 'local':
            remote = '--git-dir=' + self.config['remote']
            # Never remove a branch currently checked out by the project owner.
            worktrees = run(['git', remote, 'worktree', 'list', '--porcelain'], env=self.env).stdout.decode()
            require('branch ' + ref not in worktrees.splitlines(), 'REF_CHECKED_OUT',
                    'Switch the local checkout off this task branch before cleanup')
            if new:
                self.fetch_objects(new, destination=self.config['remote'])
                run(['git', remote, 'update-ref', '--no-deref', ref, new, zero], env=self.env)
            else:
                run(['git', remote, 'update-ref', '--no-deref', '-d', ref, old], env=self.env)
        else:
            self.push_exact(ref, old or zero, new or zero, (new or '') + ':' + ref)
        require(self.head(ref, missing=True) == new, 'REF_MUTATION_UNKNOWN')

    def push_ref(self, ref, old, new):
        parents = self.call("rev-list", "--parents", "-n", "1", new).stdout.decode().split()
        require(parents == [new, old], "DIRECT_CHILD_REQUIRED")
        require(ref in self.config["refs"] and re.fullmatch(r"refs/heads/[A-Za-z0-9_./-]+", ref), "REF_DENIED")
        self.push_exact(ref, old, new, new + ':' + ref)

    def push_exact(self, ref, old, new, refspec):
        with tempfile.TemporaryDirectory(prefix="push-", dir=self.root) as tmp:
            # POSIX hook sees receive-pack's actual advertisement; that OID is
            # also the old value sent in the non-force receive-pack transaction.
            hook = '#!/bin/sh\ncount=0\nwhile read localref localoid remoteref remoteoid; do\n  count=$((count + 1))\n  [ "$localoid" = "' + new + '" ] && [ "$remoteoid" = "' + old + '" ] && [ "$remoteref" = "' + ref + '" ] || exit 1\ndone\n[ "$count" = 1 ]\n'
            atomic_write(Path(tmp) / "pre-push", hook.encode(), 0o700)
            self.call("-c", "core.hooksPath=" + tmp, "push", "--porcelain", "--",
                      self.config["remote"], refspec, timeout=120)

    def contains(self, head, commit):
        self.fetch_objects(head)
        return self.call("merge-base", "--is-ancestor", commit, head, check=False).returncode == 0
