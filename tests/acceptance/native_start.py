"""Managed admission gaps through actual HTTP and owned Git utility barriers."""
import http.client
import json
import os
import shutil
import sqlite3
import sys
import threading
import time
import unittest

import jsonschema
from acceptance.harness import Runtime, eventually, git


class NativeStartTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def barrier(self, phase):
        r = self.runtime
        r.stop()
        wrappers = r.root / 'utilities'
        wrappers.mkdir(mode=0o700)
        self.marker, self.release, self.done = [r.root / name for name in ('start-gap', 'release', 'done')]
        real_git = shutil.which('git')
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import os, subprocess, sys, time\nfrom pathlib import Path\n' +
            f'marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); counter=Path({str(r.root / "counter")!r})\n' +
            'args=sys.argv[1:]\n' +
            f'phase={phase!r}\n' +
            'blocked=phase == "pin" and "update-ref" in args and any(a.startswith("refs/tdev/objects/") for a in args)\n' +
            'if "symbolic-ref" in args and args[-1] == "refs/heads/main":\n' +
            ' count=int(counter.read_text())+1 if counter.exists() else 1\n' +
            ' counter.write_text(str(count))\n' +
            ' blocked=blocked or (phase == "before-fetch-head" and count == 2) or (phase == "selection" and count == 1)\n' +
            f'if phase != "before-fetch-head": code=subprocess.call([{real_git!r}, *args])\n' +
            'if blocked and not release.exists():\n' +
            ' marker.touch()\n' +
            ' end=time.monotonic()+20\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' done.touch()\n' +
            f'if phase == "before-fetch-head": code=subprocess.call([{real_git!r}, *args])\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()

    def invoke(self, request, raw=False):
        self.replies, self.failures = [], []
        def invoke():
            try:
                if raw:
                    self.replies.append(self.runtime.request('tools/call', {'name': 'tdev_task',
                        'arguments': {'request': request}})[2]['result']['structuredContent'])
                else:
                    self.replies.append(self.runtime.call('task', request))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: self.failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        return caller

    def finish_barrier(self, caller):
        self.release.touch()
        caller.join(timeout=8)
        eventually(lambda: self.done.exists(), bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(self.failures, self.failures)

    def persisted(self, request):
        # Read fixture-owned rows as external durable evidence, not domain behavior.
        with sqlite3.connect('file:' + str(self.runtime.state / 'state.sqlite') + '?mode=ro', uri=True) as connection:
            row = connection.execute('SELECT id,repo,ref,intent FROM operation WHERE owner=? AND request=?', ('alice', request)).fetchone()
        return row[:3], json.loads(row[3])

    def test_pin_gap_kill_preserves_reserved_identity_scope_and_pending_workspace_guards(self):
        r = self.runtime
        space = r.call('workspace', {'action': 'create', 'requestId': 'space', 'name': 'Project',
            'projects': ['test'], 'defaultRepo': 'test'})['result']
        self.barrier('pin')
        args = {'action': 'start', 'requestId': 'interrupted-start', 'workspaceId': space['workspaceId'], 'label': 'Frozen'}
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            operation = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            self.assertEqual((operation['status'], operation['effect'], operation['task']), ('running', 'none', None))
            persisted, intent = self.persisted(args['requestId'])
            frozen = intent['resolved']
            self.assertEqual((persisted[0], persisted[1], persisted[2]), (operation['id'], 'test', frozen['ref']))
            self.assertEqual((frozen['repo'], frozen['base'], frozen['sourceRef'], frozen['namespace']),
                             ('test', r.head, 'refs/heads/main', 'refs/heads/work/'))
            self.assertEqual(intent['input'], args)
            self.assertEqual(r.call('task', args)['id'], operation['id'])
            pending = r.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId']})
            self.assertEqual(pending['pendingTasks'][0]['operationId'], operation['id'])
            for action in ('close', 'detach'):
                request = {'action': action, 'requestId': action, 'workspaceId': space['workspaceId'],
                           'expectedRevision': space['revision']}
                if action == 'detach': request['repo'] = 'test'
                result = r.request('tools/call', {'name': 'tdev_workspace', 'arguments': {'request': request}})[2]['result']['structuredContent']
                self.assertEqual(result['error']['code'], 'WORKSPACE_IN_USE')
            r.config['principals']['alice']['managedRefNamespaces']['test'] = []
            r.save_config()
            denied = r.request('tools/call', {'name': 'tdev_operation', 'arguments': {'request':
                {'action': 'status', 'operationId': operation['id']}}})[2]['result']['structuredContent']
            self.assertEqual(denied['error']['code'], 'MANAGED_REF_DENIED')
            r.config['principals']['alice']['managedRefNamespaces']['test'] = ['refs/heads/work/']
            r.save_config()
            before = time.monotonic()
            r.call('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Available'})
            self.assertLess(time.monotonic() - before, 3)
            r.stop()
        finally:
            self.finish_barrier(caller)
        self.assertFalse(self.replies, self.replies)
        r.start()
        recovered = r.status(operation['id'])
        self.assertEqual((recovered['id'], recovered['status'], recovered['effect'], recovered['error']['code']),
                         (operation['id'], 'failed', 'none', 'INTERRUPTED'))
        self.assertEqual(self.persisted(args['requestId'])[1]['resolved'], frozen)
        self.assertEqual(r.call('task', args)['id'], operation['id'])
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual(r.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId']})['pendingTasks'], [])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')
        fresh = r.call('task', {**args, 'requestId': 'fresh'})
        self.assertEqual(fresh['status'], 'succeeded')
        self.assertNotEqual(fresh['result']['ref'], frozen['ref'])
        self.assertNotEqual(fresh['result']['taskId'], frozen['taskId'])

    def test_source_advancement_after_admission_fails_without_resolving_a_new_base(self):
        r = self.runtime
        self.barrier('before-fetch-head')
        args = {'action': 'start', 'requestId': 'moving-head'}
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            persisted, intent = self.persisted(args['requestId'])
            self.assertEqual(intent['resolved']['base'], r.head)
            (r.work / 'a.txt').write_text('later\n')
            git('add', 'a.txt', cwd=r.work)
            git('commit', '-m', 'later', cwd=r.work)
            changed = git('rev-parse', 'HEAD', cwd=r.work)
            git('push', str(r.remote), 'HEAD:refs/heads/main', cwd=r.work)
        finally:
            self.finish_barrier(caller)
        result = self.replies[0]
        self.assertEqual((result['id'], result['status'], result['effect'], result['error']['code']),
                         (persisted[0], 'failed', 'none', 'STALE_HEAD'))
        r.restart()
        self.assertEqual(r.call('task', args)['id'], persisted[0])
        self.assertEqual(self.persisted(args['requestId'])[1]['resolved']['base'], r.head)
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        fresh = r.call('task', {**args, 'requestId': 'latest'})
        self.assertEqual((fresh['status'], fresh['result']['base']), ('succeeded', changed))

    def test_discovery_accepts_predecessor_and_rejects_incompatible_import_before_admission(self):
        r = self.runtime
        tool = next(t for t in r.request()[2]['result']['tools'] if t['name'] == 'tdev_task')
        validator = jsonschema.Draft202012Validator(tool['inputSchema'])
        self.assertTrue(validator.is_valid({'request': {'action': 'start', 'requestId': 'allowed'}}))
        self.assertTrue(validator.is_valid({'request': {'action': 'start', 'requestId': 'import', 'localChanges': True}}))
        continuation = {'action': 'start', 'requestId': 'continuation', 'fromTaskId': 'old'}
        self.assertTrue(validator.is_valid({'request': continuation}))
        missing_source = r.request('tools/call', {'name': 'tdev_task', 'arguments': {'request': continuation}})[2]['result']['structuredContent']
        self.assertEqual(missing_source['error']['code'], 'TASK_NOT_FOUND')
        for request in ({**continuation, 'localChanges': True}, {**continuation, 'baseRef': 'refs/heads/main'}):
            self.assertFalse(validator.is_valid({'request': request}))
            response = r.request('tools/call', {'name': 'tdev_task', 'arguments': {'request': request}})[2]['result']['structuredContent']
            self.assertEqual(response['error']['code'], 'SCHEMA')
            missing = r.request('tools/call', {'name': 'tdev_operation', 'arguments': {'request':
                {'action': 'status', 'lookupRequestId': request['requestId']}}})[2]['result']['structuredContent']
            self.assertEqual(missing['error']['code'], 'OPERATION_NOT_FOUND')

    def test_workspace_default_changed_during_head_observation_rejects_stale_selection(self):
        r = self.runtime
        r.config['repositories']['other'] = dict(r.config['repositories']['test'])
        r.config['principals']['alice']['repos']['other'] = ['refs/heads/main']
        r.config['principals']['alice']['managedRefNamespaces']['other'] = ['refs/heads/work/']
        r.save_config()
        space = r.call('workspace', {'action': 'create', 'requestId': 'space', 'name': 'Both',
            'projects': ['test', 'other'], 'defaultRepo': 'test'})['result']
        self.barrier('selection')
        args = {'action': 'start', 'requestId': 'selection', 'workspaceId': space['workspaceId']}
        caller = self.invoke(args, raw=True)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            r.call('workspace', {'action': 'configure', 'requestId': 'change-default',
                'workspaceId': space['workspaceId'], 'expectedRevision': space['revision'], 'defaultRepo': 'other'})
        finally:
            self.finish_barrier(caller)
        self.assertFalse(self.replies[0]['ok'])
        self.assertEqual(self.replies[0]['error']['code'], 'SOURCE_CHANGED')
        missing = r.request('tools/call', {'name': 'tdev_operation', 'arguments': {'request':
            {'action': 'status', 'lookupRequestId': args['requestId']}}})[2]['result']['structuredContent']
        self.assertEqual(missing['error']['code'], 'OPERATION_NOT_FOUND')
        self.assertEqual(r.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId']})['tasks'], [])
        fresh = r.call('task', {**args, 'requestId': 'current-default'})
        self.assertEqual(fresh['result']['repo'], 'other')

    def test_foreign_branch_appearing_during_construction_is_preserved_without_adoption(self):
        r = self.runtime
        self.barrier('pin')
        args = {'action': 'start', 'requestId': 'foreign-branch'}
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            _, intent = self.persisted(args['requestId'])
            branch = intent['resolved']['ref']
            git('--git-dir=' + str(r.remote), 'update-ref', branch, r.head)
        finally:
            self.finish_barrier(caller)
        result = self.replies[0]
        self.assertEqual((result['status'], result['effect'], result['error']['code']), ('failed', 'none', 'REF_EXISTS'))
        self.assertEqual(r.call('task', {'action': 'list'})['tasks'], [])
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', branch), r.head)
        r.restart()
        self.assertEqual(r.call('task', args)['id'], result['id'])
        fresh = r.call('task', {**args, 'requestId': 'independent'})
        self.assertEqual(fresh['status'], 'succeeded')
        self.assertNotEqual(fresh['result']['ref'], branch)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'rev-parse', branch), r.head)
