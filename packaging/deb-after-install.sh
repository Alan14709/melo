#!/bin/sh
set -e

update-alternatives --install /usr/bin/melo melo /opt/Melo/melo-wrapper 100

# Fix chrome-sandbox permissions for Electron DRM/sandbox support
SANDBOX_PATH="/opt/Melo/chrome-sandbox"
if [ -f "${SANDBOX_PATH}" ]; then
  chown root:root "${SANDBOX_PATH}"
  chmod 4755 "${SANDBOX_PATH}"
  echo "[Melo] chrome-sandbox configured: $(stat -c '%a %U' ${SANDBOX_PATH})"
else
  echo "[Melo] WARNING: chrome-sandbox not found at ${SANDBOX_PATH}"
fi
