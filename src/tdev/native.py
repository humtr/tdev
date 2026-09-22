"""Termux-native development runner. Same UID: containment, NOT a sandbox.

Detached supervisors survive controller reconnect/restart. Candidate processes inherit
no controller credentials; filesystem permissions do not isolate mutually hostile code
running under the same Android app UID. No SSH, OCI, root or systemd is involved.
"""
import base64
import ctypes
import fcntl
import json
import os
import resource
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tdev.common import Fault, digest, path, require, run
from tdev.executor import InputPump, LOG_LIMIT, SOURCE_LIMIT, materialize, prepare_git, rpc, safe_link, save

DISK_LIMIT = 128 * 1024 * 1024
ENVIRONMENT_LIMIT = 2 * 1024 * 1024 * 1024


def environment_path(spool, ident):
    require(isinstance(ident, str) and len(ident) == 32 and all(c in '0123456789abcdef' for c in ident), 'ENVIRONMENT_IDENTITY')
    parent = spool / 'environments'
    require(not parent.is_symlink() and not (parent / ident).is_symlink(), 'ENVIRONMENT_SYMLINK')
    return parent / ident


def dependency_environment(job, payload):
    ident = payload.get('environmentId')
    if not ident:
        return {}
    root = environment_path(job.parent, ident)
    return {'TDEV_ENV_DIR': str(root), 'XDG_CACHE_HOME': str(root / 'cache'),
            'PIP_CACHE_DIR': str(root / 'cache/pip'), 'npm_config_cache': str(root / 'cache/npm')}


def environment(job):
    # Installed CLI binaries remain usable. User shell startup, agents, tokens,
    # proxy settings and credential helper config are deliberately not inherited.
    bindir = str(Path(sys.executable).resolve().parent)
    return {"PATH": os.pathsep.join(dict.fromkeys((bindir, "/system/bin", "/usr/bin", "/bin"))),
            "PREFIX": str(Path(bindir).parent), "HOME": str(job / "home"),
            "TMPDIR": str(job / "tmp"), "XDG_CONFIG_HOME": str(job / "home/.config"),
            "XDG_CACHE_HOME": str(job / "home/.cache"), "LANG": "C.UTF-8",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_TERMINAL_PROMPT": "0"}


def identity(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": pid, "start": fields[19], "ppid": int(fields[1]),
                "state": fields[0], "session": int(fields[3])}
    except (FileNotFoundError, ProcessLookupError):
        return None


def descendants(pid):
    rows = {}
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit():
            try:
                if entry.stat().st_uid == os.getuid():
                    value = identity(int(entry.name))
                    if value:
                        rows[value["pid"]] = value
            except (PermissionError, FileNotFoundError, ProcessLookupError):
                continue
    selected = {pid}
    while True:
        expanded = selected | {p for p, row in rows.items() if row["ppid"] in selected}
        if expanded == selected:
            return [r for p, r in rows.items() if p in selected and p != pid]
        selected = expanded


def signal_exact(row, sig):
    current = identity(row["pid"])
    if current and current["start"] == row["start"] and current["state"] != "Z":
        try:
            os.kill(row["pid"], sig)
        except ProcessLookupError:
            pass


def stop_children(proc):
    # Subreaping also catches ordinary double-fork/setsid descendants. This is
    # process management, not protection against hostile same-UID interference.
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        rows = descendants(os.getpid())
        for row in reversed(rows):
            signal_exact(row, signal.SIGKILL)
        if proc is not None:
            proc.poll()  # Own Popen child is reaped before orphan waitpid calls.
        if proc is None or proc.returncode is not None:
            while True:
                try:
                    pid, _ = os.waitpid(-1, os.WNOHANG)
                    if not pid:
                        break
                except ChildProcessError:
                    break
        if not descendants(os.getpid()):
            return True
        time.sleep(.02)
    return False


def scan(root, initial, extras, ignore, validation=False):
    tracked = {f["path"] for f in initial}
    files, total = [], 0
    for base, dirs, names in os.walk(root, followlinks=False):
        if Path(base) == root:
            dirs[:] = [d for d in dirs if d != ".git"]
            names = [n for n in names if n != ".git"]
        links = [d for d in dirs if (Path(base) / d).is_symlink()]
        dirs[:] = [d for d in dirs if d not in links]
        for name in sorted(names + links):
            filename = Path(base) / name
            relative = path(str(filename.relative_to(root)))
            if validation and relative not in tracked:
                continue  # Build products are disposable; existing source may not change.
            if relative not in tracked and not any(relative == p or relative.startswith(p + "/") for p in extras):
                ignored = run(["git", "-c", "core.hooksPath=/dev/null", "-c", "core.excludesFile=/dev/null",
                               "-C", str(ignore), "check-ignore", "--no-index", "--", relative],
                              env=environment(ignore.parent), check=False)
                if ignored.returncode == 0:
                    continue
                require(ignored.returncode == 1, "IGNORE_CHECK")
            info = filename.lstat()
            if stat.S_ISLNK(info.st_mode):
                target = os.readlink(filename)
                safe_link(relative, target)
                data, mode = target.encode(), "120000"
            else:
                require(stat.S_ISREG(info.st_mode), "CAPTURE_TYPE")
                require(info.st_size <= SOURCE_LIMIT - total, "CAPTURE_LIMIT")
                fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                with os.fdopen(fd, "rb") as stream:
                    require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "CAPTURE_TYPE")
                    data = stream.read(SOURCE_LIMIT - total + 1)
                mode = "100755" if info.st_mode & 0o111 else "100644"
            total += len(data)
            require(total <= SOURCE_LIMIT and len(files) < 100000, "CAPTURE_LIMIT")
            files.append({"path": relative, "mode": mode, "data": base64.b64encode(data).decode()})
    return sorted(files, key=lambda f: f["path"])


def disk_usage(job, dependency_root=None, max_bytes=None):
    total, count = 0, 0
    for root in ((dependency_root,) if dependency_root else (job / "work", job / "home", job / "tmp", job / "inputs", job / "build", job / "artifact-input", job / "data", job / "service-runtime")):
        for base, dirs, names in os.walk(root, followlinks=False):
            for name in names:
                try:
                    total += (Path(base) / name).lstat().st_size
                    count += 1
                except FileNotFoundError:
                    pass
                if total > (ENVIRONMENT_LIMIT if dependency_root else (max_bytes or DISK_LIMIT)) or count > 100000:
                    return True
    return False


def child(job):
    payload = json.loads((job / "request.json").read_bytes())
    limits = [(resource.RLIMIT_CORE, 0), (resource.RLIMIT_FSIZE, payload.get('artifactLimits', {}).get('workingBytes', DISK_LIMIT)), (resource.RLIMIT_NOFILE, 256)]
    if payload['timeout'] is not None:
        limits.append((resource.RLIMIT_CPU, payload['timeout'] + 1))
    for limit, amount in limits:
        _, hard = resource.getrlimit(limit)
        value = amount if hard == resource.RLIM_INFINITY else min(amount, hard)
        resource.setrlimit(limit, (value, value))
    if payload.get('artifactValidation'):
        from tdev.artifact_validation import run_check
        raise SystemExit(run_check(job, payload))
    env = environment(job)
    # Keep the private default credential lookup locations, even when callers add env.
    require(not set(payload["env"]) & {"HOME", "TMPDIR", "XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "SSH_AUTH_SOCK", "TDEV_ENV_DIR"}, "RESERVED_ENV")
    env.update(dependency_environment(job, payload))
    env.update(payload["env"])
    if payload.get('environmentId'):
        root = environment_path(job.parent, payload['environmentId'])
        env['PATH'] = os.pathsep.join((str(root / 'venv/bin'), str(root / 'bin'), env['PATH']))
    if payload.get('artifactBinding'):
        from tdev.artifact_build import prepare_child
        prepare_child(job, payload['artifactBinding'], env, payload.get('artifactLimits'))
    root = job / "work"
    cwd = (root / path(payload["cwd"], dot=True)).resolve(strict=True)
    require(cwd == root or root in cwd.parents, "CWD_SCOPE")
    os.chdir(cwd)
    shell = shutil.which("sh", path=environment(job)["PATH"])
    require(shell, "SHELL_UNAVAILABLE")
    os.execve(shell, [shell, "-c", payload["command"]], env)


def worker(job):
    with open(job / "worker.lock", "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (job / "result.json").exists():
            return
        save(job / "worker.json", identity(os.getpid()))
        payload = json.loads((job / "request.json").read_bytes())
        result = {"id": payload["id"], "inputDigest": digest(payload), "terminal": True,
                  "stopped": False, "exitCode": None, "cancelled": False, "timedOut": False}
        proc, dependency_lock = None, None
        try:
            libc = ctypes.CDLL(None, use_errno=True)
            require(libc.prctl(36, 1, 0, 0, 0) == 0, "SUBREAPER_UNAVAILABLE")
            require(libc.prctl(38, 1, 0, 0, 0) == 0, "NO_NEW_PRIVILEGES_UNAVAILABLE")
            require(payload["network"] == "host", "NATIVE_NETWORK_UNSUPPORTED")
            dependency_root = None
            if payload.get('environmentId'):
                dependency_root = environment_path(job.parent, payload['environmentId'])
                dependency_root.parent.mkdir(mode=0o700, exist_ok=True)
                dependency_lock = open(dependency_root.with_suffix('.lock'), 'a+b')
                fcntl.flock(dependency_lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
                dependency_root.mkdir(mode=0o700, exist_ok=True)
            for name in ("home", "tmp"):
                (job / name).mkdir(mode=0o700)
            if payload.get('artifactValidation'):
                from tdev.artifact_build import verify_storage
                selected = payload['artifactValidation']
                verify_storage(Path(selected['directory']), selected['contentDigest'])
                shutil.copytree(selected['directory'], job / 'artifact-input', symlinks=True)
                verify_storage(job / 'artifact-input', selected['contentDigest'])
            else:
                source = job / "work"
                materialize(payload["files"], source)
                prepare_git(source, payload)
                ignore = job / "ignore"
                run(["git", "init", "--template=", str(ignore)], env=environment(job))
                for entry in payload["files"]:
                    if entry["path"].split("/")[-1] == ".gitignore" and entry["mode"] != "120000":
                        filename = ignore / entry["path"]
                        filename.parent.mkdir(parents=True, exist_ok=True)
                        filename.write_bytes(base64.b64decode(entry["data"]))
            if (job / "cancel.json").exists():
                result["cancelled"] = True
            else:
                save(job / "dispatch.json", {"accepted": True})
                proc = subprocess.Popen([sys.executable, "-I", str(Path(__file__).resolve()), "child", str(job)],
                                        env=environment(job), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, close_fds=True)
                save(job / 'child.json', identity(proc.pid))
                os.set_blocking(proc.stdin.fileno(), False)
                os.set_blocking(proc.stdout.fileno(), False)
                pump = InputPump(job, payload["stdin"])
                deadline = time.monotonic() + payload['timeout'] if payload['timeout'] is not None else float('inf')
                next_scan, next_dependency_scan = 0, 0
                retained, discarded = 0, 0
                with open(job / "output", "wb") as output:
                    while proc.poll() is None:
                        now = time.monotonic()
                        result["cancelled"] = (job / "cancel.json").exists()
                        result["timedOut"] = now >= deadline
                        if now >= next_scan:
                            if disk_usage(job, max_bytes=payload.get('artifactLimits', {}).get('workingBytes')):
                                result["captureError"] = "DISK_LIMIT"
                            next_scan = now + .25
                        if dependency_root and now >= next_dependency_scan:
                            if disk_usage(job, dependency_root):
                                result['captureError'] = 'ENVIRONMENT_DISK_LIMIT'
                            next_dependency_scan = now + 5
                        if result["cancelled"] or result["timedOut"] or result.get("captureError"):
                            break
                        pump.step(proc.stdin)
                        try:
                            data = os.read(proc.stdout.fileno(), 65536)
                        except BlockingIOError:
                            data = b""
                        keep = data[:max(0, LOG_LIMIT - retained)]
                        output.write(keep)
                        output.flush()
                        retained += len(keep)
                        discarded += len(data) - len(keep)
                        time.sleep(.01)
                    natural_exit = proc.poll()
                    result["stopped"] = stop_children(proc)
                    result["exitCode"] = natural_exit if natural_exit is not None else proc.returncode
                    while True:
                        try:
                            data = os.read(proc.stdout.fileno(), 65536)
                        except BlockingIOError:
                            break
                        if not data:
                            break
                        keep = data[:max(0, LOG_LIMIT - retained)]
                        output.write(keep)
                        retained += len(keep)
                        discarded += len(data) - len(keep)
                    output.flush()
                    os.fsync(output.fileno())
                result["discardedBytes"] = discarded
            require(stop_children(proc), "STOP_UNCERTAIN")
            result["stopped"] = True
            if payload.get('artifactLimits'):
                require(not disk_usage(job, max_bytes=payload['artifactLimits']['workingBytes']), 'DISK_LIMIT')
            if payload.get('artifactValidation'):
                selected = payload['artifactValidation']
                verify_storage(job / 'artifact-input', selected['contentDigest'])
                verify_storage(Path(selected['directory']), selected['contentDigest'])
                if result.get('exitCode') == 0 and not any(result.get(k) for k in ('captureError', 'cancelled', 'timedOut')):
                    proof = json.loads((job / 'artifact-check.json').read_bytes())
                    require(proof.get('id') == payload['id'] and proof.get('contentDigest') == selected['contentDigest']
                            and type(proof.get('exitCode')) is int and proof['exitCode'] == 0
                            and proof.get('serviceChecked') == bool(selected.get('health')), 'ARTIFACT_CHECK_RECEIPT')
                    result['artifactChecked'] = True
            elif payload.get('mode') != 'process':
                captured = scan(source, payload["files"], payload["capturePaths"], ignore, payload["readonly"])
                if payload["readonly"]:
                    require(captured == sorted(payload["files"], key=lambda f: f["path"]), "VALIDATION_SOURCE_CHANGED")
                elif not result.get("captureError"):
                    result["files"] = captured
            if payload.get('artifactBinding') and result.get('exitCode') == 0 and not any(result.get(k) for k in ('cancelled', 'timedOut', 'captureError')):
                from tdev.artifact_build import capture
                require(not disk_usage(job, max_bytes=payload.get('artifactLimits', {}).get('workingBytes')), 'DISK_LIMIT')
                result['artifactDigest'] = capture(job, payload['artifactBinding'], payload['files'], payload.get('artifactLimits'))
            if dependency_root and disk_usage(job, dependency_root):
                result.pop('files', None)
                result['captureError'] = 'ENVIRONMENT_DISK_LIMIT'
        except Exception as error:
            result.pop("files", None)
            result["captureError"] = error.value["code"] if isinstance(error, Fault) else type(error).__name__ + ":" + str(error)[:100]
        finally:
            result["stopped"] = stop_children(proc)
            if proc is not None:
                proc.stdin.close()
                proc.stdout.close()
            if dependency_lock is not None:
                dependency_lock.close()
            save(job / "result.json", result)


class NativeExecutor:
    def __init__(self, spool):
        self.root = Path(spool).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(self.root.stat().st_mode & 0o077 == 0, "SPOOL_PERMISSIONS")

    def job(self, ident):
        require(len(ident) == 32 and all(c in "0123456789abcdef" for c in ident), "PROCESS_IDENTITY")
        return self.root / ident

    def reset_environment(self, ident, operation_id):
        root = environment_path(self.root, ident)
        self.job(operation_id)  # Validate the retained cleanup identity.
        root.parent.mkdir(mode=0o700, exist_ok=True)
        trash = root.parent / (ident + '.reset-' + operation_id)
        require(not trash.is_symlink(), 'ENVIRONMENT_SYMLINK')
        with open(root.with_suffix('.lock'), 'a+b') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Fault('ENVIRONMENT_BUSY') from None
            require(not (root.exists() and trash.exists()), 'ENVIRONMENT_RESET_CONFLICT')
            if root.exists():
                os.rename(root, trash)
                fd = os.open(root.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            if trash.exists():
                shutil.rmtree(trash)

    def submit(self, payload):
        job = self.job(payload["id"])
        with open(self.root / (payload["id"] + ".lock"), "a+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if job.exists():
                previous = job / ("retired.json" if (job / "retired.json").exists() else "request.json")
                require(previous.exists(), "RESERVATION_UNKNOWN")
                value = json.loads(previous.read_bytes())
                require((value["inputDigest"] if previous.name == "retired.json" else digest(value)) == digest(payload), "IDEMPOTENCY_MISMATCH")
                return {"accepted": True}
            job.mkdir(mode=0o700)
            save(job / "request.json", payload)
            # Reserve before dispatch. A crash in this gap is uncertain, not retryable.
            process = subprocess.Popen([sys.executable, "-I", str(Path(__file__).resolve()), "worker", str(job)],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       env=environment(job), start_new_session=True, close_fds=True)
            threading.Thread(target=process.wait, daemon=True).start()
            return {"accepted": True}

    def observe(self, ident):
        job = self.job(ident)
        if (job / "result.json").exists():
            return json.loads((job / "result.json").read_bytes())
        # Supervisor loss never becomes invented terminal/validation evidence.
        if (job / "worker.json").exists():
            saved = json.loads((job / "worker.json").read_bytes())
            current = identity(saved["pid"])
            if not current or current["start"] != saved["start"] or current["state"] == "Z":
                raise Fault("NATIVE_SUPERVISOR_LOST", "Execution may have happened; do not relaunch. Only this task is fenced.", "unknown")
        return {"terminal": False}

    def logs(self, ident, offset, limit):
        result = rpc(str(self.root), "", {"action": "logs", "id": ident, "offset": offset, "limit": limit})
        if 'error' in result:
            raise Fault(result['error'], effect=result.get('effect', 'unknown'))
        return result

    def control(self, ident, args, control_id):
        if args["action"] == "stdin":
            return rpc(str(self.root), "", {"action": "stdin", "id": ident, "input": args, "controlId": control_id})
        return self._control(ident, control_id, {"action": "cancel"})

    def _control(self, ident, control_id, args):
        job = self.job(ident)
        self.job(control_id)
        with open(self.root / (ident + ".lock"), "a+b") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            record = job / ("control-" + control_id + ".json")
            if record.exists():
                saved = json.loads(record.read_bytes())
                require(saved["hash"] == digest(args), "IDEMPOTENCY_MISMATCH")
                return saved["result"]
            if args["action"] == "retire":
                result = self.observe(ident)
                require(result.get("stopped") is True, "STOP_PROOF_REQUIRED")
                save(job / "retired.json", {"inputDigest": result["inputDigest"]})
                result.pop("files", None)
                save(job / "result.json", result)
                for name in ("work", "home", "tmp", "ignore", "inputs", "build", "artifact-staging", "artifact", "artifact-input", "data", "service-runtime"):
                    directory = job / name
                    require(not directory.is_symlink(), "SPOOL_SYMLINK")
                    if directory.exists():
                        shutil.rmtree(directory)
                (job / "request.json").unlink(missing_ok=True)
                value = {"retired": True}
            else:
                save(job / "cancel.json", {"requested": True})
                value = {"cancelRequested": True}
            save(record, {"hash": digest(args), "result": value})
            return value

    def control_status(self, ident, control_id):
        return rpc(str(self.root), "", {"action": "control_status", "id": ident, "controlId": control_id})

    def retire(self, ident, control_id):
        return self._control(ident, control_id, {"action": "retire"})


if __name__ == "__main__":
    os.umask(0o077)
    (worker if sys.argv[1] == "worker" else child)(Path(sys.argv[2]).resolve())
