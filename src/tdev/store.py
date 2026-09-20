import fcntl
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from .common import Fault, canonical, require


class Store:
    """One controller; two semantic tables. Network calls never occur in tx()."""
    def __init__(self, directory):
        self.root = Path(directory)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        st = self.root.lstat()
        require(not self.root.is_symlink() and st.st_uid == os.getuid() and st.st_mode & 0o077 == 0, "STATE_PERMISSIONS")
        for filename in ("controller.lock", "state.sqlite", "state.sqlite-wal", "state.sqlite-shm"):
            require(not (self.root / filename).is_symlink(), "STATE_SYMLINK")
        self.lock = open(self.root / "controller.lock", "a+b")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise Fault("CONTROLLER_BUSY") from None
        self.mutex = threading.RLock()
        self.db = sqlite3.connect(self.root / "state.sqlite", check_same_thread=False,
                                  isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("PRAGMA foreign_keys=ON")
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1):
            self.close()
            raise Fault("SCHEMA_VERSION")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS workspace (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, repo TEXT NOT NULL, ref TEXT NOT NULL,
          identity TEXT NOT NULL, base TEXT NOT NULL, checkpoint TEXT NOT NULL,
          busy TEXT, closed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS operation (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, request TEXT NOT NULL, hash TEXT NOT NULL,
          kind TEXT NOT NULL, workspace TEXT, repo TEXT, ref TEXT,
          status TEXT NOT NULL, effect TEXT NOT NULL, intent TEXT NOT NULL,
          result TEXT, error TEXT, publication TEXT UNIQUE,
          UNIQUE(owner,request));
        PRAGMA user_version=1;
        """)
        os.chmod(self.root / "state.sqlite", 0o600)
        # A local pointer and its result were one transaction. Interrupted local work
        # cannot have committed. External work must be observed, never relaunched.
        with self.tx() as db:
            pending = db.execute("SELECT id FROM operation WHERE status='running' AND effect='none'").fetchall()
            for row in pending:
                db.execute("UPDATE operation SET status='failed',error=? WHERE id=?",
                           (canonical({"code": "INTERRUPTED", "message": "No dispatch or local pointer committed", "effect": "none"}).decode(), row[0]))
                db.execute("UPDATE workspace SET busy=NULL WHERE busy=?", (row[0],))
            db.execute("UPDATE operation SET status='unknown',effect='unknown' WHERE status='running'")
            local = db.execute("SELECT id FROM operation WHERE status='unknown' AND kind IN ('edit','workspace')").fetchall()
            for row in local:
                db.execute("UPDATE operation SET status='failed',effect='none',error=? WHERE id=?",
                           (canonical({"code": "INTERRUPTED", "message": "No local pointer committed", "effect": "none"}).decode(), row[0]))
                db.execute("UPDATE workspace SET busy=NULL WHERE busy=?", (row[0],))

    @contextmanager
    def tx(self):
        with self.mutex:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield self.db
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def one(self, query, args=()):
        with self.mutex:
            row = self.db.execute(query, args).fetchone()
            return dict(row) if row else None

    def all(self, query, args=()):
        with self.mutex:
            return [dict(r) for r in self.db.execute(query, args)]

    def close(self):
        self.db.close()
        self.lock.close()

    @staticmethod
    def public(row):
        return {k: json.loads(v) if k in ("result", "error") and v else v
                for k, v in row.items() if k in ("id", "kind", "workspace", "status", "effect", "result", "error")}
