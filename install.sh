#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps"
# Bootstrap pinned controller dependencies only when the private bundle is absent.
if [ ! -d .tdev-deps/jsonschema ]; then
    python -m pip install --target .tdev-deps -r requirements.txt >&2
fi
exec python -m tdev.installer "$@"
