"""Adopted remote Linux outer executor. Standalone stdlib program, never on Termux.

RPC is delivered by authenticated, host-key-pinned SSH. Repository bytes only enter
an unprivileged rootless container. Spool/result files are not mounted in it.
"""
import base64
import fcntl
import hashlib
import io
import json
import os
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from pathlib import Path

SOURCE_LIMIT = 32 * 1024 * 1024
LOG_LIMIT = 1024 * 1024


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else encoded(value)).hexdigest()


def save(filename, value):
    data = encoded(value)
    fd, temp = tempfile.mkstemp(prefix=".write-", dir=filename.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, filename)
        fd = os.open(filename.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def safe_path(name):
    if not isinstance(name, str) or not name or len(name.encode()) > 4096 or "\\" in name or any(ord(c) < 32 for c in name):
        raise ValueError("PATH")
    if any(p in ("", ".", "..") or p.lower().rstrip(" .") == ".git" for p in name.split("/")):
        raise ValueError("PATH")
    return name


def safe_link(name, target):
    if target.startswith("/") or "\\" in target or any(ord(c) < 32 for c in target):
        raise ValueError("SYMLINK")
    parts = name.split("/")[:-1]
    for p in target.split("/"):
        if p == "..":
            if not parts:
                raise ValueError("SYMLINK")
            parts.pop()
        elif p not in ("", "."):
            parts.append(p)
    if any(p.lower() == ".git" for p in parts):
        raise ValueError("SYMLINK")


def engine(args, timeout=30, check=True):
    result = subprocess.run(["podman", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, env={k: v for k, v in os.environ.items()
                                                if k in ("PATH", "HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS")})
    if check and result.returncode:
        raise RuntimeError("ENGINE")
    return result


def preflight(image):
    if not re.fullmatch(r"[A-Za-z0-9_./:-]+@sha256:[0-9a-f]{64}", image):
        raise ValueError("PINNED_IMAGE_REQUIRED")
    info = json.loads(engine(["info", "--format=json"]).stdout)
    host = info["host"]
    if not (host["security"]["rootless"] and host["security"]["seccompEnabled"]
            and host["cgroupVersion"] == "v2" and {"cpu", "memory", "pids"} <= set(host["cgroupControllers"])):
        raise ValueError("ISOLATION_UNAVAILABLE")
    engine(["image", "exists", image])


def container_name(ident):
    if not re.fullmatch(r"[0-9a-f]{32}", ident):
        raise ValueError("IDENTITY")
    return "tdev-" + ident


def inspect(ident, expected):
    name = container_name(ident)
    present = engine(["container", "exists", name], check=False)
    if present.returncode == 1:
        return None
    if present.returncode:
        raise RuntimeError("OBSERVATION_UNKNOWN")
    data = json.loads(engine(["inspect", name]).stdout)[0]
    if data["Config"]["Labels"].get("tdev.input") != expected:
        raise ValueError("IDENTITY")
    return data["State"]


def arguments(ident, payload, source, image, network_policy=None):
    network = "none"
    if payload["network"] == "internet":
        if not network_policy or sha(network_policy) != payload.get("networkPolicyDigest") or not re.fullmatch(r"[0-9a-f]{64}", network_policy.get("qualificationDigest", "")):
            raise ValueError("NETWORK_UNQUALIFIED")
        network = network_policy.get("network", "")
        if not re.fullmatch(r"tdev-[A-Za-z0-9_-]+", network):
            raise ValueError("NETWORK_UNQUALIFIED")
    elif payload["network"] != "none":
        raise ValueError("NETWORK_UNQUALIFIED")
    return ["run", "--detach", "--name=" + container_name(ident),
            "--label=tdev.input=" + sha(payload), "--pull=never", "--read-only",
            "--read-only-tmpfs=false", "--http-proxy=false", "--unsetenv-all",
            "--image-volume=ignore", "--health-cmd=none", "--restart=no", "--systemd=false",
            "--cap-drop=ALL", "--security-opt=no-new-privileges", "--network=" + network,
            "--pid=private", "--ipc=private", "--uts=private", "--cgroupns=private",
            "--userns=keep-id", "--cgroups=enabled", "--memory=512m", "--memory-swap=512m",
            "--pids-limit=128", "--cpus=1", "--timeout=" + str(payload["timeout"] + 60),
            "--tmpfs=/work:rw,nosuid,nodev,size=128m,mode=1777",
            "--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777",
            "--mount=type=bind,src=" + str(source) + ",dst=/input,ro=true",
            "--log-driver=k8s-file", "--log-opt=max-size=1m",
            "--entrypoint=/usr/bin/env", image, "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
            "HOME=/tmp", "/bin/sh", "-c", "while :; do sleep 1; done"]


def materialize(files, root):
    root.mkdir(mode=0o700)
    total, names = 0, set()
    # Validate full topology before writing/following anything.
    for f in files:
        name = safe_path(f["path"])
        if name in names or f["mode"] not in ("100644", "100755", "120000"):
            raise ValueError("SOURCE")
        names.add(name)
    for name in names:
        if any("/".join(name.split("/")[:i]) in names for i in range(1, len(name.split("/")))):
            raise ValueError("TOPOLOGY")
    for f in files:
        data = base64.b64decode(f["data"], validate=True)
        total += len(data)
        if total > SOURCE_LIMIT:
            raise ValueError("SOURCE_LIMIT")
        p = root / f["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        if f["mode"] == "120000":
            target = data.decode()
            safe_link(f["path"], target)
            p.symlink_to(target)
        else:
            p.write_bytes(data)
            p.chmod(0o755 if f["mode"] == "100755" else 0o644)


def prepare_git(source, payload):
    """Credential-free private shallow metadata at the exact checkpoint OID."""
    checkpoint = payload["checkpoint"]
    if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", checkpoint):
        raise ValueError("CHECKPOINT")
    env = {"PATH": os.environ["PATH"], "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
    def git(*args, data=None):
        return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", str(source), *args],
                              input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, check=True).stdout
    git("init", "--template=", "--object-format=" + ("sha1" if len(checkpoint) == 40 else "sha256"))
    pack = base64.b64decode(payload["gitPack"], validate=True)
    if len(pack) > SOURCE_LIMIT:
        raise ValueError("SOURCE_LIMIT")
    git("index-pack", "--stdin", data=pack)
    (source / ".git/shallow").write_text(checkpoint + "\n")
    git("update-ref", "refs/heads/workspace", checkpoint)
    git("symbolic-ref", "HEAD", "refs/heads/workspace")
    git("reset", "--mixed", checkpoint)


class InputPump:
    """Unbuffered nonblocking delivery, with durable intent before each input."""
    def __init__(self, root, initial):
        self.root = root
        self.pending = initial.encode()
        self.sequence = 0
        self.active = None
        self.eof = False
        self.closed = False

    def step(self, stream):
        if self.closed:
            return
        if not self.pending and self.active is None:
            control = self.root / ("stdin-" + str(self.sequence) + ".json")
            if control.exists():
                value = json.loads(control.read_bytes())
                self.active = self.sequence
                self.pending = value["text"].encode()
                self.eof = value.get("eof", False)
                save(self.root / ("delivery-" + str(self.sequence) + ".json"), {"delivery": "unknown"})
        if self.pending:
            try:
                count = os.write(stream.fileno(), self.pending)
                self.pending = self.pending[count:]
            except BlockingIOError:
                return
            except BrokenPipeError:
                self.closed = True
                return
        if self.active is not None and not self.pending:
            if self.eof:
                stream.close()
                self.closed = True
            save(self.root / ("delivery-" + str(self.active) + ".json"), {"delivery": "committed"})
            self.sequence += 1
            self.active = None


def capture_tar(stream, initial, capture_paths, ignore_root):
    """Never extract untrusted tar on host. Bound bytes and reject links/devices."""
    tracked = {f["path"] for f in initial}
    files, total, seen = [], 0, set()
    for extra in capture_paths:
        safe_path(extra)
    with tarfile.open(fileobj=stream, mode="r|*") as archive:
        for entry in archive:
            name = entry.name
            while name.startswith("./"):
                name = name[2:]
            if not name or name == "." or name == ".git" or name.startswith(".git/"):
                continue
            safe_path(name)
            if entry.isdir():
                continue
            if name in seen or not (entry.isfile() or entry.issym()):
                raise ValueError("CAPTURE_TYPE")
            seen.add(name)
            if len(seen) > 100000:
                raise ValueError("CAPTURE_COUNT")
            explicit = any(name == p or name.startswith(p + "/") for p in capture_paths)
            if name not in tracked and not explicit:
                # This separate trusted directory contains the STARTING ignore files,
                # not a candidate-mutated index or config.
                ignored = subprocess.run(["git", "-c", "core.excludesFile=/dev/null", "-C", str(ignore_root),
                                          "check-ignore", "--no-index", "--", name], stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL)
                if ignored.returncode == 0:
                    continue
                if ignored.returncode != 1:
                    raise ValueError("IGNORE_CHECK")
            total += entry.size if entry.isfile() else len(entry.linkname.encode())
            if total > SOURCE_LIMIT:
                raise ValueError("CAPTURE_LIMIT")
            if entry.issym():
                safe_link(name, entry.linkname)
                data, mode = entry.linkname.encode(), "120000"
            else:
                data = archive.extractfile(entry).read(SOURCE_LIMIT + 1)
                mode = "100755" if entry.mode & 0o111 else "100644"
            files.append({"path": name, "mode": mode, "data": base64.b64encode(data).decode()})
    return files


def capture_process(copier, initial, capture_paths, ignore, timeout=30):
    # The deadline covers reading the pipe, not only wait() after tar parsing.
    # A stalled engine must not strand the workspace in capture forever.
    expired = threading.Event()
    def stop():
        expired.set()
        copier.kill()
    timer = threading.Timer(timeout, stop)
    timer.daemon = True
    timer.start()
    try:
        files = capture_tar(copier.stdout, initial, capture_paths, ignore)
        code = copier.wait(timeout=timeout)
        if expired.is_set() or code:
            raise RuntimeError("CAPTURE")
        return files
    finally:
        timer.cancel()
        timer.join()
        copier.stdout.close()
        if copier.poll() is None:
            copier.kill()
            copier.wait()


def worker(spool, image, ident):
    root = Path(spool) / ident
    with open(root / "worker.lock", "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        payload = json.loads((root / "request.json").read_bytes())
        hashed = sha(payload)
        result = {"id": ident, "inputDigest": hashed, "terminal": True, "stopped": False,
                  "exitCode": None, "cancelled": False, "timedOut": False}
        name = container_name(ident)
        launched = False
        try:
            preflight(image)
            if (root / "cancel.json").exists():
                result["cancelled"] = True
                result["stopped"] = True
                result["captureError"] = "CANCELLED_BEFORE_LAUNCH"
                return
            source = root / "source"
            materialize(payload["files"], source)
            prepare_git(source, payload)
            # Ignore rules are regular data, never candidate executable code.
            ignore = root / "ignore"
            ignore.mkdir()
            subprocess.run(["git", "init", str(ignore)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for f in payload["files"]:
                if f["path"].split("/")[-1] == ".gitignore" and f["mode"] != "120000":
                    p = ignore / f["path"]
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(base64.b64decode(f["data"]))
            policy_file = Path(spool) / "network-policy.json"
            network_policy = None
            if policy_file.exists():
                if policy_file.is_symlink() or policy_file.stat().st_mode & 0o077:
                    raise ValueError("NETWORK_POLICY_PERMISSIONS")
                network_policy = json.loads(policy_file.read_bytes())
            engine(arguments(ident, payload, source, image, network_policy), timeout=60)
            launched = True
            # /input is always read-only. Commands edit /work; validation uses /input.
            if not payload["readonly"]:
                engine(["exec", name, "/bin/sh", "-c", "cp -a /input/. /work/"], timeout=30)
            base = "/input" if payload["readonly"] else "/work"
            cwd = payload["cwd"]
            if cwd != ".":
                safe_path(cwd)
            # Image-owned Python resolves cwd before shell execution. No host paths.
            bootstrap = "import os,sys; b,c=sys.argv[1:3]; p=os.path.realpath(b+'/'+c); assert p==b or p.startswith(b+'/'); os.chdir(p); os.execv('/bin/sh',['sh','-c',sys.argv[3]])"
            argv = ["podman", "exec", "-i", name, "/usr/bin/env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/tmp", "TMPDIR=/tmp"]
            for key, value in payload["env"].items():
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or "\0" in value:
                    raise ValueError("ENV")
                argv.append(key + "=" + value)
            argv += ["python3", "-c", bootstrap, base, cwd, payload["command"]]
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            os.set_blocking(proc.stdin.fileno(), False)
            os.set_blocking(proc.stdout.fileno(), False)
            input_pump = InputPump(root, payload["stdin"])
            retained, discarded = 0, 0
            deadline = time.monotonic() + payload["timeout"]
            with open(root / "output", "wb") as log:
                while proc.poll() is None:
                    if (root / "cancel.json").exists() or time.monotonic() >= deadline:
                        result["cancelled"] = (root / "cancel.json").exists()
                        result["timedOut"] = not result["cancelled"]
                        engine(["kill", "--signal=KILL", name], check=False)
                        break
                    input_pump.step(proc.stdin)
                    try:
                        chunk = os.read(proc.stdout.fileno(), 65536)
                    except BlockingIOError:
                        chunk = b""
                    keep = chunk[:max(0, LOG_LIMIT - retained)]
                    log.write(keep)
                    log.flush()
                    retained += len(keep)
                    discarded += len(chunk) - len(keep)
                    time.sleep(.01)
                try:
                    result["exitCode"] = proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                # Drain bounded output after physical stop without trusting its text.
                while True:
                    try:
                        chunk = os.read(proc.stdout.fileno(), 65536)
                    except BlockingIOError:
                        break
                    if not chunk:
                        break
                    keep = chunk[:max(0, LOG_LIMIT - retained)]
                    log.write(keep)
                    retained += len(keep)
                    discarded += len(chunk) - len(keep)
                log.flush()
                os.fsync(log.fileno())
            proc.stdout.close()
            if not proc.stdin.closed:
                proc.stdin.close()
            result["discardedBytes"] = discarded
            state = inspect(ident, hashed)
            if not payload["readonly"] and state and state.get("Running"):
                # Freeze every container process before copying immutable capture.
                engine(["pause", name])
                copier = subprocess.Popen(["podman", "cp", name + ":/work/.", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                try:
                    result["files"] = capture_process(copier, payload["files"], payload["capturePaths"], ignore)
                finally:
                    engine(["unpause", name], check=False)
            elif not payload["readonly"]:
                result["captureError"] = "WORKSPACE_LOST_ON_STOP"
        except Exception as error:
            result.pop("files", None)
            result["captureError"] = type(error).__name__ + ":" + str(error)[:128]
        finally:
            try:
                state = inspect(ident, hashed)
                if state and state.get("Running"):
                    engine(["unpause", name], check=False)
                    engine(["kill", "--signal=KILL", name], check=False)
                state = inspect(ident, hashed)
                result["stopped"] = bool(state and not state.get("Running") and not state.get("Pid")) or (state is None and not launched)
            except Exception:
                result["stopped"] = False
            save(root / "result.json", result)


def rpc(spool, image, request):
    root = Path(spool)
    if not root.is_absolute() or "," in str(root) or ":" in str(root) or str(root) == "/":
        raise ValueError("SPOOL")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.stat().st_mode & 0o077 or root.is_symlink():
        raise ValueError("SPOOL_PERMISSIONS")
    action = request["action"]
    ident = request["payload"]["id"] if action == "submit" else request["id"]
    container_name(ident)
    job = root / ident
    # Slow cancellation/observation for one job must not fence other workspaces.
    with open(root / (ident + ".lock"), "a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == "submit":
            payload = request["payload"]
            if job.exists():
                if (job / "retired.json").exists():
                    if json.loads((job / "retired.json").read_bytes())["inputDigest"] != sha(payload):
                        raise ValueError("IDEMPOTENCY_MISMATCH")
                    return {"accepted": True, "retired": True}
                if not (job / "request.json").exists():
                    return {"error": "RESERVATION_UNKNOWN", "effect": "unknown"}
                if sha(json.loads((job / "request.json").read_bytes())) != sha(payload):
                    raise ValueError("IDEMPOTENCY_MISMATCH")
                return {"accepted": True}
            job.mkdir(mode=0o700)
            save(job / "request.json", payload)
            # Crash here yields unknown, never a duplicate launch on retry.
            with open(job / "outer.log", "ab") as log:
                subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "worker", str(root), image, ident],
                                 stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            return {"accepted": True}
        if not job.exists():
            return {"error": "RUN_NOT_FOUND", "effect": "unknown"}
        if action == "observe":
            return json.loads((job / "result.json").read_bytes()) if (job / "result.json").exists() else {"terminal": False}
        if action == "logs":
            offset, limit = request["offset"], request["limit"]
            if type(offset) is not int or offset < 0 or type(limit) is not int or not 0 < limit <= 65536:
                raise ValueError("CURSOR")
            if not (job / "output").exists():
                data = b""
                available = 0
            else:
                with open(job / "output", "rb") as stream:
                    available = os.fstat(stream.fileno()).st_size
                    stream.seek(offset)
                    data = stream.read(min(limit, max(0, available - offset)))
            controls = sorted(int(p.stem.split("-")[1]) for p in job.glob("stdin-*.json"))
            deliveries = []
            for sequence in controls[-16:]:
                receipt = job / ("delivery-" + str(sequence) + ".json")
                state = json.loads(receipt.read_bytes())["delivery"] if receipt.exists() else "queued"
                deliveries.append({"sequence": sequence, "delivery": state})
            return {"offset": offset, "nextOffset": offset + len(data), "availableBytes": available, "encoding": "base64", "data": base64.b64encode(data).decode(),
                    "stdin": {"nextSequence": len(controls), "deliveries": deliveries}}
        control_id = request["controlId"]
        container_name(control_id)
        record = job / ("control-" + control_id + ".json")
        if action == "control_status":
            if record.exists():
                return {"known": True, "result": json.loads(record.read_bytes())["result"]}
            for control in job.glob("stdin-*.json"):
                value = json.loads(control.read_bytes())
                if value.get("_controlId") == control_id:
                    return {"known": True, "result": {"delivery": "queued", "nextSequence": value["sequence"] + 1}}
            return {"known": False}
        if record.exists():
            saved = json.loads(record.read_bytes())
            if saved["hash"] != sha(request):
                raise ValueError("IDEMPOTENCY_MISMATCH")
            return saved["result"]
        if action == "retire":
            result_file = job / "result.json"
            if not result_file.exists():
                raise ValueError("STOP_PROOF_REQUIRED")
            result = json.loads(result_file.read_bytes())
            if result.get("stopped") is not True:
                raise ValueError("STOP_PROOF_REQUIRED")
            state = inspect(ident, result["inputDigest"])
            if state and (state.get("Running") or state.get("Pid")):
                raise ValueError("STOP_PROOF_REQUIRED")
            if state:
                engine(["rm", container_name(ident)])
            # Durable retirement tombstone precedes removal. Duplicate dispatch
            # still joins the original hash even after the large payload is gone.
            save(job / "retired.json", {"inputDigest": result["inputDigest"]})
            result.pop("files", None)
            save(result_file, result)
            for name in ("source", "ignore"):
                directory = job / name
                if directory.is_symlink():
                    raise ValueError("SPOOL_SYMLINK")
                if directory.exists():
                    shutil.rmtree(directory)
            if (job / "request.json").exists():
                (job / "request.json").unlink()
            result = {"retired": True}
        elif action == "cancel":
            if (job / "retired.json").exists():
                raise ValueError("PROCESS_RETIRED")
            save(job / "cancel.json", {"requested": True})
            payload = json.loads((job / "request.json").read_bytes())
            state = inspect(ident, sha(payload))
            if state and state.get("Running"):
                engine(["unpause", container_name(ident)], check=False)
                engine(["kill", "--signal=KILL", container_name(ident)], check=False)
            # If worker died, current authority may retire its resource independently.
            with open(job / "worker.lock", "a+b") as worker_lock:
                try:
                    fcntl.flock(worker_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    state = inspect(ident, sha(payload))
                    if not state or (not state.get("Running") and not state.get("Pid")):
                        if not (job / "result.json").exists():
                            save(job / "result.json", {"id": ident, "inputDigest": sha(payload), "terminal": True, "stopped": True,
                                                       "exitCode": None, "cancelled": True, "captureError": "WORKER_INTERRUPTED"})
                except BlockingIOError:
                    pass
            result = {"cancelRequested": True}
        elif action == "stdin":
            value = request["input"]
            sequence = value["sequence"]
            if type(sequence) is not int or sequence < 0 or sequence >= 1024:
                raise ValueError("STDIN_SEQUENCE")
            control = job / ("stdin-" + str(sequence) + ".json")
            previous = job / ("stdin-" + str(sequence - 1) + ".json")
            if control.exists():
                previous_value = json.loads(control.read_bytes())
                if previous_value.get("_controlId") == control_id and previous_value.get("_hash") == sha(request):
                    return {"delivery": "queued", "nextSequence": sequence + 1}
                raise ValueError("STDIN_SEQUENCE")
            if sequence > 0 and not previous.exists():
                raise ValueError("STDIN_SEQUENCE")
            if (job / "result.json").exists():
                raise ValueError("PROCESS_TERMINAL")
            save(control, {**value, "_controlId": control_id, "_hash": sha(request)})
            result = {"delivery": "queued", "nextSequence": sequence + 1}
        else:
            raise ValueError("ACTION")
        save(record, {"hash": sha(request), "result": result})
        return result


if __name__ == "__main__":
    os.umask(0o077)
    if sys.argv[1] == "worker":
        worker(*sys.argv[2:5])
    else:
        try:
            data = sys.stdin.buffer.read(48 * 1024 * 1024 + 1)
            if len(data) > 48 * 1024 * 1024:
                raise ValueError("INPUT_LIMIT")
            output = rpc(sys.argv[2], sys.argv[3], json.loads(data))
        except Exception as error:
            output = {"error": type(error).__name__ + ":" + str(error)[:128], "effect": "unknown"}
        sys.stdout.buffer.write(encoded(output))
