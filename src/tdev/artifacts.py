"""Frozen recipe bindings and retained native builds, independent of deployment."""
import copy
import json
import re
from functools import lru_cache
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator

from .common import Fault, canonical, digest, load_contract, path, require


@lru_cache(maxsize=8)
def validator(name):
    schema, _ = load_contract()
    return Draft202012Validator({'$defs': schema['$defs'], '$ref': '#/$defs/' + name})


def checked(value, name):
    require(validator(name).is_valid(value), 'ARTIFACT_SCHEMA', name + ' does not match the contract')


def artifact_path(value, dot=False):
    try:
        path(value, dot=dot)
        require(len(value.encode()) <= 1024 and not any(ord(c) == 127 for c in value), 'ARTIFACT_PATH')
    except UnicodeError:
        raise Fault('ARTIFACT_PATH', 'Path must be valid UTF-8') from None
    return value


def paths(values):
    """Reject aliases and file/root collisions before resolving any host path."""
    seen, spellings = set(), {}
    for value in values:
        artifact_path(value)
        folded = value.casefold()
        require(folded not in seen, 'ARTIFACT_PATH_COLLISION')
        seen.add(folded)
        components = value.split('/')
        for i in range(1, len(components) + 1):
            prefix = '/'.join(components[:i])
            require(spellings.get(prefix.casefold(), prefix) == prefix, 'ARTIFACT_PATH_COLLISION')
            spellings[prefix.casefold()] = prefix
    for value in seen:
        components = value.split('/')
        require(not any('/'.join(components[:i]) in seen for i in range(1, len(components))),
                'ARTIFACT_PATH_COLLISION')


def recipe_value(value):
    checked(value, 'ArtifactRecipe')
    require(len(canonical(value)) <= 65536, 'ARTIFACT_RECIPE_LIMIT')
    paths(value['inputs'])
    paths(value['exports'])
    for tools in [value['build']['tools']] + ([value['service']['runtime']['tools']] if 'service' in value else []):
        require(len({t['name'] for t in tools}) == len(tools), 'ARTIFACT_TOOL_DUPLICATE')
    dependencies = value['dependencies']
    require(len({d['name'] for d in dependencies}) == len(dependencies), 'ARTIFACT_DEPENDENCY_DUPLICATE')
    paths([d['name'] for d in dependencies])
    require(len({d['url'] for d in dependencies}) == len(dependencies), 'ARTIFACT_DEPENDENCY_DUPLICATE')
    for dependency in dependencies:
        url = dependency['url']
        try:
            parsed = urlsplit(url)
            allowed = (parsed.scheme == 'https' and parsed.hostname and parsed.port in (None, 443)
                       and parsed.username is None and parsed.password is None and not parsed.query
                       and not parsed.fragment and re.fullmatch(r'[A-Za-z0-9.-]+', parsed.hostname)
                       and not any(ord(c) <= 32 or ord(c) == 127 for c in url) and '\\' not in url)
        except ValueError:
            allowed = False
        require(allowed, 'ARTIFACT_DEPENDENCY_URL', 'Use a public HTTPS content-pinned input without credentials/query/fragment')
    if 'service' in value:
        service = value['service']
        artifact_path(service['cwd'], dot=True)
        runtime_files = service['runtime'].get('files', [])
        require(len({f['path'] for f in runtime_files}) == len(runtime_files), 'ARTIFACT_RUNTIME_FILE_DUPLICATE')
        for entry in runtime_files:
            require(entry['path'].startswith('/'), 'ARTIFACT_RUNTIME_FILE_PATH')
            artifact_path(entry['path'][1:])
        # These values are runner-owned; a recipe cannot redirect its private/data layout.
        reserved = {'HOME', 'TMPDIR', 'PATH', 'PYTHONHOME', 'PYTHONPATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'VIRTUAL_ENV'}
        require(not any(k in reserved or k.startswith('TDEV_') for k in service['environment']), 'ARTIFACT_ENV')
        require(service['runtime']['platform'] == value['target'], 'ARTIFACT_TARGET_MISMATCH')
    return value


def parse_recipe(data):
    require(isinstance(data, bytes) and len(data) <= 65536, 'ARTIFACT_RECIPE_LIMIT')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'ARTIFACT_RECIPE_JSON', 'Duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('Non-finite JSON')
    try:
        value = json.loads(data.decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)
        return recipe_value(value)
    except (ValueError, UnicodeError, RecursionError):
        raise Fault('ARTIFACT_RECIPE_JSON', 'Recipe must be bounded strict UTF-8 JSON') from None


def source_validation(row):
    """Shared source-only join. Artifact verification can never authorize source publish."""
    require(row['kind'] == 'validate' and row['status'] == 'succeeded' and row['effect'] == 'committed'
            and row['result'], 'VALIDATION_REQUIRED')
    intent, result = json.loads(row['intent']), json.loads(row['result'])
    require(intent.get('validationSubject', 'source') == 'source', 'SOURCE_VALIDATION_REQUIRED')
    candidate = intent.get('candidate')
    require(isinstance(candidate, str) and re.fullmatch(r'(?:[0-9a-f]{40}|[0-9a-f]{64})', candidate)
            and result.get('candidate') == candidate and result.get('id') == row['id']
            and result.get('terminal') is True and result.get('stopped') is True
            and type(result.get('exitCode')) is int and result['exitCode'] == 0
            and not any(result.get(k) for k in ('cancelled', 'timedOut', 'captureError')),
            'VALIDATION_RECEIPT')
    require(intent.get('execution', {}).get('candidate') == candidate
            and intent['execution'].get('checkpoint') == candidate, 'VALIDATION_RECEIPT')
    return intent, result


def artifact_policy(controller, config):
    return digest({'subject': 'artifact', 'command': config.get('artifactValidation', config['validation']),
                   'executor': controller.executor_config(config),
                   'toolingEnvironment': config.get('toolingEnvironment', {})})


def inspect_recipe(controller, principal, args):
    row = controller.operation(principal, args['validationId'])
    intent, _ = source_validation(row)
    config = controller.config['repositories'][row['repo']]
    require(intent['policy'] == controller.validation_policy(config), 'VALIDATION_POLICY_CHANGED')
    git = controller.git(row['repo'])
    tree = git.tree(intent['candidate'])
    require(tree == git.tree(intent['task']['checkpoint']), 'VALIDATION_SOURCE_CHANGED')
    entries = git.entries(intent['candidate'])
    name = artifact_path(args.get('path', 'tdev-package.json'))
    require(name in entries and entries[name][0] in ('100644', '100755'), 'ARTIFACT_RECIPE_MISSING')
    raw = git.blob(entries[name][1], limit=65536)
    recipe = parse_recipe(raw)
    inputs, total = {}, 0
    for name_input in recipe['inputs']:
        require(name_input in entries and entries[name_input][0] in ('100644', '100755'), 'ARTIFACT_INPUT_MISSING', name_input)
        data = git.blob(entries[name_input][1])
        total += len(data)
        require(total <= 32 * 1024 * 1024, 'ARTIFACT_INPUT_LIMIT')
        inputs[name_input] = {'mode': entries[name_input][0], 'sha256': digest(data), 'size': len(data)}
    value = {'validationId': row['id'], 'candidate': intent['candidate'], 'sourcePolicy': intent['policy'],
             'artifactPolicy': artifact_policy(controller, config),
             'source': {'repositoryIdentity': config['identity'], 'tree': tree, 'recipePath': name,
                        'recipeDigest': digest(raw), 'inputs': inputs}, 'recipe': recipe, 'buildExecuted': False}
    return {**value, 'bindingDigest': digest(value)}


def check_binding(binding):
    checked(binding, 'ArtifactRecipeInspection')
    recipe_value(binding['recipe'])
    require(binding['bindingDigest'] == digest({k: v for k, v in binding.items() if k != 'bindingDigest'}), 'ARTIFACT_BINDING_CHANGED')
    artifact_path(binding['source']['recipePath'])
    require(set(binding['source']['inputs']) == set(binding['recipe']['inputs']), 'ARTIFACT_INPUT_MISMATCH')


def make_manifest(binding, files):
    """Canonical metadata, not proof of a build/byte capture. Only a trusted sealer may use it."""
    check_binding(binding)
    manifest = {'format': 1, 'source': copy.deepcopy(binding['source']),
                'recipe': copy.deepcopy(binding['recipe']), 'files': copy.deepcopy(files)}
    check_manifest(manifest, binding)
    return manifest


def check_manifest(manifest, binding):
    check_binding(binding)
    checked(manifest, 'ArtifactManifest')
    require(manifest['source'] == binding['source'] and manifest['recipe'] == binding['recipe'], 'ARTIFACT_BINDING_CHANGED')
    files, exports = manifest['files'], binding['recipe']['exports']
    paths(files)
    require(all(any(p == root or p.startswith(root + '/') for root in exports) for p in files), 'ARTIFACT_EXPORT_SCOPE')
    require(all(any(p == root or p.startswith(root + '/') for p in files) for root in exports), 'ARTIFACT_EXPORT_MISSING')
    service = binding['recipe'].get('service')
    if service and service['cwd'] != '.':
        require(service['cwd'] not in files and any(p.startswith(service['cwd'] + '/') for p in files), 'ARTIFACT_SERVICE_CWD')
    return digest(manifest)


class Artifacts:
    """Build ownership remains in operation; one retained-content pin per completed build."""
    def __init__(self, controller):
        self.c = controller
        import threading
        from .artifact_retention import Retention
        self.lock = threading.RLock()
        self.retention = Retention(self)

    def read(self, principal, args):
        from .store import Store
        c = self.c
        if args['action'] == 'usage':
            return self.retention.usage(principal, args)
        if args['action'] == 'export':
            return self.retention.export(principal, args)
        if args['action'] == 'prunePreview':
            return self.retention.preview(principal, args['artifactId'])
        if args['action'] == 'inspectRecipe':
            return inspect_recipe(c, principal, args)
        if args['action'] == 'list':
            task = args.get('taskId')
            if task:
                c.task(principal, task)
            rows = c.store.all("SELECT rowid AS cursor,* FROM operation WHERE owner=? AND kind='artifact' "
                               "AND (? IS NULL OR task=?) AND rowid<? ORDER BY rowid DESC LIMIT ?",
                               (principal, task, task, args.get('before', 9007199254740991), args.get('limit', 20) + 1))
            page, values = rows[:args.get('limit', 20)], []
            for row in page:
                try:
                    values.append(Store.public(c.operation(principal, row['id'])))
                except Fault:
                    continue
            outstanding = []
            for row in c.store.all("SELECT id FROM operation WHERE owner=? AND (kind='artifact' OR json_extract(intent,'$.validationSubject')='artifact' OR json_extract(intent,'$.artifactPrune') IS NOT NULL) "
                                   "AND status IN ('running','unknown') AND (? IS NULL OR task=?) ORDER BY rowid LIMIT 24",
                                   (principal, task, task)):
                try:
                    outstanding.append(c.status(principal, {'operationId': row['id'], 'limit': 1}))
                except Fault:
                    continue
            values = [Store.public(c.operation(principal, value['id'])) for value in values]
            for value in values:
                value['artifactStorage'] = self.retention.description(value['id'])
            return {'artifacts': values, 'outstanding': outstanding,
                    'nextBefore': page[-1]['cursor'] if len(rows) > len(page) else None}
        row = c.operation(principal, args['artifactId'])
        require(row['kind'] == 'artifact', 'ARTIFACT_NOT_FOUND')
        c.reconcile(row)
        row = c.operation(principal, row['id'])
        pin = c.store.one('SELECT * FROM artifact WHERE operation=?', (row['id'],))
        require(pin and row['status'] == 'succeeded', 'ARTIFACT_NOT_RETAINED')
        if pin['pruned']:
            return {'artifactId': row['id'], 'contentDigest': pin['digest'], 'retained': False, 'pruneOperationId': pin['pruned']}
        from .artifact_build import verify_storage
        binding = json.loads(row['intent'])['binding']
        try:
            manifest = verify_storage(self.objects() / pin['digest'], pin['digest'])
        except OSError:
            raise Fault('ARTIFACT_STORAGE_UNAVAILABLE') from None
        check_manifest(manifest, binding)
        value = {'artifactId': row['id'], 'contentDigest': pin['digest'], 'manifest': manifest,
                 'validationId': binding['validationId'], 'verifiedBytes': True, 'artifactValidated': False}
        if manifest['recipe']['kind'] == 'service':
            from .artifact_runtime import compatibility
            value['runtimeCompatibility'] = compatibility(manifest['recipe']['service'], c.store.root)
        current = c.store.one("SELECT id FROM operation WHERE owner=? AND kind='validate' AND status='succeeded' "
                              "AND json_extract(intent,'$.artifactId')=? AND json_extract(intent,'$.policy')=? ORDER BY rowid DESC LIMIT 1",
                              (principal, row['id'], artifact_policy(c, c.config['repositories'][row['repo']])))
        value['artifactValidationId'] = None
        if current:
            try:
                self.validated(principal, current['id'])
                value.update(artifactValidated=True, artifactValidationId=current['id'])
            except (Fault, OSError):
                pass
        return value

    def objects(self):
        root = self.c.store.root / 'artifacts'
        require(not root.is_symlink(), 'ARTIFACT_STORAGE_TYPE')
        root.mkdir(mode=0o700, exist_ok=True)
        objects = root / 'objects'
        require(not objects.is_symlink(), 'ARTIFACT_STORAGE_TYPE')
        objects.mkdir(mode=0o700, exist_ok=True)
        import os
        for parent in (root, self.c.store.root):
            fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        return objects

    def prepare(self, principal, args):
        import uuid
        from .store import Store
        c = self.c
        fingerprint = digest({'kind': 'artifact', 'input': args})
        old = c.store.one('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId']))
        if old:
            old = c.operation(principal, old['id'])
            require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
            c.reconcile(old)
            return Store.public(c.operation(principal, old['id']))
        binding = inspect_recipe(c, principal, args)
        source = c.operation(principal, args['validationId'])
        cfg = c.config['repositories'][source['repo']]
        executor = c.executor_config(cfg)
        require(executor.get('kind') == 'native' and c.executor_override is None, 'NATIVE_FEATURE_REQUIRED')
        require('host' in cfg.get('networks', ['host']), 'NETWORK_DENIED')
        from .artifact_build import verify_tools
        from .native import environment
        verify_tools(binding['recipe'], environment(c.store.root)['PATH'])
        from .artifact_retention import limits
        selected = limits(c)
        require(args.get('timeout', min(300, selected['timeoutSeconds'])) <= selected['timeoutSeconds'], 'ARTIFACT_DEADLINE_LIMIT')
        reserved = self.retention.reserve(selected)
        opid = uuid.uuid4().hex
        git = c.git(source['repo'])
        candidate = binding['candidate']
        payload = {'id': opid, 'checkpoint': candidate, 'candidate': candidate,
                   'files': git.export(candidate), 'gitPack': git.execution_pack(candidate),
                   'command': binding['recipe']['build']['command'], 'cwd': '.', 'env': {},
                   'stdin': '', 'network': 'host', 'timeout': args.get('timeout', min(300, selected['timeoutSeconds'])),
                   'artifactLimits': selected,
                   'readonly': True, 'capturePaths': [], 'mode': 'command', 'environmentId': None,
                   'networkPolicyDigest': None, 'artifactBinding': binding}
        require(len(canonical(payload)) <= 48 * 1024 * 1024, 'SOURCE_LIMIT')
        intent = {'input': args, 'repositoryIdentity': cfg['identity'], 'binding': binding,
                  'executor': executor, 'inputDigest': digest(payload), 'reservedBytes': reserved,
                  'execution': {k: v for k, v in payload.items() if k not in ('files', 'gitPack', 'artifactBinding')}}
        with c.store.tx() as db:
            old = db.execute('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId'])).fetchone()
            if old:
                require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
                return Store.public(dict(old))
            require(db.execute("SELECT count(*) FROM operation WHERE owner=? AND kind='artifact' AND status IN ('running','unknown')",
                               (principal,)).fetchone()[0] < 8, 'ARTIFACT_BUILD_LIMIT')
            db.execute("PRAGMA user_version=5")
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) "
                       "VALUES(?,?,?,?,'artifact',?,?,?,'running','unknown',?)",
                       (opid, principal, args['requestId'], fingerprint, source['task'], source['repo'], source['ref'], canonical(intent).decode()))
        try:
            c.backend(intent).submit(payload)
        except Exception:
            c.fail(opid, Fault('ARTIFACT_DISPATCH_UNKNOWN', 'Observe the retained build identity; never resubmit with a new request', 'unknown'))
        return Store.public(c.operation(principal, opid))

    def reconcile(self, row):
        import os
        import shutil
        from .artifact_build import verify_storage, sync_tree
        c = self.c
        intent = json.loads(row['intent'])
        backend = c.backend(intent)
        result = backend.observe(row['id'])
        require(isinstance(result, dict), 'RECEIPT_FORMAT')
        if not result.get('terminal'):
            return
        require(result.get('terminal') is True and result.get('stopped') is True
                and result.get('id') == row['id'] and result.get('inputDigest') == intent['inputDigest'], 'RECEIPT_IDENTITY')
        require(result.get('exitCode') is None or type(result['exitCode']) is int, 'RECEIPT_FORMAT')
        require(all(type(result.get(k)) is bool for k in ('cancelled', 'timedOut')), 'RECEIPT_FORMAT')
        public = {k: result[k] for k in ('id', 'terminal', 'stopped', 'exitCode', 'cancelled', 'timedOut', 'captureError', 'discardedBytes') if k in result}
        public.update(validationId=intent['binding']['validationId'], artifactId=None, contentDigest=None)
        success = result.get('exitCode') == 0 and not any(result.get(k) for k in ('captureError', 'cancelled', 'timedOut'))
        if success:
            identity = result.get('artifactDigest')
            require(isinstance(identity, str) and re.fullmatch('[0-9a-f]{64}', identity), 'ARTIFACT_RECEIPT')
            source = backend.job(row['id']) / 'artifact'
            manifest = verify_storage(source, identity)
            check_manifest(manifest, intent['binding'])
            objects = self.objects()
            target = objects / identity
            if not target.exists():
                staging = objects / ('.' + row['id'])
                require(not staging.is_symlink(), 'ARTIFACT_STORAGE_TYPE')
                if staging.exists():
                    shutil.rmtree(staging)
                shutil.copytree(source, staging, symlinks=True)
                verify_storage(staging, identity)
                # copytree does not fsync copied file contents.
                for base, _, names in os.walk(staging):
                    for name in names:
                        with open(os.path.join(base, name), 'rb') as stream:
                            os.fsync(stream.fileno())
                sync_tree(staging)
                try:
                    os.rename(staging, target)
                except OSError:
                    if not target.is_dir():
                        raise
                    verify_storage(target, identity)
                    shutil.rmtree(staging)
                fd = os.open(objects, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            verify_storage(target, identity)
            public.update(artifactId=row['id'], contentDigest=identity)
        from .artifact_retention import storage_bytes
        import time
        size = storage_bytes(target) if success else None
        # Pin retained storage and publish completion in one SQLite transaction. Any
        # earlier crash can repeat seal verification, never acquisition/build execution.
        with c.store.tx() as db:
            if success:
                db.execute('INSERT OR IGNORE INTO artifact(operation,digest,bytes,retained_ns) VALUES(?,?,?,?)',
                           (row['id'], public['contentDigest'], size, time.time_ns()))
            db.execute("UPDATE operation SET status=?,effect='committed',result=?,error=NULL WHERE id=?",
                       ('succeeded' if success else 'failed', canonical(public).decode(), row['id']))

    def retained(self, principal, ident):
        from .artifact_build import verify_storage
        row = self.c.operation(principal, ident)
        require(row['kind'] == 'artifact' and row['status'] == 'succeeded', 'ARTIFACT_NOT_RETAINED')
        pin = self.c.store.one('SELECT * FROM artifact WHERE operation=?', (ident,))
        require(pin, 'ARTIFACT_NOT_RETAINED')
        require(not pin['pruned'], 'ARTIFACT_PRUNED')
        directory = self.objects() / pin['digest']
        try:
            manifest = verify_storage(directory, pin['digest'])
        except OSError:
            raise Fault('ARTIFACT_STORAGE_UNAVAILABLE') from None
        binding = json.loads(row['intent'])['binding']
        check_manifest(manifest, binding)
        return row, directory, manifest, binding, pin['digest']

    def validate(self, principal, args):
        import uuid
        from .store import Store
        from .artifact_runtime import verify_runtime
        from .native import environment
        c = self.c
        fingerprint = digest({'kind': 'validate', 'input': args})
        old = c.store.one('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId']))
        if old:
            old = c.operation(principal, old['id'])
            require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
            c.reconcile(old)
            return Store.public(c.operation(principal, old['id']))
        row, directory, manifest, binding, identity = self.retained(principal, args['artifactId'])
        cfg = c.config['repositories'][row['repo']]
        require(c.executor_config(cfg).get('kind') == 'native' and c.executor_override is None, 'NATIVE_FEATURE_REQUIRED')
        require('host' in cfg.get('networks', ['host']), 'NETWORK_DENIED')
        original = c.operation(principal, binding['validationId'])
        source_intent, _ = source_validation(original)
        require(source_intent['policy'] == c.validation_policy(cfg), 'VALIDATION_POLICY_CHANGED')
        service = manifest['recipe'].get('service')
        require(bool(service) == ('health' in args), 'ARTIFACT_HEALTH_REQUIRED', 'Service validation needs its own free loopback health port; file validation has no health probe')
        if service:
            verify_runtime(service, environment(c.store.root)['PATH'])
        from .artifact_retention import limits
        budget = limits(c)
        require(args.get('timeout', min(300, budget['timeoutSeconds'])) <= budget['timeoutSeconds'], 'ARTIFACT_DEADLINE_LIMIT')
        opid = uuid.uuid4().hex
        selected = {'directory': str(directory.resolve()), 'contentDigest': identity}
        if service:
            selected['health'] = args['health']
        payload = {'id': opid, 'checkpoint': binding['candidate'], 'candidate': binding['candidate'],
                   'command': cfg.get('artifactValidation', cfg['validation']), 'cwd': '.', 'env': {},
                   'stdin': '', 'network': 'host', 'timeout': args.get('timeout', min(300, budget['timeoutSeconds'])),
                   'artifactLimits': budget,
                   'readonly': True, 'capturePaths': [], 'mode': 'command', 'environmentId': None,
                   'artifactValidation': selected}
        intent = {'input': args, 'repositoryIdentity': cfg['identity'], 'validationSubject': 'artifact',
                  'artifactId': row['id'], 'contentDigest': identity, 'sourceValidationId': original['id'],
                  'candidate': binding['candidate'], 'policy': artifact_policy(c, cfg),
                  'executor': {'kind': 'native'}, 'execution': payload, 'inputDigest': digest(payload)}
        with c.store.tx() as db:
            old = db.execute('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId'])).fetchone()
            if old:
                require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
                return Store.public(dict(old))
            require(db.execute("SELECT count(*) FROM operation WHERE owner=? AND status IN ('running','unknown') AND json_extract(intent,'$.validationSubject')='artifact'", (principal,)).fetchone()[0] < 8, 'ARTIFACT_VALIDATION_LIMIT')
            db.execute("PRAGMA user_version=5")
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent) VALUES(?,?,?,?,'validate',?,?,?,'running','unknown',?)",
                       (opid, principal, args['requestId'], fingerprint, row['task'], row['repo'], row['ref'], canonical(intent).decode()))
        try:
            c.backend(intent).submit(payload)
        except Exception:
            c.fail(opid, Fault('ARTIFACT_DISPATCH_UNKNOWN', 'Observe this validation; never silently redispatch', 'unknown'))
        return Store.public(c.operation(principal, opid))

    def reconcile_validation(self, row):
        intent = json.loads(row['intent'])
        result = self.c.backend(intent).observe(row['id'])
        require(isinstance(result, dict), 'RECEIPT_FORMAT')
        if not result.get('terminal'):
            return
        require(result.get('terminal') is True and result.get('stopped') is True
                and result.get('id') == row['id'] and result.get('inputDigest') == intent['inputDigest'], 'RECEIPT_IDENTITY')
        require(result.get('exitCode') is None or type(result['exitCode']) is int, 'RECEIPT_FORMAT')
        require(all(type(result.get(k)) is bool for k in ('cancelled', 'timedOut')), 'RECEIPT_FORMAT')
        public = {k: result[k] for k in ('id', 'terminal', 'stopped', 'exitCode', 'cancelled', 'timedOut', 'captureError', 'discardedBytes') if k in result}
        success = type(result.get('exitCode')) is int and result['exitCode'] == 0 and not any(result.get(k) for k in ('cancelled', 'timedOut', 'captureError'))
        if success:
            require(result.get('artifactChecked') is True, 'ARTIFACT_CHECK_RECEIPT')
            self.retained(row['owner'], intent['artifactId'])
        public.update(artifactId=intent['artifactId'], contentDigest=intent['contentDigest'],
                      sourceValidationId=intent['sourceValidationId'], artifactChecked=bool(success))
        self.c.finish(row['id'], public, status='succeeded' if success else 'failed')

    def validated(self, principal, ident):
        from .artifact_runtime import verify_runtime
        from .native import environment
        row = self.c.operation(principal, ident)
        intent = json.loads(row['intent'])
        require(row['kind'] == 'validate' and intent.get('validationSubject') == 'artifact'
                and row['status'] == 'succeeded' and row['effect'] == 'committed' and row['result'], 'ARTIFACT_VALIDATION_REQUIRED')
        result = json.loads(row['result'])
        require(result.get('id') == ident and result.get('terminal') is True and result.get('stopped') is True
                and type(result.get('exitCode')) is int and result['exitCode'] == 0 and result.get('artifactChecked') is True
                and not any(result.get(k) for k in ('cancelled', 'timedOut', 'captureError'))
                and all(result.get(k) == intent[k] for k in ('artifactId', 'contentDigest', 'sourceValidationId')), 'ARTIFACT_VALIDATION_RECEIPT')
        cfg = self.c.config['repositories'][row['repo']]
        require(intent['policy'] == artifact_policy(self.c, cfg), 'ARTIFACT_VALIDATION_POLICY_CHANGED')
        artifact, directory, manifest, binding, identity = self.retained(principal, intent['artifactId'])
        require(artifact['repo'] == row['repo'] and identity == intent['contentDigest']
                and binding['validationId'] == intent['sourceValidationId']
                and binding['candidate'] == intent['candidate'] == intent['execution']['candidate']
                and intent['execution']['checkpoint'] == binding['candidate'], 'ARTIFACT_VALIDATION_RECEIPT')
        source, _ = source_validation(self.c.operation(principal, binding['validationId']))
        require(source['policy'] == self.c.validation_policy(cfg), 'VALIDATION_POLICY_CHANGED')
        require(intent['execution']['artifactValidation']['contentDigest'] == identity
                and digest(intent['execution']) == intent['inputDigest'], 'ARTIFACT_VALIDATION_RECEIPT')
        if manifest['recipe'].get('service'):
            verify_runtime(manifest['recipe']['service'], environment(self.c.store.root)['PATH'])
        return row, intent, directory, manifest
