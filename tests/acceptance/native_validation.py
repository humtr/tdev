"""Real controller death and durable gaps in candidate and ref publication ownership."""
import http.client
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import threading
import unittest

from acceptance.harness import Runtime, eventually, git
from acceptance import test_validation as assertions


class NativeValidationTest(unittest.TestCase):
    call=assertions.ValidationTest.call
    error=assertions.ValidationTest.error
    command=assertions.ValidationTest.command
    validate_args=assertions.ValidationTest.validate_args
    validate=assertions.ValidationTest.validate
    publish_args=assertions.ValidationTest.publish_args
    setUp=assertions.ValidationTest.setUp

    def sql(self, statement, args=()):
        db=sqlite3.connect(self.runtime.state/'state.sqlite')
        try:
            with db:
                return db.execute(statement,args).fetchall()
        finally:
            db.close()

    def barrier(self, phase):
        r=self.runtime
        r.stop()
        directory=r.root/'utilities'
        directory.mkdir(mode=0o700)
        self.marker,self.release,self.done,self.calls=[r.root/name for name in ('gap','release','done','effects')]
        wrapper=directory/'git'
        wrapper.write_text('#!'+sys.executable+'\nimport os,subprocess,sys,time\nfrom pathlib import Path\n'+
            f'real={shutil.which("git")!r}; phase={phase!r}; marker=Path({str(self.marker)!r}); release=Path({str(self.release)!r}); done=Path({str(self.done)!r}); calls=Path({str(self.calls)!r})\n'+
            'args=sys.argv[1:]; mutating="update-ref" in args and "-d" not in args and "refs/heads/main" in args\n'+
            'candidate="commit-tree" in args\n'+
            'if mutating:\n with calls.open("a") as f: f.write("effect\\n")\n'+
            'blocked=(phase in ("before","after") and mutating) or (phase == "candidate" and candidate)\n'+
            'code=None\n'+
            'if phase == "after" and blocked: code=subprocess.call([real,*args])\n'+
            'if blocked and not marker.exists():\n marker.write_text(str(os.getpid()))\n end=time.monotonic()+25\n while not release.exists() and time.monotonic()<end: time.sleep(.02)\n done.touch()\n'+
            'if phase == "before" and mutating: sys.exit(129)\n'+
            'if code is not None: sys.exit(code)\n'+
            'os.execv(real,[real,*args])\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH']=str(directory)+os.pathsep+os.environ['PATH']
        r.start()

    def interrupt(self, tool, args):
        self.responses,self.failures=[],[]
        def call():
            try:self.responses.append(self.call(tool,args))
            except (ConnectionError,http.client.HTTPException):pass
            except BaseException as error:self.failures.append(error)
        caller=threading.Thread(target=call,daemon=True)
        caller.start()
        eventually(self.marker.exists,bool,seconds=20)
        self.runtime.stop()
        self.release.touch()
        caller.join(timeout=8)
        eventually(self.done.exists,bool,seconds=8)
        self.assertFalse(caller.is_alive())
        self.assertFalse(self.failures,self.failures)
        self.runtime.start()

    def test_candidate_construction_death_never_rebuilds_or_launches(self):
        r=self.runtime
        launch=r.root/'launched'
        self.command(f'printf once > "{launch}"')
        self.barrier('candidate')
        args=self.validate_args()
        self.interrupt('validate',args)
        replay=self.call('validate',args)
        self.assertEqual((replay['status'],replay['effect']),('unknown','unknown'),replay)
        self.assertFalse(launch.exists())
        self.assertFalse((r.state/'jobs'/replay['id']).exists())
        self.assertEqual(self.sql('SELECT busy FROM task')[0][0],replay['id'])
        r.requests.discard(args['requestId']) # No job/child was dispatched; private commit utility completed above.

    def test_death_before_ref_effect_keeps_old_head_unknown_writer_and_never_resends(self):
        r=self.runtime
        validation=self.validate()
        self.barrier('before')
        args=self.publish_args(validation)
        self.interrupt('publish',args)
        replay=self.call('publish',args)
        self.assertEqual((replay['status'],replay['effect']),('unknown','unknown'),replay)
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=r.remote),r.head)
        self.assertEqual(self.calls.read_text().splitlines(),['effect'])
        alias=self.call('publish',self.publish_args(validation,'alias'))
        self.assertEqual(alias['id'],replay['id'])
        self.assertEqual(self.calls.read_text().splitlines(),['effect'])
        self.error('edit',{'requestId':'blocked','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
            'edits':[{'action':'put','path':'blocked','content':'no','before':None}]},'TASK_BUSY')
        self.assertEqual(self.sql('SELECT busy FROM task')[0][0],replay['id'])

    def test_death_after_ref_effect_recovers_original_candidate_and_atomic_close(self):
        r=self.runtime
        validation=self.validate()
        self.barrier('after')
        args=self.publish_args(validation)
        self.interrupt('publish',args)
        replay=self.call('publish',args)
        self.assertEqual((replay['status'],replay['effect']),('succeeded','committed'),replay)
        self.assertEqual(replay['result']['commit'],validation['result']['candidate'])
        self.assertEqual(self.sql('SELECT closed,busy,checkpoint FROM task')[0],(1,None,self.task['checkpoint']))
        self.assertEqual(self.calls.read_text().splitlines(),['effect'])
        r.restart()
        self.assertEqual(self.call('publish',args),replay)

    def test_sql_completion_failure_reconciles_published_head_without_second_dispatch(self):
        validation=self.validate()
        self.sql("CREATE TRIGGER reject_publish_completion BEFORE UPDATE OF status ON operation WHEN NEW.kind='publish' AND NEW.status='succeeded' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        args=self.publish_args(validation)
        self.error('publish',args,'PUBLICATION_UNKNOWN')
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=self.runtime.remote),validation['result']['candidate'])
        self.sql('DROP TRIGGER reject_publish_completion')
        self.runtime.restart()
        recovered=self.call('publish',args)
        self.assertEqual(recovered['status'],'succeeded',recovered)
        self.assertEqual(self.sql('SELECT closed,busy FROM task')[0],(1,None))

    def test_unrelated_new_ref_cannot_prove_publication_and_descendant_can(self):
        r=self.runtime
        validation=self.validate()
        published=self.call('publish',self.publish_args(validation))
        self.sql("UPDATE operation SET status='unknown',effect='unknown',result=NULL WHERE id=?",(published['id'],))
        self.sql('UPDATE task SET busy=?,closed=0 WHERE id=?',(published['id'],self.task['taskId']))
        git('update-ref','refs/heads/main',r.head,cwd=r.remote)
        unknown=r.status(published['id'])
        self.assertEqual(unknown['status'],'unknown')
        candidate=validation['result']['candidate']
        tree=git('rev-parse',candidate+'^{tree}',cwd=r.remote)
        # A real descendant under the enrolled no-rewrite/no-delete policy proves retention.
        import subprocess
        env=os.environ.copy()
        env.update(GIT_AUTHOR_NAME='Fixture',GIT_AUTHOR_EMAIL='fixture@localhost',
                   GIT_COMMITTER_NAME='Fixture',GIT_COMMITTER_EMAIL='fixture@localhost')
        descendant=subprocess.check_output(['git','--git-dir='+str(r.remote),'commit-tree',tree,'-p',candidate],input=b'next',env=env).decode().strip()
        git('update-ref','refs/heads/main',descendant,cwd=r.remote)
        recovered=r.status(published['id'])
        self.assertEqual((recovered['status'],recovered['result']['commit']),('succeeded',candidate),recovered)

    def test_forged_capture_binding_cannot_validate_even_with_zero_exit(self):
        r=self.runtime
        done=self.validate()
        job=r.state/'jobs'/done['id']
        capture=json.loads((job/'capture.json').read_text())
        capture['digest']='f'*64
        (job/'capture.json').write_text(json.dumps(capture))
        self.sql("UPDATE operation SET status='running',effect='unknown',result=NULL WHERE id=?",(done['id'],))
        self.sql('UPDATE task SET busy=? WHERE id=?',(done['id'],self.task['taskId']))
        r.restart()
        rejected=r.terminal(done['id'])
        self.assertEqual((rejected['status'],rejected['error']['code']),('failed','CAPTURE_IDENTITY'),rejected)
        self.error('publish',self.publish_args(rejected),'VALIDATION_REQUIRED')

    def test_sha256_candidate_and_publication_after_restart(self):
        self.runtime=Runtime(object_format='sha256')
        self.addCleanup(self.runtime.close)
        self.task=self.runtime.open()
        validation=self.validate()
        self.runtime.restart()
        published=self.call('publish',self.publish_args(validation,expectedHead=self.runtime.head))
        self.assertEqual((published['status'],len(published['result']['commit'])),('succeeded',64),published)

    def test_validation_worker_survives_controller_restart_and_cancel_uses_original_job(self):
        r=self.runtime
        marker=r.root/'launches'
        self.command(f'printf once >> "{marker}"; sleep 2')
        args=self.validate_args()
        operation=self.call('validate',args)
        eventually(marker.exists,bool)
        r.restart()
        done=r.terminal(operation['id'])
        self.assertEqual(done['status'],'succeeded',done)
        self.assertEqual(marker.read_text(),'once')
        self.assertEqual(self.call('validate',args)['id'],done['id'])
        self.command('sleep 20')
        running=self.call('validate',self.validate_args('cancelled'))
        cancel=self.call('operation',{'action':'cancel','requestId':'cancel','operationId':running['id']})
        self.assertIn(cancel['status'],('running','succeeded'))
        cancelled=r.terminal(running['id'])
        self.assertEqual(cancelled['status'],'cancelled',cancelled)
        self.error('publish',self.publish_args(cancelled),'VALIDATION_REQUIRED')

    def test_large_validation_admits_immediately_and_publishes_the_same_candidate(self):
        r=self.runtime
        r.request_timeout_seconds=180
        with (r.work/'large.bin').open('wb') as stream:stream.truncate(181403679)
        git('add','large.bin',cwd=r.work)
        git('commit','-m','large source',cwd=r.work)
        head=git('rev-parse','HEAD',cwd=r.work)
        git('push',str(r.remote),'HEAD:refs/heads/main',cwd=r.work)
        r.config['artifactLimits']={'workingBytes':2147483648}
        r.save_config()
        self.task=self.call('task',{'action':'open','requestId':'large','repo':'test','ref':'refs/heads/main','expectedHead':head})['result']
        import time
        started=time.monotonic()
        accepted=self.call('validate',self.validate_args(waitMs=0))
        self.assertLess(time.monotonic()-started,2,accepted)
        done=eventually(lambda:r.status(accepted['id']),lambda v:v['status'] not in ('running','unknown'),seconds=180)
        self.assertEqual(done['status'],'succeeded',done)
        published=self.call('publish',self.publish_args(done))
        self.assertEqual((published['status'],published['result']['commit']),('succeeded',done['result']['candidate']),published)
        self.assertEqual(git('cat-file','-s',done['result']['candidate']+':large.bin',cwd=r.remote),'181403679')
        self.assertLess(len(self.sql('SELECT intent FROM operation WHERE id=?',(done['id'],))[0][0]),8192)
        self.call('operation',{'action':'retire','requestId':'retire','operationId':done['id']})
        self.assertFalse((r.state/'jobs'/done['id']/'work').exists())

    def test_validation_prelaunch_working_budget_names_configured_and_observed_values(self):
        r=self.runtime
        marker=r.root/'must-not-run'
        r.config['artifactLimits']={'workingBytes':1}
        self.command(f'touch "{marker}"')
        done=self.validate()
        self.assertEqual(done['status'],'failed',done)
        self.assertEqual(done['error']['code'],'EXECUTION_LIMIT',done)
        self.assertIn('budget=workingBytes configured=1 observed=',done['error']['message'])
        self.assertFalse(marker.exists())
        self.assertIsNone(self.sql('SELECT busy FROM task')[0][0])


class GithubPublicationTest(unittest.TestCase):
    call=assertions.ValidationTest.call
    error=assertions.ValidationTest.error
    validate_args=assertions.ValidationTest.validate_args
    validate=assertions.ValidationTest.validate
    publish_args=assertions.ValidationTest.publish_args

    def setUp(self):
        assertions.ValidationTest.setUp(self)
        from acceptance.github_fixture import GithubFixture
        self.provider=GithubFixture(self.runtime)
        project=self.call('project',{'action':'connect','requestId':'connect','policy':'cloud','name':'Repo'})['result']
        self.task=self.call('task',{'action':'start','requestId':'managed','repo':project['repo']})['result']

    def test_exact_nonforce_push_hook_and_credentials_stay_in_controller_transport(self):
        validation=self.validate()
        published=self.call('publish',self.publish_args(validation))
        self.assertEqual(published['status'],'succeeded',published)
        pushes=[c for c in self.provider.calls() if c['kind']=='git' and 'push' in c['args']]
        self.assertEqual(len(pushes),1)
        self.assertFalse(any(a.startswith('--force') for a in pushes[0]['args']))
        self.assertTrue(any(a.startswith('core.hooksPath=') for a in pushes[0]['args']))
        self.assertTrue(pushes[0]['credential'])
        self.assertEqual(git('rev-parse',self.task['ref'],cwd=self.runtime.remote),validation['result']['candidate'])
        self.assertNotIn('fixture-controller-secret',json.dumps(published))
        self.assertNotIn('fixture-controller-secret',(self.runtime.state/'jobs'/validation['id']/'request.json').read_text())

    def test_advertised_head_race_refuses_create_without_force_and_preserves_unknown(self):
        validation=self.validate()
        self.provider.state['git_race']=self.runtime.head
        self.provider.save()
        published=self.call('publish',self.publish_args(validation))
        self.assertEqual((published['status'],published['effect']),('unknown','unknown'),published)
        self.assertEqual(git('rev-parse',self.task['ref'],cwd=self.runtime.remote),self.runtime.head)
        self.runtime.restart()
        self.assertEqual(self.call('publish',self.publish_args(validation))['status'],'unknown')
        pushes=[c for c in self.provider.calls() if c['kind']=='git' and 'push' in c['args']]
        self.assertEqual(len(pushes),1)

    def test_controller_death_after_nonforce_push_observes_once(self):
        validation=self.validate()
        p,r=self.provider,self.runtime
        p.state['git_gap']='after-publish'
        p.save()
        failures=[]
        def call():
            try:self.call('publish',self.publish_args(validation))
            except (ConnectionError,http.client.HTTPException):pass
            except BaseException as error:failures.append(error)
        caller=threading.Thread(target=call,daemon=True)
        caller.start()
        eventually(p.marker.exists,bool,seconds=20)
        r.stop()
        p.release.touch()
        caller.join(timeout=8)
        eventually(p.done.exists,bool,seconds=8)
        self.assertFalse(caller.is_alive())
        self.assertFalse(failures,failures)
        r.start()
        recovered=self.call('publish',self.publish_args(validation))
        self.assertEqual(recovered['status'],'succeeded',recovered)
        pushes=[c for c in p.calls() if c['kind']=='git' and 'push' in c['args']]
        self.assertEqual(len(pushes),1)
