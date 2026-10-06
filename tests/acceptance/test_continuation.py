"""Human-name recovery through HTTP, without provider/executor observation."""
import copy
import unittest

from acceptance.harness import Runtime


class ContinuationTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)

    def start(self, request, label):
        return self.runtime.call('task', {'action':'start','requestId':request,'label':label})['result']

    def test_exact_project_locators_full_unicode_labels_and_no_change(self):
        r = self.runtime
        r.config['repositories']['test']['name'] = 'Straße'
        r.save_config()
        task = self.start('unicode', 'Straße Σς ﬃ ꭰᏸ 로그인')
        for project in ('STRASSE','test',str(r.remote)):
            for label in ('STRASSE','σσ','FFI','ᎠᏰ','로그인'):
                found = r.call('find', {'project':project,'label':label})
                self.assertEqual(found['resolution'],'unique',found)
                self.assertEqual(found['matches'][0]['taskId'],task['taskId'])
        self.assertEqual(r.call('find', {'project':'Stra'})['resolution'],'none')
        again = r.call('find', {'project':'STRASSE','label':'STRASSE',
            'since':r.call('find',{'project':'STRASSE','label':'STRASSE'})['observation']['cursor']})
        self.assertFalse(again['observation']['changed'])
        self.assertEqual(again['observation']['sources'],['retained SQLite state; no executor or provider reconciliation'])

    def test_paged_ambiguity_never_selects_latest_or_final_page(self):
        first = self.start('first','Fix login')
        second = self.start('second','Fix login independently')
        r = self.runtime
        self.assertEqual(r.call('find', {'label':'LOGIN'})['resolution'],'ambiguous')
        page = r.call('find', {'label':'LOGIN','limit':1})
        self.assertEqual((page['resolution'],page['pendingComplete']),('incomplete',False))
        self.assertEqual(page['matches'][0]['taskId'],first['taskId'])
        last = r.call('find', {'label':'LOGIN','limit':1,'after':page['nextAfter']})
        self.assertEqual(last['resolution'],'incomplete')
        self.assertEqual(last['matches'][0]['taskId'],second['taskId'])
        self.assertIsNone(last['nextAfter'])

    def test_closed_work_authority_and_replaced_identity_are_distinct(self):
        r = self.runtime
        task = self.start('retained','completed')
        r.call('task',{'action':'close','requestId':'close','taskId':task['taskId'],'expected':task['checkpoint']})
        r.restart()
        self.assertTrue(r.call('find', {'label':'completed'})['matches'][0]['closed'])
        self.assertEqual(r.call('find',{'state':'open'})['matches'],[])
        r.config['repositories']['test']['identity']='local:replaced'
        r.save_config()
        replaced = r.call('find', {'project':'test','label':'completed'})
        self.assertEqual((replaced['resolution'],replaced['unavailableMatches']),('unavailable',1))
        self.assertEqual(replaced['matches'],[])
        r.config['principals']['alice']['repos']={}
        r.save_config()
        denied = r.call('find', {})
        self.assertEqual((denied['projects'],denied['matches']),([],[]))

    def test_unique_global_label_is_not_ambiguous_merely_because_other_projects_exist(self):
        task=self.start('unique','Unique work')
        r=self.runtime
        r.config['repositories']['other']=copy.deepcopy(r.config['repositories']['test'])
        r.config['repositories']['other']['name']='Different project'
        r.config['principals']['alice']['repos']['other']=['refs/heads/main']
        r.save_config()
        result=r.call('find',{'label':'unique'})
        self.assertEqual(result['resolution'],'unique',result)
        self.assertEqual(result['matches'][0]['taskId'],task['taskId'])

    def test_project_page_and_duplicate_empty_names_remain_incomplete_or_ambiguous(self):
        r = self.runtime
        for i in range(21):
            name = 'copy'+str(i)
            r.config['repositories'][name]=copy.deepcopy(r.config['repositories']['test'])
            r.config['principals']['alice']['repos'][name]=['refs/heads/main']
        r.save_config()
        page = r.call('find', {'project':'Human project','limit':20})
        self.assertEqual((page['resolution'],len(page['projects'])),('incomplete',20))
        for i in range(2,21):
            del r.config['repositories']['copy'+str(i)]
            del r.config['principals']['alice']['repos']['copy'+str(i)]
        r.save_config()
        self.assertEqual(r.call('find', {'project':'Human project'})['resolution'],'ambiguous')

    def test_recent_receipts_are_bounded_and_do_not_inline_results_or_secrets(self):
        r = self.runtime
        task = self.start('history','History')
        checkpoint = task['checkpoint']
        for i in range(10):
            before = checkpoint
            done = r.call('edit',{'requestId':'edit-'+str(i),'taskId':task['taskId'],'expected':checkpoint,
                'edits':[{'action':'put','path':'new'+str(i),'before':None,'content':'private source body'}]})
            checkpoint=done['result']['checkpoint']
        match = r.call('find', {'label':'history'})['matches'][0]
        self.assertEqual(match['checkpoint'],checkpoint)
        self.assertEqual(len(match['recent']),8)
        self.assertFalse(match['recentComplete'])
        self.assertEqual(match['recent'][0]['requestId'],'edit-9')
        self.assertEqual(match['recent'][0]['sourceCheckpoint'],before)
        for receipt in match['recent']:
            self.assertFalse({'result','output','intent','command','env'} & receipt.keys())
        self.assertEqual((match['outstanding'],match['outstandingComplete']),([],True))

    def test_delegated_project_current_display_and_old_remote_locator(self):
        r = self.runtime
        r.config['projectPolicies']={'local':{'kind':'local','root':str(r.root),'allowCreate':True,
            'managedRefNamespace':'refs/heads/managed/','validation':'true'}}
        r.config['principals']['alice']['projectPolicies']=['local']
        r.save_config()
        project=r.call('project',{'action':'connect','requestId':'connect','policy':'local','name':'authored'})['result']
        task=r.call('task',{'action':'start','requestId':'delegated','repo':project['repo'],'label':'Continue here'})['result']
        for locator in ('authored',project['repo'],str(r.work / '.git')):
            result=r.call('find',{'project':locator,'label':'continue'})
            self.assertEqual(result['resolution'],'unique',result)
            self.assertEqual(result['matches'][0]['taskId'],task['taskId'])
