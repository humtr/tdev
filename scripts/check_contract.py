"""Compare compiled native contract validation with an independent Schema oracle."""
import copy
import json
from pathlib import Path
import subprocess

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / 'contracts/tools.schema.json').read_text())
CONFIG = json.loads((ROOT / 'contracts/config.schema.json').read_text())
TOOLS = {tool['name']: tool for tool in SCHEMA['x-tools']}


def oracle(case):
    if case['surface'] == 'config':
        return Draft202012Validator(CONFIG).is_valid(case['value'])
    field = 'inputSchema' if case['surface'] == 'input' else 'outputSchema'
    schema = {'$defs': SCHEMA['$defs'], **TOOLS[case['tool']][field]}
    return Draft202012Validator(schema).is_valid(case['value'])


def cases():
    values = []
    for example in SCHEMA['x-examples']:
        name, request = example['tool'], example['input']
        for label, value in (
            ('example', {'request': request}), ('flat', request),
            ('mixed', {'request': request, 'requestId': 'outside'}),
            ('null', {'request': None}),
        ):
            values.append({'case': name + '/' + label, 'surface': 'input', 'tool': name, 'value': value})
        unknown = copy.deepcopy(request)
        unknown['adminApproved'] = True
        values.append({'case': name + '/authority', 'surface': 'input', 'tool': name,
                       'value': {'request': unknown}})
    # Fixed cases protect absent/null, alternatives, integer numeric forms,
    # Unicode length and bounds independently of the native module's layout.
    fixed = json.loads((ROOT / 'tests/acceptance/wire.json').read_text())
    for case in fixed:
        if oracle(case) != case['valid']:
            raise AssertionError('Fixed contract decision changed: ' + case['case'])
    values.extend(fixed)
    failure = {'ok': False, 'error': {'code': 'PERMISSION_DENIED', 'message': 'Denied', 'effect': 'none'}}
    for name in TOOLS:
        values.extend([
            {'case': name + '/error-output', 'surface': 'output', 'tool': name, 'value': failure},
            {'case': name + '/malformed-success', 'surface': 'output', 'tool': name,
             'value': {'ok': True, 'result': {'status': 'succeeded'}}},
        ])
    return values


def main():
    values = cases()
    # Python JSON materialization supplies finite IEEE numeric forms here. Raw
    # HTTP decoding (rounding/depth/surrogates) has its own later qualification.
    data = ''.join(json.dumps(case, ensure_ascii=True, allow_nan=False) + '\n' for case in values)
    process = subprocess.run(['cargo', 'run', '--locked', '--quiet', '--example', 'contract_check'],
                             cwd=ROOT, input=data, text=True, capture_output=True, timeout=180)
    if process.returncode:
        raise AssertionError('Native contract checker failed: ' + process.stderr[-4000:])
    actual = process.stdout.splitlines()
    if len(actual) != len(values):
        raise AssertionError(f'Expected {len(values)} decisions, got {len(actual)}')
    for case, decision in zip(values, actual):
        expected = 'true' if oracle(case) else 'false'
        if decision != expected:
            raise AssertionError(f"Contract mismatch: {case['case']}: {decision} != {expected}")
    print(f'Compiled contract comparison passed: {len(values)} cases across {len(TOOLS)} tools/config')


if __name__ == '__main__':
    main()
