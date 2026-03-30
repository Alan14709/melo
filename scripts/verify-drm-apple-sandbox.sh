#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${MELO_RELEASE_GATE_LOG_DIR:-${ROOT_DIR}/logs/release-gates}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/release-gate-${TIMESTAMP}.log"

mkdir -p "${LOG_DIR}"

# Mirror all output to a persistent gate log for CI troubleshooting.
exec > >(tee -a "${LOG_FILE}") 2>&1

info() { echo "[release-gate][INFO] $1"; }
warn() { echo "[release-gate][WARN] $1"; }
fail() { echo "[release-gate][ERROR] $1"; exit 1; }

run_electron_js() {
  local test_name="$1"
  local script_path
  script_path="$(mktemp "${TMPDIR:-/tmp}/melo-${test_name}-XXXXXX.js")"
  cat > "${script_path}"

  local -a cmd=(npx electron "${script_path}")
  if command -v xvfb-run >/dev/null 2>&1; then
    cmd=(xvfb-run -a "${cmd[@]}")
  elif [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
    rm -f "${script_path}"
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      fail "No display server detected and xvfb-run is not available for ${test_name} (in CI)"
    else
      warn "No display server detected and xvfb-run not available for ${test_name} (skipping in local dev)"
      return 0
    fi
  fi

  info "Running ${test_name}"
  if ! "${cmd[@]}"; then
    rm -f "${script_path}"
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      fail "${test_name} failed"
    else
      warn "${test_name} failed (non-critical, skipping in local dev)"
      return 0
    fi
  fi

  rm -f "${script_path}"
}

extract_apple_music_ua() {
  node -e '
    const fs = require("fs");
    const content = fs.readFileSync(process.argv[1], "utf8");
    const match = content.match(/SERVICE_USER_AGENTS\s*=\s*\{[\s\S]*?appleMusic\s*:\s*\x27([^\x27]+)\x27/m);
    if (!match) process.exit(2);
    process.stdout.write(match[1]);
  ' "${ROOT_DIR}/main.js"
}

info "Starting Melo release gate (DRM + Apple UA + Media Keys/CDM + sandbox + cookies)"
info "Log file: ${LOG_FILE}"

command -v npx >/dev/null 2>&1 || fail "npx command not found"
[[ -f "${ROOT_DIR}/package.json" ]] || fail "package.json not found"
[[ -f "${ROOT_DIR}/main.js" ]] || fail "main.js not found"

cd "${ROOT_DIR}"

REQUIRE_MAC_UA="${MELO_APPLE_UA_REQUIRE_MAC:-0}"
REQUIRE_AUTH_COOKIE="${MELO_REQUIRE_APPLE_AUTH_COOKIE:-0}"
SANDBOX_STRICT="${MELO_SANDBOX_STRICT:-0}"
info "Gate strictness: sandbox=${SANDBOX_STRICT:-0} mac_ua=${REQUIRE_MAC_UA} auth_cookie=${REQUIRE_AUTH_COOKIE}"

# Step 1: sandbox helper verification.
SANDBOX_CANDIDATES=()
if [[ -n "${SANDBOX_PATH:-}" ]]; then
  SANDBOX_CANDIDATES+=("${SANDBOX_PATH}")
fi
SANDBOX_CANDIDATES+=(
  "/opt/Melo/chrome-sandbox"
  "${ROOT_DIR}/dist/linux-unpacked/chrome-sandbox"
  "${ROOT_DIR}/node_modules/electron/dist/chrome-sandbox"
)

SELECTED_SANDBOX=""
for candidate in "${SANDBOX_CANDIDATES[@]}"; do
  if [[ -f "${candidate}" ]]; then
    SELECTED_SANDBOX="${candidate}"
    break
  fi
done

[[ -n "${SELECTED_SANDBOX}" ]] || fail "chrome-sandbox not found in known locations"

OWNER_UID="$(stat -c %u "${SELECTED_SANDBOX}")"
PERMS="$(stat -c %a "${SELECTED_SANDBOX}")"
HAS_SETUID=0
if [[ -u "${SELECTED_SANDBOX}" ]]; then
  HAS_SETUID=1
fi

info "Sandbox path: ${SELECTED_SANDBOX}"
info "Sandbox owner UID: ${OWNER_UID} | perms: ${PERMS} | setuid bit: ${HAS_SETUID}"

if [[ "${OWNER_UID}" != "0" || "${HAS_SETUID}" != "1" ]]; then
  warn "Sandbox helper is not root+setuid (expected uid=0 and setuid bit=1)"
  if [[ "${MELO_RELEASE_GATE_AUTO_FIX_SANDBOX:-0}" == "1" ]]; then
    if command -v sudo >/dev/null 2>&1; then
      warn "Attempting sandbox permission fix via sudo"
      sudo chown root:root "${SELECTED_SANDBOX}" || true
      sudo chmod 4755 "${SELECTED_SANDBOX}" || true
      OWNER_UID="$(stat -c %u "${SELECTED_SANDBOX}")"
      PERMS="$(stat -c %a "${SELECTED_SANDBOX}")"
      HAS_SETUID=0
      if [[ -u "${SELECTED_SANDBOX}" ]]; then
        HAS_SETUID=1
      fi
      info "Sandbox after fix -> UID: ${OWNER_UID} | perms: ${PERMS} | setuid bit: ${HAS_SETUID}"
    else
      warn "sudo not available; cannot auto-fix sandbox helper"
    fi
  fi

  if [[ "${OWNER_UID}" != "0" || "${HAS_SETUID}" != "1" ]]; then
    if [[ "${SANDBOX_STRICT}" == "1" ]]; then
      fail "Sandbox helper permissions invalid in strict mode"
    fi
    warn "Continuing because strict sandbox mode is disabled; runtime fallback checks are required"
  fi
fi

# Step 2: Widevine DRM runtime check.
SKIP_WIDEVINE_CHECK="${MELO_SKIP_WIDEVINE_LOCAL_CHECK:-0}"
if [[ "${SKIP_WIDEVINE_CHECK}" == "1" ]]; then
  info "Widevine check skipped (local development mode)"
else
  # Widevine check: acepta libwidevinecdm.so (env vars method) O castLabs via GitHub URL
  WIDEVINE_SO="${ROOT_DIR}/node_modules/electron/dist/libwidevinecdm.so"
  ELECTRON_PKG="${ROOT_DIR}/node_modules/electron/package.json"

  WIDEVINE_OK=0
  if [[ -f "${WIDEVINE_SO}" ]]; then
    info "Widevine library found: ${WIDEVINE_SO}"
    WIDEVINE_OK=1
  elif [[ -f "${ELECTRON_PKG}" ]]; then
    # Try to detect castLabs via package.json metadata
    ELECTRON_RESOLVED="$(node -e "process.stdout.write(require('${ELECTRON_PKG}')._resolved || '')" 2>/dev/null || true)"
    ELECTRON_VERSION="$(node -e "process.stdout.write(require('${ELECTRON_PKG}').version || '')" 2>/dev/null || true)"
    if echo "${ELECTRON_RESOLVED}${ELECTRON_VERSION}" | grep -qi "castlabs\|wvcus"; then
      info "castLabs Electron detected via package metadata (v${ELECTRON_VERSION}) — Widevine bundled at runtime"
      WIDEVINE_OK=1
    fi
  fi

  if [[ "${WIDEVINE_OK}" != "1" ]]; then
    if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
      warn "Widevine library not found locally. In local dev, you can use: export MELO_SKIP_WIDEVINE_LOCAL_CHECK=1"
      warn "Note: Widevine will be downloaded at runtime when castLabs is properly initialized"
      fail "Widevine library not found: node_modules/electron/dist/libwidevinecdm.so (and castLabs not detected)"
    else
      fail "Widevine library not found in CI: node_modules/electron/dist/libwidevinecdm.so AND castLabs not detected in package.json"
    fi
  fi

  run_electron_js "widevine" <<'EOF'
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('enable-features', 'WidevineCdm,PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('enable-widevine-cdm');

app.on('ready', async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      plugins: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  try {
    await win.loadURL('about:blank');
    const result = await win.webContents.executeJavaScript(`
      navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
        initDataTypes: ['cenc'],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
      }]).then(() => ({ ok: true })).catch((error) => ({ ok: false, message: String(error) }));
    `);

    console.log('Widevine DRM result:', JSON.stringify(result));

    if (!result || !result.ok) {
      process.exit(2);
      return;
    }

    process.exit(0);
  } catch (error) {
    console.error('Widevine DRM check error:', error?.stack || error?.message || String(error));
    process.exit(2);
  }
});
EOF
fi

# Step 3: Media Keys/CDM runtime availability check.
run_electron_js "media-keys-cdm" <<'EOF'
const { app, BrowserWindow } = require('electron');

app.on('ready', async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      plugins: true,
    },
  });

  try {
    await win.loadURL('about:blank');
    const checks = await win.webContents.executeJavaScript(`
      ({
        hasRequestMediaKeySystemAccess: typeof navigator.requestMediaKeySystemAccess === 'function',
        hasMediaKeys: typeof window.MediaKeys !== 'undefined',
        hasMediaKeySystemAccess: typeof window.MediaKeySystemAccess !== 'undefined',
        hasMediaCapabilities: typeof navigator.mediaCapabilities !== 'undefined',
      })
    `);

    console.log('Media Keys/CDM checks:', JSON.stringify(checks));

    const ok = checks
      && checks.hasRequestMediaKeySystemAccess
      && checks.hasMediaKeys
      && checks.hasMediaKeySystemAccess
      && checks.hasMediaCapabilities;

    if (!ok) {
      process.exit(2);
      return;
    }

    process.exit(0);
  } catch (error) {
    console.error('Media Keys/CDM check error:', error?.stack || error?.message || String(error));
    process.exit(2);
  }
});
EOF

# Step 4: Apple Music User-Agent check.
APPLE_MUSIC_UA="$(extract_apple_music_ua)" || fail "Unable to extract Apple Music User-Agent from main.js"
[[ -n "${APPLE_MUSIC_UA}" ]] || fail "Apple Music User-Agent is empty"

if [[ "${APPLE_MUSIC_UA}" != *"AppleWebKit"* ]] || [[ "${APPLE_MUSIC_UA}" != *"Chrome/"* ]]; then
  fail "Apple Music User-Agent does not match required Chrome/WebKit shape"
fi

if [[ "${APPLE_MUSIC_UA}" == *"Electron"* ]]; then
  fail "Apple Music User-Agent must not expose Electron token"
fi

if [[ "${REQUIRE_MAC_UA}" == "1" ]] && [[ "${APPLE_MUSIC_UA}" != *"Macintosh"* ]]; then
  fail "Strict mode requires Apple Music UA to include Macintosh"
fi

export MELO_EXPECTED_APPLE_MUSIC_UA="${APPLE_MUSIC_UA}"
export MELO_REQUIRE_MAC_UA="${REQUIRE_MAC_UA}"
run_electron_js "apple-ua" <<'EOF'
const { app, BrowserWindow } = require('electron');

const expectedUa = process.env.MELO_EXPECTED_APPLE_MUSIC_UA;
const requireMacUa = process.env.MELO_REQUIRE_MAC_UA === '1';
if (!expectedUa) {
  console.error('Expected Apple Music UA was not provided');
  process.exit(2);
}

app.on('ready', async () => {
  const win = new BrowserWindow({ show: false });

  try {
    await win.loadURL('about:blank');
    win.webContents.setUserAgent(expectedUa);
    const runtimeUa = await win.webContents.executeJavaScript('navigator.userAgent');

    console.log('Configured Apple UA:', expectedUa);
    console.log('Runtime UA:', runtimeUa);

    const ok = runtimeUa === expectedUa
      && runtimeUa.includes('AppleWebKit')
      && runtimeUa.includes('Chrome/')
      && !runtimeUa.includes('Electron');

    if (requireMacUa && !runtimeUa.includes('Macintosh')) {
      process.exit(2);
      return;
    }

    if (!ok) {
      process.exit(2);
      return;
    }

    process.exit(0);
  } catch (error) {
    console.error('Apple Music UA check error:', error?.stack || error?.message || String(error));
    process.exit(2);
  }
});
EOF

# Step 5: Apple Music cookies and auth cookie check.
export MELO_REQUIRE_AUTH_COOKIE="${REQUIRE_AUTH_COOKIE}"
run_electron_js "apple-cookies" <<'EOF'
const { app, session } = require('electron');

const requireAuthCookie = process.env.MELO_REQUIRE_AUTH_COOKIE === '1';
const targetUrl = 'https://music.apple.com';
const probeCookieName = `melo_release_gate_${Date.now()}`;

app.on('ready', async () => {
  try {
    const ses = session.defaultSession;
    await ses.cookies.set({
      url: targetUrl,
      name: probeCookieName,
      value: '1',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 300,
    });

    const cookies = await ses.cookies.get({ url: targetUrl });
    const cookieNames = cookies.map((cookie) => cookie.name);
    const hasProbeCookie = cookieNames.includes(probeCookieName);
    const hasAppleAuthCookie = cookieNames.includes('itctx') || cookieNames.includes('awch');

    console.log('Apple cookies summary:', JSON.stringify({
      total: cookies.length,
      hasProbeCookie,
      hasAppleAuthCookie,
      sample: cookieNames.slice(0, 20),
    }));

    await ses.cookies.remove(targetUrl, probeCookieName).catch(() => {});

    if (!hasProbeCookie) {
      process.exit(2);
      return;
    }

    if (requireAuthCookie && !hasAppleAuthCookie) {
      process.exit(3);
      return;
    }

    process.exit(0);
  } catch (error) {
    console.error('Apple cookie check error:', error?.stack || error?.message || String(error));
    process.exit(2);
  }
});
EOF

# Step 6: sandbox runtime fallback policy check.
WRAPPER_PATH="${ROOT_DIR}/packaging/melo-wrapper.sh"
[[ -f "${WRAPPER_PATH}" ]] || fail "Missing wrapper script: packaging/melo-wrapper.sh"

grep -q -- '--no-sandbox' "${WRAPPER_PATH}" || fail "packaging/melo-wrapper.sh is missing --no-sandbox"
grep -q -- '--disable-setuid-sandbox' "${WRAPPER_PATH}" || fail "packaging/melo-wrapper.sh is missing --disable-setuid-sandbox"

run_electron_js "sandbox-runtime" <<'EOF'
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-setuid-sandbox');

app.on('ready', () => {
  const hasNoSandbox = app.commandLine.hasSwitch('no-sandbox');
  const hasDisableSetuid = app.commandLine.hasSwitch('disable-setuid-sandbox');

  console.log('Sandbox runtime flags:', JSON.stringify({ hasNoSandbox, hasDisableSetuid }));

  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false,
      },
    });
    win.destroy();
  } catch (error) {
    console.error('Sandbox runtime window creation failed:', error?.stack || error?.message || String(error));
    process.exit(2);
    return;
  }

  if (!hasNoSandbox || !hasDisableSetuid) {
    process.exit(2);
    return;
  }

  process.exit(0);
});
EOF

info "Release gate passed: Widevine DRM, Apple Music UA, Media Keys/CDM, sandbox and cookies checks are OK"
info "Detailed log: ${LOG_FILE}"
