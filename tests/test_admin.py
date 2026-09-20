import json
import os
import shutil
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
            (root / "bin").mkdir(parents=True)
            native = root / "bin/tunnel-client"
            native.write_text("#!/bin/sh\nprintf '0.0.14\\n'\n")
            native.chmod(0o700)
            one = stage(root, source)
            self.assertFalse(one["started"])
            self.assertTrue((root / "services/tdev/down").exists())
            self.assertEqual((root / "tunnel-env").stat().st_mode & 0o777, 0o700)
            tunnel_run = (root / "services/tdev-oai-tunnel/run").read_text()
            self.assertNotIn("envdir", tunnel_run)
            self.assertIn("CONTROL_PLANE_API_KEY", tunnel_run)
            self.assertIn("--health.listen-addr 127.0.0.1:0", tunnel_run)
            self.assertIn("--health.url-file " + str(root / "tunnel-health.url"), tunnel_run)
            self.assertEqual(one["tunnelMode"], "native-cgo")
            self.assertIn(str(native), tunnel_run)
            self.assertNotIn("termux-chroot", tunnel_run)
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

    def test_termux_chroot_fallback_template(self):
        prefix = os.environ.get("PREFIX")
        if not (prefix and shutil.which("termux-chroot") and shutil.which("tunnel-client")):
            self.skipTest("Termux tunnel fallback is host-specific")
        cert = Path(prefix) / "etc/tls/cert.pem"
        if not cert.is_file():
            self.skipTest("Termux CA bundle unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            source, root = Path(tmp) / "source", Path(tmp) / "installation"
            (source / "src").mkdir(parents=True)
            (source / "src/example.py").write_text("version=1\n")
            (source / "requirements.txt").write_text("")
            (root / "bin").mkdir(parents=True)
            invalid_native = root / "bin/tunnel-client"
            invalid_native.write_text("#!/bin/sh\nexit 1\n")
            invalid_native.chmod(0o700)
            staged = stage(root, source)
            self.assertEqual(staged["tunnelMode"], "termux-chroot")
            tunnel_run = (root / "services/tdev-oai-tunnel/run").read_text()
            self.assertIn(shutil.which("termux-chroot"), tunnel_run)
            self.assertIn("CA_BUNDLE=", tunnel_run)
            self.assertIn(str(cert), tunnel_run)
            self.assertNotIn(" -b ", tunnel_run)
