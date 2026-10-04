"""Exact source composition and frozen three-way integration through either executable."""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually, git


class IntegrationTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)
        self.sequence = 0

    def key(self):
        self.sequence += 1
        return 'integration-' + str(self.sequence)

    def call(self, tool, request):
        status, _, response, _ = self.runtime.request('tools/call',
            {'name': 'tdev_' + tool, 'arguments': {'request': request}})
        self.assertEqual(status, 200, response)
        value = response['result']['structuredContent']
        schema = next(t['outputSchema'] for t in CONTRACT['x-tools'] if t['name'] == 'tdev_' + tool)
        jsonschema.Draft202012Validator({**schema, '$defs': CONTRACT['$defs']}).validate(value)
        return value

    def result(self, tool, request):
        value = self.call(tool, request)
        self.assertTrue(value['ok'], value)
        return value['result']

    def error(self, tool, request, code):
        value = self.call(tool, request)
        self.assertFalse(value['ok'], value)
        self.assertEqual(value['error']['code'], code, value)

    def task(self, managed=True, **fields):
        request = {'action': 'start' if managed else 'open', 'requestId': self.key(), **fields}
        if not managed: request.update(repo='test', ref='refs/heads/main', expectedHead=self.runtime.head)
        operation = self.result('task', request)
        self.assertEqual(operation['status'], 'succeeded', operation)
        return operation['result']

    def listing(self, task):
        return {entry['path']: entry for entry in self.result('read',
            {'taskId': task['taskId'], 'queries': [{'action': 'list'}]})['items'][0]['entries']}

    def contents(self, task, names=None):
        names = names or list(self.listing(task))
        result = self.result('read', {'taskId': task['taskId'],
            'queries': [{'action': 'file', 'path': name} for name in names]})
        return {name: base64.b64decode(item['data']) for name, item in zip(names, result['items'])}

    def edit(self, task, edits):
        operation = self.result('edit', {'requestId': self.key(), 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': edits})
        self.assertEqual(operation['status'], 'succeeded', operation)
        return {**task, 'checkpoint': operation['result']['checkpoint']}

    def put(self, task, name, data, mode='100644'):
        previous = self.listing(task).get(name)
        return self.edit(task, [{'action': 'put', 'path': name, 'before': previous['blob'] if previous else None,
            'content': base64.b64encode(data).decode() if isinstance(data, bytes) else data,
            'encoding': 'base64' if isinstance(data, bytes) else 'utf8', 'mode': mode}])

    def request(self, target, source, **fields):
        return {'action': 'integrate', 'requestId': self.key(), 'taskId': target['taskId'],
            'expected': target['checkpoint'], 'sourceTaskId': source['taskId'], **fields}

    def integrate(self, target, source, **fields):
        operation = self.result('task', self.request(target, source, **fields))
        self.assertEqual((operation['status'], operation['effect']), ('succeeded', 'committed'), operation)
        return operation

    def compose_request(self, sources):
        return {'action': 'compose', 'requestId': self.key(), 'repo': 'test', 'ref': 'refs/heads/main',
            'expectedHead': self.runtime.head, 'sources': [{'taskId': task['taskId'], 'checkpoint': task['checkpoint']} for task in sources]}

    def advance(self, filename, data):
        r = self.runtime
        (r.work / filename).write_text(data)
        git('add', filename, cwd=r.work)
        git('commit', '-m', 'upstream', cwd=r.work)
        git('push', str(r.remote), 'HEAD:refs/heads/main', cwd=r.work)
        r.head = git('rev-parse', 'HEAD', cwd=r.work)

    def test_compose_independent_deltas_lost_reply_and_replay_after_sources_advance(self):
        r = self.runtime
        first = self.put(self.task(False), 'a.txt', 'first change')
        second = self.put(self.task(False), 'b.txt', b'second\x00\xff', '100755')
        (r.work / 'a.txt').write_text('staged')
        git('add', 'a.txt', cwd=r.work)
        (r.work / 'a.txt').write_text('user working bytes')
        (r.work / 'untracked').write_text('preserve')
        index = (r.work / '.git/index').read_bytes()
        args = self.compose_request([first, second])
        r.discard_reply('task', args)
        original = self.result('task', args)
        self.assertEqual(original['status'], 'succeeded', original)
        combined = original['result']
        self.assertEqual(combined['base'], r.head)
        self.assertNotIn(combined['taskId'], (first['taskId'], second['taskId']))
        self.assertEqual(self.contents(combined), {'a.txt': b'first change', 'b.txt': b'second\x00\xff'})
        self.assertEqual(self.listing(combined)['b.txt']['mode'], '100755')
        first = self.put(first, 'a.txt', 'later source')
        self.result('task', {'action': 'close', 'requestId': self.key(), 'taskId': combined['taskId'], 'expected': combined['checkpoint']})
        r.restart()
        self.assertEqual(self.result('task', args), original)
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual((r.work / 'a.txt').read_text(), 'user working bytes')
        self.assertEqual((r.work / 'untracked').read_text(), 'preserve')
        self.assertEqual(git('--git-dir=' + str(r.remote), 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')

    def test_compose_conflicts_stale_sources_and_identical_overlap_are_atomic(self):
        first = self.put(self.task(False), 'a.txt', 'first')
        second = self.put(self.task(False), 'a.txt', 'second')
        args = self.compose_request([first, second])
        failed = self.result('task', args)
        self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', 'COMPOSE_CONFLICT'))
        self.assertEqual(len(self.result('task', {'action': 'list'})['tasks']), 2)
        second = self.put(second, 'a.txt', 'first')
        identical = self.result('task', self.compose_request([first, second, first]))
        self.assertEqual(identical['status'], 'succeeded', identical)
        self.assertEqual(self.contents(identical['result'])['a.txt'], b'first')
        stale = self.result('task', {**args, 'requestId': self.key()})
        self.assertEqual(stale['error']['code'], 'SOURCE_CHANGED')
        managed = self.task()
        mismatched = self.result('task', self.compose_request([managed]))
        self.assertEqual((mismatched['status'], mismatched['effect'], mismatched['error']['code']), ('failed', 'none', 'SOURCE_CHANGED'))

    def test_clean_three_way_merge_keeps_source_and_ignores_user_merge_driver(self):
        r = self.runtime
        text = 'first\n' + 'middle\n' * 12 + 'last\n'
        self.advance('a.txt', text)
        (r.work / '.gitattributes').write_text('a.txt merge=probe\n')
        git('config', 'merge.probe.driver', 'touch DRIVER-RAN', cwd=r.work)
        target = self.put(self.task(), 'a.txt', text.replace('first', 'ours'))
        source = self.put(self.task(), 'a.txt', text.replace('last', 'theirs'))
        index = (r.work / '.git/index').read_bytes()
        operation = self.integrate(target, source)
        result = operation['result']
        self.assertTrue(result['applied'], result)
        self.assertEqual((result['sourceTaskId'], result['sourceBase'], result['sourceCheckpoint']),
            (source['taskId'], source['base'], source['checkpoint']))
        self.assertEqual(self.contents(target)['a.txt'], text.replace('first', 'ours').replace('last', 'theirs').encode())
        self.assertEqual(self.contents(source)['a.txt'], text.replace('last', 'theirs').encode())
        self.assertFalse((r.work / 'DRIVER-RAN').exists())
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual((r.work / 'a.txt').read_text(), text)

    def test_conflict_receipt_preserves_target_and_resolves_frozen_historical_source(self):
        r = self.runtime
        target = self.put(self.task(), 'a.txt', 'ours\n')
        source = self.put(self.task(), 'a.txt', 'theirs\n')
        source = self.put(source, 'new', 'independent incoming')
        args = self.request(target, source)
        r.discard_reply('task', args)
        original = self.result('task', args)
        result = original['result']
        self.assertFalse(result['applied'])
        self.assertEqual((result['checkpoint'], result['conflictCount']), (target['checkpoint'], 1))
        self.assertEqual(result['conflicts'][0]['reason'], 'content')
        self.assertNotIn('new', self.listing(target))
        old = source['checkpoint']
        source = self.put(source, 'a.txt', 'later source\n')
        r.restart()
        self.assertEqual(self.result('task', args), original)
        resolved = self.integrate(target, source, sourceCheckpoint=old, resolutions=[{'path': 'a.txt', 'choice': 'incoming'}])['result']
        self.assertTrue(resolved['applied'])
        self.assertEqual(self.contents(target)['a.txt'], b'theirs\n')
        self.assertEqual(self.contents(target)['new'], b'independent incoming')
        self.assertEqual(self.contents(source)['a.txt'], b'later source\n')

    def test_binary_delete_modify_add_link_and_topology_conflicts_require_all_resolutions(self):
        r = self.runtime
        (r.work / 'link').symlink_to('a.txt')
        git('add', 'link', cwd=r.work)
        git('commit', '-m', 'link base', cwd=r.work)
        git('push', str(r.remote), 'HEAD:refs/heads/main', cwd=r.work)
        r.head = git('rev-parse', 'HEAD', cwd=r.work)
        target, source = self.task(), self.task()
        for name, data, mode in [('a.txt', b'ours\x00', '100644'), ('b.txt', 'modified', '100644'),
                                 ('node', 'file', '100644'), ('add', 'ours', '100644'), ('link', 'b.txt', '120000')]:
            target = self.put(target, name, data, mode)
        for name, data, mode in [('a.txt', b'theirs\x00', '100644'), ('node/child', 'child', '100644'),
                                 ('add', 'theirs', '100644'), ('link', 'regular', '100644')]:
            source = self.put(source, name, data, mode)
        source = self.edit(source, [{'action': 'delete', 'path': 'b.txt', 'before': self.listing(source)['b.txt']['blob']}])
        result = self.integrate(target, source)['result']
        self.assertFalse(result['applied'])
        self.assertEqual({c['reason'] for c in result['conflicts']}, {'binary', 'delete-modify', 'add-add', 'type-or-link', 'path-collision'})
        unresolved = self.integrate(target, source, resolutions=[{'path': 'a.txt', 'choice': 'current'}])['result']
        self.assertFalse(unresolved['applied'])
        self.assertEqual(unresolved['checkpoint'], target['checkpoint'])
        resolutions = [{'path': 'a.txt', 'choice': 'content', 'content': base64.b64encode(b'resolved\x00\xff').decode(), 'encoding': 'base64', 'mode': '100755'},
            {'path': 'b.txt', 'choice': 'delete'}, {'path': 'add', 'choice': 'current'}, {'path': 'link', 'choice': 'base'},
            {'path': 'node', 'choice': 'delete'}, {'path': 'node/child', 'choice': 'incoming'}]
        applied = self.integrate(target, source, resolutions=resolutions)['result']
        self.assertTrue(applied['applied'], applied)
        self.assertEqual(self.contents(target), {'a.txt': b'resolved\x00\xff', 'add': b'ours', 'link': b'a.txt', 'node/child': b'child'})
        self.assertEqual(self.listing(target)['a.txt']['mode'], '100755')

    def test_invalid_resolution_and_admission_scope_never_change_target(self):
        target = self.put(self.task(), 'a.txt', 'ours')
        source = self.put(self.task(), 'a.txt', 'theirs')
        for resolutions, code in [([{'path': 'unrelated', 'choice': 'content', 'content': 'no'}], 'RESOLUTION_NOT_REQUIRED'),
            ([{'path': 'a.txt', 'choice': 'current'}, {'path': 'a.txt', 'choice': 'incoming'}], 'DUPLICATE_PATH'),
            ([{'path': 'a.txt', 'choice': 'content', 'content': '$invalid', 'encoding': 'base64'}], 'ENCODING')]:
            failed = self.result('task', self.request(target, source, resolutions=resolutions))
            self.assertEqual((failed['status'], failed['effect'], failed['error']['code']), ('failed', 'none', code))
            self.assertEqual(self.result('read', {'taskId': target['taskId'], 'queries': [{'action': 'list'}]})['checkpoint'], target['checkpoint'])
        self.error('task', self.request(target, target), 'INTEGRATION_SOURCE')
        self.error('task', self.request(target, source, sourceCheckpoint=target['checkpoint']), 'SOURCE_NOT_IN_TASK')
        r = self.runtime
        r.config['repositories']['other'] = copy.deepcopy(r.config['repositories']['test'])
        r.config['principals']['alice']['repos']['other'] = ['refs/heads/main']
        r.config['principals']['alice']['managedRefNamespaces']['other'] = ['refs/heads/work/']
        r.save_config()
        other = self.task(repo='other')
        self.error('task', self.request(target, other), 'INTEGRATION_SOURCE')
        changed = self.put(target, 'b.txt', 'new checkpoint')
        self.error('task', self.request(target, source), 'STALE_CHECKPOINT')
        self.assertEqual(self.contents(changed)['b.txt'], b'new checkpoint')

    def test_old_delta_integrates_on_newer_base_and_reverse_direction_is_rejected(self):
        old = self.put(self.task(), 'a.txt', 'feature')
        self.advance('b.txt', 'upstream')
        current = self.task()
        self.error('task', self.request(old, current, sourceCheckpoint=old['base']), 'SOURCE_NOT_IN_TASK')
        self.error('task', self.request(old, current), 'UNRELATED_BASE')
        result = self.integrate(current, old)['result']
        self.assertTrue(result['applied'], result)
        self.assertEqual(self.contents(current), {'a.txt': b'feature', 'b.txt': b'upstream'})

    def test_conflicts_are_sorted_bounded_and_can_be_resolved_in_a_new_request(self):
        target, source = self.task(), self.task()
        names = [f'conflict-{i:03}' for i in range(60)]
        target = self.edit(target, [{'action': 'put', 'path': name, 'before': None, 'content': 'ours'} for name in names])
        source = self.edit(source, [{'action': 'put', 'path': name, 'before': None, 'content': 'theirs'} for name in names])
        result = self.integrate(target, source)['result']
        self.assertEqual((result['conflictCount'], result['conflictsTruncated'], len(result['conflicts'])), (60, True, 50))
        self.assertEqual([c['path'] for c in result['conflicts']], names[:50])
        resolved = self.integrate(target, source, resolutions=[{'path': name, 'choice': 'current'} for name in names])['result']
        self.assertTrue(resolved['applied'], resolved)

    def test_duplicate_integration_has_one_receipt_and_distinct_writers_use_cas(self):
        r = self.runtime
        target = self.task()
        source = self.put(self.task(), 'a.txt', 'incoming')
        args = self.request(target, source)
        with ThreadPoolExecutor(max_workers=4) as pool:
            operations = list(pool.map(lambda _: self.result('task', args), range(4)))
        self.assertEqual(len({o['id'] for o in operations}), 1)
        done = eventually(lambda: self.result('task', args), lambda o: o['status'] == 'succeeded')
        self.assertTrue(done['result']['applied'])
        target['checkpoint'] = done['result']['checkpoint']
        with ThreadPoolExecutor(max_workers=2) as pool:
            requests = [self.request(target, source), self.request(target, source)]
            replies = list(pool.map(lambda request: self.call('task', request), requests))
        self.assertEqual(sum(reply['ok'] for reply in replies), 1, replies)
        loser = next(reply for reply in replies if not reply['ok'])
        self.assertIn(loser['error']['code'], ('TASK_BUSY', 'STALE_CHECKPOINT'))
        r.restart()
        self.assertEqual(self.result('task', args), done)

    def test_sha256_compose_and_integrate_keep_exact_source_identity(self):
        r = Runtime(object_format='sha256')
        self.addCleanup(r.close)
        self.runtime = r
        first = self.put(self.task(False), 'a.txt', b'first\x00\xff')
        second = self.put(self.task(False), 'b.txt', 'second')
        args = self.compose_request([first, second])
        composed = self.result('task', args)
        self.assertEqual(composed['status'], 'succeeded', composed)
        self.assertEqual(len(composed['result']['checkpoint']), 64)
        self.assertEqual(self.contents(composed['result']), {'a.txt': b'first\x00\xff', 'b.txt': b'second'})
        integrated = self.integrate(first, second)
        self.assertTrue(integrated['result']['applied'])
        self.assertEqual(len(integrated['result']['checkpoint']), 64)
        r.restart()
        self.assertEqual(self.result('task', args), composed)
