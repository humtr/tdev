"""Local operator packaging/config tools. Not exposed through MCP."""
import argparse
import fcntl
import json
import os
import secrets
import shlex
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require


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


def verify(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    require(manifest["schema"] == 1 and digest(manifest["files"]) == manifest["id"], "BUNDLE_IDENTITY")
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
            atomic_write(tmp / "manifest.json", canonical({"schema": 1, "id": ident, "files": files}))
            verify(tmp)
            os.rename(tmp, destination)
    verify(destination)
    # Service templates are staged outside the live runsvdir. Never start here.
    for service in ("tdev", "tdev-oai-tunnel"):
        directory = root / "services" / service
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        atomic_write(directory / "down", b"")
        shell = shutil.which("sh")
        if service == "tdev":
            command = "exec " + shlex.join([sys.executable, "-m", "tdev.server", "--state", str(root / "state"), "--config", str(root / "config.json")])
            setup = "export PYTHONPATH=" + shlex.quote(str(root / "active" / "src") + ":" + str(root / "active" / ".tdev-deps")) + "\n"
        else:
            # Load the owner-only runtime key directly; Termux does not require envdir.
            key_file = shlex.quote(str(root / "tunnel-env" / "CONTROL_PLANE_API_KEY"))
            setup = (
                "key_file=" + key_file + "\n"
                "[ -r \"$key_file\" ] || { printf '%s\\n' 'missing tunnel runtime key' >&2; exit 78; }\n"
                "CONTROL_PLANE_API_KEY=$(cat \"$key_file\")\n"
                "[ -n \"$CONTROL_PLANE_API_KEY\" ] || { printf '%s\\n' 'empty tunnel runtime key' >&2; exit 78; }\n"
                "export CONTROL_PLANE_API_KEY\n"
            )
            tunnel_argv = [
                shutil.which("tunnel-client") or "tunnel-client", "run", "--profile", "tdev",
                "--health.listen-addr", "127.0.0.1:0"
            ]
            prefix = os.environ.get("PREFIX")
            if prefix and not Path("/etc/resolv.conf").is_file():
                # Official Linux tunnel-client builds use Go's /etc resolver/CA paths.
                # Project Termux host files into those paths without claiming PRoot isolation.
                resolv = Path(prefix) / "etc" / "resolv.conf"
                cert = Path(prefix) / "etc" / "tls" / "cert.pem"
                proot = shutil.which("proot")
                require(proot is not None and resolv.is_file() and cert.is_file(), "TERMUX_TUNNEL_COMPAT")
                tunnel_argv = [
                    proot,
                    "-b", f"{resolv}:/etc/resolv.conf",
                    "-b", f"{cert}:/etc/ssl/cert.pem",
                    *tunnel_argv,
                ]
            command = "exec " + shlex.join(tunnel_argv)
        atomic_write(directory / "run", ("#!" + shell + "\nset -eu\nexec 2>&1\n" + setup + command + "\n").encode(), 0o700)
        log = directory / "log"
        log.mkdir(exist_ok=True)
        atomic_write(log / "run", ("#!" + shell + "\nexec " + shlex.join([shutil.which("svlogd") or "svlogd", "-tt", str(root / "logs" / service)]) + "\n").encode(), 0o700)
        logs = root / "logs" / service
        logs.mkdir(parents=True, exist_ok=True)
        atomic_write(logs / "config", b"s1048576\nn3\n")
    return {"bundle": ident, "directory": str(destination), "started": False}


def point(root, ident):
    root = Path(root)
    require(len(ident) == 64 and all(c in "0123456789abcdef" for c in ident), "BUNDLE_IDENTITY")
    destination = root / "versions" / ident
    verify(destination)
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
                require(db.execute("PRAGMA user_version").fetchone()[0] == 1, "SCHEMA_VERSION")
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


def main():
    parser = argparse.ArgumentParser(description="Local-only operator actions; stage never starts services")
    parser.add_argument("action", choices=("stage", "point", "rollback", "check", "init"))
    parser.add_argument("--root", required=True)
    parser.add_argument("--source", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--bundle")
    args = parser.parse_args()
    if args.action == "stage":
        result = stage(args.root, args.source)
    elif args.action == "point":
        result = point(args.root, args.bundle)
    elif args.action == "rollback":
        result = rollback(args.root)
    elif args.action == "init":
        result = init_config(args.root)
    else:
        result = check(args.root)
    print(canonical(result).decode())


if __name__ == "__main__":
    main()
