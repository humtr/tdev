"""Delegated GitHub behavior through actual HTTP with controller-owned fixtures."""
import base64
import hashlib
import json
import unittest

from acceptance.github_fixture import GithubFixture
from acceptance.harness import Runtime, git
from acceptance import test_project as project_assertions


class GithubCase(unittest.TestCase):
    call = project_assertions.ProjectTest.call
    result = project_assertions.ProjectTest.result
    error = project_assertions.ProjectTest.error

    def setUp(self):
        self.runtime = Runtime()
        self.addCleanup(self.runtime.close)
        self.provider = GithubFixture(self.runtime)

    def args(self, action='create', request='github'):
        return {'action': action, 'requestId': request, 'policy': 'cloud', 'name': 'Repo'}


class GithubTest(GithubCase):
    def test_connect_source_and_current_policy_without_public_ref_or_checkout_effects(self):
        r, p = self.runtime, self.provider
        before = git('--git-dir=' + str(r.remote), 'show-ref')
        listing = self.result('project', {'action': 'list'})
        self.assertEqual(listing['policies'], [{'name': 'cloud', 'provider': 'github',
            'scope': 'Example', 'canCreate': True}])
        self.assertFalse(p.calls())
        args = self.args('connect')
        r.discard_reply('project', args)
        connected = self.result('project', args)
        self.assertEqual((connected['status'], connected['effect']), ('succeeded', 'committed'))
        project = connected['result']
        expected = hashlib.sha256(json.dumps(['alice', 'github:1234'], separators=(',', ':')).encode()).hexdigest()[:24]
        self.assertEqual((project['repo'], project['identity'], project['name']),
                         ('p-' + expected, 'github:1234', 'Example/Repo'))
        inspected = self.result('project', {'action': 'inspect', 'repo': project['repo']})
        self.assertEqual((inspected['head'], inspected['permissions']),
                         (r.head, {'push': True, 'admin': False}))
        task = self.result('task', {'action': 'start', 'requestId': 'remote-start',
            'repo': project['repo'], 'expectedHead': r.head})['result']
        read = self.result('read', {'taskId': task['taskId'], 'queries': [{'action': 'file', 'path': 'a.txt'}]})
        self.assertEqual(base64.b64decode(read['items'][0]['data']), b'hello\n')
        edit = self.result('edit', {'requestId': 'remote-edit', 'taskId': task['taskId'],
            'expected': task['checkpoint'], 'edits': [{'action': 'replace', 'path': 'a.txt',
                'old': 'hello', 'text': 'private', 'count': 1}]})
        self.assertEqual(edit['status'], 'succeeded')
        cleaned = self.result('task', {'action': 'cleanup', 'requestId': 'empty-cleanup', 'taskId': task['taskId']})
        self.assertEqual((cleaned['status'], cleaned['effect']), ('succeeded', 'committed'))
        self.assertEqual(git('--git-dir=' + str(r.remote), 'show-ref'), before)
        self.assertFalse(p.posts())
        r.restart()
        self.assertEqual(self.result('project', args), connected)
        policy = r.config['projectPolicies']['cloud']
        policy.update(validationTimeoutSeconds=73, managedRefNamespace='refs/heads/current/')
        r.save_config()
        current = self.result('project', {'action': 'inspect', 'repo': project['repo']})
        self.assertEqual((current['validationTimeoutSeconds'], current['managedRefNamespaces']),
                         (73, ['refs/heads/current/']))
        r.config['principals']['alice']['projectPolicies'] = []
        r.save_config()
        self.error('project', args, 'PROJECT_POLICY_DENIED')
        self.error('operation', {'action': 'status', 'operationId': connected['id']}, 'PROJECT_POLICY_DENIED')
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 1)
        r.config['principals']['alice']['projectPolicies'] = ['cloud']
        policy['owner'] = 'Other'
        r.save_config()
        self.error('project', args, 'PROJECT_SCOPE_CHANGED')

    def test_private_creation_is_one_effect_and_current_allow_create_only_gates_new_requests(self):
        r, p = self.runtime, self.provider
        args = self.args()
        r.discard_reply('project', args)
        original = self.result('project', args)
        self.assertEqual((original['status'], original['effect']), ('succeeded', 'committed'))
        self.assertEqual([(c['endpoint'], c['payload']) for c in p.posts()],
            [('orgs/Example/repos', {'name': 'Repo', 'private': True, 'auto_init': True})])
        r.restart()
        r.config['projectPolicies']['cloud']['allowCreate'] = False
        r.save_config()
        self.assertEqual(self.result('project', args), original)
        self.error('project', self.args(request='denied'), 'PROJECT_CREATE_DENIED')
        self.error('operation', {'action': 'status', 'lookupRequestId': 'denied'}, 'OPERATION_NOT_FOUND')
        self.error('project', {**args, 'name': 'Other'}, 'IDEMPOTENCY_MISMATCH')
        self.assertEqual(len(p.posts()), 1)
        self.assertNotIn('fixture-controller-secret', json.dumps(original))

    def test_lost_creation_response_stays_unknown_without_post_or_name_based_recovery(self):
        r, p = self.runtime, self.provider
        p.state['post_reply'] = 'lost'
        p.save()
        args = self.args()
        original = self.result('project', args)
        self.assertEqual((original['status'], original['effect']), ('unknown', 'unknown'))
        calls = len(p.calls())
        p.state['post_reply'] = 'normal'
        p.save()
        r.restart()
        for _ in range(2):
            self.assertEqual(self.result('project', args)['id'], original['id'])
            self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(len(p.calls()), calls)
        explicit = self.result('project', self.args('connect', 'explicit'))
        self.assertEqual(explicit['status'], 'succeeded')
        self.assertEqual(r.status(original['id'])['status'], 'unknown')
        self.assertEqual(len(p.posts()), 1)

    def test_created_id_survives_permission_loss_and_rejects_same_name_replacement(self):
        r, p = self.runtime, self.provider
        p.state['get_status'] = 403
        p.save()
        args = self.args()
        original = self.result('project', args)
        self.assertEqual((original['status'], original['effect'], original['error']['code']),
                         ('unknown', 'unknown', 'PROVIDER_PERMISSION_DENIED'))
        p.state['get_status'] = 200
        p.state['repository']['id'] = 9999
        p.save()
        r.restart()
        replacement = r.status(original['id'])
        self.assertEqual((replacement['status'], replacement['error']['code']),
                         ('unknown', 'REPOSITORY_IDENTITY'))
        self.assertEqual(len(self.result('project', {'action': 'list'})['projects']), 1)
        p.state['repository']['id'] = 1234
        p.save()
        recovered = r.status(original['id'])
        self.assertEqual((recovered['id'], recovered['status'], recovered['effect']),
                         (original['id'], 'succeeded', 'committed'))
        self.assertEqual(len(p.posts()), 1)

    def test_provider_auth_permissions_fixed_owner_and_caller_policy_bounds(self):
        r, p = self.runtime, self.provider
        for action in ('connect', 'create'):
            p.state['auth'] = 401
            p.save()
            op = self.result('project', self.args(action, 'auth-' + action))
            self.assertEqual((op['status'], op['effect'], op['error']['code']),
                             ('failed', 'none', 'PROVIDER_AUTH_REQUIRED'))
        p.state['auth'] = 0
        p.state['owner_type'] = 'User'
        p.state['user_login'] = 'Other'
        p.save()
        # Owner lookup must be the configured owner, even for the user endpoint.
        denied = self.result('project', self.args(request='wrong-owner'))
        self.assertEqual(denied['status'], 'failed')
        self.assertFalse(p.posts())
        p.state['user_login'] = 'Example'
        p.save()
        created = self.result('project', self.args(request='user-create'))
        self.assertEqual(created['status'], 'succeeded')
        self.assertEqual(p.posts()[0]['endpoint'], 'user/repos')
        for field in ('owner', 'token', 'executor', 'validation'):
            self.error('project', {**self.args(request='inject-' + field), field: 'caller'}, 'SCHEMA')
        invalid = self.result('project', {**self.args(request='scope'), 'name': 'Other/Repo'})
        self.assertEqual((invalid['status'], invalid['error']['code']), ('failed', 'PROJECT_NAME'))


if __name__ == '__main__':
    unittest.main()
