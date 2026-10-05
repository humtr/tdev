"""SQLite/spool gaps and native execution boundaries without product fault switches."""
import base64
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import time
import unittest

from acceptance.harness import Runtime, eventually


class NativeExecutionTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime(request_timeout_seconds=40)
        self.addCleanup(self.runtime.close)
        self.task = self.runtime.open()

    def execute(self, request, command, **fields):
        return self.runtime.call('exec', {'requestId': request, 'taskId': self.task['taskId'],
            'expected': self.task['checkpoint'], 'command': command, **fields})

    def sql(self, statement, args=()):
        db = sqlite3.connect(self.runtime.state / 'state.sqlite')
        try:
            with db:
                return db.execute(statement, args).fetchall()
        finally:
            db.close()

    def intent(self, operation):
        return json.loads(self.sql('SELECT intent FROM operation WHERE id=?', (operation,))[0][0])

    def error(self, tool, args, code):
        reply = self.runtime.request('tools/call', {'name': 'tdev_' + tool,
                'arguments': {'request': args}})[2]['result']['structuredContent']
        self.assertFalse(reply['ok'], reply)
        self.assertEqual(reply['error']['code'], code, reply)
        return reply

    def reset_args(self, request='reset'):
        return {'action': 'resetEnvironment', 'requestId': request, 'taskId': self.task['taskId'],
                'expected': self.task['checkpoint']}

    def fixture_reset(self, request, renamed=False):
        r = self.runtime
        args = self.reset_args(request)
        fingerprint = hashlib.sha256(json.dumps({'kind': 'task', 'input': args},
            sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        intent = {'input': args, 'identity': r.config['repositories']['test']['identity'],
                  'construction': 'native-environment-reset'}
        self.sql("INSERT INTO operation(id,owner,request,hash,kind,task,status,effect,intent) VALUES(?,'alice',?,?,'task',?,'running','none',?)",
                 (request, request, fingerprint, self.task['taskId'], json.dumps(intent)))
        self.sql('UPDATE task SET busy=? WHERE id=?', (request, self.task['taskId']))
        directory = r.state / 'environments' / self.task['taskId']
        records = r.state / 'environments/.resets'
        records.mkdir(mode=0o700, exist_ok=True)
        st = directory.stat()
        (records / (request + '.json')).write_text(json.dumps({'operation': request,
            'task': self.task['taskId'], 'directory': [st.st_dev, st.st_ino]}))
        if renamed:
            directory.rename(records / request)
        return args, directory, records / request

    def test_controller_sigkill_observes_original_worker_without_second_command(self):
        r = self.runtime
        marker = r.root / 'launches'
        args = {'requestId': 'survivor', 'taskId': self.task['taskId'],
            'expected': self.task['checkpoint'],
            'command': f'printf once >> "{marker}"; sleep 1; printf captured > a.txt', 'timeout': 10}
        op = r.call('exec', args)
        eventually(lambda: marker.exists(), bool)
        r.restart()
        done = r.terminal(op['id'])
        self.assertEqual(done['status'], 'succeeded', done)
        self.assertEqual(r.call('exec', args)['id'], op['id'])
        self.assertEqual(marker.read_text(), 'once')
        self.assertNotEqual(done['result']['checkpoint'], self.task['checkpoint'])

    def test_missing_preparation_never_dispatches_on_replay(self):
        r = self.runtime
        original = self.execute('original', 'true', waitMs=5000)
        intent = self.intent(original['id'])
        args = {'requestId': 'gap', 'taskId': self.task['taskId'], 'expected': self.task['checkpoint'],
                'command': 'printf must-not-run > forbidden'}
        intent['input'] = args
        intent['request']['command'] = args['command']
        intent.pop('jobDigest')
        fingerprint = hashlib.sha256(json.dumps({'kind': 'exec', 'input': args},sort_keys=True,separators=(',',':')).encode()).hexdigest()
        self.sql("INSERT INTO operation(id,owner,request,hash,kind,task,status,effect,intent) VALUES('gap','alice','gap',?,'exec',?,'running','none',?)",(fingerprint,self.task['taskId'],json.dumps(intent)))
        self.sql("UPDATE task SET busy='gap' WHERE id=?",(self.task['taskId'],))
        r.restart()
        replay = r.call('exec', args)
        self.assertEqual((replay['status'], replay['effect']), ('unknown','unknown'))
        self.assertFalse((r.state / 'jobs/gap').exists())
        self.assertEqual(self.sql('SELECT busy,checkpoint FROM task')[0], ('gap',self.task['checkpoint']))
        r.requests.discard('gap')  # Deliberately absent job: no fixture child was dispatched.

    def test_dead_supervisor_unknown_blocks_reset_without_blocking_source_edit(self):
        r = self.runtime
        process = self.execute('unknown', 'exec sleep 30', mode='process')
        job = r.state / 'jobs' / process['id']
        worker = eventually(lambda: json.loads((job / 'worker.json').read_text()) if (job / 'worker.json').exists() else None, bool)
        child = eventually(lambda: json.loads((job / 'child.json').read_text()) if (job / 'child.json').exists() else None, bool)
        os.kill(worker['value']['pid'], signal.SIGKILL)
        try:
            unknown = eventually(lambda: r.status(process['id']),lambda v:v['status']=='unknown')
            self.assertEqual(unknown['effect'], 'unknown')
            self.error('task', self.reset_args(), 'ENVIRONMENT_BUSY')
            changed = r.call('edit', {'requestId':'edit','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'edits':[{'action':'replace','path':'a.txt','old':'hello','text':'changed'}]})
            self.assertEqual(changed['status'], 'succeeded')
            r.restart()
            self.assertEqual(r.status(process['id'])['status'],'unknown')
            self.assertFalse((job / 'result.json').exists())
        finally:
            try: os.kill(child['value']['pid'], signal.SIGKILL)
            except ProcessLookupError: pass
            pid = child['value']['pid']
            eventually(lambda: not Path(f'/proc/{pid}/stat').exists() or Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].startswith('Z '), bool)
            r.requests.discard('unknown')  # Sole exec-sleep child explicitly stopped above; API record stays unknown.

    def test_stdin_spool_acceptance_recovers_missing_sqlite_completion_once(self):
        r = self.runtime
        process = self.execute('input','cat',mode='process',timeout=10)
        args = {'action':'stdin','requestId':'send','operationId':process['id'],'sequence':0,'text':'one','eof':True}
        accepted = r.call('operation',args)
        done = r.terminal(process['id'])
        self.sql("UPDATE operation SET status='running',effect='none',result=NULL WHERE id=?",(accepted['id'],))
        r.restart()
        recovered = r.call('operation',args)
        self.assertEqual((recovered['id'],recovered['status']),(accepted['id'],'succeeded'))
        self.assertEqual(base64.b64decode(r.status(process['id'])['output']['data']),b'one')
        self.assertEqual(r.status(accepted['id'])['result']['delivery'],'committed')
        self.assertEqual(done['result'],r.status(process['id'])['result'])

    def test_reset_reconciles_both_sides_of_rename_and_survives_closed_task(self):
        r = self.runtime
        for renamed in [False,True]:
            done = self.execute('seed-'+str(renamed),'printf cache > "$TDEV_ENV_DIR/value"',waitMs=5000)
            self.assertEqual(done['status'],'succeeded',done)
            args,directory,trash = self.fixture_reset('reset-'+str(renamed),renamed)
            r.restart()
            op = r.call('task',args)
            self.assertEqual(op['status'],'succeeded',op)
            self.assertFalse(directory.exists())
            self.assertFalse(trash.exists())
            self.assertEqual(self.sql('SELECT busy,checkpoint FROM task')[0],(None,self.task['checkpoint']))
        r.call('task',{'action':'close','requestId':'close','taskId':self.task['taskId'],'expected':self.task['checkpoint']})
        self.assertEqual(r.call('task',self.reset_args('closed'))['status'],'succeeded')
        self.assertEqual(self.sql('SELECT closed FROM task')[0][0],1)

    def test_reset_conflict_preserves_rebuilt_directory_and_original_receipt(self):
        r = self.runtime
        self.execute('seed','true',waitMs=5000)
        args,directory,trash = self.fixture_reset('reset-conflict',True)
        directory.mkdir(mode=0o700)
        (directory/'new').write_text('keep')
        r.restart()
        self.error('task',args,'ENVIRONMENT_RESET_CONFLICT')
        self.assertEqual((directory/'new').read_text(),'keep')
        self.assertTrue(trash.exists())
        self.assertEqual(self.sql('SELECT busy FROM task')[0][0],'reset-conflict')

    def test_process_admission_cap_and_independent_frontier(self):
        r = self.runtime
        processes = [self.execute('process-'+str(i),'sleep 30',mode='process',timeout=30) for i in range(8)]
        try:
            self.error('exec',{'requestId':'overflow','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'command':'true','mode':'process'},'PROCESS_LIMIT')
            frontier = r.call('task',{'action':'inspect','taskId':self.task['taskId'],'limit':1})
            self.assertEqual({p['id'] for p in frontier['processes']},{p['id'] for p in processes})
            self.assertTrue(frontier['mutationReady'])
            self.error('task',self.reset_args(),'ENVIRONMENT_BUSY')
        finally:
            for process in processes:
                r.call('operation',{'action':'cancel','requestId':'cancel-'+process['id'],'operationId':process['id']})
                r.terminal(process['id'])

    def test_capture_rejection_preserves_checkpoint_and_allows_stopped_retirement(self):
        r = self.runtime
        done = self.execute('bad-source','ln -s /outside invalid; printf changed > a.txt',waitMs=5000)
        self.assertEqual((done['status'],done['effect']),('failed','committed'),done)
        self.assertIn('captureError',done['result'])
        self.assertEqual(done['result']['checkpoint'],self.task['checkpoint'])
        self.assertEqual(self.sql('SELECT busy,checkpoint FROM task')[0],(None,self.task['checkpoint']))
        retired = r.call('operation',{'action':'retire','requestId':'retire','operationId':done['id']})
        self.assertEqual(retired['status'],'succeeded',retired)

    def test_current_permissions_gate_replay_status_and_controls(self):
        r = self.runtime
        op = self.execute('permission','sleep .2',timeout=5)
        r.terminal(op['id'])
        r.config['principals']['alice']['repos'] = {}
        r.save_config()
        self.error('operation',{'action':'status','operationId':op['id']},'PERMISSION_DENIED')
        self.error('exec',{'requestId':'permission','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'command':'sleep .2','timeout':5},'PERMISSION_DENIED')
        self.error('operation',{'action':'cancel','requestId':'cancel','operationId':op['id']},'PERMISSION_DENIED')
        r.config['principals']['alice']['repos'] = {'test':['refs/heads/main']}
        r.save_config()

    def test_working_budget_is_frozen_and_separate_from_source(self):
        r = self.runtime
        r.config['artifactLimits'] = {'workingBytes':1}
        r.save_config()
        done = self.execute('small','printf must-not-run',waitMs=5000)
        self.assertEqual(done['status'],'failed',done)
        self.assertIn('budget=workingBytes configured=1 observed=',done['error']['message'])
        self.assertEqual(base64.b64decode(done['output']['data']),b'')
        self.assertEqual(self.intent(done['id'])['request']['working_bytes'],1)
        r.config['artifactLimits']['workingBytes'] = 2147483648
        r.save_config()
        replay = r.call('exec',{'requestId':'small','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'command':'printf must-not-run','waitMs':0})
        self.assertEqual(replay['result'],done['result'])
        self.assertEqual(self.execute('large','true',waitMs=5000)['status'],'succeeded')

    def test_stdin_sequence_rejection_is_a_known_refusal_and_environment_is_private(self):
        r = self.runtime
        process = self.execute('input','cat',mode='process',timeout=10)
        bad = r.call('operation',{'action':'stdin','requestId':'gap','operationId':process['id'],
                                'sequence':1,'text':'skip'})
        bad = r.terminal(bad['id'])
        self.assertEqual((bad['status'],bad['effect'],bad['error']['code']),('failed','none','STDIN_SEQUENCE'))
        r.call('operation',{'action':'stdin','requestId':'eof','operationId':process['id'],
                           'sequence':0,'text':'','eof':True})
        r.terminal(process['id'])
        self.error('exec',{'requestId':'reserved','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                         'command':'true','env':{'HOME':'/outside'}},'RESERVED_ENV')
        r.config['repositories']['test']['toolingEnvironment'] = {'EXAMPLE':'operator'}
        r.save_config()
        done = self.execute('env','printf "$EXAMPLE:$TDEV_ENV_DIR"',env={'EXAMPLE':'caller'},environment='fresh',waitMs=5000)
        self.assertEqual(base64.b64decode(done['output']['data']),b'caller:')

    def test_unknown_and_forged_stop_evidence_cannot_release_command_writer(self):
        r = self.runtime
        command = self.execute('writer','sleep .2',timeout=5)
        job = r.state/'jobs'/command['id']
        eventually(lambda:(job/'result.json').exists(),bool)
        original = (job/'result.json').read_bytes()
        result = json.loads(original)
        result['digest'] = 'f'*64
        (job/'result.json').write_text(json.dumps(result))
        unknown = r.status(command['id'])
        self.assertEqual((unknown['status'],unknown['effect']),('unknown','unknown'))
        self.assertEqual(self.sql('SELECT busy FROM task')[0][0],command['id'])
        self.error('operation',{'action':'retire','requestId':'retire','operationId':command['id']},'EXECUTION_NOT_STOPPED')
        self.assertTrue((job/'work').exists())
        (job/'result.json').write_bytes(original)  # Restore the original proved-stopped fixture evidence for cleanup.

    def test_dependency_exact_2gib_and_overflow_do_not_change_working_or_source_budget(self):
        r = self.runtime
        self.assertEqual(self.execute('seed','true',waitMs=5000)['status'],'succeeded')
        path = r.state/'environments'/self.task['taskId']/'capacity'
        with path.open('wb') as stream:
            stream.truncate(2147483648)
        admitted = self.execute('dependency-edge','true',waitMs=5000)
        self.assertEqual(admitted['status'],'succeeded',admitted)
        with path.open('r+b') as stream:
            stream.truncate(2147483649)
        overflow = self.execute('dependency-overflow','printf must-not-run',waitMs=5000)
        self.assertEqual(overflow['status'],'failed',overflow)
        self.assertIn('budget=dependencyBytes configured=2147483648 observed=2147483649',overflow['error']['message'])
        self.assertEqual(overflow['output']['availableBytes'],0)
        self.assertEqual(self.execute('fresh','true',environment='fresh',waitMs=5000)['status'],'succeeded')
        self.assertEqual(r.call('task',self.reset_args())['status'],'succeeded')
        self.assertFalse(path.exists())

    def test_173mib_source_reaches_sqlite_capture_and_retirement_without_inline_body(self):
        from acceptance.harness import git
        r = self.runtime
        r.request_timeout_seconds = 180
        with (r.work/'large.bin').open('wb') as stream:
            stream.truncate(181403679)
        git('add','large.bin',cwd=r.work)
        git('commit','-m','large source',cwd=r.work)
        head = git('rev-parse','HEAD',cwd=r.work)
        git('push',str(r.remote),'HEAD:refs/heads/main',cwd=r.work)
        r.config['artifactLimits'] = {'workingBytes':2147483648}
        r.save_config()
        self.task = r.call('task',{'action':'open','requestId':'large-task','repo':'test',
            'ref':'refs/heads/main','expectedHead':head})['result']
        started = time.monotonic()
        done = self.execute('large','printf Y | dd of=large.bin bs=1 count=1 conv=notrunc 2>/dev/null',timeout=60,waitMs=0)
        self.assertLess(time.monotonic()-started,2)
        if done['status'] in ('running','unknown'):
            done = eventually(lambda: r.status(done['id'],waitMs=1000),lambda value:value['status'] not in ('running','unknown'),seconds=360)
        self.assertEqual(done['status'],'succeeded',done)
        self.assertNotEqual(done['result']['checkpoint'],self.task['checkpoint'])
        self.assertLess(len(json.dumps(self.intent(done['id']))),4096)
        read = r.call('read',{'taskId':self.task['taskId'],'queries':[{'action':'file','path':'large.bin','limit':16}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']),b'Y'+b'\0'*15)
        r.restart()
        self.assertEqual(r.status(done['id'])['result'],done['result'])
        retired = r.call('operation',{'action':'retire','requestId':'retire','operationId':done['id']})
        self.assertEqual(retired['status'],'succeeded')
        self.assertFalse((r.state/'jobs'/done['id']/'capture').exists())
        self.assertEqual(self.sql('SELECT checkpoint FROM task WHERE id=?',(self.task['taskId'],))[0][0],done['result']['checkpoint'])

    def test_cwd_preflight_and_log_offsets_do_not_create_unknown_refusals(self):
        r = self.runtime
        args = {'requestId':'cwd','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'command':'true','cwd':'missing'}
        self.error('exec',args,'CWD')
        self.assertEqual(self.sql("SELECT count(*) FROM operation WHERE request='cwd'")[0][0],0)
        done = self.execute('pages','printf abcdef',waitMs=5000)
        first = r.status(done['id'],limit=2)
        self.assertEqual((base64.b64decode(first['output']['data']),first['output']['nextOffset']),(b'ab',2))
        last = r.status(done['id'],offset=first['output']['nextOffset'],limit=4)
        self.assertEqual(base64.b64decode(last['output']['data']),b'cdef')
        huge = 10**100
        empty = r.status(done['id'],offset=huge)
        self.assertEqual((empty['output']['data'],empty['output']['offset'],empty['output']['nextOffset']),('',huge,huge))
        same = r.status(done['id'],offset=huge,since=empty['observation']['cursor'])
        self.assertFalse(same['observation']['changed'])

    def preparation_barrier(self):
        import shutil
        import sys
        r = self.runtime
        r.stop()
        wrappers = r.root/'utilities'
        wrappers.mkdir(mode=0o700)
        markers = r.root/'preparations'
        markers.mkdir(mode=0o700)
        release = r.root/'release'
        self.addCleanup(release.touch)
        real_git = shutil.which('git')
        wrapper = wrappers/'git'
        wrapper.write_text('#!'+sys.executable+'\n' +
            'import os,subprocess,sys,time\nfrom pathlib import Path\n' +
            f'code=subprocess.call([{real_git!r},*sys.argv[1:]])\n' +
            'if "pack-objects" in sys.argv:\n' +
            f' Path({str(markers)!r},str(os.getpid())).touch()\n' +
            ' end=time.monotonic()+20\n' +
            f' while not Path({str(release)!r}).exists() and time.monotonic()<end: time.sleep(.02)\n' +
            'sys.exit(code)\n')
        wrapper.chmod(0o700)
        r.launch_environment['PATH'] = str(wrappers)+os.pathsep+os.environ['PATH']
        r.start()
        return markers,release

    def test_immediate_admission_and_pending_stdin_do_not_wait_for_source_materialization(self):
        r = self.runtime
        markers,release = self.preparation_barrier()
        r.request_timeout_seconds = 2
        started = time.monotonic()
        process = self.execute('preparing','cat',mode='process',timeout=10,stdin='initial\n')
        self.assertLess(time.monotonic()-started,2)
        eventually(lambda:list(markers.iterdir()),bool)
        self.assertEqual(r.status(process['id'])['status'],'running')
        args = {'action':'stdin','requestId':'queued','operationId':process['id'],
                'sequence':0,'text':'later\n','eof':True}
        queued = r.call('operation',args)
        self.assertEqual(queued['status'],'running',queued)
        self.assertEqual(r.call('operation',args)['id'],queued['id'])
        release.touch()
        r.request_timeout_seconds = 40
        done = r.terminal(process['id'])
        self.assertEqual(done['status'],'succeeded',done)
        self.assertEqual(base64.b64decode(done['output']['data']),b'initial\nlater\n')
        self.assertEqual(r.status(queued['id'])['status'],'succeeded')

    def test_bounded_preparation_capacity_rolls_back_the_unaccepted_writer(self):
        r = self.runtime
        tasks = [self.task]
        for index in range(8):
            tasks.append(r.call('task',{'action':'open','requestId':'task-'+str(index),'repo':'test',
                'ref':'refs/heads/main','expectedHead':r.head})['result'])
        markers,release = self.preparation_barrier()
        accepted = []
        for index,task in enumerate(tasks[:8]):
            self.task = task
            accepted.append(self.execute('work-'+str(index),'true'))
        eventually(lambda:len(list(markers.iterdir())),lambda count:count==8)
        self.task = tasks[8]
        fault = self.error('exec',{'requestId':'full','taskId':self.task['taskId'],
            'expected':self.task['checkpoint'],'command':'true'},'EXECUTION_BUSY')
        self.assertIn('budget=executionWork configured=8 observed=9',fault['error']['message'])
        self.assertEqual(self.sql("SELECT count(*) FROM operation WHERE request='full'")[0][0],0)
        self.assertIsNone(self.sql('SELECT busy FROM task WHERE id=?',(self.task['taskId'],))[0][0])
        release.touch()
        for operation in accepted:
            self.assertEqual(r.terminal(operation['id'])['status'],'succeeded')

    def test_preparation_death_preserves_unknown_execution_and_control_without_dispatch(self):
        r = self.runtime
        markers,release = self.preparation_barrier()
        args = {'requestId':'preparing','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
                'command':'printf must-not-run > forbidden'}
        operation = r.call('exec',args)
        eventually(lambda:list(markers.iterdir()),bool)
        control = r.call('operation',{'action':'stdin','requestId':'queued','operationId':operation['id'],
            'sequence':0,'text':'never sent','eof':True})
        self.assertEqual(control['status'],'running')
        r.restart()
        release.touch()
        self.assertEqual(r.call('exec',args)['status'],'unknown')
        self.assertEqual(r.status(control['id'])['status'],'unknown')
        self.assertFalse((r.state/'jobs'/operation['id']).exists())
        self.assertEqual(len(list(markers.iterdir())),1)
        r.requests.discard('preparing')  # The barrier preceded reservation/dispatch; no candidate exists.
        pid = int(next(markers.iterdir()).name)
        eventually(lambda: not Path(f'/proc/{pid}/stat').exists() or Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].startswith('Z '),bool)

    def test_pending_control_capacity_reports_budget_and_keeps_original_acceptance(self):
        r = self.runtime
        markers,release = self.preparation_barrier()
        process = self.execute('pending-controls','cat',mode='process',timeout=10)
        eventually(lambda:list(markers.iterdir()),bool)
        first = None
        for sequence in range(64):
            control = r.call('operation',{'action':'stdin','requestId':'control-'+str(sequence),
                'operationId':process['id'],'sequence':0,'text':'one','eof':True})
            self.assertEqual(control['status'],'running')
            if first is None: first = control
        fault = self.error('operation',{'action':'stdin','requestId':'overflow','operationId':process['id'],
            'sequence':0,'text':'overflow'},'CONTROL_LIMIT')
        self.assertIn('budget=pendingControls configured=64 observed=65',fault['error']['message'])
        self.assertEqual(self.sql("SELECT count(*) FROM operation WHERE request='overflow'")[0][0],0)
        release.touch()
        done = r.terminal(process['id'])
        self.assertEqual(base64.b64decode(done['output']['data']),b'one')
        self.assertEqual(r.status(first['id'])['status'],'succeeded')
