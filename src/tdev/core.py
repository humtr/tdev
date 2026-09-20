import base64
import copy
import hmac
import json
import re
import sqlite3
import threading
import time
import uuid
import weakref
from pathlib import Path

from .common import Fault, canonical, digest, load_contract, path, private_file, require
from .git import Git
from .store import Store


class Controller:
    def __init__(self, directory, config, executor=None):
        self.config_source = config
        self.config = self.load_config()
        self.schema, self.validator = load_contract()
        self.store = Store(directory)
        self.gits = {}
        # Tests may inject fixtures; normal installations use the native runner.
        self.executor_override = executor
        self.reconcile_locks = weakref.WeakValueDictionary()
        self.reconcile_locks_guard = threading.Lock()

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
        return value

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
            require(repo in self.config["repositories"] and ref in p.get("repos", {}).get(repo, []), "PERMISSION_DENIED")
            require(ref in self.config["repositories"][repo]["refs"], "REF_DENIED")

    def git(self, repo):
        c = self.config["repositories"][repo]
        key = (repo, digest(c))
        if key not in self.gits:
            self.gits[key] = Git(self.store.root / "objects" / (repo + ".git"), c)
        return self.gits[key]

    def workspace(self, principal, ident):
        row = self.store.one("SELECT * FROM workspace WHERE id=?", (ident,))
        require(row and row["owner"] == principal, "WORKSPACE_NOT_FOUND")
        self.authorize(principal, row["repo"], row["ref"])
        require(row["identity"] == self.config["repositories"][row["repo"]]["identity"], "REPOSITORY_IDENTITY")
        return row

    def operation(self, principal, ident):
        row = self.store.one("SELECT * FROM operation WHERE id=?", (ident,))
        require(row and row["owner"] == principal, "OPERATION_NOT_FOUND")
        self.authorize(principal, row["repo"], row["ref"])
        require(json.loads(row["intent"])["repositoryIdentity"] == self.config["repositories"][row["repo"]]["identity"], "REPOSITORY_IDENTITY")
        return row

    def call(self, principal, tool, args):
        try:
            self.config = self.load_config()
            self.authorize(principal)
            errors = list(self.validator.iter_errors({"tool": tool, "input": args}))
            require(not errors, "SCHEMA", "Input does not match the public contract")
            require(len(canonical(args)) <= 2 * 1024 * 1024, "INPUT_LIMIT")
            kind = tool.removeprefix("tdev_")
            if kind == "read":
                return {"ok": True, "result": self.read(principal, args)}
            if kind == "workspace" and args["action"] == "list":
                return {"ok": True, "result": self.discover(principal, args)}
            if kind == "workspace" and args["action"] == "inspect":
                return {"ok": True, "result": self.inspect(principal, args)}
            if kind == "process" and args["action"] == "status":
                return {"ok": True, "result": self.status(principal, args)}
            return {"ok": True, "result": self.mutate(principal, kind, args)}
        except Fault as e:
            return {"ok": False, "error": e.value}
        except (UnicodeError, ValueError, KeyError):
            return {"ok": False, "error": Fault("INVALID_DATA").value}

    def discover(self, principal, args=None):
        args = args or {}
        repos = []
        for name, refs in self.config["principals"][principal].get("repos", {}).items():
            for ref in refs:
                self.authorize(principal, name, ref)
                try:
                    repos.append({"repo": name, "ref": ref, "head": self.git(name).head(ref)})
                except Fault as e:
                    repos.append({"repo": name, "ref": ref, "error": e.value})
        rows = self.store.all("SELECT rowid AS cursor,* FROM workspace WHERE owner=? AND rowid>? AND (closed=0 OR ?) ORDER BY rowid LIMIT ?",
                              (principal, args.get("after", 0), int(args.get("includeClosed", False)), args.get("limit", 20) + 1))
        page = rows[:args.get("limit", 20)]
        workspaces = [self.workspace(principal, r["id"]) for r in page
            if r["ref"] in self.config["principals"][principal].get("repos", {}).get(r["repo"], [])]
        return {"repositories": repos, "workspaces": workspaces,
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
        w = self.workspace(principal, args["workspaceId"])
        busy = self.status(principal, {"operationId": w["busy"], "limit": 1}) if w["busy"] else None
        # Descending rowid pagination includes closed workspaces and old cleanup owners.
        before, limit = args.get("before", 9007199254740991), args.get("limit", 20)
        rows = self.store.all("SELECT rowid AS cursor,* FROM operation WHERE owner=? AND (workspace=? OR json_extract(intent,'$.targetOperation') IN (SELECT id FROM operation WHERE workspace=?)) AND rowid<? ORDER BY rowid DESC LIMIT ?",
                              (principal, w["id"], w["id"], before, limit + 1))
        operations = []
        for row in rows[:limit]:
            item = Store.public(row)
            item["requestId"] = row["request"]
            item["cleanup"] = "none"
            if row["kind"] in ("exec", "validate"):
                retired = self.store.one("SELECT id FROM operation WHERE owner=? AND kind='process' AND status='succeeded' AND json_extract(intent,'$.targetOperation')=? AND json_extract(intent,'$.input.action')='retire' LIMIT 1", (principal, row["id"]))
                item["cleanup"] = "retired" if retired else "retire" if (item["result"] or {}).get("stopped") else "observe"
            operations.append(item)
        w = self.workspace(principal, w["id"])
        try:
            remote = {"head": self.git(w["repo"]).head(w["ref"])}
        except Fault as error:
            remote = {"error": error.value}
        result = {"workspace": w, "remote": remote, "operations": operations,
                  "active": busy if busy and w["busy"] == busy["id"] else None,
                  "nextBefore": rows[limit - 1]["cursor"] if len(rows) > limit else None,
                  "mutationReady": not w["closed"] and not w["busy"],
                  "baseMatchesRemote": remote.get("head") == w["base"]}
        result["observation"] = self.observation(result, args.get("since"), ["SQLite", "busy executor if present", "Git remote head"])
        result["observation"]["startedAtNs"] = started
        return result

    def read(self, principal, args):
        w = self.workspace(principal, args["workspaceId"])
        g = self.git(w["repo"])
        checkpoint = args["checkpoint"]
        require(g.call("merge-base", "--is-ancestor", checkpoint, w["checkpoint"], check=False).returncode == 0, "SOURCE_NOT_IN_WORKSPACE")
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
                    data = (g.call("diff", "--no-ext-diff", "--no-textconv", "--stat", w["base"], checkpoint).stdout
                            if action == "diff" else g.call("log", "-20", "--format=%H %s", checkpoint).stdout)
                    chunk = data[:remaining]
                    item.update(text=chunk.decode(errors="replace"), complete=len(chunk) == len(data))
                    remaining -= len(chunk)
            except Fault as e:
                item["error"] = e.value
            results.append(item)
        return {"checkpoint": checkpoint, "busy": w["busy"], "items": results}

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
        w, validation, target = None, None, None
        if kind == "workspace" and args["action"] in ("open", "compose"):
            repo, ref = args["repo"], args["ref"]
        elif kind == "publish":
            validation = self.operation(principal, args["validationId"])
            require(validation["kind"] == "validate", "VALIDATION_REQUIRED")
            w = self.workspace(principal, validation["workspace"])
            repo, ref = w["repo"], w["ref"]
        elif kind == "process":
            target = self.operation(principal, args["operationId"])
            require(target["kind"] in ("exec", "validate"), "PROCESS_REQUIRED")
            repo, ref = target["repo"], target["ref"]
        else:
            w = self.workspace(principal, args["workspaceId"])
            repo, ref = w["repo"], w["ref"]
        self.authorize(principal, repo, ref)
        opid = uuid.uuid4().hex
        intent = {"input": args, "repositoryIdentity": self.config["repositories"][repo]["identity"]}
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
                    db.execute("INSERT INTO operation(id,owner,request,hash,kind,workspace,repo,ref,status,effect,intent,result) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                               (opid, principal, request, fingerprint, kind, None, repo, ref,
                                "succeeded", "committed", canonical(alias_intent).decode(), canonical({"originalOperationId": old["id"]}).decode()))
                    return Store.public(dict(old))
            if w:
                current = dict(db.execute("SELECT * FROM workspace WHERE id=?", (w["id"],)).fetchone())
                require(not current["closed"] and not current["busy"], "WORKSPACE_BUSY")
                if "expected" in args:
                    require(current["checkpoint"] == args["expected"], "STALE_CHECKPOINT")
                w = current
                intent["workspace"] = w
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,workspace,repo,ref,status,effect,intent,publication) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (opid, principal, request, fingerprint, kind, w["id"] if w else None,
                        repo, ref, "running", "none", canonical(intent).decode(), validation["id"] if validation else None))
            if w:
                db.execute("UPDATE workspace SET busy=? WHERE id=?", (opid, w["id"]))
        try:
            if kind == "workspace":
                self.workspace_change(opid, principal, repo, ref, args, w)
            elif kind == "edit":
                checkpoint = self.git(repo).edit(w["checkpoint"], args["edits"], opid)
                self.finish(opid, {"workspaceId": w["id"], "checkpoint": checkpoint}, checkpoint=checkpoint)
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

    def finish(self, opid, result, checkpoint=None, closed=False, status="succeeded"):
        with self.store.tx() as db:
            row = db.execute("SELECT workspace,status FROM operation WHERE id=?", (opid,)).fetchone()
            if row["status"] in ("succeeded", "failed", "cancelled"):
                return
            if row["workspace"]:
                current = db.execute("SELECT busy FROM workspace WHERE id=?", (row["workspace"],)).fetchone()
                require(current and current[0] == opid, "WRITER_CHANGED")
                db.execute("UPDATE workspace SET checkpoint=COALESCE(?,checkpoint),busy=NULL,closed=? WHERE id=?",
                           (checkpoint, int(closed), row["workspace"]))
            db.execute("UPDATE operation SET status=?,effect='committed',result=?,error=NULL WHERE id=?",
                       (status, canonical(result).decode(), opid))

    def fail(self, opid, fault):
        unknown = fault.value["effect"] == "unknown"
        with self.store.tx() as db:
            db.execute("UPDATE operation SET status=?,effect=?,error=? WHERE id=?",
                       ("unknown" if unknown else "failed", fault.value["effect"], canonical(fault.value).decode(), opid))
            if not unknown:
                db.execute("UPDATE workspace SET busy=NULL WHERE busy=?", (opid,))

    def workspace_change(self, opid, principal, repo, ref, args, w):
        if args["action"] == "close":
            self.finish(opid, {"workspaceId": w["id"], "closed": True}, closed=True)
            return
        g = self.git(repo)
        g.fetch(ref, args["expectedHead"])
        base = checkpoint = args["expectedHead"]
        if args["action"] == "compose":
            combined = g.entries(base)
            for source in args["sources"]:
                sw = self.workspace(principal, source["workspaceId"])
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
        result = {"workspaceId": wid, "repo": repo, "ref": ref, "base": base, "checkpoint": checkpoint}
        with self.store.tx() as db:
            db.execute("INSERT INTO workspace(id,owner,repo,ref,identity,base,checkpoint) VALUES(?,?,?,?,?,?,?)",
                       (wid, principal, repo, ref, g.config["identity"], base, checkpoint))
            db.execute("UPDATE operation SET workspace=?,status='succeeded',effect='committed',result=? WHERE id=?",
                       (wid, canonical(result).decode(), opid))

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
            require(g.head(w["ref"]) == w["base"], "STALE_HEAD")
            candidate = g.commit(g.tree(w["checkpoint"]), w["base"], args["message"] + "\n\ntdev-validation: " + opid)
        source_commit = candidate or w["checkpoint"]
        payload = {"id": opid, "checkpoint": source_commit, "candidate": candidate,
                   "files": g.export(source_commit), "command": config["validation"] if kind == "validate" else args["command"],
                   "cwd": path(args.get("cwd", "."), dot=True), "env": execution_env,
                   "stdin": args.get("stdin", ""), "network": network,
                   "timeout": args.get("timeout", 300), "readonly": kind == "validate",
                   "capturePaths": args.get("capturePaths", []), "gitPack": g.execution_pack(source_commit),
                   "networkPolicyDigest": executor.get("networkPolicyDigest")}
        require(len(canonical(payload)) <= 48 * 1024 * 1024, "SOURCE_LIMIT")
        # Keep bytes in Git; exact execution input can be reconstructed for auditing.
        execution = {k: v for k, v in payload.items() if k not in ("files", "gitPack")}
        intent = self.save_intent(opid, execution=execution, inputDigest=digest(payload),
                                  executor=executor, policy=self.validation_policy(config), candidate=candidate)
        self.backend(intent).submit(payload)

    def publish(self, opid, w, args, validation):
        require(validation["status"] == "succeeded" and validation["result"], "VALIDATION_REQUIRED")
        vi = json.loads(validation["intent"])
        vr = json.loads(validation["result"])
        c = self.config["repositories"][w["repo"]]
        require(vi["policy"] == self.validation_policy(c), "POLICY_CHANGED")
        require(vi["workspace"]["checkpoint"] == w["checkpoint"] and vr["exitCode"] == 0, "VALIDATION_SOURCE_CHANGED")
        require(args["expectedHead"] == w["base"], "STALE_HEAD")
        g = self.git(w["repo"])
        require(g.head(w["ref"]) == w["base"], "STALE_HEAD")
        require(g.tree(vi["candidate"]) == g.tree(w["checkpoint"]), "VALIDATION_SOURCE_CHANGED")
        self.save_intent(opid, old=w["base"], new=vi["candidate"])
        try:
            g.publish(w["ref"], w["base"], vi["candidate"])
        except Exception:
            raise Fault("PUBLICATION_UNKNOWN", "Read back this exact intent; do not resubmit", "unknown") from None
        self.finish(opid, {"commit": vi["candidate"], "validationId": validation["id"]}, closed=True)

    def reconcile(self, row):
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
                if row["kind"] == "publish" and "new" in intent:
                    g = self.git(row["repo"])
                    head = g.head(row["ref"])
                    if head == intent["new"] or g.contains(head, intent["new"]):
                        self.finish(row["id"], {"commit": intent["new"], "validationId": intent["input"]["validationId"]}, closed=True)
                elif row["kind"] in ("exec", "validate") and "execution" in intent:
                    result = self.backend(intent).observe(row["id"])
                    require(isinstance(result, dict), "RECEIPT_FORMAT")
                    if not result.get("terminal"):
                        return
                    require(result.get("terminal") is True and result.get("id") == row["id"] and result.get("inputDigest") == intent["inputDigest"] and result.get("stopped") is True, "RECEIPT_IDENTITY")
                    require(result.get("exitCode") is None or type(result["exitCode"]) is int, "RECEIPT_FORMAT")
                    require(all(type(result[k]) is bool for k in ("cancelled", "timedOut") if k in result), "RECEIPT_FORMAT")
                    w = intent["workspace"]
                    checkpoint = None
                    if row["kind"] == "exec":
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
                elif row["kind"] == "process" and "targetOperation" in intent:
                    result = self.backend(intent).control_status(intent["targetOperation"], row["id"])
                    if result.get("known"):
                        self.finish(row["id"], result["result"])
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
        if row["kind"] in ("exec", "validate") and "execution" in json.loads(row["intent"]):
            try:
                result["output"] = self.backend(json.loads(row["intent"])).logs(row["id"], args.get("offset", 0), args.get("limit", 24000))
            except Fault as e:
                result["outputError"] = e.value
        if "since" in args:
            result["observation"] = self.observation(result, args["since"], ["SQLite", "executor result/logs if applicable"])
        return result

    def close(self):
        self.store.close()
