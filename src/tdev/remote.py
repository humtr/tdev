"""One fixed SSH transport to an operator-adopted outer executor."""
import io
import tempfile
from contextlib import contextmanager
import json
import re
import shlex

from .common import Fault, canonical, private_file, require, run
from .capacity import METADATA_BYTES, PACK_BYTES, check


class SSHExecutor:
    def __init__(self, config):
        self.config = config
        require(re.fullmatch(r"[A-Za-z0-9_.@-]+", config["target"]) and not config["target"].startswith("-"), "EXECUTOR_CONFIG")
        require(re.fullmatch(r"[0-9a-f]{64}", config["digest"]), "EXECUTOR_CONFIG")
        for name in ("knownHosts", "identityFile"):
            private_file(config[name])

    def argv(self, role):
        c = self.config
        # Hash the exact installed program before invoking it; remote shell receives
        # fixed operator config only. Model input goes through JSON stdin.
        verify = "import hashlib,runpy,sys; p,h=sys.argv[1:3]; assert hashlib.sha256(open(p,'rb').read()).hexdigest()==h; sys.argv=[p]+sys.argv[3:]; runpy.run_path(p,run_name='__main__')"
        command = shlex.join([c.get("python", "python3"), "-c", verify, c["script"], c["digest"],
                              role, c["spool"], c["image"]])
        argv = ["ssh", "-T", "-oBatchMode=yes", "-oStrictHostKeyChecking=yes",
                "-oConnectTimeout=10", "-oIdentitiesOnly=yes", "-oForwardAgent=no",
                "-oClearAllForwardings=yes", "-oUserKnownHostsFile=" + c["knownHosts"],
                "-i", c["identityFile"], "--", c["target"], command]
        return argv

    def response(self, result):
        if result.returncode:
            raise Fault("EXECUTOR_TRANSPORT", "Executor delivery is unknown", "unknown")
        check('executorMetadataBytes', METADATA_BYTES, len(result.stdout), 'EXECUTOR_OUTPUT_LIMIT')
        try:
            value = json.loads(result.stdout)
        except ValueError:
            raise Fault("EXECUTOR_PROTOCOL", "Invalid outer response", "unknown") from None
        require(isinstance(value, dict), 'EXECUTOR_PROTOCOL')
        if "error" in value:
            if isinstance(value['error'], str) and 'budget=' in value['error']:
                raise Fault('EXECUTOR_LIMIT', value['error'], value.get('effect', 'unknown'))
            raise Fault(value["error"], "Outer executor rejected request", value.get("effect", "unknown"))
        return value

    def rpc(self, action, **data):
        return self.response(run(self.argv('rpc'), canonical({'action': action, **data}), timeout=30, check=False))

    def submit(self, payload, source=None):
        if not isinstance(payload.get('gitPack'), dict):
            return self.rpc('submit', payload=payload)
        require(source is not None, 'SOURCE_TRANSFER_REQUIRED')
        metadata = canonical({'action': 'submit', 'payload': payload})
        check('sourceMetadataBytes', METADATA_BYTES, len(metadata))
        check('packBytes', PACK_BYTES, payload['gitPack']['size'])
        source.seek(0)
        class Input:
            prefix = io.BytesIO(len(metadata).to_bytes(4, 'big') + metadata)
            def read(self, size):
                return self.prefix.read(size) or source.read(size)
        return self.response(run(self.argv('stream'), Input(), timeout=300, check=False))

    @contextmanager
    def capture(self, ident, descriptor):
        metadata = canonical({'action': 'capture', 'id': ident, 'descriptor': descriptor})
        check('sourceMetadataBytes', METADATA_BYTES, len(metadata))
        check('captureTransferBytes', PACK_BYTES, descriptor['size'])
        with tempfile.TemporaryFile() as response:
            result = run(self.argv('stream'), len(metadata).to_bytes(4, 'big') + metadata,
                         timeout=300, check=False, output=response, limit=PACK_BYTES + METADATA_BYTES + 4,
                         budget='captureTransferBytes')
            require(result.returncode == 0, 'EXECUTOR_TRANSPORT')
            response.seek(0)
            prefix = response.read(4)
            if prefix.startswith(b'{'):
                response.seek(0)
                result.stdout = response.read(METADATA_BYTES + 1)
                self.response(result)
                raise Fault('EXECUTOR_PROTOCOL', 'Expected binary capture response', 'unknown')
            length = int.from_bytes(prefix, 'big')
            check('sourceMetadataBytes', METADATA_BYTES, length)
            try:
                frame = json.loads(response.read(length))
            except ValueError:
                raise Fault('EXECUTOR_PROTOCOL', 'Invalid capture frame', 'unknown') from None
            require(frame == {'capture': descriptor}, 'CAPTURE_PROOF_REQUIRED')
            require(response.seek(0, 2) == 4 + length + descriptor['size'], 'CAPTURE_TRANSFER_INCOMPLETE')
            response.seek(4 + length)
            yield response

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
