"""Probe validity is separate from product or ChatGPT acceptance."""
import copy
import importlib.util
import itertools
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("surface_probe", ROOT / "scripts/probe_surface.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SurfaceProbeTest(unittest.TestCase):
    def test_all_branches_roundtrip_and_no_mutation_dispatch(self):
        base = probe.Surface("root")
        for candidate in probe.CANDIDATES:
            surface = probe.Surface(candidate)
            for tool, args in probe.corpus(base):
                with self.subTest(candidate=candidate, tool=tool, args=args):
                    name, encoded = surface.encode(tool, args)
                    self.assertEqual(surface.decode(name, encoded), (tool, args))
                    reply = surface.call(name, encoded)
                    self.assertTrue(reply["ok"])
                    self.assertEqual(reply["effect"], "none")
                    self.assertTrue(reply["probeOnly"])
                    self.assertEqual(reply, surface.call(name, encoded))

    def test_measurement_is_reproducible_and_does_not_claim_model_accuracy(self):
        with tempfile.TemporaryDirectory() as path:
            out = Path(path)
            report = probe.generate(out)
            self.assertIsNone(report["modelSelectionAccuracy"])
            self.assertIsNone(report["hostRendering"])
            self.assertGreater(report["candidates"]["A"]["invalidDiscoveryAccepted"], 0)
            for candidate in ("root", "B", "C", "D", "B2"):
                self.assertEqual(report["candidates"][candidate]["invalidDiscoveryAccepted"], 0)
            for entry in report["candidates"].values():
                self.assertEqual(entry["invalidRuntimeAccepted"], 0)
            self.assertEqual(report, json.loads((out / "metrics.json").read_text()))
            # A stale fixture must never be silently presented as the current experiment.
            checked = ROOT / "examples/surface-probe/generated/metrics.json"
            self.assertEqual(report, json.loads(checked.read_text()))

    def test_nested_contract_keeps_conditionals_and_identity_exclusion(self):
        surface = probe.Surface("B")
        good = {"request": {"action": "status", "lookupRequestId": "lost-reply"}}
        self.assertTrue(surface.call("tdev_operation", good)["ok"])
        bad = copy.deepcopy(good)
        bad["request"]["operationId"] = "guessed"
        self.assertFalse(surface.call("tdev_operation", bad)["ok"])
        self.assertFalse(surface.call("tdev_task", {"request": {
            "action": "start", "requestId": "start", "fromTaskId": "old",
            "localChanges": True}})["ok"])
        # Reusing nested schemas must not flatten their independent conditional rules.
        for tool, schema in surface.inputs.items():
            self.assertEqual(surface.tools[tool]["inputSchema"]["properties"]["request"], schema)
            Draft202012Validator.check_schema(surface.tools[tool]["inputSchema"])

    def test_stdio_is_effect_free_even_when_requested_call_is_a_mutation(self):
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
                "name": "tdev_task", "arguments": {"request": {"action": "start", "requestId": "r"}}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {
                "name": "tdev_validate", "arguments": {"request": {"requestId": "v"}}}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(ROOT / "scripts/probe_surface.py"), "--stdio", "B"],
                                    input="\n".join(json.dumps(m) for m in messages) + "\n",
                                    cwd=directory, text=True, capture_output=True, timeout=15, check=True,
                                    env={**os.environ, "PYTHONPATH": os.pathsep.join(
                                        str(Path(p).resolve()) for p in sys.path if p)})
            self.assertEqual(list(Path(directory).iterdir()), [])
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r["id"] for r in replies], [1, 2, 3, 4])
        self.assertEqual(len(replies[1]["result"]["tools"]), 12)
        self.assertEqual(replies[2]["result"]["structuredContent"]["effect"], "none")
        self.assertTrue(replies[2]["result"]["structuredContent"]["probeOnly"])
        self.assertTrue(replies[3]["result"]["isError"])

    def test_positive_branches_preserve_presence_and_value_constraints(self):
        surface = probe.Surface("B2")
        absent = object()
        fixtures = [
            ("tdev_task", {"action": "start", "requestId": "r"}, {
                "fromTaskId": [absent, "task", None, "bad id"],
                "baseRef": [absent, "refs/heads/main", None, "bad ref"],
                "localChanges": [absent, True, False, None, 1]}),
            ("tdev_operation", {"action": "status"}, {
                "operationId": [absent, "op", None, "bad id"],
                "lookupRequestId": [absent, "request", None, "bad id"]}),
            ("tdev_workspace", {"action": "configure", "requestId": "r",
                                "workspaceId": "w", "expectedRevision": 1}, {
                "name": [absent, "name", "", None],
                "defaultRepo": [absent, "repo", None, 7]}),
            ("tdev_diagnostics", {"action": "mark", "instance": "a" * 16,
                                  "runId": "b" * 32, "cellId": "c" * 32, "sequence": 1}, {
                "phase": [absent, "cell_enter", "tool_return", "cell_exit", "invented"],
                "callOrdinal": [absent, 0, 1, None],
                "afterRequest": [absent, 0, 1, None]}),
        ]
        for tool, base, fields in fixtures:
            for values in itertools.product(*fields.values()):
                args = {**base, **{k: v for k, v in zip(fields, values) if v is not absent}}
                with self.subTest(tool=tool, args=args):
                    self.assertEqual(surface.canonical_validators[tool].is_valid(args),
                                     surface.validators[tool].is_valid({"request": args}))
        def forbidden(node):
            if isinstance(node, dict):
                return bool({"not", "if", "then", "else", "allOf"}.intersection(node)) or any(
                    forbidden(v) for v in node.values())
            return isinstance(node, list) and any(forbidden(v) for v in node)
        self.assertFalse(forbidden(list(surface.tools.values())))

    def test_positive_expansion_fails_closed_for_unhandled_constraints(self):
        unknown = {"type": "object", "properties": {"value": {"type": "string"}},
                   "not": {"properties": {"value": {"pattern": "unsafe-to-expand"}}}}
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            probe.positive(unknown)

    def test_mixed_catalog_routes_controls_without_effects(self):
        surface = probe.Comparison()
        for tool, args in (
            ("tdev_task", {"request": {"action": "start", "requestId": "r"}}),
            ("tdev_probe_root_task", {"action": "list"}),
            ("tdev_probe_flat_task", {"action": "list"}),
            ("tdev_probe_nested_task", {"request": {"action": "list"}}),
            ("tdev_probe_action_start", {"action": "start", "requestId": "r"}),
            ("tdev_probe_workflow_source", {"request": {"intent": "task.start",
              "arguments": {"action": "start", "requestId": "r"}}}),
        ):
            with self.subTest(tool=tool):
                value = surface.call(tool, args)
                self.assertTrue(value["ok"] and value["probeOnly"])
                self.assertEqual(value["effect"], "none")


if __name__ == "__main__":
    unittest.main()
