import contextlib
import io
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev import cli
from tdev.admin import init_config
from tdev.codex_bridge import Bridge
from tdev.common import Fault, atomic_write, canonical, digest
from tdev.core import Controller
from tdev.server import make_server


class CLITest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name); init_config(self.root)
        self.controller=Controller(self.root/'state',self.root/'config.json')
        self.server=make_server(self.controller)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.addCleanup(self.close)
        atomic_write(self.root/'resident.json',canonical({'installation':'cli-fixture','home':str(self.root),'port':self.server.server_port,'connections':{}}))
        env=patch.dict(os.environ,{'SVDIR':str(self.root/'services')}); env.start(); self.addCleanup(env.stop)

    def close(self):
        self.server.shutdown(); self.thread.join(); self.server.server_close(); self.controller.close()

    def run_cli(self,*args):
        output=io.StringIO()
        with contextlib.redirect_stdout(output):
            code=cli.main(['--root',str(self.root),*args])
        return code,output.getvalue()

    def test_help_schema_and_read_only_tools_use_real_authenticated_http(self):
        code,help=self.run_cli('help', 'all'); self.assertEqual(code,0); self.assertIn('connection mode',help)
        code,output=self.run_cli('tools'); self.assertEqual(code,0)
        self.assertEqual(len(json.loads(output)['result']['tools']),12)
        code,output=self.run_cli('workspace','list'); self.assertEqual(code,0)
        self.assertTrue(json.loads(output)['result']['structuredContent']['ok'])
        code,schema=self.run_cli('schema','workspace'); self.assertEqual(code,0); self.assertIn('oneOf',json.loads(schema)); self.assertNotIn('$ref',schema)
        self.assertNotIn((self.root/'connector.secret').read_text(),output)

    def test_status_does_not_claim_an_unowned_listener_as_healthy(self):
        code,output=self.run_cli('--json','status')
        self.assertEqual(code,0)
        self.assertEqual(json.loads(output)['controller']['status'],'unavailable')

    def test_generic_call_preserves_request_identity_no_automatic_retry(self):
        file=self.root/'arguments.json'; atomic_write(file,canonical({'action':'create','requestId':'cli-create','name':'from-cli'}))
        code,first=self.run_cli('call','workspace','--input',str(file)); self.assertEqual(code,0)
        code,second=self.run_cli('call','workspace','--input',str(file)); self.assertEqual(code,0)
        self.assertEqual(json.loads(first),json.loads(second))
        with patch.object(Bridge,'forward',side_effect=TimeoutError) as forward, self.assertRaises(TimeoutError):
            self.run_cli('call','workspace','--input',str(file))
        self.assertEqual(forward.call_count,1)

    def test_multiple_credentials_http_owner_and_revocation(self):
        cfg=json.loads((self.root/'config.json').read_bytes())
        cfg['credentials']={'cred_'+'a'*32:{'principal':'owner','tokenHash':digest(b'fixture-a'),'state':'active'},
                            'cred_'+'b'*32:{'principal':'owner','tokenHash':digest(b'fixture-b'),'state':'active'}}
        atomic_write(self.root/'config.json',canonical(cfg))
        url=f'http://127.0.0.1:{self.server.server_port}/mcp'
        a,b=Bridge(url,'fixture-a'),Bridge(url,'fixture-b')
        args={'name':'tdev_workspace','arguments':{'action':'create','requestId':'same-owner','name':'shared'}}
        self.assertEqual(a.forward(1,'tools/call',args),b.forward(1,'tools/call',args))
        cfg['credentials']['cred_'+'a'*32]['state']='revoked'; atomic_write(self.root/'config.json',canonical(cfg))
        with self.assertRaises(Fault): a.forward(1,'tools/list',{})
        self.assertIn('result',b.forward(1,'tools/list',{}))
        self.assertEqual(self.run_cli('tools')[0],0)

    def test_cli_errors_nonzero_and_invalid_input_never_dispatches(self):
        code,value=self.run_cli('operation','status','missing'); self.assertEqual(code,1)
        with patch.object(Bridge,'forward') as forward, self.assertRaises(Fault): self.run_cli('nonexistent','list')
        forward.assert_not_called()
        with patch('tdev.cli.interactive',return_value=False):
            code,output=self.run_cli(); self.assertIn('interactive menu',output)

    def test_token_clipboard_failure_discloses_only_on_terminal(self):
        from tdev.installer_setup import deliver_token
        with patch('tdev.installer_setup.copy_token',return_value=False), patch('tdev.installer_setup.interactive',return_value=False), contextlib.redirect_stderr(io.StringIO()) as stderr:
            value=deliver_token(b'fixture-secret',self.root/'secret')
        self.assertNotIn('fixture-secret',stderr.getvalue()+json.dumps(value))
        with patch('tdev.installer_setup.copy_token',return_value=False), patch('tdev.installer_setup.interactive',return_value=True), contextlib.redirect_stderr(io.StringIO()) as stderr:
            deliver_token(b'fixture-secret',self.root/'secret')
        self.assertIn('fixture-secret',stderr.getvalue())

    def test_friendly_no_auth_mode_is_normalized_without_rotating(self):
        with patch('tdev.connections.Connections') as factory:
            factory.return_value.change.return_value = {'connections':[]}
            code,_ = self.run_cli('connection','mode','personal','no-auth')
        self.assertEqual(code,0)
        factory.return_value.change.assert_called_once_with('mode','personal',mode='tunnel')

    def test_link_is_explicit_and_preserves_unrelated_command(self):
        with patch('tdev.cli.Path.home',return_value=self.root), patch.dict(os.environ,{'PREFIX':str(self.root/'prefix')}):
            self.run_cli('link')
            file=self.root/'.local/bin/tdev'; self.assertEqual(file.stat().st_mode&0o777,0o700)
            self.assertIn(' -m tdev.cli ',file.read_text())
            self.run_cli('link')
            file.write_text('unrelated user command')
            with self.assertRaises(Fault): self.run_cli('link')
            self.assertEqual(file.read_text(),'unrelated user command')

    def test_install_guides_controller_only_without_tunnel_and_preserves_update_root(self):
        other=self.root/'fresh'
        with patch('tdev.cli.installer') as install, patch('tdev.cli.interactive',return_value=True), patch('tdev.cli.answer',return_value='n'):
            cli.main(['--root',str(other),'install'])
        install.assert_called_once_with(other,'install',None,controller_only=True)
        with patch('tdev.cli.installer') as install:
            cli.main(['--root',str(self.root),'update'])
        install.assert_called_once_with(self.root,'update',None,controller_only=False)

    def dedicated_connection(self):
        ident='conn_'+'a'*32; cred='cred_'+'b'*32; token=b'fixture-dedicated-secret'
        settings=json.loads((self.root/'resident.json').read_bytes())
        settings['connections'][ident]={'id':ident,'name':'personal','tunnelId':'tunnel_'+'a'*32,
            'authMode':'tunnel','enabled':True,'credentialId':cred,'profileDigest':'c'*64}
        atomic_write(self.root/'resident.json',canonical(settings))
        config=json.loads((self.root/'config.json').read_bytes())
        config['credentials']={cred:{'principal':'owner','tokenHash':digest(token),'state':'active'}}
        atomic_write(self.root/'config.json',canonical(config))
        file=self.root/'connections'/ident/(cred+'.secret'); atomic_write(file,token)
        return ident,cred,file

    def test_explicit_connection_without_legacy_secret_uses_same_principal_and_no_writes(self):
        ident,cred,file=self.dedicated_connection()
        args=self.root/'create.json'; atomic_write(args,canonical({'action':'create','requestId':'owner-replay','name':'shared'}))
        code,legacy=self.run_cli('call','workspace','--input',str(args)); self.assertEqual(code,0)
        (self.root/'connector.secret').unlink()
        originals={p:p.read_bytes() for p in (self.root/'config.json',self.root/'resident.json',file)}
        for name in ('personal',ident):
            code,output=self.run_cli('--connection',name,'call','workspace','--input',str(args))
            self.assertEqual(code,0); self.assertEqual(json.loads(output),json.loads(legacy))
            self.assertNotIn(file.read_text(),output)
        for p,b in originals.items(): self.assertEqual(p.read_bytes(),b)
        self.assertFalse((self.root/'connector.secret').exists())

    def test_missing_default_nonterminal_fails_with_actionable_message_without_dispatch(self):
        self.dedicated_connection(); (self.root/'connector.secret').unlink()
        with patch.object(cli,'interactive',return_value=False), patch.object(Bridge,'forward') as forward:
            with self.assertRaises(Fault) as caught: self.run_cli('workspace','list')
        self.assertEqual(caught.exception.value['code'],'CLI_CREDENTIAL_REQUIRED')
        self.assertIn('--connection',str(caught.exception.value)); forward.assert_not_called()

    def test_terminal_missing_default_prompts_and_cancel_never_dispatches(self):
        self.dedicated_connection(); (self.root/'connector.secret').unlink()
        with patch.object(cli,'interactive',return_value=True), patch.object(cli,'answer',return_value='1'), contextlib.redirect_stderr(io.StringIO()) as err:
            code,value=self.run_cli('tools')
        self.assertEqual(code,0); self.assertEqual(len(json.loads(value)['result']['tools']),12)
        self.assertNotIn('fixture-dedicated-secret',err.getvalue())
        for choice in ('0','q'):
            with patch.object(cli,'interactive',return_value=True), patch.object(cli,'answer',return_value=choice), patch.object(Bridge,'forward') as forward, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(self.run_cli('tools'),(0,''))
            forward.assert_not_called()

    def test_selected_missing_disabled_revoked_mismatch_and_insecure_credentials_do_not_fallback(self):
        ident,cred,file=self.dedicated_connection()
        settings=json.loads((self.root/'resident.json').read_bytes());config=json.loads((self.root/'config.json').read_bytes())
        cases=['unknown','disabled','revoked','mismatch','missing','symlink','public']
        for case in cases:
            atomic_write(self.root/'resident.json',canonical(settings));atomic_write(self.root/'config.json',canonical(config))
            if file.is_symlink(): file.unlink()
            atomic_write(file,b'fixture-dedicated-secret')
            name='personal'
            if case=='unknown': name='absent'
            elif case=='disabled':
                value=json.loads(canonical(settings));value['connections'][ident]['enabled']=False
                atomic_write(self.root/'resident.json',canonical(value))
            elif case=='revoked':
                value=json.loads(canonical(config));value['credentials'][cred]['state']='revoked'
                atomic_write(self.root/'config.json',canonical(value))
            elif case=='mismatch': atomic_write(file,b'wrong-secret')
            elif case=='missing': file.unlink()
            elif case=='symlink': file.unlink();file.symlink_to(self.root/'connector.secret')
            elif case=='public': file.chmod(0o644)
            with patch.object(Bridge,'forward') as forward, patch.object(cli,'answer') as answer:
                with self.assertRaises(Fault,msg=case): self.run_cli('--connection',name,'tools')
            forward.assert_not_called();answer.assert_not_called()

    def test_selected_credential_server_revocation_and_transport_error_never_switch_credentials(self):
        ident,cred,file=self.dedicated_connection()
        client=cli.bridge(self.root,'personal')
        cfg=json.loads((self.root/'config.json').read_bytes());cfg['credentials'][cred]['state']='revoked'
        atomic_write(self.root/'config.json',canonical(cfg))
        with patch.object(cli,'bridge',return_value=client) as selected, self.assertRaises(Fault):
            self.run_cli('--connection','personal','tools')
        selected.assert_called_once_with(self.root,'personal')
        cfg['credentials'][cred]['state']='active';atomic_write(self.root/'config.json',canonical(cfg))
        with patch.object(Bridge,'forward',side_effect=TimeoutError) as forward, self.assertRaises(TimeoutError):
            self.run_cli('--connection','personal','workspace','list')
        self.assertEqual(forward.call_count,1)

    def test_legacy_bad_auth_or_permissions_do_not_offer_another_connection(self):
        self.dedicated_connection()
        for mode in ('wrong','public','symlink'):
            file=self.root/'connector.secret'
            if file.is_symlink():file.unlink()
            atomic_write(file,b'wrong-legacy-secret')
            if mode=='public':file.chmod(0o644)
            if mode=='symlink':file.unlink();file.symlink_to(self.root/'config.json')
            with patch.object(cli,'interactive',return_value=True), patch.object(cli,'answer') as answer, self.assertRaises(Fault):
                self.run_cli('tools')
            answer.assert_not_called()

    def test_connection_option_rejects_local_mutations_and_help_is_read_only(self):
        with patch.object(cli,'installer') as installer, patch.object(cli,'bridge') as bridge:
            with self.assertRaises(Fault):self.run_cli('--connection','personal','update')
            self.assertEqual(self.run_cli('--connection','personal','help')[0],0)
        installer.assert_not_called();bridge.assert_not_called()


class MenuTest(unittest.TestCase):
    def main(self, args, answers=()):
        with patch.object(cli, 'interactive', return_value=True), patch.object(cli, 'answer', side_effect=answers), contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
            return cli.main(['--root', '/unused-menu-fixture', *args])

    def test_back_invalid_choice_and_quit_never_execute(self):
        with patch.object(cli, 'bridge') as bridge, patch.object(cli, 'installer') as install, patch('tdev.connections.Connections') as connections:
            self.assertEqual(self.main([], ['invalid', '2', '0', '3', '2', '0', '0', 'q']), 0)
        bridge.assert_not_called(); install.assert_not_called(); connections.assert_not_called()

    def test_eof_and_interrupt_have_no_effect(self):
        for error in (Fault('SETUP_CANCELLED'), KeyboardInterrupt()):
            with patch.object(cli, 'interactive', return_value=True), patch.object(cli, 'answer', side_effect=error), patch.object(cli, 'installer') as install, patch.object(cli, 'bridge') as bridge, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(type(error)): cli.main(['maintenance'])
            install.assert_not_called(); bridge.assert_not_called()

    def test_all_bare_groups_nonterminal_are_help_only(self):
        from tdev.cli_menu import MENUS
        for group in MENUS:
            with patch.object(cli, 'interactive', return_value=False), patch.object(cli, 'answer') as answer, patch.object(cli, 'bridge') as bridge, patch('tdev.connections.Connections') as connections, patch.object(cli, 'installer') as install, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(cli.main([] if group=='main' else [group]), 0)
            self.assertTrue(out.getvalue()); answer.assert_not_called(); bridge.assert_not_called()
            connections.assert_not_called(); install.assert_not_called()

    def test_selected_connection_id_mode_and_explicit_root_are_preserved(self):
        settings={'tunnelId':'tunnel_fixture', 'profileDigest':'fixture'}
        with patch('tdev.connections.Connections') as connections:
            connections.return_value.settings.return_value=settings
            connections.return_value.change.return_value={'connections':[]}
            self.assertEqual(self.main(['connection'], ['3', '1', '2']), 0)
        connections.return_value.change.assert_called_once_with('mode','legacy',mode='tunnel')
        for call in connections.call_args_list:
            self.assertEqual(call.args, (Path('/unused-menu-fixture'),))

    def test_omitted_connection_name_opens_picker_and_cancel_does_nothing(self):
        with patch('tdev.connections.Connections') as connections:
            connections.return_value.settings.return_value={'tunnelId':'tunnel_fixture','profileDigest':'fixture'}
            connections.return_value.token.return_value={}
            self.assertEqual(self.main(['connection','token'], ['1']), 0)
            connections.return_value.token.assert_called_once_with('legacy')
            connections.return_value.token.reset_mock()
            self.assertEqual(self.main(['connection','token'], ['0']), 0)
            connections.return_value.token.assert_not_called()

    def test_empty_connections_return_to_menu(self):
        with patch('tdev.connections.Connections') as connections:
            connections.return_value.settings.return_value={'connections':{}}
            self.assertEqual(self.main(['connection'], ['3', '0']), 0)
        connections.return_value.change.assert_not_called()

    def test_destructive_menu_choice_requires_explicit_confirmation(self):
        with patch.object(cli, 'installer') as install:
            self.assertEqual(self.main(['maintenance'], ['6', '', '0']), 0)
            install.assert_not_called()
            self.assertEqual(self.main(['maintenance'], ['6', 'y']), 0)
            install.assert_called_once_with(Path('/unused-menu-fixture'),'uninstall',None,controller_only=False)

    def test_diagnostics_and_observer_dispatch_once(self):
        with patch.object(cli, 'bridge') as bridge:
            bridge.return_value.forward.return_value={'result':{}}
            self.assertEqual(self.main(['diagnostics'], ['1']), 0)
        bridge.return_value.forward.assert_called_once_with(1,'tools/call',{'name':'tdev_diagnostics','arguments':{'action':'inspect'}})
        with patch.object(cli.subprocess, 'call', return_value=0) as process:
            self.assertEqual(self.main(['observer'], ['1']), 0)
        self.assertEqual(process.call_count,1)
        self.assertEqual(process.call_args.args[0][-1],'status')
        self.assertEqual(process.call_args.kwargs['env']['TDEV_OBSERVE_ROOT'],'/unused-menu-fixture')

    def test_observation_menu_arguments_follow_wire_contract(self):
        from jsonschema import Draft202012Validator
        from tdev.cli_menu import navigate
        for group, identity, field in [('task','a'*32,'taskId'),('workspace','b'*32,'workspaceId'),('project','example-project','repo'),('operation','c'*32,'operationId')]:
            responses=iter(['1' if group=='operation' else '2',identity])
            with contextlib.redirect_stderr(io.StringIO()):
                command=navigate(group,lambda _: next(responses),lambda: None)
            arguments={'action':command[1],field:command[2]}
            self.assertTrue(Draft202012Validator(cli.tool_schema('tdev_'+group)).is_valid(arguments),arguments)
