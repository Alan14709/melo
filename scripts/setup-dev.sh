#!/bin/bash
# Setup de desarrollo para Melo
# Corrige permisos del sandbox helper de Electron

set -e

SANDBOX="node_modules/electron/dist/chrome-sandbox"

echo "[setup-dev] Verificando sandbox helper..."

if [ ! -f "$SANDBOX" ]; then
  echo "[setup-dev] ERROR: $SANDBOX no encontrado"
  echo "[setup-dev] Ejecuta: npm install"
  exit 1
fi

OWNER=$(stat -c '%u' "$SANDBOX")
MODE=$(stat -c '%a' "$SANDBOX")

if [ "$OWNER" = "0" ] && [ "$MODE" = "4755" ]; then
  echo "[setup-dev] OK Sandbox helper OK (root, 4755)"
  exit 0
fi

echo "[setup-dev] WARN Sandbox helper necesita permisos:"
echo "[setup-dev]    Owner: $OWNER (debe ser 0)"
echo "[setup-dev]    Mode:  $MODE (debe ser 4755)"
echo "[setup-dev] Aplicando permisos (requiere sudo)..."

sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"

echo "[setup-dev] OK Permisos corregidos"
