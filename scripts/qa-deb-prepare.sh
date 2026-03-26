#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-electron"
QA_DIR="$HOME/melo-deb-qa"
PKG_DIR="$QA_DIR/package"
BACKUP_DIR="$QA_DIR/backups"
REPORTS_DIR="$QA_DIR/reports"
LOGS_DIR="$QA_DIR/logs"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$PKG_DIR" "$BACKUP_DIR" "$REPORTS_DIR" "$LOGS_DIR"

LATEST_DEB="$(ls -1t "$DIST_DIR"/melo_*_amd64.deb 2>/dev/null | head -n 1 || true)"
if [[ -z "$LATEST_DEB" ]]; then
  echo "[ERROR] No se encontro .deb en $DIST_DIR"
  exit 1
fi

cp -f "$LATEST_DEB" "$PKG_DIR/"
cp -f "$LATEST_DEB" "$PKG_DIR/latest.deb"

pkill -f '/melo|Melo' || true

for d in "$HOME/.config/melo" "$HOME/.cache/melo" "$HOME/.config/melo-wrapper" "$HOME/.cache/melo-wrapper"; do
  if [[ -d "$d" ]]; then
    mv "$d" "$BACKUP_DIR/$(basename "$d")-$TS"
  fi
done

if [[ -f "$HOME/.config/autostart/melo.desktop" ]]; then
  mkdir -p "$BACKUP_DIR/autostart-$TS"
  mv "$HOME/.config/autostart/melo.desktop" "$BACKUP_DIR/autostart-$TS/melo.desktop"
fi

cat > "$REPORTS_DIR/prepare-$TS.txt" <<EOF
QA environment prepared
Timestamp: $TS
Project root: $ROOT_DIR
Deb source: $LATEST_DEB
Deb copied: $PKG_DIR/latest.deb
Backups dir: $BACKUP_DIR
EOF

echo "[OK] Entorno QA preparado"
echo "  - Deb listo: $PKG_DIR/latest.deb"
echo "  - Backups:   $BACKUP_DIR"
echo "  - Reporte:   $REPORTS_DIR/prepare-$TS.txt"
