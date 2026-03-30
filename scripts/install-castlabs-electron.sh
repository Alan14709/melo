#!/usr/bin/env bash
set -euo pipefail

WIDEVINE_PATH="node_modules/electron/dist/libwidevinecdm.so"

# Versiones castLabs a intentar (método GitHub URL - igual que v1.5.1)
CASTLABS_GITHUB_VERSIONS=(
  "v40.7.0+wvcus"
  "v32.2.5+wvcus"
  "v28.2.10+wvcus"
)

log()  { echo "[castlabs] $1"; }
warn() { echo "[castlabs][warn] $1"; }
fail() { echo "[castlabs][error] $1" >&2; exit 1; }

set_output() {
  local key="$1" value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf "%s=%s\n" "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

set_env() {
  local key="$1" value="$2"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf "%s=%s\n" "$key" "$value" >> "$GITHUB_ENV"
  fi
}

castlabs_installed() {
  # Verificar que se instaló castLabs (contiene +wvcus en versión)
  if [[ -f node_modules/electron/package.json ]]; then
    grep -q '+wvcus' node_modules/electron/package.json 2>/dev/null || return 1
    # Verificar que el binario existe
    [[ -x node_modules/electron/dist/electron ]] && return 0
  fi
  return 1
}

clean_electron() {
  log "Limpiando node_modules/electron y cache..."
  rm -rf node_modules/electron
  rm -rf "${HOME}/.cache/electron" 2>/dev/null || true
}

try_github_version() {
  local tag="$1"
  local url="https://github.com/castlabs/electron-releases#${tag}"
  
  log "Intentando castLabs ${tag} via GitHub URL..."
  clean_electron
  
  npm pkg set "devDependencies.electron=${url}" >/dev/null
  
  if npm install 2>&1 | grep -E "added|up to date" >/dev/null; then
    if castlabs_installed; then
      local version
      version=$(node -e "process.stdout.write(require('./node_modules/electron/package.json').version)" 2>/dev/null || echo "$tag")
      log "✅ Widevine OK con castLabs ${tag} (electron ${version})"
      
      set_output "install_mode" "castlabs"
      set_output "selected_castlabs_version" "${tag}"
      set_output "selected_electron_version" "${tag}"
      set_output "selected_custom_dir" "${tag}"
      set_env "DEBUG_BUILD" "false"
      set_env "ELECTRON_WVCUS_VERSION" "${tag}"
      return 0
    else
      warn "Instaló pero no es castLabs (sin+wvcus) para ${tag}"
    fi
  else
    warn "npm install falló para ${tag}"
  fi
  return 1
}

debug_fallback() {
  warn "Todos los castLabs fallaron. Instalando Electron oficial para debug."
  clean_electron
  npm pkg set "devDependencies.electron=28.2.10" >/dev/null
  npm pkg delete build.electronVersion >/dev/null 2>/dev/null || true
  npm install 2>&1 | grep -E "added|up to date" >/dev/null || true
  set_output "install_mode" "debug"
  set_env "DEBUG_BUILD" "true"
  warn "DEBUG_BUILD=true — producción bloqueada"
}

main() {
  [[ -f package.json ]] || fail "package.json no encontrado"
  
  # Si ya está instalado castLabs, no hacer nada
  if castlabs_installed; then
    local version
    version=$(cat node_modules/electron/package.json | grep '"version"' | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    log "✅ castLabs ${version} ya presente — nada que hacer"
    set_output "install_mode" "castlabs"
    set_output "selected_electron_version" "${tag}"
    set_env "DEBUG_BUILD" "false"
    exit 0
  fi
  
  # Intentar cada versión en orden
  for tag in "${CASTLABS_GITHUB_VERSIONS[@]}"; do
    if try_github_version "$tag"; then
      log "✅ castLabs instalado: ${tag}"
      exit 0
    fi
  done
  
  debug_fallback
  exit 0
}

main "$@"
