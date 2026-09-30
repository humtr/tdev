"""Public wire fidelity and receipt continuity across the syntax replacement."""
import unittest

from tdev.common import load_contract
from tdev.server import expanded
import test_http
from test_surface_probe import probe


class SurfaceTest(unittest.TestCase):
    def test_public_constraints_equal_host_qualified_positive_alternatives(self):
        schema, _ = load_contract()
        expected = probe.Surface('B2').tools
        def constraints(value):
            if isinstance(value, list):
                return [constraints(v) for v in value]
            if isinstance(value, dict):
                return {k: constraints(v) for k, v in value.items() if k != 'description'}
            return value
        self.assertFalse(any(name.endswith('ToolInput') for name in schema['$defs']))
        for tool in expanded(schema, schema['x-tools']):
            if tool['name'] in ('tdev_find', 'tdev_deploy', 'tdev_exec'):
                continue
            self.assertEqual(constraints(tool['inputSchema']), constraints(expected[tool['name']]['inputSchema']))

    def test_new_envelope_recovers_old_receipt_before_stale_check(self):
        fixture = test_http.HTTPTest()
        fixture.setUp()
        try:
            c = fixture.controller
            source = c.call('alice', 'tdev_task', {
                'action': 'open', 'requestId': 'old-open', 'repo': 'test',
                'ref': 'refs/heads/main', 'expectedHead': fixture.repo.head})['result']['result']
            args = {'requestId': 'old-edit', 'taskId': source['taskId'],
                    'expected': source['checkpoint'], 'edits': [
                        {'action': 'put', 'path': 'new.txt', 'content': 'once', 'before': None}]}
            # Simulate a pre-redesign committed effect whose response was lost.
            accepted = c.call('alice', 'tdev_edit', args)
            self.assertTrue(accepted['ok'], accepted)
            self.assertNotEqual(accepted['result']['result']['checkpoint'], args['expected'])
            status, response = fixture.request('tools/call', {
                'name': 'tdev_edit', 'arguments': {'request': args}}, raw_wire=True)
            self.assertEqual(status, 200)
            self.assertEqual(response['result']['structuredContent'], accepted)
            changed = {**args, 'edits': [dict(args['edits'][0], content='twice')]}
            _, conflict = fixture.request('tools/call', {
                'name': 'tdev_edit', 'arguments': {'request': changed}}, raw_wire=True)
            self.assertFalse(conflict['result']['structuredContent']['ok'])
        finally:
            fixture.tearDown()

    def test_flat_or_mixed_envelopes_fail_without_admission(self):
        fixture = test_http.HTTPTest()
        fixture.setUp()
        try:
            request = {'action': 'start', 'requestId': 'must-not-execute'}
            for arguments in (request, {'request': request, 'action': 'start'},
                              {'request': {**request, 'fromTaskId': 'old', 'localChanges': True}}):
                _, response = fixture.request('tools/call', {
                    'name': 'tdev_task', 'arguments': arguments}, raw_wire=True)
                value = response['result']['structuredContent']
                self.assertFalse(value['ok'])
                self.assertEqual(value['error']['code'], 'SCHEMA')
                self.assertEqual(value['error']['effect'], 'none')
            self.assertEqual(fixture.controller.store.db.execute('SELECT COUNT(*) FROM operation').fetchone()[0], 0)
        finally:
            fixture.tearDown()
