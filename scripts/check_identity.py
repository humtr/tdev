"""Compare deterministic numeric/string identity cases through a compiled test executable."""
import hashlib
import json
from pathlib import Path
import random
import struct
import subprocess


def main():
    root = Path(__file__).resolve().parents[1]
    fixture = json.loads((root / 'tests/acceptance/identity.json').read_text())
    values = [case['value'] for case in fixture['cases']]
    expected = [case['canonical'] for case in fixture['cases']]
    rng = random.Random(20261002)
    for _ in range(10000):
        number = struct.unpack('>d', rng.getrandbits(64).to_bytes(8, 'big'))[0]
        try:
            text = json.dumps(number, allow_nan=False)
        except ValueError:
            continue
        values.append(number)
        expected.append(text)
    payload = '\n'.join(json.dumps(v, ensure_ascii=True, allow_nan=False) for v in values) + '\n'
    result = subprocess.run(['cargo', 'run', '--locked', '--quiet', '--example', 'identity_check'],
                            cwd=root, input=payload, text=True, capture_output=True, timeout=180, check=True)
    actual = result.stdout.splitlines()
    assert len(actual) == len(expected), (len(actual), len(expected))
    for index, (observed, canonical) in enumerate(zip(actual, expected)):
        assert observed == canonical, (index, observed, canonical)
    for case, observed in zip(fixture['cases'], actual):
        assert hashlib.sha256(observed.encode('ascii')).hexdigest() == case['sha256']
    print(f'Canonical identity comparison: {len(expected)} cases passed')


if __name__ == '__main__':
    main()
