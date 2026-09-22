import copy
import json
from pathlib import Path
from unittest.mock import patch

from test_core import Base
from support import git
from tdev.common import Fault
from tdev.core import Controller
from tdev.git import Git
from tdev.projects import Projects


class ProjectTest(Base):
    def policy(self, kind='local'):
        p = {'kind': kind, 'validation': 'test -f README.md', 'allowCreate': True,
             'managedRefNamespace': 'refs/heads/tdev-work/'}
        p.update({'root': str(self.root)} if kind == 'local' else {'owner': 'example'})
        self.repo.config['projectPolicies'] = {'dev': p}
        self.repo.config['principals']['alice']['projectPolicies'] = ['dev']
        return p

    def managed(self):
        self.repo.config['repositories']['test']['managedRefNamespaces'] = ['refs/heads/tdev-work/']
        self.repo.config['principals']['alice']['managedRefNamespaces'] = {'test': ['refs/heads/tdev-work/']}

    def start(self, **args):
        self.counter += 1
        op = self.call('task', {'action': 'start', 'requestId': 'start' + str(self.counter), **args})
        self.assertEqual(op['status'], 'succeeded', op)
        return op['result']

    def validate_publish(self, w):
        self.counter += 1
        v = self.call('validate', {'requestId': 'v' + str(self.counter), 'taskId': w['taskId'],
                                  'expected': w['checkpoint'], 'message': 'task'})
        v = self.wait(v['id'])
        self.assertEqual(v['status'], 'succeeded', v)
        p = self.call('publish', {'requestId': 'p' + str(self.counter), 'validationId': v['id']})
        self.assertEqual(p['status'], 'succeeded', p)
        return p

    def test_local_create_connect_and_worktree_integrity(self):
        self.policy()
        # Existing working tree, including dirty and ignored state, is never used as the execution copy.
        (self.repo.work / 'a.txt').write_text('user dirty\n')
        (self.repo.work / 'untracked.txt').write_text('keep\n')
        before = git('status', '--porcelain', cwd=self.repo.work)
        args = {'action': 'connect', 'requestId': 'connect', 'policy': 'dev', 'name': 'authored'}
        linked = self.call('project', args)
        self.assertEqual(linked['status'], 'succeeded', linked)
        project = linked['result']
        self.assertEqual(self.call('project', args), linked)
        self.repo.config['projectPolicies']['dev']['validation'] = 'test -f a.txt'
        w = self.start(repo=project['repo'])
        p = self.validate_publish(w)
        self.assertEqual(git('rev-parse', w['ref'], cwd=self.repo.work), p['result']['commit'])
        self.assertEqual(git('rev-parse', 'HEAD', cwd=self.repo.work), self.repo.head)
        self.assertEqual(git('status', '--porcelain', cwd=self.repo.work), before)
        self.assertEqual((self.repo.work / 'a.txt').read_text(), 'user dirty\n')
        clean = self.call('task', {'action': 'cleanup', 'requestId': 'clean', 'taskId': w['taskId']})
        self.assertEqual(clean['status'], 'succeeded', clean)
        self.assertEqual(git('status', '--porcelain', cwd=self.repo.work), before)
        self.repo.config['projectPolicies']['dev']['validation'] = 'test -f README.md'
        created = self.call('project', {'action': 'create', 'requestId': 'new', 'policy': 'dev', 'name': 'new-project'})
        self.assertEqual(created['status'], 'succeeded', created)
        self.assertTrue((self.root / 'new-project/README.md').is_file())
        self.assertEqual(self.call('project', {'action': 'inspect', 'repo': created['result']['repo']})['head'],
                         git('rev-parse', 'HEAD', cwd=self.root / 'new-project'))
        self.c.close()
        self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        replay = self.call('project', {'action': 'create', 'requestId': 'new', 'policy': 'dev', 'name': 'new-project'})
        self.assertEqual(replay, created)
        self.assertEqual(len(self.call('project', {'action': 'list'})['projects']), 3)
        newer = self.start(repo=created['result']['repo'])
        self.validate_publish(newer)

    def test_local_scope_symlinks_empty_project_and_no_overwrite(self):
        self.policy()
        (self.root / 'outside').symlink_to(self.root.parent, target_is_directory=True)
        for i, name in enumerate(('../elsewhere', str(self.root), 'outside/nope')):
            result = self.call('project', {'action': 'connect', 'requestId': 'bad' + str(i), 'policy': 'dev', 'name': name})
            self.assertEqual(result['status'], 'failed', result)
            self.assertEqual(result['effect'], 'none')
        result = self.call('project', {'action': 'create', 'requestId': 'exists', 'policy': 'dev', 'name': 'authored'})
        self.assertEqual(result['error']['code'], 'PROJECT_EXISTS')
        git('init', str(self.root / 'empty'))
        result = self.call('project', {'action': 'connect', 'requestId': 'empty', 'policy': 'dev', 'name': 'empty'})
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(git('rev-parse', 'HEAD', cwd=self.repo.work), self.repo.head)

    def test_defaults_are_bound_replay_and_owned_cleanup_after_publish(self):
        self.managed()
        args = {'action': 'start', 'requestId': 'start', 'label': 'my task'}
        first = self.call('task', args)
        w = first['result']
        self.assertTrue(w['managed'])
        self.assertEqual(git('--git-dir=' + str(self.repo.remote), 'for-each-ref', w['ref']), '')
        # Advancing the base does not silently retarget this accepted task or replay.
        (self.repo.work / 'a.txt').write_text('next\n')
        git('add', '.', cwd=self.repo.work); git('commit', '-m', 'next', cwd=self.repo.work)
        git('push', str(self.repo.remote), 'HEAD:refs/heads/main', cwd=self.repo.work)
        self.assertEqual(self.call('task', args), first)
        p = self.validate_publish(w)
        self.assertEqual(git('--git-dir=' + str(self.repo.remote), 'rev-parse', p['result']['commit'] + '^'), self.repo.head)
        inspect = self.call('task', {'action': 'inspect', 'taskId': w['taskId']})
        self.assertEqual(inspect['task']['closed'], 1)
        self.assertEqual(inspect['refCleanup'], 'ready')
        cleanup = {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': w['taskId']}
        cleaned = self.call('task', cleanup)
        self.assertEqual(cleaned['status'], 'succeeded', cleaned)
        self.assertEqual(self.call('task', cleanup), cleaned)
        self.assertEqual(self.call('task', {'action': 'inspect', 'taskId': w['taskId']})['refCleanup'], 'done')
        self.assertEqual(git('--git-dir=' + str(self.repo.remote), 'for-each-ref', w['ref']), '')
        self.assertNotEqual(git('--git-dir=' + str(self.repo.remote), 'rev-parse', 'refs/heads/main'), self.repo.head)
        continued = self.start(fromTaskId=w['taskId'])
        self.assertEqual(continued['base'], p['result']['commit'])
        self.validate_publish(continued)

    def test_no_adoption_canonical_cleanup_other_principal_or_changed_branch(self):
        self.managed()
        normal = self.open()
        rejected = self.call('task', {'action': 'cleanup', 'requestId': 'canonical', 'taskId': normal['taskId']})
        self.assertEqual(rejected['error']['code'], 'REF_NOT_OWNED')
        w = self.start()
        git('--git-dir=' + str(self.repo.remote), 'update-ref', w['ref'], self.repo.head)
        rejected = self.call('task', {'action': 'cleanup', 'requestId': 'foreign', 'taskId': w['taskId']})
        self.assertEqual(rejected['error']['code'], 'REF_NOT_OWNED')
        self.assertEqual(self.c.call('alice', 'tdev_task', {'action': 'open', 'requestId': 'borrow', 'repo': 'test',
            'ref': w['ref'], 'expectedHead': self.repo.head})['error']['code'], 'REF_DENIED')
        self.repo.config['principals']['bob'] = {**copy.deepcopy(self.repo.config['principals']['alice']), 'tokenHash': 'b' * 64}
        self.assertEqual(self.c.call('bob', 'tdev_task', {'action': 'cleanup', 'requestId': 'steal', 'taskId': w['taskId']})['error']['code'], 'TASK_NOT_FOUND')
        owned = self.start()
        self.validate_publish(owned)
        git('--git-dir=' + str(self.repo.remote), 'update-ref', owned['ref'], self.repo.head)
        rejected = self.call('task', {'action': 'cleanup', 'requestId': 'changed', 'taskId': owned['taskId']})
        self.assertEqual(rejected['error']['code'], 'REF_NOT_OWNED')
        self.assertEqual(git('--git-dir=' + str(self.repo.remote), 'rev-parse', owned['ref']), self.repo.head)

    def test_managed_namespace_revocation_applies_to_replay(self):
        self.managed()
        args = {'action': 'start', 'requestId': 'start'}
        self.call('task', args)
        self.repo.config['principals']['alice']['managedRefNamespaces'] = {}
        self.assertFalse(self.c.call('alice', 'tdev_task', args)['ok'])

    def test_publish_and_cleanup_lost_response_restart_reconcile_without_repeat(self):
        self.managed()
        w = self.start()
        v = self.call('validate', {'requestId': 'v', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'change'})
        self.wait(v['id'])
        original = Git.managed_change
        def lost(g, *args):
            original(g, *args)
            raise Fault('LOST', effect='unknown')
        with patch.object(Git, 'managed_change', lost):
            p = self.call('publish', {'requestId': 'publish', 'validationId': v['id']})
        self.assertEqual(p['status'], 'unknown')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        with patch.object(Git, 'managed_change', side_effect=AssertionError('must not redispatch')):
            p = self.call('publish', {'requestId': 'publish', 'validationId': v['id']})
        self.assertEqual(p['status'], 'succeeded')
        with patch.object(Git, 'managed_change', lost):
            clean = self.call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': w['taskId']})
        self.assertEqual(clean['status'], 'unknown')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        with patch.object(Git, 'managed_change', side_effect=AssertionError('must not redispatch')):
            clean = self.call('task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': w['taskId']})
        self.assertEqual(clean['status'], 'succeeded')
        self.assertEqual(self.call('task', {'action': 'inspect', 'taskId': w['taskId']})['refCleanup'], 'done')

    def test_unknown_create_does_not_allow_cleanup_or_treat_absence_as_failure(self):
        self.managed(); w = self.start()
        v = self.call('validate', {'requestId': 'v', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'task'})
        self.wait(v['id'])
        with patch.object(Git, 'managed_change', side_effect=Fault('LOST', effect='unknown')):
            p = self.call('publish', {'requestId': 'publish', 'validationId': v['id']})
        self.assertEqual(p['status'], 'unknown')
        self.assertEqual(self.call('operation', {'action': 'status', 'operationId': p['id']})['status'], 'unknown')
        self.assertEqual(self.c.call('alice', 'tdev_task', {'action': 'cleanup', 'requestId': 'cleanup', 'taskId': w['taskId']})['error']['code'], 'TASK_BUSY')

    def test_policy_revocation_identity_replacement_and_current_validation(self):
        self.policy()
        args = {'action': 'connect', 'requestId': 'connect', 'policy': 'dev', 'name': 'authored'}
        linked = self.call('project', args)
        self.assertEqual(linked['status'], 'succeeded')
        project = linked['result']['repo']
        self.repo.config['principals']['alice']['projectPolicies'] = []
        self.assertFalse(self.c.call('alice', 'tdev_project', args)['ok'])
        self.assertFalse(self.c.call('alice', 'tdev_task', {'action': 'start', 'requestId': 'revoked', 'repo': project})['ok'])
        self.repo.config['principals']['alice']['projectPolicies'] = ['dev']
        self.repo.config['projectPolicies']['dev']['validation'] = 'exit 19'
        w = self.start(repo=project)
        v = self.call('validate', {'requestId': 'bad-validation', 'taskId': w['taskId'], 'expected': w['checkpoint'], 'message': 'bad'})
        self.assertEqual(self.wait(v['id'])['result']['exitCode'], 19)
        old = self.repo.work / '.git'
        old.rename(self.repo.work / '.git-old')
        git('init', '-b', 'main', str(self.repo.work))
        inspect = self.call('project', {'action': 'inspect', 'repo': project})
        self.assertEqual(inspect['error']['code'], 'REPOSITORY_IDENTITY')

    def test_github_private_creation_provider_auth_and_lost_response(self):
        self.policy('github')
        calls = []
        def provider(endpoint, payload=None):
            calls.append((endpoint, payload))
            if endpoint == 'users/example': return {'type': 'User'}
            if endpoint == 'user': return {'login': 'example'}
            return {'id': 1234, 'full_name': 'example/new', 'default_branch': 'main', 'permissions': {'push': True}}
        args = {'action': 'create', 'requestId': 'github', 'policy': 'dev', 'name': 'new'}
        with patch.object(Projects, 'github', side_effect=provider), patch.object(Git, 'identity', return_value='github:1234'), patch.object(Git, 'head', return_value=self.repo.head):
            created = self.call('project', args)
            self.assertEqual(created['status'], 'succeeded', created)
            self.assertEqual(self.call('project', args), created)
        posts = [payload for endpoint, payload in calls if endpoint == 'user/repos']
        self.assertEqual(posts, [{'name': 'new', 'private': True, 'auto_init': True}])
        self.assertNotIn('token', json.dumps(created).lower())
        def lost(endpoint, payload=None):
            if payload: raise Fault('TRANSPORT_TIMEOUT', effect='unknown')
            return provider(endpoint, payload)
        with patch.object(Projects, 'github', side_effect=lost):
            unknown = self.call('project', {**args, 'requestId': 'lost', 'name': 'lost'})
        self.assertEqual(unknown['status'], 'unknown')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        with patch.object(Projects, 'github', side_effect=AssertionError('Never retry creation based on name')):
            self.assertEqual(self.call('project', {**args, 'requestId': 'lost', 'name': 'lost'})['status'], 'unknown')
        with patch.object(Projects, 'github', side_effect=Fault('PROVIDER_AUTH_REQUIRED', 'Controller credential missing')):
            denied = self.call('project', {**args, 'requestId': 'denied', 'name': 'denied'})
        self.assertEqual(denied['error']['code'], 'PROVIDER_AUTH_REQUIRED')
        self.assertEqual(denied['effect'], 'none')

    def test_github_created_identity_survives_later_permission_failure(self):
        self.policy('github')
        def provider(endpoint, payload=None):
            if endpoint == 'users/example': return {'type': 'User'}
            if endpoint == 'user': return {'login': 'example'}
            if payload: return {'id': 123}
            raise Fault('PROVIDER_PERMISSION_DENIED', 'Access changed after creation')
        with patch.object(Projects, 'github', side_effect=provider):
            result = self.call('project', {'action': 'create', 'requestId': 'create', 'policy': 'dev', 'name': 'created'})
        self.assertEqual(result['effect'], 'unknown')
        self.assertEqual(json.loads(self.c.store.one('SELECT intent FROM operation WHERE id=?', (result['id'],))['intent'])['createdIdentity'], 'github:123')

    def test_local_creation_lost_completion_and_policy_scope_change(self):
        self.policy()
        args = {'action': 'create', 'requestId': 'create', 'policy': 'dev', 'name': 'durable'}
        with patch.object(Projects, 'complete', side_effect=Fault('LOST', effect='unknown')):
            lost = self.call('project', args)
        self.assertEqual(lost['status'], 'unknown')
        self.c.close(); self.c = Controller(self.root / 'state', self.repo.config, self.executor)
        with patch.object(Projects, 'create', side_effect=AssertionError('Must not recreate directory')):
            done = self.call('project', args)
        self.assertEqual(done['status'], 'succeeded', done)
        self.repo.config['projectPolicies']['dev']['root'] = str(self.root / 'authored')
        self.assertEqual(self.c.call('alice', 'tdev_project', args)['error']['code'], 'PROJECT_SCOPE_CHANGED')

    def test_git_receive_pack_cas_create_delete_and_mismatched_old(self):
        self.managed(); w = self.start()
        g = self.c.git('test')
        new = g.commit(g.tree(w['base']), w['base'], 'exact')
        zero = '0' * len(new)
        # Exercise the real Git transport/hook used for GitHub, against a local receiver.
        g.push_exact(w['ref'], zero, new, new + ':' + w['ref'])
        self.assertEqual(g.head(w['ref']), new)
        with self.assertRaises(Fault):
            g.push_exact(w['ref'], zero, self.repo.head, self.repo.head + ':' + w['ref'])
        with self.assertRaises(Fault):
            g.push_exact(w['ref'], self.repo.head, zero, ':' + w['ref'])
        self.assertEqual(g.head(w['ref']), new)
        g.push_exact(w['ref'], new, zero, ':' + w['ref'])
        self.assertIsNone(g.head(w['ref'], missing=True))

    def test_local_checked_out_branch_retained_and_no_canonical_publish(self):
        self.policy()['validation'] = 'test -f a.txt'
        project = self.call('project', {'action': 'connect', 'requestId': 'connect', 'policy': 'dev', 'name': 'authored'})['result']
        w = self.start(repo=project['repo']); self.validate_publish(w)
        git('checkout', w['ref'].removeprefix('refs/heads/'), cwd=self.repo.work)
        rejected = self.call('task', {'action': 'cleanup', 'requestId': 'checked-out', 'taskId': w['taskId']})
        self.assertEqual(rejected['error']['code'], 'REF_CHECKED_OUT')
        self.assertEqual(rejected['effect'], 'none')
        git('checkout', 'main', cwd=self.repo.work)
        done = self.call('task', {'action': 'cleanup', 'requestId': 'after-switch', 'taskId': w['taskId']})
        self.assertEqual(done['status'], 'succeeded')
        normal = self.call('task', {'action': 'open', 'requestId': 'normal', 'repo': project['repo'],
            'ref': 'refs/heads/main', 'expectedHead': self.repo.head})['result']
        v = self.call('validate', {'requestId': 'normal-v', 'taskId': normal['taskId'], 'expected': normal['checkpoint'], 'message': 'base'})
        self.wait(v['id'])
        rejected = self.call('publish', {'requestId': 'normal-p', 'validationId': v['id']})
        self.assertEqual(rejected['error']['code'], 'MANAGED_TASK_REQUIRED')
        self.assertEqual(git('rev-parse', 'HEAD', cwd=self.repo.work), self.repo.head)

    def test_ambiguous_projects_and_privilege_fields_are_not_guessed(self):
        self.managed(); self.policy()
        self.call('project', {'action': 'create', 'requestId': 'create', 'policy': 'dev', 'name': 'new'})
        self.assertEqual(self.c.call('alice', 'tdev_task', {'action': 'start', 'requestId': 'ambiguous'})['error']['code'], 'PROJECT_REQUIRED')
        for key, value in [('validation', 'true'), ('executor', {'kind': 'native'}), ('owner', 'other'), ('token', 'injected')]:
            self.assertEqual(self.c.call('alice', 'tdev_project', {'action': 'create', 'requestId': 'bad', 'policy': 'dev', 'name': 'bad', key: value})['error']['code'], 'SCHEMA')
        self.repo.config['principals']['alice']['defaultRepo'] = 'test'
        self.assertEqual(self.start()['repo'], 'test')

    def test_artifact_validation_policy_is_current_and_removal_does_not_stick(self):
        from tdev.artifacts import artifact_policy
        policy = self.policy()
        policy['artifactValidation'] = 'python verify_package.py'
        created = self.call('project', {'action': 'create', 'requestId': 'package-project',
                                       'policy': 'dev', 'name': 'package-project'})['result']
        repo = created['repo']
        first = self.c.load_config()['repositories'][repo]
        self.assertEqual(first['artifactValidation'], policy['artifactValidation'])
        first_digest = artifact_policy(self.c, first)
        policy['artifactValidation'] = 'python other_check.py'
        changed = self.c.load_config()['repositories'][repo]
        self.assertNotEqual(artifact_policy(self.c, changed), first_digest)
        del policy['artifactValidation']
        current = self.c.load_config()['repositories'][repo]
        self.assertNotIn('artifactValidation', current)
        explicit_default = {**current, 'artifactValidation': current['validation']}
        self.assertEqual(artifact_policy(self.c, current), artifact_policy(self.c, explicit_default))
