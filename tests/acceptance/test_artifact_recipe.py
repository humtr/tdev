"""Frozen artifact recipe bindings through real HTTP, without implementation imports."""
import hashlib
import json
import unittest

import jsonschema
from acceptance.harness import CONTRACT, Runtime, eventually


def recipe():
    platform={'os':'android','arch':'aarch64','abi':'bionic'}
    return {'format':1,'kind':'files','inputs':['a.txt'],'dependencies':[],
            'build':{'command':'touch MUST-NOT-BUILD','platform':platform,
                     'tools':[{'name':'sh','sha256':'a'*64}]},'exports':['dist'],'target':platform}


def digest(value):
    if not isinstance(value,bytes):
        value=json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode()
    return hashlib.sha256(value).hexdigest()


class ArtifactRecipeTest(unittest.TestCase):
    def setUp(self):
        self.runtime=Runtime(request_timeout_seconds=45)
        self.addCleanup(self.runtime.close)
        self.task=self.runtime.open()
        self.counter=0
        self.validator=jsonschema.Draft202012Validator({'$defs':CONTRACT['$defs'],'$ref':'#/$defs/ArtifactRecipeInspection'})

    def validated(self,value=None,raw=None,extra=None,wait_seconds=25):
        self.counter+=1
        content=raw if raw is not None else json.dumps(value or recipe())
        edit=self.runtime.call('edit',{'requestId':'recipe-'+str(self.counter),'taskId':self.task['taskId'],
            'expected':self.task['checkpoint'],'edits':[{'action':'put','path':'tdev-package.json','before':None,
                'content':content,'mode':'100644'},*(extra or [])]})
        self.task={**self.task,**edit['result']}
        op=self.runtime.call('validate',{'requestId':'validate-'+str(self.counter),'taskId':self.task['taskId'],
            'expected':self.task['checkpoint'],'message':'package source','waitMs':5000})
        done=eventually(lambda:self.runtime.status(op['id'],waitMs=100),
            lambda row:row['status'] not in ('running','unknown'),seconds=wait_seconds)
        self.assertEqual(done['status'],'succeeded',done)
        return done

    def new_task(self):
        self.counter+=1
        self.task=self.runtime.call('task',{'action':'open','requestId':'fresh-'+str(self.counter),'repo':'test',
            'ref':'refs/heads/main','expectedHead':self.runtime.head})['result']

    def inspect(self,validation,**extra):
        value=self.runtime.call('artifact',{'action':'inspectRecipe','validationId':validation['id'],**extra})
        self.validator.validate(value)
        self.assertEqual(value['bindingDigest'],digest({k:v for k,v in value.items() if k!='bindingDigest'}))
        return value

    def error(self,validation,code,**extra):
        args={'action':'inspectRecipe','validationId':validation['id'],**extra}
        reply=self.runtime.request('tools/call',{'name':'tdev_artifact','arguments':{'request':args}})[2]['result']['structuredContent']
        self.assertFalse(reply['ok'],reply)
        if isinstance(code,tuple): self.assertIn(reply['error']['code'],code,reply)
        else: self.assertEqual(reply['error']['code'],code,reply)
        return reply['error']

    def test_frozen_source_binding_survives_edit_close_restart_and_admission_fence(self):
        validation=self.validated()
        original=self.inspect(validation)
        self.assertEqual(original['candidate'],validation['result']['candidate'])
        self.assertEqual(original['source']['recipeDigest'],digest(json.dumps(recipe()).encode()))
        self.assertEqual(original['source']['inputs']['a.txt'],{'mode':'100644','sha256':digest(b'hello\n'),'size':6})
        self.assertFalse(original['buildExecuted'])
        r=self.runtime
        before=r.call('task',{'action':'inspect','taskId':self.task['taskId']})['operations']
        self.inspect(validation)
        self.assertEqual(r.call('task',{'action':'inspect','taskId':self.task['taskId']})['operations'],before)
        edit=r.call('edit',{'requestId':'later','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
            'edits':[{'action':'replace','path':'a.txt','old':'hello','text':'later'}]})
        self.assertEqual(self.inspect(validation),original)
        r.call('task',{'action':'close','requestId':'close','taskId':self.task['taskId'],'expected':edit['result']['checkpoint']})
        self.assertEqual(self.inspect(validation),original)
        r.restart();self.assertEqual(self.inspect(validation),original)
        (r.state/'maintenance.json').write_text('{}')
        self.assertEqual(self.inspect(validation),original)
        self.assertFalse(list(r.root.rglob('MUST-NOT-BUILD')))

    def test_current_authority_identity_and_source_policy_precede_recipe_read(self):
        validation=self.validated();r=self.runtime;cfg=r.config['repositories']['test']
        original=self.inspect(validation)
        cfg['validationTimeoutSeconds']=23;r.save_config();self.assertEqual(self.inspect(validation),original)
        cfg['validation']='test -f b.txt';r.save_config();self.error(validation,'VALIDATION_POLICY_CHANGED')
        cfg['validation']='test -f a.txt';identity=cfg['identity'];cfg['identity']+='-replaced';r.save_config()
        self.error(validation,'REPOSITORY_IDENTITY');cfg['identity']=identity
        grants=r.config['principals']['alice']['repos'];r.config['principals']['alice']['repos']={};r.save_config()
        self.error(validation,'PERMISSION_DENIED');r.config['principals']['alice']['repos']=grants;r.save_config()
        self.assertEqual(self.inspect(validation),original)

    def test_artifact_policy_is_adopted_and_only_changes_binding_identity(self):
        validation=self.validated();r=self.runtime;cfg=r.config['repositories']['test'];original=self.inspect(validation)
        cfg['artifactValidation']='test -f package';r.save_config();changed=self.inspect(validation)
        self.assertNotEqual(changed['artifactPolicy'],original['artifactPolicy'])
        self.assertNotEqual(changed['bindingDigest'],original['bindingDigest'])
        for key in ('source','sourcePolicy','recipe','candidate'):self.assertEqual(changed[key],original[key])
        del cfg['artifactValidation'];r.save_config();self.assertEqual(self.inspect(validation),original)
        self.error(validation,'SCHEMA',artifactPolicy=original['artifactPolicy'])
        self.error(validation,'SCHEMA',command='true')

    def test_missing_symlink_and_unsafe_recipe_input_are_rejected(self):
        value=recipe();value['inputs']=['absent'];validation=self.validated(value)
        self.error(validation,'ARTIFACT_INPUT_MISSING')
        self.error(validation,'ARTIFACT_RECIPE_MISSING',path='missing.json')
        self.error(validation,('PATH','ARTIFACT_PATH'),path='../tdev-package.json')
        r=self.runtime
        # One fresh task avoids replacing an existing recipe with an absent-before witness.
        self.new_task();value=recipe();value['inputs']=['link']
        validation=self.validated(value,extra=[{'action':'put','path':'link','before':None,'content':'a.txt','mode':'120000'}])
        self.error(validation,'ARTIFACT_INPUT_MISSING');self.error(validation,'ARTIFACT_RECIPE_MISSING',path='link')

    def test_duplicate_recipe_keys_and_extra_policy_fields_fail_on_original_git_bytes(self):
        raw=json.dumps(recipe()).replace('"format": 1','"format": 1, "format": 1',1)
        validation=self.validated(raw=raw);self.error(validation,'ARTIFACT_RECIPE_JSON')
        self.new_task();value=recipe();value['artifactValidation']='true'
        validation=self.validated(value);self.error(validation,'ARTIFACT_SCHEMA')

    def test_execution_and_failed_validation_cannot_supply_a_recipe_binding(self):
        r=self.runtime
        op=r.call('exec',{'requestId':'fake','taskId':self.task['taskId'],'expected':self.task['checkpoint'],
            'command':'printf \'{"exitCode":0,"stopped":true}\'','waitMs':5000})
        r.terminal(op['id']);self.error(op,'VALIDATION_REQUIRED')
        r.config['repositories']['test']['validation']='exit 7';r.save_config()
        op=r.call('validate',{'requestId':'failed','taskId':self.task['taskId'],'expected':self.task['checkpoint'],'message':'failed','waitMs':5000})
        r.terminal(op['id']);self.error(op,'VALIDATION_REQUIRED')

    def test_delegated_artifact_policy_is_reread_and_override_removal_restores_binding(self):
        r=self.runtime
        r.config['projectPolicies']={'local':{'kind':'local','root':str(r.root),'allowCreate':True,
            'managedRefNamespace':'refs/heads/managed/','validation':'true'}}
        r.config['principals']['alice']['projectPolicies']=['local'];r.save_config()
        project=r.call('project',{'action':'connect','requestId':'connect','policy':'local','name':'authored'})['result']
        self.task=r.call('task',{'action':'start','requestId':'delegated','repo':project['repo']})['result']
        validation=self.validated();original=self.inspect(validation)
        policy=r.config['projectPolicies']['local'];policy['artifactValidation']='test -f dist/package';r.save_config()
        changed=self.inspect(validation)
        self.assertEqual(changed['source'],original['source']);self.assertEqual(changed['sourcePolicy'],original['sourcePolicy'])
        self.assertNotEqual(changed['artifactPolicy'],original['artifactPolicy'])
        del policy['artifactValidation'];r.save_config();self.assertEqual(self.inspect(validation),original)
        r.config['principals']['alice']['projectPolicies']=[];r.save_config()
        try:self.error(validation,'PERMISSION_DENIED')
        finally:r.config['principals']['alice']['projectPolicies']=['local'];r.save_config()
