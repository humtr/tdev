"""Final checkout bytes and unchanged user state through either executable."""
import base64
import hashlib
import json
import os
import subprocess
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, git


class ImportTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def call(self, tool, request):
        status, _, response, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': request}})
        self.assertEqual(status, 200, response)
        value = response['result']['structuredContent']
        schema = next(t['outputSchema'] for t in CONTRACT['x-tools'] if t['name'] == 'tdev_' + tool)
        jsonschema.Draft202012Validator({**schema, '$defs': CONTRACT['$defs']}).validate(value)
        self.assertTrue(value['ok'], value)
        return value['result']

    def connect(self, name='authored'):
        r = self.runtime
        r.config['projectPolicies'] = {'local': {'kind': 'local', 'root': str(r.root),
            'managedRefNamespace': 'refs/heads/imports/', 'validation': 'true'}}
        r.config['principals']['alice']['projectPolicies'] = ['local']
        r.save_config()
        operation = self.call('project', {'action': 'connect', 'requestId': 'connect-' + name,
            'policy': 'local', 'name': name})
        self.assertEqual(operation['status'], 'succeeded', operation)
        return operation['result']['repo']

    def start(self, request, repo, **fields):
        return self.call('task', {'action': 'start', 'requestId': request, 'repo': repo,
            'localChanges': True, **fields})

    def failed(self, request, repo, code, **fields):
        operation = self.start(request, repo, **fields)
        self.assertEqual((operation['status'], operation['effect']), ('failed', 'none'), operation)
        self.assertIn(operation['error']['code'], code if isinstance(code, tuple) else (code,), operation)
        self.assertEqual(self.call('task', {'action': 'list'})['tasks'], [])
        return operation

    def files(self, task, names):
        result = self.call('read', {'taskId': task['taskId'], 'checkpoint': task['checkpoint'],
            'queries': [{'action': 'file', 'path': name} for name in names]})
        return {name: base64.b64decode(item['data']) for name, item in zip(names, result['items'])}

    def test_final_bytes_modes_deletions_selection_and_lost_reply_preserve_checkout(self):
        r = self.runtime
        repo = self.connect()
        r.config['principals']['alice']['defaultRepo'] = repo
        r.save_config()
        (r.work / 'a.txt').write_text('staged\n')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_bytes(b'final\x00\xff\n')
        (r.work / 'b.txt').unlink()
        (r.work / '.gitignore').write_text('ignored\na.txt\n')
        (r.work / 'ignored').write_text('private ignored data')
        (r.work / '새 파일 ').write_text('new source')
        (r.work / 'directory').mkdir()
        (r.work / 'directory/script').write_text('#!/bin/sh\ntrue\n')
        (r.work / 'directory/script').chmod(0o755)
        (r.work / 'directory/link').symlink_to('../a.txt')
        (r.work / '.gitattributes').write_text('*.txt filter=probe\n')
        git('config', 'filter.probe.clean', 'touch FILTER-RAN', cwd=r.work)
        git('config', 'core.fsmonitor', 'touch MONITOR-RAN', cwd=r.work)
        index = (r.work / '.git/index').read_bytes()
        refs = git('for-each-ref', '--format=%(refname) %(objectname)', cwd=r.work)
        raw = [subprocess.check_output(['git', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
               'ls-files', *args], cwd=r.work, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0',
               'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull}, timeout=15)
               for args in [('--stage', '-z'), ('-v', '-z'), ('--others', '--exclude-standard', '-z')]]
        selected = hashlib.sha256(json.dumps([part.hex() for part in raw],
            sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode()).hexdigest()
        args = {'action': 'start', 'requestId': 'import', 'localChanges': True}
        r.discard_reply('task', args)
        original = self.call('task', args)
        self.assertEqual(original['status'], 'succeeded', original)
        task = original['result']
        self.assertNotEqual(task['checkpoint'], task['base'])
        self.assertEqual(task['base'], r.head)
        names = ['a.txt', '새 파일 ', 'directory/script', 'directory/link']
        self.assertEqual(self.files(task, names), dict(zip(names,
            [b'final\x00\xff\n', b'new source', b'#!/bin/sh\ntrue\n', b'../a.txt'])))
        listing = self.call('read', {'taskId': task['taskId'], 'queries': [{'action': 'list'}]})
        entries = {entry['path']: entry for entry in listing['items'][0]['entries']}
        self.assertNotIn('b.txt', entries)
        self.assertNotIn('ignored', entries)
        self.assertEqual(entries['directory/script']['mode'], '100755')
        self.assertEqual(entries['directory/link']['mode'], '120000')
        evidence = task['localImport']
        self.assertEqual((evidence['head'], evidence['files']), (r.head, len(entries)))
        self.assertEqual(evidence['selectionDigest'], selected)
        self.assertEqual(len(evidence['tree']), len(r.head))
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('for-each-ref', '--format=%(refname) %(objectname)', cwd=r.work), refs)
        self.assertEqual(git('rev-parse', 'HEAD', cwd=r.work), r.head)
        self.assertFalse((r.work / 'FILTER-RAN').exists())
        self.assertFalse((r.work / 'MONITOR-RAN').exists())
        self.assertEqual((r.work / 'ignored').read_text(), 'private ignored data')
        (r.work / '새 파일 ').write_text('later local edit')
        r.config['principals']['alice']['defaultRepo'] = 'missing'
        r.save_config()
        r.restart()
        self.assertEqual(self.call('task', args), original)
        self.assertEqual(self.files(task, ['새 파일 '])['새 파일 '], b'new source')

    def test_clean_import_retains_base_and_reports_tree(self):
        repo = self.connect()
        operation = self.start('clean', repo)
        self.assertEqual(operation['status'], 'succeeded', operation)
        task = operation['result']
        self.assertEqual((task['base'], task['checkpoint']), (self.runtime.head, self.runtime.head))
        self.assertEqual(task['localImport']['files'], 2)
        self.assertEqual(task['localImport']['tree'], git('rev-parse', 'HEAD^{tree}', cwd=self.runtime.work))

    def test_unsafe_links_special_files_and_file_limit_fail_without_tasks(self):
        r = self.runtime
        repo = self.connect()
        for request, target in [('absolute', str(r.root / 'outside')), ('escape', '../outside'), ('git', '.git/config')]:
            (r.work / 'link').symlink_to(target)
            self.failed(request, repo, 'CHECKOUT_SYMLINK')
            (r.work / 'link').unlink()
        (r.work / 'a.txt').unlink()
        os.mkfifo(r.work / 'a.txt')
        self.failed('fifo', repo, 'CHECKOUT_FILE_TYPE')
        (r.work / 'a.txt').unlink()
        with (r.work / 'a.txt').open('wb') as stream:
            stream.truncate(16 * 1024 * 1024 + 1)
        self.failed('large', repo, 'SOURCE_LIMIT')
        self.assertEqual(git('rev-parse', 'HEAD', cwd=r.work), r.head)

    def test_unsupported_index_states_preserve_index(self):
        r = self.runtime
        repo = self.connect()
        git('update-index', '--skip-worktree', 'a.txt', cwd=r.work)
        index = (r.work / '.git/index').read_bytes()
        self.failed('sparse', repo, 'CHECKOUT_SPARSE')
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        git('update-index', '--no-skip-worktree', 'a.txt', cwd=r.work)
        git('update-index', '--add', '--cacheinfo', '160000,' + r.head + ',module', cwd=r.work)
        index = (r.work / '.git/index').read_bytes()
        self.failed('gitlink', repo, 'UNSUPPORTED_GITLINK')
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        git('update-index', '--force-remove', 'module', cwd=r.work)
        # Supply a real conflicted index entry without touching the working bytes.
        oid = git('rev-parse', 'HEAD:a.txt', cwd=r.work)
        subprocess.run(['git', 'update-index', '--index-info'], cwd=r.work,
            input=f'0 {"0" * len(r.head)}\ta.txt\n100644 {oid} 1\ta.txt\n'.encode(), check=True, timeout=15)
        index = (r.work / '.git/index').read_bytes()
        self.failed('unmerged', repo, 'CHECKOUT_UNMERGED')
        self.assertEqual((r.work / '.git/index').read_bytes(), index)

    def test_checkout_is_required_and_selected_branch_must_match(self):
        r = self.runtime
        self.failed('bare', 'test', 'CHECKOUT_REQUIRED')
        repo = self.connect()
        git('checkout', '-b', 'other', cwd=r.work)
        self.failed('branch', repo, 'CHECKOUT_HEAD_CHANGED')
        git('checkout', '--detach', cwd=r.work)
        # The reference lets symbolic-ref's failure escape; native maps it to its source boundary.
        self.failed('detached', repo, ('CHECKOUT_HEAD_CHANGED', 'COMMAND_FAILED'))

    def test_linked_checkout_import_uses_own_branch_and_does_not_rebind(self):
        r = self.runtime
        linked = r.root / 'linked'
        git('worktree', 'add', '-b', 'linked-branch', str(linked), cwd=r.work)
        (linked / 'a.txt').write_text('linked changes')
        repo = self.connect('linked')
        operation = self.start('linked', repo)
        self.assertEqual(operation['status'], 'succeeded', operation)
        task = operation['result']
        self.assertEqual(task['sourceRef'], 'refs/heads/linked-branch')
        self.assertEqual(self.files(task, ['a.txt'])['a.txt'], b'linked changes')
        self.assertEqual((r.work / 'a.txt').read_text(), 'hello\n')
        conflict = self.call('project', {'action': 'connect', 'requestId': 'rebind', 'policy': 'local', 'name': 'authored'})
        self.assertEqual(conflict['error']['code'], 'PROJECT_ALREADY_CONNECTED')

    def test_sha256_import_can_edit_close_and_replay_original_receipt(self):
        r = Runtime(object_format='sha256')
        self.addCleanup(r.close)
        self.runtime = r
        repo = self.connect()
        (r.work / 'a.txt').write_bytes(b'sha256\x00\xff')
        operation = self.start('sha256-import', repo)
        self.assertEqual(operation['status'], 'succeeded', operation)
        task = operation['result']
        self.assertEqual(len(task['checkpoint']), 64)
        self.assertEqual(self.files(task, ['a.txt'])['a.txt'], b'sha256\x00\xff')
        edited = self.call('edit', {'requestId': 'edit-import', 'taskId': task['taskId'], 'expected': task['checkpoint'],
            'edits': [{'action': 'put', 'path': 'new', 'before': None, 'content': 'edit'}]})
        self.assertEqual(edited['status'], 'succeeded', edited)
        self.call('task', {'action': 'close', 'requestId': 'close-import', 'taskId': task['taskId'],
            'expected': edited['result']['checkpoint']})
        r.restart()
        self.assertEqual(self.start('sha256-import', repo), operation)
