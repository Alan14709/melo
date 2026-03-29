#!/usr/bin/env bash

set -euo pipefail

CASTLABS_MIRROR="https://github.com/castlabs/electron-releases/releases/download/"
CASTLABS_CANDIDATES=(
  "28.2.10+wvcus"
  "27.3.11+wvcus"
  "26.6.10+wvcus"
)
MAX_VERSIONS=3
INSTALL_RETRIES_PER_VERSION=3
RETRY_SLEEP_SECONDS=5
WIDEVINE_PATH="node_modules/electron/dist/libwidevinecdm.so"

log() {
  echo "[castlabs] $1"
}

warn() {
  echo "[castlabs][warn] $1"
}

fail() {
  echo "[castlabs][error] $1" >&2
  exit 1
}

set_output() {
  local key="$1"
  local value="$2"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf "%s=%s\n" "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

set_env() {
  local key="$1"
  local value="$2"

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf "%s=%s\n" "$key" "$value" >> "$GITHUB_ENV"
  fi
}

clean_attempt_state() {
  log "Cleaning state: node_modules, ~/.cache/electron, package-lock.json"
  rm -rf node_modules
  rm -rf "${HOME}/.cache/electron"
  rm -f package-lock.json
}

set_castlabs_env() {
  local castlabs_version="$1"
  local base_version="$2"
  local custom_dir

  custom_dir="v${castlabs_version}"

  export ELECTRON_MIRROR="$CASTLABS_MIRROR"
  export ELECTRON_CUSTOM_VERSION="$castlabs_version"
  export ELECTRON_CUSTOM_DIR="$custom_dir"
  export electron_use_remote_checksums="true"
}

unset_castlabs_env() {
  unset ELECTRON_MIRROR || true
  unset ELECTRON_CUSTOM_VERSION || true
  unset ELECTRON_CUSTOM_DIR || true
  unset electron_use_remote_checksums || true
}

has_castlabs_cached_artifact() {
  local castlabs_version="$1"
  find "${HOME}/.cache/electron" -type f -name "electron-v${castlabs_version}-linux-x64.zip" | grep -q .
}

install_log_reason() {
  local logfile="$1"

  if grep -Eqi "404|Response code 404|status code 404" "$logfile"; then
    echo "404"
    return 0
  fi

  if grep -Eqi "download|downloading|ECONNRESET|ETIMEDOUT|ENOTFOUND" "$logfile"; then
    echo "download"
    return 0
  fi

  echo "npm"
}

try_castlabs_version() {
  local castlabs_version="$1"
  local base_version="$2"
  local retry=1
  local install_log
  local reason

  while [[ "$retry" -le "$INSTALL_RETRIES_PER_VERSION" ]]; do
    log "Trying castLabs ${castlabs_version} (base ${base_version}) - install retry ${retry}/${INSTALL_RETRIES_PER_VERSION}"

    clean_attempt_state
    npm pkg set "devDependencies.electron=${base_version}" >/dev/null
    npm pkg set "build.electronVersion=${castlabs_version}" >/dev/null
    set_castlabs_env "$castlabs_version" "$base_version"

    install_log="/tmp/melo-castlabs-install-${base_version//./-}-${retry}.log"
    if npm install 2>&1 | tee "$install_log"; then
      if [[ -f "$WIDEVINE_PATH" ]]; then
        log "Widevine validation OK: $WIDEVINE_PATH"
        set_output "install_mode" "castlabs"
        set_output "selected_castlabs_version" "$castlabs_version"
        set_output "selected_electron_version" "$base_version"
        set_output "selected_custom_dir" "v${castlabs_version}"
        set_env "DEBUG_BUILD" "false"
        set_env "ELECTRON_WVCUS_VERSION" "$castlabs_version"
        set_env "ELECTRON_CUSTOM_VERSION" "$castlabs_version"
        set_env "ELECTRON_CUSTOM_DIR" "v${castlabs_version}"
        return 0
      fi

      if has_castlabs_cached_artifact "$castlabs_version"; then
        warn "Widevine file not found, but castLabs artifact was downloaded successfully"
        set_output "install_mode" "castlabs"
        set_output "selected_castlabs_version" "$castlabs_version"
        set_output "selected_electron_version" "$base_version"
        set_output "selected_custom_dir" "v${castlabs_version}"
        set_env "DEBUG_BUILD" "false"
        set_env "ELECTRON_WVCUS_VERSION" "$castlabs_version"
        set_env "ELECTRON_CUSTOM_VERSION" "$castlabs_version"
        set_env "ELECTRON_CUSTOM_DIR" "v${castlabs_version}"
        return 0
      fi

      warn "Widevine validation failed for ${castlabs_version}: missing $WIDEVINE_PATH"
      return 1
    fi

    reason="$(install_log_reason "$install_log")"
    warn "Install failed for ${castlabs_version} (reason: ${reason})"

    if [[ "$reason" == "404" ]] || [[ "$reason" == "download" ]]; then
      warn "Switching to next castLabs version immediately"
      return 1
    fi

    if [[ "$retry" -lt "$INSTALL_RETRIES_PER_VERSION" ]]; then
      log "Retrying ${castlabs_version} in ${RETRY_SLEEP_SECONDS}s"
      sleep "$RETRY_SLEEP_SECONDS"
    fi

    retry=$((retry + 1))
  done

  warn "Exhausted retries for castLabs ${castlabs_version}"
  return 1
}

debug_fallback_install() {
  local base_version

  warn "All castLabs versions failed. Falling back to official Electron for debug only."

  clean_attempt_state
  unset_castlabs_env

  base_version="${CASTLABS_CANDIDATES[0]%%+*}"
  npm pkg set "devDependencies.electron=${base_version}" >/dev/null
  npm pkg delete build.electronVersion >/dev/null || true

  if npm install; then
    set_output "install_mode" "debug"
    set_output "selected_castlabs_version" ""
    set_output "selected_electron_version" "$base_version"
    set_output "selected_custom_dir" ""
    set_env "DEBUG_BUILD" "true"
    set_env "ELECTRON_WVCUS_VERSION" ""
    set_env "ELECTRON_CUSTOM_VERSION" ""
    set_env "ELECTRON_CUSTOM_DIR" ""
    warn "Debug fallback installed with official Electron ${base_version}"
    return 0
  fi

  return 1
}

main() {
  local count
  local castlabs_version
  local base_version

  if [[ ! -f package.json ]]; then
    fail "package.json was not found in current directory"
  fi

  count="${#CASTLABS_CANDIDATES[@]}"
  if [[ "$count" -ne "$MAX_VERSIONS" ]]; then
    fail "Expected ${MAX_VERSIONS} castLabs versions but got ${count}"
  fi

  for castlabs_version in "${CASTLABS_CANDIDATES[@]}"; do
    base_version="${castlabs_version%%+*}"
    if [[ "$base_version" == 30.* ]]; then
      fail "Invalid castLabs base version ${base_version}: 30.x is forbidden"
    fi

    if try_castlabs_version "$castlabs_version" "$base_version"; then
      log "Selected castLabs version: ${castlabs_version}"
      exit 0
    fi
  done

  if debug_fallback_install; then
    exit 0
  fi

  fail "Unable to install dependencies with castLabs and official debug fallback"
}

main "$@"
