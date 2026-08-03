#!/usr/bin/env bash

set -euo pipefail

APP_ID="app.mognet.desktop"
INSTALL_APP="/Applications/Mognet.app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(git -C "${SCRIPT_DIR}/.." rev-parse --show-toplevel)"
TEMP_BASE="${TMPDIR:-/tmp}"
TEMP_BASE="${TEMP_BASE%/}"
DRY_RUN=false

log() {
  printf '[desktop-update] %s\n' "$*"
}

die() {
  printf '[desktop-update] error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

bundle_id() {
  /usr/bin/plutil -extract CFBundleIdentifier raw -o - "$1/Contents/Info.plist" 2>/dev/null
}

app_running() {
  [[ "$(/usr/bin/osascript -e "application id \"${APP_ID}\" is running" 2>/dev/null || true)" == "true" ]]
}

case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=true ;;
  *) die "usage: vp run update:desktop [--dry-run]" ;;
esac
[[ $# -le 1 ]] || die "usage: vp run update:desktop [--dry-run]"

[[ "$(uname -s)" == "Darwin" ]] || die "desktop updates are currently supported only on macOS"
[[ "$(uname -m)" == "arm64" ]] || die "desktop updates currently require Apple Silicon"
[[ -d "${INSTALL_APP}" && ! -L "${INSTALL_APP}" ]] || die "expected ${INSTALL_APP}"
[[ "$(bundle_id "${INSTALL_APP}")" == "${APP_ID}" ]] || die "${INSTALL_APP} is not a Mognet app bundle"
[[ -w "$(dirname "${INSTALL_APP}")" ]] || die "$(dirname "${INSTALL_APP}") is not writable"

for command in git vp hdiutil ditto osascript open plutil; do
  require_cmd "${command}"
done

if [[ "${DRY_RUN}" == "true" ]]; then
  commit="$(git -C "${REPO_DIR}" rev-parse --verify refs/remotes/origin/main^{commit})"
  log "would build origin/main at ${commit:0:12} in a disposable worktree"
  log "would replace ${INSTALL_APP}, relaunch it, and roll back if launch fails"
  exit 0
fi

log "fetching origin/main"
git -C "${REPO_DIR}" fetch --quiet origin main
commit="$(git -C "${REPO_DIR}" rev-parse --verify refs/remotes/origin/main^{commit})"

temp_root="$(mktemp -d "${TEMP_BASE}/mognet-update.XXXXXX")"
build_dir="${temp_root}/source"
mount_dir="${temp_root}/mount"
install_stage=""
backup_app=""
worktree_added=false
mounted=false

cleanup() {
  exit_code=$?
  trap - EXIT INT TERM
  set +e

  preserve_install_stage=false
  if [[ ${exit_code} -ne 0 && -d "${backup_app}" ]]; then
    log "restoring the previous app"
    if [[ -e "${INSTALL_APP}" ]]; then
      /bin/mv "${INSTALL_APP}" "${install_stage}/Mognet.failed.app" || preserve_install_stage=true
    fi
    if [[ ! -e "${INSTALL_APP}" ]]; then
      /bin/mv "${backup_app}" "${INSTALL_APP}" || preserve_install_stage=true
    fi
    [[ -d "${INSTALL_APP}" ]] && /usr/bin/open "${INSTALL_APP}" >/dev/null 2>&1
  fi

  if [[ "${mounted}" == "true" ]]; then
    /usr/bin/hdiutil detach "${mount_dir}" -quiet >/dev/null 2>&1
  fi
  if [[ "${worktree_added}" == "true" ]]; then
    git -C "${REPO_DIR}" worktree remove --force "${build_dir}" >/dev/null 2>&1
  fi
  if [[ "${temp_root}" == "${TEMP_BASE}"/mognet-update.* ]]; then
    /bin/rm -rf -- "${temp_root}"
  fi
  if [[ -n "${install_stage}" && "${install_stage}" == /Applications/.mognet-update.* ]]; then
    if [[ "${preserve_install_stage}" == "true" || ( ${exit_code} -ne 0 && -d "${backup_app}" ) ]]; then
      log "recovery files retained at ${install_stage}"
    else
      /bin/rm -rf -- "${install_stage}"
    fi
  fi

  exit "${exit_code}"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log "building ${commit:0:12}"
log "Mognet will restart after the build; run this command from a terminal outside Mognet"
worktree_added=true
git -C "${REPO_DIR}" worktree add --quiet --detach "${build_dir}" "${commit}"
(
  cd "${build_dir}"
  vp install --frozen-lockfile --prefer-offline
  env -u GITHUB_REPOSITORY -u MOGNET_DESKTOP_UPDATE_REPOSITORY \
    vp run dist:desktop:dmg:arm64
)

shopt -s nullglob
dmgs=("${build_dir}"/release/Mognet-*-arm64.dmg)
[[ ${#dmgs[@]} -eq 1 ]] || die "expected one ARM64 DMG, found ${#dmgs[@]}"

mkdir -p "${mount_dir}"
mounted=true
/usr/bin/hdiutil attach "${dmgs[0]}" -nobrowse -readonly -mountpoint "${mount_dir}" >/dev/null
apps=("${mount_dir}"/*.app)
[[ ${#apps[@]} -eq 1 ]] || die "expected one app bundle in ${dmgs[0]}"
[[ "$(bundle_id "${apps[0]}")" == "${APP_ID}" ]] || die "built artifact has the wrong bundle identifier"

install_stage="$(mktemp -d /Applications/.mognet-update.XXXXXX)"
staged_app="${install_stage}/Mognet.app"
backup_app="${install_stage}/Mognet.previous.app"
/usr/bin/ditto "${apps[0]}" "${staged_app}"
[[ "$(bundle_id "${staged_app}")" == "${APP_ID}" ]] || die "staged artifact failed validation"
/usr/bin/hdiutil detach "${mount_dir}" -quiet >/dev/null
mounted=false

if app_running; then
  log "quitting Mognet"
  /usr/bin/osascript -e "tell application id \"${APP_ID}\" to quit"
  for _ in {1..60}; do
    app_running || break
    sleep 0.5
  done
  app_running && die "Mognet did not quit; close it and run the command again"
fi

log "installing ${INSTALL_APP}"
/bin/mv "${INSTALL_APP}" "${backup_app}"
/bin/mv "${staged_app}" "${INSTALL_APP}"

/usr/bin/open "${INSTALL_APP}"
for _ in {1..40}; do
  if app_running; then
    sleep 2
    app_running && break
  fi
  sleep 0.25
done
app_running || die "the updated app did not launch"

log "updated Mognet to ${commit:0:12}"
