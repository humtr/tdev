"""Current/no-change and actual publication-backed continuation through HTTP."""
import unittest

from acceptance.harness import Runtime, eventually, git, output


class FrontierTest(unittest.TestCase):
    def setUp(self):
        self.runtime=Runtime(request_timeout_seconds=40)
        self.addCleanup(self.runtime.close)

    def test_same_turn_no_change_then_missed_completion_exposes_useful_forward_work(self):
        r=self.runtime
        task=r.open()
        op=r.call('exec',{'requestId':'writer','taskId':task['taskId'],'expected':task['checkpoint'],
            'command':'printf ready; read value; printf completed > a.txt','timeout':20})
        eventually(lambda:r.status(op['id']),lambda row:'output' in row and output(row)==b'ready')
        args={'action':'inspect','taskId':task['taskId'],'limit':1,'before':1}
        first=r.call('task',args)
        self.assertEqual(first['operations'],[])
        self.assertEqual(first['active']['id'],op['id'])
        same=r.call('task',{**args,'since':first['observation']['cursor']})
        self.assertFalse(same['observation']['changed'])
        self.assertGreaterEqual(int(same['observation']['observedAtNs']),int(first['observation']['observedAtNs']))
        self.assertIn('pollAfterMs',same['observation'])
        r.call('operation',{'action':'stdin','requestId':'finish','operationId':op['id'],
            'sequence':0,'text':'go\n','eof':True})
        # Completion is deliberately observed only through this bounded current frontier.
        current=eventually(lambda:r.call('task',{**args,'since':same['observation']['cursor']}),lambda v:v['mutationReady'])
        self.assertTrue(current['observation']['changed'])
        self.assertIsNone(current['active'])
        self.assertEqual(current['operations'],[])
        self.assertNotEqual(current['task']['checkpoint'],task['checkpoint'])
        forward=r.call('edit',{'requestId':'forward','taskId':task['taskId'],'expected':current['task']['checkpoint'],
            'edits':[{'action':'put','path':'next','before':None,'content':'useful forward work'}]})
        self.assertEqual(forward['status'],'succeeded')

    def test_process_frontier_remains_independent_of_closed_task_and_history_page(self):
        r=self.runtime
        task=r.open()
        op=r.call('exec',{'requestId':'process','taskId':task['taskId'],'expected':task['checkpoint'],
            'mode':'process','command':'printf ready; read value; printf discarded > a.txt','timeout':20})
        eventually(lambda:r.status(op['id']),lambda row:'output' in row and output(row)==b'ready')
        r.call('task',{'action':'close','requestId':'close','taskId':task['taskId'],'expected':task['checkpoint']})
        args={'action':'inspect','taskId':task['taskId'],'before':1,'limit':1}
        first=r.call('task',args)
        self.assertTrue(first['task']['closed'])
        self.assertEqual([p['id'] for p in first['processes']],[op['id']])
        self.assertEqual(first['operations'],[])
        r.call('operation',{'action':'stdin','requestId':'finish','operationId':op['id'],
            'sequence':0,'text':'go\n','eof':True})
        r.restart()
        current=eventually(lambda:r.call('task',args),lambda v:not v['processes'] or v['processes'][0]['status']=='succeeded')
        self.assertTrue(current['task']['closed'])
        self.assertFalse(current['mutationReady'])
        self.assertEqual(current['task']['checkpoint'],task['checkpoint'])
        self.assertEqual(r.call('operation',{'action':'retire','requestId':'retire','operationId':op['id']})['status'],'succeeded')

    def test_real_managed_publication_cleanup_find_and_independent_predecessor_work(self):
        r=self.runtime
        original=r.call('task',{'action':'start','requestId':'source','label':'Completed predecessor'})['result']
        validation=r.call('validate',{'requestId':'validate','taskId':original['taskId'],
            'expected':original['checkpoint'],'message':'accepted predecessor'})
        r.terminal(validation['id'])
        publication=r.call('publish',{'requestId':'publish','validationId':validation['id']})
        candidate=publication['result']['commit']
        self.assertEqual(git('--git-dir='+str(r.remote),'rev-parse',original['ref']),candidate)
        r.call('task',{'action':'cleanup','requestId':'cleanup','taskId':original['taskId']})
        r.restart()
        found=r.call('find',{'project':'Human project','label':'Completed predecessor'})
        self.assertEqual(found['resolution'],'unique')
        retained=found['matches'][0]
        self.assertEqual((retained['closed'],retained['refState'],retained['publishedCheckpoint']),(True,'deleted',candidate))
        next_task=r.call('task',{'action':'start','requestId':'continue','fromTaskId':retained['taskId'],'label':'New work'})['result']
        self.assertNotEqual(next_task['taskId'],original['taskId'])
        self.assertEqual((next_task['base'],next_task['checkpoint']),(candidate,candidate))
        edited=r.call('edit',{'requestId':'forward','taskId':next_task['taskId'],'expected':next_task['checkpoint'],
            'edits':[{'action':'put','path':'next','before':None,'content':'continued'}]})
        self.assertEqual(edited['status'],'succeeded')
        self.assertEqual(r.call('publish',{'requestId':'publish','validationId':validation['id']})['id'],publication['id'])
        self.assertEqual(r.call('task',{'action':'inspect','taskId':original['taskId']})['task']['checkpoint'],original['checkpoint'])
