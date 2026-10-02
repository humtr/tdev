#!/data/data/com.termux/files/usr/bin/bash
# Keep the entry point in one parsed block before executing a piped download.
{
    set -eu
    if ! exec 3</dev/tty; then
        printf 'tdev: Run this installer in a Termux terminal.\n' >&2
        exit 1
    fi
    tdev_script=$(curl -fsSL --proto '=https' \
        https://raw.githubusercontent.com/humtr/tdev/install/termux-bootstrap/bootstrap.sh)
    exec bash -c "$tdev_script" -- --ref install/termux-bootstrap "$@" <&3 3<&-
}
