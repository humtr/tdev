"""Delegated project enrollment. Credentials and executable policies remain operator-owned."""
import copy
import json
import os
import re
from pathlib import Path

from .common import Fault, canonical, digest, require, run, branch_ref
from .git import Git


def authority(policy):
    return digest({k: policy.get(k) for k in ('kind', 'root', 'owner')})


def validate_policies(config):
    for policy in config.get('projectPolicies', {}).values():
        require(branch_ref(policy['managedRefNamespace'] + 'probe'), 'CONFIG', 'Invalid managed ref namespace')
        if policy['kind'] == 'local':
            root = Path(policy['root'])
            require(root.is_absolute() and str(root.resolve()) == str(root) and str(root) != '/',
                    'CONFIG', 'Project root must be a canonical absolute directory below /')


def apply_projects(config, store):
    for row in store.all('SELECT * FROM project'):
        principal = config['principals'].get(row['owner'], {})
        policy = config.get('projectPolicies', {}).get(row['policy'])
        if not policy or row['policy'] not in principal.get('projectPolicies', []) or authority(policy) != row['authority']:
            continue
        require(row['id'] not in config['repositories'], 'CONFIG', 'Static repository shadows a delegated project')
        repo = json.loads(row['config'])
        repo.update({k: copy.deepcopy(policy[k]) for k in ('validation', 'executor', 'toolingEnvironment', 'networks') if k in policy})
        repo['managedRefNamespaces'] = [policy['managedRefNamespace']]
        repo['_projectPolicy'] = row['policy']
        config['repositories'][row['id']] = repo
        principal.setdefault('repos', {})[row['id']] = repo['refs']
        principal.setdefault('managedRefNamespaces', {})[row['id']] = repo['managedRefNamespaces']
    return config


class Projects:
    def __init__(self, controller):
        self.c = controller

    def policy(self, principal, name, expected_authority=None):
        p = self.c.config['principals'].get(principal, {})
        require(name in p.get('projectPolicies', []), 'PROJECT_POLICY_DENIED',
                'This principal has no delegation for that project policy; list projects to see available policies')
        policy = self.c.config.get('projectPolicies', {}).get(name)
        require(policy is not None, 'PROJECT_POLICY_DENIED', 'Project policy is no longer configured')
        require(expected_authority is None or expected_authority == authority(policy), 'PROJECT_SCOPE_CHANGED',
                'The operator changed the policy owner/root; the old operation cannot be retargeted')
        return policy

    @staticmethod
    def github(endpoint, payload=None):
        argv = ['gh', 'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github+json', endpoint]
        if payload is not None:
            argv += ['--method', 'POST', '--input', '-']
        result = run(argv, data=canonical(payload) if payload is not None else None, check=False, timeout=120)
        if result.returncode:
            err = result.stderr.decode(errors='replace')
            if 'HTTP 401' in err or 'gh auth login' in err:
                raise Fault('PROVIDER_AUTH_REQUIRED', 'The tdev controller needs GitHub authentication; exec authentication is not used')
            if 'HTTP 403' in err:
                raise Fault('PROVIDER_PERMISSION_DENIED', 'GitHub rejected the controller credential; check repository/organization access or rate limits')
            if 'HTTP 404' in err:
                raise Fault('PROVIDER_NOT_FOUND', 'Repository not found or not visible to the controller GitHub credential')
            if 'HTTP 422' in err:
                raise Fault('PROVIDER_CONFLICT', 'GitHub rejected repository creation; the name may already exist')
            raise Fault('PROVIDER_UNAVAILABLE', 'GitHub request failed; inspect controller connectivity and the original operation')
        return json.loads(result.stdout)

    def public(self, principal, repo):
        cfg = self.c.config['repositories'][repo]
        refs = self.c.config['principals'][principal].get('repos', {}).get(repo, [])
        allowed = [r for r in refs if r in cfg['refs']]
        require(allowed, 'PERMISSION_DENIED')
        default = cfg.get('defaultRef') or (allowed[0] if len(allowed) == 1 else '')
        if default not in allowed:
            default = ''
        return {'repo': repo, 'name': cfg.get('name', cfg['remote']), 'identity': cfg['identity'],
                'defaultRef': default, 'managedRefNamespaces': self.c.namespaces(principal, repo),
                'policy': cfg.get('_projectPolicy'), 'provider': cfg['kind'], 'checkout': cfg.get('checkout')}

    def list(self, principal):
        projects = [self.public(principal, repo) for repo, refs in self.c.config['principals'][principal].get('repos', {}).items()
                    if repo in self.c.config['repositories'] and set(refs) & set(self.c.config['repositories'][repo]['refs'])]
        policies = []
        for name in self.c.config['principals'][principal].get('projectPolicies', []):
            policy = self.policy(principal, name)
            policies.append({'name': name, 'provider': policy['kind'], 'scope': policy.get('root', policy.get('owner')),
                             'canCreate': policy.get('allowCreate', False)})
        return {'projects': projects, 'policies': policies}

    def inspect(self, principal, repo):
        value = self.public(principal, repo)
        try:
            cfg = self.c.config['repositories'][repo]
            if cfg['kind'] == 'github':
                remote = self.github('repos/' + cfg['name'])
                require('github:' + str(remote['id']) == cfg['identity'], 'REPOSITORY_IDENTITY')
                value['permissions'] = {k: bool(remote['permissions'][k]) for k in ('push', 'admin') if k in remote.get('permissions', {})}
            if value['defaultRef']:
                value['head'] = self.c.git(repo).head(value['defaultRef'])
            else:
                value['error'] = Fault('BASE_REF_REQUIRED', 'Select an allowed baseRef when starting work').value
        except Fault as error:
            value['error'] = error.value
        return value

    @staticmethod
    def local_target(policy, name):
        require(not Path(name).is_absolute() and '..' not in Path(name).parts and name not in ('', '.'),
                'PROJECT_PATH', 'Use a project path relative to the delegated local root')
        root = Path(policy['root']).resolve()
        target = (root / name).resolve()
        require(target != root and target.is_relative_to(root), 'PROJECT_PATH', 'Project must remain inside the delegated root')
        return target

    def describe(self, policy, name):
        if policy['kind'] == 'github':
            require(re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}', name) and name not in ('.', '..'), 'PROJECT_NAME')
            full = policy['owner'] + '/' + name
            data = self.github('repos/' + full)
            require(data['full_name'].lower() == full.lower(), 'REPOSITORY_IDENTITY')
            require(data.get('permissions', {}).get('push') is not False, 'PROVIDER_PERMISSION_DENIED',
                    'The controller can read this GitHub repository but cannot publish to it')
            base = 'refs/heads/' + data['default_branch']
            cfg = {'kind': 'github', 'name': data['full_name'], 'remote': 'https://github.com/' + data['full_name'] + '.git',
                   'identity': 'github:' + str(data['id'])}
        else:
            target = self.local_target(policy, name)
            require(target.is_dir(), 'PROJECT_NOT_FOUND', 'Local project directory does not exist')
            result = run(['git', '-C', str(target), 'rev-parse', '--path-format=absolute', '--git-common-dir'], check=False)
            require(result.returncode == 0, 'GIT_PROJECT_REQUIRED', 'Connect requires an existing Git repository; create initializes a new project')
            remote = Path(result.stdout.decode().strip()).resolve()
            require(remote.is_relative_to(Path(policy['root'])), 'PROJECT_PATH', 'Git common directory is outside the delegated root')
            bare = run(['git', '-C', str(target), 'rev-parse', '--is-bare-repository']).stdout.strip() == b'true'
            if not bare:
                top = run(['git', '-C', str(target), 'rev-parse', '--show-toplevel']).stdout.decode().strip()
                require(Path(top).resolve() == target, 'PROJECT_PATH', 'Connect the Git project root, not a subdirectory')
            st = remote.stat()
            require(os.access(remote, os.W_OK | os.X_OK), 'PROJECT_NOT_WRITABLE', 'Controller cannot write this local Git directory')
            base_result = run(['git', '-C', str(target), 'symbolic-ref', '-q', 'HEAD'], check=False)
            require(base_result.returncode == 0, 'BASE_REF_REQUIRED', 'Local project must have a named HEAD branch')
            base = base_result.stdout.decode().strip()
            cfg = {'kind': 'local', 'remote': str(remote), 'identity': f'local:{st.st_dev}:{st.st_ino}', 'allowWorktree': True}
            if not bare:
                checkout_stat = target.stat()
                cfg.update(checkout=str(target), checkoutIdentity=f'local:{checkout_stat.st_dev}:{checkout_stat.st_ino}')
        require(branch_ref(base) and not base.startswith(policy['managedRefNamespace'])
                and not policy['managedRefNamespace'].startswith(base + '/'), 'BASE_REF_REQUIRED')
        cfg.update(refs=[base], defaultRef=base, managedOnly=True)
        return cfg

    def create(self, opid, policy, name):
        if policy['kind'] == 'github':
            require(re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}', name) and name not in ('.', '..'), 'PROJECT_NAME')
            owner = self.github('users/' + policy['owner'])
            if owner['type'] == 'Organization':
                endpoint = 'orgs/' + policy['owner'] + '/repos'
            else:
                require(self.github('user')['login'].lower() == policy['owner'].lower(), 'PROVIDER_PERMISSION_DENIED',
                        'The controller GitHub account cannot create repositories for another personal account')
                endpoint = 'user/repos'
            self.c.save_intent(opid, projectCreate=True)
            data = self.github(endpoint, {'name': name, 'private': True, 'auto_init': True})
            # Retain exact provider identity before any subsequent read can fail.
            self.c.save_intent(opid, createdIdentity='github:' + str(data['id']))
        else:
            require(re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}', name) and name not in ('.', '..'), 'PROJECT_NAME')
            target = self.local_target(policy, name)
            require(not target.exists(), 'PROJECT_EXISTS', 'Use connect for an existing project; creation never overwrites it')
            require(target.parent.is_dir() and os.access(target.parent, os.W_OK | os.X_OK), 'PROJECT_NOT_WRITABLE',
                    'Controller needs write access to the delegated local project root')
            self.c.save_intent(opid, projectCreate=True)
            try:
                target.mkdir(mode=0o700)
            except FileExistsError:
                raise Fault('PROJECT_EXISTS', 'Project path was created concurrently') from None
            run(['git', 'init', '--template=', '-b', 'main', str(target)])
            run(['git', '-C', str(target), 'config', 'tdev.creationId', opid])
            (target / 'README.md').write_text('# ' + name + '\n')
            run(['git', '-C', str(target), 'add', '--', 'README.md'])
            run(['git', '-C', str(target), '-c', 'user.name=tdev', '-c', 'user.email=tdev@localhost',
                 '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
                 '-c', 'core.fsync=loose-object,reference', 'commit', '-m', 'Initialize project'])
        return self.describe(policy, name)

    def complete(self, row, cfg):
        intent = json.loads(row['intent'])
        policy = self.policy(row['owner'], intent['input']['policy'], intent['authority'])
        expected = intent.get('createdIdentity')
        require(expected is None or cfg['identity'] == expected, 'REPOSITORY_IDENTITY')
        repo = 'p-' + digest([row['owner'], cfg['identity']])[:24]
        effective = {**cfg, **{k: copy.deepcopy(policy[k]) for k in ('validation', 'executor', 'toolingEnvironment', 'networks') if k in policy},
                     'managedRefNamespaces': [policy['managedRefNamespace']]}
        Git(self.c.store.root / 'objects' / (repo + '.git'), effective).head(cfg['defaultRef'])
        with self.c.store.tx() as db:
            existing = db.execute('SELECT * FROM project WHERE id=?', (repo,)).fetchone()
            if existing:
                require(existing['policy'] == intent['input']['policy'] and existing['authority'] == intent['authority'],
                        'PROJECT_ALREADY_CONNECTED', 'Project is already connected under another policy')
                require(json.loads(existing['config']).get('checkout') == cfg.get('checkout'),
                        'PROJECT_ALREADY_CONNECTED', 'This repository is already connected through a different checkout')
                cfg = json.loads(existing['config'])
            else:
                db.execute('INSERT INTO project(id,owner,policy,authority,identity,config) VALUES(?,?,?,?,?,?)',
                           (repo, row['owner'], intent['input']['policy'], intent['authority'], cfg['identity'], canonical(cfg).decode()))
            value = {'repo': repo, 'name': cfg.get('name', cfg['remote']), 'identity': cfg['identity'],
                     'defaultRef': cfg['defaultRef'], 'managedRefNamespaces': [policy['managedRefNamespace']],
                     'policy': intent['input']['policy'], 'provider': cfg['kind'], 'checkout': cfg.get('checkout')}
            db.execute("UPDATE operation SET status='succeeded',effect='committed',result=?,error=NULL WHERE id=?",
                       (canonical(value).decode(), row['id']))
        self.c.config = self.c.load_config()

    def reconcile(self, row):
        intent = json.loads(row['intent'])
        policy = self.policy(row['owner'], intent['input']['policy'], intent['authority'])
        if 'createdIdentity' in intent:
            self.complete(row, self.describe(policy, intent['input']['name']))
        elif intent.get('projectCreate') and policy['kind'] == 'local':
            target = self.local_target(policy, intent['input']['name'])
            if target.is_dir():
                marker = run(['git', '-C', str(target), 'config', '--local', '--get', 'tdev.creationId'], check=False)
                if marker.returncode == 0 and marker.stdout.decode().strip() == row['id']:
                    self.complete(row, self.describe(policy, intent['input']['name']))
        # A GitHub creation response lost before persisting its ID stays unknown.
        # A same-name repository alone cannot establish who created it. Never POST again.
