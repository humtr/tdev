import importlib.metadata
import json
import os
import pty
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, Mock

from tdev import bootstrap
from tdev.common import Fault
from tdev.resident import Runit

SOURCE = Path(__file__).resolve().parents[1]


class DependencyTest(unittest.TestCase):
    def test_current_pinned_bundle_imports_without_global_site_packages(self):
        self.assertTrue(bootstrap.verify_dependencies(SOURCE/'.tdev-deps',bootstrap.pins(SOURCE)))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(bootstrap.verify_dependencies(Path(tmp),bootstrap.pins(SOURCE)))

    def test_failed_staging_preserves_existing_and_retry_replaces_only_after_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'requirements.txt').write_text('fixture==1\n')
            old=root/'.tdev-deps'; old.mkdir(); (old/'keep').write_text('previous')
            with patch.object(bootstrap,'verify_dependencies',return_value=False), \
                 patch.object(bootstrap.subprocess,'run',side_effect=subprocess.CalledProcessError(1,'pip')):
                with self.assertRaises(subprocess.CalledProcessError): bootstrap.dependencies(root)
            self.assertEqual((old/'keep').read_text(),'previous')
            with patch.object(bootstrap,'verify_dependencies',side_effect=[False,True]), \
                 patch.object(bootstrap.subprocess,'run') as run:
                bootstrap.dependencies(root)
            self.assertTrue(old.is_dir()); self.assertFalse((old/'keep').exists())
            self.assertIn('--no-deps',run.call_args.args[0])
            self.assertEqual(list(root.glob('.tdev-deps-stage-*')),[])

    def test_native_distribution_exact_version_copy_and_escaping_record_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installed=root/'system'; installed.mkdir(); target=root/'private'; target.mkdir()
            (installed/'rpds').mkdir(); (installed/'rpds/__init__.py').write_text('fixture=1\n')
            dist=Mock(version='1',metadata={'Name':'rpds-py'},files=[Path('rpds/__init__.py')])
            dist.locate_file.side_effect=lambda f:installed/str(f)
            with patch.object(importlib.metadata,'distributions',return_value=[dist]):
                self.assertFalse(bootstrap.seed_rpds(target,'2'))
                self.assertTrue(bootstrap.seed_rpds(target,'1'))
                self.assertEqual((target/'rpds/__init__.py').read_text(),'fixture=1\n')
                dist.files=[Path('../foreign')]
                with self.assertRaises(Fault): bootstrap.seed_rpds(target,'1')

    def test_native_version_gap_and_dependency_symlink_do_not_replace_old_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'requirements.txt').write_text('rpds-py==1\n')
            old=root/'.tdev-deps'; old.mkdir(); (old/'keep').write_text('previous')
            with patch.object(bootstrap,'verify_dependencies',return_value=False), \
                 patch.object(bootstrap,'seed_rpds',return_value=False), \
                 patch.object(sys,'getandroidapilevel',return_value=24,create=True), \
                 patch.object(bootstrap.subprocess,'run') as run:
                with self.assertRaises(Fault) as error: bootstrap.dependencies(root)
                self.assertEqual(error.exception.value['code'],'DEPENDENCY_NATIVE_VERSION')
                run.assert_not_called()
            self.assertEqual((old/'keep').read_text(),'previous')
            other=root/'other'; old.rename(other); old.symlink_to(other)
            with self.assertRaises(Fault): bootstrap.dependencies(root)
            self.assertEqual((other/'keep').read_text(),'previous')


class ServiceBootstrapTest(unittest.TestCase):
    def test_real_isolated_runsvdir_is_recognized_without_shared_daemon_changes(self):
        binary=shutil.which('runsvdir')
        if not binary: self.skipTest('runit unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            prefix=Path(tmp);svdir=prefix/'var/service';svdir.mkdir(parents=True)
            (prefix/'bin').mkdir();(prefix/'bin/runsvdir').symlink_to(binary)
            with patch.dict(os.environ,{'PREFIX':tmp,'SVDIR':str(svdir)}):
                backend=Runit()
                child=subprocess.Popen([binary,'-P',str(svdir)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                try:
                    deadline=time.monotonic()+3
                    while not backend.roots() and time.monotonic()<deadline: time.sleep(.02)
                    self.assertEqual([p['pid'] for p in backend.roots()],[child.pid])
                finally:
                    child.kill();child.wait(timeout=5)
                self.assertEqual(backend.roots(),[])

    def test_stock_daemon_without_status_uses_real_process_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            prefix=Path(tmp); svdir=prefix/'var/service'; svdir.mkdir(parents=True)
            with patch.dict(os.environ,{'PREFIX':tmp,'SVDIR':str(svdir)}):
                backend=Runit()
                proc={'pid':123,'start':'5','exe':str(prefix/'bin/runsvdir'),
                      'argv':['runsvdir','-P',str(svdir)]}
                with patch('tdev.resident.processes',return_value=[proc]), \
                     patch('tdev.resident.shutil.which',return_value='fixture'), \
                     patch('tdev.resident.command',return_value=Mock(returncode=1)) as command:
                    self.assertFalse(backend.preflight()['recoveryMonitor'])
                    self.assertEqual(command.call_args.args[0],['service-daemon','monitor-status'])
                    for changed in ({**proc,'exe':'/foreign/runsvdir'},
                                    {**proc,'argv':['runsvdir','/foreign/service']}):
                        with patch('tdev.resident.processes',return_value=[changed]),self.assertRaises(Fault): backend.preflight()
                    with patch('tdev.resident.processes',return_value=[proc,proc]),self.assertRaises(Fault): backend.preflight()

    def test_start_only_absent_root_and_never_restart_existing_or_ambiguous_roots(self):
        backend=Mock(prefix=Path('/termux'),svdir=Path('/termux/var/service'))
        backend.roots.return_value=[{'pid':1}]
        with patch.object(bootstrap.subprocess,'run') as run:
            bootstrap.services(backend); run.assert_not_called()
            backend.roots.return_value=[{'pid':1},{'pid':2}]
            with self.assertRaises(Fault): bootstrap.services(backend)
            run.assert_not_called()
            backend.roots.side_effect=[[],[{'pid':3}]]
            bootstrap.services(backend)
            self.assertEqual(run.call_args.args[0],['service-daemon','start'])
            self.assertEqual(run.call_args.kwargs['env']['SVDIR'],str(backend.svdir))


class ShellBootstrapTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.bin=self.root/'bin'; self.bin.mkdir()
        self.checkout=self.root/'source'; self.events=self.root/'events'
        self.real_git=shutil.which('git')
        self.env={**os.environ,'PREFIX':str(self.root),'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
                  'SVDIR':str(self.root/'var/service'),
                  'BOOT_EVENTS':str(self.events),'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':os.devnull}
        self.script('pkg','printf "pkg %s\\n" "$*" >> "$BOOT_EVENTS"\n')
        self.script('python','printf "python %s\\n" "$*" >> "$BOOT_EVENTS"\n')
        self.script('git','''if [ "$1" = clone ]; then
  for last; do :; done
  REAL_GIT clone --branch tdev -- "FIXTURE" "$last"
  exec REAL_GIT -C "$last" remote set-url origin https://github.com/humtr/tdev.git
fi
exec REAL_GIT "$@"
'''.replace('REAL_GIT',self.real_git).replace('FIXTURE',str(self.root/'fixture')))
        fixture=self.root/'fixture'; fixture.mkdir()
        self.git('init','-b','tdev',str(fixture))
        self.git('-C',str(fixture),'config','user.name','Fixture')
        self.git('-C',str(fixture),'config','user.email','fixture@example.invalid')
        (fixture/'src/tdev').mkdir(parents=True)
        (fixture/'src/tdev/bootstrap.py').write_text('# fixture\n')
        (fixture/'install.sh').write_text('printf "install %s\\n" "$*" >> "$BOOT_EVENTS"\nif [ -t 0 ]; then echo tty >> "$BOOT_EVENTS"; fi\n')
        (fixture/'tdev').write_text('printf "cli %s\\n" "$*" >> "$BOOT_EVENTS"\n')
        self.git('-C',str(fixture),'add','.'); self.git('-C',str(fixture),'commit','-qm','fixture')

    def git(self,*args):
        return subprocess.run([self.real_git,*args],env=self.env,check=True,capture_output=True,text=True)

    def script(self,name,content):
        path=self.bin/name; path.write_text('#!'+shutil.which('bash')+'\nset -e\n'+content);path.chmod(0o700)

    def run_bootstrap(self,*args):
        return subprocess.run(['bash',str(SOURCE/'bootstrap.sh'),'--source-dir',str(self.checkout),*args],
                              env=self.env,capture_output=True,text=True,timeout=20)

    def prepare_checkout(self):
        self.git('clone',str(self.root/'fixture'),str(self.checkout))
        self.git('-C',str(self.checkout),'remote','set-url','origin','https://github.com/humtr/tdev.git')

    def test_existing_clean_checkout_retries_without_fetch_and_preserves_installer_options(self):
        self.prepare_checkout()
        for _ in range(2):
            p=self.run_bootstrap('--','--controller-only','--root',str(self.root/'private root'))
            self.assertEqual(p.returncode,0,p.stderr)
        events=self.events.read_text()
        self.assertIn('python -m tdev.bootstrap dependencies',events)
        self.assertIn('python -m tdev.bootstrap services',events)
        self.assertIn('install --controller-only --root '+str(self.root/'private root'),events)
        self.assertEqual(events.count('cli link'),2)

    def test_fresh_clone_preserves_terminal_stdin_and_links_after_installer(self):
        master,slave=pty.openpty()
        try:
            p=subprocess.run(['bash',str(SOURCE/'bootstrap.sh'),'--source-dir',str(self.checkout)],
                             env=self.env,stdin=slave,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
        finally:
            os.close(master);os.close(slave)
        self.assertEqual(p.returncode,0,p.stderr)
        events=self.events.read_text().splitlines()
        self.assertIn('tty',events)
        self.assertLess(events.index('install '),events.index('cli link'))
        self.assertTrue((self.checkout/'.git').is_dir())
        self.assertEqual(list(self.root.glob('.tdev-clone.*')),[])

    def test_package_and_installer_failures_stop_following_steps(self):
        self.script('pkg','exit 23\n')
        self.assertEqual(self.run_bootstrap().returncode,23)
        self.assertFalse(self.checkout.exists())
        self.script('pkg','true\n')
        self.prepare_checkout()
        (self.checkout/'install.sh').write_text('exit 24\n')
        self.git('-C',str(self.checkout),'config','user.name','Fixture')
        self.git('-C',str(self.checkout),'config','user.email','fixture@example.invalid')
        self.git('-C',str(self.checkout),'add','install.sh');self.git('-C',str(self.checkout),'commit','-qm','failure')
        self.assertEqual(self.run_bootstrap().returncode,24)
        self.assertNotIn('cli link',self.events.read_text())

    def test_dirty_foreign_and_symlink_sources_are_preserved_without_installer(self):
        self.prepare_checkout(); original=(self.checkout/'install.sh').read_text()
        (self.checkout/'user-file').write_text('keep')
        p=self.run_bootstrap(); self.assertNotEqual(p.returncode,0)
        self.assertFalse(any(line.startswith('install ') for line in self.events.read_text().splitlines()))
        self.assertEqual((self.checkout/'user-file').read_text(),'keep')
        (self.checkout/'user-file').unlink()
        self.git('-C',str(self.checkout),'remote','set-url','origin','https://example.invalid/other.git')
        self.assertNotEqual(self.run_bootstrap().returncode,0)
        self.assertEqual((self.checkout/'install.sh').read_text(),original)
        moved=self.root/'moved'; self.checkout.rename(moved);self.checkout.symlink_to(moved)
        self.assertNotEqual(self.run_bootstrap().returncode,0)
        self.assertEqual((moved/'install.sh').read_text(),original)

    def test_bad_url_and_download_failure_stop_before_execution_and_preserve_target(self):
        self.assertNotEqual(self.run_bootstrap('--repo','https://token@example.invalid/repo').returncode,0)
        self.assertNotEqual(self.run_bootstrap('--','--uninstall').returncode,0)
        self.assertFalse(self.events.exists())
        with patch.dict(self.env,{'SVDIR':str(self.root/'foreign')}):
            self.assertNotEqual(self.run_bootstrap().returncode,0)
        self.assertFalse(self.events.exists())
        self.script('git','exit 42\n')
        p=self.run_bootstrap()
        self.assertEqual(p.returncode,42)
        self.assertFalse(self.checkout.exists())
        self.assertEqual(list(self.root.glob('.tdev-clone.*')),[])
        self.assertFalse(any(line.startswith('install ') for line in self.events.read_text().splitlines()))

    def test_existing_owned_service_never_updates_system_packages(self):
        self.prepare_checkout()
        service=self.root/'var/service/tdev';service.mkdir(parents=True)
        (service/'.tdev-owner.json').write_text('{}')
        self.script('pkg','exit 99\n')
        result=self.run_bootstrap()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('preserving system packages',result.stdout)


if __name__=='__main__': unittest.main()
