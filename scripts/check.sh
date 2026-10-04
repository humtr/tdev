#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps${PYTHONPATH:+:$PYTHONPATH}"
cargo fmt --all -- --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
python scripts/check_identity.py
python scripts/check_contract.py
# Build and exercise the actual native HTTP process. Selection belongs only to
# the acceptance harness; product code has no runtime variant switch.
cargo build --locked
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_source.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_project.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_github.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_start.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_import.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_integration.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_cleanup.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'test_predecessor.py' -v
TDEV_ACCEPTANCE_COMMAND=$(python -c 'import json, os; print(json.dumps([os.path.abspath("target/debug/tdev"), "serve"]))') \
    python -m unittest discover -s tests/acceptance -t tests -p 'native_*.py' -v
# tests/acceptance is a package: this discovery includes its executable scenarios.
test -f tests/acceptance/__init__.py
python -m unittest discover -s tests -p 'test_*.py' -v
git diff --check
