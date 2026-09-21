import base64
import hashlib
import json
import os
import re
import selectors
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path


class Fault(Exception):
    def __init__(self, code, message="", effect="none", operation_id=None):
        super().__init__(message or code)
        self.value = {"code": code, "message": message or code, "effect": effect}
        if operation_id:
            self.value["operationId"] = operation_id


def require(condition, code, message=""):
    if not condition:
        raise Fault(code, message)


def branch_ref(value):
    """Restricted full branch names, also checked by Git before effects."""
    return (isinstance(value, str) and value.startswith('refs/heads/')
            and re.fullmatch(r'refs/heads/[A-Za-z0-9_./-]+', value) is not None
            and '..' not in value and not value.endswith('.')
            and all(p and not p.startswith('.') and not p.endswith('.lock') for p in value.split('/')))


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def path(value, dot=False):
    require(isinstance(value, str) and len(value.encode()) <= 4096, "PATH")
    if value == "." and dot:
        return value
    parts = value.split("/")
    require(not any(p in ("", ".", "..") or p.lower() == ".git" or
                    p.lower().rstrip(" .") == ".git" for p in parts), "PATH")
    require(not any(ord(c) < 32 for c in value) and "\\" not in value, "PATH")
    return value


def decode(content, encoding="utf8"):
    if encoding == "utf8":
        return content.encode("utf-8", errors="strict")
    try:
        data = base64.b64decode(content, validate=True)
        require(base64.b64encode(data).decode() == content, "ENCODING")
        return data
    except (ValueError, TypeError):
        raise Fault("ENCODING") from None


def atomic_write(filename, data, mode=0o600):
    filename = Path(filename)
    filename.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".write-", dir=filename.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, filename)
        parent = os.open(filename.parent, os.O_RDONLY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(argv, data=None, env=None, timeout=30, check=True, limit=48 * 1024 * 1024):
    try:
        proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=env, start_new_session=True)
    except OSError:
        raise Fault("EXECUTABLE_UNAVAILABLE") from None
    # Feed potentially large pack/input concurrently while draining both pipes.
    def feed():
        try:
            if data:
                proc.stdin.write(data)
                proc.stdin.flush()
        except (BrokenPipeError, OSError):
            pass
        finally:
            proc.stdin.close()
    writer = threading.Thread(target=feed, daemon=True)
    writer.start()
    selector = selectors.DefaultSelector()
    stdout, stderr = bytearray(), bytearray()
    selector.register(proc.stdout, selectors.EVENT_READ, stdout)
    selector.register(proc.stderr, selectors.EVENT_READ, stderr)
    deadline = time.monotonic() + timeout
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Fault("TRANSPORT_TIMEOUT", "Command delivery/result is uncertain", "unknown")
            for key, _ in selector.select(min(remaining, .25)):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                else:
                    key.data.extend(chunk)
                    if len(stdout) + len(stderr) > limit:
                        raise Fault("OUTPUT_LIMIT", "Fixed utility output exceeded limit", "unknown")
        proc.wait(timeout=max(.01, deadline - time.monotonic()))
    except (Fault, subprocess.TimeoutExpired) as error:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        if isinstance(error, subprocess.TimeoutExpired):
            raise Fault("TRANSPORT_TIMEOUT", "Command delivery/result is uncertain", "unknown") from None
        raise
    finally:
        selector.close()
        proc.stdout.close()
        proc.stderr.close()
        writer.join(timeout=1)
    result = subprocess.CompletedProcess(argv, proc.returncode, bytes(stdout), bytes(stderr))
    if check and result.returncode:
        raise Fault("COMMAND_FAILED", result.stderr[:2048].decode(errors="replace"))
    return result


def private_file(filename):
    p = Path(filename)
    st = p.lstat()
    require(not p.is_symlink() and p.is_file() and st.st_uid == os.getuid()
            and st.st_mode & 0o077 == 0, "PRIVATE_CONFIG", str(p))
    return p.read_bytes()


def load_contract():
    from jsonschema import Draft202012Validator
    schema = json.loads((Path(__file__).resolve().parents[2] / "contracts/tools.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return schema, Draft202012Validator(schema)
