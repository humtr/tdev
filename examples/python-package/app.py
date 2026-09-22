"""Small qualification app; writes only to the runner's external data directory."""
import importlib.metadata
import json
import os
from pathlib import Path

import packaging
from packaging.version import Version

root = Path(__file__).resolve().parent
vendor = (root / 'python').resolve()
assert vendor in Path(packaging.__file__).resolve().parents
assert Version('2.0') > Version('1.9')
result = {'dependency': importlib.metadata.version('packaging'),
          'asset': json.loads((root / 'asset.json').read_text()), 'origin': str(vendor)}
(Path(os.environ['TDEV_DATA_DIR']) / 'result.json').write_text(json.dumps(result, sort_keys=True))
print(json.dumps(result, sort_keys=True), flush=True)
