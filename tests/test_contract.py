import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from tdev.common import load_contract
from tdev.server import VERSION, expanded


class ContractTest(unittest.TestCase):
    def test_advertisement_and_all_input_families(self):
        s, validator = load_contract()
        oid, wid = "a" * 40, "task"
        examples = s["x-examples"] + [
            {"tool": "tdev_read", "input": {"taskId": wid, "checkpoint": oid, "queries": [{"action": "file", "path": "a"}, {"action": "search", "text": "a"}]}},
            {"tool": "tdev_edit", "input": {"requestId": "edit", "taskId": wid, "expected": oid, "edits": [{"action": "put", "path": "a", "before": None, "content": "new"}]}},
            {"tool": "tdev_validate", "input": {"requestId": "v", "taskId": wid, "expected": oid, "message": "validate"}},
            {"tool": "tdev_publish", "input": {"requestId": "p", "validationId": "v", "expectedHead": oid}},
            {"tool": "tdev_operation", "input": {"action": "stdin", "requestId": "stdin", "operationId": "exec", "sequence": 0, "text": "hello"}},
        ]
        for example in examples:
            validator.validate(example)
            bad = json.loads(json.dumps(example))
            bad["input"]["adminApproved"] = True
            self.assertFalse(validator.is_valid(bad))
        tools = {tool["name"]: tool for tool in expanded(s, s["x-tools"])}
        for tool in tools.values():
            self.assertEqual(tool["inputSchema"]["type"], "object")
            Draft202012Validator.check_schema(tool["inputSchema"])
            Draft202012Validator.check_schema(tool["outputSchema"])

        exec_schema = tools["tdev_exec"]["inputSchema"]
        for branch in exec_schema['properties']['request']['oneOf']:
            self.assertNotIn('network', branch['properties'])
        self.assertFalse(validator.is_valid({"tool": "tdev_exec", "input": {
            "requestId": "exec-network", "taskId": wid, "expected": oid,
            "command": "true", "network": "none"}}))

        operation_schema = tools["tdev_operation"]["inputSchema"]
        self.assertNotIn("oneOf", operation_schema)
        self.assertEqual(operation_schema['required'], ['request'])
        self.assertIn('oneOf', operation_schema['properties']['request'])
        advertised = Draft202012Validator(operation_schema)
        for value in (
            {"action": "status", "operationId": "exec", "waitMs": 30000},
            {"action": "status", "lookupRequestId": "original"},
            {"action": "stdin", "requestId": "stdin", "operationId": "exec",
             "sequence": 0, "text": "hello"},
            {"action": "cancel", "requestId": "cancel", "operationId": "exec"},
            {"action": "retire", "requestId": "retire", "operationId": "exec"},
        ):
            self.assertTrue(advertised.is_valid({"request": value}))
            validator.validate({"tool": "tdev_operation", "input": value})
        for value in (
            {"action": "status"},
            {"action": "status", "operationId": "exec", "lookupRequestId": "original"},
            {"action": "stdin", "operationId": "exec", "sequence": 0, "text": "hello"},
            {"action": "cancel", "requestId": "cancel", "operationId": "exec", "waitMs": 1},
        ):
            self.assertFalse(validator.is_valid({"tool": "tdev_operation", "input": value}))
            self.assertFalse(advertised.is_valid({'request': value}))
        self.assertFalse(advertised.is_valid({"action": "status", "operationId": "exec",
                                              "unexpected": True}))

        for tool_name, tool in tools.items():
            family = tool_name.removeprefix('tdev_')
            schema = tool['inputSchema']
            self.assertEqual(schema['properties']['request'],
                             expanded(s, {'$ref': f'#/$defs/{family}Input'}))
            self.assertEqual(set(schema['properties']), {'request'})
            self.assertEqual(schema['required'], ['request'])
            self.assertFalse(schema['additionalProperties'])

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

    def test_source_validation_budget_configuration_ranges(self):
        from jsonschema import Draft202012Validator
        root = Path(__file__).resolve().parents[1]
        schema = json.loads((root / 'contracts/config.schema.json').read_text())
        for section in ('repositories', 'projectPolicies'):
            field = schema['properties'][section]['additionalProperties']['properties']['validationTimeoutSeconds']
            validator = Draft202012Validator(field)
            for value in (1, 300, 1800, 3600):
                self.assertTrue(validator.is_valid(value))
            for value in (0, -1, 3601, None, '300', True, 1.5):
                self.assertFalse(validator.is_valid(value), value)

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
                         ["find", "workspace", "task", "read", "edit", "exec", "operation", "validate", "publish", "project", "deploy", "artifact", "diagnostics"])
        architecture = (root / "ARCHITECTURE.md").read_text()
        self.assertIn("task/read/edit/exec/operation/validate/publish", architecture)
        plan = (root / "IMPLEMENTATION_PLAN.md").read_text()
        self.assertLess(plan.index("Contract/SQLite/Git"), plan.index("Command + validation"))
        self.assertLess(plan.index("Command + validation"), plan.index("Inactive install"))
