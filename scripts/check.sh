#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps${PYTHONPATH:+:$PYTHONPATH}"
cargo fmt --all -- --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
python scripts/check_identity.py
# tests/acceptance is a package: this discovery includes its executable scenarios.
test -f tests/acceptance/__init__.py
python -m unittest discover -s tests -p 'test_*.py' -v
git diff --check
