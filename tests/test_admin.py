import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from tdev.admin import stage, point, check, rollback, init_config, delegate_projects
from tdev.common import Fault
from tdev.store import Store


class AdminTest(unittest.TestCase):
    def test_once_only_project_delegation_preserves_credentials_and_existing_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'install'; projects = Path(tmp) / 'projects'; projects.mkdir()
            init_config(root)
            original = json.loads((root / 'config.json').read_bytes())
            delegate_projects(root, 'owner', 'local', local_root=projects, validation='git diff --check', allow_create=True)
            changed = json.loads((root / 'config.json').read_bytes())
            self.assertEqual(changed['principals']['owner']['tokenHash'], original['principals']['owner']['tokenHash'])
            self.assertEqual(changed['repositories'], original['repositories'])
            self.assertEqual(changed['principals']['owner']['projectPolicies'], ['local'])
            with self.assertRaises(Fault):
                delegate_projects(root, 'owner', 'local', github_owner='different', validation='true')
            self.assertEqual(json.loads((root / 'config.json').read_bytes()), changed)

    def test_deployment_delegation_preserves_auth_and_refuses_target_replacement(self):
        import contextlib
        import io
        import sys
        from unittest.mock import patch
        from tdev.admin import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'install'
            init_config(root)
            before = json.loads((root / 'config.json').read_bytes())
            argv = ['tdev.admin', 'delegate-deployments', '--root', str(root)]
            with patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
                main()
                main()
            after = json.loads((root / 'config.json').read_bytes())
            self.assertEqual(after['principals']['owner']['tokenHash'], before['principals']['owner']['tokenHash'])
            self.assertEqual(after['repositories'], before['repositories'])
            self.assertEqual(after['principals']['owner']['deploymentTargets'], ['termux'])
            self.assertEqual(after['deploymentTargets']['termux'], {'kind': 'termux', 'servicePrefix': 'tdev-app-'})
            with patch.object(sys, 'argv', argv + ['--service-prefix', 'tdev-app-other-']), self.assertRaises(Fault):
                main()
            self.assertEqual(json.loads((root / 'config.json').read_bytes()), after)

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
            tunnel_run = (root / "services/tdev-tunnel/run").read_text()
            self.assertIn('tdev.resident', tunnel_run)
            self.assertIn('--role tunnel', tunnel_run)
            self.assertEqual(one['tunnelMode'], 'native-cgo')
            self.assertFalse((root / 'services/tdev-oai-tunnel').exists())
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
            # Incompatible bundles cannot read the composition state format.
            with self.assertRaises(Fault) as incompatible:
                point(root, two['bundle'])
            self.assertEqual(incompatible.exception.value['code'], 'SCHEMA_VERSION')
            (source / 'contracts').mkdir()
            (source / 'contracts/config.schema.json').write_text(json.dumps({'x-stateVersions': [3]}))
            compatible = stage(root, source)
            point(root, compatible['bundle'])
            self.assertEqual(check(root)['bundle'], compatible['bundle'])
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
            tunnel_run = (root / "services/tdev-tunnel/run").read_text()
            self.assertIn('tdev.resident', tunnel_run)
            self.assertIn('--role tunnel', tunnel_run)
