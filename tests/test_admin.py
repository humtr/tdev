import json
import tempfile
import unittest
from pathlib import Path

from tdev.admin import stage, point, check, rollback, init_config
from tdev.common import Fault
from tdev.store import Store


class AdminTest(unittest.TestCase):
    def test_inactive_install_exact_rollback_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, root = Path(tmp) / "source", Path(tmp) / "installation"
            (source / "src").mkdir(parents=True)
            (source / "src" / "example.py").write_text("version=1\n")
            (source / "requirements.txt").write_text("")
            one = stage(root, source)
            self.assertFalse(one["started"])
            self.assertTrue((root / "services/tdev/down").exists())
            self.assertFalse((root / "active").exists())
            point(root, one["bundle"])
            init_config(root)
            self.assertEqual(check(root)["bundle"], one["bundle"])
            self.assertEqual((root / "config.json").stat().st_mode & 0o777, 0o600)
            (source / "src" / "example.py").write_text("version=2\n")
            two = stage(root, source)
            point(root, two["bundle"])
            self.assertEqual(check(root)["bundle"], two["bundle"])
            point(root, two["bundle"])
            rollback(root)
            self.assertEqual(check(root)["bundle"], one["bundle"])
            with self.subTest("locked"):
                store = Store(root / "state")
                try:
                    with self.assertRaises(Fault):
                        point(root, two["bundle"])
                finally:
                    store.close()
            (root / "active/src/example.py").write_text("tampered")
            with self.assertRaises(Fault):
                check(root)
