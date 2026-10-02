"""Baseline encoder bridge; the fixed JSON vectors are shared across implementations."""
import json
import unittest
from pathlib import Path

from tdev.common import canonical, digest


class IdentityTest(unittest.TestCase):
    def test_fixed_canonical_bytes_and_hashes(self):
        fixture = json.loads((Path(__file__).parent / 'acceptance/identity.json').read_text())
        for case in fixture['cases']:
            with self.subTest(case=case['name']):
                self.assertEqual(canonical(case['value']), case['canonical'].encode('ascii'))
                self.assertEqual(digest(case['value']), case['sha256'])

    def test_nonfinite_numbers_cannot_enter_identity(self):
        for value in (float('nan'), float('inf'), float('-inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                canonical({'value': value})
