"""Retained predecessor admission/pin failures through actual native HTTP."""
import http.client
from contextlib import closing
import json
import os
import shutil
import sqlite3
import sys
import threading
import time

from acceptance.harness import eventually, git
from acceptance.test_predecessor import PredecessorCase


class NativePredecessorTest(PredecessorCase):
    def barrier(self):
        r = self.runtime
        r.stop()
        utilities = r.root / 'utilities'
        utilities.mkdir(mode=0o700)
        self.marker, self.release, self.done, self.calls = [r.root / name for name in
            ('predecessor-gap', 'release', 'done', 'git-calls')]
        real = shutil.which('git')
        wrapper = utilities / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json,subprocess,sys,time\nfrom pathlib import Path\n' +
            f'real={real!r}; published={self.published!r}; marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); calls=Path({str(self.calls)!r})\n' +
            'args=sys.argv[1:]\n'
            'with calls.open("a") as output: output.write(json.dumps(args)+"\\n")\n'
            'code=subprocess.call([real,*args])\n'
            'if "update-ref" in args and "refs/tdev/objects/"+published in args and not marker.exists():\n'
            ' staged=marker.with_suffix(".next"); staged.write_text(json.dumps(args)); staged.replace(marker)\n'
            ' end=time.monotonic()+25\n'
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n'
            ' done.touch()\n'
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(utilities) + os.pathsep + os.environ['PATH']
        r.start()

    def invoke(self, args):
        self.replies, self.failures = [], []
        def call():
            try: self.replies.append(self.runtime.call('task', args))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: self.failures.append(error)
        caller = threading.Thread(target=call, daemon=True)
        caller.start()
        eventually(lambda: self.marker.exists() or not caller.is_alive(), bool, seconds=30)
        self.assertTrue(self.marker.exists(), (self.replies, self.failures))
        return caller

    def finish(self, caller):
        self.release.touch()
        caller.join(timeout=12)
        eventually(lambda: self.done.exists(), bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(self.failures, self.failures)

    def intent(self, request):
        with closing(sqlite3.connect('file:' + str(self.runtime.state / 'state.sqlite') + '?mode=ro', uri=True)) as db:
            row = db.execute('SELECT id,intent FROM operation WHERE owner=? AND request=?',
                             ('alice', request)).fetchone()
        return row[0], json.loads(row[1])

    def test_pin_gap_death_preserves_original_predecessor_and_never_reconstructs_on_replay(self):
        r = self.runtime
        self.predecessor()
        self.result('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': self.source['taskId']})
        self.barrier()
        args = self.args()
        caller = self.invoke(args)
        try:
            opid, intent = self.intent(args['requestId'])
            frozen = intent['resolved']
            self.assertEqual((frozen['fromTaskId'], frozen['base'], frozen['sourceRef']),
                             (self.source['taskId'], self.published, 'refs/heads/main'))
            pending = self.result('operation', {'action': 'status', 'operationId': opid})
            self.assertEqual((pending['status'], pending['effect'], pending['task']), ('running', 'none', None))
            self.assertEqual(self.result('task', args)['id'], opid)
            before = time.monotonic()
            self.result('workspace', {'action': 'create', 'requestId': 'available', 'name': 'Available'})
            self.assertLess(time.monotonic() - before, 3)
            r.stop()
        finally: self.finish(caller)
        self.assertFalse(self.replies, self.replies)
        r.start()
        before = self.calls.read_text()
        recovered = self.result('task', args)
        self.assertEqual((recovered['id'], recovered['status'], recovered['effect'], recovered['error']['code']),
                         (opid, 'failed', 'none', 'INTERRUPTED'))
        r.restart()
        self.assertEqual(self.result('task', args), recovered)
        self.assertEqual(self.intent(args['requestId'])[1]['resolved'], frozen)
        self.assertEqual(self.calls.read_text(), before)
        fresh = self.result('task', self.args('fresh'))
        self.assertEqual(fresh['result']['base'], self.published)
        self.assertNotEqual(fresh['result']['ref'], frozen['ref'])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')

    def test_independent_source_edit_and_cleanup_after_admission_do_not_retarget_new_work(self):
        r = self.runtime
        self.predecessor()
        r.stop()
        self.sql('UPDATE task SET closed=0 WHERE id=?', (self.source['taskId'],))
        r.start()
        self.barrier()
        caller = self.invoke(self.args())
        try:
            source = self.result('task', {'action': 'inspect', 'taskId': self.source['taskId']})['task']
            self.assertIsNone(source['busy'])
            edited = self.result('edit', {'requestId': 'independent-edit', 'taskId': self.source['taskId'],
                'expected': self.later, 'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'later', 'text': 'independent'}]})
            self.assertEqual(edited['status'], 'succeeded')
            cleaned = self.result('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': self.source['taskId']})
            self.assertEqual(cleaned['status'], 'succeeded')
        finally: self.finish(caller)
        child = self.replies[0]
        self.assertEqual((child['status'], child['result']['base'], child['result']['checkpoint']),
                         ('succeeded', self.published, self.published))
        source = self.result('task', {'action': 'inspect', 'taskId': self.source['taskId']})
        self.assertEqual((source['task']['checkpoint'], source['refCleanup']), (edited['result']['checkpoint'], 'done'))

    def test_frozen_receipt_access_requires_predecessor_scope_and_enrolled_identity(self):
        r = self.runtime
        self.predecessor()
        self.barrier()
        args = self.args()
        caller = self.invoke(args)
        try:
            opid, _ = self.intent(args['requestId'])
            r.config['principals']['alice']['managedRefNamespaces']['test'] = []
            r.save_config()
            for tool, request in (('task', args), ('operation', {'action': 'status', 'operationId': opid})):
                self.assertFalse(self.call(tool, request)['ok'])
        finally: self.finish(caller)
        self.assertEqual(self.replies[0]['status'], 'succeeded')
        r.config['principals']['alice']['managedRefNamespaces']['test'] = ['refs/heads/work/']
        r.save_config()
        original = self.result('task', args)
        r.restart()
        identity = r.config['repositories']['test']['identity']
        r.config['repositories']['test']['identity'] = 'local:0:0'
        r.save_config()
        for tool, request in (('task', args), ('operation', {'action': 'status', 'operationId': original['id']})):
            self.assertFalse(self.call(tool, request)['ok'])
        r.config['repositories']['test']['identity'] = identity
        r.save_config()
        self.assertEqual(self.result('task', args), original)

    def test_missing_or_noncommit_private_publication_fails_without_remote_fetch_fallback(self):
        r = self.runtime
        self.predecessor()
        r.stop()
        tree = git('--git-dir=' + str(r.remote), 'rev-parse', r.head + '^{tree}')
        missing = git('--git-dir=' + str(r.remote), 'commit-tree', tree, '-p', r.head, '-m', 'only remote')
        self.sql('UPDATE task SET published_oid=? WHERE id=?', (missing, self.source['taskId']))
        r.start()
        failed = self.result('task', self.args('missing-object'))
        self.assertEqual((failed['status'], failed['effect']), ('failed', 'none'))
        r.stop()
        blob = git('--git-dir=' + str(self.retained_git), 'rev-parse', self.published + ':a.txt')
        self.sql('UPDATE task SET published_oid=? WHERE id=?', (blob, self.source['taskId']))
        r.start()
        failed = self.result('task', self.args('noncommit'))
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', 'COMMIT_REQUIRED'))
        r.restart()
        self.assertEqual(self.result('task', self.args('noncommit')), failed)
        self.assertEqual(len(self.result('task', {'action': 'list', 'includeClosed': True})['tasks']), 1)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', self.source['ref']), self.published)

    def test_uncertain_publication_blocks_continuation_without_clearing_original_writer(self):
        r = self.runtime
        self.predecessor()
        r.stop()
        self.sql("UPDATE task SET ref_state='reserved' WHERE id=?", (self.source['taskId'],))
        r.start()
        self.error('task', self.args('unproved-state'), 'PUBLISHED_TASK_REQUIRED')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'unproved-state'}, 'OPERATION_NOT_FOUND')
        r.stop()
        self.sql("UPDATE task SET ref_state='published' WHERE id=?", (self.source['taskId'],))
        self.sql("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) VALUES('publisher','alice','publish',?,'publish',?,'test',?,'unknown','unknown',?)",
                 ('a' * 64, self.source['taskId'], self.source['ref'], json.dumps({'input': {'action': 'publish'}})))
        self.sql("UPDATE task SET busy='publisher' WHERE id=?", (self.source['taskId'],))
        git('--git-dir=' + str(r.remote), 'update-ref', '-d', self.source['ref'])
        r.start()
        self.error('task', self.args(), 'PUBLISHED_TASK_REQUIRED')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'continue'}, 'OPERATION_NOT_FOUND')
        source = self.result('task', {'action': 'inspect', 'taskId': self.source['taskId']})
        self.assertEqual((source['task']['busy'], source['refCleanup'], source['active']['status']),
                         ('publisher', 'observe', 'unknown'))
