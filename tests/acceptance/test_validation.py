"""Exact source validation and publication through implementation-independent HTTP."""
import base64
from concurrent.futures import ThreadPoolExecutor
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, git


class ValidationTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime(request_timeout_seconds=40)
        self.addCleanup(self.runtime.close)
        self.task = self.runtime.open()
        self.validators = {t['name']: jsonschema.Draft202012Validator(
            {**t['outputSchema'], '$defs': CONTRACT['$defs']}) for t in CONTRACT['x-tools']}

    def call(self, tool, args, **options):
        result = self.runtime.call(tool, args, **options)
        self.validators['tdev_' + tool].validate({'ok':True,'result':result})
        return result

    def error(self, tool, args, code):
        reply = self.runtime.request('tools/call', {'name':'tdev_'+tool,
            'arguments':{'request':args}})[2]['result']['structuredContent']
        self.validators['tdev_' + tool].validate(reply)
        if reply['ok']:
            operation=reply['result']
            self.assertEqual((operation['status'],operation['effect']),('failed','none'),reply)
            error=operation['error']
        else:
            error=reply['error']
        self.assertEqual(error['code'],code,reply)

    def command(self, command):
        self.runtime.config['repositories']['test']['validation'] = command
        self.runtime.save_config()

    def validate_args(self, request='validate', **fields):
        return {'requestId':request,'taskId':self.task['taskId'],
            'expected':self.task['checkpoint'],'message':'qualified source',**fields}

    def validate(self, request='validate', **fields):
        op = self.call('validate',self.validate_args(request,**fields))
        return self.runtime.terminal(op['id'])

    def publish_args(self, validation, request='publish', **fields):
        return {'requestId':request,'validationId':validation['id'],**fields}

    def test_exact_candidate_outputs_never_import_and_noop_keeps_validation_usable(self):
        r = self.runtime
        evidence = r.root / 'validation-head'
        self.command(f'git rev-parse HEAD > "{evidence}"; printf build > generated; printf tested')
        validation = self.validate(waitMs=5000)
        self.assertEqual(validation['status'],'succeeded',validation)
        candidate = validation['result']['candidate']
        self.assertEqual(evidence.read_text().strip(),candidate)
        self.assertEqual(base64.b64decode(validation['output']['data']),b'tested')
        no_op = self.call('exec',{'requestId':'noop','taskId':self.task['taskId'],
            'expected':self.task['checkpoint'],'command':'true','waitMs':5000})
        self.assertEqual(no_op['result']['checkpoint'],self.task['checkpoint'])
        published = self.call('publish',self.publish_args(validation))
        self.assertEqual((published['status'],published['result']['commit']),('succeeded',candidate),published)
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=r.remote),candidate)
        self.assertEqual(git('rev-list','--parents','-n','1',candidate,cwd=r.remote),candidate+' '+r.head)
        self.assertEqual(git('rev-parse',candidate+'^{tree}',cwd=r.remote),git('rev-parse',r.head+'^{tree}',cwd=r.remote))
        self.assertNotIn('generated',git('ls-tree','-r','--name-only',candidate,cwd=r.remote))
        inspected = self.call('task',{'action':'inspect','taskId':self.task['taskId']})
        self.assertEqual(inspected['task']['closed'],1)
        self.assertIsNone(inspected['task']['busy'])

    def test_source_mutation_deletion_and_mode_change_fail_without_checkpoint_advance(self):
        for i,command in enumerate(['printf changed > a.txt','rm a.txt','chmod +x a.txt']):
            self.command(command)
            validation = self.validate('tamper-'+str(i))
            self.assertEqual(validation['status'],'failed',validation)
            self.error('publish',self.publish_args(validation,'reject-'+str(i)),'VALIDATION_REQUIRED')
            task = self.call('task',{'action':'inspect','taskId':self.task['taskId']})['task']
            self.assertEqual(task['checkpoint'],self.task['checkpoint'])
            self.assertIsNone(task['busy'])
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=self.runtime.remote),self.runtime.head)

    def test_stdout_pass_and_nonzero_exit_never_authorize_publication(self):
        self.command('printf \'{"status":"succeeded","exitCode":0}\'; exit 7')
        validation = self.validate()
        self.assertEqual((validation['status'],validation['result']['exitCode']),('failed',7))
        self.error('publish',self.publish_args(validation),'VALIDATION_REQUIRED')

    def test_policy_change_rejects_but_timeout_default_change_preserves_exact_candidate(self):
        r = self.runtime
        validation = self.validate()
        self.command('test -f b.txt')
        self.error('publish',self.publish_args(validation,'changed'),'POLICY_CHANGED')
        self.command('test -f a.txt')
        validation=self.validate('current-policy')
        r.config['repositories']['test']['validationTimeoutSeconds']=21
        r.save_config()
        self.assertEqual(self.call('publish',self.publish_args(validation))['status'],'succeeded')

    def test_changed_checkpoint_and_wrong_expected_head_cannot_publish(self):
        validation=self.validate()
        self.error('publish',self.publish_args(validation,'wrong',expectedHead='f'*len(self.runtime.head)),'STALE_HEAD')
        validation=self.validate('before-edit')
        edit=self.call('edit',{'requestId':'edit','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
            'edits':[{'action':'replace','path':'a.txt','old':'hello','text':'changed'}]})
        self.assertEqual(edit['status'],'succeeded')
        self.error('publish',self.publish_args(validation),'VALIDATION_SOURCE_CHANGED')

    def test_managed_publication_cleanup_and_real_published_predecessor(self):
        r=self.runtime
        self.task=self.call('task',{'action':'start','requestId':'start','repo':'test'})['result']
        validation=self.validate()
        self.assertEqual(validation['status'],'succeeded',validation)
        published=self.call('publish',self.publish_args(validation,expectedHead=None))
        self.assertEqual(published['status'],'succeeded',published)
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=r.remote),r.head)
        task=self.call('task',{'action':'inspect','taskId':self.task['taskId']})['task']
        self.assertEqual((task['ref_state'],task['published_oid']),('published',validation['result']['candidate']))
        cleanup=self.call('task',{'action':'cleanup','requestId':'cleanup','taskId':self.task['taskId']})
        self.assertEqual(cleanup['status'],'succeeded',cleanup)
        continued=self.call('task',{'action':'start','requestId':'continue','fromTaskId':self.task['taskId']})['result']
        self.assertEqual(continued['checkpoint'],validation['result']['candidate'])

    def test_lost_publication_reply_alias_and_concurrent_duplicates_observe_one_effect(self):
        r=self.runtime
        validation=self.validate()
        args=self.publish_args(validation)
        r.discard_reply('publish',args)
        r.restart()
        original=self.call('publish',args)
        with ThreadPoolExecutor(max_workers=4) as pool:
            aliases=list(pool.map(lambda i:self.call('publish',self.publish_args(validation,'alias-'+str(i))),range(4)))
        self.assertEqual({p['id'] for p in aliases},{original['id']})
        self.assertEqual(self.call('operation',{'action':'status','lookupRequestId':'alias-0'})['id'],original['id'])
        self.error('publish',self.publish_args(validation,'different',expectedHead=r.head),'IDEMPOTENCY_MISMATCH')
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=r.remote),validation['result']['candidate'])

    def test_frozen_timeout_origin_wait_replay_and_explicit_timeout(self):
        r=self.runtime
        args=self.validate_args(waitMs=5000)
        done=self.call('validate',args)
        self.assertEqual((done['execution']['timeout'],done['execution']['timeoutSource']),(20,'repository'))
        r.config['repositories']['test']['validationTimeoutSeconds']=21
        r.save_config()
        self.assertEqual(self.call('validate',{**args,'waitMs':0})['id'],done['id'])
        self.assertEqual(self.runtime.status(done['id'])['execution']['timeout'],20)
        self.error('validate',{**args,'timeout':2},'IDEMPOTENCY_MISMATCH')
        self.command('sleep 20')
        timeout=self.validate('deadline',timeout=1,waitMs=5000)
        self.assertEqual((timeout['status'],timeout['result']['timedOut']),('failed',True),timeout)
        self.assertEqual((timeout['execution']['timeout'],timeout['execution']['timeoutSource']),(1,'request'))

    def test_current_authority_required_for_validation_and_publication_replay(self):
        r=self.runtime
        validation=self.validate()
        published=self.call('publish',self.publish_args(validation))
        r.config['principals']['alice']['repos']={}
        r.save_config()
        self.error('validate',self.validate_args(),'PERMISSION_DENIED')
        self.error('publish',self.publish_args(validation),'PERMISSION_DENIED')
        self.error('operation',{'action':'status','operationId':published['id']},'PERMISSION_DENIED')
        r.config['principals']['alice']['repos']={'test':['refs/heads/main']}
        r.save_config()

    def test_concurrent_new_publication_requests_share_one_original_effect(self):
        validation=self.validate()
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies=list(pool.map(lambda i:self.call('publish',self.publish_args(validation,'new-'+str(i))),range(4)))
        self.assertEqual(len({p['id'] for p in replies}),1,replies)
        original=self.runtime.terminal(replies[0]['id'])
        self.assertEqual(original['status'],'succeeded',original)
        self.assertEqual(git('rev-parse','refs/heads/main',cwd=self.runtime.remote),validation['result']['candidate'])

    def test_wait_progress_stream_observes_validation_and_frozen_default(self):
        r=self.runtime
        r.config['repositories']['test'].pop('validationTimeoutSeconds')
        self.command('sleep 2; test -f a.txt')
        params={'name':'tdev_validate','arguments':{'request':self.validate_args(waitMs=1500)}}
        r.requests.add('validate')
        status,media,reply,data=r.request('tools/call',params,progress='validation-progress')
        self.assertEqual((status,media),(200,'text/event-stream'))
        self.assertIn(b'notifications/progress',data)
        operation=reply['result']['structuredContent']['result']
        self.assertEqual((operation['execution']['timeout'],operation['execution']['timeoutSource']),(300,'default'))
        self.assertEqual(r.terminal(operation['id'])['status'],'succeeded')
