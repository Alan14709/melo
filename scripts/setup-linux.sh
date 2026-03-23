#!/bin/bash
# Setup de permisos para Electron en Linux
SANDBOX="node_modules/electron/dist/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  echo "Configurando permisos del sandbox de Electron..."
  sudo chown root:root "$SANDBOX"
  sudo chmod 4755 "$SANDBOX"
  echo "Listo."
else
  echo "chrome-sandbox no encontrado, usando --no-sandbox"
fi
