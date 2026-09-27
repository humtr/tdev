import contextlib
import copy
import io
import json
import os
import shutil
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev import connection_model as cm
from tdev.admin import stage, point
from tdev.common import Fault, atomic_write, canonical, digest
from tdev.connections import Connections
from tdev.core import Controller
from tdev.installer import configure_controller
from tdev.resident import Installation, run_service
import test_resident as fixture
from test_resident import FakeRunit


class MultiRunit(FakeRunit):
    def tunnel_ready(self, root, settings, ident='legacy'):
        name = cm.service(ident)
        if not self.running.get(name): raise Fault('SERVICE_DOWN')
        return {'pid':101,'controlPlanePoll':True}


class ConnectionsTest(unittest.TestCase):
    def setUp(self):
        fixture.ResidentTest.setUp(self)
        self.backend = MultiRunit(self.parent/'multi-svdir')
        self.i = Installation(self.root,self.backend)
        (self.source/'src/tdev/connections.py').write_text('# connection-capable fixture\n')
        shutil.copyfile(Path(__file__).parents[1]/'contracts/config.schema.json',self.source/'contracts/config.schema.json')
        self.bundle = stage(self.root,self.source)['bundle']
        self.i.install(self.bundle)
        self.m = Connections(self.root,self.backend)
        self.controller = Controller(self.root/'state',self.root/'config.json')
        self.addCleanup(self.controller.close)

    def add(self,name='personal',letter='b',mode='bearer'):
        self.m.change('add',name,tunnel_id='tunnel_'+letter*32,key_file=self.parent/'runtime.secret',mode=mode)
        return cm.select(self.m.settings(),name)

    def secret(self,c): return self.m.credential_file(c).read_text().strip()

    def test_credentials_share_owner_workspace_replay_and_preserve_legacy(self):
        legacy=(self.root/'connector.secret').read_bytes()
        a=self.add(); b=self.add('business','c','tunnel')
        self.assertNotEqual(a['credentialId'],b['credentialId'])
        self.assertEqual(self.controller.authenticate(self.secret(a)),'owner')
        self.assertEqual(self.controller.authenticate(self.secret(b)),'owner')
        args={'action':'create','requestId':'shared-request','name':'shared'}
        first=self.controller.call(self.controller.authenticate(self.secret(a)),'tdev_workspace',args)
        replay=self.controller.call(self.controller.authenticate(self.secret(b)),'tdev_workspace',args)
        self.assertTrue(first['ok'],first); self.assertEqual(first,replay)
        self.assertEqual(self.controller.authenticate(legacy.decode()),'owner')
        self.assertEqual(legacy,(self.root/'connector.secret').read_bytes())
        self.assertEqual(len(json.loads((self.root/'config.json').read_bytes())['principals']),1)

    def test_modes_preserve_secret_header_scopes_and_only_restart_selected(self):
        a=self.add(); self.add('business','c')
        before=self.secret(a); self.backend.events.clear()
        self.m.change('mode','personal',mode='tunnel')
        directory,profile,_=cm.paths(self.root,a['id'])
        p=json.loads((directory/(profile+'.yaml')).read_bytes())
        self.assertIn('Authorization',p['mcp']['extra_headers'])
        self.assertNotIn('discovery_extra_headers',p['mcp'])
        self.assertEqual(before,self.secret(a))
        self.assertTrue(all(name==cm.service(a['id']) for action,name in self.backend.events))
        self.m.change('mode','personal',mode='bearer')
        p=json.loads((directory/(profile+'.yaml')).read_bytes())
        self.assertNotIn('extra_headers',p['mcp']); self.assertIn('Authorization',p['mcp']['discovery_extra_headers'])
        self.assertNotIn(before,json.dumps(self.m.observe()))

    def test_disable_revoke_rotate_remove_and_shared_key_source_preserved(self):
        a=self.add(); b=self.add('business','c'); old=self.secret(a)
        self.m.change('disable','personal')
        with self.assertRaises(Fault): self.controller.authenticate(old)
        self.assertEqual(self.controller.authenticate(self.secret(b)),'owner')
        self.m.change('enable','personal'); self.assertEqual(self.controller.authenticate(old),'owner')
        self.m.change('revoke','personal')
        with self.assertRaises(Fault): self.m.change('enable','personal')
        self.m.change('rotate','personal'); new=cm.select(self.m.settings(),'personal')
        self.assertNotEqual(new['credentialId'],a['credentialId'])
        with self.assertRaises(Fault): self.controller.authenticate(old)
        with self.assertRaises(Fault): self.controller.authenticate(self.secret(new))
        self.m.change('enable','personal'); self.assertEqual(self.controller.authenticate(self.secret(new)),'owner')
        self.m.change('remove','personal')
        self.assertFalse((self.root/'connections'/a['id']).exists())
        self.assertTrue((self.parent/'runtime.secret').exists())
        self.assertEqual(self.controller.authenticate(self.secret(b)),'owner')

    def test_legacy_migration_preserves_profile_and_shared_credential(self):
        paths=['connector.secret','tunnel-profiles/tdev.yaml','tunnel-env/CONTROL_PLANE_API_KEY']
        before={p:(self.root/p).read_bytes() for p in paths}
        self.m.change('migrate')
        self.assertEqual(before,{p:(self.root/p).read_bytes() for p in paths})
        self.m.change('disable','default')
        self.assertEqual(self.controller.authenticate(before['connector.secret'].decode()),'owner')
        with self.assertRaises(Fault): self.m.change('revoke','default')
        self.m.change('mode','default',mode='tunnel')
        self.assertEqual(before['connector.secret'],(self.root/'connector.secret').read_bytes())
        self.m.change('enable','default')

    def test_crash_after_revocation_rolls_forward_without_reactivating_token(self):
        a=self.add(); token=self.secret(a)
        with patch.object(self.backend,'down',side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            self.m.change('revoke','personal')
        self.assertTrue(self.m.journal.exists())
        with self.assertRaises(Fault): self.controller.authenticate(token)
        with self.i.lock(): self.i.recover()
        self.assertFalse(self.m.journal.exists())
        with self.assertRaises(Fault): self.controller.authenticate(token)
        self.assertFalse(cm.select(self.m.settings(),'personal')['enabled'])

    def test_rotation_crash_recovery_does_not_generate_another_token(self):
        a=self.add(); old=self.secret(a)
        original=self.i.write_service
        with patch('tdev.resident.Installation.write_service',side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            self.m.change('rotate','personal')
        planned=cm.select(self.m.settings(),'personal'); new=self.secret(planned)
        with self.i.lock(): self.i.recover()
        self.assertEqual(new,self.secret(cm.select(self.m.settings(),'personal')))
        with self.assertRaises(Fault): self.controller.authenticate(old)
        self.assertEqual(self.controller.authenticate(new),'owner')

    def test_failed_stop_remains_revoked_and_other_connection_usable(self):
        a=self.add(); b=self.add('business','c')
        with patch.object(self.backend,'down',side_effect=Fault('STOP_FAILED')), self.assertRaises(Fault):
            self.m.change('disable','personal')
        with self.assertRaises(Fault): self.controller.authenticate(self.secret(a))
        self.assertEqual(self.controller.authenticate(self.secret(b)),'owner')
        self.assertTrue(self.m.observe()['recoveryPending'])
        with self.i.lock(): self.i.recover()

    def test_remote_failure_is_not_install_corruption_or_controller_restart(self):
        a=self.add(); self.add('business','c'); original=self.backend.tunnel_ready
        def health(root,settings,ident='legacy'):
            if ident==a['id']: raise Fault('TUNNEL_HEALTH')
            return original(root,settings,ident)
        with patch.object(self.backend,'tunnel_ready',health):
            report=self.i.check()
            self.assertFalse(report['services'][cm.service(a['id'])]['healthy'])
            self.assertIn('bundle',report['services']['tdev'])
            self.controller.close()
            self.i.install(self.bundle)
        self.controller=Controller(self.root/'state',self.root/'config.json')
        self.addCleanup(self.controller.close)

    def test_old_bundle_and_old_security_snapshot_rejected_before_service_changes(self):
        (self.source/'src/tdev/connections.py').unlink()
        old=stage(self.root,self.source)['bundle']
        a=self.add(); snapshot=json.loads((self.root/'config.json').read_bytes())
        self.m.change('revoke','personal'); events=list(self.backend.events)
        with self.assertRaises(Fault) as e: self.i.install(old)
        self.assertEqual(e.exception.value['code'],'CONNECTION_VERSION'); self.assertEqual(events,self.backend.events)
        with self.assertRaises(Fault): self.i.install(self.bundle,snapshot,digest((self.root/'config.json').read_bytes()))
        self.assertEqual(events,self.backend.events)

    def test_rename_keeps_id_paths_and_process_and_rejects_duplicate(self):
        a=self.add(); self.add('business','c'); self.backend.events.clear()
        self.m.change('rename','personal',new_name='private')
        self.assertEqual(a['id'],cm.select(self.m.settings(),'private')['id'])
        self.assertEqual(self.backend.events,[])
        with self.assertRaises(Fault): self.m.change('rename','private',new_name='business')
        with self.assertRaises(Fault): self.add('again','b')

    def test_controller_only_install_and_update_uninstall_connections(self):
        self.controller.close(); self.i.uninstall()
        (self.root/'resident.json').unlink()
        configure_controller(self.root)
        self.i.install(self.bundle)
        self.assertEqual(set(self.i.check()['services']),{'tdev'})
        a=self.add(); self.m.change('disable','personal')
        config=(self.root/'config.json').read_bytes()
        self.i.install(self.bundle)
        self.assertFalse(self.backend.running[cm.service(a['id'])])
        self.i.uninstall()
        self.assertEqual(config,(self.root/'config.json').read_bytes())
        self.assertFalse((self.backend.svdir/'tdev').exists())

    def test_concurrent_config_edit_blocks_recovery_without_overwriting(self):
        a=self.add()
        with patch.object(self.backend,'down',side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt): self.m.change('disable','personal')
        config=json.loads((self.root/'config.json').read_bytes()); config['diagnostics']={'mode':'watch'}
        atomic_write(self.root/'config.json',canonical(config))
        with self.i.lock(), self.assertRaises(Fault): self.i.recover()
        self.assertEqual(config,json.loads((self.root/'config.json').read_bytes()))
        self.assertTrue(self.m.journal.exists())

    def test_tampered_profile_rejected_before_update_or_enable_effects(self):
        a=self.add(); directory,profile,_=cm.paths(self.root,a['id'])
        atomic_write(directory/(profile+'.yaml'),b'{}')
        events=list(self.backend.events)
        with self.assertRaises(Fault): self.i.install(self.bundle)
        with self.assertRaises(Fault): self.m.change('enable','personal')
        self.assertEqual(events,self.backend.events)
        self.assertFalse(self.m.journal.exists())

    def test_duplicate_credential_hash_and_unknown_principal_rejected(self):
        a=self.add(); config=json.loads((self.root/'config.json').read_bytes())
        other='cred_'+'f'*32
        config['credentials'][other]=copy.deepcopy(config['credentials'][a['credentialId']])
        atomic_write(self.root/'config.json',canonical(config))
        with self.assertRaises(Fault): self.controller.authenticate(self.secret(a))
        config['credentials'][other]['tokenHash']=digest(b'other-fixture')
        config['credentials'][other]['principal']='missing'
        atomic_write(self.root/'config.json',canonical(config))
        with self.assertRaises(Fault): self.controller.authenticate(self.secret(a))

    def test_cli_token_uses_stdin_copy_and_no_secret_in_receipt(self):
        a=self.add(); secret=self.secret(a)
        with patch('tdev.installer_setup.copy_token',return_value=True) as copy_token:
            result=self.m.token('personal')
        copy_token.assert_called_once_with(secret.encode())
        self.assertNotIn(secret,json.dumps(result))
        self.assertEqual(secret,self.secret(a))
