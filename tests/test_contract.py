import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from tdev.common import load_contract
from tdev.server import VERSION, expanded


class ContractTest(unittest.TestCase):
    def test_advertisement_and_all_input_families(self):
        s, validator = load_contract()
        oid, wid = "a" * 40, "workspace"
        examples = s["x-examples"] + [
            {"tool": "tdev_read", "input": {"workspaceId": wid, "checkpoint": oid, "queries": [{"action": "file", "path": "a"}, {"action": "search", "text": "a"}]}},
            {"tool": "tdev_edit", "input": {"requestId": "edit", "workspaceId": wid, "expected": oid, "edits": [{"action": "put", "path": "a", "before": None, "content": "new"}]}},
            {"tool": "tdev_validate", "input": {"requestId": "v", "workspaceId": wid, "expected": oid, "message": "validate"}},
            {"tool": "tdev_publish", "input": {"requestId": "p", "validationId": "v", "expectedHead": oid}},
            {"tool": "tdev_process", "input": {"action": "stdin", "requestId": "stdin", "operationId": "exec", "sequence": 0, "text": "hello"}},
        ]
        for example in examples:
            validator.validate(example)
            bad = json.loads(json.dumps(example))
            bad["input"]["adminApproved"] = True
            self.assertFalse(validator.is_valid(bad))
        for tool in expanded(s, s["x-tools"]):
            self.assertEqual(tool["inputSchema"]["type"], "object")
            Draft202012Validator.check_schema(tool["inputSchema"])
            Draft202012Validator.check_schema(tool["outputSchema"])
        config = json.loads((Path(__file__).resolve().parents[1] / "contracts/config.schema.json").read_bytes())
        Draft202012Validator.check_schema(config)

    def test_native_default_and_optional_ssh_config(self):
        root = Path(__file__).resolve().parents[1]
        schema = json.loads((root / "contracts/config.schema.json").read_bytes())
        validator = Draft202012Validator(schema)
        config = {"version": 1, "principals": {}, "repositories": {"repo": {
            "kind": "local", "remote": "/fixture", "identity": "fixture",
            "refs": ["refs/heads/main"], "validation": "true"}}}
        repo = config["repositories"]["repo"]
        validator.validate(config)  # no remote enrollment
        repo["toolingEnvironment"] = {"PYTHONPATH": "/operator/tooling"}
        validator.validate(config)
        repo["toolingEnvironment"] = {"HOME": "/must-remain-private"}
        self.assertFalse(validator.is_valid(config))
        repo["toolingEnvironment"] = {"PYTHONPATH": "/operator/tooling"}
        repo["executor"] = {"kind": "native"}
        repo["networks"] = ["host"]
        validator.validate(config)
        repo["executor"] = {"target": "fixture", "script": "/runner", "digest": "a" * 64,
                            "spool": "/spool", "image": "fixture@sha256:" + "a" * 64,
                            "knownHosts": "/hosts", "identityFile": "/key"}
        validator.validate(config)  # previous SSH config remains readable
        repo["executor"]["kind"] = "ssh"
        validator.validate(config)
        repo["executor"]["kind"] = "native"
        self.assertFalse(validator.is_valid(config))

    def test_document_surface_and_sequence(self):
        root = Path(__file__).resolve().parents[1]
        s, _ = load_contract()
        self.assertEqual(s["x-mcp"]["protocolVersion"], VERSION)
        expected_annotations = {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": False,
        }
        for tool in s["x-tools"]:
            self.assertEqual(tool["annotations"], expected_annotations)
        self.assertEqual([t["name"].removeprefix("tdev_") for t in s["x-tools"]],
                         ["workspace", "read", "edit", "exec", "process", "validate", "publish"])
        architecture = (root / "ARCHITECTURE.md").read_text()
        self.assertIn("workspace/read/edit/exec/process/validate/publish", architecture)
        plan = (root / "IMPLEMENTATION_PLAN.md").read_text()
        self.assertLess(plan.index("Contract/SQLite/Git"), plan.index("Command + validation"))
        self.assertLess(plan.index("Command + validation"), plan.index("Inactive install"))
