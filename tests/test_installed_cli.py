import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev import cli
from tdev.common import Fault, canonical, digest


class InstalledCLITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.prefix = self.root/'prefix'
        (self.prefix/'bin').mkdir(parents=True)
        (self.root/'resident.json').write_text('{}')
        self.bundle('one')
        (self.root/'active').symlink_to('versions/one')

    def bundle(self, value):
        root = self.root/'versions'/value
        (root/'src/tdev').mkdir(parents=True)
        (root/'src/tdev/__init__.py').write_text('')
        (root/'src/tdev/cli.py').write_text('import sys; print('+repr(value)+', *sys.argv[1:])')
        files = {str(p.relative_to(root)):digest(p.read_bytes()) for p in root.rglob('*') if p.is_file()}
        (root/'manifest.json').write_bytes(canonical({'schema':1,'id':digest(files),'files':files,'stateVersions':[1]}))
        return root

    def link(self):
        with patch.dict(os.environ, {'PREFIX':str(self.prefix),'PATH':str(self.prefix/'bin')+os.pathsep+os.environ['PATH']}), patch.object(cli,'source_root',side_effect=AssertionError('checkout is not an installed authority')), contextlib.redirect_stdout(io.StringIO()):
            return cli.main(['--root',str(self.root),'link'])

    def test_actual_launcher_tracks_activation_and_rollback_and_preserves_arguments(self):
        self.link()
        launcher = self.prefix/'bin/tdev'
        def run():
            return subprocess.run([str(launcher),'a b','--literal'],check=True,text=True,capture_output=True).stdout.strip()
        self.assertEqual(run(),'one a b --literal')
        self.bundle('two'); (self.root/'active').unlink(); (self.root/'active').symlink_to('versions/two')
        self.assertEqual(run(),'two a b --literal')
        (self.root/'active').unlink(); (self.root/'active').symlink_to('versions/one')
        self.assertEqual(run(),'one a b --literal')
        self.assertNotIn('/prj/',launcher.read_text())

    def test_missing_installation_never_writes_launcher(self):
        (self.root/'resident.json').unlink()
        with self.assertRaises(Fault): self.link()
        self.assertFalse((self.prefix/'bin/tdev').exists())

    def test_corrupt_bundle_does_not_replace_launcher(self):
        self.link(); launcher=self.prefix/'bin/tdev'; before=launcher.read_bytes()
        (self.root/'active/src/tdev/cli.py').write_text('tampered')
        with self.assertRaises(Fault): self.link()
        self.assertEqual(launcher.read_bytes(),before)

    def test_missing_active_does_not_replace_launcher(self):
        self.link(); launcher=self.prefix/'bin/tdev'; before=launcher.read_bytes()
        (self.root/'active').unlink()
        with self.assertRaises(FileNotFoundError): self.link()
        self.assertEqual(launcher.read_bytes(),before)
