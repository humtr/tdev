import hashlib
import importlib.util
import importlib.machinery
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

REPOSITORY=Path(__file__).resolve().parents[1]
SOURCE=REPOSITORY/'scripts/tdev-observe'
spec=importlib.util.spec_from_loader('shortcut',importlib.machinery.SourceFileLoader('shortcut',str(SOURCE)))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class RetentionTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
  (self.base/'segments').mkdir()
 def tearDown(self):self.tmp.cleanup()
 def segment(self,age=0):
  s=m.Segment(self.base,'coarse');r={'observerTimeNs':time.time_ns(),'snapshot':{'recent':[]}}
  s.write(m.encode(r),r);s.close('duration')
  v=m.read(s.path/'observation.json');v['finishedNs']=int((time.time()-age)*1e9);m.atomic(s.path/'observation.json',v)
  return s
 def test_age_and_size_cleanup_only_closed_owned(self):
  old=self.segment(100);new=self.segment(0)
  r=m.prune(self.base,max_age=50,max_total=999999)
  self.assertEqual(1,r['removed']);self.assertFalse(old.path.exists());self.assertTrue(new.path.exists())
  r=m.prune(self.base,max_age=999,max_total=0)
  self.assertEqual(1,r['removed']);self.assertFalse(new.path.exists())
 def test_keep_active_foreign_and_links_never_deleted(self):
  kept=self.segment(100);(kept.path/'KEEP').touch()
  active=m.Segment(self.base,'coarse')
  foreign=self.segment(100);(foreign.path/'user-file.txt').write_text('preserve')
  link=self.base/'segments/link';link.symlink_to(kept.path,target_is_directory=True)
  old=self.segment(100)
  r=m.prune(self.base,max_age=0,max_total=0)
  self.assertEqual(1,r['removed']);self.assertTrue(r['overLimit'])
  for p in (kept.path,active.path,foreign.path,link):self.assertTrue(p.exists())
  active.close('stopped')
 def test_receipt_hash_sample_and_unavailability_counts(self):
  s=m.Segment(self.base,'coarse');a={'observerTimeNs':1,'unavailable':'timeout'};b={'observerTimeNs':2,'snapshot':{}}
  data=m.encode(a)+m.encode(b);s.write(m.encode(a),a);s.write(m.encode(b),b);s.close('stopped')
  r=m.read(s.path/'observation.json')
  self.assertEqual((2,1,1,2),(r['samples'],r['unavailable'],r['firstSampleNs'],r['lastSampleNs']))
  self.assertEqual(hashlib.sha256(data).hexdigest(),r['sha256'])
  self.assertEqual(data,(s.path/'samples.jsonl').read_bytes())

class ContextTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.parent=Path(self.tmp.name);self.root=self.parent/'installation';self.root.mkdir()
  self.home=self.parent/'operator';self.home.mkdir(mode=0o700)
  m.atomic(self.root/'resident.json',{'home':str(self.home),'installation':'fixture'})
  self.env={k:v for k,v in os.environ.items() if k not in ('TDEV_OBSERVE_DIR','TDEV_ROOT','TDEV_OBSERVE_ROOT')}
  self.env['PYTHONPATH']=str(REPOSITORY/'src')+':'+str(REPOSITORY/'.tdev-deps')
 def cli(self,home,*args,extra=None,success=True):
  env={**self.env,'HOME':str(home),**(extra or {})}
  p=subprocess.run([os.sys.executable,'-m','tdev.cli',*args],env=env,text=True,capture_output=True,timeout=10)
  if success:self.assertEqual(0,p.returncode,p.stderr+p.stdout)
  return p
 def test_home_independent_root_selection_and_status_has_no_writes(self):
  before=set(self.parent.rglob('*'))
  normal=json.loads(self.cli(self.home,'--root',str(self.root),'observer','status','--json').stdout)
  isolated=json.loads(self.cli(self.parent/'task-home','observer','status','--json',extra={'TDEV_ROOT':str(self.root)}).stdout)
  self.assertEqual(normal,isolated)
  self.assertEqual(str(self.home/'tdev-observations'),normal['recordingRoot'])
  self.assertEqual(['no_state_or_evidence']*2,[r['state'] for r in normal['modes']])
  self.assertEqual(before,set(self.parent.rglob('*')))
  other=self.parent/'other';other.mkdir();m.atomic(other/'resident.json',{'home':str(self.parent/'other-home')})
  explicit=json.loads(self.cli(self.home,'--root',str(self.root),'observer','status','--json',extra={'TDEV_ROOT':str(other)}).stdout)
  self.assertEqual(normal,explicit)
  svdir=self.parent/'services';m.private(svdir/'tdev')
  m.atomic(svdir/'tdev/.tdev-owner.json',{'root':str(self.root)})
  discovered=json.loads(self.cli(self.parent/'task-home','observer','status','--json',extra={'SVDIR':str(svdir)}).stdout)
  self.assertEqual(normal,discovered)
 def test_custom_directory_preserved_and_missing_owner_never_uses_home(self):
  custom=self.parent/'custom'
  p=self.cli(self.parent/'task','--root',str(self.root),'observer','status','--json',extra={'TDEV_OBSERVE_DIR':str(custom)})
  self.assertEqual(str(custom),json.loads(p.stdout)['recordingRoot'])
  custom.mkdir();alias=self.parent/'alias';alias.symlink_to(custom,target_is_directory=True)
  self.cli(self.home,'--root',str(self.root),'observer','status','--json',extra={'TDEV_OBSERVE_DIR':str(alias)})
  (self.root/'resident.json').unlink()
  self.cli(self.home,'--root',str(self.root),'observer','status','--json',extra={'TDEV_OBSERVE_DIR':str(custom)})
  self.assertNotEqual(0,self.cli(self.home,'--root',str(self.root),'observer','status',success=False).returncode)
  m.atomic(self.root/'resident.json',{'home':'relative-invalid'})
  self.assertNotEqual(0,self.cli(self.home,'--root',str(self.root),'observer','status',success=False).returncode)
  self.assertNotEqual(0,self.cli(self.home,'--root',str(self.root),'observer','status',extra={'TDEV_OBSERVE_DIR':''},success=False).returncode)
  self.assertFalse((self.home/'tdev-observations').exists())
 def test_stopped_stale_invalid_and_evidence_without_status(self):
  base=self.home/'tdev-observations/continuous-v1';m.private(base);m.private(base/'segments')
  def status():return json.loads(self.cli(self.home,'--root',str(self.root),'observer','status','--json',success=False).stdout)['modes'][0]
  row=dict(mode='coarse',pid=999999999,start='1',running=True)
  m.atomic(base/'coarse.json',row)
  self.assertEqual('stale_pid_or_status',status()['state'])
  row['running']=False;m.atomic(base/'coarse.json',row)
  self.assertEqual('stopped_evidence_exists',status()['state'])
  self.assertEqual('unknown_legacy',status()['installationBinding'])
  (base/'coarse.json').unlink();(base/'segments/fixture-coarse-evidence').mkdir()
  self.assertEqual('evidence_without_status',status()['state'])
  (base/'coarse.json').write_text('{bad');(base/'coarse.json').chmod(0o600)
  self.assertEqual('inaccessible_or_invalid_recording_root',status()['state'])
  (base/'coarse.json').unlink();(base/'coarse.json').symlink_to(self.root/'resident.json')
  self.assertEqual('inaccessible_or_invalid_recording_root',status()['state'])
  (base/'coarse.json').unlink();os.mkfifo(base/'coarse.json',0o600)
  self.assertEqual('inaccessible_or_invalid_recording_root',status()['state'])
 def test_invalid_root_and_access_failure_are_explicit(self):
  custom=self.parent/'file';custom.write_text('not a directory')
  result=self.cli(self.home,'--root',str(self.root),'observer','status','--json',extra={'TDEV_OBSERVE_DIR':str(custom)},success=False)
  self.assertEqual(1,result.returncode)
  self.assertEqual('inaccessible_or_invalid_recording_root',json.loads(result.stdout)['modes'][0]['state'])
  with patch.object(m,'BASE',self.parent/'blocked'),patch.object(Path,'lstat',side_effect=PermissionError('fixture')):
   self.assertEqual('inaccessible_or_invalid_recording_root',m.inspect_status('coarse')['state'])

class ProcessTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.env={**os.environ,'TDEV_OBSERVE_DIR':self.tmp.name}
  self.base=Path(self.tmp.name)/'continuous-v1'
  self.runtime=Path(self.tmp.name)/'runtime';self.runtime.mkdir()
  (self.runtime/'active').symlink_to(REPOSITORY,target_is_directory=True)
  self.env['TDEV_OBSERVE_ROOT']=str(self.runtime)
  from tdev.diagnostic_policy import DiagnosticsPolicy
  self.policy=DiagnosticsPolicy(self.runtime/'state/diagnostics',REPOSITORY)
  for i in range(256):
   self.policy.recorder.emit(i+1,'rpc_parsed',tool='tdev_project',action='list',method='tools/call',rpcTag='a'*24)

 def cmd(self,*args,success=True):
  p=subprocess.run([os.sys.executable,str(SOURCE),*args],env=self.env,text=True,capture_output=True,timeout=12)
  if success:self.assertEqual(0,p.returncode,p.stderr+p.stdout)
  return p
 def tearDown(self):
  try:self.cmd('stop');self.cmd('stop','--fine')
  finally:self.policy.close();self.tmp.cleanup()
 def wait(self,predicate):
  deadline=time.monotonic()+8
  while time.monotonic()<deadline:
   if predicate():return
   time.sleep(.1)
  self.fail('bounded wait expired')
 def test_rollover_duplicate_keep_and_graceful_stop(self):
  self.cmd('start','--seconds','1','--interval','.25')
  before=m.read(self.base/'coarse.json')
  self.cmd('start');self.assertEqual(before['pid'],m.read(self.base/'coarse.json')['pid'])
  self.wait(lambda:len(list((self.base/'segments').iterdir()))>=3)
  self.cmd('keep');self.assertEqual(2,len(list((self.base/'segments').glob('*/KEEP'))))
  self.cmd('stop');s=m.read(self.base/'coarse.json');self.assertFalse(m.running(s));self.assertFalse(s['running'])
  reports=[m.read(p) for p in (self.base/'segments').glob('*/observation.json')]
  self.assertIn('duration',[r['stopReason'] for r in reports]);self.assertIn('stopped',[r['stopReason'] for r in reports])
  self.assertGreater(s['samples'],4);self.assertEqual(0,s['storageErrors'])
  self.assertEqual(3,s['observerRevision']);self.assertEqual(0,s['frontier']['parsedRequestsSinceBaseline'])
  self.assertEqual(self.policy.recorder.instance,s['frontier']['instance'])
  for p in (self.base/'segments').glob('*/samples.jsonl'):
   self.assertTrue(all('frontier' in json.loads(line) for line in p.read_text().splitlines()))
 def test_cli_reads_both_live_modes_and_legacy_identity_without_control_effects(self):
  home=Path(self.tmp.name)/'operator';home.mkdir()
  m.atomic(self.runtime/'resident.json',{'home':str(home)})
  self.cmd('start','--interval','.25');self.cmd('start','--fine','--interval','.25')
  before={mode:m.read(self.base/(mode+'.json')) for mode in ('coarse','fine')}
  env={**self.env,'HOME':str(Path(self.tmp.name)/'task-home'),'TDEV_ROOT':str(self.runtime)}
  result=subprocess.run([os.sys.executable,'-m','tdev.cli','observer','status','--json'],env=env,text=True,capture_output=True,timeout=10)
  self.assertEqual(0,result.returncode,result.stderr)
  report=json.loads(result.stdout)
  self.assertEqual(['running','running'],[r['state'] for r in report['modes']])
  for row in report['modes']:
   self.assertEqual(before[row['mode']]['pid'],row['pid'])
   self.assertEqual('matched',row['installationBinding'])
   self.assertTrue(m.running(m.read(self.base/(row['mode']+'.json'))))
  # Existing revision-2 status is readable; /proc environment supplies its binding.
  legacy=dict(before['coarse']);legacy.pop('installationRoot');legacy.pop('recordingRoot')
  self.assertEqual(str(self.runtime),m.process_root(legacy))
  with patch.object(m,'BASE',self.base),patch.object(m,'ROOT',self.runtime),patch.object(m,'read_status',return_value={**legacy,'lastSampleNs':1}):
   self.assertEqual('stale_status',m.inspect_status('coarse')['state'])
  with patch.object(m,'BASE',self.base),patch.object(m,'ROOT',self.runtime),patch.object(m,'lock',side_effect=AssertionError('lock')),patch.object(m,'private',side_effect=AssertionError('mkdir')),patch.object(m,'prune',side_effect=AssertionError('prune')),patch.object(os,'kill',side_effect=AssertionError('signal')):
   self.assertEqual('running',m.inspect_status('coarse')['state'])
  with patch.object(m,'BASE',self.base),patch.object(m,'ROOT',Path('/another-installation')):
   self.assertEqual('installation_mismatch',m.inspect_status('coarse')['state'])
  mismatch=subprocess.run([os.sys.executable,str(SOURCE),'stop'],env={**self.env,'TDEV_OBSERVE_ROOT':str(self.runtime/'other')},capture_output=True,text=True,timeout=10)
  self.assertNotEqual(0,mismatch.returncode)
  self.assertTrue(m.running(m.read(self.base/'coarse.json')))
  # Reused PID/start mismatch must never be reported live or signalled.
  legacy['start']='wrong';self.assertFalse(m.running(legacy))
 def test_byte_rollover_independent_of_duration(self):
  self.cmd('start','--seconds','3600','--interval','.25','--segment-mib','1')
  self.wait(lambda:any(m.read(p)['stopReason']=='byte_limit' for p in (self.base/'segments').glob('*/observation.json')))
  self.cmd('stop')
  for p in (self.base/'segments').glob('*/samples.jsonl'):self.assertLessEqual(p.stat().st_size,1048576)
 def test_unavailable_server_records_and_continues(self):
  root=Path(self.tmp.name)/'offline';root.mkdir()
  live=REPOSITORY
  (root/'active').symlink_to(live,target_is_directory=True)
  self.env['TDEV_OBSERVE_ROOT']=str(root)
  result=self.cmd('start','--seconds','1','--interval','.25',success=False)
  self.assertNotEqual(0,result.returncode)
  self.wait(lambda:m.read(self.base/'coarse.json')['unavailable']>=3)
  self.cmd('stop')
  self.assertGreaterEqual(m.read(self.base/'coarse.json')['unavailable'],3)
 def test_stop_other_mode_does_not_stop_coarse(self):
  self.cmd('start','--seconds','1','--interval','.25')
  self.cmd('stop','--fine');self.assertTrue(m.running(m.read(self.base/'coarse.json')))
  self.cmd('stop')

if __name__=='__main__':unittest.main(verbosity=2)
