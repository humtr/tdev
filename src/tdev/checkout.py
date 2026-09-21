"""Read an enrolled working tree without changing its index, refs or files."""
import base64
import os
import stat
from pathlib import Path

from .common import Fault, digest, path, require, run
from .executor import safe_link


class Checkout:
    def __init__(self, git):
        self.git = git
        cfg = git.config
        require(cfg['kind'] == 'local' and cfg.get('checkout') and cfg.get('checkoutIdentity'),
                'CHECKOUT_REQUIRED', 'Connect a local working folder before importing local changes')
        self.root = Path(cfg['checkout'])
        self.env = {**git.env, 'GIT_OPTIONAL_LOCKS': '0'}

    def call(self, *args):
        return run(['git', '-C', str(self.root), '-c', 'core.hooksPath=/dev/null',
                    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', *args], env=self.env).stdout

    def identity(self, expected, ref):
        cfg = self.git.config
        require(str(self.root.resolve(strict=True)) == str(self.root), 'CHECKOUT_IDENTITY')
        st = self.root.stat()
        require(f'local:{st.st_dev}:{st.st_ino}' == cfg['checkoutIdentity'], 'CHECKOUT_IDENTITY')
        common = self.call('rev-parse', '--path-format=absolute', '--git-common-dir').decode().strip()
        require(str(Path(common).resolve()) == cfg['remote'], 'CHECKOUT_IDENTITY')
        self.git.identity()
        require(self.call('rev-parse', '--show-toplevel').decode().strip() == str(self.root), 'CHECKOUT_IDENTITY')
        require(self.call('rev-parse', '--verify', 'HEAD').decode().strip() == expected, 'CHECKOUT_HEAD_CHANGED')
        require(self.call('symbolic-ref', '-q', 'HEAD').decode().strip() == ref, 'CHECKOUT_HEAD_CHANGED')

    def selection(self):
        index = self.call('ls-files', '--stage', '-z')
        names = set()
        for line in index.split(b'\0'):
            if not line:
                continue
            meta, name = line.split(b'\t', 1)
            mode, oid, stage = meta.split()
            require(stage == b'0', 'CHECKOUT_UNMERGED', 'Resolve the local index conflicts before importing')
            require(mode in (b'100644', b'100755', b'120000'), 'UNSUPPORTED_GITLINK')
            names.add(path(name.decode()))
        flags = self.call('ls-files', '-v', '-z')
        require(not any(line[:1].lower() == b's' for line in flags.split(b'\0') if line),
                'CHECKOUT_SPARSE', 'Sparse/skip-worktree entries require a full checkout before importing')
        others = self.call('ls-files', '--others', '--exclude-standard', '-z')
        names.update(path(name.decode()) for name in others.split(b'\0') if name)
        require(len(names) <= 100000, 'SOURCE_LIMIT')
        return sorted(names), digest([index.hex(), flags.hex(), others.hex()])

    @staticmethod
    def signature(st):
        return (st.st_dev, st.st_ino, st.st_mode, st.st_size, st.st_mtime_ns, st.st_ctime_ns)

    def file(self, root_fd, name):
        # Open every directory without following links, and reject FIFOs/devices before reading.
        parent = os.dup(root_fd)
        try:
            parts = name.split('/')
            for part in parts[:-1]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                os.close(parent)
                parent = child
            before = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
            if stat.S_ISLNK(before.st_mode):
                target = os.readlink(parts[-1], dir_fd=parent)
                try:
                    safe_link(name, target)
                except ValueError:
                    raise Fault('CHECKOUT_SYMLINK', 'Import cannot include an escaping or unsafe link') from None
                data, mode = target.encode(), '120000'
            else:
                require(stat.S_ISREG(before.st_mode), 'CHECKOUT_FILE_TYPE')
                fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                with os.fdopen(fd, 'rb') as stream:
                    require(self.signature(os.fstat(stream.fileno())) == self.signature(before), 'CHECKOUT_CHANGED')
                    data = stream.read(16 * 1024 * 1024 + 1)
                    require(len(data) <= 16 * 1024 * 1024, 'SOURCE_LIMIT')
                    require(self.signature(os.fstat(stream.fileno())) == self.signature(before), 'CHECKOUT_CHANGED')
                mode = '100755' if before.st_mode & 0o111 else '100644'
            after = os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)
            require(self.signature(before) == self.signature(after), 'CHECKOUT_CHANGED')
            return {'path': name, 'mode': mode, 'data': base64.b64encode(data).decode()}, self.signature(after), len(data)
        except FileNotFoundError:
            return None, None, 0  # A consistently missing tracked file is an unstaged deletion.
        finally:
            os.close(parent)

    def scan(self, expected, ref):
        self.identity(expected, ref)
        names, selected = self.selection()
        files, signatures, total = [], {}, 0
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            st = os.fstat(fd)
            require(f'local:{st.st_dev}:{st.st_ino}' == self.git.config['checkoutIdentity'], 'CHECKOUT_IDENTITY')
            for name in names:
                item, signature, size = self.file(fd, name)
                signatures[name] = signature
                total += size
                require(total <= 32 * 1024 * 1024, 'SOURCE_LIMIT')
                if item:
                    files.append(item)
        finally:
            os.close(fd)
        self.identity(expected, ref)
        require(self.selection() == (names, selected), 'CHECKOUT_CHANGED')
        return files, signatures, selected

    def capture(self, base, ref, marker):
        try:
            first = self.scan(base, ref)
            second = self.scan(base, ref)
            require(first == second, 'CHECKOUT_CHANGED', 'Local files changed during import; no source task was committed')
            checkpoint = self.git.capture(base, first[0], marker)
            return checkpoint, {'head': base, 'tree': self.git.tree(checkpoint),
                                'files': len(first[0]), 'selectionDigest': first[2]}
        except OSError:
            raise Fault('CHECKOUT_CHANGED', 'The enrolled checkout was unreadable or changed during import') from None
        except Fault as error:
            # Capture can write private Git objects, but has not admitted a source task.
            raise Fault(error.value['code'], error.value['message']) from None
