#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  INVOKER_HOME="$(getent passwd "${SUDO_USER}" | cut -d: -f6)"
else
  INVOKER_HOME="$HOME"
fi

if [[ -z "${INVOKER_HOME}" ]]; then
  echo "[ERROR] No se pudo resolver el HOME del usuario invocador"
  exit 1
fi

QA_DIR="${INVOKER_HOME}/melo-deb-qa"
REPORTS_DIR="$QA_DIR/reports"
TS="$(date +%Y%m%d-%H%M%S)"
DEB_PATH="${1:-$QA_DIR/package/latest.deb}"
REPORT_FILE="$REPORTS_DIR/install-verify-$TS.txt"

mkdir -p "$REPORTS_DIR"

if [[ ! -f "$DEB_PATH" ]]; then
  echo "[ERROR] .deb no encontrado: $DEB_PATH"
  exit 1
fi

{
  echo "Install/Verify report"
  echo "Timestamp: $TS"
  echo "Deb path:  $DEB_PATH"
  echo ""

  echo "== Purge previous package =="
  sudo dpkg --purge melo || true
  echo ""

  echo "== Install package =="
  sudo dpkg -i "$DEB_PATH"
  sudo apt-get install -f -y
  echo ""

  echo "== Verify installation =="
  dpkg -s melo | grep -E '^(Package|Version|Status):'
  command -v melo
  echo ""

  echo "== Optional smoke checks =="
  echo "Run: melo --version (si aplica)"
  echo "Run: ls -l ~/.config/autostart/melo.desktop (si activas autostart)"
} | tee "$REPORT_FILE"

echo "[OK] Instalacion y verificacion completadas"
echo "  - Reporte: $REPORT_FILE"
