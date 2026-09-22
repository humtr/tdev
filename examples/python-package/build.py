"""Project-owned recipe: install only selected wheels into a fresh artifact layout."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

source = Path(__file__).resolve().parent
output = source / 'dist'
output.mkdir()  # Never reuse a mutable venv/target directory.
subprocess.run([sys.executable, '-I', '-m', 'pip', '--isolated', 'install',
                '--disable-pip-version-check', '--no-index', '--no-deps', '--only-binary=:all:',
                '--require-hashes', '--no-compile', '--no-cache-dir',
                '--find-links', os.environ['TDEV_INPUT_DIR'], '--target', str(output / 'python'),
                '-r', str(source / 'requirements.lock')], check=True)
# pip-generated console scripts are not this layout's runtime interface. Use an
# artifact-relative launcher / metadata entrypoint, not a relocated venv shebang.
shutil.rmtree(output / 'python/bin', ignore_errors=True)
for name in ('launch.py', 'app.py'):
    shutil.copyfile(source / name, output / name)
(output / 'asset.json').write_text(json.dumps({'message': 'retained package'}, sort_keys=True) + '\n')
