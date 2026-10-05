"""Large checkout/source paths through the executable HTTP boundary."""
import base64
import json
import os
import random
import shutil
import time
import unittest
from pathlib import Path

from acceptance.harness import Runtime, git
from acceptance import test_import


class CapacityHTTPTest(unittest.TestCase):
    call = test_import.ImportTest.call
    connect = test_import.ImportTest.connect
    start = test_import.ImportTest.start

    @staticmethod
    def fill(path, size, seed):
        path.parent.mkdir(parents=True, exist_ok=True)
        chunk = random.Random(seed).randbytes(1024 * 1024)
        with path.open('wb') as stream:
            while size:
                part = chunk[:min(size, len(chunk))]
                stream.write(part)
                size -= len(part)

    def journey(self, names, total, overflow=False):
        r = self.runtime
        started = time.monotonic()
        index = (r.work / '.git/index').read_bytes()
        refs = git('for-each-ref', '--format=%(refname) %(objectname)', cwd=r.work)
        repo = self.connect()
        space = self.call('workspace', {'action': 'create', 'requestId': 'space', 'name': 'capacity',
                                      'projects': [repo]})['result']
        target = self.call('task', {'action': 'start', 'requestId': 'target', 'repo': repo,
                                   'workspaceId': space['workspaceId']})['result']
        source = self.start('source', repo, workspaceId=space['workspaceId'])
        self.assertEqual(source['status'], 'succeeded', source)
        source = source['result']
        self.assertEqual(source['localImport']['files'], len(names) + 2)
        changed = self.call('edit', {'requestId': 'edit', 'taskId': source['taskId'], 'expected': source['checkpoint'],
            'edits': [{'action': 'replace', 'path': 'a.txt', 'old': 'hello', 'text': 'WORLD'}]})
        self.assertEqual(changed['status'], 'succeeded', changed)
        merged = self.call('task', {'action': 'integrate', 'requestId': 'merge', 'taskId': target['taskId'],
            'expected': target['checkpoint'], 'sourceTaskId': source['taskId'], 'sourceCheckpoint': changed['result']['checkpoint']})
        self.assertEqual(merged['status'], 'succeeded', merged)
        self.assertTrue(merged['result']['applied'])
        size = (r.work / names[0]).stat().st_size
        with (r.work / names[0]).open('rb') as stream:
            stream.seek(max(0, size - 31))
            expected = stream.read(31)
        read = self.call('read', {'taskId': target['taskId'], 'queries': [{'action': 'file',
            'path': names[0], 'offset': max(0, size - 31), 'limit': 31}]})['items'][0]
        self.assertEqual(base64.b64decode(read['data']), expected)
        self.assertEqual(read['size'], size)
        self.assertTrue(read['complete'])
        if overflow:
            (r.work / 'over').write_bytes(b'x')
            over = self.start('overflow', repo, workspaceId=space['workspaceId'])
            self.assertEqual(over['status'], 'failed', over)
            self.assertEqual(over['error']['code'], 'SOURCE_LIMIT')
            self.assertIn('budget=sourceBytes configured=536870912 observed=536870913', over['error']['message'])
        for task in (source, target):
            result = self.call('task', {'action': 'cleanup', 'requestId': 'clean-' + task['taskId'], 'taskId': task['taskId']})
            self.assertEqual(result['status'], 'succeeded', result)
        view = self.call('workspace', {'action': 'inspect', 'workspaceId': space['workspaceId'], 'includeClosed': True})
        self.assertEqual(len(view['tasks']), 2)
        self.assertTrue(self.call('workspace', {'action': 'close', 'requestId': 'close',
            'workspaceId': space['workspaceId'], 'expectedRevision': view['workspace']['revision']})['result']['closed'])
        self.assertEqual((r.work / '.git/index').read_bytes(), index)
        self.assertEqual(git('for-each-ref', '--format=%(refname) %(objectname)', cwd=r.work), refs)
        print(json.dumps({'httpCapacity': len(names), 'bytes': total, 'seconds': round(time.monotonic() - started, 3),
                          'result': 'PASS'}), flush=True)

    def test_173_mib_and_512_mib_aggregate(self):
        for size in (173 * 1024 * 1024 + 31, 512 * 1024 * 1024 - 12):
            with self.subTest(bytes=size):
                self.runtime = Runtime(request_timeout_seconds=300)
                try:
                    names = [f'large-{i}' for i in range(1 if size < 512 * 1024 * 1024 - 12 else 8)]
                    remaining = size
                    for i, name in enumerate(names):
                        amount = remaining if i + 1 == len(names) else 64 * 1024 * 1024
                        self.fill(self.runtime.work / name, amount, 947 + i)
                        remaining -= amount
                    self.journey(names, size, overflow=len(names) == 8)
                finally:
                    self.runtime.close()

    def test_corpus(self):
        self.runtime = Runtime(request_timeout_seconds=300)
        try:
            r = self.runtime
            corpus = os.environ.get('TDEV_CAPACITY_CORPUS')
            if corpus:
                root = Path(corpus).resolve(strict=True)
                names = []
                for path in sorted(root.rglob('*')):
                    if path.is_file() and not path.is_symlink():
                        name = 'corpus/' + str(path.relative_to(root))
                        (r.work / name).parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(path, r.work / name)
                        names.append(name)
            else:
                names = [f'corpus-{i:03}' for i in range(190)]
                for i, name in enumerate(names):
                    self.fill(r.work / name, 208896, 947 + i)
            self.journey(names, sum((r.work / name).stat().st_size for name in names))
        finally:
            self.runtime.close()

    def test_committed_173_mib_source(self):
        self.runtime = Runtime(request_timeout_seconds=300)
        try:
            size = 173 * 1024 * 1024 + 31
            self.fill(self.runtime.work / 'large-file', size, 947)
            git('-c', 'core.bigFileThreshold=1m', 'add', 'large-file', cwd=self.runtime.work)
            git('-c', 'core.bigFileThreshold=1m', 'commit', '-m', 'committed source', cwd=self.runtime.work)
            self.journey(['large-file'], size)
            # Measure this controller, not cumulative children of the unittest
            # runner (earlier physical-budget fixtures can have larger peaks).
            status = Path(f'/proc/{self.runtime.process.pid}/status').read_text()
            peak = int(next(line.split()[1] for line in status.splitlines() if line.startswith('VmHWM:')))
            self.assertLess(peak, 128 * 1024)
            print(json.dumps({'committedSourceControllerPeakKiB': peak}), flush=True)
        finally:
            self.runtime.close()
