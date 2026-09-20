#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps${PYTHONPATH:+:$PYTHONPATH}"
python -m unittest discover -s tests -p 'test_*.py' -v
git diff --check
