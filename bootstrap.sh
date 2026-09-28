#!/data/data/com.termux/files/usr/bin/bash
# First-install entry point. Run with bash -c or from a file, preserving stdin for setup.
set -euo pipefail

repo=https://github.com/humtr/tdev.git
ref=tdev
source_dir="${HOME:?}/.local/share/tdev-source"
usage() {
    cat <<'EOF'
Usage: bash bootstrap.sh [--repo HTTPS_URL] [--ref BRANCH_OR_TAG]
                         [--source-dir ABSOLUTE_PATH] [-- INSTALLER_OPTIONS...]
Prepares Termux packages, a source checkout, dependencies and service-daemon;
then runs the existing interactive installer and installs the tdev command.
Existing matching clean checkouts are reused at their current commit, never reset/pulled.
Installer examples: -- --controller-only   or   -- --root /private/installation
EOF
}
fail() { printf 'tdev bootstrap: %s\n' "$*" >&2; exit 1; }
while (($#)); do
    case "$1" in
        --help|-h) usage; exit 0 ;;
        --repo|--ref|--source-dir)
            (($# >= 2)) || fail "Missing value for $1"
            case "$1" in
                --repo) repo=$2 ;; --ref) ref=$2 ;; --source-dir) source_dir=$2 ;;
            esac
            shift 2 ;;
        --) shift; break ;;
        *) fail "Unknown option: $1 (installer options follow --)" ;;
    esac
done
for option in "$@"; do
    case "$option" in
        --no-start|--check|--rollback|--recover|--uninstall|--takeover|--retire-legacy)
            fail 'Maintenance actions use install.sh or tdev directly, not first-install bootstrap' ;;
    esac
done
[[ $repo == https://* && $repo != *'@'* && $repo != *'?'* && $repo != *'#'* && $repo != *[[:space:]]* ]] || fail 'Use a credential-free HTTPS repository URL'
[[ -n $ref && $ref != -* && $ref != *[[:space:]]* ]] || fail 'Invalid branch/tag'
[[ $source_dir == /* && $source_dir != / && ! -L $source_dir ]] || fail 'Use an absolute, non-symlink source directory'
[[ -n ${PREFIX:-} && $PREFIX == /* && -x $PREFIX/bin/pkg ]] || fail 'Run inside Termux with its pkg package manager'
[[ -z ${SVDIR:-} || $SVDIR == "$PREFIX/var/service" ]] || fail 'Use the shared Termux PREFIX/var/service directory'
[[ ! -e $source_dir || -d $source_dir/.git ]] || fail "Source path already exists; preserved: $source_dir"

if [[ -f $PREFIX/var/service/tdev/.tdev-owner.json ]]; then
    printf 'Existing owned tdev service: preserving system packages; using prepared prerequisites.\n'
else
    printf 'Preparing Termux packages (Python, native dependencies, Go/compiler and runit)...\n'
    pkg update -y
    pkg install -y git python python-pip python-rpds-py clang golang make pkg-config termux-services
fi

stage=
cleanup() { [[ -z $stage ]] || rm -rf -- "$stage"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ ! -e $source_dir ]]; then
    mkdir -p -- "$(dirname -- "$source_dir")"
    stage=$(mktemp -d "$(dirname -- "$source_dir")/.tdev-clone.XXXXXXXX")
    git clone --depth 1 --single-branch --branch "$ref" -- "$repo" "$stage/source"
    [[ -f $stage/source/install.sh && -f $stage/source/src/tdev/bootstrap.py ]] || fail 'Selected revision has no supported tdev bootstrap'
    mv -T -n -- "$stage/source" "$source_dir"
    [[ ! -e $stage/source ]] || fail 'Source destination appeared during clone; preserved'
fi
cd -- "$source_dir"
[[ $(git rev-parse --show-toplevel) == "$(pwd -P)" ]] || fail 'Source path is not the repository root'
[[ $(git remote get-url origin) == "$repo" ]] || fail 'Existing checkout has a different origin; preserved'
[[ $(git rev-parse HEAD) == "$(git rev-parse --verify "$ref^{commit}")" ]] || fail 'Existing checkout differs from selected local branch/tag; preserved'
[[ -z $(git status --porcelain --untracked-files=normal) ]] || fail 'Existing checkout has local changes; preserved'
[[ -f install.sh && -f src/tdev/bootstrap.py ]] || fail 'Selected revision has no supported tdev bootstrap'
printf 'Installing from %s at %s\n' "$source_dir" "$(git rev-parse HEAD)"
export PYTHONPATH="$source_dir/src:$source_dir/.tdev-deps"
python -m tdev.bootstrap dependencies
python -m tdev.bootstrap services
bash install.sh "$@"
bash tdev link
bash tdev status
printf '\nInstallation finished. Run: tdev\nFirst project access: see %s/INSTALL.md\n' "$source_dir"
