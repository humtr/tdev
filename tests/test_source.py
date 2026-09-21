import base64
import os
from unittest.mock import patch

from test_core import Base
from support import git
from tdev.checkout import Checkout
from tdev.common import Fault
from tdev.core import Controller


class SourceTest(Base):
    def connect(self, name='authored'):
        self.repo.config['projectPolicies'] = {'dev': {'kind': 'local', 'root': str(self.root),
            'validation': 'test -f a.txt', 'managedRefNamespace': 'refs/heads/tasks/', 'allowCreate': True}}
        self.repo.config['principals']['alice']['projectPolicies'] = ['dev']
        self.counter += 1
        result = self.call('project', {'action': 'connect', 'requestId': 'connect' + str(self.counter),
                                      'policy': 'dev', 'name': name})
        self.assertEqual(result['status'], 'succeeded', result)
        return result['result']['repo']

    def start(self, repo, **args):
        self.counter += 1
        op = self.call('task', {'action': 'start', 'requestId': 'start' + str(self.counter), 'repo': repo, **args})
        self.assertEqual(op['status'], 'succeeded', op)
        return op['result']

    def put(self, task, name, data, mode='100644'):
        self.counter += 1
        previous = self.c.git(task['repo']).entries(task['checkpoint']).get(name)
        encoded = base64.b64encode(data).decode() if isinstance(data, bytes) else data
        op = self.call('edit', {'requestId': 'edit' + str(self.counter), 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'put', 'path': name,
            'before': previous[1] if previous else None, 'content': encoded,
            'encoding': 'base64' if isinstance(data, bytes) else 'utf8', 'mode': mode}]})
        self.assertEqual(op['status'], 'succeeded', op)
        return {**task, 'checkpoint': op['result']['checkpoint']}

    def integrate(self, target, source, **args):
        self.counter += 1
        op = self.call('task', {'action': 'integrate', 'requestId': 'merge' + str(self.counter),
            'taskId': target['taskId'], 'expected': target['checkpoint'], 'sourceTaskId': source['taskId'], **args})
        self.assertEqual(op['status'], 'succeeded', op)
        return op['result']

    def contents(self, task):
        g = self.c.git(task['repo'])
        return {name: g.blob(entry[1]) for name, entry in g.entries(task['checkpoint']).items()}

    def test_checkout_import_preserves_index_refs_files_and_replays_frozen_source(self):
        repo = self.connect()
        (self.repo.work / 'a.txt').write_text('staged\n')
        git('add', 'a.txt', cwd=self.repo.work)
        (self.repo.work / 'a.txt').write_text('final working bytes\n')
        (self.repo.work / 'b.txt').unlink()
        (self.repo.work / '.gitignore').write_text('ignored\na.txt\n')
        (self.repo.work / 'ignored').write_text('keep private ignored data')
        (self.repo.work / 'new.txt').write_text('new source')
        (self.repo.work / 'script').write_text('#!/bin/sh\ntrue\n')
        (self.repo.work / 'script').chmod(0o755)
        (self.repo.work / 'link').symlink_to('a.txt')
        (self.repo.work / '.gitattributes').write_text('*.txt filter=probe\n')
        git('config', 'filter.probe.clean', 'touch FILTER-RAN', cwd=self.repo.work)
        index = (self.repo.work / '.git/index').read_bytes()
        args = {'action': 'start', 'requestId': 'import', 'repo': repo, 'localChanges': True}
        op = self.call('task', args)
        self.assertEqual(op['status'], 'succeeded', op)
        task = op['result']
        content = self.contents(task)
        self.assertEqual(content['a.txt'], b'final working bytes\n')
        self.assertNotIn('b.txt', content)
        self.assertNotIn('ignored', content)
        self.assertEqual(content['new.txt'], b'new source')
        self.assertEqual(content['link'], b'a.txt')
        self.assertEqual(self.c.git(repo).entries(task['checkpoint'])['script'][0], '100755')
        self.assertEqual((self.repo.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('rev-parse', 'HEAD', cwd=self.repo.work), self.repo.head)
        self.assertFalse((self.repo.work / 'FILTER-RAN').exists())
        self.assertEqual(task['localImport']['head'], self.repo.head)
        (self.repo.work / 'new.txt').write_text('later local edit')
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        self.assertEqual(self.call('task', args), op)
        self.assertEqual(self.contents(task)['new.txt'], b'new source')
        self.c.executor_override = None
        v = self.call('validate', {'requestId': 'v', 'taskId': task['taskId'], 'expected': task['checkpoint'], 'message': 'import'})
        self.assertEqual(self.wait(v['id'])['status'], 'succeeded')
        p = self.call('publish', {'requestId': 'p', 'validationId': v['id']})
        self.assertEqual(p['status'], 'succeeded', p)
        self.assertEqual(git('show', task['ref'] + ':a.txt', cwd=self.repo.work), 'final working bytes')
        self.assertEqual(git('rev-parse', 'HEAD', cwd=self.repo.work), self.repo.head)
        self.assertEqual((self.repo.work / '.git/index').read_bytes(), index)
        self.call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': task['taskId']})
        self.call('operation', {'action': 'retire', 'requestId': 'retire', 'operationId': v['id']})

    def test_checkout_change_during_scan_never_creates_partial_task(self):
        repo = self.connect()
        scan = Checkout.scan
        scans = 0
        def changing(checkout, *args):
            nonlocal scans
            result = scan(checkout, *args)
            scans += 1
            if scans == 1:
                (self.repo.work / 'a.txt').write_text('concurrent editor')
            return result
        with patch.object(Checkout, 'scan', changing):
            op = self.call('task', {'action': 'start', 'requestId': 'race', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_CHANGED')
        self.assertEqual(op['effect'], 'none')
        self.assertEqual(self.c.store.all('SELECT * FROM task'), [])
        self.assertEqual((self.repo.work / 'a.txt').read_text(), 'concurrent editor')

    def test_checkout_unsafe_links_special_files_and_sparse_are_rejected(self):
        repo = self.connect()
        (self.repo.work / 'escape').symlink_to(self.root / 'outside')
        op = self.call('task', {'action': 'start', 'requestId': 'link', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_SYMLINK')
        (self.repo.work / 'escape').unlink()
        (self.repo.work / 'a.txt').unlink()
        os.mkfifo(self.repo.work / 'a.txt')
        op = self.call('task', {'action': 'start', 'requestId': 'fifo', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_FILE_TYPE')
        (self.repo.work / 'a.txt').unlink()
        (self.repo.work / 'a.txt').write_text('hello\n')
        git('update-index', '--skip-worktree', 'a.txt', cwd=self.repo.work)
        op = self.call('task', {'action': 'start', 'requestId': 'sparse', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_SPARSE')
        self.assertEqual(self.c.store.all('SELECT * FROM task'), [])

    def test_checkout_head_and_checkout_identity_changes_are_rejected(self):
        repo = self.connect()
        git('checkout', '-b', 'other', cwd=self.repo.work)
        op = self.call('task', {'action': 'start', 'requestId': 'switched', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_HEAD_CHANGED')
        git('checkout', 'main', cwd=self.repo.work)
        self.repo.work.rename(self.root / 'original')
        self.repo.work.mkdir()
        # Preserve the original common directory identity through a worktree-style .git file.
        (self.repo.work / '.git').write_text('gitdir: ' + str(self.root / 'original/.git') + '\n')
        # The repository location itself changed, so either identity boundary must reject.
        response = self.c.call('alice', 'tdev_task', {'action': 'start', 'requestId': 'replaced', 'repo': repo, 'localChanges': True})
        self.assertFalse(response['ok'])
        self.assertEqual(response['error']['code'], 'REPOSITORY_IDENTITY')

    def test_linked_checkout_uses_its_own_branch_and_cannot_silently_rebind(self):
        git('worktree', 'add', '-b', 'linked-branch', str(self.root / 'linked'), cwd=self.repo.work)
        (self.root / 'linked/a.txt').write_text('linked changes')
        repo = self.connect('linked')
        imported = self.start(repo, localChanges=True)
        self.assertEqual(imported['sourceRef'], 'refs/heads/linked-branch')
        self.assertEqual(self.contents(imported)['a.txt'], b'linked changes')
        self.assertEqual((self.repo.work / 'a.txt').read_text(), 'hello\n')
        op = self.call('project', {'action': 'connect', 'requestId': 'rebind', 'policy': 'dev', 'name': 'authored'})
        self.assertEqual(op['error']['code'], 'PROJECT_ALREADY_CONNECTED')

    def test_clean_three_way_merge_and_validation_source_binding(self):
        # Widely separated lines let the merge engine combine independent edits in one file.
        text = 'first\n' + 'middle\n' * 12 + 'last\n'
        (self.repo.work / 'a.txt').write_text(text)
        git('add', 'a.txt', cwd=self.repo.work)
        git('commit', '-m', 'multiline base', cwd=self.repo.work)
        repo = self.connect()
        target, source = self.start(repo), self.start(repo)
        target = self.put(target, 'a.txt', text.replace('first', 'ours'))
        source = self.put(source, 'a.txt', text.replace('last', 'theirs'))
        validation = self.call('validate', {'requestId': 'before-v', 'taskId': target['taskId'],
            'expected': target['checkpoint'], 'message': 'before integration'})
        self.assertEqual(self.wait(validation['id'])['status'], 'succeeded')
        result = self.integrate(target, source)
        self.assertTrue(result['applied'], result)
        target['checkpoint'] = result['checkpoint']
        self.assertEqual(self.contents(target)['a.txt'].decode(), text.replace('first', 'ours').replace('last', 'theirs'))
        stale = self.call('publish', {'requestId': 'stale-p', 'validationId': validation['id']})
        self.assertEqual(stale['error']['code'], 'VALIDATION_SOURCE_CHANGED')
        self.assertEqual(self.contents(source)['a.txt'].decode(), text.replace('last', 'theirs'))

    def test_conflicts_preserve_target_and_resolve_against_frozen_source(self):
        repo = self.connect()
        target = self.put(self.start(repo), 'a.txt', 'ours\n')
        source = self.put(self.start(repo), 'a.txt', 'theirs\n')
        args = {'action': 'integrate', 'requestId': 'conflict', 'taskId': target['taskId'],
                'expected': target['checkpoint'], 'sourceTaskId': source['taskId']}
        op = self.call('task', args)
        result = op['result']
        self.assertFalse(result['applied'])
        self.assertEqual(result['checkpoint'], target['checkpoint'])
        self.assertEqual(result['conflicts'][0]['path'], 'a.txt')
        self.assertEqual(result['sourceCheckpoint'], source['checkpoint'])
        source = self.put(source, 'a.txt', 'later source\n')
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        self.assertEqual(self.call('task', args), op)
        resolved = self.integrate(target, source, sourceCheckpoint=result['sourceCheckpoint'],
                                  resolutions=[{'path': 'a.txt', 'choice': 'incoming'}])
        self.assertTrue(resolved['applied'])
        target['checkpoint'] = resolved['checkpoint']
        self.assertEqual(self.contents(target)['a.txt'], b'theirs\n')
        self.assertEqual(self.contents(source)['a.txt'], b'later source\n')

    def test_binary_delete_modify_and_path_conflicts_have_explicit_resolution(self):
        repo = self.connect()
        target, source = self.start(repo), self.start(repo)
        target = self.put(target, 'a.txt', b'ours\0')
        source = self.put(source, 'a.txt', b'theirs\0')
        target = self.put(target, 'node', 'file')
        source = self.put(source, 'node/child', 'child')
        result = self.integrate(target, source)
        self.assertEqual({c['reason'] for c in result['conflicts']}, {'binary', 'path-collision'})
        resolved = self.integrate(target, source, resolutions=[{'path': 'a.txt', 'choice': 'content', 'content': 'resolved'},
            {'path': 'node', 'choice': 'delete'}, {'path': 'node/child', 'choice': 'incoming'}])
        self.assertTrue(resolved['applied'], resolved)
        target['checkpoint'] = resolved['checkpoint']
        self.assertEqual(self.contents(target)['node/child'], b'child')
        self.assertNotIn('node', self.contents(target))
        target2, source2 = self.start(repo), self.start(repo)
        op = self.call('edit', {'requestId': 'delete', 'taskId': source2['taskId'], 'expected': source2['checkpoint'],
            'edits': [{'action': 'delete', 'path': 'a.txt',
                       'before': self.c.git(repo).entries(source2['checkpoint'])['a.txt'][1]}]})
        source2['checkpoint'] = op['result']['checkpoint']
        target2 = self.put(target2, 'a.txt', 'changed')
        self.assertEqual(self.integrate(target2, source2)['conflicts'][0]['reason'], 'delete-modify')
        result = self.integrate(target2, source2, resolutions=[{'path': 'a.txt', 'choice': 'delete'}])
        self.assertTrue(result['applied'])
        target2['checkpoint'] = result['checkpoint']
        self.assertNotIn('a.txt', self.contents(target2))

    def test_patch_read_pagination_and_unreachable_base_rejection(self):
        target = self.put(self.open(), 'a.txt', 'changed 한글\n')
        query = {'action': 'diff', 'format': 'patch', 'limit': 17}
        chunks, offset = [], 0
        while True:
            read = self.call('read', {'taskId': target['taskId'], 'queries': [{**query, 'offset': offset}]})
            self.assertEqual(read['checkpoint'], target['checkpoint'])
            item = read['items'][0]
            chunks.append(base64.b64decode(item['data']))
            offset = item['nextOffset']
            if item['complete']:
                break
        combined = b''.join(chunks).decode()
        self.assertIn('+changed 한글', combined)
        self.assertIn('-hello', combined)
        unknown = self.put(self.open(), 'a.txt', 'unrelated checkpoint')
        read = self.call('read', {'taskId': target['taskId'], 'queries': [{'action': 'diff', 'base': unknown['checkpoint']}]})
        self.assertEqual(read['items'][0]['error']['code'], 'SOURCE_NOT_IN_TASK')

    def test_unmerged_local_index_is_rejected_without_refreshing_it(self):
        repo = self.connect()
        oid = git('rev-parse', 'HEAD:a.txt', cwd=self.repo.work)
        git('update-index', '--force-remove', 'a.txt', cwd=self.repo.work)
        git('update-index', '--index-info', cwd=self.repo.work,
            data=f'100644 {oid} 1\ta.txt\n100644 {oid} 2\ta.txt\n100644 {oid} 3\ta.txt\n'.encode())
        before = (self.repo.work / '.git/index').read_bytes()
        op = self.call('task', {'action': 'start', 'requestId': 'unmerged', 'repo': repo, 'localChanges': True})
        self.assertEqual(op['error']['code'], 'CHECKOUT_UNMERGED')
        self.assertEqual((self.repo.work / '.git/index').read_bytes(), before)
        self.assertEqual(self.c.store.all('SELECT * FROM task'), [])

    def test_integration_admission_scope_stale_checkpoint_and_local_failure(self):
        repo = self.connect()
        target, source = self.start(repo), self.put(self.start(repo), 'a.txt', 'incoming')
        other = self.open()
        args = {'action': 'integrate', 'requestId': 'wrong-repo', 'taskId': target['taskId'],
                'expected': target['checkpoint'], 'sourceTaskId': other['taskId']}
        self.assertEqual(self.c.call('alice', 'tdev_task', args)['error']['code'], 'INTEGRATION_SOURCE')
        target = self.put(target, 'b.txt', 'new target checkpoint')
        args.update(requestId='stale-target', sourceTaskId=source['taskId'])
        self.assertEqual(self.c.call('alice', 'tdev_task', args)['error']['code'], 'STALE_CHECKPOINT')
        args.update(requestId='utility-failure', expected=target['checkpoint'])
        with patch('tdev.core.integrate', side_effect=Fault('TRANSPORT_TIMEOUT', 'Private merge timed out', 'unknown')):
            op = self.call('task', args)
        self.assertEqual(op['status'], 'failed')
        self.assertEqual(op['effect'], 'none')
        current = self.c.task('alice', target['taskId'])
        self.assertIsNone(current['busy'])
        self.assertEqual(current['checkpoint'], target['checkpoint'])
        # A bad resolution cannot silently add unrelated edits alongside the integration.
        invalid = self.call('task', {**args, 'requestId': 'bad-resolution',
            'resolutions': [{'path': 'unrelated', 'choice': 'content', 'content': 'no'}]})
        self.assertEqual(invalid['error']['code'], 'RESOLUTION_NOT_REQUIRED')
        self.assertEqual(self.c.task('alice', target['taskId'])['checkpoint'], target['checkpoint'])

    def test_source_delta_can_be_integrated_on_a_newer_base(self):
        repo = self.connect()
        old = self.put(self.start(repo), 'a.txt', 'old task feature')
        (self.repo.work / 'b.txt').write_text('upstream change')
        git('add', 'b.txt', cwd=self.repo.work)
        git('commit', '-m', 'upstream advanced', cwd=self.repo.work)
        target = self.start(repo)
        rejected = self.c.call('alice', 'tdev_task', {'action': 'integrate', 'requestId': 'before-source-base',
            'taskId': old['taskId'], 'expected': old['checkpoint'], 'sourceTaskId': target['taskId'],
            'sourceCheckpoint': old['base']})
        self.assertEqual(rejected['error']['code'], 'SOURCE_NOT_IN_TASK')
        integrated = self.integrate(target, old)
        self.assertTrue(integrated['applied'])
        target['checkpoint'] = integrated['checkpoint']
        self.assertEqual(self.contents(target), {'a.txt': b'old task feature', 'b.txt': b'upstream change'})
        wrong_direction = self.c.call('alice', 'tdev_task', {'action': 'integrate', 'requestId': 'new-into-old',
            'taskId': old['taskId'], 'expected': old['checkpoint'], 'sourceTaskId': target['taskId']})
        self.assertEqual(wrong_direction['error']['code'], 'UNRELATED_BASE')
