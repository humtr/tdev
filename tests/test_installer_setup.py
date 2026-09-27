import contextlib
import io
import json
import os
import pty
import select
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev import admin, installer, installer_setup as setup
from tdev.common import Fault, atomic_write, canonical, digest
from tdev.core import Controller


class SetupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)/'installation'; self.root.mkdir(mode=0o700)
        (self.root/'bin').mkdir()
        binary = self.root/'bin/tunnel-client'
        binary.write_text('#!/bin/sh\nprintf "0.0.14\\n"\n'); binary.chmod(0o700)
        self.key = Path(self.tmp.name)/'runtime.key'; atomic_write(self.key,b'fixture-runtime-key')
        p = patch('tdev.installer.discover_profile',return_value=None); p.start(); self.addCleanup(p.stop)

    def configure(self, **kw):
        return installer.configure(self.root,tunnel_id='tunnel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',key_file=self.key,**kw)

    def profile(self):
        return json.loads((self.root/'tunnel-profiles/tdev.yaml').read_bytes())

    def test_fresh_complete_cli_internal_auth_private_and_scoped(self):
        with patch.object(setup,'answer',side_effect=AssertionError('unexpected prompt')):
            settings = self.configure()
        self.assertEqual(settings['connectorAuth'],'tunnel')
        profile = self.profile()
        ref = profile['mcp']['extra_headers']['Authorization']
        secret = (self.root/'connector.secret').read_bytes()
        self.assertEqual(Path(ref[5:]).read_bytes(), b'Bearer '+secret)
        for p in ('connector.secret','config.json','resident.json','tunnel-profiles/tdev.yaml',
                  'tunnel-env/MCP_AUTHORIZATION','tunnel-env/CONTROL_PLANE_API_KEY'):
            self.assertEqual((self.root/p).stat().st_mode & 0o777,0o600)
        for p in ('config.json','resident.json','tunnel-profiles/tdev.yaml'):
            self.assertNotIn(secret,(self.root/p).read_bytes())
            self.assertNotIn(self.key.read_bytes(),(self.root/p).read_bytes())
        self.assertNotIn('extra_headers',profile['control_plane'])
        c = Controller(self.root/'state',json.loads((self.root/'config.json').read_bytes()))
        try:
            self.assertEqual(c.authenticate(secret.decode()),'owner')
            with self.assertRaises(Fault): c.authenticate('wrong')
        finally: c.close()
        output=io.StringIO()
        with contextlib.redirect_stderr(output): setup.show_connection(self.root,settings,True)
        self.assertNotIn(secret.decode(),output.getvalue())
        self.assertIn('authentication None',output.getvalue())

    def test_bearer_discovery_only_and_existing_settings_never_change(self):
        settings=self.configure(auth_mode='bearer')
        self.assertNotIn('extra_headers',self.profile()['mcp'])
        self.assertIn('Authorization',self.profile()['mcp']['discovery_extra_headers'])
        files={p:(self.root/p).read_bytes() for p in ('resident.json','config.json','connector.secret','tunnel-profiles/tdev.yaml')}
        with patch.object(setup,'answer',side_effect=AssertionError('unexpected prompt')):
            self.assertEqual(installer.configure(self.root),settings)
        for p,data in files.items(): self.assertEqual((self.root/p).read_bytes(),data)
        with self.assertRaises(Fault): installer.configure(self.root,auth_mode='tunnel')
        settings.pop('connectorAuth'); atomic_write(self.root/'resident.json',canonical(settings))
        self.assertEqual(installer.configure(self.root),settings)

    def test_legacy_config_adoption_preserves_bearer_and_grants(self):
        admin.init_config(self.root)
        old=(self.root/'config.json').read_bytes()
        self.assertEqual(self.configure()['connectorAuth'],'bearer')
        self.assertEqual(old,(self.root/'config.json').read_bytes())

    def test_profile_inputs_reused_without_prompt_and_custom_headers_not_discarded(self):
        profile=Path(self.tmp.name)/'profile.yaml'
        atomic_write(profile,canonical({'control_plane':{'tunnel_id':'tunnel_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','api_key':'file:'+str(self.key)}}))
        with patch.object(setup,'answer',side_effect=AssertionError('unexpected prompt')):
            selected=setup.select(self.root,8765,None,None,profile,None,lambda _:None)
        self.assertEqual(selected['tunnelId'],'tunnel_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
        self.assertEqual(selected['connectorAuth'],'bearer')
        atomic_write(profile,canonical({'mcp':{'extra_headers':{'Authorization':'file:/private/other'}}}))
        with self.assertRaises(Fault) as error:
            setup.select(self.root,8765,None,None,profile,None,lambda _:None)
        self.assertEqual(error.exception.value['code'],'TUNNEL_PROFILE_AUTH')

    def test_missing_non_tty_and_invalid_explicit_input_have_no_credential_writes(self):
        with patch.object(sys,'stdin',io.StringIO('')), patch.object(setup,'answer',side_effect=AssertionError('prompt')):
            with self.assertRaises(Fault) as error: installer.configure(self.root)
        self.assertEqual(error.exception.value['code'],'SETUP_INPUT_REQUIRED')
        self.assertFalse((self.root/'connector.secret').exists())
        with self.assertRaises(Fault): installer.configure(self.root,tunnel_id='invalid',key_file=self.key)
        self.assertFalse((self.root/'resident.json').exists())

    def test_config_pair_interruption_reuses_orphan_secret_without_rotation(self):
        real=admin.atomic_write
        def fail(path,*args,**kwargs):
            if Path(path).name=='config.json': raise OSError('fixture interruption')
            return real(path,*args,**kwargs)
        with patch.object(admin,'atomic_write',side_effect=fail), self.assertRaises(OSError): admin.init_config(self.root)
        secret=(self.root/'connector.secret').read_bytes()
        admin.init_config(self.root)
        self.assertEqual(secret,(self.root/'connector.secret').read_bytes())
        config=json.loads((self.root/'config.json').read_bytes())
        self.assertEqual(config['principals']['owner']['tokenHash'],digest(secret))
        with self.assertRaises(Fault): admin.init_config(self.root)

    def test_setup_interruption_retries_original_mode_key_and_secret(self):
        real=installer.atomic_write
        def fail(path,*args,**kwargs):
            if Path(path).name=='resident.json': raise KeyboardInterrupt()
            return real(path,*args,**kwargs)
        with patch.object(installer,'atomic_write',side_effect=fail), self.assertRaises(KeyboardInterrupt): self.configure()
        secret=(self.root/'connector.secret').read_bytes()
        self.assertTrue((self.root/'setup-pending.json').exists())
        with patch.object(setup,'answer',side_effect=AssertionError('prompt')):
            settings=installer.configure(self.root)
        self.assertEqual(settings['connectorAuth'],'tunnel')
        self.assertEqual(secret,(self.root/'connector.secret').read_bytes())
        self.assertFalse((self.root/'setup-pending.json').exists())

    def test_mismatch_symlink_permissions_and_missing_state_config_rejected(self):
        admin.init_config(self.root)
        secret=self.root/'connector.secret'; before=secret.read_bytes()
        atomic_write(secret,b'Z'*64)
        with self.assertRaises(Fault): setup.local_header(self.root,True)
        atomic_write(secret,before); secret.chmod(0o644)
        with self.assertRaises(Fault): setup.local_header(self.root,True)
        secret.unlink(); secret.symlink_to(self.key)
        with self.assertRaises(Fault): setup.local_header(self.root,True)
        (self.root/'config.json').unlink(); (self.root/'state').mkdir(); (self.root/'state/state.sqlite').touch()
        with self.assertRaises(Fault) as error: admin.init_config(self.root)
        self.assertEqual(error.exception.value['code'],'CONFIG_MISSING')

    def test_clipboard_stdin_only_success_failure_missing_and_noninteractive_suppression(self):
        settings=self.configure(auth_mode='bearer')
        secret=(self.root/'connector.secret').read_bytes()
        for available,result in ((True,0),(True,1),(False,None),(True,subprocess.TimeoutExpired('fixture',3))):
            with self.subTest(available=available,result=result):
                output=io.StringIO()
                with patch.object(setup,'interactive',return_value=True), contextlib.redirect_stderr(output), \
                     patch.object(setup.shutil,'which',return_value='/fixture/clipboard' if available else None), \
                     patch.object(setup.subprocess,'Popen') as run, patch.object(setup.os,'killpg') as kill:
                    proc=run.return_value.__enter__.return_value
                    if isinstance(result,Exception): proc.communicate.side_effect=[result,None]
                    else: proc.returncode=result
                    setup.show_connection(self.root,settings,True)
                    if available:
                        self.assertEqual(run.call_args.args[0],['/fixture/clipboard'])
                        self.assertTrue(run.call_args.kwargs['start_new_session'])
                        self.assertEqual(proc.communicate.call_args_list[0].kwargs['input'],secret)
                        if isinstance(result,Exception): kill.assert_called_once()
                    else: run.assert_not_called()
                self.assertIn(secret.decode(),output.getvalue())
                self.assertIn('Copied to Android' if result==0 else 'Clipboard unavailable',output.getvalue())
        with patch.object(setup,'interactive',return_value=False), contextlib.redirect_stderr(io.StringIO()) as output:
            setup.show_connection(self.root,settings,True)
        self.assertNotIn(secret.decode(),output.getvalue())

    def tty_setup(self, answers):
        script="""import sys
from pathlib import Path
from unittest.mock import patch
from tdev.installer import configure
from tdev.common import Fault
try:
    with patch('tdev.installer.discover_profile',return_value=None):
        result=configure(Path(sys.argv[1]))
    print('MODE='+result['connectorAuth'],flush=True)
except Fault as e:
    print('FAULT='+e.value['code'],flush=True)
    raise SystemExit(1)
"""
        master,slave=pty.openpty()
        proc=subprocess.Popen([sys.executable,'-c',script,str(self.root)],stdin=slave,stdout=slave,stderr=slave)
        os.close(slave)
        transcript=b''; cursor=0
        try:
            for prompt,value in answers:
                until=time.monotonic()+10
                while prompt not in transcript[cursor:]:
                    self.assertLess(time.monotonic(),until,'TTY prompt timed out')
                    if select.select([master],[],[],.1)[0]: transcript+=os.read(master,65536)
                cursor=len(transcript)
                os.write(master,value)
            until=time.monotonic()+10
            while time.monotonic()<until:
                if select.select([master],[],[],.1)[0]:
                    try: data=os.read(master,65536)
                    except OSError: break
                    if not data: break
                    transcript+=data
                if proc.poll() is not None: break
            proc.wait(timeout=5)
            return proc.returncode,transcript
        finally:
            if proc.poll() is None: proc.kill(); proc.wait()
            os.close(master)

    def test_real_tty_default_invalid_id_reentry_and_hidden_key(self):
        code,out=self.tty_setup([(b'OpenAI Tunnel ID:',b'bad\n'),(b'OpenAI Tunnel ID:',b'tunnel_cccccccccccccccccccccccccccccccc\n'),
                                (b'API key (hidden):',b'fixture-tty-private-key\n'),(b'Select [1]:',b'\n')])
        self.assertEqual(code,0)
        self.assertIn(b'MODE=tunnel',out)
        self.assertNotIn(b'fixture-tty-private-key',out)

    def test_real_tty_bearer_selection(self):
        code,out=self.tty_setup([(b'OpenAI Tunnel ID:',b'tunnel_cccccccccccccccccccccccccccccccc\n'),
                                (b'API key (hidden):',b'fixture-tty-private-key\n'),(b'Select [1]:',b'2\n')])
        self.assertEqual(code,0); self.assertIn(b'MODE=bearer',out)

    def test_real_tty_eof_cancel_creates_no_credentials(self):
        code,out=self.tty_setup([(b'OpenAI Tunnel ID:',b'\x04')])
        self.assertEqual(code,1); self.assertIn(b'FAULT=SETUP_CANCELLED',out)
        self.assertFalse((self.root/'connector.secret').exists())

    def test_secret_prompt_keyboard_interrupt_restores_echo(self):
        stream=io.StringIO()
        with patch.object(setup,'interactive',return_value=True), \
             patch.object(setup.termios,'tcgetattr',return_value=[0,0,0,setup.termios.ECHO,0,0,[]]), \
             patch.object(setup.termios,'tcsetattr') as restore, patch.object(sys,'stdin') as stdin, \
             contextlib.redirect_stderr(stream):
            stdin.readline.side_effect=KeyboardInterrupt()
            with self.assertRaises(Fault) as error: setup.answer('Secret: ',secret=True)
        self.assertEqual(error.exception.value['code'],'SETUP_CANCELLED')
        self.assertTrue(restore.call_args.args[2][3] & setup.termios.ECHO)

    def test_main_complete_noninteractive_install_update_and_failed_first_retry(self):
        from test_resident import FakeRunit
        backend=FakeRunit(Path(self.tmp.name)/'svdir')
        initial=['install','--root',str(self.root),'--tunnel-id','tunnel_'+'a'*32,
                 '--runtime-key-file',str(self.key)]
        output,error=io.StringIO(),io.StringIO()
        with patch.object(installer,'Runit',return_value=backend), \
             patch.object(setup,'interactive',return_value=False), \
             patch.object(setup,'answer',side_effect=AssertionError('unexpected prompt')), \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            # Fail after configuring credentials but before registering the first service.
            with patch.object(sys,'argv',initial), \
                 patch.object(installer.Installation,'install',side_effect=Fault('FIXTURE_INSTALL_FAILURE')), \
                 self.assertRaises(Fault): installer.main()
            before={p:(self.root/p).read_bytes() for p in ('connector.secret','resident.json','config.json','tunnel-profiles/tdev.yaml')}
            with patch.object(sys,'argv',['install','--root',str(self.root)]):
                installer.main()
                installer.main()
            for p,data in before.items(): self.assertEqual(data,(self.root/p).read_bytes())
        self.assertNotIn(before['connector.secret'].decode(),output.getvalue()+error.getvalue())
        self.assertNotIn(self.key.read_text(),output.getvalue()+error.getvalue())
        self.assertEqual(json.loads(before['resident.json'])['connectorAuth'],'tunnel')
