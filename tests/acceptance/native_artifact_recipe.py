"""Native recipe provenance joins, pure inspection and streaming large input evidence."""
import hashlib
import json
import sqlite3
from contextlib import closing

from acceptance.harness import eventually, git
from acceptance import test_artifact_recipe as recipes
from acceptance.test_artifact_recipe import recipe


# Reuse fixture helpers, without inheriting/rerunning all common test methods.
import unittest
class NativeArtifactRecipeTest(unittest.TestCase):
    setUp=recipes.ArtifactRecipeTest.setUp
    validated=recipes.ArtifactRecipeTest.validated
    new_task=recipes.ArtifactRecipeTest.new_task
    inspect=recipes.ArtifactRecipeTest.inspect
    error=recipes.ArtifactRecipeTest.error

    def sql(self,statement,args=()):
        with closing(sqlite3.connect(self.runtime.state/'state.sqlite')) as db:
            with db:return db.execute(statement,args).fetchall()

    def test_tampered_terminal_proof_never_authorizes_recipe_or_source_publication(self):
        validation=self.validated();ident=validation['id']
        raw=self.sql('SELECT result FROM operation WHERE id=?',(ident,))[0][0]
        for field,value in [('candidate','f'*40),('stopped',False),('exitCode',False),('id','other'),
                            ('terminal',False),('timedOut',True),('captureError','changed source')]:
            changed=json.loads(raw);changed[field]=value
            try:
                self.sql('UPDATE operation SET result=? WHERE id=?',(json.dumps(changed),ident))
                self.error(validation,('VALIDATION_REQUIRED','STATE_FORMAT'))
                reply=self.runtime.request('tools/call',{'name':'tdev_publish','arguments':{'request':{
                    'requestId':'refuse-'+field,'validationId':ident}}})[2]['result']['structuredContent']
                self.assertFalse(reply['ok'],reply)
                self.assertIn(reply['error']['code'],('VALIDATION_REQUIRED','STATE_FORMAT'),reply)
                self.assertEqual(self.sql('SELECT id FROM operation WHERE request=?',('refuse-'+field,)),[])
            finally:self.sql('UPDATE operation SET result=? WHERE id=?',(raw,ident))
        self.inspect(validation)

    def test_recipe_inspection_never_reconciles_stopped_writer_or_creates_operations(self):
        validation=self.validated();original=self.inspect(validation);r=self.runtime
        marker=r.root/'writer-ready'
        op=r.call('exec',{'requestId':'writer','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
            'command':'printf ready > "$MARKER"; read line; printf changed > a.txt',
            'env':{'MARKER':str(marker)},'timeout':30,'waitMs':0})
        eventually(marker.exists,bool)
        r.call('operation',{'action':'stdin','requestId':'release-writer','operationId':op['id'],
            'sequence':0,'text':'go\n','eof':True})
        eventually(lambda:(r.state/'jobs'/op['id']/'result.json').exists(),bool)
        before=self.sql('SELECT id,status,effect,intent,result FROM operation ORDER BY rowid')
        tasks=self.sql('SELECT id,checkpoint,busy FROM task ORDER BY id')
        self.assertEqual(self.inspect(validation),original)
        self.assertEqual(self.sql('SELECT id,status,effect,intent,result FROM operation ORDER BY rowid'),before)
        self.assertEqual(self.sql('SELECT id,checkpoint,busy FROM task ORDER BY id'),tasks)
        self.assertIn(self.sql('SELECT status FROM operation WHERE id=?',(op['id'],))[0][0],('running','unknown'))
        self.assertEqual(r.terminal(op['id'])['status'],'succeeded')
        self.assertEqual(self.inspect(validation),original)

    def test_173_mib_declared_input_hashes_stream_without_acquisition_or_build(self):
        r=self.runtime;size=173*1024*1024+31;remaining=size;h=hashlib.sha256();chunk=b'input block\n'*8192
        with (r.work/'large').open('wb') as stream:
            while remaining:
                part=chunk[:min(remaining,len(chunk))];stream.write(part);h.update(part);remaining-=len(part)
        git('-c','core.bigFileThreshold=1m','add','large',cwd=r.work)
        git('-c','core.bigFileThreshold=1m','commit','-m','large input',cwd=r.work)
        r.head=git('rev-parse','HEAD',cwd=r.work)
        directory=r.work/'.git';st=directory.stat()
        r.config['repositories']['large']={**r.config['repositories']['test'],
            'remote':str(directory),'identity':f'local:{st.st_dev}:{st.st_ino}','allowWorktree':True}
        r.config['principals']['alice']['repos']['large']=['refs/heads/main']
        r.config['artifactLimits']={'workingBytes':2147483648};r.save_config()
        space=r.call('workspace',{'action':'create','requestId':'large-space','name':'large input','projects':['large']})['result']
        opened=r.call('task',{'action':'open','requestId':'large-open','repo':'large','workspaceId':space['workspaceId'],
            'ref':'refs/heads/main','expectedHead':r.head})
        self.assertEqual(opened['status'],'succeeded',opened)
        self.task=opened['result']
        value=recipe();value['inputs']=['large'];value['dependencies']=[{
            'name':'public-input','url':'https://must-not-fetch.invalid/content','sha256':'b'*64}]
        validation=self.validated(value,wait_seconds=180);result=self.inspect(validation)
        self.assertEqual(result['source']['inputs']['large'],{'mode':'100644','sha256':h.hexdigest(),'size':size})
        self.assertFalse(result['buildExecuted'])
        self.assertFalse(list(r.root.rglob('MUST-NOT-BUILD')))
        from pathlib import Path
        peak=int(next(line.split()[1] for line in Path(f'/proc/{r.process.pid}/status').read_text().splitlines() if line.startswith('VmHWM:')))
        self.assertLess(peak,128*1024)
        print(json.dumps({'artifactRecipeInputBytes':size,'controllerPeakKiB':peak,'result':'PASS'}),flush=True)
