#!/usr/bin/env python3
"""Explicit large fixtures, separate from fast budget/forgery unit checks."""
import argparse
import os
import sys
import unittest
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / 'src'), str(root / 'tests'), str(root / '.tdev-deps')]
parser = argparse.ArgumentParser()
parser.add_argument('--corpus', help='Read-only actual corpus root; copied into owned fixtures')
parser.add_argument('--case', default='capacity_journey', help='unittest qualification selector')
args = parser.parse_args()
if args.corpus:
    os.environ['TDEV_CAPACITY_CORPUS'] = str(Path(args.corpus).resolve(strict=True))
suite = unittest.defaultTestLoader.loadTestsFromName(args.case)
sys.exit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
