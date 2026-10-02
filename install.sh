#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps"
# Validate the complete private dependency set; interrupted installs are retryable.
python -m tdev.bootstrap dependencies >&2
exec python -m tdev.installer "$@"
