#!/usr/bin/env bash
# melo-wrapper — Launcher robusto para Melo en Linux
# Soporta: .deb (X11/Wayland), AppImage (FUSE/Intel/AMD/NVIDIA)

# Detectar binario
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
SELF_PATH="$(readlink -f "$0")"
MELO_BIN=""

if [ -n "${APPDIR:-}" ] && [ -f "${APPDIR}/melo-bin" ]; then
  MELO_BIN="${APPDIR}/melo-bin"
elif [ -n "${APPDIR:-}" ] && [ -f "${APPDIR}/melo" ] && [ "$(readlink -f "${APPDIR}/melo")" != "$SELF_PATH" ]; then
  MELO_BIN="${APPDIR}/melo"
elif [ -n "${APPIMAGE:-}" ] && [ -f "${SCRIPT_DIR}/melo" ] && [ "$(readlink -f "${SCRIPT_DIR}/melo")" != "$SELF_PATH" ]; then
  # En AppImage extraido/montado, el wrapper suele ejecutarse desde el mismo directorio del binario.
  MELO_BIN="${SCRIPT_DIR}/melo"
elif [ -f "${SCRIPT_DIR}/melo-bin" ]; then
  # Layout recomendado de empaquetado Linux: launcher como melo y binario real como melo-bin.
  MELO_BIN="${SCRIPT_DIR}/melo-bin"
elif [ -f "${SCRIPT_DIR}/melo" ] && [ "$(readlink -f "${SCRIPT_DIR}/melo")" != "$SELF_PATH" ]; then
  # En linux-unpacked/instalaciones portables, usar el binario colocalizado primero.
  MELO_BIN="${SCRIPT_DIR}/melo"
elif [ -f "/opt/Melo/melo" ]; then
  MELO_BIN="/opt/Melo/melo"
else
  MELO_BIN="${SCRIPT_DIR}/melo"
fi

FLAGS=()

# Sandbox: verificar si chrome-sandbox es usable
SANDBOX_PATH=""
for candidate in "$(dirname "${MELO_BIN:-/opt/Melo/melo}")/chrome-sandbox" "${APPDIR:-}/chrome-sandbox" "/opt/Melo/chrome-sandbox"; do
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
  FLAGS+=(--no-sandbox --disable-setuid-sandbox)
  export MELO_SANDBOX_AUTO_DISABLED=1
fi

# Detectar sesión
SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
WAYLAND_DISP="${WAYLAND_DISPLAY:-}"

# Wayland flags
if [ "$SESSION_TYPE" = "wayland" ] && [ -n "$WAYLAND_DISP" ]; then
  FLAGS+=(--ozone-platform=wayland --enable-features=WaylandWindowDecorations)
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
  FLAGS+=(--disable-features=Vulkan,VaapiVideoDecoder,VaapiVideoEncoder)
  FLAGS+=(--disable-vulkan)
  FLAGS+=(--use-gl=egl)
  if [ "$SESSION_TYPE" = "wayland" ]; then
    FLAGS+=(--disable-gpu-sandbox)
  fi
fi

# AMD en Wayland: flag extra de sandbox
if [ "$GPU_VENDOR" = "amd" ] && [ "$SESSION_TYPE" = "wayland" ]; then
  FLAGS+=(--disable-gpu-sandbox)
fi

# AppImage: siempre deshabilitar GPU sandbox (FUSE no soporta setuid)
if [ -n "${APPIMAGE:-}" ]; then
  FLAGS+=(--disable-gpu-sandbox)
fi

exec "$MELO_BIN" "${FLAGS[@]}" "$@"
