"""Actual utility gaps for source selection, target ownership and private merge recovery."""
import base64
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


class NativeIntegrationTest(unittest.TestCase):
    def setUp(self):
        r = self.runtime = Runtime()
        self.addCleanup(r.close)
        self.text = 'first\n' + 'middle\n' * 12 + 'last\n'
        (r.work / 'a.txt').write_text(self.text)
        git('add', 'a.txt', cwd=r.work)
        git('commit', '-m', 'merge base', cwd=r.work)
        git('push', str(r.remote), 'HEAD:refs/heads/main', cwd=r.work)
        r.head = git('rev-parse', 'HEAD', cwd=r.work)

    def task(self, request, managed=True, source='refs/heads/main'):
        r = self.runtime
        args = {'action': 'start' if managed else 'open', 'requestId': request, 'repo': 'test'}
        if managed: args['baseRef'] = source
        else: args.update(ref=source, expectedHead=r.head)
        operation = r.call('task', args)
        self.assertEqual(operation['status'], 'succeeded', operation)
        return operation['result']

    def put(self, task, content, request, path='a.txt'):
        r = self.runtime
        entries = r.call('read', {'taskId': task['taskId'], 'queries': [{'action': 'list'}]})['items'][0]['entries']
        blob = next((entry['blob'] for entry in entries if entry['path'] == path), None)
        operation = r.call('edit', {'requestId': request, 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'put', 'path': path, 'before': blob, 'content': content}]})
        self.assertEqual(operation['status'], 'succeeded', operation)
        return {**task, 'checkpoint': operation['result']['checkpoint']}

    def pair(self, managed=True, source='refs/heads/main'):
        target = self.put(self.task('target', managed), self.text.replace('first', 'ours'), 'ours')
        incoming = self.put(self.task('source', managed, source), self.text.replace('last', 'theirs'), 'theirs')
        return target, incoming

    def arguments(self, target, source, action='integrate'):
        if action == 'compose':
            return {'action': 'compose', 'requestId': 'compose-gap', 'repo': 'test', 'ref': 'refs/heads/main',
                'expectedHead': self.runtime.head, 'sources': [{'taskId': task['taskId'], 'checkpoint': task['checkpoint']} for task in (target, source)]}
        return {'action': 'integrate', 'requestId': 'integrate-gap', 'taskId': target['taskId'],
            'expected': target['checkpoint'], 'sourceTaskId': source['taskId']}

    def barrier(self, phase):
        r = self.runtime
        r.stop()
        wrappers = r.root / 'utilities'
        wrappers.mkdir(mode=0o700)
        self.marker, self.release, self.done = [r.root / name for name in ('integration-gap', 'release', 'done')]
        real_git = shutil.which('git')
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json, subprocess, sys, time\nfrom pathlib import Path\n' +
            f'marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); phase={phase!r}; head={r.head!r}\n' +
            'args=sys.argv[1:]\n' +
            'candidate=(phase == "merge" and "merge-file" in args) or (phase == "ancestry" and "merge-base" in args) or (phase == "pin" and "update-ref" in args and args[-1] != head)\n' +
            'if phase == "failure" and "merge-file" in args: sys.exit(129)\n' +
            f'if phase != "merge": code=subprocess.call([{real_git!r}, *args])\n' +
            'if candidate and not marker.exists():\n' +
            ' marker.write_text(json.dumps(args))\n' +
            ' end=time.monotonic()+20\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' done.touch()\n' +
            f'if phase == "merge": code=subprocess.call([{real_git!r}, *args])\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()

    def invoke(self, request, raw=False):
        self.replies, self.failures = [], []
        def invoke():
            try:
                response = self.runtime.request('tools/call', {'name': 'tdev_task', 'arguments': {'request': request}})[2]['result']['structuredContent'] if raw else self.runtime.call('task', request)
                self.replies.append(response)
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: self.failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        return caller

    def finish(self, caller):
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

    def error(self, tool, args, code):
        response = self.runtime.request('tools/call', {'name': 'tdev_' + tool, 'arguments': {'request': args}})[2]['result']['structuredContent']
        self.assertEqual(response['error']['code'], code, response)

    def test_source_advances_after_admission_but_merge_and_replay_keep_frozen_version(self):
        r = self.runtime
        git('--git-dir=' + str(r.remote), 'update-ref', 'refs/heads/feature', r.head)
        r.config['repositories']['test']['refs'].append('refs/heads/feature')
        r.config['principals']['alice']['repos']['test'].append('refs/heads/feature')
        r.save_config()
        target, source = self.pair(source='refs/heads/feature')
        args = self.arguments(target, source)
        self.barrier('merge')
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            frozen = self.intent(args['requestId'])['integrationSource']
            self.assertEqual(frozen, {'taskId': source['taskId'], 'base': source['base'], 'checkpoint': source['checkpoint']})
            self.assertEqual(r.call('task', args)['id'], pending['id'])
            for tool, request in [('edit', {'requestId': 'busy-edit', 'taskId': target['taskId'], 'expected': target['checkpoint'], 'edits': [{'action': 'put', 'path': 'new', 'before': None, 'content': 'no'}]}),
                ('task', {'action': 'close', 'requestId': 'busy-close', 'taskId': target['taskId'], 'expected': target['checkpoint']})]:
                self.error(tool, request, 'TASK_BUSY')
            source = self.put(source, 'newer source content', 'advance-source')
            r.config['principals']['alice']['repos']['test'] = ['refs/heads/main']
            r.save_config()
            self.error('task', args, 'PERMISSION_DENIED')
            self.error('operation', {'action': 'status', 'operationId': pending['id']}, 'PERMISSION_DENIED')
            before = time.monotonic()
            r.call('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Available'})
            self.assertLess(time.monotonic() - before, 3)
        finally: self.finish(caller)
        result = self.replies[0]
        self.assertEqual(result['status'], 'succeeded', result)
        self.assertEqual(result['result']['sourceCheckpoint'], frozen['checkpoint'])
        current = r.call('read', {'taskId': target['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(current['items'][0]['data']), self.text.replace('first', 'ours').replace('last', 'theirs').encode())
        self.error('task', args, 'PERMISSION_DENIED')
        r.config['principals']['alice']['repos']['test'].append('refs/heads/feature')
        r.save_config()
        r.restart()
        self.assertEqual(r.call('task', args), result)

    def test_source_changes_during_ancestry_observation_rejects_stale_admission(self):
        r = self.runtime
        target, source = self.pair()
        args = self.arguments(target, source)
        self.barrier('ancestry')
        caller = self.invoke(args, raw=True)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            source = self.put(source, 'changed before admission', 'advance-before-admit')
        finally: self.finish(caller)
        self.assertFalse(self.replies[0]['ok'])
        self.assertEqual(self.replies[0]['error']['code'], 'SOURCE_CHANGED')
        self.error('operation', {'action': 'status', 'lookupRequestId': args['requestId']}, 'OPERATION_NOT_FOUND')
        state = r.call('task', {'action': 'inspect', 'taskId': target['taskId']})['task']
        self.assertEqual((state['checkpoint'], state['busy']), (target['checkpoint'], None))

    def test_duplicate_wins_during_ancestry_wait_and_replay_does_not_hold_store_lock(self):
        r = self.runtime
        target, source = self.pair()
        args = self.arguments(target, source)
        self.barrier('ancestry')
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            # The first caller has observed source but has no reservation. The second
            # admits/completes the same request, forcing Store::admit's replay branch.
            duplicate = r.call('task', args)
            self.assertEqual(duplicate['status'], 'succeeded', duplicate)
        finally: self.finish(caller)
        self.assertEqual(self.replies[0], duplicate)
        self.assertEqual(r.call('task', args), duplicate)
        operations = r.call('task', {'action': 'inspect', 'taskId': target['taskId']})['operations']
        self.assertEqual(sum(op['id'] == duplicate['id'] for op in operations), 1)

    def test_compose_source_advancement_at_private_pin_rejects_pointer_commit(self):
        r = self.runtime
        first = self.put(self.task('first', False), 'ours', 'first-change')
        second = self.put(self.task('second', False), 'second', 'second-change', path='b.txt')
        args = self.arguments(first, second, 'compose')
        self.barrier('pin')
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            self.assertEqual(r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})['task'], None)
            first = self.put(first, 'later source', 'late-compose-source')
        finally: self.finish(caller)
        result = self.replies[0]
        self.assertEqual((result['status'], result['effect'], result['error']['code']), ('failed', 'none', 'SOURCE_CHANGED'))
        self.assertEqual(len(r.call('task', {'action': 'list'})['tasks']), 2)
        r.restart()
        self.assertEqual(r.call('task', args), result)

    def pin_death(self, action):
        r = self.runtime
        if action == 'integrate': target, source = self.pair()
        else:
            target = self.put(self.task('target', False), 'ours', 'ours')
            source = self.put(self.task('source', False), 'theirs', 'theirs', path='b.txt')
        args = self.arguments(target, source, action)
        self.barrier('pin')
        caller = self.invoke(args)
        try:
            eventually(lambda: self.marker.exists(), bool, seconds=8)
            pending = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            frozen = self.intent(args['requestId'])
            r.stop()
        finally: self.finish(caller)
        self.assertFalse(self.replies)
        r.start()
        receipt = r.call('task', args)
        self.assertEqual((receipt['id'], receipt['status'], receipt['effect'], receipt['error']['code']),
            (pending['id'], 'failed', 'none', 'INTERRUPTED'))
        self.assertEqual(self.intent(args['requestId']), frozen)
        state = r.call('task', {'action': 'inspect', 'taskId': target['taskId']})['task']
        self.assertEqual((state['checkpoint'], state['busy']), (target['checkpoint'], None))
        self.assertEqual(len(r.call('task', {'action': 'list'})['tasks']), 2)
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')
        fresh = r.call('task', {**args, 'requestId': 'fresh'})
        self.assertEqual(fresh['status'], 'succeeded', fresh)

    def test_integrate_pin_gap_kill_preserves_target_and_releases_only_owned_writer(self):
        self.pin_death('integrate')

    def test_compose_pin_gap_kill_keeps_no_partial_task_and_original_receipt(self):
        self.pin_death('compose')

    def test_real_merge_utility_failure_is_none_and_does_not_leave_target_busy(self):
        target, source = self.pair()
        args = self.arguments(target, source)
        self.barrier('failure')
        result = self.runtime.call('task', args)
        self.assertEqual((result['status'], result['effect'], result['error']['code']), ('failed', 'none', 'MERGE_FAILED'))
        state = self.runtime.call('task', {'action': 'inspect', 'taskId': target['taskId']})['task']
        self.assertEqual((state['checkpoint'], state['busy']), (target['checkpoint'], None))
        self.put(target, 'available after merge failure', 'post-failure-edit')
