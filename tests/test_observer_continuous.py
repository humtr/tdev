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
  self.assertEqual(2,s['observerRevision']);self.assertEqual(0,s['frontier']['parsedRequestsSinceBaseline'])
  self.assertEqual(self.policy.recorder.instance,s['frontier']['instance'])
  for p in (self.base/'segments').glob('*/samples.jsonl'):
   self.assertTrue(all('frontier' in json.loads(line) for line in p.read_text().splitlines()))
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
