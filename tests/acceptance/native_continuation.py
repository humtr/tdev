"""Native local-ledger limits and actual source-frontier observation intervals."""
import copy
import json
import os
import shutil
import sqlite3
import sys
import threading
import time
import unittest

from acceptance.harness import Runtime, eventually, output


class NativeContinuationTest(unittest.TestCase):
    def setUp(self):
        self.runtime=Runtime(request_timeout_seconds=40)
        self.addCleanup(self.runtime.close)

    def sql(self, statement, args=()):
        db=sqlite3.connect(self.runtime.state/'state.sqlite')
        try:
            with db:return db.execute(statement,args).fetchall()
        finally:db.close()

    def start(self):
        return self.runtime.call('task',{'action':'start','requestId':'original','label':'Original'})['result']

    def seed(self, id, intent, kind='task', task=None, status='unknown', repo='test'):
        self.sql('INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            (id,'alice',id,'fixture',kind,task,repo,'refs/heads/main',status,'unknown' if status=='unknown' else 'committed',json.dumps(intent)))

    def test_scan_ceiling_has_one_forward_cursor_for_pending_and_created_work(self):
        self.start()
        intent=json.loads(self.sql('SELECT intent FROM operation WHERE request=?',('original',))[0][0])
        for i in range(201):
            row=copy.deepcopy(intent)
            row['input']['label']='needle' if i==200 else 'unrelated'
            self.seed('pending-'+str(i),row)
        before=self.sql('SELECT id,status,effect,intent FROM operation ORDER BY rowid')
        page=self.runtime.call('find',{'label':'needle'})
        self.assertEqual((page['resolution'],page['pendingComplete']),('incomplete',False))
        self.assertEqual((page['matches'],page['pending']),([],[]))
        last=self.runtime.call('find',{'label':'needle','after':page['nextAfter']})
        self.assertEqual((last['resolution'],last['pendingComplete']),('incomplete',False))
        self.assertIsNone(last['nextAfter'])
        self.assertEqual([p['operationId'] for p in last['pending']],['pending-200'])
        self.assertEqual(self.sql('SELECT id,status,effect,intent FROM operation ORDER BY rowid'),before)

    def test_unknown_receipt_cap_and_large_private_intents_are_not_projected(self):
        task=self.start()
        for i in range(41):
            intent={'input':{'expected':task['checkpoint']},'identity':self.runtime.config['repositories']['test']['identity'],
                'construction':'native-execution','request':{'env':{'PRIVATE':'secret '+ 'x'*262144},'stdin':'private stdin'}}
            self.seed('effect-'+str(i),intent,kind='exec',task=task['taskId'])
        before=self.sql('SELECT id,status,effect FROM operation ORDER BY rowid')
        result=self.runtime.call('find',{'label':'Original'})
        match=result['matches'][0]
        self.assertEqual(len(match['outstanding']),40)
        self.assertFalse(match['outstandingComplete'])
        self.assertFalse(match['recentComplete'])
        self.assertLess(len(json.dumps(result)),20000)
        self.assertNotIn('private stdin',json.dumps(result))
        self.assertNotIn('secret',json.dumps(result))
        self.assertEqual(self.sql('SELECT id,status,effect FROM operation ORDER BY rowid'),before)

    def test_duplicate_project_name_cannot_choose_sole_existing_task(self):
        task=self.start()
        r=self.runtime
        r.config['repositories']['other']=copy.deepcopy(r.config['repositories']['test'])
        r.config['principals']['alice']['repos']['other']=['refs/heads/main']
        r.save_config()
        found=r.call('find',{'project':'Human project'})
        self.assertEqual(found['resolution'],'ambiguous',found)
        self.assertEqual(found['matches'][0]['taskId'],task['taskId'])
        self.assertEqual(r.call('find',{'project':'test'})['resolution'],'unique')

    def test_pending_project_current_scope_is_observed_without_creation(self):
        r=self.runtime
        policy={'kind':'local','root':str(r.root),'allowCreate':True,'managedRefNamespace':'refs/heads/managed/','validation':'true'}
        r.config['projectPolicies']={'local':policy}
        r.config['principals']['alice']['projectPolicies']=['local']
        r.save_config()
        import hashlib
        authority=hashlib.sha256(json.dumps({'kind':policy['kind'],'root':policy['root'],'owner':None},sort_keys=True,separators=(',',':')).encode()).hexdigest()
        intent={'input':{'action':'create','policy':'local','name':'Pending'},'authority':authority}
        self.seed('pending-project',intent,kind='project',repo=None)
        before=self.sql('SELECT * FROM operation')
        found=r.call('find',{'project':'Pending'})
        self.assertEqual(found['resolution'],'unique',found)
        self.assertEqual(found['pending'][0]['projectName'],'Pending')
        self.assertFalse((r.root/'Pending').exists())
        self.assertEqual(self.sql('SELECT * FROM operation'),before)
        r.config['projectPolicies']['local']['root']=str(r.work)
        r.save_config()
        denied=r.call('find',{'project':'Pending'})
        self.assertEqual((denied['resolution'],denied['unavailableMatches']),('unavailable',1))
        self.assertFalse((r.root/'Pending').exists())

    def test_find_does_not_reconcile_proved_completion_then_inspect_exposes_forward_work(self):
        r=self.runtime
        task=self.start()
        marker=r.root/'launches'
        args={'requestId':'run','taskId':task['taskId'],'expected':task['checkpoint'],
            'command':'printf x >> "$MARKER"; printf ready; read value; printf done > a.txt',
            'env':{'MARKER':str(marker)},'timeout':20,'waitMs':0}
        op=r.call('exec',args)
        eventually(lambda:r.status(op['id']),lambda value:'output' in value and output(value)==b'ready')
        r.call('operation',{'action':'stdin','requestId':'finish','operationId':op['id'],'sequence':0,'text':'go\n','eof':True})
        # The private supervisor result can exist before controller reconciliation.
        def stopped():return any(p.exists() for p in r.state.rglob('result.json'))
        eventually(stopped,bool,seconds=15)
        before=self.sql('SELECT status,effect FROM operation WHERE id=?',(op['id'],))[0]
        self.assertIn(before[0],('running','unknown'))
        found=r.call('find',{'label':'Original'})
        self.assertEqual(found['matches'][0]['busyOperationId'],op['id'])
        self.assertEqual(self.sql('SELECT status,effect FROM operation WHERE id=?',(op['id'],))[0],before)
        r.restart()
        current=eventually(lambda:r.call('task',{'action':'inspect','taskId':task['taskId'],'limit':1}),lambda value:value['mutationReady'])
        self.assertTrue(current['mutationReady'],current)
        self.assertIsNone(current['active'])
        self.assertLessEqual(int(current['observation']['startedAtNs']),int(current['observation']['observedAtNs']))
        self.assertEqual(marker.read_bytes(),b'x')
        self.assertEqual(r.call('exec',args)['status'],'succeeded')
        forward=r.call('edit',{'requestId':'forward','taskId':task['taskId'],'expected':current['task']['checkpoint'],
            'edits':[{'action':'put','path':'next','before':None,'content':'next useful work'}]})
        self.assertEqual(forward['status'],'succeeded')

    def test_provider_observation_interval_refreshes_current_writer_and_allows_unrelated_find(self):
        r=self.runtime
        task=self.start()
        r.stop()
        wrappers=r.root/'utilities'; wrappers.mkdir(mode=0o700)
        armed,marker,release=[r.root/name for name in ('armed','provider-gap','release')]
        real=shutil.which('git')
        script=wrappers/'git'
        script.write_text('#!'+sys.executable+'\nimport os,sys,time\nfrom pathlib import Path\n'+
            f'armed=Path({str(armed)!r}); marker=Path({str(marker)!r}); release=Path({str(release)!r})\n'+
            f'branch={task["ref"]!r}\n'+
            'if armed.exists() and "symbolic-ref" in sys.argv and sys.argv[-1]==branch and not marker.exists():\n'+
            ' marker.touch()\n end=time.monotonic()+20\n'+
            ' while not release.exists() and time.monotonic()<end:time.sleep(.02)\n'+
            f'os.execv({real!r},[{real!r},*sys.argv[1:]])\n')
        script.chmod(0o700)
        r.launch_environment['PATH']=str(wrappers)+os.pathsep+os.environ['PATH']
        r.start()
        args={'requestId':'first','taskId':task['taskId'],'expected':task['checkpoint'],
            'command':'printf ready; read value; printf first > a.txt','timeout':30}
        first=r.call('exec',args)
        eventually(lambda:r.status(first['id']),lambda row:'output' in row and output(row)==b'ready')
        armed.touch()
        replies,failures=[],[]
        def inspect():
            try:replies.append(r.call('task',{'action':'inspect','taskId':task['taskId'],'before':1,'limit':1}))
            except BaseException as error:failures.append(error)
        caller=threading.Thread(target=inspect,daemon=True); caller.start()
        try:
            eventually(lambda:marker.exists(),bool,seconds=8)
            started=time.monotonic()
            self.assertEqual(r.call('find',{'label':'Original'})['matches'][0]['busyOperationId'],first['id'])
            r.call('workspace',{'action':'create','requestId':'independent','name':'Useful unrelated work'})
            self.assertLess(time.monotonic()-started,3)
            r.call('operation',{'action':'stdin','requestId':'finish-first','operationId':first['id'],
                'sequence':0,'text':'go\n','eof':True})
            done=r.terminal(first['id'])
            second=r.call('exec',{'requestId':'second','taskId':task['taskId'],'expected':done['result']['checkpoint'],
                'command':'printf ready; read value','timeout':30})
            eventually(lambda:r.status(second['id']),lambda row:'output' in row and output(row)==b'ready')
        finally:
            release.touch(); caller.join(timeout=10)
        self.assertFalse(caller.is_alive())
        self.assertFalse(failures,failures)
        current,=replies
        self.assertEqual(current['operations'],[])
        self.assertEqual(current['task']['checkpoint'],done['result']['checkpoint'])
        self.assertEqual(current['task']['busy'],second['id'])
        self.assertEqual(current['active']['id'],second['id'])
        self.assertFalse(current['mutationReady'])
        self.assertLessEqual(int(current['observation']['startedAtNs']),int(current['observation']['observedAtNs']))
        r.call('operation',{'action':'stdin','requestId':'finish-second','operationId':second['id'],
            'sequence':0,'text':'go\n','eof':True})
        r.terminal(second['id'])

    def test_revoked_project_policy_preserves_unavailable_qualified_pending_name(self):
        r=self.runtime
        policy={'kind':'github','owner':'Example','allowCreate':True,
            'managedRefNamespace':'refs/heads/managed/','validation':'true'}
        r.config['projectPolicies']={'cloud':policy}
        r.config['principals']['alice']['projectPolicies']=['cloud']
        r.save_config()
        import hashlib
        authority=hashlib.sha256(json.dumps({'kind':'github','root':None,'owner':'Example'},
            sort_keys=True,separators=(',',':')).encode()).hexdigest()
        self.seed('pending-cloud',{'input':{'action':'create','policy':'cloud','name':'Pending'},
            'authority':authority},kind='project',repo=None)
        before=self.sql('SELECT * FROM operation')
        self.assertEqual(r.call('find',{'project':'Example/Pending'})['resolution'],'unique')
        r.config['principals']['alice']['projectPolicies']=[]
        r.save_config()
        denied=r.call('find',{'project':'Example/Pending'})
        self.assertEqual((denied['resolution'],denied['unavailableMatches']),('unavailable',1))
        self.assertEqual((denied['matches'],denied['pending']),([],[]))
        self.assertEqual(self.sql('SELECT * FROM operation'),before)
