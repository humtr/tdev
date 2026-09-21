"""Local operator packaging/config tools. Not exposed through MCP."""
import argparse
import fcntl
import json
import os
import secrets
import shlex
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require


TUNNEL_CLIENT_MODULE = "github.com/openai/tunnel-client/cmd/client@v0.0.14"
TUNNEL_CLIENT_VERSION = "0.0.14"


def _tunnel_version(binary):
    try:
        result = subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as exc:
        raise Fault("TUNNEL_CLIENT_VERSION", str(exc)) from None
    text = (result.stdout or result.stderr).strip()
    require(result.returncode == 0 and
            (text == TUNNEL_CLIENT_VERSION or text.startswith(TUNNEL_CLIENT_VERSION + "+")),
            "TUNNEL_CLIENT_VERSION", text[:200])
    return text.splitlines()[0]


def _select_tunnel_runtime(root):
    root = Path(root).absolute()
    native = root / "bin" / "tunnel-client"
    if native.is_file() and os.access(native, os.X_OK):
        try:
            return {"mode": "native-cgo", "binary": str(native), "version": _tunnel_version(native)}
        except Fault:
            pass

    system = shutil.which("tunnel-client")
    prefix = os.environ.get("PREFIX")
    chroot = shutil.which("termux-chroot")
    cert = Path(prefix) / "etc" / "tls" / "cert.pem" if prefix else None
    if prefix and system and chroot and cert and cert.is_file():
        return {"mode": "termux-chroot", "binary": system, "wrapper": chroot,
                "version": _tunnel_version(system), "caBundle": str(cert)}
    if system and Path("/etc/resolv.conf").is_file():
        return {"mode": "system", "binary": system, "version": _tunnel_version(system)}
    return {"mode": "unprepared", "binary": "tunnel-client", "version": None}


def prepare_tunnel(root):
    root = Path(root).absolute()
    require(str(root) != "/" and not root.is_symlink(), "INSTALL_ROOT")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(root.stat().st_uid == os.getuid() and root.stat().st_mode & 0o077 == 0, "INSTALL_PERMISSIONS")
    bindir = root / "bin"
    bindir.mkdir(exist_ok=True, mode=0o700)
    native = bindir / "tunnel-client"

    if native.is_file() and os.access(native, os.X_OK):
        try:
            return {"mode": "native-cgo", "binary": str(native),
                    "version": _tunnel_version(native), "reused": True}
        except Fault:
            pass

    go = shutil.which("go")
    native_error = None
    if go:
        try:
            goos = subprocess.run([go, "env", "GOOS"], capture_output=True, text=True,
                                  timeout=10, check=True).stdout.strip()
            goarch = subprocess.run([go, "env", "GOARCH"], capture_output=True, text=True,
                                    timeout=10, check=True).stdout.strip()
            if goos != "android" or not goarch:
                native_error = f"Termux-native Go target unavailable: GOOS={goos!r} GOARCH={goarch!r}"
            else:
                with tempfile.TemporaryDirectory(prefix=".tunnel-build-", dir=root) as temporary:
                    gobin = Path(temporary) / "bin"
                    gobin.mkdir()
                    env = {k: os.environ[k] for k in
                           ("PATH", "HOME", "PREFIX", "TMPDIR", "GOPROXY", "GOSUMDB")
                           if k in os.environ}
                    env.update({"GOBIN": str(gobin), "CGO_ENABLED": "1",
                                "GOOS": "android", "GOARCH": goarch})
                    built = subprocess.run([go, "install", TUNNEL_CLIENT_MODULE], env=env,
                                           capture_output=True, text=True, timeout=600)
                    candidate = gobin / "client"
                    if built.returncode == 0 and candidate.is_file():
                        version = _tunnel_version(candidate)
                        staged = bindir / (".tunnel-client-" + secrets.token_hex(8))
                        os.replace(candidate, staged)
                        os.chmod(staged, 0o700)
                        os.replace(staged, native)
                        return {"mode": "native-cgo", "binary": str(native), "version": version,
                                "goos": "android", "goarch": goarch, "cgo": True, "reused": False}
                    native_error = (built.stderr or built.stdout or "go install failed")[-500:]
        except (OSError, subprocess.SubprocessError) as exc:
            native_error = str(exc)[-500:]

    runtime = _select_tunnel_runtime(root)
    require(runtime["mode"] != "unprepared", "TUNNEL_CLIENT_INSTALL",
            native_error or "native build unavailable and no usable fallback")
    runtime["nativeBuild"] = "failed" if go else "unavailable"
    runtime["nativeBuildError"] = native_error
    return runtime


def bundle_files(source):
    source = Path(source).resolve()
    names = []
    for base in ("src", "contracts", ".tdev-deps"):
        for file in sorted((source / base).rglob("*")):
            if file.is_file() and "__pycache__" not in file.parts and file.suffix != ".pyc":
                require(not file.is_symlink(), "BUNDLE_SYMLINK")
                names.append(str(file.relative_to(source)))
    names.append("requirements.txt")
    return {name: digest((source / name).read_bytes()) for name in names}


def state_versions(directory):
    schema = Path(directory) / 'contracts/config.schema.json'
    return json.loads(schema.read_bytes()).get('x-stateVersions', [1]) if schema.exists() else [1]


def verify(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    require(manifest["schema"] == 1 and digest(manifest["files"]) == manifest["id"], "BUNDLE_IDENTITY")
    require(manifest.get('stateVersions', [1]) == state_versions(directory), 'BUNDLE_STATE_VERSION')
    for name, expected in manifest["files"].items():
        file = directory / name
        require(not file.is_symlink() and file.is_file() and digest(file.read_bytes()) == expected, "BUNDLE_CHANGED", name)
    actual = {str(f.relative_to(directory)) for f in directory.rglob("*") if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc"}
    require(actual == set(manifest["files"]) | {"manifest.json"}, "BUNDLE_EXTRA_FILE")
    return manifest


def stage(root, source):
    root, source = Path(root).absolute(), Path(source).resolve()
    require(str(root) != "/" and not root.is_symlink(), "INSTALL_ROOT")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(root.stat().st_uid == os.getuid() and root.stat().st_mode & 0o077 == 0, "INSTALL_PERMISSIONS")
    tunnel_env = root / "tunnel-env"
    tunnel_env.mkdir(exist_ok=True, mode=0o700)
    require(tunnel_env.stat().st_uid == os.getuid() and tunnel_env.stat().st_mode & 0o077 == 0, "TUNNEL_ENV_PERMISSIONS")
    files = bundle_files(source)
    ident = digest(files)
    versions = root / "versions"
    versions.mkdir(exist_ok=True, mode=0o700)
    destination = versions / ident
    if not destination.exists():
        with tempfile.TemporaryDirectory(prefix="stage-", dir=versions) as temporary:
            tmp = Path(temporary)
            for name in files:
                file = tmp / name
                file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source / name, file)
            atomic_write(tmp / "manifest.json", canonical({"schema": 1, "id": ident, "files": files,
                                                          "stateVersions": state_versions(tmp)}))
            verify(tmp)
            os.rename(tmp, destination)
    verify(destination)
    tunnel_runtime = _select_tunnel_runtime(root)
    require(tunnel_runtime["mode"] != "unprepared", "TUNNEL_CLIENT_INSTALL",
            "run prepare-tunnel before staging")
    from .resident import templates
    templates(root)
    return {"bundle": ident, "directory": str(destination), "started": False,
            "tunnelMode": tunnel_runtime["mode"]}


def point(root, ident):
    root = Path(root)
    require(len(ident) == 64 and all(c in "0123456789abcdef" for c in ident), "BUNDLE_IDENTITY")
    destination = root / "versions" / ident
    manifest = verify(destination)
    state = root / "state"
    state.mkdir(exist_ok=True, mode=0o700)
    with open(state / "controller.lock", "a+b") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Fault("CONTROLLER_BUSY") from None
        dbfile = state / "state.sqlite"
        if dbfile.exists():
            db = sqlite3.connect("file:" + str(dbfile) + "?mode=ro", uri=True)
            try:
                require(db.execute("PRAGMA user_version").fetchone()[0] in manifest.get('stateVersions', [1]),
                        "SCHEMA_VERSION", 'Selected bundle cannot read the current state schema; rollback requires a compatible bundle')
                require(db.execute("SELECT count(*) FROM operation WHERE status IN ('running','unknown')").fetchone()[0] == 0, "OUTSTANDING_EFFECT")
            finally:
                db.close()
        active = root / "active"
        if active.exists():
            require(active.is_symlink(), "ACTIVE_POINTER")
            previous = os.readlink(active)
            if previous == str(Path("versions") / ident):
                return {"active": ident, "started": False}
            atomic_write(root / "previous.json", canonical({"target": previous}))
        temp = root / (".active-" + secrets.token_hex(8))
        temp.symlink_to(Path("versions") / ident)
        os.replace(temp, active)
        fd = os.open(root, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    return {"active": ident, "started": False}


def rollback(root):
    root = Path(root)
    previous = json.loads((root / "previous.json").read_bytes())["target"]
    require(previous.startswith("versions/") and len(previous.split("/")) == 2, "PREVIOUS_POINTER")
    return point(root, previous.split("/")[1])


def check(root):
    root = Path(root)
    active = root / "active"
    require(active.is_symlink() and active.resolve().parent == (root / "versions").resolve(), "ACTIVE_POINTER")
    manifest = verify(active)
    config = json.loads(private_file(root / "config.json")) if (root / "config.json").exists() else None
    return {"bundle": manifest["id"], "configured": config is not None, "started": False}


def init_config(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(not (root / "config.json").exists() and not (root / "connector.secret").exists(), "CONFIG_EXISTS")
    secret = secrets.token_urlsafe(48)
    atomic_write(root / "connector.secret", secret.encode())
    atomic_write(root / "config.json", canonical({"version": 1, "principals": {"owner": {"tokenHash": digest(secret.encode()), "repos": {}}}, "repositories": {}}))
    return {"config": str(root / "config.json"), "secretFile": str(root / "connector.secret"), "grants": 0}


def delegate_projects(root, principal, name, local_root=None, github_owner=None, validation=None,
                      allow_create=False, namespace='refs/heads/tdev-work/'):
    """One-time scope delegation; subsequent project connect/create goes through MCP."""
    from jsonschema import Draft202012Validator
    from .projects import validate_policies
    filename = Path(root) / 'config.json'
    require(bool(local_root) != bool(github_owner), 'PROJECT_SCOPE', 'Select one local root or GitHub owner')
    require(validation, 'VALIDATION_REQUIRED', 'Provide the mandatory command for this project policy')
    with open(Path(root) / 'config.lock', 'a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        value = json.loads(private_file(filename))
        require(principal in value['principals'], 'PRINCIPAL_NOT_FOUND')
        require(name not in value.get('projectPolicies', {}), 'PROJECT_POLICY_EXISTS', 'Existing policies are not silently replaced')
        policy = {'kind': 'local' if local_root else 'github', 'validation': validation,
                  'allowCreate': allow_create, 'managedRefNamespace': namespace}
        if local_root:
            directory = Path(local_root).resolve(strict=True)
            require(directory.is_dir(), 'PROJECT_SCOPE')
            policy['root'] = str(directory)
        else:
            policy['owner'] = github_owner
        value.setdefault('projectPolicies', {})[name] = policy
        value['principals'][principal].setdefault('projectPolicies', []).append(name)
        schema = json.loads((Path(__file__).resolve().parents[2] / 'contracts/config.schema.json').read_bytes())
        require(Draft202012Validator(schema).is_valid(value), 'CONFIG', 'Invalid project delegation')
        validate_policies(value)
        atomic_write(filename, canonical(value))
    return {'policy': name, 'principal': principal, 'scope': policy.get('root', policy.get('owner')),
            'canCreate': allow_create, 'started': False}


def main():
    parser = argparse.ArgumentParser(description="Local-only operator actions; stage never starts services")
    parser.add_argument("action", choices=("stage", "point", "rollback", "check", "init", "prepare-tunnel", "delegate-projects", "delegate-deployments"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--source", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--bundle")
    parser.add_argument('--principal', default='owner')
    parser.add_argument('--policy')
    parser.add_argument('--local-root')
    parser.add_argument('--github-owner')
    parser.add_argument('--validation')
    parser.add_argument('--allow-create', action='store_true')
    parser.add_argument('--namespace', default='refs/heads/tdev-work/')
    parser.add_argument('--target', default='termux')
    parser.add_argument('--service-prefix', default='tdev-app-')
    args = parser.parse_args()
    if args.action == "stage":
        result = stage(args.root, args.source)
    elif args.action == "point":
        result = point(args.root, args.bundle)
    elif args.action == "rollback":
        result = rollback(args.root)
    elif args.action == "init":
        result = init_config(args.root)
    elif args.action == "prepare-tunnel":
        result = prepare_tunnel(args.root)
    elif args.action == 'delegate-projects':
        require(args.policy, 'PROJECT_POLICY_REQUIRED')
        result = delegate_projects(args.root, args.principal, args.policy, args.local_root, args.github_owner,
                                   args.validation, args.allow_create, args.namespace)
    elif args.action == 'delegate-deployments':
        from jsonschema import Draft202012Validator
        filename = Path(args.root) / 'config.json'
        with open(Path(args.root) / 'config.lock', 'a+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            value = json.loads(private_file(filename))
            require(args.principal in value['principals'], 'PRINCIPAL_NOT_FOUND')
            target = {'kind': 'termux', 'servicePrefix': args.service_prefix}
            previous = value.setdefault('deploymentTargets', {}).get(args.target)
            require(previous is None or previous == target, 'DEPLOYMENT_TARGET_CHANGED')
            value['deploymentTargets'][args.target] = target
            grants = value['principals'][args.principal].setdefault('deploymentTargets', [])
            if args.target not in grants:
                grants.append(args.target)
            schema = json.loads((Path(__file__).resolve().parents[2] / 'contracts/config.schema.json').read_bytes())
            require(Draft202012Validator(schema).is_valid(value), 'CONFIG')
            atomic_write(filename, canonical(value))
        result = {'target': args.target, 'principal': args.principal, 'servicePrefix': args.service_prefix, 'started': False}
    else:
        result = check(args.root)
    print(canonical(result).decode())


if __name__ == "__main__":
    main()
