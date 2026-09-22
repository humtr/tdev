"""Explicit retained-build retirement. Operation receipts outlive their byte references."""
import base64
import json
import os
import shutil
import time
import uuid

from .common import Fault, canonical, digest, path, require
from .store import Store

DEFAULT_LIMITS = {'outputBytes': 64 * 1024 * 1024, 'inputBytes': 64 * 1024 * 1024,
                  'files': 4096, 'workingBytes': 128 * 1024 * 1024, 'timeoutSeconds': 3600,
                  'retainedBytes': 2 * 1024 * 1024 * 1024, 'retentionSeconds': 0}


def limits(controller):
    return {**DEFAULT_LIMITS, **controller.config.get('artifactLimits', {})}


def sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def storage_bytes(directory):
    # Called only after verify_storage; dependency and manifest bytes count too.
    return sum(os.lstat(os.path.join(base, name)).st_size
               for base, _, names in os.walk(directory, followlinks=False) for name in names)


class Retention:
    def __init__(self, artifacts):
        self.a, self.c = artifacts, artifacts.c

    def pin(self, principal, ident):
        row = self.c.operation(principal, ident)
        require(row['kind'] == 'artifact' and row['status'] == 'succeeded', 'ARTIFACT_NOT_RETAINED')
        pin = self.c.store.one('SELECT * FROM artifact WHERE operation=?', (ident,))
        require(pin, 'ARTIFACT_NOT_RETAINED')
        return row, pin

    def description(self, ident):
        pin = self.c.store.one('SELECT pruned FROM artifact WHERE operation=?', (ident,))
        return {'state': 'unretained' if not pin else 'pruned' if pin['pruned'] else 'retained',
                'pruneOperationId': pin['pruned'] if pin else None}

    def accounting(self):
        from .artifact_build import verify_storage
        # Backfill only old retained rows lacking size metadata. No bytes are replaced.
        for pin in self.c.store.all('SELECT * FROM artifact WHERE bytes IS NULL AND pruned IS NULL'):
            directory = self.a.objects() / pin['digest']
            verify_storage(directory, pin['digest'])
            size = storage_bytes(directory)
            with self.c.store.tx() as db:
                db.execute('UPDATE artifact SET bytes=? WHERE operation=?', (size, pin['operation']))

    def reserve(self, selected):
        self.accounting()
        used = self.c.store.one('SELECT coalesce(sum(bytes),0) AS n FROM '
                               '(SELECT max(bytes) bytes FROM artifact WHERE pruned IS NULL GROUP BY digest)')['n']
        used += self.c.store.one("SELECT coalesce(sum(a.bytes),0) AS n FROM artifact a JOIN operation p ON p.id=a.pruned "
                                "WHERE p.status IN ('running','unknown')")['n']
        pending = sum(json.loads(r['intent']).get('reservedBytes', 129 * 1024 * 1024)
                      for r in self.c.store.all("SELECT intent FROM operation WHERE kind='artifact' AND status IN ('running','unknown')"))
        reserved = selected['outputBytes'] + selected['inputBytes'] + 1024 * 1024
        require(used + pending + reserved <= selected['retainedBytes'], 'ARTIFACT_RETAINED_LIMIT',
                'Explicitly prune unpinned artifacts or adjust the operator budget; no automatic eviction')
        return reserved

    def usage(self, principal, args):
        values, count = {}, 0
        # Bounded metadata page; no content hashing or foreign-principal totals.
        unknown = 0
        limit = args.get('limit', 20)
        rows = self.c.store.all('SELECT a.*,o.rowid AS cursor FROM artifact a JOIN operation o ON o.id=a.operation '
                               'WHERE o.owner=? AND a.pruned IS NULL AND o.rowid<? ORDER BY o.rowid DESC LIMIT ?',
                               (principal, args.get('before', 9007199254740991), limit + 1))
        for row in rows[:limit]:
            try:
                self.c.operation(principal, row['operation'])
            except Fault:
                continue
            count += 1
            if row['bytes'] is None:
                unknown += 1
            else:
                values[row['digest']] = row['bytes']
        return {'retainedArtifacts': count, 'retainedObjects': len(values),
                'retainedBytes': sum(values.values()), 'unmeasuredArtifacts': unknown,
                'nextBefore': rows[limit - 1]['cursor'] if len(rows) > limit else None,
                'limits': limits(self.c), 'scope': 'this page of authorized retained objects; excludes native scratch and deployment copies; shared digests can recur on other pages'}

    def blockers(self, ident):
        reasons = set()
        # A pending build owns its native capture and reservation, not unrelated
        # retained objects. Seal reconciliation shares the lifecycle lock and can
        # restore equal bytes from that capture without re-executing the build.
        if self.c.store.one("SELECT 1 FROM operation WHERE status IN ('running','unknown') "
                            "AND json_extract(intent,'$.validationSubject')='artifact' "
                            "AND json_extract(intent,'$.artifactId')=? LIMIT 1", (ident,)):
            reasons.add('validation_in_flight')
        source = self.c.store.one('SELECT owner,repo FROM operation WHERE id=?', (ident,))
        for row in self.c.store.all('SELECT record,busy FROM deployment WHERE owner=? AND repo=?', (source['owner'], source['repo'])):
            record = json.loads(row['record'])
            records = [record] if record['desired'] != 'removed' else []
            if row['busy']:
                operation = self.c.store.one('SELECT intent FROM operation WHERE id=?', (row['busy'],))
                require(operation, 'ARTIFACT_PIN_UNKNOWN')
                intent = json.loads(operation['intent'])
                if intent.get('manifest', {}).get('artifact', {}).get('artifactId') == ident:
                    reasons.add('deployment_in_flight')
                records += [intent['old'], intent['new']]
            for selected in records:
                for field in ('release', 'previous'):
                    release = selected.get(field)
                    if not release:
                        continue
                    directory = self.c.deployments.backend.root(selected) / 'releases' / release
                    # A not-yet-prepared new release is described by its accepted intent.
                    if not directory.exists() and row['busy'] and release == intent['new'].get('release') and 'manifest' in intent:
                        manifest = intent['manifest']
                    else:
                        require(not directory.is_symlink() and not (directory / 'manifest.json').is_symlink(), 'ARTIFACT_PIN_UNKNOWN')
                        try:
                            manifest = json.loads((directory / 'manifest.json').read_bytes())
                        except (OSError, ValueError):
                            raise Fault('ARTIFACT_PIN_UNKNOWN') from None
                        require(digest(manifest) == release, 'ARTIFACT_PIN_UNKNOWN')
                    if manifest.get('artifact', {}).get('artifactId') == ident:
                        reasons.add('deployment_in_flight' if row['busy'] else 'deployment_' + field)
        return sorted(reasons)

    def preview(self, principal, ident):
        _, pin = self.pin(principal, ident)
        reasons = self.blockers(ident) if not pin['pruned'] else ['already_pruned']
        until = pin['retained_ns'] + limits(self.c)['retentionSeconds'] * 1000000000
        if not pin['pruned'] and time.time_ns() < until:
            reasons.append('retention_period')
        shared = bool(self.c.store.one('SELECT 1 FROM artifact WHERE digest=? AND operation!=? AND pruned IS NULL LIMIT 1', (pin['digest'], ident)))
        value = {'artifactId': ident, 'contentDigest': pin['digest'], 'canPrune': not reasons,
                 'pins': sorted(reasons), 'sharedObject': shared, 'retentionUntilNs': str(until),
                 'reclaimableBytes': 0 if shared or reasons else pin['bytes']}
        value['previewToken'] = digest({**value, 'policy': limits(self.c)})
        return value

    def export(self, principal, args):
        _, directory, manifest, _, identity = self.a.retained(principal, args['artifactId'])
        name = path(args['path'])
        require(name in manifest['files'], 'ARTIFACT_EXPORT_SCOPE')
        info = manifest['files'][name]
        offset = args.get('offset', 0)
        require(offset <= info['size'], 'CURSOR')
        fd = os.open(directory / 'files' / name, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as stream:
            stream.seek(offset)
            data = stream.read(args.get('limit', 49152))
        return {'artifactId': args['artifactId'], 'contentDigest': identity, 'path': name,
                'sha256': info['sha256'], 'size': info['size'], 'offset': offset,
                'nextOffset': offset + len(data), 'eof': offset + len(data) == info['size'],
                'encoding': 'base64', 'data': base64.b64encode(data).decode()}

    def prune(self, principal, args):
        fingerprint = digest({'kind': 'artifactPrune', 'input': args})
        old = self.c.store.one('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId']))
        if old:
            old = self.c.operation(principal, old['id'])
            require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
            self.c.reconcile(old)
            return Store.public(self.c.operation(principal, old['id']))
        row, pin = self.pin(principal, args['artifactId'])
        preview = self.preview(principal, row['id'])
        require(preview['canPrune'], 'ARTIFACT_PINNED', ', '.join(preview['pins']))
        require(args['expectedPreview'] == preview['previewToken'], 'ARTIFACT_PRUNE_STALE')
        # Verify the owned source directory before accepting destructive work.
        _, directory, _, _, _ = self.a.retained(principal, row['id'])
        size = storage_bytes(directory)
        opid = uuid.uuid4().hex
        intent = {'input': args, 'repositoryIdentity': json.loads(row['intent'])['repositoryIdentity'],
                  'artifactPrune': {'artifactId': row['id'], 'contentDigest': pin['digest']}}
        with self.c.store.tx() as db:
            require(db.execute("SELECT count(*) FROM operation WHERE owner=? AND status IN ('running','unknown') "
                               "AND json_extract(intent,'$.artifactPrune') IS NOT NULL", (principal,)).fetchone()[0] < 8,
                    'ARTIFACT_PRUNE_LIMIT')
            db.execute('PRAGMA user_version=5')
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) "
                       "VALUES(?,?,?,?,'operation',?,?,?,'running','unknown',?)",
                       (opid, principal, args['requestId'], fingerprint, row['task'], row['repo'], row['ref'], canonical(intent).decode()))
            db.execute('UPDATE artifact SET pruned=?,bytes=? WHERE operation=? AND pruned IS NULL', (opid, size, row['id']))
        self.c.reconcile(self.c.operation(principal, opid))
        return Store.public(self.c.operation(principal, opid))

    def reconcile(self, row):
        selected = json.loads(row['intent'])['artifactPrune']
        ident, content = selected['artifactId'], selected['contentDigest']
        objects = self.a.objects()
        trash = objects / ('.prune-' + row['id'])
        target = objects / content
        pin = self.c.store.one('SELECT * FROM artifact WHERE operation=?', (ident,))
        require(pin and pin['pruned'] == row['id'] and pin['digest'] == content, 'ARTIFACT_PRUNE_IDENTITY')
        require(not trash.is_symlink() and not target.is_symlink(), 'ARTIFACT_STORAGE_TYPE')
        shared = bool(self.c.store.one('SELECT 1 FROM artifact WHERE digest=? AND pruned IS NULL LIMIT 1', (content,)))
        if not shared and target.exists():
            require(not trash.exists(), 'ARTIFACT_PRUNE_CONFLICT')
            os.rename(target, trash)
            sync(objects)
        if trash.exists():
            shutil.rmtree(trash)
            sync(objects)
        result = {'artifactId': ident, 'contentDigest': content, 'pruned': True, 'sharedObject': shared}
        with self.c.store.tx() as db:
            db.execute("UPDATE operation SET status='succeeded',effect='committed',result=?,error=NULL WHERE id=?",
                       (canonical(result).decode(), row['id']))
