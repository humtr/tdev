"""Local JS controller checks; no resident calls or ChatGPT host qualification."""
import subprocess
import unittest
from pathlib import Path


class ChatGPTCellTest(unittest.TestCase):
    def test_controller_boundaries(self):
        root = Path(__file__).resolve().parents[1]
        subprocess.run(['node', '--test', str(root / 'tests/chatgpt_cell.test.cjs')],
                       cwd=root, check=True, timeout=30)
