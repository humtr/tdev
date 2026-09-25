import base64
import copy
import fcntl
import hmac
import json
import re
import sqlite3
import threading
import time
import uuid
import weakref
from pathlib import Path

from .common import Fault, canonical, digest, load_contract, path, private_file, require, branch_ref
from .git import Git
from .store import Store
from .projects import Projects, apply_projects, validate_policies, authority
from .workspaces import Workspaces
from .checkout import Checkout
from .integration import integrate
from .deployments import Deployments
from .artifacts import Artifacts, source_validation


class Controller:
    def __init__(self, directory, config, executor=None):
        self.config_source = config
        self.config = self.load_config()
        self.schema, self.validator = load_contract()
        self.store = Store(directory)
        self.config = self.load_config()
        self.projects = Projects(self)
        self.workspaces = Workspaces(self)
        self.deployments = Deployments(self)
        self.artifacts = Artifacts(self)
        self.gits = {}
        # Tests may inject fixtures; normal installations use the native runner.
        self.executor_override = executor
        self.reconcile_locks = weakref.WeakValueDictionary()
        self.reconcile_locks_guard = threading.Lock()
        # Optional adapter; the operational core never imports the diagnostic runtime.
        self.diagnostic_handler = None

    def load_config(self):
        from jsonschema import Draft202012Validator
        value = copy.deepcopy(self.config_source) if isinstance(self.config_source, dict) else json.loads(private_file(self.config_source))
        config_schema = json.loads((Path(__file__).resolve().parents[2] / "contracts/config.schema.json").read_bytes())
        require(Draft202012Validator(config_schema).is_valid(value), "CONFIG", "Invalid operator configuration")
        require(value.get("version") == 1 and isinstance(value.get("principals"), dict)
                and isinstance(value.get("repositories"), dict), "CONFIG")
        hashes = [p["tokenHash"] for p in value["principals"].values()]
        require(len(hashes) == len(set(hashes)), "CONFIG", "One credential must identify one principal")
        for name, repo in value["repositories"].items():
            require(re.fullmatch(r"[A-Za-z0-9_.-]+", name) and repo.get("kind") in ("local", "github"), "CONFIG")
            require(all(re.fullmatch(r"refs/heads/[A-Za-z0-9_./-]+", r) and ".." not in r
                        and not r.endswith("/") for r in repo["refs"]), "CONFIG")
            require(isinstance(repo["validation"], str) and repo["validation"], "CONFIG")
            require(all(branch_ref(r) for r in repo['refs']), 'CONFIG')
            for ns in repo.get('managedRefNamespaces', []):
                require(branch_ref(ns + 'probe') and all(not r.startswith(ns) and not ns.startswith(r + '/') for r in repo['refs']), 'CONFIG',
                        'Managed namespaces must not overlap enrolled branches')
        validate_policies(value)
        return apply_projects(value, self.store) if hasattr(self, 'store') else value

    def authenticate(self, token):
        config = self.load_config()
        hashed = digest(token.encode())
        for principal, entry in config["principals"].items():
            if hmac.compare_digest(hashed, entry.get("tokenHash", "")):
                return principal
        raise Fault("AUTHENTICATION_REQUIRED")

    def authorize(self, principal, repo=None, ref=None):
        require(principal in self.config["principals"], "PERMISSION_DENIED")
        if repo is not None:
            p = self.config["principals"][principal]
            require(repo in self.config['repositories'], 'PERMISSION_DENIED')
            if ref in p.get('repos', {}).get(repo, []) and ref in self.config['repositories'][repo]['refs']:
                return
            owned = self.store.one('SELECT * FROM task WHERE owner=? AND repo=? AND ref=? AND managed=1', (principal, repo, ref))
            require(owned is not None, 'PERMISSION_DENIED')
            require(owned['source_ref'] in p.get('repos', {}).get(repo, []) and owned['source_ref'] in self.config['repositories'][repo]['refs'], 'PERMISSION_DENIED')
            require(owned['namespace'] in self.namespaces(principal, repo), 'MANAGED_REF_DENIED',
                    'Managed branch capability was revoked; operator delegation is required')

    def namespaces(self, principal, repo):
        configured = self.config['repositories'][repo].get('managedRefNamespaces', [])
        granted = self.config['principals'][principal].get('managedRefNamespaces', {}).get(repo, [])
        return sorted(set(configured) & set(granted))

    def git(self, repo):
        c = self.config["repositories"][repo]
        key = (repo, digest(c))
        if key not in self.gits:
            self.gits[key] = Git(self.store.root / "objects" / (repo + ".git"), c)
        return self.gits[key]

    def task(self, principal, ident):
        row = self.store.one("SELECT * FROM task WHERE id=?", (ident,))
        require(row and row["owner"] == principal, "TASK_NOT_FOUND")
        self.workspaces.get(principal, row['workspace'])
        self.authorize(principal, row["repo"], row["ref"])
        require(row["identity"] == self.config["repositories"][row["repo"]]["identity"], "REPOSITORY_IDENTITY")
        return row

    def operation(self, principal, ident):
        row = self.store.one("SELECT * FROM operation WHERE id=?", (ident,))
        require(row and row["owner"] == principal, "OPERATION_NOT_FOUND")
        if row['kind'] == 'deploy':
            self.deployments.get(principal, json.loads(row['intent'])['deploymentId'])
        if row['kind'] == 'workspace':
            self.workspaces.get(principal, json.loads(row['intent'])['workspaceId'])
            return row
        if row['kind'] == 'project':
            intent = json.loads(row['intent'])
            self.projects.policy(principal, intent['input']['policy'], intent['authority'])
            return row
        self.authorize(principal, row["repo"], row["ref"])
        require(json.loads(row["intent"])["repositoryIdentity"] == self.config["repositories"][row["repo"]]["identity"], "REPOSITORY_IDENTITY")
        source = json.loads(row['intent']).get('integrationSource')
        if source:
            self.task(principal, source['taskId'])
        return row

    def call(self, principal, tool, args):
        # Installation fences admissions; observations/reconciliation remain usable.
        with open(self.store.root / 'admission.lock', 'a+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_SH)
            from contextlib import nullcontext
            guarded = tool in ('tdev_artifact', 'tdev_deploy') or (tool == 'tdev_validate' and args.get('subject') == 'artifact')
            with self.artifacts.lock if guarded else nullcontext():
                return self._call(principal, tool, args)

    def _call(self, principal, tool, args):
        try:
            self.config = self.load_config()
            self.authorize(principal)
            errors = list(self.validator.iter_errors({"tool": tool, "input": args}))
            require(not errors, "SCHEMA", "Input does not match the public contract")
            require(len(canonical(args)) <= 2 * 1024 * 1024, "INPUT_LIMIT")
            kind = tool.removeprefix("tdev_")
            if kind == 'diagnostics':
                if args['action'] in ('activate', 'report', 'stop'):
                    require(self.config['principals'][principal].get('diagnostics', False), 'PERMISSION_DENIED')
                    require(not (self.store.root / 'maintenance.json').exists(), 'MAINTENANCE')
                require(self.diagnostic_handler is not None, 'DIAGNOSTICS_UNAVAILABLE')
                return {'ok': True, 'result': self.diagnostic_handler(principal, args)}
            read_only = kind == 'read' or (kind == 'artifact' and args.get('action') in ('inspectRecipe', 'inspect', 'list', 'usage', 'export', 'prunePreview')) or (kind in ('workspace', 'task', 'project', 'deploy') and args.get('action') in ('list', 'inspect', 'targets')) or (kind == 'operation' and args.get('action') == 'status')
            require(read_only or not (self.store.root / 'maintenance.json').exists(),
                    'MAINTENANCE', 'Installation update in progress; inspect existing operations and retry later')
            if kind == 'validate' and args.get('subject') == 'artifact':
                return {'ok': True, 'result': self.artifacts.validate(principal, args)}
            if kind == 'artifact':
                if read_only:
                    result = self.artifacts.read(principal, args)
                elif args['action'] == 'prune':
                    result = self.artifacts.retention.prune(principal, args)
                else:
                    result = self.artifacts.prepare(principal, args)
                return {'ok': True, 'result': result}
            if kind == 'deploy':
                result = (self.deployments.read(principal, args) if read_only else self.deployments.change(principal, args))
                return {'ok': True, 'result': result}
            if kind == 'workspace':
                if args['action'] == 'list':
                    result = self.workspaces.list(principal, args)
                elif args['action'] == 'inspect':
                    result = self.workspaces.inspect(principal, args)
                else:
                    result = self.workspaces.change(principal, args)
                return {'ok': True, 'result': result}
            if kind == 'project':
                if args['action'] == 'list':
                    return {'ok': True, 'result': self.projects.list(principal)}
                if args['action'] == 'inspect':
                    return {'ok': True, 'result': self.projects.inspect(principal, args['repo'])}
                return {'ok': True, 'result': self.project_change(principal, args)}
            if kind == "read":
                return {"ok": True, "result": self.read(principal, args)}
            if kind == "task" and args["action"] == "list":
                return {"ok": True, "result": self.discover(principal, args)}
            if kind == "task" and args["action"] == "inspect":
                return {"ok": True, "result": self.inspect(principal, args)}
            if kind == "operation" and args["action"] == "status":
                return {"ok": True, "result": self.status(principal, args)}
            return {"ok": True, "result": self.mutate(principal, kind, args)}
        except Fault as e:
            return {"ok": False, "error": e.value}
        except (UnicodeError, ValueError, KeyError):
            return {"ok": False, "error": Fault("INVALID_DATA").value}

    def discover(self, principal, args=None):
        args = args or {}
        if 'workspaceId' in args:
            self.workspaces.get(principal, args['workspaceId'])
        repos = []
        for name, refs in self.config["principals"][principal].get("repos", {}).items():
            for ref in refs:
                self.authorize(principal, name, ref)
                try:
                    repos.append({"repo": name, "ref": ref, "head": self.git(name).head(ref)})
                except Fault as e:
                    repos.append({"repo": name, "ref": ref, "error": e.value})
        rows = self.store.all("SELECT rowid AS cursor,* FROM task WHERE owner=? AND rowid>? AND (closed=0 OR ?) "
                              "AND (? IS NULL OR workspace=?) ORDER BY rowid LIMIT ?",
                              (principal, args.get("after", 0), int(args.get("includeClosed", False)),
                               args.get('workspaceId'), args.get('workspaceId'), args.get("limit", 20) + 1))
        page = rows[:args.get("limit", 20)]
        tasks = []
        for row in page:
            try:
                tasks.append(self.task(principal, row['id']))
            except Fault:
                continue
        return {"repositories": repos, "tasks": tasks,
                "nextAfter": page[-1]["cursor"] if len(rows) > len(page) else None,
                "execution": "Termux-native by default: same-UID developer authority, host network, not a sandbox. Explicit SSH/OCI is optional."}

    @staticmethod
    def observation(value, since, sources):
        cursor = digest(value)
        return {"cursor": cursor, "changed": since != cursor, "observedAtNs": str(time.time_ns()),
                "sources": sources, "pollAfterMs": 1000}

    def inspect(self, principal, args):
        """Bounded derived frontier, not a planner or a new durable owner."""
        started = str(time.time_ns())
        w = self.task(principal, args["taskId"])
        busy = self.status(principal, {"operationId": w["busy"], "limit": 1}) if w["busy"] else None
        processes = [self.status(principal, {"operationId": row['id'], "limit": 1})
                     for row in self.store.all("SELECT id FROM operation WHERE task=? AND kind='exec' "
                         "AND status IN ('running','unknown') AND json_extract(intent,'$.input.mode')='process' ORDER BY rowid LIMIT 8", (w['id'],))]
        builds = [self.status(principal, {'operationId': r['id'], 'limit': 1}) for r in
                  self.store.all("SELECT id FROM operation WHERE task=? AND (kind='artifact' OR json_extract(intent,'$.validationSubject')='artifact' OR json_extract(intent,'$.artifactPrune') IS NOT NULL) AND status IN ('running','unknown') ORDER BY rowid LIMIT 24", (w['id'],))]
        # Descending rowid pagination includes closed tasks and old cleanup owners.
        before, limit = args.get("before", 9007199254740991), args.get("limit", 20)
        rows = self.store.all("SELECT rowid AS cursor,* FROM operation WHERE owner=? AND (task=? OR json_extract(intent,'$.targetOperation') IN (SELECT id FROM operation WHERE task=?)) AND rowid<? ORDER BY rowid DESC LIMIT ?",
                              (principal, w["id"], w["id"], before, limit + 1))
        operations = []
        for row in rows[:limit]:
            item = Store.public(row)
            item["requestId"] = row["request"]
            item["cleanup"] = "none"
            if row["kind"] in ("exec", "validate", "artifact"):
                retired = self.store.one("SELECT id FROM operation WHERE owner=? AND kind='operation' AND status='succeeded' AND json_extract(intent,'$.targetOperation')=? AND json_extract(intent,'$.input.action')='retire' LIMIT 1", (principal, row["id"]))
                item["cleanup"] = "retired" if retired else "retire" if (item["result"] or {}).get("stopped") else "observe"
            operations.append(item)
        w = self.task(principal, w["id"])
        try:
            remote = {"head": self.git(w["repo"]).head(w["ref"], missing=bool(w['managed']))}
        except Fault as error:
            remote = {"error": error.value}
        result = {"task": w, "remote": remote, "operations": operations,
                  "processes": processes,
                  "builds": builds,
                  "environment": {"path": str(self.store.root.resolve() / 'native/environments' / w['id']),
                                  "present": (self.store.root / 'native/environments' / w['id']).exists()},
                  "active": busy if busy and w["busy"] == busy["id"] else None,
                  "nextBefore": rows[limit - 1]["cursor"] if len(rows) > limit else None,
                  "mutationReady": not w["closed"] and not w["busy"],
                  "baseMatchesRemote": remote.get("head") == w["base"]}
        result['refCleanup'] = ('unmanaged' if not w['managed'] else 'observe' if w['busy'] or 'error' in remote
                                else 'done' if w['ref_state'] == 'deleted' and remote.get('head') is None
                                else 'ready' if remote.get('head') == w['published_oid'] else 'changed')
        result["observation"] = self.observation(result, args.get("since"), ["SQLite", "busy and process executors if present", "Git remote head"])
        result["observation"]["startedAtNs"] = started
        return result

    def read(self, principal, args):
        w = self.task(principal, args["taskId"])
        g = self.git(w["repo"])
        checkpoint = args.get('checkpoint', w['checkpoint'])
        require(g.call("merge-base", "--is-ancestor", checkpoint, w["checkpoint"], check=False).returncode == 0, "SOURCE_NOT_IN_TASK")
        entries = g.entries(checkpoint)
        remaining = args.get("budget", 24000)
        results = []
        for query in args["queries"]:
            item = {"action": query["action"]}
            try:
                prefix = path(query.get("path", "."), dot=True)
                names = [n for n in sorted(entries) if prefix == "." or n == prefix or n.startswith(prefix + "/")]
                action = query["action"]
                offset = query.get("offset", 0)
                if action == "file":
                    require(prefix in entries, "FILE_NOT_FOUND")
                    mode, oid = entries[prefix]
                    data = g.blob(oid)
                    chunk = data[offset:offset + min(query.get("limit", 24000), remaining)]
                    item.update(path=prefix, blob=oid, mode=mode, size=len(data), offset=offset,
                                data=base64.b64encode(chunk).decode(), encoding="base64",
                                nextOffset=offset + len(chunk), complete=offset + len(chunk) >= len(data))
                    remaining -= len(chunk)
                elif action == "list":
                    selected, used = [], 0
                    for n in names[offset:]:
                        size = len(n.encode()) + 100
                        if used + size > remaining:
                            break
                        selected.append({"path": n, "mode": entries[n][0], "blob": entries[n][1]})
                        used += size
                    remaining -= used
                    item.update(entries=selected, nextOffset=offset + len(selected), complete=offset + len(selected) == len(names))
                elif action == "search":
                    needle = query["text"].encode()
                    hits, scanned, next_offset = [], 0, offset
                    for n in names[offset:]:
                        data = g.blob(entries[n][1])
                        if scanned + len(data) > 16 * 1024 * 1024 or remaining < len(n.encode()) + 100:
                            break
                        scanned += len(data)
                        at = data.find(needle)
                        if at >= 0:
                            hits.append({"path": n, "byteOffset": at})
                            remaining -= len(n.encode()) + 100
                        next_offset += 1
                    item.update(hits=hits, nextOffset=next_offset, complete=next_offset == len(names), scannedBytes=scanned)
                else:
                    if action == 'diff':
                        base = query.get('base', w['base'])
                        require(g.call('merge-base', '--is-ancestor', base, w['checkpoint'], check=False).returncode == 0,
                                'SOURCE_NOT_IN_TASK')
                        flag = {'stat': '--stat', 'patch': '--patch', 'names': '--name-status'}[query.get('format', 'stat')]
                        data = g.call('diff', '--no-ext-diff', '--no-textconv', '--no-color', flag,
                                      base, checkpoint, '--', *([] if prefix == '.' else [':(literal)' + prefix])).stdout
                    else:
                        data = g.call('log', '-20', '--format=%H %s', checkpoint).stdout
                    chunk = data[offset:offset + min(query.get('limit', 65536), remaining)]
                    item.update(text=chunk.decode(errors="replace"), data=base64.b64encode(chunk).decode(), encoding='base64',
                                offset=offset, nextOffset=offset + len(chunk),
                                complete=offset + len(chunk) >= len(data))
                    remaining -= len(chunk)
            except Fault as e:
                item["error"] = e.value
            results.append(item)
        return {"checkpoint": checkpoint, "busy": w["busy"], "items": results}

    def project_change(self, principal, args):
        fingerprint = digest({'kind': 'project', 'input': args})
        old = self.store.one('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId']))
        if old:
            old = self.operation(principal, old['id'])
            require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
            self.reconcile(old)
            return Store.public(self.operation(principal, old['id']))
        policy = self.projects.policy(principal, args['policy'])
        require(args['action'] != 'create' or policy.get('allowCreate', False), 'PROJECT_CREATE_DENIED',
                'This project policy permits connecting existing projects only')
        opid = uuid.uuid4().hex
        intent = {'input': args, 'authority': authority(policy)}
        with self.store.tx() as db:
            old = db.execute('SELECT * FROM operation WHERE owner=? AND request=?', (principal, args['requestId'])).fetchone()
            if old:
                require(old['hash'] == fingerprint, 'IDEMPOTENCY_MISMATCH')
                return Store.public(dict(old))
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,status,effect,intent) VALUES(?,?,?,?, 'project','running','none',?)",
                       (opid, principal, args['requestId'], fingerprint, canonical(intent).decode()))
        try:
            cfg = (self.projects.create(opid, policy, args['name']) if args['action'] == 'create'
                   else self.projects.describe(policy, args['name']))
            self.projects.complete(self.store.one('SELECT * FROM operation WHERE id=?', (opid,)), cfg)
        except Fault as error:
            row = self.store.one('SELECT * FROM operation WHERE id=?', (opid,))
            # Explicit provider rejections prove no creation; transport/late failures do not.
            definite = (not json.loads(row['intent']).get('createdIdentity') and error.value['code'] in
                        ('PROVIDER_AUTH_REQUIRED', 'PROVIDER_PERMISSION_DENIED', 'PROVIDER_CONFLICT', 'PROJECT_EXISTS'))
            uncertain = row['effect'] == 'unknown' and not definite
            self.fail(opid, Fault(error.value['code'], error.value['message'], 'unknown' if uncertain else 'none'))
        except Exception:
            self.fail(opid, Fault('PROJECT_UNKNOWN', 'Project creation interrupted; inspect the original request', 'unknown'))
            raise
        return Store.public(self.operation(principal, opid))

    def resolve_start(self, principal, args):
        if args.get('fromTaskId'):
            source = self.task(principal, args['fromTaskId'])
            require(source['managed'] and source['published_oid'] and not source['busy'], 'PUBLISHED_TASK_REQUIRED',
                    'Continuation uses a proved published task, including after branch cleanup')
            require(args.get('repo', source['repo']) == source['repo'] and 'baseRef' not in args, 'SOURCE_CHANGED')
            require(args.get('expectedHead', source['published_oid']) == source['published_oid'], 'STALE_HEAD')
            return {'repo': source['repo'], 'sourceRef': source['source_ref'], 'base': source['published_oid'],
                    'namespace': source['namespace'], 'fromTaskId': source['id']}
        repos = self.config['principals'][principal].get('repos', {})
        available = [r for r in repos if r in self.config['repositories'] and set(repos[r]) & set(self.config['repositories'][r]['refs'])]
        repo = self.workspaces.select_project(principal, args) or self.config['principals'][principal].get('defaultRepo')
        if repo is None:
            require(len(available) == 1, 'PROJECT_REQUIRED', 'Choose a repo from tdev_project list; no project is guessed when several are available')
            repo = available[0]
        require(repo in available, 'PERMISSION_DENIED')
        cfg = self.config['repositories'][repo]
        refs = sorted(set(repos[repo]) & set(cfg['refs']))
        ref = args.get('baseRef') or cfg.get('defaultRef') or (refs[0] if len(refs) == 1 else None)
        require(ref is not None, 'BASE_REF_REQUIRED', 'Choose an allowed baseRef for this project')
        self.authorize(principal, repo, ref)
        namespaces = self.namespaces(principal, repo)
        require(namespaces, 'MANAGED_REF_DENIED', 'Project has no delegated managed namespace; connect through a project policy or configure delegation once')
        base = self.git(repo).head(ref)
        require('expectedHead' not in args or args['expectedHead'] == base, 'STALE_HEAD')
        return {'repo': repo, 'sourceRef': ref, 'base': base, 'namespace': namespaces[0]}

    def mutate(self, principal, kind, args):
        request = args["requestId"]
        fingerprint = digest({"kind": kind, "input": args})
        old = self.store.one("SELECT * FROM operation WHERE owner=? AND request=?", (principal, request))
        if old:
            old = self.operation(principal, old["id"])
            require(old["hash"] == fingerprint, "IDEMPOTENCY_MISMATCH")
            alias = json.loads(old["intent"]).get("aliasOf")
            if alias:
                old = self.operation(principal, alias)
            self.reconcile(old)
            return Store.public(self.operation(principal, old["id"]))
        w, validation, target, resolved, source = None, None, None, None, None
        if kind == 'task' and args['action'] == 'start':
            resolved = self.resolve_start(principal, args)
            repo, ref = resolved['repo'], resolved['sourceRef']
        elif kind == "task" and args["action"] in ("open", "compose"):
            repo, ref = args["repo"], args["ref"]
            require(ref in self.config['repositories'].get(repo, {}).get('refs', []), 'REF_DENIED',
                    'Open/compose requires an enrolled exact ref; managed branches belong to their original task')
        elif kind == "publish":
            validation = self.operation(principal, args["validationId"])
            require(validation["kind"] == "validate", "VALIDATION_REQUIRED")
            require(json.loads(validation['intent']).get('validationSubject', 'source') == 'source', 'SOURCE_VALIDATION_REQUIRED')
            w = self.task(principal, validation["task"])
            repo, ref = w["repo"], w["ref"]
        elif kind == "operation":
            target = self.operation(principal, args["operationId"])
            require(target["kind"] in ("exec", "validate", "artifact"), "PROCESS_REQUIRED")
            repo, ref = target["repo"], target["ref"]
        else:
            w = self.task(principal, args["taskId"])
            repo, ref = w["repo"], w["ref"]
        self.authorize(principal, repo, ref)
        if kind == 'task' and args['action'] == 'integrate':
            source = self.task(principal, args['sourceTaskId'])
            require(source['repo'] == repo and source['id'] != w['id'], 'INTEGRATION_SOURCE')
            source_checkpoint = args.get('sourceCheckpoint', source['checkpoint'])
            g = self.git(repo)
            require(g.call('merge-base', '--is-ancestor', source_checkpoint, source['checkpoint'], check=False).returncode == 0,
                    'SOURCE_NOT_IN_TASK')
            require(g.call('merge-base', '--is-ancestor', source['base'], source_checkpoint, check=False).returncode == 0,
                    'SOURCE_NOT_IN_TASK')
            require(g.call('merge-base', '--is-ancestor', source['base'], w['base'], check=False).returncode == 0,
                    'UNRELATED_BASE', 'Start a task on the newer base, then integrate the older task changes into it')
        opid = uuid.uuid4().hex
        intent = {"input": args, "repositoryIdentity": self.config["repositories"][repo]["identity"]}
        if resolved:
            intent['resolved'] = resolved
        if source:
            intent['integrationSource'] = {'taskId': source['id'], 'checkpoint': source_checkpoint, 'base': source['base']}
        with self.store.tx() as db:
            old = db.execute("SELECT * FROM operation WHERE owner=? AND request=?", (principal, request)).fetchone()
            if old:
                require(old["hash"] == fingerprint, "IDEMPOTENCY_MISMATCH")
                alias = json.loads(old["intent"]).get("aliasOf")
                if alias:
                    old = db.execute("SELECT * FROM operation WHERE id=?", (alias,)).fetchone()
                return Store.public(dict(old))
            if kind == "publish":
                old = db.execute("SELECT * FROM operation WHERE publication=?", (validation["id"],)).fetchone()
                if old:
                    require(json.loads(old["intent"])["input"] == {**args, "requestId": json.loads(old["intent"])["input"]["requestId"]}, "IDEMPOTENCY_MISMATCH")
                    alias_intent = {**intent, "aliasOf": old["id"]}
                    db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent,result) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                               (opid, principal, request, fingerprint, kind, None, repo, ref,
                                "succeeded", "committed", canonical(alias_intent).decode(), canonical({"originalOperationId": old["id"]}).decode()))
                    return Store.public(dict(old))
            if w:
                current = dict(db.execute("SELECT * FROM task WHERE id=?", (w["id"],)).fetchone())
                cleanup = kind == 'task' and args['action'] in ('cleanup', 'resetEnvironment')
                require((cleanup or not current['closed']) and not current['busy'], 'TASK_BUSY')
                if "expected" in args:
                    require(current["checkpoint"] == args["expected"], "STALE_CHECKPOINT")
                w = current
                intent["task"] = w
                if kind == 'task' and args['action'] == 'resetEnvironment':
                    require(not db.execute("SELECT id FROM operation WHERE task=? AND kind IN ('exec','validate') AND status IN ('running','unknown') LIMIT 1", (w['id'],)).fetchone(),
                            'ENVIRONMENT_BUSY', 'Observe and stop outstanding executions before resetting dependencies')
                if kind == 'exec' and args.get('mode') == 'process':
                    count = db.execute("SELECT count(*) FROM operation WHERE task=? AND kind='exec' AND status IN ('running','unknown') AND json_extract(intent,'$.input.mode')='process'", (w['id'],)).fetchone()[0]
                    require(count < 8, 'PROCESS_LIMIT', 'Inspect and stop existing processes before starting more')
            elif kind == 'task':
                intent['workspaceId'] = self.workspaces.bind(db, principal, args, repo)
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,repo,ref,status,effect,intent,publication) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (opid, principal, request, fingerprint, kind, w["id"] if w else None,
                        repo, ref, "running", "none", canonical(intent).decode(), validation["id"] if validation else None))
            if w and not (kind == 'exec' and args.get('mode') == 'process'):
                db.execute("UPDATE task SET busy=? WHERE id=?", (opid, w["id"]))
        try:
            if kind == "task":
                self.task_change(opid, principal, repo, ref, args, w)
            elif kind == "edit":
                checkpoint = self.git(repo).edit(w["checkpoint"], args["edits"], opid)
                self.finish(opid, {"taskId": w["id"], "checkpoint": checkpoint}, checkpoint=checkpoint)
            elif kind in ("exec", "validate"):
                self.launch(opid, kind, w, args)
            elif kind == "publish":
                self.publish(opid, w, args, validation)
            else:
                ti = json.loads(target["intent"])
                if args["action"] == "retire":
                    require(target["status"] in ("succeeded", "failed", "cancelled") and target["result"], "PROCESS_NOT_RECONCILED")
                    require(json.loads(target["result"]).get("stopped") is True, "STOP_PROOF_REQUIRED")
                else:
                    require(target["status"] in ("running", "unknown"), "PROCESS_TERMINAL")
                self.save_intent(opid, targetOperation=target["id"], executor=ti.get("executor"))
                result = (self.backend(ti).retire(target["id"], opid) if args["action"] == "retire"
                          else self.backend(ti).control(target["id"], args, opid))
                self.finish(opid, result)
        except Fault as e:
            # A fault after external dispatch preserves unknown and its writer.
            self.fail(opid, e)
        except Exception:
            self.fail(opid, Fault("INTERNAL", "Operation interrupted; inspect retained identity", "unknown"))
            raise
        return Store.public(self.store.one("SELECT * FROM operation WHERE id=?", (opid,)))

    def save_intent(self, opid, **changes):
        with self.store.tx() as db:
            row = db.execute("SELECT intent FROM operation WHERE id=?", (opid,)).fetchone()
            value = json.loads(row[0])
            value.update(changes)
            db.execute("UPDATE operation SET intent=?,effect='unknown' WHERE id=?", (canonical(value).decode(), opid))
        return value

    def finish(self, opid, result, checkpoint=None, closed=False, status="succeeded", published=None, ref_state=None):
        with self.store.tx() as db:
            row = db.execute("SELECT task,status,kind,intent FROM operation WHERE id=?", (opid,)).fetchone()
            if row["status"] in ("succeeded", "failed", "cancelled"):
                return
            process = (row['kind'] == 'exec' and json.loads(row['intent'])['input'].get('mode') == 'process') or json.loads(row['intent']).get('validationSubject') == 'artifact'
            if row["task"] and not process:
                current = db.execute("SELECT busy FROM task WHERE id=?", (row["task"],)).fetchone()
                require(current and current[0] == opid, "WRITER_CHANGED")
                db.execute("UPDATE task SET checkpoint=COALESCE(?,checkpoint),busy=NULL,closed=? WHERE id=?",
                           (checkpoint, int(closed), row["task"]))
                if published is not None:
                    db.execute("UPDATE task SET published_oid=?,ref_state='published' WHERE id=?", (published, row['task']))
                if ref_state is not None:
                    db.execute('UPDATE task SET ref_state=? WHERE id=?', (ref_state, row['task']))
            db.execute("UPDATE operation SET status=?,effect='committed',result=?,error=NULL WHERE id=?",
                       (status, canonical(result).decode(), opid))

    def fail(self, opid, fault):
        unknown = fault.value["effect"] == "unknown"
        with self.store.tx() as db:
            db.execute("UPDATE operation SET status=?,effect=?,error=? WHERE id=?",
                       ("unknown" if unknown else "failed", fault.value["effect"], canonical(fault.value).decode(), opid))
            if not unknown:
                db.execute("UPDATE task SET busy=NULL WHERE busy=?", (opid,))

    def task_change(self, opid, principal, repo, ref, args, w):
        if args['action'] == 'resetEnvironment':
            self.save_intent(opid, environmentReset=True)
            self.reset_environment(opid, w)
            return
        if args['action'] == 'cleanup':
            self.cleanup(opid, w)
            return
        if args["action"] == "close":
            self.finish(opid, {"taskId": w["id"], "closed": True}, closed=True)
            return
        if args['action'] == 'integrate':
            intent = json.loads(self.store.one('SELECT intent FROM operation WHERE id=?', (opid,))['intent'])
            source = intent['integrationSource']
            try:
                result = integrate(self.git(repo), w['checkpoint'], source['base'], source['checkpoint'],
                                   args.get('resolutions', []), opid)
            except Fault as error:
                # Only private objects may have been written; the task pointer has not committed.
                raise Fault(error.value['code'], error.value['message']) from None
            result.update(taskId=w['id'], sourceTaskId=source['taskId'], sourceBase=source['base'],
                          sourceCheckpoint=source['checkpoint'])
            self.finish(opid, result, checkpoint=result['checkpoint'] if result['applied'] else None)
            return
        g = self.git(repo)
        managed = args['action'] == 'start'
        intent = json.loads(self.store.one('SELECT intent FROM operation WHERE id=?', (opid,))['intent'])
        resolved = intent.get('resolved')
        base = checkpoint = resolved['base'] if managed else args['expectedHead']
        if managed and resolved.get('fromTaskId'):
            require(g.call('cat-file', '-t', base).stdout.strip() == b'commit', 'COMMIT_REQUIRED')
            g.pin(base)
        else:
            g.fetch(ref, base)
        imported = None
        if managed and args.get('localChanges', False):
            require(not args.get('fromTaskId'), 'CHECKOUT_SOURCE', 'Local changes require the checked-out branch as their source')
            checkpoint, imported = Checkout(g).capture(base, ref, opid)
        if args["action"] == "compose":
            combined = g.entries(base)
            for source in args["sources"]:
                sw = self.task(principal, source["taskId"])
                require(sw["repo"] == repo and sw["ref"] == ref and sw["checkpoint"] == source["checkpoint"], "SOURCE_CHANGED")
                require(g.call("merge-base", "--is-ancestor", sw["base"], base, check=False).returncode == 0, "UNRELATED_BASE")
                before, after = g.entries(sw["base"]), g.entries(source["checkpoint"])
                for name in before.keys() | after.keys():
                    if before.get(name) == after.get(name):
                        continue
                    require(combined.get(name) in (before.get(name), after.get(name)), "COMPOSE_CONFLICT")
                    if name in after:
                        combined[name] = after[name]
                    else:
                        combined.pop(name, None)
            checkpoint = g.commit(g.write_tree(combined), base, "compose " + opid)
        wid = uuid.uuid4().hex
        source_ref = ref
        if managed:
            label = re.sub(r'[^A-Za-z0-9_-]+', '-', args.get('label', 'task')).strip('-') or 'task'
            ref = resolved['namespace'] + label + '-' + wid
        result = {"taskId": wid, "workspaceId": intent['workspaceId'], "repo": repo,
                  "ref": ref, "base": base, "checkpoint": checkpoint}
        if managed:
            result.update(managed=True, sourceRef=source_ref)
        if imported:
            result['localImport'] = imported
        with self.store.tx() as db:
            db.execute("INSERT INTO task(id,owner,repo,ref,identity,base,checkpoint,managed,source_ref,namespace,ref_state,workspace) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (wid, principal, repo, ref, g.config['identity'], base, checkpoint, int(managed),
                        source_ref if managed else None, resolved['namespace'] if managed else None,
                        'reserved' if managed else None, intent['workspaceId']))
            db.execute("UPDATE operation SET task=?,ref=?,status='succeeded',effect='committed',result=? WHERE id=?",
                       (wid, ref, canonical(result).decode(), opid))

    def cleanup(self, opid, w):
        require(w['managed'], 'REF_NOT_OWNED', 'Only branches created by a managed task can be cleaned up')
        g = self.git(w['repo'])
        head = g.head(w['ref'], missing=True)
        result = {'taskId': w['id'], 'ref': w['ref'], 'cleaned': True}
        if head is None:
            self.finish(opid, result, closed=True, ref_state='deleted')
            return
        require(w['ref_state'] == 'published' and w['published_oid'] == head, 'REF_NOT_OWNED',
                'Branch changed externally or was not created by this task; cleanup did not delete it')
        self.save_intent(opid, refMutation='delete', old=head, new=None)
        try:
            g.managed_change(w['ref'], head, None)
        except Fault as error:
            if error.value['code'] in ('STALE_HEAD', 'REF_DENIED', 'REF_CHECKED_OUT'):
                raise
            raise Fault('REF_CLEANUP_UNKNOWN', 'Inspect the original cleanup operation; do not repeat deletion', 'unknown') from None
        except Exception:
            raise Fault('REF_CLEANUP_UNKNOWN', 'Inspect the original cleanup operation; do not repeat deletion', 'unknown') from None
        self.finish(opid, result, closed=True, ref_state='deleted')

    def reset_environment(self, opid, w):
        from .native import NativeExecutor
        NativeExecutor(self.store.root / 'native').reset_environment(w['id'], opid)
        self.finish(opid, {'taskId': w['id'], 'environmentReset': True}, closed=bool(w['closed']))

    def backend(self, intent):
        if self.executor_override is not None:
            return self.executor_override
        config = intent.get("executor")
        if config and config.get("kind") == "native":
            from .native import NativeExecutor
            return NativeExecutor(self.store.root / "native")
        # A missing executor on an old accepted intent is not silently reinterpreted.
        require(config, "EXECUTOR_IDENTITY_MISSING")
        from .remote import SSHExecutor
        return SSHExecutor(config)

    @staticmethod
    def executor_config(config):
        return config.get("executor", {"kind": "native"})

    @staticmethod
    def validation_policy(config):
        return digest({"command": config["validation"],
                       "executor": Controller.executor_config(config),
                       "toolingEnvironment": config.get("toolingEnvironment", {})})

    def launch(self, opid, kind, w, args):
        config = self.config["repositories"][w["repo"]]
        executor = self.executor_config(config)
        native = executor.get("kind") == "native"
        process = kind == 'exec' and args.get('mode') == 'process'
        environment_mode = args.get('environment', 'task' if native else 'fresh')
        require(native or (not process and environment_mode == 'fresh'), 'NATIVE_FEATURE_REQUIRED',
                'Persistent environments and process mode currently require the native executor')
        require(not process or not args.get('capturePaths'), 'PROCESS_CAPTURE', 'Process copies never import source changes')
        g = self.git(w["repo"])
        network = args.get("network", "host" if native else "none")
        require(network in config.get("networks", ["host"] if native else ["none"]), "NETWORK_DENIED")
        require(not native or network == "host", "NATIVE_NETWORK_UNSUPPORTED", "Native execution uses the app UID's host network; no network sandbox is claimed")
        tooling_env = config.get("toolingEnvironment", {})
        request_env = args.get("env", {})
        require(all("\0" not in v for v in (*tooling_env.values(), *request_env.values())), "ENV")
        execution_env = {**tooling_env, **request_env}
        candidate = None
        if kind == "validate":
            if w['managed']:
                require(w['ref_state'] == 'reserved' and g.head(w['ref'], missing=True) is None, 'STALE_HEAD')
            else:
                require(g.head(w['ref']) == w['base'], 'STALE_HEAD')
            candidate = g.commit(g.tree(w["checkpoint"]), w["base"], args["message"] + "\n\ntdev-validation: " + opid)
        source_commit = candidate or w["checkpoint"]
        payload = {"id": opid, "checkpoint": source_commit, "candidate": candidate,
                   "files": g.export(source_commit), "command": config["validation"] if kind == "validate" else args["command"],
                   "cwd": path(args.get("cwd", "."), dot=True), "env": execution_env,
                   "stdin": args.get("stdin", ""), "network": network,
                   "timeout": args.get("timeout", None if process else 300), "readonly": kind == "validate",
                   "capturePaths": args.get("capturePaths", []), "gitPack": g.execution_pack(source_commit),
                   "networkPolicyDigest": executor.get("networkPolicyDigest")}
        if native:
            payload.update(mode='process' if process else 'command',
                           environmentId=w['id'] if environment_mode == 'task' else None)
        require(len(canonical(payload)) <= 48 * 1024 * 1024, "SOURCE_LIMIT")
        # Keep bytes in Git; exact execution input can be reconstructed for auditing.
        execution = {k: v for k, v in payload.items() if k not in ("files", "gitPack")}
        intent = self.save_intent(opid, execution=execution, inputDigest=digest(payload),
                                  executor=executor, policy=self.validation_policy(config), candidate=candidate,
                                  **({'validationSubject': 'source'} if kind == 'validate' else {}))
        self.backend(intent).submit(payload)

    def publish(self, opid, w, args, validation):
        vi, vr = source_validation(validation)
        c = self.config["repositories"][w["repo"]]
        require(w['managed'] or not c.get('managedOnly', False), 'MANAGED_TASK_REQUIRED',
                'Start a managed task for this project; its base branch is a source, not a publication target')
        require(vi["policy"] == self.validation_policy(c), "POLICY_CHANGED")
        require(vi["task"]["checkpoint"] == w["checkpoint"] and vr["exitCode"] == 0, "VALIDATION_SOURCE_CHANGED")
        expected = None if w['managed'] else w['base']
        require(args.get('expectedHead', expected) == expected, 'STALE_HEAD')
        g = self.git(w["repo"])
        require(g.head(w['ref'], missing=bool(w['managed'])) == expected, 'STALE_HEAD')
        require(g.tree(vi["candidate"]) == g.tree(w["checkpoint"]), "VALIDATION_SOURCE_CHANGED")
        parents = g.call('rev-list', '--parents', '-n', '1', vi['candidate']).stdout.decode().split()
        require(parents == [vi['candidate'], w['base']], 'DIRECT_CHILD_REQUIRED')
        self.save_intent(opid, old=expected, new=vi['candidate'], **({'refMutation': 'create'} if w['managed'] else {}))
        try:
            if w['managed']:
                g.managed_change(w['ref'], None, vi['candidate'])
            else:
                g.publish(w['ref'], w['base'], vi['candidate'])
        except Fault as error:
            if error.value['code'] in ('STALE_HEAD', 'REF_DENIED', 'REF_CHECKED_OUT'):
                raise
            raise Fault('PUBLICATION_UNKNOWN', 'Read back this exact intent; do not resubmit', 'unknown') from None
        except Exception:
            raise Fault("PUBLICATION_UNKNOWN", "Read back this exact intent; do not resubmit", "unknown") from None
        self.finish(opid, {'commit': vi['candidate'], 'validationId': validation['id']}, closed=True,
                    published=vi['candidate'] if w['managed'] else None)

    def reconcile(self, row):
        from contextlib import nullcontext
        intent = json.loads(row['intent'])
        guarded = row['kind'] in ('artifact', 'deploy') or intent.get('validationSubject') == 'artifact' or intent.get('artifactPrune')
        with self.artifacts.lock if guarded else nullcontext():
            return self._reconcile(row)

    def _reconcile(self, row):
        if row["status"] not in ("running", "unknown"):
            return
        with self.reconcile_locks_guard:
            lock = self.reconcile_locks.get(row["id"])
            if lock is None:
                lock = threading.Lock()
                self.reconcile_locks[row["id"]] = lock
        with lock:
            row = self.store.one("SELECT * FROM operation WHERE id=?", (row["id"],))
            if row["status"] not in ("running", "unknown"):
                return
            intent = json.loads(row["intent"])
            try:
                if intent.get('artifactPrune'):
                    self.artifacts.retention.reconcile(row)
                elif row['kind'] == 'project':
                    self.projects.reconcile(row)
                elif row['kind'] == 'artifact':
                    self.artifacts.reconcile(row)
                elif row['kind'] == 'deploy':
                    self.deployments.advance(row)
                elif intent.get('environmentReset'):
                    self.reset_environment(row['id'], intent['task'])
                elif intent.get('refMutation') == 'delete':
                    if self.git(row['repo']).head(row['ref'], missing=True) is None:
                        self.finish(row['id'], {'taskId': row['task'], 'ref': row['ref'], 'cleaned': True},
                                    closed=True, ref_state='deleted')
                elif row["kind"] == "publish" and "new" in intent:
                    g = self.git(row["repo"])
                    managed = intent.get('refMutation') == 'create'
                    head = g.head(row['ref'], missing=managed)
                    if head == intent['new'] or (not managed and g.contains(head, intent['new'])):
                        self.finish(row['id'], {'commit': intent['new'], 'validationId': intent['input']['validationId']},
                                    closed=True, published=intent['new'] if managed else None)
                elif row['kind'] == 'validate' and intent.get('validationSubject') == 'artifact':
                    self.artifacts.reconcile_validation(row)
                elif row["kind"] in ("exec", "validate") and "execution" in intent:
                    result = self.backend(intent).observe(row["id"])
                    require(isinstance(result, dict), "RECEIPT_FORMAT")
                    if not result.get("terminal"):
                        return
                    require(result.get("terminal") is True and result.get("id") == row["id"] and result.get("inputDigest") == intent["inputDigest"] and result.get("stopped") is True, "RECEIPT_IDENTITY")
                    require(result.get("exitCode") is None or type(result["exitCode"]) is int, "RECEIPT_FORMAT")
                    require(all(type(result[k]) is bool for k in ("cancelled", "timedOut") if k in result), "RECEIPT_FORMAT")
                    w = intent["task"]
                    checkpoint = None
                    if row["kind"] == "exec" and intent['input'].get('mode') != 'process':
                        require("files" in result or result.get("captureError"), "CAPTURE_MISSING")
                        if "files" in result and not result.get("captureError"):
                            try:
                                checkpoint = self.git(row["repo"]).capture(w["checkpoint"], result["files"], row["id"])
                            except (Fault, ValueError, KeyError, TypeError) as e:
                                # Stop is proved even if capture is unusable. Preserve
                                # the old checkpoint and do not make a stale lock.
                                result["captureError"] = e.value["code"] if isinstance(e, Fault) else "CAPTURE_INVALID"
                    public = {k: result[k] for k in ("id", "terminal", "stopped", "exitCode", "cancelled", "timedOut", "captureError", "discardedBytes") if k in result}
                    public.update(checkpoint=checkpoint or w["checkpoint"], candidate=intent.get("candidate"))
                    status = "succeeded" if result.get("exitCode") == 0 and not any(result.get(k) for k in ("cancelled", "timedOut", "captureError")) else "failed"
                    self.finish(row["id"], public, checkpoint=checkpoint, status=status)
                elif row["kind"] == "operation" and "targetOperation" in intent:
                    result = self.backend(intent).control_status(intent["targetOperation"], row["id"])
                    if result.get("known"):
                        self.finish(row["id"], result["result"])
            except OSError:
                self.fail(row['id'], Fault('RECONCILIATION_IO', 'Retained evidence is incomplete; retry observation, never rebuild', 'unknown'))
            except Fault as e:
                # Invalid/missing receipt is never promoted to terminal proof.
                self.fail(row["id"], Fault(e.value["code"], e.value["message"], "unknown"))

    def status(self, principal, args):
        require(bool(args.get("operationId")) != bool(args.get("lookupRequestId")), "STATUS_TARGET")
        if "lookupRequestId" in args:
            row = self.store.one("SELECT * FROM operation WHERE owner=? AND request=?", (principal, args["lookupRequestId"]))
            require(row, "OPERATION_NOT_FOUND")
            row = self.operation(principal, row["id"])
        else:
            row = self.operation(principal, args["operationId"])
        alias = json.loads(row["intent"]).get("aliasOf")
        if alias:
            row = self.operation(principal, alias)
        self.reconcile(row)
        row = self.operation(principal, row["id"])
        result = Store.public(row)
        if row['kind'] == 'artifact':
            result['artifactStorage'] = self.artifacts.retention.description(row['id'])
        intent = json.loads(row['intent'])
        if row['kind'] in ('exec', 'validate', 'artifact') and 'execution' in intent:
            execution = intent['execution']
            result['execution'] = {'mode': execution.get('mode', 'command'), 'checkpoint': execution['checkpoint'],
                                   'environment': 'task' if execution.get('environmentId') else 'fresh',
                                   'timeout': execution['timeout']}
        if row["kind"] in ("exec", "validate", "artifact") and "execution" in json.loads(row["intent"]):
            try:
                result["output"] = self.backend(json.loads(row["intent"])).logs(row["id"], args.get("offset", 0), args.get("limit", 24000))
            except Fault as e:
                result["outputError"] = e.value
        if "since" in args:
            result["observation"] = self.observation(result, args["since"], ["SQLite", "executor result/logs if applicable"])
        return result

    def close(self):
        self.store.close()
