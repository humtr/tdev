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
        self.assertNotIn("network", exec_schema["properties"])
        self.assertFalse(validator.is_valid({"tool": "tdev_exec", "input": {
            "requestId": "exec-network", "taskId": wid, "expected": oid,
            "command": "true", "network": "none"}}))

        operation_schema = tools["tdev_operation"]["inputSchema"]
        self.assertNotIn("oneOf", operation_schema)
        self.assertEqual(operation_schema["properties"]["action"]["enum"],
                         ["status", "stdin", "cancel", "retire"])
        advertised = Draft202012Validator(operation_schema)
        for value in (
            {"action": "status", "operationId": "exec", "waitMs": 30000},
            {"action": "status", "lookupRequestId": "original"},
            {"action": "stdin", "requestId": "stdin", "operationId": "exec",
             "sequence": 0, "text": "hello"},
            {"action": "cancel", "requestId": "cancel", "operationId": "exec"},
            {"action": "retire", "requestId": "retire", "operationId": "exec"},
        ):
            self.assertTrue(advertised.is_valid(value))
            validator.validate({"tool": "tdev_operation", "input": value})
        for value in (
            {"action": "status"},
            {"action": "status", "operationId": "exec", "lookupRequestId": "original"},
            {"action": "stdin", "operationId": "exec", "sequence": 0, "text": "hello"},
            {"action": "cancel", "requestId": "cancel", "operationId": "exec", "waitMs": 1},
        ):
            self.assertFalse(validator.is_valid({"tool": "tdev_operation", "input": value}))
        self.assertFalse(advertised.is_valid({"action": "status", "operationId": "exec",
                                              "unexpected": True}))

        host_inputs = {
            "tdev_workspace": ("workspaceInput", "workspaceToolInput"),
            "tdev_task": ("taskInput", "taskToolInput"),
            "tdev_validate": ("validateInput", "validateToolInput"),
            "tdev_project": ("projectInput", "projectToolInput"),
            "tdev_deploy": ("deployInput", "deployToolInput"),
            "tdev_artifact": ("artifactInput", "artifactToolInput"),
            "tdev_diagnostics": ("diagnosticsInput", "diagnosticsToolInput"),
        }
        wrapper_refs = {
            branch["properties"]["tool"]["const"]: branch["properties"]["input"]["$ref"]
            for branch in s["oneOf"]
        }
        for tool_name, (canonical_name, advertised_name) in host_inputs.items():
            schema = tools[tool_name]["inputSchema"]
            canonical = s["$defs"][canonical_name]
            self.assertEqual(schema, expanded(s, {"$ref": f"#/$defs/{advertised_name}"}))
            self.assertNotIn("oneOf", schema)
            self.assertTrue(schema["properties"])
            self.assertFalse(schema["additionalProperties"])
            self.assertEqual(wrapper_refs[tool_name], f"#/$defs/{canonical_name}")
            canonical_properties = {
                name for arm in canonical["oneOf"] for name in arm.get("properties", {})
            }
            self.assertEqual(set(schema["properties"]), canonical_properties)
            canonical_required = set.intersection(
                *(set(arm.get("required", [])) for arm in canonical["oneOf"]))
            self.assertEqual(set(schema.get("required", [])), canonical_required)
            actions = []
            for arm in canonical["oneOf"]:
                action = arm.get("properties", {}).get("action", {})
                if "const" in action and action["const"] not in actions:
                    actions.append(action["const"])
                for value in action.get("enum", []):
                    if value not in actions:
                        actions.append(value)
            if actions:
                self.assertEqual(schema["properties"]["action"]["enum"], actions)

        def contains_keyword(value, keyword):
            if isinstance(value, dict):
                return keyword in value or any(contains_keyword(v, keyword)
                                               for v in value.values())
            if isinstance(value, list):
                return any(contains_keyword(v, keyword) for v in value)
            return False

        task_schema = tools["tdev_task"]["inputSchema"]
        self.assertTrue(contains_keyword(task_schema["properties"]["resolutions"], "oneOf"))
        task_advertised = Draft202012Validator(task_schema)
        loose_task = {"action": "list", "taskId": "task"}
        self.assertTrue(task_advertised.is_valid(loose_task))
        self.assertFalse(validator.is_valid({"tool": "tdev_task", "input": loose_task}))

        validate_schema = tools["tdev_validate"]["inputSchema"]
        validate_advertised = Draft202012Validator(validate_schema)
        self.assertTrue(validate_advertised.is_valid({"requestId": "v"}))
        self.assertFalse(validator.is_valid({"tool": "tdev_validate",
                                             "input": {"requestId": "v"}}))

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
                         ["workspace", "task", "read", "edit", "exec", "operation", "validate", "publish", "project", "deploy", "artifact", "diagnostics"])
        architecture = (root / "ARCHITECTURE.md").read_text()
        self.assertIn("task/read/edit/exec/operation/validate/publish", architecture)
        plan = (root / "IMPLEMENTATION_PLAN.md").read_text()
        self.assertLess(plan.index("Contract/SQLite/Git"), plan.index("Command + validation"))
        self.assertLess(plan.index("Command + validation"), plan.index("Inactive install"))
