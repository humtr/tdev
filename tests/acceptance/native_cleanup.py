"""Retained publication fixtures and actual local deletion gaps; no product fault switches.

Publication admission belongs to P3. Seed its retained task facts offline here to qualify
P2 deletion/recovery independently, without advertising a publication handler.
"""
import http.client
import json
import os
import shutil
import sqlite3
import sys
import threading
import time
import unittest

from acceptance.harness import Runtime, eventually, git


class NativeCleanupTest(unittest.TestCase):
    def setUp(self):
        r = self.runtime = Runtime(request_timeout_seconds=45)
        self.addCleanup(r.close)
        self.task = r.call('task', {'action': 'start', 'requestId': 'start', 'repo': 'test'})['result']
        self.args = {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': self.task['taskId']}
        r.stop()
        tree = git('--git-dir=' + str(r.remote), 'rev-parse', r.head + '^{tree}')
        self.published = git('--git-dir=' + str(r.remote), 'commit-tree', tree, '-p', r.head, '-m', 'retained publication')
        git('--git-dir=' + str(r.remote), 'update-ref', self.task['ref'], self.published)
        self.sql('UPDATE task SET published_oid=?,ref_state=\'published\',closed=1 WHERE id=? AND owner=\'alice\'', (self.published, self.task['taskId']))
        r.start()

    def sql(self, statement, params=()):
        connection = sqlite3.connect(self.runtime.state / 'state.sqlite')
        try:
            connection.execute(statement, params)
            connection.commit()
        finally: connection.close()

    def inspect(self):
        return self.runtime.call('task', {'action': 'inspect', 'taskId': self.task['taskId']})

    def head(self):
        return git('--git-dir=' + str(self.runtime.remote), 'for-each-ref', '--format=%(objectname)', self.task['ref'])

    def forget_ref(self):
        git('--git-dir=' + str(self.runtime.remote), 'update-ref', '--no-deref', '-d', self.task['ref'])

    def error(self, tool, request, code):
        reply = self.runtime.request('tools/call', {'name': 'tdev_' + tool, 'arguments': {'request': request}})[2]['result']['structuredContent']
        self.assertFalse(reply['ok'], reply)
        self.assertEqual(reply['error']['code'], code, reply)
        return reply['error']

    def barrier(self, phase):
        r = self.runtime
        r.stop()
        utilities = r.root / 'utilities'
        utilities.mkdir(mode=0o700)
        self.marker, self.release, self.done, self.calls, self.broken = [r.root / name for name in ('cleanup-gap', 'release', 'done', 'deletions', 'broken-observation')]
        wrapper = utilities / 'git'
        real = shutil.which('git')
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json,subprocess,sys,time\nfrom pathlib import Path\n' +
            f'phase={phase!r}; branch={self.task["ref"]!r}; marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); calls=Path({str(self.calls)!r}); broken=Path({str(self.broken)!r})\n' +
            f'real={real!r}; remote={str(r.remote)!r}; replacement={r.head!r}\n' +
            'args=sys.argv[1:]; deleting="update-ref" in args and "-d" in args and branch in args\n' +
            'if broken.exists() and "ls-remote" in args: sys.exit(129)\n' +
            'if deleting:\n'
            ' with calls.open("a") as output: output.write(json.dumps(args)+"\\n")\n' +
            'if phase == "race" and deleting: subprocess.check_call([real,"--git-dir="+remote,"update-ref",branch,replacement])\n' +
            'if phase == "failure" and deleting: sys.exit(129)\n' +
            'candidate=(phase == "preflight" and "ls-remote" in args and args[-1] == branch) or (phase in ("before-delete","after-delete") and deleting)\n' +
            'code=None\n' +
            'if phase != "before-delete": code=subprocess.call([real,*args])\n' +
            'if candidate and not marker.exists():\n'
            ' staged=marker.with_suffix(".next"); staged.write_text(json.dumps(args)); staged.replace(marker)\n'
            ' end=time.monotonic()+25\n'
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n'
            ' done.touch()\n' +
            'if phase == "before-delete": code=129 if deleting else subprocess.call([real,*args])\n'
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(utilities) + os.pathsep + os.environ['PATH']
        r.start()

    def invoke(self):
        self.replies, self.failures = [], []
        def call():
            try: self.replies.append(self.runtime.call('task', self.args))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: self.failures.append(error)
        caller = threading.Thread(target=call, daemon=True)
        caller.start()
        return caller

    def wait_gap(self, caller):
        eventually(lambda: self.marker.exists() or not caller.is_alive(), bool, seconds=30)
        self.assertTrue(self.marker.exists(), (self.replies, self.failures))

    def finish(self, caller):
        self.release.touch()
        caller.join(timeout=12)
        if self.marker.exists(): eventually(lambda: self.done.exists(), bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(self.failures, self.failures)

    def count(self):
        return len(self.calls.read_text().splitlines()) if self.calls.exists() else 0

    def test_exact_retained_publication_deletion_keeps_source_and_original_receipt(self):
        r = self.runtime
        self.assertNotEqual(self.published, self.task['checkpoint'])
        self.assertEqual(self.inspect()['refCleanup'], 'ready')
        done = r.call('task', self.args)
        self.assertEqual((done['status'], done['effect']), ('succeeded', 'committed'), done)
        current = self.inspect()
        self.assertEqual((current['task']['published_oid'], current['task']['checkpoint'], current['refCleanup']), (self.published, self.task['checkpoint'], 'done'))
        self.assertEqual(self.head(), '')
        git('--git-dir=' + str(r.remote), 'update-ref', self.task['ref'], self.published)
        r.restart()
        self.assertEqual(r.call('task', self.args), done)
        self.assertEqual(self.head(), self.published)
        rejected = r.call('task', {**self.args, 'requestId': 'new-cleanup'})
        self.assertEqual(rejected['error']['code'], 'REF_NOT_OWNED')

    def test_checked_out_linked_branch_and_changed_publication_are_preserved(self):
        r = self.runtime
        linked = r.root / 'linked'
        git('--git-dir=' + str(r.remote), 'worktree', 'add', str(linked), self.task['ref'].removeprefix('refs/heads/'))
        (linked / 'a.txt').write_text('dirty user content')
        gitdir = (linked / '.git').read_text().strip().removeprefix('gitdir: ')
        from pathlib import Path
        index_path = Path(gitdir) / 'index'
        index = index_path.read_bytes()
        denied = r.call('task', self.args)
        self.assertEqual((denied['status'], denied['effect'], denied['error']['code']), ('failed', 'none', 'REF_CHECKED_OUT'))
        self.assertEqual(self.head(), self.published)
        self.assertEqual((linked / 'a.txt').read_text(), 'dirty user content')
        self.assertEqual(index_path.read_bytes(), index)
        git('switch', '--detach', cwd=linked)
        git('--git-dir=' + str(r.remote), 'update-ref', self.task['ref'], r.head)
        changed = r.call('task', {**self.args, 'requestId': 'changed'})
        self.assertEqual(changed['error']['code'], 'REF_NOT_OWNED')
        self.assertEqual(self.head(), r.head)

    def test_death_before_dispatch_journal_never_deletes_a_proved_ref(self):
        r = self.runtime
        self.barrier('preflight')
        caller = self.invoke()
        try:
            self.wait_gap(caller)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': 'cleanup'})
            self.assertEqual((pending['status'], pending['effect']), ('running', 'none'))
            r.stop()
        finally: self.finish(caller)
        r.start()
        failed = r.call('task', self.args)
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', 'INTERRUPTED'))
        self.assertEqual(self.head(), self.published)
        self.assertEqual(self.count(), 0)
        self.assertIsNone(self.inspect()['task']['busy'])

    def test_death_after_journal_keeps_unknown_writer_without_repeating_delete(self):
        r = self.runtime
        self.barrier('before-delete')
        caller = self.invoke()
        try:
            self.wait_gap(caller)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': 'cleanup'})
            self.assertEqual((pending['status'], pending['effect']), ('unknown', 'unknown'))
            r.stop()
        finally: self.finish(caller)
        r.start()
        for _ in range(2):
            self.assertEqual(r.call('task', self.args)['id'], pending['id'])
            self.assertEqual(r.status(pending['id'])['status'], 'unknown')
        self.assertEqual(self.count(), 1)
        self.assertEqual(self.head(), self.published)
        self.error('task', {**self.args, 'requestId': 'repeat'}, 'TASK_BUSY')
        self.assertEqual(self.inspect()['refCleanup'], 'observe')
        fresh = r.call('task', {'action': 'start', 'requestId': 'unrelated', 'repo': 'test'})
        self.assertEqual(fresh['status'], 'succeeded')
        self.forget_ref()
        done = r.status(pending['id'])
        self.assertEqual(done['status'], 'succeeded')
        self.assertEqual(self.inspect()['refCleanup'], 'done')
        self.assertEqual(self.count(), 1)

    def test_active_absence_cannot_complete_before_worker_death_then_inspect_reconciles(self):
        r = self.runtime
        self.barrier('after-delete')
        caller = self.invoke()
        try:
            self.wait_gap(caller)
            self.assertEqual(self.head(), '')
            pending = r.call('task', self.args)
            self.assertEqual(pending['status'], 'unknown')
            self.assertEqual(self.inspect()['refCleanup'], 'observe')
            before = time.monotonic()
            r.call('workspace', {'action': 'create', 'requestId': 'available', 'name': 'Available'})
            self.assertLess(time.monotonic()-before, 3)
            r.stop()
        finally: self.finish(caller)
        r.start()
        self.assertEqual(self.inspect()['refCleanup'], 'done')
        self.assertEqual(r.call('task', self.args)['status'], 'succeeded')
        self.assertEqual(self.count(), 1)

    def test_exact_cas_race_retains_foreign_ref_and_unknown_until_absence(self):
        r = self.runtime
        self.barrier('race')
        original = r.call('task', self.args)
        self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'), original)
        self.assertEqual(self.head(), r.head)
        r.restart()
        self.assertEqual(r.call('task', self.args), original)
        self.assertEqual(self.count(), 1)
        self.forget_ref()
        self.assertEqual(r.status(original['id'])['status'], 'succeeded')

    def test_observation_errors_and_revoked_authority_keep_uncertainty_without_dispatch(self):
        r = self.runtime
        self.barrier('failure')
        original = r.call('task', self.args)
        self.assertEqual(original['status'], 'unknown', original)
        r.config['principals']['alice']['managedRefNamespaces'] = {}
        r.save_config()
        self.error('task', self.args, 'PERMISSION_DENIED')
        self.error('operation', {'action': 'status', 'operationId': original['id']}, 'PERMISSION_DENIED')
        r.config['principals']['alice']['managedRefNamespaces'] = {'test': ['refs/heads/work/']}
        identity = r.config['repositories']['test']['identity']
        r.config['repositories']['test']['identity'] = 'local:0:0'
        r.save_config()
        self.error('task', self.args, 'REPOSITORY_IDENTITY')
        r.config['repositories']['test']['identity'] = identity
        r.save_config()
        self.forget_ref()
        self.broken.touch()
        self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(self.inspect()['refCleanup'], 'observe')
        self.broken.unlink()
        self.assertEqual(r.call('task', self.args)['status'], 'succeeded')
        self.assertEqual(self.count(), 1)

    def test_absence_cannot_retire_a_task_with_an_uncertain_publication_writer(self):
        r = self.runtime
        r.stop()
        self.forget_ref()
        self.sql("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) VALUES('publication-unknown','alice','publication-unknown',?,'publish',?,'test',?,'unknown','unknown',?)", ('a'*64,self.task['taskId'],self.task['ref'],json.dumps({'construction':'managed-ref-publication','input':{'requestId':'publication-unknown','validationId':'future-validation'}})))
        self.sql("UPDATE task SET busy='publication-unknown',published_oid=NULL,ref_state='reserved' WHERE id=?", (self.task['taskId'],))
        r.start()
        self.error('task', self.args, 'TASK_BUSY')
        current = self.inspect()
        self.assertEqual((current['refCleanup'],current['task']['busy'],current['active']['status']), ('observe','publication-unknown','unknown'))
        self.error('operation', {'action':'status','lookupRequestId':'cleanup'}, 'OPERATION_NOT_FOUND')
        self.assertEqual(self.head(), '')

    def test_delete_followed_by_sql_failure_reports_unknown_and_reconciles_original(self):
        r = self.runtime
        r.stop()
        self.sql("CREATE TRIGGER block_cleanup BEFORE UPDATE OF ref_state ON task WHEN NEW.ref_state='deleted' BEGIN SELECT RAISE(ABORT,'fixture completion failure'); END")
        r.start()
        error = self.error('task', self.args, 'REF_CLEANUP_UNKNOWN')
        self.assertEqual(error['effect'], 'unknown')
        self.assertEqual(self.head(), '')
        r.stop()
        self.sql('DROP TRIGGER block_cleanup')
        r.start()
        done = r.call('task', self.args)
        self.assertEqual((done['id'],done['status']), (error['operationId'],'succeeded'))
        self.assertEqual(self.inspect()['refCleanup'], 'done')
