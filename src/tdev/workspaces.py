"""Workspace composition. Membership selects resources; it never grants authority."""
import json
import time
import uuid

from .common import canonical, digest, require, Fault
from .store import Store


class Workspaces:
    def __init__(self, controller):
        self.c = controller
        self.store = controller.store

    def get(self, principal, ident, active=False):
        row = self.store.one('SELECT * FROM workspace WHERE id=? AND owner=?', (ident, principal))
        require(row, 'WORKSPACE_NOT_FOUND')
        require(not active or not row['closed'], 'WORKSPACE_CLOSED')
        return row

    def project(self, principal, repo, identity=None):
        config = self.c.config['repositories'].get(repo)
        grants = self.c.config['principals'][principal].get('repos', {}).get(repo, [])
        require(config and set(grants) & set(config['refs']), 'PERMISSION_DENIED')
        require(identity is None or identity == config['identity'], 'REPOSITORY_IDENTITY')
        return config

    def members(self, ident):
        return self.store.all('SELECT repo,identity FROM workspace_project WHERE workspace=? ORDER BY repo', (ident,))

    def public(self, row):
        return {'workspaceId': row['id'], 'name': row['name'], 'revision': row['revision'],
                'closed': bool(row['closed']), 'defaultRepo': row['default_repo'],
                'isDefault': bool(row['is_default']), 'projects': self.members(row['id'])}

    def list(self, principal, args):
        limit = args.get('limit', 20)
        with self.store.mutex:
            rows = self.store.all('SELECT rowid AS cursor,* FROM workspace WHERE owner=? AND rowid>? '
                                  'AND (closed=0 OR ?) ORDER BY rowid LIMIT ?',
                                  (principal, args.get('after', 0), int(args.get('includeClosed', False)), limit + 1))
            return {'workspaces': [self.public(r) for r in rows[:limit]],
                    'nextAfter': rows[limit - 1]['cursor'] if len(rows) > limit else None}

    def inspect(self, principal, args):
        started = str(time.time_ns())
        limit = args.get('limit', 20)
        with self.store.mutex:
            row = self.get(principal, args['workspaceId'])
            workspace = self.public(row)
            for member in workspace['projects']:
                try:
                    self.project(principal, member['repo'], member['identity'])
                    member['available'] = True
                except Fault as error:
                    member.update(available=False, error=error.value)
            rows = self.store.all('SELECT rowid AS cursor,* FROM task WHERE workspace=? AND rowid>? '
                                  'AND (closed=0 OR ?) ORDER BY rowid LIMIT ?',
                                  (row['id'], args.get('after', 0), int(args.get('includeClosed', False)), limit + 1))
            pending = self.store.all("SELECT rowid AS cursor,* FROM operation WHERE owner=? AND kind='task' "
                                     "AND status IN ('running','unknown') AND task IS NULL "
                                     "AND json_extract(intent,'$.workspaceId')=? AND rowid>? ORDER BY rowid LIMIT ?",
                                     (principal, row['id'], args.get('pendingAfter', 0), limit + 1))
        # Executor observation can block; never hold the store lock while reconciling.
        tasks = []
        for task in rows[:limit]:
            item = {'taskId': task['id'], 'repo': task['repo']}
            try:
                current = self.c.task(principal, task['id'])
                if current['busy']:
                    item['active'] = self.c.status(principal, {'operationId': current['busy'], 'limit': 1})
                    current = self.c.task(principal, task['id'])
                item.update(checkpoint=current['checkpoint'], closed=bool(current['closed']), busy=current['busy'])
            except Fault as error:
                item['error'] = error.value
            tasks.append(item)
        pending_tasks = []
        for operation in pending[:limit]:
            item = {'operationId': operation['id'], 'requestId': operation['request']}
            try:
                item['operation'] = self.c.status(principal, {'operationId': operation['id'], 'limit': 1})
            except Fault as error:
                item['error'] = error.value
            pending_tasks.append(item)
        result = {'workspace': workspace, 'tasks': tasks, 'pendingTasks': pending_tasks,
                  'nextAfter': rows[limit - 1]['cursor'] if len(rows) > limit else None,
                  'nextPendingAfter': pending[limit - 1]['cursor'] if len(pending) > limit else None}
        result['observation'] = self.c.observation(result, args.get('since'), ['SQLite', 'page task executors if busy'])
        result['observation']['startedAtNs'] = started
        return result

    def select_project(self, principal, args):
        """Explicit workspaces resolve defaults from their own membership, not global state."""
        if 'workspaceId' not in args:
            return args.get('repo')
        row = self.get(principal, args['workspaceId'], active=True)
        members = self.members(row['id'])
        repo = args.get('repo') or row['default_repo'] or (members[0]['repo'] if len(members) == 1 else None)
        require(repo is not None, 'PROJECT_REQUIRED', 'Select a project attached to this workspace or set its defaultRepo')
        member = next((m for m in members if m['repo'] == repo), None)
        require(member, 'PROJECT_NOT_ATTACHED')
        self.project(principal, repo, member['identity'])
        return repo

    def bind(self, db, principal, args, repo):
        """Called inside source-task admission; closing/detaching sees this pending intent."""
        cfg = self.project(principal, repo)
        if 'workspaceId' in args:
            self.select_project(principal, {**args, 'repo': repo})
            return args['workspaceId']
        row = db.execute('SELECT * FROM workspace WHERE owner=? AND is_default=1 AND closed=0', (principal,)).fetchone()
        if row is None:
            ident = uuid.uuid4().hex
            db.execute('INSERT INTO workspace(id,owner,name,is_default) VALUES(?,?,?,1)', (ident, principal, 'Default'))
        else:
            ident = row['id']
        member = db.execute('SELECT identity FROM workspace_project WHERE workspace=? AND repo=?', (ident, repo)).fetchone()
        if member:
            require(member['identity'] == cfg['identity'], 'REPOSITORY_IDENTITY')
        else:
            db.execute('INSERT INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)', (ident, repo, cfg['identity']))
            db.execute('UPDATE workspace SET revision=revision+1 WHERE id=?', (ident,))
        return ident

    def active_tasks(self, db, ident, repo=None):
        tasks = db.execute('SELECT 1 FROM task WHERE workspace=? AND (closed=0 OR busy IS NOT NULL) '
                           'AND (? IS NULL OR repo=?) LIMIT 1', (ident, repo, repo)).fetchone()
        pending = db.execute("SELECT 1 FROM operation WHERE kind='task' AND status IN ('running','unknown') "
                             "AND json_extract(intent,'$.workspaceId')=? AND (? IS NULL OR repo=?) LIMIT 1",
                             (ident, repo, repo)).fetchone()
        require(not tasks and not pending, 'WORKSPACE_IN_USE', 'Close or reconcile its source tasks before detaching or closing')

    def change(self, principal, args):
        fingerprint = digest({'kind': 'workspace', 'input': args})
        with self.store.tx() as db:
            old = db.execute('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId'])).fetchone()
            if old:
                require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
                self.get(principal, json.loads(old['intent'])['workspaceId'])
                return Store.public(dict(old))
            action = args['action']
            if action == 'create':
                ident = uuid.uuid4().hex
                members = [(repo, self.project(principal, repo)['identity']) for repo in args.get('projects', [])]
                default = args.get('defaultRepo')
                require(default is None or default in args.get('projects', []), 'PROJECT_NOT_ATTACHED')
                db.execute('INSERT INTO workspace(id,owner,name,default_repo) VALUES(?,?,?,?)',
                           (ident, principal, args['name'], default))
                db.executemany('INSERT INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)',
                               [(ident, repo, identity) for repo, identity in members])
            else:
                ident = args['workspaceId']
                row = self.get(principal, ident, active=True)
                require(row['revision'] == args['expectedRevision'], 'STALE_WORKSPACE')
                if action == 'attach':
                    cfg = self.project(principal, args['repo'])
                    member = db.execute('SELECT identity FROM workspace_project WHERE workspace=? AND repo=?', (ident, args['repo'])).fetchone()
                    require(member is None or member['identity'] == cfg['identity'], 'REPOSITORY_IDENTITY')
                    db.execute('INSERT OR IGNORE INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)',
                               (ident, args['repo'], cfg['identity']))
                elif action == 'detach':
                    self.active_tasks(db, ident, args['repo'])
                    db.execute('DELETE FROM workspace_project WHERE workspace=? AND repo=?', (ident, args['repo']))
                    db.execute('UPDATE workspace SET default_repo=NULL WHERE id=? AND default_repo=?', (ident, args['repo']))
                elif action == 'configure':
                    if 'defaultRepo' in args:
                        default = args['defaultRepo']
                        if default is not None:
                            self.select_project(principal, {'workspaceId': ident, 'repo': default})
                        db.execute('UPDATE workspace SET default_repo=? WHERE id=?', (default, ident))
                    if 'name' in args:
                        db.execute('UPDATE workspace SET name=? WHERE id=?', (args['name'], ident))
                elif action == 'close':
                    self.active_tasks(db, ident)
                    db.execute('UPDATE workspace SET closed=1 WHERE id=?', (ident,))
                db.execute('UPDATE workspace SET revision=revision+1 WHERE id=?', (ident,))
            result = self.public(self.get(principal, ident))
            opid = uuid.uuid4().hex
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,status,effect,intent,result) "
                       "VALUES(?,?,?,?,'workspace','succeeded','committed',?,?)",
                       (opid, principal, args['requestId'], fingerprint,
                        canonical({'input': args, 'workspaceId': ident}).decode(), canonical(result).decode()))
            return Store.public(dict(db.execute('SELECT * FROM operation WHERE id=?', (opid,)).fetchone()))
