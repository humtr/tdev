#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/src:$PWD/.tdev-deps${PYTHONPATH:+:$PYTHONPATH}"
case "${1:-}" in
  --no-start) exec python -m tdev.admin stage --root "${2:?absolute staging root required}" ;;
  --check) exec python -m tdev.admin check --root "${2:?staging root required}" ;;
  --rollback) exec python -m tdev.admin rollback --root "${2:?staging root required}" ;;
  *) printf '%s\n' 'Usage: install.sh --no-start|--check|--rollback ABSOLUTE_ROOT' >&2; exit 2 ;;
esac
