import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tdev.diagnostic_observer import observe


class ObserverTest(unittest.TestCase):
    def test_bounded_records_unavailable_socket_and_refuses_reuse(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            result = observe(root/'absent-state', root/'evidence', seconds=1, interval=.25)
            self.assertGreater(result['samples'], 0)
            self.assertEqual(result['samples'], result['unavailable'])
            data = (root/'evidence/samples.jsonl').read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), result['sha256'])
            self.assertNotIn(str(root), data.decode())
            self.assertEqual(0, (root/'evidence/samples.jsonl').stat().st_mode & 0o077)
            with self.assertRaises(FileExistsError):
                observe(root/'absent-state', root/'evidence', seconds=1)
            self.assertEqual(data, (root/'evidence/samples.jsonl').read_bytes())
            self.assertFalse((root/'absent-state').exists())

    def test_byte_limit_and_invalid_configuration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch('tdev.diagnostic_observer.snapshot', return_value={'bounded':'a'*2000}):
                result = observe(root, root/'bounded', seconds=1, max_bytes=1024)
            self.assertEqual(('byte_limit', 0), (result['stopReason'], result['bytes']))
            for seconds in (0, 3601, float('nan')):
                with self.assertRaises(ValueError):
                    observe(root, root/'invalid', seconds=seconds)
            self.assertFalse((root/'invalid').exists())

    def test_separate_observer_records_stopped_process_and_recovery_without_restarting_it(self):
        source = Path(__file__).resolve().parents[1]
        program = '''import sys,time
from pathlib import Path
from tdev.diagnostic_policy import DiagnosticsPolicy
p=DiagnosticsPolicy(Path(sys.argv[1])/'diagnostics',Path(sys.argv[2]))
print('ready',flush=True)
try:
    while True: time.sleep(.1)
finally: p.close()
'''
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            child = subprocess.Popen([sys.executable, '-c', program, str(root/'state'), str(source)],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual('ready', child.stdout.readline().strip())
                before = observe(root/'state', root/'before', seconds=1)
                self.assertEqual(0, before['unavailable'])
                os.kill(child.pid, signal.SIGSTOP)
                stopped = subprocess.run([sys.executable, '-m', 'tdev.diagnostic_observer',
                    '--state',str(root/'state'),'--output',str(root/'stopped'),'--seconds','1'],
                    capture_output=True, text=True, timeout=5, check=True)
                gap = json.loads(stopped.stdout)
                self.assertEqual(1, gap['unavailable'])
                self.assertIsNone(child.poll())
                os.kill(child.pid, signal.SIGCONT)
                recovered = observe(root/'state', root/'recovered', seconds=1, interval=.25)
                self.assertEqual(0, recovered['unavailable'])
                for name in ('before','recovered'):
                    row=json.loads((root/name/'samples.jsonl').read_text().splitlines()[0])
                    self.assertEqual(child.pid, row['snapshot']['pid'])
            finally:
                if child.poll() is None:
                    os.kill(child.pid, signal.SIGCONT)
                    child.terminate()
                child.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()
