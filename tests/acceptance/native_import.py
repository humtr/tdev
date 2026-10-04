"""Observed scan changes and actual import-pin controller death without product hooks."""
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


class NativeImportTest(unittest.TestCase):
    def setUp(self):
        r = self.runtime = Runtime()
        self.addCleanup(r.close)
        r.config['projectPolicies'] = {'local': {'kind': 'local', 'root': str(r.root),
            'managedRefNamespace': 'refs/heads/imports/', 'validation': 'true'}}
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.save_config()
        self.repo = r.call('project', {'action': 'connect', 'requestId': 'connect',
            'policy': 'local', 'name': 'authored'})['result']['repo']

    def barrier(self, phase):
        r = self.runtime
        r.stop()
        wrappers = r.root / 'utilities'
        wrappers.mkdir(mode=0o700)
        self.marker, self.release, self.done = [r.root / name for name in ('import-gap', 'release', 'done')]
        real_git = shutil.which('git')
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json, os, subprocess, sys, time\nfrom pathlib import Path\n' +
            f'marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); counter=Path({str(r.root / "counter")!r})\n' +
            f'args=sys.argv[1:]; phase={phase!r}\n' +
            'candidate=(phase == "scan" and "ls-files" in args and "--stage" in args) or (phase == "pin" and "update-ref" in args and any(a.startswith("refs/tdev/objects/") for a in args))\n' +
            'count=0\n' +
            'if candidate:\n' +
            ' count=int(counter.read_text())+1 if counter.exists() else 1\n' +
            ' counter.write_text(str(count))\n' +
            f'code=subprocess.call([{real_git!r}, *args])\n' +
            'if candidate and count == 2 and not release.exists():\n' +
            ' marker.write_text(json.dumps(args))\n' +
            ' end=time.monotonic()+20\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' done.touch()\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()

    def invoke(self, request):
        self.replies, self.failures = [], []
        def invoke():
            try: self.replies.append(self.runtime.call('task', request))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: self.failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        return caller

    def release_caller(self, caller):
        self.release.touch()
        caller.join(timeout=8)
        eventually(lambda: self.done.exists(), bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(self.failures, self.failures)

    def intent(self, request):
        connection = sqlite3.connect('file:' + str(self.runtime.state / 'state.sqlite') + '?mode=ro', uri=True)
        try:
            row = connection.execute('SELECT intent FROM operation WHERE owner=? AND request=?', ('alice', request)).fetchone()
            return json.loads(row[0])
        finally: connection.close()

    def scan_change(self, change):
        r = self.runtime
        (r.work / 'a.txt').write_text('initial local changes')
        self.barrier('scan')
        args = {'action': 'start', 'requestId': 'changing', 'repo': self.repo, 'localChanges': True}
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': 'changing'})
            self.assertEqual((pending['status'], pending['task']), ('running', None))
            resolved = self.intent('changing')['resolved']
            st = r.work.stat()
            self.assertEqual((resolved['checkout'], resolved['checkoutIdentity']),
                (str(r.work), f'local:{st.st_dev}:{st.st_ino}'))
            change(r)
            index = (r.work / '.git/index').read_bytes()
            before = time.monotonic()
            r.call('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Available'})
            self.assertLess(time.monotonic() - before, 3)
        finally: self.release_caller(caller)
        result = self.replies[0]
        self.assertEqual((result['status'], result['effect'], result['error']['code']),
            ('failed', 'none', 'CHECKOUT_CHANGED'), result)
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual(git('for-each-ref', '--format=%(refname)', cwd=r.work), 'refs/heads/main')
        r.restart()
        self.assertEqual(r.call('task', args), result)

    def test_file_bytes_changed_between_scans_cannot_commit_task(self):
        self.scan_change(lambda r: (r.work / 'a.txt').write_text('concurrent editor'))
        self.assertEqual((self.runtime.work / 'a.txt').read_text(), 'concurrent editor')

    def test_metadata_change_with_identical_bytes_cannot_commit_task(self):
        def change(r):
            st = (r.work / 'a.txt').stat()
            os.utime(r.work / 'a.txt', ns=(st.st_atime_ns, st.st_mtime_ns + 2_000_000_000))
        self.scan_change(change)
        self.assertEqual((self.runtime.work / 'a.txt').read_text(), 'initial local changes')

    def test_index_selection_change_without_file_changes_cannot_commit_task(self):
        self.scan_change(lambda r: git('add', 'a.txt', cwd=r.work))
        self.assertEqual((self.runtime.work / 'a.txt').read_text(), 'initial local changes')

    def test_import_pin_gap_kill_never_repeats_scan_or_commits_partial_task(self):
        r = self.runtime
        (r.work / 'a.txt').write_text('frozen local changes')
        index = (r.work / '.git/index').read_bytes()
        self.barrier('pin')
        args = {'action': 'start', 'requestId': 'interrupted-import', 'repo': self.repo, 'localChanges': True}
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            original = self.intent(args['requestId'])
            self.assertEqual((pending['status'], pending['task']), ('running', None))
            command = json.loads(self.marker.read_text())
            pin = command[command.index('update-ref') + 1]
            self.assertNotEqual(pin, 'refs/tdev/objects/' + r.head)
            private = command[command.index('--git-dir') + 1]
            self.assertEqual(git('--git-dir=' + private, 'show', pin + ':a.txt'), 'frozen local changes')
            r.stop()
        finally: self.release_caller(caller)
        self.assertFalse(self.replies)
        (r.work / 'a.txt').write_text('new local changes')
        r.start()
        recovered = r.status(pending['id'])
        self.assertEqual((recovered['status'], recovered['effect'], recovered['error']['code']),
            ('failed', 'none', 'INTERRUPTED'))
        self.assertEqual(self.intent(args['requestId']), original)
        self.assertEqual(r.call('task', args), {k: v for k, v in recovered.items() if k != 'observation'})
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('for-each-ref', '--format=%(refname)', cwd=r.work), 'refs/heads/main')
        fresh = r.call('task', {**args, 'requestId': 'fresh-import'})
        self.assertEqual(fresh['status'], 'succeeded', fresh)
        self.assertNotEqual(fresh['result']['taskId'], original['resolved']['taskId'])
        self.assertNotEqual(fresh['result']['ref'], original['resolved']['ref'])

    def test_changed_config_checkout_binding_blocks_pending_and_completed_replay(self):
        r = self.runtime
        # A static grant can also explicitly enroll a working checkout.
        st, common = r.work.stat(), (r.work / '.git').stat()
        config = r.config['repositories']['test']
        config.update(remote=str(r.work / '.git'), identity=f'local:{common.st_dev}:{common.st_ino}',
            allowWorktree=True, checkout=str(r.work), checkoutIdentity=f'local:{st.st_dev}:{st.st_ino}')
        r.save_config()
        (r.work / 'a.txt').write_text('captured')
        args = {'action': 'start', 'requestId': 'bound', 'repo': 'test', 'localChanges': True}
        self.barrier('scan')
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': 'bound'})
            config['checkoutIdentity'] = 'local:0:0'
            r.save_config()
            for tool, request in [('task', args), ('operation', {'action': 'status', 'operationId': pending['id']})]:
                response = r.request('tools/call', {'name': 'tdev_' + tool, 'arguments': {'request': request}})[2]['result']['structuredContent']
                self.assertEqual(response['error']['code'], 'CHECKOUT_IDENTITY')
        finally: self.release_caller(caller)
        original = self.replies[0]
        self.assertEqual(original['status'], 'succeeded', original)
        config['checkoutIdentity'] = 'local:0:0'
        r.save_config()
        response = r.request('tools/call', {'name': 'tdev_task', 'arguments': {'request': args}})[2]['result']['structuredContent']
        self.assertEqual(response['error']['code'], 'CHECKOUT_IDENTITY')
        config['checkoutIdentity'] = f'local:{st.st_dev}:{st.st_ino}'
        r.save_config()
        self.assertEqual(r.call('task', args), original)

    def test_linked_checkout_replacement_with_same_common_directory_is_rejected(self):
        r = self.runtime
        linked = r.root / 'linked'
        git('worktree', 'add', '-b', 'linked', str(linked), cwd=r.work)
        operation = r.call('project', {'action': 'connect', 'requestId': 'second-checkout',
            'policy': 'local', 'name': 'linked'})
        # The first connection cannot rebind to another checkout of the same common directory.
        self.assertEqual(operation['error']['code'], 'PROJECT_ALREADY_CONNECTED')
        # Static enrollment lets this fixture independently exercise the checkout identity boundary.
        common, st = (r.work / '.git').stat(), linked.stat()
        config = r.config['repositories']['test']
        config.update(remote=str(r.work / '.git'), identity=f'local:{common.st_dev}:{common.st_ino}',
            allowWorktree=True, checkout=str(linked), checkoutIdentity=f'local:{st.st_dev}:{st.st_ino}',
            refs=['refs/heads/linked'], defaultRef='refs/heads/linked')
        r.config['principals']['alice']['repos']['test'] = ['refs/heads/linked']
        r.save_config()
        original = r.root / 'original-linked'
        linked.rename(original)
        linked.mkdir()
        (linked / '.git').write_bytes((original / '.git').read_bytes())
        (linked / 'a.txt').write_text('replacement data')
        failed = r.call('task', {'action': 'start', 'requestId': 'replaced-checkout',
            'repo': 'test', 'localChanges': True})
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']),
            ('failed', 'none', 'CHECKOUT_IDENTITY'))
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual((linked / 'a.txt').read_text(), 'replacement data')
        self.assertEqual((original / 'a.txt').read_text(), 'hello\n')

    def test_symlinked_parent_directory_never_supplies_source_bytes(self):
        r = self.runtime
        nested = r.work / 'nested'
        nested.mkdir()
        (nested / 'file').write_text('tracked')
        git('add', 'nested/file', cwd=r.work)
        git('commit', '-m', 'nested source', cwd=r.work)
        outside = r.root / 'outside'
        outside.mkdir()
        (outside / 'file').write_text('outside data')
        (nested / 'file').unlink()
        nested.rmdir()
        nested.symlink_to(outside, target_is_directory=True)
        # Hide the untracked link itself; its tracked child must still be selected,
        # exercising the directory-descriptor walk rather than link-target validation.
        (r.work / '.git/info').mkdir(exist_ok=True)
        (r.work / '.git/info/exclude').write_text('nested\n')
        index = (r.work / '.git/index').read_bytes()
        failed = r.call('task', {'action': 'start', 'requestId': 'parent-link',
            'repo': self.repo, 'localChanges': True})
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']),
            ('failed', 'none', 'CHECKOUT_CHANGED'))
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual((outside / 'file').read_text(), 'outside data')
