import base64
import errno
import json
import os
import re
import tempfile
from pathlib import Path

from .common import Fault, canonical, decode, digest, path, require, run, atomic_write


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

    def call(self, *args, data=None, env=None, check=True, timeout=30):
        return run(["git", "--git-dir=" + str(self.root), "-c", "core.hooksPath=/dev/null",
                    "-c", "core.fsync=loose-object,reference", "-c", "core.fsyncMethod=fsync",
                    "-c", "gc.auto=0", "-c", "http.followRedirects=false",
                    *(["-c", "credential.helper=!gh auth git-credential"] if self.config["kind"] == "github" else []),
                    *args], data=data, env={**self.env, **(env or {})},
                   timeout=timeout, check=check)

    def identity(self):
        c = self.config
        if c["kind"] == "local":
            p = Path(c["remote"]).resolve(strict=True)
            st = p.stat()
            require(str(p) == c["remote"], "REPOSITORY_IDENTITY")
            require(run(["git", "--git-dir=" + str(p), "rev-parse", "--is-bare-repository"], env=self.env).stdout.strip() == b"true", "BARE_REQUIRED")
            actual = f"local:{st.st_dev}:{st.st_ino}"
        else:
            require(c["kind"] == "github" and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", c["name"]), "REPOSITORY_IDENTITY")
            require(c["remote"] == "https://github.com/" + c["name"] + ".git", "REPOSITORY_IDENTITY")
            actual = "github:" + str(json.loads(run(["gh", "api", "repos/" + c["name"]]).stdout)["id"])
        require(actual == c["identity"], "REPOSITORY_IDENTITY")
        return actual

    def head(self, ref):
        self.identity()
        require(ref in self.config["refs"], "REF_DENIED")
        if self.config["kind"] == "local":
            symbolic = run(["git", "--git-dir=" + self.config["remote"], "symbolic-ref", "-q", ref], env=self.env, check=False)
            require(symbolic.returncode != 0, "SYMBOLIC_REF")
        out = self.call("ls-remote", "--refs", "--", self.config["remote"], ref).stdout.decode().splitlines()
        require(len(out) == 1 and out[0].split()[1] == ref, "REF_NOT_FOUND")
        return out[0].split()[0]

    def fetch(self, ref, expected):
        require(self.head(ref) == expected, "STALE_HEAD")
        # Fetch the admitted immutable source, without a shared FETCH_HEAD owner.
        # A concurrent ref fetch must not change another workspace's source check.
        self.call("fetch", "--no-tags", "--no-write-fetch-head", "--", self.config["remote"], expected, timeout=120)
        require(self.call("cat-file", "-t", expected).stdout.strip() == b"commit", "COMMIT_REQUIRED")
        self.pin(expected)

    def pin(self, oid):
        self.call("update-ref", "refs/tdev/objects/" + oid, oid)

    def tree(self, commit):
        return self.call("rev-parse", commit + "^{tree}").stdout.decode().strip()

    def entries(self, commit):
        result = {}
        for line in self.call("ls-tree", "-rz", commit).stdout.split(b"\0"):
            if not line:
                continue
            meta, name = line.split(b"\t", 1)
            mode, kind, oid = meta.decode().split()
            name = name.decode("utf8")
            path(name)
            require(kind == "blob" and mode in ("100644", "100755", "120000"), "UNSUPPORTED_GITLINK")
            result[name] = (mode, oid)
        return result

    def blob(self, oid, limit=16 * 1024 * 1024):
        require(int(self.call("cat-file", "-s", oid).stdout) <= limit, "SOURCE_LIMIT")
        return self.call("cat-file", "blob", oid).stdout

    def write_tree(self, entries):
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
                    text = self.blob(previous[1]).decode("utf8")
                    require(text.count(edit["old"]) == edit.get("count", 1), "EDIT_CONFLICT")
                    data, mode = text.replace(edit["old"], edit["text"]).encode(), previous[0]
                else:
                    data, mode = decode(edit["content"], edit.get("encoding", "utf8")), edit.get("mode", "100644")
                puts[name] = data
                entries[name] = (mode, "pending")
        for name, data in puts.items():
            entries[name] = (entries[name][0], self.call("hash-object", "-w", "--stdin", data=data).stdout.decode().strip())
        tree = self.write_tree(entries)
        return self.commit(tree, checkpoint, "checkpoint " + marker)

    def export(self, checkpoint):
        files, total = [], 0
        for name, (mode, oid) in self.entries(checkpoint).items():
            data = self.blob(oid)
            total += len(data)
            require(total <= 32 * 1024 * 1024 and len(files) < 100000, "SOURCE_LIMIT")
            files.append({"path": name, "mode": mode, "data": base64.b64encode(data).decode()})
        return files

    def execution_pack(self, checkpoint):
        # A shallow exact checkpoint plus all of its trees/blobs, not entire history.
        objects = {checkpoint, self.tree(checkpoint)}
        for line in self.call("ls-tree", "-rtz", checkpoint).stdout.split(b"\0"):
            if line:
                objects.add(line.split(b"\t", 1)[0].decode().split()[2])
        pack = self.call("pack-objects", "--stdout", data=("\n".join(sorted(objects)) + "\n").encode()).stdout
        require(len(pack) <= 32 * 1024 * 1024, "SOURCE_LIMIT")
        return base64.b64encode(pack).decode()

    def capture(self, checkpoint, files, marker):
        entries = {}
        total = 0
        require(isinstance(files, list) and len(files) <= 100000, "CAPTURE_INVALID")
        for f in files:
            name = path(f["path"])
            require(name not in entries and f["mode"] in ("100644", "100755", "120000"), "CAPTURE_INVALID")
            data = decode(f["data"], "base64")
            total += len(data)
            require(total <= 32 * 1024 * 1024, "CAPTURE_LIMIT")
            entries[name] = (f["mode"], self.call("hash-object", "-w", "--stdin", data=data).stdout.decode().strip())
        return self.commit(self.write_tree(entries), checkpoint, "capture " + marker)

    def publish(self, ref, old, new):
        require(self.head(ref) == old, "STALE_HEAD")
        parents = self.call("rev-list", "--parents", "-n", "1", new).stdout.decode().split()
        require(parents == [new, old], "DIRECT_CHILD_REQUIRED")
        if self.config["kind"] == "local":
            # Transfer objects first without changing the canonical ref.
            run(["git", "--git-dir=" + self.config["remote"], "fetch", "--no-tags", str(self.root), new], env=self.env)
            run(["git", "--git-dir=" + self.config["remote"], "update-ref", "--no-deref", ref, new, old], env=self.env)
        else:
            self.push_ref(ref, old, new)
        require(self.head(ref) == new, "PUBLICATION_UNKNOWN")

    def push_ref(self, ref, old, new):
        parents = self.call("rev-list", "--parents", "-n", "1", new).stdout.decode().split()
        require(parents == [new, old], "DIRECT_CHILD_REQUIRED")
        require(ref in self.config["refs"] and re.fullmatch(r"refs/heads/[A-Za-z0-9_./-]+", ref), "REF_DENIED")
        with tempfile.TemporaryDirectory(prefix="push-", dir=self.root) as tmp:
            # POSIX hook sees receive-pack's actual advertisement; that OID is
            # also the old value sent in the non-force receive-pack transaction.
            hook = '#!/bin/sh\ncount=0\nwhile read localref localoid remoteref remoteoid; do\n  count=$((count + 1))\n  [ "$localoid" = "' + new + '" ] && [ "$remoteoid" = "' + old + '" ] && [ "$remoteref" = "' + ref + '" ] || exit 1\ndone\n[ "$count" = 1 ]\n'
            atomic_write(Path(tmp) / "pre-push", hook.encode(), 0o700)
            self.call("-c", "core.hooksPath=" + tmp, "push", "--porcelain", "--",
                      self.config["remote"], new + ":" + ref, timeout=120)

    def contains(self, head, commit):
        self.call("fetch", "--no-tags", "--no-write-fetch-head", "--", self.config["remote"], head, timeout=120)
        return self.call("merge-base", "--is-ancestor", commit, head, check=False).returncode == 0
