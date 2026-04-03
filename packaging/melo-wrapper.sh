#!/usr/bin/env bash
# melo-wrapper — Launcher robusto para Melo en Linux
# Soporta: .deb (X11/Wayland), AppImage (FUSE/Intel/AMD/NVIDIA)

# Detectar binario
if [ -n "${APPIMAGE:-}" ]; then
  APPDIR="$(dirname "${APPIMAGE}")"
  MELO_BIN="${APPDIR}/melo" 2>/dev/null || true
fi
if [ -z "${MELO_BIN:-}" ] || [ ! -f "${MELO_BIN}" ]; then
  if [ -f "/opt/Melo/melo" ]; then
    MELO_BIN="/opt/Melo/melo"
  else
    MELO_BIN="$(dirname "$(readlink -f "$0")")/melo"
  fi
fi

FLAGS=""

# Sandbox: verificar si chrome-sandbox es usable
SANDBOX_PATH=""
for candidate in "/opt/Melo/chrome-sandbox" "$(dirname "${MELO_BIN:-/opt/Melo/melo}")/chrome-sandbox"; do
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

# Detectar sesión
SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
WAYLAND_DISP="${WAYLAND_DISPLAY:-}"

# Wayland flags
if [ "$SESSION_TYPE" = "wayland" ] && [ -n "$WAYLAND_DISP" ]; then
  FLAGS="$FLAGS --ozone-platform=wayland --enable-features=WaylandWindowDecorations"
fi

# Detectar GPU vendor
GPU_VENDOR=""
if command -v lspci >/dev/null 2>&1; then
  GPU_VENDOR=$(lspci 2>/dev/null | grep -i "vga\|3d\|display" \
    | grep -oi "amd\|nvidia\|intel" | head -1 \
    | tr '[:upper:]' '[:lower:]' || true)
fi

# Intel: deshabilitar Vulkan y VA-API que crashean en Wayland
if [ "$GPU_VENDOR" = "intel" ]; then
  FLAGS="$FLAGS --disable-features=Vulkan,VaapiVideoDecoder,VaapiVideoEncoder"
  FLAGS="$FLAGS --disable-vulkan"
  FLAGS="$FLAGS --use-gl=egl"
  if [ "$SESSION_TYPE" = "wayland" ]; then
    FLAGS="$FLAGS --disable-gpu-sandbox"
  fi
fi

# AMD en Wayland: flag extra de sandbox
if [ "$GPU_VENDOR" = "amd" ] && [ "$SESSION_TYPE" = "wayland" ]; then
  FLAGS="$FLAGS --disable-gpu-sandbox"
fi

# AppImage: siempre deshabilitar GPU sandbox (FUSE no soporta setuid)
if [ -n "${APPIMAGE:-}" ]; then
  FLAGS="$FLAGS --disable-gpu-sandbox"
fi

exec "$MELO_BIN" $FLAGS "$@"
