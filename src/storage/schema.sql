CREATE TABLE workspace (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, closed INTEGER NOT NULL DEFAULT 0,
 default_repo TEXT, is_default INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX workspace_default ON workspace(owner) WHERE is_default=1 AND closed=0;
CREATE TABLE workspace_project (
 workspace TEXT NOT NULL REFERENCES workspace(id), repo TEXT NOT NULL,
 identity TEXT NOT NULL, PRIMARY KEY(workspace,repo));
CREATE TABLE task (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, repo TEXT NOT NULL, ref TEXT NOT NULL,
 identity TEXT NOT NULL, base TEXT NOT NULL, checkpoint TEXT NOT NULL,
 busy TEXT, closed INTEGER NOT NULL DEFAULT 0,
 workspace TEXT NOT NULL REFERENCES workspace(id),
 managed INTEGER NOT NULL DEFAULT 0, source_ref TEXT,
 namespace TEXT, published_oid TEXT, ref_state TEXT);
CREATE TABLE operation (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, request TEXT NOT NULL, hash TEXT NOT NULL,
 kind TEXT NOT NULL, task TEXT, repo TEXT, ref TEXT,
 status TEXT NOT NULL, effect TEXT NOT NULL, intent TEXT NOT NULL,
 result TEXT, error TEXT, publication TEXT UNIQUE,
 UNIQUE(owner,request));
CREATE TABLE artifact (
 operation TEXT PRIMARY KEY REFERENCES operation(id), digest TEXT NOT NULL,
 bytes INTEGER, retained_ns INTEGER NOT NULL DEFAULT 0, pruned TEXT);
CREATE TABLE project (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, policy TEXT NOT NULL,
 authority TEXT NOT NULL, identity TEXT NOT NULL, config TEXT NOT NULL,
 UNIQUE(owner,identity));
CREATE TABLE deployment (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, repo TEXT NOT NULL, ref TEXT NOT NULL,
 identity TEXT NOT NULL, target TEXT NOT NULL, target_digest TEXT NOT NULL,
 record TEXT NOT NULL, busy TEXT);
PRAGMA user_version=3;
