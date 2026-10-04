"""Actual controller death at local creation boundaries, without product fault flags."""
import http.client
import json
import os
import shutil
import sys
import threading
import time
import unittest

from acceptance.harness import Runtime, eventually, git


class NativeProjectTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)
        r = self.runtime
        r.config['projectPolicies'] = {'local': {'kind': 'local', 'root': str(r.root),
            'allowCreate': True, 'managedRefNamespace': 'refs/heads/managed/',
            'validation': 'test -f README.md', 'validationTimeoutSeconds': 21}}
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.save_config()

    def interrupt_creation(self, sealed):
        r = self.runtime
        r.stop()
        wrappers = r.root / 'utilities'
        wrappers.mkdir(mode=0o700)
        marker, release, done, trace = [r.root / name for name in ('gap.json', 'release', 'done', 'dispatches')]
        real_git = shutil.which('git')
        wrapper = wrappers / 'git'
        wrapper.write_text('#!' + sys.executable + '\n' +
            'import json, os, subprocess, sys, time\nfrom pathlib import Path\n' +
            f'marker=Path({str(marker)!r}); release=Path({str(release)!r}); done=Path({str(done)!r}); trace=Path({str(trace)!r})\n' +
            'args=sys.argv[1:]\n' +
            'if "init" in args and "--template=" in args and "-b" in args:\n' +
            ' with trace.open("a") as log: log.write(json.dumps(args)+"\\n")\n' +
            f'code=subprocess.call([{real_git!r}, *args])\n' +
            f'blocked=({sealed!r} and "config" in args and "tdev.creationId" in args) or ({not sealed!r} and "commit" in args and "Initialize project" in args)\n' +
            'if code == 0 and blocked and not release.exists():\n' +
            ' marker.write_text(json.dumps({"pid":os.getpid(),"args":args}))\n' +
            ' end=time.monotonic()+20\n' +
            ' while not release.exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' done.touch()\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers) + os.pathsep + os.environ['PATH']
        r.start()
        args = {'action': 'create', 'requestId': 'interrupted-create', 'policy': 'local', 'name': 'Created'}
        replies, failures = [], []
        def invoke():
            try: replies.append(r.call('project', args))
            except (ConnectionError, http.client.HTTPException): pass
            except BaseException as error: failures.append(error)
        caller = threading.Thread(target=invoke, daemon=True)
        caller.start()
        try:
            eventually(lambda: marker.exists(), bool, seconds=8)
            started = time.monotonic()
            operation = r.call('operation', {'action': 'status', 'lookupRequestId': args['requestId']})
            self.assertEqual((operation['status'], operation['effect']), ('unknown', 'unknown'))
            replay = r.call('project', args)
            self.assertEqual((replay['id'], replay['status']), (operation['id'], 'unknown'))
            self.assertNotIn('error', r.call('project', {'action': 'list'}))
            self.assertEqual(len(r.call('project', {'action': 'list'})['projects']), 1)
            r.call('workspace', {'action': 'create', 'requestId': 'unrelated', 'name': 'Available'})
            self.assertLess(time.monotonic() - started, 3)
            r.stop()
        finally:
            release.touch()
            caller.join(timeout=5)
            eventually(lambda: done.exists(), bool, seconds=5)
        self.assertFalse(caller.is_alive())
        self.assertFalse(failures, failures)
        self.assertFalse(replies, replies)
        self.assertEqual(len(trace.read_text().splitlines()), 1)
        return args, operation, trace

    def test_completed_creation_marker_recovers_exact_identity_under_current_policy(self):
        r = self.runtime
        args, original, trace = self.interrupt_creation(sealed=True)
        target = r.root / 'Created'
        head = git('rev-parse', 'HEAD', cwd=target)
        r.config['principals']['alice']['projectPolicies'] = []
        r.save_config()
        r.start()
        response = r.request('tools/call', {'name': 'tdev_operation', 'arguments': {'request':
            {'action': 'status', 'operationId': original['id']}}})[2]['result']['structuredContent']
        self.assertEqual(response['error']['code'], 'PROJECT_POLICY_DENIED')
        self.assertEqual(len(r.call('project', {'action': 'list'})['projects']), 1)
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.config['projectPolicies']['local'].update(allowCreate=False, validationTimeoutSeconds=73,
            managedRefNamespace='refs/heads/current/')
        r.save_config()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['id'], recovered['status'], recovered['effect']),
                         (original['id'], 'succeeded', 'committed'))
        self.assertEqual((recovered['result']['name'], recovered['result']['validationTimeoutSeconds'],
                          recovered['result']['managedRefNamespaces']), ('Created', 73, ['refs/heads/current/']))
        self.assertEqual(r.call('project', args), {k: v for k, v in recovered.items() if k != 'observation'})
        self.assertEqual(git('rev-parse', 'HEAD', cwd=target), head)
        self.assertEqual(len(trace.read_text().splitlines()), 1)

    def test_unsealed_creation_stays_unknown_and_never_repeats_dispatch(self):
        r = self.runtime
        args, original, trace = self.interrupt_creation(sealed=False)
        target = r.root / 'Created'
        head = git('rev-parse', 'HEAD', cwd=target)
        r.start()
        for _ in range(3):
            recovered = r.status(original['id'])
            self.assertEqual((recovered['id'], recovered['status'], recovered['effect'], recovered['error']['code']),
                             (original['id'], 'unknown', 'unknown', 'PROJECT_UNKNOWN'))
            self.assertEqual(r.call('project', args)['id'], original['id'])
        self.assertEqual(len(r.call('project', {'action': 'list'})['projects']), 1)
        self.assertEqual(git('rev-parse', 'HEAD', cwd=target), head)
        self.assertEqual(len(trace.read_text().splitlines()), 1)
        independent = r.call('project', {**args, 'action': 'connect', 'requestId': 'explicit-connect'})
        self.assertEqual(independent['status'], 'succeeded')
        self.assertEqual(r.status(original['id'])['status'], 'unknown')

    def test_same_name_replacement_cannot_supply_creation_proof(self):
        r = self.runtime
        args, original, trace = self.interrupt_creation(sealed=True)
        target = r.root / 'Created'
        target.rename(r.root / 'Original-created')
        git('clone', str(r.root / 'Original-created'), str(target))
        # Even copying the name/marker is insufficient without the retained inode.
        git('config', '--local', 'tdev.creationId', original['id'], cwd=target)
        replacement = git('rev-parse', 'HEAD', cwd=target)
        r.start()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['status'], recovered['effect'], recovered['error']['code']),
                         ('unknown', 'unknown', 'REPOSITORY_IDENTITY'))
        self.assertEqual(r.call('project', args)['id'], original['id'])
        self.assertEqual(len(r.call('project', {'action': 'list'})['projects']), 1)
        self.assertEqual(git('rev-parse', 'HEAD', cwd=target), replacement)
        self.assertEqual(len(trace.read_text().splitlines()), 1)

    def test_caller_execution_policy_is_rejected_before_admission(self):
        r = self.runtime
        request = {'action': 'create', 'requestId': 'injected', 'policy': 'local',
            'name': 'Injected', 'validation': 'caller command'}
        value = r.request('tools/call', {'name': 'tdev_project', 'arguments': {'request': request}})[2]['result']['structuredContent']
        self.assertEqual(value['error']['code'], 'SCHEMA')
        self.assertFalse((r.root / 'Injected').exists())

    def test_changed_head_cannot_complete_the_original_creation(self):
        r = self.runtime
        args, original, trace = self.interrupt_creation(sealed=True)
        target = r.root / 'Created'
        (target / 'README.md').write_text('Later independent work\n')
        git('add', 'README.md', cwd=target)
        git('commit', '-m', 'Later work', cwd=target)
        changed = git('rev-parse', 'HEAD', cwd=target)
        r.start()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['status'], recovered['effect'], recovered['error']['code']),
                         ('unknown', 'unknown', 'REPOSITORY_IDENTITY'))
        self.assertEqual(r.call('project', args)['id'], original['id'])
        self.assertEqual(git('rev-parse', 'HEAD', cwd=target), changed)
        self.assertEqual(len(trace.read_text().splitlines()), 1)


if __name__ == '__main__':
    unittest.main()
