"""Detect contract growth and broken evidence links without importing implementation code."""
import ast
import json
import unittest
from pathlib import Path

from acceptance.harness import CONTRACT, SOURCE


def actions(schema):
    while '$ref' in schema:
        schema = CONTRACT['$defs'][schema['$ref'].split('/')[-1]]
    branches = schema.get('oneOf', schema.get('anyOf'))
    if branches:
        return set().union(*(actions(branch) for branch in branches))
    properties = schema.get('properties', {})
    for key in ('queries', 'edits'):
        if key in properties:
            return actions(properties[key]['items'])
    selector = properties.get('action', properties.get('mode', properties.get('subject', {})))
    return set(selector.get('enum', [selector.get('const', 'default')]))


class InventoryTest(unittest.TestCase):
    def test_every_contract_action_has_an_evidence_and_delivery_entry(self):
        entries = json.loads(Path(__file__).with_name('inventory.json').read_text())['actions']
        actual = [(entry['tool'], entry['action']) for entry in entries]
        expected = {(tool['name'], action) for tool in CONTRACT['x-tools']
                    for action in actions(tool['inputSchema']['properties']['request'])}
        self.assertEqual(len(actual), len(set(actual)), 'Duplicate inventory entry')
        self.assertEqual(set(actual), expected)
        scenarios = set()
        for path in Path(__file__).parent.glob('test_*.py'):
            tree = ast.parse(path.read_text())
            scenarios.update(cls.name + '.' + method.name for cls in tree.body if isinstance(cls, ast.ClassDef)
                             for method in cls.body if isinstance(method, ast.FunctionDef))
        for entry in entries:
            with self.subTest(tool=entry['tool'], action=entry['action']):
                self.assertIn(entry['delivery'], ('P2', 'P3', 'P4', 'P5'))
                self.assertTrue(entry['existingEvidence'])
                for path in entry['existingEvidence']:
                    self.assertTrue((SOURCE / path).is_file(), path)
                for scenario in entry['externalScenarios']:
                    self.assertIn(scenario, scenarios)
