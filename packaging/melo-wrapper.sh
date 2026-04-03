#!/usr/bin/env bash
# melo-wrapper — Launcher robusto para Melo en Linux
# Soporta: .deb (X11/Wayland), AppImage (FUSE), NVIDIA, AMD, Intel

set -euo pipefail

# Detectar binario según contexto
if [ -n "${APPIMAGE:-}" ]; then
  MELO_BIN="$(dirname "$(readlink -f "${APPIMAGE}")")/melo" 2>/dev/null || MELO_BIN="/tmp/.mount_Melo*/melo"
elif [ -f "/opt/Melo/melo" ]; then
  MELO_BIN="/opt/Melo/melo"
else
  MELO_BIN="$(dirname "$(readlink -f "$0")")/melo"
fi

FLAGS=""

# Sandbox: solo desactivar si chrome-sandbox no es usable
SANDBOX_PATH=""
for candidate in "/opt/Melo/chrome-sandbox" "$(dirname "$MELO_BIN")/chrome-sandbox"; do
  if [ -f "$candidate" ]; then
    SANDBOX_PATH="$candidate"
    break
  fi
done

SANDBOX_USABLE=0
if [ -n "$SANDBOX_PATH" ]; then
  OWNER_UID=$(stat -c %u "$SANDBOX_PATH" 2>/dev/null || echo "1")
  HAS_SETUID=$([ -u "$SANDBOX_PATH" ] && echo "1" || echo "0")
  if [ "$OWNER_UID" = "0" ] && [ "$HAS_SETUID" = "1" ]; then
    SANDBOX_USABLE=1
  fi
fi

if [ "$SANDBOX_USABLE" = "0" ]; then
  FLAGS="$FLAGS --no-sandbox --disable-setuid-sandbox"
fi

# Detectar sesión de display
SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
WAYLAND_DISP="${WAYLAND_DISPLAY:-}"

# Wayland: usar ozone
if [ "$SESSION_TYPE" = "wayland" ] && [ -n "$WAYLAND_DISP" ]; then
  FLAGS="$FLAGS --ozone-platform=wayland --enable-features=WaylandWindowDecorations"
fi

# GPU vendor
GPU_VENDOR=""
if command -v lspci >/dev/null 2>&1; then
  GPU_VENDOR=$(lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -oi "amd\|nvidia\|intel" | head -1 | tr '[:upper:]' '[:lower:]' || true)
fi

# AMD en Wayland necesita flag extra
if [ "$GPU_VENDOR" = "amd" ] && [ "$SESSION_TYPE" = "wayland" ]; then
  FLAGS="$FLAGS --disable-gpu-sandbox"
fi

exec "$MELO_BIN" $FLAGS "$@"
