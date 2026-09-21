"""Validated native releases and delegated, owned project services."""
import base64
import fcntl
import http.client
import json
import os
import shlex
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require
from .deployment_runtime import verify_release, stop_previous
from .executor import materialize
from .native import identity
from .resident import Runit, sync
from .store import Store


class NativeDeployment:
    def __init__(self, state, backend=None):
        self.state = Path(state).resolve()
        self.backend = backend or Runit()

    def root(self, record):
        parent = self.state / 'deployments'
        root = parent / record['deploymentId']
        require(not parent.is_symlink() and not root.is_symlink(), 'DEPLOYMENT_PATH_CHANGED')
        return root

    def service(self, record):
        return self.backend.svdir / record['service']

    def owned(self, record):
        service = self.service(record)
        require(not service.is_symlink() and service.is_dir(), 'DEPLOYMENT_SERVICE_MISSING')
        marker = service / '.tdev-project.json'
        require(marker.is_file() and not marker.is_symlink(), 'DEPLOYMENT_SERVICE_CONFLICT')
        value = json.loads(private_file(marker))
        require(value['deploymentId'] == record['deploymentId'] and value['state'] == str(self.state), 'DEPLOYMENT_SERVICE_CONFLICT')
        for name, checksum in value['files'].items():
            require(name in ('run', 'log/run') and digest(private_file(service / name)) == checksum, 'DEPLOYMENT_SERVICE_CHANGED')
        require(set(value['files']) == {'run', 'log/run'}, 'DEPLOYMENT_SERVICE_CHANGED')

    def prepare(self, record, manifest, files):
        root = self.root(record)
        releases = root / 'releases'
        require(not releases.is_symlink(), 'DEPLOYMENT_PATH_CHANGED')
        releases.mkdir(parents=True, mode=0o700, exist_ok=True)
        target = releases / digest(manifest)
        if not target.exists():
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=releases) as tmp:
                directory = Path(tmp)
                materialize(files, directory / 'source')
                atomic_write(directory / 'manifest.json', canonical(manifest))
                os.rename(directory, target)
                sync(releases)
        verify_release(target)

    def register(self, record):
        target = self.service(record)
        if target.exists() or target.is_symlink():
            self.owned(record)
            return
        root = self.root(record)
        logs = root / 'logs'
        logs.mkdir(mode=0o700, exist_ok=True)
        atomic_write(logs / 'config', b's1048576\nn3\n')
        shell = shutil.which('sh')
        run = ('#!' + shell + '\nexec 2>&1\nexec ' + shlex.join([sys.executable, '-I', record['runner'], str(root)]) + '\n').encode()
        log = ('#!' + shell + '\nexec ' + shlex.join([shutil.which('svlogd'), '-tt', str(logs)]) + '\n').encode()
        with tempfile.TemporaryDirectory(prefix='.tdev-project-', dir=self.backend.svdir) as tmp:
            directory = Path(tmp) / 'service'
            (directory / 'log').mkdir(parents=True, mode=0o700)
            atomic_write(directory / 'down', b'')
            for name, data in (('run', run), ('log/run', log)):
                atomic_write(directory / name, data, 0o700)
            atomic_write(directory / '.tdev-project.json', canonical({'deploymentId': record['deploymentId'],
                         'state': str(self.state), 'files': {'run': digest(run), 'log/run': digest(log)}}))
            require(not target.exists() and not target.is_symlink(), 'DEPLOYMENT_SERVICE_CONFLICT')
            os.rename(directory, target)
            sync(target.parent)

    def point(self, record):
        root = self.root(record)
        if record['release']:
            if record['desired'] == 'up':
                verify_release(root / 'releases' / record['release'])
            temporary = root / '.active-next'
            temporary.unlink(missing_ok=True)
            temporary.symlink_to('releases/' + record['release'])
            os.replace(temporary, root / 'active')
        else:
            (root / 'active').unlink(missing_ok=True)
        sync(root)

    def down(self, record):
        self.owned(record)
        self.backend.down(self.service(record))
        stop_previous(self.root(record))

    def apply(self, record, operation_id):
        self.backend.preflight()
        directory = self.service(record)
        if directory.exists() or directory.is_symlink():
            self.down(record)
        self.point(record)
        if record['desired'] == 'removed':
            if directory.exists():
                destination = self.root(record) / 'retired-services' / operation_id
                destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                require(not destination.exists(), 'DEPLOYMENT_RECOVERY_CONFLICT')
                self.backend.remove(directory, destination)
            return
        self.register(record)
        if record['desired'] == 'up':
            self.backend.up(directory)
            until = time.monotonic() + 12
            while True:
                value = self.status(record)
                if value['running'] and value.get('release') == record['release'] and value.get('healthy'):
                    return
                require(time.monotonic() < until, 'DEPLOYMENT_NOT_READY', 'Selected process identity or configured HTTP readiness did not pass')
                time.sleep(.1)

    def status(self, record):
        root = self.root(record)
        result = {'running': False, 'healthy': False}
        directory = self.service(record)
        if not directory.exists() and not directory.is_symlink():
            return result
        self.owned(record)
        try:
            pid = self.backend.pid(directory)
            receipt = json.loads((root / 'runtime.json').read_bytes())
            supervisor = identity(pid)
            child = identity(receipt['child']['pid']) if receipt.get('child') else None
            require(supervisor and supervisor['start'] == receipt['supervisor']['start'] and pid == receipt['supervisor']['pid'], 'DEPLOYMENT_STARTING')
            require(child and child['start'] == receipt['child']['start'] and child['state'] != 'Z' and receipt['phase'] == 'running', 'DEPLOYMENT_STARTING')
            result.update(running=True, pid=pid, childPid=child['pid'], release=receipt['release'])
            require(receipt['release'] == record['release'] and
                    (root / 'active').resolve() == root / 'releases' / record['release'], 'DEPLOYMENT_RELEASE_MISMATCH')
            manifest = verify_release(root / 'releases' / receipt['release'])
            health = manifest['health']
            conn = http.client.HTTPConnection('127.0.0.1', health['port'], timeout=1)
            try:
                conn.request('GET', health['path'])
                response = conn.getresponse()
                # HTTP readiness must attest the release selected for this service;
                # an unrelated listener on the same port cannot satisfy readiness.
                release_matches = response.getheader('X-Tdev-Release') == receipt['release']
                live_child = identity(child['pid'])
                result.update(healthy=response.status == 200 and release_matches and bool(live_child)
                              and live_child['start'] == child['start'] and live_child['state'] != 'Z',
                              healthStatus=response.status)
                if not release_matches:
                    result['error'] = 'DEPLOYMENT_HEALTH_IDENTITY'
                response.read(8192)
            finally:
                conn.close()
        except (Fault, OSError, ValueError, KeyError, http.client.HTTPException) as error:
            result['error'] = error.value['code'] if isinstance(error, Fault) else type(error).__name__
        return result

    def logs(self, record, offset, limit):
        file = self.root(record) / 'logs/current'
        require(not file.is_symlink(), 'DEPLOYMENT_LOG_IDENTITY')
        if not file.exists():
            return {'data': '', 'encoding': 'base64', 'offset': offset, 'nextOffset': offset, 'generation': None, 'size': 0}
        with open(file, 'rb') as stream:
            st = os.fstat(stream.fileno())
            stream.seek(offset)
            data = stream.read(limit)
        return {'data': base64.b64encode(data).decode(), 'encoding': 'base64', 'offset': offset,
                'nextOffset': offset + len(data), 'generation': str(st.st_ino), 'size': st.st_size}


class Deployments:
    def __init__(self, controller):
        self.c = controller
        self.store = controller.store
        self.backend = NativeDeployment(self.store.root)

    def target(self, principal, name=None, expected=None):
        granted = self.c.config['principals'][principal].get('deploymentTargets', [])
        available = [key for key in granted if key in self.c.config.get('deploymentTargets', {})]
        name = name or (available[0] if len(available) == 1 else None)
        require(name in available, 'DEPLOYMENT_TARGET_REQUIRED', 'Select a delegated target from tdev_deploy targets')
        target = self.c.config['deploymentTargets'][name]
        require(expected is None or digest(target) == expected, 'DEPLOYMENT_TARGET_CHANGED')
        return name, target

    def get(self, principal, ident):
        row = self.store.one('SELECT * FROM deployment WHERE id=? AND owner=?', (ident, principal))
        require(row, 'DEPLOYMENT_NOT_FOUND')
        self.target(principal, row['target'], row['target_digest'])
        self.c.authorize(principal, row['repo'], row['ref'])
        require(self.c.config['repositories'][row['repo']]['identity'] == row['identity'], 'REPOSITORY_IDENTITY')
        return row

    @staticmethod
    def public(row):
        value = json.loads(row['record'])
        return {k: value[k] for k in ('deploymentId', 'name', 'target', 'repo', 'service', 'revision', 'desired', 'release', 'previous')}

    def read(self, principal, args):
        action = args['action']
        if action == 'targets':
            values = []
            for name in self.c.config['principals'][principal].get('deploymentTargets', []):
                if name in self.c.config.get('deploymentTargets', {}):
                    _, target = self.target(principal, name)
                    values.append({'name': name, **target})
            return {'targets': values}
        if action == 'list':
            limit = args.get('limit', 20)
            rows = self.store.all('SELECT rowid AS cursor,* FROM deployment WHERE owner=? AND rowid>? ORDER BY rowid LIMIT ?',
                                  (principal, args.get('after', 0), limit + 1))
            values = []
            for row in rows[:limit]:
                try:
                    values.append(self.public(self.get(principal, row['id'])))
                except Fault:
                    continue
            return {'deployments': values, 'nextAfter': rows[limit - 1]['cursor'] if len(rows) > limit else None}
        row = self.get(principal, args['deploymentId'])
        if row['busy']:
            self.c.reconcile(self.c.operation(principal, row['busy']))
            row = self.get(principal, row['id'])
        record = json.loads(row['record'])
        value = {'deployment': self.public(row), 'busy': row['busy'], 'runtime': self.backend.status(record),
                 'logs': self.backend.logs(record, args.get('offset', 0), args.get('limit', 24000))}
        value['observation'] = self.c.observation(value, args.get('since'), ['SQLite', 'owned runit process', 'configured HTTP health', 'rotating log'])
        return value

    def change(self, principal, args):
        fingerprint = digest({'kind': 'deploy', 'input': args})
        old = self.store.one('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId']))
        if old:
            old = self.c.operation(principal, old['id'])
            require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
            self.c.reconcile(old)
            return Store.public(self.c.operation(principal, old['id']))
        opid = uuid.uuid4().hex
        intent = {'input': args}
        if args['action'] == 'release':
            validation = self.c.operation(principal, args['validationId'])
            require(validation['kind'] == 'validate' and validation['status'] == 'succeeded', 'VALIDATION_REQUIRED')
            vi, vr = json.loads(validation['intent']), json.loads(validation['result'])
            cfg = self.c.config['repositories'][validation['repo']]
            require(vr.get('stopped') and vr.get('exitCode') == 0 and vi['policy'] == self.c.validation_policy(cfg), 'VALIDATION_POLICY_CHANGED')
            require(self.c.executor_config(cfg).get('kind') == 'native', 'NATIVE_FEATURE_REQUIRED')
            target_name, target = self.target(principal, args.get('target'))
            ident = digest({'owner': principal, 'target': target_name, 'name': args['name']})[:32]
            row = self.store.one('SELECT * FROM deployment WHERE id=?', (ident,))
            if row:
                row = self.get(principal, ident)
                require(row['repo'] == validation['repo'] and row['identity'] == cfg['identity'], 'DEPLOYMENT_PROJECT_CHANGED')
            initial = {'deploymentId': ident, 'name': args['name'], 'target': target_name, 'repo': validation['repo'],
                       'service': target['servicePrefix'] + ident, 'revision': 0, 'desired': 'removed', 'release': None,
                       'previous': None, 'runner': str(Path(__file__).with_name('deployment_runtime.py').resolve())}
            old_record = json.loads(row['record']) if row else initial
            files = self.c.git(validation['repo']).export(vi['candidate'])
            manifest = {'validationId': validation['id'], 'candidate': vi['candidate'], 'command': args['command'],
                        'health': args['health'], 'environment': vi['execution']['env'],
                        'files': {f['path']: {'mode': f['mode'], 'digest': digest(base64.b64decode(f['data']))} for f in files}}
            require(all('\0' not in v for v in (manifest['command'], *manifest['environment'].values())), 'ENV')
            intent.update(manifest=manifest, repositoryIdentity=cfg['identity'])
            record = {**old_record, 'previous': old_record['release'], 'release': digest(manifest), 'desired': 'up'}
            repo, ref, repository_identity = validation['repo'], validation['ref'], cfg['identity']
        else:
            row = self.get(principal, args['deploymentId'])
            ident, target_name = row['id'], row['target']
            _, target = self.target(principal, target_name, row['target_digest'])
            repo, ref, repository_identity = row['repo'], row['ref'], row['identity']
            old_record = json.loads(row['record'])
            record = dict(old_record)
            if args['action'] == 'rollback':
                require(record['previous'], 'DEPLOYMENT_NO_PREVIOUS_RELEASE')
                record.update(release=record['previous'], previous=record['release'], desired='up')
            else:
                record['desired'] = {'start': 'up', 'stop': 'down', 'remove': 'removed'}[args['action']]
                require(record['release'] or args['action'] == 'remove', 'DEPLOYMENT_NO_RELEASE')
            if record['desired'] == 'up':
                manifest = verify_release(self.backend.root(record) / 'releases' / record['release'])
                validation = self.c.operation(principal, manifest['validationId'])
                require(json.loads(validation['intent'])['policy'] == self.c.validation_policy(self.c.config['repositories'][repo]), 'VALIDATION_POLICY_CHANGED')
        record['revision'] += 1
        intent.update(deploymentId=ident, repositoryIdentity=repository_identity, old=old_record, new=record)
        with self.store.tx() as db:
            old = db.execute('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId'])).fetchone()
            if old:
                require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
                return Store.public(dict(old))
            current = db.execute('SELECT * FROM deployment WHERE id=?', (ident,)).fetchone()
            require(not current or not current['busy'], 'DEPLOYMENT_BUSY')
            revision = json.loads(current['record'])['revision'] if current else 0
            require(revision == old_record['revision'] == args.get('expectedRevision', revision), 'STALE_DEPLOYMENT')
            if not current:
                db.execute('INSERT INTO deployment(id,owner,repo,ref,identity,target,target_digest,record) VALUES(?,?,?,?,?,?,?,?)',
                           (ident, principal, repo, ref, repository_identity, target_name, digest(target), canonical(old_record).decode()))
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,repo,ref,status,effect,intent) VALUES(?,?,?,?, 'deploy',?,?, 'running','none',?)",
                       (opid, principal, args['requestId'], fingerprint, repo, ref, canonical(intent).decode()))
            db.execute('UPDATE deployment SET busy=? WHERE id=?', (opid, ident))
        self.advance(self.store.one('SELECT * FROM operation WHERE id=?', (opid,)))
        return Store.public(self.store.one('SELECT * FROM operation WHERE id=?', (opid,)))

    def finish(self, row, record, failure=None):
        with self.store.tx() as db:
            current = db.execute('SELECT busy FROM deployment WHERE id=?', (record['deploymentId'],)).fetchone()
            require(current['busy'] == row['id'], 'DEPLOYMENT_WRITER_CHANGED')
            db.execute('UPDATE deployment SET record=?,busy=NULL WHERE id=?', (canonical(record).decode(), record['deploymentId']))
            result = {'deploymentId': record['deploymentId'], 'revision': record['revision'], 'release': record['release'], 'desired': record['desired'], 'rolledBack': failure is not None}
            db.execute("UPDATE operation SET status=?,effect='committed',result=?,error=? WHERE id=?",
                       ('failed' if failure else 'succeeded', canonical(result).decode(), canonical(failure).decode() if failure else None, row['id']))

    def advance(self, row):
        intent = json.loads(row['intent'])
        root = self.backend.root(intent['new'])
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
        with open(root / 'mutation.lock', 'a+b') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            row = self.store.one('SELECT * FROM operation WHERE id=?', (row['id'],))
            if row['status'] not in ('running', 'unknown'):
                return
            journal = root / ('operation-' + row['id'] + '.json')
            if journal.exists():
                j = json.loads(journal.read_bytes())
                if j['phase'] == 'committed':
                    self.finish(row, j['record'], j.get('failure'))
                    return
                # Interrupted changes return to the previous known release. Never repeat
                # an uncertain activation as a new success, or silently retry its command.
                failure = Fault('DEPLOYMENT_INTERRUPTED', 'Previous desired release restored', 'committed').value
            else:
                try:
                    self.backend.backend.preflight()
                    service = self.backend.service(intent['new'])
                    if service.exists() or service.is_symlink():
                        self.backend.owned(intent['old'])
                    # A pre-dispatch reconciliation must still use current adopted
                    # validation policy, even after controller restart/config change.
                    if 'manifest' in intent:
                        validation = self.c.operation(row['owner'], intent['manifest']['validationId'])
                        require(json.loads(validation['intent'])['policy'] == self.c.validation_policy(self.c.config['repositories'][row['repo']]), 'VALIDATION_POLICY_CHANGED')
                    if 'manifest' in intent:
                        self.backend.prepare(intent['new'], intent['manifest'], self.c.git(row['repo']).export(intent['manifest']['candidate']))
                except Fault as error:
                    self.c.fail(row['id'], error)
                    with self.store.tx() as db:
                        db.execute('UPDATE deployment SET busy=NULL WHERE busy=?', (row['id'],))
                    return
                self.c.save_intent(row['id'], deploymentDispatch=True)
                atomic_write(journal, canonical({'phase': 'changing'}))
                try:
                    self.backend.apply(intent['new'], row['id'])
                    atomic_write(journal, canonical({'phase': 'committed', 'record': intent['new']}))
                    self.finish(row, intent['new'])
                    return
                except Exception as error:
                    failure = (error.value if isinstance(error, Fault) else Fault('DEPLOYMENT_FAILED', type(error).__name__).value)
                    failure = {**failure, 'effect': 'committed'}
            try:
                self.backend.apply(intent['old'], row['id'] + '-rollback')
                atomic_write(journal, canonical({'phase': 'committed', 'record': intent['old'], 'failure': failure}))
                self.finish(row, intent['old'], failure)
            except Exception as error:
                code = (error.value['code'] + ': ' + error.value['message']) if isinstance(error, Fault) else type(error).__name__
                self.c.fail(row['id'], Fault('DEPLOYMENT_RECOVERY_REQUIRED', code, 'unknown'))
