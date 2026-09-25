import json
import os
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from tdev.admin import stage, init_config, point
from tdev.common import Fault, atomic_write, canonical, digest
from tdev.installer import configure, retire_legacy
from tdev.resident import Installation, NAMES, run_service
from test_core import Base

class FakeRunit:
    def __init__(self, svdir):
        self.svdir = svdir
        svdir.mkdir()
        self.events, self.running = [], {}
    def preflight(self):
        return {'svdir': str(self.svdir), 'recoveryMonitor': True}
    def available(self, d): return d.exists()
    def wanted_down(self, d): return (d / 'down').exists()
    def down(self, d):
        self.events.append(('down', d.name)); atomic_write(d / 'down', b''); self.running[d.name] = False
    def up(self, d):
        self.events.append(('up', d.name)); (d / 'down').unlink(missing_ok=True); self.running[d.name] = True
    def remove(self, d, backup):
        self.down(d); os.rename(d, backup)
    def pid(self, d):
        if not self.running.get(d.name): raise Fault('SERVICE_DOWN')
        return 100
    def controller_ready(self, root, settings, bundle):
        self.events.append(('health', 'tdev'))
        assert self.running['tdev'] and (root / 'active').resolve().name == bundle
        return {'pid': 100, 'bundle': bundle}
    def tunnel_ready(self, root, settings):
        self.events.append(('health', 'tdev-tunnel'))
        assert self.running['tdev'] and self.running['tdev-tunnel']
        return {'pid': 101, 'controlPlanePoll': True}

class ResidentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name)
        self.root, self.source = self.parent / 'installation', self.parent / 'source'
        (self.root / 'bin').mkdir(parents=True); self.root.chmod(0o700)
        native = self.root / 'bin/tunnel-client'
        native.write_text('#!/bin/sh\nprintf "0.0.14\\n"\n'); native.chmod(0o700)
        (self.source / 'src').mkdir(parents=True)
        (self.source / 'src/program.py').write_text('version=1\n')
        (self.source / 'src/tdev').mkdir()
        (self.source / 'src/tdev/resident.py').write_text('# resident fixture\n')
        (self.source / 'contracts').mkdir()
        (self.source / 'contracts/config.schema.json').write_text(json.dumps({'x-stateVersions': [3]}))
        (self.source / 'requirements.txt').write_text('')
        self.one = stage(self.root, self.source)['bundle']; init_config(self.root)
        key = self.parent / 'runtime.secret'; atomic_write(key, b'fixture-private-runtime-key')
        self.settings = configure(self.root, tunnel_id='tunnel_fixture', key_file=key)
        self.backend = FakeRunit(self.parent / 'svdir')
        self.i = Installation(self.root, self.backend)
    def next_bundle(self):
        (self.source / 'src/program.py').write_text('version=2\n')
        return stage(self.root, self.source)['bundle']
    def test_update_identity_and_intentional_down(self):
        self.i.install(self.one)
        self.assertEqual(self.backend.events[:4], [('up','tdev'),('health','tdev'),('up','tdev-tunnel'),('health','tdev-tunnel')])
        before = (self.root / 'config.json').read_bytes()
        second = self.next_bundle(); self.backend.down(self.backend.svdir / 'tdev-tunnel')
        self.i.install(second)
        self.assertEqual(self.i.check()['services']['tdev-tunnel'], {'desired':'down'})
        self.assertEqual((self.root / 'active').resolve().name, second)
        self.assertEqual((self.root / 'config.json').read_bytes(), before)
        self.assertFalse(self.i.journal.exists())
        (self.backend.svdir / 'tdev/run').write_text('changed')
        with self.assertRaises(Fault) as e: self.i.install(self.one)
        self.assertEqual(e.exception.value['code'], 'SERVICE_CHANGED')
    def test_config_update_is_journaled_and_failure_or_crash_restores_credentials(self):
        self.i.install(self.one)
        before = (self.root / 'config.json').read_bytes()
        config = json.loads(before)
        config['diagnostics'] = {'mode': 'watch'}
        config['principals']['owner']['diagnostics'] = True
        second = self.next_bundle()
        original = self.i.write_service
        def crash(name, settings):
            self.assertEqual(json.loads((self.root/'config.json').read_bytes()), config)
            raise KeyboardInterrupt()
        with patch.object(self.i, 'write_service', crash), self.assertRaises(KeyboardInterrupt):
            self.i.install(second, config, digest(before))
        with self.i.lock():
            self.i.recover()
        self.assertEqual(before, (self.root/'config.json').read_bytes())
        self.assertEqual(self.one, (self.root/'active').resolve().name)
        self.i.install(second, config, digest(before))
        self.assertEqual(config, json.loads((self.root/'config.json').read_bytes()))
        saved = json.loads((self.root/'previous-config.json').read_bytes())
        self.assertEqual(self.one, saved['bundle'])
        import base64
        self.assertEqual(before, base64.b64decode(saved['before']))
        self.i.install(self.one, json.loads(base64.b64decode(saved['before'])), saved['expected'])
        self.assertEqual(json.loads(before), json.loads((self.root/'config.json').read_bytes()))
        with self.assertRaises(Fault) as error:
            self.i.install(second, config, 'stale-digest')
        self.assertEqual('CONFIG_CHANGED', error.exception.value['code'])
        self.assertFalse(self.i.journal.exists())

    def test_update_preserves_concurrent_operator_config_and_keeps_recovery_evidence(self):
        self.i.install(self.one)
        before = (self.root/'config.json').read_bytes()
        requested = json.loads(before)
        requested['diagnostics'] = {'mode': 'watch'}
        operator = json.loads(before)
        operator['diagnostics'] = {'mode': 'off', 'slowSeconds': 99}
        original = self.backend.down
        changed = False
        def concurrently_edit(directory):
            nonlocal changed
            original(directory)
            if not changed:
                changed = True
                atomic_write(self.root/'config.json', canonical(operator))
        with patch.object(self.backend, 'down', concurrently_edit), self.assertRaises(Fault) as error:
            self.i.install(self.next_bundle(), requested, digest(before))
        self.assertEqual('CONFIG_CHANGED', error.exception.value['code'])
        self.assertEqual(operator, json.loads((self.root/'config.json').read_bytes()))
        self.assertTrue(self.i.journal.exists())
        atomic_write(self.root/'config.json', before)  # Resolve only this disposable fixture's conflict.
        with self.i.lock():
            self.i.recover()
        self.assertEqual(self.one, (self.root/'active').resolve().name)
        self.assertFalse(self.i.journal.exists())

    def test_foreign_and_stale_names_preserved(self):
        d = self.backend.svdir / 'tdev'; d.mkdir(); (d / 'run').write_text('keep')
        with self.assertRaises(Fault) as e: self.i.install(self.one)
        self.assertEqual(e.exception.value['code'], 'SERVICE_CONFLICT')
        self.assertEqual((d / 'run').read_text(), 'keep')
        self.assertFalse(self.i.journal.exists()); shutil.rmtree(d)
        (self.backend.svdir / 'tdev-oai-tunnel').mkdir()
        with self.assertRaises(Fault) as e: self.i.install(self.one)
        self.assertEqual(e.exception.value['code'], 'STALE_SERVICE')
    def test_partial_first_install_rolls_back(self):
        real = self.i.write_service
        def fail(name, settings):
            real(name, settings)
            raise RuntimeError('partial registration')
        with patch.object(self.i, 'write_service', fail), self.assertRaises(RuntimeError): self.i.install(self.one)
        self.assertTrue(all(not (self.backend.svdir / n).exists() for n in NAMES))
        self.assertFalse((self.root / 'active').exists())
        self.assertFalse((self.root / 'state/maintenance.json').exists())
    def test_interrupted_partial_update_recovers(self):
        self.i.install(self.one); old = (self.backend.svdir / 'tdev/run').read_bytes(); second = self.next_bundle()
        def crash(name, settings):
            atomic_write(self.backend.svdir / name / 'run', b'partial', 0o700)
            raise KeyboardInterrupt()
        with patch.object(self.i, 'write_service', crash), self.assertRaises(KeyboardInterrupt): self.i.install(second)
        self.assertTrue(self.i.journal.exists())
        resumed = Installation(self.root, self.backend)
        with resumed.lock(): resumed.recover()
        self.assertEqual((self.root / 'active').resolve().name, self.one)
        self.assertEqual((self.backend.svdir / 'tdev/run').read_bytes(), old)
        self.assertTrue(self.backend.running['tdev-tunnel'])
        self.assertFalse(self.i.journal.exists())
    def test_readiness_failure_restores_previous(self):
        self.i.install(self.one); second = self.next_bundle(); real = self.backend.controller_ready
        def fail(root, settings, bundle):
            if bundle == second: raise Fault('CONTROLLER_IDENTITY')
            return real(root, settings, bundle)
        with patch.object(self.backend,'controller_ready',fail), patch('tdev.resident.retry', lambda fn: fn()):
            with self.assertRaises(Fault): self.i.install(second)
        self.assertEqual((self.root / 'active').resolve().name, self.one)
        self.assertTrue(self.backend.running['tdev-tunnel'])
    def test_uninstall_preserves_data_and_other_services(self):
        self.i.install(self.one)
        extra = self.backend.svdir / 'other'; extra.mkdir(); (extra / 'run').write_text('keep')
        marker = self.root / 'state/keep'; marker.write_text('retained')
        before = (self.root / 'config.json').read_bytes(); self.i.uninstall()
        self.assertEqual((extra / 'run').read_text(), 'keep')
        self.assertEqual(marker.read_text(), 'retained')
        self.assertEqual((self.root / 'config.json').read_bytes(), before)
        self.assertTrue((self.root / 'tunnel-env/CONTROL_PLANE_API_KEY').exists())
        self.assertTrue(all(not (self.backend.svdir / n).exists() for n in NAMES)); self.i.uninstall()
    def test_lock_and_explicit_verified_legacy_retirement(self):
        with self.i.lock():
            with self.assertRaises(Fault):
                with Installation(self.root,self.backend).lock(): pass
        d = self.backend.svdir / 'tdev'; d.mkdir(); atomic_write(d / 'run',b'old',0o700)
        with self.assertRaises(Fault): retire_legacy(self.i,'tdev:'+'0'*64)
        receipt = retire_legacy(self.i,'tdev:'+digest(b'old'))
        self.assertFalse(d.exists()); self.assertEqual((Path(receipt['backup']) / 'run').read_bytes(),b'old')
        self.i.install(self.one)
        self.assertEqual(self.i.owned(d,self.settings)['installation'],self.settings['installation'])
    def test_pre_resident_bundle_rejected_before_stopping_services(self):
        self.i.install(self.one)
        (self.source / 'src/tdev/resident.py').unlink()
        old = stage(self.root, self.source)['bundle']
        before = list(self.backend.events)
        with self.assertRaises(Fault) as e: self.i.install(old)
        self.assertEqual(e.exception.value['code'], 'RESIDENT_BUNDLE_REQUIRED')
        self.assertEqual(self.backend.events, before)
        self.assertFalse(self.i.journal.exists())
    def test_foreign_service_appearing_during_install_is_never_overwritten(self):
        real = self.i.write_service
        def raced(name, settings):
            if name == 'tdev':
                d = self.backend.svdir / name
                d.mkdir(); (d / 'run').write_text('foreign concurrent service')
            real(name, settings)
        with patch.object(self.i, 'write_service', raced), self.assertRaises(Fault):
            self.i.install(self.one)
        self.assertEqual((self.backend.svdir / 'tdev/run').read_text(), 'foreign concurrent service')
        self.assertEqual(self.backend.events, [])
        self.assertTrue(self.i.journal.exists())
    def test_foreground_launcher_and_secret_reference(self):
        profile = json.loads((self.root / 'tunnel-profiles/tdev.yaml').read_bytes())
        self.assertTrue(profile['control_plane']['api_key'].startswith('file:'))
        self.assertNotIn('fixture-private-runtime-key',(self.root / 'resident.json').read_text())
        point(self.root,self.one)
        with patch('tdev.resident.os.execve') as execute: run_service(self.root,'controller')
        self.assertEqual(execute.call_args.args[1][1:3],['-m','tdev.server'])
        self.assertIn(str(self.root / 'versions' / self.one / 'src'),execute.call_args.args[2]['PYTHONPATH'])
        with patch('tdev.resident.get_health',return_value={'bundle':self.one}),patch('tdev.resident.os.execve') as execute:
            run_service(self.root,'tunnel')
        self.assertIn('--profile-dir',execute.call_args.args[1])
        (self.root / 'bin/tunnel-client').write_text('changed')
        with self.assertRaises(Fault) as e: run_service(self.root,'tunnel')
        self.assertEqual(e.exception.value['code'],'TUNNEL_BINARY_CHANGED')

class MaintenanceTest(Base):
    def test_fence_waits_for_admission_and_allows_observation(self):
        i = Installation(self.root,FakeRunit(self.root / 'svdir'))
        entered, release, fenced = threading.Event(),threading.Event(),threading.Event()
        original = self.c._call
        def slow(*args):
            entered.set(); release.wait(5); return original(*args)
        responses=[]
        with patch.object(self.c,'_call',slow):
            worker=threading.Thread(target=lambda: responses.append(self.c.call('alice','tdev_task',{'action':'list'})))
            worker.start(); self.assertTrue(entered.wait(2))
            def fence(): i.fence('test'); fenced.set()
            installer=threading.Thread(target=fence); installer.start()
            self.assertFalse(fenced.wait(.05)); release.set(); worker.join(3); installer.join(3)
        self.assertTrue(fenced.is_set()); self.assertTrue(responses[0]['ok'])
        self.assertTrue(self.c.call('alice','tdev_task',{'action':'list'})['ok'])
        denied=self.c.call('alice','tdev_workspace',{'action':'create','requestId':'during','name':'blocked'})
        self.assertEqual(denied['error']['code'],'MAINTENANCE'); i.unfence('test')
        self.assertTrue(self.c.call('alice','tdev_workspace',{'action':'create','requestId':'after','name':'ready'})['ok'])
    def test_outstanding_effect_is_preserved(self):
        w=self.open(); backend=FakeRunit(self.root / 'svdir'); i=Installation(self.root,backend)
        with self.c.store.tx() as db: db.execute("UPDATE operation SET status='unknown',effect='unknown' WHERE task=?",(w['taskId'],))
        with self.assertRaises(Fault) as e: i.fence('busy')
        self.assertEqual(e.exception.value['code'],'OUTSTANDING_EFFECT'); self.assertEqual(backend.events,[])
        self.assertEqual(self.c.store.one('SELECT checkpoint FROM task')['checkpoint'],w['checkpoint']); i.unfence('busy')
