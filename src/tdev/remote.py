"""One fixed SSH transport to an operator-adopted outer executor."""
import json
import re
import shlex

from .common import Fault, canonical, private_file, require, run


class SSHExecutor:
    def __init__(self, config):
        self.config = config
        require(re.fullmatch(r"[A-Za-z0-9_.@-]+", config["target"]) and not config["target"].startswith("-"), "EXECUTOR_CONFIG")
        require(re.fullmatch(r"[0-9a-f]{64}", config["digest"]), "EXECUTOR_CONFIG")
        for name in ("knownHosts", "identityFile"):
            private_file(config[name])

    def rpc(self, action, **data):
        c = self.config
        # Hash the exact installed program before invoking it; remote shell receives
        # fixed operator config only. Model input goes through JSON stdin.
        verify = "import hashlib,runpy,sys; p,h=sys.argv[1:3]; assert hashlib.sha256(open(p,'rb').read()).hexdigest()==h; sys.argv=[p]+sys.argv[3:]; runpy.run_path(p,run_name='__main__')"
        command = shlex.join([c.get("python", "python3"), "-c", verify, c["script"], c["digest"],
                              "rpc", c["spool"], c["image"]])
        argv = ["ssh", "-T", "-oBatchMode=yes", "-oStrictHostKeyChecking=yes",
                "-oConnectTimeout=10", "-oIdentitiesOnly=yes", "-oForwardAgent=no",
                "-oClearAllForwardings=yes", "-oUserKnownHostsFile=" + c["knownHosts"],
                "-i", c["identityFile"], "--", c["target"], command]
        result = run(argv, canonical({"action": action, **data}), timeout=30, check=False)
        if result.returncode:
            raise Fault("EXECUTOR_TRANSPORT", "Executor delivery is unknown", "unknown")
        require(len(result.stdout) <= 48 * 1024 * 1024, "EXECUTOR_OUTPUT_LIMIT")
        try:
            value = json.loads(result.stdout)
        except ValueError:
            raise Fault("EXECUTOR_PROTOCOL", "Invalid outer response", "unknown") from None
        if "error" in value:
            raise Fault(value["error"], "Outer executor rejected request", value.get("effect", "unknown"))
        return value

    def submit(self, payload):
        return self.rpc("submit", payload=payload)

    def observe(self, ident):
        return self.rpc("observe", id=ident)

    def logs(self, ident, offset, limit):
        return self.rpc("logs", id=ident, offset=offset, limit=limit)

    def control(self, ident, args, control_id):
        return self.rpc(args["action"], id=ident, controlId=control_id, input=args)

    def control_status(self, ident, control_id):
        return self.rpc("control_status", id=ident, controlId=control_id)

    def retire(self, ident, control_id):
        return self.rpc("retire", id=ident, controlId=control_id)
