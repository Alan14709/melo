#!/usr/bin/env bash
# melo-wrapper.sh - Launcher robusto para Melo en Linux
# Maneja: AppImage (FUSE sin setuid), Wayland, X11, AMD, NVIDIA

MELO_BIN="$(dirname "$(readlink -f "$0")")/melo"

# Detectar si corremos desde AppImage (sandbox FUSE no soporta setuid)
IS_APPIMAGE=0
if [ -n "${APPIMAGE:-}" ] || echo "$0" | grep -q "\.mount_\|squashfs-root"; then
	IS_APPIMAGE=1
fi

# Detectar sesion
SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}"

# Flags base siempre presentes
FLAGS="--no-sandbox --disable-setuid-sandbox"

# Flags para Wayland
if [ "$SESSION_TYPE" = "wayland" ] && [ -n "$WAYLAND_DISPLAY" ]; then
	FLAGS="$FLAGS --ozone-platform=wayland --enable-features=WaylandWindowDecorations"
fi

# Flags GPU: detectar si hay problemas con AMD en Wayland
GPU_VENDOR=""
if command -v lspci >/dev/null 2>&1; then
	GPU_VENDOR=$(lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -oi "amd\|nvidia\|intel" | head -1 | tr '[:upper:]' '[:lower:]' || true)
fi

# AMD en Wayland puede necesitar --disable-gpu-sandbox
if [ "$GPU_VENDOR" = "amd" ] && [ "$SESSION_TYPE" = "wayland" ]; then
	FLAGS="$FLAGS --disable-gpu-sandbox"
fi

exec "$MELO_BIN" $FLAGS "$@"
